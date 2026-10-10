import type { GameState } from '../core/state';
import type { Clip } from '../actors/humanoid';
import { seatClip, type Seat, type Seats } from '../interact/seats';
import { applyEffects, type EffectHooks } from './effects';
import type { ActivityCategory, ActivityCtx, ActivitySpec, Effects, Gesture, SeatPick, Step } from './types';

/** Items an activity takes away (sell, use up), summed over its steps. */
export function itemsUsed(spec: ActivitySpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of spec.steps) for (const [id, n] of Object.entries(s.effects?.items ?? {})) if (n < 0) out[id] = (out[id] ?? 0) - n;
  return out;
}

/** Money a gesture step pays for a score (0…1): at least 30 %, a 20 % tip for a perfect job. */
export function gesturePay(money: number, score: number): number {
  const k = Math.max(0, Math.min(1, score));
  return Math.round(money * (0.3 + 0.7 * k) * (k >= 1 ? 1.2 : 1));
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
  /** Get the player up from their seat (out of bed after sleeping). */
  stand?(): void;
  /** Movement lock while a timed step runs. */
  busy(on: boolean): void;
  progress(on: boolean, pct?: number, label?: string): void;
  /** Play a gesture; call `done(score)` when it ends. Returns a function that aborts it (no `done` afterwards).
   *  Without it, gesture steps fall back to a short timed step with a middling score. */
  gesture?(g: Gesture, label: string, done: (score: number) => void): () => void;
  /** Inventory check for activities that use or sell items. */
  hasItem?(id: string, n: number): boolean;
  toast(msg: string): void;
  save(): void;
}

interface Running { spec: ActivitySpec; ctx: ActivityCtx; i: number; t: number; notes: string[]; abort?: () => void; score?: number; scores: number[] }

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
  get current(): { spec: ActivitySpec; step: Step; index: number; t: number; scores: number[] } | null {
    const c = this.cur; return c ? { spec: c.spec, step: c.spec.steps[c.i], index: c.i, t: c.t, scores: [...c.scores] } : null;
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
    this.cur = { spec, ctx, i: -1, t: 0, notes, scores: [] };
    this.next();
    return true;
  }

  /** Advance by dt real seconds. */
  update(dt: number) {
    const c = this.cur; if (!c) return;
    const step = c.spec.steps[c.i];
    if (c.abort) return;                                      // a gesture is being played: it ends the step itself
    const dur = this.duration(step);
    c.t += dt;
    if (dur > 0) this.s.progress(true, Math.min(1, c.t / dur), step.label);
    if (c.t >= dur) this.finishStep();
  }

  /** Stop now (button « Arrêter », a door, a trip…). */
  cancel(reason = '') {
    const c = this.cur; if (!c) return;
    this.cur = null;
    c.abort?.(); c.abort = undefined;
    this.s.progress(false); this.s.busy(false); this.wakeUp(c.spec); this.s.clip(this.seatPose());
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
    const line = typeof step.line === 'function' ? step.line() : step.line;
    if (line) this.s.toast(line);
    if (step.gesture && this.s.gesture) {
      this.s.busy(true); this.s.progress(false);
      const i = c.i; let ended = false;
      const abort = this.s.gesture(step.gesture, step.label, score => {
        if (ended || this.cur !== c || c.i !== i) return;
        ended = true; c.abort = undefined; c.score = score; this.finishStep();
      });
      if (!ended) c.abort = () => { ended = true; abort(); };
      return;
    }
    if (this.duration(step) > 0) { this.s.busy(true); this.s.progress(true, 0, step.label); }
    else this.finishStep();
  }

  private finishStep() {
    const c = this.cur; if (!c) return;
    const step = c.spec.steps[c.i];
    const label = step.effects?.label ?? (c.ctx.place ? `${c.spec.label} · ${c.ctx.place}` : c.spec.label);
    let fx: Effects | undefined = step.effects;
    if (step.gesture) {
      const score = c.score ?? 0.6; c.score = undefined; c.scores.push(score);
      if (fx?.money && fx.money > 0) fx = { ...fx, money: gesturePay(fx.money, score) };
      c.notes.push(score >= 1 ? 'Parfait !' : score >= 0.6 ? 'Bien joué' : 'Peut mieux faire');
    }
    c.notes.push(...applyEffects(this.s.state, fx, label, this.s));
    step.then?.();
    if (this.cur === c) this.next();                          // a follow-up may have cancelled or started something else
  }

  private finish() {
    const c = this.cur!; this.cur = null;
    this.s.progress(false); this.s.busy(false); this.wakeUp(c.spec); this.s.clip(this.seatPose());
    if (!c.spec.quiet || c.notes.length) this.s.toast([c.spec.label + ' ✓', ...c.notes].join('  '));
    this.s.save();
    this.onEnd(c.spec, true);
  }

  /** Seconds a step lasts; a gesture step without a gesture player becomes a short timed step. */
  private duration(step: Step): number {
    return step.gesture && !this.s.gesture ? (step.seconds ?? 3) : (step.seconds ?? 0);
  }

  /** Sleeping ends out of bed, whether the night was finished or stopped: the player gets up beside it. */
  private wakeUp(spec: ActivitySpec) { if (this.s.seated() && spec.steps.some(st => st.primitive === 'sleep')) this.s.stand?.(); }

  /** Back to the seat's own pose (Sit, Kneel on a prayer row…) or to normal when standing. */
  private seatPose(): Clip | null { const s = this.s.seated(); return s ? seatClip(s) : null; }

  private pickSeat(p: SeatPick): Seat | null {
    const space = this.s.space(), me = this.s.player();
    if (typeof p === 'string') return p === 'near' ? (this.s.seated() ?? this.s.seats.nearestFree(space, me.x, me.z, 8)) : this.s.seats.get(p);
    const list = this.s.seats.inSpace(space).filter(s => !s.occupant && (!p.kind || s.kind === p.kind) && Math.hypot(s.x - p.near.x, s.z - p.near.z) <= (p.r ?? 6));
    list.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    return list[0] ?? null;
  }
}
