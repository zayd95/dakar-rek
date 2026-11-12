import { KickBall, type GoalNote } from '../../src/game/kickabout';
import { Match, PITCH, VEL_SMOOTH } from '../../src/game/footballSim';
import { PlayerBody } from './footballBody';

/**
 * Two ways the player meets the ball, driven frame by frame at 60 fps by the game's own player movement (`PlayerBody`) and the same wiring as the game:
 * the kickabout (src/game/football.ts → kickabout.ts `dribble` / `kick`) and the player in the NPC match (footballSim.ts `humanTick`).
 * Both expose the same few things so one set of expectations holds for both.
 */
export const DT = 1 / 60;
export const E = Math.PI / 2;                 // the yaw of +x: the goal the player attacks (team 0) is at x = +PITCH.hx

export interface Rig {
  readonly name: string;
  readonly body: PlayerBody;
  /** One frame: the stick points to world yaw `want` with push `mag` (0 = let go). */
  step(want: number, mag: number): void;
  /** The ball (pitch space), its pace, and its distance from the body's centre. */
  ball(): { x: number; z: number; h: number; speed: number; vx: number; vz: number };
  dist(): number;
  /** Played touches by the body so far (planned dribbling touches and traps, not passes and shots), and the time of each. */
  touches: number[];
  /** The pass / shot buttons. `target`: where a pass should go (the receiver's feet), pitch space. False when the ball was out of reach. */
  pass(target: { x: number; z: number }): boolean;
  shoot(power: number): boolean;
  /** Goals scored (each counted once), and time (s). */
  goals(): number;
  readonly t: number;
  /** Puts the ball at (x, z) at rest. */
  place(x: number, z: number): void;
  /** Puts the player at (x, z) facing `facing`, at rest (a teleport, not a move). */
  put(x: number, z: number, facing: number): void;
}

export class KickRig implements Rig {
  readonly name = 'kickabout';
  readonly body: PlayerBody;
  readonly kb = new KickBall();
  touches: number[] = [];
  t = 0; private now = 0; private pvx = 0; private pvz = 0; private px: number; private pz: number; private goalCount = 0;
  constructor(start: { x: number; z: number; facing?: number }, ball: { x: number; z: number }) {
    this.body = new PlayerBody().at(start.x, start.z, start.facing ?? E);
    this.px = start.x; this.pz = start.z; this.kb.place(ball.x, ball.z);
  }
  step(want: number, mag: number) {
    const b = this.body;
    this.t += DT; this.now += DT * 1000;
    b.step(want, mag, DT);
    const k = Math.min(1, DT * VEL_SMOOTH);                                              // football.ts: the player's velocity, smoothed
    this.pvx += ((b.x - this.px) / DT - this.pvx) * k; this.pvz += ((b.z - this.pz) / DT - this.pvz) * k; this.px = b.x; this.pz = b.z;
    if (this.kb.dribble(b.x, b.z, this.pvx, this.pvz, DT, 'me', this.now, b.facing)) this.touches.push(this.t);
    const g: GoalNote | null = this.kb.step(DT, 'me', this.now);
    if (g) this.goalCount++;
  }
  ball() { const b = this.kb.ball; return { x: b.x, z: b.z, h: b.h, speed: Math.hypot(b.vx, b.vz), vx: b.vx, vz: b.vz }; }
  dist() { return Math.hypot(this.kb.ball.x - this.body.x, this.kb.ball.z - this.body.z); }
  pass(target: { x: number; z: number }) { return this.kb.kick(this.body.x, this.body.z, this.body.facing, 'pass', 0, target, 'me', this.now); }
  shoot(power: number) { return this.kb.kick(this.body.x, this.body.z, this.body.facing, 'shot', power, null, 'me', this.now); }
  goals() { return this.goalCount; }
  place(x: number, z: number) { this.kb.place(x, z); }
  put(x: number, z: number, facing: number) { this.body.at(x, z, facing); this.px = x; this.pz = z; this.pvx = this.pvz = 0; }
}

const H = 99;
export class MatchRig implements Rig {
  readonly name = 'match human';
  readonly body: PlayerBody;
  readonly m = new Match(5);
  touches: number[] = [];
  t = 0; private pvx = 0; private pvz = 0;
  /** The NPCs stand where they are put (they play no part: the body's ball control is what is measured). */
  private still = new Map<number, { x: number; z: number }>();
  constructor(start: { x: number; z: number; facing?: number }, ball: { x: number; z: number }, npcs: { team: 0 | 1; x: number; z: number }[] = []) {
    this.body = new PlayerBody().at(start.x, start.z, start.facing ?? E);
    this.m.add({ id: H, team: 0, human: true, x: start.x, z: start.z });
    npcs.forEach((n, i) => { this.m.add({ id: i + 1, team: n.team, x: n.x, z: n.z }); this.still.set(i + 1, { x: n.x, z: n.z }); });
    this.m.reset(0);
    this.m.phase = 'play'; this.m.taker = -1; this.m.fetcher = -1;                           // open play (the standing NPCs would never take a kick-off)
    this.place(ball.x, ball.z);
  }
  step(want: number, mag: number) {
    const b = this.body, m = this.m;
    this.t += DT;
    b.step(want, mag, DT);
    const k = Math.min(1, DT * VEL_SMOOTH);                                              // football.ts humanFrame: the player's velocity, smoothed
    this.pvx += (b.vx - this.pvx) * k; this.pvz += (b.vz - this.pvz) * k;
    m.setHuman(H, b.x, b.z, this.pvx, this.pvz, b.facing);
    for (const [id, at] of this.still) { const q = m.get(id)!; q.x = at.x; q.z = at.z; q.vx = q.vz = 0; q.kick = null; q.plan = null; }
    const n0 = m.log.filter(c => c.who === H && (c.kind === 'touch' || c.kind === 'trap')).length;
    m.step(DT);
    if (m.log.filter(c => c.who === H && (c.kind === 'touch' || c.kind === 'trap')).length > n0) this.touches.push(this.t);
  }
  ball() { const b = this.m.ball; return { x: b.x, z: b.z, h: b.h, speed: Math.hypot(b.vx, b.vz), vx: b.vx, vz: b.vz }; }
  dist() { return Math.hypot(this.m.ball.x - this.body.x, this.m.ball.z - this.body.z); }
  pass(_target: { x: number; z: number }) { return this.m.humanInReach(H, 0.5) && this.m.humanAsk(H, 'pass'); }
  shoot(power: number) { return this.m.humanInReach(H, 0.5) && this.m.humanAsk(H, 'shot', power); }
  goals() { return this.m.events.filter(e => e.kind === 'goal' && e.who === H).length; }
  place(x: number, z: number) { const b = this.m.ball; b.x = x; b.z = z; b.vx = b.vz = b.vh = 0; b.h = 0.11; b.net = 0; }
  put(x: number, z: number, facing: number) { this.body.at(x, z, facing); this.pvx = this.pvz = 0; this.m.setHuman(H, x, z, 0, 0, facing); }
  /** The shot's or pass's contacts the body made, for the checks. */
  kicks(kind: 'pass' | 'shot') { return this.m.log.filter(c => c.who === H && c.kind === kind); }
}

export const rigs: { name: string; make: (start: { x: number; z: number; facing?: number }, ball: { x: number; z: number }) => Rig }[] = [
  { name: 'kickabout', make: (s, b) => new KickRig(s, b) },
  { name: 'match human', make: (s, b) => new MatchRig(s, b, [{ team: 1, x: 18, z: 13 }, { team: 0, x: 0, z: 0 }]) },
];

/** Runs `frames` frames of `plan(t)` = [stick yaw, push]; returns the ball's distance from the body each frame. */
export function drive(r: Rig, secs: number, plan: (t: number) => [number, number]): number[] {
  const out: number[] = [];
  for (let i = 0; i < secs / DT; i++) { const [w, m] = plan(r.t); r.step(w, m); out.push(r.dist()); }
  return out;
}
export const within = (d: number[], limit: number) => d.filter(x => x <= limit).length / Math.max(1, d.length);
export { PITCH };
