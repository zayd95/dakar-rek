import * as THREE from 'three';
import { Batch } from '../world/batch';
import { addGrain } from '../world/grain';
import { floorTileTexture, plasterTexture, generatedTexture } from '../world/textures';
import { daylight } from '../core/clock';
import type { Interior } from '../world/interiors';
import type { Collider, Interactable } from '../world/types';
import type { HomeSpec } from '../economy/catalog';
import type { Finish, HomeInterior } from '../economy/homeInterior';
import { inner, passage, wallPieces, type Fixture, type FloorPlan, type Opening, type Rect, type Room, type Side } from './plan';

/**
 * LD2.0-C « Walkable Homes », lane H (docs/ld2/LD2_C.md): the shell of a home built from its floor plan (src/housing/plan.ts) — today the F2 of
 * the Résidence Jàmm. src/economy/homeInterior.ts hands a home with a plan to `buildApartment`; every other home keeps its one open room.
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
 * Draw calls: one mesh per material (the tiled floors, the chambre's wood, the faience, the walls, the fittings and trims, the lamps, the daylight)
 * and one per moving door leaf: 10 for the F2 (tests/apartment.test.ts holds it to ≤ 14).
 */

const Y = 0.1;                                   // the floor's top (the player's feet indoors: main.ts)
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
 * before the player so a wall beside them is not cut straight across.
 */
export const HOLE = {
  uHolePos: { value: new THREE.Vector3(0, -100, 0) },
  uHoleR: { value: SHELL.holeR },
  uHoleK: { value: 0 },
};
const HOLE_GLSL = /* glsl */ `
uniform vec3 uHolePos; uniform float uHoleR; uniform float uHoleK;
varying vec3 vHoleW;
void holeCut() {
  if (uHoleK <= 0.0 || vHoleW.y < ${(Y + SHELL.holeFloor).toFixed(3)}) return;
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
  m.customProgramCacheKey = () => key + '|hole';
  return m;
}

type Mats = { floor: THREE.Material; tiles: THREE.Material; wood: THREE.Material; wall: THREE.Material; plain: THREE.Material; leaf: THREE.Material; glow: THREE.MeshLambertMaterial; sky: THREE.MeshBasicMaterial };
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
  };
  for (const m of Object.values(mats)) m.userData.shared = true;
  return mats;
}
const DAY_SKY = new THREE.Color(0xc6e6f6), NIGHT_SKY = new THREE.Color(0x1c2846);

// ------------------------------------------------------------------------------------------------ colours
const EXTERIOR = 0xe2d3b8, CAP = 0x8c8174, CHROME = 0xc4c8cc, WHITE = 0xf6f6f3, DADO = 1.2;
interface Look { lower: number; upper: number; faience: boolean; floor: number }
function lookOf(r: Room, F: Finish, painted: boolean): Look {
  const floor = r.floor === 'wood' ? 0xb07a4a : r.floor === 'marble' ? 0xf4f1ea : r.kind === 'sdb' ? 0xdfe8ec : r.kind === 'cuisine' ? 0xebe7df : 0xf2f0ec;
  switch (r.kind) {
    case 'chambre': return { lower: painted ? 0x9fc6b8 : 0xd6b3a0, upper: F.upper, faience: false, floor };
    case 'cuisine': return { lower: 0xf0ede5, upper: F.upper, faience: true, floor };
    case 'sdb': return { lower: 0xb6d5e4, upper: 0xf3f5f3, faience: true, floor };
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
const isOuter = (p: FloorPlan, axis: 'x' | 'z', at: number) => Math.abs(Math.abs(at) - (axis === 'x' ? p.d / 2 : p.w / 2)) < 1e-6;
const halfOf = (p: FloorPlan, axis: 'x' | 'z', at: number) => (isOuter(p, axis, at) ? p.outWall : p.inWall) / 2;
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
interface Door { o: Opening; pivot: THREE.Group; base: number; theta: number; k: number; away: number; open: Rect; col: Collider; cx: number; cz: number }
/** A solid box of the shell in world metres, for the debug's line-of-sight test. */
interface Solid { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; wall: boolean }
const PARK = 1e6;   // where an inactive collider waits (never near anyone)

/**
 * The interior of a home built from its floor plan, at (ox, oz) in the world (off the street grid), in the shape the estate and the editor use
 * (src/economy/homeInterior.ts HomeInterior). `F`: the finish of the home's level (after its upgrades); `upgrades`: « peinture » repaints too.
 */
export function buildApartment(p: FloorPlan, h: HomeSpec, ox: number, oz: number, hub: string, F: Finish, upgrades: readonly string[] = []): HomeInterior {
  const M = materials(), H = p.wallH, painted = upgrades.includes('peinture');
  const group = new THREE.Group(); group.name = `home:${h.id}`;
  const floor = new Batch(), tiles = new Batch(), wood = new Batch(), wall = new Batch(), plain = new Batch(), glow = new Batch(), sky = new Batch();
  const colliders: Collider[] = [], solids: Solid[] = [], blocks: Rect[] = [];
  const W = (x: number) => ox + x, Z = (z: number) => oz + z;
  const room = (id: string) => p.rooms.find(r => r.id === id)!;
  const looks = new Map(p.rooms.map(r => [r.id, lookOf(r, F, painted)]));
  const inners = p.rooms.map(r => ({ r, i: inner(p, r) }));
  const roomIn = (x: number, z: number) => p.rooms.find(r => x > r.box.x0 && x < r.box.x1 && z > r.box.z0 && z < r.box.z1) ?? null;
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
  const solid = (r: Rect, y0: number, y1: number, isWall: boolean) => solids.push({ x0: W(r.x0), x1: W(r.x1), z0: Z(r.z0), z1: Z(r.z1), y0: Y + y0, y1: Y + y1, wall: isWall });

  // ---------------------------------------------------------------- walls
  /**
   * One stretch of wall on a line (`axis`, at `at`, half thickness `t`), from a to b along it and y0 to y1 above the floor. Each face is its own
   * half of the wall, in the colours of the room it faces (split where the rooms change), with the dado rail and the skirting proud of it; the
   * outside face in the façade's colour. A half has its face, its two ends and, where nothing sits on it (a window's sill), its top: never the
   * face inside the wall nor a top under the band above or the cap.
   */
  const run = (axis: 'x' | 'z', at: number, t: number, a: number, b: number, y0: number, y1: number) => {
    if (b - a < EPS || y1 - y0 < EPS) return;
    for (const s of [-1, 1] as const) {
      const face: Face = axis === 'x' ? (s > 0 ? 'pz' : 'nz') : (s > 0 ? 'px' : 'nx'), ends: Face[] = axis === 'x' ? ['px', 'nx'] : ['pz', 'nz'];
      const sides = (top: boolean): Face[] => top ? [face, ...ends, 'py'] : [face, ...ends];
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
      const outside = isOuter(p, axis, at);
      for (const { u0, u1, r } of spans) {
        const free = y1 < H - EPS;                                                         // the band's top is seen (no cap, no band on it)
        // the façade runs to the corners and closes them; a room's face stops at the room's own face (the rest is inside the walls it meets, where its
        // end would lie on their faces and flicker)
        if (!r) { if (outside) pbox(wall, lineRect(axis, at, u0, u1, 0, s * t), y0, y1, EXTERIOR, sides(free)); continue; }
        const ri = inners.find(q => q.r === r)!.i, [f0, f1] = axis === 'x' ? [ri.x0, ri.x1] : [ri.z0, ri.z1], v0 = Math.max(u0, f0), v1 = Math.min(u1, f1);
        if (v1 - v0 < EPS) continue;
        const half = lineRect(axis, at, v0, v1, 0, s * t), L = looks.get(r.id)!;
        if (y0 < DADO) pbox(L.faience ? tiles : wall, half, y0, Math.min(y1, DADO), L.lower, sides(free && y1 <= DADO));
        if (y1 > DADO) pbox(wall, half, Math.max(y0, DADO), y1, L.upper, sides(free));
        // the dado rail and the skirting, proud of the face
        if (y0 < DADO - 0.02 && y1 > DADO + 0.02) pbox(plain, lineRect(axis, at, v0, v1, s * t, s * (t + 0.012)), DADO - 0.02, DADO + 0.02, L.faience ? 0xe2ddd2 : F.trim, sides(true));
        if (y0 < EPS) pbox(plain, lineRect(axis, at, v0, v1, s * t, s * (t + 0.015)), 0, L.faience ? 0.08 : 0.1, L.faience ? 0xd2cbbf : F.trim, sides(true));
      }
    }
  };
  /** The windows on a wall line: their span along it, sill and head. */
  const windowsOn = (axis: 'x' | 'z', at: number) => p.windows.flatMap(w => {
    const b = room(w.room).box, line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side], wa = w.side === 'n' || w.side === 's' ? 'x' : 'z';
    return wa === axis && Math.abs(line - at) < 1e-6 ? [{ w, lo: w.at - w.width / 2, hi: w.at + w.width / 2 }] : [];
  });
  const pieces = wallPieces(p);
  for (const pc of pieces) {
    const a = pc.axis === 'x' ? pc.x0 : pc.z0, b = pc.axis === 'x' ? pc.x1 : pc.z1, t = halfOf(p, pc.axis, pc.at);
    let u = a;
    for (const { w, lo, hi } of windowsOn(pc.axis, pc.at).filter(q => q.lo >= a - 1e-6 && q.hi <= b + 1e-6).sort((q, r) => q.lo - r.lo)) {
      run(pc.axis, pc.at, t, u, lo, 0, H);
      run(pc.axis, pc.at, t, lo, hi, 0, w.sill); run(pc.axis, pc.at, t, lo, hi, w.sill + w.height, H);
      u = hi;
    }
    run(pc.axis, pc.at, t, u, b, 0, H);
    rbox(wall, pc, H, H + 0.02, CAP);
    colliders.push({ x0: W(pc.x0), z0: Z(pc.z0), x1: W(pc.x1), z1: Z(pc.z1), h: H });
    blocks.push(pc); solid(pc, 0, H, true);
  }

  // ---------------------------------------------------------------- floors
  // the building's slab round the home: a ring outside its walls only (nothing drawn under the floors, where it would only cost pixels)
  const hw = p.w / 2 + p.outWall / 2, hd = p.d / 2 + p.outWall / 2, rim = 1.2;
  for (const r of [{ x0: -hw - rim, x1: hw + rim, z0: -hd - rim, z1: -hd }, { x0: -hw - rim, x1: hw + rim, z0: hd, z1: hd + rim }, { x0: -hw - rim, x1: -hw, z0: -hd, z1: hd }, { x0: hw, x1: hw + rim, z0: -hd, z1: hd }]) rbox(plain, r, -0.12, 0, 0x625c55);
  for (const r of p.rooms) (r.floor === 'wood' ? wood : floor).flat(r.box.x1 - r.box.x0, r.box.z1 - r.box.z0, W((r.box.x0 + r.box.x1) / 2), Y, Z((r.box.z0 + r.box.z1) / 2), looks.get(r.id)!.floor);

  // ---------------------------------------------------------------- openings: lintels, frames, thresholds, leaves
  const doors: Door[] = [];
  const TRIM = F.trim, FRAME = 0.07, PROUD = 0.02;
  for (const o of p.openings) {
    const at = o.axis === 'x' ? o.z : o.x, c = o.axis === 'x' ? o.x : o.z, t = halfOf(p, o.axis, at), lo = c - o.width / 2, hi = c + o.width / 2;
    const P = passage(p, o);
    // the head of the opening: an arched one over an arch, a straight lintel over a door
    if (o.kind === 'arch') {
      const rise = 0.3, spring = o.height - rise, s = new THREE.Shape();
      s.moveTo(-o.width / 2, spring);
      for (let i = 1; i <= 14; i++) { const a = Math.PI - (i / 14) * Math.PI; s.lineTo((o.width / 2) * Math.cos(a), spring + rise * Math.sin(a)); }
      s.lineTo(o.width / 2, H); s.lineTo(-o.width / 2, H);
      const g = new THREE.ExtrudeGeometry(s, { depth: 2 * t, bevelEnabled: false, curveSegments: 1 }); g.translate(0, 0, -t);
      const ra = roomIn(o.axis === 'x' ? c : at - t - 0.05, o.axis === 'x' ? at - t - 0.05 : c);
      wall.geometry(g, (ra ? looks.get(ra.id)!.upper : F.upper), W(o.axis === 'x' ? c : at), Y, Z(o.axis === 'x' ? at : c), o.axis === 'x' ? 0 : -Math.PI / 2);
      for (const e of [lo - FRAME, hi]) rbox(plain, lineRect(o.axis, at, e, e + FRAME, -t - PROUD, t + PROUD), 0, spring + 0.04, TRIM);
      solid(lineRect(o.axis, at, lo, hi, -t, t), spring, H, true);
    } else {
      run(o.axis, at, t, lo, hi, o.height, H);
      // the frame: two jambs and a head on both faces, and the soffit lined
      for (const e of [lo - FRAME, hi]) rbox(plain, lineRect(o.axis, at, e, e + FRAME, -t - PROUD, t + PROUD), 0, o.height + FRAME, TRIM);
      rbox(plain, lineRect(o.axis, at, lo - FRAME, hi + FRAME, -t - PROUD, t + PROUD), o.height, o.height + FRAME, TRIM);
      solid(lineRect(o.axis, at, lo, hi, -t, t), o.height, H, true);
    }
    rbox(wall, P, H, H + 0.02, CAP);
    rbox(plain, P, 0, 0.008, 0xcdbfa8);                                                  // the threshold
    if (o.kind === 'front') {
      // the street door: a closed leaf (painted metal, two panels, a handle and a spy hole), a collider across the doorway, a mat inside
      const s = sideOf(p, o, o.a), lf = lineRect(o.axis, at, lo + 0.01, hi - 0.01, -0.025, 0.025);
      rbox(plain, lf, 0.01, o.height - 0.01, F.door);
      for (const side of [-1, 1]) {
        for (const [y0, y1] of [[0.15, 0.95], [1.1, o.height - 0.15]]) rbox(plain, lineRect(o.axis, at, lo + 0.12, hi - 0.12, side * 0.025, side * 0.032), y0, y1, new THREE.Color(F.door).multiplyScalar(0.82).getHex());
        rbox(plain, lineRect(o.axis, at, hi - 0.16, hi - 0.1, side * 0.025, side * 0.06), 1.0, 1.04, 0xd4b24a);
      }
      rbox(plain, lineRect(o.axis, at, c - 0.02, c + 0.02, s * 0.025, s * 0.035), 1.52, 1.56, 0x222222);
      rbox(plain, lineRect(o.axis, at, c - 0.42, c + 0.42, s * (t + 0.15), s * (t + 0.7)), 0, 0.015, 0x8a6a3c);
      colliders.push({ x0: W(P.x0), z0: Z(P.z0), x1: W(P.x1), z1: Z(P.z1), h: o.height });
      blocks.push(P); solid(P, 0, o.height, false);
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
    const lb = new Batch(), lw = o.width - 0.02, lh = o.height - 0.02, WOOD = 0x7a4a26, PANEL = 0x6a3e1f;
    lb.box(lw - 0.01, lh, 0.04, 0.01 + lw / 2, 0.01, 0, WOOD);
    for (const side of [-1, 1]) {
      for (const [y0, y1] of [[0.15, 0.95], [1.1, lh - 0.15]]) lb.box(lw - 0.24, y1 - y0, 0.006, 0.01 + lw / 2, y0, side * 0.022, PANEL);
      lb.box(0.05, 0.05, 0.012, lw - 0.08, 0.98, side * 0.026, CHROME);                  // the rose and the lever
      lb.box(0.13, 0.02, 0.02, lw - 0.12, 1.0, side * 0.04, CHROME);
    }
    for (const y of [0.2, lh / 2, lh - 0.25]) lb.box(0.02, 0.1, 0.05, 0.005, y, 0, 0x2a2a2a);                     // the hinges
    const leaf = lb.build(M.leaf, true, false)!; leaf.name = `leaf:${o.id}`;
    pivot.add(leaf); group.add(pivot);
    // fully open, the leaf lies across the room it opens into, at the hinge end of the doorway
    const open = lineRect(o.axis, at, hingeAt - 0.03, hingeAt + 0.03, s * t, s * (t + lw));
    const col: Collider = { x0: PARK, z0: PARK, x1: PARK, z1: PARK, h: lh };
    colliders.push(col);
    doors.push({ o, pivot, base, theta, k: 0, away: 1e9, open, col, cx: W(o.x), cz: Z(o.z) });
  }

  // ---------------------------------------------------------------- windows
  for (const w of p.windows) {
    const b = room(w.room).box, axis = w.side === 'n' || w.side === 's' ? 'x' as const : 'z' as const, at = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side];
    const t = halfOf(p, axis, at), into = w.side === 'n' || w.side === 'w' ? 1 : -1, lo = w.at - w.width / 2, hi = w.at + w.width / 2;
    const y0 = w.sill, y1 = w.sill + w.height, ac = (c0: number, c1: number) => lineRect(axis, at, lo, hi, into * c0, into * c1);
    rbox(sky, ac(-t + 0.004, -t + 0.012), y0, y1, 0xffffff);                              // daylight, at the outside face
    if (F.glass) {
      for (const e of [lo, (lo + hi) / 2 - 0.02, hi - 0.04]) rbox(plain, lineRect(axis, at, e, e + 0.04, into * (-t + 0.012), into * (-t + 0.06)), y0, y1, TRIM);
      rbox(plain, ac(-t + 0.012, -t + 0.06), y0 + w.height * 0.7, y0 + w.height * 0.7 + 0.04, TRIM);
    } else {
      // louvred metal shutters in the outer half of the reveal, tilted to shed the rain
      const n = Math.max(3, Math.round(w.height / 0.13)), [cx, cz] = axis === 'x' ? [(lo + hi) / 2, at + into * (-t * 0.45)] : [at + into * (-t * 0.45), (lo + hi) / 2];
      for (let k = 0; k < n; k++) plain.slab(w.width - 0.02, 0.012, 0.09, W(cx), Y + y0 + (k + 0.5) * (w.height / n), Z(cz), 0x2f6fb3, axis === 'x' ? 0 : Math.PI / 2, into * (axis === 'x' ? 0.55 : -0.55));
    }
    // the casement frame in the middle of the wall, the frame round the inside, the sill board
    for (const [a0, a1] of [[lo, lo + 0.04], [hi - 0.04, hi]]) rbox(plain, lineRect(axis, at, a0, a1, into * -0.025, into * 0.025), y0, y1, 0xf1eee8);
    rbox(plain, ac(-0.025, 0.025), y1 - 0.04, y1, 0xf1eee8);
    for (const [a0, a1] of [[lo - 0.06, lo], [hi, hi + 0.06]]) rbox(plain, lineRect(axis, at, a0, a1, into * (t - 0.004), into * (t + 0.014)), y0 - 0.05, y1 + 0.06, TRIM);
    rbox(plain, lineRect(axis, at, lo - 0.06, hi + 0.06, into * (t - 0.004), into * (t + 0.014)), y1, y1 + 0.06, TRIM);
    rbox(plain, lineRect(axis, at, lo - 0.05, hi + 0.05, into * 0.02, into * (t + 0.05)), y0 - 0.03, y0, 0xd9cbb3);
    if (room(w.room).kind === 'chambre') {
      // curtains drawn to either side, folded, on a rail
      rbox(plain, lineRect(axis, at, lo - 0.45, hi + 0.45, into * (t + 0.06), into * (t + 0.08)), y1 + 0.1, y1 + 0.13, 0x6b4a2e);
      for (const [a0, sgn] of [[lo - 0.42, 1], [hi + 0.42, -1]] as const) for (let k = 0; k < 4; k++) {
        const e = a0 + sgn * k * 0.1, f = k % 2 ? 0.035 : 0;
        rbox(plain, lineRect(axis, at, Math.min(e, e + sgn * 0.11), Math.max(e, e + sgn * 0.11), into * (t + 0.03 + f), into * (t + 0.06 + f)), 0.08, y1 + 0.1, 0xb8325f);
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
  let kitchenSpot: { x: number; z: number } | null = null, showerSpot: { x: number; z: number } | null = null;
  for (const f of p.fixtures) {
    const Fr = frameOf(f), d = Fr.depth, wd = Fr.width, hw = wd / 2;
    if (!p.fixtures.some(g => within(f, g))) { colliders.push({ x0: W(f.box.x0), z0: Z(f.box.z0), x1: W(f.box.x1), z1: Z(f.box.z1), h: f.h }); blocks.push(f.box); solid(f.box, 0, f.h, false); }
    switch (f.kind) {
      case 'counter': {
        const top = f.h, inset = p.fixtures.filter(g => within(g, f)), stove = inset.find(g => g.kind === 'stove');
        fbox(plain, Fr, 0, wd, 0, d - 0.06, 0, 0.1, 0x3a332e);                            // plinth
        fbox(plain, Fr, 0, wd, 0, d - 0.02, 0.1, top - 0.04, F.kitchen);                   // carcass
        fbox(plain, Fr, 0, wd, 0, d + 0.02, top - 0.04, top, F.top);                         // worktop
        const door = new THREE.Color(F.kitchen).multiplyScalar(1.12).getHex();
        const skip: [number, number][] = stove ? [lateral(Fr, stove.box)] : [];
        for (const [a, b] of less(-hw, hw, skip, 0.2)) {
          const n = Math.max(1, Math.round((b - a) / 0.6)), sw = (b - a) / n;
          for (let k = 0; k < n; k++) {
            const lc = a + (k + 0.5) * sw;
            fbox(plain, Fr, lc, sw - 0.012, d - 0.02, d - 0.004, 0.13, top - 0.24, door);   // door
            fbox(plain, Fr, lc, sw - 0.012, d - 0.02, d - 0.004, top - 0.22, top - 0.06, door); // drawer
            fbox(plain, Fr, lc, 0.16, d - 0.004, d + 0.018, top - 0.3, top - 0.285, CHROME);
            fbox(plain, Fr, lc, 0.12, d - 0.004, d + 0.018, top - 0.15, top - 0.135, CHROME);
          }
        }
        // the wall cupboards above, clear of the hood and of a window over the counter
        const back = ({ n: 's', s: 'n', e: 'w', w: 'e' } as const)[f.front];
        // (a window on the wall behind: its span along that wall, which runs along the counter's lateral axis)
        const winSpans = p.windows.filter(w => w.room === f.room && w.side === back).map(w => lateral(Fr, w.side === 'n' || w.side === 's'
          ? { x0: w.at - w.width / 2 - 0.08, x1: w.at + w.width / 2 + 0.08, z0: Fr.bz, z1: Fr.bz } : { x0: Fr.bx, x1: Fr.bx, z0: w.at - w.width / 2 - 0.08, z1: w.at + w.width / 2 + 0.08 }));
        const hood = stove ? lateral(Fr, stove.box) : null;
        for (const [a, b] of less(-hw, hw, [...winSpans, ...(hood ? [[hood[0] - 0.04, hood[1] + 0.04] as [number, number]] : [])], 0.3)) {
          fbox(plain, Fr, (a + b) / 2, b - a, 0, 0.34, 1.45, 2.15, F.kitchen);
          const n = Math.max(1, Math.round((b - a) / 0.5)), sw = (b - a) / n;
          for (let k = 0; k < n; k++) { const lc = a + (k + 0.5) * sw; fbox(plain, Fr, lc, sw - 0.012, 0.34, 0.352, 1.47, 2.13, door); fbox(plain, Fr, lc, 0.14, 0.352, 0.37, 1.5, 1.515, CHROME); }
        }
        break;
      }
      case 'sink': {
        const y = f.h;
        fbox(plain, Fr, 0, wd - 0.08, 0.06, d - 0.05, y, y + 0.006, 0xb8bcc0);
        fbox(plain, Fr, 0.02, wd - 0.24, 0.12, d - 0.12, y + 0.006, y + 0.008, 0x5d6166);
        fcyl(plain, Fr, 0.02, d / 2, 0.025, 0.025, y + 0.008, 0.003, 0x222222, 8);
        for (let k = 0; k < 4; k++) fbox(plain, Fr, -hw + 0.05 + k * 0.012 + 0.003, 0.004, 0.12, d - 0.12, y + 0.006, y + 0.009, 0x9da1a6);
        fcyl(plain, Fr, 0.02, 0.05, 0.016, 0.018, y, 0.27, CHROME, 8);                     // the tap: riser, spout, lever
        fbox(plain, Fr, 0.02, 0.026, 0.04, 0.24, y + 0.25, y + 0.275, CHROME);
        fbox(plain, Fr, 0.02, 0.1, 0.03, 0.05, y + 0.28, y + 0.295, CHROME);
        fbox(plain, Fr, 0.24, 0.12, 0.08, 0.2, y + 0.006, y + 0.06, 0x2f8f4e);                // a sponge and a bowl drying
        fcyl(plain, Fr, -0.22, d / 2, 0.08, 0.06, y + 0.006, 0.06, 0xe9e4d8, 12);
        const [kx, kz] = at2(Fr, 0, d + 0.55); kitchenSpot ??= { x: W(kx), z: Z(kz) };
        break;
      }
      case 'stove': {
        const y = f.h;
        fbox(plain, Fr, 0, wd - 0.04, 0.03, d - 0.03, y, y + 0.008, 0x1d1d1f);
        for (const [l, dd] of [[-0.14, 0.18], [0.14, 0.18], [-0.14, 0.42], [0.14, 0.42]]) {
          fcyl(plain, Fr, l, dd, 0.075, 0.075, y + 0.008, 0.012, 0x3b3b3b, 14);
          fcyl(plain, Fr, l, dd, 0.035, 0.04, y + 0.02, 0.012, 0x121212, 10);
        }
        fcyl(plain, Fr, 0.14, 0.18, 0.12, 0.11, y + 0.032, 0.13, 0x9da2a6, 14);             // a pot on the back burner, its lid and knob
        fcyl(plain, Fr, 0.14, 0.18, 0.122, 0.122, y + 0.162, 0.012, 0xb4b9bd, 14);
        fcyl(plain, Fr, 0.14, 0.18, 0.02, 0.02, y + 0.174, 0.025, 0x222222, 6);
        // the oven door, its window and its handle, the knobs, the hood above
        fbox(plain, Fr, 0, wd - 0.04, d - 0.024, d - 0.002, 0.16, y - 0.18, 0x2a2a2c);
        fbox(plain, Fr, 0, wd - 0.2, d - 0.002, d + 0.002, 0.28, y - 0.32, 0x15191d);
        fbox(plain, Fr, 0, wd - 0.12, d + 0.002, d + 0.035, y - 0.24, y - 0.22, CHROME);
        fbox(plain, Fr, 0, wd - 0.04, d - 0.024, d - 0.002, y - 0.16, y - 0.04, 0x323234);
        for (let k = 0; k < 4; k++) { const [x, z] = at2(Fr, -0.21 + k * 0.14, d - 0.002); plain.cyl(0.022, 0.022, 0.025, W(x), Y + y - 0.1, Z(z), 0xd8d8d8, 10, [Math.PI / 2, Fr.psi, 0]); }
        fbox(plain, Fr, 0, wd + 0.02, 0, 0.46, 1.72, 1.86, 0xc9cdd1);
        fbox(plain, Fr, 0, 0.28, 0, 0.24, 1.86, H - 0.01, 0xc9cdd1);
        break;
      }
      case 'fridge': {
        fbox(plain, Fr, 0, wd - 0.02, 0, d - 0.01, 0.02, f.h, 0xeeeeec);
        fbox(plain, Fr, 0, wd - 0.06, 0.02, d - 0.06, 0, 0.02, 0x222222);
        fbox(plain, Fr, 0, wd - 0.02, d - 0.01, d - 0.006, f.h * 0.68, f.h * 0.68 + 0.012, 0x9a9a98);
        const hl = (againstWall(f, Fr, -1) ? 1 : -1) * (hw - 0.07);                          // the handles on the side away from the wall
        fbox(plain, Fr, hl, 0.025, d - 0.006, d + 0.03, f.h * 0.72, f.h * 0.9, 0xb5b9bd);
        fbox(plain, Fr, hl, 0.025, d - 0.006, d + 0.03, f.h * 0.38, f.h * 0.6, 0xb5b9bd);
        fbox(plain, Fr, -0.12, 0.16, 0.2, 0.32, f.h, f.h + 0.12, 0xd9482b);                    // a box of tea and a little plant on top
        fcyl(plain, Fr, 0.12, d / 2, 0.06, 0.05, f.h, 0.1, 0xb85c38, 8);
        const [px, pz] = at2(Fr, 0.12, d / 2); plain.blob(0.11, W(px), Y + f.h + 0.17, Z(pz), 0x3f7a35, 0.8, 0);
        break;
      }
      case 'shower': {
        fbox(plain, Fr, 0, wd, 0, d, 0, 0.07, WHITE);                                         // the tray, its floor, the drain
        fbox(plain, Fr, 0, wd - 0.08, 0.04, d - 0.04, 0.07, 0.072, 0xe2e9ec);
        fcyl(plain, Fr, 0, d / 2, 0.04, 0.04, 0.072, 0.003, 0x7a7f84, 10);
        // faience up to the head on the walls round the tray
        fbox(tiles, Fr, 0, wd, -0.004, 0.006, DADO, 2.1, 0xa8cde0);
        for (const e of [-1, 1] as const) if (againstWall(f, Fr, e)) fbox(tiles, Fr, e * (hw + 0.001), 0.01, 0, d, DADO, 2.1, 0xa8cde0);
        // glass on the open side, a curtain on the rail across the front, gathered toward the wall
        const open = againstWall(f, Fr, -1) ? 1 : -1;
        if (!againstWall(f, Fr, open)) {
          fbox(plain, Fr, open * (hw - 0.01), 0.014, 0.04, d - 0.02, 0.07, 2.0, 0xcfe4ee);
          fbox(plain, Fr, open * (hw - 0.01), 0.03, d - 0.03, d, 0.07, 2.02, CHROME);
        }
        fbox(plain, Fr, 0, wd, d - 0.025, d - 0.01, 1.98, 2.0, CHROME);
        for (let k = 0; k < 4; k++) { const l = -open * (hw - 0.07 - k * 0.07), f2 = k % 2 ? 0.025 : 0; fbox(plain, Fr, l, 0.075, d - 0.06 + f2, d - 0.035 + f2, 0.16, 1.97, 0xf4c20d); }
        fcyl(plain, Fr, -open * 0.12, 0.03, 0.013, 0.013, 1.05, 1.0, CHROME, 8);               // the riser, the mixer, the arm and the head
        fbox(plain, Fr, -open * 0.12, 0.16, 0.0, 0.06, 1.0, 1.1, CHROME);
        fbox(plain, Fr, -open * 0.12, 0.022, 0.02, 0.3, 2.03, 2.05, CHROME);
        fcyl(plain, Fr, -open * 0.12, 0.3, 0.085, 0.07, 1.99, 0.04, 0xb8bcc0, 14);
        fbox(plain, Fr, open * (hw - 0.18), 0.2, 0.0, 0.1, 1.2, 1.22, CHROME);                   // a soap shelf and a bottle
        fcyl(plain, Fr, open * (hw - 0.14), 0.05, 0.025, 0.025, 1.22, 0.16, 0x2a8fd1, 8);
        const [sx, sz] = at2(Fr, open * (hw - 0.07), d + 0.35); showerSpot = { x: W(sx), z: Z(sz) };
        break;
      }
      case 'wc': {
        fbox(plain, Fr, 0, 0.44, 0, 0.19, 0.42, f.h, WHITE);                                    // the cistern and its button
        fcyl(plain, Fr, 0, 0.095, 0.028, 0.028, f.h, 0.008, 0xd9d9d9, 10);
        fbox(plain, Fr, 0, 0.21, 0.19, 0.46, 0, 0.36, WHITE);                                   // the pedestal
        const ell = (r0: number, r1: number, hh: number, y: number, col: number) => {
          const g = new THREE.CylinderGeometry(r0, r1, hh, 18); g.scale(1, 1, 1.4); g.translate(0, hh / 2, 0);
          const [x, z] = at2(Fr, 0, 0.19 + r0 * 1.4); plain.geometry(g, col, W(x), Y + y, Z(z), Fr.psi);
        };
        ell(0.165, 0.13, 0.1, 0.32, WHITE); ell(0.175, 0.175, 0.025, 0.42, 0xfbfbfb);
        const pe = againstWall(f, Fr, -1) ? -1 : againstWall(f, Fr, 1) ? 1 : 0;              // the paper on the wall beside it
        if (pe) { const [x, z] = at2(Fr, pe * (hw - 0.07), 0.4); plain.cyl(0.055, 0.055, 0.11, W(x), Y + 0.68, Z(z), WHITE, 10, [Math.PI / 2, Fr.psi, 0]); }
        break;
      }
      case 'basin': {
        fcyl(plain, Fr, 0, 0.2, 0.07, 0.09, 0, 0.67, WHITE, 12);                               // pedestal, basin, bowl, tap
        fbox(plain, Fr, 0, wd - 0.04, 0.02, d, 0.67, f.h, 0xf7f7f5);
        fbox(plain, Fr, 0, wd - 0.2, 0.12, d - 0.08, f.h, f.h + 0.002, 0xd6e0e6);
        fcyl(plain, Fr, 0, 0.07, 0.015, 0.015, f.h, 0.14, CHROME, 8);
        fbox(plain, Fr, 0, 0.022, 0.06, 0.17, f.h + 0.12, f.h + 0.14, CHROME);
        fbox(plain, Fr, 0, wd - 0.04, 0, 0.02, 1.12, 1.86, TRIM);                              // the mirror in its frame, a light on it
        fbox(plain, Fr, 0, wd - 0.1, 0.02, 0.026, 1.16, 1.82, 0xb5c9d4);
        fbox(plain, Fr, -0.12, 0.06, 0.026, 0.028, 1.3, 1.7, 0xe2edf2);
        fbox(plain, Fr, 0, wd - 0.1, 0, 0.12, 1.05, 1.07, 0xf2f2ee);                            // the shelf: a cup and a soap
        fcyl(plain, Fr, 0.16, 0.06, 0.03, 0.026, 1.07, 0.09, 0x1a9d54, 8);
        fbox(plain, Fr, -0.14, 0.08, 0.03, 0.08, 1.07, 1.1, 0xf3e3a0);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- lamps, and a few things on the walls
  const lampAt = new Map<string, THREE.Vector3>();
  for (const { r, i } of inners) {
    const cx = (i.x0 + i.x1) / 2, cz = (i.z0 + i.z1) / 2, long = i.x1 - i.x0 > 4.5;
    lampAt.set(r.id, new THREE.Vector3(W(cx), Y + H - 0.6, Z(cz)));
    for (const lx of long ? [cx - (i.x1 - i.x0) / 4, cx + (i.x1 - i.x0) / 4] : [cx]) {
      plain.cyl(0.06, 0.06, 0.025, W(lx), Y + H - 0.025, Z(cz), 0xf2f2ee, 10);                  // the ceiling rose, the cord
      if (r.kind === 'sejour' || r.kind === 'chambre') {
        plain.cyl(0.006, 0.006, 0.26, W(lx), Y + H - 0.28, Z(cz), 0x333333, 4);
        glow.cyl(0.14, 0.17, 0.15, W(lx), Y + H - 0.43, Z(cz), r.kind === 'chambre' ? 0xf0dcc0 : 0xf4ead6, 16);   // a fabric drum shade
      } else {
        plain.cyl(0.006, 0.006, 0.16, W(lx), Y + H - 0.18, Z(cz), 0x333333, 4);
        glow.sphere(0.095, W(lx), Y + H - 0.27, Z(cz), 0xfaf4e6);                               // an opal globe
      }
    }
    if (r.kind === 'sejour') {                                                                  // two frames (blank on purpose: no real people) and a clock
      for (const [k, c] of [[0, 0x7a5a3c], [1, 0x3d4a5c]] as const) {
        const x = i.x0 + 1.3 + k * 0.85;
        rbox(plain, { x0: x - 0.3, x1: x + 0.3, z0: i.z0, z1: i.z0 + 0.03 }, 1.45, 1.9, c);
        rbox(plain, { x0: x - 0.24, x1: x + 0.24, z0: i.z0 + 0.03, z1: i.z0 + 0.04 }, 1.5, 1.85, 0xd9d2c4);
      }
      plain.cyl(0.18, 0.18, 0.03, W(i.x0), Y + 1.95, Z(cz), 0xf2f2ec, 16, [0, 0, -Math.PI / 2]);
      plain.cyl(0.15, 0.15, 0.004, W(i.x0 + 0.03), Y + 1.95, Z(cz), 0xffffff, 16, [0, 0, -Math.PI / 2]);
    } else if (r.kind === 'entree') {                                                           // a coat rack, a meter box over the door
      rbox(plain, { x0: i.x1 - 0.03, x1: i.x1, z0: cz - 0.4, z1: cz + 0.4 }, 1.55, 1.65, 0x6b4a2e);
      for (const dz of [-0.25, 0, 0.25]) rbox(plain, { x0: i.x1 - 0.1, x1: i.x1 - 0.03, z0: cz + dz - 0.015, z1: cz + dz + 0.015 }, 1.58, 1.61, 0x2a2a2a);
      rbox(plain, { x0: i.x1 - 0.12, x1: i.x1 - 0.03, z0: cz - 0.38, z1: cz - 0.12 }, 0.9, 1.55, 0x1f5aa8);       // a coat on a hook
      rbox(plain, { x0: i.x1 - 0.05, x1: i.x1, z0: i.z0 + 0.1, z1: i.z0 + 0.42 }, 1.9, 2.3, 0xe8e8e4);
    } else if (r.kind === 'sdb') {                                                              // a towel on a rail
      rbox(plain, { x0: i.x1 - 0.04, x1: i.x1, z0: i.z1 - 0.62, z1: i.z1 - 0.18 }, 1.38, 1.4, CHROME);
      rbox(plain, { x0: i.x1 - 0.05, x1: i.x1 - 0.01, z0: i.z1 - 0.58, z1: i.z1 - 0.22 }, 0.9, 1.4, 0x1a9d54);
    }
  }

  // ---------------------------------------------------------------- meshes (one per material)
  const glowMesh = glow.build(M.glow, false, false);
  for (const [b, m, recv, last] of [[floor, M.floor, true, true], [wood, M.wood, true, true], [tiles, M.tiles, true, false], [wall, M.wall, true, false], [plain, M.plain, true, false], [sky, M.sky, false, false]] as [Batch, THREE.Material, boolean, boolean][]) {
    const mesh = b.build(m, recv, false); if (!mesh) continue;
    if (last) mesh.renderOrder = 1;                                                       // the floors after what stands on them: hidden pixels are skipped
    group.add(mesh);
  }
  if (glowMesh) group.add(glowMesh);

  // ---------------------------------------------------------------- the way out, the interior
  const front = p.openings.find(o => o.kind === 'front')!, fin = sideOf(p, front, front.a);
  const [dx, dz] = front.axis === 'x' ? [front.x, front.z + fin * 0.6] : [front.x + fin * 0.6, front.z];
  const interactables: Interactable[] = [{ id: `${hub}:in:door:${h.id}`, name: 'Sortir', kind: 'actions', x: W(dx), z: Z(dz), radius: 1.2, actions: [{ id: 'sortir', label: 'Sortir', seconds: 0, special: 'exit' }] }];
  const box = { x0: W(-p.w / 2), x1: W(p.w / 2), z0: Z(-p.d / 2), z1: Z(p.d / 2) };
  const firstRoom = inners.find(q => p.spawn.x >= q.i.x0 && p.spawn.x <= q.i.x1 && p.spawn.z >= q.i.z0 && p.spawn.z <= q.i.z1)?.r ?? p.rooms[0];

  // ---------------------------------------------------------------- per frame: doors, the room light, the hole, the night
  let roomId: string | null = firstRoom.id, lightRoom = firstRoom.id, holeK = 0, night = 0;
  const last = { x: NaN, z: NaN }, cam = new THREE.Vector3(), centre = new THREE.Vector3(), hp = new THREE.Vector3();
  const roomOf = (x: number, z: number) => { for (const q of inners) if (x >= q.i.x0 - 1e-6 && x <= q.i.x1 + 1e-6 && z >= q.i.z0 - 1e-6 && z <= q.i.z1 + 1e-6) return q.r; return null; };
  const blocked = (ax: number, az: number, bx: number, bz: number) => {
    for (const r of blocks) if (crosses(r, ax, az, bx, bz)) return true;
    for (const d of doors) if (d.col.x0 !== PARK && crosses(d.open, ax, az, bx, bz)) return true;
    return false;
  };
  const int: Interior = {
    kind: 'home', name: h.name, group, colliders, interactables, seats: [], open: true,
    bounds: { ...box }, cameraBox: { ...box },
    spawn: { x: W(p.spawn.x), z: Z(p.spawn.z), yaw: p.spawn.yaw },
    light: lampAt.get(firstRoom.id)!.clone(), lightColor: 0xffd9a0,
    holeFocus: null,
    update(dt, player, camera, hour) {
      const lx = player.x - ox, lz = player.z - oz;
      // a slow frame's step must never carry the player through a wall, a fitting or a door: back to where they stood
      if (Number.isFinite(last.x)) {
        const step = Math.hypot(lx - last.x, lz - last.z);
        if (step > 1e-6 && step < SHELL.jump && blocked(last.x, last.z, lx, lz)) { player.x = ox + last.x; player.z = oz + last.z; }
        else { last.x = lx; last.z = lz; }
      } else { last.x = lx; last.z = lz; }
      const px = player.x, pz = player.z;
      const r = roomOf(px - ox, pz - oz); if (r) roomId = r.id;
      // doors: open while the player is near, shut a while after they have gone; a fully open leaf blocks like a wall (never while it moves)
      for (const d of doors) {
        const near = Math.hypot(px - d.cx, pz - d.cz) < SHELL.doorNear;
        d.away = near ? 0 : d.away + dt;
        const want = d.away < SHELL.doorLinger;
        d.k = want ? Math.min(1, d.k + dt / SHELL.doorSwing) : Math.max(0, d.k - dt / SHELL.doorSwing);
        const e = d.k * d.k * (3 - 2 * d.k);
        d.pivot.rotation.y = d.base + d.theta * e;
        const o = d.open, touching = px > W(o.x0) - 0.3 && px < W(o.x1) + 0.3 && pz > Z(o.z0) - 0.3 && pz < Z(o.z1) + 0.3;
        if (d.k >= 1 && want && (d.col.x0 !== PARK || !touching)) { d.col.x0 = W(o.x0); d.col.x1 = W(o.x1); d.col.z0 = Z(o.z0); d.col.z1 = Z(o.z1); }
        else d.col.x0 = d.col.x1 = d.col.z0 = d.col.z1 = PARK;
      }
      // the room light glides to the lamp of the room the player is in
      if (roomId) { lightRoom = roomId; int.light.lerp(lampAt.get(roomId)!, 1 - Math.exp(-dt * 7)); }
      // the hole round the player (or round what the editor frames)
      holeK = Math.min(1, holeK + dt * 3);
      const f = int.holeFocus;
      if (f) HOLE.uHolePos.value.copy(f); else HOLE.uHolePos.value.set(px, player.y + SHELL.holeY, pz);
      HOLE.uHoleK.value = holeK; HOLE.uHoleR.value = SHELL.holeR;
      // night: the lamps glow, the daylight behind the shutters goes dark
      night = 1 - Math.min(1, Math.max(0, daylight(hour) * 3.2));
      M.glow.emissiveIntensity = 1.15 * night;
      M.sky.color.copy(DAY_SKY).lerp(NIGHT_SKY, night);
      cam.copy(camera.position);
    },
    describe() {
      centre.copy(HOLE.uHolePos.value);
      // the walls standing between the camera and the player's feet, middle or head, and how much of the player is seen (the hole's own rule,
      // on the shell's boxes: a point is seen when every box on the way to it is cut away where the way goes in and out)
      const pts = [0.2, 0.9, 1.6].map(dy => hp.set(centre.x, centre.y - SHELL.holeY + dy, centre.z).clone());
      const between = solids.filter(s => s.wall && pts.some(q => segBox(cam, q, s, 0.02) !== null)).length;
      const seen = pts.filter(q => solids.every(s => { const hit = segBox(cam, q, s, 0.02); return !hit || (cut(hit[0]) && cut(hit[1])); })).length / pts.length;
      return {
        plan: p.id, room: roomId,
        doors: doors.map(d => ({ id: d.o.id, open: d.k >= 0.5, k: Math.round(d.k * 100) / 100, blocks: d.col.x0 !== PARK })),
        light: { room: lightRoom, x: +(int.light.x - ox).toFixed(2), z: +(int.light.z - oz).toFixed(2) },
        hole: { on: holeK > 0.5 && between > 0, k: holeK, between, seen },
        night: +night.toFixed(2),
      };
    },
  };
  /** Is a point of the shell cut away by the hole (the shader's rule, at the core's edge and the dither's middle)? */
  const cut = (q: THREE.Vector3) => {
    if (holeK <= 0 || q.y < Y + SHELL.holeFloor) return false;
    const L = cam.distanceTo(centre); if (L < 0.01) return false;
    const dxx = (centre.x - cam.x) / L, dyy = (centre.y - cam.y) / L, dzz = (centre.z - cam.z) / L;
    const vx = q.x - cam.x, vy = q.y - cam.y, vz = q.z - cam.z, t = vx * dxx + vy * dyy + vz * dzz;
    if (t > L - 0.45) return false;
    const r = Math.hypot(vx - dxx * t, vy - dyy * t, vz - dzz * t);
    return r < SHELL.holeR * holeK * (SHELL.holeCore + 1) / 2;
  };
  return { int, spots: { kitchen: kitchenSpot ?? { x: W(0), z: Z(0) }, shower: showerSpot ?? { x: W(0), z: Z(0) } }, ceiling: glowMesh ? [glowMesh] : [] };
}

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

/** The middle of the inside of a plan's first room of a kind (home metres), or null: where a ceiling fan goes (src/economy/estate.ts). */
export function roomCentre(p: FloorPlan, kind: Room['kind']): { x: number; z: number } | null {
  const r = p.rooms.find(q => q.kind === kind); if (!r) return null;
  const i = inner(p, r); return { x: (i.x0 + i.x1) / 2, z: (i.z0 + i.z1) / 2 };
}
