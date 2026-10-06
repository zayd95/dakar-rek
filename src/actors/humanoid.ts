import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WrestlerLook } from '../core/types';
import { ACCESSORIES, ngembTexture, type Socket } from '../lamb/look';
import type { Outfit } from './character';

/**
 * Shared humanoid from Blender (public/assets/character_v2.glb, source assets-src/character_rig_v2.blend):
 * one skinned body on a 20-bone rig with clothing meshes (Tee, Trousers, Boubou, Dress, Kufi, Headwrap, Shoes),
 * two ngemb cuts and accessory sockets. Clips: Idle, Walk, Run, Talk, Sit, Stance, Grab, Fall_Back, Prep,
 * Dance_A, Dance_B, Celebrate, Entrance_Walk. Status: TEMP v2 (see docs/ASSET_REGISTER.md).
 */
export type Clip = 'Idle' | 'Walk' | 'Run' | 'Talk' | 'Sit' | 'Stance' | 'Grab' | 'Fall_Back' | 'Prep' | 'Dance_A' | 'Dance_B' | 'Celebrate' | 'Entrance_Walk';
export type Style = 'boubou' | 'tee' | 'dress';
export type Pattern = 'uni' | 'wax' | 'bazin' | 'rayure';
export interface PersonLook {
  skin: number; style: Style; top: number; bottom?: number; pattern?: Pattern; accent?: number;
  hat?: 'kufi' | 'headwrap' | null; hatColor?: number; shoes?: number; female?: boolean;
}

let template: { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null = null;
export const humanoidReady = () => !!template;

export async function preloadHumanoid(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    let buf: ArrayBuffer | null = null;
    const res = await fetch(`${base}assets/character_v2.glb`).catch(() => null);
    if (res?.ok) buf = await res.arrayBuffer();
    else {
      // Hosts that do not serve .glb (e.g. the claude.ai preview) get the same bytes as base64 JSON.
      const alt = await fetch(`${base}assets/character_v2.glb.json`).catch(() => null);
      if (!alt?.ok) return;
      const bin = atob(((await alt.json()) as { glb: string }).glb);
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf = u8.buffer;
    }
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    template = { scene: gltf.scene, clips: gltf.animations };
  } catch { /* box characters stay in use */ }
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
const CLOTH = ['Cloth_Tee', 'Cloth_Trousers', 'Cloth_Boubou', 'Cloth_Dress', 'Cloth_Kufi', 'Cloth_Headwrap', 'Cloth_Shoes', 'Ngemb_A', 'Ngemb_B'];

export class Humanoid {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private root: THREE.Object3D;
  private parts = new Map<string, THREE.Mesh>();
  private skinMat: THREE.MeshLambertMaterial;
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
      if (key) this.parts.set(key, m);
      else m.material = (m.material as THREE.Material).name === 'Hair' ? hair : this.skinMat;
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
    this.skinMat.color.set(l.skin);
    const vis = ['Cloth_Shoes'];
    const set = (k: string, mat: THREE.Material) => { const m = this.parts.get(k); if (m) m.material = mat; vis.push(k); };
    if (l.style === 'boubou') { set('Cloth_Boubou', clothMat(l.top, l.pattern, l.accent)); set('Cloth_Trousers', clothMat(l.bottom ?? l.top, l.pattern === 'bazin' ? 'bazin' : 'uni')); }
    if (l.style === 'tee') { set('Cloth_Tee', clothMat(l.top, l.pattern, l.accent)); set('Cloth_Trousers', clothMat(l.bottom ?? 0x2b2f3a)); }
    if (l.style === 'dress') set('Cloth_Dress', clothMat(l.top, l.pattern ?? 'wax', l.accent ?? 0xf6e7c1));
    if (l.hat === 'kufi') set('Cloth_Kufi', clothMat(l.hatColor ?? 0xf2f2ec));
    if (l.hat === 'headwrap') set('Cloth_Headwrap', clothMat(l.hatColor ?? l.top, l.pattern === 'wax' ? 'wax' : 'uni', l.accent ?? 0xf6e7c1));
    const shoes = this.parts.get('Cloth_Shoes'); if (shoes) shoes.material = clothMat(l.shoes ?? 0x3a2a1e);
    this.show(vis);
    this.group.scale.set(l.female ? 0.95 : 1, l.female ? 0.96 : 1, l.female ? 0.93 : 1);
  }

  /** Wrestling attire: ngemb (cut A short, B long with knot) and accessories on sockets. Cosmetic only. */
  setWrestler(look: WrestlerLook, cut: 'A' | 'B' = 'A', skin?: number) {
    if (skin !== undefined) this.skinMat.color.set(skin);
    const tex = ngembTexture(look.ngembColor, look.ngembPattern).clone();
    tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    const key = cut === 'A' ? 'Ngemb_A' : 'Ngemb_B';
    const m = this.parts.get(key); if (m) m.material = mat;
    this.show([key]);
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
  if (u < 0.36) return { skin, female: true, style: 'dress', top: pickR(DRESS, r), pattern: r() < 0.75 ? 'wax' : 'uni', accent: pickR(ACC, r), hat: r() < 0.7 ? 'headwrap' : null, shoes: 0x6b4a2e };
  if (u < 0.62) return { skin, style: 'boubou', top: pickR(BOUBOU, r), pattern: r() < 0.5 ? 'bazin' : 'uni', hat: r() < 0.5 ? 'kufi' : null, hatColor: r() < 0.6 ? 0xf2f2ec : 0x1c1c1f, shoes: 0x3a2a1e };
  return { skin, style: 'tee', top: pickR(TEES, r), pattern: r() < 0.25 ? 'rayure' : 'uni', accent: 0xffffff, bottom: pickR([0x2b2f3a, 0x3d4a5c, 0x1c1c1f, 0x6b5a45], r), shoes: pickR([0xf2f2ec, 0x1c1c1f, 0x8a5a3a], r) };
}

/** Derive a look from the old box outfit (used for the cast until each has an authored look). */
export function lookFromOutfit(o: Outfit, female = false): PersonLook {
  if (female) return { skin: o.skin, female: true, style: 'dress', top: o.top, pattern: 'wax', accent: 0xf6e7c1, hat: 'headwrap', hatColor: o.hat ?? o.top };
  if (o.long) return { skin: o.skin, style: 'boubou', top: o.top, pattern: 'bazin', hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat };
  return { skin: o.skin, style: 'tee', top: o.top, bottom: o.bottom, hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat };
}
