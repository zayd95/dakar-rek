import * as THREE from 'three';
import { Batch } from './batch';
import type { Canopy, Collider, KeepClear } from './types';
import { BACK_GARDEN, BAYS, FRONT_DOOR, GATE, HELIPAD, HOUSE, LOT, PARAPET, POOL, STOREY, WALL_H } from '../housing/villa';
import { buildVillaFacade } from '../housing/villaFacade';
import { buildHelicopter } from './helicopter';

/**
 * LD2.0-D « Owner flagship villa » (docs/ld2/LD2_D.md), lane V-E: the villa's street compound on the Almadies block (1,1) lot 3, built by
 * src/world/builder.ts in place of the generic villa that stood there (whose random draws it still makes, unseen, so every other lot and the
 * street dressing stay where they were).
 *
 *  - The boundary wall on the lot's four edges (WALL_H, a stone plinth, a coping, travertine pillars on the two street faces, bougainvillea over
 *    the top), solid; the side strips closed by a wall from the house to the boundary, so a visitor from the street stays in the front yard.
 *  - The sliding gate (GATE): a slatted anthracite panel on its track, its own mesh; the villa module (src/villa/villaModule.ts) slides it open
 *    for the villa's people and back, and keeps its collider (`gate.collider`) in step. Lantern pillars either side, a dropped kerb in front.
 *  - The front yard: the paved driveway and the two marked bays (BAYS) with their wheel stops, the forecourt to the front door (FRONT_DOOR) and
 *    stepping stones across the lawn from the gate, mown stripes, palms, a planted bed along the house, garden bollards; at night their pools
 *    of light join the street lamps' (the hub's `pool`), the bulbs the street lamps' material.
 *  - The house: lane V-S's facade (src/housing/villaFacade.ts) on the lot, solid, and the helicopter (src/world/helicopter.ts) on its roof pad
 *    (HELIPAD, y = 2 × STOREY above the ground).
 *  - The back garden as the interior has it (BACK_GARDEN, POOL): the deck, the pool's coping and water, loungers and a parasol, two palms.
 *
 * Plan coordinates (src/housing/villa.ts) are metres from the lot's centre, +z toward the street; the hub's ground is y 0.1. Everything static
 * goes into the hub's own merged batches (the kit), so the compound costs the Almadies view no draw call of its own but the gate (1), the facade
 * and the helicopter (2). No random number is drawn here.
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
export interface VillaCompound {
  /** The gate, the house and the helicopter (each with its own material). */
  group: THREE.Group;
  colliders: Collider[];
  canopies: Canopy[];
  /** Ground kept open: the lot itself and the kerb in front of the gate (no parked car or stall across the way in). */
  keepClear: KeepClear[];
  gate: GateRig;
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
const E = LOT.w / 2;                       // 11: the lot's half size
/** The side strips' walls, from the house's side walls to the boundary (plan z). */
export const STRIP_Z = -1.05;
/** The gate's slatted panel: its height and the plane it slides in (just inside the street wall). */
const GATE_H = 2.25, GATE_Z = E - T - 0.12;

const C = {
  wall: 0xf2ede3, plinth: 0xa99c86, coping: 0xdcd6c8, stone: 0xcdbb9b, stoneDark: 0xb7a482,
  drive: 0xc9c2b4, fore: 0xe6dece, step: 0xd6cdbb, line: 0xf4f2ec, stop: 0xb9b4aa, apron: 0xbcb5a7,
  lawn: 0x6e9e44, lawn2: 0x79aa4c, bed: 0x5b4636, hedge: 0x3e6d2e, hedge2: 0x4b7d36, bloom: 0xc2307a, bloom2: 0xd94a8c,
  deck: 0xdccfb6, rim: 0xf4f1ea, water: 0x2fa8d8, teak: 0x7a5434, cushion: 0xf3efe6, canvas: 0xefe8da, post: 0x2c2d30, bulb: 0xfff1c8,
  slat: 0x34383d, frame: 0x26292d, rail: 0x5b5f64, plaque: 0x1f2226, brass: 0xc9a14b,
};

export function buildVillaCompound(kit: CompoundKit): VillaCompound {
  const { plain, pave, leaves, trunks, water, bulbs, lite } = kit;
  const X = (x: number) => LOT.cx + x, Z = (z: number) => LOT.cz + z, Y = GROUND;
  const colliders: Collider[] = [], canopies: Canopy[] = [];
  /** A solid box of the plan (x0…x1, z0…z1), `h` high. */
  const solid = (x0: number, z0: number, x1: number, z1: number, h: number) => { const c = { x0: X(Math.min(x0, x1)), z0: Z(Math.min(z0, z1)), x1: X(Math.max(x0, x1)), z1: Z(Math.max(z0, z1)), h }; colliders.push(c); return c; };
  /** A box of the plan: centre (x, z), size w × d, from y up `h`. */
  const box = (b: Batch, w: number, h: number, d: number, x: number, y: number, z: number, col: number, rot = 0) => b.box(w, h, d, X(x), y, Z(z), col, rot);
  const flat = (b: Batch, w: number, d: number, x: number, y: number, z: number, col: number, rot = 0) => b.flat(w, d, X(x), y, Z(z), col, rot);
  const light = (x: number, z: number, r: number, y = 0.2) => kit.pool(X(x), Z(z), r, y);

  // ------------------------------------------------------------------------------------------------ the boundary wall
  const top = WALL_H, wallH = top - Y;
  /** A straight run of wall between (x0, z0) and (x1, z1) along an axis, its plinth and coping; `street`: the face seen from the road (+z or +x). */
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const w = alongX ? len : T, d = alongX ? T : len;
    box(plain, w, wallH, d, cx, Y, cz, C.wall);
    box(plain, w + (alongX ? 0 : 0.04), 0.55, d + (alongX ? 0.04 : 0), cx, Y - 0.02, cz, C.plinth);
    box(plain, w + (alongX ? 0.02 : 0.12), 0.09, d + (alongX ? 0.12 : 0.02), cx, top, cz, C.coping);
  };
  const s = E - T / 2;                                                       // the wall's centre line
  run(-E, s, GATE.x0, s); run(GATE.x1, s, E, s);                            // the street wall either side of the gate
  run(s, -E, s, E);                                                          // the east wall (on the cross street: the lot is a corner)
  run(-s, -E, -s, E);                                                        // the west wall (the neighbour's lot)
  run(-E, -s, E, -s);                                                        // the back wall
  const ci = 0.05;                                                           // colliders 5 cm inside the outer face
  solid(-E + ci, E - T, GATE.x0, E - ci, top); solid(GATE.x1, E - T, E - ci, E - ci, top);
  solid(E - T, -E + ci, E - ci, E - ci, top); solid(-E + ci, -E + ci, -E + T, E - ci, top); solid(-E + ci, -E + ci, E - ci, -E + T, top);
  // the side strips closed from the house to the boundary: the back garden is the interior's (src/housing/villa.ts BACK_GARDEN)
  for (const sx of [-1, 1]) {
    const a = sx * HOUSE.x1, b = sx * (E - T);
    run(Math.min(a, b), STRIP_Z, Math.max(a, b), STRIP_Z);
    solid(a, STRIP_Z - T / 2, b, STRIP_Z + T / 2, top);
  }
  // travertine pillars on the two street faces (the corner a big one), proud of the wall by 8 cm; the gate's pillars carry lanterns
  /** A pillar `h` high from the ground and its cap; returns the cap's top. */
  const pillar = (x: number, z: number, w: number, h: number, faceX: boolean) => {
    box(plain, faceX ? 0.46 : w, h, faceX ? w : 0.46, x, Y - 0.02, z, C.stone);
    box(plain, (faceX ? 0.46 : w) + 0.08, 0.1, (faceX ? w : 0.46) + 0.08, x, Y - 0.02 + h, z, C.stoneDark);
    if (!lite) for (let k = 1; k < 4; k++) box(plain, (faceX ? 0.47 : w + 0.01), 0.025, (faceX ? w + 0.01 : 0.47), x, Y + k * (h / 4), z, C.stoneDark);   // the courses' joints
    return Y - 0.02 + h + 0.1;
  };
  for (const x of [-7.4, -3.7]) pillar(x, E - T / 2 + 0.04, 0.5, top + 0.12 - Y, false);
  pillar(E - T / 2 + 0.04, E - T / 2 + 0.04, 0.7, top + 0.3 - Y, false);
  pillar(-E + T / 2 - 0.04, E - T / 2 + 0.04, 0.6, top + 0.2 - Y, false);
  for (const z of [6.6, 1.2, -4.2, -8.4]) pillar(E - T / 2 + 0.04, z, 0.5, top + 0.12 - Y, true);
  for (const x of [GATE.x0 - 0.3, GATE.x1 + 0.3]) {
    const cap = pillar(x, E - T / 2 + 0.04, 0.6, top + 0.35 - Y, false);
    box(plain, 0.34, 0.06, 0.34, x, cap, E - T / 2 + 0.04, C.frame);                                  // the lantern on top: its base, glass and roof
    box(bulbs, 0.27, 0.26, 0.27, x, cap + 0.06, E - T / 2 + 0.04, C.bulb);
    box(plain, 0.38, 0.05, 0.38, x, cap + 0.32, E - T / 2 + 0.04, C.frame);
  }
  solid(GATE.x0 - 0.6, E - T - 0.05, GATE.x0, E - ci, top + 0.35); solid(GATE.x1, E - T - 0.05, GATE.x1 + 0.6, E - ci, top + 0.35);
  // the plaque with the house's name and the intercom on the west gate pillar, a letter box
  if (!lite) {
    box(plain, 0.42, 0.24, 0.03, GATE.x0 - 0.3, 1.55, E + 0.06, C.plaque);
    box(plain, 0.36, 0.04, 0.035, GATE.x0 - 0.3, 1.62, E + 0.065, C.brass);
    box(plain, 0.13, 0.2, 0.04, GATE.x0 - 0.3, 1.12, E + 0.06, C.frame);
    box(plain, 0.3, 0.22, 0.05, GATE.x0 - 1.1, 1.05, E + 0.04, C.frame);
  }
  // bougainvillea over the wall's top (the street sees it spill), climbing up the corner
  const blooms: [number, number, number][] = [[-10.2, s, 0.9], [-8.6, s, 0.75], [-5.5, s, 0.85], [-1.8, s, 0.7], [9.3, s, 0.7], [s, 9.0, 0.8], [s, 4.2, 0.7], [s, -6.6, 0.75], [-s, 7.4, 0.7], [-6.2, -s, 0.7]];
  blooms.forEach(([x, z, r], k) => {
    if (lite && k % 2) return;
    leaves.blob(r * 0.85, X(x), top - 0.15, Z(z), C.hedge, 0.55, 0);
    leaves.blob(r, X(x + 0.25), top + 0.05, Z(z), k % 3 ? C.bloom : C.bloom2, 0.6, 0);
    if (!lite) leaves.blob(r * 0.6, X(x - 0.35), top - 0.55, Z(z + (z === s ? 0.35 : 0)), C.bloom2, 0.7, 0);
  });

  // ------------------------------------------------------------------------------------------------ the gate (its own mesh: it slides)
  const g = new Batch(), gw = GATE.x1 - GATE.x0 + 0.2, gx = (GATE.x0 + GATE.x1) / 2;
  g.box(gw, 0.08, 0.1, X(gx), Y + 0.06, Z(GATE_Z), C.frame);                                           // bottom rail
  g.box(gw, 0.08, 0.1, X(gx), Y + GATE_H - 0.02, Z(GATE_Z), C.frame);                                  // top rail
  for (const dx of [-gw / 2 + 0.05, gw / 2 - 0.05, 0]) g.box(0.1, GATE_H, 0.1, X(gx + dx), Y + 0.06, Z(GATE_Z), C.frame);   // stiles and the middle post
  const slats = lite ? 7 : 11, pitch = (GATE_H - 0.2) / slats;
  for (let k = 0; k < slats; k++) g.box(gw - 0.12, pitch * 0.72, 0.05, X(gx), Y + 0.15 + k * pitch, Z(GATE_Z + 0.02), C.slat);
  for (const dx of [-1.2, 1.2]) g.box(0.06, 0.1, 0.1, X(gx + dx), Y, Z(GATE_Z), C.rail);             // the wheels on the track
  const gateMesh = g.build(kit.metalMat, true, true)!; gateMesh.name = 'villa-gate';
  const travel = gw + 0.1;
  box(plain, travel + gw + 0.3, 0.03, 0.12, gx - travel / 2, 0.145, GATE_Z, C.rail);                      // the track, out along the wall's inside
  const gateCol: Collider = { x0: X(GATE.x0), z0: Z(GATE_Z - 0.12), x1: X(GATE.x1), z1: Z(E - ci), h: GATE_H };
  colliders.push(gateCol);
  // the dropped kerb in front of the gate (a car rolls up over the pavement), its light pool
  box(plain, GATE.x1 - GATE.x0 + 1.6, 0.153, 2.15, gx, 0, E + 1.07, C.apron);
  light(gx, E + 1.2, 2.3, 0.18); light(GATE.x0 - 0.3, E + 0.6, 1.1, 0.19); light(GATE.x1 + 0.3, E + 0.6, 1.1, 0.19);

  // ------------------------------------------------------------------------------------------------ the front yard
  const fy0 = HOUSE.z1, fy1 = E - T;                                         // between the house and the street wall
  // the lawn (mown stripes), its edge stones
  const lawn = (x0: number, x1: number, z0: number, z1: number) => {
    box(plain, x1 - x0, 0.145, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, C.lawn);
    if (lite) return;
    for (let x = x0 + 0.6, k = 0; x < x1 - 0.3; x += 1.2, k++) if (k % 2) flat(plain, Math.min(1.2, x1 - x), z1 - z0 - 0.1, x, 0.155, (z0 + z1) / 2, C.lawn2);
  };
  const driveX0 = BAYS[0].x - 1.6, driveX1 = BAYS[1].x + 1.6;               // the paving runs a little past the bays' outer lines
  lawn(-E + T, driveX0, fy0, fy1); lawn(driveX1, E - T, fy0, fy1);
  lawn(-E + T, HOUSE.x0, STRIP_Z + T / 2, fy0); lawn(HOUSE.x1, E - T, STRIP_Z + T / 2, fy0);
  // the driveway, from the gate to the bays (paving slabs), the bays' lines and wheel stops
  box(pave, driveX1 - driveX0, 0.16, fy1 - fy0 + T, (driveX0 + driveX1) / 2, 0, (fy0 + fy1 + T) / 2, C.drive);
  const bayHalf = 1.3, bayLen = 5.4;
  for (const b of BAYS) {
    for (const sx of [-1, 1]) flat(plain, 0.1, bayLen, b.x + sx * bayHalf, 0.17, b.z, C.line);
    flat(plain, bayHalf * 2 + 0.1, 0.1, b.x, 0.17, b.z - bayLen / 2, C.line);
    box(plain, 1.5, 0.1, 0.18, b.x, 0.15, b.z - bayLen / 2 + 0.45, C.stop);
  }
  // the forecourt along the house to the front door, the porch step, the stepping stones across the lawn from the gate
  const fx0 = FRONT_DOOR.x - 1.5;
  box(pave, driveX0 - fx0, 0.17, 1.7, (fx0 + driveX0) / 2, 0, fy0 + 0.85, C.fore);
  box(plain, FRONT_DOOR.width + 0.9, 0.26, 0.7, FRONT_DOOR.x, 0, fy0 + 0.35, C.step);
  const stones: [number, number][] = [[0.6, 9.9], [-0.1, 9.05], [-0.8, 8.2], [-1.5, 7.35], [-2.2, 6.5]];
  stones.forEach(([x, z], k) => box(plain, 0.85, 0.165, 0.5, x, 0, z, C.step, 0.62 + (k % 2) * 0.08));
  // the bed along the house, west of the door: a low stone planter and its shrubs
  const bedX0 = HOUSE.x0 + 0.1, bedX1 = fx0 - 0.15;
  box(plain, bedX1 - bedX0, 0.42, 0.9, (bedX0 + bedX1) / 2, Y - 0.02, fy0 + 0.45, C.stone);
  box(plain, bedX1 - bedX0 - 0.12, 0.05, 0.78, (bedX0 + bedX1) / 2, Y + 0.38, fy0 + 0.45, C.bed);
  for (let x = bedX0 + 0.5, k = 0; x < bedX1 - 0.3; x += lite ? 1.4 : 0.8, k++) leaves.blob(0.42, X(x), Y + 0.6, Z(fy0 + 0.45), k % 2 ? C.hedge : C.hedge2, 0.8, 0);
  solid(bedX0, fy0, bedX1, fy0 + 0.9, 0.5);
  // the hedge along the street wall's inside, west of the gate
  for (let x = -E + T + 0.5, k = 0; x < -1.2; x += lite ? 1.5 : 0.95, k++) leaves.blob(0.5, X(x), Y + 0.35, Z(fy1 - 0.72), k % 2 ? C.hedge : C.hedge2, 0.9, 0);   // (clear of the gate's panel sliding behind the wall)
  // garden bollards along the forecourt and the driveway, their pools at night
  const bollards: [number, number][] = [[fx0 - 0.1, fy0 + 1.95], [-0.6, fy0 + 1.95], [driveX0 - 0.15, 7.6], [driveX0 - 0.15, 10.2], [driveX1 + 0.15, 7.6], [driveX1 + 0.15, 10.2]];
  for (const [x, z] of bollards) {
    box(plain, 0.13, 0.62, 0.13, x, Y, z, C.post);
    box(bulbs, 0.1, 0.08, 0.14, x, Y + 0.5, z, C.bulb);
    light(x, z, 1.7, 0.175);
  }
  light(FRONT_DOOR.x, fy0 + 0.9, 1.8, 0.185);                                // the porch light's pool

  // ------------------------------------------------------------------------------------------------ palms (own, drawn without random numbers)
  const palm = (x: number, z: number, sc: number, turn: number) => {
    const h = 6.2 * sc;
    for (let k = 0; k < 3; k++) trunks.cyl(0.17 * sc + (2 - k) * 0.03, 0.2 * sc + (2 - k) * 0.035, h / 3 + 0.05, X(x + k * 0.04), Y + (k * h) / 3, Z(z), k === 1 ? 0x9a7b55 : 0x8a6d4a, 6);
    const tx = X(x + 0.12), tz = Z(z), ty = Y + h;
    for (let k = 0; k < (lite ? 7 : 10); k++) {
      const a = turn + (k / (lite ? 7 : 10)) * Math.PI * 2, len = 3.3 * sc, r = len * 0.45;
      leaves.box(0.7 * sc, 0.1 * sc, len, tx + Math.sin(a) * r, ty - 0.35 * sc - (k % 2) * 0.25, tz + Math.cos(a) * r, k % 2 ? 0x2f7f3e : 0x3d9450, a);
    }
    leaves.blob(0.42 * sc, tx, ty - 0.1, tz, 0x6b5a2a, 1, 0);
    canopies.push({ x: tx, z: tz, r: 3.2 * sc, y0: ty - 0.8 * sc, y1: ty + 0.3 * sc });
    solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 3);
    light(x + 0.4, z + 0.4, 1.7, 0.17);                                      // the uplight at its foot
  };
  palm(-8.5, 7.4, 1.05, 0.2); palm(-5.6, 9.6, 0.9, 0.9); palm(9.4, 6.4, 1.0, 0.5); palm(9.4, 1.8, 0.85, 1.3);

  // ------------------------------------------------------------------------------------------------ the house and the helicopter on its roof
  const group = new THREE.Group(); group.name = 'villa-compound';
  group.add(gateMesh);
  const facade = buildVillaFacade(); facade.position.set(LOT.cx, Y, LOT.cz); group.add(facade);
  solid(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1, 2 * STOREY + PARAPET);
  const heli = buildHelicopter(); heli.group.position.set(X(HELIPAD.x), Y + 2 * STOREY, Z(HELIPAD.z)); group.add(heli.group);

  // ------------------------------------------------------------------------------------------------ the back garden (the interior's, seen from outside)
  const bz0 = BACK_GARDEN.z0 + T, bz1 = BACK_GARDEN.z1, deckTop = 0.22;
  box(plain, BACK_GARDEN.x1 - BACK_GARDEN.x0 - 2 * T, deckTop, POOL.z0 - bz0, 0, 0, (bz0 + POOL.z0) / 2, C.deck);
  box(plain, BACK_GARDEN.x1 - BACK_GARDEN.x0 - 2 * T, deckTop, bz1 - POOL.z1, 0, 0, (POOL.z1 + bz1) / 2, C.deck);
  box(plain, POOL.x0 - BACK_GARDEN.x0 - T, deckTop, POOL.z1 - POOL.z0, (BACK_GARDEN.x0 + T + POOL.x0) / 2, 0, (POOL.z0 + POOL.z1) / 2, C.deck);
  box(plain, BACK_GARDEN.x1 - T - POOL.x1, deckTop, POOL.z1 - POOL.z0, (POOL.x1 + BACK_GARDEN.x1 - T) / 2, 0, (POOL.z0 + POOL.z1) / 2, C.deck);
  // the pool: its white coping, the water a little below it, its glow at night
  const pw = POOL.x1 - POOL.x0, pd = POOL.z1 - POOL.z0, pcx = (POOL.x0 + POOL.x1) / 2, pcz = (POOL.z0 + POOL.z1) / 2;
  for (const [w, d, x, z] of [[pw + 0.7, 0.35, pcx, POOL.z0 - 0.175], [pw + 0.7, 0.35, pcx, POOL.z1 + 0.175], [0.35, pd, POOL.x0 - 0.175, pcz], [0.35, pd, POOL.x1 + 0.175, pcz]] as const) box(plain, w, deckTop + 0.04, d, x, 0, z, C.rim);
  box(water, pw, 0.06, pd, pcx, deckTop - 0.11, pcz, C.water);
  light(pcx - 2.6, pcz, 2.6, deckTop - 0.03); light(pcx + 2.6, pcz, 2.6, deckTop - 0.03);
  // three loungers and a parasol on the east deck, facing the pool
  for (const lx of [5.6, 7.2, 8.8]) {
    const lz = -8.4;
    box(plain, 0.7, 0.28, 1.9, lx, deckTop, lz, C.teak);
    box(plain, 0.64, 0.08, 1.35, lx, deckTop + 0.28, lz + 0.25, C.cushion);
    plain.box(0.64, 0.08, 0.75, X(lx), deckTop + 0.5, Z(lz - 0.75), C.cushion);                       // the back rest (seen as a raised end)
  }
  plain.cyl(0.04, 0.04, 2.3, X(6.4), deckTop, Z(-9.7), C.post, 6);
  plain.cyl(0.05, 1.5, 0.45, X(6.4), deckTop + 2.05, Z(-9.7), C.canvas, 8);
  // potted plants by the terrace doors, the back hedge, two palms in the back corners
  for (const px of [-7.2, 2.6]) { box(plain, 0.5, 0.55, 0.5, px, deckTop, BACK_GARDEN.z1 - 0.45, C.stone); leaves.blob(0.42, X(px), deckTop + 0.85, Z(BACK_GARDEN.z1 - 0.45), C.hedge2, 1, 0); }
  for (let x = -E + T + 0.6, k = 0; x < E - T - 0.4; x += lite ? 1.8 : 1.1, k++) leaves.blob(0.5, X(x), Y + 0.35, Z(bz0 + 0.3), k % 2 ? C.hedge : C.hedge2, 0.9, 0);
  palm(-9.5, -9.4, 1.1, 0.4); palm(9.5, -9.6, 1.0, 1.1);

  // ------------------------------------------------------------------------------------------------ what the street keeps open
  const lot = { x0: X(-E), x1: X(E), z0: Z(-E), z1: Z(E) };
  const keepClear: KeepClear[] = [
    { ...lot, why: 'villa_almadies' },
    { x0: X(GATE.x0 - 1), x1: X(GATE.x1 + 1), z0: Z(E), z1: Z(E + 4.5), why: 'villa_gate' },
  ];
  group.userData.gate = gateCol; group.userData.gateTravel = travel;
  return {
    group, colliders, canopies, keepClear, lot,
    gate: { mesh: gateMesh, collider: gateCol, travel, x0: X(GATE.x0), x1: X(GATE.x1), z: Z(GATE.z) },
  };
}
