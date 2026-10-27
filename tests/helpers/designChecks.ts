import * as THREE from 'three';
import type { Batch } from '../../src/world/batch';
import { PALETTES, sizeOf, type PaletteName, type Site, type SiteDraw } from '../../src/world/almadies/contract';
import { SITES } from '../../src/world/almadies/plan';
import type { Collider } from '../../src/world/types';

/**
 * LD2.0-E lane E-V: what the houses' and villas' tests share: a canonical site of a kind on a real lot (any facing, mirror, gate side, storeys and
 * palette), a hub point back in the site's plan, the colours a draw used.
 */
export function siteWith(kind: Site['kind'], o: { facing?: 'north' | 'south'; mirror?: boolean; gate?: Site['gate']; storeys?: number; palette?: PaletteName } = {}): Site {
  const proto = SITES.find(s => s.kind === kind && sizeOf(s) === 'S')!;
  return { ...proto, rect: { ...proto.rect }, facing: o.facing ?? 'south', mirror: o.mirror ?? false, gate: o.gate ?? proto.gate, storeys: o.storeys ?? proto.storeys, palette: o.palette ?? proto.palette, number: '12', id: `test:${kind}:${o.facing ?? 's'}${o.mirror ? 'm' : ''}${o.gate ?? ''}${o.storeys ?? ''}${o.palette ?? ''}` };
}
/** A hub point in the plan of the site a draw was made for (the inverse of the draw's own frame, which is affine). */
export function toPlan(d: SiteDraw, q: { x: number; z: number }): { x: number; z: number } {
  const o = d.f.p(0, 0), ax = d.f.p(1, 0), az = d.f.p(0, 1), a = ax.x - o.x, b = az.x - o.x, c = ax.z - o.z, e = az.z - o.z, det = a * e - b * c, dx = q.x - o.x, dz = q.z - o.z;
  return { x: (e * dx - b * dz) / det, z: (a * dz - c * dx) / det };
}
/** A collider's centre and size in the plan. */
export function colliderInPlan(d: SiteDraw, c: Collider) {
  const m = toPlan(d, { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2 }), p0 = toPlan(d, { x: c.x0, z: c.z0 }), p1 = toPlan(d, { x: c.x1, z: c.z1 });
  return { x: m.x, z: m.z, w: Math.abs(p1.x - p0.x), d: Math.abs(p1.z - p0.z), h: c.h, y0: c.y0 };
}
const geos = (b: Batch) => (b as unknown as { geos: THREE.BufferGeometry[] }).geos;
/** The colours (hex) the primitives of some batches were drawn in. */
export function coloursOf(batches: Record<string, Batch>, names: string[] = ['plain', 'pave', 'leaves', 'glass', 'metal', 'bulbs', 'water']): Set<number> {
  const out = new Set<number>(), c = new THREE.Color();
  for (const n of names) for (const g of geos(batches[n])) { const a = g.attributes.color as THREE.BufferAttribute | undefined; if (a) out.add(c.setRGB(a.getX(0), a.getY(0), a.getZ(0)).getHex()); }
  return out;
}
/** A signature of a draw's silhouette: its colliders in the plan, rounded, sorted. */
export const silhouette = (d: SiteDraw) => d.colliders.map(c => colliderInPlan(d, c)).filter(c => c.h > 2.5).map(c => [c.x, c.z, c.w, c.d, c.h].map(v => Math.round(v * 2) / 2).join(',')).sort().join(';');
export const PAL = Object.keys(PALETTES) as PaletteName[];

/** How many panes of glass (the glass batch's primitives) stand on each storey: by the pane's middle height. */
export function panesPerStorey(batches: Record<string, Batch>, storeyH: number, ground = 0.1): number[] {
  const out: number[] = [];
  for (const g of geos(batches.glass)) {
    const b = new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute), s = Math.floor(((b.min.y + b.max.y) / 2 - ground) / storeyH);
    out[s] = (out[s] ?? 0) + 1;
  }
  return Array.from(out, v => v ?? 0);
}
