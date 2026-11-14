import { ECONOMY } from '../../src/economy/config';
import { applyMoney, openAccount } from '../../src/online/ledgerRules';
import { campHold, campRelease, campSettle, memoryCampLedger } from '../../src/online/campLedger';
import type { MoneyLimits, Tag } from '../../src/online/protocol';

/**
 * 1.0.1 Grand Camp: server/camp.ts run in vitest, on fakes of what the Workers runtime gives a Durable Object — its storage (plain maps, values
 * cloned as the runtime does), its hibernatable sockets (each one records what the match sent it and how it was closed), the alarm (set, then rung by
 * the test), and the two objects it talks to: the `ledger` (src/online/campLedger.ts on memoryCampLedger, the same calls server/social.ts makes, with
 * failures to inject) and the district's `list:<hub>` (another GrandCamp on its own storage). The test file mocks `cloudflare:workers` (see
 * tests/campServer.test.ts) and hands the loaded module here: server code is not part of the game's tsc (it is typechecked by server/tsconfig.json).
 */
export const LIMITS: MoneyLimits = { opMax: ECONOMY.online.opMax, fundDayMax: ECONOMY.online.fundDayMax, sendDayMax: ECONOMY.online.sendDayMax, receiveDayMax: ECONOMY.online.receiveDayMax, balanceMax: ECONOMY.online.balanceMax };

export class FakeStorage {
  m = new Map<string, unknown>();
  alarm: number | null = null;
  async get(k: string | string[]) {
    if (Array.isArray(k)) { const out = new Map<string, unknown>(); for (const x of k) if (this.m.has(x)) out.set(x, structuredClone(this.m.get(x))); return out; }
    return this.m.has(k) ? structuredClone(this.m.get(k)) : undefined;
  }
  async put(k: string | Record<string, unknown>, v?: unknown) {
    if (typeof k === 'string') { this.m.set(k, structuredClone(v)); return; }
    for (const [a, b] of Object.entries(k)) this.m.set(a, structuredClone(b));
  }
  async delete(k: string | string[]) { if (Array.isArray(k)) { let n = 0; for (const x of k) if (this.m.delete(x)) n++; return n; } return this.m.delete(k); }
  async deleteAll() { this.m.clear(); this.alarm = null; }
  async list(o: { prefix?: string; limit?: number; reverse?: boolean; start?: string; end?: string } = {}) {
    let keys = [...this.m.keys()].filter(k => (!o.prefix || k.startsWith(o.prefix)) && (o.start === undefined || k >= o.start) && (o.end === undefined || k < o.end)).sort();
    if (o.reverse) keys.reverse();
    if (o.limit !== undefined) keys = keys.slice(0, o.limit);
    this.lists.push({ ...o, read: keys.length });
    return new Map(keys.map(k => [k, structuredClone(this.m.get(k))]));
  }
  /** Every list() call, with how many rows it read (the list role must not read the whole district). */
  lists: { prefix?: string; limit?: number; reverse?: boolean; read: number }[] = [];
  async setAlarm(t: number) { this.alarm = t; }
  async getAlarm() { return this.alarm; }
  async deleteAlarm() { this.alarm = null; }
}

/** The match's end of a hibernatable socket: what it was sent, whether and how it was closed. */
export class FakeSocket {
  readyState = 1;
  sent: string[] = [];
  closed: { code: number; reason: string } | null = null;
  private att: unknown = null;
  constructor(public tag: string) {}
  send(s: string) { if (this.readyState !== 1) throw new Error('closed'); this.sent.push(s); }
  close(code = 1000, reason = '') { if (this.readyState >= 2) return; this.readyState = 2; this.closed = { code, reason }; }
  serializeAttachment(v: unknown) { this.att = structuredClone(v); }
  deserializeAttachment() { return structuredClone(this.att); }
  /** What the match sent, parsed (snapshots left out unless asked). */
  msgs(withSnaps = false) { return this.sent.map(s => JSON.parse(s) as Record<string, unknown> & { type: string }).filter(m => withSnaps || m.type !== 's'); }
  acks() { return this.msgs().filter(m => m.type === 'ack') as unknown as { id: string; ok: boolean; reason?: string; duplicate?: boolean }[]; }
  money() { return this.msgs().filter(m => m.type === 'money') as unknown as { step: string; op: string; amount: number; failed?: string; why?: string }[]; }
  last<T = Record<string, unknown>>(type: string) { return this.msgs(type === 's').filter(m => m.type === type).pop() as T | undefined; }
}

class FakeCtx {
  sockets: { ws: FakeSocket; tags: string[] }[] = [];
  waits: Promise<unknown>[] = [];
  ready: Promise<unknown> = Promise.resolve();
  constructor(public storage: FakeStorage) {}
  setWebSocketAutoResponse() { /* ping → pong: never reaches the object */ }
  blockConcurrencyWhile(fn: () => Promise<unknown>) { this.ready = fn(); return this.ready; }
  acceptWebSocket(ws: FakeSocket, tags: string[]) { this.sockets.push({ ws, tags }); }
  getWebSockets(tag?: string) { return this.sockets.filter(s => s.ws.readyState < 3 && (tag === undefined || s.tags.includes(tag))).map(s => s.ws); }
  getTags(ws: FakeSocket) { return this.sockets.find(s => s.ws === ws)?.tags ?? []; }
  waitUntil(p: Promise<unknown>) { this.waits.push(p.catch(() => {})); }
}

type Fault = 'hold' | 'release' | 'settle' | 'pool';
/** The `ledger` object's Grand Camp calls (server/social.ts), on plain maps. `fail[x]`: that many of the next calls throw before reaching the ledger; `lost[x]`: run, then the answer is lost (throws). */
export class FakeLedger {
  s = memoryCampLedger();
  fail: Partial<Record<Fault, number>> = {};
  lost: Partial<Record<Fault, number>> = {};
  calls: Record<Fault, number> = { hold: 0, release: 0, settle: 0, pool: 0 };
  now = () => Date.now();
  account(tag: Tag, money = 10_000) {
    openAccount(this.s, tag, this.now());
    if (money) this.s.transaction(() => applyMoney(this.s, { kind: 'fund', id: `fund-${tag}-${money}`, tag, amount: money }, this.now(), LIMITS));
  }
  balance(tag: Tag) { return this.s.account(tag)?.balance ?? null; }
  /** That call never answers (the ledger's object died with it in flight). */
  hang: Partial<Record<Fault, boolean>> = {};
  private gate<T>(k: Fault, run: () => T): T {
    this.calls[k]++;
    if (this.hang[k]) return new Promise<never>(() => {}) as unknown as T;
    if (this.fail[k]) { this.fail[k]!--; throw new Error('Network connection lost.'); }
    const out = run();
    if (this.lost[k]) { this.lost[k]!--; throw new Error('Network connection lost.'); }
    return out;
  }
  async campHold(r: Parameters<typeof campHold>[1]) { this.held.push(r.op); return this.gate('hold', () => this.s.tx(() => campHold(this.s, r, this.now(), LIMITS))); }
  /** Every hold op the match asked for. */
  held: string[] = [];
  async campRelease(r: Parameters<typeof campRelease>[1]) { return this.gate('release', () => this.s.tx(() => campRelease(this.s, r, this.now()))); }
  /** A settlement this says yes to throws inside the ledger's transaction (nothing written), as a stuck op id or a broken pool would. */
  settleThrows: ((r: Parameters<typeof campSettle>[1]) => boolean) | null = null;
  async campSettle(r: Parameters<typeof campSettle>[1]) {
    return this.gate('settle', () => this.s.tx(() => { if (this.settleThrows?.(r)) throw new Error('UNIQUE constraint failed: camp_ops.id'); return campSettle(this.s, r, this.now()); }));
  }
  async campPool(match: string) { return this.gate('pool', () => ({ pool: this.s.pool(match), holds: this.s.holds(match) })); }
  async campBalance() { /* the account's sockets: none here */ }
}

/** What the test calls on a GrandCamp (the class is untyped here: server code is outside this tsconfig). */
export interface CampObject {
  fetch(r: unknown): Promise<{ status: number }>;
  webSocketMessage(ws: FakeSocket, m: string | ArrayBuffer): Promise<void>;
  webSocketClose(ws: FakeSocket, code?: number, reason?: string, clean?: boolean): Promise<void>;
  alarm(): Promise<void>;
  campList(hub: string, tag: string | null): Promise<{ match: string; created: number; org: { tag: string } }[]>;
  campListPut(e: unknown, invited: string[]): Promise<void>;
  campListDrop(match: string): Promise<void>;
  [k: string]: unknown;
}
type CampClass = new (ctx: unknown, env: unknown) => CampObject;

let installed = false;
/** The runtime's globals a Durable Object's code uses: WebSocketPair, the ping auto-response, a Response that takes 101. */
function install() {
  if (installed) return; installed = true;
  const g = globalThis as Record<string, unknown>;
  g.WebSocketPair = class { 0: FakeSocket; 1: FakeSocket; constructor() { this[0] = new FakeSocket(''); this[1] = new FakeSocket(''); } };
  g.WebSocketRequestResponsePair = class { constructor(public request: string, public response: string) {} };
  const Real = globalThis.Response;
  g.Response = class { status: number; webSocket?: unknown; body: unknown; constructor(body: unknown, init: { status?: number; webSocket?: unknown } = {}) { this.body = body; this.status = init.status ?? 200; this.webSocket = init.webSocket; } static real = Real; };
}

export class CampRig {
  ledger = new FakeLedger();
  lists = new Map<string, { obj: CampObject; storage: FakeStorage; ctx: FakeCtx }>();
  env: Record<string, unknown>;
  logs: Record<string, unknown>[] = [];
  constructor(private Camp: CampClass, vars: Record<string, string> = {}) {
    install();
    const rig = this;
    this.env = {
      ...vars,
      SOCIAL: { getByName: (name: string) => (name === 'ledger' ? rig.ledger : { campBalance: async () => {} }) },
      CAMPS: { getByName: (name: string) => rig.list(name).obj },
    };
  }
  /** The `list:<hub>` object (made on first use). */
  list(name: string) {
    let l = this.lists.get(name);
    if (!l) { const storage = new FakeStorage(), ctx = new FakeCtx(storage); l = { obj: new this.Camp(ctx, this.env), storage, ctx }; this.lists.set(name, l); }
    return l;
  }
  /** A match object on `storage` (a new one: a restart of the same object on what it had saved). */
  async match(storage = new FakeStorage()) {
    const ctx = new FakeCtx(storage), obj = new this.Camp(ctx, this.env);
    await ctx.ready;
    return new MatchHandle(this, obj, ctx, storage);
  }
  /** console.log of the server code, parsed (camp.ts logs one JSON object per line). */
  capture() {
    const orig = console.log;
    console.log = (...a: unknown[]) => { try { this.logs.push(JSON.parse(String(a[0])) as Record<string, unknown>); } catch { orig(...a); } };
    return () => { console.log = orig; };
  }
}

export class MatchHandle {
  constructor(public rig: CampRig, public obj: CampObject, public ctx: FakeCtx, public storage: FakeStorage) {}
  /** The object's private state (lobby, game, outcome…), for the test's eyes only. */
  get priv() { return this.obj as unknown as Record<string, unknown> & { lobby: { data: Record<string, unknown> & { players: Record<string, unknown>[] } } | null; game: unknown; outcome: unknown }; }
  /** Every queued change done (requests, socket openings, the timer's work). */
  async flush() { for (let i = 0; i < 6; i++) { await (this.obj as unknown as { queue: Promise<void> }).queue; await Promise.all(this.ctx.waits); await new Promise(r => setTimeout(r, 0)); } }
  /** A player's socket to this match (the Worker's headers: the tag from the device key, the match id). */
  async connect(tag: Tag, match: string, name = 'Joueur') {
    const headers = new Map([['x-dakar-tag', tag], ['x-camp-match', match], ['upgrade', 'websocket']]);
    const req = { url: `https://x/api/camp?match=${match}&name=${encodeURIComponent(name)}&look=1`, headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null } };
    const before = this.ctx.sockets.length;
    const res = await this.obj.fetch(req);
    if (res.status !== 101) throw new Error(`refused ${res.status}`);
    const ws = this.ctx.sockets[before].ws; ws.tag = tag;
    await this.flush();
    return ws;
  }
  /** A request (its id a fresh uuid unless given), answered once by an ack. */
  async req(ws: FakeSocket, m: Record<string, unknown>) {
    const msg = { id: crypto.randomUUID(), ...m };
    await this.obj.webSocketMessage(ws, JSON.stringify(msg));
    await this.flush();
    return ws.acks().filter(a => a.id === msg.id).pop() ?? null;
  }
  async raw(ws: FakeSocket, s: string) { await this.obj.webSocketMessage(ws, s); }
  /** The player's network drops this socket (the runtime then calls webSocketClose). */
  async drop(ws: FakeSocket) { ws.readyState = 3; await this.obj.webSocketClose(ws, 1006, '', false); await this.flush(); }
  async ring() { await this.obj.alarm(); await this.flush(); }
  /** A player as the lobby's view shows them (what the clients see). */
  shown(tag: Tag) { return (this.priv.lobby as unknown as { view(): { players: (Record<string, unknown> & { tag: string })[] } } | null)?.view().players.find(p => p.tag === tag); }
  seat(tag: Tag) { return this.priv.lobby?.data.players.find(p => p.tag === tag) as (Record<string, unknown> & { hold: string; ready: boolean; sid: number; op?: string }) | undefined; }
}
