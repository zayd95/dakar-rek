/**
 * NPC football on the pitch of the Corniche hub (docs/VISION.md, decision 4): the match itself, in pure numbers (no
 * Three.js; tests/football.test.ts). src/game/football.ts plays it with the city's people and draws the ball.
 *
 * - One ball: it rolls (the grass and the air slow it), flies on an arc when it is lifted, bounces on the ground, off the
 *   posts and the crossbar, stops in the net; the curb round the grass stops it.
 * - Two small teams (2 to 5 a side, a keeper from 3), each player with a role and a state: chase a loose ball, receive
 *   a pass, dribble, pass to the best-placed teammate, shoot in range, keep the goal, press, mark, support.
 * - Every touch of the ball is a contact planned ahead: the player is steered so that, at the planned moment, the ball
 *   is where his kicking foot (a keeper: his hands) meets it (`CONTACT`). If it is not within reach then, nothing
 *   happens: the ball is never drawn to a player. The renderer's leg IK puts the foot on the ball at that frame.
 * - A goal: the scorer runs off and celebrates, his teammates run to him, the keeper fetches the ball and plays it back
 *   to the centre spot, the team that conceded kicks off. Out of play: a kick-in, a corner or a goal clearance, played
 *   with the foot (futsal rules: no hands but the keeper's saves).
 *
 * Pitch space: metres from the centre spot, x along the pitch (team 0 attacks +x), z across; `h` is a height above the
 * grass (the ball's: its centre).
 */
import { rng } from '../core/rng';

export const PITCH = {
  /** Half length (goal lines at ±hx) and half width (touchlines at ±hz). */
  hx: 20, hz: 15,
  /** Posts at z = ±post (centres), their radius; the crossbar's centre height. The net's depth, its back's height. */
  post: 3, postR: 0.1, bar: 2.48, net: 1.2, back: 1.5,
  /** The grass runs this far: the curb round it stops the ball and the players. */
  ex: 22, ez: 17,
} as const;
export const BALL_R = 0.11;
const GRAV = 9.81;
/** Rolling: the grass's resistance (m/s²) plus the air's drag (× speed²); in the air, the drag only. */
export const ROLL = 1.2, DRAG = 0.015;
/** Where the ball is met: ahead of the body (m) and to the side of the kicking foot. A keeper's hands: ahead, any side within ARMS. */
export const CONTACT = { fwd: 0.34, side: 0.13, hands: 0.32, arms: 0.85 } as const;
/** How far the ball may be from the contact point when the contact is due (m), and how high a foot (a keeper's hands) can meet it. */
export const REACH = 0.3, FOOT_H = 0.6, HANDS_H = 2.3;

export type KickKind = 'touch' | 'trap' | 'tackle' | 'pass' | 'shot' | 'save';
/** The leg's swing before the contact and the follow-through after it (s). */
export const SWING: Record<KickKind, number> = { touch: 0.2, trap: 0.22, tackle: 0.24, pass: 0.32, shot: 0.42, save: 0.3 };
export const AFTER: Record<KickKind, number> = { touch: 0.2, trap: 0.18, tackle: 0.22, pass: 0.3, shot: 0.42, save: 0.5 };

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const wrap = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);
const hyp = Math.hypot;

// ------------------------------------------------------------------ the ball

export interface Ball {
  x: number; z: number; h: number; vx: number; vz: number; vh: number;
  /** In a goal's net: +1 (the goal at +x), −1, or 0. */
  net: 0 | 1 | -1;
}
export interface BallEvent { kind: 'post' | 'bar' | 'bounce' | 'goal' | 'net'; x: number; z: number; end: 1 | -1 }

export const newBall = (x = 0, z = 0): Ball => ({ x, z, h: BALL_R, vx: 0, vz: 0, vh: 0, net: 0 });
export const ballSpeed = (b: Ball) => hyp(b.vx, b.vz);
/** The net's roof over a point behind the goal line (it slopes from the crossbar down to the back). */
const roof = (ax: number) => PITCH.bar - 0.1 - ((ax - PITCH.hx) / PITCH.net) * (PITCH.bar - 0.1 - PITCH.back);

/**
 * Advances the ball by `dt` in small steps: rolling or flying, bounces, the posts, the crossbar, the net, the curb.
 * A goal sets `b.net` and adds a 'goal' event (the whole ball over the line, between the posts, under the bar).
 */
export function stepBall(b: Ball, dt: number, ev?: BallEvent[]) {
  const sp = hyp(b.vx, b.vz, b.vh);
  const n = Math.min(32, Math.max(1, Math.ceil(dt * 60), Math.ceil((dt * sp) / 0.05)));
  const s = dt / n;
  for (let i = 0; i < n; i++) sub(b, s, ev);
}

function sub(b: Ball, s: number, ev?: BallEvent[]) {
  const P = PITCH, R = BALL_R;
  const sp = hyp(b.vx, b.vz);
  if (b.h > R + 1e-4 || b.vh > 0) {
    // in the air: gravity and drag
    b.vh -= GRAV * s;
    const k = Math.min(0.5, DRAG * hyp(sp, b.vh) * s);
    b.vx *= 1 - k; b.vz *= 1 - k; b.vh *= 1 - k;
    b.x += b.vx * s; b.z += b.vz * s; b.h += b.vh * s;
    if (b.h <= R) {
      b.h = R;
      if (b.vh < -1.2) { b.vh = -b.vh * 0.5; b.vx *= 0.82; b.vz *= 0.82; ev?.push({ kind: 'bounce', x: b.x, z: b.z, end: 1 }); }
      else b.vh = 0;
    }
  } else if (sp > 0) {
    // rolling: rough beyond the lines
    const rough = Math.abs(b.x) > P.hx || Math.abs(b.z) > P.hz ? 2 : 1;
    const dec = (ROLL * rough + DRAG * sp * sp) * s;
    if (sp <= dec) { b.vx = 0; b.vz = 0; }
    else { const f = (sp - dec) / sp; b.vx *= f; b.vz *= f; }
    b.x += b.vx * s; b.z += b.vz * s;
  }
  // the goals: posts, crossbar, the line crossed, the net
  for (const end of [1, -1] as const) {
    const X = end * P.hx;
    if (Math.abs(b.x - X) > 1.6) continue;
    if (b.h < P.bar + 0.1 + R) for (const zp of [P.post, -P.post]) {
      const dx = b.x - X, dz = b.z - zp, d = hyp(dx, dz), m = R + P.postR;
      if (d < m && d > 1e-6) {
        const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
        b.x = X + nx * m; b.z = zp + nz * m;
        if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; ev?.push({ kind: 'post', x: b.x, z: b.z, end }); }
      }
    }
    if (Math.abs(b.z) < P.post) {
      const dx = b.x - X, dy = b.h - P.bar, d = hyp(dx, dy), m = R + P.postR;
      if (d < m && d > 1e-6) {
        const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vh * ny;
        b.x = X + nx * m; b.h = P.bar + ny * m;
        if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vh -= 1.6 * vn * ny; ev?.push({ kind: 'bar', x: b.x, z: b.z, end }); }
      }
    }
  }
  const ax = Math.abs(b.x), end = (b.x > 0 ? 1 : -1) as 1 | -1;
  if (!b.net && ax > P.hx + R && ax < P.hx + 0.8 && Math.abs(b.z) < P.post - P.postR && b.h < P.bar - 0.1) {
    b.net = end; ev?.push({ kind: 'goal', x: b.x, z: b.z, end });
  }
  if (b.net) {
    if (ax < P.hx - R) b.net = 0;                                                  // back out in front of the goal
    else {
      // inside the net: its back, sides and roof take the pace off the ball
      const back = P.hx + P.net - R, side = P.post - P.postR - R, top = roof(Math.min(ax, P.hx + P.net)) - R;
      let hit = false;
      if (ax > back) { b.x = b.net * back; if (b.vx * b.net > 0) b.vx *= -0.15; hit = true; }
      if (Math.abs(b.z) > side) { b.z = Math.sign(b.z) * side; if (b.vz * b.z > 0) b.vz *= -0.2; hit = true; }
      if (b.h > top) { b.h = top; if (b.vh > 0) b.vh *= -0.2; hit = true; }
      if (hit) { b.vx *= 0.6; b.vz *= 0.6; ev?.push({ kind: 'net', x: b.x, z: b.z, end: b.net }); }
    }
  }
  // the curb round the grass
  if (Math.abs(b.x) > P.ex - R) { b.x = Math.sign(b.x) * (P.ex - R); if (b.vx * b.x > 0) b.vx *= -0.3; }
  if (Math.abs(b.z) > P.ez - R) { b.z = Math.sign(b.z) * (P.ez - R); if (b.vz * b.z > 0) b.vz *= -0.3; }
}

/** The ball's path ahead: `n` samples `dt` apart (x, z, h each), the first one where it is now. */
export function ballPath(b: Ball, n: number, dt: number, out: Float64Array, tmp: Ball = newBall()): Float64Array {
  Object.assign(tmp, b);
  for (let k = 0; k < n; k++) {
    if (k > 0) stepBall(tmp, dt);
    out[k * 3] = tmp.x; out[k * 3 + 1] = tmp.z; out[k * 3 + 2] = tmp.h;
  }
  return out;
}

/**
 * Speed to give a rolling ball so that it is still going at `arrive` m/s after `dist` metres (the rolling law above:
 * v² falls by 2·(ROLL + DRAG·v²) per metre).
 */
export function passSpeed(dist: number, arrive: number): number {
  const k = ROLL / DRAG;
  return Math.sqrt(Math.max(0, (arrive * arrive + k) * Math.exp(2 * DRAG * dist) - k));
}
/** How far a ball rolling at `v` m/s goes before it stops. */
export const rollDistance = (v: number) => Math.log((v * v + ROLL / DRAG) / (ROLL / DRAG)) / (2 * DRAG);

// ------------------------------------------------------------------ players

export interface Kick {
  kind: KickKind;
  /** Right foot (1) or left (−1); a keeper's save: the side of the body the ball comes to. */
  side: 1 | -1;
  /** Seconds left to the contact, the leg's swing before it, the follow-through left after it. */
  left: number; swing: number; after: number;
  /** Way the ball goes after the contact (unit), its speed along the ground, its upward speed. */
  dx: number; dz: number; speed: number; lift: number;
  /** A pass: who it is for (−1: none). */
  to: number;
  /** The ball where the contact is planned (refreshed every frame), the yaw the body has then; a save: the hands' offset to the side. */
  bx: number; bz: number; bh: number; yaw: number; lat: number;
  /** The frame of the contact (−1: not yet) and its entry in the log. */
  hit: number; log: number;
}

export interface Player {
  id: number; team: 0 | 1; keeper: boolean;
  /** The stronger foot: 1 right, −1 left. */
  foot: 1 | -1;
  x: number; z: number; vx: number; vz: number; yaw: number;
  /** Top speed (m/s) and skill (0–1). */
  pace: number; skill: number;
  /** Where it goes and how fast; where it looks when slow (null: the ball). */
  tx: number; tz: number; ts: number; look: number | null;
  kick: Kick | null;
  /** Seconds to its next decision; what it decided (the controller: shoot, pass to, dribble along). */
  think: number; plan: { kind: 'shot' | 'pass' | 'dribble'; to: number; dx: number; dz: number; tz: number } | null;
  /** Celebrating (s left: the Celebrate clip is held). */
  cheer: number;
  /** Earliest time it can be on the ball's path, and where (every frame). */
  ti: number; ix: number; iz: number;
  /** Support spot of an attacker (re-picked now and then). */
  sx: number; sz: number; supT: number;
  /** A keeper's dive without a save (hands short of the ball): where the hands go, seconds left. */
  dive: { x: number; z: number; h: number; t: number; T: number } | null;
  /** Seconds on the ball as the controller (a long solo run looks for a pass). */
  held: number;
}

export type Phase = 'kickoff' | 'play' | 'goal' | 'fetch' | 'restart';
export interface ContactRec {
  n: number; t: number; frame: number; who: number; team: 0 | 1; kind: KickKind; side: 1 | -1;
  /** The ball's centre at the contact (pitch space), the distance from the body's contact point to it (m). */
  x: number; z: number; h: number; reach: number;
  /** The ball's speed given; a pass: the teammate it is for. */
  speed: number; to: number;
  /** Distance from the foot (hands) of the drawn body to the ball's surface at that frame (src/game/football.ts), null if not drawn. */
  foot: number | null;
}
export interface MatchEvent {
  kind: 'contact' | 'goal' | 'save' | 'post' | 'bar' | 'out' | 'kickoff' | 'pass-done' | 'pass-lost';
  t: number; team?: 0 | 1; who?: number; rec?: ContactRec; detail?: string;
}
export interface MatchStats {
  contacts: number; touches: number; traps: number; tackles: number; passes: number; completed: number; intercepted: number;
  shots: number; onTarget: number; saves: number; goals: number; kickoffs: number; outs: number; whiffs: number; posts: number;
  celebrations: number; ballTravel: number;
}
const newStats = (): MatchStats => ({ contacts: 0, touches: 0, traps: 0, tackles: 0, passes: 0, completed: 0, intercepted: 0, shots: 0, onTarget: 0, saves: 0, goals: 0, kickoffs: 0, outs: 0, whiffs: 0, posts: 0, celebrations: 0, ballTravel: 0 });

/** Positions of the field players (team frame: x toward the goal attacked, z across), by how many there are. */
const SHAPES: Record<number, readonly (readonly [number, number])[]> = {
  1: [[-4, 0]],
  2: [[-9, -2], [-2, 3]],
  3: [[-10, 0], [-4, -7], [-2, 6]],
  4: [[-12, 0], [-6, -8], [-6, 8], [-1, 0]],
  5: [[-12, -3], [-12, 4], [-5, -9], [-5, 9], [-1, 0]],
};
const PATH_N = 60, PATH_DT = 1 / 20;
const ACC = 7, DEC = 10;

export interface PlayerSpec { id: number; team: 0 | 1; keeper?: boolean; x?: number; z?: number; yaw?: number; foot?: 1 | -1; pace?: number; skill?: number }

export class Match {
  readonly ball: Ball = newBall();
  players: Player[] = [];
  phase: Phase = 'kickoff'; phaseT = 0;
  t = 0; frame = 0;
  score: [number, number] = [0, 0];
  /** The team that kicks off / restarts, its taker, the restart spot (and its kind). */
  kickTeam: 0 | 1 = 0; taker = -1; spotX = 0; spotZ = 0; spotKind: 'kick-in' | 'corner' | 'goal-kick' | 'centre' = 'centre';
  /** The last to touch the ball and his team. */
  last = -1; lastTeam: 0 | 1 | null = null;
  /** A pass on its way. */
  pass: { from: number; to: number; team: 0 | 1; t: number } | null = null;
  scorer = -1; fetcher = -1;
  stats: MatchStats = newStats();
  log: ContactRec[] = [];
  events: MatchEvent[] = [];
  private contactN = 0;
  private rand: () => number;
  private path = new Float64Array(PATH_N * 3);
  private tmpBall = newBall();
  private bev: BallEvent[] = [];
  private byId = new Map<number, Player>();

  constructor(seed = 1) { this.rand = rng(seed); }

  // ------------------------------------------------------------------ roster
  add(s: PlayerSpec): Player {
    const r = this.rand;
    const p: Player = {
      id: s.id, team: s.team, keeper: !!s.keeper, foot: s.foot ?? (r() < 0.78 ? 1 : -1),
      x: s.x ?? 0, z: s.z ?? 0, vx: 0, vz: 0, yaw: s.yaw ?? 0,
      pace: s.pace ?? (s.keeper ? 4.8 : 5.3 + r() * 1.1), skill: s.skill ?? 0.45 + r() * 0.45,
      tx: s.x ?? 0, tz: s.z ?? 0, ts: 0, look: null, kick: null, think: r() * 0.3, plan: null, cheer: 0,
      ti: 99, ix: 0, iz: 0, sx: s.x ?? 0, sz: s.z ?? 0, supT: 0, dive: null, held: 0,
    };
    this.players.push(p); this.byId.set(p.id, p);
    return p;
  }
  remove(id: number) {
    const p = this.byId.get(id); if (!p) return;
    this.players = this.players.filter(q => q !== p); this.byId.delete(id);
    if (this.last === id) this.last = -1;
    if (this.pass && (this.pass.to === id || this.pass.from === id)) this.pass = null;
    if (this.taker === id) this.taker = this.pickTaker(this.kickTeam);
    if (this.fetcher === id) this.fetcher = -1;
    if (this.scorer === id) this.scorer = -1;
  }
  get(id: number) { return this.byId.get(id) ?? null; }
  team(t: 0 | 1) { return this.players.filter(p => p.team === t); }
  /** Makes `id` its team's keeper (and the others field players). */
  setKeeper(team: 0 | 1, id: number | null) { for (const p of this.players) if (p.team === team) { p.keeper = p.id === id; if (p.keeper) p.pace = Math.min(p.pace, 5); } }

  /** A new match: 0–0, the ball on the centre spot, `team` kicks off. */
  reset(team: 0 | 1 = 0) {
    Object.assign(this.ball, newBall());
    this.score = [0, 0]; this.stats = newStats(); this.log = []; this.events = []; this.contactN = 0;
    this.last = -1; this.lastTeam = null; this.pass = null; this.scorer = -1; this.fetcher = -1;
    for (const p of this.players) { p.kick = null; p.cheer = 0; p.dive = null; p.plan = null; }
    this.kickoff(team);
  }

  // ------------------------------------------------------------------ geometry helpers
  /** +1 when the team attacks the goal at +x. */
  dir(team: 0 | 1) { return team === 0 ? 1 : -1; }
  /** The goal a team attacks (x of its line). */
  goalX(team: 0 | 1) { return this.dir(team) * PITCH.hx; }
  /** The body's contact point (pitch space) for a yaw, a foot. */
  static contactPoint(x: number, z: number, yaw: number, side: number, out: { x: number; z: number }) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    out.x = x + s * CONTACT.fwd - c * CONTACT.side * side; out.z = z + c * CONTACT.fwd + s * CONTACT.side * side;
    return out;
  }
  /** The ball `t` s from now (interpolated on the path computed this frame). */
  ballAt(t: number, out: { x: number; z: number; h: number }) {
    const f = clamp(t / PATH_DT, 0, PATH_N - 1), k = Math.min(PATH_N - 2, Math.floor(f)), u = f - k, P = this.path;
    out.x = P[k * 3] + (P[k * 3 + 3] - P[k * 3]) * u; out.z = P[k * 3 + 1] + (P[k * 3 + 4] - P[k * 3 + 1]) * u; out.h = P[k * 3 + 2] + (P[k * 3 + 5] - P[k * 3 + 2]) * u;
    return out;
  }

  // ------------------------------------------------------------------ the frame
  step(dt: number) {
    if (!(dt > 0) || this.players.length === 0) return;
    dt = Math.min(dt, 0.1);
    this.t += dt; this.frame++; this.phaseT += dt;
    const b = this.ball, x0 = b.x, z0 = b.z;
    const ev = this.bev; ev.length = 0;
    stepBall(b, dt, ev);
    this.stats.ballTravel += hyp(b.x - x0, b.z - z0);
    for (const e of ev) this.ballEvent(e);
    if (this.phase === 'play') this.checkOut();
    ballPath(b, PATH_N, PATH_DT, this.path, this.tmpBall);
    for (const p of this.players) this.intercept(p);
    this.phaseLogic(dt);
    for (const p of this.players) this.decide(p, dt);
    for (const p of this.players) this.move(p, dt);
    this.separate();
    this.contacts();
  }

  private ballEvent(e: BallEvent) {
    if (e.kind === 'post' || e.kind === 'bar') { this.stats.posts++; this.events.push({ kind: e.kind, t: this.t }); }
    if (e.kind === 'goal') {
      if (this.phase !== 'play') return;                                // a ball played back into its own net at a restart: not a goal
      const team: 0 | 1 = e.end === 1 ? 0 : 1;
      this.score[team]++; this.stats.goals++; this.stats.celebrations++;
      const own = this.lastTeam !== team;
      let scorer = own ? -1 : this.last;
      if (scorer < 0) { let best = Infinity; for (const p of this.players) if (p.team === team) { const d = hyp(p.x - e.x, p.z - e.z); if (d < best) { best = d; scorer = p.id; } } }
      this.scorer = scorer;
      if (this.pass) { this.pass = null; }
      for (const p of this.players) { if (p.kick && p.kick.hit < 0) p.kick = null; p.plan = null; }
      this.events.push({ kind: 'goal', t: this.t, team, who: scorer, detail: own ? 'own' : '' });
      this.setPhase('goal');
      this.kickTeam = (1 - team) as 0 | 1;
    }
  }

  /** The ball over a line: a kick-in, a corner or a goal clearance (futsal rules, with the foot). */
  private checkOut() {
    const b = this.ball, P = PITCH, R = BALL_R;
    if (b.net) return;
    let team: 0 | 1, kind: Match['spotKind'], sx: number, sz: number;
    if (Math.abs(b.z) > P.hz + R) {
      team = this.lastTeam === null ? 0 : (1 - this.lastTeam) as 0 | 1; kind = 'kick-in';
      sx = clamp(b.x, -P.hx + 1, P.hx - 1); sz = Math.sign(b.z) * (P.hz - 0.25);
    } else if (Math.abs(b.x) > P.hx + R) {
      const end = Math.sign(b.x), defending: 0 | 1 = end > 0 ? 1 : 0;
      if (this.lastTeam === defending) { team = (1 - defending) as 0 | 1; kind = 'corner'; sx = end * (P.hx - 0.35); sz = (b.z >= 0 ? 1 : -1) * (P.hz - 0.35); }
      else { team = defending; kind = 'goal-kick'; sx = end * (P.hx - 2.5); sz = clamp(b.z * 0.3, -2, 2); }
    } else return;
    if (this.pass) { this.events.push({ kind: 'pass-lost', t: this.t, team: this.pass.team, who: this.pass.from, detail: 'out' }); this.pass = null; }
    this.stats.outs++;
    this.events.push({ kind: 'out', t: this.t, team, detail: kind });
    for (const p of this.players) if (p.kick && p.kick.hit < 0) p.kick = null;
    this.kickTeam = team; this.spotKind = kind; this.spotX = sx; this.spotZ = sz;
    this.taker = kind === 'goal-kick' ? (this.team(team).find(p => p.keeper)?.id ?? this.nearest(team, b.x, b.z)) : this.nearest(team, b.x, b.z, true);
    this.setPhase('restart');
  }

  private setPhase(p: Phase) { this.phase = p; this.phaseT = 0; }

  /** Kick-off from the centre spot by `team`. */
  kickoff(team: 0 | 1) {
    this.kickTeam = team; this.spotX = 0; this.spotZ = 0; this.spotKind = 'centre';
    this.taker = this.pickTaker(team);
    for (const p of this.players) { p.cheer = 0; p.plan = null; }
    this.setPhase('kickoff');
  }
  /** The kick-off taker: the field player furthest up (the shape's last). */
  private pickTaker(team: 0 | 1) {
    const field = this.team(team).filter(p => !p.keeper);
    const list = field.length ? field : this.team(team);
    let best = -1, bx = -Infinity;
    for (const p of list) { const x = this.base(p).x * this.dir(team); if (x > bx) { bx = x; best = p.id; } }
    return best;
  }
  private nearest(team: 0 | 1, x: number, z: number, field = false) {
    let best = -1, bd = Infinity;
    for (const p of this.players) if (p.team === team && (!field || !p.keeper || this.team(team).length === 1)) { const d = hyp(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.id; } }
    return best;
  }

  // ------------------------------------------------------------------ where everyone goes

  /** A player's place in his team's shape (pitch space) — before the shifts with the ball. */
  base(p: Player): { x: number; z: number } {
    const d = this.dir(p.team);
    if (p.keeper) return { x: -d * (PITCH.hx - 0.8), z: 0 };
    const field = this.players.filter(q => q.team === p.team && !q.keeper).sort((a, b) => a.id - b.id);
    const shape = SHAPES[clamp(field.length, 1, 5)], i = Math.max(0, field.indexOf(p));
    const s = shape[Math.min(i, shape.length - 1)];
    return { x: s[0] * d, z: s[1] };
  }
  /** Shifted with the ball: up in attack, back and narrower in defence. */
  private formation(p: Player, attacking: boolean | null): { x: number; z: number } {
    const b = this.ball, d = this.dir(p.team), base = this.base(p);
    const bx = b.x * d;
    let x = base.x * d + 0.45 * (bx + 2) + (attacking === true ? 3 : attacking === false ? -2 : 0);
    let z = base.z * (attacking === false ? 0.7 : 1) + 0.3 * b.z;
    x = clamp(x, -PITCH.hx + 3, PITCH.hx - 3); z = clamp(z, -PITCH.hz + 1.5, PITCH.hz - 1.5);
    return { x: x * d, z };
  }

  /** The phase's own business: the celebration, the fetch back to the centre, the end of a kick-off. */
  private phaseLogic(_dt: number) {
    if (this.phase === 'goal') {
      if (this.phaseT > 4.6) {
        const team = this.kickTeam, k = this.team(team).find(p => p.keeper);
        this.fetcher = k?.id ?? this.nearest(team, this.ball.x, this.ball.z);
        this.taker = this.pickTaker(team);
        this.setPhase('fetch');
      }
    } else if (this.phase === 'fetch') {
      if (this.phaseT > 12 || this.fetcher < 0) this.kickoff(this.kickTeam);   // never stuck: the taker goes and gets it
    }
  }

  /** Earliest time each player can be on the ball's path (a high ball: where it comes down), and where. */
  private intercept(p: Player) {
    const P = this.path, sp = hyp(p.vx, p.vz);
    let r = 0;
    for (let k = 0; k < PATH_N; k++) {
      const bx = P[k * 3], bz = P[k * 3 + 1], bh = P[k * 3 + 2];
      const dx = bx - p.x, dz = bz - p.z, d = hyp(dx, dz);
      // turning round costs a little
      const turn = sp > 1 && d > 0.1 ? (1 - (dx * p.vx + dz * p.vz) / (d * sp)) * 0.12 : 0;
      r = Math.max(0, d - 0.45) / p.pace + 0.12 + turn;
      if (bh > FOOT_H) continue;
      if (r <= k * PATH_DT) { p.ti = k * PATH_DT; p.ix = bx; p.iz = bz; return; }
    }
    p.ti = PATH_N * PATH_DT + r; p.ix = P[(PATH_N - 1) * 3]; p.iz = P[(PATH_N - 1) * 3 + 1];
  }

  /** The player of a team who goes for a loose ball: the soonest on it (a keeper only in his own area). */
  private chaser(team: 0 | 1): Player | null {
    let best: Player | null = null;
    const own = -this.dir(team) * PITCH.hx, b = this.ball;
    const keeperZone = Math.abs(b.x - own) < 7 && Math.abs(b.z) < 7;
    for (const p of this.players) {
      if (p.team !== team || (p.keeper && !keeperZone && this.team(team).length > 2)) continue;
      if (!best || p.ti < best.ti) best = p;
    }
    return best;
  }

  /** Who controls the ball now: the last to touch it, close to it, his team in possession, no pass on its way. */
  controller(): Player | null {
    if (this.pass || this.last < 0 || this.lastTeam === null) return null;
    const p = this.byId.get(this.last), b = this.ball;
    if (!p || b.h > 0.9 || ballSpeed(b) > 8) return null;
    return hyp(p.x - b.x, p.z - b.z) < 3.2 ? p : null;
  }

  private decide(p: Player, dt: number) {
    p.think -= dt; p.supT -= dt;
    if (p.cheer > 0) p.cheer = Math.max(0, p.cheer - dt);
    if (p.dive) { p.dive.t -= dt; if (p.dive.t <= -0.6) p.dive = null; }
    if (p.kick) {
      if (p.kick.hit < 0) return;                                        // the planned contact steers the body (move)
      p.kick.after -= dt;
      if (p.kick.after <= 0) p.kick = null;
    }
    p.look = null;
    switch (this.phase) {
      case 'goal': return this.celebrate(p);
      case 'fetch': return this.fetch(p);
      case 'kickoff': case 'restart': return this.setPiece(p);
      default: return this.play(p, dt);
    }
  }

  private go(p: Player, x: number, z: number, speed: number) {
    p.tx = clamp(x, -PITCH.ex - 0.6, PITCH.ex + 0.6); p.tz = clamp(z, -PITCH.ez - 0.6, PITCH.ez + 0.6); p.ts = speed;
  }
  /** Free to plan a new contact (the follow-through of the last one done). */
  private free(p: Player) { return !p.kick; }

  // ------------------------------------------------------------------ open play
  private play(p: Player, dt: number) {
    const b = this.ball, ctl = this.controller();
    const pass = this.pass;
    // the ball's people: the controller, a pass's receiver, the chasers and the presser
    if (ctl === p) { p.held += dt; return this.control(p); }
    if (ctl) {
      if (ctl.team !== p.team) { if (this.chaser(p.team) === p) return this.press(p, ctl); }
      else if (p.keeper) return this.keep(p);
      else return this.support(p);
    } else if (pass && pass.to === p.id) return this.receive(p);
    else if (!pass || pass.team !== p.team) {
      if (this.chaser(p.team) === p) return this.chase(p);
    }
    p.held = 0;
    if (p.keeper) return this.keep(p);
    const attacking = pass ? pass.team === p.team : ctl ? ctl.team === p.team : null;
    if (attacking) return this.support(p);
    this.mark(p);
    void b;
  }

  /** On the ball: shoot, pass or dribble — the decision renewed every few tenths of a second. */
  private control(p: Player) {
    const b = this.ball;
    if (!this.free(p)) { this.go(p, b.x, b.z, p.pace * 0.8); return; }
    if (p.think <= 0 || !p.plan) { p.plan = this.choose(p); p.think = 0.22 + this.rand() * 0.25; }
    const plan = p.plan;
    if (plan.kind === 'shot' && this.planShot(p, plan.tz)) return;
    if (plan.kind === 'pass') { const q = this.byId.get(plan.to); if (q && this.planPass(p, q)) return; }
    if (plan.kind === 'dribble' || plan.kind === 'shot' || plan.kind === 'pass') {
      if (this.planTouch(p, plan.dx, plan.dz)) return;
    }
    // not in reach yet: run on behind the ball
    const a = this.ballAt(0.3, V0);
    this.go(p, a.x - plan.dx * 0.5, a.z - plan.dz * 0.5, p.pace * 0.85);
  }

  /** What the player on the ball does next. */
  private choose(p: Player): NonNullable<Player['plan']> {
    const b = this.ball, d = this.dir(p.team), gx = d * PITCH.hx;
    const dist = hyp(gx - b.x, b.z);
    const angle = Math.abs(Math.atan2(PITCH.post - b.z, Math.abs(gx - b.x)) - Math.atan2(-PITCH.post - b.z, Math.abs(gx - b.x)));
    const pressure = this.pressure(p);
    if (!p.keeper && ((dist < 14 && angle > 0.3) || (dist < 8 && angle > 0.16)) && this.rand() < 0.65 + 0.3 * p.skill) {
      // aim away from the keeper, at a corner, with some error
      const k = this.players.find(q => q.team !== p.team && q.keeper);
      const side = k ? (k.z > b.z * 0.1 ? -1 : 1) : this.rand() < 0.5 ? 1 : -1;
      const tz = side * (1.4 + 1.3 * this.rand()) + (this.rand() - 0.5) * 2 * (0.5 + 0.9 * (1 - p.skill)) * (dist / 12);
      return { kind: 'shot', to: -1, dx: 0, dz: 0, tz };
    }
    const best = this.bestPass(p);
    const drib = this.dribbleDir(p);
    // under pressure, a long time on the ball, or deep in a corner: look for the pass (a cut-back)
    const corner = Math.abs(b.x) > PITCH.hx - 4.5 && b.x * d > 0 && Math.abs(b.z) > PITCH.post + 1;
    const want = p.keeper ? -Infinity : pressure < 2.2 || corner ? -0.6 : p.held > 2.5 ? 0.2 : drib.score + 1.2;
    if (best && (best.score > want || (this.rand() < 0.15 && best.score > 0.6))) return { kind: 'pass', to: best.p.id, dx: 0, dz: 0, tz: 0 };
    if (p.keeper && !best) {
      // no one free: a long ball up the pitch
      return { kind: 'dribble', to: -1, dx: d, dz: 0, tz: 0 };
    }
    return { kind: 'dribble', to: -1, dx: drib.dx, dz: drib.dz, tz: 0 };
  }

  /** Distance from the ball to the nearest opponent. */
  private pressure(p: Player) {
    let m = Infinity; const b = this.ball;
    for (const q of this.players) if (q.team !== p.team && !q.keeper) m = Math.min(m, hyp(q.x - b.x, q.z - b.z));
    return m;
  }

  /** The teammate best placed for a pass: open, the lane clear, further up; null when none is worth it. */
  bestPass(p: Player): { p: Player; score: number } | null {
    const b = this.ball, d = this.dir(p.team);
    let best: { p: Player; score: number } | null = null;
    for (const q of this.players) {
      if (q.team !== p.team || q === p || (q.keeper && !p.keeper && this.team(p.team).length > 2 && q.x * d < b.x * d - 3)) continue;
      const D = hyp(q.x - b.x, q.z - b.z);
      if (D < 3 || D > 26) continue;
      const v0 = Math.min(16, passSpeed(D, 2.5 + 0.1 * D)), vavg = (v0 + 2.5 + 0.1 * D) / 2;
      let risk = 0, open = 6;
      const ux = (q.x - b.x) / D, uz = (q.z - b.z) / D;
      for (const o of this.players) {
        if (o.team === p.team) continue;
        open = Math.min(open, hyp(o.x - q.x, o.z - q.z));
        const s = (o.x - b.x) * ux + (o.z - b.z) * uz;
        if (s < 0.8 || s > D - 0.6) continue;
        const e = Math.abs((o.x - b.x) * uz - (o.z - b.z) * ux);
        const tb = s / vavg, to = Math.max(0, e - 0.5) / o.pace + 0.2;
        if (to < tb) risk += 1 - to / tb + 0.4;
      }
      const progress = (q.x - b.x) * d;
      const gd = hyp(d * PITCH.hx - q.x, q.z);
      const score = progress * 0.3 + Math.min(open, 6) * 0.45 - risk * 2.6 - Math.abs(D - 11) * 0.07 + (gd < 12 ? 1.2 : 0) - (q.keeper ? 1.5 : 0);
      if (!best || score > best.score) best = { p: q, score };
    }
    return best;
  }

  /** The way to dribble: toward the goal, round the opponents, inside the pitch; and how good it is. */
  private dribbleDir(p: Player): { dx: number; dz: number; score: number } {
    const b = this.ball, d = this.dir(p.team), gx = d * PITCH.hx;
    const base = Math.atan2(gx - b.x, -b.z);
    let best = { dx: d, dz: 0, score: -Infinity };
    for (const a of [0, -0.5, 0.5, -1, 1]) {
      // headings from the line to the goal (atan2 of x, z: our yaw convention)
      const yaw = base + a, dx = Math.sin(yaw), dz = Math.cos(yaw);
      const qx = b.x + dx * 3, qz = b.z + dz * 3;
      let near = 6;
      for (const o of this.players) if (o.team !== p.team) near = Math.min(near, hyp(o.x - qx, o.z - qz));
      // never along a line out of play: the touchlines, the goal line beside the goal
      const edge = Math.abs(qz) > PITCH.hz - 1.5 || Math.abs(qx) > PITCH.hx - 0.5 || (qx * d > PITCH.hx - 3 && Math.abs(qz) > PITCH.post + 1.5 && dx * d > 0 && Math.abs(qz) >= Math.abs(b.z) - 0.3) ? 4 : 0;
      const score = near * 0.6 - Math.abs(a) * 0.5 - edge;
      if (score > best.score) best = { dx, dz, score };
    }
    // a heading too far round from where the body faces: turn in steps
    return best;
  }

  /** A loose ball: get on it — stop it (fast) or take it on (slow). */
  private chase(p: Player) {
    const b = this.ball, sp = ballSpeed(b);
    if (this.free(p)) {
      const d = this.dir(p.team);
      if (sp > 3.2 && this.planTrap(p)) return;
      if (sp <= 3.2) {
        const dir = this.dribbleDir(p);
        if (this.planTouch(p, dir.dx, dir.dz, 'touch')) return;
      }
      void d;
    }
    this.go(p, p.ix, p.iz, p.pace);
  }

  /** A pass coming: be on its line and stop it, the first touch already going somewhere. */
  private receive(p: Player) {
    const b = this.ball;
    if (this.free(p)) {
      if (ballSpeed(b) > 1.2 ? this.planTrap(p) : this.planTouch(p, this.dir(p.team), 0, 'trap')) return;
    }
    this.go(p, p.ix, p.iz, p.pace * 0.9);
    p.look = Math.atan2(b.x - p.x, b.z - p.z);
  }

  /** Goal-side of the player on the ball, close; now and then a foot in to poke it away. */
  private press(p: Player, ctl: Player) {
    const b = this.ball, own = -this.dir(p.team) * PITCH.hx;
    const gx = own - b.x, gz = -b.z, g = hyp(gx, gz) || 1;
    this.go(p, b.x + (gx / g) * 0.9, b.z + (gz / g) * 0.9, p.pace * 0.9);
    p.look = Math.atan2(b.x - p.x, b.z - p.z);
    if (!this.free(p) || p.think > 0) return;
    p.think = 0.35 + this.rand() * 0.3;
    if (hyp(b.x - p.x, b.z - p.z) > 1.8 || this.rand() > 0.2 + 0.25 * p.skill) return;
    // only when the ball is loose between two touches: his own next touch later than the tackle
    const k = ctl.kick;
    if (k && k.hit < 0 && k.left < 0.32) return;
    const out = this.dir(p.team), side = this.rand() < 0.5 ? 1 : -1;
    const yaw = Math.atan2(out, 0) + side * (0.3 + this.rand() * 0.6);
    this.planKick(p, 'tackle', Math.sin(yaw), Math.cos(yaw), 3 + this.rand() * 3, 0, -1, [0.24, 0.3]);
  }

  /** Off the ball, attacking: a free spot ahead of or beside the ball, re-picked now and then. */
  private support(p: Player) {
    const b = this.ball, f = this.formation(p, true);
    if (p.supT <= 0) {
      p.supT = 0.9 + this.rand() * 0.8;
      let best = -Infinity;
      for (const [ox, oz] of [[0, 0], [4, 0], [-3, 0], [0, 4], [0, -4], [3, 3], [3, -3]]) {
        const x = clamp(f.x + ox * this.dir(p.team), -PITCH.hx + 1.5, PITCH.hx - 1.5), z = clamp(f.z + oz, -PITCH.hz + 1.2, PITCH.hz - 1.2);
        let open = 6, lane = 4;
        const D = hyp(x - b.x, z - b.z) || 1, ux = (x - b.x) / D, uz = (z - b.z) / D;
        for (const o of this.players) {
          if (o.team === p.team) continue;
          open = Math.min(open, hyp(o.x - x, o.z - z));
          const s = (o.x - b.x) * ux + (o.z - b.z) * uz;
          if (s > 0.5 && s < D) lane = Math.min(lane, Math.abs((o.x - b.x) * uz - (o.z - b.z) * ux));
        }
        let crowd = 0;
        for (const q of this.players) if (q.team === p.team && q !== p) crowd += Math.max(0, 4 - hyp(q.x - x, q.z - z));
        const score = open * 0.5 + lane * 0.6 - crowd * 0.5 - (D < 4 ? 3 : 0) - Math.abs(ox) * 0.05 - Math.abs(oz) * 0.05;
        if (score > best) { best = score; p.sx = x; p.sz = z; }
      }
    }
    const far = hyp(p.sx - p.x, p.sz - p.z);
    this.go(p, p.sx, p.sz, far > 6 ? p.pace * 0.85 : 3);
  }

  /** Off the ball, defending: goal-side of the nearest free attacker, mixed with the shape. */
  private mark(p: Player) {
    const own = -this.dir(p.team) * PITCH.hx, f = this.formation(p, false);
    let target: Player | null = null, bd = Infinity;
    for (const o of this.players) {
      if (o.team === p.team || o.keeper) continue;
      const taken = this.players.some(q => q !== p && q.team === p.team && !q.keeper && hyp(q.tx - o.x, q.tz - o.z) < 2.2 && hyp(q.x - o.x, q.z - o.z) < hyp(p.x - o.x, p.z - o.z));
      const d = hyp(o.x - p.x, o.z - p.z) + (taken ? 8 : 0);
      if (d < bd) { bd = d; target = o; }
    }
    let x = f.x, z = f.z;
    if (target) {
      const gx = own - target.x, gz = -target.z, g = hyp(gx, gz) || 1;
      x = 0.3 * f.x + 0.7 * (target.x + (gx / g) * 1.8); z = 0.3 * f.z + 0.7 * (target.z + (gz / g) * 1.8);
    }
    const far = hyp(x - p.x, z - p.z);
    this.go(p, x, z, far > 4 ? p.pace * 0.85 : 3);
  }

  /** The keeper: on the line between the ball and the goal's centre; a save when a shot comes. */
  private keep(p: Player) {
    const b = this.ball, d = this.dir(p.team), own = -d * PITCH.hx;
    const dist = hyp(b.x - own, b.z);
    const out = clamp(0.6 + dist * 0.07, 0.6, 2.6);
    const ux = (b.x - own) / (dist || 1), uz = b.z / (dist || 1);
    this.go(p, own + ux * out, clamp(uz * out, -PITCH.post + 0.4, PITCH.post - 0.4), 4.2);
    p.look = Math.atan2(b.x - p.x, b.z - p.z);
    if (this.free(p) && !p.dive) this.save(p);
  }

  /** A shot on his goal: where it crosses his line; a save if he can get there (not always), else a dive short of it. */
  private save(p: Player) {
    const b = this.ball, own = -this.dir(p.team) * PITCH.hx;
    if ((b.x - own) * this.dir(p.team) < 0 || ballSpeed(b) < 5 || b.vx * this.dir(p.team) > 0) return;
    const P = this.path, lineX = own + this.dir(p.team) * Math.max(0.3, Math.abs(p.x - own));
    for (let k = 1; k < PATH_N; k++) {
      const x = P[k * 3], z = P[k * 3 + 1], h = P[k * 3 + 2];
      if ((x - lineX) * this.dir(p.team) > 0) continue;
      // the ball reaches the keeper's line at k: on target?
      const t = k * PATH_DT;
      if (Math.abs(z) > PITCH.post + 0.5 || h > PITCH.bar + 0.3 || t > 1.4) return;
      const lat = z - p.z, need = Math.max(0, Math.abs(lat) - CONTACT.arms);
      const can = need <= 4.2 * Math.max(0, t - 0.2) && h < HANDS_H;
      const odds = 0.82 - 0.22 * (Math.abs(lat) / 2.6) - 0.2 * Math.min(1, ballSpeed(b) / 22) + 0.15 * p.skill;
      if (can && this.rand() < odds) {
        const ix = x - b.vx, iz = z - b.vz, n = hyp(ix, iz) || 1;
        const sp = 2 + this.rand() * 3, away = this.rand() < 0.5 ? 1 : -1;
        const dx = (-b.vx / n) * 0.4 + away * 0.6 * 0, dz = clamp(lat, -1, 1) * 0.6 + away * 0.5;
        const m = hyp(dx, dz) || 1;
        this.planKick(p, 'save', dx / m, dz / m, sp, 1.2 + this.rand() * 1.5, -1, [t], clamp(lat, -CONTACT.arms, CONTACT.arms));
        if (p.kick) return;
      }
      // beaten: the dive falls short
      p.dive = { x, z: z - Math.sign(lat || 1) * 0.5, h: Math.min(h, 1.8), t, T: t };
      p.tx = p.x; p.tz = clamp(p.z + Math.sign(lat) * Math.min(Math.abs(lat), 1.2), -PITCH.post, PITCH.post); p.ts = 4;
      return;
    }
  }

  // ------------------------------------------------------------------ set pieces, the goal

  private celebrate(p: Player) {
    const s = this.byId.get(this.scorer);
    const team: 0 | 1 = (1 - this.kickTeam) as 0 | 1;
    if (p.team === team) {
      if (p === s) {
        // off toward the corner, then arms up
        if (this.phaseT < 1.7) { const d = this.dir(team); this.go(p, d * 15, (p.z >= 0 ? 1 : -1) * 12, p.pace * 0.9); }
        else { this.go(p, p.x, p.z, 0); p.cheer = Math.max(p.cheer, 0.3); }
        return;
      }
      if (s && !p.keeper) {
        const a = (p.id * 2.39996) % TAU, tx = s.x + Math.sin(a) * 1.25, tz = s.z + Math.cos(a) * 1.25;
        this.go(p, tx, tz, p.pace * 0.85);
        if (hyp(p.x - s.x, p.z - s.z) < 2) p.cheer = Math.max(p.cheer, 0.3);
        p.look = Math.atan2(s.x - p.x, s.z - p.z);
        return;
      }
      if (p.keeper) { p.cheer = this.phaseT > 0.6 ? Math.max(p.cheer, 0.3) : 0; this.go(p, p.x, p.z, 0); return; }
    }
    // the others walk back to their places
    const k = this.kickoffSpot(p);
    this.go(p, k.x, k.z, 1.4);
  }

  /** Where a player stands for the kick-off: his own half, the other team outside the circle. */
  private kickoffSpot(p: Player) {
    const d = this.dir(p.team), base = this.base(p);
    if (p.id === this.taker) return { x: -d * 0.55, z: 0.25 };
    const lim = p.team === this.kickTeam ? -1.2 : -3.4;
    let x = Math.min(base.x * d * 0.8, lim);
    const z = base.z * 0.9;
    if (p.team !== this.kickTeam && hyp(x, z) < 3.3) x = -3.4;
    return { x: x * d, z };
  }

  private fetch(p: Player) {
    const b = this.ball;
    if (p.id === this.fetcher) {
      if (this.free(p)) {
        const dx = -b.x, dz = -b.z, D = hyp(dx, dz) || 1;
        if (this.planKick(p, 'pass', dx / D, dz / D, passSpeed(D, 0.6), 0, this.taker, [0.32, 0.45, 0.6, 0.8])) return;
      }
      // into the net behind the ball
      const D = hyp(b.x, b.z) || 1;
      this.go(p, b.x + (b.x / D) * 0.45, b.z + (b.z / D) * 0.45, 2.6);
      return;
    }
    const k = this.kickoffSpot(p);
    this.go(p, k.x, k.z, 2.2);
  }

  /** A kick-off or a restart: the taker gets the ball onto the spot, waits for the others, then passes. */
  private setPiece(p: Player) {
    const b = this.ball, spot = { x: this.spotX, z: this.spotZ };
    if (p.id !== this.taker) {
      if (this.phase === 'kickoff') { const k = this.kickoffSpot(p); this.go(p, k.x, k.z, hyp(k.x - p.x, k.z - p.z) > 5 ? 4.5 : 2.4); return; }
      // a restart: the others take their places, the other team 3 m from the spot
      if (p.keeper) return this.keep(p);
      const f = this.formation(p, p.team === this.kickTeam);
      let x = f.x, z = f.z;
      if (p.team !== this.kickTeam) { const dx = x - spot.x, dz = z - spot.z, d = hyp(dx, dz); if (d < 3.2) { x = spot.x + (dx / (d || 1)) * 3.2; z = spot.z + (dz / (d || 1)) * 3.2; } }
      this.go(p, x, z, 3.2);
      return;
    }
    const sp = ballSpeed(b), off = hyp(b.x - spot.x, b.z - spot.z);
    if (!this.free(p)) { this.go(p, b.x, b.z, 2); return; }
    if (sp > 3) {
      // still going: stop it, the first touch toward the spot
      const ux = off > 0.5 ? (spot.x - b.x) / off : this.dir(p.team), uz = off > 0.5 ? (spot.z - b.z) / off : 0;
      if (this.planKick(p, 'trap', ux, uz, Math.min(1.6, passSpeed(Math.max(0, off - 0.5), 0)), 0, -1, TRAP_T)) return;
      this.go(p, p.ix, p.iz, p.pace); return;
    }
    if (off > 1.0) {
      // play it onto the spot, gently
      if (this.planKick(p, 'touch', (spot.x - b.x) / off, (spot.z - b.z) / off, Math.min(4.5, passSpeed(off, 0)), 0, -1, [0.25, 0.35, 0.5, 0.7, 0.9])) return;
      const ux = (spot.x - b.x) / off, uz = (spot.z - b.z) / off;
      this.go(p, b.x - ux * 0.55, b.z - uz * 0.55, p.pace * 0.8);
      return;
    }
    // on the spot: the others in place (or enough waiting), then the pass
    const ready = this.phaseT > 1.2 && (this.phaseT > 5 || this.players.every(q => q === p || hyp(q.tx - q.x, q.tz - q.z) < 1.5));
    const best = this.bestPass(p);
    if (ready) {
      if (best && this.planPass(p, best.p)) return;
      if (!best) { const d = this.dir(p.team); if (this.planKick(p, 'touch', d, 0, 3, 0, -1, [0.3, 0.45, 0.6])) return; }
    }
    // behind the ball, facing the play
    const d = this.dir(p.team), tz = best ? best.p.z - b.z : 0, tx = best ? best.p.x - b.x : d, n = hyp(tx, tz) || 1;
    this.go(p, b.x - (tx / n) * 0.5, b.z - (tz / n) * 0.5, 2);
    p.look = Math.atan2(b.x - p.x, b.z - p.z);
  }

  // ------------------------------------------------------------------ planning a contact

  private planShot(p: Player, tz: number): boolean {
    const gx = this.dir(p.team) * PITCH.hx;
    const T = this.feasible(p, 'shot', SHOT_T, Math.atan2(gx - this.ball.x, tz - this.ball.z));
    if (T === null) return false;
    const B = this.ballAt(T, V1), dx = gx - B.x, dz = tz - B.z, n = hyp(dx, dz) || 1;
    const dist = hyp(gx - B.x, B.z);
    const keeper = this.players.find(q => q.team !== p.team && q.keeper);
    const chip = !!keeper && Math.abs(keeper.x - gx) > 3 && dist < 13 && this.rand() < 0.5;
    const speed = chip ? 8 + dist * 0.25 : 14 + this.rand() * 5, lift = chip ? 5.2 : 0.4 + this.rand() * 2.2;
    return this.planKick(p, 'shot', dx / n, dz / n, speed, lift, -1, [T]);
  }

  private planPass(p: Player, q: Player): boolean {
    const b = this.ball;
    const D0 = hyp(q.x - b.x, q.z - b.z);
    const lead = Math.min(1.2, D0 / 9);
    const tx = clamp(q.x + q.vx * lead * 0.5, -PITCH.hx + 0.8, PITCH.hx - 0.8), tz = clamp(q.z + q.vz * lead * 0.5, -PITCH.hz + 0.8, PITCH.hz - 0.8);
    const T = this.feasible(p, 'pass', PASS_T, Math.atan2(tx - b.x, tz - b.z));
    if (T === null) return false;
    const B = this.ballAt(T, V1), dx = tx - B.x, dz = tz - B.z, D = hyp(dx, dz) || 1;
    const lofted = D > 20 && this.rand() < 0.5;
    const speed = lofted ? Math.min(15, 7 + D * 0.3) : Math.min(16, passSpeed(D, 2.5 + 0.1 * D)), lift = lofted ? 4.5 : 0;
    return this.planKick(p, 'pass', dx / D, dz / D, speed, lift, q.id, [T]);
  }

  /** A dribbling touch along (dx, dz): the ball a little ahead of the runner. */
  private planTouch(p: Player, dx: number, dz: number, kind: KickKind = 'touch'): boolean {
    // never a turn too sharp in one touch
    const want = Math.atan2(dx, dz), y = Math.abs(wrap(want - p.yaw)) > 1.3 ? p.yaw + Math.sign(wrap(want - p.yaw)) * 1.3 : want;
    const ux = Math.sin(y), uz = Math.cos(y);
    const v = hyp(p.vx, p.vz);
    const speed = kind === 'trap' ? 1.2 + this.rand() * 0.6 : clamp(v + 1.3, 2.2, 6.2);
    return this.planKick(p, kind, ux, uz, speed, 0, -1, TOUCH_T);
  }

  /** Stopping a moving ball, the body facing it; the first touch toward the goal or away from the nearest opponent. */
  private planTrap(p: Player): boolean {
    const d = this.dir(p.team);
    let ox = d, oz = -p.z * 0.05, near = Infinity;
    for (const o of this.players) if (o.team !== p.team) { const e = hyp(o.x - p.x, o.z - p.z); if (e < near) { near = e; if (e < 3) { ox = d - (o.x - p.x) / e; oz = -(o.z - p.z) / e; } } }
    const n = hyp(ox, oz) || 1;
    return this.planKick(p, 'trap', ox / n, oz / n, 1.1 + this.rand() * 0.8, 0, -1, TRAP_T);
  }

  /**
   * The soonest of `times` (s from now) at which the body can be where it must be for the contact (the ball then at the
   * contact point, the body facing `yaw`) at a speed it can run; null if none.
   */
  private feasible(p: Player, kind: KickKind, times: readonly number[], yaw: number, lat = 0): number | null {
    const sp = hyp(p.vx, p.vz);
    let best: number | null = null, cost = Infinity;
    for (const T of times) {
      const B = this.ballAt(T, V1);
      if (this.ball.net && kind !== 'pass') return null;
      if (B.h > (kind === 'save' ? HANDS_H : FOOT_H)) continue;
      const X = this.bodyFor(p, kind, B.x, B.z, yaw, lat, V2);
      if (Math.abs(X.x) > PITCH.ex + 0.7 || Math.abs(X.z) > PITCH.ez + 0.7) continue;
      const need = hyp(X.x - p.x, X.z - p.z) / T;
      if (need > p.pace * 1.08 + 0.4) continue;
      const c = Math.abs(need - (kind === 'shot' || kind === 'pass' ? 0.75 : 1) * sp) + 0.6 * T;
      if (c < cost) { cost = c; best = T; }
    }
    return best;
  }

  /** Where the body must be for its contact point to be on (bx, bz) with this yaw. */
  private bodyFor(p: Player, kind: KickKind, bx: number, bz: number, yaw: number, lat: number, out: { x: number; z: number }) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    if (kind === 'save') { out.x = bx - s * CONTACT.hands + c * lat; out.z = bz - c * CONTACT.hands - s * lat; return out; }
    const side = p.foot;
    out.x = bx - s * CONTACT.fwd + c * CONTACT.side * side; out.z = bz - c * CONTACT.fwd - s * CONTACT.side * side;
    return out;
  }

  /** Plans a contact (the soonest feasible of `times`); true if planned. */
  private planKick(p: Player, kind: KickKind, dx: number, dz: number, speed: number, lift: number, to: number, times: readonly number[], lat = 0): boolean {
    if (!this.free(p)) return false;
    // the body's yaw at the contact: along the kick, or (a trap, a save) facing the ball; never turned round more than 2 rad
    let yaw = Math.atan2(dx, dz);
    const b = this.ball;
    if ((kind === 'trap' || kind === 'save') && ballSpeed(b) > 1) yaw = Math.atan2(-b.vx, -b.vz);
    const turn = wrap(yaw - p.yaw);
    if (kind !== 'save' && Math.abs(turn) > 2) yaw = p.yaw + Math.sign(turn) * 2;
    const T = this.feasible(p, kind, times, yaw, lat);
    if (T === null) return false;
    const B = this.ballAt(T, V1);
    p.kick = {
      kind, side: kind === 'save' ? (lat >= 0 ? 1 : -1) : p.foot, left: T, swing: Math.min(T, SWING[kind]), after: AFTER[kind],
      dx, dz, speed, lift, to, bx: B.x, bz: B.z, bh: B.h, yaw, lat, hit: -1, log: -1,
    };
    return true;
  }

  // ------------------------------------------------------------------ moving

  private move(p: Player, dt: number) {
    const k = p.kick;
    if (k && k.hit < 0) {
      // steered onto the contact: the body where it must be when the ball gets there
      k.left -= dt;
      const B = this.ballAt(Math.max(0, k.left), V1);
      k.bx = B.x; k.bz = B.z; k.bh = B.h;
      const X = this.bodyFor(p, k.kind, B.x, B.z, k.yaw, k.lat, V2);
      const f = k.left <= 0 ? 1 : Math.min(1, dt / (k.left + dt));
      let sx = (X.x - p.x) * f, sz = (X.z - p.z) * f;
      const cap = (p.pace * 1.3 + 1) * dt, s = hyp(sx, sz);
      if (s > cap) { sx *= cap / s; sz *= cap / s; }
      p.x += sx; p.z += sz; p.vx = sx / dt; p.vz = sz / dt;
      const ty = Math.min(1, dt / (Math.max(0, k.left - 0.06) + dt));
      p.yaw += clamp(wrap(k.yaw - p.yaw) * ty, -16 * dt, 16 * dt);
      return;
    }
    // toward the target, braking to arrive
    const dx = p.tx - p.x, dz = p.tz - p.z, d = hyp(dx, dz);
    const want = d < 0.12 ? 0 : Math.min(p.ts, Math.sqrt(2 * DEC * 0.6 * Math.max(0, d - 0.1)));
    const wx = d > 1e-6 ? (dx / d) * want : 0, wz = d > 1e-6 ? (dz / d) * want : 0;
    let ax = wx - p.vx, az = wz - p.vz;
    const a = hyp(ax, az), lim = (want < hyp(p.vx, p.vz) ? DEC : ACC) * dt;
    if (a > lim) { ax *= lim / a; az *= lim / a; }
    p.vx += ax; p.vz += az;
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.x = clamp(p.x, -PITCH.ex - 0.8, PITCH.ex + 0.8); p.z = clamp(p.z, -PITCH.ez - 0.8, PITCH.ez + 0.8);
    const v = hyp(p.vx, p.vz), b = this.ball;
    const face = v > 1.3 ? Math.atan2(p.vx, p.vz) : p.look ?? Math.atan2(b.x - p.x, b.z - p.z);
    const rate = (v > 1.3 ? 9 : 5) * dt;
    if (v > 1.3 || hyp(b.x - p.x, b.z - p.z) > 0.6 || p.look !== null) p.yaw += clamp(wrap(face - p.yaw), -rate, rate);
    p.yaw = wrap(p.yaw);
  }

  /** Nobody walks through anybody: pairs too close are pushed apart (a player on his way to a contact is not). */
  private separate() {
    const L = this.players;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz), m = 0.7;
      if (d >= m) continue;
      const ka = a.kick && a.kick.hit < 0 ? 0 : 1, kb = b.kick && b.kick.hit < 0 ? 0 : 1;
      if (!ka && !kb) continue;
      const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, push = (m - d) / (ka + kb);
      a.x -= ux * push * ka; a.z -= uz * push * ka; b.x += ux * push * kb; b.z += uz * push * kb;
    }
  }

  // ------------------------------------------------------------------ contacts

  /** The contacts due this frame: the ball within reach of the contact point, else nothing happens. */
  private contacts() {
    const b = this.ball;
    let done = false;
    for (const p of this.players) {
      const k = p.kick;
      if (!k || k.hit >= 0 || k.left > 1e-6) continue;
      if (done) { p.kick = null; continue; }                             // someone else got there first
      let reach: number;
      if (k.kind === 'save') {
        const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
        const hx = p.x + s * CONTACT.hands - c * k.lat, hz = p.z + c * CONTACT.hands + s * k.lat;
        reach = b.h <= HANDS_H ? hyp(b.x - hx, b.z - hz) : Infinity;
      } else {
        const cp = Match.contactPoint(p.x, p.z, p.yaw, k.side, V2);
        reach = b.h <= FOOT_H && (!b.net || k.kind === 'pass') ? hyp(b.x - cp.x, b.z - cp.z) : Infinity;
      }
      if (reach > REACH) { this.stats.whiffs++; p.kick = null; continue; }
      this.contact(p, k, reach);
      done = true;
    }
    if (done) for (const p of this.players) if (p.kick && p.kick.hit < 0) p.kick = null;
  }

  private contact(p: Player, k: Kick, reach: number) {
    const b = this.ball, prevPass = this.pass, prevTeam = this.lastTeam;
    const rec: ContactRec = { n: this.contactN++, t: +this.t.toFixed(3), frame: this.frame, who: p.id, team: p.team, kind: k.kind, side: k.side, x: b.x, z: b.z, h: b.h, reach, speed: k.speed, to: k.to, foot: null };
    this.log.push(rec); if (this.log.length > 600) this.log.splice(0, this.log.length - 600);
    k.hit = this.frame; k.log = rec.n;
    const st = this.stats;
    st.contacts++;
    // the pass before this contact: completed (a teammate) or lost (an opponent)
    if (prevPass && p.id !== prevPass.from) {
      if (p.team === prevPass.team) { st.completed++; this.events.push({ kind: 'pass-done', t: this.t, team: p.team, who: p.id }); }
      else { st.intercepted++; this.events.push({ kind: 'pass-lost', t: this.t, team: prevPass.team, who: p.id }); }
      this.pass = null;
    } else if (prevPass && p.id === prevPass.from) this.pass = null;
    if (k.kind === 'save') {
      st.saves++;
      b.vx = k.dx * k.speed; b.vz = k.dz * k.speed; b.vh = k.lift;
      this.events.push({ kind: 'save', t: this.t, team: p.team, who: p.id, rec });
    } else {
      b.vx = k.dx * k.speed; b.vz = k.dz * k.speed; b.vh = k.lift;
      if (b.h > BALL_R + 0.02 && k.lift <= 0) b.vh = Math.min(0, b.vh);
    }
    if (k.kind === 'touch') st.touches++;
    if (k.kind === 'trap') st.traps++;
    if (k.kind === 'tackle') st.tackles++;
    if (k.kind === 'pass') { st.passes++; if (k.to >= 0) this.pass = { from: p.id, to: k.to, team: p.team, t: this.t }; const q = this.byId.get(k.to); if (q) q.plan = null; }
    if (k.kind === 'shot') {
      st.shots++;
      // on target: the line crossed between the posts, under the bar (on the predicted path)
      ballPath(b, PATH_N, PATH_DT, this.path, this.tmpBall);
      const gx = this.dir(p.team) * PITCH.hx;
      for (let i = 0; i < PATH_N; i++) if ((this.path[i * 3] - gx) * this.dir(p.team) > 0) { if (Math.abs(this.path[i * 3 + 1]) < PITCH.post && this.path[i * 3 + 2] < PITCH.bar) st.onTarget++; break; }
    }
    p.plan = null; p.held = k.kind === 'touch' || k.kind === 'trap' ? p.held : 0;
    if (prevTeam !== p.team) p.held = 0;
    this.last = p.id; this.lastTeam = p.team;
    this.events.push({ kind: 'contact', t: this.t, team: p.team, who: p.id, rec });
    // a kick-off or a restart taken: open play again
    if ((this.phase === 'kickoff' || this.phase === 'restart') && p.id === this.taker && k.kind === 'pass') {
      if (this.phase === 'kickoff') { st.kickoffs++; this.events.push({ kind: 'kickoff', t: this.t, team: p.team, who: p.id, detail: hyp(b.x, b.z).toFixed(2) }); }
      this.setPhase('play');
    }
    if (this.phase === 'fetch' && p.id === this.fetcher) { this.kickoff(this.kickTeam); if (k.to >= 0) this.pass = { from: p.id, to: k.to, team: p.team, t: this.t }; }
  }
}

const V0 = { x: 0, z: 0, h: 0 }, V1 = { x: 0, z: 0, h: 0 }, V2 = { x: 0, z: 0 };
const TOUCH_T = [0.2, 0.28, 0.36, 0.46, 0.58, 0.72, 0.9];
const TRAP_T = [0.22, 0.3, 0.4, 0.52, 0.66, 0.82, 1.0, 1.2];
const PASS_T = [0.32, 0.4, 0.5, 0.62, 0.76];
const SHOT_T = [0.42, 0.5, 0.6, 0.72, 0.86];
