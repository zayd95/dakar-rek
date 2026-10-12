/**
 * Walking route to a seat. The player goes round tables, chairs and walls to a free spot beside the seat (its side,
 * back or front), then slides onto it. Grid A* over the colliders near the route, smoothed into straight legs.
 * Pure module (no Three.js), unit-tested.
 */
export interface Pt { x: number; z: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

const CELL = 0.15;
/** Distances from the seat to the spot the player walks to before sitting down (further out for a deep bench). */
const STEP_IN = [0.75, 1.1];
/** Closer than this, the player sits straight away. */
const AT_HAND = 0.9;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
const inside = (p: Pt, b: Rect) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1;

/** Does the segment a→b cross the inside of one of the rectangles? (slab test; touching an edge is allowed) */
export function segClear(a: Pt, b: Pt, rects: readonly Rect[]): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const r of rects) {
    let t0 = 0, t1 = 1;
    const ok = ([p, d, lo, hi]: [number, number, number, number]) => {
      if (Math.abs(d) < 1e-9) return p > lo && p < hi;
      let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); return t0 < t1 - 1e-9;
    };
    if (ok([a.x, dx, r.x0, r.x1]) && ok([a.z, dz, r.z0, r.z1])) return false;
  }
  return true;
}

/** Spots around a seat the player can step in from: left, right, behind, in front (forward = sin/cos of yaw). */
export function seatEntries(seat: { x: number; z: number; yaw: number }, d = STEP_IN[0]): Pt[] {
  const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
  return [[fz, -fx], [-fz, fx], [-fx, -fz], [fx, fz]].map(([ux, uz]) => ({ x: seat.x + ux * d, z: seat.z + uz * d }));
}

/**
 * Waypoints from `from` to the seat (the last one is the seat itself), or null when no free spot beside it can be
 * reached. `colliders` are the space's solid rectangles, `r` the player's radius, `bounds` the walkable area.
 */
export function approachPath(from: Pt, seat: { x: number; z: number; yaw: number }, colliders: readonly Rect[], r: number, bounds?: Rect): Pt[] | null {
  const end = { x: seat.x, z: seat.z };
  if (dist(from, end) < AT_HAND) return [end];
  const pad = 3;
  let area: Rect = { x0: Math.min(from.x, seat.x) - pad, z0: Math.min(from.z, seat.z) - pad, x1: Math.max(from.x, seat.x) + pad, z1: Math.max(from.z, seat.z) + pad };
  if (bounds) area = { x0: Math.max(area.x0, bounds.x0), z0: Math.max(area.z0, bounds.z0), x1: Math.min(area.x1, bounds.x1), z1: Math.min(area.z1, bounds.z1) };
  const m = r - 0.02;                                                  // a little slack: the player already stands r away from walls
  const rects = colliders
    .filter(c => c.x1 > area.x0 - r && c.x0 < area.x1 + r && c.z1 > area.z0 - r && c.z0 < area.z1 + r)
    .map(c => ({ x0: c.x0 - m, z0: c.z0 - m, x1: c.x1 + m, z1: c.z1 + m }))
    .filter(c => !inside(from, c));                                    // already touching one: let the route leave it
  const walkable = (p: Pt) => p.x >= area.x0 && p.x <= area.x1 && p.z >= area.z0 && p.z <= area.z1 && !rects.some(c => inside(p, c));
  let best: Pt[] | null = null, bestLen = Infinity;
  for (const e of STEP_IN.flatMap(d => seatEntries(seat, d))) {
    if (!walkable(e)) continue;
    const legs = route(from, e, rects, area, walkable);
    if (!legs) continue;
    const len = legs.reduce((s, p, i) => s + dist(i ? legs[i - 1] : from, p), 0) + dist(e, end);
    if (len < bestLen) { bestLen = len; best = [...legs, end]; }
  }
  return best;
}

/** Straight line if it is clear, otherwise A* on a CELL grid of the area, then string-pulled. Excludes `from`. */
function route(from: Pt, to: Pt, rects: Rect[], area: Rect, walkable: (p: Pt) => boolean): Pt[] | null {
  if (segClear(from, to, rects)) return [to];
  const nx = Math.max(2, Math.ceil((area.x1 - area.x0) / CELL)), nz = Math.max(2, Math.ceil((area.z1 - area.z0) / CELL));
  const cx = (i: number) => area.x0 + (i + 0.5) * CELL, cz = (k: number) => area.z0 + (k + 0.5) * CELL;
  const cell = (p: Pt) => [Math.min(nx - 1, Math.max(0, Math.floor((p.x - area.x0) / CELL))), Math.min(nz - 1, Math.max(0, Math.floor((p.z - area.z0) / CELL)))];
  const [si, sk] = cell(from), [gi, gk] = cell(to);
  const S = sk * nx + si, G = gk * nx + gi;
  const open = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) open[k * nx + i] = walkable({ x: cx(i), z: cz(k) }) ? 1 : 0;
  open[S] = 1; open[G] = 1;
  const g = new Float64Array(nx * nz).fill(Infinity), prev = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz);
  const h = (n: number) => { const di = Math.abs((n % nx) - gi), dk = Math.abs(Math.floor(n / nx) - gk); return (Math.max(di, dk) + 0.4142 * Math.min(di, dk)) * CELL; };
  // binary heap of [f, node]
  const heap: [number, number][] = [];
  const push = (f: number, n: number) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  g[S] = 0; push(h(S), S);
  while (heap.length) {
    const [, u] = pop();
    if (done[u]) continue; done[u] = 1;
    if (u === G) break;
    const ui = u % nx, uk = Math.floor(u / nx);
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (!di && !dk) continue;
      const vi = ui + di, vk = uk + dk;
      if (vi < 0 || vk < 0 || vi >= nx || vk >= nz) continue;
      const v = vk * nx + vi;
      if (!open[v] || done[v]) continue;
      if (di && dk && (!open[uk * nx + vi] || !open[vk * nx + ui])) continue;   // no cutting corners
      const w = g[u] + (di && dk ? 1.4142 : 1) * CELL;
      if (w < g[v]) { g[v] = w; prev[v] = u; push(w + h(v), v); }
    }
  }
  if (!done[G]) return null;
  const cells: Pt[] = [];
  for (let n = prev[G]; n >= 0 && n !== S; n = prev[n]) cells.unshift({ x: cx(n % nx), z: cz(Math.floor(n / nx)) });
  const pts = [from, ...cells, to];
  // string-pulling: from each point, jump to the farthest one still in a clear straight line
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1;) {
    let j = pts.length - 1;
    while (j > i + 1 && !segClear(pts[i], pts[j], rects)) j--;
    out.push(pts[j]); i = j;
  }
  return out;
}
