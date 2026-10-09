import * as THREE from 'three';

/**
 * Low-poly geometry builder shared by the vehicle and furniture kits (src/actors/vehicleKit.ts, src/world/furnitureKit.ts).
 * Everything a kit model is made of — boxes, beams, cylinders, extruded side profiles, decals — is written into ONE
 * non-indexed buffer with flat normals, vertex colours and atlas UVs, so a whole model is a single draw call on a shared
 * material. Untextured faces sample a white texel of the kit's atlas (`plain`) and take their colour from the vertices;
 * painted panels (liveries, prints, lights, rims) sample their own atlas rectangle with a white vertex colour.
 */
export type V3 = readonly [number, number, number];
/** Atlas rectangle in UV space: u0, v0 (bottom-left), u1, v1 (top-right). */
export type Rect = readonly [number, number, number, number];
export type Paint = number | THREE.Color | ((x: number, y: number, z: number) => number);

export interface FaceOpts { paint?: Paint; rect?: Rect; skip?: boolean }
export interface BoxOpts {
  rotY?: number;
  /** Bottom face (default false: boxes stand on something). */
  bottom?: boolean;
  px?: FaceOpts; nx?: FaceOpts; py?: FaceOpts; ny?: FaceOpts; pz?: FaceOpts; nz?: FaceOpts;
}
export interface PrismOpts {
  /** Half width along x: constant, or [yA, hwA, yB, hwB] linear in y (tumblehome; keeps the side faces planar). */
  hw: number | readonly [number, number, number, number];
  /** Centre of the prism on x (default 0). */
  xc?: number;
  paint: Paint;
  /** Side face at +x / −x (default: paint). null skips it. */
  capPos?: Paint | null;
  capNeg?: Paint | null;
  /** Colour of the band face that starts at profile point i (its tag is the profile point's third value). null skips it. */
  band?: (i: number, tag: number | undefined) => Paint | null | undefined;
}

const tc = new THREE.Color();
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), vn = new THREE.Vector3();

export class KitBuilder {
  private P: number[] = [];
  private N: number[] = [];
  private C: number[] = [];
  private U: number[] = [];
  private stack: THREE.Matrix4[] = [];
  /** Baked vertical shading: colour × lerp(lo, 1, clamp((y − y0) / h)). Darkens sills and undersides like soft AO. */
  shade: { lo: number; y0: number; h: number } | null = null;

  constructor(readonly plain: readonly [number, number] = [0.5, 0.5]) {}

  get triangles() { return this.P.length / 9; }

  /** Applies `m` (on top of the current transform) to everything built inside `fn`. */
  with(m: THREE.Matrix4, fn: () => void) {
    const top = this.stack[this.stack.length - 1];
    this.stack.push(top ? top.clone().multiply(m) : m.clone());
    try { fn(); } finally { this.stack.pop(); }
  }
  at(x: number, y: number, z: number, rotY: number, fn: () => void, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), new THREE.Vector3(1, 1, 1));
    this.with(m, fn);
  }

  private color(p: Paint, x: number, y: number, z: number): THREE.Color {
    if (typeof p === 'function') tc.set(p(x, y, z));
    else if (typeof p === 'number') tc.set(p);
    else tc.copy(p);
    if (this.shade) { const k = THREE.MathUtils.clamp((y - this.shade.y0) / this.shade.h, 0, 1); tc.multiplyScalar(this.shade.lo + (1 - this.shade.lo) * k); }
    return tc;
  }

  /** Convex polygon, points counter-clockwise seen from the side it faces. */
  poly(pts: readonly V3[], paint: Paint, uvs?: readonly (readonly [number, number])[]) {
    const m = this.stack[this.stack.length - 1];
    const w = pts.map(p => { const v = new THREE.Vector3(p[0], p[1], p[2]); return m ? v.applyMatrix4(m) : v; });
    // flat normal from the first non-degenerate corner
    vn.set(0, 0, 0);
    for (let i = 1; i + 1 < w.length && vn.lengthSq() < 1e-12; i++) { va.subVectors(w[i], w[0]); vb.subVectors(w[i + 1], w[0]); vn.crossVectors(va, vb); }
    if (vn.lengthSq() < 1e-12) return;
    vn.normalize();
    for (let i = 1; i + 1 < w.length; i++) for (const k of [0, i, i + 1]) {
      const v = w[k];
      this.P.push(v.x, v.y, v.z); this.N.push(vn.x, vn.y, vn.z);
      const c = this.color(paint, v.x, v.y, v.z); this.C.push(c.r, c.g, c.b);
      const uv = uvs?.[k] ?? this.plain; this.U.push(uv[0], uv[1]);
    }
  }
  /** a b c d counter-clockwise from outside (a bottom-left, b bottom-right, c top-right, d top-left); rect maps onto it. */
  quad(a: V3, b: V3, c: V3, d: V3, paint: Paint, rect?: Rect) {
    this.poly([a, b, c, d], paint, rect ? [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]] : undefined);
  }
  /** Painted panel centred on c, spanning `right` × `up` (unit vectors); faces right × up. */
  decal(c: V3, right: V3, up: V3, w: number, h: number, rect: Rect | null, paint: Paint = 0xffffff) {
    const p = (sr: number, su: number): V3 => [c[0] + right[0] * sr * w / 2 + up[0] * su * h / 2, c[1] + right[1] * sr * w / 2 + up[1] * su * h / 2, c[2] + right[2] * sr * w / 2 + up[2] * su * h / 2];
    this.quad(p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), paint, rect ?? undefined);
  }
  /** Convex polygon facing `n` (its winding is flipped when needed): side windows, pillars, panels. */
  toward(pts: V3[], n: V3, paint: Paint, uvs?: [number, number][]) {
    va.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
    vb.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
    vc.crossVectors(va, vb);
    if (vc.x * n[0] + vc.y * n[1] + vc.z * n[2] < 0) { pts = pts.slice().reverse(); uvs = uvs?.slice().reverse(); }
    this.poly(pts, paint, uvs);
  }

  /** Axis-aligned cuboid in local coordinates (x0..x1, y0..y1, z0..z1). */
  cuboid(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, paint: Paint, o: BoxOpts = {}) {
    const f = (k: keyof BoxOpts) => o[k] as FaceOpts | undefined;
    const face = (key: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', a: V3, b: V3, c: V3, d: V3) => {
      const fo = f(key); if (fo?.skip) return;
      if (key === 'ny' && !o.bottom && !fo) return;
      this.quad(a, b, c, d, fo?.paint ?? (fo?.rect ? 0xffffff : paint), fo?.rect);   // painted panels keep their own colours
    };
    face('pz', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    face('nz', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    face('px', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    face('nx', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    face('py', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    face('ny', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }
  /** Box w × h × d standing on y (base centre at x, y, z), optionally turned by rotY. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, paint: Paint, o: BoxOpts = {}) {
    if (o.rotY) this.at(x, y, z, o.rotY, () => this.cuboid(-w / 2, w / 2, 0, h, -d / 2, d / 2, paint, o));
    else this.cuboid(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, paint, o);
  }
  /** Box with all six faces (seen from below: roofs, ceilings, shelves). */
  slab(w: number, h: number, d: number, x: number, y: number, z: number, paint: Paint, o: BoxOpts = {}) { this.box(w, h, d, x, y, z, paint, { ...o, bottom: true }); }
  /** Bar of section w × h from a to b (pillars, tubes, limbs, rails). */
  beam(a: V3, b: V3, w: number, h: number, paint: Paint, ends = true) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    if (len < 1e-6) return;
    dir.normalize();
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const xA = new THREE.Vector3().crossVectors(up, dir).normalize(), yA = new THREE.Vector3().crossVectors(dir, xA);
    const m = new THREE.Matrix4().makeBasis(xA, yA, dir).setPosition(A);
    this.with(m, () => this.cuboid(-w / 2, w / 2, -h / 2, h / 2, 0, len, paint, { bottom: true, ...(ends ? {} : { pz: { skip: true }, nz: { skip: true } }) }));
  }

  /**
   * Cylinder along an axis, centred on (cx, cy, cz): r0 at the negative end, r1 at the positive end.
   * Caps: true, false, or an atlas rect drawn as a disc on the cap (wheel rims, lamps, clock faces).
   */
  cyl(axis: 'x' | 'y' | 'z', r0: number, r1: number, len: number, cx: number, cy: number, cz: number, paint: Paint, seg = 10,
      caps: { neg?: boolean | Rect; pos?: boolean | Rect; capPaint?: Paint; side?: Rect } = { neg: true, pos: true }, phase = 0) {
    const rot = axis === 'x' ? new THREE.Matrix4().makeRotationZ(-Math.PI / 2) : axis === 'z' ? new THREE.Matrix4().makeRotationX(Math.PI / 2) : new THREE.Matrix4();
    const m = new THREE.Matrix4().makeTranslation(cx, cy, cz).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(0, -len / 2, 0));
    this.with(m, () => {
      const p = (i: number, y: number, r: number): V3 => { const t = phase + (i / seg) * Math.PI * 2; return [r * Math.sin(t), y, r * Math.cos(t)]; };
      const sr = caps.side;
      for (let i = 0; i < seg; i++) {
        if (sr) { const u0 = sr[0] + (sr[2] - sr[0]) * i / seg, u1 = sr[0] + (sr[2] - sr[0]) * (i + 1) / seg; this.poly([p(i, 0, r0), p(i + 1, 0, r0), p(i + 1, len, r1), p(i, len, r1)], 0xffffff, [[u0, sr[1]], [u1, sr[1]], [u1, sr[3]], [u0, sr[3]]]); }
        else this.quad(p(i, 0, r0), p(i + 1, 0, r0), p(i + 1, len, r1), p(i, len, r1), paint);
      }
      const cap = (y: number, r: number, c: boolean | Rect | undefined, top: boolean) => {
        if (!c || r <= 0) return;
        const rect = c === true ? null : c;
        const uv = (i: number): [number, number] => {
          if (!rect) return [this.plain[0], this.plain[1]];
          const t = phase + (i / seg) * Math.PI * 2, s = top ? 1 : -1;
          return [(rect[0] + rect[2]) / 2 + Math.sin(t) * s * (rect[2] - rect[0]) / 2, (rect[1] + rect[3]) / 2 + Math.cos(t) * (rect[3] - rect[1]) / 2];
        };
        const cuv: [number, number] = rect ? [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2] : [this.plain[0], this.plain[1]];
        const cp = rect ? 0xffffff : (caps.capPaint ?? paint);
        for (let i = 0; i < seg; i++) {
          if (top) this.poly([[0, y, 0], p(i, y, r), p(i + 1, y, r)], cp, [cuv, uv(i), uv(i + 1)]);
          else this.poly([[0, y, 0], p(i + 1, y, r), p(i, y, r)], cp, [cuv, uv(i + 1), uv(i)]);
        }
      };
      cap(len, r1, caps.pos, true); cap(0, r0, caps.neg, false);
    });
  }

  /** Any three.js geometry, flat-shaded (heads, fans, round knobs). */
  geometry(g: THREE.BufferGeometry, paint: Paint, x = 0, y = 0, z = 0, scale: V3 = [1, 1, 1]) {
    const pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(...scale));
    this.with(m, () => {
      for (let i = 0; i < n; i += 3) {
        const v = (k: number): V3 => { const j = idx ? idx.getX(i + k) : i + k; return [pos.getX(j), pos.getY(j), pos.getZ(j)]; };
        this.poly([v(0), v(1), v(2)], paint);
      }
    });
    g.dispose();
  }
  /** Low-poly ellipsoid (detail 0: 20 triangles, 1: 80). */
  blob(r: number, x: number, y: number, z: number, paint: Paint, s: V3 = [1, 1, 1], detail = 0) {
    this.geometry(new THREE.IcosahedronGeometry(r, detail), paint, x, y, z, s);
  }

  /**
   * Side profile extruded across the vehicle: `profile` is a closed polygon in (z, y) — z forward, y up — optionally
   * tagged per point (third value) so band faces can be painted per edge (bonnet, roof, sill…). Concave outlines
   * (wheel arches) are fine. With a linear half width in y the side faces stay planar (tumblehome).
   */
  prism(profile: readonly (readonly [number, number, number?])[], o: PrismOpts) {
    let pts = profile.map(p => [p[0], p[1], p[2]] as [number, number, number | undefined]);
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) {   // make it counter-clockwise; each tag stays with the edge it started
      const n = pts.length, rev = pts.slice().reverse();
      pts = rev.map((p, i) => [p[0], p[1], rev[(i + 1) % n][2]] as [number, number, number | undefined]);
    }
    const xc = o.xc ?? 0;
    const hw = (y: number) => typeof o.hw === 'number' ? o.hw : o.hw[1] + (o.hw[3] - o.hw[1]) * (y - o.hw[0]) / (o.hw[2] - o.hw[0]);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const paint = o.band ? o.band(i, a[2]) : o.paint;
      if (paint === null) continue;
      const dz = b[0] - a[0], dy = b[1] - a[1];
      this.toward([[xc + hw(a[1]), a[1], a[0]], [xc - hw(a[1]), a[1], a[0]], [xc - hw(b[1]), b[1], b[0]], [xc + hw(b[1]), b[1], b[0]]], [0, -dz, dy], paint ?? o.paint);
    }
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const [side, cap] of [[1, o.capPos], [-1, o.capNeg]] as const) {
      if (cap === null) continue;
      const paint = cap ?? o.paint;
      for (const t of tris) this.toward(t.map(k => [xc + side * hw(pts[k][1]), pts[k][1], pts[k][0]] as V3), [side, 0, 0], paint);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/** UV rectangle of a pixel rectangle (x, y from the top-left) in a W × H atlas, inset by one texel against bleeding. */
export function atlasRect(x: number, y: number, w: number, h: number, W: number, H: number): Rect {
  return [(x + 1) / W, 1 - (y + h - 1) / H, (x + w - 1) / W, 1 - (y + 1) / H];
}

/**
 * Colour atlas and glow (emissive) atlas painted in code, at the same layout (the glow one at 1/glowDiv resolution).
 * Without a DOM (unit tests) returns nulls: the geometry and its UVs do not depend on the pixels.
 */
export function paintAtlas(W: number, H: number, glowDiv: number, draw: (map: CanvasRenderingContext2D, glow: CanvasRenderingContext2D) => void) {
  if (typeof document === 'undefined') return { map: null, glow: null };
  const mk = (w: number, h: number) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  const a = mk(W, H), b = mk(W / glowDiv, H / glowDiv);
  const ca = a.getContext('2d'), cb = b.getContext('2d');
  if (!ca || !cb) return { map: null, glow: null };
  ca.fillStyle = '#ffffff'; ca.fillRect(0, 0, W, H);
  cb.fillStyle = '#000000'; cb.fillRect(0, 0, W / glowDiv, H / glowDiv); cb.scale(1 / glowDiv, 1 / glowDiv);
  draw(ca, cb);
  const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  return { map: tex(a, true), glow: tex(b, true) };
}

/** Seeded random in [0, 1) (mulberry32): variants are reproducible from a seed. */
export function seeded(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
