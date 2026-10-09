import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WrestlerLook } from '../core/types';
import { ACCESSORIES, ngembTexture, type Socket } from '../lamb/look';
import type { Outfit } from './character';

/**
 * Shared humanoid v6 (public/assets/character_v6.glb; source people_mpfb_v1.blend on Habib's Mac, generator scripts in
 * assets-src/people_v6/). Body: MakeHuman/MPFB2 (CC0 system assets) as the 1.6k-vertex "male1591" proxy on the 31-bone CMU rig,
 * textured (public/assets/tex/skin_v6.jpg is the young African male skin normalised to mid-grey so any skin tone can tint it).
 * Garments and hair are generated around the body (same UV convention as v5). Body shapes are morph targets plus bone offsets:
 * Female, Heavy, Muscular, Old and female variants HeavyF, MuscularF, OldF; Blink on the eyelids and lashes.
 * Clips: CMU motion capture retargeted (Walk, Run, Idle, Talk, Phone, Sit, Eat, Wave) and the v5 wrestling clips retargeted
 * (Stance, Grab, Fall_Back, Prep, Dance_A, Dance_B, Celebrate, Entrance_Walk). Status: TEMP v6 (see docs/ASSET_REGISTER.md).
 */
export type Clip = 'Idle' | 'Walk' | 'Run' | 'Talk' | 'Sit' | 'Stance' | 'Grab' | 'Fall_Back' | 'Prep' | 'Dance_A' | 'Dance_B' | 'Celebrate' | 'Entrance_Walk' | 'Phone' | 'Wave' | 'Eat';
export type Style = 'boubou' | 'tee' | 'dress';
export type Pattern = 'uni' | 'wax' | 'bazin' | 'rayure';
export interface PersonLook {
  skin: number; style: Style; top: number; bottom?: number; pattern?: Pattern; accent?: number;
  hat?: 'kufi' | 'headwrap' | null; hatColor?: number; shoes?: number; female?: boolean;
  /** Body shape (morph targets + bone offsets from the Blender rig, 0–1). */
  heavy?: number; muscular?: number; old?: number;
  hair?: 'short' | 'puff' | 'braids' | 'locs' | 'none'; beard?: number | null; // beard colour, null = none
}

type Deltas = Record<string, Record<string, [number, number, number]>>;
type TexKey = 'skin' | 'eye' | 'brows' | 'lashes' | 'hair';
interface Template {
  scene: THREE.Object3D; clips: THREE.AnimationClip[]; deltas: Deltas; tex: Partial<Record<TexKey, THREE.Texture>>;
  /** Rest local position of each bone and the inverse rotation of its parent in model space (for body-shape bone offsets). */
  rest: Map<string, { pos: THREE.Vector3; parentInv: THREE.Matrix3; parent: string | null }>;
}
let template: Template | null = null;
export const humanoidReady = () => !!template;

/** Fine dark grain for hair caps and beards (u around the head, v = height / 0.6 m). */
function hairTexture(): THREE.Texture {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!; g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, S, S);
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) { const v = 60 + Math.floor(r() * 150); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 2.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function preloadHumanoid(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    let buf: ArrayBuffer | null = null;
    const res = await fetch(`${base}assets/character_v6.glb`).catch(() => null);
    if (res?.ok) buf = await res.arrayBuffer();
    else {
      // Hosts that do not serve .glb (e.g. the claude.ai preview) get the same bytes as base64 JSON.
      const alt = await fetch(`${base}assets/character_v6.glb.json`).catch(() => null);
      if (!alt?.ok) return;
      const bin = atob(((await alt.json()) as { glb: string }).glb);
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf = u8.buffer;
    }
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    const tl = new THREE.TextureLoader();
    const load = (f: string) => tl.loadAsync(`${base}assets/tex/${f}`).then(t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(() => undefined);
    const [skin, eye, brows, lashes] = await Promise.all([load('skin_v6.jpg'), load('eye_v6.jpg'), load('brows_v6.png'), load('lashes_v6.png')]);
    // Bones keep their rest positions (body shapes move them); only rotations and the hips position are animated.
    for (const c of gltf.animations) c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'Hips.position');
    let deltas: Deltas = {};
    gltf.scene.traverse(o => { const mb = o.userData?.morph_bones; if (typeof mb === 'string') deltas = JSON.parse(mb) as Deltas; });
    gltf.scene.updateMatrixWorld(true);
    const rest: Template['rest'] = new Map();
    gltf.scene.traverse(o => {
      if (!(o as THREE.Bone).isBone) return;
      const p = o.parent!;
      rest.set(o.name, { pos: o.position.clone(), parentInv: new THREE.Matrix3().setFromMatrix4(p.matrixWorld).invert(), parent: (p as THREE.Bone).isBone ? p.name : null });
    });
    template = { scene: gltf.scene, clips: gltf.animations, deltas, tex: { skin, eye, brows, lashes, hair: hairTexture() }, rest };
  } catch (e) { console.warn('character_v6 not loaded', e); /* box characters stay in use */ }
}

// ---------------------------------------------------------------- garment textures (generic prints, own designs)
// Garment UVs from Blender: u = around the body (front centre at u = 0.5), v = height / 0.6 m (glTF flips it to 1 - v).
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
    g.fillRect(0, zy(1.565), W, zy(1.64) - zy(1.565));
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
    g.fillRect(0, zy(1.58), W, H - zy(1.58));
  } else if (kind === 'dress') {
    g.fillStyle = hex(emb); g.fillRect(0, zy(1.565), W, H - zy(1.565));
    g.fillRect(0, zy(0.98), W, 6);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1, -0.6 / 1.65); t.offset.set(0, 0.6 / 1.65); t.flipY = false; /* glTF stores v as 1 - v */ t.anisotropy = 4; texCache.set(key, t); return t;
}
function clothMat(color: number, pattern: Pattern = 'uni', accent = 0xffffff, kind: Kind = 'plain'): THREE.Material {
  // Double-sided like the Blender materials: some cloth faces point inward and would otherwise vanish.
  const map = garmentTex(kind, color, accent, pattern);
  const rough = pattern === 'bazin' ? 0.5 : 0.92;               // bazin keeps a soft sheen
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, map, roughness: rough, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
}

const SOCKET_NODE: Record<Socket, string> = { armL: 'socket_armL', armR: 'socket_armR', waist: 'socket_waist', neck: 'socket_neck' };
const CLOTH = ['Cloth_Tee', 'Cloth_Trousers', 'Cloth_Shorts', 'Cloth_Boubou', 'Cloth_DressTop', 'Cloth_Skirt', 'Cloth_Kufi', 'Cloth_Headwrap', 'Cloth_Shoes', 'Ngemb_A', 'Ngemb_B', 'Hair_Short', 'Hair_Puff', 'Hair_Braids', 'Hair_Locs', 'Beard'];
const SHAPES = ['Female', 'Heavy', 'HeavyF', 'Muscular', 'MuscularF', 'Old', 'OldF'] as const;
type ShapeW = Record<(typeof SHAPES)[number], number>;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Humanoid {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private root: THREE.Object3D;
  private parts = new Map<string, THREE.Mesh>();
  private skinMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  private beardMat: THREE.MeshStandardMaterial;
  private morphed: THREE.Mesh[] = [];
  private bones = new Map<string, THREE.Bone>();
  private skeleton?: THREE.Skeleton; private baseInverses: THREE.Matrix4[] = [];
  private hipsOffset = new THREE.Vector3();
  private accessoryMeshes: THREE.Object3D[] = [];
  clipName: Clip | null = null;
  /** When set, city movement does not change the clip (emotes, talking, sitting). */
  hold: Clip | null = null;

  constructor(look?: PersonLook) {
    if (!template) throw new Error('character asset not loaded');
    const T = template;
    this.root = cloneSkinned(T.scene);
    this.group.add(this.root); this.group.name = 'humanoid_v6';
    this.skinMat = new THREE.MeshStandardMaterial({ map: T.tex.skin ?? null, color: 0x5b3420, roughness: 0.55, metalness: 0, vertexColors: true });
    const eyes = new THREE.MeshStandardMaterial({ map: T.tex.eye ?? null, color: 0xa39a94, roughness: 0.12 });
    const brows = new THREE.MeshStandardMaterial({ map: T.tex.brows ?? null, color: 0x2a2220, alphaTest: 0.35, roughness: 0.9, side: THREE.DoubleSide });
    const lashes = new THREE.MeshStandardMaterial({ map: T.tex.lashes ?? null, color: 0x1a1414, alphaTest: 0.3, roughness: 0.9, side: THREE.DoubleSide });
    this.hairMat = new THREE.MeshStandardMaterial({ map: T.tex.hair ?? null, color: 0x2a2224, roughness: 0.8, side: THREE.DoubleSide, vertexColors: true });
    this.beardMat = new THREE.MeshStandardMaterial({ map: T.tex.hair ?? null, color: 0x2a2224, roughness: 0.85, side: THREE.DoubleSide, vertexColors: true });
    this.root.traverse(o => {
      if ((o as THREE.Bone).isBone) { this.bones.set(o.name, o as THREE.Bone); return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      if (m.morphTargetDictionary) this.morphed.push(m);
      const sk = m as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) {
        // One skeleton per person shared by every mesh (all use the same glTF skin), with its own copy of the bind
        // matrices because body shapes move the joints.
        if (!this.skeleton) {
          this.baseInverses = sk.skeleton.boneInverses.map(b => b.clone());
          this.skeleton = new THREE.Skeleton(sk.skeleton.bones, this.baseInverses.map(b => b.clone()));
        }
        sk.bind(this.skeleton, sk.bindMatrix);
      }
      const key = CLOTH.find(n => m.name === n || m.name.startsWith(n + '_'));
      if (key) { this.parts.set(key, m); m.material = key === 'Beard' ? this.beardMat : key.startsWith('Hair_') ? this.hairMat : m.material; }
      else if (m.name.startsWith('Body')) m.material = this.skinMat;
      else if (m.name.startsWith('Eyes')) m.material = eyes;
      else if (m.name.startsWith('Brows')) m.material = brows;
      else if (m.name.startsWith('Lashes')) m.material = lashes;
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const c of T.clips) this.actions.set(c.name, this.mixer.clipAction(c));
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
    if (hair !== 'none' && (!l.hat || hair === 'braids')) vis.push(({ puff: 'Hair_Puff', braids: 'Hair_Braids', locs: 'Hair_Locs', short: 'Hair_Short' } as const)[hair]);
    if (l.beard != null) { vis.push('Beard'); this.beardMat.color.set(l.beard).multiplyScalar(1.6); }
    this.hairMat.color.set((l.old ?? 0) > 0.6 ? 0x9a948c : 0x1c1617).multiplyScalar(1.6);
    this.setShape(l.female ? 1 : 0, l.muscular ?? 0, l.heavy ?? 0, l.old ?? 0);
    const set = (k: string, mat: THREE.Material) => { const m = this.parts.get(k); if (m) m.material = mat; vis.push(k); };
    if (l.style === 'boubou') { set('Cloth_Boubou', clothMat(l.top, l.pattern ?? 'bazin', l.accent ?? 0xe9cf7a, 'boubou')); set('Cloth_Trousers', clothMat(l.bottom ?? l.top, l.pattern === 'bazin' ? 'bazin' : 'uni')); }
    if (l.style === 'tee') { set('Cloth_Tee', clothMat(l.top, l.pattern, l.accent ?? l.top, 'tee')); set('Cloth_Trousers', clothMat(l.bottom ?? 0x2b2f3a)); }
    if (l.style === 'dress') { const dm = clothMat(l.top, l.pattern ?? 'wax', l.accent ?? 0xf6e7c1, 'dress'); set('Cloth_DressTop', dm); set('Cloth_Skirt', dm); }
    if (l.hat === 'kufi') set('Cloth_Kufi', clothMat(l.hatColor ?? 0xf2f2ec));
    if (l.hat === 'headwrap') set('Cloth_Headwrap', clothMat(l.hatColor ?? l.top, l.pattern === 'wax' ? 'wax' : 'uni', l.accent ?? 0xf6e7c1));
    const shoes = this.parts.get('Cloth_Shoes'); if (shoes) shoes.material = clothMat(l.shoes ?? 0x3a2a1e);
    this.show(vis);
    this.group.scale.setScalar(1);
  }

  /** Body shape: morph targets on the body and every garment, plus the matching joint offsets. 0–1 each. */
  setShape(female: number, muscular: number, heavy: number, old = 0) {
    const w: ShapeW = { Female: female, Heavy: heavy * (1 - female), HeavyF: heavy * female, Muscular: muscular * (1 - female), MuscularF: muscular * female, Old: old * (1 - female), OldF: old * female };
    for (const m of this.morphed) {
      const d = m.morphTargetDictionary!, inf = m.morphTargetInfluences!;
      for (const k of SHAPES) if (d[k] !== undefined) inf[d[k]] = w[k];
    }
    this.shapeBones(w);
  }
  /** Moves each joint by the weighted offsets (model space) and rebinds, so the shaped mesh deforms around its own joints. */
  private shapeBones(w: ShapeW) {
    const T = template!; const off = new Map<string, THREE.Vector3>();
    for (const k of SHAPES) {
      const d = T.deltas[k]; if (!d || !w[k]) continue;
      for (const b in d) { const v = off.get(b) ?? new THREE.Vector3(); v.x += d[b][0] * w[k]; v.y += d[b][1] * w[k]; v.z += d[b][2] * w[k]; off.set(b, v); }
    }
    const zero = new THREE.Vector3();
    for (const [name, bone] of this.bones) {
      const r = T.rest.get(name); if (!r) continue;
      const own = off.get(name) ?? zero, par = (r.parent && off.get(r.parent)) || zero;
      _v.copy(own).sub(par).applyMatrix3(r.parentInv);
      bone.position.copy(r.pos).add(_v);
      if (name === 'Hips') this.hipsOffset.copy(_v);
    }
    const sk = this.skeleton;
    if (sk) sk.bones.forEach((b, i) => { const o = off.get(b.name); sk.boneInverses[i].copy(this.baseInverses[i]); if (o) sk.boneInverses[i].multiply(_m.makeTranslation(-o.x, -o.y, -o.z)); });
  }
  private setSkin(c: number) { this.skinMat.color.set(c).multiplyScalar(2); }

  /** Wrestling attire: ngemb (cut A short, B long with knot) and accessories on sockets. Cosmetic only. */
  setWrestler(look: WrestlerLook, cut: 'A' | 'B' = 'A', skin?: number) {
    if (skin !== undefined) this.setSkin(skin);
    const tex = ngembTexture(look.ngembColor, look.ngembPattern).clone();
    tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, vertexColors: true });
    const key = cut === 'A' ? 'Ngemb_A' : 'Ngemb_B';
    const m = this.parts.get(key); if (m) m.material = mat;
    this.show([key, 'Hair_Short']);
    this.hairMat.color.set(0x1c1617).multiplyScalar(1.6);
    this.setShape(0, 1, 0);
    this.clearAccessories();
    for (const id of look.accessories) {
      const a = ACCESSORIES.find(x => x.id === id); if (!a) continue;
      const node = this.root.getObjectByName(SOCKET_NODE[a.socket]); if (!node) continue;
      const g = a.socket === 'waist' ? new THREE.CylinderGeometry(0.185, 0.185, 0.04, 16, 1, true) : a.socket === 'neck' ? new THREE.TorusGeometry(0.09, 0.016, 6, 12) : new THREE.CylinderGeometry(0.056, 0.056, 0.05, 12, 1, true);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: a.color, side: THREE.DoubleSide }));
      if (a.socket === 'neck') mesh.rotation.x = Math.PI / 2;
      node.add(mesh); this.accessoryMeshes.push(mesh);
    }
    this.group.scale.setScalar(1.04);
  }

  private phoneMesh?: THREE.Mesh;
  play(name: Clip, fade = 0.2, offset = 0) {
    if (this.clipName === name) return;
    if (name === 'Phone' || this.phoneMesh) {
      if (!this.phoneMesh) {
        // the Phone capture holds the phone to the left ear
        const hand = this.bones.get('LeftHand');
        this.phoneMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.01), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.3 }));
        this.phoneMesh.position.set(0, 0.06, 0.02); hand?.add(this.phoneMesh);
      }
      this.phoneMesh.visible = name === 'Phone';
    }
    const next = this.actions.get(name); if (!next) return;
    next.reset(); next.setLoop(THREE.LoopRepeat, Infinity); next.timeScale = 1;
    if (offset) next.time = offset * next.getClip().duration;
    next.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next; this.clipName = name;
  }

  private tick(dt: number) {
    this.mixer.update(dt);
    const hips = this.bones.get('Hips'); if (hips && this.hipsOffset.lengthSq() > 0) hips.position.add(this.hipsOffset);
    this.applyLook(dt);
    this.blink(dt);
  }
  /** City locomotion: idle, walk or run from ground speed (m/s). */
  animate(dt: number, speed: number) {
    if (!this.hold) {
      if (speed > 3) { this.play('Run', 0.15); if (this.current) this.current.timeScale = speed / 5.2; }
      else if (speed > 0.25) { this.play('Walk', 0.2); if (this.current) this.current.timeScale = Math.max(0.6, speed / 1.35); }
      else this.play('Idle', 0.25);
    } else this.play(this.hold, 0.2);
    this.tick(dt);
  }
  /** Blink every 2–6 s (0.15 s close-open), using the Blink morph target on the eyelids and lashes. */
  private blinkT = 1 + Math.random() * 4; private blinkMeshes?: THREE.Mesh[];
  private blink(dt: number) {
    this.blinkMeshes ??= this.morphed.filter(m => m.morphTargetDictionary?.Blink !== undefined);
    if (!this.blinkMeshes.length) return;
    this.blinkT -= dt;
    const t = this.blinkT < 0 ? -this.blinkT : 0, v = t > 0 ? Math.max(0, 1 - Math.abs(t - 0.075) / 0.075) : 0;
    for (const m of this.blinkMeshes) m.morphTargetInfluences![m.morphTargetDictionary!.Blink] = v;
    if (t > 0.15) this.blinkT = 2 + Math.random() * 4;
  }
  update(dt: number) { this.tick(dt); }

  /** World point the head turns toward (neck + head share the turn), or null. Limited to ±70° yaw, ±25° pitch. */
  lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0; private lookPitch = 0;
  private static tmpV = new THREE.Vector3(); private static tmpQ = new THREE.Quaternion(); private static axisY = new THREE.Vector3(0, 1, 0); private static axisX = new THREE.Vector3(1, 0, 0);
  private applyLook(dt: number) {
    const head = this.bones.get('Head'), neck = this.bones.get('Neck1');
    let ty = 0, tp = 0;
    if (this.lookTarget && head) {
      const v = Humanoid.tmpV.copy(this.lookTarget); this.group.worldToLocal(v);
      const hy = 1.62 * (this.group.scale.y || 1);
      ty = THREE.MathUtils.clamp(Math.atan2(v.x, v.z), -1.2, 1.2);
      tp = THREE.MathUtils.clamp(Math.atan2(v.y - hy, Math.hypot(v.x, v.z)), -0.45, 0.4);
      if (Math.abs(Math.atan2(v.x, v.z)) > 1.9) { ty = 0; tp = 0; }          // behind: don't twist
    }
    const k = Math.min(1, dt * 4);
    this.lookYaw += (ty - this.lookYaw) * k; this.lookPitch += (tp - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) < 1e-3 && Math.abs(this.lookPitch) < 1e-3) return;
    // bones' local Y runs along the bone (up the neck): yaw = turn about local Y, pitch = about local X
    for (const [b, f] of [[neck, 0.4], [head, 0.6]] as const) {
      if (!b) continue;
      b.quaternion.multiply(Humanoid.tmpQ.setFromAxisAngle(Humanoid.axisY, this.lookYaw * f));
      b.quaternion.multiply(Humanoid.tmpQ.setFromAxisAngle(Humanoid.axisX, -this.lookPitch * f));
    }
  }
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
  if (u < 0.36) return { skin, female: true, heavy, old: r() < 0.15 ? 0.4 + r() * 0.5 : 0, hair: r() < 0.45 ? 'braids' : 'puff', style: 'dress', top: pickR(DRESS, r), pattern: r() < 0.75 ? 'wax' : 'uni', accent: pickR(ACC, r), hat: r() < 0.65 ? 'headwrap' : null, shoes: 0x6b4a2e };
  if (u < 0.62) {
    const beard = r() < 0.35 ? pickR([0xd8d4cc, 0x8a8580, 0x1a1414], r) : null;
    return { skin, heavy, old: beard !== null && beard !== 0x1a1414 ? 0.5 + r() * 0.5 : 0, style: 'boubou', top: pickR(BOUBOU, r), pattern: r() < 0.5 ? 'bazin' : 'uni', hat: r() < 0.5 ? 'kufi' : null, hatColor: r() < 0.6 ? 0xf2f2ec : 0x1c1c1f, shoes: 0x3a2a1e, beard };
  }
  return { skin, hair: r() < 0.18 ? 'locs' : 'short', muscular: r() < 0.3 ? r() : 0, beard: r() < 0.15 ? 0x1a1414 : null, style: 'tee', top: pickR(TEES, r), pattern: r() < 0.25 ? 'rayure' : 'uni', accent: 0xffffff, bottom: pickR([0x2b2f3a, 0x3d4a5c, 0x1c1c1f, 0x6b5a45], r), shoes: pickR([0xf2f2ec, 0x1c1c1f, 0x8a5a3a], r) };
}

/** Derive a look from the old box outfit (used for the cast until each has an authored look). */
export function lookFromOutfit(o: Outfit, female = false): PersonLook {
  if (female) return { skin: o.skin, female: true, style: 'dress', top: o.top, pattern: 'wax', accent: 0xf6e7c1, hat: 'headwrap', hatColor: o.hat ?? o.top };
  if (o.long) return { skin: o.skin, style: 'boubou', top: o.top, pattern: 'bazin', hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat, beard: o.hat !== undefined ? 0xd8d4cc : null, heavy: 0.4 };
  return { skin: o.skin, style: 'tee', top: o.top, bottom: o.bottom, hat: o.hat !== undefined ? 'kufi' : null, hatColor: o.hat };
}
