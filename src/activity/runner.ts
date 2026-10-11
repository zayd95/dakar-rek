import type { GameState } from '../core/state';
import type { Clip } from '../actors/humanoid';
import type { Seat, Seats } from '../interact/seats';
import { applyEffects, type EffectHooks } from './effects';
import type { ActivityCtx, ActivitySpec, SeatPick, Step } from './types';

/** Items an activity takes away (sell, use up), summed over its steps. */
export function itemsUsed(spec: ActivitySpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of spec.steps) for (const [id, n] of Object.entries(s.effects?.items ?? {})) if (n < 0) out[id] = (out[id] ?? 0) - n;
  return out;
}

/** What the runner needs from the game (main.ts provides it). */
export interface ActivityServices extends EffectHooks {
  state: GameState;
  seats: Seats;
  space(): string;
  player(): { x: number; z: number };
  seated(): Seat | null;
  /** Sit the player on this seat (main.ts walks there first when it is not at hand); false if it cannot be reached. */
  sit(seat: Seat): boolean;
  /** True while the player is still walking to the seat the current step asked for. */
  walking?(): boolean;
  /** Hold a clip on the player's body (null = back to normal). */
  clip(c: Clip | null): void;
  /** Movement lock while a timed step runs. */
  busy(on: boolean): void;
  progress(on: boolean, pct?: number, label?: string): void;
  /** Inventory check for activities that use or sell items. */
  hasItem?(id: string, n: number): boolean;
  toast(msg: string): void;
  save(): void;
}

interface Running { spec: ActivitySpec; ctx: ActivityCtx; i: number; t: number; notes: string[]; walk?: boolean }

/**
 * Plays any ActivitySpec: charge the price, then each step in order — take a seat if asked (and wait while the player
 * walks to it), hold a clip, show the
 * progress, apply the step's effects when it ends, run its follow-up. The player can stop at any moment (the price is
 * not refunded; effects of unfinished steps are not applied). One activity at a time.
 */
export class ActivityRunner {
  private cur: Running | null = null;
  /** Called when an activity finishes or stops (main.ts gives control back). */
  onEnd: (spec: ActivitySpec, done: boolean) => void = () => {};

  constructor(private s: ActivityServices) {}

  get running() { return this.cur !== null; }
  /** The step running now; `walking` while the player is still on the way to the step's seat. */
  get current(): { spec: ActivitySpec; step: Step; index: number; t: number; ctx: ActivityCtx; walking: boolean } | null {
    const c = this.cur; return c ? { spec: c.spec, step: c.spec.steps[c.i], index: c.i, t: c.t, ctx: c.ctx, walking: !!c.walk } : null;
  }

  /** Why the activity cannot start right now, or null. */
  blocked(spec: ActivitySpec): string | null {
    if (this.cur) return 'Termine d’abord ce que tu fais';
    if (spec.visible && !spec.visible()) return 'Indisponible';
    const why = spec.requires?.(); if (why) return why;
    if (spec.price && !this.s.state.canAfford(spec.price)) return 'Pas assez d’argent';
    for (const [id, n] of Object.entries(itemsUsed(spec))) if (this.s.hasItem && !this.s.hasItem(id, n)) return `Il te faut : ${n} × ${id}`;
    return null;
  }

  start(spec: ActivitySpec, ctx: ActivityCtx = {}): boolean {
    const why = this.blocked(spec);
    if (why) { this.s.toast(why); return false; }
    const label = ctx.place ? `${spec.label} · ${ctx.place}` : spec.label;
    const notes: string[] = [];
    if (spec.price) notes.push(...applyEffects(this.s.state, { money: -spec.price, label }, label, this.s));
    this.cur = { spec, ctx, i: -1, t: 0, notes };
    this.next();
    return true;
  }

  /** Advance by dt real seconds. */
  update(dt: number) {
    const c = this.cur; if (!c) return;
    if (c.walk) { if (this.s.walking?.()) return; c.walk = false; this.begin(); return; }
    const step = c.spec.steps[c.i];
    const dur = step.seconds ?? 0;
    c.t += dt;
    if (dur > 0) this.s.progress(true, Math.min(1, c.t / dur), step.label);
    if (c.t >= dur) this.finishStep();
  }

  /** Stop now (button « Arrêter », a door, a trip…). */
  cancel(reason = '') {
    const c = this.cur; if (!c) return;
    this.cur = null;
    this.s.progress(false); this.s.busy(false); this.s.clip(this.s.seated() ? 'Sit' : null);
    if (reason) this.s.toast(reason);
    this.onEnd(c.spec, false);
  }

  private next() {
    const c = this.cur!; c.i++; c.t = 0;
    if (c.i >= c.spec.steps.length) return this.finish();
    const step = c.spec.steps[c.i];
    if (step.seat) {
      const now = this.s.seated();
      for (const seat of this.seatChoices(step.seat)) if (now?.id === seat.id || this.s.sit(seat)) break;   // unreachable: try the next one
      if (this.s.walking?.()) { c.walk = true; this.s.busy(true); this.s.progress(true, 0, step.label); return; }
    }
    this.begin();
  }

  /** The timed part of the current step (after the walk to its seat). */
  private begin() {
    const c = this.cur!, step = c.spec.steps[c.i];
    if (step.clip) this.s.clip(step.clip);
    if ((step.seconds ?? 0) > 0) { this.s.busy(true); this.s.progress(true, 0, step.label); }
    else this.finishStep();
  }

  private finishStep() {
    const c = this.cur; if (!c) return;
    const step = c.spec.steps[c.i];
    const label = step.effects?.label ?? (c.ctx.place ? `${c.spec.label} · ${c.ctx.place}` : c.spec.label);
    c.notes.push(...applyEffects(this.s.state, step.effects, label, this.s));
    step.then?.();
    if (this.cur === c) this.next();                          // a follow-up may have cancelled or started something else
  }

  private finish() {
    const c = this.cur!; this.cur = null;
    this.s.progress(false); this.s.busy(false); this.s.clip(this.s.seated() ? 'Sit' : null);
    if (!c.spec.quiet || c.notes.length) this.s.toast([c.spec.label + ' ✓', ...c.notes].join('  '));
    this.s.save();
    this.onEnd(c.spec, true);
  }

  /** Seats that fit the pick, best first: the one the player already sits on, else the free ones nearest to the player. */
  private seatChoices(p: SeatPick): Seat[] {
    if (typeof p === 'string' && p !== 'near') { const s = this.s.seats.get(p); return s ? [s] : []; }
    const o = p === 'near' ? {} : p, me = this.s.player(), now = this.s.seated();
    const at = o.near ?? me, r = o.r ?? (o.near ? 6 : 8);
    const fits = (s: Seat) => (!o.kind || s.kind === o.kind) && Math.hypot(s.x - at.x, s.z - at.z) <= r;
    if (now && fits(now)) return [now];
    return this.s.seats.inSpace(this.s.space()).filter(s => !s.occupant && fits(s))
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, 6);
  }
}
