import { TRAVERSEE_SITE } from '../sea/traverseeSite';
import { defaultLook, hashId, lookRng, nightLook, type CrowdLook } from '../crowd/looks';
import { rng } from '../core/rng';

/**
 * The life of the island's rooftop restaurant and lounge bar (docs/TRAVERSEE.md, « The island's rooftop restaurant and lounge bar »; its poses in
 * src/sea/traverseeSite.ts `TRAVERSEE_SITE.island.rooftop`): who is up on the roof terrace for a game day and an hour, and how loud its music is.
 * Pure and deterministic: the same day and hour give the same people, the same looks and the same music for every player (no clock, no random).
 *
 *  - Hours: open 11 h – 1 h; from 1 h to 11 h nobody is there and the music is off. Its night runs past midnight: 0 h – 1 h belongs to the day before.
 *  - Lunch (12–15 h): 5–9 diners and the barman. Afternoon (15–18 h): a few at the lounge and the bar, a late table. Evening (18–23 h): the tables
 *    nearly full, the lounge full, 2–4 at the bar, the DJ from 19 h, 2–4 dancers in front of the booth from 20 h. Late (23–1 h): the lounge, the bar
 *    and the dancers, fewer diners. The hour before lunch (11–12 h): the barman, a table or two of early customers.
 *  - Counts move by the half hour, at most a couple of people at a time; the seats fill in an order set by the day (the dining tables by the pair
 *    across a table, so people come as couples and tables of four).
 *  - Looks: a customer's from the day, the seat and the sitting (lunch's people are not dinner's: src/crowd/looks.ts defaultLook by day, nightLook at
 *    night); the barman in his white shirt (two who take turns), the DJ one of the week's residents.
 */
const R = TRAVERSEE_SITE.island.rooftop;

export type RooftopRole = 'dining' | 'lounge' | 'bar' | 'barman' | 'dj' | 'dance';
export const ROOFTOP_ROLES: readonly RooftopRole[] = ['dining', 'lounge', 'bar', 'barman', 'dj', 'dance'];
export type RooftopPeriod = 'closed' | 'opening' | 'lunch' | 'afternoon' | 'evening' | 'late';
/** Lunch and the afternoon are the day's customers, the evening and late night the night's. */
export type RooftopSitting = 'day' | 'night';

/** Opening hours (city time): from 11 h to 1 h the next night. */
export const ROOFTOP_HOURS: readonly [number, number] = [11, 1];
/** The DJ plays from this hour, and the dancers come from this one (to closing). */
export const DJ_FROM = 19, DANCE_FROM = 20;
/**
 * The sitting surface above the roof terrace's floor (m): a dining chair and a lounge sofa, both at the crowd's usual seated height (src/interact/seats.ts
 * SIT_HIPS: the seated figure's feet then rest on the floor). The furniture's seats (src/world/ngor.ts) belong at this height.
 */
export const ROOFTOP_SEAT = { dining: 0.48, lounge: 0.48 } as const;
/** The music's tempo (La Vague's track, src/venues/vagueTrack.ts: the DJ and the dancers move on it). */
export const ROOFTOP_BPM = 120;

const wrap24 = (h: number) => ((h % 24) + 24) % 24;
export const rooftopOpen = (hour: number) => { const h = wrap24(hour); return h >= ROOFTOP_HOURS[0] || h < ROOFTOP_HOURS[1]; };
export function rooftopPeriod(hour: number): RooftopPeriod {
  const h = wrap24(hour);
  if (!rooftopOpen(h)) return 'closed';
  if (h < 1 || h >= 23) return 'late';
  if (h < 12) return 'opening';
  if (h < 15) return 'lunch';
  if (h < 18) return 'afternoon';
  return 'evening';
}
export const rooftopSitting = (p: RooftopPeriod): RooftopSitting | null => p === 'closed' ? null : p === 'evening' || p === 'late' ? 'night' : 'day';
/** The rooftop's own day: its night runs past midnight, so 0 h – 11 h belong to the day before (the club's way: src/activity/templates.ts clubNight). */
export const rooftopDay = (day: number, hour: number) => Math.floor(day) - (wrap24(hour) < ROOFTOP_HOURS[0] ? 1 : 0);
/** The DJ plays now. */
export const djPlays = (hour: number) => { const p = rooftopPeriod(hour); return p === 'late' || (p === 'evening' && wrap24(hour) >= DJ_FROM); };

type Counted = 'dining' | 'lounge' | 'bar' | 'dance';
/** How many of each, by period (inclusive): the customers. The barman is there whenever it is open, the DJ from 19 h. */
export const ROOFTOP_COUNTS: Record<Exclude<RooftopPeriod, 'closed'>, Record<Counted, readonly [number, number]>> = {
  opening: { dining: [0, 2], lounge: [0, 2], bar: [0, 0], dance: [0, 0] },
  lunch: { dining: [5, 9], lounge: [0, 0], bar: [0, 0], dance: [0, 0] },
  afternoon: { dining: [0, 3], lounge: [2, 4], bar: [1, 3], dance: [0, 0] },
  evening: { dining: [10, 12], lounge: [5, 5], bar: [2, 4], dance: [2, 4] },
  late: { dining: [2, 6], lounge: [3, 5], bar: [2, 4], dance: [2, 4] },
};

export interface RooftopPose { x: number; z: number; yaw: number }
/** Every place on the roof by role, in the contract's order (an index is the pose's index there); the dancers face the DJ's booth. */
export function rooftopPoses(): Record<RooftopRole, RooftopPose[]> {
  const face = (p: { x: number; z: number }) => Math.atan2(R.dj.x - p.x, R.dj.z - p.z);
  return {
    dining: R.dining.map(p => ({ x: p.x, z: p.z, yaw: p.yaw })),
    lounge: R.lounge.map(p => ({ x: p.x, z: p.z, yaw: p.yaw })),
    bar: R.bar.map(p => ({ x: p.x, z: p.z, yaw: p.yaw })),
    barman: [{ x: R.barman.x, z: R.barman.z, yaw: R.barman.yaw }],
    dj: [{ x: R.dj.x, z: R.dj.z, yaw: R.dj.yaw }],
    dance: R.dance.map(p => ({ x: p.x, z: p.z, yaw: face(p) })),
  };
}
const POSES = rooftopPoses();
/** Seated roles (on a chair or a sofa); the others stand. */
export const seatedRole = (r: RooftopRole) => r === 'dining' || r === 'lounge';
/** A slot's id (the crowd's): the role and the index of its pose. */
export const rooftopId = (role: RooftopRole, i: number) => `rooftop:${role}:${i}`;

/** 0 … n−1 from a string, stable. */
const seeded = (s: string, n: number) => (n <= 1 ? 0 : hashId(s) % n);
function shuffle<T>(a: T[], seed: string): T[] {
  const r = rng(hashId(seed) || 1), out = a.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/**
 * The order the seats of a role fill in for a sitting (pose indices): the dining tables by the pair facing each other across a table (so two come
 * together and a table of four is two pairs), the others one by one.
 */
export function fillOrder(role: RooftopRole, day: number, sitting: RooftopSitting): number[] {
  const seed = `rooftop:order:${role}:${day}:${sitting}`;
  if (role === 'dining') {
    const pairs: [number, number][] = [];
    for (let t = 0; t < R.dining.length / 4; t++) pairs.push([4 * t, 4 * t + 2], [4 * t + 1, 4 * t + 3]);
    return shuffle(pairs, seed).flat();
  }
  return shuffle(POSES[role].map((_, i) => i), seed);
}

/** How many customers of a role at this hour of the rooftop's day `day`: the period's range, moving by the half hour. */
export function roleCount(role: Counted, day: number, hour: number): number {
  const p = rooftopPeriod(hour); if (p === 'closed') return 0;
  const h = wrap24(hour);
  if (role === 'dance' && p === 'evening' && h < DANCE_FROM) return 0;
  const [lo, hi] = ROOFTOP_COUNTS[p][role]; if (hi <= lo) return lo;
  const base = lo + seeded(`rooftop:n:${day}:${p}:${role}`, hi - lo + 1);
  const slot = Math.floor((h < ROOFTOP_HOURS[0] ? h + 24 : h) * 2);           // the half hour (after midnight counts on from 24 h)
  return Math.max(lo, Math.min(hi, base + seeded(`rooftop:d:${day}:${slot}:${role}`, 3) - 1));
}

/** The barman's uniform: a white shirt and black trousers (two barmen take turns, day by day). */
function barmanLook(day: number): CrowdLook {
  const b = defaultLook(lookRng(`rooftop:barman:${((day % 2) + 2) % 2}`));
  return { ...b, style: 'tee', shirt: 0xf2f2ec, legs: 0x1c1c1f, wrap: null, head: b.head === 'wrap' || b.head === 'kufi' ? 'hair' : b.head, print: 0, accent: 0, child: false };
}
/** Who sits or stands at a role's pose `i` on the rooftop's day `day` and sitting: the same person for everyone. */
export function rooftopLook(role: RooftopRole, i: number, day: number, sitting: RooftopSitting): CrowdLook {
  if (role === 'barman') return barmanLook(day);
  if (role === 'dj') return nightLook('rooftop:dj', ((day % 7) + 7) % 7);   // the week's residents
  const id = rooftopId(role, i);
  return sitting === 'night' ? nightLook(id, day) : defaultLook(lookRng(`${id}:jour:${day}`));
}

export interface RooftopPerson extends RooftopPose { id: string; role: RooftopRole; i: number; seated: boolean; look: CrowdLook }
export type RooftopCounts = Record<RooftopRole, number>;
export interface RooftopPlan {
  open: boolean; period: RooftopPeriod; sitting: RooftopSitting | null;
  /** The rooftop's day (its night runs past midnight). */
  day: number;
  dj: boolean;
  counts: RooftopCounts;
  people: RooftopPerson[];
}
/** Who is on the roof for the city's day `day` and hour `hour`: each at a pose of the contract, none twice. */
export function rooftopPlan(day: number, hour: number): RooftopPlan {
  const period = rooftopPeriod(hour), sitting = rooftopSitting(period), d = rooftopDay(day, hour), dj = djPlays(hour);
  const counts: RooftopCounts = { dining: 0, lounge: 0, bar: 0, barman: 0, dj: 0, dance: 0 };
  const people: RooftopPerson[] = [];
  if (!sitting) return { open: false, period, sitting, day: d, dj: false, counts, people };
  const add = (role: RooftopRole, idx: readonly number[]) => {
    for (const i of idx) {
      const p = POSES[role][i];
      people.push({ id: rooftopId(role, i), role, i, x: p.x, z: p.z, yaw: p.yaw, seated: seatedRole(role), look: rooftopLook(role, i, d, sitting) });
    }
    counts[role] = idx.length;
  };
  for (const role of ['dining', 'lounge', 'bar', 'dance'] as const) add(role, fillOrder(role, d, sitting).slice(0, roleCount(role, d, hour)));
  add('barman', [0]);
  add('dj', dj ? [0] : []);
  return { open: true, period, sitting, day: d, dj, counts, people };
}

// ------------------------------------------------------------------ where the roof is
/** The roof terrace's box centre (the building stands level at ngorGroundY there; the terrace's floor is `roofY` above it). */
export const ROOF_CENTRE = { x: (R.box.x0 + R.box.x1) / 2, z: (R.box.z0 + R.box.z1) / 2 } as const;
/** From a listener at (x, y, z) to the nearest point of the roof terrace, at a standing person's ear (1.5 m over its floor at `floorY`). */
export function roofDistance(p: { x: number; y: number; z: number }, floorY: number): number {
  const b = R.box, dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1);
  return Math.hypot(dx, p.y - (floorY + 1.5), dz);
}

// ------------------------------------------------------------------ the music
/** Full within this distance of the roof (m), silent beyond the other: heard from the boat at the island, never on the mainland's beach (~170 m). */
export const MUSIC_FULL = 40, MUSIC_SILENT = 110;
/** The fade to silence starts here (m): beyond `MUSIC_FULL` the music falls off as 1/distance, and from here it also fades out by `MUSIC_SILENT`. */
const FADE_FROM = 70;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The music's gain with the distance to the roof (m): 1 within 40 m, then falling, 0 from 110 m. */
export function musicFalloff(d: number): number {
  if (d <= MUSIC_FULL) return 1;
  if (d >= MUSIC_SILENT) return 0;
  return (MUSIC_FULL / d) * (1 - smooth(FADE_FROM, MUSIC_SILENT, d));
}
/**
 * How loud the rooftop plays at this hour, on La Vague's scale (1: its dance floor; src/venues/vagueMusic.ts): soft by day, louder in the evening,
 * loudest once the DJ plays, and always well under a club's floor (it is heard from the boat). 0 closed.
 */
export function musicLevel(hour: number): number {
  switch (rooftopPeriod(hour)) {
    case 'closed': return 0;
    case 'opening': return 0.25;
    case 'lunch': return 0.3;
    case 'afternoon': return 0.32;
    case 'evening': return djPlays(hour) ? 0.55 : 0.42;
    case 'late': return 0.58;
  }
}
/**
 * The music heard `d` metres from the roof at this hour: its gain (0…1, before the sound setting and the first gesture) and how muffled it is (0 clear …
 * 1: the low-pass of src/venues/vagueMusic.ts). By day a lounge sound, the drums and the highs rolled off; once the DJ plays, the beat comes out
 * clear. A little more muffled with the distance.
 */
export function rooftopMusic(hour: number, d: number): { gain: number; level: number; falloff: number; muffle: number } {
  const level = musicLevel(hour), falloff = musicFalloff(d), gain = level * falloff;
  const muffle = gain > 0 ? Math.min(0.85, (djPlays(hour) ? 0.12 : 0.42) + Math.max(0, Math.min(0.3, (d - 30) / 200))) : 0;
  return { gain, level, falloff, muffle };
}
