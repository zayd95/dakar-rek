import type { HubId, SaveData } from '../core/types';
import { HUB_IDS } from '../core/types';
import type { GameState } from '../core/state';
import { addOwned, holds } from '../economy/assets';

/**
 * Owned vehicles: ownership is the generic asset model (src/economy/assets.ts — bought with `buyAsset`, listed in
 * « Biens », sold there); this file only keeps WHERE each owned vehicle is parked, keyed to its catalogue id, in the
 * save's counters (no schema change):
 *   `vehicle:<asset>:hub|x|z|yaw`
 * No record yet (bought from « Biens », or never driven): it waits at its dealer's kerb.
 */
/** 'tiak': the courier's basic motorbike, lent by the Tiak Tiak depot of each hub: always available, never bought, never sold. */
export type VehicleAsset = 'jakarta' | 'compacte' | 'teranga' | 'rafet' | 'berline' | 'tout_terrain' | 'gainde' | 'tiak';
export interface Parked { asset: VehicleAsset; hub: HubId; x: number; z: number; yaw: number }

const key = (id: VehicleAsset, f: string) => `vehicle:${id}:${f}`;

/** The player owns it (the asset model's word). */
export const ownsVehicle = (s: GameState, id: VehicleAsset) => id === 'tiak' || holds(s, id);

export function parked(data: SaveData, id: VehicleAsset): Parked | null {
  const c = data.counters, n = (f: string) => c[key(id, f)];
  if (typeof n('x') !== 'number' || typeof n('z') !== 'number') return null;
  return { asset: id, hub: HUB_IDS[Math.round(n('hub') ?? 0)] ?? 'pikine', x: n('x'), z: n('z'), yaw: n('yaw') ?? 0 };
}

/** Records where it is parked (bought and delivered, or left there by its driver). */
export function park(data: SaveData, p: Parked) {
  const c = data.counters;
  c[key(p.asset, 'hub')] = Math.max(0, HUB_IDS.indexOf(p.hub));
  c[key(p.asset, 'x')] = Math.round(p.x * 100) / 100; c[key(p.asset, 'z')] = Math.round(p.z * 100) / 100;
  c[key(p.asset, 'yaw')] = Math.round(p.yaw * 1000) / 1000;
}

/** Forget the parking spot (sold: a vehicle bought again is delivered at the dealer's kerb). */
export function unpark(data: SaveData, id: VehicleAsset) {
  for (const f of ['hub', 'x', 'z', 'yaw', 'seed']) delete data.counters[key(id, f)];
}

/**
 * The paint of a vehicle bought from the floor of a showroom is the one of the car the player chose (its kit seed): kept with the parking spot, `vehicle:<asset>:seed`.
 * A vehicle with no such counter (every one bought before, at the kerb) keeps its catalogue paint. Never set for a trial vehicle.
 */
export const paintSeed = (data: SaveData, id: VehicleAsset): number | null => { const v = data.counters[key(id, 'seed')]; return typeof v === 'number' && v > 0 ? v : null; };
export const setPaintSeed = (data: SaveData, id: VehicleAsset, seed: number) => { data.counters[key(id, 'seed')] = seed; };

/**
 * Vehicles that are not sold any more and what their owners' save turns into. `clando` (the old « Voiture d'occasion ») was retired when the
 * modern sedan `compacte` became the player's first car: nobody can buy it, but every owner keeps their car.
 */
export const LEGACY_VEHICLES: Readonly<Record<string, VehicleAsset>> = { clando: 'compacte' };

/**
 * A save that owns a retired vehicle gets its successor: the same asset (uid, what it was paid, its condition, the home it stands in…) under the new
 * catalogue id, and its parking spot under the new counters; nothing is charged, refunded or lost, and the wallet and the ledger are not touched.
 * Idempotent; if the save somehow holds both ids, the legacy one is left as it is rather than merged. Returns true when something was moved over.
 */
export function migrateLegacyVehicles(s: GameState): boolean {
  let moved = false;
  for (const [old, now] of Object.entries(LEGACY_VEHICLES)) {
    const list = s.data.assets.list, a = list.find(x => x.spec === old);
    if (!a || list.some(x => x.spec === now)) continue;
    a.spec = now; moved = true;
    if (a.paid > 0 && a.basis === undefined) a.basis = a.paid;                  // its worth stays what its owner paid: no windfall from the new entry's price
    const p = parked(s.data, old as VehicleAsset);
    if (p && !parked(s.data, now)) park(s.data, { ...p, asset: now });
    unpark(s.data, old as VehicleAsset);
  }
  return moved;
}

/**
 * Saves from before the asset model held the motorbike in a flag `asset:vehicle:moto_jakarta` and counters
 * `asset:moto_jakarta:hub|x|z|yaw|seed|price|at`. They get the `jakarta` asset at what they paid (never charged again)
 * and keep their parking spot; the old keys go. Returns true when something was moved over.
 */
export function migrateOwned(s: GameState): boolean {
  const d = s.data, flag = 'asset:vehicle:moto_jakarta', old = (f: string) => `asset:moto_jakarta:${f}`;
  if (!d.flags.includes(flag)) return false;
  const c = d.counters, num = (f: string) => (typeof c[old(f)] === 'number' ? c[old(f)] : undefined);
  if (!holds(s, 'jakarta')) addOwned(s, 'jakarta', num('price') ?? 75000);
  const x = num('x'), z = num('z');
  if (!parked(d, 'jakarta') && x !== undefined && z !== undefined) park(d, { asset: 'jakarta', hub: HUB_IDS[Math.round(num('hub') ?? 0)] ?? 'pikine', x, z, yaw: num('yaw') ?? 0 });
  d.flags.splice(d.flags.indexOf(flag), 1);
  for (const f of ['hub', 'x', 'z', 'yaw', 'seed', 'price', 'at']) delete c[old(f)];
  return true;
}
