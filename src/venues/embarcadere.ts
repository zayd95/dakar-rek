import * as THREE from 'three';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { SIT_HIPS, type Seat } from '../interact/seats';
import { fcfa, type MenuItem } from '../ui/hud';
import { say } from '../i18n/wolof';
import { CROSSING_STEPS, crossingStage, embarcadere, type CrossingStage } from '../activity/templates';
import type { Effects } from '../activity/types';
import { buildBoat } from '../world/boats';
import { BOAT_KINDS, TRAVERSEE_SITE as S, deckY, type BoatKind, type BoatModel, type LocalSeat, type P2, type Pose } from '../sea/traverseeSite';
import { ngorGroundY } from '../world/ngor';
import * as R from '../sea/traverseeRules';
import { VTC_LOOKS } from '../transport/vtcRules';
import { ECONOMY } from '../economy/config';
import { counter, type Venue, type VenueEnv } from './venue';

/**
 * Embarcadère de Ngor (« la traversée », docs/TRAVERSEE.md; the place in the contract src/sea/traverseeSite.ts, the rules in
 * src/sea/traverseeRules.ts): the Almadies' old fishing quay, where the player takes Ousmane's pirogue or chaloupe across to the island of Ngor
 * with paying customers. Built like Soumbédioune's pirogue (src/venues/beach.ts): a place at the pier's end whose crossing is a run of `ride`
 * steps (src/activity/templates.ts `embarcadere`); this venue moves the boat and the people along them and tells the runner when each step is over.
 *
 * - The boats (src/world/boats.ts): the one in use moors at the contract's quay mooring (east side of the pontoon), the other waits on the
 *   pontoon's west side; they swap during the cut to black that seats the player at the helm.
 * - The helm: a 'vehicle' seat in the street space, carried by the boat, locked while crossing (no « Se lever » at sea).
 * - The way: a smooth curve through the contract's route, out bow first; back, a tight turn off the island's jetty, the route the other way, and a
 *   turn in off the pontoon so the boat lies at the same pose, west gunwale to the pontoon. Speed eases in and out and drops in the turns.
 * - The customers: VTC passengers' bodies and gait (src/transport/vtc.ts): records that walk, board, sit, step off and walk away whether or not a
 *   body is drawn; a body exists only within DRAW_NEAR of the camera, a few at a time, faded in and out (never a pop in view).
 * - Each leg is paid by its landing step's effects (fares − Ousmane's share): a reload or a stop never pays an unfinished leg, nothing twice.
 * - Stopped (« Arrêter ») or reloaded mid-crossing: back on the pier at the anchor, the boats at their moorings (safePlace: the save never
 *   holds a player at sea, beyond the hub's bounds).
 */
const T = ECONOMY.traversee;
/** On foot (m/s): to the boat (briskly: the boat waits), walking off. Boarding and stepping off (s); a step over the gunwale at most every STEP_GAP s. */
const WALK = 1.6, AWAY = 1.25, BOARD_S = 1.3, ALIGHT_S = 1.3, STEP_GAP = 0.75;
/** A customer's body is made within DRAW_NEAR of the camera (one a frame) and dropped beyond DROP_FAR. */
const DRAW_NEAR = 110, DROP_FAR = 150;
/** On the water: speeding up, braking (m/s²), the last metres' crawl (m/s), the turns' radius (m) and their share of the cruising speed. */
const ACC = 1.8, DEC = 1.3, CREEP = 0.45, TURN_R = 3.5, TURN_SLOW = 0.5;
/** Rocking (rad, m) under way; moored a third of it. The pirogue rolls, the chaloupe barely; both bank a little into the turns. */
const ROCK: Record<BoatKind, { roll: number; pitch: number; heave: number; bank: number }> = {
  pirogue: { roll: 0.075, pitch: 0.032, heave: 0.07, bank: 0.06 },
  chaloupe: { roll: 0.022, pitch: 0.011, heave: 0.03, bank: 0.025 },
};
/** Where the player is set down after a crossing (or a stop): the pier's end, beside the customers' way, facing the sea. */
const LANDING: Pose = { x: S.anchor.x + 1.1, z: S.anchor.z - 1, yaw: Math.PI };
/** The new customers come down the pier from here; those who landed at the quay walk off up to here. */
const PIER_IN: P2 = { x: 30.3, z: -132 };
/** Where the island's return customers wait on the jetty (its west side, clear of those landing), first to board first. */
const jettyQueue = (k: number): P2 => ({ x: S.v1.jetty.x0 + 0.8, z: S.v1.mooring.z - 1.6 - k * 1.1 });
/** The pontoon's west side, where the boat not in use waits (east gunwale to the pontoon, bow to the sea). */
const spareMooring = (beam: number): Pose => ({ x: S.pontoon.x0 - 0.35 - beam / 2, z: S.v1.quayMooring.z, yaw: 0 });

const LOOKS: PersonLook[] = [
  ...VTC_LOOKS,
  { skin: 0x6b3f25, style: 'boubou', top: 0x2b6cb0, bottom: 0x2b6cb0, hat: 'kufi', hatColor: 0xf2f2ec },
  { skin: 0x5b3420, style: 'dress', top: 0xe8b734, bottom: 0xe8b734, female: true, pattern: 'wax', accent: 0x1e6fd9, hat: 'headwrap', hatColor: 0x1e6fd9 },
];

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.z - b.z);
/** The game's yaw of a boat whose bow heads along (hx, hz): its bow is at −z of its frame (src/sea/traverseeSite.ts). */
const boatYaw = (hx: number, hz: number) => Math.atan2(-hx, -hz);

// ------------------------------------------------------------------------------------------------ the way across
/** Centripetal Catmull-Rom through `c` (the first and last points only steer the ends), a point every ~`step` m. */
export function spline(c: P2[], step = 0.5): P2[] {
  const out: P2[] = [];
  for (let i = 1; i < c.length - 2; i++) {
    const [p0, p1, p2, p3] = [c[i - 1], c[i], c[i + 1], c[i + 2]];
    const t1 = Math.sqrt(dist(p0, p1)), t2 = t1 + Math.sqrt(dist(p1, p2)), t3 = t2 + Math.sqrt(dist(p2, p3));
    const n = Math.max(2, Math.ceil(dist(p1, p2) / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = t1 + (t2 - t1) * (k / n), f = (a: P2, b: P2, ta: number, tb: number) => ({ x: ((tb - t) * a.x + (t - ta) * b.x) / (tb - ta), z: ((tb - t) * a.z + (t - ta) * b.z) / (tb - ta) });
      const a1 = f(p0, p1, 0, t1), a2 = f(p1, p2, t1, t2), a3 = f(p2, p3, t2, t3), b1 = f(a1, a2, 0, t2), b2 = f(a2, a3, t1, t3);
      out.push(f(b1, b2, t1, t2));
    }
  }
  return out;
}

/** A leg on the water: points (with their share of the cruising speed), the length, the fastest the boat may go at each point to brake in time. */
export class Way {
  readonly cum: number[] = [];
  readonly vmax: number[] = [];
  readonly len: number;
  constructor(readonly pts: (P2 & { slow: number })[], cruise: number, readonly end: Pose) {
    let L = 0; this.cum.push(0);
    for (let i = 1; i < pts.length; i++) { L += dist(pts[i], pts[i - 1]); this.cum.push(L); }
    this.len = L;
    const n = pts.length; this.vmax = new Array(n).fill(0);
    for (let i = n - 2; i >= 0; i--) this.vmax[i] = Math.min(cruise * pts[i].slow, Math.sqrt(this.vmax[i + 1] ** 2 + 2 * DEC * (this.cum[i + 1] - this.cum[i])));
  }
  /** Where the way is `s` metres along: the point, the heading, the speed allowed. */
  at(s: number) {
    const c = this.cum; let lo = 0, hi = c.length - 1;
    s = clamp(s, 0, this.len);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[hi], seg = c[hi] - c[lo] || 1, k = (s - c[lo]) / seg, d = dist(a, b) || 1;
    return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), hx: (b.x - a.x) / d, hz: (b.z - a.z) / d, vmax: lerp(this.vmax[lo], this.vmax[hi], k) };
  }
}

const MQ = S.v1.quayMooring, MI = S.v1.mooring;
const arc = (n: number, f: (a: number) => P2) => Array.from({ length: n + 1 }, (_, k) => ({ ...f((Math.PI * k) / n), slow: TURN_SLOW }));
/** Out: bow first off the pontoon, along the route, in to the island's jetty heading for the island (the mooring's pose). */
export function wayOut(cruise: number): Way {
  const mid = S.route.slice(1, -1);
  const pts = spline([{ x: MQ.x, z: MQ.z + 6 }, MQ, { x: MQ.x + 0.3, z: MQ.z - 9.5 }, ...mid, { x: MI.x + 0.4, z: MI.z + 7 }, MI, { x: MI.x, z: MI.z - 6 }]);
  return new Way(pts.map(p => ({ ...p, slow: 1 })), cruise, MI);
}
/** Back: a tight turn to the east off the jetty, the route the other way (east of it), a turn in to the west off the pontoon: the same pose as before. */
export function wayBack(cruise: number): Way {
  const r = TURN_R, ci = { x: MI.x + r, z: MI.z }, cq = { x: MQ.x + r, z: MQ.z };
  const turnOut = arc(14, a => ({ x: ci.x - r * Math.cos(a), z: ci.z - r * Math.sin(a) }));       // heading −z → +x → +z
  const across = spline([{ x: ci.x + r, z: MI.z - 6 }, { x: ci.x + r, z: MI.z }, { x: ci.x + r - 0.6, z: MI.z + 11 }, { x: 43.5, z: -262 }, { x: 41, z: -240 },
    { x: 38.8, z: -205 }, { x: 40.4, z: -186 }, { x: cq.x + r, z: MQ.z - 8 }, { x: cq.x + r, z: MQ.z }, { x: cq.x + r, z: MQ.z + 6 }]).map(p => ({ ...p, slow: 1 }));
  const turnIn = arc(14, a => ({ x: cq.x + r * Math.cos(a), z: cq.z + r * Math.sin(a) }));          // heading +z → −x → −z
  return new Way([...turnOut, ...across.slice(1), ...turnIn.slice(1)], cruise, MQ);
}

// ------------------------------------------------------------------------------------------------ a boat
const V = new THREE.Vector3();
/** One of Ousmane's boats: its model, where it lies or goes, its rocking and wake, the helm seat it carries. */
class Craft {
  x = 0; z = 0; yaw = 0; v = 0; s = 0; heave = 0; roll = 0; pitch = 0;
  way: Way | null = null; arrived = true;
  private t = Math.random() * 10; private bank = 0;
  readonly cruise: number;
  constructor(readonly kind: BoatKind, readonly m: BoatModel, readonly seat: Seat) {
    this.cruise = R.boatSpeed(kind);
    this.m.group.rotation.order = 'YXZ';                       // yaw first, then pitch and roll in the boat's own frame
  }
  moor(p: Pose) { this.x = p.x; this.z = p.z; this.yaw = p.yaw; this.v = 0; this.s = 0; this.way = null; this.arrived = true; }
  sail(w: Way) { this.way = w; this.s = 0; this.v = 0; this.arrived = false; }
  update(dt: number) {
    this.t += dt;
    const w = this.way;
    let yawRate = 0;
    if (w && !this.arrived) {
      const here = w.at(this.s);
      this.v = Math.min(this.v + ACC * dt, Math.max(CREEP, here.vmax));
      this.s += this.v * dt;
      if (this.s >= w.len - 0.02) { this.moor(w.end); }
      else {
        const p = w.at(this.s), want = boatYaw(p.hx, p.hz), d = wrap(want - this.yaw), turn = d * Math.min(1, dt * 6);
        this.x = p.x; this.z = p.z; this.yaw += turn; yawRate = dt > 0 ? turn / dt : 0;
      }
    }
    const k = ROCK[this.kind], amp = 0.33 + 0.67 * Math.min(1, this.v / this.cruise), t = this.t;
    this.bank += (clamp(-yawRate * this.v * k.bank * 0.25, -0.12, 0.12) - this.bank) * Math.min(1, dt * 3);
    this.heave = Math.sin(t * 1.9) * k.heave * amp;
    this.roll = (Math.sin(t * 1.25) * 0.8 + Math.sin(t * 2.3 + 1) * 0.2) * k.roll * amp + this.bank;
    this.pitch = Math.sin(t * 1.6 + 0.7) * k.pitch * amp;
    const g = this.m.group;
    g.position.set(this.x, S.seaY + this.heave, this.z); g.rotation.set(this.pitch, this.yaw, this.roll);
    const wake = this.m.wake.material as THREE.MeshBasicMaterial, want = this.v > 0.6 && !this.arrived ? clamp(0.1 + 0.32 * (this.v / this.cruise), 0, 0.42) : 0;   // soft: on a phone, close behind the stern, more read as white planks
    wake.opacity += (want - wake.opacity) * Math.min(1, dt * 2.5); wake.visible = wake.opacity > 0.01;
    g.updateMatrixWorld();
    // the helm rides with the boat: the player's body is set on it every frame (src/main.ts)
    const h = this.m.helm; V.set(h.x, h.y, h.z).applyMatrix4(g.matrixWorld);
    this.seat.x = V.x; this.seat.z = V.z; this.seat.top = V.y; this.seat.yaw = this.yaw + h.yaw;
  }
  /** A point of the boat's frame in the world (the hull's rocking included). */
  world(l: { x: number; y: number; z: number }) { return V.set(l.x, l.y, l.z).applyMatrix4(this.m.group.matrixWorld).clone(); }
  /** A world point on the boat's deck plane (yaw and position only): its local x, z. */
  local(p: P2) { const dx = p.x - this.x, dz = p.z - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw); return { x: dx * c - dz * s, z: dx * s + dz * c }; }
  pose() { return { x: +this.x.toFixed(2), z: +this.z.toFixed(2), yaw: +this.yaw.toFixed(3), y: +(S.seaY + this.heave).toFixed(3), roll: +this.roll.toFixed(4), pitch: +this.pitch.toFixed(4), v: +this.v.toFixed(2), s: +this.s.toFixed(1), len: this.way ? +this.way.len.toFixed(1) : 0, wake: +(this.m.wake.material as THREE.MeshBasicMaterial).opacity.toFixed(2) }; }
}

// ------------------------------------------------------------------------------------------------ the customers
type RState = 'come' | 'wait' | 'walk' | 'queue' | 'board' | 'seated' | 'alight' | 'leave' | 'gone';
/** A customer: logic first (where, doing what), a body only when near the camera. */
interface Rider {
  id: number; look: PersonLook; state: RState; t: number;
  /** On foot at the quay, on foot on the island's side, or aboard (then `local` is in the boat's frame). */
  side: 'quai' | 'ile' | 'bord';
  x: number; z: number; yaw: number;
  /** Walking: the points left, the state and facing at the end, the pace. */
  path: P2[]; then: RState; endYaw: number; pace: number;
  /** Waiting spot on the pier (0–3) or place in the jetty's queue. */
  spot: number;
  craft: Craft | null; seat: LocalSeat | null;
  local: { x: number; y: number; z: number; yaw: number };
  from: { x: number; y: number; z: number; yaw: number };
  /** Stepping off: the world point on the quay or the jetty beside the boat, and the way on from there. */
  ashore: P2 | null; onward: P2[];
  walked: number; unseen: number; delay: number;
  /** 1 seen, 0 gone: what the body fades toward. */
  alpha: number;
  h: Humanoid | null; shown: number; mats: THREE.Material[] | null;
}

interface Trip {
  kind: BoatKind; craft: Craft; plan: R.CrossingPlan; stage: CrossingStage | null;
  outR: Rider[]; backR: Rider[];
  lastStep: number;
}
interface Paid { leg: R.Leg; kind: BoatKind; passengers: number; fares: number; share: number; amount: number; label: string; ledger: number | null }
/** The stages in their order (a stage the venue did not see begin, in a slow frame, is still entered). */
const STAGES = Object.keys(CROSSING_STEPS) as CrossingStage[];

/** The venue, with the checks' hooks (src/venues/index.ts `__dakar.traversee()`). */
export interface EmbarcadereVenue extends Venue {
  traversee(): Record<string, unknown>;
  setPirogueTrips(n: number): number;
}

export function buildEmbarcadere(env: VenueEnv): EmbarcadereVenue {
  const { ctx, mats, lite } = env;
  const world = ctx.world()!;
  const id = `${world.id}:venue:embarcadere`;

  // ---------------------------------------------------------------- the boats and their helms
  const crafts = {} as Record<BoatKind, Craft>;
  for (const kind of BOAT_KINDS) {
    const m = buildBoat(kind, mats.m.plain, lite);
    ctx.extra.add(m.group);
    const seat: Seat = { id: `${id}:barre:${kind}`, x: 0, z: 0, top: 0, yaw: 0, kind: 'vehicle', space: 'street', occupant: null, label: 'Barre' };
    ctx.seats.add(seat);
    crafts[kind] = new Craft(kind, m, seat);
  }
  /** The boat in use moors at the contract's mooring; the other on the pontoon's west side. */
  const moorAll = (inUse: BoatKind) => { for (const k of BOAT_KINDS) crafts[k].moor(k === inUse ? MQ : spareMooring(crafts[k].m.beam)); };
  let inUse: BoatKind = 'pirogue';
  moorAll(inUse);
  const ways = Object.fromEntries(BOAT_KINDS.map(k => [k, { out: wayOut(crafts[k].cruise), back: wayBack(crafts[k].cruise) }])) as Record<BoatKind, { out: Way; back: Way }>;

  // ---------------------------------------------------------------- the rules, read from the save
  const trusted = () => ctx.state.data.flags.includes('ousmane_trust');
  const pirogueTrips = () => counter(ctx, R.TRAV_COUNTERS.of('pirogue'));
  const seed = () => R.crossingSeed(ctx.day(), ctx.hour(), counter(ctx, R.TRAV_COUNTERS.trips));
  const planNow = (kind: BoatKind) => R.crossingPlan(kind, ctx.hour(), seed(), trusted());
  const why = (kind: BoatKind) => R.closedReason(kind, { hour: ctx.hour(), pirogueTrips: pirogueTrips(), energie: ctx.state.data.needs.energie });

  // ---------------------------------------------------------------- the customers
  let riders: Rider[] = [], seq = 0, made = 0;
  const groundY = (x: number, z: number) => deckY(x, z) ?? (z < S.v1.jetty.z0 ? ngorGroundY(x, z) : 0.12 + (ctx.world()?.heightAt(x, z) ?? 0));   // the island's sand rises from the landing
  const rider = (side: 'quai' | 'ile', at: P2, state: RState, alpha = 1): Rider => {
    const r: Rider = {
      id: seq, look: LOOKS[(seq * 5 + 3) % LOOKS.length], state, t: 0, side, x: at.x, z: at.z, yaw: Math.PI, path: [], then: 'wait', endYaw: Math.PI, pace: WALK,
      spot: -1, craft: null, seat: null, local: { x: 0, y: 0, z: 0, yaw: 0 }, from: { x: 0, y: 0, z: 0, yaw: 0 }, ashore: null, onward: [],
      walked: 0, unseen: 0, delay: 0, alpha, h: null, shown: 0, mats: null,
    };
    seq++; riders.push(r); return r;
  };
  const walkTo = (r: Rider, path: P2[], then: RState, endYaw: number, pace = WALK) => { r.path = path.map(p => ({ ...p })); r.then = then; r.endYaw = endYaw; r.pace = pace; };
  /** Customers waiting on the pier for the next crossing (not taken by the crossing in hand). */
  const waitingAtQuay = () => riders.filter(r => r.side === 'quai' && (r.state === 'wait' || r.state === 'come') && !inTrip(r));
  const inTrip = (r: Rider) => !!trip && (trip.outR.includes(r) || trip.backR.includes(r));
  const freeSpot = () => { for (let k = 0; k < S.v1.waiting.length; k++) if (!riders.some(r => r.spot === k && r.side === 'quai' && (r.state === 'wait' || r.state === 'come') && !inTrip(r))) return k; return -1; };
  /** As many as the next pirogue would take, during the hours: placed (a fresh hub) or walking down the pier. */
  let comeT = 0;
  const refill = (now: boolean, dt = 0) => {
    const want = R.crossingOpen(ctx.hour()) ? planNow('pirogue').out.passengers : 0, here = waitingAtQuay();
    if (here.length > want) {                                                  // the evening, or the end of the busy hours: some go home
      const r = here.sort((a, b) => b.spot - a.spot)[0];
      r.spot = -1; r.state = 'leave'; r.walked = 0; walkTo(r, [{ x: 30, z: -140 }, PIER_IN], 'gone', 0, AWAY);
      return;
    }
    comeT -= dt;
    while (here.length < want && (now || comeT <= 0)) {
      const k = freeSpot(); if (k < 0) break;
      const spot = S.v1.waiting[k];
      if (now) { const r = rider('quai', spot, 'wait'); r.spot = k; r.yaw = Math.PI; }
      else {
        const r = rider('quai', { x: PIER_IN.x + (seq % 2 ? 0.5 : -0.5), z: PIER_IN.z }, 'come', 0);
        r.spot = k; r.walked = 0; walkTo(r, [{ x: 30 + (spot.x - 30) * 0.4, z: -140 }, spot], 'wait', Math.PI);
        comeT = 2.2;
      }
      here.push(riders[riders.length - 1]);
      if (!now) break;
    }
  };

  // ---------------------------------------------------------------- the crossing in hand
  let trip: Trip | null = null;
  let ending: { t: number; abort: boolean } | null = null;
  const paidLog: Paid[] = [];
  const stageOver = { board: false, out: false, land: false, boardBack: false, back: false, landBack: false } as Record<CrossingStage, boolean>;
  const call = (kind: BoatKind) => { const n = (trip?.plan ?? planNow(kind)).out.passengers; return `Ousmane : « ${say('Nanu dem')} ! ${n} client${n > 1 ? 's' : ''} pour l’île. »`; };
  const legFx = (kind: BoatKind, leg: R.Leg): Effects => {
    const plan = trip?.kind === kind ? trip.plan : planNow(kind), p = leg === 'aller' ? plan.out : plan.back, C = R.TRAV_COUNTERS;
    const fx: Effects = { money: p.net, label: R.legLabel(leg, p), counters: { [C.passengers]: p.passengers }, category: 'transport' };
    if (leg === 'retour') { fx.counters = { ...fx.counters, [C.trips]: 1, [C.of(kind)]: 1 }; fx.needs = { energie: T.needs.energie, moral: T.needs.moral }; }
    return fx;
  };
  const onPaid = (kind: BoatKind, leg: R.Leg) => {
    const plan = trip?.plan ?? planNow(kind), p = leg === 'aller' ? plan.out : plan.back, last = ctx.state.data.ledger.at(-1);
    paidLog.push({ leg, kind, passengers: p.passengers, fares: p.fares, share: p.share, amount: p.net, label: R.legLabel(leg, p), ledger: last && last.label === R.legLabel(leg, p) ? last.amount : null });
    if (paidLog.length > 20) paidLog.shift();
    ctx.toast(`Les passagers : « ${say('Jërëjëf')} ! » · +${fcfa(p.net)} (${fcfa(p.fares)} − part d’Ousmane ${fcfa(p.share)})`);
  };
  const stageSeconds = (kind: BoatKind, stage: CrossingStage) => {
    const c = crafts[kind].cruise;
    return { start: 0.5, helm: 0.7, board: 16, out: ways[kind].out.len / c + 5, land: 6, boardBack: 7, back: ways[kind].back.len / c + 9, landBack: 6 }[stage];
  };

  const choose = () => {
    const close = () => { ctx.hud.closeModal(); ctx.setMode('play'); };
    const items: MenuItem[] = BOAT_KINDS.map(kind => {
      const no = why(kind), plan = planNow(kind);
      return {
        icon: kind === 'pirogue' ? '🛶' : '🚤', label: kind === 'pirogue' ? 'Traversée en pirogue' : 'Traversée en chaloupe',
        detail: no ?? `${R.choiceDetail(plan)}${kind === 'chaloupe' ? ' · plus rapide, plus douce' : ''}`, right: no ? undefined : `+${fcfa(R.roundTripNet(plan))}`,
        disabled: !!no, reason: no ?? undefined, onPick: () => { close(); start(kind); },
      };
    });
    items.push({ icon: '↩️', label: 'Plus tard', onPick: close });
    ctx.menu('Embarcadère de Ngor', `${say('Dalal ak jàmm')} ! Ousmane loue sa pirogue et sa chaloupe, et garde sa part de chaque traversée. Aller-retour vers l’île, payé à chaque arrivée.`, items);
  };
  const start = (kind: BoatKind) => {
    const spec = place.offers.barre.find(s => s.id === `traversee_${kind}`)!;
    ctx.activities.start(spec, { place: place.name, at: { x: S.anchor.x, z: S.anchor.z } });
  };

  const place = embarcadere({
    id, name: 'Embarcadère de Ngor', space: 'street',
    anchors: [{ id: 'quai', name: 'Embarcadère de Ngor', kind: 'vehicle', x: S.anchor.x, z: S.anchor.z, y: 1.9, radius: 2.6 }],
  }, {
    hour: () => ctx.hour(), count: k => counter(ctx, k),
    crossing: {
      helm: kind => crafts[kind].seat.id,
      over: (kind, stage) => !!trip && trip.kind === kind && trip.stage === stage && stageOver[stage],
      seconds: stageSeconds, pay: legFx, paid: onPaid, why, detail: kind => why(kind) ?? R.choiceDetail(planNow(kind)), call, choose,
      summary: () => { const n = waitingAtQuay().length; return R.crossingOpen(ctx.hour()) ? `${n} client${n > 1 ? 's' : ''} au bout de la jetée · pirogue ou chaloupe` : R.nightReason(ctx.hour()); },
    },
  });
  ctx.places.add(place);
  refill(true);

  /** The crossing the runner is playing now (its boat and step), or null. */
  const running = (): { kind: BoatKind; stage: CrossingStage } | null => {
    const cur = ctx.activities.current;
    if (!cur || !cur.spec.id.startsWith('traversee_')) return null;
    const kind = cur.spec.id.slice('traversee_'.length) as BoatKind, stage = crossingStage(cur.step.label);
    return crafts[kind] && stage ? { kind, stage } : null;
  };
  const onHelm = () => { const s = ctx.player.seated(); return !!s && BOAT_KINDS.some(k => crafts[k].seat.id === s.id); };

  /** The crossing starts: its plan fixed (what the choice showed), its customers taken from the pier. */
  const begin = (kind: BoatKind) => {
    const plan = R.crossingPlan(kind, ctx.hour(), seed(), trusted());
    const waiting = waitingAtQuay().sort((a, b) => a.z - b.z || a.spot - b.spot);
    while (waiting.length < plan.out.passengers) { const k = freeSpot(); const r = rider('quai', S.v1.waiting[Math.max(0, k)], 'wait'); r.spot = k; waiting.push(r); }
    trip = { kind, craft: crafts[kind], plan, stage: null, outR: waiting.slice(0, plan.out.passengers), backR: [], lastStep: -9 };
    for (const r of trip.outR) r.spot = -1;
    for (const k of Object.keys(stageOver) as CrossingStage[]) stageOver[k] = false;
  };
  const enter = (to: CrossingStage) => {
    const tr = trip!, from = tr.stage ? STAGES.indexOf(tr.stage) : -1;
    for (const st of STAGES.slice(from + 1, STAGES.indexOf(to) + 1)) enterOne(tr, st);
  };
  const enterOne = (tr: Trip, stage: CrossingStage) => {
    tr.stage = stage;
    const c = tr.craft, seats = c.m.seats;
    switch (stage) {
      case 'start': ctx.hud.fade(true); break;
      case 'helm':
        // in the black: the chosen boat alongside the pontoon, the other on the west side; the helm locked; the view on the boarding
        if (inUse !== tr.kind) { inUse = tr.kind; moorAll(inUse); }
        c.seat.locked = true; snap = true;
        setTimeout(() => ctx.hud.fade(false), 120);
        // the customers set off down the pier as the player takes the helm, nearest first
        tr.outR.forEach((r, k) => {
          const after = S.v1.quayPath.filter(p => p.z < r.z - 0.4);
          r.delay = k * 0.6; r.state = 'walk'; r.walked = 0; r.seat = seats[k % seats.length]; r.craft = c;
          walkTo(r, after.length ? after : [S.v1.quayPath[S.v1.quayPath.length - 1]], 'queue', Math.PI / 2);
        });
        break;
      case 'board': break;
      case 'out':
        c.sail(ways[tr.kind].out);
        // those coming back walk down from the island's houses to the jetty, the next crossing's customers down the pier
        tr.backR = Array.from({ length: tr.plan.back.passengers }, (_, k) => {
          const r = rider('ile', S.v1.path[S.v1.path.length - 1], 'come', 0);
          r.spot = k; r.delay = k * 1.6; r.craft = c; r.seat = seats[k % seats.length];
          walkTo(r, [S.v1.path[2], { x: 35.6, z: jettyQueue(k).z - 1.5 }, jettyQueue(k)], 'wait', Math.PI / 2);
          return r;
        });
        break;
      case 'land':
        for (const r of tr.outR) { r.ashore = S.v1.path[0]; r.onward = S.v1.path.slice(1); }
        break;
      case 'boardBack':
        tr.backR.forEach((r, k) => { r.delay = k * 0.8; r.state = 'walk'; r.walked = 0; walkTo(r, [{ x: 36.4, z: S.v1.mooring.z - 0.8 }, S.v1.path[0]], 'queue', Math.PI / 2); });
        break;
      case 'back': c.sail(ways[tr.kind].back); break;
      case 'landBack':
        for (const r of tr.backR) { r.ashore = S.v1.quayPath[S.v1.quayPath.length - 1]; r.onward = [...S.v1.quayPath.slice(0, -1)].reverse().concat([{ x: 30.2, z: -140 }, PIER_IN]); }
        break;
    }
  };

  /** The end of a crossing (done, or stopped): a cut to black, the player set down on the pier; stopped, everything back as on a fresh hub. */
  const finish = (abort: boolean) => {
    ending = { t: 0, abort };
    ctx.hud.fade(true);
    if (abort) ctx.toast('Traversée interrompue : le trajet en cours n’est pas payé.');
  };
  const setDown = (abort: boolean) => {
    for (const k of BOAT_KINDS) crafts[k].seat.locked = false;
    if (onHelm()) { ctx.player.standUp(true); ctx.player.place(LANDING.x, LANDING.z, LANDING.yaw); }
    if (abort) {
      for (const r of riders) dropBody(r);
      riders = [];
      moorAll(inUse);
      refill(true);
    }
    trip = null; ending = null; cam.on = false;
    ctx.hud.fade(false);
  };

  // ---------------------------------------------------------------- bodies: drawn near the camera only, faded in and out
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const dropBody = (r: Rider) => { if (!r.h) return; r.h.group.removeFromParent(); r.h.dispose(); r.h = null; r.mats = null; r.shown = 0; };
  const fadeTo = (r: Rider, a: number) => {
    const h = r.h; if (!h) return;
    if (!r.mats) { r.mats = []; h.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) for (const x of Array.isArray(m.material) ? m.material : [m.material]) r.mats!.push(x); }); }
    for (const m of r.mats) { m.transparent = a < 0.999; m.opacity = a; }
  };
  /** World position of a rider (aboard: through the boat). */
  const wpos = (r: Rider): P2 => (r.side === 'bord' && r.craft ? r.craft.world(r.local) : { x: r.x, z: r.z });

  const syncBody = (r: Rider, dt: number, cam: THREE.Vector3) => {
    const p = wpos(r), d = Math.hypot(p.x - cam.x, p.z - cam.z);
    if (!r.h && d < DRAW_NEAR && made < 1 && humanoidReady() && r.state !== 'gone') {
      made++;
      const h = new Humanoid(r.look); h.hold = r.state === 'seated' ? 'Sit' : 'Idle'; h.group.userData.lodPrio = 1.4;
      r.h = h; r.shown = 0; r.mats = null; fadeTo(r, 0);
      (r.side === 'bord' && r.craft ? r.craft.m.group : ctx.extra).add(h.group);
    } else if (r.h && d > DROP_FAR) dropBody(r);
    const h = r.h; if (!h) return;
    const want = r.alpha;
    if (r.shown !== want) { r.shown = want > r.shown ? Math.min(want, r.shown + dt / 0.8) : Math.max(want, r.shown - dt / 1.1); fadeTo(r, r.shown); }
    const parent = r.side === 'bord' && r.craft ? r.craft.m.group : ctx.extra;
    if (h.group.parent !== parent) { h.group.removeFromParent(); parent.add(h.group); }
    if (r.side === 'bord') { h.group.position.set(r.local.x, r.local.y, r.local.z); h.group.rotation.set(0, r.local.yaw, 0); }
    else { h.group.position.set(r.x, groundY(r.x, r.z), r.z); h.group.rotation.set(0, r.yaw, 0); }
    const walking = (r.state === 'come' || r.state === 'walk' || r.state === 'leave') && r.path.length > 0 && r.delay <= 0;
    h.hold = r.state === 'seated' ? 'Sit' : r.state === 'board' ? (r.t / BOARD_S > 0.72 ? 'Sit' : null) : r.state === 'alight' ? (r.t / ALIGHT_S < 0.25 ? 'Sit' : null) : walking ? null : r.state === 'wait' && r.id % 3 === 0 ? 'Talk' : 'Idle';
    h.animate(dt, walking ? r.pace : r.state === 'board' || r.state === 'alight' ? 0.9 : 0);
    h.group.visible = r.shown > 0.01;
  };

  /** One walking step along the rider's path; true once at its end. */
  const step = (r: Rider, dt: number): boolean => {
    if (r.delay > 0) { r.delay -= dt; return false; }
    const to = r.path[0];
    if (!to) return true;
    const dx = to.x - r.x, dz = to.z - r.z, d = Math.hypot(dx, dz), v = Math.min(d, r.pace * dt);
    if (d > 1e-3) { r.x += (dx / d) * v; r.z += (dz / d) * v; r.yaw = r.yaw + wrap(Math.atan2(dx, dz) - r.yaw) * Math.min(1, dt * 8); }
    r.walked += v;
    if (d - v < 0.06) r.path.shift();
    if (!r.path.length) { r.yaw = r.endYaw; return true; }
    return false;
  };

  /** Over the gunwale: from the quay's edge to the step, in, and down onto the seat (in the boat's frame). */
  const startBoard = (r: Rider, now: number) => {
    const c = r.craft!, l = c.local(r), standY = groundY(r.x, r.z) - (S.seaY + c.heave);
    r.side = 'bord'; r.state = 'board'; r.t = 0;
    r.from = { x: l.x, y: standY, z: l.z, yaw: r.yaw - c.yaw };
    r.local = { ...r.from };
    if (trip) trip.lastStep = now;
  };
  const stepBoard = (r: Rider) => {
    const c = r.craft!, s = r.seat!, st = c.m.step, f = r.from, k = r.t / BOARD_S, floor = s.y - 0.45;
    const gun = { x: st.x + 0.15, z: st.z }, beside = { x: s.x + (st.x < 0 ? -0.12 : 0.12), z: s.z + 0.35 };
    if (k < 0.35) {
      const u = ease(k / 0.35); r.local = { x: lerp(f.x, gun.x, u), y: lerp(f.y, floor + 0.12, u) + Math.sin(u * Math.PI) * 0.28, z: lerp(f.z, gun.z, u), yaw: f.yaw + wrap(Math.atan2(gun.x - f.x, gun.z - f.z) - f.yaw) * u };
    } else if (k < 0.72) {
      const u = ease((k - 0.35) / 0.37), yaw = Math.atan2(beside.x - gun.x, beside.z - gun.z);
      r.local = { x: lerp(gun.x, beside.x, u), y: lerp(floor + 0.12, floor, u), z: lerp(gun.z, beside.z, u), yaw };
    } else {
      const u = ease((k - 0.72) / 0.28), yaw0 = Math.atan2(beside.x - gun.x, beside.z - gun.z);
      r.local = { x: lerp(beside.x, s.x, u), y: lerp(floor, s.y - SIT_HIPS, u), z: lerp(beside.z, s.z, u), yaw: yaw0 + wrap(s.yaw - yaw0) * u };
    }
    if (k >= 1) { r.local = { x: s.x, y: s.y - SIT_HIPS, z: s.z, yaw: s.yaw }; r.state = 'seated'; }
  };
  /** Off: up from the seat, to the step, over onto the jetty or the pontoon (a world point), then walking away. */
  const startAlight = (r: Rider, now: number) => { r.state = 'alight'; r.t = 0; r.from = { ...r.local }; if (trip) trip.lastStep = now; };
  const stepAlight = (r: Rider) => {
    const c = r.craft!, s = r.seat!, st = c.m.step, f = r.from, k = r.t / ALIGHT_S, floor = s.y - 0.45, shore = c.local(r.ashore!);
    const shoreY = groundY(r.ashore!.x, r.ashore!.z) - (S.seaY + c.heave), gun = { x: st.x + 0.15, z: st.z };
    if (k < 0.25) { const u = ease(k / 0.25); r.local = { x: f.x, y: lerp(f.y, floor, u), z: f.z, yaw: f.yaw }; }
    else if (k < 0.6) { const u = ease((k - 0.25) / 0.35); r.local = { x: lerp(f.x, gun.x, u), y: floor + 0.12 * u, z: lerp(f.z, gun.z, u), yaw: Math.atan2(gun.x - f.x, gun.z - f.z) }; }
    else { const u = ease((k - 0.6) / 0.4); r.local = { x: lerp(gun.x, shore.x, u), y: lerp(floor + 0.12, shoreY, u) + Math.sin(u * Math.PI) * 0.28, z: lerp(gun.z, shore.z, u), yaw: Math.atan2(shore.x - gun.x, shore.z - gun.z) }; }
    if (k >= 1) {
      // ashore: a passer-by walking off now, on foot in the world
      const at = r.ashore!;
      r.side = at.z < -250 ? 'ile' : 'quai'; r.x = at.x; r.z = at.z; r.yaw = r.local.yaw + c.yaw; r.craft = null; r.seat = null;
      r.state = 'leave'; r.walked = 0; r.unseen = 0; walkTo(r, r.onward, 'gone', r.yaw, AWAY);
    }
  };

  const updateRiders = (dt: number) => {
    const now = clock, view = ctx.camera;
    view.updateMatrixWorld(); frustum.setFromProjectionMatrix(pm.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
    made = 0;
    const tr = trip;
    // one at a time over the gunwale: the queue at the quay's or the jetty's edge, and the seated ones when their stop comes
    const stepFree = !tr || now - tr.lastStep >= STEP_GAP;
    let stepped = !stepFree;
    for (const r of riders) {
      r.t += dt;
      switch (r.state) {
        case 'come': if (r.delay > 0) { r.delay -= dt; break; } r.alpha = 1; if (step(r, dt)) r.state = 'wait'; break;
        case 'walk': r.alpha = 1; if (step(r, dt)) r.state = r.then; break;
        case 'queue': if (!stepped && tr && r.craft === tr.craft && r.craft.arrived) { startBoard(r, now); stepped = true; } break;
        case 'board': stepBoard(r); break;
        case 'seated':
          if (!stepped && tr && r.ashore && r.craft?.arrived && ((tr.stage === 'land' && tr.outR.includes(r)) || (tr.stage === 'landBack' && tr.backR.includes(r)))) { startAlight(r, now); stepped = true; }
          break;
        case 'alight': stepAlight(r); break;
        case 'leave': {
          const end = step(r, dt);
          const p = wpos(r), cd = Math.hypot(p.x - view.position.x, p.z - view.position.z);
          r.unseen = frustum.containsPoint(V.set(p.x, 1, p.z)) ? 0 : r.unseen + dt;
          if (r.walked > 6 && (cd > 24 || r.unseen > 0.8 || end)) r.alpha = 0;
          if (r.alpha === 0 && (r.shown <= 0.01 || !r.h)) { r.state = 'gone'; }
          break;
        }
        default: break;
      }
      if (r.state !== 'gone') syncBody(r, dt, view.position);
    }
    for (const r of riders) if (r.state === 'gone') dropBody(r);
    riders = riders.filter(r => r.state !== 'gone');
    // the stages' ends, as the runner asks for them
    if (tr) {
      const off = (l: Rider[]) => l.every(r => r.state === 'leave' || r.state === 'gone' || !riders.includes(r));
      stageOver.board = tr.outR.every(r => r.state === 'seated');
      stageOver.out = tr.stage === 'out' && tr.craft.arrived;
      stageOver.land = off(tr.outR);
      stageOver.boardBack = tr.backR.every(r => r.state === 'seated');
      stageOver.back = tr.stage === 'back' && tr.craft.arrived;
      stageOver.landBack = off(tr.backR);
    }
  };

  // ---------------------------------------------------------------- the camera: the boarding, the crossing, the landing; the player's drag turns it
  let snap = false;
  const cam = { on: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, pitch: 0, idle: 0, chase: 0 };
  const QUAY_VIEW = { pos: new THREE.Vector3(39.2, 7, -187), look: new THREE.Vector3(32.2, 0.3, -163.5) };
  const ISLAND_VIEW = { pos: new THREE.Vector3(46.8, 6.6, -272.5), look: new THREE.Vector3(37.2, 0.5, -298) };
  const W1 = new THREE.Vector3(), W2 = new THREE.Vector3();
  const viewWanted = (dt: number): { pos: THREE.Vector3; look: THREE.Vector3 } => {
    const tr = trip, st = tr?.stage;
    if (!tr || st === 'start' || st === 'helm' || st === 'board' || st === 'landBack') return QUAY_VIEW;
    if (st === 'land' || st === 'boardBack') return ISLAND_VIEW;
    // under way: behind the boat, a little to one side, the boat low in the picture and where it goes ahead; the view swings round the turns slowly
    const c = tr.craft;
    cam.chase += wrap(c.yaw - cam.chase) * Math.min(1, dt * 1.4);
    const a = cam.chase + 0.3, back = 15;
    W1.set(c.x + Math.sin(a) * back, 6, c.z + Math.cos(a) * back);
    W2.set(c.x - Math.sin(cam.chase) * 3, 0.3, c.z - Math.cos(cam.chase) * 3);
    return { pos: W1, look: W2 };
  };
  const O = new THREE.Vector3(), P = new THREE.Vector3();
  const camera = (dt: number, drag?: { yaw: number; pitch: number }): boolean => {
    const viewing = (!!trip && trip.stage !== 'start') || !!ending;
    if (!viewing) { cam.on = false; return false; }
    if (!cam.on || snap) cam.chase = trip?.craft.yaw ?? 0;
    const want = viewWanted(dt);
    if (drag && (drag.yaw || drag.pitch)) { cam.yaw += drag.yaw; cam.pitch = clamp(cam.pitch + drag.pitch, -0.3, 0.7); cam.idle = 0; }
    else if ((cam.idle += dt) > 6) { const k = Math.min(1, dt * 0.7); cam.yaw -= cam.yaw * k; cam.pitch -= cam.pitch * k; }
    // the drag turns the view round what it looks at, and raises or lowers it
    O.subVectors(want.pos, want.look);
    const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), flat = Math.hypot(O.x, O.z);
    P.set(O.x * c + O.z * s, Math.max(1.4, O.y + flat * cam.pitch), -O.x * s + O.z * c).add(want.look);
    const camObj = ctx.camera;
    if (!cam.on || snap) { cam.pos.copy(snap ? P : camObj.position); cam.look.copy(want.look); cam.on = true; if (!snap) { camObj.getWorldDirection(O); cam.look.copy(camObj.position).addScaledVector(O, P.distanceTo(want.look)); } snap = false; }
    const k = 1 - Math.exp(-dt * 2.6);
    cam.pos.lerp(P, k); cam.look.lerp(want.look, k);
    camObj.position.copy(cam.pos); camObj.lookAt(cam.look);
    return true;
  };

  // ---------------------------------------------------------------- every frame
  let clock = 0;
  const update = (dt: number) => {
    clock += dt;
    const run = running();
    if (run && !trip && !ending) begin(run.kind);
    if (run && trip && run.stage !== trip.stage) enter(run.stage);
    if (!run && trip && !ending) finish(!(trip.stage === 'landBack' && stageOver.landBack));
    if (ending && (ending.t += dt) >= 0.5) setDown(ending.abort);
    if (!trip && !ending && onHelm()) setDown(false);                    // seated at a helm with no crossing (a debug sit): back on the pier
    for (const k of BOAT_KINDS) crafts[k].update(dt);
    if (!trip) refill(false, dt);
    else if (trip.stage === 'out' || trip.stage === 'land' || trip.stage === 'boardBack' || trip.stage === 'back') refill(false, dt);   // the next crossing's customers come while this one is away
    updateRiders(dt);
  };

  return {
    id, type: 'traversee', name: place.name, places: [place], update,
    camera, active: () => !!trip || !!ending,
    /** A save mid-crossing resumes on the pier (the boat and the island are beyond the hub's bounds). */
    safePlace: () => (trip || ending || onHelm() ? { x: LANDING.x, z: LANDING.z, yaw: LANDING.yaw } : null),
    dispose() {
      for (const r of riders) dropBody(r);
      riders = [];
      for (const k of BOAT_KINDS) crafts[k].m.dispose();
      ctx.places.remove(id);
    },
    debug: () => ({
      id, type: 'traversee', name: place.name, anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: place.space })), phase: trip?.stage ?? (ending ? 'ending' : 'idle'),
      boat: inUse, seats: Object.fromEntries(BOAT_KINDS.map(k => [k, crafts[k].seat.id])),
    }),
    traversee: () => {
      const tr = trip, c = crafts[tr?.kind ?? inUse], C = R.TRAV_COUNTERS;
      const who = (r: Rider) => { const p = wpos(r); return { id: r.id, state: r.state, seated: r.state === 'seated', side: r.side, x: +p.x.toFixed(2), z: +p.z.toFixed(2), drawn: !!r.h && r.shown > 0.5, leg: tr ? (tr.outR.includes(r) ? 'aller' : tr.backR.includes(r) ? 'retour' : null) : null }; };
      return {
        phase: tr?.stage ?? (ending ? 'ending' : 'idle'), boat: tr?.kind ?? inUse, pose: c.pose(), moored: Object.fromEntries(BOAT_KINDS.map(k => [k, crafts[k].pose()])),
        helm: { id: c.seat.id, locked: !!c.seat.locked, seated: ctx.player.seated()?.id === c.seat.id },
        plan: tr ? tr.plan : planNow('pirogue'), customers: riders.map(who), bodies: riders.filter(r => r.h).length,
        paid: paidLog.map(p => ({ ...p })), counters: { traversees: counter(ctx, C.trips), traversees_pirogue: counter(ctx, C.of('pirogue')), traversees_chaloupe: counter(ctx, C.of('chaloupe')), passagers_ngor: counter(ctx, C.passengers) },
        closed: { pirogue: why('pirogue'), chaloupe: why('chaloupe') }, wallet: ctx.state.wallet, anchor: S.anchor, landing: LANDING,
        camera: cam.on ? { pos: cam.pos.toArray().map(v => +v.toFixed(1)), look: cam.look.toArray().map(v => +v.toFixed(1)) } : null,
      };
    },
    /** Checks: the pirogue round trips Ousmane has seen (the chaloupe opens at 3). */
    setPirogueTrips: (n: number) => { ctx.state.data.counters[R.TRAV_COUNTERS.of('pirogue')] = n; return n; },
  };
}
