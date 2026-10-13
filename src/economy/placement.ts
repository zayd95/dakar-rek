import type { Placement } from '../core/types';
import type { FurnitureSpec, HomeLevel, HomeSpec } from './catalog';

/**
 * Where furniture can stand in a home: the room's walls, its built-in pieces (bed, wardrobe, kitchen…), the passages
 * kept free (the door…) and the other pieces. Pure logic (unit-tested), shared by the purchase (automatic placement),
 * the save and the placement mode inside the home (src/economy/homeEditor.ts). Coordinates are metres from the
 * interior's centre; +z is the door side (south wall). A piece faces +z at quarter turn 0, its back against −z.
 */
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface HomeLayout {
  level: HomeLevel;
  /** Inner size of the room (m). */
  w: number; d: number;
  /** x of the door in the south wall. */
  doorX: number;
  /** Built-in pieces nothing can stand on. */
  blocks: Rect[];
  /** Passages kept free (door, kitchen, shower): only flat pieces (rugs) may go there. */
  clear: Rect[];
  /** Usual spots of some pieces in this home (the starter pieces in the starter room). */
  defaults: Record<string, Placement>;
}
/** Step of the placement grid (m). */
export const GRID = 0.25;
const EPS = 1e-6;
const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });

/**
 * The starter room (src/world/interiors.ts, kind 'home'): 6 × 4.8 m, door at x = 1.7. Its built-ins are the bed, the
 * wardrobe, the small table and its chair, the standing fan, the suitcase, the ataya stove and the washing bucket.
 * The starter pieces keep the spots they had before the placement mode existed.
 */
const STARTER_ROOM: HomeLayout = {
  level: 'room', w: 6, d: 4.8, doorX: 1.7,
  blocks: [
    R(-2.7, -1.65, -1.1, 0.45),      // bed
    R(1.7, -2.3, 2.9, -1.7),         // wardrobe
    R(1.9, 0.4, 2.9, 1.0),           // table
    R(1.15, 0.65, 1.65, 1.15),       // its chair
    R(-2.75, 1.65, -2.25, 2.15),     // standing fan
    R(-2.85, -2.25, -2.15, -1.95),   // suitcase
    R(-0.15, -2.0, 0.55, -0.8),      // prayer mat
    R(-0.8, 1.6, -0.05, 2.0),        // ataya stove and glasses
    R(-1.85, 1.75, -1.05, 2.25),     // bucket and kettle
  ],
  clear: [R(1.0, 1.2, 2.4, 2.4), R(-1.9, 0.9, -1.0, 1.6)],   // the door; in front of the bucket
  defaults: {
    radio: { x: -0.9, z: -2.2, rot: 0 },
    miroir: { x: 2.95, z: -0.7, rot: 3 },
    tapis: { x: -0.1, z: 0.7, rot: 0 },
    chaises: { x: -2.55, z: 1.09, rot: 1 },
    tele: { x: 1.05, z: -2.2, rot: 0 },
  },
};

/**
 * Bigger homes (src/economy/homeInterior.ts builds the same plan): one open room, a kitchen counter along the west wall
 * (north end), a shower corner in the north-east, the door in the south wall 1.3 m from the east corner.
 */
export function openPlan(level: HomeLevel, w: number, d: number): HomeLayout {
  const kz = Math.min(2.6, d * 0.36), doorX = w / 2 - 1.3;
  return {
    level, w, d, doorX,
    blocks: [R(-w / 2, -d / 2, -w / 2 + 0.6, -d / 2 + kz), R(w / 2 - 1.2, -d / 2, w / 2, -d / 2 + 1.2)],
    clear: [R(doorX - 0.7, d / 2 - 1.4, doorX + 0.7, d / 2), R(-w / 2 + 0.6, -d / 2, -w / 2 + 1.4, -d / 2 + kz), R(w / 2 - 1.2, -d / 2 + 1.2, w / 2, -d / 2 + 1.9)],
    defaults: {},
  };
}
export const layoutOf = (h: HomeSpec): HomeLayout => (h.home.level === 'room' ? STARTER_ROOM : openPlan(h.home.level, h.home.w, h.home.d));

/** Footprint of a piece standing at `at` (quarter turns 1 and 3 swap its width and depth). */
export function footprint(f: Pick<FurnitureSpec, 'w' | 'd'>, at: Placement): Rect {
  const odd = at.rot % 2 === 1, hw = (odd ? f.d : f.w) / 2, hd = (odd ? f.w : f.d) / 2;
  return R(at.x - hw, at.z - hd, at.x + hw, at.z + hd);
}
export const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
/** Game yaw of a piece (forward = sin/cos, as everywhere in the game). */
export const yawOf = (at: Placement) => (at.rot * Math.PI) / 2;
/** A point of the piece (before rotation) in home coordinates — the same rotation as three.js `rotation.y = yaw`. */
export function toHome(at: Placement, px: number, pz: number): [number, number] {
  const a = yawOf(at), c = Math.cos(a), s = Math.sin(a);
  return [at.x + px * c + pz * s, at.z - px * s + pz * c];
}

export interface Placed { uid?: string; spec: FurnitureSpec; at: Placement }

/** Why a piece cannot stand there, or null. Flat pieces (rugs) only avoid other rugs and the built-ins. */
export function whyNot(layout: HomeLayout, f: FurnitureSpec, at: Placement, others: readonly Placed[]): string | null {
  const r = footprint(f, at);
  if (r.x0 < -layout.w / 2 - EPS || r.x1 > layout.w / 2 + EPS || r.z0 < -layout.d / 2 - EPS || r.z1 > layout.d / 2 + EPS) return 'Contre le mur';
  if (layout.blocks.some(b => overlaps(r, b))) return 'Gêné par un meuble de la maison';
  if (!f.flat && layout.clear.some(b => overlaps(r, b))) return 'Laisse le passage libre';
  for (const o of others) if (!!o.spec.flat === !!f.flat && overlaps(r, footprint(o.spec, o.at))) return 'Gêné par un autre meuble';
  return null;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * A free spot for a new piece: its usual spot in this home if free, otherwise against a wall (back to the wall, facing
 * the room, from the middle of each wall outwards: north, west, east, south), otherwise anywhere; null if the home is full.
 * Rugs go to the middle of the room first.
 */
export function autoPlace(layout: HomeLayout, f: FurnitureSpec, others: readonly Placed[]): Placement | null {
  const ok = (at: Placement) => !whyNot(layout, f, at, others);
  const def = layout.defaults[f.id];
  if (def && ok(def)) return { ...def };
  const W = layout.w / 2, D = layout.d / 2;
  const steps = (half: number, size: number) => {
    const n = Math.floor((half * 2 - size) / 2 / GRID + EPS), out: number[] = [];
    for (let k = 0; k <= n; k++) { out.push(k * GRID); if (k) out.push(-k * GRID); }
    return out;
  };
  if (f.flat) {
    for (const dz of steps(D, f.d)) for (const dx of steps(W, f.w)) { const at = { x: dx, z: dz, rot: 0 }; if (ok(at)) return at; }
  }
  const walls: { rot: number; at: (t: number) => Placement; along: number[] }[] = [
    { rot: 0, at: t => ({ x: t, z: round(-D + f.d / 2), rot: 0 }), along: steps(W, f.w) },
    { rot: 1, at: t => ({ x: round(-W + f.d / 2), z: t, rot: 1 }), along: steps(D, f.w) },
    { rot: 3, at: t => ({ x: round(W - f.d / 2), z: t, rot: 3 }), along: steps(D, f.w) },
    { rot: 2, at: t => ({ x: t, z: round(D - f.d / 2), rot: 2 }), along: steps(W, f.w) },
  ];
  for (const wall of walls) for (const t of wall.along) { const at = wall.at(t); if (ok(at)) return at; }
  for (const dz of steps(D, f.d)) for (const dx of steps(W, f.w)) { const at = { x: dx, z: dz, rot: 0 }; if (ok(at)) return at; }
  return null;
}

/** Moves a piece by whole grid steps (placement mode arrows). */
export const nudge = (at: Placement, dx: number, dz: number): Placement => ({ x: round(at.x + dx * GRID), z: round(at.z + dz * GRID), rot: at.rot });
/** A quarter turn more (placement mode « Tourner »). */
export const turn = (at: Placement): Placement => ({ ...at, rot: (at.rot + 1) % 4 });
/** Snaps a point (a tap on the floor) to the grid. */
export const snap = (x: number, z: number, rot: number): Placement => ({ x: round(Math.round(x / GRID) * GRID), z: round(Math.round(z / GRID) * GRID), rot });
