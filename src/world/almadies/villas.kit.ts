import * as THREE from 'three';
import type { Batch } from '../batch';
import { E, GROUND, STOREY, type GateSide, type SiteDraw } from './contract';
import { gateX, palm, perimeter, siteRng, type Face, type PlanRect } from './parts';

/**
 * LD2.0-E, lane E-V: the pieces the houses' and the villas' designs share, written on the district's parts (parts.ts) and nothing else.
 *
 *  - `ctx(d)`: a design draws in ONE arrangement, the car gate on the right (+x) or in the middle; a site whose gate is on the left is drawn through a
 *    mirrored view of the same draw (every x negated, the parts' faces and rotations follow), so each design works for every gate and every mirror.
 *  - the level heights (`lv`), a few cheap forms (hedge, lawn, paths, a small tree, a plaque with the house number, loungers, a pool).
 *
 * Nothing here draws a mesh of its own: boxes, flat quads and vertex-coloured planes into the hub's merged batches; every piece thins on `d.lite`.
 */
export const T_SLAB = 0.28;
/** The top of floor k (0: the ground). */
export const lv = (k: number) => GROUND + k * STOREY;

export interface Ctx {
  /** The draw in the design's arrangement (the gate on the right). */
  d: SiteDraw;
  /** The site's own draw. */
  o: SiteDraw;
  /** The site's gate was on the left: `d` is its mirror image. */
  flip: boolean;
  /** The gate in the design's arrangement: 'right' or 'centre'. */
  gate: Exclude<GateSide, 'left'>;
  /** The gate's centre along the street wall and its span. */
  gx: number; g0: number; g1: number; gateW: number;
  /** Storeys (2 or 3), the floor tops (lv), the lite preset. */
  n: number; lite: boolean;
  rng: () => number;
}

/** The mirror image of a draw: every x negated (`rot` and the rectangles follow). */
export function mirrored(d: SiteDraw): SiteDraw {
  const f = d.f, m = Object.create(d) as SiteDraw;
  Object.assign(m, {
    f: { ...f, p: (x: number, z: number) => f.p(-x, z), rect: (x0: number, z0: number, x1: number, z1: number) => f.rect(-x0, z0, -x1, z1), rot: (r: number) => f.rot(-r) },
    solid: (x0: number, z0: number, x1: number, z1: number, h: number) => d.solid(-x1, z0, -x0, z1, h),
    box: (b: Batch, w: number, h: number, dd: number, x: number, y: number, z: number, col: number, rot = 0) => d.box(b, w, h, dd, -x, y, z, col, -rot),
    slab: (b: Batch, w: number, h: number, dd: number, x: number, y: number, z: number, col: number) => d.slab(b, w, h, dd, -x, y, z, col),
    flat: (b: Batch, w: number, dd: number, x: number, y: number, z: number, col: number, rot = 0) => d.flat(b, w, dd, -x, y, z, col, -rot),
    cyl: (b: Batch, rt: number, rb: number, h: number, x: number, y: number, z: number, col: number, seg: number) => d.cyl(b, rt, rb, h, -x, y, z, col, seg),
    blob: (b: Batch, r: number, x: number, y: number, z: number, col: number, sy: number, detail: number) => d.blob(b, r, -x, y, z, col, sy, detail),
    joined: (b: Batch, parts: [number, number, number, number, number, number, number][]) => d.joined(b, parts.map(([w, h, dd, x, y, z, c]) => [w, h, dd, -x, y, z, c])),
    light: (x: number, z: number, r: number, y?: number) => d.light(-x, z, r, y),
  });
  return m;
}
export function ctx(o: SiteDraw, opt: { gateW?: number } = {}): Ctx {
  const flip = o.site.gate === 'left', gate = o.site.gate === 'centre' ? 'centre' : 'right', gx = gateX(o.w, gate), gateW = opt.gateW ?? 4.4;
  return { d: flip ? mirrored(o) : o, o, flip, gate, gx, g0: gx - gateW / 2, g1: gx + gateW / 2, gateW, n: Math.max(2, Math.min(3, o.site.storeys)), lite: o.lite, rng: siteRng(o, 'design') };
}
/** The boundary: the shared `perimeter` in the design's arrangement. */
export const boundary = (k: Ctx, o: Parameters<typeof perimeter>[1] = {}) => perimeter(k.d, { gate: k.gate, gateW: k.gateW, ...o });
/** A palm, in the site's own draw (its fronds turn with the frame). */
export function palmAt(k: Ctx, x: number, z: number, sc = 1, turn = 0) { palm(k.o, k.flip ? -x : x, z, sc, k.flip ? -turn : turn); }

// ------------------------------------------------------------------------------------------------ small forms
const rect = (x0: number, x1: number, z0: number, z1: number): PlanRect => ({ x0, x1, z0, z1 });
export { rect as R };
/** A lawn: one flat quad just above the ground. */
export function lawn(k: Ctx, r: PlanRect, col = k.d.c.lawn) {
  const { d } = k, w = r.x1 - r.x0, dd = r.z1 - r.z0;
  if (w > 0.05 && dd > 0.05) d.flat(d.plain, w, dd, (r.x0 + r.x1) / 2, GROUND + 0.04, (r.z0 + r.z1) / 2, col);
}
/** A paved area on the hub's paving batch (a flat quad). */
export function pave(k: Ctx, r: PlanRect, col: number, y = GROUND + 0.06) {
  const { d } = k, w = r.x1 - r.x0, dd = r.z1 - r.z0;
  if (w > 0.05 && dd > 0.05) d.flat(d.pave, w, dd, (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2, col);
}
/** Stepping stones (flat plates) from (x0, z0) to (x1, z1). */
export function stones(k: Ctx, x0: number, z0: number, x1: number, z1: number, n: number, col = k.d.c.step) {
  const { d } = k;
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); d.flat(d.plain, 0.9, 0.55, x0 + (x1 - x0) * t, GROUND + 0.07, z0 + (z1 - z0) * t, col); }
}
/** A clipped hedge: one low box along x (or z), as a boxwood. */
export function hedge(k: Ctx, x0: number, z0: number, x1: number, z1: number, h = 0.7, t = 0.55, col = k.d.c.hedge) {
  const { d } = k, along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  d.box(d.leaves, along ? x1 - x0 : t, h, along ? t : z1 - z0, (x0 + x1) / 2, GROUND, (z0 + z1) / 2, col);
}
/** A round shrub (a blob), `sc` its radius. */
export function shrub(k: Ctx, x: number, z: number, sc = 0.5, col?: number, sy = 0.85) { k.d.blob(k.d.leaves, sc, x, GROUND + sc * sy * 0.8, z, col ?? k.d.c.hedge2, sy, 0); }
/** A small ornamental tree (frangipani, neem): a bark trunk and two or three crowns; cheaper than a palm. */
export function tree(k: Ctx, x: number, z: number, sc = 1, col?: number) {
  const { d } = k, c = col ?? d.c.hedge2;
  d.cyl(d.trunks, 0.1 * sc, 0.16 * sc, 2.2 * sc, x, GROUND, z, d.c.bark, 5);
  d.blob(d.leaves, 1.05 * sc, x, GROUND + 2.9 * sc, z, c, 0.8, 0);
  if (!k.lite) { d.blob(d.leaves, 0.7 * sc, x + 0.55 * sc, GROUND + 2.4 * sc, z + 0.2 * sc, d.c.hedge, 0.8, 0); }
  d.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 3);
}
/** A planter box with its shrub and, on the non-lite preset, a flowering one; solid. */
export function pot(k: Ctx, x: number, z: number, w = 1.2, dd = 0.6, h = 0.55, flower = false) {
  const { d } = k;
  d.box(d.plain, w, h, dd, x, GROUND, z, d.p.stone);
  d.blob(d.leaves, Math.min(w, 1.1) * 0.42, x, GROUND + h + 0.22, z, d.c.hedge2, 0.85, 0);
  if (flower && !k.lite) d.blob(d.leaves, 0.28, x + w * 0.22, GROUND + h + 0.38, z + 0.05, d.c.bloom, 0.8, 0);
  d.solid(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2, h);
}
/** A lantern post: a bronze post with a lit head (the bulb batch). */
export function lantern(k: Ctx, x: number, z: number, h = 0.7) {
  const { d } = k;
  d.box(d.plain, 0.12, h, 0.12, x, GROUND, z, d.p.frame);
  d.box(d.bulbs, 0.12, 0.1, 0.12, x, GROUND + h, z, d.c.bulb);
  if (!k.lite) d.light(x, z, 1.8, 0.18);
}
/** A wall light: a small lit box on a vertical face at (x, y, z), the wall's side given by `face`. */
export function sconce(k: Ctx, face: Face, x: number, y: number, z: number) {
  const { d } = k, n = face === 'street' ? [0, 1] : face === 'back' ? [0, -1] : face === 'right' ? [1, 0] : [-1, 0];
  d.box(d.plain, n[0] ? 0.08 : 0.26, 0.32, n[0] ? 0.26 : 0.08, x + n[0] * 0.04, y, z + n[1] * 0.04, d.p.frame);
  d.box(d.bulbs, n[0] ? 0.03 : 0.16, 0.2, n[0] ? 0.16 : 0.03, x + n[0] * 0.09, y + 0.06, z + n[1] * 0.09, d.c.bulb);
}

// ------------------------------------------------------------------------------------------------ the house number
/** Seven-segment strokes of a digit: a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle. */
const DIGIT: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
/**
 * A plaque on the street face of a wall or a pillar: a dark box (`w` × `h`) with the number in two-triangle strokes, read from the street whatever the
 * frame (the digits' own order and the plaque's yaw follow the site's frame, not the design's mirror). `x`, `z`: the plaque's centre on the face; `y` its middle.
 */
export function plaque(k: Ctx, text: string, x: number, y: number, z: number, o: { w?: number; h?: number; face?: Face } = {}) {
  const { d, o: s } = k, w = o.w ?? 0.46, h = o.h ?? 0.26, f = s.f, X = k.flip ? -x : x;
  d.box(d.plain, w, h, 0.05, x, y - h / 2, z, s.c.plaque);
  if (k.lite) return;
  const mirror = f.mirror ? -1 : 1, q = f.p(X, z), q1 = f.p(X + mirror, z), right = { x: q1.x - q.x, z: q1.z - q.z }, yaw = f.rot(0);
  const n = text.length, dw = Math.min(0.13, (w - 0.1) / Math.max(1, n) - 0.03), dh = Math.min(0.17, h - 0.08), t = 0.022, gap = dw + 0.045, u0 = -((n - 1) * gap) / 2;
  const quad = (u: number, yy: number, sw: number, sh: number) => {
    const g = new THREE.PlaneGeometry(sw, sh);
    s.plain.geometry(g, s.c.brass, q.x + right.x * u + Math.sin(yaw) * 0.03, yy, q.z + right.z * u + Math.cos(yaw) * 0.03, yaw);
  };
  [...text].forEach((ch, i) => {
    const u = u0 + i * gap, yc = y, top = yc + dh / 2, mid = yc, bot = yc - dh / 2;
    for (const seg of DIGIT[ch] ?? '') {
      if (seg === 'a') quad(u, top, dw, t); else if (seg === 'g') quad(u, mid, dw, t); else if (seg === 'd') quad(u, bot, dw, t);
      else if (seg === 'b') quad(u + dw / 2, (top + mid) / 2, t, dh / 2); else if (seg === 'c') quad(u + dw / 2, (mid + bot) / 2, t, dh / 2);
      else if (seg === 'f') quad(u - dw / 2, (top + mid) / 2, t, dh / 2); else quad(u - dw / 2, (mid + bot) / 2, t, dh / 2);
    }
  });
}

// ------------------------------------------------------------------------------------------------ the pool
/**
 * A pool with its coping and deck: the water a flat quad in the water batch (2 triangles), the coping four boxes, the deck a flat of paving round it.
 * `deck`: the paved apron round the pool (x0…x1, z0…z1 of the whole terrace); the pool sits at `p` inside it.
 */
export function pool(k: Ctx, p: PlanRect, deck?: PlanRect, o: { rim?: number; water?: number } = {}) {
  const { d } = k, rim = o.rim ?? 0.3, w = p.x1 - p.x0, dd = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, top = GROUND + 0.14;
  if (deck) pave(k, deck, d.c.deck);
  d.box(d.plain, w + 2 * rim, 0.14, rim, cx, GROUND, p.z1 + rim / 2, d.c.rim);
  d.box(d.plain, w + 2 * rim, 0.14, rim, cx, GROUND, p.z0 - rim / 2, d.c.rim);
  d.box(d.plain, rim, 0.14, dd, p.x0 - rim / 2, GROUND, cz, d.c.rim);
  d.box(d.plain, rim, 0.14, dd, p.x1 + rim / 2, GROUND, cz, d.c.rim);
  d.flat(d.water, w, dd, cx, top - 0.1, cz, o.water ?? d.c.water);
  d.light(cx, cz, Math.max(w, dd) * 0.45, top - 0.05);
}
/** A teak lounger with its cushion (3 boxes), lying along z, its head toward -z. */
export function lounger(k: Ctx, x: number, z: number, turn = false) {
  const { d } = k, l = turn ? -1 : 1;
  d.box(d.plain, 0.62, 0.22, 1.8, x, GROUND, z, d.c.teak);
  d.box(d.plain, 0.56, 0.07, 1.25, x, GROUND + 0.22, z + 0.25 * l, d.c.cushion);
}
/** A parasol: a pole and a canvas cone. */
export function parasol(k: Ctx, x: number, z: number, h = 2.3) {
  const { d } = k;
  d.cyl(d.plain, 0.03, 0.03, h, x, GROUND, z, d.c.post, 4);
  d.cyl(d.plain, 0.05, 1.45, 0.4, x, GROUND + h - 0.1, z, d.c.canvas, 8);
}
export { E, GROUND, STOREY };
export const bx = (d: SiteDraw, b: 'plain' | 'glass' | 'leaves' | 'bulbs' | 'metal' | 'pave' | 'water', w: number, h: number, dd: number, x: number, y: number, z: number, col: number) => d.box(d[b], w, h, dd, x, y, z, col);

// ------------------------------------------------------------------------------------------------ guards, posts, decks
/** One run of frameless glass guard (1.05 m) with its bronze rail, from (x0, z0) to (x1, z1) along an axis, standing on `y`. */
export function rail(k: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, h = 1.05) {
  const { d } = k, along = Math.abs(x1 - x0) >= Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, l = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  d.box(d.glass, along ? l : 0.05, h, along ? 0.05 : l, cx, y, cz, guardGlass(d.p.glass));
  d.box(d.plain, along ? l + 0.04 : 0.07, 0.05, along ? 0.07 : l + 0.04, cx, y + h, cz, d.p.frame);
}
/** A slim bronze post from the ground (or `y0`) up to `y1`. */
export function post(k: Ctx, x: number, z: number, y1: number, y0 = GROUND, s = 0.2, col?: number) { k.d.box(k.d.plain, s, y1 - y0, s, x, y0, z, col ?? k.d.p.frame); }
/** A roof deck: a flat quad of wood on a roof's top. */
export function deckFlat(k: Ctx, r: PlanRect, y: number, col?: number) { const { d } = k; d.flat(d.plain, r.x1 - r.x0, r.z1 - r.z0, (r.x0 + r.x1) / 2, y + 0.015, (r.z0 + r.z1) / 2, col ?? d.p.wood); }
/** Grow a rectangle. */
export const grow = (r: PlanRect, e: number): PlanRect => ({ x0: r.x0 - e, x1: r.x1 + e, z0: r.z0 - e, z1: r.z1 + e });

// ------------------------------------------------------------------------------------------------ the guard's glass, cost marks
/** A pale glass for guards and balustrades (the windows' glass is dark: a guard in it would read as a dark apron): the palette's glass lightened. */
export function guardGlass(c: number): number {
  const m = (a: number, b: number) => Math.round(a + (b - a) * 0.72);
  return (m((c >> 16) & 255, 0xc4) << 16) | (m((c >> 8) & 255, 0xdc) << 8) | m(c & 255, 0xe6);
}
/** The draw with its glass lightened, for the shared balcony and parapet (their guard is `p.glass`). */
export function lightGuard(k: Ctx): SiteDraw {
  const g = Object.create(k.d) as SiteDraw;
  g.p = { ...k.d.p, glass: guardGlass(k.d.p.glass) };
  return g;
}
/** Dev only: a scratch test sets `globalThis.__markCost` to read what each part of a design costs. */
export function mark(k: Ctx, label: string) {
  const h = (globalThis as { __markCost?: (label: string, tris: number) => void }).__markCost;
  if (!h) return;
  const b = k.o as unknown as Record<string, { triangles(): number }>;
  h(label, ['plain', 'pave', 'leaves', 'trunks', 'water', 'bulbs', 'glass', 'fac', 'metal'].reduce((n, key) => n + b[key].triangles(), 0));
}

// ------------------------------------------------------------------------------------------------ cheaper pergolas, slatted slabs, garage doors
/**
 * A pergola on `r` at floor `y`: slim posts at the corners, two beams along x and slats across them every `pitch` m (one piece); lighter than the
 * shared pergola (fewer slats). `posts` false: slats and beams only (a slatted slab on a wall or on the posts the design draws).
 */
export function slats(k: Ctx, r: PlanRect, y: number, o: { h?: number; pitch?: number; col?: number; beam?: number; posts?: boolean; thick?: number } = {}) {
  const { d } = k, h = o.h ?? 2.5, w = r.x1 - r.x0, dd = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, pitch = (o.pitch ?? 0.5) * (k.lite ? 1.7 : 1), bm = o.beam ?? 0.18, col = o.col ?? d.p.frame;
  if (o.posts !== false) for (const x of [r.x0 + 0.1, r.x1 - 0.1]) for (const z of [r.z0 + 0.1, r.z1 - 0.1]) d.box(d.plain, 0.15, h, 0.15, x, y, z, col);
  for (const z of [r.z0 + 0.1, r.z1 - 0.1]) d.box(d.plain, w, bm, 0.18, cx, y + h, z, col);
  const n = Math.max(2, Math.floor(w / pitch)), parts: [number, number, number, number, number, number, number][] = [];
  for (let i = 0; i <= n; i++) parts.push([0.07, o.thick ?? 0.1, dd + 0.2, r.x0 + (w * i) / n, y + h + bm, cz, d.p.wood]);
  d.joined(d.plain, parts);
  void cz;
}
/** A garage door: a metal panel in the face of a mass (dark bronze) with its grooves, `face` 'street' only; x its centre, z the face's plane. */
export function garageDoor(k: Ctx, x: number, z: number, w = 2.7, h = 2.3, col?: number) {
  const { d } = k, c = col ?? d.p.frame;
  d.box(d.metal, w, h, 0.1, x, GROUND, z + 0.05, c);
  if (!k.lite) for (const y of [0.75, 1.5]) d.box(d.plain, w - 0.1, 0.04, 0.03, x, GROUND + y, z + 0.12, d.p.stoneDark);
  d.box(d.bulbs, 0.5, 0.05, 0.12, x, GROUND + h + 0.12, z + 0.15, d.c.bulb);
}
/** A roof or floor slab on `r` (its top at `y`) with its own overhang on each side (left −x, right +x, front +z, back −z), six faces. */
export function eave(k: Ctx, r: PlanRect, y: number, thick = T_SLAB, ov: { l?: number; r?: number; f?: number; b?: number } = {}, col?: number) {
  const { d } = k, x0 = r.x0 - (ov.l ?? 0.4), x1 = r.x1 + (ov.r ?? 0.4), z0 = r.z0 - (ov.b ?? 0.4), z1 = r.z1 + (ov.f ?? 0.4);
  d.slab(d.plain, x1 - x0, thick, z1 - z0, (x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2, col ?? d.p.slab);
}
/** A pedestrian gate in a low street wall: two stone piers with their lights and a shut slatted leaf between them (visual: the wall's solid runs across it). */
export function footGate(k: Ctx, x: number, w = 1.1) {
  const { d } = k, z = E - 0.3 / 2 + 0.02;
  for (const s of [-1, 1]) {
    d.box(d.plain, 0.4, 1.65, 0.42, x + s * (w / 2 + 0.2), GROUND, z, d.p.stone);
    d.box(d.plain, 0.5, 0.08, 0.5, x + s * (w / 2 + 0.2), GROUND + 1.65, z, d.p.stoneDark);
    if (!k.lite) d.box(d.bulbs, 0.16, 0.18, 0.16, x + s * (w / 2 + 0.2), GROUND + 1.73, z, d.c.bulb);
  }
  d.box(d.metal, w, 1.3, 0.06, x, GROUND, z - 0.08, d.p.frame);
  if (!k.lite) d.box(d.plain, w - 0.2, 0.2, 0.04, x, GROUND + 0.9, z + 0.0, d.p.wood);
}

// ------------------------------------------------------------------------------------------------ a cheaper window
/**
 * A window on a face of a mass: a dark pane in a frame box behind it (two boxes: 20 triangles; the shared `glazing` is 50 and more), for the secondary
 * windows. `at` is the face's plane, `u0…u1` the span along it, `y0…y1` the height; `sill` adds a stone sill.
 */
export function win(k: Ctx, o: { face: Face; at: number; u0: number; u1: number; y0: number; y1: number; sill?: boolean }) {
  const { d } = k, ax = o.face === 'street' || o.face === 'back' ? 'x' : 'z', s = o.face === 'street' || o.face === 'right' ? 1 : -1, c = (o.u0 + o.u1) / 2, len = o.u1 - o.u0, h = o.y1 - o.y0, fr = 0.06;
  const at = (u: number, off: number) => ax === 'x' ? [u, o.at + s * off] as const : [o.at + s * off, u] as const;
  const [fx, fz] = at(c, 0.025), [gx, gz] = at(c, 0.05);
  d.box(d.plain, ax === 'x' ? len + 2 * fr : 0.05, h + 2 * fr, ax === 'x' ? 0.05 : len + 2 * fr, fx, o.y0 - fr, fz, d.p.frame);
  d.box(d.glass, ax === 'x' ? len : 0.04, h, ax === 'x' ? 0.04 : len, gx, o.y0, gz, d.p.glass);
  if (o.sill && !k.lite) { const [sx, sz] = at(c, 0.1); d.box(d.plain, ax === 'x' ? len + 0.3 : 0.2, 0.06, ax === 'x' ? 0.2 : len + 0.3, sx, o.y0 - fr - 0.06, sz, d.p.stone); }
}
/** The roof's plant, light: a tank, two solar panels and an air conditioner (≈ 70 triangles). */
export function roofKit(k: Ctx, x: number, z: number, y: number) {
  const { d } = k;
  d.cyl(d.plain, 0.5, 0.5, 1.1, x, y, z, 0xdfe3e6, 6);
  if (!k.lite) d.slab(d.plain, 1.3, 0.05, 0.9, x + 1.5, y + 0.5, z, 0x233044);
  d.box(d.plain, 0.7, 0.5, 0.45, x - 1.2, y, z + 0.1, 0xbfc4c8);
}
/** A lighter palm for the back gardens (a two-drum trunk, seven fronds: ≈ 110 triangles against the shared palm's 190); same look from a distance. */
export function palmSmall(k: Ctx, x: number, z: number, sc = 1, turn = 0) {
  const { d, o } = k, h = 5.8 * sc, ty = GROUND + h, top = o.f.p(k.flip ? -x : x, z), n = k.lite ? 5 : 7;
  for (let i = 0; i < 2; i++) d.cyl(d.trunks, 0.15 * sc + (1 - i) * 0.04, 0.19 * sc + (1 - i) * 0.045, h / 2 + 0.05, x + i * 0.05, GROUND + (i * h) / 2, z, i ? d.c.bark2 : d.c.bark, 5);
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2, len = 3.3 * sc, r = len * 0.45;
    d.box(d.leaves, 0.7 * sc, 0.1 * sc, len, x + 0.12 + Math.sin(a) * r, ty - 0.35 * sc - (i % 2) * 0.25, z + Math.cos(a) * r, i % 2 ? d.c.frond2 : d.c.frond, a);
  }
  d.canopies.push({ x: top.x, z: top.z, r: 3.2 * sc, y0: ty - 0.8 * sc, y1: ty + 0.3 * sc });
  d.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 3);
  d.light(x + 0.4, z + 0.4, 2.1, 0.17);
}
