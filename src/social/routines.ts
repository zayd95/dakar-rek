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
const S = (from: number, to: number, place: PlaceSpec, act: Activity): Slot => ({ from, to, place, act });

// Shared spots (world coordinates come from src/world/builder.ts and src/world/city.ts; checked by scripts/check-npc.mjs).
const BEACH_IN: [number, number][] = [[-125, 60], [-131.6, 60], [-131.6, 66.5]];           // Corniche crossing to Soumbédioune
const PIKINE_SHOP_IN: [number, number][] = [[-95.5, 86], [-95.5, 79.6]];                   // Boutique Diallo aisle, behind the counter
const ATELIER_IN: [number, number][] = [[85, 86], [85, 79.6]];                              // Atelier Ndeye aisle
const PIK = {
  courtyard: (label = 'devant chez lui, à côté de ta chambre') => P('home', label, { ox: 6, oz: 0, yaw: PI }),
  attaya1: P('city:square', 'sur la grand-place, à l’attaya', { ox: -0.1, oz: -2.4, yaw: PI, sit: true, stool: true }),
  attaya2: P('city:square', 'sur la grand-place, à l’attaya', { ox: 1.1, oz: -2.4, yaw: PI, sit: true, stool: true }),
  maigaStool: P('maiga', 'à la Maïga du marché', { ox: 3.2, oz: -0.5, yaw: -PI / 2, sit: true, stool: true }),
  counter: P('abs', 'derrière le comptoir de la Boutique Diallo', { ox: -105, oz: 80.1, yaw: 0, approach: PIKINE_SHOP_IN }),
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
      S(11, 13, P('abs', 'à la Boutique Diallo, chez Mamadou', { ox: -104.5, oz: 82.6, yaw: PI, approach: [[-99, 86]] }), 'chat'),
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
      S(7, 13, P('garage', 'au Garage Modou', { ox: -4, oz: 0 }), 'work'),
      S(13, 15, P('maiga', 'à la Maïga du marché (déjeuner)', { maiga: 1 }), 'eat'),
      S(15, 19, P('garage', 'au Garage Modou', { ox: -4, oz: 0 }), 'work'),
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
      S(18, 20, P('city:square', 'place de la Médina, sur un banc', { ox: 0.5, oz: -11.7, yaw: -PI / 2, sit: true }), 'chat'),
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
      S(21, 23, P('city:square', 'place de la Médina, sur un banc', { ox: -21.5, oz: 4.3, yaw: PI / 2, sit: true }), 'chat'),
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
      S(19, 21, P('city:square', 'place de la Médina, avec Adja', { ox: 0.5, oz: -10.3, yaw: -PI / 2, sit: true }), 'chat'),
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
      S(7, 12, P('cafe', 'au café Touba de Fann (service)', { ox: 4, oz: 0 }), 'serve'),
      S(12, 13, P('gargote', 'à la gargote des étudiants', { bench: { n: 0, side: -1 } }), 'eat'),
      S(13, 17, P('cafe', 'au café Touba de Fann (service)', { ox: 4, oz: 0 }), 'serve'),
      S(17, 18, P('city:square', 'place des étudiants (révisions)', { ox: -21.5, oz: 5.7, yaw: PI / 2, sit: true }), 'study'),
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
      S(14, 18, P('city:square', 'place des étudiants, avec ses fiches', { ox: -21.5, oz: 4.3, yaw: PI / 2, sit: true }), 'study'),
      S(18, 20, abs(-134.6, 69.2, 'sur la plage de Soumbédioune (entraînement)', { yaw: -PI / 2, approach: BEACH_IN }), 'train'),
      S(20, 24, abs(53.6, 80, 'chez sa tante, à Fann', { yaw: -PI / 2 }), 'home'),
    ],
  },
  // ------------------------------------------------------------------ Almadies · Ngor
  {
    id: 'ousmane', hub: 'almadies',
    slots: [
      S(0, 5, abs(66.4, -90, 'chez lui', { yaw: PI / 2 }), 'home'),
      S(5, 12, P('port', 'au port de pêche', { ox: 4, oz: 1 }), 'work'),
      S(12, 14, P('restaurant', 'au Pointe : il livre le poisson à Khady', { ox: 1.5, oz: 0.5 }), 'chat'),
      S(14, 18, P('port', 'au port de pêche', { ox: 4, oz: 1 }), 'work'),
      S(18, 21, P('city:square', 'place des voisins, il regarde les dames', { ox: -21.5, oz: 4.3, yaw: PI / 2, sit: true }), 'chat'),
      S(21, 24, abs(66.4, -90, 'chez lui', { yaw: PI / 2 }), 'home'),
    ],
  },
  {
    id: 'khady', hub: 'almadies',
    slots: [
      S(0, 10, abs(-66.4, -20, 'chez elle', { yaw: -PI / 2 }), 'home'),
      S(10, 16, P('restaurant', 'au restaurant Le Pointe', { ox: 4, oz: 0 }), 'serve'),
      S(16, 17, P('restaurant', 'au Pointe : pause sur le banc', { bench: { n: 2, side: 1 } }), 'eat'),
      S(17, 23, P('restaurant', 'au restaurant Le Pointe (service du soir)', { ox: 4, oz: 0 }), 'serve'),
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

const proj = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return { x: a.x + dx * t, z: a.z + dz * t };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
export type ClearFn = (a: Pt, b: Pt) => boolean;

/**
 * Straight segment test against a hub's solid objects (h > 0.3 m), with a 0.25 m margin. Objects containing an end point
 * are the place itself (the bench, the counter) and are ignored. Make one per hub: planPath caches by function identity.
 */
export function collidersClear(cols: readonly { x0: number; z0: number; x1: number; z1: number; h: number }[]): ClearFn {
  return (a, b) => {
    const m = 0.25;
    const len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(len / 0.3));
    const near = cols.filter(c => c.h > 0.3 && Math.max(a.x, b.x) > c.x0 - m && Math.min(a.x, b.x) < c.x1 + m && Math.max(a.z, b.z) > c.z0 - m && Math.min(a.z, b.z) < c.z1 + m
      && !(a.x > c.x0 - 0.45 && a.x < c.x1 + 0.45 && a.z > c.z0 - 0.45 && a.z < c.z1 + 0.45)
      && !(b.x > c.x0 - 0.45 && b.x < c.x1 + 0.45 && b.z > c.z0 - 0.45 && b.z < c.z1 + 0.45));
    if (!near.length) return true;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (near.some(c => x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m)) return false;
    }
    return true;
  };
}
const edgeCache = new WeakMap<ClearFn, Map<string, boolean>>();

/** Closest sidewalk entries for a point, nearest first, keeping only those reachable in a straight clear line. */
function entries(p: Pt, clear: ClearFn, max = 3) {
  const g = laneGraph();
  const all = g.segs.map(([i, j]) => { const q = proj(p, g.nodes[i], g.nodes[j]); return { i, j, q, d: dist(p, q) }; }).sort((u, v) => u.d - v.d);
  const out: typeof all = [];
  for (const e of all) { if (e.d > 60 || out.length >= max) break; if (clear(p, e.q) && clear(g.nodes[e.i], e.q) && clear(e.q, g.nodes[e.j])) out.push(e); }
  return out;
}

/**
 * Walking route from one spot to another: out through the spot's approach, along the sidewalk graph (Dijkstra),
 * in through the destination's approach. `clear` tests a straight segment against the hub's colliders.
 */
export function planPath(from: Spot | Pt, to: Spot | Pt, clear: ClearFn = () => true): Pt[] {
  const fa = 'approach' in from ? from.approach : [], ta = 'approach' in to ? to.approach : [];
  const out: Pt[] = [{ x: from.x, z: from.z }, ...[...fa].reverse().map(([x, z]) => ({ x, z }))];
  const inn: Pt[] = [...ta.map(([x, z]) => ({ x, z })), { x: to.x, z: to.z }];
  const s = out[out.length - 1], t = inn[0];
  let mid: Pt[] = [];
  if (!(dist(s, t) < 14 && clear(s, t))) {
    const g = laneGraph();
    // Sidewalk stretches blocked by something solid (a stall, a fence) are left out of the graph.
    let open = edgeCache.get(clear);
    if (!open) { open = new Map(); edgeCache.set(clear, open); }
    const ok = (i: number, j: number) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; let v = open!.get(k); if (v === undefined) { v = clear(g.nodes[i], g.nodes[j]); open!.set(k, v); } return v; };
    const pts: Pt[] = [...g.nodes], adj: { j: number; w: number }[][] = g.adj.map((js, i) => js.filter(j => ok(i, j)).map(j => ({ j, w: dist(g.nodes[i], g.nodes[j]) })));
    const add = (p: Pt) => { pts.push(p); adj.push([]); return pts.length - 1; };
    const edge = (i: number, j: number) => { const w = dist(pts[i], pts[j]); adj[i].push({ j, w }); adj[j].push({ j: i, w }); };
    const S0 = add(s), T0 = add(t);
    const es = entries(s, clear).map(e => ({ ...e, k: add(e.q) })), et = entries(t, clear).map(e => ({ ...e, k: add(e.q) }));
    for (const e of es) { edge(S0, e.k); edge(e.k, e.i); edge(e.k, e.j); }
    for (const e of et) { edge(T0, e.k); edge(e.k, e.i); edge(e.k, e.j); }
    // Same block side: walk straight along it.
    for (const a of es) for (const b of et) if ((a.i === b.i && a.j === b.j) || (a.i === b.j && a.j === b.i)) edge(a.k, b.k);
    const D = new Array(pts.length).fill(Infinity), prev = new Array(pts.length).fill(-1), done = new Array(pts.length).fill(false);
    D[S0] = 0;
    for (;;) {
      let u = -1; for (let k = 0; k < pts.length; k++) if (!done[k] && D[k] < Infinity && (u < 0 || D[k] < D[u])) u = k;
      if (u < 0 || u === T0) break;
      done[u] = true;
      for (const { j, w } of adj[u]) if (D[u] + w < D[j]) { D[j] = D[u] + w; prev[j] = u; }
    }
    if (D[T0] < Infinity) { const chain: Pt[] = []; for (let k = prev[T0]; k >= 0 && k !== S0; k = prev[k]) chain.unshift(pts[k]); mid = chain; }
  }
  return simplify([...out, ...mid, ...inn]);
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
