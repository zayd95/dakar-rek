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
import { stopServed } from './transportPeek';
import { transport, type StopArrival } from '../transport/module';
import { Crowd, defaultLook, type CrowdQuality, type CrowdSlot } from './crowd';
import { routeClear } from './streetPlan';
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
export interface Walker { id: string; path: Pt[]; i: number; speed: number; on: boolean; x: number; z: number; /** Seconds before stepping off. */ wait: number }
interface Cab {
  g: THREE.Group; route: CabRoute; s: number; v: number; state: 'off' | 'in' | 'stop' | 'out'; t: number; drop: number; dropped: number;
  /** Picking people up after the gala (nobody gets out; it waits a little longer). */
  pickup: boolean;
}
/** A taxi's run: along a road lane (x fixed) from z0 to z1, stopping at zs; fans step out at `alight` and walk `walk`. */
export interface CabRoute { x: number; z0: number; zs: number; z1: number; alight: Pt; walk: Pt[] }

export const ARRIVALS = {
  /** Walkers at most, per quality. */
  pool: { low: 10, medium: 18, high: 26 } as Record<CrowdQuality, number>,
  /** Full humanoids among them (the nearest). */
  near: { low: 0, medium: 1, high: 2 } as Record<CrowdQuality, number>,
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

/** Metres a walker still has to go along its path. */
const left = (w: Walker) => {
  let d = 0, x = w.x, z = w.z;
  for (let i = w.i + 1; i < w.path.length; i++) { d += Math.hypot(w.path[i].x - x, w.path[i].z - z); x = w.path[i].x; z = w.path[i].z; }
  return d;
};
/** The `n` walkers on their way that are furthest along (least left to walk): they make room first. Pure. */
export function furthestAlong<W extends Walker>(walkers: readonly W[], n: number): W[] {
  if (n <= 0) return [];
  return walkers.filter(w => w.on).sort((a, b) => left(a) - left(b)).slice(0, n);
}

export class ArenaArrivals {
  readonly crowd: Crowd;
  private walkers: Walker[] = [];
  private cabs: Cab[] = [];
  private routes: CabRoute[];
  private gate: ArenaGate;
  private rand = rng(808);
  private taxiT = 4;
  /** Cars that pulled in at a stop since the last frame (transport.onArrival: none is missed on a slow frame). */
  private pulledIn: StopArrival[] = [];
  private unlisten: () => void;
  /** People waiting for a taxi at each route's corner (after the gala: src/crowd/street.ts sets it). */
  readonly demand = [0, 0];
  private pickupT = 0;
  /** Each line's « Arène » stop (`<line>:arene`): where its passengers step down, and their walk to the queue's tail. */
  private rapide: { key: string; stop: Pt; walk: Pt[] }[] = [];
  private side: Pt = { x: 0, z: 0 };
  private tail: Pt = { x: 0, z: 0 };
  private cols: HubWorld['colliders'];
  private ground: (x: number, z: number) => number;
  private quality: CrowdQuality;
  /** Not drawn (the player is inside the arena's walls): they keep arriving, unseen. */
  hidden = false;
  /** Debug: the arrivals' clock runs this many times faster (the checks on slow renderers). */
  speed = 1;
  /** Fans dropped so far (taxi, car rapide), for the checks. */
  readonly dropped = { taxi: 0, rapide: 0, arrived: 0, fans: 0 };
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
    this.unlisten = transport.onArrival(a => { if (a.key.endsWith(':arene')) this.pulledIn.push(a); });
    // the « Arène » stops (Ligne 23 by day, its evening route `23s` round the arena): where the passengers step down
    this.cols = hub.colliders;
    this.tail = { x: this.gate.x, z: this.gate.queue.z1 - 0.35 }; this.side = { x: this.tail.x - 3.7, z: this.tail.z };
    for (const line of linesOf(hub.id)) {
      const stop = line.stops.find(s => s.id === 'arene'); if (!stop) continue;
      const p = stopOnLeg(line, stop), rx = -p.dz, rz = p.dx;              // right of the direction of travel
      const at = { x: p.x + rx * (STOP_OFFSET - 0.6), z: p.z + rz * (STOP_OFFSET - 0.6) };
      this.rapide.push({ key: `${line.id}:arene`, stop: at, walk: this.walkFrom(at) });
    }
  }

  /** From where a car rapide's door opens to the queue's tail, round the stalls in the street. */
  private walkFrom(p: Pt): Pt[] {
    return [...(routeClear(p, this.side, this.cols) ?? [{ x: p.x, z: this.side.z + 4 }, this.side]), this.tail];
  }

  private evening(): 'gala' | 'card' { return eveningSize(this.ctx.day(), Math.max(17, this.ctx.hour())); }
  private span([a, b]: [number, number]) { return a + Math.floor(this.rand() * (b - a + 1)); }

  /**
   * Send `n` fans from `from` along `path` (they appear one after the other). Returns how many were free. `force`: the
   * group of the player's own car always gets off — when the pool is short, the walkers furthest along (nearly at the
   * queue) arrive at once and make room.
   */
  spawn(from: Pt, path: Pt[], n: number, delay = 0.7, force = false): number {
    if (force) {
      const short = n - this.walkers.filter(w => !w.on).length;
      for (const w of furthestAlong(this.walkers, short)) { w.on = false; this.crowd.setPresent(w.id, false); this.dropped.arrived++; }
    }
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

  /** The taxi runs (corners where fans get out, and where people leaving get in). */
  get cabRoutes(): readonly CabRoute[] { return this.routes; }
  /** A taxi stands at route r's corner now, picking people up. */
  pickingUp(r: number): boolean { return this.cabs.some(c => c.route === this.routes[r] && c.state === 'stop' && c.pickup); }

  /**
   * A taxi now (debug and checks): on route `r` (0 west, 1 east); `pickup`: it comes for people waiting there;
   * `close`: it starts 25 m before its stop.
   */
  taxi(r = Math.floor(this.rand() * this.routes.length), pickup = false, close = false): boolean {
    let cab = this.cabs.find(c => c.state === 'off');
    if (!cab && this.cabs.length < 2) {
      const g = makeTaxi({ seed: 11 + this.cabs.length }); g.userData.noLod = true; g.visible = false;
      this.ctx.extra.add(g);
      cab = { g, route: this.routes[0], s: 0, v: 0, state: 'off', t: 0, drop: 0, dropped: 0, pickup: false };
      this.cabs.push(cab);
    }
    if (!cab) return false;
    const route = this.routes[r % this.routes.length];
    const start = close ? Math.max(0, Math.abs(route.zs - route.z0) - 25) : 0;
    Object.assign(cab, { route, s: start, v: CRUISE, state: 'in', t: 0, drop: pickup ? 0 : this.span(ARRIVALS.perTaxi[this.evening()]), dropped: 0, pickup });
    cab.g.visible = true;
    return true;
  }

  update(dt: number) {
    dt *= this.speed;
    const me = this.ctx.player.pos, near = Math.hypot(me.x - this.gate.x, me.z - this.gate.z) < ARRIVALS.range;
    // fans come while the evening fills; once the after-gala window opens the exterior pours out instead
    this.active = arenaExterior.active() && near && !afterGalaWindow(this.ctx);
    this.crowd.group.visible = near && !this.hidden;
    const size = this.evening();
    if (this.active) {
      this.taxiT -= dt;
      if (this.taxiT <= 0) { this.taxiT = ARRIVALS.taxiEvery[size] * (0.7 + this.rand() * 0.6); this.taxi(); }
    }
    this.watchRapide(size, near);
    // after the gala: taxis come for the people waiting at the corners
    this.pickupT -= dt;
    if (this.pickupT <= 0 && near) {
      this.pickupT = 2;
      this.demand.forEach((n, r) => {
        if (n > 0 && !this.cabs.some(c => c.route === this.routes[r] && c.state !== 'off')) this.taxi(r, true);
      });
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
      if (!c.pickup && c.dropped === 0 && c.t > 0.8) { c.dropped = Math.max(1, this.spawn(r.alight, r.walk, c.drop, 0.6)); this.dropped.taxi += c.dropped; }
      if (c.t > (c.pickup ? DWELL + 2.5 : DWELL)) { c.state = 'out'; c.v = 0; }
    } else {
      c.v = Math.min(CRUISE, c.v + 3 * dt);
      c.s += c.v * dt;
      if (c.s >= len) { c.state = 'off'; c.g.visible = false; return; }
    }
    const z = r.z0 + dir * c.s;
    c.g.visible = !this.hidden;
    c.g.position.set(r.x, this.ground(r.x, z) - 0.02, z);
    c.g.rotation.y = dir > 0 ? 0 : Math.PI;
    animateVehicle(c.g, c.v, 0, dt);
  }

  /**
   * A car rapide pulled in at an « Arène » stop (transport.onArrival, heard the frame it happens even on slow frames; on
   * fight evenings that is the evening route `23s`'s stop, the day route's being parked): a group steps down at its rear
   * door and walks to the queue — more when it carried fans to this stop. Fans aboard get off even when the street's
   * phase changed during their ride; the player's own car always lets its group off (`spawn` with `force`).
   */
  private watchRapide(size: 'gala' | 'card', near: boolean) {
    const evs = this.pulledIn.splice(0);
    if (!near || !arenaExterior.active()) return;
    for (const e of evs) {
      const r = this.rapide.find(x => x.key === e.key);
      if (!r || !stopServed(e.key) || (!this.active && !e.fans)) continue;
      const live = transport.dwellingAt(e.key);
      const door = live?.vehicle === e.vehicle ? { x: live.x, z: live.z } : r.stop;
      const walk = Math.hypot(door.x - r.stop.x, door.z - r.stop.z) < 1.5 ? r.walk : this.walkFrom(door);
      const mine = transport.ridingVehicle() === e.vehicle;
      const k = this.spawn(door, walk, this.span(ARRIVALS.perRapide[size]) + (e.fans ? 2 : 0), 0.55, mine);
      this.dropped.rapide += k; if (e.fans) this.dropped.fans += k;
    }
  }

  info() {
    return {
      rapide: this.rapide.map(r => ({ key: r.key, served: stopServed(r.key), stop: r.stop, walk: r.walk })),
      active: this.active, size: this.evening(), dropped: { ...this.dropped }, walking: this.walkers.filter(w => w.on).length,
      cabs: this.cabs.map(c => ({ state: c.state, pickup: c.pickup, x: c.g.position.x, z: c.g.position.z, v: Math.round(c.v * 10) / 10 })), demand: [...this.demand],
      stop: this.rapide.find(r => stopServed(r.key))?.stop ?? null, routes: this.routes.map(r => ({ alight: r.alight, walk: r.walk })), crowd: this.crowd.stats(),
    };
  }

  dispose() {
    this.unlisten();
    for (const c of this.cabs) c.g.removeFromParent();
    this.cabs = [];
    this.crowd.dispose();
  }
}
