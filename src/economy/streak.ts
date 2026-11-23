import type { PlayDays, StreakState } from '../core/types';

/**
 * Days worked in a row (pure rules, unit-tested; the module is src/economy/streakModule.ts). A day counts when the player did one piece of real work in it: a
 * paid delivery, a VTC ride, a paid shift, an errand for a dealer, a real repayment, a bout. Greeting someone, opening a menu, or accepting a job and
 * dropping it does not count. Days are the PLAYER's days (« jours de jeu »): one more each time a city day begins while they play, or when they come back
 * on a later city day — so the 23 city days that go by while they sleep in real life neither break the run nor count for it.
 *
 *   – One day counts once. Two counted days are at least `minGapMs` of play apart, unless the second comes after a real absence (a job at 23:59 and
 *     another at 00:01 on the city clock make one day, not two).
 *   – One skipped day is forgiven (`grace`), given back at every full week.
 *   – Reaching 2, 3, 5 and 7 days opens small privileges (`perks`): other ways in, never the only one, never money, a car or a debt written off.
 */
export const STREAK = {
  minGapMs: 10 * 60_000,
  grace: 1,
  regrace: 7,
  milestones: [2, 3, 5, 7] as readonly number[],
};

/** The kinds of real work that count (for the checks and the log). */
export type WorkKind = 'tiak' | 'vtc' | 'job' | 'errand' | 'repay' | 'combat' | 'garage';

/** The player's day moves on when the city day has changed since it last did. True when it moved. */
export function advancePlay(p: PlayDays, cityDay: number): boolean {
  if (p.city === cityDay) return false;
  p.day += 1; p.city = cityDay;
  return true;
}

/** The run as it stands on the player's day `day`: 0 once more days were skipped than the grace forgives. */
export function currentRun(s: StreakState, day: number): number {
  if (s.last < 0 || s.run <= 0) return 0;
  return day - s.last - 1 <= s.grace ? s.run : 0;
}

export interface Credit {
  counted: boolean;
  /** Why not: already counted today, or too soon after the last counted day (the city's midnight in between). */
  why: 'counted' | 'already' | 'too-soon';
  run: number;
  /** The milestone reached now (2, 3, 5, 7), the first time ever for this one, a skipped day forgiven, a new run begun. */
  milestone: number | null; first: boolean; graceUsed: boolean; fresh: boolean;
}

/**
 * A piece of real work on the player's day `day`, at played time `playedMs`. `absentSince`: played time at which the player came back after a real
 * absence (the gap rule does not apply to the first work after it); Infinity when they have not been away.
 */
export function creditWork(s: StreakState, day: number, playedMs: number, absentSince = Infinity): Credit {
  const none = (why: Credit['why']): Credit => ({ counted: false, why, run: s.run, milestone: null, first: false, graceUsed: false, fresh: false });
  if (s.last === day) return none('already');
  const sameStay = absentSince === Infinity || s.lastMs >= absentSince;                     // the last counted day was in this same stay
  if (s.last >= 0 && sameStay && playedMs - s.lastMs < STREAK.minGapMs) return none('too-soon');
  const missed = s.last < 0 ? Infinity : day - s.last - 1;
  let graceUsed = false, fresh = false;
  if (missed <= 0) s.run += 1;
  else if (missed <= s.grace) { s.grace -= missed; s.run += 1; graceUsed = true; }
  else { s.run = 1; s.grace = STREAK.grace; fresh = true; }
  if (s.run % STREAK.regrace === 0) s.grace = Math.min(STREAK.grace, s.grace + 1);
  s.last = day; s.lastMs = playedMs; s.total += 1; s.best = Math.max(s.best, s.run);
  const milestone = STREAK.milestones.includes(s.run) ? s.run : null, first = milestone !== null && !s.seen.includes(milestone);
  if (first) s.seen.push(milestone!);
  return { counted: true, why: 'counted', run: s.run, milestone, first, graceUsed, fresh };
}

/** What a run of days opens (alternate ways in; a broken run closes them again until the next one reaches them). */
export interface Perks {
  /** 2 days: the dealers know the player (a warmer welcome). */
  known: boolean;
  /** 3 days: a road test drive of an affordable car (Sarr Auto, Ndiaye Auto) without the dealer's errands first; Pape Sarr's trust rises a little once. */
  cityTest: boolean;
  /** 5 days: a supervised road test of a Prestige Auto car (a short loop in the Almadies); Moussa Ndiaye recommends the player. */
  prestigeTest: boolean;
  /** 7 days: « travailleur fiable »: Modou treats the player as a trusted customer for his arrangements. */
  dependable: boolean;
}
export function perks(run: number): Perks {
  return { known: run >= 2, cityTest: run >= 3, prestigeTest: run >= 5, dependable: run >= 7 };
}
/** What each milestone opens, in the player's words (the celebration card and the « Profil » screen). */
export const PERK_TEXT: Record<number, string> = {
  2: 'Les vendeurs te reconnaissent : accueil plus chaleureux.',
  3: 'Essai sur route d’une citadine (Sarr Auto, Ndiaye Auto) sans attendre · un peu plus de confiance chez Pape Sarr.',
  5: 'Essai encadré d’une voiture de Prestige Auto (un petit tour aux Almadies) · Moussa Ndiaye te recommande.',
  7: 'Travailleur fiable : Modou te fait ses arrangements comme à un client de confiance.',
};

/** « 1 jour actif », « 3 jours d’affilée ». */
export function runLabel(run: number): string {
  return run <= 0 ? 'Aucun jour actif' : run === 1 ? '1 jour actif' : `${run} jours d’affilée`;
}

/** The run as it stands today, from a save. */
export const runOf = (d: { streak: StreakState; play: PlayDays }) => currentRun(d.streak, d.play.day);
