import type { Collider } from './types';
import type { ShopAnchors, ShopRect } from './shopKit';

/**
 * Walking inside a stocked shop (spec 10 Oct, §31: customers enter → browse → buy → leave without the player). The city's
 * ambient people (src/social/ambientLife.ts) come in through the shop's door, stand at a display (`anchors.browse`),
 * queue at the counter (`anchors.queue`, the first place is the counter) and leave; their steps inside go around the
 * furniture on the grid planned here, over the shop's footprint and colliders (src/world/shopKit.ts). Pure: no Three.js.
 */
export interface Pt { x: number; z: number }
/**
 * A stocked shop as the city's people see it: its place sheet key, kit anchors, footprint and colliders (world).
 * `room`: a walk-in room built off the map (a café, the restaurant: src/game/shops.ts), `key` being its street door;
 * its people come from its seats in its own space, the street keeps the terrace out front.
 */
export interface ShopInfo { key: string; type: string; anchors: ShopAnchors; bounds: ShopRect; colliders: readonly Collider[]; room?: boolean }

/** Grid path planner over a shop's footprint, for walkers of radius `r`. */
export class ShopPaths {
  private readonly nx: number;
  private readonly nz: number;
  private readonly free: Uint8Array;
  private readonly cache = new Map<string, Pt[] | null>();
  constructor(private readonly b: ShopRect, cols: readonly Collider[], r = 0.28, private readonly step = 0.2) {
    this.nx = Math.max(2, Math.ceil((b.x1 - b.x0) / step) + 1); this.nz = Math.max(2, Math.ceil((b.z1 - b.z0) / step) + 1);
    this.free = new Uint8Array(this.nx * this.nz);
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) {
      const p = this.pt(i, j);
      const inside = p.x > b.x0 + 0.12 && p.x < b.x1 - 0.12 && p.z > b.z0 + 0.12 && p.z < b.z1 + 0.01;
      this.free[i * this.nz + j] = inside && !cols.some(c => p.x > c.x0 - r && p.x < c.x1 + r && p.z > c.z0 - r && p.z < c.z1 + r) ? 1 : 0;
    }
  }
  private pt(i: number, j: number): Pt { return { x: this.b.x0 + i * this.step, z: this.b.z0 + j * this.step }; }
  private ok(i: number, j: number) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.free[i * this.nz + j] === 1; }
  /** Is the point clear for a walker (inside the footprint, off the furniture)? */
  walkable(p: Pt) { return this.ok(Math.round((p.x - this.b.x0) / this.step), Math.round((p.z - this.b.z0) / this.step)); }
  /** Nearest walkable cell to p. */
  private snap(p: Pt): [number, number] | null {
    const ci = Math.round((p.x - this.b.x0) / this.step), cj = Math.round((p.z - this.b.z0) / this.step);
    for (let r = 0; r < 8; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (this.ok(ci + di, cj + dj)) return [ci + di, cj + dj];
    }
    return null;
  }
  /** Straight segment clear of the furniture (sampled every half cell). */
  clear(a: Pt, b: Pt) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.step * 0.5)));
    for (let k = 0; k <= n; k++) if (!this.walkable({ x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n) })) return false;
    return true;
  }
  /** Waypoints from a to b around the furniture (a and b included), or null when b cannot be reached. */
  path(a: Pt, b: Pt): Pt[] | null {
    const key = `${a.x.toFixed(2)},${a.z.toFixed(2)}>${b.x.toFixed(2)},${b.z.toFixed(2)}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const res = this.search(a, b);
    this.cache.set(key, res);
    return res;
  }
  private search(a: Pt, b: Pt): Pt[] | null {
    if (this.clear(a, b)) return [a, b];
    const s = this.snap(a), t = this.snap(b);
    if (!s || !t) return null;
    const N = this.nx * this.nz, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open: number[] = [], f = new Float32Array(N).fill(Infinity);
    const id = (i: number, j: number) => i * this.nz + j, h = (i: number, j: number) => Math.hypot(i - t[0], j - t[1]);
    const s0 = id(s[0], s[1]), goal = id(t[0], t[1]);
    g[s0] = 0; f[s0] = h(s[0], s[1]); open.push(s0);
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue; closed[cur] = 1;
      const ci = Math.floor(cur / this.nz), cj = cur % this.nz;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this.ok(ni, nj) || (di && dj && (!this.ok(ci + di, cj) || !this.ok(ci, cj + dj)))) continue;
        const n = id(ni, nj), cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (cost < g[n]) { g[n] = cost; from[n] = cur; f[n] = cost + h(ni, nj); open.push(n); }
      }
    }
    if (from[goal] < 0 && goal !== s0) return null;
    const cells: Pt[] = [];
    for (let c = goal; c >= 0; c = from[c]) { cells.push(this.pt(Math.floor(c / this.nz), c % this.nz)); if (c === s0) break; }
    cells.reverse();
    return this.pull(cells, a, b);
  }
  /** String-pulling: keep a corner only where the straight line to the next one would cross the furniture. */
  private pull(cells: readonly Pt[], a: Pt, b: Pt): Pt[] {
    const out: Pt[] = [a];
    let anchor = a;
    for (let k = 0; k < cells.length; k++) {
      const next = k + 1 < cells.length ? cells[k + 1] : b;
      if (!this.clear(anchor, next)) { out.push(cells[k]); anchor = cells[k]; }
    }
    out.push(b);
    return out;
  }

  /** Shortest-path trees grown from a few fixed points (a yard's gaps, the places of a counter's queue): one search for all the walks from there. */
  private readonly trees = new Map<string, { s: number; g: Float32Array; from: Int32Array } | null>();
  private grow(a: Pt) {
    const key = `${a.x.toFixed(2)},${a.z.toFixed(2)}`;
    if (this.trees.has(key)) return this.trees.get(key)!;
    const s = this.snap(a);
    let tree: { s: number; g: Float32Array; from: Int32Array } | null = null;
    if (s) {
      const N = this.nx * this.nz, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const hc: number[] = [], hk: number[] = [];                             // a binary heap of (cost, cell)
      const push = (c: number, k: number) => {
        let i = hc.length; hc.push(c); hk.push(k);
        while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= c) break; hc[i] = hc[p]; hk[i] = hk[p]; i = p; }
        hc[i] = c; hk[i] = k;
      };
      const pop = () => {
        const k0 = hk[0], c = hc.pop()!, k = hk.pop()!, n = hc.length;
        if (n) { let i = 0; for (;;) { let l = 2 * i + 1; if (l >= n) break; if (l + 1 < n && hc[l + 1] < hc[l]) l++; if (hc[l] >= c) break; hc[i] = hc[l]; hk[i] = hk[l]; i = l; } hc[i] = c; hk[i] = k; }
        return k0;
      };
      const s0 = s[0] * this.nz + s[1];
      g[s0] = 0; push(0, s0);
      while (hc.length) {
        const cur = pop();
        if (closed[cur]) continue; closed[cur] = 1;
        const ci = Math.floor(cur / this.nz), cj = cur % this.nz;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (!this.ok(ni, nj) || (di && dj && (!this.ok(ci + di, cj) || !this.ok(ci, cj + dj)))) continue;
          const n = ni * this.nz + nj, cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
          if (cost < g[n]) { g[n] = cost; from[n] = cur; push(cost, n); }
        }
      }
      tree = { s: s0, g, from };
    }
    if (this.trees.size >= 24) this.trees.delete(this.trees.keys().next().value!);    // (a few fixed points; never the start of every walk)
    this.trees.set(key, tree);
    return tree;
  }
  /** The tree from `a` grown now (a yard's gap, when the spots are built: not in the frame of the first person to come through). */
  prepare(a: Pt) { this.grow(a); }
  /**
   * `path(a, b)` for a walk that starts at one of a few fixed points: the tree of shortest routes from `a` is grown once and every `b`
   * is read from it (a search for each was 2-5 ms, with a Dibi's people coming and going all evening). The same routes, string-pulled alike.
   */
  treePath(a: Pt, b: Pt): Pt[] | null {
    if (this.clear(a, b)) return [a, b];
    const t = this.grow(a), e = this.snap(b);
    if (!t || !e) return null;
    const goal = e[0] * this.nz + e[1];
    if (t.g[goal] === Infinity) return null;
    const cells: Pt[] = [];
    for (let c = goal; c >= 0; c = t.from[c]) { cells.push(this.pt(Math.floor(c / this.nz), c % this.nz)); if (c === t.s) break; }
    cells.reverse();
    return this.pull(cells, a, b);
  }
}
