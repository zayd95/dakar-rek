import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Seat } from '../interact/seats';
import type { WrestlerLook } from '../core/types';
import { Batch, signTexture } from '../world/batch';
import { Humanoid, Wrestler, humanoidReady, randomLook, type Clip } from '../actors/humanoid';
import { rng } from '../core/rng';
import { arenaExterior, eveningSize } from './exterior';
import * as P from '../activity/primitives';
import { Percussion, crowdCheer } from '../lamb/audio';
import { STYLES } from '../lamb/rules';
import { TUNNEL_MOUTH_R, WALL_R } from '../world/geew';
import { ARENA } from '../i18n/lines';
import {
  BILL, DENSITY, GALA, GALA_DONE_COUNTER, REACTION, SHOW, SHOW_LABEL, TICKET_COUNTER, TICKET_PRICE,
  fillAt, fillOrder, hasTicket, standSeats, streetAt, ticketsChecked, type Moment, type ShowPhase, type Street,
} from './program';
import { ArenaStands, type StandSide } from '../crowd/arenaStands';
import { WatchedBout } from './bout';
import { GalaCard } from './card';

/**
 * A fight evening inside the Pikine arena (docs/ARENA_VISIT.md): the ticket is bought at the window by the gate (price
 * shown before paying, paid once for the evening), the controller lets ticket holders in, the player takes a free place
 * on the tiers (« S'asseoir »), the stands fill, the wrestlers make their entrance with drums and dances, the existing
 * làmb duel is played by two NPC wrestlers of the game's cast, the crowd reacts, the result is announced and the stands
 * empty. The street outside the walls (vendors, queue, fans, drummers) belongs to src/arena/exterior.ts (another lane).
 *
 * Built on the shared systems: places and the activity runner (the ticket), the seat registry (the tiers' places,
 * shared by the crowd and the player, never twice), the module camera hook (the view from the seat), the làmb duel
 * (rules untouched, src/arena/bout.ts) and the Wolof lines (src/i18n/lines.ts). Density follows the graphics quality.
 */
const CROWD = 'arena-crowd';
/**
 * A bout every evening (Habib's evening goal: work → ride → fight → La Vague in one session): a small neighbourhood card on
 * weekdays, the big gala Friday–Sunday. The street outside (src/arena/exterior.ts) follows the arena: hubLoaded registers
 * `boutOn` with `arenaExterior.schedule`, and the exterior sizes its crowd by `eveningSize` (fewer fans on weekdays).
 */
const eventDay = (_day: number, _hour: number) => true;
/** Debug: the city day the evening uses (the checks pick a fight evening). */
let dayOverride: number | null = null;
/** Field of view on the tiers, relative to the street camera's. */
const SEAT_ZOOM = 0.74;
const V3 = THREE.Vector3;

interface Walker { h: Humanoid; from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number; end: Clip }

class ArenaEvening {
  readonly group = new THREE.Group();
  readonly cx: number; readonly cz: number; readonly gz: number;
  readonly seats: Seat[] = [];
  /** The stands' crowd (src/crowd, docs/CROWD.md): full bodies next to the player, rigged figures, far silhouettes. */
  readonly crowd: ArenaStands;
  readonly cap: number;
  phase: ShowPhase = 'idle';
  t = 0;
  speed = 1;
  street: Street = 'quiet';
  result = '';
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
  private baseFov = 58;
  private fovSet = 0;
  private look = new V3();
  private rand = rng(41);
  private ground: (x: number, z: number) => number;

  constructor(private ctx: GameCtx, hub: HubWorld) {
    const a = hub.arena!, D = DENSITY[ctx.quality()];
    this.cx = a.cx; this.cz = a.cz; this.gz = a.cz - WALL_R;
    this.ground = (x, z) => 0.1 + hub.heightAt(x, z);
    const cx = this.cx, gz = this.gz;
    this.group.name = 'arena_evening';
    this.group.userData.noLod = true;                 // the show's bodies are never swapped for far figures (crowdLod.ts)

    // ---------------------------------------------------------------- the tiers' places, shared by the crowd and the player
    const defs = standSeats(cx, a.cz, `${hub.id}:arena:stand`);
    for (const d of defs) {
      const s: Seat = { id: d.id, x: d.x, z: d.z, top: d.top, yaw: d.yaw, kind: 'stand', space: 'street', occupant: null, reach: 3.4 };
      ctx.seats.add(s); this.seats.push(s);
    }
    const order = fillOrder(defs.length, 7).map(i => defs[i]);
    this.cap = Math.round(defs.length * D.crowdShare);
    this.crowd = new ArenaStands(order.slice(0, this.cap), D.near, { quality: ctx.quality() });
    this.group.add(this.crowd.group);

    // ---------------------------------------------------------------- the ticket window by the gate
    const B = new Batch();
    const bx = cx - 5.2, bz = gz - 3.0, g0 = this.ground(bx, bz) - 0.1;
    B.box(1.7, 2.3, 1.3, bx, g0, bz, 0xe9dcc0); B.box(1.9, 0.14, 1.5, bx, g0 + 2.3, bz, 0x7a3f1a);
    B.box(1.1, 0.75, 0.04, bx, g0 + 1.05, bz - 0.66, 0x1f2a36); B.box(1.5, 0.08, 0.32, bx, g0 + 0.98, bz - 0.8, 0x8b6a47);
    hub.colliders.push({ x0: bx - 0.85, x1: bx + 0.85, z0: bz - 0.65, z1: bz + 0.65, h: 2.3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshLambertMaterial({ map: signTexture('GUICHET · BILLETS', '#7a3f1a', '#ffe7b0', 512, 128) }));
    sign.position.set(bx, g0 + 2.62, bz - 0.68); sign.rotation.y = Math.PI; this.group.add(sign);
    this.own.push(sign.geometry, sign.material as THREE.Material, (sign.material as THREE.MeshLambertMaterial).map!);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true }); this.own.push(mat);
    { const m = B.build(mat, true, true); if (m) { this.group.add(m); this.own.push(m.geometry); } }
    // ---------------------------------------------------------------- the ticket window: a place of the shared registry
    const place = 'Arène de Pikine';
    ctx.places.add({
      id: `${hub.id}:arena:guichet`, type: 'ticket', name: 'Guichet · Arène de Pikine', space: 'street', hours: [GALA.doors, GALA.close],
      anchors: [{ id: 'guichet', name: 'Guichet · billets', kind: 'counter', x: bx, z: bz - 1.35, radius: 2.0 }],
      offers: { guichet: [P.handOver('buy', {
        id: 'billet', label: `Acheter un billet (${TICKET_PRICE.toLocaleString('fr-FR')} F)`, detail: 'Tribune populaire · valable toute la soirée',
        requires: () => (hasTicket(ctx.state.data.counters, this.day()) ? 'Tu as déjà ton billet pour ce soir'
          : eventDay(this.day(), ctx.hour()) ? null : 'Pas de gala ce soir'),
        then: () => this.confirmTicket(place),
      })] },
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
          then: () => { ctx.state.data.counters[TICKET_COUNTER] = this.day(); } }), { place });
      } },
      { label: 'Annuler', icon: '↩️', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }

  // ---------------------------------------------------------------- every frame
  /** The city day of the evening (tickets and the gala are per day). */
  day() { return dayOverride ?? this.ctx.day(); }
  /** A gala is running (from the stands filling to the crowd leaving). */
  showing() { return this.phase !== 'idle' && this.phase !== 'over'; }
  /** A bout is on at the arena on this day and hour: doors open or a gala running. */
  boutOn(day: number, hour: number) {
    if (this.showing()) return true;
    const s = streetAt(hour, this.ctx.state.data.counters[GALA_DONE_COUNTER] === day, eventDay(day, hour));
    return s === 'setup' || s === 'doors';
  }
  inside(x: number, z: number) { return Math.hypot(x - this.cx, z - this.cz) < WALL_R - 0.4; }
  seatedHere(): Seat | null { const s = this.ctx.player.seated(); return s && s.kind === 'stand' && this.seats.includes(s) ? s : null; }

  update(dt: number) {
    const { ctx } = this, hour = ctx.hour(), day = this.day(), counters = ctx.state.data.counters, event = eventDay(day, hour);
    const galaDone = counters[GALA_DONE_COUNTER] === day;
    if (this.phase === 'over' && !galaDone) this.phase = 'idle';            // a new day, a new gala evening
    const showing = this.phase !== 'idle' && this.phase !== 'over';
    this.street = showing ? 'doors' : streetAt(hour, galaDone, event);
    const me = ctx.player.pos;

    // the gate: the controller checks tickets while the doors are open
    const seat = this.seatedHere();
    const inNow = !seat && this.inside(me.x, me.z);
    this.stopT = Math.max(0, this.stopT - dt);
    if (inNow && !this.wasInside && ticketsChecked(hour, galaDone, event) && ctx.mode() === 'play') {
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
    if (seatId !== this.nearSeat) { this.nearSeat = seatId; this.crowd.setNear(seat?.x ?? 0, seat ? seat.z : null, seat?.yaw ?? 0); }
    if (near) this.crowd.cull(ctx.camera);                                    // LOD by distance to the camera, seated or not
    this.crowd.update(dt, near);
    this.card.show(this.phase === 'idle' || this.phase === 'over' ? null : {
      title: 'Gala de làmb · Arène de Pikine',
      sub: `${SHOW_LABEL[this.phase]} · ${BILL.left.name} (${BILL.left.ecurie}) – ${BILL.right.name} (${BILL.right.ecurie})`,
    });
  }

  /** How many of the crowd's places are taken now. */
  crowdTarget(): number {
    switch (this.phase) {
      case 'filling': case 'entrance': case 'bout': case 'result': return Math.round(this.cap * this.sizeShare());
      case 'leaving': return Math.round(this.cap * Math.max(0, 1 - this.t / SHOW.leaving));
      case 'over': return 0;
      default: return this.street === 'doors' ? Math.round(this.cap * this.sizeShare() * fillAt(this.ctx.hour())) : 0;
    }
  }
  /** Full stands for the Friday–Sunday gala, a neighbourhood crowd for a weekday card (as the street outside). */
  private sizeShare() { return eveningSize(this.day(), Math.max(this.ctx.hour(), 17)) === 'gala' ? 1 : 0.55; }
  private syncCrowd() {
    const seats = this.ctx.seats;
    this.crowd.fill(this.crowdTarget(), id => { const s = seats.get(id); return !!s && !!s.occupant && s.occupant !== CROWD; });
    const taken = new Set(this.crowd.taken().map(s => s.id));
    for (const s of this.seats) {
      if (taken.has(s.id)) { if (!s.occupant) s.occupant = CROWD; }
      else if (s.occupant === CROWD) s.occupant = null;
    }
  }

  /** The stands react to a moment (src/crowd/arenaStands.ts momentPlan): `side`, the wrestler walking in or winning. */
  private react(m: Moment, side: StandSide | null = null, sound = true) {
    const r = REACTION[m];
    this.crowd.moment(m, m === 'result' ? { winner: side } : { side });
    if (sound) crowdCheer(Math.min(4, r.seconds), (m === 'clinch' ? 0.1 : 0.2) * (0.7 + 0.5 * this.crowd.level()));
  }
  private say(key: string, line: string) { if (this.told.has(key)) return; this.told.add(key); this.ctx.toast(line); }

  // ---------------------------------------------------------------- the show
  go(phase: ShowPhase) {
    const { ctx } = this;
    this.phase = phase; this.t = 0; this.fillT = 0;                          // the stands follow the phase at once
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
      this.react('result', !r || !r.winner ? null : r.winner === 'player' ? 'left' : 'right');
    } else if (phase === 'leaving') {
      this.bout?.dispose(); this.bout = null;
    } else if (phase === 'over') {
      ctx.state.data.counters[GALA_DONE_COUNTER] = this.day(); ctx.save();
      this.street = streetAt(ctx.hour(), true);                       // the gate stops checking tickets from now on
      ctx.toast(ARENA.over);
    }
  }
  private abort() {
    this.clearEntrance(); this.bout?.dispose(); this.bout = null; this.drums.stop();
    this.phase = 'idle'; this.t = 0;
  }

  private startEntrance() {
    if (!humanoidReady()) return;
    const q = this.ctx.quality(), cx = this.cx, cz = this.cz;
    const walker = (h: Humanoid, fx: number, fz: number, tx: number, tz: number, t0: number, t1: number, end: Clip) => {
      h.group.position.set(fx, 0.1, fz); this.group.add(h.group);
      this.entrance.push({ h, from: new V3(fx, 0.1, fz), to: new V3(tx, 0.1, tz), t0, t1, end });
    };
    const lw = new Wrestler(0x5b3420); lw.setLook(LEFT_LOOK, 'B');
    const rw = new Wrestler(0x4e2e1c); rw.setLook(RIGHT_LOOK, 'A');
    // the wrestlers come out of their tunnel opposite the public gate (src/world/geew.ts TUNNEL_*), down the runner
    const tz = cz + TUNNEL_MOUTH_R + 2.5;
    walker(lw, cx + 0.8, tz, cx + 3, cz, 0.5, 6.5, 'Dance_A');
    walker(rw, cx - 0.8, tz, cx - 3, cz, 3.5, 9.5, 'Dance_B');
    const followers = q === 'low' ? 0 : q === 'medium' ? 1 : 2;
    const R = rng(77);
    for (const [side, t0] of [[1, 0.9], [-1, 3.9]] as const) for (let k = 0; k < followers; k++) {
      const h = new Humanoid({ ...randomLook(R), style: 'boubou', female: false });
      walker(h, cx + side * (1.0 + k * 0.5), tz + 0.8 + k * 0.8, cx + side * (4.4 + k * 0.9), cz + 3.2 + k * 0.6, t0, t0 + 6, 'Celebrate');
    }
    // the drums of the evening are the drummers' deck by the tunnel (src/arena/interior.ts), heard by distance through
    // src/arena/exteriorAudio.ts all evening: no second group or second rhythm here
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
        if (k >= 1 && !this.told.has(`arrived:${w.end}`)) { this.told.add(`arrived:${w.end}`); this.react('entrance', w.end === 'Dance_A' ? 'left' : 'right'); }
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

  /**
   * The view from the seat: the spectator's own eyes (the body is hidden, as in a car rapide seat), a slightly narrower
   * field of view so the wrestlers read from the tiers, the gaze following the action; drag looks around (±80°).
   */
  camera(cam: THREE.PerspectiveCamera, dt: number, drag: { yaw: number; pitch: number }): boolean {
    const s = this.seatedHere();
    if (!s) {
      if (this.fovSet) { cam.fov = this.baseFov; cam.updateProjectionMatrix(); this.fovSet = 0; }
      this.camYaw = 0; this.look.set(0, 0, 0); return false;
    }
    if (cam.fov !== this.fovSet) this.baseFov = cam.fov;                       // first frame seated, or a resize changed it
    this.camYaw = THREE.MathUtils.clamp(this.camYaw + drag.yaw, -1.4, 1.4);
    const eye = new V3(s.x + Math.sin(s.yaw) * 0.12, s.top + 0.8, s.z + Math.cos(s.yaw) * 0.12);
    const want = this.focus(new V3());
    if (this.look.lengthSq() === 0) this.look.copy(want); else this.look.lerp(want, Math.min(1, dt * 2.5));
    const d = this.look.clone().sub(eye), yaw = Math.atan2(d.x, d.z) + this.camYaw, flat = Math.hypot(d.x, d.z);
    cam.position.copy(eye);
    cam.lookAt(eye.x + Math.sin(yaw) * flat, this.look.y, eye.z + Math.cos(yaw) * flat);
    const fov = Math.round(this.baseFov * SEAT_ZOOM * 10) / 10;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.fovSet = fov;
    const body = this.ctx.player.body();
    if (body) body.group.visible = false;                                      // shown again by main.ts next frame
    this.crowd.cull(cam);
    return true;
  }

  debug() {
    const seat = this.seatedHere(), counters = this.ctx.state.data.counters, day = this.day();
    return {
      street: this.street, event: eventDay(day, this.ctx.hour()), day, phase: this.phase, t: Math.round(this.t * 10) / 10, speed: this.speed,
      ticket: hasTicket(counters, day), galaDone: counters[GALA_DONE_COUNTER] === day,
      seat: seat?.id ?? null, seatsTotal: this.seats.length, seatsFree: this.seats.filter(s => !s.occupant).length,
      crowd: { cap: this.cap, present: this.crowd.present, cheering: this.crowd.cheering, level: Math.round(this.crowd.level() * 100) / 100, lod: this.crowd.stats() },
      entrance: this.entrance.length, bout: this.bout?.info() ?? null, result: this.result, card: this.card.text,
      gate: { x: this.cx, z: this.gz }, centre: { x: this.cx, z: this.cz },
    };
  }

  dispose() {
    if (this.fovSet) { this.ctx.camera.fov = this.baseFov; this.ctx.camera.updateProjectionMatrix(); this.fovSet = 0; }
    this.clearEntrance(); this.bout?.dispose(); this.bout = null; this.drums.stop();
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
    arenaExterior.schedule(evening ? (d, h) => !!evening?.boutOn(d, h) : null);       // the street lives whenever a bout is on
  },
  update(_ctx, dt) { evening?.update(dt); },
  camera(ctx, dt, drag) { return evening ? evening.camera(ctx.camera, dt, drag) : false; },
  safePlace() { return evening?.seatedHere() ? { x: evening.cx, z: evening.gz - 2.5, yaw: Math.PI } : null; },
  debug: ctx => ({
    arena: {
      info: () => evening?.debug() ?? null,
      /** Where the camera is and where it looks on the ground (the seat's view must face the ring). */
      cam: () => { const c = ctx.camera, d = new THREE.Vector3(); c.getWorldDirection(d); return { x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: d.y, dz: d.z }; },
      /** Faster show for the checks (the bout runs `n` duel steps per frame). */
      speed: (n = 1) => { if (evening) evening.speed = Math.max(1, Math.round(n)); },
      go: (phase: ShowPhase) => evening?.go(phase),
      /** Shows or hides everything this module draws (the checks measure its own draw calls). */
      visible: (on = true) => { if (evening) evening.group.visible = on; },
      /** Pretend the city day is `d` (null: the clock's), e.g. a fight evening. */
      day: (d: number | null) => { dayOverride = d; },
      /** A free place on the tiers near (x, z) (for the checks). */
      freeSeat: (x: number, z: number) => {
        if (!evening) return null;
        const free = evening.seats.filter(s => !s.occupant).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
        return free ? { id: free.id, x: free.x, z: free.z, top: free.top, yaw: free.yaw } : null;
      },
    },
  }),
};
