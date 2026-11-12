import { BAYS, FRONT_YARD, LOT } from '../housing/villa';
import type { VillaHold } from './gate';

/**
 * LD2.0-D lane V-E: the villa's two parking bays (BAYS, src/housing/villa.ts). Pure, unit-tested; src/villa/module.ts offers « Garer à la villa »
 * at the wheel and puts the vehicle in the bay (src/transport/ownedModule.ts `parkAt`, saved like any parking spot).
 *
 *  - Offered to the villa's owner or renter, at the wheel of one of their own vehicles (never a dealer's car on trial, never the Tiak depot's
 *    lent motorbike), once it is in the front yard and nearly stopped.
 *  - The bays are the player's: a bay is taken only by another of the player's OWN vehicles parked in it (a car somebody else left there, or
 *    one drawn by the street, takes nothing). The vehicle goes to the free bay nearest to where it stands, its nose toward the house.
 */
export interface Bay { i: number; x: number; z: number; yaw: number }
/** The bays in the hub's coordinates. */
export const BAYS_HUB: readonly Bay[] = BAYS.map((b, i) => ({ i, x: LOT.cx + b.x, z: LOT.cz + b.z, yaw: b.yaw }));
/** A parked vehicle closer than this to a bay's centre takes it (m). */
export const BAY_TAKEN = 1.6;
/** Faster than this (m/s) the action waits for the vehicle to slow down. */
export const BAY_SLOW = 2.5;

/** In the villa's front yard (hub coordinates). */
export const inYard = (x: number, z: number) => {
  const px = x - LOT.cx, pz = z - LOT.cz;
  return px > FRONT_YARD.x0 && px < FRONT_YARD.x1 && pz > FRONT_YARD.z0 && pz < FRONT_YARD.z1;
};

/** The free bay nearest to (x, z), or null when both are taken; `mine`: where the player's OTHER vehicles stand parked in this hub. */
export function freeBay(x: number, z: number, mine: readonly { x: number; z: number }[]): Bay | null {
  let best: Bay | null = null, bd = Infinity;
  for (const b of BAYS_HUB) {
    if (mine.some(p => Math.hypot(p.x - b.x, p.z - b.z) < BAY_TAKEN)) continue;
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** Why « Garer à la villa » cannot be done now (greyed with this), null when it can; undefined: not offered at all here. */
export function parkWhy(o: { hold: VillaHold; own: boolean; inYard: boolean; speed: number; bay: Bay | null }): string | null | undefined {
  if (!o.own || !o.inYard || (o.hold !== 'owned' && o.hold !== 'rented')) return undefined;
  if (!o.bay) return 'Les deux places sont prises';
  if (Math.abs(o.speed) > BAY_SLOW) return 'Ralentis d’abord';
  return null;
}
