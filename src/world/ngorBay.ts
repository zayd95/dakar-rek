import * as THREE from 'three';
import { Batch } from './batch';
import { TRAVERSEE_SITE as S } from '../sea/traverseeSite';
import { islandXZ, ngorAngles, ngorWaterR, palmTree, type NgorBatches } from './ngor';
import { rng } from '../core/rng';
import type { Collider } from './types';

/**
 * The bay of Ngor between the Almadies' north beach and the island (docs/TRAVERSEE.md version 2, the owner's photos 1 and 4): the wet sand at the
 * water's edge, the white launches riding at anchor, and the turquoise shallows along both shores. The sand and the launches go into the hub's
 * batches (no draw call); the shallows are one transparent mesh (one draw call), under the boats' wakes.
 */
type V3 = [number, number, number];
const SHORE = S.shoreZ;

// ------------------------------------------------------------------ the wet sand
/** The mainland beach's dry sand (src/world/builder.ts) ends this far up from the waterline; the wet sand slopes from there into the sea. */
export const WET_SAND_TOP = SHORE + 3.5;
const WET_SLOPE = (0.1 - S.seaY) / (WET_SAND_TOP - SHORE);          // the dry sand's top (y 0.1) down to the sea at the waterline: about 1 in 70
const wetY = (z: number) => 0.1 - (WET_SAND_TOP - z) * WET_SLOPE;
/** The mainland beach's sand at z (y): the dry sand's top (0.1, where people stand), then the wet sand sloping under the sea to the sea's floor (−0.02). */
export const beachSandY = (z: number) => z >= WET_SAND_TOP ? 0.1 : Math.max(wetY(z), -0.02);
/**
 * The wet sand along the north beach, from the dry sand's edge down into the sea: the beach slopes gently under the water so the beached boats' bows lie
 * over sand, never over a step; darker toward the water, the tide's line wavering along it. The dry sand ends in its step where this begins (no seam).
 * x0…x1 the beach's length; vertex-coloured, in `b` (the hub's plain batch).
 */
export function wetSand(b: Batch, x0: number, x1: number, lite: boolean) {
  const xs: number[] = [];
  for (let x = x0; x < x1; x += Math.abs(x - 40) < 90 ? (lite ? 6 : 3) : 12) xs.push(x);
  xs.push(x1);
  // rows down the slope: the dry sand's colour at its edge, the tide's line, the waterline, and on under the sea
  const rows: [(x: number) => number, number][] = [
    [() => WET_SAND_TOP, 0xe9d9a8],
    [x => WET_SAND_TOP - 1.0 - 0.45 * Math.sin(x * 0.13 + 1.2) - 0.3 * Math.sin(x * 0.37), 0xd6c398],
    [() => SHORE, 0xbea77b],
    [() => SHORE - 7, 0xa8946c],
  ];
  const pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color();
  for (const x of xs) for (const [zf, hex] of rows) { const z = zf(x); pos.push(x, wetY(z) + 0.001, z); c.setHex(hex); col.push(c.r, c.g, c.b); }
  const m = rows.length;
  for (let i = 0; i < xs.length - 1; i++) for (let r = 0; r < m - 1; r++) { const a = i * m + r, d = a + m; idx.push(a, d, a + 1, a + 1, d, d + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  b.coloured(g);
}

// ------------------------------------------------------------------ the beach's palms
/**
 * More palms along the Almadies' north beach (the owner: « more trees »), x, z: west of the pier and east of the boarding beach (x 36…62 stays open:
 * beach.clear, the customers' way from the waiting spots to the boats, the walk from the block to the anchor), clear of the pier and the pontoon, the
 * pirogues on the sand, the beach-walkers' way (z −141) and their spots. The first ten on Low.
 */
export const BEACH_PALMS: [number, number][] = [
  [-96, -138], [-55, -150], [-3, -145], [24.5, -147], [67, -139], [95, -144], [-112, -146], [-20, -152], [84, -152], [-70, -145],
  [-86, -151], [-44, -137.5], [-36, -147], [4, -150], [104, -151], [118, -138], [-121, -153], [112, -146.5],
];
/** The beach's palms on the sand, into the hub's trunk and leaf batches; a slim solid at each foot. About 56 triangles a palm. */
export function buildBeachPalms(k: NgorBatches, lite: boolean, taken: (x: number, z: number) => boolean = () => false): Collider[] {
  const R = rng(2610), colliders: Collider[] = [];
  for (const [x, z] of BEACH_PALMS.slice(0, lite ? 10 : BEACH_PALMS.length)) {
    // a palm where the night street stands (src/world/nightStreet.ts) is drawn into a batch nobody builds, so the others keep their fronds and their random numbers
    palmTree(taken(x, z) ? { plain: new Batch(), leaves: new Batch(), trunks: new Batch(), bulbs: new Batch() } : k, x, 0, z, 1 + R() * 0.25, R, lite ? 5 : 6);
    if (!taken(x, z)) colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, h: 3 });
  }
  return colliders;
}

// ------------------------------------------------------------------ the launches at anchor
/**
 * The bay's white launches (photo 1): x, z, yaw (bow at −z turned by yaw), length, half-beam, bottom paint, stripe, a T-top (its canvas colour) or
 * none, outboards, fishing rods. Outside both clear zones and the crossing's corridor (x 34…52 from the beach to the island); the last is moored along
 * the pontoon's west side. The first three and the moored one on Low.
 */
export interface Launch { x: number; z: number; yaw: number; len: number; hw: number; bottom: number; stripe: number; top: number | null; motors: 1 | 2; rods: boolean }
const L = (x: number, z: number, yaw: number, len: number, hw: number, bottom: number, stripe: number, top: number | null, motors: 1 | 2, rods: boolean): Launch => ({ x, z, yaw, len, hw, bottom, stripe, top, motors, rods });
const ANTIFOUL = 0xa8382c, NAVY = 0x1f4f8a, GREEN = 0x2c6e4f, BLUE = 0x1d5fa6, RED = 0xc8352a, WHITE = 0xf3f2ec, CANVAS = 0x2f6fb0;
export const LAUNCHES: Launch[] = [
  L(17.5, -186, 0.55, 7.2, 1.15, ANTIFOUL, BLUE, WHITE, 2, true),
  L(70, -192, -0.45, 7.6, 1.2, NAVY, RED, WHITE, 2, false),
  L(23, -224, 0.35, 6.6, 1.05, GREEN, RED, CANVAS, 1, false),
  L(6.5, -207, 0.85, 6.8, 1.1, ANTIFOUL, BLUE, null, 1, true),
  L(82, -216, -0.25, 7, 1.12, ANTIFOUL, BLUE, WHITE, 2, true),
  L(S.pontoon.x0 - 0.42 - 1.1, -167.6, 0, 7, 1.1, NAVY, BLUE, WHITE, 2, false),
];

/** A section of a launch's hull at u (0 the stem, 1 the transom): its half-width and sheer (rising to the bow), its keel (the forefoot curving up) and chine. */
function launchSec(u: number, len: number, hw: number) {
  const w = Math.max(0.03, hw * (1 - Math.pow(1 - Math.min(u / 0.55, 1), 2.2)));
  const yk = u < 0.25 ? -0.25 + 0.75 * (1 - u / 0.25) ** 2 : -0.25;
  return { z: (u - 0.5) * len, w, ys: 0.72 + 0.32 * (1 - u) ** 3, yk, cw: w * (0.5 + 0.35 * u), yc: yk + 0.12 + 0.18 * (1 - u) ** 2 };
}
/** A surface through rows of points (rows[i][j]: section i, point j across), facing out for the starboard rows given; `flip` the other face. */
function sheet(rows: V3[][], flip: boolean): THREE.BufferGeometry {
  const m = rows[0].length, pos: number[] = [], idx: number[] = [];
  for (const r of rows) for (const p of r) pos.push(...p);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; idx.push(...(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c])); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

/**
 * A launch at anchor, built along its local z (bow at −z) and set down at its place: a decked white hull (antifouling below the chine, a coloured
 * stripe under the sheer), a console, a T-top on two posts, its outboards tilted down at the transom, rods in their holders. About 190 triangles.
 */
function launch(b: Batch, o: Launch, lite: boolean) {
  const us = [0, 0.1, 0.25, 0.5, 0.78, 1], secs = us.map(u => launchSec(u, o.len, o.hw)), y0 = S.seaY;
  const put = (g: THREE.BufferGeometry, color: number) => b.geometry(g, color, o.x, y0, o.z, o.yaw);
  const at = (s: ReturnType<typeof launchSec>, f: number): V3 => [s.cw + (s.w - s.cw) * f, s.yc + (s.ys - s.yc) * f, s.z];
  const keel = (s: ReturnType<typeof launchSec>): V3 => [0, s.yk, s.z];
  const mir = (rows: V3[][]) => rows.map(r => r.map(([x, y, z]) => [-x, y, z] as V3));
  const panel = (lo: (s: ReturnType<typeof launchSec>) => V3, hi: (s: ReturnType<typeof launchSec>) => V3, color: number) => {
    const rows = secs.map(s => [lo(s), hi(s)]);
    put(sheet(rows, false), color); put(sheet(mir(rows), true), color);
  };
  panel(keel, s => at(s, 0), o.bottom);
  panel(s => at(s, 0), s => at(s, 0.62), WHITE);
  panel(s => at(s, 0.62), s => at(s, 0.78), o.stripe);
  panel(s => at(s, 0.78), s => at(s, 1), WHITE);
  // the transom, facing aft; the deck flush with the sheer, closing the hull
  const T = secs[secs.length - 1];
  const transom = (lo: V3, hi: V3, color: number) => put(sheet([[[-lo[0], lo[1], T.z], [-hi[0], hi[1], T.z]], [[lo[0], lo[1], T.z], [hi[0], hi[1], T.z]]], true), color);
  transom(keel(T), at(T, 0), o.bottom); transom(at(T, 0), at(T, 1), WHITE);
  put(sheet(secs.map(s => [[-s.w, s.ys, s.z], [s.w, s.ys, s.z]] as V3[]), true), 0xe6e3da);
  // the console amidships, a seat aft of it, the outboards at the transom (tilted down, their legs in the water)
  const deck = T.ys, cz = 0.4;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); put(g, color);
  };
  box(0.85, 1.0, 0.75, 0, deck - 0.05, cz, WHITE);
  box(0.75, 0.04, 0.3, 0, deck + 0.95, cz - 0.42, 0x6f8fa0);                         // the windscreen's glass, leaning over its front
  if (!lite) box(1.1, 0.45, 0.6, 0, deck - 0.05, cz + 1.3, 0xd8d3c6);
  for (let n = 0; n < o.motors; n++) {
    const mx = o.motors === 2 ? (n ? 0.38 : -0.38) : 0;
    box(0.4, 0.62, 0.5, mx, deck - 0.12, T.z + 0.32, n ? 0x2b2f35 : 0x3a3f46);
    box(0.13, 0.85, 0.2, mx, -0.25, T.z + 0.42, 0x2b2f35);
  }
  // the T-top: a canvas or fibreglass roof over the console on two posts
  if (o.top !== null && !lite) {
    for (const s of [-1, 1]) box(0.06, 1.95, 0.06, s * 0.42, deck - 0.05, cz + 0.55, 0xc8ccd0);
    const g = new THREE.BoxGeometry(1.5, 0.07, 1.7); g.translate(0, deck + 1.93, cz + 0.2); put(g, o.top);
  }
  if (o.rods && !lite) for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.025, 2.6, 0.025); g.translate(0, 1.3, 0); g.rotateX(0.45); g.rotateZ(s * 0.25); g.translate(s * 0.6, deck, T.z - 0.5); put(g, 0x1d1f22); }
}

/** The launches at anchor in the bay and the one moored at the pontoon, into the hub's plain batch. About 1 200 triangles (500 on Low). */
export function buildNgorLaunches(b: Batch, lite: boolean) {
  const shown = lite ? [...LAUNCHES.slice(0, 3), LAUNCHES[LAUNCHES.length - 1]] : LAUNCHES;
  for (const o of shown) launch(b, o, lite);
}

// ------------------------------------------------------------------ the shallows
/** The shallows' colours: foam at the water's edge, the clear turquoise over sand, the blue-green further out where it fades into the sea. */
const FOAM = new THREE.Color(0xf4f8f4), TURQ = new THREE.Color(0x46d6c8), TEAL = new THREE.Color(0x2bb2bd), DEEP = new THREE.Color(0x1f8fb4);
/** The shallows lie this far above the sea plane: under the boats' wakes (y 0.08 over their own sea level), never fighting the sea's depth. */
const SHALLOW_Y = S.seaY + 0.022;

/**
 * The turquoise shallows (photos 2 and 4) as one transparent mesh: a band along the Almadies' north beach, foam at the water's edge then clear
 * turquoise fading into the sea some 25 m out, and a ring round the island of Ngor fading the same way. Lambert, so it takes the scene's light as the
 * sea does (its faint emissive matches the sea's); `night` (0 by day, 1 at night) fades it to a trace after dark, so the moonlit shallows never read
 * paler than the sea, as if lit from within. No depth write, drawn before the wakes. One draw call.
 */
export function buildNgorShallows(lite: boolean, night: () => number = () => 0): THREE.Mesh {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const add = (x: number, z: number, c: THREE.Color, a: number) => { pos.push(x, SHALLOW_Y, z); col.push(c.r, c.g, c.b, a); return pos.length / 3 - 1; };
  const strip = (cols: number, rows: number, first: number) => {
    for (let i = 0; i < cols - 1; i++) for (let r = 0; r < rows - 1; r++) { const a = first + i * rows + r, d = a + rows; idx.push(a, d, a + 1, a + 1, d, d + 1); }     // facing up
  };
  // along the beach: from over the wet sand's lower edge (the foam's swash), through the foam at the waterline, out to nothing; fading at the ends
  const xs: number[] = [];
  for (let x = -330; x < 330; x += Math.abs(x - 40) < 100 ? (lite ? 8 : 4) : 20) xs.push(x);
  xs.push(330);
  const beach: [(x: number) => number, THREE.Color, number][] = [
    [() => SHORE + 0.9, FOAM, 0],
    [x => SHORE - 0.15 + 0.2 * Math.sin(x * 0.9 + 0.4), FOAM, 0.78],
    [x => SHORE - 1.3 - 0.35 * Math.sin(x * 0.23 + 1.1) - 0.2 * Math.sin(x * 0.61), TURQ, 0.6],
    [x => SHORE - 9 - 1.5 * Math.sin(x * 0.05), TURQ, 0.48],
    [x => SHORE - 18 - 2 * Math.sin(x * 0.04 + 2), TEAL, 0.26],
    [x => SHORE - 28 - 3 * Math.sin(x * 0.03 + 1), DEEP, 0],
  ];
  let first = pos.length / 3;
  for (const x of xs) {
    const fade = Math.min(1, (330 - Math.abs(x)) / 80);
    for (const [zf, c, a] of beach) add(x, zf(x), c, a * fade);
  }
  strip(xs.length, beach.length, first);
  // round the island: from under its sand (hidden there) through a lighter foam at its waterline, out to nothing (r: fractions of the shore's radius)
  const ts = ngorAngles(lite), seg = lite ? 40 : 64, ring: number[] = [];
  for (let j = 0; j < seg; j++) ring.push(j / seg * Math.PI * 2);
  for (const t of ts) if (!ring.some(u => Math.abs(u - t) < 0.015)) ring.push(t);       // the ground's own cuts: the water meets the sand along them
  ring.sort((a, b) => a - b); ring.push(ring[0] + Math.PI * 2);
  const island: [number, THREE.Color, number][] = [[-0.02, FOAM, 0.5], [0.012, FOAM, 0.45], [0.045, TURQ, 0.66], [0.2, TURQ, 0.54], [0.4, TEAL, 0.3], [0.62, DEEP, 0]];
  first = pos.length / 3;
  for (const t of ring) {
    const w = ngorWaterR(t, SHALLOW_Y);
    for (const [dr, c, a] of island) { const p = islandXZ(w + dr, t); add(p.x, p.z, c, a); }
  }
  strip(ring.length, island.length, first);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, depthWrite: false, emissive: 0x0b4652, emissiveIntensity: 0.35,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'shallows'; mesh.renderOrder = 0; mesh.receiveShadow = false; mesh.castShadow = false;
  mesh.onBeforeRender = () => { mat.opacity = 1 - 0.65 * Math.min(1, Math.max(0, night())); };
  return mesh;
}
