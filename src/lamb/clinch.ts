/**
 * Làmb 2.0 — the empoignade (docs/LAMB2.md, spec 10 Oct. §10–11). Pure data and functions, tested in tests/lamb2.test.ts.
 *
 * Step 2 — the entry: how a grab becomes an empoignade decides who holds the better grip (« avantage de saisie »,
 * −100…100 for the one who grabbed). Grabbing a wrestler who staggers or who has just missed gives a strong grip; a
 * plain grab in neutral a small one; the balance each brings in, technique and force tilt it. The grip then weighs in
 * the empoignade until the next steps make it move (push, pull, pivot, change of grip).
 */
import { k, type Attributes } from './stand';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * How the empoignade started: a plain grab, a grab under a raised guard (hands up for strikes, the body is open), on an
 * opening (a missed or guarded big strike, a failed grab), on a wrestler who staggers, or a grab that landed after its
 * response window.
 */
export type Entry = 'neutral' | 'open' | 'stagger' | 'late' | 'guard';
export const ENTRY_BONUS: Record<Entry, number> = { neutral: 0, late: 10, guard: 12, open: 18, stagger: 32 };
export const ENTRY_TEXT: Record<Entry, string> = {
  neutral: 'Empoignade', late: 'Saisie réussie', guard: 'Saisi sous la garde', open: 'Saisie sur l’ouverture', stagger: 'Saisi pendant qu’il vacille',
};

export interface Grappler { balance: number; attrs: Attributes }

/** Grip advantage for `a`, who grabbed `d`, at the moment the empoignade starts (−80…80). */
export function entryGrip(entry: Entry, a: Grappler, d: Grappler): number {
  return clamp(15 + ENTRY_BONUS[entry] + (a.balance - d.balance) * 0.3
    + (k(a.attrs.technique) - k(d.attrs.technique)) * 60 + (k(a.attrs.force) - k(d.attrs.force)) * 30, -80, 80);
}

/**
 * Strength in the empoignade with strikes: effort (taps or the AI's push), endurance, the balance brought in and the
 * grip (`grip` is this wrestler's side of it: + when he holds the better grip). A strong grip is worth about three
 * seconds of tapping; it never decides alone.
 */
export function clinchPower(effort: number, stamina: number, balance: number, grip: number): number {
  return effort + stamina / 40 + clamp(balance, 0, 100) / 50 + clamp(grip, -100, 100) / 25;
}

/** Words for the grip from the player's side. */
export function gripWords(grip: number): string {
  const g = Math.round(grip);
  if (g >= 40) return 'Prise : gros avantage pour toi';
  if (g >= 12) return 'Prise : avantage pour toi';
  if (g > -12) return 'Prise : égale';
  if (g > -40) return 'Prise : avantage pour lui';
  return 'Prise : gros avantage pour lui';
}
