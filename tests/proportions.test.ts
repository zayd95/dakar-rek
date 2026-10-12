import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { joinNeck } from '../src/actors/neckJoin';
import { PROPORTIONS, reshapeCharacter } from '../src/actors/proportions';

async function load() {
  const bytes = readFileSync(new URL('../public/assets/character_v4.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  return gltf.scene;
}
const meshes = (scene: THREE.Object3D, pick: (o: THREE.Object3D) => boolean) => { const out: THREE.Mesh[] = []; scene.traverse(o => { if ((o as THREE.Mesh).isMesh && pick(o)) out.push(o as THREE.Mesh); }); return out; };
const bbox = (ms: THREE.Mesh[]) => { const b = new THREE.Box3(); for (const m of ms) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox!); } return b; };

/** Head, body and the garment's collar, before and after, as the game prepares them (joinNeck then reshapeCharacter). */
async function measure(reshape: boolean) {
  const scene = await load();
  joinNeck(scene);
  if (reshape) expect(reshapeCharacter(scene)).toBeGreaterThan(1000);
  const head = meshes(scene, o => o.parent?.name === 'DR_Head' && o.name === 'Head001')[0];
  const body = meshes(scene, o => o.name === 'DR_Body')[0];
  const tee = meshes(scene, o => o.name === 'Cloth_Tee')[0];
  const hb = bbox([head]);
  const pos = body.geometry.getAttribute('position');
  let neckTop = -Infinity; for (let i = 0; i < pos.count; i++) neckTop = Math.max(neckTop, pos.getY(i));
  return { scene, head, hb, neckTop, teeTop: bbox([tee]).max.y, width: hb.max.x - hb.min.x, depth: hb.max.z - hb.min.z, height: hb.max.y - hb.min.y };
}

describe('reshapeCharacter: shorter neck, oval face', () => {
  it('lowers the head toward the shoulders: the neck from the collar to the chin is about halved', async () => {
    const a = await measure(false), b = await measure(true);
    const neckBefore = a.hb.min.y - a.teeTop + 0.0, neckAfter = b.hb.min.y - b.teeTop;
    // the bare neck is the gap between the garment's collar line (unmoved) and the chin
    expect(neckAfter).toBeLessThan(neckBefore - 0.06);
    expect(b.hb.max.y).toBeCloseTo(a.hb.max.y - PROPORTIONS.drop, 3);             // the crown came down by `drop`
    expect(b.hb.min.y).toBeCloseTo(a.hb.min.y - PROPORTIONS.drop - PROPORTIONS.jaw, 3); // the chin by drop + jaw
  });

  it('narrows the head and lengthens the face: less round', async () => {
    const a = await measure(false), b = await measure(true);
    expect(b.width).toBeLessThan(a.width * 0.97);
    expect(b.depth).toBeLessThan(a.depth);
    expect(b.height).toBeGreaterThan(a.height);
    expect(b.height / b.width).toBeGreaterThan(a.height / a.width * 1.1);          // taller than wide by more than before
  });

  it('keeps the head joined: the neck still ends inside the head, narrower than it, and nothing else of the body moved', async () => {
    const b = await measure(true), a = await measure(false);
    expect(b.neckTop).toBeGreaterThanOrEqual(b.hb.min.y + 0.03);                   // into the head, no gap
    const bodyB = meshes(b.scene, o => o.name === 'DR_Body')[0].geometry.getAttribute('position');
    const bodyA = meshes(a.scene, o => o.name === 'DR_Body')[0].geometry.getAttribute('position');
    for (let i = 0; i < bodyA.count; i++) if (bodyA.getY(i) <= PROPORTIONS.from) expect(bodyB.getY(i)).toBeCloseTo(bodyA.getY(i), 6);   // torso, shoulders, collar line
    // the head's own meshes (hair, kufi, headwrap, face details) moved with it: the kufi sits as much above the chin as before
    const kufi = (s: THREE.Object3D) => bbox(meshes(s, o => o.name === 'Cloth_Kufi')).max.y;
    expect(kufi(b.scene)).toBeCloseTo(kufi(a.scene) - PROPORTIONS.drop, 3);
    // garments weighted to the neck (collars) and the neck socket did not move
    const tee = (s: THREE.Object3D) => bbox(meshes(s, o => o.name === 'Cloth_Tee')).max.y;
    expect(tee(b.scene)).toBeCloseTo(tee(a.scene), 6);
  });

  it('is applied once by the game, after joinNeck', () => {
    const src = readFileSync(new URL('../src/actors/humanoid.ts', import.meta.url), 'utf8');
    expect(src.match(/reshapeCharacter\(/g)?.length).toBe(1);
    expect(src.indexOf('joinNeck(gltf')).toBeLessThan(src.indexOf('reshapeCharacter('));
  });
});
