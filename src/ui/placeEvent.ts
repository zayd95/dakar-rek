/**
 * Event cards collapse into the top place chip (docs/UI_V2_PLAN.md §0 C 3): the gala card (src/arena/card.ts), the
 * ride cards (src/transport/ui.ts: car rapide, taxi, the player's own car or moto) and the evening's call
 * (src/arena/eveningCall.ts) each set their event here; the chip shows the most pressing one — a tag and one short line
 * under the place and the time — and a tap opens its details under the chip. Nothing is drawn in the middle of the
 * screen. Pure but for the subscribers (tests/quiet.test.ts); src/ui/hud.ts draws it.
 */
export interface PlaceEvent {
  /** A short tag: « LÀMB », the line's number, an icon. */
  tag: string;
  /** One short line (the moment, the line and its direction, the speed). */
  line: string;
  /** A second, smaller line where there is room (the next stop and its countdown); in the details on a phone. */
  sub?: string;
  /** What a tap shows under the chip, a line each. */
  more?: string[];
  /** A request in red (« Arrêt demandé »). */
  alert?: string;
  /** The tag's colour family. */
  tone?: 'lamb' | 'ride' | 'evening';
}

/** Which source leads when several are on: being carried somewhere first, then the show, then tonight's call. */
export function eventRank(source: string): number {
  if (source === 'gala') return 1;
  if (source === 'evening') return 2;
  return 0;                                                    // ride, taxi, the player's own vehicle
}

export class PlaceEvents {
  private events = new Map<string, PlaceEvent>();
  private subs = new Set<() => void>();
  /** Sets (or with null clears) a source's event. Only notifies when it changed. */
  set(source: string, ev: PlaceEvent | null) {
    const was = this.events.get(source);
    if (!ev) { if (!was) return; this.events.delete(source); }
    else { if (was && JSON.stringify(was) === JSON.stringify(ev)) return; this.events.set(source, ev); }
    for (const f of this.subs) f();
  }
  get(source: string): PlaceEvent | null { return this.events.get(source) ?? null; }
  /** The event the chip shows. */
  current(): { source: string; ev: PlaceEvent } | null {
    let best: { source: string; ev: PlaceEvent } | null = null;
    for (const [source, ev] of this.events) if (!best || eventRank(source) < eventRank(best.source)) best = { source, ev };
    return best;
  }
  on(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
}
export const placeEvents = new PlaceEvents();
/** The text a card used to hold (debug `card` fields, the checks): its tag, line, details and request. */
export const eventText = (ev: PlaceEvent | null) => (ev ? [ev.tag, ev.line, ev.sub ?? '', ...(ev.more ?? []), ev.alert ?? ''].filter(Boolean).join(' ') : '');
