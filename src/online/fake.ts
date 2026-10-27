import type { HubId } from '../core/types';
import { onlineHooks, online, setOnline, type ItemView, type OnlineApi, type OnlineStatus, type Outcome, type PayQuote } from './api';
import type {
  AskItem, FriendCode, Francs, GuestPerms, HomeSnapshot, InviteItem, Item, LedgerOp, LocationItem, MeetItem, MoneyLimits, MoneyRefusal, PayItem, PlaceRef, Tag,
} from './protocol';
import { cleanChatText, FAILURE_LABEL } from '../multiplayer/chatRules';
import { fcfaText as F } from '../economy/format';

/**
 * LD2.0-B: an in-memory player account (the OnlineApi of src/online/api.ts) and a scripted « other player », for the Messages app's checks, the visits and
 * meetups lane, and a build without the server — only behind `?debug&fakeonline`, and always saying it is simulated (`fake: true`, the Messages status
 * line). Nothing here talks to a network. It keeps the API's semantics so a UI built on it works on the real client (src/online/client.ts):
 *   – every request answers once, after `latency` ms (deterministic timers), by op id: the same id again returns the first result and changes nothing;
 *   – a refused id is not stored (a new confirmation makes a new id); a text sent offline stays « sending » and goes when the account is back online;
 *   – Teranga Money is the fake server's balance; a send takes Teranga Money first and the rest from the wallet (debited before it is « sent », refunded
 *     once if refused); a withdrawal credits the wallet once, when answered; limits and refusals say themselves in French (`text`).
 * The script (`script`, and `window.__dakarOnline` under ?debug) drives the other side: texts, requests, payments, invitations, meetings, positions,
 * answers to what the player sent, presence (online, last seen), balance and limits, and the next operation's failure.
 */
export interface FakeWallet { get(): Francs; add(n: Francs, label: string): void }
export interface FakePeerInit {
  tag?: Tag; name: string; look?: number; app?: string;
  seen?: 'online' | number | 'never';
  /** Where `find` says this player is (district and presence room). */
  hub?: HubId | null; room?: number;
  /** The home this player invites into. */
  home?: HomeSnapshot | null;
}
export interface FakeOnlineOpts {
  /** Server time (ms): the game's presence.serverNow(). */
  now?: () => number;
  /** The device's wallet (GameState.wallet / addMoney): read by payQuote, debited by a top-up, credited by a withdrawal. */
  wallet?: FakeWallet;
  /** Writes the game's save after the wallet moved. */
  save?: () => void;
  me?: { tag?: Tag; name?: string };
  status?: OnlineStatus;
  /** Answer delay, ms (default 300). */
  latency?: number;
  balance?: Francs;
  limits?: Partial<MoneyLimits>;
  peers?: FakePeerInit[];
  /** Seed a few conversations and players to look up (default true). */
  demo?: boolean;
  /** Items a conversation shows before `more` loads older ones (default 40). */
  page?: number;
}

/** The contract's limits (docs/ld2/LD2_B_CONTRACT.md, `ECONOMY.online`). */
export const FAKE_LIMITS: MoneyLimits = { opMax: 250_000, fundDayMax: 500_000, sendDayMax: 500_000, receiveDayMax: 1_000_000, balanceMax: 5_000_000 };
const ME_TAG = 'f00dfeedcafe0001';
const DEMO: FakePeerInit[] = [
  { tag: 'a11ce0000000a001', name: 'Awa', look: 1, seen: 'online', hub: 'plateau', room: 0 },
  { tag: 'b0b0000000000b02', name: 'Moussa', look: 2, seen: -25 * 60_000, hub: 'pikine', room: 0 },
  { tag: 'c0ffee000000c003', name: 'Fatou', look: 4, seen: 'never' },
  { tag: 'd00d000000000d04', name: 'Ibou', look: 0, seen: 'online', hub: 'corniche', room: 0 },
];
const codeOf = (tag: Tag): FriendCode => tag.toUpperCase().replace(/(.{4})(?=.)/g, '$1-');

interface Peer { tag: Tag; name: string; look: number; app?: string; seen: 'online' | number | 'never'; hub: HubId | null; room: number; home: HomeSnapshot | null; blockedMe: boolean; received: Francs }
/** A conversation: every item (oldest first), the unread count, and how many of the newest ones the device has loaded (`more` loads older). */
interface Conv { items: ItemView[]; unread: number; shown: number }
type Fail = { reason: string; text?: string };

const REFUSAL: Record<MoneyRefusal, string> = {
  amount: 'Choisis un montant d’au moins 1 F.',
  insufficient: 'Pas assez d’argent : Teranga Money et ton portefeuille ne suffisent pas.',
  'limit-op': 'Ce montant dépasse la limite d’une opération.',
  'limit-fund': 'Tu as atteint la recharge permise aujourd’hui depuis le portefeuille.',
  'limit-send': 'Tu as atteint l’envoi permis aujourd’hui.',
  'limit-receive': 'Ce joueur a reçu le maximum permis aujourd’hui.',
  'limit-balance': 'Teranga Money ne peut pas dépasser son solde maximum.',
  self: 'Tu ne peux pas t’envoyer de l’argent.',
  'unknown-recipient': 'Ce joueur n’a pas encore ouvert Messages : rien ne peut lui parvenir.',
  unavailable: 'Ce joueur ne peut pas recevoir cela de ta part.',
  'request-closed': 'Cette demande est déjà réglée.',
  'request-mismatch': 'Cette demande ne correspond plus.',
  offline: 'Hors ligne : rien n’est parti. Réessaie une fois reconnecté.',
  invalid: 'Opération refusée.',
};
const no = (reason: string, text?: string): { ok: false; reason: string; text: string } =>
  ({ ok: false, reason, text: text ?? REFUSAL[reason as MoneyRefusal] ?? (reason === 'not-found' ? 'Introuvable.' : reason === 'blocked' ? 'Tu as bloqué ce joueur.' : reason === 'rate-limited' ? 'Trop rapide : attends quelques secondes.' : 'Opération refusée.') });

export class FakeOnline implements OnlineApi {
  /** Never the real account: the UI says « simulé ». */
  readonly fake = true;
  status: OnlineStatus;
  me: { tag: Tag; code: FriendCode } | null;
  balance: { amount: Francs; at: number; fresh: boolean } | null;
  limits: MoneyLimits | null;
  today: { funded: Francs; sent: Francs; received: Francs } | null = { funded: 0, sent: 0, received: 0 };
  readonly name: string;
  private readonly now: () => number;
  private readonly latency: number;
  private conv = new Map<Tag, Conv>();
  private peers = new Map<Tag, Peer>();
  private blocked = new Set<Tag>();
  readonly reports: { tag: Tag; reason: string; at: number }[] = [];
  /** Teranga Money's ledger (oldest first). */
  readonly ops: LedgerOp[] = [];
  /** Answers already given, by op id (idempotency), and requests in flight. */
  private done = new Map<string, Outcome<any>>();
  private flying = new Map<string, Promise<Outcome<any>>>();
  private failing: Fail | null = null;
  private seq = 0;
  private listeners = new Set<() => void>();
  private ends = new Set<(host: Tag, invite: string) => void>();
  private queued = false;
  /** Every request the UI made (kind and id), for the checks: a double tap shows as one entry per id. */
  readonly calls: { kind: string; id?: string; at: number }[] = [];

  constructor(private opts: FakeOnlineOpts = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.latency = opts.latency ?? 300;
    this.status = opts.status ?? 'online';
    this.name = opts.me?.name ?? 'Toi';
    const tag = opts.me?.tag ?? ME_TAG;
    this.me = { tag, code: codeOf(tag) };
    this.limits = { ...FAKE_LIMITS, ...opts.limits };
    this.balance = { amount: opts.balance ?? 3_000, at: this.now(), fresh: this.status === 'online' };
    const now = this.now();
    for (const p of [...(opts.demo === false ? [] : DEMO), ...(opts.peers ?? [])]) this.addPeer({ ...p, seen: typeof p.seen === 'number' && p.seen < 0 ? now + p.seen : p.seen });
    if (opts.demo !== false) this.seedDemo(now);
  }

  // ---------------------------------------------------------------- reading
  convs() {
    const out = [...this.conv].filter(([, c]) => c.items.length).map(([tag, c]) => {
      const p = this.peer(tag);
      return { with: tag, name: p.name, look: p.look, app: p.app, last: c.items[c.items.length - 1] ?? null, unread: this.blocked.has(tag) ? 0 : c.unread, seen: p.seen, blocked: this.blocked.has(tag) };
    });
    return out.sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
  }
  items(withTag: Tag): ItemView[] { const c = this.conv.get(withTag); return c ? c.items.slice(-c.shown).map(i => ({ ...i })) : []; }
  async more(withTag: Tag) {
    await this.wait();
    const c = this.conv.get(withTag); if (!c || c.shown >= c.items.length) return false;
    c.shown = Math.min(c.items.length, c.shown + (this.opts.page ?? 40)); this.changed();
    return c.shown < c.items.length;
  }
  read(withTag: Tag) { const c = this.conv.get(withTag); if (c && c.unread) { c.unread = 0; this.changed(); } }
  unread() { let n = 0; for (const [tag, c] of this.conv) if (!this.blocked.has(tag)) n += c.unread; return n; }
  seen(tag: Tag) { return this.peers.get(tag)?.seen ?? 'never'; }
  newId() { return `fake-${(++this.seq).toString(36).padStart(6, '0')}`; }

  // ---------------------------------------------------------------- texts and positions
  say(to: Tag, text: string): Outcome<{ id: string }> {
    const c = cleanChatText(text);
    if (!c.ok) return no(c.reason, FAILURE_LABEL[c.reason]);
    return this.post(to, { k: 'text', text: c.text });
  }
  shareLocation(to: Tag): Outcome<{ id: string }> {
    const here = onlineHooks.hereNow?.() ?? null;
    if (!here) return no('invalid', 'Ta position n’est pas disponible ici.');
    return this.post(to, { k: 'loc', hub: here.hub, x: here.x, z: here.z, name: here.name });
  }
  /** A text or a location: shown at once as « sending », acknowledged after `latency` when online, kept for the reconnection otherwise. */
  private post(to: Tag, body: { k: 'text'; text: string } | Omit<LocationItem, 'id' | 'from' | 'at'>): Outcome<{ id: string }> {
    const p = this.peers.get(to);
    if (!p || p.seen === 'never') return no('unknown-recipient');
    if (this.blocked.has(to)) return no('blocked', 'Tu as bloqué ce joueur : débloque-le pour lui écrire.');
    const id = this.newId(); this.calls.push({ kind: body.k === 'text' ? 'say' : 'loc', id, at: this.now() });
    const item = { id, from: this.me!.tag, at: this.now(), ...body, status: 'sending' } as ItemView;
    const f = this.takeFail();
    if (f) { item.status = 'failed'; item.reason = f.reason; }
    this.push(to, item, false);
    if (!f && this.status === 'online') this.deliver(to, id);
    return { ok: true, id };
  }
  private deliver(to: Tag, id: string) {
    setTimeout(() => {
      if (this.status !== 'online') return;                                    // went offline before the answer: resent at the reconnection
      const it = this.conv.get(to)?.items.find(i => i.id === id);
      if (it && it.status === 'sending') { delete it.status; delete it.reason; it.at = this.now(); this.changed(); }
    }, this.latency);
  }

  // ---------------------------------------------------------------- money
  payQuote(amount: Francs): PayQuote {
    const l = this.limits!, t = this.today!, bal = this.balance?.amount ?? 0, wallet = this.opts.wallet?.get() ?? 0;
    const q: PayQuote = { amount, fromOnline: 0, fromWallet: 0 };
    const refuse = (r: MoneyRefusal, text = REFUSAL[r]) => ({ ...q, refusal: r, text });
    if (!Number.isSafeInteger(amount) || amount < 1) return refuse('amount');
    q.fromOnline = Math.min(bal, amount); q.fromWallet = amount - q.fromOnline;
    if (this.status !== 'online') return refuse('offline');
    if (amount > l.opMax) return refuse('limit-op', `${F(l.opMax)} au plus par envoi.`);
    if (t.sent + amount > l.sendDayMax) return refuse('limit-send', `Encore ${F(Math.max(0, l.sendDayMax - t.sent))} d’envoi permis aujourd’hui.`);
    if (q.fromWallet > wallet) return refuse('insufficient', `Il te manque ${F(q.fromWallet - wallet)} : Teranga Money et ton portefeuille ne suffisent pas.`);
    if (t.funded + q.fromWallet > l.fundDayMax) return refuse('limit-fund', `Encore ${F(Math.max(0, l.fundDayMax - t.funded))} de recharge permise aujourd’hui depuis le portefeuille.`);
    return q;
  }

  pay(o: { id: string; to: Tag; amount: Francs; note?: string; req?: string }) {
    return this.op<{ op: LedgerOp }>('pay', o.id, () => {
      const p = this.peers.get(o.to);
      if (o.to === this.me!.tag) return no('self');
      if (!p || p.seen === 'never') return no('unknown-recipient');
      if (p.blockedMe || this.blocked.has(o.to)) return no('unavailable');
      const q = this.payQuote(o.amount);
      if (q.refusal) return no(q.refusal, q.text);
      if (p.received + o.amount > this.limits!.receiveDayMax) return no('limit-receive', `${p.name} a reçu le maximum permis aujourd’hui.`);
      let ask: AskItem | undefined;
      if (o.req) {
        ask = this.conv.get(o.to)?.items.find((i): i is AskItem & ItemView => i.id === o.req && i.k === 'ask');
        if (!ask || ask.from !== o.to) return no('request-mismatch');
        if (ask.state !== 'open') return no('request-closed');
        if (ask.amount !== o.amount) return no('request-mismatch');
      }
      const fund = q.fromWallet;
      if (fund > 0) { this.opts.wallet?.add(-fund, 'Teranga Money · recharge'); this.opts.save?.(); }   // the device's side: the wallet first, then the request
      return () => {
        const f = this.takeFail();
        if (f) { if (fund > 0) { this.opts.wallet?.add(fund, 'Teranga Money · recharge annulée'); this.opts.save?.(); } return no(f.reason, f.text); }
        const at = this.now(), op: LedgerOp = { id: o.id, kind: 'pay', at, amount: o.amount, from: this.me!.tag, to: o.to, ...(fund ? { fund } : {}), ...(o.req ? { req: o.req } : {}), ...(o.note ? { note: o.note } : {}) };
        this.ops.push(op);
        this.setBalance(this.balance!.amount + fund - o.amount);
        this.today = { ...this.today!, funded: this.today!.funded + fund, sent: this.today!.sent + o.amount };
        p.received += o.amount;
        if (ask) { ask.state = 'paid'; ask.paidBy = o.id; }
        const item: PayItem = { id: o.id, from: this.me!.tag, at, k: 'pay', amount: o.amount, op: o.id, ...(o.note ? { note: o.note } : {}), ...(o.req ? { req: o.req } : {}) };
        this.push(o.to, item, false);
        return { ok: true as const, op };
      };
    });
  }
  ask(o: { id: string; to: Tag; amount: Francs; note?: string }) {
    return this.op<{ item: Item }>('ask', o.id, () => {
      const p = this.peers.get(o.to);
      if (!p || p.seen === 'never') return no('unknown-recipient');
      if (p.blockedMe || this.blocked.has(o.to)) return no('unavailable');
      if (this.status !== 'online') return no('offline');
      if (!Number.isSafeInteger(o.amount) || o.amount < 1) return no('amount');
      if (o.amount > this.limits!.opMax) return no('limit-op', `${F(this.limits!.opMax)} au plus par demande.`);
      return () => {
        const f = this.takeFail(); if (f) return no(f.reason, f.text);
        const item: AskItem = { id: o.id, from: this.me!.tag, at: this.now(), k: 'ask', amount: o.amount, state: 'open', ...(o.note ? { note: o.note } : {}) };
        this.push(o.to, item, false);
        return { ok: true as const, item };
      };
    });
  }
  closeAsk(o: { id: string; ref: string; how: 'declined' | 'cancelled' }) {
    return this.op<object>('ask-close', o.id, () => {
      const found = this.byId<AskItem>(o.ref, 'ask');
      if (!found) return no('not-found');
      const [, ask] = found, mineAsk = ask.from === this.me!.tag;
      if (ask.state !== 'open') return no('request-closed');
      if ((o.how === 'cancelled') !== mineAsk) return no('invalid');
      return () => { const f = this.takeFail(); if (f) return no(f.reason, f.text); ask.state = o.how; this.changed(); return { ok: true as const }; };
    });
  }
  fund(o: { id: string; amount: Francs }) {
    return this.op<{ op: LedgerOp }>('fund', o.id, () => {
      const l = this.limits!, wallet = this.opts.wallet?.get() ?? 0;
      if (this.status !== 'online') return no('offline');
      if (!Number.isSafeInteger(o.amount) || o.amount < 1) return no('amount');
      if (o.amount > l.opMax) return no('limit-op', `${F(l.opMax)} au plus par recharge.`);
      if (o.amount > wallet) return no('insufficient', `Ton portefeuille n’a que ${F(wallet)}.`);
      if (this.today!.funded + o.amount > l.fundDayMax) return no('limit-fund', `Encore ${F(Math.max(0, l.fundDayMax - this.today!.funded))} de recharge permise aujourd’hui.`);
      if (this.balance!.amount + o.amount > l.balanceMax) return no('limit-balance', `Teranga Money ne peut pas dépasser ${F(l.balanceMax)}.`);
      this.opts.wallet?.add(-o.amount, 'Teranga Money · recharge'); this.opts.save?.();
      return () => {
        const f = this.takeFail();
        if (f) { this.opts.wallet?.add(o.amount, 'Teranga Money · recharge annulée'); this.opts.save?.(); return no(f.reason, f.text); }
        const op: LedgerOp = { id: o.id, kind: 'fund', at: this.now(), amount: o.amount };
        this.ops.push(op); this.setBalance(this.balance!.amount + o.amount);
        this.today = { ...this.today!, funded: this.today!.funded + o.amount };
        return { ok: true as const, op };
      };
    });
  }
  cashout(o: { id: string; amount: Francs }) {
    return this.op<{ op: LedgerOp }>('cashout', o.id, () => {
      if (this.status !== 'online') return no('offline');
      if (!Number.isSafeInteger(o.amount) || o.amount < 1) return no('amount');
      if (o.amount > this.limits!.opMax) return no('limit-op', `${F(this.limits!.opMax)} au plus par retrait.`);
      if (o.amount > this.balance!.amount) return no('insufficient', `Teranga Money n’a que ${F(this.balance!.amount)}.`);
      return () => {
        const f = this.takeFail(); if (f) return no(f.reason, f.text);
        const op: LedgerOp = { id: o.id, kind: 'cashout', at: this.now(), amount: o.amount };
        this.ops.push(op); this.setBalance(this.balance!.amount - o.amount);
        this.opts.wallet?.add(o.amount, 'Teranga Money · retrait'); this.opts.save?.();   // credited once: this answer is given once per id
        return { ok: true as const, op };
      };
    });
  }
  async history(before?: number): Promise<Outcome<{ ops: LedgerOp[]; more: boolean }>> {
    await this.wait();
    if (this.status !== 'online') return no('offline', 'Hors ligne : l’historique s’affichera une fois reconnecté.');
    const all = this.ops.filter(o => before === undefined || o.at < before).reverse().sort((a, b) => b.at - a.at);   // newest first (the later of two at the same ms first)
    return { ok: true, ops: all.slice(0, 20), more: all.length > 20 };
  }

  // ---------------------------------------------------------------- invitations
  invite(o: { id: string; to: Tag; perms: GuestPerms }) {
    return this.op<{ item: InviteItem }>('invite', o.id, () => {
      const p = this.peers.get(o.to), home = onlineHooks.homeToInvite?.() ?? null;
      if (!home) return no('invalid', 'Tu n’as pas de logement où inviter.');
      if (!p || p.seen === 'never') return no('unknown-recipient');
      if (p.blockedMe || this.blocked.has(o.to)) return no('unavailable');
      if (this.status !== 'online') return no('offline');
      return () => {
        const f = this.takeFail(); if (f) return no(f.reason, f.text);
        const at = this.now(), item: InviteItem = { id: o.id, from: this.me!.tag, at, k: 'invite', home, perms: { use: !!o.perms.use }, state: 'open', until: at + 24 * 3600_000 };
        this.push(o.to, item, false);
        return { ok: true as const, item };
      };
    });
  }
  answerInvite(o: { id: string; ref: string; accept: boolean }) {
    return this.op<object>('invite-answer', o.id, () => {
      const f0 = this.byId<InviteItem>(o.ref, 'invite');
      if (!f0 || f0[1].from === this.me!.tag) return no('not-found');
      if (f0[1].state !== 'open') return no('invalid', 'Cette invitation n’est plus ouverte.');
      return () => { const f = this.takeFail(); if (f) return no(f.reason, f.text); f0[1].state = o.accept ? 'accepted' : 'declined'; this.changed(); return { ok: true as const }; };
    });
  }
  revokeInvite(o: { id: string; ref: string }) {
    return this.op<object>('invite-revoke', o.id, () => {
      const f0 = this.byId<InviteItem>(o.ref, 'invite');
      if (!f0 || f0[1].from !== this.me!.tag) return no('not-found');
      if (f0[1].state !== 'open' && f0[1].state !== 'accepted') return no('invalid', 'Cette invitation est déjà close.');
      return () => { const f = this.takeFail(); if (f) return no(f.reason, f.text); f0[1].state = 'revoked'; this.changed(); return { ok: true as const }; };
    });
  }
  async visit(host: Tag): Promise<Outcome<{ snapshot: HomeSnapshot; perms: GuestPerms; invite: string }>> {
    await this.wait();
    const inv = (this.conv.get(host)?.items ?? []).filter((i): i is InviteItem & ItemView => i.k === 'invite' && i.from === host && i.state === 'accepted').pop();
    if (!inv) return no('not-found', 'Pas d’invitation acceptée pour ce logement.');
    const p = this.peers.get(host);
    const snapshot = p?.home ?? { home: inv.home, upgrades: [], furniture: [], at: this.now() };
    return { ok: true, snapshot, perms: inv.perms, invite: inv.id };
  }

  // ---------------------------------------------------------------- meetings
  meet(o: { id: string; to: Tag; place: PlaceRef; when: number; note?: string; counter?: string }) {
    return this.op<{ item: MeetItem }>('meet', o.id, () => {
      const p = this.peers.get(o.to);
      if (!p || p.seen === 'never') return no('unknown-recipient');
      if (p.blockedMe || this.blocked.has(o.to)) return no('unavailable');
      if (this.status !== 'online') return no('offline');
      const countered = o.counter ? this.byId<MeetItem>(o.counter, 'meet') : null;
      if (o.counter && (!countered || countered[1].state !== 'open')) return no('invalid', 'Ce rendez-vous n’attend plus de réponse.');
      return () => {
        const f = this.takeFail(); if (f) return no(f.reason, f.text);
        if (countered) countered[1].state = 'countered';
        const item: MeetItem = { id: o.id, from: this.me!.tag, at: this.now(), k: 'meet', place: o.place, when: o.when, state: 'open', here: [], ...(o.note ? { note: o.note } : {}), ...(o.counter ? { counter: o.counter } : {}) };
        this.push(o.to, item, false);
        return { ok: true as const, item };
      };
    });
  }
  answerMeet(o: { id: string; ref: string; accept: boolean }) {
    return this.op<object>('meet-answer', o.id, () => {
      const f0 = this.byId<MeetItem>(o.ref, 'meet');
      if (!f0 || f0[1].from === this.me!.tag) return no('not-found');
      if (f0[1].state !== 'open') return no('invalid', 'Ce rendez-vous n’attend plus de réponse.');
      return () => { const f = this.takeFail(); if (f) return no(f.reason, f.text); f0[1].state = o.accept ? 'accepted' : 'declined'; this.changed(); return { ok: true as const }; };
    });
  }
  cancelMeet(o: { id: string; ref: string }) {
    return this.op<object>('meet-cancel', o.id, () => {
      const f0 = this.byId<MeetItem>(o.ref, 'meet');
      if (!f0 || f0[1].from !== this.me!.tag) return no('not-found');
      if (f0[1].state !== 'open' && f0[1].state !== 'accepted') return no('invalid', 'Ce rendez-vous est déjà clos.');
      return () => { const f = this.takeFail(); if (f) return no(f.reason, f.text); f0[1].state = 'cancelled'; this.changed(); return { ok: true as const }; };
    });
  }
  here(ref: string) { this.arrive(ref, this.me!.tag); }
  private arrive(ref: string, tag: Tag) {
    const f0 = this.byId<MeetItem>(ref, 'meet');
    if (!f0 || f0[1].state !== 'accepted' || f0[1].here.includes(tag)) return;
    f0[1].here = [...f0[1].here, tag];
    if (f0[1].here.length >= 2) f0[1].state = 'met';
    this.changed();
  }

  // ---------------------------------------------------------------- privacy and lookups
  async block(tag: Tag, on: boolean): Promise<Outcome> {
    this.calls.push({ kind: 'block', at: this.now() });
    await this.wait();
    const f = this.takeFail(); if (f) return no(f.reason, f.text);
    if (on) {
      this.blocked.add(tag);
      for (const it of this.conv.get(tag)?.items ?? []) {                         // blocking revokes the invitations between the two and cancels their meetings
        if (it.k === 'invite' && (it.state === 'open' || it.state === 'accepted')) { it.state = 'revoked'; if (it.from === tag) for (const fn of this.ends) fn(tag, it.id); }
        if (it.k === 'meet' && (it.state === 'open' || it.state === 'accepted')) it.state = 'cancelled';
      }
    } else this.blocked.delete(tag);
    this.changed();
    return { ok: true };
  }
  isBlocked(tag: Tag) { return this.blocked.has(tag); }
  async report(tag: Tag, reason: 'insulte' | 'harcelement' | 'arnaque' | 'autre'): Promise<Outcome> {
    this.calls.push({ kind: 'report', at: this.now() });
    await this.wait();
    const f = this.takeFail(); if (f) return no(f.reason, f.text);
    this.reports.push({ tag, reason, at: this.now() });
    return { ok: true };
  }
  async forget(withTag: Tag): Promise<Outcome> {
    this.calls.push({ kind: 'forget', at: this.now() });
    await this.wait();
    const f = this.takeFail(); if (f) return no(f.reason, f.text);
    this.conv.delete(withTag); this.changed();
    return { ok: true };
  }
  async lookup(code: FriendCode): Promise<Outcome<{ tag: Tag; name: string; look: number; app?: string }>> {
    await this.wait();
    if (this.status !== 'online') return no('offline', 'Hors ligne : la recherche reprendra une fois reconnecté.');
    const hex = code.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (hex === this.me!.tag) return no('self', 'C’est ton propre code.');
    const p = this.peers.get(hex);
    if (!p) return no('not-found', 'Aucun joueur avec ce code. Vérifie les 16 caractères.');
    return { ok: true, tag: p.tag, name: p.name, look: p.look, ...(p.app ? { app: p.app } : {}) };
  }
  async find(tag: Tag): Promise<Outcome<{ hub: HubId | null; room: number }>> {
    await this.wait();
    const items = this.conv.get(tag)?.items ?? [], p = this.peers.get(tag);
    const linked = items.some(i => (i.k === 'meet' || i.k === 'invite') && (i.state === 'accepted' || i.state === 'met'));
    if (!p || !linked) return no('not-found', 'Rien d’accepté entre vous pour l’instant.');
    return { ok: true, hub: p.hub, room: p.room };
  }

  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onVisitEnd(fn: (host: Tag, invite: string) => void) { this.ends.add(fn); return () => { this.ends.delete(fn); }; }

  // ---------------------------------------------------------------- the machinery
  private peer(tag: Tag): Peer { return this.peers.get(tag) ?? { tag, name: 'Joueur', look: 0, seen: 'never', hub: null, room: 0, home: null, blockedMe: false, received: 0 }; }
  private changed() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.error(e); } } });
  }
  private wait() { return new Promise<void>(r => setTimeout(r, this.latency)); }
  private takeFail(): Fail | null { const f = this.failing; this.failing = null; return f; }
  private setBalance(amount: Francs) { this.balance = { amount, at: this.now(), fresh: this.status === 'online' }; this.changed(); }
  /** An item (and its conversation) by id, of one kind. */
  private byId<T extends Item>(id: string, k: T['k']): [Tag, T & ItemView] | null {
    for (const [tag, c] of this.conv) { const it = c.items.find(i => i.id === id && i.k === k); if (it) return [tag, it as T & ItemView]; }
    return null;
  }
  /** Adds an item, or replaces the one with the same id (a new state); an incoming new item counts as unread. */
  private push(withTag: Tag, item: ItemView, incoming: boolean) {
    const c = this.conv.get(withTag) ?? { items: [], unread: 0, shown: 0 };
    this.conv.delete(withTag); this.conv.set(withTag, c);
    const i = c.items.findIndex(x => x.id === item.id);
    if (i >= 0) c.items[i] = item;
    else { c.items.push(item); c.items.sort((a, b) => a.at - b.at); c.shown++; if (incoming && !this.blocked.has(withTag)) c.unread++; }
    if (c.items.length > 500) c.items.splice(0, c.items.length - 500);
    this.changed();
  }
  /**
   * One request by op id: `check` runs at once (a refusal is answered, never stored); it returns the work to apply when the « server » answers, after
   * `latency`. The same id again — a double tap, a resend — returns the request in flight, or the first answer: never applied twice.
   */
  private op<T extends object>(kind: string, id: string, check: () => Outcome<T> | (() => Outcome<T>)): Promise<Outcome<T>> {
    this.calls.push({ kind, id, at: this.now() });
    const prev = this.done.get(id) ?? null;
    if (prev) return Promise.resolve(prev as Outcome<T>);
    const fly = this.flying.get(id);
    if (fly) return fly as Promise<Outcome<T>>;
    const first = check();
    if (typeof first !== 'function') { const r = first; return this.wait().then(() => r); }
    const p = this.wait().then(() => {
      const r = first();
      this.flying.delete(id);
      if (r.ok) this.done.set(id, r);
      this.changed();
      return r;
    });
    this.flying.set(id, p);
    return p;
  }

  // ---------------------------------------------------------------- the script (the other side, the network)
  addPeer(p: FakePeerInit): Tag {
    const tag = (p.tag ?? (this.seq++ * 7919 + 0x51ab).toString(16).padStart(16, '0')).toLowerCase();
    this.peers.set(tag, { tag, name: p.name, look: p.look ?? 0, app: p.app, seen: p.seen ?? 'online', hub: p.hub ?? null, room: p.room ?? 0, home: p.home ?? null, blockedMe: false, received: 0 });
    this.changed();
    return tag;
  }
  setStatus(s: OnlineStatus) {
    this.status = s;
    if (this.balance) this.balance = { ...this.balance, fresh: s === 'online' };
    if (s === 'online') for (const [to, c] of this.conv) for (const it of c.items) if (it.status === 'sending') this.deliver(to, it.id);   // the same ids, resent
    this.changed();
  }
  /** Makes the next request fail with this reason (and, for an Outcome, this sentence). */
  failNext(reason: string, text?: string) { this.failing = { reason, text }; }
  setMoney(o: { balance?: Francs; limits?: Partial<MoneyLimits>; today?: Partial<{ funded: Francs; sent: Francs; received: Francs }> }) {
    if (o.limits) this.limits = { ...this.limits!, ...o.limits };
    if (o.today) this.today = { ...this.today!, ...o.today };
    if (o.balance !== undefined) this.setBalance(o.balance); else this.changed();
  }
  /** The other player `tag` (or by name), acting. */
  as(who: Tag | string) {
    const p = this.peers.get(who) ?? [...this.peers.values()].find(x => x.name === who);
    if (!p) throw new Error(`fake online: no player ${who}`);
    const at = () => this.now(), id = () => `peer-${(++this.seq).toString(36).padStart(6, '0')}`;
    const mineOrTheirs = <T extends Item>(ref: string, k: T['k']) => { const f0 = this.byId<T>(ref, k); if (!f0) throw new Error(`fake online: no ${k} ${ref}`); return f0[1]; };
    const s = {
      tag: p.tag,
      say: (text: string) => { const i = id(); this.push(p.tag, { id: i, from: p.tag, at: at(), k: 'text', text }, true); return i; },
      share: (loc: { hub: HubId; x: number; z: number; name: string }) => { const i = id(); this.push(p.tag, { id: i, from: p.tag, at: at(), k: 'loc', ...loc }, true); return i; },
      ask: (amount: Francs, note?: string) => { const i = id(); this.push(p.tag, { id: i, from: p.tag, at: at(), k: 'ask', amount, state: 'open', ...(note ? { note } : {}) }, true); return i; },
      /** Sends money to the player (`req`: pays the player's request). */
      pay: (amount: Francs, note?: string, req?: string) => {
        const i = id(), now = at();
        if (req) { const a = mineOrTheirs<AskItem>(req, 'ask'); a.state = 'paid'; a.paidBy = i; }
        this.ops.push({ id: i, kind: 'pay', at: now, amount, from: p.tag, to: this.me!.tag, ...(note ? { note } : {}), ...(req ? { req } : {}) });
        this.setBalance(this.balance!.amount + amount);
        this.today = { ...this.today!, received: this.today!.received + amount };
        this.push(p.tag, { id: i, from: p.tag, at: now, k: 'pay', amount, op: i, ...(note ? { note } : {}), ...(req ? { req } : {}) }, true);
        return i;
      },
      invite: (perms: GuestPerms = { use: true }) => {
        const home = p.home?.home ?? { spec: 'appart_jamm', hub: (p.hub ?? 'plateau') as HubId, door: 'plateau:door:jamm', name: `Chez ${p.name} · Résidence Jàmm` };
        const i = id(); this.push(p.tag, { id: i, from: p.tag, at: at(), k: 'invite', home, perms, state: 'open', until: at() + 24 * 3600_000 }, true); return i;
      },
      meet: (place: PlaceRef, when: number, note?: string, counter?: string) => {
        const i = id();
        if (counter) mineOrTheirs<MeetItem>(counter, 'meet').state = 'countered';
        this.push(p.tag, { id: i, from: p.tag, at: at(), k: 'meet', place, when, state: 'open', here: [], ...(note ? { note } : {}), ...(counter ? { counter } : {}) }, true); return i;
      },
      /** Answers what the player sent: their invitation or meeting accepted, or (decline) their invitation, meeting or request refused. */
      accept: (ref: string) => { const it = this.byId<InviteItem>(ref, 'invite')?.[1] ?? this.byId<MeetItem>(ref, 'meet')?.[1]; if (it && it.state === 'open') { it.state = 'accepted'; this.changed(); } return !!it; },
      decline: (ref: string) => { const it = this.byId<InviteItem>(ref, 'invite')?.[1] ?? this.byId<MeetItem>(ref, 'meet')?.[1] ?? this.byId<AskItem>(ref, 'ask')?.[1]; if (it && it.state === 'open') { it.state = 'declined'; this.changed(); } return !!it; },
      /** Cancels their own request or meeting, or revokes their invitation (a guest inside is taken out). */
      cancel: (ref: string) => {
        const a = this.byId<AskItem>(ref, 'ask')?.[1], m = this.byId<MeetItem>(ref, 'meet')?.[1], v = this.byId<InviteItem>(ref, 'invite')?.[1];
        if (a && a.state === 'open') a.state = 'cancelled';
        if (m && (m.state === 'open' || m.state === 'accepted')) m.state = 'cancelled';
        if (v && (v.state === 'open' || v.state === 'accepted')) { v.state = 'revoked'; for (const fn of this.ends) fn(p.tag, v.id); }
        this.changed();
      },
      counter: (ref: string, when: number, place?: PlaceRef) => { const m = mineOrTheirs<MeetItem>(ref, 'meet'); return s.meet(place ?? m.place, when, undefined, ref); },
      payAsk: (ref: string) => { const a = mineOrTheirs<AskItem>(ref, 'ask'); return s.pay(a.amount, undefined, ref); },
      here: (ref: string) => this.arrive(ref, p.tag),
      seen: (v: 'online' | number | 'never') => { p.seen = v; this.changed(); },
      blockMe: (on: boolean) => { p.blockedMe = on; },
      setHome: (snap: HomeSnapshot | null) => { p.home = snap; },
      /** `n` older texts before the conversation's first item (read, both sides, 3 min apart): a long history to page through with `more`. */
      backlog: (n: number) => {
        const c = this.conv.get(p.tag) ?? { items: [], unread: 0, shown: 0 }; this.conv.set(p.tag, c);
        const first = c.items[0]?.at ?? at();
        const old: ItemView[] = Array.from({ length: n }, (_, k) => ({ id: `old-${p.tag.slice(0, 4)}-${String(k).padStart(4, '0')}`, from: k % 3 ? p.tag : this.me!.tag, at: first - (n - k) * 180_000, k: 'text', text: `Message ancien n° ${k + 1}` }));
        c.items.unshift(...old); this.changed();
      },
    };
    return s;
  }
  /** The demo's conversations, relative to now: yesterday's chat with Awa (her last line unread) and a payment to Moussa two days ago. */
  private seedDemo(now: number) {
    const me = this.me!.tag, awa = 'a11ce0000000a001', moussa = 'b0b0000000000b02', H = 3600_000;
    const seed = (tag: Tag, items: Item[], unread: number) => { this.conv.set(tag, { items, unread, shown: Math.min(items.length, this.opts.page ?? 40) }); };
    seed(moussa, [
      { id: 'seed-m1', from: moussa, at: now - 50 * H, k: 'text', text: 'Grand, tu peux m’avancer le taxi pour Sandaga ?' },
      { id: 'seed-m2', from: me, at: now - 49.9 * H, k: 'pay', amount: 2_000, op: 'seed-m2', note: 'Pour le taxi' },
      { id: 'seed-m3', from: moussa, at: now - 49.8 * H, k: 'text', text: 'Jërëjëf ! Je te rends ça samedi.' },
    ], 0);
    seed(awa, [
      { id: 'seed-a1', from: awa, at: now - 26 * H, k: 'text', text: 'Salaam ! Tu viens au match de la Corniche demain ?' },
      { id: 'seed-a2', from: me, at: now - 25.9 * H, k: 'text', text: 'Inchallah, je serai là 👍' },
      { id: 'seed-a3', from: awa, at: now - 40 * 60_000, k: 'text', text: 'On se retrouve où tout à l’heure ?' },
    ], 1);
    this.ops.push({ id: 'seed-m2', kind: 'pay', at: now - 49.9 * H, amount: 2_000, from: me, to: moussa, note: 'Pour le taxi' }, { id: 'seed-f1', kind: 'fund', at: now - 51 * H, amount: 5_000 });
  }
}

export function createFakeOnline(opts: FakeOnlineOpts = {}): FakeOnline { return new FakeOnline(opts); }

/** `?debug&fakeonline`: the only way a build without the server shows the online features (always labelled « simulé »). */
export function fakeOnlineRequested(search = typeof location !== 'undefined' ? location.search : ''): boolean {
  const q = new URLSearchParams(search); return q.has('debug') && q.has('fakeonline');
}

/** Places, a home and a position for the world's hooks (onlineHooks) when the world lane did not provide them: debug checks only. Records « Y aller ». */
export function stubWorld(goes: unknown[] = []) {
  const places: PlaceRef[] = [
    { id: 'corniche:pitch', hub: 'corniche', name: 'Terrain de la Corniche', icon: '⚽' },
    { id: 'pikine:arena', hub: 'pikine', name: 'Arène de Pikine', icon: '🤼' },
    { id: 'plateau:gargote', hub: 'plateau', name: 'Gargote Chez Fatou', icon: '🍲' },
    { id: 'almadies:vague', hub: 'almadies', name: 'La Vague', icon: '🌊' },
  ];
  onlineHooks.homeToInvite ??= () => ({ spec: 'chambre_famille', hub: 'pikine', door: 'pikine:home:door', name: 'Ta chambre chez la famille · Pikine' });
  onlineHooks.homeSnapshot ??= () => ({ home: onlineHooks.homeToInvite!()!, upgrades: [], furniture: [], at: Date.now() });
  onlineHooks.hereNow ??= () => ({ hub: 'pikine', x: 12, z: -40, name: 'Marché de Pikine' });
  onlineHooks.meetupPlaces ??= () => places;
  onlineHooks.goToPlace ??= place => { goes.push({ to: 'place', id: place.id }); };
  onlineHooks.goToLocation ??= loc => { goes.push({ to: 'loc', name: loc.name }); };
  onlineHooks.goToInvite ??= (host, inv) => { goes.push({ to: 'invite', host, id: inv.id }); };
  return goes;
}

/** Installs the fake as the build's account (setOnline) and, under ?debug, its script as `window.__dakarOnline`. */
export function installFakeOnline(opts: FakeOnlineOpts = {}): FakeOnline {
  const f = createFakeOnline(opts);
  setOnline(f);
  if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
    const goes: unknown[] = [];
    (window as unknown as Record<string, unknown>).__dakarOnline = {
      api: f, as: (who: string) => f.as(who), status: (s: OnlineStatus) => f.setStatus(s), failNext: (r: string, t?: string) => f.failNext(r, t),
      money: (o: Parameters<FakeOnline['setMoney']>[0]) => f.setMoney(o), addPeer: (p: FakePeerInit) => f.addPeer(p),
      stubWorld: () => stubWorld(goes), goes, hooks: onlineHooks,
      info: () => ({ status: f.status, me: f.me, balance: f.balance, limits: f.limits, today: f.today, unread: f.unread(), convs: f.convs(), ops: f.ops.length, calls: f.calls, reports: f.reports, wallet: opts.wallet?.get() ?? null }),
      items: (tag: string) => f.items(tag), last: (tag: string, k?: string) => f.items(tag).filter(i => !k || i.k === k).pop() ?? null,
    };
  }
  return f;
}

/**
 * The phone's own fallback: the Messages and Argent screens call this when they open, so a `?debug&fakeonline` build shows the online features even before
 * main.ts installs anything. A no-op when an account is already installed (the real client, or main's fake) or when the flag is absent.
 */
export function ensureFakeOnline(ctx: { state: { wallet: number; addMoney(n: number, label?: string): number }; now: () => number; save: () => boolean }, name?: string) {
  if (online || !fakeOnlineRequested()) return;
  installFakeOnline({ now: ctx.now, wallet: { get: () => ctx.state.wallet, add: (n, label) => { ctx.state.addMoney(n, label); } }, save: () => { ctx.save(); }, me: { name } });
}
