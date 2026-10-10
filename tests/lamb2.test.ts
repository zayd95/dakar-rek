import { describe, expect, it } from 'vitest';
import {
  AVERAGE, STAND, STAND_STYLES, STRIKES, decide, free, k, land, react, reactDelay, standState, startStrike, tick, windupOf,
  type StandState,
} from '../src/lamb/stand';
import { RULES, points, emptyScore, record, recordIncrements } from '../src/lamb/rules';
import {
  CLINCH, CLINCH_STYLES, ENTRY_BONUS, MOVES, THROW, answer, clinchDecide, clinchPower, counterScore, counterThrow, entryGrip, exchange, gripWords, holdTick, holder,
  moveWindup, posture, slipRate, startMove, throwLands, throwScore, tryBreak, wantsCounter, wantsThrow,
  type ClinchMove, type Holder,
} from '../src/lamb/clinch';

const fresh = (attrs = AVERAGE) => standState(attrs, 100);
/** Runs `s` until its strike reaches the landing moment (returns the seconds it took). */
function windUp(s: StandState, dt = 0.01) {
  let t = 0;
  while (!tick(s, dt, 0)) { t += dt; if (t > 5) throw new Error('never lands'); }
  return t + dt;
}

describe('làmb 2.0 · attributes', () => {
  it('shape every number by at most ±20 %, 50 is neutral', () => {
    expect(k(50)).toBeCloseTo(1);
    expect(k(0)).toBeCloseTo(0.8);
    expect(k(100)).toBeCloseTo(1.2);
    expect(k(250)).toBeCloseTo(1.2);
  });
});

describe('làmb 2.0 · strikes', () => {
  it('a quick strike lands much sooner than a big one; explosive wrestlers are quicker, rattled ones slower', () => {
    const a = fresh();
    expect(windupOf('quick', a)).toBeLessThan(windupOf('big', a) / 2);
    expect(windupOf('big', { attrs: { ...AVERAGE, explosivite: 90 }, composure: 100 })).toBeLessThan(windupOf('big', a));
    expect(windupOf('big', { attrs: AVERAGE, composure: 20 })).toBeGreaterThan(windupOf('big', a));
    expect(windupOf('big', { attrs: AVERAGE, composure: 0 })).toBeLessThanOrEqual(windupOf('big', a) * 1.26);
  });
  it('costs endurance once, and cannot be thrown while guarding, busy or exhausted', () => {
    const a = fresh();
    expect(startStrike(a, 'big')).toBe(true);
    expect(a.stamina).toBe(100 - STRIKES.big.cost);
    expect(startStrike(a, 'quick')).toBe(false);                       // already striking
    const g = fresh(); g.guard = true;
    expect(startStrike(g, 'quick')).toBe(false);
    const t = fresh(); t.stamina = 3;
    expect(startStrike(t, 'quick')).toBe(false);
  });
  it('a clean hit takes balance and composure, never anything like health; the big one takes far more', () => {
    const q = fresh(), d1 = fresh(); startStrike(q, 'quick'); windUp(q);
    const l1 = land(q, d1, 1.2);
    const b = fresh(), d2 = fresh(); startStrike(b, 'big'); windUp(b);
    const l2 = land(b, d2, 1.2);
    expect(l1.result).toBe('hit'); expect(l2.result).toBe('hit');
    expect(d1.balance).toBeLessThan(100); expect(d1.composure).toBeLessThan(100);
    expect(l2.balance).toBeGreaterThan(l1.balance * 2.5);
    expect(d2.stamina).toBe(100);                                      // a hit costs the defender no endurance
  });
  it('a big strike that misses leaves its author open and off balance; a quick miss barely', () => {
    const b = fresh(), d = fresh(); startStrike(b, 'big'); windUp(b);
    expect(land(b, d, STRIKES.big.reach + 0.3).result).toBe('miss');
    expect(b.open).toBeCloseTo(STRIKES.big.missOpen);
    expect(b.balance).toBeLessThan(90);
    const q = fresh(), d2 = fresh(); startStrike(q, 'quick'); windUp(q);
    expect(land(q, d2, 3).result).toBe('miss');
    expect(q.open).toBeLessThan(0.3);
  });
  it('stepping back makes a strike miss', () => {
    const b = fresh(), d = fresh(); startStrike(b, 'big'); windUp(b);
    d.dodge = 0.2;
    expect(land(b, d, 1.0).result).toBe('miss');
  });
  it('guarding absorbs a strike for endurance and a little balance; a guarded big strike leaves its author open', () => {
    const b = fresh(), d = fresh(); d.guard = true; startStrike(b, 'big'); windUp(b);
    const l = land(b, d, 1.2);
    expect(l.result).toBe('guarded');
    expect(d.stamina).toBeLessThan(100);
    expect(d.balance).toBeGreaterThan(80);
    expect(b.open).toBeCloseTo(STRIKES.big.blockedOpen);
    const good = fresh({ ...AVERAGE, defense: 100 }), b2 = fresh(); good.guard = true; startStrike(b2, 'big'); windUp(b2);
    expect(land(b2, good, 1.2).endurance).toBeLessThan(l.endurance);
  });
  it('a quick strike that lands first interrupts a big strike being wound up', () => {
    const big = fresh(), quick = fresh();
    startStrike(big, 'big');
    tick(big, 0.1, 0);
    startStrike(quick, 'quick'); windUp(quick);
    expect(big.strike && !big.strike.landed).toBe(true);
    const l = land(quick, big, 1.2);
    expect(l.interrupted).toBe(true);
    expect(big.strike).toBeNull();
    expect(free(big)).toBe(false);                                     // shortly stunned
  });
  it('balance at zero: the wrestler staggers, cannot act, and strikes on him take more', () => {
    const a = fresh(), d = fresh(); d.balance = 10;
    startStrike(a, 'big'); windUp(a);
    expect(land(a, d, 1.2).result).toBe('stagger');
    expect(d.stagger).toBeCloseTo(STAND.stagger);
    expect(d.balance).toBe(STAND.staggerBalance);
    expect(free(d)).toBe(false);
    const a2 = fresh(), calm = fresh(), a3 = fresh();
    startStrike(a2, 'quick'); windUp(a2); const normal = land(a2, calm, 1.2).balance;
    startStrike(a3, 'quick'); windUp(a3); d.balance = 100; const onStaggered = land(a3, d, 1.2).balance;
    expect(onStaggered).toBeCloseTo(normal * STAND.openBonus);
  });
  it('no attribute decides alone: the best striker on the steadiest defender still takes balance within ±45 %', () => {
    const strong = fresh({ ...AVERAGE, frappe: 100, force: 100 }), weak = fresh({ ...AVERAGE, frappe: 0, force: 0 });
    const steady = fresh({ ...AVERAGE, equilibre: 100 }), shaky = fresh({ ...AVERAGE, equilibre: 0 });
    startStrike(strong, 'big'); windUp(strong); const hi = land(strong, shaky, 1.2).balance;
    startStrike(weak, 'big'); windUp(weak); const lo = land(weak, steady, 1.2).balance;
    expect(hi / STRIKES.big.balance).toBeLessThan(1.7);
    expect(lo / STRIKES.big.balance).toBeGreaterThan(0.55);
  });
});

describe('làmb 2.0 · states over time', () => {
  it('balance comes back by itself, slower when tired; the guard drains endurance instead of recovering it', () => {
    const a = fresh(), t = fresh(); a.balance = 40; t.balance = 40; t.stamina = 10;
    for (let i = 0; i < 100; i++) { tick(a, 0.01, 0); tick(t, 0.01, 0); }
    expect(a.balance).toBeGreaterThan(t.balance);
    const g = fresh(); g.stamina = 60; g.guard = true;
    for (let i = 0; i < 100; i++) tick(g, 0.01, 14);
    expect(g.stamina).toBeLessThan(60);
    const n = fresh(); n.stamina = 60;
    for (let i = 0; i < 100; i++) tick(n, 0.01, 14);
    expect(n.stamina).toBeGreaterThan(70);
  });
  it('composure drains when tired and comes back when fresh', () => {
    const t = fresh(); t.stamina = 5; t.composure = 80;
    for (let i = 0; i < 100; i++) tick(t, 0.01, 0);
    expect(t.composure).toBeLessThan(80);
    const f = fresh(); f.composure = 50;
    for (let i = 0; i < 100; i++) tick(f, 0.01, 14);
    expect(f.composure).toBeGreaterThan(50);
  });
  it('a strike lands once, then the arm comes back and the wrestler recovers before acting', () => {
    const a = fresh(); startStrike(a, 'quick');
    const t = windUp(a);
    expect(t).toBeCloseTo(windupOf('quick', a), 1);
    land(a, fresh(), 1.2);
    let n = 0;
    while (a.strike && n < 100) { tick(a, 0.01, 0); n++; }
    expect(a.strike).toBeNull();
    expect(a.recover).toBeGreaterThan(0);
    expect(free(a)).toBe(false);
  });
  it('balance and grip carry into the empoignade, worth a few seconds of effort, never everything', () => {
    expect(clinchPower(0, 50, 100, 0)).toBeGreaterThan(clinchPower(0, 50, 20, 0));
    expect(clinchPower(0, 50, 100, 0) - clinchPower(0, 50, 0, 0)).toBeCloseTo(2);
    expect(clinchPower(0, 50, 50, 80) - clinchPower(0, 50, 50, -80)).toBeCloseTo(6.4);
  });
});

describe('làmb 2.0 · the opponent standing', () => {
  const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
  it('keeps its style range', () => {
    const v = { me: fresh(), them: fresh(), dist: 3, grabRange: 1.5 };
    expect(decide(v, STAND_STYLES.rapide, 1, seq(0.99)).move).toBe(1);
    expect(decide({ ...v, dist: 0.9 }, STAND_STYLES.defensif, 1, seq(0.99)).move).toBeLessThan(0);
  });
  it('grabs a staggered or open player, goes for the big strike on a shaken one', () => {
    const them = fresh(); them.stagger = 0.8;
    expect(decide({ me: fresh(), them, dist: 1.2, grabRange: 1.5 }, STAND_STYLES.costaud, 1, seq(0.1)).grab).toBe(true);
    const shaky = fresh(); shaky.balance = 30;
    const d = decide({ me: fresh(), them: shaky, dist: 1.6, grabRange: 1.5 }, STAND_STYLES.costaud, 1, seq(0.4));
    expect(d.strike).toBe('big');
  });
  it('takes hold of a player hiding behind his guard', () => {
    const turtle = fresh(); turtle.guard = true;
    expect(decide({ me: fresh(), them: turtle, dist: 1.3, grabRange: 1.5 }, STAND_STYLES.costaud, 1, seq(0.2)).grab).toBe(true);
  });
  it('a quick style throws quick strikes, a defensive one guards; nobody acts while busy', () => {
    expect(decide({ me: fresh(), them: fresh(), dist: 1.5, grabRange: 1.5 }, STAND_STYLES.rapide, 1, seq(0.95, 0.2)).strike).toBe('quick');
    expect(decide({ me: fresh(), them: fresh(), dist: 1.5, grabRange: 1.5 }, STAND_STYLES.defensif, 1, seq(0.99, 0.99, 0.3)).guard).toBe(true);
    const busy = fresh(); busy.recover = 0.3;
    const d = decide({ me: busy, them: fresh(), dist: 1.5, grabRange: 1.5 }, STAND_STYLES.rapide, 1, seq(0));
    expect(d.strike).toBeNull(); expect(d.grab).toBe(false);
  });
  it('reacts to a strike by style, less when rattled or tired, and only counters a big one', () => {
    const me = fresh();
    expect(react('big', me, STAND_STYLES.defensif, 1, 0.1)).toBe('guard');
    expect(react('quick', me, STAND_STYLES.rapide, 1, 0.7)).toBe('none');          // no counter on a quick strike
    expect(react('big', me, STAND_STYLES.rapide, 1, 0.7)).toBe('counter');
    const rattled = fresh(); rattled.composure = 0; rattled.stamina = 10;
    let a = 0, b = 0;
    for (let i = 0; i < 100; i++) { if (react('big', me, STAND_STYLES.costaud, 1, i / 100) !== 'none') a++; if (react('big', rattled, STAND_STYLES.costaud, 1, i / 100) !== 'none') b++; }
    expect(b).toBeLessThan(a);
    expect(reactDelay('big', rattled)).toBeGreaterThan(reactDelay('big', me));
    expect(reactDelay('big', me) + windupOf('quick', me)).toBeLessThan(windupOf('big', fresh()));   // a counter can beat the big strike
  });
  it('the training partner never strikes', () => {
    for (let i = 0; i < 20; i++) expect(decide({ me: fresh(), them: fresh(), dist: 1.2, grabRange: 1.5 }, STAND_STYLES.partenaire, 1, () => i / 20).strike).toBeNull();
  });
});

describe('làmb 2.0 · entry into the empoignade (step 2)', () => {
  const g = (balance = 100, attrs = AVERAGE) => ({ balance, attrs });
  it('the one who grabs holds the better grip; more on an opening, most on a wrestler who staggers', () => {
    const neutral = entryGrip('neutral', g(), g()), open = entryGrip('open', g(), g()), stag = entryGrip('stagger', g(), g(20));
    expect(neutral).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(neutral);
    expect(stag).toBeGreaterThan(open);
    expect(stag).toBeLessThanOrEqual(80);
    expect(ENTRY_BONUS.late).toBeLessThan(ENTRY_BONUS.open);
    expect(entryGrip('guard', g(), g())).toBeGreaterThan(neutral);
  });
  it('balance, technique and force tilt it: a shaken grabber on a fresh technician can start behind', () => {
    expect(entryGrip('neutral', g(30), g(100, { ...AVERAGE, technique: 100, force: 90 }))).toBeLessThan(0);
    expect(entryGrip('neutral', g(100, { ...AVERAGE, technique: 90 }), g())).toBeGreaterThan(entryGrip('neutral', g(), g()));
  });
  it('is told in words, never as a number', () => {
    expect(gripWords(60)).toMatch(/gros avantage pour toi/);
    expect(gripWords(0)).toMatch(/égale/);
    expect(gripWords(-20)).toMatch(/avantage pour lui/);
  });
});

describe('làmb 2.0 · rules', () => {
  it('the discipline avec frappe exists with its own record keys and counts staggers at time-out', () => {
    expect(RULES.avec_frappe.strikes).toBe(true);
    const s = emptyScore(); s.staggers = 2;
    expect(points(s, RULES.avec_frappe)).toBe(2);
    expect(points(s, RULES.sans_frappe)).toBe(0);
  });
});

describe('làmb 2.0 · the empoignade is played (step 3)', () => {
  const h = (balance = 100, attrs = AVERAGE, stamina = 100): Holder => holder({ stamina, balance, attrs });
  const set = (x: Holder, kind: ClinchMove) => { expect(startMove(x, kind)).toBe(true); };
  it('a triangle: pull beats push, pivot beats pull, push beats pivot — whoever lands first', () => {
    for (const [win, lose] of [['pull', 'push'], ['pivot', 'pull'], ['push', 'pivot']] as const) {
      const a = h(), b = h(); set(a, win); set(b, lose);
      const e = exchange(a, b, 0);                                       // the winner's move lands
      expect(e.result).toBe('counter'); expect(e.winner).toBe('a');
      expect(b.balance).toBeLessThan(90); expect(a.balance).toBe(100);
      const c = h(), d = h(); set(c, lose); set(d, win);
      const f = exchange(c, d, 0);                                       // the loser's move lands into the answer
      expect(f.winner).toBe('b'); expect(c.balance).toBeLessThan(90); expect(f.grip).toBeLessThan(0);
    }
  });
  it('pulling a pusher is the strongest answer', () => {
    const a = h(), b = h(); set(a, 'pull'); set(b, 'push');
    const pullWin = exchange(a, b, 0).balance;
    const c = h(), d = h(); set(c, 'push'); set(d, 'pivot');
    expect(pullWin).toBeGreaterThan(exchange(c, d, 0).balance);
  });
  it('against a wrestler doing nothing every move gains a little; the push drives him back', () => {
    const a = h(), b = h(); set(a, 'push');
    const e = exchange(a, b, 0);
    expect(e.result).toBe('drive'); expect(e.drive).toBeGreaterThan(0); expect(b.balance).toBeLessThan(100); expect(e.grip).toBeGreaterThan(0);
    const c = h(), d = h(); set(c, 'pivot');
    expect(exchange(c, d, 0).turn).not.toBe(0);
  });
  it('a clash of pushes goes to force, balance and grip; a better grip makes every move count more', () => {
    const strong = h(100, { ...AVERAGE, force: 95 }), weak = h(); set(strong, 'push'); set(weak, 'push');
    expect(exchange(strong, weak, 0).winner).toBe('a');
    const a = h(), b = h(); set(a, 'push'); const lo = exchange(a, b, -60).balance;
    const c = h(), d = h(); set(c, 'push'); const hi = exchange(c, d, 60).balance;
    expect(hi).toBeGreaterThan(lo * 1.5);
  });
  it('moves cost endurance, set up for a moment (the body shows it), then land once', () => {
    const a = h(); set(a, 'push');
    expect(a.stamina).toBe(100 - MOVES.push.cost);
    expect(startMove(a, 'pull')).toBe(false);
    let t = 0; while (!holdTick(a, 0.01)) t += 0.01;
    expect(t).toBeCloseTo(moveWindup('push', a), 1);
    exchange(a, h(), 0);
    expect(a.move).toBeNull(); expect(startMove(a, 'pull')).toBe(false);   // short pause after a move
    const tired = h(100, AVERAGE, 3);
    expect(startMove(tired, 'push')).toBe(false);
  });
  it('the hold drains both, balance comes back slowly', () => {
    const a = h(40); for (let i = 0; i < 100; i++) holdTick(a, 0.01);
    expect(a.stamina).toBeLessThan(100); expect(a.balance).toBeGreaterThan(40); expect(a.balance).toBeLessThan(50);
  });
  it('breaking free costs endurance and fails when the grip is clearly against you', () => {
    const a = h(); expect(tryBreak(a, 0)).toBe(true); expect(a.stamina).toBe(100 - CLINCH.breakCost);
    const b = h(); expect(tryBreak(b, -60)).toBe(false); expect(b.stamina).toBe(100 - CLINCH.breakMissCost);
  });
  it('the opponent reads a move and answers it with the one that beats it; it breaks free when dominated', () => {
    const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
    const me = h(), them = h(); set(them, 'push');
    expect(clinchDecide(me, them, 0, CLINCH_STYLES.defensif, 1, 100, seq(0.1))).toBe('pull');
    expect(answer('pull')).toBe('pivot');
    expect(clinchDecide(h(), h(), -60, CLINCH_STYLES.defensif, 1, 100, seq(0.1))).toBe('break');
    expect(clinchDecide(h(), h(), 0, CLINCH_STYLES.costaud, 1, 100, seq(0.1))).toBe('push');
    expect(clinchDecide(h(), h(), 0, CLINCH_STYLES.partenaire, 1, 100, seq(0.1))).toBe('push');
    expect(clinchDecide(h(), h(), 0, CLINCH_STYLES.rapide, 1, 100, seq(0.99))).toBe('pivot');
  });
});

describe('làmb 2.0 · feeling the position slip (step 4)', () => {
  it('a clearly worse grip wears the balance away between moves, faster the worse it is; an even grip lets it come back', () => {
    expect(slipRate(0)).toBe(0); expect(slipRate(-20)).toBe(0);
    expect(slipRate(-100)).toBeCloseTo(9); expect(slipRate(-60)).toBeLessThan(slipRate(-90));
    const lost = holder({ stamina: 100, balance: 60, attrs: AVERAGE }), even = holder({ stamina: 100, balance: 60, attrs: AVERAGE });
    for (let i = 0; i < 200; i++) { holdTick(lost, 0.01, -80); holdTick(even, 0.01, 0); }
    expect(lost.balance).toBeLessThan(52); expect(even.balance).toBeGreaterThan(60);
    const steady = holder({ stamina: 100, balance: 60, attrs: { ...AVERAGE, equilibre: 100 } });
    for (let i = 0; i < 200; i++) holdTick(steady, 0.01, -80);
    expect(steady.balance).toBeGreaterThan(lost.balance);
  });
  it('tells how he stands: steady, slipping, about to go down', () => {
    expect(posture(80)).toBe('stable'); expect(posture(40)).toBe('glisse'); expect(posture(10)).toBe('chute');
  });
});

describe('làmb 2.0 · the record', () => {
  it('avec frappe keeps its own record keys; the global combats and victoires count both disciplines', () => {
    const inc = recordIncrements({ mode: 'amical', outcome: 'projection', winner: 'player' }, 'avec_frappe');
    expect(inc).toEqual({ combats: 1, victoires: 1, lamb_af_amical_v: 1 });
    expect(recordIncrements({ mode: 'amical', outcome: 'projection', winner: 'player' })).toEqual({ combats: 1, victoires: 1, lamb_amical_v: 1 });
    expect(record({ lamb_af_amical_v: 2, lamb_amical_v: 5 }, 'amical', 'avec_frappe').v).toBe(2);
    expect(record({ lamb_af_amical_v: 2, lamb_amical_v: 5 }, 'amical').v).toBe(5);
    expect(recordIncrements({ mode: 'classe', outcome: 'abandon', winner: null }, 'avec_frappe')).toEqual({ lamb_af_classe_ab: 1, lamb_abandons: 1 });
  });
});

describe('làmb 2.0 · the throw attempt and the counter (step 5)', () => {
  const h = (balance = 100, attrs = AVERAGE, stamina = 100): Holder => holder({ stamina, balance, attrs });
  it('a throw takes him down when the position allows it — his balance, the grip — never on power alone', () => {
    expect(throwLands(h(), h(30), 30).result).toBe('fall');
    expect(throwLands(h(), h(90), 0).result).toBe('fail');
    const strongest = h(100, { ...AVERAGE, force: 100, technique: 100 });
    expect(throwLands(strongest, h(100), 0).result).toBe('fail');            // the best attributes do not throw a steady man
    expect(throwScore(h(), { balance: 50, move: { kind: 'push', t: 0 } }, 0)).toBeGreaterThan(throwScore(h(), { balance: 50, move: null }, 0));
  });
  it('a failed throw leaves the thrower off balance and loosens his grip', () => {
    const a = h(); const r = throwLands(a, h(95), 0);
    expect(r.result).toBe('fail'); expect(a.balance).toBeLessThan(85); expect(r.grip).toBeLessThan(0);
  });
  it('the counter turns a throw when the defender is steady and holds on; otherwise it only blocks it', () => {
    expect(counterThrow(h(90), h(60), 10).result).toBe('reverse');
    const att = h(80); expect(counterThrow(h(30), att, -40).result).toBe('block'); expect(att.balance).toBeLessThan(80);
    expect(counterScore(h(80, { ...AVERAGE, technique: 95 }), h(), 0)).toBeGreaterThan(counterScore(h(80), h(), 0));
  });
  it('the opponent throws when the position is good, and reads the player’s throw to counter it', () => {
    const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
    expect(wantsThrow(h(), h(25), 30, CLINCH_STYLES.costaud, 1, seq(0.2))).toBe(true);
    expect(wantsThrow(h(), h(95), 0, CLINCH_STYLES.costaud, 1, seq(0))).toBe(false);
    expect(wantsThrow(h(), h(25), 30, CLINCH_STYLES.partenaire, 1, seq(0))).toBe(false);
    expect(wantsCounter(h(), CLINCH_STYLES.defensif, 1, 100, 0.2)).toBe(true);
    expect(wantsCounter(h(100, AVERAGE, 2), CLINCH_STYLES.defensif, 1, 100, 0)).toBe(false);
    expect(THROW.windup).toBeGreaterThan(0.4);                                 // long enough to be seen and countered
  });
});
