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

  it('after an hour jump the people stand at the stops of the line that runs at that hour, not at those of the one that just stopped', async () => {
    const host = new PerfHost('low');
    await host.load({ x: 70, z: 64, yaw: 0 }, 7);
    host.day = GALA_DAY;                                                    // a fight evening: Ligne 23 runs by day, its evening route 23s from 16 h
    const ambient = host.debug<() => { hour: number; live: number; byTag: Record<string, number>; bySpot: Record<string, { n: number; tags: string[] }> }>('ambient');
    for (let k = 0; k < 40; k++) host.frame(0.1);
    /** People at the stops of the line `line` ('23' or '23s'), and at all the stops. */
    const at = (line: string) => Object.entries(ambient().bySpot).filter(([id, s]) => s.tags.includes('stop') && id.startsWith(`place:stop:${line}:`)).reduce((n, [, s]) => n + s.n, 0);
    const jump = (hour: number, frames: number) => { host.hour = hour; host.place(-26, 102, 0); for (let k = 0; k < frames; k++) host.frame(0.1); };
    // (the check reads six frames after the jump; the minute after is the same population, not a different one)
    const evening = [19, 7, 19, 7];
    for (const h of evening) {
      jump(h, 6);
      const soon = { day: at('23'), evening: at('23s'), stops: ambient().byTag.stop ?? 0 };
      for (let k = 0; k < 300; k++) host.frame(0.1);
      const later = { day: at('23'), evening: at('23s'), stops: ambient().byTag.stop ?? 0 };
      if (h === 7) { expect(soon.evening, 'by day nobody waits at the evening route\'s stops').toBe(0); expect(soon.day).toBeGreaterThanOrEqual(3); }
      else { expect(soon.day, 'in the evening nobody waits at the day route\'s stops').toBe(0); expect(soon.evening).toBeGreaterThanOrEqual(3); }
      expect(soon.stops, `${h} h: just after the jump the stops hold what they hold a minute later (${JSON.stringify(soon)} then ${JSON.stringify(later)})`).toBeGreaterThanOrEqual(Math.floor(later.stops * 0.6));
    }
  }, 120000);
});
