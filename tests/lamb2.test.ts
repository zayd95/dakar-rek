import { describe, expect, it } from 'vitest';
import {
  AVERAGE, STAND, STAND_STYLES, STRIKES, decide, free, k, land, react, reactDelay, standState, startStrike, tick, windupOf,
  type StandState,
} from '../src/lamb/stand';
import { RULES, points, emptyScore } from '../src/lamb/rules';
import { ENTRY_BONUS, clinchPower, entryGrip, gripWords } from '../src/lamb/clinch';

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
