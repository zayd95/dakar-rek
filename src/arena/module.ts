import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Seat } from '../interact/seats';
import type { WrestlerLook } from '../core/types';
import { Batch, signTexture } from '../world/batch';
import { Humanoid, Wrestler, humanoidReady, type Clip } from '../actors/humanoid';
import { arenaExterior, eveningSize } from './exterior';
import { arenaFighter } from './fighter';
import * as P from '../activity/primitives';
import { Percussion, crowdCheer, paChime } from '../lamb/audio';
import { hasGestured } from './exteriorAudio';
import { STYLES } from '../lamb/rules';
import { rosterLook } from '../career/roster';
import { TUNNEL_MOUTH_R, WALL_R, standExits } from '../world/geew';
import { ARENA } from '../i18n/lines';
import {
  billFor, ecurieLabel, reportMainEvent, DENSITY, GALA, GALA_DONE_COUNTER, REACTION, SHOW, SHOW_LABEL, TICKET_COUNTER, TICKET_PRICE,
  SHOW_PHASES, boutSeed, fillAt, fillOrder, hasTicket, standSeats, streetAt, ticketTier, ticketsChecked, type Moment, type ShowPhase, type Street,
} from './program';
import { ArenaStands, type StandSide } from '../crowd/arenaStands';
import { WatchedBout } from './bout';
import { lamb2On } from '../lamb/flag';
import { localPair, rosterOpponent } from '../lamb/opponents';
import { PRELIM, PRELIM_TYPICAL, prelimFill, prelimName, undercardFor, type Prelim } from './undercard';
import { GalaCard } from './card';
import { FightNightPeople } from './people';
import { TICKETS, TIER_COUNTER, TRIBUNES, crowdMayTake, honneurDress, seatRefusal, ticketLabel, ticketSheet, whereLine, type Tribune } from './tickets';
import { decorMaterial, honneurPlate, tribuneDecor } from './ticketsDecor';
import { EntranceCeremony } from './entrance';
import { posters } from './posters';
import { recordGalaResult } from '../social/fightTalk';

/**
 * A fight evening inside the Pikine arena (docs/ARENA_VISIT.md): the ticket is bought at the window by the gate (price
 * shown before paying, paid once for the evening), the controller lets ticket holders in, the player takes a free place
 * on the tiers (« S'asseoir »), the stands fill while short preliminary bouts of young wrestlers run (src/arena/undercard.ts),
 * the main event's wrestlers make their entrance with drums and dances, the existing
 * làmb duel is played by two NPC wrestlers of the game's cast, the crowd reacts, the result is announced and the stands
 * empty. The street outside the walls (vendors, queue, fans, drummers) belongs to src/arena/exterior.ts (another lane).
 *
 * Built on the shared systems: places and the activity runner (the ticket), the seat registry (the tiers' places,
 * shared by the crowd and the player, never twice), the module camera hook (the view from the seat), the làmb duel
 * (rules untouched, src/arena/bout.ts) and the Wolof lines (src/i18n/lines.ts). Density follows the graphics quality.
 */
/** Occupant of the tiers' places taken by the crowd (src/arena/together.ts lets a friend's seat take over from it). */
export const ARENA_CROWD = 'arena-crowd';
const CROWD = ARENA_CROWD;
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

/** A wrestler walking from the tunnel to his mark (the preliminaries' walk-in: no ceremony). */
interface Walker { h: Humanoid; from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number; end: Clip }
/** How the evening's bout ended, as the show tells it (and as friends share it: src/arena/together.ts). */
export type ShowOutcome = 'projection' | 'decision' | 'egalite' | 'abandon';
export interface ShowResult { winner: 'left' | 'right' | null; outcome: ShowOutcome }
/** Seconds a friend's show may be ahead of this one before this one jumps to it. */
export const FOLLOW_SLACK = 1.5;

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
  /** The bout's result once known (this device's bout, or the one a friend further on saw). */
  outcome: ShowResult | null = null;
  private adopted: ShowResult | null = null;
  /** Bout time a catch-up is heading for (the stands do not react to the moments played on the way). */
  private catchUpTo = 0;
  private hubId: string;
  private own: { dispose(): void }[] = [];
  /** The wrestlers' entrance as a ceremony: tunnel, bàkk on the sand, corner, ring (src/arena/entrance.ts). */
  private ceremony: EntranceCeremony | null = null;
  private bout: WatchedBout | null = null;
  /** Avec frappe: how the stands split at the watched bout's fall (who celebrated, who held their heads), for the checks. */
  private fallSplit: { side: StandSide; celebrate: number; heads: number } | null = null;
  /** The last watched bout, once over: discipline, how it ended, the referee's arm, the stands at the fall (checks). */
  private lastBout: Record<string, unknown> | null = null;
  /** The evening's preliminaries, the one running now (`pi`), its wrestlers walking in, its bout, the show time its
   *  bout ended at (−1 while it runs), what each ended with; the stands' share when the show began. */
  private prelims: Prelim[] = [];
  private pi = 0;
  private pWalk: Walker[] = [];
  private pBout: WatchedBout | null = null;
  private pEnded = -1;
  private pResults: string[] = [];
  private fillStart = 0;
  /** When each phase (and each preliminary) began, on the real clock: the evening's timeline (debug `arena.timeline`). */
  private marks: { phase: string; at: number }[] = [];
  private drums = new Percussion();
  private card: GalaCard;
  /** The referee and officials, the drummers, the vendors in the stands, the wrestlers' entourages (src/arena/people.ts). */
  private people: FightNightPeople;
  get peopleGroup() { return this.people.group; }
  private wasInside = false;
  private stopT = 0;
  private fillT = 0;
  private told = new Set<string>();
  private nearSeat: string | null = null;
  private camYaw = 0;
  private baseFov = 58;
  private fovSet = 0;
  private look = new V3();
  private ground: (x: number, z: number) => number;
  /** The ticket tier of each place on the tiers. */
  private tribune = new Map<string, Tribune>();
  tribuneOf(id: string): Tribune | null { return this.tribune.get(id) ?? null; }
  /** Per tier: its places, those free, those the crowd holds. */
  tribunes() {
    const out = {} as Record<Tribune, { places: number; free: number; crowd: number }>;
    for (const t of TRIBUNES) out[t] = { places: 0, free: 0, crowd: 0 };
    for (const s of this.seats) { const o = out[this.tribune.get(s.id) ?? 'populaire']; o.places++; if (!s.occupant) o.free++; else if (s.occupant === CROWD) o.crowd++; }
    return out;
  }

  constructor(private ctx: GameCtx, hub: HubWorld) {
    const a = hub.arena!, D = DENSITY[ctx.quality()];
    this.cx = a.cx; this.cz = a.cz; this.gz = a.cz - WALL_R; this.hubId = hub.id;
    this.ground = (x, z) => 0.1 + hub.heightAt(x, z);
    const cx = this.cx, gz = this.gz;
    this.group.name = 'arena_evening';
    this.group.userData.noLod = true;                 // the show's bodies are never swapped for far figures (crowdLod.ts)

    // ---------------------------------------------------------------- the tiers' places, shared by the crowd and the player
    const defs = standSeats(cx, a.cz, `${hub.id}:arena:stand`);
    for (const d of defs) {
      // offered from the ring side and from the aisles (src/world/geew.ts); standing up leads into the nearest aisle
      // each place knows its section and its ticket tier: another ticket's places are shown greyed, with the reason
      const s: Seat = { id: d.id, x: d.x, z: d.z, top: d.top, yaw: d.yaw, kind: 'stand', space: 'street', occupant: null, reach: 3.4, exits: standExits(cx, a.cz, d.a, d.tier),
        section: d.section ?? undefined, label: TICKETS[d.tribune].seat ?? undefined, refuse: () => this.refusal(d.tribune) };
      this.tribune.set(d.id, d.tribune);
      ctx.seats.add(s); this.seats.push(s);
    }
    // the crowd fills each tier its own way: the honneur rows stay roomy, their people in their best (src/arena/tickets.ts)
    const order = fillOrder(defs.length, 7).map(i => defs[i]).filter(d => crowdMayTake(d.id, d.tribune));
    this.cap = Math.round(order.length * D.crowdShare);
    this.crowd = new ArenaStands(order.slice(0, this.cap), D.near, { quality: ctx.quality(), look: (seat, base, r) => (seat.tribune === 'honneur' ? honneurDress(base, r) : base) });
    // the tiers seen: cushions on the couverte and honneur places, the couverte's canvas, the honneur rows' plate
    {
      const dm = decorMaterial(), m = tribuneDecor(cx, a.cz, defs).build(dm, true, true);
      this.own.push(dm); if (m) { this.group.add(m); this.own.push(m.geometry); }
      const pl = honneurPlate(cx, a.cz), tex = signTexture('TRIBUNE D’HONNEUR', '#f2f2ec', '#7a5a12', 512, 96);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), new THREE.MeshLambertMaterial({ map: tex }));
      plate.position.set(pl.x, 0.62, pl.z); plate.rotation.y = pl.yaw; this.group.add(plate);
      this.own.push(plate.geometry, plate.material as THREE.Material, tex);
    }
    this.group.add(this.crowd.group);
    this.people = new FightNightPeople(ctx, hub, this.cx, this.cz);

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
        id: 'billet', label: `Acheter un billet (dès ${TICKET_PRICE.toLocaleString('fr-FR')} F)`, detail: 'Populaire, couverte ou d’honneur · valable toute la soirée',
        visible: () => !hasTicket(ctx.state.data.counters, this.day()),
        requires: () => (eventDay(this.day(), ctx.hour()) ? null : 'Pas de gala ce soir'),
        then: () => this.confirmTicket(place),
      }),
      // ticket in hand: the window says so (no greyed « Acheter » with a red reason) and where to go next
      P.inspect({
        id: 'billet_ok', label: 'Billet en poche ✓', detail: 'Entrée par la porte de l’arène',
        visible: () => hasTicket(ctx.state.data.counters, this.day()),
        then: () => ctx.toast('Tu as déjà ton billet pour ce soir : entre par la porte de l’arène.'),
      })] },
    });
    this.card = new GalaCard(document.getElementById('ui') ?? document.body);
    ctx.extra.add(this.group);
  }

  // ---------------------------------------------------------------- ticket
  /** The window's sheet: the three tiers, each price shown on its own « Payer … »; one ticket for the evening. */
  private confirmTicket(place: string) {
    const { ctx } = this;
    ctx.menu('Billet · gala de làmb', ticketSheet(), [
      ...TRIBUNES.map(t => {
        const k = TICKETS[t], ok = ctx.state.canAfford(k.price);
        return { label: `Payer ${k.price.toLocaleString('fr-FR')} F · ${k.label}`, icon: t === 'honneur' ? '⭐' : '🎟️', detail: ok ? `${k.detail} (${k.where})` : 'Pas assez d’argent', disabled: !ok, onPick: () => {
          ctx.hud.closeModal(); ctx.setMode('play');
          ctx.activities.start(P.buy({ id: 'billet', label: ticketLabel(t), price: k.price, line: () => ARENA.ticket(k.price),
            then: () => { ctx.state.data.counters[TICKET_COUNTER] = this.day(); ctx.state.data.counters[TIER_COUNTER] = TRIBUNES.indexOf(t); } }), { place });
        } };
      }),
      { label: 'Annuler', icon: '↩️', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ]);
  }
  /** The controller's rule for a place of `t` (null: the player may sit there). Outside the gala's hours, nobody checks. */
  private refusal(t: Tribune): string | null {
    const day = this.day(), counters = this.ctx.state.data.counters;
    if (!this.showing() && !ticketsChecked(this.ctx.hour(), counters[GALA_DONE_COUNTER] === day, eventDay(day, this.ctx.hour()))) return null;
    return seatRefusal(ticketTier(counters, day), t);
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
      if (!hasTicket(counters, day) && !arenaFighter.pending()) {   // a wrestler of tonight needs no ticket                               // turned back at the gate, toward the street
        ctx.player.place(this.cx, this.gz - 1.6, Math.PI);
        if (this.stopT <= 0) { ctx.toast(ARENA.stop()); this.stopT = 3; }
        this.wasInside = false;
        return this.after(dt);
      }
      const t = ticketTier(counters, day);
      ctx.toast(ARENA.welcome(t ? whereLine(t) : undefined));
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
    if (this.phase !== 'idle' && this.phase !== 'over' && this.phase !== 'bout' && this.phase !== 'prelims') this.t += dt * this.speed;
    switch (this.phase) {
      case 'filling': if (this.t >= SHOW.filling) this.go(this.prelims.length ? 'prelims' : 'entrance'); break;
      case 'prelims': this.updatePrelim(dt * this.speed); break;
      case 'entrance': this.ceremony?.update(this.t, dt * this.speed); if (this.t >= SHOW.entrance) this.go('bout'); break;
      case 'bout': if (this.bout) { this.bout.advance(dt * this.speed); this.t = this.bout.time; if (this.bout.over) this.go('result'); } break;
      case 'result': if (this.t >= SHOW.result) this.go('leaving'); break;
      case 'leaving': if (this.t >= SHOW.leaving) this.go('over'); break;
    }
    this.people.update(dt, this.phase, this.t, this.street, dt * (this.phase === 'bout' ? 1 : this.speed), billFor(this.day()));
    // the stands fill with the evening and empty after the gala
    this.fillT -= dt;
    if (this.fillT <= 0) { this.fillT = 0.4; this.syncCrowd(); }
    const near = Math.hypot(ctx.player.pos.x - this.cx, ctx.player.pos.z - this.cz) < 70;
    this.crowd.group.visible = near;
    const seatId = seat?.id ?? null;
    if (seatId !== this.nearSeat) { this.nearSeat = seatId; this.crowd.setNear(seat?.x ?? 0, seat ? seat.z : null, seat?.yaw ?? 0); }
    if (near) this.crowd.cull(ctx.camera);                                    // LOD by distance to the camera, seated or not
    this.crowd.update(dt, near);
    const bill = this.phase === 'idle' || this.phase === 'over' ? null : billFor(this.day()), pre = this.phase === 'prelims' ? this.prelims[this.pi] : null;
    this.card.show(!bill ? null : pre ? {
      title: 'Gala de làmb · Préliminaires',
      sub: `Préliminaires ${this.pi + 1}/${this.prelims.length} · ${prelimName(pre.left)} – ${prelimName(pre.right)}`,
    } : {
      title: bill.title ? 'Gala de làmb · Combat pour le titre' : 'Gala de làmb · Arène de Pikine',
      sub: `${SHOW_LABEL[this.phase]} · ${bill.left.name} (${ecurieLabel(bill.left.ecurie)}) – ${bill.right.name} (${ecurieLabel(bill.right.ecurie)})`,
    });
  }

  /** How many of the crowd's places are taken now. */
  crowdTarget(): number {
    switch (this.phase) {
      // the stands fill during the preliminaries, nearly full when the main event's wrestlers walk in
      case 'filling': return Math.round(this.cap * this.sizeShare() * this.startShare());
      case 'prelims': return Math.round(this.cap * this.sizeShare() * prelimFill(this.startShare(), this.pi, this.prelims.length, this.t / PRELIM_TYPICAL));
      case 'entrance': case 'bout': case 'result': return Math.round(this.cap * this.sizeShare());
      case 'leaving': return Math.round(this.cap * Math.max(0, 1 - this.t / SHOW.leaving));
      case 'over': return 0;
      default: return this.street === 'doors' ? Math.round(this.cap * this.sizeShare() * fillAt(this.ctx.hour())) : 0;
    }
  }
  /** The stands' share when the show began (the hour's fill, at least about a third). */
  private startShare() { return Math.max(0.35, this.fillStart); }
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

  /**
   * The player's own bout (Làmb 2.0, LambDuel.onMoment): at the fall, the side of the winner's écurie celebrates while the
   * loser's side and the end sections leap up, hands on their heads; at the result, the stands' result plan. The player's
   * side is his écurie's (Baobab on the left sections, Teranga on the right) when the fighter's evening is on, the left
   * otherwise. Uses the crowd lane's reactions (src/crowd/arenaStands.ts), unchanged.
   */
  boutMoment(m: 'fall' | 'result', winner: 'player' | 'opponent' | null, outcome: string) {
    const mine: StandSide = arenaFighter.corner() === 'teranga' ? 'right' : 'left', theirs: StandSide = mine === 'left' ? 'right' : 'left';
    const side = winner === null ? null : winner === 'player' ? mine : theirs;
    if (m === 'result') { this.crowd.moment('result', { winner: side }); return; }
    if (outcome !== 'projection' || !side) { this.crowd.moment('decision'); return; }
    this.fallReaction(side);
  }

  /** The evening's two wrestlers as themselves for a bout avec frappe (Làmb 2.0, ?lamb2 only), else null. */
  private frappeBill() {
    if (!lamb2On()) return null;
    const bill = billFor(this.day()), career = (this.ctx.state.data as { career?: Parameters<typeof rosterOpponent>[2] }).career;
    const left = rosterOpponent(bill.left.name, this.day(), career), right = rosterOpponent(bill.right.name, this.day(), career);
    return left && right ? { left, right } : null;
  }
  /** A fall by projection: `side` (the winner's supporters) celebrates, the other side and the end sections hold their heads. */
  private fallReaction(side: StandSide) {
    const celebrate = this.crowd.react(side, 'celebrate', { share: 0.9, seconds: 6 });
    const heads = this.crowd.react(side === 'left' ? 'right' : 'left', 'fall', { share: 0.85, seconds: 3.5 }) + this.crowd.react('ends', 'fall', { share: 0.7, seconds: 3.5 });
    this.fallSplit = { side, celebrate, heads };
    crowdCheer(3.5, 0.2 * (0.7 + 0.5 * this.crowd.level()));
  }

  /** The stands react to a moment (src/crowd/arenaStands.ts momentPlan): `side`, the wrestler walking in or winning. */
  private react(m: Moment, side: StandSide | null = null, sound = true) {
    const r = REACTION[m];
    this.crowd.moment(m, m === 'result' ? { winner: side } : { side });
    this.people.react(m);
    if (sound) crowdCheer(Math.min(4, r.seconds), (m === 'clinch' ? 0.1 : 0.2) * (0.7 + 0.5 * this.crowd.level()));
  }
  private say(key: string, line: string) { if (this.told.has(key)) return; this.told.add(key); this.ctx.toast(line); }

  // ---------------------------------------------------------------- the show
  go(phase: ShowPhase) {
    const { ctx } = this;
    this.phase = phase; this.t = 0; this.fillT = 0;                          // the stands follow the phase at once
    if (phase === 'filling') this.marks = [];                                // the timeline starts when the show does
    this.mark(phase);
    if (phase !== 'prelims') this.clearPrelim();
    if (phase === 'filling') {
      this.told.clear(); this.result = ''; this.outcome = null; this.adopted = null; this.catchUpTo = 0; this.fallSplit = null; this.lastBout = null;
      const bill = billFor(this.day());
      this.say('bill', ARENA.bill(bill.left.name, bill.left.ecurie, bill.right.name, bill.right.ecurie));
      // tonight's preliminaries: the same card on every device, by the evening's size, the main event's names kept out
      this.prelims = undercardFor(this.hubId, this.day(), eveningSize(this.day(), Math.max(17, ctx.hour())), [bill.left.name, bill.right.name]);
      this.pResults = []; this.pi = 0; this.fillStart = fillAt(ctx.hour());
    } else if (phase === 'prelims') {
      this.startPrelim(0);
    } else if (phase === 'entrance') {
      this.startEntrance();
    } else if (phase === 'bout') {
      this.clearEntrance();
      this.bout = new WatchedBout({ x: this.cx, z: this.cz }, rosterLook(billFor(this.day()).left.id)?.look ?? LEFT_LOOK, boutSeed(this.hubId, this.day()), { frappe: this.frappeBill() });
      this.bout.onMoment = (p, i) => {
        if (this.bout && this.bout.time < this.catchUpTo - 0.5) return;
        if (p === 'clinch') this.react('clinch');
        if (p !== 'fall') return;
        // avec frappe, a fall splits the stands: the winner's side celebrates, the other side holds its head
        if (this.bout?.frappe && i.outcome === 'projection' && i.winner) this.fallReaction(i.winner === 'player' ? 'left' : 'right');
        else this.react(i.outcome === 'projection' ? 'fall' : 'decision');
      };
      this.group.add(this.bout.group);
    } else if (phase === 'result') {
      const r = this.bout?.result, bi = this.bout?.info() as (Record<string, unknown> | undefined);
      this.lastBout = bi ? { discipline: bi.discipline, winner: r?.winner ?? null, outcome: r?.outcome ?? null, refereeRaised: bi.refereeRaised ?? null, fallSplit: this.fallSplit } : null;
      const own: ShowResult | null = r ? { winner: !r.winner ? null : r.winner === 'player' ? 'left' : 'right', outcome: (r.outcome === 'entrainement' ? 'egalite' : r.outcome) as ShowOutcome } : null;
      this.outcome = this.adopted ?? own ?? { winner: null, outcome: 'egalite' };
      const side = this.outcome.winner, how = this.outcome.outcome;
      const bill = billFor(this.day()), won = side ? bill[side] : null, lost = side === 'left' ? bill.right : bill.left;
      if (r || this.adopted) reportMainEvent(this.day(), won?.id ?? null);   // the city's ladder remembers the main event the player watched
      this.result = this.resultLine(this.outcome);
      this.people.result(side);
      ctx.toast(this.result);
      this.react('result', side);
      // the city talks about it that evening and the next day (src/social/fightTalk.ts), the posters print it
      recordGalaResult(ctx.state.data.counters, this.day(), side, how);
      posters.setResult(this.day(), won && how !== 'egalite' && how !== 'abandon'
        ? `${won.name} bat ${lost.name}, victoire ${how === 'projection' ? 'par chute' : 'aux points'}` : `${bill.left.name} et ${bill.right.name} : match nul`);
    } else if (phase === 'leaving') {
      this.bout?.dispose(); this.bout = null;
    } else if (phase === 'over') {
      ctx.state.data.counters[GALA_DONE_COUNTER] = this.day(); ctx.save();
      this.street = streetAt(ctx.hour(), true);                       // the gate stops checking tickets from now on
      ctx.toast(ARENA.over);
    }
  }
  // ---------------------------------------------------------------- the preliminaries (src/arena/undercard.ts)
  /** The i-th preliminary: the announcer names it, the two young wrestlers walk out of the tunnel to the ring. */
  private startPrelim(i: number) {
    this.clearPrelim();
    this.pi = i; this.t = 0; this.pEnded = -1; this.catchUpTo = 0;
    const p = this.prelims[i]; if (!p) return;
    this.mark(`prelim ${i + 1}`);
    // the announcer at the microphone, as for the main event's ceremony (src/arena/entrance.ts): one voice at a time, the
    // previous result said 3.5 s before, the ceremony's first call 0.7 s into the entrance after the last one
    if (!this.told.has(`prelim:${i}`) && hasGestured()) paChime();
    this.say(`prelim:${i}`, ARENA.prelim(i + 1, this.prelims.length, prelimName(p.left), prelimName(p.right)));
    if (!humanoidReady()) return;
    const cx = this.cx, cz = this.cz, tz = cz + TUNNEL_MOUTH_R + 2.5;
    const lw = new Wrestler(0x5b3420); lw.setLook(p.look, p.look.ngembPattern === 'bordure' ? 'B' : 'A');
    const rw = new Wrestler(0x4e2e1c); rw.setLook({ ngembColor: STYLES[p.style].ngemb, ngembPattern: 'uni', accessories: [] }, 'A');
    // a short walk to their marks (where the duel puts them), no dances: the ceremony is the main event's
    for (const [h, sx, t0] of [[lw, 1, 0.2], [rw, -1, 0.7]] as const) {
      h.group.position.set(cx + sx * 0.8, 0.1, tz); this.group.add(h.group);
      this.pWalk.push({ h, from: new V3(cx + sx * 0.8, 0.1, tz), to: new V3(cx + sx * 3, 0.1, cz), t0, t1: PRELIM.walk - 0.5 + t0 * 0.4, end: 'Prep' });
    }
  }
  /** One frame of the current preliminary: the walk-in, then its bout, then a short moment for the result. */
  private updatePrelim(dt: number) {
    const p = this.prelims[this.pi]; if (!p) { this.go('entrance'); return; }
    if (!this.pBout) {
      this.t += dt;
      for (const w of this.pWalk) {
        const k = THREE.MathUtils.clamp((this.t - w.t0) / (w.t1 - w.t0), 0, 1), walking = k > 0 && k < 1;
        w.h.group.position.lerpVectors(w.from, w.to, k);
        w.h.group.rotation.y = k < 1 ? Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z) : Math.atan2(this.cx - w.h.group.position.x, this.cz - w.h.group.position.z);
        if (w.h instanceof Wrestler) { w.h.play(walking ? 'Entrance_Walk' : k >= 1 ? w.end : 'Idle'); w.h.update(dt); }
      }
      if (this.t >= PRELIM.walk) this.startPrelimBout(p);
      return;
    }
    if (this.pEnded < 0) {
      this.pBout.advance(dt);
      this.t = PRELIM.walk + this.pBout.time;
      if (this.pBout.over) this.endPrelim(p);
      return;
    }
    this.t += dt;
    if (this.t >= this.pEnded + PRELIM.result) { if (this.pi + 1 < this.prelims.length) this.startPrelim(this.pi + 1); else this.go('entrance'); }
  }
  private startPrelimBout(p: Prelim) {
    for (const w of this.pWalk) w.h.dispose(); this.pWalk = [];
    this.t = PRELIM.walk;
    const b = this.pBout = this.prelimBout(p);
    // smaller reactions than the main event's: a murmur at a grab, part of the stands up at a fall
    b.onMoment = (ph, info) => {
      if (b.time < this.catchUpTo - 0.5) return;
      if (ph === 'clinch') this.crowd.react('all', 'grab', { share: 0.08, seconds: 1.2 });
      if (ph === 'fall') { this.crowd.react('all', info.outcome === 'projection' ? 'fall' : 'applause', { share: 0.3, seconds: 2.5 }); crowdCheer(1.6, 0.08 * (0.7 + 0.5 * this.crowd.level())); }
    };
    this.group.add(b.group);
  }
  /**
   * The one way a preliminary's bout is made: the existing duel, AI against AI, seeded by `prelimSeed` (the same bout
   * for everyone in the stands), a 30 s round, the young wrestler's style and level. Làmb 2.0 (avec frappe, ?lamb2):
   * the pair is WatchedBout's frappe bill — each young wrestler gets a style of the six from the preliminary's seed
   * (src/lamb/opponents.ts localPair), the right one's on his card style (its colours).
   */
  private prelimBout(p: Prelim): WatchedBout {
    const frappe = lamb2On() ? localPair(p.seed, p.left, p.right, p.style, p.level) : null;
    return new WatchedBout({ x: this.cx, z: this.cz }, p.look, p.seed, { style: { ...STYLES[p.style], name: p.right.name }, level: p.level, round: PRELIM.round, frappe });
  }
  private endPrelim(p: Prelim) {
    this.pEnded = this.t;
    const r = this.pBout?.result, how = (!r || r.outcome === 'entrainement' ? 'egalite' : r.outcome) as ShowOutcome;
    const winner = !r || !r.winner ? null : r.winner === 'player' ? p.left.name : p.right.name;
    const line = ARENA.prelimResult(winner, how);
    this.pResults[this.pi] = line;
    this.mark(`prelim ${this.pi + 1} result`);
    if (this.pBout && this.pBout.time < this.catchUpTo - 0.5) return;           // passed on the way to a friend's show
    this.ctx.toast(line);
    this.crowd.react('all', 'applause', { share: 0.35, seconds: 2.5 });
  }
  private clearPrelim() {
    for (const w of this.pWalk) w.h.dispose(); this.pWalk = [];
    this.pBout?.dispose(); this.pBout = null; this.pEnded = -1;
  }
  /** Jump within the current preliminary to show time `t` (a friend further on): the seeded bout played up to it. */
  private seekPrelim(t: number) {
    const p = this.prelims[this.pi]; if (!p) return;
    if (t < PRELIM.walk) { if (!this.pBout) this.t = Math.max(this.t, t); return; }
    if (!this.pBout) this.startPrelimBout(p);
    const b = this.pBout!;
    if (this.pEnded < 0) { this.catchUpTo = t - PRELIM.walk; b.advance(Math.max(0, t - PRELIM.walk - b.time - b.pending)); }
    else this.t = Math.max(this.t, t);
  }
  private mark(phase: string) { this.marks.push({ phase, at: performance.now() }); if (this.marks.length > 40) this.marks.shift(); }
  /** The evening so far on the real clock: each phase and preliminary, when it began and how long it lasted (seconds). */
  timeline() {
    const m = this.marks, now = performance.now();
    return m.map((x, k) => ({ phase: x.phase, from: Math.round((x.at - (m[0]?.at ?? x.at)) / 100) / 10, lasted: Math.round(((m[k + 1]?.at ?? now) - x.at) / 100) / 10 }));
  }

  private resultLine(o: ShowResult) { return ARENA.result(o.winner ? billFor(this.day())[o.winner].name : null, o.outcome); }

  // ---------------------------------------------------------------- one show for friends (src/arena/together.ts)
  /** Where this evening's show is, for friends: null when none runs. `here`: the player is inside the walls or seated. */
  shared() {
    if (this.phase === 'idle' || this.phase === 'over') return null;
    const me = this.ctx.player.pos;
    return { day: this.day(), phase: this.phase, t: this.t, i: this.phase === 'prelims' ? this.pi : undefined, result: this.outcome, here: !!this.seatedHere() || this.inside(me.x, me.z) };
  }
  /**
   * Join a friend's show further on (their phase and time, and the result they saw): forward only, a running show
   * (filling … leaving). A player inside the walls during the doors whose own show has not started joins too. Each
   * phase in between is set up on the way (the entrance, the seeded bout played up to their second). True if it moved.
   */
  follow(phase: ShowPhase, t: number, res?: ShowResult | null, i?: number): boolean {
    const want = SHOW_PHASES.indexOf(phase), leaving = SHOW_PHASES.indexOf('leaving');
    if (want < 1 || want > leaving) return false;
    if (this.phase === 'idle') {
      const me = this.ctx.player.pos;
      if (this.street !== 'doors' || !(this.seatedHere() || this.inside(me.x, me.z))) return false;
      this.go('filling');
    }
    const have = SHOW_PHASES.indexOf(this.phase);
    if (have < 1 || have > leaving || want < have) return false;
    if (res) {
      const differs = !this.outcome || this.outcome.winner !== res.winner || this.outcome.outcome !== res.outcome;
      this.adopted = res;
      if (this.outcome && differs) {
        this.outcome = res; this.result = this.resultLine(res); this.ctx.toast(this.result);
        reportMainEvent(this.day(), res.winner ? billFor(this.day())[res.winner].id : null);   // the result the group saw
      }
    }
    if (phase === 'prelims') {                                                 // which preliminary, then its time
      if (!this.prelims.length) return false;
      const k = Math.max(0, Math.min(this.prelims.length - 1, i ?? 0));
      if (want === have && (k < this.pi || (k === this.pi && t - this.t < FOLLOW_SLACK))) return false;
      for (let s = have + 1; s <= want; s++) this.go(SHOW_PHASES[s]);
      if (k !== this.pi) this.startPrelim(k);
      this.seekPrelim(t);
      return true;
    }
    if (want === have && t - this.t < FOLLOW_SLACK) return false;
    for (let k = have + 1; k <= want; k++) this.go(SHOW_PHASES[k]);
    if (this.phase === 'bout' && this.bout) { this.catchUpTo = t; this.bout.advance(Math.max(0, t - this.bout.time - this.bout.pending)); }
    else this.t = Math.max(this.t, t);
    return true;
  }

  private abort() {
    this.clearPrelim(); this.clearEntrance(); this.bout?.dispose(); this.bout = null; this.drums.stop();
    this.phase = 'idle'; this.t = 0;
  }

  private startEntrance() {
    // the wrestlers come out of their tunnel opposite the public gate (src/world/geew.ts TUNNEL_*), do their bàkk on the
    // sand, get ready in their corner, then come to the ring; their entourages and griots are src/arena/people.ts; the
    // drums of the evening are the drummers' group on its deck, heard through src/arena/exteriorAudio.ts. The two
    // wrestlers wear their own colours (src/career/roster.ts rosterLook: the phone's portraits use the same).
    const bill = billFor(this.day()), L = rosterLook(bill.left.id), R = rosterLook(bill.right.id);
    this.ceremony?.dispose();
    this.ceremony = new EntranceCeremony(this.ctx, this.group, this.cx, this.cz, bill, { left: L?.look ?? LEFT_LOOK, right: R?.look ?? RIGHT_LOOK },
      who => this.react('entrance', who), { left: L?.skin, right: R?.skin });
  }
  private clearEntrance() {
    this.ceremony?.dispose(); this.ceremony = null;
    this.drums.stop();
  }

  /** What the seat's camera looks at: the walking wrestlers, the bout, or the ring. */
  focus(out: THREE.Vector3) {
    if (this.phase === 'bout' && this.bout) return out.copy(this.bout.focus());
    if (this.phase === 'prelims' && this.pBout) return out.copy(this.pBout.focus());
    if (this.phase === 'prelims' && this.pWalk.length) {
      out.set(0, 0, 0); for (const w of this.pWalk) out.add(w.h.group.position); return out.multiplyScalar(1 / this.pWalk.length).setY(1.2);
    }
    if (this.phase === 'entrance' && this.ceremony?.focus(out, this.t)) return out;
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
      ticket: hasTicket(counters, day), tribune: ticketTier(counters, day), galaDone: counters[GALA_DONE_COUNTER] === day,
      seat: seat?.id ?? null, seatsTotal: this.seats.length, seatsFree: this.seats.filter(s => !s.occupant).length,
      crowd: { cap: this.cap, present: this.crowd.present, cheering: this.crowd.cheering, level: Math.round(this.crowd.level() * 100) / 100, lod: this.crowd.stats() },
      prelims: { n: this.prelims.length, i: this.pi, list: this.prelims.map(p => `${prelimName(p.left)} – ${prelimName(p.right)}`), seeds: this.prelims.map(p => p.seed),
        stage: this.phase !== 'prelims' ? null : !this.pBout ? 'walk' : this.pEnded < 0 ? 'bout' : 'result', bout: this.pBout?.info() ?? null, walking: this.pWalk.length, results: [...this.pResults],
        frappe: this.pBout ? this.pBout.frappe : null },
      entrance: this.ceremony?.wrestlers.length ?? 0, ceremony: this.phase === 'entrance' ? this.ceremony?.info(this.t) ?? null : null, bout: this.bout?.info() ?? null, lastBout: this.lastBout, result: this.result, card: this.card.text, people: this.people.debug(),
      gate: { x: this.cx, z: this.gz }, centre: { x: this.cx, z: this.cz },
    };
  }

  dispose() {
    if (this.fovSet) { this.ctx.camera.fov = this.baseFov; this.ctx.camera.updateProjectionMatrix(); this.fovSet = 0; }
    this.clearPrelim(); this.clearEntrance(); this.bout?.dispose(); this.bout = null; this.drums.stop();
    this.crowd.dispose(); this.card.dispose(); this.people.dispose();
    for (const s of this.seats) this.ctx.seats.release(s.id, CROWD);
    for (const o of this.own) o.dispose(); this.own = [];
    this.group.removeFromParent();
  }
}

/** The evening's wrestlers (the game's own cast): Babacar of Baobab in green, Lamine of Teranga in the duel's colours. */
const LEFT_LOOK: WrestlerLook = { ngembColor: 'vert', ngembPattern: 'bordure', accessories: [] };
const RIGHT_LOOK: WrestlerLook = { ngembColor: STYLES.rapide.ngemb, ngembPattern: 'uni', accessories: [] };

let evening: ArenaEvening | null = null;

/** The player's evening in the stands: for the HUD (main.ts hides the goal line while the show holds the eye) and as
 * friends share it (src/arena/together.ts): where it is, joining a friend further on, the tiers. */
export const arenaShow = {
  /** Seated on the tiers during the wrestlers' entrance, the bout or its result. */
  watching: () => !!evening?.seatedHere() && (evening.phase === 'prelims' || evening.phase === 'entrance' || evening.phase === 'bout' || evening.phase === 'result'),
  /** This evening's show when one runs (filling … leaving): day, phase, time, result once known, player inside. */
  state: () => evening?.shared() ?? null,
  follow: (phase: ShowPhase, t: number, res?: ShowResult | null, i?: number) => evening?.follow(phase, t, res, i) ?? false,
  /** The places on the tiers (shared registry seats), and whether a point is inside the walls. */
  seats: (): readonly Seat[] => evening?.seats ?? [],
  inside: (x: number, z: number) => evening?.inside(x, z) ?? false,
  /** The city day of the evening (tickets and the gala are per day). */
  day: () => evening?.day() ?? null,
};

export const arenaModule: GameModule = {
  name: 'arena',
  hubLoaded(ctx, hub) {
    evening?.dispose(); evening = null;
    if (hub.arena && hub.id === 'pikine') evening = new ArenaEvening(ctx, hub);
    arenaExterior.schedule(evening ? (d, h) => !!evening?.boutOn(d, h) : null);       // the street lives whenever a bout is on
  },
  update(_ctx, dt) { evening?.update(dt); },
  camera(ctx, dt, drag) { return evening ? evening.camera(ctx.camera, dt, drag) : false; },
  // the player's own bout (Làmb 2.0): the stands react to its fall and its result
  lamb(_ctx, e) { if (e.kind === 'moment') evening?.boutMoment(e.moment, e.winner, e.outcome); },
  safePlace() { return evening?.seatedHere() ? { x: evening.cx, z: evening.gz - 2.5, yaw: Math.PI } : null; },
  debug: ctx => ({
    arena: {
      info: () => evening?.debug() ?? null,
      /** Where the camera is and where it looks on the ground (the seat's view must face the ring). */
      cam: () => { const c = ctx.camera, d = new THREE.Vector3(); c.getWorldDirection(d); return { x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: d.y, dz: d.z }; },
      /** Faster show for the checks (the bout runs `n` duel steps per frame). */
      speed: (n = 1) => { if (evening) evening.speed = Math.max(1, Math.round(n)); },
      go: (phase: ShowPhase) => evening?.go(phase),
      /** The evening so far on the real clock: each phase and preliminary, when it began, how long it lasted (s). */
      timeline: () => evening?.timeline() ?? [],
      /** Shows or hides everything this module draws (the checks measure its own draw calls). */
      visible: (on = true) => { if (evening) { evening.group.visible = on; evening.peopleGroup.visible = on; } },
      /** Pretend the city day is `d` (null: the clock's), e.g. a fight evening. */
      day: (d: number | null) => { dayOverride = d; },
      /** A free place on the tiers near (x, z) (for the checks). */
      /** A free place on the tiers near (x, z), of a ticket tier if given (for the checks). */
      freeSeat: (x: number, z: number, tribune?: Tribune) => {
        if (!evening) return null;
        const ev = evening;
        const free = ev.seats.filter(s => !s.occupant && (!tribune || ev.tribuneOf(s.id) === tribune)).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
        return free ? { id: free.id, x: free.x, z: free.z, top: free.top, yaw: free.yaw, section: free.section ?? null, tribune: ev.tribuneOf(free.id) } : null;
      },
      /** The places of each ticket tier: how many, how many free, how many the crowd holds. */
      tribunes: () => evening?.tribunes() ?? null,
    },
  }),
};
