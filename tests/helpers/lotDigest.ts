import * as THREE from 'three';
import { vi } from 'vitest';
import { Batch } from '../../src/world/batch';
import type { HubWorld } from '../../src/world/types';

/**
 * A digest of everything a hub's generator draws and makes solid OUTSIDE a rectangle of the ground (a lot replaced by its own module): every
 * merged primitive of every batch in the order it was drawn, the colliders, canopies, interactables, seats and people. Two builds whose
 * digests match drew the same street, primitive for primitive: the generator's random draws were not shifted (tests/villaCompound.test.ts).
 */
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface HubDigest { batches: { n: number; hash: string }[]; colliders: string[]; canopies: string[]; interactables: string[]; seats: string[]; people: string[] }

const r2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const origBuild = Batch.prototype.build;
const touches = (b: Rect, r: Rect) => b.x1 > r.x0 && b.x0 < r.x1 && b.z1 > r.z0 && b.z0 < r.z1;

export async function digestHub(build: () => HubWorld | Promise<HubWorld>, lot: Rect, margin = 0.3): Promise<HubDigest> {
  const R: Rect = { x0: lot.x0 - margin, x1: lot.x1 + margin, z0: lot.z0 - margin, z1: lot.z1 + margin };
  const calls: string[][] = [];
  const spy = vi.spyOn(Batch.prototype, 'build').mockImplementation(function (this: Batch, ...args: unknown[]) {
    const geos = (this as unknown as { geos: THREE.BufferGeometry[] }).geos, keys: string[] = [];
    for (const g of geos) {
      const p = g.attributes.position as THREE.BufferAttribute, b = new THREE.Box3().setFromBufferAttribute(p);
      if (touches({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z }, R)) continue;
      const c = g.attributes.color as THREE.BufferAttribute | undefined;
      keys.push([p.count, r2(b.min.x), r2(b.min.y), r2(b.min.z), r2(b.max.x), r2(b.max.y), r2(b.max.z), c ? `${r2(c.getX(0))},${r2(c.getY(0))},${r2(c.getZ(0))}` : '-'].join('|'));
    }
    calls.push(keys);
    return origBuild.apply(this, args as [THREE.Material, boolean?, boolean?]);
  });
  let hub: HubWorld;
  try { hub = await build(); } finally { spy.mockRestore(); }
  const out = (o: { x: number; z: number }) => !(o.x > R.x0 && o.x < R.x1 && o.z > R.z0 && o.z < R.z1);
  return {
    batches: calls.filter(k => k.length).map(k => ({ n: k.length, hash: fnv(k.join(';')) })),
    colliders: hub.colliders.filter(c => !touches(c, R)).map(c => [c.x0, c.z0, c.x1, c.z1, c.h].map(r2).join(',')),
    canopies: (hub.canopies ?? []).filter(out).map(c => [c.x, c.z, c.r, c.y0, c.y1].map(r2).join(',')),
    interactables: hub.interactables.filter(out).map(i => `${i.id}@${r2(i.x)},${r2(i.z)}`),
    seats: hub.seats.filter(out).map(s => `${s.id}@${r2(s.x)},${r2(s.z)}`),
    people: hub.people.filter(out).map(p => `${r2(p.x)},${r2(p.z)},${p.clip}`),
  };
}
