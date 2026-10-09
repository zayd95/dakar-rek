import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WrestlerLook } from '../core/types';
import { ACCESSORIES, ngembTexture, type Socket } from '../lamb/look';
import type { Outfit } from './character';

/**
 * Shared humanoid from Blender (public/assets/character_v4.glb, source assets-src/character_rig_v4.blend):
 * one skinned body on a 20-bone rig with clothing meshes (Tee, Trousers, Boubou, Dress, Kufi, Headwrap, Shoes),
 * two ngemb cuts and accessory sockets. Clips: Idle, Walk, Run, Talk, Sit, Stance, Grab, Fall_Back, Prep,
 * Dance_A, Dance_B, Celebrate, Entrance_Walk. Status: TEMP v2 (see docs/ASSET_REGISTER.md).
 */
export type Clip = 'Idle' | 'Walk' | 'Run' | 'Talk' | 'Sit' | 'Stance' | 'Grab' | 'Fall_Back' | 'Prep' | 'Dance_A' | 'Dance_B' | 'Celebrate' | 'Entrance_Walk' | PoseClip;
/** Poses built in code from the rig's rest pose (buildPoseClips): lying on the back, cross-legged, kneeling. */
export type PoseClip = 'Lie' | 'SitFloor' | 'SitKneel';
export type Style = 'boubou' | 'tee' | 'dress';
export type Pattern = 'uni' | 'wax' | 'bazin' | 'rayure';
export interface PersonLook {
  skin: number; style: Style; top: number; bottom?: number; pattern?: Pattern; accent?: number;
  hat?: 'kufi' | 'headwrap' | null; hatColor?: number; shoes?: number; female?: boolean;
  /** Body shape (morph targets from the Blender rig, 0–1). */
  heavy?: number; muscular?: number;
  hair?: 'short' | 'puff' | 'none'; beard?: number | null; // beard colour, null = none
}

let template: { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null = null;
export const humanoidReady = () => !!template;

export async function preloadHumanoid(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    let buf: ArrayBuffer | null = null;
    const res = await fetch(`${base}assets/character_v4.glb`).catch(() => null);
    if (res?.ok) buf = await res.arrayBuffer();
    else {
      // Hosts that do not serve .glb (e.g. the claude.ai preview) get the same bytes as base64 JSON.
      const alt = await fetch(`${base}assets/character_v4.glb.json`).catch(() => null);
      if (!alt?.ok) return;
      const bin = atob(((await alt.json()) as { glb: string }).glb);
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf = u8.buffer;
    }
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    fixSitKnees(gltf.animations);
    template = { scene: gltf.scene, clips: [...gltf.animations, ...buildPoseClips(gltf.scene, gltf.animations)] };
  } catch { /* box characters stay in use */ }
}

/**
 * The exported Sit action flexes the knees the wrong way: with the thighs level, the shins point up along the
 * chest instead of hanging to the ground. Mirror the shin rotation (−X → +X about the knee) so the feet rest on
 * the ground in front of the seat. Only applies while the shins still bend the wrong way, so it becomes a no-op
 * once the Blender action is corrected and re-exported.
 */
export function fixSitKnees(clips: THREE.AnimationClip[]) {
  const sit = clips.find(c => c.name === 'Sit'); if (!sit) return;
  for (const track of sit.tracks) {
    if (!/^shin\.?[LR]\.quaternion$/.test(track.name)) continue;
    const v = track.values;
    let backward = true;
    for (let i = 0; i < v.length; i += 4) if (v[i] > -0.3) backward = false;
    if (!backward) continue;
    for (let i = 0; i < v.length; i += 4) { v[i] = -v[i]; v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
  }
}

// ---------------------------------------------------------------- poses built in code (home and social life)
/**
 * Character space: origin on the surface under the hips, +z forward (toes), +x the character's left, +y up.
 * Each pose gives the hips' height and orientation, and the direction each bone points to (its +Y axis, head to
 * tail); bones without a direction keep their rest orientation relative to their parent. Heights are chosen so
 * the body rests ON the surface the origin stands on: a mattress (Lie, head on the pillow), a mat, rug or floor
 * cushion (SitFloor, SitKneel). Seats map to them by kind (src/interact/seats.ts: seatPose).
 */
interface PoseDef { hipsY: number; hipsZ?: number; hips: [number, number, number]; aim: Record<string, [number, number, number]> }
export const POSES: Record<PoseClip, PoseDef> = {
  // on the back, head towards −z on the pillow, one knee raised, hands resting on the belly
  Lie: {
    hipsY: 0.13, hips: [-Math.PI / 2, 0, 0],
    aim: {
      spine: [0, 0, -1], chest: [0, 0.08, -1], neck: [0, 0.35, -1], head: [0, 0.4, -1],
      upper_armL: [0.26, -0.04, 1], forearmL: [-0.8, 0.45, 0.4], handL: [-0.6, 0.2, 0.75],
      upper_armR: [-0.26, -0.04, 1], forearmR: [0.8, 0.45, 0.4], handR: [0.6, 0.2, 0.75],
      thighL: [0.12, 0.3, 1], shinL: [0.04, -0.33, 1], footL: [0.12, 0.95, 0.28],
      thighR: [-0.08, 0, 1], shinR: [-0.03, 0, 1], footR: [-0.15, 0.95, 0.25],
    },
  },
  // cross-legged on a mat, rug or cushion (attaya circles, floor seats), hands on the knees
  SitFloor: {
    hipsY: 0.14, hips: [0, 0, 0],
    aim: {
      spine: [0, 1, 0.1], chest: [0, 1, 0.12], neck: [0, 1, 0.06], head: [0, 1, 0],
      thighL: [0.72, -0.05, 0.69], shinL: [-0.92, -0.06, 0.33], footL: [-0.75, -0.25, 0.3],
      thighR: [-0.72, -0.05, 0.69], shinR: [0.92, 0.04, 0.2], footR: [0.75, -0.3, 0.2],
      upper_armL: [0.27, -0.88, 0.42], forearmL: [0.39, -0.83, 0.39], handL: [0.2, -0.5, 0.85],
      upper_armR: [-0.27, -0.88, 0.42], forearmR: [-0.39, -0.83, 0.39], handR: [-0.2, -0.5, 0.85],
    },
  },
  // kneeling, sitting back on the heels, hands on the thighs
  SitKneel: {
    hipsY: 0.31, hips: [0, 0, 0],
    aim: {
      spine: [0, 1, 0.05], chest: [0, 1, 0.05], neck: [0, 1, 0.03], head: [0, 1, 0],
      thighL: [0.05, -0.5, 0.87], shinL: [0, -0.03, -1], footL: [0.05, -0.15, -1],
      thighR: [-0.05, -0.5, 0.87], shinR: [0, -0.03, -1], footR: [-0.05, -0.15, -1],
      upper_armL: [0.12, -0.9, 0.42], forearmL: [-0.33, -0.88, 0.33], handL: [-0.1, -0.6, 0.8],
      upper_armR: [-0.12, -0.9, 0.42], forearmR: [0.33, -0.88, 0.33], handR: [0.1, -0.6, 0.8],
    },
  },
};

/**
 * One-frame clips for POSES, solved from the rest pose of `scene` (the rig as GLTFLoader gives it). Every track of
 * `like` (an existing clip, so cross-fades cover every bone) gets a value: the posed rotation where the pose aims the
 * bone, the rest value otherwise; the hips also get their position.
 */
export function buildPoseClips(scene: THREE.Object3D, clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const like = clips.find(c => c.name === 'Idle') ?? clips[0];
  const rootBone = scene.getObjectByName('root'), hipsBone = scene.getObjectByName('hips');
  if (!like || !rootBone || !hipsBone) return [];
  scene.updateMatrixWorld(true);
  const sceneInv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const inScene = (o: THREE.Object3D) => { const m = new THREE.Matrix4().multiplyMatrices(sceneInv, o.matrixWorld), q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
  const Y = new THREE.Vector3(0, 1, 0);
  return (Object.keys(POSES) as PoseClip[]).map(name => {
    const def = POSES[name];
    const world = new Map<THREE.Object3D, THREE.Quaternion>(), local = new Map<THREE.Object3D, THREE.Quaternion>();
    const parentQ = inScene(hipsBone.parent!);
    const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(...def.hips, 'XYZ'));
    world.set(hipsBone, hq); local.set(hipsBone, parentQ.clone().invert().multiply(hq));
    const visit = (o: THREE.Object3D) => {
      for (const c of o.children) {
        const pw = world.get(o)!;
        let w = pw.clone().multiply(c.quaternion);
        const aim = def.aim[c.name];
        if (aim) w = new THREE.Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(w), new THREE.Vector3(...aim).normalize()).multiply(w);
        world.set(c, w); local.set(c, pw.clone().invert().multiply(w));
        visit(c);
      }
    };
    visit(hipsBone);
    // hips position: in its parent's space, at (0, hipsY, hipsZ) in character space
    const hp = new THREE.Vector3(0, def.hipsY, def.hipsZ ?? 0).applyMatrix4(scene.matrixWorld);
    hipsBone.parent!.worldToLocal(hp);
    const tracks = like.tracks.map(t => {
      const [node, prop] = [t.name.slice(0, t.name.lastIndexOf('.')), t.name.slice(t.name.lastIndexOf('.') + 1)];
      const o = scene.getObjectByName(node);
      if (prop === 'quaternion') return new THREE.QuaternionKeyframeTrack(t.name, [0], (o && local.get(o) ? local.get(o)! : o?.quaternion ?? new THREE.Quaternion()).toArray());
      if (prop === 'position' && o) return new THREE.VectorKeyframeTrack(t.name, [0], (o === hipsBone ? hp : o.position).toArray());
      if (prop === 'scale' && o) return new THREE.VectorKeyframeTrack(t.name, [0], o.scale.toArray());
      // anything else (morph weights…): hold the clip's first value
      const n = t.getValueSize(), T = t.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
      return new T(t.name, [0], Array.from(t.values.slice(0, n)));
    });
    return new THREE.AnimationClip(name, 1, tracks);
  });
}

// ---------------------------------------------------------------- fabric textures (generic prints, own designs)
const fabricCache = new Map<string, THREE.Texture>();
function fabric(base: number, accent: number, pattern: Pattern): THREE.Texture | null {
  if (pattern === 'uni' || pattern === 'bazin') return null;
  const key = `${base}/${accent}/${pattern}`;
  const hit = fabricCache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(base); g.fillRect(0, 0, 64, 64);
  g.fillStyle = hex(accent); g.strokeStyle = hex(accent);
  if (pattern === 'wax') {           // bold circles and diamonds, a generic wax-style print
    for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 64; x += 16) { g.beginPath(); g.arc(x + 4, y + 8, 5, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = 2; for (let x = 0; x < 64; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 8); g.lineTo(x, 16); g.stroke(); }
  } else if (pattern === 'rayure') { for (let x = 0; x < 64; x += 12) g.fillRect(x, 0, 4, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3); t.flipY = false; fabricCache.set(key, t); return t;
}
function clothMat(color: number, pattern: Pattern = 'uni', accent = 0xffffff): THREE.Material {
  // Double-sided like the Blender materials: some cloth faces point inward and would otherwise vanish.
  if (pattern === 'bazin') return new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.05, side: THREE.DoubleSide }); // bazin's sheen
  const map = fabric(color, accent, pattern);
  return new THREE.MeshLambertMaterial({ color: map ? 0xffffff : color, map, side: THREE.DoubleSide });
}

const SOCKET_NODE: Record<Socket, string> = { armL: 'socket_armL', armR: 'socket_armR', waist: 'socket_waist', neck: 'socket_neck' };
const CLOTH = ['Cloth_Tee', 'Cloth_Trousers', 'Cloth_Shorts', 'Cloth_Boubou', 'Cloth_DressTop', 'Cloth_Skirt', 'Cloth_Kufi', 'Cloth_Headwrap', 'Cloth_Shoes', 'Ngemb_A', 'Ngemb_B', 'Hair_Short', 'Hair_Puff', 'Beard'];

export class Humanoid {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private root: THREE.Object3D;
  private parts = new Map<string, THREE.Mesh>();
  private skinMat: THREE.MeshLambertMaterial;
  private lipsMat = new THREE.MeshLambertMaterial({ color: 0x3a1a12 });
  private beardMat = new THREE.MeshLambertMaterial({ color: 0x1a1414 });
  private morphed: THREE.Mesh[] = [];
  private accessoryMeshes: THREE.Object3D[] = [];
  clipName: Clip | null = null;
  /** When set, city movement does not change the clip (emotes, talking, sitting). */
  hold: Clip | null = null;

  constructor(look?: PersonLook) {
    if (!template) throw new Error('character asset not loaded');
    this.root = cloneSkinned(template.scene);
    this.group.add(this.root); this.group.name = 'humanoid_v2';
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0x5b3420, side: THREE.DoubleSide });
    const hair = new THREE.MeshLambertMaterial({ color: 0x141011, side: THREE.DoubleSide });
    this.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      const key = CLOTH.find(n => m.name.startsWith(n));
      if (m.morphTargetDictionary) this.morphed.push(m);
      const src = m.material as THREE.MeshStandardMaterial;
      if (key) { this.parts.set(key, m); if (key.startsWith('Hair_')) m.material = hair; if (key === 'Beard') m.material = this.beardMat; }
      else if (src.name.startsWith('Skin')) m.material = this.skinMat;
      else if (src.name === 'Hair') m.material = hair;
      else if (src.name === 'Lips') m.material = this.lipsMat;
      else m.material = new THREE.MeshLambertMaterial({ color: src.color });   // eyes
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const c of template.clips) this.actions.set(c.name, this.mixer.clipAction(c));
    if (look) this.setLook(look);
  }

  private show(names: string[]) { for (const [k, m] of this.parts) m.visible = names.includes(k); }
  private clearAccessories() { for (const a of this.accessoryMeshes) a.removeFromParent(); this.accessoryMeshes = []; }

  /** City clothing. */
  setLook(l: PersonLook) {
    this.clearAccessories();
    this.setSkin(l.skin);
    const vis = ['Cloth_Shoes'];
    const hair = l.hair ?? (l.female ? 'puff' : 'short');
    if (!l.hat && hair !== 'none') vis.push(hair === 'puff' ? 'Hair_Puff' : 'Hair_Short');
    if (l.beard != null) { vis.push('Beard'); this.beardMat.color.set(l.beard); }
    this.setShape(l.female ? 1 : 0, l.muscular ?? 0, l.heavy ?? 0);
    const set = (k: string, mat: THREE.Material) => { const m = this.parts.get(k); if (m) m.material = mat; vis.push(k); };
    if (l.style === 'boubou') { set('Cloth_Boubou', clothMat(l.top, l.pattern, l.accent)); set('Cloth_Trousers', clothMat(l.bottom ?? l.top, l.pattern === 'bazin' ? 'bazin' : 'uni')); }
    if (l.style === 'tee') { set('Cloth_Tee', clothMat(l.top, l.pattern, l.accent)); set('Cloth_Trousers', clothMat(l.bottom ?? 0x2b2f3a)); }
    if (l.style === 'dress') { const dm = clothMat(l.top, l.pattern ?? 'wax', l.accent ?? 0xf6e7c1); set('Cloth_DressTop', dm); set('Cloth_Skirt', dm); }
    if (l.hat === 'kufi') set('Cloth_Kufi', clothMat(l.hatColor ?? 0xf2f2ec));
    if (l.hat === 'headwrap') set('Cloth_Headwrap', clothMat(l.hatColor ?? l.top, l.pattern === 'wax' ? 'wax' : 'uni', l.accent ?? 0xf6e7c1));
    const shoes = this.parts.get('Cloth_Shoes'); if (shoes) shoes.material = clothMat(l.shoes ?? 0x3a2a1e);
    this.show(vis);
    this.group.scale.set(l.female ? 0.96 : 1, l.female ? 0.95 : 1, l.female ? 0.96 : 1);
  }

  /** Body shape via morph targets shared by the body and every fitted garment. */
  setShape(female: number, muscular: number, heavy: number) {
    for (const m of this.morphed) {
      const d = m.morphTargetDictionary!, inf = m.morphTargetInfluences!;
      if (d.Female !== undefined) inf[d.Female] = female;
      if (d.Muscular !== undefined) inf[d.Muscular] = muscular;
      if (d.Heavy !== undefined) inf[d.Heavy] = heavy;
    }
  }
  private setSkin(c: number) {
    this.skinMat.color.set(c);
    this.lipsMat.color.set(c).multiplyScalar(0.62);
  }

  /** Wrestling attire: ngemb (cut A short, B long with knot) and accessories on sockets. Cosmetic only. */
  setWrestler(look: WrestlerLook, cut: 'A' | 'B' = 'A', skin?: number) {
    if (skin !== undefined) this.setSkin(skin);
    const tex = ngembTexture(look.ngembColor, look.ngembPattern).clone();
    tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    const key = cut === 'A' ? 'Ngemb_A' : 'Ngemb_B';
    const m = this.parts.get(key); if (m) m.material = mat;
    this.show([key, 'Hair_Short']);
    this.setShape(0, 1, 0);
    this.clearAccessories();
    for (const id of look.accessories) {
      const a = ACCESSORIES.find(x => x.id === id); if (!a) continue;
      const node = this.root.getObjectByName(SOCKET_NODE[a.socket]); if (!node) continue;
      const g = a.socket === 'waist' ? new THREE.CylinderGeometry(0.21, 0.21, 0.05, 12) : a.socket === 'neck' ? new THREE.TorusGeometry(0.09, 0.016, 6, 12) : new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: a.color }));
      if (a.socket === 'neck') mesh.rotation.x = Math.PI / 2;
      node.add(mesh); this.accessoryMeshes.push(mesh);
    }
    this.group.scale.setScalar(1.08);
  }

  play(name: Clip, fade = 0.2, offset = 0) {
    if (this.clipName === name) return;
    const next = this.actions.get(name); if (!next) return;
    next.reset(); next.setLoop(THREE.LoopRepeat, Infinity); next.timeScale = 1;
    if (offset) next.time = offset * next.getClip().duration;
    next.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next; this.clipName = name;
  }

  /** City locomotion: idle, walk or run from ground speed (m/s). */
  animate(dt: number, speed: number) {
    if (!this.hold) {
      if (speed > 3) { this.play('Run', 0.15); if (this.current) this.current.timeScale = speed / 5.2; }
      else if (speed > 0.25) { this.play('Walk', 0.2); if (this.current) this.current.timeScale = Math.max(0.6, speed / 1.45); }
      else this.play('Idle', 0.25);
    } else this.play(this.hold, 0.2);
    this.mixer.update(dt);
  }
  update(dt: number) { this.mixer.update(dt); }
  dispose() { this.mixer.stopAllAction(); this.clearAccessories(); this.group.removeFromParent(); }
}

/** Wrestler: a humanoid in ngemb (used by arena and écurie scenes). */
export class Wrestler extends Humanoid {
  constructor(skin = 0x5b3420) { super(); this.setWrestler({ ngembColor: 'blanc', ngembPattern: 'uni', accessories: [] }, 'A', skin); }
  setLook(look: PersonLook | WrestlerLook, cut: 'A' | 'B' = 'A') {
    if ('ngembColor' in look) this.setWrestler(look, cut); else super.setLook(look);
  }
}
export const wrestlerReady = humanoidReady;

// ---------------------------------------------------------------- looks for the crowd and the cast
const SKINS = [0x3b2216, 0x4e2e1c, 0x5b3420, 0x6b3f25, 0x7a4a2c, 0x45291a];
const BOUBOU = [0xf2f2ec, 0x9cc8e8, 0x27407a, 0x6b3fa0, 0x1f7a44, 0xd9b44a, 0xe8e2d4, 0x7a1f3d];
const TEES = [0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0xf2f2ec, 0x222428, 0xe8742c, 0x7fb8d8];
const DRESS = [0xe58a2f, 0xc2417f, 0x1f7a44, 0x2f6fb3, 0xd9322b, 0x6b3fa0, 0xf4c20d];
const ACC = [0xf6e7c1, 0x1c1c1f, 0xf4c20d, 0xffffff, 0x2a8f6a];
const pickR = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];

export function randomLook(r: () => number): PersonLook {
  const skin = pickR(SKINS, r), u = r();
  const heavy = r() < 0.25 ? 0.4 + r() * 0.6 : 0;
  if (u < 0.36) return { skin, female: true, heavy, style: 'dress', top: pickR(DRESS, r), pattern: r() < 0.75 ? 'wax' : 'uni', accent: pickR(ACC, r), hat: r() < 0.65 ? 'headwrap' : null, shoes: 0x6b4a2e };
  if (u < 0.62) return { skin, heavy, style: 'boubou', top: pickR(BOUBOU, r), pattern: r() < 0.5 ? 'bazin' : 'uni', hat: r() < 0.5 ? 'kufi' : null, hatColor: r() < 0.6 ? 0xf2f2ec : 0x1c1c1f, shoes: 0x3a2a1e, beard: r() < 0.35 ? pickR([0xd8d4cc, 0x8a8580, 0x1a1414], r) : null };
  return { skin, muscular: r() < 0.3 ? r() : 0, beard: r() < 0.15 ? 0x1a1414 : null, style: 'tee', top: pickR(TEES, r), pattern: r() < 0.25 ? 'rayure' : 'uni', accent: 0xffffff, bottom: pickR([0x2b2f3a, 0x3d4a5c, 0x1c1c1f, 0x6b5a45], r), shoes: pickR([0xf2f2ec, 0x1c1c1f, 0x8a5a3a], r) };
}

/** Derive a look from the old box outfit (used for the cast until each has an authored look). */
export function lookFromOutfit(o: Outfit, female = false): PersonLook {
  if (female) return { skin: o.skin, female: true, style: 'dress', top: o.top, pattern: 'wax', accent: 0xf6e7c1, hat: 'headwrap', hatColor: o.hat ?? o.top };
  if (o.long) return { skin: o.skin, style: 'boubou', top: o.top, pattern: 'bazin', hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat, beard: o.hat !== undefined ? 0xd8d4cc : null, heavy: 0.4 };
  return { skin: o.skin, style: 'tee', top: o.top, bottom: o.bottom, hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat };
}
