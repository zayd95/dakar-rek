import './transport.css';
import { placeEvents } from '../ui/placeEvent';

/**
 * The ride card: line number, what is happening (waiting / riding), the next stop and its countdown. It is no longer
 * a card under the place name (Habib, 12 Oct; docs/UI_V2_PLAN.md §0 C 3): it collapses into the place chip at the top —
 * the line's number and where it goes, the next stop on a second line where there is room, a request in red — and a
 * tap shows the details (src/ui/placeEvent.ts, src/ui/hud.ts). One source per card (`id`): the car rapide, the taxi,
 * the player's own car or moto.
 */
export class RideCard {
  private v: { num: string; title: string; sub: string; req?: string | null } | null = null;
  private last = '';
  constructor(_root: HTMLElement | null, private id = 'ride') {}
  /** Shows the card (null hides it). Only notifies when the text changed. */
  show(v: { num: string; title: string; sub: string; req?: string | null } | null) {
    const key = v ? `${v.num}|${v.title}|${v.sub}|${v.req ?? ''}` : '';
    if (key === this.last) return;
    this.last = key; this.v = v;
    placeEvents.set(this.id, v ? { tag: v.num, line: v.title, sub: v.sub, ...(v.req ? { alert: v.req } : {}), tone: 'ride' } : null);
  }
  /** What the card says (debug `card()`, the checks). */
  get text() { return this.v ? [this.v.num, this.v.title, this.v.sub, this.v.req ?? ''].filter(Boolean).join(' ') : ''; }
  dispose() { this.show(null); }
}
