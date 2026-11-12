import * as THREE from 'three';
import type { Batch } from '../../src/world/batch';
import { E, PALETTES, siteDraw, sizeOf, type PaletteName, type Site, type SiteDraw, type Variant } from '../../src/world/almadies/contract';
import { testKit, trisOf } from './siteCost';
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
 * Where can a standing body go from `from` (on the pavement)? A grid walk (10 cm) on the colliders, in the site's plan: the body's circle (`r`) must clear every collider
 * that blocks a standing body (`inBand`), within the site's rectangle and a strip of pavement before its street edge. `can(x, z)` says whether a point is reached;
 * `crossing` the free x along the railing's line (where the body crosses the street edge) that are reached.
 */
export function walker(d: SiteDraw, from: { x: number; z: number }, r = 0.3) {
  const cs = d.colliders.filter(c => inBand(c, 0.1)).map(c => colliderInPlan(d, c)), ex = d.w / 2, eb = d.depth - E, step = 0.1, X0 = -ex, Z0 = -eb, Z1 = E + 2.5;
  const nx = Math.round((2 * ex) / step), nz = Math.round((Z1 - Z0) / step);
  const free = (x: number, z: number) => x - r >= X0 && x + r <= ex && z >= Z0 && z <= Z1 && !cs.some(c => x + r > c.x - c.w / 2 && x - r < c.x + c.w / 2 && z + r > c.z - c.d / 2 && z - r < c.z + c.d / 2);
  const cell = (x: number, z: number) => [Math.round((x - X0) / step), Math.round((z - Z0) / step)] as const;
  const seen = new Uint8Array((nx + 1) * (nz + 1)), q: [number, number][] = [], [sx, sz] = cell(from.x, from.z);
  if (free(from.x, from.z)) { seen[sz * (nx + 1) + sx] = 1; q.push([sx, sz]); }
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a > nx || b > nz || seen[b * (nx + 1) + a] || !free(X0 + a * step, Z0 + b * step)) continue;
      seen[b * (nx + 1) + a] = 1; q.push([a, b]);
    }
  }
  const can = (x: number, z: number) => { const [i, j] = cell(x, z); for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (i + di >= 0 && j + dj >= 0 && i + di <= nx && j + dj <= nz && seen[(j + dj) * (nx + 1) + i + di]) return true; return false; };
  const crossing: number[] = [];
  for (let i = 0; i <= nx; i++) { const x = X0 + i * step; if (free(x, E - 0.2) && seen[cell(x, E - 0.2)[1] * (nx + 1) + i]) crossing.push(Math.round(x * 10) / 10); }
  return { can, free, crossing, colliders: cs };
}
/** Can a standing body walk from the pavement through the street edge to the front door's step (see `walker`)? */
export function walkToDoor(d: SiteDraw, from: { x: number; z: number }, to: { x: number; z: number }, r = 0.3) {
  const w = walker(d, from, r);
  return { reached: w.can(to.x, to.z), crossing: w.crossing };
}
/** Draws a design on a site with its life: the triangles, the colliders, the draw, the kit, what it handed back as `life`. */
export function drawLife(site: Site, v: Variant, lite = false) {
  const t = testKit(lite), d = siteDraw(t.kit, site), r = v.build(d) ?? {};
  return { tris: trisOf(t), colliders: d.colliders, draw: d, kit: t, life: r.life ?? {} };
}

/**
 * What is wrong with the life a design handed (an empty list: nothing), in the site's plan: over the cap, outside the site, a person or a seat inside a collider or out of reach
 * of a body walking in from the pavement through the opening, a balcony person off the floor's height, the car gate's apron or the door's walk blocked.
 * `door`: the front door's plan point; `opening`: the walk-in entry's centre and width; `gate`: the car gate's span.
 */
export function lifeProblems(r: ReturnType<typeof drawLife>, door: { x: number; z: number }, opening: { x: number }, gate: { x0: number; x1: number }, cap: { people: number; seats: number }, storeyH: number): string[] {
  const out: string[] = [], d = r.draw, people = r.life.people ?? [], seats = r.life.seats ?? [], ex = d.w / 2, eb = d.depth - E, w = walker(d, { x: opening.x, z: E + 1.2 });
  const inside = (x: number, z: number) => Math.abs(x) <= ex && z >= -eb && z <= E;
  if (people.length > cap.people) out.push(`${people.length} people over the cap ${cap.people}`);
  if (seats.length > cap.seats) out.push(`${seats.length} seats over the cap ${cap.seats}`);
  people.forEach((p, i) => {
    if (!inside(p.x, p.z)) out.push(`person ${i} outside the site`);
    if (!p.y) {
      if (!w.free(p.x, p.z)) out.push(`person ${i} stands in a collider (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      else if (!w.can(p.x, p.z)) out.push(`person ${i} cannot be reached from the pavement`);
    } else {
      const f = (p.y + 0.1 - 0.1) / storeyH;
      if (Math.abs(f - Math.round(f)) > 0.02 || Math.round(f) < 1) out.push(`person ${i} on a balcony at y ${p.y}: not a floor's height`);
    }
    if (p.look === undefined) out.push(`person ${i} has no look`);
  });
  seats.forEach((s, i) => {
    if (!inside(s.x, s.z)) out.push(`seat ${i} outside the site`);
    if (s.top < 0.4 || s.top > 0.62) out.push(`seat ${i} at a top of ${s.top}`);
    const fx = s.x + Math.sin(s.yaw) * 0.9, fz = s.z + Math.cos(s.yaw) * 0.9;
    if (!w.can(fx, fz)) out.push(`seat ${i}: nobody can reach the place in front of it (${fx.toFixed(1)}, ${fz.toFixed(1)})`);
  });
  // the car gate's apron and the door's walk hold nothing solid
  const cs = d.colliders.map(c => colliderInPlan(d, c)).filter(c => c.h < 3 && !(c.y0 !== undefined));
  const hit = (a: { x0: number; x1: number; z0: number; z1: number }) => cs.filter(c => c.x + c.w / 2 > a.x0 && c.x - c.w / 2 < a.x1 && c.z + c.d / 2 > a.z0 && c.z - c.d / 2 < a.z1);
  if (hit({ x0: gate.x0, x1: gate.x1, z0: E - 5.5, z1: E - 0.7 }).length) out.push('something solid across the car gate\'s apron');
  if (hit({ x0: door.x - 0.7, x1: door.x + 0.7, z0: door.z + 0.3, z1: E - 0.7 }).length) out.push('something solid across the door\'s walk');
  return out;
}
