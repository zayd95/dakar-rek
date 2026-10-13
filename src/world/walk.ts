import type { HubId } from '../core/types';
import { HUB_IDS } from '../core/types';
import type { GameState } from '../core/state';
import { HUB_NAMES, travelLeg } from './content';

/**
 * « Aller à pied » between neighbourhoods (Habib, 11 Oct; docs/UI_V2_PLAN.md §0 A, §4.3): the player can always go home
 * or reach another neighbourhood on foot — free, at any wallet and any energy (0 F and 0 % included), no daily limit,
 * no counter. Until the roads between neighbourhoods are built, each way out of a neighbourhood (where its middle road
 * leaves the grid, on every side that is not the sea) offers the trip, and so do the gare's sheet and phone › Carte:
 * a fade with « À pied vers Pikine · ≈ 105 min », the needs ticking for that time (energy stops at 0, never blocks
 * it), then the player walks in at the destination's way out that faces where they came from. Pure (tests/walk.test.ts).
 */

/** Walking takes about three times the car rapide's time (rounded to 5 min). */
export const WALK_FACTOR = 3;
export function walkMinutes(a: HubId, b: HubId): number {
  return Math.max(5, Math.round((travelLeg(a, b).minutes * WALK_FACTOR) / 5) * 5);
}
/** The text of the trip's fade (and of its row in the sheets). */
export const walkCard = (to: HubId, minutes: number) => `🚶 À pied vers ${HUB_NAMES[to].split(' · ')[0]} · ≈ ${minutes} min`;

/**
 * Where each neighbourhood lies, in kilometres (x east, z south, the hubs' own frame: north is −z): Plateau at the tip,
 * the Corniche north-west of it, the Almadies further north-west, Pikine to the east.
 */
export const HUB_AT: Record<HubId, { x: number; z: number }> = {
  plateau: { x: 0, z: 0 }, corniche: { x: -3, z: -3 }, almadies: { x: -9, z: -9 }, pikine: { x: 10, z: -6 },
};
export type Side = 'north' | 'south' | 'east' | 'west';
const NORMAL: Record<Side, { x: number; z: number }> = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } };
export interface WayOut { side: Side; x: number; z: number; /** Facing into the neighbourhood (arriving). */ yaw: number }

/**
 * The ways out of a neighbourhood on foot: the ends of its middle roads (x = 0 or z = 0, `reach` metres from the centre),
 * on every side that is not the sea.
 */
export function waysOut(sea: 'west' | 'north' | null | undefined, reach: number): WayOut[] {
  const all: WayOut[] = [
    { side: 'north', x: 0, z: -reach, yaw: 0 }, { side: 'south', x: 0, z: reach, yaw: Math.PI },
    { side: 'east', x: reach, z: 0, yaw: -Math.PI / 2 }, { side: 'west', x: -reach, z: 0, yaw: Math.PI / 2 },
  ];
  return all.filter(w => w.side !== sea);
}
/** The way out of `from` toward `to` (the side facing it best among those that are not the sea). */
export function wayToward(ways: readonly WayOut[], from: HubId, to: HubId): WayOut | null {
  const a = HUB_AT[from], b = HUB_AT[to], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  let best: WayOut | null = null, score = -Infinity;
  for (const w of ways) { const n = NORMAL[w.side], s = (n.x * dx + n.z * dz) / l; if (s > score) { score = s; best = w; } }
  return best;
}
/** Every other neighbourhood, nearest on foot first (the sheets' order). */
export function walkTargets(from: HubId): { hub: HubId; minutes: number }[] {
  return HUB_IDS.filter(h => h !== from).map(h => ({ hub: h, minutes: walkMinutes(from, h) })).sort((a, b) => a.minutes - b.minutes);
}

/** Game time of a trip, as the car rapide's (main.ts doTravel): its minutes at this scale. */
export const TRIP_TIME = 0.15;
/**
 * The walk's effect on the save: the needs tick for its time (energy stops at 0 and never stops the trip), nothing is
 * paid and nothing is counted (no daily limit). Returns the minutes walked.
 */
export function applyWalk(s: GameState, from: HubId, to: HubId): number {
  const minutes = walkMinutes(from, to);
  s.tick(minutes * 60000 * TRIP_TIME);
  return minutes;
}
