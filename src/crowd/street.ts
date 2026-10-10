import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import { rng } from '../core/rng';
import { linesOf } from '../transport/lines';
import { placeStops, type StopSite } from '../transport/stops';
import { arenaExterior } from '../arena/exterior';
import { gateOf } from '../arena/exteriorRules';
import { Crowd, LIVE_CROWDS, type CrowdQuality, type CrowdSlot } from './crowd';
import { dwellingNow, newArrivals } from './transportPeek';
import { afterGalaWindow, type ArenaArrivals } from './arrivals';
import { ambientLife } from '../social/ambientLife';
import {
  HUB_STREETS, PAVE, STREET_BUDGET, clearWalk, groupSpots, lanesFrom, pavementLanes, routeClear, stopSlots, streetTargets, type Lane,
} from './streetPlan';

/**
 * Street life with reasons (docs/CROWD.md, spec §23), on the reusable crowd: people walking the pavements (more at the
 * rushes, more on Sandaga's streets and the Pikine main street), people waiting at the car rapide stops (they get on
 * when one pulls in, others get off and walk away), groups chatting in front of the shops and kiosks (mostly in the
 * evening), and, after the gala at Pikine, the spectators leaving the arena for the Ligne 23 stop, the taxis at the
 * corners and the streets home. Instanced figures (a few draw calls), the nearest two or three as full humanoids the
 * player can greet; everything scales with the hour and the graphics quality. Traffic, weather and road events are the
 * city lane's.
 *
 * Nobody pops up in front of the player: people appear out of sight (far, or behind the camera) and otherwise walk in;
 * they leave the same way. Walkers keep to the front half of the pavement, people waiting or chatting to its back half,
 * on lanes checked against the hub's colliders (src/crowd/streetPlan.ts).
 */
type Pt = { x: number; z: number };
type Role = 'off' | 'walk' | 'stop' | 'group' | 'pickup' | 'gone';
interface Agent {
  id: string; role: Role;
  x: number; z: number; yaw: number; speed: number;
  /** On a lane: which, which way, metres along it, a small lateral offset of one's own. */
  lane: number; fwd: boolean; t: number; side: number;
  /** A straight walk first (a crossing, to a stop, into a car…), then `then`. */
  path: Pt[] | null; pi: number; then: (() => void) | null;
  /** Where one stands (stop place, group ring, taxi corner) and which stop / group / corner. */
  spot: { x: number; z: number; yaw: number } | null; stop: number; group: number; corner: number;
  /** Seconds left in this place before moving on (people waiting have a bus to catch, groups break up). */
  stay: number;
}
interface StopRt { site: StopSite; key: string; slots: { x: number; z: number; yaw: number }[]; taken: (Agent | null)[]; door: Pt }
interface GroupRt { x: number; z: number; ring: { x: number; z: number; yaw: number }[]; taken: (Agent | null)[]; on: boolean }

export const STREET_RANGE = { pop: 28, view: 70 };
/**
 * Where the arena lane's outflow takes the spectators out of the gate's street (src/arena/exteriorRules.ts
 * outflowDestinations: both street ends and the side corners): the street crowd carries them on from there.
 */
export const OUTFLOW_ENDS = (g: { x: number; z: number }) => [-1, 1].flatMap(sx => [{ x: g.x + sx * 34, z: g.z - 8 }, { x: g.x + sx * 25, z: g.z - 13 }]);
const SPEED = [1.05, 1.55] as const;

export class StreetLife {
  readonly crowd: Crowd;
  private agents: Agent[] = [];
  private lanes: Lane[];
  private laneW: number[];
  private stops: StopRt[] = [];
  private groups: GroupRt[] = [];
  private corners: { slots: { x: number; z: number; yaw: number }[]; taken: (Agent | null)[]; door: Pt }[] = [];
  private ready = false;
  /** The hub's colliders, plus the arena's queue lane while fans queue in it (street walkers keep out). */
  private cols: Collider[];
  private closedQueue = false;
  private prepT = 1.2;
  private rand = rng(1709);
  private q: CrowdQuality;
  private hub: HubWorld;
  private ground: (x: number, z: number) => number;
  private planT = 0;
  private busT = 0;
  private dwelling = new Set<string>();
  private target = { walkers: 0, perStop: 0, groups: 0 };
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private sp = new THREE.Sphere(new THREE.Vector3(), 1.2);
  // after the gala (Pikine)
  private eventWas = false;
  private eventSeen = false;
  private standsMax = 0;
  private leaving = 0;
  private leaveT = 0;
  readonly counts = { spawned: 0, boarded: 0, alighted: 0, left: 0, taxi: 0, recruited: 0 };

  constructor(private ctx: GameCtx, hub: HubWorld, private arrivals: ArenaArrivals | null = null) {
    this.hub = hub;
    this.cols = hub.colliders;
    this.q = ctx.quality();
    this.ground = (x, z) => 0.1 + hub.heightAt(x, z);
    const B = STREET_BUDGET[this.q], busy = HUB_STREETS[hub.id]?.busy ?? [];
    this.lanes = pavementLanes(hub.edges, hub.colliders, busy);
    this.laneW = this.lanes.map(l => l.w * l.len);
    const slots: CrowdSlot[] = Array.from({ length: B.pool }, (_, i) => ({ id: `p${i}`, x: 0, y: 0.1, z: 0, yaw: 0, seated: false, tags: ['street'] }));
    this.crowd = new Crowd(slots, { quality: this.q, near: B.near, nearRadius: 9, name: 'street', seed: 61 + hub.id.length, blobs: true, fidget: 0.02 });
    this.agents = slots.map(s => ({ id: s.id, role: 'off', x: 0, z: 0, yaw: 0, speed: 0, lane: 0, fwd: true, t: 0, side: 0, path: null, pi: 0, then: null, spot: null, stop: -1, group: -1, corner: -1, stay: 0 }));
    ctx.extra.add(this.crowd.group);
  }

  /** Stops, groups and taxi corners need the places and the city's own people of the hub (registered after us). */
  private prepare() {
    this.ready = true;
    const hub = this.hub, cols = hub.colliders;
    const avoid: Pt[] = [...hub.people.map(p => ({ x: p.x, z: p.z })), ...ambientLife.standPoints()];
    for (const c of LIVE_CROWDS) if (c !== this.crowd) for (const s of c.slots()) avoid.push(s);
    for (const line of linesOf(hub.id)) for (const site of placeStops(line, cols)) {
      const slots = stopSlots(site, cols, avoid);
      this.stops.push({ site, key: `${line.id}:${site.def.id}`, slots, taken: slots.map(() => null), door: { x: site.x - site.rx * 1.15, z: site.z - site.rz * 1.15 } });
    }
    const fronts = [...hub.interactables.filter(i => !i.npc).map(i => ({ x: i.x, z: i.z })),
      ...this.ctx.places.all().filter(p => p.space === 'street' && /shop|stall|dibi|salon|cafe|market|gargote|maiga/.test(p.type)).flatMap(p => p.anchors.slice(0, 1))];
    const stopAvoid = this.stops.flatMap(s => [s.site, ...s.slots]);
    for (const g of groupSpots(fronts, this.lanes, cols, [...avoid, ...stopAvoid])) this.groups.push({ ...g, taken: g.ring.map(() => null), on: false });
    // stable order: the groups that come first in the evening are the same every day
    this.groups.sort((a, b) => hash(a.x, a.z) - hash(b.x, b.z));
    // after the gala, people wait for taxis at the corners where the arrivals drop the fans
    for (const r of this.arrivals?.cabRoutes ?? []) {
      const sx = Math.sign(r.alight.x - r.x), slots: { x: number; z: number; yaw: number }[] = [];
      for (const dz of [-1.6, -0.8, 0, 0.8, 1.6, 2.4]) {
        const p = { x: r.alight.x + sx * (PAVE.wait - PAVE.kerb - 0.6), z: r.alight.z + dz, yaw: Math.atan2(-sx, 0) };
        if (clearWalk(p.x, p.z, p.x, p.z, cols, 0.25)) slots.push(p);
      }
      this.corners.push({ slots, taken: slots.map(() => null), door: { x: r.alight.x - sx * 0.4, z: r.alight.z } });
    }
  }

  // ---------------------------------------------------------------- seeing and placing
  private seen(x: number, z: number) {
    const me = this.ctx.player.pos, d = Math.hypot(x - me.x, z - me.z);
    if (d > STREET_RANGE.view) return false;
    if (d < STREET_RANGE.pop) return true;
    this.sp.center.set(x, 1, z);
    return this.frustum.intersectsSphere(this.sp);
  }
  private free(): Agent | null { return this.agents.find(a => a.role === 'off') ?? null; }
  /** A walker out of sight gives up their place (the pool is full and someone with a reason needs it). */
  private recycle(): Agent | null {
    const a = this.agents.find(x => x.role === 'walk' && !x.path && !this.seen(x.x, x.z));
    if (!a) return null;
    this.hide(a); return a;
  }
  private show(a: Agent) { this.crowd.setPresent(a.id, true); this.place(a); this.counts.spawned++; }
  private hide(a: Agent) {
    this.release(a);
    a.role = 'off'; a.path = null; a.then = null; a.speed = 0;
    this.crowd.setPresent(a.id, false);
  }
  private place(a: Agent) { this.crowd.move(a.id, a.x, this.ground(a.x, a.z), a.z, a.yaw, a.speed); }
  /** Give back the stop place / group place / corner place an agent held. */
  private release(a: Agent) {
    if (a.stop >= 0) { const s = this.stops[a.stop], i = s.taken.indexOf(a); if (i >= 0) s.taken[i] = null; }
    if (a.group >= 0) { const g = this.groups[a.group], i = g.taken.indexOf(a); if (i >= 0) g.taken[i] = null; }
    if (a.corner >= 0) { const c = this.corners[a.corner], i = c.taken.indexOf(a); if (i >= 0) c.taken[i] = null; }
    a.stop = -1; a.group = -1; a.corner = -1; a.spot = null;
    this.crowd.setMemberMood(a.id, 'rest');
  }

  private lanePt(l: Lane, t: number, side: number): Pt {
    const dx = (l.bx - l.ax) / l.len, dz = (l.bz - l.az) / l.len, rx = -dz * l.side, rz = dx * l.side;
    return { x: l.ax + dx * t + rx * side, z: l.az + dz * t + rz * side };
  }
  /** A lane to spawn on: busy streets weigh more, lanes far from the player much less. */
  private pickLane(): number {
    const me = this.ctx.player.pos, life = STREET_BUDGET[this.q].life;
    const w = this.lanes.map((l, i) => this.laneW[i] * (Math.hypot((l.ax + l.bx) / 2 - me.x, (l.az + l.bz) / 2 - me.z) < life ? 1 : 0.08));
    let sum = 0; for (const v of w) sum += v;
    let u = this.rand() * sum;
    for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return i; }
    return w.length - 1;
  }
  private alive(x: number, z: number) { const me = this.ctx.player.pos; return Math.hypot(x - me.x, z - me.z) < STREET_BUDGET[this.q].life; }
  /** The lanes nearest (x, z), nearest first, with the closest point on each. */
  private nearLanes(x: number, z: number, n = 4) {
    return this.lanes.map((l, i) => {
      const dx = l.bx - l.ax, dz = l.bz - l.az, t = Math.max(0, Math.min(l.len, ((x - l.ax) * dx + (z - l.az) * dz) / l.len));
      const p = this.lanePt(l, t, 0);
      return { lane: i, t, d: Math.hypot(p.x - x, p.z - z) };
    }).sort((a, b) => a.d - b.d).slice(0, n);
  }

  /** Start walking a lane from a point on it. */
  private walkOn(a: Agent, lane: number, t: number, fwd: boolean) {
    a.role = 'walk'; a.lane = lane; a.t = t; a.fwd = fwd; a.speed = SPEED[0] + this.rand() * (SPEED[1] - SPEED[0]);
    a.side = (this.rand() - 0.5) * 0.24;
    this.crowd.setMemberMood(a.id, 'rest');
  }
  /** Walk straight through `pts`, then do `then`. */
  private walkTo(a: Agent, pts: Pt[], then: () => void, speed = 1.3) {
    a.path = [{ x: a.x, z: a.z }, ...pts]; a.pi = 0; a.then = then; a.speed = speed;
  }
  /** Back to a lane from wherever one stands (a stop, a group), then walking on. */
  private toLane(a: Agent) {
    this.release(a);
    for (const n of this.nearLanes(a.x, a.z)) {
      const l = this.lanes[n.lane], p = this.lanePt(l, n.t, 0), route = routeClear(a, p, this.cols);
      if (!route) continue;
      const fwd = this.rand() < 0.5;
      this.walkTo(a, route, () => this.walkOn(a, n.lane, n.t, fwd));
      return;
    }
    this.hide(a);                                                      // nowhere to go (never seen in the hubs' tests)
  }

  // ---------------------------------------------------------------- spawning with a reason
  /** A walker appears on a lane out of sight. */
  private spawnWalker(): boolean {
    const a = this.free(); if (!a) return false;
    for (let k = 0; k < 6; k++) {
      const lane = this.pickLane(), l = this.lanes[lane], t = this.rand() * l.len, p = this.lanePt(l, t, 0);
      if (this.seen(p.x, p.z) || (this.closedQueue && !clearWalk(p.x, p.z, p.x, p.z, this.cols, 0.3))) continue;
      this.walkOn(a, lane, t, this.rand() < 0.5);
      a.x = p.x; a.z = p.z; this.show(a);
      return true;
    }
    return false;
  }
  /** Someone comes to wait at a stop: a walker passing by, or someone out of sight already there. */
  private fillStop(si: number): boolean {
    const s = this.stops[si], i = s.taken.indexOf(null); if (i < 0) return false;
    const slot = s.slots[i];
    let route: Pt[] | null = null, tries = 0;
    const near = this.agents.find(a => a.role === 'walk' && !a.path && Math.hypot(a.x - slot.x, a.z - slot.z) < 22 && tries++ < 3 && !!(route = routeClear(a, slot, this.cols)));
    const a = near ?? this.free(); if (!a) return false;
    if (!near && this.seen(slot.x, slot.z)) return false;
    s.taken[i] = a; a.stop = si; a.spot = slot; a.stay = 40 + this.rand() * 120;
    const settle = () => { a.role = 'stop'; a.speed = 0; a.x = slot.x; a.z = slot.z; a.yaw = slot.yaw; if (this.rand() < 0.5) this.crowd.setMemberMood(a.id, 'chat'); this.place(a); };
    if (near) { this.counts.recruited++; a.role = 'stop'; this.walkTo(a, route ?? [slot], settle); }
    else { a.x = slot.x; a.z = slot.z; a.role = 'stop'; this.show(a); settle(); }
    return true;
  }
  /** A group gathers in front of a shop: out of sight they are just there, in sight they walk up one by one. */
  private fillGroup(gi: number): boolean {
    const g = this.groups[gi], i = g.taken.indexOf(null); if (i < 0) return false;
    const spot = g.ring[i];
    let route: Pt[] | null = null, tries = 0;
    const near = this.agents.find(a => a.role === 'walk' && !a.path && Math.hypot(a.x - spot.x, a.z - spot.z) < 20 && tries++ < 3 && !!(route = routeClear(a, spot, this.cols)));
    const a = near ?? this.free(); if (!a) return false;
    if (!near && this.seen(spot.x, spot.z)) return false;
    g.taken[i] = a; a.group = gi; a.spot = spot; a.stay = 60 + this.rand() * 240;
    const settle = () => { a.role = 'group'; a.speed = 0; a.x = spot.x; a.z = spot.z; a.yaw = spot.yaw; this.crowd.setMemberMood(a.id, 'chat'); this.place(a); };
    if (near) { this.counts.recruited++; a.role = 'group'; this.walkTo(a, route ?? [spot], settle); }
    else { a.x = spot.x; a.z = spot.z; a.role = 'group'; this.show(a); settle(); }
    return true;
  }

  // ---------------------------------------------------------------- every frame
  update(dt: number) {
    if (!this.ready) { this.prepT -= dt; if (this.prepT > 0) return; this.prepare(); }
    // while fans queue at the arena gate, the queue lane is theirs: street walkers go round or turn back
    const closed = !!this.hub.arena && arenaExterior.active() && !afterGalaWindow(this.ctx);
    if (closed !== this.closedQueue) {
      this.closedQueue = closed;
      const q = gateOf(this.hub.arena!).queue;
      this.cols = closed ? [...this.hub.colliders, { x0: q.x - q.half - 0.6, x1: q.x + q.half + 0.6, z0: q.z1 - 1.2, z1: q.z0 + 0.5, h: 1 }] : this.hub.colliders;
    }
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    this.planT -= dt;
    if (this.planT <= 0) { this.planT = 1; this.plan(); }
    this.busT -= dt;
    if (this.busT <= 0) { this.busT = 0.5; this.buses(); }
    this.afterGala(dt);
    for (const a of this.agents) if (a.role !== 'off') this.step(a, dt);
    const me = this.ctx.player.pos;
    this.crowd.setFocus(me.x, me.z, null);
    this.crowd.setCamera(cam);
    this.crowd.update(dt, true);
  }

  /** Once a second: bring the street towards the hour's targets, a few people at a time. */
  private plan() {
    const liveStops = this.stops.filter(s => this.alive(s.site.x, s.site.z)), liveGroups = this.groups.filter(g => this.alive(g.x, g.z));
    const t = streetTargets(this.hub.id, this.ctx.hour(), this.q, liveStops.length, liveGroups.length);
    if (this.leaving > 0) t.walkers = Math.max(0, t.walkers - Math.min(this.leaving, 24));   // room for the spectators leaving
    this.target = t;
    // groups: the first `groups` spots near the player gather, the others break up (in sight, they walk away)
    let n = 0;
    this.groups.forEach(g => {
      g.on = this.alive(g.x, g.z) && n++ < t.groups;
      if (!g.on) for (const a of g.taken) if (a && a.role === 'group' && !a.path) { if (this.seen(a.x, a.z)) this.toLane(a); else this.hide(a); }
    });
    let budget = 4;                                                  // changes per second, so the street fills smoothly
    for (let gi = 0; gi < this.groups.length && budget > 0; gi++) if (this.groups[gi].on && this.fillGroup(gi)) budget--;
    // stops: up to perStop waiting at each (more for the Arène stop after a gala)
    this.stops.forEach((s, si) => {
      const want = !this.alive(s.site.x, s.site.z) ? 0 : Math.min(s.slots.length, t.perStop + (this.leaving > 0 || s.taken.some(a => a && a.stay > 300) ? 6 : 0));
      const have = s.taken.filter(Boolean).length;
      if (have < want && budget > 0 && this.fillStop(si)) budget--;
      if (have > want) { const a = s.taken.find(x => x && x.role === 'stop' && !x.path); if (a) { if (this.seen(a.x, a.z)) this.toLane(a); else this.hide(a); } }
    });
    // people waiting for a taxi at the corners call one
    if (this.arrivals) this.corners.forEach((c, ci) => { this.arrivals!.demand[ci] = c.taken.filter(a => a && a.role === 'pickup' && !a.path).length; });
    // walkers: out of sight in, out of sight out
    const walking = this.agents.filter(a => a.role === 'walk').length;
    if (walking < t.walkers) for (let k = 0; k < Math.min(3, t.walkers - walking); k++) this.spawnWalker();
    if (walking > t.walkers) for (const a of this.agents) if (a.role === 'walk' && !a.path && !this.seen(a.x, a.z)) { this.hide(a); break; }
    // walkers who wandered far from the player come back near them (out of sight both ways)
    let moved = 0;
    for (const a of this.agents) if (moved < 3 && a.role === 'walk' && !a.path && !this.alive(a.x, a.z) && !this.seen(a.x, a.z)) { this.hide(a); this.spawnWalker(); moved++; }
    // people who have waited long enough move on
    for (const a of this.agents) if ((a.role === 'stop' || a.role === 'group') && !a.path && (a.stay -= 1) <= 0) { if (this.seen(a.x, a.z)) this.toLane(a); else this.hide(a); }
  }

  /** A car rapide pulls in: two or three of those waiting get on, one or two get off and walk away. */
  private buses() {
    const now = dwellingNow(this.ctx);
    for (const key of newArrivals(this.dwelling, now)) {
      const si = this.stops.findIndex(s => s.key === key); if (si < 0) continue;
      const s = this.stops[si];
      let board = 2 + Math.floor(this.rand() * 2) + (this.leaving > 0 && key.endsWith(':arene') ? 4 : 0);
      for (const a of s.taken) if (a && board > 0 && a.role === 'stop' && !a.path) {
        const route = routeClear(a, s.door, this.cols); if (!route) continue;
        board--; this.counts.boarded++;
        this.walkTo(a, route, () => this.hide(a), 1.4);
      }
      const off = this.rand() < 0.5 ? 1 : 2;
      for (let k = 0; k < off; k++) {
        const a = this.free(); if (!a) break;
        a.x = s.door.x + (this.rand() - 0.5) * 0.6; a.z = s.door.z + (this.rand() - 0.5) * 0.6; a.role = 'walk';
        this.show(a); this.counts.alighted++;
        this.toLane(a);
      }
    }
    this.dwelling = now;
  }

  /**
   * After the gala (Pikine): the spectators come out where the exterior's queue lane meets the street (the gate side
   * is the arena lane's) and head for the Ligne 23 stop, the taxis at the corners, or home along the streets.
   */
  private afterGala(dt: number) {
    if (!this.hub.arena) return;
    // the after-gala window opens (the gala seen to the end, or closing time) on an evening the arena's street was alive
    if (arenaExterior.active() && !afterGalaWindow(this.ctx)) this.eventSeen = true;
    const on = afterGalaWindow(this.ctx) && this.eventSeen;
    for (const c of LIVE_CROWDS) if (c.name === 'arena-stands') this.standsMax = Math.max(this.standsMax, c.present);
    const me = this.ctx.player.pos, g = gateOf(this.hub.arena);
    if (!this.eventWas && on && Math.hypot(me.x - g.x, me.z - g.z) < 160) {
      const pool = STREET_BUDGET[this.q].pool;
      this.leaving = Math.round(Math.min(pool * 0.6, Math.max(this.standsMax * 0.16, this.q === 'low' ? 10 : 18)));
      this.leaveT = 0; this.standsMax = 0; this.eventSeen = false;
    }
    this.eventWas = on;
    if (this.leaving <= 0) return;
    this.leaveT -= dt;
    if (this.leaveT > 0) return;
    this.leaveT = 0.9 + this.rand() * 0.9;
    const a = this.free() ?? this.recycle(); if (!a) return;
    this.leaving--; this.counts.left++;
    // they come from where the arena lane's outflow leaves the gate's street (its ends and the corners), else the queue's tail
    const from = OUTFLOW_ENDS(g)[Math.floor(this.rand() * 4)];
    const p0 = clearWalk(from.x, from.z, from.x, from.z, this.cols, 0.3) ? from : { x: g.x, z: g.queue.z1 - 0.3 };
    a.x = p0.x + (this.rand() - 0.5) * 2; a.z = p0.z + (this.rand() - 0.5) * 2; a.yaw = Math.PI; a.role = 'walk';
    if (!clearWalk(a.x, a.z, a.x, a.z, this.cols, 0.3)) { a.x = p0.x; a.z = p0.z; }
    this.show(a);
    const u = this.rand();
    const stop = this.stops.map((s, i) => ({ i, d: Math.hypot(s.site.x - a.x, s.site.z - a.z) })).filter(s => s.d < 90).sort((x, y) => x.d - y.d)[0]?.i ?? -1;
    if (u < 0.4 && stop >= 0) {                                          // the car rapide home
      const arene = stop, s = this.stops[arene], i = s.taken.indexOf(null);
      if (i >= 0) {
        const slot = s.slots[i], route = routeClear(a, slot, this.cols);
        if (!route) { this.toLane(a); return; }
        s.taken[i] = a; a.stop = arene; a.spot = slot; a.stay = 400;
        this.walkTo(a, route, () => { a.role = 'stop'; a.speed = 0; a.x = slot.x; a.z = slot.z; a.yaw = slot.yaw; this.crowd.setMemberMood(a.id, 'chat'); this.place(a); });
        a.role = 'stop';
        return;
      }
    }
    if (u < 0.7 && this.corners.length && this.arrivals) {                 // a taxi at a corner
      const ci = this.corners.map((c, i) => ({ i, d: Math.hypot(c.door.x - a.x, c.door.z - a.z) })).sort((x, y) => x.d - y.d)[0].i;
      const c = this.corners[ci], i = c.taken.indexOf(null);
      if (i >= 0) {
        const slot = c.slots[i]; c.taken[i] = a; a.corner = ci; a.spot = slot; a.stay = 400;
        a.role = 'pickup'; this.counts.taxi++;
        const cab = this.arrivals.cabRoutes[ci], via = cab.walk.length > 1 ? [...cab.walk.slice(0, -1)].reverse() : [];
        const pts: Pt[] = []; let from: Pt = a;
        for (const p of [...via, slot]) { const leg = routeClear(from, p, this.cols); if (!leg) { c.taken[i] = null; this.toLane(a); return; } pts.push(...leg); from = p; }
        this.walkTo(a, pts, () => { a.speed = 0; a.x = slot.x; a.z = slot.z; a.yaw = slot.yaw; this.place(a); });
        return;
      }
    }
    this.toLane(a);                                                    // home on foot
  }

  private step(a: Agent, dt: number) {
    if (a.path) {
      const to = a.path[a.pi + 1];
      if (!to) { a.path = null; const f = a.then; a.then = null; f?.(); this.place(a); return; }
      const dx = to.x - a.x, dz = to.z - a.z, d = Math.hypot(dx, dz), s = a.speed * dt;
      if (d <= s) { a.x = to.x; a.z = to.z; a.pi++; } else { a.x += (dx / d) * s; a.z += (dz / d) * s; }
      if (d > 0.01) a.yaw = Math.atan2(dx, dz);
      this.place(a);
      return;
    }
    if (a.role === 'pickup') {
      // into the taxi when it stands at the corner
      const ci = a.corner;
      if (ci >= 0 && this.arrivals?.pickingUp(ci)) { this.walkTo(a, routeClear(a, this.corners[ci].door, this.cols) ?? [this.corners[ci].door], () => this.hide(a), 1.4); return; }
      return;
    }
    if (a.role !== 'walk') return;
    const l = this.lanes[a.lane];
    a.t += (a.fwd ? 1 : -1) * a.speed * dt;
    if (a.t < 0 || a.t > l.len) { this.cross(a); return; }
    const p = this.lanePt(l, a.t, a.side);
    if (this.closedQueue && !clearWalk(p.x, p.z, p.x, p.z, this.cols, 0.25) && clearWalk(a.x, a.z, a.x, a.z, this.cols, 0.25)) {
      a.t -= (a.fwd ? 1 : -1) * a.speed * dt; a.fwd = !a.fwd; return;          // the queue is in the way: back the other way
    }
    a.x = p.x; a.z = p.z; a.yaw = Math.atan2((l.bx - l.ax) * (a.fwd ? 1 : -1), (l.bz - l.az) * (a.fwd ? 1 : -1));
    this.place(a);
  }

  /** At the end of a lane: over the crossing to another lane (busy streets preferred), rarely back the same way. */
  private cross(a: Agent) {
    const l = this.lanes[a.lane], e = this.hub.edges[l.e], node = a.fwd ? { x: e.bx, z: e.bz } : { x: e.ax, z: e.az };
    const opts = lanesFrom(this.lanes, node.x, node.z).filter(o => !(o.lane === a.lane && o.forward !== a.fwd));
    if (!opts.length) { a.fwd = !a.fwd; a.t = Math.max(0, Math.min(l.len, a.t)); return; }
    let sum = 0; const w = opts.map(o => { const v = this.lanes[o.lane].w ** 2; sum += v; return v; });
    let u = this.rand() * sum, pick = opts[0];
    for (let i = 0; i < opts.length; i++) { u -= w[i]; if (u <= 0) { pick = opts[i]; break; } }
    const nl = this.lanes[pick.lane], start = pick.forward ? { x: nl.ax, z: nl.az } : { x: nl.bx, z: nl.bz };
    const via = routeClear(a, start, this.cols) ?? (clearWalk(a.x, a.z, node.x, node.z, this.cols) && clearWalk(node.x, node.z, start.x, start.z, this.cols) ? [node, start] : null);
    if (!via) { a.fwd = !a.fwd; a.t = Math.max(0, Math.min(l.len, a.t)); return; }
    this.walkTo(a, via, () => this.walkOn(a, pick.lane, pick.forward ? 0 : nl.len, pick.forward), a.speed);
  }

  info() {
    const by: Record<string, number> = {};
    for (const a of this.agents) by[a.role] = (by[a.role] ?? 0) + 1;
    return {
      hub: this.hub.id, quality: this.q, target: { ...this.target }, roles: by, counts: { ...this.counts }, leaving: this.leaving,
      lanes: this.lanes.length, busyLanes: this.lanes.filter(l => l.w > 1).length, stops: this.stops.map(s => ({ key: s.key, waiting: s.taken.filter(Boolean).length, slots: s.slots.length })),
      groups: this.groups.filter(g => g.on).length, groupSpots: this.groups.length, corners: this.corners.map(c => c.taken.filter(Boolean).length),
      crowd: this.crowd.stats(), drawCalls: this.crowd.drawCalls(),
    };
  }
  /** Debug: where the agents are (checks verify nobody stands inside a collider). */
  where() { return this.agents.filter(a => a.role !== 'off').map(a => ({ id: a.id, role: a.role, x: a.x, z: a.z, moving: !!a.path || a.role === 'walk' })); }
  /** Debug: people inside a wall, a stall or furniture right now (must stay 0). */
  blocked() {
    return this.agents.filter(a => a.role !== 'off' && this.cols.some(c => a.x > c.x0 - 0.1 && a.x < c.x1 + 0.1 && a.z > c.z0 - 0.1 && a.z < c.z1 + 0.1)).map(a => `${a.id} ${a.role} ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
  }
  /** Debug: start the after-gala flow now. */
  leaveNow(n = 20) { this.leaving = n; this.leaveT = 0; }

  dispose() { this.crowd.dispose(); }
}

const hash = (x: number, z: number) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
