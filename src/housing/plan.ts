/**
 * LD2.0-C « Walkable Homes » (docs/ld2/LD2_C.md): the contract between the home's shell (its rooms, walls, doors, windows and built-in fittings,
 * src/housing/apartment.ts) and the furnishing (the placement rules and the editor, src/economy/placement.ts and src/economy/homeEditor.ts).
 *
 * A floor plan is data in the home's own metres: its origin at the centre of the home's box, +x east, +z south (the street door's side, as every
 * home interior: src/economy/homeInterior.ts), y up from the floor. A room's `box` runs along its walls' centre lines; where a person can stand or a
 * piece of furniture can go is that box less half a wall (`inner`). The rooms tile the home's box with no gap and no overlap.
 *
 * Nothing here is saved: a placement stays `{ x, z, rot }` (src/core/types.ts Placement) and its room is found from where it stands (`roomAt`), so an
 * older client, a rollback or a visiting guest reads the same save (docs/SAVES.md).
 */
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export type RoomKind = 'entree' | 'sejour' | 'cuisine' | 'chambre' | 'sdb' | 'degagement';
export interface Room {
  id: string;
  kind: RoomKind;
  /** As the player reads it (the editor's room picker, the HUD). */
  name: string;
  box: Rect;
  floor: 'tiles' | 'wood' | 'marble';
}
/**
 * A way through a wall. `front`: the street door (the home's way out: « Sortir »). `door`: an interior door with a leaf that swings into room `swing`,
 * hinged at the `hinge` end of its span (the lower x or z: 'start'; the higher: 'end'). `arch`: an opening with no leaf.
 * It sits on the wall line shared by rooms `a` and `b` ('out' for the street door): `axis` is the way that wall runs ('x': a wall along x, at z = `z`;
 * 'z': a wall along z, at x = `x`), and (`x`, `z`) is the opening's centre.
 */
export interface Opening { id: string; kind: 'front' | 'door' | 'arch'; a: string; b: string; axis: 'x' | 'z'; x: number; z: number; width: number; height: number; hinge?: 'start' | 'end'; swing?: string }
export type Side = 'n' | 's' | 'e' | 'w';
/** A window in a room's outside wall: centred at `at` along that wall (x for 'n'/'s', z for 'e'/'w'), from `sill` to `sill + height` above the floor. */
export interface Window { room: string; side: Side; at: number; width: number; sill: number; height: number }
/** A built-in fitting (the shell builds it; furniture never goes on it or in front of it): its footprint (against the walls' inner faces), its height, the
 *  side a person uses it from. */
export interface Fixture { id: string; room: string; kind: 'counter' | 'fridge' | 'stove' | 'sink' | 'shower' | 'wc' | 'basin'; box: Rect; h: number; front: Side }
export interface FloorPlan {
  id: string;
  /** The home's box: x from −w/2 to w/2, z from −d/2 to d/2. */
  w: number; d: number;
  /** Walls' height; inside and outside walls' thickness. */
  wallH: number; inWall: number; outWall: number;
  rooms: Room[];
  openings: Opening[];
  windows: Window[];
  fixtures: Fixture[];
  /** Inside the street door, facing in. */
  spawn: { x: number; z: number; yaw: number };
}

/**
 * The F2 of the Résidence Jàmm (catalogue `appart_jamm`): 9 m by 7 m, 63 m². The street door opens into the entrance hall; the hall opens into the
 * séjour (living and dining); the kitchen's door is off the séjour; a short hall (the dégagement) off the séjour leads to the bedroom and the bathroom.
 *
 *      x −4.5          −1.0           1.8           4.5
 *  z −3.5 ┌──────────────┬─────────────┬─────────────┐
 *         │   chambre    │     sdb     │   cuisine   │
 *    −1.3 │              ├──door───────┤             │
 *         │            door dégagement │             │
 *     0.0 ├──────────────┴───arch──────┤             │
 *         │                            door          │
 *     1.4 │           séjour           ├─────────────┤
 *         │                           arch   entrée  │
 *     3.5 └────────────────────────────┴────front────┘
 */
export const F2_JAMM: FloorPlan = {
  id: 'f2_jamm', w: 9, d: 7, wallH: 2.8, inWall: 0.14, outWall: 0.22,
  rooms: [
    { id: 'entree', kind: 'entree', name: 'Entrée', box: { x0: 1.8, x1: 4.5, z0: 1.4, z1: 3.5 }, floor: 'tiles' },
    { id: 'sejour', kind: 'sejour', name: 'Séjour', box: { x0: -4.5, x1: 1.8, z0: 0, z1: 3.5 }, floor: 'tiles' },
    { id: 'cuisine', kind: 'cuisine', name: 'Cuisine', box: { x0: 1.8, x1: 4.5, z0: -3.5, z1: 1.4 }, floor: 'tiles' },
    { id: 'degagement', kind: 'degagement', name: 'Dégagement', box: { x0: -1.0, x1: 1.8, z0: -1.3, z1: 0 }, floor: 'tiles' },
    { id: 'chambre', kind: 'chambre', name: 'Chambre', box: { x0: -4.5, x1: -1.0, z0: -3.5, z1: 0 }, floor: 'wood' },
    { id: 'sdb', kind: 'sdb', name: 'Salle de bain', box: { x0: -1.0, x1: 1.8, z0: -3.5, z1: -1.3 }, floor: 'tiles' },
  ],
  openings: [
    { id: 'front', kind: 'front', a: 'entree', b: 'out', axis: 'x', x: 3.15, z: 3.5, width: 1.0, height: 2.15 },
    { id: 'entree-sejour', kind: 'arch', a: 'entree', b: 'sejour', axis: 'z', x: 1.8, z: 2.45, width: 1.1, height: 2.2 },
    { id: 'sejour-cuisine', kind: 'door', a: 'sejour', b: 'cuisine', axis: 'z', x: 1.8, z: 0.7, width: 0.9, height: 2.1, hinge: 'end', swing: 'cuisine' },
    { id: 'sejour-degagement', kind: 'arch', a: 'sejour', b: 'degagement', axis: 'x', x: 0.5, z: 0, width: 1.1, height: 2.2 },
    { id: 'degagement-chambre', kind: 'door', a: 'degagement', b: 'chambre', axis: 'z', x: -1.0, z: -0.65, width: 0.9, height: 2.1, hinge: 'end', swing: 'chambre' },
    { id: 'degagement-sdb', kind: 'door', a: 'degagement', b: 'sdb', axis: 'x', x: 1.1, z: -1.3, width: 0.8, height: 2.1, hinge: 'end', swing: 'sdb' },
  ],
  windows: [
    { room: 'sejour', side: 's', at: -3.0, width: 1.4, sill: 0.9, height: 1.2 },
    { room: 'sejour', side: 's', at: -0.5, width: 1.4, sill: 0.9, height: 1.2 },
    { room: 'chambre', side: 'n', at: -2.75, width: 1.4, sill: 0.9, height: 1.2 },
    { room: 'chambre', side: 'w', at: -1.75, width: 1.2, sill: 0.9, height: 1.2 },
    { room: 'cuisine', side: 'e', at: -1.2, width: 1.2, sill: 1.1, height: 1.0 },
    { room: 'sdb', side: 'n', at: 0.2, width: 0.6, sill: 1.5, height: 0.5 },
  ],
  fixtures: [
    { id: 'fridge', room: 'cuisine', kind: 'fridge', box: { x0: 3.75, x1: 4.39, z0: -3.39, z1: -2.75 }, h: 1.8, front: 'w' },
    { id: 'counter', room: 'cuisine', kind: 'counter', box: { x0: 3.79, x1: 4.39, z0: -2.75, z1: 0.9 }, h: 0.9, front: 'w' },
    { id: 'sink', room: 'cuisine', kind: 'sink', box: { x0: 3.79, x1: 4.39, z0: -1.55, z1: -0.85 }, h: 0.9, front: 'w' },
    { id: 'stove', room: 'cuisine', kind: 'stove', box: { x0: 3.79, x1: 4.39, z0: -0.1, z1: 0.5 }, h: 0.9, front: 'w' },
    { id: 'shower', room: 'sdb', kind: 'shower', box: { x0: 0.85, x1: 1.73, z0: -3.39, z1: -2.55 }, h: 2.0, front: 'w' },
    { id: 'wc', room: 'sdb', kind: 'wc', box: { x0: -0.93, x1: -0.38, z0: -3.39, z1: -2.74 }, h: 0.8, front: 's' },
    { id: 'basin', room: 'sdb', kind: 'basin', box: { x0: -0.1, x1: 0.5, z0: -3.39, z1: -2.94 }, h: 0.85, front: 's' },
  ],
  spawn: { x: 3.15, z: 2.8, yaw: Math.PI },
};

/** The homes built from a floor plan (by catalogue id). The others keep their one open room (src/economy/homeInterior.ts). */
export const PLANS: Readonly<Record<string, FloorPlan>> = { appart_jamm: F2_JAMM };
export const planFor = (homeId: string): FloorPlan | null => PLANS[homeId] ?? null;

// ------------------------------------------------------------------------------------------------ geometry
const EPS = 1e-6;
export const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
export const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
export const contains = (outer: Rect, inner: Rect) => inner.x0 >= outer.x0 - EPS && inner.x1 <= outer.x1 + EPS && inner.z0 >= outer.z0 - EPS && inner.z1 <= outer.z1 + EPS;
const inside = (r: Rect, x: number, z: number) => x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS;
const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const onOuter = (p: FloorPlan, axis: 'x' | 'z', c: number) => axis === 'x' ? Math.abs(Math.abs(c) - p.d / 2) < EPS : Math.abs(Math.abs(c) - p.w / 2) < EPS;
const half = (p: FloorPlan, axis: 'x' | 'z', c: number) => (onOuter(p, axis, c) ? p.outWall : p.inWall) / 2;

/** Where a person can stand and furniture can go in a room: its box less half of each wall around it. */
export function inner(p: FloorPlan, room: Room): Rect {
  const b = room.box;
  return { x0: b.x0 + half(p, 'z', b.x0), x1: b.x1 - half(p, 'z', b.x1), z0: b.z0 + half(p, 'x', b.z0), z1: b.z1 - half(p, 'x', b.z1) };
}
/** The room a point is in (inside its walls), or null (in a wall, a doorway, or outside the home). */
export function roomAt(p: FloorPlan, x: number, z: number): Room | null {
  for (const r of p.rooms) if (inside(inner(p, r), x, z)) return r;
  return null;
}
/** The room a whole footprint fits in (inside its walls), or null. */
export function fitsRoom(p: FloorPlan, f: Rect): Room | null {
  for (const r of p.rooms) if (contains(inner(p, r), f)) return r;
  return null;
}

/** A piece of wall: its footprint (centred on the wall line, its thickness across), its height, outside or inside. */
export interface WallPiece extends Rect { outer: boolean; axis: 'x' | 'z'; at: number }
/**
 * The walls as pieces, each once: every room's sides merged along each wall line, less the openings in it. A wall along x at z = c runs from x0 to x1;
 * one along z at x = c from z0 to z1. The pieces overlap at the corners (by half a wall), so the walls close.
 */
export function wallPieces(p: FloorPlan): WallPiece[] {
  const lines = new Map<string, { axis: 'x' | 'z'; at: number; spans: [number, number][] }>();
  const add = (axis: 'x' | 'z', at: number, a: number, b: number) => {
    const k = `${axis}:${at.toFixed(3)}`; const l = lines.get(k) ?? { axis, at, spans: [] }; l.spans.push([a, b]); lines.set(k, l);
  };
  for (const { box: b } of p.rooms) { add('x', b.z0, b.x0, b.x1); add('x', b.z1, b.x0, b.x1); add('z', b.x0, b.z0, b.z1); add('z', b.x1, b.z0, b.z1); }
  const out: WallPiece[] = [];
  for (const l of lines.values()) {
    // the union of the spans along the line
    const s = l.spans.sort((a, b) => a[0] - b[0]), merged: [number, number][] = [];
    for (const [a, b] of s) { const m = merged[merged.length - 1]; if (m && a <= m[1] + EPS) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
    // less the openings on the line
    const holes = p.openings.filter(o => o.axis === l.axis && Math.abs((l.axis === 'x' ? o.z : o.x) - l.at) < EPS)
      .map(o => { const c = l.axis === 'x' ? o.x : o.z; return [c - o.width / 2, c + o.width / 2] as [number, number]; });
    const t = half(p, l.axis, l.at), outer = onOuter(p, l.axis, l.at);
    for (const [a0, b0] of merged) {
      let cuts: [number, number][] = [[a0 - t, b0 + t]];
      for (const [h0, h1] of holes) cuts = cuts.flatMap(([a, b]) => h1 <= a || h0 >= b ? [[a, b]] : [[a, h0], [h1, b]].filter(([u, v]) => v - u > EPS) as [number, number][]);
      for (const [a, b] of cuts) out.push(l.axis === 'x' ? { x0: a, x1: b, z0: l.at - t, z1: l.at + t, outer, axis: 'x', at: l.at } : { x0: l.at - t, x1: l.at + t, z0: a, z1: b, outer, axis: 'z', at: l.at });
    }
  }
  return out;
}

/** An opening's span on its wall, across the wall's thickness (the passage a person walks through). */
export function passage(p: FloorPlan, o: Opening): Rect {
  const t = half(p, o.axis, o.axis === 'x' ? o.z : o.x);
  return o.axis === 'x' ? { x0: o.x - o.width / 2, x1: o.x + o.width / 2, z0: o.z - t, z1: o.z + t } : { x0: o.x - t, x1: o.x + t, z0: o.z - o.width / 2, z1: o.z + o.width / 2 };
}
/** Which way room `id` lies from the wall an opening is on (+1: the higher z or x; −1: the lower). */
function sideOf(p: FloorPlan, o: Opening, id: string): 1 | -1 {
  const r = p.rooms.find(q => q.id === id); if (!r) return 1;
  const c = o.axis === 'x' ? (r.box.z0 + r.box.z1) / 2 - o.z : (r.box.x0 + r.box.x1) / 2 - o.x;
  return c >= 0 ? 1 : -1;
}

/** A place kept clear of furniture, and why (the editor says it). */
export interface Clear extends Rect { why: 'door' | 'passage' | 'fitting' | 'entry' }
/**
 * Kept clear of furniture: each door leaf's swing (a square the door's width on its swing side) and a step in front of it on the other side; each arch
 * and the street door with a step on both sides; the use side of each built-in fitting; the entry, inside the street door. Rugs may lie in a passage
 * (src/economy/placement.ts decides that), never in a swing.
 */
export function clearZones(p: FloorPlan, step = 0.8, use = 0.6): Clear[] {
  const out: Clear[] = [];
  for (const o of p.openings) {
    const P = passage(p, o), w = o.width / 2;
    const band = (dir: 1 | -1, depth: number): Rect => o.axis === 'x'
      ? { x0: o.x - w, x1: o.x + w, z0: dir > 0 ? P.z1 : P.z0 - depth, z1: dir > 0 ? P.z1 + depth : P.z0 }
      : { x0: dir > 0 ? P.x1 : P.x0 - depth, x1: dir > 0 ? P.x1 + depth : P.x0, z0: o.z - w, z1: o.z + w };
    if (o.kind === 'door' && o.swing) {
      const s = sideOf(p, o, o.swing);
      out.push({ ...band(s, Math.max(step, o.width)), why: 'door' }, { ...band(s === 1 ? -1 : 1, step), why: 'passage' });
    } else if (o.kind === 'front') {
      const s = sideOf(p, o, o.a);
      out.push({ ...band(s, Math.max(step, o.width) + 0.3), why: 'entry' });
    } else {
      out.push({ ...band(1, step), why: 'passage' }, { ...band(-1, step), why: 'passage' });
    }
  }
  for (const f of p.fixtures) {
    if (f.kind === 'sink' || f.kind === 'stove') continue;   // on the counter: the counter's own front covers them
    const b = f.box, d = f.front === 'w' ? { x0: b.x0 - use, x1: b.x0, z0: b.z0, z1: b.z1 } : f.front === 'e' ? { x0: b.x1, x1: b.x1 + use, z0: b.z0, z1: b.z1 }
      : f.front === 'n' ? { x0: b.x0, x1: b.x1, z0: b.z0 - use, z1: b.z0 } : { x0: b.x0, x1: b.x1, z0: b.z1, z1: b.z1 + use };
    out.push({ ...d, why: 'fitting' });
  }
  return out;
}

/** Why a footprint can't go there, or null if it can: outside every room, through a wall, on a fitting, or where the plan keeps clear. */
export function whyNotPlan(p: FloorPlan, f: Rect, o: { rug?: boolean } = {}): 'outside' | 'wall' | 'fitting' | Clear['why'] | null {
  if (!fitsRoom(p, f)) return wallPieces(p).some(w => overlaps(w, f)) ? 'wall' : 'outside';
  if (p.fixtures.some(x => overlaps(x.box, f))) return 'fitting';
  for (const c of clearZones(p)) if (overlaps(c, f) && !(o.rug && c.why === 'passage')) return c.why;
  return null;
}

/**
 * Can a person still walk from the street door to every room, and through every opening? On a grid (`cell` m) over the home, a cell is free when it
 * lies in a room or an opening's passage and a body (`radius`) there touches no wall, fitting or obstacle (the furniture's footprints). Returns the
 * rooms and openings that can't be reached from the spawn.
 */
export function reachable(p: FloorPlan, obstacles: readonly Rect[], radius = 0.28, cell = 0.1): { ok: boolean; rooms: string[]; openings: string[] } {
  const nx = Math.ceil(p.w / cell), nz = Math.ceil(p.d / cell), X = (i: number) => -p.w / 2 + (i + 0.5) * cell, Z = (j: number) => -p.d / 2 + (j + 0.5) * cell;
  const walls = wallPieces(p), blocks: Rect[] = [...walls, ...p.fixtures.map(f => f.box), ...obstacles].map(r => grow(r, radius));
  const passages = p.openings.filter(o => o.kind !== 'front').map(o => passage(p, o));
  const free = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = X(i), z = Z(j);
    if (!(roomAt(p, x, z) || passages.some(q => inside(q, x, z)))) continue;
    if (blocks.some(b => x > b.x0 + EPS && x < b.x1 - EPS && z > b.z0 + EPS && z < b.z1 - EPS)) continue;
    free[i * nz + j] = 1;
  }
  const seen = new Uint8Array(nx * nz), q: number[] = [];
  const at = (x: number, z: number) => [Math.max(0, Math.min(nx - 1, Math.floor((x + p.w / 2) / cell))), Math.max(0, Math.min(nz - 1, Math.floor((z + p.d / 2) / cell)))];
  const [si, sj] = at(p.spawn.x, p.spawn.z);
  if (free[si * nz + sj]) { seen[si * nz + sj] = 1; q.push(si * nz + sj); }
  while (q.length) {
    const k = q.pop()!, i = Math.floor(k / nz), j = k % nz;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = a * nz + b; if (free[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  const reached = (r: Rect) => { for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (seen[i * nz + j] && inside(r, X(i), Z(j))) return true; return false; };
  const rooms = p.rooms.filter(r => !reached(inner(p, r))).map(r => r.id);
  const openings = p.openings.filter(o => o.kind !== 'front' && !reached(passage(p, o))).map(o => o.id);
  return { ok: !rooms.length && !openings.length, rooms, openings };
}
