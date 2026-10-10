import type { Collider } from './types';
import type { ShopAnchors, ShopRect } from './shopKit';

/**
 * Walking inside a stocked shop (spec 10 Oct, §31: customers enter → browse → buy → leave without the player). The city's
 * ambient people (src/social/ambientLife.ts) come in through the shop's door, stand at a display (`anchors.browse`),
 * queue at the counter (`anchors.queue`, the first place is the counter) and leave; their steps inside go around the
 * furniture on the grid planned here, over the shop's footprint and colliders (src/world/shopKit.ts). Pure: no Three.js.
 */
export interface Pt { x: number; z: number }
/** A stocked shop as the city's people see it: its place sheet key, kit anchors, footprint and colliders (world). */
export interface ShopInfo { key: string; type: string; anchors: ShopAnchors; bounds: ShopRect; colliders: readonly Collider[] }

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
    // string-pulling: keep a corner only where the straight line to the next one would cross the furniture
    const out: Pt[] = [a];
    let anchor = a;
    for (let k = 0; k < cells.length; k++) {
      const next = k + 1 < cells.length ? cells[k + 1] : b;
      if (!this.clear(anchor, next)) { out.push(cells[k]); anchor = cells[k]; }
    }
    out.push(b);
    return out;
  }
}
