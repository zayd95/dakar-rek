import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { E, GRID, HALF, siteDraw, sizeOf, type Site } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { frontOf, perimeter, roadEdges } from '../src/world/almadies/parts';
import type { Batch } from '../src/world/batch';
import { testKit, trisOf } from './helpers/siteCost';
import { colliderInPlan } from './helpers/designChecks';

/**
 * LD2.0-E « open to the street » (the owner, 27 Oct: « I don't want them in isolated areas, they're part of what makes the city »): the district's boundary
 * is a railing on a low plinth along the street and along every edge that runs by a road; a 2.4 m wall only stays between neighbours.
 */
const geos = (b: Batch) => (b as unknown as { geos: THREE.BufferGeometry[] }).geos;
const bm = (k: number) => -HALF + GRID.road + GRID.pitch * k;
const draw = (s: Site, lite = false, o: Parameters<typeof perimeter>[1] = {}) => { const t = testKit(lite), d = siteDraw(t.kit, s); const span = perimeter(d, { gate: s.gate, ...o }); return { t, d, span }; };

describe('the road-facing edges', () => {
  it('are the ones where the site reaches the block\'s edge: the street, one side of a lot, three sides of a block', () => {
    for (const s of SITES) {
      const t = testKit(), d = siteDraw(t.kit, s), e = roadEdges(d), b = { x0: bm(s.block[0]), z0: bm(s.block[1]) }, r = s.rect;
      const onX0 = Math.abs(r.x0 - b.x0) < 1e-6, onX1 = Math.abs(r.x1 - (b.x0 + GRID.blk)) < 1e-6, onZ0 = Math.abs(r.z0 - b.z0) < 1e-6, onZ1 = Math.abs(r.z1 - (b.z0 + GRID.blk)) < 1e-6;
      const sides = [e.left, e.right].filter(Boolean).length + (e.back ? 1 : 0);
      const expected = s.lots.length === 4 ? 3 : s.lots.length === 2 ? 2 : 1;
      expect(sides, `${s.id}: ${JSON.stringify(e)} on the block's edge x0 ${onX0} x1 ${onX1} z0 ${onZ0} z1 ${onZ1}`).toBe(expected);
    }
  });
  it('are mirrored with the plan: the same lot mirrored has its road side on the other hand', () => {
    const s = SITES.find(x => sizeOf(x) === 'S' && x.facing === 'south')!, a = roadEdges(siteDraw(testKit().kit, s)), b = roadEdges(siteDraw(testKit().kit, { ...s, mirror: !s.mirror }));
    expect(a.left).toBe(b.right); expect(a.right).toBe(b.left);
  });
});

describe('a site off the grid (the district viewer) says its road sides itself', () => {
  it('"roads" overrides the grid: the right edge is a railing, the left a wall, on either mirror', () => {
    const base = SITES.find(x => sizeOf(x) === 'S')!;
    for (const mirror of [false, true]) {
      const s: Site = { ...base, rect: { x0: -11, x1: 11, z0: -11, z1: 11 }, mirror, roads: { left: false, right: true, back: false } }, d = siteDraw(testKit().kit, s);
      expect(roadEdges(d)).toEqual({ left: false, right: true, back: false });
      perimeter(d, { gate: s.gate });
      const cs = d.colliders.map(c => colliderInPlan(d, c)).filter(c => c.w < 0.5 && c.d > 4);
      expect(cs.find(c => c.x > 0)!.h).toBeLessThanOrEqual(1.6); expect(cs.find(c => c.x < 0)!.h).toBeGreaterThan(2);
    }
  });
});

describe('the boundary is open to the street', () => {
  for (const s of SITES) it(`${s.id}: a railing, not a wall, on the street edge and the road-side edges; a wall between neighbours; the gate shut and solid`, () => {
    const { d, span } = draw(s), road = roadEdges(d), cs = d.colliders.map(c => colliderInPlan(d, c));
    const street = cs.filter(c => c.z > E - 0.5 && c.d < 0.5 && Math.abs(c.x) > 0 && c.h !== 2.3);
    expect(street.length).toBeGreaterThan(0);
    for (const c of street) expect(c.h, 'the street edge keeps a railing\'s height, not a wall\'s').toBeLessThanOrEqual(1.6);
    const sideWalls = cs.filter(c => c.w < 0.5 && c.d > 4), back = cs.filter(c => c.d < 0.5 && c.w > 10 && c.z < 0);
    const left = sideWalls.find(c => c.x < 0)!, right = sideWalls.find(c => c.x > 0)!;
    expect(left.h <= 1.6, 'left edge').toBe(road.left); expect(right.h <= 1.6, 'right edge').toBe(road.right);
    expect(back[0].h <= 1.6, 'back edge').toBe(road.back);
    const gate = cs.find(c => c.h === 2.3)!;
    expect(gate, 'the shut gate is solid').toBeTruthy();
    expect(Math.abs(gate.x - (span.x0 + span.x1) / 2)).toBeLessThan(0.1);
    expect(frontOf(s)).toBe('fence');
  });
  it('a site that draws its own front stands on the line (front "open"): no street railing, no gate', () => {
    const s = SITES.find(x => x.kind === 'hotel')!, { d, span } = draw(s, false, { front: 'open' });
    expect(frontOf(s)).toBe('open'); expect(span).toEqual({ x0: 0, x1: 0 });
    expect(d.colliders.filter(c => colliderInPlan(d, c).z > E - 0.5 && colliderInPlan(d, c).d < 0.5)).toHaveLength(0);
  });
  it('a walk-in entry cuts the railing: no collider across it, piers and a lantern either side, the gate still shut', () => {
    const s = SITES.find(x => x.kind === 'hotel' && sizeOf(x) === 'M')!, w = s.rect.x1 - s.rect.x0, x0 = s.gate === 'right' ? -w / 4 : w / 4;
    const a = draw(s), b = draw(s, false, { entries: [{ x: x0, w: 5 }] });
    const across = b.d.colliders.map(c => colliderInPlan(b.d, c)).filter(c => c.z > E - 0.5 && c.d < 0.5 && c.h <= 1.6 && Math.abs(c.x - x0) < 2.4 + c.w / 2 && c.w > 0.2);
    expect(across.filter(c => c.x - c.w / 2 < x0 + 2.4 && c.x + c.w / 2 > x0 - 2.4), 'nothing solid across the opening').toHaveLength(0);
    expect(b.d.colliders.map(c => colliderInPlan(b.d, c)).filter(c => c.h === 2.3)).toHaveLength(1);
    expect(trisOf(b.t)).toBeGreaterThan(trisOf(a.t) - 200);
    expect(b.t.batches.bulbs.count).toBeGreaterThan(a.t.batches.bulbs.count);
  });
  it('the old names ("wall", "low") draw the same railing: the district has no solid wall on a street', () => {
    const s = SITES.find(x => sizeOf(x) === 'S')!, a = draw(s), b = draw(s, false, { front: 'wall' }), c = draw(s, false, { front: 'low' });
    expect(trisOf(b.t)).toBe(trisOf(a.t)); expect(trisOf(c.t)).toBe(trisOf(a.t));
  });
});

describe('the railing', () => {
  for (const s of SITES.filter((_s, i) => i % 3 === 0)) it(`${s.id}: its bars and rails face the road, wound to be seen from it, on both presets`, () => {
    for (const lite of [false, true]) {
      const { t, d } = draw(s, lite), o = d.f.p(0, 0);
      const centre = { x: (s.rect.x0 + s.rect.x1) / 2, z: (s.rect.z0 + s.rect.z1) / 2 };
      let quads = 0;
      for (const g of geos(t.batches.plain)) {
        const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
        if (pos.count % 6 || pos.count < 6) continue;
        let flat = true; for (let i = 0; i < nor.count; i++) if (Math.abs(nor.getY(i)) > 1e-6) flat = false;
        if (!flat) continue;
        for (let i = 0; i < pos.count; i += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(pos, i), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1), c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
          const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(), stored = new THREE.Vector3().fromBufferAttribute(nor, i);
          expect(n.dot(stored), 'the winding agrees with the stored normal').toBeGreaterThan(0.99);
          const mid = a.clone().add(b).add(c).divideScalar(3);
          expect((mid.x - centre.x) * n.x + (mid.z - centre.z) * n.z, 'faces away from the site').toBeGreaterThan(0);
          quads++;
        }
      }
      expect(quads, 'bars and rails drawn').toBeGreaterThan(lite ? 20 : 60);
      expect(o).toBeTruthy();
    }
  });
  it('costs a 22 m lot\'s street edge and one road side about 500 triangles on medium, about 350 on low, and a block\'s three more', () => {
    const one = SITES.find(x => sizeOf(x) === 'S')!, block = SITES.find(x => sizeOf(x) === 'L')!;
    const m = trisOf(draw(one).t), l = trisOf(draw(one, true).t), mb = trisOf(draw(block).t);
    expect(m).toBeLessThan(560); expect(l).toBeLessThan(0.75 * m); expect(mb).toBeLessThan(1700);
  });
  it('is deterministic and draws no random number', () => {
    const s = SITES[5], a = draw(s), b = draw(s);
    expect(trisOf(a.t)).toBe(trisOf(b.t));
    expect(a.d.colliders).toEqual(b.d.colliders);
  });
});
