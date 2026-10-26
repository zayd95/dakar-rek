import type { Placement } from '../core/types';
import { HOMES, type FurnitureSpec, type FurnitureType, type HomeLevel, type HomeSpec } from './catalog';
import { clearZones, fitsRoom, inner, planFor, reachable, roomAt, whyNotPlan, type Fixture, type FloorPlan, type Room, type RoomKind } from '../housing/plan';

/**
 * Where each home's interior stands, off the street grid (src/economy/estate.ts builds it there): one slot per catalogue
 * entry, in the catalogue's order. It depends on nothing else, so every client draws a home at the same place — a guest
 * drawing a host's home from its snapshot (src/online/visit.ts) sees each piece exactly where the host does.
 */
export const ROOM_X = 1600, ROOM_STEP = 60;
export function homeOrigin(specId: string): { x: number; z: number } | null {
  const i = HOMES.findIndex(h => h.id === specId);
  return i < 0 ? null : { x: ROOM_X + i * ROOM_STEP, z: 0 };
}

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
  /**
   * LD2.0-C: a home built from a floor plan (src/housing/plan.ts): its rooms, walls, doors and fittings decide where a piece can go (`whyNot`
   * below), not `blocks` and `clear`, which then only mirror the plan's fittings and kept-clear zones.
   */
  plan?: FloorPlan;
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
  const kz = Math.min(2.6, d * 0.36), doorX = w / 2 - 1.3, P = partitions(level, w, d);
  return {
    level, w, d, doorX,
    blocks: [R(-w / 2, -d / 2, -w / 2 + 0.6, -d / 2 + kz), R(w / 2 - 1.2, -d / 2, w / 2, -d / 2 + 1.2), ...P.walls],
    clear: [R(doorX - 0.7, d / 2 - 1.4, doorX + 0.7, d / 2), R(-w / 2 + 0.6, -d / 2, -w / 2 + 1.4, -d / 2 + kz), R(w / 2 - 1.2, -d / 2 + 1.2, w / 2, -d / 2 + 1.9), ...P.gaps],
    defaults: {},
  };
}

/**
 * The F2 (level 'apartment') has two bedrooms in its north strip, between the kitchen counter and the shower: a wall along
 * z = `row` with a doorway for each room and a divider between them. `walls` are what nothing can stand on (and what the
 * shell draws and collides with), `gaps` the doorways kept free. Other levels are one open room.
 */
export function partitions(level: HomeLevel, w: number, d: number): { walls: Rect[]; gaps: Rect[]; row: number; rooms: Rect[] } {
  if (level !== 'apartment') return { walls: [], gaps: [], row: 0, rooms: [] };
  const T = 0.075, row = -d / 2 + 2.6, xa = -w / 2 + 0.7, xb = w / 2 - 1.2, mid = xa + (xb - xa) * 0.5;   // the rooms span xa … xb, the divider at mid
  const doorA = xa + (mid - xa) * 0.5, doorB = mid + (xb - mid) * 0.5, G = 0.5;                            // doorways 1 m wide, centred in each room
  return {
    row,
    walls: [R(xa, row - T, doorA - G, row + T), R(doorA + G, row - T, mid + T, row + T), R(mid - T, row - T, doorB - G, row + T), R(doorB + G, row - T, xb, row + T), R(mid - T, -d / 2, mid + T, row - T)],
    gaps: [R(doorA - G, row - 0.5, doorA + G, row + 0.7), R(doorB - G, row - 0.5, doorB + G, row + 0.7)],
    rooms: [R(xa, -d / 2, mid - T, row - T), R(mid + T, -d / 2, xb, row - T)],
  };
}
const planLayouts = new Map<string, HomeLayout>();
/** The layout of a home: its floor plan when it has one (the F2 since LD2.0-C), else its one open room (or the starter room). */
export function layoutOf(h: HomeSpec): HomeLayout {
  const plan = planFor(h.id);
  if (!plan) return h.home.level === 'room' ? STARTER_ROOM : openPlan(h.home.level, h.home.w, h.home.d);
  let L = planLayouts.get(h.id);
  if (!L) {
    const front = plan.openings.find(o => o.kind === 'front');
    L = { level: h.home.level, w: plan.w - plan.outWall, d: plan.d - plan.outWall, doorX: front?.x ?? 0, blocks: plan.fixtures.map(f => R(f.box.x0, f.box.z0, f.box.x1, f.box.z1)), clear: clearZones(plan).map(c => R(c.x0, c.z0, c.x1, c.z1)), defaults: {}, plan };
    planLayouts.set(h.id, L);
  }
  return L;
}

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

/**
 * Why a piece cannot stand there (a short reason in French, said by the placement mode), or null. In a home built from a floor plan the plan's
 * rules apply (`whyNotInPlan`); in a one-room home: the walls, the built-ins, the passages kept free and the other pieces. Flat pieces (rugs) only
 * avoid other rugs and the built-ins; pieces hung on a wall or from the ceiling (`mount`) only avoid pieces hung the same way.
 */
export function whyNot(layout: HomeLayout, f: FurnitureSpec, at: Placement, others: readonly Placed[]): string | null {
  if (layout.plan) return whyNotInPlan(layout.plan, f, at, others);
  const r = footprint(f, at);
  if (r.x0 < -layout.w / 2 - EPS || r.x1 > layout.w / 2 + EPS || r.z0 < -layout.d / 2 - EPS || r.z1 > layout.d / 2 + EPS) return 'Contre le mur';
  if (f.mount === 'ceiling') return hung(f, r, others) ? WHY.other : null;
  if (f.mount === 'wall') {
    const W = layout.w / 2, D = layout.d / 2, rot = quarter(at);
    if ([r.z0 + D, r.x0 + W, D - r.z1, W - r.x1][rot] > BACK) return WHY.onWall;
    if (rot === 2 && r.x0 < layout.doorX + 0.6 && r.x1 > layout.doorX - 0.6) return 'Pas devant la porte';
    if (layout.blocks.some(b => overlaps(r, b))) return 'Gêné par un meuble de la maison';
    return hung(f, r, others) ? WHY.other : hiding(f, at, others);
  }
  if (layout.blocks.some(b => overlaps(r, b))) return 'Gêné par un meuble de la maison';
  if (!f.flat && layout.clear.some(b => overlaps(r, b))) return 'Laisse le passage libre';
  for (const o of others) if (!o.spec.mount && !!o.spec.flat === !!f.flat && overlaps(r, footprint(o.spec, o.at))) return WHY.other;
  return hiding(f, at, others);
}

const round = (v: number) => Math.round(v * 100) / 100;
/** Rounded to the centimetre toward `dir` (+1 up, −1 down): a spot computed against a wall stays inside it. */
const roundIn = (v: number, dir: 1 | -1) => (dir > 0 ? Math.ceil(v * 100 - 1e-6) : Math.floor(v * 100 + 1e-6)) / 100;
const steps = (half: number, size: number) => {
  const n = Math.floor((half * 2 - size) / 2 / GRID + EPS), out: number[] = [];
  for (let k = 0; k <= n; k++) { out.push(k * GRID); if (k) out.push(-k * GRID); }
  return out;
};

/**
 * A free spot for a new piece: its usual spot in this home if free, otherwise against a wall (back to the wall, facing
 * the room, from the middle of each wall outwards: north, west, east, south), otherwise anywhere; null if the home is full.
 * Rugs go to the middle of the room first. In a home built from a floor plan: the room its kind belongs to first (`room`, the room the
 * placement mode shows, before it), then any room (`autoPlaceInPlan`).
 */
export function autoPlace(layout: HomeLayout, f: FurnitureSpec, others: readonly Placed[], o: { room?: string | null } = {}): Placement | null {
  if (layout.plan) return autoPlaceInPlan(layout, f, others, o.room ?? null);
  const ok = (at: Placement) => !whyNot(layout, f, at, others);
  const def = layout.defaults[f.id];
  if (def && ok(def)) return { ...def };
  const W = layout.w / 2, D = layout.d / 2;
  if (f.flat || f.mount === 'ceiling') {
    for (const dz of steps(D, f.d)) for (const dx of steps(W, f.w)) { const at = { x: dx, z: dz, rot: 0 }; if (ok(at)) return at; }
    if (f.mount) return null;
  }
  const walls: { rot: number; at: (t: number) => Placement; along: number[] }[] = [
    { rot: 0, at: t => ({ x: t, z: round(-D + f.d / 2), rot: 0 }), along: steps(W, f.w) },
    { rot: 1, at: t => ({ x: round(-W + f.d / 2), z: t, rot: 1 }), along: steps(D, f.w) },
    { rot: 3, at: t => ({ x: round(W - f.d / 2), z: t, rot: 3 }), along: steps(D, f.w) },
    { rot: 2, at: t => ({ x: t, z: round(D - f.d / 2), rot: 2 }), along: steps(W, f.w) },
  ];
  for (const wall of walls) for (const t of wall.along) { const at = wall.at(t); if (ok(at)) return at; }
  if (f.mount) return null;
  for (const dz of steps(D, f.d)) for (const dx of steps(W, f.w)) { const at = { x: dx, z: dz, rot: 0 }; if (ok(at)) return at; }
  return null;
}

/** Moves a piece by whole grid steps (placement mode arrows). */
export const nudge = (at: Placement, dx: number, dz: number): Placement => ({ x: round(at.x + dx * GRID), z: round(at.z + dz * GRID), rot: at.rot });
/** A quarter turn more (placement mode « Tourner »). */
export const turn = (at: Placement): Placement => ({ ...at, rot: (at.rot + 1) % 4 });
/** Snaps a point (a tap on the floor) to the grid. */
export const snap = (x: number, z: number, rot: number): Placement => ({ x: round(Math.round(x / GRID) * GRID), z: round(Math.round(z / GRID) * GRID), rot });

// ------------------------------------------------------------------------------------------------ LD2.0-C: homes built from a floor plan
/** What the placement mode says when a spot is refused (the plan's reasons, below, and the one-room home's own). */
export const WHY = {
  room: 'Ce meuble ne tient pas dans la pièce',
  door: 'Il faut laisser la porte s’ouvrir',
  passage: 'Laisse le passage libre',
  other: 'Gêné par un autre meuble',
  onWall: 'À accrocher contre un mur',
  window: 'Pas devant la fenêtre',
  hidden: 'Caché derrière un grand meuble',
  hides: 'Ça cacherait ce qui est accroché au mur',
} as const;
/** On a built-in fitting, and in front of it (where a person stands to use it). */
const ON_FIXTURE: Record<Fixture['kind'], string> = {
  counter: 'Pas sur le plan de travail', sink: 'Pas sur le plan de travail', stove: 'Pas sur le plan de travail', fridge: 'Pas sur le frigo',
  shower: 'Pas dans la douche', wc: 'Pas sur les toilettes', basin: 'Pas sur le lavabo',
};
const FRONT_OF: Record<Fixture['kind'], string> = {
  counter: 'Laisse la place devant le plan de travail', sink: 'Laisse la place devant l’évier', stove: 'Laisse la place devant la cuisinière', fridge: 'Laisse la place devant le frigo',
  shower: 'Laisse l’accès à la douche', wc: 'Laisse l’accès aux toilettes', basin: 'Laisse la place devant le lavabo',
};
/** « vers la chambre »: a room named with its article. */
const ARTICLE: Record<RoomKind, string> = { entree: 'l’', sejour: 'le ', cuisine: 'la ', chambre: 'la ', sdb: 'la ', degagement: 'le ' };
export const towardRoom = (r: Room) => `${ARTICLE[r.kind]}${r.name.charAt(0).toLowerCase()}${r.name.slice(1)}`;
/** The room named first when a piece would cut several off (the deepest of the home first). */
const CUT_ORDER: RoomKind[] = ['chambre', 'sdb', 'cuisine', 'sejour', 'degagement', 'entree'];
/** How far a hung piece's back may stand from its wall (m). */
const BACK = 0.02;
const quarter = (at: Placement) => ((Math.round(at.rot) % 4) + 4) % 4;
/** Overlaps a piece hung the same way (on a wall, from the ceiling). */
const hung = (f: FurnitureSpec, r: Rect, others: readonly Placed[]) => others.some(o => o.spec.mount === f.mount && overlaps(r, footprint(o.spec, o.at)));
/** What stands on the floor in the way of a person: every piece but the rugs and the hung pieces. */
const obstacles = (others: readonly Placed[]) => others.filter(o => !o.spec.flat && !o.spec.mount).map(o => footprint(o.spec, o.at));

/**
 * How high a piece's model reaches (y0 its lowest point, y1 its top, m above the floor), installed with the furniture kit
 * (src/economy/furnitureKitAdapter.ts); null when no model is known (a hung piece is then never said to be hidden).
 */
let spanOf: (f: FurnitureSpec) => { y0: number; y1: number } | null = () => null;
export const setPieceSpans = (fn: typeof spanOf) => { spanOf = fn; };
/** The floor in front of a piece hung on a wall that must stay clear of anything tall enough to hide it (m from the wall). */
const FRONT = 0.75;
function frontOf(f: FurnitureSpec, at: Placement): Rect {
  const r = footprint(f, at);
  switch (quarter(at)) {
    case 0: return R(r.x0, r.z1, r.x1, r.z1 + FRONT);
    case 1: return R(r.x1, r.z0, r.x1 + FRONT, r.z1);
    case 2: return R(r.x0, r.z0 - FRONT, r.x1, r.z0);
    default: return R(r.x0 - FRONT, r.z0, r.x0, r.z1);
  }
}
/** A floor piece reaching above a hung piece's lowest edge, standing in front of it, hides it (a picture behind a wardrobe, a mirror behind an aquarium). */
function hidesIt(floor: FurnitureSpec, at: Placement, wall: FurnitureSpec, wallAt: Placement): boolean {
  if (floor.flat || floor.mount) return false;
  const top = spanOf(floor)?.y1, low = spanOf(wall)?.y0;
  return top !== undefined && low !== undefined && top > low + 0.05 && overlaps(frontOf(wall, wallAt), footprint(floor, at));
}
/** A hung piece hidden by a piece standing in front of it, or a floor piece that would hide one (null: neither). */
function hiding(f: FurnitureSpec, at: Placement, others: readonly Placed[]): string | null {
  if (f.mount === 'wall') return others.some(o => hidesIt(o.spec, o.at, f, at)) ? WHY.hidden : null;
  if (f.mount || f.flat) return null;
  return others.some(o => o.spec.mount === 'wall' && hidesIt(f, at, o.spec, o.at)) ? WHY.hides : null;
}

/**
 * The plan's rules (src/housing/plan.ts `whyNotPlan`, `reachable`): a piece fits inside one room, never through a wall, on a fitting, in a door's
 * swing, in front of an arch or a fitting or in the entry (rugs may lie in a passage); it does not overlap another piece; and after the move every
 * room and opening can still be reached from the street door. A piece hung on a wall needs its back against a wall of its room (not over an
 * opening or a window, nor where a door swings); one hung from the ceiling only needs to be inside a room.
 */
function whyNotInPlan(p: FloorPlan, f: FurnitureSpec, at: Placement, others: readonly Placed[]): string | null {
  const r = footprint(f, at);
  if (f.mount === 'ceiling') return !fitsRoom(p, r) ? WHY.room : hung(f, r, others) ? WHY.other : null;
  if (f.mount === 'wall') return whyNotOnWall(p, f, at, r, others);
  const why = whyNotPlan(p, r, { rug: !!f.flat });
  if (why) return reasonOf(p, why, r);
  for (const o of others) if (!o.spec.mount && !!o.spec.flat === !!f.flat && overlaps(r, footprint(o.spec, o.at))) return WHY.other;
  return f.flat ? null : hiding(f, at, others) ?? cutsOff(p, r, others);
}
function reasonOf(p: FloorPlan, why: NonNullable<ReturnType<typeof whyNotPlan>>, r: Rect): string {
  switch (why) {
    case 'outside': case 'wall': return WHY.room;
    case 'door': return WHY.door;
    case 'passage': case 'entry': return WHY.passage;
    case 'fitting': {
      const on = p.fixtures.find(x => overlaps(x.box, r));
      if (on) return ON_FIXTURE[on.kind];
      const front = p.fixtures.find(x => x.kind !== 'sink' && x.kind !== 'stove' && clearZones(p).some(c => c.why === 'fitting' && overlaps(c, r) && touches(c, x.box)));
      return front ? FRONT_OF[front.kind] : WHY.passage;
    }
  }
}
const touches = (a: Rect, b: Rect) => a.x0 <= b.x1 + EPS && b.x0 <= a.x1 + EPS && a.z0 <= b.z1 + EPS && b.z0 <= a.z1 + EPS;
/** The room the piece would cut off (« Ça bloquerait le passage vers la chambre »), or null: only what this piece itself cuts off counts. */
function cutsOff(p: FloorPlan, r: Rect, others: readonly Placed[]): string | null {
  const obs = obstacles(others), after = reachable(p, [...obs, r]);
  if (after.ok) return null;
  const before = reachable(p, obs);
  const rooms = after.rooms.filter(id => !before.rooms.includes(id));
  const ids = rooms.length ? rooms : after.openings.filter(id => !before.openings.includes(id)).flatMap(id => { const o = p.openings.find(x => x.id === id)!; return [o.b, o.a]; });
  if (!ids.length) return null;
  const cut = CUT_ORDER.map(k => p.rooms.find(rm => rm.kind === k && ids.includes(rm.id))).find(Boolean) ?? p.rooms.find(rm => ids.includes(rm.id));
  return cut ? `Ça bloquerait le passage vers ${towardRoom(cut)}` : WHY.passage;
}
function whyNotOnWall(p: FloorPlan, f: FurnitureSpec, at: Placement, r: Rect, others: readonly Placed[]): string | null {
  const room = fitsRoom(p, r); if (!room) return WHY.room;
  const i = inner(p, room), rot = quarter(at);
  if ([r.z0 - i.z0, r.x0 - i.x0, i.z1 - r.z1, i.x1 - r.x1][rot] > BACK) return WHY.onWall;
  // the wall behind it: the room's side, less its openings and windows
  const side = (['n', 'w', 's', 'e'] as const)[rot], line = [room.box.z0, room.box.x0, room.box.z1, room.box.x1][rot], alongX = rot % 2 === 0;
  const [a0, a1] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
  for (const o of p.openings) {
    if ((o.axis === 'x') !== alongX || Math.abs((alongX ? o.z : o.x) - line) > EPS) continue;
    const c = alongX ? o.x : o.z; if (a0 < c + o.width / 2 && a1 > c - o.width / 2) return o.kind === 'arch' ? 'Pas devant le passage' : 'Pas devant la porte';
  }
  for (const w of p.windows) if (w.room === room.id && w.side === side && a0 < w.at + w.width / 2 && a1 > w.at - w.width / 2) return WHY.window;
  const tall = p.fixtures.find(x => x.h > 1.2 && overlaps(x.box, r)); if (tall) return ON_FIXTURE[tall.kind];
  if (clearZones(p).some(c => c.why === 'door' && overlaps(c, r))) return WHY.door;
  return hung(f, r, others) ? WHY.other : hiding(f, at, others);
}

/** The room each type of furniture goes to first in a home built from a floor plan; 'any': the séjour first, else wherever it fits. */
export const TYPE_ROOM: Record<FurnitureType, RoomKind | 'any'> = {
  chair: 'sejour', sofa: 'sejour', table: 'sejour', tv: 'sejour', radio: 'sejour', desk: 'sejour', dining: 'sejour', shelf: 'sejour', outdoor: 'sejour',
  bed: 'chambre', mattress: 'chambre', wardrobe: 'chambre', mirror: 'chambre',
  kitchen: 'cuisine', appliance: 'cuisine', bath: 'sdb',
  rug: 'any', plant: 'any', lamp: 'any', decor: 'any',
};
export const roomKindOf = (f: FurnitureSpec): RoomKind | 'any' => f.room ?? TYPE_ROOM[f.type] ?? 'any';
const FALLBACK: RoomKind[] = ['sejour', 'chambre', 'cuisine', 'entree', 'degagement', 'sdb'];
/** The rooms tried in turn for a piece: the one asked for, the rooms of its kind, then every other (the séjour first). */
export function roomsFor(p: FloorPlan, f: FurnitureSpec, prefer: string | null = null): Room[] {
  const kind = roomKindOf(f), out: Room[] = [];
  const add = (r: Room | undefined) => { if (r && !out.includes(r)) out.push(r); };
  if (prefer) add(p.rooms.find(r => r.id === prefer));
  if (kind !== 'any') for (const r of p.rooms) if (r.kind === kind) add(r);
  for (const k of FALLBACK) for (const r of p.rooms) if (r.kind === k) add(r);
  for (const r of p.rooms) add(r);
  return out;
}
/**
 * A spot in a home built from a floor plan: room by room (`roomsFor`), against a wall of the room facing into it (from the middle of each wall
 * outwards: north, west, east, south; the walls with a window first for outdoor furniture, by the window), else anywhere in it; rugs and hanging
 * lamps from the middle out. Never a spot `whyNot` refuses; null: the home is full for it (it stays stored, « rangé »).
 */
function autoPlaceInPlan(L: HomeLayout, f: FurnitureSpec, others: readonly Placed[], prefer: string | null): Placement | null {
  const p = L.plan!, ok = (at: Placement) => !whyNot(L, f, at, others);
  for (const room of roomsFor(p, f, prefer)) { const at = spotIn(p, room, f, ok); if (at) return at; }
  return null;
}
function spotIn(p: FloorPlan, room: Room, f: FurnitureSpec, ok: (at: Placement) => boolean): Placement | null {
  const i = inner(p, room), cx = (i.x0 + i.x1) / 2, cz = (i.z0 + i.z1) / 2, W = (i.x1 - i.x0) / 2, D = (i.z1 - i.z0) / 2;
  const grid = (rots: number[]) => {
    for (const rot of rots) {
      const w = rot % 2 ? f.d : f.w, d = rot % 2 ? f.w : f.d;
      for (const dz of steps(D, d)) for (const dx of steps(W, w)) { const at = { x: round(cx + dx), z: round(cz + dz), rot }; if (ok(at)) return at; }
    }
    return null;
  };
  if (f.flat || f.mount === 'ceiling') return grid([0, 1]);
  const walls = [
    { side: 'n', along: steps(W, f.w), at: (t: number) => ({ x: round(cx + t), z: roundIn(i.z0 + f.d / 2, 1), rot: 0 }) },
    { side: 'w', along: steps(D, f.w), at: (t: number) => ({ x: roundIn(i.x0 + f.d / 2, 1), z: round(cz + t), rot: 1 }) },
    { side: 'e', along: steps(D, f.w), at: (t: number) => ({ x: roundIn(i.x1 - f.d / 2, -1), z: round(cz + t), rot: 3 }) },
    { side: 's', along: steps(W, f.w), at: (t: number) => ({ x: round(cx + t), z: roundIn(i.z1 - f.d / 2, -1), rot: 2 }) },
  ];
  // spots in front of a window come last (a wardrobe never hides one), except for outdoor furniture, which goes by the window first
  const byWindow = (side: string, at: Placement) => {
    const r = footprint(f, at), [a0, a1] = side === 'n' || side === 's' ? [r.x0, r.x1] : [r.z0, r.z1];
    return p.windows.some(w => w.room === room.id && w.side === side && a0 < w.at + w.width / 2 && a1 > w.at - w.width / 2);
  };
  const spots = walls.flatMap(wall => wall.along.map(t => { const at = wall.at(t); return { at, win: byWindow(wall.side, at) }; }));
  const first = f.type === 'outdoor';
  for (const win of [first, !first]) for (const c of spots) if (c.win === win && ok(c.at)) return c.at;
  return f.mount ? null : grid([0, 1]);
}

/** The rooms the placement mode offers to frame (its room chips), in the plan's order; the short hall (dégagement) is left out. */
export const planRooms = (layout: HomeLayout): Room[] => layout.plan ? layout.plan.rooms.filter(r => r.kind !== 'degagement') : [];
/** The room a placed piece stands in (from where it stands: nothing of it is saved), or null (a one-room home, a piece astride a doorway). */
export function roomOf(layout: HomeLayout, at: Placement): Room | null {
  return layout.plan ? roomAt(layout.plan, at.x, at.z) : null;
}
/** The centre of a room's floor (where the placement mode looks when its chip is chosen), and its inner size. */
export function roomFrame(layout: HomeLayout, id: string): { x: number; z: number; w: number; d: number } | null {
  const r = layout.plan?.rooms.find(x => x.id === id); if (!r) return null;
  const i = inner(layout.plan!, r);
  return { x: (i.x0 + i.x1) / 2, z: (i.z0 + i.z1) / 2, w: i.x1 - i.x0, d: i.z1 - i.z0 };
}

/**
 * A piece hung on a wall, moved to (x, z): brought flush against the nearest wall of the room there, facing into the room, slid along the wall on
 * the grid. The placement mode moves pictures, mirrors and towel rails with it, so they never float in the middle of a room.
 */
export function onWall(layout: HomeLayout, f: FurnitureSpec, x: number, z: number): Placement {
  let rect: Rect = R(-layout.w / 2, -layout.d / 2, layout.w / 2, layout.d / 2);
  const p = layout.plan;
  if (p) {
    const room = roomAt(p, x, z) ?? p.rooms.reduce((best, r) => { const i = inner(p, r), d = Math.hypot(Math.max(i.x0 - x, 0, x - i.x1), Math.max(i.z0 - z, 0, z - i.z1)); return d < best.d ? { r, d } : best; }, { r: p.rooms[0], d: Infinity }).r;
    const i = inner(p, room); rect = R(i.x0, i.z0, i.x1, i.z1);
  }
  const dist = [z - rect.z0, x - rect.x0, rect.z1 - z, rect.x1 - x], rot = dist.indexOf(Math.min(...dist));
  const along = (v: number, lo: number, hi: number) => Math.min(roundIn(hi, -1), Math.max(roundIn(lo, 1), round(Math.round(v / GRID) * GRID)));
  const hw = f.w / 2, hd = f.d / 2;
  switch (rot) {
    case 0: return { x: along(x, rect.x0 + hw, rect.x1 - hw), z: roundIn(rect.z0 + hd, 1), rot: 0 };
    case 1: return { x: roundIn(rect.x0 + hd, 1), z: along(z, rect.z0 + hw, rect.z1 - hw), rot: 1 };
    case 2: return { x: along(x, rect.x0 + hw, rect.x1 - hw), z: roundIn(rect.z1 - hd, -1), rot: 2 };
    default: return { x: roundIn(rect.x1 - hd, -1), z: along(z, rect.z0 + hw, rect.z1 - hw), rot: 3 };
  }
}

/**
 * The pieces of a home built from a floor plan, re-checked against it (a save from before the plan, or any change of the rules): in the order
 * given, a piece keeps its spot when it is still valid beside the pieces kept before it; the others are moved by `autoPlace` (the room of their
 * kind first), else stored (null). Nothing is ever lost and the result is stable: re-checking it again keeps every piece where it is.
 */
export function relayout(layout: HomeLayout, pieces: readonly { spec: FurnitureSpec; at: Placement | null }[], o: { placeStored?: boolean } = {}): (Placement | null)[] {
  const kept: Placed[] = [], out: (Placement | null)[] = pieces.map(() => null), moved: number[] = [], stored: number[] = [];
  pieces.forEach((pc, k) => {
    if (pc.at && !whyNot(layout, pc.spec, pc.at, kept)) { kept.push({ spec: pc.spec, at: pc.at }); out[k] = { ...pc.at }; }
    else (pc.at ? moved : stored).push(k);
  });
  // the pieces that stood somewhere before the ones still stored (`placeStored`: a delivery, a move, an older save's migrated pieces)
  for (const k of [...moved, ...(o.placeStored ? stored : [])]) {
    const at = autoPlace(layout, pieces[k].spec, kept);
    if (at) { kept.push({ spec: pieces[k].spec, at }); out[k] = at; }
  }
  return out;
}
