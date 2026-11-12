import type { Batch } from './batch';

/**
 * The modern Dakar house's vocabulary (the Cité Jàmm family house, docs/CITE_JAMM_MAISON.md) for every district's ordinary buildings: a balcony
 * with a glass railing on a corbel, and an entrance (black door, tile-red canopy, blue step). Everything goes into the hub's `plain` batch (the railing's
 * glass is a pale colour there, not a second material): no new draw call in any district. None of it draws from a generator's random stream, so no layout moves.
 */
export interface FrontKit { plain: Batch; lite: boolean }

export const SLAB = 0xe3dac5;      // balcony slab: pale render
export const RAIL_GLASS = 0x8fb5c4;
export const RAIL_TOP = 0x23262c;  // thin iron handrail over the glass
const DOOR = 0x1c1c20, CANOPY = 0xc4552e, STEP = 0x2f64b3;

/**
 * A balcony hung on a wall: `(x, z)` is the wall's face at the balcony's middle, `(nx, nz)` the outward normal (a unit axis), `along` its length
 * on the wall, `y` the floor's height. A slab 1.2 m deep, a glass railing with an iron handrail, a corbel under it (not on Low).
 */
export function glassBalcony(k: FrontKit, x: number, z: number, nx: number, nz: number, along: number, y: number, depth = 1.2) {
  const cx = x + nx * depth / 2, cz = z + nz * depth / 2, ex = nx ? depth : along, ez = nx ? along : depth;
  k.plain.box(ex, 0.2, ez, cx, y - 0.12, cz, SLAB);
  const fx = x + nx * (depth - 0.06), fz = z + nz * (depth - 0.06), rx = nx ? 0.04 : along, rz = nx ? along : 0.04;
  k.plain.box(rx, 0.95, rz, fx, y + 0.06, fz, RAIL_GLASS);
  k.plain.box(nx ? 0.07 : along + 0.06, 0.06, nx ? along + 0.06 : 0.07, fx, y + 1.01, fz, RAIL_TOP);
  if (k.lite) return;
  k.plain.box(nx ? 0.7 : Math.min(1.6, along * 0.4), 0.34, nx ? Math.min(1.6, along * 0.4) : 0.7, x + nx * 0.35, y - 0.46, z + nz * 0.35, SLAB);   // the corbel under the slab
}

/** The entrance of a house or block on a wall: a black door, a small tile canopy on brackets, a blue step. */
export function entrance(k: FrontKit, x: number, z: number, nx: number, nz: number, w = 1.3) {
  const rot = Math.atan2(nx, nz);
  k.plain.box(w, 2.3, 0.12, x + nx * 0.06, 0.1, z + nz * 0.06, DOOR, rot);
  k.plain.box(w + 0.7, 0.14, 1.0, x + nx * 0.55, 0.1, z + nz * 0.55, STEP, rot);
  k.plain.slab(w + 0.9, 0.1, 1.15, x + nx * 0.6, 2.62, z + nz * 0.6, CANOPY, rot, 0.12);
  if (k.lite) return;
  for (const s of [-1, 1]) k.plain.box(0.08, 0.5, 0.08, x + nx * 0.2 + (nz ? s * (w / 2 + 0.3) : 0), 2.12, z + nz * 0.2 + (nx ? s * (w / 2 + 0.3) : 0), DOOR);
}
