import type { GameState } from '../core/state';
import { ECONOMY } from './config';
import { VENTURES, type Venture } from './catalog';
import { ACTIVITIES, knownCount, multiplier, practise } from './polyvalence';
import { fcfaText } from './format';
import { HOUR_MS, accrue, addOwned, adRunning, assetsOf, incomeLabel as assetsIncomeLabel, nice, ownedCount, unitPrice } from './assets';

/**
 * « Affaires »: a ladder of virtual ventures, from a bana-bana table to a big company. Each unit is a business asset of
 * the generic ownership model (src/economy/assets.ts), which also counts their income. Pure logic (unit-tested).
 * - Several units of each tier; each unit owned makes the next one ×1.15 dearer (config.ts).
 * - Income accrues per in-game hour of PLAY, counted on `playedMs` only: nothing accrues offline, and changing the
 *   device clock changes nothing (played time only advances in the frame loop, ≤ 0.1 s per frame). At most
 *   `maxCatchUpHours` are counted at once. Income is counted continuously and paid in hourly batches (one ledger line
 *   per in-game hour), scaled by the polyvalence multiplier at the time it is counted (and the ad boost, assets.ts).
 * - Tier n needs n different activities ever practised and one unit of the tier below (money alone is not enough).
 * All ventures are fictional; no real brand or company.
 */
export { VENTURES, HOUR_MS, accrue, nice, unitPrice };
export type { Venture };
const B = ECONOMY.business;
const tierIndex = (id: string) => B.tiers.findIndex(t => t.id === id);
export const ventureById = (id: string) => VENTURES.find(v => v.id === id);
/** Units of a venture owned. */
export const ownedOf = (s: GameState, id: string) => ownedCount(s, id);
/** Units owned per venture id (debug, menus). */
export const ownedVentures = (s: GameState): Record<string, number> =>
  Object.fromEntries(VENTURES.map(v => [v.id, ownedOf(s, v.id)]).filter(([, n]) => (n as number) > 0));

export const nextPrice = (s: GameState, id: string) => unitPrice(id, ownedOf(s, id));
export const perHourOf = (id: string) => B.tiers[tierIndex(id)]?.perHour ?? 0;
/** Base income per in-game hour of everything owned (before the polyvalence multiplier). */
export const baseIncome = (s: GameState) => B.tiers.reduce((t, x) => t + x.perHour * ownedOf(s, x.id), 0);
/** Ventures' income per in-game hour now: polyvalence multiplier and ad boost included. */
export const incomePerHour = (s: GameState) => Math.round(baseIncome(s) * multiplier(s) * (adRunning(s) ? 1 + ECONOMY.property.adSpace.boost : 1));
/** Value of the ventures: what their units cost. */
export const venturesValue = (s: GameState) => assetsOf(s, 'business').reduce((t, a) => t + a.paid, 0);
export const unitsOwned = (s: GameState) => assetsOf(s, 'business').filter(a => a.how === 'owned').length;

/** What tier `id` needs beyond money: n activities ever practised, one unit of the tier below. */
export function requirement(id: string): { activities: number; below: Venture | null } {
  const i = tierIndex(id);
  return { activities: Math.min(ACTIVITIES.length, i + 1), below: i > 0 ? ventureById(B.tiers[i - 1].id)! : null };
}
/** Why the tier is still locked (null when unlocked). */
export function lockedWhy(s: GameState, id: string): string | null {
  if (tierIndex(id) < 0) return 'Inconnue';
  const r = requirement(id), n = knownCount(s), miss: string[] = [];
  if (n < r.activities) miss.push(r.activities > 1 ? `${r.activities} activités différentes pratiquées (${n}/${r.activities})` : 'une première activité (livraison, petit boulot…)');
  if (r.below && ownedOf(s, r.below.id) < 1) miss.push(`1 ${r.below.name.toLowerCase()}`);
  return miss.length ? 'À débloquer : ' + miss.join(' et ') : null;
}
export function cannotBuy(s: GameState, id: string): string | null {
  return lockedWhy(s, id) ?? (s.canAfford(nextPrice(s, id)) ? null : 'Pas assez d’argent');
}

/** Ledger label of an hourly payout: « Revenus · Kiosque », « Revenus · Boutique de quartier et 2 autres affaires ». */
export const incomeLabel = (s: GameState) => assetsIncomeLabel(s);

/** Buy one unit: income so far is counted at the old rate first; the purchase counts as commerce. */
export function buyVenture(s: GameState, id: string): boolean {
  if (cannotBuy(s, id)) return false;
  accrue(s);
  const price = nextPrice(s, id), v = ventureById(id)!;          // with nothing owned yet, accrue() put both clocks on now
  s.addMoney(-price, `Achat : ${v.name}`);
  addOwned(s, id, price);
  practise(s, 'commerce');
  s.count('affaires');
  return true;
}

/** Hint towards the first venture (jobs app, wallet). */
export function firstVentureHint(s: GameState): string | null {
  if (unitsOwned(s) > 0) return null;
  const v = VENTURES[0], why = lockedWhy(s, v.id);
  return `Première affaire : ${v.name}, ${fcfaText(nextPrice(s, v.id))} (appli Affaires du téléphone)${why ? '. ' + why : ''}.`;
}
