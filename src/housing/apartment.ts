import * as THREE from 'three';
import { Batch } from '../world/batch';
import { addGrain } from '../world/grain';
import { floorTileTexture, plasterTexture, generatedTexture } from '../world/textures';
import { daylight } from '../core/clock';
import type { Interior } from '../world/interiors';
import { inBand, type Collider, type Interactable } from '../world/types';
import type { HomeSpec } from '../economy/catalog';
import type { Finish, HomeInterior } from '../economy/homeInterior';
import { buildHelicopter } from '../world/helicopter';
import { FINISH_SIZE, oakPlanks, stoneTiles, windowView } from './villaFinish';
import { GATE, WALL_H } from './villa';
import {
  edgeHeights, groundAt, halfAt, homeBox, inner, isCovered, levelAtX, levelOfRoom, levelsOf, passage, stairParts, wallPieces,
  type Fixture, type FloorPlan, type Level, type Opening, type PlanLook, type Rect, type Room, type Side, type StairPart, type WallPiece,
} from './plan';

/**
 * LD2.0-C « Walkable Homes », lane H (docs/ld2/LD2_C.md): the shell of a home built from its floor plan (src/housing/plan.ts) — the F2 of the
 * Résidence Jàmm, and since LD2.0-D the Almadies villa on three levels. src/economy/homeInterior.ts hands a home with a plan to `buildApartment`;
 * every other home keeps its one open room.
 *
 * - Full-height walls from `wallPieces`, each face in the colours of the room it faces (two tones with a dado rail and a skirting; faience in the
 *   kitchen and the bathroom), the outside walls thicker, a lintel over each opening (an arched head over an arch), a darker cap on top so the plan
 *   reads from above.
 * - Floors by room (tiles, or wood in the chambre), a threshold in each opening, a frame round each door and arch.
 * - Interior doors: a leaf hinged as the plan says, swinging open (0.35 s) when the player comes within 1.3 m of the doorway and shutting 2 s
 *   after they have gone. A leaf has no collider while it moves (it never pushes anyone); fully open it stops the player like a wall.
 * - The street door: a closed leaf (a collider) with « Sortir » inside it, as before.
 * - Windows cut through the outside walls: daylight behind (darker at night), a frame and a sill, louvred shutters or glass by the finish, curtains
 *   in the chambre.
 * - The built-in fittings modelled to their footprints: the counter with its doors, drawers and worktop, the sink and its tap, the stove with its
 *   burners and oven, the fridge, the shower (tray, faience, glass, curtain, head), the WC, the basin and its mirror.
 * - A lamp hanging in every room, glowing at night; the one moving room light (main.ts) follows the room the player is in.
 * - No ceiling: the camera looks down from above (Interior.open). A wall between the camera and the player opens a soft round hole around them
 *   (the shell's materials, `HOLE`): nothing more is drawn and nothing is allocated per frame.
 *
 * LD2.0-D, a plan on several levels (the villa):
 * - Each level is drawn at its height, its floor a slab whose edge shows as a band on the façade; an open room's edges are a garden wall, a parapet
 *   or a glass railing; glazed openings stand open onto the garden, the balconies and the roof terrace.
 * - The stairs: solid steps with stone treads, a glass balustrade and its handrail on the open side, a handrail along the wall; upstairs, the well
 *   with a glass railing round it.
 * - The back garden's pool (its deck, coping, mosaic basin and water), the roof's helipad (an H in a circle, edge lights glowing at night) and the
 *   light helicopter parked on it (src/world/helicopter.ts), the lot round the house (lawn, paths, its walls).
 * - The cutaway: the levels above the player are hidden; a level below shows only what is not under the floor above (its garden, its balconies, its
 *   stair hall and the outer faces of its walls: `shell`), so the camera above the player always sees the player's level and the frame stays cheap.
 *   The furniture follows the same rule (src/economy/estate.ts tags each piece with its level).
 * - Colliders carry their level's heights (`Collider.y0`); `groundAt` gives main.ts the floor or the flight under the player.
 * - The look pass (the owner's « modern premium Senegalese villa »): large marble slabs, oak and teak (src/housing/villaFinish.ts); warm white walls,
 *   one accent wall per main room (oak slats or stone, the plan's `accent`), stone bathrooms, a cove light under the ceiling; travertine outside
 *   where the plan clads a room; plain openings, bronze frames, walnut doors; tall panes showing the view; frameless glass balustrades; the
 *   pergola; no lamp hanging (the cove strips and the furniture's lamps and chandeliers light it).
 *
 * Draw calls: one mesh per material (the tiled floors, the chambre's wood, the faience, the walls, the fittings and trims, the lamps, the daylight)
 * and one per moving door leaf: 10 for the F2 (tests/apartment.test.ts holds it to ≤ 14). The villa: per level, the same in two parts (under the
 * floor above, and seen from above) and the glass and the water.
 */

const Y0 = 0.1;                                  // the ground floor's top (the player's feet indoors: main.ts)
export const SHELL = {
  /** A door opens when the player comes this close to its doorway's middle (m), on either side. */
  doorNear: 1.3,
  /** Seconds a leaf takes to swing fully open, or shut. */
  doorSwing: 0.35,
  /** Seconds after the player has gone before a door shuts. */
  doorLinger: 2,
  /** The see-through hole: its radius (m) round the line from the camera to the player, the share of it fully open (the rest dithered), and how
   *  high on the body its middle is (m above the feet). */
  holeR: 1.0, holeCore: 0.6, holeY: 0.85,
  /** A step longer than this (m) between two frames is a jump (a door, a debug place), not a walk: never held back by the walls. */
  jump: 0.8,
  /** Below this height (m above the floor's top) nothing is cut by the hole: the floors stay whole. */
  holeFloor: 0.03,
};
const EPS = 1e-4;

// ------------------------------------------------------------------------------------------------ the see-through hole
/**
 * The hole's uniforms, shared by every shell material (one update a frame): its middle (on the player, or `Interior.holeFocus`), its radius, and
 * its strength (0: off). The shader cuts a fragment above the floor that lies between the camera (`cameraPosition`, the camera that renders) and
 * the middle, within the radius of the line between them: fully in the core, dithered (screen-space noise) toward the edge, fading out just
 * before the player so a wall beside them is not cut straight across. LD2.0-D: the floor under which nothing is cut is the floor of the level in
 * view (`uHoleFloor`).
 */
export const HOLE = {
  uHolePos: { value: new THREE.Vector3(0, -100, 0) },
  uHoleR: { value: SHELL.holeR },
  uHoleK: { value: 0 },
  uHoleFloor: { value: Y0 + SHELL.holeFloor },
};
const HOLE_GLSL = /* glsl */ `
uniform vec3 uHolePos; uniform float uHoleR; uniform float uHoleK; uniform float uHoleFloor;
varying vec3 vHoleW;
void holeCut() {
  if (uHoleK <= 0.0 || vHoleW.y < uHoleFloor) return;
  vec3 toP = uHolePos - cameraPosition; float L = length(toP);
  if (L < 0.01) return;
  vec3 d = toP / L, v = vHoleW - cameraPosition;
  float t = dot(v, d);
  if (t > L - 0.1) return;
  float R = uHoleR * uHoleK, r = length(v - d * t);
  float k = smoothstep(R * ${SHELL.holeCore.toFixed(3)}, R, r);
  k = max(k, smoothstep(L - 0.45, L - 0.1, t));
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (k < n) discard;
}`;
/** Adds the hole to a material (after whatever its own onBeforeCompile does: src/world/grain.ts). */
function withHole<M extends THREE.Material>(m: M): M {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, HOLE);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHoleW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHoleW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HOLE_GLSL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  holeCut();');
  };
  const key = prevKey.call(m);
  m.customProgramCacheKey = () => key + '|hole2';
  return m;
}

type Mats = {
  floor: THREE.Material; tiles: THREE.Material; wood: THREE.Material; wall: THREE.Material; plain: THREE.Material; leaf: THREE.Material; glow: THREE.MeshLambertMaterial; sky: THREE.MeshBasicMaterial;
  glass: THREE.MeshLambertMaterial; water: THREE.MeshLambertMaterial;
  /** LD2.0-D, the villa: polished terrazzo floors (one material for every hard floor, tinted per room), a finer render on its walls. */
  stone: THREE.Material; render: THREE.Material;
  /**
   * LD2.0-D look pass, the villa (src/housing/villaFinish.ts): large marble slabs on its hard floors (`vfloor`) and on its stone walls (`vstone`:
   * the bathrooms, the stone accent walls, the travertine outside), oak boards on its wood floors and teak decks (`vwood`), the view in its windows.
   */
  vfloor: THREE.Material; vwood: THREE.Material; vstone: THREE.Material; view: THREE.MeshBasicMaterial;
};
let mats: Mats | null = null;
function materials(): Mats {
  if (mats) return mats;
  const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  mats = {
    // the floors are never cut: no hole (a shader that may discard is shaded before the depth test), drawn after the rest (`renderOrder`)
    floor: addGrain(lam(), 0.3, 1, false, floorTileTexture(), 1.32),
    wood: addGrain(lam(), 0.2, 1, false, generatedTexture('wood'), 1),                    // the chambre's floor
    tiles: withHole(addGrain(lam(), 0.3, 1, false, floorTileTexture(), 1.32)),         // the faience of the kitchen and the bathroom
    wall: withHole(addGrain(lam(), 0.4, 1, false, plasterTexture(), 2)),
    plain: withHole(addGrain(lam(), 0.5, 2)),
    leaf: withHole(addGrain(lam(), 0.25, 2)),
    glow: withHole(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffe2b0, emissiveIntensity: 0 })),
    sky: withHole(new THREE.MeshBasicMaterial({ color: 0xbfe3f5 })),
    // LD2.0-D: glazing (balustrades, railings, sliding doors), seen through; the pool's water, lit from within at night
    glass: new THREE.MeshLambertMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    water: new THREE.MeshLambertMaterial({ color: 0x2fb2d4, emissive: 0x0b7fa8, emissiveIntensity: 0.15, transparent: true, opacity: 0.78, depthWrite: false }),
    stone: addGrain(lam(), 0.08, 1, false, generatedTexture('terrazzo'), 1.8),
    // LD2.0-D look pass: a smooth paint (no plaster's blotches), its colours lifted when built (`LIFT`): white that stays white indoors
    render: withHole(addGrain(lam(), 0.04, 1)),
    vfloor: addGrain(lam(), 0.05, 1, false, stoneTiles(), FINISH_SIZE),
    vwood: addGrain(lam(), 0.06, 1, false, oakPlanks(), FINISH_SIZE),
    vstone: withHole(addGrain(lam(), 0.05, 1, false, stoneTiles(), FINISH_SIZE)),
    view: withHole(new THREE.MeshBasicMaterial({ map: windowView() })),
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}
const DAY_SKY = new THREE.Color(0xc6e6f6), NIGHT_SKY = new THREE.Color(0x1c2846), VIEW_NIGHT = new THREE.Color(0x1a2238);

// ------------------------------------------------------------------------------------------------ colours
const EXTERIOR = 0xe2d3b8, CAP = 0x8c8174, CHROME = 0xc4c8cc, WHITE = 0xf6f6f3, DADO = 1.2;
/** LD2.0-D: the villa's façade (a warm white render), the slab bands between its storeys, its coping stones and its dark aluminium. */
const RENDER = 0xf4efe6, BAND = 0xc9b79a, COPING = 0xe9e0cf, ALU = 0x2e3236, VCAP = 0xbfb3a2, LAWN = 0x7fae55, HEDGE = 0x3f7a35, BLOOM = 0xc8327c;
/**
 * LD2.0-D look pass, the villa: its warm white walls, the travertine of its cladding and stone accent walls, the oak of its slatted accent walls and
 * the dark gap behind the slats, the shadow-gap skirting, the bronze of its door frames and pulls, its walnut doors, the cove light's strip, the teak
 * of its decks, the pale stone of its bathrooms, the slab edges in the render's white.
 */
const VWALL = 0xf6f1e8, TRAVERTINE = 0xe6d5b8, CLAD = 0xe8d9bf, OAK = 0xb08a62, SLATGAP = 0x2a211b, SKIRT = 0x47423c, BRONZE = 0x6b5640, WALNUT = 0x5c3d28,
  COVE = 0xfff0d2, TEAK = 0xb9977a, PALESTONE = 0xece8e0, SLABEDGE = 0xf3efe8;
interface Look { lower: number; upper: number; faience: boolean; floor: number }
/** A plan's identity (`FloorPlan.look`) over the look of a room: the colours the hub gives it; a repainted home (« peinture neuve ») keeps its own paint. */
function wearIdentity(look: Look, r: Room, ov: PlanLook | undefined, painted: boolean): Look {
  if (!ov) return look;
  const k = ov.kinds?.[r.kind], plain = !['chambre', 'cuisine', 'sdb', 'bureau', 'dressing', 'manger'].includes(r.kind);
  return {
    ...look,
    lower: painted ? look.lower : k?.lower ?? (plain ? ov.dado ?? look.lower : look.lower),
    upper: painted ? look.upper : k?.upper ?? (plain ? ov.wall ?? look.upper : look.upper),
    floor: k?.floor ?? look.floor,
  };
}
function lookOf(r: Room, F: Finish, painted: boolean, villa = false): Look {
  if (villa) {
    // LD2.0-D look pass: large cream marble slabs, oak in the bedrooms, teak decks outdoors, pale stone in the wet rooms; warm white walls (or the
    // « peinture » upgrade's soft colours) from floor to ceiling, the bathrooms in stone, a stone splashback in the kitchen
    const floor = r.floor === 'wood' ? 0xc79c6e : r.floor === 'deck' ? TEAK : r.floor === 'stone' ? 0xe0d2b8 : r.kind === 'sdb' ? 0xe9e4da : r.kind === 'cuisine' ? 0xeae3d6 : r.level === 'rdc' ? 0xf4ece0 : 0xf0e8db;
    const paint = (c: number) => painted ? c : VWALL;
    switch (r.kind) {
      case 'chambre': return { lower: paint(0xd9e2da), upper: paint(0xd9e2da), faience: false, floor };
      case 'cuisine': return { lower: TRAVERTINE, upper: VWALL, faience: true, floor };
      case 'sdb': return { lower: PALESTONE, upper: PALESTONE, faience: true, floor };
      case 'bureau': return { lower: paint(0xdfe3d6), upper: paint(0xdfe3d6), faience: false, floor };
      case 'manger': return { lower: paint(0xe6ecef), upper: paint(0xe6ecef), faience: false, floor };
      default: return { lower: paint(0xf1ebe0), upper: paint(0xf1ebe0), faience: false, floor };
    }
  }
  const floor = r.floor === 'wood' ? 0xb07a4a : r.floor === 'marble' ? 0xf4f1ea : r.floor === 'stone' ? 0xd9ccb2 : r.kind === 'sdb' ? 0xdfe8ec : r.kind === 'cuisine' ? 0xebe7df : 0xf2f0ec;
  switch (r.kind) {
    case 'chambre': return { lower: painted ? 0x9fc6b8 : 0xd6b3a0, upper: F.upper, faience: false, floor };
    case 'cuisine': return { lower: 0xf0ede5, upper: F.upper, faience: true, floor };
    case 'sdb': return { lower: 0xb6d5e4, upper: 0xf3f5f3, faience: true, floor };
    case 'bureau': return { lower: painted ? 0x9fc6b8 : 0xa9b48f, upper: F.upper, faience: false, floor };
    case 'dressing': return { lower: 0xcaa77d, upper: 0xf3ece0, faience: false, floor };
    case 'manger': return { lower: painted ? 0x7fb7c9 : 0xd9c4a3, upper: F.upper, faience: false, floor };
    default: return { lower: F.lower, upper: F.upper, faience: false, floor };
  }
}

// ------------------------------------------------------------------------------------------------ the plan's geometry
/** Which way room `id` lies from the line an opening is on: +1 the higher z (axis 'x') or x (axis 'z'), −1 the lower. */
function sideOf(p: FloorPlan, o: Opening, id: string): 1 | -1 {
  const r = p.rooms.find(q => q.id === id); if (!r) return 1;
  const c = o.axis === 'x' ? (r.box.z0 + r.box.z1) / 2 - o.z : (r.box.x0 + r.box.x1) / 2 - o.x;
  return c >= 0 ? 1 : -1;
}
/** A rect from a span along a wall line (a..b) and an offset across it (c0..c1, signed: +z for a line along x, +x for one along z). */
const lineRect = (axis: 'x' | 'z', at: number, a: number, b: number, c0: number, c1: number): Rect => axis === 'x'
  ? { x0: Math.min(a, b), x1: Math.max(a, b), z0: at + Math.min(c0, c1), z1: at + Math.max(c0, c1) }
  : { x0: at + Math.min(c0, c1), x1: at + Math.max(c0, c1), z0: Math.min(a, b), z1: Math.max(a, b) };
/** Does the segment (ax, az) → (bx, bz) pass through the rect (shrunk by `m`)? (Liang–Barsky; nothing allocated: it runs every frame.) */
function crosses(r: Rect, ax: number, az: number, bx: number, bz: number, m = 0.01): boolean {
  const x0 = r.x0 + m, x1 = r.x1 - m, z0 = r.z0 + m, z1 = r.z1 - m;
  if (x0 >= x1 || z0 >= z1) return false;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    const p = i === 0 ? -dx : i === 1 ? dx : i === 2 ? -dz : dz, q = i === 0 ? ax - x0 : i === 1 ? x1 - ax : i === 2 ? az - z0 : z1 - az;
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}
/** A rect less some holes, as a few rects (the floor of a room less a well or a pool). */
function subtract(r: Rect, holes: readonly Rect[]): Rect[] {
  let out: Rect[] = [r];
  for (const h of holes) out = out.flatMap(a => {
    if (h.x0 >= a.x1 - EPS || h.x1 <= a.x0 + EPS || h.z0 >= a.z1 - EPS || h.z1 <= a.z0 + EPS) return [a];
    const x0 = Math.max(a.x0, h.x0), x1 = Math.min(a.x1, h.x1);
    return [{ ...a, z1: Math.max(a.z0, h.z0) }, { ...a, z0: Math.min(a.z1, h.z1) }, { x0: a.x0, x1: x0, z0: Math.max(a.z0, h.z0), z1: Math.min(a.z1, h.z1) }, { x0: x1, x1: a.x1, z0: Math.max(a.z0, h.z0), z1: Math.min(a.z1, h.z1) }]
      .filter(q => q.x1 - q.x0 > EPS && q.z1 - q.z0 > EPS);
  });
  return out;
}

/** A fitting's own frame: its back against the wall, `fw` toward the side it is used from, `lat` across it; ψ the yaw that turns a box's +z to `fw`. */
interface Frame { psi: number; fw: [number, number]; lat: [number, number]; bx: number; bz: number; width: number; depth: number }
function frameOf(f: { box: Rect; front: Side }): Frame {
  const b = f.box, fw: [number, number] = ({ n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const)[f.front].slice() as [number, number];
  const psi = Math.atan2(fw[0], fw[1]), lat: [number, number] = [Math.cos(psi), -Math.sin(psi)];
  const across = f.front === 'e' || f.front === 'w', depth = across ? b.x1 - b.x0 : b.z1 - b.z0, width = across ? b.z1 - b.z0 : b.x1 - b.x0;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  return { psi, fw, lat, bx: cx - (fw[0] * depth) / 2, bz: cz - (fw[1] * depth) / 2, width, depth };
}
/** A rect's lateral extent in a fitting's frame. */
function lateral(F: Frame, r: Rect): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) { const l = (x - F.bx) * F.lat[0] + (z - F.bz) * F.lat[1]; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  return [lo, hi];
}
/** Splits [a, b] less the `holes`, keeping pieces longer than `min`. */
function less(a: number, b: number, holes: [number, number][], min = 0.05): [number, number][] {
  let out: [number, number][] = [[a, b]];
  for (const [h0, h1] of holes) out = out.flatMap(([u, v]) => h1 <= u || h0 >= v ? [[u, v]] : ([[u, Math.min(v, h0)], [Math.max(u, h1), v]] as [number, number][]).filter(([s, e]) => e - s > EPS));
  return out.filter(([u, v]) => v - u >= min);
}

type Face = 'px' | 'nx' | 'py' | 'pz' | 'nz';
const FACE: Record<Face, number> = { px: 0, nx: 1, py: 2, pz: 4, nz: 5 };   // BoxGeometry's groups: +x, −x, +y, −y, +z, −z
/** A box (base at y = 0) with only the faces that can be seen: a wall's halves meet inside it and its bands sit on one another, and a face never
 *  seen still costs its pixels (the shell's shaders may discard, so nothing behind is skipped before shading). */
function partBox(w: number, h: number, d: number, keep: readonly Face[]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d), src = g.index!.array, idx: number[] = [];
  for (const k of keep) for (let i = 0; i < 6; i++) idx.push(src[FACE[k] * 6 + i]);
  g.setIndex(idx); g.translate(0, h / 2, 0);
  return g;
}

/** What the shell keeps per door (the leaf's pivot, its angles, how open it is, the collider it has once fully open). */
interface Door { o: Opening; pivot: THREE.Group; base: number; theta: number; k: number; away: number; open: Rect; col: Collider; cx: number; cz: number; y: number }
/** A solid box of the shell in world metres, for the debug's line-of-sight test (LD2.0-D: its level and part, so a hidden one is left out). */
interface Solid { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; wall: boolean; li: number; core: boolean }
/** Something the player may not cross between two frames (plan metres of its level, its heights in the world). */
interface Block { r: Rect; y0: number; y1: number }
const PARK = 1e6;   // where an inactive collider waits (never near anyone)

/** A part of a level's shell: one batch per material (one draw call each) in its own group, shown or hidden with it. */
interface Part { floor: Batch; wood: Batch; tiles: Batch; wall: Batch; plain: Batch; glow: Batch; sky: Batch; glass: Batch; water: Batch; stone: Batch; g: THREE.Group; li: number; core: boolean }

/**
 * The interior of a home built from its floor plan, at (ox, oz) in the world (off the street grid), in the shape the estate and the editor use
 * (src/economy/homeInterior.ts HomeInterior). `F`: the finish of the home's level (after its upgrades); `upgrades`: « peinture » repaints too.
 */
export function buildApartment(p: FloorPlan, h: HomeSpec, ox: number, oz: number, hub: string, F: Finish, upgrades: readonly string[] = []): HomeInterior {
  const M = materials(), H = p.wallH, painted = upgrades.includes('peinture'), multi = !!p.levels;
  const group = new THREE.Group(); group.name = `home:${h.id}`;
  const LV = levelsOf(p), top = LV.length - 1, liOf = (l: Level) => Math.max(0, LV.indexOf(l));
  const mkPart = (li: number, core: boolean): Part => {
    const g = new THREE.Group(); g.name = multi ? `level:${LV[li].id}:${core ? 'core' : 'shell'}` : 'shell'; g.userData.shellPart = true;
    group.add(g);
    return { floor: new Batch(), wood: new Batch(), tiles: new Batch(), wall: new Batch(), plain: new Batch(), glow: new Batch(), sky: new Batch(), glass: new Batch(), water: new Batch(), stone: new Batch(), g, li, core };
  };
  // one level (the F2): one part. Several: per level, what lies under the floor above (`core`) and what is seen from above (`shell`)
  const parts = LV.map((_, li) => { const shell = mkPart(li, false); return { shell, core: multi && li < top ? mkPart(li, true) : shell }; });
  let S: Part = parts[0].shell, DX = 0, Y = Y0, LI = 0;
  /** Draws from now on in level `li`'s part (`core`: under the floor above). */
  const use = (li: number, core: boolean) => { LI = li; S = core ? parts[li].core : parts[li].shell; DX = LV[li].dx; Y = Y0 + LV[li].y; };
  const useRoom = (r: Room | null, li: number) => use(li, !!r && isCovered(p, r));
  const colliders: Collider[] = [], solids: Solid[] = [], blocks: Block[] = [];
  const W = (x: number) => ox + x - DX, Z = (z: number) => oz + z;
  const room = (id: string) => p.rooms.find(r => r.id === id)!;
  const looks = new Map(p.rooms.map(r => [r.id, wearIdentity(lookOf(r, F, painted, multi), r, p.look, painted)]));
  const CAPC = multi ? VCAP : CAP;
  const inners = p.rooms.map(r => ({ r, i: inner(p, r), li: liOf(levelOfRoom(p, r)) }));
  const roomIn = (x: number, z: number) => p.rooms.find(r => x > r.box.x0 && x < r.box.x1 && z > r.box.z0 && z < r.box.z1) ?? null;
  const levelLi = (id: string) => Math.max(0, LV.findIndex(l => l.id === id));
  /** The floor's thickness over a level's walls (slab and ceiling void: the band on the façade). */
  const slabAbove = (li: number) => li + 1 < LV.length ? LV[li + 1].y - LV[li].y - H : 0.2;
  /** A collider over a rect of the current level, `hgt` tall from its floor (LD2.0-D: with its heights; the F2's as before). */
  const collide = (r: Rect, hgt: number, below = 0): Collider => multi
    ? { x0: W(r.x0), z0: Z(r.z0), x1: W(r.x1), z1: Z(r.z1), y0: Y - 0.2 - below, h: Y + hgt }
    : { x0: W(r.x0), z0: Z(r.z0), x1: W(r.x1), z1: Z(r.z1), h: hgt };
  const block = (r: Rect, hgt: number) => blocks.push({ r: { x0: r.x0 - DX, x1: r.x1 - DX, z0: r.z0, z1: r.z1 }, y0: multi ? Y - 0.2 : -Infinity, y1: multi ? Y + hgt : Infinity });
  /** A box over a rect of the plan, from y0 to y1 above the floor. */
  const rbox = (b: Batch, r: Rect, y0: number, y1: number, c: number) => {
    if (r.x1 - r.x0 < EPS || r.z1 - r.z0 < EPS || y1 - y0 < EPS) return;
    b.box(r.x1 - r.x0, y1 - y0, r.z1 - r.z0, W((r.x0 + r.x1) / 2), Y + y0, Z((r.z0 + r.z1) / 2), c);
  };
  /** The same with only some faces (see `partBox`). */
  const pbox = (b: Batch, r: Rect, y0: number, y1: number, c: number, keep: readonly Face[]) => {
    if (r.x1 - r.x0 < EPS || r.z1 - r.z0 < EPS || y1 - y0 < EPS) return;
    b.geometry(partBox(r.x1 - r.x0, y1 - y0, r.z1 - r.z0, keep), c, W((r.x0 + r.x1) / 2), Y + y0, Z((r.z0 + r.z1) / 2));
  };
  const solid = (r: Rect, y0: number, y1: number, isWall: boolean) => solids.push({ x0: W(r.x0), x1: W(r.x1), z0: Z(r.z0), z1: Z(r.z1), y0: Y + y0, y1: Y + y1, wall: isWall, li: LI, core: S.core });

  // ---------------------------------------------------------------- walls
  /**
   * One stretch of wall on a line (`axis`, at `at`, half thickness `t`), from a to b along it and y0 to y1 above the floor. Each face is its own
   * half of the wall, in the colours of the room it faces (split where the rooms change), with the dado rail and the skirting proud of it; the
   * outside face in the façade's colour. A half has its face, its two ends and, where nothing sits on it (a window's sill), its top: never the
   * face inside the wall nor a top under the band above or the cap. LD2.0-D: a face is drawn in the part of the room it faces (an outside face in
   * the part seen from above).
   */
  const run = (axis: 'x' | 'z', at: number, t: number, a: number, b: number, y0: number, y1: number, outside: boolean, li: number) => {
    if (b - a < EPS || y1 - y0 < EPS) return;
    for (const s of [-1, 1] as const) {
      const face: Face = axis === 'x' ? (s > 0 ? 'pz' : 'nz') : (s > 0 ? 'px' : 'nx'), ends: Face[] = axis === 'x' ? ['px', 'nx'] : ['pz', 'nz'];
      const sides = (top2: boolean): Face[] => top2 ? [face, ...ends, 'py'] : [face, ...ends];
      // the stretches facing one room (or the outside): split where the room on this side changes, never inside one room's face (a seam shows)
      const cuts = [a, b];
      for (const r of p.rooms) for (const e of axis === 'x' ? [r.box.x0, r.box.x1] : [r.box.z0, r.box.z1]) if (e > a + EPS && e < b - EPS) cuts.push(e);
      cuts.sort((u, v) => u - v);
      const spans: { u0: number; u1: number; r: Room | null }[] = [];
      for (let i = 0; i + 1 < cuts.length; i++) {
        const u0 = cuts[i], u1 = cuts[i + 1]; if (u1 - u0 < EPS) continue;
        const mid = (u0 + u1) / 2, off = s * (t + 0.02), r = axis === 'x' ? roomIn(mid, at + off) : roomIn(at + off, mid), last = spans[spans.length - 1];
        if (last && last.r === r) last.u1 = u1; else spans.push({ u0, u1, r });
      }
      for (const { u0, u1, r } of spans) {
        const free = y1 < H - EPS;                                                         // the band's top is seen (no cap, no band on it)
        // the façade runs to the corners and closes them; a room's face stops at the room's own face (the rest is inside the walls it meets, where its
        // end would lie on their faces and flicker)
        if (!r || r.outdoor) {
          if (!outside) continue;
          // the façade: the house's render, or the accent of the room behind the wall (LD2.0-D: a stone-clad entrance, a wood-clad stair head)
          const mid = (u0 + u1) / 2, back = axis === 'x' ? roomIn(mid, at - s * (t + 0.02)) : roomIn(at - s * (t + 0.02), mid);
          use(li, false);
          // LD2.0-D look pass: a clad room's outside faces in travertine (the ground floor's storey), the others in the render
          if (multi && back?.clad === 'stone') pbox(S.stone, lineRect(axis, at, u0, u1, 0, s * t), y0, y1, CLAD, sides(free));
          else pbox(S.wall, lineRect(axis, at, u0, u1, 0, s * t), y0, y1, multi ? back?.facade ?? RENDER : EXTERIOR, sides(free));
          continue;
        }
        useRoom(r, li);
        const ri = inners.find(q => q.r === r)!.i, [f0, f1] = axis === 'x' ? [ri.x0, ri.x1] : [ri.z0, ri.z1], v0 = Math.max(u0, f0), v1 = Math.min(u1, f1);
        if (v1 - v0 < EPS) continue;
        if (multi) { villaFace(r, axis, at, t, s, v0, v1, y0, y1, free, face, ends); continue; }
        const half2 = lineRect(axis, at, v0, v1, 0, s * t), L = looks.get(r.id)!;
        if (y0 < DADO) pbox(L.faience ? S.tiles : S.wall, half2, y0, Math.min(y1, DADO), L.lower, sides(free && y1 <= DADO));
        if (y1 > DADO) pbox(S.wall, half2, Math.max(y0, DADO), y1, L.upper, sides(free));
        // the dado rail and the skirting, proud of the face
        if (y0 < DADO - 0.02 && y1 > DADO + 0.02) pbox(S.plain, lineRect(axis, at, v0, v1, s * t, s * (t + 0.012)), DADO - 0.02, DADO + 0.02, L.faience ? 0xe2ddd2 : F.trim, sides(true));
        if (y0 < EPS) pbox(S.plain, lineRect(axis, at, v0, v1, s * t, s * (t + 0.015)), 0, L.faience ? 0.08 : 0.1, L.faience ? 0xd2cbbf : F.trim, sides(true));
      }
    }
  };
  /**
   * LD2.0-D look pass: a face of a villa room's wall: warm white (or the room's paint) from the floor to the ceiling, stone in a bathroom and as the
   * kitchen's splashback; the room's accent wall: vertical oak slats on a dark ground, or a stone face; a shadow-gap skirting; and a slim strip of
   * cove light under the ceiling, glowing at night (the glow material).
   */
  function villaFace(r: Room, axis: 'x' | 'z', at: number, t: number, s: 1 | -1, v0: number, v1: number, y0: number, y1: number, free: boolean, face: Face, ends: Face[]) {
    const half2 = lineRect(axis, at, v0, v1, 0, s * t), L = looks.get(r.id)!, side: Side = axis === 'x' ? (s > 0 ? 'n' : 's') : (s > 0 ? 'w' : 'e');
    const acc = r.accent?.side === side ? r.accent.kind : null, keep = (top2: boolean): Face[] => top2 ? [face, ...ends, 'py'] : [face, ...ends];
    const proud = acc === 'wood' ? 0.03 : 0;
    if (acc === 'wood') {
      pbox(S.wall, half2, y0, y1, SLATGAP, keep(free));
      // the slats: 4 cm of oak every 9 cm, on one grid along the wall (the stretches round a window or a door line up)
      for (let c = Math.ceil((v0 + 0.03) / 0.09) * 0.09; c < v1 - 0.03; c += 0.09) {
        pbox(S.plain, lineRect(axis, at, c - 0.02, c + 0.02, s * t, s * (t + proud)), y0, y1, Math.round(c / 0.09) % 3 === 1 ? 0xa2805c : OAK, keep(free));
      }
    } else if (acc === 'stone' || r.kind === 'sdb') pbox(S.stone, half2, y0, y1, acc === 'stone' ? TRAVERTINE : L.lower, keep(free));
    else {
      if (L.faience && y0 < DADO) pbox(S.stone, half2, y0, Math.min(y1, DADO), L.lower, keep(free && y1 <= DADO));
      if (!L.faience || y1 > DADO) pbox(S.wall, half2, L.faience ? Math.max(y0, DADO) : y0, y1, L.upper, keep(free));
    }
    if (y0 < EPS && acc !== 'wood' && r.kind !== 'sdb') pbox(S.plain, lineRect(axis, at, v0, v1, s * t, s * (t + 0.006)), 0, 0.06, SKIRT, keep(true));
    if (y1 > H - EPS && r.kind !== 'sdb') pbox(S.glow, lineRect(axis, at, v0, v1, s * (t + proud), s * (t + proud + 0.02)), H - 0.07, H - 0.04, COVE, keep(true));
  }
  /** The top of a wall: a dark cap (the plan read from above); LD2.0-D, under the floor above, the slab's edge (a band on the façade). */
  const capOf = (r: Rect, li: number, outer: boolean, covered: boolean) => {
    if (multi && li < top) {
      // the floor above cut through: its faces in the walls' white, a thin dark line on top (the plan read from above)
      use(li, !outer && covered);
      pbox(S.wall, r, H, H + slabAbove(li) - 0.015, outer ? SLABEDGE : VWALL, ['px', 'nx', 'pz', 'nz']);
      rbox(S.plain, r, H + slabAbove(li) - 0.015, H + slabAbove(li) - 0.005, 0x5b544d);
    }
    else { use(li, covered); rbox(S.wall, r, H, H + 0.02, CAPC); }
  };
  /** Is a wall line between covered rooms only (drawn under the floor above)? */
  const coveredLine = (pc: { axis: 'x' | 'z'; at: number; x0: number; x1: number; z0: number; z1: number }) => {
    const c = pc.axis === 'x' ? (pc.x0 + pc.x1) / 2 : (pc.z0 + pc.z1) / 2, d = 0.2;
    const a = pc.axis === 'x' ? roomIn(c, pc.at - d) : roomIn(pc.at - d, c), b = pc.axis === 'x' ? roomIn(c, pc.at + d) : roomIn(pc.at + d, c);
    return !!a && !!b && isCovered(p, a) && isCovered(p, b);
  };
  /** The windows on a wall line: their span along it, sill and head. */
  const windowsOn = (axis: 'x' | 'z', at: number) => p.windows.flatMap(w => {
    const b = room(w.room).box, line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side], wa = w.side === 'n' || w.side === 's' ? 'x' : 'z';
    return wa === axis && Math.abs(line - at) < 1e-6 ? [{ w, lo: w.at - w.width / 2, hi: w.at + w.width / 2 }] : [];
  });
  const edgeH = edgeHeights(p);
  const pieces = wallPieces(p);
  for (const pc of pieces) {
    const a = pc.axis === 'x' ? pc.x0 : pc.z0, b = pc.axis === 'x' ? pc.x1 : pc.z1, t = (pc.axis === 'x' ? pc.z1 - pc.z0 : pc.x1 - pc.x0) / 2, li = levelLi(pc.level);
    if (pc.kind !== 'wall') { edge(pc, li, t); continue; }
    let u = a;
    for (const { w, lo, hi } of windowsOn(pc.axis, pc.at).filter(q => q.lo >= a - 1e-6 && q.hi <= b + 1e-6).sort((q, r) => q.lo - r.lo)) {
      run(pc.axis, pc.at, t, u, lo, 0, H, pc.outer, li);
      run(pc.axis, pc.at, t, lo, hi, 0, w.sill, pc.outer, li); run(pc.axis, pc.at, t, lo, hi, w.sill + w.height, H, pc.outer, li);
      u = hi;
    }
    run(pc.axis, pc.at, t, u, b, 0, H, pc.outer, li);
    const cov = coveredLine(pc);
    capOf(pc, li, pc.outer, cov);
    use(li, cov);
    colliders.push(collide(pc, H)); block(pc, H); solid(pc, 0, H, true);
  }
  /** An open room's edge: the garden's wall (bougainvillea climbing it), the roof's parapet with its coping, a balcony's glass railing. */
  function edge(pc: WallPiece, li: number, t: number) {
    use(li, false);
    const hgt = edgeH[pc.kind as keyof typeof edgeH];
    if (pc.kind === 'railing' && multi) {
      // LD2.0-D look pass: frameless glass in a dark base shoe under a slim steel cap; on the roof, a strip of light along the shoe (lit at night)
      const along = pc.axis === 'x' ? [pc.x0, pc.x1] : [pc.z0, pc.z1], c = (along[0] + along[1]) / 2;
      const inSide = pc.axis === 'x' ? (roomIn(c, pc.at + 0.3) ? 1 : -1) : (roomIn(pc.at + 0.3, c) ? 1 : -1);
      rbox(S.plain, lineRect(pc.axis, pc.at, along[0], along[1], -0.045, 0.045), 0, 0.09, 0x34322f);
      rbox(S.glass, lineRect(pc.axis, pc.at, along[0] + 0.01, along[1] - 0.01, -0.01, 0.01), 0.09, hgt - 0.03, 0xffffff);
      rbox(S.plain, lineRect(pc.axis, pc.at, along[0], along[1], -0.016, 0.016), hgt - 0.03, hgt, 0xc5c8ca);
      if (li === top && along[1] - along[0] > 0.6) rbox(S.glow, lineRect(pc.axis, pc.at, along[0] + 0.1, along[1] - 0.1, inSide * 0.045, inSide * 0.06), 0.03, 0.06, COVE);
    } else if (pc.kind === 'railing') {
      // a low kerb, glass panels between slim posts, a dark handrail
      rbox(S.plain, pc, 0, 0.1, COPING);
      const along = pc.axis === 'x' ? [pc.x0, pc.x1] : [pc.z0, pc.z1], n = Math.max(1, Math.round((along[1] - along[0]) / 1.3));
      rbox(S.glass, lineRect(pc.axis, pc.at, along[0] + 0.03, along[1] - 0.03, -0.012, 0.012), 0.1, hgt - 0.06, 0xffffff);
      for (let k = 0; k <= n; k++) { const c = along[0] + (k / n) * (along[1] - along[0]); rbox(S.plain, lineRect(pc.axis, pc.at, c - 0.025, c + 0.025, -0.025, 0.025), 0.1, hgt, ALU); }
      rbox(S.plain, lineRect(pc.axis, pc.at, along[0], along[1], -0.04, 0.04), hgt - 0.05, hgt, ALU);
    } else {
      rbox(S.wall, pc, 0, hgt, pc.kind === 'garden' ? 0xeee3cf : RENDER);
      rbox(S.plain, lineRect(pc.axis, pc.at, (pc.axis === 'x' ? pc.x0 : pc.z0) - 0.02, (pc.axis === 'x' ? pc.x1 : pc.z1) + 0.02, -t - 0.03, t + 0.03), hgt, hgt + 0.06, COPING);
      if (pc.kind === 'parapet') {
        // a strip of light along the parapet's foot on the terrace's side, lit at night
        const along = pc.axis === 'x' ? [pc.x0, pc.x1] : [pc.z0, pc.z1], c = (along[0] + along[1]) / 2;
        const inSide = pc.axis === 'x' ? (roomIn(c, pc.at + 0.3) ? 1 : -1) : (roomIn(pc.at + 0.3, c) ? 1 : -1);
        if (along[1] - along[0] > 0.8) rbox(S.glow, lineRect(pc.axis, pc.at, along[0] + 0.3, along[1] - 0.3, inSide * t, inSide * (t + 0.03)), 0.18, 0.22, 0xffe6b8);
      }
      if (pc.kind === 'garden') {
        // bougainvillea along the wall's top on the garden's side, high up (the furniture stands below): a clipped green crown, magenta flowers in it
        const along = pc.axis === 'x' ? [pc.x0, pc.x1] : [pc.z0, pc.z1], c = (along[0] + along[1]) / 2;
        const inSide = pc.axis === 'x' ? (roomIn(c, pc.at + 0.3) ? 1 : -1) : (roomIn(pc.at + 0.3, c) ? 1 : -1);
        rbox(S.plain, lineRect(pc.axis, pc.at, along[0] + 0.2, along[1] - 0.2, inSide * (t + 0.01), inSide * (t + 0.3)), hgt - 0.55, hgt + 0.12, HEDGE);
        for (let u2 = along[0] + 0.6; u2 < along[1] - 0.4; u2 += 0.85) {
          const [x, z] = pc.axis === 'x' ? [u2, pc.at + inSide * (t + 0.3)] : [pc.at + inSide * (t + 0.3), u2];
          S.plain.blob(0.16, W(x), Y + hgt - 0.2 - (Math.round(u2 * 13) % 3) * 0.12, Z(z), BLOOM, 0.8, 0);
        }
      }
    }
    colliders.push(collide(pc, hgt)); block(pc, hgt);
    solid(pc, 0, hgt, pc.kind !== 'railing');
  }

  // ---------------------------------------------------------------- floors
  const parts2 = stairParts(p);
  if (!multi) {
    // the building's slab round the home: a ring outside its walls only (nothing drawn under the floors, where it would only cost pixels)
    const hw = p.w / 2 + p.outWall / 2, hd = p.d / 2 + p.outWall / 2, rim = 1.2;
    for (const r of [{ x0: -hw - rim, x1: hw + rim, z0: -hd - rim, z1: -hd }, { x0: -hw - rim, x1: hw + rim, z0: hd, z1: hd + rim }, { x0: -hw - rim, x1: -hw, z0: -hd, z1: hd }, { x0: hw, x1: hw + rim, z0: -hd, z1: hd }]) rbox(S.plain, r, -0.12, 0, 0x625c55);
  }
  for (const { r, li } of inners) {
    useRoom(r, li);
    // LD2.0-D: no floor over a well, nor under the pool's water (its basin has its own)
    const holes = [...parts2.filter(st => st.upper === LV[li]).map(st => st.well), ...p.fixtures.filter(f => f.kind === 'pool' && f.room === r.id).map(f => f.box)];
    // the garden: a deck round the pool and along the house, lawn beyond it
    const deck = multi && r.outdoor && li === 0 ? gardenDeck(r) : null;
    for (const q of holes.length ? subtract(r.box, holes) : [r.box]) {
      if (deck) {
        for (const d of subtract(q, subtract(q, deck))) (r.floor === 'deck' ? S.wood : S.floor).flat(d.x1 - d.x0, d.z1 - d.z0, W((d.x0 + d.x1) / 2), Y, Z((d.z0 + d.z1) / 2), looks.get(r.id)!.floor);
        for (const g of subtract(q, deck)) S.plain.flat(g.x1 - g.x0, g.z1 - g.z0, W((g.x0 + g.x1) / 2), Y, Z((g.z0 + g.z1) / 2), LAWN);
        continue;
      }
      (r.floor === 'wood' || r.floor === 'deck' ? S.wood : S.floor).flat(q.x1 - q.x0, q.z1 - q.z0, W((q.x0 + q.x1) / 2), Y, Z((q.z0 + q.z1) / 2), looks.get(r.id)!.floor);
    }
    // a balcony's slab, seen from the side and from below
    if (multi && r.outdoor && li > 0) pbox(S.plain, r.box, -slabAbove(li - 1), -0.004, SLABEDGE, ['px', 'nx', 'pz', 'nz']);
  }
  if (multi && !p.noLot) ground();
  /** The paved part of a garden: round its pool (1.3 m) and along the house's wall (1.5 m), clipped to it. */
  function gardenDeck(r: Room): Rect[] {
    const b = r.box, out: Rect[] = [];
    for (const f of p.fixtures) if (f.room === r.id && f.kind === 'pool') out.push({ x0: Math.max(b.x0, f.box.x0 - 1.3), x1: Math.min(b.x1, f.box.x1 + 1.3), z0: Math.max(b.z0, f.box.z0 - 1.3), z1: Math.min(b.z1, f.box.z1 + 1.3) });
    // along the walls it shares with the house (the room's side with a full wall on it)
    for (const w of pieces) if (w.kind === 'wall' && w.axis === 'x' && Math.abs(w.at - b.z1) < 1e-6 && w.x1 > b.x0 && w.x0 < b.x1) out.push({ x0: Math.max(b.x0, w.x0 - 1.5), x1: Math.min(b.x1, w.x1 + 1.5), z0: b.z1 - 1.5, z1: b.z1 });
    return out;
  }

  // ---------------------------------------------------------------- openings: lintels, frames, thresholds, leaves
  const doors: Door[] = [];
  const TRIM = F.trim, FRAME = 0.07, PROUD = 0.02;
  for (const o of p.openings) {
    const at = o.axis === 'x' ? o.z : o.x, c = o.axis === 'x' ? o.x : o.z, t = halfAt(p, o.axis, at, c), lo = c - o.width / 2, hi = c + o.width / 2;
    const P = passage(p, o), ra = room(o.a), rb = o.b === 'out' ? null : room(o.b), li = liOf(levelOfRoom(p, ra));
    const cov = isCovered(p, ra) || (!!rb && isCovered(p, rb)), outer = !rb || !!ra.outdoor || !!rb.outdoor;
    use(li, cov);
    // the head of the opening: an arched one over an arch, a straight lintel over a door
    if (o.kind === 'arch' && !multi) {
      const rise = 0.3, spring = o.height - rise, s = new THREE.Shape();
      s.moveTo(-o.width / 2, spring);
      for (let i = 1; i <= 14; i++) { const ang = Math.PI - (i / 14) * Math.PI; s.lineTo((o.width / 2) * Math.cos(ang), spring + rise * Math.sin(ang)); }
      s.lineTo(o.width / 2, H); s.lineTo(-o.width / 2, H);
      const g = new THREE.ExtrudeGeometry(s, { depth: 2 * t, bevelEnabled: false, curveSegments: 1 }); g.translate(0, 0, -t);
      const rA = roomIn(o.axis === 'x' ? c : at - t - 0.05, o.axis === 'x' ? at - t - 0.05 : c);
      S.wall.geometry(g, (rA ? looks.get(rA.id)!.upper : F.upper), W(o.axis === 'x' ? c : at), Y, Z(o.axis === 'x' ? at : c), o.axis === 'x' ? 0 : -Math.PI / 2);
      for (const e of [lo - FRAME, hi]) rbox(S.plain, lineRect(o.axis, at, e, e + FRAME, -t - PROUD, t + PROUD), 0, spring + 0.04, TRIM);
      solid(lineRect(o.axis, at, lo, hi, -t, t), spring, H, true);
    } else {
      run(o.axis, at, t, lo, hi, o.height, H, outer, li);
      use(li, cov);
      // the frame: two jambs and a head on both faces, and the soffit lined (LD2.0-D: dark aluminium round a glazed opening; the look pass: a slim
      // bronze frame round a door, a plain opening between two rooms with no frame at all)
      if (!(multi && o.kind === 'arch')) {
        const fc = o.kind === 'glass' ? ALU : multi ? BRONZE : TRIM, fw = multi ? 0.04 : FRAME;
        for (const e of [lo - fw, hi]) rbox(S.plain, lineRect(o.axis, at, e, e + fw, -t - PROUD, t + PROUD), 0, o.height + fw, fc);
        rbox(S.plain, lineRect(o.axis, at, lo - fw, hi + fw, -t - PROUD, t + PROUD), o.height, o.height + fw, fc);
      }
      solid(lineRect(o.axis, at, lo, hi, -t, t), o.height, H, true);
    }
    capOf(P, li, outer, cov);
    use(li, cov);
    rbox(S.plain, P, 0, 0.008, o.kind === 'glass' ? 0x3a3f44 : multi ? 0xe2d8c6 : 0xcdbfa8);                 // the threshold (a glazed door's track)
    if (o.kind === 'glass') {
      // the sliding panels stand open, slid in front of the wall on the open room's side: glass in a slim dark frame (LD2.0-D look pass: in the
      // villa they slide away into the wall, the opening left clear from floor to ceiling)
      if (multi) continue;
      const outRoom = rb?.outdoor ? rb : ra.outdoor ? ra : rb, so = outRoom ? sideOf(p, o, outRoom.id) : 1;
      use(li, false);
      const pw = o.width / 2 + 0.05, c0 = hi + 0.02, c1 = hi + 0.02 + pw, off = so * (t + 0.05);
      for (const [a0, a1] of [[c0, c1], [c0 + 0.06, c1 + 0.06]] as const) {
        rbox(S.glass, lineRect(o.axis, at, a0, a1, off - 0.008 + (a0 - c0) * so * 0.5, off + 0.008 + (a0 - c0) * so * 0.5), 0.03, o.height - 0.03, 0xffffff);
        for (const e of [a0, a1 - 0.04]) rbox(S.plain, lineRect(o.axis, at, e, e + 0.04, off - 0.02 + (a0 - c0) * so * 0.5, off + 0.02 + (a0 - c0) * so * 0.5), 0, o.height, ALU);
      }
      rbox(S.plain, lineRect(o.axis, at, lo - FRAME, c1 + 0.1, off - 0.03, off + 0.03), o.height, o.height + 0.05, ALU);   // the track above
      continue;
    }
    if (o.kind === 'front') {
      // the street door: a closed leaf (painted metal, two panels, a handle and a spy hole), a collider across the doorway, a mat inside
      const s = sideOf(p, o, o.a), lf = lineRect(o.axis, at, lo + 0.01, hi - 0.01, -0.025, 0.025);
      rbox(S.plain, lf, 0.01, o.height - 0.01, multi ? 0x7a5234 : F.door);
      if (multi) {
        // LD2.0-D look pass: a tall flush teak door, its grooves, a long bronze pull on each face
        for (const side of [-1, 1]) {
          for (let k = 1; k < 6; k++) { const e = lo + (k / 6) * (hi - lo); rbox(S.plain, lineRect(o.axis, at, e - 0.006, e + 0.006, side * 0.025, side * 0.028), 0.08, o.height - 0.08, 0x5e3d25); }
          rbox(S.plain, lineRect(o.axis, at, hi - 0.17, hi - 0.14, side * 0.025, side * 0.07), 0.5, 1.75, 0xa88a5a);
        }
      } else {
        for (const side of [-1, 1]) {
          for (const [y0, y1] of [[0.15, 0.95], [1.1, o.height - 0.15]]) rbox(S.plain, lineRect(o.axis, at, lo + 0.12, hi - 0.12, side * 0.025, side * 0.032), y0, y1, new THREE.Color(F.door).multiplyScalar(0.82).getHex());
          rbox(S.plain, lineRect(o.axis, at, hi - 0.16, hi - 0.1, side * 0.025, side * 0.06), 1.0, 1.04, 0xd4b24a);
        }
        rbox(S.plain, lineRect(o.axis, at, c - 0.02, c + 0.02, s * 0.025, s * 0.035), 1.52, 1.56, 0x222222);
      }
      rbox(S.plain, lineRect(o.axis, at, c - 0.42, c + 0.42, s * (t + 0.15), s * (t + 0.7)), 0, 0.015, 0x8a6a3c);
      colliders.push(collide(P, o.height));
      block(P, o.height); solid(P, 0, o.height, false);
      continue;
    }
    if (o.kind !== 'door' || !o.swing) continue;
    // an interior door: its leaf on a pivot at the hinge, near the face of the side it swings to
    const s = sideOf(p, o, o.swing), hingeAt = o.hinge === 'end' ? hi : lo, dir = o.hinge === 'end' ? -1 : 1, off = s * (t - 0.025);
    const u: [number, number] = o.axis === 'x' ? [dir, 0] : [0, dir], n: [number, number] = o.axis === 'x' ? [0, s] : [s, 0];
    const base = Math.atan2(-u[1], u[0]), theta = Math.atan2(u[1] * n[0] - u[0] * n[1], u[0] * n[0] + u[1] * n[1]);
    const pivot = new THREE.Group(); pivot.name = `door:${o.id}`;
    const [px, pz] = o.axis === 'x' ? [hingeAt, at + off] : [at + off, hingeAt];
    pivot.position.set(W(px), Y, Z(pz)); pivot.rotation.y = base;
    const lb = new Batch(), lw = o.width - 0.02, lh = o.height - 0.02, WOOD = multi ? WALNUT : 0x7a4a26, PANEL = 0x6a3e1f;
    lb.box(lw - 0.01, lh, 0.04, 0.01 + lw / 2, 0.01, 0, WOOD);
    for (const side of [-1, 1]) {
      if (multi) { lb.box(0.02, 0.5, 0.025, lw - 0.1, 0.78, side * 0.032, 0xa88a5a); continue; }   // LD2.0-D look pass: a flush walnut leaf, a bronze pull
      for (const [y0, y1] of [[0.15, 0.95], [1.1, lh - 0.15]]) lb.box(lw - 0.24, y1 - y0, 0.006, 0.01 + lw / 2, y0, side * 0.022, PANEL);
      lb.box(0.05, 0.05, 0.012, lw - 0.08, 0.98, side * 0.026, CHROME);                  // the rose and the lever
      lb.box(0.13, 0.02, 0.02, lw - 0.12, 1.0, side * 0.04, CHROME);
    }
    for (const y of [0.2, lh / 2, lh - 0.25]) lb.box(0.02, 0.1, 0.05, 0.005, y, 0, 0x2a2a2a);                     // the hinges
    const leaf = lb.build(M.leaf, true, false)!; leaf.name = `leaf:${o.id}`;
    pivot.add(leaf); S.g.add(pivot);
    // fully open, the leaf lies across the room it opens into, at the hinge end of the doorway
    const open = lineRect(o.axis, at, hingeAt - 0.03, hingeAt + 0.03, s * t, s * (t + lw));
    const col: Collider = multi ? { x0: PARK, z0: PARK, x1: PARK, z1: PARK, y0: Y - 0.2, h: Y + lh } : { x0: PARK, z0: PARK, x1: PARK, z1: PARK, h: lh };
    colliders.push(col);
    doors.push({ o, pivot, base, theta, k: 0, away: 1e9, open, col, cx: W(o.x), cz: Z(o.z), y: Y });
  }

  // ---------------------------------------------------------------- windows
  for (const w of p.windows) {
    const rw = room(w.room), b = rw.box, axis = w.side === 'n' || w.side === 's' ? 'x' as const : 'z' as const, at = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side];
    const t = halfAt(p, axis, at, w.at), into = w.side === 'n' || w.side === 'w' ? 1 : -1, lo = w.at - w.width / 2, hi = w.at + w.width / 2;
    const y0 = w.sill, y1 = w.sill + w.height, ac = (c0: number, c1: number) => lineRect(axis, at, lo, hi, into * c0, into * c1);
    useRoom(rw, liOf(levelOfRoom(p, rw)));
    // daylight, at the outside face: its room side only, so the camera above the outside of the wall sees the shutters and the room, not a pale slab
    pbox(S.sky, ac(-t + 0.004, -t + 0.012), y0, y1, 0xffffff, [{ n: 'pz', s: 'nz', w: 'px', e: 'nx' }[w.side] as Face]);
    if (multi) {
      // LD2.0-D look pass: one tall pane in a slim dark frame (a mullion only in a wide one), the reveal lined, a stone sill under a low window
      for (const e of [lo, hi - 0.035, ...(w.width > 1.9 ? [(lo + hi) / 2 - 0.0175] : [])]) rbox(S.plain, lineRect(axis, at, e, e + 0.035, into * (-t + 0.012), into * (-t + 0.05)), y0, y1, ALU);
      for (const y of [y0, y1 - 0.035]) rbox(S.plain, ac(-t + 0.012, -t + 0.05), y, y + 0.035, ALU);
      if (w.sill > 0.2) rbox(S.plain, lineRect(axis, at, lo - 0.03, hi + 0.03, into * 0.0, into * (t + 0.03)), y0 - 0.03, y0, 0xe6dccb);
      if (rw.kind === 'chambre') {
        // sheer linen drawn to either side on a dark rail
        const top2 = Math.min(y1 + 0.08, H - 0.1);
        rbox(S.plain, lineRect(axis, at, lo - 0.45, hi + 0.45, into * (t + 0.06), into * (t + 0.08)), top2, top2 + 0.025, ALU);
        for (const [a0, sgn] of [[lo - 0.42, 1], [hi + 0.42, -1]] as const) for (let k = 0; k < 4; k++) {
          const e = a0 + sgn * k * 0.1, f = k % 2 ? 0.03 : 0;
          rbox(S.plain, lineRect(axis, at, Math.min(e, e + sgn * 0.11), Math.max(e, e + sgn * 0.11), into * (t + 0.03 + f), into * (t + 0.055 + f)), 0.02, top2, 0xeee6d8);
        }
      }
      continue;
    }
    if (F.glass) {
      for (const e of [lo, (lo + hi) / 2 - 0.02, hi - 0.04]) rbox(S.plain, lineRect(axis, at, e, e + 0.04, into * (-t + 0.012), into * (-t + 0.06)), y0, y1, multi ? ALU : TRIM);
      rbox(S.plain, ac(-t + 0.012, -t + 0.06), y0 + w.height * 0.7, y0 + w.height * 0.7 + 0.04, multi ? ALU : TRIM);
    } else {
      // louvred metal shutters in the outer half of the reveal, tilted to shed the rain
      const n = Math.max(3, Math.round(w.height / 0.13)), [cx, cz] = axis === 'x' ? [(lo + hi) / 2, at + into * (-t * 0.45)] : [at + into * (-t * 0.45), (lo + hi) / 2];
      for (let k = 0; k < n; k++) S.plain.slab(w.width - 0.02, 0.012, 0.09, W(cx), Y + y0 + (k + 0.5) * (w.height / n), Z(cz), 0x2f6fb3, axis === 'x' ? 0 : Math.PI / 2, into * (axis === 'x' ? 0.55 : -0.55));
    }
    // the casement frame in the middle of the wall, the frame round the inside, the sill board
    for (const [a0, a1] of [[lo, lo + 0.04], [hi - 0.04, hi]]) rbox(S.plain, lineRect(axis, at, a0, a1, into * -0.025, into * 0.025), y0, y1, 0xf1eee8);
    rbox(S.plain, ac(-0.025, 0.025), y1 - 0.04, y1, 0xf1eee8);
    for (const [a0, a1] of [[lo - 0.06, lo], [hi, hi + 0.06]]) rbox(S.plain, lineRect(axis, at, a0, a1, into * (t - 0.004), into * (t + 0.014)), y0 - 0.05, y1 + 0.06, TRIM);
    rbox(S.plain, lineRect(axis, at, lo - 0.06, hi + 0.06, into * (t - 0.004), into * (t + 0.014)), y1, y1 + 0.06, TRIM);
    rbox(S.plain, lineRect(axis, at, lo - 0.05, hi + 0.05, into * 0.02, into * (t + 0.05)), y0 - 0.03, y0, 0xd9cbb3);
    if (rw.kind === 'chambre') {
      // curtains drawn to either side, folded, on a rail
      rbox(S.plain, lineRect(axis, at, lo - 0.45, hi + 0.45, into * (t + 0.06), into * (t + 0.08)), y1 + 0.1, y1 + 0.13, 0x6b4a2e);
      for (const [a0, sgn] of [[lo - 0.42, 1], [hi + 0.42, -1]] as const) for (let k = 0; k < 4; k++) {
        const e = a0 + sgn * k * 0.1, f = k % 2 ? 0.035 : 0;
        rbox(S.plain, lineRect(axis, at, Math.min(e, e + sgn * 0.11), Math.max(e, e + sgn * 0.11), into * (t + 0.03 + f), into * (t + 0.06 + f)), 0.08, y1 + 0.1, multi ? 0xe9e0cf : 0xb8325f);
      }
    }
  }

  // ---------------------------------------------------------------- the built-in fittings
  const at2 = (Fr: Frame, l: number, d: number): [number, number] => [Fr.bx + Fr.lat[0] * l + Fr.fw[0] * d, Fr.bz + Fr.lat[1] * l + Fr.fw[1] * d];
  /** A box in a fitting's frame: lateral middle `l` and width `w`, depth from d0 to d1 (from the wall), y0 to y1 above the floor. */
  const fbox = (bt: Batch, Fr: Frame, l: number, w: number, d0: number, d1: number, y0: number, y1: number, col: number) => {
    if (w < EPS || d1 - d0 < EPS || y1 - y0 < EPS) return;
    const [x, z] = at2(Fr, l, (d0 + d1) / 2); bt.box(w, y1 - y0, d1 - d0, W(x), Y + y0, Z(z), col, Fr.psi);
  };
  /** A cylinder standing at a point of a fitting's frame. */
  const fcyl = (bt: Batch, Fr: Frame, l: number, d: number, r0: number, r1: number, y0: number, hgt: number, col: number, seg = 12) => {
    const [x, z] = at2(Fr, l, d); bt.cyl(r0, r1, hgt, W(x), Y + y0, Z(z), col, seg);
  };
  const within = (f: Fixture, g: Fixture) => f !== g && f.box.x0 >= g.box.x0 - 1e-6 && f.box.x1 <= g.box.x1 + 1e-6 && f.box.z0 >= g.box.z0 - 1e-6 && f.box.z1 <= g.box.z1 + 1e-6;
  /** Whether a fitting's lateral end (−1 / +1) stands against a wall of its room. */
  const againstWall = (f: Fixture, Fr: Frame, end: -1 | 1) => {
    const ri = inners.find(q => q.r.id === f.room)!.i, [x, z] = at2(Fr, end * (Fr.width / 2 + 0.03), Fr.depth / 2);
    return x < ri.x0 || x > ri.x1 || z < ri.z0 || z > ri.z1;
  };
  let kitchenSpot: { x: number; z: number; y?: number } | null = null, showerSpot: { x: number; z: number; y?: number } | null = null;
  for (const f of p.fixtures) {
    const Fr = frameOf(f), d = Fr.depth, wd = Fr.width, hw = wd / 2, fr = room(f.room), fli = liOf(levelOfRoom(p, fr));
    useRoom(fr, fli);
    if (!p.fixtures.some(g => within(f, g))) { colliders.push(collide(f.box, f.h)); block(f.box, f.h); solid(f.box, f.kind === 'pool' ? -(f.depth ?? 1) : 0, f.h, false); }
    const P = S.plain;
    switch (f.kind) {
      case 'counter': {
        const tp = f.h, inset = p.fixtures.filter(g => within(g, f)), stove = inset.find(g => g.kind === 'stove');
        fbox(P, Fr, 0, wd, 0, d - 0.06, 0, 0.1, 0x3a332e);                                // plinth
        fbox(P, Fr, 0, wd, 0, d - 0.02, 0.1, tp - 0.04, F.kitchen);                        // carcass
        fbox(P, Fr, 0, wd, f.island ? -0.06 : 0, d + 0.02, tp - 0.04, tp, F.top);           // worktop (an island's overhangs its back for the stools)
        const door = new THREE.Color(F.kitchen).multiplyScalar(1.12).getHex();
        const skip: [number, number][] = stove ? [lateral(Fr, stove.box)] : [];
        for (const [a, b] of less(-hw, hw, skip, 0.2)) {
          const n = Math.max(1, Math.round((b - a) / 0.6)), sw = (b - a) / n;
          for (let k = 0; k < n; k++) {
            const lc = a + (k + 0.5) * sw;
            fbox(P, Fr, lc, sw - 0.012, d - 0.02, d - 0.004, 0.13, tp - 0.24, door);   // door
            fbox(P, Fr, lc, sw - 0.012, d - 0.02, d - 0.004, tp - 0.22, tp - 0.06, door); // drawer
            fbox(P, Fr, lc, 0.16, d - 0.004, d + 0.018, tp - 0.3, tp - 0.285, CHROME);
            fbox(P, Fr, lc, 0.12, d - 0.004, d + 0.018, tp - 0.15, tp - 0.135, CHROME);
          }
        }
        if (f.island) {
          // an island: a fruit bowl, a vase, and three stools along its back
          fcyl(P, Fr, -hw * 0.45, d / 2, 0.14, 0.1, tp, 0.07, 0xe9e4d8, 14);
          for (const [dx2, c] of [[-0.05, 0xf2b705], [0.06, 0xe4572e], [0.0, 0x6aa84f]] as const) { const [x, z] = at2(Fr, -hw * 0.45 + dx2, d / 2 + 0.02); P.sphere(0.045, W(x), Y + tp + 0.1, Z(z), c); }
          fcyl(P, Fr, hw * 0.5, d / 2, 0.05, 0.07, tp, 0.26, 0x2f4f6f, 10);
          for (let k = 0; k < 3; k++) { const l = (k - 1) * (wd / 3); fcyl(P, Fr, l, -0.35, 0.17, 0.17, 0.62, 0.06, 0x3a2a1e, 14); fcyl(P, Fr, l, -0.35, 0.025, 0.025, 0, 0.62, ALU, 6); fcyl(P, Fr, l, -0.35, 0.16, 0.16, 0, 0.02, ALU, 12); }
          break;
        }
        // the wall cupboards above, clear of the hood and of a window over the counter
        const back = ({ n: 's', s: 'n', e: 'w', w: 'e' } as const)[f.front];
        // (a window on the wall behind: its span along that wall, which runs along the counter's lateral axis)
        const winSpans = p.windows.filter(w => w.room === f.room && w.side === back).map(w => lateral(Fr, w.side === 'n' || w.side === 's'
          ? { x0: w.at - w.width / 2 - 0.08, x1: w.at + w.width / 2 + 0.08, z0: Fr.bz, z1: Fr.bz } : { x0: Fr.bx, x1: Fr.bx, z0: w.at - w.width / 2 - 0.08, z1: w.at + w.width / 2 + 0.08 }));
        const hood = stove ? lateral(Fr, stove.box) : null;
        for (const [a, b] of less(-hw, hw, [...winSpans, ...(hood ? [[hood[0] - 0.04, hood[1] + 0.04] as [number, number]] : [])], 0.3)) {
          fbox(P, Fr, (a + b) / 2, b - a, 0, 0.34, 1.45, 2.15, F.kitchen);
          const n = Math.max(1, Math.round((b - a) / 0.5)), sw = (b - a) / n;
          for (let k = 0; k < n; k++) { const lc = a + (k + 0.5) * sw; fbox(P, Fr, lc, sw - 0.012, 0.34, 0.352, 1.47, 2.13, door); fbox(P, Fr, lc, 0.14, 0.352, 0.37, 1.5, 1.515, CHROME); }
        }
        break;
      }
      case 'sink': {
        const y = f.h;
        fbox(P, Fr, 0, wd - 0.08, 0.06, d - 0.05, y, y + 0.006, 0xb8bcc0);
        fbox(P, Fr, 0.02, wd - 0.24, 0.12, d - 0.12, y + 0.006, y + 0.008, 0x5d6166);
        fcyl(P, Fr, 0.02, d / 2, 0.025, 0.025, y + 0.008, 0.003, 0x222222, 8);
        for (let k = 0; k < 4; k++) fbox(P, Fr, -hw + 0.05 + k * 0.012 + 0.003, 0.004, 0.12, d - 0.12, y + 0.006, y + 0.009, 0x9da1a6);
        fcyl(P, Fr, 0.02, 0.05, 0.016, 0.018, y, 0.27, CHROME, 8);                     // the tap: riser, spout, lever
        fbox(P, Fr, 0.02, 0.026, 0.04, 0.24, y + 0.25, y + 0.275, CHROME);
        fbox(P, Fr, 0.02, 0.1, 0.03, 0.05, y + 0.28, y + 0.295, CHROME);
        fbox(P, Fr, 0.24, 0.12, 0.08, 0.2, y + 0.006, y + 0.06, 0x2f8f4e);                // a sponge and a bowl drying
        fcyl(P, Fr, -0.22, d / 2, 0.08, 0.06, y + 0.006, 0.06, 0xe9e4d8, 12);
        const [kx, kz] = at2(Fr, 0, d + 0.55); kitchenSpot ??= { x: W(kx), z: Z(kz), y: Y - Y0 };
        break;
      }
      case 'stove': {
        const y = f.h;
        fbox(P, Fr, 0, wd - 0.04, 0.03, d - 0.03, y, y + 0.008, 0x1d1d1f);
        for (const [l, dd] of [[-0.14, 0.18], [0.14, 0.18], [-0.14, 0.42], [0.14, 0.42]]) {
          fcyl(P, Fr, l, dd, 0.075, 0.075, y + 0.008, 0.012, 0x3b3b3b, 14);
          fcyl(P, Fr, l, dd, 0.035, 0.04, y + 0.02, 0.012, 0x121212, 10);
        }
        fcyl(P, Fr, 0.14, 0.18, 0.12, 0.11, y + 0.032, 0.13, 0x9da2a6, 14);             // a pot on the back burner, its lid and knob
        fcyl(P, Fr, 0.14, 0.18, 0.122, 0.122, y + 0.162, 0.012, 0xb4b9bd, 14);
        fcyl(P, Fr, 0.14, 0.18, 0.02, 0.02, y + 0.174, 0.025, 0x222222, 6);
        // the oven door, its window and its handle, the knobs, the hood above
        fbox(P, Fr, 0, wd - 0.04, d - 0.024, d - 0.002, 0.16, y - 0.18, 0x2a2a2c);
        fbox(P, Fr, 0, wd - 0.2, d - 0.002, d + 0.002, 0.28, y - 0.32, 0x15191d);
        fbox(P, Fr, 0, wd - 0.12, d + 0.002, d + 0.035, y - 0.24, y - 0.22, CHROME);
        fbox(P, Fr, 0, wd - 0.04, d - 0.024, d - 0.002, y - 0.16, y - 0.04, 0x323234);
        for (let k = 0; k < 4; k++) { const [x, z] = at2(Fr, -0.21 + k * 0.14, d - 0.002); P.cyl(0.022, 0.022, 0.025, W(x), Y + y - 0.1, Z(z), 0xd8d8d8, 10, [Math.PI / 2, Fr.psi, 0]); }
        fbox(P, Fr, 0, wd + 0.02, 0, 0.46, 1.72, 1.86, 0xc9cdd1);
        fbox(P, Fr, 0, 0.28, 0, 0.24, 1.86, H - 0.01, 0xc9cdd1);
        break;
      }
      case 'fridge': {
        fbox(P, Fr, 0, wd - 0.02, 0, d - 0.01, 0.02, f.h, 0xeeeeec);
        fbox(P, Fr, 0, wd - 0.06, 0.02, d - 0.06, 0, 0.02, 0x222222);
        fbox(P, Fr, 0, wd - 0.02, d - 0.01, d - 0.006, f.h * 0.68, f.h * 0.68 + 0.012, 0x9a9a98);
        const hl = (againstWall(f, Fr, -1) ? 1 : -1) * (hw - 0.07);                          // the handles on the side away from the wall
        fbox(P, Fr, hl, 0.025, d - 0.006, d + 0.03, f.h * 0.72, f.h * 0.9, 0xb5b9bd);
        fbox(P, Fr, hl, 0.025, d - 0.006, d + 0.03, f.h * 0.38, f.h * 0.6, 0xb5b9bd);
        fbox(P, Fr, -0.12, 0.16, 0.2, 0.32, f.h, f.h + 0.12, 0xd9482b);                    // a box of tea and a little plant on top
        fcyl(P, Fr, 0.12, d / 2, 0.06, 0.05, f.h, 0.1, 0xb85c38, 8);
        const [px, pz] = at2(Fr, 0.12, d / 2); P.blob(0.11, W(px), Y + f.h + 0.17, Z(pz), 0x3f7a35, 0.8, 0);
        break;
      }
      case 'shower': {
        fbox(P, Fr, 0, wd, 0, d, 0, 0.07, WHITE);                                         // the tray, its floor, the drain
        fbox(P, Fr, 0, wd - 0.08, 0.04, d - 0.04, 0.07, 0.072, 0xe2e9ec);
        fcyl(P, Fr, 0, d / 2, 0.04, 0.04, 0.072, 0.003, 0x7a7f84, 10);
        // faience up to the head on the walls round the tray (LD2.0-D look pass: the villa's bathrooms are stone from floor to ceiling)
        if (!multi) {
          fbox(S.tiles, Fr, 0, wd, -0.004, 0.006, DADO, 2.1, 0xa8cde0);
          for (const e of [-1, 1] as const) if (againstWall(f, Fr, e)) fbox(S.tiles, Fr, e * (hw + 0.001), 0.01, 0, d, DADO, 2.1, 0xa8cde0);
        }
        // glass on the open side, a curtain on the rail across the front, gathered toward the wall
        const open = againstWall(f, Fr, -1) ? 1 : -1;
        if (!againstWall(f, Fr, open)) {
          fbox(P, Fr, open * (hw - 0.01), 0.014, 0.04, d - 0.02, 0.07, 2.0, 0xcfe4ee);
          fbox(P, Fr, open * (hw - 0.01), 0.03, d - 0.03, d, 0.07, 2.02, CHROME);
        }
        fbox(P, Fr, 0, wd, d - 0.025, d - 0.01, 1.98, 2.0, CHROME);
        if (multi) fbox(P, Fr, open * hw * 0.25, wd * 0.5, d - 0.02, d - 0.006, 0.07, 1.98, 0xd3e6ee);           // a fixed glass screen across half the front
        else for (let k = 0; k < 4; k++) { const l = -open * (hw - 0.07 - k * 0.07), f2 = k % 2 ? 0.025 : 0; fbox(P, Fr, l, 0.075, d - 0.06 + f2, d - 0.035 + f2, 0.16, 1.97, 0xf4c20d); }
        fcyl(P, Fr, -open * 0.12, 0.03, 0.013, 0.013, 1.05, 1.0, CHROME, 8);               // the riser, the mixer, the arm and the head
        fbox(P, Fr, -open * 0.12, 0.16, 0.0, 0.06, 1.0, 1.1, CHROME);
        fbox(P, Fr, -open * 0.12, 0.022, 0.02, 0.3, 2.03, 2.05, CHROME);
        fcyl(P, Fr, -open * 0.12, 0.3, 0.085, 0.07, 1.99, 0.04, 0xb8bcc0, 14);
        fbox(P, Fr, open * (hw - 0.18), 0.2, 0.0, 0.1, 1.2, 1.22, CHROME);                   // a soap shelf and a bottle
        fcyl(P, Fr, open * (hw - 0.14), 0.05, 0.025, 0.025, 1.22, 0.16, 0x2a8fd1, 8);
        const [sx, sz] = at2(Fr, open * (hw - 0.07), d + 0.35); showerSpot ??= { x: W(sx), z: Z(sz), y: Y - Y0 };
        break;
      }
      case 'wc': {
        fbox(P, Fr, 0, 0.44, 0, 0.19, 0.42, f.h, WHITE);                                    // the cistern and its button
        fcyl(P, Fr, 0, 0.095, 0.028, 0.028, f.h, 0.008, 0xd9d9d9, 10);
        fbox(P, Fr, 0, 0.21, 0.19, 0.46, 0, 0.36, WHITE);                                   // the pedestal
        const ell = (r0: number, r1: number, hh: number, y: number, col: number) => {
          const g = new THREE.CylinderGeometry(r0, r1, hh, 18); g.scale(1, 1, 1.4); g.translate(0, hh / 2, 0);
          const [x, z] = at2(Fr, 0, 0.19 + r0 * 1.4); P.geometry(g, col, W(x), Y + y, Z(z), Fr.psi);
        };
        ell(0.165, 0.13, 0.1, 0.32, WHITE); ell(0.175, 0.175, 0.025, 0.42, 0xfbfbfb);
        const pe = againstWall(f, Fr, -1) ? -1 : againstWall(f, Fr, 1) ? 1 : 0;              // the paper on the wall beside it
        if (pe) { const [x, z] = at2(Fr, pe * (hw - 0.07), 0.4); P.cyl(0.055, 0.055, 0.11, W(x), Y + 0.68, Z(z), WHITE, 10, [Math.PI / 2, Fr.psi, 0]); }
        break;
      }
      case 'basin': {
        if (multi) {
          // LD2.0-D look pass: a floating walnut vanity, a white top and a stone vessel, a round mirror lit from behind
          fbox(P, Fr, 0, wd - 0.02, 0, d - 0.02, 0.42, 0.8, WALNUT);
          fbox(P, Fr, 0, wd, 0, d, 0.8, 0.83, 0xf4f2ee);
          fcyl(P, Fr, 0, d / 2, 0.17, 0.13, 0.83, 0.13, 0xf7f6f2, 16);
          fcyl(P, Fr, 0, 0.06, 0.014, 0.014, 0.83, 0.3, 0x2b2b2b, 8);
          fbox(P, Fr, 0, 0.02, 0.06, 0.2, 1.1, 1.12, 0x2b2b2b);
          const [mx, mz] = at2(Fr, 0, 0.02);
          S.glow.cyl(0.33, 0.33, 0.01, W(mx), Y + 1.55, Z(mz), COVE, 24, [Math.PI / 2, Fr.psi, 0]);
          const [nx, nz] = at2(Fr, 0, 0.035);
          P.cyl(0.3, 0.3, 0.012, W(nx), Y + 1.55, Z(nz), 0xbfd0d8, 24, [Math.PI / 2, Fr.psi, 0]);
          break;
        }
        fcyl(P, Fr, 0, 0.2, 0.07, 0.09, 0, 0.67, WHITE, 12);                               // pedestal, basin, bowl, tap
        fbox(P, Fr, 0, wd - 0.04, 0.02, d, 0.67, f.h, 0xf7f7f5);
        fbox(P, Fr, 0, wd - 0.2, 0.12, d - 0.08, f.h, f.h + 0.002, 0xd6e0e6);
        fcyl(P, Fr, 0, 0.07, 0.015, 0.015, f.h, 0.14, CHROME, 8);
        fbox(P, Fr, 0, 0.022, 0.06, 0.17, f.h + 0.12, f.h + 0.14, CHROME);
        fbox(P, Fr, 0, wd - 0.04, 0, 0.02, 1.12, 1.86, TRIM);                              // the mirror in its frame, a light on it
        fbox(P, Fr, 0, wd - 0.1, 0.02, 0.026, 1.16, 1.82, 0xb5c9d4);
        fbox(P, Fr, -0.12, 0.06, 0.026, 0.028, 1.3, 1.7, 0xe2edf2);
        fbox(P, Fr, 0, wd - 0.1, 0, 0.12, 1.05, 1.07, 0xf2f2ee);                            // the shelf: a cup and a soap
        fcyl(P, Fr, 0.16, 0.06, 0.03, 0.026, 1.07, 0.09, 0x1a9d54, 8);
        fbox(P, Fr, -0.14, 0.08, 0.03, 0.08, 1.07, 1.1, 0xf3e3a0);
        break;
      }
      case 'bath': {
        // LD2.0-D: a bathtub along the wall, its rim, the water, the mixer and a folded towel on the rim
        fbox(P, Fr, 0, wd, 0, d, 0, f.h, WHITE);
        fbox(P, Fr, 0, wd - 0.16, 0.08, d - 0.08, f.h, f.h + 0.004, 0xbfe0ea);
        fbox(P, Fr, 0, wd + 0.02, d - 0.03, d + 0.01, 0.0, f.h + 0.02, 0xf2f0ea);
        fcyl(P, Fr, -hw + 0.18, 0.06, 0.02, 0.02, f.h, 0.2, CHROME, 8);
        fbox(P, Fr, -hw + 0.18, 0.03, 0.04, 0.2, f.h + 0.18, f.h + 0.2, CHROME);
        fbox(P, Fr, hw - 0.3, 0.36, d - 0.07, d + 0.02, f.h + 0.004, f.h + 0.06, 0xd8b45a);
        if (!multi) fbox(S.tiles, Fr, 0, wd, -0.004, 0.006, DADO, 2.0, 0xa8cde0);
        break;
      }
      case 'pool': drawPool(f); break;
      case 'post': {
        // LD2.0-D look pass: a pergola's post, dark bronze steel on a small plate
        fbox(P, Fr, 0, wd - 0.04, 0.02, d - 0.02, 0, f.h, 0x3a332c);
        fbox(P, Fr, 0, wd, 0, d, 0, 0.02, 0x2c2723);
        break;
      }
      case 'heli': break;                                                                       // the helicopter itself, below (src/world/helicopter.ts)
    }
  }
  /** LD2.0-D: the pool: a mosaic basin (its walls, its floor, steps down at one end), a travertine coping round it, the water, lit at night. */
  function drawPool(f: Fixture) {
    use(liOf(levelOfRoom(p, room(f.room))), false);
    const b = f.box, dp = f.depth ?? 1.4, cw = 0.32, MOSAIC = 0x3aa6c8;
    // the coping, flush with the deck, round the water
    for (const r of [{ x0: b.x0 - cw, x1: b.x1 + cw, z0: b.z0 - cw, z1: b.z0 }, { x0: b.x0 - cw, x1: b.x1 + cw, z0: b.z1, z1: b.z1 + cw }, { x0: b.x0 - cw, x1: b.x0, z0: b.z0, z1: b.z1 }, { x0: b.x1, x1: b.x1 + cw, z0: b.z0, z1: b.z1 }]) {
      rbox(S.stone, r, -0.02, 0.025, 0xf2e9d8);
    }
    // the basin's walls (seen from inside) and its floor
    pbox(S.plain, { x0: b.x0, x1: b.x1, z0: b.z0 - 0.02, z1: b.z0 }, -dp, 0, MOSAIC, ['pz']);
    pbox(S.plain, { x0: b.x0, x1: b.x1, z0: b.z1, z1: b.z1 + 0.02 }, -dp, 0, MOSAIC, ['nz']);
    pbox(S.plain, { x0: b.x0 - 0.02, x1: b.x0, z0: b.z0, z1: b.z1 }, -dp, 0, MOSAIC, ['px']);
    pbox(S.plain, { x0: b.x1, x1: b.x1 + 0.02, z0: b.z0, z1: b.z1 }, -dp, 0, MOSAIC, ['nx']);
    S.floor.flat(b.x1 - b.x0, b.z1 - b.z0, W((b.x0 + b.x1) / 2), Y - dp, Z((b.z0 + b.z1) / 2), 0x7fd0e6);
    // a dark tile line along the bottom, the steps down at the west end, a band of glazed tiles at the waterline
    for (let k = 0; k < 3; k++) { const sz = 0.4; rbox(S.plain, { x0: b.x0, x1: b.x0 + sz * (3 - k), z0: b.z0 + 0.5, z1: b.z1 - 0.5 }, -dp, -dp + (k + 1) * (dp / 4), k % 2 ? 0xd9eef4 : 0xc5e6ef); }
    rbox(S.plain, { x0: b.x0 + 2, x1: b.x1 - 0.6, z0: (b.z0 + b.z1) / 2 - 0.08, z1: (b.z0 + b.z1) / 2 + 0.08 }, -dp, -dp + 0.006, 0x1d5f86);
    for (const r of [{ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + 0.012 }, { x0: b.x0, x1: b.x1, z0: b.z1 - 0.012, z1: b.z1 }, { x0: b.x0, x1: b.x0 + 0.012, z0: b.z0, z1: b.z1 }, { x0: b.x1 - 0.012, x1: b.x1, z0: b.z0, z1: b.z1 }]) rbox(S.plain, r, -0.2, -0.02, 0x1f6f9a);
    // the water, a hand's breadth under the coping
    S.water.flat(b.x1 - b.x0, b.z1 - b.z0, W((b.x0 + b.x1) / 2), Y - 0.12, Z((b.z0 + b.z1) / 2), 0xffffff);
  }

  // ---------------------------------------------------------------- LD2.0-D: the stairs
  for (const st of parts2) stairs(st);
  function stairs(st: StairPart) {
    const lo = liOf(st.lower), up = liOf(st.upper), rise = st.upper.y - st.lower.y, n = st.s.steps, b = st.box, along = st.axis;
    const len = Math.abs(st.head - st.foot), going = len / (n - 1);
    use(lo, false);
    const TREAD = 0xece4d6, RISER = 0xd8cdb9, STRINGER = 0xbdb1a0;
    // the steps: n − 1 solid blocks (the last riser lands on the floor above), each with a stone tread proud of its riser
    for (let k = 1; k < n; k++) {
      const u0 = st.foot + st.dir * (k - 1) * going, u1 = st.foot + st.dir * k * going, h1 = k * (rise / n);
      const r = along === 'z' ? { x0: b.x0, x1: b.x1, z0: Math.min(u0, u1), z1: Math.max(u0, u1) } : { x0: Math.min(u0, u1), x1: Math.max(u0, u1), z0: b.z0, z1: b.z1 };
      const riser: Face = along === 'z' ? (st.dir > 0 ? 'nz' : 'pz') : (st.dir > 0 ? 'nx' : 'px');
      pbox(S.plain, r, Math.max(0, h1 - rise / n - 0.02), h1 - 0.03, RISER, along === 'z' ? [riser, 'px', 'nx'] : [riser, 'pz', 'nz']);
      if (k > 1) pbox(S.plain, r, 0, h1 - rise / n - 0.02, STRINGER, along === 'z' ? ['px', 'nx'] : ['pz', 'nz']);
      const tr = along === 'z' ? { ...r, z0: r.z0 - (st.dir < 0 ? 0 : 0.025), z1: r.z1 + (st.dir < 0 ? 0.025 : 0) } : { ...r, x0: r.x0 - (st.dir < 0 ? 0 : 0.025), x1: r.x1 + (st.dir < 0 ? 0.025 : 0) };
      rbox(S.plain, tr, h1 - 0.03, h1, TREAD);
    }
    // the balustrade on the open side: glass following the flight, a handrail on posts; along a wall, a handrail on brackets
    const slope = rise / len, hand = 0.92;
    const sideLines = along === 'z' ? [b.x0, b.x1] : [b.z0, b.z1];
    for (const sl of sideLines) {
      const open = st.balustrades.some(q => along === 'z' ? Math.abs((q.x0 + q.x1) / 2 - sl) < 0.05 : Math.abs((q.z0 + q.z1) / 2 - sl) < 0.05);
      const inward = (along === 'z' ? (sl === b.x0 ? 1 : -1) : (sl === b.z0 ? 1 : -1)) * (open ? 0 : -1);
      const railOff = open ? 0 : -inward * 0.06;                                                   // along a wall: a little off it
      // a sloped bar from foot to head, `y` above the pitch line
      const sloped = (bt: Batch, yOff: number, th: number, wd2: number, c: number) => {
        const g = new THREE.BoxGeometry(along === 'z' ? wd2 : len + 0.3, th, along === 'z' ? len + 0.3 : wd2);
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) { const u = along === 'z' ? pos.getZ(i) : pos.getX(i); pos.setY(i, pos.getY(i) + (u * st.dir) * slope); }
        g.computeVertexNormals();
        const mid = (st.foot + st.head) / 2, [x, z] = along === 'z' ? [sl + railOff, mid] : [mid, sl + railOff];
        bt.geometry(g, c, W(x), Y + rise / 2 + yOff, Z(z));
      };
      if (open) {
        const g = new THREE.PlaneGeometry(len, 0.86);
        if (along === 'z') g.rotateY(Math.PI / 2);
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) { const u = along === 'z' ? pos.getZ(i) : pos.getX(i); pos.setY(i, pos.getY(i) + (u * st.dir) * slope); }
        const mid = (st.foot + st.head) / 2, [x, z] = along === 'z' ? [sl, mid] : [mid, sl];
        S.glass.geometry(g, 0xffffff, W(x), Y + rise / 2 + 0.47, Z(z));
        sloped(S.plain, hand, 0.05, 0.06, ALU);
        sloped(S.plain, 0.02, 0.06, 0.08, STRINGER);
        for (const u of [st.foot, st.head]) { const hgt = (u === st.foot ? 0 : rise) + hand + 0.03, [x2, z2] = along === 'z' ? [sl, u] : [u, sl]; S.plain.box(0.06, hgt, 0.06, W(x2), Y, Z(z2), ALU); }
      } else sloped(S.plain, hand, 0.045, 0.045, 0x6b4a2e);
    }
    // its balustrade stops anyone walking off the flight's side, on both floors (the collider spans both levels)
    for (const r of st.balustrades) { colliders.push(collide(r, rise + 1.0)); block(r, rise + 1.0); }
    // upstairs: the slab's edge round the well, and a glass railing where nothing else stands
    use(up, false);
    const w = st.well;
    for (const e of [{ x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z0 + 0.02 }, { x0: w.x0, x1: w.x1, z0: w.z1 - 0.02, z1: w.z1 }, { x0: w.x0, x1: w.x0 + 0.02, z0: w.z0, z1: w.z1 }, { x0: w.x1 - 0.02, x1: w.x1, z0: w.z0, z1: w.z1 }]) rbox(S.plain, e, -slabAbove(up - 1), -0.003, BAND);
    for (const r of st.rails) {
      const ax = r.x1 - r.x0 > r.z1 - r.z0 ? 'x' as const : 'z' as const, at = ax === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2, a = ax === 'x' ? r.x0 : r.z0, b2 = ax === 'x' ? r.x1 : r.z1;
      rbox(S.glass, lineRect(ax, at, a, b2, -0.01, 0.01), 0.04, 1.02, 0xffffff);
      rbox(S.plain, lineRect(ax, at, a, b2, -0.03, 0.03), 1.02, 1.07, ALU);
      for (const c2 of [a, b2]) rbox(S.plain, lineRect(ax, at, c2 - 0.03, c2 + 0.03, -0.03, 0.03), 0, 1.07, ALU);
      colliders.push(collide(r, 1.1)); block(r, 1.1);
    }
  }

  // ---------------------------------------------------------------- LD2.0-D look pass: the pergolas (oak slats on two dark beams, on their posts)
  for (const pg of p.pergolas ?? []) {
    use(liOf(levelOfRoom(p, room(pg.room))), false);
    const b = pg.box, y = pg.h;
    for (const z of [b.z0 + 0.15, b.z1 - 0.15]) rbox(S.plain, { x0: b.x0, x1: b.x1, z0: z - 0.06, z1: z + 0.06 }, y - 0.2, y, 0x3a332c);
    for (const x of [b.x0 + 0.15, b.x1 - 0.15]) rbox(S.plain, { x0: x - 0.06, x1: x + 0.06, z0: b.z0, z1: b.z1 }, y - 0.2, y - 0.02, 0x3a332c);
    for (let x = b.x0 + 0.1; x < b.x1 - 0.05; x += 0.2) rbox(S.plain, { x0: x - 0.035, x1: x + 0.035, z0: b.z0 - 0.1, z1: b.z1 + 0.1 }, y, y + 0.12, OAK);
  }

  // ---------------------------------------------------------------- LD2.0-D: the roof's helipad and its helicopter, the lot round the house
  for (const m of p.marks ?? []) {
    const rm = room(m.room); use(liOf(levelOfRoom(p, rm)), false);
    const disc = (r0: number, r1: number, y: number, c: number) => { const g = new THREE.RingGeometry(r0, r1, 48, 1); g.rotateX(-Math.PI / 2); S.plain.geometry(g, c, W(m.x), Y + y, Z(m.z)); };
    disc(0, m.r, 0.012, 0x4b4f55); disc(m.r - 0.32, m.r - 0.16, 0.016, 0xf4f1e8); disc(m.r - 0.08, m.r, 0.016, 0xf2c230);
    // the H, painted (its uprights along the helicopter's length: turned with its heading)
    const across = Math.abs(Math.sin(m.yaw ?? 0)) > 0.5;
    for (const [a, b, w2, d2] of [[-0.62, 0, 0.32, 2.2], [0.62, 0, 0.32, 2.2], [0, 0, 0.92, 0.32]] as const) {
      const [x, z, w, d] = across ? [b, a, d2, w2] : [a, b, w2, d2];
      S.plain.box(w, 0.004, d, W(m.x + x), Y + 0.016, Z(m.z + z), 0xf4f1e8);
    }
    // the edge lights round it: little domes that glow at night
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; S.glow.cyl(0.05, 0.07, 0.07, W(m.x + Math.cos(a) * (m.r + 0.12)), Y, Z(m.z + Math.sin(a) * (m.r + 0.12)), k % 3 ? 0x8fd16b : 0xf7d36b, 8); }
    const heli = p.fixtures.find(f => f.kind === 'heli' && f.room === m.room);
    if (heli) {
      const hb = buildHelicopter(), g = hb.group;
      g.position.set(W(m.x), Y + 0.02, Z(m.z)); g.rotation.y = m.yaw ?? 0;                     // its heading on the pad (HELIPAD.yaw: its nose toward −x)
      g.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = false; mm.receiveShadow = false; } });
      S.g.add(g);
    }
  }
  /** The lot round the house on the ground floor: lawn, the path to the door and the driveway, the lot's walls, the porch (seen past the house's sides). */
  function ground() {
    use(0, false);
    const B = homeBox(p), house = { x0: Math.min(...p.rooms.filter(r => !r.outdoor && liOf(levelOfRoom(p, r)) === 0).map(r => r.box.x0)), x1: Math.max(...p.rooms.filter(r => !r.outdoor && liOf(levelOfRoom(p, r)) === 0).map(r => r.box.x1)), z0: Math.min(...p.rooms.filter(r => !r.outdoor && liOf(levelOfRoom(p, r)) === 0).map(r => r.box.z0)), z1: Math.max(...p.rooms.filter(r => !r.outdoor && liOf(levelOfRoom(p, r)) === 0).map(r => r.box.z1)) };
    const lot = { x0: B.x0, x1: B.x1, z0: B.z0, z1: p.yard !== undefined ? house.z1 + p.yard : B.x1 }, GT = p.gate ?? GATE;   // a square lot (its street side as far from the middle as its sides), or the front yard the plan asks for
    const t = p.outWall / 2, LAWN = 0x86ad5a, PATH = 0xd8ccb4, front = p.openings.find(o => o.kind === 'front');
    for (const r of [{ x0: lot.x0, x1: house.x0 - t, z0: house.z0 - t, z1: house.z1 + t }, { x0: house.x1 + t, x1: lot.x1, z0: house.z0 - t, z1: house.z1 + t }, { x0: lot.x0, x1: lot.x1, z0: house.z1 + t, z1: lot.z1 }]) {
      rbox(S.plain, r, -0.06, -0.03, LAWN);
    }
    if (front) {
      rbox(S.plain, { x0: front.x - 0.9, x1: front.x + 0.9, z0: house.z1 + t, z1: house.z1 + 1.4 }, -0.03, 0.08, PATH);   // the porch step
      rbox(S.plain, { x0: front.x - 0.6, x1: front.x + 0.6, z0: house.z1 + 1.4, z1: lot.z1 }, -0.03, -0.015, PATH);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) S.plain.blob(0.28, W(front.x + s * 1.2), Y - 0.03 + 0.18, Z(house.z1 + 2.2 + k * 1.4), 0x3f7a35, 0.8, 0);
    }
    rbox(S.plain, { x0: GT.x0, x1: GT.x1, z0: house.z1 + t, z1: lot.z1 }, -0.03, -0.012, 0xb9b2a6);           // the driveway (src/housing/villa.ts GATE)
    for (const r of [{ x0: lot.x0 - 0.12, x1: lot.x0 + 0.12, z0: house.z0, z1: lot.z1 }, { x0: lot.x1 - 0.12, x1: lot.x1 + 0.12, z0: house.z0, z1: lot.z1 }, { x0: lot.x0, x1: GT.x0, z0: lot.z1 - 0.12, z1: lot.z1 + 0.12 }, { x0: GT.x1, x1: lot.x1, z0: lot.z1 - 0.12, z1: lot.z1 + 0.12 }]) {
      rbox(S.wall, r, -0.06, WALL_H, 0xeee3cf); rbox(S.plain, grow2(r, 0.03), WALL_H, WALL_H + 0.06, COPING);
    }
    // palms in the front yard's corners
    for (const [x, z] of (p.yard !== undefined ? [[lot.x1 - 1.4, house.z1 + 1.8], [lot.x0 + 1.2, lot.z1 - 1.2]] : [[lot.x0 + 1.4, lot.z1 - 1.6], [lot.x1 - 1.4, house.z1 + 1.6], [lot.x0 + 1.2, house.z1 + 1.2]]) as readonly (readonly [number, number])[]) {
      S.plain.cyl(0.12, 0.17, 4.2, W(x), Y - 0.03, Z(z), 0x8a6a48, 7);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; S.plain.slab(0.32, 0.05, 1.9, W(x + Math.sin(a) * 0.8), Y + 4.0, Z(z + Math.cos(a) * 0.8), 0x3f7a35, a, 0.45); }
    }
  }

  // ---------------------------------------------------------------- lamps, and a few things on the walls
  const lampAt = new Map<string, THREE.Vector3>();
  /** Is the wall behind a decoration solid there (no opening, no window)? */
  const solidWall = (r: Room, side: Side, a0: number, a1: number) => {
    const line = { n: r.box.z0, s: r.box.z1, w: r.box.x0, e: r.box.x1 }[side], axis = side === 'n' || side === 's' ? 'x' : 'z';
    if (p.openings.some(o => o.axis === axis && Math.abs((axis === 'x' ? o.z : o.x) - line) < 1e-6 && a0 < (axis === 'x' ? o.x : o.z) + o.width / 2 + 0.1 && a1 > (axis === 'x' ? o.x : o.z) - o.width / 2 - 0.1)) return false;
    return !p.windows.some(w => w.room === r.id && w.side === side && a0 < w.at + w.width / 2 + 0.1 && a1 > w.at - w.width / 2 - 0.1);
  };
  for (const { r, i, li } of inners) {
    const cx = (i.x0 + i.x1) / 2, cz = (i.z0 + i.z1) / 2, long = i.x1 - i.x0 > 4.5;
    use(li, li < top && multi);
    if (r.outdoor) { lampAt.set(r.id, new THREE.Vector3(W(cx), Y + 2.8, Z(cz))); continue; }
    lampAt.set(r.id, new THREE.Vector3(W(cx), Y + H - 0.6, Z(cz)));
    // LD2.0-D look pass: no lamp hangs in the villa (its cove strips glow at night, and a chandelier bought for a room never meets a built-in one)
    if (multi) {
      useRoom(r, li);
      if (r.kind === 'sdb' && solidWall(r, 'e', i.z1 - 0.62, i.z1 - 0.18)) {
        rbox(S.plain, { x0: i.x1 - 0.04, x1: i.x1, z0: i.z1 - 0.62, z1: i.z1 - 0.18 }, 1.38, 1.4, 0xa88a5a);
        rbox(S.plain, { x0: i.x1 - 0.05, x1: i.x1 - 0.01, z0: i.z1 - 0.58, z1: i.z1 - 0.22 }, 0.9, 1.4, 0xe9e2d4);
      }
      continue;
    }
    for (const lx of long ? [cx - (i.x1 - i.x0) / 4, cx + (i.x1 - i.x0) / 4] : [cx]) {
      S.plain.cyl(0.06, 0.06, 0.025, W(lx), Y + H - 0.025, Z(cz), 0xf2f2ee, 10);                  // the ceiling rose, the cord
      if (r.kind === 'sejour' || r.kind === 'chambre' || r.kind === 'manger') {
        S.plain.cyl(0.006, 0.006, 0.26, W(lx), Y + H - 0.28, Z(cz), 0x333333, 4);
        S.glow.cyl(0.14, 0.17, 0.15, W(lx), Y + H - 0.43, Z(cz), r.kind === 'chambre' ? 0xf0dcc0 : 0xf4ead6, 16);   // a fabric drum shade
      } else {
        S.plain.cyl(0.006, 0.006, 0.16, W(lx), Y + H - 0.18, Z(cz), 0x333333, 4);
        S.glow.sphere(0.095, W(lx), Y + H - 0.27, Z(cz), 0xfaf4e6);                               // an opal globe
      }
    }
    useRoom(r, li);
    if (r.kind === 'sejour' && (!multi || solidWall(r, 'n', i.x0 + 0.9, i.x0 + 2.5))) {           // two frames (blank on purpose: no real people) and a clock
      for (const [k, c] of [[0, 0x7a5a3c], [1, 0x3d4a5c]] as const) {
        const x = i.x0 + 1.3 + k * 0.85;
        rbox(S.plain, { x0: x - 0.3, x1: x + 0.3, z0: i.z0, z1: i.z0 + 0.03 }, 1.45, 1.9, c);
        rbox(S.plain, { x0: x - 0.24, x1: x + 0.24, z0: i.z0 + 0.03, z1: i.z0 + 0.04 }, 1.5, 1.85, 0xd9d2c4);
      }
      if (!multi || solidWall(r, 'w', cz - 0.3, cz + 0.3)) {
        S.plain.cyl(0.18, 0.18, 0.03, W(i.x0), Y + 1.95, Z(cz), 0xf2f2ec, 16, [0, 0, -Math.PI / 2]);
        S.plain.cyl(0.15, 0.15, 0.004, W(i.x0 + 0.03), Y + 1.95, Z(cz), 0xffffff, 16, [0, 0, -Math.PI / 2]);
      }
    } else if (r.kind === 'entree' && (!multi || solidWall(r, 'e', cz - 0.45, cz + 0.45))) {      // a coat rack, a meter box over the door
      rbox(S.plain, { x0: i.x1 - 0.03, x1: i.x1, z0: cz - 0.4, z1: cz + 0.4 }, 1.55, 1.65, 0x6b4a2e);
      for (const dz of [-0.25, 0, 0.25]) rbox(S.plain, { x0: i.x1 - 0.1, x1: i.x1 - 0.03, z0: cz + dz - 0.015, z1: cz + dz + 0.015 }, 1.58, 1.61, 0x2a2a2a);
      rbox(S.plain, { x0: i.x1 - 0.12, x1: i.x1 - 0.03, z0: cz - 0.38, z1: cz - 0.12 }, 0.9, 1.55, 0x1f5aa8);       // a coat on a hook
      rbox(S.plain, { x0: i.x1 - 0.05, x1: i.x1, z0: i.z0 + 0.1, z1: i.z0 + 0.42 }, 1.9, 2.3, 0xe8e8e4);
    } else if (r.kind === 'sdb' && (!multi || solidWall(r, 'e', i.z1 - 0.62, i.z1 - 0.18))) {     // a towel on a rail
      rbox(S.plain, { x0: i.x1 - 0.04, x1: i.x1, z0: i.z1 - 0.62, z1: i.z1 - 0.18 }, 1.38, 1.4, CHROME);
      rbox(S.plain, { x0: i.x1 - 0.05, x1: i.x1 - 0.01, z0: i.z1 - 0.58, z1: i.z1 - 0.22 }, 0.9, 1.4, 0x1a9d54);
    }
  }

  // ---------------------------------------------------------------- meshes (one per material, per part)
  const glows: THREE.Mesh[] = [];
  for (const { shell, core } of parts) for (const part of core === shell ? [shell] : [core, shell]) {
    const glowMesh = part.glow.build(M.glow, false, false);
    for (const [b, m, recv, last] of [[part.floor, multi ? M.vfloor : M.floor, true, true], [part.wood, multi ? M.vwood : M.wood, true, true], [part.tiles, M.tiles, true, false], [part.wall, multi ? M.render : M.wall, true, false], [part.stone, M.vstone, true, false], [part.plain, M.plain, true, false], [part.sky, multi ? M.view : M.sky, false, false]] as [Batch, THREE.Material, boolean, boolean][]) {
      const mesh = b.build(m, recv, false); if (!mesh) continue;
      if (multi && (m === M.render || m === M.vstone)) lift(mesh, m === M.render ? LIFT : 1.12);
      if (last) mesh.renderOrder = 1;                                                       // the floors after what stands on them: hidden pixels are skipped
      part.g.add(mesh);
    }
    if (glowMesh) { part.g.add(glowMesh); glows.push(glowMesh); }
    // the see-through things last
    for (const [b, m] of [[part.water, M.water], [part.glass, M.glass]] as const) { const mesh = b.build(m, false, false); if (mesh) { mesh.renderOrder = 2; part.g.add(mesh); } }
  }

  // ---------------------------------------------------------------- the way out, the interior
  const front = p.openings.find(o => o.kind === 'front')!, fin = sideOf(p, front, front.a);
  use(liOf(levelOfRoom(p, room(front.a))), false);
  const [dx, dz] = front.axis === 'x' ? [front.x, front.z + fin * 0.6] : [front.x + fin * 0.6, front.z];
  const interactables: Interactable[] = [{ id: `${hub}:in:door:${h.id}`, name: 'Sortir', kind: 'actions', x: W(dx), z: Z(dz), radius: 1.2, actions: [{ id: 'sortir', label: 'Sortir', seconds: 0, special: 'exit' }] }];
  const HB = homeBox(p), box = { x0: ox + HB.x0, x1: ox + HB.x1, z0: oz + HB.z0, z1: oz + HB.z1 };
  const firstRoom = inners.find(q => p.spawn.x >= q.i.x0 && p.spawn.x <= q.i.x1 && p.spawn.z >= q.i.z0 && p.spawn.z <= q.i.z1)?.r ?? p.rooms[0];
  use(0, false);

  // ---------------------------------------------------------------- per frame: doors, the room light, the hole, the night, the cutaway
  let roomId: string | null = firstRoom.id, lightRoom = firstRoom.id, holeK = 0, night = 0, shown = -1, feet = 0;
  const last = { x: NaN, z: NaN }, cam = new THREE.Vector3(), centre = new THREE.Vector3(), hp = new THREE.Vector3();
  /** The room a point of the home is in, on a level (plan metres: the level's dx added). */
  const roomOf = (hx: number, hz: number, li: number) => { const x = hx + LV[li].dx; for (const q of inners) if (q.li === li && x >= q.i.x0 - 1e-6 && x <= q.i.x1 + 1e-6 && hz >= q.i.z0 - 1e-6 && hz <= q.i.z1 + 1e-6) return q.r; return null; };
  const blocked = (ax: number, az: number, bx: number, bz: number, y: number) => {
    for (const k of blocks) if (y + 1.6 > k.y0 && y < k.y1 - 0.25 && crosses(k.r, ax, az, bx, bz)) return true;
    for (const d of doors) if (d.col.x0 !== PARK && inBand(d.col, y) && crosses(d.open, ax, az, bx, bz)) return true;
    return false;
  };
  /** The level index a height stands on (feet, or the editor's focus less its chest height). */
  const levelAtY = (y: number) => { let k = 0; for (let i = 0; i < LV.length; i++) if (LV[i].y <= y + 0.6) k = i; return k; };
  /** The cutaway: the level in view and those below it shown (below, only what the floor above does not cover); the furniture alike. */
  const cutaway = (k: number) => {
    if (k !== shown) {
      shown = k;
      for (let i = 0; i < parts.length; i++) { parts[i].shell.g.visible = i <= k; if (parts[i].core !== parts[i].shell) parts[i].core.g.visible = i === k; }
    }
    for (const c of group.children) {
      if (c.userData.shellPart) continue;
      for (const o of c.children) {
        const li = o.userData.homeLevel;
        if (typeof li === 'number') o.visible = o.userData.covered ? li === k : li <= k;
        else for (const q of o.children) { const l2 = q.userData.homeLevel; if (typeof l2 === 'number') q.visible = q.userData.covered ? l2 === k : l2 <= k; }   // the upgrades' dressing
      }
    }
  };
  const int: Interior = {
    kind: 'home', name: h.name, group, colliders, interactables, seats: [], open: true,
    bounds: { ...box }, cameraBox: { ...box },
    spawn: { x: W(p.spawn.x), z: Z(p.spawn.z), yaw: p.spawn.yaw },
    light: lampAt.get(firstRoom.id)!.clone(), lightColor: 0xffd9a0,
    holeFocus: null,
    ...(multi ? { groundAt: (x: number, z: number, y: number) => groundAt(p, x - ox, z - oz, y), outdoors: () => !!roomId && !!room(roomId).outdoor } : {}),
    update(dt, player, camera, hour, placed = false) {
      const lx = player.x - ox, lz = player.z - oz;
      feet = player.y;
      // a slow frame's step must never carry the player through a wall, a fitting or a door: back to where they stood (not a player their seat
      // places: the villa's swim takes them over the pool's edge, src/villa/swim.ts)
      if (Number.isFinite(last.x) && !placed) {
        const step = Math.hypot(lx - last.x, lz - last.z);
        if (step > 1e-6 && step < SHELL.jump && blocked(last.x, last.z, lx, lz, feet)) { player.x = ox + last.x; player.z = oz + last.z; }
        else { last.x = lx; last.z = lz; }
      } else { last.x = lx; last.z = lz; }
      const px = player.x, pz = player.z, li = levelAtY(feet - Y0);
      const r = roomOf(px - ox, pz - oz, li); if (r) roomId = r.id;
      // doors: open while the player is near (on the door's floor), shut a while after they have gone; a fully open leaf blocks like a wall
      for (const d of doors) {
        const near = Math.hypot(px - d.cx, pz - d.cz) < SHELL.doorNear && Math.abs(feet - d.y) < 1.5;
        d.away = near ? 0 : d.away + dt;
        const want = d.away < SHELL.doorLinger;
        d.k = want ? Math.min(1, d.k + dt / SHELL.doorSwing) : Math.max(0, d.k - dt / SHELL.doorSwing);
        const e = d.k * d.k * (3 - 2 * d.k);
        d.pivot.rotation.y = d.base + d.theta * e;
        const o = d.open, dxx = ox - LV[liOf(levelOfRoom(p, room(d.o.a)))].dx;
        const touching = px > dxx + o.x0 - 0.3 && px < dxx + o.x1 + 0.3 && pz > Z(o.z0) - 0.3 && pz < Z(o.z1) + 0.3;
        if (d.k >= 1 && want && (d.col.x0 !== PARK || !touching)) { d.col.x0 = dxx + o.x0; d.col.x1 = dxx + o.x1; d.col.z0 = Z(o.z0); d.col.z1 = Z(o.z1); }
        else d.col.x0 = d.col.x1 = d.col.z0 = d.col.z1 = PARK;
      }
      // the room light glides to the lamp of the room the player is in
      if (roomId) { lightRoom = roomId; int.light.lerp(lampAt.get(roomId)!, 1 - Math.exp(-dt * 7)); }
      // the hole round the player (or round what the editor frames); the cutaway at the level in view
      holeK = Math.min(1, holeK + dt * 3);
      const f = int.holeFocus;
      if (f) HOLE.uHolePos.value.copy(f); else HOLE.uHolePos.value.set(px, player.y + SHELL.holeY, pz);
      HOLE.uHoleK.value = holeK; HOLE.uHoleR.value = SHELL.holeR;
      const view = multi ? levelAtY(f ? f.y - 1.0 : feet - Y0) : 0;
      HOLE.uHoleFloor.value = Y0 + LV[view].y + SHELL.holeFloor;
      if (multi) cutaway(view);
      // night: the lamps glow, the daylight behind the shutters goes dark, the pool lights up
      night = 1 - Math.min(1, Math.max(0, daylight(hour) * 3.2));
      M.glow.emissiveIntensity = 1.15 * night;
      M.sky.color.copy(DAY_SKY).lerp(NIGHT_SKY, night);
      M.view.color.setScalar(1).lerp(VIEW_NIGHT, night);
      M.water.emissiveIntensity = 0.15 + 0.85 * night;
      cam.copy(camera.position);
    },
    describe() {
      centre.copy(HOLE.uHolePos.value);
      // the walls standing between the camera and the player's feet, middle or head, and how much of the player is seen (the hole's own rule,
      // on the shell's boxes: a point is seen when every box on the way to it is cut away where the way goes in and out); LD2.0-D: only what is shown
      const k = Math.max(0, shown), vis = solids.filter(s => !multi || (s.core ? s.li === k : s.li <= k));
      const pts = [0.2, 0.9, 1.6].map(dy => hp.set(centre.x, centre.y - SHELL.holeY + dy, centre.z).clone());
      const between = vis.filter(s => s.wall && pts.some(q => segBox(cam, q, s, 0.02) !== null)).length;
      const seen = pts.filter(q => vis.every(s => { const hit = segBox(cam, q, s, 0.02); return !hit || (cut(hit[0]) && cut(hit[1])); })).length / pts.length;
      return {
        plan: p.id, room: roomId,
        ...(multi ? { level: LV[k].id, y: +(feet - Y0).toFixed(2), levels: LV.map((l, i) => ({ id: l.id, shell: parts[i].shell.g.visible, core: parts[i].core.g.visible })) } : {}),
        doors: doors.map(d => ({ id: d.o.id, open: d.k >= 0.5, k: Math.round(d.k * 100) / 100, blocks: d.col.x0 !== PARK })),
        light: { room: lightRoom, x: +(int.light.x - ox).toFixed(2), z: +(int.light.z - oz).toFixed(2) },
        hole: { on: holeK > 0.5 && between > 0, k: holeK, between, seen },
        night: +night.toFixed(2),
      };
    },
  };
  /** Is a point of the shell cut away by the hole (the shader's rule, at the core's edge and the dither's middle)? */
  const cut = (q: THREE.Vector3) => {
    if (holeK <= 0 || q.y < HOLE.uHoleFloor.value) return false;
    const L = cam.distanceTo(centre); if (L < 0.01) return false;
    const dxx = (centre.x - cam.x) / L, dyy = (centre.y - cam.y) / L, dzz = (centre.z - cam.z) / L;
    const vx = q.x - cam.x, vy = q.y - cam.y, vz = q.z - cam.z, t = vx * dxx + vy * dyy + vz * dzz;
    if (t > L - 0.45) return false;
    const r = Math.hypot(vx - dxx * t, vy - dyy * t, vz - dzz * t);
    return r < SHELL.holeR * holeK * (SHELL.holeCore + 1) / 2;
  };
  if (multi) cutaway(0);
  return {
    int, spots: { kitchen: kitchenSpot ?? { x: W(0), z: Z(0) }, shower: showerSpot ?? { x: W(0), z: Z(0) } }, ceiling: glows,
  };
}
const grow2 = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
/** LD2.0-D look pass: how much the villa's walls are lifted past their vertex colours (the room's light is dim on a wall: white must read white). */
const LIFT = 1.3;
/** Multiplies a built mesh's vertex colours (a lift above what a hex colour can say). */
function lift(m: THREE.Mesh, k: number) { const c = m.geometry.attributes.color as THREE.BufferAttribute; const a = c.array as Float32Array; for (let i = 0; i < a.length; i++) a[i] *= k; }

/** Where the segment a → b enters and leaves a box (its ends shortened by `trim` of its length), or null. */
function segBox(a: THREE.Vector3, b: THREE.Vector3, s: Solid, trim: number): [THREE.Vector3, THREE.Vector3] | null {
  let t0 = 0, t1 = 1 - trim;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z], o = [a.x, a.y, a.z], lo = [s.x0, s.y0, s.z0], hi = [s.x1, s.y1, s.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
    let u = (lo[i] - o[i]) / d[i], v = (hi[i] - o[i]) / d[i]; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return null;
  }
  const at = (t: number) => new THREE.Vector3(a.x + d[0] * t, a.y + d[1] * t, a.z + d[2] * t);
  return [at(t0), at(t1)];
}

/** The middle of the inside of a plan's first room of a kind (home metres; LD2.0-D: at its house x), or null: where a ceiling fan goes (src/economy/estate.ts). */
export function roomCentre(p: FloorPlan, kind: Room['kind']): { x: number; z: number } | null {
  const r = p.rooms.find(q => q.kind === kind); if (!r) return null;
  const i = inner(p, r), dx = levelAtX(p, (i.x0 + i.x1) / 2).dx; return { x: (i.x0 + i.x1) / 2 - dx, z: (i.z0 + i.z1) / 2 };
}
