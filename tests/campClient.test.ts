import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampClient, campRefusalText } from '../src/online/campClient';
import { CAMP_INPUT_HZ, encodeSnap, stepBody, type CampLobbyView, type CampSnapshot } from '../src/multiplayer/campProtocol';

/**
 * 1.0.1 Grand Camp: the client module D2 builds on (src/online/campClient.ts), against a scripted socket: requests answered once, every money step
 * pending → done | failed only on the server's word, the reconnect to the same place with the same request ids, events in the server's order, the
 * result before any payout, interpolation and the own body's prediction, the stick's rate.
 */
class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0; sent: string[] = [];
  private l: Record<string, ((e: unknown) => void)[]> = {};
  constructor(public url: string) { FakeWS.all.push(this); }
  addEventListener(t: string, fn: (e: unknown) => void) { (this.l[t] ??= []).push(fn); }
  send(s: string) { this.sent.push(s); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close', {}); }
  emit(t: string, e: unknown) { for (const fn of this.l[t] ?? []) fn(e); }
  // the server's side
  open() { this.readyState = 1; this.emit('open', {}); }
  recv(m: unknown) { this.emit('message', { data: typeof m === 'string' ? m : JSON.stringify(m) }); }
  drop() { this.readyState = 3; this.emit('close', {}); }
  msgs() { return this.sent.filter(s => s !== 'ping').map(s => JSON.parse(s) as Record<string, unknown>); }
  static last() { return FakeWS.all[FakeWS.all.length - 1]; }
}
const ME = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb', M = '0123456789abcdef', KEY = 'f'.repeat(32);
const lobby = (o: Partial<CampLobbyView> = {}, me: Partial<CampLobbyView['players'][0]> = {}): CampLobbyView => ({
  match: M, state: 'lobby', terms: { fee: 1000, size: 6, dist: 'team', open: true, hub: 'corniche' }, frozen: true, org: B, teams: ['Rouge', 'Jaune'],
  players: [{ tag: B, name: 'Org', look: 1, team: 0, ready: false, hold: 'none', on: true, at: 1, sid: 1 }, { tag: ME, name: 'Moi', look: 2, team: 1, ready: false, hold: 'none', on: true, at: 2, sid: 2, ...me }],
  pool: 0, full: 6000, created: 1, closes: 600_001, ...o,
});
let clock = 1_000_000;
function client(extra: Partial<ConstructorParameters<typeof CampClient>[0]> = {}) {
  return new CampClient({ key: () => KEY, profile: () => ({ name: 'Moi', look: 2 }), endpoint: 'http://127.0.0.1:9/api/camp', WebSocketImpl: FakeWS as unknown as typeof WebSocket, now: () => clock, ...extra });
}
async function connected(c: CampClient, l: CampLobbyView | null = lobby()) {
  const opening = c.open(M);
  const ws = FakeWS.last();
  ws.open(); ws.recv({ type: 'welcome', feature: 'camp', v: 1, match: M, you: ME, time: clock, hz: 20, lobby: l });
  await opening;
  return ws;
}
const lastReq = (ws: FakeWS, type: string) => ws.msgs().filter(m => m.type === type).pop() as { id: string } & Record<string, unknown>;
const snap = (k: number, x: number, seq = 0, extra: Partial<CampSnapshot> = {}): CampSnapshot => ({
  k, clock: k / 20, half: 1, phase: 'play', score: [0, 0], ball: { x, z: 0, h: 0.11, vx: 0, vz: 0, vh: 0 },
  players: [{ sid: 2, x, z: 1, vx: 0, vz: 0, f: 0, seq }], own: -1, ownTeam: -1, taker: -1, ...extra,
});

beforeEach(() => { FakeWS.all = []; vi.useFakeTimers(); clock = 1_000_000; });
afterEach(() => { vi.useRealTimers(); });

describe('Grand Camp client: the socket and requests', () => {
  it('connects with the device key, the match and the profile; the welcome gives my tag and the lobby (my place, team, terms)', async () => {
    const c = client(), ws = await connected(c);
    const u = new URL(ws.url);
    expect(u.protocol).toBe('ws:'); expect(u.pathname).toBe('/api/camp');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ match: M, key: KEY, name: 'Moi', look: '2' });
    expect(c.state).toMatchObject({ status: 'open', me: ME, match: M });
    expect(c.mySeat()).toMatchObject({ team: 1, ready: false, sid: 2 });
    expect(c.state.lobby?.terms.fee).toBe(1000);
  });
  it('a request resolves only with the server’s answer; a refusal comes with its French sentence', async () => {
    const c = client(), ws = await connected(c);
    let done = false;
    const p = c.team(0).then(r => { done = true; return r; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    ws.recv({ type: 'ack', id: lastReq(ws, 'team').id, ok: false, reason: 'team-full' });
    expect(await p).toEqual({ ok: false, reason: 'team-full', text: campRefusalText('team-full') });
    expect(campRefusalText('team-full')).toBe('Cette équipe est complète.');
  });
  it('creating a match: a fresh match id, then `create` with the terms', async () => {
    const c = client();
    const p = c.create({ fee: 0, size: 10, dist: 'single', open: false, hub: 'plateau' });
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeWS.last(), match = new URL(ws.url).searchParams.get('match')!;
    expect(match).toMatch(/^[0-9a-f]{16}$/);
    ws.open(); ws.recv({ type: 'welcome', feature: 'camp', v: 1, match, you: ME, time: clock, hz: 20, lobby: null });
    await vi.advanceTimersByTimeAsync(0);
    const req = lastReq(ws, 'create');
    expect(req.terms).toEqual({ fee: 0, size: 10, dist: 'single', open: false, hub: 'plateau' });
    ws.recv({ type: 'ack', id: req.id, ok: true, match });
    expect(await p).toEqual({ ok: true, match });
  });
  it('a dropped connection: back-off, the same match again, and the request not answered sent again with the same id', async () => {
    const c = client(), ws = await connected(c);
    const p = c.join(1);
    const id = lastReq(ws, 'join').id;
    ws.drop();
    expect(c.state.status).toBe('reconnecting');
    expect(FakeWS.all.length).toBe(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(FakeWS.all.length).toBe(2);
    const ws2 = FakeWS.last();
    expect(new URL(ws2.url).searchParams.get('match')).toBe(M);
    ws2.drop();                                                                       // a second failure waits longer
    await vi.advanceTimersByTimeAsync(700);
    expect(FakeWS.all.length).toBe(2);
    await vi.advanceTimersByTimeAsync(800);
    const ws3 = FakeWS.last();
    ws3.open(); ws3.recv({ type: 'welcome', feature: 'camp', v: 1, match: M, you: ME, time: clock, hz: 20, lobby: lobby() });
    expect(lastReq(ws3, 'join').id).toBe(id);
    ws3.recv({ type: 'ack', id, ok: true, duplicate: true });
    expect(await p).toEqual({ ok: true });
    expect(c.state.status).toBe('open');
  });
  it('the server ends it for good (removed): closed, never reconnected', async () => {
    const c = client(), ws = await connected(c);
    ws.recv({ type: 'bye', reason: 'removed' }); ws.drop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeWS.all.length).toBe(1);
    expect(c.state).toMatchObject({ status: 'closed', bye: 'removed' });
  });
});

describe('Grand Camp client: money steps, on the server’s word only', () => {
  it('« Prêt »: hold pending, then done with the ledger’s op and balance; « Pas prêt »: release pending, then done', async () => {
    const c = client(), ws = await connected(c);
    const p = c.ready();
    expect(c.state.money).toMatchObject([{ step: 'hold', state: 'pending', amount: 1000 }]);
    const id = lastReq(ws, 'ready').id;
    ws.recv({ type: 'money', step: 'hold', op: id, amount: 1000, balance: 4000 });
    ws.recv({ type: 'lobby', lobby: lobby({ pool: 1000 }, { ready: true, hold: 'held' }) });
    ws.recv({ type: 'ack', id, ok: true });
    expect(await p).toEqual({ ok: true });
    expect(c.state.money[0]).toMatchObject({ step: 'hold', state: 'done', op: id, balance: 4000 });
    expect(c.mySeat()).toMatchObject({ ready: true, hold: 'held' });
    const q = c.unready();
    expect(c.state.money[1]).toMatchObject({ step: 'release', state: 'pending' });
    const id2 = lastReq(ws, 'unready').id;
    ws.recv({ type: 'money', step: 'release', op: `r-${id}`, amount: 1000, balance: 5000, why: 'unready' });
    ws.recv({ type: 'ack', id: id2, ok: true });
    await q;
    expect(c.state.money[1]).toMatchObject({ step: 'release', state: 'done', amount: 1000, balance: 5000 });
    expect(c.state.money.length).toBe(2);
  });
  it('a refusal: the hold failed with its reason (nothing taken); no answer: still pending, never shown done', async () => {
    const c = client(), ws = await connected(c);
    const p = c.ready();
    ws.recv({ type: 'ack', id: lastReq(ws, 'ready').id, ok: false, reason: 'insufficient' });
    expect(await p).toMatchObject({ ok: false, reason: 'insufficient' });
    expect(c.state.money[0]).toMatchObject({ step: 'hold', state: 'failed', reason: 'insufficient', text: campRefusalText('insufficient') });
    const q = c.ready();
    ws.recv({ type: 'ack', id: lastReq(ws, 'ready').id, ok: false, reason: 'offline' });
    await q;
    expect(c.state.money[1]).toMatchObject({ step: 'hold', state: 'pending' });
  });
  it('with the account’s top-up: the part Teranga Money lacks comes in first, then the hold from Teranga Money; a refused top-up holds nothing', async () => {
    const topUp = vi.fn(async (_a: number) => ({ ok: true as const }));
    const c = client({ topUp }), ws = await connected(c);
    const p = c.ready({ fund: 600 });
    await vi.advanceTimersByTimeAsync(0);
    expect(topUp).toHaveBeenCalledWith(600);
    expect(lastReq(ws, 'ready')).not.toHaveProperty('fund');
    ws.recv({ type: 'ack', id: lastReq(ws, 'ready').id, ok: true }); await p;
    const d = client({ topUp: async () => ({ ok: false, reason: 'limit-fund', text: 'x' }) }), ws2 = await connected(d);
    expect(await d.ready({ fund: 600 })).toMatchObject({ ok: false, reason: 'limit-fund' });
    expect(ws2.msgs().some(m => m.type === 'ready')).toBe(false);
    expect(d.state.money[0]).toMatchObject({ step: 'hold', state: 'failed', reason: 'limit-fund' });
    const e = client(), ws3 = await connected(e);                                    // without it (tools): the wallet part rides in the hold
    void e.ready({ fund: 600 }); await vi.advanceTimersByTimeAsync(0);
    expect(lastReq(ws3, 'ready').fund).toBe(600);
  });
  it('the connection lost before kick-off: the fee the server returned meanwhile is shown back at the reconnect', async () => {
    const c = client(), ws = await connected(c, lobby({}, { ready: true, hold: 'held' }));
    ws.drop(); await vi.advanceTimersByTimeAsync(700);
    const ws2 = FakeWS.last(); ws2.open();
    ws2.recv({ type: 'welcome', feature: 'camp', v: 1, match: M, you: ME, time: clock, hz: 20, lobby: lobby({}, { ready: false, hold: 'none' }) });
    expect(c.state.money).toMatchObject([{ step: 'release', state: 'done', amount: 1000, why: 'drop' }]);
  });
  it('the end: no payout before the result; the result (written by the ledger) brings the payout', async () => {
    const c = client(), ws = await connected(c, lobby({ state: 'play' }, { ready: true, hold: 'held' }));
    ws.recv({ type: 'ev', e: [{ n: 9, k: 'full', c: 2400, sc: [3, 1] }] });
    ws.recv({ type: 'lobby', lobby: lobby({ state: 'over' }, { ready: true, hold: 'held' }) });
    expect(c.myPayout()).toBeNull();
    expect(c.state.money.filter(m => m.step === 'payout')).toEqual([]);
    ws.recv({ type: 'result', result: { end: 'win', score: [3, 1], winner: 1, dist: 'team', fee: 1000, total: 6000, payouts: [{ tag: ME, amount: 2000 }], money: 'settled', at: clock } });
    expect(c.myPayout()).toBe(2000);
    expect(c.state.money).toMatchObject([{ step: 'payout', state: 'done', amount: 2000 }]);
    ws.recv({ type: 'money', step: 'payout', op: `w-${M}-${ME}`, amount: 2000, balance: 6000 });   // (the same payout: not twice)
    expect(c.state.money.filter(m => m.step === 'payout').length).toBeLessThanOrEqual(2);
    expect(c.state.money.filter(m => m.step === 'payout' && m.op).length).toBeLessThanOrEqual(1);
  });
});

describe('Grand Camp client: the match', () => {
  it('events: in the server’s order, each once (a backlog after a reconnect repeats some), each told to onEvent once', async () => {
    const c = client(), ws = await connected(c);
    const told: number[] = []; c.onEvent(e => told.push(e.n));
    ws.recv({ type: 'ev', e: [{ n: 1, k: 'kickoff', c: 0, team: 0 }] });
    ws.recv({ type: 'ev', e: [{ n: 3, k: 'shot', c: 40, team: 0, who: 1 }, { n: 2, k: 'pass', c: 30, team: 0, who: 1, to: 3 }] });
    ws.recv({ type: 'ev', e: [{ n: 1, k: 'kickoff', c: 0, team: 0 }, { n: 2, k: 'pass', c: 30, team: 0, who: 1, to: 3 }, { n: 4, k: 'goal', c: 50, team: 0, who: 1, sc: [1, 0] }] });
    expect(c.state.events.map(e => e.n)).toEqual([1, 2, 3, 4]);
    expect(told).toEqual([1, 3, 2, 4]);
  });
  it('the roster at kick-off gives my pitch number; the view interpolates two ticks behind; my body is predicted from my unanswered sticks', async () => {
    const c = client(), ws = await connected(c, lobby({ state: 'play' }));
    ws.recv({ type: 'start', roster: [{ sid: 1, tag: B, team: 0 }, { sid: 2, tag: ME, team: 1 }], kick: 0, seconds: 240, goals: 3, tick: 0 });
    expect(c.state.sid).toBe(2);
    for (let k = 10; k <= 14; k++) { clock = 1_000_000 + k * 50; ws.recv(encodeSnap(snap(k, k))); }
    clock = 1_000_000 + 14 * 50;
    const v = c.view()!;
    expect(v.k).toBeCloseTo(12, 6); expect(v.ball.x).toBeCloseTo(12, 2); expect(v.players[0]).toMatchObject({ sid: 2, team: 1 });
    clock += 25;
    expect(c.view()!.ball.x).toBeCloseTo(12.5, 2);
    // two sticks the server has not applied yet: the prediction steps them as the server will
    clock += 25; c.input(1, 0, Math.PI / 2); clock += 50; c.input(1, 0, Math.PI / 2);
    const sent = ws.msgs().filter(m => m.type === 'in');
    expect(sent.map(m => m.s)).toEqual([1, 2]);
    const want = { x: 14, z: 1, vx: 0, vz: 0, f: 0 }; stepBody(want, 1, 0, Math.PI / 2, 0.05); stepBody(want, 1, 0, Math.PI / 2, 0.05);
    expect(c.predict()).toEqual(want);
    ws.recv(encodeSnap(snap(15, 14.2, 1)));                                          // the server applied the first one
    const want2 = { x: 14.2, z: 1, vx: 0, vz: 0, f: 0 }; stepBody(want2, 1, 0, Math.PI / 2, 0.05);
    const p = c.predict()!;
    expect(p.x).toBeCloseTo(want2.x, 9); expect(p.vx).toBeCloseTo(want2.vx, 9);
  });
  it('the stick goes at CAMP_INPUT_HZ at most; an action goes at once, never dropped; nothing before kick-off', async () => {
    const c = client(), ws = await connected(c, lobby({ state: 'lobby' }));
    c.input(1, 0, 0);
    expect(ws.msgs().filter(m => m.type === 'in').length).toBe(0);                  // no pitch number yet
    ws.recv({ type: 'lobby', lobby: lobby({ state: 'play' }) });
    ws.recv({ type: 'start', roster: [{ sid: 2, tag: ME, team: 1 }], kick: 0, seconds: 240, goals: 3, tick: 0 });
    for (let i = 0; i < 60; i++) { clock += 1000 / 60; c.input(0.5, 0.5, 1); }        // 60 frames: one second
    const n = ws.msgs().filter(m => m.type === 'in').length;
    expect(n).toBeGreaterThanOrEqual(CAMP_INPUT_HZ - 1); expect(n).toBeLessThanOrEqual(CAMP_INPUT_HZ + 1);
    clock += 5; c.input(0.5, 0.5, 1, 'shot', 0.8);
    expect(ws.msgs().filter(m => m.type === 'in').pop()).toMatchObject({ a: 'shot', p: 0.8 });
    c.input(3, 4, 0);                                                                // never longer than the full stick
    clock += 60; c.input(3, 4, 0);
    const last = ws.msgs().filter(m => m.type === 'in').pop() as { mx: number; mz: number };
    expect(Math.hypot(last.mx, last.mz)).toBeCloseTo(1, 3);
  });
});
