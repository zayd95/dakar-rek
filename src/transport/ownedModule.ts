import * as THREE from 'three';
import type { HubId } from '../core/types';
import type { GameCtx, GameModule } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import type { Affordance, Target, TargetSource } from '../interact/types';
import { shop } from '../activity/templates';
import type { ActivitySpec } from '../activity/types';
import { ROADSIDE_REACH, ROADSIDE_SECONDS, bandWarning, canMakeshift, healthAlert, healthTag, hitDamage, roadsideResult, scaledDrive } from './condition';
import { buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { fcfa } from '../ui/hud';
import { say } from '../i18n/wolof';
import { Vehicle } from './vehicle';
import { PassengerCamera } from './camera';
import { RideCard } from './ui';
import { fovFor } from '../core/view';
import { vehicleAudio, profileFor, brakeIntensity, PROFILES, HORNS } from './vehicleAudio';
import { mountAudioDiag } from './audioDiag';
import { ContactTracker, type Impact } from './contact';
import { buzz, impactPattern as impactBuzz, HORN_TICK } from './haptics';
import { setMuted } from '../core/audioSettings';
import { driveStep, newDriveState, pedalThrottle, type DriveState } from './drive';
import { assetsRevision, buyAsset, cannotBuy, holding, setCondition } from '../economy/assets';
import { specOf } from '../economy/catalog';
import { buildCourierBox, type CourierBox } from './courierBox';
import { ridePad } from './ridePad';
import { migrateLegacyVehicles, migrateOwned, ownsVehicle, paintSeed, park, parked, setPaintSeed, unpark, type VehicleAsset } from './owned';
import { prestige, type FloorCarInfo, type FloorOwner } from './prestigeSales';
import { seatClip, sitOriginY } from '../interact/seats';
import { clearKerb, type KerbZone } from './passengers';
import { GRID, roadCentre } from './lines';
import { crossing } from './hubLink';
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
 * Ownership is the asset model (src/economy/assets.ts: `buyAsset`, the catalogue's price and name, « Biens »); only the
 * parking spot is kept by src/transport/owned.ts. Bought from « Biens », it waits at its dealer's kerb; sold there,
 * it is gone.
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
  /** A small desk at the counter (a dealer on the pavement). */
  desk?: Spot;
  /**
   * The display that IS the catalogue's vehicle (a showroom's lot, src/world/shopKit.ts `showroom_cars`): off the floor
   * while the player owns it — the one bought is the one waiting outside — back if it is sold again.
   */
  forSale?: number;
  /** Where that vehicle's price card stands (painted here: the catalogue's name and price). */
  card?: Spot;
  /** Vehicles on show in all, the shop's own included (a showroom's lots); default: the displays. */
  lots?: number;
  /**
   * A hall built by the world generator with real cars standing on its floor (src/world/prestige.ts): each slot is a real vehicle, the very one the player
   * test-drives and buys (no stand-in on display, no copy delivered). `colour` names its paint for the price card and the menus.
   */
  floor?: { slots: { x: number; z: number; yaw: number; seed: number; colour: string }[] };
}

/** A car standing on a floor dealer's floor: its vehicle (null when it is out with the player, or sold), its solid boxes, and what it is doing. */
interface FloorCar {
  slot: number; spot: Spot; seed: number; colour: string; vehicle: Vehicle | null; cols: Collider[];
  /** display: for sale · unlocked: the salesperson has unlocked it for the customer · out: the player has it (trial or bought) · sold: bought, and the car left (the bay stays empty). */
  state: 'display' | 'unlocked' | 'out' | 'sold';
  card: THREE.Mesh[];
}

export interface OwnedDef {
  /** Module name and debug key (`__dakar.moto`, `__dakar.car`). */
  key: string;
  /** Catalogue id (src/economy/catalog.ts): name and price come from there. */
  asset: VehicleAsset;
  /** One line under its name at the dealer. */
  detail: string;
  icon: string;
  kit: VehicleKind;
  /** A replacement look for the vehicle on display at the dealer (a prepared GLB body, src/actors/glbVehicle.ts); null keeps the kit model. */
  visual?(seed: number): THREE.Object3D | null;
  seed(): number;
  spec(): VehicleSpec;
  /** Height of the parked footprint (m). */
  height: number;
  /** Interaction space while driving: `<hub>:<space>`. */
  space: string;
  dealer?: {
    hub: HubId; name: string; catalogue: string;
    site(hub: HubWorld): DealerSite | null;
    sign: { bg: string; band: string; title: string; sub: string; subColor: string };
  };
  /**
   * A lent vehicle (the Tiak depot's motorbike): no dealer and no price, it is in every hub where the player stands, at
   * the spot returned here until they leave it somewhere (then it stays there, in that hub).
   */
  loaner?: { depot(hub: HubWorld): { x: number; z: number; yaw: number } | null };
  /** A courier's box on the back; a parcel shows in it while a Tiak run is in hand. */
  box?: boolean;
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

const HINT = '↑ accélérer · ↓ freiner · ← → tourner · H klaxon';

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
export function kerbDealer(px: number, pz: number, o: { displays: { along: number; seed: number }[]; delivery: number; sign: number; desk?: boolean; clear: [number, number]; displayLateral?: number }): DealerSite {
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
    displays: o.displays.map(d => ({ ...at(d.along, o.displayLateral ?? 4.3), seed: d.seed })),
    delivery,
    kerb: [{ x: delivery.x, z: delivery.z, dx: fx, dz: fz, rx: nx, rz: nz, offset: 4.3, from: o.clear[0] - o.delivery, to: o.clear[1] - o.delivery }],
    desk: o.desk ? at(0, 6.75, yaw + Math.PI / 2) : undefined,
  };
}

/** Vertical field of view at the wheel in portrait (the page's is 66°). */
const INSIDE_FOV_PORTRAIT = 78;

interface Dealer {
  group: THREE.Group; site: DealerSite; sign: THREE.CanvasTexture | null; card: THREE.CanvasTexture | null; mats: THREE.Material[]; geos: THREE.BufferGeometry[];
  /** The vehicle for sale on the floor with its card, and its solid boxes (`forSale`). */
  sale: { group: THREE.Group; cols: Collider[] } | null;
  /** The showroom's sign textures. */
  extraTex: THREE.Texture[];
}

export class OwnedVehicleModule implements GameModule, FloorOwner {
  readonly name: string;
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private vehicle: Vehicle | null = null;
  private spec: VehicleSpec | null = null;
  private st: DriveState = newDriveState(0, 0, 0);
  private driving = false;
  /** The horn button went down or up (ridePad.onHorn): the horn sounds from the touch itself. */
  private readonly hornEvent = (on: boolean) => { if (on && this.driving && this.ctx.mode() === 'play') { vehicleAudio.hornOn(this.def.kit); buzz(HORN_TICK); } else if (!on) vehicleAudio.hornOff(); };
  /** « Descendre » asked while moving: brake, then get off. */
  private leaving = false;
  private cam = new PassengerCamera();
  private card: RideCard | null = null;
  private dealer: Dealer | null = null;
  private cardT = 0;
  private camMs = 0;
  /** The roadside fix of a car that will not run (src/transport/condition.ts): its affordance, built once. */
  private fixAff: Affordance | null = null;
  /** A crossing into the next district in progress: the pose, speed and steering the ride resumes with once the hub is built. */
  private carry: { x: number; z: number; yaw: number; speed: number; steer: number; odo: number } | null = null;
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
  /** Asset model revision last looked at. */
  private rev = -1;
  /** The courier's box on the back (a Tiak bike). */
  private box: CourierBox | null = null;
  /** Stepping up to the saddle (0.28 s) before the seat is taken: from where the player stood. */
  private mounting: { t: number; fx: number; fz: number } | null = null;
  /** A free test drive from the dealer (« Essayer »): the vehicle on the road is the dealer's, not the player's. Never saved; it goes back when the player gets off. */
  private trial = false;
  /** The field of view is the wheel view's own (portrait): given back when the view ends. */
  private fovSet = false;
  /** The cars on a showroom's floor (a floor dealer), the interaction targets of their cards and the cards' textures. */
  private floor: FloorCar[] = [];
  private floorTargets: Target[] = [];
  private cardTex: THREE.CanvasTexture[] = [];
  /** The floor slot the vehicle in hand was taken from (-1: none); handed back to the dealership; and how long it has stood parked (s). */
  private trialSlot = -1;
  private returned = false;
  private parkedT = 0;
  private lookT = 0;
  /** Seconds of game time this vehicle has been updated (debug: the checks' pilot reads yaw rates against it, the headless clock being slower than the wall's). */
  private simT = 0;
  /** Paint (kit seed) of the vehicle in hand: the floor car's; saved when it is bought. 0: the catalogue's. */
  private seed = 0;
  /** Getting in through the driver's door: the door opens, the body slips onto the seat, the door shuts, then the engine starts (stepEntry). */
  private entry: { t: number; from: THREE.Vector3; face: number; opened: boolean; seated: boolean } | null = null;
  /** Getting out: the door opens, the body stands and steps out, the door shuts (stepExit). */
  private exit: { t: number; from: THREE.Vector3; to: { x: number; z: number }; stood: boolean; trial: boolean } | null = null;
  /** The driver's door of the vehicle in hand, 0 shut … 1 open, and where it is heading; the shut sound plays when it lands. */
  private doorK = 0; private doorGoal = 0; private doorSound = false;
  private readonly frustum = new THREE.Frustum(); private readonly pm = new THREE.Matrix4(); private readonly sph = new THREE.Sphere(); private readonly v3 = new THREE.Vector3();
  /** Feel (camera only): the settle at the engine start, the dip under a hard brake, the shake of a contact; and when the brake last squealed. */
  private fx = { settle: 0, ignite: 0, dip: 0, shake: 0, hard: 0, kickX: 0, kickZ: 0 };
  private readonly contact = new ContactTracker();
  /** What contacts did (the checks): each bump / hit with its speed and strength, the frames spent scraping, the largest shake and camera kick seen. */
  private feelLog = { impacts: [] as { kind: string; speed: number; strength: number; headOn: boolean }[], shakePeak: 0, kickPeak: 0 };
  private scrapeFrames = 0;

  readonly def: OwnedDef;
  private readonly parkedTarget: Target;
  private readonly rideTarget: Target;
  private readonly targets: TargetSource;

  constructor(def: OwnedDef) {
    this.def = def; this.name = def.key;
    this.parkedTarget = { id: `${def.key}:parked`, name: def.text.mine, kind: 'vehicle', space: 'street', x: 0, z: 0, y: 1.6, radius: def.reach, bias: -0.2, affordances: () => this.parkedAffordances() };
    this.rideTarget = { id: `${def.key}:ride`, name: this.label(), kind: 'self', space: '', x: 0, z: 0, radius: 2, bias: -1, affordances: () => this.rideAffordances() };
    this.targets = { name: def.key, collect: (space, x, z, out) => this.collect(space, x, z, out) };
  }

  init(ctx: GameCtx) {
    this.ctx = ctx;
    const ui = document.getElementById('ui');
    if (ui) this.card = new RideCard(ui, `${this.def.key}-card`);
    ctx.interactions.add(this.targets);
    if (ui) ridePad.init(ui);
    vehicleAudio.unlockOnGesture();
    mountAudioDiag();                              // the first tap or key lets the page play sound (iPhone Safari)
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx;
    this.clear();
    this.hub = hub;
    this.spec = this.def.spec();
    if (this.def.dealer && hub.id === this.def.dealer.hub) this.buildDealer(ctx, hub);
    migrateOwned(ctx.state);                                    // a save from before the asset model
    migrateLegacyVehicles(ctx.state);                           // a retired vehicle (the old « Voiture d'occasion ») becomes its successor, same asset
    this.sync(); this.rev = assetsRevision();
    if (this.carry) this.resume();
  }

  /** Name and price from the catalogue. */
  /** The dealer as the phone's map lists it, from any district (src/transport/dealers.ts). */
  directoryRow(state: GameCtx['state']) {
    const D = this.def.dealer;
    return D ? { id: `${this.def.key}:dealer`, name: D.name, hub: D.hub, vehicle: this.label(), icon: this.def.icon, price: this.price(), owned: ownsVehicle(state, this.def.asset) } : null;
  }
  private label() { return specOf(this.def.asset)?.name ?? this.def.text.mine; }
  private price() { return specOf(this.def.asset)?.price ?? 0; }

  /**
   * The vehicle in this hub follows the asset model: owned and parked here → it stands there; owned with no spot yet
   * (bought from « Biens ») → delivered at the dealer's kerb when this is its hub; no longer owned (sold) → gone.
   */
  private sync() {
    const s = this.ctx.state, a = this.def.asset;
    this.showSale();
    if (!ownsVehicle(s, a)) {
      if (this.trial) return;                                     // the dealer's vehicle on a test drive: not the player's, not touched by the asset model
      if (this.vehicle) { if (this.driving) this.getOff(false); this.setSolid(false); this.vehicle.dispose(); this.vehicle = null; unpark(s.data, a); }
      return;
    }
    if (this.vehicle || !this.hub) return;
    let p = parked(s.data, a);
    this.seed = paintSeed(s.data, a) ?? 0;                      // a car bought from a showroom's floor keeps the paint of the one chosen
    if (this.def.loaner && (!p || p.hub !== this.hub.id)) { const d = this.def.loaner.depot(this.hub); p = d ? { asset: a, hub: this.hub.id, ...d } : null; }   // lent: at this hub's depot until left elsewhere
    else if (!p && this.dealer) { p = { asset: a, hub: this.hub.id, ...this.dealer.site.delivery }; park(s.data, p); }
    if (p && p.hub === this.hub.id) this.spawn(p.x, p.z, p.yaw);
  }

  spaceChanged(_ctx: GameCtx, _space: string) { /* the vehicle stays where it is parked */ }

  /** Where the vehicle stands parked in this hub (null: ridden now, or not in this hub). */
  parkedHere(): { x: number; z: number; yaw: number } | null {
    return this.vehicle && !this.driving && this.hub ? { x: this.st.x, z: this.st.z, yaw: this.st.yaw } : null;
  }
  /** The player is riding / driving it now. */
  get ridden() { return this.driving; }
  /**
   * Move the parked vehicle to another spot of this hub (a guarded parking's place, src/arena/arrival.ts), saved like a
   * parking spot. False while it is ridden or not here.
   */
  moveParked(x: number, z: number, yaw: number): boolean {
    if (!this.vehicle || this.driving || !this.hub || this.trial) return false;
    this.st.x = x; this.st.z = z; this.st.yaw = yaw; this.st.speed = 0;
    this.vehicle.place(x, z, yaw, 0, 0, this.st.odo, 0);
    this.setSolid(true);
    park(this.ctx.state.data, { asset: this.def.asset, hub: this.hub.id, x, z, yaw });
    return true;
  }

  /** Driving: its own interaction space (no shop counters while driving)… */
  space(): string | null { return this.driving && this.hub ? `${this.hub.id}:${this.def.space}` : null; }
  /** …but the player stays visible to the street. */
  presenceSpace(): string | null { return this.driving ? 'street' : null; }

  /** Saved while driving: the vehicle is parked where it is, the player standing beside it. */
  safePlace(): { x: number; z: number; yaw: number } | null {
    if (!(this.driving || this.entry || this.exit) || !this.hub || !this.vehicle) return null;
    if (!this.trial) park(this.ctx.state.data, { asset: this.def.asset, hub: this.hub.id, x: this.st.x, z: this.st.z, yaw: this.st.yaw });
    const p = this.beside();
    return { x: p.x, z: p.z, yaw: this.st.yaw };
  }

  update(ctx: GameCtx, dt: number) {
    const r = assetsRevision(); if (r !== this.rev && this.hub) { this.rev = r; this.sync(); }   // bought or sold in « Biens »
    if (this.floor.length) this.watchFloor(ctx, dt);
    const m = this.vehicle; if (!m || !this.spec?.drive) return;
    this.simT += dt;
    this.stepDoor(dt, m);
    if (this.box) this.box.parcel.visible = ctx.state.data.jobs.active?.stage === 'deliver';   // the run's parcel is in the box
    if (this.solidCheck) { this.solidCheck = false; this.setSolid(!this.driving); }
    if (this.entry) { this.stepEntry(ctx, dt, m); return; }
    if (this.exit) { this.stepExit(ctx, dt, m); return; }
    if (this.mounting) {
      const g = this.mounting, st = m.driverSeat; g.t = Math.min(1, g.t + dt / 0.28);
      const k = g.t * g.t * (3 - 2 * g.t);
      ctx.player.place(g.fx + (st.x - g.fx) * k, g.fz + (st.z - g.fz) * k, this.st.yaw);
      if (g.t >= 1) { this.mounting = null; this.mountNow(); }
      return;
    }
    if (!this.driving) { if (this.trial && this.trialSlot >= 0) this.watchTrial(ctx, dt); return; }
    if (ctx.player.seated()?.id !== m.driverSeat.id) { this.getOff(false); return; }   // taken off by a door, a trip…
    const mv = ctx.mode() === 'play' ? ctx.input.move() : { x: 0, y: 0 };
    const moto = this.def.kit === 'moto';
    ridePad.show(this, Math.abs(this.st.speed) < 0.3 && !this.leaving, () => { if (Math.abs(this.st.speed) < 0.5) this.getOff(true); }, { car: !moto, view: () => this.cam.next(this.spec?.cameras.length ?? 1) });
    // touch: the buttons give gas and brake and the stick only steers (a car: the brake never backs it up, « R » does)
    const throttle = !ridePad.active ? mv.y : moto ? ridePad.throttle : pedalThrottle(ridePad.gas, ridePad.brake, ridePad.reverse, this.st.speed);
    const input = this.leaving ? { throttle: this.st.speed > 0.3 ? -1 : this.st.speed < -0.3 ? 1 : 0, steer: 0 } : { throttle, steer: mv.x };
    transport.obstacles(this.obst, this.def.kit);
    const vs0 = this.st.speed, v0 = Math.abs(vs0);
    const drv = scaledDrive(this.spec.drive, this.hp());                              // a worn car is slower (the same object when whole: the physics are untouched)
    const z0 = this.st.z, hit = driveStep(this.st, input, drv, dt, this.blocked);
    // how it FEELS (src/transport/contact.ts): one bump or hit per contact, a scrape while it slides, never a knock on every frame of a push against a wall
    const cf = this.contact.step(dt, hit, vs0, this.st.speed);
    if (cf.impact) { this.onImpact(cf.impact, m); this.hurt(cf.impact); }
    if (cf.scraping) vehicleAudio.scrape(cf.scrape); else vehicleAudio.scrapeOff();
    if (cf.scraping) this.scrapeFrames++;
    m.place(this.st.x, this.st.z, this.st.yaw, Math.abs(this.st.speed), this.st.accel, this.st.odo, dt);
    if (!this.trial && !this.leaving && ctx.mode() === 'play' && this.hub) { const c = crossing(this.hub.id, this.st.x, z0, this.st.z, this.st.speed * Math.cos(this.st.yaw)); if (c) { this.cross(c.link.to, c.x, c.z); return; } }
    this.lean = m.animate(this.st.speed, this.st.steer, dt);                     // wheels, steering, a motorbike's lean
    // sound and feel: the engine follows the speed, a hard brake squeals and dips the camera a little, the horn is held
    const bi = brakeIntensity(-this.st.accel * Math.sign(this.st.speed || 1), v0);
    if (bi > 0.05 && input.throttle !== 0) { vehicleAudio.brake(bi); if (bi > 0.3) this.fx.hard = 0.6; }
    if (!vehicleAudio.running && this.hp() > 0) vehicleAudio.run(profileFor(this.def.kit));       // the first tap may come after getting in: the engine joins then (never for a dead car)
    vehicleAudio.cabin = this.insideCar();                                                       // the wheel view of a car: its own engine is heard through the cabin
    if (vehicleAudio.running) vehicleAudio.update(dt, this.st.speed, drv.maxSpeed, input.throttle);
    ridePad.onHorn(this, this.hornEvent);                                         // the button tells the horn at once; this frame is the safety net (a key, a missed « up »)
    if (ctx.mode() === 'play' && (ctx.input.keys.has('KeyH') || ridePad.horn)) vehicleAudio.hornOn(this.def.kit); else vehicleAudio.hornOff();
    this.fx.hard = Math.max(0, this.fx.hard - dt);
    if (this.leaving && Math.abs(this.st.speed) < 0.3) this.getOff(true);
    this.cardT -= dt;
    if (this.cardT <= 0) { this.cardT = 0.25; this.refreshCard(); }
  }

  // ---------------------------------------------------------------- the driver's door, getting in and out
  /** The door follows its goal at 2.4 turns of the full swing per second; the shut sound plays as it lands. */
  /** The player sits inside a car with the wheel view on (the motorbike has no cabin; the chase and bird's-eye views are outside it). */
  private insideCar(): boolean {
    if (this.def.kit === 'moto' || !this.cam.active || !this.spec) return false;
    return !!this.spec.cameras[this.cam.view % this.spec.cameras.length]?.inside;
  }

  private stepDoor(dt: number, m: Vehicle) {
    if (!m.hasDoor) return;
    const was = this.doorK;
    this.doorK += Math.max(-dt * 2.4, Math.min(dt * 2.4, this.doorGoal - this.doorK));
    if (this.doorK !== was) m.setDoor(this.doorK * this.doorK * (3 - 2 * this.doorK));
    if (this.doorSound && this.doorK <= 0.02) { this.doorSound = false; vehicleAudio.door(false); }
  }
  private openDoor() { this.doorGoal = 1; this.doorSound = false; vehicleAudio.door(true); }
  private shutDoor() { this.doorGoal = 0; this.doorSound = true; }

  /** Where the customer stands to open the driver's door: on the door's step, off the body's left side. */
  private stepPoint(x = this.st.x, z = this.st.z, yaw = this.st.yaw) {
    const door = this.spec?.doors[0], lx = door?.x ?? 1.5, lz = door?.z ?? 0.4, c = Math.cos(yaw), si = Math.sin(yaw);
    return { x: x + c * lx + si * lz, z: z - si * lx + c * lz };
  }
  private left(yaw = this.st.yaw) { return { x: Math.cos(yaw), z: -Math.sin(yaw) }; }

  /** « Ouvrir » / « Monter »: the vehicle in hand is entered through its driver's door (a vehicle with no door of its own keeps the short glide). */
  private beginEntry() {
    const ctx = this.ctx, m = this.vehicle; if (!m || this.driving || this.entry || this.exit || ctx.activities.running) return;
    const p = ctx.player.pos, seat = m.driverSeat;
    this.entry = { t: 0, from: p.clone(), face: Math.atan2(seat.x - p.x, seat.z - p.z), opened: false, seated: false };
    ctx.setMode('busy');
  }
  private stepEntry(ctx: GameCtx, dt: number, m: Vehicle) {
    const e = this.entry!, OPEN = 0.5, GLIDE = 1.05, CLOSE = 0.55;
    e.t += dt;
    if (!e.opened) { e.opened = true; this.openDoor(); }
    const seat = m.driverSeat, yaw = this.st.yaw, L = this.left(yaw), body = ctx.player.body();
    const mouth = { x: seat.x + L.x * 0.62, z: seat.z + L.z * 0.62 };
    if (e.t >= OPEN && e.t < OPEN + GLIDE) {
      const k = (e.t - OPEN) / GLIDE, ease = (u: number) => u * u * (3 - 2 * u);
      const a = e.from, to = k < 0.42 ? { u: ease(k / 0.42), p0: { x: a.x, z: a.z }, p1: mouth } : { u: ease((k - 0.42) / 0.58), p0: mouth, p1: { x: seat.x, z: seat.z } };
      const x = to.p0.x + (to.p1.x - to.p0.x) * to.u, z = to.p0.z + (to.p1.z - to.p0.z) * to.u;
      const turn = Math.max(0, (k - 0.5) / 0.5), face = e.face + Math.atan2(Math.sin(yaw - e.face), Math.cos(yaw - e.face)) * ease(turn);
      ctx.player.place(x, z, face);
      const sy = sitOriginY(seat), gy = a.y, low = ease(Math.max(0, (k - 0.38) / 0.62));
      ctx.player.pos.y = gy + (sy - gy) * low;
      if (body && k > 0.5) body.hold = seatClip(seat);
    } else if (e.t >= OPEN + GLIDE && !e.seated) {
      e.seated = true; ctx.player.sit(seat);
      if (ctx.player.seated()?.id !== seat.id) { this.entry = null; this.shutDoor(); ctx.setMode('play'); return; }
      this.shutDoor();
    }
    if (e.seated && e.t >= OPEN + GLIDE + CLOSE && this.doorK <= 0.02) { this.entry = null; ctx.setMode('play'); this.mountNow(false); }
  }
  private stepExit(ctx: GameCtx, dt: number, m: Vehicle) {
    const x = this.exit!, OPEN = 0.5, OUT = 0.8;
    if (x.t === 0) this.openDoor();
    x.t += dt;
    const seat = m.driverSeat, L = this.left(), mouth = { x: seat.x + L.x * 0.62, z: seat.z + L.z * 0.62 };
    if (x.t >= OPEN && !x.stood) { x.stood = true; ctx.player.standUp(true); x.from.set(seat.x, sitOriginY(seat), seat.z); const b = ctx.player.body(); if (b) b.hold = null; }
    if (x.stood) {
      const k = Math.min(1, (x.t - OPEN) / OUT), ease = (u: number) => u * u * (3 - 2 * u);
      const first = k < 0.5, u = ease(first ? k / 0.5 : (k - 0.5) / 0.5), p0 = first ? { x: x.from.x, z: x.from.z } : mouth, p1 = first ? mouth : x.to;
      const gy = 0.1 + (ctx.world()?.heightAt(x.to.x, x.to.z) ?? 0);
      ctx.player.place(p0.x + (p1.x - p0.x) * u, p0.z + (p1.z - p0.z) * u, this.st.yaw);
      ctx.player.pos.y = x.from.y + (gy - x.from.y) * ease(Math.min(1, k * 1.6));
      if (k >= 1) {
        const trial = x.trial; this.exit = null; ctx.setMode('play'); this.shutDoor();
        ctx.player.place(x.to.x, x.to.z, this.st.yaw);
        if (trial) { this.parkedT = 0; ctx.toast('Voiture garée. Le vendeur vient te voir.'); prestige.trialEnded(this, x.to.x, x.to.z); }
        else ctx.toast(this.def.text.parked);
        ctx.save();
      }
    }
  }

  // ---------------------------------------------------------------- a showroom's floor
  private onScreen(ctx: GameCtx, x: number, z: number, r = 3.5) {
    const c = ctx.camera; c.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
    return this.frustum.intersectsSphere(this.sph.set(this.v3.set(x, 1, z), r));
  }
  /** A bay that was emptied (a car sold, then the car sold back in « Biens ») is stocked again once nobody can see it filled. */
  private watchFloor(ctx: GameCtx, dt: number) {
    this.lookT -= dt; if (this.lookT > 0) return; this.lookT = 0.5;
    if (!this.hub || this.def.asset === undefined) return;
    const owns = ownsVehicle(ctx.state, this.def.asset);
    for (const fc of this.floor) {
      if (fc.state !== 'sold' || fc.vehicle) continue;
      const stillHis = owns && paintSeed(ctx.state.data, this.def.asset) === fc.seed;
      if (!stillHis && !this.onScreen(ctx, fc.spot.x, fc.spot.z)) { this.spawnFloor(fc); fc.state = 'display'; this.syncCards(); }
    }
  }
  /** A parked trial vehicle that was handed back, or left for good, goes back to its bay, but only when neither the car nor its bay is in view: it is never seen to vanish or to appear. */
  private watchTrial(ctx: GameCtx, dt: number) {
    this.parkedT += dt;
    this.lookT -= dt; if (this.lookT > 0) return; this.lookT = 0.5;
    const fc = this.floor[this.trialSlot], p = ctx.player.pos; if (!fc || !this.vehicle) return;
    if (!this.returned && this.parkedT < 40) return;
    if (Math.hypot(p.x - this.st.x, p.z - this.st.z) < 14 || this.onScreen(ctx, this.st.x, this.st.z) || this.onScreen(ctx, fc.spot.x, fc.spot.z)) return;
    this.collectTrial(ctx, true);
  }
  /** The trial vehicle goes back to its bay at the dealership (the same car, in the same paint). */
  private collectTrial(ctx: GameCtx, say: boolean) {
    const fc = this.floor[this.trialSlot]; if (!fc) return;
    if (this.driving) this.getOff(false);
    this.setSolid(false);
    this.vehicle?.dispose(); this.vehicle = null; this.entry = null; this.exit = null; this.doorK = this.doorGoal = 0;
    this.trial = false; this.returned = false; this.trialSlot = -1; this.seed = 0; this.parkedTarget.name = this.def.text.mine;
    this.spawnFloor(fc); fc.state = 'display'; this.syncCards();
    if (say) ctx.toast('Prestige Auto a repris sa voiture d’essai.');
  }

  /** A real car on the floor, in its bay, solid. */
  private spawnFloor(fc: FloorCar) {
    if (!this.spec || !this.hub) return;
    const s = fc.spot, v = new Vehicle(this.spec, `${this.hub.id}:${this.def.space}`, 1, fc.seed);
    v.group.name = `${this.def.key}:floor:${fc.slot}`;
    v.place(s.x, s.z, s.yaw, 0, 0, 0, 0);
    this.ctx.extra.add(v.group);
    fc.vehicle = v;
    fc.cols = this.spec.drive ? footprint(this.spec.drive, s.x, s.z, s.yaw, this.def.height) : [];
    this.hub.colliders.push(...fc.cols);
  }
  private dropFloorCols(fc: FloorCar) {
    const cs = this.hub?.colliders; if (cs) for (const c of fc.cols) { const i = cs.indexOf(c); if (i >= 0) cs.splice(i, 1); }
    fc.cols = [];
  }
  /** The floor car becomes the vehicle in hand: the same Vehicle, where it stands (its bay's boxes make way for the vehicle's own). */
  private adoptFloor(fc: FloorCar) {
    const v = fc.vehicle; if (!v || !this.hub) return;
    this.dropFloorCols(fc); this.setSolid(false);
    this.vehicle?.dispose();
    this.vehicle = v; fc.vehicle = null; fc.state = 'out'; this.syncCards();
    this.st = newDriveState(fc.spot.x, fc.spot.z, fc.spot.yaw);
    this.seed = fc.seed; this.doorK = this.doorGoal = 0; v.setDoor(0);
    this.ctx.seats.add(v.driverSeat);
    this.setSolid(true); this.solidCheck = true;
  }

  // FloorOwner: what the salesperson and the catalogue ask of this module
  get model() { return this.def.key as 'berline' | 'suv'; }
  floorCars(): FloorCarInfo[] {
    const sp = this.spec; if (!sp) return [];
    return this.floor.map(fc => {
      const y = fc.spot.yaw, c = Math.cos(y), si = Math.sin(y), w = (lx: number, lz: number) => ({ x: fc.spot.x + c * lx + si * lz, z: fc.spot.z - si * lx + c * lz });
      return { slot: fc.slot, x: fc.spot.x, z: fc.spot.z, yaw: y, stand: w(0.9, sp.length / 2 + 0.95), step: this.stepPoint(fc.spot.x, fc.spot.z, y), name: this.label(), colour: fc.colour, price: this.price(), state: fc.state === 'sold' ? 'out' as const : fc.state, locked: ownsVehicle(this.ctx.state, this.def.asset) ? this.def.text.owned : this.vehicle ? 'Rends d’abord ta voiture d’essai' : null };
    });
  }
  unlockFloor(slot: number) { const fc = this.floor[slot]; if (fc?.state === 'display') fc.state = 'unlocked'; }
  lockFloor(slot: number) { const fc = this.floor[slot]; if (fc?.state === 'unlocked') fc.state = 'display'; }
  trialCar() {
    return this.trial && this.vehicle && this.trialSlot >= 0 && !this.returned ? { x: this.st.x, z: this.st.z, yaw: this.st.yaw, driving: this.driving, slot: this.trialSlot, name: this.label(), price: this.price() } : null;
  }
  returnTrial() {
    if (!this.trial || !this.vehicle || this.driving) return;
    this.returned = true; this.ctx.toast('Rendue : Prestige Auto la reprend, dès qu’elle ne gêne plus la vue.');
  }
  /** « Ouvrir » on the driver's door, with the salesperson's keys: the floor car becomes the player's test vehicle (the same car) and is entered through its door. */
  private enterFloor(slot: number) {
    const fc = this.floor[slot], ctx = this.ctx;
    if (!fc?.vehicle || fc.state !== 'unlocked' || !prestige.hasKeys(this, slot) || this.vehicle || ctx.activities.running) return;
    this.adoptFloor(fc);
    this.trial = true; this.trialSlot = slot; this.returned = false; this.parkedT = 0;
    this.parkedTarget.name = 'Voiture d’essai';
    prestige.trialStarted(this);
    this.beginEntry();
  }
  /** The price and the confirmation (for floor car `slot`, or the trial vehicle in hand), then the purchase right where the car stands. */
  askBuy(slot?: number) {
    const ctx = this.ctx, s = slot ?? this.trialSlot, price = this.price(), why = cannotBuy(ctx.state, this.def.asset);
    const tried = this.trial && s === this.trialSlot && !!this.vehicle;
    const fc = this.floor[s]; if (!tried && (!fc || !fc.vehicle)) return;
    ctx.menu(this.def.text.confirm, `Prix : ${fcfa(price)} · Ton argent : ${fcfa(ctx.state.wallet)}${tried ? '' : ` · ${this.label()} ${fc.colour}`}`, [
      ...(tried ? [] : [{ icon: '🔑', label: 'Essayer gratuitement d’abord', detail: 'Rien n’est payé', right: 'Gratuit', disabled: !!this.vehicle || ownsVehicle(ctx.state, this.def.asset), onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); prestige.requestTrial(this, s); } }]),
      { icon: '✅', label: 'Confirmer l’achat', right: '−' + fcfa(price), detail: why ?? 'Cette voiture-là, là où elle est : pas de livraison, pas de copie', disabled: !!why, onPick: () => this.buyInPlace(s) },
      { icon: '↩️', label: 'Pas maintenant', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }
  /**
   * Bought on the spot: paid once through the asset model, and the car that was chosen (the trial vehicle where the player left it, or the floor car where it
   * stands) becomes the owned vehicle, its parking spot and paint saved. Nothing is delivered and nothing is copied: the bay is simply left empty if the car drives off.
   */
  private buyInPlace(slot: number) {
    const ctx = this.ctx, s = ctx.state, a = this.def.asset;
    ctx.hud.closeModal(); ctx.setMode('play');
    if (!this.hub) return;
    const tried = this.trial && slot === this.trialSlot && !!this.vehicle, fc = this.floor[slot];
    if (!tried && (!fc || !fc.vehicle)) return;
    const why = cannotBuy(s, a); if (why) { ctx.toast(why); return; }
    const at = tried ? { x: this.st.x, z: this.st.z, yaw: this.st.yaw } : { x: fc.spot.x, z: fc.spot.z, yaw: fc.spot.yaw }, seed = tried ? (this.seed || this.def.seed()) : fc.seed;
    park(s.data, { asset: a, hub: this.hub.id, ...at }); setPaintSeed(s.data, a, seed);
    if (!buyAsset(s, a)) { unpark(s.data, a); return; }
    this.bought++; s.count('vehicules'); this.rev = assetsRevision();
    if (!tried) this.adoptFloor(fc);
    this.floor[slot].state = 'sold'; this.syncCards();
    this.trial = false; this.returned = false; this.seed = seed; this.parkedTarget.name = this.def.text.mine;
    ctx.toast(`Elle est à toi ! ${say('Jërëjëf')} : le vendeur te serre la main.`);
    ctx.save();
  }

  // ---------------------------------------------------------------- condition (Pass 3: src/transport/condition.ts, saved in the asset model)
  /** The asset behind the vehicle the player drives; null for a dealer's trial car and the courier's loaner (not theirs: never worn). */
  private asset() { return this.trial || !this.ctx ? null : holding(this.ctx.state, this.def.asset) ?? null; }
  /** Its condition, 0–100 (100 for anything without one: every vehicle bought before this existed is whole). */
  private hp(): number { return this.asset()?.condition ?? 100; }
  /** A hard hit wears the vehicle (a tap, a bump or a scrape costs nothing); a car at 0 stalls where it is. */
  private hurt(im: Impact) {
    const a = this.asset(); if (!a || im.kind !== 'hit') return;
    const lost = hitDamage(im.speed, im.headOn); if (lost <= 0) return;
    const before = a.condition; setCondition(a, before - lost);
    const warn = bandWarning(before, a.condition);
    if (warn) { this.ctx.toast(warn); this.ctx.save(); }                                  // the band changed: kept now, not only when the player gets out
    if (a.condition <= 0) { vehicleAudio.stop(); this.fx.hard = 0; }                      // the engine dies; the car coasts to a stop (its top speed is 0 now)
    this.refreshCard();
  }
  /** In front of the bonnet, where the player works on a car that will not run. */
  private hoodPoint() { const d = this.spec?.drive, f = (d?.halfLength ?? 2) + 0.5; return { x: this.st.x + Math.sin(this.st.yaw) * f, z: this.st.z + Math.cos(this.st.yaw) * f }; }
  /** The roadside fix, physical: the player stands at the bonnet and works for a few seconds (the activity runner's progress bar); only when it finishes the car is lifted to « enough to crawl ». */
  private roadside() {
    const ctx = this.ctx, a = this.asset(); if (!a || !canMakeshift(a.condition)) return;
    const p = this.hoodPoint(), me = ctx.player.pos;
    if (Math.hypot(me.x - p.x, me.z - p.z) > ROADSIDE_REACH) { ctx.toast('Place-toi devant le capot.'); return; }
    const spec: ActivitySpec = {
      id: `${this.def.key}:roadside`, primitive: 'work', label: 'Réparation de fortune', icon: '🔧', quiet: true,
      steps: [{ label: 'Tu bricoles le moteur…', primitive: 'work', seconds: ROADSIDE_SECONDS, then: () => this.roadsideDone() }],
    };
    ctx.activities.start(spec, { place: this.label(), at: p });
  }
  private roadsideDone() {
    const a = this.asset(); if (!a) return;
    const up = roadsideResult(a.condition); if (up <= a.condition) return;
    setCondition(a, up);
    this.ctx.toast('Ça repart, mais au ralenti. Le Garage Modou la remettra en état.'); this.ctx.save();
  }

  /** One contact, felt: the crash (or tap) sound, the shake and the lurch of the camera, the knock of the body, a buzz of the phone where it has one. */
  private onImpact(im: Impact, m: Vehicle) {
    this.bumps++;
    vehicleAudio.impact(im.speed);                                               // a tap or a real impact, by the speed at contact
    const hit = im.kind === 'hit', side = Math.sign(this.st.steer) || 1;
    this.fx.shake = Math.max(this.fx.shake, hit ? 0.35 + 0.65 * im.strength : 0.12);
    this.fx.kickZ = im.dir * (hit ? (im.headOn ? 0.1 + 0.32 * im.strength : 0.05 + 0.12 * im.strength) : 0.03);     // the camera lurches the way the vehicle was going, then settles back
    this.fx.kickX = im.headOn ? 0 : -side * (0.05 + 0.16 * im.strength);                                             // a glancing blow throws it sideways
    m.jolt(im.dir * (hit ? 0.025 + 0.065 * im.strength : 0.008), im.headOn ? 0 : -side * 0.05 * (0.4 + im.strength), hit ? 0.02 + 0.04 * im.strength : 0);
    buzz(impactBuzz(im.kind, im.strength));
    this.feelLog.shakePeak = Math.max(this.feelLog.shakePeak, this.fx.shake);      // read at the knock itself: the frame loop may be slow and decay it before it is seen
    this.feelLog.impacts.push({ kind: im.kind, speed: +im.speed.toFixed(2), strength: +im.strength.toFixed(2), headOn: im.headOn }); if (this.feelLog.impacts.length > 60) this.feelLog.impacts.shift();
  }

  /** A few centimetres of the camera, never the physics: it settles when the engine catches, dips under a hard brake, shakes at a contact (a tap a little, a crash more). */
  private feel(cam: THREE.Camera, dt: number, inside: boolean) {
    const f = this.fx, k = inside ? 0.6 : 1;
    f.settle = Math.max(0, f.settle - dt / 0.9); f.ignite = Math.max(0, f.ignite - dt);
    f.dip += ((f.hard > 0 ? 0.06 : 0) - f.dip) * Math.min(1, dt * 9);
    f.shake = Math.max(0, f.shake - dt * 2.6);
    const t = performance.now() / 1000;
    let y = -0.055 * Math.sin(Math.PI * (1 - f.settle)) - f.dip, x = 0;
    x += Math.sin(t * 170) * 0.006 * (f.ignite / 0.55); y += Math.sin(t * 150) * 0.004 * (f.ignite / 0.55);
    if (f.shake > 0) { x += (Math.random() - 0.5) * 0.14 * f.shake; y += (Math.random() - 0.5) * 0.1 * f.shake; }
    cam.position.x += x * k; cam.position.y += y * k;
    this.feelLog.shakePeak = Math.max(this.feelLog.shakePeak, f.shake);
    if (Math.abs(f.kickZ) > 1e-3 || Math.abs(f.kickX) > 1e-3) {
      cam.translateZ(-f.kickZ * k); cam.translateX(f.kickX * k);                  // along the camera's own axes: forward lurch, sideways throw
      this.feelLog.kickPeak = Math.max(this.feelLog.kickPeak, Math.abs(f.kickZ), Math.abs(f.kickX));
      const keep = Math.max(0, 1 - dt * 9); f.kickZ *= keep; f.kickX *= keep;      // and back in about a third of a second
    } else { f.kickZ = 0; f.kickX = 0; }
  }

  /**
   * Getting in or out through the door: the camera stands off the car's front-left corner, above the neighbouring cars, and looks at the door: the
   * leaf swinging, the body slipping onto the seat. It moves only as far as the open space allows (never into a wall or another car) and eases in and out.
   */
  private doorCam(ctx: GameCtx, m: Vehicle, dt: number) {
    const yaw = this.st.yaw, c = Math.cos(yaw), si = Math.sin(yaw), cols = this.hub?.colliders ?? [];
    const w = (lx: number, lz: number) => ({ x: this.st.x + c * lx + si * lz, z: this.st.z - si * lx + c * lz });
    const aim = w(0.6, 0.15), far = w(2.5, 3.9);
    const free = (x: number, z: number) => !cols.some(cl => !this.solid.includes(cl) && x > cl.x0 - 0.3 && x < cl.x1 + 0.3 && z > cl.z0 - 0.3 && z < cl.z1 + 0.3);
    let k = 1, p = far;
    for (let i = 0; i < 7 && !free(p.x, p.z); i++) { k *= 0.72; p = { x: aim.x + (far.x - aim.x) * k, z: aim.z + (far.z - aim.z) * k }; }
    const cam = ctx.camera, want = new THREE.Vector3(p.x, 1.9 + 0.5 * k, p.z), a = 1 - Math.exp(-dt * 5);
    cam.position.lerp(want, a); cam.lookAt(aim.x, 0.95, aim.z); m.setCockpit(false);
    const base = fovFor(cam.aspect * 1000, 1000); if (Math.abs(cam.fov - base) > 0.01) { cam.fov = base; cam.updateProjectionMatrix(); }
  }

  camera(ctx: GameCtx, dt: number, drag: { yaw: number; pitch: number }): boolean {
    const m = this.vehicle;
    if (m && (this.entry || this.exit)) { const t = performance.now(), real = this.camMs ? Math.min(1, (t - this.camMs) / 1000) : dt; this.camMs = t; this.doorCam(ctx, m, Math.max(dt, real)); return true; }
    if (m && !(this.driving && this.cam.active && this.spec)) m.setCockpit(false);               // never leave the body hidden after the inside view
    if (!m || !this.driving || !this.cam.active || !this.spec) {
      if (this.fovSet) { this.fovSet = false; ctx.camera.fov = fovFor(ctx.camera.aspect * 1000, 1000); ctx.camera.updateProjectionMatrix(); }
      return false;
    }
    const t = performance.now(), real = this.camMs ? Math.min(1, (t - this.camMs) / 1000) : dt; this.camMs = t;
    const a = this.spec.cameras[this.cam.view % this.spec.cameras.length];
    this.cam.update(Math.max(dt, real), ctx.camera, m.pose, m.bounce, a, drag, this.hub?.colliders ?? []);
    this.feel(ctx.camera, Math.max(dt, real), !!a.inside);
    m.setCockpit(!!a.inside);                                  // a solid-shell body's shared cockpit: seen from inside only
    // at the wheel on a phone held upright (narrow field of view): a wider vertical angle so the road shows above the dashboard; the page's own angle comes back outside
    const cam = ctx.camera, base = fovFor(cam.aspect * 1000, 1000), want = a.inside && cam.aspect < 1 ? INSIDE_FOV_PORTRAIT : base;
    if (Math.abs(cam.fov - want) > 0.01) { cam.fov = want; cam.updateProjectionMatrix(); }
    this.fovSet = want !== base;
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
        info: () => ({ id: this.def.asset, name: this.label(), price: this.price(), owned: ownsVehicle(ctx.state, this.def.asset), asset: holding(ctx.state, this.def.asset) ?? null, record: parked(ctx.state.data, this.def.asset), here: !!this.vehicle, trial: this.trial, driving: this.driving, x: this.st.x, z: this.st.z, yaw: this.st.yaw, speed: this.st.speed, bumps: this.bumps, bought: this.bought,
          floor: this.floorCars().map(c => ({ slot: c.slot, state: c.state, x: c.x, z: c.z, stand: c.stand, step: c.step, colour: c.colour, here: !!this.floor[c.slot]?.vehicle })), entry: !!this.entry, exit: !!this.exit, door: +this.doorK.toFixed(2), trialSlot: this.trialSlot, returned: this.returned, seed: this.seed, paint: paintSeed(ctx.state.data, this.def.asset), cockpit: !!this.vehicle?.hasDoor,
          dealer: this.dealer ? { x: this.dealer.site.counter.x, z: this.dealer.site.counter.z, delivery: this.dealer.site.delivery, displays: this.dealer.site.lots ?? this.dealer.site.displays.length, onSale: this.dealer.sale ? this.dealer.sale.group.visible : null, card: !!this.dealer.card } : null,
          space: this.space(), presence: this.presenceSpace(), camera: this.cam.active, views: this.spec?.cameras.map(c => c.id) ?? [], view: this.spec?.cameras[this.cam.view % (this.spec?.cameras.length || 1)]?.id ?? null,
          solid: this.solid.length > 0 && !!this.hub && this.solid.every(c => this.hub!.colliders.includes(c)) }),
        at: () => this.vehicle ? { t: +this.simT.toFixed(3), x: +this.st.x.toFixed(2), z: +this.st.z.toFixed(2), yaw: +this.st.yaw.toFixed(2), speed: +this.st.speed.toFixed(2), driving: this.driving, mounting: !!this.mounting, box: !!this.box, parcel: this.box?.parcel.visible ?? null, pad: ridePad.active } : null,
        card: () => this.card?.text ?? '',
        /** Checks: the vehicle sounds (counts asked and played, whether the engine runs). */
        audio: () => vehicleAudio.info(),
        feel: () => ({ ...this.feelLog, impacts: [...this.feelLog.impacts], shake: this.fx.shake, scrapeFrames: this.scrapeFrames, scraping: vehicleAudio.scraping, contact: this.contact.active }),   // what contacts did (scripts/check-collision.mjs)
        feelReset: () => { this.feelLog = { impacts: [], shakePeak: 0, kickPeak: 0 }; this.scrapeFrames = 0; this.contact.reset(); },
        lab: () => ({ va: vehicleAudio, PROFILES, HORNS }),                                // the audio review's recordings (scripts/audio/render-clips.mjs)
        audioMeter: () => vehicleAudio.meter(),                                   // dBFS of what the vehicle bus plays (scripts/check-horn.mjs)
        audioMute: (on: boolean) => setMuted(on),                                 // the phone's sound setting
        audioSuspend: () => vehicleAudio.suspendForTest(),                        // what a call or the lock screen does to the context
        /** Checks: the bike's speed in m/s while it is ridden (the online check rides above the 6 m/s presence limit). */
        /** Checks: the condition of the player's vehicle, and a hard hit at `speed` (what a crash does). */
        health: () => this.hp(),
        hurt: (speed: number, headOn = true) => this.hurt({ kind: 'hit', speed, strength: Math.min(1, speed / 12), headOn, dir: 1 }),
        own: () => this.buy(),
        boost: (v: number) => { if (this.driving) this.st.speed = v; },
        /** Checks: put the vehicle (and its driver) at a spot, stopped. */
        place: (x: number, z: number, yaw: number) => { if (!this.vehicle) return; this.st.x = x; this.st.z = z; this.st.yaw = yaw; this.st.speed = 0; this.vehicle.place(x, z, yaw, 0, 0, this.st.odo, 0); if (!this.driving) this.setSolid(true); },
      },
    };
  }

  /**
   * What makes a kerb dealer read as a dealership from the street: a coloured strip of forecourt under the cars and the desk,
   * and a canopy over the desk whose fascia repeats the sign toward the road (the pole sign alone looked like street furniture).
   */
  private buildForecourt(site: DealerSite, o: NonNullable<OwnedDef['dealer']>['sign'], sign: THREE.CanvasTexture | null, mesh: (geo: THREE.BufferGeometry, mat: THREE.Material) => THREE.Mesh, hub: HubWorld) {
    const f = { x: Math.sin(site.delivery.yaw), z: Math.cos(site.delivery.yaw) };
    const dx = site.counter.x - site.delivery.x, dz = site.counter.z - site.delivery.z, dAlong = dx * f.x + dz * f.z;
    let nx = dx - f.x * dAlong, nz = dz - f.z * dAlong; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;   // toward the buildings
    const along = (p: { x: number; z: number }) => (p.x - site.counter.x) * f.x + (p.z - site.counter.z) * f.z;
    const lo = Math.min(...site.displays.map(along), 0) - 3.2, hi = Math.max(along(site.delivery) + 2.8, 4);
    const w = (a: number, l: number) => ({ x: site.counter.x + f.x * a + nx * l, z: site.counter.z + f.z * a + nz * l });
    const yaw = Math.atan2(-f.z, f.x), lat = (l: number) => l - 6.2;                                              // lateral measured from the counter's line
    const slab = mesh(new THREE.BoxGeometry(hi - lo, 0.03, 3.1), new THREE.MeshLambertMaterial({ color: o.band }));
    const sc = w((lo + hi) / 2, lat(4.9)); slab.position.set(sc.x, 0.135, sc.z); slab.rotation.y = yaw;
    const roofLen = 5.2, roofC = w(-1.5, lat(6.4));                                    // clear of the pole sign at +2.4
    const roof = mesh(new THREE.BoxGeometry(roofLen, 0.12, 2.6), new THREE.MeshLambertMaterial({ color: o.bg }));
    roof.position.set(roofC.x, 3.7, roofC.z); roof.rotation.y = yaw;
    const plain = new THREE.MeshLambertMaterial({ color: o.bg }), face = new THREE.MeshLambertMaterial({ map: sign });
    const fascia = mesh(new THREE.BoxGeometry(roofLen, roofLen / 3 * 0.62, 0.06), plain); fascia.material = [plain, plain, plain, plain, face, plain];   // the sign on the road side only; high, above the follow camera
    const fc = w(-1.5, lat(5.1)); fascia.position.set(fc.x, 3.7 + 0.06 + roofLen / 3 * 0.31, fc.z); fascia.rotation.y = Math.atan2(-nx, -nz);   // faces the road
    const post = new THREE.BoxGeometry(0.1, 3.6, 0.1), postMat = new THREE.MeshLambertMaterial({ color: 0x3b3f46 });
    // the posts stand at the back, against the buildings, clear of the cars at the kerb; solid like the desk
    for (const a of [-1.5 - roofLen / 2 + 0.15, -1.5 + roofLen / 2 - 0.15]) {
      const p = mesh(post, postMat), q = w(a, lat(7.3)); p.position.set(q.x, 0.12 + 1.8, q.z);
      hub.colliders.push({ x0: q.x - 0.12, x1: q.x + 0.12, z0: q.z - 0.12, z1: q.z + 0.12, h: 3.7 });
    }
  }

  // ---------------------------------------------------------------- the dealer corner
  private buildDealer(ctx: GameCtx, hub: HubWorld) {
    const D = this.def.dealer!, site = D.site(hub);
    if (!site) return;
    if (site.floor) { this.buildFloorDealer(ctx, hub, site, D); return; }
    clearKerb(ctx.extra, hub.colliders, site.kerb);
    const g = new THREE.Group(); g.name = `${this.def.key}:dealer`;
    const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [];
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => { geos.push(geo); mats.push(mat); const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
    const drive = this.spec?.drive;
    let sale: Dealer['sale'] = null, card: THREE.CanvasTexture | null = null;
    site.displays.forEach((s, i) => {
      const b = { group: this.def.visual?.(s.seed) ?? buildVehicle(this.def.kit, { seed: s.seed, driver: false, passengers: false }).group };
      b.group.position.set(s.x, 0.12, s.z); b.group.rotation.y = s.yaw;
      const cols = drive ? footprint(drive, s.x, s.z, s.yaw, this.def.height) : [];
      if (i !== site.forSale) { g.add(b.group); hub.colliders.push(...cols); return; }
      // the one for sale (shown or not by showSale()), its price card on a stand at its nose
      const sg = new THREE.Group(); sg.name = `${this.def.key}:for-sale`; sg.add(b.group); g.add(sg);
      sale = { group: sg, cols };
      if (!site.card) return;
      card = cardTexture(this.label(), fcfa(this.price()), D.sign);
      const c = site.card, white = new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), chrome = new THREE.MeshLambertMaterial({ color: 0xc9cdd2 });
      const k = 1;
      const pole = mesh(new THREE.BoxGeometry(0.03, 0.92 * k, 0.03), chrome); pole.position.set(c.x, 0.12 + 0.46 * k, c.z);
      const back = mesh(new THREE.BoxGeometry(0.52 * k, 0.36 * k, 0.015), white); back.position.set(c.x, 0.12 + 1.08 * k, c.z); back.rotation.y = c.yaw;
      const face = mesh(new THREE.PlaneGeometry(0.5 * k, 0.333 * k), new THREE.MeshBasicMaterial({ map: card }));
      face.position.set(c.x + Math.sin(c.yaw) * 0.009, back.position.y, c.z + Math.cos(c.yaw) * 0.009); face.rotation.y = c.yaw;
      for (const m of [pole, back, face]) { m.removeFromParent(); sg.add(m); }
    });
    const sign = signTexture(D.sign);
    const extraTex: THREE.Texture[] = [];
    {                                                           // a stand has its pole sign
      const sw = site.sign.w ?? 1.5, sh = sw / 3, top = 2.5 + sh;
      const pole = mesh(new THREE.BoxGeometry(0.08, top, 0.08), new THREE.MeshLambertMaterial({ color: 0x3b3f46 }));
      pole.position.set(site.sign.x, 0.12 + top / 2, site.sign.z);
      const plate = mesh(new THREE.BoxGeometry(sw, sh, 0.05), new THREE.MeshLambertMaterial({ map: sign }));
      plate.position.set(site.sign.x, 2.5 + sh / 2, site.sign.z); plate.rotation.y = site.sign.yaw;
    }
    if (site.desk) this.buildForecourt(site, D.sign, sign, mesh, hub);
    if (site.desk) {
      const desk = mesh(new THREE.BoxGeometry(1.3, 0.85, 0.6), new THREE.MeshLambertMaterial({ color: 0x2e5c8a }));
      desk.position.set(site.desk.x, 0.55, site.desk.z); desk.rotation.y = site.desk.yaw;
      const c = Math.abs(Math.cos(site.desk.yaw)), s = Math.abs(Math.sin(site.desk.yaw)), hx = (c * 1.3 + s * 0.6) / 2, hz = (s * 1.3 + c * 0.6) / 2;
      hub.colliders.push({ x0: site.desk.x - hx, x1: site.desk.x + hx, z0: site.desk.z - hz, z1: site.desk.z + hz, h: 1 });
    }
    ctx.extra.add(g);
    this.dealer = { group: g, site, sign, card, mats, geos, sale, extraTex };
    ctx.places.add(shop({
      id: `${this.def.key}:dealer`, name: D.name, space: 'street', catalogue: D.catalogue,
      anchors: [{ id: 'till', kind: 'shop', x: site.counter.x, z: site.counter.z, y: 2.2, radius: 2.8, bias: -0.2 }],
    }, { browse: () => this.openCatalogue() }));
  }

  /**
   * A floor dealer (Prestige Auto): the hall is the world generator's (src/world/prestige.ts); here are its real cars on their bays with their price cards, and
   * the counter place that the phone's map and the guide find. The salesperson (src/transport/prestigeSales.ts) sells them.
   */
  private buildFloorDealer(ctx: GameCtx, hub: HubWorld, site: DealerSite, D: NonNullable<OwnedDef['dealer']>) {
    clearKerb(ctx.extra, hub.colliders, site.kerb);
    const g = new THREE.Group(); g.name = `${this.def.key}:dealer`;
    const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [];
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => { geos.push(geo); mats.push(mat); const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
    const owns = ownsVehicle(ctx.state, this.def.asset), mine = paintSeed(ctx.state.data, this.def.asset), len = this.spec?.length ?? 4.8;
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), gold = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
    this.floor = site.floor!.slots.map((s, i) => {
      const fc: FloorCar = { slot: i, spot: { x: s.x, z: s.z, yaw: s.yaw }, seed: s.seed, colour: s.colour, vehicle: null, cols: [], state: owns && mine === s.seed ? 'sold' : 'display', card: [] };
      if (fc.state !== 'sold') this.spawnFloor(fc);
      // the price card on its stand, at the car's right-front, facing the way the car faces (the street)
      const tex = cardTexture(this.label(), fcfa(this.price()), D.sign); if (tex) this.cardTex.push(tex);
      const y = s.yaw, c = Math.cos(y), si = Math.sin(y), lx = -1.3, lz = len / 2 - 0.55, k = 1.45;
      const cx = s.x + c * lx + si * lz, cz = s.z - si * lx + c * lz;
      const pole = mesh(new THREE.BoxGeometry(0.035, 0.95 * k, 0.035), gold); pole.position.set(cx, 0.12 + 0.475 * k, cz);
      const back = mesh(new THREE.BoxGeometry(0.52 * k, 0.36 * k, 0.018), white); back.position.set(cx, 0.12 + 1.0 * k, cz); back.rotation.y = y;
      const face = mesh(new THREE.PlaneGeometry(0.5 * k, 0.333 * k), new THREE.MeshBasicMaterial({ map: tex })); face.position.set(cx + Math.sin(y) * 0.011, back.position.y, cz + Math.cos(y) * 0.011); face.rotation.y = y;
      fc.card = [pole, back, face];
      return fc;
    });
    this.syncCards();
    ctx.extra.add(g);
    this.dealer = { group: g, site, sign: null, card: null, mats, geos, sale: null, extraTex: [] };
    ctx.places.add(shop({
      id: `${this.def.key}:dealer`, name: D.name, space: 'street', catalogue: D.catalogue,
      anchors: [{ id: 'till', kind: 'shop', x: site.counter.x, z: site.counter.z, y: 2.2, radius: 2.8, bias: this.def.key === 'berline' ? -0.2 : 4 }],
    }, { browse: () => prestige.openCatalogue(ctx) }));
    prestige.register(this);
  }
  /** A price card stands only by a car that is there to be bought. */
  private syncCards() { for (const fc of this.floor) for (const m of fc.card) m.visible = fc.state === 'display' || fc.state === 'unlocked'; }

  /**
   * The vehicle for sale on its lot, with its card: there until the player owns it (the one bought is the one waiting
   * outside); its solid boxes come and go with it.
   */
  private showSale() {
    const s = this.dealer?.sale, cs = this.hub?.colliders; if (!s || !cs) return;
    const on = !ownsVehicle(this.ctx.state, this.def.asset);
    s.group.visible = on;
    for (const c of s.cols) { const i = cs.indexOf(c); if (on && i < 0) cs.push(c); else if (!on && i >= 0) cs.splice(i, 1); }
  }

  private openCatalogue() {
    if (this.dealer?.site.floor) { prestige.openCatalogue(this.ctx); return; }
    const ctx = this.ctx, mine = ownsVehicle(ctx.state, this.def.asset);
    // the free test drive comes first and says so: a player should meet « Essayer gratuitement » before the price
    ctx.menu(this.def.dealer!.name, 'Essaie d’abord, c’est gratuit. Le prix est affiché avant de confirmer l’achat.', [{
      icon: '🔑', label: 'Essayer gratuitement', detail: mine ? this.def.text.owned : `${this.label()} · rien n’est payé · le vendeur la reprend quand tu descends`, right: 'Gratuit',
      disabled: mine || !!this.vehicle, onPick: () => this.tryOut(),
    }, {
      icon: this.def.icon, label: `Acheter · ${this.label()}`, detail: mine ? this.def.text.owned : this.def.detail, right: fcfa(this.price()), disabled: mine,
      onPick: () => this.confirm(),
    }]);
  }

  /**
   * « Essayer »: a free test drive, separate from buying. The dealer's vehicle waits at the kerb like a delivered one, the player gets on and drives it as
   * their own; nothing is paid, owned, listed or saved, and it goes back to the dealer when the player gets off (or leaves the hub, or reloads).
   */
  private tryOut() {
    const ctx = this.ctx;
    ctx.hud.closeModal(); ctx.setMode('play');
    if (!this.dealer || !this.hub || this.vehicle || ownsVehicle(ctx.state, this.def.asset)) return;
    const d = this.dealer.site.delivery;
    this.trial = true;
    this.parkedTarget.name = 'Véhicule d’essai';
    this.spawn(d.x, d.z, d.yaw);
    ctx.toast('Essai gratuit : monte et roule. Le vendeur le reprend quand tu descends.');
  }

  /** The test drive is over: the vehicle goes back to the dealer (nothing was saved). */
  private endTrial() {
    this.trial = false;
    this.parkedTarget.name = this.def.text.mine;
    this.setSolid(false);
    this.vehicle?.dispose(); this.vehicle = null;
    this.box?.dispose(); this.box = null;
  }

  private confirm() {
    const ctx = this.ctx, price = this.price(), why = cannotBuy(ctx.state, this.def.asset);
    ctx.menu(this.def.text.confirm, `Prix : ${fcfa(price)} · Ton argent : ${fcfa(ctx.state.wallet)}`, [
      { icon: '🔑', label: 'Essayer gratuitement d’abord', detail: 'Rien n’est payé', right: 'Gratuit', disabled: !!this.vehicle, onPick: () => this.tryOut() },
      { icon: '✅', label: 'Confirmer l’achat', right: '−' + fcfa(price), detail: why ?? this.def.text.delivered, disabled: !!why, onPick: () => this.buy() },
      { icon: '↩️', label: 'Pas maintenant', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }

  /**
   * Paid once through the asset model (`buyAsset`: the catalogue price, one wallet line « Achat : <name> », listed in
   * « Biens »), then delivered at the kerb.
   */
  private buy() {
    const ctx = this.ctx, s = ctx.state, a = this.def.asset;
    ctx.hud.closeModal(); ctx.setMode('play');
    if (!this.dealer || !this.hub) return;
    if (this.trial && !this.driving) this.endTrial();                       // bought after a test drive: the real one is delivered
    const why = cannotBuy(s, a);
    if (why) { ctx.toast(why); return; }
    park(s.data, { asset: a, hub: this.hub.id, ...this.dealer.site.delivery });   // where sync() delivers it
    if (!buyAsset(s, a)) return;
    this.bought++;
    s.count('vehicules');
    this.sync(); this.rev = assetsRevision();
    ctx.toast(this.def.text.welcome);
    ctx.save();
  }

  // ---------------------------------------------------------------- the vehicle
  private spawn(x: number, z: number, yaw: number) {
    if (!this.spec || !this.hub) return;
    this.setSolid(false);
    this.vehicle?.dispose();
    const m = new Vehicle(this.spec, `${this.hub.id}:${this.def.space}`, 1, this.seed || this.def.seed());
    m.group.name = `${this.def.key}:mine`;
    this.st = newDriveState(x, z, yaw);
    m.place(x, z, yaw, 0, 0, 0, 0);
    this.ctx.seats.add(m.driverSeat);
    this.ctx.extra.add(m.group);
    this.box?.dispose(); this.box = null;
    if (this.def.box) { this.box = buildCourierBox(); this.box.group.position.set(0, 0.8, -this.spec.length / 2 + 0.2); (m.group.children[0] ?? m.group).add(this.box.group); }
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

  /** « Monter »: from where the player stands the body steps to the saddle (a short glide), then takes the seat. */
  private getOn() {
    const ctx = this.ctx, m = this.vehicle; if (!m || this.driving || this.mounting || this.entry || this.exit || ctx.activities.running) return;
    if (m.hasDoor && !ctx.player.seated()) { this.beginEntry(); return; }             // a car with a door of its own: through the door
    const p = ctx.player.pos;
    if (Math.hypot(m.driverSeat.x - p.x, m.driverSeat.z - p.z) > 0.7 && !ctx.player.seated()) { this.mounting = { t: 0, fx: p.x, fz: p.z }; if (this.def.kit !== 'moto') vehicleAudio.door(true); return; }
    this.mountNow();
  }
  private mountNow(doorSound = true) {
    const ctx = this.ctx, m = this.vehicle; if (!m || this.driving || ctx.activities.running) return;
    ctx.player.standUp(true);
    m.place(this.st.x, this.st.z, this.st.yaw, 0, 0, this.st.odo, 0);
    ctx.player.sit(m.driverSeat);
    if (ctx.player.seated()?.id !== m.driverSeat.id) return;
    this.driving = true; this.leaving = false; this.contact.reset(); this.st.speed = 0; this.st.steer = 0;
    this.setSolid(false);
    m.setRidden(true);
    this.cam.begin(ctx.camera, m.pose); this.camMs = 0;
    // the door shuts, the engine cranks and catches, the camera settles a little
    const prof = profileFor(this.def.kit);
    if (this.def.kit !== 'moto' && doorSound) vehicleAudio.door(false);
    const dead = this.hp() <= 0;
    const catches = dead ? 0 : vehicleAudio.start(prof);
    if (dead) { vehicleAudio.crank(prof); ctx.toast(canMakeshift(this.hp()) ? 'Ça ne démarre pas. Descends : une réparation de fortune devant le capot, ou le Garage Modou.' : 'Ça ne démarre pas.'); }
    else vehicleAudio.run(prof, catches);
    this.fx.settle = 1; this.fx.ignite = catches > 0 ? 0.55 : 0.2;
    if (!document.body.classList.contains('touch')) ctx.toast(HINT);          // touch: the pad's own labels say it
    this.refreshCard();
  }

  /**
   * The car has crossed the border road into the next district (src/transport/hubLink.ts). The same car is saved as parked there at the same pose, and the next hub is built around
   * it at the start of the next frame (`crossHub`); `hubLoaded` then seats the player in it again with the speed, steering and camera it had. The engine, the pad and the held
   * fingers are not touched: the player keeps driving.
   */
  private cross(dest: HubId, x: number, z: number) {
    if (this.carry || !this.hub) return;
    const yaw = this.st.yaw;
    this.carry = { x, z, yaw, speed: this.st.speed, steer: this.st.steer, odo: this.st.odo };
    park(this.ctx.state.data, { asset: this.def.asset, hub: dest, x, z, yaw });
    this.ctx.crossHub(dest, { x, z, yaw });
  }
  /** After a crossing: the car stands where it was saved, the player sits in it and drives on at the speed it had. */
  private resume() {
    const c = this.carry!, ctx = this.ctx, m = this.vehicle; this.carry = null;
    if (!m) return;
    this.st.speed = c.speed; this.st.steer = c.steer; this.st.odo = c.odo;
    m.place(this.st.x, this.st.z, this.st.yaw, Math.abs(c.speed), 0, c.odo, 0);
    ctx.player.standUp(true);
    ctx.player.sit(m.driverSeat);
    if (ctx.player.seated()?.id !== m.driverSeat.id) { vehicleAudio.stop(); ridePad.hide(this); this.setSolid(true); return; }   // could not sit: it stays parked here, nothing lost
    this.driving = true; this.leaving = false; this.contact.reset();
    this.setSolid(false);
    m.setRidden(true);
    this.refreshCard();                                        // the camera is kept as it was: it lives relative to the vehicle, so it does not jump with the new coordinates
  }

  /** Off the vehicle, beside it; it stays parked there. `normal`: the player chose to get off. A car with a door steps out through it (stepExit). */
  private getOff(normal: boolean) {
    const ctx = this.ctx, m = this.vehicle; if (!m || !this.driving || !this.hub) return;
    this.driving = false; this.leaving = false; ridePad.hide(this);
    vehicleAudio.stop();
    const door = normal && m.hasDoor && ctx.mode() === 'play';
    if (!door && this.def.kit !== 'moto') { vehicleAudio.door(true); setTimeout(() => vehicleAudio.door(false), 450); }
    this.fx.dip = 0; this.fx.hard = 0;
    if (!door && ctx.player.seated()?.id === m.driverSeat.id) ctx.player.standUp(true);
    this.st.speed = 0;
    m.place(this.st.x, this.st.z, this.st.yaw, 0, 0, this.st.odo, 0);
    m.setRidden(false);                                         // also a fresh model: upright, wheels straight
    this.upright();
    if (!this.trial) park(ctx.state.data, { asset: this.def.asset, hub: this.hub.id, x: this.st.x, z: this.st.z, yaw: this.st.yaw });
    this.setSolid(true);
    this.cam.end();
    const p = this.beside(), floorTrial = this.trial && this.trialSlot >= 0;
    if (door) { this.exit = { t: 0, from: ctx.player.pos.clone(), to: p, stood: false, trial: floorTrial }; ctx.setMode('busy'); }
    else if (normal || !ctx.inside()) ctx.player.place(p.x, p.z, this.st.yaw);
    this.card?.show(null);
    if (this.trial && !floorTrial) { this.endTrial(); ctx.toast('Essai terminé : le vendeur reprend le véhicule.'); }
    else if (!door) { if (floorTrial) { this.parkedT = 0; prestige.trialEnded(this, p.x, p.z); } else if (normal) ctx.toast(this.def.text.parked); }
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
    if (this.def.exit === 'pavement' && !this.vehicle?.hasDoor) {
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
    const hp = this.hp(), tag = healthTag(hp);
    this.card.show({ num: this.def.icon, title: `${this.label()} · ${kmh} km/h${tag ? ' · ' + tag : ''}`, sub: this.leaving ? 'Tu t’arrêtes pour descendre' : hp <= 0 ? 'Le moteur ne tourne plus : descends' : this.fx.hard > 0 ? 'Freinage fort' : HINT, req: healthAlert(hp) });
  }

  private upright() {
    this.lean = 0;
    const body = this.ctx?.player.body();
    if (body) body.group.rotation.z = 0;
  }

  private clear() {
    const ride = this.carry !== null;                           // crossing into the next district: the ride goes on (engine, pad, camera)
    if (this.driving) { this.driving = false; if (!ride) { this.cam.end(); this.upright(); vehicleAudio.stop(); } }
    this.setSolid(false);
    this.mounting = null; this.entry = null; this.exit = null; this.doorK = this.doorGoal = 0; this.doorSound = false;
    this.trial = false; this.trialSlot = -1; this.returned = false; this.seed = 0; this.parkedTarget.name = this.def.text.mine;
    prestige.unregister(this);
    for (const fc of this.floor) { fc.vehicle?.dispose(); fc.card.forEach(m => m.removeFromParent()); }
    this.floor = []; this.floorTargets = []; for (const t of this.cardTex) t.dispose(); this.cardTex = [];
    this.vehicle?.dispose(); this.vehicle = null;
    this.box?.dispose(); this.box = null; if (!ride) ridePad.hide(this);
    if (this.dealer) {
      for (const geo of this.dealer.geos) geo.dispose();
      for (const mat of this.dealer.mats) mat.dispose();
      this.dealer.group.removeFromParent(); this.dealer.sign?.dispose(); this.dealer.card?.dispose(); for (const t of this.dealer.extraTex) t.dispose(); this.dealer = null;
    }
    this.card?.show(null);
    this.hub = null;
  }

  // ---------------------------------------------------------------- targets
  private parkedAff: Affordance[] = [];
  private rideAff: Affordance[] = [];

  private collectFloor(x: number, z: number, out: Target[]) {
    const d = this.spec?.drive; if (!d) return;
    for (const fc of this.floor) {
      if (!fc.vehicle || (fc.state !== 'display' && fc.state !== 'unlocked')) continue;
      const s = fc.spot, keys = fc.state === 'unlocked' && prestige.hasKeys(this, fc.slot), reach = keys ? 1.3 : this.def.reach;
      if (Math.hypot(s.x - x, s.z - z) > d.halfLength + reach + 0.5) continue;
      const t = (this.floorTargets[fc.slot] ??= { id: `${this.def.key}:floor:${fc.slot}`, name: '', kind: 'vehicle', space: 'street', x: 0, z: 0, y: 1.6, radius: reach, bias: -0.2, affordances: () => this.floorAffordances(fc.slot) });
      if (keys) { const p = this.stepPoint(s.x, s.z, s.yaw); t.x = p.x; t.z = p.z; }
      else {
        const c = Math.cos(s.yaw), si = Math.sin(s.yaw), dx = x - s.x, dz = z - s.z;
        const lx = Math.max(-d.halfWidth, Math.min(d.halfWidth, dx * c - dz * si)), lz = Math.max(-d.halfLength, Math.min(d.halfLength, dx * si + dz * c));
        t.x = s.x + lx * c + lz * si; t.z = s.z - lx * si + lz * c;
      }
      t.radius = reach; t.name = `${this.label()} · ${fc.colour}`;
      out.push(t);
    }
  }
  private floorAffordances(slot: number): Affordance[] {
    const fc = this.floor[slot], ctx = this.ctx, mine = ownsVehicle(ctx.state, this.def.asset); if (!fc) return [];
    if (fc.state === 'unlocked') {
      if (prestige.hasKeys(this, slot)) return [{ id: 'ouvrir', verb: 'open', label: 'Ouvrir', icon: '🚪', detail: 'Portière conducteur', run: () => this.enterFloor(slot) }];
      return [{ id: 'attente', verb: 'wait', label: 'Le vendeur apporte les clés', icon: '🔑', disabled: 'Un instant…', run: () => {} }];
    }
    return [
      { id: 'essayer', verb: 'drive', label: 'Essayer cette voiture', icon: '🔑', detail: 'Gratuit · le vendeur t’apporte les clés', disabled: mine ? this.def.text.owned : this.vehicle ? 'Rends d’abord ta voiture d’essai' : null, run: () => prestige.requestTrial(this, slot) },
      { id: 'acheter', verb: 'buy', label: `Acheter · ${fcfa(this.price())}`, icon: '💰', detail: 'Le prix est affiché, tu confirmes avant de payer', disabled: mine ? this.def.text.owned : this.vehicle ? 'Rends d’abord ta voiture d’essai' : null, run: () => this.askBuy(slot) },
    ];
  }

  private collect(space: string, x: number, z: number, out: Target[]) {
    if (this.floor.length && space === 'street' && !this.driving && !this.entry && !this.exit) this.collectFloor(x, z, out);
    const m = this.vehicle, d = this.spec?.drive; if (!m || !this.hub || !d || this.entry || this.exit || this.returned) return;
    if (this.driving) { if (space === this.space()) { const t = this.rideTarget; t.space = space; t.x = x; t.z = z; out.push(t); } return; }
    if (space !== 'street' || Math.abs(this.st.x - x) > d.halfLength + this.def.reach || Math.abs(this.st.z - z) > d.halfLength + this.def.reach) return;
    // the target sits on the body's edge nearest to the player (a 4.5 m car is reached from its door, its boot…)
    const c = Math.cos(this.st.yaw), s = Math.sin(this.st.yaw), dx = x - this.st.x, dz = z - this.st.z;
    const lx = Math.max(-d.halfWidth, Math.min(d.halfWidth, dx * c - dz * s)), lz = Math.max(-d.halfLength, Math.min(d.halfLength, dx * s + dz * c));
    const t = this.parkedTarget; t.x = this.st.x + lx * c + lz * s; t.z = this.st.z - lx * s + lz * c;
    const tag = healthTag(this.hp()); t.name = tag ? `${this.def.text.mine} · ${tag}` : this.def.text.mine;     // a discreet figure once it has a scratch
    if (m.hasDoor) { const p = this.stepPoint(); t.x = p.x; t.z = p.z; }                // a car with a door: offered at the driver's door
    out.push(t);
  }

  private trialAff: Affordance[] = [];
  private parkedAffordances(): Affordance[] {
    if (this.trial && this.trialSlot >= 0) {
      if (!this.trialAff.length) this.trialAff = [
        { id: 'monter', verb: 'drive', label: 'Monter (essai)', icon: this.def.icon, run: () => this.getOn() },
        { id: 'acheter', verb: 'buy', label: '', icon: '💰', run: () => this.askBuy() },
        { id: 'rendre', verb: 'use', label: 'Rendre la voiture d’essai', icon: '🔑', run: () => this.returnTrial() },
      ];
      this.trialAff[0].disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : null;
      this.trialAff[1].label = `Acheter · ${fcfa(this.price())}`;
      return this.trialAff;
    }
    if (!this.parkedAff.length) this.parkedAff = [{ id: 'monter', verb: 'drive', label: this.def.text.getOn, icon: this.def.icon, run: () => this.getOn() }];
    this.parkedAff[0].disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : null;
    this.parkedAff[0].detail = healthAlert(this.hp()) ?? undefined;
    if (!this.trial && canMakeshift(this.hp())) {                                                // a car that will not run: the roadside fix, free, at the bonnet
      this.fixAff ??= { id: 'bricoler', verb: 'work', label: 'Réparation de fortune', icon: '🔧', detail: 'Gratuit · devant le capot, quelques secondes · elle repart au ralenti, sans plus', run: () => this.roadside() };
      const p = this.hoodPoint(), me = this.ctx.player.pos;
      this.fixAff.disabled = this.ctx.activities.running ? 'Termine d’abord ce que tu fais' : Math.hypot(me.x - p.x, me.z - p.z) > ROADSIDE_REACH ? 'Place-toi devant le capot' : null;
      return [this.parkedAff[0], this.fixAff];
    }
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

/** The price card of the vehicle for sale, in the dealer's colours: its catalogue name and price (fictional names only). */
function cardTexture(name: string, price: string, o: NonNullable<OwnedDef['dealer']>['sign']): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 240; cv.height = 160;
  const c = cv.getContext('2d'); if (!c) return null;
  c.fillStyle = o.band; c.fillRect(0, 0, 240, 160);
  c.fillStyle = '#ffffff'; c.fillRect(6, 6, 228, 148);
  c.fillStyle = o.bg; c.fillRect(6, 6, 228, 36);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = o.band; c.font = '900 24px system-ui, sans-serif'; c.fillText('VOITURE', 120, 25, 216);
  c.fillStyle = '#1d1f24'; c.font = '700 19px system-ui, sans-serif'; c.fillText(name, 120, 66, 216);
  c.font = '900 34px system-ui, sans-serif'; c.fillText(price, 120, 106, 220);
  c.fillStyle = o.bg; c.font = '800 15px system-ui, sans-serif'; c.fillText('À VENDRE · PRIX FIXE', 120, 140, 216);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** The dealer's sign, drawn in code (fictional names only). */
function signTexture(o: NonNullable<OwnedDef['dealer']>['sign']): THREE.CanvasTexture | null {
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
