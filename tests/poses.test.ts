import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPoseClips, POSES, type PoseClip } from '../src/actors/humanoid';
import { seatPose, sitOriginY, SIT_HIPS, type Seat } from '../src/interact/seats';
import { loadRig, posed } from './rig';

/** Joint positions of a pose built from the shipped rig (character space: origin on the surface under the hips). */
function pose(name: PoseClip) {
  const { root, clips } = loadRig();
  const clip = buildPoseClips(root, clips).find(c => c.name === name)!;
  const p = posed(root, clip);
  const tip = (bone: string, len: number) => p.pos(bone).add(p.dir(bone).multiplyScalar(len));
  return { ...p, tip };
}
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

describe('procedural poses', () => {
  it('builds one clip per pose covering every animated track of the rig', () => {
    const { root, clips } = loadRig();
    const built = buildPoseClips(root, clips);
    expect(built.map(c => c.name)).toEqual(Object.keys(POSES));
    const idle = clips.find(c => c.name === 'Idle')!;
    for (const c of built) expect(c.tracks.map(t => t.name)).toEqual(idle.tracks.map(t => t.name));
    expect(idle.tracks.some(t => t.name.endsWith('.scale'))).toBe(true);   // the shipped clips carry scale tracks…
  });

  it('keeps every bone at its rest scale (no collapsed body)', () => {
    for (const name of Object.keys(POSES) as PoseClip[]) {
      const p = pose(name), root = p.mixer.getRoot() as THREE.Object3D;
      root.traverse(o => { if (o.name) expect(o.scale.toArray().map(v => +v.toFixed(3)), `${name} ${o.name}`).toEqual([1, 1, 1]); });
    }
  });

  for (const name of Object.keys(POSES) as PoseClip[]) {
    it(`${name}: nothing below the surface, bones keep their lengths`, () => {
      const p = pose(name);
      for (const j of JOINTS) expect(p.pos(j).y, `${name} ${j}`).toBeGreaterThan(0.03);
      for (const s of ['L', 'R']) expect(p.tip(`foot${s}`, 0.14).y, `${name} toes ${s}`).toBeGreaterThan(0.01);
      expect(p.pos('shinL').distanceTo(p.pos('thighL'))).toBeCloseTo(0.43, 2);
      expect(p.pos('footL').distanceTo(p.pos('shinL'))).toBeCloseTo(0.43, 2);
    });
  }

  it('Lie: on the back, hips on the mattress, head raised on the pillow towards −z, feet towards +z', () => {
    const p = pose('Lie');
    expect(p.pos('hips').y).toBeCloseTo(POSES.Lie.hipsY, 3);
    expect(p.dir('spine').z).toBeLessThan(-0.95);                       // body along −z
    const head = p.pos('head');
    expect(head.z).toBeLessThan(-0.55); expect(head.z).toBeGreaterThan(-0.9);
    expect(head.y).toBeGreaterThan(0.18); expect(head.y).toBeLessThan(0.32);   // on a 8–16 cm pillow, not floating
    for (const s of ['L', 'R']) { expect(p.pos(`foot${s}`).z).toBeGreaterThan(0.7); expect(p.pos(`foot${s}`).y).toBeLessThan(0.3); }
    // the chest faces the ceiling: the head's forward axis (+z at rest) points up
    const q = new THREE.Quaternion(); p.mixer.getRoot(); (p.mixer.getRoot() as THREE.Object3D).getObjectByName('head')!.getWorldQuaternion(q);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).y).toBeGreaterThan(0.85);
    // hands rest on the belly, inside the body's width
    for (const s of ['L', 'R']) { const h = p.pos(`hand${s}`); expect(Math.abs(h.x)).toBeLessThan(0.22); expect(h.y).toBeGreaterThan(0.15); }
  });

  it('SitFloor: cross-legged, knees out to the sides near the floor, back upright, hands on the knees', () => {
    const p = pose('SitFloor');
    expect(p.pos('hips').y).toBeCloseTo(POSES.SitFloor.hipsY, 3);
    for (const s of ['L', 'R']) {
      const knee = p.pos(`shin${s}`);
      expect(knee.y).toBeLessThan(0.2); expect(Math.abs(knee.x)).toBeGreaterThan(0.3); expect(knee.z).toBeGreaterThan(0.15);
      expect(p.pos(`hand${s}`).distanceTo(knee)).toBeLessThan(0.15);
    }
    expect(p.pos('shinL').x * p.pos('footL').x).toBeLessThan(0.01);   // each foot ends under the other leg
    expect(p.pos('head').y).toBeGreaterThan(0.75);
    // the shins cross at different heights (no interpenetration at the ankles)
    expect(Math.abs(p.pos('footL').y - p.pos('footR').y)).toBeGreaterThan(0.025);
  });

  it('SitKneel: knees on the floor in front, shins back along the floor, sitting on the heels', () => {
    const p = pose('SitKneel');
    for (const s of ['L', 'R']) { expect(p.pos(`shin${s}`).y).toBeLessThan(0.15); expect(p.pos(`shin${s}`).z).toBeGreaterThan(0.25); expect(p.pos(`foot${s}`).z).toBeLessThan(0.05); }
    expect(p.pos('hips').y).toBeGreaterThan(p.pos('footL').y + 0.15);
    expect(p.pos('head').y).toBeGreaterThan(0.95);
  });

  it('seats pick the pose and the body height from their kind', () => {
    const seat = (kind: Seat['kind'], top: number) => ({ kind, top });
    expect(seatPose(seat('chair', 0.45))).toBe('Sit'); expect(seatPose(seat('bench', 0.58))).toBe('Sit'); expect(seatPose(seat('vehicle', 1))).toBe('Sit');
    expect(seatPose(seat('bed', 0.58))).toBe('Lie'); expect(seatPose(seat('mat', 0.01))).toBe('SitFloor'); expect(seatPose(seat('floor', 0.08))).toBe('SitFloor');
    expect(sitOriginY(seat('chair', 0.45))).toBeCloseTo(0.45 - SIT_HIPS);
    // lying and floor poses stand their origin on the surface: nobody sinks into the mattress or the floor
    expect(sitOriginY(seat('bed', 0.58))).toBeCloseTo(0.58);
    expect(sitOriginY(seat('mat', 0.01))).toBeCloseTo(0.01);
  });
});
