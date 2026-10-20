import type { Collider } from './types';

/**
 * A small walking map for one NPC on one stretch of a hub (the dealership's hall and forecourt): a grid of cells, each free or blocked by a collider
 * (grown by the walker's radius), and A* over the free cells, then the path pulled straight where the way is clear. It is built when a walk is asked
 * (the cars on the floor come and go), costs a few thousand cells, and is pure so it can be unit-tested.
 */
export interface Area { x0: number; x1: number; z0: number; z1: number }
export interface Pt { x: number; z: number }

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(readonly area: Area, colliders: readonly Collider[], readonly radius = 0.45, readonly cell = 0.5) {
    this.cols = Math.max(1, Math.ceil((area.x1 - area.x0) / cell));
    this.rows = Math.max(1, Math.ceil((area.z1 - area.z0) / cell));
    this.blocked = new Uint8Array(this.cols * this.rows);
    const r = radius;
    for (const c of colliders) {
      if (c.x1 < area.x0 - r || c.x0 > area.x1 + r || c.z1 < area.z0 - r || c.z0 > area.z1 + r) continue;
      const i0 = Math.max(0, Math.floor((c.x0 - r - area.x0) / cell)), i1 = Math.min(this.cols - 1, Math.floor((c.x1 + r - area.x0) / cell));
      const j0 = Math.max(0, Math.floor((c.z0 - r - area.z0) / cell)), j1 = Math.min(this.rows - 1, Math.floor((c.z1 + r - area.z0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = area.x0 + (i + 0.5) * cell, z = area.z0 + (j + 0.5) * cell;
        if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) this.blocked[j * this.cols + i] = 1;
      }
    }
  }

  private idx(p: Pt) { return Math.max(0, Math.min(this.rows - 1, Math.floor((p.z - this.area.z0) / this.cell))) * this.cols + Math.max(0, Math.min(this.cols - 1, Math.floor((p.x - this.area.x0) / this.cell))); }
  private at(k: number): Pt { return { x: this.area.x0 + ((k % this.cols) + 0.5) * this.cell, z: this.area.z0 + (Math.floor(k / this.cols) + 0.5) * this.cell }; }
  /** Is this point on a free cell inside the area? */
  free(p: Pt) { return p.x >= this.area.x0 && p.x < this.area.x1 && p.z >= this.area.z0 && p.z < this.area.z1 && !this.blocked[this.idx(p)]; }
  /** The free cell nearest to `p` (a ring search), or null when none is near. */
  nearestFree(p: Pt, maxRings = 12): Pt | null {
    const c = this.idx(p), ci = c % this.cols, cj = Math.floor(c / this.cols);
    if (!this.blocked[c]) return this.at(c);
    for (let r = 1; r <= maxRings; r++) {
      let best = -1, bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
        const k = j * this.cols + i; if (this.blocked[k]) continue;
        const q = this.at(k), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return this.at(best);
    }
    return null;
  }
  /** A straight walk from a to b stays on free cells (sampled every quarter of a cell). */
  clear(a: Pt, b: Pt) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (this.cell * 0.4)));
    for (let k = 1; k < n; k++) if (!this.free({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })) return false;
    return true;
  }

  /** The way from `from` to `to` as points to walk through (the last is the free cell nearest the goal), or null when there is none. */
  path(from: Pt, to: Pt): Pt[] | null {
    const s = this.nearestFree(from), g = this.nearestFree(to); if (!s || !g) return null;
    const S = this.idx(s), G = this.idx(g);
    if (S === G) return [g];
    const n = this.cols * this.rows, cost = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const heap: [number, number][] = [];                                                    // [f, cell] binary min-heap
    const push = (f: number, k: number) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const gi = G % this.cols, gj = Math.floor(G / this.cols), h = (k: number) => Math.hypot((k % this.cols) - gi, Math.floor(k / this.cols) - gj);
    cost[S] = 0; push(h(S), S);
    while (heap.length) {
      const [, k] = pop(); if (done[k]) continue; done[k] = 1;
      if (k === G) break;
      const ki = k % this.cols, kj = Math.floor(k / this.cols);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ki + di, j = kj + dj; if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
        const m = j * this.cols + i; if (this.blocked[m] || done[m]) continue;
        if (di && dj && (this.blocked[kj * this.cols + i] || this.blocked[j * this.cols + ki])) continue;      // no cutting a corner
        const c = cost[k] + (di && dj ? 1.4142 : 1);
        if (c < cost[m]) { cost[m] = c; prev[m] = k; push(c + h(m), m); }
      }
    }
    if (!done[G]) return null;
    const cells: Pt[] = []; for (let k = G; k >= 0; k = prev[k]) cells.push(this.at(k));
    cells.reverse(); cells[0] = { x: s.x, z: s.z }; cells[cells.length - 1] = { x: g.x, z: g.z };
    // pull the path straight: from each point go as far ahead as the walk stays clear
    const out: Pt[] = []; let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1; while (b > a + 1 && !this.clear(cells[a], cells[b])) b--;
      out.push(cells[b]); a = b;
    }
    return out;
  }
}
