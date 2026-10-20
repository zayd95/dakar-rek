import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHUNK, ChunkMats, buildChunk } from './chunks';
import { CorridorView } from './corridor';
import { ROADS, ROAD_HALF } from './routes';
import type { HubWorld } from '../world/types';

const mats = new ChunkMats(true);
const tris = (g: THREE.Group) => { let n = 0; g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
const meshes = (g: THREE.Group) => { let n = 0; g.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };

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
      expect(Math.abs(p.d)).toBeLessThan(26); expect(c.h).toBeGreaterThan(0); expect(c.x1).toBeGreaterThan(c.x0); expect(c.z1).toBeGreaterThan(c.z0);
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
      expect(Math.abs(p.d) + half).toBeGreaterThan(ROAD_HALF - 0.01);
    }
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
