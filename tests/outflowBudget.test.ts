import { describe, expect, it } from 'vitest';
import { GALA_DAY, PerfHost } from './perfHost';
import type { PlaceSpec } from '../src/activity/places';

/**
 * The ambient life's per-frame budgets, on the whole hub in node (docs/PERF_EVENING.md « Wave 5: the outflow »): through an
 * evening's two hours of arrivals and departures no frame plans more routes than its share, and the spots rebuilt when a
 * place opens or closes take several frames (nobody waits for them in one), then are there.
 */
describe('the ambient life under its budgets', () => {
  it('plans at most one route a frame through two hours of the evening, and rebuilds the spots in steps', async () => {
    const host = new PerfHost('low');
    await host.load({ x: 6, z: -66.3, yaw: 1.0 }, 21);
    host.day = GALA_DAY;
    const budget = () => host.debug<() => { paths: number; buildFrames: number; building: boolean; spots: number; live: number }>('ambientBudget')();
    for (let k = 0; k < 80; k++) host.frame(0.1);                           // the hub's first build, the first people
    expect(budget().spots).toBeGreaterThan(20);
    expect(budget().building).toBe(false);
    // 21:00 to 23:00 in 120 frames (a reconcile every five): people sit down, leave, come
    let live = budget().live, moved = 0;
    for (let k = 0; k < 120; k++) {
      host.hour = 21 + (k + 1) / 60;
      host.frame(0.1);
      if (k % 10 === 9) { const l = budget().live; moved += Math.abs(l - live); live = l; }
    }
    expect(budget().paths).toBeLessThanOrEqual(1);                          // (a frame of 0.1 s: one route)
    expect(live).toBeGreaterThan(5);                                         // (the evening had people in it)
    expect(moved).toBeGreaterThan(0);                                        // (and they came and went: the budget was asked for something)

    // a place opens: its spot is built in steps over several frames, and the people go on meanwhile
    const before = budget();
    const spec = { id: 'dibi-budget', type: 'dibi', name: 'Dibi', space: 'street', hours: [11, 2], anchors: [{ id: 'counter', kind: 'counter', x: 14, z: -70 }], offers: {} } as PlaceSpec;
    host.debug<(s: PlaceSpec) => void>('ambientAddPlace')(spec);
    let frames = 0;
    for (; frames < 60; frames++) { host.frame(0.1); if (frames > 0 && !budget().building && host.debug<() => { place?: string }[]>('ambientSpots')().some(s => s.place === 'dibi-budget')) break; }
    const after = budget();
    expect(after.building).toBe(false);
    expect(host.debug<() => { place?: string }[]>('ambientSpots')().some(s => s.place === 'dibi-budget')).toBe(true);
    expect(after.buildFrames).toBeGreaterThanOrEqual(2);                    // (several frames, not one)
    expect(after.buildFrames).toBeLessThan(30);
    expect(after.spots).toBeGreaterThanOrEqual(before.spots - 1);              // (the new place may stand in for a legacy one next to it)
    expect(after.paths).toBeLessThanOrEqual(1);
  }, 120000);
});
