import { PITCH } from '../../src/game/footballSim';
import { rng } from '../../src/core/rng';
import type { CampAction, CampSnapshot } from '../../src/multiplayer/campProtocol';

/**
 * 1.0.1 Grand Camp: a scripted player for the tests and scripts/check-grand-camp.mjs. It reads only what a client gets (the decoded snapshot) and
 * answers only what a client may send (a stick frame: a move vector, a facing, maybe an action with a power), so a match it plays goes through the same
 * path as a person's thumb. The nearest of a team goes for the ball (the taker at a set piece), comes at it from behind facing the goal it attacks,
 * dribbles, now and then passes or pushes the ball ahead, and shoots in range; the others hold a shape that follows the ball.
 */
export interface BotStyle {
  /** Share of the full run (0…1); shooting range (m from the goal); chances per decision to pass and to push; shot power. `still`: stands, never touches. */
  speed: number; shootFrom: number; pass: number; push: number; power: number; still?: boolean;
}
export const STRONG: BotStyle = { speed: 1, shootFrom: 13, pass: 0.15, push: 0.12, power: 0.75 };
export const WEAK: BotStyle = { speed: 0.45, shootFrom: 7, pass: 0.35, push: 0, power: 0.5 };
export const STILL: BotStyle = { speed: 0, shootFrom: 0, pass: 0, push: 0, power: 0, still: true };
/** A warm-up: goes for the ball, passes and pushes it ahead, never shoots. */
export const WARM: BotStyle = { speed: 0.55, shootFrom: 0, pass: 0.45, push: 0.25, power: 0.5 };
export interface BotOut { mx: number; mz: number; f: number; a?: CampAction; p?: number }

const hyp = Math.hypot;
export class CampBot {
  private next = 0;
  private rnd: () => number;
  /** Actions this bot asked for, by kind. */
  readonly asked = { pass: 0, shot: 0, dribble: 0 };
  constructor(readonly sid: number, readonly team: 0 | 1, public style: BotStyle, seed = 1) { this.rnd = rng(seed * 7919 + sid); }

  /** The stick for this snapshot; `teamOf`: every pitch number's team; `t`: the bot's own clock (s), for its decision cadence. */
  think(s: CampSnapshot, teamOf: (sid: number) => 0 | 1 | null, t: number): BotOut {
    const me = s.players.find(p => p.sid === this.sid);
    if (!me || this.style.still) return { mx: 0, mz: 0, f: me?.f ?? 0 };
    const d = this.team === 0 ? 1 : -1, gx = d * PITCH.hx, b = s.ball, st = this.style;
    const toward = (x: number, z: number, speed: number, f?: number): BotOut => {
      const dx = x - me.x, dz = z - me.z, l = hyp(dx, dz);
      const k = l < 0.05 ? 0 : Math.min(1, l / 0.6) * speed;
      return { mx: l > 1e-6 ? (dx / l) * k : 0, mz: l > 1e-6 ? (dz / l) * k : 0, f: f ?? (l > 0.3 ? Math.atan2(dx, dz) : Math.atan2(b.x - me.x, b.z - me.z)) };
    };
    const mine = s.players.filter(p => teamOf(p.sid) === this.team);
    const slot = mine.map(p => p.sid).sort((a, c) => a - c).indexOf(this.sid), n = Math.max(1, mine.length);
    const home = () => {
      const lane = n === 1 ? 0 : (slot / (n - 1) - 0.5) * 2 * (PITCH.hz - 4);
      const depth = slot % 2 === 0 ? -6 : 2;
      return toward(clamp(b.x * 0.6 + depth * d, -PITCH.hx + 2, PITCH.hx - 2), clamp(lane * 0.8 + b.z * 0.3, -PITCH.hz + 1.5, PITCH.hz - 1.5), st.speed * 0.7);
    };
    if (s.phase === 'goal' || s.phase === 'half' || s.phase === 'over') return home();
    const set = s.taker >= 0;
    if (set && teamOf(s.taker) !== this.team) return home();
    let chaser = -1, cd = Infinity;
    if (set) chaser = s.taker;
    else for (const p of mine) { const e = hyp(p.x - b.x, p.z - b.z); if (e < cd || (e === cd && p.sid < chaser)) { cd = e; chaser = p.sid; } }
    if (chaser !== this.sid) return home();
    // the ball's way to the goal (aimed a little inside the posts)
    const tx = gx - b.x, tz = clamp(-b.z, -2, 2) - b.z * 0.2, tl = hyp(tx, tz) || 1, Tx = tx / tl, Tz = tz / tl, face = Math.atan2(Tx, Tz);
    const db = hyp(b.x - me.x, b.z - me.z);
    if ((s.own === this.sid || db < 1.1) && t >= this.next && s.phase === 'play') {
      const dg = hyp(gx - b.x, b.z);
      if (dg < st.shootFrom) { this.next = t + 0.6; this.asked.shot++; return { ...toward(b.x + Tx, b.z + Tz, st.speed, face), a: 'shot', p: st.power }; }
      const mate = mine.filter(p => p.sid !== this.sid && (p.x - me.x) * d > 2).sort((a, c) => hyp(a.x - me.x, a.z - me.z) - hyp(c.x - me.x, c.z - me.z))[0];
      if (mate && this.rnd() < st.pass) { this.next = t + 0.9; this.asked.pass++; const f = Math.atan2(mate.x - me.x, mate.z - me.z); return { ...toward(b.x, b.z, st.speed * 0.5, f), a: 'pass', p: 0.6 }; }
      if (this.rnd() < st.push) { this.next = t + 0.9; this.asked.dribble++; return { ...toward(b.x + Tx, b.z + Tz, st.speed, face), a: 'dribble', p: 0.3 }; }
      this.next = t + 0.3;
    }
    // come at the ball from behind it, facing the goal: every touch on the way plays it forward
    const bx = b.x + b.vx * 0.2, bz = b.z + b.vz * 0.2;
    const behind = (me.x - bx) * Tx + (me.z - bz) * Tz;
    if (behind < -0.15) return toward(bx + Tx * 0.7, bz + Tz * 0.7, st.speed, db < 4 ? face : undefined);
    const side = (me.x - bx) * -Tz + (me.z - bz) * Tx >= 0 ? 1 : -1;
    return toward(bx - Tx * 1.1 - Tz * side * 0.9, bz - Tz * 1.1 + Tx * side * 0.9, st.speed, db < 4 ? face : undefined);
  }
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
