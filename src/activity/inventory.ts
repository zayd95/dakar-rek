import type { GameState } from '../core/state';

/**
 * What the player carries (fish to sell, a parcel, goods bought for the home…): item id → count.
 * Stored in the save's own `inventory` field (schema v5; older saves had it in the counters as `inv:<id>`, migrated by
 * src/core/save.ts). Furniture and other belongings with a place in the world are assets (src/economy/assets.ts).
 */
export class Inventory {
  constructor(private state: GameState) {}
  private get items() { return this.state.data.inventory; }
  count(id: string) { return this.items[id] ?? 0; }
  has(id: string, n = 1) { return this.count(id) >= n; }
  add(id: string, n: number) { const v = Math.max(0, Math.floor(this.count(id) + n)); if (v) this.items[id] = v; else delete this.items[id]; }
  list(): { id: string; count: number }[] {
    return Object.entries(this.items).filter(([, v]) => v > 0).map(([id, count]) => ({ id, count }));
  }
}
