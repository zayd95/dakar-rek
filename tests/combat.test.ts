import { describe, expect, it } from 'vitest';
import {
  COMBAT, GRIPS, THROWS, THROW_IDS, bestThrow, braceAgainst, braceFactor, combatDecision, combatPoints, commitTick, emptyTally, entryHolds, gripAdvantage, gripTick,
  lean, legOpen, moveDir, reachFor, setup, shove, slipFall, stickMove, throwFails, throwScore, wear, type Combatant, type GripKind, type ThrowId,
} from '../src/lamb/combat';
import { AVERAGE } from '../src/lamb/stand';

/** The pure rules of the new bout (src/lamb/combat.ts, docs/wrestling/COMBAT.md). */
const man = (o: Partial<Combatant> = {}): Combatant => ({ stamina: 100, max: 100, balance: 100, composure: 100, attrs: AVERAGE, dir: { f: 0, s: 0 }, weight: { f: 0, s: 0 }, hold: { kind: null, str: 0 }, ...o });
/** A man whose imbalance is `depth` (0…1) towards `dir`. */
const leaning = (f: number, s: number, depth: number, o: Partial<Combatant> = {}) => { const h = Math.hypot(f, s) || 1; return man({ balance: 100 * (1 - depth), dir: { f: f / h, s: s / h }, ...o }); };
const gripFor = (id: ThrowId): GripKind => THROWS[id].grips[THROWS[id].grips.length - 1];

describe('combat · grips: control against exposure', () => {
  it('the nape is the safest and gives the least control; the belt and the leg give more and expose more', () => {
    expect(GRIPS.nuque.exposure).toBeLessThan(1);
    expect(GRIPS.nuque.control).toBeLessThan(GRIPS.bras.control);
    expect(GRIPS.bras.control).toBeLessThan(GRIPS.ceinture.control);
    expect(GRIPS.ceinture.exposure).toBeGreaterThan(1);
    expect(GRIPS.jambe.exposure).toBeGreaterThan(GRIPS.ceinture.exposure);
    // the deeper the hold, the longer the reach (the other sees it coming)
    expect(GRIPS.nuque.reach).toBeLessThan(GRIPS.ceinture.reach);
  });
  it('a hold slides out of tired hands and settles in fresh ones', () => {
    const h = { kind: 'ceinture' as GripKind, str: 90 };
    for (let i = 0; i < 60; i++) gripTick(h, 10, 0.1);
    expect(h.str).toBeLessThan(55);
    const g = { kind: 'nuque' as GripKind, str: 30 };
    for (let i = 0; i < 60; i++) gripTick(g, 100, 0.1);
    expect(g.str).toBeGreaterThan(50);
  });
  it('worn to nothing, a hold falls back to the shallower one, then it is lost', () => {
    const h = { kind: 'ceinture' as GripKind, str: 10 };
    expect(wear(h, 20)).toBe(true); expect(h.kind).toBe('bras');
    wear(h, 40); expect(h.kind).toBe('nuque');
    wear(h, 40); expect(h.kind).toBeNull();
  });
  it('the Prise is the better hold, strength times control', () => {
    expect(gripAdvantage({ kind: 'ceinture', str: 60 }, { kind: 'nuque', str: 60 })).toBeGreaterThan(20);
    expect(gripAdvantage({ kind: 'nuque', str: 20 }, { kind: 'ceinture', str: 80 })).toBeLessThan(-60);
  });
  it('a tap reaches for the nape, a hold for the belt, and a man leaning in gives his leg', () => {
    expect(reachFor('tap', man())).toBe('nuque');
    expect(reachFor('hold', man())).toBe('ceinture');
    expect(reachFor('tap', leaning(1, 0, 0.2))).toBe('jambe');
    expect(reachFor('hold', man({ weight: { f: 1, s: 0 } }))).toBe('jambe');
    expect(legOpen(leaning(-1, 0, 0.3))).toBe(false);
    const e = entryHolds('ceinture', 32);
    expect(e.att.kind).toBe('ceinture'); expect(e.att.str).toBeGreaterThan(entryHolds('ceinture', 0).att.str); expect(e.def.kind).toBe('nuque');
  });
});

describe('combat · the balance has a direction', () => {
  it('pushes stack the same way; a pull after a push gives him his feet back', () => {
    const a = man();
    shove(a, moveDir('push'), 20); shove(a, moveDir('push'), 20);
    expect(a.balance).toBeCloseTo(60, 5); expect(lean(a).f).toBeLessThan(-0.39);
    const b = man(); shove(b, moveDir('push'), 20); shove(b, moveDir('pull'), 20);
    expect(b.balance).toBeGreaterThan(99);
  });
  it('a pivot sends him to a side, a pull forward', () => {
    const a = man(); shove(a, moveDir('pivot', 1), 30);
    expect(Math.abs(lean(a).s)).toBeGreaterThan(0.29); expect(Math.abs(lean(a).f)).toBeLessThan(0.01);
    const b = man(); shove(b, moveDir('pull'), 30); expect(lean(b).f).toBeGreaterThan(0.29);
  });
  it('the weight braces against a direction, and makes the other way worse; a tired man braces less', () => {
    const back = { f: -1, s: 0 };
    expect(braceFactor(man({ weight: { f: 1, s: 0 } }), back)).toBeCloseTo(1 - COMBAT.brace, 5);
    expect(braceFactor(man({ weight: { f: -1, s: 0 } }), back)).toBeCloseTo(1 + COMBAT.into, 5);
    expect(braceFactor(man(), back)).toBe(1);
    expect(braceFactor(man({ weight: { f: 1, s: 0 }, stamina: 5 }), back)).toBeGreaterThan(braceFactor(man({ weight: { f: 1, s: 0 } }), back) + 0.3);
  });
  it('leaning commits the body: a man driving forward is a little off balance forward', () => {
    const a = man({ weight: { f: 1, s: 0 } });
    for (let i = 0; i < 60; i++) commitTick(a, 1 / 60);
    expect(lean(a).f).toBeGreaterThan(COMBAT.commit * 0.9);
    expect(a.balance).toBeGreaterThan(78);
  });
});

describe('combat · each throw works only with its set-up', () => {
  for (const id of THROW_IDS) {
    it(`${THROWS[id].label}: fails on a balanced, fresh man; takes down a man deep off balance its way; fails the other way`, () => {
      const att = man({ hold: { kind: gripFor(id), str: 60 } });
      expect(throwScore(id, att, man())).toBeLessThan(COMBAT.throwAt);
      const way = THROWS[id].dir === 'avant' ? [1, 0] : THROWS[id].dir === 'arriere' ? [-1, 0] : THROWS[id].dir === 'cote' ? [0, 1] : [0.6, 0];
      const def = leaning(way[0], way[1], 0.55, { stamina: id === 'souleve' ? 40 : 100 });
      expect(throwScore(id, att, def)).toBeGreaterThanOrEqual(COMBAT.throwAt);
      if (THROWS[id].dir !== 'haut') {
        const wrong = THROWS[id].dir === 'cote' ? leaning(-1, 0, 0.55) : leaning(-way[0], 0, 0.55);
        expect(throwScore(id, att, wrong)).toBeLessThan(COMBAT.throwAt);
      }
    });
  }
  it('the hold decides which throws exist: the leg only from the leg, the lift only from the belt', () => {
    expect(THROWS.jambe.grips).toEqual(['jambe']);
    expect(THROWS.souleve.grips).toEqual(['ceinture']);
    expect(THROW_IDS.filter(id => THROWS[id].fall === 'appuis')).toEqual(['ramene']);
  });
  it('the button names the throw his imbalance gives: pushed back → croc, pulled in → hanche, turned → balayage', () => {
    const att = man({ hold: { kind: 'bras', str: 60 } });
    expect(bestThrow(att, leaning(-1, 0, 0.4))?.id).toBe('croc');
    expect(bestThrow(att, leaning(1, 0, 0.4))?.id).toBe('hanche');
    expect(bestThrow(att, leaning(0, -1, 0.4))?.id).toBe('balayage');
    expect(bestThrow(man(), leaning(1, 0, 0.4))).toBeNull();
  });
  it('the lift needs more breath than his', () => {
    const att = man({ hold: { kind: 'ceinture', str: 60 }, stamina: 40 });
    expect(setup('souleve', att, leaning(1, 0, 0.4, { stamina: 90 }))).toBeLessThan(setup('souleve', att, leaning(1, 0, 0.4, { stamina: 20 })));
  });
});

describe('combat · resistance', () => {
  it('bracing the right way takes a set-up throw away; bracing the wrong way makes it surer', () => {
    const att = man({ hold: { kind: 'bras', str: 60 } }), def = leaning(1, 0, 0.5);
    const free = throwScore('hanche', att, def);
    expect(free).toBeGreaterThanOrEqual(COMBAT.throwAt);
    const braced = { ...def, weight: { f: -1, s: 0 } };
    expect(throwScore('hanche', att, braced, { brace: braceAgainst('hanche', braced) })).toBeLessThan(COMBAT.throwAt);
    const into = { ...def, weight: { f: 1, s: 0 } };
    expect(throwScore('hanche', att, into, { brace: braceAgainst('hanche', into) })).toBeGreaterThan(free);
  });
  it('a tired wrestler cannot brace: he slips', () => {
    const att = man({ hold: { kind: 'bras', str: 60 } });
    const fresh = leaning(1, 0, 0.5, { weight: { f: -1, s: 0 } }), spent = leaning(1, 0, 0.5, { weight: { f: -1, s: 0 }, stamina: 4 });
    expect(braceAgainst('hanche', spent)).toBeLessThan(braceAgainst('hanche', fresh) * 0.5);
    expect(throwScore('hanche', att, spent, { brace: braceAgainst('hanche', spent) })).toBeGreaterThanOrEqual(COMBAT.throwAt);
  });
  it('a throw that fails costs its author: balance forward and a weaker hold', () => {
    const att = man({ hold: { kind: 'bras', str: 50 } });
    throwFails('hanche', att);
    expect(att.balance).toBeLessThan(85); expect(lean(att).f).toBeGreaterThan(0.1); expect(att.hold.str).toBeLessThan(50);
  });
});

describe('combat · the fall rule and the referee', () => {
  it('a man whose balance runs out forward goes down on the four supports, otherwise on his back', () => {
    expect(slipFall(leaning(1, 0, 1))).toBe('appuis');
    expect(slipFall(leaning(-1, 0, 1))).toBe('dos');
    expect(slipFall(leaning(0, 1, 1))).toBe('dos');
  });
  it('a held guard does not draw: the passive wrestler’s warnings are the other’s points, and decide a tie', () => {
    const turtle = { score: { guards: 2, grabs: 0, breaks: 0 }, tally: { ...emptyTally(), warnings: 3 } };
    const worker = { score: { guards: 0, grabs: 2, breaks: 0 }, tally: { ...emptyTally(), throws: 0 } };
    expect(combatDecision(turtle, worker)).toBe('b');
    expect(combatPoints(worker.score, worker.tally, turtle.tally)).toBe(5);
    const a = { score: { guards: 1, grabs: 1, breaks: 0 }, tally: { ...emptyTally(), warnings: 1 } }, b = { score: { guards: 0, grabs: 3, breaks: 0 }, tally: emptyTally() };
    expect(combatDecision(a, b)).toBe('b');
    expect(combatDecision({ score: { guards: 0, grabs: 0, breaks: 0 }, tally: emptyTally() }, { score: { guards: 0, grabs: 0, breaks: 0 }, tally: emptyTally() })).toBeNull();
  });
  it('the stick in the empoignade: towards him a push, away a pull, to a side a pivot', () => {
    expect(stickMove({ f: 1, s: 0 })?.kind).toBe('push');
    expect(stickMove({ f: -0.9, s: 0.2 })?.kind).toBe('pull');
    expect(stickMove({ f: 0.2, s: -0.9 })).toEqual({ kind: 'pivot', side: -1 });
    expect(stickMove({ f: 0.2, s: 0.2 })).toBeNull();
  });
});
