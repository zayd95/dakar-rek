import { ECONOMY } from '../economy/config';
import { fcfaText } from '../economy/format';
import type { BoatKind } from './traverseeSite';

/**
 * La traversée's rules (docs/TRAVERSEE.md « Rules »), pure and unit-tested; src/venues/embarcadere.ts plays them. Numbers in ECONOMY.traversee.
 * - Customers by boat and hour: the pirogue takes 3 across (4 in the busy hours), the chaloupe 2 (3); 1–3 and 1–2 come back, drawn from the city
 *   day, the hour and the player's round trips so far (the same on a reload: what the choice shows is what boards).
 * - A leg pays its fares less Ousmane's share (40 %, 30 % once he trusts the player), once, on arrival; one wallet line says so.
 * - Hours 7 h–19 h; the chaloupe after three pirogue round trips.
 */
const T = ECONOMY.traversee;

/** A leg of the round trip: to the island, back to the quay. */
export type Leg = 'aller' | 'retour';

/** Save counters (the existing `counters`: no new save field). Round trips count once, at the end of the return. */
export const TRAV_COUNTERS = { trips: 'traversees', passengers: 'passagers_ngor', of: (k: BoatKind) => `traversees_${k}` } as const;

/** Crossings leave during these city hours. */
export const crossingOpen = (hour: number) => hour >= T.hours[0] && hour < T.hours[1];
/** The busy hours: the pirogue fills up. */
export const busyHour = (hour: number) => T.busy.some(([a, b]) => hour >= a && hour < b);

/** A number in [0, 1) from a seed (no Math.random: a reload draws the same customers). */
const unit = (seed: number) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
/** The seed of the crossing that leaves now: the city day, the hour, the round trips done (a new hour or a new trip, new customers). */
export const crossingSeed = (day: number, hour: number, trips: number) => (Math.floor(day) * 24 + Math.floor(hour)) * 31 + trips * 7 + 1;

/** How many go across (waiting on the pier) and how many come back from the island, for this boat now. */
export function customers(kind: BoatKind, hour: number, seed: number): { out: number; back: number } {
  const b = T.boats[kind];
  return { out: busyHour(hour) ? b.out[1] : b.out[0], back: b.back[0] + Math.floor(unit(seed) * (b.back[1] - b.back[0] + 1)) };
}

/** Ousmane's share of a leg's fares. */
export const shareRate = (trusted: boolean) => (trusted ? T.shareTrusted : T.share);

/** What a leg pays: the passengers' fares, Ousmane's share (rounded to the franc), what the player keeps. */
export interface LegPay { passengers: number; fare: number; fares: number; rate: number; share: number; net: number }
export function legPay(kind: BoatKind, passengers: number, trusted: boolean): LegPay {
  const fare = T.boats[kind].fare, fares = passengers * fare, rate = shareRate(trusted), share = Math.round(fares * rate);
  return { passengers, fare, fares, rate, share, net: fares - share };
}

/** One crossing as it would leave now: both legs, fixed when it starts. */
export interface CrossingPlan { kind: BoatKind; trusted: boolean; out: LegPay; back: LegPay }
export function crossingPlan(kind: BoatKind, hour: number, seed: number, trusted: boolean): CrossingPlan {
  const n = customers(kind, hour, seed);
  return { kind, trusted, out: legPay(kind, n.out, trusted), back: legPay(kind, n.back, trusted) };
}

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
/** The wallet line of a leg: « Traversée vers Ngor · 4 passagers · 4 000 F − part d’Ousmane 1 600 F ». */
export function legLabel(leg: Leg, p: LegPay): string {
  return `Traversée ${leg === 'aller' ? 'vers Ngor' : 'retour de Ngor'} · ${plural(p.passengers, 'passager')} · ${fcfaText(p.fares)} − part d’Ousmane ${fcfaText(p.share)}`;
}

/** The choice's line: who waits, the fare, the share. */
export function choiceDetail(p: CrossingPlan): string {
  return `${plural(p.out.passengers, 'passager')} ${p.out.passengers > 1 ? 'attendent' : 'attend'} · ${fcfaText(p.out.fare)} la place · Ousmane prend ${Math.round(p.out.rate * 100)} %`;
}
/** What the round trip should bring the player: both legs, net of the share. */
export const roundTripNet = (p: CrossingPlan) => p.out.net + p.back.net;

/** Pirogue round trips left before the chaloupe opens (0: open). */
export const chaloupeLeft = (pirogueTrips: number) => Math.max(0, T.chaloupeAfter - Math.floor(pirogueTrips));
export const chaloupeOpen = (pirogueTrips: number) => chaloupeLeft(pirogueTrips) === 0;

/** When the crossings start again: outside the hours, the choice says so. */
export function nightReason(hour: number): string {
  return hour < T.hours[0] ? `Pas de traversée la nuit · départs à partir de ${T.hours[0]} h` : `Plus de traversée ce soir · reprise demain à ${T.hours[0]} h`;
}

/** Why this boat cannot leave now (the hours, Ousmane's chaloupe not yet his to take, too tired), or null. */
export function closedReason(kind: BoatKind, o: { hour: number; pirogueTrips: number; energie?: number }): string | null {
  if (!crossingOpen(o.hour)) return nightReason(o.hour);
  if (kind === 'chaloupe' && !chaloupeOpen(o.pirogueTrips)) {
    const n = chaloupeLeft(o.pirogueTrips);
    return `Ousmane te confie sa chaloupe après ${T.chaloupeAfter} traversées en pirogue · encore ${n}`;
  }
  if (o.energie !== undefined && o.energie < T.minEnergy) return 'Trop fatigué';
  return null;
}

/** Cruising speed on the water (m/s). */
export const boatSpeed = (kind: BoatKind) => T.boats[kind].speed;
