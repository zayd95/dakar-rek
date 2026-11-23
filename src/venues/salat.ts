import type { Clip, Humanoid } from '../actors/humanoid';
import type { PrayerClip } from '../actors/prayerPoses';
import { prayerAt, type PrayerTime } from './prayer';

/**
 * The prayer as a sequence of postures (src/actors/prayerPoses.ts), the same for the imam, the congregation and the
 * player: rise → stand → opening takbir → for each rak'a: qiyam → ruku → upright → down → sujud → sitting → sujud
 * (→ the middle sitting after the second rak'a) → … → the last sitting → salutation to the right, then to the left.
 * Each step names the posture held and how long the body takes to blend into it (0.6–1.0 s): no snaps.
 *
 * Postures only: nothing is recited, written or played; no score, no counter, no reward.
 */
export type SalatPhase = 'rise' | 'stand' | 'takbir' | 'qiyam' | 'ruku' | 'itidal' | 'down' | 'sujud' | 'jalsa' | 'up' | 'tashahhud' | 'salamR' | 'salamL' | 'end';
export interface SalatStep { readonly phase: SalatPhase; readonly pose: PrayerClip; readonly t0: number; readonly dur: number; readonly fade: number; readonly rakaa: number }
export interface Salat { readonly rakaat: number; readonly steps: readonly SalatStep[]; readonly total: number }

/** Rak'as of the daily prayers by their Wolof names (Fajar 2, Tisbaar 4, Takusaan 4, Timis 3, Gee 4). */
export const RAKAAT: Readonly<Record<string, number>> = { fajar: 2, tisbaar: 4, takusaan: 4, timis: 3, gee: 4 };
/** A prayer of one's own outside the congregation: two rak'as (a voluntary prayer). */
export const SOLO_RAKAAT = 2;
/** The posture of a worshipper on a row when no prayer is under way (waiting, after the salutation). */
export const AT_REST: PrayerClip = 'PraySit';

/** The sequence of a prayer of `rakaat` rak'as (seconds from the start: the worshippers rising to their feet). */
export function salat(rakaat: number): Salat {
  const steps: SalatStep[] = []; let t = 0;
  const add = (phase: SalatPhase, pose: PrayerClip, dur: number, fade: number, rakaa: number) => { steps.push({ phase, pose, t0: t, dur, fade, rakaa }); t += dur; };
  add('rise', 'PrayDown', 0.9, 0.8, 0);
  add('stand', 'PrayStand', 1.4, 0.9, 0);
  add('takbir', 'PrayTakbir', 1.6, 0.6, 1);
  for (let r = 1; r <= rakaat; r++) {
    add('qiyam', 'PrayStand', r <= 2 ? 4.2 : 3.0, 0.7, r);
    add('ruku', 'PrayBow', 2.6, 1.0, r);
    add('itidal', 'PrayStand', 1.9, 0.9, r);
    add('down', 'PrayDown', 0.9, 0.8, r);
    add('sujud', 'PraySujud', 2.6, 0.7, r);
    add('jalsa', 'PraySit', 1.9, 0.9, r);
    add('sujud', 'PraySujud', 2.6, 0.9, r);
    if (r === rakaat) {
      add('tashahhud', 'PraySit', 5.0, 0.9, r);
      add('salamR', 'PraySalamR', 1.6, 0.7, r);
      add('salamL', 'PraySalamL', 1.9, 1.0, r);
      add('end', 'PraySit', 1.2, 0.8, r);
    } else {
      if (r === 2) add('tashahhud', 'PraySit', 4.0, 0.9, r);
      add('up', 'PrayDown', 0.9, 0.8, r);
    }
  }
  return { rakaat, steps, total: t };
}

/** The step under way `t` seconds into the prayer, or null before its start and after its end. No allocation. */
export function stepAt(s: Salat, t: number): SalatStep | null {
  if (!(t >= 0) || t >= s.total) return null;
  const st = s.steps;
  let lo = 0, hi = st.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st[m].t0 <= t) lo = m; else hi = m - 1; }
  return st[lo];
}

/** Holds `clip` on a body, blending into it over `fade` s when it changes (a body nobody draws takes it at once). */
export function holdPose(h: Humanoid, clip: Clip, fade: number) {
  if (h.clipName !== clip) h.play(clip, h.group.visible ? fade : 0);
  h.hold = clip;
}

/** Follows the prayer `s` at `t` seconds: its posture, or AT_REST outside it. */
export function follow(h: Humanoid, s: Salat | null, t: number, fadeK = 1) {
  const st = s ? stepAt(s, t) : null;
  holdPose(h, st ? st.pose : AT_REST, (st ? st.fade : 0.9) * fadeK);
}

/** How far each follower is behind the imam (s) and how long they take to blend: small, natural, stable per person. */
export function followerLag(i: number): { delay: number; fadeK: number } {
  const u = (k: number) => { const v = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  return { delay: 0.12 + 0.33 * u(0), fadeK: 0.9 + 0.25 * u(1) };
}

const PRAYERS = new Map<number, Salat>();
/** One sequence per number of rak'as (built once). */
export const salatOf = (rakaat: number) => PRAYERS.get(rakaat) ?? PRAYERS.set(rakaat, salat(rakaat)).get(rakaat)!;
/** Seconds the congregation stays seated after the salutation before the prayer is over for good. */
export const LINGER = 8;
/** Joining the congregation is offered until this many seconds before its end. */
export const LAST_CALL = 10;

/**
 * The congregation's clock: seconds since the time of the prayer (when the imam rises), from the city clock every client
 * shares (one city hour = 60 s, src/core/clock.ts) — the same moment of the prayer for everyone. While the hour is held
 * still (the checks' ?heure / setHour) it runs on the frames instead. A prayer is taken up when its window opens
 * (src/venues/prayer.ts) and kept until its end, even past the window: a congregation never stops mid-prayer.
 */
export class CongregationClock {
  prayer: PrayerTime | null = null;
  salat: Salat | null = null;
  t = 0;
  private lastH = NaN;

  update(dt: number, h: number) {
    const moved = h !== this.lastH; this.lastH = h;
    if (!this.prayer) {
      const p = prayerAt(h); if (!p) return;
      this.prayer = p; this.salat = salatOf(RAKAAT[p.id] ?? 2); this.t = since(h, p.hour) * 60;
      return;
    }
    const target = since(h, this.prayer.hour) * 60;
    // the hour moves: follow the city's clock (a jump too: a new hour set by the checks); held still: the frames
    this.t = moved ? target : this.t + dt;
    if (this.t >= this.salat!.total + LINGER && prayerAt(h) !== this.prayer || Math.abs(target) > 3 * 3600) { this.prayer = null; this.salat = null; this.update(0, h); }
  }
  /** The prayer is under way (from the rise to the last salutation). */
  get running() { return !!this.salat && this.t >= 0 && this.t < this.salat.total; }
  /** The congregation is there: gathering, praying or still seated after the salutation. */
  get present() { return !!this.salat && this.t < this.salat.total + LINGER; }
  /** The player can still join it. */
  get open() { return !!this.salat && this.t < this.salat.total - LAST_CALL; }
  /** The step the imam is on, or null. */
  get step() { return this.salat ? stepAt(this.salat, this.t) : null; }
}

/** Signed city hours from `hour` to `h` (−12…12). */
const since = (h: number, hour: number) => { const d = (((h - hour) % 24) + 24) % 24; return d >= 12 ? d - 24 : d; };
