import { afterAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { loadRig } from './rig';
import { loadHumanoid } from './perfHost';
import { ANIM_LOD, animLod, buildPoseClips, deriveKneel, fixRunClip, fixSitKnees, setHumanoidView, stripStaticTracks } from '../src/actors/humanoid';

/** The clips as preloadHumanoid makes them (fixes, Kneel, the poses built in code), on their own copy of the rig. */
function gameClips() {
  const { root, clips } = loadRig();
  fixSitKnees(clips); fixRunClip(clips); deriveKneel(clips);
  return { root, clips: [...clips, ...buildPoseClips(root, clips)] };
}
const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upper_armL', 'forearmL', 'handL', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'handR'];

describe('the clips without their static tracks', () => {
  it('drops only position and scale tracks that hold the rest value in every clip, never a rotation, never the hips or the root', () => {
    const { root, clips } = gameClips();
    const before = new Map(clips.map(c => [c.name, c.tracks.map(t => t.name)]));
    const dropped = stripStaticTracks(root, clips);
    expect(dropped).toBeGreaterThan(30 * clips.length);                        // most of the 60 tracks of each clip
    for (const c of clips) {
      const kept = new Set(c.tracks.map(t => t.name));
      for (const name of before.get(c.name)!) {
        if (name.endsWith('.quaternion')) expect(kept.has(name), name).toBe(true);
        if (name === 'hips.position' || name === 'root.position') expect(kept.has(name), name).toBe(true);
      }
      expect(c.tracks.every(t => t.name.endsWith('.quaternion') || t.name === 'hips.position' || t.name === 'root.position')).toBe(true);
    }
  });

  it('every clip poses every bone exactly as before, alone and in a cross-fade', () => {
    const a = gameClips(), b = gameClips();
    stripStaticTracks(b.root, b.clips);
    const ma = new THREE.AnimationMixer(a.root), mb = new THREE.AnimationMixer(b.root);
    const pairs: [string, string][] = [['Idle', 'Idle'], ['Walk', 'Walk'], ['Run', 'Run'], ['Sit', 'Sit'], ['Kneel', 'Kneel'], ['Lie', 'Lie'], ['Ride', 'Ride'], ['Dance_A', 'Dance_A'], ['Idle', 'Sit'], ['Walk', 'Kneel']];
    for (const [from, to] of pairs) {
      for (const [m, set] of [[ma, a], [mb, b]] as const) {
        m.stopAllAction();
        const x = m.clipAction(set.clips.find(c => c.name === from)!), y = m.clipAction(set.clips.find(c => c.name === to)!);
        x.reset().play();
        if (from !== to) { m.update(0.4); y.reset().play(); x.crossFadeTo(y, 0.5, false); }
        m.update(0.37);
        set.root.updateMatrixWorld(true);
      }
      for (const n of BONES) {
        const pa = a.root.getObjectByName(n)!.matrixWorld.elements, pb = b.root.getObjectByName(n)!.matrixWorld.elements;
        for (let i = 0; i < 16; i++) expect(Math.abs(pa[i] - pb[i]), `${from}→${to} ${n}[${i}]`).toBeLessThan(1e-5);
      }
    }
  });
});

describe('the animation level of detail', () => {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.3, 700);
  cam.position.set(0, 1.7, 0); cam.lookAt(0, 1.7, -10); cam.updateMatrixWorld();
  afterAll(() => setHumanoidView(null));

  it('without a camera every body gets everything every frame', () => {
    setHumanoidView(null);
    expect(animLod(0, 0, 200, 1, false, false)).toBe(0);
  });
  it('in view: everything up close, a slower mixer farther; out of view or hidden: the slowest', () => {
    setHumanoidView(cam);
    expect(animLod(0, 0, -10, 1, true, false)).toBe(0);
    expect(animLod(2, 0, -ANIM_LOD.gaitNear + 1, 1, true, false)).toBe(0);
    expect(animLod(0, 0, -40, 1, true, false)).toBe(ANIM_LOD.mid);
    expect(animLod(0, 0, -90, 1, true, false)).toBe(ANIM_LOD.far);
    expect(animLod(0, 0, 10, 1, true, false)).toBe(ANIM_LOD.unseen);         // behind the camera
    expect(animLod(0, 0, -10, 1, false, false)).toBe(ANIM_LOD.unseen);       // hidden, or a far figure stands in for it
    // a body just out of the gait's reach keeps it a little longer (no flicker at the edge)
    const edge = -(ANIM_LOD.gaitNear + ANIM_LOD.gaitSlack / 2);
    expect(animLod(0, 0, edge, 1, true, true)).toBe(0);
    expect(animLod(0, 0, edge, 1, true, false)).toBe(ANIM_LOD.mid);
    // a body whose feet are just out of the frame still counts as seen (its sphere)
    expect(animLod(0, 0, 0.6, 1, true, false)).toBe(0);
  });
});

describe('a humanoid under the level of detail', () => {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.3, 700);
  cam.position.set(0, 1.7, 0); cam.lookAt(0, 1.7, -10); cam.updateMatrixWorld();
  afterAll(() => setHumanoidView(null));
  const body = async (x: number, z: number) => {
    await loadHumanoid();
    const { Humanoid } = await import('../src/actors/humanoid');
    const h = new Humanoid({ skin: 0x4e2e1c, style: 'tee', top: 0x2f8f4e });
    h.group.position.set(x, 0.1, z); h.group.updateMatrixWorld();
    const updates = vi.spyOn((h as unknown as { mixer: THREE.AnimationMixer }).mixer, 'update');
    return { h, updates };
  };
  const run = (h: { group: THREE.Object3D; animate(dt: number, s: number): void }, frames: number, vz = 0, speed = 0) => {
    for (let k = 0; k < frames; k++) { h.group.position.z += vz / 60; h.group.updateMatrixWorld(); h.animate(1 / 60, speed); }
  };

  it('near and in view: the mixer every frame and the computed gait', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, -8);
    run(h, 60, -1.3);
    expect(updates).toHaveBeenCalledTimes(60);
    expect(h.gaitInfo()?.moving).toBe(true);
  });
  it('out of view: about five mixer updates a second, the time kept; the walk from its own motion', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, 12);                                  // behind the camera, walking away
    run(h, 60, 1.3);                                                           // the caller gives no speed
    expect(updates.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(updates.mock.calls.length).toBeLessThanOrEqual(7);
    const owed = updates.mock.calls.reduce((t, c) => t + (c[0] as number), 0);
    expect(owed).toBeGreaterThan(0.75); expect(owed).toBeLessThanOrEqual(1 + 1e-9);   // the mixer's clock keeps up
    expect(h.clipName).toBe('Walk');
    expect(h.gaitInfo()).toBeNull();                                           // no gait out of view
  });
  it('a hidden body (its owner, or the shared budget\'s far figure) is updated slowly too; back in view it gets everything', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, -8);
    h.group.children[0].visible = false;                                       // a far figure stands in for it
    run(h, 60);
    expect(updates.mock.calls.length).toBeLessThanOrEqual(7);
    h.group.children[0].visible = true;
    updates.mockClear();
    run(h, 30, -1.3);
    expect(updates).toHaveBeenCalledTimes(30);
    expect(h.gaitInfo()).not.toBeNull();
  });
  it('a body another rig poses after the mixer (fullRate) gets every frame wherever it is', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, 30);
    h.fullRate = true;
    run(h, 30);
    expect(updates).toHaveBeenCalledTimes(30);
  });
});
