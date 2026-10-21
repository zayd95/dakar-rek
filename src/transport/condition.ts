import type { DriveSpec } from './spec';
import { ECONOMY } from '../economy/config';

/**
 * A car's condition, 0–100 % (Pass 3, pure rules, unit-tested): a light contact does nothing, a real impact costs a few points to a lot, a worn car
 * is slower, a dead one does not start; the garage inspects it, quotes the repair before anything is paid, and a tow or a makeshift fix means a
 * broken car is never the end of the game. Full health changes nothing of the driving (the physics of src/transport/drive.ts are untouched).
 * The condition is the asset model's own `condition` (src/economy/assets.ts, saved with the asset, 100 when a save has none: every car bought before this
 * existed is whole); a dealer's test vehicle is not an asset, so it never saves one.
 */
export const FULL = 100;
/** Below this contact speed (m/s) a touch is a tap and costs nothing (the same line as the sound's: src/transport/vehicleAudio.ts IMPACT_SPEED). */
export const TAP_SPEED = 2.5;
/** At most one damaging contact in this many seconds (pushing against a wall is one hit, not sixty). */
export const CONTACT_GAP = 0.8;
/** The biggest single impact, in points. */
export const MAX_HIT = 35;

/** Points lost in a contact at `speed` (m/s): none for a tap, then a steady climb (about 5 at 6 m/s, 14 at 10, 24 at 14), capped. */
export function damageOf(speed: number): number {
  const v = Math.abs(speed);
  if (v < TAP_SPEED) return 0;
  return Math.min(MAX_HIT, Math.round(0.9 * Math.pow(v - TAP_SPEED, 1.35) * 10) / 10);
}

export type Band = 'whole' | 'worn' | 'rough' | 'poor' | 'dead';
/** Whole above 70 %, worn to 40, rough to 20, poor above 0, dead at 0. */
export function bandOf(hp: number): Band { return hp >= 70 ? 'whole' : hp >= 40 ? 'worn' : hp >= 20 ? 'rough' : hp > 0 ? 'poor' : 'dead'; }
export const BAND_LABEL: Record<Band, string> = { whole: 'Bon état', worn: 'Un peu usée', rough: 'Fatiguée', poor: 'Très abîmée', dead: 'En panne' };

/** What the condition does to the driving: the top speed and the pick-up are scaled (1 when whole), a dead car has none. */
export function performance(hp: number): { top: number; accel: number } {
  switch (bandOf(hp)) {
    case 'whole': return { top: 1, accel: 1 };
    case 'worn': return { top: 0.88, accel: 0.9 };
    case 'rough': return { top: 0.72, accel: 0.75 };
    case 'poor': return { top: 0.5, accel: 0.55 };
    default: return { top: 0, accel: 0 };
  }
}
/** The drive spec of a car in this condition (the same object, untouched, when whole). */
export function scaledDrive(d: DriveSpec, hp: number): DriveSpec {
  if (hp >= 70) return d;
  const p = performance(hp);
  // a dead car has no top speed at all, but never exactly 0: driveStep divides by it (0 / 0 would put NaN in the car's position)
  return { ...d, maxSpeed: Math.max(0.01, d.maxSpeed * p.top), boostSpeed: d.boostSpeed === undefined ? undefined : Math.max(0.01, d.boostSpeed * p.top), accel: d.accel * p.accel, reverseSpeed: p.top === 0 ? 0 : d.reverseSpeed * Math.max(0.5, p.top) };
}

/** What is said when a hit carries the car into a worse band (or the same band: nothing), null for no message. */
export function bandWarning(before: number, after: number): string | null {
  const a = bandOf(before), b = bandOf(after);
  if (a === b) return null;
  return b === 'dead' ? 'Le moteur lâche : la voiture est en panne. Réparation de fortune sur place, ou Garage Modou.'
    : b === 'poor' ? 'Ça fume, la voiture est très abîmée : elle ne roule plus qu’au ralenti.'
    : b === 'rough' ? 'La voiture est fatiguée : moins de reprise, moins de vitesse.'
    : 'La voiture a pris des coups : elle est un peu usée.';
}

/**
 * The repair quote, in francs, for a car worth `price` at `hp` %: the asset model's own rule (src/economy/assets.ts `repairCost`: a share of the price per missing
 * point, 10 % for a wreck), nothing when whole. The garage shows it before anything is paid and charges exactly it.
 */
export function repairQuote(price: number, hp: number): number {
  const lost = Math.max(0, Math.min(FULL, FULL - hp));
  return lost < 0.5 ? 0 : Math.round(price * ECONOMY.property.repairPerPoint * lost);
}

/** The tow to the garage: a flat fee, or free when the wallet cannot pay it (Modou: « tu me paieras plus tard »): a broken car never locks the player out. */
export const TOW_FEE = 5000;
export const towFee = (wallet: number): number => (wallet >= TOW_FEE ? TOW_FEE : 0);
/** The makeshift fix: free, always offered to a car below this, and only lifts it back to it (enough to crawl, not to drive well). */
export const LIMP_HP = 15;
export const canMakeshift = (hp: number): boolean => hp < LIMP_HP;

/** Points lost by a contact: a head-on one costs `damageOf(speed)`, a glancing one 60 % of it (the same ratio as the sound and the shake), one decimal. */
export const hitDamage = (speed: number, headOn: boolean): number => Math.round(damageOf(speed) * (headOn ? 1 : 0.6) * 10) / 10;

/** How loudly the card speaks: 0 healthy (70 % and up: a discreet figure), 1 worn (under 70), 2 bad (under 30), 3 dead (0). */
export function warnLevel(hp: number): 0 | 1 | 2 | 3 { return hp <= 0 ? 3 : hp < 30 ? 2 : hp < 70 ? 1 : 0; }
/** The discreet figure shown on the vehicle card (nothing for a vehicle in perfect condition). */
export const healthTag = (hp: number): string => (hp >= 100 ? '' : `${Math.round(hp)} %`);
/** The warning line of the card (null while healthy): clearer under 70 % and under 30 %, and for a dead car. */
export function healthAlert(hp: number): string | null {
  switch (warnLevel(hp)) {
    case 0: return null;
    case 1: return `Abîmée · ${Math.round(hp)} % · moins de vitesse et de reprise`;
    case 2: return `Très abîmée · ${Math.round(hp)} % · elle n’ira plus loin : Garage Modou`;
    default: return 'En panne · elle ne démarre plus';
  }
}

/** The roadside fix (« réparation de fortune »): the time it takes at the bonnet, in seconds, and what the car is lifted to (never above LIMP_HP, never lowered). */
export const ROADSIDE_SECONDS = 12;
export const roadsideResult = (hp: number): number => (canMakeshift(hp) ? LIMP_HP : hp);
/** How close to the front of the car the player must stand to work on it (m). */
export const ROADSIDE_REACH = 2.6;
