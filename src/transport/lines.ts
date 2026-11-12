import type { HubId } from '../core/types';
import type { Pt } from './route';
import { RIDE, rapideCalls } from '../i18n/lines';
import { isFightEvening } from '../arena/exteriorRules';

/**
 * Public transport lines, as data. Line numbers are fictional; stop and terminus names are real Dakar neighbourhoods
 * or the game's own landmarks (no real company, no livery, no inscription). Every hub has one car rapide loop around
 * its four central blocks, driven on the right with the blocks inside the loop on the pavement side, so every stop is
 * on a pavement the player can walk to. Texts are French with everyday Wolof from the language library (src/i18n).
 */

/** Road grid of the hub builder (src/world/builder.ts: PITCH 60, ROAD 14, NB 4 → centre lines at −120, −60, 0, 60, 120). */
export const GRID = { pitch: 60, road: 14, nb: 4 } as const;
export const roadCentre = (k: number) => -(GRID.nb * GRID.pitch + GRID.road) / 2 + GRID.road / 2 + k * GRID.pitch;
/** Carriageway half-width (the 2 m pavement starts here, kerb included). */
export const KERB = GRID.road / 2 - 2;

export interface StopDef {
  id: string;
  /** Name on the sign and in the calls. */
  name: string;
  /** Leg of the loop (from node `leg` to node `leg + 1`) and metres from the start of that leg. */
  leg: number; at: number;
}

export interface LineDef {
  id: string;
  hub: HubId;
  /** « Ligne 23 » */
  number: string;
  /** Termini, for the sign and the apprenti's calls: « Pikine ⇄ Guédiawaye ». */
  from: string; to: string;
  /** Loop of road-grid nodes [a, b] (centre line x = roadCentre(a), z = roadCentre(b)), driven in this order. */
  loop: [number, number][];
  stops: StopDef[];
  fare: number;
  /** Vehicles on the line (evenly spaced in time). */
  fleet: number;
  /** Seconds added to the shared clock so lines of different hubs are not in step. */
  phase: number;
  /** What the apprenti shouts at the stops. */
  calls: string[];
  /**
   * When the line runs (city day, hour of the shared clock: every client agrees). Absent: always. A line and its
   * evening variant share the number: one runs while the other is parked.
   */
  runs?: (day: number, hour: number) => boolean;
  /** Share of the seats NPC passengers hold now (half when absent): the fight evenings' cars are fuller. */
  fill?: (day: number, hour: number) => number;
}

/**
 * Fight evenings at the Pikine arena (a bout every evening): from the set-up at 16 h to midnight the road in front of the
 * gate holds the queue between its barriers (src/arena/exterior.ts closes it to traffic), so Ligne 23 takes its evening
 * route round the arena block and stops at the arena's west side, the « Arène » stop of the fight nights.
 */
export const ARENA_EVENING = { from: 16, to: 24 } as const;
export const arenaEvening = (hour: number) => { const h = ((hour % 24) + 24) % 24; return h >= ARENA_EVENING.from && h < ARENA_EVENING.to; };
/**
 * Ligne 23's evening route: up the arena's west side, round the west and south blocks, back along the arena's south
 * side. Never the street in front of the arena gate: crowd barriers stand across it at all hours, with stalls on it, a
 * pedestrian zone (src/arena/exteriorRules.ts gatePlaza).
 */
const ARENA_LOOP: [number, number][] = [[2, 2], [2, 1], [1, 1], [1, 3], [3, 3], [3, 2]];
/**
 * Ligne 23 by day: the same three blocks the other way round, so it keeps off the gate's pedestrian zone too (the four
 * central blocks' loop it used to run took the street in front of the gate, through the barriers, past the stalls, its
 * « Arène » stop by a stall). Its stops face the evening route's across the road; « Arène » is on the arena's west road,
 * a short walk from the gate.
 */
const DAY_LOOP: [number, number][] = [[2, 2], [3, 2], [3, 3], [1, 3], [1, 1], [2, 1]];

const LOOP: [number, number][] = [[1, 1], [3, 1], [3, 3], [1, 3]];

export const LINES: LineDef[] = [
  {
    id: '23', hub: 'pikine', number: 'Ligne 23', from: 'Pikine', to: 'Guédiawaye', loop: DAY_LOOP, fare: 150, fleet: 2, phase: 0,
    stops: [
      { id: 'marche', name: 'Marché', leg: 1, at: 38 },
      { id: 'gare', name: 'Gare', leg: 2, at: 84 },
      { id: 'rue10', name: 'Rue 10', leg: 3, at: 80 },
      { id: 'arene', name: 'Arène', leg: 5, at: 21 },
    ],
    calls: rapideCalls(['Guédiawaye', 'Thiaroye', 'Rue 10']),
    runs: (_day, hour) => !arenaEvening(hour),
  },
  {
    // the same line on fight evenings (see ARENA_EVENING): fuller, calling the arena
    id: '23s', hub: 'pikine', number: 'Ligne 23', from: 'Pikine', to: 'Arène', loop: ARENA_LOOP, fare: 150, fleet: 2, phase: 0,
    stops: [
      { id: 'arene', name: 'Arène', leg: 0, at: 39 },
      { id: 'rue10', name: 'Rue 10', leg: 2, at: 80 },
      { id: 'gare', name: 'Gare', leg: 3, at: 36 },
      { id: 'marche', name: 'Marché', leg: 4, at: 38 },
    ],
    calls: rapideCalls(['Arène', 'Làmb', 'Guédiawaye']),
    runs: (_day, hour) => arenaEvening(hour),
    fill: (day, hour) => (isFightEvening(day, hour) ? 0.85 : 0.65),        // gala nights (Friday–Sunday) pack the cars
  },
  {
    id: '5', hub: 'plateau', number: 'Ligne 5', from: 'Plateau', to: 'Colobane', loop: LOOP, fare: 150, fleet: 2, phase: 17,
    stops: [
      { id: 'sandaga', name: 'Sandaga', leg: 0, at: 90 },
      { id: 'gare', name: 'Gare', leg: 1, at: 82 },
      { id: 'medina', name: 'Médina', leg: 2, at: 85 },
      { id: 'mosquee', name: 'Mosquée', leg: 3, at: 85 },
    ],
    calls: rapideCalls(['Colobane', 'Petersen', 'Médina']),
  },
  {
    id: '8', hub: 'corniche', number: 'Ligne 8', from: 'Fann', to: 'Ouakam', loop: LOOP, fare: 150, fleet: 2, phase: 41,
    stops: [
      { id: 'monument', name: 'Monument', leg: 0, at: 30 },
      { id: 'universite', name: 'Université', leg: 1, at: 35 },
      { id: 'gare', name: 'Gare', leg: 2, at: 35 },
      { id: 'mermoz', name: 'Mermoz', leg: 3, at: 35 },
    ],
    calls: rapideCalls(['Ouakam', 'Fann', 'Mermoz', 'Liberté 6']),
  },
  {
    id: '31', hub: 'almadies', number: 'Ligne 31', from: 'Ngor', to: 'Yoff', loop: LOOP, fare: 200, fleet: 2, phase: 63,
    stops: [
      { id: 'ngor', name: 'Ngor', leg: 0, at: 90 },
      { id: 'mall', name: 'Le Mall', leg: 1, at: 85 },
      { id: 'gare', name: 'Gare', leg: 2, at: 90 },
      { id: 'almadies', name: 'Almadies', leg: 3, at: 85 },
    ],
    calls: rapideCalls(['Ngor', 'Yoff', 'Ouakam', 'Almadies']),
  },
];

export const linesOf = (hub: HubId) => LINES.filter(l => l.hub === hub);

/** Centre-line points of the loop's nodes. */
export function loopNodes(line: LineDef): Pt[] { return line.loop.map(([a, b]) => ({ x: roadCentre(a), z: roadCentre(b) })); }

/** Point on the centre line of a stop's leg, and the leg's unit direction. */
export function stopOnLeg(line: LineDef, stop: StopDef): { x: number; z: number; dx: number; dz: number } {
  const nodes = loopNodes(line), a = nodes[stop.leg % nodes.length], b = nodes[(stop.leg + 1) % nodes.length];
  const len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
  return { x: a.x + dx * stop.at, z: a.z + dz * stop.at, dx, dz };
}

/** Lines, calls and replies: French with everyday Wolof (CLAD) from src/i18n/lines.ts, glosses after the quotes. */
export const SAY = {
  fare: (fare: number) => RIDE.fare(fare),
  depart: RIDE.depart,
  request: (stop: string) => `${RIDE.request(stop)} · tak-tak sur la carrosserie`,
  alight: (stop: string) => `${stop} · ${RIDE.alight()}`,
  neighbour: RIDE.neighbour(),
  waiting: (what: string, s: number) => s <= 2 ? what : `${what} dans ≈ ${Math.ceil(s)} s`,
};
