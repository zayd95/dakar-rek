import type { HubId } from '../core/types';
import { HUB_IDS } from '../core/types';
import type { GameState } from '../core/state';
import { holding } from '../economy/assets';
import { VEHICLE_ASSETS, isVehicleAsset, ownsVehicle, parked, type VehicleAsset } from './owned';

/**
 * Where the player's vehicles are, as the game really has them (the phone's « Mes véhicules », the maps' vehicle icons, « Localiser »): nothing here moves a vehicle or
 * invents a position. A bought vehicle is where its saved record says (src/transport/owned.ts), in whatever district; the one being driven is where the player is; the lent
 * Tiak Tiak motorbike is only ever the one standing in the loaded district (each depot lends one: its record in another district is not a place to send the player to).
 * The game has no « at the garage » state: a repair is done with the car standing in the bay, so a car there is simply parked, and one that will not start (condition 0) is
 * « en panne » where it stands.
 */
export type VehicleStatus = 'driven' | 'parked' | 'broken' | 'unknown';
export interface VehicleEntry {
  asset: VehicleAsset;
  /** The walking marker's id of this vehicle (src/main.ts guidePlace). */
  id: string;
  status: VehicleStatus;
  /** Lent by the Tiak Tiak depot (never the player's own). */
  lent: boolean;
  /** null: no position on record (bought from « Biens », not collected yet). */
  hub: HubId | null;
  x: number; z: number; yaw: number;
}
/** What the module of a model says about its own vehicle in the loaded district (src/transport/ownedModule.ts carNow): null when it is not standing there. */
export interface LiveVehicle { x: number; z: number; yaw: number; driving: boolean }

export const vehicleMarkId = (a: VehicleAsset) => `vehicle:${a}`;
/** The model a walking marker's id names, or null when it is not a vehicle's. */
export function vehicleOfMark(id: string | null | undefined): VehicleAsset | null {
  const a = id?.startsWith('vehicle:') ? id.slice(8) : '';
  return isVehicleAsset(a) ? a : null;
}
/** One pictogram per model, on the maps and in the list. */
export const VEHICLE_ICON: Record<VehicleAsset, string> = { jakarta: '🏍️', tiak: '🛵', compacte: '🚗', teranga: '🚗', rafet: '🚗', berline: '🚘', gainde: '🚙', tout_terrain: '🚙' };

/** One vehicle's whereabouts, or null when the player does not have it (or, for the lent motorbike, when none stands in the loaded district). */
export function vehicleEntry(s: GameState, a: VehicleAsset, hubNow: HubId | null, live: LiveVehicle | null): VehicleEntry | null {
  if (!ownsVehicle(s, a)) return null;
  const base = { asset: a, id: vehicleMarkId(a), lent: a === 'tiak' };
  const hp = holding(s, a)?.condition ?? 100;
  if (live && hubNow) return { ...base, status: live.driving ? 'driven' : hp <= 0 ? 'broken' : 'parked', hub: hubNow, x: live.x, z: live.z, yaw: live.yaw };
  if (base.lent) return null;
  const p = parked(s.data, a);
  if (!p || !HUB_IDS.includes(p.hub) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return { ...base, status: 'unknown', hub: null, x: 0, z: 0, yaw: 0 };
  return { ...base, status: hp <= 0 ? 'broken' : 'parked', hub: p.hub, x: p.x, z: p.z, yaw: p.yaw };
}
/** Every vehicle the player has, in the catalogue's order. */
export function vehicleEntries(s: GameState, hubNow: HubId | null, live: (a: VehicleAsset) => LiveVehicle | null): VehicleEntry[] {
  return VEHICLE_ASSETS.flatMap(a => vehicleEntry(s, a, hubNow, live(a)) ?? []);
}

export const STATUS_LABEL: Record<VehicleStatus, string> = { driven: 'En circulation', parked: 'Stationné', broken: 'En panne', unknown: 'Pas encore sorti' };

/** « Faire sonner »: from how far the horn of one's own parked vehicle answers (m), and how long before it can be asked again (s). */
export const RING_RANGE = 60, RING_COOLDOWN_S = 6;
/** Why the vehicle cannot be made to sound now (a short line), or null when it can. Only one's own vehicle, standing in the district the player is in, close by, on foot. */
export function cannotRing(e: VehicleEntry, hubNow: HubId | null, at: { x: number; z: number }, onFoot: boolean, sinceLast: number): string | null {
  if (e.status === 'driven') return 'Tu es au volant';
  if (e.status === 'unknown' || !e.hub) return 'Position inconnue';
  if (e.hub !== hubNow) return 'Trop loin : il est dans un autre quartier';
  if (!onFoot) return 'Descends d’abord';
  if (Math.hypot(e.x - at.x, e.z - at.z) > RING_RANGE) return `Trop loin : approche à moins de ${RING_RANGE} m`;
  if (sinceLast < RING_COOLDOWN_S) return 'Un instant…';
  return null;
}

/**
 * The name of the place each vehicle stands near, remembered on this device when it is parked (the places of a district are only known while it is the loaded one): the list
 * can then say « Almadies · près du Phare » for a car left in another district. A memory, not a position: it is only shown while the record it was written for has not moved,
 * and a device that never saw the car parked (an imported save) shows the district alone.
 */
const KEY = 'dakarrek.vehicles.where';
type Note = { hub: HubId; x: number; z: number; label: string };
export class WhereNotes {
  private notes: Partial<Record<VehicleAsset, Note>> = {};
  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null) {
    try { const v = JSON.parse(store?.getItem(KEY) ?? '{}'); if (v && typeof v === 'object') this.notes = v; } catch { /* none */ }
  }
  /** The label kept for this record, '' when none was kept or the vehicle has moved since. */
  get(e: VehicleEntry): string {
    const n = this.notes[e.asset];
    return n && typeof n.label === 'string' && n.hub === e.hub && Math.abs(n.x - e.x) < 0.5 && Math.abs(n.z - e.z) < 0.5 ? n.label : '';
  }
  set(e: VehicleEntry, label: string) {
    if (!e.hub || !label) return;
    const n = this.notes[e.asset];
    if (n && n.hub === e.hub && n.x === e.x && n.z === e.z && n.label === label) return;
    this.notes[e.asset] = { hub: e.hub, x: e.x, z: e.z, label };
    try { this.store?.setItem(KEY, JSON.stringify(this.notes)); } catch { /* this session only */ }
  }
}
