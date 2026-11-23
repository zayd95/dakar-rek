/**
 * Route math for public transport (pure, no three.js): a lane path on the hub's road grid, arc-length sampling, and a
 * timetable that turns a closed loop with stops into a deterministic motion — where the vehicle is at any time of the
 * shared clock, its speed, whether it is standing at a stop. Every client computes the same thing from the same clock,
 * so players riding one line share one vehicle (docs/TRANSPORT.md).
 *
 * Conventions (as everywhere in the game): yaw 0 faces +z, forward = (sin yaw, cos yaw), the right-hand side of a
 * heading is (−cos yaw, sin yaw). Vehicles drive on the right.
 */
export interface Pt { x: number; z: number }
export interface Pose { x: number; z: number; yaw: number }

const TAU = Math.PI * 2;
/** Shortest signed angle from a to b. */
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
/** Right-hand side of a unit direction (dx, dz). */
const rightOf = (dx: number, dz: number): Pt => ({ x: -dz, z: dx });

/**
 * The lane a vehicle follows around a closed loop of road nodes: every leg shifted `lane` metres to its right, corners
 * where the shifted legs meet, rounded with a quadratic curve cut `round` metres back on each side.
 */
export function lanePath(nodes: readonly Pt[], lane: number, round: number, samples = 6): Pt[] {
  const n = nodes.length;
  if (n < 3) throw new Error('lanePath: a loop needs at least three nodes');
  const corners: Pt[] = [], dirIn: Pt[] = [], dirOut: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = nodes[(i + n - 1) % n], c = nodes[i], q = nodes[(i + 1) % n];
    const li = Math.hypot(c.x - p.x, c.z - p.z), lo = Math.hypot(q.x - c.x, q.z - c.z);
    const di = { x: (c.x - p.x) / li, z: (c.z - p.z) / li }, dout = { x: (q.x - c.x) / lo, z: (q.z - c.z) / lo };
    const ri = rightOf(di.x, di.z), ro = rightOf(dout.x, dout.z);
    // offset lines: A + t·di and B + u·dout; their intersection is the lane corner
    const A = { x: c.x + ri.x * lane, z: c.z + ri.z * lane }, B = { x: c.x + ro.x * lane, z: c.z + ro.z * lane };
    const cross = di.x * dout.z - di.z * dout.x;
    let C = A;
    if (Math.abs(cross) > 1e-6) { const t = ((B.x - A.x) * dout.z - (B.z - A.z) * dout.x) / cross; C = { x: A.x + di.x * t, z: A.z + di.z * t }; }
    corners.push(C); dirIn.push(di); dirOut.push(dout);
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const C = corners[i], P0 = corners[(i + n - 1) % n], Q0 = corners[(i + 1) % n];
    const di = dirIn[i], dout = dirOut[i];
    if (Math.abs(di.x * dout.z - di.z * dout.x) < 1e-6 && di.x * dout.x + di.z * dout.z > 0) { out.push(C); continue; }   // straight on
    const r = Math.min(round, Math.hypot(C.x - P0.x, C.z - P0.z) / 2, Math.hypot(Q0.x - C.x, Q0.z - C.z) / 2);
    const P = { x: C.x - di.x * r, z: C.z - di.z * r }, Q = { x: C.x + dout.x * r, z: C.z + dout.z * r };
    for (let k = 0; k <= samples; k++) {
      const t = k / samples, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push({ x: a * P.x + b * C.x + c * Q.x, z: a * P.z + b * C.z + c * Q.z });
    }
  }
  return out;
}

/**
 * The lane along an open route of road nodes (a taxi from a rank out of the neighbourhood, into another one): like
 * lanePath, every leg shifted `lane` metres to its right and the corners rounded, but the ends stay ends. Use it with
 * Path and sample only up to `path.at(points.length - 1)` (Path closes its polylines; the closing leg is never driven).
 */
export function openLanePath(nodes: readonly Pt[], lane: number, round: number, samples = 6): Pt[] {
  const n = nodes.length;
  if (n < 2) throw new Error('openLanePath: a route needs at least two nodes');
  const dir = (a: Pt, b: Pt) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; };
  const out: Pt[] = [];
  const d0 = dir(nodes[0], nodes[1]), r0 = rightOf(d0.x, d0.z);
  out.push({ x: nodes[0].x + r0.x * lane, z: nodes[0].z + r0.z * lane });
  for (let i = 1; i < n - 1; i++) {
    const p = nodes[i - 1], c = nodes[i], q = nodes[i + 1], di = dir(p, c), dout = dir(c, q);
    const ri = rightOf(di.x, di.z), ro = rightOf(dout.x, dout.z);
    const A = { x: c.x + ri.x * lane, z: c.z + ri.z * lane }, B = { x: c.x + ro.x * lane, z: c.z + ro.z * lane };
    const cross = di.x * dout.z - di.z * dout.x;
    if (Math.abs(cross) < 1e-6) { out.push(A); continue; }                               // straight on
    const t = ((B.x - A.x) * dout.z - (B.z - A.z) * dout.x) / cross, C = { x: A.x + di.x * t, z: A.z + di.z * t };
    const prev = out[out.length - 1], next = { x: q.x + ro.x * lane, z: q.z + ro.z * lane };
    const r = Math.min(round, Math.hypot(C.x - prev.x, C.z - prev.z) / 2, Math.hypot(next.x - C.x, next.z - C.z) / 2);
    const P = { x: C.x - di.x * r, z: C.z - di.z * r }, Q = { x: C.x + dout.x * r, z: C.z + dout.z * r };
    for (let k = 0; k <= samples; k++) {
      const u = k / samples, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, cc = u * u;
      out.push({ x: a * P.x + b * C.x + cc * Q.x, z: a * P.z + b * C.z + cc * Q.z });
    }
  }
  const dl = dir(nodes[n - 2], nodes[n - 1]), rl = rightOf(dl.x, dl.z);
  out.push({ x: nodes[n - 1].x + rl.x * lane, z: nodes[n - 1].z + rl.z * lane });
  return out;
}

/**
 * A closed polyline with cumulative arc lengths. sample(s) gives the position at arc length s (wrapping) and a heading
 * that follows the segment, blended with the neighbouring segment within `blend` metres of each vertex so the vehicle
 * does not snap from one segment's heading to the next.
 */
export class Path {
  readonly length: number;
  private xs: Float64Array; private zs: Float64Array;
  /** Arc length at each vertex (cum[n] = length). */
  private cum: Float64Array;
  /** Heading of each segment i (vertex i → i + 1). */
  private segYaw: Float64Array;
  /** Signed heading change at each vertex (segment i − 1 → segment i). */
  readonly turn: Float64Array;
  constructor(pts: readonly Pt[], private blend = 1.5) {
    const n = pts.length;
    if (n < 2) throw new Error('Path: needs at least two points');
    this.xs = new Float64Array(n); this.zs = new Float64Array(n); this.cum = new Float64Array(n + 1); this.segYaw = new Float64Array(n); this.turn = new Float64Array(n);
    for (let i = 0; i < n; i++) { this.xs[i] = pts[i].x; this.zs[i] = pts[i].z; }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = this.xs[j] - this.xs[i], dz = this.zs[j] - this.zs[i];
      this.cum[i + 1] = this.cum[i] + Math.hypot(dx, dz);
      this.segYaw[i] = yawOf(dx, dz);
    }
    for (let i = 0; i < n; i++) this.turn[i] = angleDiff(this.segYaw[(i + n - 1) % n], this.segYaw[i]);
    this.length = this.cum[n];
  }
  get count() { return this.xs.length; }
  /** Arc length of vertex i. */
  at(i: number) { return this.cum[i]; }
  segLength(i: number) { return this.cum[i + 1] - this.cum[i]; }
  wrap(s: number) { const L = this.length; return ((s % L) + L) % L; }
  /** Index of the segment containing arc length s (already wrapped). */
  segment(s: number) {
    let lo = 0, hi = this.xs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }
  sample(s: number, out: Pose): Pose {
    s = this.wrap(s);
    const n = this.xs.length, i = this.segment(s), j = (i + 1) % n;
    const len = this.cum[i + 1] - this.cum[i], f = len > 0 ? (s - this.cum[i]) / len : 0;
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * f;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * f;
    const b = Math.min(this.blend, len / 2), d0 = s - this.cum[i], d1 = this.cum[i + 1] - s;
    let yaw = this.segYaw[i];
    // half of the vertex turn is spread over `b` metres on each side of the vertex
    if (b > 0 && d0 < b) yaw -= this.turn[i] * 0.5 * (1 - d0 / b);
    else if (b > 0 && d1 < b) yaw += this.turn[j] * 0.5 * (1 - d1 / b);
    out.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    return out;
  }
  /** Arc length of the point of the path closest to (x, z). */
  project(x: number, z: number): number {
    let best = 0, bd = Infinity;
    const n = this.xs.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = this.xs[i], az = this.zs[i], dx = this.xs[j] - ax, dz = this.zs[j] - az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const px = ax + dx * t, pz = az + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = this.cum[i] + Math.sqrt(l2) * t; }
    }
    return best;
  }
  /** Curvature (1/m) around arc length s: the vertex turns within ±span metres, divided by the distance covered. */
  curvature(s: number, span = 3): number {
    let total = 0;
    const n = this.xs.length;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(this.cum[i] - this.wrap(s)); d = Math.min(d, this.length - d);
      if (d <= span) total += Math.abs(this.turn[i]);
    }
    return total / (2 * span);
  }
}

export interface MotionOpts {
  /** Cruising speed (m/s). */
  vmax: number;
  /** Lowest speed in the tightest corner (m/s). */
  vmin: number;
  /** Lateral acceleration allowed in corners (m/s²). */
  lateral: number;
  accel: number;
  decel: number;
  /** Grid step of the speed profile (m). */
  ds?: number;
}

export interface StopAt { s: number; dwell: number }

/** Where a timetabled vehicle is at one moment. */
export interface Motion {
  /** Arc length along the path. */
  s: number;
  /** Speed (m/s) and longitudinal acceleration (m/s²). */
  v: number; a: number;
  /** Index of the stop it stands at, or −1 while moving. */
  dwell: number;
  /** Seconds left at that stop. */
  dwellLeft: number;
  /** Next stop it will arrive at (after the current one when standing). */
  next: number;
  /** Seconds until it arrives at `next`. */
  eta: number;
}
export const newMotion = (): Motion => ({ s: 0, v: 0, a: 0, dwell: -1, dwellLeft: 0, next: 0, eta: 0 });

/**
 * Deterministic motion around a closed path with stops: the speed profile respects the cruising speed, corner speeds
 * (from the path's curvature), acceleration and braking, comes to rest at every stop and waits there `dwell` seconds.
 * Time 0 is the arrival at the first stop; the motion repeats every `period` seconds.
 */
export class Timetable {
  readonly period: number;
  /** Arrival and departure times of each stop (same order as given), and its arc length on the grid. */
  readonly stops: { s: number; arrive: number; depart: number }[] = [];
  private ts: Float64Array; private ss: Float64Array; private vs: Float64Array;
  constructor(readonly path: Path, stops: readonly StopAt[], o: MotionOpts) {
    if (!stops.length) throw new Error('Timetable: a line needs at least one stop');
    const ds = o.ds ?? 0.5, L = path.length, N = Math.max(8, Math.round(L / ds)), step = L / N;
    const vlim = new Float64Array(N), isStop = new Int32Array(N).fill(-1);
    for (let k = 0; k < N; k++) {
      const kappa = path.curvature(k * step);
      vlim[k] = kappa > 1e-4 ? Math.max(o.vmin, Math.min(o.vmax, Math.sqrt(o.lateral / kappa))) : o.vmax;
    }
    const stopK = stops.map(st => Math.round(path.wrap(st.s) / step) % N);
    stopK.forEach((k, i) => { isStop[k] = i; });
    const k0 = stopK[0];
    const v = new Float64Array(N);
    // forward pass (acceleration), starting at rest at the first stop, once around the loop
    for (let j = 1; j < N; j++) {
      const k = (k0 + j) % N, p = (k + N - 1) % N;
      v[k] = isStop[k] >= 0 ? 0 : Math.min(vlim[k], Math.sqrt(v[p] * v[p] + 2 * o.accel * step));
    }
    // backward pass (braking), ending at rest at the first stop
    for (let j = N - 1; j >= 1; j--) {
      const k = (k0 + j) % N, nx = (k + 1) % N;
      v[k] = Math.min(v[k], Math.sqrt(v[nx] * v[nx] + 2 * o.decel * step));
    }
    // integrate time (constant acceleration between grid points) and insert the dwells
    const ts: number[] = [], ss: number[] = [], vs: number[] = [];
    const arrive = new Array<number>(stops.length).fill(0), depart = new Array<number>(stops.length).fill(0);
    let t = 0;
    for (let j = 0; j <= N; j++) {
      const k = (k0 + j) % N, s = k0 * step + j * step;          // unwrapped arc length
      if (j > 0) { const p = (k + N - 1) % N; t += (2 * step) / Math.max(1e-3, v[p] + v[k]); }
      const si = isStop[k];
      if (si >= 0 && j < N) {
        ts.push(t); ss.push(s); vs.push(0); arrive[si] = t;
        t += stops[si].dwell; depart[si] = t;
      }
      ts.push(t); ss.push(s); vs.push(v[k]);
    }
    this.period = t;
    this.ts = Float64Array.from(ts); this.ss = Float64Array.from(ss); this.vs = Float64Array.from(vs);
    for (let i = 0; i < stops.length; i++) this.stops.push({ s: path.wrap(stopK[i] * step), arrive: arrive[i], depart: depart[i] });
  }

  /** Motion at time t (seconds; any value, wraps by the period). */
  at(time: number, out: Motion): Motion {
    const P = this.period, t = ((time % P) + P) % P;
    const ts = this.ts;
    let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid - 1; }
    const j = Math.min(lo, ts.length - 2), s0 = this.ss[j], s1 = this.ss[j + 1], v0 = this.vs[j], v1 = this.vs[j + 1];
    const tau = t - ts[j];
    if (s1 === s0) { out.s = this.path.wrap(s0); out.v = 0; out.a = 0; }
    else {
      const a = (v1 * v1 - v0 * v0) / (2 * (s1 - s0));
      out.s = this.path.wrap(s0 + Math.min(s1 - s0, v0 * tau + 0.5 * a * tau * tau)); out.v = Math.max(0, v0 + a * tau); out.a = a;
    }
    out.dwell = -1; out.dwellLeft = 0;
    const st = this.stops;
    for (let i = 0; i < st.length; i++) if (t >= st[i].arrive && t < st[i].depart) { out.dwell = i; out.dwellLeft = st[i].depart - t; }
    // next arrival strictly after now (or after the current stop)
    let next = -1, eta = Infinity;
    for (let i = 0; i < st.length; i++) {
      if (i === out.dwell) continue;
      let dt = st[i].arrive - t; if (dt <= 0) dt += P;
      if (dt < eta) { eta = dt; next = i; }
    }
    if (next < 0) { next = out.dwell >= 0 ? out.dwell : 0; eta = P - (t - st[next].arrive); }
    out.next = next; out.eta = eta;
    return out;
  }

  /** Seconds from time t until the vehicle next arrives at stop i (0 while standing there). */
  untilArrival(time: number, i: number): number {
    const P = this.period, t = ((time % P) + P) % P, st = this.stops[i];
    if (t >= st.arrive && t < st.depart) return 0;
    let dt = st.arrive - t; if (dt < 0) dt += P;
    return dt;
  }
}

/** Smooth 0→1 between e0 and e1. */
export const smoothstep = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * Extra offset to the right near stops (the vehicle pulls in to the kerb): 0 on the road, `extra` at a stop, eased over
 * `before` metres before it and `after` metres after it.
 */
export function pullIn(path: Path, stopS: readonly number[], s: number, extra: number, before = 16, after = 12): number {
  let best = 0;
  const L = path.length;
  for (const ss of stopS) {
    let d = s - ss; d -= Math.round(d / L) * L;                        // signed cyclic distance (negative before the stop)
    const k = d <= 0 ? smoothstep(-before, 0, d) : 1 - smoothstep(0, after, d);
    if (k > best) best = k;
  }
  return best * extra;
}

export const TWO_PI = TAU;
