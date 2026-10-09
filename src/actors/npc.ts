import * as THREE from 'three';
import { Character, NPC_OUTFITS } from './character';
import { Humanoid, humanoidReady, randomLook, type Clip } from './humanoid';
import { makeTaxi, makeCarRapide } from './vehicles';
import { pick } from '../core/rng';
import type { HubWorld } from '../world/types';

interface Walker { char: { group: THREE.Group; animate(dt: number, speed: number): void; lookTarget?: THREE.Vector3 | null }; ax: number; az: number; bx: number; bz: number; t: number; speed: number; lat: number; prev: string }

const nodeKey = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;

function neighbours(w: HubWorld, x: number, z: number) {
  const out: { x: number; z: number }[] = [];
  for (const e of w.edges) {
    if (nodeKey(e.ax, e.az) === nodeKey(x, z)) out.push({ x: e.bx, z: e.bz });
    else if (nodeKey(e.bx, e.bz) === nodeKey(x, z)) out.push({ x: e.ax, z: e.az });
  }
  return out;
}

/** Local background crowd: simulated on this phone only, never synchronised (design doc: Local atmosphere). */
export class Crowd {
  group = new THREE.Group();
  private walkers: Walker[] = [];
  constructor(private world: HubWorld, private rand: () => number, count = 14) {
    for (let n = 0; n < count; n++) {
      const e = pick(world.edges, rand);
      const c = humanoidReady() ? new Humanoid(randomLook(rand)) : new Character(pick(NPC_OUTFITS, rand));
      this.group.add(c.group);
      const prev = this.walkers[this.walkers.length - 1];
      if (prev && n % 3 === 2) {   // walking together: same street, side by side
        this.walkers.push({ char: c, ax: prev.ax, az: prev.az, bx: prev.bx, bz: prev.bz, t: prev.t, speed: prev.speed, lat: prev.lat + Math.sign(prev.lat) * -0.75, prev: '' });
        continue;
      }
      this.walkers.push({ char: c, ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, t: rand(), speed: 1.1 + rand() * 0.7, lat: (rand() < 0.5 ? -1 : 1) * (5.3 + rand() * 1.2), prev: '' });
    }
  }
  /** Keep the crowd around the player: walkers that drift too far are moved to a street 20–55 m away. */
  private respawnNear(w: Walker, px: number, pz: number) {
    for (let tries = 0; tries < 24; tries++) {
      const e = pick(this.world.edges, this.rand), t = this.rand();
      const x = e.ax + (e.bx - e.ax) * t, z = e.az + (e.bz - e.az) * t, d = Math.hypot(x - px, z - pz);
      if (d > 20 && d < 55) { w.ax = e.ax; w.az = e.az; w.bx = e.bx; w.bz = e.bz; w.t = t; w.prev = ''; return; }
    }
  }
  update(dt: number, px = 0, pz = 0) {
    for (const w of this.walkers) {
      const cx = w.char.group.position.x, cz = w.char.group.position.z;
      if (Math.hypot(cx - px, cz - pz) > 75) this.respawnNear(w, px, pz);
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
      w.t += (w.speed * dt) / len;
      if (w.t >= 1) {
        const opts = neighbours(this.world, w.bx, w.bz).filter(n => nodeKey(n.x, n.z) !== w.prev);
        const next = opts.length ? pick(opts, this.rand) : { x: w.ax, z: w.az };
        w.prev = nodeKey(w.bx, w.bz); w.ax = w.bx; w.az = w.bz; w.bx = next.x; w.bz = next.z; w.t = 0;
      }
      const l2 = Math.hypot(w.bx - w.ax, w.bz - w.az);
      const dx = (w.bx - w.ax) / l2 || 0, dz = (w.bz - w.az) / l2 || 0;
      const x = w.ax + (w.bx - w.ax) * w.t - dz * w.lat, z = w.az + (w.bz - w.az) * w.t + dx * w.lat;
      w.char.group.position.set(x, 0.1, z); w.char.group.rotation.y = Math.atan2(dx, dz);
      const far = Math.hypot(x - px, z - pz) > 60;
      w.char.group.visible = !far;
      // passers-by glance at the player when they come close
      const dp = Math.hypot(x - px, z - pz);
      w.char.lookTarget = dp < 4.5 ? (w.char.lookTarget ?? new THREE.Vector3()).set(px, 1.6, pz) : null;
      if (!far) w.char.animate(dt, w.speed);
    }
  }
}

interface Car { g: THREE.Group; ax: number; az: number; bx: number; bz: number; t: number; speed: number; prev: string; lane: number }

/**
 * Decorative local traffic. VISUAL ONLY: it never collides with, blocks or affects the player, jobs or
 * anything saved. Traffic that matters will be shared, server-validated vehicles (design doc, Implementation decisions).
 */
export class DecorativeTraffic {
  group = new THREE.Group();
  private cars: Car[] = [];
  constructor(private world: HubWorld, private rand: () => number, count = 6) {
    for (let n = 0; n < count; n++) {
      const e = pick(world.edges, rand);
      const g = rand() < 0.35 ? makeCarRapide() : makeTaxi(pick([0xf0b800, 0xf2f2ec, 0xd9482b, 0x2f8fd1], rand));
      this.group.add(g);
      this.cars.push({ g, ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, t: rand(), speed: 5 + rand() * 3, prev: '', lane: 2.5 });
    }
  }
  /** Car rapide groups in this traffic (they carry an apprentice on the step). */
  rapides() { return this.cars.map(c => c.g).filter(g => g.name.includes('car_rapide')); }
  update(dt: number) {
    for (const c of this.cars) {
      const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
      c.t += (c.speed * dt) / len;
      if (c.t >= 1) {
        const opts = neighbours(this.world, c.bx, c.bz).filter(n => nodeKey(n.x, n.z) !== c.prev);
        const next = opts.length ? pick(opts, this.rand) : { x: c.ax, z: c.az };
        c.prev = nodeKey(c.bx, c.bz); c.ax = c.bx; c.az = c.bz; c.bx = next.x; c.bz = next.z; c.t = 0;
      }
      const l2 = Math.hypot(c.bx - c.ax, c.bz - c.az);
      const dx = (c.bx - c.ax) / l2 || 0, dz = (c.bz - c.az) / l2 || 0;
      c.g.position.set(c.ax + (c.bx - c.ax) * c.t - dz * c.lane, 0.08, c.az + (c.bz - c.az) * c.t + dx * c.lane);
      c.g.rotation.y = Math.atan2(dx, dz);
    }
  }
}


/**
 * People standing and chatting in small groups at busy spots (shops, cafés, market, station), some seated
 * on benches. Local and decorative like the crowd.
 */
export class Loiterers {
  group = new THREE.Group();
  private people: Humanoid[] = [];
  constructor(world: HubWorld, rand: () => number, max = 18) {
    if (!humanoidReady()) return;
    const spots = world.interactables.filter(i => /:(gargote|cafe|market|station|garage|restaurant|gym|port)/.test(i.id));
    let placed = 0;
    for (const s of spots) {
      if (placed >= max) break;
      const n = 2 + Math.floor(rand() * 3);
      const cx = s.x + (rand() - 0.5) * 6, cz = s.z + (rand() < 0.5 ? -1 : 1) * (2.2 + rand() * 1.5);
      const seated = /cafe|gargote/.test(s.id) && rand() < 0.6;
      if (seated) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.45), new THREE.MeshLambertMaterial({ color: 0x6b4a2e }));
        bench.position.set(cx, 0.31, cz - 0.06); bench.castShadow = true; this.group.add(bench);
      }
      for (let k = 0; k < n && placed < max; k++, placed++) {
        const h = new Humanoid(randomLook(rand));
        if (seated && k < 2) {
          h.group.position.set(cx - 0.55 + k * 1.1, 0.1, cz + 0.05); h.group.rotation.y = Math.PI; h.hold = /gargote|restaurant/.test(s.id) && rand() < 0.6 ? 'Eat' : 'Sit';
        } else {
          const a = (k / n) * Math.PI * 2 + rand() * 0.5;
          h.group.position.set(cx + Math.sin(a) * 0.8, 0.1, cz + Math.cos(a) * 0.8);
          h.group.rotation.y = a + Math.PI;                          // facing the middle of the group
          h.hold = rand() < 0.5 ? 'Talk' : 'Idle';
        }
        h.play(h.hold!, 0, rand());
        this.group.add(h.group); this.people.push(h);
      }
    }
  }
  /** Conversation: one speaker at a time (Talk), the others turn their heads to the speaker; turns rotate every few seconds. */
  private groups: { members: Humanoid[]; speaker: number; t: number }[] = [];
  private greet = new Map<Humanoid, { done: boolean; t: number; prev: Clip | null }>();
  private t = 0;
  update(dt: number, px: number, pz: number) {
    this.t += dt;
    if (!this.groups.length && this.people.length) {
      let cur: Humanoid[] = [];
      for (const h of this.people) {
        const last = cur[cur.length - 1];
        if (last && last.group.position.distanceTo(h.group.position) > 3.2) { this.groups.push({ members: cur, speaker: 0, t: 2 + Math.random() * 3 }); cur = []; }
        cur.push(h);
      }
      if (cur.length) this.groups.push({ members: cur, speaker: 0, t: 2 + Math.random() * 3 });
    }
    for (const g of this.groups) {
      const near = Math.hypot(g.members[0].group.position.x - px, g.members[0].group.position.z - pz) < 35;
      g.t -= dt;
      if (g.t <= 0 && g.members.length > 1) {
        g.speaker = (g.speaker + 1 + Math.floor(Math.random() * (g.members.length - 1))) % g.members.length; g.t = 2.5 + Math.random() * 4;
        g.members.forEach((m, i) => { if (m.hold !== 'Sit' && m.hold !== 'Eat') m.hold = i === g.speaker ? 'Talk' : (Math.random() < 0.2 ? 'Phone' : 'Idle'); });
      }
      const sp = g.members[g.speaker];
      for (const m of g.members) {
        if (!near) { m.lookTarget = null; continue; }
        if (m === sp) { const o = g.members[(g.speaker + 1) % g.members.length]; m.lookTarget = o === m ? null : o.group.position.clone().setY(1.6); }
        else m.lookTarget = sp.group.position.clone().setY(sp.hold === 'Sit' ? 1.15 : 1.6);
      }
    }
    for (const h of this.people) {
      const dp = Math.hypot(h.group.position.x - px, h.group.position.z - pz);
      const far = dp > 60;
      h.group.visible = !far;
      // greet the player once when they come close (Wave for 1.2 s, then back to what they were doing)
      const st = this.greet.get(h) ?? { done: false, t: 0, prev: h.hold };
      if (!st.done && dp < 3.5 && h.hold !== 'Sit' && h.hold !== 'Eat') { st.done = true; st.t = 1.2; st.prev = h.hold; h.hold = 'Wave'; h.lookTarget = new THREE.Vector3(px, 1.6, pz); }
      if (st.t > 0) { st.t -= dt; if (st.t <= 0) h.hold = st.prev === 'Wave' ? 'Idle' : st.prev; }
      if (dp > 12) st.done = false;
      this.greet.set(h, st);
      if (!far) { h.play(h.hold ?? 'Idle', 0.3); h.update(dt); }
    }
  }
}
