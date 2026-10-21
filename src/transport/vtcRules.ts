import type { HubId, VtcTrip } from '../core/types';
import { HUB_IDS } from '../core/types';
import { ECONOMY } from '../economy/config';
import { planTrip } from '../road/graph';
import { kerbSpot } from './taxiRules';

/**
 * VTC rides (pure rules, unit-tested; src/transport/vtc.ts plays them): where passengers wait and get out, the requests the phone shows, the fare.
 * Game money only, no real dispatch service: placeholder fares from ECONOMY.vtc.
 *
 * A point is a named place of a district (its centre, hub-local metres); the car stops at the kerb of the road nearest to it (taxiRules `kerbSpot`: the
 * parking lane, heading the way the traffic goes there) and the passenger waits on the pavement beside that spot.
 */
export interface VtcPoint { id: string; name: string; x: number; z: number }
export const VTC_POINTS: Record<HubId, VtcPoint[]> = {
  pikine: [
    { id: 'gare', name: 'Gare de Pikine', x: -33, z: 33 }, { id: 'banque', name: 'Banque Teranga', x: -90, z: -38 }, { id: 'boutique', name: 'Boutique Diallo', x: -105, z: 82 },
    { id: 'place', name: 'Grand-place de Pikine', x: -19, z: 93 }, { id: 'maiga', name: 'Maïga du marché', x: 78, z: -5 }, { id: 'gargote', name: 'Gargote Mame Diarra', x: 78, z: 55 },
    { id: 'cafe', name: 'Café Touba · Parcelles', x: -78, z: 6 },
  ],
  plateau: [
    { id: 'medina', name: 'Place de la Médina', x: -19, z: 93 }, { id: 'fatou', name: 'Gargote Chez Fatou', x: -18, z: 55 }, { id: 'sandaga', name: 'Marché Sandaga', x: 28, z: -41 },
    { id: 'banque', name: 'Banque Teranga · Plateau', x: 90, z: -38 }, { id: 'cafe', name: 'Café Touba · Sandaga', x: 78, z: 6 }, { id: 'reparation', name: 'Dakar Réparation', x: 97, z: 82 },
  ],
  corniche: [
    { id: 'fann', name: 'Place des étudiants · Fann', x: 41, z: 93 }, { id: 'cafe', name: 'Café Touba · Fann', x: -42, z: 6 }, { id: 'gargote', name: 'Gargote des étudiants', x: 18, z: -5 },
    { id: 'artisans', name: 'Ateliers de Soumbédioune', x: -94, z: 76 }, { id: 'sport', name: 'Salle de sport · Corniche', x: -90, z: -28 },
  ],
  almadies: [
    { id: 'pointe', name: 'Restaurant Le Pointe', x: -102, z: -54 }, { id: 'mall', name: 'Dakar Life Mall', x: 30, z: 47 }, { id: 'ngor', name: 'Place des voisins · Ngor', x: 101, z: 33 },
    { id: 'cafe', name: 'Café Touba · Ngor', x: 102, z: -54 }, { id: 'port', name: 'Port de pêche', x: 30, z: -109 },
  ],
};
/** Where the car stops for a point (the kerb), and where the passenger waits (the pavement beside it, away from the road's centre line). */
export function stopOf(p: { x: number; z: number }) {
  const k = kerbSpot(p.x, p.z), alongZ = Math.abs(Math.sin(k.yaw)) < 0.5;           // a road that is a line x = const: the car faces ±z
  const out = alongZ ? { x: Math.sign(k.x - Math.round(k.x / 60) * 60) || 1, z: 0 } : { x: 0, z: Math.sign(k.z - Math.round(k.z / 60) * 60) || 1 };
  return { car: k, wait: { x: k.x + out.x * 2.6, z: k.z + out.z * 2.6 }, out };
}

/** The fare (game money): base, distance (straight inside a district, the roads' lengths between districts), a supplement per boundary crossed. */
export function vtcFare(from: HubId, a: { x: number; z: number }, to: HubId, b: { x: number; z: number }): { fare: number; metres: number; hubs: HubId[] } {
  const V = ECONOMY.vtc;
  if (from === to) { const m = Math.hypot(a.x - b.x, a.z - b.z); return { fare: Math.max(V.base, Math.round((V.base + V.perMetre * m) / V.step) * V.step), metres: Math.round(m), hubs: [from] }; }
  const plan = planTrip(from, to);
  const metres = (plan?.metres ?? 2000) + Math.hypot(a.x, a.z) * 0.3 + Math.hypot(b.x, b.z) * 0.3;
  const crossings = (plan?.hubs.length ?? 2) - 1;
  return { fare: Math.round((V.base + V.perMetre * metres + V.perDistrict * crossings) / V.step) * V.step, metres: Math.round(metres), hubs: plan?.hubs ?? [from, to] };
}

const NAMES = ['Awa', 'Fatou', 'Ibrahima', 'Aminata', 'Cheikh', 'Mariama', 'Ousmane', 'Khady', 'Moussa', 'Ndeye', 'Abdou', 'Coumba', 'Babacar', 'Sokhna', 'Pape', 'Astou'];
/** Trips the phone shows in this district this hour: one to each neighbouring district along the roads, one inside the district. Same list on every reload. */
export interface VtcRequest { key: string; from: HubId; to: HubId; pickup: VtcPoint; dropoff: VtcPoint; fare: number; metres: number; hubs: HubId[]; passenger: { name: string; seed: number } }
/** The rides the city asks for: the long ones named in the design (Plateau → Almadies, Pikine → Plateau, Corniche → Pikine, Almadies → Plateau by the Corniche) first. */
const LONG: Record<HubId, HubId> = { plateau: 'almadies', pikine: 'plateau', corniche: 'pikine', almadies: 'plateau' };
export function vtcRequests(hub: HubId, day: number, hour: number): VtcRequest[] {
  const seed = (day * 24 + hour) * 7919 + HUB_IDS.indexOf(hub) * 104729;
  const rnd = (k: number) => { const x = Math.sin(seed * 0.0001 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const pts = VTC_POINTS[hub], pick = <T>(l: T[], k: number) => l[Math.floor(rnd(k) * l.length) % l.length];
  const dests: HubId[] = [LONG[hub], ...HUB_IDS.filter(h => h !== hub && h !== LONG[hub]).slice(0, 1), hub];
  return dests.map((to, i) => {
    const pickup = pick(pts, i * 3 + 1);
    let dropoff = pick(VTC_POINTS[to], i * 3 + 2);
    if (to === hub && dropoff.id === pickup.id) dropoff = VTC_POINTS[to][(VTC_POINTS[to].indexOf(dropoff) + 1) % VTC_POINTS[to].length];
    const f = vtcFare(hub, pickup, to, dropoff), n = Math.floor(rnd(i * 3 + 3) * NAMES.length) % NAMES.length;
    return { key: `${day}:${hour}:${hub}:${i}`, from: hub, to, pickup, dropoff, ...f, passenger: { name: NAMES[n], seed: (n * 37 + i * 11 + day) % 997 } };
  });
}

/** The trip in hand for an accepted request (fixed now: the fare shown is the fare paid). */
export function tripOf(r: VtcRequest, id: string, playedMs: number): VtcTrip {
  return { id, from: r.from, to: r.to, pickup: { x: r.pickup.x, z: r.pickup.z, name: r.pickup.name }, dropoff: { x: r.dropoff.x, z: r.dropoff.z, name: r.dropoff.name }, fare: r.fare, stage: 'pickup', passenger: { ...r.passenger }, acceptedMs: playedMs };
}

/** Close enough, and stopped, to take the passenger in or let them out (the car's centre within this of the kerb spot). */
export const STOP_RADIUS = 9;
export const atStop = (car: { x: number; z: number; speed: number }, p: { x: number; z: number }) => Math.abs(car.speed) < 0.6 && Math.hypot(car.x - p.x, car.z - p.z) < STOP_RADIUS;
