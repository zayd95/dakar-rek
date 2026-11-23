import { describe, expect, it } from 'vitest';
import { stickMagnitude, STICK_DEAD_ZONE } from '../src/core/stick';

describe('touch stick response', () => {
  it('keeps a resting thumb still, including a five-pixel tremor on the 50px stick', () => {
    for (const m of [0, 5 / 50, STICK_DEAD_ZONE]) expect(stickMagnitude(m)).toBe(0);
  });
  it('eases continuously into fine movement without changing the normal walk, jog or full push', () => {
    let last = 0;
    for (let i = 0; i <= 1000; i++) {
      const response = stickMagnitude(i / 1000);
      expect(response).toBeGreaterThanOrEqual(last);
      expect(response - last).toBeLessThan(.006);
      last = response;
    }
    for (const m of [.24, .5, .59, .6, 1]) expect(stickMagnitude(m)).toBe(m);
  });
  it('clamps a push beyond the stick and negative magnitudes', () => {
    expect(stickMagnitude(2)).toBe(1);
    expect(stickMagnitude(-1)).toBe(0);
  });
});
