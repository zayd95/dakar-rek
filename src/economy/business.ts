import type { GameState } from '../core/state';
import { CITY_DAY_MS } from '../core/clock';
import { ECONOMY } from './config';
import { ACTIVITIES, knownCount, multiplier, practise } from './polyvalence';
import { fcfaText } from './format';

/**
 * « Affaires »: a ladder of virtual ventures, from a bana-bana table to a big company. Pure logic (unit-tested).
 * - Several units of each tier; each unit owned makes the next one ×1.15 dearer (config.ts).
 * - Income accrues per in-game hour of PLAY, counted on `playedMs` only: nothing accrues offline, and changing the
 *   device clock changes nothing (played time only advances in the frame loop, ≤ 0.1 s per frame). At most
 *   `maxCatchUpHours` are counted at once. Income is counted continuously into `carry` and paid in hourly batches
 *   (one ledger line per in-game hour), scaled by the polyvalence multiplier at the time it is counted.
 * - Tier n needs n different activities ever practised and one unit of the tier below (money alone is not enough).
 * All ventures are fictional; no real brand or company.
 */
export interface Venture { id: string; name: string; what: string }
export const VENTURES: Venture[] = [
  { id: 'bana', name: 'Table de bana-bana', what: 'Arachides, cartes de recharge et petites choses, au coin de la rue' },
  { id: 'kiosque', name: 'Kiosque', what: 'Crédit téléphonique, café Touba et journaux' },
  { id: 'boutique', name: 'Boutique de quartier', what: 'Riz, huile, sucre, pain : le quartier passe chez toi' },
  { id: 'car_rapide', name: 'Car rapide', what: 'Une ligne, un chauffeur et un apprenti' },
  { id: 'restaurant', name: 'Restaurant', what: 'De la gargote à la grande salle : ceebu jën tous les midis' },
  { id: 'immeuble', name: 'Immeuble de rapport', what: 'Des appartements loués en ville' },
  { id: 'entreprise', name: 'Grande entreprise', what: 'Import-export, transport et chantiers (fictive)' },
];

/** One in-game hour = 1 real minute of played time (src/core/clock.ts). */
export const HOUR_MS = CITY_DAY_MS / 24;
const B = ECONOMY.business;
const tierIndex = (id: string) => B.tiers.findIndex(t => t.id === id);
export const ventureById = (id: string) => VENTURES.find(v => v.id === id);
export const ownedOf = (s: GameState, id: string) => s.data.business.owned[id] ?? 0;

/** Three significant digits (prices read like prices: 66 100 F, not 66 125 F). */
export function nice(n: number): number {
  if (n < 1000) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.round(n / p) * p;
}
/** Price of the next unit when `owned` are already owned. */
export const unitPrice = (id: string, owned: number) => { const t = B.tiers[tierIndex(id)]; return t ? nice(t.price * B.growth ** owned) : Infinity; };
export const nextPrice = (s: GameState, id: string) => unitPrice(id, ownedOf(s, id));
export const perHourOf = (id: string) => B.tiers[tierIndex(id)]?.perHour ?? 0;
/** Base income per in-game hour of everything owned (before the polyvalence multiplier). */
export const baseIncome = (s: GameState) => B.tiers.reduce((t, x) => t + x.perHour * ownedOf(s, x.id), 0);
/** Income per in-game hour now, with the polyvalence multiplier. */
export const incomePerHour = (s: GameState) => Math.round(baseIncome(s) * multiplier(s));
/** Value of the ventures: what their units cost. */
export const venturesValue = (s: GameState) => B.tiers.reduce((t, x) => { let v = 0; for (let k = 0; k < ownedOf(s, x.id); k++) v += unitPrice(x.id, k); return t + v; }, 0);
export const unitsOwned = (s: GameState) => B.tiers.reduce((t, x) => t + ownedOf(s, x.id), 0);

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
export function incomeLabel(s: GameState): string {
  const mine = [...VENTURES].reverse().filter(v => ownedOf(s, v.id) > 0);
  return `Revenus · ${mine[0]?.name ?? 'affaires'}${mine.length > 1 ? ` et ${mine.length - 1} autre${mine.length > 2 ? 's' : ''} affaire${mine.length > 2 ? 's' : ''}` : ''}`;
}

/**
 * Count income up to now (played time) and pay every full in-game hour since the last payout, in one batch.
 * Returns what was paid (0 between payouts). Owning nothing keeps both clocks on `playedMs`.
 */
export function accrue(s: GameState): number {
  const b = s.data.business, now = s.data.playedMs;
  if (b.clockMs > now) b.clockMs = now;                  // never count time that was not played
  if (b.payMs > now) b.payMs = now;
  const base = baseIncome(s);
  if (base <= 0) { b.clockMs = b.payMs = now; return 0; }
  const dt = Math.min(now - b.clockMs, B.maxCatchUpHours * HOUR_MS);
  b.carry += base * multiplier(s) * (dt / HOUR_MS);
  b.clockMs = now;
  const hours = Math.floor((now - b.payMs) / HOUR_MS);
  if (hours < 1) return 0;
  b.payMs += hours * HOUR_MS;
  const due = Math.floor(b.carry + 1e-6);               // float dust never costs the player a franc
  if (due <= 0) return 0;
  b.carry = Math.max(0, b.carry - due);
  const paid = s.addMoney(due, incomeLabel(s));
  b.earned += paid;
  return paid;
}

/** Buy one unit: income so far is counted at the old rate first; the purchase counts as commerce. */
export function buyVenture(s: GameState, id: string): boolean {
  if (cannotBuy(s, id)) return false;
  accrue(s);
  const price = nextPrice(s, id), v = ventureById(id)!;          // with nothing owned yet, accrue() put both clocks on now
  s.addMoney(-price, `Achat : ${v.name}`);
  s.data.business.owned[id] = ownedOf(s, id) + 1;
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
