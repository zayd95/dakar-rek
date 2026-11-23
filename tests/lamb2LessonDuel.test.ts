import { describe, expect, it } from 'vitest';
import { LambDuel } from '../src/lamb/duel';
import { PARTNER } from '../src/lamb/rules';
import { coachLine } from '../src/lamb/lesson';
import type { Input } from '../src/core/input';

/**
 * Coach Ablaye's lesson avec frappe inside the duel, without a browser (the duel runs headless): a simple pupil does
 * what each step asks and the lesson goes from « approche-toi » to « contre », then the training's recap.
 */
const look = { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] };
const ANSWER = { push: 'pull', pull: 'pivot', pivot: 'push' } as const;
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any

function lessonDuel() {
  const steer = { x: 0, y: 0 };
  const input = { enabled: true, move: () => ({ ...steer }), takeAction: () => false } as unknown as Input;
  const duel = new LambDuel({ origin: { x: 0, z: 0 }, look, input, crowdSize: 0, mode: 'entrainement', style: PARTNER, level: 1, ring: 5, discipline: 'avec_frappe', seed: 7 });
  /** Walk towards (1) or away from (−1) the partner, through the duel's camera axes like a joystick. */
  const walk = (dir: number) => {
    const p = duel.fighterPoints(), me = { x: p[1][0], z: p[1][2] }, ai = { x: p[4][0], z: p[4][2] };
    const dx = ai.x - me.x, dz = ai.z - me.z, len = Math.hypot(dx, dz) || 1, ax = duel.axes();
    const wx = (dx / len) * dir, wz = (dz / len) * dir;
    steer.x = wx * ax.right.x + wz * ax.right.z; steer.y = wx * ax.fwd.x + wz * ax.fwd.z;
  };
  return { duel, steer, walk };
}

describe('làmb 2.0 · the lesson inside the duel (headless)', () => {
  it('a pupil doing each step goes through the whole lesson, then the training recap', () => {
    const { duel, steer, walk } = lessonDuel();
    const seen: string[] = [];
    for (let k = 0; k < 60 * 240 && duel.phase !== 'result'; k++) {
      const i = duel.info() as unknown as Info, step = i.lesson?.step as string;
      if (seen[seen.length - 1] !== step) seen.push(step);
      steer.x = 0; steer.y = 0; duel.setGuard(false);
      if (i.phase === 'fight') {
        const far = i.dist > 1.45;
        if (step === 'distance' || (far && step !== 'guard')) walk(1);
        else if (step === 'quick' && !i.strike?.player && k % 20 === 0) duel.pressStrike('quick');
        else if (step === 'big' && !i.strike?.player && k % 30 === 0) duel.pressStrike('big');
        else if (step === 'guard') { if (i.dist > 1.7) walk(1); duel.setGuard(i.strike?.opponent === 'big'); }
        else if (step === 'grab' && k % 20 === 0) duel.pressGrab();
      } else if (i.phase === 'clinch') {
        const c = i.clinch;
        if (step === 'moves' && c.move.opponent && !c.move.player) duel.pressMove(ANSWER[c.move.opponent as keyof typeof ANSWER]);
        else if (step === 'break' && k % 20 === 0) duel.pressBreak();
        else if (step === 'throw' && !c.attempt && k % 30 === 0) duel.pressStrike('big');
        else if (step === 'counter' && c.attempt?.by === 'opponent' && !c.attempt.counter) duel.pressStrike('big');
      }
      duel.update(1 / 60);
    }
    expect(seen).toEqual(['distance', 'quick', 'big', 'guard', 'grab', 'moves', 'slip', 'break', 'throw', 'counter', 'done']);
    expect(duel.phase).toBe('result');
    expect(duel.result?.outcome).toBe('entrainement');
    expect((duel.info() as unknown as Info).lesson.skipped).toBe(0);
    duel.dispose();
  });
  it('every step can be skipped, and the lesson still ends in the training recap', () => {
    const { duel } = lessonDuel();
    for (let k = 0; k < 60 * 30 && duel.phase !== 'result'; k++) {
      if (k > 0 && k % 30 === 0) duel.skipLessonStep();
      duel.update(1 / 60);
    }
    const i = duel.info() as unknown as Info;
    expect(i.lesson.done).toBe(true); expect(i.lesson.skipped).toBe(10);
    expect(duel.phase).toBe('result'); expect(duel.result?.outcome).toBe('entrainement');
    duel.dispose();
  });
  it('the card is never a frame behind: his word from the bell on, the next step right on « Passer »', () => {
    const { duel } = lessonDuel();
    // before the bell and on the very update the bout starts, step 1 already has his word (not one update later)
    const c0 = duel.stepCard(true)!;
    expect(c0).toMatchObject({ head: '1/10 · Approche-toi à distance de frappe', keys: 'Boutons en vert', coach: coachLine('distance'), teach: ['joy'], skip: true });
    while (duel.phase === 'intro') duel.update(1 / 60);
    expect(duel.phase).toBe('fight');
    expect(duel.stepCard(true)).toMatchObject({ head: c0.head, coach: coachLine('distance'), teach: ['joy'] });
    expect(duel.stepCard(false)!.keys).toBe('ZQSD/WASD/flèches');
    // « Passer »: the next step, its word and its button at once, before any update
    duel.skipLessonStep();
    expect((duel.info() as unknown as Info).lesson.step).toBe('quick');
    expect(duel.stepCard(true)).toMatchObject({ head: '2/10 · Frappe rapide', coach: coachLine('quick'), teach: ['quick'] });
    duel.update(1 / 60);
    expect(duel.stepCard(true)).toMatchObject({ head: '2/10 · Frappe rapide', coach: coachLine('quick'), teach: ['quick'] });
    // a step in the empoignade: its buttons as soon as it is the step
    for (let k = 0; k < 3; k++) duel.skipLessonStep();
    expect(duel.stepCard(true)).toMatchObject({ head: '5/10 · Saisis-le : l’empoignade', coach: coachLine('grab') });
    duel.skipLessonStep();
    expect(duel.stepCard(true)!.teach.sort()).toEqual(['grab', 'guard', 'quick']);
    // the lesson over: no card
    for (let k = 0; k < 5; k++) duel.skipLessonStep();
    expect(duel.stepCard(true)).toBeNull();
    duel.dispose();
  });
  it('without avec frappe the training is the sans-frappe tutorial, untouched', () => {
    const input = { enabled: true, move: () => ({ x: 0, y: 0 }), takeAction: () => false } as unknown as Input;
    const duel = new LambDuel({ origin: { x: 0, z: 0 }, look, input, crowdSize: 0, mode: 'entrainement', style: PARTNER, level: 1, ring: 5 });
    const i = duel.info() as unknown as Info;
    expect(i.lesson).toBeUndefined(); expect(i.step).toBe('move');
    duel.dispose();
  });
});
