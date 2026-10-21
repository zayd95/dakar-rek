/**
 * Road geometry of the corridors between districts (pure maths, no three.js: unit-tested in network.test.ts).
 *
 * A road is a `Spine` (a centre line, rounded at its bends by `fillet`) plus a half width. The drivable ground is the union of capsules (a segment and a radius)
 * round it, and round the arms of its junctions: `contains(x, z, r)` is the whole of the corridor's collision with the world, next to the colliders of the
 * roadside things. Game frame: x east, z south, yaw 0 faces +z, forward = (sin yaw, cos yaw); the vehicle's left is (cos yaw, -sin yaw).
 */
export interface Pt { x: number; z: number }

export interface Pose extends Pt { yaw: number }

/** A point of a spine: where it is, which way the road runs there, and how far along it (metres). */
export interface SpineAt extends Pose { s: number }

/** Where a point stands relative to a spine: the nearest point of it, and the signed distance (positive: on the vehicle's left going forward). */
export interface Projection { s: number; d: number; x: number; z: number; yaw: number }

const TAU = Math.PI * 2;
export const wrapAngle = (a: number) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

/**
 * A control polyline with its bends rounded: at each inner vertex the corner is replaced by a circular arc of radius `r` (shortened where the neighbouring legs are too short
 * for it), sampled every `step` metres of arc. The first and last points are kept.
 */
export function fillet(nodes: readonly Pt[], r: number, step = 12): Pt[] {
  if (nodes.length < 3) return nodes.map(p => ({ ...p }));
  const out: Pt[] = [{ ...nodes[0] }];
  for (let i = 1; i < nodes.length - 1; i++) {
    const a = nodes[i - 1], b = nodes[i], c = nodes[i + 1];
    const ux = a.x - b.x, uz = a.z - b.z, vx = c.x - b.x, vz = c.z - b.z;
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    const dot = (ux * vx + uz * vz) / (lu * lv), ang = Math.acos(Math.max(-1, Math.min(1, dot)));        // interior angle at b: π is a straight road
    const turn = Math.PI - ang;
    if (turn < 1e-3) { out.push({ ...b }); continue; }
    // distance from b to the tangent points: r·tan(turn/2), never more than 45 % of a neighbouring leg (consecutive arcs must not overlap)
    const t = Math.min(r * Math.tan(turn / 2), lu * 0.45, lv * 0.45), rr = t / Math.tan(turn / 2);
    const p0 = { x: b.x + (ux / lu) * t, z: b.z + (uz / lu) * t }, p1 = { x: b.x + (vx / lv) * t, z: b.z + (vz / lv) * t };
    const bis = { x: ux / lu + vx / lv, z: uz / lu + vz / lv }, lb = Math.hypot(bis.x, bis.z);
    const cd = rr / Math.sin(ang / 2), cx = b.x + (bis.x / lb) * cd, cz = b.z + (bis.z / lb) * cd;           // the arc's centre, on the inner side of the bend
    let a0 = Math.atan2(p0.z - cz, p0.x - cx), a1 = Math.atan2(p1.z - cz, p1.x - cx);
    let da = wrapAngle(a1 - a0);
    const n = Math.max(2, Math.ceil(Math.abs(da) * rr / step));
    for (let k = 0; k <= n; k++) { const an = a0 + (da * k) / n; out.push({ x: cx + Math.cos(an) * rr, z: cz + Math.sin(an) * rr }); }
  }
  out.push({ ...nodes[nodes.length - 1] });
  return out;
}

/** A polyline with arc length: position and heading at a distance along it, and the projection of any point onto it. */
export class Spine {
  readonly pts: Pt[];
  /** Arc length at each point. */
  readonly cum: number[];
  readonly length: number;
  constructor(pts: readonly Pt[]) {
    this.pts = pts.map(p => ({ x: p.x, z: p.z }));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z));
    this.length = this.cum[this.cum.length - 1];
  }

  private seg(s: number): number {
    if (s <= 0) return 0;
    if (s >= this.length) return this.pts.length - 2;
    let lo = 0, hi = this.pts.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }

  /** The point `s` metres along the road (clamped to its ends), the heading of the segment it is on. */
  at(s: number): SpineAt {
    const i = this.seg(s), a = this.pts[i], b = this.pts[i + 1], len = this.cum[i + 1] - this.cum[i] || 1;
    const t = Math.max(0, Math.min(1, (s - this.cum[i]) / len));
    return { s: Math.max(0, Math.min(this.length, s)), x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  /**
   * Nearest point of the road to (x, z). `hint`: an arc length near the answer, to look only at the neighbouring segments (a vehicle moves a few metres a frame);
   * without it, every segment is looked at (a few dozen: still cheap).
   */
  project(x: number, z: number, hint?: number, window = 120): Projection {
    let lo = 0, hi = this.pts.length - 2;
    if (hint !== undefined) { lo = this.seg(hint - window); hi = this.seg(hint + window); }
    let best: Projection | null = null, bestD2 = Infinity;
    for (let i = lo; i <= hi; i++) {
      const a = this.pts[i], b = this.pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      const px = a.x + dx * t, pz = a.z + dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        const yaw = Math.atan2(dx, dz), lx = Math.cos(yaw), lz = -Math.sin(yaw);
        best = { s: this.cum[i] + Math.sqrt(l2) * t, d: (x - px) * lx + (z - pz) * lz, x: px, z: pz, yaw };
      }
    }
    return best!;
  }
}

/** A drivable stub off the spine: a segment and the half width of its road. */
export interface Arm { a: Pt; b: Pt; half: number }

/** True if (x, z) is within `half - r` of the segment ab. */
export function inCapsule(x: number, z: number, a: Pt, b: Pt, half: number, r: number): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
  const px = a.x + dx * t, pz = a.z + dz * t, lim = half - r;
  return lim >= 0 && (x - px) * (x - px) + (z - pz) * (z - pz) <= lim * lim;
}

/** The union of capsules the corridor's vehicles and walkers may stand in. A bounding box per segment makes the test a few comparisons for the nearly all far segments. */
export class Ground {
  private readonly segs: { a: Pt; b: Pt; half: number; x0: number; x1: number; z0: number; z1: number }[] = [];
  constructor(spine: Spine, half: number, arms: readonly Arm[] = []) {
    const add = (a: Pt, b: Pt, h: number) => this.segs.push({ a, b, half: h, x0: Math.min(a.x, b.x) - h, x1: Math.max(a.x, b.x) + h, z0: Math.min(a.z, b.z) - h, z1: Math.max(a.z, b.z) + h });
    for (let i = 0; i + 1 < spine.pts.length; i++) add(spine.pts[i], spine.pts[i + 1], half);
    for (const m of arms) add(m.a, m.b, m.half);
  }
  contains(x: number, z: number, r = 0): boolean {
    for (const s of this.segs) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      if (inCapsule(x, z, s.a, s.b, s.half, r)) return true;
    }
    return false;
  }
}
