import { describe, expect, it } from 'vitest';
import { DECENT, EXPERT, NOVICE, series } from './lamb2Pupil';
import { AI_LEVEL } from '../src/lamb/stand';

/**
 * Làmb 2.0's balance for a new player (docs/LAMB2.md « Équilibrage »): a fresh save after Coach Ablaye's lesson, played
 * by three headless players (tests/lamb2Pupil.ts) against the roster's wrestlers as themselves. Seeded, so the same
 * numbers every run; the bands leave room for small changes elsewhere without hiding a real shift.
 */
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('làmb 2.0 · balance for a new player (fresh save, after the lesson)', () => {
  it('a novice — late, sometimes wrong, mashing a little — wins about a third of his bouts against the easiest friendly', () => {
    const x = series('Pape', NOVICE, 120);
    expect(x.win).toBeGreaterThanOrEqual(0.28);
    expect(x.win).toBeLessThanOrEqual(0.52);
  });
  it('… and rarely against level 3', () => {
    expect(mean([series('Malick', NOVICE, 60).win, series('Assane', NOVICE, 60, 'classe').win])).toBeLessThanOrEqual(0.15);
  });
  it('a decent player wins about half of his bouts at level 2', () => {
    const w = mean([series('Gora', DECENT, 60).win, series('Pathé', DECENT, 60, 'classe').win, series('Birame', DECENT, 60, 'classe').win, series('Ndiaga', DECENT, 60, 'classe').win]);
    expect(w).toBeGreaterThanOrEqual(0.42);
    expect(w).toBeLessThanOrEqual(0.65);
  });
  it('an expert wins most of his bouts at levels 1–2, not all', () => {
    const xs = [series('Pape', EXPERT, 40), series('Saliou', EXPERT, 40), series('Gora', EXPERT, 40)];
    expect(mean(xs.map(x => x.win))).toBeGreaterThanOrEqual(0.75);
    expect(xs.some(x => x.win < 1)).toBe(true);
  });
  it('at levels 1–2 a bout lasts between 15 s and a minute (median), and ends by a fall', () => {
    for (const x of [series('Pape', NOVICE, 40), series('Saliou', DECENT, 40), series('Gora', DECENT, 40)]) {
      expect(x.median).toBeGreaterThanOrEqual(15);
      expect(x.median).toBeLessThanOrEqual(60);
      expect(x.falls).toBeGreaterThanOrEqual(0.9);
    }
  });
  it('the opponent grows with his level: never easier a level up', () => {
    for (let i = 1; i < 5; i++) {
      expect(AI_LEVEL.factor[i]).toBeGreaterThanOrEqual(AI_LEVEL.factor[i - 1]);
      expect(AI_LEVEL.pace[i]).toBeLessThanOrEqual(AI_LEVEL.pace[i - 1]);
      expect(AI_LEVEL.slow[i]).toBeLessThanOrEqual(AI_LEVEL.slow[i - 1]);
      expect(AI_LEVEL.breath[i]).toBeGreaterThanOrEqual(AI_LEVEL.breath[i - 1]);
    }
    expect(AI_LEVEL.factor[4]).toBeGreaterThan(1);                          // the city's best reads more than the standard
  });
});
