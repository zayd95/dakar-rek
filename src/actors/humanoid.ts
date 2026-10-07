import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WrestlerLook } from '../core/types';
import { ACCESSORIES, ngembTexture, type Socket } from '../lamb/look';
import type { Outfit } from './character';

/**
 * Shared humanoid from Blender (public/assets/character_v5.glb, source assets-src/character_rig_v5.blend):
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
  /** Body shape (morph targets from the Blender rig, 0–1). */
  heavy?: number; muscular?: number;
  hair?: 'short' | 'puff' | 'none'; beard?: number | null; // beard colour, null = none
}

let template: { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null = null;
export const humanoidReady = () => !!template;

export async function preloadHumanoid(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    let buf: ArrayBuffer | null = null;
    const res = await fetch(`${base}assets/character_v5.glb`).catch(() => null);
    if (res?.ok) buf = await res.arrayBuffer();
    else {
      // Hosts that do not serve .glb (e.g. the claude.ai preview) get the same bytes as base64 JSON.
      const alt = await fetch(`${base}assets/character_v5.glb.json`).catch(() => null);
      if (!alt?.ok) return;
      const bin = atob(((await alt.json()) as { glb: string }).glb);
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf = u8.buffer;
    }
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    template = { scene: gltf.scene, clips: gltf.animations };
  } catch { /* box characters stay in use */ }
}

// ---------------------------------------------------------------- garment textures (generic prints, own designs)
// Garment UVs from Blender: u = around the body (front centre at u = 0.5), v = height / 0.6 m.
// One canvas covers the whole garment (v scaled so 1 = 1.65 m), so trims and embroidery sit where they belong.
type Kind = 'boubou' | 'tee' | 'dress' | 'plain';
const texCache = new Map<string, THREE.Texture>();
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function shade(n: number, k: number) { const c = new THREE.Color(n).multiplyScalar(k); return '#' + c.getHexString(); }
function garmentTex(kind: Kind, base: number, accent: number, pattern: Pattern): THREE.Texture | null {
  if (kind === 'plain' && (pattern === 'uni' || pattern === 'bazin')) return null;
  const key = `${kind}/${base}/${accent}/${pattern}`;
  const hit = texCache.get(key); if (hit) return hit;
  const W = 512, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(base); g.fillRect(0, 0, W, H);
  const zy = (z: number) => (z / 1.65) * H;                      // canvas row for a height in metres
  if (pattern === 'wax') {                                       // bold circles, diamonds and stripes
    g.fillStyle = hex(accent); g.strokeStyle = hex(accent); g.lineWidth = 3;
    for (let y = 0; y < H; y += 40) for (let x = (y / 40) % 2 ? 24 : 0; x < W; x += 48) {
      g.beginPath(); g.arc(x + 10, y + 14, 9, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(x + 30, y + 4); g.lineTo(x + 38, y + 14); g.lineTo(x + 30, y + 24); g.lineTo(x + 22, y + 14); g.closePath(); g.stroke();
    }
    g.fillStyle = shade(base, 0.7); for (let y = 0; y < H; y += 40) g.fillRect(0, y + 32, W, 3);
  } else if (pattern === 'rayure') {
    g.fillStyle = hex(accent); for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 10, H);
  } else if (pattern === 'bazin') {                              // damask: tone-on-tone motifs
    g.strokeStyle = shade(base, 1.18); g.lineWidth = 2;
    for (let y = 10; y < H; y += 36) for (let x = (y / 36) % 2 ? 18 : 0; x < W; x += 36) {
      g.beginPath(); g.ellipse(x, y, 9, 13, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.stroke();
    }
  }
  const emb = pattern === 'bazin' || pattern === 'uni' ? (new THREE.Color(base).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? 0x8a6a2a : 0xe9cf7a) : accent;
  if (kind === 'boubou') {                                       // embroidery: collar, front panel, hem
    g.fillStyle = hex(emb); g.strokeStyle = hex(emb);
    g.fillRect(0, zy(1.54), W, zy(1.62) - zy(1.54));
    g.lineWidth = 3;
    const cx = W / 2;
    for (let k = 0; k < 7; k++) {                                // stacked chevrons down the chest
      const y0 = zy(1.52) - k * 16;
      g.beginPath(); g.moveTo(cx - 28, y0); g.lineTo(cx, y0 - 12); g.lineTo(cx + 28, y0); g.stroke();
      g.beginPath(); g.arc(cx, y0 - 20, 3, 0, Math.PI * 2); g.fill();
    }
    g.lineWidth = 2; g.strokeRect(cx - 34, zy(1.0), 68, zy(1.53) - zy(1.0));
    g.fillRect(0, zy(0.16), W, 5); g.fillRect(0, zy(0.2), W, 2);
  } else if (kind === 'tee') {                                   // ribbed collar and a chest band
    g.fillStyle = hex(accent === base ? 0xf2f2ec : accent);
    g.fillRect(0, zy(1.55), W, H - zy(1.55));
  } else if (kind === 'dress') {
    g.fillStyle = hex(emb); g.fillRect(0, zy(1.53), W, H - zy(1.53));
    g.fillRect(0, zy(0.98), W, 6);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1, 0.6 / 1.65); t.flipY = false; t.anisotropy = 4; texCache.set(key, t); return t;
}
function clothMat(color: number, pattern: Pattern = 'uni', accent = 0xffffff, kind: Kind = 'plain'): THREE.Material {
  // Double-sided like the Blender materials: some cloth faces point inward and would otherwise vanish.
  const map = garmentTex(kind, color, accent, pattern);
  const rough = pattern === 'bazin' ? 0.5 : 0.92;               // bazin keeps a soft sheen
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, map, roughness: rough, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
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
  private skinMat: THREE.MeshStandardMaterial;
  private lipsMat = new THREE.MeshStandardMaterial({ color: 0x3a1a12, roughness: 0.45, vertexColors: true });
  private beardMat = new THREE.MeshLambertMaterial({ color: 0x1a1414, vertexColors: true });
  private morphed: THREE.Mesh[] = [];
  private accessoryMeshes: THREE.Object3D[] = [];
  clipName: Clip | null = null;
  /** When set, city movement does not change the clip (emotes, talking, sitting). */
  hold: Clip | null = null;

  constructor(look?: PersonLook) {
    if (!template) throw new Error('character asset not loaded');
    this.root = cloneSkinned(template.scene);
    this.group.add(this.root); this.group.name = 'humanoid_v2';
    // Skin: a little specular so dark skin keeps its form; baked ambient occlusion comes in as vertex colour.
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0x5b3420, roughness: 0.52, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
    const hair = new THREE.MeshStandardMaterial({ color: 0x141011, roughness: 0.85, vertexColors: true, side: THREE.DoubleSide });
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
      else m.material = new THREE.MeshStandardMaterial({ color: src.color, roughness: 0.25, vertexColors: true });   // eyes: wet highlight
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
    if (l.style === 'boubou') { set('Cloth_Boubou', clothMat(l.top, l.pattern ?? 'bazin', l.accent ?? 0xe9cf7a, 'boubou')); set('Cloth_Trousers', clothMat(l.bottom ?? l.top, l.pattern === 'bazin' ? 'bazin' : 'uni')); }
    if (l.style === 'tee') { set('Cloth_Tee', clothMat(l.top, l.pattern, l.accent ?? l.top, 'tee')); set('Cloth_Trousers', clothMat(l.bottom ?? 0x2b2f3a)); }
    if (l.style === 'dress') { const dm = clothMat(l.top, l.pattern ?? 'wax', l.accent ?? 0xf6e7c1, 'dress'); set('Cloth_DressTop', dm); set('Cloth_Skirt', dm); }
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
    const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide });
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
