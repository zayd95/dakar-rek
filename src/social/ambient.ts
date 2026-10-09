/**
 * Ambient city life — the scheduler (docs/NPC_LIFE.md). Pure module: no Three.js, unit-tested (tests/ambient.test.ts).
 *
 * The city is a set of SPOTS (a gargote's benches, a bus stop, a mosque forecourt, a stall, the Corniche promenade, a
 * street corner…) built from the shared registries (places, seats) and the hub's own geometry (ambientSpots.ts). An
 * ACTIVITY is data (ambientData.ts): where it happens (spot tags), when (hours, days), the pose and clip, how long people
 * stay, how many come together and how many a spot holds at the peak. This module answers « how many people should be
 * doing what, where, right now » and picks seats with the shared rules: never a taken seat, never the player's, and
 * always some seats left free for players at every place.
 */
import type { Clip } from '../actors/humanoid';

/** How the body is placed: on a seat, on a standing slot, in a prayer row, moving along a route, or roaming an area. */
export type AmbientPose = 'sit' | 'stand' | 'row' | 'route' | 'roam';
/** Clothing family picked for the person (runtime builds the look). */
export type LookKind = 'any' | 'sport' | 'fisher' | 'vendor' | 'prayer' | 'elder' | 'student';

export interface AmbientActivity {
  id: string;
  /** French description (debug panel, docs). */
  label: string;
  /** Spot tags where it happens (any of them). */
  at: readonly string[];
  /** City hour windows [from, to); a window may pass midnight ([19, 2]). */
  hours: readonly (readonly [number, number])[];
  /** Days of the week (0 = lundi … 6 = dimanche); absent = every day. */
  days?: readonly number[];
  /** Multiplier on some days (Friday prayer, Saturday night at the Dibi, Sunday at the beach). */
  dayBoost?: Readonly<Record<number, number>>;
  pose: AmbientPose;
  /** Clips picked per person (repeat one to weight it). Seated people always use Sit. */
  clips: readonly Clip[];
  /** Real seconds a person stays (1 real second ≈ 1 city minute). */
  stay: readonly [number, number];
  /** People arriving together (a pair chatting, a family at the beach). */
  group?: readonly [number, number];
  /** People per spot at the peak (before the quality scale and the spot's weight). */
  density: number;
  /** Optional shape over the day: [hour, factor] points, linearly interpolated inside the windows. */
  curve?: readonly (readonly [number, number])[];
  look?: LookKind;
  /** Only while the spot's place is open (PlaceSpec hours, or the legacy place's hours). */
  open?: boolean;
  /** Seat kinds used by 'sit' and 'row' (default: every kind except vehicle seats). */
  seatKinds?: readonly string[];
  /** Share of a spot's seats left free for players (default KEEP_FREE; at least one seat stays free). */
  keepFree?: number;
  /** Walking/running speed along a route (m/s). */
  speed?: readonly [number, number];
  /** People leave by boarding the next vehicle (stops). */
  board?: boolean;
  /** Small prop drawn while doing it (a plate on the table). */
  prop?: 'plate';
  /** Seconds waiting at the counter to be served before sitting down (customers: arrive, wait, get served, eat, leave). */
  serve?: readonly [number, number];
}

export interface StandSlot { x: number; z: number; yaw: number }
export interface Pt { x: number; z: number }

export interface AmbientSpot {
  id: string;
  /** Tags matched by activities: 'eat', 'dibi', 'cafe', 'stop', 'mosque', 'square', 'bench', 'corner', 'promenade'… */
  tags: readonly string[];
  /** 'street' or an interior / venue / vehicle space. */
  space: string;
  x: number; z: number;
  /** Seat ids of the shared Seats registry usable here. */
  seats: readonly string[];
  /** Standing places (yaw = where the person looks). */
  stands: readonly StandSlot[];
  /** Prayer rows (standing, facing the qibla) when the place has no prayer seats. */
  rows?: readonly StandSlot[];
  /** Back-and-forth path for 'route' activities (promenade, beach). */
  route?: readonly Pt[];
  /** Rectangle for 'roam' activities (a football pitch): x0, z0, x1, z1. */
  area?: readonly [number, number, number, number];
  /** Opening hours of the place [open, close) (absent = always open). */
  hours?: readonly [number, number];
  /** Busy windows of a registered place (`PlaceSpec.peaks`: lunch and evening at a Dibi, prayer times): more people. */
  peaks?: readonly (readonly [number, number])[];
  /** Density multiplier of this spot (a big market vs a single bench). */
  weight?: number;
  /** Distance multiplier when the population cap is shared (generic corners and benches > 1: places come first). */
  prio?: number;
  /** Where people board (legacy stations: the car rapide door). */
  boardAt?: Pt;
  /** Small props per seat (plate on the table in front of the sitter). */
  seatProps?: Readonly<Record<string, { x: number; y: number; z: number }>>;
  /** Where to step before sitting when the front of the seat is a table (kiosk benches: from behind). */
  seatApproach?: Readonly<Record<string, Pt>>;
  /** PlaceSpec id when the spot comes from the Places registry. */
  place?: string;
  /** Where the spot comes from (debug). */
  source: 'place' | 'legacy' | 'seats' | 'special' | 'sea' | 'corner' | 'interior';
}

/** Default share of the seats of a place that ambient people leave free for players. */
export const KEEP_FREE = 0.34;
export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

/** City day 1 is Tuesday 6 October 2026 (core/clock.ts CITY_EPOCH_MS): 0 = lundi … 6 = dimanche. */
export const dayOfWeek = (day: number) => ((Math.floor(day) % 7) + 7) % 7;

export const inHours = (h: number, w: readonly [number, number]) => {
  const x = ((h % 24) + 24) % 24;
  return w[0] <= w[1] ? x >= w[0] && x < w[1] : x >= w[0] || x < w[1];
};
const winLen = (w: readonly [number, number]) => (w[1] - w[0] + 24) % 24 || 24;
/** Hours since the window opened (0 … length). */
const sinceOpen = (h: number, w: readonly [number, number]) => (((h - w[0]) % 24) + 24) % 24;

/**
 * How busy an activity is at this hour and day, 0 … ~2: 0 outside its windows or days; inside a window it ramps up over
 * the first sixth and down over the last sixth (people arrive and leave over time), times the curve and the day boost.
 */
export function activityLevel(a: AmbientActivity, hour: number, dow: number): number {
  if (a.days && !a.days.includes(dow)) return 0;
  const w = a.hours.find(x => inHours(hour, x));
  if (!w) return 0;
  const len = winLen(w), t = sinceOpen(hour, w), edge = Math.min(len / 6, 0.75);
  let k = Math.min(1, 0.35 + 0.65 * Math.min(t, len - t) / Math.max(edge, 1e-6));
  if (a.curve?.length) k *= curveAt(a.curve, hour);
  return k * (a.dayBoost?.[dow] ?? 1);
}

/** Piecewise-linear factor at an hour (points sorted by hour; flat before the first and after the last). */
export function curveAt(pts: readonly (readonly [number, number])[], hour: number): number {
  // a curve may pass midnight ([…, [23, 0.6], [1, 0.25]]): unwrap its hours, and the query hour with them
  let prev = -Infinity, wrap = 0;
  const hs = pts.map(([h]) => { if (h + wrap < prev) wrap += 24; prev = h + wrap; return prev; });
  let h = hour; if (h < hs[0] && h + 24 <= hs[hs.length - 1]) h += 24;
  if (h <= hs[0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (h <= hs[i]) { const v0 = pts[i - 1][1], v1 = pts[i][1]; return v0 + (v1 - v0) * (h - hs[i - 1]) / Math.max(hs[i] - hs[i - 1], 1e-6); }
  }
  return pts[pts.length - 1][1];
}

export const spotOpen = (s: Pick<AmbientSpot, 'hours'>, hour: number) => !s.hours || inHours(hour, s.hours);

// ------------------------------------------------------------------ seats
/** The parts of a shared Seat the scheduler reads (interact/seats.ts). */
export interface SeatLike { id: string; x: number; z: number; top: number; yaw: number; kind: string; space: string; occupant: string | null }
/**
 * Seats taken by non-player characters: placed people ('npc'), the cast ('npc:cast:…'), ambient people ('npc:amb:…'),
 * venue roles ('<venue>:<role>'), transport passengers… — anyone but the player and remote players ('remote:…').
 */
export const isNpcOccupant = (o: string | null) => !!o && o !== 'player' && !o.startsWith('remote');
const VEHICLE = 'vehicle';
/** Seat kinds people stand on instead of sitting (prayer rows, mats on the floor). */
export const STAND_ON = ['prayer', 'mat'];

/** Most seats of a spot non-player characters may hold: always leaves ceil(n × keepFree) seats, and at least one, free. */
export function seatCapacity(n: number, keepFree = KEEP_FREE): number {
  if (n <= 1) return 0;
  return Math.max(0, n - Math.max(1, Math.ceil(n * keepFree)));
}

export const seatKindOk = (kind: string, kinds?: readonly string[]) => kinds ? kinds.includes(kind) : kind !== VEHICLE;

/**
 * A free seat for one more ambient person at a spot, or null. Respects the shared rules: a seat with any occupant is
 * never taken (the player, a remote player, another character); non-player characters together never hold more than
 * seatCapacity() of the spot's seats; `avoid` excludes seats (next to the player, kept for the cast…). `r` (0–1) picks
 * among the candidates, preferring seats next to `near` (a companion already seated) when given.
 */
export function chooseSeat(list: readonly SeatLike[], o: { kinds?: readonly string[]; keepFree?: number; avoid?: (s: SeatLike) => boolean; near?: Pt | null; r: number }): SeatLike | null {
  let n = 0, used = 0;
  for (const s of list) if (seatKindOk(s.kind, o.kinds)) { n++; if (isNpcOccupant(s.occupant)) used++; }
  if (used >= seatCapacity(n, o.keepFree ?? KEEP_FREE)) return null;
  let best: SeatLike | null = null, bestScore = Infinity, count = 0;
  for (const s of list) {
    if (!seatKindOk(s.kind, o.kinds) || s.occupant || o.avoid?.(s)) continue;
    count++;
    // pseudo-random but stable order from r, unless a companion pulls toward the seat next to them
    const jitter = frac(Math.sin((hashStr(s.id) + 1) * (o.r * 97.13 + 1.7)) * 43758.5453);
    const score = o.near ? Math.hypot(s.x - o.near.x, s.z - o.near.z) + jitter * 0.1 : jitter;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  return count ? best : null;
}

const frac = (v: number) => v - Math.floor(v);
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ matching and demand
/** Whether an activity can happen at a spot: shared tag and somewhere to put the body for its pose. */
export function fits(a: AmbientActivity, s: AmbientSpot, seatKind: (id: string) => string | null): boolean {
  if (!a.at.some(t => s.tags.includes(t))) return false;
  switch (a.pose) {
    case 'sit': return s.seats.some(id => { const k = seatKind(id); return k !== null && seatKindOk(k, a.seatKinds) && !STAND_ON.includes(k); });
    case 'stand': return s.stands.length > 0;
    case 'row': return !!s.rows?.length || s.seats.some(id => STAND_ON.includes(seatKind(id) ?? ''));
    case 'route': return (s.route?.length ?? 0) >= 2;
    case 'roam': return !!s.area;
  }
}

/** Places a spot offers for an activity (seats NPCs may hold, standing slots, rows…); routes and areas are open-ended. */
export function capacity(a: AmbientActivity, s: AmbientSpot, seatKind: (id: string) => string | null): number {
  switch (a.pose) {
    case 'sit': return seatCapacity(s.seats.filter(id => { const k = seatKind(id); return k !== null && seatKindOk(k, a.seatKinds) && !STAND_ON.includes(k); }).length, a.keepFree);
    case 'stand': return s.stands.length;
    case 'row': { const seated = s.seats.filter(id => STAND_ON.includes(seatKind(id) ?? '')).length; return seated ? seatCapacity(seated, a.keepFree ?? 0.1) : s.rows?.length ?? 0; }
    default: return 99;
  }
}

/**
 * People wanted for one activity at one spot now: density × spot weight × level × scale, rounded with a stable
 * per-ten-minutes draw (no flicker), and capped by the spot's capacity. Closed places want nobody for `open` activities.
 */
export function wanted(a: AmbientActivity, s: AmbientSpot, hour: number, dow: number, scale: number, cap: number): number {
  if (a.open && !spotOpen(s, hour)) return 0;
  const peak = s.peaks?.length ? (s.peaks.some(w => inHours(hour, w)) ? 1.4 : 0.85) : 1;
  const v = a.density * (s.weight ?? 1) * activityLevel(a, hour, dow) * scale * peak;
  if (v <= 0) return 0;
  const base = Math.floor(v), draw = hashStr(`${s.id}/${a.id}/${Math.floor(hour * 6)}`);
  return Math.min(cap, base + (draw < v - base ? 1 : 0));
}

/** `d`: distance to the player times the spot's priority (the order in which the population cap is shared). */
export interface DemandRow { spot: AmbientSpot; act: AmbientActivity; n: number; d: number }

/**
 * What the city wants right now around the player: for every spot within `far` metres, every fitting activity and its
 * head count, nearest spots first (more life where the player is: spots beyond `near` get half), then trimmed to the
 * population cap so the closest life is always the one that exists.
 */
export function planDemand(spots: readonly AmbientSpot[], acts: readonly AmbientActivity[], o: {
  hour: number; dow: number; scale: number; px: number; pz: number; near: number; far: number; cap: number;
  /** Only spots of this space are planned ('street', or the interior the player is in: all of it counts as near). */
  space: string; seatKind: (id: string) => string | null;
}): DemandRow[] {
  const rows: DemandRow[] = [];
  for (const s of spots) {
    if (s.space !== o.space) continue;
    const d = s.space === 'street' ? Math.hypot(s.x - o.px, s.z - o.pz) : 0;
    if (d > o.far) continue;
    const k = d <= o.near ? 1 : 0.5;
    // activities of one spot share its places: seats, standing places, rows (Friday prayer and daily prayer, chats)
    const used: Record<string, number> = {};
    for (const a of acts) {
      if (!fits(a, s, o.seatKind)) continue;
      const res = a.pose === 'row' ? 'row' : a.pose === 'sit' ? 'sit' : a.pose === 'stand' ? 'stand' : a.id;
      const n = wanted(a, s, o.hour, o.dow, o.scale * k, capacity(a, s, o.seatKind) - (used[res] ?? 0));
      if (n > 0) { rows.push({ spot: s, act: a, n, d: d * (s.prio ?? 1) }); used[res] = (used[res] ?? 0) + n; }
    }
  }
  rows.sort((p, q) => p.d - q.d);
  let left = o.cap;
  for (const r of rows) { const n = Math.min(r.n, left); r.n = n; left -= n; }
  return rows.filter(r => r.n > 0);
}

/** Qibla from Dakar (≈ 58° east of north) as a game yaw: forward = (sin, cos), +x east, −z north. */
export const QIBLA_YAW = Math.atan2(Math.sin(58 * Math.PI / 180), -Math.cos(58 * Math.PI / 180));

/**
 * Standing rows facing the qibla, centred on (x, z): `perRow` people 0.85 m apart, rows 1.25 m behind each other.
 * Used for the forecourt of a mosque without registered prayer seats. Presence and posture only (no recitation).
 */
export function prayerRows(x: number, z: number, rows: number, perRow: number, yaw = QIBLA_YAW): StandSlot[] {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const out: StandSlot[] = [];
  for (let r = 0; r < rows; r++) for (let i = 0; i < perRow; i++) {
    const o = (i - (perRow - 1) / 2) * 0.85, b = (r - (rows - 1) / 2) * 1.25;
    out.push({ x: x + rx * o - fx * b, z: z + rz * o - fz * b, yaw });
  }
  return out;
}

/** `n` standing places on a circle of radius r around (x, z), each looking at the centre (a group around attaya). */
export function ring(x: number, z: number, r: number, n: number, start = 0): StandSlot[] {
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    return { x: px, z: pz, yaw: Math.atan2(x - px, z - pz) };
  });
}

/** Two people facing each other 1.2 m apart (a chat on a corner), oriented by `yaw`. */
export function pair(x: number, z: number, yaw: number): StandSlot[] {
  const dx = Math.sin(yaw) * 0.6, dz = Math.cos(yaw) * 0.6;
  return [{ x: x - dx, z: z - dz, yaw }, { x: x + dx, z: z + dz, yaw: yaw + Math.PI }];
}
