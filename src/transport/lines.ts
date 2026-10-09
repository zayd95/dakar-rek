import type { HubId } from '../core/types';
import type { Pt } from './route';

/**
 * Public transport lines, as data. Line numbers are fictional; stop and terminus names are real Dakar neighbourhoods
 * or the game's own landmarks (no real company, no livery, no inscription). Every hub has one car rapide loop around
 * its four central blocks, driven on the right with the blocks inside the loop on the pavement side, so every stop is
 * on a pavement the player can walk to. Texts are French with everyday Wolof (CLAD spelling) — draft, to review.
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
}

const LOOP: [number, number][] = [[1, 1], [3, 1], [3, 3], [1, 3]];

export const LINES: LineDef[] = [
  {
    id: '23', hub: 'pikine', number: 'Ligne 23', from: 'Pikine', to: 'Guédiawaye', loop: LOOP, fare: 150, fleet: 2, phase: 0,
    stops: [
      { id: 'arene', name: 'Arène', leg: 0, at: 74 },
      { id: 'marche', name: 'Marché', leg: 1, at: 38 },
      { id: 'gare', name: 'Gare', leg: 2, at: 84 },
      { id: 'rue10', name: 'Rue 10', leg: 3, at: 80 },
    ],
    calls: ['Guédiawaye ! Guédiawaye !', 'Thiaroye, Thiaroye !', 'Am na place !', 'Pikine Rue 10 !'],
  },
  {
    id: '5', hub: 'plateau', number: 'Ligne 5', from: 'Plateau', to: 'Colobane', loop: LOOP, fare: 150, fleet: 2, phase: 17,
    stops: [
      { id: 'sandaga', name: 'Sandaga', leg: 0, at: 90 },
      { id: 'gare', name: 'Gare', leg: 1, at: 82 },
      { id: 'medina', name: 'Médina', leg: 2, at: 85 },
      { id: 'mosquee', name: 'Mosquée', leg: 3, at: 85 },
    ],
    calls: ['Colobane ! Colobane !', 'Petersen ! Petersen !', 'Médina, Médina !', 'Am na place !'],
  },
  {
    id: '8', hub: 'corniche', number: 'Ligne 8', from: 'Fann', to: 'Ouakam', loop: LOOP, fare: 150, fleet: 2, phase: 41,
    stops: [
      { id: 'monument', name: 'Monument', leg: 0, at: 30 },
      { id: 'universite', name: 'Université', leg: 1, at: 35 },
      { id: 'gare', name: 'Gare', leg: 2, at: 35 },
      { id: 'mermoz', name: 'Mermoz', leg: 3, at: 35 },
    ],
    calls: ['Ouakam ! Ouakam !', 'Fann ! Mermoz !', 'Liberté 6 !', 'Am na place !'],
  },
  {
    id: '31', hub: 'almadies', number: 'Ligne 31', from: 'Ngor', to: 'Yoff', loop: LOOP, fare: 200, fleet: 2, phase: 63,
    stops: [
      { id: 'ngor', name: 'Ngor', leg: 0, at: 90 },
      { id: 'mall', name: 'Le Mall', leg: 1, at: 85 },
      { id: 'gare', name: 'Gare', leg: 2, at: 90 },
      { id: 'almadies', name: 'Almadies', leg: 3, at: 85 },
    ],
    calls: ['Ngor ! Yoff !', 'Ouakam !', 'Almadies, Almadies !', 'Am na place !'],
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

/** Lines, calls and replies (French + Wolof, CLAD). Draft for the language review. */
export const SAY = {
  fare: (fare: number) => `L’apprenti : « ${fare} F, jërëjëf ! »`,
  depart: 'Ñu dem !',
  request: (stop: string) => `Toi : « Apprenti, dinaa wàcc ci ${stop} ! » · tak-tak sur la carrosserie`,
  alight: (stop: string) => `${stop} · L’apprenti : « Ba beneen yoon ! »`,
  neighbour: ['« Na nga def ? » · « Maa ngi fi rekk, jërëjëf. »', '« Salaam aleekum ! » · « Maleekum salaam ! »', '« Tangaay bi dafa metti tey… » · « Waaw, dafa tàng. »', '« Fan nga jëm ? » · « Maa ngi dem liggéey. »'],
  waiting: (what: string, s: number) => s <= 2 ? what : `${what} dans ≈ ${Math.ceil(s)} s`,
};
