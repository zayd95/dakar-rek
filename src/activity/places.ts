import type { Affordance, Target, TargetKind, TargetSource } from '../interact/types';
import type { ActivityRunner } from './runner';
import { totals } from './effects';
import type { ActivitySpec } from './types';

/**
 * A place = anchors in the world (a counter, a grill, a prayer row, a mirror, a plot sign…) and the activities
 * offered at each one, composed from the primitives. The same Places registry serves every Dibi, mosque, salon,
 * shop, club, home, beach and plot: no place needs its own interaction code.
 */
export interface Anchor {
  id: string;
  /** Shown above the anchor (defaults to the place name). */
  name?: string;
  kind: TargetKind;
  x: number; z: number;
  /** Prompt height above the ground. */
  y?: number;
  radius?: number;
  bias?: number;
  /** Space of this anchor when it differs from its place's (a mosque's taps in the courtyard, its rows in the hall). */
  space?: string;
}

export interface PlaceSpec {
  id: string;
  /** Template kind: 'dibi', 'mosque', 'salon', 'shop', 'club', 'home', 'market', 'beach', 'plot', 'billboard'… */
  type: string;
  name: string;
  /** 'street' or the interior / venue / vehicle space the anchors live in. */
  space: string;
  /** Opening hours in city hours [open, close) (close may pass midnight, e.g. [20, 4]); absent = always open. */
  hours?: [number, number];
  anchors: Anchor[];
  /** Activities offered at each anchor id. */
  offers: Record<string, ActivitySpec[]>;
  /** Players present share a location chat (Dibi, car rapide, club…). */
  chat?: boolean;
  /**
   * City hours [from, to) when the place draws more people (lunch and evening at a Dibi, prayer times at a mosque):
   * a hint for the NPC activity system and for the place's own ambient crowd. May pass midnight like `hours`.
   */
  peaks?: [number, number][];
}

export const isOpen = (hours: [number, number] | undefined, h: number) =>
  !hours || (hours[0] <= hours[1] ? h >= hours[0] && h < hours[1] : h >= hours[0] || h < hours[1]);
/** True during one of the place's peak windows. */
export const isPeak = (p: Pick<PlaceSpec, 'peaks'>, h: number) => !!p.peaks?.some(w => isOpen(w, h));
/** Space an anchor lives in. */
export const anchorSpace = (p: PlaceSpec, a: Anchor) => a.space ?? p.space;

export class Places implements TargetSource {
  readonly name = 'places';
  private list: PlaceSpec[] = [];
  constructor(private runner: ActivityRunner, private hour: () => number) {}

  add(p: PlaceSpec) { this.remove(p.id); this.list.push(p); return p; }
  remove(id: string) { this.list = this.list.filter(p => p.id !== id); }
  /** Drop every place (hub change), or those of one space. */
  clear(space?: string) { this.list = space === undefined ? [] : this.list.filter(p => p.space !== space); }
  get(id: string) { return this.list.find(p => p.id === id) ?? null; }
  all(): readonly PlaceSpec[] { return this.list; }
  /** The place whose anchors are nearest to (x, z) in this space, within r (location chat, NPC roles…). */
  at(space: string, x: number, z: number, r = 8): PlaceSpec | null {
    let best: PlaceSpec | null = null, bd = r;
    for (const p of this.list) for (const a of p.anchors) { if (anchorSpace(p, a) !== space) continue; const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  collect(space: string, x: number, z: number, out: Target[]) {
    for (const p of this.list) {
      for (const a of p.anchors) {
        if (anchorSpace(p, a) !== space) continue;
        const r = a.radius ?? 2.2;
        if (Math.abs(a.x - x) > r || Math.abs(a.z - z) > r) continue;
        const offers = p.offers[a.id] ?? [];
        if (!offers.some(s => !s.visible || s.visible())) continue;      // nothing offered here right now: leave the focus to others
        out.push({ id: `${p.id}:${a.id}`, name: a.name ?? p.name, kind: a.kind, space, x: a.x, z: a.z, y: a.y, radius: r, bias: a.bias,
          affordances: () => offers.filter(s => !s.visible || s.visible()).map(s => this.affordance(p, s)) });
      }
    }
  }

  private affordance(p: PlaceSpec, s: ActivitySpec): Affordance {
    const { cost, gain } = totals(s.price, s.steps, (m, c) => this.runner.payPreview(m, c));
    const closed = isOpen(p.hours, this.hour()) ? null : `Fermé · ouvre à ${p.hours![0]} h`;
    return { id: s.id, verb: s.primitive, label: s.label, icon: s.icon, detail: s.detail, cost: cost || undefined, gain: gain || undefined,
      disabled: closed ?? this.runner.blocked(s), run: () => { this.runner.start(s, { place: p.name }); } };
  }
}
