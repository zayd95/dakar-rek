import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Humanoid } from '../src/actors/humanoid';

const bytes = readFileSync(new URL('../public/assets/reference_character.glb', import.meta.url));
let gltf: GLTF, mesh: THREE.SkinnedMesh;
beforeAll(async () => {
  gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  gltf.scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
});
const clip = (name: string) => gltf.animations.find(a => a.name === name)!;
const soles = () => {
  const p = mesh.geometry.getAttribute('position'), ids: number[] = [];
  for (let i = 0; i < p.count; i++) if (p.getY(i) < .014) ids.push(i);
  return ids;
};
function pose(name: string, t: number, ids: number[]) {
  const mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(clip(name));
  action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.update(t);
  gltf.scene.updateMatrixWorld(true); mesh.skeleton.update();
  const points = ids.map(i => mesh.getVertexPosition(i, new THREE.Vector3()));
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  return points;
}

describe('reference candidate: exported geometry and rig', () => {
  it('ships one textured-by-colour skin with human scale, within the mobile asset budget', () => {
    const ms: THREE.SkinnedMesh[] = [];
    gltf.scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) ms.push(o as THREE.SkinnedMesh); });
    expect(ms).toHaveLength(1); expect(mesh.skeleton.bones).toHaveLength(52);
    expect(Array.isArray(mesh.material)).toBe(false);
    expect(mesh.geometry.getAttribute('color')).toBeDefined();
    expect(Object.keys(mesh.geometry.morphAttributes)).toHaveLength(0);
    expect((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3).toBeLessThan(20_000);
    expect(bytes.length).toBeLessThan(2_500_000);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeGreaterThan(1.77);
    expect(mesh.geometry.boundingBox!.max.y).toBeLessThan(1.85);
  });
  it('has three independently weighted joints on every finger, with normalized valid skin weights', () => {
    const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const used = new Set<number>();
    for (let i = 0; i < weights.count; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const w = weights.getComponent(i, k), j = joints.getComponent(i, k);
        expect(Number.isFinite(w)).toBe(true); expect(j).toBeLessThan(52);
        sum += w; if (w > .01) used.add(j);
      }
      expect(sum).toBeCloseTo(1, 4);
    }
    for (const side of ['Left', 'Right']) for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (const n of [1, 2, 3]) {
      const j = mesh.skeleton.bones.findIndex(b => b.name === `mixamorig${side}Hand${finger}${n}`);
      expect(j, `${side} ${finger} ${n}`).toBeGreaterThan(-1); expect(used.has(j)).toBe(true);
    }
  });
});

describe('reference candidate: retargeted contact and motion', () => {
  it('has a calm three-second idle that closes without a visible pose jump', () => {
    expect(clip('Idle').duration).toBeGreaterThan(3);
    const ids = Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => i);
    const a = pose('Idle', 0, ids), b = pose('Idle', clip('Idle').duration - .00001, ids), middle = pose('Idle', 1.5, ids);
    expect(Math.max(...a.map((v, i) => v.distanceTo(b[i])))).toBeLessThan(.002);
    expect(Math.max(...a.map((v, i) => v.distanceTo(middle[i])))).toBeGreaterThan(.001);
  });
  it('contains real movement and the requested states, including captured turns and sit transitions', () => {
    for (const name of ['Idle', 'Walk', 'Jog', 'Run', 'TurnRight', 'TurnLeft', 'Sit', 'SitEnter', 'SitExit']) {
      expect(clip(name), name).toBeDefined(); expect(clip(name).duration).toBeGreaterThan(.5);
    }
    const ids = soles();
    for (const name of ['Walk', 'Jog', 'Run', 'TurnRight', 'TurnLeft']) {
      const a = pose(name, .05, ids), b = pose(name, clip(name).duration * .4, ids);
      expect(Math.max(...a.map((p, i) => p.distanceTo(b[i]))), name).toBeGreaterThan(.08);
    }
  });
  it('keeps standing/walking/turning soles within 7 mm of contact; running retains limited flight', () => {
    const ids = soles();
    for (const name of ['Idle', 'Walk', 'TurnRight', 'TurnLeft', 'Jog', 'Run']) {
      const heights: number[] = [];
      for (let i = 0; i <= 40; i++) heights.push(Math.min(...pose(name, clip(name).duration * i / 40, ids).map(p => p.y)));
      expect(Math.min(...heights), name).toBeGreaterThan(.025);
      expect(Math.min(...heights), name).toBeLessThan(.042);
      if (name === 'Jog' || name === 'Run') {
        expect(Math.max(...heights), name).toBeGreaterThan(.07);
        expect(Math.max(...heights), name).toBeLessThan(.14);
      } else expect(Math.max(...heights), name).toBeLessThan(.042);
    }
  });
  it('mirrors the captured leg stepping to the opposite side for a left turn', () => {
    const sample = (name: string, t: number) => {
      const mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(clip(name));
      action.setLoop(THREE.LoopOnce, 1).play(); mixer.update(t); gltf.scene.updateMatrixWorld(true);
      const positions = new Map(mesh.skeleton.bones.map(b => [b.name, b.getWorldPosition(new THREE.Vector3())]));
      mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene); return positions;
    };
    for (const t of [.01, .3, .6, 1.1]) {
      const captured = sample('TurnRight', t), mirrored = sample('TurnLeft', t);
      for (const [name, point] of captured) if (/Leg|Foot|Toe/.test(name)) {
        const opposite = name.includes('Left') ? name.replace('Left', 'Right') : name.replace('Right', 'Left');
        expect(mirrored.get(opposite)!.distanceTo(point.clone().setX(-point.x)), `${name} at ${t}`).toBeLessThan(.002);
      }
    }
  });
  it('fits the existing bench convention by butt contact and keeps shoes above ground', () => {
    const p = mesh.geometry.getAttribute('position'), c = mesh.geometry.getAttribute('color'), butt: number[] = [];
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < .14 && p.getY(i) > .87 && p.getY(i) < 1.04 && p.getZ(i) < -.025 && c.getY(i) > c.getX(i) * 1.2) butt.push(i);
    const contact = Math.min(...pose('Sit', .3, butt).map(v => v.y));
    expect(contact).toBeGreaterThan(.46); expect(contact).toBeLessThan(.50);
    expect(Math.min(...pose('Sit', .3, soles()).map(v => v.y))).toBeGreaterThan(.03);
  });
  it('rests both hands on the lap and clears the trousers when sitting down or standing up', () => {
    const a = mesh.geometry.attributes, index = mesh.geometry.index!;
    const handBones = new Map(mesh.skeleton.bones.flatMap((b, i) => b.name.includes('Hand') ? [[i, b.name.includes('Left') ? 'Left' : 'Right'] as const] : []));
    const hands: Record<string, number[]> = { Left: [], Right: [] }, pants = new Set<number>();
    for (let i = 0; i < a.position.count; i++) {
      if (a.position.getY(i) > .45 && a.position.getY(i) < 1.05 && a.color.getY(i) > a.color.getX(i) * 1.2) pants.add(i);
      for (let k = 0; k < 4; k++) {
        const side = handBones.get(a.skinIndex.getComponent(i, k));
        if (side && a.skinWeight.getComponent(i, k) > .5) { hands[side].push(i); break; }
      }
    }
    for (const ids of Object.values(hands)) expect(ids.length).toBeGreaterThan(500);
    const faces: number[][] = [];
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (ids.every(id => pants.has(id))) faces.push(ids);
    }
    const point = new THREE.Vector3(), nearestPoint = new THREE.Vector3(), normal = new THREE.Vector3();
    for (const name of ['Sit', 'SitEnter', 'SitExit']) for (const fraction of [.1, .3, .5, .7, .9]) {
      const mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(clip(name));
      action.setLoop(THREE.LoopOnce, 1).play(); mixer.update(clip(name).duration * fraction);
      gltf.scene.updateMatrixWorld(true); mesh.skeleton.update();
      const triangles = faces.map(ids => new THREE.Triangle(...ids.map(i => mesh.getVertexPosition(i, new THREE.Vector3())) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]));
      for (const [side, ids] of Object.entries(hands)) {
        let clearance = Infinity, penetration = 0;
        for (const id of ids) {
          mesh.getVertexPosition(id, point);
          let distance = Infinity, signed = 0;
          for (const face of triangles) {
            face.closestPointToPoint(point, nearestPoint);
            const d = point.distanceTo(nearestPoint);
            if (d < distance) { distance = d; signed = face.getNormal(normal).dot(point.clone().sub(nearestPoint)); }
          }
          clearance = Math.min(clearance, distance); penetration = Math.min(penetration, signed);
        }
        expect(penetration, `${name} ${fraction} ${side}: fingertips through fabric`).toBeGreaterThan(-.003);
        if (name === 'Sit') expect(clearance, `${side} hand/lap contact`).toBeLessThan(.008);
      }
      mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
    }
  });
  it('plays movement from actual ground speed, holds a complete turn, and enters a seat', () => {
    const h = new Humanoid(undefined, { scene: gltf.scene, clips: gltf.animations });
    h.animate(1 / 60, 0);
    for (const [speed, name] of [[2, 'Walk'], [4.2, 'Jog'], [7, 'Run']] as const) {
      for (let i = 0; i < 60; i++) { h.group.position.z += speed / 60; h.animate(1 / 60, 0); }
      expect(h.clipName).toBe(name);
      const motion = h.motionInfo()!, cadence = 2 * motion.timeScale / motion.duration;
      const bounds = name === 'Walk' ? [1.8, 2.7] : name === 'Jog' ? [2.7, 3.4] : [3.1, 3.9];
      expect(cadence, `${name}: steps per second`).toBeGreaterThan(bounds[0]);
      expect(cadence, `${name}: steps per second`).toBeLessThan(bounds[1]);
    }
    for (let i = 0; i < 90; i++) h.animate(1 / 60, 0);
    h.group.rotation.y += Math.PI / 2; h.animate(1 / 60, 0); expect(h.clipName).toBe('TurnLeft');
    for (let i = 0; i < 30; i++) h.animate(1 / 60, 0);
    expect(h.clipName).toBe('TurnLeft');
    for (let i = 0; i < 60; i++) h.animate(1 / 60, 0);
    expect(h.clipName).toBe('Idle');
    h.group.rotation.y -= Math.PI / 2; h.animate(1 / 60, 0); expect(h.clipName).toBe('TurnRight');
    for (let i = 0; i < 30; i++) h.animate(1 / 60, 0);
    expect(h.clipName).toBe('TurnRight');
    for (let i = 0; i < 60; i++) h.animate(1 / 60, 0);
    expect(h.clipName).toBe('Idle');
    h.hold = 'Sit'; h.animate(1 / 60, 0); expect(h.clipName).toBe('SitEnter');
    for (let i = 0; i < 100; i++) h.animate(1 / 60, 0);
    expect(h.clipName).toBe('Sit');
    h.hold = null; h.animate(1 / 60, 0); expect(h.clipName).toBe('SitExit');
    h.dispose();
  });
  it('holds one-shot turns and seat transitions on their final frame instead of replaying', () => {
    const h = new Humanoid(undefined, { scene: gltf.scene, clips: gltf.animations });
    for (const name of ['TurnRight', 'TurnLeft', 'SitEnter', 'SitExit'] as const) {
      h.reset(); h.hold = name;
      for (let i = 0; i < Math.ceil(clip(name).duration * 60) + 30; i++) h.animate(1 / 60, 0);
      expect(h.motionInfo()!.time, name).toBeCloseTo(clip(name).duration, 5);
      for (let i = 0; i < 30; i++) h.animate(1 / 60, 0);
      expect(h.motionInfo()!.time, `${name}: remains clamped`).toBeCloseTo(clip(name).duration, 5);
    }
    h.dispose();
  });
});
