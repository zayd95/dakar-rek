import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { HubId, VtcTrip } from '../core/types';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { sitOriginY } from '../interact/seats';
import { fcfa } from '../ui/hud';
import { say } from '../i18n/wolof';
import { HUB_NAMES } from '../world/content';
import { phoneHooks } from '../ui/phoneHooks';
import { practise } from '../economy/polyvalence';
import { addMissionGuide } from '../game/missionGuide';
import { callTexture } from './vehicle';
import { CARS } from './fleet';
import { atStop, rideLimitMs, stopOf, tripOf, vtcRequests, type VtcRequest } from './vtcRules';
import { streak } from '../economy/streakModule';
import { creditClock } from '../economy/creditModule';
import { fareShare, openLoans } from '../economy/credit';

/**
 * « Courses VTC » (inspired by the ride apps of Dakar; no real service, no real money): the phone lists rides asked for in this district; one accepted,
 * the player drives their own car (bought cash or on credit) to the passenger, stops at the kerb, and the passenger — a real person standing there — walks
 * to the car and sits in its back seat; driven to the destination, across districts on the roads if need be, they get out and walk off, and the fare is
 * paid once, on arrival (one wallet line; the ride's id remembered so a reload never pays it twice).
 *
 * The ride in hand is saved (`vtc.active`): a reload or a crossing into the next district finds the passenger where they were — waiting on the pavement, or
 * sitting in the car (one person, rebuilt with the car, never a copy left behind). The rules: src/transport/vtcRules.ts.
 */
const LOOKS: PersonLook[] = [
  { skin: 0x5b3420, style: 'tee', top: 0x2f6fa8, bottom: 0x22252b, hat: null, shoes: 0x1a1a1a },
  { skin: 0x6b3f25, style: 'dress', top: 0xd66532, bottom: 0xd66532, female: true, pattern: 'wax', accent: 0xf2d16b, hat: 'headwrap', hatColor: 0xe8b734 },
  { skin: 0x4e2e1c, style: 'boubou', top: 0xeee8da, bottom: 0xeee8da, hat: 'kufi', hatColor: 0xf2f2ec },
  { skin: 0x7a4a2c, style: 'tee', top: 0xc2417f, bottom: 0x2b3a55, female: true, hair: 'puff' },
  { skin: 0x5b3420, style: 'tee', top: 0xf1f1ee, bottom: 0x3a4a5c, hat: null, beard: 0x1a1410 },
  { skin: 0x633a24, style: 'dress', top: 0x2e8b57, bottom: 0x2e8b57, female: true, pattern: 'bazin', hat: 'headwrap', hatColor: 0x2e8b57 },
];
type Phase = 'wait' | 'walk' | 'seated' | 'out' | 'gone';

class Vtc implements GameModule {
  readonly name = 'vtc';
  private ctx!: GameCtx;
  private h: Humanoid | null = null;
  private phase: Phase = 'gone';
  private pos = { x: 0, z: 0 }; private yaw = 0;
  private walkTo: { x: number; z: number } | null = null; private walkT = 0;
  private seatedIn: THREE.Object3D | null = null;
  private bubble: THREE.Sprite | null = null; private bubbleT = 0; private bubbleTex: THREE.CanvasTexture | null = null;
  private log = { boarded: 0, alighted: 0, paid: 0, rebuilt: 0, walked: 0, maxStep: 0, events: [] as string[] };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    phoneHooks.openVtc = () => this.openApp();
    addMissionGuide(() => this.guide());
  }
  private get trip(): VtcTrip | null { return this.ctx.state.data.vtc.active; }

  hubLoaded(ctx: GameCtx, _hub: HubWorld) { this.ctx = ctx; this.clear(); }
  private clear() {
    if (this.h) { this.h.group.removeFromParent(); this.h.dispose(); this.h = null; }
    if (this.bubble) { this.bubble.removeFromParent(); (this.bubble.material as THREE.SpriteMaterial).dispose(); this.bubble = null; }
    this.bubbleTex?.dispose(); this.bubbleTex = null;
    this.phase = 'gone'; this.walkTo = null; this.seatedIn = null;
  }

  /** The player's car in this district that the ride uses: the one driven, else (a ride in hand) the one the passenger sits in. */
  private car() {
    const t = this.trip;
    for (const m of CARS) { const c = m.carNow(); if (c?.driving) return { m, c }; }
    if (t?.asset) for (const m of CARS) if (m.def.asset === t.asset) { const c = m.carNow(); if (c) return { m, c }; }
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
    this.ctx.state.data.vtc.active = null; this.log.events.push(`cancel:${t.id}`);
    this.ctx.toast('Course annulée. Rien n’est payé.'); this.ctx.save();
  }
  private stopped() { const c = this.car(); return !c || Math.abs(c.c.speed) < 0.6; }

  // ---------------------------------------------------------------- the passenger
  private ensurePerson() {
    if (this.h || !humanoidReady()) return this.h;
    const t = this.trip!; this.h = new Humanoid(LOOKS[t.passenger.seed % LOOKS.length]); this.h.hold = 'Idle';
    this.ctx.extra.add(this.h.group); return this.h;
  }
  private seatSpec(spec: { seats: { id: string; x: number; y: number; z: number; yaw: number }[] }) { return spec.seats.find(s => s.id === 'rearR') ?? spec.seats.find(s => s.id === 'front') ?? spec.seats[0]; }

  update(ctx: GameCtx, dt: number) {
    const t = this.trip, w = ctx.world();
    if (!t || !w) { if (this.h) this.clearPerson(); return; }
    const here = (h: HubId) => w.id === h;
    if (t.stage === 'pickup') {
      if (!here(t.from)) { if (this.h) this.clearPerson(); return; }
      const stop = stopOf(t.pickup);
      const h = this.ensurePerson(); if (!h) return;
      if (this.phase === 'gone') { this.phase = 'wait'; this.pos = { ...stop.wait }; this.yaw = Math.atan2(-stop.out.x, -stop.out.z); this.speak(`${t.passenger.name} · VTC ?`); }
      const c = this.car();
      if (this.phase === 'wait' && c && c.c.driving && atStop(c.c, stop.car)) {
        // the passenger walks to the car's right rear door, on the pavement side
        const door = this.doorOf(c.c);
        this.phase = 'walk'; this.walkTo = door; this.walkT = 0;
        this.speak(`${say('Salaam aleekum')} !`);
      }
      if (this.phase === 'walk') {
        if (!c || Math.abs(c.c.speed) > 0.8) { this.phase = 'wait'; this.walkTo = null; this.speak('Attends-moi !'); }
        else { this.walkTo = this.doorOf(c.c); if (this.step(dt)) this.board(c.m.def.asset, c.c); }
      }
    } else if (t.stage === 'aboard') {
      const c = this.car();
      if (c && c.m.def.asset === t.asset) {
        if (!this.seatedIn || this.seatedIn !== c.c.v.body) this.seat(c.c);
        if (here(t.to) && c.c.driving && atStop(c.c, stopOf(t.dropoff).car)) this.alight(true);
      } else if (this.h && this.phase === 'seated') this.clearPerson();          // the car is not in this district (being swapped): the passenger comes with it
    }
    if (this.phase === 'out') { if (this.step(dt) || this.walkT > 9) this.clearPerson(); }
    const h = this.h;
    if (h) {
      h.animate(dt, this.phase === 'walk' || this.phase === 'out' ? 1.3 : 0);
      if (this.phase !== 'seated') { h.group.position.set(this.pos.x, 0.12, this.pos.z); h.group.rotation.y = this.yaw; }
    }
    this.bubbleT = Math.max(0, this.bubbleT - dt); if (this.bubble) { this.bubble.visible = this.bubbleT > 0 && this.phase !== 'seated'; this.bubble.position.set(this.pos.x, 2.3, this.pos.z); }
  }
  /** Where the passenger stands to get in: beside the rear door on the right (the pavement side when driving on the right). */
  private doorOf(c: { x: number; z: number; yaw: number; spec: { width: number; seats: { id: string; x: number; y: number; z: number; yaw: number }[] } }) {
    const s = this.seatSpec(c.spec), lx = -(c.spec.width / 2 + 0.55), lz = s.z, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    return { x: c.x + cy * lx + sy * lz, z: c.z - sy * lx + cy * lz };
  }
  private step(dt: number): boolean {
    const to = this.walkTo; if (!to) return true;
    this.walkT += dt;
    const dx = to.x - this.pos.x, dz = to.z - this.pos.z, d = Math.hypot(dx, dz), v = Math.min(d, 1.3 * dt);
    if (d > 1e-3) { this.pos.x += (dx / d) * v; this.pos.z += (dz / d) * v; this.yaw = Math.atan2(dx, dz); }
    this.log.walked += v; this.log.maxStep = Math.max(this.log.maxStep, v);
    return d - v < 0.12;
  }
  /** In: the seat is taken (the vehicle's seat registry), the person sits in it and rides with the car. Saved. */
  private board(asset: string, c: { v: { body: THREE.Object3D; setPassengers(ids: readonly string[]): void }; spec: { seats: { id: string; x: number; y: number; z: number; yaw: number }[] } }) {
    const t = this.trip!; const seat = this.seatSpec(c.spec);
    t.stage = 'aboard'; t.asset = asset; t.seat = seat.id;
    this.log.boarded++; this.log.events.push(`board:${t.id}:${asset}:${seat.id}`);
    this.seat(c as never);
    this.ctx.toast(`${t.passenger.name} monte à l’arrière : « ${say('Salaam aleekum')} ! ${t.dropoff.name}, ${hubShort(t.to)}, s’il te plaît. »`);
    this.ctx.save();
  }
  private seat(c: { v: { body: THREE.Object3D; setPassengers(ids: readonly string[]): void }; spec: { seats: { id: string; x: number; y: number; z: number; yaw: number }[] } }) {
    const h = this.ensurePerson(); if (!h) return;
    const s = this.seatSpec(c.spec);
    h.group.removeFromParent(); c.v.body.add(h.group);
    h.group.position.set(s.x, sitOriginY({ top: s.y }), s.z); h.group.rotation.set(0, s.yaw, 0);
    h.hold = 'Sit'; this.phase = 'seated'; this.seatedIn = c.v.body;
    c.v.setPassengers([s.id]);
    if (this.log.boarded) this.log.rebuilt++;
  }
  /** Out: at the destination (paid once) or on a cancel (nothing paid). The person steps out on the pavement side and walks away. */
  private alight(arrived: boolean) {
    const t = this.trip!, c = this.car(), h = this.h;
    if (c) { c.c.v.setPassengers([]); const d = this.doorOf(c.c); this.pos = { ...d }; }
    if (h) { h.group.removeFromParent(); this.ctx.extra.add(h.group); h.hold = 'Idle'; }
    this.seatedIn = null; this.phase = 'out'; this.walkT = 0;
    const stop = stopOf(arrived ? t.dropoff : { x: this.pos.x, z: this.pos.z });
    this.walkTo = { x: stop.wait.x + stop.out.x * 3, z: stop.wait.z + stop.out.z * 3 };
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
  /** Longer than the ride should have taken (src/transport/vtcRules.ts rideLimitMs), counted from its acceptance. */
  private lateRide(t: VtcTrip) { return this.ctx.state.data.playedMs - t.acceptedMs > rideLimitMs(t); }
  private clearPerson() {
    if (this.h) { this.h.group.removeFromParent(); this.h.dispose(); this.h = null; }
    if (this.bubble) this.bubble.visible = false;
    this.phase = 'gone'; this.seatedIn = null; this.walkTo = null;
  }
  private speak(text: string) {
    this.bubbleTex?.dispose(); this.bubbleTex = callTexture(text);
    if (!this.bubble) { this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, depthWrite: false, transparent: true })); this.bubble.scale.set(1.9, 0.6, 1); this.ctx.extra.add(this.bubble); }
    else { (this.bubble.material as THREE.SpriteMaterial).map = this.bubbleTex; (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true; }
    this.bubbleT = 5;
  }

  /** The way-finding pin: the passenger, then the destination (in any district: the goal line says which). */
  private guide() {
    const t = this.trip; if (!t) return null;
    if (t.stage === 'pickup') { const s = stopOf(t.pickup).car; return { name: `${t.passenger.name} · ${t.pickup.name}`, hub: t.from, x: s.x, z: s.z, hint: this.ctx.world()?.id === t.from ? undefined : `🚖 ${t.passenger.name} t’attend à ${t.pickup.name} (${hubShort(t.from)})` }; }
    const s = stopOf(t.dropoff).car;
    return { name: `${t.dropoff.name} · dépose`, hub: t.to, x: s.x, z: s.z, hint: this.ctx.world()?.id === t.to ? undefined : `🚖 ${t.passenger.name} à bord · ${t.dropoff.name}, ${hubShort(t.to)} : prends la route` };
  }

  debug(): Record<string, unknown> {
    return {
      vtc: {
        info: () => ({ trip: this.trip ? { ...this.trip } : null, phase: this.phase, person: this.h ? { x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), seated: this.phase === 'seated', inCar: !!this.seatedIn } : null, persons: this.countPersons(), state: { ...this.ctx.state.data.vtc, done: [...this.ctx.state.data.vtc.done] }, log: { ...this.log, events: [...this.log.events] } }),
        requests: () => { const w = this.ctx.world(); return w ? vtcRequests(w.id, this.ctx.day(), this.ctx.hour()) : []; },
        accept: (i: number) => { const w = this.ctx.world(); if (!w) return false; const r = vtcRequests(w.id, this.ctx.day(), this.ctx.hour())[i]; return r ? this.accept(r) : false; },
        stops: () => { const t = this.trip; return t ? { pickup: stopOf(t.pickup), dropoff: stopOf(t.dropoff) } : null; },
        cancel: () => this.cancel(),
      },
    };
  }
  /** How many VTC passengers exist in the scene (the checks: never two). */
  private countPersons() { let n = 0; this.ctx.scene.traverse(o => { if (o === this.h?.group) n++; }); return n; }
}
const hubShort = (h: HubId) => HUB_NAMES[h].split(' · ')[0];

export const vtc = new Vtc();
