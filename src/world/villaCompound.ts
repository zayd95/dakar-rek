import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from './batch';
import type { Canopy, Collider, KeepClear } from './types';
import { BACK_GARDEN, BAYS, ENTRANCE, ENTRY_WALK, FRONT_DOOR, GATE, HELIPAD, HOUSE, LOT, PARAPET, POOL, STOREY, WALL_H } from '../housing/villa';
import { buildVillaFacade, villaFacadeMaterials } from '../housing/villaFacade';
import { entranceAngle } from '../villa/gate';
import { buildHelicopter } from './helicopter';

/**
 * LD2.0-D « Owner flagship villa » (docs/ld2/LD2_D.md), lane V-E: the villa's street compound on the Almadies block (1,1) lot 3, built by
 * src/world/builder.ts in place of the generic villa that stood there (whose random draws it still makes, unseen, so every other lot and the
 * street dressing stay where they were).
 *
 *  - The boundary wall on the lot's four edges (WALL_H, a stone plinth, a coping, travertine pillars on the two street faces, bougainvillea over
 *    the top), solid; the side strips closed by a wall from the house to the boundary, so a visitor from the street stays in the front yard.
 *  - The sliding gate (GATE): a slatted anthracite gate on its track, its own mesh; the villa module (src/villa/module.ts) slides it open for the
 *    villa's people and back, and keeps its collider (`gate.collider`) in step. Lantern pillars either side, a dropped kerb in front. Round 2: it is
 *    telescopic (two half panels on two tracks, `slideGate`), so open it stows between the main entrance and the gate, clear of the entrance.
 *  - Round 2 (the owner's review: « a main door different from the car garage door »): the main entrance for people (ENTRANCE), in line with the
 *    front door: a travertine portal higher than the wall, a pivoting teak and bronze door (its own mesh, swung by the villa module like the gate),
 *    a slim canopy, the house number, an intercom, wall lights; a straight stone path (ENTRY_WALK, kept clear) from it to the forecourt.
 *  - The front yard: the paved driveway and the two marked bays (BAYS) with their wheel stops, the forecourt to the front door (FRONT_DOOR) and
 *    stepping stones across the lawn from the gate, mown stripes, palms, a planted bed along the house, garden bollards; at night their pools
 *    of light join the street lamps' (the hub's `pool`), the bulbs the street lamps' material.
 *  - The house: lane V-S's facade (src/housing/villaFacade.ts) on the lot, solid, and the helicopter (src/world/helicopter.ts) on its roof pad
 *    (HELIPAD, y = 2 × STOREY above the ground).
 *  - The back garden as the interior has it (BACK_GARDEN, POOL): the deck, the pool's coping and water, loungers and a parasol, two palms.
 *
 * Plan coordinates (src/housing/villa.ts) are metres from the lot's centre, +z toward the street; the hub's ground is y 0.1. Everything static
 * goes into the hub's own merged batches (the kit), so the compound costs the Almadies view no draw call of its own but the gate (1), the facade
 * and the helicopter (2), and the main entrance (2: its travertine, in the facade's stone material, and its door). No random number is drawn here.
 */
export interface CompoundKit {
  lite: boolean;
  /** The hub's batches: vertex colours, paving texture, leaves, palm bark, water, lamp bulbs. */
  plain: Batch; pave: Batch; leaves: Batch; trunks: Batch; water: Batch; bulbs: Batch;
  /** The hub's painted-metal material (the gate). */
  metalMat: THREE.Material;
  /** A pool of light on the ground at night (the street lamps' merged glow). */
  pool(x: number, z: number, r: number, y?: number): void;
}
export interface GateRig {
  mesh: THREE.Mesh;
  /** The shut gate's solid box (in the hub's colliders while it is shut; its east edge follows the panel as it slides). */
  collider: Collider;
  /** How far the panel slides to open (m, toward −x). */
  travel: number;
  /** The opening in the hub's coordinates (x0, x1 along the street wall at z). */
  x0: number; x1: number; z: number;
}
/** The main entrance's pivoting door (round 2). */
export interface EntranceRig {
  /** The leaf, its origin on the pivot (it turns about y, `entranceAngle`). */
  mesh: THREE.Mesh;
  /** The shut door's box (in the hub's colliders while it is shut or swinging), and the open leaf's (in them once it is open: `ENTRANCE_FREE`). */
  shut: Collider; open: Collider;
  /** The pivot in the hub's coordinates. */
  pivot: { x: number; z: number };
  /** The opening in the hub's coordinates (x0, x1 along the street wall at z). */
  x0: number; x1: number; z: number;
}
export interface VillaCompound {
  /** The gate, the house and the helicopter (each with its own material). */
  group: THREE.Group;
  colliders: Collider[];
  canopies: Canopy[];
  /** Ground kept open: the lot itself and the kerb in front of the gate and of the main entrance (no parked car or stall across the ways in). */
  keepClear: KeepClear[];
  gate: GateRig;
  entrance: EntranceRig;
  /** Where the hub's street dressing must not stand (the lot, in the hub's coordinates). */
  lot: { x0: number; x1: number; z0: number; z1: number };
}

/** Where the flagship villa stands: the Almadies' block (1,1), lot 3 (src/world/builder.ts lotRect; src/housing/villa.ts LOT). */
export const VILLA_SITE = { hub: 'almadies', i: 1, j: 1, lot: 3 } as const;
/** The hub's ground height (characters stand at 0.1: src/world/builder.ts). */
export const GROUND = 0.1;
/** The lot in the hub's coordinates. */
export const LOT_RECT = { x0: LOT.cx - LOT.w / 2, x1: LOT.cx + LOT.w / 2, z0: LOT.cz - LOT.d / 2, z1: LOT.cz + LOT.d / 2 } as const;
/** The wall's thickness; its outer face is on the lot's edge, its collider 5 cm inside it (the pavement's furniture keeps its places). */
const T = 0.3;
/** The street wall's face in the plan (z): the lot's half depth, 11 m in front of the plan's origin. */
const E = LOT.d / 2;
/** The side strips' walls, from the house's side walls to the boundary (plan z). */
export const STRIP_Z = -1.05;
/** The driveway's paving across the yard: a little past the two bays' outer lines (BAYS). */
export const DRIVE = { x0: BAYS[0].x - 1.6, x1: BAYS[1].x + 1.6 } as const;
/** The gate's slatted panels: their height and the plane the outer one slides in (just inside the street wall; the inner one 14 cm further in). */
const GATE_H = 2.25, GATE_Z = E - T - 0.12, GATE_DZ = 0.14;
/**
 * The main entrance (round 2): its travertine pillars' width either side of the opening, the portal's top (the wall is WALL_H), the leaf's top (it
 * stands on the threshold), the pivot's offset from the opening's west edge (a pivoting door: the long side swings in, the short one out).
 */
export const PORTAL = { pillar: 0.55, top: 3.2, depth: 0.7, door: 2.77, sill: 0.17, pivot: 0.25 } as const;
/** The house number on the portal's lintel. */
export const HOUSE_NUMBER = '3';

/** The compound's colours (its palette: the kit, src/kits/almadiesVilla.ts, can change any of them). */
export const COMPOUND_PALETTE = {
  wall: 0xf2ede3, plinth: 0xa99c86, coping: 0xdcd6c8, stone: 0xcdbb9b, stoneDark: 0xb7a482,
  drive: 0xc9c2b4, fore: 0xe6dece, step: 0xd6cdbb, line: 0xf4f2ec, stop: 0xb9b4aa, apron: 0xbcb5a7,
  lawn: 0x6e9e44, lawn2: 0x79aa4c, bed: 0x5b4636, hedge: 0x3e6d2e, hedge2: 0x4b7d36, bloom: 0xc2307a, bloom2: 0xd94a8c,
  deck: 0xdccfb6, rim: 0xf4f1ea, water: 0x2fa8d8, teak: 0x7a5434, cushion: 0xf3efe6, canvas: 0xefe8da, post: 0x2c2d30, bulb: 0xfff1c8,
  slat: 0x34383d, frame: 0x26292d, rail: 0x5b5f64, plaque: 0x1f2226, brass: 0xc9a14b,
  // the main entrance (round 2): the façade's finishes (src/housing/villaFacade.ts: its travertine CLAD, teak DOOR, BRONZE), the bronze of its handles
  clad: 0xe4d2b2, door: 0x8a5a36, groove: 0x5c3c24, bronze: 0x4a3d31, pull: 0xb0915e, slab: 0xf6f2ea, glassDark: 0x15181c,
  // the palms' bark and fronds
  bark: 0x8a6d4a, bark2: 0x9a7b55, frond: 0x3d9450, frond2: 0x2f7f3e, heart: 0x6b5a2a,
};
export type CompoundPalette = typeof COMPOUND_PALETTE;

// ------------------------------------------------------------------------------------------------ where: the plan's frame in the hub
/** Which side of the lot the street is on (the plan's +z): south is the flagship's (+z in the hub). */
export type Facing = 'south' | 'north' | 'east' | 'west';
/**
 * Plan coordinates to the hub's (round 2, the Almadies villa kit): the plan's origin at `at`, turned so that its street side (+z) faces `facing`,
 * mirrored (x → −x: the gate on the west, the entrance on the east) when `mirror`. Box rotations follow (`rot`). The flagship's frame (at the lot's
 * centre, facing south, not mirrored) maps a plan point to (cx + x, cz + z) exactly as before.
 */
export interface Frame {
  facing: Facing; mirror: boolean; at: { x: number; z: number };
  /** A plan point in the hub. */
  p(x: number, z: number): { x: number; z: number };
  /** A plan rotation about y (rad) in the hub. */
  rot(r: number): number;
  /** A plan rectangle in the hub (min/max corners). */
  rect(x0: number, z0: number, x1: number, z1: number): { x0: number; z0: number; x1: number; z1: number };
  /** The frame's own turn about y (rad), as three.js `rotation.y`. */
  turn: number;
}
const TURN: Record<Facing, [number, number, number]> = { south: [1, 0, 0], east: [0, 1, Math.PI / 2], north: [-1, 0, Math.PI], west: [0, -1, -Math.PI / 2] };
export function planFrame(at: { x: number; z: number } = { x: LOT.cx, z: LOT.cz }, facing: Facing = 'south', mirror = false): Frame {
  const [c, sn, turn] = TURN[facing], m = mirror ? -1 : 1, plain = facing === 'south' && !mirror;
  // three.js's rotation.y by `turn`: (x, z) → (x cos + z sin, −x sin + z cos), after the mirror
  const p = plain ? (x: number, z: number) => ({ x: at.x + x, z: at.z + z }) : (x: number, z: number) => ({ x: at.x + c * m * x + sn * z, z: at.z - sn * m * x + c * z });
  const rect = (x0: number, z0: number, x1: number, z1: number) => {
    if (plain) return { x0: at.x + Math.min(x0, x1), z0: at.z + Math.min(z0, z1), x1: at.x + Math.max(x0, x1), z1: at.z + Math.max(z0, z1) };
    const a = p(x0, z0), b = p(x1, z1);
    return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
  };
  return { facing, mirror, at, p, rect, turn, rot: plain ? r => r : r => turn + m * r };
}

// ------------------------------------------------------------------------------------------------ how: the drawing context the pieces share
/**
 * The pieces' shared drawing context: the batches they draw into, the plan's frame, the lot's extent, the palette, and what is made solid, roofed
 * (the palms' canopies) and lit at night. Every helper takes plan coordinates.
 */
export interface Draw extends CompoundKit {
  f: Frame;
  c: CompoundPalette;
  /** The lot's half width (along the street) and its depth behind the plan's origin (the street wall is at z = E = 11 m in front of it). */
  ex: number; eb: number;
  colliders: Collider[]; canopies: Canopy[];
  /** A solid box of the plan (x0…x1, z0…z1), `h` high. */
  solid(x0: number, z0: number, x1: number, z1: number, h: number): Collider;
  /** A box of the plan: centre (x, z), size w × d, from y up `h`. */
  box(b: Batch, w: number, h: number, d: number, x: number, y: number, z: number, col: THREE.ColorRepresentation, rot?: number): void;
  /** A box centred at height y, all six faces (seen from below). */
  slab(b: Batch, w: number, h: number, d: number, x: number, y: number, z: number, col: THREE.ColorRepresentation): void;
  flat(b: Batch, w: number, d: number, x: number, y: number, z: number, col: THREE.ColorRepresentation, rot?: number): void;
  cyl(b: Batch, rTop: number, rBot: number, h: number, x: number, y: number, z: number, col: THREE.ColorRepresentation, seg: number): void;
  blob(b: Batch, r: number, x: number, y: number, z: number, col: THREE.ColorRepresentation, sy: number, detail: number): void;
  /** Boxes (w, h, d, centre x, base y, centre z, colour) as ONE piece of a batch (`Batch.coloured`). */
  joined(b: Batch, parts: [number, number, number, number, number, number, THREE.ColorRepresentation][]): void;
  /** A pool of light at night at a plan point. */
  light(x: number, z: number, r: number, y?: number): void;
}
/** The lot's size (m): its width along the street and its depth; the Almadies' lots are 22 × 22 (src/world/builder.ts LS). */
export interface LotSize { w: number; d: number }
export function makeDraw(kit: CompoundKit, f: Frame = planFrame(), size: LotSize = { w: LOT.w, d: LOT.d }, palette: Partial<CompoundPalette> = {}): Draw {
  const colliders: Collider[] = [], canopies: Canopy[] = [], plain = f.facing === 'south' && !f.mirror, r0 = f.rot(0);
  const c = { ...COMPOUND_PALETTE, ...palette };
  return {
    ...kit, f, c, ex: size.w / 2, eb: size.d - E, colliders, canopies,
    solid: (x0, z0, x1, z1, h) => { const r = { ...f.rect(x0, z0, x1, z1), h }; colliders.push(r); return r; },
    box: (b, w, h, d, x, y, z, col, rot = 0) => { const q = f.p(x, z); b.box(w, h, d, q.x, y, q.z, col, f.rot(rot)); },
    slab: (b, w, h, d, x, y, z, col) => { const q = f.p(x, z); b.slab(w, h, d, q.x, y, q.z, col, r0); },
    flat: (b, w, d, x, y, z, col, rot = 0) => { const q = f.p(x, z); b.flat(w, d, q.x, y, q.z, col, f.rot(rot)); },
    cyl: (b, rt, rb, h, x, y, z, col, seg) => { const q = f.p(x, z); if (plain) b.cyl(rt, rb, h, q.x, y, q.z, col, seg); else b.cyl(rt, rb, h, q.x, y, q.z, col, seg, [0, r0, 0]); },
    blob: (b, r, x, y, z, col, sy, detail) => { const q = f.p(x, z); b.blob(r, q.x, y, q.z, col, sy, detail); },
    joined: (b, parts) => {
      const geos = parts.map(([w, h, d, x, y, z, col]) => {
        const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(), q = f.p(x, z);
        if (!plain) g.rotateY(r0);
        g.translate(q.x, y + h / 2, q.z);
        const cc = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
        return g;
      });
      const g = geos.length > 1 ? mergeGeometries(geos, false)! : geos[0];
      if (geos.length > 1) for (const x of geos) x.dispose();
      b.coloured(g);
    },
    light: (x, z, r, y = 0.2) => { const q = f.p(x, z); kit.pool(q.x, q.z, r, y); },
  };
}

/**
 * How the compound is built (round 2, the Almadies villa kit: src/kits/almadiesVilla.ts says what each option changes). Every option left out is the
 * flagship's: `buildVillaCompound(kit)` draws the villa of the Almadies block (1,1) lot 3 exactly as before (tests/villaKit.test.ts).
 */
export interface CompoundOptions {
  /** Where the plan stands: its frame (default the flagship's lot, facing south). */
  frame?: Frame;
  /** The lot's size (default 22 × 22): the walls, the lawns and the back garden follow it; the street side and the house keep their places. */
  size?: LotSize;
  palette?: Partial<CompoundPalette>;
  /** The pool in the back garden (default yes; without it the deck runs over its place). */
  pool?: boolean;
  /** The house number on the main entrance (default `HOUSE_NUMBER`). */
  number?: string;
  /** The house: its façade (default lane V-S's, src/housing/villaFacade.ts), the roof's height (2 storeys), the helicopter on its pad (yes). */
  house?: { facade?: () => THREE.Object3D; roof?: number; heli?: boolean };
}

export function buildVillaCompound(kit: CompoundKit, o: CompoundOptions = {}): VillaCompound {
  const f = o.frame ?? planFrame(), d = makeDraw(kit, f, o.size, o.palette);
  // the pieces, in the order they always drew (each batch's primitives keep their order: the villa stays exactly as it was)
  drawBoundaryWall(d);
  const gate = drawCarGate(d);
  drawLawns(d);
  drawBays(d);
  drawFrontGarden(d);
  const ent = buildEntrance(d, { number: o.number });
  drawFrontPalms(d);
  const group = new THREE.Group(); group.name = 'villa-compound';
  group.add(gate.mesh, ent.stone, ent.rig.mesh);
  d.colliders.push(ent.rig.shut);                                            // the main entrance stands shut (the villa module swings it)
  const house = placeHouse(d, o.house);
  group.add(house.facade); if (house.heli) group.add(house.heli);
  drawPoolDeck(d, o.pool ?? true);
  // ------------------------------------------------------------------------------------------------ what the street keeps open
  const lot = f.rect(-d.ex, -d.eb, d.ex, E);
  const keepClear: KeepClear[] = [
    { ...lot, why: 'villa_almadies' },
    { ...f.rect(GATE.x0 - 1, E, GATE.x1 + 1, E + 4.5), why: 'villa_gate' },
    { ...f.rect(ENTRANCE.x0 - 0.9, E, ENTRANCE.x1 + 0.9, E + 4.5), why: 'villa_entrance' },
  ];
  group.userData.gate = gate.collider; group.userData.gateTravel = gate.travel;
  group.userData.entrance = { shut: ent.rig.shut, open: ent.rig.open };
  return { group, colliders: d.colliders, canopies: d.canopies, keepClear, lot, gate, entrance: ent.rig };
}

// ================================================================================================ the pieces
/**
 * The boundary wall on the lot's four edges (WALL_H, its plinth and coping), solid, broken by the car gate and the main entrance; the side strips
 * closed from the house to the boundary; travertine pillars on the two street faces (the corner a big one) and the gate's lantern pillars; the
 * plaque, the gate's intercom and a letter box; bougainvillea over the top, spilling on the street side.
 */
export function drawBoundaryWall(d: Draw) {
  const { plain, leaves, bulbs, lite, c, ex, eb, box, solid } = d, Y = GROUND;
  const top = WALL_H, wallH = top - Y;
  /** A straight run of wall between (x0, z0) and (x1, z1) along an axis, its plinth and coping. */
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const w = alongX ? len : T, dd = alongX ? T : len;
    box(plain, w, wallH, dd, cx, Y, cz, c.wall);
    box(plain, w + (alongX ? 0 : 0.04), 0.55, dd + (alongX ? 0.04 : 0), cx, Y - 0.02, cz, c.plinth);
    box(plain, w + (alongX ? 0.02 : 0.12), 0.09, dd + (alongX ? 0.12 : 0.02), cx, top, cz, c.coping);
  };
  const s = E - T / 2, xs = ex - T / 2, zb = eb - T / 2;                     // the walls' centre lines: the street's, the sides', the back's
  run(-ex, s, ENTRANCE.x0 - PORTAL.pillar, s); run(ENTRANCE.x1 + PORTAL.pillar, s, GATE.x0, s); run(GATE.x1, s, ex, s);   // the street wall either side of the entrance and the gate
  run(xs, -eb, xs, E);                                                       // the east wall (on the cross street: the lot is a corner)
  run(-xs, -eb, -xs, E);                                                     // the west wall (the neighbour's lot)
  run(-ex, -zb, ex, -zb);                                                    // the back wall
  const ci = 0.05;                                                           // colliders 5 cm inside the outer face
  solid(-ex + ci, E - T, ENTRANCE.x0, E - ci, top); solid(ENTRANCE.x1, E - T, GATE.x0, E - ci, top); solid(GATE.x1, E - T, ex - ci, E - ci, top);
  solid(ex - T, -eb + ci, ex - ci, E - ci, top); solid(-ex + ci, -eb + ci, -ex + T, E - ci, top); solid(-ex + ci, -eb + ci, ex - ci, -eb + T, top);
  // the side strips closed from the house to the boundary: the back garden is the interior's (src/housing/villa.ts BACK_GARDEN)
  for (const sx of [-1, 1]) {
    const a = sx * HOUSE.x1, b = sx * (ex - T);
    run(Math.min(a, b), STRIP_Z, Math.max(a, b), STRIP_Z);
    solid(a, STRIP_Z - T / 2, b, STRIP_Z + T / 2, top);
  }
  // travertine pillars on the two street faces (the corner a big one), proud of the wall by 8 cm; the gate's pillars carry lanterns
  /** A pillar `h` high from the ground and its cap; returns the cap's top. */
  const pillar = (x: number, z: number, w: number, h: number, faceX: boolean) => {
    box(plain, faceX ? 0.46 : w, h, faceX ? w : 0.46, x, Y - 0.02, z, c.stone);
    box(plain, (faceX ? 0.46 : w) + 0.08, 0.1, (faceX ? w : 0.46) + 0.08, x, Y - 0.02 + h, z, c.stoneDark);
    if (!lite) for (let k = 1; k < 4; k++) box(plain, (faceX ? 0.47 : w + 0.01), 0.025, (faceX ? w + 0.01 : 0.47), x, Y + k * (h / 4), z, c.stoneDark);   // the courses' joints
    return Y - 0.02 + h + 0.1;
  };
  for (let x = -7.4; x > -ex + 1.5; x -= 3.7) pillar(x, E - T / 2 + 0.04, 0.5, top + 0.12 - Y, false);   // (the one at x −3.7 gave way to the main entrance's portal)
  pillar(ex - T / 2 + 0.04, E - T / 2 + 0.04, 0.7, top + 0.3 - Y, false);
  pillar(-ex + T / 2 - 0.04, E - T / 2 + 0.04, 0.6, top + 0.2 - Y, false);
  for (let z = 6.6, k = 0; z > -eb + 1.5; z = k < 3 ? [1.2, -4.2, -8.4][k] : z - 4.2, k++) pillar(ex - T / 2 + 0.04, z, 0.5, top + 0.12 - Y, true);
  for (const x of [GATE.x0 - 0.3, GATE.x1 + 0.3]) {
    const cap = pillar(x, E - T / 2 + 0.04, 0.6, top + 0.35 - Y, false);
    box(plain, 0.34, 0.06, 0.34, x, cap, E - T / 2 + 0.04, c.frame);                                  // the lantern on top: its base, glass and roof
    box(bulbs, 0.27, 0.26, 0.27, x, cap + 0.06, E - T / 2 + 0.04, c.bulb);
    box(plain, 0.38, 0.05, 0.38, x, cap + 0.32, E - T / 2 + 0.04, c.frame);
  }
  solid(GATE.x0 - 0.6, E - T - 0.05, GATE.x0, E - ci, top + 0.35); solid(GATE.x1, E - T - 0.05, GATE.x1 + 0.6, E - ci, top + 0.35);
  // the plaque with the house's name and the intercom on the west gate pillar, a letter box
  if (!lite) {
    box(plain, 0.42, 0.24, 0.03, GATE.x0 - 0.3, 1.55, E + 0.06, c.plaque);
    box(plain, 0.36, 0.04, 0.035, GATE.x0 - 0.3, 1.62, E + 0.065, c.brass);
    box(plain, 0.13, 0.2, 0.04, GATE.x0 - 0.3, 1.12, E + 0.06, c.frame);
    box(plain, 0.3, 0.22, 0.05, GATE.x0 - 1.1, 1.05, E + 0.04, c.frame);
  }
  // bougainvillea over the wall's top (the street sees it spill), climbing up the corner: [x, z, size, the wall it sits on]
  const blooms: [number, number, number, 'street' | 'back' | 'side'][] = [[-10.2, s, 0.9, 'street'], [-8.6, s, 0.75, 'street'], [-5.5, s, 0.85, 'street'], [-0.5, s, 0.7, 'street'], [9.3, s, 0.7, 'street'],
    [xs, 9.0, 0.8, 'side'], [xs, 4.2, 0.7, 'side'], [xs, -6.6, 0.75, 'side'], [-xs, 7.4, 0.7, 'side'], [-6.2, -zb, 0.7, 'back']];
  // a cushion of leaves and a few rounder clusters of flowers over it, one spilling down the street side (finer blobs than the street's own)
  blooms.forEach(([x, z, r, on], k) => {
    if (lite && k % 2) return;
    const a = on === 'side' ? { dx: 0, dz: 1, out: 0 } : { dx: 1, dz: 0, out: on === 'street' ? 1 : -1 }, dt = lite ? 0 : 1;
    d.blob(leaves, r * 0.8, x, top - 0.1, z, c.hedge, 0.5, dt);
    for (const [t, dy, rr] of [[-0.45, 0.12, 0.55], [0.1, 0.22, 0.62], [0.55, 0.08, 0.5]] as const) {
      d.blob(leaves, r * rr, x + a.dx * t * r, top + dy, z + a.dz * t * r, (k + Math.round(t * 4)) % 3 ? c.bloom : c.bloom2, 0.75, dt);
    }
    if (!lite && a.out) d.blob(leaves, r * 0.42, x + 0.2, top - 0.6, z + a.out * 0.32, c.bloom2, 1.3, 1);   // spilling over on the street side
  });
}

/**
 * The car gate (GATE): telescopic (round 2), two slatted anthracite half panels on two tracks, its own mesh; open, it stows between the main
 * entrance and the gate (`slideGate`). Its box shuts the opening from its west end, as before; the dropped kerb before it, its pools of light.
 */
export function drawCarGate(d: Draw): GateRig {
  const { plain, lite, c, f, box, light } = d, Y = GROUND, ci = 0.05;
  // Opening, the east panel slides the whole way (`travel`, the mesh's own move) and the west one half of it (its vertices, `slideGate`): both end
  // stacked between the main entrance and the gate, so the open gate never crosses the entrance. What still shuts the opening is one span from its
  // west end, as before.
  const gw = GATE.x1 - GATE.x0 + 0.2, gx = (GATE.x0 + GATE.x1) / 2, half = gw / 2 + 0.1;
  const gatePanel = (b: Batch, x0: number, z: number) => {
    const w = half, cx = x0 + w / 2;
    box(b, w, 0.08, 0.1, cx, Y + 0.06, z, c.frame);                                                     // bottom rail
    box(b, w, 0.08, 0.1, cx, Y + GATE_H - 0.02, z, c.frame);                                            // top rail
    for (const dx of [-w / 2 + 0.05, w / 2 - 0.05]) box(b, 0.1, GATE_H, 0.1, cx + dx, Y + 0.06, z, c.frame);   // stiles
    const slats = lite ? 7 : 11, pitch = (GATE_H - 0.2) / slats;
    for (let k = 0; k < slats; k++) box(b, w - 0.12, pitch * 0.72, 0.05, cx, Y + 0.15 + k * pitch, z + 0.02, c.slat);
    for (const dx of [-w / 4, w / 4]) box(b, 0.06, 0.1, 0.1, cx + dx, Y, z, c.rail);                   // the wheels on the track
  };
  const gWest = new Batch(), gEast = new Batch();
  gatePanel(gWest, GATE.x0 - 0.1, GATE_Z); gatePanel(gEast, GATE.x1 + 0.1 - half, GATE_Z - GATE_DZ);
  const mWest = gWest.build(d.metalMat, true, true)!, mEast = gEast.build(d.metalMat, true, true)!;
  const gateGeo = mergeGeometries([mWest.geometry, mEast.geometry], false)!;
  mWest.geometry.dispose(); mEast.geometry.dispose();
  const travel = gw + 0.1;
  gateGeo.computeBoundingSphere(); gateGeo.boundingSphere!.radius += travel / 2;                       // (the west half moves within the mesh)
  const mesh = new THREE.Mesh(gateGeo, d.metalMat); mesh.receiveShadow = mesh.castShadow = true; mesh.name = 'villa-gate';
  const pos = gateGeo.attributes.position as THREE.BufferAttribute, westN = mWest.geometry.attributes.position.count;
  // which way it opens in the hub (the plan's −x), and the west half's vertices as drawn shut
  const o = f.p(0, 0), w = f.p(-1, 0), dir = { x: w.x - o.x, z: w.z - o.z };
  mesh.userData.telescope = { n: westN, x: Float32Array.from({ length: westN }, (_, i) => pos.getX(i)), z: Float32Array.from({ length: westN }, (_, i) => pos.getZ(i)), travel, dir };
  const t0 = GATE.x1 + 0.1 - half - travel - 0.1, t1 = GATE.x1 + 0.25;                               // the two tracks, out to where the gate stows
  for (const z of [GATE_Z, GATE_Z - GATE_DZ]) box(plain, t1 - t0, 0.03, 0.12, (t0 + t1) / 2, 0.145, z, c.rail);
  const collider: Collider = { ...f.rect(GATE.x0, GATE_Z - GATE_DZ - 0.12, GATE.x1, E - ci), h: GATE_H };
  d.colliders.push(collider);
  // the dropped kerb in front of the gate (a car rolls up over the pavement), its light pool
  box(plain, GATE.x1 - GATE.x0 + 1.6, 0.153, 2.15, gx, 0, E + 1.07, c.apron);
  light(gx, E + 1.2, 2.3, 0.18); light(GATE.x0 - 0.3, E + 0.6, 1.1, 0.19); light(GATE.x1 + 0.3, E + 0.6, 1.1, 0.19);
  const a = f.p(GATE.x0, GATE.z), b = f.p(GATE.x1, GATE.z);
  return { mesh, collider, travel, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z: a.z };
}

/** The front yard's lawns (mown stripes), either side of the driveway and in the side strips by the house. */
export function drawLawns(d: Draw) {
  const { plain, lite, c, ex, box, flat } = d, fy0 = HOUSE.z1, fy1 = E - T;
  const lawn = (x0: number, x1: number, z0: number, z1: number) => {
    box(plain, x1 - x0, 0.145, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, c.lawn);
    if (lite) return;
    for (let x = x0 + 0.6, k = 0; x < x1 - 0.3; x += 1.2, k++) if (k % 2) flat(plain, Math.min(1.2, x1 - x), z1 - z0 - 0.1, x, 0.155, (z0 + z1) / 2, c.lawn2);
  };
  lawn(-ex + T, DRIVE.x0, fy0, fy1); lawn(DRIVE.x1, ex - T, fy0, fy1);
  lawn(-ex + T, HOUSE.x0, STRIP_Z + T / 2, fy0); lawn(HOUSE.x1, ex - T, STRIP_Z + T / 2, fy0);
}
/** The driveway from the gate to the bays (paving slabs), the two bays' lines (BAYS, 2.6 × 5.4 m) and their wheel stops. */
export function drawBays(d: Draw) {
  const { plain, pave, c, box, flat } = d, fy0 = HOUSE.z1, fy1 = E - T;
  box(pave, DRIVE.x1 - DRIVE.x0, 0.16, fy1 - fy0 + T, (DRIVE.x0 + DRIVE.x1) / 2, 0, (fy0 + fy1 + T) / 2, c.drive);
  const bayHalf = 1.3, bayLen = 5.4;
  for (const b of BAYS) {
    for (const sx of [-1, 1]) flat(plain, 0.1, bayLen, b.x + sx * bayHalf, 0.17, b.z, c.line);
    flat(plain, bayHalf * 2 + 0.1, 0.1, b.x, 0.17, b.z - bayLen / 2, c.line);
    box(plain, 1.5, 0.1, 0.18, b.x, 0.15, b.z - bayLen / 2 + 0.45, c.stop);
  }
}
/**
 * The front garden: the forecourt along the house to the front door, the porch step, the stepping stones across the lawn from the gate to the main
 * entrance's path (round 2: they stop at its edge, the walk ENTRY_WALK kept clear), the planted bed along the house, the hedge inside the street
 * wall (leaving the path), the garden bollards and their pools at night, the porch light's pool. (Its lawns: `drawLawns`; its palms: `drawFrontPalms`.)
 */
export function drawFrontGarden(d: Draw) {
  const { plain, pave, leaves, bulbs, lite, c, ex, box, solid, light } = d, Y = GROUND, fy0 = HOUSE.z1, fy1 = E - T;
  const fx0 = FRONT_DOOR.x - 1.5;
  box(pave, DRIVE.x0 - fx0, 0.17, 1.7, (fx0 + DRIVE.x0) / 2, 0, fy0 + 0.85, c.fore);
  box(plain, FRONT_DOOR.width + 0.9, 0.26, 0.7, FRONT_DOOR.x, 0, fy0 + 0.35, c.step);
  const stones: [number, number][] = [[0.6, 9.9], [-0.1, 9.05], [-0.8, 8.2], [-1.45, 7.4]];
  stones.forEach(([x, z], k) => box(plain, 0.85, 0.165, 0.5, x, 0, z, c.step, 0.62 + (k % 2) * 0.08));
  // the bed along the house, west of the door: a low stone planter and its shrubs
  const bedX0 = HOUSE.x0 + 0.1, bedX1 = fx0 - 0.15;
  box(plain, bedX1 - bedX0, 0.42, 0.9, (bedX0 + bedX1) / 2, Y - 0.02, fy0 + 0.45, c.stone);
  box(plain, bedX1 - bedX0 - 0.12, 0.05, 0.78, (bedX0 + bedX1) / 2, Y + 0.38, fy0 + 0.45, c.bed);
  for (let x = bedX0 + 0.5, k = 0; x < bedX1 - 0.3; x += lite ? 1.4 : 0.8, k++) d.blob(leaves, 0.42, x, Y + 0.6, fy0 + 0.45, k % 2 ? c.hedge : c.hedge2, 0.8, 0);
  solid(bedX0, fy0, bedX1, fy0 + 0.9, 0.5);
  // the hedge along the street wall's inside, west of the gate
  for (let x = -ex + T + 0.5, k = 0; x < -1.2; x += lite ? 1.5 : 0.95, k++) {     // (clear of the gate's panels stowed behind the wall)
    if (x + 0.5 > ENTRY_WALK.x0 - 0.1) continue;                            // round 2: the main entrance's path goes through it
    d.blob(leaves, 0.5, x, Y + 0.35, fy1 - 0.72, k % 2 ? c.hedge : c.hedge2, 0.9, 0);
  }
  // garden bollards along the forecourt and the driveway, their pools at night
  const bollards: [number, number][] = [[fx0 - 0.1, fy0 + 1.95], [-0.6, fy0 + 1.95], [DRIVE.x0 - 0.15, 7.6], [DRIVE.x0 - 0.15, 10.2], [DRIVE.x1 + 0.15, 7.6], [DRIVE.x1 + 0.15, 10.2]];
  for (const [x, z] of bollards) {
    box(plain, 0.13, 0.62, 0.13, x, Y, z, c.post);
    box(bulbs, 0.1, 0.08, 0.14, x, Y + 0.5, z, c.bulb);
    light(x, z, 2.2, 0.175);
  }
  light(FRONT_DOOR.x, fy0 + 0.9, 2.4, 0.185);                                // the porch light's pool
}
/** A palm of our own (drawn without random numbers): its trunk in three drums, its fronds, its canopy for the camera, its solid foot, its uplight. */
export function drawPalm(d: Draw, x: number, z: number, sc: number, turn: number) {
  const { trunks, leaves, lite, c, f } = d, Y = GROUND;
  const h = 6.2 * sc;
  for (let k = 0; k < 3; k++) d.cyl(trunks, 0.17 * sc + (2 - k) * 0.03, 0.2 * sc + (2 - k) * 0.035, h / 3 + 0.05, x + k * 0.04, Y + (k * h) / 3, z, k === 1 ? c.bark2 : c.bark, 6);
  const tx = x + 0.12, tz = z, ty = Y + h, top = f.p(tx, tz);
  const asDrawn = f.facing === 'south' && !f.mirror;
  for (let k = 0; k < (lite ? 7 : 10); k++) {
    const a = turn + (k / (lite ? 7 : 10)) * Math.PI * 2, len = 3.3 * sc, r = len * 0.45;
    // (the flagship's fronds measured from its crown in the hub, as they always were; in another frame, from the plan)
    const q = asDrawn ? { x: top.x + Math.sin(a) * r, z: top.z + Math.cos(a) * r } : f.p(tx + Math.sin(a) * r, tz + Math.cos(a) * r);
    leaves.box(0.7 * sc, 0.1 * sc, len, q.x, ty - 0.35 * sc - (k % 2) * 0.25, q.z, k % 2 ? c.frond2 : c.frond, f.rot(a));
  }
  leaves.blob(0.42 * sc, top.x, ty - 0.1, top.z, c.heart, 1, 0);
  d.canopies.push({ x: top.x, z: top.z, r: 3.2 * sc, y0: ty - 0.8 * sc, y1: ty + 0.3 * sc });
  d.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 3);
  d.light(x + 0.4, z + 0.4, 2.1, 0.17);                                      // the uplight at its foot
}
/** The front garden's four palms (two by the main entrance's path, two on the cross street's side). */
export function drawFrontPalms(d: Draw) {
  drawPalm(d, -8.5, 7.4, 1.05, 0.2); drawPalm(d, -5.6, 9.6, 0.9, 0.9); drawPalm(d, d.ex - 1.6, 6.4, 1.0, 0.5); drawPalm(d, d.ex - 1.6, 1.8, 0.85, 1.3);
}
/**
 * The house on its lot: the façade (lane V-S's, src/housing/villaFacade.ts, drawn from the villa's plan), solid up to its parapet, and the helicopter
 * (src/world/helicopter.ts `buildHelicopter`) on its roof pad (HELIPAD), its nose toward the street.
 */
export function placeHouse(d: Draw, o: CompoundOptions['house'] = {}): { facade: THREE.Object3D; heli: THREE.Object3D | null } {
  const { f } = d, Y = GROUND, roof = o.roof ?? 2 * STOREY;
  const facade = (o.facade ?? buildVillaFacade)();
  facade.position.set(f.at.x, Y, f.at.z);
  if (f.turn) facade.rotation.y = f.turn;
  if (f.mirror) facade.scale.x = -1;
  d.solid(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1, roof + PARAPET);
  if (o.heli === false) return { facade, heli: null };
  const heli = buildHelicopter(), q = f.p(HELIPAD.x, HELIPAD.z);
  heli.group.position.set(q.x, Y + roof, q.z);
  if (f.turn) heli.group.rotation.y = f.turn;
  return { facade, heli: heli.group };
}
/**
 * The back garden as the interior has it (BACK_GARDEN, POOL), seen from outside: the deck, the pool's white coping and its water a little below
 * (`pool` false: the deck runs over its place), its glow at night, three teak loungers and a parasol, potted plants by the terrace doors, the
 * back hedge, two palms in the back corners.
 */
export function drawPoolDeck(d: Draw, pool = true) {
  const { plain, water, leaves, lite, c, ex, eb, box, light } = d, Y = GROUND;
  const gx0 = -ex, gx1 = ex, bz0 = -eb + T, bz1 = BACK_GARDEN.z1, deckTop = 0.22;
  box(plain, gx1 - gx0 - 2 * T, deckTop, POOL.z0 - bz0, 0, 0, (bz0 + POOL.z0) / 2, c.deck);
  box(plain, gx1 - gx0 - 2 * T, deckTop, bz1 - POOL.z1, 0, 0, (POOL.z1 + bz1) / 2, c.deck);
  box(plain, POOL.x0 - gx0 - T, deckTop, POOL.z1 - POOL.z0, (gx0 + T + POOL.x0) / 2, 0, (POOL.z0 + POOL.z1) / 2, c.deck);
  box(plain, gx1 - T - POOL.x1, deckTop, POOL.z1 - POOL.z0, (POOL.x1 + gx1 - T) / 2, 0, (POOL.z0 + POOL.z1) / 2, c.deck);
  // the pool: its white coping, the water a little below it, its glow at night
  const pw = POOL.x1 - POOL.x0, pd = POOL.z1 - POOL.z0, pcx = (POOL.x0 + POOL.x1) / 2, pcz = (POOL.z0 + POOL.z1) / 2;
  if (pool) {
    for (const [w, dd, x, z] of [[pw + 0.7, 0.35, pcx, POOL.z0 - 0.175], [pw + 0.7, 0.35, pcx, POOL.z1 + 0.175], [0.35, pd, POOL.x0 - 0.175, pcz], [0.35, pd, POOL.x1 + 0.175, pcz]] as const) box(plain, w, deckTop + 0.04, dd, x, 0, z, c.rim);
    box(water, pw, 0.06, pd, pcx, deckTop - 0.11, pcz, c.water);
    light(pcx - 2.6, pcz, 2.6, deckTop - 0.03); light(pcx + 2.6, pcz, 2.6, deckTop - 0.03);
  } else box(plain, pw, deckTop, pd, pcx, 0, pcz, c.deck);
  // three loungers and a parasol on the east deck, facing the pool
  for (const lx of [5.6, 7.2, 8.8]) {
    const lz = -8.4;
    box(plain, 0.7, 0.28, 1.9, lx, deckTop, lz, c.teak);
    box(plain, 0.64, 0.08, 1.35, lx, deckTop + 0.28, lz + 0.25, c.cushion);
    box(plain, 0.64, 0.08, 0.75, lx, deckTop + 0.5, lz - 0.75, c.cushion);                              // the back rest (seen as a raised end)
  }
  d.cyl(plain, 0.04, 0.04, 2.3, 6.4, deckTop, -9.7, c.post, 6);
  d.cyl(plain, 0.05, 1.5, 0.45, 6.4, deckTop + 2.05, -9.7, c.canvas, 8);
  // potted plants by the terrace doors, the back hedge, two palms in the back corners
  for (const px of [-7.2, 2.6]) { box(plain, 0.5, 0.55, 0.5, px, deckTop, BACK_GARDEN.z1 - 0.45, c.stone); d.blob(leaves, 0.42, px, deckTop + 0.85, BACK_GARDEN.z1 - 0.45, c.hedge2, 1, 0); }
  for (let x = -ex + T + 0.6, k = 0; x < ex - T - 0.4; x += lite ? 1.8 : 1.1, k++) d.blob(leaves, 0.5, x, Y + 0.35, bz0 + 0.3, k % 2 ? c.hedge : c.hedge2, 0.9, 0);
  drawPalm(d, -ex + 1.5, -eb + 1.6, 1.1, 0.4); drawPalm(d, ex - 1.5, -eb + 1.4, 1.0, 1.1);
}

/** Where the main entrance stands: its opening in the street wall (z: the wall's street face), the walk to the house, where the path starts, its number. */
export interface EntranceAt { x0: number; x1: number; z: number; walk: { x0: number; x1: number }; path0: number; number: string }
/** A digit as the strokes of a seven-segment figure (a top, b c right, d bottom, e f left, g middle): the house number in bronze bars. */
const DIGIT: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/**
 * The main entrance (round 2, the owner's review: « a main door different from the car garage door, and easy access without going behind the car »),
 * in plan coordinates (+z toward the street):
 *  - a portal of the façade's travertine (its stone material, one draw call with the path) standing 0.8 m above the wall: two pillars proud of the
 *    wall on both faces, the lintel, a darker plinth; the opening lined in dark bronze like the house's front door;
 *  - the door: one pivoting leaf of teak in a bronze edge, grooved like the front door, a long bronze pull on both faces; its own mesh, its origin
 *    on the pivot (a quarter of a metre in from the opening's west edge: the long side swings into the garden, the short one out);
 *  - a slim white canopy capping the portal, its bronze fascia and a line of light in its soffit; the house number in bronze bars on the lintel; an
 *    intercom (camera, lit call button) on the east pillar; a light bar on each pillar's street face; a travertine threshold and apron on the pavement;
 *  - the path: a straight walk of travertine slabs edged in darker stone, from the portal to the forecourt (`path0`), lit by lights set flush in
 *    its edges (nothing stands on it);
 *  - at night: the bulbs (the street lamps' material) and pools of light on the apron, inside the door and along the path.
 * Solid: the pillars; the door's own boxes (`shut`, `open`) are handed back for the villa module to swap as the leaf swings.
 */
export function buildEntrance(d: Draw, o: Partial<EntranceAt> = {}): { stone: THREE.Mesh; rig: EntranceRig } {
  const def: EntranceAt = { x0: ENTRANCE.x0, x1: ENTRANCE.x1, z: ENTRANCE.z, walk: { x0: ENTRY_WALK.x0, x1: ENTRY_WALK.x1 }, path0: HOUSE.z1 + 1.7, number: HOUSE_NUMBER };
  const at: EntranceAt = { ...def, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) };
  const { plain, bulbs, lite, c, f, solid, light } = d, P = PORTAL, Y = GROUND, M = villaFacadeMaterials();
  const stone = new Batch(), leaf = new Batch();
  const ox0 = at.x0, ox1 = at.x1, cx = (ox0 + ox1) / 2, pw = P.pillar;
  const wz = at.z - T / 2, pz0 = wz - P.depth / 2, pz1 = wz + P.depth / 2;      // the wall's centre line; the portal's inner and street faces
  const sb = (b: Batch, w: number, h: number, dd: number, x: number, y: number, z: number, col: THREE.ColorRepresentation) => d.box(b, w, h, dd, x, y, z, col);
  // the travertine a little brighter than its vertex colour can say, as on the façade (src/housing/villaFacade.ts)
  const clad = new THREE.Color(c.clad).multiplyScalar(1.08), cladDark = new THREE.Color(c.clad === COMPOUND_PALETTE.clad ? 0xc9b48f : new THREE.Color(c.clad).multiplyScalar(0.88));
  // ------------------------------------------------ the portal
  for (const px of [ox0 - pw / 2, ox1 + pw / 2]) {
    sb(stone, pw, P.top - Y + 0.02, P.depth, px, Y - 0.02, wz, clad);
    sb(stone, pw + 0.03, 0.32, P.depth + 0.03, px, Y - 0.02, wz, cladDark);                            // the plinth
    solid(px - pw / 2, pz0, px + pw / 2, at.z - 0.05, P.top);
  }
  sb(stone, ox1 - ox0, P.top - P.door, P.depth, cx, P.door, wz, clad);                                    // the lintel
  // the opening lined in dark bronze (the pillars' inner faces, the lintel's soffit)
  for (const x of [ox0 + 0.015, ox1 - 0.015]) sb(plain, 0.03, P.door - P.sill, P.depth + 0.01, x, P.sill, wz, c.bronze);
  sb(plain, ox1 - ox0, 0.03, P.depth + 0.01, cx, P.door - 0.03, wz, c.bronze);
  // the threshold, the apron on the pavement, the landing inside
  sb(stone, ox1 - ox0, P.sill, P.depth, cx, 0, wz, clad);
  sb(stone, ox1 - ox0 + 2 * pw + 0.7, 0.15, 1.3, cx, 0, at.z + 0.65, clad);
  // ------------------------------------------------ the canopy: a thin white slab on the portal, its bronze fascia, a line of light in its soffit
  // (one piece each: what stands out over the pavement is drawn joined to what stands on the lot, so the street's digest of everything off the lot,
  // tests/helpers/lotDigest.ts, is unchanged)
  const cw = ox1 - ox0 + 2 * pw + 0.4, cz1 = pz1 + 1.05;
  d.joined(plain, [[cw, 0.1, cz1 - pz0, cx, P.top, (pz0 + cz1) / 2, c.slab], [cw + 0.01, 0.035, 0.02, cx, P.top + 0.03, cz1 + 0.01, c.bronze]]);
  d.joined(bulbs, [[0.05, 0.012, cz1 - pz1 - 0.15, cx, P.top - 0.012, pz1 + (cz1 - pz1 - 0.15) / 2, c.bulb]]);
  // ------------------------------------------------ the house number on the lintel: dark bronze bars, 30 cm high (read from the street, so never mirrored)
  {
    const h = 0.3, w = 0.17, t = 0.03, gap = 0.09, y0 = (P.door + P.top) / 2 - h / 2, zf = pz1 + 0.006, n = at.number.length, m = f.mirror ? -1 : 1;
    at.number.split('').forEach((ch, i) => {
      const x0 = cx - m * ((n * w + (n - 1) * gap) / 2 - i * (w + gap)) - (m < 0 ? w : 0);
      for (const seg of DIGIT[ch] ?? '') {
        // (b, c on the digit's right as seen from the street: its +x in the plan, its −x once mirrored)
        const R = m > 0 ? x0 + w - t / 2 : x0 + t / 2, L = m > 0 ? x0 + t / 2 : x0 + w - t / 2;
        const H = (y: number) => sb(plain, w, t, 0.012, x0 + w / 2, y, zf, c.bronze), V = (x: number, y: number) => sb(plain, t, h / 2, 0.012, x, y, zf, c.bronze);
        if (seg === 'a') H(y0 + h - t); else if (seg === 'g') H(y0 + h / 2 - t / 2); else if (seg === 'd') H(y0);
        else if (seg === 'b') V(R, y0 + h / 2); else if (seg === 'c') V(R, y0);
        else if (seg === 'f') V(L, y0 + h / 2); else V(L, y0);
      }
    });
  }
  // ------------------------------------------------ the light bars on the pillars' street faces, the intercom on the east one
  for (const px of [ox0 - pw / 2, ox1 + pw / 2]) {
    sb(plain, 0.09, 0.9, 0.035, px, 1.55, pz1 + 0.0175, c.bronze);
    sb(bulbs, 0.04, 0.82, 0.02, px, 1.59, pz1 + 0.04, c.bulb);
  }
  {
    const ex = ox1 + pw / 2, zf = pz1;
    sb(plain, 0.15, 0.3, 0.03, ex, 1.03, zf + 0.015, c.frame);
    sb(plain, 0.04, 0.04, 0.012, ex, 1.25, zf + 0.036, c.glassDark);                                     // the camera
    if (!lite) for (const y of [1.15, 1.17, 1.19]) sb(plain, 0.08, 0.006, 0.006, ex, y, zf + 0.033, c.rail);   // the speaker
    sb(bulbs, 0.045, 0.045, 0.012, ex, 1.07, zf + 0.036, c.bulb);                                        // the call button, lit
  }
  light(cx, at.z + 1.1, 2.3, 0.17); light(cx, pz0 - 0.7, 1.9, 0.19);
  // ------------------------------------------------ the path: travertine slabs edged in darker stone, lights flush in its edges
  const wx0 = at.walk.x0 + 0.15, wx1 = at.walk.x1 - 0.15, pcx = (wx0 + wx1) / 2;
  sb(stone, wx1 - wx0, 0.175, pz0 - at.path0, pcx, 0, (at.path0 + pz0) / 2, clad);
  for (const x of [wx0 - 0.04, wx1 + 0.04]) sb(plain, 0.08, 0.18, pz0 - at.path0, x, 0, (at.path0 + pz0) / 2, c.stoneDark);
  for (let i = 0, z = at.path0 + 0.8; z < pz0 - 0.5; i++, z += 1.05) {
    const x = i % 2 ? wx1 + 0.04 : wx0 - 0.04;
    sb(bulbs, 0.06, 0.185, 0.16, x, 0, z, c.bulb);
    light(x + (i % 2 ? -0.3 : 0.3), z, 1.3, 0.19);
  }
  // ------------------------------------------------ the door: one pivoting leaf (its own mesh, about the pivot)
  const lx0 = ox0 + 0.035, lx1 = ox1 - 0.035, lw = lx1 - lx0, lcx = (lx0 + lx1) / 2, lh = P.door - 0.035 - P.sill, piv = { x: ox0 + P.pivot, z: wz };
  sb(leaf, lw, lh, 0.07, lcx, P.sill, wz, c.door);
  for (let j = 1; j < 8; j++) sb(leaf, 0.014, lh - 0.2, 0.074, lx0 + (j / 8) * lw, P.sill + 0.1, wz, c.groove);   // the boards' grooves, both faces
  sb(leaf, lw, 0.03, 0.076, lcx, P.sill, wz, c.bronze); sb(leaf, lw, 0.03, 0.076, lcx, P.sill + lh - 0.03, wz, c.bronze);   // its bronze edge
  for (const x of [lx0 + 0.015, lx1 - 0.015]) sb(leaf, 0.03, lh, 0.076, x, P.sill, wz, c.bronze);
  for (const sz of [-1, 1]) {                                                                             // the long pull, both faces
    sb(leaf, 0.035, 1.3, 0.035, lx1 - 0.22, 0.75, wz + sz * 0.085, c.pull);
    for (const y of [0.88, 1.88]) sb(leaf, 0.025, 0.03, 0.05, lx1 - 0.22, y, wz + sz * 0.06, c.pull);
  }
  const door = leaf.build(M.trim, true, true)!, pv = f.p(piv.x, piv.z);
  door.geometry.translate(-pv.x, 0, -pv.z); door.geometry.computeBoundingSphere();
  door.position.set(pv.x, 0, pv.z); door.name = 'villa-entrance-door';
  door.userData.swing = f.mirror ? -1 : 1;                                   // (mirrored, the leaf turns the other way to swing into the garden)
  // its boxes: shut, the opening in the wall's thickness; open (the leaf at 90°, its long side in the garden), a thin box along it, its pulls in
  const shut: Collider = { ...f.rect(ox0, at.z - T, ox1, at.z - 0.05), h: P.door };
  const open: Collider = { ...f.rect(piv.x - 0.11, piv.z - (lx1 - piv.x) - 0.02, piv.x + 0.11, piv.z + (piv.x - lx0) + 0.02), h: P.door };
  const mesh = stone.build(M.stone, true, true)!; mesh.name = 'villa-entrance';
  const a = f.p(ox0, at.z), b = f.p(ox1, at.z);
  return { stone: mesh, rig: { mesh: door, shut, open, pivot: pv, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z: a.z } };
}

/** The car gate at `k` open (0 shut … 1): the east half slides the whole travel (the mesh), the west half half of it (its own vertices). */
export function slideGate(mesh: THREE.Object3D, travel: number, k: number) {
  const t = mesh.userData.telescope as { n: number; x: Float32Array; z: Float32Array; dir: { x: number; z: number } } | undefined, geo = (mesh as THREE.Mesh).geometry;
  const dir = t?.dir ?? { x: -1, z: 0 };
  mesh.position.x = dir.x * travel * k;
  if (dir.z) mesh.position.z = dir.z * travel * k;
  if (!t || !geo) return;
  const pos = geo.attributes.position as THREE.BufferAttribute, back = (travel * k) / 2;
  for (let i = 0; i < t.n; i++) { pos.setX(i, t.x[i] - dir.x * back); if (dir.z) pos.setZ(i, t.z[i] - dir.z * back); }
  pos.needsUpdate = true;
}
/** The main entrance's door at `k` open (0 shut … 1). */
export function swingEntrance(mesh: THREE.Object3D, k: number) { mesh.rotation.y = ((mesh.userData.swing as number | undefined) ?? 1) * entranceAngle(k); }
