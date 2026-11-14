import { DurableObject } from 'cloudflare:workers';
import { appearanceCode, lookIndex, nickname } from '../src/multiplayer/protocol';
import {
  CAMP_FEATURE, CAMP_MATCH, CAMP_MAX_FRAME, CAMP_RATE, CAMP_TICK_HZ, CAMP_VERSION, campRate, encodeSnap, isMatchId, parseCampClient,
  type CampClientMessage, type CampEnd, type CampListing, type CampMoneyStep, type CampRateWindow, type CampRefusal, type CampResult, type CampServerMessage,
} from '../src/multiplayer/campProtocol';
import { CampLobby, type CampLobbyData, type CampOutcome, type CampProfile } from '../src/multiplayer/campRules';
import { CampMatch } from '../src/multiplayer/campMatch';
import { isTag, type Tag } from '../src/online/protocol';
import type { CampHoldResult, CampHoldRow, CampLedgerRefusal, CampPoolRow, CampSettlement } from '../src/online/campLedger';
import type { HubId } from '../src/core/types';
import type { Social } from './social';

/**
 * 1.0.1 Grand Camp (docs/release/GRAND-CAMP-RULES-1.0.1.md): the authority of player-organized matches. ONE class, two roles chosen by the object's
 * name (one binding, as Social):
 *
 *   – `camp:<match>`: one match. Its players' sockets (`/api/camp?match=…`, the tag from the device key as `/api/me` does), its lobby
 *     (src/multiplayer/campRules.ts, saved after every change), and once started the match itself (src/multiplayer/campMatch.ts) stepped at
 *     CAMP_TICK_HZ with a snapshot to every player each tick. Every request is answered once by an `ack`; requests that change the lobby run one after
 *     the other (`enqueue`), so a fee's hold and a cancel can never interleave here. The money is the ledger's (server/social.ts camp*): the fee held
 *     at « Prêt », returned when the lobby rules say so, the pool settled once at the end; the players see a result only after the ledger wrote it.
 *   – `list:<hub>`: the public lobbies of a district (and the private ones a player is invited to): `GET /api/camp/list`.
 *
 * Why 20 Hz: the sim plans the ball on a 20 Hz path already (footballSim PATH_DT), a pass (≤ 16 m/s) moves less in a tick than a player's reach, and a
 * snapshot every 50 ms with ~100 ms of interpolation is the usual budget for a phone on a mobile network; 30 Hz would cost half as much again in CPU
 * and bandwidth for no touch the sim would decide differently. A tick of a 5-a-side costs about 1 ms (tests/campMatch.test.ts), 7 a side less than 2.
 *
 * Kept on restart: the lobby (from storage). Not kept: a running match (the sim lives in memory). A match object that wakes with a match it no longer
 * runs is a match the server had to stop: every fee is returned (the owner's rule), from the alarm that watches every match.
 */
export interface CampEnv {
  CAMPS: DurableObjectNamespace<GrandCamp>;
  SOCIAL: DurableObjectNamespace<Social>;
  /**
   * Checks only (`wrangler dev --var CAMP_TEST_CLOCK:20`, scripts/check-grand-camp.mjs): the match clock in seconds, so a draw at full time can be
   * checked quickly. Never set in production (wrangler.jsonc has no such variable).
   */
  CAMP_TEST_CLOCK?: string;
}
interface Attach { tag: Tag; name: string; look: number; app?: string }
type Request_ = Exclude<CampClientMessage, { type: 'in' }>;
type Ack = Extract<CampServerMessage, { type: 'ack' }>;
interface ListRow { e: CampListing; invited: Tag[]; at: number }

/** A finished match's object keeps its lobby and result this long (a late reconnect still reads the result), then forgets them. */
const KEEP_MS = 24 * 3_600_000;
/** The watchdog's period while a match runs, and how soon a settlement the ledger did not answer is tried again (ms). */
const WATCH_MS = 30_000, RETRY_MS = 5_000;
const ACKS_KEPT = 400, LISTED_MAX = 30;

export class GrandCamp extends DurableObject<CampEnv> {
  private match: string | null = null;
  private lobby: CampLobby | null = null;
  private game: CampMatch | null = null;
  private outcome: CampOutcome | null = null;
  private interrupted = false; private ending = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private acc = 0; private last = 0; private lastDue = 0; private lastArm = 0;
  private queue: Promise<void> = Promise.resolve();
  private listQ: Promise<void> = Promise.resolve();
  private acks = new Map<string, Ack>();
  private rates = new WeakMap<WebSocket, { inp: CampRateWindow; req: CampRateWindow }>();
  /** What this match sent and refused (logged at the end: the measured snapshot rate and size). */
  private meter = { ticks: 0, snaps: 0, snapBytes: 0, events: 0, inputs: 0, dropped: 0, invalid: 0 };

  constructor(ctx: DurableObjectState, env: CampEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      const [match, data, outcome] = await Promise.all([ctx.storage.get<string>('match'), ctx.storage.get<CampLobbyData>('camp'), ctx.storage.get<CampOutcome>('settle')]);
      this.match = match ?? null;
      if (data) { this.lobby = new CampLobby(data); if (data.state === 'play') this.interrupted = true; }
      this.outcome = outcome ?? null;
      if (this.interrupted || this.outcome) await ctx.storage.setAlarm(Date.now() + 50);
    });
  }
  private ledger() { return this.env.SOCIAL.getByName('ledger'); }

  // ================================================================== sockets
  /** A player's socket, from the Worker (`/api/camp`), with the tag it derived from the device key and the match id. */
  async fetch(request: Request): Promise<Response> {
    const tag = request.headers.get('X-Dakar-Tag') ?? '', match = request.headers.get('X-Camp-Match') ?? '';
    if (!isTag(tag) || !isMatchId(match) || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Invalid match request', { status: 400 });
    if (this.match && this.match !== match) return new Response('Invalid match request', { status: 400 });
    if (!this.match) { this.match = match; await this.ctx.storage.put('match', match); }
    const url = new URL(request.url), a: Attach = { tag, name: nickname(url.searchParams.get('name')), look: lookIndex(url.searchParams.get('look')) };
    const app = appearanceCode(url.searchParams.get('app')); if (app) a.app = app;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [tag]);
    server.serializeAttachment(a);
    for (const old of this.ctx.getWebSockets(tag)) if (old !== server) { this.send(old, { type: 'bye', reason: 'replaced' }); try { old.close(4000, 'Replaced'); } catch { /* gone */ } }
    this.send(server, { type: 'welcome', feature: CAMP_FEATURE, v: CAMP_VERSION, match, you: tag, time: Date.now(), hz: CAMP_TICK_HZ, lobby: this.visible(tag) ? this.lobby!.view() : null });
    this.later(() => this.arrived(server, tag));
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = ws.deserializeAttachment() as Attach | null;
    if (!a) { ws.close(1011, 'Session lost'); return; }
    if (typeof message !== 'string' || message.length > CAMP_MAX_FRAME) { ws.close(1009, 'Frame too large'); return; }
    let data: unknown; try { data = JSON.parse(message); } catch { this.meter.invalid++; return; }
    const p = parseCampClient(data), now = Date.now();
    let w = this.rates.get(ws); if (!w) { w = { inp: { at: now, n: 0 }, req: { at: now, n: 0 } }; this.rates.set(ws, w); }
    if (p.ok && p.msg.type === 'in') {
      const r = campRate(w.inp, now, CAMP_RATE.inputs, CAMP_RATE.inputAbuse);
      if (r === 'abuse') { ws.close(1008, 'Too many inputs'); return; }
      if (r === 'drop') { this.meter.dropped++; return; }
      this.input(a.tag, p.msg); return;
    }
    const r = campRate(w.req, now, CAMP_RATE.requests, CAMP_RATE.requestAbuse);
    if (r === 'abuse') { ws.close(1008, 'Too many messages'); return; }
    if (!p.ok) { this.meter.invalid++; if (p.id) this.send(ws, { type: 'ack', id: p.id, ok: false, reason: 'invalid' }); return; }
    const m = p.msg as Request_, key = `${a.tag}:${m.id}`;
    if (r === 'drop') { this.send(ws, { type: 'ack', id: m.id, ok: false, reason: 'rate-limited' }); return; }
    const done = this.acks.get(key);
    if (done) { this.send(ws, { ...done, duplicate: true } as Ack); return; }
    try {
      await this.enqueue(async () => {
        const again = this.acks.get(key);
        const reply: Ack = again ? { ...again, duplicate: true } as Ack : await this.request(a, m);
        if (!again && (reply.ok || reply.reason !== 'offline')) { this.acks.set(key, reply); if (this.acks.size > ACKS_KEPT) this.acks.delete(this.acks.keys().next().value!); }
        this.send(ws, reply);
      });
    } catch (e) {
      console.log(JSON.stringify({ event: 'camp-error', type: m.type, error: String(e) }));
      this.send(ws, { type: 'ack', id: m.id, ok: false, reason: 'offline' });   // nothing decided here: the same id may be sent again
    }
  }
  async webSocketClose(ws: WebSocket): Promise<void> { await this.left(ws); }
  async webSocketError(ws: WebSocket): Promise<void> { await this.left(ws); }
  /** A socket closed: when it was the player's last one, the lobby rules say what it means (the fee returned before kick-off, off the pitch after). */
  private async left(ws: WebSocket) {
    const tag = this.ctx.getTags(ws)[0]; if (!tag) return;
    await this.enqueue(async () => {
      if (this.ctx.getWebSockets(tag).some(o => o !== ws && o.readyState === WebSocket.OPEN)) return;
      const l = this.lobby, seat = l?.seat(tag); if (!l || !seat || !seat.on || seat.gone) return;
      const r = l.disconnect(tag, Date.now());
      if (r.release) await this.release(tag, 'drop');
      if (r.drop && this.game) this.game.drop(seat.sid);
      await this.changed();
    });
  }
  /** A socket opened: a member is back (before kick-off: their place; after: the pitch, in the window). */
  private async arrived(ws: WebSocket, tag: Tag) {
    const l = this.lobby, seat = l?.seat(tag); if (!l || !seat || seat.gone) return;
    const was = seat.on, r = l.reconnect(tag);
    if (r.back && this.game) this.game.back(seat.sid);
    if (l.state === 'play' && this.game) this.sendStart(ws);
    if (!was) await this.changed();
  }
  private input(tag: Tag, m: Extract<CampClientMessage, { type: 'in' }>) {
    const g = this.game, seat = this.lobby?.seat(tag);
    if (!g || !seat || !seat.on || seat.gone) return;
    g.input(seat.sid, m.s, m.mx, m.mz, m.f, m.a, m.p);
    this.meter.inputs++;
  }

  // ================================================================== requests
  private async request(a: Attach, m: Request_): Promise<Ack> {
    const yes = (extra: Partial<Extract<Ack, { ok: true }>> = {}): Ack => ({ type: 'ack', id: m.id, ok: true, ...extra });
    const no = (reason: CampRefusal): Ack => ({ type: 'ack', id: m.id, ok: false, reason });
    const now = Date.now(), tag = a.tag, profile: CampProfile = { name: a.name, look: a.look, ...(a.app ? { app: a.app } : {}) };
    if (m.type === 'create') {
      if (this.lobby) return this.lobby.data.org === tag && this.lobby.state === 'lobby' ? yes({ duplicate: true, match: this.match! }) : no('exists');
      this.lobby = CampLobby.open(this.match!, tag, profile, m.terms, now);
      await this.changed();
      return yes({ match: this.match! });
    }
    const l = this.lobby;
    if (!l) return no('unknown');
    switch (m.type) {
      case 'join': {
        const r = l.join(tag, profile, m.team, now);
        if (!r.ok) return no(r.reason);
        await this.changed();
        return yes(r.again ? { duplicate: true } : {});
      }
      case 'leave': {
        const seat = l.seat(tag), r = l.leave(tag);
        if (!r.ok) return no(r.reason);
        if (r.gone && seat && this.game) this.game.gone(seat.sid);
        if (r.release) await this.release(tag, 'leave');
        if (r.empty) { await this.finish('empty'); return yes(); }
        await this.changed();
        return yes();
      }
      case 'team': { const r = l.setTeam(tag, m.team); if (!r.ok) return no(r.reason); await this.changed(); return yes(); }
      case 'rename': { const r = l.rename(tag, m.team, m.name); if (!r.ok) return no(r.reason); await this.changed(); return yes(); }
      case 'ready': return this.ready(tag, m.id, m.fund ?? 0, yes, no);
      case 'unready': {
        const r = l.unready(tag);
        if (!r.ok) return no(r.reason);
        if (r.release) await this.release(tag, 'unready');
        await this.changed();
        return yes();
      }
      case 'cancel': { const r = l.cancel(tag); if (!r.ok) return no(r.reason); await this.finish('cancel'); return yes(); }
      case 'remove': {
        const r = l.remove(tag, m.tag);
        if (!r.ok) return no(r.reason);
        if (r.release) await this.release(m.tag, 'removed');
        for (const ws of this.ctx.getWebSockets(m.tag)) { this.send(ws, { type: 'bye', reason: 'removed' }); try { ws.close(4001, 'Removed'); } catch { /* gone */ } }
        await this.changed();
        return yes();
      }
      case 'invite': { const r = l.invite(tag, m.tags); if (!r.ok) return no(r.reason); await this.changed(); return yes(); }
    }
    return no('invalid');
  }

  /** « Prêt »: the fee held by the ledger first (Teranga Money, the wallet part as a send's), then ready; a free match is ready at once. */
  private async ready(tag: Tag, op: string, fund: number, yes: (e?: Partial<Extract<Ack, { ok: true }>>) => Ack, no: (r: CampRefusal) => Ack): Promise<Ack> {
    const l = this.lobby!, r = l.readyAsk(tag, op);
    if (!r.ok) return no(r.reason);
    if (!r.hold) { if (!r.again) { await this.changed(); await this.maybeStart(); } return yes(r.again ? { duplicate: true } : {}); }
    await this.changed();                                                  // everyone sees « en attente » meanwhile
    const t = l.terms;
    let res: CampHoldResult | null = null;
    try { res = await this.ledger().campHold({ match: this.match!, tag, op, terms: { fee: t.fee, size: t.size, dist: t.dist }, fund }); }
    catch (e) { console.log(JSON.stringify({ event: 'camp-ledger', step: 'hold', error: String(e) })); }
    if (!res) { l.held(tag, op, 'unsure'); await this.changed(); return no('offline'); }
    if (!res.ok) { l.held(tag, op, 'refused'); await this.changed(); return no(refusal(res.reason)); }
    l.held(tag, op, 'held');
    const seat = l.seat(tag); if (seat) seat.op = res.hold.op;            // (a duplicate answer is the player's one hold, under its own op)
    this.money(tag, 'hold', res.hold.op, res.hold.amount, res.balance);
    this.tellBalance(tag);
    await this.changed();
    await this.maybeStart();
    return yes(res.duplicate ? { duplicate: true } : {});
  }
  /** The ledger returns a player's held fee (nothing held: nothing happens). A failure is mended before kick-off (`maybeStart`) or by the end's refund. */
  private async release(tag: Tag, why: string) {
    if (!this.lobby || this.lobby.terms.fee === 0) return;
    try {
      const r = await this.ledger().campRelease({ match: this.match!, tag });
      if (!r.duplicate && r.op) { this.money(tag, 'release', r.op, r.amount, r.balance ?? undefined, why); this.tellBalance(tag); }
    } catch (e) { console.log(JSON.stringify({ event: 'camp-ledger', step: 'release', why, error: String(e) })); }
  }

  // ================================================================== kick-off, the match, the end
  /** Every place filled and ready, equal teams: the ledger is asked what it holds (only the ready players' fees, each one), then the match starts. */
  private async maybeStart() {
    const l = this.lobby;
    if (!l || this.game || !l.startable()) return;
    if (l.terms.fee > 0) {
      let pool: { pool: CampPoolRow | null; holds: CampHoldRow[] };
      try { pool = await this.ledger().campPool(this.match!); } catch { return; }   // asked again at the next change
      const seated = new Set(l.data.players.map(p => p.tag));
      for (const h of pool.holds) if (h.state === 'held' && !seated.has(h.tag)) await this.release(h.tag, 'leave');
      let missing = false;
      for (const p of l.data.players) if (!pool.holds.some(h => h.tag === p.tag && h.state === 'held')) { p.ready = false; p.hold = 'none'; missing = true; }
      if (missing || !l.startable()) { await this.changed(); return; }
    }
    const seats = l.start(Date.now()), n = Number(this.env.CAMP_TEST_CLOCK);
    this.game = new CampMatch(seats.map(s => ({ sid: s.sid, team: s.team })), { seed: parseInt(this.match!.slice(0, 8), 16) | 0, seconds: Number.isFinite(n) && n >= 10 && n <= CAMP_MATCH.seconds ? n : CAMP_MATCH.seconds });
    this.ending = false;
    await this.changed();
    for (const ws of this.ctx.getWebSockets()) { const t = this.ctx.getTags(ws)[0]; if (t && l.seat(t)) this.sendStart(ws); }
    this.last = Date.now(); this.acc = 0; this.lastDue = this.last; this.lastArm = this.last;
    this.timer = setInterval(() => this.tick(), 1000 / CAMP_TICK_HZ);
  }
  private sendStart(ws: WebSocket) {
    const g = this.game!, l = this.lobby!;
    this.send(ws, { type: 'start', roster: l.data.players.map(p => ({ sid: p.sid, tag: p.tag, team: p.team as 0 | 1 })), kick: g.firstKick, seconds: g.seconds, goals: g.goals, tick: g.tick });
    for (let i = 0; i < g.events.length; i += 100) this.send(ws, { type: 'ev', e: g.events.slice(i, i + 100) });
  }
  /** The fixed tick: as many steps as the time owes (a late timer catches up, four at most); after each step its events and a snapshot to every player. */
  private tick() {
    const g = this.game;
    if (!g) { this.stopTimer(); return; }
    const now = Date.now(), dt = 1000 / g.hz;
    this.acc += now - this.last; this.last = now;
    let n = 0;
    while (this.acc >= dt && n < 4 && g.stage !== 'over') {
      this.acc -= dt; n++; this.meter.ticks++;
      const ev = g.step();
      if (ev.length) { this.meter.events += ev.length; this.toPlayers(JSON.stringify({ type: 'ev', e: ev } satisfies CampServerMessage)); }
      const s = JSON.stringify(encodeSnap(g.snapshot()));
      this.meter.snaps++; this.meter.snapBytes += s.length; this.toPlayers(s);
    }
    if (this.acc > dt * 4) this.acc = 0;                                    // far behind (a slow host): the match goes on from now
    if (g.stage === 'over' && !this.ending) { this.ending = true; this.stopTimer(); this.later(() => this.finish(g.winner === null ? 'draw' : 'win')); return; }
    if (now - this.lastDue >= 1000) { this.lastDue = now; this.later(async () => { await this.due(); }); }
    if (now - this.lastArm >= WATCH_MS / 3) { this.lastArm = now; this.later(() => this.arm()); }
  }
  private stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  /** What the clock brings (the lobby rules' `due`): places freed, the lobby closed, players gone, the match stopped. */
  private async due(): Promise<boolean> {
    const l = this.lobby;
    if (!l || l.state === 'over') return false;
    const d = l.due(Date.now());
    for (const t of d.gone) { const s = l.seat(t); if (s && this.game) this.game.gone(s.sid); }
    if (d.close) { await this.finish(d.close); return true; }
    if (d.stop) { this.ending = true; this.stopTimer(); this.game?.stop(); await this.finish('stopped'); return true; }
    if (!d.free.length && !d.gone.length) return false;
    await this.changed();
    return true;
  }
  /** The end: the lobby closed (`end`), the outcome kept, the money settled once by the ledger, then the result for everyone. */
  private async finish(end: CampEnd) {
    const l = this.lobby!;
    this.stopTimer();
    l.close(end);
    const g = this.game, last = l.data.end ?? end;
    this.outcome = l.outcome(last, last === 'win' ? g?.winner ?? null : null, g?.goalLog ?? []);
    await this.ctx.storage.put('settle', this.outcome);
    if (g) console.log(JSON.stringify({ event: 'camp-match', match: this.match, end: last, score: g.score, players: l.data.players.length, ...this.meter, snapBytesAvg: this.meter.snaps ? Math.round(this.meter.snapBytes / this.meter.snaps) : 0 }));
    await this.changed();
    await this.settle();
  }
  /** Asks the ledger to settle the outcome (once per match id: asked again after a failure, it answers the first settlement), then says the result. */
  private async settle() {
    const l = this.lobby, o = this.outcome;
    if (!l || !o) return;
    const t = l.terms;
    let s: CampSettlement | null = null;
    if (t.fee > 0) {
      try {
        let r = await this.ledger().campSettle({ match: this.match!, outcome: o, terms: { fee: t.fee, size: t.size, dist: t.dist } });
        if (!r.ok) {                                                       // winners the ledger does not see holding: every fee goes back instead
          console.log(JSON.stringify({ event: 'camp-ledger', step: 'settle', outcome: o.kind, error: r.reason }));
          r = await this.ledger().campSettle({ match: this.match!, outcome: { kind: 'refund', why: 'stopped' }, terms: { fee: t.fee, size: t.size, dist: t.dist } });
        }
        if (!r.ok) throw new Error(r.reason);
        s = r.settlement;
        for (const p of s.payouts) {
          const b = r.balances.find(x => x.tag === p.tag);
          this.money(p.tag, s.kind === 'refund' ? 'refund' : 'payout', p.op, p.amount, b?.balance);
          this.tellBalance(p.tag);
        }
      } catch (e) {
        console.log(JSON.stringify({ event: 'camp-ledger', step: 'settle', error: String(e) }));
        await this.arm(); return;                                         // the alarm asks again; nobody is shown a result meanwhile
      }
    }
    const g = this.game, end = l.data.end ?? 'stopped';
    const money = !!s && s.total > 0;
    const result: CampResult = {
      end: s && s.kind === 'refund' && end === 'win' ? 'stopped' : end, score: g ? g.score : [0, 0], winner: end === 'win' && g ? g.winner : null, dist: t.dist, fee: t.fee,
      total: s?.total ?? 0, payouts: s ? s.payouts.map(p => ({ tag: p.tag, amount: p.amount })) : [],
      ...(s && s.kind === 'single' && s.payouts[0] ? { single: s.payouts[0].tag } : !s && o.kind === 'single' ? { single: o.winner } : {}),
      money: money ? 'settled' : 'none', at: Date.now(),
    };
    l.data.result = result;
    this.outcome = null;
    await this.ctx.storage.delete('settle');
    await this.changed();
    this.broadcast({ type: 'result', result });
  }

  // ================================================================== time: the alarm
  /** The next thing to do: a lobby deadline, the watchdog of a running match, a settlement to ask again, forgetting a finished match. */
  private async arm() {
    const l = this.lobby;
    let t = Infinity;
    if (l) { const d = l.deadline(); if (d !== null) t = Math.min(t, d); }
    if (l?.state === 'play') t = Math.min(t, Date.now() + WATCH_MS);
    if (this.outcome) t = Math.min(t, Date.now() + RETRY_MS);
    if (l?.state === 'over' && l.data.result) t = Math.min(t, l.data.result.at + KEEP_MS);
    if (!Number.isFinite(t)) { await this.ctx.storage.deleteAlarm(); return; }
    await this.ctx.storage.setAlarm(Math.max(t, Date.now() + 50));
  }
  async alarm(): Promise<void> {
    await this.enqueue(async () => {
      const l = this.lobby;
      if (!l) return;
      if (l.state === 'play' && !this.game) {                           // the host lost the match (a restart): the server stops it, every fee returned
        this.interrupted = false; this.ending = true;
        console.log(JSON.stringify({ event: 'camp-stopped', match: this.match }));
        await this.finish('stopped'); return;
      }
      if (this.outcome) { await this.settle(); return; }
      if (l.state === 'over' && l.data.result && Date.now() >= l.data.result.at + KEEP_MS) {
        for (const ws of this.ctx.getWebSockets()) { this.send(ws, { type: 'bye', reason: 'over' }); try { ws.close(1000, 'Over'); } catch { /* gone */ } }
        await this.ctx.storage.deleteAll(); this.lobby = null; this.match = null; return;
      }
      if (!(await this.due())) await this.arm();
    });
  }

  // ================================================================== saving, telling
  /** After every change: saved, listed (or not), shown to everyone who may see it, the alarm set. */
  private async changed() {
    if (!this.lobby) return;
    await this.ctx.storage.put('camp', this.lobby.data);
    this.list();
    this.broadcastLobby();
    await this.arm();
  }
  /** Changes run one after the other (a ledger answer awaited inside one is never overtaken by another change). */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.queue.then(fn);
    this.queue = run.catch(e => { console.log(JSON.stringify({ event: 'camp-error', error: String(e) })); });
    return run;
  }
  /** The same, from a timer or a socket's opening: nobody waits for it (its error is logged by the queue). */
  private later(fn: () => Promise<void>) { this.enqueue(fn).catch(() => {}); }
  /** A private lobby is shown to its organizer, its players and the invited only. */
  private visible(tag: Tag) { const l = this.lobby; return !!l && (l.terms.open || l.data.org === tag || l.data.invited.includes(tag) || !!l.seat(tag)); }
  private send(ws: WebSocket, m: CampServerMessage) { try { ws.send(JSON.stringify(m)); } catch { /* closing: the client asks again */ } }
  private broadcast(m: CampServerMessage) { const s = JSON.stringify(m); for (const ws of this.ctx.getWebSockets()) { const t = this.ctx.getTags(ws)[0]; if (t && this.visible(t)) { try { ws.send(s); } catch { /* closing */ } } } }
  private broadcastLobby() { if (this.lobby) this.broadcast({ type: 'lobby', lobby: this.lobby.view() }); }
  /** The match's frames go to its players on the roster only (not a stranger's socket, nor a player who left for good). */
  private toPlayers(s: string) { const l = this.lobby; for (const ws of this.ctx.getWebSockets()) { const t = this.ctx.getTags(ws)[0], seat = t ? l?.seat(t) : undefined; if (seat && !seat.gone) { try { ws.send(s); } catch { /* closing */ } } } }
  private money(tag: Tag, step: CampMoneyStep, op: string, amount: number, balance?: number, why?: string) {
    const m: CampServerMessage = { type: 'money', step, op, amount, ...(balance !== undefined ? { balance } : {}), ...(why ? { why } : {}) };
    for (const ws of this.ctx.getWebSockets(tag)) this.send(ws, m);
  }
  /** The player's account sockets get the new Teranga Money balance (the account's own `balance` message). */
  private tellBalance(tag: Tag) { this.ctx.waitUntil(this.env.SOCIAL.getByName(`acct:${tag}`).campBalance(tag).catch(() => {})); }
  /** The district's list: this lobby while it takes players, gone once it starts or closes (in order: one change after the other). */
  private list() {
    const l = this.lobby, match = this.match;
    if (!l || !match) return;
    const idx = this.env.CAMPS.getByName(`list:${l.terms.hub}`);
    const org = l.seat(l.data.org), v = l.view();
    const put = l.state === 'lobby' ? { match, terms: v.terms, org: { tag: l.data.org, name: org?.name ?? 'Joueur' }, teams: v.teams, count: v.players.length, created: v.created, closes: v.closes } satisfies CampListing : null;
    const invited = [...l.data.invited];
    this.listQ = this.listQ.then(() => (put ? idx.campListPut(put, invited) : idx.campListDrop(match))).catch(() => {});
    this.ctx.waitUntil(this.listQ);
  }

  // ================================================================== the `list:<hub>` role
  async campListPut(e: CampListing, invited: Tag[]): Promise<void> { await this.ctx.storage.put(`l:${e.match}`, { e, invited, at: Date.now() } satisfies ListRow); }
  async campListDrop(match: string): Promise<void> { await this.ctx.storage.delete(`l:${match}`); }
  /** The lobbies of `hub` that take players now: the public ones, and the private ones `tag` organizes or is invited to (newest first). */
  async campList(hub: HubId, tag: Tag | null): Promise<CampListing[]> {
    const now = Date.now(), out: CampListing[] = [], stale: string[] = [];
    for (const [k, v] of await this.ctx.storage.list<ListRow>({ prefix: 'l:', limit: 1000 })) {
      if (now > v.e.closes + 60_000) { stale.push(k); continue; }
      if (v.e.terms.hub !== hub || v.e.count >= v.e.terms.size) continue;
      const invited = !!tag && v.invited.includes(tag);
      if (!v.e.terms.open && !invited && v.e.org.tag !== tag) continue;
      out.push({ ...v.e, ...(invited ? { invited: true } : {}) });
    }
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));
    return out.sort((a, b) => b.created - a.created).slice(0, LISTED_MAX);
  }
}

/** The ledger's refusal as the player is told it. */
function refusal(r: CampLedgerRefusal): CampRefusal {
  return r === 'insufficient' || r === 'limit-fund' || r === 'limit-op' || r === 'amount' || r === 'busy' || r === 'closed' || r === 'offline' ? r : 'invalid';
}
