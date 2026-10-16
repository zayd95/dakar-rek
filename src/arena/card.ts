import { placeEvents } from '../ui/placeEvent';

/**
 * The gala card: what is on (the bill) and the moment of the show. It is no longer a card in the middle of the screen
 * (Habib, 12 Oct; docs/UI_V2_PLAN.md §0 C 3): it collapses into the place chip at the top — « LÀMB » and the moment
 * (« Entrée des lutteurs · Malick (Écurie Baobab) – Assane (Écurie Teranga) »), the bill in the details a tap opens
 * (src/ui/placeEvent.ts, src/ui/hud.ts).
 */
export class GalaCard {
  private v: { title: string; sub: string } | null = null;
  private last = '';
  constructor(_root?: HTMLElement) {}
  show(v: { title: string; sub: string } | null) {
    const key = v ? `${v.title}|${v.sub}` : '';
    if (key === this.last) return;
    this.last = key; this.v = v;
    placeEvents.set('gala', v ? { tag: 'LÀMB', line: v.sub, more: [v.title], tone: 'lamb' } : null);
  }
  /** What the card says (debug `arena.info().card`, the checks). */
  get text() { return this.v ? `LÀMB ${this.v.title} ${this.v.sub}` : ''; }
  dispose() { this.show(null); }
}
