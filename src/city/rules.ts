/**
 * Living city rules (pure, unit-tested): how busy the streets are, by hour, by neighbourhood and around events. The
 * modules that draw the people and vehicles read these; nothing here touches three.js or the DOM.
 *
 * Fight evenings at the Pikine arena come every evening (a small neighbourhood card on weekdays, the big gala Friday to
 * Sunday: src/arena/exterior.ts `eveningSize`); the street fills from 16 h, empties while the bouts run and fills again
 * when everyone leaves after them.
 */
export type EveningSize = 'gala' | 'card';
/** How much of a gala's crowd a weekday card brings. */
export const SIZE_SHARE: Record<EveningSize, number> = { gala: 1, card: 0.4 };

/** Piecewise-linear curve through [hour, value] points (hours of the city clock, wrapping at 24). */
export function curve(points: readonly (readonly [number, number])[], hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [h1, v1] = points[i], [h0, v0] = points[i - 1];
    if (h <= h1) return v0 + ((v1 - v0) * (h - h0)) / Math.max(1e-9, h1 - h0);
  }
  return points[points.length - 1][1];
}

/** Arrivals at the arena: building from 16 h to a peak before the first bouts, a trickle while they run. */
const ARRIVE: readonly [number, number][] = [[16, 0], [16.5, 0.25], [17.5, 0.6], [18.5, 1], [19.75, 1], [20.5, 0.35], [22.25, 0.2], [22.5, 0], [24, 0]];
/** Departures: everyone at once after the main bout, then fewer until midnight. */
const LEAVE: readonly [number, number][] = [[0, 0], [22.25, 0], [22.6, 1], [23.4, 0.6], [24, 0]];
/** When the show is over and people go home. */
export const LEAVING_FROM = 22.4;

/** Rush of people coming to the arena (0–1 of a gala's peak) at this hour of a fight evening of this size. */
export const arenaArrivals = (hour: number, size: EveningSize) => curve(ARRIVE, hour) * SIZE_SHARE[size];
/** Rush of people leaving the arena (0–1). */
export const arenaDepartures = (hour: number, size: EveningSize) => curve(LEAVE, hour) * SIZE_SHARE[size];

/**
 * Seconds between two taxis or moto-taxis at the arena's drop-off for a rush r (0–1): one every few seconds at a gala's
 * peak, none when nobody comes; fewer on the low graphics setting.
 */
export function dropInterval(rush: number, low: boolean): number {
  if (rush < 0.05) return Infinity;
  return (low ? 9 : 4.5) / Math.min(1, rush);
}

/** Cars parked round the arena on a fight evening, by graphics quality (none on low, like the hub's parked cars). */
export const ARENA_PARKED: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 6, high: 12 };
