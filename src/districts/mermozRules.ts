import type { HubId, SaveData, VtcTrip } from '../core/types';
import { VTC_POINTS, vtcFare, type VtcPoint, type VtcRequest } from '../transport/vtcRules';

/**
 * M1 « After Work » (docs/districts/M1-MERMOZ.md): the rules of Mermoz's one recurring person and its two authored rides, pure so the tests read them.
 *
 * Pape Diouf keeps the gate of Résidence Les Filaos. The first evening, a ride on the Corniche's phone list brings Aminata Ndiaye home to his gate (the
 * existing VTC acceptance and payment, nothing else). He thanks the driver. On a later visit he recognises them, and once he passes on one more ride:
 * Mme Ndiaye's trip to her bank on the Plateau. Both rides are offered until paid once, then never again.
 *
 * Memory lives in the existing save only (no schema change): flags and counters beside the NPC memory of src/social/memory.ts.
 */
export const PAPE_ID = 'pape_filaos';
export const PAPE_NAME = 'Pape Diouf';
/** At his booth beside the gate, facing the street (x = 60, to his west). */
export const PAPE_SPOT = { x: 66.2, z: -26.6, yaw: -Math.PI / 2 };
export const AMINATA = 'Aminata Ndiaye';
const SEED = 41;

export const MZ = {
  /** Flag: the first ride (Corniche → the Filaos) was paid. */
  first: 'mz_first_ride',
  /** Counter: paid rides that ended at the Filaos' gate (any passenger). */
  rides: 'mz_filaos_rides',
  /** Counter: city-hour stamp + 1 of the first time Pape thanked the driver (0 / absent = never met). */
  met: 'mz_pape_met',
  /** Counter: city day + 1 of the last time Pape recognised them (once a day at most). */
  seen: 'mz_pape_seen_day',
  /** Flag: Pape passed on Mme Ndiaye's bank ride. */
  offer: 'mz_ndiaye_offer',
  /** Flag: that ride was paid. */
  offerDone: 'mz_ndiaye_ride',
} as const;
/** City hours between the thanks and a visit that counts as « later ». */
export const LATER_HOURS = 2;

const point = (hub: HubId, id: string): VtcPoint => VTC_POINTS[hub].find(p => p.id === id)!;
export const FILAOS = () => point('mermoz', 'filaos');

function request(key: string, from: HubId, pickup: VtcPoint, to: HubId, dropoff: VtcPoint): VtcRequest {
  return { key, from, to, pickup, dropoff, ...vtcFare(from, pickup, to, dropoff), passenger: { name: AMINATA, seed: SEED } };
}
/** The authored rides on the phone in this district, given what the save remembers (first in the list). */
export function mermozRequests(hub: HubId, d: Pick<SaveData, 'flags'>): VtcRequest[] {
  const has = (f: string) => d.flags.includes(f), out: VtcRequest[] = [];
  // after work, from the campus gate of the Corniche (the nearest pick-up to the VDN's mouth) to her residence
  if (hub === 'corniche' && !has(MZ.first)) out.push(request('mz:first', 'corniche', point('corniche', 'campus'), 'mermoz', FILAOS()));
  if (hub === 'mermoz' && has(MZ.offer) && !has(MZ.offerDone)) out.push(request('mz:ndiaye', 'mermoz', FILAOS(), 'plateau', point('plateau', 'banque')));
  return out;
}

export const endsAtFilaos = (t: Pick<VtcTrip, 'to' | 'dropoff'>) => t.to === 'mermoz' && t.dropoff.name === FILAOS().name;
export const isFirstRide = (t: VtcTrip) => endsAtFilaos(t) && t.from === 'corniche' && t.passenger.name === AMINATA;
export const isBankRide = (t: VtcTrip) => t.from === 'mermoz' && t.to === 'plateau' && t.passenger.name === AMINATA && t.pickup.name === FILAOS().name;

/**
 * A ride was paid (src/transport/vtc.ts vtcHooks.paid: after the payment, once per ride). Records it and says whether Pape has something to say at
 * his gate: 'first' (the first time he meets the driver), 'again' (another drop at his gate), or null.
 */
export function onPaid(d: Pick<SaveData, 'flags' | 'counters'>, t: VtcTrip, stamp: number): 'first' | 'again' | null {
  const set = (f: string) => { if (!d.flags.includes(f)) d.flags.push(f); };
  if (isFirstRide(t)) set(MZ.first);
  if (isBankRide(t)) set(MZ.offerDone);
  if (!endsAtFilaos(t)) return null;
  d.counters[MZ.rides] = (d.counters[MZ.rides] ?? 0) + 1;
  if (d.counters[MZ.met]) return 'again';
  d.counters[MZ.met] = stamp + 1;
  return 'first';
}

/**
 * On an arrival in Mermoz (not the one where they met), near his gate: does Pape recognise the driver? Once a city day, at least LATER_HOURS city hours
 * after the thanks. `reveal`: the first recognition also passes on Mme Ndiaye's ride (once ever).
 */
export function recognition(d: Pick<SaveData, 'flags' | 'counters'>, day: number, stamp: number): { reveal: boolean } | null {
  const met = d.counters[MZ.met] ?? 0;
  if (!met || stamp - (met - 1) < LATER_HOURS || d.counters[MZ.seen] === day + 1) return null;
  return { reveal: !d.flags.includes(MZ.offer) && !d.flags.includes(MZ.offerDone) };
}
export function recognise(d: Pick<SaveData, 'flags' | 'counters'>, day: number, reveal: boolean) {
  d.counters[MZ.seen] = day + 1;
  if (reveal && !d.flags.includes(MZ.offer)) d.flags.push(MZ.offer);
}

/** What Pape says. */
export const PAPE_LINES = {
  first: 'Mme Ndiaye est bien arrivée ? Jërëjëf, chauffeur. Moi c’est Pape, le gardien des Filaos.',
  again: 'Encore toi devant mon portail ! Les Filaos commencent à te connaître.',
  recognise: 'Eh, le chauffeur de Mme Ndiaye ! Na nga def ? Tu reviens nous voir.',
  reveal: 'Justement : Mme Ndiaye doit descendre à sa banque au Plateau. Je lui ai donné ton numéro, regarde « Courses VTC ».',
  idleMet: 'Les Filaos sont calmes ce soir. Passe quand tu veux.',
  idle: 'Bonsoir. Résidence Les Filaos : vous cherchez quelqu’un ?',
  pending: 'Mme Ndiaye t’attend pour le Plateau : la course est dans ton téléphone.',
};
