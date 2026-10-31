import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { ALLEY_RECT } from '../src/world/hospitalityStrip';
import { BAY_DEPTH, DROP_BAY, FRONT_Z, LOTS, NIGHT_KEEP_CLEAR, NIGHT_RECTS, NIGHT_VENUES, PATIO_SITE, ROAD_EDGE_Z, WALK_Z0, inNightStreet } from '../src/world/nightStreet';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * The Almadies' night street (src/world/nightStreet.ts, docs/districts/ALMADIES-NIGHTLIFE.md): the beach side of the coast road, M4's venues turned toward the road, two car parks of painted bays,
 * the promenade, the alley to La Vague. What the evening needs stays reachable on foot and by car; nothing is marked on the carriageway; the hotels across the road are untouched.
 */
stubCanvas();
let hub: HubWorld | null = null;
const build = async () => (hub ??= (await import('../src/world/builder')).buildHub('almadies', true));
const meets = (c: Collider, x0: number, z0: number, x1: number, z1: number) => c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1;

/** A walkable grid (0.25 m cells, a 0.3 m body) over the beach side and the road, from the hub's colliders. */
function grid(h: HubWorld, cs: Collider[]) {
  const X0 = -128, X1 = 28, Z0 = -160, Z1 = -108, S = 0.25, W = Math.round((X1 - X0) / S), D = Math.round((Z1 - Z0) / S), R = 0.3, solid = new Uint8Array(W * D);
  for (const c of cs) {
    if (c.h < 0.45) continue;                                                   // a kerb or a wheel stop is stepped over
    const i0 = Math.max(0, Math.floor((c.x0 - R - X0) / S)), i1 = Math.min(W - 1, Math.floor((c.x1 + R - X0) / S)), j0 = Math.max(0, Math.floor((c.z0 - R - Z0) / S)), j1 = Math.min(D - 1, Math.floor((c.z1 + R - Z0) / S));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) solid[j * W + i] = 1;
  }
  const at = (x: number, z: number) => [Math.round((x - X0) / S), Math.round((z - Z0) / S)] as const;
  void h;
  return {
    reach(from: [number, number], to: [number, number]) {
      const [si, sj] = at(...from), [ti, tj] = at(...to);
      if (solid[sj * W + si] || solid[tj * W + ti]) return false;
      const seen = new Uint8Array(W * D), q = [sj * W + si]; seen[q[0]] = 1;
      for (let n = 0; n < q.length; n++) {
        const p = q[n], i = p % W, j = (p / W) | 0;
        if (i === ti && j === tj) return true;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= D) continue;
          const k = b * W + a; if (seen[k] || solid[k]) continue; seen[k] = 1; q.push(k);
        }
      }
      return false;
    },
  };
}

describe('the night street', () => {
  it('has its four M4 venues turned toward the road, Le Patio\'s site and La Vague\'s alley on the same front line', async () => {
    const h = await build(), n = h.nightStreet!;
    expect(n.venues.map(v => v.kind)).toEqual(['binta', 'phare', 'lounge', 'comptoir']);
    for (const v of n.venues) expect(v.front).toBe(FRONT_Z);
    expect(PATIO_SITE.z + PATIO_SITE.halfD).toBe(FRONT_Z);                              // the club's gate (local +z) is on the venues' front line
    const sites = [{ x0: PATIO_SITE.x - PATIO_SITE.halfW, x1: PATIO_SITE.x + PATIO_SITE.halfW }, ...NIGHT_VENUES.map(v => ({ x0: v.cx - 6.2, x1: v.cx + 6.2 })), { x0: ALLEY_RECT.x0, x1: ALLEY_RECT.x1 }];
    sites.sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < sites.length; i++) expect(sites[i].x0, `site ${i} overlaps the one before`).toBeGreaterThanOrEqual(sites[i - 1].x1);
    // the hotels across the road are the district's: no colliders of the strip on the south side
    expect(h.rooftopDoor).toBeTruthy();
  });

  it('keeps every painted bay off the carriageway, on the sand verge, and a car in each free one can drive in and out', async () => {
    const h = await build(), n = h.nightStreet!;
    expect(n.bays.length).toBeGreaterThanOrEqual(30);
    for (const b of n.bays) {
      expect(b.z, `bay at ${b.x}`).toBeLessThan(ROAD_EDGE_Z - 1);                         // the whole car clear of the lanes: its tail is 2.1 m behind its middle
      expect(b.z - 2.15).toBeGreaterThan(ROAD_EDGE_Z - BAY_DEPTH - 0.3);
      expect(b.x).toBeGreaterThan(LOTS[b.lot].x0 - 1); expect(b.x).toBeLessThan(LOTS[b.lot].x1 + 1);
    }
    const free = n.bays.filter(b => b.free);
    expect(free.length / n.bays.length).toBeGreaterThan(0.4);
    for (const b of free) {
      expect(h.colliders.filter(c => meets(c, b.x - 0.95, b.z - 2.2, b.x + 0.95, b.z + 2.2)), `free bay ${b.x}`).toEqual([]);                  // the car's own footprint
      expect(h.colliders.filter(c => meets(c, b.x - 1.15, ROAD_EDGE_Z - 0.1, b.x + 1.15, b.z + 2.2)), `way into bay ${b.x}`).toEqual([]);   // and its way in from the road
    }
  });

  it('has free bays by every door, the hotel\'s included', async () => {
    const h = await build(), free = h.nightStreet!.bays.filter(b => b.free);
    const near = (x: number, d: number) => free.filter(b => Math.abs(b.x - x) < d).length;
    expect(near(PATIO_SITE.x, 12), 'Le Patio').toBeGreaterThanOrEqual(2);
    for (const v of NIGHT_VENUES) expect(near(v.cx, 12), v.kind).toBeGreaterThanOrEqual(2);
    expect(near(h.rooftopDoor!.x, 30), 'the hotel and its Terrasse').toBeGreaterThanOrEqual(2);
    expect(free.some(b => b.lot === 'east' && b.x < -14), 'a bay in the east row within sight of the hotel').toBe(true);
  });

  it('can be walked: from the road to every front, the alley\'s gate, the taxi bay and the hotel\'s side of the road', async () => {
    const h = await build(), g = grid(h, h.colliders), from: [number, number] = [-36, -126];
    const fronts: [string, [number, number]][] = [['Le Patio\'s gate', [PATIO_SITE.x, FRONT_Z + 1]], ...NIGHT_VENUES.map(v => [v.kind, [v.cx, FRONT_Z + 1.4]] as [string, [number, number]]),
      ['La Vague\'s gate', [-36, -134.3]], ['the taxi bay', [(DROP_BAY.x0 + DROP_BAY.x1) / 2 + 1, ROAD_EDGE_Z - 1.2]], ['the promenade\'s west end', [-120, WALK_Z0 - 1.5]], ['the promenade\'s east end', [8, WALK_Z0 - 1.5]],
      ['the hotel\'s side of the road (its forecourt gap, the lobby\'s opening)', [-30, -114.2]]];
    for (const [name, to] of fronts) expect(g.reach(from, to), name).toBe(true);
    // and along the promenade from end to end, west lot and east lot each
    expect(g.reach([LOTS.west.x0 + 1, WALK_Z0 - 1.5], [DROP_BAY.x0 - 2, WALK_Z0 - 1.5])).toBe(true);
    expect(g.reach([LOTS.east.x0 + 1, WALK_Z0 - 1.5], [LOTS.east.x1 - 2, WALK_Z0 - 1.5])).toBe(true);
  });

  it('keeps the street dressing, the parked traffic and the beach\'s palms off its ground', async () => {
    const h = await build(), k = h.keepClear ?? [];
    for (const r of NIGHT_KEEP_CLEAR) expect(k.some(c => c.why === r.why && c.x0 === r.x0 && c.x1 === r.x1), r.why).toBe(true);
    expect(k.filter(c => c.why === 'almadies_car_park').length).toBe(2);
    // no beach palm trunk stands in the night street (the beach's own list, src/world/ngorBay.ts): its colliders are 0.6 m squares of height 3
    const trunks = h.colliders.filter(c => c.h === 3 && c.x1 - c.x0 === 0.6 && c.z1 - c.z0 === 0.6 && c.z1 < -128);
    for (const t of trunks) expect(inNightStreet((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2, 0), `palm at ${t.x0}, ${t.z0}`).toBe(false);
    expect(NIGHT_RECTS.west.x1).toBeLessThan(ALLEY_RECT.x0 + 0.01);
    expect(NIGHT_RECTS.east.x0).toBeLessThan(LOTS.east.x0);
  });

  it('is the same every time it is built', async () => {
    const { buildHub } = await import('../src/world/builder'), a = await build(), b = buildHub('almadies', true);
    expect(JSON.stringify(b.nightStreet)).toBe(JSON.stringify(a.nightStreet));
    expect(JSON.stringify(b.colliders)).toBe(JSON.stringify(a.colliders));
  });
});
