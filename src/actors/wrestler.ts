import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WrestlerLook } from '../core/types';
import { ACCESSORIES, ngembTexture, type Socket } from '../lamb/look';

/**
 * Wrestling-compatible character from Blender (public/assets/wrestler_v1.glb, source assets-src/wrestler_rig_v1.blend).
 * One skinned body + two ngemb cuts (A short, B long with knot) + socket nodes for accessories, and clips:
 * Idle, Walk, Stance, Grab, Fall_Back, Prep, Dance_A, Dance_B, Celebrate, Entrance_Walk.
 * Dance, prep and entrance clips are PROVISIONAL placeholder motions awaiting review. Status: TEMP v1.
 */
export type Clip = 'Idle' | 'Walk' | 'Stance' | 'Grab' | 'Fall_Back' | 'Prep' | 'Dance_A' | 'Dance_B' | 'Celebrate' | 'Entrance_Walk';

let template: { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null = null;
export const wrestlerReady = () => !!template;

export async function preloadWrestler(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    let buf: ArrayBuffer | null = null;
    const res = await fetch(`${base}assets/wrestler_v1.glb`).catch(() => null);
    if (res?.ok) buf = await res.arrayBuffer();
    else {
      // Hosts that do not serve .glb (e.g. the claude.ai preview) get the same bytes as base64 JSON.
      const alt = await fetch(`${base}assets/wrestler_v1.glb.json`).catch(() => null);
      if (!alt?.ok) return;
      const b64 = (await alt.json() as { glb: string }).glb;
      const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf = u8.buffer;
    }
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    template = { scene: gltf.scene, clips: gltf.animations };
  } catch { /* the box character stays in use */ }
}

const SOCKET_NODE: Record<Socket, string> = { armL: 'socket_armL', armR: 'socket_armR', waist: 'socket_waist', neck: 'socket_neck' };

export class Wrestler {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private root: THREE.Object3D;
  private ngembA: THREE.Mesh | null = null; private ngembB: THREE.Mesh | null = null;
  private accessoryMeshes: THREE.Object3D[] = [];
  clipName: Clip | null = null;

  constructor(skin = 0x5b3420) {
    if (!template) throw new Error('wrestler asset not loaded');
    this.root = cloneSkinned(template.scene);
    this.group.add(this.root); this.group.name = 'wrestler_v1';
    this.group.scale.setScalar(1.1); // wrestlers read slightly larger than the city crowd
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    this.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      if (m.name.startsWith('Ngemb_A')) this.ngembA = m;
      else if (m.name.startsWith('Ngemb_B')) this.ngembB = m;
      else m.material = src.name === 'Skin' ? skinMat : new THREE.MeshLambertMaterial({ color: src.color });
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const c of template.clips) this.actions.set(c.name, this.mixer.clipAction(c));
  }

  setLook(look: WrestlerLook, cut: 'A' | 'B' = 'A') {
    const tex = ngembTexture(look.ngembColor, look.ngembPattern).clone();
    tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    for (const [m, on] of [[this.ngembA, cut === 'A'], [this.ngembB, cut === 'B']] as const) if (m) { m.material = mat; m.visible = on; }
    for (const a of this.accessoryMeshes) a.removeFromParent();
    this.accessoryMeshes = [];
    for (const id of look.accessories) {
      const a = ACCESSORIES.find(x => x.id === id); if (!a) continue;
      const node = this.root.getObjectByName(SOCKET_NODE[a.socket]); if (!node) continue;
      const g = a.socket === 'waist' ? new THREE.CylinderGeometry(0.23, 0.23, 0.05, 12) : a.socket === 'neck' ? new THREE.TorusGeometry(0.1, 0.018, 6, 12) : new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: a.color }));
      if (a.socket === 'neck') mesh.rotation.x = Math.PI / 2;
      node.add(mesh); this.accessoryMeshes.push(mesh);
    }
  }

  play(name: Clip, fade = 0.2, once = false) {
    if (this.clipName === name) return;
    const next = this.actions.get(name); if (!next) return;
    next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = once;
    next.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next; this.clipName = name;
  }

  update(dt: number) { this.mixer.update(dt); }
  clipNames() { return [...this.actions.keys()]; }
  dispose() { this.mixer.stopAllAction(); this.group.removeFromParent(); }
}
