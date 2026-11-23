import { describe, expect, it } from 'vitest';
import { GALA_DAY, PerfHost } from './perfHost';
import { ambientLife } from '../src/social/ambientLife';

type Pt = { x: number; z: number };
type Yard = { x0: number; x1: number; z0: number; z1: number; gates: { out: Pt; in: Pt }[]; path(a: Pt, b: Pt): Pt[] | null };
type Inside = { spots: { id: string; tags: string[]; seats: string[]; stands: Pt[]; seatApproach?: Record<string, Pt>; yard?: Yard }[]; yardIn(y: Yard, to: Pt): Pt[] | null; yardOut(y: Yard, from: Pt): { path: Pt[]; to: Pt } | null };

/**
 * The Dibi's lot is fenced by low walls with two gaps (src/venues/dibi.ts): the city's people used to plan their walk from the sidewalk
 * straight to the seat, which the fence closed for three seats out of five (55 % of the walks found no clean way in, and the people
 * at the counter gave up their meal); they now come in through a gap and round the tables (`PlaceSpec.yard`, `AmbientSpot.yard`).
 */
describe('the Dibi\'s yard', () => {
  it('every seat and standing place inside the fence is walked to and left by, never through the fence', async () => {
    const host = new PerfHost('low');
    await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 22.5);
    for (let k = 0; k < 80; k++) host.frame(0.1);
    host.place(-20, -60, 0);
    const L = ambientLife as unknown as Inside;
    const spot = L.spots.find(s => s.tags.includes('dibi'))!, y = spot.yard!;
    expect(y).toBeTruthy();
    expect(y.gates.length).toBe(2);
    const cols = host.world.colliders;
    const inYard = (p: Pt) => p.x > y.x0 && p.x < y.x1 && p.z > y.z0 && p.z < y.z1;
    const targets: Pt[] = [];
    for (const id of spot.seats) {
      const s = host.ctx.seats.get(id)!;
      let to: Pt | null = spot.seatApproach?.[id] ?? null;
      if (!to) { const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw); for (const [ox, oz] of [[fx, fz], [fz, -fx], [-fz, fx], [-fx, -fz]]) { const x = s.x + ox * 0.62, z = s.z + oz * 0.62; if (!cols.some(c => c.h > 0.3 && x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4)) { to = { x, z }; break; } } }
      if (to) targets.push(to);
    }
    targets.push(...spot.stands);
    const inside = targets.filter(inYard);
    expect(inside.length).toBeGreaterThan(40);                              // (the tables, the counter's queue, the grill, the attaya set)
    let walked = 0;
    for (const to of inside) for (let k = 0; k < 4; k++) {
      const into = L.yardIn(y, to), out = L.yardOut(y, to);
      expect(into, `in to ${to.x.toFixed(1)}, ${to.z.toFixed(1)}`).not.toBeNull();
      expect(out, `out from ${to.x.toFixed(1)}, ${to.z.toFixed(1)}`).not.toBeNull();
      for (const path of [into!, out!.path]) {
        // the very test the walk is checked with (a person never walks through a fence or a table)
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3));
          for (let q = 0; q <= n; q++) {
            const x = a.x + (b.x - a.x) * q / n, z = a.z + (b.z - a.z) * q / n;
            const hit = cols.find(c => c.h > 0.3 && x > c.x0 - 0.1 && x < c.x1 + 0.1 && z > c.z0 - 0.1 && z < c.z1 + 0.1 && !(a.x > c.x0 - 0.45 && a.x < c.x1 + 0.45 && a.z > c.z0 - 0.45 && a.z < c.z1 + 0.45) && !(b.x > c.x0 - 0.45 && b.x < c.x1 + 0.45 && b.z > c.z0 - 0.45 && b.z < c.z1 + 0.45));
            expect(hit, `a walk to ${to.x.toFixed(1)}, ${to.z.toFixed(1)} crosses a fence or a table at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeUndefined();
          }
        }
        walked++;
      }
    }
    expect(walked).toBe(inside.length * 8);
  }, 120000);

  it('after a gala the Dibi fills and stays full until about 1 h, and nobody finds the way in closed', async () => {
    const host = new PerfHost('low');
    await host.load({ x: 18, z: -66.3, yaw: 0.75 }, 17.5);
    host.day = GALA_DAY;
    for (let k = 0; k < 60; k++) host.frame(0.1);
    host.hour = 19; for (let k = 0; k < 80; k++) host.frame(0.1);            // the arena's street alive: tonight is a bout night
    const spots = host.debug<() => { id: string; tags: string[] }[]>('ambientSpots')().filter(s => s.tags.includes('dibi')).map(s => s.id);
    expect(spots.length).toBeGreaterThan(0);
    host.hour = 22.5; host.place(-20, -60, 0);
    const dibi = () => host.debug<() => { spot: string; state: string }[]>('ambientActors')().filter(a => spots.includes(a.spot) && a.state !== 'off').length;
    const seen: number[] = [];
    for (let k = 0; k < 1200; k++) { host.frame(0.1); host.hour = 22.5 + (k + 1) / 600; if (k % 100 === 99) seen.push(dibi()); }
    const noWays = host.debug<() => { noWays: Record<string, number> }>('ambientBudget')().noWays;
    expect(Object.keys(noWays).filter(id => spots.includes(id)), JSON.stringify(noWays)).toEqual([]);
    expect(Math.min(...seen.slice(0, 9)), `the Dibi's people every 10 s: ${seen.join(' ')}`).toBeGreaterThanOrEqual(12);
    expect(seen[11], `at midnight: ${seen.join(' ')}`).toBeGreaterThanOrEqual(12);
  }, 180000);
});
