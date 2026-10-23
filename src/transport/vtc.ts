import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { HubId, VtcTrip } from '../core/types';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { fcfa } from '../ui/hud';
import { say } from '../i18n/wolof';
import { HUB_NAMES } from '../world/content';
import { phoneHooks } from '../ui/phoneHooks';
import { practise } from '../economy/polyvalence';
import { addMissionGuide } from '../game/missionGuide';
import { callTexture } from './vehicle';
import { vehicleAudio } from './vehicleAudio';
import { CARS } from './fleet';
import { VTC_LOOKS, VTC_POINTS, atStop, rideLimitMs, stopOf, tripOf, vtcRequests, type VtcRequest } from './vtcRules';
import { clearKerb } from './passengers';
import { CABINS, lookSitter, placeSitter, type SitterPlace } from './cabinFit';
import { cabinInfo, cabinView, holdCabin, rearDoorBox, seeThroughOk, setRearDoor, sitterOrder } from './carCabin';
import type { VehicleSpec } from './spec';
import { streak } from '../economy/streakModule';
import { creditClock } from '../economy/creditModule';
import { fareShare, openLoans } from '../economy/credit';

/**
 * « Courses VTC » (inspired by the ride apps of Dakar; no real service, no real money): the phone lists rides asked for in this district; one accepted,
 * the player drives their own car (bought cash or on credit) to the passenger, stops at the kerb, and the passenger — a real person standing there — walks
 * to the car and gets into its back seat; driven to the destination, across districts on the roads if need be, they get out and walk off, and the fare is
 * paid once, on arrival (one wallet line; the ride's id remembered so a reload never pays it twice).
 *
 * Getting in and out is played out, on the pavement side: the passenger walks to the rear door on the side where they stand, opens it (the door swings
 * on its hinge: src/transport/carCabin.ts), turns their back to the seat, sits on its edge and swings their legs in, and the door shuts; they ride seen
 * through the glass, held in the car pose at the height the car's roof allows (src/transport/cabinFit.ts). At the drop-off the door opens on the
 * pavement side (sliding across the bench if the car stopped the other way round), they swing out, stand, step onto the pavement and walk off along
 * it, and only fade once well away or out of sight.
 *
 * The ride in hand is saved (`vtc.active`): a reload or a crossing into the next district finds the passenger where they were — waiting on the pavement, or
 * sitting in the car (one person, rebuilt with the car, never a copy left behind). The rules: src/transport/vtcRules.ts.
 */
/**
 * wait: on the pavement · walk: to the rear door · open: the door opens · in: getting in · seated: riding · unseat: the door opens at the drop-off ·
 * out: getting out, onto the pavement · gone: nobody. Once out, the person walks off as a « leaver » (below) and the next ride can begin.
 */
type Phase = 'gone' | 'wait' | 'walk' | 'open' | 'in' | 'seated' | 'unseat' | 'out';
/** Seconds: the door's swing, getting in, getting out (with a slide across the bench when the pavement is on the other side). */
const DOOR_S = 0.55, IN_S = 2.2, OUT_S = 2.4, ACROSS_S = 0.9;
const WALK = 1.3, AWAY = 1.2;
type Car = { m: (typeof CARS)[number]; c: NonNullable<ReturnType<(typeof CARS)[number]['carNow']>> };
const ease = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));

class Vtc implements GameModule {
  readonly name = 'vtc';
  private ctx!: GameCtx;
  private h: Humanoid | null = null;
  private look: PersonLook | null = null;
  private phase: Phase = 'gone';
  /** Seconds in the phase. */
  private t = 0;
  /** On foot (world, hub-local metres) — the person's group lives in the scene's extra layer. */
  private pos = { x: 0, z: 0 }; private yaw = 0;
  private walkTo: { x: number; z: number } | null = null;
  /** In the car (its frame): the group is a child of the car's body. */
  private seatedIn: THREE.Object3D | null = null;
  private local = { x: 0, y: 0, z: 0, yaw: 0, s: 1 };
  /** The rear door used (−1 right, 1 left), the seat, where the body sits there, and the door's swing (0 shut … 1 open, and where it is going). */
  private side: -1 | 1 = -1;
  private seatAt: { id: string; x: number; z: number; place: SitterPlace } | null = null;
  private doorK = 0; private doorGoal = 0; private doorBody: THREE.Object3D | null = null; private doorSpec: VehicleSpec | null = null;
  /** Getting out: the side of the pavement, whether to slide across first, the fare already settled. */
  private exit: { side: -1 | 1; across: boolean } | null = null;
  /** The passenger who got out, walking off along the pavement until well away or out of sight, then fading. */
  private leaver: { h: Humanoid; pos: { x: number; z: number }; yaw: number; path: { x: number; z: number }[]; walked: number; unseen: number; fade: number; mats: THREE.Material[] } | null = null;
  private bubble: THREE.Sprite | null = null; private bubbleT = 0; private bubbleTex: THREE.CanvasTexture | null = null;
  private frustum = new THREE.Frustum(); private pm = new THREE.Matrix4(); private v3 = new THREE.Vector3();
  private log = { boarded: 0, alighted: 0, paid: 0, rebuilt: 0, walked: 0, maxStep: 0, events: [] as string[], phases: [] as string[], doorMax: 0, leftAt: null as null | { walked: number; camDist: number; seen: boolean }, awayWalked: 0 };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    phoneHooks.openVtc = () => this.openApp();
    addMissionGuide(() => this.guide());
  }
  private get trip(): VtcTrip | null { return this.ctx.state.data.vtc.active; }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx; this.clear();
    // no parking at a VTC spot: the kerb where a car stops for a passenger is kept clear of parked vehicles, 9 m either way (as at a car rapide's stop)
    clearKerb(ctx.extra, hub.colliders, VTC_POINTS[hub.id].map(p => { const k = stopOf(p).car, f = { x: Math.sin(k.yaw), z: Math.cos(k.yaw) }; return { x: k.x, z: k.z, dx: f.x, dz: f.z, rx: -f.z, rz: f.x, offset: 4.3, from: -9, to: 9 }; }));
  }
  private clear() {
    this.clearPerson();
    this.dropLeaver();
    if (this.bubble) { this.bubble.removeFromParent(); (this.bubble.material as THREE.SpriteMaterial).dispose(); this.bubble = null; }
    this.bubbleTex?.dispose(); this.bubbleTex = null;
  }

  /** The player's car in this district that the ride uses: the one driven, else (a ride in hand) the one the passenger sits in. */
  private car(): Car | null {
    const t = this.trip;
    for (const m of CARS) { const c = m.carNow(); if (c?.driving) return { m, c }; }
    if (t?.asset) for (const m of CARS) if (m.def.asset === t.asset) { const c = m.carNow(); if (c) return { m, c }; }
    return null;
  }
  /** The car the person is in now (whatever the trip says: getting out continues after the fare is paid). */
  private carOf(body: THREE.Object3D | null): Car | null {
    if (!body) return null;
    for (const m of CARS) { const c = m.carNow(); if (c && c.v.body === body) return { m, c }; }
    return null;
  }
  private ownsCar() { return CARS.some(m => !!this.ctx.state.data.assets.list.find(a => a.spec === m.def.asset && a.how === 'owned')); }

  // ---------------------------------------------------------------- the phone app
  openApp() {
    const ctx = this.ctx, close = () => { ctx.hud.closeModal(); ctx.setMode('play'); }, w = ctx.world(), t = this.trip, st = ctx.state.data.vtc;
    const head = `${st.trips} course${st.trips > 1 ? 's' : ''} · ${fcfa(st.earned)} gagnés`;
    if (t) {
      const where = t.stage === 'pickup' ? `Va chercher ${t.passenger.name} : ${t.pickup.name} (${hubShort(t.from)})` : `${t.passenger.name} est à bord : ${t.dropoff.name} (${hubShort(t.to)})`;
      ctx.menu('Courses VTC · en cours', `${where} · ${fcfa(t.fare)} à l’arrivée`, [
        { icon: '📍', label: t.stage === 'pickup' ? 'Prise en charge' : 'Destination', detail: t.stage === 'pickup' ? `${t.pickup.name} · ${hubShort(t.from)}` : `${t.dropoff.name} · ${hubShort(t.to)}`, disabled: true, onPick: () => {} },
        { icon: '✖️', label: 'Annuler la course', detail: t.stage === 'aboard' ? 'Arrête-toi d’abord : le passager descend, rien n’est payé' : 'Le passager trouvera quelqu’un d’autre', disabled: t.stage === 'aboard' && !this.stopped(), onPick: () => { close(); this.cancel(); } },
        { icon: '↩️', label: 'Fermer', onPick: close },
      ]);
      return;
    }
    if (!w) return;
    if (!this.ownsCar()) { ctx.menu('Courses VTC', `Il te faut ta propre voiture pour prendre des courses. La Teranga de Sarr Auto (Pikine) est parfaite, même à crédit. · ${head}`, [{ icon: '↩️', label: 'Fermer', onPick: close }]); return; }
    const reqs = vtcRequests(w.id, ctx.day(), ctx.hour());
    ctx.menu('Courses VTC', `Demandes à ${hubShort(w.id)} cette heure-ci · ${head}`, [
      ...reqs.map(r => ({ icon: r.to === r.from ? '🚕' : '🛣️', label: `${r.pickup.name} → ${r.dropoff.name}`, detail: `${r.passenger.name} · ${r.hubs.map(hubShort).join(' → ')} · ≈ ${(r.metres / 1000).toFixed(1).replace('.', ',')} km`, right: fcfa(r.fare), disabled: !this.carHere(), reason: this.carHere() ? undefined : 'Ta voiture n’est pas dans ce quartier', onPick: () => { close(); this.accept(r); } })),
      { icon: '↩️', label: 'Fermer', onPick: close },
    ]);
  }
  private carHere() { return CARS.some(m => !!m.carNow()); }
  /** Takes a ride: fixed now (fare, places, passenger) and saved. */
  accept(r: VtcRequest) {
    const s = this.ctx.state, st = s.data.vtc; if (st.active) return false;
    st.seq += 1; st.active = tripOf(r, `V${st.seq}`, s.data.playedMs);
    this.log.events.push(`accept:${st.active.id}:${r.from}>${r.to}`);
    this.ctx.toast(`Course acceptée : ${r.passenger.name} t’attend à ${r.pickup.name}. ${fcfa(r.fare)} à l’arrivée.`);
    this.ctx.save();
    return true;
  }
  cancel() {
    const t = this.trip; if (!t) return;
    if (t.stage === 'aboard') { if (!this.stopped()) return; this.alight(false); }
    else if (this.phase === 'open' || this.phase === 'in') this.backToPavement();
    this.ctx.state.data.vtc.active = null; this.log.events.push(`cancel:${t.id}`);
    this.ctx.toast('Course annulée. Rien n’est payé.'); this.ctx.save();
  }
  private stopped() { const c = this.car(); return !c || Math.abs(c.c.speed) < 0.6; }

  // ---------------------------------------------------------------- the passenger
  private ensurePerson() {
    if (this.h || !humanoidReady()) return this.h;
    const t = this.trip; if (!t) return null;
    this.look = VTC_LOOKS[t.passenger.seed % VTC_LOOKS.length];
    this.h = new Humanoid(this.look); this.h.hold = 'Idle';
    this.ctx.extra.add(this.h.group); return this.h;
  }
  private setPhase(p: Phase) { if (p === this.phase) return; this.phase = p; this.t = 0; this.log.phases.push(p); if (this.log.phases.length > 40) this.log.phases.shift(); }

  update(ctx: GameCtx, dt: number) {
    const t = this.trip, w = ctx.world();
    if (w && t) this.followTrip(t, w.id);
    else if (!t && this.h && (this.phase === 'wait' || this.phase === 'walk' || this.phase === 'seated')) this.clearPerson();   // a ride cancelled before boarding (they find someone else), or gone from the save
    this.t += dt;
    this.choreography(dt);
    this.stepDoor(dt);
    this.stepLeaver(ctx, dt);
    this.bubbleT = Math.max(0, this.bubbleT - dt);
    if (this.bubble) {
      const at = this.h ? this.h.group.getWorldPosition(this.v3) : null;
      this.bubble.visible = this.bubbleT > 0 && !!at && this.phase !== 'seated';
      if (at) this.bubble.position.set(at.x, at.y + 2.2, at.z);
    }
  }

  /** What the ride in hand asks of the person this frame: be there, walk to the car when it stops, sit in it, get out at the destination. */
  private followTrip(t: VtcTrip, hub: HubId) {
    if (t.stage === 'pickup') {
      if (hub !== t.from) { if (this.h) this.clearPerson(); return; }
      const stop = stopOf(t.pickup);
      if (!this.h || this.phase === 'gone') {
        if (!this.ensurePerson()) return;
        this.setPhase('wait'); this.pos = { ...stop.wait }; this.yaw = Math.atan2(-stop.out.x, -stop.out.z); this.speak(`${t.passenger.name} · VTC ?`);
      }
      const c = this.car();
      if (this.phase === 'wait' && c && c.c.driving && atStop(c.c, stop.car)) {
        // the rear door on the side where the passenger stands (the pavement's, when the car is at the kerb the right way round)
        this.side = this.sideOf(c, this.pos);
        this.setPhase('walk');
        this.speak(`${say('Salaam aleekum')} !`);
      }
      if (this.phase === 'walk' || this.phase === 'open') {
        if (!c || Math.abs(c.c.speed) > 0.8) { this.backToPavement(); this.speak('Attends-moi !'); }
      }
      if (this.phase === 'walk' && c) this.walkTo = this.toWorld(c, this.openSpot(c));
    } else if (t.stage === 'aboard') {
      const c = this.car();
      if (c && c.m.def.asset === t.asset) {
        // rebuilt once with the car (a reload, a district crossed): straight into the seat, never a copy left on the pavement
        if (this.phase !== 'in' && this.phase !== 'unseat' && this.phase !== 'out' && (!this.h || this.seatedIn !== c.c.v.body)) this.seatNow(c, t);
        if (this.phase === 'seated' && hub === t.to && c.c.driving && atStop(c.c, stopOf(t.dropoff).car)) this.alight(true);
      } else if (this.h && this.phase === 'seated') this.clearPerson();          // the car is not in this district (being swapped): the passenger comes with it
    }
  }

  /** The person's own movements this frame, phase by phase. */
  private choreography(dt: number) {
    const h = this.h; if (!h) return;
    const c = this.seatedIn ? this.carOf(this.seatedIn) : null;
    switch (this.phase) {
      case 'wait': {
        const car = this.car(), near = car ? Math.hypot(car.c.x - this.pos.x, car.c.z - this.pos.z) : 99;
        h.hold = near < 22 && near > 6 ? 'Talk' : 'Idle';                       // a hand up to the car coming
        break;
      }
      case 'walk': h.hold = null; if (this.step(dt)) this.setPhase('open'); break;
      case 'open': {
        const car = this.car();
        if (!car) break;
        // at the rear door, facing it: a hand to the handle, the door swings open, then in
        const d = rearDoorBox(car.c.v.body, car.c.spec), door = this.toWorld(car, { x: this.side * (d.out + 0.2), z: (d.z0 + d.z1) / 2 });
        this.yaw = Math.atan2(door.x - this.pos.x, door.z - this.pos.z);
        h.hold = this.t < 0.75 ? 'Reach' : 'Idle';
        if (this.t > 0.25 && this.doorGoal === 0) { this.doorGoal = 1; this.doorBody = car.c.v.body; this.doorSpec = car.c.spec; vehicleAudio.door(true); }
        if (this.t > 0.25 + DOOR_S) this.beginIn(car);
        break;
      }
      case 'in': if (c) this.stepIn(c); break;
      case 'seated': break;
      case 'unseat': if (c) { if (this.t > DOOR_S) { this.setPhase('out'); } } break;
      case 'out': if (c) this.stepOut(c); else this.finishOut(null); break;
    }
    if (!this.seatedIn && this.h) {
      h.animate(dt, this.phase === 'walk' ? WALK : 0);
      h.group.position.set(this.pos.x, this.ground(this.pos.x, this.pos.z), this.pos.z); h.group.rotation.y = this.yaw;
    } else if (this.h) {
      h.group.position.set(this.local.x, this.local.y, this.local.z); h.group.rotation.set(0, this.local.yaw, 0);
      h.seatScale = this.local.s;
      h.animate(dt, 0);
    }
  }
  private ground(x: number, z: number) { return 0.12 + (this.ctx.world()?.heightAt(x, z) ?? 0); }

  /** Which side of the car a point (world) is on: −1 its right, 1 its left. */
  private sideOf(c: Car, p: { x: number; z: number }): -1 | 1 {
    const dx = p.x - c.c.x, dz = p.z - c.c.z, lx = dx * Math.cos(c.c.yaw) - dz * Math.sin(c.c.yaw);
    return lx < 0 ? -1 : 1;
  }
  private toWorld(c: Car, l: { x: number; z: number }) { const co = Math.cos(c.c.yaw), si = Math.sin(c.c.yaw); return { x: c.c.x + l.x * co + l.z * si, z: c.c.z - l.x * si + l.z * co }; }
  private toLocal(c: Car, p: { x: number; z: number }) { const dx = p.x - c.c.x, dz = p.z - c.c.z, co = Math.cos(c.c.yaw), si = Math.sin(c.c.yaw); return { x: dx * co - dz * si, z: dx * si + dz * co }; }
  /** Where the passenger stands to open the rear door: off its rear edge, clear of the leaf as it swings. */
  private openSpot(c: Car) { const d = rearDoorBox(c.c.v.body, c.c.spec); return { x: this.side * (d.out + 0.55), z: d.z0 - 0.18 }; }
  /** The seat on that side, and where this body sits in it (src/transport/cabinFit.ts). */
  private seatFor(c: Car, side: -1 | 1) {
    const spec = c.c.spec, id = side < 0 ? 'rearR' : 'rearL';
    const s = spec.seats.find(x => x.id === id) ?? spec.seats.find(x => x.id === 'front') ?? spec.seats[0];
    const row = (CABINS[spec.id] ?? CABINS.teranga)[s.id === 'front' ? 'front' : 'rear'];
    return { id: s.id, x: s.x, z: s.z, place: placeSitter(row, s.y, lookSitter(this.look ?? VTC_LOOKS[0])) };
  }
  /** Standing height in the car's frame (the pavement under the person, less the car's ground and its bounce). */
  private standY(c: Car, l: { x: number; z: number }) { const w = this.toWorld(c, l); return this.ground(w.x, w.z) - (c.c.v.pose.y + c.c.v.body.position.y); }
  private attach(c: Car) {
    const h = this.h!; h.group.removeFromParent(); c.c.v.body.add(h.group); this.seatedIn = c.c.v.body;
    holdCabin(c.c.v.body, 'vtc', true); sitterOrder(h.group, true);
  }
  private detach(c: Car | null) {
    const h = this.h!;
    if (c) { const w = this.toWorld(c, this.local); this.pos = { ...w }; this.yaw = this.local.yaw + c.c.yaw; holdCabin(c.c.v.body, 'vtc', false); }
    h.group.removeFromParent(); this.ctx.extra.add(h.group); this.seatedIn = null; h.seatScale = 1; sitterOrder(h.group, false);
  }

  /** In: from the door's mouth, the back to the seat, down onto its edge, the legs swung in (src/transport/carCabin.ts opens the door). */
  private beginIn(c: Car) {
    this.seatAt = this.seatFor(c, this.side);
    const l = this.toLocal(c, this.pos);
    this.attach(c);
    this.local = { x: l.x, y: this.standY(c, l), z: l.z, yaw: this.yaw - c.c.yaw, s: 1 };
    this.inFrom = { ...this.local };
    this.setPhase('in');
  }
  private inFrom = { x: 0, y: 0, z: 0, yaw: 0, s: 1 };
  private stepIn(c: Car) {
    const h = this.h!, s = this.seatAt!, side = this.side, d = rearDoorBox(c.c.v.body, c.c.spec), t = this.t / IN_S;
    const mouth = { x: side * (d.out + 0.3), z: Math.max(d.z0 + 0.28, Math.min(d.z1 - 0.35, s.z + 0.08)) };
    const edge = { x: side * (d.out - 0.14), z: s.z + 0.06 };
    const out = side * Math.PI / 2, stand = this.standY(c, mouth), sit = s.place.origin, f = this.inFrom;
    let x: number, z: number, y: number, yaw: number, sc = 1;
    const yaw0 = wrapNear(Math.atan2(mouth.x - f.x, mouth.z - f.z), f.yaw);
    if (t < 0.22) {                                            // into the mouth of the door, between the door and the body
      const k = seg(t, 0, 0.22); x = lerp(f.x, mouth.x, k); z = lerp(f.z, mouth.z, k); y = lerp(f.y, stand, k); yaw = lerp(f.yaw, yaw0, Math.min(1, k * 2));
      h.hold = null;
    } else if (t < 0.38) {                                     // turn the back to the seat
      const k = seg(t, 0.22, 0.38); x = mouth.x; z = mouth.z; y = stand; yaw = lerp(yaw0, wrapNear(out, yaw0), k);
      h.hold = 'Idle';
    } else if (t < 0.68) {                                     // down onto the seat's edge, bending under the roof
      const k = seg(t, 0.38, 0.68); x = lerp(mouth.x, edge.x, k); z = lerp(mouth.z, edge.z, k); y = lerp(stand, sit, k); yaw = wrapNear(out, yaw0); sc = lerp(1, s.place.scale, k);
      if (h.clipName !== 'Ingress' && t < 0.55) h.play('Ingress', 0.3);
      if (t >= 0.55 && h.clipName !== 'SitCar') h.play('SitCar', 0.35);
      h.hold = t < 0.55 ? 'Ingress' : 'SitCar';
    } else {                                                   // the legs swung in, sliding across to the seat, facing forward
      const k = seg(t, 0.68, 1); x = lerp(edge.x, s.x, k); z = lerp(edge.z, s.z, k); y = sit; yaw = lerp(wrapNear(out, yaw0), wrapNear(0, out), k); sc = s.place.scale;
      h.hold = 'SitCar';
    }
    this.local = { x, y, z, yaw, s: sc };
    if (t >= 1) this.board(c);
  }
  /** Seated: the seat is taken (the vehicle's seat registry), the trip saved; the door shuts. */
  private board(c: Car) {
    const t = this.trip, s = this.seatAt!;
    this.local = { x: s.x, y: s.place.origin, z: s.z, yaw: 0, s: s.place.scale };
    this.setPhase('seated'); this.doorGoal = 0;
    c.c.v.setPassengers([s.id]);
    if (!t) return;
    t.stage = 'aboard'; t.asset = c.m.def.asset; t.seat = s.id;
    this.log.boarded++; this.log.events.push(`board:${t.id}:${c.m.def.asset}:${s.id}`);
    this.ctx.toast(`${t.passenger.name} monte à l’arrière : « ${say('Salaam aleekum')} ! ${t.dropoff.name}, ${hubShort(t.to)}, s’il te plaît. »`);
    this.ctx.save();
  }
  /** Rebuilt in the seat (a reload, a new district): the same person, already sitting. */
  private seatNow(c: Car, t: VtcTrip) {
    const h = this.ensurePerson(); if (!h) return;
    this.side = t.seat === 'rearL' ? 1 : -1;
    this.seatAt = this.seatFor(c, this.side);
    if (this.seatedIn !== c.c.v.body) this.attach(c);
    this.local = { x: this.seatAt.x, y: this.seatAt.place.origin, z: this.seatAt.z, yaw: 0, s: this.seatAt.place.scale };
    h.play('SitCar', 0); h.hold = 'SitCar';
    this.setPhase('seated');
    c.c.v.setPassengers([this.seatAt.id]);
    if (this.log.boarded) this.log.rebuilt++;
  }
  /** Back to the pavement (the car drove off before the passenger was in): the door shuts, they wait again. */
  private backToPavement() {
    const c = this.seatedIn ? this.carOf(this.seatedIn) : null;
    if (this.seatedIn) this.detach(c);
    this.doorGoal = 0; this.walkTo = null;
    const t = this.trip;
    if (t && t.stage === 'pickup') { const s = stopOf(t.pickup); this.pos = { ...s.wait }; this.yaw = Math.atan2(-s.out.x, -s.out.z); }
    if (this.h) { this.h.hold = 'Idle'; this.h.seatScale = 1; }
    this.setPhase(t ? 'wait' : 'gone');
  }

  /** Out: at the destination (paid once) or on a cancel (nothing paid). The door opens on the pavement side; the person gets out and walks off. */
  private alight(arrived: boolean) {
    const t = this.trip!, c = this.car(), h = this.h;
    if (c && h && this.seatedIn) {
      // the pavement: where the drop-off's passenger would wait (on a cancel, the kerb nearest the car)
      const stop = stopOf(arrived ? t.dropoff : { x: c.c.x, z: c.c.z }), side = this.sideOf(c, stop.wait);
      this.exit = { side, across: side !== this.side };
      c.c.v.setPassengers([]);
      this.setPhase('unseat'); this.doorGoal = 0;
      if (!this.exit.across) { this.doorGoal = 1; this.doorBody = c.c.v.body; this.doorSpec = c.c.spec; vehicleAudio.door(true); }
      this.outFrom = { ...this.local };
    } else this.clearPerson();
    this.log.alighted++;
    if (!arrived) return;
    const st = this.ctx.state.data.vtc;
    if (!st.done.includes(t.id)) {
      st.done.push(t.id); if (st.done.length > 60) st.done.splice(0, st.done.length - 60);
      this.ctx.state.addMoney(t.fare, `Course VTC : ${hubShort(t.from)} → ${hubShort(t.to)} (${t.passenger.name})`);
      st.trips += 1; st.earned += t.fare; this.log.paid++; practise(this.ctx.state, 'service');
    }
    st.active = null; this.log.events.push(`paid:${t.id}:${t.fare}`);
    this.speak(`${say('Jërëjëf')}, bonne route !`);
    // the card says what was done (paid above, once): no stars, one line from what happened (late against the time the ride should take, bumps)
    // while Pape Sarr's car credit runs, his share of the fare goes to him (src/economy/credit.ts fareShare: shown on the card, turned off in « Crédits »)
    const loan = openLoans(this.ctx.state.data.loans.list, 'sarr').find(l => l.kind === 'vehicle'), share = arrived ? fareShare(loan, t.fare) : 0;
    const extra = loan && share > 0 && this.ctx.state.canAfford(share) ? [{ k: 'Pape Sarr', v: `${fcfa(share)} remboursés`, d: `−${fcfa(share)}`, tone: 'down', note: `reste ${fcfa(loan.principal - loan.paid - share)} sur la Teranga` }] : [];
    streak.done(`vtc:${t.id}`, { kind: 'vtc', title: `Course terminée · ${t.passenger.name}`, from: `${t.pickup.name} (${hubShort(t.from)})`, to: `${t.dropoff.name} (${hubShort(t.to)})`, paid: t.fare, late: this.lateRide(t) }, extra);
    if (loan && extra.length) creditClock.pay(this.ctx, loan, share, true);
    this.ctx.save();
  }
  private outFrom = { x: 0, y: 0, z: 0, yaw: 0, s: 1 };
  private stepOut(c: Car) {
    const h = this.h!, ex = this.exit!, s = this.seatAt!, side = ex.side, d = rearDoorBox(c.c.v.body, c.c.spec);
    const across = ex.across ? ACROSS_S : 0, f = this.outFrom;
    // across the bench first, when the pavement is on the other side; the door on that side opens as they get there
    if (this.t < across) {
      const k = seg(this.t, 0, across); this.local = { ...f, x: lerp(f.x, side * Math.abs(s.x), k) }; h.hold = 'SitCar';
      if (this.t > across - DOOR_S && this.doorGoal === 0) { this.doorGoal = 1; this.doorBody = c.c.v.body; this.doorSpec = c.c.spec; vehicleAudio.door(true); this.side = side; }
      return;
    }
    if (this.side !== side) this.side = side;
    const t = (this.t - across) / OUT_S, sx = side * Math.abs(s.x);
    const mouth = { x: side * (d.out + 0.32), z: Math.max(d.z0 + 0.28, Math.min(d.z1 - 0.35, s.z + 0.08)) };
    const edge = { x: side * (d.out - 0.14), z: s.z + 0.06 }, out = side * Math.PI / 2, stand = this.standY(c, mouth), step = { x: side * (d.out + 1.0), z: mouth.z - 0.15 };
    let x: number, z: number, y: number, yaw: number, sc = s.place.scale;
    if (t < 0.3) {                                             // swing out: the legs over the sill, sliding to the seat's edge
      const k = seg(t, 0, 0.3); x = lerp(sx, edge.x, k); z = lerp(s.z, edge.z, k); y = s.place.origin; yaw = lerp(0, out, k); h.hold = 'SitCar';
    } else if (t < 0.62) {                                     // stand up through the door, ducking under the roof
      const k = seg(t, 0.3, 0.62); x = lerp(edge.x, mouth.x, k); z = lerp(edge.z, mouth.z, k); y = lerp(s.place.origin, stand, k); yaw = out; sc = lerp(s.place.scale, 1, k);
      if (t < 0.48) { if (h.clipName !== 'Ingress') h.play('Ingress', 0.3); h.hold = 'Ingress'; } else h.hold = null;
    } else {                                                   // a step onto the pavement, clear of the door
      const k = seg(t, 0.62, 0.92); x = lerp(mouth.x, step.x, k); z = lerp(mouth.z, step.z, k); y = this.standY(c, { x, z }); yaw = out; sc = 1; h.hold = null;
      if (t > 0.8 && this.doorGoal === 1) { this.doorGoal = 0; }
    }
    this.local = { x, y, z, yaw, s: sc };
    if (t >= 1) this.finishOut(c);
  }
  /** Out on the pavement: from here on a passer-by walking off (the « leaver »); the next ride can begin. */
  private finishOut(c: Car | null) {
    if (!this.h) return;
    if (this.seatedIn) this.detach(c);
    this.doorGoal = 0;
    const h = this.h, out = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    // along the pavement, the way the car faces (the street ahead): a step further onto it, then on down the street
    const fwd = c ? { x: Math.sin(c.c.yaw), z: Math.cos(c.c.yaw) } : { x: -out.z, z: out.x };
    const a = { x: this.pos.x + out.x * 1.4, z: this.pos.z + out.z * 1.4 }, b = { x: a.x + fwd.x * 30, z: a.z + fwd.z * 30 };
    this.dropLeaver();
    this.leaver = { h, pos: { ...this.pos }, yaw: this.yaw, path: [a, b], walked: 0, unseen: 0, fade: 0, mats: [] };
    this.h = null; this.look = null; this.exit = null; this.seatAt = null; this.setPhase('gone');
    this.log.events.push('stepped-out');
  }
  /** The person who got out walks on along the pavement; they fade only once well away from the camera or out of its view, after a few metres at least. */
  private stepLeaver(ctx: GameCtx, dt: number) {
    const L = this.leaver; if (!L) return;
    const to = L.path[0];
    if (to) {
      const dx = to.x - L.pos.x, dz = to.z - L.pos.z, d = Math.hypot(dx, dz), v = Math.min(d, AWAY * dt);
      if (d > 1e-3) { L.pos.x += (dx / d) * v; L.pos.z += (dz / d) * v; L.yaw = wrapNear(Math.atan2(dx, dz), L.yaw); }
      L.walked += v; this.log.awayWalked = L.walked;
      if (d - v < 0.1) L.path.shift();
    }
    L.h.group.position.set(L.pos.x, this.ground(L.pos.x, L.pos.z), L.pos.z); L.h.group.rotation.y = L.yaw;
    L.h.animate(dt, to ? AWAY : 0);
    const cam = ctx.camera, camDist = Math.hypot(cam.position.x - L.pos.x, cam.position.z - L.pos.z);
    cam.updateMatrixWorld(); this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const seen = this.frustum.containsPoint(this.v3.set(L.pos.x, 1, L.pos.z));
    L.unseen = seen ? 0 : L.unseen + dt;
    if (L.fade === 0 && L.walked > 8 && (camDist > 26 || L.unseen > 1 || !to)) {
      L.fade = 1e-4; this.log.leftAt = { walked: +L.walked.toFixed(1), camDist: +camDist.toFixed(1), seen };
      L.h.group.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { mat.transparent = true; L.mats.push(mat); } });
    }
    if (L.fade > 0) {
      L.fade += dt / 1.2;
      for (const m of L.mats) m.opacity = Math.max(0, 1 - L.fade);
      if (L.fade >= 1) this.dropLeaver();
    }
  }
  private dropLeaver() { const L = this.leaver; if (!L) return; L.h.group.removeFromParent(); L.h.dispose(); this.leaver = null; this.log.events.push('faded'); }

  /** The rear door swings toward its goal (src/transport/carCabin.ts draws it); its shut sound as it lands. */
  private stepDoor(dt: number) {
    const body = this.doorBody; if (!body) return;
    const was = this.doorK;
    this.doorK += Math.max(-dt / DOOR_S, Math.min(dt / DOOR_S, this.doorGoal - this.doorK));
    this.log.doorMax = Math.max(this.log.doorMax, this.doorK);
    setRearDoor(body, ease(this.doorK), this.side);
    if (was > 0 && this.doorK === 0) vehicleAudio.door(false);
    cabinView(body, this.doorSpec);
    if (this.doorK === 0 && this.doorGoal === 0 && !this.seatedIn) { this.doorBody = null; }
  }

  /** Longer than the ride should have taken (src/transport/vtcRules.ts rideLimitMs), counted from its acceptance. */
  private lateRide(t: VtcTrip) { return this.ctx.state.data.playedMs - t.acceptedMs > rideLimitMs(t); }
  private step(dt: number): boolean {
    const to = this.walkTo; if (!to) return true;
    const dx = to.x - this.pos.x, dz = to.z - this.pos.z, d = Math.hypot(dx, dz), v = Math.min(d, WALK * dt);
    if (d > 1e-3) { this.pos.x += (dx / d) * v; this.pos.z += (dz / d) * v; this.yaw = Math.atan2(dx, dz); }
    this.log.walked += v; this.log.maxStep = Math.max(this.log.maxStep, v);
    return d - v < 0.12;
  }
  private clearPerson() {
    if (this.h) {
      const c = this.seatedIn ? this.carOf(this.seatedIn) : null;
      if (c) holdCabin(c.c.v.body, 'vtc', false);
      this.h.group.removeFromParent(); this.h.dispose(); this.h = null;
    }
    if (this.doorBody) { setRearDoor(this.doorBody, 0, this.side); cabinView(this.doorBody, this.doorSpec); }
    this.doorK = 0; this.doorGoal = 0; this.doorBody = null;
    if (this.bubble) this.bubble.visible = false;
    this.phase = 'gone'; this.seatedIn = null; this.walkTo = null; this.exit = null; this.seatAt = null; this.look = null;
  }
  private speak(text: string) {
    this.bubbleTex?.dispose(); this.bubbleTex = callTexture(text);
    if (!this.bubble) { this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, depthWrite: false, transparent: true })); this.bubble.scale.set(1.9, 0.6, 1); this.ctx.extra.add(this.bubble); }
    else { (this.bubble.material as THREE.SpriteMaterial).map = this.bubbleTex; (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true; }
    if (!this.bubble.parent) this.ctx.extra.add(this.bubble);
    this.bubbleT = 5;
  }

  /** The way-finding pin: the passenger, then the destination (in any district: the goal line says which). Marked as a VTC job: green, the car, the kerb bay (src/ui/jobMarks.ts). */
  private guide() {
    const t = this.trip; if (!t) return null;
    if (t.stage === 'pickup') { const s = stopOf(t.pickup).car; return { name: `${t.passenger.name} · ${t.pickup.name}`, hub: t.from, x: s.x, z: s.z, yaw: s.yaw, job: 'vtc' as const, hint: this.ctx.world()?.id === t.from ? undefined : `🚘 ${t.passenger.name} t’attend à ${t.pickup.name} (${hubShort(t.from)})` }; }
    const s = stopOf(t.dropoff).car;
    return { name: `${t.dropoff.name} · dépose`, hub: t.to, x: s.x, z: s.z, yaw: s.yaw, job: 'vtc' as const, hint: this.ctx.world()?.id === t.to ? undefined : `🚘 ${t.passenger.name} à bord · ${t.dropoff.name}, ${hubShort(t.to)} : prends la route` };
  }

  debug(): Record<string, unknown> {
    return {
      vtc: {
        info: () => ({
          trip: this.trip ? { ...this.trip } : null, phase: this.phase,
          person: this.h ? { x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), seated: this.phase === 'seated', inCar: !!this.seatedIn, local: { ...this.local }, clip: this.h.clipName, side: this.side, seat: this.seatAt?.id ?? null, place: this.seatAt?.place ?? null } : null,
          leaver: this.leaver ? { x: +this.leaver.pos.x.toFixed(2), z: +this.leaver.pos.z.toFixed(2), walked: +this.leaver.walked.toFixed(1), fade: +this.leaver.fade.toFixed(2), clip: this.leaver.h.clipName } : null,
          door: { k: +this.doorK.toFixed(2), goal: this.doorGoal, cabin: this.doorBody ? cabinInfo(this.doorBody) : null },
          persons: this.countPersons(), state: { ...this.ctx.state.data.vtc, done: [...this.ctx.state.data.vtc.done] }, log: { ...this.log, events: [...this.log.events], phases: [...this.log.phases] },
        }),
        requests: () => { const w = this.ctx.world(); return w ? vtcRequests(w.id, this.ctx.day(), this.ctx.hour()) : []; },
        accept: (i: number) => { const w = this.ctx.world(); if (!w) return false; const r = vtcRequests(w.id, this.ctx.day(), this.ctx.hour())[i]; return r ? this.accept(r) : false; },
        stops: () => { const t = this.trip; return t ? { pickup: stopOf(t.pickup), dropoff: stopOf(t.dropoff) } : null; },
        cancel: () => this.cancel(),
        /** Checks: the passenger's and the driver's bodies, measured (skinned vertices) in their car's frame, against the car's cabin (src/transport/cabinFit.ts). */
        fit: () => {
          const c = this.car(); if (!c) return null;
          const fit = CABINS[c.c.spec.id], b = this.ctx.player.body();
          return {
            car: c.c.spec.id, cabin: fit ?? null, seeThrough: seeThroughOk(c.c.v.body), view: cabinInfo(c.c.v.body),
            passenger: this.h && this.seatedIn ? { ...boundsIn(this.h.group, c.c.v.body), scale: this.h.seatScale, seat: this.seatAt?.id } : null,
            driver: b && c.c.driving ? { ...boundsIn(b.group, c.c.v.body), scale: b.seatScale, body: b.body } : null,
          };
        },
        /** Checks: the car's frame on screen, for close-ups (the passenger's seat side). */
        carPose: () => { const c = this.car(); return c ? { x: c.c.x, z: c.c.z, yaw: c.c.yaw, id: c.c.spec.id, width: c.c.spec.width, length: c.c.spec.length } : null; },
      },
    };
  }
  /** How many VTC passengers exist in the scene (the checks: never two in the car, one more at most walking off after a drop-off). */
  private countPersons() { let n = 0; this.ctx.scene.traverse(o => { if (o === this.h?.group) n++; }); return n; }
}
const hubShort = (h: HubId) => HUB_NAMES[h].split(' · ')[0];
/** `a` turned by a whole number of turns to be nearest `ref` (no spin the long way round). */
const wrapNear = (a: number, ref: number) => a + Math.round((ref - a) / (Math.PI * 2)) * Math.PI * 2;
/** The skinned vertices of a body in a frame (checks): the top of the head, the soles, the sides. */
function boundsIn(o: THREE.Object3D, frame: THREE.Object3D) {
  o.updateMatrixWorld(true); frame.updateMatrixWorld(true);
  const inv = frame.matrixWorld.clone().invert(), v = new THREE.Vector3(), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  o.traverse(c => {
    const m = c as THREE.SkinnedMesh; if (!m.isMesh || !m.visible) return;
    const pos = m.geometry.getAttribute('position'); if (!pos) return;
    for (let i = 0; i < pos.count; i += 2) {
      if (m.isSkinnedMesh) m.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      mn[0] = Math.min(mn[0], v.x); mn[1] = Math.min(mn[1], v.y); mn[2] = Math.min(mn[2], v.z); mx[0] = Math.max(mx[0], v.x); mx[1] = Math.max(mx[1], v.y); mx[2] = Math.max(mx[2], v.z);
    }
  });
  const r = (a: number[]) => a.map(x => +x.toFixed(3));
  return { min: r(mn), max: r(mx), head: +mx[1].toFixed(3), soles: +mn[1].toFixed(3) };
}

export const vtc = new Vtc();
