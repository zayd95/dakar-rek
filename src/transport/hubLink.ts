import type { HubId } from '../core/types';
import { GRID, roadCentre } from './lines';

/**
 * A road that really continues from one district into the next. Every district is built on the same street grid, so the outermost cross street of one
 * (its perimeter road, whose centre line is at ±roadCentre) IS the outermost cross street of its neighbour when the two are laid end to end: the car crosses that
 * centre line on a street that runs into it from both sides, and keeps the same lateral position, heading and speed. Nothing is faded and nobody is moved:
 * only the hub that is loaded around the car changes (src/main.ts `crossHub`), at the instant both worlds show the same crossing.
 *
 * One route is open for now: Almadies (south end) ↔ Corniche (north end), along the street of column 1. Anything else keeps the map trip.
 */
export interface HubLink {
  /** Here, the car crosses the line `at` (on the z axis) going `dir` (+1: toward larger z)… */
  from: HubId; at: number; dir: 1 | -1;
  /** …and comes out in `to`, on the line `arrive`, still going the same way. */
  to: HubId; arrive: number;
  /** The street it runs on: x of its centre line, and how far from it the car may be (the carriageway; walls and kerbs stop the rest as always). */
  x: number; half: number;
}

const south = roadCentre(GRID.nb), north = roadCentre(0);
export const LINKS: readonly HubLink[] = [
  { from: 'almadies', at: south, dir: 1, to: 'corniche', arrive: north, x: roadCentre(1), half: 5.5 },
  { from: 'corniche', at: north, dir: -1, to: 'almadies', arrive: south, x: roadCentre(1), half: 5.5 },
];

/** A crossing the car makes this step: the link and the car's pose in the next hub. */
export interface Crossing { link: HubLink; x: number; z: number }

/**
 * Has the car just crossed a link's line? `z0`/`z1` are its positions before and after the step (the line is crossed between them, so a fast step cannot jump over it),
 * `vz` its speed along z (a car going backwards across the line crosses it the other way).
 */
export function crossing(hub: HubId, x: number, z0: number, z1: number, vz: number): Crossing | null {
  for (const l of LINKS) {
    if (l.from !== hub || Math.abs(x - l.x) > l.half) continue;
    if (Math.sign(vz) !== l.dir) continue;
    const passed = l.dir > 0 ? z0 < l.at && z1 >= l.at : z0 > l.at && z1 <= l.at;
    if (passed) return { link: l, x, z: z1 + (l.arrive - l.at) };
  }
  return null;
}

/** Does a hub have a border street leading out of it? (The loaded district keeps its streaming step running for it.) */
export const hasLinks = (hub: HubId) => LINKS.some(l => l.from === hub);

/**
 * Is a point of `hub`'s frame on the way to a border street's line, within the distance the next district is built ahead? `depth` grows as the line gets nearer (the same scale as
 * a corridor's: the district at the far side is built once it passes the threshold, and let go again if the player turns away).
 */
export function approachLink(hub: HubId, x: number, z: number): { to: HubId; depth: number } | null {
  for (const l of LINKS) {
    if (l.from !== hub || Math.abs(x - l.x) > l.half + 8) continue;
    const ahead = (l.at - z) * l.dir;                           // metres still to go to the line, along the way out
    if (ahead >= -4 && ahead < 220) return { to: l.to, depth: 260 - ahead };
  }
  return null;
}
