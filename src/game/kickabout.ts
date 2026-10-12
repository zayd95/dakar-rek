/**
 * The kickabout ball of the Corniche pitch (docs/VISION.md, decision 4): when no NPC match is played there, a ball
 * (« Ballon ») waits on the grass for whoever walks by. Pure numbers (no Three.js, no DOM; tests/kickabout.test.ts);
 * src/game/football.ts draws it with the match's own ball mesh and reads the player's controls.
 *
 * - Dribbling: walking into the ball gives it small touches ahead of the feet (the player catches it up); standing in its
 *   way stops it (the body pushes it out). The ball itself is the NPC match's (footballSim.ts `stepBall`): friction,
 *   bounces, posts, crossbar, the net, the curb.
 * - Kicking: a pass rolls the ball to a point (another player's feet, a little ahead of them) at a speed that arrives
 *   there still rolling; a shot is struck along the facing — power from the hold time — aimed between the posts when
 *   the goal is roughly ahead (aim help: within SHOT_HELP metres of a post).
 * - Sharing, last touch wins: whoever touched the ball last owns it and sends its state to the room (SEND_MS apart while
 *   it moves, REST_MS at rest). A touch stamps the ball with the shared server time (`touch`), later than any touch seen
 *   before; a state is taken only from a newer touch (or the owner's own updates of the same touch; ties go to the
 *   smaller id), extrapolated by its age with the same physics, the drawn ball easing over the difference.
 */
import { BALL_R, PITCH, passSpeed, stepBall, newBall, type Ball, type BallEvent } from './footballSim';
import type { BallRelay, BallWire } from '../multiplayer/protocol';

/** Body radius the ball keeps out of (m); how often a dribbling touch may come (s); its speed over the runner's (m/s). */
export const DRIBBLE = { body: 0.36, cool: 0.25, lead: 0.7, max: 9, maxH: 0.55 } as const;
/** How far from the body the ball can be kicked (m) and how high (its centre). */
export const KICK_REACH = 1.6, KICK_H = 1.1;
/** Shot speed (m/s) and lift (m/s up) from no power to full power; a straight kick without a receiver. */
export const SHOT = { v0: 13, v1: 28, h0: 1.2, h1: 4.6 } as const, PUNT = 11;
/** The shot's aim help: a facing ray crossing the goal line this close to a post (m) is aimed inside it. */
export const SHOT_HELP = 4;
/** Hold time for a full-power shot (s). */
export const HOLD_FULL = 1.1;
/** Owner's sends (ms): while the ball moves, at rest; a sender's states closer than PEER_MIN_MS are dropped. */
export const SEND_MS = 100, REST_MS = 1000, PEER_MIN_MS = 50;
/** A state is extrapolated by at most EXTRAP_MAX s of age; the drawn ball eases over a gap below SNAP m, jumps beyond. */
export const EXTRAP_MAX = 0.6, SNAP = 3;
/** Seconds in the net before its owner puts the ball back on the centre spot (anyone near after NET_ANY). */
export const NET_BACK = 2.5, NET_ANY = 5;

const hyp = Math.hypot;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Whether a state from `from`, touched at `t`, replaces the ball held as touched at `touch` by `owner`: a later touch
 * wins; the same touch is the owner's own update (taken), or a tie between two claims (the smaller id wins).
 */
export function newerTouch(owner: string, touch: number, from: string, t: number): boolean {
  if (t !== touch) return t > touch;
  return owner === '' || from === owner || from < owner;
}

/** The shot's direction (unit x, z) from the ball along `facing`, aimed inside a goal it would just miss. */
export function aimShot(bx: number, bz: number, facing: number, out: { x: number; z: number }) {
  let dx = Math.sin(facing), dz = Math.cos(facing);
  for (const end of [1, -1]) {
    const X = end * PITCH.hx;
    if (dx * end <= 0.05) continue;
    const t = (X - bx) / dx;
    if (t < 0.5 || t > 32) continue;
    const z = bz + dz * t, lim = PITCH.post - 0.45;
    if (Math.abs(z) > PITCH.post + SHOT_HELP) continue;
    const az = clamp(z, -lim, lim), ax = X - bx, l = hyp(ax, az - bz);
    dx = ax / l; dz = (az - bz) / l;
    break;
  }
  out.x = dx; out.z = dz;
  return out;
}

export type KickKind = 'pass' | 'shot';
export interface GoalNote { end: 1 | -1; by: string; mine: boolean }

export class KickBall {
  readonly ball: Ball = newBall();
  /** Who touched it last ('' nobody yet) and when (shared server ms). */
  owner = ''; touch = 0;
  /** The drawn ball's lag behind the simulated one (eased away), pitch space. */
  ox = 0; oz = 0; oh = 0;
  /** Seconds in a net; the last net a received state was in. */
  netT = 0; private seenNet: -1 | 0 | 1 = 0;
  /** Counts for the checks. */
  stats = { touches: 0, kicks: 0, sent: 0, received: 0, taken: 0, dropped: 0, claims: 0, goals: 0, resets: 0 };
  private cool = 0;
  private sentAt = -Infinity; private urgent = false;
  private peerAt = new Map<string, number>();
  private ev: BallEvent[] = [];
  private readonly wireOut: BallWire = { type: 'ball', x: 0, z: 0, h: BALL_R, vx: 0, vz: 0, vh: 0, n: 0, t: 0, a: 0 };
  private readonly dir = { x: 0, z: 0 };

  /** The ball on the centre spot, nobody's. */
  place(x = 0, z = 0) {
    const b = this.ball; b.x = x; b.z = z; b.h = BALL_R; b.vx = b.vz = b.vh = 0; b.net = 0;
    this.owner = ''; this.touch = 0; this.ox = this.oz = this.oh = 0; this.netT = 0; this.seenNet = 0;
  }

  get moving() { const b = this.ball; return hyp(b.vx, b.vz, b.vh) > 0.02 || b.h > BALL_R + 1e-3; }

  /** This player touched the ball now: it is theirs, stamped later than any touch seen. */
  claim(self: string, now: number) {
    if (this.owner !== self) this.stats.claims++;
    this.owner = self; this.touch = Math.max(Math.round(now), this.touch + 1); this.urgent = true;
  }

  /**
   * One frame: the ball rolls; returns a goal when one is scored by this ball's owner as seen here (the owner's own
   * goal: `mine`), else null. Others' goals come with their states (`receive`).
   */
  step(dt: number, self: string, now: number): GoalNote | null {
    const ev = this.ev; ev.length = 0;
    stepBall(this.ball, dt, ev);
    const k = Math.exp(-8 * dt); this.ox *= k; this.oz *= k; this.oh *= k;
    let goal: GoalNote | null = null;
    for (const e of ev) if (e.kind === 'goal' && (this.owner === self || this.owner === '')) {
      this.stats.goals++; goal = { end: e.end, by: this.owner, mine: self !== '' ? this.owner === self : true };
      this.urgent = true;
    }
    this.netT = this.ball.net ? this.netT + dt : 0;
    if (this.ball.net && (this.netT > NET_ANY || (this.netT > NET_BACK && (this.owner === self || this.owner === '')))) {
      this.place(); this.stats.resets++;
      this.claim(self, now);
    }
    return goal;
  }

  /**
   * The player at (px, pz) moving at (vx, vz) against the ball (pitch space): a touch ahead when running into it, a push
   * out of the body otherwise. True when the ball was touched (then claimed).
   */
  dribble(px: number, pz: number, vx: number, vz: number, dt: number, self: string, now: number): boolean {
    const b = this.ball;
    this.cool -= dt;
    if (b.h > DRIBBLE.maxH || b.net) return false;
    const dx = b.x - px, dz = b.z - pz, d = hyp(dx, dz), R = DRIBBLE.body + BALL_R;
    if (d > R) return false;
    const sp = hyp(vx, vz);
    let touched = false;
    if (sp > 0.6) {
      const ux = vx / sp, uz = vz / sp, ahead = d > 1e-6 ? (dx * ux + dz * uz) / d : 1;
      if (ahead > 0.2 && this.cool <= 0) {
        const v = Math.min(DRIBBLE.max, sp + DRIBBLE.lead);
        b.x = px + ux * R; b.z = pz + uz * R; b.vx = ux * v; b.vz = uz * v; b.vh = 0; b.h = BALL_R;
        this.cool = DRIBBLE.cool; touched = true;
      }
    }
    if (!touched) {
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      b.x = px + nx * R; b.z = pz + nz * R;
      const closing = (vx - b.vx) * nx + (vz - b.vz) * nz;
      if (closing > 0) { b.vx += nx * closing * 1.1; b.vz += nz * closing * 1.1; touched = closing > 0.4; }
      else { const inward = -(b.vx * nx + b.vz * nz); if (inward > 0.3) { b.vx = (b.vx + nx * inward) * 0.3; b.vz = (b.vz + nz * inward) * 0.3; touched = true; } }  // stopped by the body
    }
    if (touched) { this.stats.touches++; this.claim(self, now); }
    return touched;
  }

  /** Whether the player at (px, pz) can kick the ball now. */
  inReach(px: number, pz: number) { const b = this.ball; return !b.net && b.h < KICK_H && hyp(b.x - px, b.z - pz) < KICK_REACH; }

  /**
   * A pass (to `target`, pitch space, or straight along `facing` without one) or a shot (`power` 0–1). False when the
   * ball is out of reach.
   */
  kick(px: number, pz: number, facing: number, kind: KickKind, power: number, target: { x: number; z: number } | null, self: string, now: number): boolean {
    if (!this.inReach(px, pz)) return false;
    const b = this.ball;
    let dx: number, dz: number, v: number, vh = 0;
    if (kind === 'pass') {
      if (target) {
        const tx = target.x - b.x, tz = target.z - b.z, dist = Math.max(0.5, hyp(tx, tz));
        dx = tx / dist; dz = tz / dist; v = clamp(passSpeed(dist, 2.2), 4, 20);
      } else { dx = Math.sin(facing); dz = Math.cos(facing); v = PUNT; }
    } else {
      const p = clamp(power, 0, 1), d = aimShot(b.x, b.z, facing, this.dir);
      dx = d.x; dz = d.z; v = SHOT.v0 + (SHOT.v1 - SHOT.v0) * p; vh = SHOT.h0 + (SHOT.h1 - SHOT.h0) * p;
    }
    b.vx = dx * v; b.vz = dz * v; b.vh = vh; if (b.h < BALL_R) b.h = BALL_R;
    this.cool = DRIBBLE.cool * 2;                                     // the kicker's next step does not stop it
    this.stats.kicks++; this.claim(self, now);
    return true;
  }

  /**
   * A state from another player of the room: taken when it is from a newer touch (`newerTouch`), extrapolated by its age
   * with the ball's own physics; the drawn ball eases over the gap. Returns their goal when the state brings the ball
   * into a net, else null. States closer than PEER_MIN_MS from one sender are dropped.
   */
  receive(m: BallRelay, self: string, now: number): GoalNote | null {
    this.stats.received++;
    const last = this.peerAt.get(m.from);
    const at = performance.now();
    if (last !== undefined && at - last < PEER_MIN_MS) { this.stats.dropped++; return null; }
    if (this.peerAt.size > 64) this.peerAt.clear();
    this.peerAt.set(m.from, at);
    if (m.from === self || !newerTouch(this.owner, this.touch, m.from, m.t)) { this.stats.dropped++; return null; }
    this.stats.taken++;
    const b = this.ball, sx = b.x + this.ox, sz = b.z + this.oz, sh = b.h + this.oh;
    b.x = m.x; b.z = m.z; b.h = Math.max(BALL_R, m.h); b.vx = m.vx; b.vz = m.vz; b.vh = m.vh; b.net = m.n;
    const age = clamp((now - m.a) / 1000, 0, EXTRAP_MAX);
    if (age > 0) stepBall(b, age);
    this.owner = m.from; this.touch = m.t; this.urgent = false;
    this.ox = sx - b.x; this.oz = sz - b.z; this.oh = sh - b.h;
    if (hyp(this.ox, this.oz, this.oh) > SNAP) this.ox = this.oz = this.oh = 0;
    const goal: GoalNote | null = m.n !== 0 && this.seenNet === 0 ? { end: m.n, by: m.from, mine: false } : null;
    this.seenNet = m.n;
    if (goal) this.stats.goals++;
    return goal;
  }

  /** The state to send now, or null: only the owner sends — at once after a touch, SEND_MS apart while it moves, REST_MS at rest. */
  outgoing(self: string, now: number): BallWire | null {
    if (!self || this.owner !== self) return null;
    const since = now - this.sentAt;
    if (!(this.urgent ? since >= SEND_MS * 0.6 : since >= (this.moving ? SEND_MS : REST_MS))) return null;
    const b = this.ball, w = this.wireOut, r = (x: number) => Math.round(x * 1000) / 1000;
    w.x = r(b.x); w.z = r(b.z); w.h = r(b.h); w.vx = r(b.vx); w.vz = r(b.vz); w.vh = r(b.vh); w.n = b.net; w.t = this.touch; w.a = Math.round(now);
    return w;
  }
  /** The state from `outgoing` was sent (false: not relayed, it is tried again next frame). */
  sent(now: number, ok: boolean) { if (ok) { this.sentAt = now; this.urgent = false; this.stats.sent++; } }
  /** Someone joined the room: the owner sends at once. */
  hurry() { this.urgent = true; }
}
