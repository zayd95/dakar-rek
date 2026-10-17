import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Avatar } from '../core/types';

/**
 * City players generated with Meshy (text-to-3D, then remesh to ~12k triangles and auto-rig), source files in
 * assets-src/meshy_output, optimised to public/assets/city_player_{meshy,femme}.glb (1024 px base colour, 24-bone skeleton).
 * Clips: Idle (rest pose), Walk (1.07 s loop), Run (0.67 s loop). The Meshy rig has no finger bones, so Walk and Run were
 * rebaked with the forearms and hands twisted 75 degrees so the open palms face the thighs. Status: TEMP, not reviewed.
 */
export type CityClip = 'Idle' | 'Walk' | 'Run';

const HEIGHT = 1.85; // metres, close to the box character so collisions and camera framing stay the same
const WALK_REF = 1.5, RUN_REF = 4.6; // m/s the stock clips look right at

const FILES: Record<Avatar, { file: string; height: number }> = {
  homme: { file: 'city_player_meshy.glb', height: HEIGHT },
  femme: { file: 'city_player_femme.glb', height: 1.75 },
};
type Template = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number };
const templates: Partial<Record<Avatar, Template>> = {};
export const cityPlayerReady = (a: Avatar) => !!templates[a];

export async function preloadCityPlayer(base = import.meta.env.BASE_URL): Promise<void> {
  await Promise.all((Object.keys(FILES) as Avatar[]).map(async a => {
    try {
      const res = await fetch(`${base}assets/${FILES[a].file}`).catch(() => null);
      if (!res?.ok) return;
      const gltf = await new GLTFLoader().parseAsync(await res.arrayBuffer(), '');
      gltf.scene.updateMatrixWorld(true);
      const h = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
      templates[a] = { scene: gltf.scene, clips: gltf.animations, scale: h > 0 ? FILES[a].height / h : 1 };
    } catch { /* the box character stays in use */ }
  }));
}

export class CityPlayer {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<CityClip, THREE.AnimationAction>();
  private current: CityClip | null = null;

  constructor(readonly avatar: Avatar) {
    const template = templates[avatar];
    if (!template) throw new Error('city player asset not loaded');
    const root = cloneSkinned(template.scene);
    root.scale.multiplyScalar(template.scale);
    this.group.add(root); this.group.name = 'city_player_meshy';
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      m.material = new THREE.MeshLambertMaterial({ map: src.map });
    });
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of template.clips) if (c.name === 'Idle' || c.name === 'Walk' || c.name === 'Run') this.actions.set(c.name, this.mixer.clipAction(c));
    this.play('Idle');
  }

  /** speed in m/s picks the clip and its playback rate. */
  update(dt: number, speed: number) {
    const clip: CityClip = speed < 0.3 ? 'Idle' : speed < 3.2 ? 'Walk' : 'Run';
    this.play(clip);
    const a = this.actions.get(clip);
    if (a && clip !== 'Idle') a.timeScale = speed / (clip === 'Walk' ? WALK_REF : RUN_REF);
    this.mixer.update(dt);
  }

  private play(name: CityClip) {
    if (this.current === name) return;
    const next = this.actions.get(name); if (!next) return;
    next.reset().fadeIn(0.15).play();
    if (this.current) this.actions.get(this.current)?.fadeOut(0.15);
    this.current = name;
  }

  clipName() { return this.current; }
}
