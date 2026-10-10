import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import { buildVehicle } from '../actors/vehicleKit';
import { signTexture } from '../world/batch';
import { rng } from '../core/rng';
import * as P from '../activity/primitives';
import { fcfaText } from '../economy/format';
import { MOTO_GUARD } from '../i18n/lines';
import { moto } from '../transport/motoModule';
import { motoSpec } from '../transport/moto';
import { footprint } from '../transport/ownedModule';
import { clearKerb } from '../transport/passengers';
import { transport } from '../transport/module';
import { arenaExterior, eveningSize } from './exterior';
import { arenaShow } from './module';
import { GALA_DONE_COUNTER, streetAt, type Street } from './program';
import {
  FAN_COLOURS, FAN_LINE, FAN_STOP, LOT_CAP, MOTO_FEE, MOTO_FEE_COUNTER, fansRide, gardienBias, inLot, lotCount, lotTaken, motoLot, paidTonight, type MotoLot,
} from './arrivalRules';

/**
 * Getting to the fight (Habib's evening: « prendre sa moto ou un Car Rapide »), the rules in src/arena/arrivalRules.ts:
 * - By moto: a guarded parking on the sand east of the gate. The « gardien de motos » greets a player who gets off
 *   there and asks 100 F, shown before paying and paid once per evening (the universal runner, one wallet line). He
 *   puts the player's moto in the place he keeps next to him (src/transport/ownedModule.ts moveParked, saved like any
 *   parking spot), so it is found again after the bout. The other motos (instanced, three meshes) fill the rows as
 *   the doors open, more on a gala night, and leave one by one after the gala. When the player rides away he says
 *   goodbye: Wolof with its gloss, French narration.
 * - By car rapide: while the arena is set up and the doors are open, the Ligne 23 cars of the evening route (`23s`)
 *   carry fans in their écurie's colours towards the « Arène » stop (the transport's own passengers,
 *   `transport.setFans`). They get off there, and src/crowd/arrivals.ts walks the group to the queue (it sees the car
 *   pull in through `transport.dwellingAt`, and `transport.hasFans` for the bigger group), with the player when they ride along.
 * No new mechanics: places, the runner, the owned vehicle's parking record, the transport's passengers.
 */

/** Distance within which the parking is drawn. */
const VIEW = 80;
/** Kit seeds of the other motos (three looks, one instanced mesh each). */
const SEEDS = [5, 23, 61];
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

class Arrival {
  readonly lot: MotoLot;
  readonly group = new THREE.Group();
  private gardien: Humanoid | null = null;
  private rows: { mesh: THREE.InstancedMesh; seed: number }[] = [];
  private solid: Collider[] = [];
  private own: { dispose(): void }[] = [];
  private shownKey = '';
  /** Other motos in the rows now (the places' indices). */
  taken: number[] = [];
  /** The street's state this frame, and the after-gala emptying. */
  street: Street = 'quiet';
  private afterT = 0;
  private afterFrom = 0;
  private lastCount = 0;
  /** The player was riding last frame; the moto stood in the parking when they got on. */
  private wasRiding = false;
  private rodeFromLot = false;
  private lastParked: { x: number; z: number } | null = null;
  private byeDay = -1;
  /** What the gardien said, for the checks. */
  said: string[] = [];
  private fansT = 0;
  /** The gardien's anchor in the places registry (its focus bias follows the fee: gardienBias). */
  private anchor = { id: 'gardien', name: 'Le gardien de motos', kind: 'person' as const, x: 0, z: 0, y: 2.1, radius: 2.6, bias: 0 };

  constructor(private ctx: GameCtx, hub: HubWorld) {
    this.lot = motoLot(hub.arena!);
    this.group.name = 'arena_moto_parking'; this.group.userData.noLod = true;
    // places that a builder's collider already covers are dropped (the reserved one moves to the next free place)
    // (the player's own moto, parked in its place after a reload, is not in the way of its own place)
    const mine = moto.parkedHere(), own = (c: Collider) => !!mine && c.h <= 1.2 && Math.hypot((c.x0 + c.x1) / 2 - mine.x, (c.z0 + c.z1) / 2 - mine.z) < 1.6;
    const free = (s: { x: number; z: number }) => !hub.colliders.some(c => !own(c) && s.x > c.x0 - 0.45 && s.x < c.x1 + 0.45 && s.z > c.z0 - 1.05 && s.z < c.z1 + 1.05);
    const ok = this.lot.slots.map(free);
    if (!ok[this.lot.reserved]) { const r = ok.findIndex(Boolean); if (r >= 0) this.lot.reserved = r; }
    const kept = this.lot.slots[this.lot.reserved];
    this.lot.slots = this.lot.slots.filter((_s, i) => ok[i] || i === this.lot.reserved);
    this.lot.reserved = this.lot.slots.indexOf(kept);
    // the kerb in front: no parked car between the street and the parking
    const k = this.lot.kerb;
    clearKerb(ctx.extra, hub.colliders, [{ x: k.x, z: k.z, dx: 1, dz: 0, rx: 0, rz: 1, offset: 4.3, from: -k.half, to: k.half }]);

    // the other motos: one instanced mesh per look, as many instances as places
    for (const seed of SEEDS) {
      const b = buildVehicle('moto', { seed, driver: false, passengers: false, lod: 'near' });
      const body = b.group.getObjectByName('body') as THREE.Mesh | undefined;
      if (!body) continue;
      const mesh = new THREE.InstancedMesh(body.geometry, body.material as THREE.Material, this.lot.slots.length);
      mesh.name = 'arena_parked_motos'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false;
      this.group.add(mesh); this.rows.push({ mesh, seed }); this.own.push(mesh);
    }
    // the gardien (an orange vest over his tee) and his sign
    if (humanoidReady()) {
      const R = rng(1789), h = new Humanoid({ ...randomLook(R), style: 'tee', top: 0xe8742c, pattern: 'uni', female: false });
      const g = this.lot.gardien;
      h.group.position.set(g.x, 0.1 + hub.heightAt(g.x, g.z), g.z); h.group.rotation.y = g.yaw; h.hold = 'Idle';
      this.group.add(h.group); this.gardien = h;
    }
    const sg = this.lot.sign, tex = signTexture('PARKING MOTOS · GARDIEN', '#1b2a7a', '#ffd98a', 512, 128);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.3, 0.07), new THREE.MeshLambertMaterial({ color: 0x3b3f46 }));
    pole.position.set(sg.x, 1.25, sg.z);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    plate.position.set(sg.x, 2.35, sg.z - 0.05); plate.rotation.y = sg.yaw;
    this.group.add(pole, plate);
    this.own.push(pole.geometry, pole.material as THREE.Material, plate.geometry, plate.material as THREE.Material, tex);
    hub.colliders.push({ x0: sg.x - 0.12, x1: sg.x + 0.12, z0: sg.z - 0.12, z1: sg.z + 0.12, h: 2.4 });

    // the gardien is a place of the shared registry: the fee (price first, paid once), a word with him
    ctx.places.add({
      id: `${hub.id}:arena:parking`, type: 'parking', name: 'Parking motos · Arène', space: 'street',
      anchors: [Object.assign(this.anchor, { x: this.lot.gardien.x, z: this.lot.gardien.z })],
      offers: { gardien: [
        P.handOver('buy', { id: 'garder', label: `Faire garder ta moto (${fcfaText(MOTO_FEE)})`, detail: 'Payés une fois pour la soirée', icon: '🏍️',
          visible: () => this.present() && !this.paid() && this.mineInLot(), then: () => this.confirm() }),
        P.talk({ id: 'parler', label: 'Saluer le gardien', visible: () => this.present(),
          then: () => this.say(this.paid() ? MOTO_GUARD.again() : MOTO_GUARD.hello(MOTO_FEE)) }),
      ] },
    });
    ctx.extra.add(this.group);
  }

  private day() { return arenaShow.day() ?? this.ctx.day(); }
  /** The gardien is there whenever the arena's street is alive (set-up, doors, after the gala). */
  present() { return this.street !== 'quiet'; }
  paid() { return paidTonight(this.ctx.state.data.counters, this.day()); }
  private mineInLot() { const p = moto.parkedHere(); return !!p && inLot(this.lot, p.x, p.z); }
  private say(line: string) { this.said.push(line); if (this.said.length > 8) this.said.shift(); this.ctx.toast(line); }

  /** Price first (« Payer 100 F »), then paid through the runner; he puts the moto in its place. */
  private confirm() {
    const { ctx } = this, can = ctx.state.canAfford(MOTO_FEE);
    ctx.menu('Parking motos · gardien', `Ta moto gardée toute la soirée : ${fcfaText(MOTO_FEE)}, payés une fois.`, [
      { label: `Payer ${fcfaText(MOTO_FEE)}`, icon: '🏍️', detail: can ? 'Il la range à côté de lui' : 'Pas assez d’argent', disabled: !can, onPick: () => {
        ctx.hud.closeModal(); ctx.setMode('play');
        ctx.activities.start(P.buy({ id: 'parking', label: 'Parking moto · Arène', price: MOTO_FEE, line: () => MOTO_GUARD.paid(MOTO_FEE),
          then: () => { ctx.state.data.counters[MOTO_FEE_COUNTER] = this.day(); this.stow(); ctx.save(); } }), { place: 'Arène de Pikine' });
      } },
      { label: 'Annuler', icon: '↩️', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }
  /** The player's moto into the place he keeps (when it stands in the parking). */
  private stow() {
    const p = moto.parkedHere(), s = this.lot.slots[this.lot.reserved];
    if (!p || !inLot(this.lot, p.x, p.z) || !s) return false;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 0.05) moto.moveParked(s.x, s.z, s.yaw);
    this.shownKey = '';
    return true;
  }

  update(dt: number) {
    const { ctx } = this, day = this.day(), hour = ctx.hour(), counters = ctx.state.data.counters;
    const street = streetAt(hour, counters[GALA_DONE_COUNTER] === day, arenaExterior.isEventDay(day, hour));
    if (street === 'after' && this.street !== 'after') { this.afterT = 0; this.afterFrom = this.lastCount; }
    if (street === 'after') this.afterT += dt;
    this.street = street;
    const me = ctx.player.pos, near = Math.hypot(me.x - this.lot.gardien.x, me.z - this.lot.gardien.z) < VIEW;
    this.group.visible = near;
    if (this.gardien) { this.gardien.group.visible = near && this.present(); if (this.gardien.group.visible) this.gardien.animate(dt, 0); }
    this.anchor.bias = gardienBias(this.present() && !this.paid() && this.mineInLot());   // the fee due: he wins the focus when faced

    // the player's moto: getting off in the parking, riding away from it
    const riding = moto.ridden, parked = moto.parkedHere();
    if (this.wasRiding && !riding && parked && inLot(this.lot, parked.x, parked.z) && this.present()) {
      if (this.paid()) { this.stow(); this.say(MOTO_GUARD.again()); } else this.say(MOTO_GUARD.hello(MOTO_FEE));
    }
    if (!this.wasRiding && riding) this.rodeFromLot = !!this.lastParked && inLot(this.lot, this.lastParked.x, this.lastParked.z);
    if (riding && this.rodeFromLot && !inLot(this.lot, me.x, me.z) && Math.hypot(me.x - this.lot.gardien.x, me.z - this.lot.gardien.z) > 9) {
      this.rodeFromLot = false;
      if (this.paid() && this.present() && this.byeDay !== day) { this.byeDay = day; this.say(MOTO_GUARD.bye()); }
    }
    this.wasRiding = riding; this.lastParked = parked ? { x: parked.x, z: parked.z } : null;

    // the other motos in the rows
    const n = lotCount({ street, size: eveningSize(day, Math.max(17, hour)), hour, cap: Math.min(LOT_CAP[ctx.quality()], this.lot.slots.length - 1),
      after: street === 'after' ? { t: this.afterT, from: this.afterFrom } : undefined });
    if (street !== 'after') this.lastCount = n;
    const mine = parked;                                                      // riding: its place is free again
    const key = `${n}|${mine ? `${mine.x.toFixed(1)},${mine.z.toFixed(1)}` : '-'}`;
    if (key !== this.shownKey) { this.shownKey = key; this.show(lotTaken(this.lot, n, mine)); }

    // fans aboard the Ligne 23 towards the « Arène » stop while the arena is set up and its doors are open
    this.fansT -= dt;
    if (this.fansT <= 0) { this.fansT = 1; transport.setFans(FAN_LINE, fansRide(street) && arenaExterior.active() ? { colours: FAN_COLOURS, dest: FAN_STOP } : null); }
  }

  /** Draw the motos on these places, and make them solid (the player walks round them, a moto stops at them). */
  private show(ids: number[]) {
    this.taken = ids;
    const cs = this.ctx.world()?.colliders;
    if (cs) for (const c of this.solid) { const i = cs.indexOf(c); if (i >= 0) cs.splice(i, 1); }
    this.solid = [];
    const counts = this.rows.map(() => 0), d = motoSpec().drive;
    ids.forEach((id, k) => {
      const s = this.lot.slots[id], row = this.rows[k % this.rows.length]; if (!row) return;
      M4.compose(V.set(s.x, 0.12, s.z), Q.setFromAxisAngle(UP, s.yaw), S1);
      row.mesh.setMatrixAt(counts[k % this.rows.length]++, M4);
      if (d) this.solid.push(...footprint(d, s.x, s.z, s.yaw, 1.1));
    });
    this.rows.forEach((r, i) => { r.mesh.count = counts[i]; r.mesh.instanceMatrix.needsUpdate = true; });
    if (cs) cs.push(...this.solid);
  }

  skip(sec: number) { if (this.street === 'after') this.afterT += Math.max(0, sec); }

  info() {
    return {
      street: this.street, present: this.present(), paid: this.paid(), fee: MOTO_FEE, day: this.day(),
      gardien: this.lot.gardien, reserved: this.lot.slots[this.lot.reserved], area: this.lot.area, slots: this.lot.slots.length,
      motos: this.taken.length, taken: this.taken.map(i => this.lot.slots[i]), mine: moto.parkedHere(), riding: moto.ridden,
      inLot: this.mineInLot(), said: [...this.said], drawCalls: this.rows.filter(r => r.mesh.count > 0).length,
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

let arrival: Arrival | null = null;

export const arrivalModule: GameModule = {
  name: 'arenaArrival',
  hubLoaded(ctx, hub) {
    arrival?.dispose(); arrival = null;
    if (hub.arena && hub.id === 'pikine') arrival = new Arrival(ctx, hub);
  },
  update(_ctx, dt) { arrival?.update(dt); },
  debug: () => ({
    arrival: {
      /** The moto parking (gardien, places, the other motos, the player's moto, paid tonight) and what he said. */
      info: () => arrival?.info() ?? null,
      /** Checks: `sec` more seconds of the after-gala emptying (frames are slow on the test machine). */
      skip: (sec: number) => arrival?.skip(sec),
    },
  }),
};
