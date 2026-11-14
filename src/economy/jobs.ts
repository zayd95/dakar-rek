import type { HubId, ActiveJob } from '../core/types';
import type { GameState } from '../core/state';
import { DONE_JOBS_MAX, setJobPayCap } from '../core/save';
import { ECONOMY } from './config';
import { HUB_SHORT, ROUTES, TIAK_POINTS, payCap, pointAt, routeById, routePay, tiakOffers, type Route } from './tiakOffers';
export { P, ROUTES, deliveryHub, routeById, routePay, type Place, type Route } from './tiakOffers';
import { payPreview, workPay } from './polyvalence';

/**
 * Tiak Tiak deliveries — data-driven routes and the pure job logic (no Three.js: unit-tested).
 * The courier walks for now (no driving physics). Places are found in the hub by interactable id fragment.
 * The routes, the places of every district and the rolling board of offers are in src/economy/tiakOffers.ts.
 * Client names and route texts are a draft (fictional people; Habib to review the texts). The pay table (config.ts) is the game's own.
 * Money is game money saved on this device: there is no shared or server economy yet.
 */
/** A run restored from a save never carries more than its route pays (src/core/save.ts jobsOf). */
setJobPayCap(payCap);

/** Each hub's first client: met on the first delivery there, then recommends a better-paid run. */
export const CLIENTS: Partial<Record<HubId, { name: string; flag: string }>> = {
  pikine: { name: 'Awa, du Salon Awa', flag: 'tiak_client_pikine' },
  plateau: { name: 'M. Sarr, de Dakar Réparation', flag: 'tiak_client_plateau' },
};

/** Pay of a route if delivered now, on time, with the polyvalence multiplier (offers and the HUD line). */
export const payNow = (s: GameState, base: number) => payPreview(s, base, 'livraison');

/** The fixed routes of a hub (the regular clients of its pick-up points): recommended (better-paid) runs first once unlocked. */
export function offers(s: GameState, hub: HubId): Route[] {
  const list = ROUTES.filter(r => r.hub === hub && (!r.needFlag || s.data.flags.includes(r.needFlag)));
  return [...list.filter(r => r.needFlag), ...list.filter(r => !r.needFlag)];
}

/**
 * The board of a district now (the phone's « Tiak Tiak », and any pick-up point): the recommended run once unlocked, then the rolling offers of this city
 * hour (src/economy/tiakOffers.ts), every one leaving from `hub`. `skip`: runs just taken, replaced by the next of the stream.
 */
export function board(s: GameState, hub: HubId, day: number, hour: number, skip?: ReadonlySet<string>): Route[] {
  return [...ROUTES.filter(r => r.hub === hub && r.needFlag && s.data.flags.includes(r.needFlag)), ...tiakOffers(hub, day, hour, skip)];
}

/**
 * The counters of a hub, each with a "Livraisons Tiak Tiak" action (the board, parcels in hand at once): where its fixed routes leave from, and every
 * place that cooks (a courier's usual stop). A run of the board may leave from any delivery point of the district; it is picked up on arrival there.
 */
export const pickupFrags = (hub: HubId) => [...new Set([...ROUTES.filter(r => r.hub === hub).map(r => r.from.frag), ...TIAK_POINTS[hub].filter(p => p.kind === 'food' && !p.vtc).map(p => p.frag)])];
/** The hub's first counter as a sentence says it, with its district: « la Gargote Mame Diarra (Pikine) », « le Restaurant Le Pointe (Almadies) ». */
export function counterLine(hub: HubId): string | null {
  const frag = pickupFrags(hub)[0], p = frag ? pointAt(hub, frag) : undefined; if (!p) return null;
  const name = p.name.split(' · ')[0], art = /^(Gargote|Dibiterie|Maïga|Boutique|Place)/.test(name) ? 'la ' : /^(Restaurant|Café|Garage|Marché)/.test(name) ? 'le ' : '';
  return `${art}${name} (${HUB_SHORT[hub]})`;
}

/** Generous limit for a delivery leg of `distance` metres, in played milliseconds. */
export function deliveryLimitMs(distance: number): number {
  const t = ECONOMY.tiak;
  return Math.round(Math.max(t.minLimitS, (distance / t.walkSpeed) * t.limitSlack + t.limitBaseS) * 1000);
}

export function whyNot(s: GameState, r: Route): string | null {
  if (s.data.jobs.active) return 'Une livraison est déjà en cours';
  if (s.data.needs.energie < ECONOMY.tiak.minEnergy) return 'Trop fatigué';
  if (r.needFlag && !s.data.flags.includes(r.needFlag)) return 'Pas encore recommandé';
  return null;
}

/**
 * Accept a run. At the pick-up point the parcel is in hand at once (stage 'deliver', limit starts now);
 * from the phone the courier first goes to the pick-up point (stage 'pickup').
 */
export function acceptJob(s: GameState, routeId: string, atPickup: boolean, limitMs: number): ActiveJob | null {
  const r = routeById(routeId);
  if (!r || whyNot(s, r)) return null;
  const j = s.data.jobs;
  j.seq += 1;
  const runId = `${s.data.guestId.slice(0, 8)}-${j.seq}-${Math.floor(s.data.playedMs)}`;
  j.active = { runId, routeId, hub: r.hub, stage: atPickup ? 'deliver' : 'pickup', pay: routePay(r), startedMs: s.data.playedMs, limitMs: atPickup ? limitMs : 0 };
  return j.active;
}

/** Arrived at the pick-up point: the delivery leg (and its clock) starts. */
export function pickUp(s: GameState, limitMs: number): boolean {
  const a = s.data.jobs.active;
  if (!a || a.stage !== 'pickup') return false;
  a.stage = 'deliver'; a.startedMs = s.data.playedMs; a.limitMs = limitMs;
  return true;
}

/** Cancel: no payment, no fatigue, no flag. Cancelling twice (or with nothing running) does nothing. */
export function cancelJob(s: GameState): boolean {
  if (!s.data.jobs.active) return false;
  s.data.jobs.active = null;
  return true;
}

export const remainingMs = (s: GameState) => {
  const a = s.data.jobs.active;
  return a && a.stage === 'deliver' ? a.limitMs - (s.data.playedMs - a.startedMs) : Infinity;
};

export interface Completion { runId: string; route: Route; paid: number; late: boolean; newClient: string | null }

/**
 * Hand over the parcel. Pays once per run id: a run already completed (or not the one in progress, or cancelled)
 * pays nothing. Late deliveries pay less, never a negative amount, and never more than the route's own pay. The pay is scaled by polyvalence (a delivery counts).
 */
export function completeJob(s: GameState, runId: string): Completion | null {
  const j = s.data.jobs, a = j.active;
  if (!a || a.tour || a.runId !== runId || a.stage !== 'deliver' || j.done.includes(runId)) return null;   // a tour is handed over stop by stop (tour.ts)
  const route = routeById(a.routeId);
  j.active = null;
  j.done.push(runId);
  if (j.done.length > DONE_JOBS_MAX) j.done.splice(0, j.done.length - DONE_JOBS_MAX);
  if (!route) return null;
  const late = s.data.playedMs - a.startedMs > a.limitMs;
  const base = Math.min(a.pay, routePay(route));                        // never more than the route pays (a run restored from a save: src/core/save.ts caps it too)
  const pay = Math.max(0, workPay(s, late ? base * ECONOMY.tiak.latePayFactor : base, 'livraison'));
  const paid = s.addMoney(pay, `Livraison Tiak Tiak → ${route.to.name}${late ? ' (en retard)' : ''}`);
  s.adjust(ECONOMY.tiak.fatigue);
  s.count('livraisons'); s.count('actions');
  const client = CLIENTS[route.hub];
  let newClient: string | null = null;
  if (client && !s.data.flags.includes(client.flag)) { s.data.flags.push(client.flag); newClient = client.name; }
  return { runId, route, paid, late, newClient };
}
