import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Seat } from '../interact/seats';
import type { WrestlerLook } from '../core/types';
import { Batch, signTexture } from '../world/batch';
import { Humanoid, Wrestler, humanoidReady, randomLook, type Clip } from '../actors/humanoid';
import { buildVehicle } from '../actors/vehicleKit';
import { rng } from '../core/rng';
import * as P from '../activity/primitives';
import { Percussion, crowdCheer } from '../lamb/audio';
import { STYLES } from '../lamb/rules';
import { WALL_R } from '../world/geew';
import { ARENA, haggler, tasteLine } from '../i18n/lines';
import {
  BILL, DENSITY, GALA, GALA_DONE_COUNTER, REACTION, SHOW, SHOW_LABEL, TICKET_COUNTER, TICKET_PRICE,
  fillAt, fillOrder, hasTicket, standSeats, streetAt, ticketsChecked, type Moment, type ShowPhase, type Street,
} from './program';
import { StandCrowd } from './crowd';
import { WatchedBout } from './bout';
import { GalaCard } from './card';

/**
 * A fight evening at the Pikine arena (docs/ARENA_VISIT.md): the street in front of the gate comes alive (vendors of
 * bissap, grilled peanuts, scarves and flags; drummers; a car rapide dropping fans; the queue between the barriers),
 * the ticket is bought at the window (price shown before paying, paid once for the evening), the controller lets
 * ticket holders in, the player takes a free place on the tiers (« S'asseoir »), the stands fill, the wrestlers make
 * their entrance with drums and dances, the existing làmb duel is played by two NPC wrestlers of the game's cast, the
 * crowd reacts, the result is announced, the stands empty and the street winds down.
 *
 * Built on the shared systems: places and the activity runner (vendors, ticket), the seat registry (the tiers' places,
 * shared by the crowd and the player, never twice), the module camera hook (the view from the seat), the làmb duel
 * (rules untouched, src/arena/bout.ts) and the Wolof lines (src/i18n/lines.ts). Density follows the graphics quality.
 */
const CROWD = 'arena-crowd';
const V3 = THREE.Vector3;

interface Walker { h: Humanoid; from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number; end: Clip }

class ArenaEvening {
  readonly group = new THREE.Group();
  readonly cx: number; readonly cz: number; readonly gz: number;
  readonly seats: Seat[] = [];
  readonly crowd: StandCrowd;
  readonly cap: number;
  phase: ShowPhase = 'idle';
  t = 0;
  speed = 1;
  street: Street = 'quiet';
  result = '';
  private wares = new THREE.Group();
  private car: THREE.Group | null = null;
  private vendors: Humanoid[] = [];
  private queue: Humanoid[] = [];
  private drummers: Humanoid[] = [];
  private fans: { h: Humanoid; t: number; speed: number }[] = [];
  private own: { dispose(): void }[] = [];
  private entrance: Walker[] = [];
  private insideCast: Humanoid[] = [];
  private bout: WatchedBout | null = null;
  private drums = new Percussion();
  private card: GalaCard;
  private wasInside = false;
  private stopT = 0;
  private fillT = 0;
  private told = new Set<string>();
  private nearSeat: string | null = null;
  private camYaw = 0;
  private look = new V3();
  private rand = rng(41);
  private fanFrom: THREE.Vector3; private fanTo: THREE.Vector3;
  private ground: (x: number, z: number) => number;

  constructor(private ctx: GameCtx, hub: HubWorld) {
    const a = hub.arena!, q = ctx.quality(), D = DENSITY[q], lite = q === 'low';
    this.cx = a.cx; this.cz = a.cz; this.gz = a.cz - WALL_R;
    this.ground = (x, z) => 0.1 + hub.heightAt(x, z);
    const cx = this.cx, gz = this.gz;
    this.group.name = 'arena_evening';

    // ---------------------------------------------------------------- the tiers' places, shared by the crowd and the player
    const defs = standSeats(cx, a.cz, `${hub.id}:arena:stand`);
    for (const d of defs) {
      const s: Seat = { id: d.id, x: d.x, z: d.z, top: d.top, yaw: d.yaw, kind: 'stand', space: 'street', occupant: null, reach: 3.4 };
      ctx.seats.add(s); this.seats.push(s);
    }
    const order = fillOrder(defs.length, 7).map(i => defs[i]);
    this.cap = Math.round(defs.length * D.crowdShare);
    this.crowd = new StandCrowd(order.slice(0, this.cap), D.near);
    this.group.add(this.crowd.group);

    // ---------------------------------------------------------------- the street in front of the gate
    const B = new Batch(), W = new Batch();                         // B: always there (the ticket booth); W: the evening's wares
    const bx = cx - 5.2, bz = gz - 3.0, g0 = this.ground(bx, bz) - 0.1;
    B.box(1.7, 2.3, 1.3, bx, g0, bz, 0xe9dcc0); B.box(1.9, 0.14, 1.5, bx, g0 + 2.3, bz, 0x7a3f1a);
    B.box(1.1, 0.75, 0.04, bx, g0 + 1.05, bz - 0.66, 0x1f2a36); B.box(1.5, 0.08, 0.32, bx, g0 + 0.98, bz - 0.8, 0x8b6a47);
    hub.colliders.push({ x0: bx - 0.85, x1: bx + 0.85, z0: bz - 0.65, z1: bz + 0.65, h: 2.3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshLambertMaterial({ map: signTexture('GUICHET · BILLETS', '#7a3f1a', '#ffe7b0', 512, 128) }));
    sign.position.set(bx, g0 + 2.62, bz - 0.68); sign.rotation.y = Math.PI; this.group.add(sign);
    this.own.push(sign.geometry, sign.material as THREE.Material, (sign.material as THREE.MeshLambertMaterial).map!);
    // bissap cooler (left far stall), peanut roaster (left near), scarves and flags (right near)
    const s1 = { x: cx - 12.5, z: gz - 5.5 }, s2 = { x: cx - 8, z: gz - 4 }, s3 = { x: cx + 8, z: gz - 4 };
    const y1 = this.ground(s1.x, s1.z) - 0.1 + 0.8;
    W.box(0.6, 0.42, 0.42, s1.x - 0.25, y1, s1.z, 0xd9322b); W.box(0.62, 0.06, 0.44, s1.x - 0.25, y1 + 0.42, s1.z, 0xf2f2ec);
    for (let k = 0; k < 5; k++) W.cyl(0.035, 0.035, 0.24, s1.x + 0.25 + k * 0.09, y1, s1.z - 0.15, 0x8a1538, 6);
    const y2 = this.ground(s2.x, s2.z) - 0.1 + 0.8;
    W.cyl(0.32, 0.26, 0.12, s2.x - 0.2, y2, s2.z, 0x3a3a3a, 12); W.cyl(0.3, 0.3, 0.03, s2.x - 0.2, y2 + 0.12, s2.z, 0xc9a26a, 12);
    for (let k = 0; k < 6; k++) W.box(0.1, 0.16, 0.1, s2.x + 0.35 + (k % 3) * 0.12, y2, s2.z - 0.15 + Math.floor(k / 3) * 0.2, 0xf1e3c2);
    const y3 = this.ground(s3.x, s3.z) - 0.1;
    for (const dx of [-0.9, 0.9]) W.box(0.05, 2.1, 0.05, s3.x + dx, y3, s3.z - 0.55, 0x555555);
    W.box(1.85, 0.05, 0.05, s3.x, y3 + 2.05, s3.z - 0.55, 0x555555);
    [0x1a9d54, 0xd9322b, 0xf4c20d, 0x1a9d54, 0xd9322b].forEach((col, k) => W.box(0.24, 0.9, 0.02, s3.x - 0.72 + k * 0.36, y3 + 1.1, s3.z - 0.55, col));
    // drums of the drummers by the queue
    const drumX = (k: number) => cx + 4.3 + k * 0.85, drumZ = gz - 7.6;
    for (let k = 0; k < D.drummers; k++) W.cyl(0.17, 0.12, 0.75, drumX(k) - 0.3, this.ground(drumX(k), drumZ) - 0.1 + 0.18, drumZ + 0.05, 0x8a5a2e, 10, [0, 0, -0.5]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true }); this.own.push(mat);
    for (const [b, parent] of [[B, this.group], [W, this.wares]] as const) { const m = b.build(mat, true, true); if (m) { parent.add(m); this.own.push(m.geometry); } }
    this.group.add(this.wares);
    // a car rapide at the kerb, dropping fans
    const carX = cx + 20, carZ = gz - 4.0;
    if (!lite) {
      const v = buildVehicle('carRapide', { seed: 23, lite, passengers: false });
      v.group.position.set(carX, this.ground(carX, carZ) - 0.1, carZ); v.group.rotation.y = Math.PI / 2;
      this.car = v.group; this.group.add(v.group);
    }
    this.fanFrom = new V3(carX - 4.2, 0, carZ - 0.6); this.fanTo = new V3(cx + 0.9, 0, gz - 3.2 - D.queue * 1.0);

    // ---------------------------------------------------------------- people of the street
    if (humanoidReady()) {
      const R = rng(57);
      const person = (x: number, z: number, yaw: number, clip: Clip) => {
        const h = new Humanoid(randomLook(R)); h.hold = clip; h.group.position.set(x, this.ground(x, z), z); h.group.rotation.y = yaw;
        h.group.visible = false; this.group.add(h.group); return h;
      };
      this.vendors = [person(s1.x, s1.z + 0.8, Math.PI, 'Talk'), person(s2.x, s2.z + 0.8, Math.PI, 'Idle'), person(s3.x, s3.z + 0.3, Math.PI, 'Talk')];
      for (let k = 0; k < D.queue; k++) this.queue.push(person(cx + (k % 2 ? 0.35 : -0.35), gz - 2.8 - k * 1.0, 0, k % 3 === 1 ? 'Talk' : 'Idle'));
      for (let k = 0; k < D.drummers; k++) this.drummers.push(person(drumX(k), drumZ, -Math.PI / 2 + 0.2, 'Talk'));
      for (let k = 0; k < D.fans; k++) { const h = person(this.fanFrom.x, this.fanFrom.z, 0, 'Walk'); h.hold = null; this.fans.push({ h, t: k / Math.max(1, D.fans), speed: 1.2 + R() * 0.4 }); }
    }

    // ---------------------------------------------------------------- places: the ticket window and the vendors
    const place = 'Arène de Pikine';
    ctx.places.add({
      id: `${hub.id}:arena:guichet`, type: 'ticket', name: 'Guichet · Arène de Pikine', space: 'street', hours: [GALA.doors, GALA.close],
      anchors: [{ id: 'guichet', name: 'Guichet · billets', kind: 'counter', x: bx, z: bz - 1.35, radius: 2.0 }],
      offers: { guichet: [P.handOver('buy', {
        id: 'billet', label: `Acheter un billet (${TICKET_PRICE.toLocaleString('fr-FR')} F)`, detail: 'Tribune populaire · valable toute la soirée',
        requires: () => (hasTicket(ctx.state.data.counters, ctx.day()) ? 'Tu as déjà ton billet pour ce soir' : null),
        then: () => this.confirmTicket(place),
      })] },
    });
    ctx.places.add({
      id: `${hub.id}:arena:bissap`, type: 'stall', name: 'Bissap glacé', space: 'street', hours: [GALA.setup, GALA.close + 1],
      anchors: [{ id: 'bissap', kind: 'counter', x: s1.x, z: s1.z - 1.25, radius: 1.9 }],
      offers: { bissap: [P.order({ id: 'bissap', label: 'Bissap glacé', detail: 'Dans un sachet, bien froid', price: 200, prep: 1, eat: 2, drink: true, seat: false, needs: { faim: 4, moral: 4 }, line: ARENA.bissap, eatLine: tasteLine })] },
    });
    ctx.places.add({
      id: `${hub.id}:arena:arachides`, type: 'stall', name: 'Arachides grillées', space: 'street', hours: [GALA.setup, GALA.close + 1],
      anchors: [{ id: 'arachides', kind: 'counter', x: s2.x, z: s2.z - 1.25, radius: 1.9 }],
      offers: { arachides: [P.buy({ id: 'arachides', label: 'Un cornet d’arachides grillées', price: 100, items: { arachides: 1 }, haggle: haggler('buy', 100, 'La vendeuse', false) })] },
    });
    ctx.places.add({
      id: `${hub.id}:arena:echarpes`, type: 'stall', name: 'Écharpes et drapeaux', space: 'street', hours: [GALA.setup, GALA.close + 1],
      anchors: [{ id: 'echarpes', kind: 'counter', x: s3.x, z: s3.z - 1.35, radius: 1.9 }],
      offers: { echarpes: [
        P.buy({ id: 'echarpe-baobab', label: 'Écharpe verte · écurie Baobab', price: 500, items: { echarpe_baobab: 1 }, haggle: haggler('buy', 500, 'Le vendeur') }),
        P.buy({ id: 'drapeau-teranga', label: 'Petit drapeau rouge · écurie Teranga', price: 300, items: { drapeau_teranga: 1 }, haggle: haggler('buy', 300, 'Le vendeur') }),
      ] },
    });
    this.card = new GalaCard(document.getElementById('ui') ?? document.body);
    ctx.extra.add(this.group);
  }

  // ---------------------------------------------------------------- ticket
  private confirmTicket(place: string) {
    const { ctx } = this;
    ctx.menu('Billet · gala de làmb', `Tribune populaire, ce soir : ${TICKET_PRICE.toLocaleString('fr-FR')} F, payés une fois pour toute la soirée.`, [
      { label: `Payer ${TICKET_PRICE.toLocaleString('fr-FR')} F`, icon: '🎟️', detail: ctx.state.canAfford(TICKET_PRICE) ? 'Entrée par la porte, places libres sur les gradins' : 'Pas assez d’argent', disabled: !ctx.state.canAfford(TICKET_PRICE), onPick: () => {
        ctx.hud.closeModal(); ctx.setMode('play');
        ctx.activities.start(P.buy({ id: 'billet', label: 'Billet · gala de làmb', price: TICKET_PRICE, line: () => ARENA.ticket(TICKET_PRICE),
          then: () => { ctx.state.data.counters[TICKET_COUNTER] = ctx.day(); } }), { place });
      } },
      { label: 'Annuler', icon: '↩️', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }

  // ---------------------------------------------------------------- every frame
  inside(x: number, z: number) { return Math.hypot(x - this.cx, z - this.cz) < WALL_R - 0.4; }
  seatedHere(): Seat | null { const s = this.ctx.player.seated(); return s && s.kind === 'stand' && this.seats.includes(s) ? s : null; }

  update(dt: number) {
    const { ctx } = this, hour = ctx.hour(), day = ctx.day(), counters = ctx.state.data.counters;
    const galaDone = counters[GALA_DONE_COUNTER] === day;
    const showing = this.phase !== 'idle' && this.phase !== 'over';
    this.street = showing ? 'doors' : streetAt(hour, galaDone);
    const me = ctx.player.pos, near = Math.hypot(me.x - this.cx, me.z - this.gz) < 85;

    // the street: wares and people by the evening's moment, drawn only near the viewer
    const st = this.street;
    this.wares.visible = st !== 'quiet';
    if (this.car) this.car.visible = st === 'setup' || st === 'doors';
    this.vendors.forEach((h, i) => { h.group.visible = near && (st === 'setup' || st === 'doors' || (st === 'after' && i < 2)); if (h.group.visible) h.animate(dt, 0); });
    for (const h of this.queue) { h.group.visible = near && st === 'doors' && this.phase === 'idle'; if (h.group.visible) h.animate(dt, 0); }
    for (const h of this.drummers) { h.group.visible = near && (st === 'setup' || st === 'doors'); if (h.group.visible) h.animate(dt, 0); }
    for (const f of this.fans) {
      const on = near && (st === 'doors' || st === 'after');
      f.h.group.visible = on; if (!on) continue;
      f.t = (f.t + (dt * f.speed) / this.fanFrom.distanceTo(this.fanTo)) % 1;
      const [a, b] = st === 'after' ? [this.fanTo, this.fanFrom] : [this.fanFrom, this.fanTo];   // after the gala they head back
      const x = a.x + (b.x - a.x) * f.t, z = a.z + (b.z - a.z) * f.t;
      f.h.group.position.set(x, this.ground(x, z), z); f.h.group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); f.h.animate(dt, f.speed);
    }

    // the gate: the controller checks tickets while the doors are open
    const seat = this.seatedHere();
    const inNow = !seat && this.inside(me.x, me.z);
    this.stopT = Math.max(0, this.stopT - dt);
    if (inNow && !this.wasInside && ticketsChecked(hour, galaDone) && ctx.mode() === 'play') {
      if (!hasTicket(counters, day)) {                               // turned back at the gate, toward the street
        ctx.player.place(this.cx, this.gz - 1.6, Math.PI);
        if (this.stopT <= 0) { ctx.toast(ARENA.stop()); this.stopT = 3; }
        this.wasInside = false;
        return this.after(dt);
      }
      ctx.toast(ARENA.welcome());
    }
    this.wasInside = inNow || !!seat;
    this.after(dt);
  }

  private after(dt: number) {
    const { ctx } = this, seat = this.seatedHere();
    // the show starts once the player is seated during the doors
    if (this.phase === 'idle' && seat && this.street === 'doors') this.go('filling');
    if (this.phase !== 'idle' && this.phase !== 'over' && this.phase !== 'leaving' && this.phase !== 'result' && !seat
      && Math.hypot(ctx.player.pos.x - this.cx, ctx.player.pos.z - this.cz) > WALL_R + 8) this.abort();
    if (this.phase !== 'idle' && this.phase !== 'over') this.t += dt * (this.phase === 'bout' ? 1 : this.speed);
    switch (this.phase) {
      case 'filling': if (this.t >= SHOW.filling) this.go('entrance'); break;
      case 'entrance': this.updateEntrance(dt * this.speed); if (this.t >= SHOW.entrance) this.go('bout'); break;
      case 'bout': if (this.bout) { for (let k = 0; k < this.speed; k++) this.bout.update(dt); if (this.bout.over) this.go('result'); } break;
      case 'result': if (this.t >= SHOW.result) this.go('leaving'); break;
      case 'leaving': if (this.t >= SHOW.leaving) this.go('over'); break;
    }
    // the stands fill with the evening and empty after the gala
    this.fillT -= dt;
    if (this.fillT <= 0) { this.fillT = 0.4; this.syncCrowd(); }
    const near = Math.hypot(ctx.player.pos.x - this.cx, ctx.player.pos.z - this.cz) < 70;
    this.crowd.group.visible = near;
    const seatId = seat?.id ?? null;
    if (seatId !== this.nearSeat) { this.nearSeat = seatId; this.crowd.setNear(seat?.x ?? 0, seat ? seat.z : null); }
    this.crowd.update(dt, near);
    this.card.show(this.phase === 'idle' || this.phase === 'over' ? null : {
      title: 'Gala de làmb · Arène de Pikine',
      sub: `${SHOW_LABEL[this.phase]} · ${BILL.left.name} (${BILL.left.ecurie}) – ${BILL.right.name} (${BILL.right.ecurie})`,
    });
  }

  /** How many of the crowd's places are taken now. */
  crowdTarget(): number {
    switch (this.phase) {
      case 'filling': case 'entrance': case 'bout': case 'result': return this.cap;
      case 'leaving': return Math.round(this.cap * Math.max(0, 1 - this.t / SHOW.leaving));
      case 'over': return 0;
      default: return this.street === 'doors' ? Math.round(this.cap * fillAt(this.ctx.hour())) : 0;
    }
  }
  private syncCrowd() {
    const seats = this.ctx.seats;
    this.crowd.fill(this.crowdTarget(), id => { const s = seats.get(id); return !!s && !!s.occupant && s.occupant !== CROWD; });
    const taken = new Set(this.crowd.taken().map(s => s.id));
    for (const s of this.seats) {
      if (taken.has(s.id)) { if (!s.occupant) s.occupant = CROWD; }
      else if (s.occupant === CROWD) s.occupant = null;
    }
  }

  private react(m: Moment, sound = true) {
    const r = REACTION[m]; this.crowd.react(r.share, r.seconds);
    if (sound) crowdCheer(Math.min(4, r.seconds), m === 'clinch' ? 0.1 : 0.2);
  }
  private say(key: string, line: string) { if (this.told.has(key)) return; this.told.add(key); this.ctx.toast(line); }

  // ---------------------------------------------------------------- the show
  go(phase: ShowPhase) {
    const { ctx } = this;
    this.phase = phase; this.t = 0;
    if (phase === 'filling') {
      this.told.clear(); this.result = '';
      this.say('bill', ARENA.bill(BILL.left.name, BILL.left.ecurie, BILL.right.name, BILL.right.ecurie));
    } else if (phase === 'entrance') {
      this.startEntrance();
    } else if (phase === 'bout') {
      this.clearEntrance();
      this.bout = new WatchedBout({ x: this.cx, z: this.cz }, LEFT_LOOK, this.rand);
      this.bout.onMoment = p => { if (p === 'clinch') this.react('clinch'); if (p === 'fall') this.react(this.bout?.info().outcome === 'projection' ? 'fall' : 'decision'); };
      this.group.add(this.bout.group);
    } else if (phase === 'result') {
      const r = this.bout?.result;
      const winner = !r || !r.winner ? null : r.winner === 'player' ? BILL.left.name : BILL.right.name;
      this.result = ARENA.result(winner, (r?.outcome ?? 'egalite') as 'projection' | 'decision' | 'egalite' | 'abandon');
      ctx.toast(this.result);
      this.react('result');
    } else if (phase === 'leaving') {
      this.bout?.dispose(); this.bout = null;
    } else if (phase === 'over') {
      ctx.state.data.counters[GALA_DONE_COUNTER] = ctx.day(); ctx.save();
      ctx.toast(ARENA.over);
    }
  }
  private abort() {
    this.clearEntrance(); this.bout?.dispose(); this.bout = null; this.drums.stop();
    this.phase = 'idle'; this.t = 0;
  }

  private startEntrance() {
    if (!humanoidReady()) return;
    const q = this.ctx.quality(), cx = this.cx, cz = this.cz, gz = this.gz;
    const walker = (h: Humanoid, fx: number, fz: number, tx: number, tz: number, t0: number, t1: number, end: Clip) => {
      h.group.position.set(fx, 0.1, fz); this.group.add(h.group);
      this.entrance.push({ h, from: new V3(fx, 0.1, fz), to: new V3(tx, 0.1, tz), t0, t1, end });
    };
    const lw = new Wrestler(0x5b3420); lw.setLook(LEFT_LOOK, 'B');
    const rw = new Wrestler(0x4e2e1c); rw.setLook(RIGHT_LOOK, 'A');
    walker(lw, cx + 0.8, gz + 1, cx + 3, cz, 0.5, 6.5, 'Dance_A');
    walker(rw, cx - 0.8, gz + 1, cx - 3, cz, 3.5, 9.5, 'Dance_B');
    const followers = q === 'low' ? 0 : q === 'medium' ? 1 : 2;
    const R = rng(77);
    for (const [side, t0] of [[1, 0.9], [-1, 3.9]] as const) for (let k = 0; k < followers; k++) {
      const h = new Humanoid({ ...randomLook(R), style: 'boubou', female: false });
      walker(h, cx + side * (1.6 + k * 0.7), gz + 0.2 - k * 0.8, cx + side * (4.4 + k * 0.9), cz - 3.2 - k * 0.6, t0, t0 + 6, 'Celebrate');
    }
    for (let k = 0; k < (q === 'low' ? 1 : 2); k++) {             // two drummers by the gate, inside
      const h = new Humanoid(randomLook(R)); h.hold = 'Talk'; h.group.position.set(cx - 5 + k * 1.1, 0.1, cz - 13.5); h.group.rotation.y = 0.3;
      this.group.add(h.group); this.insideCast.push(h);
    }
    this.drums.start(116);
  }
  private updateEntrance(dt: number) {
    const t = this.t;
    for (const w of this.entrance) {
      const k = THREE.MathUtils.clamp((t - w.t0) / (w.t1 - w.t0), 0, 1);
      w.h.group.position.lerpVectors(w.from, w.to, k);
      const dir = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
      const walking = k > 0 && k < 1;
      w.h.group.rotation.y = walking || k === 0 ? dir : Math.atan2(this.cx - w.h.group.position.x, this.cz - w.h.group.position.z);
      if (w.h instanceof Wrestler) {
        w.h.play(walking ? 'Entrance_Walk' : k >= 1 ? (t > SHOW.entrance - 1.6 ? 'Prep' : w.end) : 'Idle'); w.h.update(dt);
        if (k >= 1 && !this.told.has(`arrived:${w.end}`)) { this.told.add(`arrived:${w.end}`); this.react('entrance'); }
      } else { w.h.hold = walking ? null : w.end; w.h.animate(dt, walking ? 1.4 : 0); }
    }
    if (t > 0.5) this.say('walk-left', ARENA.entrance(BILL.left.name, BILL.left.ecurie));
    if (t > 3.5) this.say('walk-right', ARENA.entrance(BILL.right.name, BILL.right.ecurie));
    for (const h of this.insideCast) h.animate(dt, 0);
  }
  private clearEntrance() {
    for (const w of this.entrance) w.h.dispose(); this.entrance = [];
    for (const h of this.insideCast) h.dispose(); this.insideCast = [];
    this.drums.stop();
  }

  /** What the seat's camera looks at: the walking wrestlers, the bout, or the ring. */
  focus(out: THREE.Vector3) {
    if (this.phase === 'bout' && this.bout) return out.copy(this.bout.focus());
    if (this.phase === 'entrance' && this.entrance.length) {
      const ws = this.entrance.filter(w => w.h instanceof Wrestler);
      out.set(0, 0, 0); for (const w of ws) out.add(w.h.group.position); return out.multiplyScalar(1 / ws.length).setY(1.2);
    }
    return out.set(this.cx, 1.0, this.cz);
  }

  camera(cam: THREE.PerspectiveCamera, dt: number, drag: { yaw: number; pitch: number }): boolean {
    const s = this.seatedHere(); if (!s) { this.camYaw = 0; return false; }
    this.camYaw = THREE.MathUtils.clamp(this.camYaw + drag.yaw, -1.4, 1.4);
    const back = new V3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));                    // away from the ring
    const eye = new V3(s.x, s.top - 0.48 + 1.75, s.z).addScaledVector(back, 0.7);
    const want = this.focus(new V3());
    if (this.look.lengthSq() === 0) this.look.copy(want); else this.look.lerp(want, Math.min(1, dt * 2.5));
    const d = this.look.clone().sub(eye), yaw = Math.atan2(d.x, d.z) + this.camYaw, flat = Math.hypot(d.x, d.z);
    cam.position.copy(eye);
    cam.lookAt(eye.x + Math.sin(yaw) * flat, this.look.y, eye.z + Math.cos(yaw) * flat);
    return true;
  }

  debug() {
    const seat = this.seatedHere(), counters = this.ctx.state.data.counters, day = this.ctx.day();
    return {
      street: this.street, phase: this.phase, t: Math.round(this.t * 10) / 10, speed: this.speed,
      ticket: hasTicket(counters, day), galaDone: counters[GALA_DONE_COUNTER] === day,
      seat: seat?.id ?? null, seatsTotal: this.seats.length, seatsFree: this.seats.filter(s => !s.occupant).length,
      crowd: { cap: this.cap, present: this.crowd.present, cheering: this.crowd.cheering },
      street_people: { vendors: this.vendors.filter(h => h.group.visible).length, queue: this.queue.filter(h => h.group.visible).length, drummers: this.drummers.filter(h => h.group.visible).length, fans: this.fans.filter(f => f.h.group.visible).length, car: !!this.car?.visible, wares: this.wares.visible },
      entrance: this.entrance.length, bout: this.bout?.info() ?? null, result: this.result, card: this.card.text,
      gate: { x: this.cx, z: this.gz }, centre: { x: this.cx, z: this.cz },
    };
  }

  dispose() {
    this.clearEntrance(); this.bout?.dispose(); this.bout = null; this.drums.stop();
    for (const h of [...this.vendors, ...this.queue, ...this.drummers, ...this.fans.map(f => f.h)]) h.dispose();
    this.crowd.dispose(); this.card.dispose();
    for (const s of this.seats) this.ctx.seats.release(s.id, CROWD);
    for (const o of this.own) o.dispose(); this.own = [];
    this.group.removeFromParent();
  }
}

/** The evening's wrestlers (the game's own cast): Babacar of Baobab in green, Lamine of Teranga in the duel's colours. */
const LEFT_LOOK: WrestlerLook = { ngembColor: 'vert', ngembPattern: 'bordure', accessories: [] };
const RIGHT_LOOK: WrestlerLook = { ngembColor: STYLES.rapide.ngemb, ngembPattern: 'uni', accessories: [] };

let evening: ArenaEvening | null = null;

export const arenaModule: GameModule = {
  name: 'arena',
  hubLoaded(ctx, hub) {
    evening?.dispose(); evening = null;
    if (hub.arena && hub.id === 'pikine') evening = new ArenaEvening(ctx, hub);
  },
  update(_ctx, dt) { evening?.update(dt); },
  camera(ctx, dt, drag) { return evening ? evening.camera(ctx.camera, dt, drag) : false; },
  safePlace() { return evening?.seatedHere() ? { x: evening.cx, z: evening.gz - 2.5, yaw: Math.PI } : null; },
  debug: () => ({
    arena: {
      info: () => evening?.debug() ?? null,
      /** Faster show for the checks (the bout runs `n` duel steps per frame). */
      speed: (n = 1) => { if (evening) evening.speed = Math.max(1, Math.round(n)); },
      go: (phase: ShowPhase) => evening?.go(phase),
      /** A free place on the tiers near (x, z) (for the checks). */
      freeSeat: (x: number, z: number) => {
        if (!evening) return null;
        const free = evening.seats.filter(s => !s.occupant).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
        return free ? { id: free.id, x: free.x, z: free.z, top: free.top, yaw: free.yaw } : null;
      },
    },
  }),
};
