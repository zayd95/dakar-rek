import { describe, expect, it } from 'vitest';
import { C_DECENT, C_EXPERT, C_NOVICE, combatSeries, type CSkill } from './combatPupil';
import { STYLE6_IDS } from '../src/lamb/stand';
import type { Discipline } from '../src/lamb/rules';

/**
 * The new bout's balance (docs/wrestling/COMBAT.md « Équilibrage »): a fresh save after the lesson against each of the six
 * styles, level by level, played headless by three players (tests/combatPupil.ts) through the same inputs as a thumb.
 * Seeded: the same numbers every run; the bands leave room for small changes without hiding a real shift.
 */
const level = (skill: CSkill, lv: number, d: Discipline, n = 8) => {
  const rows = STYLE6_IDS.map(st => combatSeries({ style: st, level: lv, discipline: d, n, skill }));
  const m = (f: (x: typeof rows[0]) => number) => rows.reduce((a, x) => a + f(x), 0) / rows.length;
  return { win: m(x => x.win), median: m(x => x.median), falls: m(x => x.falls), draw: m(x => x.draw) };
};

describe('combat · balance for a new player (fresh save, after the lesson)', () => {
  for (const d of ['sans_frappe', 'avec_frappe'] as Discipline[]) {
    it(`${d}: a decent player wins about half at level 1, less and less up to level 5; bouts at levels 1–3 last 12–45 s and end by the fall`, () => {
      const xs = [1, 2, 3, 4, 5].map(lv => level(C_DECENT, lv, d));
      expect(xs[0].win).toBeGreaterThanOrEqual(0.4); expect(xs[0].win).toBeLessThanOrEqual(0.75);
      expect(xs[1].win).toBeGreaterThanOrEqual(0.25); expect(xs[1].win).toBeLessThanOrEqual(0.62);
      expect(xs[4].win).toBeLessThanOrEqual(0.25);
      expect(xs[0].win).toBeGreaterThan(xs[2].win); expect(xs[0].win - xs[4].win).toBeGreaterThan(0.25);
      for (const x of xs.slice(0, 3)) { expect(x.median).toBeGreaterThanOrEqual(12); expect(x.median).toBeLessThanOrEqual(45); expect(x.falls).toBeGreaterThanOrEqual(0.85); }
      for (const x of xs) expect(x.draw).toBeLessThanOrEqual(0.05);
    });
  }
  it('a novice wins some at level 1, rarely at level 3', () => {
    expect(level(C_NOVICE, 1, 'sans_frappe').win).toBeGreaterThanOrEqual(0.2);
    expect(level(C_NOVICE, 3, 'sans_frappe').win).toBeLessThanOrEqual(0.15);
  });
  it('an expert wins most at level 1 and keeps a chance against the best', () => {
    expect(level(C_EXPERT, 1, 'sans_frappe').win).toBeGreaterThanOrEqual(0.55);
    expect(level(C_EXPERT, 5, 'sans_frappe').win).toBeGreaterThanOrEqual(0.2);
  });
});
