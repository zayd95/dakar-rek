import * as THREE from 'three';
import { animateVehicle, buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { makeCarRapide } from '../actors/vehicles';
import { wrapAngle, type Pt } from './network';
import { DIVIDED, type Profile, type Road } from './routes';

/**
 * Traffic on a road between districts: everyday Dakar, not a demolition derby. Kit vehicles and motorbikes in both directions, right-hand, each in its lane, a different mix on every
 * stretch (car rapides and motos near Pikine, buses and trucks on the arteries, quiet saloons toward the Almadies, taxis and buses in the dense approach to the Plateau, a coastal mix
 * on the Corniche). They are SOLID for the player's vehicle (the owned vehicle collides with their footprints, src/road/host.ts hands them to `transport.addObstacles`) and they react
 * to what is in front of them: another car, a parked or moving player vehicle, a stall: they slow and stop behind it, and drive on when it is gone.
 *
 * Life on top of that: taxis, car rapides and buses PULL OVER to the kerb stops of the road (`Road.stops`, where a few people wait), stand a few seconds and go on; a car stuck behind a
 * stopped vehicle PASSES it by the other lane when that lane is clear for a good way ahead (and gives up, or never starts, when it is not); a few cars hesitate for a moment; waiting
 * drivers sound a quiet horn now and then; one or two vehicles stand waiting at the side roads of a junction.
 *
 * Nobody is ever trapped by it: a car that has been stopped too long behind something it cannot get round is first passed through (a "ghost" for a few seconds: it no longer counts as
 * a solid thing for the player and sees nothing but walls), or, far from the player, put elsewhere. The player's vehicle is never moved. Visual and physical only: nothing here is
 * saved or shared, like the districts' own decorative traffic.
 */
type Mix = [VehicleKind, number][];
/** What drives where: weights by the road's character. */
const MIXES: Record<Profile, Mix> = {
  banlieue: [['carRapide', 26], ['moto', 22], ['taxi', 16], ['pickup', 12], ['sedan', 8], ['truck', 6], ['bus', 6], ['suv', 4]],
  market: [['carRapide', 24], ['taxi', 22], ['moto', 22], ['pickup', 8], ['sedan', 10], ['bus', 6], ['truck', 4], ['suv', 4]],
  artery: [['bus', 16], ['taxi', 18], ['sedan', 16], ['suv', 12], ['truck', 10], ['moto', 10], ['luxury', 8], ['pickup', 6], ['carRapide', 4]],
  villa: [['sedan', 24], ['suv', 20], ['luxury', 14], ['taxi', 14], ['moto', 8], ['pickup', 8], ['bus', 6], ['truck', 6]],
  coast: [['sedan', 20], ['taxi', 18], ['suv', 16], ['bus', 12], ['moto', 12], ['luxury', 8], ['pickup', 6], ['truck', 4], ['carRapide', 4]],
  downtown: [['taxi', 28], ['bus', 18], ['moto', 14], ['carRapide', 14], ['sedan', 12], ['suv', 6], ['truck', 4], ['pickup', 4]],
  // the VDN: a fast divided artery (taxis, family saloons, 4×4s, Dem Dikk buses, lorries); Sacré-Cœur: the neighbourhood's shopping street (taxis, motorbikes, pick-ups delivering)
  vdn: [['taxi', 20], ['sedan', 20], ['suv', 16], ['bus', 10], ['luxury', 8], ['truck', 8], ['moto', 10], ['pickup', 6], ['carRapide', 2]],
  sacrecoeur: [['taxi', 26], ['sedan', 18], ['moto', 18], ['suv', 10], ['pickup', 10], ['carRapide', 8], ['luxury', 6], ['bus', 4]],
};
/** How fast the traffic moves on each stretch, against the vehicles' own pace (a busy market crawls, an artery flows). */
const PACE: Record<Profile, number> = { banlieue: 0.9, market: 0.8, artery: 1.35, villa: 1.1, coast: 1.25, downtown: 0.85, vdn: 1.4, sacrecoeur: 0.9 };
/** Lateral offset of a lane's centre from the road's centre line (the carriageway is 11 m: lane centres at 2.8 m, motorbikes near the edge). */
const LANE: Partial<Record<VehicleKind, number>> = { moto: 4.2, bus: 3.0, truck: 3.0 };
const KERB_LANE = 4.4;
const STOPS: ReadonlySet<VehicleKind> = new Set<VehicleKind>(['taxi', 'carRapide', 'bus']);
const POOL_KINDS: VehicleKind[] = ['carRapide', 'taxi', 'moto', 'sedan', 'suv', 'bus', 'pickup', 'truck', 'luxury'];

function pickWeighted(mix: Mix, r: number): VehicleKind {
  const total = mix.reduce((a, [, w]) => a + w, 0); let x = r * total;
  for (const [k, w] of mix) { x -= w; if (x <= 0) return k; }
  return mix[0][0];
}

interface Car {
  g: THREE.Group; kind: VehicleKind;
  s: number; dir: 1 | -1; lane: number; v: number; cruise: number;
  hl: number; hw: number; stopped: number; live: boolean;
  /** 0 … 1: how far across into the opposite lane (overtaking), and how far toward the kerb (a stop). */
  across: number; kerb: number;
  ov: { until: number; blockerS: number; car?: Car | null } | null;
  held?: boolean;
  pull: { s: number; phase: 'in' | 'wait' | 'out'; t: number } | null;
  cool: number; seenStop: number;
  blockT: number; waitPlayer: number; hornT: number; pause: number; nextPause: number;
  ghost: number;
  /** Seconds left of backing off a little (nose to nose with the player's vehicle, which cannot get round). */
  back: number;
}

export interface Footprint { x: number; z: number; yaw: number; hl: number; hw: number }

/** What the traffic looks at ahead of a car. `solid`: road-frame position of a collider (stall, parked car…). `player`: road-frame position of the player's vehicle or body. */
export interface TrafficWorld {
  solid(x: number, z: number, r: number): boolean; player: Pt | null;
  /** The signals of the road (the BRT crossing, src/road/brt.ts): for traffic going `dir`, the stop lines it must hold at now (arc lengths). */
  signals?: (dir: 1 | -1) => { stopS: number; stop: boolean; amber: boolean }[];
}

export interface TrafficOpts {
  /** A driver sounds a horn: 0 (far) … 1 (close). The game answers with a very quiet recorded horn; checks leave it out. */
  onHorn?: (near: number) => void;
  /** Vehicles waiting at the side roads of the junctions (0 on the low preset). */
  waiters?: number;
}

interface Waiter { g: THREE.Group; x: number; z: number; yaw: number; hl: number; hw: number }

export class CorridorTraffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private waiters: Waiter[] = [];
  private live = 0;
  private maxLive: number;
  /** Counters for the checks: what the traffic has done (stops made, cars that passed a stopped vehicle, horns, ghosts, cars put elsewhere). */
  readonly stats = { pulled: 0, passed: 0, horns: 0, ghosts: 0, moved: 0, hesitations: 0 };

  constructor(private road: Road, private rand: () => number, count: number, lite: boolean, private o: TrafficOpts = {}) {
    this.group.name = 'road-traffic';
    this.maxLive = count;
    const pool = count + Math.ceil(count * 0.9);
    for (let n = 0; n < pool; n++) {
      const kind = n < POOL_KINDS.length ? POOL_KINDS[n] : pickWeighted(MIXES.artery.concat(MIXES.market), rand());
      this.cars.push(this.make(kind, lite));
    }
    // the side roads of the junctions: a vehicle waiting to turn out (the player's own vehicle sees it as a solid thing, so the junction reads as busy and is not driven through blindly)
    const nWait = Math.max(0, Math.min(o.waiters ?? 0, road.junctionS.reduce((a, j) => a + j.arms.length, 0)));
    let made = 0;
    for (const j of road.junctionS) for (const arm of j.arms) {
      if (made >= nWait) break;
      const dx = arm.b.x - arm.a.x, dz = arm.b.z - arm.a.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
      const kind: VehicleKind = (['sedan', 'taxi', 'moto', 'pickup'] as const)[Math.floor(rand() * 4)], c = this.make(kind, lite);
      const yaw = Math.atan2(-ux, -uz), d = 12 + rand() * 8, side = kind === 'moto' ? 2.2 : 2.7;
      const x = arm.a.x + ux * d + (-Math.cos(yaw)) * side, z = arm.a.z + uz * d + Math.sin(yaw) * side;     // facing the main road, on its right-hand side of the arm
      c.g.position.set(x, 0.08, z); c.g.rotation.y = yaw; c.g.visible = false;
      this.waiters.push({ g: c.g, x, z, yaw, hl: c.hl, hw: c.hw }); this.group.add(c.g);
      made++;
    }
  }

  private make(kind: VehicleKind, lite: boolean): Car {
    const seed = Math.floor(this.rand() * 1e6);
    let g: THREE.Group, spec: { length: number; width: number; speed: number };
    if (kind === 'carRapide') { g = makeCarRapide({ seed }); spec = { length: 6.4, width: 2.2, speed: 8 }; }
    else { const b = buildVehicle(kind, { seed, lite }); g = b.group; spec = { length: b.spec.length, width: b.spec.width, speed: b.spec.speed }; }
    g.visible = false; this.group.add(g);
    const c: Car = {
      g, kind, s: 0, dir: this.rand() < 0.5 ? 1 : -1, lane: LANE[kind] ?? 2.8, v: 0, cruise: Math.max(6, spec.speed) * (0.9 + this.rand() * 0.3),
      hl: spec.length / 2, hw: spec.width / 2, stopped: 0, live: false, across: 0, kerb: 0, ov: null, pull: null, cool: 0, seenStop: -1e9,
      blockT: 0, waitPlayer: 0, hornT: 3 + this.rand() * 6, pause: 0, nextPause: 25 + this.rand() * 60, ghost: 0, back: 0,
    };
    return c;
  }

  get count() { return this.cars.length; }
  get liveCount() { return this.live; }

  /** Lateral position of a car's centre from the road's centre line, in the road's left-hand frame (positive: on the left of a → b). */
  private latOf(c: Car) {
    let lane = c.lane * (1 - 2 * c.across);                                               // across: the lane of the other direction
    lane += (KERB_LANE - lane) * c.kerb;                                                 // kerb: its own right-hand edge
    return -c.dir * lane;
  }

  /** Checks: car `i` goes on the road at `s` in direction `dir`, live and at its cruising speed. */
  put(i: number, s: number, dir: 1 | -1) {
    const c = this.cars[i % this.cars.length];
    if (!c.live) this.live++;
    c.s = s; c.dir = dir; c.v = c.cruise; c.stopped = 0; c.live = true; c.g.visible = true; c.held = false; c.across = 0; c.kerb = 0; c.ov = null; c.pull = null; c.ghost = 0; c.blockT = 0; c.back = 0;
    this.place(c, true, 0);
    return { kind: c.kind, hl: c.hl, hw: c.hw, cruise: c.cruise };
  }
  /** Checks: hold car `i` still where it stands (a stopped vehicle ahead of the player), or let it go again. */
  hold(i: number, on: boolean) { const c = this.cars[i % this.cars.length]; c.held = on; if (on) c.v = 0; }

  /** Footprints of the live cars (and the waiting ones) within `range` metres of (x, z) (road frame), for the vehicle the player drives. A passing-through "ghost" is not solid. */
  footprints(out: Footprint[], x: number, z: number, range: number, dx: number, dz: number) {
    const r2 = range * range;
    for (const c of this.cars) {
      if (!c.live || c.ghost > 0) continue;
      const p = c.g.position;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > r2) continue;
      out.push({ x: p.x + dx, z: p.z + dz, yaw: c.g.rotation.y, hl: c.hl, hw: c.hw });
    }
    for (const w of this.waiters) {
      if (!w.g.visible || (w.x - x) ** 2 + (w.z - z) ** 2 > r2) continue;
      out.push({ x: w.x + dx, z: w.z + dz, yaw: w.yaw, hl: w.hl, hw: w.hw });
    }
  }

  positions() { return this.cars.filter(c => c.live).map(c => ({ x: c.g.position.x, z: c.g.position.z, v: c.v, dir: c.dir, kind: c.kind, s: c.s, across: c.across, kerb: c.kerb, ghost: c.ghost > 0, pull: c.pull?.phase ?? null })); }

  private place(c: Car, snap: boolean, dt: number) {
    const a = this.road.spine.at(c.s), lat = this.latOf(c);
    const lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw);
    c.g.position.set(a.x + lx * lat, 0.08, a.z + lz * lat);
    // heading: along the road, turned a little while moving across lanes (the car visibly angles into the other lane and back)
    const turn = c.across > 0.02 && c.across < 0.98 ? (c.ov ? 1 : -1) * c.dir * -0.32 * Math.sin(c.across * Math.PI) : 0;
    const target = a.yaw + (c.dir > 0 ? 0 : Math.PI) + turn;
    c.g.rotation.y = snap ? target : c.g.rotation.y + wrapAngle(target - c.g.rotation.y) * Math.min(1, dt * 8);
  }

  /** Brings a car back into the window: 200–330 m from the player, ahead or behind, in a lane with nobody within 40 m. The kind is picked for the stretch it lands on. */
  private respawn(c: Car, from: Pt) {
    if (this.live >= this.maxLive) return;
    const L = this.road.length;
    for (let tries = 0; tries < 14; tries++) {
      const s = this.rand() * L, p = this.road.spine.at(s), d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < 200 || d > 330) continue;
      const dir: 1 | -1 = this.rand() < 0.5 ? 1 : -1;
      if (this.cars.some(o => o !== c && o.live && o.dir === dir && Math.abs(o.s - s) < 40)) continue;
      const prof = this.road.profileAt(s);
      // a different car of the pool, if one suits this stretch better (a pooled vehicle is only swapped for one that is not on the road)
      const want = pickWeighted(MIXES[prof], this.rand());
      const better = c.kind === want ? c : this.cars.find(o => !o.live && o.kind === want) ?? c;
      if (better !== c) { this.revive(better, s, dir, prof); return; }
      this.revive(c, s, dir, prof);
      return;
    }
    c.live = false; c.g.visible = false;                                             // nowhere fit this frame: try again on the next
  }
  private revive(c: Car, s: number, dir: 1 | -1, prof: Profile) {
    c.s = s; c.dir = dir; c.v = c.cruise * PACE[prof] * 0.7; c.stopped = 0; c.live = true; c.g.visible = true;
    c.across = 0; c.kerb = 0; c.ov = null; c.pull = null; c.ghost = 0; c.blockT = 0; c.waitPlayer = 0; c.cool = 0; c.seenStop = -1e9; c.back = 0;
    this.live++;
    this.place(c, true, 0);
  }
  private kill(c: Car) { if (c.live) this.live--; c.live = false; c.g.visible = false; c.ov = null; c.pull = null; this.stats.moved++; }

  /** Is the opposite lane free for `ahead` metres in front of car `c` (no vehicle in it, no solid thing, the player not there)? */
  private oppositeClear(c: Car, w: TrafficWorld, ahead: number): boolean {
    const oppLat = c.dir * c.lane;                                                        // the centre of the other direction's lane
    for (const o of this.cars) {
      if (o === c || !o.live || o.ghost > 0) continue;
      const ds = (o.s - c.s) * c.dir;
      if (ds < -c.hl - o.hl - 4 || ds > ahead + o.v * 4) continue;
      if (Math.abs(this.latOf(o) - oppLat) < 2.4) return false;
    }
    for (let d = 6; d <= ahead; d += 6) {
      const a = this.road.spine.at(c.s + c.dir * d), lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw), x = a.x + lx * oppLat, z = a.z + lz * oppLat;
      if (w.solid(x, z, c.hw + 0.6)) return false;
      if (w.player && Math.hypot(x - w.player.x, z - w.player.z) < c.hw + 4) return false;
    }
    return true;
  }

  /** Is the car held by a red signal (nobody overtakes a queue at a red light)? */
  private atSignal(c: Car, w: TrafficWorld) {
    return !!w.signals?.(c.dir).some(sg => sg.stop && (sg.stopS - c.s) * c.dir > -1 && (sg.stopS - c.s) * c.dir < 80);
  }

  update(dt: number, w: TrafficWorld, focus: Pt | null) {
    const L = this.road.length;
    for (const c of this.cars) {
      if (!focus) { if (c.live) this.kill(c); continue; }
      if (!c.live) { this.respawn(c, focus); continue; }
      const p = c.g.position, dFocus = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (dFocus > 380 || c.s < 4 || c.s > L - 4) { this.kill(c); continue; }
      if (c.held) { c.v = 0; continue; }
      c.cool -= dt; c.hornT -= dt; c.pause -= dt; c.nextPause -= dt;
      const ghost = c.ghost > 0; if (ghost) c.ghost -= dt;
      const prof = this.road.profileAt(c.s), cruiseNow = c.cruise * PACE[prof] * (c.ov ? 1.05 : 1);

      // ---- what is ahead in this lane: the car in front (or coming the other way in it), the player, a solid thing
      let gap = Infinity, blockerV = 99, byPlayer = false, blocker: Car | null = null, solidAhead = false;
      const myLat = this.latOf(c);
      if (!ghost) {
        for (const o of this.cars) {
          if (o === c || !o.live || o.ghost > 0) continue;
          if (c.ov && o === c.ov.car) continue;
          const ds = (o.s - c.s) * c.dir - o.hl - c.hl;
          if (ds < -1 || ds > 70 || Math.abs(this.latOf(o) - myLat) > 1.7) continue;
          const eff = o.dir === c.dir ? ds : ds - o.v * 1.4;                           // coming towards us in our lane: it closes the gap twice as fast
          if (eff < gap) { gap = eff; blockerV = o.dir === c.dir ? o.v : 0; blocker = o; }
        }
      }
      const look = Math.max(10, c.v * 1.6 + 6);
      for (let d = 4; d <= look && gap > d; d += 3) {
        const a = this.road.spine.at(c.s + c.dir * (d + c.hl)), lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw), x = a.x + lx * myLat, z = a.z + lz * myLat;
        const nearBase = c.ov && Math.abs(myLat - -c.dir * c.lane) < 3.4 && (c.s - c.ov.blockerS) * c.dir < 8;      // while passing, the thing being passed is not in the way
        if (!ghost && !nearBase && w.solid(x, z, c.hw + 0.3)) { gap = Math.min(gap, d); blockerV = 0; solidAhead = true; blocker = null; }
        if (!ghost && w.player && Math.hypot(x - w.player.x, z - w.player.z) < c.hw + 1.7) { gap = Math.min(gap, d); blockerV = 0; byPlayer = true; blocker = null; }
        if (ghost && w.solid(x, z, c.hw)) gap = Math.min(gap, d);                       // a ghost still stops for walls
      }

      // ---- a signal ahead (the BRT crossing): red, stop at the line; amber, stop if there is room to, go on if already on it
      if (w.signals && !ghost) for (const sg of w.signals(c.dir)) {
        if (!sg.stop) continue;
        const toLine = (sg.stopS - c.s) * c.dir - c.hl;
        if (toLine < -0.5 || toLine > look + 30) continue;                              // already past it, or far
        if (sg.amber && toLine < Math.max(3, c.v * c.v / (2 * 6))) continue;             // too close to stop for an amber: clear the crossing
        if (toLine + 6 < gap) { gap = toLine + 6; blockerV = 0; blocker = null; }       // + 6: `want` brings a car to rest 6 m short of a gap
      }

      // ---- a few cars hesitate for a moment (a pedestrian, a doubt): everyday irregularity
      if (!c.pull && !c.ov && c.nextPause <= 0 && dFocus > 25) { c.pause = 1.2 + this.rand() * 2.2; c.nextPause = 45 + this.rand() * 90; this.stats.hesitations++; }

      // ---- public transport pulls over at a stop, waits, goes on
      if (!c.pull && !c.ov && c.cool <= 0 && !ghost && STOPS.has(c.kind)) {
        for (const st of this.road.stops) {
          if (st.dir !== c.dir || st.s === c.seenStop) continue;
          const ds = (st.s - c.s) * c.dir;
          if (ds > 30 && ds < 70) { c.seenStop = st.s; if (this.rand() < 0.65) c.pull = { s: st.s, phase: 'in', t: 0 }; break; }
        }
      }
      let want = gap < 7 ? 0 : gap < look ? Math.min(cruiseNow, Math.max(0, (gap - 6) * 1.2)) : cruiseNow;
      if (c.pause > 0) want = 0;
      if (c.pull) {
        const pu = c.pull, dist = (pu.s - c.s) * c.dir - c.hl * 0.4;
        if (pu.phase === 'in') {
          c.kerb = Math.min(1, c.kerb + dt * (dist < 28 ? 0.5 : 0));
          want = Math.min(want, dist > 0.5 ? Math.max(1.2, Math.sqrt(2 * 2.2 * dist)) : 0);
          if (dist < 1.2 && c.v < 0.4) { pu.phase = 'wait'; pu.t = 4 + this.rand() * 3.5; this.stats.pulled++; }
        } else if (pu.phase === 'wait') { want = 0; pu.t -= dt; if (pu.t <= 0) { pu.phase = 'out'; c.cool = 70; } }
        else { c.kerb = Math.max(0, c.kerb - dt * 0.55); if (c.kerb <= 0.02) { c.kerb = 0; c.pull = null; } }
      }

      // ---- stuck behind something that does not move: pass it by the other lane when that lane is clear (never when it is not)
      const stationary = blockerV < 1 && gap < 45;
      if (stationary && c.v < 4 && !c.pull && !ghost) c.blockT += dt; else if (!stationary) c.blockT = Math.max(0, c.blockT - dt * 2);
      if (!c.ov && !c.pull && c.blockT > 1.6 && c.across < 0.05 && gap < 40 && !(byPlayer && !solidAhead && !blocker) && !DIVIDED.has(prof) && !this.atSignal(c, w)) {
        if (this.oppositeClear(c, w, gap + c.hl * 2 + 70)) {
          c.ov = { until: c.s + c.dir * (gap + (blocker ? blocker.hl * 2 : 6) + c.hl + 12), blockerS: c.s + c.dir * (gap + c.hl) };
          c.ov.car = blocker;
        } else c.blockT = Math.max(0, c.blockT - dt);
      }
      if (c.ov) {
        const passed = (c.s - c.ov.until) * c.dir > 0, beside = (c.s - c.ov.blockerS) * c.dir > -2;
        if (passed) { c.ov = null; this.stats.passed++; }
        else {
          if (!beside && !this.oppositeClear(c, w, 55)) { c.ov = null; }                  // something came: back into the lane, behind the stopped vehicle
          else { c.across = Math.min(1, c.across + dt * 0.55); want = Math.max(want, Math.min(cruiseNow, 7)); if (gap < 7 && !blocker && !solidAhead) want = Math.max(want, 5); }
        }
      }
      if (!c.ov && c.across > 0) c.across = Math.max(0, c.across - dt * 0.5);

      // ---- horns: a waiting driver sounds it now and then (quiet by design: the game's own mix decides how much)
      if (byPlayer && gap < 20 && c.v < 0.5) c.waitPlayer += dt; else c.waitPlayer = Math.max(0, c.waitPlayer - dt);
      if ((c.waitPlayer > 2.4 || (c.blockT > 3 && !c.ov)) && c.hornT <= 0 && dFocus < 70) { this.o.onHorn?.(Math.max(0, 1 - dFocus / 70)); this.stats.horns++; c.hornT = 7 + this.rand() * 7; }

      // ---- nose to nose with the player's vehicle (it is in this lane and cannot get round: a moto cannot reverse): the driver backs off a few metres to let it through, when nothing is behind
      if (c.back > 0) {
        c.back -= dt; want = 0;
        const rearClear = !this.cars.some(o => o !== c && o.live && o.ghost <= 0 && o.dir === c.dir && Math.abs(this.latOf(o) - myLat) < 1.7 && (c.s - o.s) * c.dir > 0 && (c.s - o.s) * c.dir < c.hl + o.hl + 3);
        if (rearClear) c.s -= c.dir * 1.5 * dt;
      } else if (byPlayer && gap < 5 && c.v < 0.3 && c.waitPlayer > 2.4 && !c.pull && !ghost) c.back = 3.2;

      c.v += Math.max(-8 * dt, Math.min(2.6 * dt, want - c.v));
      // standing still only when it means to: a car that wants to go must not be zeroed again by the very step that sets it moving (one frame's acceleration is below this threshold at 60 fps,
      // which froze every stopped car for good on a fast device)
      if (c.v < 0.05) { if (want < 0.1) c.v = 0; c.stopped += dt; } else c.stopped = 0;
      // ---- never a deadlock: far from the player it is put elsewhere, near the player it passes through for a few seconds (it is not a solid thing meanwhile)
      const waiting = !!c.pull && c.pull.phase === 'wait';
      if (c.stopped > (byPlayer ? 11 : 22) && !waiting && c.pause <= 0) {
        if (dFocus > 70) { this.kill(c); continue; }
        if (!ghost) { c.ghost = 6; this.stats.ghosts++; c.stopped = byPlayer ? 7 : 18; }
      }
      c.s += c.dir * c.v * dt;
      this.place(c, false, dt);
      if (c.g.visible) animateVehicle(c.g, c.v, 0, dt);
    }
    // the waiters at the side roads follow the window like the rest: seen only when the player is near
    if (focus) for (const wt of this.waiters) wt.g.visible = Math.hypot(wt.x - focus.x, wt.z - focus.z) < 300; else for (const wt of this.waiters) wt.g.visible = false;
  }

  /** The kit's geometry and materials are shared with the districts' own traffic (cached models): only the cars' place in the scene is taken away. */
  dispose() { this.group.removeFromParent(); this.cars = []; this.waiters = []; this.live = 0; }
}
