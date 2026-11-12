import { describe, expect, it } from 'vitest';
import { ORDINARY_BASE, RUNGS, purseOf, type BoutMode, type BoutRes } from '../src/career/career';

/**
 * Ordinary ranked bouts pay by the OPPONENT's level; galas and title bouts keep the rung's purse exactly as they were paid before
 * (docs/ORDINARY-PURSES.md). `legacyPurse` is the previous implementation, copied as it was, with the rung purses as literals:
 * every gala and title value must still equal it, for every rung, level and result.
 */
const LEGACY_RUNG_PURSE = [5_000, 15_000, 50_000, 150_000, 400_000, 1_000_000, 2_500_000];
function legacyPurse(mode: BoutMode, res: BoutRes, rung: number, level: number, kind?: 'gala' | 'title'): number {
  if (mode !== 'classe' || res === 'A') return 0;
  if (kind) return Math.round((legacyPurse(mode, res, rung, level) * (kind === 'title' ? 3 : 2)) / 250) * 250;
  const base = LEGACY_RUNG_PURSE[Math.max(0, Math.min(LEGACY_RUNG_PURSE.length - 1, rung))];
  const k = res === 'V' ? 1.5 * (1 + 0.1 * Math.max(1, level)) : res === 'N' ? 1 : 0.6;
  return Math.round((base * k) / 250) * 250;
}

const RESULTS: BoutRes[] = ['V', 'N', 'D', 'A'];
const RUNG_RANGE = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 99];             // inside the ladder and the clamps outside it
const LEVELS = [0, 1, 2, 2.5, 3, 4, 5, 6, 9];                      // the roster's levels 1–5 and what is outside them
const ordinary = (res: BoutRes, level: number) => purseOf('classe', res, 0, level);

describe('prestige purses: galas and title bouts keep their exact values', () => {
  it('the rung purses themselves are unchanged', () => {
    expect(RUNGS.map(r => r.purse)).toEqual(LEGACY_RUNG_PURSE);
  });
  it('every rung × level × result × gala/title equals the previous implementation', () => {
    let n = 0;
    for (const kind of ['gala', 'title'] as const) for (const rung of RUNG_RANGE) for (const level of LEVELS) for (const res of RESULTS) {
      expect(purseOf('classe', res, rung, level, kind), `${kind} rung ${rung} level ${level} ${res}`).toBe(legacyPurse('classe', res, rung, level, kind));
      n++;
    }
    expect(n).toBe(2 * RUNG_RANGE.length * LEVELS.length * RESULTS.length);
  });
  it('literal values (the double rounding of the previous code included)', () => {
    expect(purseOf('classe', 'V', 3, 4, 'gala')).toBe(630_000);
    expect(purseOf('classe', 'D', 3, 5, 'gala')).toBe(180_000);
    expect(purseOf('classe', 'N', 6, 3, 'gala')).toBe(5_000_000);
    expect(purseOf('classe', 'V', 4, 5, 'title')).toBe(2_700_000);
    expect(purseOf('classe', 'V', 6, 5, 'title')).toBe(16_875_000);
    expect(purseOf('classe', 'V', 0, 2.5, 'gala')).toBe(19_000);       // 9 375 → 9 500 → × 2 (a single rounding would give 18 750)
  });
  it('a gala or title purse follows the rung, never the opponent alone: higher rungs pay more, a title pays 1.5× a gala', () => {
    for (const res of ['V', 'N', 'D'] as const) for (const level of [1, 3, 5]) {
      for (let rung = 1; rung < RUNGS.length; rung++) {
        expect(purseOf('classe', res, rung, level, 'gala')).toBeGreaterThan(purseOf('classe', res, rung - 1, level, 'gala'));
        expect(purseOf('classe', res, rung, level, 'title')).toBeGreaterThan(purseOf('classe', res, rung - 1, level, 'title'));
      }
      expect(purseOf('classe', res, 4, level, 'title')).toBeCloseTo(1.5 * purseOf('classe', res, 4, level, 'gala'), -3);
    }
  });
  it('friendly bouts and abandons pay nothing, galas and titles included', () => {
    for (const rung of RUNG_RANGE) for (const level of LEVELS) {
      for (const kind of [undefined, 'gala', 'title'] as const) {
        expect(purseOf('amical', 'V', rung, level, kind)).toBe(0);
        expect(purseOf('amical', 'D', rung, level, kind)).toBe(0);
        expect(purseOf('classe', 'A', rung, level, kind)).toBe(0);
      }
    }
  });
});

describe('ordinary ranked bouts: the opponent\'s level sets the purse', () => {
  it('the table and its literal values', () => {
    expect(ORDINARY_BASE).toEqual([5_000, 6_500, 8_500, 11_000, 14_000]);
    expect([1, 2, 3, 4, 5].map(l => ordinary('V', l))).toEqual([8_250, 11_750, 16_500, 23_000, 31_500]);
    expect([1, 2, 3, 4, 5].map(l => ordinary('N', l))).toEqual([5_000, 6_500, 8_500, 11_000, 14_000]);
    expect([1, 2, 3, 4, 5].map(l => ordinary('D', l))).toEqual([3_000, 4_000, 5_000, 6_500, 8_500]);
  });
  it('the player\'s rung changes nothing: a champion earns what a beginner earns against the same opponent', () => {
    for (const level of LEVELS) for (const res of RESULTS) {
      const first = purseOf('classe', res, 0, level);
      for (const rung of RUNG_RANGE) expect(purseOf('classe', res, rung, level), `rung ${rung} level ${level} ${res}`).toBe(first);
    }
  });
  it('a win pays more than a draw, a draw more than a defeat, a defeat something, an abandon nothing', () => {
    for (const level of LEVELS) {
      expect(ordinary('V', level)).toBeGreaterThan(ordinary('N', level));
      expect(ordinary('N', level)).toBeGreaterThan(ordinary('D', level));
      expect(ordinary('D', level)).toBeGreaterThan(0);
      expect(ordinary('A', level)).toBe(0);
    }
  });
  it('a stronger opponent pays more, and the roster\'s top level is the ceiling', () => {
    for (const res of ['V', 'N', 'D'] as const) {
      for (let l = 2; l <= 5; l++) expect(ordinary(res, l)).toBeGreaterThan(ordinary(res, l - 1));
    }
    expect(ordinary('N', 9)).toBe(ordinary('N', 5));                  // the base stops at level 5 (the roster has no level 6)
    expect(ordinary('D', 6)).toBe(ordinary('D', 5));
    expect(ordinary('D', 0)).toBe(ordinary('D', 1));                  // and starts at level 1
  });
  it('every purse is a multiple of 250 F', () => {
    for (const kind of [undefined, 'gala', 'title'] as const) for (const rung of RUNG_RANGE) for (const level of LEVELS) for (const res of RESULTS) {
      expect(purseOf('classe', res, rung, level, kind) % 250).toBe(0);
    }
  });
});

describe('exploit scenarios, as arithmetic (the career simulations are in scripts/m1a-sim)', () => {
  it('repeated wins against the same opponents never escalate: n wins pay n times one win, at any rung', () => {
    for (const rung of [0, 2, 4, 6]) for (const level of [1, 3, 5]) {
      const one = purseOf('classe', 'V', rung, level);
      let total = 0;
      for (let i = 0; i < 400; i++) total += purseOf('classe', 'V', rung, level);
      expect(total).toBe(400 * one);
    }
  });
  it('a deliberate quick loss pays at most 40 % of a win against the same opponent, and less than a draw', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(ordinary('D', level)).toBeLessThanOrEqual(0.4 * ordinary('V', level));
      expect(ordinary('D', level)).toBeLessThan(ordinary('N', level));
    }
  });
  it('the best ordinary win never reaches a tenth of the cheapest prestige purse that exists at a rung that has one', () => {
    const bestOrdinary = Math.max(...[1, 2, 3, 4, 5].map(l => ordinary('V', l)));
    const galaRungs = RUNGS.map((_, i) => i).filter(i => i >= RUNGS.findIndex(r => r.id === 'reputes'));
    const titleRungs = RUNGS.map((_, i) => i).filter(i => i >= RUNGS.findIndex(r => r.id === 'contender'));
    for (const rung of galaRungs) for (const level of [1, 5]) for (const res of ['V', 'N', 'D'] as const) expect(purseOf('classe', res, rung, level, 'gala')).toBeGreaterThan(bestOrdinary / 10);
    const cheapestGalaWin = Math.min(...galaRungs.map(r => purseOf('classe', 'V', r, 1, 'gala')));
    const cheapestTitleWin = Math.min(...titleRungs.map(r => purseOf('classe', 'V', r, 1, 'title')));
    expect(cheapestGalaWin).toBeGreaterThanOrEqual(10 * bestOrdinary);
    expect(cheapestTitleWin).toBeGreaterThanOrEqual(10 * bestOrdinary);
  });
  it('an abandon pays nothing at any rung, level and kind (walking out is never a way to be paid)', () => {
    for (const kind of [undefined, 'gala', 'title'] as const) for (const rung of RUNG_RANGE) for (const level of LEVELS) expect(purseOf('classe', 'A', rung, level, kind)).toBe(0);
  });
});
