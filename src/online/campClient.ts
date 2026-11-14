import type { Outcome } from './api';
import type { Tag } from './protocol';
import {
  CAMP_INPUT_HZ, CAMP_TICK_HZ, decodeSnap, isMatchId, newMatchId, parseCampServer, parseTerms, stepBody, wrapAngle,
  type CampAction, type CampBody, type CampClientMessage, type CampEvent, type CampListing, type CampLobbyView, type CampMoneyStep, type CampPlayer,
  type CampResult, type CampRosterEntry, type CampServerMessage, type CampSnapshot, type CampTerms,
} from '../multiplayer/campProtocol';

/**
 * 1.0.1 Grand Camp: this device's side of a player-organized match (docs/release/GRAND-CAMP-RULES-1.0.1.md). What work package D2 (the phone's screens,
 * the match drawn and played in the world) builds on: it never opens the socket or reads the wire itself.
 *
 *   const camp = new CampClient({ key: () => deviceKey, profile: () => ({ name, look, app }), topUp: amount => online.fund({ id: online.newId(), amount }) });
 *   await CampClient.list(hub, deps)               the district's lobbies that take players (public, and the private ones I am invited to)
 *   await camp.create(terms)                       opens a new match: I am its organizer and take the first place      → { ok, match }
 *   await camp.open(match)                         connects to a match (its lobby shows in `state.lobby`; nothing is taken yet)
 *   await camp.join(team?) · leave() · team(t) · rename(t, name) · ready({ fund }) · unready() · cancel() · remove(tag) · invite(tags)
 *                                                  each resolves once the SERVER answered (Outcome: ok, or reason + a French sentence)
 *   camp.input(mx, mz, facing, action?, power?)    while playing, every frame: the stick in pitch space (length 0…1 of the run), the facing
 *                                                  (footballSim's yaw); an action ('pass' | 'shot' | 'dribble') is sent at once and never dropped
 *   camp.view(now?)                                the match to draw now: ball and players interpolated ~100 ms behind the server, my own body
 *                                                  predicted from my unanswered sticks (`me`), the phase, clock, score, who has the ball, the taker
 *   camp.state                                     see CampClientState: status, lobby (teams, my place, ready, terms, pool), roster, events (in the
 *                                                  server's order), result, and `money`: every money step of mine, pending → done | failed
 *   camp.onChange(fn) · camp.onEvent(fn)           every change / every new match event (sounds, toasts); each returns its unsubscribe
 *   camp.close()                                   closes the socket (the place is kept the return window; `leave()` gives it up)
 *
 * - The socket reconnects by itself with a back-off (0.5 s … 8 s) to the same match: the server gives the player back their place (before kick-off)
 *   or the pitch (after it, within 60 s). Requests the server did not answer are sent again with the same id (never applied twice).
 * - Money: nothing is shown as done before the server said so. « Prêt » is `hold` pending until the ledger held the fee (done) or refused it
 *   (failed, with the reason); « Pas prêt », leaving, a drop before kick-off: `release`; the end: `payout` or `refund`, only from the server's
 *   settlement (the `result` is sent after the ledger wrote it). A wall part: with `deps.topUp` (the game), the part of the fee Teranga Money does not
 *   cover is first brought in by the account's own top-up (reserved on the device, sent again after a reload: src/online/client.ts), then the fee is
 *   held from Teranga Money; without it (tools, checks), `fund` rides in the hold itself, atomic on the ledger as a send's top-up.
 */
export interface CampDeps {
  /** The private device key (the account's: `dakarrek.chat.key`); the server only ever sees its hash. */
  key: () => string;
  profile: () => { name: string; look: number; app?: string | null };
  /** Absolute or page-relative `/api/camp` (default: the page's origin). */
  endpoint?: string;
  /** The account's top-up (wallet → Teranga Money), used before a hold that Teranga Money does not cover. */
  topUp?: (amount: number) => Promise<Outcome>;
  WebSocketImpl?: typeof WebSocket;
  fetchImpl?: typeof fetch;
  now?: () => number;
}
export type CampStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
/** A money step of this player, as far as the server has said. */
export interface CampMoneyView { step: CampMoneyStep; state: 'pending' | 'done' | 'failed'; amount: number; op?: string; balance?: number; reason?: string; text?: string; why?: string; at: number }
export interface CampClientState {
  status: CampStatus;
  match: string | null;
  /** My tag (from the server's welcome). */
  me: Tag | null;
  lobby: CampLobbyView | null;
  /** At kick-off: pitch numbers to players; mine. */
  roster: CampRosterEntry[] | null; sid: number | null;
  /** The newest snapshot (decoded), the events so far in the server's order. */
  snap: CampSnapshot | null; events: CampEvent[];
  /** The end, once the ledger has written it (never before). */
  result: CampResult | null;
  money: CampMoneyView[];
  /** Why the server closed this socket for good. */
  bye: 'removed' | 'over' | 'replaced' | null;
}
export interface CampViewPlayer { sid: number; team: 0 | 1 | null; x: number; z: number; vx: number; vz: number; f: number }
export interface CampView {
  k: number; phase: CampSnapshot['phase']; clock: number; half: 1 | 2; score: [number, number];
  ball: CampSnapshot['ball']; players: CampViewPlayer[];
  /** My body, predicted (null: not on the pitch). */
  me: CampBody | null;
  own: number; ownTeam: -1 | 0 | 1; taker: number;
}

/** The sentence a refusal shows (French, short). */
export function campRefusalText(reason: string): string {
  return ({
    invalid: 'Le serveur a refusé cette demande.', exists: 'Ce match existe déjà.', unknown: 'Ce match n’existe plus.', full: 'Le match est complet.',
    private: 'Match privé : il faut l’invitation de l’organisateur.', removed: 'L’organisateur t’a retiré de ce match.', closed: 'Ce match est terminé ou annulé.',
    started: 'Le match a déjà commencé.', 'not-member': 'Tu ne fais pas partie de ce match.', 'team-full': 'Cette équipe est complète.',
    ready: 'Tu es prêt : passe « Pas prêt » d’abord.', 'no-team': 'Choisis une équipe d’abord.', 'not-org': 'Seul l’organisateur peut le faire.',
    busy: 'Ton droit d’entrée est déjà pris pour un autre match.', insufficient: 'Solde insuffisant : Teranga Money ne couvre pas le droit d’entrée.',
    'limit-fund': 'Limite de recharge du jour atteinte.', 'limit-op': 'Droit d’entrée trop élevé pour une seule opération.', amount: 'Montant invalide.',
    offline: 'Hors ligne : ce sera confirmé ou annulé tout seul, jamais compté deux fois.', 'rate-limited': 'Trop rapide : attends un instant.',
    timeout: 'Pas encore de réponse du serveur : ce sera confirmé ou annulé tout seul.', 'no-match': 'Aucun match ouvert.', solo: 'Grand Camp n’est pas disponible ici.',
  } as Record<string, string>)[reason] ?? 'Ce n’est pas possible maintenant.';
}

type Req = Exclude<CampClientMessage, { type: 'in' }>;
type Body<T extends Req['type']> = Omit<Extract<Req, { type: T }>, 'id' | 'type'>;
const BACKOFF = [500, 1000, 2000, 4000, 8000];
const REQUEST_MS = 20_000, PING_MS = 20_000, SILENT_MS = 12_000, SNAPS_KEPT = 40, EVENTS_KEPT = 600, MONEY_KEPT = 30, INTERP_TICKS = 2;

export class CampClient {
  readonly state: CampClientState = { status: 'idle', match: null, me: null, lobby: null, roster: null, sid: null, snap: null, events: [], result: null, money: [], bye: null };
  /** Bytes and frames received, by type (the checks measure the wire with it). */
  readonly wire: Record<string, { n: number; bytes: number }> = {};
  private ws: WebSocket | null = null;
  private gen = 0; private attempt = 0; private retryT: ReturnType<typeof setTimeout> | null = null; private pingT: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0; private wanted = false;
  private pending = new Map<string, { msg: Req; resolve: (o: Outcome<{ match?: string }>) => void; timer: ReturnType<typeof setTimeout> | null }>();
  private snaps: (CampSnapshot & { at: number })[] = [];
  private offset = Infinity;
  private seq = 0; private sent: { s: number; mx: number; mz: number; f: number }[] = [];
  private stick = { mx: 0, mz: 0, f: 0 }; private lastSend = 0; private act: { a: CampAction; p: number } | null = null;
  private listeners = new Set<() => void>(); private eventListeners = new Set<(e: CampEvent) => void>();
  private seenN = new Set<number>();
  private hz = CAMP_TICK_HZ;

  constructor(private d: CampDeps) {}
  private now() { return this.d.now ? this.d.now() : Date.now(); }

  // ================================================================== lobbies
  /** The lobbies of `hub` that take players (newest first). */
  static async list(hub: string, d: Pick<CampDeps, 'endpoint' | 'fetchImpl' | 'key'>): Promise<Outcome<{ matches: CampListing[] }>> {
    try {
      const u = new URL(`${endpointOf(d.endpoint)}/list`, baseHref());
      u.searchParams.set('hub', hub); u.searchParams.set('key', d.key());
      const r = await (d.fetchImpl ?? fetch)(u.toString());
      if (!r.ok) return no(r.status === 400 ? 'invalid' : 'offline');
      const j = await r.json() as { matches?: unknown };
      const matches = Array.isArray(j.matches) ? (j.matches as CampListing[]).filter(m => m && isMatchId(m.match) && !!parseTerms(m.terms)) : [];
      return { ok: true, matches };
    } catch { return no('offline'); }
  }
  /** Opens a new match with these terms (a fresh match id); I am its organizer. */
  async create(terms: CampTerms): Promise<Outcome<{ match: string }>> {
    const match = newMatchId();
    await this.open(match);
    const r = await this.request('create', { terms });
    return r.ok ? { ok: true, match } : r;
  }
  /** Connects to a match (resolves once the server welcomed this socket, or could not be reached for now: it keeps trying). */
  open(match: string): Promise<void> {
    if (!isMatchId(match)) return Promise.resolve();
    if (this.state.match !== match) this.reset(match);
    this.wanted = true;
    if (!this.ws) this.connect();
    return new Promise(resolve => {
      if (this.state.status === 'open') { resolve(); return; }
      const off = this.onChange(() => { if (this.state.status === 'open' || this.state.status === 'closed') { off(); resolve(); } });
      setTimeout(() => { off(); resolve(); }, 10_000);
    });
  }
  join(team?: 0 | 1) { return this.request('join', team === undefined ? {} : { team }); }
  team(team: 0 | 1) { return this.request('team', { team }); }
  rename(team: 0 | 1, name: string) { return this.request('rename', { team, name }); }
  cancel() { return this.request('cancel', {}); }
  remove(tag: Tag) { return this.request('remove', { tag }); }
  invite(tags: Tag[]) { return this.request('invite', { tags }); }
  /** Leaves: before kick-off the place and the fee (returned); after it, the pitch (the team's result still counts). */
  async leave(): Promise<Outcome> {
    const fee = this.state.lobby?.terms.fee ?? 0, mine = this.mySeat();
    const step = fee > 0 && mine && mine.hold !== 'none' && this.state.lobby?.state === 'lobby' ? this.moneyStep({ step: 'release', state: 'pending', amount: fee, why: 'leave' }) : null;
    const r = await this.request('leave', {});
    if (step) this.settleStep(step, r);
    return r;
  }
  /**
   * « Prêt »: the fee is held by the server (Teranga Money first). `fund`: the part Teranga Money does not cover, from the wallet — with `deps.topUp`
   * it is brought in first by the account's top-up; without, it rides in the hold.
   */
  async ready(o: { fund?: number } = {}): Promise<Outcome> {
    const fee = this.state.lobby?.terms.fee ?? 0;
    let fund = Math.max(0, Math.floor(o.fund ?? 0));
    const step = fee > 0 ? this.moneyStep({ step: 'hold', state: 'pending', amount: fee }) : null;
    if (step && fund > 0 && this.d.topUp) {
      const t = await this.d.topUp(fund);
      if (!t.ok) { this.settleStep(step, t); return t; }
      fund = 0;
    }
    const r = await this.request('ready', fund > 0 ? { fund } : {});
    if (step) this.settleStep(step, r);
    return r;
  }
  async unready(): Promise<Outcome> {
    const fee = this.state.lobby?.terms.fee ?? 0, mine = this.mySeat();
    const step = fee > 0 && mine && mine.hold !== 'none' ? this.moneyStep({ step: 'release', state: 'pending', amount: fee, why: 'unready' }) : null;
    const r = await this.request('unready', {});
    if (step) this.settleStep(step, r);
    return r;
  }

  // ================================================================== playing
  /** The stick now (pitch space, length ≤ 1), the facing; an action is sent at once and never dropped. Sent at CAMP_INPUT_HZ at most. */
  input(mx: number, mz: number, f: number, a?: CampAction, p = 0.6) {
    const m = Math.hypot(mx, mz), k = m > 1 ? 1 / m : 1;
    this.stick = { mx: mx * k, mz: mz * k, f: wrapAngle(f) };
    if (a) this.act = { a, p: Math.max(0, Math.min(1, p)) };
    const now = this.now();
    if (this.act || now - this.lastSend >= 1000 / CAMP_INPUT_HZ - 1) this.flushInput(now);
  }
  private flushInput(now: number) {
    if (!this.ws || this.state.status !== 'open' || this.state.sid === null || this.state.lobby?.state !== 'play') return;
    const s = ++this.seq, st = this.stick, a = this.act;
    const msg: Extract<CampClientMessage, { type: 'in' }> = { type: 'in', s, mx: round4(st.mx), mz: round4(st.mz), f: round4(st.f), ...(a ? { a: a.a, p: round4(a.p) } : {}) };
    if (this.send(msg)) { this.act = null; this.lastSend = now; this.sent.push({ s, mx: msg.mx, mz: msg.mz, f: msg.f }); if (this.sent.length > 120) this.sent.splice(0, this.sent.length - 120); }
  }
  /** The match to draw at `now`: interpolated INTERP_TICKS behind the newest server tick that time allows; my own body predicted. */
  view(now = this.now()): CampView | null {
    const S = this.snaps;
    if (!S.length) return null;
    const dt = 1000 / this.hz, want = (now - this.offset) / dt - INTERP_TICKS;
    // the two snapshots around the wanted tick (before the oldest: the oldest; past the newest: the newest, never extrapolated)
    let i = S.length - 1;
    while (i > 0 && S[i - 1].k > want) i--;
    const a = S[Math.max(0, i - 1)], b = want < S[0].k ? S[0] : S[i];
    const u = b.k === a.k ? 1 : Math.max(0, Math.min(1, (want - a.k) / (b.k - a.k)));
    const L = (x: number, y: number) => x + (y - x) * u;
    const teamOf = (sid: number) => this.state.roster?.find(r => r.sid === sid)?.team ?? null;
    const players: CampViewPlayer[] = b.players.map(q => {
      const p = a.players.find(o => o.sid === q.sid) ?? q;
      return { sid: q.sid, team: teamOf(q.sid), x: L(p.x, q.x), z: L(p.z, q.z), vx: L(p.vx, q.vx), vz: L(p.vz, q.vz), f: wrapAngle(p.f + wrapAngle(q.f - p.f) * u) };
    });
    const B = a.ball, C = b.ball;
    return {
      k: L(a.k, b.k), phase: b.phase, clock: L(a.clock, b.clock), half: b.half, score: b.score,
      ball: { x: L(B.x, C.x), z: L(B.z, C.z), h: L(B.h, C.h), vx: C.vx, vz: C.vz, vh: C.vh }, players,
      me: this.predict(), own: b.own, ownTeam: b.ownTeam, taker: b.taker,
    };
  }
  /** My body now: the server's newest position of it, then my sticks it has not applied yet, stepped as the server steps them. */
  predict(): CampBody | null {
    const s = this.state.snap, sid = this.state.sid;
    const me = s && sid !== null ? s.players.find(p => p.sid === sid) : null;
    if (!me) return null;
    const b: CampBody = { x: me.x, z: me.z, vx: me.vx, vz: me.vz, f: me.f };
    for (const i of this.sent) if (i.s > me.seq) stepBody(b, i.mx, i.mz, i.f, 1 / this.hz);
    return b;
  }

  // ================================================================== state
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onEvent(fn: (e: CampEvent) => void) { this.eventListeners.add(fn); return () => { this.eventListeners.delete(fn); }; }
  /** My place in the lobby (team, ready, the fee's state), or null. */
  mySeat(): CampPlayer | null { const l = this.state.lobby, me = this.state.me; return l && me ? l.players.find(p => p.tag === me) ?? null : null; }
  /** What the end gave me (null: no result yet, or nothing for me). */
  myPayout(): number | null { const r = this.state.result, me = this.state.me; return r && me ? r.payouts.find(p => p.tag === me)?.amount ?? 0 : null; }
  close() {
    this.wanted = false;
    if (this.retryT) { clearTimeout(this.retryT); this.retryT = null; }
    const ws = this.ws; this.ws = null; this.gen++;
    if (this.pingT) { clearInterval(this.pingT); this.pingT = null; }
    try { ws?.close(1000, 'Bye'); } catch { /* gone */ }
    for (const [, p] of this.pending) { if (p.timer) clearTimeout(p.timer); p.resolve(no('offline')); }
    this.pending.clear();
    this.set({ status: 'closed' });
  }
  private set(p: Partial<CampClientState>) { Object.assign(this.state, p); for (const fn of [...this.listeners]) { try { fn(); } catch { /* a listener's error is its own */ } } }
  private reset(match: string) {
    this.close();
    Object.assign(this.state, { status: 'idle', match, me: null, lobby: null, roster: null, sid: null, snap: null, events: [], result: null, money: [], bye: null } satisfies CampClientState);
    this.snaps = []; this.offset = Infinity; this.seq = 0; this.sent = []; this.seenN.clear();
  }

  // ================================================================== the socket
  private connect() {
    const match = this.state.match; if (!match) return;
    const u = new URL(endpointOf(this.d.endpoint), baseHref());
    u.protocol = u.protocol === 'https:' ? 'wss:' : u.protocol === 'http:' ? 'ws:' : u.protocol;
    const p = this.d.profile();
    u.searchParams.set('match', match); u.searchParams.set('key', this.d.key()); u.searchParams.set('name', p.name); u.searchParams.set('look', String(p.look));
    if (p.app) u.searchParams.set('app', p.app);
    const gen = ++this.gen, WS = this.d.WebSocketImpl ?? WebSocket;
    let ws: WebSocket;
    try { ws = new WS(u.toString()); } catch { this.retry(); return; }
    this.ws = ws;
    this.set({ status: this.attempt ? 'reconnecting' : 'connecting' });
    ws.addEventListener('message', e => { if (gen === this.gen) this.receive(e.data); });
    ws.addEventListener('close', () => { if (gen !== this.gen) return; this.ws = null; if (this.pingT) { clearInterval(this.pingT); this.pingT = null; } this.retry(); });
    ws.addEventListener('error', () => { /* the close follows */ });
  }
  /** Again after a back-off, unless the player closed it or the server ended it for good. */
  private retry() {
    if (!this.wanted || this.state.bye || this.retryT) { if (!this.wanted || this.state.bye) this.set({ status: 'closed' }); return; }
    const ms = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)] * (0.8 + Math.random() * 0.4);
    this.attempt++;
    this.set({ status: 'reconnecting' });
    this.retryT = setTimeout(() => { this.retryT = null; if (this.wanted && !this.ws) this.connect(); }, ms);
  }
  private send(m: CampClientMessage): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(m)); return true; } catch { return false; }
  }
  private request<T extends Req['type']>(type: T, body: Body<T>): Promise<Outcome<{ match?: string }>> {
    if (!this.state.match) return Promise.resolve(no('no-match'));
    const id = newId(), msg = { type, id, ...body } as unknown as Req;
    return new Promise(resolve => {
      const timer = setTimeout(() => { const p = this.pending.get(id); if (p) { p.timer = null; p.resolve = () => {}; resolve(no('timeout')); } }, REQUEST_MS);
      this.pending.set(id, { msg, resolve, timer });
      if (this.state.status === 'open') this.send(msg);
    });
  }
  private receive(raw: unknown) {
    this.lastHeard = this.now();
    if (typeof raw !== 'string' || raw === 'pong') return;
    let v: unknown; try { v = JSON.parse(raw); } catch { return; }
    const m = parseCampServer(v);
    if (!m) return;
    const w = this.wire[m.type] ?? (this.wire[m.type] = { n: 0, bytes: 0 }); w.n++; w.bytes += raw.length;
    switch (m.type) {
      case 'welcome': return this.welcome(m);
      case 'lobby': return this.lobbyNow(m.lobby);
      case 'ack': {
        const p = this.pending.get(m.id); if (!p) return;
        this.pending.delete(m.id); if (p.timer) clearTimeout(p.timer);
        p.resolve(m.ok ? { ok: true, ...(m.match ? { match: m.match } : {}) } : no(m.reason));
        return;
      }
      case 'money': {
        const step = this.state.money.slice().reverse().find(x => x.step === m.step && x.state === 'pending' && (!x.op || x.op === m.op));
        if (step) Object.assign(step, { state: 'done', op: m.op, amount: m.amount, ...(m.balance !== undefined ? { balance: m.balance } : {}), ...(m.why ? { why: m.why } : {}) });
        else if (!this.state.money.some(x => x.op === m.op && x.step === m.step)) this.moneyStep({ step: m.step, state: 'done', op: m.op, amount: m.amount, ...(m.balance !== undefined ? { balance: m.balance } : {}), ...(m.why ? { why: m.why } : {}) });
        return this.set({});
      }
      case 'start': {
        const me = this.state.me, mine = m.roster.find(r => r.tag === me);
        return this.set({ roster: m.roster, sid: mine ? mine.sid : null });
      }
      case 's': {
        const s = { ...decodeSnap(m), at: this.now() };
        const S = this.snaps;
        if (S.length && s.k <= S[S.length - 1].k) return;
        S.push(s); if (S.length > SNAPS_KEPT) S.splice(0, S.length - SNAPS_KEPT);
        // the server's tick ↔ this device's clock: the quickest arrival of the frames kept (the interpolation delay absorbs the rest)
        this.offset = Infinity; for (const x of S) this.offset = Math.min(this.offset, x.at - (x.k * 1000) / this.hz);
        const me = this.state.sid !== null ? s.players.find(p => p.sid === this.state.sid) : null;
        if (me) { const i = this.sent.findIndex(x => x.s > me.seq); this.sent.splice(0, i < 0 ? this.sent.length : i); }
        return this.set({ snap: s });
      }
      case 'ev': {
        const fresh = m.e.filter(e => !this.seenN.has(e.n));
        if (!fresh.length) return;
        for (const e of fresh) this.seenN.add(e.n);
        const all = [...this.state.events, ...fresh].sort((a, b) => a.n - b.n);
        if (all.length > EVENTS_KEPT) all.splice(0, all.length - EVENTS_KEPT);
        this.set({ events: all });
        for (const e of fresh) for (const fn of [...this.eventListeners]) { try { fn(e); } catch { /* its own */ } }
        return;
      }
      case 'result': return this.resultNow(m.result);
      case 'bye': { this.wanted = false; this.set({ bye: m.reason }); return; }
    }
  }
  private welcome(m: Extract<CampServerMessage, { type: 'welcome' }>) {
    this.attempt = 0; this.hz = m.hz || CAMP_TICK_HZ;
    this.offset = Infinity;                                              // a new path: the clock's offset is measured again
    if (this.pingT) clearInterval(this.pingT);
    this.pingT = setInterval(() => {
      const ws = this.ws; if (!ws) return;
      if (this.now() - this.lastHeard > SILENT_MS + PING_MS) { try { ws.close(4002, 'Silent'); } catch { /* gone */ } return; }
      try { ws.send('ping'); } catch { /* the close follows */ }
    }, PING_MS);
    this.set({ status: 'open', me: m.you });
    if (m.lobby) this.lobbyNow(m.lobby, true);
    for (const [, p] of this.pending) this.send(p.msg);                 // what was not answered goes again, with the same id
  }
  /** The lobby as the server has it; `back`: in the welcome of a reconnect (what changed meanwhile was not told to this device). */
  private lobbyNow(l: CampLobbyView, back = false) {
    const me = this.state.me, was = this.mySeat();
    const now = l.players.find(p => p.tag === me) ?? null;
    // the fee came back while this device was away (the connection lost before kick-off): said as done, from the server's lobby
    if (back && was && was.hold === 'held' && now && now.hold === 'none' && l.state === 'lobby') this.moneyStep({ step: 'release', state: 'done', amount: l.terms.fee, why: 'drop' });
    this.set({ lobby: l, sid: now ? now.sid : this.state.sid });
    if (l.result && !this.state.result) this.resultNow(l.result);
  }
  private resultNow(r: CampResult) {
    if (this.state.result) return;
    const me = this.state.me, mine = me ? r.payouts.find(p => p.tag === me) : undefined;
    if (r.money === 'settled' && mine) {
      const step: CampMoneyStep = r.end === 'win' ? 'payout' : 'refund';
      if (!this.state.money.some(x => x.step === step && x.state === 'done')) this.moneyStep({ step, state: 'done', amount: mine.amount });
    }
    this.set({ result: r });
  }
  private moneyStep(m: Omit<CampMoneyView, 'at'>): CampMoneyView {
    const v: CampMoneyView = { ...m, at: this.now() };
    this.state.money.push(v);
    if (this.state.money.length > MONEY_KEPT) this.state.money.splice(0, this.state.money.length - MONEY_KEPT);
    this.set({});
    return v;
  }
  /** A pending step and its request's answer: failed with the reason, or done (when no `money` frame said more, nothing was held: 0 F). */
  private settleStep(step: CampMoneyView, r: Outcome) {
    if (step.state !== 'pending') return;
    if (!r.ok) {
      if (r.reason === 'offline' || r.reason === 'timeout') return;       // undecided: the server's answer comes with the next connection
      Object.assign(step, { state: 'failed', reason: r.reason, text: r.text });
    } else if (step.step === 'release' || (step.step === 'hold' && !step.op)) Object.assign(step, { state: 'done', ...(step.step === 'release' && !step.op ? { amount: 0 } : {}) });
    this.set({});
  }
}

const no = (reason: string): { ok: false; reason: string; text: string } => ({ ok: false, reason, text: campRefusalText(reason) });
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return [...Array(4)].map(() => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('-');
}
const endpointOf = (e?: string) => (e ?? '/api/camp').replace(/\/+$/, '');
const baseHref = () => (typeof location !== 'undefined' ? location.href : 'http://localhost/');
