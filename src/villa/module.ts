import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import type { Affordance, Target } from '../interact/types';
import { HELIPAD, LOT, POOL, STOREY, VILLA_ID } from '../housing/villa';
import { holding } from '../economy/assets';
import { homeSpec } from '../economy/catalog';
import { homeOrigin } from '../economy/placement';
import { estateVisit } from '../economy/estate';
import { online } from '../online/api';
import { openInvites } from '../online/visitRules';
import { OWNED_VEHICLES } from '../transport/fleet';
import { parked, type VehicleAsset } from '../transport/owned';
import { rideHooks, type OwnedVehicleModule } from '../transport/ownedModule';
import { Batch } from '../world/batch';
import { buildHelicopter } from '../world/helicopter';
import { GATE_FREE, gateFor, gateWants, stepGate, type VillaHold } from './gate';
import { BAYS_HUB, freeBay, inYard, parkWhy } from './bays';
import { VillaSwim } from './swim';
import { VillaReception } from './reception';

/**
 * LD2.0-D « Owner flagship villa », lane V-E: the villa's life (docs/ld2/LD2_D.md). One module on the shared seam (src/game/modules.ts):
 *  - the street compound's sliding gate (src/world/villaCompound.ts draws it): slid open and shut by its rule (src/villa/gate.ts), its solid box in
 *    the hub's colliders following the panel;
 *  - « Garer à la villa » at the wheel in the front yard (src/villa/bays.ts): the vehicle into the nearest free bay, saved like any parking;
 *  - the swim (src/villa/swim.ts) and the small reception (src/villa/reception.ts) inside the villa;
 *  - the helicopter on the roof terrace: « Regarder l'hélicoptère » (its sheet: the flights come with the airport), the model added to the
 *    interior's roof when the interior has none of its own.
 * Debug (`?debug`): `__dakar.villa`.
 */
const VILLA_HUB = 'almadies';
const ALL_VEHICLES: VehicleAsset[] = ['jakarta', 'compacte', 'teranga', 'rafet', 'berline', 'tout_terrain', 'gainde'];
const BAY_DETAIL = BAYS_HUB.map(b => `Place ${b.i + 1} · elle t’attend ici, même après une pause`);

class VillaModule implements GameModule {
  readonly name = 'villa';
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  /** The gate: its mesh, its box, how far the panel slides, how open it is (0…1), whether the box is in the hub's colliders, its full east edge. */
  private gate: { mesh: THREE.Object3D; col: Collider; travel: number; k: number; solid: boolean; x1: number } | null = null;
  private swim!: VillaSwim;
  private reception!: VillaReception;
  private parkAff: Affordance = { id: 'garer_villa', verb: 'alight', label: 'Garer à la villa', icon: '🅿️', run: () => {} };
  private parkFor: OwnedVehicleModule | null = null;
  private mine: { x: number; z: number }[] = [];
  /** Accepted invitations to a villa (read again each second). */
  private invited = false; private inviteT = 0;
  private heliTarget: Target;
  private heliAff: Affordance[];
  private heli: THREE.Group | null = null;
  /** The interior group the helicopter was looked for in (a new one is looked at again). */
  private heliIn: THREE.Object3D | null = null;
  private basin: THREE.Mesh | null = null;
  /**
   * What the villa's life adds inside the house (the swimmer's ripple, the reception's guests and buffet, a debug basin): in the scene itself, shown only
   * while the player is in their own villa (the street's `extra` group is hidden indoors, and the interior's own group is rebuilt with the furniture).
   */
  readonly room = new THREE.Group();
  readonly log = { opened: 0, shut: 0, parked: [] as { asset: string; bay: number }[], heli: 0 };

  constructor() {
    this.heliAff = [{ id: 'helico', verb: 'inspect', label: 'Regarder l’hélicoptère', icon: '🚁', run: () => this.heliSheet() }];
    // bias: the aircraft keeps the player 2 to 3 m from the pad's centre, where the target is: it still comes before the home's own « Commander des
    // meubles », always at the player (src/economy/estate.ts collectSelf, bias 2.6)
    this.heliTarget = { id: 'villa:helico', name: 'L’hélicoptère', kind: 'spot', space: 'home', x: 0, z: 0, y: 1.6, radius: 4.2, bias: -1.6, affordances: () => this.heliAff };
  }

  init(ctx: GameCtx) {
    this.ctx = ctx;
    this.room.name = 'villa-life'; this.room.visible = false; ctx.scene.add(this.room);
    this.swim = new VillaSwim(ctx, this.room, () => this.hold(), () => this.ownOrigin());
    this.reception = new VillaReception(ctx, this.room, () => this.hold(), () => this.ownOrigin(), () => this.tiered());
    ctx.interactions.add({ name: 'villa', collect: (space, x, z, out) => this.collect(space, x, z, out) });
    rideHooks.extra = m => this.parkOffer(m);
  }

  hubLoaded(_ctx: GameCtx, hub: HubWorld) {
    this.swim.reset(); this.reception.reset(); this.debugBasin(false);
    this.hub = hub; this.gate = null; this.heli = null; this.heliIn = null;
    const g = hub.id === VILLA_HUB ? hub.group.getObjectByName('villa-compound') : null;
    const mesh = g?.getObjectByName('villa-gate'), col = g?.userData.gate as Collider | undefined;
    if (g && mesh && col) this.gate = { mesh, col, travel: g.userData.gateTravel as number, k: 0, solid: hub.colliders.includes(col), x1: col.x1 };
  }

  // ------------------------------------------------------------------------------------------------ who
  /** How the player holds the villa: owned, rented, or not at all. */
  hold(): VillaHold { const a = holding(this.ctx.state, VILLA_ID); return a?.how === 'owned' ? 'owned' : a?.how === 'rented' ? 'rented' : null; }
  /** A guest with an accepted, unexpired invitation to a villa like this one (src/online/visit.ts). */
  private invitedNow(dt: number) {
    if ((this.inviteT -= dt) > 0) return this.invited;
    this.inviteT = 1;
    const api = online, me = api?.me?.tag ?? null, now = this.ctx.now();
    this.invited = !!api && api.convs().some(c => !c.blocked && c.with !== me && openInvites(api.items(c.with), c.with, now).some(i => i.home.spec === VILLA_ID));
    return this.invited;
  }
  /** The player is in their own villa (not a guest's visit, not « Visiter » an empty one they do not hold). */
  private inOwnVilla() {
    const i = this.ctx.inside(); if (!i || i.door.id !== homeSpec(VILLA_ID)?.home.door) return false;
    const v = estateVisit.inside();
    return !!v && v.spec === VILLA_ID && !v.visit && this.hold() !== null;
  }
  /** The interior's origin (src/economy/placement.ts homeOrigin) while the player is in their own villa. */
  private ownOrigin() { return this.inOwnVilla() ? homeOrigin(VILLA_ID) : null; }
  /** The villa's interior has its three levels and its garden (lane V-S: `Interior.groundAt`). */
  private tiered() { const int = this.ctx.inside()?.int as unknown as { groundAt?: unknown } | undefined; return typeof int?.groundAt === 'function'; }

  // ------------------------------------------------------------------------------------------------ every frame
  update(_ctx: GameCtx, dt: number) {
    const allowed = gateFor(this.hold(), this.invitedNow(dt));
    this.stepGate(dt, allowed);
    this.swim.update(dt);
    const own = this.inOwnVilla();
    this.room.visible = own;
    this.reception.update(dt, own);
    if (own) { const g = this.ctx.inside()!.int.group; if (this.heliIn !== g) { this.heliIn = g; this.roofHeli(g); } }   // (the interior is rebuilt with its upgrades)
  }

  private readonly sense = { px: 0, pz: 0, driving: false, allowed: false };
  private stepGate(dt: number, allowed: boolean) {
    const g = this.gate, hub = this.hub; if (!g || !hub) return;
    const ctx = this.ctx, p = ctx.player.pos, q = this.sense;
    q.px = p.x - LOT.cx; q.pz = p.z - LOT.cz; q.driving = ctx.player.seated()?.kind === 'vehicle'; q.allowed = allowed;   // (src/villa/gate.ts toPlan, without a new object each frame)
    const want = !ctx.inside() && gateWants(q, g.k);
    const k = stepGate(g.k, want, dt);
    if (k === g.k) return;
    if (g.k === 0 && k > 0) this.log.opened++;
    if (k === 0 && g.k > 0) this.log.shut++;
    g.k = k;
    g.mesh.position.x = -g.travel * k;
    // the box covers what the panel still shuts of the opening; out of the colliders once the way is free
    g.col.x1 = Math.max(g.col.x0 + 0.05, g.x1 - g.travel * k);
    const free = k >= GATE_FREE;
    if (free && g.solid) { const i = hub.colliders.indexOf(g.col); if (i >= 0) hub.colliders.splice(i, 1); g.solid = false; }
    else if (!free && !g.solid) { hub.colliders.push(g.col); g.solid = true; }
  }

  // ------------------------------------------------------------------------------------------------ the bays
  private parkOffer(m: OwnedVehicleModule): Affordance | null {
    const hub = this.hub; if (!hub || hub.id !== VILLA_HUB || m.onTrial || m.def.asset === 'tiak') return null;
    const car = m.carNow(); if (!car || !car.driving || !inYard(car.x, car.z)) return null;
    const bay = freeBay(car.x, car.z, this.othersParked(m.def.asset));
    const why = parkWhy({ hold: this.hold(), own: true, inYard: true, speed: car.speed, bay });
    if (why === undefined) return null;
    this.parkFor = m;
    this.parkAff.disabled = why;
    this.parkAff.detail = bay && !why ? BAY_DETAIL[bay.i] : undefined;
    this.parkAff.run = () => this.park();
    return this.parkAff;
  }
  /** Where the player's other vehicles stand parked in this district (the only ones that take a bay). */
  private othersParked(except: VehicleAsset) {
    const out = this.mine; out.length = 0;
    for (const a of ALL_VEHICLES) {
      if (a === except) continue;
      const p = parked(this.ctx.state.data, a);
      if (p && p.hub === VILLA_HUB && holding(this.ctx.state, a)) out.push(p);
    }
    return out;
  }
  /** « Garer à la villa »: into the nearest free bay, nose to the house, the driver out beside it; saved. */
  park(): boolean {
    const m = this.parkFor ?? OWNED_VEHICLES.find(v => v.ridden) ?? null; if (!m) return false;
    const car = m.carNow(); if (!car || !car.driving || !inYard(car.x, car.z)) return false;
    const bay = freeBay(car.x, car.z, this.othersParked(m.def.asset)); if (!bay) { this.ctx.toast('Les deux places sont prises.'); return false; }
    if (!m.parkAt(bay.x, bay.z, bay.yaw)) return false;
    this.log.parked.push({ asset: m.def.asset, bay: bay.i });
    this.ctx.toast(`Garé à la villa ✓ · place ${bay.i + 1}`);
    this.ctx.save();
    return true;
  }

  // ------------------------------------------------------------------------------------------------ inside the villa
  private collect(space: string, x: number, z: number, out: Target[]) {
    if (space !== 'home' || !this.inOwnVilla()) return;
    this.swim.collect(space, x, z, out);
    if (this.swim.swimming) return;
    this.reception.collect(space, x, z, out);
    const o = homeOrigin(VILLA_ID)!, p = this.ctx.player.pos;
    if (p.y > STOREY * 2 - 1 && Math.hypot(o.x + HELIPAD.x - x, o.z + HELIPAD.z - z) < HELIPAD.r + 2.5) {   // on the roof terrace, by the pad
      this.heliTarget.x = o.x + HELIPAD.x; this.heliTarget.z = o.z + HELIPAD.z;
      this.heliTarget.y = p.y + 1.6;                     // the prompt at the roof's height: a target is picked only within its floor's band (src/interact/system.ts)
      out.push(this.heliTarget);
    }
  }
  private heliSheet() {
    const ctx = this.ctx; this.log.heli++;
    const rows = [['Modèle', 'Hélicoptère léger, quatre places'], ['Rotor', '7,2 m, deux pales'], ['Livrée', 'blanc nacré, ventre bleu nuit, filet or'], ['Vols', 'ils arriveront avec l’aéroport']];
    ctx.menu('L’hélicoptère', 'Sur le toit de ta villa', [{ icon: '👍', label: 'Fermer', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } }],
      `<div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><p class="soon">Pas de vol pour l’instant : les hélicoptères décolleront quand l’aéroport ouvrira.</p>`);
  }
  /** The helicopter on the interior's roof pad (when the interior has its roof and none of its own). */
  private roofHeli(g: THREE.Object3D) {
    this.heli = null;
    if (!this.tiered()) return;
    const own = g.getObjectByName('helicopter'); if (own) { this.heli = own as THREE.Group; return; }
    const o = homeOrigin(VILLA_ID)!, h = buildHelicopter();
    h.group.position.set(o.x + HELIPAD.x, 0.1 + 2 * STOREY, o.z + HELIPAD.z);
    g.add(h.group); this.heli = h.group;
  }

  /** Debug: a pool basin drawn at the contract's POOL in the open-plan interior (before lane V-S's three levels), to try the swim there. */
  private debugBasin(on: boolean) {
    if (this.basin) { this.basin.geometry.dispose(); (this.basin.material as THREE.Material).dispose(); this.basin.removeFromParent(); this.basin = null; }
    if (!on) return false;
    const o = homeOrigin(VILLA_ID)!, b = new Batch(), X = (x: number) => o.x + x, Z = (z: number) => o.z + z;
    const pw = POOL.x1 - POOL.x0, pd = POOL.z1 - POOL.z0, cx = (POOL.x0 + POOL.x1) / 2, cz = (POOL.z0 + POOL.z1) / 2;
    b.box(pw + 6, 0.1, 1.6, X(cx), 0, Z(POOL.z1 + 0.8), 0xdccfb6); b.box(pw + 6, 0.1, 1.6, X(cx), 0, Z(POOL.z0 - 0.8), 0xdccfb6);
    b.box(3, 0.1, pd, X(POOL.x0 - 1.5), 0, Z(cz), 0xdccfb6); b.box(3, 0.1, pd, X(POOL.x1 + 1.5), 0, Z(cz), 0xdccfb6);
    b.box(pw, 0.02, pd, X(cx), 0.05, Z(cz), 0x2fa8d8);                               // the water's surface at the swim's WATER_Y
    b.box(pw, 0.02, pd, X(cx), -1.3, Z(cz), 0x7cc6dd);
    this.basin = b.build(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82 }), true, false);
    if (this.basin) { this.basin.name = 'villa-debug-basin'; this.room.add(this.basin); }
    return true;
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    const self = this;
    return {
      villa: {
        hold: () => self.hold(),
        inOwnVilla: () => self.inOwnVilla(),
        tiered: () => self.tiered(),
        gate: () => (self.gate ? { k: self.gate.k, solid: self.gate.solid, collider: { ...self.gate.col }, panelX: self.gate.mesh.position.x } : null),
        bays: () => BAYS_HUB.map(b => ({ ...b })),
        park: () => self.park(),
        parkOffer: () => { const m = OWNED_VEHICLES.find(v => v.ridden); const a = m ? self.parkOffer(m) : null; return a ? { label: a.label, disabled: a.disabled ?? null } : null; },
        swim: { ...self.swim.hooks(), basin: (on = true) => self.debugBasin(on) },   // info, start, stop, geometry, at, hold (src/villa/swim.ts)
        reception: { info: () => self.reception.info(), ask: () => self.reception.ask() },
        heli: () => ({ inRoof: !!self.heli, sheets: self.log.heli }),
        /** Pictures only: a helicopter standing at (x, y, z) of the district (null removes it). */
        heliAt: (x: number | null, y = 0.1, z = 0, yaw = 0) => {
          ctx.extra.getObjectByName('villa-debug-heli')?.removeFromParent();
          if (x === null) return false;
          const h = buildHelicopter(); h.group.name = 'villa-debug-heli'; h.group.position.set(x, y, z); h.group.rotation.y = yaw; ctx.extra.add(h.group);
          return { footprint: h.footprint, cost: h.cost };
        },
        /**
         * Pictures only, before lane V-S's facade lands: the stand-in house (a plain box up to the parapet's top) cut down to the roof terrace's level
         * (2 × STOREY), so the helicopter is seen standing where the real roof will carry it.
         */
        roofPreview: (on = true) => {
          const f = self.hub?.group.getObjectByName('villa-compound')?.getObjectByName('villa-facade'); if (!f) return false;
          f.scale.y = on ? (2 * STOREY) / (2 * STOREY + 1.1) : 1;
          return true;
        },
        origin: () => homeOrigin(VILLA_ID),
        log: () => JSON.parse(JSON.stringify(self.log)),
        inside: () => ctx.inside()?.door.id ?? null,
      },
    };
  }
}

export const villaModule = new VillaModule();
