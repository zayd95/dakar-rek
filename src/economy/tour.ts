import type { ActiveJob, HubId, TourRun } from '../core/types';
import type { GameState } from '../core/state';
import { DONE_JOBS_MAX } from '../core/save';
import { ECONOMY } from './config';
import { P, type Place } from './jobs';
import { workPay } from './polyvalence';

/**
 * « Tournée » — one pick-up, two clients, and the courier picks who is served first (pure logic, unit-tested; the menus and
 * the marker are in ui.ts). An optional second way to take Tiak Tiak orders, beside the ordinary single deliveries.
 *
 * - Both parcels are in hand at the pick-up; the clock starts when the courier is `departRadius` away from it, so getting
 *   on the bike costs nothing. Each client has a time limit counted from that moment; the second client served is reached
 *   after the first AND the leg between them, so the order decides who has to wait.
 * - The limits were set from the real riding times of the Tiak bike between these places (`legS`, scripts/m1b-tour/,
 *   docs/M1B-TIAK-TOUR.md). The client served first can always be reached with at least a fifth to spare, at the lowest trust.
 * - Each stop is paid when it is handed over (late: the usual 60 %), and a tour that is delivered in full pays a bonus.
 * - Trust (per client, −3…+5): +1 for a stop on time, −1 for a late stop or one abandoned. It adds to that client's pay (up to
 *   +20 %) and moves their patience (the limit, −12 % … +20 %). Only deliveries change it; nothing is ever refused.
 * - Abandoning after leaving the pick-up pays the stops already delivered, no bonus, and costs 1 trust with each client not
 *   delivered. Before leaving it costs nothing.
 */
export interface TourStop {
  id: string;
  /** Who is waiting (shown in the offer and the toast). */
  client: string;
  place: Place;
  /** Base pay of the stop (F). */
  pay: number;
  /** Seconds allowed from departure, at trust 0. */
  limitS: number;
  /** One line on what the client expects. */
  note: string;
}
export interface Tour {
  id: string; hub: HubId; name: string;
  pickup: Place;
  what: string;
  stops: [TourStop, TourStop];
  /** Paid once both stops are delivered (F). */
  bonus: number;
  /**
   * Riding time (game seconds, measured in the browser on the real Pikine streets with the Tiak bike, scripts/m1b-tour/): `p0`
   * and `p1` from the pick-up clock start (8 m from the pick-up) to each stop, `ab` / `ba` from the first stop to the second and
   * back, leaving the first stop without stopping. The order menu predicts with them. The keyboard rider and the touch rider (gas
   * held) agree within a second (docs/M1B-TIAK-TOUR.md); these are the middle of the two for the stops, the slower for the pick-up legs.
   */
  legS: { p0: number; p1: number; ab: number; ba: number };
}

const cafeTouba: Place = { frag: ':cafe:', name: 'Café Touba · Parcelles' };

export const TOURS: Tour[] = [
  {
    id: 'pk_touba_tournee', hub: 'pikine', name: 'Tournée du Café Touba',
    pickup: cafeTouba,
    what: 'Café Touba et pain chaud pour l’accueil de l’agence et pour la partie de dames',
    stops: [
      { id: 'pk_agence', client: 'L’accueil de l’agence Teranga', place: P.bankPk, pay: 1300, limitS: 12, note: 'Le café de l’accueil doit arriver chaud, avant la pause.' },
      { id: 'pk_dames', client: 'Les joueurs de dames', place: P.squarePk, pay: 2000, limitS: 17, note: 'La partie est lancée : le café ne doit pas refroidir.' },
    ],
    bonus: 1200,
    legS: { p0: 4.9, p1: 10.4, ab: 15.4, ba: 14.8 },
  },
];

export const tourById = (id: string) => TOURS.find(t => t.id === id);
export const toursIn = (hub: HubId) => TOURS.filter(t => t.hub === hub);
/** Tour at this pick-up place (interactable id fragment) of this hub. */
export const toursAt = (hub: HubId, placeId: string) => toursIn(hub).filter(t => placeId.includes(t.pickup.frag));
/** Total a tour pays when both stops are on time, at trust 0 (the figure of the offer before trust). */
export const tourTotal = (t: Tour) => t.stops[0].pay + t.stops[1].pay + t.bonus;
const T = ECONOMY.tiak.tour;

// ------------------------------------------------------------------ client memory
const key = (what: 'trust' | 'ok' | 'late' | 'drop', stop: string) => `tiak_${what}_${stop}`;
const clampTrust = (n: number) => Math.max(T.trustMin, Math.min(T.trustMax, Math.round(n)));
/** What a client remembers of the courier, −3…+5 (0 for a client never served: old saves have no such counters). */
export const trustOf = (s: GameState, stop: string) => clampTrust(s.data.counters[key('trust', stop)] ?? 0);
export const historyOf = (s: GameState, stop: string) => ({
  ok: s.data.counters[key('ok', stop)] ?? 0, late: s.data.counters[key('late', stop)] ?? 0, dropped: s.data.counters[key('drop', stop)] ?? 0,
});
const bump = (s: GameState, stop: string, by: 1 | -1, what: 'ok' | 'late' | 'drop') => {
  s.data.counters[key('trust', stop)] = clampTrust(trustOf(s, stop) + by);
  s.count(key(what, stop));
};
export const patienceFactor = (trust: number) => 1 + T.patiencePerLevel * clampTrust(trust);
export const payFactor = (trust: number) => 1 + T.payPerLevel * Math.max(0, clampTrust(trust));
/** « ★★ » for a trusted client, « méfiant » below zero. */
export const trustWord = (trust: number) => (trust > 0 ? '★'.repeat(trust) : trust < 0 ? 'méfiant' : 'neutre');

/** Seconds each stop allows now (by stop index), with the client's patience. */
export const limitsOf = (s: GameState, t: Tour): [number, number] => [0, 1].map(i => Math.round(t.stops[i].limitS * patienceFactor(trustOf(s, t.stops[i].id)) * 10) / 10) as [number, number];
/** Base pay of each stop now (by stop index), with the client's trust; the variety bonus is added at hand-over like any pay. */
export const paysOf = (s: GameState, t: Tour): [number, number] => [0, 1].map(i => Math.round(t.stops[i].pay * payFactor(trustOf(s, t.stops[i].id)))) as [number, number];

export type Order = [0, 1] | [1, 0];
export const ORDERS: Order[] = [[0, 1], [1, 0]];
export interface OrderPreview {
  order: Order;
  /** Seconds to each stop of the order at the measured riding time, and what its client allows. */
  arrive: [number, number]; limit: [number, number];
  /** Whether that stop is reached in time at the measured riding time. */
  onTime: [boolean, boolean];
  /** Pay if the tour goes as predicted (late stops at the usual share), before the variety bonus. */
  pay: number;
}
export function previewOrder(s: GameState, t: Tour, order: Order): OrderPreview {
  const [a, b] = order, lim = limitsOf(s, t), pays = paysOf(s, t);
  const ride = [t.legS.p0, t.legS.p1];
  const arrive: [number, number] = [ride[a], ride[a] + (a === 0 ? t.legS.ab : t.legS.ba)];
  const limit: [number, number] = [lim[a], lim[b]];
  const onTime: [boolean, boolean] = [arrive[0] <= limit[0], arrive[1] <= limit[1]];
  const stop = (i: number, ok: boolean) => Math.round(pays[i] * (ok ? 1 : ECONOMY.tiak.latePayFactor));
  return { order, arrive, limit, onTime, pay: stop(a, onTime[0]) + stop(b, onTime[1]) + t.bonus };
}

// ------------------------------------------------------------------ the run
export function whyNotTour(s: GameState, t: Tour): string | null {
  if (s.data.jobs.active) return 'Une livraison est déjà en cours';
  if (s.data.needs.energie < T.minEnergy) return 'Trop fatigué';
  if (s.data.hub !== t.hub) return 'Pas dans ce quartier';
  return null;
}

/** Accept a tour at its pick-up: both parcels in hand, limits and pay fixed now. The clock starts on departure. */
export function acceptTour(s: GameState, tourId: string, order: Order): ActiveJob | null {
  const t = tourById(tourId);
  if (!t || whyNotTour(s, t) || !ORDERS.some(o => o[0] === order[0] && o[1] === order[1])) return null;
  const j = s.data.jobs;
  j.seq += 1;
  const runId = `${s.data.guestId.slice(0, 8)}-${j.seq}-${Math.floor(s.data.playedMs)}`;
  const tour: TourRun = { id: t.id, order: [order[0], order[1]], leg: 0, departed: false, limitS: limitsOf(s, t), pay: paysOf(s, t), late: [] };
  const [a, b] = order, pays = tour.pay;
  j.active = { runId, routeId: `tour:${t.id}`, hub: t.hub, stage: 'deliver', pay: pays[a] + pays[b] + t.bonus, startedMs: s.data.playedMs, limitMs: 0, tour };
  return j.active;
}

/** The tour in hand, its definition and the stop being served; null for no tour (or a tour removed from the table). */
export function currentTour(s: GameState): { job: ActiveJob; run: TourRun; tour: Tour; stop: TourStop; index: number } | null {
  const job = s.data.jobs.active, run = job?.tour;
  const tour = run ? tourById(run.id) : undefined;
  if (!job || !run || !tour) return null;
  const index = run.order[run.leg];
  return { job, run, tour, stop: tour.stops[index], index };
}

/** The courier left the pick-up: the clocks start. Returns true the first time. */
export function depart(s: GameState): boolean {
  const c = currentTour(s);
  if (!c || c.run.departed) return false;
  c.run.departed = true; c.job.startedMs = s.data.playedMs;
  return true;
}
/** Milliseconds left for the stop of leg `leg` (the one served now by default); Infinity before the clock starts. */
export function tourRemainingMs(s: GameState, leg?: 0 | 1): number {
  const c = currentTour(s); if (!c || !c.run.departed) return Infinity;
  const i = c.run.order[leg ?? c.run.leg];
  return c.run.limitS[i] * 1000 - (s.data.playedMs - c.job.startedMs);
}

export interface TourCompletion {
  runId: string; stop: TourStop; paid: number; late: boolean;
  /** Paid with the last stop (0 before it). */
  bonus: number;
  /** Both stops done: the tour is over. */
  finished: boolean;
  trust: number;
}
/**
 * Hand over the parcel of the stop being served. Pays once per stop: a second call (or one with another run id) pays nothing,
 * and the stops must come in the order picked. Late: the usual 60 %. The last stop also pays the bonus and ends the run.
 */
export function completeStop(s: GameState, runId: string): TourCompletion | null {
  const j = s.data.jobs, c = currentTour(s);
  if (!c || c.job.runId !== runId || j.done.includes(runId)) return null;
  const { run, tour, stop, index } = c;
  const late = tourRemainingMs(s) < 0;
  const paid = s.addMoney(Math.max(0, workPay(s, Math.round(run.pay[index] * (late ? ECONOMY.tiak.latePayFactor : 1)), 'livraison')), `Tournée Tiak Tiak → ${stop.place.name}${late ? ' (en retard)' : ''}`);
  s.adjust(ECONOMY.tiak.fatigue);
  s.count('livraisons'); s.count('actions');
  bump(s, stop.id, late ? -1 : 1, late ? 'late' : 'ok');
  run.late.push(late);
  let bonus = 0;
  const finished = run.leg === 1;
  if (finished) {
    bonus = s.addMoney(Math.max(0, workPay(s, tour.bonus, 'livraison')), `Tournée complète : bonus (${tour.name})`);
    j.active = null; j.done.push(runId);
    if (j.done.length > DONE_JOBS_MAX) j.done.splice(0, j.done.length - DONE_JOBS_MAX);
    s.count('tournees');
  } else run.leg = 1;
  return { runId, stop, paid, late, bonus, finished, trust: trustOf(s, stop.id) };
}

/** What abandoning the tour in hand would cost, as the sentence the player is shown first. */
export function abandonNote(s: GameState): string {
  const c = currentTour(s); if (!c) return '';
  if (!c.run.departed) return 'Tu n’as pas encore quitté le point de départ : aucun coût.';
  const waiting = c.run.order.slice(c.run.leg).map(i => c.tour.stops[i].client);
  const paid = c.run.leg === 1 ? `Le stop déjà livré reste payé. ` : '';
  return `${paid}Pas de bonus de tournée, et ${waiting.join(' et ')} perdent 1 de confiance en toi.`;
}
export interface Abandon { free: boolean; lost: string[] }
/** Abandon the tour in hand. Nothing is paid; before leaving the pick-up nothing is lost either. */
export function abandonTour(s: GameState): Abandon | null {
  const c = currentTour(s), j = s.data.jobs;
  if (!c) { if (j.active?.tour) { j.active = null; return { free: true, lost: [] }; } return null; }   // a tour removed from the table: dropped
  const free = !c.run.departed, lost: string[] = [];
  if (!free) for (const i of c.run.order.slice(c.run.leg)) { bump(s, c.tour.stops[i].id, -1, 'drop'); lost.push(c.tour.stops[i].client); }
  j.active = null;
  return { free, lost };
}
