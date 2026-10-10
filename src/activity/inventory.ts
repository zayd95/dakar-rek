import type { GameState } from '../core/state';

/**
 * What the player carries (fish to sell, a parcel, goods bought for the home…): item id → count.
 * Stored in the save counters under `inv:<id>` until the save schema gets its own inventory field (one migration with
 * the economy lane), so nothing is lost on reload meanwhile.
 */
export class Inventory {
  constructor(private state: GameState) {}
  count(id: string) { return this.state.data.counters['inv:' + id] ?? 0; }
  has(id: string, n = 1) { return this.count(id) >= n; }
  add(id: string, n: number) { const v = Math.max(0, this.count(id) + n); if (v) this.state.data.counters['inv:' + id] = v; else delete this.state.data.counters['inv:' + id]; }
  list(): { id: string; count: number }[] {
    return Object.entries(this.state.data.counters).filter(([k, v]) => k.startsWith('inv:') && v > 0).map(([k, v]) => ({ id: k.slice(4), count: v }));
  }
}
