import type { HubId } from '../core/types';
import type { Clip } from '../actors/humanoid';
import { PITCH, BLK, ROAD, NB } from '../world/builder';

/**
 * Daily routines of the recurring cast.
 * Each character keeps to their hub. A schedule is a list of slots by city hour (0–24, the shared city clock or the
 * debug `setHour` override); each slot names a place, resolved at run time from the hub's interactables (gargote,
 * Maïga, café, boutique, grand-place…), and an activity that gives the pose (seated, talking, waiting, training).
 * People walk between places along the sidewalks (see `planPath`). Pure module: no Three.js, unit-tested.
 */

export type Activity = 'home' | 'rest' | 'work' | 'serve' | 'eat' | 'attaya' | 'study' | 'train' | 'coach' | 'chat' | 'wait';

export interface PlaceSpec {
  /** Interactable key (`id.includes(':' + at)`), or 'abs' for a fixed sidewalk spot given by ox/oz. */
  at: string;
  ox?: number; oz?: number;
  /** Facing when nobody is around (radians, 0 = +z). */
  yaw?: number;
  /** Seated on a real seat at this point (bench, stool). */
  sit?: boolean;
  /** One of the three benches in front of a gargote/café/restaurant kiosk (n = 0..2), left or right half. */
  bench?: { n: 0 | 1 | 2; side: -1 | 1 };
  /** The bench outside a Maïga, left or right half. */
  maiga?: -1 | 1;
  /** A stool is added here at run time (no seat in the builder at this spot). */
  stool?: boolean;
  /** Fixed waypoints from the sidewalk to the spot (shop aisles, the beach crossing), in world coordinates. */
  approach?: [number, number][];
  /** Where the People app says they are. */
  label: string;
  /** A name for the place when `at` is 'abs' (a fixed spot): what a situation's `at` names (src/social/situations.ts). */
  id?: string;
}
export interface Slot { from: number; to: number; place: PlaceSpec; act: Activity }
export interface Routine {
  id: string; hub: HubId; slots: Slot[];
  /** Until this story beat is done the character waits at this place (the first meeting must stay easy to find). */
  waitsFor?: { beat: string; place: PlaceSpec; act: Activity };
}

const PI = Math.PI;
const P = (at: string, label: string, o: Omit<PlaceSpec, 'at' | 'label'> = {}): PlaceSpec => ({ at, label, ...o });
const abs = (x: number, z: number, label: string, o: Omit<PlaceSpec, 'at' | 'label' | 'ox' | 'oz'> = {}): PlaceSpec => ({ at: 'abs', ox: x, oz: z, label, ...o });
/** Ousmane at work: on the sand by his boats pulled up on the Almadies' beach (src/sea/traverseeSite.ts: the pirogue's bow, the anchor beside him), facing the sea. */
const NGOR_BOATS = (label: string) => abs(46.2, -156.4, label, { yaw: PI });
const S = (from: number, to: number, place: PlaceSpec, act: Activity): Slot => ({ from, to, place, act });

// Shared spots (world coordinates come from src/world/builder.ts and src/world/city.ts; checked by scripts/check-npc.mjs).
const BEACH_IN: [number, number][] = [[-125, 60], [-131.6, 60], [-131.6, 66.5]];           // Corniche crossing to Soumbédioune
const PIKINE_SHOP_IN: [number, number][] = [[-95.5, 86], [-95.5, 79.6]];                   // Boutique Diallo aisle, behind the counter
const ATELIER_IN: [number, number][] = [[85, 86], [85, 79.6]];                              // Atelier Ndeye aisle
const GARAGE_IN: [number, number][] = [[102.6, -6], [102.6, -11.1]];                        // Garage Modou: the aisle by the bench (shop kit 'garage')
const PIK = {
  courtyard: (label = 'devant chez lui, à côté de ta chambre') => P('home', label, { ox: 6, oz: 0, yaw: PI }),
  attaya1: P('city:square', 'sur la grand-place, à l’attaya', { ox: -0.1, oz: -2.4, yaw: PI, sit: true, stool: true }),
  attaya2: P('city:square', 'sur la grand-place, à l’attaya', { ox: 1.1, oz: -2.4, yaw: PI, sit: true, stool: true }),
  maigaStool: P('maiga', 'à la Maïga du marché', { ox: 3.2, oz: -0.5, yaw: -PI / 2, sit: true, stool: true }),
  counter: P('abs', 'derrière le comptoir de la Boutique Diallo', { id: 'boutique', ox: -105, oz: 80.1, yaw: 0, approach: PIKINE_SHOP_IN }),
  counterStool: P('abs', 'à la boutique (il mange derrière le comptoir)', { ox: -106.6, oz: 79.9, yaw: 0, sit: true, stool: true, approach: PIKINE_SHOP_IN }),
};

export const ROUTINES: Routine[] = [
  // ------------------------------------------------------------------ Pikine
  {
    id: 'ibou', hub: 'pikine',
    waitsFor: { beat: 'ibou_welcome', place: PIK.courtyard('devant ta chambre : il attend le nouveau voisin'), act: 'wait' },
    slots: [
      S(0, 7, PIK.courtyard('chez lui (il dort)'), 'home'),
      S(7, 9.5, P('cafe', 'au café Touba des Parcelles', { bench: { n: 0, side: -1 } }), 'eat'),
      S(9.5, 11, PIK.courtyard('devant chez lui : il reçoit les voisins'), 'chat'),
      S(11, 13, P('abs', 'à la Boutique Diallo, chez Mamadou', { id: 'boutique', ox: -104.5, oz: 82.6, yaw: PI, approach: [[-99, 86]] }), 'chat'),
      S(13, 15, P('maiga', 'à la Maïga du marché (déjeuner)', { maiga: -1 }), 'eat'),
      S(15, 17, PIK.courtyard('devant chez lui (sieste à l’ombre)'), 'rest'),
      S(17, 22, PIK.attaya1, 'attaya'),
      S(22, 24, PIK.courtyard('chez lui (il dort)'), 'home'),
    ],
  },
  {
    id: 'modou', hub: 'pikine',
    slots: [
      S(0, 7, abs(113.6, -20, 'chez lui, derrière le garage', { yaw: -PI / 2 }), 'home'),
      S(7, 13, P('abs', 'derrière son établi, au Garage Modou', { id: 'garage', ox: 98.84, oz: -11.1, yaw: 0, approach: GARAGE_IN }), 'work'),
      S(13, 15, P('maiga', 'à la Maïga du marché (déjeuner)', { maiga: 1 }), 'eat'),
      S(15, 19, P('abs', 'derrière son établi, au Garage Modou', { id: 'garage', ox: 98.84, oz: -11.1, yaw: 0, approach: GARAGE_IN }), 'work'),
      S(19, 22, PIK.attaya2, 'attaya'),
      S(22, 24, abs(113.6, -20, 'chez lui, derrière le garage', { yaw: -PI / 2 }), 'home'),
    ],
  },
  {
    id: 'mame', hub: 'pikine',
    slots: [
      S(0, 6, abs(66.4, 40, 'chez elle, près de la gargote', { yaw: PI / 2 }), 'home'),
      S(6, 15, P('gargote', 'à sa gargote (service)', { ox: 4, oz: 0 }), 'serve'),
      S(15, 16, P('gargote', 'à sa gargote : elle mange enfin', { bench: { n: 2, side: 1 } }), 'eat'),
      S(16, 21, P('gargote', 'à sa gargote (service du soir)', { ox: 4, oz: 0 }), 'serve'),
      S(21, 24, abs(66.4, 40, 'chez elle, près de la gargote', { yaw: PI / 2 }), 'home'),
    ],
  },
  {
    id: 'ablaye', hub: 'pikine',
    slots: [
      S(0, 6, abs(-6.4, -95, 'chez lui, près de l’écurie', { yaw: PI / 2 }), 'home'),
      S(6, 11, P('ecurie', 'à l’écurie Baobab (entraînement du matin)', { ox: -3, oz: -2 }), 'coach'),
      S(11, 14, abs(-6.4, -95, 'chez lui, près de l’écurie', { yaw: PI / 2 }), 'rest'),
      S(14, 15, P('gargote', 'chez Mame Diarra (déjeuner)', { bench: { n: 0, side: -1 } }), 'eat'),
      S(15, 19, P('ecurie', 'à l’écurie Baobab (entraînement du soir)', { ox: -3, oz: -2 }), 'coach'),
      S(19, 21, P('arena', 'devant l’arène', { ox: -3, oz: -2 }), 'chat'),
      S(21, 24, abs(-6.4, -95, 'chez lui, près de l’écurie', { yaw: PI / 2 }), 'home'),
    ],
  },
  {
    id: 'babacar', hub: 'pikine',
    slots: [
      S(0, 6, abs(66.4, -90, 'chez lui', { yaw: PI / 2 }), 'home'),
      S(6, 10, P('ecurie', 'à l’écurie Baobab (entraînement)', { ox: 3, oz: -3 }), 'train'),
      S(10, 13, abs(66.4, -90, 'chez lui (récupération)', { yaw: PI / 2 }), 'rest'),
      S(13, 15, PIK.maigaStool, 'eat'),
      S(15, 19, P('ecurie', 'à l’écurie Baobab (entraînement)', { ox: 3, oz: -3 }), 'train'),
      S(19, 22, P('arena', 'devant l’arène, avec ceux de l’écurie', { ox: 1, oz: -3 }), 'chat'),
      S(22, 24, abs(66.4, -90, 'chez lui', { yaw: PI / 2 }), 'home'),
    ],
  },
  {
    id: 'lamine', hub: 'pikine',
    slots: [
      S(0, 8, abs(95, -53.6, 'chez lui', { yaw: PI }), 'home'),
      S(8, 12, P('arena', 'devant l’arène (il s’entraîne en public)', { ox: 3, oz: -2 }), 'train'),
      S(12, 14, P('cafe', 'au café Touba des Parcelles', { bench: { n: 2, side: 1 } }), 'eat'),
      S(14, 18, P('arena', 'devant l’arène', { ox: 3, oz: -2 }), 'train'),
      S(18, 22, abs(-14.5, -54.2, 'devant la dibiterie Chez Pathé', { yaw: PI }), 'chat'),
      S(22, 24, abs(95, -53.6, 'chez lui', { yaw: PI }), 'home'),
    ],
  },
  {
    id: 'mamadou', hub: 'pikine',
    slots: [
      S(0, 7, abs(-108, 66.4, 'chez lui, derrière la boutique', { yaw: PI }), 'home'),
      S(7, 13, PIK.counter, 'serve'),
      S(13, 14.5, PIK.counterStool, 'eat'),
      S(14.5, 17, PIK.counter, 'serve'),
      S(17, 19, PIK.attaya2, 'attaya'),
      S(19, 22, PIK.counter, 'serve'),
      S(22, 24, abs(-108, 66.4, 'chez lui, derrière la boutique', { yaw: PI }), 'home'),
    ],
  },
  // ------------------------------------------------------------------ Plateau · Médina
  {
    id: 'adja', hub: 'plateau',
    slots: [
      S(0, 8, abs(6.4, 80, 'chez elle', { yaw: -PI / 2 }), 'home'),
      S(8, 13, P('market', 'à son étal de Sandaga', { ox: 3, oz: 1 }), 'serve'),
      S(13, 14, P('gargote', 'chez Fatou (déjeuner)', { bench: { n: 0, side: -1 } }), 'eat'),
      S(14, 18, P('market', 'à son étal de Sandaga', { ox: 3, oz: 1 }), 'serve'),
      S(18, 20, P('city:square', 'place de la Médina, sur un banc', { ox: 0.5, oz: -12.2, yaw: -PI / 2, sit: true }), 'chat'),
      S(20, 24, abs(6.4, 80, 'chez elle', { yaw: -PI / 2 }), 'home'),
    ],
  },
  {
    id: 'fatou', hub: 'plateau',
    slots: [
      S(0, 7, abs(-45, 66.4, 'chez elle, près de la place', { yaw: PI }), 'home'),
      S(7, 15, P('gargote', 'à sa gargote (service)', { ox: 4, oz: 0 }), 'serve'),
      S(15, 16, P('gargote', 'à sa gargote : elle mange', { bench: { n: 2, side: 1 } }), 'eat'),
      S(16, 21, P('gargote', 'à sa gargote (service du soir)', { ox: 4, oz: 0 }), 'serve'),
      S(21, 23, P('city:square', 'place de la Médina, sur un banc', { ox: -21.5, oz: 5, yaw: PI / 2, sit: true }), 'chat'),
      S(23, 24, abs(-45, 66.4, 'chez elle, près de la place', { yaw: PI }), 'home'),
    ],
  },
  {
    id: 'ndeye', hub: 'plateau',
    slots: [
      S(0, 8, abs(53.6, 80, 'chez elle', { yaw: PI / 2 }), 'home'),
      S(8, 13, P('abs', 'à l’Atelier Ndeye, au comptoir', { ox: 75, oz: 80.1, yaw: 0, approach: ATELIER_IN }), 'serve'),
      S(13, 14, P('gargote', 'chez Fatou (déjeuner)', { bench: { n: 1, side: -1 } }), 'eat'),
      S(14, 19, P('abs', 'à l’Atelier Ndeye, au comptoir', { ox: 75, oz: 80.1, yaw: 0, approach: ATELIER_IN }), 'serve'),
      S(19, 21, P('city:square', 'place de la Médina, avec Adja', { ox: 0.5, oz: -11, yaw: -PI / 2, sit: true }), 'chat'),
      S(21, 24, abs(53.6, 80, 'chez elle', { yaw: PI / 2 }), 'home'),
    ],
  },
  // ------------------------------------------------------------------ Corniche · Fann
  {
    id: 'moussa', hub: 'corniche',
    slots: [
      S(0, 6, abs(-66.4, -45, 'chez lui', { yaw: -PI / 2 }), 'home'),
      S(6, 11, P('gym', 'à la salle en plein air', { ox: 5, oz: 3 }), 'coach'),
      S(11, 13, abs(-66.4, -45, 'chez lui', { yaw: -PI / 2 }), 'rest'),
      S(13, 14, P('maiga', 'à la Maïga de Fann (déjeuner)', { maiga: -1 }), 'eat'),
      S(14, 17, abs(-66.4, -45, 'chez lui', { yaw: -PI / 2 }), 'rest'),
      S(17, 20, abs(-135.5, 67.5, 'sur la plage de Soumbédioune (entraînement collectif)', { yaw: -PI / 2, approach: BEACH_IN }), 'coach'),
      S(20, 21, P('gym', 'à la salle en plein air', { ox: 5, oz: 3 }), 'coach'),
      S(21, 24, abs(-66.4, -45, 'chez lui', { yaw: -PI / 2 }), 'home'),
    ],
  },
  {
    id: 'aida', hub: 'corniche',
    slots: [
      S(0, 7, abs(-6.4, 80, 'chez elle', { yaw: PI / 2 }), 'home'),
      S(7, 12, P('cafe', 'au café Touba de Fann (service)', { ox: 4, oz: 0, yaw: PI }), 'serve'),
      S(12, 13, P('gargote', 'à la gargote des étudiants', { bench: { n: 0, side: -1 } }), 'eat'),
      S(13, 17, P('cafe', 'au café Touba de Fann (service)', { ox: 4, oz: 0, yaw: PI }), 'serve'),
      S(17, 18, P('city:square', 'place des étudiants (révisions)', { ox: -21.5, oz: 6.2, yaw: PI / 2, sit: true }), 'study'),
      S(18, 20, abs(-136.5, 69.2, 'sur la plage de Soumbédioune (entraînement)', { yaw: PI / 2, approach: BEACH_IN }), 'train'),
      S(20, 24, abs(-6.4, 80, 'chez elle', { yaw: PI / 2 }), 'home'),
    ],
  },
  {
    id: 'kadiatou', hub: 'corniche',
    slots: [
      S(0, 8, abs(53.6, 80, 'chez sa tante, à Fann', { yaw: -PI / 2 }), 'home'),
      S(8, 12, P('cafe', 'au café Touba de Fann (elle révise)', { bench: { n: 1, side: -1 } }), 'study'),
      S(12, 14, P('maiga', 'à la Maïga de Fann (déjeuner)', { maiga: 1 }), 'eat'),
      S(14, 18, P('city:square', 'place des étudiants, avec ses fiches', { ox: -21.5, oz: 5, yaw: PI / 2, sit: true }), 'study'),
      S(18, 20, abs(-134.6, 69.2, 'sur la plage de Soumbédioune (entraînement)', { yaw: -PI / 2, approach: BEACH_IN }), 'train'),
      S(20, 24, abs(53.6, 80, 'chez sa tante, à Fann', { yaw: -PI / 2 }), 'home'),
    ],
  },
  // ------------------------------------------------------------------ Almadies · Ngor
  {
    id: 'ousmane', hub: 'almadies',
    slots: [
      S(0, 6, abs(66.4, -90, 'chez lui', { yaw: PI / 2 }), 'home'),
      S(6, 12, NGOR_BOATS('à l’embarcadère de Ngor : il loue ses bateaux pour l’île'), 'work'),
      S(12, 14, P('restaurant', 'au Pointe : il livre le poisson à Khady', { ox: 1.5, oz: 0.5 }), 'chat'),
      S(14, 19, NGOR_BOATS('à l’embarcadère de Ngor : les dernières traversées'), 'work'),
      S(19, 21, P('city:square', 'place des voisins, il regarde les dames', { ox: -21.5, oz: -2.5, yaw: PI, sit: true, stool: true }), 'chat'),
      S(21, 24, abs(66.4, -90, 'chez lui', { yaw: PI / 2 }), 'home'),
    ],
  },
  {
    id: 'khady', hub: 'almadies',
    slots: [
      S(0, 10, abs(-66.4, -20, 'chez elle', { yaw: -PI / 2 }), 'home'),
      S(10, 16, P('restaurant', 'au restaurant Le Pointe', { ox: 4, oz: 0, yaw: PI }), 'serve'),
      S(16, 17, P('restaurant', 'au Pointe : pause sur le banc', { bench: { n: 2, side: 1 } }), 'eat'),
      S(17, 23, P('restaurant', 'au restaurant Le Pointe (service du soir)', { ox: 4, oz: 0, yaw: PI }), 'serve'),
      S(23, 24, abs(-66.4, -20, 'chez elle', { yaw: -PI / 2 }), 'home'),
    ],
  },
];
export const routineOf = (id: string) => ROUTINES.find(r => r.id === id);

/** The slot in force at a city hour (0–24). Slots cover the whole day; a slot may wrap past midnight (from > to). */
export function slotAt(r: Routine, hour: number): Slot {
  const h = ((hour % 24) + 24) % 24;
  return r.slots.find(s => (s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to)) ?? r.slots[r.slots.length - 1];
}

/** What the character should be doing now: the slot, unless they are still waiting for a first meeting. */
export function currentPlan(r: Routine, hour: number, beatDone: (id: string) => boolean): { place: PlaceSpec; act: Activity; key: string } {
  if (r.waitsFor && !beatDone(r.waitsFor.beat)) return { place: r.waitsFor.place, act: r.waitsFor.act, key: 'wait:' + r.waitsFor.beat };
  const s = slotAt(r, hour);
  return { place: s.place, act: s.act, key: `${s.from}-${s.to}` };
}

/** Clip for an activity: seated where a seat exists, the wrestling stance while training, face to face when talking.
 * Sit has its knees corrected on load (fixSitKnees in actors/humanoid.ts). */
export function poseFor(act: Activity, sit: boolean, talkingTo: 'player' | 'npc' | null): Clip {
  if (sit) return 'Sit';
  if (act === 'train' && talkingTo !== 'player') return 'Stance';
  return talkingTo ? 'Talk' : 'Idle';
}

// ------------------------------------------------------------------ places in the world
export interface Anchor { id: string; x: number; z: number }
export interface Spot { x: number; z: number; yaw: number; sit: boolean; stool: boolean; approach: [number, number][] }
const roadC = (k: number) => -(NB * PITCH + ROAD) / 2 + ROAD / 2 + k * PITCH;
const blockMin = (i: number) => -(NB * PITCH + ROAD) / 2 + ROAD + i * PITCH;
/** Kiosks open to the north (-1) or the south (+1): their interactable sits 1.5 m outside the block edge. */
export function kioskDir(z: number): -1 | 1 {
  const local = ((z - blockMin(0)) % PITCH + PITCH) % PITCH;
  return local > BLK + 4 ? -1 : 1;
}

export function resolvePlace(p: PlaceSpec, anchors: Anchor[]): Spot | null {
  const s = resolveRaw(p, anchors);
  return s && { ...s, x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100 };
}
function resolveRaw(p: PlaceSpec, anchors: Anchor[]): Spot | null {
  const approach = p.approach ?? [];
  if (p.at === 'abs') return { x: p.ox ?? 0, z: p.oz ?? 0, yaw: p.yaw ?? 0, sit: !!p.sit, stool: !!p.stool, approach };
  const a = anchors.find(i => i.id.includes(':' + p.at));
  if (!a) return null;
  const dir = kioskDir(a.z), face = dir > 0 ? 0 : PI;
  // Kiosk benches (builder.ts kioskAt): x = cx − 4 + 4n, 1.2 m outside the interactable, facing the table and the street.
  if (p.bench) return { x: a.x - 4 + 4 * p.bench.n + p.bench.side * 0.4, z: a.z + dir * 1.2, yaw: face, sit: true, stool: false, approach };
  // Maïga bench: 1.6 m to the side of the door, against the front wall.
  if (p.maiga) return { x: a.x + 1.6 + p.maiga * 0.4, z: a.z - dir * 1.1, yaw: face, sit: true, stool: false, approach };
  return { x: a.x + (p.ox ?? 0), z: a.z + (p.oz ?? 0), yaw: p.yaw ?? 0, sit: !!p.sit, stool: !!p.stool, approach };
}

// ------------------------------------------------------------------ walking on the sidewalks
/** People walk on the kerb side of the sidewalk: clear of lamp posts (5.6 m), shop counters and the Maïga bench. */
export const LANE = 5;
type Pt = { x: number; z: number };
interface Graph { nodes: Pt[]; adj: number[][]; segs: [number, number][] }
let graph: Graph | null = null;
/** Sidewalk graph: four corners around every intersection, joined along block sides and across the crossings. */
export function laneGraph(): Graph {
  if (graph) return graph;
  const nodes: Pt[] = [], adj: number[][] = [], segs: [number, number][] = [];
  const idx = (a: number, b: number, sx: number, sz: number) => ((a * (NB + 1) + b) * 4) + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0);
  for (let a = 0; a <= NB; a++) for (let b = 0; b <= NB; b++) for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    nodes[idx(a, b, sx, sz)] = { x: roadC(a) + sx * LANE, z: roadC(b) + sz * LANE }; adj[idx(a, b, sx, sz)] = [];
  }
  const link = (i: number, j: number) => { adj[i].push(j); adj[j].push(i); segs.push([i, j]); };
  for (let a = 0; a <= NB; a++) for (let b = 0; b <= NB; b++) {
    for (const s of [-1, 1]) { link(idx(a, b, -1, s), idx(a, b, 1, s)); link(idx(a, b, s, -1), idx(a, b, s, 1)); } // crossings
    if (a < NB) for (const sz of [-1, 1]) link(idx(a, b, 1, sz), idx(a + 1, b, -1, sz));
    if (b < NB) for (const sx of [-1, 1]) link(idx(a, b, sx, 1), idx(a, b + 1, sx, -1));
  }
  graph = { nodes, adj, segs };
  return graph;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
export type ClearFn = (a: Pt, b: Pt) => boolean;

type Box = { x0: number; z0: number; x1: number; z1: number; h: number };
let clearTick = 0;
/**
 * Straight segment test against a hub's solid objects (h > 0.3 m), with a 0.25 m margin. Objects containing an end point
 * are the place itself (the bench, the counter) and are ignored. Make one per hub: planPath caches by function identity.
 *
 * The test reads the list as it is now. It keeps a copy of the solid boxes in flat arrays (a walk through 770 objects was
 * 15-40 µs a call, and a route asks twenty times), made again when the list has changed since the last `epoch` — a number
 * that goes up when the world may have changed (default: at every call; the ambient life gives its frame count, so that the
 * several tests of one route in a frame share one look at the list).
 */
export function collidersClear(cols: readonly Box[], epoch: () => number = () => ++clearTick): ClearFn {
  const m = 0.25;
  let seen = NaN, sig = NaN, n = 0, X0 = new Float64Array(0), Z0 = X0, X1 = X0, Z1 = X0;
  const signature = () => { let s = cols.length; for (let i = 0; i < cols.length; i++) { const c = cols[i]; s += (i + 1) * (c.x0 + 3 * c.z0 + 5 * c.x1 + 7 * c.z1 + 11 * c.h); } return s; };
  const refresh = () => {
    const e = epoch(); if (e === seen) return; seen = e;
    const s = signature(); if (s === sig) return; sig = s;
    if (X0.length < cols.length) { X0 = new Float64Array(cols.length); Z0 = new Float64Array(cols.length); X1 = new Float64Array(cols.length); Z1 = new Float64Array(cols.length); }
    n = 0;
    for (let i = 0; i < cols.length; i++) { const c = cols[i]; if (c.h > 0.3) { X0[n] = c.x0; Z0[n] = c.z0; X1[n] = c.x1; Z1[n] = c.z1; n++; } }
  };
  const near: number[] = [];                                                                // (the objects in the way: one list for all the calls)
  return (a, b) => {
    refresh();
    const ax = a.x, az = a.z, bx = b.x, bz = b.z;
    const xhi = Math.max(ax, bx), xlo = Math.min(ax, bx), zhi = Math.max(az, bz), zlo = Math.min(az, bz);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x0 = X0[i], z0 = Z0[i], x1 = X1[i], z1 = Z1[i];
      if (xhi > x0 - m && xlo < x1 + m && zhi > z0 - m && zlo < z1 + m
        && !(ax > x0 - 0.45 && ax < x1 + 0.45 && az > z0 - 0.45 && az < z1 + 0.45)
        && !(bx > x0 - 0.45 && bx < x1 + 0.45 && bz > z0 - 0.45 && bz < z1 + 0.45)) near[k++] = i;
    }
    if (!k) return true;
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(len / 0.3));
    // The points of the segment every 30 cm, inside one of the objects? For each object the stretch of the segment inside its box
    // (slab method) says which of the points can be: only those are tried, with the very test of old. (A long segment past forty
    // stalls and barriers was 130 points × 40 boxes, 60 µs.)
    for (let j = 0; j < k; j++) {
      const i = near[j], bx0 = X0[i] - m, bx1 = X1[i] + m, bz0 = Z0[i] - m, bz1 = Z1[i] + m;
      let t0 = 0, t1 = 1;
      if (dx === 0) { if (ax <= bx0 || ax >= bx1) continue; } else { let u = (bx0 - ax) / dx, v = (bx1 - ax) / dx; if (u > v) { const w = u; u = v; v = w; } if (u > t0) t0 = u; if (v < t1) t1 = v; }
      if (dz === 0) { if (az <= bz0 || az >= bz1) continue; } else { let u = (bz0 - az) / dz, v = (bz1 - az) / dz; if (u > v) { const w = u; u = v; v = w; } if (u > t0) t0 = u; if (v < t1) t1 = v; }
      if (t0 > t1) continue;
      const k0 = Math.max(0, Math.floor(t0 * steps) - 1), k1 = Math.min(steps, Math.ceil(t1 * steps) + 1);
      for (let q = k0; q <= k1; q++) {
        const t = q / steps, x = ax + dx * t, z = az + dz * t;
        if (x > bx0 && x < bx1 && z > bz0 && z < bz1) return false;
      }
    }
    return true;
  };
}
const edgeCache = new WeakMap<ClearFn, Map<string, boolean>>();

/**
 * Closest sidewalk entries for a point, nearest first, keeping only those reachable in a straight clear line. Kept per
 * `clear` and point, like the graph's open stretches (edgeCache): the ambient people come from the graph's corners and
 * walk to the places' fixed spots, so the same few points come back all evening.
 */
function entries(p: Pt, clear: ClearFn, max = 3) {
  let byPt = entryCache.get(clear);
  if (!byPt) { byPt = new Map(); entryCache.set(clear, byPt); }
  const key = `${p.x},${p.z},${max}`, hit = byPt.get(key);
  if (hit) return hit;
  const g = laneGraph(), segs = g.segs, n = segs.length;
  // the stretches by distance from the point, nearest first (the first of equals first: the order of a stable sort), the next
  // one taken only when the ones before it were no use — no object for each of the graph's stretches, no sort
  if (eD.length < n) { eD = new Float64Array(n); eQx = new Float64Array(n); eQz = new Float64Array(n); eDone = new Uint8Array(n); }
  eDone.fill(0, 0, n);
  for (let k = 0; k < n; k++) {
    const a = g.nodes[segs[k][0]], b = g.nodes[segs[k][1]];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
    const qx = a.x + dx * t, qz = a.z + dz * t;
    eQx[k] = qx; eQz[k] = qz; eD[k] = Math.hypot(p.x - qx, p.z - qz);
  }
  const out: { i: number; j: number; q: Pt; d: number }[] = [];
  while (out.length < max) {
    let best = -1, bd = Infinity;
    for (let k = 0; k < n; k++) if (!eDone[k] && eD[k] < bd) { bd = eD[k]; best = k; }
    if (best < 0 || bd > 60) break;
    eDone[best] = 1;
    const [i, j] = segs[best], q = { x: eQx[best], z: eQz[best] };
    if (clear(p, q) && clear(g.nodes[i], q) && clear(q, g.nodes[j])) out.push({ i, j, q, d: bd });
  }
  if (byPt.size > 4000) byPt.clear();
  byPt.set(key, out);
  return out;
}
/** `entries`' working arrays. */
let eD = new Float64Array(0), eQx = new Float64Array(0), eQz = new Float64Array(0), eDone = new Uint8Array(0);
const entryCache = new WeakMap<ClearFn, Map<string, { i: number; j: number; q: Pt; d: number }[]>>();

/**
 * The sidewalk graph as one `clear` test leaves it: a node's open stretches with their lengths, made the first time a search
 * reaches the node (and each stretch tested once per test, see edgeCache), so the first long route of an evening does not
 * test the whole city at once.
 */
interface OpenGraph { pts: Pt[]; at(i: number): { j: number; w: number }[] }
const openGraphs = new WeakMap<ClearFn, OpenGraph>();
function openGraph(clear: ClearFn): OpenGraph {
  let og = openGraphs.get(clear);
  if (!og) {
    const g = laneGraph();
    // Sidewalk stretches blocked by something solid (a stall, a fence) are left out of the graph.
    let open = edgeCache.get(clear);
    if (!open) { open = new Map(); edgeCache.set(clear, open); }
    const ok = (i: number, j: number) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; let v = open!.get(k); if (v === undefined) { v = clear(g.nodes[i], g.nodes[j]); open!.set(k, v); } return v; };
    const adj: ({ j: number; w: number }[] | undefined)[] = new Array(g.nodes.length);
    og = { pts: g.nodes, at: i => (adj[i] ??= g.adj[i].filter(j => ok(i, j)).map(j => ({ j, w: dist(g.nodes[i], g.nodes[j]) }))) };
    openGraphs.set(clear, og);
  }
  return og;
}
/** Dijkstra's working arrays, kept between calls (the graph's nodes and the few a route adds). */
let dD = new Float64Array(0), dPrev = new Int32Array(0), dDone = new Uint8Array(0);
/** The heap of (distance, node) the search takes the nearest from: the lowest distance, then the lowest node (the order a scan of the nodes would pick). */
let hD: number[] = [], hK: number[] = [];
const hLess = (a: number, b: number) => hD[a] < hD[b] || (hD[a] === hD[b] && hK[a] < hK[b]);
function hPush(d: number, k: number) {
  let i = hD.length; hD.push(d); hK.push(k);
  while (i > 0) { const p = (i - 1) >> 1; if (!hLess(i, p)) break; [hD[i], hD[p]] = [hD[p], hD[i]]; [hK[i], hK[p]] = [hK[p], hK[i]]; i = p; }
}
function hPop(): number {
  const top = hK[0], d = hD.pop()!, k = hK.pop()!;
  if (hD.length) {
    hD[0] = d; hK[0] = k;
    for (let i = 0; ;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < hD.length && hLess(l, m)) m = l;
      if (r < hD.length && hLess(r, m)) m = r;
      if (m === i) break;
      [hD[i], hD[m]] = [hD[m], hD[i]]; [hK[i], hK[m]] = [hK[m], hK[i]]; i = m;
    }
  }
  return top;
}

/**
 * Walking route from one spot to another: out through the spot's approach, along the sidewalk graph (Dijkstra),
 * in through the destination's approach. `clear` tests a straight segment against the hub's colliders.
 * (The graph's open stretches are made once per `clear`; a route adds its own few nodes and edges on top, copying only the
 * lists it adds to; the search takes the nearest node from a heap — the same route, node for node, as scanning for it.)
 */
export function planPath(from: Spot | Pt, to: Spot | Pt, clear: ClearFn = () => true): Pt[] {
  const fa = 'approach' in from ? from.approach : [], ta = 'approach' in to ? to.approach : [];
  const out: Pt[] = [{ x: from.x, z: from.z }, ...[...fa].reverse().map(([x, z]) => ({ x, z }))];
  const inn: Pt[] = [...ta.map(([x, z]) => ({ x, z })), { x: to.x, z: to.z }];
  const s = out[out.length - 1], t = inn[0];
  let mid: Pt[] = [];
  if (!(dist(s, t) < 14 && clear(s, t))) {
    const og = openGraph(clear), N = og.pts.length;
    const extra: Pt[] = [], extraAdj: { j: number; w: number }[][] = [], own = new Map<number, { j: number; w: number }[]>();
    const ptOf = (k: number) => (k < N ? og.pts[k] : extra[k - N]);
    const listOf = (k: number) => (k < N ? own.get(k) ?? og.at(k) : extraAdj[k - N]);
    const push = (i: number, e: { j: number; w: number }) => {
      if (i >= N) { extraAdj[i - N].push(e); return; }
      let l = own.get(i); if (!l) { l = og.at(i).slice(); own.set(i, l); }
      l.push(e);
    };
    const add = (p: Pt) => { extra.push(p); extraAdj.push([]); return N + extra.length - 1; };
    const edge = (i: number, j: number) => { const w = dist(ptOf(i), ptOf(j)); push(i, { j, w }); push(j, { j: i, w }); };
    const S0 = add(s), T0 = add(t);
    const es = entries(s, clear).map(e => ({ ...e, k: add(e.q) })), et = entries(t, clear).map(e => ({ ...e, k: add(e.q) }));
    for (const e of es) { edge(S0, e.k); edge(e.k, e.i); edge(e.k, e.j); }
    for (const e of et) { edge(T0, e.k); edge(e.k, e.i); edge(e.k, e.j); }
    // Same block side: walk straight along it.
    for (const a of es) for (const b of et) if ((a.i === b.i && a.j === b.j) || (a.i === b.j && a.j === b.i)) edge(a.k, b.k);
    const total = N + extra.length;
    if (dD.length < total) { dD = new Float64Array(total); dPrev = new Int32Array(total); dDone = new Uint8Array(total); }
    const D = dD, prev = dPrev, done = dDone;
    D.fill(Infinity, 0, total); prev.fill(-1, 0, total); done.fill(0, 0, total);
    hD.length = 0; hK.length = 0;
    D[S0] = 0; hPush(0, S0);
    while (hD.length) {
      const u = hPop();
      if (done[u]) continue;
      if (u === T0) break;
      done[u] = 1;
      for (const { j, w } of listOf(u)) if (D[u] + w < D[j]) { D[j] = D[u] + w; prev[j] = u; hPush(D[j], j); }
    }
    if (D[T0] < Infinity) { const chain: Pt[] = []; for (let k = prev[T0]; k >= 0 && k !== S0; k = prev[k]) chain.unshift(ptOf(k)); mid = chain; }
  }
  return simplify([...out, ...mid, ...inn]);
}

/**
 * A few routes planned over the sidewalks with a test of their own (nothing is kept, the hub's test is not touched): the
 * first long route of an evening finds the code cold, which costs 10-25 ms in one frame; made while the hub loads it costs
 * nobody a frame.
 */
export function warmPaths(cols: readonly { x0: number; z0: number; x1: number; z1: number; h: number }[]) {
  const clear = collidersClear(cols), g = laneGraph(), n = g.nodes.length;
  for (let k = 0; k < 8; k++) {
    const a = g.nodes[(k * 37) % n], b = g.nodes[(k * 61 + 17) % n];
    planPath({ x: a.x + 1.2, z: a.z - 0.8 }, { x: b.x - 1.1, z: b.z + 0.9 }, clear);
  }
}

function simplify(pts: Pt[]): Pt[] {
  const r: Pt[] = [];
  for (const p of pts) {
    if (r.length && dist(r[r.length - 1], p) < 0.05) continue;
    if (r.length >= 2) {
      const a = r[r.length - 2], b = r[r.length - 1];
      const cross = (b.x - a.x) * (p.z - b.z) - (b.z - a.z) * (p.x - b.x), dot = (b.x - a.x) * (p.x - b.x) + (b.z - a.z) * (p.z - b.z);
      if (Math.abs(cross) < 1e-6 && dot > 0) { r[r.length - 1] = p; continue; }
    }
    r.push(p);
  }
  return r;
}
export const pathLength = (pts: Pt[]) => pts.reduce((l, p, k) => (k ? l + dist(pts[k - 1], p) : 0), 0);
