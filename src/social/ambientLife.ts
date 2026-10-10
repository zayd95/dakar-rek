import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Body } from '../interact/people';
import { seatClip, sitOriginY, type Seat } from '../interact/seats';
import { Humanoid, humanoidReady, randomLook, type Clip, type PersonLook } from '../actors/humanoid';
import { Impostors, ForeignBodies, cullHumanoid, ownerVisible, type Foreign } from '../actors/crowdLod';
import { hubLayout } from '../world/builder';
import { rng } from '../core/rng';
import { ROUTINES, currentPlan, resolvePlace, planPath, laneGraph, collidersClear, pathLength, type ClearFn } from './routines';
import { ACTIVITIES, AMBIENT_BUDGET, TRAFFIC_BY_HOUR, WALKERS_BY_HOUR, type AmbientQuality } from './ambientData';
import { planDemand, chooseSeat, curveAt, dayOfWeek, seatCapacity, isNpcOccupant, STAND_ON, type AmbientActivity, type AmbientSpot, type LookKind, type Pt, type SeatLike } from './ambient';
import { buildSpots, furnitureSeats } from './ambientSpots';
import type { ShopInfo } from '../world/shopFlow';
import type { Collider } from '../world/types';

/**
 * Ambient city life at run time (docs/NPC_LIFE.md): people come to the spots of the hub, do what the hour and the day
 * call for (eat seated at the gargote, wait for the car rapide, pray in rows, drink attaya, jog on the Corniche…) and
 * leave, walking on the sidewalks (routines.ts paths). Seats are taken through the shared registry and given back; the
 * player's seat is never taken and every place keeps free seats. Only the nearest people get an animated body (a small
 * pool reused from person to person); the others are cheap instanced figures, and the same budget also covers the other
 * systems' humanoids (crowdLod.ts). Local to this device, like the walkers.
 */
type State = 'off' | 'in' | 'wait' | 'do' | 'out' | 'ride';
interface Actor {
  n: number; key: string; state: State; born: number;
  spot: AmbientSpot | null; act: AmbientActivity | null;
  look: PersonLook; color: THREE.Color; clip: Clip;
  seat: string | null; slot: number; slotRow: boolean; standOn: boolean; sitting: boolean;
  x: number; z: number; y: number; yaw: number;
  tx: number; tz: number; tyaw: number;
  /** In front of the seat (where a walk ends before sitting down), the body height and the pose when seated (Sit, Kneel). */
  ax: number; az: number; sitY: number; sitClip: Clip;
  path: Pt[]; seg: number; speed: number; until: number; pause: number; cool: number;
  /** Place in the counter queue while waiting to be served (−1: none), and how long the wait lasts. */
  q: number; qx: number; qz: number; qyaw: number; waitT: number;
  /** In a shop's checkout line (spot.shop.checkout) rather than a serving queue; done = has gone to pay already. */
  cq: boolean; paid: boolean;
  /** Time before the next change of gesture (vendors and talkers do not freeze in one clip). */
  clipT: number;
  /** Sitting down (twDir 1) / standing up (−1): counts down from 1 over half a second. */
  tw: number; twDir: 1 | -1;
  route: { ax: number; az: number; bx: number; bz: number; t: number; dir: 1 | -1; lat: number } | null;
  board: Pt | null;
  body: Humanoid | null; lod: 0 | 1 | 2; acc: number; d: number;
  rec: Body;
}

const SNAP_DIST = 45;        // spots farther than this fill and empty without walking (nobody sees them arrive)
const PLAYER_ROOM = 2.6;     // nobody takes a seat or a standing place this close to the player
const CAST_ROOM = 0.7;
const WALK: [number, number] = [1.15, 1.45];
const SPORT = [0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0xf2f2ec, 0x222428, 0xe8742c];
const BOUBOU = [0xf2f2ec, 0x9cc8e8, 0x27407a, 0xe8e2d4, 0x1f7a44, 0xd9b44a, 0xf6f1e3];

export class AmbientLife implements GameModule {
  readonly name = 'ambient-life';
  readonly group = new THREE.Group();
  private ctx!: GameCtx;
  private world: HubWorld | null = null;
  private q: AmbientQuality = 'medium';
  private B: (typeof AMBIENT_BUDGET)[AmbientQuality] = AMBIENT_BUDGET.medium;
  private rand = rng(0x5eed);
  private t = 0; private loadFrame = 0; private frameNo = 0;
  private spots: AmbientSpot[] | null = null;
  private spotById = new Map<string, AmbientSpot>();
  private actors: Actor[] = [];
  private order: Actor[] = [];
  private slotsTaken = new Map<string, (number | null)[]>();
  private clear: ClearFn = () => true;
  private sig = '';
  private reconT = 0; private lodT = 0; private scanT = 0; private sigT = 0;
  private snapNext = true;
  private lastHour = -1;
  private dayOverride: number | null = null;
  private reserved: Pt[] = [];
  private castHolds: string[] = [];
  private resKey = -1;
  // bodies, figures, props
  private pool: Humanoid[] = [];
  private freeBodies: Humanoid[] = [];
  private bodyLook = new Map<Humanoid, PersonLook>();
  private impostors: Impostors | null = null;
  private plates: THREE.InstancedMesh | null = null;
  private foreign = new ForeignBodies();
  private cand: Cand[] = [];
  private view: Cand[] = [];
  private plateM = new THREE.Matrix4();
  private bodyList: Body[] = [];
  private sceneHold = false;
  /** The player's ground velocity (smoothed): a seat they are walking to is theirs. */
  private pv = { x: 0, z: 0, vx: 0, vz: 0 };
  private thinT = 0;
  private stats = { full: 0, mineFull: 0, foreignFull: 0, figures: 0, foreign: 0 };
  /** Stocked shops (spot.shop): how many came in through the door, joined the checkout line and paid at the counter. */
  private shopTally = new Map<string, { entered: number; queued: number; paid: number }>();
  private tally(spot: string, k: 'entered' | 'queued' | 'paid') { const t = this.shopTally.get(spot) ?? { entered: 0, queued: 0, paid: 0 }; t[k]++; this.shopTally.set(spot, t); }

  // ------------------------------------------------------------------ module hooks
  init(ctx: GameCtx) {
    this.ctx = ctx;
    this.group.name = 'ambient_life';
    ctx.scene.add(this.group);
    ctx.people.addBodies(() => this.bodyList);
    const plateGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.03, 10);
    this.plates = new THREE.InstancedMesh(plateGeo, new THREE.MeshLambertMaterial({ color: 0xf1ece0 }), 48);
    this.plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.plates.frustumCulled = false; this.plates.count = 0;
    this.group.add(this.plates);
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    for (const a of this.actors) this.off(a, false);
    this.world = hub; this.spots = null; this.spotById.clear(); this.slotsTaken.clear(); this.shopTally.clear();
    this.clear = collidersClear(hub.colliders);
    this.foreign.clear(); this.reserved = []; this.castHolds = []; this.resKey = -1;
    this.loadFrame = this.frameNo; this.snapNext = true; this.sig = '';
    this.scanT = 0; this.lodT = 0; this.thinT = 0;
    this.setQuality(ctx.quality());
  }

  spaceChanged(_ctx: GameCtx, space: string) {
    // people of a room the player left are gone; the street keeps its people (frozen while the player is inside)
    for (const a of this.actors) if (a.state !== 'off' && a.spot && a.spot.space !== 'street' && a.spot.space !== space) this.off(a, false);
    this.snapNext = true;
  }

  update(ctx: GameCtx, dt: number) {
    this.t += dt; this.frameNo++;
    const w = this.world;
    if (!w || !humanoidReady()) return;
    if (ctx.mode() === 'scene') {                              // làmb scenes place their own crowd
      if (!this.sceneHold) { this.group.visible = false; this.foreign.restore(); this.sceneHold = true; }
      return;
    }
    if (this.sceneHold) { this.sceneHold = false; this.group.visible = true; }
    // a few frames after the hub load: every module has registered its places and seats, the player is placed
    if (!this.spots) { if (this.frameNo - this.loadFrame < 4) return; this.build(); }
    const hour = ctx.hour();
    if (this.lastHour >= 0 && Math.abs(((hour - this.lastHour + 36) % 24) - 12) > 0.5) this.snapNext = true;  // hour jump (debug, travel)
    this.lastHour = hour;
    if ((this.sigT -= dt) <= 0) { this.sigT = 1; if (this.signature() !== this.sig) this.build(); }
    if ((this.reconT -= dt) <= 0 || this.snapNext) { this.reconT = 0.5; this.reconcile(this.snapNext); this.snapNext = false; }
    const space = ctx.space(), p = ctx.player.pos, pv = this.pv;
    if (Math.hypot(p.x - pv.x, p.z - pv.z) > 3 || dt <= 0) { pv.vx = 0; pv.vz = 0; }   // teleport, door
    else { const k = Math.min(1, dt * 6); pv.vx += ((p.x - pv.x) / dt - pv.vx) * k; pv.vz += ((p.z - pv.z) / dt - pv.vz) * k; }
    pv.x = p.x; pv.z = p.z;
    for (const a of this.actors) if (a.state !== 'off' && this.inView(a, space)) this.step(a, dt, p);
    if ((this.thinT -= dt) <= 0) { this.thinT = 1; this.thin(hour); }
    if ((this.scanT -= dt) <= 0) { this.scanT = 2; this.foreign.scan(ctx.extra, g => this.prioOf(g)); }
    if ((this.lodT -= dt) <= 0) { this.lodT = 0.2; this.lod(space); }
    this.draw(dt);
  }

  // ------------------------------------------------------------------ spots
  private signature() { return `${this.ctx.places.all().map(p => p.id).join(',')}|${this.ctx.seats.size}`; }

  private build() {
    const ctx = this.ctx, w = this.world!;
    // street furniture the builders draw without seats (kiosk benches, dibiterie chairs…), once per hub
    for (const s of furnitureSeats(w.interactables, hubLayout(w.id), ctx.seats.all(), ctx.places.all())) {
      ctx.seats.add({ ...s, kind: s.kind as Seat['kind'] });
      for (const pp of w.people) if (pp.clip === 'Sit' && Math.hypot(pp.x - s.x, pp.z - s.z) < 0.5) ctx.seats.occupy(s.id, 'npc');
    }
    const doors = w.rapides.map(car => { car.updateMatrixWorld(true); const v = car.localToWorld(new THREE.Vector3(-0.35, 0, -4.4)); return { x: v.x, z: v.z }; });
    const people: Pt[] = [];
    for (const pp of w.people) {
      people.push({ x: pp.x, z: pp.z });
      if (pp.walkTo) for (let k = 1; k <= 4; k++) people.push({ x: pp.x + (pp.walkTo.x - pp.x) * k / 4, z: pp.z + (pp.walkTo.z - pp.z) * k / 4 });
    }
    const old = this.spotById;
    // the shops stocked by the shop kit (src/world/city.ts): their door, displays, counter queue and furniture
    const shops: ShopInfo[] = [];
    w.group.traverse(o => { const u = o.userData.shop; if (u) shops.push({ key: u.key, type: u.type, anchors: u.anchors, bounds: u.bounds, colliders: (o.userData.shopColliders as Collider[] | undefined) ?? [] }); });
    this.spots = buildSpots({ places: ctx.places.all(), seats: ctx.seats.all(), interactables: w.interactables, layout: hubLayout(w.id), colliders: w.colliders, people, arena: w.arena, doors, lite: ctx.quality() === 'low', shops });
    this.spotById = new Map(this.spots.map(s => [s.id, s]));
    for (const a of this.actors) if (a.state !== 'off' && a.spot && this.spotById.get(a.spot.id) !== a.spot) {
      const fresh = this.spotById.get(a.spot.id);
      if (fresh && a.state === 'do' && (a.seat ? fresh.seats.includes(a.seat) : a.slot < 0)) a.spot = fresh; else this.off(a, false);
    }
    for (const id of old.keys()) if (!this.spotById.has(id)) this.slotsTaken.delete(id);
    this.sig = this.signature();
    this.resKey = -1;
  }

  /** Cast members (social/routines.ts) keep their spots: seats under them are held, standing places next to them avoided. */
  private refreshReserved(hour: number) {
    const key = Math.floor(hour * 4); if (key === this.resKey) return;
    this.resKey = key;
    const ctx = this.ctx, w = this.world!;
    for (const id of this.castHolds) { const s = ctx.seats.get(id); if (s?.occupant?.startsWith('npc:cast:')) s.occupant = null; }
    this.castHolds = []; this.reserved = [];
    for (const r of ROUTINES) {
      if (r.hub !== w.id) continue;
      const s = resolvePlace(currentPlan(r, hour, id => id in ctx.state.data.beats).place, w.interactables);
      if (!s) continue;
      this.reserved.push({ x: s.x, z: s.z });
      for (const a of this.actors) if (a.state === 'do' && !a.seat && a.spot?.space === 'street' && Math.hypot(a.tx - s.x, a.tz - s.z) < CAST_ROOM) this.leave(a);
      if (!s.sit) continue;
      const seat = ctx.seats.inSpace('street').find(x => Math.hypot(x.x - s.x, x.z - s.z) < 0.5);
      if (!seat) continue;
      if (seat.occupant?.startsWith('npc:amb:')) { const a = this.actors.find(x => x.key === seat.occupant); if (a) this.leave(a); }   // stands up for them
      if (ctx.seats.occupy(seat.id, 'npc:cast:' + r.id)) this.castHolds.push(seat.id);
    }
  }

  // ------------------------------------------------------------------ population
  private dow() { return this.dayOverride ?? dayOfWeek(this.ctx.day()); }
  private seatKind = (id: string) => this.ctx.seats.get(id)?.kind ?? null;

  private reconcile(snap: boolean) {
    const ctx = this.ctx, hour = ctx.hour(), space = ctx.space(), p = ctx.player.pos, B = this.B;
    this.refreshReserved(hour);
    const rows = planDemand(this.spots!, ACTIVITIES, { hour, dow: this.dow(), scale: B.scale, px: p.x, pz: p.z, near: B.near, far: B.plan, cap: B.population, space, seatKind: this.seatKind });
    const want = new Map<string, number>();
    for (const r of rows) want.set(r.spot.id + '/' + r.act.id, r.n);
    // newest first: they fill the quotas, the people who have been there longest are the ones who leave
    const order = this.order; order.length = 0;
    for (const a of this.actors) if ((a.state === 'in' || a.state === 'wait' || a.state === 'do') && a.spot!.space === space) order.push(a);
    order.sort((u, v) => v.born - u.born);
    const have = new Map<string, number>();
    for (const a of order) {
      const k = a.spot!.id + '/' + a.act!.id, n = want.get(k) ?? 0, c = (have.get(k) ?? 0) + 1;
      if (c > n) { if (snap) this.off(a, true); else this.leave(a); } else have.set(k, c);
    }
    let paths = snap ? Infinity : 3;
    for (const r of rows) {
      let deficit = r.n - (have.get(r.spot.id + '/' + r.act.id) ?? 0);
      while (deficit > 0) {
        const near = !snap && r.spot.space === 'street' && r.d / (r.spot.prio ?? 1) < SNAP_DIST;
        if (near && paths <= 0) break;
        const g = Math.min(deficit, this.groupSize(r.act));
        const made = this.spawn(r.spot, r.act, g, !near);
        if (near) paths -= Math.max(1, made);                       // failed walks cost a path too
        if (!made) break;
        deficit -= made;
      }
    }
  }

  private groupSize(a: AmbientActivity) { const [lo, hi] = a.group ?? [1, 1]; return lo + Math.floor(this.rand() * (hi - lo + 1)); }

  private freeActor(): Actor | null {
    for (const a of this.actors) if (a.state === 'off') return a;
    if (this.actors.length >= this.B.population) return null;
    const n = this.actors.length;
    const a: Actor = {
      n, key: 'npc:amb:' + n, state: 'off', born: 0, spot: null, act: null, look: randomLook(this.rand), color: new THREE.Color(), clip: 'Idle',
      seat: null, slot: -1, slotRow: false, standOn: false, sitting: false, x: 0, z: 0, y: 0.1, yaw: 0, tx: 0, tz: 0, tyaw: 0,
      ax: 0, az: 0, sitY: 0.1, sitClip: 'Sit', path: [], seg: 0, speed: 1.3, until: 0, pause: 0, cool: 0, q: -1, qx: 0, qz: 0, qyaw: 0, waitT: 0, cq: false, paid: false, clipT: 0, tw: 0, twDir: 1, route: null, board: null,
      body: null, lod: 0, acc: 0, d: 0, rec: { id: 'amb:' + n, obj: new THREE.Object3D(), h: null, bias: 3 },   // focus after places, the cast and seats in reach: a passer-by never hides them
    };
    this.actors.push(a);
    return a;
  }

  /** Brings `k` people (a group) to a spot for an activity. Returns how many came. */
  private spawn(spot: AmbientSpot, act: AmbientActivity, k: number, snap: boolean): number {
    let made = 0, first: Actor | null = null;
    for (let i = 0; i < k; i++) {
      const a = this.freeActor(); if (!a) break;
      if (!this.claim(a, spot, act, first)) break;
      a.spot = spot; a.act = act; a.state = 'do'; a.born = this.t + i * 0.01;
      a.look = this.lookFor(act.look); a.color.setHex(a.look.top);
      a.clip = act.pose === 'sit' ? 'Sit' : act.clips[Math.floor(this.rand() * act.clips.length)];
      a.until = this.t + act.stay[0] + this.rand() * (act.stay[1] - act.stay[0]);
      a.speed = act.speed ? act.speed[0] + this.rand() * (act.speed[1] - act.speed[0]) : WALK[0] + this.rand() * (WALK[1] - WALK[0]);
      a.pause = 0; a.tw = 0; a.board = null; a.paid = false;
      if (snap) this.settle(a);
      else if (!this.arrive(a)) { this.off(a, true); break; }       // no clean way in, in sight of the player: nobody pops up
      a.rec.space = spot.space; a.rec.female = !!a.look.female;
      made++; first ??= a;
    }
    return made;
  }

  /** Takes a seat, a standing place or a place in a row for the activity; false when the spot is full. */
  private claim(a: Actor, spot: AmbientSpot, act: AmbientActivity, mate: Actor | null): boolean {
    const ctx = this.ctx, inSpace = ctx.space() === spot.space;
    const nearPlayer = (x: number, z: number) => inSpace && this.playersSpot(x, z, PLAYER_ROOM);
    const nearCast = (x: number, z: number) => spot.space === 'street' && this.reserved.some(r => Math.hypot(r.x - x, r.z - z) < CAST_ROOM);
    a.seat = null; a.slot = -1; a.slotRow = false; a.standOn = false; a.sitting = false; a.route = null;
    const seatList = (stand: boolean) => {
      const out: SeatLike[] = [];
      for (const id of spot.seats) { const s = ctx.seats.get(id); if (s && STAND_ON.includes(s.kind) === stand && s.kind !== 'vehicle') out.push(s); }
      return out;
    };
    const takeSeat = (list: SeatLike[], keepFree: number | undefined) => {
      const s = chooseSeat(list, { kinds: act.seatKinds, keepFree, r: this.rand(), near: mate?.seat ? { x: mate.tx, z: mate.tz } : null,
        avoid: x => nearPlayer(x.x, x.z) || nearCast(x.x, x.z) });
      if (!s || !ctx.seats.occupy(s.id, a.key)) return false;
      this.seatPose(a, s, spot);
      return true;
    };
    switch (act.pose) {
      case 'sit': return takeSeat(seatList(false), act.keepFree);
      case 'row': {
        const prayerSeats = seatList(true);
        // prayer rows of a venue kneel like its own congregation (Seat.clip); bare rows without a pose are stood on
        if (prayerSeats.length) { if (!takeSeat(prayerSeats, act.keepFree ?? 0.1)) return false; a.standOn = !(ctx.seats.get(a.seat!) as Seat).clip; return true; }
        return this.takeSlot(a, spot, spot.rows ?? [], true, null, nearPlayer, nearCast);
      }
      case 'stand': return this.takeSlot(a, spot, spot.stands, false, mate, nearPlayer, nearCast);
      case 'route': {
        const r = spot.route!; const i = Math.floor(this.rand() * (r.length - 1));
        a.route = { ax: r[i].x, az: r[i].z, bx: r[i + 1].x, bz: r[i + 1].z, t: this.rand(), dir: this.rand() < 0.5 ? 1 : -1, lat: (this.rand() - 0.5) * 1.6 };
        const pt = this.routePoint(a); a.tx = a.ax = pt.x; a.tz = a.az = pt.z; a.tyaw = pt.yaw;
        return !nearPlayer(a.tx, a.tz);
      }
      case 'roam': {
        const [x0, z0, x1, z1] = spot.area!;
        a.tx = a.ax = x0 + this.rand() * (x1 - x0); a.tz = a.az = z0 + this.rand() * (z1 - z0); a.tyaw = this.rand() * Math.PI * 2;
        return true;
      }
    }
  }

  /**
   * The player has priority: a place within `r` of them, or ahead of them while they walk toward it (9 m, ~35° cone),
   * is theirs.
   */
  private playersSpot(x: number, z: number, r: number) {
    const p = this.ctx.player.pos, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < r) return true;
    const v = this.pv, sp = Math.hypot(v.vx, v.vz);
    return sp > 0.8 && d < 9 && (dx * v.vx + dz * v.vz) / (d * sp) > 0.82;
  }

  /** Seat target and the step in front of it — or beside/behind it when a table or a wall is in front. */
  private seatPose(a: Actor, s: SeatLike, spot: AmbientSpot | null) {
    a.seat = s.id; a.tx = s.x; a.tz = s.z; a.tyaw = s.yaw; a.sitY = sitOriginY(s); a.sitClip = seatClip(s as Pick<Seat, 'clip'>);
    const hint = spot?.seatApproach?.[s.id];
    if (hint) { a.ax = hint.x; a.az = hint.z; return; }
    const cols = this.colsFor(s.space), fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    for (const [ox, oz] of [[fx, fz], [fz, -fx], [-fz, fx], [-fx, -fz]]) {
      const x = s.x + ox * 0.62, z = s.z + oz * 0.62;
      if (!cols.some(c => c.h > 0.3 && x > c.x0 - 0.2 && x < c.x1 + 0.2 && z > c.z0 - 0.2 && z < c.z1 + 0.2 && !(s.x > c.x0 && s.x < c.x1 && s.z > c.z0 && s.z < c.z1))) { a.ax = x; a.az = z; return; }
    }
    a.ax = s.x + fx * 0.62; a.az = s.z + fz * 0.62;
  }

  /** Solid objects of a space: the hub's in the street, the room's when the player is inside it. */
  private colsFor(space: string) {
    if (space === 'street') return this.world!.colliders;
    const ins = this.ctx.inside();
    return ins && this.ctx.space() === space ? ins.int.colliders : [];
  }

  /** Every leg of the walk is clear of walls and furniture (characters never walk through them). */
  private pathOk(path: Pt[], space: string) {
    if (path.length < 2) return false;
    const clear = space === 'street' ? this.clear : collidersClear(this.colsFor(space));
    for (let i = 1; i < path.length; i++) if (!clear(path[i - 1], path[i])) return false;
    return true;
  }

  /** Inside a room: straight from the door, or with one turn, whichever is clear; null when furniture is in the way. */
  private roomPath(from: Pt, to: Pt, space: string): Pt[] | null {
    for (const p of [[from, to], [from, { x: from.x, z: to.z }, to], [from, { x: to.x, z: from.z }, to]]) if (this.pathOk(p, space)) return p;
    return null;
  }

  /** A place in the counter queue to wait to be served; false when the queue is full. */
  private takeQueue(a: Actor, spot: AmbientSpot): boolean {
    const key = spot.id + '#stands';
    let taken = this.slotsTaken.get(key);
    if (!taken) { taken = new Array(spot.stands.length).fill(null); this.slotsTaken.set(key, taken); }
    for (let i = 0; i < spot.stands.length; i++) {
      const s = spot.stands[i];
      if (taken[i] !== null || this.playersSpot(s.x, s.z, PLAYER_ROOM)) continue;
      taken[i] = a.n; a.q = i; a.qx = s.x; a.qz = s.z; a.qyaw = s.yaw;
      return true;
    }
    return false;
  }

  private freeQueue(a: Actor) {
    if (a.q < 0 || !a.spot) { a.cq = false; return; }
    const taken = this.slotsTaken.get(a.spot.id + (a.cq ? '#checkout' : '#stands'));
    if (taken && taken[a.q] === a.n) taken[a.q] = null;
    a.q = -1; a.cq = false;
  }

  /**
   * In a shop, the activity done (browsing a display, waiting on a chair), the person joins the checkout line at the
   * counter before leaving (spec §31). False when there is no line here, it is full, or the person already paid.
   */
  private checkout(a: Actor): boolean {
    const spot = a.spot!, shop = spot.shop;
    if (!shop || a.paid || spot.space !== 'street' || !shop.checkout.length) return false;
    a.paid = true;
    const key = spot.id + '#checkout';
    let taken = this.slotsTaken.get(key);
    if (!taken) { taken = new Array(shop.checkout.length).fill(null); this.slotsTaken.set(key, taken); }
    let k = -1;
    for (let i = 0; i < shop.checkout.length && k < 0; i++) if (taken[i] === null && !this.playersSpot(shop.checkout[i].x, shop.checkout[i].z, 0.8)) k = i;
    if (k < 0) return false;
    const wasSitting = a.sitting, start = wasSitting ? { x: a.ax, z: a.az } : { x: a.x, z: a.z };
    this.releaseSeat(a); this.freeSlot(a);
    const s = shop.checkout[k];
    taken[k] = a.n; a.q = k; a.cq = true; a.qx = s.x; a.qz = s.z; a.qyaw = s.yaw;
    a.path = shop.path(start, s) ?? [start, s]; a.seg = 0; a.state = 'in'; a.pause = 0;
    a.waitT = 3 + this.rand() * 3;
    if (wasSitting) { a.tw = 1; a.twDir = -1; }
    this.tally(spot.id, 'queued');
    return true;
  }

  /** In the checkout line: move up when the place ahead frees, pay at the counter, then go. */
  private checkoutWait(a: Actor, dt: number) {
    const shop = a.spot!.shop!;
    a.x = a.qx; a.z = a.qz; a.yaw = turn(a.yaw, a.qyaw, dt * 5);
    if (a.q > 0) {
      const taken = this.slotsTaken.get(a.spot!.id + '#checkout'), s = shop.checkout[a.q - 1];
      if (taken && taken[a.q - 1] === null && !this.playersSpot(s.x, s.z, 0.8)) {
        taken[a.q] = null; a.q--; taken[a.q] = a.n;
        a.qx = s.x; a.qz = s.z; a.qyaw = s.yaw;
        a.path = shop.path({ x: a.x, z: a.z }, s) ?? [{ x: a.x, z: a.z }, s]; a.seg = 0; a.state = 'in';
      }
      return;
    }
    if ((a.waitT -= dt) > 0) return;
    this.tally(a.spot!.id, 'paid');
    this.leave(a);
  }

  private takeSlot(a: Actor, spot: AmbientSpot, slots: readonly { x: number; z: number; yaw: number }[], row: boolean, mate: Actor | null,
    nearPlayer: (x: number, z: number) => boolean, nearCast: (x: number, z: number) => boolean): boolean {
    const key = spot.id + (row ? '#rows' : '#stands');
    let taken = this.slotsTaken.get(key);
    if (!taken) { taken = new Array(slots.length).fill(null); this.slotsTaken.set(key, taken); }
    let best = -1, bd = Infinity;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (taken[i] !== null || nearPlayer(s.x, s.z) || nearCast(s.x, s.z)) continue;
      // rows fill from the front, a companion stands next to the first of the group, others pick at random
      const d = row ? i : mate && mate.slot >= 0 ? Math.hypot(s.x - mate.tx, s.z - mate.tz) : this.rand();
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return false;
    taken[best] = a.n; a.slot = best; a.slotRow = row;
    a.tx = a.ax = slots[best].x; a.tz = a.az = slots[best].z; a.tyaw = slots[best].yaw;
    return true;
  }

  private freeSlot(a: Actor) {
    if (a.slot < 0 || !a.spot) return;
    const taken = this.slotsTaken.get(a.spot.id + (a.slotRow ? '#rows' : '#stands'));
    if (taken && taken[a.slot] === a.n) taken[a.slot] = null;
    a.slot = -1;
  }

  /** Puts the person straight into the activity (far from the player, at hub load, after an hour jump). */
  private settle(a: Actor) {
    this.freeQueue(a);
    a.state = 'do'; a.path.length = 0; a.tw = 0;
    a.x = a.tx; a.z = a.tz; a.yaw = a.tyaw;
    a.sitting = !!a.seat && !a.standOn;
    a.y = this.groundY(a);
  }

  /** Walks in from the sidewalk (or the room's door). False when no path: the caller settles the person in place. */
  private arrive(a: Actor): boolean {
    const spot = a.spot!, ctx = this.ctx, act = a.act!;
    // customers first queue at the counter to be served, then go and sit (in a stocked shop they pay on the way out)
    const queued = !spot.shop && !!act.serve && !!a.seat && spot.stands.length > 0 && this.takeQueue(a, spot);
    const to = queued ? { x: a.qx, z: a.qz } : this.approach(a);
    let path: Pt[] | null = null;
    if (spot.shop && spot.space === 'street') {
      // from the sidewalk to the shop's door, then around the furniture to the display or the chair
      const door = spot.shop.door, from = this.sidewalkPoint(door, 14, 32), inner = spot.shop.path(door, to);
      if (from && inner) { const outer = planPath(from, door, this.clear); if (this.pathOk(outer, 'street')) path = [...outer, ...inner.slice(1)]; }
      if (path) this.tally(spot.id, 'entered');
    } else if (spot.space !== 'street') {
      const ins = ctx.inside();
      if (ins && ctx.space() === spot.space) path = this.roomPath({ x: ins.int.spawn.x, z: ins.int.spawn.z }, to, spot.space);
    } else {
      const from = this.sidewalkPoint(to, 14, 32);
      if (from) { path = planPath(from, to, this.clear); if (!this.pathOk(path, 'street')) path = null; }
    }
    if (!path) { this.freeQueue(a); return false; }
    a.path = path; a.state = 'in'; a.seg = 0; a.x = path[0].x; a.z = path[0].z; a.y = this.groundY(a);
    a.waitT = queued ? act.serve![0] + this.rand() * (act.serve![1] - act.serve![0]) : 0;
    a.until += pathLength(path) / a.speed + a.waitT;
    return true;
  }

  /** Where a walk ends before the activity: in front of the seat, or the place itself. */
  private approach(a: Actor): Pt { return a.seat && !a.standOn ? { x: a.ax, z: a.az } : { x: a.tx, z: a.tz }; }

  /** A sidewalk corner `lo`–`hi` m from `to`, away from the player and preferably behind the camera. */
  private sidewalkPoint(to: Pt, lo: number, hi: number): Pt | null {
    const cam = this.ctx.camera, p = this.ctx.player.pos;
    const fx = Math.sin(this.ctx.follow.yaw), fz = Math.cos(this.ctx.follow.yaw);
    let best: Pt | null = null, bs = Infinity;
    for (const n of laneGraph().nodes) {
      const d = Math.hypot(n.x - to.x, n.z - to.z);
      if (d < lo || d > hi || Math.hypot(n.x - p.x, n.z - p.z) < 12) continue;
      const ahead = (n.x - cam.position.x) * fx + (n.z - cam.position.z) * fz > 0 && Math.hypot(n.x - p.x, n.z - p.z) < 40;
      const s = (ahead ? 1 : 0) + this.rand() * 0.8;
      if (s < bs) { bs = s; best = n; }
    }
    return best;
  }

  /** Leaves the activity: gives back the seat or place, then walks away (or boards) — or simply goes, out of sight. */
  private leave(a: Actor) {
    if (a.state === 'off' || a.state === 'out') return;
    const ctx = this.ctx, spot = a.spot!, p = ctx.player.pos;
    const wasSitting = a.sitting;
    this.releaseSeat(a); this.freeSlot(a); this.freeQueue(a);
    const visible = spot.space === ctx.space() && (spot.space !== 'street' || Math.hypot(a.x - p.x, a.z - p.z) < SNAP_DIST);
    if (!visible || a.state === 'in' && a.lod < 2) { this.off(a, false); return; }
    let to: Pt | null = null;
    if (a.act!.board) to = this.boardVehicle(a) ?? spot.boardAt ?? null;
    const start = wasSitting ? { x: a.ax, z: a.az } : { x: a.x, z: a.z };
    let path: Pt[] | null = null;
    if (spot.shop && spot.space === 'street') {
      // around the furniture to the shop's door, then out to the sidewalk
      const door = spot.shop.door, inner = spot.shop.path(start, door);
      to = this.sidewalkPoint(door, 16, 30);
      if (inner && to) { const outer = planPath(door, to, this.clear); if (this.pathOk(outer, 'street')) path = [...inner, ...outer.slice(1)]; }
    } else if (spot.space !== 'street') { const ins = ctx.inside(); to = ins ? { x: ins.int.spawn.x, z: ins.int.spawn.z } : null; if (to) path = this.roomPath(start, to, spot.space); }
    else {
      to ??= this.sidewalkPoint(a, 16, 30);
      if (to) { path = planPath(start, to, this.clear); if (!this.pathOk(path, 'street')) path = null; }
    }
    if (!to || !path) { this.off(a, false); return; }
    a.path = path;
    a.board = a.act!.board && to ? to : null;
    a.state = 'out'; a.seg = 0; a.pause = 0;
    if (wasSitting) { a.tw = 1; a.twDir = -1; }
  }

  /** A free vehicle seat next to the stop (transport lane): the person walks there and rides. */
  private boardVehicle(a: Actor): Pt | null {
    const spot = a.spot!, ctx = this.ctx;
    for (const s of ctx.seats.all()) {
      if (s.kind !== 'vehicle' || s.occupant || Math.hypot(s.x - spot.x, s.z - spot.z) > 14) continue;
      // a vehicle keeps seats for players too: riders never take more than its capacity
      const cabin = ctx.seats.inSpace(s.space);
      if (cabin.filter(x => isNpcOccupant(x.occupant)).length >= seatCapacity(cabin.length)) continue;
      if (!ctx.seats.occupy(s.id, a.key)) continue;
      this.seatPose(a, s, null);
      return { x: a.ax, z: a.az };
    }
    return null;
  }

  private releaseSeat(a: Actor) { if (a.seat) { this.ctx.seats.release(a.seat, a.key); a.seat = null; } a.sitting = false; a.standOn = false; }

  /** Gone (home, out of sight, boarded). */
  private off(a: Actor, release = true) {
    if (a.state === 'off') return;
    if (release || a.seat) this.releaseSeat(a);
    this.freeSlot(a); this.freeQueue(a);
    a.state = 'off'; a.path.length = 0; a.route = null;
    if (a.body) this.dropBody(a);
    a.lod = 0;
  }

  // ------------------------------------------------------------------ per frame
  private inView(a: Actor, space: string) { return a.spot!.space === space || (a.state === 'ride' && space === 'street'); }

  private groundY(a: Actor) {
    if (a.sitting && a.seat) { const s = this.ctx.seats.get(a.seat); if (s) return sitOriginY(s); }
    return 0.1 + (a.spot?.space === 'street' ? this.world!.heightAt(a.x, a.z) : 0);
  }

  private step(a: Actor, dt: number, p: THREE.Vector3) {
    const act = a.act!;
    if (a.tw > 0) {                                                   // sitting down / standing up, half a second
      a.tw = Math.max(0, a.tw - dt * 2.2);
      const k = a.twDir > 0 ? 1 - a.tw : a.tw;                        // 0 standing in front of the seat … 1 seated
      a.x = a.ax + (a.tx - a.ax) * k; a.z = a.az + (a.tz - a.az) * k;
      a.yaw = turn(a.yaw, a.tyaw, dt * 8);
      const stand = 0.1 + (a.spot!.space === 'street' ? this.world!.heightAt(a.ax, a.az) : 0);
      a.y = stand + (a.sitY - stand) * k;
      return;
    }
    // the player has priority: a seat they come to (or walk toward) before the person reached it is theirs
    if ((a.state === 'in' || a.state === 'wait') && a.seat && !a.standOn && this.playersSpot(a.tx, a.tz, 2.2) && a.spot!.space === this.ctx.space()) { this.leave(a); return; }
    if (a.state === 'wait' && a.cq) { this.checkoutWait(a, dt); return; }   // a shop's checkout line
    if (a.state === 'wait') {                                         // at the counter, being served
      a.x = a.qx; a.z = a.qz; a.yaw = turn(a.yaw, a.qyaw, dt * 5);
      if ((a.waitT -= dt) > 0) return;
      const from = { x: a.x, z: a.z }, to = this.approach(a);
      this.freeQueue(a);
      const path = a.spot!.space === 'street' ? planPath(from, to, this.clear) : this.roomPath(from, to, a.spot!.space);
      if (!path || !this.pathOk(path, a.spot!.space)) { this.leave(a); return; }  // never through a wall: give up the meal
      a.path = path; a.seg = 0; a.state = 'in';
      return;
    }
    if (a.state === 'in' || a.state === 'out') {
      // someone stopping right in front of the player says hello instead of walking through
      // (once in a while: someone standing still on a sidewalk does not stop everybody for good)
      const dP = Math.hypot(p.x - a.x, p.z - a.z);
      a.cool -= dt;
      if (act.pose !== 'route' && dP < 1.5 && a.cool <= 0 && a.spot!.space === this.ctx.space()) { a.pause = 1.6; a.cool = 7; }
      if (a.pause > 0) { a.pause -= dt; a.yaw = turn(a.yaw, Math.atan2(p.x - a.x, p.z - a.z), dt * 6); return; }
      if (this.walk(a, a.speed * dt)) {
        if (a.state === 'out') {
          if (a.board && a.seat) { a.state = 'ride'; a.sitting = true; a.until = this.t + 120; a.x = a.tx; a.z = a.tz; a.yaw = a.tyaw; a.y = this.groundY(a); }
          else this.off(a, false);
          return;
        }
        if (a.q >= 0) { a.state = 'wait'; return; }                  // reached the counter queue
        a.state = 'do';
        if (a.seat && !a.standOn) { a.sitting = true; a.tw = 1; a.twDir = 1; }
      }
      a.y = 0.1 + (a.spot!.space === 'street' ? this.world!.heightAt(a.x, a.z) : 0);
      return;
    }
    if (a.state === 'ride') {
      const s = a.seat ? this.ctx.seats.get(a.seat) : null;
      if (!s || s.occupant !== a.key || this.t > a.until) { this.off(a, true); return; }
      a.x = s.x; a.z = s.z; a.yaw = s.yaw; a.y = sitOriginY(s);
      return;
    }
    // doing the activity (in a shop: then to the counter to pay)
    if (this.t > a.until) { if (!this.checkout(a)) this.leave(a); return; }
    if (a.seat) {
      const s = this.ctx.seats.get(a.seat);
      if (!s || s.occupant !== a.key) { this.off(a, false); return; }
      a.x = s.x; a.z = s.z; a.tyaw = s.yaw;
      a.yaw = a.standOn ? s.yaw : turn(a.yaw, s.yaw, dt * 6);
      a.y = a.standOn ? 0.1 + (a.spot!.space === 'street' ? this.world!.heightAt(a.x, a.z) : 0) : sitOriginY(s);
      return;
    }
    if (act.pose === 'route' && a.route) {
      const r = a.route, len = Math.hypot(r.bx - r.ax, r.bz - r.az) || 1;
      if (a.pause > 0) { a.pause -= dt; return; }
      r.t += r.dir * a.speed * dt / len;
      if (r.t >= 1 || r.t <= 0) { r.t = Math.min(1, Math.max(0, r.t)); r.dir = r.dir > 0 ? -1 : 1; a.pause = 0.6 + this.rand(); }
      const pt = this.routePoint(a); a.x = pt.x; a.z = pt.z; a.yaw = turn(a.yaw, pt.yaw, dt * 5);
      a.y = 0.1 + this.world!.heightAt(a.x, a.z);
      return;
    }
    if (act.pose === 'roam') {
      if (a.pause > 0) { a.pause -= dt; return; }
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d < 0.4) {
        const [x0, z0, x1, z1] = a.spot!.area!;
        a.tx = x0 + this.rand() * (x1 - x0); a.tz = z0 + this.rand() * (z1 - z0); a.pause = this.rand() < 0.4 ? 0.5 + this.rand() * 2 : 0;
        return;
      }
      const s = Math.min(d, a.speed * dt); a.x += dx / d * s; a.z += dz / d * s; a.yaw = turn(a.yaw, Math.atan2(dx, dz), dt * 6);
      return;
    }
    // standing: talk to the player when they come close (not in a prayer row), else keep to the place's direction;
    // vendors and talkers change gesture every few seconds
    a.x = a.tx; a.z = a.tz;
    if (act.pose === 'stand' && act.clips.length > 1 && (a.clipT -= dt) <= 0) { a.clipT = 4 + this.rand() * 6; a.clip = act.clips[Math.floor(this.rand() * act.clips.length)]; }
    const dP = Math.hypot(p.x - a.x, p.z - a.z);
    const facePlayer = act.pose === 'stand' && dP < 2.8 && a.spot!.space === this.ctx.space();
    a.yaw = turn(a.yaw, facePlayer ? Math.atan2(p.x - a.x, p.z - a.z) : a.tyaw, dt * 4);
  }

  /** Moves along the path; true when the path is done. */
  private walk(a: Actor, dist: number): boolean {
    while (dist > 0) {
      const b = a.path[a.seg + 1];
      if (!b) return true;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0.01) a.yaw = turn(a.yaw, Math.atan2(dx, dz), 0.35);
      if (d <= dist) { a.x = b.x; a.z = b.z; a.seg++; dist -= d; if (a.seg >= a.path.length - 1) return true; }
      else { a.x += dx / d * dist; a.z += dz / d * dist; dist = 0; }
    }
    return false;
  }

  /** Point of a route at its progress, in a reused object (called every frame for joggers). */
  private routePoint(a: Actor) {
    const r = a.route!, dx = r.bx - r.ax, dz = r.bz - r.az, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, o = this.rp;
    o.x = r.ax + dx * r.t + nx * r.lat; o.z = r.az + dz * r.t + nz * r.lat; o.yaw = Math.atan2(dx * r.dir, dz * r.dir);
    return o;
  }
  private rp = { x: 0, z: 0, yaw: 0 };

  // ------------------------------------------------------------------ bodies and figures
  private prioOf(g: THREE.Object3D) {
    for (let p: THREE.Object3D | null = g.parent; p; p = p.parent) if (p.name === 'npc_life') return 0.55;   // the recurring cast first
    return 1;
  }

  /** Ranks every street humanoid (ambient people and the other systems') by distance: the nearest get full bodies. */
  private lod(space: string) {
    const cam = this.ctx.camera.position, B = this.B, cand = this.cand;
    let n = 0;
    const slot = () => { if (n >= cand.length) cand.push({ d: 0, a: null, f: null, full: false }); return cand[n++]; };
    for (const a of this.actors) {
      if (a.state === 'off' || !this.inView(a, space)) { if (a.body) this.dropBody(a); a.lod = 0; continue; }
      a.d = Math.hypot(a.x - cam.x, a.z - cam.z);
      const c = slot(); c.a = a; c.f = null; c.full = a.lod === 2; c.d = a.d * (c.full ? 0.85 : 1);
    }
    let foreignN = 0;
    for (const f of this.foreign.list) {
      if (!ownerVisible(f.g)) { f.lod = 0; continue; }
      foreignN++;
      const e = f.g.matrixWorld.elements;
      f.d = Math.hypot(e[12] - cam.x, e[14] - cam.z);
      const c = slot(); c.a = null; c.f = f; c.full = f.lod === 2; c.d = f.d * f.prio * (c.full ? 0.85 : 1);
    }
    const view = this.view; view.length = 0;
    for (let i = 0; i < n; i++) view.push(cand[i]);
    view.sort(byD);
    let full = 0, mine = 0;
    for (const c of view) {
      const d = c.a ? c.a.d : c.f!.d * c.f!.prio;
      let lod: 0 | 1 | 2 = d < B.far ? 1 : 0;
      if (d < B.full && full < B.totalFull && (c.f || mine < B.bodies)) { lod = 2; full++; if (c.a) mine++; }
      if (c.a) c.a.lod = lod; else c.f!.lod = lod;
    }
    for (const c of view) if (c.a && c.a.lod < 2 && c.a.body) this.dropBody(c.a);
    for (const c of view) {
      if (c.f) { c.f.root.visible = c.f.lod === 2; continue; }
      const a = c.a!;
      if (a.lod === 2 && !a.body && !this.takeBody(a)) a.lod = 1;
    }
    this.stats = { full, mineFull: mine, foreignFull: full - mine, figures: 0, foreign: foreignN };
    // people the player can greet: those with a body
    const list = this.bodyList; list.length = 0;
    for (const a of this.actors) if (a.body && !a.spot!.tags.some(t => t.startsWith('mosque'))) {   // at the mosque: presence only, no exchange
      const r = a.rec; r.obj = a.body.group; r.h = a.body; r.seated = a.sitting; r.space = a.state === 'ride' ? 'street' : a.spot!.space; r.female = !!a.look.female;
      list.push(r);
    }
    this.placePlates(space);
  }

  private takeBody(a: Actor): boolean {
    let h = this.freeBodies.pop() ?? null;
    if (!h && this.pool.length < this.B.bodies) {
      h = new Humanoid(a.look); cullHumanoid(h.group); h.group.name = 'humanoid_v2';
      this.pool.push(h); this.group.add(h.group); this.bodyLook.set(h, a.look);
    }
    if (!h) return false;
    if (this.bodyLook.get(h) !== a.look) { h.setLook(a.look); this.bodyLook.set(h, a.look); }
    h.group.visible = true; h.group.userData.noLod = true;
    h.hold = null; h.clipName = null;
    h.play(this.clipOf(a), 0, this.rand());
    a.body = h; a.acc = 0;
    return true;
  }

  private dropBody(a: Actor) {
    const h = a.body; if (!h) return;
    h.group.visible = false; h.hold = null;
    this.freeBodies.push(h); a.body = null;
  }

  private clipOf(a: Actor): Clip {
    if (a.tw > 0 || a.sitting || a.state === 'ride') return a.sitClip;
    if (a.state === 'in' || a.state === 'out') return a.pause > 0 ? 'Talk' : 'Walk';
    if (a.state === 'wait') return a.cq && a.q > 0 ? 'Idle' : a.waitT % 5 < 3 ? 'Talk' : 'Idle';
    const act = a.act!;
    if (act.pose === 'route') return a.pause > 0 ? 'Idle' : a.speed > 2 ? 'Run' : 'Walk';
    if (act.pose === 'roam') return a.pause > 0 ? 'Idle' : 'Run';
    const p = this.ctx.player.pos;
    if (act.pose === 'stand' && Math.hypot(p.x - a.x, p.z - a.z) < 2.8 && a.spot!.space === this.ctx.space()) return 'Talk';
    return a.clip;
  }

  private draw(dt: number) {
    const imp = this.impostors!;
    imp.begin();
    for (const a of this.actors) {
      if (a.state === 'off' || a.lod === 0) continue;
      if (a.lod === 1 || !a.body) { imp.add(a.x, a.y, a.z, a.yaw, a.look.female ? 0.96 : 1, a.color, a.sitting || a.state === 'ride'); continue; }
      const h = a.body, clip = this.clipOf(a), moving = clip === 'Walk' || clip === 'Run';
      h.group.position.set(a.x, a.y, a.z); h.group.rotation.y = a.yaw;
      h.hold = moving ? null : clip;
      a.acc += dt;
      // distance-based animation rate: every frame up close, every other frame farther away
      if (a.d < 16 || (this.frameNo + a.n) % 2 === 0) { h.animate(a.acc, moving ? (clip === 'Run' ? Math.max(3.2, a.speed) : a.speed) : 0); a.acc = 0; }
    }
    for (const f of this.foreign.list) if (f.lod === 1 && ownerVisible(f.g)) imp.addMatrix(f.g.matrixWorld, f.color, this.foreign.seated(f));
    imp.end();
    this.stats.figures = imp.count;
  }

  /** Fewer walkers and cars late at night, the full street at rush hours (actors/npc.ts groups). */
  private thin(hour: number) {
    for (const g of this.ctx.extra.children) {
      const f = g.name === 'crowd_walkers' ? curveAt(WALKERS_BY_HOUR, hour) : g.name === 'traffic' ? curveAt(TRAFFIC_BY_HOUR, hour) : -1;
      if (f < 0) continue;
      const keep = Math.max(1, Math.round(g.children.length * f));
      g.children.forEach((c, i) => { c.visible = i < keep; });
    }
  }

  private placePlates(space: string) {
    const m = this.plates!, mat = this.plateM; let n = 0;
    for (const a of this.actors) {
      if (n >= 48 || a.state !== 'do' || !a.sitting || a.act?.prop !== 'plate' || !a.seat || a.lod === 0 || a.spot!.space !== space) continue;
      const pr = a.spot!.seatProps?.[a.seat]; if (!pr) continue;
      m.setMatrixAt(n++, mat.makeTranslation(pr.x, pr.y, pr.z));
    }
    m.count = n; m.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ quality and looks
  private setQuality(q: AmbientQuality) {
    if (this.impostors && this.q === q) return;
    this.q = q; this.B = AMBIENT_BUDGET[q];
    const shadows = q !== 'low';
    if (!this.impostors) { this.impostors = new Impostors(220, shadows); this.group.add(this.impostors.group); }
    else this.impostors.setShadows(shadows);
    while (this.pool.length > this.B.bodies) {
      const h = this.pool.pop()!; this.freeBodies = this.freeBodies.filter(x => x !== h); this.bodyLook.delete(h); h.dispose();
    }
    for (const a of this.actors) if (a.body && !this.pool.includes(a.body)) a.body = null;
    while (this.actors.length > this.B.population) { const a = this.actors.pop()!; this.off(a); }
  }

  private lookFor(kind: LookKind | undefined): PersonLook {
    const r = this.rand, pick = <T,>(l: readonly T[]) => l[Math.floor(r() * l.length)];
    const base = randomLook(r);
    switch (kind) {
      case 'sport': { const f = r() < 0.3; return { skin: base.skin, female: f, style: 'tee', top: pick(SPORT), bottom: r() < 0.5 ? 0x1c1c1f : 0x2b2f3a, shoes: 0xf2f2ec, hat: null, pattern: 'uni', hair: f ? 'puff' : 'short', muscular: f ? 0 : r() * 0.7 }; }
      case 'fisher': return { skin: base.skin, style: 'tee', top: pick([0x236da0, 0xe2b234, 0xcf5936, 0x2f8f4e, 0xf2f2ec]), bottom: 0x31404d, hat: r() < 0.5 ? 'kufi' : null, hatColor: pick([0xf4c443, 0xf2f2ec, 0x1c1c1f]), shoes: 0x242b27, muscular: 0.3 + r() * 0.5 };
      case 'vendor': return r() < 0.7 ? { skin: base.skin, female: true, style: 'dress', top: pick([0xd66532, 0x387f77, 0x79529a, 0xe58a2f, 0xc2417f]), pattern: 'wax', accent: 0xeee1b0, hat: 'headwrap', hatColor: pick([0xe8b734, 0xd9322b, 0x1f7a44]), shoes: 0x6b4a2e, heavy: r() * 0.7 }
        : { skin: base.skin, style: 'boubou', top: pick(BOUBOU), pattern: 'uni', hat: 'kufi', hatColor: 0xf2f2ec, shoes: 0x3a2a1e };
      case 'prayer': return { skin: base.skin, style: 'boubou', top: pick(BOUBOU), pattern: r() < 0.4 ? 'bazin' : 'uni', hat: r() < 0.85 ? 'kufi' : null, hatColor: r() < 0.7 ? 0xf2f2ec : 0x1c1c1f, shoes: 0x3a2a1e, beard: r() < 0.35 ? pick([0xd8d4cc, 0x8a8580, 0x1a1414]) : null, heavy: r() < 0.25 ? 0.5 : 0 };
      case 'elder': return { skin: base.skin, style: 'boubou', top: pick(BOUBOU), pattern: 'bazin', hat: 'kufi', hatColor: 0xf2f2ec, beard: 0xd8d4cc, heavy: 0.4 };
      case 'student': return { skin: base.skin, style: 'tee', top: pick(SPORT), bottom: 0x3d4a5c, female: r() < 0.5, hair: r() < 0.5 ? 'puff' : 'short' };
      default: return base;
    }
  }

  // ------------------------------------------------------------------ debug (window.__dakar, ?debug)
  debug(): Record<string, unknown> {
    return {
      /** Who is doing what where, the seat invariants and the humanoid budget. */
      ambient: () => this.summary(),
      ambientSpots: () => (this.spots ?? []).map(s => ({ id: s.id, tags: s.tags, space: s.space, x: +s.x.toFixed(1), z: +s.z.toFixed(1), seats: s.seats.length, stands: s.stands.length, rows: s.rows?.length ?? 0, route: !!s.route, source: s.source, place: s.place })),
      ambientActors: () => this.actors.filter(a => a.state !== 'off').map(a => ({ id: a.rec.id, spot: a.spot!.id, act: a.act!.id, state: a.state, x: +a.x.toFixed(2), z: +a.z.toFixed(2), y: +a.y.toFixed(3), yaw: +a.yaw.toFixed(2), seat: a.seat, sitting: a.sitting, lod: a.lod, clip: a.body?.clipName ?? null, space: a.spot!.space })),
      /** Day of the week override (0 = lundi … 6 = dimanche), null = the city calendar. */
      ambientDay: (d: number | null) => { this.dayOverride = d; this.snapNext = true; },
      /** Everyone walking reaches their place now; people leaving are gone (captures). */
      ambientSettle: () => {
        for (const a of this.actors) {
          a.tw = 0;
          if (a.state === 'in' || a.state === 'wait') { a.path.length = 0; this.settle(a); }
          else if (a.state === 'out' && a.board && a.seat) { a.state = 'ride'; a.sitting = true; a.until = this.t + 120; const s = this.ctx.seats.get(a.seat); if (s) { a.x = s.x; a.z = s.z; a.yaw = s.yaw; a.y = sitOriginY(s); } }
          else if (a.state === 'out') this.off(a, false);
        }
      },
      /** The people of the spots whose id contains `frag` end their activity now (boarding, leaving: checks). */
      ambientLeave: (frag: string) => { let n = 0; for (const a of this.actors) if (a.state === 'do' && a.spot!.id.includes(frag)) { this.leave(a); n++; } return n; },
      /** Registers a place (and its seats) as another lane would: the city populates it. */
      ambientAddPlace: (spec: Parameters<GameCtx['places']['add']>[0], seats: Seat[] = []) => { for (const s of seats) this.ctx.seats.add({ ...s }); this.ctx.places.add(spec); this.sigT = 0; },
      ambientRebuild: () => { this.build(); this.snapNext = true; },
      /** Runs the city's people for `seconds` of game time now (0.1 s steps): checks that cannot wait in real time. */
      ambientRun: (seconds: number) => { for (let t = 0; t < seconds; t += 0.1) this.update(this.ctx, 0.1); return this.summary().live; },
      /** Stocked shops (spec §31): people inside now by state, and how many entered, queued and paid since the hub load. */
      ambientShops: () => (this.spots ?? []).filter(s => s.shop).map(s => {
        const here = this.actors.filter(a => a.state !== 'off' && a.spot === s), by: Record<string, number> = {};
        for (const a of here) { const k = a.state === 'wait' && a.cq ? (a.q === 0 ? 'pay' : 'line') : a.state; by[k] = (by[k] ?? 0) + 1; }
        return { id: s.id, tags: s.tags, stands: s.stands.length, checkout: s.shop!.checkout.length, seats: s.seats.length, now: by, ...(this.shopTally.get(s.id) ?? { entered: 0, queued: 0, paid: 0 }) };
      }),
      /** Full animated NPC humanoids drawn now (ambient + other systems), far figures, and the budget. */
      humanoids: () => this.humanoidCount(),
    };
  }

  private summary() {
    const ctx = this.ctx, live = this.actors.filter(a => a.state !== 'off');
    const bySpot: Record<string, { tags: readonly string[]; n: number; seated: number; acts: Record<string, number> }> = {};
    for (const a of live) {
      const s = (bySpot[a.spot!.id] ??= { tags: a.spot!.tags, n: 0, seated: 0, acts: {} });
      s.n++; if (a.sitting) s.seated++; s.acts[a.act!.id] = (s.acts[a.act!.id] ?? 0) + 1;
    }
    const byTag: Record<string, number> = {}, byAct: Record<string, number> = {};
    for (const a of live) { byAct[a.act!.id] = (byAct[a.act!.id] ?? 0) + 1; for (const t of a.spot!.tags) byTag[t] = (byTag[t] ?? 0) + 1; }
    // invariants: an ambient seat is held by the person sitting there; no spot holds more seats than its capacity
    const problems: string[] = [];
    for (const s of ctx.seats.all()) {
      if (!s.occupant?.startsWith('npc:amb:')) continue;
      const a = this.actors.find(x => x.key === s.occupant);
      if (!a || a.seat !== s.id || a.state === 'off') problems.push(`orphan ${s.id}`);
    }
    // ambient people never hold more than a place's share (they count everyone already seated when they sit down;
    // other systems — a venue, the transport's waiting passengers — may fill the rest after them)
    for (const sp of this.spots ?? []) {
      const list = sp.seats.map(id => ctx.seats.get(id)).filter((s): s is Seat => !!s && !STAND_ON.includes(s.kind) && s.kind !== 'vehicle');
      if (list.length < 2) continue;
      const amb = list.filter(s => s.occupant?.startsWith('npc:amb:')).length;
      if (amb > seatCapacity(list.length)) problems.push(`full ${sp.id} ${amb}/${list.length}`);
    }
    return { quality: this.q, hour: +ctx.hour().toFixed(2), dow: this.dow(), live: live.length, cap: this.B.population, byTag, byAct, bySpot, problems, ...this.humanoidCount() };
  }

  private humanoidCount() {
    let mine = 0, foreign = 0;
    for (const a of this.actors) if (a.body && a.body.group.visible && this.group.visible) mine++;
    for (const f of this.foreign.list) if (f.root.visible && ownerVisible(f.g)) foreign++;
    return { full: mine + foreign, fullAmbient: mine, fullOther: foreign, figures: this.stats.figures, budget: this.B.totalFull, bodies: this.pool.length, others: this.foreign.list.length };
  }
}

interface Cand { d: number; a: Actor | null; f: Foreign | null; full: boolean }
const byD = (u: Cand, v: Cand) => u.d - v.d;

/** Shortest turn from a toward b by at most `k` radians. */
function turn(a: number, b: number, k: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + Math.max(-k, Math.min(k, d));
}

export const ambientLife = new AmbientLife();
