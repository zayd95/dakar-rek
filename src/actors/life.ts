import * as THREE from 'three';
import { Humanoid, humanoidReady, randomLook, type Clip, type PersonLook } from './humanoid';
import type { HubWorld } from '../world/types';

/**
 * Local ambient life around the Monument de la Renaissance (Corniche hub): joggers running the stair,
 * people training on the summit terrace, and festive groups dancing around drummers at the foot of the hill.
 * Visual only, simulated on this device. Dances are PROVISIONAL clips (Unreviewed, like the làmb scenes).
 */
interface Jogger { h: Humanoid; t: number; dir: 1 | -1; speed: number; lat: number; pause: number }
interface Static { h: Humanoid }

const SPORT = [0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0xf2f2ec, 0x222428, 0xe8742c];

export class MonumentLife {
  readonly group = new THREE.Group();
  private joggers: Jogger[] = [];
  private others: Static[] = [];
  private drums: THREE.Mesh[] = [];
  private time = 0;

  constructor(private m: NonNullable<HubWorld['monument']>, rand: () => number, size: number) {
    if (!humanoidReady()) return;
    const sporty = (): PersonLook => ({ ...randomLook(rand), style: 'tee', top: SPORT[Math.floor(rand() * SPORT.length)], bottom: rand() < 0.5 ? 0x1c1c1f : 0x2b2f3a, shoes: 0xf2f2ec, hat: null, pattern: 'uni' });
    const nJog = Math.max(2, Math.round(size / 4));
    for (let k = 0; k < nJog; k++) {
      const h = new Humanoid(sporty()); this.group.add(h.group);
      this.joggers.push({ h, t: rand(), dir: rand() < 0.5 ? 1 : -1, speed: 0.07 + rand() * 0.03, lat: (k % 2 ? 1 : -1) * (0.7 + rand() * 1.1), pause: 0 });
    }
    // training on the summit terrace, beside the pedestal
    const trainClips: Clip[] = ['Stance', 'Celebrate', 'Stance'];
    for (let k = 0; k < Math.min(3, Math.ceil(size / 6)); k++) {
      const h = new Humanoid(sporty()); h.hold = trainClips[k];
      h.group.position.set(m.stairX1 + 0.6 + k * 0.4, m.y1 + 0.02, m.stairZ + (k - 1) * 2.4);
      h.group.rotation.y = -Math.PI / 2 + (rand() - 0.5) * 0.6;
      this.group.add(h.group); this.others.push({ h });
    }
    // festive groups: a ring of dancers around two drummers in each corner
    const dancers = Math.max(4, Math.round(size / 2));
    for (const [si, sp] of m.spots.entries()) {
      for (let d = 0; d < 2; d++) {
        const h = new Humanoid(randomLook(rand)); h.hold = 'Talk';
        const x = sp.x + (d ? 0.8 : -0.8), z = sp.z - 1.4;
        h.group.position.set(x, 0.1, z); h.group.rotation.y = 0; this.group.add(h.group); this.others.push({ h });
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.75, 10), new THREE.MeshLambertMaterial({ color: 0x8a5a2e }));
        drum.position.set(x + 0.32, 0.55, z + 0.2); drum.rotation.z = 0.5; drum.castShadow = true; this.group.add(drum); this.drums.push(drum);
      }
      const n = Math.ceil(dancers / 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + si, r = 2.2 + rand() * 0.8;
        const h = new Humanoid(randomLook(rand)); h.hold = (['Dance_A', 'Dance_B', 'Celebrate', 'Dance_A'] as Clip[])[k % 4];
        h.group.position.set(sp.x + Math.sin(a) * r, 0.1, sp.z + 0.6 + Math.cos(a) * r);
        h.group.rotation.y = Math.atan2(sp.x - h.group.position.x, sp.z - h.group.position.z);
        this.group.add(h.group); this.others.push({ h });
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    const m = this.m;
    for (const j of this.joggers) {
      if (j.pause > 0) { j.pause -= dt; j.h.animate(dt, 0); continue; }
      j.t += j.dir * j.speed * dt * (j.dir > 0 ? 1 : 1.35);           // a bit faster going down
      if (j.t >= 1) { j.t = 1; j.dir = -1; j.pause = 1.5; }             // catch the breath at the top
      if (j.t <= 0) { j.t = 0; j.dir = 1; j.pause = 0.8; }
      const x = m.stairX0 + (m.stairX1 - m.stairX0) * j.t, y = m.y0 + (m.y1 - m.y0) * j.t;
      j.h.group.position.set(x, y, m.stairZ + j.lat);
      j.h.group.rotation.y = j.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      j.h.animate(dt, 3.6);
    }
    for (const o of this.others) o.h.animate(dt, 0);
    for (const [i, d] of this.drums.entries()) d.rotation.z = 0.5 + Math.sin(this.time * 9 + i) * 0.04;
  }

  dispose() { for (const j of this.joggers) j.h.dispose(); for (const o of this.others) o.h.dispose(); this.group.removeFromParent(); }
}
