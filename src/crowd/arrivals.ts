import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { HubWorld } from '../world/types';
import { makeTaxi } from '../actors/vehicles';
import { animateVehicle } from '../actors/vehicleKit';
import { rng } from '../core/rng';
import { ECURIES, gateOf, type ArenaGate } from '../arena/exteriorRules';
import { arenaExterior, eveningSize } from '../arena/exterior';
import { linesOf, stopOnLeg, KERB } from '../transport/lines';
import { STOP_OFFSET } from '../transport/stops';
import { transport } from '../transport/module';
import { Crowd, defaultLook, type CrowdQuality, type CrowdSlot } from './crowd';
import { GALA_DONE_COUNTER, streetAt } from '../arena/program';

/**
 * The arena's street is in its after-gala window (the gala seen to the end, or closing time): the same rule the arena
 * and its exterior use (src/arena/program.ts streetAt). Fans stop arriving then: the crowd pours out instead.
 */
export function afterGalaWindow(ctx: GameCtx): boolean {
  return streetAt(ctx.hour(), ctx.state.data.counters[GALA_DONE_COUNTER] === ctx.day()) === 'after';
}

/**
 * Fans arriving at the arena on fight evenings (docs/CROWD.md): taxis pull in at the two corners of the arena's street
 * and drop two to four supporters, the Ligne 23 car rapide lets a group off at its « Arène » stop, and everyone walks to
 * the tail of the queue lane at the gate (src/arena/exteriorRules.ts gateOf), where the exterior's own queue takes over.
 * The fans are crowd members (src/crowd/crowd.ts): instanced walking figures with a ground shadow, the nearest one or two
 * as full humanoids. More on the Friday–Sunday gala than on a weekday card; nothing when no bout is on, or when the
 * player is far from the arena.
 */
type Pt = { x: number; z: number };
interface Walker { id: string; path: Pt[]; i: number; speed: number; on: boolean; x: number; z: number; /** Seconds before stepping off. */ wait: number }
interface Cab {
  g: THREE.Group; route: CabRoute; s: number; v: number; state: 'off' | 'in' | 'stop' | 'out'; t: number; drop: number; dropped: number;
}
/** A taxi's run: along a road lane (x fixed) from z0 to z1, stopping at zs; fans step out at `alight` and walk `walk`. */
interface CabRoute { x: number; z0: number; zs: number; z1: number; alight: Pt; walk: Pt[] }

export const ARRIVALS = {
  /** Walkers at most, per quality. */
  pool: { low: 10, medium: 18, high: 26 } as Record<CrowdQuality, number>,
  /** Full humanoids among them (the nearest). */
  near: { low: 0, medium: 2, high: 3 } as Record<CrowdQuality, number>,
  /** Seconds between taxis (gala / card). */
  taxiEvery: { gala: 13, card: 32 },
  /** Fans per taxi and per car rapide stop (gala / card). */
  perTaxi: { gala: [2, 4], card: [1, 2] } as Record<'gala' | 'card', [number, number]>,
  perRapide: { gala: [4, 7], card: [2, 3] } as Record<'gala' | 'card', [number, number]>,
  /** Nothing spawns while the player is farther than this from the gate (m). */
  range: 150,
};

const CRUISE = 8.5, BRAKE = 12, DWELL = 4.2;

/** The two taxi runs of an arena gate: down the road on its west side, up the one on its east side (driving on the right). */
export function cabRoutes(g: ArenaGate): CabRoute[] {
  const tail = { x: g.x, z: g.queue.z1 - 0.35 };
  const W = g.x - 30, E = g.x + 30, street = g.z - 8.3;                  // road centre lines around the arena block
  const lane = 2.2, pave = KERB + 0.6;
  return [
    // from the north, heading −z on the west road: the pavement is on the +x side (towards the arena)
    { x: W + lane, z0: street + 110, zs: street + 14, z1: street - 75, alight: { x: W + pave, z: street + 14 },
      walk: [{ x: W + pave, z: street - 3 }, { x: tail.x - 3.7, z: tail.z }, tail] },
    // from the south, heading +z on the east road: the pavement is on the −x side (towards the arena)
    { x: E - lane, z0: street - 70, zs: street - 14, z1: street + 110, alight: { x: E - pave, z: street - 14 },
      walk: [{ x: E - pave, z: tail.z + 0.2 }, { x: tail.x + 3.7, z: tail.z }, tail] },
  ];
}

export class ArenaArrivals {
  readonly crowd: Crowd;
  private walkers: Walker[] = [];
  private cabs: Cab[] = [];
  private routes: CabRoute[];
  private gate: ArenaGate;
  private rand = rng(808);
  private taxiT = 4;
  private rapideT = 0;
  private dwelling = new Set<string>();
  private rapideStop: Pt | null = null;
  private ground: (x: number, z: number) => number;
  private quality: CrowdQuality;
  /** Debug: the arrivals' clock runs this many times faster (the checks on slow renderers). */
  speed = 1;
  /** Fans dropped so far (taxi, car rapide), for the checks. */
  readonly dropped = { taxi: 0, rapide: 0, arrived: 0 };
  active = false;

  constructor(private ctx: GameCtx, hub: HubWorld) {
    const a = hub.arena!;
    this.gate = gateOf(a);
    this.routes = cabRoutes(this.gate);
    this.ground = (x, z) => 0.1 + hub.heightAt(x, z);
    this.quality = ctx.quality();
    const n = ARRIVALS.pool[this.quality];
    const slots: CrowdSlot[] = Array.from({ length: n }, (_, i) => ({ id: `fan${i}`, x: this.gate.x, y: 0.1, z: this.gate.z - 20, yaw: 0, seated: false, tags: ['fans'] }));
    const R = rng(77);
    this.crowd = new Crowd(slots, {
      quality: this.quality, near: ARRIVALS.near[this.quality], name: 'arena-arrivals', seed: 31, blobs: true, nearRadius: 12,
      look: () => {
        const l = defaultLook(R), e = R() < 0.6 ? ECURIES[Math.floor(R() * ECURIES.length)] : null;
        if (e && l.style !== 'dress') { l.shirt = e.colour; if (l.style === 'boubou') l.legs = e.colour; }
        return l;
      },
    });
    this.walkers = slots.map(s => ({ id: s.id, path: [], i: 0, speed: 1.3, on: false, x: 0, z: 0, wait: 0 }));
    ctx.extra.add(this.crowd.group);
    // the Ligne 23 « Arène » stop: where its passengers step down on the pavement
    for (const line of linesOf(hub.id)) {
      const stop = line.stops.find(s => s.id === 'arene'); if (!stop) continue;
      const p = stopOnLeg(line, stop), rx = -p.dz, rz = p.dx;              // right of the direction of travel
      this.rapideStop = { x: p.x + rx * (STOP_OFFSET - 0.6), z: p.z + rz * (STOP_OFFSET - 0.6) };
    }
  }

  private evening(): 'gala' | 'card' { return eveningSize(this.ctx.day(), Math.max(17, this.ctx.hour())); }
  private span([a, b]: [number, number]) { return a + Math.floor(this.rand() * (b - a + 1)); }

  /** Send `n` fans from `from` along `path` (they appear one after the other). Returns how many were free. */
  spawn(from: Pt, path: Pt[], n: number, delay = 0.7): number {
    let k = 0;
    for (const w of this.walkers) {
      if (k >= n) break;
      if (w.on) continue;
      w.on = true; w.i = 0; w.speed = 1.15 + this.rand() * 0.45;
      const jx = (this.rand() - 0.5) * 0.8, jz = (this.rand() - 0.5) * 0.8;
      w.x = from.x + jx; w.z = from.z + jz;
      // a short wait before stepping off (one after the other), then the path with a little side offset each
      w.path = [{ x: w.x, z: w.z }, ...path.map((p, i) => (i === path.length - 1 ? p : { x: p.x + jx * 0.6, z: p.z + jz * 0.6 }))];
      w.wait = k * delay;
      this.crowd.setPresent(w.id, false);
      k++;
    }
    return k;
  }

  /** A taxi now (debug and checks): on route `r` (0 west, 1 east); `close`: it starts 25 m before its stop. */
  taxi(r = Math.floor(this.rand() * this.routes.length), close = false): boolean {
    let cab = this.cabs.find(c => c.state === 'off');
    if (!cab && this.cabs.length < 2) {
      const g = makeTaxi({ seed: 11 + this.cabs.length }); g.userData.noLod = true; g.visible = false;
      this.ctx.extra.add(g);
      cab = { g, route: this.routes[0], s: 0, v: 0, state: 'off', t: 0, drop: 0, dropped: 0 };
      this.cabs.push(cab);
    }
    if (!cab) return false;
    const route = this.routes[r % this.routes.length];
    const start = close ? Math.max(0, Math.abs(route.zs - route.z0) - 25) : 0;
    Object.assign(cab, { route, s: start, v: CRUISE, state: 'in', t: 0, drop: this.span(ARRIVALS.perTaxi[this.evening()]), dropped: 0 });
    cab.g.visible = true;
    return true;
  }

  update(dt: number) {
    dt *= this.speed;
    const me = this.ctx.player.pos, near = Math.hypot(me.x - this.gate.x, me.z - this.gate.z) < ARRIVALS.range;
    // fans come while the evening fills; once the after-gala window opens the exterior pours out instead
    this.active = arenaExterior.active() && near && !afterGalaWindow(this.ctx);
    this.crowd.group.visible = near;
    const size = this.evening();
    if (this.active) {
      this.taxiT -= dt;
      if (this.taxiT <= 0) { this.taxiT = ARRIVALS.taxiEvery[size] * (0.7 + this.rand() * 0.6); this.taxi(); }
      this.rapideT -= dt;
      if (this.rapideT <= 0) { this.rapideT = 0.5; this.watchRapide(size); }
    }
    for (const c of this.cabs) this.driveCab(c, dt);
    // the walkers: along their path to the queue's tail, where the exterior's queue takes over
    for (const w of this.walkers) {
      if (!w.on) continue;
      if (w.wait > 0) { w.wait -= dt; if (w.wait > 0) continue; }
      if (!this.crowd.has(w.id)) this.crowd.setPresent(w.id, true);
      const to = w.path[w.i + 1];
      if (!to) { w.on = false; this.crowd.setPresent(w.id, false); this.dropped.arrived++; continue; }
      const dx = to.x - w.x, dz = to.z - w.z, d = Math.hypot(dx, dz), stepLen = w.speed * dt;
      if (d <= stepLen) { w.x = to.x; w.z = to.z; w.i++; }
      else { w.x += (dx / d) * stepLen; w.z += (dz / d) * stepLen; }
      this.crowd.move(w.id, w.x, this.ground(w.x, w.z), w.z, Math.atan2(dx, dz), w.speed);
    }
    this.crowd.setFocus(me.x, me.z, null);
    if (near) this.crowd.setCamera(this.ctx.camera);
    this.crowd.update(dt, near);
  }

  private driveCab(c: Cab, dt: number) {
    if (c.state === 'off') return;
    const r = c.route, dir = Math.sign(r.z1 - r.z0), len = Math.abs(r.z1 - r.z0), stopAt = Math.abs(r.zs - r.z0);
    if (c.state === 'in') {
      const left = stopAt - c.s;
      c.v = left < BRAKE ? Math.max(0.6, CRUISE * Math.sqrt(Math.max(0, left) / BRAKE)) : CRUISE;
      c.s += c.v * dt;
      if (c.s >= stopAt) { c.s = stopAt; c.v = 0; c.state = 'stop'; c.t = 0; }
    } else if (c.state === 'stop') {
      c.t += dt;
      if (c.dropped === 0 && c.t > 0.8) { c.dropped = Math.max(1, this.spawn(r.alight, r.walk, c.drop, 0.6)); this.dropped.taxi += c.dropped; }
      if (c.t > DWELL) { c.state = 'out'; c.v = 0; }
    } else {
      c.v = Math.min(CRUISE, c.v + 3 * dt);
      c.s += c.v * dt;
      if (c.s >= len) { c.state = 'off'; c.g.visible = false; return; }
    }
    const z = r.z0 + dir * c.s;
    c.g.position.set(r.x, this.ground(r.x, z) - 0.02, z);
    c.g.rotation.y = dir > 0 ? 0 : Math.PI;
    animateVehicle(c.g, c.v, 0, dt);
  }

  /** The car rapide at the « Arène » stop: a group steps down each time one pulls in (read from the transport lane). */
  private watchRapide(size: 'gala' | 'card') {
    if (!this.rapideStop) return;
    const lines = (transport.debug(this.ctx).transport as { lines?: () => { id: string; stops: { id: string }[]; vehicles: { id: string; dwell: number }[] }[] } | undefined)?.lines?.();
    if (!lines) return;
    const now = new Set<string>();
    for (const l of lines) {
      const i = l.stops.findIndex(s => s.id === 'arene'); if (i < 0) continue;
      for (const v of l.vehicles) if (v.dwell === i) now.add(v.id);
    }
    for (const id of now) if (!this.dwelling.has(id)) {
      const tail = { x: this.gate.x, z: this.gate.queue.z1 - 0.35 };
      this.dropped.rapide += this.spawn(this.rapideStop, [{ x: tail.x - 3.7, z: tail.z }, tail], this.span(ARRIVALS.perRapide[size]), 0.55);
    }
    this.dwelling = now;
  }

  info() {
    return {
      active: this.active, size: this.evening(), dropped: { ...this.dropped }, walking: this.walkers.filter(w => w.on).length,
      cabs: this.cabs.map(c => ({ state: c.state, x: c.g.position.x, z: c.g.position.z, v: Math.round(c.v * 10) / 10 })),
      stop: this.rapideStop, routes: this.routes.map(r => ({ alight: r.alight, walk: r.walk })), crowd: this.crowd.stats(),
    };
  }

  dispose() {
    for (const c of this.cabs) c.g.removeFromParent();
    this.cabs = [];
    this.crowd.dispose();
  }
}
