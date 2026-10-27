import * as THREE from 'three';

/**
 * LD2.0-D (docs/ld2/LD2_D.md): the light helicopter parked on the villa's roof, seen from the street and on the roof terrace. Round 2 (the owner's
 * review, 27 Oct: « the helicopter need more realism right now it look like a toy »): rebuilt with the proportions of a real modern light
 * single-engine helicopter of the five-seat class. Our own design: no maker's model, logo or brand.
 *  - The cabin: one smooth loft of rounded sections from the nose to the tail boom's root, a blunt rounded nose. Its glazing is the loft's own faces,
 *    so the glass fits the body exactly: a wraparound windscreen over a black centre post, two chin windows under the instrument panel's line, two
 *    roof windows over the front seats, the windows of the front and rear doors between black pillars. Through the tinted glass: the seats in cognac
 *    leather, the instrument panel under its glare shield, the rear bulkhead.
 *  - The engine fairing behind the rotor mast, its air intakes and louvres, its exhaust stack; a tapered tail boom, a horizontal stabiliser with end
 *    plates, a swept fin (and its ventral fin with a guard skid), an open two-blade tail rotor on the left of the fin.
 *  - A three-blade main rotor, 9.4 m across: its mast, swashplate, pitch links, hub and blade grips; satin blades with a swept tip and a white band,
 *    drooping a little at rest, parked with one blade over the tail boom (as a parked rotor is tied down) and the others at ±120°.
 *  - Skids on two arched cross tubes, a boarding step at each door; the doors' seams and chrome handles, the antennas, a pitot tube, the navigation
 *    lights (red on the left, green on the right, on the stabiliser's end plates), a white tail light, the red anti-collision beacons, a landing light.
 *  - Livery: pearl white over a deep graphite-blue lower body that sweeps up into the tail, a thin gold line between them, black window surrounds;
 *    the registration « 6V-ALM » (6V: Senegal) on the rear fuselage's two sides, the flag of Senegal on the fin.
 *
 * Built for a phone: four meshes (four draw calls) by material, each one merged geometry with vertex colours; about 9 000 triangles. Materials that
 * catch the light: a clear-coated metallic paint, glossy tinted glass, polished metal, satin blades and trim, reflecting a tiny procedural sky (an
 * equirectangular gradient made here, turned into the renderer's prefiltered map once and shared by every helicopter). The reflections follow the
 * scene's sky light as it is drawn (its hemisphere light: dim at night, by the moon), and add no light of their own to the diffuse (the scene's own
 * lights do that), so the helicopter sits in the street's and the roof terrace's lighting by day and at night. Self-contained: nothing of the scene is
 * read while it is built (the villa kit exports it as it is: src/world/helicopter.ts → GLB).
 *
 * Nothing is animated (it is parked: no flight in this slice). Local frame: the origin on the ground under the middle of its skids (the rotor mast
 * above it), the nose toward +z, its left side toward +x. `footprint` is measured on the geometry (w along x, d along z, h up), `extent` gives its box
 * in that frame. On the villa's roof it stands on the pad turned by HELIPAD.yaw (src/housing/villa.ts).
 */
export interface HelicopterBuild {
  group: THREE.Group;
  footprint: { w: number; d: number; h: number };
  /** Its box in the local frame (m). */
  extent: { x0: number; x1: number; z0: number; z1: number; y1: number };
  /** Draw calls and triangles (the budget: ≤ 4 and ≤ 12 000). */
  cost: { draws: number; tris: number };
}

export const ROTOR_DIAMETER = 9.4;
export const BLADES = 3;
/** Blade 0 of the main rotor is parked this far (rad) from straight aft over the tail boom, toward the left; the others follow at 120°. */
export const BLADE_PARK = 0;
/** The skids (m): their tubes' middle lines at ±x, from z0 to the toes' turn (z1); the tubes' radius. What stands on the pad. */
export const SKIDS = { x: 1.1, z0: -1.42, z1: 1.82, r: 0.042 } as const;
/** Nose to tail (m), the fuselage alone. */
export const LENGTH = 8.46;

// the livery and the trims (sRGB)
const PEARL = 0xf1efe9, NIGHT = 0x1b2434, GOLD = 0xc9a24e, BLACK = 0x0c0d10, SEAM = 0x3a3e46, TINT = 0x1d2a33;
const ALU = 0xc9ccd1, STEEL = 0x8e949b, GUN = 0x3b3f45, HOT = 0x6d6157, CHROME = 0xe3e5e8;
const BLADE = 0x33373d, LEATHER = 0x7a5034, TRIM = 0x26282c, RUBBER = 0x141518;
const RED = 0xc4231d, GREEN = 0x1f9c46, CLEAR = 0xe6ecef, SN_GREEN = 0x00853f, SN_YELLOW = 0xfdef42, SN_RED = 0xe31b23;

// ------------------------------------------------------------------------------------------------ building blocks
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A triangle soup (non-indexed) with per-vertex normals and a colour per face: one per material, one draw call each. */
class Soup {
  pos: number[] = []; nor: number[] = []; col: number[] = [];
  private c = new THREE.Color();
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3, color: number) {
    this.c.setHex(color);
    for (const [p, n] of [[a, na], [b, nb], [c, nc]] as const) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  /** A quad a → b → c → d, wound so it faces along its normals (whichever way it was given). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3, nd: THREE.Vector3, color: number) {
    const f = _t1.subVectors(c, a).cross(_t2.subVectors(d, b)), n = _t3.copy(na).add(nb).add(nc).add(nd);
    if (f.dot(n) >= 0) { this.tri(a, b, c, na, nb, nc, color); this.tri(a, c, d, na, nc, nd, color); }
    else { this.tri(a, c, b, na, nc, nb, color); this.tri(a, d, c, na, nd, nc, color); }
  }
  /** A triangle wound to face along `n` (one normal for its three corners). */
  face(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, color: number) {
    if (_t1.subVectors(b, a).cross(_t2.subVectors(c, a)).dot(n) >= 0) this.tri(a, b, c, n, n, n, color); else this.tri(a, c, b, n, n, n, color);
  }
  /** A three.js primitive moved into place, in one colour. */
  add(g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4) {
    if (m) g.applyMatrix4(m);
    const s = g.index ? g.toNonIndexed() : g;
    if (!s.attributes.normal) s.computeVertexNormals();
    const p = s.attributes.position, n = s.attributes.normal;
    this.c.setHex(color);
    for (let i = 0; i < p.count; i++) { this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.nor.push(n.getX(i), n.getY(i), n.getZ(i)); this.col.push(this.c.r, this.c.g, this.c.b); }
    if (s !== g) s.dispose();
    g.dispose();
  }
  get tris() { return this.pos.length / 9; }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
const _t1 = V(), _t2 = V(), _t3 = V();

/**
 * A surface sampled on a grid P[i][k] (rows along i, `closed` round k): smooth normals from the grid itself (central differences, pointing away
 * from each row's middle, or as `outward` says), each quad given its soup and colour by `paint` (null: left out).
 */
function grid(P: THREE.Vector3[][], closed: boolean, paint: (i: number, k: number) => [Soup, number] | null, outward?: (p: THREE.Vector3, i: number) => THREE.Vector3) {
  const I = P.length, K = P[0].length, N: THREE.Vector3[][] = [];
  for (let i = 0; i < I; i++) {
    const row: THREE.Vector3[] = [], mid = V(); for (const p of P[i]) mid.add(p); mid.multiplyScalar(1 / K);
    for (let k = 0; k < K; k++) {
      const ka = closed ? (k - 1 + K) % K : Math.max(0, k - 1), kb = closed ? (k + 1) % K : Math.min(K - 1, k + 1);
      const tk = V().subVectors(P[i][kb], P[i][ka]), ti = V().subVectors(P[Math.min(I - 1, i + 1)][k], P[Math.max(0, i - 1)][k]);
      const n = V().crossVectors(tk, ti);
      if (n.lengthSq() < 1e-12) n.copy(outward ? outward(P[i][k], i) : V().subVectors(P[i][k], mid));
      if (n.lengthSq() < 1e-12) n.copy(ti).multiplyScalar(i === 0 ? -1 : 1);       // a row shrunk to a point (a tip): along the rows, outward
      const o = outward ? outward(P[i][k], i) : V().subVectors(P[i][k], mid);
      if (n.dot(o) < 0) n.negate();
      row.push(n.normalize());
    }
    N.push(row);
  }
  for (let i = 0; i < I - 1; i++) for (let k = 0; k < (closed ? K : K - 1); k++) {
    const k2 = (k + 1) % K, w = paint(i, k); if (!w) continue;
    w[0].quad(P[i][k], P[i][k2], P[i + 1][k2], P[i + 1][k], N[i][k], N[i][k2], N[i + 1][k2], N[i + 1][k], w[1]);
  }
}

/** A smooth curve through (t, v) keys (monotone cubic: no overshoot between them), held flat past its ends. */
function pchip(keys: readonly (readonly [number, number])[]): (t: number) => number {
  const k = [...keys].sort((a, b) => a[0] - b[0]), n = k.length, h: number[] = [], d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { h.push(k[i + 1][0] - k[i][0]); d.push((k[i + 1][1] - k[i][1]) / h[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return t => {
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0; while (t > k[i + 1][0]) i++;
    const s = (t - k[i][0]) / h[i], s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k[i][1] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * k[i + 1][1] + (s3 - s2) * h[i] * m[i + 1];
  };
}

/** A matrix: at (x, y, z), turned by Euler angles (order YXZ), scaled. */
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(sx, sy, sz));
/** A matrix putting a primitive's +y axis along A → B (its middle between them). */
function along(A: THREE.Vector3, B: THREE.Vector3, sx = 1, sz = 1) {
  const d = V().subVectors(B, A), len = d.length();
  return new THREE.Matrix4().compose(V().addVectors(A, B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(sx, len, sz));
}
/** A tube along a smooth path through `pts`, closed at both ends by small domes; with `floor`, lifted so the curve's sag never takes it below it. */
function tubeAlong(s: Soup, pts: THREE.Vector3[], r: number, color: number, seg: number, radial = 8, floor?: number) {
  let c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  if (floor !== undefined) {
    const low = Math.min(...c.getPoints(200).map(p => p.y)) - r;
    if (low < floor) { pts = pts.map(p => p.clone().setY(p.y + floor - low)); c = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); }
  }
  s.add(new THREE.TubeGeometry(c, seg, r, radial, false), color);
  for (const [p, t] of [[pts[0], c.getTangent(0).negate()], [pts[pts.length - 1], c.getTangent(1)]] as const) {
    const cap = new THREE.SphereGeometry(r, radial, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    s.add(cap, color, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), t), V(1, 1, 1)));
  }
}

// ------------------------------------------------------------------------------------------------ the fuselage: profiles and sections
/**
 * The cabin's shape, as curves of z (m, the nose at +2.46, the tail boom's root at −2.32): its half width, the heights of its top and bottom lines
 * (side view) and of its widest line. A section is a super-ellipse between them: rounder on top (shoulders), squarer underneath (the floor).
 */
const HW = pchip([[2.46, 0], [2.452, 0.12], [2.435, 0.21], [2.4, 0.33], [2.33, 0.46], [2.2, 0.57], [2.0, 0.66], [1.7, 0.725], [1.3, 0.765], [0.8, 0.78], [0.3, 0.78], [-0.2, 0.77], [-0.6, 0.73], [-0.95, 0.645], [-1.3, 0.52], [-1.65, 0.39], [-2.0, 0.275], [-2.32, 0.185]]);
const YT = pchip([[2.46, 1.07], [2.452, 1.15], [2.435, 1.22], [2.4, 1.33], [2.33, 1.48], [2.22, 1.62], [2.06, 1.76], [1.85, 1.88], [1.6, 1.97], [1.3, 2.035], [0.9, 2.075], [0.4, 2.09], [-0.1, 2.09], [-0.6, 2.06], [-1.0, 2.0], [-1.35, 1.92], [-1.7, 1.825], [-2.0, 1.725], [-2.32, 1.63]]);
const YB = pchip([[2.46, 1.07], [2.452, 0.99], [2.435, 0.94], [2.4, 0.86], [2.33, 0.775], [2.2, 0.69], [2.0, 0.625], [1.7, 0.585], [1.3, 0.565], [0.5, 0.555], [-0.3, 0.558], [-0.75, 0.59], [-1.1, 0.68], [-1.45, 0.86], [-1.8, 1.06], [-2.1, 1.2], [-2.32, 1.26]]);
const YM = pchip([[2.46, 1.07], [2.2, 1.1], [1.5, 1.19], [0.5, 1.24], [-0.5, 1.27], [-1.2, 1.32], [-1.8, 1.4], [-2.32, 1.445]]);
const eTop = (z: number) => lerp(lerp(2.0, 2.55, smooth(-2.3, -1.3, z)), 2.25, smooth(1.9, 2.45, z));
const eBot = (z: number) => lerp(lerp(2.0, 3.3, smooth(-2.3, -1.0, z)), 2.4, smooth(1.8, 2.45, z));
/** The livery's line: the dark lower body under it, low under the chin windows, sweeping up into the tail boom's middle. */
const YG = pchip([[2.44, 0.97], [2.38, 0.905], [2.27, 0.83], [2.1, 0.77], [1.85, 0.735], [1.5, 0.72], [1.0, 0.75], [0.4, 0.83], [-0.2, 0.93], [-0.7, 1.04], [-1.1, 1.14], [-1.5, 1.25], [-1.9, 1.36], [-2.32, 1.445]]);
/** The windscreen's lower edge (the instrument panel's line), and the chin windows' lower edge. */
const YP = pchip([[1.38, 1.2], [1.8, 1.175], [2.1, 1.145], [2.32, 1.11], [2.42, 1.085]]);
const YC = pchip([[1.5, 0.775], [1.9, 0.79], [2.27, 0.875], [2.38, 0.95]]);
/** The windows' sill: the windscreen's (YP), the front door's, the rear door's, then (no window) above the livery's line. */
const yW = (z: number) => z > 1.35 ? YP(z) : z > 0.44 ? 1.13 : z > -0.58 ? 1.17 : Math.max(1.17, YG(z) + 0.12);

/** The point of the section at z, at angle a round it (0: the top, π/2: the left side (+x), π: the bottom, 3π/2: the right side). */
function sect(z: number, a: number, out = V()) {
  const hw = HW(z), yt = YT(z), yb = YB(z), ym = YM(z), s = Math.sin(a), c = Math.cos(a), up = c >= 0, e = up ? eTop(z) : eBot(z);
  const px = Math.sign(s) * Math.abs(s) ** (2 / e), py = Math.abs(c) ** (2 / e);
  return out.set(hw * px, up ? ym + (yt - ym) * py : ym - (ym - yb) * py, z);
}
/** The angle on the left side at height y (above or below the widest line). */
function angY(z: number, y: number) {
  const ym = YM(z);
  if (y >= ym) return Math.acos(clamp((y - ym) / Math.max(1e-6, YT(z) - ym), 0, 1) ** (eTop(z) / 2));
  return Math.PI - Math.acos(clamp((ym - y) / Math.max(1e-6, ym - YB(z)), 0, 1) ** (eBot(z) / 2));
}
/** The angle on the top (or the bottom) at a fraction f of the half width. */
const angTop = (z: number, f: number) => Math.asin(f ** (eTop(z) / 2));
const angBot = (z: number, f: number) => Math.PI - Math.asin(f ** (eBot(z) / 2));
/** A point on the left (+1) or right (−1) side at (z, y), pushed out along the surface's normal by `lift`; its normal and its forward tangent. */
function onSide(z: number, y: number, side: 1 | -1, lift = 0.003) {
  const a = angY(z, y), p = sect(z, a), d = 2e-3;
  const tz = V().subVectors(sect(z - d, a), sect(z + d, a)).negate(), ta = V().subVectors(sect(z, a + d), sect(z, a - d));
  const n = V().crossVectors(ta, tz).normalize(); if (n.x < 0) n.negate();
  p.addScaledVector(n, lift);
  if (side < 0) { p.x = -p.x; n.x = -n.x; tz.x = -tz.x; }
  return { p, n, t: tz.normalize() };
}

/**
 * The knots round a section (the left half, top to bottom), so the edges of the glazing and of the livery fall on the loft's own lines:
 *  0 the top · 1 the roof's middle strip · 2 the roof windows' inner edge · 3 their outer edge · 4 the side windows' top · 5 their sill (the windscreen's
 *  lower edge) · 6 the black frame's foot under it · 7 the chin windows' lower edge · 8 the livery's line · 9 the keel strip · 10 the bottom.
 * Each band between two knots gets EXTRA more lines (its curvature).
 */
const EXTRA = [0, 0, 2, 1, 2, 0, 1, 1, 3, 0];
function knots(z: number): number[] {
  const w = yW(z);
  const A = [0, angTop(z, 0.04), angTop(z, 0.17), angTop(z, 0.57), Math.acos(0.72 ** (eTop(z) / 2)), angY(z, w), angY(z, w - 0.05),
    angY(z, z > 1.45 ? YC(z) : (w - 0.05 + YG(z)) / 2), angY(z, YG(z)), angBot(z, 0.12), Math.PI];
  for (let k = 1; k < A.length; k++) A[k] = Math.max(A[k], A[k - 1] + 1e-4);
  for (let k = A.length - 2; k > 0; k--) A[k] = Math.min(A[k], A[k + 1] - 1e-4);
  return A;
}
/** The loft's stations along z, dense at the rounded nose, on every edge of the glazing (the pillars, the windows' ends). */
const STATIONS = [2.46, 2.452, 2.44, 2.42, 2.38, 2.33, 2.27, 2.2, 2.12, 2.03, 1.93, 1.82, 1.71, 1.6, 1.5, 1.43, 1.38, 1.32, 1.24, 1.1, 0.95, 0.8, 0.62,
  0.5, 0.38, 0.24, 0.08, -0.08, -0.24, -0.4, -0.55, -0.6, -0.78, -1.0, -1.22, -1.44, -1.66, -1.88, -2.1, -2.32];

function fuselage(paint: Soup, glass: Soup) {
  const bandOf: number[] = [], P: THREE.Vector3[][] = [];
  for (const z of STATIONS) {
    const A = knots(z), half: number[] = [];
    for (let b = 0; b < 10; b++) for (let j = 0; j <= EXTRA[b]; j++) { half.push(A[b] + (A[b + 1] - A[b]) * j / (EXTRA[b] + 1)); if (P.length === 0) bandOf.push(b); }
    half.push(Math.PI);
    // the ring: down the left side, then up the right one (mirrored)
    const ring = [...half, ...half.slice(1, -1).reverse().map(a => 2 * Math.PI - a)];
    P.push(ring.map(a => sect(z, a)));
  }
  const S = bandOf.length;                                                          // segments per half
  const band = (k: number) => k < S ? bandOf[k] : bandOf[2 * S - 1 - k];
  grid(P, true, (i, k) => {
    const z = (STATIONS[i] + STATIONS[i + 1]) / 2, b = band(k);
    const ws = z > 1.38 && z < 2.42, chin = z > 1.5 && z < 2.38, sky = z > 0.62 && z < 1.24, fw = z > 0.5 && z < 1.32, rw = z > -0.55 && z < 0.38;
    const pillar = (z > 1.32 && z < 1.38) || (z > 0.38 && z < 0.5) || (z > -0.6 && z < -0.55);
    if (ws && b >= 1 && b <= 4) return [glass, TINT];                               // the windscreen, round its black centre post
    if (ws && b === 0) return [paint, BLACK];
    if (sky && b === 2) return [glass, TINT];                                       // the roof windows over the front seats
    if (b === 4 && (fw || rw)) return [glass, TINT];                                // the doors' windows
    if (b === 4 && pillar) return [paint, BLACK];
    if (b === 5 && (ws || fw || rw || pillar)) return [paint, BLACK];               // the panel's line, the windows' black sills
    if (b === 6 && chin) return [glass, TINT];                                      // the chin windows
    if (b === 6 && z > 1.38 && z < 2.42) return [paint, BLACK];
    if (z > 2.42) return [paint, b >= 8 ? NIGHT : BLACK];                         // the nose's tip, black round the glazing
    return [paint, b >= 8 ? NIGHT : PEARL];
  }, (p, i) => V(p.x, p.y - YM(STATIONS[i]), 0).add(V(0, 0, STATIONS[i] > 2.3 ? (STATIONS[i] - 2.3) * 8 : 0)));
}

/** A strip painted on the cabin's side (a seam, the gold line): along a list of (z, y) points, `w` wide, on one side. */
function stripe(s: Soup, pts: [number, number][], w: number, color: number, side: 1 | -1, lift = 0.0025) {
  const L: THREE.Vector3[] = [], R: THREE.Vector3[] = [], NL: THREE.Vector3[] = [], NR: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [z, y] = pts[i], [z2, y2] = pts[Math.min(pts.length - 1, i + 1)], [z1, y1] = pts[Math.max(0, i - 1)];
    // across the strip: perpendicular to its run in the (z, y) plane
    const dz = z2 - z1, dy = y2 - y1, l = Math.hypot(dz, dy) || 1, oz = -dy / l * w / 2, oy = dz / l * w / 2;
    const a = onSide(z + oz, y + oy, side, lift), b = onSide(z - oz, y - oy, side, lift);
    L.push(a.p); R.push(b.p); NL.push(a.n); NR.push(b.n);
  }
  for (let i = 0; i < pts.length - 1; i++) s.quad(L[i], L[i + 1], R[i + 1], R[i], NL[i], NL[i + 1], NR[i + 1], NR[i], color);
}
const run = (z0: number, z1: number, y: (z: number) => number, n: number): [number, number][] => Array.from({ length: n + 1 }, (_, i) => { const z = lerp(z0, z1, i / n); return [z, y(z)]; });

/** A tiny stroke font for the registration (glyph box 0.6 × 1, y up). */
const GLYPHS: Record<string, [number, number][][]> = {
  '6': [[[0.55, 0.88], [0.42, 0.98], [0.26, 1.0], [0.12, 0.9], [0.04, 0.68], [0.03, 0.4], [0.07, 0.16], [0.18, 0.02], [0.34, 0.0], [0.5, 0.07], [0.58, 0.24], [0.55, 0.42], [0.43, 0.55], [0.27, 0.58], [0.13, 0.5], [0.04, 0.36]]],
  V: [[[0.0, 1.0], [0.3, 0.0], [0.6, 1.0]]],
  '-': [[[0.1, 0.48], [0.46, 0.48]]],
  A: [[[0.0, 0.0], [0.3, 1.0], [0.6, 0.0]], [[0.12, 0.36], [0.48, 0.36]]],
  L: [[[0.04, 1.0], [0.04, 0.0], [0.56, 0.0]]],
  M: [[[0.0, 0.0], [0.0, 1.0], [0.3, 0.42], [0.6, 1.0], [0.6, 0.0]]],
};
export const REGISTRATION = '6V-ALM';
/** The registration painted on one side: letters `h` tall from z0 toward the tail, read left to right from that side. */
function registration(s: Soup, side: 1 | -1, z0: number, y0: number, h: number) {
  const adv = 0.78 * h, len = REGISTRATION.length * adv - 0.18 * h, sw = 0.12 * h;
  [...REGISTRATION].forEach((ch, i) => {
    for (const stroke of GLYPHS[ch]) {
      // on the left side the text runs toward the tail (−z); on the right side it runs toward the nose, starting at the tail's end
      const pts = stroke.map(([u, v]): [number, number] => { const along = i * adv + u * h; return [side > 0 ? z0 - along : z0 - len + along, y0 + v * h]; });
      // each segment its own strip (sharp corners), a little longer to close the joints
      for (let j = 0; j < pts.length - 1; j++) {
        const [a, b] = [pts[j], pts[j + 1]], d = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = sw * 0.45 / d;
        stripe(s, [[a[0] - (b[0] - a[0]) * ex, a[1] - (b[1] - a[1]) * ex], [b[0] + (b[0] - a[0]) * ex, b[1] + (b[1] - a[1]) * ex]], sw, NIGHT, side, 0.006);
      }
    }
  });
}

// ------------------------------------------------------------------------------------------------ the engine fairing, the tail
/** The fairing over the mast and the engine, on the cabin's roof: its half width and its top along z (its sides go down into the roof). */
const CW = pchip([[0.62, 0.02], [0.52, 0.24], [0.36, 0.38], [0.15, 0.45], [-0.1, 0.47], [-0.6, 0.46], [-1.1, 0.42], [-1.5, 0.34], [-1.8, 0.25], [-2.05, 0.14], [-2.2, 0.025]]);
const CT = pchip([[0.62, 2.085], [0.52, 2.2], [0.36, 2.32], [0.15, 2.41], [-0.1, 2.44], [-0.6, 2.43], [-1.1, 2.39], [-1.5, 2.31], [-1.8, 2.19], [-2.05, 1.96], [-2.2, 1.7]]);
/** The roof's height at (z, x) (the loft's top half). */
const roofAt = (z: number, x: number) => sect(z, angTop(z, clamp(Math.abs(x) / HW(z), 0, 1))).y;
function cowlPoint(z: number, a: number) {
  // a ∈ [−π/2, π/2]: a super-ellipse's top half from the fairing's right foot to its left one, its feet a little inside the roof
  const w = CW(z), top = CT(z), base = roofAt(z, w) - 0.05, s = Math.sin(a), c = Math.cos(a), e = 2.4;
  return V(w * Math.sign(s) * Math.abs(s) ** (2 / e), base + (top - base) * Math.abs(c) ** (2 / e), z);
}
function cowling(paint: Soup) {
  const Z = [0.62, 0.58, 0.52, 0.45, 0.36, 0.26, 0.15, 0.02, -0.1, -0.35, -0.6, -0.85, -1.1, -1.3, -1.5, -1.65, -1.8, -1.95, -2.05, -2.14, -2.2];
  const A = Array.from({ length: 15 }, (_, k) => -Math.PI / 2 + Math.PI * k / 14);
  grid(Z.map(z => A.map(a => cowlPoint(z, a))), false, () => [paint, PEARL], (p, i) => V(p.x, p.y - (CT(Z[i]) - 0.3), 0));
}
/** A point on the fairing's left (+1) or right side at (z, height fraction f of its arc from the top), its normal. */
function onCowl(z: number, f: number, side: 1 | -1, lift = 0.003) {
  const a = side * f * Math.PI / 2, d = 2e-3, p = cowlPoint(z, a);
  const ta = V().subVectors(cowlPoint(z, a + d), cowlPoint(z, a - d)), tz = V().subVectors(cowlPoint(z + d, a), cowlPoint(z - d, a));
  const n = V().crossVectors(tz, ta).normalize(); if (n.dot(V(p.x, p.y - (CT(z) - 0.3), 0)) < 0) n.negate();
  return { p: p.addScaledVector(n, lift), n };
}
/** A patch on the fairing's side between z0…z1 and the arc fractions f0…f1 (an intake's grille, a louvre). */
function cowlPatch(s: Soup, side: 1 | -1, z0: number, z1: number, f0: number, f1: number, color: number, lift = 0.003, nz = 3) {
  const P: THREE.Vector3[][] = [], N: THREE.Vector3[][] = [];
  for (let i = 0; i <= nz; i++) { const row = [0, 1].map(j => onCowl(lerp(z0, z1, i / nz), lerp(f0, f1, j), side, lift)); P.push(row.map(r => r.p)); N.push(row.map(r => r.n)); }
  for (let i = 0; i < nz; i++) s.quad(P[i][0], P[i + 1][0], P[i + 1][1], P[i][1], N[i][0], N[i + 1][0], N[i + 1][1], N[i][1], color);
}

/** The tail boom: its centre's height and radius along z, from inside the cabin's tapering end to the tail cone's tip. */
const BOOM_Z = [-2.15, -2.6, -3.2, -3.8, -4.4, -4.9, -5.35, -5.7, -5.88, -5.97, -6.0];
const BY = pchip([[-2.15, 1.445], [-3.5, 1.5], [-5.4, 1.56], [-6.0, 1.585]]);
const BR = pchip([[-2.15, 0.19], [-2.6, 0.175], [-3.8, 0.145], [-5.0, 0.115], [-5.6, 0.1], [-5.85, 0.08], [-5.95, 0.05], [-6.0, 0.0]]);
function boom(paint: Soup) {
  const K = 16, P = BOOM_Z.map(z => Array.from({ length: K }, (_, k) => { const a = (k / K) * Math.PI * 2; return V(Math.sin(a) * BR(z), BY(z) + Math.cos(a) * BR(z), z); }));
  // white above its middle line, the dark of the lower body under it
  grid(P, true, (_, k) => [paint, (k + 0.5) / K > 0.25 && (k + 0.5) / K < 0.75 ? NIGHT : PEARL], (p, i) => V(p.x, p.y - BY(BOOM_Z[i]), 0));
}

/** A flat profile (in the z–y plane) extruded `t` thick across x with rounded edges, its middle at x. */
function fin(s: Soup, pts: [number, number][], t: number, x: number, color: number, bevel = 0.012) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -t / 2);
  s.add(g, color, at(x, 0, 0, 0, Math.PI / 2));
}
/** An airfoil section (chord along +u from the leading edge, half-thickness along v): the points round it. */
const FOIL = [[0, 0], [0.025, 0.55], [0.1, 0.9], [0.3, 1.0], [0.6, 0.72], [1.0, 0.06], [0.6, -0.72], [0.3, -1.0], [0.1, -0.9], [0.025, -0.55]] as const;
/** A blade (or a stabiliser) lofted through airfoil sections: at each station its point on the span axis, its chord vector (leading edge → trailing
 *  edge), its thickness direction and thickness, and a colour for the strip that starts there. */
function wing(s: Soup, st: { o: THREE.Vector3; chord: THREE.Vector3; up: THREE.Vector3; t: number; color: number }[]) {
  const P = st.map(q => FOIL.map(([u, v]) => q.o.clone().addScaledVector(q.chord, u - 0.25).addScaledVector(q.up, v * q.t / 2)));
  grid(P, true, i => [s, st[i].color], (p, i) => V().subVectors(p, st[i].o.clone().addScaledVector(st[i].chord, 0.2)));
  // the ends closed
  for (const i of [0, st.length - 1]) {
    const c = st[i].o.clone().addScaledVector(st[i].chord, 0.1), n = V().subVectors(st[i].o, st[i === 0 ? 1 : i - 1].o).normalize();
    for (let k = 0; k < FOIL.length; k++) {
      const a = P[i][k], b = P[i][(k + 1) % FOIL.length];
      s.face(c, a, b, n, st[i].color);
    }
  }
}

// ------------------------------------------------------------------------------------------------ the materials (shared by every helicopter)
let shared: { paint: THREE.MeshPhysicalMaterial; glass: THREE.MeshPhysicalMaterial; metal: THREE.MeshStandardMaterial; satin: THREE.MeshStandardMaterial; base: Map<THREE.Material, number> } | null = null;
/**
 * The sky the paint and the glass reflect: a small equirectangular gradient (a blue zenith, a bright hazy horizon, a low line of pale buildings,
 * the warm ground), made here once; the renderer turns it into its prefiltered map the first time a helicopter is drawn.
 */
function skyMap(): THREE.DataTexture {
  const W = 128, H = 64, data = new Uint8Array(W * H * 4), c = new THREE.Color(), zen = new THREE.Color(0x5d8fcb), hor = new THREE.Color(0xe8eef3),
    gro = new THREE.Color(0x9a8d7c), nad = new THREE.Color(0x4a4239), bld = new THREE.Color(0xc4bcb0);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tops = Array.from({ length: 32 }, () => 0.02 + rnd() * 0.09);
  for (let j = 0; j < H; j++) {
    const lat = ((j + 0.5) / H - 0.5) * Math.PI;                                   // row 0: straight down
    for (let i = 0; i < W; i++) {
      if (lat >= 0) {
        c.copy(hor).lerp(zen, (lat / (Math.PI / 2)) ** 0.55);
        if (lat < tops[Math.floor(i / 4)]) c.copy(bld).multiplyScalar(0.85 + 0.15 * ((i >> 2) % 3) / 2);
      } else c.copy(gro).lerp(nad, (-lat / (Math.PI / 2)) ** 0.6);
      const o = (j * W + i) * 4;
      data[o] = Math.round(c.r * 255); data[o + 1] = Math.round(c.g * 255); data[o + 2] = Math.round(c.b * 255); data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.name = 'helicopter-sky'; t.needsUpdate = true;
  return t;
}
/** The sky map reflects; it does not light: its diffuse share is left out (the scene's hemisphere light gives that, to the helicopter as to the rest). */
const specularOnly = (sh: { fragmentShader: string }) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', ''));
};
/** The scene's sky light (its hemisphere light), found once per scene. */
const skies = new WeakMap<THREE.Object3D, THREE.HemisphereLight>();
function skyOf(scene: THREE.Object3D): THREE.HemisphereLight | null {
  let h = skies.get(scene);
  if (!h) { h = scene.children.find(o => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight | undefined; if (h) skies.set(scene, h); }
  return h ?? null;
}
/** The reflections as bright as the sky the scene is lit by (1 by day in the street; about 0.2 under the moon). */
const DAY_SKY = 0.75;
function relight(scene: THREE.Object3D) {
  if (!shared) return;
  const h = skyOf(scene), c = h?.color, k = h && c ? clamp(h.intensity * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / DAY_SKY, 0.12, 1.25) : 1;
  for (const [m, base] of shared.base) (m as THREE.MeshStandardMaterial).envMapIntensity = base * k;
}
function materials() {
  if (shared) return shared;
  const env = skyMap();
  const paint = new THREE.MeshPhysicalMaterial({ name: 'helicopter-paint', vertexColors: true, metalness: 0.35, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({ name: 'helicopter-glass', vertexColors: true, metalness: 0, roughness: 0.04, reflectivity: 0.85, envMap: env, transparent: true, opacity: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ name: 'helicopter-metal', vertexColors: true, metalness: 0.9, roughness: 0.3, envMap: env });
  const satin = new THREE.MeshStandardMaterial({ name: 'helicopter-satin', vertexColors: true, metalness: 0.15, roughness: 0.55, envMap: env });
  for (const m of [paint, glass, metal, satin]) m.onBeforeCompile = specularOnly;
  shared = { paint, glass, metal, satin, base: new Map<THREE.Material, number>([[paint, 1.0], [glass, 1.5], [metal, 1.0], [satin, 0.8]]) };
  return shared;
}

// ------------------------------------------------------------------------------------------------ the helicopter
export function buildHelicopter(): HelicopterBuild {
  const g = new THREE.Group(); g.name = 'helicopter';
  const paint = new Soup(), glass = new Soup(), metal = new Soup(), satin = new Soup();

  // ---------------------------------------------------------------- the cabin and its glazing, the fairing, the boom
  fuselage(paint, glass);
  cowling(paint);
  boom(paint);
  // the gold line along the livery's edge and on along the boom's middle, both sides
  for (const side of [1, -1] as const) {
    stripe(paint, run(2.3, -2.2, YG, 44), 0.032, GOLD, side, 0.004);
    const L: THREE.Vector3[] = [], R: THREE.Vector3[] = [];
    for (const z of [-2.2, -2.8, -3.4, -4.0, -4.6, -5.1, -5.45]) {
      const r = BR(z) + 0.0025, h = 0.016 / r;                                      // a half-width of 16 mm round the boom's flank
      L.push(V(side * r * Math.cos(h), BY(z) + r * Math.sin(h), z)); R.push(V(side * r * Math.cos(h), BY(z) - r * Math.sin(h), z));
    }
    for (let i = 0; i < L.length - 1; i++) { const n0 = V(side, 0, 0), n1 = V(side, 0, 0); paint.quad(L[i], L[i + 1], R[i + 1], R[i], n0, n1, n1, n0, GOLD); }
  }
  // the doors' seams (front door 0.44…1.36, rear door −0.6…0.41) and their chrome handles, the registration
  for (const side of [1, -1] as const) {
    for (const [z0, z1, top] of [[0.44, 1.36, 0], [-0.6, 0.41, 1]] as const) {
      for (const z of [z0, z1]) stripe(paint, Array.from({ length: 7 }, (_, i): [number, number] => [z, lerp(0.63, yW(top ? 0 : 1) - 0.05, i / 6)]), 0.01, SEAM, side);
      stripe(paint, run(z0, z1, () => 0.63, 6), 0.01, SEAM, side);                   // the doors' feet
      stripe(paint, run(z0 + 0.04, z1 - 0.04, z => sect(z, angTop(z, 0.57)).y - 0.035, 6), 0.01, SEAM, side);   // their tops, along the roof's edge
      const hz = z0 + 0.2, hy = yW(hz) - 0.12, o = onSide(hz, hy, side, 0.012), b = V().crossVectors(o.t, o.n);
      metal.add(new THREE.CapsuleGeometry(0.011, 0.11, 1, 6), CHROME, new THREE.Matrix4().makeBasis(b, o.t, o.n).setPosition(o.p));
    }
    registration(paint, side, -0.7, 1.4, 0.19);
  }
  // the engine fairing's intakes (black grilles, three metal bars), its louvres; its seams
  for (const side of [1, -1] as const) {
    cowlPatch(paint, side, -0.12, -0.52, 0.42, 0.84, BLACK, 0.003, 4);
    for (let j = 1; j <= 3; j++) cowlPatch(metal, side, -0.1, -0.54, 0.42 + j * 0.105 - 0.012, 0.42 + j * 0.105 + 0.012, STEEL, 0.008, 4);
    for (let j = 0; j < 5; j++) { const z = -1.12 - j * 0.07; cowlPatch(paint, side, z, z - 0.028, 0.5, 0.8, BLACK, 0.003, 1); }
    cowlPatch(paint, side, 0.3, -1.9, 0.86, 0.875, SEAM, 0.0025, 12);
    cowlPatch(paint, side, -0.95, -0.96, 0.25, 0.86, SEAM, 0.0025, 1);
  }
  // the exhaust stack at the fairing's back, leaning aft, its dark mouth
  {
    const A = V(0, 2.16, -1.62), B = V(0, 2.4, -1.86);
    metal.add(new THREE.CylinderGeometry(0.115, 0.13, 1, 14, 1, true), HOT, along(A, B));
    satin.add(new THREE.CircleGeometry(0.11, 14), RUBBER, new THREE.Matrix4().compose(B.clone().lerp(A, 0.04), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V().subVectors(B, A).normalize()), V(1, 1, 1)));
    metal.add(new THREE.TorusGeometry(0.122, 0.012, 4, 12), STEEL, new THREE.Matrix4().compose(B, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V().subVectors(B, A).normalize()), V(1, 1, 1)));
  }

  // ---------------------------------------------------------------- the tail: stabiliser and end plates, fins, the tail rotor, the guard skid
  {
    const sy = BY(-4.6) + 0.02;
    const st = (x: number) => ({ o: V(x, sy, -4.48), chord: V(0, -0.02, -0.42), up: V(0, 1, 0), t: 0.052, color: PEARL });
    wing(paint, [st(-1.0), st(-0.5), st(0), st(0.5), st(1.0)]);
    for (const sx of [-1, 1]) {
      fin(paint, [[-4.42, -0.14], [-4.52, 0.3], [-4.78, 0.3], [-4.84, -0.14]].map(([z, y]): [number, number] => [z, sy + y]), 0.026, sx * 1.02, NIGHT, 0.008);
      // the navigation lights on the end plates' fronts: red on the left, green on the right
      paint.add(new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), sx > 0 ? RED : GREEN, at(sx * 1.02, sy + 0.08, -4.462, Math.PI / 2));
    }
    // the fin (swept), the ventral fin under the boom
    fin(paint, [[-5.02, 1.6], [-5.56, 2.56], [-5.86, 2.58], [-5.99, 1.6]], 0.06, 0, NIGHT, 0.014);
    fin(paint, [[-5.36, 1.5], [-5.62, 1.06], [-5.88, 1.02], [-5.99, 1.5]], 0.05, 0, NIGHT, 0.012);
    // the flag of Senegal on the fin's two sides (green toward the nose on both), its green star
    for (const sx of [-1, 1]) {
      const x = sx * 0.047, fy = 2.1, fz = -5.56;
      ([[SN_GREEN, 0.1], [SN_YELLOW, 0], [SN_RED, -0.1]] as const).forEach(([c, dz]) => paint.add(new THREE.PlaneGeometry(0.1, 0.2), c, at(x, fy, fz + dz, 0, sx * Math.PI / 2)));
      const star = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, r = k % 2 ? 0.014 : 0.035; (k ? star.lineTo : star.moveTo).call(star, Math.sin(a) * r, Math.cos(a) * r); }
      paint.add(new THREE.ShapeGeometry(star), SN_GREEN, at(x + sx * 0.0025, fy, fz, 0, sx * Math.PI / 2));
    }
    // the red anti-collision beacon on the fin's top, the white tail light at the cone's tip
    paint.add(new THREE.CapsuleGeometry(0.03, 0.06, 3, 8), RED, at(0, 2.6, -5.72, Math.PI / 2));
    paint.add(new THREE.SphereGeometry(0.026, 8, 6), CLEAR, at(0, BY(-6.0), -6.0));
    // the tail rotor's gearbox on the fin's left, its hub, two blades (warning stripes at their tips), parked across
    const hub = V(0.2, 1.92, -5.5);
    metal.add(new THREE.CapsuleGeometry(0.065, 0.12, 2, 8), GUN, at(0.08, hub.y, hub.z, 0, 0, Math.PI / 2));
    metal.add(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), GUN, at(0.18, hub.y, hub.z, 0, 0, Math.PI / 2));
    for (const s of [1, -1]) {
      const d = V(0, Math.cos(0.6) * s, Math.sin(0.6) * s), chord = V(0, Math.sin(0.6), -Math.cos(0.6)).multiplyScalar(-0.115 * s);
      const sta = (r: number, color: number) => ({ o: hub.clone().add(V(0.02, 0, 0)).addScaledVector(d, r), chord, up: V(1, 0, 0), t: 0.016, color });
      wing(satin, [sta(0.07, BLADE), sta(0.5, RED), sta(0.57, CLEAR), sta(0.64, RED), sta(0.72, RED)]);
    }
    // the guard skid under the tail rotor, from the boom's belly to the ventral fin's foot
    tubeAlong(metal, [V(0, 1.45, -4.98), V(0, 1.1, -5.22), V(0, 0.86, -5.55), V(0, 0.84, -5.82), V(0, 1.0, -5.92)], 0.022, ALU, 14, 6);
    // a blade antenna on the boom's back, a whip under it
    fin(satin, [[-3.0, BY(-3.0) + BR(-3.0) - 0.02], [-3.12, BY(-3.0) + BR(-3.0) + 0.16], [-3.2, BY(-3.0) + BR(-3.0) + 0.16], [-3.24, BY(-3.0) + BR(-3.0) - 0.02]], 0.012, 0, RUBBER, 0.004);
    metal.add(new THREE.CylinderGeometry(0.004, 0.006, 0.7, 4), STEEL, along(V(0, BY(-3.6) - BR(-3.6) + 0.01, -3.6), V(0, BY(-3.6) - BR(-3.6) - 0.12, -4.28)));
  }

  // ---------------------------------------------------------------- the main rotor: mast, swashplate, pitch links, hub and grips, three blades
  {
    const R = ROTOR_DIAMETER / 2, yh = 2.93;
    metal.add(new THREE.CylinderGeometry(0.06, 0.07, 0.62, 10), STEEL, at(0, 2.42 + 0.31, 0));                       // the mast
    metal.add(new THREE.CylinderGeometry(0.2, 0.2, 0.045, 16), GUN, at(0, 2.6, 0));                                    // the swashplate's two rings
    metal.add(new THREE.CylinderGeometry(0.17, 0.18, 0.04, 16), STEEL, at(0, 2.645, 0));
    metal.add(new THREE.CylinderGeometry(0.16, 0.18, 0.13, 16), GUN, at(0, yh - 0.015, 0));                           // the hub
    metal.add(new THREE.SphereGeometry(0.13, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), GUN, at(0, yh + 0.05, 0, 0, 0, 0, 1, 0.55, 1));   // its cap
    for (let b = 0; b < BLADES; b++) {
      const yaw = Math.PI + BLADE_PARK + (b * 2 * Math.PI) / BLADES;                // the blade's direction from the mast (from +z toward +x)
      const d = V(Math.sin(yaw), 0, Math.cos(yaw)), lead = V(Math.cos(yaw), 0, -Math.sin(yaw));   // turning anticlockwise seen from above
      const droop = (r: number) => -0.2 * (r / R) ** 2;
      // the arm and the grip (the elastomeric bearing in black), the pitch horn and its link down to the swashplate
      metal.add(new THREE.BoxGeometry(0.13, 0.075, 0.3), GUN, new THREE.Matrix4().makeBasis(lead, V(0, 1, 0), d).setPosition(V(0, yh, 0).addScaledVector(d, 0.25)));
      satin.add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), RUBBER, new THREE.Matrix4().makeBasis(lead, d, V(0, 1, 0).negate()).setPosition(V(0, yh, 0).addScaledVector(d, 0.42)));
      metal.add(new THREE.BoxGeometry(0.15, 0.06, 0.34), STEEL, new THREE.Matrix4().makeBasis(lead, V(0, 1, 0), d).setPosition(V(0, yh - 0.01, 0).addScaledVector(d, 0.62)));
      const horn = V(0, yh - 0.04, 0).addScaledVector(d, 0.36).addScaledVector(lead, 0.13), foot = V(0, 2.665, 0).addScaledVector(d, 0.1).addScaledVector(lead, 0.13);
      metal.add(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), STEEL, along(foot, horn));
      metal.add(new THREE.BoxGeometry(0.03, 0.03, 0.1), GUN, new THREE.Matrix4().makeBasis(lead, V(0, 1, 0), d).setPosition(horn.clone().addScaledVector(lead, -0.05)));
      // the blade: an airfoil 0.27 m wide, 13 % thick, its tip swept back and narrowed, a white band before the tip
      const c = 0.27, sta = (r: number, color: number, chord = c, sweep = 0) => ({ o: V(0, yh + droop(r), 0).addScaledVector(d, r).addScaledVector(lead, -sweep), chord: lead.clone().multiplyScalar(-chord), up: V(0, 1, 0), t: chord * 0.13, color });
      wing(satin, [sta(0.66, BLADE, 0.2), sta(0.82, BLADE), sta(1.4, BLADE), sta(2.3, BLADE), sta(3.2, BLADE), sta(3.95, BLADE), sta(4.18, CLEAR), sta(4.42, BLADE),
        sta(4.58, BLADE, 0.22, 0.04), sta(4.66, BLADE, 0.15, 0.1), sta(R, BLADE, 0.06, 0.18)]);
    }
  }

  // ---------------------------------------------------------------- the skids, their cross tubes, the steps
  {
    const { x: sx, z0, z1, r } = SKIDS;
    for (const s of [-1, 1]) {
      const x = s * sx;
      tubeAlong(metal, [V(x, 0.07, z0), V(x, r, z0 + 0.14), V(x, r, -0.6), V(x, r, 0.6), V(x, r, 1.3), V(x, 0.08, 1.56), V(x, 0.18, z1 - 0.1), V(x, 0.33, z1 + 0.02)], r, ALU, 20, 7, 0);
      // the steps: an aluminium tread with a black anti-slip top on each cross tube, under the doors
      for (const [z, len] of [[0.78, 0.3], [-0.82, 0.26]] as const) {
        metal.add(new THREE.BoxGeometry(0.15, 0.022, len), ALU, at(s * 1.2, 0.37, z));
        satin.add(new THREE.BoxGeometry(0.13, 0.006, len - 0.03), RUBBER, at(s * 1.2, 0.384, z));
        metal.add(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), ALU, along(V(s * 1.03, 0.37, z), V(s * 1.15, 0.37, z)));
      }
    }
    for (const [z, lift] of [[0.78, 0], [-0.82, 0.04]] as const) {
      const half = [[1.1, 0.06], [1.095, 0.2], [1.06, 0.33], [0.97, 0.44], [0.82, 0.51], [0.58, 0.54], [0.3, 0.548]] as const;
      const pts = [...half.map(([x, y]) => V(-x, y + (y > 0.4 ? lift : lift * (y / 0.4)), z)), V(0, 0.55 + lift, z), ...[...half].reverse().map(([x, y]) => V(x, y + (y > 0.4 ? lift : lift * (y / 0.4)), z))];
      tubeAlong(metal, pts, 0.046, ALU, 22, 7);
    }
    // the skids' wear shoes under the cross tubes
    for (const s of [-1, 1]) for (const z of [0.78, -0.82]) metal.add(new THREE.BoxGeometry(0.06, 0.02, 0.36), STEEL, at(s * sx, 0.01, z));
  }

  // ---------------------------------------------------------------- the cabin's inside, seen through the glass: seats, the panel, the bulkhead
  {
    const seat = (x: number, z: number, w: number) => {
      satin.add(new THREE.BoxGeometry(w, 0.12, 0.46), LEATHER, at(x, 0.86, z));
      satin.add(new THREE.BoxGeometry(w, 0.62, 0.1), LEATHER, at(x, 1.2, z - 0.24, -0.18));
      satin.add(new THREE.BoxGeometry(w * 0.62, 0.17, 0.09), LEATHER, at(x, 1.6, z - 0.31, -0.18));
    };
    seat(0.34, 1.05, 0.44); seat(-0.34, 1.05, 0.44);
    for (const x of [-0.46, 0, 0.46]) seat(x, -0.12, 0.42);
    // the instrument panel under its glare shield (two screens), the centre console, the cyclic sticks
    satin.add(new THREE.BoxGeometry(1.1, 0.3, 0.2), TRIM, at(0, 1.02, 1.86, -0.25));
    satin.add(new THREE.BoxGeometry(1.18, 0.04, 0.3), RUBBER, at(0, 1.19, 1.84, 0.12));
    for (const x of [-0.27, 0.27]) satin.add(new THREE.PlaneGeometry(0.3, 0.2), 0x2c4a63, at(x, 1.05, 1.755, -0.25, Math.PI));
    satin.add(new THREE.BoxGeometry(0.2, 0.3, 0.75), TRIM, at(0, 0.78, 1.45));
    for (const x of [-0.34, 0.34]) satin.add(new THREE.CylinderGeometry(0.014, 0.018, 0.5, 6), RUBBER, at(x, 0.85, 1.5, 0.2));
    // the bulkhead behind the rear bench
    const ring = Array.from({ length: 24 }, (_, k) => sect(-0.62, (k / 24) * Math.PI * 2).multiplyScalar(1).setZ(-0.62));
    const mid = V(0, YM(-0.62), -0.62), fwd = V(0, 0, 1);
    for (let k = 0; k < 24; k++) satin.tri(mid, ring[k], ring[(k + 1) % 24], fwd, fwd, fwd, TRIM);
  }

  // ---------------------------------------------------------------- the small things outside: pitot tube, antennas, lights
  {
    const roof = sect(1.3, 0).y;
    metal.add(new THREE.CylinderGeometry(0.008, 0.008, 1, 5), STEEL, along(V(0, roof - 0.01, 1.3), V(0, roof + 0.11, 1.33)));
    metal.add(new THREE.CylinderGeometry(0.007, 0.009, 1, 5), STEEL, along(V(0, roof + 0.11, 1.33), V(0, roof + 0.115, 1.5)));
    // a satellite antenna on the fairing's nose, the red beacon and a blade antenna under the belly, the landing light in its black bezel under the nose
    satin.add(new THREE.SphereGeometry(0.06, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), RUBBER, at(0, CT(0.45) - 0.01, 0.45, 0, 0, 0, 1, 0.4, 1.3));
    paint.add(new THREE.CapsuleGeometry(0.03, 0.06, 3, 8), RED, at(0, YB(-0.3) - 0.01, -0.3, Math.PI / 2));
    fin(satin, [[0.25, YB(0.25) + 0.01], [0.12, YB(0.25) - 0.17], [0.05, YB(0.25) - 0.17], [0.0, YB(0.25) + 0.01]], 0.012, 0, RUBBER, 0.004);
    const ll = sect(2.18, Math.PI), n = V(0, -0.55, 1).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
    satin.add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 14), RUBBER, new THREE.Matrix4().compose(ll.clone().add(V(0, 0.005, 0)), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n), V(1, 1, 1)));
    paint.add(new THREE.CircleGeometry(0.06, 14), CLEAR, new THREE.Matrix4().compose(ll.clone().addScaledVector(n, 0.012).add(V(0, 0.005, 0)), q, V(1, 1, 1)));
  }

  // ---------------------------------------------------------------- the meshes
  const M = materials();
  const meshes = ([[paint, M.paint, 'helicopter-paint'], [glass, M.glass, 'helicopter-glass'], [metal, M.metal, 'helicopter-metal'], [satin, M.satin, 'helicopter-satin']] as const)
    .map(([s, mat, name]) => { const m = new THREE.Mesh(s.geometry(), mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.onBeforeRender = (_r, scene) => relight(scene); g.add(m); return m; });
  const box = new THREE.Box3();
  for (const m of meshes) box.union(new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute));
  const r = (v: number) => Math.round(v * 100) / 100;
  const tris = meshes.reduce((a, m) => a + m.geometry.attributes.position.count / 3, 0);
  return {
    group: g,
    footprint: { w: r(box.max.x - box.min.x), d: r(box.max.z - box.min.z), h: r(box.max.y) },
    extent: { x0: r(box.min.x), x1: r(box.max.x), z0: r(box.min.z), z1: r(box.max.z), y1: r(box.max.y) },
    cost: { draws: meshes.length, tris: Math.round(tris) },
  };
}
