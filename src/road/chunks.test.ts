import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHUNK, ChunkMats, buildChunk, onDistrict } from './chunks';
import { CorridorView } from './corridor';
import { DIVIDED, HALF_GROUND, MEDIAN_HALF, ROADS, ROAD_HALF } from './routes';
import { AVENUE_HALF, BUSWAY_HALF, inBusway } from './brt';
import type { HubWorld } from '../world/types';

const mats = new ChunkMats(true);
const tris = (g: THREE.Group) => { let n = 0; g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
const meshes = (g: THREE.Group) => { let n = 0; g.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };

/** Is a road-frame point on a BRT avenue (src/road/brt.ts: it runs across the road, up to 160 m away; its own tests are below)? */
const onAvenue = (road: (typeof ROADS)[number], x: number, z: number) => road.brt.some(l => {
  const dx = x - l.x, dz = z - l.z, t = dx * l.ux + dz * l.uz, lat = dx * l.fx + dz * l.fz;
  return Math.abs(t) < l.len + 45 && Math.abs(lat) < AVENUE_HALF + 30 && Math.abs(t) > 6;
});
/** The VDN's central median (a divided stretch): solid by design, between the two carriageways. */
const onMedian = (road: (typeof ROADS)[number], x: number, z: number) => { const p = road.spine.project(x, z); return DIVIDED.has(road.profileAt(p.s)) && Math.abs(p.d) < MEDIAN_HALF + 0.3; };

for (const road of ROADS) describe(`chunks of ${road.id}`, () => {
  const n = Math.ceil(road.length / CHUNK);
  const all = Array.from({ length: n }, (_, i) => buildChunk({ road, mats, lite: true }, i));

  it('cover the whole road', () => { expect(all.length * CHUNK).toBeGreaterThanOrEqual(road.length); expect(all[0].s0).toBe(0); });

  it('are the same whenever they are built (deterministic from their index)', () => {
    const again = buildChunk({ road, mats, lite: true }, 3);
    expect(again.colliders).toEqual(all[3].colliders); expect(tris(again.group)).toBe(tris(all[3].group));
    const a = (all[3].group.children[2] as THREE.Mesh).geometry.attributes.position.array, b = (again.group.children[2] as THREE.Mesh).geometry.attributes.position.array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('leave the carriageway and the lanes clear: a car (1.3 m with its margin) can drive each lane end to end without touching a solid thing', () => {
    const solids = all.flatMap(c => c.colliders);
    for (let s = 2; s < road.length - 2; s += 2) {
      const f = road.spine.at(s), y = Math.atan2(road.spine.at(s + 2).x - road.spine.at(s - 2).x, road.spine.at(s + 2).z - road.spine.at(s - 2).z);
      for (const lat of [-4.2, -2.8, 2.8, 4.2]) {
        const x = f.x + Math.cos(y) * lat, z = f.z - Math.sin(y) * lat;
        const hit = solids.find(c => x > c.x0 - 1.3 && x < c.x1 + 1.3 && z > c.z0 - 1.3 && z < c.z1 + 1.3);
        expect(hit, `s=${s} lat=${lat} ${JSON.stringify(hit)}`).toBeUndefined();
      }
    }
  });

  it('keep every solid thing close to the road (a collider far from it would be a wall in the middle of nowhere)', () => {
    for (const c of all.flatMap(k => k.colliders)) {
      const x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2, p = road.spine.project(x, z);
      if (!onAvenue(road, x, z)) expect(Math.abs(p.d)).toBeLessThan(26);
      expect(c.h).toBeGreaterThan(0); expect(c.x1).toBeGreaterThan(c.x0); expect(c.z1).toBeGreaterThan(c.z0);
    }
  });

  it('are light: a handful of meshes and a few thousand triangles each', () => {
    for (const c of all) { expect(meshes(c.group)).toBeLessThanOrEqual(5); expect(tris(c.group)).toBeLessThan(14000); }
  });

  it('have finite geometry', () => {
    for (const c of all) c.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) for (const v of m.geometry.attributes.position.array) expect(Number.isFinite(v)).toBe(true); });
  });

  it('keep the roadside off the carriageway: nothing solid inside the road\'s own width', () => {
    for (const c of all.flatMap(k => k.colliders)) {
      const x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2, p = road.spine.project(x, z);
      const half = Math.max(c.x1 - c.x0, c.z1 - c.z0) / 2;
      if (road.junctionS.some(j => Math.abs(j.s - p.s) < 50)) continue;
      if (road.checkpointS !== null && Math.abs(p.s - road.checkpointS) < 1.2) continue;          // the checkpoint's island: below
      if (onMedian(road, x, z)) continue;                                                           // the VDN's median: below
      expect(Math.abs(p.d) + half).toBeGreaterThan(ROAD_HALF - 0.01);
    }
  });

  it('build nothing on the districts\' own ground at either end (the last houses into the Plateau stood across its perimeter street)', () => {
    const p = all.flatMap(c => [...c.colliders.map(k => [(k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2]), ...c.people.map(q => [q.x, q.z])]);
    for (const [x, z] of p) expect(onDistrict(road, x, z), `${x}, ${z}`).toBe(false);
    // and no tall thing at all: every vertex above 3 m (houses, walls' caps, lamps, palms) is off both districts' ground
    for (const c of all) c.group.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || m.geometry.type === 'PlaneGeometry') return;
      const a = m.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) if (a.getY(i) > 3) expect(onDistrict(road, a.getX(i), a.getZ(i)), `${road.id} chunk ${c.index}`).toBe(false);
    });
  });

  it('have flower and plant sellers on the verge, never on the carriageway, varied, a few to a road', () => {
    const sellers = all.flatMap(c => c.sellers);
    expect(sellers.length).toBeGreaterThanOrEqual(4); expect(sellers.length).toBeLessThan(all.length * 2);
    expect(new Set(sellers.map(x => x.side)).size).toBe(2); expect(sellers.some(x => x.big) && sellers.some(x => !x.big)).toBe(true);
    for (const x of sellers) {
      expect(road.junctionS.every(j => Math.abs(j.s - x.s) > 20)).toBe(true);
      // their solid box: the verge between the kerb and the wall line, the whole length of the pots
      const f = road.spine.at(x.s), solidHere = all.flatMap(c => c.colliders).filter(k => { const q = road.spine.project((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2); return Math.abs(q.s - x.s) < x.len / 2 && Math.sign(q.d) === x.side && Math.abs(q.d) > ROAD_HALF + 1.5 && Math.abs(q.d) < HALF_GROUND; });
      expect(solidHere.length, `${x.s} ${JSON.stringify(f)}`).toBeGreaterThan(0);
    }
    // their people: at the kerb's edge at the nearest, never in the carriageway
    for (const c of all) for (const q of c.people) expect(Math.abs(road.spine.project(q.x, q.z).d)).toBeGreaterThan(ROAD_HALF + 0.4 - (road.checkpointS !== null && Math.abs(road.spine.project(q.x, q.z).s - road.checkpointS) < 1 ? 99 : 0));
  });
});

describe('the VDN (corniche-mermoz): a divided artery', () => {
  const road = ROADS.find(r => r.id === 'corniche-mermoz')!, n = Math.ceil(road.length / CHUNK), all = Array.from({ length: n }, (_, i) => buildChunk({ road, mats, lite: true }, i));
  it('has a solid median along its divided stretch (nobody crosses it), open at its junctions', () => {
    const solids = all.flatMap(c => c.colliders);
    let divided = 0, held = 0;
    for (let s = 10; s < road.length - 10; s += 5) {
      if (!DIVIDED.has(road.profileAt(s)) || road.junctionS.some(j => Math.abs(j.s - s) < 30)) continue;
      divided++; const f = road.spine.at(s);
      if (solids.some(c => f.x > c.x0 - 0.2 && f.x < c.x1 + 0.2 && f.z > c.z0 - 0.2 && f.z < c.z1 + 0.2)) held++;
    }
    expect(divided).toBeGreaterThan(40); expect(held / divided).toBeGreaterThan(0.95);
    for (const j of road.junctionS) { const f = road.spine.at(j.s); expect(solids.some(c => f.x > c.x0 && f.x < c.x1 && f.z > c.z0 && f.z < c.z1), j.name).toBe(false); }
  });
});

describe('the BRT crossing at Sacré-Cœur (src/road/brt.ts)', () => {
  const road = ROADS.find(r => r.id === 'corniche-mermoz')!, lay = road.brt[0];
  const chunk = buildChunk({ road, mats, lite: false }, Math.floor(lay.s / CHUNK));
  const solid = (x: number, z: number) => chunk.colliders.some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
  it('is on the road to Mermoz, once', () => { expect(road.brt.length).toBe(1); expect(ROADS.filter(r => r.brt.length).map(r => r.id)).toEqual(['corniche-mermoz']); });
  it('reserves the busway: it is not drivable ground anywhere along the avenue; the avenue\'s car carriageways are', () => {
    for (let t = 22; t < lay.len - 20; t += 4) for (const side of [1, -1]) {
      for (const lat of [-3.35, 0, 3.35]) { const p = lay.at(side * t, lat); expect(road.ground.contains(p.x, p.z, 0), `busway t=${side * t} lat=${lat}`).toBe(false); expect(inBusway(lay, p.x, p.z)).toBe(true); }
      for (const lat of [-9.3, 9.3]) { const p = lay.at(side * t, lat); expect(road.ground.contains(p.x, p.z, 1), `car lane t=${side * t} lat=${lat}`).toBe(true); }
    }
  });
  it('closes the busway\'s mouths at the crossing with solid bollards (a car never turns into it); the crossing itself and the main road are clear', () => {
    for (const side of [1, -1]) for (let lat = -BUSWAY_HALF + 0.6; lat < BUSWAY_HALF - 0.5; lat += 0.8) { const p = lay.at(side * 18.6, lat); expect(solid(p.x, p.z), `mouth ${side} ${lat}`).toBe(true); }
    for (let t = -9; t <= 9; t += 1) for (const lat of [-3.35, 3.35]) { const p = lay.at(t, lat); expect(solid(p.x, p.z), `crossing ${t}`).toBe(false); expect(road.ground.contains(p.x, p.z, 0)).toBe(true); }
  });
  it('has its station island with people waiting, off the carriageways', () => {
    const p = lay.at(33, 0); expect(solid(p.x, p.z)).toBe(true);
    const waiting = chunk.people.filter(q => inBusway(lay, q.x, q.z));
    expect(waiting.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the police checkpoint on the way into the Plateau', () => {
  const road = ROADS.find(r => r.id === 'pikine-plateau')!, s = road.checkpointS!;
  const chunk = buildChunk({ road, mats, lite: false }, Math.floor(s / CHUNK));
  it('stands a short way before the Plateau, on a straight stretch, out of the district', () => {
    expect(road.length - s).toBeGreaterThan(30); expect(road.length - s).toBeLessThan(80);
    const a = road.spine.at(s - 25), b = road.spine.at(s + 25), m = road.spine.at(s);
    expect(Math.abs(Math.atan2(b.x - m.x, b.z - m.z) - Math.atan2(m.x - a.x, m.z - a.z))).toBeLessThan(0.02);
    expect(onDistrict(road, m.x, m.z, 2.5)).toBe(false);
  });
  it('is a small island on the centre line that both lanes pass at their full width, a car in each with a metre to spare', () => {
    const island = chunk.colliders.filter(k => { const q = road.spine.project((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2); return Math.abs(q.s - s) < 1 && Math.abs(q.d) < 1; });
    expect(island.length).toBe(1);
    const k = island[0]; expect(k.x1 - k.x0).toBeLessThanOrEqual(2.05); expect(k.z1 - k.z0).toBeLessThanOrEqual(2.05);
    // a car (half width 0.9) in either lane (2.8 m from the centre line) clears it by 0.8 m; nothing else solid within the carriageway there
    for (const lat of [-2.8, 2.8]) for (let d = -20; d <= 20; d += 0.5) {
      const f = road.spine.at(s + d), y = Math.atan2(road.spine.at(s + d + 2).x - road.spine.at(s + d - 2).x, road.spine.at(s + d + 2).z - road.spine.at(s + d - 2).z);
      const x = f.x + Math.cos(y) * lat, z = f.z - Math.sin(y) * lat;
      expect(chunk.colliders.some(c => x > c.x0 - 1.7 && x < c.x1 + 1.7 && z > c.z0 - 1.7 && z < c.z1 + 1.7)).toBe(false);
    }
  });
  it('has its officers, its post and its pick-up off the carriageway', () => {
    const near = chunk.people.filter(q => Math.abs(road.spine.project(q.x, q.z).s - s) < 15);
    expect(near.length).toBeGreaterThanOrEqual(3);
    for (const q of near) { const d = Math.abs(road.spine.project(q.x, q.z).d); expect(d < 1 || d > ROAD_HALF + 1).toBe(true); }   // on the island, or past the pavement's edge
    const off = chunk.colliders.filter(k => { const q = road.spine.project((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2); return Math.abs(q.s - s) < 15 && Math.abs(q.d) > 1; });
    expect(off.length).toBeGreaterThanOrEqual(2);
    for (const k of off) expect(Math.min(...[[k.x0, k.z0], [k.x0, k.z1], [k.x1, k.z0], [k.x1, k.z1]].map(([x, z]) => Math.abs(road.spine.project(x, z).d)))).toBeGreaterThan(ROAD_HALF + 1.5);   // past the pavement
  });
});

describe('a corridor view', () => {
  const road = ROADS[0];
  const fakeWorld = () => ({ colliders: [] as HubWorld['colliders'] } as unknown as HubWorld);
  const mk = (hub: 'pikine' | 'almadies') => new CorridorView(road, hub, { mats, lite: true, rand: () => 0.5, traffic: 0 });

  it('builds the chunks round a point, nearest first, and no more than asked', () => {
    const v = mk('pikine'), w = fakeWorld(); v.attach(w, 'pikine');
    expect(v.stream(-300, 20, 1)).toBe(1);
    expect(v.info().chunks.length).toBe(1);
    v.stream(-300, 20, 20);
    const chunks = v.info().chunks; expect(chunks.length).toBeGreaterThan(4); expect(chunks.length).toBeLessThan(14);
    v.dispose();
  });

  it('registers its colliders in the district\'s list, and takes them out when a chunk goes', () => {
    const v = mk('pikine'), w = fakeWorld(); v.attach(w, 'pikine');
    v.stream(-300, 20, 30);
    const n = w.colliders.length; expect(n).toBeGreaterThan(0); expect(n).toBe(v.info().colliders);
    v.stream(-1300, -10, 30);                                      // far along the road: the first chunks are freed
    expect(v.info().chunks.includes(0)).toBe(false);
    expect(w.colliders.length).toBe(v.info().colliders);
    v.dispose(); expect(w.colliders.length).toBe(0);
  });

  it('rebases into the other district\'s frame: the same chunks, their colliders moved by the road\'s offset', () => {
    const v = mk('pikine'), a = fakeWorld(); v.attach(a, 'pikine');
    v.stream(-700, 100, 30);
    const before = a.colliders.map(c => ({ ...c })), n = v.info().chunks.length, built = v.info().built;
    const b = fakeWorld(); v.detach(); v.attach(b, 'almadies');
    expect(v.info().chunks.length).toBe(n); expect(v.info().built).toBe(built);            // nothing rebuilt
    expect(b.colliders.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) { expect(b.colliders[i].x0 - before[i].x0).toBeCloseTo(road.dx); expect(b.colliders[i].z0 - before[i].z0).toBeCloseTo(road.dz); }
    expect(v.root.position.x).toBeCloseTo(road.dx); expect(v.root.position.z).toBeCloseTo(road.dz);
    v.dispose();
  });

  it('knows when the player is past the middle, from either end, with a margin', () => {
    const v = mk('pikine'); v.attach(fakeWorld(), 'pikine');
    const at = (s: number, off = { x: 0, z: 0 }) => { const p = road.spine.at(s); return v.swap(p.x + off.x, p.z + off.z); };
    expect(at(road.swapS - 30)).toBeNull(); expect(at(road.swapS + 5)).toBeNull(); expect(at(road.swapS + 30)).toMatchObject({ to: 'almadies' });
    expect(v.swap(0, 0)).toBeNull();                               // in the district's own streets
    const b = mk('almadies'); b.attach(fakeWorld(), 'almadies');
    const atB = (s: number) => { const p = road.spine.at(s); return b.swap(p.x + road.dx, p.z + road.dz); };
    expect(atB(road.swapS + 30)).toBeNull(); expect(atB(road.swapS - 5)).toBeNull(); expect(atB(road.swapS - 30)).toMatchObject({ to: 'pikine' });
    v.dispose(); b.dispose();
  });

  it('knows its ground: the road, and not the district\'s streets', () => {
    const v = mk('pikine'); v.attach(fakeWorld(), 'pikine');
    const p = road.spine.at(300); expect(v.contains(p.x, p.z, 0)).toBe(true); expect(v.contains(0, 0, 0)).toBe(false);
    v.dispose();
  });
});
