import * as THREE from 'three';
import type { Batch } from '../../src/world/batch';
import { E, PALETTES, sizeOf, type PaletteName, type Site, type SiteDraw } from '../../src/world/almadies/contract';
import { SITES } from '../../src/world/almadies/plan';
import { inBand, type Collider } from '../../src/world/types';

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
export function coloursOf(batches: Record<string, Batch>, names: string[] = ['plain', 'pave', 'leaves', 'glass', 'glassDark', 'metal', 'bulbs', 'water']): Set<number> {
  const out = new Set<number>(), c = new THREE.Color();
  for (const n of names) for (const g of geos(batches[n])) { const a = g.attributes.color as THREE.BufferAttribute | undefined; if (a) out.add(c.setRGB(a.getX(0), a.getY(0), a.getZ(0)).getHex()); }
  return out;
}
/** A signature of a draw's silhouette: its colliders in the plan, rounded, sorted. */
export const silhouette = (d: SiteDraw) => d.colliders.map(c => colliderInPlan(d, c)).filter(c => c.h > 2.5).map(c => [c.x, c.z, c.w, c.d, c.h].map(v => Math.round(v * 2) / 2).join(',')).sort().join(';');
export const PAL = Object.keys(PALETTES) as PaletteName[];

/**
 * How many panes of glass (the glass and dark-glass batches' primitives taller than a guard, 1.15 m) stand on each storey: by the pane's middle height. The shared
 * glazing sends about three panes in four to `glass` (they glow at night) and the rest to `glassDark`.
 */
export function panesPerStorey(batches: Record<string, Batch>, storeyH: number, ground = 0.1): number[] {
  const out: number[] = [];
  for (const name of ['glass', 'glassDark']) for (const g of geos(batches[name])) {
    const b = new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute);
    if (b.max.y - b.min.y < 1.15) continue;
    const s = Math.floor(((b.min.y + b.max.y) / 2 - ground) / storeyH);
    out[s] = (out[s] ?? 0) + 1;
  }
  return Array.from(out, v => v ?? 0);
}
/** The number of panes in all (glass and dark glass, taller than a guard). */
export const paneCount = (batches: Record<string, Batch>) => panesPerStorey(batches, 1000).reduce((a, b) => a + b, 0);

/**
 * Can a standing body walk from the pavement through the street edge to the front door's step? A grid walk (10 cm) on the colliders, in the site's plan: the body's
 * circle (`r`) must clear every collider that blocks a standing body (`inBand`), within the site's rectangle and a strip of pavement before its street edge.
 * Returns the free x along the railing's line (where the body crosses the street edge) and whether the step is reached from the pavement.
 */
export function walkToDoor(d: SiteDraw, from: { x: number; z: number }, to: { x: number; z: number }, r = 0.3) {
  const cs = d.colliders.filter(c => inBand(c, 0.1)).map(c => colliderInPlan(d, c)), ex = d.w / 2, eb = d.depth - E, step = 0.1, X0 = -ex, Z0 = -eb, Z1 = E + 2.5;
  const nx = Math.round((2 * ex) / step), nz = Math.round((Z1 - Z0) / step);
  const free = (x: number, z: number) => x - r >= X0 && x + r <= ex && z >= Z0 && z <= Z1 && !cs.some(c => x + r > c.x - c.w / 2 && x - r < c.x + c.w / 2 && z + r > c.z - c.d / 2 && z - r < c.z + c.d / 2);
  const cell = (x: number, z: number) => [Math.round((x - X0) / step), Math.round((z - Z0) / step)] as const;
  const seen = new Uint8Array((nx + 1) * (nz + 1)), q: [number, number][] = [], [sx, sz] = cell(from.x, from.z), [tx, tz] = cell(to.x, to.z);
  if (!free(from.x, from.z)) return { reached: false, crossing: [] as number[] };
  seen[sz * (nx + 1) + sx] = 1; q.push([sx, sz]);
  let reached = false;
  while (q.length) {
    const [i, j] = q.pop()!;
    if (Math.abs(i - tx) <= 1 && Math.abs(j - tz) <= 1) reached = true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a > nx || b > nz || seen[b * (nx + 1) + a] || !free(X0 + a * step, Z0 + b * step)) continue;
      seen[b * (nx + 1) + a] = 1; q.push([a, b]);
    }
  }
  // where a body standing on the railing's line (z = E − 0.2) can be, as plan x
  const crossing: number[] = [];
  for (let i = 0; i <= nx; i++) { const x = X0 + i * step; if (free(x, E - 0.2) && seen[cell(x, E - 0.2)[1] * (nx + 1) + i]) crossing.push(Math.round(x * 10) / 10); }
  return { reached, crossing };
}
