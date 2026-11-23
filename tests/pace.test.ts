import { describe, expect, it } from 'vitest';
import { HIDDEN_EVERY, Pace, Pacer, hiddenEvery, insideWalls, paceStep } from '../src/game/pace';
import { WALL_H, WALL_R } from '../src/world/geew';

/**
 * What nobody can see waits between updates, with the time gone by (docs/PERF_EVENING.md « Headroom »): the street outside
 * the arena's walls while the player sits on the tiers.
 */
describe('paceStep', () => {
  it('every 0: every frame, with its own time', () => {
    expect(paceStep(0, 0.1, 0)).toEqual([0.1, 0]);
    expect(paceStep(0, 0.016, 0)).toEqual([0.016, 0]);
  });
  it('waits until it is owed `every` seconds, then runs with all of them', () => {
    let owed = 0, runs: number[] = [];
    for (let k = 0; k < 10; k++) { const [run, o] = paceStep(owed, 0.1, 0.25); owed = o; if (run !== null) runs.push(run); }
    expect(runs.length).toBe(3);                                         // 0.3, 0.3, 0.3 (the browser check's 0.1 s frames: every third)
    expect(runs[0]).toBeCloseTo(0.3, 9);
    expect(owed).toBeCloseTo(0.1, 9);
  });
  it('60 frames a second: about every 15th frame, 0.25 s', () => {
    let owed = 0, frames = 0; const runs: number[] = [], gaps: number[] = [];
    for (let k = 0; k < 120; k++) { const [run, o] = paceStep(owed, 1 / 60, HIDDEN_EVERY); owed = o; frames++; if (run !== null) { runs.push(run); gaps.push(frames); frames = 0; } }
    expect(runs.length).toBeGreaterThanOrEqual(7);
    expect(runs.length).toBeLessThanOrEqual(8);
    for (const g of gaps) expect(g === 15 || g === 16).toBe(true);        // (1/60 added fifteen times falls a hair short of a quarter)
    for (const r of runs) { expect(r).toBeGreaterThanOrEqual(0.25 - 1e-9); expect(r).toBeLessThan(0.27); }
  });
  it('never loses time, and never makes a system wait longer than `every` plus a frame', () => {
    let owed = 0, given = 0, total = 0, waited = 0, worst = 0;
    let seed = 7; const r = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let k = 0; k < 2000; k++) {
      const dt = 0.005 + r() * 0.095;                                    // 5 to 100 ms: the main loop's frames
      total += dt; waited += dt;
      const [run, o] = paceStep(owed, dt, HIDDEN_EVERY); owed = o;
      if (run !== null) { given += run; worst = Math.max(worst, waited); waited = 0; }
    }
    expect(given + owed).toBeCloseTo(total, 6);
    expect(worst).toBeLessThan(HIDDEN_EVERY + 0.1 + 1e-9);
  });
  it('back to every frame at once, with what it was owed', () => {
    let [run, owed] = paceStep(0, 0.1, HIDDEN_EVERY);
    expect(run).toBeNull();
    [run, owed] = paceStep(owed, 0.1, 0);
    expect(run).toBeCloseTo(0.2, 9);
    expect(owed).toBe(0);
  });
});

describe('Pace and Pacer', () => {
  it('a Pace holds one system’s time; reset forgets it', () => {
    const p = new Pace();
    expect(p.step(0.1, HIDDEN_EVERY)).toBeNull();
    expect(p.step(0.1, HIDDEN_EVERY)).toBeNull();
    expect(p.step(0.1, HIDDEN_EVERY)).toBeCloseTo(0.3, 9);
    p.step(0.1, HIDDEN_EVERY); p.reset();
    expect(p.step(0.1, 0)).toBeCloseTo(0.1, 9);
  });
  it('a Pacer keeps each named system apart', () => {
    const p = new Pacer();
    expect(p.step('a', 0.1, HIDDEN_EVERY)).toBeNull();
    expect(p.step('b', 0.1, 0)).toBeCloseTo(0.1, 9);                     // b does not wait for a
    expect(p.step('a', 0.2, HIDDEN_EVERY)).toBeCloseTo(0.3, 9);
    p.step('a', 0.1, HIDDEN_EVERY); p.reset();
    expect(p.step('a', 0.1, HIDDEN_EVERY)).toBeNull();                   // (reset: a starts from nothing owed)
  });
});

describe('insideWalls', () => {
  const arena = { cx: 100, cz: -50 };
  it('inside the walls and below their top plus 3 m: on the tiers, in the ring', () => {
    expect(insideWalls(arena, { x: 100, y: 1.5, z: -50 })).toBe(true);
    expect(insideWalls(arena, { x: 100 + 16.6, y: 4, z: -50 })).toBe(true);
    expect(insideWalls(arena, { x: 100 + WALL_R - 0.4, y: WALL_H + 2.9, z: -50 })).toBe(true);
  });
  it('outside the walls, at the wall, or above them (a camera over the roof): not enclosed', () => {
    expect(insideWalls(arena, { x: 100 + WALL_R - 0.3, y: 2, z: -50 })).toBe(false);
    expect(insideWalls(arena, { x: 100 + WALL_R + 5, y: 2, z: -50 })).toBe(false);
    expect(insideWalls(arena, { x: 100, y: WALL_H + 3, z: -50 })).toBe(false);
  });
  it('a hub without an arena: never', () => {
    expect(insideWalls(null, { x: 0, y: 1, z: 0 })).toBe(false);
    expect(insideWalls(undefined, { x: 0, y: 1, z: 0 })).toBe(false);
  });
  it('hiddenEvery: HIDDEN_EVERY inside the walls, 0 (every frame) outside', () => {
    expect(hiddenEvery(arena, { x: 100, y: 2, z: -50 })).toBe(HIDDEN_EVERY);
    expect(hiddenEvery(arena, { x: 0, y: 2, z: 0 })).toBe(0);
  });
});
