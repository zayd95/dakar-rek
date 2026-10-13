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
export type VehicleAsset = 'jakarta' | 'clando';
export interface Parked { asset: VehicleAsset; hub: HubId; x: number; z: number; yaw: number }

const key = (id: VehicleAsset, f: string) => `vehicle:${id}:${f}`;

/** The player owns it (the asset model's word). */
export const ownsVehicle = (s: GameState, id: VehicleAsset) => holds(s, id);

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
  for (const f of ['hub', 'x', 'z', 'yaw']) delete data.counters[key(id, f)];
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
