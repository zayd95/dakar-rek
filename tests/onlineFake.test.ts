import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeOnline, stubWorld, type FakeOnline } from '../src/online/fake';
import { onlineHooks } from '../src/online/api';
import type { AskItem, InviteItem, MeetItem } from '../src/online/protocol';

/**
 * The in-memory account (src/online/fake.ts) keeps the OnlineApi's semantics the Messages app and the visits lane rely on: answers by op id (a double
 * tap or a resend never applies twice, a refusal is not stored), texts sent offline wait and go with the same id, Teranga Money takes its balance first
 * and the rest from the wallet (refunded once when refused), a withdrawal credits the wallet once, a request is paid at most once, invitations and
 * meetings move through their states, blocking revokes and cancels, and the scripted other player drives the other side.
 */
const AWA = 'a11ce0000000a001', FATOU = 'c0ffee000000c003';
let wallet = 0, labels: string[] = [];
let now = Date.UTC(2026, 9, 25, 12);
const make = (o: Parameters<typeof createFakeOnline>[0] = {}) => createFakeOnline({ now: () => now, latency: 10, wallet: { get: () => wallet, add: (n, l) => { wallet += n; labels.push(l); } }, ...o });
const flush = async (ms = 20) => { await vi.advanceTimersByTimeAsync(ms); };

beforeEach(() => { vi.useFakeTimers(); wallet = 20_000; labels = []; now = Date.UTC(2026, 9, 25, 12); });
afterEach(() => { vi.useRealTimers(); for (const k of Object.keys(onlineHooks)) delete (onlineHooks as Record<string, unknown>)[k]; });

describe('reading and texts', () => {
  it('starts with the demo: two conversations, Awa’s last line unread, a friend code, a balance', () => {
    const f = make();
    expect(f.convs().map(c => c.name)).toEqual(['Awa', 'Moussa']);
    expect(f.unread()).toBe(1);
    expect(f.me?.code).toBe('F00D-FEED-CAFE-0001');
    expect(f.balance?.amount).toBe(3000);
    f.read(AWA); expect(f.unread()).toBe(0);
  });
  it('a text shows at once as « sending », then acknowledged; an incoming one counts as unread', async () => {
    const f = make(), changes = vi.fn(); f.onChange(changes);
    const r = f.say(AWA, '  On se voit à 18 h ?  ');
    expect(r.ok).toBe(true);
    const mine = f.items(AWA).at(-1)!;
    expect(mine).toMatchObject({ k: 'text', text: 'On se voit à 18 h ?', status: 'sending' });
    await flush();
    expect(f.items(AWA).at(-1)!.status).toBeUndefined();
    expect(changes).toHaveBeenCalled();
    f.read(AWA);
    f.as('Awa').say('Oui, à la Corniche');
    expect(f.unread()).toBe(1);
    expect(f.convs()[0].last).toMatchObject({ k: 'text', from: AWA });
  });
  it('offline, a text waits (« sending ») and goes with the same id when the account is back', async () => {
    const f = make(); f.setStatus('offline');
    const r = f.say(AWA, 'Tu es là ?'); if (!r.ok) throw new Error();
    await flush(100);
    expect(f.items(AWA).find(i => i.id === r.id)!.status).toBe('sending');
    f.setStatus('online'); await flush();
    expect(f.items(AWA).find(i => i.id === r.id)!.status).toBeUndefined();
    expect(f.items(AWA).filter(i => i.id === r.id)).toHaveLength(1);
  });
  it('a failure is said on the item; nothing reaches a player not on Messages; empty text is refused', () => {
    const f = make(); f.failNext('rate-limited');
    const r = f.say(AWA, 'vite'); if (!r.ok) throw new Error();
    expect(f.items(AWA).find(i => i.id === r.id)).toMatchObject({ status: 'failed', reason: 'rate-limited' });
    const never = f.say(FATOU, 'Salut');
    expect(never.ok).toBe(false); if (!never.ok) expect(never.reason).toBe('unknown-recipient');
    expect(f.say(AWA, '   ').ok).toBe(false);
  });
});

describe('Teranga Money', () => {
  it('payQuote: Teranga Money first, the rest from the wallet; limits and shortfalls refused with a sentence', () => {
    const f = make();
    expect(f.payQuote(5000)).toEqual({ amount: 5000, fromOnline: 3000, fromWallet: 2000 });
    expect(f.payQuote(2000)).toEqual({ amount: 2000, fromOnline: 2000, fromWallet: 0 });
    expect(f.payQuote(30_000).refusal).toBe('insufficient');
    expect(f.payQuote(0).refusal).toBe('amount');
    expect(f.payQuote(300_000).refusal).toBe('limit-op');
    f.setMoney({ today: { sent: 499_000 } }); expect(f.payQuote(5000).refusal).toBe('limit-send');
    f.setMoney({ today: { sent: 0, funded: 499_000 } }); expect(f.payQuote(5000).refusal).toBe('limit-fund');
    f.setStatus('offline'); expect(f.payQuote(100).refusal).toBe('offline');
    expect(f.payQuote(100).text).toMatch(/Hors ligne/);
  });
  it('a send of 5 000 F tapped twice (same id) pays once: the wallet top-up debited once, both histories once', async () => {
    const f = make(), id = f.newId();
    const a = f.pay({ id, to: AWA, amount: 5000, note: 'Pour le taxi' }), b = f.pay({ id, to: AWA, amount: 5000, note: 'Pour le taxi' });
    expect(wallet).toBe(18_000);                                                  // the top-up part left the wallet before the request
    await flush();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.ok && rb.ok).toBe(true);
    const again = await f.pay({ id, to: AWA, amount: 5000 }); expect(again.ok).toBe(true);
    expect(wallet).toBe(18_000);
    expect(f.balance!.amount).toBe(0);
    expect(f.ops.filter(o => o.id === id)).toHaveLength(1);
    expect(f.items(AWA).filter(i => i.k === 'pay' && i.id === id)).toHaveLength(1);
    expect(f.today!.sent).toBe(5000); expect(f.today!.funded).toBe(2000);
    expect(f.calls.filter(c => c.kind === 'pay' && c.id === id)).toHaveLength(3);
  });
  it('a refused send refunds the wallet once and is not stored (a new confirmation needs a new id)', async () => {
    const f = make(), id = f.newId();
    f.failNext('limit-receive', 'Awa a reçu le maximum permis aujourd’hui.');
    const p = f.pay({ id, to: AWA, amount: 5000 }); expect(wallet).toBe(18_000);
    await flush(); const r = await p;
    expect(r.ok).toBe(false); if (!r.ok) expect(r.text).toMatch(/maximum/);
    expect(wallet).toBe(20_000); expect(f.balance!.amount).toBe(3000);
    expect(labels).toEqual(['Teranga Money · recharge', 'Teranga Money · recharge annulée']);
    expect(f.ops.some(o => o.id === id)).toBe(false);
  });
  it('a request is paid at most once, by the payment that names it', async () => {
    const f = make(), req = f.as('Awa').ask(2000, 'Pour le ndogou');
    const p1 = f.pay({ id: f.newId(), to: AWA, amount: 2000, req }); await flush(); expect((await p1).ok).toBe(true);
    expect(f.items(AWA).find(i => i.id === req)).toMatchObject({ k: 'ask', state: 'paid' });
    const p2 = f.pay({ id: f.newId(), to: AWA, amount: 2000, req }); await flush(); const r2 = await p2;
    expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.reason).toBe('request-closed');
    const p3 = f.pay({ id: f.newId(), to: AWA, amount: 999, req: f.as('Awa').ask(1000) }); await flush(); const r3 = await p3;
    expect(r3.ok).toBe(false); if (!r3.ok) expect(r3.reason).toBe('request-mismatch');
  });
  it('the player’s own request: the other pays it (balance up) or declines it; the payee may cancel an open one', async () => {
    const f = make(), p = f.ask({ id: f.newId(), to: AWA, amount: 5000, note: 'Le taxi' }); await flush();
    const r = await p; if (!r.ok) throw new Error(r.text);
    f.as('Awa').payAsk(r.item.id);
    expect((f.items(AWA).find(i => i.id === r.item.id) as AskItem).state).toBe('paid');
    expect(f.balance!.amount).toBe(8000); expect(f.today!.received).toBe(5000);
    const p2 = f.ask({ id: f.newId(), to: AWA, amount: 1000 }); await flush(); const r2 = await p2; if (!r2.ok) throw new Error();
    const c = f.closeAsk({ id: f.newId(), ref: r2.item.id, how: 'cancelled' }); await flush();
    expect((await c).ok).toBe(true);
    expect((f.items(AWA).find(i => i.id === r2.item.id) as AskItem).state).toBe('cancelled');
  });
  it('top-up and withdrawal: the wallet moves once, by id; limits said', async () => {
    const f = make(), id = f.newId();
    const a = f.fund({ id, amount: 10_000 }), b = f.fund({ id, amount: 10_000 }); await flush(); await Promise.all([a, b]);
    expect(wallet).toBe(10_000); expect(f.balance!.amount).toBe(13_000);
    const cid = f.newId(), c = f.cashout({ id: cid, amount: 4000 }); await flush(); expect((await c).ok).toBe(true);
    const c2 = f.cashout({ id: cid, amount: 4000 }); await flush(); expect((await c2).ok).toBe(true);
    expect(wallet).toBe(14_000); expect(f.balance!.amount).toBe(9000);
    const big = f.fund({ id: f.newId(), amount: 50_000 }); await flush(); const rb = await big;
    expect(rb.ok).toBe(false); if (!rb.ok) expect(rb.reason).toBe('insufficient');
    const h = f.history(); await flush(); const rh = await h; if (!rh.ok) throw new Error();
    expect(rh.ops[0].kind).toBe('cashout'); expect(rh.ops.map(o => o.kind)).toContain('fund');
  });
});

describe('invitations, meetings, privacy', () => {
  it('an invitation needs a home; the other accepts it; the host can revoke it', async () => {
    const f = make();
    const none = f.invite({ id: f.newId(), to: AWA, perms: { use: true } }); await flush();
    expect((await none).ok).toBe(false);
    stubWorld();
    const p = f.invite({ id: f.newId(), to: AWA, perms: { use: false } }); await flush(); const r = await p; if (!r.ok) throw new Error(r.text);
    expect(r.item).toMatchObject({ k: 'invite', state: 'open', perms: { use: false } });
    f.as('Awa').accept(r.item.id);
    expect((f.items(AWA).find(i => i.id === r.item.id) as InviteItem).state).toBe('accepted');
    const rv = f.revokeInvite({ id: f.newId(), ref: r.item.id }); await flush(); expect((await rv).ok).toBe(true);
    expect((f.items(AWA).find(i => i.id === r.item.id) as InviteItem).state).toBe('revoked');
  });
  it('a guest accepts an invitation and may visit; the host revoking it ends the visit', async () => {
    const f = make(), ends = vi.fn(); f.onVisitEnd(ends);
    const inv = f.as('Awa').invite({ use: true });
    const a = f.answerInvite({ id: f.newId(), ref: inv, accept: true }); await flush(); expect((await a).ok).toBe(true);
    const v = f.visit(AWA); await flush(); const rv = await v; if (!rv.ok) throw new Error(rv.text);
    expect(rv.invite).toBe(inv); expect(rv.perms.use).toBe(true);
    f.as('Awa').cancel(inv);
    expect(ends).toHaveBeenCalledWith(AWA, inv);
  });
  it('a meeting: proposed, countered (the first becomes « countered »), accepted, then met when both are there', async () => {
    const f = make(), place = { id: 'corniche:pitch', hub: 'corniche' as const, name: 'Terrain' };
    const p = f.meet({ id: f.newId(), to: AWA, place, when: now + 120_000 }); await flush(); const r = await p; if (!r.ok) throw new Error(r.text);
    const counter = f.as('Awa').counter(r.item.id, now + 240_000);
    expect((f.items(AWA).find(i => i.id === r.item.id) as MeetItem).state).toBe('countered');
    const a = f.answerMeet({ id: f.newId(), ref: counter, accept: true }); await flush(); expect((await a).ok).toBe(true);
    f.here(counter); f.as('Awa').here(counter);
    expect((f.items(AWA).find(i => i.id === counter) as MeetItem).state).toBe('met');
    const fd = f.find(AWA); await flush(); expect((await fd).ok).toBe(true);
  });
  it('the player counters a meeting: the proposal they answer becomes « countered »', async () => {
    const f = make(), place = { id: 'x', hub: 'pikine' as const, name: 'Arène' };
    const m = f.as('Awa').meet(place, 0);
    const p = f.meet({ id: f.newId(), to: AWA, place, when: now + 60_000, counter: m }); await flush(); const r = await p;
    expect(r.ok).toBe(true);
    expect((f.items(AWA).find(i => i.id === m) as MeetItem).state).toBe('countered');
  });
  it('blocking: unread hidden, invitations revoked, meetings cancelled, money refused; forget removes the conversation; lookup by code', async () => {
    const f = make(), inv = f.as('Awa').invite(), place = { id: 'x', hub: 'pikine' as const, name: 'Arène' }, m = f.as('Awa').meet(place, 0);
    const b = f.block(AWA, true); await flush(); expect((await b).ok).toBe(true);
    expect(f.isBlocked(AWA)).toBe(true); expect(f.unread()).toBe(0);
    expect((f.items(AWA).find(i => i.id === inv) as InviteItem).state).toBe('revoked');
    expect((f.items(AWA).find(i => i.id === m) as MeetItem).state).toBe('cancelled');
    const pay = f.pay({ id: f.newId(), to: AWA, amount: 100 }); await flush(); const rp = await pay;
    expect(rp.ok).toBe(false); if (!rp.ok) expect(rp.reason).toBe('unavailable');
    const rep = f.report(AWA, 'arnaque'); await flush(); expect((await rep).ok).toBe(true); expect(f.reports).toHaveLength(1);
    const fg = f.forget(AWA); await flush(); expect((await fg).ok).toBe(true);
    expect(f.convs().some(c => c.with === AWA)).toBe(false);
    const lk = f.lookup('d00d-0000-0000-0d04'); await flush(); const rl = await lk;
    expect(rl.ok && rl.name).toBe('Ibou');
    const nf = f.lookup('0000-0000-0000-0000'); await flush(); expect((await nf).ok).toBe(false);
  });
});

describe('the script', () => {
  it('drives presence, balance and limits, and the next failure', async () => {
    const f: FakeOnline = make({ demo: false, peers: [{ tag: AWA, name: 'Awa', seen: 'never' }] });
    expect(f.convs()).toEqual([]);
    expect(f.seen(AWA)).toBe('never');
    f.as(AWA).seen(now - 300_000); expect(f.seen(AWA)).toBe(now - 300_000);
    f.setMoney({ balance: 42_000, limits: { opMax: 10_000 } });
    expect(f.balance!.amount).toBe(42_000); expect(f.payQuote(20_000).refusal).toBe('limit-op');
    f.setStatus('offline'); expect(f.balance!.fresh).toBe(false);
  });
});
