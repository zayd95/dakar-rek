import type { GameState } from '../core/state';
import type { Clip } from '../actors/humanoid';
import type { Seat, Seats } from '../interact/seats';
import { applyEffects, type EffectHooks } from './effects';
import type { ActivityCategory, ActivityCtx, ActivitySpec, SeatPick, Step } from './types';

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
  /** Sit the player on this seat; false if it could not. */
  sit(seat: Seat): boolean;
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

interface Running { spec: ActivitySpec; ctx: ActivityCtx; i: number; t: number; notes: string[] }

/**
 * Plays any ActivitySpec: charge the price, then each step in order — take a seat if asked, hold a clip, show the
 * progress, apply the step's effects when it ends, run its follow-up. The player can stop at any moment (the price is
 * not refunded; effects of unfinished steps are not applied). One activity at a time.
 */
export class ActivityRunner {
  private cur: Running | null = null;
  /** Called when an activity finishes or stops (main.ts gives control back). */
  onEnd: (spec: ActivitySpec, done: boolean) => void = () => {};

  constructor(private s: ActivityServices) {}

  get running() { return this.cur !== null; }
  get current(): { spec: ActivitySpec; step: Step; index: number; t: number } | null {
    const c = this.cur; return c ? { spec: c.spec, step: c.spec.steps[c.i], index: c.i, t: c.t } : null;
  }

  /** Money an activity step would pay if done now (polyvalence…), for the prices shown before choosing. */
  payPreview(money: number, c: ActivityCategory | null): number { return this.s.payPreview ? this.s.payPreview(money, c) : money; }

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
      const seat = this.pickSeat(step.seat);
      if (seat && this.s.seated()?.id !== seat.id) this.s.sit(seat);
    }
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

  private pickSeat(p: SeatPick): Seat | null {
    const space = this.s.space(), me = this.s.player();
    if (typeof p === 'string') return p === 'near' ? (this.s.seated() ?? this.s.seats.nearestFree(space, me.x, me.z, 8)) : this.s.seats.get(p);
    const list = this.s.seats.inSpace(space).filter(s => !s.occupant && (!p.kind || s.kind === p.kind) && Math.hypot(s.x - p.near.x, s.z - p.near.z) <= (p.r ?? 6));
    list.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    return list[0] ?? null;
  }
}
