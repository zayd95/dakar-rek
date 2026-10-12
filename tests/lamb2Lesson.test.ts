import { describe, expect, it } from 'vitest';
import { LESSON, LESSON_STEPS, advance, coachLine, feedback, hear, nextStep, startLesson, stepDone, stepNumber, type LessonEvent, type LessonStep } from '../src/lamb/lesson';
import { find } from '../src/i18n/wolof';

/** The one event that finishes each step (doing it). */
const DOING: Record<Exclude<LessonStep, 'done'>, LessonEvent> = {
  distance: { k: 'tick', dist: 1.5 },
  quick: { k: 'strike', by: 'player', kind: 'quick', result: 'hit' },
  big: { k: 'strike', by: 'player', kind: 'big', result: 'miss' },
  guard: { k: 'strike', by: 'opponent', kind: 'big', result: 'guarded' },
  grab: { k: 'clinch', by: 'player' },
  moves: { k: 'exchange', winner: 'player', result: 'counter' },
  slip: { k: 'posture', player: 'glisse' },
  break: { k: 'break', by: 'player' },
  throw: { k: 'throw', by: 'player', result: 'fall' },
  counter: { k: 'throw', by: 'opponent', result: 'countered' },
};

describe('làmb 2.0 · Coach Ablaye’s lesson avec frappe', () => {
  it('goes through the steps in order: distance, strikes, guard, grab, moves, slip, break, throw, counter', () => {
    expect(LESSON_STEPS).toEqual(['distance', 'quick', 'big', 'guard', 'grab', 'moves', 'slip', 'break', 'throw', 'counter', 'done']);
    expect(nextStep('counter')).toBe('done'); expect(nextStep('done')).toBe('done');
    expect(stepNumber('distance')).toEqual({ n: 1, of: 10 }); expect(stepNumber('counter')).toEqual({ n: 10, of: 10 });
  });
  it('each step is finished by doing it — and only by doing it', () => {
    const steps = LESSON_STEPS.filter(s => s !== 'done') as Exclude<LessonStep, 'done'>[];
    for (const s of steps) {
      expect(stepDone(s, DOING[s])).toBe(true);
      for (const o of steps) if (o !== s && JSON.stringify(DOING[o]) !== JSON.stringify(DOING[s])) expect(stepDone(s, DOING[o]), `${s} by ${o}`).toBe(false);
    }
    // not by the wrong side or a miss
    expect(stepDone('quick', { k: 'strike', by: 'player', kind: 'quick', result: 'miss' })).toBe(false);
    expect(stepDone('guard', { k: 'strike', by: 'opponent', kind: 'big', result: 'hit' })).toBe(false);
    expect(stepDone('grab', { k: 'clinch', by: 'opponent' })).toBe(false);
    expect(stepDone('moves', { k: 'exchange', winner: 'player', result: 'drive' })).toBe(false);
    expect(stepDone('throw', { k: 'throw', by: 'player', result: 'fail' })).toBe(false);
    expect(stepDone('distance', { k: 'tick', dist: 3 })).toBe(false);
  });
  it('a whole lesson played, then done; any step can be skipped', () => {
    const l = startLesson();
    for (const s of LESSON_STEPS.filter(x => x !== 'done') as Exclude<LessonStep, 'done'>[]) {
      expect(l.step).toBe(s);
      expect(hear(l, { k: 'tick', dist: 9 })).toBe(false);
      expect(hear(l, DOING[s])).toBe(true);
    }
    expect(l.done).toBe(true); expect(l.step).toBe('done');
    expect(hear(l, DOING.distance)).toBe(false);
    const k = startLesson(); advance(k, true); advance(k, true);
    expect(k.step).toBe('big'); expect(k.skipped).toBe(2); expect(k.ready).toBe(false);
  });
  it('coach lines: a Wolof phrase of the lexicon with its gloss, then the French; no invented Wolof', () => {
    for (const [s, d] of Object.entries(LESSON)) {
      for (const w of d.wolof) expect(find(w), `${s}: ${w}`).not.toBeNull();
      const line = coachLine(s as LessonStep).replace(/[  ]/g, ' ');
      expect(line).toMatch(/^Coach Ablaye : « .+ »/);
      expect(line).toContain(d.fr);
      expect(d.title.length).toBeLessThan(40);
    }
    expect(coachLine('done')).toMatch(/Baax na/);
  });
  it('a word on what went wrong inside a step (the big strike’s opening, a late guard, reading his move)', () => {
    expect(feedback('big', { k: 'strike', by: 'player', kind: 'big', result: 'miss' })).toMatch(/ouvert/);
    expect(feedback('guard', { k: 'strike', by: 'opponent', kind: 'big', result: 'hit' })).toMatch(/Trop tard/);
    expect(feedback('moves', { k: 'exchange', winner: 'opponent', result: 'counter' })).toMatch(/tire/);
    expect(feedback('distance', { k: 'tick', dist: 3 })).toBeNull();
  });
  it('steps standing and in the empoignade; the touch buttons each step uses', () => {
    expect(LESSON.moves.in).toBe('clinch'); expect(LESSON.grab.in).toBe('fight');
    expect(LESSON.moves.touch).toEqual(['grab', 'guard', 'quick']);
    expect(LESSON.counter.touch).toEqual(['big']);
    expect(LESSON.distance.touch).toEqual(['joy']);
  });
});
