import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CampRig, type CampObject, type FakeSocket, type MatchHandle } from './helpers/campServerRig';
import { campPayoutOp } from '../src/online/campLedger';

/**
 * 1.0.1 Grand Camp: the match object itself (server/camp.ts) on the fakes of tests/helpers/campServerRig.ts — what the review of the release candidate
 * found there (the review's C1 … M2 and minors), each proved here on the object's real request, socket, alarm and ledger paths.
 */
vi.mock('cloudflare:workers', () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } } }));

let Camp: new (ctx: unknown, env: unknown) => CampObject;
beforeAll(async () => {
  const path = '../server/camp';                                                     // (not a static import: server code is outside the game's tsconfig)
  Camp = (await import(/* @vite-ignore */ path) as { GrandCamp: typeof Camp }).GrandCamp;
});
const M = 'a1b2c3d4e5f60718', M2 = '0f1e2d3c4b5a6978';
const tag = (i: number) => i.toString(16).padStart(16, '0');
const terms = (o: Record<string, unknown> = {}) => ({ fee: 1000, size: 6, dist: 'team', open: true, hub: 'corniche', ...o });
type Priv = { game: { sim: { score: number[] }; stop(): void; seats: Map<number, { seq: number; body: { x: number; z: number } }>; snapshot(): { players: { sid: number }[] } } | null; stopTimer(): void; tick(): void; lobby: { data: Record<string, unknown> } | null };
const priv = (m: MatchHandle) => m.obj as unknown as Priv;
let undo: (() => void) | null = null;
afterEach(() => { undo?.(); undo = null; });

/** A lobby of six (the organizer = 1), every player with 10 000 F on Teranga Money; `ready`: all of them « Prêt ». */
async function lobby(rig: CampRig, o: { fee?: number; ready?: boolean; match?: string } = {}) {
  const match = o.match ?? M, m = await rig.match(), ws: FakeSocket[] = [];
  for (let i = 1; i <= 6; i++) { rig.ledger.account(tag(i)); ws.push(await m.connect(tag(i), match, `Joueur ${i}`)); }
  expect((await m.req(ws[0], { type: 'create', terms: terms({ fee: o.fee ?? 1000 }) }))?.ok).toBe(true);
  for (let i = 2; i <= 6; i++) expect((await m.req(ws[i - 1], { type: 'join' }))?.ok).toBe(true);
  if (o.ready) for (const w of ws) expect((await m.req(w, { type: 'ready' }))?.ok).toBe(true);
  return { m, ws };
}
/** The match kicked off by `lobby(…, { ready: true })`: its timer stopped (the test steps it), team 0 = players 1, 3, 5. */
function started(m: MatchHandle) { const p = priv(m); expect(p.game).not.toBeNull(); p.stopTimer(); return p; }
/** Full time with this score. */
async function fullTime(m: MatchHandle, score: [number, number]) { const p = priv(m); p.game!.sim.score[0] = score[0]; p.game!.sim.score[1] = score[1]; p.game!.stop(); p.tick(); await m.flush(); }

describe('Grand Camp server: the ledger’s ids are the server’s own (review C1)', () => {
  it('a « Prêt » whose request id is an opponent’s payout op is refused; the match then settles and pays the winners', async () => {
    const rig = new CampRig(Camp), { m, ws } = await lobby(rig);
    const forged = await m.req(ws[3], { type: 'ready', id: campPayoutOp(M, tag(1)) });
    expect(forged).toBeNull();                                                         // not even a readable id: no answer at all
    expect(m.seat(tag(4))).toMatchObject({ ready: false, hold: 'none' });
    expect(rig.ledger.calls.hold).toBe(0);
    for (const w of ws) expect((await m.req(w, { type: 'ready' }))?.ok).toBe(true);
    for (let i = 1; i <= 6; i++) expect(m.seat(tag(i))!.op).toMatch(new RegExp(`^h-${M}-${tag(i)}-\\d+$`));
    started(m);
    await fullTime(m, [1, 0]);
    const res = ws[0].last<{ result: { end: string; payouts: { tag: string; amount: number }[]; money: string } }>('result')!.result;
    expect(res).toMatchObject({ end: 'win', money: 'settled' });
    expect(res.payouts.map(p => [p.tag, p.amount])).toEqual([[tag(1), 2000], [tag(3), 2000], [tag(5), 2000]]);
    for (const i of [1, 3, 5]) expect(rig.ledger.balance(tag(i))).toBe(11_000);
    for (const i of [2, 4, 6]) expect(rig.ledger.balance(tag(i))).toBe(9000);
  });
  it('a settlement that keeps failing returns every fee after a bounded number of tries, and says so in the logs', async () => {
    const rig = new CampRig(Camp), { m, ws } = await lobby(rig, { ready: true });
    undo = rig.capture();
    started(m);
    rig.ledger.settleThrows = r => r.outcome.kind !== 'refund';                    // the winners' settlement throws every time (as a stuck op id did)
    await fullTime(m, [2, 1]);
    expect(ws[0].last('result')).toBeUndefined();                                       // nobody is shown a result before the ledger wrote one
    for (let k = 0; k < 12 && !ws[0].last('result'); k++) await m.ring();
    const res = ws[0].last<{ result: { end: string; money: string; payouts: { amount: number }[] } }>('result')?.result;
    expect(res).toMatchObject({ end: 'stopped', money: 'settled' });
    expect(res!.payouts.map(p => p.amount)).toEqual([1000, 1000, 1000, 1000, 1000, 1000]);
    for (let i = 1; i <= 6; i++) expect(rig.ledger.balance(tag(i))).toBe(10_000);
    expect(rig.ledger.calls.settle).toBeLessThanOrEqual(8);
    expect(rig.logs.some(l => l.event === 'camp-alert' && l.step === 'settle-refund')).toBe(true);
    const again = await rig.match();                                                    // nobody stays « busy »: player 1 holds a fee in another match
    const w = await again.connect(tag(1), M2);
    expect((await again.req(w, { type: 'create', terms: terms() }))?.ok).toBe(true);
    expect((await again.req(w, { type: 'ready' }))?.ok).toBe(true);
  });
});

describe('Grand Camp server: a reload mid-match plays on (review C2)', () => {
  it('the reloaded page’s socket replaces the old one (not closed yet): its sticks count from 1 and move the body; the old socket’s late frames are ignored', async () => {
    const rig = new CampRig(Camp), { m, ws } = await lobby(rig, { fee: 0, ready: true }), p = started(m);
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const sid = m.seat(tag(2))!.sid, seat = () => p.game!.seats.get(sid)!;
      for (let s = 1; s <= 400; s++) { now += 50; await m.raw(ws[1], JSON.stringify({ type: 'in', s, mx: 0, mz: 0.3, f: 0 })); p.tick(); }   // 20 s of play
      expect(seat().seq).toBe(400);
      const b = await m.connect(tag(2), M, 'Joueur 2');                                  // the reloaded page: a new CampClient, its counter at 0
      expect(ws[1].closed?.code).toBe(4000);
      expect(b.last('start')).toBeDefined();
      const at = { ...seat().body };
      for (let s = 1; s <= 40; s++) { now += 50; await m.raw(b, JSON.stringify({ type: 'in', s, mx: 0, mz: -1, f: Math.PI })); p.tick(); }
      expect(seat().seq).toBe(40);
      expect(Math.hypot(seat().body.x - at.x, seat().body.z - at.z)).toBeGreaterThan(5);
      await m.raw(ws[1], JSON.stringify({ type: 'in', s: 900, mx: 1, mz: 0, f: 0 }));     // a frame of the old page, late
      expect(seat().seq).toBe(40);
    } finally { clock.mockRestore(); }
  });
});

describe('Grand Camp server: a fee release the ledger could not do (review M1)', () => {
  it('« Pas prêt » while the ledger fails: the player is told it failed (not « nothing taken »), and the server returns the fee later by itself', async () => {
    const rig = new CampRig(Camp), { m, ws } = await lobby(rig);
    expect((await m.req(ws[1], { type: 'ready' }))?.ok).toBe(true);
    expect(rig.ledger.balance(tag(2))).toBe(9000);
    rig.ledger.fail.release = 1;
    expect((await m.req(ws[1], { type: 'unready' }))?.ok).toBe(true);              // « Pas prêt » is done: the place is not ready any more
    expect(ws[1].money().pop()).toMatchObject({ step: 'release', amount: 1000, failed: 'offline', why: 'unready' });
    expect(m.shown(tag(2))).toMatchObject({ ready: false, hold: 'none', owed: true });
    expect(rig.ledger.balance(tag(2))).toBe(9000);
    expect(m.storage.alarm).not.toBeNull();
    await m.ring();                                                                  // the alarm tries again
    expect(ws[1].money().pop()).toMatchObject({ step: 'release', amount: 1000, why: 'unready' });
    expect(ws[1].money().pop()!.failed).toBeUndefined();
    expect(rig.ledger.balance(tag(2))).toBe(10_000);
    expect(m.shown(tag(2))!.owed).toBeUndefined();
  });
  it('kick-off waits while a stray hold could not be returned; the match then starts with exactly its players’ fees', async () => {
    const rig = new CampRig(Camp), { m, ws } = await lobby(rig);
    expect((await m.req(ws[5], { type: 'ready' }))?.ok).toBe(true);
    rig.ledger.fail.release = 2;                                                    // its « Quitter » and the start's own try both fail
    expect((await m.req(ws[5], { type: 'leave' }))?.ok).toBe(true);
    expect(ws[5].money().pop()).toMatchObject({ step: 'release', failed: 'offline' });
    rig.ledger.account(tag(7)); const w7 = await m.connect(tag(7), M, 'Joueur 7');
    expect((await m.req(w7, { type: 'join' }))?.ok).toBe(true);
    for (const w of [...ws.slice(0, 5), w7]) expect((await m.req(w, { type: 'ready' }))?.ok).toBe(true);
    expect(priv(m).game).toBeNull();                                                 // not started with player 6's fee in the pool
    expect(rig.ledger.s.hold(M, tag(6))!.state).toBe('held');
    await m.ring();
    expect(priv(m).game).not.toBeNull();
    priv(m).stopTimer();
    expect(rig.ledger.balance(tag(6))).toBe(10_000);
    expect(rig.ledger.s.pool(M)!.held).toBe(6000);
  });
});

describe('Grand Camp server: the district’s list cannot be flooded (review M2)', () => {
  const listing = (i: number, created: number, org = tag(1000 + i)) => ({
    match: (0x1000000000000000n + BigInt(i) * 7919n).toString(16).padStart(16, '0'),        // the newest lobbies' ids sort past the first 1 000
    terms: terms(), org: { tag: org, name: `Org ${i}` }, teams: ['Rouge', 'Jaune'], count: 1, created, closes: created + 600_000,
  });
  it('one open lobby per organizer: a second one is refused while the first takes players; free again once it is cancelled or handed over', async () => {
    const rig = new CampRig(Camp), a = await rig.match(), b = await rig.match(), c = await rig.match();
    rig.ledger.account(tag(1));
    const w1 = await a.connect(tag(1), M), w2 = await b.connect(tag(1), M2);
    expect((await a.req(w1, { type: 'create', terms: terms() }))?.ok).toBe(true);
    expect(await b.req(w2, { type: 'create', terms: terms() })).toMatchObject({ ok: false, reason: 'org-busy' });
    expect(await rig.list('list:corniche').obj.campList('corniche', null)).toHaveLength(1);
    expect((await a.req(w1, { type: 'cancel' }))?.ok).toBe(true);
    await Promise.all(rig.list('list:corniche').ctx.waits); await a.flush();
    expect((await b.req(w2, { type: 'create', terms: terms() }))?.ok).toBe(true);
    // handed over: the organizer leaves, another player now organizes that lobby — the first may open a new one
    const w3 = await b.connect(tag(2), M2); rig.ledger.account(tag(2));
    expect((await b.req(w3, { type: 'join' }))?.ok).toBe(true);
    expect((await b.req(w2, { type: 'leave' }))?.ok).toBe(true);
    await b.flush();
    const w4 = await c.connect(tag(1), '1122334455667788');
    expect((await c.req(w4, { type: 'create', terms: terms() }))?.ok).toBe(true);
  });
  it('the list is the newest lobbies by creation, read from an index (never the first 1 000 rows by match id)', async () => {
    const rig = new CampRig(Camp), L = rig.list('list:corniche'), now = Date.now();
    for (let i = 0; i < 1200; i++) await L.obj.campListPut(listing(i, now - 590_000 + i * 400), []);
    for (let i = 0; i < 40; i++) await L.obj.campListPut(listing(5000 + i, now - 700_000 - i * 1000), []);   // stale rows (closed long ago, never dropped)
    L.storage.lists.length = 0;
    const out = await L.obj.campList('corniche', null);
    expect(out.map(x => x.created)).toEqual(Array.from({ length: 30 }, (_, k) => now - 590_000 + (1199 - k) * 400));
    expect(L.storage.lists.reduce((n, l) => n + l.read, 0)).toBeLessThanOrEqual(300);
    expect(L.storage.lists.every(l => (l.limit ?? Infinity) <= 300)).toBe(true);
    for (let k = 0; k < 3; k++) await L.obj.campList('corniche', null);           // the stale rows are swept from the old end, a few each time
    expect([...L.storage.m.keys()].filter(k => k.startsWith('c:')).length).toBeLessThan(1240);
    await L.obj.campListDrop(listing(1199, 0).match);
    expect((await L.obj.campList('corniche', null))[0].created).toBe(now - 590_000 + 1198 * 400);
  });
});

