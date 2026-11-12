import { describe, expect, it } from 'vitest';
import { STREAK, advancePlay, creditWork, currentRun, perks, runLabel } from '../src/economy/streak';
import { newStreak } from '../src/core/save';

/** Days worked in a row (src/economy/streak.ts): the player's own days, one count a day, no farming of the city's midnight, one forgiven day. */
const MIN = 60_000;
describe('streak: days worked in a row', () => {
  it('the player\'s day moves once per city day, and only one step after time away', () => {
    const p = { day: 0, city: -1 };
    expect(advancePlay(p, 40)).toBe(true); expect(p).toEqual({ day: 1, city: 40 });
    expect(advancePlay(p, 40)).toBe(false);
    expect(advancePlay(p, 41)).toBe(true); expect(p.day).toBe(2);
    expect(advancePlay(p, 101)).toBe(true); expect(p.day).toBe(3);                 // 60 city days away: one more day, not 60
  });

  it('one piece of work a day counts once; consecutive days build the run', () => {
    const s = newStreak();
    expect(creditWork(s, 1, 5 * MIN)).toMatchObject({ counted: true, run: 1, fresh: true });
    expect(creditWork(s, 1, 9 * MIN)).toMatchObject({ counted: false, why: 'already', run: 1 });
    expect(creditWork(s, 2, 30 * MIN)).toMatchObject({ counted: true, run: 2, milestone: 2, first: true });
    expect(creditWork(s, 3, 60 * MIN)).toMatchObject({ counted: true, run: 3, milestone: 3 });
    expect(s).toMatchObject({ run: 3, best: 3, total: 3, last: 3 });
  });

  it('the city\'s midnight cannot be farmed: a job just before and one just after count as one day', () => {
    const s = newStreak();
    creditWork(s, 1, 20 * MIN);
    expect(creditWork(s, 2, 21 * MIN)).toMatchObject({ counted: false, why: 'too-soon' });
    expect(creditWork(s, 2, 20 * MIN + STREAK.minGapMs)).toMatchObject({ counted: true, run: 2 });
  });

  it('…but coming back after a real absence counts at the first job (no waiting)', () => {
    const s = newStreak();
    creditWork(s, 1, 20 * MIN);
    expect(creditWork(s, 2, 21 * MIN, 20.5 * MIN)).toMatchObject({ counted: true, run: 2 });
  });

  it('one skipped day is forgiven, two break the run; the grace comes back at each full week', () => {
    const s = newStreak();
    creditWork(s, 1, 0); creditWork(s, 2, 20 * MIN);
    expect(creditWork(s, 4, 40 * MIN)).toMatchObject({ counted: true, run: 3, graceUsed: true });
    expect(s.grace).toBe(0);
    expect(currentRun(s, 5)).toBe(3); expect(currentRun(s, 6)).toBe(0);
    expect(creditWork(s, 6, 60 * MIN)).toMatchObject({ counted: true, run: 1, fresh: true });
    expect(s.grace).toBe(STREAK.grace); expect(s.best).toBe(3);
    for (let d = 7, t = 80; d <= 12; d++, t += 20) creditWork(s, d, t * MIN);
    expect(s.run).toBe(7);
    s.grace = 0; creditWork(s, 13, 300 * MIN); expect(s.grace).toBe(0);
    for (let d = 14, t = 320; d <= 19; d++, t += 20) creditWork(s, d, t * MIN);
    expect(s.run).toBe(14); expect(s.grace).toBe(1);                                 // the second full week gives it back
  });

  it('a milestone is celebrated in full once; reaching it again is a short word', () => {
    const s = newStreak();
    creditWork(s, 1, 0); expect(creditWork(s, 2, 20 * MIN)).toMatchObject({ milestone: 2, first: true });
    creditWork(s, 9, 40 * MIN);
    expect(creditWork(s, 10, 60 * MIN)).toMatchObject({ milestone: 2, first: false });
  });

  it('perks are opened by the run, never money, a car or a debt', () => {
    expect(perks(1)).toEqual({ known: false, cityTest: false, prestigeTest: false, dependable: false });
    expect(perks(3)).toMatchObject({ known: true, cityTest: true, prestigeTest: false });
    expect(perks(7)).toEqual({ known: true, cityTest: true, prestigeTest: true, dependable: true });
    expect(runLabel(1)).toBe('1 jour actif'); expect(runLabel(3)).toBe('3 jours d’affilée'); expect(runLabel(0)).toBe('Aucun jour actif');
  });
});
