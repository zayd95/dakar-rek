import * as THREE from 'three';
import { Character, NPC_OUTFITS } from './character';
import { Humanoid, humanoidReady, randomLook } from './humanoid';
import { makeCarRapide } from './vehicles';
import { animateVehicle, buildVehicle, type VehicleKind } from './vehicleKit';
import { pick } from '../core/rng';
import type { HubWorld } from '../world/types';
import { len2 } from '../core/math';
import { HUB_STREETS, edgeWeight } from '../crowd/streetPlan';
import { STOP_LANE, crossings, kerb, kerbSpots, type KerbSpot } from '../crowd/streetLink';

interface Walker { char: { group: THREE.Group; animate(dt: number, speed: number): void }; ax: number; az: number; bx: number; bz: number; t: number; speed: number; lat: number; prev: string }

export const nodeKey = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;

export function neighbours(w: HubWorld, x: number, z: number) {
  const out: { x: number; z: number }[] = [];
  for (const e of w.edges) {
    if (nodeKey(e.ax, e.az) === nodeKey(x, z)) out.push({ x: e.bx, z: e.bz });
    else if (nodeKey(e.bx, e.bz) === nodeKey(x, z)) out.push({ x: e.ax, z: e.az });
  }
  return out;
}

/** An edge of the hub for a walker or a car to start on: the busy streets (the Sandaga block, the Pikine main street) weigh most, the streets round the spawn next. */
export function pickEdge(world: HubWorld, rand: () => number) {
  const busy = HUB_STREETS[world.id]?.busy ?? [];
  const w = world.edges.map(e => { const b = edgeWeight(e, busy); return b > 1 ? b : Math.hypot((e.ax + e.bx) / 2 - world.spawn.x, (e.az + e.bz) / 2 - world.spawn.z) < 90 ? 2 : 1; });
  let sum = 0; for (const v of w) sum += v;
  let u = rand() * sum;
  for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return world.edges[i]; }
  return world.edges[world.edges.length - 1];
}

/** At a crossing: the busy streets are taken more often than the side streets (the street's people and cars stay where it is busy). */
export function pickTurn(world: HubWorld, x: number, z: number, opts: { x: number; z: number }[], rand: () => number) {
  const busy = HUB_STREETS[world.id]?.busy ?? [];
  const w = opts.map(o => edgeWeight({ ax: x, az: z, bx: o.x, bz: o.z }, busy) > 1 ? 4 : 1);
  let sum = 0; for (const v of w) sum += v;
  let u = rand() * sum;
  for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return opts[i]; }
  return opts[opts.length - 1];
}

/**
 * The weather's (and the road events') say on the street, set by the living city lane (src/city/living.ts): the share
 * of walkers and cars out on top of the hour's (src/social/ambientLife.ts thins them by hour), and how fast the cars go
 * (rain slows everyone down).
 */
export const streetLevel = { walkers: 1, traffic: 1, speed: 1 };

/** Local background crowd: simulated on this phone only, never synchronised (design doc: Local atmosphere). */
export class Crowd {
  group = new THREE.Group();
  private walkers: Walker[] = [];
  constructor(private world: HubWorld, private rand: () => number, count = 14) {
    this.group.name = 'crowd_walkers';                       // social/ambientLife.ts thins them out at night
    for (let n = 0; n < count; n++) {
      const e = pickEdge(world, rand);
      const c = humanoidReady() ? new Humanoid(randomLook(rand)) : new Character(pick(NPC_OUTFITS, rand));
      this.group.add(c.group);
      this.walkers.push({ char: c, ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, t: rand(), speed: 1.1 + rand() * 0.7, lat: (rand() < 0.5 ? -1 : 1) * (5.3 + rand() * 1.2), prev: '' });
    }
  }
  /** Bodies for the interaction system (greet in passing). */
  bodies() { return this.walkers.map((w, i) => ({ id: 'walker:' + i, h: w.char instanceof Humanoid ? w.char : null, obj: w.char.group })); }
  update(dt: number) {
    for (const w of this.walkers) {
      const len = len2(w.bx - w.ax, w.bz - w.az);
      w.t += (w.speed * dt) / len;
      if (w.t >= 1) {
        const opts = neighbours(this.world, w.bx, w.bz).filter(n => nodeKey(n.x, n.z) !== w.prev);
        const next = opts.length ? pickTurn(this.world, w.bx, w.bz, opts, this.rand) : { x: w.ax, z: w.az };
        w.prev = nodeKey(w.bx, w.bz); w.ax = w.bx; w.az = w.bz; w.bx = next.x; w.bz = next.z; w.t = 0;
      }
      const l2 = len2(w.bx - w.ax, w.bz - w.az);
      const dx = (w.bx - w.ax) / l2 || 0, dz = (w.bz - w.az) / l2 || 0;
      const x = w.ax + (w.bx - w.ax) * w.t - dz * w.lat, z = w.az + (w.bz - w.az) * w.t + dx * w.lat;
      w.char.group.position.set(x, 0.1, z); w.char.group.rotation.y = Math.atan2(dx, dz);
      w.char.animate(dt, w.speed);
    }
  }
}

/**
 * Road segments closed to the decorative traffic for a while (a fight evening's queue at the arena gate…): a module sets
 * `closed` (segment ends → true when cars must keep off it) and puts it back to null. Cars already on a closed segment
 * turn up on an open one; the others never turn into it.
 */
export type Closure = (ax: number, az: number, bx: number, bz: number) => boolean;
export const trafficClosures: { closed: Closure | null; more: Set<Closure> } = { closed: null, more: new Set() };
/** The arena's closure and the road events' (src/city/roadEvents.ts) together, or null when the roads are all open. */
function closures(): Closure | null {
  const a = trafficClosures.closed, more = trafficClosures.more;
  if (!more.size) return a;
  return (ax, az, bx, bz) => (a?.(ax, az, bx, bz) ?? false) || [...more].some(f => f(ax, az, bx, bz));
}
let liveTraffic: DecorativeTraffic | null = null;
/** Where the decorative cars are right now (checks). */
/** Is a decorative car within `r` metres of (x, z)? (a walker steps out onto the road only when none is) */
export function trafficNear(x: number, z: number, r: number): boolean { return liveTraffic?.near(x, z, r) ?? false; }
export const trafficPositions = (): { x: number; z: number }[] => liveTraffic?.positions() ?? [];

interface Car {
  g: THREE.Group; ax: number; az: number; bx: number; bz: number; t: number; speed: number; prev: string; lane: number;
  kind: VehicleKind;
  /** The lateral offset now (it eases to the kerb to pull in), the kerb spot it is stopping at and where it is in that (1 on its way, 2 standing, 3 driving off), seconds left standing, speed factor after a stop. */
  laneNow: number; spot: KerbSpot | null; phase: 0 | 1 | 2 | 3; timer: number; ramp: number;
}

/** Traffic mix per neighbourhood (weights): car rapides and motorbikes in Pikine, taxis and buses downtown, 4×4s and luxury cars in Almadies. */
const TRAFFIC_MIX: Record<HubWorld['id'], [VehicleKind, number][]> = {
  plateau: [['taxi', 30], ['carRapide', 15], ['bus', 12], ['sedan', 18], ['suv', 8], ['luxury', 5], ['moto', 8], ['pickup', 2], ['truck', 2]],
  corniche: [['taxi', 25], ['carRapide', 15], ['bus', 10], ['sedan', 20], ['suv', 10], ['luxury', 8], ['moto', 10], ['pickup', 2]],
  almadies: [['taxi', 20], ['sedan', 20], ['suv', 22], ['luxury', 18], ['moto', 8], ['carRapide', 6], ['bus', 4], ['pickup', 2]],
  pikine: [['carRapide', 28], ['taxi', 20], ['moto', 20], ['sedan', 10], ['pickup', 8], ['truck', 6], ['bus', 5], ['suv', 3]],
};
/** Lateral offset from the road centre (right-hand traffic); parked vehicles stand at 4.3 m (src/game/parkedVehicles.ts). */
const LANE: Partial<Record<VehicleKind, number>> = { moto: 3.0, bus: 2.6, truck: 2.6 };
function pickKind(hub: HubWorld['id'], r: number): VehicleKind {
  const mix = TRAFFIC_MIX[hub] ?? TRAFFIC_MIX.plateau, total = mix.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [k, w] of mix) { x -= w; if (x <= 0) return k; }
  return mix[0][0];
}

/**
 * Decorative local traffic, built from the vehicle kit (src/actors/vehicleKit.ts: 1–3 draw calls each, LOD).
 * VISUAL ONLY: it never collides with, blocks or affects the player, jobs or anything saved. Traffic that matters will
 * be shared, server-validated vehicles (design doc, Implementation decisions).
 */
export class DecorativeTraffic {
  group = new THREE.Group();
  private cars: Car[] = [];
  constructor(private world: HubWorld, private rand: () => number, count = 6) {
    this.group.name = 'traffic';                             // social/ambientLife.ts varies it by the hour
    liveTraffic = this;
    for (let n = 0; n < count; n++) {
      const e = pickEdge(world, rand);
      const kind = pickKind(world.id, rand()), seed = Math.floor(rand() * 1e6);
      const v = kind === 'carRapide' ? { group: makeCarRapide({ seed }), speed: 6 } : (() => { const b = buildVehicle(kind, { seed }); return { group: b.group, speed: b.spec.speed }; })();
      this.group.add(v.group);
      const car: Car = { g: v.group, ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, t: rand(), speed: v.speed * (0.85 + rand() * 0.3), prev: '', lane: LANE[kind] ?? 2.5, kind, laneNow: LANE[kind] ?? 2.5, spot: null, phase: 0, timer: 0, ramp: 1 };
      this.cars.push(car); this.pickSpot(car);
    }
  }
  near(x: number, z: number, r: number) {
    for (const c of this.cars) { const p = c.g.position, dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < r * r && c.g.visible) return true; }
    return false;
  }
  /** Positions of the cars (checks). */
  positions() { return this.cars.map(c => ({ x: c.g.position.x, z: c.g.position.z })); }
  /** A car on a segment that just closed turns up on an open one (out of sight of the closure). */
  private reroute(c: Car, shut: NonNullable<typeof trafficClosures.closed>) {
    const open = this.world.edges.filter(e => !shut(e.ax, e.az, e.bx, e.bz));
    if (!open.length) return;
    const e = pick(open, this.rand);
    c.ax = e.ax; c.az = e.az; c.bx = e.bx; c.bz = e.bz; c.t = this.rand(); c.prev = ''; this.pickSpot(c);
  }
  /** A taxi or a minibus entering a road: does it pull in at a kerb spot on it (where someone waits, more often)? */
  private pickSpot(c: Car) {
    if (c.spot) { c.spot.claimed = false; c.spot.halted = false; c.spot = null; }
    c.phase = 0; c.laneNow = c.lane;
    const taxi = c.kind === 'taxi', bus = c.kind === 'bus' || c.kind === 'carRapide';
    if (!taxi && !bus) return;
    for (const k of kerbSpots) {
      if (k.claimed || k.cool > kerb.clock || k.long !== bus) continue;
      if (Math.abs(k.ax - c.ax) > 0.6 || Math.abs(k.az - c.az) > 0.6 || Math.abs(k.bx - c.bx) > 0.6 || Math.abs(k.bz - c.bz) > 0.6) continue;
      if (this.rand() > (k.waiting > 0 ? 0.95 : taxi ? 0.3 : 0.15)) continue;
      const len = len2(c.bx - c.ax, c.bz - c.az);
      if (c.t * len > k.s - 16) continue;                                  // too late to pull in smoothly
      k.claimed = true; c.spot = k; c.phase = 1; break;
    }
  }
  /** Car rapide groups in this traffic (they carry an apprentice on the step). */
  rapides() { return this.cars.map(c => c.g).filter(g => g.name.includes('car_rapide')); }
  update(dt: number) {
    const shut = closures();
    kerb.clock += dt;
    for (const c of this.cars) {
      if (shut && shut(c.ax, c.az, c.bx, c.bz)) this.reroute(c, shut);
      const len = len2(c.bx - c.ax, c.bz - c.az);
      const l2 = len;
      const dx = (c.bx - c.ax) / l2 || 0, dz = (c.bz - c.az) / l2 || 0;
      // slowing for people crossing the road, and pulling in at a kerb spot (a taxi or a minibus: wait, then drive on)
      let f = 1, laneTo = c.lane;
      const px = c.g.position.x, pz = c.g.position.z;
      for (let i = 0; i < crossings.length; i++) {
        const w = crossings[i]; if (!w.on) continue;
        const rx = w.x - px, rz = w.z - pz, ahead = rx * dx + rz * dz, lat = -rx * dz + rz * dx;
        if (ahead > -0.6 && ahead < 13 && Math.abs(lat) < 2.1) f = Math.min(f, Math.max(0, Math.min(1, (ahead - 2.4) / 7)));
      }
      const k = c.spot;
      if (k) {
        const d = k.s - c.t * len;
        if (c.phase === 1) {
          if (d < 15) { laneTo = STOP_LANE; f = Math.min(f, Math.max(0.1, Math.min(1, d / 9))); }
          if (d <= 0.3) { c.phase = 2; c.timer = 5 + this.rand() * 4; k.halted = true; k.fresh = true; }
        } else if (c.phase === 2) {
          laneTo = STOP_LANE; f = 0; c.timer -= dt;
          // someone is climbing in: wait for them (a few seconds at most)
          if (c.timer <= 0 && (k.waiting <= 0 || c.timer < -7)) { c.phase = 3; c.ramp = 0; k.halted = false; k.cool = kerb.clock + 45 + this.rand() * 40; }
        } else {
          c.ramp = Math.min(1, c.ramp + dt / 3.2); f = Math.min(f, 0.12 + 0.88 * c.ramp);
          if (c.ramp >= 1 && Math.abs(c.laneNow - c.lane) < 0.05) { k.claimed = false; c.spot = null; c.phase = 0; }
        }
        if (c.spot) { k.cx = c.g.position.x; k.cz = c.g.position.z; }
      }
      c.laneNow += (laneTo - c.laneNow) * Math.min(1, dt * 1.6);
      c.t += (c.speed * streetLevel.speed * f * dt) / len;
      if (c.t >= 1) {
        const opts = neighbours(this.world, c.bx, c.bz).filter(n => nodeKey(n.x, n.z) !== c.prev && !(shut && shut(c.bx, c.bz, n.x, n.z)));
        const next = opts.length ? pickTurn(this.world, c.bx, c.bz, opts, this.rand) : { x: c.ax, z: c.az };
        c.prev = nodeKey(c.bx, c.bz); c.ax = c.bx; c.az = c.bz; c.bx = next.x; c.bz = next.z; c.t = 0;
        this.pickSpot(c);
        continue;
      }
      c.g.position.set(c.ax + (c.bx - c.ax) * c.t - dz * c.laneNow, 0.08, c.az + (c.bz - c.az) * c.t + dx * c.laneNow);
      c.g.rotation.y = Math.atan2(dx, dz);
      animateVehicle(c.g, c.speed * f, 0, dt);                                   // wheels turn (near models only)
    }
  }
}
