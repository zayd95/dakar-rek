import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate } from '../src/core/save';
import { FT, REGULARS, SHORT, afterLine, lastMatch, matchOver, meet, recognise, recordMatch, resultOf, resultTitle, startMatch } from '../src/districts/matchRules';

/** M3 « Join the match » (src/districts/matchRules.ts): the short match, its record, the regulars' memory. */
const fresh = () => new GameState(newSave(0));
const reload = (s: GameState) => new GameState(migrate(JSON.parse(JSON.stringify(s.data)), Date.now())!);

describe('M3 · a short match and the regulars who remember it', () => {
  it('a short match: first to three goals, four minutes at most; the result from the player’s side', () => {
    expect(matchOver([2, 1], 100)).toBe(false);
    expect(matchOver([3, 1], 100)).toBe(true);
    expect(matchOver([0, 3], 10)).toBe(true);
    expect(matchOver([1, 1], SHORT.seconds)).toBe(true);
    expect(resultOf(1, [1, 3])).toBe('win'); expect(resultOf(0, [1, 3])).toBe('loss'); expect(resultOf(0, [2, 2])).toBe('draw');
    expect(resultTitle(1, [1, 3])).toBe('Victoire 3–1');
  });

  it('recorded once at its end: a second call, a rematch’s same number, a reload never count it twice; no money moves', () => {
    const s = fresh(), w = s.data.wallet;
    const seq = startMatch(s);
    expect(recordMatch(s, { seq, team: 0, score: [3, 1], myGoals: 2, day: 5 })).toBe('win');
    expect(recordMatch(s, { seq, team: 0, score: [3, 1], myGoals: 2, day: 5 })).toBeNull();
    const t = reload(s);
    expect(recordMatch(t, { seq, team: 0, score: [3, 1], myGoals: 2, day: 5 })).toBeNull();
    expect(t.data.counters[FT.matches]).toBe(1); expect(t.data.counters[FT.wins]).toBe(1); expect(t.data.counters[FT.goals]).toBe(2);
    expect(lastMatch(t)).toEqual({ result: 'win', goals: 2, day: 5 });
    const seq2 = startMatch(t); expect(seq2).toBe(seq + 1);
    expect(recordMatch(t, { seq: seq2, team: 1, score: [2, 2], myGoals: 0, day: 5 })).toBe('draw');
    expect(t.data.counters[FT.matches]).toBe(2); expect(t.data.counters[FT.draws]).toBe(1);
    expect(t.data.wallet).toBe(w); expect(t.data.ledger.length).toBe(0);
  });

  it('a regular recognises the player on a later day, once a day, naming their last match; not before they met, not the same day', () => {
    const s = fresh(), O = REGULARS.babou;
    expect(recognise(s, O, 6)).toBeNull();                                   // never met
    const seq = startMatch(s); meet(s, 'babou', 5); recordMatch(s, { seq, team: 0, score: [3, 2], myGoals: 1, day: 5 });
    expect(recognise(s, O, 5)).toBeNull();                                   // the same day
    const line = recognise(s, O, 7);
    expect(line).toMatch(/buteur/);
    expect(recognise(s, O, 7)).toBeNull();                                   // once a day
    expect(recognise(reload(s), O, 7)).toBeNull();                           // a reload the same day: still once
    expect(recognise(s, O, 8)).toBeTruthy();                                 // the next day again
    expect(recognise(s, REGULARS.khadim, 9)).toBeNull();                     // Khadim never met the player
  });

  it('after the match each regular says something about it: the result, the player’s goals', () => {
    expect(afterLine(REGULARS.babou, 'win', 2)).toMatch(/2 buts/);
    expect(afterLine(REGULARS.babou, 'loss', 0)).toMatch(/prochaine fois/);
    expect(afterLine(REGULARS.khadim, 'win', 0)).toMatch(/revanche/);
    expect(afterLine(REGULARS.khadim, 'loss', 1)).toMatch(/courir/);
  });
});
