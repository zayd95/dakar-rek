import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld, Interactable } from '../world/types';
import type { Affordance, Target, TargetSource } from '../interact/types';
import { shop } from '../activity/templates';
import * as P from '../activity/primitives';
import { buildVehicle } from '../actors/vehicleKit';
import { fcfa } from '../ui/hud';
import { Vehicle } from './vehicle';
import { PassengerCamera } from './camera';
import { RideCard } from './ui';
import { driveStep, newDriveState, type DriveState } from './drive';
import { motoSpec, jakartaSeed, MOTO_CATALOGUE } from './moto';
import { readOwned, writeOwned, parkOwned, owns } from './owned';
import { clearKerb } from './passengers';
import { transport } from './module';
import type { VehicleSpec } from './spec';

/**
 * Personal mobility, first step: the player's own Jakarta motorbike, on the same vehicle framework as the car rapide.
 * Bought at the « Motos · Garage Modou » corner in Pikine (shop recipe; price shown, then confirmed; paid once), it is
 * delivered at the kerb in front of the garage. Get on (« Monter sur la moto »), ride (stick: up accelerates, down
 * brakes then reverses, left / right steers; collisions with the walls, parked vehicles and the car rapides), get off
 * (« Descendre de la moto ») — it stays parked where you leave it, in that hub, across reloads.
 * Ownership is recorded through src/transport/owned.ts (save flag + counters) until the ownership lane's Asset store.
 */
const ID = MOTO_CATALOGUE.id;
const SPACE = (hub: string) => `${hub}:moto:jakarta`;
/** Where the dealer corner is: next to an existing place of a hub (offsets in metres along the street). */
const DEALER = { hub: 'pikine' as const, near: 'pikine:garage:31', name: 'Motos · Garage Modou' };

interface Dealer { group: THREE.Group; x: number; z: number; delivery: { x: number; z: number; yaw: number }; sign: THREE.CanvasTexture | null }

export class MotoModule implements GameModule {
  readonly name = 'moto';
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private moto: Vehicle | null = null;
  private spec: VehicleSpec | null = null;
  private st: DriveState = newDriveState(0, 0, 0);
  private driving = false;
  /** « Descendre » asked while moving: brake, then get off. */
  private leaving = false;
  private cam = new PassengerCamera();
  private card: RideCard | null = null;
  private dealer: Dealer | null = null;
  private cardT = 0;
  private camMs = 0;
  private obst: { x: number; z: number; yaw: number; hl: number; hw: number }[] = [];
  private bumps = 0;
  /** Purchases made (debug: the checks verify it is paid once). */
  private bought = 0;

  init(ctx: GameCtx) {
    this.ctx = ctx;
    const ui = document.getElementById('ui');
    if (ui) this.card = new RideCard(ui, 'moto-card');
    ctx.interactions.add(this.targets);
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.clear();
    this.hub = hub;
    this.spec = motoSpec();
    if (hub.id === DEALER.hub) this.buildDealer(ctx, hub);
    const own = readOwned(ctx.state.data, ID);
    if (own && own.hub === hub.id) this.spawn(own.x, own.z, own.yaw);
  }

  spaceChanged(_ctx: GameCtx, _space: string) { /* the motorbike stays where it is parked */ }

  /** On the motorbike: its own interaction space (no shop counters while riding)… */
  space(): string | null { return this.driving && this.hub ? SPACE(this.hub.id) : null; }
  /** …but the player stays visible to the street. */
  presenceSpace(): string | null { return this.driving ? 'street' : null; }

  /** Saved while riding: the motorbike is parked where it is, the player standing beside it. */
  safePlace(): { x: number; z: number; yaw: number } | null {
    if (!this.driving || !this.hub || !this.moto) return null;
    parkOwned(this.ctx.state.data, ID, this.hub.id, this.st.x, this.st.z, this.st.yaw);
    const p = this.beside();
    return { x: p.x, z: p.z, yaw: this.st.yaw };
  }

  update(ctx: GameCtx, dt: number) {
    const m = this.moto; if (!m || !this.spec?.drive) return;
    if (!this.driving) return;
    if (ctx.player.seated()?.id !== m.driverSeat.id) { this.getOff(false); return; }   // taken off by a door, a trip…
    const mv = ctx.mode() === 'play' ? ctx.input.move() : { x: 0, y: 0 };
    const input = this.leaving ? { throttle: this.st.speed > 0.3 ? -1 : this.st.speed < -0.3 ? 1 : 0, steer: 0 } : { throttle: mv.y, steer: mv.x };
    transport.obstacles(this.obst);
    const v0 = Math.abs(this.st.speed);
    const hit = driveStep(this.st, input, this.spec.drive, dt, this.blocked);
    if (hit && v0 > 0.5) this.bumps++;
    m.place(this.st.x, this.st.z, this.st.yaw, Math.abs(this.st.speed), this.st.accel, this.st.odo, dt);
    if (this.leaving && Math.abs(this.st.speed) < 0.3) this.getOff(true);
    this.cardT -= dt;
    if (this.cardT <= 0) { this.cardT = 0.25; this.refreshCard(); }
  }

  camera(ctx: GameCtx, dt: number, drag: { yaw: number; pitch: number }): boolean {
    const m = this.moto; if (!m || !this.driving || !this.cam.active || !this.spec) return false;
    const t = performance.now(), real = this.camMs ? Math.min(1, (t - this.camMs) / 1000) : dt; this.camMs = t;
    this.cam.update(Math.max(dt, real), ctx.camera, m.pose, m.bounce, this.spec.cameras[this.cam.view % this.spec.cameras.length], drag, this.hub?.colliders ?? []);
    return true;
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    this.ctx = ctx;
    return {
      moto: {
        info: () => ({ owned: owns(ctx.state.data, ID), record: readOwned(ctx.state.data, ID), here: !!this.moto, driving: this.driving, x: this.st.x, z: this.st.z, yaw: this.st.yaw, speed: this.st.speed, bumps: this.bumps, bought: this.bought,
          dealer: this.dealer ? { x: this.dealer.x, z: this.dealer.z, delivery: this.dealer.delivery } : null, space: this.space(), presence: this.presenceSpace(), camera: this.cam.active }),
        card: () => this.card?.text ?? '',
        /** Checks: put the motorbike (and its rider) at a spot, stopped. */
        place: (x: number, z: number, yaw: number) => { if (!this.moto) return; this.st.x = x; this.st.z = z; this.st.yaw = yaw; this.st.speed = 0; this.moto.place(x, z, yaw, 0, 0, this.st.odo, 0); },
      },
    };
  }

  // ---------------------------------------------------------------- the dealer corner
  private buildDealer(ctx: GameCtx, hub: HubWorld) {
    const garage = hub.interactables.find((i: Interactable) => i.id === DEALER.near);
    if (!garage) return;
    // the garage's pavement runs along x (south row of its block, facing the road at z ≈ 0): the corner is at its east
    // end, the motorbike is delivered at the kerb in front of the garage
    const x = garage.x + 8.5, z = garage.z, road = Math.round(z / 60) * 60, side = Math.sign(z - road) || -1;
    const kerbZ = road + side * 4.3;
    const g = new THREE.Group(); g.name = 'moto:dealer';
    // two display motorbikes nose to the road, a sign on a pole
    // (on the pavement, pushed back from the kerb so the road stays clear)
    const zd = z + side * 0.5;
    for (const dx of [-1.6, 1.6]) {
      const b = buildVehicle('moto', { seed: jakartaSeed() + (dx > 0 ? 7 : 3), driver: false, passengers: false });
      b.group.position.set(x + dx, 0.12, zd); b.group.rotation.y = side > 0 ? Math.PI : 0; g.add(b.group);
      hub.colliders.push({ x0: x + dx - 0.45, x1: x + dx + 0.45, z0: zd - 0.9, z1: zd + 0.9, h: 1.1 });
    }
    const sign = signTexture(DEALER.name);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.8, 0.08), new THREE.MeshLambertMaterial({ color: 0x3b3f46 }));
    pole.position.set(x + 3.2, 1.52, z + side * 0.6); g.add(pole);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.05), new THREE.MeshLambertMaterial({ map: sign }));
    plate.position.set(x + 3.2, 2.75, z + side * 0.6); g.add(plate);
    ctx.extra.add(g);
    const delivery = { x: garage.x + 1.5, z: kerbZ, yaw: Math.PI / 2 };
    clearKerb(ctx.extra, hub.colliders, [{ x: delivery.x, z: delivery.z, dx: 1, dz: 0, rx: 0, rz: side, offset: 4.3, from: -10, to: 6 }]);
    this.dealer = { group: g, x, z, delivery, sign };
    ctx.places.add(shop({
      id: 'moto:dealer', name: DEALER.name, space: 'street', catalogue: 'motos',
      anchors: [{ id: 'till', kind: 'shop', x, z: z - side * 0.2, y: 2.2, radius: 2.8, bias: -0.2 }],
    }, { browse: () => this.openCatalogue() }));
  }

  private openCatalogue() {
    const ctx = this.ctx, mine = owns(ctx.state.data, ID);
    ctx.menu(DEALER.name, 'Le prix est affiché avant de confirmer.', [{
      icon: '🏍️', label: MOTO_CATALOGUE.name, detail: mine ? 'Elle est déjà à toi' : MOTO_CATALOGUE.detail, right: fcfa(MOTO_CATALOGUE.price), disabled: mine,
      onPick: () => this.confirm(),
    }]);
  }

  private confirm() {
    const ctx = this.ctx, can = ctx.state.canAfford(MOTO_CATALOGUE.price);
    ctx.menu(`Acheter la ${MOTO_CATALOGUE.name} ?`, `Prix : ${fcfa(MOTO_CATALOGUE.price)} · Ton argent : ${fcfa(ctx.state.wallet)}`, [
      { icon: '✅', label: 'Confirmer l’achat', right: '−' + fcfa(MOTO_CATALOGUE.price), detail: can ? 'Livrée devant le garage, prête à rouler' : 'Pas assez d’argent', disabled: !can, onPick: () => this.buy() },
      { icon: '↩️', label: 'Pas maintenant', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }

  /** Pays once through the universal runner (verb buy, wallet line « Moto Jakarta 125 · Motos · Garage Modou »). */
  private buy() {
    const ctx = this.ctx;
    ctx.hud.closeModal(); ctx.setMode('play');
    if (owns(ctx.state.data, ID) || !this.dealer || !this.hub) return;
    const d = this.dealer, hub = this.hub;
    ctx.activities.start(P.buy({ id: 'moto_jakarta', label: MOTO_CATALOGUE.name, price: MOTO_CATALOGUE.price, then: () => {
      if (owns(ctx.state.data, ID)) return;
      this.bought++;
      writeOwned(ctx.state.data, { id: ID, kind: 'moto', seed: jakartaSeed(), hub: hub.id, x: d.delivery.x, z: d.delivery.z, yaw: d.delivery.yaw, price: MOTO_CATALOGUE.price, at: Date.now() });
      ctx.state.count('vehicules');
      this.spawn(d.delivery.x, d.delivery.z, d.delivery.yaw);
      ctx.toast('Ta moto t’attend au bord de la route. Jërëjëf !');
      ctx.save();
    } }), { place: DEALER.name });
  }

  // ---------------------------------------------------------------- the motorbike
  private spawn(x: number, z: number, yaw: number) {
    if (!this.spec || !this.hub) return;
    this.moto?.dispose();
    const m = new Vehicle(this.spec, SPACE(this.hub.id), 1, jakartaSeed());
    m.group.name = 'moto:mine';
    this.st = newDriveState(x, z, yaw);
    m.place(x, z, yaw, 0, 0, 0, 0);
    this.ctx.seats.add(m.driverSeat);
    this.ctx.extra.add(m.group);
    this.moto = m;
  }

  private getOn() {
    const ctx = this.ctx, m = this.moto; if (!m || this.driving || ctx.activities.running) return;
    ctx.player.standUp(true);
    m.place(this.st.x, this.st.z, this.st.yaw, 0, 0, this.st.odo, 0);
    ctx.player.sit(m.driverSeat);
    if (ctx.player.seated()?.id !== m.driverSeat.id) return;
    this.driving = true; this.leaving = false; this.st.speed = 0; this.st.steer = 0;
    this.cam.begin(ctx.camera, m.pose); this.camMs = 0;
    ctx.toast('↑ accélérer · ↓ freiner · ← → tourner');
    this.refreshCard();
  }

  /** Off the motorbike, on its left (or right) side; it stays parked there. `normal`: the player chose to get off. */
  private getOff(normal: boolean) {
    const ctx = this.ctx, m = this.moto; if (!m || !this.driving || !this.hub) return;
    this.driving = false; this.leaving = false;
    if (ctx.player.seated()?.id === m.driverSeat.id) ctx.player.standUp(true);
    this.st.speed = 0;
    m.place(this.st.x, this.st.z, this.st.yaw, 0, 0, this.st.odo, 0);
    parkOwned(ctx.state.data, ID, this.hub.id, this.st.x, this.st.z, this.st.yaw);
    this.cam.end();
    if (normal || !ctx.inside()) { const p = this.beside(); ctx.player.place(p.x, p.z, this.st.yaw); }
    this.card?.show(null);
    if (normal) ctx.toast('Moto garée.');
    ctx.save();
  }

  /** Where the rider stands after getting off: beside the motorbike, out of any wall. */
  private beside() {
    const yaw = this.st.yaw, lx = Math.cos(yaw), lz = -Math.sin(yaw);               // the motorbike's left (+x local)
    for (const k of [0.85, -0.85, 1.3, -1.3]) {
      const x = this.st.x + lx * k, z = this.st.z + lz * k;
      if (!this.blocked(x, z, 0.3)) return { x, z };
    }
    return { x: this.st.x - Math.sin(yaw) * 1.4, z: this.st.z - Math.cos(yaw) * 1.4 };
  }

  /** Solid things for the motorbike: walls and parked vehicles (colliders), stairs and terraces, the hub's edge, the car rapides. */
  private blocked = (x: number, z: number, r: number): boolean => {
    const w = this.hub; if (!w) return false;
    const b = w.bounds;
    if (x < b.x0 + r || x > b.x1 - r || z < b.z0 + r || z > b.z1 - r) return true;
    for (const c of w.colliders) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    if (w.heightAt(x, z) > 0.3) return true;
    for (const o of this.obst) {
      const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < o.hw + r && Math.abs(lz) < o.hl + r) return true;
    }
    return false;
  };

  private refreshCard() {
    if (!this.card) return;
    if (!this.driving) { this.card.show(null); return; }
    const kmh = Math.round(Math.abs(this.st.speed) * 3.6);
    this.card.show({ num: '🏍️', title: `${MOTO_CATALOGUE.name} · ${kmh} km/h`, sub: this.leaving ? 'Tu t’arrêtes pour descendre' : '↑ accélérer · ↓ freiner · ← → tourner' });
  }

  private clear() {
    if (this.driving) { this.driving = false; this.cam.end(); }
    this.moto?.dispose(); this.moto = null;
    if (this.dealer) {
      this.dealer.group.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh && !mm.userData.shared) { mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); } });
      this.dealer.group.removeFromParent(); this.dealer.sign?.dispose(); this.dealer = null;
    }
    this.card?.show(null);
    this.hub = null;
  }

  // ---------------------------------------------------------------- targets
  private parkedAff: Affordance[] = [];
  private parkedTarget: Target = { id: 'moto:parked', name: 'Ta moto Jakarta', kind: 'vehicle', space: 'street', x: 0, z: 0, y: 1.6, radius: 2.2, bias: -0.2, affordances: () => this.parkedAffordances() };
  private rideAff: Affordance[] = [];
  private rideTarget: Target = { id: 'moto:ride', name: 'Moto Jakarta', kind: 'self', space: '', x: 0, z: 0, radius: 2, bias: -1, affordances: () => this.rideAffordances() };

  private readonly targets: TargetSource = {
    name: 'moto',
    collect: (space, x, z, out) => {
      const m = this.moto; if (!m || !this.hub) return;
      if (this.driving) { if (space === SPACE(this.hub.id)) { const t = this.rideTarget; t.space = space; t.x = x; t.z = z; out.push(t); } return; }
      if (space !== 'street' || Math.abs(this.st.x - x) > 2.2 || Math.abs(this.st.z - z) > 2.2) return;
      const t = this.parkedTarget; t.x = this.st.x; t.z = this.st.z; out.push(t);
    },
  };

  private parkedAffordances(): Affordance[] {
    if (!this.parkedAff.length) this.parkedAff = [{ id: 'monter', verb: 'drive', label: 'Monter sur la moto', icon: '🏍️', run: () => this.getOn() }];
    this.parkedAff[0].disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : null;
    return this.parkedAff;
  }
  private rideAffordances(): Affordance[] {
    if (!this.rideAff.length) this.rideAff = [
      { id: 'descendre', verb: 'alight', label: 'Descendre de la moto', icon: '🛑', run: () => { if (Math.abs(this.st.speed) < 0.3) this.getOff(true); else { this.leaving = true; this.refreshCard(); } } },
      { id: 'vue', verb: 'use', label: 'Changer de vue', icon: '🎥', run: () => this.cam.next(this.spec?.cameras.length ?? 1) },
    ];
    this.rideAff[0].label = this.leaving ? 'Tu t’arrêtes…' : 'Descendre de la moto';
    return this.rideAff;
  }
}

function signTexture(text: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 128;
  const c = cv.getContext('2d'); if (!c) return null;
  c.fillStyle = '#c0392b'; c.fillRect(0, 0, 384, 128);
  c.fillStyle = '#f4c20d'; c.fillRect(0, 92, 384, 36);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '900 40px system-ui, sans-serif'; c.fillText('MOTOS JAKARTA', 192, 48, 360);
  c.fillStyle = '#1b2a7a'; c.font = '800 22px system-ui, sans-serif'; c.fillText(text.replace('Motos · ', ''), 192, 111, 360);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const moto = new MotoModule();
