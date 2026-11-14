/**
 * « Le choc » (docs/wrestling/WRESTLING-PLAN.md §5): what a contact does in the player's own bout — the picture holds
 * for an instant (hit-stop), the camera is pushed towards the pair and comes back, the empoignade brings it closer with
 * the two bodies chest to chest, a fall lands with a thud on the sand, and an Android phone buzzes (the « Vibrations »
 * setting, src/transport/haptics.ts). Pure: plain numbers in, plans and framings out; src/lamb/duel.ts applies them in
 * the player's own bout only — never in a watched bout, a headless test, or with the duel's seeded `rand` — so every
 * seeded bout plays out exactly as before. No rule is read or changed here.
 */

/**
 * The events of a bout that are felt:
 * - `quick`, `big`: a clean strike lands (either side); `stagger`: it leaves the other staggering;
 * - `guarded`: a big strike stopped by the guard;
 * - `throw`: a throw lands (or a wrestler goes down in the empoignade): the projection, in both disciplines;
 * - `counter`: the defender's counter turns a throw; `read`: an exchange in the empoignade won by reading his move;
 * - `grip`: the empoignade starts (skin on skin); `fall`: the wrestler thrown lands on the sand.
 */
export type FxEvent = 'quick' | 'big' | 'stagger' | 'guarded' | 'throw' | 'counter' | 'read' | 'grip' | 'fall';
/** Who it concerns, from the player's side: `mine` the player did it (landed it, countered, read); `taken` the player took it (hit, thrown). */
export interface FxWho { mine?: boolean; taken?: boolean }
/** What one event does: the stop (s), the camera's push (share of its distance), a sound, a buzz (ms, or a pattern). */
export interface FxPlan { stop: number; kick: number; sound: 'thud' | 'slap' | null; buzz: number | number[] | null }

/**
 * The numbers (§5's starting points, tuned for a phone; recorded in docs/wrestling/WRESTLING-PLAN.md §5 « Built »):
 * - stops a little above §5's (quick 0.05 → 0.06 s, big 0.09 → 0.10, stagger and throw 0.12 → 0.13) and held for at
 *   least two drawn frames: on a 30 fps phone a 0.05 s stop is one or two frames and reads as a dropped frame, not as
 *   weight. The longest stop wins; stops are never summed.
 * - camera kicks below §5's (quick 4 → 3 %, big 8 → 6 %, stagger 8 → 7 %, fall 10 → 8 %), in 0.05 s and back over
 *   0.25 s, along the camera's own axis: a push, no shake; a smaller push never restarts a bigger one.
 */
export const FX = {
  stop: { quick: 0.06, big: 0.1, stagger: 0.13, guarded: 0.045, throw: 0.13, counter: 0.12 } as Partial<Record<FxEvent, number>>,
  /** A stop holds at least this many drawn frames (a long frame never swallows it). */
  stopFrames: 2,
  kick: { quick: 0.03, big: 0.06, stagger: 0.07, fall: 0.08 } as Partial<Record<FxEvent, number>>,
  /** The push: in over `kickIn` s, back over `kickOut` s. */
  kickIn: 0.05, kickOut: 0.25,
  /** Buzzes (ms): a clean hit taken (stronger for a big one or a stagger), the player's fall, a counter landed. */
  buzz: { quick: 30, big: 40, stagger: 50, fall: [40, 30, 60], counter: 25 },
  /**
   * The empoignade's close-up: `dist` of the fight's camera distance, `lower` m lower, eased over `ease` s; the heads
   * `gap` px under the HUD above the pair, the feet `room` px over the controls below it; pulled back no farther than
   * `farthest` × the fight's distance when the screen is too short for both.
   */
  clinch: { dist: 0.7, lower: 0.4, ease: 0.4, gap: 12, room: 6, farthest: 1.25 },
  /** Chest to chest: the centres `dist` m apart (RDA's measured contact separation), closed over `ease` s. */
  contact: { dist: 0.72, ease: 0.15 },
  /**
   * The fall after a projection: the bodies at `slow` × for `slowFor` s (as avec frappe always had), the body on the sand
   * at `land` s (Fall_Back reaches the ground at 0.55 s of its 0.6 s: 0.27 s played slowly, then 0.28 s), the close shot
   * held `close` s sans frappe (avec frappe it opens at 1.2 s for the referee's walk).
   */
  fall: { slow: 0.3, slowFor: 0.9, land: 1.15, close: 1.6 },
} as const;

/** The plan of one event: stop, push, sound and buzz. */
export function plan(e: FxEvent, who: FxWho = {}): FxPlan {
  const stop = FX.stop[e] ?? 0, kick = FX.kick[e] ?? 0;
  const sound = e === 'fall' ? 'thud' : e === 'grip' ? 'slap' : null;
  let buzz: number | number[] | null = null;
  if (who.taken && (e === 'quick' || e === 'big' || e === 'stagger')) buzz = FX.buzz[e];
  else if (who.taken && e === 'fall') buzz = [...FX.buzz.fall];
  else if (who.mine && (e === 'counter' || e === 'read')) buzz = FX.buzz.counter;
  return { stop, kick, sound, buzz };
}

/** The push's shape over time (0…1): eased in over `kickIn`, back to 0 over `kickOut`; 0 outside. */
export function kickShape(t: number): number {
  if (!(t >= 0) || t >= FX.kickIn + FX.kickOut) return 0;
  if (t < FX.kickIn) { const u = t / FX.kickIn; return u * u * (3 - 2 * u); }
  const u = (t - FX.kickIn) / FX.kickOut;
  return (1 - u) * (1 - u);
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * The feel of one bout: the stop under way, the push, the close-up's and the contact's blends, and what was felt (for
 * `duelInfo().fx` and the checks). Real time: `tick` and `holds` take the frame's own seconds, whatever the bout does.
 */
export class DuelFx {
  /** Stops started, the last one's length (s); thuds and slaps played; buzzes asked of the phone, and the last pattern. */
  stops = 0; lastStop = 0; thuds = 0; slaps = 0; buzzes = 0; lastBuzz: number | number[] | null = null;
  private stopLeft = 0;
  private stopFramesLeft = 0;
  private kickAmp = 0;
  private kickT = Infinity;
  private closeP = 0;
  private contactP = 0;

  /** An event: its plan is recorded (stop merged by the longest, push restarted if not smaller); the caller plays the sound and the buzz. */
  hit(e: FxEvent, who: FxWho = {}): FxPlan {
    const p = plan(e, who);
    if (p.stop > 0) {
      this.stops++; this.lastStop = p.stop;
      this.stopLeft = Math.max(this.stopLeft, p.stop); this.stopFramesLeft = Math.max(this.stopFramesLeft, FX.stopFrames);
    }
    if (p.kick > 0 && p.kick >= this.kick) { this.kickAmp = p.kick; this.kickT = 0; }
    if (p.sound === 'thud') this.thuds++; else if (p.sound === 'slap') this.slaps++;
    if (p.buzz !== null) { this.buzzes++; this.lastBuzz = p.buzz; }
    return p;
  }

  /** Whether a stop is under way. */
  get holding() { return this.stopLeft > 0 || this.stopFramesLeft > 0; }
  /** One drawn frame of `dt` s: true while the bout holds (the frame is the stop's), false once it is over. */
  holds(dt: number): boolean {
    if (!this.holding) return false;
    this.stopLeft = Math.max(0, this.stopLeft - dt); this.stopFramesLeft = Math.max(0, this.stopFramesLeft - 1);
    return true;
  }

  /** The camera's push now, as a share of its distance to the pair. */
  get kick() { return this.kickAmp * kickShape(this.kickT); }
  /** The close-up's blend (0: the fight's framing … 1: the empoignade's), eased. */
  get close() { return smooth(this.closeP); }
  /** The bodies' closing (0: where the rules put them … 1: chest to chest), eased. */
  get contact() { return smooth(this.contactP); }

  /** Real time goes by: the push runs, the close-up and the contact ease towards what the bout is doing. */
  tick(dt: number, close: boolean, contact: boolean) {
    this.kickT += dt;
    if (this.kickT >= FX.kickIn + FX.kickOut) { this.kickAmp = 0; this.kickT = Infinity; }
    this.closeP = step(this.closeP, close ? 1 : 0, dt / FX.clinch.ease);
    this.contactP = step(this.contactP, contact ? 1 : 0, dt / FX.contact.ease);
  }
}
const step = (p: number, to: number, by: number) => (to > p ? Math.min(to, p + by) : Math.max(to, p - by));

/** How far each body moves towards the other to stand chest to chest (m), the pair `dist` m apart; never apart. */
export const contactShift = (dist: number) => Math.max(0, (dist - FX.contact.dist) / 2);

/** A side camera's framing of the pair: horizontal distance from the pair, camera height, the look point's height (m). */
export interface Framing { dist: number; height: number; look: number }

/**
 * The screen row (px from the top) of a point `y` m high in the pair's plane, seen with `f` through a vertical field of
 * view `fovY` (degrees) on a screen `h` px tall (the pair stands across the camera's axis, so both are at its depth).
 */
export function rowOf(f: Framing, y: number, fovY: number, h: number): number {
  const th = Math.atan2(f.height - f.look, f.dist), c = Math.cos(th), s = Math.sin(th);
  const ahead = f.dist * c - (y - f.height) * s, up = f.dist * s + (y - f.height) * c;
  return (h / 2) * (1 - up / ahead / Math.tan((fovY * Math.PI) / 360));
}

/**
 * The empoignade's close-up from the fight's framing: `FX.clinch.dist` of its distance and `FX.clinch.lower` m lower,
 * the look point raised just enough for the heads (`head` m high) to sit at row `top` or below — under the HUD over the
 * pair (the Prise) — and the camera pulled back, step by step, until the feet (`feet` m) are at row `bottom` or above —
 * over the controls under the pair — or it is `FX.clinch.farthest` × the fight's distance away. The heads come first: on
 * a screen too short for both, the feet give.
 */
export function clinchFraming(from: Framing, o: { fovY: number; h: number; top: number; bottom: number; head: number; feet: number }): Framing {
  const height = from.height - FX.clinch.lower, far = from.dist * FX.clinch.farthest;
  let f: Framing = { dist: from.dist * FX.clinch.dist, height, look: from.look };
  for (;;) {
    f = { ...f, look: lookFor(f, o) };
    if (rowOf(f, o.feet, o.fovY, o.h) <= o.bottom || f.dist >= far) return f;
    f = { ...f, dist: Math.min(far, f.dist * 1.06) };
  }
}
/** The lowest look point (from the framing's own) that puts the heads at row `top` or below. */
function lookFor(f: Framing, o: { fovY: number; h: number; top: number; head: number }): number {
  if (rowOf(f, o.head, o.fovY, o.h) >= o.top) return f.look;
  let lo = f.look, hi = f.height + f.dist * 0.5;                          // at most looking up a little
  if (rowOf({ ...f, look: hi }, o.head, o.fovY, o.h) < o.top) return hi;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (rowOf({ ...f, look: m }, o.head, o.fovY, o.h) >= o.top) hi = m; else lo = m; }
  return hi;
}
/** Between two framings (`k` 0…1). */
export const mixFraming = (a: Framing, b: Framing, k: number): Framing => ({ dist: a.dist + (b.dist - a.dist) * k, height: a.height + (b.height - a.height) * k, look: a.look + (b.look - a.look) * k });
