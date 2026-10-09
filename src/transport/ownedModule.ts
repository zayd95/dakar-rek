import * as THREE from 'three';
import type { HubId } from '../core/types';
import type { GameCtx, GameModule } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import type { Affordance, Target, TargetSource } from '../interact/types';
import { shop } from '../activity/templates';
import * as P from '../activity/primitives';
import { buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { fcfa } from '../ui/hud';
import { Vehicle } from './vehicle';
import { PassengerCamera } from './camera';
import { RideCard } from './ui';
import { driveStep, newDriveState, type DriveState } from './drive';
import { readOwned, writeOwned, parkOwned, owns, OWNED_KIND, type OwnedId } from './owned';
import { clearKerb, type KerbZone } from './passengers';
import { GRID, roadCentre } from './lines';
import { transport } from './module';
import type { DriveSpec, VehicleSpec } from './spec';

/**
 * A vehicle the player owns and drives (the Jakarta motorbike, the used saloon…), on the same vehicle framework as the
 * car rapide. One instance per catalogue item, described by an `OwnedDef`:
 *   - a dealer corner in one hub (shop recipe: « Voir les articles » → the price → « Confirmer l'achat »; paid once
 *     through the universal runner), the vehicle delivered at the kerb;
 *   - « Monter » on the driver seat → drive mode (stick: up accelerates, down brakes then reverses, left / right
 *     steers; walls, parked vehicles, stairs, the car rapides and the hub's edge stop it), the kit's camera anchors;
 *   - « Descendre / Sortir » → parked where it is (a solid footprint the player walks around), the player beside it
 *     (a car: on the pavement side), saved in that hub across reloads (a reload while driving parks it there).
 * Ownership is recorded through src/transport/owned.ts (save flag + counters → `toAsset()`).
 */
export interface Spot { x: number; z: number; yaw: number }
export interface DealerSite {
  /** Where the seller stands (the shop anchor). */
  counter: { x: number; z: number };
  /** The sign on its pole (the plate faces ±z at yaw 0; `w` m wide, default 1.5). */
  sign: Spot & { w?: number };
  /** Vehicles on display (other kit seeds: other colours). */
  displays: (Spot & { seed: number })[];
  /** Where the bought vehicle waits. */
  delivery: Spot;
  /** Kerb kept clear of the hub's parked vehicles. */
  kerb: KerbZone[];
  /** A small desk at the counter (the car dealer). */
  desk?: Spot;
}

export interface OwnedDef {
  /** Module name and debug key (`__dakar.moto`, `__dakar.car`). */
  key: string;
  id: OwnedId;
  item: { name: string; price: number; detail: string };
  icon: string;
  kit: VehicleKind;
  seed(): number;
  spec(): VehicleSpec;
  /** Height of the parked footprint (m). */
  height: number;
  /** Interaction space while driving: `<hub>:<space>`. */
  space: string;
  dealer: {
    hub: HubId; name: string; catalogue: string;
    site(hub: HubWorld): DealerSite | null;
    sign: { bg: string; band: string; title: string; sub: string; subColor: string };
  };
  text: {
    /** Name of the parked vehicle as a target (« Ta moto Jakarta »). */
    mine: string;
    getOn: string; getOff: string;
    /** Title of the confirmation (« Acheter la … ? ») and its line under « Confirmer l'achat ». */
    confirm: string; delivered: string;
    /** Toasts: just bought, parked. */
    welcome: string; parked: string;
    /** In the catalogue once bought. */
    owned: string;
  };
  /** Getting off: on the left (a motorbike) or on the pavement side (a car: away from the traffic). */
  exit: 'left' | 'pavement';
  /** How close to the body « Monter » is offered (m). */
  reach: number;
}

const HINT = '↑ accélérer · ↓ freiner · ← → tourner';

/** Distance from (x, z) to the nearest road centre line (pavements are 5–7 m from it). */
export function roadDistance(x: number, z: number): number {
  let d = Infinity;
  for (let k = 0; k <= GRID.nb; k++) { const c = roadCentre(k); d = Math.min(d, Math.abs(x - c), Math.abs(z - c)); }
  return d;
}

/**
 * Solid boxes of a parked vehicle: one square around each of its front, middle and back (so a vehicle parked at an
 * angle does not block a whole axis-aligned rectangle around it).
 */
export function footprint(d: DriveSpec, x: number, z: number, yaw: number, h: number): Collider[] {
  const l = Math.max(0, d.halfLength - d.halfWidth), r = d.halfWidth, fx = Math.sin(yaw), fz = Math.cos(yaw);
  return [-l, 0, l].map(t => ({ x0: x + fx * t - r, x1: x + fx * t + r, z0: z + fz * t - r, z1: z + fz * t + r, h }));
}

/**
 * A dealer on the pavement of the road nearest to (px, pz): the counter on the pavement, the vehicles at the kerb
 * facing the way the traffic goes on that side (Senegal drives on the right). `along` distances follow that heading.
 */
export function kerbDealer(px: number, pz: number, o: { displays: { along: number; seed: number }[]; delivery: number; sign: number; desk?: boolean; clear: [number, number] }): DealerSite {
  const near = (v: number) => roadCentre(Math.max(0, Math.min(GRID.nb, Math.round((v - roadCentre(0)) / GRID.pitch))));
  const rx = near(px), rz = near(pz);
  const alongZ = Math.abs(px - rx) <= Math.abs(pz - rz);                   // the nearest road is a line x = rx
  const road = alongZ ? rx : rz, side = Math.sign((alongZ ? px : pz) - road) || -1;
  const yaw = alongZ ? (side < 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
  const fx = Math.sin(yaw), fz = Math.cos(yaw), nx = alongZ ? side : 0, nz = alongZ ? 0 : side;
  const bx = alongZ ? road : px, bz = alongZ ? pz : road;
  const at = (along: number, lateral: number, y = yaw): Spot => ({ x: bx + fx * along + nx * lateral, z: bz + fz * along + nz * lateral, yaw: y });
  const delivery = at(o.delivery, 4.3);
  const counter = at(0, 6.2);
  return {
    counter: { x: counter.x, z: counter.z },
    sign: { ...at(o.sign, 6.6, alongZ ? Math.PI / 2 : 0), w: 2.4 },
    displays: o.displays.map(d => ({ ...at(d.along, 4.3), seed: d.seed })),
    delivery,
    kerb: [{ x: delivery.x, z: delivery.z, dx: fx, dz: fz, rx: nx, rz: nz, offset: 4.3, from: o.clear[0] - o.delivery, to: o.clear[1] - o.delivery }],
    desk: o.desk ? at(0, 6.75, yaw + Math.PI / 2) : undefined,
  };
}

interface Dealer { group: THREE.Group; site: DealerSite; sign: THREE.CanvasTexture | null; mats: THREE.Material[]; geos: THREE.BufferGeometry[] }

export class OwnedVehicleModule implements GameModule {
  readonly name: string;
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private vehicle: Vehicle | null = null;
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
  /** The parked vehicle's solid boxes in the hub's colliders (none while driving). */
  private solid: Collider[] = [];
  /** Re-check once after a hub load that another module's kerb clearing did not take the parked boxes away. */
  private solidCheck = false;
  /** The model's lean this frame (a motorbike in a turn), for the rider. */
  private lean = 0;

  readonly def: OwnedDef;
  private readonly parkedTarget: Target;
  private readonly rideTarget: Target;
  private readonly targets: TargetSource;

  constructor(def: OwnedDef) {
    this.def = def; this.name = def.key;
    this.parkedTarget = { id: `${def.key}:parked`, name: def.text.mine, kind: 'vehicle', space: 'street', x: 0, z: 0, y: 1.6, radius: def.reach, bias: -0.2, affordances: () => this.parkedAffordances() };
    this.rideTarget = { id: `${def.key}:ride`, name: def.item.name, kind: 'self', space: '', x: 0, z: 0, radius: 2, bias: -1, affordances: () => this.rideAffordances() };
    this.targets = { name: def.key, collect: (space, x, z, out) => this.collect(space, x, z, out) };
  }

  init(ctx: GameCtx) {
    this.ctx = ctx;
    const ui = document.getElementById('ui');
    if (ui) this.card = new RideCard(ui, `${this.def.key}-card`);
    ctx.interactions.add(this.targets);
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.clear();
    this.hub = hub;
    this.spec = this.def.spec();
    if (hub.id === this.def.dealer.hub) this.buildDealer(ctx, hub);
    const own = readOwned(ctx.state.data, this.def.id);
    if (own && own.hub === hub.id) this.spawn(own.x, own.z, own.yaw);
  }

  spaceChanged(_ctx: GameCtx, _space: string) { /* the vehicle stays where it is parked */ }

  /** Driving: its own interaction space (no shop counters while driving)… */
  space(): string | null { return this.driving && this.hub ? `${this.hub.id}:${this.def.space}` : null; }
  /** …but the player stays visible to the street. */
  presenceSpace(): string | null { return this.driving ? 'street' : null; }

  /** Saved while driving: the vehicle is parked where it is, the player standing beside it. */
  safePlace(): { x: number; z: number; yaw: number } | null {
    if (!this.driving || !this.hub || !this.vehicle) return null;
    parkOwned(this.ctx.state.data, this.def.id, this.hub.id, this.st.x, this.st.z, this.st.yaw);
    const p = this.beside();
    return { x: p.x, z: p.z, yaw: this.st.yaw };
  }

  update(ctx: GameCtx, dt: number) {
    const m = this.vehicle; if (!m || !this.spec?.drive) return;
    if (this.solidCheck) { this.solidCheck = false; this.setSolid(!this.driving); }
    if (!this.driving) return;
    if (ctx.player.seated()?.id !== m.driverSeat.id) { this.getOff(false); return; }   // taken off by a door, a trip…
    const mv = ctx.mode() === 'play' ? ctx.input.move() : { x: 0, y: 0 };
    const input = this.leaving ? { throttle: this.st.speed > 0.3 ? -1 : this.st.speed < -0.3 ? 1 : 0, steer: 0 } : { throttle: mv.y, steer: mv.x };
    transport.obstacles(this.obst);
    const v0 = Math.abs(this.st.speed);
    const hit = driveStep(this.st, input, this.spec.drive, dt, this.blocked);
    if (hit && v0 > 0.5) this.bumps++;
    m.place(this.st.x, this.st.z, this.st.yaw, Math.abs(this.st.speed), this.st.accel, this.st.odo, dt);
    this.lean = m.animate(this.st.speed, this.st.steer, dt);                     // wheels, steering, a motorbike's lean
    if (this.leaving && Math.abs(this.st.speed) < 0.3) this.getOff(true);
    this.cardT -= dt;
    if (this.cardT <= 0) { this.cardT = 0.25; this.refreshCard(); }
  }

  camera(ctx: GameCtx, dt: number, drag: { yaw: number; pitch: number }): boolean {
    const m = this.vehicle; if (!m || !this.driving || !this.cam.active || !this.spec) return false;
    const t = performance.now(), real = this.camMs ? Math.min(1, (t - this.camMs) / 1000) : dt; this.camMs = t;
    const a = this.spec.cameras[this.cam.view % this.spec.cameras.length];
    this.cam.update(Math.max(dt, real), ctx.camera, m.pose, m.bounce, a, drag, this.hub?.colliders ?? []);
    const body = ctx.player.body();
    if (body && a.inside) body.group.visible = false;         // at the wheel: looking out (shown again next frame)
    if (body) this.leanRider(body.group, m);
    return true;
  }

  /**
   * The rider leans with the motorbike, about the same ground line (main.ts has just put the body on the seat, upright,
   * this frame; the roll is undone when getting off).
   */
  private leanRider(g: THREE.Object3D, m: Vehicle) {
    const a = this.lean;
    g.rotation.z = a;
    if (!a) return;
    const h = g.position.y - m.pose.y, dx = -h * Math.sin(a), yaw = m.pose.yaw;
    g.position.x += Math.cos(yaw) * dx; g.position.z -= Math.sin(yaw) * dx; g.position.y += h * (Math.cos(a) - 1);
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    this.ctx = ctx;
    return {
      [this.def.key]: {
        info: () => ({ id: this.def.id, price: this.def.item.price, owned: owns(ctx.state.data, this.def.id), record: readOwned(ctx.state.data, this.def.id), here: !!this.vehicle, driving: this.driving, x: this.st.x, z: this.st.z, yaw: this.st.yaw, speed: this.st.speed, bumps: this.bumps, bought: this.bought,
          dealer: this.dealer ? { x: this.dealer.site.counter.x, z: this.dealer.site.counter.z, delivery: this.dealer.site.delivery, displays: this.dealer.site.displays.length } : null,
          space: this.space(), presence: this.presenceSpace(), camera: this.cam.active, view: this.spec?.cameras[this.cam.view % (this.spec?.cameras.length || 1)]?.id ?? null,
          solid: this.solid.length > 0 && !!this.hub && this.solid.every(c => this.hub!.colliders.includes(c)) }),
        card: () => this.card?.text ?? '',
        /** Checks: put the vehicle (and its driver) at a spot, stopped. */
        place: (x: number, z: number, yaw: number) => { if (!this.vehicle) return; this.st.x = x; this.st.z = z; this.st.yaw = yaw; this.st.speed = 0; this.vehicle.place(x, z, yaw, 0, 0, this.st.odo, 0); if (!this.driving) this.setSolid(true); },
      },
    };
  }

  // ---------------------------------------------------------------- the dealer corner
  private buildDealer(ctx: GameCtx, hub: HubWorld) {
    const D = this.def.dealer, site = D.site(hub);
    if (!site) return;
    clearKerb(ctx.extra, hub.colliders, site.kerb);
    const g = new THREE.Group(); g.name = `${this.def.key}:dealer`;
    const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [];
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => { geos.push(geo); mats.push(mat); const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
    const drive = this.spec?.drive;
    for (const s of site.displays) {
      const b = buildVehicle(this.def.kit, { seed: s.seed, driver: false, passengers: false });
      b.group.position.set(s.x, 0.12, s.z); b.group.rotation.y = s.yaw; g.add(b.group);
      if (drive) hub.colliders.push(...footprint(drive, s.x, s.z, s.yaw, this.def.height));
    }
    const sign = signTexture(D.sign);
    const sw = site.sign.w ?? 1.5, sh = sw / 3, top = 2.5 + sh;
    const pole = mesh(new THREE.BoxGeometry(0.08, top, 0.08), new THREE.MeshLambertMaterial({ color: 0x3b3f46 }));
    pole.position.set(site.sign.x, 0.12 + top / 2, site.sign.z);
    const plate = mesh(new THREE.BoxGeometry(sw, sh, 0.05), new THREE.MeshLambertMaterial({ map: sign }));
    plate.position.set(site.sign.x, 2.5 + sh / 2, site.sign.z); plate.rotation.y = site.sign.yaw;
    if (site.desk) {
      const desk = mesh(new THREE.BoxGeometry(1.3, 0.85, 0.6), new THREE.MeshLambertMaterial({ color: 0x2e5c8a }));
      desk.position.set(site.desk.x, 0.55, site.desk.z); desk.rotation.y = site.desk.yaw;
      const c = Math.abs(Math.cos(site.desk.yaw)), s = Math.abs(Math.sin(site.desk.yaw)), hx = (c * 1.3 + s * 0.6) / 2, hz = (s * 1.3 + c * 0.6) / 2;
      hub.colliders.push({ x0: site.desk.x - hx, x1: site.desk.x + hx, z0: site.desk.z - hz, z1: site.desk.z + hz, h: 1 });
    }
    ctx.extra.add(g);
    this.dealer = { group: g, site, sign, mats, geos };
    ctx.places.add(shop({
      id: `${this.def.key}:dealer`, name: D.name, space: 'street', catalogue: D.catalogue,
      anchors: [{ id: 'till', kind: 'shop', x: site.counter.x, z: site.counter.z, y: 2.2, radius: 2.8, bias: -0.2 }],
    }, { browse: () => this.openCatalogue() }));
  }

  private openCatalogue() {
    const ctx = this.ctx, it = this.def.item, mine = owns(ctx.state.data, this.def.id);
    ctx.menu(this.def.dealer.name, 'Le prix est affiché avant de confirmer.', [{
      icon: this.def.icon, label: it.name, detail: mine ? this.def.text.owned : it.detail, right: fcfa(it.price), disabled: mine,
      onPick: () => this.confirm(),
    }]);
  }

  private confirm() {
    const ctx = this.ctx, it = this.def.item, can = ctx.state.canAfford(it.price);
    ctx.menu(this.def.text.confirm, `Prix : ${fcfa(it.price)} · Ton argent : ${fcfa(ctx.state.wallet)}`, [
      { icon: '✅', label: 'Confirmer l’achat', right: '−' + fcfa(it.price), detail: can ? this.def.text.delivered : 'Pas assez d’argent', disabled: !can, onPick: () => this.buy() },
      { icon: '↩️', label: 'Pas maintenant', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }

  /** Pays once through the universal runner (verb buy, wallet line « <item> · <dealer> »). */
  private buy() {
    const ctx = this.ctx, def = this.def;
    ctx.hud.closeModal(); ctx.setMode('play');
    if (owns(ctx.state.data, def.id) || !this.dealer || !this.hub) return;
    const d = this.dealer.site.delivery, hub = this.hub;
    ctx.activities.start(P.buy({ id: def.id, label: def.item.name, price: def.item.price, then: () => {
      if (owns(ctx.state.data, def.id)) return;
      this.bought++;
      writeOwned(ctx.state.data, { id: def.id, kind: OWNED_KIND[def.id], seed: def.seed(), hub: hub.id, x: d.x, z: d.z, yaw: d.yaw, price: def.item.price, at: Date.now() });
      ctx.state.count('vehicules');
      this.spawn(d.x, d.z, d.yaw);
      ctx.toast(def.text.welcome);
      ctx.save();
    } }), { place: def.dealer.name });
  }

  // ---------------------------------------------------------------- the vehicle
  private spawn(x: number, z: number, yaw: number) {
    if (!this.spec || !this.hub) return;
    this.setSolid(false);
    this.vehicle?.dispose();
    const m = new Vehicle(this.spec, `${this.hub.id}:${this.def.space}`, 1, this.def.seed());
    m.group.name = `${this.def.key}:mine`;
    this.st = newDriveState(x, z, yaw);
    m.place(x, z, yaw, 0, 0, 0, 0);
    this.ctx.seats.add(m.driverSeat);
    this.ctx.extra.add(m.group);
    this.vehicle = m;
    this.setSolid(true);
    this.solidCheck = true;
  }

  /** The parked vehicle is solid (the player walks around it, the other vehicles stop at it); not while driving. */
  private setSolid(on: boolean) {
    const cs = this.hub?.colliders;
    if (cs) for (const c of this.solid) { const i = cs.indexOf(c); if (i >= 0) cs.splice(i, 1); }
    this.solid = [];
    const d = this.spec?.drive;
    if (!on || !cs || !d || !this.vehicle) return;
    this.solid = footprint(d, this.st.x, this.st.z, this.st.yaw, this.def.height);
    cs.push(...this.solid);
  }

  private getOn() {
    const ctx = this.ctx, m = this.vehicle; if (!m || this.driving || ctx.activities.running) return;
    ctx.player.standUp(true);
    m.place(this.st.x, this.st.z, this.st.yaw, 0, 0, this.st.odo, 0);
    ctx.player.sit(m.driverSeat);
    if (ctx.player.seated()?.id !== m.driverSeat.id) return;
    this.driving = true; this.leaving = false; this.st.speed = 0; this.st.steer = 0;
    this.setSolid(false);
    m.setRidden(true);
    this.cam.begin(ctx.camera, m.pose); this.camMs = 0;
    ctx.toast(HINT);
    this.refreshCard();
  }

  /** Off the vehicle, beside it; it stays parked there. `normal`: the player chose to get off. */
  private getOff(normal: boolean) {
    const ctx = this.ctx, m = this.vehicle; if (!m || !this.driving || !this.hub) return;
    this.driving = false; this.leaving = false;
    if (ctx.player.seated()?.id === m.driverSeat.id) ctx.player.standUp(true);
    this.st.speed = 0;
    m.place(this.st.x, this.st.z, this.st.yaw, 0, 0, this.st.odo, 0);
    m.setRidden(false);                                         // also a fresh model: upright, wheels straight
    this.upright();
    parkOwned(ctx.state.data, this.def.id, this.hub.id, this.st.x, this.st.z, this.st.yaw);
    this.setSolid(true);
    this.cam.end();
    if (normal || !ctx.inside()) { const p = this.beside(); ctx.player.place(p.x, p.z, this.st.yaw); }
    this.card?.show(null);
    if (normal) ctx.toast(this.def.text.parked);
    ctx.save();
  }

  /**
   * Where the driver stands after getting off, out of any wall and of the vehicle itself: a motorbike's rider on its
   * left (else its right); a car's driver on the pavement side (the side farther from the road's centre line).
   */
  private beside() {
    const yaw = this.st.yaw, lx = Math.cos(yaw), lz = -Math.sin(yaw);               // the vehicle's left (+x local)
    const d = this.spec?.drive, gap = (d?.halfWidth ?? 0.4) + (this.def.exit === 'pavement' ? 0.7 : 0.43);
    const zs = this.spec?.driver.z ?? 0, ox = this.st.x + Math.sin(yaw) * zs, oz = this.st.z + Math.cos(yaw) * zs;
    let sides = [1, -1];
    if (this.def.exit === 'pavement') {
      const away = (s: number) => roadDistance(ox + lx * gap * s, oz + lz * gap * s);
      sides = away(-1) >= away(1) - 0.3 ? [-1, 1] : [1, -1];                       // right (kerb side when parked on the right) unless the left is clearly off the road
    }
    for (const k of [gap, gap + 0.45]) for (const s of sides) {
      const x = ox + lx * k * s, z = oz + lz * k * s;
      if (!this.blocked(x, z, 0.3)) return { x, z };
    }
    const back = (d?.halfLength ?? 1) + 0.6;
    return { x: this.st.x - Math.sin(yaw) * back, z: this.st.z - Math.cos(yaw) * back };
  }

  /** Solid things for the vehicle: walls and parked vehicles (colliders), stairs and terraces, the hub's edge, the car rapides. */
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
    this.card.show({ num: this.def.icon, title: `${this.def.item.name} · ${kmh} km/h`, sub: this.leaving ? 'Tu t’arrêtes pour descendre' : HINT });
  }

  private upright() {
    this.lean = 0;
    const body = this.ctx?.player.body();
    if (body) body.group.rotation.z = 0;
  }

  private clear() {
    if (this.driving) { this.driving = false; this.cam.end(); this.upright(); }
    this.setSolid(false);
    this.vehicle?.dispose(); this.vehicle = null;
    if (this.dealer) {
      for (const geo of this.dealer.geos) geo.dispose();
      for (const mat of this.dealer.mats) mat.dispose();
      this.dealer.group.removeFromParent(); this.dealer.sign?.dispose(); this.dealer = null;
    }
    this.card?.show(null);
    this.hub = null;
  }

  // ---------------------------------------------------------------- targets
  private parkedAff: Affordance[] = [];
  private rideAff: Affordance[] = [];

  private collect(space: string, x: number, z: number, out: Target[]) {
    const m = this.vehicle, d = this.spec?.drive; if (!m || !this.hub || !d) return;
    if (this.driving) { if (space === this.space()) { const t = this.rideTarget; t.space = space; t.x = x; t.z = z; out.push(t); } return; }
    if (space !== 'street' || Math.abs(this.st.x - x) > d.halfLength + this.def.reach || Math.abs(this.st.z - z) > d.halfLength + this.def.reach) return;
    // the target sits on the body's edge nearest to the player (a 4.5 m car is reached from its door, its boot…)
    const c = Math.cos(this.st.yaw), s = Math.sin(this.st.yaw), dx = x - this.st.x, dz = z - this.st.z;
    const lx = Math.max(-d.halfWidth, Math.min(d.halfWidth, dx * c - dz * s)), lz = Math.max(-d.halfLength, Math.min(d.halfLength, dx * s + dz * c));
    const t = this.parkedTarget; t.x = this.st.x + lx * c + lz * s; t.z = this.st.z - lx * s + lz * c; out.push(t);
  }

  private parkedAffordances(): Affordance[] {
    if (!this.parkedAff.length) this.parkedAff = [{ id: 'monter', verb: 'drive', label: this.def.text.getOn, icon: this.def.icon, run: () => this.getOn() }];
    this.parkedAff[0].disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : null;
    return this.parkedAff;
  }
  private rideAffordances(): Affordance[] {
    if (!this.rideAff.length) this.rideAff = [
      { id: 'descendre', verb: 'alight', label: this.def.text.getOff, icon: '🛑', run: () => { if (Math.abs(this.st.speed) < 0.3) this.getOff(true); else { this.leaving = true; this.refreshCard(); } } },
      { id: 'vue', verb: 'use', label: 'Changer de vue', icon: '🎥', run: () => this.cam.next(this.spec?.cameras.length ?? 1) },
    ];
    this.rideAff[0].label = this.leaving ? 'Tu t’arrêtes…' : this.def.text.getOff;
    return this.rideAff;
  }
}

/** The dealer's sign, drawn in code (fictional names only). */
function signTexture(o: OwnedDef['dealer']['sign']): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 128;
  const c = cv.getContext('2d'); if (!c) return null;
  c.fillStyle = o.bg; c.fillRect(0, 0, 384, 128);
  c.fillStyle = o.band; c.fillRect(0, 92, 384, 36);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '900 40px system-ui, sans-serif'; c.fillText(o.title, 192, 48, 360);
  c.fillStyle = o.subColor; c.font = '800 22px system-ui, sans-serif'; c.fillText(o.sub, 192, 111, 360);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
