import { Match, newBall, PITCH, type Phase } from '../game/footballSim';
import {
  CAMP_BODY, CAMP_CURB, CAMP_MATCH, CAMP_TICK_HZ, campKickoffSpot, stepBody, wrapAngle,
  type CampAction, type CampBody, type CampEvent, type CampEventKind, type CampPhase, type CampSnapshot,
} from './campProtocol';

/**
 * 1.0.1 Grand Camp: the match itself on the server, every player human (server/camp.ts runs one per match at CAMP_TICK_HZ). Pure and deterministic:
 * the same seats, sticks and ticks give the same match (tests/campMatch.test.ts plays whole matches with scripted players).
 *
 * - The ball and every touch of it are src/game/footballSim.ts `Match`'s, unchanged: each player is a `human` of the sim (`setHuman` from the body,
 *   `humanAsk` for a pass, a shot, or a push — « Dribbler »). Nobody else touches the ball; the server never moves it except to put it on a spot.
 * - The bodies are the server's: each is stepped from its player's last stick frame (`stepBody`: the speed cap, the curb), kept apart from the others,
 *   and kept where the laws want it at a set piece (own half and out of the centre circle at a kick-off, 3 m from the ball at a restart).
 * - What the sim leaves to its NPCs is done here: the kick-off line-up (`campKickoffSpot`), the ball put on the centre spot after a goal and on the
 *   spot of a kick-in, a corner or a goal clearance, the taker (the nearest player of that team; another one if they wait CAMP_MATCH.takerWait s), and
 *   the taker's first touch, whatever it is, starts play. The nearest player to the ball has the first touch of a tick.
 * - The clock: CAMP_MATCH.seconds of play, a half time at the middle (a pause; the other team kicks off), full time at the end of the clock or a goal
 *   pause after a team reaches CAMP_MATCH.goals.
 * - A dropped player leaves the pitch (their team plays one short) and comes back to their own half in the same team (`back`); a player who left for
 *   good (`gone`) stays on the roster and on the result.
 */
export interface CampSeatIn { sid: number; team: 0 | 1 }
interface Seat {
  sid: number; team: 0 | 1; slot: number;
  /** On the pitch (connected); left for good. */
  on: boolean; gone: boolean;
  body: CampBody;
  /** The last stick frame applied (its counter), the stick held now, an action for the next tick. */
  seq: number; mx: number; mz: number; f: number; act: { k: CampAction; p: number } | null;
}
export interface CampMatchOptions { seed?: number; seconds?: number; goals?: number; kick?: 0 | 1; hz?: number }
export interface CampGoal { sid: number; team: 0 | 1; clock: number; own: boolean }

const hyp = Math.hypot;
const EVENTS_KEPT = 600;

export class CampMatch {
  readonly sim: Match;
  readonly hz: number; readonly dt: number;
  readonly seconds: number; readonly goals: number; readonly firstKick: 0 | 1; readonly perSide: number;
  readonly seats = new Map<number, Seat>();
  tick = 0; clock = 0; half: 1 | 2 = 1;
  stage: 'play' | 'half' | 'over' = 'play';
  readonly goalLog: CampGoal[] = [];
  /** The match's events (the last EVENTS_KEPT: what a player back from a drop is sent). */
  readonly events: CampEvent[] = [];
  /** Counts for the checks: stick frames applied, shortened (beyond the full stick: never, they are refused upstream), touches, passes, shots. */
  readonly stats = { inputs: 0, touches: 0, passes: 0, shots: 0, kickoffs: 0, restarts: 0, retakers: 0 };
  private n = 0; private pause = 0; private takerT = 0; private ending = false; private lastPhase: Phase = 'kickoff';
  private fresh: CampEvent[] = [];

  constructor(seats: readonly CampSeatIn[], o: CampMatchOptions = {}) {
    this.hz = o.hz ?? CAMP_TICK_HZ; this.dt = 1 / this.hz;
    this.seconds = o.seconds ?? CAMP_MATCH.seconds; this.goals = o.goals ?? CAMP_MATCH.goals; this.firstKick = o.kick ?? 0;
    this.sim = new Match(o.seed ?? 1);
    const sorted = [...seats].sort((a, b) => a.sid - b.sid), slots = [0, 0];
    this.perSide = Math.max(1, Math.ceil(seats.length / 2));
    for (const s of sorted) {
      const slot = slots[s.team]++;
      const k = campKickoffSpot(this.perSide, s.team, slot, s.team === this.firstKick);
      const seat: Seat = { sid: s.sid, team: s.team, slot, on: true, gone: false, body: { x: k.x, z: k.z, vx: 0, vz: 0, f: k.f }, seq: 0, mx: 0, mz: 0, f: k.f, act: null };
      this.seats.set(s.sid, seat);
      this.sim.add({ id: s.sid, team: s.team, human: true, x: k.x, z: k.z, yaw: k.f, foot: 1, pace: CAMP_BODY.run, skill: 1 });
    }
    this.sim.reset(this.firstKick);
    this.kickoff(this.firstKick);
  }

  // ------------------------------------------------------------------ the players' side
  /** A stick frame (already validated: src/multiplayer/campProtocol.ts parseInput). Older than the last one applied: ignored. */
  input(sid: number, s: number, mx: number, mz: number, f: number, act?: CampAction, p = 0.6) {
    const seat = this.seats.get(sid); if (!seat || !seat.on || s < seat.seq) return;
    seat.seq = s; seat.mx = mx; seat.mz = mz; seat.f = f;
    if (act) seat.act = { k: act, p };
    this.stats.inputs++;
  }
  /** The player's connection dropped: off the pitch (their team plays one short) until `back`. */
  drop(sid: number) {
    const seat = this.seats.get(sid); if (!seat || !seat.on) return;
    seat.on = false; seat.mx = seat.mz = 0; seat.act = null;
    this.sim.remove(sid);
    this.emit('drop', { who: sid, team: seat.team });
  }
  /** Back in time: on the pitch again in their own half, same team. */
  back(sid: number) {
    const seat = this.seats.get(sid); if (!seat || seat.on || seat.gone || this.stage === 'over') return;
    const k = campKickoffSpot(this.perSide, seat.team, seat.slot, false);
    seat.on = true; seat.body = { x: k.x, z: k.z, vx: 0, vz: 0, f: k.f }; seat.mx = seat.mz = 0; seat.f = k.f;
    this.sim.add({ id: sid, team: seat.team, human: true, x: k.x, z: k.z, yaw: k.f, foot: 1, pace: CAMP_BODY.run, skill: 1 });
    this.emit('back', { who: sid, team: seat.team });
  }
  /** Left for good (or not back in time): off the pitch for the rest of the match, still on the roster. */
  gone(sid: number) {
    const seat = this.seats.get(sid); if (!seat || seat.gone) return;
    if (seat.on) { seat.on = false; this.sim.remove(sid); }
    seat.gone = true; seat.act = null;
    this.emit('gone', { who: sid, team: seat.team });
  }
  get onPitch() { let n = 0; for (const s of this.seats.values()) if (s.on) n++; return n; }

  // ------------------------------------------------------------------ one tick
  /** Advances the match by one tick; returns the events since the last step: this tick's, and a drop, a return or a departure in between (all kept in `events` too). */
  step(): CampEvent[] {
    if (this.stage === 'over') return this.flush();
    const dt = this.dt, sim = this.sim;
    this.tick++;
    this.moveBodies(dt);
    if (this.stage === 'half') {
      this.pause -= dt;
      if (this.pause <= 0) { this.stage = 'play'; this.half = 2; this.kickoff((1 - this.firstKick) as 0 | 1); }
      return this.flush();
    }
    for (const s of this.seats.values()) {
      if (!s.on) continue;
      const b = s.body;
      sim.setHuman(s.sid, b.x, b.z, b.vx, b.vz, b.f);
      if (s.act) { sim.humanAsk(s.sid, s.act.k === 'dribble' ? 'push' : s.act.k, s.act.p); s.act = null; }
    }
    // the first touch of a tick is the nearest player's
    const ball = sim.ball;
    sim.players.sort((a, b) => hyp(a.x - ball.x, a.z - ball.z) - hyp(b.x - ball.x, b.z - ball.z));
    const setPiece = sim.phase === 'kickoff' || sim.phase === 'restart', taker = sim.taker;
    sim.step(dt);
    this.clock += dt;
    for (const e of sim.events.splice(0)) {
      if (e.kind === 'contact' && e.rec) {
        this.stats.touches++;
        if (setPiece && e.who === taker && (sim.phase === 'kickoff' || sim.phase === 'restart')) { sim.phase = 'play'; sim.phaseT = 0; }
        if (e.rec.kind === 'pass') { this.stats.passes++; this.emit('pass', { who: e.rec.who, team: e.rec.team, ...(e.rec.to >= 0 ? { to: e.rec.to } : {}) }); }
        if (e.rec.kind === 'shot') { this.stats.shots++; this.emit('shot', { who: e.rec.who, team: e.rec.team }); }
      } else if (e.kind === 'goal' && e.team !== undefined) {
        const own = e.detail === 'own';
        this.goalLog.push({ sid: e.who ?? -1, team: e.team, clock: Math.round(this.clock * 10) / 10, own });
        this.emit('goal', { team: e.team, ...(e.who !== undefined && e.who >= 0 ? { who: e.who } : {}), ...(own ? { own: true as const } : {}), sc: [sim.score[0], sim.score[1]] });
        this.pause = sim.score[e.team] >= this.goals ? CAMP_MATCH.endPause : CAMP_MATCH.goalPause;
        if (sim.score[e.team] >= this.goals) this.ending = true;
      } else if (e.kind === 'post' || e.kind === 'bar') this.emit('post', {});
      else if (e.kind === 'out' && e.team !== undefined) this.emit('out', { team: e.team, ...(e.detail ? { d: e.detail } : {}) });
    }
    if (sim.phase === 'restart' && this.lastPhase !== 'restart') this.restart();
    if (sim.phase === 'goal' || sim.phase === 'fetch') {
      this.pause -= dt;
      if (this.pause <= 0) { if (this.ending) this.end(); else this.kickoff(sim.kickTeam); }
    }
    if (this.stage === 'play' && (sim.phase === 'kickoff' || sim.phase === 'restart')) {
      this.takerT += dt;
      const t = this.seats.get(sim.taker);
      if (!t || !t.on || this.takerT > CAMP_MATCH.takerWait) this.pickTaker(!!t && t.on && this.takerT > CAMP_MATCH.takerWait);
    }
    if (this.stage === 'play' && !this.ending) {
      if (this.half === 1 && this.clock >= this.seconds / 2) { this.stage = 'half'; this.pause = CAMP_MATCH.halfPause; this.emit('half', { sc: [sim.score[0], sim.score[1]] }); }
      else if (this.clock >= this.seconds) this.end();
    }
    this.lastPhase = sim.phase;
    return this.flush();
  }
  /** The events not handed over yet, once. */
  private flush() { const out = this.fresh; this.fresh = []; return out; }

  /** Every body on the pitch, one step from its stick; the set piece's places; nobody through anybody; the curb. */
  private moveBodies(dt: number) {
    const sim = this.sim, phase = this.stage === 'half' ? 'half' : sim.phase, list: Seat[] = [];
    for (const s of this.seats.values()) if (s.on) { stepBody(s.body, s.mx, s.mz, s.f, dt); list.push(s); }
    if (this.stage === 'play' && (phase === 'kickoff' || phase === 'restart')) {
      for (const s of list) {
        const b = s.body, d = s.team === 0 ? 1 : -1;
        if (phase === 'kickoff') {
          if (s.sid !== sim.taker && b.x * d > -0.2) { b.x = -0.2 * d; if (b.vx * d > 0) b.vx = 0; }
          if (s.team !== sim.kickTeam) pushOut(b, 0, 0, 3.2, -d);
        } else if (s.team !== sim.kickTeam) pushOut(b, sim.spotX, sim.spotZ, 3, -d);
      }
    }
    const R = CAMP_BODY.radius * 2;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i].body, b = list[j].body, dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz);
      if (d >= R) continue;
      const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, push = (R - d) / 2;
      a.x -= ux * push; a.z -= uz * push; b.x += ux * push; b.z += uz * push;
    }
    for (const s of list) { const b = s.body; b.x = clamp(b.x, -CAMP_CURB.x, CAMP_CURB.x); b.z = clamp(b.z, -CAMP_CURB.z, CAMP_CURB.z); }
  }

  /** A kick-off by `team` (the other one if it has nobody on the pitch): the ball on the centre spot, everyone in line, the centre forward to take it. */
  private kickoff(team: 0 | 1) {
    const sim = this.sim;
    if (!this.teamOn(team) && this.teamOn((1 - team) as 0 | 1)) team = (1 - team) as 0 | 1;
    sim.kickoff(team);
    Object.assign(sim.ball, newBall());
    sim.last = -1; sim.lastTeam = null; sim.pass = null; sim.scorer = -1; sim.fetcher = -1;
    let taker = -1;
    for (const t of [0, 1] as const) {
      const on = [...this.seats.values()].filter(s => s.on && s.team === t).sort((a, b) => a.slot - b.slot);
      on.forEach((s, i) => {
        const last = i === on.length - 1, slot = last ? this.perSide - 1 : Math.min(s.slot, this.perSide - 2);
        const k = campKickoffSpot(this.perSide, t, slot, t === team);
        s.body = { x: k.x, z: k.z, vx: 0, vz: 0, f: k.f }; s.mx = s.mz = 0; s.act = null;
        const p = sim.get(s.sid);
        if (p) { sim.setHuman(s.sid, k.x, k.z, 0, 0, k.f); p.ask = null; p.kick = null; p.restUntil = sim.t; }
        if (last && t === team) taker = s.sid;
      });
    }
    sim.taker = taker; this.takerT = 0; this.pause = 0; this.lastPhase = 'kickoff';
    this.stats.kickoffs++;
    this.emit('kickoff', { team, sc: [sim.score[0], sim.score[1]] });
  }
  /** Out of play: the ball on its spot, at rest; the nearest player of the team to take it (the other team's if it has nobody on). */
  private restart() {
    const sim = this.sim;
    if (!this.teamOn(sim.kickTeam) && this.teamOn((1 - sim.kickTeam) as 0 | 1)) sim.kickTeam = (1 - sim.kickTeam) as 0 | 1;
    Object.assign(sim.ball, newBall(clamp(sim.spotX, -PITCH.hx + 0.3, PITCH.hx - 0.3), clamp(sim.spotZ, -PITCH.hz + 0.25, PITCH.hz - 0.25)));
    sim.pass = null;
    this.stats.restarts++;
    this.pickTaker(false);
  }
  /** The set piece's taker: the nearest player of the kicking team (`other`: someone else than the one who waited too long, when there is one). */
  private pickTaker(other: boolean): void {
    const sim = this.sim, b = sim.ball;
    let best = -1, bd = Infinity;
    for (const s of this.seats.values()) {
      if (!s.on || s.team !== sim.kickTeam || (other && s.sid === sim.taker)) continue;
      const d = hyp(s.body.x - b.x, s.body.z - b.z);
      if (d < bd) { bd = d; best = s.sid; }
    }
    if (best < 0 && other) best = sim.taker;
    if (best < 0) {                                                     // nobody of that team on the pitch: the other team's ball
      const t = (1 - sim.kickTeam) as 0 | 1;
      if (this.teamOn(t)) { sim.kickTeam = t; return this.pickTaker(false); }
    }
    if (other) this.stats.retakers++;
    sim.taker = best; this.takerT = 0;
  }
  private teamOn(t: 0 | 1) { for (const s of this.seats.values()) if (s.on && s.team === t) return true; return false; }
  private end() {
    if (this.stage === 'over') return;
    this.stage = 'over';
    this.emit('full', { sc: [this.sim.score[0], this.sim.score[1]] });
  }
  /** The server stops the match (nobody left, a fault): over now, no `full` result is drawn from it. */
  stop() { this.stage = 'over'; }

  private emit(k: CampEventKind, o: Partial<CampEvent>) {
    const e: CampEvent = { n: ++this.n, k, c: Math.round(this.clock * 10), ...o };
    this.events.push(e); this.fresh.push(e);
    if (this.events.length > EVENTS_KEPT) this.events.splice(0, this.events.length - EVENTS_KEPT);
  }

  // ------------------------------------------------------------------ what it shows
  get score(): [number, number] { return [this.sim.score[0], this.sim.score[1]]; }
  get phase(): CampPhase { return this.stage === 'over' ? 'over' : this.stage === 'half' ? 'half' : this.sim.phase === 'fetch' ? 'goal' : this.sim.phase; }
  /** The winning team at the end (null: a draw). */
  get winner(): 0 | 1 | null { const s = this.sim.score; return s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : null; }
  snapshot(): CampSnapshot {
    const sim = this.sim, b = sim.ball, players: CampSnapshot['players'] = [];
    for (const s of this.seats.values()) if (s.on) players.push({ sid: s.sid, x: s.body.x, z: s.body.z, vx: s.body.vx, vz: s.body.vz, f: s.body.f, seq: s.seq });
    const own = sim.last >= 0 && sim.humanHas(sim.last) ? sim.last : -1;
    const ownTeam: -1 | 0 | 1 = own >= 0 ? this.seats.get(own)?.team ?? -1 : sim.pass ? sim.pass.team : -1;
    const set = this.stage === 'play' && (sim.phase === 'kickoff' || sim.phase === 'restart');
    return { k: this.tick, clock: this.clock, half: this.half, phase: this.phase, score: this.score, ball: { x: b.x, z: b.z, h: b.h, vx: b.vx, vz: b.vz, vh: b.vh }, players, own, ownTeam, taker: set ? sim.taker : -1 };
  }
}

/**
 * « Un seul gagnant » (the owner has not confirmed the rule; GRAND-CAMP-RULES-1.0.1.md « Points that need the owner's word » 1): the top scorer of the
 * winning team takes the pool; level scorers: the one who scored first. Own goals count for the team, never for a player. A winning team whose goals
 * were all own goals: the first of its players to have joined (`order`: its pitch numbers in joining order). One function, so the rule is easy to change.
 */
export function campSingleWinner(goals: readonly CampGoal[], team: 0 | 1, order: readonly number[]): number {
  const count = new Map<number, { n: number; first: number }>();
  goals.forEach((g, i) => {
    if (g.team !== team || g.own || g.sid < 0 || !order.includes(g.sid)) return;
    const c = count.get(g.sid) ?? { n: 0, first: i };
    c.n++; count.set(g.sid, c);
  });
  let best = -1, bn = 0, bf = Infinity;
  for (const [sid, c] of count) if (c.n > bn || (c.n === bn && c.first < bf)) { best = sid; bn = c.n; bf = c.first; }
  return best >= 0 ? best : order[0] ?? -1;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Keeps a body `r` m from (cx, cz) (out along the line from it; one standing on the point goes toward `away` along x: its own half). */
function pushOut(b: CampBody, cx: number, cz: number, r: number, away: number) {
  const dx = b.x - cx, dz = b.z - cz, d = hyp(dx, dz);
  if (d >= r) return;
  const ux = d > 1e-3 ? dx / d : away, uz = d > 1e-3 ? dz / d : 0;
  b.x = cx + ux * r; b.z = cz + uz * r;
}
export { wrapAngle };
