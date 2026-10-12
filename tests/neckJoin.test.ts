import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { joinNeck } from '../src/actors/neckJoin';

/** The shipped humanoid, parsed in node (the GLB has no textures), as preloadHumanoid parses it. */
async function load() {
  const bytes = readFileSync(new URL('../public/assets/character_v4.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  return gltf.scene;
}
/** The meshes named `name`, or (`parent`) the meshes under the node named `name` (a multi-part glTF mesh: DR_Head). */
const mesh = (scene: THREE.Object3D, name: string, parent = false) => {
  const out: THREE.Mesh[] = []; scene.traverse(o => { if ((o as THREE.Mesh).isMesh && (parent ? o.parent?.name === name : o.name === name)) out.push(o as THREE.Mesh); }); return out;
};
const ys = (m: THREE.Mesh) => { const p = m.geometry.getAttribute('position'); return Array.from({ length: p.count }, (_, i) => p.getY(i)); };

describe('joinNeck: the head joined to the body', () => {
  it('carries the neck up into the head, hidden inside it, and moves nothing else', async () => {
    const scene = await load();
    const body = mesh(scene, 'DR_Body')[0], heads = mesh(scene, 'DR_Head', true);
    const head = heads.reduce((a, b) => (a.geometry.getAttribute('position').count > b.geometry.getAttribute('position').count ? a : b));
    const before = Float32Array.from(body.geometry.getAttribute('position').array as Float32Array);
    const neckTop0 = Math.max(...ys(body)), headBottom = Math.min(...ys(head));
    expect(neckTop0).toBeLessThan(headBottom);                       // the gap the fix closes (1.661 under 1.673)

    const moved = joinNeck(scene);
    expect(moved).toBeGreaterThan(4);
    const pos = body.geometry.getAttribute('position'), neckTop = Math.max(...ys(body));
    expect(neckTop).toBeGreaterThanOrEqual(headBottom + 0.03);        // into the head, not under it

    // at the neck's new top, the neck is narrower than the head around the same axis: inside it, not through its skin
    const hp = head.geometry.getAttribute('position'), band = (y: number) => [y - 0.012, y + 0.012];
    const [lo, hi] = band(neckTop - 0.005);
    const ring = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, test: (i: number) => boolean) => {
      const pts: [number, number][] = []; for (let i = 0; i < p.count; i++) if (test(i)) pts.push([p.getX(i), p.getZ(i)]);
      return pts;
    };
    const neckPts = ring(pos, i => pos.getY(i) >= lo && pos.getY(i) <= hi), headPts = ring(hp, i => hp.getY(i) >= lo && hp.getY(i) <= hi);
    expect(neckPts.length).toBeGreaterThan(0); expect(headPts.length).toBeGreaterThan(0);
    const cx = neckPts.reduce((t, p) => t + p[0], 0) / neckPts.length, cz = neckPts.reduce((t, p) => t + p[1], 0) / neckPts.length;
    const r = (pts: [number, number][]) => Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cz)));
    expect(r(neckPts)).toBeLessThan(r(headPts));

    // only the neck's upper vertices moved; the rest of the body is as shipped
    let changed = 0;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i) - before[i * 3]) + Math.abs(pos.getY(i) - before[i * 3 + 1]) + Math.abs(pos.getZ(i) - before[i * 3 + 2]) > 1e-7) changed++;
    expect(changed).toBe(moved);
    for (let i = 0; i < pos.count; i++) if (before[i * 3 + 1] <= 1.62) expect(pos.getY(i)).toBeCloseTo(before[i * 3 + 1], 6);
  });

  it('is applied once by the game (a second call on a fixed scene would lift again: the template is fixed at load only)', async () => {
    const src = readFileSync(new URL('../src/actors/humanoid.ts', import.meta.url)).toString('utf8');
    expect(src.match(/joinNeck\(/g)?.length).toBe(1);
  });
});
