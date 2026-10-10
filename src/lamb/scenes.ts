import * as THREE from 'three';
import { Character, NPC_OUTFITS, type Pose } from '../actors/character';
import type { WrestlerLook } from '../core/types';
import { celebrate, crowdCheer, crowdIdle, danceA, danceB, drill, drum, prep } from './poses';
import { Percussion, crowdCheer as cheerSound } from './audio';
import { castById } from '../social/cast';
import { Humanoid, Wrestler, wrestlerReady, randomLook, lookFromOutfit, type Clip } from '../actors/humanoid';
import { rng } from '../core/rng';
import { inGate, tierRadius, tierTop, TIERS } from '../world/geew';

const CLIP_FOR = new Map<Pose, Clip>([[danceA, 'Dance_A'], [danceB, 'Dance_B'], [prep, 'Prep'], [drill, 'Stance'], [celebrate, 'Celebrate'], [crowdCheer, 'Celebrate'], [crowdIdle, 'Idle'], [drum, 'Talk']]);

/**
 * Arena and écurie scenes. Three distinct kinds — Entraînement (training), Entrée (entrance) and Combat —
 * so the player always knows which one they are in. Combat is not built yet (rule set unresolved).
 * Every gesture, step and rhythm here is a PROVISIONAL PLACEHOLDER awaiting review.
 */
export type SceneKind = 'training' | 'entrance' | 'prep' | 'celebration' | 'watch';
export const SCENE_LABEL: Record<SceneKind, string> = {
  training: 'Entraînement · écurie', entrance: 'Entrée dans l’arène', prep: 'Préparation', celebration: 'Fête de l’écurie', watch: 'Tribunes',
};

interface Extra { w?: Humanoid; walking?: boolean; crowd?: boolean; c: Character; pose: Pose | null; from?: THREE.Vector3; to?: THREE.Vector3; t0?: number; t1?: number; yaw?: number }

export interface SceneFrame { cam: THREE.Vector3; look: THREE.Vector3 }

export class LambScene {
  readonly group = new THREE.Group();
  t = 0;
  readonly duration: number;
  onDone?: () => void;
  /** Set when the camera should jump instead of easing (scene start, debug time jumps). */
  snap = true;
  private extras: Extra[] = [];
  /** Debug/checks: where the spectators stand, relative to the scene origin (radius, height, angle). */
  crowdSpots() { return this.extras.filter(e => e.crowd).map(e => { const p = e.c.group.position; return { r: Math.hypot(p.x - this.o.x, p.z - this.o.z), y: p.y, a: Math.atan2(p.x - this.o.x, p.z - this.o.z) }; }); }
  private drums = new Percussion();
  private cheered = new Set<number>();
  private o: THREE.Vector3;
  /** Blender wrestler standing in for the player during the scene (when the asset is loaded). */
  private pw: Wrestler | null = null;

  constructor(readonly kind: SceneKind, private player: Character, origin: { x: number; z: number }, look: WrestlerLook, private crowdSize: number) {
    this.o = new THREE.Vector3(origin.x, 0.1, origin.z);
    this.duration = { training: 7, entrance: 15, prep: 7, celebration: 8, watch: 8 }[kind];
    const inArena = kind === 'entrance' || kind === 'prep' || kind === 'watch';
    if (kind !== 'watch') {
      player.setWrestler(look);
      if (wrestlerReady()) { this.pw = new Wrestler(0x6b3f25); this.pw.setLook(look, look.ngembPattern === 'bordure' ? 'B' : 'A'); this.group.add(this.pw.group); player.group.visible = false; }
    }
    if (inArena) this.addCrowd(kind === 'prep' ? crowdIdle : crowdCheer);
    if (kind === 'entrance' || kind === 'celebration' || kind === 'watch') this.addDrummers(kind === 'celebration' ? -6 : -10);
    if (kind === 'entrance') {
      for (let k = 0; k < 3; k++) this.add(NPC_OUTFITS[(k + 2) % NPC_OUTFITS.length], null, -1.4 + k * 1.4, -27 - 1.6, { walk: true, dz: -2.2 - (k % 2) });
    }
    if (kind === 'training') {
      const coach = castById('ablaye')!, bab = castById('babacar')!;
      this.add(coach.outfit, crowdIdle, -4, 1.5);
      this.wrestle(bab.outfit, drill, 1.6, 0, { ngembColor: 'vert', ngembPattern: 'bordure', accessories: [] }, -Math.PI / 2);
      for (let k = 0; k < 2; k++) this.wrestle(NPC_OUTFITS[k], drill, -1 + k * 3, 3, { ngembColor: 'blanc', ngembPattern: 'uni', accessories: [] });
    }
    if (kind === 'celebration') {
      this.wrestle(castById('babacar')!.outfit, celebrate, 0, 2.5, { ngembColor: 'vert', ngembPattern: 'bordure', accessories: [] });
      this.add(castById('ablaye')!.outfit, danceB, -3, 3.5);
      for (let k = 0; k < 6; k++) this.add(NPC_OUTFITS[k % NPC_OUTFITS.length], k % 2 ? danceA : danceB, -5 + k * 2, 5 + (k % 2));
    }
    if (kind === 'watch') {
      for (const [x, col] of [[-1.2, 'rouge'], [1.2, 'indigo']] as const) this.wrestle(NPC_OUTFITS[2], drill, x, 0, { ngembColor: col, ngembPattern: 'uni', accessories: [] }, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (kind === 'entrance' || kind === 'celebration' || kind === 'watch') this.drums.start(kind === 'celebration' ? 126 : 116);
    if (kind === 'celebration') cheerSound(3, 0.16);
  }

  private rand = rng(7);
  private add(o: (typeof NPC_OUTFITS)[number], pose: Pose | null, dx: number, dz: number, walk?: { walk: true; dz: number }, y = 0.1, crowd = false): Extra {
    const c = new Character(o);
    c.group.position.set(this.o.x + dx, y, this.o.z + dz);
    const e: Extra = { c, pose, crowd };
    if (walk) { e.from = c.group.position.clone(); e.to = new THREE.Vector3(this.o.x + dx, 0.1, this.o.z - 4 + walk.dz); e.t0 = 0.6; e.t1 = 6.6; e.walking = true; }
    if (pose) c.setPose(pose);
    this.group.add(c.group); this.extras.push(e);
    if (wrestlerReady()) {
      // Blender humanoid stands in for the temporary box character.
      const h = new Humanoid(crowd ? randomLook(this.rand) : lookFromOutfit(o));
      h.play(walk ? 'Walk' : (pose && CLIP_FOR.get(pose)) || 'Idle', 0, this.rand());
      h.group.position.copy(c.group.position); this.group.add(h.group); c.group.visible = false; e.w = h;
    }
    return e;
  }
  /** A wrestler extra: the Blender rig in ngemb when loaded, else the temporary box character in wrestling attire. */
  private wrestle(o: (typeof NPC_OUTFITS)[number], pose: Pose, dx: number, dz: number, look: WrestlerLook, yaw?: number): Extra {
    const e = this.add(o, pose, dx, dz);
    if (yaw !== undefined) e.yaw = yaw;
    if (e.w) { e.w.setWrestler(look, look.ngembPattern === 'bordure' ? 'B' : 'A', o.skin); }
    else e.c.setWrestler(look);
    return e;
  }
  private addCrowd(pose: Pose) {
    // Spectators on the tiers of the géew (dimensions in world/geew.ts, drawn by world/builder.ts).
    for (let k = 0; k < this.crowdSize; k++) {
      const a = (k / this.crowdSize) * Math.PI * 2 + 0.12;
      if (inGate(a)) continue; // keep the gate clear
      const tier = k % TIERS;
      const r = tierRadius(tier), y = tierTop(tier);
      const e = this.add(NPC_OUTFITS[k % NPC_OUTFITS.length], pose, Math.sin(a) * r, Math.cos(a) * r, undefined, y, true);
      e.yaw = a + Math.PI;
    }
  }
  private addDrummers(dz: number) {
    for (let k = 0; k < 4; k++) {
      const e = this.add(NPC_OUTFITS[(k + 3) % NPC_OUTFITS.length], drum, -9 + k * 1.2, dz); e.yaw = Math.PI / 2;
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.75, 10), new THREE.MeshLambertMaterial({ color: 0x8a5a2e }));
      d.position.set(this.o.x - 9 + k * 1.2 + 0.35, 0.55, this.o.z + dz); d.rotation.z = 0.5; d.castShadow = true; this.group.add(d);
    }
  }

  /** Advances the scene; positions the player and returns the camera framing. */
  update(dt: number): SceneFrame {
    this.t += dt;
    const t = this.t, o = this.o, p = this.player.group;
    for (const e of this.extras) {
      if (e.from && e.to && e.t0 !== undefined && e.t1 !== undefined) {
        const k = THREE.MathUtils.clamp((t - e.t0) / (e.t1 - e.t0), 0, 1);
        e.c.group.position.lerpVectors(e.from, e.to, k); e.c.group.rotation.y = 0;
        if (e.w) { e.w.group.position.copy(e.c.group.position); e.w.group.rotation.y = 0; e.w.animate(dt, k > 0 && k < 1 ? 1.5 : 0); }
        else e.c.animate(dt, k > 0 && k < 1 ? 2.2 : 0);
      } else {
        if (e.yaw !== undefined) e.c.group.rotation.y = e.yaw;
        else e.c.group.rotation.y = Math.atan2(p.position.x - e.c.group.position.x, p.position.z - e.c.group.position.z);
        if (e.w) { e.w.group.rotation.y = e.c.group.rotation.y; e.w.update(dt); } else e.c.animate(dt, 0);
      }
    }
    const cam = new THREE.Vector3(), look = new THREE.Vector3();
    switch (this.kind) {
      case 'entrance': {
        // 0–7 s walk in through the gate; 7–11 s dance at the centre; 11–15 s preparation, crowd swell.
        const k = THREE.MathUtils.clamp((t - 0.6) / 6, 0, 1);
        p.position.set(o.x, 0.1, o.z - 25 + k * 21); p.rotation.y = 0;
        if (t < 7) { this.player.setPose(null); this.player.animate(dt, k < 1 ? 2.2 : 0); }
        else if (t < 11) { if (this.player.pose !== danceA) this.player.setPose(danceA); this.player.animate(dt, 0); }
        else { if (this.player.pose !== prep) this.player.setPose(prep); this.player.animate(dt, 0); }
        if (t > 6.8 && !this.cheered.has(1)) { this.cheered.add(1); cheerSound(3.2, 0.2); }
        if (t > 11 && !this.cheered.has(2)) { this.cheered.add(2); cheerSound(2.5, 0.14); }
        // Camera in front of the wrestler, looking back toward the gate and the entourage; slow orbit once inside.
        const a = t < 7 ? 0.35 : 0.35 + (t - 7) * 0.16;
        const r = t < 7 ? 8 : 6.5;
        cam.set(p.position.x + Math.sin(a) * r, 3.2, p.position.z + Math.cos(a) * r);
        look.set(p.position.x, 1.3, p.position.z);
        break;
      }
      case 'prep': {
        p.position.set(o.x, 0.1, o.z - 2); p.rotation.y = Math.PI;
        if (this.player.pose !== prep) this.player.setPose(prep); this.player.animate(dt, 0);
        const a = 0.6 + t * 0.12; cam.set(p.position.x + Math.sin(a) * 5, 2.2, p.position.z + Math.cos(a) * 5); look.set(p.position.x, 1, p.position.z);
        break;
      }
      case 'training': {
        p.position.set(o.x, 0.1, o.z); p.rotation.y = Math.PI / 2;
        if (this.player.pose !== drill) this.player.setPose(drill); this.player.animate(dt, 0);
        cam.set(o.x + 6, 3.2, o.z - 6.5); look.set(o.x, 1, o.z + 1.2);
        break;
      }
      case 'celebration': {
        p.position.set(o.x + 2, 0.1, o.z + 1); p.rotation.y = 0;
        if (this.player.pose !== danceB) this.player.setPose(danceB); this.player.animate(dt, 0);
        const a = Math.PI + 0.3 + t * 0.15; cam.set(o.x + Math.sin(a) * 12, 5, o.z + 3 + Math.cos(a) * 12); look.set(o.x, 1.2, o.z + 3);
        break;
      }
      case 'watch': {
        p.position.set(o.x - 6, 0.1, o.z - 14); p.rotation.y = 0; if (this.player.pose !== crowdCheer) this.player.setPose(crowdCheer); this.player.animate(dt, 0);
        cam.set(o.x - 4, 4.5, o.z - 15.5); look.set(o.x, 1, o.z);
        break;
      }
    }
    if (this.pw) {
      this.pw.group.position.copy(p.position); this.pw.group.rotation.y = p.rotation.y;
      const walking = this.kind === 'entrance' && t < 7;
      this.pw.play(walking ? (t > 0.6 && t < 6.6 ? 'Entrance_Walk' : 'Idle') : (this.player.pose ? CLIP_FOR.get(this.player.pose) ?? 'Idle' : 'Idle'));
      this.pw.update(dt);
    }
    return { cam, look };
  }

  get done() { return this.t >= this.duration; }

  dispose() {
    this.drums.stop();
    this.player.setPose(null); this.player.setWrestler(null); this.player.group.visible = true;
    this.pw?.dispose(); for (const e of this.extras) e.w?.dispose();
    this.group.traverse(obj => { const m = obj as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  }
}
