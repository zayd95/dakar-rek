import * as THREE from 'three';
import type { HubId } from '../core/types';
import type { Seat } from '../interact/seats';
import { Apprentice } from '../actors/apprenti';
import { humanoidReady } from '../actors/humanoid';
import { newMotion, pullIn, type Motion, type Path, type Pose, type Timetable } from './route';
import { seatToWorld, toWorld, type LocalPose, type VehicleSpec, type WorldPose } from './spec';

/** Road surface height (the carriageway slab of the hub builder). */
export const ROAD_Y = 0.08;
/** Extra metres to the right when standing at a stop (pulled in to the kerb). */
export const PULL_IN = 1.1;

/** Speech bubble texture (the apprenti's calls), drawn in code like the parked apprentices' bubbles. */
export function callTexture(text: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 120;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgba(255,255,255,0.96)'; c.strokeStyle = '#1b2a7a'; c.lineWidth = 5;
  c.beginPath(); c.roundRect(6, 6, 372, 84, 30); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(84, 86); c.lineTo(68, 114); c.lineTo(112, 86); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(84, 89); c.lineTo(68, 114); c.lineTo(112, 89); c.stroke();
  c.fillStyle = '#1b2a7a'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 40; c.font = `italic 900 ${size}px system-ui, sans-serif`;
  while (c.measureText(text).width > 340 && size > 18) { size -= 2; c.font = `italic 900 ${size}px system-ui, sans-serif`; }
  c.fillText(text, 192, 49);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * A vehicle in the world, whoever drives it: the model (from its VehicleSpec), its passenger seats and driver seat in
 * the shared Seats registry (space = the vehicle id, moved with the vehicle every frame), the body's sway and bumps.
 * A controller places it each frame with `place()`: a line's timetable today (LineVehicle), the player's stick at the
 * driver seat in drive mode next.
 */
export class Vehicle {
  /** Group moved along the road (yaw); `body` sways inside it. */
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  readonly seats: Seat[];
  /** The driver's seat (locked like the others): an NPC driver on a line, the player in drive mode. */
  readonly driverSeat: Seat;
  /** Ground pose this frame (y = road) and the body's bounce above it. */
  readonly pose: WorldPose = { x: 0, y: ROAD_Y, z: 0, yaw: 0 };
  bounce = 0;
  speed = 0;
  accel = 0;
  /** Heading change rate (rad/s), smoothed — the body rolls with it. */
  yawRate = 0;
  private tmp = { x: 0, z: 0 };

  constructor(readonly spec: VehicleSpec, readonly id: string, private bumpy = 1) {
    this.group.name = 'vehicle:' + id;
    this.group.add(this.body);
    this.body.rotation.order = 'YXZ';
    this.body.add(spec.build());
    const seat = (s: { id: string }): Seat => ({ id: `${id}:${s.id}`, x: 0, z: 0, top: 0, yaw: 0, kind: 'vehicle', space: id, occupant: null, locked: true });
    this.seats = spec.seats.map(seat);
    this.driverSeat = seat(spec.driver);
  }

  /**
   * Put the vehicle at a ground pose (x, z, yaw) with its speed and acceleration; `travelled` (m) drives the road bumps.
   * Updates the body's sway and every seat's world pose.
   */
  place(x: number, z: number, yaw: number, speed: number, accel: number, travelled: number, dt: number) {
    const prev = this.pose.yaw;
    this.pose.x = x; this.pose.z = z; this.pose.yaw = yaw;
    this.speed = speed; this.accel = accel;
    const rate = dt > 0 ? Math.atan2(Math.sin(yaw - prev), Math.cos(yaw - prev)) / dt : 0;
    this.yawRate += (Math.max(-1.5, Math.min(1.5, rate)) - this.yawRate) * Math.min(1, dt * 6);
    // bumps on the road (stronger on Pikine's sandy streets), roll in corners, pitch when braking or pulling away
    const k = Math.min(1, speed / 4) * this.bumpy, sway = this.spec.sway ?? 1;
    this.bounce = (Math.sin(travelled * 1.9) * 0.022 + Math.sin(travelled * 4.7 + 1) * 0.012) * k;
    this.group.position.set(x, this.pose.y, z);
    this.group.rotation.y = yaw;
    this.body.position.y = this.bounce;
    const roll = this.yawRate * speed * 0.011 * sway;
    this.body.rotation.z = Math.max(-0.06, Math.min(0.06, this.spec.drive?.lean ? -roll * 3 : roll));
    this.body.rotation.x = (Math.max(-0.035, Math.min(0.035, -accel * 0.012)) + Math.sin(travelled * 3.1) * 0.004 * k) * sway;
    for (let i = 0; i < this.seats.length; i++) seatToWorld(this.pose, this.spec.seats[i], this.seats[i], this.bounce);
    seatToWorld(this.pose, this.spec.driver, this.driverSeat, this.bounce);
  }

  /** World position of a local point (on the ground). */
  world(lx: number, lz: number, out = this.tmp) { return toWorld(this.pose, lx, lz, out); }

  dispose() { this.group.removeFromParent(); }
}

/**
 * A vehicle of a public transport line: placed by the line's timetable on the shared clock (every player sees it at the
 * same spot), pulled in to the kerb at stops, with the apprenti on the rear step who steps down and calls the
 * destinations at each stop. It also reports the stops it reached since the previous frame, so a passenger never
 * misses a stop when frames are far apart.
 */
export class LineVehicle {
  readonly vehicle: Vehicle;
  readonly motion: Motion = newMotion();
  /** Stops the vehicle arrived at since the previous update (usually none, at most a few on a very slow frame). */
  readonly arrivals: number[] = [];
  apprentice: Apprentice | null = null;
  private bubble: THREE.Sprite | null = null;
  private calls: THREE.CanvasTexture[] = [];
  private callT = 0;
  private lastCall = -1;
  private p: Pose = { x: 0, z: 0, yaw: 0 };
  private crewAt: 'step' | 'door' | null = null;
  private lastT = NaN;
  /** Called when the vehicle arrives at a stop (index): passengers get on and off. */
  onArrive: (stop: number) => void = () => {};

  constructor(spec: VehicleSpec, hub: HubId, lineId: string, readonly index: number, private table: Timetable, private stopS: readonly number[], bumpy: number, rand: () => number) {
    this.vehicle = new Vehicle(spec, `${hub}:rapide:${lineId}:${index}`, bumpy);
    if (humanoidReady() && spec.crew) {
      this.apprentice = new Apprentice(hub, rand, true);
      this.apprentice.attach(this.vehicle.body);
      this.placeCrew('step');
    }
  }

  get id() { return this.vehicle.id; }
  get spec() { return this.vehicle.spec; }
  get pose() { return this.vehicle.pose; }
  get seats() { return this.vehicle.seats; }
  get group() { return this.vehicle.group; }
  get bounce() { return this.vehicle.bounce; }
  get path(): Path { return this.table.path; }
  world(lx: number, lz: number, out?: { x: number; z: number }) { return this.vehicle.world(lx, lz, out); }

  /** The calls the apprenti shouts (textures owned by the line; the last one is « Ñu dem ! », just before leaving). */
  setCalls(textures: THREE.CanvasTexture[]) {
    this.calls = textures;
    if (!this.apprentice || !textures.length) return;
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[0], depthWrite: false, transparent: true }));
    this.bubble.scale.set(2.1, 0.66, 1); this.bubble.position.set(0.7, 2.45, 0); this.bubble.visible = false;
    this.apprentice.h.group.add(this.bubble);
  }

  /** Place the vehicle for time t (seconds on the line's clock). */
  update(t: number, dt: number, near: boolean) {
    const table = this.table, m = table.at(t, this.motion), path = table.path;
    // stops reached since the previous update (arrival time crossed), in timetable order
    this.arrivals.length = 0;
    if (this.lastT === this.lastT && t > this.lastT) {
      const P = table.period, span = Math.min(t - this.lastT, P), t0 = ((this.lastT % P) + P) % P;
      for (let i = 0; i < table.stops.length; i++) {
        let d = table.stops[i].arrive - t0; if (d <= 0) d += P;
        if (d <= span) this.arrivals.push(i);
      }
    }
    this.lastT = t;
    path.sample(m.s, this.p);
    const off = pullIn(path, this.stopS, m.s, PULL_IN), off2 = pullIn(path, this.stopS, m.s + 1, PULL_IN);
    const rx = -Math.cos(this.p.yaw), rz = Math.sin(this.p.yaw);
    // easing towards the kerb turns the nose a little
    this.vehicle.place(this.p.x + rx * off, this.p.z + rz * off, this.p.yaw - Math.atan(off2 - off), m.v, m.a, m.s, dt);
    for (const i of this.arrivals) this.onArrive(i);
    this.updateCrew(dt, near);
  }

  private placeCrew(at: 'step' | 'door') {
    if (!this.apprentice || !this.spec.crew || this.crewAt === at) return;
    const p: LocalPose = this.spec.crew[at];
    this.apprentice.h.group.position.set(p.x, p.y, p.z); this.apprentice.h.group.rotation.y = p.yaw;
    this.apprentice.h.hold = at === 'door' ? 'Talk' : 'Idle';
    this.crewAt = at;
  }

  /** The apprenti steps down at stops and calls the destinations; back on the step when the car pulls away. */
  private updateCrew(dt: number, near: boolean) {
    const a = this.apprentice; if (!a) return;
    const m = this.motion;
    this.placeCrew(m.dwell >= 0 && m.dwellLeft > 1.2 ? 'door' : 'step');
    a.h.group.visible = near;
    if (near) a.update(dt, false);
    const b = this.bubble; if (!b) return;
    const calling = near && (m.dwell >= 0 || (m.eta < 5 && m.v < 6));
    this.callT += dt;
    b.visible = calling && Math.floor(this.callT / 2.2) % 4 !== 3;
    if (calling) {
      const n = this.calls.length - 1;
      const k = m.dwell >= 0 && m.dwellLeft < 2.2 ? n : Math.floor(this.callT / 2.2) % n;
      if (k !== this.lastCall) { this.lastCall = k; (b.material as THREE.SpriteMaterial).map = this.calls[k]; }
    }
  }

  dispose() {
    this.apprentice?.dispose(); this.apprentice = null;
    (this.bubble?.material as THREE.Material | undefined)?.dispose();
    this.vehicle.dispose();
  }
}
