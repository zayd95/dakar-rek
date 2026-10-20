import { describe, expect, it } from 'vitest';
import { driveStep, newDriveState, pedalThrottle } from '../src/transport/drive';
import type { DriveSpec } from '../src/transport/spec';

const spec: DriveSpec = { maxSpeed: 20, reverseSpeed: 4, accel: 4, brake: 9, steer: 6, turnRadius: 4, halfWidth: 0.9, halfLength: 2.3 } as DriveSpec;
const free = () => false;
const run = (frames: number, gas: boolean, brake: boolean, reverse: boolean, s = newDriveState(0, 0, 0)) => {
  for (let i = 0; i < frames; i++) driveStep(s, { throttle: pedalThrottle(gas, brake, reverse, s.speed), steer: 0 }, spec, 1 / 60, free);
  return s;
};

describe('pedals of a car on touch (gas and brake buttons)', () => {
  it('the gas drives forward, releasing it coasts to a stop', () => {
    const s = run(120, true, false, false);
    expect(s.speed).toBeGreaterThan(5);
    run(60 * 20, false, false, false, s);
    expect(s.speed).toBe(0);
  });
  it('holding the brake at a standstill does not back the car up', () => {
    const s = run(300, false, true, false);
    expect(s.speed).toBe(0);
    expect(s.z).toBe(0);
  });
  it('the brake stops a moving car and then holds it, it does not reverse', () => {
    const s = run(120, true, false, false);
    run(60 * 10, false, true, false, s);
    expect(s.speed).toBe(0);
  });
  it('reverse is a gear: the gas backs up, the brake slows that down and stops it', () => {
    const s = run(120, true, false, true);
    expect(s.speed).toBeLessThan(-1);
    run(60 * 10, false, true, true, s);
    expect(s.speed).toBe(0);
  });
  it('the keyboard keeps its own meaning (down = brake, then reverse)', () => {
    const s = newDriveState(0, 0, 0);
    for (let i = 0; i < 120; i++) driveStep(s, { throttle: -1, steer: 0 }, spec, 1 / 60, free);
    expect(s.speed).toBeLessThan(-1);
  });
});
