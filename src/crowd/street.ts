import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import { rng } from '../core/rng';
import { linesOf } from '../transport/lines';
import { placeStops, type StopSite } from '../transport/stops';
import { arenaExterior } from '../arena/exterior';
import { gateOf } from '../arena/exteriorRules';
import { Crowd, LIVE_CROWDS, type CrowdQuality, type CrowdSlot } from './crowd';
import { BOARD_GAP, boardCount, dwellingAt, lineFill, newArrivals, stopServed, type Dwell } from './transportPeek';
import { carRapideSpec } from '../transport/carRapide';
import { afterGalaWindow, type ArenaArrivals } from './arrivals';
import { ambientLife } from '../social/ambientLife';
import {
  BUSY_STOP_EXTRA, ColliderGrid, HUB_STREETS, PAVE, crowdSlots, edgeWeight, STREET_BUDGET, clearWalk, groupSpots, lanesFrom, pavementLanes, routeClear, stopSlots, streetTargets, type Lane,
} from './streetPlan';
import { len2 } from '../core/math';
import { neighbours, nodeKey, pickTurn, trafficNear } from '../actors/npc';
import { STOP_LANE, crossings, kerb, kerbSpots, type KerbSpot } from './streetLink';
import { StreetProps } from './streetProps';
import { itemAt, streetItemsNow } from '../game/streetDress';
import { childLook, defaultLook } from './looks';
import type { Mood } from './reactions';
import { WALK_BY_HOUR, CHAT_BY_HOUR, ring as ring0 } from './streetPlan';
import { curveAt } from '../social/ambient';

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
type Role = 'off' | 'walk' | 'stop' | 'group' | 'pickup' | 'gone' | 'ride' | 'hail' | 'board';
/** A place in a ring or a scene: where, facing, and (sitting) the seat's height, the mood, whether a child stands there. */
interface Place { x: number; z: number; yaw: number; sit?: number; mood?: Mood; kid?: boolean }
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
  /** Where a walker is heading along the lanes (the Dibi after the gala), or null: wandering. */
  goal: Pt | null;
  /** Seconds before setting off on `path` (people climbing into a car one after the other). */
  delay: number;
  /** A child (only the scenes' kids use these places of the pool). */
  kid: boolean;
  /** Height of the seat above the ground while sitting (a stool, a saddle), else 0. */
  lift: number;
  /** What one carries or rides: 0 nothing, 1 a basin of goods on the head, 2 a hand cart, 3 a bicycle; and its colour. */
  prop: 0 | 1 | 2 | 3; pcol: number;
  /** A cyclist's place on the road (the directed edge, metres along it, the node it came from). */
  ride: { ax: number; az: number; bx: number; bz: number; len: number; s: number; prev: string };
  /** The slot of `crossings` this walker holds while crossing the road (-1 none), seconds to wait at the kerb first, the walking speed after. */
  cs: number; hold: number; hspeed: number;
  /** The kerb spot one waits at for a taxi or a minibus (-1 none). */
  hail: number;
}
interface StopRt {
  site: StopSite; key: string; slots: { x: number; z: number; yaw: number }[]; taken: (Agent | null)[]; door: Pt; busy: boolean;
  /** The ride home after the gala: the evening route's « Arène » stop holds a crowd that boards up to the cars' fill. */
  crowd: boolean;
  /** Its line runs now (transport.served: Ligne 23's day stops are parked on fight evenings). */
  served: boolean;
}
interface GroupRt { x: number; z: number; ring: Place[]; taken: (Agent | null)[]; on: boolean; w: number; kind?: string }
/** A cyclist keeps to the road's edge, between the cars' lane (2.5) and the parked cars (4.3). */
const RIDE_LANE = 3.0;

/**
 * `pop`: nearer than this nobody appears or leaves in front of the player; `view`: beyond it (a figure of a few pixels)
 * a walker is out of sight whatever the camera sees, so the crowd fills the streets as far as the camera looks.
 */
export const STREET_RANGE = { pop: 24, view: 46 };
/**
 * Where the arena lane's outflow takes the spectators out of the gate's street (src/arena/exteriorRules.ts
 * outflowDestinations: both street ends and the side corners): the street crowd carries them on from there.
 */
export const OUTFLOW_ENDS = (g: { x: number; z: number }) => [-1, 1].flatMap(sx => [{ x: g.x + sx * 34, z: g.z - 8 }, { x: g.x + sx * 25, z: g.z - 13 }]);
const SPEED = [1.2, 1.6] as const;
/** Metres round the player within which the walkers keep: the street crowd is put where the camera looks. */
const STAGE: Record<CrowdQuality, number> = { low: 58, medium: 72, high: 90 };

export class StreetLife {
  readonly crowd: Crowd;
  private agents: Agent[] = [];
  private lanes: Lane[];
  private laneW: number[];
  private stops: StopRt[] = [];
  private groups: GroupRt[] = [];
  /** The activity clusters: a stall's seller and her customers, a queue at a boutique, tea on stools, a barrow, kids at a corner. */
  private scenes: GroupRt[] = [];
  private kerbs: { dx: number; dz: number; until: number }[] = [];
  private props: StreetProps;
  private crossOwn: (Agent | null)[] = Array.from({ length: 16 }, () => null);
  private corners: { slots: { x: number; z: number; yaw: number }[]; taken: (Agent | null)[]; door: Pt }[] = [];
  private ready = false;
  /** The hub's colliders, plus the arena's queue lane while fans queue in it (street walkers keep out). */
  private cols: Collider[];
  private closedQueue = false;
  /** The colliders while the queue lane is closed, in a grid (a walker's step tests two points a frame). */
  private colGrid: ColliderGrid | null = null;
  private prepT = 1.2;
  /** Seconds after the street is prepared during which people may be placed in sight (but not at the player's feet). */
  private warm = 6;
  private rand = rng(1709);
  private q: CrowdQuality;
  private hub: HubWorld;
  private ground: (x: number, z: number) => number;
  private planT = 0;
  /** Where the camera looks (a unit vector on the ground), refreshed every frame. */
  private look = { x: 0, z: 1 };
  private busT = 0;
  private dwelling: ReadonlyMap<string, Dwell> = new Map();
  private carSeats = 0;
  private target = { walkers: 0, perStop: 0, groups: 0 };
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private sp = new THREE.Sphere(new THREE.Vector3(), 1.2);
  // after the gala (Pikine)
  private eventWas = false;
  private eventSeen = false;
  private standsMax = 0; private standsT = 0;
  private leaving = 0;
  private leaveT = 0;
  readonly counts = { spawned: 0, boarded: 0, alighted: 0, left: 0, taxi: 0, recruited: 0, dibi: 0 };
  /** The hub's Dibi (where some spectators go on after the gala), or null. */
  private dibi: Pt | null = null;

  constructor(private ctx: GameCtx, hub: HubWorld, private arrivals: ArenaArrivals | null = null) {
    this.hub = hub;
    this.cols = hub.colliders;
    this.q = ctx.quality();
    this.ground = (x, z) => 0.1 + hub.heightAt(x, z);
    const B = STREET_BUDGET[this.q], busy = HUB_STREETS[hub.id]?.busy ?? [];
    this.lanes = pavementLanes(hub.edges, hub.colliders, busy);
    this.laneW = this.lanes.map(l => l.w * l.len);
    // the pool: the walkers, the stops and the rings' share, then the extra for what the street does (every third of those is a child)
    const total = B.pool + B.extra, kidAt = (i: number) => i >= B.pool && (i - B.pool) % 3 === 2;
    const slots: CrowdSlot[] = Array.from({ length: total }, (_, i) => ({ id: `p${i}`, x: 0, y: 0.1, z: 0, yaw: 0, seated: false, tags: kidAt(i) ? ['street', 'kid'] : ['street'] }));
    this.crowd = new Crowd(slots, { quality: this.q, near: B.near, nearRadius: 9, name: 'street', seed: 61 + hub.id.length, blobs: true, fidget: 0.02,
      look: (slot, r) => slot.tags?.includes('kid') ? childLook(r) : defaultLook(r) });
    this.agents = slots.map((s, i) => ({ id: s.id, role: 'off', x: 0, z: 0, yaw: 0, speed: 0, lane: 0, fwd: true, t: 0, side: 0, path: null, pi: 0, then: null, spot: null, stop: -1, group: -1, corner: -1, stay: 0, goal: null, delay: 0,
      kid: kidAt(i), lift: 0, prop: 0, pcol: i, ride: { ax: 0, az: 0, bx: 0, bz: 0, len: 1, s: 0, prev: '' }, cs: -1, hold: 0, hspeed: 1.4, hail: -1 }));
    this.props = new StreetProps({ bike: B.riders + 1, tray: B.peddlers + 1, cart: B.peddlers + 1 }, false);
    this.crowd.group.add(this.props.group);
    ctx.extra.add(this.crowd.group);
  }

  /** Stops, groups and taxi corners need the places and the city's own people of the hub (registered after us). */
  private prepare() {
    this.ready = true;
    const hub = this.hub, cols = hub.colliders;
    const avoid: Pt[] = [...hub.people.map(p => ({ x: p.x, z: p.z })), ...ambientLife.standPoints()];
    for (const c of LIVE_CROWDS) if (c !== this.crowd) for (const s of c.slots()) avoid.push(s);
    this.carSeats = carRapideSpec().seats.length;
    for (const line of linesOf(hub.id)) for (const site of placeStops(line, cols)) {
      // the arena's stop of the evening route takes the crowd riding home after the gala
      const crowd = site.def.id === 'arene' && !!line.fill;
      const slots = crowd ? crowdSlots(site, cols, avoid) : stopSlots(site, cols, avoid);
      // on a busy street? (the centre line under the stop belongs to one of the hub's busy streets); the evening route's
      // « Arène » stop is always one: the fight evening's stop, off the main street since Ligne 23 goes round the arena
      const cx = site.x - site.rx * 6.25, cz = site.z - site.rz * 6.25;
      const busy = crowd || edgeWeight({ ax: cx - site.dx, az: cz - site.dz, bx: cx + site.dx, bz: cz + site.dz }, HUB_STREETS[hub.id]?.busy ?? []) > 1;
      const key = `${line.id}:${site.def.id}`;
      this.stops.push({ site, key, slots, taken: slots.map(() => null), door: { x: site.x - site.rx * 1.15, z: site.z - site.rz * 1.15 }, busy, crowd, served: stopServed(key) });
    }
    const fronts = [...hub.interactables.filter(i => !i.npc).map(i => ({ x: i.x, z: i.z })),
      ...this.ctx.places.all().filter(p => p.space === 'street' && /shop|stall|dibi|salon|cafe|market|gargote|maiga/.test(p.type)).flatMap(p => p.anchors.slice(0, 1))];
    const stopAvoid = this.stops.flatMap(s => [s.site, ...s.slots]);
    // the Dibi: a place of type 'dibi' in the street (the venues lane's), else the builder's dibiterie kiosk
    const dibiPlace = this.ctx.places.all().find(p => p.type === 'dibi' && p.space === 'street');
    const kiosk = hub.interactables.find(i => /dibiterie/i.test(i.id) || /dibiterie/i.test(i.name));
    this.dibi = dibiPlace?.anchors[0] ? { x: dibiPlace.anchors[0].x, z: dibiPlace.anchors[0].z } : kiosk ? { x: kiosk.x, z: kiosk.z } : null;
    for (const g of groupSpots(fronts, this.lanes, cols, [...avoid, ...stopAvoid])) {
      const n = this.nearLanes(g.x, g.z, 1)[0];
      this.groups.push({ ...g, taken: g.ring.map(() => null), on: false, w: n ? this.lanes[n.lane].w : 1 });
    }
    // stable order, the busy streets first: the groups that gather first in the evening are the same every day
    this.groups.sort((a, b) => b.w - a.w || hash(a.x, a.z) - hash(b.x, b.z));
    this.buildScenes([...avoid, ...this.groups.flatMap(g => g.ring), ...this.stops.flatMap(s => s.slots)]);
    this.buildKerb();
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
    const me = this.ctx.player.pos, d = len2(x - me.x, z - me.z);
    if (this.warm > 0) return d < 12;                       // just arrived: the street is already full, the people were there
    if (d > STREET_RANGE.view) return false;
    if (d < STREET_RANGE.pop) return true;
    this.sp.center.set(x, 1, z);
    return this.frustum.intersectsSphere(this.sp);
  }
  private free(): Agent | null { return this.agents.find(a => a.role === 'off' && !a.kid) ?? null; }
  private freeKid(): Agent | null { return this.agents.find(a => a.role === 'off' && a.kid) ?? null; }
  /** A walker out of sight gives up their place (the pool is full and someone with a reason needs it). */
  private recycle(): Agent | null {
    const a = this.agents.find(x => x.role === 'walk' && !x.path && !this.seen(x.x, x.z));
    if (!a) return null;
    this.hide(a); return a;
  }
  private show(a: Agent) { this.crowd.setPresent(a.id, true); this.place(a); this.counts.spawned++; }
  private hide(a: Agent) {
    this.release(a);
    a.goal = null; a.delay = 0; a.hold = 0; a.prop = 0; this.endCross(a);
    this.crowd.setMemberMood(a.id, 'rest');
    a.role = 'off'; a.path = null; a.then = null; a.speed = 0;
    this.crowd.setPresent(a.id, false);
  }
  private place(a: Agent) { this.crowd.move(a.id, a.x, this.ground(a.x, a.z) + a.lift, a.z, a.yaw, a.role === 'ride' ? 0 : a.speed); }
  /** Give back the stop place / group place / corner place an agent held. */
  private release(a: Agent) {
    if (a.stop >= 0) { const s = this.stops[a.stop], i = s.taken.indexOf(a); if (i >= 0) s.taken[i] = null; }
    if (a.group >= 0) { const g = a.group >= 1000 ? this.scenes[a.group - 1000] : this.groups[a.group], i = g ? g.taken.indexOf(a) : -1; if (i >= 0) g.taken[i] = null; }
    if (a.corner >= 0) { const c = this.corners[a.corner], i = c.taken.indexOf(a); if (i >= 0) c.taken[i] = null; }
    if (a.hail >= 0) { const k = kerbSpots[a.hail]; if (k) k.waiting = Math.max(0, k.waiting - 1); a.hail = -1; }
    a.stop = -1; a.group = -1; a.corner = -1; a.spot = null;
    if (a.lift) { a.lift = 0; this.crowd.setSeated(a.id, false); }
    this.crowd.setMemberMood(a.id, 'rest');
  }

  private lanePt(l: Lane, t: number, side: number): Pt {
    const dx = (l.bx - l.ax) / l.len, dz = (l.bz - l.az) / l.len, rx = -dz * l.side, rz = dx * l.side;
    return { x: l.ax + dx * t + rx * side, z: l.az + dz * t + rz * side };
  }
  /** A lane to spawn on: busy streets weigh more, lanes far from the player much less. */
  private pickLane(): number {
    const me = this.ctx.player.pos, stage = STAGE[this.q], f = this.look;
    // the street's people gather where the camera looks: the lanes near the player weigh much more than the far ones
    const w = this.lanes.map((l, i) => { const mx = (l.ax + l.bx) / 2 - me.x, mz = (l.az + l.bz) / 2 - me.z, d = len2(mx, mz);
      const ahead = (mx * f.x + mz * f.z) / (d + 1) > 0.25 ? 2.2 : 1;                  // the lanes the camera looks along weigh more
      return this.laneW[i] * (d < stage ? ahead / (1 + (d / 18) ** 2) : 0.003); });
    let sum = 0; for (const v of w) sum += v;
    let u = this.rand() * sum;
    for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return i; }
    return w.length - 1;
  }
  /** Within the walkers' stage: the streets round the player, where the camera looks (those beyond are recalled). */
  private onStage(x: number, z: number) { const me = this.ctx.player.pos; return len2(x - me.x, z - me.z) < STAGE[this.q]; }
  private alive(x: number, z: number) { const me = this.ctx.player.pos; return len2(x - me.x, z - me.z) < STREET_BUDGET[this.q].life; }
  /** The lanes nearest (x, z), nearest first, with the closest point on each. */
  private nearLanes(x: number, z: number, n = 4) {
    return this.lanes.map((l, i) => {
      const dx = l.bx - l.ax, dz = l.bz - l.az, t = Math.max(0, Math.min(l.len, ((x - l.ax) * dx + (z - l.az) * dz) / l.len));
      const p = this.lanePt(l, t, 0);
      return { lane: i, t, d: len2(p.x - x, p.z - z) };
    }).sort((a, b) => a.d - b.d).slice(0, n);
  }

  /** Start walking a lane from a point on it. */
  private walkOn(a: Agent, lane: number, t: number, fwd: boolean) {
    a.role = 'walk'; a.lane = lane; a.t = t; a.fwd = fwd; a.speed = SPEED[0] + this.rand() * (SPEED[1] - SPEED[0]);
    // two opposing streams: each direction keeps to its own half of the pavement
    a.side = (fwd ? -1 : 1) * (0.22 + this.rand() * 0.12) + (this.rand() - 0.5) * 0.1;
    if (a.prop === 1) a.speed = 1.0 + this.rand() * 0.2; else if (a.prop === 2) a.speed = 0.8 + this.rand() * 0.15;     // a basin on the head, a loaded cart: unhurried
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
      if (this.peddlersNow() < STREET_BUDGET[this.q].peddlers * Math.min(1, 0.4 + curveAt(WALK_BY_HOUR, this.ctx.hour())) && this.rand() < 0.3) { a.prop = this.rand() < 0.6 ? 1 : 2; a.pcol = Math.floor(this.rand() * 9); }
      this.walkOn(a, lane, t, this.streamFwd(l));
      a.x = p.x; a.z = p.z; this.show(a);
      return true;
    }
    return false;
  }
  private peddlersNow() { let n = 0; for (const a of this.agents) if (a.prop === 1 || a.prop === 2) n++; return n; }
  /** Which way a new walker goes on a lane: the two pavements of a street carry opposite streams (most of the time). */
  private streamFwd(l: Lane): boolean { return this.rand() < (l.side > 0 ? 0.88 : 0.12); }
  /** Someone comes to wait at a stop: a walker passing by, or someone out of sight already there. */
  private fillStop(si: number): boolean {
    const s = this.stops[si], i = s.taken.indexOf(null); if (i < 0) return false;
    const slot = s.slots[i];
    let route: Pt[] | null = null, tries = 0;
    const near = this.agents.find(a => a.role === 'walk' && !a.path && len2(a.x - slot.x, a.z - slot.z) < 22 && tries++ < 3 && !!(route = routeClear(a, slot, this.cols)));
    const a = near ?? this.free(); if (!a) return false;
    if (!near && this.seen(slot.x, slot.z)) return false;
    s.taken[i] = a; a.stop = si; a.spot = slot; a.stay = 40 + this.rand() * 120;
    const settle = () => { a.role = 'stop'; a.speed = 0; a.x = slot.x; a.z = slot.z; a.yaw = slot.yaw; if (this.rand() < 0.5) this.crowd.setMemberMood(a.id, 'chat'); this.place(a); };
    if (near) { this.counts.recruited++; a.role = 'stop'; this.walkTo(a, route ?? [slot], settle); }
    else { a.x = slot.x; a.z = slot.z; a.role = 'stop'; this.show(a); settle(); }
    return true;
  }
  /** A group gathers in front of a shop (or a scene at a stall): out of sight they are just there, in sight they walk up one by one. */
  private fillGroup(gi: number, list: GroupRt[] = this.groups): boolean {
    const g = list[gi], i = g.taken.indexOf(null); if (i < 0) return false;
    const spot = g.ring[i], gid = list === this.groups ? gi : 1000 + gi;
    let route: Pt[] | null = null, tries = 0;
    const near = this.agents.find(a => a.role === 'walk' && !a.path && !a.prop && a.kid === !!spot.kid && len2(a.x - spot.x, a.z - spot.z) < 20 && tries++ < 3 && !!(route = routeClear(a, spot, this.cols)));
    const a = near ?? (spot.kid ? this.freeKid() : this.free()); if (!a) return false;
    if (!near && this.seen(spot.x, spot.z)) return false;
    g.taken[i] = a; a.group = gid; a.spot = spot; a.stay = spot.sit ? 120 + this.rand() * 300 : 60 + this.rand() * 240;
    const settle = () => {
      a.role = 'group'; a.speed = 0; a.x = spot.x; a.z = spot.z; a.yaw = spot.yaw;
      if (spot.sit) { a.lift = spot.sit; this.crowd.setSeated(a.id, true); }
      this.crowd.setMemberMood(a.id, spot.mood ?? 'chat'); this.place(a);
    };
    if (near) { this.counts.recruited++; a.role = 'group'; this.walkTo(a, route ?? [spot], settle); }
    else { a.x = spot.x; a.z = spot.z; a.role = 'group'; this.show(a); settle(); }
    return true;
  }

  // ---------------------------------------------------------------- what the street does
  /**
   * The activity clusters, put at the dressing the street already has (src/game/streetDress.ts): a seller on her stool at the
   * end of a stall's table with two customers talking in front of it, a queue at a cantine's counter, tea on stools round a
   * tray (attaya), a seller at her barrow with a customer, and kids at a pavement corner. Only the places that are clear of
   * walls, cars and the other people of the hub are kept.
   */
  private buildScenes(avoid: readonly Pt[]) {
    const cols = this.cols, hub = this.hub, R = rng(0x5ce7 + hub.id.length * 71);
    const face = (a: Pt, b: Pt) => Math.atan2(b.x - a.x, b.z - a.z);
    const fine = (p: Pt) => clearWalk(p.x, p.z, p.x, p.z, cols, 0.28) && !avoid.some(q => len2(q.x - p.x, q.z - p.z) < 1.0) && !this.stops.some(st => len2(st.site.x - p.x, st.site.z - p.z) < 5);
    const add = (kind: string, ring: Place[]) => {
      if (!ring.length || ring.some(p => !fine(p))) return;
      const x = ring.reduce((m, p) => m + p.x, 0) / ring.length, z = ring.reduce((m, p) => m + p.z, 0) / ring.length;
      if (this.scenes.some(g => len2(g.x - x, g.z - z) < 4.5)) return;
      const n = this.nearLanes(x, z, 1)[0];
      this.scenes.push({ x, z, ring, taken: ring.map(() => null), on: false, w: n ? this.lanes[n.lane].w : 1, kind });
    };
    for (const it of streetItemsNow()) {
      if (!it.spot || it.off === undefined) continue;
      const off = it.off, at = (a: number, b: number) => itemAt(it, off, a, b);
      if (it.kind === 'stall') {
        const v = at(1.2, -0.05), c1 = at(0.45, 5.75 - off), c2 = at(-1.25, 5.8 - off);
        add('stall', [{ ...v, yaw: face(v, c1), sit: 0.36, mood: 'chat' }, { ...c1, yaw: face(c1, c2) + 0.25, mood: 'chat' }, { ...c2, yaw: face(c2, c1) - 0.25, mood: 'chat' }]);
      } else if (it.kind === 'cantine') {
        const sg = R() < 0.5 ? -1 : 1, n = 3 + (R() < 0.45 ? 1 : 0), head = at(0, 6.15 - off), ring: Place[] = [];
        for (let k = 0; k < n; k++) { const p = at(sg * (0.05 + k * 0.72), 5.75 - off); ring.push({ ...p, yaw: face(p, head), mood: k === 0 ? 'rest' : 'chat' }); }
        add('queue', ring);
      } else if (it.kind === 'tea') {
        const seats = [at(-0.95, 0), at(0.95, 0), at(0, -0.78)], mid = at(0, 0), n = 2 + (R() < 0.5 ? 1 : 0), ring: Place[] = [];
        for (let k = 0; k < n; k++) ring.push({ ...seats[k], yaw: face(seats[k], mid), sit: 0.32, mood: k === 1 ? 'sip' : 'chat' });
        add('tea', ring);
      } else if (it.kind === 'barrow') {
        const v = at(-2.05, 0), c = at(-1.0, 0.95);
        add('barrow', [{ ...v, yaw: face(v, c), mood: 'chat' }, { ...c, yaw: face(c, v), mood: 'chat' }]);
      }
    }
    // kids at the pavement corners (a few, near the start first)
    const corners: { x: number; z: number; d: number }[] = [];
    for (const row of hub.nodes) for (const n of row) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = n.x + sx * 6.55, z = n.z + sz * 6.55;
      if (Math.hypot(hub.spawn.x - x, hub.spawn.z - z) < 9) continue;
      corners.push({ x, z, d: Math.hypot(x - hub.spawn.x, z - hub.spawn.z) * (0.6 + R()) });
    }
    corners.sort((a, b) => a.d - b.d);
    let kids = 0;
    for (const c of corners) {
      if (kids >= 8) break;
      const a0 = R() * 6.28, n = 3 + (R() < 0.35 ? 1 : 0), ring = ring0(c.x, c.z, n, 0.5, a0).map(p => ({ ...p, kid: true, mood: 'chat' as Mood }));
      const before = this.scenes.length; add('kids', ring); if (this.scenes.length > before) kids++;
    }
  }

  /** Kerb spots where a taxi or a minibus can pull in and a passenger waits (src/crowd/streetLink.ts). */
  private buildKerb() {
    kerbSpots.length = 0; this.kerbs.length = 0;
    const hub = this.hub, cols = this.cols, R = rng(0x4e1b + hub.id.length * 131), busy = HUB_STREETS[hub.id]?.busy ?? [];
    const nTaxi = { low: 5, medium: 8, high: 12 }[this.q], nLong = { low: 2, medium: 3, high: 4 }[this.q];
    const gate = hub.arena ? { x: hub.arena.cx, z: hub.arena.cz - 30 } : null;
    const cands: { ax: number; az: number; bx: number; bz: number; s: number; dx: number; dz: number; w: number }[] = [];
    hub.edges.forEach(e => {
      const L = len2(e.bx - e.ax, e.bz - e.az); if (L < 36) return;
      const w = edgeWeight(e, busy) > 1 ? 6 : 1;
      for (const side of [1, -1] as const) {
        const [ax, az, bx, bz] = side > 0 ? [e.ax, e.az, e.bx, e.bz] : [e.bx, e.bz, e.ax, e.az];
        for (let t = 15; t <= L - 15; t += 6) cands.push({ ax, az, bx, bz, s: t + (R() - 0.5) * 2, dx: (bx - ax) / L, dz: (bz - az) / L, w: w * (0.4 + R()) });
      }
    });
    const rect = (x: number, z: number, dx: number, dz: number, along: number, wide: number) => {
      const ex = Math.abs(dx) * along / 2 + Math.abs(dz) * wide / 2, ez = Math.abs(dz) * along / 2 + Math.abs(dx) * wide / 2;
      return !cols.some(c => x - ex < c.x1 + 0.1 && x + ex > c.x0 - 0.1 && z - ez < c.z1 + 0.1 && z + ez > c.z0 - 0.1);
    };
    const pick = (long: boolean, n: number) => {
      let done = 0;
      for (let tries = 0; done < n && cands.length && tries < n * 120; tries++) {
        let sum = 0; for (const c of cands) sum += c.w;
        let u = R() * sum, k = 0; for (; k < cands.length - 1; k++) { u -= cands[k].w; if (u <= 0) break; }
        const c = cands.splice(k, 1)[0], px = -c.dz, pz = c.dx;
        const x = c.ax + c.dx * c.s + px * STOP_LANE, z = c.az + c.dz * c.s + pz * STOP_LANE;
        const stand = { x: x + px * (5.45 - STOP_LANE), z: z + pz * (5.45 - STOP_LANE) };
        if (x < hub.bounds.x0 + 8 || x > hub.bounds.x1 - 8 || z < hub.bounds.z0 + 8 || z > hub.bounds.z1 - 8) continue;
        if (gate && len2(gate.x - x, gate.z - z) < 46) continue;
        if (len2(hub.spawn.x - x, hub.spawn.z - z) < 11) continue;
        const nearStop = Math.min(...this.stops.map(st => len2(st.site.x - x, st.site.z - z)), 999);
        if (long ? nearStop < 8 || nearStop > 30 : nearStop < 14) continue;
        if (kerbSpots.some(k2 => len2(k2.x - x, k2.z - z) < 15)) continue;
        if (!rect(x, z, c.dx, c.dz, long ? 8.8 : 5.0, long ? 2.8 : 2.1) || !clearWalk(stand.x, stand.z, stand.x + c.dx * 1.0, stand.z + c.dz * 1.0, cols, 0.3)) continue;
        kerbSpots.push({ ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, s: c.s, x, z, px, pz, long, waiting: 0, want: long ? 2 : 1, claimed: false, halted: false, cx: x, cz: z, fresh: false, cool: 0 });
        this.kerbs.push({ dx: c.dx, dz: c.dz, until: 0 }); done++;
      }
    };
    pick(true, nLong); pick(false, nTaxi);
  }

  /** Someone comes to the kerb to hail a taxi or a minibus: a walker passing by, or someone out of sight already there. */
  private fillHail(ki: number): boolean {
    const k = kerbSpots[ki], rt = this.kerbs[ki];
    if (k.waiting >= k.want || k.claimed || rt.until > kerb.clock) return false;
    const j = k.waiting, o = (k.long ? -0.5 : 0) + j * 0.9;
    const stand: Place = { x: k.x + k.px * (5.45 - STOP_LANE) + rt.dx * o, z: k.z + k.pz * (5.45 - STOP_LANE) + rt.dz * o, yaw: Math.atan2(-k.px, -k.pz) };
    let route: Pt[] | null = null, tries = 0;
    const near = this.agents.find(a => a.role === 'walk' && !a.path && !a.prop && !a.kid && len2(a.x - stand.x, a.z - stand.z) < 22 && tries++ < 3 && !!(route = routeClear(a, stand, this.cols)));
    const a = near ?? this.free(); if (!a) return false;
    if (!near && this.seen(stand.x, stand.z)) return false;
    k.waiting++; a.hail = ki; a.spot = stand; a.stay = 70 + this.rand() * 90;
    const settle = () => { a.role = 'hail'; a.speed = 0; a.x = stand.x; a.z = stand.z; a.yaw = stand.yaw; this.place(a); };
    if (near) { this.counts.recruited++; a.role = 'hail'; this.walkTo(a, route ?? [stand], settle); }
    else { a.x = stand.x; a.z = stand.z; a.role = 'hail'; this.show(a); settle(); }
    return true;
  }
  /** A car has stopped at a spot: someone gets out (when it is in sight) and walks off along the pavement. */
  private alight(k: KerbSpot) {
    if (!this.inView(k.cx, k.cz)) return;
    const n = k.long ? 2 : this.rand() < 0.7 ? 1 : 0;
    for (let j = 0; j < n; j++) {
      const a = this.free(); if (!a) return;
      a.x = k.cx + k.px * 1.25 + (this.rand() - 0.5) * 0.5; a.z = k.cz + k.pz * 1.25 + (this.rand() - 0.5) * 0.5; a.role = 'walk';
      a.yaw = Math.atan2(k.px, k.pz);
      this.show(a); this.counts.alighted++;
      this.toLane(a);
      if ((a.role as Role) !== 'off') a.delay = j * 0.9;
    }
  }
  private inView(x: number, z: number) {
    const me = this.ctx.player.pos; if (len2(x - me.x, z - me.z) > STREET_RANGE.view) return false;
    this.sp.center.set(x, 1, z); return this.frustum.intersectsSphere(this.sp);
  }

  /** Walkers who cross the road, at the crossings and mid-block, where there are cars: they wait a moment at the kerb, the cars stop for them. */
  private crossTick() {
    const B = STREET_BUDGET[this.q], H = HUB_STREETS[this.hub.id];
    const want = Math.round(B.cross * Math.min(1, 0.35 + curveAt(WALK_BY_HOUR, this.ctx.hour())) * Math.min(1, (H?.level ?? 0.5) + 0.3));
    let active = 0; for (const a of this.agents) if (a.cs >= 0) active++;
    if (active >= want) return;
    const me = this.ctx.player.pos;
    let best: Agent | null = null, bs = 0;
    for (const a of this.agents) {
      if (a.role !== 'walk' || a.path || a.cs >= 0 || a.delay > 0) continue;
      const d = len2(a.x - me.x, a.z - me.z); if (d < 6 || d > 44) continue;
      const l = this.lanes[a.lane], end = Math.min(a.t, l.len - a.t) < 2.5 ? 2.2 : 1;
      const sc = (this.seen(a.x, a.z) ? 3 : 0.25) * (1.15 - Math.abs(d - 20) / 30) * end * (0.4 + this.rand());
      if (sc > bs) { bs = sc; best = a; }
    }
    if (!best) return;
    const a = best, l = this.lanes[a.lane], oj = this.lanes.findIndex(x => x.e === l.e && x.side !== l.side);
    if (oj < 0) return;
    const ol = this.lanes[oj], t = Math.max(0, Math.min(ol.len, a.t)), to = this.lanePt(ol, t, 0);
    if (!clearWalk(a.x, a.z, to.x, to.z, this.cols, 0.32)) return;
    const mx = (a.x + to.x) / 2, mz = (a.z + to.z) / 2;
    if (trafficNear(mx, mz, 9)) return;
    const slot = this.crossOwn.indexOf(null); if (slot < 0) return;
    this.crossOwn[slot] = a; a.cs = slot; a.hold = 0.7 + this.rand() * 1.3; a.hspeed = 1.35 + this.rand() * 0.25;
    const fwd = a.fwd;
    this.walkTo(a, [to], () => { this.endCross(a); this.walkOn(a, oj, t, fwd); }, 0);
    this.place(a);                                                    // standing at the kerb until the way is clear
  }
  private endCross(a: Agent) {
    if (a.cs < 0) return;
    crossings[a.cs].on = false; this.crossOwn[a.cs] = null; a.cs = -1;
  }

  /** A cyclist comes onto a road out of sight (or far off), and rides on along it, turning where the roads meet. */
  private spawnRider(): boolean {
    const a = this.free(); if (!a) return false;
    const me = this.ctx.player.pos, edges = this.hub.edges, stage = STAGE[this.q] - 4;
    for (let k = 0; k < 16; k++) {
      const e = edges[Math.floor(this.rand() * edges.length)], L = len2(e.bx - e.ax, e.bz - e.az); if (L < 30) continue;
      const fwd = this.rand() < 0.5, [ax, az, bx, bz] = fwd ? [e.ax, e.az, e.bx, e.bz] : [e.bx, e.bz, e.ax, e.az];
      const dx = (bx - ax) / L, dz = (bz - az) / L, s = 8 + this.rand() * (L - 16);
      const x = ax + dx * s - dz * RIDE_LANE, z = az + dz * s + dx * RIDE_LANE;
      if (len2(x - me.x, z - me.z) > stage || this.seen(x, z)) continue;
      const r = a.ride; r.ax = ax; r.az = az; r.bx = bx; r.bz = bz; r.len = L; r.s = s; r.prev = '';
      a.role = 'ride'; a.prop = 3; a.speed = 3.2 + this.rand() * 1.3; a.lift = 0.88; a.x = x; a.z = z; a.yaw = Math.atan2(dx, dz);
      this.crowd.setSeated(a.id, true); this.crowd.setMemberMood(a.id, 'ride');
      this.show(a); return true;
    }
    return false;
  }
  private stepRide(a: Agent, dt: number) {
    const r = a.ride; r.s += a.speed * dt;
    if (r.s >= r.len) {
      const opts = neighbours(this.hub, r.bx, r.bz).filter(n => nodeKey(n.x, n.z) !== r.prev);
      const next = opts.length ? pickTurn(this.hub, r.bx, r.bz, opts, this.rand) : { x: r.ax, z: r.az };
      r.prev = nodeKey(r.bx, r.bz); r.ax = r.bx; r.az = r.bz; r.bx = next.x; r.bz = next.z; r.len = len2(r.bx - r.ax, r.bz - r.az) || 1; r.s = 0;
    }
    const dx = (r.bx - r.ax) / r.len, dz = (r.bz - r.az) / r.len;
    a.x = r.ax + dx * r.s - dz * RIDE_LANE; a.z = r.az + dz * r.s + dx * RIDE_LANE; a.yaw = Math.atan2(dx, dz);
    this.place(a);
  }
  /** The bicycles, the peddlers' basins and carts: put where their people are. */
  private drawProps() {
    const P = this.props; P.begin();
    for (const a of this.agents) {
      if (!a.prop || a.role === 'off') continue;
      const y = this.ground(a.x, a.z), sn = Math.sin(a.yaw), cs = Math.cos(a.yaw);
      if (a.prop === 3) P.put('bike', a.x, y - 0.02, a.z, a.yaw, a.pcol);
      else if (a.prop === 1) P.put('tray', a.x, y + 1.6, a.z, a.yaw, a.pcol);
      else P.put('cart', a.x - sn * 0.3, y, a.z - cs * 0.3, a.yaw, a.pcol);
    }
    P.end();
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
      this.colGrid = closed ? new ColliderGrid(this.cols) : null;              // the walkers' check, every frame while it is closed
    }
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    { const e = cam.matrixWorld.elements, lx = -e[8], lz = -e[10], l = Math.hypot(lx, lz) || 1; this.look.x = lx / l; this.look.z = lz / l; }
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    this.planT -= dt;
    if (this.planT <= 0) { this.planT = 1; this.plan(); }
    this.busT -= dt;
    if (this.busT <= 0) { this.busT = 0.5; this.buses(); }
    this.afterGala(dt);
    if (this.warm > 0) this.warm -= dt;
    for (const a of this.agents) if (a.role !== 'off') this.step(a, dt);
    this.drawProps();
    const me = this.ctx.player.pos;
    this.crowd.setFocus(me.x, me.z, null);
    this.crowd.setCamera(cam);
    this.crowd.update(dt, true);
  }

  /** Once a second: bring the street towards the hour's targets, a few people at a time. */
  private plan() {
    for (const s of this.stops) s.served = stopServed(s.key);
    // a parked line's stops (Ligne 23's day route on fight evenings) hold nobody and take nobody from the walkers' share
    const liveStops = this.stops.filter(s => s.served && this.alive(s.site.x, s.site.z)), liveGroups = this.groups.filter(g => this.alive(g.x, g.z));
    const t = streetTargets(this.hub.id, this.ctx.hour(), this.q, liveStops.length, liveGroups.length, liveStops.filter(s => s.busy).length);
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
    this.planScenes(t);
    // stops: up to perStop waiting at each served stop (a parked line's stops empty); the ride-home crowd after a gala
    this.stops.forEach((s, si) => {
      const riding = s.crowd && (this.leaving > 0 || s.taken.some(a => a && a.stay > 300));
      const want = !s.served || !this.alive(s.site.x, s.site.z) || (t.perStop === 0 && !riding) ? 0
        : riding ? s.slots.length
        : Math.min(s.slots.length, t.perStop + (s.busy ? BUSY_STOP_EXTRA : 0));
      const have = s.taken.filter(Boolean).length;
      if (have < want && budget > 0 && this.fillStop(si)) budget--;
      if (have > want) { const a = s.taken.find(x => x && x.role === 'stop' && !x.path); if (a) { if (this.seen(a.x, a.z)) this.toLane(a); else this.hide(a); } }
    });
    // people waiting for a taxi at the corners call one
    if (this.arrivals) this.corners.forEach((c, ci) => { this.arrivals!.demand[ci] = c.taken.filter(a => a && a.role === 'pickup' && !a.path).length; });
    // walkers: out of sight in, out of sight out
    const walking = this.agents.filter(a => a.role === 'walk').length;
    if (walking < t.walkers) for (let k = 0; k < Math.min(this.warm > 0 ? 6 : 3, t.walkers - walking); k++) this.spawnWalker();
    if (walking > t.walkers) for (const a of this.agents) if (a.role === 'walk' && !a.path && !this.seen(a.x, a.z)) { this.hide(a); break; }
    // walkers who wandered far from the player come back near them (out of sight both ways)
    let moved = 0;
    for (const a of this.agents) if (moved < 3 && a.role === 'walk' && !a.path && !this.onStage(a.x, a.z) && !this.seen(a.x, a.z)) { this.hide(a); this.spawnWalker(); moved++; }
    // people who have waited long enough move on
    for (const a of this.agents) if ((a.role === 'stop' || a.role === 'group' || a.role === 'pickup' || a.role === 'hail') && !a.path && (a.stay -= 1) <= 0) {
      if (a.role === 'hail' && kerbSpots[a.hail]?.claimed) { a.stay = 8; continue; }               // a taxi is coming for them
      if (a.role === 'hail' && this.kerbs[a.hail]) this.kerbs[a.hail].until = kerb.clock + 20;
      if (this.seen(a.x, a.z)) this.toLane(a); else this.hide(a);
    }
  }

  /** A car rapide pulls in: two or three of those waiting get on, one or two get off and walk away. */
  /** The scenes of the street (activity clusters), the people at the kerb, the cyclists: towards the hour's numbers. */
  private planScenes(t: { groups: number }) {
    void t;
    const B = STREET_BUDGET[this.q], H = HUB_STREETS[this.hub.id], hour = this.ctx.hour(), me = this.ctx.player.pos, f = this.look;
    // scenes: the nearest (the camera's side first) that fit in the budget are on, the others break up
    const budget = Math.round(B.scenes * Math.max(0.55, curveAt(CHAT_BY_HOUR, hour)) * Math.min(1, (H?.level ?? 0.5) + 0.3));
    const order = this.scenes.map((g, i) => {
      const mx = g.x - me.x, mz = g.z - me.z, d = len2(mx, mz), ahead = (mx * f.x + mz * f.z) / (d + 1) > 0.2;
      const held = g.taken.some(Boolean);
      return { i, d: d * (ahead ? 0.65 : 1) * (held ? 0.75 : 1), raw: d };
    }).filter(o => o.raw < 64).sort((a, b) => a.d - b.d);
    let used = 0; const on = new Set<number>();
    for (const o of order) { const n = this.scenes[o.i].ring.length; if (used + n <= budget) { used += n; on.add(o.i); } }
    this.scenes.forEach((g, i) => {
      g.on = on.has(i);
      if (!g.on) for (const a of g.taken) if (a && a.role === 'group' && !a.path) { if (this.seen(a.x, a.z)) this.toLane(a); else this.hide(a); }
    });
    let sb = 3;
    for (const o of order) if (sb > 0 && this.scenes[o.i].on && this.fillGroup(o.i, this.scenes)) sb--;
    // the kerb: a few people hail a taxi or a minibus near the player
    let hailers = 0; for (const a of this.agents) if (a.role === 'hail' || a.role === 'board') hailers++;
    const hailMax = Math.round(B.hail * Math.min(1, 0.35 + curveAt(WALK_BY_HOUR, hour)));
    if (hailers < hailMax) {
      const near = kerbSpots.map((k, i) => ({ i, d: len2(k.x - me.x, k.z - me.z) })).filter(o => o.d < 58).sort((a, b) => a.d - b.d);
      for (const o of near) if (this.fillHail(o.i)) break;
    }
    for (const a of this.agents) if (a.role === 'hail' && a.hail >= 0) this.crowd.setMemberMood(a.id, kerbSpots[a.hail].claimed ? 'hail' : 'rest');
    // cyclists
    let riding = 0; for (const a of this.agents) if (a.role === 'ride') riding++;
    const wantRiders = Math.round(B.riders * Math.min(1, 0.3 + curveAt(WALK_BY_HOUR, hour)) * Math.min(1, (H?.level ?? 0.5) + 0.4));
    if (riding < wantRiders) this.spawnRider();
    for (const a of this.agents) if (a.role === 'ride' && !this.onStage(a.x, a.z) && !this.seen(a.x, a.z)) { this.hide(a); break; }
    if (this.ready) this.crossTick();
  }

  /**
   * A car rapide pulls in at a stop (transport.dwellingAt): the people waiting there climb in at its rear door one after
   * the other — two or three at an ordinary stop, up to the car's fill for the ride-home crowd after the gala — and one
   * or two get off and walk away. The player's own boarding is the transport lane's: it always keeps seats free.
   */
  private buses() {
    const now = dwellingAt(this.stops.map(s => s.key));
    for (const key of newArrivals(this.dwelling, now)) {
      const si = this.stops.findIndex(s => s.key === key); if (si < 0) continue;
      const s = this.stops[si], car = now.get(key)!, door = { x: car.x, z: car.z };
      const waiting = s.taken.filter(a => a && a.role === 'stop' && !a.path) as Agent[];
      // nearest to the door first: the front of the crowd gets in
      waiting.sort((p, q) => len2(p.x - door.x, p.z - door.z) - len2(q.x - door.x, q.z - door.z));
      const n = boardCount({ waiting: waiting.length, crowd: s.crowd, seats: this.carSeats, fill: lineFill(key, this.ctx.day(), this.ctx.hour()), left: car.left, r: this.rand() });
      let k = 0;
      for (const a of waiting) {
        if (k >= n) break;
        const route = routeClear(a, door, this.cols); if (!route) continue;
        this.counts.boarded++;
        this.walkTo(a, route, () => this.hide(a), 1.5);
        a.delay = k * BOARD_GAP; k++;
      }
      const off = s.crowd && this.leaving > 0 ? 0 : this.rand() < 0.5 ? 1 : 2;   // nobody gets off at the arena after the gala
      for (let j = 0; j < off; j++) {
        const a = this.free(); if (!a) break;
        a.x = door.x + (this.rand() - 0.5) * 0.6; a.z = door.z + (this.rand() - 0.5) * 0.6; a.role = 'walk';
        this.show(a); this.counts.alighted++;
        this.toLane(a);
      }
    }
    this.dwelling = now;
    // taxis and minibuses at the kerb: someone climbs in (the one waiting there), someone climbs out
    for (let ki = 0; ki < kerbSpots.length; ki++) {
      const k = kerbSpots[ki]; if (!k.halted) continue;
      if (k.fresh) { k.fresh = false; this.alight(k); }
      let n = 0;
      for (const a of this.agents) {
        if (a.role !== 'hail' || a.hail !== ki || a.path) continue;
        const door = { x: k.cx + k.px * 1.1, z: k.cz + k.pz * 1.1 }, route = routeClear(a, door, this.cols) ?? [door];
        a.role = 'board'; this.counts.boarded++;
        this.walkTo(a, route, () => { if (this.kerbs[ki]) this.kerbs[ki].until = kerb.clock + 25; this.hide(a); }, 1.5);
        a.delay = n++ * 0.8;
      }
    }
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
    // (how many the stands held, at most: counted twice a second, not every frame — `present` visits every place of the stands)
    if ((this.standsT -= dt) <= 0) { this.standsT = 0.5; for (const c of LIVE_CROWDS) if (c.name === 'arena-stands') this.standsMax = Math.max(this.standsMax, c.present); }
    const me = this.ctx.player.pos, g = gateOf(this.hub.arena);
    if (!this.eventWas && on && len2(me.x - g.x, me.z - g.z) < 160) {
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
    // the car rapide home: the nearest served stop, the evening route's « Arène » first (it holds a crowd)
    const stop = this.stops.map((s, i) => ({ i, d: len2(s.site.x - a.x, s.site.z - a.z) * (s.crowd ? 0.5 : 1) }))
      .filter(x => this.stops[x.i].served && x.d < 90).sort((x, y) => x.d - y.d)[0]?.i ?? -1;
    if (u < (stop >= 0 && this.stops[stop].crowd ? 0.5 : 0.4) && stop >= 0) {
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
    if (u >= 0.5 && u < 0.7 && this.corners.length && this.arrivals) {   // a taxi at a corner
      const ci = this.corners.map((c, i) => ({ i, d: len2(c.door.x - a.x, c.door.z - a.z) })).sort((x, y) => x.d - y.d)[0].i;
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
    this.toLane(a);                                                    // home on foot, or on to the Dibi
    if (this.dibi && u >= 0.7 && u < 0.86) a.goal = { ...this.dibi };
  }

  private step(a: Agent, dt: number) {
    if (a.delay > 0) { a.delay -= dt; return; }
    if (a.role === 'ride') { this.stepRide(a, dt); return; }
    if (a.hold > 0) {                                                    // at the kerb, about to cross: wait for a gap
      a.hold -= dt;
      if (a.hold <= 0) { if (trafficNear(a.x, a.z, 11)) a.hold = 0.5; else { a.speed = a.hspeed; if (a.cs >= 0) crossings[a.cs].on = true; } }
      return;
    }
    if (a.path) {
      const to = a.path[a.pi + 1];
      if (!to) { a.path = null; const f = a.then; a.then = null; f?.(); this.place(a); return; }
      const dx = to.x - a.x, dz = to.z - a.z, d = len2(dx, dz), s = a.speed * dt;
      if (d <= s) { a.x = to.x; a.z = to.z; a.pi++; } else { a.x += (dx / d) * s; a.z += (dz / d) * s; }
      if (d > 0.01) a.yaw = Math.atan2(dx, dz);
      if (a.cs >= 0) { const w = crossings[a.cs]; w.x = a.x; w.z = a.z; }
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
    if (a.goal && len2(a.x - a.goal.x, a.z - a.goal.z) < 12) {
      // arrived near the Dibi: in at its door (ambient life's customers take over inside)
      const g = a.goal; a.goal = null; this.counts.dibi++;
      this.walkTo(a, routeClear(a, g, this.cols) ?? [], () => this.hide(a), a.speed);
      return;
    }
    a.t += (a.fwd ? 1 : -1) * a.speed * dt;
    if (a.t < 0 || a.t > l.len) { this.cross(a); return; }
    const p = this.lanePt(l, a.t, a.side);
    const grid = this.colGrid;
    if (this.closedQueue && grid && grid.blocked(p.x, p.z, 0.25) && !grid.blocked(a.x, a.z, 0.25)) {
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
    let pick = opts[0];
    if (a.goal) {
      // heading somewhere: the lane whose far end comes closest to the goal
      const g = a.goal, far = (o: { lane: number; forward: boolean }) => { const x = this.lanes[o.lane]; return o.forward ? { x: x.bx, z: x.bz } : { x: x.ax, z: x.az }; };
      pick = opts.reduce((b, o) => { const p = far(o), q = far(b); return len2(p.x - g.x, p.z - g.z) < len2(q.x - g.x, q.z - g.z) ? o : b; });
    } else {
      // the stream goes on straight across the crossing more often than it turns
      const heading = { x: (l.bx - l.ax) * (a.fwd ? 1 : -1), z: (l.bz - l.az) * (a.fwd ? 1 : -1) };
      let sum = 0; const w = opts.map(o => {
        const x = this.lanes[o.lane], dir = { x: (x.bx - x.ax) * (o.forward ? 1 : -1), z: (x.bz - x.az) * (o.forward ? 1 : -1) };
        const straight = (dir.x * heading.x + dir.z * heading.z) / (x.len * l.len) > 0.9 && x.side === l.side ? 4 : 1;
        const v = x.w ** 2 * straight; sum += v; return v;
      });
      let u = this.rand() * sum;
      for (let i = 0; i < opts.length; i++) { u -= w[i]; if (u <= 0) { pick = opts[i]; break; } }
    }
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
      lanes: this.lanes.length, busyLanes: this.lanes.filter(l => l.w > 1).length, stops: this.stops.map(s => ({ key: s.key, busy: s.busy, crowd: s.crowd, served: s.served, waiting: s.taken.filter(Boolean).length, slots: s.slots.length })),
      scenes: this.scenes.filter(g => g.on).length, sceneSpots: this.scenes.length, sceneKinds: this.scenes.reduce((m, g) => { const k = g.kind ?? '?'; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>),
      crossing: this.agents.filter(a => a.cs >= 0).length, riding: this.agents.filter(a => a.role === 'ride').length, peddling: this.peddlersNow(), hailing: this.agents.filter(a => a.role === 'hail').length,
      kerb: kerbSpots.map(k => ({ x: Math.round(k.x), z: Math.round(k.z), long: k.long, waiting: k.waiting, claimed: k.claimed, halted: k.halted })),
      groups: this.groups.filter(g => g.on).length, groupSpots: this.groups.length, corners: this.corners.map(c => c.taken.filter(Boolean).length),
      crowd: this.crowd.stats(), drawCalls: this.crowd.drawCalls(),
    };
  }
  /** Debug: where the people are (checks verify nobody stands inside a collider; the cyclists ride the road's edge, see scenesNow). */
  where() { return this.agents.filter(a => a.role !== 'off' && a.role !== 'ride').map(a => ({ id: a.id, role: a.role, x: a.x, z: a.z, moving: !!a.path || a.role === 'walk' })); }
  /** Debug: people inside a wall, a stall or furniture right now (must stay 0). */
  blocked() {
    return this.agents.filter(a => a.role !== 'off' && a.role !== 'ride' && this.cols.some(c => a.x > c.x0 - 0.1 && a.x < c.x1 + 0.1 && a.z > c.z0 - 0.1 && a.z < c.z1 + 0.1)).map(a => `${a.id} ${a.role} ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
  }
  /** Debug: start the after-gala flow now. */
  leaveNow(n = 20) { this.leaving = n; this.leaveT = 0; }

  /** Debug: where the clusters, the crossings, the cyclists and the kerb are (captures place the camera by it). */
  scenesNow() {
    return {
      scenes: this.scenes.map(g => ({ kind: g.kind, x: g.x, z: g.z, on: g.on, people: g.taken.filter(Boolean).length })),
      crossing: this.agents.filter(a => a.cs >= 0).map(a => ({ x: a.x, z: a.z, on: crossings[a.cs].on })),
      riders: this.agents.filter(a => a.role === 'ride').map(a => ({ x: a.x, z: a.z })),
      peddlers: this.agents.filter(a => a.prop === 1 || a.prop === 2).map(a => ({ x: a.x, z: a.z, prop: a.prop })),
      kerb: kerbSpots.map(k => ({ x: k.x, z: k.z, long: k.long, waiting: k.waiting, claimed: k.claimed, halted: k.halted })),
    };
  }

  dispose() {
    this.crowd.dispose(); this.props.dispose();
    kerbSpots.length = 0; for (const c of crossings) c.on = false;
  }
}

const hash = (x: number, z: number) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
