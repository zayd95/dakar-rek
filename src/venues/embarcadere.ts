import * as THREE from 'three';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { SIT_HIPS, type Seat } from '../interact/seats';
import { fcfa, type MenuItem } from '../ui/hud';
import { say } from '../i18n/wolof';
import { CROSSING_STEPS, crossingStage, embarcadere, type CrossingStage } from '../activity/templates';
import type { Effects } from '../activity/types';
import { buildBoat } from '../world/boats';
import { BOAT_KINDS, TRAVERSEE_SITE as S, wadeDepth, type BoatKind, type BoatModel, type LocalSeat, type P2, type Pose } from '../sea/traverseeSite';
import { ngorGroundY } from '../world/ngor';
import { beachSandY } from '../world/ngorBay';
import * as R from '../sea/traverseeRules';
import { VTC_LOOKS } from '../transport/vtcRules';
import { ECONOMY } from '../economy/config';
import { counter, type Venue, type VenueEnv } from './venue';

/**
 * Embarcadère de Ngor (« la traversée », docs/TRAVERSEE.md; the place in the contract src/sea/traverseeSite.ts, the rules in
 * src/sea/traverseeRules.ts): the Almadies' old fishing quay, where the player takes Ousmane's pirogue or chaloupe across to the island of Ngor
 * with paying customers. Built like Soumbédioune's pirogue (src/venues/beach.ts): a place on the sand whose crossing is a run of `ride` steps
 * (src/activity/templates.ts `embarcadere`); this venue moves the boat and the people along them and tells the runner when each step is over.
 *
 * Version 2, after the owner's photos of Ngor (docs/proof/traversee/references/): boarded and left on the sand, as there.
 * - The boats (src/world/boats.ts) lie pulled up on the Almadies' beach east of the pier, each at its own pose, bow on the sand and stern in the
 *   water, bow lifted a little and hardly rocking. The one not in use stays there.
 * - The place's anchor is on the sand between them; the player takes the helm in a cut to black (a 'vehicle' seat in the street space, carried
 *   by the boat, locked while crossing: no « Se lever » at sea).
 * - A leg (wayLeg): pushed off stern first, straight back off the sand (by hand, then the motor astern), the bow settling to its floating
 *   height; turned round forward in open water, toward the room its clear zone leaves; across through the route; in bow first, slowing, up
 *   onto the other beach, where the bow lifts as it grounds. Speed eases in and out and drops in the turn.
 * - The customers (the VTC passengers' bodies and gait, src/transport/vtc.ts): records that walk, put on orange life jackets on the sand, wade
 *   into the shallows beside the bow, climb in over the gunwale at the model's `step`, walk aft and sit; at the other end they climb out into
 *   the shallows, wade to the sand, take the jackets off there and walk up the beach (on the island, among the parasols) and fade. A body
 *   exists only within DRAW_NEAR of the camera, a few at a time, faded in and out (never a pop in view).
 * - Each leg is paid by its landing step's effects (fares − Ousmane's share): a reload or a stop never pays an unfinished leg, nothing twice.
 * - Stopped (« Arrêter ») or reloaded mid-crossing: back on the sand at the anchor, both boats on the beach (safePlace: the save never holds a
 *   player at sea, beyond the hub's bounds).
 */
const T = ECONOMY.traversee;
/** On foot (m/s): to the boat (briskly: the boat waits), walking off, knee-deep in the shallows. */
const WALK = 1.6, AWAY = 1.25, WADE = 0.85;
/** Aboard: along the floorboards between the step and a seat (m/s); over the gunwale, in or out (s); sitting down or standing up (s). One climb at the step at a time. */
const DECK = 1.1, CLIMB_S = 1.05, SIT_S = 0.6;
/** Putting the life jacket on or taking it off, standing on the sand (s): it is on (or off) half-way through. */
const VEST_S = 1.2;
/** Wading: never deeper than this below the sea's surface (the contract's wadeDepth reaches it 2.5 m out from the mainland's waterline). */
const WADE_MAX = 0.45;
/** Standing in the shallows to climb in or out: this far out from the gunwale at the step (m). */
const BESIDE = 0.55;
/** A customer's body is made within DRAW_NEAR of the camera (one a frame) and dropped beyond DROP_FAR. */
const DRAW_NEAR = 110, DROP_FAR = 150;
/** On the water: speeding up, braking (m/s²), the last metres' crawl (m/s), the turn's radius (m) and its share of the cruising speed. */
const ACC = 1.8, DEC = 1.3, CREEP = 0.45, TURN_R = 3.5, TURN_SLOW = 0.5;
/** Pushed off: straight back off the sand (m), the first PUSH m by hand (a share of the cruising speed), then the motor astern. */
const BACK = 14, PUSH = 2, PUSH_SLOW = 0.14, ASTERN = 0.38;
/** Coming in: from this far out (m) straight at the beach, bow first. */
const RUN_IN = 10;
/** Run up on the sand: the bow lifted (rad) and the hull raised (m), over the first and the last GROUND_RUN m of a leg; its rocking mostly stilled. */
const GROUND_PITCH = 0.045, GROUND_LIFT = 0.05, GROUND_RUN = 1.6;
/** Rocking (rad, m) under way; still a third of it, and an eighth of that run up on the sand. The pirogue rolls, the chaloupe barely; both bank a little into the turns. */
const ROCK: Record<BoatKind, { roll: number; pitch: number; heave: number; bank: number }> = {
  pirogue: { roll: 0.075, pitch: 0.032, heave: 0.07, bank: 0.06 },
  chaloupe: { roll: 0.022, pitch: 0.011, heave: 0.03, bank: 0.025 },
};
/** Where the player is set down after a crossing (or a stop): on the sand at the anchor, facing the sea. */
const LANDING: Pose = { x: S.anchor.x + 1.1, z: S.anchor.z - 0.8, yaw: Math.PI };
/** The top of the mainland's beach (from the coast road), where its customers come down from and go back up to, past the beach's pirogues. */
const UP: P2 = { x: 48.6, z: -128 }, MID: P2 = { x: 49.4, z: -143 };
/** Beyond this z it is the island's side (its ground, its customers). */
const ISLAND_Z = -250;
/** The contract's island pose is the pirogue's (length 10): the shorter chaloupe runs in further, so its bow is on the sand where the pirogue's is. */
const REF_LEN = 10;

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
/** Where the bow of a boat at yaw `yaw` points. */
const bowDir = (yaw: number): P2 => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
/** A point of a boat's deck plan (local x, z) in the world, the boat at `p` (yaw only). */
const onBoat = (p: Pose, l: P2): P2 => ({ x: p.x + l.x * Math.cos(p.yaw) + l.z * Math.sin(p.yaw), z: p.z - l.x * Math.sin(p.yaw) + l.z * Math.cos(p.yaw) });
const add = (a: P2, d: P2, k: number): P2 => ({ x: a.x + d.x * k, z: a.z + d.z * k });
/** Each boat at the island's landing beach: the contract's pose, run in as far as the pirogue's bow (REF_LEN). */
export const islandPose = (length: number): Pose => ({ ...S.island.beached, z: S.island.beached.z - (REF_LEN - length) / 2 });

/** Where the feet are at (x, z): the island's sand (below the sea off its shore, never deeper than wading); the mainland's beach, its wet sand
 *  sloping down to the waterline as the world built it (src/world/ngorBay.ts beachSandY; `beach` is the feet's height on the dry sand), then the
 *  shallows (wadeDepth). */
export function groundAt(x: number, z: number, beach = 0.12): number {
  if (z < ISLAND_Z) return Math.max(ngorGroundY(x, z), S.seaY - WADE_MAX);
  if (z < S.shoreZ) return S.seaY - wadeDepth(z);
  return Math.max(S.seaY, beachSandY(z) + beach - beachSandY(0));
}
const dry = (p: P2) => groundAt(p.x, p.z) >= S.seaY + 0.03;
/** From `p` along `d` (unit) to the first dry sand, and `more` m beyond (`p` itself, and beyond, if it is dry already). */
function dryFrom(p: P2, d: P2, more: number): P2 {
  let k = 0;
  while (k < 16 && !dry(add(p, d, k))) k += 0.2;
  return add(p, d, k + more);
}

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

/** A point of a way: its share of the cruising speed, and whether the boat goes astern there (stern first: its bow points against the way). */
interface WayPt extends P2 { slow: number; rev?: boolean }
/** A leg on the water: points, the length, the fastest the boat may go at each point to brake in time; `backLen`: the first metres, astern. */
export class Way {
  readonly cum: number[] = [];
  readonly vmax: number[] = [];
  readonly len: number;
  constructor(readonly pts: WayPt[], cruise: number, readonly end: Pose, readonly backLen = 0) {
    let L = 0; this.cum.push(0);
    for (let i = 1; i < pts.length; i++) { L += dist(pts[i], pts[i - 1]); this.cum.push(L); }
    this.len = L;
    const n = pts.length; this.vmax = new Array(n).fill(0);
    for (let i = n - 2; i >= 0; i--) this.vmax[i] = Math.min(cruise * pts[i].slow, Math.sqrt(this.vmax[i + 1] ** 2 + 2 * DEC * (this.cum[i + 1] - this.cum[i])));
  }
  /** Where the way is `s` metres along: the point, the way's heading, the speed allowed, and whether the boat goes astern there. */
  at(s: number) {
    const c = this.cum; let lo = 0, hi = c.length - 1;
    s = clamp(s, 0, this.len);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[hi], seg = c[hi] - c[lo] || 1, k = (s - c[lo]) / seg, d = dist(a, b) || 1;
    return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), hx: (b.x - a.x) / d, hz: (b.z - a.z) / d, vmax: lerp(this.vmax[lo], this.vmax[hi], k), rev: !!a.rev };
  }
  /** The boat's heading (game yaw) `s` metres along: along the way, or against it astern. */
  yawAt(s: number) { const p = this.at(s); return p.rev ? boatYaw(-p.hx, -p.hz) : boatYaw(p.hx, p.hz); }
}

const arc = (n: number, f: (a: number) => P2) => Array.from({ length: n + 1 }, (_, k) => ({ ...f((Math.PI * k) / n), slow: TURN_SLOW }));
type Box = { x0: number; x1: number; z0: number; z1: number };
/**
 * A leg from one beach to the other (src/sea/traverseeSite.ts: the boats' poses, the route, the clear zones):
 * - pushed off stern first: straight back BACK m off the sand along its own line, the first metres slowly (by hand), stopping at the end;
 * - turned round forward in open water: a half circle of TURN_R toward the side of `room` (the clear zone it leaves) with more space;
 * - across, through the route's points that lie between the turn and the other beach (12 m clear of either end);
 * - in bow first, from RUN_IN m out straight at `to`, braking to a crawl as the bow runs up the sand.
 */
export function wayLeg(from: Pose, to: Pose, room: Box, cruise: number): Way {
  const b = bowDir(from.yaw), astern: WayPt[] = [];
  for (let d = 0; d <= BACK + 1e-6; d += 0.5) astern.push({ x: from.x - b.x * d, z: from.z - b.z * d, slow: d < PUSH ? PUSH_SLOW : ASTERN, rev: true });
  const R0 = astern[astern.length - 1]; R0.slow = 0; R0.rev = false;                        // stopped: then ahead
  let n = { x: -b.z, z: b.x };
  if (n.x * ((room.x0 + room.x1) / 2 - from.x) + n.z * ((room.z0 + room.z1) / 2 - from.z) < 0) n = { x: -n.x, z: -n.z };
  const r = TURN_R, c = add(R0, n, r);
  const turn = arc(16, a => ({ x: c.x - n.x * r * Math.cos(a) + b.x * r * Math.sin(a), z: c.z - n.z * r * Math.cos(a) + b.z * r * Math.sin(a) }));
  const E = turn[turn.length - 1], tb = bowDir(to.yaw), inPt = add(to, tb, -RUN_IN), L = dist(E, inPt);
  const along = (p: P2) => ((p.x - E.x) * (inPt.x - E.x) + (p.z - E.z) * (inPt.z - E.z)) / (L * L);
  const mids = S.route.filter(p => dist(p, E) > 12 && dist(p, inPt) > 8 && along(p) > 0.05 && along(p) < 0.95).sort((p, q) => along(p) - along(q));
  const across = spline([add(E, b, 6), E, ...mids, inPt, to, add(to, tb, 4)]).map(p => ({ ...p, slow: 1 }));
  return new Way([...astern, ...turn.slice(1), ...across.slice(1)], cruise, to, BACK);
}

// ------------------------------------------------------------------------------------------------ a boat
const V = new THREE.Vector3();
/** How far up the sand a boat is run (0 afloat, 1 grounded) `s` metres along its leg: off the sand as it is pushed off, onto it as it comes in. */
const groundAlong = (w: Way, s: number) => Math.max(1 - ease(s / GROUND_RUN), ease((s - (w.len - GROUND_RUN)) / GROUND_RUN));
/** One of Ousmane's boats: its model, its two beaches, where it lies or goes, its rocking and wake, the helm seat it carries. */
class Craft {
  x = 0; z = 0; yaw = 0; v = 0; s = 0; heave = 0; roll = 0; pitch = 0;
  /** Run up on the sand (1) or afloat (0). */
  ground = 1;
  way: Way | null = null; arrived = true; astern = false;
  private t = Math.random() * 10; private bank = 0;
  readonly cruise: number;
  /** Its own place on the mainland's beach (the contract's), its place on the island's landing beach, and the legs between them. */
  readonly home: Pose; readonly isle: Pose; readonly out: Way; readonly back: Way;
  constructor(readonly kind: BoatKind, readonly m: BoatModel, readonly seat: Seat) {
    this.cruise = R.boatSpeed(kind);
    this.home = S.beach[kind]; this.isle = islandPose(m.length);
    this.out = wayLeg(this.home, this.isle, S.beach.clear, this.cruise); this.back = wayLeg(this.isle, this.home, S.island.clear, this.cruise);
    this.m.group.rotation.order = 'YXZ';                       // yaw first, then pitch and roll in the boat's own frame
  }
  /** At rest, run up on a beach. */
  rest(p: Pose) { this.x = p.x; this.z = p.z; this.yaw = p.yaw; this.v = 0; this.s = 0; this.way = null; this.arrived = true; this.ground = 1; this.astern = false; }
  sail(w: Way) { this.way = w; this.s = 0; this.v = 0; this.arrived = false; }
  update(dt: number) {
    this.t += dt;
    const w = this.way;
    let yawRate = 0;
    if (w && !this.arrived) {
      const here = w.at(this.s);
      this.v = Math.min(this.v + ACC * dt, Math.max(CREEP, here.vmax));
      this.s += this.v * dt;
      if (this.s >= w.len - 0.02) this.rest(w.end);
      else {
        const p = w.at(this.s), d = wrap(w.yawAt(this.s) - this.yaw), turn = d * Math.min(1, dt * 6);
        this.x = p.x; this.z = p.z; this.yaw += turn; yawRate = dt > 0 ? turn / dt : 0; this.astern = p.rev; this.ground = groundAlong(w, this.s);
      }
    }
    const k = ROCK[this.kind], g = this.ground, amp = (0.33 + 0.67 * Math.min(1, this.v / this.cruise)) * (1 - 0.88 * g), t = this.t;
    this.bank += (clamp(-yawRate * this.v * k.bank * 0.25, -0.12, 0.12) * (1 - g) - this.bank) * Math.min(1, dt * 3);
    this.heave = Math.sin(t * 1.9) * k.heave * amp;
    this.roll = (Math.sin(t * 1.25) * 0.8 + Math.sin(t * 2.3 + 1) * 0.2) * k.roll * amp + this.bank;
    this.pitch = Math.sin(t * 1.6 + 0.7) * k.pitch * amp + GROUND_PITCH * g;    // run up the sand: the bow (−z) lifted
    const grp = this.m.group;
    grp.position.set(this.x, S.seaY + this.heave + GROUND_LIFT * g, this.z); grp.rotation.set(this.pitch, this.yaw, this.roll);
    const wake = this.m.wake.material as THREE.MeshBasicMaterial, want = this.v > 0.6 && !this.arrived && !this.astern ? clamp(0.1 + 0.32 * (this.v / this.cruise), 0, 0.42) : 0;   // soft: on a phone, close behind the stern, more read as white planks
    wake.opacity += (want - wake.opacity) * Math.min(1, dt * 2.5); wake.visible = wake.opacity > 0.01;
    grp.updateMatrixWorld();
    // the helm rides with the boat: the player's body is set on it every frame (src/main.ts)
    const h = this.m.helm; V.set(h.x, h.y, h.z).applyMatrix4(grp.matrixWorld);
    this.seat.x = V.x; this.seat.z = V.z; this.seat.top = V.y; this.seat.yaw = this.yaw + h.yaw;
  }
  /** A point of the boat's frame in the world (the hull's rocking included). */
  world(l: { x: number; y: number; z: number }) { return V.set(l.x, l.y, l.z).applyMatrix4(this.m.group.matrixWorld).clone(); }
  /** A world point in the boat's frame (the hull's rocking included). */
  toLocal(p: { x: number; y: number; z: number }) { this.m.group.updateMatrixWorld(); return this.m.group.worldToLocal(V.set(p.x, p.y, p.z)).clone(); }
  /** The step's side: +1 or −1 along the boat's x (0: at the stem), and where a person stands in the shallows to climb in there (the boat at `p`). */
  stand(p: Pose): P2 {
    const st = this.m.step, sx = Math.abs(st.x) > 0.05 ? Math.sign(st.x) : 0;
    return onBoat(p, sx ? { x: st.x + sx * BESIDE, z: st.z } : { x: 0, z: st.z - BESIDE });
  }
  /** Out from the hull at the step, in the world (the boat at `p`): where the queue stands back from it. */
  outward(p: Pose): P2 { const st = this.m.step, sx = Math.abs(st.x) > 0.05 ? Math.sign(st.x) : 0; return sx ? { x: sx * Math.cos(p.yaw), z: -sx * Math.sin(p.yaw) } : bowDir(p.yaw); }
  pose() { return { x: +this.x.toFixed(2), z: +this.z.toFixed(2), yaw: +wrap(this.yaw).toFixed(3), y: +(S.seaY + this.heave + GROUND_LIFT * this.ground).toFixed(3), roll: +this.roll.toFixed(4), pitch: +this.pitch.toFixed(4), ground: +this.ground.toFixed(2), astern: this.astern, v: +this.v.toFixed(2), s: +this.s.toFixed(1), len: this.way ? +this.way.len.toFixed(1) : 0, wake: +(this.m.wake.material as THREE.MeshBasicMaterial).opacity.toFixed(2) }; }
}

// ------------------------------------------------------------------------------------------------ the customers
type RState = 'come' | 'wait' | 'walk' | 'queue' | 'toStep' | 'board' | 'seated' | 'alight' | 'leave' | 'gone';
/** A point to walk to; on reaching it, the life jacket put on or taken off (standing, VEST_S). */
interface Pt extends P2 { act?: 'on' | 'off' }
/** A move aboard (in the boat's frame): its points and when each part ends (s since it began). */
interface Move { from: THREE.Vector3; inside: THREE.Vector3; beside: THREE.Vector3; seat: THREE.Vector3; hop: number; ends: [number, number, number]; yaw0: number; yaw1: number }
/** A customer: logic first (where, doing what), a body only when near the camera. */
interface Rider {
  id: number; look: PersonLook; state: RState; t: number;
  /** On foot on the mainland, on foot on the island's side, or aboard (then `local` is in the boat's frame). */
  side: 'quai' | 'ile' | 'bord';
  x: number; z: number; yaw: number;
  /** Walking: the points left, the state and facing at the end, the pace. */
  path: Pt[]; then: RState; endYaw: number; pace: number;
  /** Waiting spot on the beach (mainland 0–3, island 0–2), or −1; place in the line at the step (0 first). */
  spot: number; q: number;
  craft: Craft | null; seat: LocalSeat | null;
  local: { x: number; y: number; z: number; yaw: number };
  mv: Move | null;
  /** What the body does aboard: sits, stands, walks the floorboards, climbs the gunwale. */
  pose: 'sit' | 'stand' | 'walk' | 'climb';
  /** Stepping off: the way on from the sand. */
  onward: Pt[];
  /** Wearing the life jacket; putting it on or off (s left), and which. */
  vest: boolean; dress: number; dressTo: boolean;
  walked: number; unseen: number; delay: number;
  /** 1 seen, 0 gone: what the body fades toward. */
  alpha: number;
  h: Humanoid | null; shown: number; mats: THREE.Material[] | null;
}

interface Trip {
  kind: BoatKind; craft: Craft; plan: R.CrossingPlan; stage: CrossingStage | null;
  outR: Rider[]; backR: Rider[];
  /** The next in line to climb in (its `q`), and when the step is free again (the venue's clock). */
  next: number; stepFree: number;
}
interface Paid { leg: R.Leg; kind: BoatKind; passengers: number; fares: number; share: number; amount: number; label: string; ledger: number | null }
/** What the checks read of the customers' moves: each life jacket put on or taken off, each climb in or out, with the feet's height. */
interface Logged { t: number; id: number; what: 'vest-on' | 'vest-off' | 'board' | 'seated' | 'alight'; y: number; vest: boolean; side: string; leg: string | null }
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
  /** Both boats on the mainland's beach, each at its own pose. */
  const restAll = () => { for (const k of BOAT_KINDS) crafts[k].rest(crafts[k].home); };
  let inUse: BoatKind = 'pirogue';
  restAll();

  // ---------------------------------------------------------------- the rules, read from the save
  const trusted = () => ctx.state.data.flags.includes('ousmane_trust');
  const pirogueTrips = () => counter(ctx, R.TRAV_COUNTERS.of('pirogue'));
  const seed = () => R.crossingSeed(ctx.day(), ctx.hour(), counter(ctx, R.TRAV_COUNTERS.trips));
  const planNow = (kind: BoatKind) => R.crossingPlan(kind, ctx.hour(), seed(), trusted());
  const why = (kind: BoatKind) => R.closedReason(kind, { hour: ctx.hour(), pirogueTrips: pirogueTrips(), energie: ctx.state.data.needs.energie });

  // ---------------------------------------------------------------- the customers
  let riders: Rider[] = [], seq = 0, made = 0;
  const events: Logged[] = [];
  const groundY = (x: number, z: number) => groundAt(x, z, 0.12 + (z >= S.shoreZ ? ctx.world()?.heightAt(x, z) ?? 0 : 0));
  const rider = (side: 'quai' | 'ile', at: P2, state: RState, alpha = 1): Rider => {
    const r: Rider = {
      id: seq, look: LOOKS[(seq * 5 + 3) % LOOKS.length], state, t: 0, side, x: at.x, z: at.z, yaw: Math.PI, path: [], then: 'wait', endYaw: Math.PI, pace: WALK,
      spot: -1, q: -1, craft: null, seat: null, local: { x: 0, y: 0, z: 0, yaw: 0 }, mv: null, pose: 'stand', onward: [], vest: false, dress: 0, dressTo: false,
      walked: 0, unseen: 0, delay: 0, alpha, h: null, shown: 0, mats: null,
    };
    seq++; riders.push(r); return r;
  };
  const walkTo = (r: Rider, path: Pt[], then: RState, endYaw: number, pace = WALK) => { r.path = path.map(p => ({ ...p })); r.then = then; r.endYaw = endYaw; r.pace = pace; };
  const legOf = (r: Rider) => (trip ? (trip.outR.includes(r) ? 'aller' : trip.backR.includes(r) ? 'retour' : null) : null);
  /** Feet in the world: aboard, through the boat; ashore, on the ground. */
  const wpos = (r: Rider) => (r.side === 'bord' && r.craft ? r.craft.world(r.local) : new THREE.Vector3(r.x, groundY(r.x, r.z), r.z));
  const log = (r: Rider, what: Logged['what']) => { events.push({ t: +clock.toFixed(1), id: r.id, what, y: +wpos(r).y.toFixed(3), vest: r.vest, side: r.side, leg: legOf(r) }); if (events.length > 60) events.shift(); };
  /** Customers waiting on the beach for the next crossing (not taken by the crossing in hand). */
  const waitingAtQuay = () => riders.filter(r => r.side === 'quai' && (r.state === 'wait' || r.state === 'come') && !inTrip(r));
  const inTrip = (r: Rider) => !!trip && (trip.outR.includes(r) || trip.backR.includes(r));
  const freeSpot = () => { for (let k = 0; k < S.beach.waiting.length; k++) if (!riders.some(r => r.spot === k && r.side === 'quai' && (r.state === 'wait' || r.state === 'come') && !inTrip(r))) return k; return -1; };
  /** As many as the next pirogue would take, during the hours: placed (a fresh hub) or walking down the beach. */
  let comeT = 0;
  const refill = (now: boolean, dt = 0) => {
    const want = R.crossingOpen(ctx.hour()) ? planNow('pirogue').out.passengers : 0, here = waitingAtQuay();
    if (here.length > want) {                                                  // the evening, or the end of the busy hours: some go home
      const r = here.sort((a, b) => b.spot - a.spot)[0];
      r.spot = -1; r.state = 'leave'; r.walked = 0; walkTo(r, [MID, UP], 'gone', 0, AWAY);
      return;
    }
    comeT -= dt;
    while (here.length < want && (now || comeT <= 0)) {
      const k = freeSpot(); if (k < 0) break;
      const spot = S.beach.waiting[k];
      if (now) { const r = rider('quai', spot, 'wait'); r.spot = k; r.yaw = Math.PI; }
      else {
        const r = rider('quai', { x: UP.x + (seq % 2 ? 0.5 : -0.5), z: UP.z }, 'come', 0);
        r.spot = k; r.walked = 0; walkTo(r, [{ x: MID.x + (spot.x - MID.x) * 0.25, z: MID.z }, spot], 'wait', Math.PI);
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
  const call = (kind: BoatKind) => { const n = (trip?.plan ?? planNow(kind)).out.passengers; return `Ousmane : « ${say('Nanu dem')} ! ${n} client${n > 1 ? 's' : ''} pour l’île. Les gilets, tout le monde ! »`; };
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
  /** About how long each stage lasts (s), for the progress bar (measured headless: a pirogue round trip takes about two and a half minutes, the chaloupe's two). */
  const stageSeconds = (kind: BoatKind, stage: CrossingStage) => {
    const c = crafts[kind];
    return { start: 0.5, helm: 0.7, board: 25, out: c.out.len / c.cruise + 12, land: 10, boardBack: 21, back: c.back.len / c.cruise + 12, landBack: 12 }[stage];
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
      summary: () => { const n = waitingAtQuay().length; return R.crossingOpen(ctx.hour()) ? `${n} client${n > 1 ? 's' : ''} sur la plage · pirogue ou chaloupe` : R.nightReason(ctx.hour()); },
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

  /** The line at the step, in the water alongside the hull (the owner's photo of the boarding): the k-th place back from it toward the stern, a little out. */
  const queueAt = (c: Craft, p: Pose, k: number): P2 => add(add(c.stand(p), c.outward(p), 0.3 * k), bowDir(p.yaw), -0.85 * k);
  /** On the sand above the k-th place in the line: where the customers come down to before they wade in. */
  const above = (c: Craft, p: Pose, k: number): Pt => add(dryFrom(queueAt(c, p, k), bowDir(p.yaw), 0.8), c.outward(p), 0.3);
  /** Seats from the stern forward: the first aboard goes furthest, nobody climbs over the seated. */
  const seatOrder = (c: Craft) => [...c.m.seats].sort((a, b) => b.z - a.z || a.x - b.x);
  /** Customers set off for the boat at `p`, nearest first: the life jacket on where they stand, down the sand, wading out to their place in the line. */
  const sendAboard = (c: Craft, p: Pose, list: Rider[], via: (r: Rider, k: number) => Pt[]) => {
    const st = c.stand(p), order = seatOrder(c);
    list.sort((a, b) => dist(a, st) - dist(b, st)).forEach((r, k) => {
      r.q = k; r.craft = c; r.seat = order[k % order.length]; r.spot = -1;
      r.delay = k * 0.55; r.state = 'walk'; r.walked = 0;
      const q = queueAt(c, p, k + 1);
      walkTo(r, [{ x: r.x, z: r.z, act: 'on' }, ...via(r, k), above(c, p, k + 1), q], 'queue', Math.atan2(st.x - q.x, st.z - q.z));
    });
  };

  /** The crossing starts: its plan fixed (what the choice showed), its customers taken from the beach. */
  const begin = (kind: BoatKind) => {
    const plan = R.crossingPlan(kind, ctx.hour(), seed(), trusted());
    const waiting = waitingAtQuay().sort((a, b) => a.spot - b.spot);
    while (waiting.length < plan.out.passengers) { const k = freeSpot(); const r = rider('quai', S.beach.waiting[Math.max(0, k)], 'wait'); r.spot = k; waiting.push(r); }
    trip = { kind, craft: crafts[kind], plan, stage: null, outR: waiting.slice(0, plan.out.passengers), backR: [], next: 0, stepFree: 0 };
    for (const k of Object.keys(stageOver) as CrossingStage[]) stageOver[k] = false;
  };
  const enter = (to: CrossingStage) => {
    const tr = trip!, from = tr.stage ? STAGES.indexOf(tr.stage) : -1;
    for (const st of STAGES.slice(from + 1, STAGES.indexOf(to) + 1)) enterOne(tr, st);
  };
  const enterOne = (tr: Trip, stage: CrossingStage) => {
    tr.stage = stage;
    const c = tr.craft, I = S.island;
    switch (stage) {
      case 'start': ctx.hud.fade(true); break;
      case 'helm':
        // in the black: the helm locked, the view on the beach; the customers put their life jackets on and go down to the water as the player takes the helm
        inUse = tr.kind; c.seat.locked = true; snap = true;
        setTimeout(() => ctx.hud.fade(false), 120);
        tr.next = 0; tr.stepFree = 0;
        sendAboard(c, c.home, tr.outR, () => []);
        break;
      case 'board': break;
      case 'out':
        c.sail(c.out);
        // those going back come down from the island's restaurants to wait under the parasols
        tr.backR = Array.from({ length: tr.plan.back.passengers }, (_, k) => {
          const r = rider('ile', I.path[I.path.length - 1], 'come', 0);
          r.spot = k; r.delay = k * 1.6; r.craft = c;
          walkTo(r, [I.path[2], I.waiting[k % I.waiting.length]], 'wait', 0);
          return r;
        });
        break;
      case 'land': break;
      case 'boardBack':
        tr.next = 0; tr.stepFree = clock;
        sendAboard(c, c.isle, tr.backR, () => [{ x: I.path[1].x + 1, z: I.path[1].z }]);
        break;
      case 'back': c.sail(c.back); break;
      case 'landBack': break;
    }
  };

  /** The end of a crossing (done, or stopped): a cut to black, the player set down on the sand; stopped, everything back as on a fresh hub. */
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
      restAll();
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

  const syncBody = (r: Rider, dt: number, cam: THREE.Vector3) => {
    const p = r.side === 'bord' && r.craft ? r.craft.world(r.local) : { x: r.x, z: r.z }, d = Math.hypot(p.x - cam.x, p.z - cam.z);
    if (!r.h && d < DRAW_NEAR && made < 1 && humanoidReady() && r.state !== 'gone') {
      made++;
      const h = new Humanoid(r.look); h.hold = r.state === 'seated' ? 'Sit' : 'Idle'; h.group.userData.lodPrio = 1.4;
      r.h = h; r.shown = 0; r.mats = null; fadeTo(r, 0);
      (r.side === 'bord' && r.craft ? r.craft.m.group : ctx.extra).add(h.group);
    } else if (r.h && d > DROP_FAR) dropBody(r);
    const h = r.h; if (!h) return;
    if (h.vestOn !== r.vest) h.setVest(r.vest);
    const want = r.alpha;
    if (r.shown !== want) { r.shown = want > r.shown ? Math.min(want, r.shown + dt / 0.8) : Math.max(want, r.shown - dt / 1.1); fadeTo(r, r.shown); }
    const parent = r.side === 'bord' && r.craft ? r.craft.m.group : ctx.extra;
    if (h.group.parent !== parent) { h.group.removeFromParent(); parent.add(h.group); }
    if (r.side === 'bord') { h.group.position.set(r.local.x, r.local.y, r.local.z); h.group.rotation.set(0, r.local.yaw, 0); }
    else { h.group.position.set(r.x, groundY(r.x, r.z), r.z); h.group.rotation.set(0, r.yaw, 0); }
    const dressing = r.dress > 0, aboard = r.state === 'board' || r.state === 'alight';
    const walking = !dressing && (r.state === 'come' || r.state === 'walk' || r.state === 'leave' || r.state === 'toStep') && r.path.length > 0 && r.delay <= 0;
    h.hold = dressing ? 'Grab' : r.state === 'seated' ? 'Sit' : aboard ? (r.pose === 'sit' || r.pose === 'climb' ? 'Sit' : null) : walking ? null : r.state === 'wait' && r.id % 3 === 0 ? 'Talk' : 'Idle';
    h.animate(dt, walking ? (wet(r) ? Math.min(r.pace, WADE) : r.pace) : aboard && r.pose === 'walk' ? DECK : 0);
    h.group.visible = r.shown > 0.01;
  };
  /** Ashore in the shallows: the feet below the sea's surface. */
  const wet = (r: Rider) => r.side !== 'bord' && groundY(r.x, r.z) < S.seaY - 0.01;

  /** One walking step along the rider's path (a halt to put on or take off the life jacket where the path says); true once at its end. */
  const step = (r: Rider, dt: number): boolean => {
    if (r.delay > 0) { r.delay -= dt; return false; }
    if (r.dress > 0) {
      const was = r.dress; r.dress -= dt;
      if (was > VEST_S / 2 && r.dress <= VEST_S / 2) { r.vest = r.dressTo; log(r, r.vest ? 'vest-on' : 'vest-off'); }
      return false;
    }
    const to = r.path[0];
    if (!to) { r.yaw = r.endYaw; return true; }
    const dx = to.x - r.x, dz = to.z - r.z, d = Math.hypot(dx, dz), v = Math.min(d, (wet(r) ? Math.min(r.pace, WADE) : r.pace) * dt);
    if (d > 1e-3) { r.x += (dx / d) * v; r.z += (dz / d) * v; r.yaw = r.yaw + wrap(Math.atan2(dx, dz) - r.yaw) * Math.min(1, dt * 8); }
    r.walked += v;
    if (d - v < 0.06) {
      r.path.shift();
      if (to.act && (to.act === 'on') !== r.vest) { r.dress = VEST_S; r.dressTo = to.act === 'on'; }
    }
    return false;
  };

  // ---------------------------------------------------------------- over the gunwale (in the boat's frame)
  /** The floorboards' height under a point of the hull, from a seat's: they rise toward the bow (−z), where the step is. */
  const floorAt = (s: LocalSeat, z: number) => s.y - 0.45 + Math.max(0, -z - 1.5) * 0.06;
  /** In: from the shallows over the gunwale at the step, down onto the floorboards, aft along them beside the seat, and down onto it. */
  const startBoard = (r: Rider) => {
    const c = r.craft!, s = r.seat!, st = c.m.step, sx = Math.abs(st.x) > 0.05 ? Math.sign(st.x) : 0;
    const from = c.toLocal({ x: r.x, y: groundY(r.x, r.z), z: r.z });
    const inside = new THREE.Vector3(st.x - sx * 0.3, floorAt(s, st.z), sx ? st.z : st.z + 0.4), beside = new THREE.Vector3(s.x * 0.4, floorAt(s, s.z + 0.4), s.z + 0.4);
    const seat = new THREE.Vector3(s.x, s.y - SIT_HIPS, s.z), walk = beside.distanceTo(inside) / DECK;
    r.mv = { from, inside, beside, seat, hop: Math.max(0.25, s.y + 0.35 - Math.max(from.y, inside.y)), ends: [CLIMB_S, CLIMB_S + walk, CLIMB_S + walk + SIT_S], yaw0: Math.atan2(inside.x - from.x, inside.z - from.z), yaw1: Math.atan2(beside.x - inside.x, beside.z - inside.z) };
    log(r, 'board');
    r.side = 'bord'; r.state = 'board'; r.t = 0; r.local = { x: from.x, y: from.y, z: from.z, yaw: r.mv.yaw0 };
  };
  const stepBoard = (r: Rider) => {
    const m = r.mv!, [e1, e2, e3] = m.ends, t = r.t, s = r.seat!;
    if (t < e1) { const u = ease(t / e1); r.pose = u > 0.25 && u < 0.8 ? 'climb' : 'walk'; set(r, m.from, m.inside, u, Math.sin(u * Math.PI) * m.hop, m.yaw0); }
    else if (t < e2) { r.pose = 'walk'; set(r, m.inside, m.beside, (t - e1) / (e2 - e1), 0, m.yaw1); }
    else if (t < e3) { const u = ease((t - e2) / (e3 - e2)); r.pose = 'sit'; set(r, m.beside, m.seat, u, 0, m.yaw1 + wrap(s.yaw - m.yaw1) * u); }
    else { r.local = { x: m.seat.x, y: m.seat.y, z: m.seat.z, yaw: s.yaw }; r.state = 'seated'; r.pose = 'sit'; log(r, 'seated'); }
  };
  const set = (r: Rider, a: THREE.Vector3, b: THREE.Vector3, u: number, lift: number, yaw: number) => { r.local = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) + lift, z: lerp(a.z, b.z, u), yaw }; };
  /** Out: up from the seat, forward along the floorboards to the step, over the gunwale down into the shallows; then wading to the sand and away. */
  const startAlight = (r: Rider, p: Pose, onward: Pt[]) => {
    const c = r.craft!, s = r.seat!, st = c.m.step, sx = Math.abs(st.x) > 0.05 ? Math.sign(st.x) : 0, w = c.stand(p);
    const to = c.toLocal({ x: w.x, y: groundY(w.x, w.z), z: w.z });
    const inside = new THREE.Vector3(st.x - sx * 0.3, floorAt(s, st.z), sx ? st.z : st.z + 0.4), beside = new THREE.Vector3(s.x * 0.4, floorAt(s, s.z + 0.4), s.z + 0.4);
    const seat = new THREE.Vector3(r.local.x, r.local.y, r.local.z), walk = beside.distanceTo(inside) / DECK;
    r.mv = { from: seat, inside, beside, seat: to, hop: Math.max(0.25, s.y + 0.35 - Math.max(to.y, inside.y)), ends: [SIT_S, SIT_S + walk, SIT_S + walk + CLIMB_S], yaw0: Math.atan2(inside.x - beside.x, inside.z - beside.z), yaw1: Math.atan2(to.x - inside.x, to.z - inside.z) };
    r.onward = onward; r.state = 'alight'; r.t = 0;
  };
  const stepAlight = (r: Rider) => {
    const m = r.mv!, [e1, e2, e3] = m.ends, t = r.t, c = r.craft!;
    if (t < e1) { const u = ease(t / e1); r.pose = u < 0.6 ? 'sit' : 'stand'; set(r, m.from, m.beside, u, 0, r.local.yaw + wrap(m.yaw0 - r.local.yaw) * u); }
    else if (t < e2) { r.pose = 'walk'; set(r, m.beside, m.inside, (t - e1) / (e2 - e1), 0, m.yaw0); }
    else if (t < e3) { const u = ease((t - e2) / (e3 - e2)); r.pose = u > 0.2 && u < 0.75 ? 'climb' : 'walk'; set(r, m.inside, m.seat, u, Math.sin(u * Math.PI) * m.hop, m.yaw1); }
    else {
      // in the shallows: a passer-by wading to the sand now, on foot in the world
      const w = c.world({ x: m.seat.x, y: m.seat.y, z: m.seat.z });
      r.side = w.z < ISLAND_Z ? 'ile' : 'quai'; r.x = w.x; r.z = w.z; r.yaw = r.local.yaw + c.yaw; r.craft = null; r.seat = null; r.pose = 'stand';
      log(r, 'alight');
      r.state = 'leave'; r.walked = 0; r.unseen = 0; walkTo(r, r.onward, 'gone', r.yaw, AWAY);
    }
  };
  /** Off at this beach, after wading: the life jacket off on the first dry sand (the j-th off a little further out, side by side), then up the beach (the island: among the parasols, to the restaurants). */
  const wayOff = (c: Craft, p: Pose, j: number): Pt[] => {
    const up = bowDir(p.yaw), sand: Pt = { ...add(dryFrom(c.stand(p), up, 0.7 + 0.25 * (j % 2)), c.outward(p), 0.4 + 0.6 * j), act: 'off' };
    return p.z < ISLAND_Z ? [sand, ...S.island.path.slice(1)] : [sand, { x: lerp(sand.x, MID.x, 0.4), z: -149 }, MID, UP];
  };

  const updateRiders = (dt: number) => {
    const now = clock, view = ctx.camera;
    view.updateMatrixWorld(); frustum.setFromProjectionMatrix(pm.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
    made = 0;
    const tr = trip;
    // the stop's customers off one at a time, from the bow aft (none climbs past another)
    const landing = tr && tr.craft.arrived && (tr.stage === 'land' || tr.stage === 'landBack') ? (tr.stage === 'land' ? tr.outR : tr.backR) : null;
    const nextOff = landing?.filter(r => r.state === 'seated').sort((a, b) => a.seat!.z - b.seat!.z)[0] ?? null;
    for (const r of riders) {
      r.t += dt;
      switch (r.state) {
        case 'come': if (r.delay > 0) { r.delay -= dt; break; } r.alpha = 1; if (step(r, dt)) r.state = 'wait'; break;
        case 'walk': r.alpha = 1; if (step(r, dt)) r.state = r.then; break;
        case 'queue': {
          if (!tr || r.craft !== tr.craft || !r.craft.arrived) break;
          const p = tr.stage === 'boardBack' ? r.craft.isle : r.craft.home, st = r.craft.stand(p);
          if (tr.next === r.q && now >= tr.stepFree) {
            // its turn: up to the step (from the line's first place, while the one before climbs in), then in
            tr.next++; tr.stepFree = now + CLIMB_S + 0.15 + Math.max(0, dist(r, st) - 1) / WADE;
            r.state = 'toStep'; walkTo(r, [st], 'board', Math.atan2(st.x - r.x, st.z - r.z), WADE);
          } else {
            // the line moves up as each one goes to the step
            const to = queueAt(r.craft, p, Math.max(1, r.q - tr.next + 1));
            if (dist(r, to) > 0.08) { r.path = [to]; r.pace = WADE; step(r, dt); r.yaw += wrap(Math.atan2(st.x - r.x, st.z - r.z) - r.yaw) * Math.min(1, dt * 4); }
          }
          break;
        }
        case 'toStep': if (step(r, dt)) startBoard(r); break;
        case 'board': stepBoard(r); break;
        case 'seated':
          if (r === nextOff && tr && now >= tr.stepFree) {
            const p = tr.stage === 'land' ? tr.craft.isle : tr.craft.home;
            startAlight(r, p, wayOff(tr.craft, p, landing!.filter(x => x.state !== 'seated').length));
            tr.stepFree = now + SIT_S + 1;                                     // the next stands up as this one goes forward: aft of it, it reaches the step after this one is over
          }
          break;
        case 'alight': stepAlight(r); break;
        case 'leave': {
          const end = step(r, dt);
          const p = wpos(r), cd = Math.hypot(p.x - view.position.x, p.z - view.position.z);
          r.unseen = frustum.containsPoint(V.set(p.x, 1, p.z)) ? 0 : r.unseen + dt;
          if (!r.vest && r.dress <= 0 && r.walked > 6 && (cd > 24 || r.unseen > 0.8 || end)) r.alpha = 0;
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
      stageOver.landBack = off(tr.backR) && tr.backR.every(r => !r.vest);          // the last: ashore, jackets off, before the cut to black
    }
  };

  // ---------------------------------------------------------------- the camera: the boarding, the crossing, the landing; the player's drag turns it
  let snap = false;
  const cam = { on: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, pitch: 0, idle: 0, chase: 0 };
  const W1 = new THREE.Vector3(), W2 = new THREE.Vector3();
  /**
   * The boarding (the owner's photo of Ngor's beach): from up the sand behind the bow, a little to the step's side, down the length of the boat run up
   * on the sand, the customers coming down past the camera and wading out alongside it, the sea and the island beyond (a phone held upright: the
   * boat lengthwise in the picture).
   */
  const boardView = (c: Craft) => {
    const h = c.home, st = c.stand(h), up = bowDir(h.yaw), side = Math.sign((st.x - h.x) * up.z - (st.z - h.z) * up.x) || 1, across = { x: up.z * side, z: -up.x * side };
    const tip = add(h, up, c.m.length / 2);
    W1.set(tip.x + up.x * 7 + across.x * 2.6, 5.2, tip.z + up.z * 7 + across.z * 2.6);
    W2.set(h.x - up.x * 1.5 + across.x * 0.9, 0.3, h.z - up.z * 1.5 + across.z * 0.9);
    return { pos: W1, look: W2 };
  };
  /** Arriving (the owner's photo from a pirogue coming in to the island): from behind the helm, over the seated heads and the bow, at the beach ahead. */
  const bowView = (c: Craft) => {
    // over the helm, port of the motor, the stern post behind; high enough that the seated heads sit low in the picture and the beach, its parasols
    // and the island's rooftop restaurant fill it (as in the photo)
    const s = Math.sin(c.yaw), k = Math.cos(c.yaw), back = c.m.length / 2 - 0.4, ahead = c.m.length / 2 + 22, side = -0.55;
    W1.set(c.x + side * k + back * s, S.seaY + 3.2, c.z - side * s + back * k);
    W2.set(c.x - ahead * s, 1.9, c.z - ahead * k);
    return { pos: W1, look: W2 };
  };
  const viewWanted = (dt: number): { pos: THREE.Vector3; look: THREE.Vector3 } => {
    const tr = trip, st = tr?.stage, c = tr?.craft ?? crafts[inUse];
    cam.chase += wrap(c.yaw - cam.chase) * Math.min(1, dt * 1.4);
    if (!tr || st === 'start' || st === 'helm' || st === 'board') return boardView(c);
    if (st === 'land' || st === 'boardBack' || st === 'landBack') return bowView(c);
    const w = c.way;
    if (w && st === 'out' && c.s < w.backLen + 10) return boardView(c);                 // pushed off: watched from the beach
    if (w && (st === 'back' && c.s < w.backLen + 2 || w.len - c.s < 36)) return bowView(c);   // off the island's beach; and coming in to a beach
    // under way: behind the boat, a little to one side, the boat low in the picture and where it goes ahead; the view swings round the turns slowly
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
    if (!trip && !ending && onHelm()) setDown(false);                    // seated at a helm with no crossing (a debug sit): back on the sand
    for (const k of BOAT_KINDS) crafts[k].update(dt);
    if (!trip) refill(false, dt);
    else if (trip.stage === 'out' || trip.stage === 'land' || trip.stage === 'boardBack' || trip.stage === 'back') refill(false, dt);   // the next crossing's customers come while this one is away
    updateRiders(dt);
  };

  return {
    id, type: 'traversee', name: place.name, places: [place], update,
    camera, active: () => !!trip || !!ending,
    /** A save mid-crossing resumes on the sand at the anchor (the boat and the island are beyond the hub's bounds). */
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
      const who = (r: Rider) => {
        const p = wpos(r);
        return { id: r.id, state: r.state, seated: r.state === 'seated', side: r.side, x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(3), wading: r.side !== 'bord' && p.y < S.seaY - 0.01, vest: r.vest, vestShown: !!r.h?.vestOn, drawn: !!r.h && r.shown > 0.5, leg: legOf(r) };
      };
      return {
        phase: tr?.stage ?? (ending ? 'ending' : 'idle'), boat: tr?.kind ?? inUse, pose: c.pose(), boats: Object.fromEntries(BOAT_KINDS.map(k => [k, crafts[k].pose()])),
        poses: Object.fromEntries(BOAT_KINDS.map(k => [k, { home: crafts[k].home, isle: crafts[k].isle, stand: crafts[k].stand(crafts[k].home), out: +crafts[k].out.len.toFixed(1), back: +crafts[k].back.len.toFixed(1) }])),
        helm: { id: c.seat.id, locked: !!c.seat.locked, seated: ctx.player.seated()?.id === c.seat.id },
        plan: tr ? tr.plan : planNow('pirogue'), customers: riders.map(who), bodies: riders.filter(r => r.h).length, events: events.map(e => ({ ...e })),
        paid: paidLog.map(p => ({ ...p })), counters: { traversees: counter(ctx, C.trips), traversees_pirogue: counter(ctx, C.of('pirogue')), traversees_chaloupe: counter(ctx, C.of('chaloupe')), passagers_ngor: counter(ctx, C.passengers) },
        closed: { pirogue: why('pirogue'), chaloupe: why('chaloupe') }, wallet: ctx.state.wallet, anchor: S.anchor, landing: LANDING, seaY: S.seaY,
        camera: cam.on ? { pos: cam.pos.toArray().map(v => +v.toFixed(1)), look: cam.look.toArray().map(v => +v.toFixed(1)) } : null,
      };
    },
    /** Checks: the pirogue round trips Ousmane has seen (the chaloupe opens at 3). */
    setPirogueTrips: (n: number) => { ctx.state.data.counters[R.TRAV_COUNTERS.of('pirogue')] = n; return n; },
  };
}
