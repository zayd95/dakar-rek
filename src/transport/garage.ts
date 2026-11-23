import { FULL, workCost } from './condition';
import { ECONOMY } from '../economy/config';

/**
 * Garage Modou's repair service (Pass 3 · S3): the rules, pure and unit-tested. The garage module (garageModule.ts) plays them in the world: the apprentice walks to the
 * vehicle standing in the repair bay, inspects it, shows the quote, works on it for about half a minute and is paid once, at the end.
 */

/** Seconds of the apprentice's look at the vehicle before the quote is shown. */
export const INSPECT_SECONDS = 4;
/** The repair itself: three visible steps, about half a minute in all (the player is held at the bay for it, and can stop it at any moment: nothing is paid then). */
export const REPAIR_STEPS: readonly { label: string; seconds: number }[] = [
  { label: 'Lamine démonte et contrôle', seconds: 9 },
  { label: 'Il remplace les pièces', seconds: 14 },
  { label: 'Essai du moteur', seconds: 7 },
];
export const REPAIR_SECONDS = REPAIR_STEPS.reduce((t, s) => t + s.seconds, 0);

/** Under this many points lost the damage is cosmetic: the apprentice sets it right for nothing (a quote for 2 % of a motorbike is a nuisance, not a consequence). */
export const COSMETIC_LOSS = 3;
/** The least a real repair costs (the visit). */
export const MIN_JOB = 1000;

export interface Quote {
  /** Points of health missing (0–100). */
  lost: number;
  /** Francs, rounded to a price a person would say; 0 when free. */
  cost: number;
  /** A cosmetic touch-up, offered. */
  free: boolean;
  /** The partial repair (« remise en route »): back to ECONOMY.repair.partialTo for this, when the vehicle is below it; null otherwise. */
  partial: { to: number; cost: number } | null;
}

/**
 * What the repair costs, shown before anything is paid and charged exactly once at the end (src/transport/condition.ts `workCost`: priced by the damage, a dearer
 * car somewhat more): nothing for a touch-up, never under MIN_JOB. Below ECONOMY.repair.partialTo a partial repair is offered too: back on the road, not like new.
 */
export function garageQuote(price: number, hp: number): Quote {
  const lost = Math.max(0, Math.min(FULL, FULL - hp)), to = ECONOMY.repair.partialTo;
  if (lost < COSMETIC_LOSS) return { lost, cost: 0, free: true, partial: null };
  const cost = Math.max(MIN_JOB, workCost(price, lost));
  const partial = hp < to - 5 ? { to, cost: Math.max(MIN_JOB, workCost(price, to - hp)) } : null;
  return { lost, cost, free: cost === 0, partial: partial && partial.cost < cost ? partial : null };
}

/** Garage Modou works the hours of its owner's routine (src/social/routines.ts: 7–13 h and 15–19 h). */
export const GARAGE_HOURS: readonly (readonly [number, number])[] = [[7, 13], [15, 19]];
export const garageOpen = (hour: number): boolean => GARAGE_HOURS.some(([a, b]) => hour >= a && hour < b);
/** « à 15 h » or « demain à 7 h »: when the workshop works next. */
export function reopens(hour: number): string {
  for (const [a] of GARAGE_HOURS) if (hour < a) return `à ${a} h`;
  return `demain à ${GARAGE_HOURS[0][0]} h`;
}

/** The repair bay: a rectangle on the kerb in front of the workshop, `yaw` the heading of a vehicle parked in it (forward = (sin yaw, cos yaw)). */
export interface Bay { x: number; z: number; yaw: number; hl: number; hw: number }
/** A vehicle (its centre and heading) stands in the bay: centre inside it and lined up with it (either way round, within about 25°). */
export function inBay(bay: Bay, v: { x: number; z: number; yaw: number }): boolean {
  const dx = v.x - bay.x, dz = v.z - bay.z, fx = Math.sin(bay.yaw), fz = Math.cos(bay.yaw);
  const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
  if (Math.abs(along) > bay.hl || Math.abs(side) > bay.hw) return false;
  const d = Math.abs(Math.atan2(Math.sin(v.yaw - bay.yaw), Math.cos(v.yaw - bay.yaw)));
  return d < 0.45 || d > Math.PI - 0.45;
}
