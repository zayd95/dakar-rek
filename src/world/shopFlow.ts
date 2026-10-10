import type { Collider } from './types';
import type { ShopAnchors, ShopRect } from './shopKit';

/**
 * Customers of a shop (spec 10 Oct, §31): they come in from the street, look at a display, queue, buy at the counter
 * and leave — without the player. Pure logic (no rendering): positions, facing, pose and walking state that
 * src/game/shops.ts puts on humanoids. Paths are planned on a grid over the shop's footprint around its colliders
 * (src/world/shopKit.ts anchors: door, browse, queue, counter), so nobody walks through a shelf.
 */
export interface Pt { x: number; z: number }

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

export type CustomerState = 'away' | 'enter' | 'browse' | 'queue' | 'buy' | 'leave';
export interface Customer {
  id: number;
  state: CustomerState;
  x: number; z: number; yaw: number;
  /** Walking along `path` (else standing in its pose). */
  walking: boolean;
  pose: 'Idle' | 'Talk';
  /** Queue place held (0 = at the counter), -1 none. */
  slot: number;
  path: Pt[]; seg: number; t: number;
}
export interface FlowStats { entered: number; browsed: number; bought: number; left: number }

/**
 * The comings and goings of one shop. `update(dt, open, blocked)`: `open` lets new customers come in (opening hours);
 * `blocked(p)` tells when someone else (the player) stands on a spot, so customers wait their turn behind them.
 */
export class ShopFlow {
  readonly customers: Customer[] = [];
  readonly stats: FlowStats = { entered: 0, browsed: 0, bought: 0, left: 0 };
  private readonly out: Pt;
  constructor(readonly a: ShopAnchors, private readonly paths: ShopPaths, count: number, private readonly rand: () => number,
    o: { outside?: number; speed?: number } = {}) {
    const d = o.outside ?? 3.2;
    this.out = { x: a.door.x - Math.sin(a.door.yaw) * d, z: a.door.z - Math.cos(a.door.yaw) * d };
    this.speed = o.speed ?? 1.15;
    for (let i = 0; i < count; i++) this.customers.push({ id: i, state: 'away', x: this.out.x, z: this.out.z, yaw: a.door.yaw, walking: false, pose: 'Idle', slot: -1, path: [], seg: 0, t: 1 + i * 4 + rand() * 4 });
  }
  private readonly speed: number;

  private route(from: Pt, to: Pt): Pt[] { return this.paths.path(from, to) ?? [from, to]; }
  private go(c: Customer, path: Pt[]) { c.path = path; c.seg = 0; c.walking = path.length > 1; }
  private slotTaken(k: number, self: Customer) { return this.customers.some(o => o !== self && o.slot === k); }

  update(dt: number, open: boolean, blocked: (p: Pt) => boolean = () => false) {
    const a = this.a, q = a.queue;
    for (const c of this.customers) {
      if (c.walking) { this.walk(c, dt); if (c.walking) continue; }
      c.t -= dt;
      switch (c.state) {
        case 'away':
          if (c.t > 0 || !open) break;
          {
            const b = a.browse.length ? a.browse[Math.floor(this.rand() * a.browse.length) % a.browse.length] : q[q.length - 1];
            c.state = 'enter'; c.x = this.out.x; c.z = this.out.z; this.stats.entered++;
            this.go(c, [this.out, ...this.route(a.door, b)]);
            c.t = 0;
          }
          break;
        case 'enter': {                                                       // arrived at the display
          const b = this.nearest(a.browse, c) ?? c;
          c.state = 'browse'; c.yaw = 'yaw' in b ? (b as { yaw: number }).yaw : c.yaw; c.pose = 'Idle'; c.t = 4 + this.rand() * 6;
          break;
        }
        case 'browse':
          if (c.t > 0) break;
          if (!open) { this.leave(c); break; }
          {
            const k = q.findIndex((_, i) => !this.slotTaken(i, c));
            if (k < 0) { c.t = 2; break; }
            this.stats.browsed++;
            c.state = 'queue'; c.slot = k; this.go(c, this.route(c, q[k]));
          }
          break;
        case 'queue': {                                                       // at the queue place: move up or reach the counter
          c.yaw = q[c.slot].yaw; c.pose = 'Idle';
          if (c.slot > 0 && !this.slotTaken(c.slot - 1, c)) { c.slot--; this.go(c, this.route(c, q[c.slot])); break; }
          if (c.slot === 0 && !blocked(q[0])) { c.state = 'buy'; c.pose = 'Talk'; c.yaw = a.counter.yaw; c.t = 3 + this.rand() * 3; }
          break;
        }
        case 'buy':
          if (c.t > 0) break;
          this.stats.bought++;
          this.leave(c);
          break;
        case 'leave':                                                         // out in the street: gone for a while
          this.stats.left++;
          c.state = 'away'; c.slot = -1; c.t = 6 + this.rand() * 14;
          break;
      }
    }
  }
  private leave(c: Customer) { c.state = 'leave'; c.slot = -1; c.pose = 'Idle'; this.go(c, [...this.route(c, this.a.door), this.out]); }
  private nearest<T extends Pt>(list: readonly T[], p: Pt): T | null {
    let best: T | null = null, bd = Infinity;
    for (const s of list) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
    return bd < 0.8 ? best : null;
  }
  private walk(c: Customer, dt: number) {
    let left = this.speed * dt;
    while (left > 0 && c.seg < c.path.length - 1) {
      const b = c.path[c.seg + 1], dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
      if (d > 0.01) c.yaw = Math.atan2(dx, dz);
      if (d <= left) { c.x = b.x; c.z = b.z; c.seg++; left -= d; } else { c.x += (dx / d) * left; c.z += (dz / d) * left; left = 0; }
    }
    if (c.seg >= c.path.length - 1) c.walking = false;
  }
  /** Customers to draw (not away). */
  present() { return this.customers.filter(c => c.state !== 'away'); }
}
