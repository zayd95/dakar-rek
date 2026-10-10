import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import { buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { signTexture } from '../world/batch';
import { rng } from '../core/rng';
import * as P from '../activity/primitives';
import { fcfaText } from '../economy/format';
import { CAR_GUARD } from '../i18n/lines';
import { car } from '../transport/carModule';
import { carSpec, sedanSeed, SEDAN_BLUE, SEDAN_WHITE } from '../transport/car';
import type { DriveSpec } from '../transport/spec';
import { footprint } from '../transport/ownedModule';
import { clearKerb } from '../transport/passengers';
import { arenaExterior, eveningSize } from './exterior';
import { arenaShow } from './module';
import { GALA_DONE_COUNTER, streetAt, type Street } from './program';
import { CAR_CAP, CAR_FEE, CAR_FEE_COUNTER, CAR_LOOKS, carCount, carLot, carPaidTonight, carTaken, inCarLot, type CarLot } from './carParkRules';

/**
 * Getting to the fight by car (rules in src/arena/carParkRules.ts), after the moto's guarded parking (src/arena/arrival.ts):
 * - A few places at the kerb of the side street east of the arena, off the queue lane and Ligne 23's evening route. The
 *   « gardien du parking » greets a player who gets out of their car there and asks 200 F, shown before paying and paid
 *   once per evening (the universal runner, one wallet line). He puts the car in the place he keeps next to him, the one
 *   in front left free to pull out (src/transport/ownedModule.ts moveParked, saved like any parking spot), so it is
 *   found again after the bout. When the player drives away he says goodbye: Wolof with its gloss, French narration.
 * - Other cars (instanced: a body and a glass mesh per look, looks by quality) fill the places as the doors open, a gala
 *   night fills them, and leave after the gala; they are solid. The city lane's evening cars (src/city/arena.ts) leave
 *   this stretch of kerb to him.
 * No new mechanics: places, the runner, the owned vehicle's parking record.
 */

/** Distance within which the places are drawn. */
const VIEW = 90;
/** Height of a parked car's footprint (src/transport/carModule.ts). */
const CAR_H = 1.45;
/** Looks of the other cars, in the order the qualities add them (none is the player's silver saloon). */
const LOOKS: { kind: VehicleKind; seed: () => number }[] = [
  { kind: 'sedan', seed: () => sedanSeed(SEDAN_WHITE) },
  { kind: 'suv', seed: () => 4242 },
  { kind: 'sedan', seed: () => sedanSeed(SEDAN_BLUE) },
];
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

interface Look { body: THREE.InstancedMesh; glass: THREE.InstancedMesh | null; drive: DriveSpec | null }

class CarPark {
  readonly lot: CarLot;
  readonly group = new THREE.Group();
  private gardien: Humanoid | null = null;
  private looks: Look[] = [];
  private solid: Collider[] = [];
  private own: { dispose(): void }[] = [];
  private shownKey = '';
  /** Other cars in the places now (the places' indices). */
  taken: number[] = [];
  street: Street = 'quiet';
  private afterT = 0;
  private afterFrom = 0;
  private lastCount = 0;
  /** The player was driving last frame; the car stood in his places when they got in. */
  private wasDriving = false;
  private droveFromLot = false;
  private lastParked: { x: number; z: number } | null = null;
  private byeDay = -1;
  /** What the gardien said, for the checks. */
  said: string[] = [];

  constructor(private ctx: GameCtx, hub: HubWorld) {
    this.lot = carLot(hub.arena!);
    this.group.name = 'arena_car_parking'; this.group.userData.noLod = true;
    // the kerb lane: no parked car of the street there (the player's own car, parked in its place after a reload, stays)
    const mine = car.parkedHere(), ownCar = (c: Collider) => !!mine && c.h <= 1.6 && Math.hypot((c.x0 + c.x1) / 2 - mine.x, (c.z0 + c.z1) / 2 - mine.z) < 3;
    const k = this.lot.kerb, before = hub.colliders.filter(ownCar);
    clearKerb(ctx.extra, hub.colliders, [{ x: k.x, z: k.z, dx: 0, dz: 1, rx: -1, rz: 0, offset: 4.3, from: -k.half, to: k.half }]);
    for (const c of before) if (!hub.colliders.includes(c)) hub.colliders.push(c);
    // places that a builder's collider covers are dropped (the reserved one moves to the next free place, with its free one ahead)
    const free = (s: { x: number; z: number }) => !hub.colliders.some(c => !ownCar(c) && s.x > c.x0 - 1.0 && s.x < c.x1 + 1.0 && s.z > c.z0 - 2.4 && s.z < c.z1 + 2.4);
    const ok = this.lot.slots.map(free);
    if (!ok[this.lot.reserved]) { const r = ok.findIndex(Boolean); if (r >= 0) { this.lot.reserved = r; this.lot.ahead = ok.findIndex((v, i) => v && i > r); } }
    const kept = this.lot.slots[this.lot.reserved], ahead = this.lot.slots[this.lot.ahead];
    this.lot.slots = this.lot.slots.filter((_s, i) => ok[i] || i === this.lot.reserved);
    this.lot.reserved = this.lot.slots.indexOf(kept); this.lot.ahead = ahead ? this.lot.slots.indexOf(ahead) : -1;

    // the other cars: per look, one instanced body and one instanced glass, as many instances as places
    const base = carSpec().drive ?? null;
    for (const L of LOOKS) {
      const b = buildVehicle(L.kind, { seed: L.seed(), driver: false, passengers: false, lod: 'near' });
      const body = b.group.getObjectByName('body') as THREE.Mesh | undefined, glass = b.group.getObjectByName('glass') as THREE.Mesh | undefined;
      if (!body) continue;
      const inst = (m: THREE.Mesh, name: string) => {
        const x = new THREE.InstancedMesh(m.geometry, m.material as THREE.Material, this.lot.slots.length);
        x.name = name; x.count = 0; x.visible = false; x.castShadow = false;
        this.group.add(x); this.own.push(x);
        return x;
      };
      this.looks.push({ body: inst(body, 'arena_parked_cars'), glass: glass ? inst(glass, 'arena_parked_cars_glass') : null,
        drive: base ? { ...base, halfWidth: b.spec.width / 2, halfLength: b.spec.length / 2 } : null });
    }
    // the gardien (a yellow tee) and his sign
    if (humanoidReady()) {
      const R = rng(2711), h = new Humanoid({ ...randomLook(R), style: 'tee', top: 0xf2c230, pattern: 'uni', female: false });
      const g = this.lot.gardien;
      h.group.position.set(g.x, 0.1 + hub.heightAt(g.x, g.z), g.z); h.group.rotation.y = g.yaw; h.hold = 'Idle';
      this.group.add(h.group); this.gardien = h;
    }
    const sg = this.lot.sign, tex = signTexture('PARKING VOITURES · GARDIEN', '#1b2a7a', '#ffd98a', 512, 128);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.3, 0.07), new THREE.MeshLambertMaterial({ color: 0x3b3f46 }));
    pole.position.set(sg.x, 1.25, sg.z);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    plate.position.set(sg.x + Math.sin(sg.yaw) * 0.05, 2.35, sg.z + Math.cos(sg.yaw) * 0.05); plate.rotation.y = sg.yaw;
    this.group.add(pole, plate);
    this.own.push(pole.geometry, pole.material as THREE.Material, plate.geometry, plate.material as THREE.Material, tex);
    hub.colliders.push({ x0: sg.x - 0.12, x1: sg.x + 0.12, z0: sg.z - 0.12, z1: sg.z + 0.12, h: 2.4 });

    // the gardien is a place of the shared registry: the fee (price first, paid once), a word with him
    ctx.places.add({
      id: `${hub.id}:arena:parking-voitures`, type: 'parking', name: 'Parking voitures · Arène', space: 'street',
      anchors: [{ id: 'gardien', name: 'Le gardien du parking', kind: 'person', x: this.lot.gardien.x, z: this.lot.gardien.z, y: 2.1, radius: 2.8 }],
      offers: { gardien: [
        P.handOver('buy', { id: 'garder', label: `Faire garder ta voiture (${fcfaText(CAR_FEE)})`, detail: 'Payés une fois pour la soirée', icon: '🚗',
          visible: () => this.present() && !this.paid() && this.mineInLot(), then: () => this.confirm() }),
        P.talk({ id: 'parler', label: 'Saluer le gardien', visible: () => this.present(),
          then: () => this.say(this.paid() ? CAR_GUARD.again() : CAR_GUARD.hello(CAR_FEE)) }),
      ] },
    });
    ctx.extra.add(this.group);
  }

  private day() { return arenaShow.day() ?? this.ctx.day(); }
  /** The gardien is there whenever the arena's street is alive (set-up, doors, after the gala). */
  present() { return this.street !== 'quiet'; }
  paid() { return carPaidTonight(this.ctx.state.data.counters, this.day()); }
  private mineInLot() { const p = car.parkedHere(); return !!p && inCarLot(this.lot, p.x, p.z); }
  private say(line: string) { this.said.push(line); if (this.said.length > 8) this.said.shift(); this.ctx.toast(line); }

  /** Price first (« Payer 200 F »), then paid through the runner; he puts the car in its place. */
  private confirm() {
    const { ctx } = this, can = ctx.state.canAfford(CAR_FEE);
    ctx.menu('Parking voitures · gardien', `Ta voiture gardée toute la soirée : ${fcfaText(CAR_FEE)}, payés une fois.`, [
      { label: `Payer ${fcfaText(CAR_FEE)}`, icon: '🚗', detail: can ? 'Il la range à côté de lui' : 'Pas assez d’argent', disabled: !can, onPick: () => {
        ctx.hud.closeModal(); ctx.setMode('play');
        ctx.activities.start(P.buy({ id: 'parking-voiture', label: 'Parking voiture · Arène', price: CAR_FEE, line: () => CAR_GUARD.paid(CAR_FEE),
          then: () => { ctx.state.data.counters[CAR_FEE_COUNTER] = this.day(); this.stow(); ctx.save(); } }), { place: 'Arène de Pikine' });
      } },
      { label: 'Annuler', icon: '↩️', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }
  /** The player's car into the place he keeps (when it stands in his places). */
  private stow() {
    const p = car.parkedHere(), s = this.lot.slots[this.lot.reserved];
    if (!p || !inCarLot(this.lot, p.x, p.z) || !s) return false;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 0.05 || Math.abs(p.yaw - s.yaw) > 0.01) car.moveParked(s.x, s.z, s.yaw);
    this.shownKey = '';
    return true;
  }

  update(dt: number) {
    const { ctx } = this, day = this.day(), hour = ctx.hour(), counters = ctx.state.data.counters;
    const street = streetAt(hour, counters[GALA_DONE_COUNTER] === day, arenaExterior.isEventDay(day, hour));
    if (street === 'after' && this.street !== 'after') { this.afterT = 0; this.afterFrom = this.lastCount; }
    if (street === 'after') this.afterT += dt;
    this.street = street;
    const me = ctx.player.pos, g = this.lot.gardien, near = Math.hypot(me.x - g.x, me.z - g.z) < VIEW;
    this.group.visible = near;
    if (this.gardien) { this.gardien.group.visible = near && this.present(); if (this.gardien.group.visible) this.gardien.animate(dt, 0); }

    // the player's car: getting out in his places, driving away from them
    const driving = car.ridden, parked = car.parkedHere();
    if (this.wasDriving && !driving && parked && inCarLot(this.lot, parked.x, parked.z) && this.present()) {
      if (this.paid()) { this.stow(); this.say(CAR_GUARD.again()); } else this.say(CAR_GUARD.hello(CAR_FEE));
    }
    if (!this.wasDriving && driving) this.droveFromLot = !!this.lastParked && inCarLot(this.lot, this.lastParked.x, this.lastParked.z);
    if (driving && this.droveFromLot && !inCarLot(this.lot, me.x, me.z) && Math.hypot(me.x - g.x, me.z - g.z) > 12) {
      this.droveFromLot = false;
      if (this.paid() && this.present() && this.byeDay !== day) { this.byeDay = day; this.say(CAR_GUARD.bye()); }
    }
    this.wasDriving = driving; this.lastParked = parked ? { x: parked.x, z: parked.z } : null;

    // the other cars in the places
    const q = ctx.quality(), cap = Math.min(CAR_CAP[q], this.lot.slots.length - 2);
    const n = carCount({ street, size: eveningSize(day, Math.max(17, hour)), hour, cap, after: street === 'after' ? { t: this.afterT, from: this.afterFrom } : undefined });
    if (street !== 'after') this.lastCount = n;
    const looks = Math.max(1, Math.min(CAR_LOOKS[q], this.looks.length));
    const key = `${n}|${looks}|${parked ? `${parked.x.toFixed(1)},${parked.z.toFixed(1)}` : '-'}`;   // driving: its place is free again
    if (key !== this.shownKey) { this.shownKey = key; this.show(carTaken(this.lot, n, parked), looks); }
  }

  /** Draw the cars on these places, and make them solid (the player walks round them, a car stops at them). */
  private show(ids: number[], looks: number) {
    this.taken = ids;
    const cs = this.ctx.world()?.colliders;
    if (cs) for (const c of this.solid) { const i = cs.indexOf(c); if (i >= 0) cs.splice(i, 1); }
    this.solid = [];
    const counts = this.looks.map(() => 0);
    ids.forEach((id, k) => {
      const s = this.lot.slots[id], li = k % looks, L = this.looks[li]; if (!L) return;
      M4.compose(V.set(s.x, 0.06, s.z), Q.setFromAxisAngle(UP, s.yaw), S1);
      L.body.setMatrixAt(counts[li], M4); L.glass?.setMatrixAt(counts[li], M4); counts[li]++;
      if (L.drive) this.solid.push(...footprint(L.drive, s.x, s.z, s.yaw, CAR_H));
    });
    this.looks.forEach((L, i) => {
      for (const m of [L.body, L.glass]) {
        if (!m) continue;
        m.count = counts[i]; m.visible = counts[i] > 0; m.instanceMatrix.needsUpdate = true;
        if (counts[i] > 0) m.computeBoundingSphere();
      }
    });
    if (cs) cs.push(...this.solid);
  }

  skip(sec: number) { if (this.street === 'after') this.afterT += Math.max(0, sec); }

  info() {
    const s = (i: number) => this.lot.slots[i] ?? null;
    return {
      street: this.street, present: this.present(), paid: this.paid(), fee: CAR_FEE, day: this.day(),
      gardien: this.lot.gardien, reserved: s(this.lot.reserved), ahead: s(this.lot.ahead), area: this.lot.area, slots: this.lot.slots.length,
      places: [...this.lot.slots], cars: this.taken.length, taken: this.taken.map(i => this.lot.slots[i]), mine: car.parkedHere(), driving: car.ridden,
      inLot: this.mineInLot(), said: [...this.said],
      drawCalls: this.looks.reduce((a, L) => a + [L.body, L.glass].filter(m => m && m.visible && m.count > 0).length, 0),
    };
  }

  dispose() {
    const cs = this.ctx.world()?.colliders;
    if (cs) for (const c of this.solid) { const i = cs.indexOf(c); if (i >= 0) cs.splice(i, 1); }
    this.solid = [];
    this.gardien?.dispose(); this.gardien = null;
    for (const o of this.own) o.dispose(); this.own = [];
    this.group.removeFromParent();
  }
}

let park: CarPark | null = null;

export const carParkModule: GameModule = {
  name: 'arenaCarPark',
  hubLoaded(ctx, hub) {
    park?.dispose(); park = null;
    if (hub.arena && hub.id === 'pikine') park = new CarPark(ctx, hub);
  },
  update(_ctx, dt) { park?.update(dt); },
  debug: () => ({
    carPark: {
      /** The car places (gardien, places, the other cars, the player's car, paid tonight) and what he said. */
      info: () => park?.info() ?? null,
      /** Checks: `sec` more seconds of the after-gala emptying (frames are slow on the test machine). */
      skip: (sec: number) => park?.skip(sec),
    },
  }),
};
