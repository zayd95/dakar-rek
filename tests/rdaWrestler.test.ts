import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GaitState, GROUND, RIG } from '../src/actors/gait';
import { GaitRig } from '../src/actors/gaitRig';
import { AIMS, StrikeRig } from '../src/lamb/strikeRig';
import { buildOf, rdaWanted, resolveRdaBody, resolveRdaParts } from '../src/actors/rdaFlag';
import type { Humanoid } from '../src/actors/humanoid';

/**
 * The Roi des Arènes wrestlers on Dakar Rek's rig (public/assets/wrestlers/rda_wrestlers*.glb, scripts/wrestlers/build-rda-wrestlers.mjs,
 * docs/wrestling/RDA-INTEGRATION.md), read straight from the GLB bytes like tests/rig.ts reads v4's: the bones, sockets, bind lengths and
 * clips of the contract; the skinned surface under a pose the gait solves and under StrikeRig aims (skinned on the CPU, as the GPU does).
 */
type Gltf = { nodes: { name?: string; children?: number[]; rotation?: number[]; translation?: number[]; scale?: number[]; mesh?: number; skin?: number; extras?: Record<string, unknown> }[];
  meshes: { name?: string; extras?: { targetNames?: string[] }; primitives: { attributes: Record<string, number>; indices: number; targets?: Record<string, number>[] }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[]; skins: { joints: number[]; inverseBindMatrices: number }[];
  animations: { name: string; samplers: { input: number; output: number }[]; channels: { sampler: number; target: { node: number; path: string } }[] }[] };
function readGlb(file: string) {
  const glb = new Uint8Array(readFileSync(new URL(`../public/assets/${file}`, import.meta.url)));
  const dv = new DataView(glb.buffer, glb.byteOffset), jsonLength = dv.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Gltf;
  const bin = 20 + jsonLength + 8;
  const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  // (vertex attributes may be interleaved: each element read at its stride)
  const read = (i: number): number[] => {
    const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView], k = SIZE[a.type], start = bin + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType]!, stride = v.byteStride ?? k * size, out: number[] = [];
    const get = (o: number) => a.componentType === 5126 ? dv.getFloat32(o, true) : a.componentType === 5125 ? dv.getUint32(o, true) : a.componentType === 5123 ? dv.getUint16(o, true) : dv.getUint8(o);
    for (let e = 0; e < a.count; e++) for (let c = 0; c < k; c++) out.push(get(start + e * stride + c * size));
    return a.normalized ? out.map(x => x / (size === 1 ? 255 : 65535)) : out;
  };
  const nodes = gltf.nodes.map(n => {
    const o = n.skin === undefined && gltf.skins[0].joints.includes(gltf.nodes.indexOf(n)) ? new THREE.Bone() : new THREE.Object3D();
    o.name = THREE.PropertyBinding.sanitizeNodeName(n.name ?? '');
    if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.translation) o.position.fromArray(n.translation); if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  gltf.nodes.forEach((n, i) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  const root = new THREE.Group(); nodes.forEach(o => { if (!o.parent) root.add(o); });
  const clips = gltf.animations.map(anim => new THREE.AnimationClip(anim.name, -1, anim.channels.map(ch => {
    const s = anim.samplers[ch.sampler], name = nodes[ch.target.node].name;
    return ch.target.path === 'rotation' ? new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, read(s.input), read(s.output))
      : new THREE.VectorKeyframeTrack(`${name}.${ch.target.path === 'scale' ? 'scale' : 'position'}`, read(s.input), read(s.output));
  })));
  root.updateMatrixWorld(true);
  return { gltf, read, nodes, root, clips };
}
const v4 = readGlb('character_v4.glb'), rda = readGlb('wrestlers/rda_wrestlers_m.glb'), rdaHigh = readGlb('wrestlers/rda_wrestlers.glb');
const report = JSON.parse(new TextDecoder().decode(readFileSync(new URL('../docs/wrestling/rda/build-report.json', import.meta.url))));
const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upper_armL', 'forearmL', 'handL', 'shoulderR', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const SOCKETS = ['socket_armL', 'socket_armR', 'socket_waist', 'socket_neck'];
const by = (g: ReturnType<typeof readGlb>, n: string) => g.root.getObjectByName(n)!;
const wpos = (g: ReturnType<typeof readGlb>, n: string) => by(g, n).getWorldPosition(new THREE.Vector3());

/** A mesh of the RDA file, skinned on the CPU (morph `build`, then linear blend skinning with the file's inverse bind matrices). */
function skinned(g: ReturnType<typeof readGlb>, meshName: string, build: 'athletic' | 'heavy' = 'athletic') {
  const node = g.gltf.nodes.find(n => n.name === meshName)!, mesh = g.gltf.meshes[node.mesh!], prim = mesh.primitives[0];
  const P = g.read(prim.attributes.POSITION), J = g.read(prim.attributes.JOINTS_0), W = g.read(prim.attributes.WEIGHTS_0), idx = g.read(prim.indices);
  const names = mesh.extras?.targetNames ?? [];
  const t = prim.targets?.[names.indexOf(build === 'athletic' ? 'AthleticStudy' : 'HeavyStudy')];
  const D = t ? g.read(t.POSITION) : null;
  const skin = g.gltf.skins[node.skin!], ibm = g.read(skin.inverseBindMatrices), bones = skin.joints.map(j => g.nodes[j]);
  const at = (): THREE.Vector3[] => {
    g.root.updateMatrixWorld(true);
    const M = bones.map((b, k) => b.matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(ibm.slice(k * 16, k * 16 + 16))));
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < P.length / 3; i++) {
      const v = new THREE.Vector3(P[i * 3] + (D?.[i * 3] ?? 0), P[i * 3 + 1] + (D?.[i * 3 + 1] ?? 0), P[i * 3 + 2] + (D?.[i * 3 + 2] ?? 0)), acc = new THREE.Vector3();
      for (let k = 0; k < 4; k++) if (W[i * 4 + k] > 0) acc.addScaledVector(v.clone().applyMatrix4(M[J[i * 4 + k]]), W[i * 4 + k]);
      out.push(acc);
    }
    return out;
  };
  return { P, J, W, idx, at, extras: node.extras ?? {}, names, prim };
}

describe('the RDA wrestler file on v4\'s rig contract', () => {
  it('every bone and socket of character_v4.glb, the same parents, the same rest rotations', () => {
    for (const n of [...BONES, ...SOCKETS]) { expect(by(rda, n), n).toBeTruthy(); expect(by(rda, n).parent!.name).toBe(by(v4, n).parent!.name); }
    for (const n of BONES) by(rda, n).quaternion.toArray().forEach((x, i) => expect(Math.abs(x - by(v4, n).quaternion.toArray()[i]), n).toBeLessThan(1e-6));
    expect(rda.gltf.skins[0].joints.map(j => rda.nodes[j].name)).toEqual(v4.gltf.skins[0].joints.map(j => v4.nodes[j].name));
  });
  it('legs, hips, trunk, neck and head: v4\'s joints exactly (the gait\'s two-bone IK, src/actors/gait.ts RIG, is built on them)', () => {
    for (const n of ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']) expect(wpos(rda, n).distanceTo(wpos(v4, n)), n).toBeLessThan(1e-5);
    expect(wpos(rda, 'thighL').distanceTo(wpos(rda, 'shinL'))).toBeCloseTo(RIG.thigh, 3);
    expect(wpos(rda, 'shinL').distanceTo(wpos(rda, 'footL'))).toBeCloseTo(RIG.shin, 3);
    expect(wpos(rda, 'thighL').y).toBeCloseTo(RIG.hipY, 3);
  });
  it('arms: RDA\'s own lengths on v4\'s rest directions, the shoulder where RDA\'s is (the body\'s own copy of the skeleton)', () => {
    for (const s of ['L', 'R'] as const) {
      const sh = wpos(rda, `upper_arm${s}`), el = wpos(rda, `forearm${s}`), wr = wpos(rda, `hand${s}`);
      expect(el.distanceTo(sh)).toBeCloseTo(report.arms[s].upperArm, 3); expect(wr.distanceTo(el)).toBeCloseTo(report.arms[s].forearm, 3);
      const dir = (g: ReturnType<typeof readGlb>, a: string, b: string) => wpos(g, b).sub(wpos(g, a)).normalize();
      expect(dir(rda, `upper_arm${s}`, `forearm${s}`).angleTo(dir(v4, `upper_arm${s}`, `forearm${s}`))).toBeLessThan(1e-4);
      expect(dir(rda, `forearm${s}`, `hand${s}`).angleTo(dir(v4, `forearm${s}`, `hand${s}`))).toBeLessThan(1e-4);
      expect(sh.distanceTo(wpos(v4, `upper_arm${s}`))).toBeLessThan(0.08);                         // a few cm: RDA's shoulder sits lower and nearer
      expect(wpos(rda, `socket_arm${s}`).distanceTo(sh)).toBeCloseTo(0.7 * report.arms[s].upperArm, 3);   // the arm placeholder where RDA's band is
    }
  });
  it('the inverse bind matrices are the joints\' rest (what the meshes were baked against)', () => {
    const ibm = rda.read(rda.gltf.skins[0].inverseBindMatrices);
    rda.gltf.skins[0].joints.forEach((j, k) => {
      const e = rda.nodes[j].matrixWorld.clone().multiply(new THREE.Matrix4().fromArray(ibm.slice(k * 16, k * 16 + 16))).elements;
      e.forEach((x, i) => expect(Math.abs(x - (i % 5 === 0 ? 1 : 0))).toBeLessThan(1e-4));
    });
  });
  it('every v4 clip, its rotations untouched; only the refitted arm bones\' translations hold their new rest', () => {
    expect(rda.clips.map(c => c.name)).toEqual(v4.clips.map(c => c.name));
    for (const [i, c] of rda.clips.entries()) for (const [k, t] of c.tracks.entries()) {
      const o = v4.clips[i].tracks[k]; expect(t.name).toBe(o.name);
      if (t.name.endsWith('.position') && /^(upper_arm|forearm|hand)[LR]/.test(t.name)) {
        const rest = by(rda, t.name.split('.')[0]).position; for (let j = 0; j < t.values.length; j++) expect(t.values[j]).toBeCloseTo(rest.getComponent(j % 3), 5);
      } else expect(Array.from(t.values)).toEqual(Array.from(o.values));
    }
  });
  it('the 31 MPFB joints all map onto v4 bones (none lost, none invented)', () => {
    const map = report.boneMap as Record<string, string>;
    expect(Object.keys(map)).toHaveLength(31);
    const v4Names = new Set(v4.gltf.skins[0].joints.map(j => v4.gltf.nodes[j].name));
    for (const [k, v] of Object.entries(map)) expect(v4Names.has(v), `${k} → ${v}`).toBe(true);
    expect(new Set(Object.values(map)).size).toBe(19);                                             // every bone but the root carries skin
    expect(map.LeftUpLeg).toBe('thigh.L'); expect(map.LeftForeArm).toBe('forearm.L'); expect(map.Spine1).toBe('chest'); expect(map.LThumb).toBe('hand.L');
  });
  it('the body: both physiques as morphs, sound weights, standing on its soles, a wrestler\'s height; the face only on the head', () => {
    const b = skinned(rda, 'RDA_Body');
    expect(b.names).toEqual(['AthleticStudy', 'HeavyStudy']);
    for (let i = 0; i < b.W.length; i += 4) { expect(b.W[i] + b.W[i + 1] + b.W[i + 2] + b.W[i + 3]).toBeCloseTo(1, 4); }
    expect(Math.max(...b.J)).toBeLessThan(20);
    for (const build of ['athletic', 'heavy'] as const) {
      const pts = skinned(rda, 'RDA_Body', build).at(), box = new THREE.Box3().setFromPoints(pts);
      expect(pts.every(p => Number.isFinite(p.x + p.y + p.z))).toBe(true);
      expect(box.min.y).toBeGreaterThan(-0.01); expect(box.min.y).toBeLessThan(0.02);                // soles on the ground (v4's lie at -0.01)
      expect(box.max.y - box.min.y).toBeGreaterThan(1.75); expect(box.max.y - box.min.y).toBeLessThan(1.85);   // × 1.08 in a bout: 1.9–2.0 m
      expect(box.max.x - box.min.x).toBeLessThan(0.9);                                                       // arms down, not the A-pose
    }
    const fw = rda.read(b.prim.attributes._FACEW), uv = rda.read(b.prim.attributes.TEXCOORD_0);
    for (let i = 0; i < fw.length; i++) {
      expect(fw[i]).toBeGreaterThanOrEqual(0); expect(fw[i]).toBeLessThanOrEqual(1);
      if (fw[i] > 0) { expect(b.P[i * 3 + 1]).toBeGreaterThan(1.5); expect(uv[i * 2]).toBeGreaterThanOrEqual(0); expect(uv[i * 2]).toBeLessThanOrEqual(1); expect(uv[i * 2 + 1]).toBeGreaterThanOrEqual(0); expect(uv[i * 2 + 1]).toBeLessThanOrEqual(1); }
    }
    expect(fw.filter(x => x > 0.99).length).toBeGreaterThan(500);
  });
  it('the ngemb cuts carry the uv the game\'s ngemb canvas needs (round the body; v from the waist to the hem), the hair is there', () => {
    for (const n of ['Ngemb_A', 'Ngemb_B']) {
      const m = skinned(rda, n), uv = rda.read(m.prim.attributes.TEXCOORD_0 ?? -1);
      expect(uv.length, n).toBe((m.P.length / 3) * 2);
      const vs = uv.filter((_, i) => i % 2 === 1); expect(Math.min(...vs)).toBeGreaterThanOrEqual(0); expect(Math.max(...vs)).toBeLessThanOrEqual(1);
      expect(m.names).toEqual(['AthleticStudy', 'HeavyStudy']);
    }
    const a = skinned(rda, 'Ngemb_A').at(), b = skinned(rda, 'Ngemb_B').at();
    expect(Math.min(...b.map(p => p.y))).toBeLessThan(Math.min(...a.map(p => p.y)) - 0.1);                 // B is the long cut
    expect(skinned(rda, 'Hair_Short').P.length).toBeGreaterThan(300);
  });
  it('the two files differ by their textures only (high and medium)', () => {
    expect(rdaHigh.gltf.meshes.map(m => m.name)).toEqual(rda.gltf.meshes.map(m => m.name));
    expect(rdaHigh.read(rdaHigh.gltf.meshes[0].primitives[0].attributes.POSITION)).toEqual(rda.read(rda.gltf.meshes[0].primitives[0].attributes.POSITION));
  });
});

describe('the RDA accessory pieces (original geometry, cultural status unverified, off by default)', () => {
  const pieces = ['armL', 'armR', 'waist', 'chest'];
  it('four pieces per physique, six pouches each physique, every pouch rigid on its bone', () => {
    for (const b of ['athletic', 'heavy']) {
      let pouches = 0;
      for (const p of pieces) {
        const m = skinned(rda, `RDA_Acc_${b}_${p}`), probes = m.extras.rdaProbes as { vertex: number; bone: string }[];
        pouches += probes.length;
        const v4Names = rda.gltf.skins[0].joints.map(j => rda.gltf.nodes[j].name);
        for (const pr of probes) { expect(m.W[pr.vertex * 4]).toBeCloseTo(1, 5); expect(v4Names[m.J[pr.vertex * 4]]).toBe(pr.bone); }
      }
      expect(pouches).toBe(6);
    }
  });
  it('the pouches stay on their bones and the cords on the body under a gait stride and a StrikeRig strike', () => {
    const rig = rda.root;
    const restDist = (b: string) => Object.fromEntries(pieces.map(p => {
      const m = skinned(rda, `RDA_Acc_${b}_${p}`), pts = m.at(), probes = m.extras.rdaProbes as { vertex: number; bone: string }[];
      return [p, probes.map(pr => pts[pr.vertex].distanceTo(by(rda, THREE.PropertyBinding.sanitizeNodeName(pr.bone)).getWorldPosition(new THREE.Vector3())))];
    }));
    const before = restDist('heavy');
    // a stride solved by the gait, then a big strike thrown over it (the bout's overlay)
    const g = new GaitState(), gr = GaitRig.from(rig.children[0] as THREE.Object3D) ?? GaitRig.from(rig)!;
    for (let t = 0; t < 1.2; t += 1 / 60) { g.update(1 / 60, 0, t * 1.4, 0, 1, 1.4); }
    gr.apply(g, 1);
    const sr = new StrikeRig({ group: rig, fullRate: false } as unknown as Humanoid); sr.apply(AIMS.big, 1);
    const after = restDist('heavy');
    for (const p of pieces) after[p].forEach((d: number, i: number) => expect(Math.abs(d - before[p][i]), p).toBeLessThan(1e-4));
    // the chest X's cords still lie on the torso: every cord vertex within 6 cm of the nearest body vertex
    const body = skinned(rda, 'RDA_Body', 'heavy').at(), cords = skinned(rda, 'RDA_Acc_heavy_chest').at();
    let worst = 0;
    for (let i = 0; i < cords.length; i += 7) { let d = Infinity; for (let j = 0; j < body.length; j += 2) d = Math.min(d, cords[i].distanceToSquared(body[j])); worst = Math.max(worst, Math.sqrt(d)); }
    expect(worst).toBeLessThan(0.06);
    rig.traverse(o => { if ((o as THREE.Bone).isBone) { /* reset for the next test */ } });
  });
});

describe('a pose the gait solves and StrikeRig aims, on the RDA body', () => {
  it('the soles land on the ground through a walk (feet planted where v4\'s are), the hands follow the guard', () => {
    const g = readGlb('wrestlers/rda_wrestlers_m.glb'), rig = g.root;
    const gs = new GaitState(), gr = GaitRig.from(rig)!;
    expect(gr).toBeTruthy();
    const foot = skinned(g, 'RDA_Body', 'heavy');
    const footL = new Set<number>(); const node = g.gltf.nodes.find(n => n.name === 'RDA_Body')!; void node;
    const jn = g.gltf.skins[0].joints.map(j => g.gltf.nodes[j].name);
    for (let i = 0; i < foot.W.length / 4; i++) if (jn[foot.J[i * 4]] === 'foot.L' && foot.W[i * 4] > 0.9) footL.add(i);
    let lowest = Infinity, highest = -Infinity, frames = 0;
    for (let t = 0; t < 2.5; t += 1 / 30) {
      gs.update(1 / 30, 0, t * 1.2, 0, 1, 1.2); gr.apply(gs, 1);
      if (t < 1 || !gs.feet[0].planted || gs.feet[0].swing) continue;
      const pts = foot.at(); let lo = Infinity; for (const i of footL) lo = Math.min(lo, pts[i].y);
      lowest = Math.min(lowest, lo); highest = Math.max(highest, lo); frames++;
    }
    expect(frames).toBeGreaterThan(5);
    expect(lowest).toBeGreaterThan(GROUND - 0.06); expect(highest).toBeLessThan(GROUND + 0.05);   // the planted sole at the ground (sand), not floating
    // StrikeRig's guard: both forearms up in front of the face
    const sr = new StrikeRig({ group: rig, fullRate: false } as unknown as Humanoid); sr.apply(AIMS.guard, 1); rig.updateMatrixWorld(true);
    for (const s of ['L', 'R']) {
      const fa = g.root.getObjectByName(`forearm${s}`)!, d = new THREE.Vector3(0, 1, 0).transformDirection(fa.matrixWorld);
      expect(d.angleTo(new THREE.Vector3(...(AIMS.guard as Record<string, number[]>)[`forearm${s}`]).normalize())).toBeLessThan(0.02);
      expect(g.root.getObjectByName(`hand${s}`)!.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0.12);
    }
  });
});

describe('the checks\' detached-vertex measure (src/actors/rdaLook.ts rigidDrift)', () => {
  it('a vertex carried by one bone alone keeps its rest distance to that bone under a stride and a strike, for both physiques', () => {
    for (const build of ['athletic', 'heavy'] as const) {
      const g = readGlb('wrestlers/rda_wrestlers_m.glb'), body = skinned(g, 'RDA_Body', build);
      const jn = g.gltf.skins[0].joints.map(j => g.nodes[j]);
      const rigid: number[] = [];
      for (let i = 0; i < body.W.length / 4; i += 3) if (Math.max(body.W[i * 4], body.W[i * 4 + 1], body.W[i * 4 + 2], body.W[i * 4 + 3]) >= 0.999) rigid.push(i);
      expect(rigid.length).toBeGreaterThan(200);
      const boneOf = (i: number) => { let k = 0; for (let c = 1; c < 4; c++) if (body.W[i * 4 + c] > body.W[i * 4 + k]) k = c; return jn[body.J[i * 4 + k]]; };
      const rest = body.at(), restD = rigid.map(i => rest[i].distanceTo(boneOf(i).getWorldPosition(new THREE.Vector3())));
      const gs = new GaitState(), gr = GaitRig.from(g.root)!;
      for (let t = 0; t < 1.2; t += 1 / 30) gs.update(1 / 30, 0, t * 1.4, 0, 1, 1.4);
      gr.apply(gs, 1);
      new StrikeRig({ group: g.root, fullRate: false } as unknown as Humanoid).apply(AIMS.big, 1);
      g.root.updateMatrixWorld(true);
      const now = body.at();
      let worst = 0;
      rigid.forEach((i, n) => { worst = Math.max(worst, Math.abs(now[i].distanceTo(boneOf(i).getWorldPosition(new THREE.Vector3())) - restD[n])); });
      expect(worst).toBeLessThan(1e-4);
    }
  });
});

describe('the switch (src/actors/rdaFlag.ts)', () => {
  it('off unless asked; ?rdabody for medium and high; force for every quality; the address wins over the stored choice', () => {
    expect(resolveRdaBody('', null)).toBe('on');                     // the default since the 1.0.1 release (Medium and High; Low keeps v4)
    expect(resolveRdaBody('?rdabody', null)).toBe('on'); expect(resolveRdaBody('?debug&rdabody=force', null)).toBe('force');
    expect(resolveRdaBody('?rdabody=0', '1')).toBe('off'); expect(resolveRdaBody('', '1')).toBe('on'); expect(resolveRdaBody('', 'force')).toBe('force');
    expect(rdaWanted('low', 'on')).toBe(false); expect(rdaWanted('medium', 'on')).toBe(true); expect(rdaWanted('low', 'force')).toBe(true); expect(rdaWanted('high', 'off')).toBe(false);
  });
  it('the pieces are off by default; arms and chest are two switches', () => {
    expect(resolveRdaParts('', null)).toEqual({ armsWaist: false, chest: false });
    expect(resolveRdaParts('?rdaparts=arms', null)).toEqual({ armsWaist: true, chest: false });
    expect(resolveRdaParts('?rdaparts=chest', null)).toEqual({ armsWaist: false, chest: true });
    expect(resolveRdaParts('', 'arms,chest')).toEqual({ armsWaist: true, chest: true });
  });
  it('heavy for the heavy style, athletic for the others', () => {
    expect(buildOf('costaud')).toBe('heavy'); expect(buildOf('rapide')).toBe('athletic'); expect(buildOf('defensif')).toBe('athletic'); expect(buildOf(null)).toBe('athletic');
  });
});
