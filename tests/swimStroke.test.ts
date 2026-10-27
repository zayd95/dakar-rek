import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPoseClips, handClosure } from '../src/actors/humanoid';
import {
  CLIMB_HANDS, STROKE_FRAMES, STROKE_KEYS, SWIM_POSES, SWIM_WATERLINE, TREAD_FRAMES, TREAD_KEYS, assembleSwimClips, periodicSpline, poseAt, strokeSurge,
} from '../src/actors/swimStroke';
import { POOL } from '../src/housing/villa';
import { loadRig } from './rig';

/**
 * LD2.0-D round 2, lane R2-W: the swim's clips on the shipped rig (src/actors/swimStroke.ts): a breaststroke and treading water as looping clips of
 * solved poses, the climb out. Character space: the water line SWIM_WATERLINE above the origin; the pool's floor POOL.depth − 0.12 under the water.
 */
const FLOOR = SWIM_WATERLINE - (POOL.depth - 0.12);
/** The swim's clips built on the rig (`body`: the Meshy bodies' path, which also turns the palms), and a way to read joints at a time of one. */
function rig(body?: { scale: number }) {
  const { root, clips } = loadRig();
  const built = assembleSwimClips(buildPoseClips(root, clips, body, SWIM_POSES));
  const at = (name: string, t: number) => {
    const mixer = new THREE.AnimationMixer(root); mixer.clipAction(built.find(c => c.name === name)!).play(); mixer.setTime(t); root.updateMatrixWorld(true);
    // a snapshot of every bone (the mixer puts the bones back at rest once stopped)
    const P = new Map<string, THREE.Vector3>(), D = new Map<string, THREE.Vector3>();
    root.traverse(o => { if (!o.name) return; P.set(o.name, o.getWorldPosition(new THREE.Vector3())); D.set(o.name, new THREE.Vector3(0, 1, 0).transformDirection(o.matrixWorld)); });
    const face = new THREE.Vector3(0, 0, 1).transformDirection(root.getObjectByName('head')!.matrixWorld);
    mixer.stopAllAction(); mixer.uncacheRoot(root);
    const pos = (n: string) => P.get(n)!.clone(), dir = (n: string) => D.get(n)!.clone();
    const tip = (n: string, len: number) => pos(n).add(dir(n).multiplyScalar(len));
    const eyes = pos('head').add(dir('head').multiplyScalar(0.09)).add(face.multiplyScalar(0.08));
    return { pos, dir, tip, eyes };
  };
  return { root, clips, built, at };
}
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

describe('the swim\'s clips', () => {
  const v4 = rig(), meshy = rig({ scale: 0.93 });

  it('are the stroke and treading as looping clips of many solved poses, from several keys a cycle, and the climb', () => {
    expect(STROKE_KEYS.length).toBeGreaterThanOrEqual(4); expect(TREAD_KEYS.length).toBeGreaterThanOrEqual(4);
    for (const keys of [STROKE_KEYS, TREAD_KEYS]) {
      const bones = Object.keys(keys[0].aim).sort();
      for (const k of keys) { expect(Object.keys(k.aim).sort()).toEqual(bones); expect(Object.keys(k.palm ?? {}).sort()).toEqual(Object.keys(keys[0].palm ?? {}).sort()); }
      for (let i = 1; i < keys.length; i++) expect(keys[i].at).toBeGreaterThan(keys[i - 1].at);
      expect(keys[0].at).toBe(0); expect(keys[keys.length - 1].at).toBeLessThan(1);
    }
    const idle = v4.clips.find(c => c.name === 'Idle')!;
    for (const b of [v4, meshy]) {
      expect(b.built.map(c => c.name)).toEqual(['Swim', 'Tread', 'SwimClimb']);
      for (const [name, n] of [['Swim', STROKE_FRAMES], ['Tread', TREAD_FRAMES]] as const) {
        const c = b.built.find(x => x.name === name)!;
        expect(c.duration).toBe(1);
        expect(c.tracks.map(t => t.name)).toEqual(idle.tracks.map(t => t.name));          // every track of the rig: the cross-fades cover every bone
        for (const t of c.tracks) {
          expect(t.times.length).toBe(n + 1);
          const s = t.getValueSize(), v = t.values;
          for (let i = 0; i < s; i++) expect(v[n * s + i]).toBeCloseTo(v[i], 6);            // a seamless loop: the last pose is the first
        }
      }
    }
    expect(STROKE_FRAMES).toBeGreaterThanOrEqual(16); expect(TREAD_FRAMES).toBeGreaterThanOrEqual(12);
  });

  it('passes through its keys (the spline), every aim a unit vector', () => {
    for (const keys of [STROKE_KEYS, TREAD_KEYS]) for (const k of keys) {
      const p = poseAt(keys, k.at);
      expect(p.hipsY).toBeCloseTo(k.hipsY, 6); expect(p.hips[0]).toBeCloseTo(k.pitch, 6);
      for (const [b, v] of Object.entries(k.aim)) { const u = new THREE.Vector3(...v).normalize(); expect(new THREE.Vector3(...p.aim[b]).distanceTo(u), b).toBeLessThan(1e-6); }
    }
    expect(periodicSpline([0, 0.5], [1, 3], 0.25)).toBeGreaterThan(1); expect(periodicSpline([0, 0.5], [1, 3], 1)).toBeCloseTo(1, 6);
  });

  for (const [who, b] of [['v4', v4], ['a Meshy body', meshy]] as const) {
    it(`swimming (${who}): level at the surface face down, the head up and out, limbs in the water, bones whole, smooth`, () => {
      let last: Map<string, THREE.Vector3> | null = null;
      for (let i = 0; i <= 96; i++) {
        const t = i / 96, p = b.at('Swim', t);
        const trunk = p.pos('neck').sub(p.pos('hips')), pitch = Math.atan2(trunk.y, Math.hypot(trunk.x, trunk.z));
        expect(Math.abs(pitch), `trunk at ${t}`).toBeLessThan(0.36);                       // near level (under 20°)
        expect(trunk.z).toBeGreaterThan(0.5);                                                // heading +z
        expect(p.pos('upper_armL').y, `shoulders at ${t}`).toBeGreaterThan(SWIM_WATERLINE - 0.12); expect(p.pos('upper_armL').y).toBeLessThan(SWIM_WATERLINE + 0.05);
        expect(p.eyes.y, `eyes at ${t}`).toBeGreaterThan(SWIM_WATERLINE); expect(p.tip('head', 0.2).y).toBeGreaterThan(SWIM_WATERLINE + 0.1);
        for (const j of ['handL', 'handR', 'footL', 'footR', 'shinL', 'shinR']) { expect(p.pos(j).y, `${j} at ${t}`).toBeLessThan(SWIM_WATERLINE); expect(p.pos(j).y).toBeGreaterThan(FLOOR + 0.3); }
        expect(p.pos('shinL').distanceTo(p.pos('thighL'))).toBeCloseTo(0.43, 2); expect(p.pos('footL').distanceTo(p.pos('shinL'))).toBeCloseTo(0.43, 2);
        // a 96th of a cycle (about 12 ms at the stroke's pace) moves no joint more than a few centimetres: no snap
        const now = new Map(JOINTS.map(j => [j, p.pos(j)]));
        if (last) for (const j of JOINTS) expect(now.get(j)!.distanceTo(last.get(j)!), `${j} at ${t}`).toBeLessThan(0.06);
        last = now;
      }
      // the stroke's shape: arms out in front in the glide, swept wide, the hands meeting under the chin; the feet wide in the kick
      const glide = b.at('Swim', 0), out = b.at('Swim', 0.2), chin = b.at('Swim', 0.58), kick = b.at('Swim', 0.74);
      expect(glide.pos('handL').z).toBeGreaterThan(glide.pos('head').z + 0.3); expect(Math.abs(glide.pos('footL').x - glide.pos('footR').x)).toBeLessThan(0.4);
      expect(out.pos('handL').x - out.pos('handR').x).toBeGreaterThan(0.9);
      expect(chin.pos('handL').distanceTo(chin.pos('handR'))).toBeLessThan(0.25); expect(chin.pos('footL').y).toBeGreaterThan(chin.pos('shinL').y);   // the heels drawn up
      expect(kick.pos('footL').x - kick.pos('footR').x).toBeGreaterThan(0.8);
    });

    it(`treading (${who}): upright, the head and shoulders out, the feet off the pool's floor, the hands sculling under the surface`, () => {
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, p = b.at('Tread', t);
        const trunk = p.pos('neck').sub(p.pos('hips'));
        expect(Math.atan2(trunk.y, Math.hypot(trunk.x, trunk.z)), `trunk at ${t}`).toBeGreaterThan(1.2);   // upright (over 70°)
        expect(p.pos('upper_armL').y, `shoulders at ${t}`).toBeGreaterThan(SWIM_WATERLINE); expect(p.pos('upper_armL').y).toBeLessThan(SWIM_WATERLINE + 0.15);
        expect(p.pos('chest').y).toBeLessThan(SWIM_WATERLINE);
        for (const s of ['L', 'R']) {
          expect(p.tip(`foot${s}`, 0.14).y, `toes ${s} at ${t}`).toBeGreaterThan(FLOOR);
          expect(p.pos(`hand${s}`).y, `hand ${s} at ${t}`).toBeLessThan(SWIM_WATERLINE - 0.1);
        }
      }
      const out = b.at('Tread', 0.25), inn = b.at('Tread', 0.75), l = b.at('Tread', 0), r = b.at('Tread', 0.5);
      expect(out.pos('handL').x - out.pos('handR').x).toBeGreaterThan(inn.pos('handL').x - inn.pos('handR').x + 0.4);   // out wide, then in
      expect(l.pos('shinL').y).toBeGreaterThan(l.pos('shinR').y + 0.1); expect(r.pos('shinR').y).toBeGreaterThan(r.pos('shinL').y + 0.1);   // the knees in turn
    });
  }

  it('climbs out with the hands flat on the coping, ahead of the body, a knee coming up', () => {
    const p = v4.at('SwimClimb', 0);
    for (const s of ['L', 'R']) { const h = p.tip(`hand${s}`, 0.08); expect(h.y).toBeCloseTo(CLIMB_HANDS.y, 1); expect(h.z).toBeCloseTo(CLIMB_HANDS.z, 1); }
    expect(p.pos('shinL').y).toBeGreaterThan(p.pos('shinR').y + 0.25);
    expect(p.tip('head', 0.2).y).toBeGreaterThan(1.7);
  });

  it('surges after the kick and on the pull, a mean of one over the stroke; open hands', () => {
    let sum = 0; for (let i = 0; i < 400; i++) sum += strokeSurge(i / 400);
    expect(sum / 400).toBeCloseTo(1, 2);
    expect(strokeSurge(0.83)).toBeGreaterThan(1.3); expect(strokeSurge(0.6)).toBeLessThan(0.85); expect(strokeSurge(0.33)).toBeGreaterThan(strokeSurge(0.6));
    expect(handClosure('Swim')).toBeLessThan(0.15); expect(handClosure('Tread')).toBeLessThan(0.15);
  });
});
