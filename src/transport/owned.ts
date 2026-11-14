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
/**
 * Every vehicle the player can have, cheapest first: THE list (the road swap, the phone's « Mes véhicules », the maps and the tests read this one; src/transport/fleet.ts
 * has the module of each). 'tiak': the courier's basic motorbike, lent by the Tiak Tiak depot of each hub: always available, never bought, never sold.
 */
export const VEHICLE_ASSETS = ['jakarta', 'teranga', 'rafet', 'compacte', 'berline', 'gainde', 'tout_terrain', 'tiak'] as const;
export type VehicleAsset = (typeof VEHICLE_ASSETS)[number];
export const isVehicleAsset = (id: string): id is VehicleAsset => (VEHICLE_ASSETS as readonly string[]).includes(id);
export interface Parked { asset: VehicleAsset; hub: HubId; x: number; z: number; yaw: number }

const key = (id: VehicleAsset, f: string) => `vehicle:${id}:${f}`;

/**
 * The district of a record whose `hub` counter is missing or is not a district of this build (a save from before the districts, a newer client's district): the one every game
 * starts in, where the first dealer is. One rule for reading and writing, here and in the migrations below.
 */
export const FALLBACK_HUB: HubId = 'pikine';
/** The district a stored `hub` counter names. */
export function hubOfCounter(n: unknown): HubId { return (typeof n === 'number' && Number.isFinite(n) ? HUB_IDS[Math.round(n)] : undefined) ?? FALLBACK_HUB; }
/** The `hub` counter of a district. */
export function counterOfHub(hub: HubId): number { const i = HUB_IDS.indexOf(hub); return i >= 0 ? i : HUB_IDS.indexOf(FALLBACK_HUB); }

/** The player owns it (the asset model's word). */
export const ownsVehicle = (s: GameState, id: VehicleAsset) => id === 'tiak' || holds(s, id);

export function parked(data: SaveData, id: VehicleAsset): Parked | null {
  const c = data.counters, n = (f: string) => c[key(id, f)];
  if (typeof n('x') !== 'number' || typeof n('z') !== 'number') return null;
  return { asset: id, hub: hubOfCounter(n('hub')), x: n('x'), z: n('z'), yaw: n('yaw') ?? 0 };
}

/** Records where it is parked (bought and delivered, or left there by its driver). */
export function park(data: SaveData, p: Parked) {
  const c = data.counters;
  c[key(p.asset, 'hub')] = counterOfHub(p.hub);
  c[key(p.asset, 'x')] = Math.round(p.x * 100) / 100; c[key(p.asset, 'z')] = Math.round(p.z * 100) / 100;
  c[key(p.asset, 'yaw')] = Math.round(p.yaw * 1000) / 1000;
}

/** Forget the parking spot (sold: a vehicle bought again is delivered at the dealer's kerb). */
export function unpark(data: SaveData, id: VehicleAsset) {
  for (const f of ['hub', 'x', 'z', 'yaw', 'seed']) delete data.counters[key(id, f)];
}

/**
 * A vehicle that is no longer the player's has no parking spot: sold from « Biens » while it stood in another district, its record went nowhere (the module only cleared it when
 * the vehicle was in the loaded district), and the one bought again reappeared at the old spot. Returns true when a record was dropped.
 */
export function forgetIfSold(s: GameState, id: VehicleAsset): boolean {
  if (ownsVehicle(s, id) || !(key(id, 'x') in s.data.counters || key(id, 'seed') in s.data.counters)) return false;
  unpark(s.data, id); return true;
}

/**
 * The player has crossed the middle of a road between two districts (src/main.ts corridorSwap): the district at the other end becomes the loaded one, its frame being this one's
 * moved by (dx, dz). Every vehicle left parked out on that road (outside the streets of `from`: `inDistrict` is false there) is re-homed to the new frame, at the same place of
 * the world. Every model, the lent motorbike included.
 */
export function rehomeOnRoad(data: SaveData, from: HubId, to: HubId, dx: number, dz: number, inDistrict: (x: number, z: number) => boolean): VehicleAsset[] {
  const moved: VehicleAsset[] = [];
  for (const a of VEHICLE_ASSETS) {
    const p = parked(data, a);
    if (!p || p.hub !== from || inDistrict(p.x, p.z)) continue;
    park(data, { ...p, hub: to, x: p.x + dx, z: p.z + dz }); moved.push(a);
  }
  return moved;
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
  if (!parked(d, 'jakarta') && x !== undefined && z !== undefined) park(d, { asset: 'jakarta', hub: hubOfCounter(num('hub')), x, z, yaw: num('yaw') ?? 0 });
  d.flags.splice(d.flags.indexOf(flag), 1);
  for (const f of ['hub', 'x', 'z', 'yaw', 'seed', 'price', 'at']) delete c[old(f)];
  return true;
}
