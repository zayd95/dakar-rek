import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/economy/config';
import { rng } from '../src/core/rng';
import { applyMoney, openAccount } from '../src/online/ledgerRules';
import { campHold, campPayoutOp, campRelease, campSettle, memoryCampLedger, type CampOutcomeRow, type CampTermsRow } from '../src/online/campLedger';
import type { MoneyLimits } from '../src/online/protocol';

/**
 * 1.0.1 Grand Camp (docs/release/GRAND-CAMP-RULES-1.0.1.md « Technical safeguards »): the entry fees held by the Teranga Money ledger. Every path:
 * a hold at « Prêt » (funded as a send is), released (un-ready, leave, removed, a drop before kick-off), settled once (a team's equal split, one
 * winner, every fee returned); duplicates, messages out of order, a hold racing a cancel, a settlement repeated, 0 F; nothing created or lost.
 */
const L: MoneyLimits = { opMax: ECONOMY.online.opMax, fundDayMax: ECONOMY.online.fundDayMax, sendDayMax: ECONOMY.online.sendDayMax, receiveDayMax: ECONOMY.online.receiveDayMax, balanceMax: ECONOMY.online.balanceMax };
const T0 = Date.UTC(2026, 10, 13, 18);
const M = 'a1b2c3d4e5f60718', M2 = '0f1e2d3c4b5a6978';
const tag = (i: number) => i.toString(16).padStart(16, '0');
const TERMS: CampTermsRow = { fee: 1000, size: 10, dist: 'team' };
type S = ReturnType<typeof memoryCampLedger>;
/** Ten accounts, each funded through the ledger's own top-up (wallet → Teranga Money). */
function setup(n = 10, money = 5000) {
  const s = memoryCampLedger();
  for (let i = 1; i <= n; i++) { openAccount(s, tag(i), T0); if (money) expect(s.transaction(() => applyMoney(s, { kind: 'fund', id: `fund-${tag(i)}`, tag: tag(i), amount: money }, T0, L)).ok).toBe(true); }
  return s;
}
const hold = (s: S, i: number, o: { match?: string; op?: string; fund?: number; terms?: CampTermsRow; now?: number } = {}) =>
  s.tx(() => campHold(s, { match: o.match ?? M, tag: tag(i), op: o.op ?? `hold-${o.match ?? M}-${i}`, terms: o.terms ?? TERMS, fund: o.fund ?? 0 }, o.now ?? T0, L));
const release = (s: S, i: number, match = M) => s.tx(() => campRelease(s, { match, tag: tag(i) }, T0));
const settle = (s: S, outcome: CampOutcomeRow, match = M) => s.tx(() => campSettle(s, { match, outcome, terms: TERMS }, T0));
const bal = (s: S, i: number) => s.account(tag(i))!.balance;
const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? 'ok' : r.reason);
const total = (s: S, n = 10) => Array.from({ length: n }, (_, i) => bal(s, i + 1)).reduce((a, b) => a + b, 0) + [...s.pools().values()].reduce((a, p) => a + (p.state === 'open' ? p.held : 0), 0);

describe('Grand Camp fees: the hold at « Prêt »', () => {
  it('takes the fee from Teranga Money into the match’s pool, once per op id and once per player and match', () => {
    const s = setup();
    expect(hold(s, 1)).toMatchObject({ ok: true, duplicate: false, balance: 4000, pool: 1000, hold: { state: 'held', amount: 1000 } });
    expect(hold(s, 1)).toMatchObject({ ok: true, duplicate: true, balance: 4000, pool: 1000 });                 // the same op again (a resend)
    expect(hold(s, 1, { op: 'hold-other-press' })).toMatchObject({ ok: true, duplicate: true, pool: 1000 });   // another « Prêt » of the same player: the one hold
    expect(bal(s, 1)).toBe(4000);
    expect([...s.campOps().values()].filter(o => o.kind === 'hold').length).toBe(1);
  });
  it('is funded as a send: Teranga Money first, the rest from the wallet in the same operation, within the day’s top-up limit', () => {
    const s = setup(3, 0);
    s.transaction(() => applyMoney(s, { kind: 'fund', id: 'fund-small-1', tag: tag(1), amount: 400 }, T0, L));
    expect(reason(hold(s, 1))).toBe('insufficient');                                    // 400 F: not enough, and nothing taken
    expect(bal(s, 1)).toBe(400);
    expect(hold(s, 1, { op: 'hold-with-fund', fund: 600 })).toMatchObject({ ok: true, balance: 0, today: { funded: 1000 } });
    expect(reason(hold(s, 2, { fund: 1001 }))).toBe('amount');                         // never more top-up than the fee
    expect(reason(hold(s, 2, { fund: -1 }))).toBe('amount');
    for (const id of ['fund-big-2a', 'fund-big-2b']) expect(s.transaction(() => applyMoney(s, { kind: 'fund', id, tag: tag(2), amount: L.fundDayMax / 2 }, T0, L)).ok).toBe(true);
    expect(reason(hold(s, 2, { op: 'hold-over-fund', fund: 1000, match: M2 }))).toBe('limit-fund');
    expect(bal(s, 2)).toBe(L.fundDayMax);
  });
  it('never below zero: a player who cannot cover the fee is refused and nothing changes', () => {
    const s = setup(2, 999);
    expect(reason(hold(s, 1))).toBe('insufficient');
    expect(bal(s, 1)).toBe(999); expect(s.pool(M)).toBeNull(); expect(s.campOps().size).toBe(0);
  });
  it('one pending fee per player: a hold in another match is refused until the first is returned', () => {
    const s = setup();
    hold(s, 1);
    expect(reason(hold(s, 1, { match: M2, op: 'hold-second-match' }))).toBe('busy');
    release(s, 1);
    expect(hold(s, 1, { match: M2, op: 'hold-second-match' }).ok).toBe(true);
  });
  it('the terms are the pool’s from its first hold; a fee of 0 F never reaches the ledger; one operation at most', () => {
    const s = setup();
    hold(s, 1);
    expect(reason(hold(s, 2, { terms: { ...TERMS, fee: 2000 } }))).toBe('terms');
    expect(reason(hold(s, 2, { terms: { ...TERMS, dist: 'single' } }))).toBe('terms');
    expect(reason(hold(s, 3, { match: M2, terms: { ...TERMS, fee: 0 } }))).toBe('amount');
    expect(reason(hold(s, 3, { match: M2, terms: { ...TERMS, fee: L.opMax + 1 } }))).toBe('limit-op');
    expect(reason(hold(s, 4, { op: 'x' }))).toBe('invalid');
    expect(reason(s.tx(() => campHold(s, { match: M, tag: 'ffffffffffffffff', op: 'hold-nobody-01', terms: TERMS, fund: 0 }, T0, L)))).toBe('invalid');   // no account
  });
  it('an op id of another player or match is refused; a spent hold op (returned since) is not held again', () => {
    const s = setup();
    hold(s, 1, { op: 'hold-shared-01' });
    expect(reason(hold(s, 2, { op: 'hold-shared-01' }))).toBe('invalid');
    release(s, 1);
    expect(reason(hold(s, 1, { op: 'hold-shared-01' }))).toBe('closed');               // a new « Prêt » is a new op
    expect(bal(s, 1)).toBe(5000);
    expect(hold(s, 1, { op: 'hold-shared-02' }).ok).toBe(true);
  });
});

describe('Grand Camp fees: releases', () => {
  it('« Pas prêt », leaving, removed, a drop before kick-off: the fee comes back whole; a release repeated or out of order changes nothing', () => {
    const s = setup();
    expect(release(s, 1)).toMatchObject({ ok: true, duplicate: true, amount: 0 });       // before any hold (out of order): nothing
    hold(s, 1); hold(s, 2);
    expect(release(s, 1)).toMatchObject({ ok: true, duplicate: false, amount: 1000, balance: 5000, pool: 1000 });
    expect(release(s, 1)).toMatchObject({ ok: true, duplicate: true, amount: 0 });
    expect(bal(s, 1)).toBe(5000); expect(s.pool(M)!.held).toBe(1000);
    expect([...s.campOps().values()].filter(o => o.kind === 'release').length).toBe(1);
  });
});

describe('Grand Camp fees: the settlement, once per match', () => {
  const ten = () => { const s = setup(); for (let i = 1; i <= 10; i++) expect(hold(s, i).ok).toBe(true); return s; };
  const teamA = [1, 3, 5, 7, 9].map(tag), teamB = [2, 4, 6, 8, 10].map(tag);
  it('« Équipe gagnante — partage égal »: 10 × 1 000 F, each winner +2 000 F (gone or not), each loser −1 000 F; the payouts are the holds exactly', () => {
    const s = ten(), before = total(s);
    const r = settle(s, { kind: 'team', winners: teamA });
    expect(r.ok && r.settlement).toMatchObject({ kind: 'team', total: 10_000 });
    if (!r.ok) return;
    expect(r.settlement.payouts.map(p => p.amount)).toEqual([2000, 2000, 2000, 2000, 2000]);
    expect(r.settlement.payouts.reduce((a, p) => a + p.amount, 0)).toBe(r.settlement.total);
    for (const i of [1, 3, 5, 7, 9]) expect(bal(s, i)).toBe(6000);
    for (const i of [2, 4, 6, 8, 10]) expect(bal(s, i)).toBe(4000);
    expect(total(s)).toBe(before);
    expect(s.pool(M)).toMatchObject({ state: 'settled', held: 0 });
    expect([...s.campOps().values()].filter(o => o.kind === 'payout').map(o => o.id).sort()).toEqual(teamA.map(t => campPayoutOp(M, t)).sort());
    expect(r.balances.length).toBe(10);
  });
  it('a settlement repeated (or a different outcome asked after it) changes nothing and answers the first', () => {
    const s = ten();
    const first = settle(s, { kind: 'team', winners: teamA });
    const again = settle(s, { kind: 'team', winners: teamA }), other = settle(s, { kind: 'team', winners: teamB }), refund = settle(s, { kind: 'refund', why: 'stopped' });
    for (const r of [again, other, refund]) expect(r).toMatchObject({ ok: true, duplicate: true, settlement: first.ok ? first.settlement : null });
    for (const i of [1, 3]) expect(bal(s, i)).toBe(6000);
    expect([...s.campOps().values()].filter(o => o.kind === 'payout').length).toBe(5);
    expect(release(s, 2)).toMatchObject({ duplicate: true, amount: 0 });                  // a release after it: nothing
    expect(reason(hold(s, 2, { op: 'hold-late-after-end' }))).toBe('closed');
  });
  it('« Un seul gagnant »: the whole pool to one player', () => {
    const s = ten();
    const r = settle(s, { kind: 'single', winner: tag(5) });
    expect(r.ok && r.settlement.payouts).toEqual([{ tag: tag(5), amount: 10_000, op: campPayoutOp(M, tag(5)) }]);
    expect(bal(s, 5)).toBe(14_000);
    for (const i of [1, 2, 3, 4, 6, 7, 8, 9, 10]) expect(bal(s, i)).toBe(4000);
    expect(reason(settle(setup(), { kind: 'single', winner: tag(5) }, M2)) === 'ok' && true).toBe(true);
  });
  it('a draw, a cancel, a lobby closed, a match stopped: every fee returned', () => {
    for (const why of ['draw', 'cancel', 'timeout', 'empty', 'stopped']) {
      const s = ten(), before = total(s);
      const r = settle(s, { kind: 'refund', why });
      expect(r.ok && r.settlement).toMatchObject({ kind: 'refund', why, total: 10_000 });
      for (let i = 1; i <= 10; i++) expect(bal(s, i)).toBe(5000);
      expect(total(s)).toBe(before); expect(s.pool(M)!.state).toBe('refunded');
      expect([...s.allHolds().values()].every(h => h.state === 'refunded')).toBe(true);
    }
  });
  it('a hold racing a cancel: whichever reaches the ledger first, no fee is left behind', () => {
    // the cancel first: the pool is closed, the late hold refused, nothing taken
    const a = setup(); hold(a, 1);
    settle(a, { kind: 'refund', why: 'cancel' });
    expect(reason(hold(a, 2))).toBe('closed');
    expect(bal(a, 1)).toBe(5000); expect(bal(a, 2)).toBe(5000);
    // a cancel on a match nobody was ready in: closed too
    const b = setup();
    expect(settle(b, { kind: 'refund', why: 'cancel' })).toMatchObject({ ok: true, settlement: { total: 0, payouts: [] } });
    expect(reason(hold(b, 1))).toBe('closed'); expect(bal(b, 1)).toBe(5000);
    // the hold first: the cancel returns it
    const c = setup(); hold(c, 1); hold(c, 2);
    settle(c, { kind: 'refund', why: 'cancel' });
    expect([bal(c, 1), bal(c, 2)]).toEqual([5000, 5000]);
  });
  it('winners who never held anything are not paid; a winner list with none of the holders is refused and changes nothing', () => {
    const s = setup(); for (const i of [1, 2, 3]) hold(s, i);
    expect(reason(settle(s, { kind: 'team', winners: [tag(9)] }))).toBe('invalid');
    expect(reason(settle(s, { kind: 'single', winner: tag(9) }))).toBe('invalid');
    expect(s.pool(M)!.state).toBe('open');
    const r = settle(s, { kind: 'team', winners: [tag(1), tag(2), tag(9)] });
    expect(r.ok && r.settlement.payouts.map(p => p.amount)).toEqual([1500, 1500]);
    // three winners of 3 000 F would not divide when it is not 3 × the fee: a franc to the first ones, never lost or created
    const u = setup(); for (const i of [1, 2, 3, 4]) hold(u, i, { terms: { fee: 1000, size: 10, dist: 'team' } });
    const v = settle(u, { kind: 'team', winners: [tag(1), tag(2), tag(3)] });
    expect(v.ok && v.settlement.payouts.map(p => p.amount)).toEqual([1334, 1333, 1333]);
  });
  it('all or nothing: a settlement whose pool does not match its holds writes nothing', () => {
    const s = ten();
    const p = s.pool(M)!; s.putPool({ ...p, held: p.held + 1 });                         // a corrupted pool
    expect(() => settle(s, { kind: 'team', winners: teamA })).toThrow(/out of balance/);
    for (let i = 1; i <= 10; i++) expect(bal(s, i)).toBe(4000);
    expect([...s.campOps().values()].some(o => o.kind === 'payout')).toBe(false);
  });
});

describe('Grand Camp fees: conservation', () => {
  it('a thousand random steps over three matches: balances never negative, money only enters through a top-up, every settlement adds up', () => {
    const s = setup(12, 3000), r = rng(42), matches = ['1111111111111111', '2222222222222222', '3333333333333333'];
    let brought = 12 * 3000, n = 0;
    for (let k = 0; k < 1000; k++) {
      const i = 1 + Math.floor(r() * 12), m = matches[Math.floor(r() * 3)], x = r();
      if (x < 0.45) { const fund = r() < 0.3 ? Math.floor(r() * 1200) : 0; const h = hold(s, i, { match: m, op: `op-${k}-${i}`, fund }); if (h.ok && !h.duplicate) brought += fund; }
      else if (x < 0.8) release(s, i, m);
      else if (x < 0.9) {
        const held = s.holds(m).filter(h => h.state === 'held').map(h => h.tag);
        const o: CampOutcomeRow = r() < 0.4 ? { kind: 'refund', why: 'draw' } : r() < 0.5 && held.length ? { kind: 'single', winner: held[0] } : { kind: 'team', winners: held.filter((_, j) => j % 2 === 0) };
        const res = settle(s, o, m);
        if (res.ok && !res.duplicate) { n++; expect(res.settlement.payouts.reduce((a, p) => a + p.amount, 0)).toBe(res.settlement.total); }
        if (res.ok && !res.duplicate) matches[matches.indexOf(m)] = (BigInt('0x' + m) + 1n).toString(16).padStart(16, '0');   // a new match in its place
      }
      for (let j = 1; j <= 12; j++) expect(bal(s, j)).toBeGreaterThanOrEqual(0);
      expect(total(s, 12)).toBe(brought);
      for (let j = 1; j <= 12; j++) expect([...s.allHolds().values()].filter(h => h.tag === tag(j) && h.state === 'held').length).toBeLessThanOrEqual(1);
    }
    expect(n).toBeGreaterThan(20);
  });
});
