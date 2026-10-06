import * as THREE from 'three';
import type { WrestlerLook } from '../core/types';
import { ACCESSORIES, ngembTexture, type Socket } from '../lamb/look';

export interface Outfit { top: number; bottom: number; skin: number; long?: boolean; hat?: number }
const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });

/** A pose function sets limb rotations for time t (seconds) — used by emotes and scenes. */
export type Pose = (c: Character, t: number) => void;

/**
 * TEMPORARY low-poly character (boxes). One shared humanoid layout with named limbs and attachment
 * sockets (armL, armR, waist, neck), matching the planned Blender rig; will be replaced by the rigged
 * Blender character (see docs/ASSET_REGISTER.md).
 */
export class Character {
  group = new THREE.Group();
  legL = new THREE.Group(); legR = new THREE.Group();
  armL = new THREE.Group(); armR = new THREE.Group();
  body = new THREE.Group();
  sockets: Record<Socket, THREE.Group> = { armL: new THREE.Group(), armR: new THREE.Group(), waist: new THREE.Group(), neck: new THREE.Group() };
  pose: Pose | null = null;
  private poseT = 0;
  private phase = 0;
  private topMat: THREE.MeshLambertMaterial; private botMat: THREE.MeshLambertMaterial; private skinMat: THREE.MeshLambertMaterial;
  private robe: THREE.Mesh | null = null; private hat: THREE.Mesh | null = null;
  private ngemb = new THREE.Group();
  private outfit: Outfit;

  constructor(o: Outfit) {
    this.outfit = o;
    this.group.name = 'TEMP_character';
    this.skinMat = lam(o.skin); this.topMat = lam(o.top); this.botMat = lam(o.long ? o.top : o.bottom);
    const add = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); mesh.castShadow = true; p.add(mesh); return mesh;
    };
    this.legL.position.set(-0.17, 0.85, 0); this.legR.position.set(0.17, 0.85, 0);
    add(this.legL, 0.22, 0.85, 0.26, 0, -0.42, 0, this.botMat); add(this.legR, 0.22, 0.85, 0.26, 0, -0.42, 0, this.botMat);
    this.armL.position.set(-0.46, 1.5, 0); this.armR.position.set(0.46, 1.5, 0);
    add(this.armL, 0.17, 0.7, 0.2, 0, -0.33, 0, this.topMat); add(this.armR, 0.17, 0.7, 0.2, 0, -0.33, 0, this.topMat);
    add(this.armL, 0.15, 0.14, 0.18, 0, -0.74, 0, this.skinMat); add(this.armR, 0.15, 0.14, 0.18, 0, -0.74, 0, this.skinMat);
    add(this.body, 0.74, 0.78, 0.4, 0, 1.2, 0, this.topMat);
    if (o.long) this.robe = add(this.body, 0.84, 0.7, 0.5, 0, 0.62, 0, this.topMat);
    add(this.body, 0.34, 0.36, 0.34, 0, 1.78, 0, this.skinMat);
    if (o.hat !== undefined) this.hat = add(this.body, 0.4, 0.14, 0.4, 0, 2.02, 0, lam(o.hat));
    // Attachment sockets (same names as the Blender rig's socket empties).
    this.sockets.armL.position.set(0, -0.2, 0); this.armL.add(this.sockets.armL);
    this.sockets.armR.position.set(0, -0.2, 0); this.armR.add(this.sockets.armR);
    this.sockets.waist.position.set(0, 0.92, 0); this.body.add(this.sockets.waist);
    this.sockets.neck.position.set(0, 1.6, 0); this.body.add(this.sockets.neck);
    this.ngemb.visible = false; this.body.add(this.ngemb);
    this.group.add(this.body, this.legL, this.legR, this.armL, this.armR);
  }

  /** Switch to wrestling attire (ngemb + accessories) or back to the city outfit. Cosmetic only. */
  setWrestler(look: WrestlerLook | null) {
    const o = this.outfit;
    for (const s of Object.values(this.sockets)) s.clear();
    this.ngemb.clear();
    if (!look) {
      this.topMat.color.set(o.top); this.botMat.color.set(o.long ? o.top : o.bottom);
      if (this.robe) this.robe.visible = true; if (this.hat) this.hat.visible = true;
      this.ngemb.visible = false; return;
    }
    this.topMat.color.set(o.skin); this.botMat.color.set(o.skin);
    if (this.robe) this.robe.visible = false; if (this.hat) this.hat.visible = false;
    const m = new THREE.MeshLambertMaterial({ map: ngembTexture(look.ngembColor, look.ngembPattern) });
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.36, 0.44), m); wrap.position.set(0, 0.78, 0); wrap.castShadow = true;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.06), m); flap.position.set(0, 0.5, 0.23);
    const flapB = flap.clone(); flapB.position.z = -0.23;
    this.ngemb.add(wrap, flap, flapB); this.ngemb.visible = true;
    for (const id of look.accessories) {
      const a = ACCESSORIES.find(x => x.id === id); if (!a) continue;
      const mat = lam(a.color);
      const g = a.socket === 'waist' ? new THREE.BoxGeometry(0.86, 0.08, 0.5) : a.socket === 'neck' ? new THREE.BoxGeometry(0.38, 0.06, 0.38) : new THREE.BoxGeometry(0.22, 0.1, 0.24);
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true;
      this.sockets[a.socket].add(mesh);
    }
  }

  setPose(p: Pose | null) { this.pose = p; this.poseT = 0; if (!p) this.resetPose(); }
  resetPose() {
    for (const g of [this.legL, this.legR, this.armL, this.armR, this.body]) g.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
  }

  /** speed in m/s drives the walk cycle; an active pose overrides it. */
  animate(dt: number, speed: number) {
    if (this.pose) { this.poseT += dt; this.pose(this, this.poseT); return; }
    const moving = speed > 0.2;
    this.phase += dt * (3 + speed * 1.3) * (moving ? 1 : 0);
    const s = moving ? Math.sin(this.phase) * Math.min(0.9, speed * 0.2) : 0;
    this.legL.rotation.set(s, 0, 0); this.legR.rotation.set(-s, 0, 0); this.armL.rotation.set(-s * 0.8, 0, 0); this.armR.rotation.set(s * 0.8, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.05 : Math.sin(performance.now() / 700) * 0.008;
  }
}

export const PLAYER_OUTFIT: Outfit = { top: 0x2f6fb3, bottom: 0x2b2b33, skin: 0x7a4a2c };
export const NPC_OUTFITS: Outfit[] = [
  { top: 0xf2f2ec, bottom: 0xf2f2ec, skin: 0x6b3f25, long: true }, { top: 0xc2417f, bottom: 0xc2417f, skin: 0x8a5a3a, long: true },
  { top: 0xe7b82f, bottom: 0x3b3b3b, skin: 0x5b3420 }, { top: 0x3aa35c, bottom: 0x2b3a55, skin: 0x7a4a2c, hat: 0xffffff },
  { top: 0xd9482b, bottom: 0x2b2b33, skin: 0x8a5a3a }, { top: 0x7a5fd1, bottom: 0xe7e0d0, skin: 0x6b3f25, long: true },
];
