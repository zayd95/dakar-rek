import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { loadRig, posed } from './rig';
import { fixRunClip } from '../src/actors/humanoid';
import { GAIT } from '../src/game/stride';
import {
  GaitState, GROUND, REACH, RIG, RUN_ABOVE, SOLE, WALK_BELOW, ankleOffset, gaitParams, landingZ, runParams, solveKnee, stancePitch, walkParams,
} from '../src/actors/gait';
import { GaitRig } from '../src/actors/gaitRig';

const DT = 1 / 60;
/** Each frame: the speed, the body's facing, the way it moves when that is not where it faces (the player while turning). */
type Drive = (t: number) => { v: number; yaw?: number; dir?: number; inPlace?: boolean };

/** Drives a body (the rig in node, no meshes) with the gait, frame by frame, and records the soles' points in the world. */
function walkRig(seconds: number, drive: Drive) {
  const { root, clips } = loadRig(); fixRunClip(clips);
  const body = new THREE.Group(); body.add(root);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clips.find(c => c.name === 'Idle')!).play();
  body.updateMatrixWorld(true);
  const foot = { L: root.getObjectByName('footL')!, R: root.getObjectByName('footR')! };
  // the sole's heel and ball, in each foot bone's frame (from the rest pose)
  const sole = (side: 'L' | 'R', z: number) => foot[side].worldToLocal(new THREE.Vector3(side === 'L' ? RIG.ankle.x : -RIG.ankle.x, GROUND, z));
  const pts = { heelL: sole('L', -0.055), ballL: sole('L', 0.1), heelR: sole('R', -0.055), ballR: sole('R', 0.1) };
  const g = new GaitState(), rig = GaitRig.from(root)!;
  let x = 0, z = 0, yaw = 0;
  const frames: { t: number; g: GaitState; pts: Record<string, THREE.Vector3>; ankles: THREE.Vector3[]; knees: THREE.Vector3[]; hips: THREE.Vector3[]; targets: number[][] }[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const d = drive(t);
    if (d.yaw !== undefined) yaw = d.yaw;
    const dir = d.dir ?? yaw;
    if (!d.inPlace) { x += Math.sin(dir) * d.v * DT; z += Math.cos(dir) * d.v * DT; }
    body.position.set(x, 0, z); body.rotation.y = yaw;
    g.update(DT, x, z, yaw, 1, d.v);
    mixer.update(DT);
    if (g.stand > 0) rig.apply(g, g.stand);
    body.updateMatrixWorld(true);
    const p: Record<string, THREE.Vector3> = {};
    for (const [k, v] of Object.entries(pts)) p[k] = v.clone().applyMatrix4(foot[k.endsWith('L') ? 'L' : 'R'].matrixWorld);
    const wp = (n: string) => root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
    frames.push({ t, g, pts: p, ankles: [wp('footL'), wp('footR')], knees: [wp('shinL'), wp('shinR')], hips: [wp('thighL'), wp('thighR')],
      targets: g.feet.map(f => [f.ax, f.ay, f.az, f.swing ? 1 : 0]) });
  }
  return { frames, body, root };
}

/** The player's movement as src/main.ts makes it: the speed eased (6/s up, 12/s down), the body turning at 14/s towards the stick's way. */
function player(input: (t: number) => { target: number; dir: number }): Drive {
  let speed = 0, facing = 0, last = -1;
  return t => {
    if (t > last) {
      const i = input(t); last = t;
      speed += (i.target - speed) * Math.min(1, DT * (i.target > speed ? 6 : 12));
      if (i.target > 0.05) facing += Math.atan2(Math.sin(i.dir - facing), Math.cos(i.dir - facing)) * Math.min(1, DT * 14);
      return { v: speed, yaw: facing, dir: i.dir };
    }
    return { v: speed, yaw: facing };
  };
}

/**
 * Sliding: each frame the lowest point of the soles carries the body when it is within 1.5 cm of the ground; while the
 * same point stays the support, its horizontal motion is sliding. Steps: the support changing feet.
 */
function slide(frames: ReturnType<typeof walkRig>['frames'], from = 1.5) {
  const fr = frames.filter(f => f.t >= from), keys = ['heelL', 'ballL', 'heelR', 'ballR'];
  const ground = Math.min(...fr.flatMap(f => keys.map(k => f.pts[k].y)));
  let total = 0, steps = 0, side = '', prevKey = '', prev: THREE.Vector3 | null = null, worst = 0, acc = 0, t0 = 0, t1 = 0;
  for (const f of fr) {
    let key = keys[0]; for (const k of keys) if (f.pts[k].y < f.pts[key].y) key = k;
    const p = f.pts[key], down = p.y < ground + 0.015;
    if (down && key === prevKey && prev) { const d = Math.hypot(p.x - prev.x, p.z - prev.z); total += d; acc += d; }
    if (down && key.slice(-1) !== side) { if (side) { steps++; worst = Math.max(worst, acc); t1 = f.t; } else t0 = f.t; acc = 0; side = key.slice(-1); }
    prevKey = down ? key : ''; prev = down ? p : null;
  }
  // the cadence: steps over the time between the first and the last foot coming down
  return { perStep: steps ? total / steps : 0, worst: Math.max(worst, acc), steps, spm: t1 > t0 ? (steps / (t1 - t0)) * 60 : 0 };
}

describe('the rig the gait is built for (public/assets/character_v4.glb)', () => {
  it('legs, hips and feet measure what src/actors/gait.ts says', () => {
    const { root, clips } = loadRig();
    const { pos, dir } = posed(root, clips.find(c => c.name === 'Idle')!);
    const hip = pos('thighL'), knee = pos('shinL'), ankle = pos('footL');
    expect(hip.distanceTo(knee)).toBeCloseTo(RIG.thigh, 3);
    expect(knee.distanceTo(ankle)).toBeCloseTo(RIG.shin, 3);
    expect(hip.x).toBeCloseTo(RIG.hipX, 3); expect(hip.y).toBeCloseTo(RIG.hipY, 3);
    expect(ankle.x).toBeCloseTo(RIG.ankle.x, 2); expect(ankle.y).toBeCloseTo(RIG.ankle.y, 2); expect(ankle.z).toBeCloseTo(RIG.ankle.z, 2);
    const f = dir('footL');
    expect(Math.atan2(f.y, f.z)).toBeCloseTo(RIG.footTilt, 2);
    // the checks' sole points: on the ground under the heel and the ball, foot flat
    const bone = root.getObjectByName('footL')!;
    const heel = new THREE.Vector3(...SOLE.heel).applyMatrix4(bone.matrixWorld), ball = new THREE.Vector3(...SOLE.ball).applyMatrix4(bone.matrixWorld);
    expect(heel.y).toBeCloseTo(GROUND, 3); expect(ball.y).toBeCloseTo(GROUND, 3);
    expect(ball.z - heel.z).toBeCloseTo(RIG.heelToBall, 3);
  });
  it('the exported Run clip bent the knees backwards: fixed at load, like Sit (and only once)', () => {
    const { clips } = loadRig();
    const run = clips.find(c => c.name === 'Run')!, shin = run.tracks.find(t => t.name === 'shinL.quaternion')!;
    expect(Math.max(...Array.from(shin.values).filter((_, i) => i % 4 === 0))).toBeLessThan(0);   // as exported: −X about the knee
    fixRunClip(clips);
    const xs = () => Array.from(shin.values).filter((_, i) => i % 4 === 0);
    expect(Math.min(...xs())).toBeGreaterThan(0);                                                  // like Walk's: +X, the knee bends forward
    const once = xs(); fixRunClip(clips); expect(xs()).toEqual(once);
    const walkShin = clips.find(c => c.name === 'Walk')!.tracks.find(t => t.name === 'shinL.quaternion')!;
    expect(Math.min(...Array.from(walkShin.values).filter((_, i) => i % 4 === 0))).toBeGreaterThan(0);
  });
});

describe('speed → gait (cadence × step = speed, the clip chosen by the speed)', () => {
  it('walks up to 2.3 m/s and runs above 2.6 m/s; the brisk default (4.2 m/s) is a light run', () => {
    expect(WALK_BELOW).toBeLessThan(RUN_ABOVE);
    expect(GAIT.walk).toBeLessThan(WALK_BELOW);
    expect(GAIT.brisk).toBeGreaterThan(RUN_ABOVE); expect(GAIT.run).toBeGreaterThan(RUN_ABOVE);
  });
  it('cadence and step follow the speed like a person\'s', () => {
    const at = (v: number) => { const p = gaitParams(v); return { spm: p.cadence * 60, step: p.step, duty: p.duty }; };
    const w14 = at(1.4), w22 = at(GAIT.walk), r42 = at(GAIT.brisk), r70 = at(GAIT.run);
    expect(w14.spm).toBeCloseTo(120, 0); expect(w14.step).toBeCloseTo(0.7, 2); expect(w14.duty).toBeGreaterThan(0.55);
    expect(w22.spm).toBeGreaterThan(150); expect(w22.spm).toBeLessThan(170); expect(w22.step).toBeCloseTo(0.82, 2); expect(w22.duty).toBeGreaterThan(0.5);
    expect(r42.spm).toBeGreaterThan(168); expect(r42.spm).toBeLessThan(180); expect(r42.step).toBeCloseTo(1.45, 1); expect(r42.duty).toBeLessThan(0.3);
    expect(r70.spm).toBeGreaterThan(185); expect(r70.spm).toBeLessThan(200); expect(r70.step).toBeGreaterThan(2); expect(r70.duty).toBeLessThan(r42.duty);
    for (const v of [0.5, 1, 1.4, 1.8, 2.2, 3, 4.2, 5.5, 7, 7.8]) { const p = gaitParams(v); expect(p.cadence * p.step).toBeCloseTo(v, 6); }
    // slower walks: shorter steps and a lower cadence; faster runs: longer steps, a quicker cadence
    expect(walkParams(0.8).step).toBeLessThan(walkParams(1.4).step); expect(walkParams(0.8).cadence).toBeLessThan(walkParams(1.4).cadence);
    expect(runParams(7).step).toBeGreaterThan(runParams(4.2).step); expect(runParams(7).cadence).toBeGreaterThan(runParams(4.2).cadence);
  });
  it('the run moves more than the walk: higher heel, bent elbows, more arm swing, more lean; less at a jog than flat out', () => {
    const w = gaitParams(1.4), j = gaitParams(4.2), r = gaitParams(7);
    expect(j.kick).toBeGreaterThan(0); expect(r.kick).toBeGreaterThan(j.kick);
    expect(j.elbow).toBeGreaterThan(w.elbow + 1); expect(r.arm).toBeGreaterThan(j.arm); expect(j.arm).toBeGreaterThan(w.arm);
    expect(r.lean).toBeGreaterThan(j.lean); expect(j.lean).toBeGreaterThan(w.lean);
    expect(Math.abs(j.bob)).toBeLessThan(0.035);                                                   // a light run, not bounding
  });
  it('the planted foot rolls heel → flat → ball', () => {
    const p = gaitParams(1.4);
    expect(stancePitch(0, p)).toBeCloseTo(p.heelStrike, 6); expect(stancePitch(0, p)).toBeGreaterThan(0);
    expect(stancePitch((p.footFlat + p.heelOff) / 2, p)).toBe(0);
    expect(stancePitch(1, p)).toBeCloseTo(p.toeOff, 6); expect(p.toeOff).toBeLessThan(0);
    // the ankle above the heel (toes up) and above the ball (heel up) meet when the foot is flat
    expect(ankleOffset(0, { z: 0, y: 0 }).z).toBeCloseTo(RIG.heelToAnkle.z, 6);
    expect(ankleOffset(-1e-9, { z: 0, y: 0 }).z + RIG.heelToBall).toBeCloseTo(RIG.heelToAnkle.z, 6);
    // the foot lands ahead of the hips, the step's stance centred under the body
    expect(landingZ(1.4, p)).toBeGreaterThan(0.2); expect(landingZ(1.4, p)).toBeLessThan(0.4);
  });
  it('two-bone IK: the knee bends forward, the ankle is reached when it can be', () => {
    const knee = { x: 0, y: 0, z: 0 }, a = { x: 0.1, y: 0.2, z: 0.1 };
    solveKnee(0.1, 0.9, 0, a, 0, 1, knee);
    expect(Math.hypot(knee.x - 0.1, knee.y - 0.9, knee.z)).toBeCloseTo(RIG.thigh, 6);
    expect(Math.hypot(a.x - knee.x, a.y - knee.y, a.z - knee.z)).toBeCloseTo(RIG.shin, 6);
    expect(knee.z).toBeGreaterThan(0.05);                                                           // in front of the hip–ankle line
    const far = { x: 0.1, y: -1, z: 0 }; solveKnee(0.1, 0.9, 0, far, 0, 1, knee);
    expect(Math.hypot(far.x - 0.1, far.y - 0.9, far.z)).toBeCloseTo(REACH, 6);                       // out of reach: the leg's end
  });
});

describe('the gait on the rig: feet that stay put, smooth hips, joints that bend the right way', () => {
  for (const [label, v, spm] of [['walk 1.4 m/s', 1.4, 120], [`walk ${GAIT.walk} m/s`, GAIT.walk, 161], [`brisk ${GAIT.brisk} m/s`, GAIT.brisk, 174], [`run ${GAIT.run} m/s`, GAIT.run, 192]] as const) {
    it(`${label}: no sliding, the cadence of the speed, the knees forward`, () => {
      const { frames } = walkRig(5, () => ({ v }));
      const s = slide(frames);
      expect(s.perStep).toBeLessThan(0.012);                                                          // < 1.2 cm a step (the old clips: 20–47 cm)
      expect(s.worst).toBeLessThan(0.02);
      expect(s.spm).toBeGreaterThan(spm * 0.95); expect(s.spm).toBeLessThan(spm * 1.08);
      for (const f of frames.filter(x => x.t > 1)) {
        for (let i = 0; i < 2; i++) {
          // the knee in front of the line from the hip to the ankle (never bent backwards)
          const h = f.hips[i], k = f.knees[i], a = f.ankles[i];
          const along = new THREE.Vector3().subVectors(a, h).normalize();
          const toKnee = new THREE.Vector3().subVectors(k, h);
          const perp = toKnee.sub(along.multiplyScalar(toKnee.dot(along)));
          expect(perp.z).toBeGreaterThan(-0.005);
          // planted feet are where the gait put them (the IK reaches)
          if (!f.targets[i][3]) expect(Math.abs(a.y - f.targets[i][1])).toBeLessThan(0.002);
        }
      }
      // the hips move smoothly (no jump from one frame to the next)
      const hy = frames.filter(x => x.t > 1).map(f => (f.hips[0].y + f.hips[1].y) / 2);
      for (let i = 1; i < hy.length; i++) expect(Math.abs(hy[i] - hy[i - 1])).toBeLessThan(v > 3 ? 0.022 : 0.016);
    });
  }
  it('start, brisk walk and stop like the player (speed eased in and out): the feet stay put and end under the hips', () => {
    const { frames } = walkRig(5, t => ({ v: t < 1 ? 0 : t < 3 ? 4.2 * (1 - Math.exp(-6 * (t - 1))) : 4.2 * Math.exp(-12 * (t - 3)) }));
    const s = slide(frames, 0.5);
    expect(s.perStep).toBeLessThan(0.015); expect(s.worst).toBeLessThan(0.04);
    const g = frames[frames.length - 1].g;
    expect(g.moving).toBe(false);
    for (const f of g.feet) { expect(f.swing).toBe(false); expect(Math.hypot(f.ax - f.side * RIG.ankle.x, f.az - RIG.ankle.z)).toBeLessThan(0.13); }
  });
  it('a 90° turn while walking: the planted foot pivots, it does not skate', () => {
    const { frames } = walkRig(4, t => ({ v: 1.4, yaw: t < 2 ? 0 : Math.min(Math.PI / 2, (t - 2) * 6) }));
    const s = slide(frames, 1);
    expect(s.perStep).toBeLessThan(0.012); expect(s.worst).toBeLessThan(0.03);
  });
  it('stopping from the brisk run at any moment of the stride (as scripts/check-gait.mjs): the last steps do not skid, the toes do not drag', () => {
    for (let T1 = 1; T1 < 1.8; T1 += 0.08) {
      const { frames } = walkRig(T1 + 2.5, player(t => ({ target: t < T1 ? 4.2 : 0, dir: 0 })));
      const s = slide(frames, T1);
      expect(s.worst, `stop at ${T1.toFixed(2)} s`).toBeLessThan(0.03);
      const g = frames[frames.length - 1].g;
      expect(g.moving).toBe(false); expect(g.feet.every(f => !f.swing)).toBe(true);
    }
  });
  it('the stick turned 90° while walking (the steps go sideways while the body turns at 14/s): no skating at any moment of the stride', () => {
    for (let T1 = 1; T1 < 2; T1 += 0.1) {
      const { frames } = walkRig(T1 + 2.2, player(t => ({ target: 1.4, dir: t < T1 ? 0 : -Math.PI / 2 })));
      const s = slide(frames, T1);
      expect(s.perStep, `turn at ${T1.toFixed(2)} s`).toBeLessThan(0.015); expect(s.worst, `turn at ${T1.toFixed(2)} s`).toBeLessThan(0.035);
    }
  });
  it('turning on the spot: the feet step round (no moonwalk), then stand under the hips', () => {
    const { frames } = walkRig(4, t => ({ v: 0, inPlace: true, yaw: t < 1 ? 0 : Math.min(Math.PI / 2, (t - 1) * 2.5) }));
    const g = frames[frames.length - 1].g;
    expect(g.settles).toBeGreaterThanOrEqual(2);                                                   // stepped, both feet
    expect(g.moving).toBe(false);
    for (const f of g.feet) expect(Math.hypot(f.ax - f.side * RIG.ankle.x, f.az - RIG.ankle.z) + 0.25 * Math.abs(f.yaw)).toBeLessThan(0.13);
    expect(slide(frames, 0.5).worst).toBeLessThan(0.07);
  });
  it('standing still, the gait steps aside (the Idle clip shows, nothing is computed on the bones)', () => {
    const { frames } = walkRig(2, () => ({ v: 0 }));
    expect(frames[frames.length - 1].g.stand).toBe(0);
  });
  it('a body moved by a jump (teleport, a seat) starts again standing there', () => {
    const g = new GaitState();
    for (let i = 0; i < 60; i++) g.update(DT, 0, i * 1.4 * DT, 0, 1, 1.4);
    expect(g.moving).toBe(true);
    g.update(DT, 30, 30, 1, 1, 0);
    expect(g.moving).toBe(false); expect(g.feet.every(f => !f.swing)).toBe(true);
  });
  it('costs a few microseconds a body', () => {
    const { root, clips } = loadRig(); fixRunClip(clips);
    const g = new GaitState(), rig = GaitRig.from(root)!;
    let z = 0;
    for (let i = 0; i < 3000; i++) { z += 4.2 * DT; g.update(DT, 0, z, 0, 1, 4.2); rig.apply(g, 1); }       // warm up
    const t0 = performance.now();
    for (let i = 0; i < 6000; i++) { z += 4.2 * DT; g.update(DT, 0, z, 0, 1, 4.2); rig.apply(g, 1); }
    const us = ((performance.now() - t0) / 6000) * 1000;
    expect(us).toBeLessThan(60);                                                                    // ~5 µs on a desktop; generous for CI
  });
});
