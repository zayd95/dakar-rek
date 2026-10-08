import type { HubId, ActiveJob } from '../core/types';
import type { GameState } from '../core/state';
import { DONE_JOBS_MAX } from '../core/save';
import { ECONOMY } from './config';

/**
 * Tiak Tiak deliveries — data-driven routes and the pure job logic (no Three.js: unit-tested).
 * The courier walks for now (no driving physics). Places are found in the hub by interactable id fragment.
 * Client names and route texts are a PROVISIONAL DRAFT (fictional people; Habib to review).
 * Money is game money saved on this device: there is no shared or server economy yet.
 */
export interface Place { frag: string; name: string }
export interface Route {
  id: string; hub: HubId;
  from: Place; to: Place;
  /** What is carried (shown in the offer). */
  what: string;
  /** Only offered once this flag is set (a client's recommendation). */
  needFlag?: string;
}

/** Each hub's first client: met on the first delivery there, then recommends a better-paid run. */
export const CLIENTS: Partial<Record<HubId, { name: string; flag: string }>> = {
  pikine: { name: 'Awa, cliente du Café Touba', flag: 'tiak_client_pikine' },
  plateau: { name: 'M. Sarr, commerçant de Sandaga', flag: 'tiak_client_plateau' },
};

const P = {
  mame: { frag: ':gargote:', name: 'Gargote Mame Diarra' }, maiga: { frag: ':maiga:', name: 'Maïga du marché' },
  pathe: { frag: ':dibiterie:', name: 'Dibiterie Chez Pathé' }, garage: { frag: ':garage:', name: 'Garage Modou' },
  ecurie: { frag: ':ecurie', name: 'Écurie Baobab' }, arena: { frag: ':arena', name: 'Arène · làmb' },
  cafePk: { frag: ':cafe:', name: 'Café Touba · Parcelles' }, stationPk: { frag: ':station', name: 'Gare des cars rapides' },
  fatou: { frag: ':gargote:', name: 'Gargote Chez Fatou' }, medina: { frag: ':dibiterie:', name: 'Dibiterie de la Médina' },
  cafePl: { frag: ':cafe:', name: 'Café Touba · Sandaga' }, market: { frag: ':market', name: 'Étal de Sandaga' },
  stationPl: { frag: ':station', name: 'Gare des cars rapides' },
} satisfies Record<string, Place>;

export const ROUTES: Route[] = [
  { id: 'pk_mame_garage', hub: 'pikine', from: P.mame, to: P.garage, what: 'Plats du jour pour l’atelier' },
  { id: 'pk_mame_ecurie', hub: 'pikine', from: P.mame, to: P.ecurie, what: 'Repas des lutteurs' },
  { id: 'pk_maiga_cafe', hub: 'pikine', from: P.maiga, to: P.cafePk, what: 'Riz au poisson à emporter' },
  { id: 'pk_pathe_arena', hub: 'pikine', from: P.pathe, to: P.arena, what: 'Brochettes pour les gardiens' },
  { id: 'pk_maiga_station', hub: 'pikine', from: P.maiga, to: P.stationPk, what: 'Colis pour un chauffeur' },
  { id: 'pk_reco_cafe_arena', hub: 'pikine', from: P.cafePk, to: P.arena, what: 'Commande groupée (recommandée par Awa)', needFlag: 'tiak_client_pikine' },
  { id: 'pl_fatou_market', hub: 'plateau', from: P.fatou, to: P.market, what: 'Déjeuner des vendeurs' },
  { id: 'pl_fatou_station', hub: 'plateau', from: P.fatou, to: P.stationPl, what: 'Plats pour les apprentis' },
  { id: 'pl_medina_cafe', hub: 'plateau', from: P.medina, to: P.cafePl, what: 'Dibi à emporter' },
  { id: 'pl_cafe_station', hub: 'plateau', from: P.cafePl, to: P.stationPl, what: 'Thermos de café' },
  { id: 'pl_reco_medina_market', hub: 'plateau', from: P.medina, to: P.market, what: 'Commande de M. Sarr (recommandée)', needFlag: 'tiak_client_plateau' },
];

export const routeById = (id: string) => ROUTES.find(r => r.id === id);
export const routePay = (r: Route) => ECONOMY.tiak.pay[r.id] ?? 1000;

/** Offers in a hub: recommended (better-paid) runs first once unlocked. */
export function offers(s: GameState, hub: HubId): Route[] {
  const list = ROUTES.filter(r => r.hub === hub && (!r.needFlag || s.data.flags.includes(r.needFlag)));
  return [...list.filter(r => r.needFlag), ...list.filter(r => !r.needFlag)];
}

/** Pick-up places of a hub (each gets a "Livraisons Tiak Tiak" action). */
export const pickupFrags = (hub: HubId) => [...new Set(ROUTES.filter(r => r.hub === hub).map(r => r.from.frag))];

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
 * pays nothing. Late deliveries pay less, never a negative amount.
 */
export function completeJob(s: GameState, runId: string): Completion | null {
  const j = s.data.jobs, a = j.active;
  if (!a || a.runId !== runId || a.stage !== 'deliver' || j.done.includes(runId)) return null;
  const route = routeById(a.routeId);
  j.active = null;
  j.done.push(runId);
  if (j.done.length > DONE_JOBS_MAX) j.done.splice(0, j.done.length - DONE_JOBS_MAX);
  if (!route) return null;
  const late = s.data.playedMs - a.startedMs > a.limitMs;
  const pay = Math.max(0, Math.round(late ? a.pay * ECONOMY.tiak.latePayFactor : a.pay));
  const paid = s.addMoney(pay, `Livraison Tiak Tiak → ${route.to.name}${late ? ' (en retard)' : ''}`);
  s.adjust(ECONOMY.tiak.fatigue);
  s.count('livraisons'); s.count('actions');
  const client = CLIENTS[route.hub];
  let newClient: string | null = null;
  if (client && !s.data.flags.includes(client.flag)) { s.data.flags.push(client.flag); newClient = client.name; }
  return { runId, route, paid, late, newClient };
}
