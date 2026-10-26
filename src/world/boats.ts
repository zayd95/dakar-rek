import * as THREE from 'three';
import { Batch } from './batch';
import { pirogue } from './city';
import type { BoatKind, BoatModel, LocalSeat, P2 } from '../sea/traverseeSite';

/**
 * The traversée's boats (docs/TRAVERSEE.md, the contract in src/sea/traverseeSite.ts): the painted pirogue with its thwarts and outboard, and the
 * chaloupe, the nicer launch. Each is one group holding one merged mesh (the material passed in) and its wake, built along its local z, bow at −z,
 * motor at +z. The group's origin floats at sea level: the hulls draw a little water (their keels are below y 0) and every floor a person stands or
 * sits above is above it, so the sea plane never shows inside a boat at rest or rocking a little.
 */
type V3 = [number, number, number];
/** What a hull's builder returns besides its geometry: the helm, the seats, the beam, and the step aboard (the contract's BoatModel). */
interface Fitted { helm: LocalSeat; seats: LocalSeat[]; beam: number; step: P2 }
const WOOD = 0x8c6542, WOOD_DARK = 0x5c4128, MOTOR = 0x2b2f35;
const SEAT_YAW = Math.PI;   // seated facing the bow (−z)

/** A smooth surface through rows of points (rows[i][j]: section i along the hull, point j across it); `flip` reverses its winding (the other face). */
function grid(rows: V3[][], flip: boolean): THREE.BufferGeometry {
  const m = rows[0].length, pos: number[] = [], idx: number[] = [];
  for (const r of rows) for (const p of r) pos.push(...p);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
    idx.push(...(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const mirror = (rows: V3[][]) => rows.map(r => r.map(([x, y, z]) => [-x, y, z] as V3));
/** A flat strip between a left (smaller x) and a right row, facing up. */
const ribbon = (left: V3[], right: V3[]) => grid(left.map((l, i) => [l, right[i]]), true);

/** The wake behind the stern: a trail that fades from the motor out (vertex alpha) and two arms spreading from the quarters. Opacity 0 until the crossing sets it. */
function wakeMesh(beam: number, stern: number): { mesh: THREE.Mesh; geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial } {
  const pos: number[] = [], col: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3, aa: number, ab: number, ac: number, ad: number) => {   // a b near, c d far (a, c on the left)
    for (const [p, al] of [[a, aa], [c, ac], [b, ab], [b, ab], [c, ac], [d, ad]] as [V3, number][]) { pos.push(...p); col.push(1, 1, 1, al); }
  };
  const z0 = stern + 0.1, z1 = stern + 2.6, z2 = stern + 7, w0 = beam * 0.25, w1 = beam * 0.5, w2 = beam * 0.85;
  quad([-w0, 0, z0], [w0, 0, z0], [-w1, 0, z1], [w1, 0, z1], 0.95, 0.95, 0.6, 0.6);
  quad([-w1, 0, z1], [w1, 0, z1], [-w2, 0, z2], [w2, 0, z2], 0.6, 0.6, 0, 0);
  for (const s of [-1, 1]) {                                                       // the arms: from the quarters, spreading out at about 20°
    const x0 = s * beam * 0.42, x1 = s * (beam * 0.42 + 2.2);
    const inner: V3 = [x0, 0, stern - 0.8], outer: V3 = [x0 + s * 0.22, 0, stern - 0.8], innerFar: V3 = [x1, 0, stern + 5.2], outerFar: V3 = [x1 + s * 0.7, 0, stern + 5.2];
    if (s < 0) quad(outer, inner, outerFar, innerFar, 0.5, 0.5, 0, 0); else quad(inner, outer, innerFar, outerFar, 0.5, 0.5, 0, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const mat = new THREE.MeshBasicMaterial({ color: 0xf4f6f2, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 0.08; mesh.renderOrder = 1; mesh.name = 'wake';
  return { mesh, geo, mat };
}

// ------------------------------------------------------------------ the pirogue
/** src/world/city.ts pirogue()'s hull at length 10: its half-width at the top of section t (0 at the bow, 1 at the stern), and the rise of its bottom there. */
const pWidth = (t: number) => 0.13 + Math.sin(t * Math.PI) * 0.94;
const pLift = (t: number) => Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.65;
const P_KEEL = -0.24;                 // the keel below the water: the pirogue draws about 25 cm
const P_FLOOR = 0.3;                  // the floorboards, above the bottom at every section (at mid-length 6 cm above the sea)
const P_SEAT = 0.46, P_HELM = 0.58;   // the thwarts' and the helm thwart's sitting surfaces above the water
/** The hull's inner half-width at height y (above the water) at z. */
function pirogueHalf(z: number, y: number) {
  const t = z / 10 + 0.5, f = Math.max(0, Math.min(1, (y - P_KEEL - pLift(t)) / 0.8));
  return pWidth(t) * (0.45 + 0.55 * f);
}

function buildPirogue(b: Batch, lite: boolean): Fitted {
  pirogue(b, 0, 0, 10, 0, 0, P_KEEL, { trued: true, fittings: false });
  // the floorboards, following the bottom's rise to either end: they hide the sea plane that crosses the hull below them
  const left: V3[] = [], right: V3[] = [];
  for (let k = 1; k < 12; k++) {
    const t = k / 12, z = (t - 0.5) * 10, y = P_KEEL + pLift(t) + P_FLOOR, w = pWidth(t) * (0.45 + 0.55 * P_FLOOR / 0.8) - 0.01;
    left.push([-w, y, z]); right.push([w, y, z]);
  }
  b.geometry(ribbon(left, right), 0x7a5a3c, 0, 0, 0);
  // three thwarts for six (two a thwart), and the helm's thwart beside the motor
  const thwarts = [-2.4, -0.4, 1.6];
  for (const z of thwarts) b.box(2 * pirogueHalf(z, P_SEAT - 0.07) - 0.03, 0.07, 0.32, 0, P_SEAT - 0.07, z, WOOD);   // as wide as the hull under them (it flares)
  b.box(2 * pirogueHalf(3.2, P_HELM - 0.07) - 0.03, 0.07, 0.3, 0, P_HELM - 0.07, 3.2, WOOD);
  // the outboard on a board across the stern, hung over the starboard (+x) side: its leg in the water beside the hull, the tiller forward to the helm's right hand
  b.box(1.55, 0.07, 0.3, 0.3, 0.88, 4.0, WOOD_DARK);
  b.box(0.18, 0.22, 0.24, 0.82, 0.74, 4.05, 0x1d1f22);                            // clamp
  b.box(0.4, 0.48, 0.58, 0.82, 0.95, 4.12, MOTOR);                               // powerhead
  b.box(0.36, 0.06, 0.52, 0.82, 1.43, 4.12, 0x1f5f9e);                           // its cap
  b.box(0.13, 1.25, 0.2, 0.82, -0.35, 4.2, MOTOR);                               // leg
  b.box(0.06, 0.06, 0.66, 0.6, 0.94, 3.6, 0x1d1f22, 0.62);                       // tiller
  b.box(0.22, 0.34, 0.36, -0.12, P_KEEL + pLift(0.885) + P_FLOOR, 3.85, 0xe8b923); // the fuel jerrycan behind the helm
  if (!lite) {
    for (const z of [-1.6, 1.0]) b.blob(0.12, -0.86, 0.32, z, 0xe8662a, 1.7, 0);     // fenders on the west side
    b.box(0.04, 0.85, 0.04, 0, 1.38, -4.95, 0xe9e4d8);                              // a pennant on the bow post, Senegal's colours
    [0x1f8a4c, 0xf2c318, 0xd23a2b].forEach((c, i) => b.box(0.02, 0.28, 0.14, 0, 1.92, -4.88 + i * 0.14, c));
  }
  const seats = thwarts.flatMap((z, k) => [-1, 1].map((s, j) => ({ id: `p${k * 2 + j}`, x: s * 0.36, y: P_SEAT, z, yaw: SEAT_YAW })));
  // the step: the west gunwale forward of the first thwart, where the bow, run up on the sand, still stands in the shallows (ankle- to knee-deep)
  const step = { x: -pWidth(0.16), z: -3.4 };
  return { helm: { id: 'helm', x: 0.12, y: P_HELM, z: 3.2, yaw: SEAT_YAW }, seats, beam: 2 * pWidth(0.5), step };
}

// ------------------------------------------------------------------ the chaloupe
const C_LEN = 8, C_HALF = 1.3;
const C_SOLE = 0.1, C_SEAT = 0.55, C_HELM = 0.6;
interface Sec { z: number; hw: number; ys: number; yk: number; cw: number; yc: number }
/**
 * A section of the chaloupe's hull at u (0 the stem, 1 the transom): the sheer's half-width and height (rising to the bow), the keel (its forefoot
 * curving up to the stem) and the chine, narrower than the sheer, most of all forward: the topsides flare out above it, the launch's flared bow.
 */
function sec(u: number): Sec {
  const s = Math.min(u / 0.62, 1);
  const hw = Math.max(0.02, u <= 0.62 ? C_HALF * (1 - Math.pow(1 - s, 2.4)) : C_HALF - 0.12 * ((u - 0.62) / 0.38) ** 2);
  const yk = u < 0.25 ? -0.32 + (1 - u / 0.25) ** 2 : -0.32;
  return { z: (u - 0.5) * C_LEN, hw, ys: 0.82 + 0.45 * (1 - u) ** 3, yk, cw: hw * (0.45 + 0.43 * u), yc: yk + 0.16 + 0.22 * (1 - u) ** 2 };
}
/** A point up the topsides, a fraction f of the way from the chine to the sheer. */
const up = (s: Sec, f: number): V3 => [s.cw + (s.hw - s.cw) * f, s.yc + (s.ys - s.yc) * f, s.z];
/** The hull's inner half-width at height y in a section. */
function cHalf(s: Sec, y: number) {
  if (y <= s.yk) return 0;
  if (y <= s.yc) return s.cw * (y - s.yk) / (s.yc - s.yk);
  return y >= s.ys ? s.hw : s.cw + (s.hw - s.cw) * (y - s.yc) / (s.ys - s.yc);
}
const secAtZ = (z: number) => sec(z / C_LEN + 0.5);

function buildChaloupe(b: Batch, lite: boolean): Fitted {
  const WHITE = 0xf4f3ee, BAND = 0x1d5fa6, LINE = 0xf2c318, BOTTOM = 0x8f3b2d, INSIDE = 0xe4e1d8;
  const N = 16, secs = Array.from({ length: N + 1 }, (_, i) => sec(Math.pow(i / N, 1.25)));   // closer sections toward the bow, where it curves
  // the skin: antifouling below the chine, white topsides with the blue band and its yellow line, both faces (the inside light grey)
  const panel = (lo: (s: Sec) => V3, hi: (s: Sec) => V3, color: number, inside = false) => {
    const rows = secs.map(s => [lo(s), hi(s)]);
    if (inside) { b.geometry(grid(rows, true), INSIDE, 0, 0, 0); b.geometry(grid(mirror(rows), false), INSIDE, 0, 0, 0); return; }
    b.geometry(grid(rows, false), color, 0, 0, 0); b.geometry(grid(mirror(rows), true), color, 0, 0, 0);
  };
  const keel = (s: Sec): V3 => [0, s.yk, s.z], bands: [number, number, number][] = [[0, 0.5, WHITE], [0.5, 0.56, LINE], [0.56, 0.8, BAND], [0.8, 1, WHITE]];
  panel(keel, s => up(s, 0), BOTTOM);
  for (const [f0, f1, c] of bands) panel(s => up(s, f0), s => up(s, f1), c);
  panel(s => up(s, 0), s => up(s, 1), 0, true);
  // the transom: the same stripes across the stern, outside and in
  const T = secs[N], levels: [V3, V3, number][] = [[keel(T), up(T, 0), BOTTOM], ...bands.map(([f0, f1, c]) => [up(T, f0), up(T, f1), c] as [V3, V3, number])];
  for (const [lo, hi, c] of levels) {
    const rows: V3[][] = [[[-lo[0], lo[1], T.z], [-hi[0], hi[1], T.z]], [[lo[0], lo[1], T.z], [hi[0], hi[1], T.z]]];
    b.geometry(grid(rows, true), c, 0, 0, 0); b.geometry(grid(rows, false), INSIDE, 0, 0, 0);
  }
  // the foredeck over the bow and its bulkhead; the sole (teak) from there to the transom, above the sea plane; the varnished cap along the gunwales
  const fore = secs.filter(s => s.z <= sec(0.2).z + 1e-6), F = fore[fore.length - 1];
  b.geometry(ribbon(fore.map(s => [-s.hw, s.ys, s.z]), fore.map(s => [s.hw, s.ys, s.z])), WHITE, 0, 0, 0);
  const sh = cHalf(F, C_SOLE);
  b.geometry(grid([[[-sh, C_SOLE, F.z], [-F.hw, F.ys, F.z]], [[sh, C_SOLE, F.z], [F.hw, F.ys, F.z]]], true), WHITE, 0, 0, 0);
  const aft = secs.filter(s => s.z >= F.z - 1e-6);
  b.geometry(ribbon(aft.map(s => [-cHalf(s, C_SOLE) + 0.01, C_SOLE, s.z]), aft.map(s => [cHalf(s, C_SOLE) - 0.01, C_SOLE, s.z])), 0xb58a5a, 0, 0, 0);
  const capIn = aft.map(s => [s.hw - 0.09, s.ys + 0.004, s.z] as V3), capOut = aft.map(s => [s.hw, s.ys + 0.004, s.z] as V3);
  b.geometry(ribbon(capIn, capOut), 0x8f6238, 0, 0, 0); b.geometry(ribbon(mirror([capOut])[0], mirror([capIn])[0]), 0x8f6238, 0, 0, 0);
  b.box(0.22, 0.06, 0.08, 0, sec(0.06).ys, sec(0.06).z, 0xc8ccd0);                // the bow cleat
  // two benches for four (two a bench), each with its back; the helm's seat beside the motor
  const benches = [-1.0, 0.6];
  for (const z of benches) {
    b.box(2 * cHalf(secAtZ(z), C_SEAT - 0.06) - 0.04, 0.06, 0.42, 0, C_SEAT - 0.06, z, 0xb58a5a);    // each part as wide as the flaring hull at its foot
    b.box(2 * cHalf(secAtZ(z - 0.19), C_SOLE) - 0.04, C_SEAT - 0.06 - C_SOLE, 0.04, 0, C_SOLE, z - 0.19, WHITE);
    b.box(2 * cHalf(secAtZ(z + 0.21), C_SEAT + 0.07) - 0.05, 0.34, 0.05, 0, C_SEAT + 0.07, z + 0.21, 0xb58a5a);
  }
  b.box(0.6, C_HELM - C_SOLE, 0.45, 0.3, C_SOLE, 2.95, 0xb58a5a);
  // the outboard on the transom, the tiller forward to the helm's right hand
  b.box(0.3, 0.25, 0.12, 0, T.ys - 0.15, T.z + 0.06, 0x1d1f22);
  b.box(0.46, 0.55, 0.62, 0, T.ys + 0.12, T.z + 0.32, MOTOR);
  b.box(0.42, 0.06, 0.56, 0, T.ys + 0.67, T.z + 0.32, 0xc9cdd2);
  b.box(0.14, 1.3, 0.22, 0, -0.45, T.z + 0.42, MOTOR);
  b.box(0.06, 0.06, 0.75, 0.15, 0.95, 3.66, 0x1d1f22, -0.27);
  // a life ring on each side, hung on the gunwale aft (orange and white quarters)
  const ringAt = (x: number, y: number, z: number) => {
    for (let q = 0; q < 4; q++) { const g = new THREE.TorusGeometry(0.26, 0.055, 4, 3, Math.PI / 2); g.rotateZ(q * Math.PI / 2); g.rotateY(Math.PI / 2); b.geometry(g, q % 2 ? 0xf6f4ee : 0xf26a1b, x, y, z); }
  };
  for (const s of [-1, 1]) ringAt(s * (secAtZ(2.25).hw + 0.05), 0.5, 2.25);
  // Senegal's flag on a staff at the port quarter, flying aft
  b.box(0.035, 1.2, 0.035, -0.95, T.ys, T.z - 0.08, 0xc8ccd0);
  [0x1f8a4c, 0xf2c318, 0xd23a2b].forEach((c, i) => b.box(0.015, 0.3, 0.15, -0.95, T.ys + 0.86, T.z - 0.08 + 0.09 + i * 0.15, c));
  if (!lite) {
    // the canopy over the benches (not on Low): four posts on the gunwales and a trapezoid of blue canvas, narrower forward as the hull is, its
    // valance trimmed yellow; white fenders on the west side
    const both = (rows: V3[][], c: number) => { b.geometry(grid(rows, false), c, 0, 0, 0); b.geometry(grid(rows, true), c, 0, 0, 0); };
    const TOP = 2.1, ends = [-1.75, 1.3].map(z => ({ z, s: secAtZ(z) })).map(({ z, s }) => ({ z, x: s.hw - 0.045, y: s.ys }));
    for (const e of ends) for (const sx of [-1, 1]) b.box(0.05, TOP - e.y, 0.05, sx * e.x, e.y, e.z, 0xc8ccd0);
    const [f, r] = ends;
    both([[[-f.x - 0.06, TOP, f.z - 0.1], [f.x + 0.06, TOP, f.z - 0.1]], [[-r.x - 0.06, TOP, r.z + 0.1], [r.x + 0.06, TOP, r.z + 0.1]]], BAND);
    for (const sx of [-1, 1]) both([[[sx * (f.x + 0.06), TOP - 0.17, f.z - 0.1], [sx * (f.x + 0.06), TOP, f.z - 0.1]], [[sx * (r.x + 0.06), TOP - 0.17, r.z + 0.1], [sx * (r.x + 0.06), TOP, r.z + 0.1]]], LINE);
    for (const z of [-0.6, 1.0]) b.blob(0.11, -(secAtZ(z).hw + 0.08), 0.42, z, 0xf2f2ee, 2.2, 0);
  }
  const seats = benches.flatMap((z, k) => [-1, 1].map((s, j) => ({ id: `c${k * 2 + j}`, x: s * 0.55, y: C_SEAT, z, yaw: SEAT_YAW })));
  // the step: the west gunwale just aft of the foredeck, forward of the first bench (the stem itself is run up over the sand)
  const step = { x: -secAtZ(-2.2).hw, z: -2.2 };
  return { helm: { id: 'helm', x: 0.3, y: C_HELM, z: 2.95, yaw: SEAT_YAW }, seats, beam: 2 * C_HALF, step };
}

/**
 * A boat of the traversée: the pirogue (length 10, six on three thwarts) or the chaloupe (length 8, beam 2.6, four on two benches, a canopy except on
 * Low). One merged mesh in `material` plus the wake: two draw calls (the hull casts a shadow: one more in the shadow pass).
 */
export function buildBoat(kind: BoatKind, material: THREE.Material, lite = false): BoatModel {
  const b = new Batch(), group = new THREE.Group(); group.name = `boat:${kind}`;
  const length = kind === 'pirogue' ? 10 : C_LEN;
  const { helm, seats, beam, step } = kind === 'pirogue' ? buildPirogue(b, lite) : buildChaloupe(b, lite);
  const hull = b.build(material, true, true)!; hull.name = 'hull'; group.add(hull);
  const wake = wakeMesh(beam, length / 2); group.add(wake.mesh);
  const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return {
    kind, group, wake: wake.mesh, length, beam, helm, seats, step,
    cost: { draws: 2, tris: Math.round(tris(hull.geometry) + tris(wake.geo)) },
    dispose() { hull.geometry.dispose(); wake.geo.dispose(); wake.mat.dispose(); group.removeFromParent(); },
  };
}
