import { describe, expect, it } from 'vitest';
import { CONTROL, PITCH, planTouch, type BodyMotion } from '../src/game/footballSim';
import { DT, E, drive, rigs, within, MatchRig, type Rig } from './helpers/footballRig';

/**
 * The player's ball control (footballSim.ts `planTouch`, used by kickabout.ts `dribble` and the match's `humanTick`), measured with the game's own
 * player movement at 60 fps: pace curve, turn rate, the ×0.8 stop (tests/helpers/footballBody.ts). One set of expectations for both paths: a player
 * who controls the ball is the same player in the kickabout and in the match.
 *
 * Before the shared model, on both paths: a turn of 45° or more lost the ball for good (it kept rolling in the old direction), a slalom made no touch at
 * all, stopping from a jog left it 4–6 m away and from a sprint 23 m away, and the touches came 1.5 s apart.
 */
const thumbTo = (r: Rig, x: number, z: number): [number, number] => [Math.atan2(x - r.body.x, z - r.body.z), 0.75];
const frames = (secs: number) => Math.round(secs / DT);

describe.each(rigs)('ball control · $name', ({ make }) => {
  it('acquires a loose ball and keeps it: run to it (it is to the side), then carry it on', () => {
    const r = make({ x: -16, z: 0 }, { x: -8, z: 3 });
    let first = -1;
    for (let i = 0; i < frames(6) && first < 0; i++) { const [w, m] = thumbTo(r, r.ball().x, r.ball().z); r.step(w, m); if (r.touches.length) first = r.t; }
    expect(first).toBeGreaterThan(0);                                        // the first touch comes
    expect(first).toBeLessThan(6);
    const d = drive(r, 2, () => [E, 0.75]);                                  // then on toward the goal
    expect(within(d, 1.6)).toBeGreaterThanOrEqual(0.97);
  });

  it.each([['a walk', 0.55], ['a jog', 0.75], ['a sprint', 1]] as const)('dribbles straight: %s keeps the ball within a stride', (_n, push) => {
    const r = make({ x: -20, z: 0 }, { x: -19.2, z: 0 });
    drive(r, 0.6, () => [E, push]);                                          // the first touches
    const d = drive(r, 2.2, () => [E, push]);
    expect(Math.max(...d)).toBeLessThanOrEqual(1.6);
    expect(within(d, 1.0)).toBeGreaterThanOrEqual(0.9);
  });

  it('the ball is never attached: it is played in touches and rolls by itself between them', () => {
    const r = make({ x: -20, z: 0 }, { x: -19.2, z: 0 });
    drive(r, 0.6, () => [E, 0.75]);
    const t0 = r.t, n0 = r.touches.length, ds: number[] = [], rel: number[] = [];
    for (let i = 0; i < frames(2.2); i++) { r.step(E, 0.75); ds.push(r.dist()); rel.push(Math.abs(r.ball().speed - r.body.speed)); }
    const times = r.touches.slice(n0), gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length, sd = Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length);
    expect(times.length).toBeGreaterThanOrEqual(4);                          // touches, at a human cadence …
    expect(times.length / (r.t - t0)).toBeLessThanOrEqual(6);                // … not one every frame
    expect(gaps[Math.floor(gaps.length / 2)]).toBeGreaterThanOrEqual(0.18);
    expect(sd).toBeGreaterThan(0.01);                                        // the distance breathes: the ball is at the foot, then a step ahead
    expect(rel.filter(v => v > 0.1).length / rel.length).toBeGreaterThan(0.2);   // and it has its own pace, not the body's
  });

  it.each([['45°', Math.PI / 4], ['−45°', -Math.PI / 4], ['90°', Math.PI / 2], ['−90°', -Math.PI / 2], ['180°', Math.PI]] as const)('turns %s at a jog and still has the ball', (_n, turn) => {
    const r = make({ x: -17, z: 0 }, { x: -16.2, z: 0 });
    drive(r, 2, () => [E, 0.75]);
    const n0 = r.touches.length;
    const d = drive(r, 2.5, () => [E + turn, 0.75]);
    expect(Math.max(...d)).toBeLessThanOrEqual(2.0);                         // never further than a long stride, even in the turn
    expect(within(d, 1.6)).toBeGreaterThanOrEqual(0.97);
    expect((r.touches.length - n0) / 2.5).toBeLessThanOrEqual(8);            // not pinned to the foot by a touch every frame (the ball beside the body)
  });

  it('keeps the ball through a slalom (±0.8 rad each second)', () => {
    const r = make({ x: -19, z: 0 }, { x: -18.2, z: 0 });
    drive(r, 2, () => [E, 0.75]);
    const d = drive(r, 6, t => [E + (Math.floor(t) % 2 ? 0.8 : -0.8), 0.75]);
    expect(within(d, 1.6)).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...d)).toBeLessThanOrEqual(2.2);
  });

  it.each([['a jog', 0.75, 3], ['a sprint', 1, 2]] as const)('stops from %s: the ball ends at rest at the foot, not rolling away', (_n, push, secs) => {
    const r = make({ x: -19, z: 0 }, { x: -18.2, z: 0 });
    drive(r, secs, () => [E, push]);
    drive(r, 2.5, () => [E, 0]);
    expect(r.ball().speed).toBeLessThan(0.3);
    expect(r.dist()).toBeLessThanOrEqual(1.6);
  });

  it('a ball arriving at a standing player is trapped at the foot', () => {
    const r = make({ x: 0, z: 0, facing: Math.PI / 2 }, { x: 8, z: 0 });
    // kicked at the player from 8 m (not by the player): the ball comes in at 7 m/s
    if (r instanceof MatchRig) { r.m.ball.vx = -7; } else { (r as unknown as { kb: { ball: { vx: number } } }).kb.ball.vx = -7; }
    drive(r, 3, () => [E, 0]);
    expect(r.ball().speed).toBeLessThan(0.5);
    expect(r.dist()).toBeLessThanOrEqual(1.8);
  });
});

describe.each(rigs)('the whole sequence · $name', ({ make }) => {
  it('acquire → dribble → turn → pass → regain → shoot (goal, once) → shoot wide (play goes on)', () => {
    const r = make({ x: -14, z: 0 }, { x: -9, z: 0 });
    const mate = { x: 0, z: 0 };
    let maxX = -99, minTarget = 99;
    // 1. acquire: run to the ball
    for (let i = 0; i < frames(5) && !r.touches.length; i++) { const [w, m] = thumbTo(r, r.ball().x, r.ball().z); r.step(w, m); }
    expect(r.touches.length).toBeGreaterThan(0);
    // 2. dribble straight, 3. turn 90° and carry on, then face the mate
    expect(within(drive(r, 1.5, () => [E, 0.75]), 1.6)).toBeGreaterThanOrEqual(0.97);
    expect(within(drive(r, 1.2, () => [E + Math.PI / 2, 0.75]), 1.6)).toBeGreaterThanOrEqual(0.97);
    // line up on the mate (0, 0): jog toward it until 5 m away, then stand; the ball is taken at the foot
    for (let i = 0; i < frames(4); i++) { const [w] = thumbTo(r, mate.x, mate.z); const near = Math.hypot(mate.x - r.body.x, mate.z - r.body.z) < 5; r.step(w, near ? 0 : 0.75); }
    drive(r, 1.2, () => [Math.atan2(mate.x - r.body.x, mate.z - r.body.z), 0]);
    // 4. pass: the ball leaves the body and travels by itself
    const touches0 = r.touches.length, bx0 = r.ball().x, bz0 = r.ball().z;
    expect(r.pass(mate)).toBe(true);
    for (let i = 0; i < frames(0.8); i++) { r.step(Math.atan2(mate.x - r.body.x, mate.z - r.body.z), 0); }
    expect(r.ball().speed).toBeGreaterThan(1);                               // still travelling, on its own
    expect(Math.hypot(r.ball().x - bx0, r.ball().z - bz0)).toBeGreaterThan(2);
    expect(r.dist()).toBeGreaterThan(2.5);                                   // away from the body that played it
    expect(r.touches.length).toBe(touches0);                                 // the body did not touch it again meanwhile
    for (let i = 0; i < frames(4); i++) { r.step(0, 0); minTarget = Math.min(minTarget, Math.hypot(r.ball().x - mate.x, r.ball().z - mate.z)); }
    expect(minTarget).toBeLessThanOrEqual(2.5);                              // it went to the mate
    // 5. regain: run onto it
    const n1 = r.touches.length;
    for (let i = 0; i < frames(10) && r.touches.length === n1; i++) { const [w, m] = thumbTo(r, r.ball().x, r.ball().z); r.step(w, m); }
    expect(r.touches.length).toBeGreaterThan(n1);                            // possession back
    drive(r, 1.5, () => [E, 0]);
    expect(r.dist()).toBeLessThanOrEqual(1.6);
    // 6. shoot: from 12 m, a real goal, counted once
    r.put(8, 0, E); r.place(8.8, 0);
    expect(r.shoot(0.8)).toBe(true);
    for (let i = 0; i < frames(2.5); i++) { r.step(E, 0); maxX = Math.max(maxX, r.ball().x); }
    expect(maxX).toBeGreaterThan(PITCH.hx + 0.1);                            // the ball crossed the goal line (between the posts)
    expect(r.goals()).toBe(1);
    for (let i = 0; i < frames(5); i++) r.step(E, 0);
    expect(r.goals()).toBe(1);                                               // not counted again while it sits in the net or comes back
  });

  it('a shot wide of the posts is no goal, and play goes on: the ball stays in play and is taken again', () => {
    const r = make({ x: 8, z: 9 }, { x: 8.8, z: 9 });
    expect(r.shoot(0.8)).toBe(true);
    for (let i = 0; i < frames(4); i++) r.step(E, 0);
    expect(r.goals()).toBe(0);
    const b = r.ball();
    expect(Math.abs(b.x)).toBeLessThanOrEqual(PITCH.ex);                     // the curb keeps it on the grass
    expect(Math.abs(b.z)).toBeLessThanOrEqual(PITCH.ez);
    if (r instanceof MatchRig) { expect(r.m.phase).not.toBe('goal'); return; }   // the match restarts it itself (NPCs take the restart)
    const n0 = r.touches.length;
    for (let i = 0; i < frames(14) && r.touches.length === n0; i++) { const [w, m] = thumbTo(r, r.ball().x, r.ball().z); r.step(w, m); }
    expect(r.touches.length).toBeGreaterThan(n0);                            // taken again: the ball is still playable
  });

  it('leaving: a player who walks away from the ball touches nothing, and nothing is left running', () => {
    const r = make({ x: -3, z: 0 }, { x: -2.2, z: 0 });
    drive(r, 1.5, () => [E, 0.75]);
    drive(r, 1, () => [E, 0]);
    const n0 = r.touches.length;
    drive(r, 8, () => [-E, 0.75]);                                           // away, to the other side
    const far = r.dist();
    drive(r, 3, () => [-E, 0.75]);
    expect(r.touches.length).toBe(n0);
    expect(far).toBeGreaterThan(5);
    if (r instanceof MatchRig) {
      r.m.remove(99);
      expect(r.m.get(99)).toBeNull();
      for (let i = 0; i < frames(3); i++) r.m.step(DT);                       // the match plays on without them
      expect(Number.isFinite(r.m.ball.x)).toBe(true);
    }
  });
});

describe('the control model alone', () => {
  const ball = (x: number, z: number, vx = 0, vz = 0) => ({ x, z, h: 0.11, vx, vz, vh: 0, net: 0 as const });
  const body = (vx: number, facing = Math.PI / 2): BodyMotion => ({ x: 0, z: 0, facing, vx, vz: 0 });

  it('out of reach, in the net or in the air: no touch', () => {
    expect(planTouch(body(4), ball(5, 0), 1)).toBeNull();
    expect(planTouch(body(4), { ...ball(0.6, 0), net: 1 }, 1)).toBeNull();
    expect(planTouch(body(4), { ...ball(0.6, 0), h: 1.5 }, 1)).toBeNull();
  });
  it('a ball at rest beside a standing body is left alone; a rolling one is trapped by a share of its pace', () => {
    expect(planTouch(body(0), ball(0.6, 0), 1)).toBeNull();
    const t = planTouch(body(0), ball(0.7, 0, -6, 0), 1)!;
    expect(t.kind).toBe('trap');
    expect(t.speed).toBeCloseTo(6 * CONTROL.trap, 5);
  });
  it('a touch is not due again at once, but is when the body has turned or the ball is level with it', () => {
    expect(planTouch(body(4), ball(0.9, 0), 0.03)).toBeNull();
    expect(planTouch(body(4), ball(0.9, 0), 0.5)).not.toBeNull();            // the cadence
    expect(planTouch(body(4), ball(0.9, 0), 0.06, 0.8)).not.toBeNull();      // it turned
    expect(planTouch(body(4), ball(0.05, -0.6), 0.06)).not.toBeNull();       // the ball is beside it
  });
  it('a touch plays the ball ahead of the body, at a pace that is neither a stop nor a shot', () => {
    const t = planTouch(body(4), ball(0.7, 0), 0.5)!;
    expect(t.kind).toBe('touch');
    expect(t.dx).toBeGreaterThan(0.9);
    expect(t.speed).toBeGreaterThan(2);
    expect(t.speed).toBeLessThan(9.01);
  });
});
