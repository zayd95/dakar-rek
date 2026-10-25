import type { GameState } from '../core/state';
import type { HubId } from '../core/types';
import { cleanChatText } from '../multiplayer/chatRules';
import { appearanceCode, lookIndex, nickname } from '../multiplayer/protocol';
import { noteBalance, onlineKnown, pendingFor, quotePay, reserveOnline, settleOnline } from '../economy/money';
import { ONLINE_PROTOCOL, NOTE_MAX, SNAPSHOT_MAX, friendCode, isItem, isTag, parseServerMessage, parseSnapshot, shortText, tagOfCode,
  type ClientMessage, type ConvSummary, type Francs, type FriendCode, type GuestPerms, type HomeSnapshot, type InviteItem, type Item, type LedgerOp, type MeetItem,
  type MoneyLimits, type PlaceRef, type ServerMessage, type Tag } from './protocol';
import { onlineHooks, type ItemView, type OnlineApi, type OnlineStatus, type Outcome, type PayQuote } from './api';
import { refusalText } from './accountRules';

/**
 * LD2.0-B: the player's online account on this device (docs/ld2/LD2_B_CONTRACT.md), the `OnlineApi` the Messages app (lane M) and the visits and
 * meetups (lane H) use. One WebSocket to `/api/me` beside presence's, reconnected quietly with a back-off (as src/multiplayer/client.ts PresenceClient).
 *
 *   – What the list and the conversations show comes from a bounded local copy (`dakarrek.online.v1`): instant at start, readable offline. The server's
 *     answers replace it; the device never decides a balance, a request's, an invitation's or a meeting's state.
 *   – Text and locations are shown at once (« sending ») and kept in an outbox: sent again with the same id after a reconnect or a reload (the server
 *     keeps them once), until the server answers. A refusal is shown (« failed ») and never sent again by itself.
 *   – Money: the device's side (src/economy/money.ts). The wallet part of a top-up or a send is reserved and the game saved before anything is sent; the
 *     server's yes closes it, its no gives it back, once; without an answer the same id goes again at the next connection.
 *   – A build without the server (`enabled` false) is 'solo': nothing is sent, every request says so.
 */
export interface OnlineDeps {
  state: GameState;
  /** Writes the save now, synchronously; false when the storage refused it (money then is neither sent nor debited). */
  saveNow: () => boolean;
  /** The name, colour and studio look others see (presence's profile, src/multiplayer/client.ts). */
  profile: () => { name: string; look: number; app?: string | null };
  /** The account endpoint (default: `/api/me` on the page's origin). */
  endpoint?: string;
  enabled: boolean;
  storage?: Storage | null;
}

export const CACHE_KEY = 'dakarrek.online.v1';
/** The legacy chat panel's local list (src/multiplayer/chat.ts): its blocks are sent to the account at the first connection. */
const CHAT_KEY = 'dakarrek.chat.v1';
const DEVICE_KEY = 'dakarrek.chat.key';
const CONVS_MAX = 60, ITEMS_PER_CONV = 120, REQUEST_MS = 15_000, MONEY_WAIT_MS = 15_000, RESEND_GAP_MS = 1_100;
/** Frames sent per second at most: the account closes a socket past 20 (server/social.ts), so a burst (a list asking who is online) waits its turn. */
const SEND_RATE = 15;
type Today = { funded: Francs; sent: Francs; received: Francs };
type Seen = 'online' | number | 'never';
type OutMsg = Extract<ClientMessage, { type: 'say' | 'loc' }>;
interface Cache {
  v: 1; tag: Tag | null; code: FriendCode | null; limits: MoneyLimits | null; today: Today | null;
  convs: ConvSummary[]; items: Record<Tag, ItemView[]>; more: Record<Tag, boolean>;
  /** Text and locations not answered yet (resent with the same id). */
  outbox: OutMsg[];
  blocked: Tag[];
  /** Blocks changed on this device and not yet acknowledged by the account (sent again at each connection). */
  blockSync: { id: string; tag: Tag; on: boolean }[];
  /** The legacy chat panel's blocks were handed to the account. */
  migrated: boolean;
  /** Meetings this player was already « here » at (sent once each). */
  here: string[];
  names: Record<Tag, { name: string; look: number; app?: string }>;
}
const emptyCache = (): Cache => ({ v: 1, tag: null, code: null, limits: null, today: null, convs: [], items: {}, more: {}, outbox: [], blocked: [], blockSync: [], migrated: false, here: [], names: {} });

export class OnlineAccount implements OnlineApi {
  status: OnlineStatus;
  private cache: Cache;
  private socket: WebSocket | null = null;
  private retry = 0; private handshake = 0; private heartbeat = 0; private homeTimer = 0; private retryAttempt = 0; private generation = 0; private lastPong = 0;
  private clockOffset = 0; private live = false;
  private where: { hub: HubId | null; room: number } = { hub: null, room: 0 };
  private seenMap = new Map<Tag, Seen>();
  private asked = new Set<Tag>();
  private waiters = new Map<string, { list: ((m: ServerMessage | null) => void)[]; timer: number }>();
  private moneyWaiters = new Map<string, ((o: Outcome<{ op: LedgerOp }>) => void)[]>();
  private moneyDone = new Map<string, Outcome<{ op: LedgerOp }>>();
  private convWaiters = new Map<Tag, ((more: boolean) => void)[]>();
  private historyWaiters: ((m: { ops: LedgerOp[]; more: boolean } | null) => void)[] = [];
  private listeners = new Set<() => void>();
  private visitListeners = new Set<(host: Tag, invite: string) => void>();
  private saveT = 0; private lastHome = '';
  private sentAt: number[] = []; private backlog: string[] = []; private backlogT = 0;

  constructor(private d: OnlineDeps) {
    this.cache = this.load();
    this.status = d.enabled ? 'connecting' : 'solo';
    if (!d.enabled) return;
    addEventListener('online', () => { if (this.status !== 'online') { this.retryAttempt = 0; this.open(); } });
    addEventListener('offline', () => { this.stopSocket(); this.setStatus('offline'); });
    addEventListener('pagehide', () => { this.persistNow(); this.stopSocket(); });
    addEventListener('pageshow', e => { if (e.persisted) this.open(); });
    this.open();
  }

  // ================================================================== OnlineApi: state
  get me() { const tag = this.cache.tag ?? this.d.state.data.online.tag; return tag ? { tag, code: this.cache.code ?? friendCode(tag) } : null; }
  get balance() { const o = this.d.state.data.online; return o.balance === null ? null : { amount: o.balance, at: o.at, fresh: this.status === 'online' && this.live }; }
  get limits() { return this.cache.limits; }
  get today() { return this.cache.today; }
  /** The server's clock (ms), as the last welcome gave it: meeting times are server times. */
  serverNow() { return Date.now() + this.clockOffset; }

  convs(): ConvSummary[] {
    const at = (c: ConvSummary) => Math.max(c.last?.at ?? 0, ...(this.cache.items[c.with] ?? []).map(i => i.at));
    return this.cache.convs.map(c => {
      const own = (this.cache.items[c.with] ?? []).reduce<ItemView | null>((n, i) => (!n || i.at >= n.at ? i : n), null);
      const last = own && (!c.last || own.at >= c.last.at) ? stripView(own) : c.last;
      return { ...c, last, blocked: this.isBlocked(c.with), seen: this.seenMap.get(c.with) ?? c.seen };
    }).sort((a, b) => at(b) - at(a));
  }
  items(withTag: Tag): ItemView[] {
    if (!this.asked.has(withTag) && this.status === 'online') { this.asked.add(withTag); this.sendRaw({ type: 'conv', with: withTag }); }
    return [...(this.cache.items[withTag] ?? [])].sort((a, b) => a.at - b.at);
  }
  more(withTag: Tag): Promise<boolean> {
    if (this.status !== 'online') return Promise.resolve(this.cache.more[withTag] ?? false);
    const oldest = (this.cache.items[withTag] ?? []).filter(i => !i.status).reduce((m, i) => Math.min(m, i.at), Infinity);
    return new Promise(resolve => {
      const list = this.convWaiters.get(withTag) ?? []; list.push(resolve); this.convWaiters.set(withTag, list);
      this.sendRaw({ type: 'conv', with: withTag, ...(Number.isFinite(oldest) ? { before: oldest } : {}) });
      setTimeout(() => { const l = this.convWaiters.get(withTag); const i = l?.indexOf(resolve) ?? -1; if (i >= 0) { l!.splice(i, 1); resolve(false); } }, REQUEST_MS);
    });
  }
  read(withTag: Tag) {
    const c = this.cache.convs.find(x => x.with === withTag);
    if (c && c.unread) { c.unread = 0; this.changed(); }
    this.sendRaw({ type: 'read', with: withTag });
  }
  unread() { return this.cache.convs.reduce((n, c) => n + (this.isBlocked(c.with) ? 0 : c.unread), 0); }
  seen(tag: Tag): Seen | null {
    const s = this.seenMap.get(tag) ?? this.cache.convs.find(c => c.with === tag)?.seen ?? null;
    if (s === null && this.status === 'online' && !this.asked.has(tag)) { this.asked.add(tag); this.sendRaw({ type: 'conv', with: tag }); }
    return this.seenMap.get(tag) ?? s;
  }

  // ================================================================== OnlineApi: text and places
  newId(): string {
    const c = globalThis.crypto as Crypto | undefined;
    if (c && 'randomUUID' in c) return c.randomUUID();
    return [...Array(4)].map(() => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('-');
  }
  say(to: Tag, text: string): Outcome<{ id: string }> {
    const c = cleanChatText(text);
    if (!c.ok) return this.no(c.reason === 'too-long' ? 'too-large' : 'empty');
    return this.queue(to, id => ({ type: 'say', id, to, text: c.text }), (id, from, at) => ({ id, k: 'text', from, at, text: c.text }));
  }
  shareLocation(to: Tag): Outcome<{ id: string }> {
    const here = onlineHooks.hereNow?.();
    const name = here ? shortText(here.name, 60) ?? 'Ici' : null;
    if (!here || !name) return this.no('no-place');
    const x = Math.round(here.x * 100) / 100, z = Math.round(here.z * 100) / 100;
    return this.queue(to, id => ({ type: 'loc', id, to, hub: here.hub, x, z, name }), (id, from, at) => ({ id, k: 'loc', from, at, hub: here.hub, x, z, name }));
  }
  /** Shown at once as « sending », kept in the outbox, sent now or at the next connection (same id). */
  private queue(to: Tag, msg: (id: string) => OutMsg, view: (id: string, from: Tag, at: number) => Item): Outcome<{ id: string }> {
    if (!this.d.enabled) return this.no('solo');
    const me = this.me; if (!me) return this.no('offline');
    if (!isTag(to)) return this.no('invalid');
    if (to === me.tag) return this.no('self');
    if (this.isBlocked(to)) return this.no('blocked');
    const id = this.newId(), m = msg(id);
    this.upsert(to, { ...view(id, me.tag, this.serverNow()), status: 'sending' });
    this.cache.outbox.push(m);
    this.changed();
    this.sendRaw(m);
    return { ok: true, id };
  }

  // ================================================================== OnlineApi: money
  payQuote(amount: Francs): PayQuote {
    return quotePay(amount, { balance: this.d.state.data.online.balance, wallet: this.d.state.data.wallet, limits: this.cache.limits, today: this.cache.today, online: this.status === 'online' });
  }
  pay(o: { id: string; to: Tag; amount: Francs; note?: string; req?: string }): Promise<Outcome<{ op: LedgerOp }>> {
    const again = this.moneyAgain(o.id); if (again) return again;
    const q = this.payQuote(o.amount);
    if (q.refusal) return Promise.resolve(this.no(q.refusal));
    const me = this.me!;
    if (!isTag(o.to)) return Promise.resolve(this.no('invalid'));
    if (o.to === me.tag) return Promise.resolve(this.no('self'));
    const note = o.note === undefined || o.note === '' ? undefined : shortText(o.note, NOTE_MAX);
    if (note === null) return Promise.resolve(this.no('too-large'));
    return this.money({ id: o.id, kind: 'pay', amount: o.amount, fund: q.fromWallet, to: o.to, ...(note ? { note } : {}), ...(o.req ? { req: o.req } : {}), tag: me.tag });
  }
  fund(o: { id: string; amount: Francs }): Promise<Outcome<{ op: LedgerOp }>> {
    const again = this.moneyAgain(o.id); if (again) return again;
    const bad = this.moneyCheck(o.amount); if (bad) return Promise.resolve(this.no(bad));
    const t = this.cache.today, L = this.cache.limits!, have = this.d.state.data.online.balance ?? 0;
    if (o.amount > this.d.state.data.wallet) return Promise.resolve(this.no('insufficient'));
    if (t && t.funded + o.amount > L.fundDayMax) return Promise.resolve(this.no('limit-fund'));
    if (have + o.amount > L.balanceMax) return Promise.resolve(this.no('limit-balance'));
    return this.money({ id: o.id, kind: 'fund', amount: o.amount, fund: o.amount, tag: this.me!.tag });
  }
  cashout(o: { id: string; amount: Francs }): Promise<Outcome<{ op: LedgerOp }>> {
    const again = this.moneyAgain(o.id); if (again) return again;
    const bad = this.moneyCheck(o.amount); if (bad) return Promise.resolve(this.no(bad));
    if (o.amount > (this.d.state.data.online.balance ?? 0)) return Promise.resolve(this.no('insufficient'));
    return this.money({ id: o.id, kind: 'cashout', amount: o.amount, fund: 0, tag: this.me!.tag });
  }
  private moneyCheck(amount: Francs) {
    if (!this.d.enabled) return 'solo';
    if (!Number.isSafeInteger(amount) || amount <= 0) return 'amount';
    if (this.status !== 'online' || !this.cache.limits || !this.me) return 'offline';
    return amount > this.cache.limits.opMax ? 'limit-op' : null;
  }
  /** A confirmation tapped twice (the same id): the same answer, never a second operation. */
  private moneyAgain(id: string): Promise<Outcome<{ op: LedgerOp }>> | null {
    const done = this.moneyDone.get(id); if (done) return Promise.resolve(done);
    if (this.moneyWaiters.has(id) || this.d.state.data.online.pending.some(p => p.id === id)) return this.waitMoney(id);
    if (onlineKnown(this.d.state, id)) return Promise.resolve(this.no('closed'));
    return null;
  }
  /** Reserve (the wallet part, the pending entry, the save written), then send; the answer settles it (src/economy/money.ts). */
  private money(p: Parameters<typeof reserveOnline>[1]): Promise<Outcome<{ op: LedgerOp }>> {
    const r = reserveOnline(this.d.state, p, this.d.saveNow, Date.now());
    if (!r.ok) return Promise.resolve(this.no(r.why === 'duplicate' ? 'closed' : r.why === 'busy' ? 'rate-limited' : r.why));
    const waiting = this.waitMoney(p.id);
    this.sendMoney(r.pending);
    this.changed();
    return waiting;
  }
  private waitMoney(id: string): Promise<Outcome<{ op: LedgerOp }>> {
    return new Promise(resolve => {
      const list = this.moneyWaiters.get(id) ?? []; list.push(resolve); this.moneyWaiters.set(id, list);
      setTimeout(() => {                                         // no answer yet: said as such (the op stays pending and is settled when the answer comes)
        const l = this.moneyWaiters.get(id), i = l?.indexOf(resolve) ?? -1;
        if (i >= 0) { l!.splice(i, 1); if (!l!.length) this.moneyWaiters.delete(id); resolve(this.no('pending')); }
      }, MONEY_WAIT_MS);
    });
  }
  private sendMoney(p: { id: string; kind: 'fund' | 'cashout' | 'pay'; amount: number; fund: number; to?: string; note?: string; req?: string }) {
    if (p.kind === 'pay') this.sendRaw({ type: 'pay', id: p.id, to: p.to!, amount: p.amount, fund: p.fund, ...(p.note ? { note: p.note } : {}), ...(p.req ? { req: p.req } : {}) });
    else this.sendRaw({ type: p.kind, id: p.id, amount: p.amount });
  }
  /** The server's answer to a money op of this device: settled once (refund, withdrawal credit), saved at once, told to whoever waits. */
  private moneyAnswer(m: Extract<ServerMessage, { type: 'ack' }>) {
    const pending = this.d.state.data.online.pending.find(p => p.id === m.id);
    if (!pending && !this.moneyWaiters.has(m.id)) return false;
    if (!m.ok && m.reason === 'offline') return true;             // undecided on the server: kept, sent again at the next connection
    const r = settleOnline(this.d.state, m.id, m.ok ? { ok: true, ...(typeof m.balance === 'number' ? { balance: m.balance } : {}) } : { ok: false });
    if (r !== 'none' || m.ok) this.d.saveNow();
    const out: Outcome<{ op: LedgerOp }> = m.ok ? (m.op ? { ok: true, op: m.op } : this.no('invalid')) : this.no(m.reason);
    if (m.ok && m.item) this.upsert(m.op?.to ?? m.item.from, m.item);
    this.moneyDone.set(m.id, out);
    for (const fn of this.moneyWaiters.get(m.id) ?? []) fn(out);
    this.moneyWaiters.delete(m.id);
    this.changed();
    return true;
  }
  ask(o: { id: string; to: Tag; amount: Francs; note?: string }): Promise<Outcome<{ item: Item }>> {
    const bad = this.moneyCheck(o.amount); if (bad) return Promise.resolve(this.no(bad));
    const note = o.note ? shortText(o.note, NOTE_MAX) : undefined;
    if (note === null) return Promise.resolve(this.no('too-large'));
    return this.itemRequest({ type: 'ask', id: o.id, to: o.to, amount: o.amount, ...(note ? { note } : {}) }, o.to);
  }
  closeAsk(o: { id: string; ref: string; how: 'declined' | 'cancelled' }): Promise<Outcome> { return this.itemRequest({ type: 'ask-close', ...o }); }
  history(before?: number): Promise<Outcome<{ ops: LedgerOp[]; more: boolean }>> {
    if (!this.d.enabled) return Promise.resolve(this.no('solo'));
    if (this.status !== 'online') return Promise.resolve(this.no('offline'));
    return new Promise(resolve => {
      const done = (m: { ops: LedgerOp[]; more: boolean } | null) => { clearTimeout(timer); resolve(m ? { ok: true, ops: m.ops, more: m.more } : this.no('timeout')); };
      const timer = window.setTimeout(() => { const i = this.historyWaiters.indexOf(done); if (i >= 0) this.historyWaiters.splice(i, 1); done(null); }, REQUEST_MS);
      this.historyWaiters.push(done);
      this.sendRaw({ type: 'history', ...(before !== undefined ? { before } : {}) });
    });
  }

  // ================================================================== OnlineApi: homes and meetings
  invite(o: { id: string; to: Tag; perms: GuestPerms }): Promise<Outcome<{ item: InviteItem }>> {
    const raw = onlineHooks.homeSnapshot?.() ?? null;
    if (!raw) return Promise.resolve(this.no('no-home'));
    const snapshot = parseSnapshot(raw);                         // the server's shape and size, said before anything is sent
    if (!snapshot) return Promise.resolve(this.no(JSON.stringify(raw).length > SNAPSHOT_MAX ? 'too-large' : 'invalid'));
    this.lastHome = JSON.stringify(snapshot);
    return this.itemRequest({ type: 'invite', id: o.id, to: o.to, snapshot, perms: o.perms }, o.to) as Promise<Outcome<{ item: InviteItem }>>;
  }
  answerInvite(o: { id: string; ref: string; accept: boolean }): Promise<Outcome> { return this.itemRequest({ type: 'invite-answer', ...o }); }
  revokeInvite(o: { id: string; ref: string }): Promise<Outcome> { return this.itemRequest({ type: 'invite-revoke', ...o }); }
  async visit(host: Tag): Promise<Outcome<{ snapshot: HomeSnapshot; perms: GuestPerms; invite: string }>> {
    const pre = this.ready(); if (pre) return pre;
    const r = await this.request({ type: 'visit', id: this.newId(), host });
    if (!r) return this.no('timeout');
    if (r.type === 'visit') return r.ok && r.snapshot && r.perms && r.invite ? { ok: true, snapshot: r.snapshot, perms: r.perms, invite: r.invite } : this.no(r.reason ?? 'no-invite');
    return this.no(r.type === 'ack' && !r.ok ? r.reason : 'invalid');
  }
  meet(o: { id: string; to: Tag; place: PlaceRef; when: number; note?: string; counter?: string }): Promise<Outcome<{ item: MeetItem }>> {
    const note = o.note ? shortText(o.note, NOTE_MAX) : undefined;
    if (note === null) return Promise.resolve(this.no('too-large'));
    return this.itemRequest({ type: 'meet', id: o.id, to: o.to, place: o.place, when: Math.max(0, Math.round(o.when)), ...(note ? { note } : {}), ...(o.counter ? { counter: o.counter } : {}) }, o.to) as Promise<Outcome<{ item: MeetItem }>>;
  }
  answerMeet(o: { id: string; ref: string; accept: boolean }): Promise<Outcome> { return this.itemRequest({ type: 'meet-answer', ...o }); }
  cancelMeet(o: { id: string; ref: string }): Promise<Outcome> { return this.itemRequest({ type: 'meet-cancel', ...o }); }
  here(ref: string) {
    if (this.cache.here.includes(ref) || this.status !== 'online') return;
    void this.itemRequest({ type: 'meet-here', id: this.newId(), ref }).then(r => {
      if (r.ok && !this.cache.here.includes(ref)) { this.cache.here.push(ref); if (this.cache.here.length > 100) this.cache.here.shift(); this.persist(); }
    });
  }

  // ================================================================== OnlineApi: privacy, lookups
  block(tag: Tag, on: boolean): Promise<Outcome> {
    if (!this.d.enabled) return Promise.resolve(this.no('solo'));
    if (!isTag(tag)) return Promise.resolve(this.no('invalid'));
    const id = this.newId();
    this.cache.blocked = this.cache.blocked.filter(t => t !== tag); if (on) this.cache.blocked.push(tag);
    this.cache.blockSync = [...this.cache.blockSync.filter(b => b.tag !== tag), { id, tag, on }];
    this.changed();
    if (this.status !== 'online') return Promise.resolve({ ok: true });   // kept on this device and given to the account at the next connection
    return this.request({ type: 'block', id, tag, on }).then(r => {
      if (r?.type === 'ack' && r.ok) { this.cache.blockSync = this.cache.blockSync.filter(b => b.id !== id); this.persist(); }
      return { ok: true } as Outcome;
    });
  }
  isBlocked(tag: Tag) { return this.cache.blocked.includes(tag); }
  report(tag: Tag, reason: 'insulte' | 'harcelement' | 'arnaque' | 'autre'): Promise<Outcome> { return this.itemRequest({ type: 'report', id: this.newId(), tag, reason }); }
  async forget(withTag: Tag): Promise<Outcome> {
    const r = await this.itemRequest({ type: 'forget', id: this.newId(), with: withTag });
    if (r.ok) { this.cache.convs = this.cache.convs.filter(c => c.with !== withTag); delete this.cache.items[withTag]; delete this.cache.more[withTag]; this.cache.outbox = this.cache.outbox.filter(m => m.to !== withTag); this.changed(); }
    return r;
  }
  async lookup(code: FriendCode): Promise<Outcome<{ tag: Tag; name: string; look: number; app?: string }>> {
    if (!tagOfCode(code)) return this.no('code');
    const pre = this.ready(); if (pre) return pre;
    const r = await this.request({ type: 'lookup', id: this.newId(), code });
    if (!r) return this.no('timeout');
    if (r.type !== 'lookup') return this.no(r.type === 'ack' && !r.ok ? r.reason : 'invalid');
    if (!r.tag) return this.no('unknown-recipient');
    const p = { name: nickname(r.name), look: lookIndex(r.look), ...(appearanceCode(r.app) ? { app: r.app } : {}) };
    this.cache.names[r.tag] = p; this.persist();
    return { ok: true, tag: r.tag, ...p };
  }
  async find(tag: Tag): Promise<Outcome<{ hub: HubId | null; room: number }>> {
    const pre = this.ready(); if (pre) return pre;
    const r = await this.request({ type: 'find', id: this.newId(), tag });
    if (!r) return this.no('timeout');
    if (r.type === 'find') return { ok: true, hub: r.hub, room: r.room };
    return this.no(r.type === 'ack' && !r.ok ? r.reason : 'invalid');
  }
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onVisitEnd(fn: (host: Tag, invite: string) => void) { this.visitListeners.add(fn); return () => { this.visitListeners.delete(fn); }; }

  // ================================================================== for main.ts
  /** Where this client is (presence's hub and room): told to its own account only, so a friend with an accepted visit or meeting can find it. */
  setWhere(hub: HubId | null, room: number) {
    const w = { hub, room: Number.isInteger(room) && room >= 0 ? room : 0 };
    if (w.hub === this.where.hub && w.room === this.where.room) return;
    this.where = w;
    this.sendRaw({ type: 'where', ...w });
  }
  /** The name, colour or look changed: the account learns it at the next connection (now, when online). */
  profileChanged() { if (this.d.enabled && this.socket) { this.retryAttempt = 0; this.open(); } }

  // ================================================================== requests
  private no(reason: string): { ok: false; reason: string; text: string } {
    return { ok: false, reason, text: refusalText(reason, this.cache.limits ?? { opMax: 250_000, fundDayMax: 500_000, sendDayMax: 500_000, receiveDayMax: 1_000_000, balanceMax: 5_000_000 }) };
  }
  private ready(): { ok: false; reason: string; text: string } | null { return !this.d.enabled ? this.no('solo') : this.status !== 'online' ? this.no('offline') : null; }
  /**
   * Sends a request with an id and resolves with its answer (null: no answer in time, or not sent). The same id asked again while it is on its way (a
   * double tap) is not sent twice: both get the one answer.
   */
  private request(m: Extract<ClientMessage, { id: string }>): Promise<ServerMessage | null> {
    const on = this.waiters.get(m.id);
    if (on) return new Promise(resolve => on.list.push(resolve));
    return new Promise(resolve => {
      if (!this.sendRaw(m)) { resolve(null); return; }
      const timer = window.setTimeout(() => { const w = this.waiters.get(m.id); if (w?.timer === timer) { this.waiters.delete(m.id); for (const fn of w.list) fn(null); } }, REQUEST_MS);
      this.waiters.set(m.id, { list: [resolve], timer });
    });
  }
  /** A request answered by an `ack` (maybe with the item's new state, kept in its conversation). */
  private async itemRequest(m: Extract<ClientMessage, { id: string }>, to?: Tag): Promise<Outcome<{ item: Item }>> {
    const pre = this.ready(); if (pre) return pre;
    const r = await this.request(m);
    if (!r) return this.no('timeout');
    if (r.type !== 'ack') return this.no('invalid');
    if (!r.ok) return this.no(r.reason);
    if (r.item) this.upsert(this.peerOf(r.item, to), r.item);
    this.changed();
    return { ok: true, ...(r.item ? { item: r.item } : {}) } as Outcome<{ item: Item }>;
  }
  /** The conversation an item belongs to: the other player (its author), or for one of ours the conversation already holding it. */
  private peerOf(item: Item, to?: Tag): Tag {
    const me = this.me?.tag;
    if (item.from !== me) return item.from;
    if (to) return to;
    for (const [peer, list] of Object.entries(this.cache.items)) if (list.some(i => i.id === item.id)) return peer;
    return item.from;
  }
  private sendRaw(m: ClientMessage): boolean {
    if (this.status !== 'online' || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.backlog.push(JSON.stringify(m));
    this.drain();
    return true;
  }
  /** Sends what waits, never more than SEND_RATE frames in a second (the rest goes a little later, in order). */
  private drain() {
    clearTimeout(this.backlogT); this.backlogT = 0;
    const now = Date.now();
    this.sentAt = this.sentAt.filter(t => now - t < 1000);
    while (this.backlog.length && this.sentAt.length < SEND_RATE) {
      if (this.socket?.readyState !== WebSocket.OPEN) { this.backlog = []; return; }
      try { this.socket.send(this.backlog.shift()!); } catch { this.backlog = []; return; }
      this.sentAt.push(now);
    }
    if (this.backlog.length) this.backlogT = window.setTimeout(() => this.drain(), Math.max(20, 1000 - (now - this.sentAt[0])));
  }

  // ================================================================== the socket
  private open() {
    this.stopSocket();
    if (!this.d.enabled) return;
    if (!navigator.onLine) { this.setStatus('offline'); return; }
    const key = deviceKey(this.d.storage ?? null);
    if (!key) { this.setStatus('offline'); return; }
    const generation = this.generation;
    this.setStatus(this.retryAttempt ? 'reconnecting' : 'connecting');
    const p = this.d.profile();
    const url = new URL(this.d.endpoint || '/api/me', location.href);
    url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
    url.searchParams.set('key', key); url.searchParams.set('name', nickname(p.name)); url.searchParams.set('look', String(lookIndex(p.look)));
    const app = appearanceCode(p.app); if (app) url.searchParams.set('app', app);
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { this.scheduleRetry(); return; }
    this.socket = ws;
    this.handshake = window.setTimeout(() => { if (generation === this.generation && this.socket === ws) this.scheduleRetry(); }, 8000);
    ws.onmessage = e => {
      if (generation !== this.generation) return;
      if (e.data === 'pong') { this.lastPong = Date.now(); return; }
      let raw: unknown; try { raw = JSON.parse(e.data as string); } catch { return; }
      const m = parseServerMessage(raw); if (m) this.onMessage(m, ws);
    };
    ws.onclose = () => { if (generation === this.generation) this.scheduleRetry(); };
    ws.onerror = () => { /* the close drives the retry; nothing local depends on it */ };
  }
  private scheduleRetry() {
    this.stopSocket(); this.setStatus(navigator.onLine ? 'reconnecting' : 'offline');
    if (!navigator.onLine) return;
    const delay = Math.min(15000, 600 * 2 ** Math.min(this.retryAttempt++, 5)) + Math.random() * 300;
    this.retry = window.setTimeout(() => this.open(), delay);
  }
  private stopSocket() {
    this.generation++; clearTimeout(this.retry); clearTimeout(this.handshake); clearInterval(this.heartbeat); clearInterval(this.homeTimer); clearTimeout(this.backlogT);
    this.backlog = []; this.sentAt = [];                         // what was waiting is sent again from the outboxes at the next welcome
    this.retry = this.handshake = this.heartbeat = this.homeTimer = 0; this.live = false;
    if (this.socket) { this.socket.onclose = null; try { this.socket.close(); } catch { /* closed */ } this.socket = null; }
    for (const [, w] of this.waiters) { clearTimeout(w.timer); for (const fn of w.list) fn(null); }
    this.waiters.clear();
    this.asked.clear();
  }
  private setStatus(s: OnlineStatus) { if (this.status !== s) { this.status = s; this.emit(); } }

  private onMessage(m: ServerMessage, ws: WebSocket) {
    if (m.type === 'welcome') { this.welcome(m, ws); return; }
    if (m.type === 'ack') {
      if (this.moneyAnswer(m)) return;
      if (this.outboxAnswer(m)) return;
    }
    if ((m.type === 'ack' || m.type === 'visit' || m.type === 'lookup' || m.type === 'find') && this.waiters.has(m.id)) {
      const w = this.waiters.get(m.id)!; this.waiters.delete(m.id); clearTimeout(w.timer); for (const fn of w.list) fn(m); return;
    }
    switch (m.type) {
      case 'item': {
        const fresh = !this.cache.items[m.with]?.some(i => i.id === m.item.id);
        if (m.name !== undefined) this.cache.names[m.with] = { name: nickname(m.name), look: lookIndex(m.look), ...(appearanceCode(m.app) ? { app: m.app } : {}) };
        this.upsert(m.with, m.item);
        const c = this.cache.convs.find(x => x.with === m.with);
        if (c && fresh && m.item.from !== this.me?.tag) c.unread += 1;
        if (m.item.k === 'invite' && m.item.from === this.me?.tag) this.homeWatch();
        this.changed(); return;
      }
      case 'conv': {
        for (const it of m.items) this.upsert(m.with, it);
        this.cache.more[m.with] = m.more;
        for (const fn of this.convWaiters.get(m.with) ?? []) fn(m.more);
        this.convWaiters.delete(m.with);
        this.changed(); return;
      }
      case 'seen': this.seenMap.set(m.tag, m.seen); { const c = this.cache.convs.find(x => x.with === m.tag); if (c) c.seen = m.seen; } this.changed(); return;
      case 'balance': noteBalance(this.d.state, m.balance); this.cache.today = m.today; this.changed(); return;
      case 'history': { const fn = this.historyWaiters.shift(); fn?.({ ops: m.ops, more: m.more }); return; }
      case 'visit-end': for (const fn of this.visitListeners) fn(m.host, m.invite); return;
      default: return;
    }
  }
  private welcome(m: Extract<ServerMessage, { type: 'welcome' }>, ws: WebSocket) {
    if (m.v !== ONLINE_PROTOCOL) { this.stopSocket(); this.setStatus('offline'); return; }
    clearTimeout(this.handshake); this.handshake = 0;
    if (this.cache.tag && this.cache.tag !== m.tag) { const keep = this.cache.migrated; this.cache = emptyCache(); this.cache.migrated = keep; }   // another account on this device (an imported key)
    this.cache.tag = m.tag; this.cache.code = m.code; this.cache.limits = m.limits; this.cache.today = m.today;
    this.clockOffset = m.time - Date.now(); this.retryAttempt = 0; this.lastPong = Date.now();
    const o = this.d.state.data.online;
    o.tag = m.tag; noteBalance(this.d.state, m.balance);
    // the list: the server's, with any conversation only this device holds (an older one, or one with messages still to send)
    const server = new Set(m.convs.map(c => c.with));
    this.cache.convs = [...m.convs, ...this.cache.convs.filter(c => !server.has(c.with) && (this.cache.items[c.with]?.length ?? 0) > 0)];
    for (const c of m.convs) this.seenMap.set(c.with, c.seen);
    this.cache.blocked = [...new Set([...m.blocked.filter(t => !this.cache.blockSync.some(b => b.tag === t && !b.on)), ...this.cache.blockSync.filter(b => b.on).map(b => b.tag)])];
    this.live = true;
    this.setStatus('online');
    this.heartbeat = window.setInterval(() => {
      if (Date.now() - this.lastPong > 65000) { ws.close(); return; }
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 20000);
    if (this.where.hub !== null || this.where.room) this.sendRaw({ type: 'where', ...this.where });
    this.migrateChatBlocks();
    for (const b of this.cache.blockSync) void this.request({ type: 'block', id: b.id, tag: b.tag, on: b.on }).then(r => { if (r?.type === 'ack' && r.ok) { this.cache.blockSync = this.cache.blockSync.filter(x => x.id !== b.id); this.persist(); } });
    // money the server has not answered, then text, paced (never more than the socket's rate)
    const gen = this.generation, money = pendingFor(this.d.state, m.tag), later = (ms: number, send: () => void) => window.setTimeout(() => { if (gen === this.generation) send(); }, ms);
    money.forEach((p, i) => later(i * 120, () => this.sendMoney(p)));
    [...this.cache.outbox].forEach((x, i) => later(money.length * 120 + i * RESEND_GAP_MS, () => this.sendRaw(x)));
    this.homeWatch();
    this.changed();
  }
  /** The legacy chat panel's blocks (made before Messages) go to the account once: a block made before B still holds. */
  private migrateChatBlocks() {
    if (this.cache.migrated) return;
    try {
      const raw = JSON.parse(this.store()?.getItem(CHAT_KEY) ?? 'null') as { blocked?: [string, string][] } | null;
      for (const [key] of Array.isArray(raw?.blocked) ? raw!.blocked : []) {
        if (!isTag(key) || this.cache.blocked.includes(key) || this.cache.blockSync.some(b => b.tag === key)) continue;
        const id = this.newId();
        this.cache.blockSync.push({ id, tag: key, on: true }); this.cache.blocked.push(key);
      }
    } catch { /* unreadable: nothing to carry */ }
    this.cache.migrated = true; this.persist();
  }
  /** The answer to a text or a location of the outbox: the server's item replaces the « sending » one; a refusal is shown, not resent. */
  private outboxAnswer(m: Extract<ServerMessage, { type: 'ack' }>): boolean {
    const i = this.cache.outbox.findIndex(x => x.id === m.id); if (i < 0) return false;
    const msg = this.cache.outbox[i];
    if (!m.ok && m.reason === 'offline') return true;              // undecided: sent again at the next connection
    this.cache.outbox.splice(i, 1);
    const list = this.cache.items[msg.to] ?? [], at = list.findIndex(x => x.id === m.id);
    if (m.ok && m.item) this.upsert(msg.to, m.item);
    else if (!m.ok && at >= 0) list[at] = { ...list[at], status: 'failed', reason: m.reason };
    this.changed();
    return true;
  }
  /** While this player has open invitations: their home's snapshot is refreshed when its furniture moves (`home`). */
  private homeWatch() {
    clearInterval(this.homeTimer); this.homeTimer = 0;
    const me = this.me?.tag; if (!me || !onlineHooks.homeSnapshot) return;
    const open = () => Object.values(this.cache.items).some(l => l.some(i => i.k === 'invite' && i.from === me && (i.state === 'open' || i.state === 'accepted') && i.until > this.serverNow()));
    if (!open()) return;
    this.homeTimer = window.setInterval(() => {
      if (!open()) { clearInterval(this.homeTimer); this.homeTimer = 0; return; }
      const raw = onlineHooks.homeSnapshot?.(), snap = raw ? parseSnapshot(raw) : null; if (!snap) return;
      const s = JSON.stringify({ ...snap, at: 0 });
      if (this.lastHome && s === JSON.stringify({ ...JSON.parse(this.lastHome) as HomeSnapshot, at: 0 })) return;
      this.lastHome = JSON.stringify(snap);
      this.sendRaw({ type: 'home', id: this.newId(), snapshot: snap });
    }, 5000);
  }

  // ================================================================== the local copy
  /** Keeps an item in its conversation (replaced by id: a newer state, or the server's copy of one being sent). */
  private upsert(peer: Tag, item: ItemView) {
    if (!isTag(peer)) return;
    const list = this.cache.items[peer] ?? (this.cache.items[peer] = []);
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    if (list.length > ITEMS_PER_CONV) { list.sort((a, b) => a.at - b.at); list.splice(0, list.length - ITEMS_PER_CONV); }
    let c = this.cache.convs.find(x => x.with === peer);
    if (!c) {
      const n = this.cache.names[peer];
      c = { with: peer, name: n?.name ?? 'Joueur', look: n?.look ?? 0, ...(n?.app ? { app: n.app } : {}), last: null, unread: 0, seen: this.seenMap.get(peer) ?? 'never', blocked: this.isBlocked(peer) };
      this.cache.convs.unshift(c);
    }
    const n = this.cache.names[peer]; if (n) { c.name = n.name; c.look = n.look; if (n.app) c.app = n.app; }
    if (!item.status && (!c.last || item.at >= c.last.at || c.last.id === item.id)) c.last = stripView(item);
    if (this.cache.convs.length > CONVS_MAX) {
      const at = (x: ConvSummary) => Math.max(x.last?.at ?? 0, ...(this.cache.items[x.with] ?? []).map(i => i.at));
      this.cache.convs.sort((a, b) => at(b) - at(a));
      for (const old of this.cache.convs.splice(CONVS_MAX)) { delete this.cache.items[old.with]; delete this.cache.more[old.with]; }
    }
  }
  private changed() { this.persist(); this.emit(); }
  private emit() { for (const fn of [...this.listeners]) { try { fn(); } catch { /* a listener's error is its own */ } } }
  private store(): Storage | null { if (this.d.storage !== undefined) return this.d.storage; try { return globalThis.localStorage ?? null; } catch { return null; } }
  private persist() { clearTimeout(this.saveT); this.saveT = window.setTimeout(() => this.persistNow(), 300); }
  private persistNow() {
    clearTimeout(this.saveT);
    try {
      let json = JSON.stringify(this.cache);
      // bounded: the oldest conversations' items go first (they come back from the server)
      while (json.length > 400_000 && this.cache.convs.length > 5) { const old = this.cache.convs.pop()!; delete this.cache.items[old.with]; json = JSON.stringify(this.cache); }
      this.store()?.setItem(CACHE_KEY, json);
    } catch { /* full or blocked storage: the session keeps working */ }
  }
  private load(): Cache {
    const c = emptyCache();
    try {
      const raw = JSON.parse(this.store()?.getItem(CACHE_KEY) ?? 'null') as Partial<Cache> | null;
      if (!raw || raw.v !== 1) return c;
      if (isTag(raw.tag)) { c.tag = raw.tag; c.code = friendCode(raw.tag); }
      c.limits = raw.limits && typeof raw.limits === 'object' ? raw.limits : null;
      c.today = raw.today && typeof raw.today === 'object' ? raw.today : null;
      c.convs = (Array.isArray(raw.convs) ? raw.convs : []).filter(x => x && isTag(x.with) && typeof x.name === 'string' && (x.last === null || isItem(x.last))).slice(0, CONVS_MAX)
        .map(x => ({ with: x.with, name: nickname(x.name), look: lookIndex(x.look), ...(appearanceCode(x.app) ? { app: x.app } : {}), last: x.last, unread: Math.max(0, Math.floor(Number(x.unread) || 0)), seen: x.seen === 'online' ? x.last?.at ?? 'never' : x.seen ?? 'never', blocked: !!x.blocked }));   // « online » was then: now it is « last seen »
      for (const [peer, list] of Object.entries(raw.items ?? {})) {
        if (!isTag(peer) || !Array.isArray(list)) continue;
        c.items[peer] = list.flatMap(v => {
          const { status, reason, ...item } = (v ?? {}) as ItemView;
          if (!isItem(item)) return [];
          // a message still « sending » from a previous visit stays so (the outbox sends it again); a refusal stays refused
          return [{ ...item, ...(status === 'sending' || status === 'failed' ? { status } : {}), ...(typeof reason === 'string' ? { reason } : {}) } as ItemView];
        }).slice(-ITEMS_PER_CONV);
      }
      c.outbox = (Array.isArray(raw.outbox) ? raw.outbox : []).filter(m => m && (m.type === 'say' || m.type === 'loc') && isTag(m.to) && typeof m.id === 'string').slice(0, 200);
      c.blocked = (Array.isArray(raw.blocked) ? raw.blocked : []).filter(isTag);
      c.blockSync = (Array.isArray(raw.blockSync) ? raw.blockSync : []).filter(b => b && isTag(b.tag) && typeof b.on === 'boolean' && typeof b.id === 'string');
      c.migrated = raw.migrated === true;
      c.here = (Array.isArray(raw.here) ? raw.here : []).filter(x => typeof x === 'string').slice(-100);
      for (const [t, n] of Object.entries(raw.names ?? {})) if (isTag(t) && n && typeof n.name === 'string') c.names[t] = { name: nickname(n.name), look: lookIndex(n.look), ...(appearanceCode(n.app) ? { app: n.app } : {}) };
      // a « sending » item without its outbox entry (the outbox was cut) is failed, never silently lost
      for (const list of Object.values(c.items)) for (const i of list) if (i.status === 'sending' && !c.outbox.some(m => m.id === i.id)) { i.status = 'failed'; i.reason = 'offline'; }
    } catch { return emptyCache(); }
    return c;
  }
}

const stripView = (v: ItemView): Item => { const { status: _s, reason: _r, ...item } = v; void _s; void _r; return item as Item; };

/** This device's private key (the one presence sends, `dakarrek.chat.key`): read, or made once and kept. Only its hash ever leaves the server. */
function deviceKey(storage: Storage | null): string | null {
  let store: Storage | null = storage;
  try { store ??= globalThis.localStorage ?? null; } catch { store = null; }
  try {
    const saved = store?.getItem(DEVICE_KEY);
    if (saved && /^[a-f0-9]{32}$/.test(saved)) return saved;
    const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    store?.setItem(DEVICE_KEY, fresh);
    return store?.getItem(DEVICE_KEY) === fresh ? fresh : null;
  } catch { return null; }
}
