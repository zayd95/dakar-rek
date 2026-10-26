import type { HubId, VtcTrip } from '../core/types';
import { HUB_IDS } from '../core/types';
import { ECONOMY } from '../economy/config';
import { planTrip } from '../road/graph';
import { kerbSpot } from './taxiRules';
import type { PersonLook } from '../actors/humanoid';

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
    // on the car rapides' streets (never shut by a road event), mid-block, clear of their stops and of the arena's gate
    { id: 'jamm', name: 'Cité Jàmm · Keur Meubles', x: -30, z: -75 }, { id: 'pathe', name: 'Dibiterie Chez Pathé', x: -50, z: -40 },
    { id: 'mosquee', name: 'Rue de la Mosquée', x: 44, z: 75 }, { id: 'ecurie', name: 'Écurie de lutte', x: 45, z: -90 },
  ],
  plateau: [
    { id: 'medina', name: 'Place de la Médina', x: -19, z: 93 }, { id: 'fatou', name: 'Gargote Chez Fatou', x: -40, z: 55 }, { id: 'sandaga', name: 'Marché Sandaga', x: 44, z: -50 },
    { id: 'banque', name: 'Banque Teranga · Plateau', x: 75, z: -30 }, { id: 'cafe', name: 'Café Touba · Sandaga', x: 78, z: 6 }, { id: 'reparation', name: 'Dakar Réparation', x: 97, z: 82 },
    { id: 'mosquee', name: 'Grande Mosquée · Plateau', x: -30, z: -45 }, { id: 'gare', name: 'Gare routière du Plateau', x: 15, z: 30 },
    { id: 'dibiterie', name: 'Dibiterie de la Médina', x: -45, z: 30 },
  ],
  corniche: [
    { id: 'fann', name: 'Place des étudiants · Fann', x: 41, z: 93 }, { id: 'cafe', name: 'Café Touba · Fann', x: -42, z: 6 }, { id: 'gargote', name: 'Gargote des étudiants', x: 18, z: -5 },
    { id: 'artisans', name: 'Ateliers de Soumbédioune', x: -94, z: 76 }, { id: 'sport', name: 'Salle de sport · Corniche', x: -90, z: -28 },
    { id: 'monument', name: 'Esplanade du Monument', x: -42, z: -75 }, { id: 'campus', name: 'Campus de l’université', x: 75, z: -40 },
    { id: 'foot', name: 'Terrain de foot de Fann', x: -75, z: 40 }, { id: 'gareFann', name: 'Gare de Fann', x: 15, z: 30 },
  ],
  almadies: [
    { id: 'pointe', name: 'Restaurant Le Pointe', x: -102, z: -54 }, { id: 'mall', name: 'Dakar Life Mall', x: 30, z: 47 }, { id: 'ngor', name: 'Place des voisins · Ngor', x: 101, z: 33 },
    { id: 'cafe', name: 'Café Touba · Ngor', x: 102, z: -54 }, { id: 'port', name: 'Embarcadère de Ngor', x: 30, z: -109 },
    { id: 'gare', name: 'Gare des Almadies', x: -45, z: 30 }, { id: 'prestige', name: 'Prestige Auto', x: -75, z: 40 },
    // the club on Ngor's beach (src/venues/club.ts CLUB_SITE), the car on the coast road clear of the car rapide's stop; the villa for sale
    // (src/economy/estate.ts), the car along its side street
    { id: 'vague', name: 'La Vague · plage de Ngor', x: -20, z: -138 }, { id: 'villas', name: 'Villa avec piscine · Almadies', x: -8, z: -20 },
  ],
};
/** Where the car stops for a point (the kerb), and where the passenger waits (the pavement beside it, away from the road's centre line). */
export function stopOf(p: { x: number; z: number }) {
  const k = kerbSpot(p.x, p.z), alongZ = Math.abs(Math.sin(k.yaw)) < 0.5;           // a road that is a line x = const: the car faces ±z
  const out = alongZ ? { x: Math.sign(k.x - Math.round(k.x / 60) * 60) || 1, z: 0 } : { x: 0, z: Math.sign(k.z - Math.round(k.z / 60) * 60) || 1 };
  return { car: k, wait: { x: k.x + out.x * 2.6, z: k.z + out.z * 2.6 }, out };
}

/**
 * The fare (game money, ECONOMY.vtc) and the length of the way by road: inside a district, along its grid of streets (from one kerb to the other); to
 * another district, the roads between them (src/road/graph.ts) and the streets at both ends. In bands, 1 000 F to 5 000 F at most; no multiplier.
 */
export function vtcFare(from: HubId, a: { x: number; z: number }, to: HubId, b: { x: number; z: number }): { fare: number; metres: number; hubs: HubId[] } {
  const V = ECONOMY.vtc, r = (v: number) => Math.round(v / V.step) * V.step, clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  if (from === to) {
    const m = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);                                  // the grid's streets: along x, then along z
    return { fare: clampTo(r(V.town.base + V.town.perMetre * m), V.town.min, V.town.max), metres: Math.round(m), hubs: [from] };
  }
  const plan = planTrip(from, to), hubs = plan?.hubs ?? [from, to], away = Math.max(1, hubs.length - 1);
  const metres = (plan?.metres ?? 2000) + (Math.abs(a.x) + Math.abs(a.z)) * 0.5 + (Math.abs(b.x) + Math.abs(b.z)) * 0.5;
  const cap = V.away.max[Math.min(V.away.max.length, away) - 1];
  return { fare: clampTo(r(V.away.min + Math.max(0, metres - V.away.from) * V.away.perMetre), V.away.min, cap), metres: Math.round(metres), hubs };
}
/** The played time a ride should take from its acceptance (beyond it, the passenger finds it late): the way at a city pace, with slack, plus the pick-up. */
export function rideLimitMs(t: Pick<VtcTrip, 'from' | 'to' | 'pickup' | 'dropoff'>): number {
  const V = ECONOMY.vtc, m = vtcFare(t.from, t.pickup, t.to, t.dropoff).metres;
  return (V.pickupS + (m / V.speed) * V.slack) * 1000;
}

/** The passengers' looks (a ride's passenger seed picks one): the person standing at the kerb, sitting in the back, walking off. */
export const VTC_LOOKS: PersonLook[] = [
  { skin: 0x5b3420, style: 'tee', top: 0x2f6fa8, bottom: 0x22252b, hat: null, shoes: 0x1a1a1a },
  { skin: 0x6b3f25, style: 'dress', top: 0xd66532, bottom: 0xd66532, female: true, pattern: 'wax', accent: 0xf2d16b, hat: 'headwrap', hatColor: 0xe8b734 },
  { skin: 0x4e2e1c, style: 'boubou', top: 0xeee8da, bottom: 0xeee8da, hat: 'kufi', hatColor: 0xf2f2ec },
  { skin: 0x7a4a2c, style: 'tee', top: 0xc2417f, bottom: 0x2b3a55, female: true, hair: 'puff' },
  { skin: 0x5b3420, style: 'tee', top: 0xf1f1ee, bottom: 0x3a4a5c, hat: null, beard: 0x1a1410 },
  { skin: 0x633a24, style: 'dress', top: 0x2e8b57, bottom: 0x2e8b57, female: true, pattern: 'bazin', hat: 'headwrap', hatColor: 0x2e8b57 },
];

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
