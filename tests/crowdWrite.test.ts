import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Crowd, type CrowdSlot } from '../src/crowd/crowd';

/**
 * The crowd writes its instanced figures in place between layout changes (src/crowd/crowd.ts): the members who moved
 * get their matrix, those easing into a pose their pose attributes. Whatever the frame, the instanced meshes must hold
 * exactly what a full write would put there.
 */
type Inner = { write(): void; layoutDirty: boolean };
const meshes = (c: Crowd) => c.group.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh && o.name.startsWith('crowd_') && o.name !== 'crowd_flags');
/** What the instanced meshes draw: per mesh, its count, then each drawn instance's matrix and pose attributes. */
function drawn(c: Crowd) {
  return meshes(c).map(m => {
    const out: number[] = [m.count];
    const g = m.geometry as THREE.BufferGeometry, n = m.count;
    out.push(...Array.from((m.instanceMatrix.array as Float32Array).slice(0, n * 16)));
    for (const k of ['iArm', 'iOsc', 'iMove', 'iLook']) { const a = g.getAttribute(k) as THREE.InstancedBufferAttribute | undefined; if (a) out.push(...Array.from((a.array as Float32Array).slice(0, n * a.itemSize))); }
    return { name: m.name, out };
  });
}

describe('the crowd written in place', () => {
  const slots = (): CrowdSlot[] => {
    const out: CrowdSlot[] = [];
    for (let i = 0; i < 60; i++) out.push({ id: `s${i}`, x: (i % 10) * 1.2, y: 0.4, z: 8 + Math.floor(i / 10) * 1.5, yaw: Math.PI, seated: i % 3 !== 0, tags: [i % 2 ? 'left' : 'right'] });
    for (let i = 0; i < 12; i++) out.push({ id: `w${i}`, x: -6 + i, y: 0, z: 40 + i * 3, yaw: 0, seated: false });   // walkers, some far
    return out;
  };
  it('draws what a full write would, frame after frame, while people move, react and settle', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.3, 500); cam.position.set(5, 3, -4); cam.lookAt(5, 0, 20); cam.updateMatrixWorld();
    const a = new Crowd(slots(), { quality: 'low', seed: 3, blobs: true }), b = new Crowd(slots(), { quality: 'low', seed: 3, blobs: true });
    for (const c of [a, b]) { c.fill(60); for (let i = 0; i < 12; i++) c.setPresent(`w${i}`, true); c.setCamera(cam); }
    let inPlace = 0;
    for (let f = 0; f < 240; f++) {
      if (f === 20) for (const c of [a, b]) c.react('left', 'applause', { share: 0.8, seconds: 2 });
      if (f === 90) for (const c of [a, b]) c.react('all', 'fall', { share: 0.7, seconds: 1.5 });
      for (const c of [a, b]) for (let i = 0; i < 12; i++) c.move(`w${i}`, -6 + i + Math.sin(f * 0.05 + i) * 2, 0, 40 + i * 3 - f * 0.12, 0.3, 1.3);
      // a: a full write every frame; b: the crowd's own (in place unless the layout changed)
      (a as unknown as Inner).layoutDirty = true;
      if (!(b as unknown as Inner).layoutDirty) inPlace++;
      a.update(1 / 30); b.update(1 / 30);
      expect(drawn(b)).toEqual(drawn(a));
    }
    expect(inPlace).toBeGreaterThan(150);                                      // most frames were written in place
  });
});
