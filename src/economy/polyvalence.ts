import type { GameState } from '../core/state';
import type { ActivityId, SaveData } from '../core/types';
import type { ActivityCategory } from '../activity/types';
import { ACTIVITY_IDS } from '../core/types';
import { CITY_DAY_MS } from '../core/clock';
import { ECONOMY } from './config';
import { times } from './format';

/**
 * Polyvalence: « ceux qui ont beaucoup d'activités, c'est important » (Habib). The categories of activity the player
 * practised within the last 3 in-game days of play raise every job pay and the ventures' income. Pure logic (unit-tested).
 * Activities played by the activity framework report their `category` through applyEffects (src/activity/effects.ts,
 * `fromCategory`); older content is read from what already exists (action ids, places, counters).
 */
export const ACTIVITIES = ACTIVITY_IDS;
export type Activity = ActivityId;

export const ACTIVITY_INFO: Record<Activity, { label: string; where: string }> = {
  livraison: { label: 'Livraisons', where: 'Tiak Tiak à Pikine et au Plateau' },
  service: { label: 'Petits boulots', where: 'Services payés des commerces (appli Travail)' },
  commerce: { label: 'Commerce', where: 'Vendre à Sandaga, acheter un meuble ou une affaire' },
  combat: { label: 'Lutte', where: 'Écurie et arène de Pikine' },
  peche: { label: 'Pêche', where: 'Soumbédioune (Corniche) et le port de pêche' },
  artisanat: { label: 'Artisanat', where: 'Ateliers de Soumbédioune, couture, Garage Modou' },
  social: { label: 'Vie sociale', where: 'Discuter, histoires et moments partagés' },
};

/** Played time over which a category stays « recent ». */
export const WINDOW_MS = ECONOMY.polyvalence.windowDays * CITY_DAY_MS;

/** Paid city actions by id (other paid actions are « petits boulots »). */
const BY_ID: Record<string, Activity> = {
  vendre: 'commerce',
  pecheurs: 'peche', pirogue: 'peche', debarquement: 'peche', filets: 'peche', 'poisson-service': 'peche',
  atelier: 'artisanat', couture: 'artisanat', meca: 'artisanat', meca_conf: 'artisanat',
};
/** …then by place (interactable id fragment), so new work added at these places is counted the same way. */
const BY_PLACE: [string, Activity][] = [[':soumbedioune', 'peche'], [':fish-market', 'peche'], [':port', 'peche'], [':craft', 'artisanat'], [':garage', 'artisanat'], [':market', 'commerce']];

/** Polyvalence category of an activity-framework category (leisure, prayer and travel do not count). */
export const fromCategory = (c: ActivityCategory | null | undefined): Activity | null =>
  c && (ACTIVITIES as readonly string[]).includes(c) ? c as Activity : null;

/** Category of a finished city action, or null (meals, rest and leisure are not activities). */
export function activityOf(a: { id: string; gain?: number; counter?: string }, placeId = ''): Activity | null {
  if (a.gain) return BY_ID[a.id] ?? BY_PLACE.find(([f]) => placeId.includes(f))?.[1] ?? 'service';
  return a.counter === 'chats' ? 'social' : null;
}

const c = (d: SaveData, k: string) => d.counters[k] ?? 0;
const sumKeys = (d: SaveData, test: (k: string) => boolean) => Object.entries(d.counters).reduce((t, [k, v]) => (test(k) ? t + v : t), 0);
/**
 * Activities other modules only leave as counters: làmb bouts and training, story beats, situations, introductions,
 * chats. A rise of the signature means the activity was practised (Economy watches it; nothing to call elsewhere).
 */
export const SIGNS: [Activity, (d: SaveData) => number][] = [
  ['combat', d => c(d, 'combats') + c(d, 'lutte') + c(d, 'lamb_skill')],
  ['social', d => c(d, 'chats') + Object.keys(d.beats).length + sumKeys(d, k => (k.startsWith('sit_') && k.endsWith('_n')) || k.startsWith('intro_'))],
];
export const signature = (d: SaveData) => SIGNS.map(([, f]) => f(d));
/** Records the activities whose signature rose since `prev`; returns the new signature. */
export function noticeActivities(s: GameState, prev: number[]): number[] {
  const now = signature(s.data);
  SIGNS.forEach(([a], i) => { if (now[i] > (prev[i] ?? Infinity)) practise(s, a); });
  return now;
}

/** The player practised `a` now (played time). */
export function practise(s: GameState, a: Activity) {
  const d = s.data.activities;
  d.last[a] = s.data.playedMs;
  if (!d.known.includes(a)) d.known = ACTIVITIES.filter(x => x === a || d.known.includes(x));   // same order as the save
}
export const isRecent = (s: GameState, a: Activity) => {
  const t = s.data.activities.last[a];
  return t !== undefined && s.data.playedMs - t <= WINDOW_MS;
};
/** Recent categories, counting `extra` as if practised now (the pay preview of a job about to be done). */
export const recentActivities = (s: GameState, extra?: Activity | null) => ACTIVITIES.filter(a => a === extra || isRecent(s, a));
export const polyvalence = (s: GameState, extra?: Activity | null) => recentActivities(s, extra).length;
export const knownCount = (s: GameState) => ACTIVITIES.filter(a => s.data.activities.known.includes(a)).length;
/** ×1 for one activity, +20 % for each other one, capped at ×2. */
export const multiplierFor = (n: number) => Math.min(ECONOMY.polyvalence.cap, Math.round((1 + ECONOMY.polyvalence.step * Math.max(0, n - 1)) * 100) / 100);
export const multiplier = (s: GameState, extra?: Activity | null) => multiplierFor(polyvalence(s, extra));
/** Played time left before a recent category stops counting (ms, 0 when not recent). */
export const timeLeft = (s: GameState, a: Activity) => (isRecent(s, a) ? WINDOW_MS - (s.data.playedMs - s.data.activities.last[a]!) : 0);

/** Pay of a piece of work of category `a`, if done now (the category counts at once). */
export const payPreview = (s: GameState, base: number, a: Activity | null) => Math.round(base * multiplier(s, a));
/** Work finished: records its category and returns its pay scaled by the polyvalence multiplier. */
export function workPay(s: GameState, base: number, a: Activity | null): number {
  if (a) practise(s, a);
  return Math.round(base * multiplier(s));
}

/** One line for the player: « Polyvalence : 4 activités → revenus ×1,6 ». */
export function polyLine(s: GameState): string {
  const n = polyvalence(s);
  return `Polyvalence : ${n} activité${n > 1 ? 's' : ''} → revenus ${times(multiplierFor(n))}`;
}
