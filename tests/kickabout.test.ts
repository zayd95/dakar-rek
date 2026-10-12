import { describe, expect, it } from 'vitest';
import { BALL_R, PITCH, stepBall } from '../src/game/footballSim';
import { DRIBBLE, KICK_REACH, KickBall, aimShot, newerTouch } from '../src/game/kickabout';
import { BALL_LIMITS, parseBall, type BallRelay } from '../src/multiplayer/protocol';

const relay = (from: string, w: object): BallRelay => ({ ...(w as BallRelay), from });
const T0 = 1_800_000_000_000;

describe('kickabout ownership: last touch wins', () => {
  it('a later touch wins; the same touch is the owner\'s own update; a tie goes to the smaller id', () => {
    expect(newerTouch('', 0, 'b', 5)).toBe(true);
    expect(newerTouch('a', 10, 'b', 11)).toBe(true);
    expect(newerTouch('a', 10, 'b', 9)).toBe(false);
    expect(newerTouch('a', 10, 'a', 10)).toBe(true);
    expect(newerTouch('b', 10, 'a', 10)).toBe(true);
    expect(newerTouch('a', 10, 'b', 10)).toBe(false);
  });

  it('a claim is always later than any touch seen, whatever the clock says', () => {
    const k = new KickBall();
    k.receive(relay('b', { type: 'ball', x: 0, z: 0, h: BALL_R, vx: 0, vz: 0, vh: 0, n: 0, t: T0 + 5000, a: T0 + 5000 }), 'a', T0 + 5000);
    expect(k.owner).toBe('b');
    k.claim('a', T0);                              // a's clock is behind b's
    expect(k.owner).toBe('a');
    expect(k.touch).toBeGreaterThan(T0 + 5000);
  });

  it('two clients merge to the same owner and ball whatever order the states arrive in', () => {
    const A = new KickBall(), B = new KickBall();
    // both touch the ball at nearly the same time, each sends its state
    A.kick(0, -0.5, 0, 'pass', 0, null, 'a', T0 + 100);
    B.dribble(-0.3, 0, 2, 0, 0.05, 'b', T0 + 120);
    const wa = { ...A.outgoing('a', T0 + 130)! }, wb = { ...B.outgoing('b', T0 + 130)! };
    expect(wa.t).toBe(T0 + 100); expect(wb.t).toBe(T0 + 120);
    A.receive(relay('b', wb), 'a', T0 + 140);
    B.receive(relay('a', wa), 'b', T0 + 140);       // older touch: ignored
    expect(A.owner).toBe('b'); expect(B.owner).toBe('b');
    expect(A.outgoing('a', T0 + 400)).toBeNull();   // only the owner sends
    expect(B.outgoing('b', T0 + 400)).not.toBeNull();
    // the same physics afterwards: within a few millimetres
    for (let i = 0; i < 60; i++) { A.step(1 / 60, 'a', T0 + 140 + i * 16); B.step(1 / 60, 'b', T0 + 140 + i * 16); }
    expect(Math.hypot(A.ball.x - B.ball.x, A.ball.z - B.ball.z)).toBeLessThan(0.05);
  });

  it('a state is extrapolated by its age with the ball\'s physics; the drawn ball eases over the gap', () => {
    const k = new KickBall();
    const w = { type: 'ball' as const, x: 0, z: 0, h: BALL_R, vx: 8, vz: 0, vh: 0, n: 0 as const, t: T0, a: T0 };
    k.receive(relay('b', w), 'a', T0 + 200);
    const ref = { x: 0, z: 0, h: BALL_R, vx: 8, vz: 0, vh: 0, net: 0 as const };
    stepBall(ref, 0.2);
    expect(k.ball.x).toBeCloseTo(ref.x, 3);
    expect(k.ox).toBeCloseTo(-ref.x, 3);            // drawn where it was, eased from there
    k.step(0.5, 'a', T0 + 700);
    expect(Math.abs(k.ox)).toBeLessThan(0.05);
  });

  it('only the owner sends: at once after a touch, ~10 Hz while moving, 1 Hz at rest', () => {
    const k = new KickBall();
    expect(k.outgoing('a', T0)).toBeNull();
    k.kick(0, -0.5, 0, 'shot', 0.5, null, 'a', T0);
    expect(k.outgoing('a', T0)).not.toBeNull(); k.sent(T0, true);
    expect(k.outgoing('a', T0 + 50)).toBeNull();
    expect(k.outgoing('a', T0 + 100)).not.toBeNull(); k.sent(T0 + 100, true);
    k.place(3, 3); k.claim('a', T0 + 200); k.sent(T0 + 200, true);
    expect(k.outgoing('a', T0 + 500)).toBeNull();
    expect(k.outgoing('a', T0 + 1200)).not.toBeNull();
    expect(k.outgoing('', T0 + 5000)).toBeNull();   // offline: nothing
  });

  it('states from one sender closer than 50 ms are dropped', () => {
    const k = new KickBall();
    const w = { type: 'ball' as const, x: 1, z: 1, h: BALL_R, vx: 0, vz: 0, vh: 0, n: 0 as const, t: T0, a: T0 };
    k.receive(relay('b', w), 'a', T0);
    k.receive(relay('b', { ...w, t: T0 + 1, x: 5 }), 'a', T0);
    expect(k.ball.x).toBe(1);
    expect(k.stats.dropped).toBe(1);
  });

  it('a goal is announced once by the receivers, from the owner\'s state', () => {
    const k = new KickBall();
    const w = { type: 'ball' as const, x: PITCH.hx + 0.4, z: 0, h: 0.5, vx: 0, vz: 0, vh: 0, n: 1 as const, t: T0, a: T0 };
    const g = k.receive(relay('b', w), 'a', T0);
    expect(g).toEqual({ end: 1, by: 'b', mine: false });
    expect(k.receive(relay('b', { ...w, a: T0 + 100 }), 'a', T0 + 100 + 60)).toBeNull();
  });
});

describe('kickabout: dribble and kicks', () => {
  it('running into the ball pushes it a little ahead, the runner catches it up', () => {
    const k = new KickBall(); k.place(0, 0);
    let px = 0, pz = -3; const v = 4.5, dt = 1 / 60;
    let touches = 0, maxGap = 0;
    for (let t = 0; t < 4; t += dt) {
      pz += v * dt;
      if (k.dribble(px, pz, 0, v, dt, 'a', T0 + t * 1000)) touches++;
      k.step(dt, 'a', T0 + t * 1000);
      if (touches) maxGap = Math.max(maxGap, k.ball.z - pz);
    }
    expect(touches).toBeGreaterThanOrEqual(3);
    expect(maxGap).toBeLessThan(2.5);
    expect(k.ball.z).toBeGreaterThan(pz - 0.2);       // ahead of the runner
    expect(Math.abs(k.ball.x - px)).toBeLessThan(0.3);
    expect(k.owner).toBe('a');
  });

  it('standing still stops a ball rolling into the body', () => {
    const k = new KickBall(); k.place(0, -4); k.ball.vz = 6;
    for (let t = 0; t < 2; t += 1 / 60) { k.dribble(0, 0, 0, 0, 1 / 60, 'b', T0); k.step(1 / 60, 'b', T0); }
    expect(Math.hypot(k.ball.vx, k.ball.vz)).toBeLessThan(1.2);
    expect(Math.hypot(k.ball.x, k.ball.z)).toBeLessThan(DRIBBLE.body + BALL_R + 1.3);
    expect(k.owner).toBe('b');
  });

  it('a pass arrives at its receiver still rolling; out of reach nothing happens', () => {
    const k = new KickBall(); k.place(0, 0);
    expect(k.kick(0, -KICK_REACH - 0.5, 0, 'pass', 0, { x: 0, z: 12 }, 'a', T0)).toBe(false);
    expect(k.kick(0, -0.5, 0, 'pass', 0, { x: 6, z: 10 }, 'a', T0)).toBe(true);
    let closest = Infinity, speedThere = 0;
    for (let t = 0; t < 6; t += 1 / 60) { k.step(1 / 60, 'a', T0); const d = Math.hypot(k.ball.x - 6, k.ball.z - 10); if (d < closest) { closest = d; speedThere = Math.hypot(k.ball.vx, k.ball.vz); } }
    expect(closest).toBeLessThan(0.3);
    expect(speedThere).toBeGreaterThan(1.2);
  });

  it('a shot towards a goal scores (aim help near the posts); the scorer is the owner', () => {
    const k = new KickBall(); k.place(PITCH.hx - 10, 1);
    const facing = Math.atan2(1, 0.12);               // towards +x, a little wide of the far post
    const d = aimShot(k.ball.x, k.ball.z, facing, { x: 0, z: 0 });
    expect(Math.abs(k.ball.z + d.z / d.x * (PITCH.hx - k.ball.x))).toBeLessThan(PITCH.post);
    expect(k.kick(k.ball.x - 0.6, 1, facing, 'shot', 0.6, null, 'a', T0)).toBe(true);
    let goal = null;
    for (let t = 0; t < 3 && !goal; t += 1 / 60) goal = k.step(1 / 60, 'a', T0 + t * 1000);
    expect(goal).toEqual({ end: 1, by: 'a', mine: true });
    // back on the centre spot after a moment in the net, still the scorer's
    for (let t = 0; t < 3; t += 1 / 60) k.step(1 / 60, 'a', T0 + 4000);
    expect(k.ball.net).toBe(0);
    expect(Math.hypot(k.ball.x, k.ball.z)).toBeLessThan(0.01);
    expect(k.owner).toBe('a');
  });

  it('more power, a faster and higher shot', () => {
    const a = new KickBall(), b = new KickBall();
    a.kick(0, -0.5, 0, 'shot', 0, null, 'a', T0); b.kick(0, -0.5, 0, 'shot', 1, null, 'a', T0);
    expect(Math.hypot(b.ball.vx, b.ball.vz)).toBeGreaterThan(Math.hypot(a.ball.vx, a.ball.vz) + 10);
    expect(b.ball.vh).toBeGreaterThan(a.ball.vh);
  });
});

describe('ball wire validation (protocol, additive to v1)', () => {
  const ok = { type: 'ball', x: 1, z: 2, h: 0.2, vx: 3, vz: 0, vh: 0, n: 0, t: T0, a: T0 };
  it('keeps a good state, clamps it to the pitch, drops unknown keys', () => {
    expect(parseBall(ok, T0)).toEqual(ok);
    const c = parseBall({ ...ok, x: 900, z: -900, h: 50, evil: 'x' }, T0)!;
    expect(c.x).toBe(BALL_LIMITS.ex); expect(c.z).toBe(-BALL_LIMITS.ez); expect(c.h).toBe(BALL_LIMITS.hMax);
    expect('evil' in c).toBe(false);
  });
  it('refuses non-finite numbers, absurd speeds, bad nets and times', () => {
    for (const bad of [{ ...ok, x: NaN }, { ...ok, vx: Infinity }, { ...ok, vx: 60 }, { ...ok, vh: 99 }, { ...ok, n: 2 }, { ...ok, t: 'x' }, { ...ok, t: T0 + 9e7 }, { ...ok, t: T0 + 5000 }, { ...ok, type: 'move' }, null, [1]])
      expect(parseBall(bad, T0)).toBeNull();
  });
});
