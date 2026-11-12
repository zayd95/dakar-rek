import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadHumanoid } from './perfHost';
import { FACE_NEAR, FACE_SLACK, Humanoid, randomLook, setHumanoidView } from '../src/actors/humanoid';
import { rng } from '../src/core/rng';

/**
 * A body far from the camera puts its face's details away (eyes, brows, lips: four of its ten draw calls, a pixel or two
 * tall at 14 m): docs/PERF_EVENING.md « Headroom ». The head stays; bodies close by, and those animated at every frame
 * whatever the distance (the player's), keep them.
 */
const cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 700);
cam.position.set(0, 1.7, 0); cam.lookAt(0, 1.7, -100); cam.updateMatrixWorld();

/** The draw calls of a body's meshes now (one per visible mesh under visible parents: its materials are single). */
function calls(h: Humanoid) {
  let n = 0;
  h.group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
    n++;
  });
  return n;
}
/** A body standing `d` m in front of the camera, animated once. */
function standAt(h: Humanoid, d: number) {
  h.group.position.set(0, 0, -d); h.group.updateMatrixWorld(true);
  h.animate(0.1, 0);
}

describe('the face of a far body', () => {
  afterAll(() => setHumanoidView(null));

  it('four meshes of the face are its details, and a body shows them at first', async () => {
    await loadHumanoid();
    const h = new Humanoid(randomLook(rng(3)));
    expect(h.faceShown()).toBe(true);
    const full = calls(h);
    expect(full).toBeGreaterThanOrEqual(9); expect(full).toBeLessThanOrEqual(11);       // about ten draw calls
    h.dispose();
  });

  it('beyond FACE_NEAR the body costs four calls less, nearer again the details come back (with a little slack)', async () => {
    await loadHumanoid();
    setHumanoidView(cam);
    const h = new Humanoid(randomLook(rng(3)));
    const full = calls(h);
    standAt(h, FACE_NEAR - 2); expect(h.faceShown()).toBe(true); expect(calls(h)).toBe(full);
    standAt(h, FACE_NEAR + 0.5); expect(h.faceShown()).toBe(true);                       // (just past: the slack keeps them, no flicker at the edge)
    standAt(h, FACE_NEAR + FACE_SLACK + 0.5); expect(h.faceShown()).toBe(false); expect(calls(h)).toBe(full - 4);
    standAt(h, FACE_NEAR + 0.5); expect(h.faceShown()).toBe(false);                      // (still away until it is really near again)
    standAt(h, FACE_NEAR - 0.5); expect(h.faceShown()).toBe(true); expect(calls(h)).toBe(full);
    h.dispose();
  });

  it('the head itself and the rest of the body stay when the details go', async () => {
    await loadHumanoid();
    setHumanoidView(cam);
    const h = new Humanoid(randomLook(rng(4)));
    standAt(h, 30);
    const names: string[] = [];
    h.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && calls1(m)) names.push(m.name); });
    expect(names).toContain('Head001'); expect(names).toContain('DR_Body');
    expect(names.filter(n => /^Head001_\d+$/.test(n))).toEqual([]);
    h.dispose();
    function calls1(m: THREE.Object3D) { for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return false; return true; }
  });

  it('a body animated at every frame (the player’s own) and a body out of view keep their details; so does any body without a camera', async () => {
    await loadHumanoid();
    setHumanoidView(cam);
    const mine = new Humanoid(randomLook(rng(5)));
    (mine as { fullRate?: boolean }).fullRate = true;
    standAt(mine, 40); expect(mine.faceShown()).toBe(true);
    const behind = new Humanoid(randomLook(rng(6)));
    behind.group.position.set(0, 0, 40); behind.group.updateMatrixWorld(true); behind.animate(0.1, 0);   // behind the camera: not looked at, left as it is
    expect(behind.faceShown()).toBe(true);
    setHumanoidView(null);
    const nocam = new Humanoid(randomLook(rng(7)));
    standAt(nocam, 60); expect(nocam.faceShown()).toBe(true);
    for (const h of [mine, behind, nocam]) h.dispose();
  });
});
