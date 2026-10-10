import { transport } from '../transport/module';
import { LINES } from '../transport/lines';

/**
 * The car rapides at the stops, through the transport lane's public stop API (`transport.served`, `transport.dwellingAt`):
 * which stops are served now (Ligne 23's day stops are parked on fight evenings, its evening route `23s` runs instead),
 * which car stands where with its rear door, and how many people a car takes. The crowd lane reads it twice a second.
 */
export interface Dwell { vehicle: string; x: number; z: number; left: number }
export type Dwelling = ReadonlyMap<string, Dwell>;

/** Cars standing at these stops now (`<line>:<stop>` keys). */
export function dwellingAt(keys: readonly string[]): Map<string, Dwell> {
  const out = new Map<string, Dwell>();
  for (const k of keys) { const d = transport.dwellingAt(k); if (d) out.set(k, d); }
  return out;
}
/** Is the stop served now (its line runs)? */
export const stopServed = (key: string): boolean => transport.served(key);

/** The stops where a car pulled in since the last look (a car standing there that was not before). Pure. */
export function newArrivals(before: Dwelling, now: Dwelling): string[] {
  const out: string[] = [];
  for (const [k, d] of now) if (before.get(k)?.vehicle !== d.vehicle) out.push(k);
  return out;
}

/** The share of a line's seats its passengers fill now (`LineDef.fill`, half by default). */
export function lineFill(key: string, day: number, hour: number): number {
  const line = LINES.find(l => l.id === key.split(':')[0]);
  return line?.fill?.(day, hour) ?? 0.5;
}

/** Seconds between two people climbing in at the rear door (they board in turns). */
export const BOARD_GAP = 0.45;
/**
 * How many of the people waiting get on a car standing at their stop (pure):
 *  - an ordinary stop: two or three;
 *  - the riding-home crowd at the arena after the gala: as many as the car takes, up to its fill (the line's share of
 *    its seats; the transport lane always keeps seats free for the player, so they can squeeze in);
 * never more than can climb in, one after the other, before the car leaves (`left` seconds).
 */
export function boardCount(o: { waiting: number; crowd: boolean; seats: number; fill: number; left: number; r: number }): number {
  const want = o.crowd ? Math.round(o.seats * o.fill) : 2 + Math.floor(o.r * 2);
  return Math.max(0, Math.min(o.waiting, want, Math.floor(Math.max(0, o.left - 0.6) / BOARD_GAP) + 1));
}
