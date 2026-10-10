import type { GameCtx } from '../game/modules';
import { transport } from '../transport/module';

/**
 * Which car rapides stand at which stops right now (read through the transport lane's debug entry `lines()` until it
 * offers a public `transport.dwellingAt(stopId)`): a set of `${line}:${stop}:${vehicle}` keys. The crowd lane reads it
 * twice a second, to let people get off and on.
 */
type LinesView = { id: string; stops: { id: string }[]; vehicles: { id: string; dwell: number }[] }[];
export function dwellingNow(ctx: GameCtx): Set<string> {
  const out = new Set<string>();
  let lines: LinesView | undefined;
  try { lines = (transport.debug(ctx).transport as { lines?: () => LinesView } | undefined)?.lines?.(); } catch { return out; }
  for (const l of lines ?? []) for (const v of l.vehicles) {
    const s = l.stops[v.dwell];
    if (s) out.add(`${l.id}:${s.id}:${v.id}`);
  }
  return out;
}
/** The stops (`${line}:${stop}`) where a car rapide pulled in since the last look. */
export function newArrivals(before: Set<string>, now: Set<string>): string[] {
  const out: string[] = [];
  for (const k of now) if (!before.has(k)) out.push(k.split(':').slice(0, 2).join(':'));
  return out;
}
