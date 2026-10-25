import { DurableObject } from 'cloudflare:workers';
import { ECONOMY } from '../src/economy/config';
import { appearanceCode, lookIndex, nickname } from '../src/multiplayer/protocol';
import { rateLimit } from '../src/multiplayer/chatRules';
import {
  ONLINE_MAX_FRAME, ONLINE_PROTOCOL, friendCode, isItem, isTag, parseClientMessage, tagOfCode,
  type Ack, type AskItem, type ClientMessage, type ConvSummary, type GuestPerms, type HomeSnapshot, type InviteItem, type Item, type LedgerOp, type MeetItem,
  type MoneyLimits, type MoneyRefusal, type ServerMessage, type Tag,
} from '../src/online/protocol';
import {
  applyMoney, askItem, closeAsk, createAsk, openAccount, opView, todayOf,
  type AskResult, type AskRow, type LedgerAccount, type LedgerResult, type LedgerStore, type MoneyRequest, type StoredOp, type Today,
} from '../src/online/ledgerRules';
import { STATEFUL, blockEffects, deliveryOf, findAllowed, inviteNext, meetNext, nextDeadline, seenOf, visitCheck, type InviteAct, type MeetAct, type MeetTimes } from '../src/online/accountRules';
import type { HubId } from '../src/core/types';

/**
 * LD2.0-B « Belong Online » (docs/ld2/LD2_B_CONTRACT.md « Server »): ONE Durable Object class with two roles, chosen by the object's name (one class, one
 * binding: each Workers Builds preview gets a namespace per binding, docs/ld2/REGRESSION.md).
 *
 *   – `acct:<tag>`: a player's account. The client's session hub (one or more sockets, WebSocket hibernation as CityRoom), its conversations, blocks,
 *     reports, the home snapshot of its open invitations, where it is. Items go from A's account to B's by RPC, idempotent by id on both sides, through
 *     an outbox an alarm retries. Authority over stateful items: requests the ledger, invitations the host's account, meetings the proposer's; the
 *     authority pushes each new state to both accounts (an `item` with the same id and a higher revision).
 *   – `ledger`: Teranga Money, one object, so every transfer is one `transactionSync` (src/online/ledgerRules.ts).
 *
 * The role and the tag are passed explicitly (the Worker's `X-Dakar-Tag` header, the first argument of each account RPC) and kept in the object's
 * `meta` table, never inferred: an object answers only for the role it was opened with. An account « exists » once a client connected to it once (its
 * `meta` table and its ledger row are made then); RPCs to a tag that never connected answer 'unknown' and write nothing.
 */
export interface SocialEnv { SOCIAL: DurableObjectNamespace<Social> }
type Profile = { name: string; look: number; app?: string };
type Seen = 'online' | number | 'never';
type Out = { kind: 'deliver'; to: Tag; item: Item; rev: number } | { kind: 'visitEnd'; to: Tag; host: Tag; invite: string } | { kind: 'blockedBy'; to: Tag };
interface Session { tag: Tag; windowAt: number; messages: number }
export type AuthorityAnswer = { ok: true; item: Item; rev: number } | { ok: false; reason: 'closed' | 'invalid' | 'not-found' };
export type VisitAnswer = { ok: true; snapshot: HomeSnapshot; perms: GuestPerms; invite: string } | { ok: false; reason: 'no-invite' | 'revoked' | 'blocked' };

const O = ECONOMY.online;
export const LIMITS: MoneyLimits = { opMax: O.opMax, fundDayMax: O.fundDayMax, sendDayMax: O.sendDayMax, receiveDayMax: O.receiveDayMax, balanceMax: O.balanceMax };
const TIMES: MeetTimes = { early: O.meetEarlyMs, late: O.meetLateMs, nowOpen: O.meetNowOpenMs };
/** Messages a socket may send per second (the room's rule: more closes it), conversations in the welcome, people told when this one comes or goes. */
const SOCKET_RATE = 20, WELCOME_CONVS = 100, SEEN_FANOUT = 20;
/** Outbox: retries back off from 5 s to 10 min; a delivery still failing after this many tries is dropped (and logged). */
const OUTBOX_TRIES = 40;
const ACKS_KEEP_MS = 30 * 86_400_000;
const FRAME_ROOM = ONLINE_MAX_FRAME - 512;

export class Social extends DurableObject<SocialEnv> {
  private role: 'acct' | 'ledger' | null = null;
  private tag: Tag | null = null;
  /** Requests being answered now, by id: the same id sent again meanwhile (a second socket, a double tap) waits for the first answer. */
  private inflight = new Map<string, Promise<ServerMessage>>();
  /** Accepted text and location times of this account (the chat rule: 10 per window), kept in memory only. */
  private textTimes: number[] = [];
  private flushing: Promise<void> | null = null;
  private ackWrites = 0;

  constructor(ctx: DurableObjectState, env: SocialEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private get sql() { return this.ctx.storage.sql; }
  private ledger() { return this.env.SOCIAL.getByName('ledger'); }
  private account(tag: Tag) { return this.env.SOCIAL.getByName(`acct:${tag}`); }

  // ================================================================== roles and schema
  private hasMeta() { return this.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`).toArray().length > 0; }
  private metaGet(k: string): string | null { const r = this.sql.exec<{ v: string }>('SELECT v FROM meta WHERE k = ?', k).toArray()[0]; return r ? r.v : null; }
  private metaSet(k: string, v: string) { this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v); }
  /** Opens this object as `tag`'s account (creating its tables at the first connection) or throws if it is another object. */
  private openAccount(tag: Tag) {
    if (this.role === 'acct' && this.tag === tag) return;
    if (!isTag(tag)) throw new Error('bad tag');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    const role = this.metaGet('role'), own = this.metaGet('tag');
    if ((role && role !== 'acct') || (own && own !== tag)) throw new Error('wrong object');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS items (peer TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, k TEXT NOT NULL, mine INTEGER NOT NULL,
      rev INTEGER NOT NULL, json TEXT NOT NULL, due INTEGER, PRIMARY KEY (peer, id))`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS items_at ON items (peer, at)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS items_due ON items (due) WHERE due IS NOT NULL`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS convs (peer TEXT PRIMARY KEY, name TEXT NOT NULL, look INTEGER NOT NULL, app TEXT, unread INTEGER NOT NULL DEFAULT 0,
      last INTEGER NOT NULL DEFAULT 0, seen TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS blocks (tag TEXT PRIMARY KEY, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reports (tag TEXT PRIMARY KEY, reason TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS snapshots (invite TEXT PRIMARY KEY, guest TEXT NOT NULL, json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS acks (id TEXT PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, next INTEGER NOT NULL)`);
    if (!role) { this.metaSet('role', 'acct'); this.metaSet('tag', tag); this.metaSet('created', String(Date.now())); }
    this.role = 'acct'; this.tag = tag;
  }
  /** This object as an account that has connected once (and is `tag`'s), without writing anything otherwise. */
  private existing(tag: Tag): boolean {
    if (this.role === 'acct') return this.tag === tag;
    if (this.role || !isTag(tag) || !this.hasMeta() || this.metaGet('role') !== 'acct' || this.metaGet('tag') !== tag) return false;
    this.openAccount(tag);
    return true;
  }
  /** The account's own tag after a wake-up (an alarm, a hibernated socket): from its meta table. */
  private selfTag(): Tag | null {
    if (this.role === 'acct') return this.tag;
    if (this.role || !this.hasMeta() || this.metaGet('role') !== 'acct') return null;
    const t = this.metaGet('tag'); if (!t || !isTag(t)) return null;
    this.openAccount(t); return t;
  }
  private openLedger() {
    if (this.role === 'ledger') return;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    const role = this.metaGet('role');
    if (role && role !== 'ledger') throw new Error('wrong object');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS accounts (tag TEXT PRIMARY KEY, balance INTEGER NOT NULL, day INTEGER NOT NULL, funded INTEGER NOT NULL,
      sent INTEGER NOT NULL, received INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ops (id TEXT PRIMARY KEY, kind TEXT NOT NULL, a TEXT NOT NULL, b TEXT, amount INTEGER NOT NULL, fund INTEGER NOT NULL,
      req TEXT, note TEXT, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS ops_a ON ops (a, at)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS ops_b ON ops (b, at)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS asks (id TEXT PRIMARY KEY, payee TEXT NOT NULL, payer TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT,
      state TEXT NOT NULL, paidBy TEXT, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS blocks (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b))`);
    if (!role) this.metaSet('role', 'ledger');
    this.role = 'ledger';
  }

  // ================================================================== the ledger role (Teranga Money)
  private ledgerStore(): LedgerStore {
    const sql = this.sql;
    return {
      account: t => { const r = sql.exec<LedgerAccount & Record<string, number | string>>('SELECT tag, balance, day, funded, sent, received FROM accounts WHERE tag = ?', t).toArray()[0]; return r ? { tag: r.tag, balance: r.balance, day: r.day, funded: r.funded, sent: r.sent, received: r.received } : null; },
      putAccount: a => { sql.exec(`INSERT INTO accounts (tag, balance, day, funded, sent, received) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tag) DO UPDATE SET
        balance = excluded.balance, day = excluded.day, funded = excluded.funded, sent = excluded.sent, received = excluded.received`, a.tag, a.balance, a.day, a.funded, a.sent, a.received); },
      op: id => { const r = sql.exec<Record<string, string | number | null>>('SELECT * FROM ops WHERE id = ?', id).toArray()[0]; return r ? rowOp(r) : null; },
      putOp: o => { sql.exec('INSERT INTO ops (id, kind, a, b, amount, fund, req, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', o.id, o.kind, o.a, o.b, o.amount, o.fund, o.req, o.note, o.at); },
      ask: id => { const r = sql.exec<Record<string, string | number | null>>('SELECT * FROM asks WHERE id = ?', id).toArray()[0]; return r ? rowAsk(r) : null; },
      putAsk: a => { sql.exec(`INSERT INTO asks (id, payee, payer, amount, note, state, paidBy, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        state = excluded.state, paidBy = excluded.paidBy`, a.id, a.payee, a.payer, a.amount, a.note, a.state, a.paidBy, a.at); },
      blocks: (a, b) => sql.exec('SELECT 1 AS x FROM blocks WHERE a = ? AND b = ?', a, b).toArray().length > 0,
      putBlock: (a, b, on) => { if (on) sql.exec('INSERT OR IGNORE INTO blocks (a, b) VALUES (?, ?)', a, b); else sql.exec('DELETE FROM blocks WHERE a = ? AND b = ?', a, b); },
    };
  }
  /** The account's ledger row, made at its first connection (from then on the account « exists »): balance, today's use, the limits. */
  async ledgerOpen(tag: Tag): Promise<{ balance: number; today: Today; limits: MoneyLimits }> {
    this.openLedger(); if (!isTag(tag)) throw new Error('bad tag');
    const now = Date.now(), store = this.ledgerStore();
    const a = this.ctx.storage.transactionSync(() => openAccount(store, tag, now));
    return { balance: a.balance, today: todayOf(a, now), limits: LIMITS };
  }
  async ledgerExists(tag: Tag): Promise<boolean> { this.openLedger(); return isTag(tag) && !!this.ledgerStore().account(tag); }
  async ledgerState(tag: Tag): Promise<{ balance: number; today: Today } | null> {
    this.openLedger(); const a = this.ledgerStore().account(tag); const now = Date.now();
    return a ? { balance: a.balance, today: todayOf(a, now) } : null;
  }
  async ledgerMoney(r: MoneyRequest): Promise<LedgerResult> {
    this.openLedger(); const store = this.ledgerStore(), now = Date.now();
    return this.ctx.storage.transactionSync(() => applyMoney(store, r, now, LIMITS));
  }
  async ledgerAsk(r: { id: string; payee: Tag; payer: Tag; amount: number; note?: string }): Promise<AskResult> {
    this.openLedger(); const store = this.ledgerStore(), now = Date.now();
    return this.ctx.storage.transactionSync(() => createAsk(store, r, now, LIMITS));
  }
  async ledgerAskClose(r: { ref: string; how: 'declined' | 'cancelled'; by: Tag }): Promise<AskResult> {
    this.openLedger(); const store = this.ledgerStore();
    return this.ctx.storage.transactionSync(() => closeAsk(store, r));
  }
  async ledgerAskOf(id: string): Promise<AskRow | null> { this.openLedger(); return this.ledgerStore().ask(id); }
  async ledgerBlock(a: Tag, b: Tag, on: boolean): Promise<void> {
    this.openLedger(); const store = this.ledgerStore();
    this.ctx.storage.transactionSync(() => store.putBlock(a, b, on));
  }
  async ledgerHistory(tag: Tag, before?: number): Promise<{ ops: LedgerOp[]; more: boolean }> {
    this.openLedger();
    const rows = this.sql.exec<Record<string, string | number | null>>('SELECT * FROM ops WHERE (a = ? OR b = ?) AND at < ? ORDER BY at DESC, id DESC LIMIT ?', tag, tag, before ?? 1e15, O.page + 1).toArray();
    return { ops: rows.slice(0, O.page).map(r => opView(rowOp(r))), more: rows.length > O.page };
  }

  // ================================================================== the account role: sockets
  /** A client's socket, from the Worker (`/api/me`), with the tag it derived from the device key. */
  async fetch(request: Request): Promise<Response> {
    const tag = request.headers.get('X-Dakar-Tag') ?? '';
    if (!isTag(tag) || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Invalid account request', { status: 400 });
    this.openAccount(tag);
    const url = new URL(request.url);
    const profile: Profile = { name: nickname(url.searchParams.get('name')), look: lookIndex(url.searchParams.get('look')) };
    const app = appearanceCode(url.searchParams.get('app')); if (app) profile.app = app;
    this.metaSet('profile', JSON.stringify(profile));
    let money: { balance: number; today: Today; limits: MoneyLimits };
    try { money = await this.ledger().ledgerOpen(tag); } catch { return new Response('Ledger busy, retry shortly', { status: 503, headers: { 'Retry-After': '3' } }); }
    const first = this.liveSockets().length === 0;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ tag, windowAt: Date.now(), messages: 0 } satisfies Session);
    this.send(server, this.welcome(tag, money));
    if (first) this.ctx.waitUntil(this.tellPeers('online'));
    this.ctx.waitUntil(this.refreshSeen());
    this.ctx.waitUntil(this.flush());
    return new Response(null, { status: 101, webSocket: client });
  }
  private welcome(tag: Tag, money: { balance: number; today: Today; limits: MoneyLimits }): ServerMessage {
    const blocked = this.sql.exec<{ tag: string }>('SELECT tag FROM blocks').toArray().map(r => r.tag);
    const convs: ConvSummary[] = [];
    let size = 600 + blocked.length * 20;
    for (const c of this.sql.exec<{ peer: string; name: string; look: number; app: string | null; unread: number; seen: string | null }>('SELECT peer, name, look, app, unread, seen FROM convs ORDER BY last DESC LIMIT ?', WELCOME_CONVS)) {
      const s = this.summary(c, blocked);
      size += JSON.stringify(s).length + 1;
      if (size > FRAME_ROOM) break;                               // the frame limit: older conversations come with their next item
      convs.push(s);
    }
    return { type: 'welcome', v: ONLINE_PROTOCOL, tag, code: friendCode(tag), time: Date.now(), balance: money.balance, limits: money.limits, today: money.today, convs, blocked };
  }
  private summary(c: { peer: string; name: string; look: number; app: string | null; unread: number; seen: string | null }, blocked: string[]): ConvSummary {
    const last = this.sql.exec<{ json: string }>('SELECT json FROM items WHERE peer = ? ORDER BY at DESC, rowid DESC LIMIT 1', c.peer).toArray()[0];
    return { with: c.peer, name: c.name, look: c.look, ...(c.app ? { app: c.app } : {}), last: last ? JSON.parse(last.json) as Item : null, unread: c.unread, seen: parseSeen(c.seen), blocked: blocked.includes(c.peer) };
  }
  private liveSockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING); }
  private send(ws: WebSocket, m: ServerMessage) { try { ws.send(JSON.stringify(m)); } catch { /* closing: the client resends what was not answered */ } }
  private push(m: ServerMessage, except?: WebSocket) { const s = JSON.stringify(m); for (const ws of this.liveSockets()) if (ws !== except) { try { ws.send(s); } catch { /* closing */ } } }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const s = ws.deserializeAttachment() as Session | null;
    if (!s) { ws.close(1011, 'Session lost'); return; }
    if (typeof message !== 'string' || message.length > ONLINE_MAX_FRAME) { ws.close(1009, 'Frame too large'); return; }
    const now = Date.now();
    if (now - s.windowAt >= 1000) { s.windowAt = now; s.messages = 0; }
    if (++s.messages > SOCKET_RATE) { ws.close(1008, 'Too many messages'); return; }
    ws.serializeAttachment(s);
    this.openAccount(s.tag);
    let data: unknown; try { data = JSON.parse(message); } catch { return; }   // not JSON: ignored, the socket stays
    const p = parseClientMessage(data);
    if (!p.ok) { if (p.id) this.send(ws, { type: 'ack', id: p.id, ok: false, reason: p.reason }); return; }
    const m = p.msg;
    try {
      if (m.type === 'conv') { await this.conv(ws, m.with, m.before); return; }
      if (m.type === 'read') { this.sql.exec('UPDATE convs SET unread = 0 WHERE peer = ?', m.with); return; }
      if (m.type === 'where') { this.metaSet('where', JSON.stringify({ hub: m.hub, room: m.room })); return; }
      if (m.type === 'history') { const h = await this.ledger().ledgerHistory(s.tag, m.before); this.send(ws, { type: 'history', ops: h.ops, more: h.more }); return; }
      await this.request(ws, s.tag, m);
    } catch (e) {
      console.log(JSON.stringify({ event: 'social-error', type: m.type, error: String(e) }));
      if ('id' in m) this.send(ws, { type: 'ack', id: m.id, ok: false, reason: 'offline' });   // nothing was decided: the client may resend the same id
    }
  }
  async webSocketClose(ws: WebSocket): Promise<void> { await this.gone(ws); }
  async webSocketError(ws: WebSocket): Promise<void> { await this.gone(ws); }
  private async gone(ws: WebSocket) {
    const tag = this.selfTag(); if (!tag) return;
    if (this.liveSockets().filter(x => x !== ws).length) return;
    const now = Date.now(); this.metaSet('lastSeen', String(now));
    await this.tellPeers(now);
  }

  // ------------------------------------------------------------------ requests with an id: answered once
  private async request(ws: WebSocket, me: Tag, m: Extract<ClientMessage, { id: string }>) {
    const stored = this.sql.exec<{ json: string }>('SELECT json FROM acks WHERE id = ?', m.id).toArray()[0];
    if (stored) {                                                  // answered before: the same answer, with the item as it stands now (not as it was)
      const ack = JSON.parse(stored.json) as Ack;
      if (ack.ok && ack.item) { const cur = this.findItem(ack.item.id); if (cur) ack.item = cur.item; }
      this.send(ws, { ...ack, duplicate: true } as Ack); return;
    }
    let running = this.inflight.get(m.id), first = false;
    if (!running) {
      first = true;
      running = this.answer(ws, me, m).finally(() => this.inflight.delete(m.id));
      this.inflight.set(m.id, running);
    }
    const reply = await running;
    this.send(ws, first || reply.type !== 'ack' || !reply.ok ? reply : { ...reply, duplicate: true });
  }
  private async answer(ws: WebSocket, me: Tag, m: Extract<ClientMessage, { id: string }>): Promise<ServerMessage> {
    const reply = await this.dispatch(ws, me, m);
    // stateful answers are kept by id (money is the ledger's, kept there; visit, lookup and find are asked again)
    if (reply.type === 'ack' && reply.ok && !['pay', 'fund', 'cashout'].includes(m.type)) {
      this.sql.exec('INSERT OR IGNORE INTO acks (id, json, at) VALUES (?, ?, ?)', m.id, JSON.stringify(reply), Date.now());
      if (++this.ackWrites % 100 === 0) this.sql.exec('DELETE FROM acks WHERE at < ?', Date.now() - ACKS_KEEP_MS);
    }
    return reply;
  }
  private async dispatch(ws: WebSocket, me: Tag, m: Extract<ClientMessage, { id: string }>): Promise<ServerMessage> {
    const no = (reason: Extract<Ack, { ok: false }>['reason']): Ack => ({ type: 'ack', id: m.id, ok: false, reason });
    const yes = (extra: Partial<Extract<Ack, { ok: true }>> = {}): Ack => ({ type: 'ack', id: m.id, ok: true, ...extra });
    const now = Date.now();
    // (a send goes to the ledger first, whatever else holds: a resend of an applied one must answer its first result, never a refusal)
    const towards = 'to' in m && m.type !== 'pay' ? m.to : null;
    if (towards !== null) {
      if (towards === me) return no('self');
      if (this.blocks(towards)) return no('blocked');
    }
    switch (m.type) {
      case 'say': case 'loc': {
        const had = this.getItem(m.to, m.id);
        if (had) return yes({ duplicate: true, item: had.item });
        const rate = rateLimit(this.textTimes, now); this.textTimes = rate.times;
        if (!rate.allowed) return no('rate-limited');
        if (!this.convExists(m.to) && !(await this.ledger().ledgerExists(m.to))) return no('unknown-recipient');
        const item: Item = m.type === 'say' ? { id: m.id, k: 'text', from: me, at: now, text: m.text } : { id: m.id, k: 'loc', from: me, at: now, hub: m.hub, x: m.x, z: m.z, name: m.name };
        this.putItem(m.to, item, 0);
        this.push({ type: 'item', with: m.to, item, ...this.peerProfile(m.to) }, ws);
        await this.enqueue({ kind: 'deliver', to: m.to, item, rev: 0 });
        return yes({ item });
      }
      case 'pay': {
        const r: LedgerResult = await this.ledger().ledgerMoney({ kind: 'pay', id: m.id, tag: me, to: m.to, amount: m.amount, fund: m.fund, ...(m.note ? { note: m.note } : {}), ...(m.req ? { req: m.req } : {}) });
        if (!r.ok) return no(r.reason);
        const op = r.op, item: Item = { id: op.id, k: 'pay', from: me, at: op.at, amount: op.amount, op: op.id, ...(op.note ? { note: op.note } : {}), ...(op.req ? { req: op.req } : {}) };
        const to = op.to!;
        // the same answer for a resend: the items are written again idempotently (a crash between the ledger and here is mended by the resend)
        if (this.putItem(to, item, 0) !== 'stale') this.push({ type: 'item', with: to, item, ...this.peerProfile(to) }, ws);
        await this.enqueue({ kind: 'deliver', to, item, rev: 0 });
        if (r.ask) await this.askChanged(r.ask, me);
        this.push({ type: 'balance', balance: r.balance, today: r.today });
        return yes({ ...(r.duplicate ? { duplicate: true } : {}), item, op, balance: r.balance });
      }
      case 'fund': case 'cashout': {
        const r: LedgerResult = await this.ledger().ledgerMoney({ kind: m.type, id: m.id, tag: me, amount: m.amount });
        if (!r.ok) return no(r.reason);
        this.push({ type: 'balance', balance: r.balance, today: r.today });
        return yes({ ...(r.duplicate ? { duplicate: true } : {}), op: r.op, balance: r.balance });
      }
      case 'ask': {
        const r: AskResult = await this.ledger().ledgerAsk({ id: m.id, payee: me, payer: m.to, amount: m.amount, ...(m.note ? { note: m.note } : {}) });
        if (!r.ok) return no(r.reason);
        const item = await this.askChanged(r.ask, me, ws);
        return yes({ ...(r.duplicate ? { duplicate: true } : {}), item });
      }
      case 'ask-close': {
        const r: AskResult = await this.ledger().ledgerAskClose({ ref: m.ref, how: m.how, by: me });
        if (!r.ok) return no(r.reason);
        const item = await this.askChanged(r.ask, me, ws);
        return yes({ ...(r.duplicate ? { duplicate: true } : {}), item });
      }
      case 'invite': {
        const may = await this.accepts(m.to); if (may !== 'ok') return no(may);
        const item: InviteItem = { id: m.id, k: 'invite', from: me, at: now, home: m.snapshot.home, perms: m.perms, state: 'open', until: now + O.inviteMs };
        this.sql.exec('INSERT OR REPLACE INTO snapshots (invite, guest, json) VALUES (?, ?, ?)', m.id, m.to, JSON.stringify(m.snapshot));
        this.metaSet('home', JSON.stringify(m.snapshot));
        this.putItem(m.to, item, 0);
        this.push({ type: 'item', with: m.to, item, ...this.peerProfile(m.to) }, ws);
        await this.enqueue({ kind: 'deliver', to: m.to, item, rev: 0 });
        await this.schedule();
        return yes({ item });
      }
      case 'home': {
        const live = this.sql.exec<{ id: string; json: string }>(`SELECT id, json FROM items WHERE mine = 1 AND k = 'invite'`).toArray()
          .filter(r => { const i = JSON.parse(r.json) as InviteItem; return i.state === 'open' || i.state === 'accepted'; });
        for (const r of live) this.sql.exec('UPDATE snapshots SET json = ? WHERE invite = ?', JSON.stringify(m.snapshot), r.id);
        this.metaSet('home', JSON.stringify(m.snapshot));
        return yes();
      }
      case 'invite-answer': case 'invite-revoke': {
        const found = this.findItem(m.ref);
        if (!found || found.item.k !== 'invite') return no('not-found');
        const act: InviteAct = m.type === 'invite-revoke' ? 'revoke' : m.accept ? 'accept' : 'decline';
        const r: AuthorityAnswer = found.item.from === me ? await this.inviteAct(me, m.ref, me, act) : await this.account(found.item.from).inviteAct(found.item.from, m.ref, me, act) as AuthorityAnswer;
        if (!r.ok) return no(r.reason);
        if (found.item.from !== me) this.applyAuthority(found.peer, r.item, r.rev, ws);
        return yes({ item: r.item });
      }
      case 'meet': {
        const may = await this.accepts(m.to); if (may !== 'ok') return no(may);
        if (m.when !== 0 && (m.when < now - O.meetEarlyMs || m.when > now + O.meetAheadMs)) return no('invalid');
        if (m.counter) {
          const old = this.getItem(m.to, m.counter);
          if (!old || old.item.k !== 'meet' || old.item.from !== m.to) return no('not-found');
          const r = await this.account(m.to).meetAct(m.to, m.counter, me, 'counter') as AuthorityAnswer;
          if (!r.ok) return no(r.reason);
          this.applyAuthority(m.to, r.item, r.rev);
        }
        const item: MeetItem = { id: m.id, k: 'meet', from: me, at: now, place: m.place, when: m.when, state: 'open', here: [], ...(m.note ? { note: m.note } : {}), ...(m.counter ? { counter: m.counter } : {}) };
        this.putItem(m.to, item, 0);
        this.push({ type: 'item', with: m.to, item, ...this.peerProfile(m.to) }, ws);
        await this.enqueue({ kind: 'deliver', to: m.to, item, rev: 0 });
        await this.schedule();
        return yes({ item });
      }
      case 'meet-answer': case 'meet-cancel': case 'meet-here': {
        const found = this.findItem(m.ref);
        if (!found || found.item.k !== 'meet') return no('not-found');
        const act: MeetAct = m.type === 'meet-cancel' ? 'cancel' : m.type === 'meet-here' ? 'here' : m.accept ? 'accept' : 'decline';
        const r: AuthorityAnswer = found.item.from === me ? await this.meetAct(me, m.ref, me, act) : await this.account(found.item.from).meetAct(found.item.from, m.ref, me, act) as AuthorityAnswer;
        if (!r.ok) return no(r.reason);
        if (found.item.from !== me) this.applyAuthority(found.peer, r.item, r.rev, ws);
        return yes({ item: r.item });
      }
      case 'visit': {
        if (m.host === me) return no('self');
        const r = await this.account(m.host).visitFor(m.host, me) as VisitAnswer;
        return r.ok ? { type: 'visit', id: m.id, ok: true, host: m.host, snapshot: r.snapshot, perms: r.perms, invite: r.invite } : { type: 'visit', id: m.id, ok: false, host: m.host, reason: r.reason };
      }
      case 'block': {
        if (m.tag === me) return no('self');
        await this.ledger().ledgerBlock(me, m.tag, m.on);
        if (!m.on) { this.sql.exec('DELETE FROM blocks WHERE tag = ?', m.tag); return yes(); }
        this.sql.exec('INSERT OR IGNORE INTO blocks (tag, at) VALUES (?, ?)', m.tag, now);
        await this.blockedEffects(me, m.tag);
        await this.enqueue({ kind: 'blockedBy', to: m.tag });
        return yes();
      }
      case 'report': {
        if (m.tag === me) return no('self');
        const had = this.sql.exec('SELECT 1 AS x FROM reports WHERE tag = ?', m.tag).toArray().length > 0;
        if (had) return yes({ duplicate: true });
        if ((this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM reports').one().n) >= 200) return no('rate-limited');
        this.sql.exec('INSERT INTO reports (tag, reason, at) VALUES (?, ?, ?)', m.tag, m.reason, now);
        let count = 0; try { count = await this.account(m.tag).reported(m.tag); } catch { /* the line below still says it */ }
        console.log(JSON.stringify({ event: 'player-report', via: 'messages', target: m.tag, name: this.peerProfile(m.tag).name ?? null, reason: m.reason, count }));
        return yes();
      }
      case 'forget': {
        this.sql.exec('DELETE FROM items WHERE peer = ?', m.with);
        this.sql.exec('DELETE FROM convs WHERE peer = ?', m.with);
        this.sql.exec('DELETE FROM snapshots WHERE guest = ?', m.with);
        return yes();
      }
      case 'lookup': {
        const tag = tagOfCode(m.code);
        if (!tag || !(await this.ledger().ledgerExists(tag))) return { type: 'lookup', id: m.id, tag: null };
        const p = tag === me ? this.myProfile() : await this.account(tag).profileOf(tag);
        return p ? { type: 'lookup', id: m.id, tag, name: p.name, look: p.look, ...(p.app ? { app: p.app } : {}) } : { type: 'lookup', id: m.id, tag: null };
      }
      case 'find': {
        if (m.tag === me) return no('self');
        if (this.blocks(m.tag)) return no('blocked');
        const w = await this.account(m.tag).whereFor(m.tag, me);
        return w ? { type: 'find', id: m.id, tag: m.tag, hub: w.hub, room: w.room } : no('unavailable');
      }
    }
  }

  // ------------------------------------------------------------------ conversation storage
  private blocks(tag: Tag) { return this.sql.exec('SELECT 1 AS x FROM blocks WHERE tag = ?', tag).toArray().length > 0; }
  private convExists(peer: Tag) { return this.sql.exec('SELECT 1 AS x FROM convs WHERE peer = ?', peer).toArray().length > 0; }
  private myProfile(): Profile { try { return JSON.parse(this.metaGet('profile') ?? 'null') as Profile ?? { name: 'Dakarois', look: 0 }; } catch { return { name: 'Dakarois', look: 0 }; } }
  private peerProfile(peer: Tag): { name?: string; look?: number; app?: string } {
    const c = this.sql.exec<{ name: string; look: number; app: string | null }>('SELECT name, look, app FROM convs WHERE peer = ?', peer).toArray()[0];
    return c ? { name: c.name, look: c.look, ...(c.app ? { app: c.app } : {}) } : {};
  }
  private ensureConv(peer: Tag, p?: Profile) {
    if (p) this.sql.exec(`INSERT INTO convs (peer, name, look, app) VALUES (?, ?, ?, ?) ON CONFLICT(peer) DO UPDATE SET name = excluded.name, look = excluded.look, app = excluded.app`,
      peer, nickname(p.name), lookIndex(p.look), appearanceCode(p.app) ?? null);
    else this.sql.exec(`INSERT OR IGNORE INTO convs (peer, name, look) VALUES (?, 'Joueur', 0)`, peer);
  }
  private getItem(peer: Tag, id: string): { item: Item; rev: number } | null {
    const r = this.sql.exec<{ json: string; rev: number }>('SELECT json, rev FROM items WHERE peer = ? AND id = ?', peer, id).toArray()[0];
    return r ? { item: JSON.parse(r.json) as Item, rev: r.rev } : null;
  }
  private findItem(id: string): { peer: Tag; item: Item; rev: number } | null {
    const r = this.sql.exec<{ peer: string; json: string; rev: number }>('SELECT peer, json, rev FROM items WHERE id = ? LIMIT 1', id).toArray()[0];
    return r ? { peer: r.peer, item: JSON.parse(r.json) as Item, rev: r.rev } : null;
  }
  /**
   * Keeps an item of the conversation with `peer`: a new one (counted unread when the other player wrote it), or a newer state of one already kept
   * (higher revision). An older or equal revision is 'stale' and changes nothing. The newest O.convMax items are kept.
   */
  private putItem(peer: Tag, item: Item, rev: number): 'new' | 'updated' | 'stale' {
    const me = this.tag!, mine = item.from === me ? 1 : 0;
    const due = mine && STATEFUL.has(item.k) ? nextDeadline(item, TIMES) : null;
    const had = this.sql.exec<{ rev: number }>('SELECT rev FROM items WHERE peer = ? AND id = ?', peer, item.id).toArray()[0];
    this.ensureConv(peer);
    if (had) {
      if (had.rev >= rev) return 'stale';
      this.sql.exec('UPDATE items SET json = ?, rev = ?, due = ? WHERE peer = ? AND id = ?', JSON.stringify(item), rev, due, peer, item.id);
      return 'updated';
    }
    this.sql.exec('INSERT INTO items (peer, id, at, k, mine, rev, json, due) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', peer, item.id, item.at, item.k, mine, rev, JSON.stringify(item), due);
    this.sql.exec(`UPDATE convs SET last = MAX(last, ?)${mine ? '' : ', unread = unread + 1'} WHERE peer = ?`, item.at, peer);
    const n = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM items WHERE peer = ?', peer).one().n;
    if (n > O.convMax) this.sql.exec('DELETE FROM items WHERE peer = ? AND id IN (SELECT id FROM items WHERE peer = ? ORDER BY at ASC, rowid ASC LIMIT ?)', peer, peer, n - O.convMax);
    return 'new';
  }
  /** A new state from the authority (answered to this account's own request): kept and pushed to this account's sockets. */
  private applyAuthority(peer: Tag, item: Item, rev: number, except?: WebSocket) {
    if (this.putItem(peer, item, rev) !== 'stale') this.push({ type: 'item', with: peer, item, ...this.peerProfile(peer) }, except);
  }
  /** A request's new state (from the ledger): kept here, pushed, and sent to the other player's account. */
  private async askChanged(row: AskRow, me: Tag, except?: WebSocket): Promise<AskItem> {
    const item = askItem(row), peer = row.payee === me ? row.payer : row.payee, rev = row.state === 'open' ? 0 : 1;
    if (this.putItem(peer, item, rev) !== 'stale') this.push({ type: 'item', with: peer, item, ...this.peerProfile(peer) }, except);
    await this.enqueue({ kind: 'deliver', to: peer, item, rev });
    return item;
  }
  private async conv(ws: WebSocket, peer: Tag, before?: number) {
    const rows = this.sql.exec<{ json: string }>('SELECT json FROM items WHERE peer = ? AND at < ? ORDER BY at DESC, rowid DESC LIMIT ?', peer, before ?? 1e15, O.page + 1).toArray();
    const items: Item[] = []; let size = 200, more = rows.length > O.page;
    for (const r of rows.slice(0, O.page)) {
      size += r.json.length + 1;
      if (size > FRAME_ROOM) { more = true; break; }                // the frame limit: the rest comes with the next page
      items.push(JSON.parse(r.json) as Item);
    }
    this.send(ws, { type: 'conv', with: peer, items, more });
    try {
      const seen = await this.account(peer).seenOf(peer);
      if (this.convExists(peer)) this.sql.exec('UPDATE convs SET seen = ? WHERE peer = ?', JSON.stringify(seen), peer);
      this.send(ws, { type: 'seen', tag: peer, seen });
    } catch { /* not known now: asked again with the next page */ }
  }
  /** May `to` receive an invitation or a meeting from this account? */
  private async accepts(to: Tag): Promise<'ok' | 'unavailable' | 'unknown-recipient'> {
    const r = await this.account(to).acceptsFrom(to, this.tag!);
    return r === 'ok' ? 'ok' : r === 'unknown' ? 'unknown-recipient' : 'unavailable';
  }

  // ------------------------------------------------------------------ authority: invitations and meetings
  /** Ticks an item this account is the authority of (expiry, missed) and returns it as it stands. */
  private current(peer: Tag, id: string): { item: Item; rev: number } | null {
    const had = this.getItem(peer, id); if (!had) return null;
    const { item, rev } = had, now = Date.now();
    const t = item.k === 'invite' ? inviteNext(item, peer, 'expire', null, now) : item.k === 'meet' ? meetNext(item, peer, 'tick', null, now, TIMES) : null;
    if (t && t.ok && t.changed) { this.changed(peer, t.item, rev + 1); return { item: t.item, rev: rev + 1 }; }
    return had;
  }
  /** A new state of an item this account is the authority of: kept, pushed here, sent to the other account (outbox). */
  private changed(peer: Tag, item: Item, rev: number, tellPeer = true) {
    this.putItem(peer, item, rev);
    this.push({ type: 'item', with: peer, item, ...this.peerProfile(peer) });
    if (tellPeer) this.ctx.waitUntil(this.enqueue({ kind: 'deliver', to: peer, item, rev }));
  }
  /** RPC (the guest's account, or this one): an invitation of this host answered, or revoked by the host. */
  async inviteAct(me: Tag, ref: string, by: Tag, act: InviteAct): Promise<AuthorityAnswer> {
    if (!this.existing(me)) return { ok: false, reason: 'not-found' };
    const f = this.findItem(ref);
    if (!f || f.item.k !== 'invite' || f.item.from !== me || (by !== me && by !== f.peer)) return { ok: false, reason: 'not-found' };
    const cur = this.current(f.peer, ref)!, item = cur.item as InviteItem;
    const r = inviteNext(item, f.peer, act, by, Date.now());
    if (!r.ok) return r;
    if (!r.changed) return { ok: true, item: r.item, rev: cur.rev };
    const rev = cur.rev + 1;
    this.changed(f.peer, r.item, rev, by === me);                  // the guest's own request: its account keeps the answer itself
    if (r.item.state === 'revoked' && item.state === 'accepted') await this.enqueue({ kind: 'visitEnd', to: f.peer, host: me, invite: ref });
    if (r.item.state !== 'open' && r.item.state !== 'accepted') this.sql.exec('DELETE FROM snapshots WHERE invite = ?', ref);
    await this.schedule();
    return { ok: true, item: r.item, rev };
  }
  /** RPC: a meeting this account proposed, answered, countered, cancelled, or someone is here. */
  async meetAct(me: Tag, ref: string, by: Tag, act: MeetAct): Promise<AuthorityAnswer> {
    if (!this.existing(me)) return { ok: false, reason: 'not-found' };
    const f = this.findItem(ref);
    if (!f || f.item.k !== 'meet' || f.item.from !== me || (by !== me && by !== f.peer)) return { ok: false, reason: 'not-found' };
    const cur = this.current(f.peer, ref)!;
    const r = meetNext(cur.item as MeetItem, f.peer, act, by, Date.now(), TIMES);
    if (!r.ok) return r;
    if (!r.changed) return { ok: true, item: r.item, rev: cur.rev };
    const rev = cur.rev + 1;
    this.changed(f.peer, r.item, rev, by === me);
    await this.schedule();
    return { ok: true, item: r.item, rev };
  }
  /** RPC (the guest's account): the host's home as the host has it, if an accepted invitation allows it now. */
  async visitFor(me: Tag, guest: Tag): Promise<VisitAnswer> {
    if (!this.existing(me)) return { ok: false, reason: 'no-invite' };
    if (this.blocks(guest)) return { ok: false, reason: 'blocked' };
    const invites = this.sql.exec<{ id: string }>(`SELECT id FROM items WHERE peer = ? AND k = 'invite' AND mine = 1`, guest).toArray()
      .map(r => this.current(guest, r.id)!.item as InviteItem);
    const v = visitCheck(invites, guest, Date.now());
    if (!v.ok) return v;
    const snap = this.sql.exec<{ json: string }>('SELECT json FROM snapshots WHERE invite = ?', v.invite.id).toArray()[0];
    if (!snap) return { ok: false, reason: 'no-invite' };
    return { ok: true, snapshot: JSON.parse(snap.json) as HomeSnapshot, perms: v.invite.perms, invite: v.invite.id };
  }
  /** RPC (CityRoom): may `guest` be in this host's home space now? (an accepted, unrevoked, unexpired invitation; not blocked) */
  async mayVisit(guest: Tag, host?: Tag): Promise<boolean> {
    const me = host ?? this.selfTag(); if (!me || !isTag(guest)) return false;
    const r = await this.visitFor(me, guest);
    return r.ok;
  }
  /** RPC: where this player is, for `asker` with an accepted invitation or meeting between them (else null). */
  async whereFor(me: Tag, asker: Tag): Promise<{ hub: HubId | null; room: number } | null> {
    if (!this.existing(me) || this.blocks(asker)) return null;
    const items = this.sql.exec<{ id: string }>(`SELECT id FROM items WHERE peer = ? AND k IN ('invite', 'meet')`, asker).toArray().map(r => this.current(asker, r.id)!.item);
    if (!findAllowed(items, Date.now(), TIMES)) return null;
    if (!this.liveSockets().length) return { hub: null, room: 0 };
    try { const w = JSON.parse(this.metaGet('where') ?? 'null') as { hub: HubId | null; room: number } | null; return w ?? { hub: null, room: 0 }; } catch { return { hub: null, room: 0 }; }
  }

  // ------------------------------------------------------------------ RPC between accounts
  /** RPC: an item from `from`'s account (new, or a newer state). Kept and pushed unless this account blocked `from` (then text is dropped silently). */
  async deliver(me: Tag, from: Tag, profile: Profile, item: Item, rev: number): Promise<{ status: 'ok' | 'dropped' | 'unknown'; profile?: Profile }> {
    if (!this.existing(me)) return { status: 'unknown' };
    if (!isTag(from) || !isItem(item)) return { status: 'dropped' };
    const known = !!this.getItem(from, item.id), blocked = this.blocks(from);
    if (deliveryOf(item, { blocked, known }) === 'drop') return { status: 'dropped', profile: this.myProfile() };
    this.ensureConv(from, profile);
    if (this.putItem(from, item, rev) !== 'stale') {
      this.push({ type: 'item', with: from, item, ...this.peerProfile(from) });
      if (item.k === 'pay') { try { const b = await this.ledger().ledgerState(me); if (b) this.push({ type: 'balance', balance: b.balance, today: b.today }); } catch { /* the next welcome says it */ } }
    }
    return { status: 'ok', profile: this.myProfile() };
  }
  /** RPC: may `from` send this account an invitation or a meeting? */
  async acceptsFrom(me: Tag, from: Tag): Promise<'ok' | 'unavailable' | 'unknown'> {
    if (!this.existing(me)) return 'unknown';
    return this.blocks(from) ? 'unavailable' : 'ok';
  }
  async profileOf(me: Tag): Promise<Profile | null> { return this.existing(me) ? this.myProfile() : null; }
  async seenOf(me: Tag): Promise<Seen> {
    if (!this.existing(me)) return 'never';
    const last = Number(this.metaGet('lastSeen') ?? this.metaGet('created') ?? 0);
    return seenOf({ sockets: this.liveSockets().length, lastSeen: last || null, exists: true });
  }
  /** RPC: a contact came online or left: its line in the list says so. */
  async peerSeen(me: Tag, peer: Tag, seen: Seen): Promise<void> {
    if (!this.existing(me) || !this.convExists(peer)) return;
    this.sql.exec('UPDATE convs SET seen = ? WHERE peer = ?', JSON.stringify(seen), peer);
    this.push({ type: 'seen', tag: peer, seen });
  }
  /** RPC: the host revoked (or blocked): a guest inside leaves. */
  async visitEnd(me: Tag, host: Tag, invite: string): Promise<void> {
    if (!this.existing(me)) return;
    this.push({ type: 'visit-end', host, invite });
  }
  /** RPC: `blocker` blocked this account: this account's invitations to them are revoked and its meetings with them cancelled. */
  async blockedBy(me: Tag, blocker: Tag): Promise<void> {
    if (!this.existing(me)) return;
    await this.blockedEffects(me, blocker);
  }
  async reported(me: Tag): Promise<number> {
    if (!this.existing(me)) return 0;
    const n = Number(this.metaGet('reports') ?? 0) + 1; this.metaSet('reports', String(n)); return n;
  }
  /** What a block between this account and `other` changes among the items this account is the authority of. */
  private async blockedEffects(me: Tag, other: Tag) {
    const mine = this.sql.exec<{ id: string }>(`SELECT id FROM items WHERE peer = ? AND mine = 1 AND k IN ('invite', 'meet')`, other).toArray().map(r => this.current(other, r.id)!);
    for (const next of blockEffects(mine.map(x => x.item), me)) {
      const was = mine.find(x => x.item.id === next.id)!;
      this.changed(other, next, was.rev + 1);
      if (next.k === 'invite') {
        this.sql.exec('DELETE FROM snapshots WHERE invite = ?', next.id);
        if ((was.item as InviteItem).state === 'accepted') await this.enqueue({ kind: 'visitEnd', to: other, host: me, invite: next.id });
      }
    }
    await this.schedule();
  }
  /** Tells the most recent contacts that this account came online or left. */
  private async tellPeers(seen: Seen) {
    const me = this.tag; if (!me) return;
    const peers = this.sql.exec<{ peer: string }>('SELECT peer FROM convs ORDER BY last DESC LIMIT ?', SEEN_FANOUT).toArray().map(r => r.peer);
    await Promise.all(peers.map(p => this.account(p).peerSeen(p, me, seen).catch(() => {})));
  }
  /** Asks the most recent contacts whether they are online (after a connection: the cached lines may be old). */
  private async refreshSeen() {
    const peers = this.sql.exec<{ peer: string; seen: string | null }>('SELECT peer, seen FROM convs ORDER BY last DESC LIMIT ?', SEEN_FANOUT).toArray();
    await Promise.all(peers.map(async p => {
      try {
        const seen = await this.account(p.peer).seenOf(p.peer);
        if (JSON.stringify(seen) === p.seen) return;
        this.sql.exec('UPDATE convs SET seen = ? WHERE peer = ?', JSON.stringify(seen), p.peer);
        this.push({ type: 'seen', tag: p.peer, seen });
      } catch { /* asked again at the next connection */ }
    }));
  }

  // ------------------------------------------------------------------ outbox and alarm
  /** Sends to another account, now if it answers, else later (the alarm retries with a back-off). Idempotent on the other side. */
  private async enqueue(o: Out) {
    this.sql.exec('INSERT INTO outbox (json, next) VALUES (?, ?)', JSON.stringify(o), Date.now());
    await this.flush();
  }
  private flush(): Promise<void> {
    if (this.flushing) return this.flushing.then(() => this.flushOnce());
    this.flushing = this.flushOnce().finally(() => { this.flushing = null; });
    return this.flushing;
  }
  private async flushOnce() {
    const me = this.selfTag(); if (!me) return;
    for (let guard = 0; guard < 200; guard++) {
      const row = this.sql.exec<{ seq: number; json: string; tries: number }>('SELECT seq, json, tries FROM outbox WHERE next <= ? ORDER BY seq LIMIT 1', Date.now()).toArray()[0];
      if (!row) break;
      const o = JSON.parse(row.json) as Out;
      try {
        if (o.kind === 'deliver') {
          const r = await this.account(o.to).deliver(o.to, me, this.myProfile(), o.item, o.rev);
          const was = this.peerProfile(o.to);
          if (r.profile && (was.name !== nickname(r.profile.name) || was.look !== r.profile.look || was.app !== r.profile.app)) {
            this.ensureConv(o.to, r.profile);                      // a new conversation learns the other's name: its newest state says it
            const cur = this.getItem(o.to, o.item.id);
            if (cur) this.push({ type: 'item', with: o.to, item: cur.item, ...this.peerProfile(o.to) });
          }
        } else if (o.kind === 'visitEnd') await this.account(o.to).visitEnd(o.to, o.host, o.invite);
        else await this.account(o.to).blockedBy(o.to, me);
        this.sql.exec('DELETE FROM outbox WHERE seq = ?', row.seq);
      } catch (e) {
        const tries = row.tries + 1;
        if (tries >= OUTBOX_TRIES) { this.sql.exec('DELETE FROM outbox WHERE seq = ?', row.seq); console.log(JSON.stringify({ event: 'social-outbox-drop', kind: o.kind, error: String(e) })); continue; }
        this.sql.exec('UPDATE outbox SET tries = ?, next = ? WHERE seq = ?', tries, Date.now() + Math.min(600_000, 5_000 * 2 ** Math.min(tries, 7)), row.seq);
      }
    }
    await this.schedule();
  }
  /** The alarm: the next outbox retry, or the next invitation expiry or meeting deadline. */
  private async schedule() {
    if (this.role !== 'acct') return;
    const next = this.sql.exec<{ t: number | null }>('SELECT MIN(next) AS t FROM outbox').one().t;
    const due = this.sql.exec<{ t: number | null }>('SELECT MIN(due) AS t FROM items WHERE due IS NOT NULL').one().t;
    const at = Math.min(next ?? Infinity, due ?? Infinity);
    if (!Number.isFinite(at)) return;
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || cur > at || cur < Date.now() - 60_000) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 250));
  }
  async alarm(): Promise<void> {
    const me = this.selfTag(); if (!me) return;
    const now = Date.now();
    for (const r of this.sql.exec<{ peer: string; id: string }>('SELECT peer, id FROM items WHERE due IS NOT NULL AND due <= ?', now).toArray()) {
      const was = this.getItem(r.peer, r.id)!;
      const cur = this.current(r.peer, r.id);
      if (cur && cur.rev === was.rev) this.sql.exec('UPDATE items SET due = NULL WHERE peer = ? AND id = ?', r.peer, r.id);   // nothing more to wait for
      if (cur && cur.item.k === 'invite' && cur.item.state === 'expired' && (was.item as InviteItem).state === 'accepted') await this.enqueue({ kind: 'visitEnd', to: r.peer, host: me, invite: r.id });
    }
    await this.flush();
  }
}

function rowOp(r: Record<string, string | number | null>): StoredOp {
  return { id: String(r.id), kind: r.kind as StoredOp['kind'], a: String(r.a), b: r.b === null ? null : String(r.b), amount: Number(r.amount), fund: Number(r.fund), req: r.req === null ? null : String(r.req), note: r.note === null ? null : String(r.note), at: Number(r.at) };
}
function rowAsk(r: Record<string, string | number | null>): AskRow {
  return { id: String(r.id), payee: String(r.payee), payer: String(r.payer), amount: Number(r.amount), note: r.note === null ? null : String(r.note), state: r.state as AskRow['state'], paidBy: r.paidBy === null ? null : String(r.paidBy), at: Number(r.at) };
}
function parseSeen(v: string | null): Seen {
  try { const s = JSON.parse(v ?? 'null') as unknown; return s === 'online' || s === 'never' || (typeof s === 'number' && Number.isFinite(s)) ? s as Seen : 'never'; } catch { return 'never'; }
}
export type { MoneyRefusal };
