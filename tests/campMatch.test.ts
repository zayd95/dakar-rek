import { describe, expect, it } from 'vitest';
import { HUMAN_PUSH, PITCH } from '../src/game/footballSim';
import { CampMatch, campSingleWinner } from '../src/multiplayer/campMatch';
import { CAMP_BODY, CAMP_CURB, CAMP_MATCH, type CampEvent } from '../src/multiplayer/campProtocol';
import { CampBot, STILL, STRONG, WEAK, type BotStyle } from './helpers/campBot';

/**
 * 1.0.1 Grand Camp: the match on the server, every player human (src/multiplayer/campMatch.ts). Whole matches played by scripted players through the
 * same stick frames a client sends; the set pieces the sim leaves to NPCs; the clock; drops; the cost of a tick.
 */
const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ sid: i + 1, team: (i < n / 2 ? 0 : 1) as 0 | 1 }));
function game(n: number, a: BotStyle, b: BotStyle, o: { seconds?: number; seed?: number; until?: (m: CampMatch) => boolean; each?: (m: CampMatch) => void } = {}) {
  const seats = seatsOf(n), m = new CampMatch(seats, { seed: o.seed ?? 1, seconds: o.seconds });
  const bots = seats.map(s => new CampBot(s.sid, s.team, s.team === 0 ? a : b, o.seed ?? 1));
  const teamOf = (sid: number) => seats.find(s => s.sid === sid)?.team ?? null;
  let ticks = 0, slowest = 0; const t0 = performance.now();
  while (m.stage !== 'over' && ticks < 20 * 400 && !(o.until?.(m))) {
    const snap = m.snapshot();
    for (const bot of bots) { const x = bot.think(snap, teamOf, ticks / 20); m.input(bot.sid, ticks + 1, x.mx, x.mz, x.f, x.a, x.p); }
    const s = performance.now(); m.step(); slowest = Math.max(slowest, performance.now() - s);
    o.each?.(m); ticks++;
  }
  return { m, bots, ticks, ms: (performance.now() - t0) / Math.max(1, ticks), slowest };
}
const kinds = (e: CampEvent[]) => e.map(x => x.k);

describe('Grand Camp match: whole matches', () => {
  it('5 a side, scripted players: first to 3 goals, every event numbered in order, a kick-off by the conceding team after each goal', () => {
    const { m, bots } = game(10, STRONG, WEAK);
    expect(m.stage).toBe('over');
    expect(m.winner).toBe(0);
    expect(m.score[0]).toBe(CAMP_MATCH.goals);
    const ev = m.events;
    expect(ev.map(e => e.n)).toEqual(ev.map((_, i) => i + 1));
    expect(ev[0]).toMatchObject({ k: 'kickoff', team: 0 });
    expect(ev[ev.length - 1]).toMatchObject({ k: 'full', sc: m.score });
    const goals = ev.filter(e => e.k === 'goal');
    expect(goals.length).toBe(m.score[0] + m.score[1]);
    let s = [0, 0];
    for (const g of goals) { s = [...s]; s[g.team!]++; expect(g.sc).toEqual(s); }
    for (let i = 0; i < ev.length; i++) if (ev[i].k === 'goal' && i < ev.length - 2) expect(ev.slice(i + 1).find(e => e.k === 'kickoff')?.team).toBe(1 - ev[i].team!);
    expect(m.goalLog.length).toBe(goals.length);
    expect(m.stats.shots).toBeGreaterThan(0); expect(m.stats.touches).toBeGreaterThan(50);
    expect(bots.reduce((n, b) => n + b.asked.shot, 0)).toBeGreaterThan(0);
  });
  it('the same players and the same sticks give the same match, event for event', () => {
    const a = game(10, STRONG, WEAK, { seed: 3 }).m, b = game(10, STRONG, WEAK, { seed: 3 }).m;
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.snapshot()).toEqual(b.snapshot());
  });
  it('a draw at full time: the clock (half time at its middle, the other team kicks off), nobody scoring', () => {
    const { m } = game(6, STILL, STILL, { seconds: 40 });
    expect(m.stage).toBe('over'); expect(m.winner).toBeNull(); expect(m.score).toEqual([0, 0]);
    expect(kinds(m.events)).toEqual(['kickoff', 'half', 'kickoff', 'full']);
    expect(m.events[1].c).toBe(200); expect(m.events[2]).toMatchObject({ k: 'kickoff', team: 1 }); expect(m.events[3].c).toBe(400);
    expect(m.half).toBe(2);
  });
  it('7 a side is played on the 40 × 30 m pitch (every player human): goals, the speed cap, and a tick costs little', () => {
    const r = game(14, STRONG, WEAK, { seed: 4 });
    expect(r.m.stage).toBe('over'); expect(r.m.score[0]).toBe(3);
    expect(r.m.snapshot().players.length).toBe(14);
    expect(r.ms).toBeLessThan(2.5);                                                 // a 50 ms tick budget: measured average on this machine
  });
});

describe('Grand Camp match: bodies and set pieces', () => {
  it('every tick: no body faster than the run, none past the curb, none through another', () => {
    let top = 0, out = 0, through = 0;
    game(10, STRONG, STRONG, { seed: 5, each: m => {
      const ps = m.snapshot().players;
      for (const p of ps) { top = Math.max(top, Math.hypot(p.vx, p.vz)); if (Math.abs(p.x) > CAMP_CURB.x + 1e-9 || Math.abs(p.z) > CAMP_CURB.z + 1e-9) out++; }
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z) < CAMP_BODY.radius) through++;
    } });
    expect(top).toBeLessThanOrEqual(CAMP_BODY.run + 1e-9); expect(out).toBe(0); expect(through).toBe(0);
  });
  it('kick-off: everyone in line; the other team kept out of the centre circle and its half even when it runs at the ball; only the taker starts play', () => {
    const m = new CampMatch(seatsOf(10), { seed: 2 });
    const s0 = m.snapshot();
    expect(s0.phase).toBe('kickoff'); expect(s0.taker).toBe(5); expect(s0.ball).toMatchObject({ x: 0, z: 0 });
    for (const sid of [6, 7, 8, 9, 10]) m.input(sid, 1, -1, 0, -Math.PI / 2);          // team 1 charges at the ball
    m.input(1, 1, 1, 0, Math.PI / 2);                                                  // and a team-0 player too
    for (let i = 0; i < 40; i++) m.step();
    const s = m.snapshot();
    for (const p of s.players) {
      if (p.sid >= 6) { expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(3.2 - 1e-6); expect(p.x).toBeGreaterThanOrEqual(0.2 - 1e-6); }
      else if (p.sid !== 5) expect(p.x).toBeLessThanOrEqual(-0.2 + 1e-6);
    }
    expect(s.phase).toBe('kickoff'); expect(s.ball).toMatchObject({ x: 0, z: 0 });
    for (let i = 0; i < 30 && m.phase === 'kickoff'; i++) { m.input(5, 2 + i, 1, 0, Math.PI / 2); m.step(); }
    expect(m.phase).toBe('play');
    expect(m.sim.last).toBe(5);
  });
  it('the taker waits too long: another player of that team may take it', () => {
    const m = new CampMatch(seatsOf(6), { seed: 2 });
    expect(m.snapshot().taker).toBe(3);
    for (let i = 0; i < 20 * (CAMP_MATCH.takerWait + 0.2); i++) m.step();
    expect([1, 2]).toContain(m.snapshot().taker);
    expect(m.stats.retakers).toBe(1);
  });
  it('a ball over the touchline: a kick-in for the other team, the ball on its spot at rest, the nearest player of that team takes it, 3 m kept', () => {
    const m = new CampMatch(seatsOf(6), { seed: 1 });
    for (let i = 0; i < 30 && m.phase === 'kickoff'; i++) { m.input(3, 1 + i, 1, 0, Math.PI / 2); m.step(); }
    expect(m.phase).toBe('play');
    // team 0's touch sends the ball toward the touchline
    Object.assign(m.sim.ball, { x: 6, z: 13.5, h: 0.11, vx: 0, vz: 8, vh: 0 }); m.sim.last = 3; m.sim.lastTeam = 0; m.sim.pass = null;
    const seen: CampEvent[] = [];
    for (let i = 0; i < 40 && m.phase === 'play'; i++) seen.push(...m.step());
    expect(seen.find(e => e.k === 'out')).toMatchObject({ team: 1, d: 'kick-in' });
    const s = m.snapshot();
    expect(s.phase).toBe('restart');
    expect(Math.abs(s.ball.z)).toBeCloseTo(PITCH.hz - 0.25, 6); expect(Math.hypot(s.ball.vx, s.ball.vz)).toBe(0);
    const t1 = s.players.filter(p => p.sid >= 4).sort((a, b) => Math.hypot(a.x - s.ball.x, a.z - s.ball.z) - Math.hypot(b.x - s.ball.x, b.z - s.ball.z))[0];
    expect(s.taker).toBe(t1.sid);
    // a team-0 player runs at the ball: kept 3 m away, never touches it
    const bx = s.ball.x, bz = s.ball.z;
    for (let i = 0; i < 60; i++) { const me = m.snapshot().players.find(p => p.sid === 1)!; const dx = bx - me.x, dz = bz - me.z, l = Math.hypot(dx, dz) || 1; m.input(1, 100 + i, dx / l, dz / l, Math.atan2(dx, dz)); m.step(); }
    const p1 = m.snapshot().players.find(p => p.sid === 1)!;
    expect(Math.hypot(p1.x - bx, p1.z - bz)).toBeGreaterThanOrEqual(3 - 0.05);
    expect(m.phase).toBe('restart'); expect(m.sim.last).toBe(3);
    // the taker walks into it: play again
    for (let i = 0; i < 300 && m.phase === 'restart'; i++) {
      const me = m.snapshot().players.find(p => p.sid === t1.sid)!, dx = bx - me.x, dz = bz - me.z, l = Math.hypot(dx, dz) || 1, k = l > 2 ? 1 : 0.4;
      m.input(t1.sid, 200 + i, (dx / l) * k, (dz / l) * k, Math.atan2(0, -Math.sign(bz))); m.step();     // facing into the pitch
    }
    expect(m.phase).toBe('play'); expect(m.sim.last).toBe(t1.sid);
  });
  it('« Dribbler »: the ball at the foot is knocked ahead along the facing (HUMAN_PUSH)', () => {
    const m = new CampMatch(seatsOf(6), { seed: 1 });
    for (let i = 0; i < 30 && m.phase === 'kickoff'; i++) { m.input(3, 1 + i, 0.3, 0, Math.PI / 2); m.step(); }
    const me = m.snapshot().players.find(p => p.sid === 3)!;
    Object.assign(m.sim.ball, { x: me.x + 0.45, z: me.z - 0.13, h: 0.11, vx: 0, vz: 0, vh: 0 });
    m.input(3, 100, 0, 0, Math.PI / 2, 'dribble', 1);
    let v = 0;
    for (let i = 0; i < 6; i++) { m.step(); v = Math.max(v, Math.hypot(m.sim.ball.vx, m.sim.ball.vz)); }
    expect(v).toBeGreaterThan(HUMAN_PUSH.v1 - 1); expect(v).toBeLessThanOrEqual(HUMAN_PUSH.v1 + 1e-9);
    expect(m.sim.ball.vx).toBeGreaterThan(0);
  });
});

describe('Grand Camp match: players who drop or leave', () => {
  it('a dropped player leaves the pitch (one short), comes back to the same team in its own half; one gone stays on the roster', () => {
    const m = new CampMatch(seatsOf(10), { seed: 1 });
    for (let i = 0; i < 10; i++) m.step();
    m.drop(2);
    expect(m.snapshot().players.map(p => p.sid)).not.toContain(2);
    expect(m.snapshot().players.length).toBe(9);
    for (let i = 0; i < 20; i++) m.step();
    m.back(2);
    const p = m.snapshot().players.find(q => q.sid === 2)!;
    expect(p.x).toBeLessThan(0);                                                       // team 0's half
    expect(m.seats.get(2)!.team).toBe(0);
    m.gone(7); m.back(7);                                                              // gone is for good
    expect(m.snapshot().players.map(q => q.sid)).not.toContain(7);
    expect(m.seats.has(7)).toBe(true);
    expect(kinds(m.events).filter(k => k !== 'kickoff')).toEqual(['drop', 'back', 'gone']);
    m.drop(3);
    expect(kinds(m.step())).toContain('drop');                                        // between two ticks: handed over by the next one
    expect(m.step().filter(e => e.k === 'drop')).toEqual([]);                         // once
    expect(m.events.find(e => e.k === 'gone')).toMatchObject({ who: 7, team: 1 });
  });
  it('a team with nobody on the pitch: the other team takes its kick-offs and restarts; play goes on', () => {
    const m = new CampMatch(seatsOf(6), { seed: 1, kick: 1 });
    for (const sid of [4, 5, 6]) m.drop(sid);
    for (let i = 0; i < 3; i++) m.step();
    expect(m.snapshot().players.length).toBe(3);
    // the next kick-off is team 1's but nobody of it is here
    Object.assign(m.sim.ball, { x: 19.5, z: 0, h: 0.11, vx: 9, vz: 0, vh: 0 }); m.sim.phase = 'play'; m.sim.lastTeam = 0; m.sim.last = 3;
    const seen: CampEvent[] = [];
    for (let i = 0; i < 200 && !seen.some(e => e.k === 'kickoff'); i++) seen.push(...m.step());
    expect(seen.find(e => e.k === 'goal')).toMatchObject({ team: 0 });
    expect(seen.find(e => e.k === 'kickoff')).toMatchObject({ team: 0 });
    expect(m.snapshot().taker).toBe(3);
  });
});

describe('Grand Camp: « Un seul gagnant » (one function, the owner to confirm)', () => {
  it('the top scorer of the winning team; level: the one who scored first; own goals count for no player; none: the first to have joined', () => {
    const g = (sid: number, team: 0 | 1, own = false) => ({ sid, team, clock: 0, own });
    expect(campSingleWinner([g(2, 0), g(3, 0), g(3, 0), g(7, 1)], 0, [1, 2, 3])).toBe(3);
    expect(campSingleWinner([g(2, 0), g(3, 0), g(3, 0), g(2, 0)], 0, [1, 2, 3])).toBe(2);   // 2-2: player 2 scored first
    expect(campSingleWinner([g(4, 0, true), g(5, 0, true), g(1, 0)], 0, [1, 2, 3])).toBe(1);
    expect(campSingleWinner([g(4, 0, true)], 0, [2, 1, 3])).toBe(2);
    expect(campSingleWinner([g(9, 0)], 0, [1, 2, 3])).toBe(1);                      // a goal by someone not on that team: not counted
  });
});
