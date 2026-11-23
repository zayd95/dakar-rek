import { describe, expect, it } from 'vitest';
import { turnStep } from '../src/core/turn';

describe('turnStep', () => {
  it('keeps full pace going straight and for small corrections', () => {
    expect(turnStep(1, 1, 0.016, 4.2).keep).toBe(1);
    expect(turnStep(1, 1.2, 0.016, 4.2).keep).toBe(1);
  });
  it('slows to 30% on a U-turn and recovers as the body comes around', () => {
    let f = 0, last = 1;
    expect(turnStep(f, Math.PI - 0.01, 0.016, 4.2).keep).toBeCloseTo(0.3, 1);
    for (let i = 0; i < 60; i++) f = turnStep(f, Math.PI - 0.01, 0.016, 4.2).facing;
    last = turnStep(f, Math.PI - 0.01, 0.016, 4.2).keep;
    expect(last).toBe(1);
  });
  it('turns the short way round the wrap', () => {
    const s = turnStep(3.0, -3.0, 0.05, 2);
    expect(s.facing).toBeGreaterThan(3.0);
  });
  it('turns more slowly at a sprint than at a walk', () => {
    const walk = turnStep(0, 1, 0.05, 2).facing, sprint = turnStep(0, 1, 0.05, 7).facing;
    expect(sprint).toBeLessThan(walk);
  });
});
