import type { HubId, Needs, SaveData } from './types';
import { clamp } from './rng';
import { newSave } from './save';

/** Personal played time drains needs; it only advances while the game is actively played. */
const DRAIN_PER_PLAYED_MIN: Needs = { faim: 1.6, energie: 0.9, moral: 0, social: 0.8, hygiene: 0.6 };

export class GameState {
  data: SaveData;
  constructor(data: SaveData = newSave()) { this.data = data; }

  get wallet() { return this.data.wallet; }
  canAfford(n: number) { return this.data.wallet >= n; }

  /** Guest-only local wallet. Transferable money will live in the server ledger (PENDING). */
  addMoney(n: number) { this.data.wallet = Math.max(0, Math.round(this.data.wallet + n)); }

  adjust(delta: Partial<Needs>) {
    for (const k of Object.keys(delta) as (keyof Needs)[]) this.data.needs[k] = clamp(this.data.needs[k] + (delta[k] ?? 0), 0, 100);
  }
  count(key: string, by = 1) { this.data.counters[key] = (this.data.counters[key] ?? 0) + by; }

  /** Advance personal played time by dtMs (real ms). */
  tick(dtMs: number) {
    this.data.playedMs += dtMs;
    const min = dtMs / 60000;
    const n = this.data.needs;
    for (const k of Object.keys(DRAIN_PER_PLAYED_MIN) as (keyof Needs)[]) n[k] = clamp(n[k] - DRAIN_PER_PLAYED_MIN[k] * min, 0, 100);
    // Mood drifts toward the average of the other needs.
    const target = (n.faim + n.energie + n.social + n.hygiene) / 4;
    n.moral = clamp(n.moral + (target - n.moral) * Math.min(1, min * 0.6), 0, 100);
  }

  /** Mood label used by the HUD. */
  mood(): 'au top' | 'bien' | 'bof' | 'mal' {
    const m = this.data.needs.moral;
    return m > 75 ? 'au top' : m > 50 ? 'bien' : m > 28 ? 'bof' : 'mal';
  }

  place(hub: HubId, x: number, z: number, yaw: number) { Object.assign(this.data, { hub, x, z, yaw }); }
}
