import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHUNK, ChunkMats, buildChunk, frame } from '../src/road/chunks';
import { ROADS, ROAD_HALF } from '../src/road/routes';
import { roadCentre } from '../src/transport/lines';
import { busyEdges, clearWidth, edgeKey, eventPieces, pieceSolids, roadEvents, waysIn, type RoadEventKind } from '../src/city/roadEvents';
import { vehicleSpec, type VehicleKind } from '../src/actors/vehicleKit';
import type { HubId } from '../src/core/types';

/**
 * The driving blockers of the owner's iPhone playtest of 24 Oct 2026 (LD2.0-A, docs/ld2/proof/drive/): the pure parts.
 *  1. the way into the Almadies from Pikine was closed by a villa wall standing across the carriageway (src/road/chunks.ts `frame` past the road's end);
 *     road events stood on the first streets in from a road or a border street, and a travaux barrier's box reached 1.3 m into the lane round its panel.
 */

const mats = new ChunkMats(true);
/** Raised geometry of a chunk that stands on the carriageway: every vertex between 0.3 m and 4.4 m high (what a car would drive into) within the road's width. */
function onCarriageway(road: (typeof ROADS)[number], index: number) {
  const c = buildChunk({ road, mats, lite: false }, index), hits: [number, number, number][] = [];
  c.group.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || m.geometry.type === 'PlaneGeometry') return;      // (the boards' faces: high on their posts, checked by the posts)
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i); if (y < 0.3 || y > 4.4) continue;
      const p = road.spine.project(x, z);
      if (Math.abs(p.d) >= ROAD_HALF - 0.05 || p.s < 0.5 || p.s > road.length - 0.5) continue;
      // the Plateau checkpoint's island, its parasol and the cones on its splitters: on the centre line between the two lanes, by design (chunks.test.ts)
      if (road.checkpointS !== null && Math.abs(p.s - road.checkpointS) < 16 && Math.abs(p.d) < 2.5) continue;
      hits.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)]);
    }
  });
  return hits;
}

describe('the roads between districts: nothing stands on the carriageway', () => {
  for (const road of ROADS) it(`${road.id}: no wall, house, palm or post on the road's own width, from end to end`, () => {
    for (let i = 0; i < Math.ceil(road.length / CHUNK); i++) {
      const hits = onCarriageway(road, i);
      expect(hits.length, `${road.id} chunk ${i}: ${JSON.stringify(hits.slice(0, 6))}`).toBe(0);
    }
  });

  it('past the road\'s ends the frame keeps the road\'s heading (the Almadies mouth: west), and inside the road it is what it always was', () => {
    const road = ROADS.find(r => r.id === 'pikine-almadies')!, L = road.length;
    const end = frame(road, L - 0.5), past = frame(road, L + 5), far = frame(road, L + 40);
    expect(Math.abs(past.yaw - end.yaw)).toBeLessThan(1e-6); expect(Math.abs(far.yaw - end.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(end.yaw) - Math.PI / 2)).toBeLessThan(0.05);                       // heading west (−x) into the Almadies
    expect(Math.hypot(past.x - (end.x + Math.sin(end.yaw) * 5.5), past.z - (end.z + Math.cos(end.yaw) * 5.5))).toBeLessThan(0.05);
    const before = frame(road, -6), start = frame(road, 0.5);
    expect(Math.abs(before.yaw - start.yaw)).toBeLessThan(1e-6);
    for (const s of [1, 2.5, 100, 777.7, L - 3, L - 1]) {                                        // within the road: the central difference of before
      const a = road.spine.at(s - 2), b = road.spine.at(s + 2), f = frame(road, s);
      expect(f.yaw).toBeCloseTo(Math.atan2(b.x - a.x, b.z - a.z), 9); expect(f.x).toBeCloseTo(road.spine.at(s).x, 9);
    }
  });
});

describe('road events never close the way in, and always leave a lane', () => {
  const edges: { ax: number; az: number; bx: number; bz: number }[] = [];
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) {
    if (a < 4) edges.push({ ax: roadCentre(a), az: roadCentre(b), bx: roadCentre(a + 1), bz: roadCentre(b) });
    if (b < 4) edges.push({ ax: roadCentre(a), az: roadCentre(b), bx: roadCentre(a), bz: roadCentre(b + 1) });
  }
  const HUBS: HubId[] = ['pikine', 'plateau', 'corniche', 'almadies'];

  it('the ways in are where the roads and the border street come in (the Almadies: from Pikine on its east side, from the Corniche on its south side)', () => {
    const w = waysIn('almadies');
    expect(w.nodes).toContainEqual({ x: 120, z: -60 });                      // the road from Pikine (src/road/routes.ts bMouth (127, −60))
    expect(w.nodes).toContainEqual({ x: -60, z: 120 });                      // the border street from the Corniche (src/transport/hubLink.ts)
    for (const e of [{ ax: 60, az: -60, bx: 120, bz: -60 }, { ax: 120, az: -120, bx: 120, bz: -60 }, { ax: 120, az: -60, bx: 120, bz: 0 }, { ax: -60, az: 60, bx: -60, bz: 120 }, { ax: -120, az: 120, bx: -60, bz: 120 }, { ax: -60, az: 120, bx: 0, bz: 120 }])
      expect(w.edges.has(edgeKey(e)), JSON.stringify(e)).toBe(true);
    expect(waysIn('corniche').nodes).toContainEqual({ x: -60, z: -120 });
    expect(waysIn('pikine').nodes.length).toBe(2); expect(waysIn('plateau').nodes.length).toBe(2);
  });

  it('no event of a year of city days stands on a street at a way in, in any district', () => {
    for (const hub of HUBS) {
      const spawn = { x: 10, z: 10 }, busy = busyEdges({ id: hub, spawn: { ...spawn, yaw: 0 } }), ways = waysIn(hub).edges;
      for (const k of ways) expect(busy.has(k)).toBe(true);
      let n = 0;
      for (let d = 1; d <= 365 * 4; d++) for (const ev of roadEvents(hub, d, edges, busy, spawn)) { n++; expect(ways.has(edgeKey(ev.edge)), `${hub} day ${d}: ${ev.kind} on ${edgeKey(ev.edge)}`).toBe(false); }
      expect(n).toBeGreaterThan(365);                                         // and there still are events, one or two a day
    }
  });

  const size = (k: VehicleKind) => { const s = vehicleSpec(k, { seed: 1, driver: false, passengers: false }); return { length: s.length, width: s.width, height: s.height }; };
  const KINDS: RoadEventKind[] = ['checkpoint', 'panne', 'accident', 'travaux', 'bouchon'];

  it('every kind leaves a whole lane clear: more than 3.5 m between its solid things and the far kerb (a car and its margin need 3 m)', () => {
    for (const kind of KINDS) {
      const solids = eventPieces(kind).flatMap(p => pieceSolids(p, size));
      expect(solids.length, kind).toBeGreaterThan(0);
      expect(clearWidth(solids), kind).toBeGreaterThan(3.5);
      // and the lane left is the other one (lat < 0): nothing solid crosses the centre line by more than a few centimetres
      for (const b of solids) expect(b.lat - b.hc, `${kind} ${JSON.stringify(b)}`).toBeGreaterThan(-0.25);
    }
  });

  it('what is solid is what is drawn: a travaux barrier is its 2.4 m panel, not a 2.6 m square round it; a car turned across the lane is three squares along it', () => {
    const t = eventPieces('travaux'), barriers = t.filter(p => p.what === 'barrier');
    expect(barriers.length).toBe(2);
    for (const b of barriers) { const [s] = pieceSolids(b, size); expect(s.ha).toBeCloseTo(1.2, 6); expect(s.hc).toBeLessThanOrEqual(0.15); }
    const taxi = eventPieces('accident').find(p => p.what === 'vehicle' && p.kind === 'taxi')!, sq = pieceSolids(taxi, size), v = size('taxi');
    expect(sq.length).toBe(3);
    // squares of the car's half width, centred on its own axis (the old axis-aligned box of the car turned 0.5 rad reached 0.8 m past its body across the lane)
    for (const b of sq) { expect(b.ha).toBeCloseTo(v.width / 2, 6); expect(b.hc).toBeCloseTo(v.width / 2, 6); expect(Math.hypot(b.along - taxi.along, b.lat - taxi.lat)).toBeLessThanOrEqual(v.length / 2 - v.width / 2 + 1e-9); }
    const lats = sq.map(b => b.lat); expect(Math.max(...lats) - Math.min(...lats)).toBeGreaterThan(0.5);   // turned: the squares follow its heading across the lane
  });
});
