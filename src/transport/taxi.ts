import * as THREE from 'three';
import type { HubId } from '../core/types';
import { HUB_IDS } from '../core/types';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Affordance, Target, TargetSource } from '../interact/types';
import type { ActivitySpec } from '../activity/types';
import { buildVehicle, vehicleSpec, type VehicleSeat } from '../actors/vehicleKit';
import { HUB_NAMES } from '../world/content';
import { fcfa } from '../ui/hud';
import { Vehicle } from './vehicle';
import { PassengerCamera } from './camera';
import { RideCard } from './ui';
import { Path, openLanePath, pullIn, type Pose } from './route';
import { clearKerb } from './passengers';
import { footprint } from './ownedModule';
import { entrySide, exitSide, kerbSpot, routeIn, routeOut, taxiFare, type Spot } from './taxiRules';
import type { SeatSpec, VehicleSpec } from './spec';

/**
 * Taxis between neighbourhoods — a trip to another hub shown as a ride, not a menu and a fade. Each hub has a taxi rank
 * at a kerb (Pikine: across the road from the arena's west side, for the fight evenings; Almadies: at Ngor, by La Vague; elsewhere near where
 * people arrive). « Prendre un taxi » lists the other neighbourhoods with the fare (shown before paying, paid once to the
 * driver); the player sits in front, the taxi pulls out and drives through the streets to the edge of the neighbourhood,
 * a short fade, then it comes into the other one from the side that faces where it came from and stops at that hub's
 * rank, where the player gets out on the pavement. The passenger camera has the views of the car rapide.
 *
 * A trip paid is a trip owed: it is recorded in the save (`taxi:to`, `taxi:fare`) until the player is out, so a reload
 * or a lost connection mid-ride finishes it at the destination's rank — never charged twice, never left in a car.
 */
const RANK_REF: Partial<Record<HubId, { x: number; z: number; name: string }>> = {
  pikine: { x: -6, z: -45, name: 'Arène de Pikine' },
  almadies: { x: -36, z: -138, name: 'La Vague · Ngor' },
};
/** Where a taxi stops to let a passenger out: this far past the waiting taxi of the rank (m); it pulls in after passing it. */
const DROP_AHEAD = 12, PULL_BEFORE = 8;
const CRUISE = 11, ACCEL = 2.2, DECEL = 2.6, LATERAL = 2.4;
const COUNTER_TO = 'taxi:to', COUNTER_FARE = 'taxi:fare';

let cached: VehicleSpec | null = null;
const SEED = 4;
/** The kit taxi (yellow, black roof, driver at the wheel); the passenger sits in front, lower than the kit's bust. */
export function taxiSpec(): VehicleSpec {
  if (cached) return cached;
  const k = vehicleSpec('taxi', { seed: SEED, driver: true, passengers: false });
  const toSeat = (s: VehicleSeat, drop = 0): SeatSpec => ({ id: s.id, x: s.x, y: s.top - drop, z: s.z, yaw: s.yaw, npcOnly: s.id !== 'front' });
  const driver = k.seats.find(s => s.kind === 'driver') ?? k.seats[0];
  const front = k.seats.find(s => s.id === 'front') ?? k.seats[1];
  const chase = k.cameras.chase, eye = front.top + 0.76;
  const v3 = (p: readonly number[]): [number, number, number] => [p[0], p[1], p[2]];
  const spec: VehicleSpec = {
    id: 'taxi', name: 'Taxi', kind: 'taxi', length: k.length, width: k.width,
    seats: k.seats.filter(s => s.kind !== 'driver').map(s => toSeat(s, s.id === 'front' ? 0.12 : 0)),
    driver: toSeat(driver),
    doors: k.doors.map(d => ({ id: d.id, x: d.board[0], z: d.board[2], outX: d.board[0] + Math.sign(d.board[0]) * 0.4, outZ: d.board[2] })),
    cameras: [
      { id: 'chase', label: 'Derrière le taxi', pos: v3(chase.pos), look: v3(chase.look), portrait: { pos: [chase.pos[0], chase.pos[1] + 2.2, chase.pos[2] - 3.4], look: [chase.look[0], chase.look[1] - 0.1, chase.look[2] + 4] } },
      // from the front seat, through the windscreen and the right-hand window (the pavement side)
      { id: 'place', label: 'De ta place', pos: [front.x, eye, front.z - 0.05], look: [front.x - 1.6, eye - 0.12, front.z + 12], inside: true,
        portrait: { pos: [front.x, eye + 0.02, front.z - 0.15], look: [front.x - 2.2, eye - 0.2, front.z + 11] } },
      { id: 'haut', label: 'Vue d’en haut', pos: [0, 11, -12], look: [0, 0, 7], portrait: { pos: [0, 16, -14], look: [0, 0, 8] } },
    ],
    cabin: 'closed', sway: 0.7,
    build: o => buildVehicle('taxi', { seed: o?.seed ?? SEED, driver: true, passengers: false }).group,
  };
  return (cached = spec);
}

/** The taxi rank of a hub: its kerb spot and name (the road events keep off the taxis' roads: src/city/roadEvents.ts). */
export function taxiRank(hub: Pick<HubWorld, 'id' | 'spawn'>): { spot: Spot; name: string } {
  const ref = RANK_REF[hub.id];
  if (ref) return { spot: kerbSpot(ref.x, ref.z), name: ref.name };
  return { spot: kerbSpot(hub.spawn.x + 4, hub.spawn.z + 4), name: HUB_NAMES[hub.id] };
}
/** Where an arriving taxi lets its passenger out: past the waiting taxi of the rank. */
export function taxiDrop(rank: Spot): Spot { return { x: rank.x + Math.sin(rank.yaw) * DROP_AHEAD, z: rank.z + Math.cos(rank.yaw) * DROP_AHEAD, yaw: rank.yaw }; }

interface Rank { spot: Spot; name: string; taxi: Vehicle | null; solid: ReturnType<typeof footprint>; sign: THREE.Group }
type Phase = 'depart' | 'transfer' | 'arrive' | 'leave';
interface Ride { phase: Phase; from: HubId; dest: HubId; destName: string; v: Vehicle; path: Path; end: number; drop: number; s: number; speed: number; dwell: number; pose: Pose }

export class TaxiModule implements GameModule {
  readonly name = 'taxi';
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private rank: Rank | null = null;
  private ride: Ride | null = null;
  private cam = new PassengerCamera();
  private card: RideCard | null = null;
  private camMs = 0;
  private lastMs = 0;
  private cardT = 0;
  /** A trip found in the save at load (reload mid-ride): finish it on the next frame. */
  private resume: HubId | null = null;
  private pendingPay: { dest: HubId; fare: number } | null = null;
  /** Fares taken (debug: the checks verify a trip is paid once). */
  private paid = 0;
  private leaving: Vehicle | null = null;

  init(ctx: GameCtx) {
    this.ctx = ctx;
    const ui = document.getElementById('ui');
    if (ui) this.card = new RideCard(ui, 'taxi-card');
    ctx.interactions.add(this.targets);
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.clearHub();
    this.hub = hub;
    this.buildRank(ctx, hub);
    const r = this.ride;
    if (r && r.phase === 'transfer' && r.dest === hub.id) { this.arriveIn(hub, r); return; }
    if (r) { this.endRide(false); }                                        // a hub change that was not this ride's
    const owed = this.owed();
    if (owed) this.resume = owed;
  }

  spaceChanged() { /* the rank stays */ }
  space(): string | null { return this.ride && this.ride.phase !== 'leave' && this.ride.phase !== 'transfer' ? this.ride.v.id : null; }
  presenceSpace(): string | null { return this.space() ? 'street' : null; }

  /** Saved during a ride: the pavement of this hub's rank (the trip itself is in the save and finishes on reload). */
  safePlace(): { x: number; z: number; yaw: number } | null {
    if (!this.ride || this.ride.phase === 'leave' || !this.rank) return null;
    return this.pavement(this.rank.spot, 0);
  }

  update(ctx: GameCtx, dt: number) {
    if (this.resume) { const to = this.resume; this.resume = null; this.finishOwed(to); return; }
    if (this.pendingPay) { const p = this.pendingPay; this.pendingPay = null; this.depart(p.dest); }
    const now = performance.now(), real = this.lastMs ? Math.min(1, (now - this.lastMs) / 1000) : dt; this.lastMs = now;
    const step = Math.max(dt, real);
    if (this.leaving) this.driveOff(step);
    const r = this.ride; if (!r) return;
    if (r.phase !== 'leave' && r.phase !== 'transfer' && ctx.player.seated()?.id !== this.seatOf(r).id) { this.endRide(false); return; }
    this.advance(r, step);
    if (r.phase === 'depart' && r.s >= r.end - 6) {
      r.phase = 'transfer';
      ctx.travel(r.dest, this.dropPavement(r.dest), `🚕 ${r.destName}`);
      return;
    }
    if (r.phase === 'arrive' && r.s >= r.drop - 0.3 && r.speed < 0.05) {
      r.dwell += step;
      if (r.dwell > 0.8) this.getOut(r);
    }
    this.cardT -= dt;
    if (this.cardT <= 0) { this.cardT = 0.25; this.refreshCard(); }
  }

  camera(ctx: GameCtx, dt: number, drag: { yaw: number; pitch: number }): boolean {
    const r = this.ride; if (!r || r.phase === 'leave' || r.phase === 'transfer' || !this.cam.active) return false;
    const t = performance.now(), real = this.camMs ? Math.min(1, (t - this.camMs) / 1000) : dt; this.camMs = t;
    const a = r.v.spec.cameras[this.cam.view % r.v.spec.cameras.length];
    this.cam.update(Math.max(dt, real), ctx.camera, r.v.pose, r.v.bounce, a, drag, this.hub?.colliders ?? []);
    const body = ctx.player.body();
    if (body && a.inside) body.group.visible = false;
    return true;
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    this.ctx = ctx;
    return {
      taxi: {
        info: () => {
          const r = this.ride;
          return { rank: this.rank ? { ...this.rank.spot, name: this.rank.name, taxi: !!this.rank.taxi } : null, paid: this.paid, owed: this.owed(),
            ride: r ? { phase: r.phase, from: r.from, dest: r.dest, s: Math.round(r.s * 10) / 10, end: Math.round(r.end), drop: Math.round(r.drop), speed: Math.round(r.speed * 10) / 10, x: r.v.pose.x, z: r.v.pose.z, yaw: r.v.pose.yaw, view: r.v.spec.cameras[this.cam.view % r.v.spec.cameras.length].id } : null,
            space: this.space(), camera: this.cam.active };
        },
        card: () => this.card?.text ?? '',
        /** The fares from here (what the menu shows). */
        fares: () => this.hub ? HUB_IDS.filter(h => h !== this.hub!.id).map(h => ({ hub: h, name: this.destName(h), fare: taxiFare(this.hub!.id, h) })) : [],
      },
    };
  }

  // ---------------------------------------------------------------- the rank
  private rankSpot(hub: HubWorld): { spot: Spot; name: string } { return taxiRank(hub); }
  private destName(h: HubId) { return RANK_REF[h]?.name ?? HUB_NAMES[h]; }

  private buildRank(ctx: GameCtx, hub: HubWorld) {
    const { spot, name } = this.rankSpot(hub);
    const f = { x: Math.sin(spot.yaw), z: Math.cos(spot.yaw) }, rx = -Math.cos(spot.yaw), rz = Math.sin(spot.yaw);
    // no parked cars where the taxis wait and where they let people out
    clearKerb(ctx.extra, hub.colliders, [{ x: spot.x, z: spot.z, dx: f.x, dz: f.z, rx, rz, offset: 4.3, from: -8, to: DROP_AHEAD + 8 }]);
    const sign = new THREE.Group(); sign.name = 'taxi:rank';
    const tex = signTexture();
    const px = spot.x + rx * 2.4 + f.x * 3, pz = spot.z + rz * 2.4 + f.z * 3;              // on the pavement, ahead of the taxi
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 0.08), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
    pole.position.set(px, 1.57, pz); sign.add(pole);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.05), new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : 0xf5c400 }));
    plate.position.set(px, 2.85, pz); plate.rotation.y = spot.yaw + Math.PI / 2; sign.add(plate);
    ctx.extra.add(sign);
    this.rank = { spot, name, taxi: null, solid: [], sign };
    this.parkTaxi();
  }

  /** A taxi waits at the rank (driver at the wheel), solid like any parked car. */
  private parkTaxi() {
    const rk = this.rank, hub = this.hub; if (!rk || !hub || rk.taxi) return;
    const v = new Vehicle(taxiSpec(), `${hub.id}:taxi:rank`, 1, SEED);
    v.group.name = 'taxi:waiting';
    v.place(rk.spot.x, rk.spot.z, rk.spot.yaw, 0, 0, 0, 0);
    this.ctx.extra.add(v.group);
    rk.taxi = v;
    rk.solid = footprint({ maxSpeed: 0, reverseSpeed: 0, accel: 0, brake: 0, turnRadius: 1, steer: 1, halfWidth: v.spec.width / 2, halfLength: v.spec.length / 2 }, rk.spot.x, rk.spot.z, rk.spot.yaw, 1.45);
    hub.colliders.push(...rk.solid);
  }
  private unparkTaxi(): Vehicle | null {
    const rk = this.rank, hub = this.hub; if (!rk || !rk.taxi) return null;
    const v = rk.taxi; rk.taxi = null;
    if (hub) for (const c of rk.solid) { const i = hub.colliders.indexOf(c); if (i >= 0) hub.colliders.splice(i, 1); }
    rk.solid = [];
    return v;
  }

  private openRank() {
    const ctx = this.ctx, hub = this.hub; if (!hub) return;
    const here = hub.id;
    ctx.menu('Taxi', 'Le chauffeur annonce le prix avant de partir. Tu paies une fois, en montant.', [
      ...HUB_IDS.filter(h => h !== here).map(h => {
        const fare = taxiFare(here, h), can = ctx.state.canAfford(fare);
        return { icon: '🚕', label: this.destName(h), detail: can ? `${HUB_NAMES[h]} · par la route` : 'Pas assez d’argent', right: fcfa(fare), disabled: !can, onPick: () => this.confirm(h) };
      }),
      { icon: '↩️', label: 'Pas maintenant', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }

  private confirm(dest: HubId) {
    const ctx = this.ctx, here = this.hub!.id, fare = taxiFare(here, dest);
    ctx.menu(`Taxi → ${this.destName(dest)}`, `Prix : ${fcfa(fare)} · Ton argent : ${fcfa(ctx.state.wallet)}`, [
      { icon: '✅', label: 'Monter', right: '−' + fcfa(fare), detail: ctx.state.canAfford(fare) ? 'Tu t’assois devant, à côté du chauffeur' : 'Pas assez d’argent', disabled: !ctx.state.canAfford(fare), onPick: () => this.pay(dest) },
      { icon: '↩️', label: 'Pas maintenant', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }

  /** The fare, once, through the universal runner (verb ride); the ride starts on the next frame. */
  private pay(dest: HubId) {
    const ctx = this.ctx, here = this.hub!.id, fare = taxiFare(here, dest);
    ctx.hud.closeModal(); ctx.setMode('play');
    if (this.ride || this.owed() || !this.rank?.taxi) return;
    const spec: ActivitySpec = {
      id: 'taxi', primitive: 'ride', label: `Taxi → ${this.destName(dest)}`, icon: '🚕', quiet: true,
      requires: () => ctx.state.canAfford(fare) ? null : 'Pas assez d’argent pour le taxi',
      steps: [{ label: 'Tu paies le chauffeur', primitive: 'ride',
        effects: { money: -fare, label: `Taxi → ${this.destName(dest)}`, counters: { taxi: 1 }, category: 'transport' },
        then: () => {
          this.paid++;
          const c = ctx.state.data.counters; c[COUNTER_TO] = HUB_IDS.indexOf(dest) + 1; c[COUNTER_FARE] = fare;   // a trip owed until the player is out
          this.pendingPay = { dest, fare };
          ctx.save();                                                        // the fare and the trip owed, saved together
        } }],
    };
    ctx.activities.start(spec, { place: this.rank.name });
  }

  // ---------------------------------------------------------------- the ride
  private seatOf(r: Ride) { return r.v.seats[r.v.spec.seats.findIndex(s => !s.npcOnly)]; }

  /** From the rank to the edge of the neighbourhood that faces the destination. */
  private depart(dest: HubId) {
    const ctx = this.ctx, hub = this.hub, rk = this.rank; if (!hub || !rk) return;
    const v = this.unparkTaxi() ?? new Vehicle(taxiSpec(), `${hub.id}:taxi:rank`, 1, SEED);
    if (!v.group.parent) ctx.extra.add(v.group);
    const nodes = routeOut(rk.spot, exitSide(hub.id, dest));
    const lane = openLanePath(nodes, 2.0, 9);
    const f = { x: Math.sin(rk.spot.yaw), z: Math.cos(rk.spot.yaw) };
    // pull out from the kerb: start where the taxi stands, rejoin the lane a few metres on
    lane[0] = { x: rk.spot.x, z: rk.spot.z };
    // (the driving lane is 2.3 m to the left of the kerb lane, toward the centre line)
    const first = lane[1], lx = Math.cos(rk.spot.yaw), lz = -Math.sin(rk.spot.yaw);
    if (Math.hypot(first.x - rk.spot.x, first.z - rk.spot.z) > 16) lane.splice(1, 0, { x: rk.spot.x + f.x * 9 + lx * 2.3, z: rk.spot.z + f.z * 9 + lz * 2.3 });
    const path = new Path(lane);
    const r: Ride = { phase: 'depart', from: hub.id, dest, destName: this.destName(dest), v, path, end: path.at(lane.length - 1), drop: Infinity, s: 0, speed: 0, dwell: 0, pose: { x: 0, z: 0, yaw: 0 } };
    this.ride = r;
    this.seatPlayer(r);
    ctx.toast(`🚕 En route pour ${r.destName}`);
    setTimeout(() => { if (this.hub === hub) this.parkTaxi(); }, 15000);      // the next taxi pulls in at the rank
  }

  /** Into the destination from the side that faces where the taxi came from, to the rank's kerb. */
  private arriveIn(hub: HubWorld, r: Ride) {
    const rk = this.rank!, f = { x: Math.sin(rk.spot.yaw), z: Math.cos(rk.spot.yaw) };
    const drop: Spot = { x: rk.spot.x + f.x * DROP_AHEAD, z: rk.spot.z + f.z * DROP_AHEAD, yaw: rk.spot.yaw };
    const nodes = routeIn(drop, entrySide(r.from, hub.id));
    const lane = openLanePath(nodes, 2.0, 9);
    const path = new Path(lane);
    const v = new Vehicle(taxiSpec(), `${hub.id}:taxi:ride`, 1, SEED);
    this.ctx.extra.add(v.group);
    r.v = v; r.path = path; r.end = path.at(lane.length - 1); r.s = 0; r.speed = CRUISE * 0.8; r.dwell = 0;
    r.drop = path.project(drop.x - (-Math.cos(drop.yaw)) * 2.3, drop.z - Math.sin(drop.yaw) * 2.3);
    r.phase = 'arrive';
    this.seatPlayer(r);
    this.cam.begin(this.ctx.camera, v.pose);
  }

  private seatPlayer(r: Ride) {
    const ctx = this.ctx;
    this.place(r, 0);
    ctx.player.standUp(true);
    const seat = this.seatOf(r);
    ctx.seats.add(seat);
    ctx.player.sit(seat);
    if (r.phase === 'depart') { this.cam.begin(ctx.camera, r.v.pose); this.camMs = 0; }
    this.refreshCard();
  }

  /** Speed along the route: cruise, slower in corners, a stop at the drop-off, the pull-in to the kerb there. */
  private advance(r: Ride, dt: number) {
    const limit = r.phase === 'leave' ? CRUISE : r.phase === 'arrive' && r.s < r.drop ? Math.sqrt(Math.max(0, 2 * DECEL * (r.drop - r.s))) : CRUISE;
    const curv = r.path.curvature(r.s + r.speed * 1.2, 4), corner = curv > 1e-3 ? Math.sqrt(LATERAL / curv) : CRUISE;
    let target = Math.min(CRUISE, limit, Math.max(3, corner));
    if (r.phase === 'arrive' && r.s >= r.drop - 0.3) target = 0;
    const before = r.speed;
    r.speed += Math.sign(target - r.speed) * Math.min(Math.abs(target - r.speed), (target > r.speed ? ACCEL : DECEL * 1.6) * dt);
    r.s += r.speed * dt;
    if (r.phase === 'arrive' && r.s > r.drop && r.dwell === 0 && r.speed < 0.5) r.s = r.drop;
    this.place(r, dt, (r.speed - before) / Math.max(dt, 1e-3));
  }

  private place(r: Ride, dt: number, accel = 0) {
    r.path.sample(r.s, r.pose);
    const off = r.phase === 'arrive' || r.phase === 'leave' ? pullIn(r.path, [r.drop], r.s, 2.3, PULL_BEFORE, 12) : 0;
    const rx = -Math.cos(r.pose.yaw), rz = Math.sin(r.pose.yaw);
    r.v.place(r.pose.x + rx * off, r.pose.z + rz * off, r.pose.yaw, r.speed, accel, r.s, dt);
    r.v.animate(r.speed, 0, dt);
  }

  /** Out on the pavement side (the right), the trip done; the taxi drives on. */
  private getOut(r: Ride) {
    const ctx = this.ctx;
    if (ctx.player.seated()?.id === this.seatOf(r).id) ctx.player.standUp(true);
    const p = this.pavement({ x: r.v.pose.x, z: r.v.pose.z, yaw: r.v.pose.yaw }, 0.3);
    ctx.player.place(p.x, p.z, p.yaw);
    this.cam.end();
    this.clearOwed();
    ctx.toast(`Te voilà : ${r.destName}. Jërëjëf !`);
    r.phase = 'leave';
    this.leaving = r.v; this.leavingRide = r;
    this.ride = null;
    this.card?.show(null);
    ctx.save();
  }
  private leavingRide: Ride | null = null;
  private driveOff(dt: number) {
    const r = this.leavingRide, v = this.leaving; if (!r || !v) return;
    r.phase = 'leave';
    r.speed = Math.min(CRUISE, r.speed + ACCEL * dt); r.s += r.speed * dt;
    this.place(r, dt);
    if (r.s > r.drop + 70 || r.s >= r.end - 1) { v.dispose(); this.leaving = null; this.leavingRide = null; }
  }

  /** Off the ride without arriving (a hub change of another kind, a reload): nobody is left in a car. */
  private endRide(normal: boolean) {
    const r = this.ride; if (!r) return;
    const ctx = this.ctx;
    if (ctx.player.seated()?.id === this.seatOf(r).id) ctx.player.standUp(true);
    this.cam.end(); this.card?.show(null);
    if (!normal && this.rank && r.v.group.parent && this.hub) { const p = this.pavement(this.rank.spot, 0); if (!ctx.inside()) ctx.player.place(p.x, p.z, p.yaw); }
    if (r.v !== this.rank?.taxi) r.v.dispose();
    this.ride = null;
  }

  /** A trip in the save (reload mid-ride): straight to the destination's rank, without a second fare. */
  private finishOwed(dest: HubId) {
    const hub = this.hub; if (!hub) return;
    if (hub.id === dest) { const p = this.pavement(this.rank!.spot, DROP_AHEAD); this.ctx.player.standUp(true); this.ctx.player.place(p.x, p.z, p.yaw); this.clearOwed(); this.ctx.toast(`Te voilà : ${this.destName(dest)}`); this.ctx.save(); return; }
    this.ctx.travel(dest, this.dropPavement(dest), `🚕 ${this.destName(dest)}`);
  }
  private owed(): HubId | null { const n = this.ctx?.state.data.counters[COUNTER_TO]; return n ? HUB_IDS[n - 1] ?? null : null; }
  private clearOwed() { const c = this.ctx.state.data.counters; delete c[COUNTER_TO]; delete c[COUNTER_FARE]; }

  /** Pavement beside a kerb spot (`along` metres on), facing the traffic. */
  private pavement(s: Spot, along: number) {
    const f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) }, rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw);
    return { x: s.x + f.x * along + rx * 1.9, z: s.z + f.z * along + rz * 1.9, yaw: s.yaw };
  }
  /** Where the player is put if the arriving ride cannot be shown (the save's place during the fade). */
  private dropPavement(dest: HubId) {
    const ref = RANK_REF[dest];
    if (!ref) return undefined;
    const s = kerbSpot(ref.x, ref.z);
    return this.pavement(s, DROP_AHEAD);
  }

  private refreshCard() {
    const r = this.ride; if (!this.card) return;
    if (!r || r.phase === 'leave') { this.card.show(null); return; }
    const left = r.phase === 'depart' ? null : Math.max(0, Math.round((r.drop - r.s) / Math.max(4, r.speed)));
    this.card.show({ num: '🚕', title: `Taxi → ${r.destName}`, sub: r.phase === 'depart' ? `On sort de ${HUB_NAMES[r.from]}…` : left ? `Arrivée dans ≈ ${left} s` : 'On arrive' });
  }

  private clearHub() {
    if (this.leaving) { this.leaving.dispose(); this.leaving = null; this.leavingRide = null; }
    if (this.rank) {
      this.rank.taxi?.dispose();
      this.rank.sign.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mat = m.material as THREE.MeshLambertMaterial; mat.map?.dispose(); mat.dispose(); } });
      this.rank.sign.removeFromParent();
      this.rank = null;
    }
    if (this.ride && this.ride.phase !== 'transfer') this.endRide(false);
    else if (this.ride) { this.ride.v.dispose(); this.cam.end(); }
    this.hub = null;
  }

  // ---------------------------------------------------------------- targets
  private rankAff: Affordance[] = [];
  private rankTarget: Target = { id: 'taxi:rank', name: 'Taxi', kind: 'vehicle', space: 'street', x: 0, z: 0, y: 1.9, radius: 1.6, bias: -0.2, affordances: () => this.rankAffordances() };
  private rideAff: Affordance[] = [];
  private rideTarget: Target = { id: 'taxi:ride', name: 'Taxi', kind: 'self', space: '', x: 0, z: 0, radius: 2, bias: -1, affordances: () => this.rideAffordances() };
  private readonly targets: TargetSource = {
    name: 'taxi',
    collect: (space, x, z, out) => {
      const r = this.ride;
      if (r) { if (space === this.space()) { const t = this.rideTarget; t.space = space; t.x = x; t.z = z; out.push(t); } return; }
      const v = this.rank?.taxi; if (!v || space !== 'street') return;
      const hl = v.spec.length / 2, hw = v.spec.width / 2, p = v.pose;
      if (Math.abs(p.x - x) > hl + 2 || Math.abs(p.z - z) > hl + 2) return;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), dx = x - p.x, dz = z - p.z;
      const lx = Math.max(-hw, Math.min(hw, dx * c - dz * s)), lz = Math.max(-hl, Math.min(hl, dx * s + dz * c));
      const t = this.rankTarget; t.x = p.x + lx * c + lz * s; t.z = p.z - lx * s + lz * c; out.push(t);
    },
  };
  private rankAffordances(): Affordance[] {
    if (!this.rankAff.length) this.rankAff = [{ id: 'taxi', verb: 'ride', label: 'Prendre un taxi', icon: '🚕', run: () => this.openRank() }];
    this.rankAff[0].disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : this.owed() ? 'Un trajet est déjà payé' : null;
    this.rankAff[0].detail = this.rank ? `Taxis · ${this.rank.name}` : undefined;
    return this.rankAff;
  }
  private rideAffordances(): Affordance[] {
    if (!this.rideAff.length) this.rideAff = [{ id: 'vue', verb: 'use', label: 'Changer de vue', icon: '🎥', run: () => { const r = this.ride; if (r) this.cam.next(r.v.spec.cameras.length); } }];
    return this.rideAff;
  }
}

function signTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 86;
  const c = cv.getContext('2d'); if (!c) return null;
  c.fillStyle = '#f5c400'; c.fillRect(0, 0, 256, 86);
  c.fillStyle = '#141414'; c.fillRect(0, 0, 256, 10); c.fillRect(0, 76, 256, 10);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 46px system-ui, sans-serif'; c.fillText('TAXI', 128, 45);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const taxi = new TaxiModule();
