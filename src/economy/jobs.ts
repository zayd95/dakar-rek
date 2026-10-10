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
  pikine: { name: 'Awa, du Salon Awa', flag: 'tiak_client_pikine' },
  plateau: { name: 'M. Sarr, de Dakar Réparation', flag: 'tiak_client_plateau' },
};

/**
 * Pick-ups and drop-offs are existing places of the city (gargotes, dibiteries, the Maïga, Boutique Diallo, Salon Awa,
 * the Banque Teranga agencies, the squares, Sandaga, Atelier Ndeye, Dakar Réparation): no new points are invented.
 * `frag` matches the place's interactable id (src/world/builder.ts kiosks, src/world/city.ts places).
 */
const P = {
  mame: { frag: ':gargote:', name: 'Gargote Mame Diarra' }, maiga: { frag: ':maiga:', name: 'Maïga du marché' },
  pathe: { frag: ':dibiterie:', name: 'Dibiterie Chez Pathé' }, garage: { frag: ':garage:', name: 'Garage Modou' },
  diallo: { frag: ':city:boutique', name: 'Boutique Diallo' }, salonAwa: { frag: ':city:salon-tech', name: 'Salon Awa' },
  bankPk: { frag: ':city:bank', name: 'Banque Teranga · Pikine' }, squarePk: { frag: ':city:square', name: 'Grand-place de Pikine' },
  fatou: { frag: ':gargote:', name: 'Gargote Chez Fatou' }, medina: { frag: ':dibiterie:', name: 'Dibiterie de la Médina' },
  market: { frag: ':market', name: 'Étal de Sandaga' }, bankPl: { frag: ':city:bank', name: 'Banque Teranga · Plateau' },
  ndeye: { frag: ':city:boutique', name: 'Atelier Ndeye · couture' }, reparation: { frag: ':city:salon-tech', name: 'Dakar Réparation' },
  squarePl: { frag: ':city:square', name: 'Place de la Médina' },
} satisfies Record<string, Place>;

export const ROUTES: Route[] = [
  { id: 'pk_mame_boutique', hub: 'pikine', from: P.mame, to: P.diallo, what: 'Plats du jour pour la famille de Mamadou' },
  { id: 'pk_mame_bank', hub: 'pikine', from: P.mame, to: P.bankPk, what: 'Déjeuner de l’accueil de l’agence' },
  { id: 'pk_boutique_salon', hub: 'pikine', from: P.diallo, to: P.salonAwa, what: 'Pain et lait pour le salon' },
  { id: 'pk_pathe_square', hub: 'pikine', from: P.pathe, to: P.squarePk, what: 'Brochettes pour la partie de dames' },
  { id: 'pk_maiga_garage', hub: 'pikine', from: P.maiga, to: P.garage, what: 'Riz au poisson pour l’atelier' },
  { id: 'pk_reco_salon_bank', hub: 'pikine', from: P.salonAwa, to: P.bankPk, what: 'Commande groupée (recommandée par Awa)', needFlag: 'tiak_client_pikine' },
  { id: 'pl_fatou_market', hub: 'plateau', from: P.fatou, to: P.market, what: 'Déjeuner des vendeurs' },
  { id: 'pl_fatou_bank', hub: 'plateau', from: P.fatou, to: P.bankPl, what: 'Plats pour l’agence' },
  { id: 'pl_medina_square', hub: 'plateau', from: P.medina, to: P.squarePl, what: 'Dibi pour les joueurs de dames' },
  { id: 'pl_atelier_reparation', hub: 'plateau', from: P.ndeye, to: P.reparation, what: 'Housses de téléphone cousues' },
  { id: 'pl_reco_reparation_bank', hub: 'plateau', from: P.reparation, to: P.bankPl, what: 'Téléphones réparés (recommandée par M. Sarr)', needFlag: 'tiak_client_plateau' },
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
