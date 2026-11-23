import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { warpHead } from '../src/actors/proportions';
import { buildPoseClips } from '../src/actors/humanoid';
import { PRAYER_POSES, deriveSalam, groundGuard, type PosedBody } from '../src/actors/prayerPoses';
import { loadRig } from './rig';

/**
 * The shipped v4 body's skin (body, head, kufi) as the prayer checks see it: every vertex carried rigidly by the bone
 * that weighs most on it (the head reshaped as the game does at load, src/actors/proportions.ts), so a posture's
 * contacts with the floor and its width can be measured on the mesh, not only on the joints.
 */
export function skin(meshes: RegExp = /^(DR_Body|DR_Head|Cloth_Kufi)/) {
  const glb = new Uint8Array(readFileSync(new URL('../public/assets/character_v4.glb', import.meta.url)));
  const dv = new DataView(glb.buffer), jsonLength = dv.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))), bin = 20 + jsonLength + 8;
  const read = (index: number) => {
    const acc = gltf.accessors[index], view = gltf.bufferViews[acc.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type as 'VEC3'], ct = acc.componentType, bytes = ct === 5126 ? 4 : ct === 5123 ? 2 : 1;
    const start = bin + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0), out: number[] = [];
    for (let i = 0; i < acc.count * size; i++) {
      const o = start + i * bytes;
      let v = ct === 5126 ? dv.getFloat32(o, true) : ct === 5123 ? dv.getUint16(o, true) : dv.getUint8(o);
      if (acc.normalized) v /= ct === 5123 ? 65535 : 255;
      out.push(v);
    }
    return out;
  };
  const byBone = new Map<string, THREE.Vector3[]>();
  gltf.nodes.forEach((n: { name?: string; mesh?: number; skin?: number }) => {
    if (n.mesh === undefined || n.skin === undefined || !meshes.test(n.name ?? '')) return;
    const joints: string[] = gltf.skins[n.skin].joints.map((j: number) => THREE.PropertyBinding.sanitizeNodeName(gltf.nodes[j].name));
    for (const prim of gltf.meshes[n.mesh].primitives) {
      const P = read(prim.attributes.POSITION), J = read(prim.attributes.JOINTS_0), W = read(prim.attributes.WEIGHTS_0);
      for (let i = 0; i < P.length / 3; i++) {
        let b = 0; for (let c = 1; c < 4; c++) if (W[i * 4 + c] > W[i * 4 + b]) b = c;
        const bone = joints[J[i * 4 + b]], v = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        if (bone === 'head') warpHead(v);
        (byBone.get(bone) ?? byBone.set(bone, []).get(bone)!).push(v);
      }
    }
  });
  return byBone;
}

/** The rig, the prayer clips built from it, and a mixer to pose it (one posture, or a cross-fade between two). */
export function prayerRig() {
  const built = loadRig(), clips = buildPoseClips(built.root, built.clips, undefined, PRAYER_POSES);
  deriveSalam(clips);
  const { root } = loadRig(); root.updateMatrixWorld(true);
  const verts = skin(), restInv = new Map<string, THREE.Matrix4>();
  for (const name of verts.keys()) { const b = root.getObjectByName(name); if (b) restInv.set(name, b.matrixWorld.clone().invert()); }
  const mixer = new THREE.AnimationMixer(root);
  const body: PosedBody = { group: root, bone: n => root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n)) ?? null };
  const clip = (name: string) => { const c = clips.find(x => x.name === name); if (!c) throw new Error(name); return c; };
  /** Poses the rig `w` of the way from `a` to `b` (the mixer's cross-fade), with or without the floor guard. */
  const pose = (a: string, b = a, w = 1, guard = false) => {
    mixer.stopAllAction();
    const A = mixer.clipAction(clip(a)), B = mixer.clipAction(clip(b));
    A.reset().play(); A.setEffectiveWeight(a === b ? 1 : 1 - w);
    if (b !== a) { B.reset().play(); B.setEffectiveWeight(w); }
    mixer.update(0); root.updateMatrixWorld(true);
    if (guard) groundGuard(body);
    root.updateMatrixWorld(true);
  };
  const m = new THREE.Matrix4();
  /** The posed skin, bone by bone. */
  const mesh = () => {
    const out = new Map<string, THREE.Vector3[]>();
    for (const [name, list] of verts) { const b = root.getObjectByName(name)!; m.copy(b.matrixWorld).multiply(restInv.get(name)!); out.set(name, list.map(v => v.clone().applyMatrix4(m))); }
    return out;
  };
  const joint = (name: string) => root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  const axis = (name: string, local: THREE.Vector3) => local.clone().transformDirection(root.getObjectByName(name)!.matrixWorld);
  return { root, clips, pose, mesh, joint, axis, body };
}

/** Lowest and extreme coordinates of a set of posed vertex lists. */
export function extent(parts: Iterable<THREE.Vector3[]>) {
  const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const list of parts) for (const v of list) {
    e.x0 = Math.min(e.x0, v.x); e.x1 = Math.max(e.x1, v.x); e.y0 = Math.min(e.y0, v.y); e.y1 = Math.max(e.y1, v.y); e.z0 = Math.min(e.z0, v.z); e.z1 = Math.max(e.z1, v.z);
  }
  return e;
}
