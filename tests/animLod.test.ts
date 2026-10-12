import { afterAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { loadRig } from './rig';
import { loadHumanoid } from './perfHost';
import { ANIM_LOD, animLod, buildPoseClips, deriveKneel, fixRunClip, fixSitKnees, setAnimShadows, setHumanoidView, stripStaticTracks } from '../src/actors/humanoid';

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
  it('in view: everything up close, a slower mixer farther; out of view slower; hidden the slowest', () => {
    setHumanoidView(cam);
    expect(animLod(0, 0, -10, 1, true, false)).toBe(0);
    expect(animLod(2, 0, -ANIM_LOD.gaitNear + 1, 1, true, false)).toBe(0);
    expect(animLod(0, 0, -40, 1, true, false)).toBe(ANIM_LOD.mid);
    expect(animLod(0, 0, -90, 1, true, false)).toBe(ANIM_LOD.far);
    expect(animLod(0, 0, 10, 1, true, false)).toBe(ANIM_LOD.unseen);         // behind the camera
    expect(animLod(0, 0, -10, 1, false, false)).toBe(ANIM_LOD.hidden);       // hidden, or a far figure stands in for it
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
    expect(updates.mock.calls.length).toBeLessThanOrEqual(4);                  // about twice a second
    h.group.children[0].visible = true;
    updates.mockClear();
    run(h, 30, -1.3);
    expect(updates).toHaveBeenCalledTimes(30);
    expect(h.gaitInfo()).not.toBeNull();
  });
  it('an owner turning a bone over the clip after animate (the apprentice on the grab bar) starts from the clip every frame', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, 12);                                  // out of view: few mixer updates
    const arm = h.group.getObjectByName('upper_armR')!, prev = new THREE.Quaternion();
    let skipped = 0;
    for (let k = 0; k < 60; k++) {
      const n = updates.mock.calls.length;
      h.animate(1 / 60, 0); arm.rotateX(-2.4);
      const same = Math.max(...arm.quaternion.toArray().map((v, i) => Math.abs(v - prev.toArray()[i])));
      if (k > 0 && updates.mock.calls.length === n) { skipped++; expect(same).toBeLessThan(1e-9); }
      else if (k > 0) expect(arm.quaternion.angleTo(prev)).toBeLessThan(0.3);          // the Idle clip barely moves
      prev.copy(arm.quaternion);
    }
    expect(skipped).toBeGreaterThan(40);
  });
  it('hidden, the turns an owner adds over the clip are not undone every frame, but they are once it is drawn again', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, 12);
    const arm = h.group.getObjectByName('upper_armR')!;
    h.animate(1 / 60, 0); arm.rotateX(-2.4);
    const ref = arm.quaternion.clone();                                        // the clip's pose, turned once
    h.group.children[0].visible = false;
    for (let k = 0; k < 29; k++) { h.animate(1 / 60, 0); arm.rotateX(-2.4); }
    h.group.children[0].visible = true;
    expect(updates.mock.calls.length).toBeLessThan(5);                         // (hidden: hardly updated)
    h.animate(1 / 60, 0); arm.rotateX(-2.4);
    expect(arm.quaternion.angleTo(ref)).toBeLessThan(0.3);                     // back to the clip's pose, turned once
  });
  it('hidden, once the clip\'s pose is set the mixer is left alone; a new clip, or the body drawn again, wakes it with all the time owed', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, -8);
    h.group.children[0].visible = false;
    run(h, 90);                                                                // (a second and a half: well past the 0.3 s of a cross-fade)
    const first = updates.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(1);
    run(h, 120);                                                               // two seconds more, hidden: the pose holds
    expect(updates.mock.calls.length).toBe(first);
    h.play('Sit');                                                             // another clip: it is posed again
    run(h, 30);
    const posed = updates.mock.calls.length;
    expect(posed).toBeGreaterThan(first);
    run(h, 120);
    expect(updates.mock.calls.length).toBe(posed);
    updates.mockClear();
    h.group.children[0].visible = true;                                        // drawn again: updated at once, with everything it owes
    h.group.updateMatrixWorld();
    h.animate(1 / 60, 0);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(updates.mock.calls[0][0] as number).toBeGreaterThan(2);
  });
  it('without a shadow pass (the phone preset) a body out of the camera\'s view is a hidden one; with it, it is only unseen', () => {
    try {
      setHumanoidView(cam);
      setAnimShadows(false);
      expect(animLod(0, 0, 10, 1, true, false)).toBe(ANIM_LOD.hidden);         // behind the camera
      expect(animLod(0, 0, -10, 1, true, false)).toBe(0);                      // in view: as ever
      setAnimShadows(true);
      expect(animLod(0, 0, 10, 1, true, false)).toBe(ANIM_LOD.unseen);
    } finally { setAnimShadows(true); }
  });
  it('reset: a body used and put back is as a body just made (no clip, rest pose, no gait), whose look can be changed', async () => {
    setHumanoidView(cam);
    const used = await body(0, -8), fresh = await body(0, -8);
    used.h.play('Run'); run(used.h, 40, -3, 3);
    used.h.play('Sit'); run(used.h, 20);
    used.h.group.children[0].visible = false; run(used.h, 60);
    used.h.reset();
    used.h.group.position.set(0, 0.1, -8); used.h.group.updateMatrixWorld();
    expect(used.h.clipName).toBe(fresh.h.clipName);
    expect(used.h.gaitInfo()).toBeNull();
    const act = (h: unknown) => (h as { mixer: THREE.AnimationMixer & { _actions: THREE.AnimationAction[] } }).mixer._actions.filter(a => a.isRunning()).length;
    expect(act(used.h)).toBe(0);
    for (const x of [used.h, fresh.h]) { x.group.children[0].visible = true; x.play('Idle'); x.animate(0.1, 0); x.group.updateMatrixWorld(true); }
    for (const n of BONES) {
      const a = used.h.group.getObjectByName(n)!.matrixWorld.elements, b = fresh.h.group.getObjectByName(n)!.matrixWorld.elements;
      for (let i = 0; i < 16; i++) expect(Math.abs(a[i] - b[i]), `${n}[${i}]`).toBeLessThan(1e-5);
    }
  });
  it('a body another rig poses after the mixer (fullRate) gets every frame wherever it is', async () => {
    setHumanoidView(cam);
    const { h, updates } = await body(0, 30);
    h.fullRate = true;
    run(h, 30);
    expect(updates).toHaveBeenCalledTimes(30);
  });
});
