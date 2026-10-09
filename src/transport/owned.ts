import type { HubId, SaveData } from '../core/types';
import { HUB_IDS } from '../core/types';

/**
 * Owned vehicles — a tiny adapter until the ownership lane's generic `Asset` store is merged. Everything lives in the
 * existing save fields (no schema change, no migration):
 *   flag     `asset:vehicle:<id>`              the player owns it
 *   counters `asset:<id>:hub|x|z|yaw|seed|price|at`   where it is parked, its look, what it cost, when it was bought
 * Mapping to the generic model: Asset { id, kind: 'vehicle', catalogue: id, price, location: { hub, x, z, yaw },
 * owner: the player, condition: 1 } — `toAsset()` returns exactly that, so the ownership lane can import it once.
 */
export type OwnedId = 'moto_jakarta' | 'car_sedan';
export type OwnedKind = 'moto' | 'car';
/** What each catalogue item is (the save stores only the id). */
export const OWNED_KIND: Record<OwnedId, OwnedKind> = { moto_jakarta: 'moto', car_sedan: 'car' };
export interface OwnedVehicle { id: OwnedId; kind: OwnedKind; seed: number; hub: HubId; x: number; z: number; yaw: number; price: number; at: number }

const flag = (id: OwnedId) => `asset:vehicle:${id}`;
const key = (id: OwnedId, f: string) => `asset:${id}:${f}`;

export function owns(data: SaveData, id: OwnedId) { return data.flags.includes(flag(id)); }

export function readOwned(data: SaveData, id: OwnedId): OwnedVehicle | null {
  if (!owns(data, id)) return null;
  const c = data.counters, n = (f: string, d = 0) => (typeof c[key(id, f)] === 'number' ? c[key(id, f)] : d);
  const hub = HUB_IDS[Math.round(n('hub'))] ?? 'pikine';
  return { id, kind: OWNED_KIND[id], seed: n('seed', 1), hub, x: n('x'), z: n('z'), yaw: n('yaw'), price: n('price'), at: n('at') };
}

/** Records the vehicle (ownership + where it is parked). */
export function writeOwned(data: SaveData, v: OwnedVehicle) {
  if (!data.flags.includes(flag(v.id))) data.flags.push(flag(v.id));
  const c = data.counters;
  c[key(v.id, 'hub')] = Math.max(0, HUB_IDS.indexOf(v.hub));
  c[key(v.id, 'x')] = Math.round(v.x * 100) / 100; c[key(v.id, 'z')] = Math.round(v.z * 100) / 100;
  c[key(v.id, 'yaw')] = Math.round(v.yaw * 1000) / 1000;
  c[key(v.id, 'seed')] = v.seed; c[key(v.id, 'price')] = v.price; c[key(v.id, 'at')] = v.at;
}

/** Only the parking spot changes (the vehicle was ridden and left somewhere else). */
export function parkOwned(data: SaveData, id: OwnedId, hub: HubId, x: number, z: number, yaw: number) {
  const v = readOwned(data, id); if (!v) return;
  writeOwned(data, { ...v, hub, x, z, yaw });
}

/** The generic Asset shape of the ownership lane (to import these records when its store lands). */
export function toAsset(v: OwnedVehicle) {
  return { id: v.id, kind: 'vehicle' as const, catalogue: v.id, price: v.price, location: { hub: v.hub, x: v.x, z: v.z, yaw: v.yaw }, owner: 'player', condition: 1, boughtAt: v.at };
}
