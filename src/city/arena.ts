import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import { animateVehicle, buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { Humanoid, humanoidReady, randomLook, type PersonLook } from '../actors/humanoid';
import { Path, openLanePath, pullIn, type Pose, type Pt } from '../transport/route';
import { arenaEvening, roadCentre } from '../transport/lines';
import { clearKerb } from '../transport/passengers';
import { ECURIES, gateOf, type ArenaGate } from '../arena/exteriorRules';
import { eveningSize } from '../arena/exterior';
import { rng } from '../core/rng';
import { ARENA_PARKED, LEAVING_FROM, SIZE_SHARE, arenaArrivals, arenaDepartures, dropInterval, type EveningSize } from './rules';
import { weatherNow } from './weather';

/**
 * The streets round the Pikine arena on a fight evening (every evening: a small card on weekdays, the gala Friday to
 * Sunday). Taxis, clandos and moto-taxis come along the road in front of the arena's north-west corner, queue at the
 * kerb, let their fans out — supporters in their écurie's colours who walk on to the queue at the gate — and drive off;
 * when the bouts are over they come back for the crowd going home. Cars are parked all round the block. How many follow
 * the hour and the size of the evening (src/city/rules.ts); all of it is local decoration (never synchronised, never in
 * anyone's way: the vehicles keep to their lane, the fans to the pavement and the crossing).
 */
interface Fan { h: Humanoid; pts: Pt[]; i: number; on: boolean; speed: number; done?: () => void }
interface Flow {
  g: THREE.Group; kind: VehicleKind; seed: number; s: number; speed: number;
  state: 'drive' | 'drop' | 'wait' | 'away';
  /** Fans getting out (arrivals) or still to come in (departures). */
  fans: number; t: number; pillion: boolean;
}
interface ParkedCar { x: number; z: number; yaw: number; kind: VehicleKind; seed: number; g: THREE.Group | null; box: Collider | null }

const CRUISE = 8.5, DECEL = 3.5, ACCEL = 2.2, GAP = 7.5;
/** Where the drop-off is on the road along the arena's north side (west of the closed stretch in front of the gate). */
const DROP_X = -16;
const MAX_FLOWS = { low: 2, medium: 4, high: 6 } as const;
const MAX_FANS = { low: 3, medium: 6, high: 9 } as const;
/** Mix of who brings the fans (weights). */
const MIX: [VehicleKind, number][] = [['taxi', 45], ['moto', 35], ['sedan', 20]];

let pillionSeed = 0;
/** A moto-taxi seed whose kit model carries a pillion (the fan on the back), the same on every client. */
function motoWithPillion(): number {
  if (pillionSeed) return pillionSeed;
  for (let s = 1; s < 200; s++) {
    const a = buildVehicle('moto', { seed: s, driver: true, passengers: true, lod: 'near' }).spec.budget.near.tris;
    const b = buildVehicle('moto', { seed: s, driver: true, passengers: false, lod: 'near' }).spec.budget.near.tris;
    if (a > b) return (pillionSeed = s);
  }
  return (pillionSeed = 1);
}

export class ArenaStreets {
  readonly group = new THREE.Group();
  private path: Path;
  private dropS: number;
  private end: number;
  private flows: Flow[] = [];
  private fans: Fan[] = [];
  private parked: ParkedCar[] = [];
  private spawnT = 0;
  private rand = rng(9091);
  private pose: Pose = { x: 0, z: 0, yaw: 0 };
  private checkT = 0;
  /** Debug: counts since the hub was loaded. */
  stats = { arrived: 0, fansOut: 0, fansIn: 0, left: 0 };

  constructor(private ctx: GameCtx, private hub: HubWorld, readonly gate: ArenaGate, private quality: 'low' | 'medium' | 'high') {
    this.group.name = 'arena_streets';
    // along the road in front of the arena's north side (z = −60), from the west edge to the drop-off, then round the
    // corner down the arena's west side and on out of the map (the stretch in front of the gate is closed)
    const zRoad = roadCentre(1), xCorner = roadCentre(2);
    const nodes: Pt[] = [{ x: -133, z: zRoad }, { x: xCorner, z: zRoad }, { x: xCorner, z: 133 }];
    const lane = openLanePath(nodes, 2.0, 9);
    this.path = new Path(lane);
    this.end = this.path.at(lane.length - 1);
    this.dropS = this.path.project(DROP_X, zRoad + 2.0);
    clearKerb(ctx.extra, hub.colliders, [{ x: DROP_X, z: zRoad + 4.3, dx: 1, dz: 0, rx: 0, rz: 1, offset: 4.3, from: -40, to: 9 }]);
    if (humanoidReady()) {
      for (let k = 0; k < MAX_FANS[quality]; k++) {
        const h = new Humanoid(this.fanLook()); h.group.visible = false; this.group.add(h.group);
        this.fans.push({ h, pts: [], i: 0, on: false, speed: 1.3 });
      }
    }
    this.parked = this.parkingSpots();
  }

  private fanLook(): PersonLook {
    const l = randomLook(this.rand);
    const e = this.rand() < 0.65 ? ECURIES[Math.floor(this.rand() * ECURIES.length)] : null;
    return e ? { ...l, top: e.colour, pattern: 'uni' } : l;
  }

  /** Kerb spots round the arena block for the evening's parked cars (clear of junctions, buildings and stops). */
  private parkingSpots(): ParkedCar[] {
    const out: ParkedCar[] = [], R = rng(5150);
    const x0 = roadCentre(2), x1 = roadCentre(3), z0 = roadCentre(1), z1 = roadCentre(2);
    const lanes: { a: Pt; b: Pt }[] = [
      { a: { x: x0 + 12, z: z1 }, b: { x: x1 - 12, z: z1 } },                 // south side road (z = 0)
      { a: { x: x1, z: z0 + 12 }, b: { x: x1, z: z1 - 12 } },                 // east side road (x = 60)
    ];
    const kinds: VehicleKind[] = ['sedan', 'taxi', 'sedan', 'pickup', 'suv', 'moto'];
    for (const l of lanes) {
      const len = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z), dx = (l.b.x - l.a.x) / len, dz = (l.b.z - l.a.z) / len;
      for (let t = 0; t <= len; t += 6.5) for (const side of [1, -1]) {
        const x = l.a.x + dx * t - dz * side * 4.3, z = l.a.z + dz * t + dx * side * 4.3;
        const hw = 1.0, hl = 2.5;
        const box: Collider = { x0: x - (Math.abs(dx) * hl + Math.abs(dz) * hw), x1: x + (Math.abs(dx) * hl + Math.abs(dz) * hw), z0: z - (Math.abs(dz) * hl + Math.abs(dx) * hw), z1: z + (Math.abs(dz) * hl + Math.abs(dx) * hw), h: 1.5 };
        if (this.hub.colliders.some(c => box.x0 < c.x1 && box.x1 > c.x0 && box.z0 < c.z1 && box.z1 > c.z0)) continue;
        if (this.hub.interactables.some(i => Math.hypot(i.x - x, i.z - z) < 5)) continue;
        out.push({ x, z, yaw: Math.atan2(dx * side, dz * side), kind: kinds[Math.floor(R() * kinds.length)], seed: Math.floor(R() * 1e6), g: null, box });
      }
    }
    // a deterministic order, so a card evening has the gala's first few
    return out.sort(() => R() - 0.5);
  }

  /** Cars park round the block as the evening starts and leave after it, out of the camera's sight. */
  private updateParked(on: boolean, size: EveningSize) {
    const want = on ? Math.round(ARENA_PARKED[this.quality] * SIZE_SHARE[size]) : 0;
    const cam = this.ctx.camera.position;
    this.parked.forEach((p, k) => {
      const should = k < want, far = Math.hypot(p.x - cam.x, p.z - cam.z) > 45;
      if (should && !p.g && far) {
        const v = buildVehicle(p.kind, { seed: p.seed, driver: false, passengers: false });
        v.group.position.set(p.x, 0.06, p.z); v.group.rotation.y = p.yaw; this.group.add(v.group); p.g = v.group;
        if (p.box) this.hub.colliders.push(p.box);
      } else if (!should && p.g && far) {
        p.g.removeFromParent(); p.g = null;
        if (p.box) { const i = this.hub.colliders.indexOf(p.box); if (i >= 0) this.hub.colliders.splice(i, 1); }
      }
    });
  }

  /** The drop-off and the walk to the queue's tail (across the closed road in front of the gate). */
  private walkToQueue(from: Pt): Pt[] {
    const g = this.gate, pave = roadCentre(1) + 5.9;
    return [{ x: from.x, z: pave }, { x: g.x - 9, z: pave }, { x: g.queue.x - 3.7, z: g.queue.z1 - 0.35 }, { x: g.queue.x, z: g.queue.z1 - 0.35 }];
  }
  private walkFromGate(to: Pt): Pt[] {
    const g = this.gate, pave = roadCentre(1) + 5.9;
    return [{ x: g.x - 4 - this.rand() * 3, z: g.z - 2.5 }, { x: g.x - 9, z: pave }, { x: to.x, z: pave }, { x: to.x, z: to.z }];
  }

  update(dt: number, day: number, hour: number) {
    const on = arenaEvening(hour), size: EveningSize = eveningSize(day, hour);
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 2; this.updateParked(on, size); }
    const leaving = hour >= LEAVING_FROM;
    const rush = (on ? (leaving ? arenaDepartures(hour, size) : arenaArrivals(hour, size)) : 0) * (1 - 0.35 * weatherNow.rain);
    // a new taxi or moto-taxi now and then
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const every = dropInterval(rush, this.quality === 'low');
      this.spawnT = Number.isFinite(every) ? every * (0.7 + this.rand() * 0.6) : 3;
      if (Number.isFinite(every) && this.flows.length < MAX_FLOWS[this.quality] && (!this.flows.length || Math.min(...this.flows.map(f => f.s)) > GAP + 2)) this.spawn(leaving);
    }
    // the vehicles keep their distance in the lane; the first one at the kerb lets its fans out (or waits for them)
    const order = [...this.flows].sort((a, b) => b.s - a.s);
    order.forEach((f, k) => {
      const ahead = k > 0 ? order[k - 1] : null;
      let limit = CRUISE;
      if (ahead) limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * DECEL * (ahead.s - f.s - GAP))));
      if (f.state === 'drive' && f.s < this.dropS) limit = Math.min(limit, Math.sqrt(Math.max(0, 2 * DECEL * (this.dropS - f.s))));
      if (f.state === 'drop' || f.state === 'wait') limit = 0;
      const target = Math.max(0, limit);
      f.speed += Math.sign(target - f.speed) * Math.min(Math.abs(target - f.speed), (target > f.speed ? ACCEL : DECEL * 2) * dt);
      f.s += f.speed * dt;
      if (f.state === 'drive' && f.s >= this.dropS - 0.4 && f.speed < 0.3) { f.state = f.fans > 0 && !leaving ? 'drop' : leaving ? 'wait' : 'away'; f.t = 0; if (f.state === 'wait') this.callFans(f); }
      if (f.state === 'drop') { f.t += dt; if (f.t > 0.6) this.letOut(f); }
      if (f.state === 'wait') { f.t += dt; if (f.fans <= 0 || f.t > 12) { f.state = 'away'; this.stats.left++; } }
      this.place(f, dt);
    });
    // when the evening is over the fight traffic goes: out of sight at once, in sight it drives off
    const cam = this.ctx.camera.position;
    this.flows = this.flows.filter(f => {
      const gone = f.s >= this.end - 3 || (!on && Math.hypot(f.g.position.x - cam.x, f.g.position.z - cam.z) > 50);
      if (!on && !gone && f.state !== 'drive') f.state = 'away';
      if (gone) f.g.removeFromParent();
      return !gone;
    });
    if (!on) for (const fan of this.fans) if (fan.on && Math.hypot(fan.h.group.position.x - cam.x, fan.h.group.position.z - cam.z) > 50) { fan.on = false; fan.h.group.visible = false; fan.done?.(); fan.done = undefined; }
    for (const fan of this.fans) if (fan.on) this.walk(fan, dt);
  }

  private spawn(leaving: boolean) {
    let x = this.rand() * MIX.reduce((t, [, w]) => t + w, 0), kind: VehicleKind = 'taxi';
    for (const [k, w] of MIX) { x -= w; if (x <= 0) { kind = k; break; } }
    const pillion = kind === 'moto' && !leaving;
    const seed = kind === 'moto' ? (pillion ? motoWithPillion() : motoWithPillion() + 1) : Math.floor(this.rand() * 1e6);
    const g = buildVehicle(kind, { seed, driver: true, passengers: pillion }).group;
    this.group.add(g);
    const fans = kind === 'moto' ? 1 : 1 + Math.floor(this.rand() * 2.4);
    this.flows.push({ g, kind, seed, s: 0, speed: CRUISE * 0.8, state: 'drive', fans, t: 0, pillion });
    if (!leaving) this.stats.arrived++;
  }

  private place(f: Flow, dt: number) {
    this.path.sample(f.s, this.pose);
    const off = pullIn(this.path, [this.dropS], f.s, 2.3, 14, 10);
    const rx = -Math.cos(this.pose.yaw), rz = Math.sin(this.pose.yaw);
    f.g.position.set(this.pose.x + rx * off, 0.08, this.pose.z + rz * off);
    f.g.rotation.y = this.pose.yaw;
    animateVehicle(f.g, f.speed, 0, dt);
  }

  /** The fans get out on the pavement side and walk to the queue; the moto-taxi's pillion steps off. */
  private letOut(f: Flow) {
    const side = { x: f.g.position.x, z: f.g.position.z + 1.6 };
    for (let k = 0; k < f.fans; k++) {
      const fan = this.fans.find(x => !x.on); if (!fan) break;
      fan.on = true; fan.i = 0; fan.speed = 1.25 + this.rand() * 0.35;
      const from = { x: side.x - 1 + k * 0.9, z: side.z };
      fan.pts = this.walkToQueue(from);
      fan.h.group.position.set(from.x, 0.1, from.z); fan.h.group.visible = true; fan.h.hold = null;
      this.stats.fansOut++;
    }
    if (f.pillion) {                                                         // the moto without its passenger now
      const g = buildVehicle('moto', { seed: f.seed, driver: true, passengers: false }).group;
      g.position.copy(f.g.position); g.rotation.copy(f.g.rotation); f.g.removeFromParent(); this.group.add(g); f.g = g; f.pillion = false;
    }
    f.fans = 0; f.state = 'away';
  }

  /** Going home: fans come out of the gate to the waiting car. */
  private callFans(f: Flow) {
    const to = { x: f.g.position.x, z: f.g.position.z + 1.4 };
    let n = 0;
    for (let k = 0; k < f.fans; k++) {
      const fan = this.fans.find(x => !x.on); if (!fan) break;
      fan.on = true; fan.i = 0; fan.speed = 1.4 + this.rand() * 0.3;
      fan.pts = this.walkFromGate(to);
      fan.h.group.position.set(fan.pts[0].x, 0.1, fan.pts[0].z); fan.h.group.visible = true; fan.h.hold = null;
      fan.done = () => { f.fans--; this.stats.fansIn++; };
      n++;
    }
    f.fans = n;
  }

  private walk(fan: Fan, dt: number) {
    const p = fan.h.group.position, t = fan.pts[fan.i];
    if (!t) { fan.on = false; fan.h.group.visible = false; fan.done?.(); fan.done = undefined; return; }
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), step = fan.speed * dt;
    if (d <= step) { p.x = t.x; p.z = t.z; fan.i++; }
    else { p.x += (dx / d) * step; p.z += (dz / d) * step; fan.h.group.rotation.y = Math.atan2(dx, dz); }
    fan.h.animate(dt, fan.speed);
  }

  info() {
    return { flows: this.flows.map(f => ({ kind: f.kind, s: Math.round(f.s), speed: Math.round(f.speed * 10) / 10, state: f.state, x: f.g.position.x, z: f.g.position.z })),
      fans: this.fans.filter(f => f.on).length, parked: this.parked.filter(p => p.g).length, dropS: Math.round(this.dropS), ...this.stats };
  }

  dispose() {
    for (const f of this.fans) f.h.dispose();
    for (const p of this.parked) if (p.box) { const i = this.hub.colliders.indexOf(p.box); if (i >= 0) this.hub.colliders.splice(i, 1); }
    this.group.removeFromParent();
  }
}

let streets: ArenaStreets | null = null;
/** Debug only: play the streets at this hour (the checks reach the arrivals and the departures). */
let hourOverride: number | null = null;

export const arenaStreetsModule: GameModule = {
  name: 'arenaStreets',
  hubLoaded(ctx, hub) {
    streets?.dispose(); streets = null;
    if (!hub.arena) return;
    streets = new ArenaStreets(ctx, hub, gateOf(hub.arena), ctx.quality());
    ctx.extra.add(streets.group);
  },
  update(ctx, dt) {
    if (!streets || ctx.inside()) return;
    streets.update(dt, ctx.day(), hourOverride ?? ctx.hour());
  },
  debug: () => ({
    arenaStreets: { info: () => streets?.info() ?? null, hour: (h: number | null) => { hourOverride = h; } },
  }),
};
