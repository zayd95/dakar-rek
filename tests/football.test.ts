import { describe, expect, it } from 'vitest';
import { BALL_R, CONTACT, Match, PITCH, REACH, ballPath, newBall, passSpeed, rollDistance, stepBall, type BallEvent } from '../src/game/footballSim';
import { planDemand, type AmbientSpot } from '../src/social/ambient';
import { ACTIVITIES, AMBIENT_BUDGET } from '../src/social/ambientData';
import { buildSpots } from '../src/social/ambientSpots';

/** Runs the ball alone for `seconds` in 1/60 s frames, the events collected. */
function roll(b = newBall(), seconds = 10, ev: BallEvent[] = []) {
  for (let t = 0; t < seconds; t += 1 / 60) stepBall(b, 1 / 60, ev);
  return { b, ev };
}

/** A match of `n` a side (a keeper from 3), players spread over the pitch. */
function match(n: number, seed = 7) {
  const m = new Match(seed);
  let id = 0;
  for (const team of [0, 1] as const) for (let i = 0; i < n; i++) m.add({ id: id++, team, keeper: n >= 3 && i === 0, x: (team ? 1 : -1) * (4 + i * 3), z: -8 + i * 4 });
  m.reset(0);
  return m;
}
function play(m: Match, seconds: number, dt = 1 / 30) {
  const frames: { t: number; x: number; z: number; vx: number; vz: number; h: number; contact: boolean }[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const n = m.stats.contacts;
    m.step(dt);
    frames.push({ t: m.t, x: m.ball.x, z: m.ball.z, vx: m.ball.vx, vz: m.ball.vz, h: m.ball.h, contact: m.stats.contacts > n });
  }
  return frames;
}

describe('football · the ball', () => {
  it('rolls, slows down on the grass and stops', () => {
    const b = newBall(); b.vx = 8;
    const { b: e } = roll(b, 20);
    expect(e.vx).toBe(0);
    expect(e.x).toBeGreaterThan(10);
    expect(e.x).toBeLessThan(PITCH.ex);
    // the closed form agrees with the steps (±10 %)
    expect(Math.abs(e.x - rollDistance(8)) / rollDistance(8)).toBeLessThan(0.1);
  });

  it('a pass given passSpeed arrives at about the speed asked for', () => {
    for (const [D, va] of [[6, 3], [12, 4], [18, 3.5]]) {
      const b = newBall(-D / 2, 0); b.vx = passSpeed(D, va);
      let prevX = b.x;
      for (let i = 0; i < 600 && b.x < -D / 2 + D; i++) { prevX = b.x; stepBall(b, 1 / 120); }
      void prevX;
      expect(Math.abs(b.vx - va)).toBeLessThan(0.15 * va + 0.2);
    }
  });

  it('a lifted ball flies on an arc, bounces lower and lower, then rolls', () => {
    const b = newBall(-10, 0); b.vx = 10; b.vh = 6;
    let top = 0; const ev: BallEvent[] = [];
    for (let t = 0; t < 4; t += 1 / 60) { stepBall(b, 1 / 60, ev); top = Math.max(top, b.h); }
    expect(top).toBeGreaterThan(1.5);
    expect(top).toBeLessThan(BALL_R + 36 / (2 * 9.81) + 0.01);
    const bounces = ev.filter(e => e.kind === 'bounce');
    expect(bounces.length).toBeGreaterThanOrEqual(2);
    expect(b.h).toBeCloseTo(BALL_R, 3);
  });

  it('bounces back off a post', () => {
    const b = newBall(PITCH.hx - 6, PITCH.post); b.vx = 12;
    const ev: BallEvent[] = [];
    for (let t = 0; t < 1; t += 1 / 60) stepBall(b, 1 / 60, ev);
    expect(ev.some(e => e.kind === 'post')).toBe(true);
    expect(b.vx).toBeLessThan(0);
    expect(b.net).toBe(0);
  });

  it('bounces down off the crossbar', () => {
    const b = newBall(PITCH.hx - 0.6, 0); b.h = PITCH.bar - 0.05; b.vx = 10; b.vh = 0.5;
    const ev: BallEvent[] = [];
    for (let t = 0; t < 0.3; t += 1 / 120) stepBall(b, 1 / 120, ev);
    expect(ev.some(e => e.kind === 'bar')).toBe(true);
  });

  it('a goal: over the line between the posts and under the bar, then held by the net', () => {
    const b = newBall(PITCH.hx - 8, 1.5); b.vx = 16;
    const ev: BallEvent[] = [];
    roll(b, 4, ev);
    expect(ev.filter(e => e.kind === 'goal')).toHaveLength(1);
    expect(b.net).toBe(1);
    expect(b.x).toBeGreaterThan(PITCH.hx);
    expect(b.x).toBeLessThan(PITCH.hx + PITCH.net);
    expect(Math.abs(b.z)).toBeLessThan(PITCH.post);
  });

  it('wide of the post or over the bar: no goal', () => {
    const wide = newBall(PITCH.hx - 8, 4.2); wide.vx = 16;
    expect(roll(wide, 3).ev.some(e => e.kind === 'goal')).toBe(false);
    const over = newBall(PITCH.hx - 8, 0); over.vx = 16; over.vh = 9;
    expect(roll(over, 3).ev.some(e => e.kind === 'goal')).toBe(false);
  });

  it('the curb round the grass stops the ball', () => {
    const b = newBall(0, 10); b.vz = 15;
    roll(b, 6);
    expect(Math.abs(b.z)).toBeLessThanOrEqual(PITCH.ez);
  });

  it('the path ahead is the ball stepped forward', () => {
    const b = newBall(-5, 2); b.vx = 7; b.vz = -2; b.vh = 2;
    const P = ballPath(b, 20, 1 / 20, new Float64Array(60));
    const c = { ...b };
    for (let k = 1; k < 20; k++) stepBall(c, 1 / 20);
    expect(P[19 * 3]).toBeCloseTo(c.x, 6); expect(P[19 * 3 + 1]).toBeCloseTo(c.z, 6); expect(P[19 * 3 + 2]).toBeCloseTo(c.h, 6);
    expect(b.x).toBe(-5);                                                             // untouched
  });
});

describe('football · decisions', () => {
  it('the best pass goes to the open teammate up the pitch, not through an opponent', () => {
    const m = new Match(3);
    const p = m.add({ id: 1, team: 0, x: 0, z: 0 });
    m.add({ id: 2, team: 0, x: 9, z: 0 });                                           // a defender on his lane
    m.add({ id: 3, team: 0, x: 7, z: 8 });                                           // open, up the pitch
    m.add({ id: 4, team: 0, x: -6, z: -3 });                                         // open but behind
    m.add({ id: 9, team: 1, x: 4.5, z: 0.2 });
    m.add({ id: 10, team: 1, x: 10, z: -1 });
    Object.assign(m.ball, newBall(0.4, 0));
    const best = m.bestPass(p);
    expect(best?.p.id).toBe(3);
  });

  it('in range with a clear sight of the goal, the player on the ball shoots', () => {
    let shots = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = new Match(seed);
      m.add({ id: 1, team: 0, x: 9, z: 0.5, yaw: Math.PI / 2 });
      m.add({ id: 2, team: 1, keeper: true, x: 19.2, z: 0 });
      m.add({ id: 3, team: 1, x: -5, z: 5 }); m.add({ id: 4, team: 1, x: -8, z: -5 });
      m.reset(0); m.phase = 'play';
      Object.assign(m.ball, newBall(9.5, 0.4)); m.last = 1; m.lastTeam = 0;
      for (let i = 0; i < 45 && m.stats.shots === 0; i++) m.step(1 / 30);
      shots += m.stats.shots;
    }
    expect(shots).toBeGreaterThanOrEqual(16);
  });

  it('the keeper stands between the ball and the centre of his goal', () => {
    const m = new Match(4);
    const k = m.add({ id: 1, team: 0, keeper: true, x: -19, z: 0 });
    m.add({ id: 2, team: 0, x: 0, z: 0 }); m.add({ id: 3, team: 0, x: 2, z: 5 });
    const a = m.add({ id: 4, team: 1, x: -8, z: -8 }); m.add({ id: 5, team: 1, x: 5, z: 5 }); m.add({ id: 6, team: 1, keeper: true, x: 19, z: 0 });
    m.reset(1); m.phase = 'play';
    Object.assign(m.ball, newBall(-8.5, -7.5)); m.last = a.id; m.lastTeam = 1;
    for (let i = 0; i < 60; i++) m.step(1 / 30);
    expect(k.z).toBeLessThan(-0.3);
    expect(k.x).toBeLessThan(-PITCH.hx + 3);
  });

  it('the soonest player goes for a loose ball', () => {
    const m = match(4, 5); m.phase = 'play';
    Object.assign(m.ball, newBall(2, 6)); m.last = -1; m.lastTeam = null;
    m.step(1 / 30);
    const near = [...m.players].filter(p => !p.keeper).sort((a, b) => a.ti - b.ti)[0];
    for (let i = 0; i < 15; i++) m.step(1 / 30);
    expect(Math.hypot(near.x - 2, near.z - 6)).toBeLessThan(Math.hypot(near.tx - near.x, near.tz - near.z) + 6);
    expect(Math.hypot(near.tx - m.ball.x, near.tz - m.ball.z)).toBeLessThan(3);
  });
});

describe('football · a match', () => {
  for (const n of [5, 4, 3]) it(`${n} a side: the ball is only ever moved by a foot (a keeper's hands), passes, goals and kick-offs from the centre`, () => {
    const m = match(n, 11 + n);
    const frames = play(m, 240);
    const s = m.stats;
    // every contact had the ball where the body meets it
    expect(m.log.length).toBeGreaterThan(80);
    for (const c of m.log) expect(c.reach).toBeLessThanOrEqual(REACH);
    // the ball's velocity only jumps at a contact (or a post, the bar, the net, the curb: never toward a player)
    let jumps = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i];
      const dv = Math.hypot(b.vx - a.vx, b.vz - a.vz);
      if (dv > 1.2 && !b.contact) {
        const nearGoal = Math.abs(b.x) > PITCH.hx - 0.5, nearCurb = Math.abs(b.x) > PITCH.ex - 0.3 || Math.abs(b.z) > PITCH.ez - 0.3, bounce = a.h > BALL_R + 0.01 || b.h > BALL_R + 0.01;
        if (!nearGoal && !nearCurb && !bounce) jumps++;
      }
    }
    expect(jumps).toBe(0);
    console.log(`${n} a side, 240 s:`, JSON.stringify({ ...s, ballTravel: Math.round(s.ballTravel) }), 'score', m.score.join('–'));
    expect(s.passes).toBeGreaterThan(12);
    expect(s.completed).toBeGreaterThan(6);
    expect(s.shots).toBeGreaterThan(2);
    expect(s.goals).toBeGreaterThanOrEqual(1);
    expect(s.whiffs).toBeLessThan(s.contacts * 0.25);
    // after each goal, a kick-off from the centre spot
    const kick = m.events.filter(e => e.kind === 'kickoff');
    expect(kick.length).toBeGreaterThanOrEqual(s.goals);
    for (const k of kick) expect(+k.detail!).toBeLessThan(1.6);
  });

  it('a goal: the scorer and his teammates celebrate, then the ball comes back to the centre', () => {
    const m = match(4, 21);
    let saw = false, gathered = 0;
    for (let i = 0; i < 30 * 300 && m.stats.goals === 0; i++) m.step(1 / 30);
    expect(m.stats.goals).toBe(1);
    const team = 1 - m.kickTeam;
    for (let i = 0; i < 30 * 5.8; i++) {
      m.step(1 / 30);
      const s = m.get(m.scorer);
      if (s && s.cheer > 0) saw = true;
      gathered = Math.max(gathered, m.players.filter(p => p.team === team && !p.keeper && p !== s && s && Math.hypot(p.x - s.x, p.z - s.z) < 2.2).length);
    }
    expect(saw).toBe(true);
    expect(gathered).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 30 * 20 && m.phase !== 'play'; i++) m.step(1 / 30);
    expect(m.phase).toBe('play');
    expect(m.stats.kickoffs).toBeGreaterThanOrEqual(2);
  });

  it('the contact point is ahead of the body, beside the kicking foot', () => {
    const o = Match.contactPoint(0, 0, 0, 1, { x: 0, z: 0 });
    expect(o.z).toBeCloseTo(CONTACT.fwd); expect(o.x).toBeCloseTo(-CONTACT.side);   // facing +z, the right is −x
  });
});

describe('football · the city brings the players and the spectators', () => {
  const stands = Array.from({ length: 12 }, (_, k) => ({ x: -14 + k * 2.5, z: -17.8, yaw: 0 }));
  const pitch: AmbientSpot = { id: 'special:pitch:0,0', tags: ['pitch'], space: 'street', x: 0, z: 0, seats: [], stands, area: [-17, -12, 17, 12], source: 'special' };
  const plan = (scale: number, hour = 17.5, dow = 1) => planDemand([pitch], ACTIVITIES, { hour, dow, scale, px: 0, pz: -20, near: 70, far: 130, cap: 100, space: 'street', seatKind: () => null });
  const count = (rows: ReturnType<typeof plan>, id: string) => rows.filter(r => r.act.id === id).reduce((s, r) => s + r.n, 0);

  it('at 17:30 ten footballers whatever the graphics quality (a match needs its players); the spectators scale', () => {
    for (const q of ['low', 'medium', 'high'] as const) expect(count(plan(AMBIENT_BUDGET[q].scale), 'foot')).toBe(10);
    expect(count(plan(AMBIENT_BUDGET.low.scale), 'regarder-foot')).toBeLessThan(count(plan(1), 'regarder-foot'));
    expect(count(plan(1), 'regarder-foot')).toBeGreaterThanOrEqual(3);
  });

  it('nobody on the pitch outside the match hours; the Sunday-morning match', () => {
    expect(count(plan(1, 13), 'foot')).toBe(0);
    expect(count(plan(1, 10, 6), 'foot-dimanche')).toBeGreaterThanOrEqual(10);
  });

  it('the pitch spot has standing places on both touchlines, beyond the grass, facing the pitch', () => {
    const spots = buildSpots({ places: [], seats: [], interactables: [], layout: { specials: [{ kind: 'pitch', x: 0, z: 0 }], sea: null }, colliders: [], people: [], arena: null });
    const s = spots.find(x => x.tags.includes('pitch'))!;
    expect(s.area).toBeTruthy();
    expect(s.stands.length).toBeGreaterThanOrEqual(20);
    for (const t of s.stands) {
      expect(Math.abs(t.z)).toBeGreaterThan(PITCH.ez);
      expect(Math.cos(t.yaw) * -Math.sign(t.z)).toBeGreaterThan(0.9);          // looking toward the pitch
    }
  });
});
