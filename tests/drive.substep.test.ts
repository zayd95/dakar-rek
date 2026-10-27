import { describe, expect, it } from 'vitest';
import { driveSteps, driveStep, newDriveState, MAX_STEP } from '../src/transport/drive';
import type { DriveSpec } from '../src/transport/spec';

const CAR: DriveSpec = { maxSpeed: 19, boostSpeed: 55, reverseSpeed: 3, accel: 4.6, brake: 8, turnRadius: 6, steer: 2.7, grip: 10, halfWidth: 0.9, halfLength: 2.3 };
/** A wall 0.3 m thick across the road at z = 100, as a circle test. */
const wall = (x: number, z: number, r: number) => z + r > 100 && z - r < 100.3 && Math.abs(x) < 20;

describe('driving fast', () => {
  it('a car at 200 km/h in a slow frame (0.1 s, 5.5 m) does not tunnel through a thin wall', () => {
    const s = newDriveState(0, 80, 0); s.speed = 55;
    let hit = false;
    for (let i = 0; i < 20 && !hit; i++) hit = driveSteps(s, { throttle: 1, steer: 0, target: 55, braking: false, boost: 1 }, CAR, 0.1, wall);
    expect(hit).toBe(true); expect(s.z).toBeLessThan(100);
  });
  it('looks at what is in the way at least every half metre, however long the frame', () => {
    const round = { ...CAR, halfLength: CAR.halfWidth! };                              // one circle: one look per position
    const s = newDriveState(0, 0, 0); s.speed = 55; const zs: number[] = [];
    driveSteps(s, { throttle: 1, steer: 0, target: 55, braking: false, boost: 1 }, round, 0.1, (_x, z) => { zs.push(z); return false; });
    const seen = [...new Set(zs.map(z => +z.toFixed(4)))].sort((a, b) => a - b);
    expect(seen.length).toBeGreaterThan(8); for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeLessThanOrEqual(MAX_STEP + 0.01);
  });
  it('a slow vehicle takes exactly one step, as before', () => {
    const a = newDriveState(0, 0, 0), b = newDriveState(0, 0, 0); a.speed = b.speed = 10;
    const inp = { throttle: 1, steer: 0.2, target: 19, braking: false, boost: 0 };
    driveSteps(a, inp, CAR, 1 / 60, () => false); driveStep(b, inp, CAR, 1 / 60, () => false);
    expect(a).toEqual(b); expect(10 / 60).toBeLessThan(MAX_STEP);
  });
  it('a car with the boost open accelerates past 40 m/s and holds near the top', () => {
    const s = newDriveState(0, 0, 0); let t = 0;
    while (t < 45 && s.speed < 54) { driveSteps(s, { throttle: 1, steer: 0, target: 55, braking: false, boost: 1 }, CAR, 1 / 30, () => false); t += 1 / 30; }
    expect(s.speed).toBeGreaterThan(50); expect(t).toBeLessThan(40);
  });
});
