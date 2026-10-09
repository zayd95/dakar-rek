import * as THREE from 'three';
import { Character, NPC_OUTFITS } from './character';
import { Humanoid, humanoidReady, randomLook } from './humanoid';
import { makeTaxi, makeCarRapide } from './vehicles';
import { pick } from '../core/rng';
import type { HubWorld } from '../world/types';

interface Walker { char: { group: THREE.Group; animate(dt: number, speed: number): void }; ax: number; az: number; bx: number; bz: number; t: number; speed: number; lat: number; prev: string }

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
    this.group.name = 'crowd_walkers';                       // social/ambientLife.ts thins them out at night
    for (let n = 0; n < count; n++) {
      const e = pick(world.edges, rand);
      const c = humanoidReady() ? new Humanoid(randomLook(rand)) : new Character(pick(NPC_OUTFITS, rand));
      this.group.add(c.group);
      this.walkers.push({ char: c, ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, t: rand(), speed: 1.1 + rand() * 0.7, lat: (rand() < 0.5 ? -1 : 1) * (5.3 + rand() * 1.2), prev: '' });
    }
  }
  /** Bodies for the interaction system (greet in passing). */
  bodies() { return this.walkers.map((w, i) => ({ id: 'walker:' + i, h: w.char instanceof Humanoid ? w.char : null, obj: w.char.group })); }
  update(dt: number) {
    for (const w of this.walkers) {
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
      w.char.animate(dt, w.speed);
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
    this.group.name = 'traffic';                             // social/ambientLife.ts varies it by the hour
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
