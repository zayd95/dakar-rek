import * as THREE from 'three';
import { Humanoid, humanoidReady, randomLook } from './humanoid';
import type { HubId } from '../core/types';
import type { VehicleSpec } from './vehicleKit';

/**
 * The car rapide apprentice: stands at the open rear door (parked) or hangs on the rear step (moving), one hand on the
 * grab bar, calling out the destinations to people on the street. The calls appear in a speech bubble (text authored
 * here). Destinations are real Dakar neighbourhoods served by car rapides; the list per hub is PROVISIONAL (Unreviewed).
 */
const CALLS: Record<HubId, string[]> = {
  plateau: ['Colobane ! Colobane !', 'Petersen ! Petersen !', 'Médina, Médina !', 'Pikine ! Ndaw, ndaw !'],
  corniche: ['Fann ! Mermoz !', 'Ouakam ! Ouakam !', 'Colobane !', 'Liberté 6 !'],
  almadies: ['Ngor ! Yoff !', 'Ouakam !', 'Petersen !', 'Parcelles !'],
  pikine: ['Petersen ! Petersen !', 'Colobane !', 'Thiaroye ! Guédiawaye !', 'Parcelles ! Ndaw !'],
};

function bubbleTexture(text: string) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgba(255,255,255,0.96)'; c.strokeStyle = '#1b2a7a'; c.lineWidth = 6;
  c.beginPath(); c.roundRect(8, 8, 496, 112, 40); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(110, 116); c.lineTo(90, 154); c.lineTo(150, 116); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(110, 120); c.lineTo(90, 154); c.lineTo(150, 120); c.stroke();
  c.fillStyle = '#1b2a7a'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 54; c.font = `italic 900 ${size}px system-ui, sans-serif`;
  while (c.measureText(text).width > 450 && size > 22) { size -= 2; c.font = `italic 900 ${size}px system-ui, sans-serif`; }
  c.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Apprentice {
  readonly h: Humanoid;
  private bubble: THREE.Sprite;
  private texs: THREE.CanvasTexture[];
  private t = Math.random() * 3;
  private i = 0;
  private armR: THREE.Object3D | null;
  private armL: THREE.Object3D | null;

  /** riding: on the step of a moving car (no bubble); otherwise standing at the door of a parked one. */
  constructor(hub: HubId, rand: () => number, readonly riding = false) {
    this.h = new Humanoid({ ...randomLook(rand), style: 'tee', female: false, hat: rand() < 0.4 ? 'kufi' : null, top: [0xd9322b, 0x1a9d54, 0xf2f2ec, 0x2f6fb3, 0xf4c20d][Math.floor(rand() * 5)], pattern: 'uni', bottom: 0x2b2f3a });
    this.h.hold = riding ? 'Idle' : 'Talk';
    this.texs = CALLS[hub].map(bubbleTexture);
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texs[0], depthWrite: false, transparent: true }));
    this.bubble.scale.set(2.4, 0.75, 1); this.bubble.position.set(0.9, 2.55, 0); this.bubble.visible = !riding;
    this.h.group.add(this.bubble);
    // GLTFLoader strips '.' from node names: upper_arm.R → upper_armR
    this.armR = this.h.group.getObjectByName('upper_armR') ?? null;
    this.armL = this.h.group.getObjectByName('upper_armL') ?? null;
  }

  /** Place him relative to a car group (front +z, rear door at -z on the left). */
  attach(car: THREE.Object3D) {
    car.add(this.h.group);
    // the vehicle kit gives the step and the standing spot (VehicleSpec.step); the Blender model keeps the old values
    const step = (car.userData.vehicleSpec as VehicleSpec | undefined)?.step;
    const at = step ? (this.riding ? step.riding : step.standing) : this.riding ? { x: -0.45, y: 0.24, z: -3.62, yaw: Math.PI - 0.9 } : { x: -1.6, y: -0.05, z: -3.9, yaw: -Math.PI / 2 - 0.5 };
    this.h.group.position.set(at.x, at.y, at.z); this.h.group.rotation.y = at.yaw;
  }

  update(dt: number, near: boolean) {
    this.h.animate(dt, 0);
    this.t += dt;
    // one arm up: on the grab bar when riding, waving to passers-by when parked (applied over the clip)
    const wave = this.riding ? 0 : Math.sin(this.t * 7) * 0.25;
    if (this.armR) this.armR.rotateX(this.riding ? -2.4 : -2.2 + wave);
    if (this.armL && this.riding) this.armL.rotateX(-0.6);
    if (!this.riding) {
      this.bubble.visible = near && Math.floor(this.t / 2.4) % 3 !== 2;              // short pauses between calls
      const k = Math.floor(this.t / 3.6) % this.texs.length;
      if (k !== this.i) { this.i = k; (this.bubble.material as THREE.SpriteMaterial).map = this.texs[k]; }
      this.bubble.position.y = 2.55 + Math.sin(this.t * 6) * 0.03;
    }
  }

  dispose() { this.h.dispose(); for (const t of this.texs) t.dispose(); (this.bubble.material as THREE.Material).dispose(); }
}

export const apprenticeReady = humanoidReady;
