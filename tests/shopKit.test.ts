import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHOP_TYPES, buildShopInterior, shopLocal, type ShopDetail, type ShopInterior, type ShopRect, type ShopType } from '../src/world/shopKit';
import type { Collider } from '../src/world/types';
import { furnitureMaterials } from '../src/world/furnitureKit';

/** Footprints each type is used at (city shells, the mall, the juice bar, the bank hall, small walk-in rooms). */
const SIZES: Record<ShopType, { w: number; d: number }[]> = {
  grocery: [{ w: 17, d: 8 }, { w: 12, d: 8 }, { w: 8, d: 6 }],
  phone: [{ w: 17, d: 8 }, { w: 12, d: 8 }, { w: 8, d: 6 }],
  clothing: [{ w: 17, d: 8 }, { w: 12, d: 8 }, { w: 8, d: 6 }],
  furniture: [{ w: 12, d: 8 }, { w: 14, d: 9 }],
  pharmacy: [{ w: 12, d: 8 }, { w: 8, d: 6 }],
  cafe: [{ w: 10, d: 8 }, { w: 8, d: 6 }],
  bank: [{ w: 32, d: 22 }, { w: 14, d: 10 }],
  hardware: [{ w: 12, d: 8 }, { w: 8, d: 6 }],
  craft: [{ w: 10, d: 8 }],
  beauty: [{ w: 17, d: 8 }, { w: 8, d: 6 }],
};
const DETAILS: ShopDetail[] = ['low', 'medium', 'high'];
const TRIS: Record<ShopDetail, number> = { low: 9000, medium: 14000, high: 20000 };

const inside = (r: ShopRect, p: { x: number; z: number }, m = 0) => p.x >= r.x0 + m && p.x <= r.x1 - m && p.z >= r.z0 + m && p.z <= r.z1 - m;
const inCollider = (cols: Collider[], p: { x: number; z: number }, m: number) => cols.some(c => p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m);

/** Grid flood fill from `from` (player radius `r`): which of `to` can be walked to inside the footprint. */
function reachable(s: ShopInterior, from: { x: number; z: number }, to: { x: number; z: number }[], r = 0.28, step = 0.1) {
  const b = s.bounds, nx = Math.ceil((b.x1 - b.x0) / step) + 1, nz = Math.ceil((b.z1 - b.z0) / step) + 1;
  const free = (i: number, j: number) => { const p = { x: b.x0 + i * step, z: b.z0 + j * step }; return inside(b, p, 0.05) && !inCollider(s.colliders, p, r); };
  const seen = new Uint8Array(nx * nz), q: number[] = [];
  const cell = (p: { x: number; z: number }) => [Math.round((p.x - b.x0) / step), Math.round((p.z - b.z0) / step)];
  const [si, sj] = cell(from);
  if (!free(si, sj)) return to.map(() => false);
  seen[si * nz + sj] = 1; q.push(si, sj);
  while (q.length) {
    const j = q.pop()!, i = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= nx || c >= nz || seen[a * nz + c] || !free(a, c)) continue;
      seen[a * nz + c] = 1; q.push(a, c);
    }
  }
  return to.map(p => {   // the nearest free cell around the spot was reached
    const [i, j] = cell(p);
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) { const a = i + di, c = j + dj; if (a >= 0 && c >= 0 && a < nx && c < nz && seen[a * nz + c]) return true; }
    return false;
  });
}

function meshes(g: THREE.Object3D) { let n = 0; g.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; }); return n; }

describe('shop interior kit', () => {
  for (const type of SHOP_TYPES) for (const fp of SIZES[type]) for (const detail of DETAILS) for (const shell of [false, true]) {
    if (type === 'bank' && shell && fp.w > 20) continue;
    it(`${type} ${fp.w}×${fp.d} ${detail}${shell ? ' walk-in' : ''}: budget, anchors, colliders, reachability`, () => {
      const s = buildShopInterior(type, fp, 3, { detail, shell, id: 'test' });
      const a = s.anchors, b = s.bounds;
      // budget: 1–3 draw calls (atlas body, glass, the showroom's furniture), triangles by quality
      expect(s.budget.drawCalls).toBe(meshes(s.group));
      expect(s.budget.drawCalls).toBeGreaterThanOrEqual(1);
      expect(s.budget.drawCalls).toBeLessThanOrEqual(3);
      expect(s.budget.tris).toBeLessThan(TRIS[detail]);
      // every anchor stands inside the footprint
      const spots = [a.counter, a.keeper, a.door, a.till, ...a.queue, ...a.browse, ...a.staff];
      for (const p of spots) expect(inside(b, p, 0.1), `${JSON.stringify(p)} in ${JSON.stringify(b)}`).toBe(true);
      // colliders inside the footprint (a walk-in room's walls just outside it)
      const m = shell ? -0.25 : -0.01;
      for (const c of s.colliders) { expect(c.x0).toBeGreaterThanOrEqual(b.x0 + m); expect(c.x1).toBeLessThanOrEqual(b.x1 - m); expect(c.z0).toBeGreaterThanOrEqual(b.z0 + m); expect(c.z1).toBeLessThanOrEqual(b.z1 - m); expect(c.h).toBeGreaterThan(0); }
      expect(s.colliders.length).toBeGreaterThan(type === 'cafe' ? 4 : 6);
      // people can stand at the counter, the keeper's place, the queue and in front of the displays
      for (const p of [a.counter, a.keeper, a.door, ...a.queue, ...a.browse]) expect(inCollider(s.colliders, p, 0.25), `blocked: ${JSON.stringify(p)}`).toBe(false);
      expect(inCollider(s.colliders, a.counter, 0.45)).toBe(false);                 // a place anchor (city check: 0.4 m clear)
      // and walk there from the entrance: the counter, the keeper's place (behind it), every display
      const ok = reachable(s, a.door, [a.counter, a.keeper, ...a.queue, ...a.browse]);
      expect(ok[0], 'counter reachable').toBe(true);
      expect(ok[1], 'keeper reachable').toBe(true);
      ok.slice(2).forEach((v, i) => expect(v, `spot ${i} reachable`).toBe(true));
      expect(a.queue[0]).toEqual(a.counter);
      expect(a.browse.length).toBeGreaterThan(type === 'beauty' || type === 'pharmacy' || type === 'cafe' ? -1 : 0);
      // seats: unique ids, in the footprint, a sitting height
      expect(new Set(s.seats.map(x => x.id)).size).toBe(s.seats.length);
      for (const st of s.seats) { expect(inside(b, st)).toBe(true); expect(st.top).toBeGreaterThan(0.3); expect(st.top).toBeLessThan(0.9); expect(st.occupant).toBeNull(); }
      s.dispose();
    });
  }

  it('is deterministic for a seed and varies between seeds', () => {
    const a = buildShopInterior('grocery', { w: 12, d: 8 }, 5), b = buildShopInterior('grocery', { w: 12, d: 8 }, 5), c = buildShopInterior('grocery', { w: 12, d: 8 }, 6);
    expect(a.budget.tris).toBe(b.budget.tris);
    expect(a.anchors).toEqual(b.anchors);
    expect(a.colliders).toEqual(b.colliders);
    expect(c.budget.tris).not.toBe(a.budget.tris);
  });

  it('scales the detail with quality', () => {
    for (const t of SHOP_TYPES) {
      const fp = SIZES[t][0];
      const lo = buildShopInterior(t, fp, 1, { detail: 'low' }).budget.tris, hi = buildShopInterior(t, fp, 1, { detail: 'high' }).budget.tris;
      expect(lo, t).toBeLessThan(hi);
    }
  });

  it('every type has its own trade: the furniture showroom uses kit furniture and offers its sofa', () => {
    const s = buildShopInterior('furniture', { w: 12, d: 8 }, 1, { id: 'maison' });
    expect(s.group.children.some(o => (o as THREE.Mesh).material === furnitureMaterials().body)).toBe(true);
    expect(s.seats.some(x => x.kind === 'sofa')).toBe(true);
    const bank = buildShopInterior('bank', { w: 32, d: 22 }, 1);
    expect(bank.anchors.staff.length).toBeGreaterThanOrEqual(2);
    expect(bank.anchors.queue.length).toBeGreaterThanOrEqual(4);
    expect(bank.seats.filter(x => x.kind === 'chair').length).toBeGreaterThanOrEqual(8);
    const cafe = buildShopInterior('cafe', { w: 10, d: 8 }, 1);
    expect(cafe.seats.some(x => x.kind === 'stool')).toBe(true);
  });

  it('places in the world: anchors, seats and colliders follow the yaw', () => {
    const at = { x: 100, z: -50, y: 0.13, yaw: Math.PI / 2 };
    const local = buildShopInterior('phone', { w: 12, d: 8 }, 2), world = buildShopInterior('phone', { w: 12, d: 8 }, 2, { at });
    const back = shopLocal(at, world.anchors.counter);
    expect(back.x).toBeCloseTo(local.anchors.counter.x, 5); expect(back.z).toBeCloseTo(local.anchors.counter.z, 5);
    expect(world.anchors.counter.yaw).toBeCloseTo(local.anchors.counter.yaw + Math.PI / 2, 5);
    expect(world.group.position.x).toBe(100); expect(world.group.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(world.colliders.length).toBe(local.colliders.length);
    for (const c of world.colliders) expect(inside(world.bounds, { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2 })).toBe(true);
    expect(world.seats.every(s => s.top > 0.13)).toBe(true);
  });

  it('leaves reserved areas empty (another module furnishes them)', () => {
    const reserve = [{ x0: 3.6, x1: 8.5, z0: -4, z1: 4 }];
    const s = buildShopInterior('beauty', { w: 17, d: 8 }, 1, { reserve });
    for (const c of s.colliders) expect(c.x1 <= 3.6 || c.x0 >= 8.5, JSON.stringify(c)).toBe(true);
  });

  it('keeps the routes of the shop people clear (Boutique Diallo and Atelier Ndeye, 17 m shells)', () => {
    // src/social/routines.ts: aisle x = shop + 5.5 (Diallo) / + 6 (Ndeye) from the street to z = −0.4, then the counter
    // at (−4, 0.1) and Mamadou's stool at (−5.6, −0.1) — local to the shop's centre
    for (const type of ['grocery', 'clothing'] as const) for (const detail of DETAILS) {
      const s = buildShopInterior(type, { w: 17, d: 8 }, 1, { detail });
      const path = [[5.5, 3.9], [5.5, -0.4], [-4, 0.1], [-5.6, -0.1]], aisle2 = [[6, 3.9], [6, -0.4], [-4, 0.1]];
      for (const line of [path, aisle2]) for (let n = 1; n < line.length; n++) for (let t = 0; t <= 1; t += 0.05) {
        const p = { x: line[n - 1][0] * (1 - t) + line[n][0] * t, z: line[n - 1][1] * (1 - t) + line[n][1] * t };
        expect(inCollider(s.colliders, p, 0.25), `${type} ${detail} blocked at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(false);
      }
      expect(Math.hypot(s.anchors.keeper.x + 4, s.anchors.keeper.z - 0.1)).toBeLessThan(0.6);
    }
  });
});
