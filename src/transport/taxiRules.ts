import type { HubId } from '../core/types';
import { travelLeg } from '../world/content';
import { GRID, roadCentre } from './lines';
import type { Pt } from './route';

/**
 * Taxis between neighbourhoods, as rules (pure, unit-tested; src/transport/taxi.ts drives them). A taxi leaves its rank
 * along the road grid towards the side of the hub that faces the destination, and arrives in the other hub from the
 * side that faces where it came from, to drop the passenger at a kerb. Senegal drives on the right.
 *
 * Conventions: yaw 0 faces +z, forward = (sin yaw, cos yaw); on the game's maps north is −z and east is +x.
 */
export interface Spot { x: number; z: number; yaw: number }
export type Side = 'x-' | 'x+' | 'z-' | 'z+';

/** Rough places of the neighbourhoods on a map of Dakar (km; x east, z south): which side a taxi leaves by. */
const MAP: Record<HubId, Pt> = { plateau: { x: 2, z: 4 }, corniche: { x: -1, z: 1 }, almadies: { x: -6, z: -3 }, pikine: { x: 8, z: -1 } };

/** The side of hub `from` that faces hub `to`. */
export function exitSide(from: HubId, to: HubId): Side {
  const a = MAP[from], b = MAP[to], dx = b.x - a.x, dz = b.z - a.z;
  return Math.abs(dx) >= Math.abs(dz) ? (dx < 0 ? 'x-' : 'x+') : (dz < 0 ? 'z-' : 'z+');
}
/** The side a taxi coming from `from` enters hub `to` by. */
export const entrySide = (from: HubId, to: HubId): Side => exitSide(to, from);

/** Fare of a taxi ride (game money): the car rapide's price for the trip times 2.5, at least 1 500 F, in hundreds. */
export function taxiFare(from: HubId, to: HubId): number {
  return Math.max(1500, Math.round((travelLeg(from, to).cost * 2.5) / 100) * 100);
}

/** Where a road leaves the map: past the last road node (roads run to ±133 m, the hub's edge is at ±130 m). */
export const EDGE = 136;
const N = GRID.nb;
const nodeIndex = (v: number) => Math.max(0, Math.min(N, Math.round((v - roadCentre(0)) / GRID.pitch)));
const unit = (yaw: number): Pt => ({ x: Math.round(Math.sin(yaw)), z: Math.round(Math.cos(yaw)) });
const sideDir = (s: Side): Pt => (s === 'x-' ? { x: -1, z: 0 } : s === 'x+' ? { x: 1, z: 0 } : s === 'z-' ? { x: 0, z: -1 } : { x: 0, z: 1 });
const rightOf = (d: Pt): Pt => ({ x: -d.z, z: d.x });

/** The road node a vehicle at (x, z) heading `yaw` (along a road) meets next. */
export function nodeAhead(x: number, z: number, yaw: number): Pt {
  const d = unit(yaw);
  if (d.x !== 0) {                                                             // on a road along x (z = const)
    const zc = roadCentre(nodeIndex(z));
    let k = Math.floor((x - roadCentre(0)) / GRID.pitch) + (d.x > 0 ? 1 : 0);
    k = Math.max(0, Math.min(N, k));
    if ((roadCentre(k) - x) * d.x < 2) k = Math.max(0, Math.min(N, k + d.x));
    return { x: roadCentre(k), z: zc };
  }
  const xc = roadCentre(nodeIndex(x));
  let k = Math.floor((z - roadCentre(0)) / GRID.pitch) + (d.z > 0 ? 1 : 0);
  k = Math.max(0, Math.min(N, k));
  if ((roadCentre(k) - z) * d.z < 2) k = Math.max(0, Math.min(N, k + d.z));
  return { x: xc, z: roadCentre(k) };
}

/** Point where the road through `p` going `dir` leaves the map. */
const edgeFrom = (p: Pt, dir: Pt): Pt => ({ x: dir.x ? dir.x * EDGE : p.x, z: dir.z ? dir.z * EDGE : p.z });
const onGrid = (p: Pt) => Math.abs(p.x) <= roadCentre(N) + 0.5 && Math.abs(p.z) <= roadCentre(N) + 0.5;

/**
 * Road nodes (centre lines) from a vehicle at a kerb spot to the edge of the map on `side`: on to the next node, then
 * the turns that lead out (straight on, one turn, or round the block when the exit is behind).
 */
export function routeOut(from: Spot, side: Side): Pt[] {
  const d = unit(from.yaw), want = sideDir(side), n0 = nodeAhead(from.x, from.z, from.yaw);
  const start: Pt = d.x !== 0 ? { x: from.x, z: n0.z } : { x: n0.x, z: from.z };      // abreast on the centre line
  const dot = d.x * want.x + d.z * want.z;
  if (dot > 0) return [start, edgeFrom(n0, want)];                                     // already heading out
  if (dot === 0) return [start, n0, edgeFrom(n0, want)];                               // one turn at the next node
  // the exit is behind: round the block (right, then right again), or left when the right is off the grid
  for (const r of [rightOf(d), { x: -rightOf(d).x, z: -rightOf(d).z }]) {
    const n1 = { x: n0.x + r.x * GRID.pitch, z: n0.z + r.z * GRID.pitch };
    if (onGrid(n1)) return [start, n0, n1, edgeFrom(n1, want)];
  }
  return [start, n0, edgeFrom(n0, want)];
}

/** Road nodes from the edge of the map on `side` to a kerb spot (arriving with the spot's heading), and on past it. */
export function routeIn(to: Spot, side: Side): Pt[] {
  const back = routeOut({ x: to.x, z: to.z, yaw: to.yaw + Math.PI }, side).reverse();
  const d = unit(to.yaw);
  back[back.length - 1] = { x: d.x !== 0 ? to.x : back[back.length - 1].x, z: d.z !== 0 ? to.z : back[back.length - 1].z };
  const end = back[back.length - 1];
  back.push({ x: end.x + d.x * 70, z: end.z + d.z * 70 });                             // drives on after the drop
  return back;
}

/**
 * A kerb spot on the road nearest to (px, pz), on that side, heading the way the traffic goes there (`along` metres
 * further on in that direction). Kerb lane: 4.3 m from the centre line, like parked cars and the car rapide's stops.
 */
export function kerbSpot(px: number, pz: number, along = 0): Spot {
  const rx = roadCentre(nodeIndex(px)), rz = roadCentre(nodeIndex(pz));
  const alongZ = Math.abs(px - rx) <= Math.abs(pz - rz);                               // nearest road: a line x = rx
  const side = Math.sign((alongZ ? px - rx : pz - rz)) || -1;
  const yaw = alongZ ? (side < 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
  const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
  return alongZ ? { x: rx + side * 4.3, z: pz + f.z * along, yaw } : { x: px + f.x * along, z: rz + side * 4.3, yaw };
}
