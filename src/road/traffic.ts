import * as THREE from 'three';
import { animateVehicle, buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { makeCarRapide } from '../actors/vehicles';
import { wrapAngle, type Pt } from './network';
import type { Road } from './routes';

/**
 * Traffic on a road between districts: kit vehicles and motorbikes in both directions, right-hand, each in its lane. They are SOLID for the player's vehicle (the owned vehicle
 * collides with their footprints, src/road/host.ts hands them to `transport.addObstacles`) and they react to what is in front of them: another car, a parked or moving player vehicle,
 * a stall: they slow and stop behind it, and drive on when it is gone. A car that has been stopped too long, or that falls out of the window round the player, comes back elsewhere.
 * Visual and physical only: nothing here is saved or shared, like the districts' own decorative traffic.
 */
const MIX: [VehicleKind, number][] = [['carRapide', 18], ['taxi', 20], ['sedan', 14], ['suv', 10], ['moto', 14], ['pickup', 6], ['truck', 5], ['bus', 6], ['luxury', 4]];
/** Lateral offset of a lane's centre from the road's centre line (the carriageway is 11 m: lane centres at 2.8 m, motorbikes near the edge). */
const LANE: Partial<Record<VehicleKind, number>> = { moto: 4.2, bus: 3.0, truck: 3.0 };

function pickKind(r: number): VehicleKind {
  const total = MIX.reduce((a, [, w]) => a + w, 0); let x = r * total;
  for (const [k, w] of MIX) { x -= w; if (x <= 0) return k; }
  return MIX[0][0];
}

interface Car {
  g: THREE.Group; kind: VehicleKind;
  s: number; dir: 1 | -1; lane: number; v: number; cruise: number;
  hl: number; hw: number; stopped: number; live: boolean;
}

export interface Footprint { x: number; z: number; yaw: number; hl: number; hw: number }

/** What the traffic looks at ahead of a car. `solid`: road-frame position of a collider (stall, parked car…). `player`: road-frame position of the player's vehicle or body. */
export interface TrafficWorld { solid(x: number, z: number, r: number): boolean; player: Pt | null }

export class CorridorTraffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  /** Cars within the window of the player are simulated and drawn; the rest wait hidden. */
  constructor(private road: Road, private rand: () => number, count: number, lite: boolean) {
    this.group.name = 'road-traffic';
    for (let n = 0; n < count; n++) {
      const kind = pickKind(rand()), seed = Math.floor(rand() * 1e6);
      let g: THREE.Group, spec: { length: number; width: number; speed: number };
      if (kind === 'carRapide') { g = makeCarRapide({ seed }); spec = { length: 6.4, width: 2.2, speed: 8 }; }
      else { const b = buildVehicle(kind, { seed, lite }); g = b.group; spec = { length: b.spec.length, width: b.spec.width, speed: b.spec.speed }; }
      g.visible = false; this.group.add(g);
      this.cars.push({ g, kind, s: 0, dir: rand() < 0.5 ? 1 : -1, lane: LANE[kind] ?? 2.8, v: 0, cruise: Math.max(6, spec.speed) * (0.9 + rand() * 0.3), hl: spec.length / 2, hw: spec.width / 2, stopped: 0, live: false });
    }
  }

  get count() { return this.cars.length; }

  /** Footprints of the live cars within `range` metres of (x, z) (road frame), for the vehicle the player drives. */
  footprints(out: Footprint[], x: number, z: number, range: number, dx: number, dz: number) {
    for (const c of this.cars) {
      if (!c.live) continue;
      const p = c.g.position;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > range * range) continue;
      out.push({ x: p.x + dx, z: p.z + dz, yaw: c.g.rotation.y, hl: c.hl, hw: c.hw });
    }
  }

  positions() { return this.cars.filter(c => c.live).map(c => ({ x: c.g.position.x, z: c.g.position.z, v: c.v, dir: c.dir, kind: c.kind })); }

  private place(c: Car, snap: boolean, dt: number) {
    const a = this.road.spine.at(c.s), lat = -c.dir * c.lane;                            // right of the direction of travel
    const lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw);
    c.g.position.set(a.x + lx * lat, 0.08, a.z + lz * lat);
    const target = a.yaw + (c.dir > 0 ? 0 : Math.PI);
    c.g.rotation.y = snap ? target : c.g.rotation.y + wrapAngle(target - c.g.rotation.y) * Math.min(1, dt * 8);
  }

  /** Brings a car back into the window: 200–330 m from the player, ahead or behind, in a lane with nobody within 40 m. */
  private respawn(c: Car, from: Pt) {
    const L = this.road.length;
    for (let tries = 0; tries < 14; tries++) {
      const s = this.rand() * L, p = this.road.spine.at(s), d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < 200 || d > 330) continue;
      const dir: 1 | -1 = this.rand() < 0.5 ? 1 : -1;
      if (this.cars.some(o => o !== c && o.live && o.dir === dir && Math.abs(o.s - s) < 40)) continue;
      c.s = s; c.dir = dir; c.v = c.cruise * 0.7; c.stopped = 0; c.live = true; c.g.visible = true;
      this.place(c, true, 0);
      return;
    }
    c.live = false; c.g.visible = false;                                             // nowhere fit this frame: try again on the next
  }

  update(dt: number, w: TrafficWorld, focus: Pt | null) {
    const L = this.road.length;
    for (const c of this.cars) {
      if (!focus) { c.live = false; c.g.visible = false; continue; }
      if (!c.live) { this.respawn(c, focus); continue; }
      const p = c.g.position, dFocus = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (dFocus > 380 || c.s < 4 || c.s > L - 4) { c.live = false; c.g.visible = false; continue; }
      // what is ahead in this lane: the car in front, the player, a solid thing
      let gap = Infinity;
      for (const o of this.cars) {
        if (o === c || !o.live || o.dir !== c.dir) continue;
        const ds = (o.s - c.s) * c.dir - o.hl - c.hl;
        if (ds > -1 && ds < gap && Math.abs(o.lane - c.lane) < 1.6) gap = ds;
      }
      const look = Math.max(10, c.v * 1.6 + 6);
      for (let d = 4; d <= look && gap > d; d += 3) {
        const a = this.road.spine.at(c.s + c.dir * (d + c.hl)), lat = -c.dir * c.lane, lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw), x = a.x + lx * lat, z = a.z + lz * lat;
        if (w.solid(x, z, c.hw + 0.3) || (w.player && Math.hypot(x - w.player.x, z - w.player.z) < c.hw + 1.7)) gap = Math.min(gap, d);
      }
      const want = gap < 7 ? 0 : gap < look ? Math.min(c.cruise, Math.max(0, (gap - 6) * 1.2)) : c.cruise;
      c.v += Math.max(-8 * dt, Math.min(2.6 * dt, want - c.v));
      if (c.v < 0.05) { c.v = 0; c.stopped += dt; } else c.stopped = 0;
      if (c.stopped > 14) { c.live = false; c.g.visible = false; continue; }          // stuck behind something for good: it goes elsewhere
      c.s += c.dir * c.v * dt;
      this.place(c, false, dt);
      if (c.g.visible) animateVehicle(c.g, c.v, 0, dt);
    }
  }

  /** The kit's geometry and materials are shared with the districts' own traffic (cached models): only the cars' place in the scene is taken away. */
  dispose() { this.group.removeFromParent(); this.cars = []; }
}
