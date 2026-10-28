import { VILLA_PLAN } from './villaPlan';
import { MAISON_PLAN } from './maisonPlan';
import { RESIDENCE_PLAN } from './residencePlan';

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
 *
 * LD2.0-D « Owner flagship villa » (docs/ld2/LD2_D.md), version 2 of the contract: a plan may have several **levels** (`levels`: id, name, height
 * `y` of its floor above the ground floor's, and `dx`). Plan space is *unfolded*: a level's rooms sit side by side along x, at their house x plus
 * the level's `dx`, so every room of every level has its own place in one flat plan and a placement `{ x, z, rot }` still says where a piece is
 * (and on which level) with no new save field, inside ±30 m (src/online/visitRules.ts). A point (x, z) of a level stands in the home at
 * (x − dx, y, z) (`toWorld`, `toPlan`). Levels are joined by straight flights of **stairs** (`stairs`): a flight's steps stand on the lower level, its
 * well (the opening in the floor above, with a railing round it) on the upper one; walking, a flight is a ramp (`groundAt`). Rooms may be open to the
 * sky (`outdoor`: a garden, a terrace, a balcony): where no room is beside one, its edge is a garden wall, a parapet or a glass railing (`edge`);
 * between two open rooms of a level there is nothing (a seam, walked across). A plan without `levels` (the F2) is one level and reads exactly as
 * before.
 */
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export type RoomKind = 'entree' | 'sejour' | 'cuisine' | 'chambre' | 'sdb' | 'degagement'
  // LD2.0-D
  | 'manger' | 'bureau' | 'dressing' | 'palier' | 'terrasse' | 'balcon';
/** What stands at the edge of an open room where no room is beside it. */
export type EdgeKind = 'garden' | 'parapet' | 'railing';
export interface Room {
  id: string;
  kind: RoomKind;
  /** As the player reads it (the editor's room picker, the HUD). */
  name: string;
  /** LD2.0-D: a shorter name for the editor's room chip (a phone's width), when the name is long. */
  short?: string;
  box: Rect;
  /** 'stone': paving outdoors (a terrace); 'deck' (LD2.0-D look pass): teak boards outdoors (a pool deck, a roof terrace). */
  floor: 'tiles' | 'wood' | 'marble' | 'stone' | 'deck';
  /** LD2.0-D: the level it is on (a plan with `levels`); absent: the plan's one level. */
  level?: string;
  /** LD2.0-D: open to the sky (a garden, a terrace, a balcony). */
  outdoor?: boolean;
  /** LD2.0-D: an open room's edge where no room is beside it (default: a garden wall on the ground floor, a parapet above, a railing on a balcony). */
  edge?: EdgeKind;
  /** LD2.0-D: the colour of the outside faces of its walls (a stone-clad entrance, a wood-clad stair head), inside and in the street façade alike. */
  facade?: number;
  /** LD2.0-D look pass: the outside faces of its walls clad in travertine (inside the lot and in the street façade alike); default the render. */
  clad?: 'stone';
  /** LD2.0-D look pass: its one accent wall inside (the side of the room it is on): wood slat panelling or a stone face. */
  accent?: { side: Side; kind: 'wood' | 'stone' };
}
/**
 * A way through a wall. `front`: the street door (the home's way out: « Sortir »). `door`: an interior door with a leaf that swings into room `swing`,
 * hinged at the `hinge` end of its span (the lower x or z: 'start'; the higher: 'end'). `arch`: an opening with no leaf. `glass` (LD2.0-D): a wide
 * glazed opening whose sliding panels stand open (to a garden, a terrace or a balcony).
 * It sits on the wall line shared by rooms `a` and `b` ('out' for the street door): `axis` is the way that wall runs ('x': a wall along x, at z = `z`;
 * 'z': a wall along z, at x = `x`), and (`x`, `z`) is the opening's centre.
 */
export interface Opening { id: string; kind: 'front' | 'door' | 'arch' | 'glass'; a: string; b: string; axis: 'x' | 'z'; x: number; z: number; width: number; height: number; hinge?: 'start' | 'end'; swing?: string }
export type Side = 'n' | 's' | 'e' | 'w';
/** A window in a room's outside wall: centred at `at` along that wall (x for 'n'/'s', z for 'e'/'w'), from `sill` to `sill + height` above the floor. */
export interface Window { room: string; side: Side; at: number; width: number; sill: number; height: number }
/**
 * A built-in fitting (the shell builds it; furniture never goes on it or in front of it): its footprint (against the walls' inner faces), its height, the
 * side a person uses it from. LD2.0-D: a bathtub (`bath`), a swimming pool's basin (`pool`, `depth` m deep, its edge walked round), the helicopter
 * parked on the roof (`heli`: its body, walked round, src/world/helicopter.ts); `island`: a counter standing free in the room (no cupboards on a wall).
 */
export interface Fixture { id: string; room: string; kind: 'counter' | 'fridge' | 'stove' | 'sink' | 'shower' | 'wc' | 'basin' | 'bath' | 'pool' | 'heli' | 'post'; box: Rect; h: number; front: Side; depth?: number; island?: boolean }
/**
 * LD2.0-D look pass: a pergola over an open room: its roof of wooden slats over `box`, `h` m above the floor, on the plan's `post` fixtures of that
 * room (each a fitting: walked round, never furnished over).
 */
export interface Pergola { id: string; room: string; box: Rect; h: number }
/** LD2.0-D: a level of a plan: its floor `y` m above the ground floor's, and where its rooms sit in plan space (house x + `dx`). */
export interface Level { id: string; name: string; y: number; dx: number }
/**
 * LD2.0-D: a straight flight of stairs from room `from` (its foot, on the lower level) to room `to` (its head, on the level above). `box`: the flight's
 * footprint in the lower level's plan space; it rises toward `up` ('n': toward −z, 's': +z, 'w': −x, 'e': +x) in `steps` equal risers, from the
 * lower level's floor to the upper one's. `well`: the opening in the upper floor, in the upper level's plan space (default: over the flight).
 */
export interface Stair { id: string; from: string; to: string; box: Rect; up: Side; steps: number; well?: Rect }
/** LD2.0-D: a mark painted on a floor and kept clear of furniture (a helipad: an H in a circle). */
export interface Mark { id: string; kind: 'helipad'; room: string; x: number; z: number; r: number; /** The parked aircraft's heading (its nose: +z at 0). */ yaw?: number }
/**
 * The identity of a plan's inside (docs/kits/HOMES.md): the colours a hub gives the same plan. Anything left out keeps the finish of the home's level
 * (src/economy/homeInterior.ts) or the premium look of a plan on levels (src/housing/apartment.ts). `kinds` overrides one kind of room: its walls above
 * the dado (`upper`), the dado or the whole wall when it has none (`lower`), the floor's tint (`floor`). A home bought « peinture neuve » is repainted over it.
 */
export interface PlanLook {
  /** The walls of the living rooms, halls and corridors above the dado, and the dado. */
  wall?: number; dado?: number;
  kinds?: Partial<Record<RoomKind, { upper?: number; lower?: number; floor?: number }>>;
  /** The street door's and the interior doors' leaves, and the trims (standard finish; the premium finish keeps its walnut and bronze). */
  door?: number; trim?: number;
}
export interface FloorPlan {
  id: string;
  /** The identity (colours) this plan wears: see `PlanLook`. */
  look?: PlanLook;
  /** The home's box: x from −w/2 to w/2, z from −d/2 to d/2 (or `box`). */
  w: number; d: number;
  /** Walls' height; inside and outside walls' thickness. */
  wallH: number; inWall: number; outWall: number;
  rooms: Room[];
  openings: Opening[];
  windows: Window[];
  fixtures: Fixture[];
  /** Inside the street door, facing in. */
  spawn: { x: number; z: number; yaw: number };
  // ---------------------------------------------------------------- LD2.0-D (all optional: a plan without them is one level, as the F2)
  levels?: Level[];
  stairs?: Stair[];
  marks?: Mark[];
  /** LD2.0-D look pass: pergolas over open rooms (their posts are fixtures). */
  pergolas?: Pergola[];
  /** The home's extent in its own frame (house metres, every level stacked): default ±w/2, ±d/2. */
  box?: Rect;
  /** Plan space's extent (unfolded: every level side by side): default `box`. */
  bounds?: Rect;
  /** Heights of an open room's edges (m): default a garden wall 2.4, a parapet 1.1, a railing 1.1. */
  edgeH?: Partial<Record<EdgeKind, number>>;
  /** The opening in the lot's street wall that the shell leaves (x range, plan metres): default the villa's car gate. */
  gate?: { x0: number; x1: number };
  /** The depth (m) of the front yard between the house's street wall and the lot's wall: default the lot is as deep as it is wide (the villa's). */
  yard?: number;
  /** A floor of a tower, not a house on a lot: the shell draws no lawn, path, wall or palm round it. */
  noLot?: boolean;
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

/** The homes built from a floor plan (by catalogue id). The others keep their one open room (src/economy/homeInterior.ts). LD2.0-D: the villa. */
export const PLANS: Readonly<Record<string, FloorPlan>> = { appart_jamm: F2_JAMM, maison_cite: MAISON_PLAN, villa_almadies: VILLA_PLAN, residence_ngor: RESIDENCE_PLAN };
export const planFor = (homeId: string): FloorPlan | null => PLANS[homeId] ?? null;
/**
 * Adds (or replaces) the plan of a home built from a template (src/housing/kit/): a hub that lists a home made of a template registers its plan under the
 * home's catalogue id before the catalogue is read (the shell, the editor and the placement rules all go by `planFor`).
 */
export function registerPlan(homeId: string, plan: FloorPlan): void { (PLANS as Record<string, FloorPlan>)[homeId] = plan; }

// ------------------------------------------------------------------------------------------------ geometry
const EPS = 1e-6;
export const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
export const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
export const contains = (outer: Rect, inner: Rect) => inner.x0 >= outer.x0 - EPS && inner.x1 <= outer.x1 + EPS && inner.z0 >= outer.z0 - EPS && inner.z1 <= outer.z1 + EPS;
const inside = (r: Rect, x: number, z: number) => x >= r.x0 - EPS && x <= r.x1 + EPS && z >= r.z0 - EPS && z <= r.z1 + EPS;
const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const shiftX = (r: Rect, dx: number): Rect => ({ x0: r.x0 + dx, x1: r.x1 + dx, z0: r.z0, z1: r.z1 });
const onOuter = (p: FloorPlan, axis: 'x' | 'z', c: number) => axis === 'x' ? Math.abs(Math.abs(c) - p.d / 2) < EPS : Math.abs(Math.abs(c) - p.w / 2) < EPS;
const half = (p: FloorPlan, axis: 'x' | 'z', c: number) => (onOuter(p, axis, c) ? p.outWall : p.inWall) / 2;

/** The home's extent in its own frame (house metres). */
export const homeBox = (p: FloorPlan): Rect => p.box ?? { x0: -p.w / 2, x1: p.w / 2, z0: -p.d / 2, z1: p.d / 2 };
/** Plan space's extent (every level unfolded side by side). */
export const planBounds = (p: FloorPlan): Rect => p.bounds ?? homeBox(p);

// ------------------------------------------------------------------------------------------------ LD2.0-D: levels
const ONE: Level = { id: '', name: '', y: 0, dx: 0 };
/** A plan's levels, lowest first (a plan without `levels`: one, at y 0). */
export const levelsOf = (p: FloorPlan): readonly Level[] => p.levels ?? [ONE];
/** The level a room is on. */
export function levelOfRoom(p: FloorPlan, r: Room): Level {
  if (!p.levels) return ONE;
  return p.levels.find(l => l.id === r.level) ?? p.levels[0];
}
/** The index of a level in `levelsOf`. */
export const levelIndex = (p: FloorPlan, l: Level) => Math.max(0, levelsOf(p).indexOf(l));
/** How high above a level's floor a person may step up and still be on it (m): a flight is walked as a ramp, never a jump. */
export const STEP_UP = 0.5;
/**
 * The level a height stands on (m above the ground floor's floor: a person's feet, a point of the editor): the highest level whose floor is at most
 * 0.6 m above it, so a person near the top of a flight already counts on the level they are reaching.
 */
export function levelOf(p: FloorPlan, y: number): Level {
  const ls = levelsOf(p);
  let best = ls[0];
  for (const l of ls) if (l.y <= y + 0.6 && l.y >= best.y) best = l;
  return best;
}
/** The level a point of plan space is on: the level whose rooms span its x (the nearest one between them). */
export function levelAtX(p: FloorPlan, x: number): Level {
  if (!p.levels) return ONE;
  const c = cached(p);
  let best = p.levels[0], bd = Infinity;
  for (const [l, e] of c.extent) { const d = Math.max(e.x0 - x, 0, x - e.x1); if (d < bd) { bd = d; best = l; } }
  return best;
}
/** A point of plan space in the home (house metres, the level's floor height `y` above the ground floor's). */
export function toWorld(p: FloorPlan, x: number, z: number): { x: number; y: number; z: number; level: Level } {
  const l = levelAtX(p, x);
  return { x: x - l.dx, y: l.y, z, level: l };
}
/** The point of plan space under a point of the home at height `y` (the level that height stands on). */
export function toPlan(p: FloorPlan, hx: number, hz: number, y = 0): { x: number; z: number; level: Level } {
  const l = levelOf(p, y);
  return { x: hx + l.dx, z: hz, level: l };
}
/** An open room is not under a ceiling; a room under the level above is covered (the shell hides it when the player is upstairs). */
export function isCovered(p: FloorPlan, r: Room): boolean {
  if (!p.levels || r.outdoor || r.kind === 'palier') return false;
  const l = levelOfRoom(p, r);
  return p.levels.some(q => q.y > l.y);
}

// ------------------------------------------------------------------------------------------------ the walls
/** What a wall line is at a point: between two rooms (`a` on its lower side, `b` on its higher), or at the home's edge. */
function sideRooms(p: FloorPlan, axis: 'x' | 'z', at: number, u: number): [Room | null, Room | null] {
  const d = 1e-3;
  const pick = (s: number) => {
    const x = axis === 'x' ? u : at + s * d, z = axis === 'x' ? at + s * d : u;
    for (const r of p.rooms) if (x > r.box.x0 && x < r.box.x1 && z > r.box.z0 && z < r.box.z1) return r;
    return null;
  };
  return [pick(-1), pick(1)];
}
type Seg = { kind: 'wall' | EdgeKind | 'open' | 'none'; t: number; outer: boolean };
/** A plan with levels: what stands between two rooms (or a room and nothing), and its half thickness. */
function classify(p: FloorPlan, a: Room | null, b: Room | null): Seg {
  if (!a && !b) return { kind: 'none', t: 0, outer: false };
  const inA = !!a && !a.outdoor, inB = !!b && !b.outdoor;
  if (inA && inB) return { kind: 'wall', t: p.inWall / 2, outer: false };
  if (inA || inB) return { kind: 'wall', t: p.outWall / 2, outer: true };
  if (a && b) return { kind: 'open', t: 0, outer: false };
  const o = (a ?? b)!;
  return { kind: o.edge ?? (o.kind === 'balcon' ? 'railing' : levelOfRoom(p, o).y > 0 ? 'parapet' : 'garden'), t: p.outWall / 2, outer: true };
}
/** The pieces of a line between a and b, each of one kind (a plan with levels). */
function segments(p: FloorPlan, axis: 'x' | 'z', at: number, a: number, b: number): (Seg & { a: number; b: number })[] {
  const cuts = [a, b];
  for (const r of p.rooms) for (const e of axis === 'x' ? [r.box.x0, r.box.x1] : [r.box.z0, r.box.z1]) if (e > a + EPS && e < b - EPS) cuts.push(e);
  cuts.sort((u, v) => u - v);
  const out: (Seg & { a: number; b: number })[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const u0 = cuts[i], u1 = cuts[i + 1]; if (u1 - u0 < EPS) continue;
    const [ra, rb] = sideRooms(p, axis, at, (u0 + u1) / 2), s = classify(p, ra, rb), last = out[out.length - 1];
    if (last && last.kind === s.kind && Math.abs(last.t - s.t) < EPS && Math.abs(last.b - u0) < EPS) last.b = u1; else out.push({ ...s, a: u0, b: u1 });
  }
  return out;
}
/** The half thickness of the wall on a line at a point along it (0: open, between two open rooms). */
export function halfAt(p: FloorPlan, axis: 'x' | 'z', at: number, u: number): number {
  if (!p.levels) return half(p, axis, at);
  const [a, b] = sideRooms(p, axis, at, u);
  return classify(p, a, b).t;
}

interface Cache {
  inner: Map<Room, Rect>;
  walls?: WallPiece[];
  seams?: Rect[];
  stairs?: StairPart[];
  extent: Map<Level, Rect>;
  grids: Map<string, Grid>;
  ground?: Ground;
}
const caches = new WeakMap<FloorPlan, Cache>();
function cached(p: FloorPlan): Cache {
  let c = caches.get(p);
  if (!c) {
    const extent = new Map<Level, Rect>();
    if (p.levels) for (const l of p.levels) {
      const rs = p.rooms.filter(r => levelOfRoom(p, r) === l);
      if (rs.length) extent.set(l, { x0: Math.min(...rs.map(r => r.box.x0)), x1: Math.max(...rs.map(r => r.box.x1)), z0: Math.min(...rs.map(r => r.box.z0)), z1: Math.max(...rs.map(r => r.box.z1)) });
    }
    c = { inner: new Map(), extent, grids: new Map() };
    caches.set(p, c);
  }
  return c;
}

/** Where a person can stand and furniture can go in a room: its box less half of each wall around it (on an open side, nothing). */
export function inner(p: FloorPlan, room: Room): Rect {
  const b = room.box;
  if (!p.levels) return { x0: b.x0 + half(p, 'z', b.x0), x1: b.x1 - half(p, 'z', b.x1), z0: b.z0 + half(p, 'x', b.z0), z1: b.z1 - half(p, 'x', b.z1) };
  const c = cached(p), hit = c.inner.get(room); if (hit) return hit;
  // each side: the thickest wall along it (a side may border a wall and an open seam: the seam is then walked through)
  const side = (axis: 'x' | 'z', at: number, a: number, b2: number) => Math.max(0, ...segments(p, axis, at, a, b2).map(s => s.t));
  const r = { x0: b.x0 + side('z', b.x0, b.z0, b.z1), x1: b.x1 - side('z', b.x1, b.z0, b.z1), z0: b.z0 + side('x', b.z0, b.x0, b.x1), z1: b.z1 - side('x', b.z1, b.x0, b.x1) };
  c.inner.set(room, r);
  return r;
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

/**
 * A piece of wall: its footprint (centred on the wall line, its thickness across), its height, outside or inside. LD2.0-D: `kind` (a full-height
 * wall, or an open room's garden wall, parapet or railing), its height above its level's floor `h`, and its level.
 */
export interface WallPiece extends Rect { outer: boolean; axis: 'x' | 'z'; at: number; kind: 'wall' | EdgeKind; h: number; level: string }
/**
 * The walls as pieces, each once: every room's sides merged along each wall line, less the openings in it. A wall along x at z = c runs from x0 to x1;
 * one along z at x = c from z0 to z1. The pieces overlap at the corners (by half a wall), so the walls close. LD2.0-D: a line is cut where what stands
 * on it changes (a wall, a garden wall, a parapet, a railing, nothing between two open rooms).
 */
export function wallPieces(p: FloorPlan): WallPiece[] {
  const c = p.levels ? cached(p) : null;
  if (c?.walls) return c.walls;
  const lines = new Map<string, { axis: 'x' | 'z'; at: number; spans: [number, number][] }>();
  const add = (axis: 'x' | 'z', at: number, a: number, b: number) => {
    const k = `${axis}:${at.toFixed(3)}`; const l = lines.get(k) ?? { axis, at, spans: [] }; l.spans.push([a, b]); lines.set(k, l);
  };
  for (const { box: b } of p.rooms) { add('x', b.z0, b.x0, b.x1); add('x', b.z1, b.x0, b.x1); add('z', b.x0, b.z0, b.z1); add('z', b.x1, b.z0, b.z1); }
  const out: WallPiece[] = [];
  const H = edgeHeights(p);
  for (const l of lines.values()) {
    // the union of the spans along the line
    const s = l.spans.sort((a, b) => a[0] - b[0]), merged: [number, number][] = [];
    for (const [a, b] of s) { const m = merged[merged.length - 1]; if (m && a <= m[1] + EPS) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
    // less the openings on the line
    const holes = p.openings.filter(o => o.axis === l.axis && Math.abs((l.axis === 'x' ? o.z : o.x) - l.at) < EPS)
      .map(o => { const c = l.axis === 'x' ? o.x : o.z; return [c - o.width / 2, c + o.width / 2] as [number, number]; });
    const pieces: { a: number; b: number; t: number; outer: boolean; kind: WallPiece['kind'] }[] = [];
    if (!p.levels) { const t = half(p, l.axis, l.at), outer = onOuter(p, l.axis, l.at); for (const [a, b] of merged) pieces.push({ a, b, t, outer, kind: 'wall' }); }
    else for (const [a, b] of merged) for (const g of segments(p, l.axis, l.at, a, b)) if (g.kind !== 'open' && g.kind !== 'none') pieces.push({ a: g.a, b: g.b, t: g.t, outer: g.outer, kind: g.kind });
    for (const { a: a0, b: b0, t, outer, kind } of pieces) {
      let cuts: [number, number][] = [[a0 - t, b0 + t]];
      for (const [h0, h1] of holes) cuts = cuts.flatMap(([a, b]) => h1 <= a || h0 >= b ? [[a, b]] : [[a, h0], [h1, b]].filter(([u, v]) => v - u > EPS) as [number, number][]);
      const level = p.levels ? levelAtX(p, l.axis === 'x' ? (a0 + b0) / 2 : l.at).id : '';
      const h = kind === 'wall' ? p.wallH : H[kind];
      for (const [a, b] of cuts) out.push(l.axis === 'x' ? { x0: a, x1: b, z0: l.at - t, z1: l.at + t, outer, axis: 'x', at: l.at, kind, h, level } : { x0: l.at - t, x1: l.at + t, z0: a, z1: b, outer, axis: 'z', at: l.at, kind, h, level });
    }
  }
  if (c) c.walls = out;
  return out;
}
/** Heights of an open room's edges. */
export const edgeHeights = (p: FloorPlan): Record<EdgeKind, number> => ({ garden: 2.4, parapet: 1.1, railing: 1.1, ...p.edgeH });

/** LD2.0-D: where two open rooms of a level meet with nothing between them (a seam across the line, from one's inner edge to the other's). */
export function seams(p: FloorPlan): Rect[] {
  if (!p.levels) return [];
  const c = cached(p); if (c.seams) return c.seams;
  const out: Rect[] = [];
  for (const a of p.rooms) for (const b of p.rooms) {
    if (a === b || !a.outdoor || !b.outdoor) continue;
    const A = a.box, B = b.box, ia = inner(p, a), ib = inner(p, b);
    if (Math.abs(A.x1 - B.x0) < EPS) { const z0 = Math.max(ia.z0, ib.z0), z1 = Math.min(ia.z1, ib.z1); if (z1 > z0) out.push({ x0: ia.x1, x1: ib.x0, z0, z1 }); }
    if (Math.abs(A.z1 - B.z0) < EPS) { const x0 = Math.max(ia.x0, ib.x0), x1 = Math.min(ia.x1, ib.x1); if (x1 > x0) out.push({ x0, x1, z0: ia.z1, z1: ib.z0 }); }
  }
  c.seams = out;
  return out;
}

/** An opening's span on its wall, across the wall's thickness (the passage a person walks through). */
export function passage(p: FloorPlan, o: Opening): Rect {
  const t = halfAt(p, o.axis, o.axis === 'x' ? o.z : o.x, o.axis === 'x' ? o.x : o.z);
  return o.axis === 'x' ? { x0: o.x - o.width / 2, x1: o.x + o.width / 2, z0: o.z - t, z1: o.z + t } : { x0: o.x - t, x1: o.x + t, z0: o.z - o.width / 2, z1: o.z + o.width / 2 };
}
/** Which way room `id` lies from the wall an opening is on (+1: the higher z or x; −1: the lower). */
function sideOf(p: FloorPlan, o: Opening, id: string): 1 | -1 {
  const r = p.rooms.find(q => q.id === id); if (!r) return 1;
  const c = o.axis === 'x' ? (r.box.z0 + r.box.z1) / 2 - o.z : (r.box.x0 + r.box.x1) / 2 - o.x;
  return c >= 0 ? 1 : -1;
}

// ------------------------------------------------------------------------------------------------ LD2.0-D: stairs
/** A unit step along a side ('n': −z, 's': +z, 'w': −x, 'e': +x). */
const DIR: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
/**
 * A flight worked out: its levels, its footprint (lower level's plan space) and well (upper level's), how far along it a point has risen, the half
 * walked on each level (`low`: from the foot to the middle, lower plan space; `high`: from the middle to the head, upper plan space; `shift` = the
 * upper level's dx less the lower's), the balustrades along its open sides (lower plan space; none along a wall), the railings round the well (upper
 * plan space: not across the head, nor along a wall or another flight), and where it starts and arrives.
 */
export interface StairPart {
  s: Stair; lower: Level; upper: Level; box: Rect; well: Rect; shift: number;
  axis: 'x' | 'z'; dir: 1 | -1; foot: number; head: number; mid: number;
  low: Rect; high: Rect;
  balustrades: Rect[]; rails: Rect[];
  /** The landing in front of the foot (lower plan space) and past the head (upper plan space), kept clear of furniture. */
  footZone: Rect; headZone: Rect;
}
/** How far along a flight (0 at its foot, 1 at its head) a point is. */
export function stairT(st: StairPart, x: number, z: number): number {
  const u = st.axis === 'x' ? x : z;
  return Math.max(0, Math.min(1, (u - st.foot) / (st.head - st.foot)));
}
export function stairParts(p: FloorPlan): StairPart[] {
  if (!p.stairs?.length || !p.levels) return [];
  const c = cached(p); if (c.stairs) return c.stairs;
  const walls = wallPieces(p), R = 0.03, Z = 0.9;
  /** Is the segment (along `axis`, at `at`, from a to b) backed by a wall's face within 0.16 m? */
  const walled = (axis: 'x' | 'z', at: number, a: number, b: number) => {
    let cover = 0;
    for (const w of walls) {
      if (w.axis !== axis || w.kind !== 'wall') continue;
      const lo = axis === 'x' ? w.z0 : w.x0, hi = axis === 'x' ? w.z1 : w.x1, face = Math.min(Math.abs(at - lo), Math.abs(at - hi));
      if (at > lo - 0.16 && at < hi + 0.16 && face < 0.16) cover += Math.max(0, Math.min(b, axis === 'x' ? w.x1 : w.z1) - Math.max(a, axis === 'x' ? w.x0 : w.z0));
    }
    return cover >= b - a - 0.05;
  };
  const out: StairPart[] = [];
  for (const s of p.stairs) {
    const from = p.rooms.find(r => r.id === s.from)!, to = p.rooms.find(r => r.id === s.to)!;
    const lower = levelOfRoom(p, from), upper = levelOfRoom(p, to), shift = upper.dx - lower.dx, b = s.box;
    const [ux, uz] = DIR[s.up], axis = ux ? 'x' : 'z', dir = (ux || uz) as 1 | -1;
    const lo = axis === 'x' ? b.x0 : b.z0, hi = axis === 'x' ? b.x1 : b.z1;
    const foot = dir > 0 ? lo : hi, head = dir > 0 ? hi : lo, mid = (lo + hi) / 2;
    const well = s.well ?? shiftX(b, shift);
    const cut = (a: number, c2: number): Rect => axis === 'x' ? { x0: Math.min(a, c2), x1: Math.max(a, c2), z0: b.z0, z1: b.z1 } : { x0: b.x0, x1: b.x1, z0: Math.min(a, c2), z1: Math.max(a, c2) };
    const low = cut(foot, mid), high = shiftX(cut(mid, head), shift);
    // the long sides: a balustrade unless a wall stands there
    const balustrades: Rect[] = [];
    for (const side of axis === 'z' ? [b.x0, b.x1] : [b.z0, b.z1]) {
      if (axis === 'z' ? walled('z', side, b.z0, b.z1) : walled('x', side, b.x0, b.x1)) continue;
      balustrades.push(axis === 'z' ? { x0: side - R, x1: side + R, z0: b.z0, z1: b.z1 } : { x0: b.x0, x1: b.x1, z0: side - R, z1: side + R });
    }
    out.push({ s, lower, upper, box: b, well, shift, axis, dir, foot, head, mid, low, high, balustrades, rails: [],
      footZone: axis === 'z' ? { x0: b.x0, x1: b.x1, z0: dir > 0 ? foot - Z : foot, z1: dir > 0 ? foot : foot + Z } : { x0: dir > 0 ? foot - Z : foot, x1: dir > 0 ? foot : foot + Z, z0: b.z0, z1: b.z1 },
      headZone: shiftX(axis === 'z' ? { x0: b.x0, x1: b.x1, z0: dir > 0 ? head : head - Z, z1: dir > 0 ? head + Z : head } : { x0: dir > 0 ? head : head - Z, x1: dir > 0 ? head + Z : head, z0: b.z0, z1: b.z1 }, shift) });
  }
  // the well's railings: round its edges, not across the head (where the flight arrives), nor along a wall or a flight on that level
  for (const st of out) {
    const w = st.well, headSpan = shiftX(st.box, st.shift);
    const edges: { axis: 'x' | 'z'; at: number; a: number; b: number }[] = [
      { axis: 'x', at: w.z0, a: w.x0, b: w.x1 }, { axis: 'x', at: w.z1, a: w.x0, b: w.x1 }, { axis: 'z', at: w.x0, a: w.z0, b: w.z1 }, { axis: 'z', at: w.x1, a: w.z0, b: w.z1 },
    ];
    for (const e of edges) {
      let spans: [number, number][] = [[e.a, e.b]];
      const isHead = st.axis === e.axis ? false : Math.abs(e.at - (st.head + (st.axis === 'x' ? st.shift : 0))) < 0.02;
      if (isHead) { const [h0, h1] = st.axis === 'z' ? [headSpan.x0, headSpan.x1] : [headSpan.z0, headSpan.z1]; spans = spans.flatMap(([a, b]) => [[a, Math.min(b, h0)], [Math.max(a, h1), b]] as [number, number][]).filter(([a, b]) => b - a > 0.2); }
      for (const [a, b] of spans) {
        if (walled(e.axis, e.at, a, b)) continue;
        const alongFlight = out.some(o => o.lower === st.upper && (e.axis === 'z'
          ? (Math.abs(o.box.x0 - e.at) < 0.05 || Math.abs(o.box.x1 - e.at) < 0.05) && o.box.z0 <= a + 0.05 && o.box.z1 >= b - 0.05 && o.axis === 'z'
          : (Math.abs(o.box.z0 - e.at) < 0.05 || Math.abs(o.box.z1 - e.at) < 0.05) && o.box.x0 <= a + 0.05 && o.box.x1 >= b - 0.05 && o.axis === 'x'));
        if (alongFlight || b - a < 0.2) continue;
        st.rails.push(e.axis === 'x' ? { x0: a, x1: b, z0: e.at - R, z1: e.at + R } : { x0: e.at - R, x1: e.at + R, z0: a, z1: b });
      }
    }
  }
  c.stairs = out;
  return out;
}

// ------------------------------------------------------------------------------------------------ LD2.0-D: walking on levels
interface Ground {
  /** Per level: its rooms' boxes (house frame), its wells, its flights' footprints (house frame: the floor under a flight is the flight). */
  levels: { l: Level; rooms: Rect[]; holes: Rect[] }[];
  flights: { st: StairPart; box: Rect }[];
}
function ground(p: FloorPlan): Ground {
  const c = cached(p); if (c.ground) return c.ground;
  const parts = stairParts(p);
  const g: Ground = {
    levels: levelsOf(p).map(l => ({
      l, rooms: p.rooms.filter(r => levelOfRoom(p, r) === l).map(r => shiftX(r.box, -l.dx)),
      holes: [...parts.filter(st => st.upper === l).map(st => shiftX(st.well, -l.dx)), ...parts.filter(st => st.lower === l).map(st => shiftX(st.box, -l.dx))],
    })),
    flights: parts.map(st => ({ st, box: shiftX(st.box, -st.lower.dx) })),
  };
  c.ground = g;
  return g;
}
const within = (r: Rect, x: number, z: number, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
/**
 * The height (m above the ground floor's floor) of what a person standing at (hx, hz) of the home (house metres) walks on, given the height `y` their
 * feet are at now: the highest floor or flight that is at most a step above their feet. A flight is a ramp from its foot to its head; a level's floor
 * is not there over a well, nor under a flight. Nothing allocated: main.ts asks it every frame.
 */
export function groundAt(p: FloorPlan, hx: number, hz: number, y: number): number {
  if (!p.levels) return 0;
  const g = ground(p);
  let best = -Infinity, lowest = Infinity;
  for (const f of g.flights) {
    if (!within(f.box, hx, hz)) continue;
    const st = f.st, h = st.lower.y + stairT(st, hx + st.lower.dx, hz) * (st.upper.y - st.lower.y);
    if (Math.abs(h - y) > 1.2) continue;
    if (h <= y + STEP_UP && h > best) best = h;
    if (h < lowest) lowest = h;
  }
  for (const L of g.levels) {
    let on = false;
    for (const r of L.rooms) if (within(r, hx, hz, 0.02)) { on = true; break; }
    if (!on) continue;
    for (const r of L.holes) if (hx > r.x0 + 0.01 && hx < r.x1 - 0.01 && hz > r.z0 + 0.01 && hz < r.z1 - 0.01) { on = false; break; }
    if (!on) continue;
    const h = L.l.y;
    if (h <= y + STEP_UP && h > best) best = h;
    if (h < lowest) lowest = h;
  }
  return best > -Infinity ? best : lowest < Infinity ? lowest : levelOf(p, y).y;
}

/** A place kept clear of furniture, and why (the editor says it). LD2.0-D: a flight or a well (`stair`), a helipad. */
export interface Clear extends Rect { why: 'door' | 'passage' | 'fitting' | 'entry' | 'stair' | 'helipad' }
/**
 * Kept clear of furniture: each door leaf's swing (a square the door's width on its swing side) and a step in front of it on the other side; each arch
 * and the street door with a step on both sides; the use side of each built-in fitting; the entry, inside the street door. Rugs may lie in a passage
 * (src/economy/placement.ts decides that), never in a swing. LD2.0-D: a glazed opening as an arch; each flight, its well, a landing at its foot and
 * past its head; a helipad.
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
    if (f.kind === 'sink' || f.kind === 'stove' || f.kind === 'pool' || f.kind === 'heli' || f.kind === 'post') continue;   // on the counter: the counter's own front covers them
    const b = f.box, d = f.front === 'w' ? { x0: b.x0 - use, x1: b.x0, z0: b.z0, z1: b.z1 } : f.front === 'e' ? { x0: b.x1, x1: b.x1 + use, z0: b.z0, z1: b.z1 }
      : f.front === 'n' ? { x0: b.x0, x1: b.x1, z0: b.z0 - use, z1: b.z0 } : { x0: b.x0, x1: b.x1, z0: b.z1, z1: b.z1 + use };
    out.push({ ...d, why: 'fitting' });
  }
  for (const st of stairParts(p)) out.push({ ...st.box, why: 'stair' }, { ...st.well, why: 'stair' }, { ...st.footZone, why: 'passage' }, { ...st.headZone, why: 'passage' });
  for (const m of p.marks ?? []) out.push({ x0: m.x - m.r, x1: m.x + m.r, z0: m.z - m.r, z1: m.z + m.r, why: 'helipad' });
  return out;
}

/** Why a footprint can't go there, or null if it can: outside every room, through a wall, on a fitting, or where the plan keeps clear. */
export function whyNotPlan(p: FloorPlan, f: Rect, o: { rug?: boolean } = {}): 'outside' | 'wall' | 'fitting' | Clear['why'] | null {
  if (!fitsRoom(p, f)) return wallPieces(p).some(w => overlaps(w, f)) ? 'wall' : 'outside';
  if (p.fixtures.some(x => overlaps(x.box, f))) return 'fitting';
  for (const c of clearZones(p)) if (overlaps(c, f) && !(o.rug && c.why === 'passage')) return c.why;
  return null;
}

// ------------------------------------------------------------------------------------------------ can every room be reached?
/** The walkable grid of a plan before any furniture: which cells are free, and the stairs' links between levels. */
interface Grid { nx: number; nz: number; x0: number; z0: number; cell: number; free: Uint8Array; link: Int32Array | null }
/** The cell index range [i0, i1] whose centres lie in [lo, hi] (each bound inclusive with EPS, or strictly inside it by EPS). */
function span(lo: number, hi: number, o: number, cell: number, n: number, strict: boolean): [number, number] {
  const C = (i: number) => o + (i + 0.5) * cell;
  const inLo = (i: number) => strict ? C(i) > lo + EPS : C(i) >= lo - EPS, inHi = (i: number) => strict ? C(i) < hi - EPS : C(i) <= hi + EPS;
  let i0 = Math.max(0, Math.ceil((lo - o) / cell - 0.5) - 1), i1 = Math.min(n - 1, Math.floor((hi - o) / cell - 0.5) + 1);
  while (i0 < n && !inLo(i0)) i0++;
  while (i1 >= 0 && !inHi(i1)) i1--;
  return [i0, i1];
}
function paint(g: Grid, r: Rect, v: 0 | 1, strict: boolean) {
  const [i0, i1] = span(r.x0, r.x1, g.x0, g.cell, g.nx, strict), [j0, j1] = span(r.z0, r.z1, g.z0, g.cell, g.nz, strict);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) g.free[i * g.nz + j] = v;
}
function baseGrid(p: FloorPlan, radius: number, cell: number): Grid {
  const c = cached(p), key = `${radius}|${cell}`, hit = c.grids.get(key); if (hit) return hit;
  const B = planBounds(p), nx = Math.ceil((B.x1 - B.x0) / cell), nz = Math.ceil((B.z1 - B.z0) / cell);
  const g: Grid = { nx, nz, x0: B.x0, z0: B.z0, cell, free: new Uint8Array(nx * nz), link: null };
  // a cell is free when it lies in a room or an opening's passage (or, LD2.0-D, a seam between open rooms, or a flight's half on its level) and a body
  // there touches no wall, fitting, balustrade or railing
  for (const r of p.rooms) paint(g, inner(p, r), 1, false);
  for (const o of p.openings) if (o.kind !== 'front') paint(g, passage(p, o), 1, false);
  for (const s of seams(p)) paint(g, s, 1, false);
  const parts = stairParts(p);
  for (const st of parts) { paint(g, st.box, 0, false); paint(g, st.well, 0, false); }
  for (const st of parts) { paint(g, st.low, 1, false); paint(g, st.high, 1, false); }
  const blocks: Rect[] = [...wallPieces(p), ...p.fixtures.map(f => f.box)];
  for (const st of parts) blocks.push(...st.balustrades, ...st.balustrades.map(b => shiftX(b, st.shift)), ...st.rails);
  for (const b of blocks) paint(g, grow(b, radius), 0, true);
  // a flight's two halves join at its middle: the lower half's last row of cells to the upper half's first
  if (parts.length) {
    const link = new Int32Array(nx * nz).fill(-1);
    for (const st of parts) {
      const di = Math.round(st.shift / cell);
      const [i0, i1] = span(st.low.x0, st.low.x1, g.x0, cell, nx, false), [j0, j1] = span(st.low.z0, st.low.z1, g.z0, cell, nz, false);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const last = st.axis === 'z' ? (st.dir > 0 ? j === j1 : j === j0) : (st.dir > 0 ? i === i1 : i === i0);
        if (!last) continue;
        const ni = i + di + (st.axis === 'x' ? st.dir : 0), nj = j + (st.axis === 'z' ? st.dir : 0);
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        link[i * nz + j] = ni * nz + nj; link[ni * nz + nj] = i * nz + j;
      }
    }
    g.link = link;
  }
  c.grids.set(key, g);
  return g;
}

/**
 * Can a person still walk from the street door to every room, and through every opening? On a grid (`cell` m) over the home, a cell is free when it
 * lies in a room or an opening's passage and a body (`radius`) there touches no wall, fitting or obstacle (the furniture's footprints). Returns the
 * rooms and openings that can't be reached from the spawn. LD2.0-D: across the levels, by the stairs (a flight is walked from its foot to its head).
 */
export function reachable(p: FloorPlan, obstacles: readonly Rect[], radius = 0.28, cell = 0.1): { ok: boolean; rooms: string[]; openings: string[] } {
  const base = p.levels ? baseGrid(p, radius, cell) : null;
  let g: Grid;
  if (base) { g = { ...base, free: base.free.slice() }; }
  else {
    // one level: built afresh (a test may change a plan in place)
    const B = planBounds(p), nx = Math.ceil((B.x1 - B.x0) / cell), nz = Math.ceil((B.z1 - B.z0) / cell);
    g = { nx, nz, x0: B.x0, z0: B.z0, cell, free: new Uint8Array(nx * nz), link: null };
    for (const r of p.rooms) paint(g, inner(p, r), 1, false);
    for (const o of p.openings) if (o.kind !== 'front') paint(g, passage(p, o), 1, false);
    for (const b of [...wallPieces(p), ...p.fixtures.map(f => f.box)]) paint(g, grow(b, radius), 0, true);
  }
  for (const o of obstacles) paint(g, grow(o, radius), 0, true);
  const { nx, nz, free, link } = g;
  const seen = new Uint8Array(nx * nz), q = new Int32Array(nx * nz);
  let qn = 0;
  const at = (x: number, z: number) => [Math.max(0, Math.min(nx - 1, Math.floor((x - g.x0) / cell))), Math.max(0, Math.min(nz - 1, Math.floor((z - g.z0) / cell)))];
  const [si, sj] = at(p.spawn.x, p.spawn.z);
  if (free[si * nz + sj]) { seen[si * nz + sj] = 1; q[qn++] = si * nz + sj; }
  while (qn) {
    const k = q[--qn], i = Math.floor(k / nz), j = k % nz;
    if (i + 1 < nx) { const n = k + nz; if (free[n] && !seen[n]) { seen[n] = 1; q[qn++] = n; } }
    if (i > 0) { const n = k - nz; if (free[n] && !seen[n]) { seen[n] = 1; q[qn++] = n; } }
    if (j + 1 < nz) { const n = k + 1; if (free[n] && !seen[n]) { seen[n] = 1; q[qn++] = n; } }
    if (j > 0) { const n = k - 1; if (free[n] && !seen[n]) { seen[n] = 1; q[qn++] = n; } }
    if (link) { const n = link[k]; if (n >= 0 && free[n] && !seen[n]) { seen[n] = 1; q[qn++] = n; } }
  }
  const reached = (r: Rect) => {
    const [i0, i1] = span(r.x0, r.x1, g.x0, cell, nx, false), [j0, j1] = span(r.z0, r.z1, g.z0, cell, nz, false);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (seen[i * nz + j]) return true;
    return false;
  };
  const rooms = p.rooms.filter(r => !reached(inner(p, r))).map(r => r.id);
  const openings = p.openings.filter(o => o.kind !== 'front' && !reached(passage(p, o))).map(o => o.id);
  return { ok: !rooms.length && !openings.length, rooms, openings };
}
