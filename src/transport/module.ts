import type * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Seat } from '../interact/seats';
import type { Affordance, Target, TargetSource } from '../interact/types';
import { People } from '../interact/people';
import { stop as stopRecipe } from '../activity/templates';
import * as P from '../activity/primitives';
import type { ActivitySpec } from '../activity/types';
import { fcfa } from '../ui/hud';
import { rng } from '../core/rng';
import { lanePath, Path, Timetable, type Motion } from './route';
import { linesOf, loopNodes, SAY, type LineDef } from './lines';
import { CAR_RAPIDE } from './carRapide';
import { LineVehicle, callTexture } from './vehicle';
import { placeStops, buildStops, StopPeople, STOP_OFFSET, type StopSite } from './stops';
import { PassengerCamera } from './camera';
import { TripLogic, MIN_STOP } from './trip';
import { RideCard } from './ui';
import type { VehicleSpec } from './spec';

/**
 * Transport module (Wave 1: the car rapide passenger experience). Every hub has a car rapide line looping around its
 * central blocks: stops on the pavement (sign, shelter, bench, people waiting), vehicles on a timetable of the shared
 * clock, an apprenti calling the destinations. The player waits at a stop (« Monter dans le prochain »), boards
 * (walks to the rear door, pays the fare once, sits on a free vehicle seat), watches Dakar pass (passenger camera,
 * sways and bumps, chat space = the vehicle), asks to get off and steps out onto the pavement at the stop.
 * See docs/TRANSPORT.md.
 */
const LANE = 2.6, CORNER = 4.5, DWELL = 9;
const MOTION = { vmax: 9, vmin: 3.2, lateral: 2.6, accel: 1.5, decel: 2.2 };
/** Camera distance within which the apprenti and the people at the stops are drawn and animated. */
const NEAR = 70;

interface LineRt {
  def: LineDef;
  spec: VehicleSpec;
  path: Path;
  table: Timetable;
  sites: StopSite[];
  vehicles: LineVehicle[];
  motions: Motion[];
  arrivals: number[][];
  people: StopPeople | null;
  furniture: { group: THREE.Group; dispose(): void };
  calls: THREE.CanvasTexture[];
}

/** A short scripted walk (to the rear door, onto the pavement), timed on the real clock so it never outlasts a stop. */
interface Walk { fx: number; fz: number; tx: number; tz: number; t0: number; ms: number; done: () => void }

/** Where someone getting off at a stop lands: on the pavement in front of the shelter, facing along the road. */
export function alightPoint(site: StopSite) { return { x: site.x - site.rx * 0.6 - site.dx * 0.4, z: site.z - site.rz * 0.6 - site.dz * 0.4, yaw: Math.atan2(site.dx, site.dz) }; }

export class TransportModule implements GameModule {
  readonly name = 'transport';
  private ctx!: GameCtx;
  private lines: LineRt[] = [];
  private trip = new TripLogic();
  private line: LineRt | null = null;
  private seat: Seat | null = null;
  private cam = new PassengerCamera();
  private card: RideCard | null = null;
  private walk: Walk | null = null;
  private rand = rng(7);
  /** Debug only: seconds added to the line clock (checks skip the wait for the next car). */
  private warp = 0;
  private cardT = 0;
  private hub: HubWorld | null = null;
  private doorPt = { x: 0, z: 0 };
  private viewer = { x: 0, z: 0 };
  /** Fares paid (debug: the checks verify a trip is paid once). */
  private paid = 0;
  private camMs = 0;

  // ---------------------------------------------------------------- GameModule
  init(ctx: GameCtx) {
    this.ctx = ctx;
    const ui = document.getElementById('ui');
    if (ui) this.card = new RideCard(ui);
    ctx.interactions.add(this.targets);
    // people waiting at the stops can be greeted like anyone in the street
    const waiting = new People(() => this.lines.flatMap(l => l.people?.bodies() ?? []), ctx.activities, line => ctx.toast(line), () => ({ x: ctx.player.pos.x, z: ctx.player.pos.z }));
    ctx.interactions.add({ name: 'transport-people', collect: (space, x, z, out) => waiting.collect(space, x, z, out) });
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.clear();
    this.hub = hub;
    const low = ctx.quality() === 'low';
    for (const def of linesOf(hub.id)) {
      const spec = CAR_RAPIDE;
      const path = new Path(lanePath(loopNodes(def), LANE, CORNER));
      const sites = placeStops(def, hub.colliders);
      const door = spec.doors[0];
      // each stop holds the vehicle where its rear door is level with the shelter
      const stopS = sites.map(s => path.project(s.x - s.rx * (STOP_OFFSET - LANE) - s.dx * door.z, s.z - s.rz * (STOP_OFFSET - LANE) - s.dz * door.z));
      const table = new Timetable(path, stopS.map(s => ({ s, dwell: DWELL })), MOTION);
      const calls = [...def.calls.map(callTexture), callTexture(SAY.depart)];
      const fleet = low ? 1 : def.fleet;
      const bumpy = hub.id === 'pikine' ? 1.7 : 1;
      const vehicles = Array.from({ length: fleet }, (_, k) => {
        const v = new LineVehicle(spec, hub.id, def.id, k, table, table.stops.map(s => s.s), bumpy, this.rand);
        v.setCalls(calls);
        for (const s of v.seats) { ctx.seats.add(s); if (this.rand() < 0.45) s.occupant = 'npc'; }
        ctx.seats.add(v.vehicle.driverSeat); v.vehicle.driverSeat.occupant = 'npc';      // the chauffeur
        v.onArrive = () => this.shuffle(v);
        ctx.extra.add(v.group);
        return v;
      });
      const furniture = buildStops(def, sites, low);
      ctx.extra.add(furniture.group);
      for (const s of sites) for (const seat of s.seats) ctx.seats.add(seat);
      const people = new StopPeople(sites, low ? 1 : 2, this.rand, o => ctx.extra.add(o));
      const rt: LineRt = { def, spec, path, table, sites, vehicles, motions: vehicles.map(v => v.motion), arrivals: vehicles.map(v => v.arrivals), people, furniture, calls };
      this.lines.push(rt);
      for (const site of sites) ctx.places.add(this.stopPlace(rt, site));
    }
  }

  spaceChanged(_ctx: GameCtx, space: string) {
    if (space !== 'street' && this.trip.phase === 'waiting') this.stopWaiting('');
  }

  /** While riding, the player's space is the vehicle: interaction targets, chat and presence follow it. */
  space(): string | null {
    return this.trip.phase === 'riding' ? this.vehicle()?.id ?? null : null;
  }

  /** Saved position while riding: the pavement of the next stop (a reload never puts the player inside a vehicle). */
  safePlace(): { x: number; z: number; yaw: number } | null {
    const rt = this.line, v = this.vehicle();
    if (!rt || !v || (this.trip.phase !== 'riding' && this.trip.phase !== 'boarding' && this.trip.phase !== 'alighting')) return null;
    const i = this.trip.alightAt >= 0 ? this.trip.alightAt : v.motion.dwell >= 0 ? v.motion.dwell : v.motion.next;
    return alightPoint(rt.sites[i] ?? rt.sites[0]);
  }

  update(ctx: GameCtx, dt: number) {
    if (!this.lines.length || ctx.inside()) return;
    const cam = ctx.camera.position;
    this.viewer.x = cam.x; this.viewer.z = cam.z;
    const now = this.clock();
    for (const rt of this.lines) {
      for (const v of rt.vehicles) v.update(this.timeOf(rt, v.index, now), dt, Math.hypot(v.pose.x - cam.x, v.pose.z - cam.z) < NEAR);
      rt.people?.update(dt, this.viewer, NEAR, i => this.doorAt(rt, i));
    }
    this.updateTrip(ctx);
    this.cardT -= dt;
    if (this.cardT <= 0) { this.cardT = 0.25; this.refreshCard(); }
  }

  /** Drives the camera from boarding to the end of alighting. */
  camera(ctx: GameCtx, dt: number, drag: { yaw: number; pitch: number }): boolean {
    const v = this.vehicle();
    if (!v || !this.cam.active || this.trip.phase === 'idle' || this.trip.phase === 'waiting') return false;
    const views = v.spec.cameras;
    // the vehicle moves on the real clock: smooth the camera on real time too (frame dt is capped at 0.1 s)
    const t = performance.now(), real = this.camMs ? Math.min(1, (t - this.camMs) / 1000) : dt; this.camMs = t;
    this.cam.update(Math.max(dt, real), ctx.camera, v.pose, v.bounce, views[this.cam.view % views.length], drag, this.hub?.colliders ?? []);
    return true;
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    this.ctx = ctx;
    return {
      transport: {
        lines: () => this.lines.map(rt => ({
          id: rt.def.id, number: rt.def.number, period: rt.table.period, fare: rt.def.fare,
          stops: rt.sites.map(s => ({ id: s.def.id, name: s.def.name, x: s.x, z: s.z, yaw: s.yaw, s: rt.table.stops[s.index].s, alight: alightPoint(s) })),
          vehicles: rt.vehicles.map(v => ({ id: v.id, x: v.pose.x, z: v.pose.z, yaw: v.pose.yaw, s: v.motion.s, v: v.motion.v, dwell: v.motion.dwell, dwellLeft: v.motion.dwellLeft, next: v.motion.next, eta: v.motion.eta,
            free: v.seats.filter(s => !s.occupant).length, seats: v.seats.map(s => ({ id: s.id, occupant: s.occupant })) })),
        })),
        trip: () => ({ phase: this.trip.phase, line: this.line?.def.id ?? null, stop: this.trip.stop, vehicle: this.vehicle()?.id ?? null, alightAt: this.trip.alightAt, passed: this.trip.passed, seat: this.seat?.id ?? null, space: this.space(), view: this.cam.view, camera: this.cam.active, paid: this.paid }),
        /** Seconds until a vehicle of the line next stands at the stop. */
        nextAt: (line: string, stop: number) => { const rt = this.lines.find(l => l.def.id === line); return rt ? this.nextArrival(rt, stop) : null; },
        /** Skip the line clock forward (checks: the next car is `sec` seconds closer). */
        warp: (sec: number) => { this.warp += sec; },
        card: () => this.card?.text ?? '',
        safePlace: () => this.safePlace(),
        /** Show or hide everything the module draws (draw-call budget measurement). */
        show: (on: boolean) => { for (const rt of this.lines) { rt.furniture.group.visible = on; for (const v of rt.vehicles) v.group.visible = on; } },
      },
    };
  }

  // ---------------------------------------------------------------- lines, stops and passengers
  private clear() {
    this.endTrip(false);
    for (const rt of this.lines) {
      for (const v of rt.vehicles) v.dispose();
      rt.people?.dispose(); rt.furniture.dispose();
      for (const t of rt.calls) t.dispose();
    }
    this.lines = []; this.hub = null; this.doorTargets.clear();
  }

  private clock() { return this.ctx.now() / 1000 + this.warp; }
  private timeOf(rt: LineRt, k: number, now = this.clock()) { return now + rt.def.phase + (k * rt.table.period) / rt.vehicles.length; }
  private vehicle(): LineVehicle | null { return this.line && this.trip.vehicle >= 0 ? this.line.vehicles[this.trip.vehicle] ?? null : null; }

  /** Seconds until the next vehicle of the line stands at stop i (0 when one is there now with time to board). */
  private nextArrival(rt: LineRt, i: number) {
    const now = this.clock();
    let best = Infinity;
    for (const v of rt.vehicles) {
      const m = v.motion;
      if (m.dwell === i && m.dwellLeft > MIN_STOP) return 0;
      best = Math.min(best, rt.table.untilArrival(this.timeOf(rt, v.index, now), i) || rt.table.period);
    }
    return best;
  }

  /** Door of a vehicle standing at stop i (with time left for people to get on or off). */
  private doorAt(rt: LineRt, i: number) {
    for (const v of rt.vehicles) {
      if (v.motion.dwell !== i || v.motion.dwellLeft < MIN_STOP) continue;
      const d = rt.spec.doors[0];
      return v.world(d.x, d.z, this.doorPt);
    }
    return null;
  }

  /** At each stop a few passengers get off and others get on (their seats only; the closed cabin hides them). */
  private shuffle(v: LineVehicle) {
    let free = 0;
    for (const s of v.seats) {
      if (s.occupant === 'npc' && this.rand() < 0.35) s.occupant = null;
      else if (!s.occupant && this.rand() < 0.3) s.occupant = 'npc';
      if (!s.occupant) free++;
    }
    for (const s of v.seats) { if (free >= 4) break; if (s.occupant === 'npc') { s.occupant = null; free++; } }
  }

  private stopPlace(rt: LineRt, site: StopSite) {
    const waitingHere = () => this.trip.phase === 'waiting' && this.line === rt && this.trip.stop === site.index;
    const place = stopRecipe({
      id: `stop:${rt.def.id}:${site.def.id}`, name: `Arrêt ${site.def.name} · ${rt.def.number}`, space: 'street', line: rt.def.id,
      anchors: [{ id: 'stop', kind: 'spot', x: site.x, z: site.z, y: 3.0, radius: 2.8, bias: 0.2 }],
    }, { board: () => this.wantBoard(rt, site.index) });
    const offers = place.offers.stop;
    for (const o of offers) { o.visible = () => !waitingHere() && this.trip.phase !== 'boarding'; o.detail = `${rt.def.number} · ${rt.def.from} ⇄ ${rt.def.to} · ${fcfa(rt.def.fare)}`; }
    offers.push(
      { ...P.use({ id: 'annuler', label: 'Ne plus attendre', seconds: 0, visible: waitingHere, then: () => this.stopWaiting('Tu n’attends plus le car rapide') }), quiet: true },
      P.inspect({ id: 'horaires', label: 'Voir la ligne', detail: `${rt.def.number} · ${rt.def.from} ⇄ ${rt.def.to}`, then: () => this.openLine(rt, site) }),
    );
    return place;
  }

  private openLine(rt: LineRt, site: StopSite) {
    const order = rt.sites.map((_, k) => rt.sites[(site.index + k) % rt.sites.length]);
    this.ctx.menu(`${rt.def.number} · ${rt.def.from} ⇄ ${rt.def.to}`, `Car rapide · ${fcfa(rt.def.fare)} le trajet · un car toutes les ${Math.round(rt.table.period / rt.vehicles.length)} s environ`,
      order.map(s => ({ icon: s === site ? '📍' : '🚏', label: `Arrêt ${s.def.name}`, detail: s === site ? 'Tu es ici' : undefined,
        right: (() => { const t = this.nextArrival(rt, s.index); return t <= 0 ? 'à quai' : `${Math.ceil(t)} s`; })(), onPick: () => { this.ctx.hud.closeModal(); this.ctx.setMode('play'); } })));
  }

  /** « Monter dans le prochain »: wait at this stop; the next car standing here takes the player. */
  private wantBoard(rt: LineRt, stop: number) {
    if (this.trip.phase !== 'idle' && this.trip.phase !== 'waiting') return;
    this.trip.wait(stop); this.line = rt;
    const t = this.nextArrival(rt, stop);
    this.ctx.toast(t <= 0 ? `Le ${rt.def.number} est là : on monte !` : `Tu attends le ${rt.def.number} · ${SAY.waiting('il arrive', t)}`);
  }

  private stopWaiting(msg: string) {
    if (this.trip.phase !== 'waiting') return;
    this.trip.reset(); this.line = null;
    if (msg) this.ctx.toast(msg);
  }

  private updateTrip(ctx: GameCtx) {
    if (this.pending) { const p = this.pending; this.pending = null; if (this.trip.phase === 'boarding' && this.line === p.rt) this.startWalkIn(p.rt, p.k, p.seat); }
    if (this.walk) this.stepWalk(ctx);
    const rt = this.line; if (!rt) return;
    const phase = this.trip.phase;
    if (phase === 'waiting') {
      const site = rt.sites[this.trip.stop];
      if (Math.hypot(ctx.player.pos.x - site.x, ctx.player.pos.z - site.z) > 9) { this.stopWaiting('Tu as quitté l’arrêt'); return; }
      const act = this.trip.step(rt.motions, rt.arrivals);
      if (act?.act === 'board' && ctx.mode() === 'play') this.board(rt, act.vehicle);
      return;
    }
    if (phase === 'boarding') {
      // boarding is the walk to the door: the fare is paid, the seat reserved; nothing else can interrupt it but a hub
      // change or a door (they stand the player up), handled below like a lost seat
      return;
    }
    if (phase === 'riding') {
      if (!this.seat || ctx.player.seated()?.id !== this.seat.id) { this.endTrip(true); return; }   // taken off by a door, a trip, a scene…
      const act = this.trip.step(rt.motions, rt.arrivals);
      if (act?.act === 'alight') this.alight(ctx);
    }
  }

  /** Pay the apprenti once (universal runner, verb ride), walk to the rear door, sit on a free seat. */
  private board(rt: LineRt, k: number) {
    const ctx = this.ctx, v = rt.vehicles[k], m = v.motion;
    if (this.trip.phase === 'boarding' || this.trip.phase === 'riding' || this.trip.phase === 'alighting') return;   // one fare, one trip
    // a free passenger seat (never one an NPC sits on), by the window on the pavement side when there is one
    const free = v.seats.filter(s => !s.occupant);
    if (!free.length) { ctx.toast('Plein ! Attends le prochain.'); return; }
    const seat = free.find(s => s.id.endsWith('c2')) ?? free[Math.floor(this.rand() * free.length)];
    const stop = m.dwell >= 0 ? m.dwell : this.trip.stop >= 0 ? this.trip.stop : 0;
    const spec: ActivitySpec = {
      id: 'monter', primitive: 'ride', label: `Monter · ${rt.def.number}`, icon: '🚐', quiet: true,
      requires: () => ctx.state.canAfford(rt.def.fare) ? null : 'Pas assez d’argent pour le car',
      steps: [{ label: 'Tu paies l’apprenti', primitive: 'ride',
        effects: { money: -rt.def.fare, label: `Car rapide ${rt.def.number} · ${rt.sites[stop].def.name}`, counters: { car_rapide: 1 }, category: 'transport' },
        // the walk starts on the next frame, once the runner has handed control back
        then: () => { this.paid++; this.pending = { rt, k, seat }; } }],
    };
    this.trip.boarding(k, stop); this.line = rt;
    ctx.seats.occupy(seat.id, 'player'); this.seat = seat;      // reserved now: nobody else takes it
    if (!ctx.activities.start(spec, { place: rt.def.number })) {      // not enough money, or busy with something else (the runner says why)
      ctx.seats.release(seat.id, 'player');
      this.trip.reset(); this.line = null; this.seat = null;
    }
  }
  private pending: { rt: LineRt; k: number; seat: Seat } | null = null;

  private startWalkIn(rt: LineRt, k: number, seat: Seat) {
    const ctx = this.ctx, v = rt.vehicles[k], m = v.motion;
    ctx.player.standUp(true);                                   // from the stop's bench, if the player waited seated
    this.seat = seat;
    const d = rt.spec.doors[0], door = v.world(d.x, d.z, { x: 0, z: 0 });
    const fx = ctx.player.pos.x, fz = ctx.player.pos.z;
    const ms = 1000 * Math.max(0.4, Math.min(2, m.dwell >= 0 ? m.dwellLeft - 0.4 : 0, Math.hypot(door.x - fx, door.z - fz) / 1.7));
    this.cam.begin(ctx.camera, v.pose); this.camMs = 0;
    ctx.setMode('busy');
    const body = ctx.player.body(); if (body) body.hold = 'Walk';
    this.walk = { fx, fz, tx: door.x, tz: door.z, t0: performance.now(), ms, done: () => this.sitDown(rt, seat) };
  }

  private sitDown(rt: LineRt, seat: Seat) {
    const ctx = this.ctx;
    const body = ctx.player.body(); if (body && body.hold === 'Walk') body.hold = null;
    ctx.seats.release(seat.id, 'player');
    ctx.player.sit(seat);
    if (ctx.player.seated()?.id !== seat.id) { this.endTrip(true); if (ctx.mode() === 'busy') ctx.setMode('play'); return; }
    if (ctx.mode() === 'busy') ctx.setMode('play');
    this.trip.seated();
    ctx.toast(`${SAY.fare(rt.def.fare)} · ${rt.def.number} vers ${rt.def.to}`);
    ctx.save();
  }

  /** Off at the stop: out of the rear door and onto the pavement in front of the shelter, then the street camera. */
  private alight(ctx: GameCtx) {
    const rt = this.line!, v = this.vehicle()!, d = rt.spec.doors[0];
    const site = rt.sites[this.trip.alightAt] ?? rt.sites[0];
    const to = alightPoint(site);
    ctx.player.standUp(true);
    this.seat = null;
    const finish = () => {
      this.walk = null;
      const body = ctx.player.body(); if (body && body.hold === 'Walk') body.hold = null;
      this.cam.end();
      ctx.player.place(to.x, to.z, to.yaw);
      if (ctx.mode() === 'busy') ctx.setMode('play');
      ctx.toast(SAY.alight(site.def.name));
      this.trip.reset(); this.line = null;
      ctx.save();
    };
    // still standing at the stop and the game is in play: two steps from the door; otherwise straight onto the pavement
    if (ctx.mode() !== 'play' || v.motion.dwell !== this.trip.alightAt) { finish(); return; }
    const door = v.world(d.x, d.z, { x: 0, z: 0 });
    ctx.setMode('busy');
    const body = ctx.player.body(); if (body) body.hold = 'Walk';
    ctx.player.place(door.x, door.z, Math.atan2(to.x - door.x, to.z - door.z));
    this.walk = { fx: door.x, fz: door.z, tx: to.x, tz: to.z, t0: performance.now(), ms: 900, done: finish };
  }

  private stepWalk(ctx: GameCtx) {
    const w = this.walk!;
    const f = Math.min(1, (performance.now() - w.t0) / w.ms);
    // the car pulls away: whoever is still on the way gets in (or out) at once
    const v = this.vehicle(), leaving = this.trip.phase === 'boarding' && !!v && v.motion.dwell < 0;
    ctx.player.place(w.fx + (w.tx - w.fx) * f, w.fz + (w.tz - w.fz) * f, Math.atan2(w.tx - w.fx, w.tz - w.fz));
    if (f >= 1 || leaving) { this.walk = null; w.done(); }
  }

  /**
   * Ends the trip without the normal way out (hub change, a door, a scene, a lost seat). `safe`: the player is still
   * in this street — put them on the pavement beside the vehicle, never inside it.
   */
  private endTrip(safe: boolean) {
    const ctx = this.ctx;
    const rt = this.line, v = this.vehicle(), wasOn = this.trip.phase === 'boarding' || this.trip.phase === 'riding' || this.trip.phase === 'alighting';
    if (this.seat && ctx?.player.seated()?.id === this.seat.id) ctx.player.standUp(true);
    if (this.seat) ctx?.seats.release(this.seat.id, 'player');
    if (safe && wasOn && rt && v && ctx && !ctx.inside()) {
      const p = { x: 0, z: 0, yaw: 0 };
      rt.path.sample(v.motion.s, p);
      const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
      ctx.player.place(p.x + rx * (STOP_OFFSET - LANE - 0.4), p.z + rz * (STOP_OFFSET - LANE - 0.4), p.yaw);
      if (ctx.mode() === 'busy') ctx.setMode('play');
    }
    const body = ctx?.player.body(); if (body && body.hold === 'Walk') body.hold = null;
    this.trip.reset(); this.line = null; this.seat = null; this.walk = null; this.pending = null;
    if (this.cam.active) { this.cam.end(); ctx?.follow.snapBehind(ctx.player.facing()); }
  }

  private refreshCard() {
    const rt = this.line, card = this.card; if (!card) return;
    if (!rt || this.trip.phase === 'idle') { card.show(null); return; }
    const num = rt.def.number.replace('Ligne ', '');
    if (this.trip.phase === 'waiting') {
      const site = rt.sites[this.trip.stop], t = this.nextArrival(rt, this.trip.stop);
      card.show({ num, title: `Arrêt ${site.def.name} · ${rt.def.from} ⇄ ${rt.def.to}`, sub: t <= 0 ? 'Le car rapide est là' : `Prochain car rapide dans ≈ ${Math.ceil(t)} s` });
      return;
    }
    const v = this.vehicle(); if (!v) { card.show(null); return; }
    const m = v.motion, here = m.dwell >= 0 ? rt.sites[m.dwell] : null, next = rt.sites[m.next];
    const req = this.trip.alightAt >= 0 ? `🛑 Arrêt demandé : ${rt.sites[this.trip.alightAt].def.name}` : null;
    card.show({ num, title: `${rt.def.number} · vers ${rt.def.to}`, sub: here ? `À l’arrêt ${here.def.name}` : `Prochain arrêt : ${next.def.name} · ${Math.ceil(m.eta)} s`, req });
  }

  // ---------------------------------------------------------------- targets: the door of a car at a stop, the ride itself
  private rideAff: Affordance[] = [];
  private rideList: Affordance[] = [];
  private rideTarget: Target = {
    id: 'transport:ride', name: '', kind: 'self', space: '', x: 0, z: 0, radius: 2, bias: -1,
    affordances: () => this.rideAffordances(),
  };
  private doorTargets = new Map<string, Target>();

  private readonly targets: TargetSource = {
    name: 'transport',
    collect: (space, x, z, out) => {
      const v = this.vehicle();
      if (this.trip.phase === 'riding' && v && space === v.id) {
        const t = this.rideTarget; t.space = space; t.x = x; t.z = z; t.name = `${this.line!.def.number} · ${this.line!.def.from} ⇄ ${this.line!.def.to}`;
        out.push(t); return;
      }
      if (space !== 'street' || this.trip.phase === 'boarding' || this.trip.phase === 'riding' || this.trip.phase === 'alighting') return;
      for (const rt of this.lines) for (const veh of rt.vehicles) {
        const m = veh.motion; if (m.dwell < 0 || m.dwellLeft < MIN_STOP + 0.3) continue;
        const d = rt.spec.doors[0], p = veh.world(d.x, d.z);
        if (Math.abs(p.x - x) > 3.2 || Math.abs(p.z - z) > 3.2) continue;
        const t = this.doorTargets.get(veh.id) ?? this.doorTarget(rt, veh);
        t.x = p.x; t.z = p.z; out.push(t);
      }
    },
  };

  private doorTarget(rt: LineRt, v: LineVehicle): Target {
    const aff: Affordance = { id: 'monter', verb: 'ride', label: 'Monter', icon: '🚐', detail: `${rt.def.number} · ${rt.def.from} ⇄ ${rt.def.to}`, cost: rt.def.fare, disabled: null,
      run: () => { if (this.trip.phase === 'waiting') this.trip.reset(); this.board(rt, v.index); } };
    const list = [aff];
    const t: Target = { id: 'transport:door:' + v.id, name: `Car rapide · ${rt.def.number} vers ${rt.def.to}`, kind: 'vehicle', space: 'street', x: 0, z: 0, y: 2.9, radius: 3.2, bias: -0.3,
      affordances: () => { aff.disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : this.ctx.state.canAfford(rt.def.fare) ? null : 'Pas assez d’argent'; return list; } };
    this.doorTargets.set(v.id, t);
    return t;
  }

  private rideAffordances(): Affordance[] {
    const rt = this.line, v = this.vehicle(); if (!rt || !v) return [];
    const m = v.motion, req = this.trip.alightAt;
    const views = rt.spec.cameras, nextView = views[(this.cam.view + 1) % views.length];
    if (!this.rideAff.length) {
      this.rideAff = [
        { id: 'descendre', verb: 'alight', label: '', icon: '🛑', run: () => this.requestStop() },
        { id: 'vue', verb: 'use', label: 'Changer de vue', icon: '🎥', run: () => this.cam.next(this.vehicle()?.spec.cameras.length ?? 1) },
        { id: 'voisin', verb: 'talk', label: 'Parler au voisin', icon: '💬', run: () => this.talkToNeighbour() },
        { id: 'annuler', verb: 'stand', label: 'Ne pas descendre', icon: '↩️', run: () => { this.trip.cancelRequest(); this.ctx.toast('Tu restes dans le car'); } },
      ];
    }
    const [down, view, talk, cancel] = this.rideAff;
    const here = m.dwell >= 0 && m.dwellLeft > MIN_STOP;
    if (req >= 0) { down.label = `Arrêt demandé : ${rt.sites[req].def.name}`; down.disabled = 'L’apprenti a entendu : tu descends à cet arrêt'; down.detail = undefined; }
    else { down.label = here ? 'Descendre ici' : 'Descendre au prochain arrêt'; down.disabled = null; down.detail = `Arrêt ${rt.sites[here ? m.dwell : m.next].def.name}`; }
    view.detail = nextView.label;
    const npc = v.seats.some(s => s.occupant === 'npc');
    talk.disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : npc ? null : 'Personne à côté de toi';
    this.rideList.length = 0;
    this.rideList.push(down, view, talk);
    if (req >= 0) this.rideList.push(cancel);
    return this.rideList;
  }

  private requestStop() {
    const v = this.vehicle(), rt = this.line; if (!v || !rt || this.trip.phase !== 'riding') return;
    const i = this.trip.request(v.motion);
    this.ctx.toast(SAY.request(rt.sites[i].def.name));
  }

  private talkToNeighbour() {
    const line = SAY.neighbour[Math.floor(this.rand() * SAY.neighbour.length)];
    this.ctx.activities.start(P.greet({ id: 'voisin', label: 'Parler au voisin', then: () => this.ctx.toast(`Ton voisin : ${line}`) }));
  }
}

export const transport = new TransportModule();
