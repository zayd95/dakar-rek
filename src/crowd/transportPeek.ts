import type { GameCtx } from '../game/modules';
import { transport } from '../transport/module';
import { LINES } from '../transport/lines';

/**
 * Which car rapides stand at which stops right now, through the transport lane's public `transport.dwellingAt(stopId)`
 * (only lines running now: a parked route's cars let nobody on or off): a set of `${line}:${stop}:${vehicle}` keys.
 * The crowd lane reads it twice a second, to let people get off and on.
 */
export function dwellingNow(_ctx: GameCtx): Set<string> {
  const out = new Set<string>();
  for (const l of LINES) for (const s of l.stops) {                 // lines of other hubs are not loaded: null
    const v = transport.dwellingAt(`${l.id}:${s.id}`);
    if (v) out.add(`${l.id}:${s.id}:${v.vehicle}`);
  }
  return out;
}
/** The stops (`${line}:${stop}`) where a car rapide pulled in since the last look. */
export function newArrivals(before: Set<string>, now: Set<string>): string[] {
  const out: string[] = [];
  for (const k of now) if (!before.has(k)) out.push(k.split(':').slice(0, 2).join(':'));
  return out;
}
