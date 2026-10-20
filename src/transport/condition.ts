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
  return { ...d, maxSpeed: d.maxSpeed * p.top, accel: d.accel * p.accel, reverseSpeed: d.reverseSpeed * Math.max(0.5, p.top) };
}

/** What is said when a hit carries the car into a worse band (or the same band: nothing), null for no message. */
export function bandWarning(before: number, after: number): string | null {
  const a = bandOf(before), b = bandOf(after);
  if (a === b) return null;
  return b === 'dead' ? 'Le moteur lâche : la voiture est en panne. Garage Modou, ou une dépanneuse.'
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
