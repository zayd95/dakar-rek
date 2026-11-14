import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { newSave, writeSave, loadSave, type KV } from '../src/core/save';
import { GameState } from '../src/core/state';
import { applyMoney, createAsk, memoryLedger, openAccount, todayOf } from '../src/online/ledgerRules';
import { OnlineAccount, CACHE_KEY } from '../src/online/client';
import { onlineHooks } from '../src/online/api';
import type { ClientMessage, MoneyLimits } from '../src/online/protocol';

/**
 * LD2.0-B, the account client (src/online/client.ts) against a small stand-in for the server (the real ledger rules behind it): the device's side of
 * money end to end (reserved and saved before sending, refunded or credited once, the same id sent again after a lost answer or a reload), the text
 * outbox, the legacy block list handed over, and the solo build. The real server is checked by scripts/check-online-account.mjs.
 */
const L: MoneyLimits = { opMax: 250_000, fundDayMax: 500_000, sendDayMax: 500_000, receiveDayMax: 1_000_000, balanceMax: 5_000_000 };
const OTHER = 'f0f0f0f0f0f0f0f0';
type Msg = ClientMessage & { id?: string };
class FakeServer {
  ledger = memoryLedger();
  sockets: FakeWS[] = [];
  received: Msg[] = [];
  /** Ids whose answer is lost once (applied, never answered), and refusals to give. */
  swallow = new Set<string>(); refuse = new Map<string, string>(); duplicateAnswers = new Set<string>(); refuseText = new Map<string, string>();
  /** Ids answered « undecided » (`offline`: the server could not reach its ledger) this many times before being handled. */
  undecided = new Map<string, number>();
  constructor() { openAccount(this.ledger, OTHER, Date.now()); }
  connect(ws: FakeWS) {
    const tag = ws.url.searchParams.get('key')!.slice(0, 16);
    ws.tag = tag; this.sockets.push(ws);
    const a = openAccount(this.ledger, tag, Date.now());
    ws.deliver({ type: 'welcome', v: 1, tag, code: tag.toUpperCase().match(/.{4}/g)!.join('-'), time: Date.now(), balance: a.balance, limits: L, today: todayOf(a, Date.now()), convs: [], blocked: [] });
  }
  times: number[] = [];
  /** Milliseconds each frame takes the server (a busy machine: a burst of frames then spans time), 0 by default. */
  slowMs = 0;
  handle(ws: FakeWS, m: Msg) {
    if (this.slowMs) { const until = Date.now() + this.slowMs; while (Date.now() < until) { /* busy */ } }
    this.received.push(m); this.times.push(Date.now());
    const ack = (x: object) => { if (m.id && this.swallow.delete(m.id)) return; ws.deliver({ type: 'ack', id: m.id, ...x }); if (m.id && this.duplicateAnswers.has(m.id)) ws.deliver({ type: 'ack', id: m.id, duplicate: true, ...x }); };
    if (m.id && this.refuse.has(m.id)) { ack({ ok: false, reason: this.refuse.get(m.id) }); return; }
    if (m.id && (this.undecided.get(m.id) ?? 0) > 0) { this.undecided.set(m.id, this.undecided.get(m.id)! - 1); ack({ ok: false, reason: 'offline' }); return; }
    if (m.type === 'fund' || m.type === 'cashout' || m.type === 'pay') {
      const r = this.ledger.transaction(() => applyMoney(this.ledger, m.type === 'pay' ? { kind: 'pay', id: m.id!, tag: ws.tag, to: m.to, amount: m.amount, fund: m.fund, ...(m.req ? { req: m.req } : {}) } : { kind: m.type, id: m.id!, tag: ws.tag, amount: m.amount }, Date.now(), L));
      if (!r.ok) { ack({ ok: false, reason: r.reason }); return; }
      const item = m.type === 'pay' ? { id: m.id, k: 'pay', from: ws.tag, at: r.op.at, amount: r.op.amount, op: r.op.id } : undefined;
      ack({ ok: true, ...(r.duplicate ? { duplicate: true } : {}), op: r.op, balance: r.balance, ...(item ? { item } : {}) });
      return;
    }
    if (m.type === 'say' && this.refuseText.has(m.text)) { ack({ ok: false, reason: this.refuseText.get(m.text) }); return; }
    if (m.type === 'say') { ack({ ok: true, item: { id: m.id, k: 'text', from: ws.tag, at: Date.now(), text: m.text } }); return; }
    if (m.id) ack({ ok: true });
  }
}
class FakeWS {
  static server: FakeServer;
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0; url: URL; tag = '';
  onmessage: ((e: { data: string }) => void) | null = null; onclose: ((e: object) => void) | null = null; onerror: (() => void) | null = null;
  constructor(url: URL | string) { this.url = new URL(String(url)); setTimeout(() => { this.readyState = 1; FakeWS.server.connect(this); }, 1); }
  send(data: string) {
    if (this.readyState !== 1) throw new Error('closed');
    if (data === 'ping') { this.deliver('pong'); return; }
    FakeWS.server.handle(this, JSON.parse(data) as Msg);
  }
  close() { this.readyState = 3; }
  deliver(m: object | string) { setTimeout(() => { if (this.readyState === 1) this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }, 1); }
  /** The network goes: the client sees its socket close. */
  drop() { this.readyState = 3; this.onclose?.({}); }
}
const mem = (m = new Map<string, string>()): KV & Storage & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } });
const KEY = 'abcdef0123456789abcdef0123456789', TAG = KEY.slice(0, 16);
const clients: OnlineAccount[] = [];
function setup(o: { wallet?: number; storage?: ReturnType<typeof mem>; state?: GameState; enabled?: boolean; saveOk?: () => boolean } = {}) {
  const storage = o.storage ?? mem(); storage.setItem('dakarrek.chat.key', KEY);
  const state = o.state ?? new GameState(newSave(1));
  if (o.wallet !== undefined) state.data.wallet = o.wallet;
  const saves: { wallet: number; pending: number }[] = [];
  const saveNow = () => { saves.push({ wallet: state.data.wallet, pending: state.data.online.pending.length }); return (o.saveOk?.() ?? true) && writeSave(storage, state.data); };
  const client = new OnlineAccount({ state, saveNow, profile: () => ({ name: 'Awa', look: 1 }), enabled: o.enabled ?? true, storage });
  clients.push(client);
  return { client, state, storage, saves };
}
const online = (c: OnlineAccount) => vi.waitFor(() => expect(c.status).toBe('online'), { timeout: 3000 });
const sockets = () => FakeWS.server.sockets.filter(s => s.readyState === 1);

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.window = globalThis; g.addEventListener = () => {}; g.location = { href: 'http://test.local/' };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  g.WebSocket = FakeWS;
});
afterEach(() => { for (const c of clients.splice(0)) (c as unknown as { stopSocket(): void }).stopSocket(); });

describe('the account client', () => {
  it('a build without the server is solo: nothing is sent, every request says so', async () => {
    FakeWS.server = new FakeServer();
    const { client } = setup({ enabled: false });
    expect(client.status).toBe('solo');
    expect(client.say(OTHER, 'Salut')).toMatchObject({ ok: false, reason: 'solo' });
    expect(await client.fund({ id: client.newId(), amount: 1000 })).toMatchObject({ ok: false, reason: 'solo', text: expect.stringContaining('pas disponible') });
    expect(FakeWS.server.sockets).toHaveLength(0);
  });

  it('connects: the account, the friend code, the balance and the limits', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup();
    await online(client);
    expect(client.me).toEqual({ tag: TAG, code: 'ABCD-EF01-2345-6789' });
    expect(client.balance).toMatchObject({ amount: 0, fresh: true }); expect(client.limits).toEqual(L);
    expect(state.data.online.tag).toBe(TAG);
  });

  it('a top-up: the wallet is debited and the game saved before the request leaves; the answer closes it', async () => {
    FakeWS.server = new FakeServer();
    const { client, state, saves } = setup({ wallet: 60_000 });
    await online(client);
    const id = client.newId();
    const r = await client.fund({ id, amount: 20_000 });
    expect(r).toMatchObject({ ok: true, op: { kind: 'fund', amount: 20_000 } });
    expect(saves[0]).toEqual({ wallet: 40_000, pending: 1 });           // saved with the debit and the entry, before sending
    expect(FakeWS.server.received.find(m => m.id === id)).toBeTruthy();
    expect(state.data.wallet).toBe(40_000); expect(state.data.online).toMatchObject({ pending: [], refs: [id], balance: 20_000 });
    expect(await client.fund({ id, amount: 20_000 })).toMatchObject({ ok: true });   // the same confirmation again: the same answer
    expect(FakeWS.server.received.filter(m => m.id === id)).toHaveLength(1);
  });

  it('if the save cannot be written, nothing is sent and nothing is debited', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 60_000, saveOk: () => false });
    await online(client);
    const r = await client.fund({ id: client.newId(), amount: 20_000 });
    expect(r).toMatchObject({ ok: false, reason: 'save', text: expect.stringContaining('rien n’a été envoyé ni débité') });
    expect(state.data.wallet).toBe(60_000); expect(state.data.online.pending).toEqual([]);
    expect(FakeWS.server.received.some(m => m.type === 'fund')).toBe(false);
  });

  it('a send with a top-up refused by the server: the wallet part comes back, once', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 10_000 });
    await online(client);
    expect(client.payQuote(5_000)).toEqual({ amount: 5_000, fromOnline: 0, fromWallet: 5_000 });
    const id = client.newId();
    FakeWS.server.refuse.set(id, 'unavailable'); FakeWS.server.duplicateAnswers.add(id);
    const r = await client.pay({ id, to: OTHER, amount: 5_000 });
    expect(r).toMatchObject({ ok: false, reason: 'unavailable', text: 'Cette personne n’est pas joignable.' });
    await new Promise(res => setTimeout(res, 30));                        // the second (duplicate) refusal arrives too
    expect(state.data.wallet).toBe(10_000);
    expect(state.data.ledger.filter(e => e.label.startsWith('Teranga Money')).map(e => e.amount)).toEqual([-5_000, 5_000]);
  });

  it('a lost answer: the op stays pending, the same id goes again after the reconnect, applied once', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 50_000 });
    await online(client);
    const id = client.newId();
    FakeWS.server.swallow.add(id);
    const waiting = client.pay({ id, to: OTHER, amount: 5_000, note: 'Pour le taxi' });
    await vi.waitFor(() => expect(FakeWS.server.received.some(m => m.id === id)).toBe(true));
    expect(state.data.online.pending.map(p => p.id)).toEqual([id]);
    sockets()[0].drop();                                                  // the network goes before the answer
    await online(client);
    await vi.waitFor(() => expect(state.data.online.pending).toEqual([]), { timeout: 3000 });
    expect(await waiting).toMatchObject({ ok: true, op: { id, amount: 5_000 } });
    expect(FakeWS.server.received.filter(m => m.id === id)).toHaveLength(2);
    expect(FakeWS.server.ledger.account(OTHER)!.balance).toBe(5_000);     // credited once
    expect(state.data.wallet).toBe(45_000);
    expect(client.items(OTHER).map(i => i.id)).toEqual([id]);
  });

  it('a reload with a pending top-up: the next connection sends the same id; a withdrawal credits the wallet once', async () => {
    FakeWS.server = new FakeServer();
    const first = setup({ wallet: 30_000 });
    await online(first.client);
    const id = first.client.newId();
    FakeWS.server.swallow.add(id);
    void first.client.fund({ id, amount: 10_000 });
    await vi.waitFor(() => expect(FakeWS.server.received.some(m => m.id === id)).toBe(true));
    (first.client as unknown as { stopSocket(): void }).stopSocket();    // the page is closed
    const state = new GameState(loadSave(first.storage)!);
    expect(state.data.wallet).toBe(20_000); expect(state.data.online.pending.map(p => p.id)).toEqual([id]);
    const again = setup({ storage: first.storage, state });
    await online(again.client);
    await vi.waitFor(() => expect(state.data.online.pending).toEqual([]), { timeout: 3000 });
    expect(state.data.online.balance).toBe(10_000); expect(FakeWS.server.ledger.account(TAG)!.balance).toBe(10_000);
    const co = again.client.newId();
    FakeWS.server.duplicateAnswers.add(co);
    expect(await again.client.cashout({ id: co, amount: 4_000 })).toMatchObject({ ok: true });
    await new Promise(res => setTimeout(res, 30));
    expect(state.data.wallet).toBe(24_000);                               // credited once, though answered twice
    expect(JSON.parse(first.storage.getItem('dakarrek.guest.save.v6')!).wallet).toBe(24_000);   // and saved at once
  });

  it('text: shown at once as « sending », kept through a reload, sent with the same id once online; a refusal is shown, not resent', async () => {
    FakeWS.server = new FakeServer();
    const storage = mem(); storage.setItem(CACHE_KEY, JSON.stringify({ v: 1, tag: TAG }));
    const { client } = setup({ storage });
    const r = client.say(OTHER, '  Salut, ça va ?  ');
    expect(r.ok).toBe(true);
    expect(client.items(OTHER)).toMatchObject([{ k: 'text', text: 'Salut, ça va ?', status: 'sending' }]);
    await online(client);
    await vi.waitFor(() => expect(client.items(OTHER)[0].status).toBeUndefined());
    const id = (r as { id: string }).id;
    expect(FakeWS.server.received.filter(m => m.type === 'say').map(m => m.id)).toEqual([id]);
    FakeWS.server.refuseText.set('encore', 'rate-limited');
    const r2 = client.say(OTHER, 'encore');
    await vi.waitFor(() => expect(client.items(OTHER).find(i => i.id === (r2 as { id: string }).id)).toMatchObject({ status: 'failed', reason: 'rate-limited' }));
    await new Promise(res => setTimeout(res, 30));
    expect(FakeWS.server.received.filter(m => m.type === 'say' && m.text === 'encore')).toHaveLength(1);
    expect(client.say(OTHER, '   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(client.say(OTHER, 'x'.repeat(501))).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('the legacy chat panel’s blocks are handed to the account at the first connection, once', async () => {
    FakeWS.server = new FakeServer();
    const storage = mem(); storage.setItem('dakarrek.chat.v1', JSON.stringify({ blocked: [[OTHER, 'Ibou'], ['id:abc', 'Sans clé']], muted: [] }));
    const a = setup({ storage });
    await online(a.client);
    await vi.waitFor(() => expect(FakeWS.server.received.filter(m => m.type === 'block')).toMatchObject([{ tag: OTHER, on: true }]));
    expect(a.client.isBlocked(OTHER)).toBe(true);
    expect(a.client.say(OTHER, 'x')).toMatchObject({ ok: false, reason: 'blocked' });
    (a.client as unknown as { persistNow(): void }).persistNow();
    (a.client as unknown as { stopSocket(): void }).stopSocket();
    const b = setup({ storage });
    await online(b.client);
    await new Promise(res => setTimeout(res, 50));
    expect(FakeWS.server.received.filter(m => m.type === 'block')).toHaveLength(1);
  });

  it('a burst (a list asking who is online) is spread: never more than 15 frames in a second, also when each frame takes time to go', async () => {
    FakeWS.server = new FakeServer();
    const { client } = setup();
    await online(client);
    FakeWS.server.slowMs = 3;                                   // as on a busy CI runner: 15 frames span ~45 ms
    const tags = Array.from({ length: 30 }, (_, i) => `11111111111111${i.toString(16).padStart(2, '0')}`);
    for (const t of tags) expect(client.seen(t)).toBeNull();
    await vi.waitFor(() => expect(FakeWS.server.received.filter(m => m.type === 'conv')).toHaveLength(30), { timeout: 4000 });
    const t = FakeWS.server.times;
    for (let i = 0; i < t.length; i++) expect(t.filter(x => x >= t[i] && x < t[i] + 1000).length).toBeLessThanOrEqual(15);
  });

  it('a confirmation tapped twice: one request, the same answer for both taps', async () => {
    FakeWS.server = new FakeServer();
    const { client } = setup();
    await online(client);
    const o = { id: client.newId(), ref: '0e7c1b9a-3f42-4d1e-9a51-1f2e3d4c5b6a', accept: true };
    const [a, b] = await Promise.all([client.answerInvite(o), client.answerInvite(o)]);
    expect(a).toEqual({ ok: true }); expect(b).toEqual({ ok: true });
    expect(FakeWS.server.received.filter(m => m.id === o.id)).toHaveLength(1);
  });

  it('refusals before anything is sent: offline, limits, the wallet', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 1_000 });
    expect(await client.fund({ id: client.newId(), amount: 500 })).toMatchObject({ ok: false, reason: 'offline' });
    await online(client);
    expect(await client.fund({ id: client.newId(), amount: 250_001 })).toMatchObject({ ok: false, reason: 'limit-op', text: 'Au plus 250 000 F par opération.' });
    expect(await client.fund({ id: client.newId(), amount: 5_000 })).toMatchObject({ ok: false, reason: 'insufficient' });
    expect(await client.pay({ id: client.newId(), to: OTHER, amount: 5_000 })).toMatchObject({ ok: false, reason: 'insufficient' });
    expect(await client.pay({ id: client.newId(), to: TAG, amount: 500 })).toMatchObject({ ok: false, reason: 'self' });
    expect(state.data.wallet).toBe(1_000);
    expect((await client.lookup('pas un code'))).toMatchObject({ ok: false, reason: 'code' });
    void createAsk;
  });
});

/** 1.0.1: a send the server has not answered is « pending », shown as such, and becomes a yes or a no when the answer comes — never a guess. */
describe('a send waiting for the server (1.0.1)', () => {
  afterEach(() => { delete onlineHooks.moneySettled; vi.useRealTimers(); });
  const payCard = (c: OnlineAccount, id: string) => c.items(OTHER).find(i => i.id === id);

  it('is in its conversation at once as « sending », never as the last line of the list; the server’s yes makes it the server’s card', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 10_000 });
    await online(client);
    const id = client.newId(), sent = client.pay({ id, to: OTHER, amount: 3_000, note: 'Taxi' });
    expect(payCard(client, id)).toMatchObject({ k: 'pay', from: TAG, amount: 3_000, note: 'Taxi', status: 'sending' });   // before any answer
    expect(client.convs().find(c => c.with === OTHER)?.last ?? null).toBeNull();                                          // the list does not say « envoyés » yet
    expect(state.data.wallet).toBe(7_000);
    expect(await sent).toMatchObject({ ok: true, op: { id, amount: 3_000 } });
    expect(payCard(client, id)).toMatchObject({ k: 'pay', amount: 3_000 }); expect(payCard(client, id)?.status).toBeUndefined();
    expect(client.convs().find(c => c.with === OTHER)?.last).toMatchObject({ id, k: 'pay' });
  });

  it('a refusal turns the waiting card into « failed » with its reason; the wallet part is back; it is never sent again', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 10_000 });
    await online(client);
    const id = client.newId(); FakeWS.server.refuse.set(id, 'unavailable');
    expect(await client.pay({ id, to: OTHER, amount: 3_000 })).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(payCard(client, id)).toMatchObject({ status: 'failed', reason: 'unavailable' });
    expect(state.data.wallet).toBe(10_000); expect(state.data.online.pending).toEqual([]);
    sockets()[0].drop(); await online(client); await new Promise(r => setTimeout(r, 60));
    expect(FakeWS.server.received.filter(m => m.id === id)).toHaveLength(1);
  });

  it('no answer in time is « pending », not a refusal: asked again with the same id it waits for the one answer, which comes at the next connection (once on the ledger)', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 10_000 });
    await online(client);
    const told: unknown[] = []; onlineHooks.moneySettled = (op, r) => { told.push([op, r.ok]); };
    vi.useFakeTimers();
    const id = client.newId(); FakeWS.server.swallow.add(id);              // applied by the server, its answer lost
    const first = client.pay({ id, to: OTHER, amount: 4_000 });
    await vi.advanceTimersByTimeAsync(15_100);
    const r1 = await first;
    expect(r1).toMatchObject({ ok: false, reason: 'pending' }); expect((r1 as { text: string }).text).not.toMatch(/Rien/);
    expect(payCard(client, id)).toMatchObject({ status: 'sending' });      // still waiting: nothing is claimed either way
    expect(state.data.online.pending.map(p => p.id)).toEqual([id]); expect(state.data.wallet).toBe(6_000);
    const second = client.pay({ id, to: OTHER, amount: 4_000 });           // the sheet asks again: not a second operation
    expect(FakeWS.server.received.filter(m => m.id === id)).toHaveLength(1);
    sockets()[0].drop();                                                   // the connection goes and comes back: the same id is sent again
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await second).toMatchObject({ ok: true, op: { id, amount: 4_000 } });
    expect(FakeWS.server.received.filter(m => m.id === id)).toHaveLength(2);
    expect(FakeWS.server.ledger.account(OTHER)?.balance).toBe(4_000);      // once
    expect(payCard(client, id)?.status).toBeUndefined(); expect(state.data.online.pending).toEqual([]); expect(state.data.wallet).toBe(6_000);
    expect(told).toEqual([]);                                              // someone was waiting: the sheet says it, not the notice
  });

  it('an « undecided » answer (the server could not reach its ledger) is not the end: the same id goes again on the same connection, applied once', async () => {
    FakeWS.server = new FakeServer();
    const { client, state } = setup({ wallet: 1_000 });
    await online(client);
    const fund = client.newId();
    expect(await client.fund({ id: fund, amount: 1_000 })).toMatchObject({ ok: true });
    const id = client.newId(); FakeWS.server.undecided.set(id, 2);
    const r = await client.cashout({ id, amount: 600 });               // undecided twice, then applied: within the first wait, no reconnection
    expect(r).toMatchObject({ ok: true, op: { id, kind: 'cashout', amount: 600 } });
    expect(FakeWS.server.received.filter(m => m.id === id)).toHaveLength(3);
    expect(state.data.wallet).toBe(600); expect(state.data.online).toMatchObject({ pending: [], balance: 400 });
    expect(FakeWS.server.ledger.account(TAG)?.balance).toBe(400);      // once
  });

  it('after a reload nobody waits: the pending send is still shown waiting, is sent again, and its outcome is told through `moneySettled`', async () => {
    FakeWS.server = new FakeServer();
    const storage = mem();
    const one = setup({ wallet: 10_000, storage });
    await online(one.client);
    const id = one.client.newId(); FakeWS.server.swallow.add(id);
    void one.client.pay({ id, to: OTHER, amount: 2_500 });
    await vi.waitFor(() => expect(FakeWS.server.received.some(m => m.id === id)).toBe(true));
    (one.client as unknown as { persistNow(): void; stopSocket(): void }).persistNow();
    (one.client as unknown as { stopSocket(): void }).stopSocket();
    const told: [string, number, string | undefined, boolean][] = []; onlineHooks.moneySettled = (op, r) => { told.push([op.kind, op.amount, op.to, r.ok]); };
    const two = setup({ storage, state: new GameState(loadSave(storage)!) });
    expect(two.client.items(OTHER).find(i => i.id === id)).toMatchObject({ status: 'sending' });   // (read from the device's copy, before any connection)
    await online(two.client);
    await vi.waitFor(() => expect(told).toEqual([['pay', 2_500, OTHER, true]]));
    expect(two.client.items(OTHER).find(i => i.id === id)?.status).toBeUndefined();
    expect(two.state.data.wallet).toBe(7_500); expect(FakeWS.server.ledger.account(OTHER)?.balance).toBe(2_500);
  });

  it('a waiting card whose operation the save no longer holds was answered: it goes (the server’s card comes with the conversation)', async () => {
    FakeWS.server = new FakeServer();
    const storage = mem();
    storage.setItem(CACHE_KEY, JSON.stringify({ v: 1, tag: TAG, convs: [], items: { [OTHER]: [
      { id: 'pay-gone-0001', k: 'pay', from: TAG, at: 5, amount: 900, op: 'pay-gone-0001', status: 'sending' },
      { id: 'txt-lost-0001', k: 'text', from: TAG, at: 6, text: 'Salut', status: 'sending' }] }, outbox: [] }));
    const { client } = setup({ storage });
    const items = client.items(OTHER);
    expect(items.map(i => i.id)).toEqual(['txt-lost-0001']); expect(items[0]).toMatchObject({ status: 'failed' });   // (a text without its outbox entry is failed, as before)
    await online(client);
  });

  it('« Joueur », the account’s placeholder for someone it has not heard from, never replaces a name this device knows', async () => {
    FakeWS.server = new FakeServer();
    const { client } = setup();
    await online(client);
    const push = (id: string, name: string) => sockets()[0].deliver({ type: 'item', with: OTHER, item: { id, k: 'text', from: OTHER, at: Date.now(), text: 'Salut' }, name, look: 2 });
    push('txt-00000001', 'Moussa');
    await vi.waitFor(() => expect(client.convs()[0]?.name).toBe('Moussa'));
    push('txt-00000002', 'Joueur');
    await vi.waitFor(() => expect(client.items(OTHER)).toHaveLength(2));
    expect(client.convs()[0].name).toBe('Moussa'); expect(client.unread()).toBe(2);
  });
});
