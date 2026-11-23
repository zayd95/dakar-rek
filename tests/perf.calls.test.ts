import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runEvening, type Quality } from './perfHost';
import { AMBIENT_BUDGET, BODY_CALLS, BODY_CALL_BUDGET, bodiesFor } from '../src/social/ambientData';

/**
 * The draw calls of the evening's frame (docs/PERF_EVENING.md « Headroom »). A full humanoid costs about ten of them while
 * it is in view, and the shared humanoid budget may hand the street's nearest ones to a frame all at once: the cap on full
 * bodies is a share of the check's draw-call budget, and the farther ones put their face's details away (src/actors/humanoid.ts).
 */
const CHECK = new TextDecoder().decode(readFileSync(new URL('../scripts/check-perf-evening.mjs', import.meta.url)));
const BUDGET = Object.fromEntries((['low', 'medium', 'high'] as const).map(q => [q, Number(new RegExp(`${q}:\\s*\\{\\s*calls:\\s*(\\d+)`).exec(CHECK)![1]) ])) as Record<Quality, number>;

describe('the cap on full bodies', () => {
  it('reads the browser check’s budget: 180 / 300 / 420 draw calls', () => {
    expect(BUDGET).toEqual({ low: 180, medium: 300, high: 420 });
  });
  it('is a share of it that leaves the rest of the frame (the hub, the vehicles, the arena, the instanced crowds) its room', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const bodies = AMBIENT_BUDGET[q].totalFull;
      expect(bodies).toBe(bodiesFor(BODY_CALL_BUDGET[q]));
      expect(bodies * BODY_CALLS, q).toBeLessThanOrEqual(BODY_CALL_BUDGET[q]);
      expect(BODY_CALL_BUDGET[q], q).toBeLessThanOrEqual((2 / 3) * BUDGET[q]);                // at most two thirds of the check’s calls for the street’s bodies, every one in view
    }
    expect(AMBIENT_BUDGET.low.totalFull).toBeGreaterThanOrEqual(AMBIENT_BUDGET.low.bodies);
  });
});

describe('the frame at the gate with the fans arriving (17:30)', () => {
  for (const q of ['medium', 'high'] as const) {
    it(`${q}: the most draw calls of a frame stays under 90 % of the check's budget`, async () => {
      const [r] = await runEvening(q, { frames: 120, warm: 240, browser: true, stopAfter: '17:30 arrivals' });
      expect(r.moment).toBe('17:30 arrivals');
      expect(r.callsMax, `${q} peak ${r.callsMax}, by group ${JSON.stringify(r.byMax)}`).toBeLessThanOrEqual(0.9 * BUDGET[q]);
    }, 120000);
  }
});
