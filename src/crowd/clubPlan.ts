import { rng } from '../core/rng';
import { hashId } from './looks';
import type { CrowdQuality } from './crowd';
import type { ClubCrowd } from '../activity/templates';

/**
 * La Vague's crowd (src/venues/club.ts, docs/CROWD.md): where the club's people are, pure and deterministic per hub
 * and night. Coordinates are the club's local frame (VenueKit: the gate toward +z, the sea toward −z, the deck at
 * `VAGUE.deck`). Facing: 0 looks toward +z.
 *  - the dance floor: a dense crowd on the floor's tiles, the middle first, the player's spot (the « Danser » anchor)
 *    kept clear; on the sabar night after 23 h those near the middle make a ring round the contest;
 *  - people standing at the bar between the stools, at the lounge's rail, round the high table;
 *  - at the peak, a short queue outside the gate: people getting out of a taxi at the Ngor rank walk to its tail, move
 *    up, and go in past the doorman.
 */
export const VAGUE = {
  floor: { x: -3, z: -1.5, w: 8, d: 7 },
  booth: { x: -3, z: -7.5 },
  /** The gate's middle, and where someone who came in disappears onto the terrace. */
  gate: { x: 0, z: 9 }, inside: { x: 0, z: 6.5 },
  deck: 0.12,
} as const;
/** The club's beat (src/venues/club.ts: one beat every 0.485 s, ≈ 124 bpm). */
export const VAGUE_BPM = 60 / 0.485;
/** The club's moments by the hour (src/activity/templates.ts clubCrowd). */
export type ClubMoment = ClubCrowd;

/** How many, by graphics quality: on the floor, full humanoids near the player, standing at the bar, at the rail, queueing. */
export const VAGUE_CROWD: Record<CrowdQuality, { floor: number; near: number; bar: number; rail: number; table: number; queue: number }> = {
  low: { floor: 20, near: 0, bar: 2, rail: 2, table: 2, queue: 3 },
  medium: { floor: 40, near: 3, bar: 3, rail: 3, table: 3, queue: 5 },
  high: { floor: 60, near: 4, bar: 4, rail: 4, table: 3, queue: 7 },
};
/** Share of the floor dancing by the hour (src/activity/templates.ts clubCrowd): empty early, the peak after midnight. */
export const FLOOR_SHARE: Record<ClubMoment, number> = { closed: 0, early: 0.15, warm: 0.55, peak: 1, dawn: 0.35 };
/** Share of the bar, the rail and the high table taken by the hour. */
export const STAND_SHARE: Record<ClubMoment, number> = { closed: 0, early: 0.34, warm: 0.67, peak: 1, dawn: 0.5 };
/** The player's dance spot (the floor's middle, where « Danser » is offered) stays this clear. */
export const CLEAR_R = 1.3;
/** Nobody of the crowd stands closer than this to a player (the local one or a friend): they step aside. */
export const PLAYER_ROOM = 0.75;
/**
 * The ring round the contest: up to four rows round the floor's middle (the inner one fills first). Everyone whose place is
 * within `reach` of the middle joins it, so nobody is left standing inside the ring; the others dance on at the edges.
 */
export const RING = { rows: [{ r: 2.0, n: 12, off: 0 }, { r: 2.75, n: 16, off: 0.5 }, { r: 3.5, n: 22, off: 0 }, { r: 4.25, n: 26, off: 0.5 }], nInner: 12, reach: 4.6 } as const;

export interface Spot { x: number; z: number; yaw: number }
const seededInt = (s: string, n: number) => hashId(s) % n;

/** How many dance at this moment (of `n` on the floor). */
export const floorCount = (m: ClubMoment, n: number) => Math.round(n * FLOOR_SHARE[m]);
export const standCount = (m: ClubMoment, n: number) => Math.round(n * STAND_SHARE[m]);

/**
 * The dancers' places for a night: a jittered grid over the floor's tiles (about 0.8 m apart), the middle first so a
 * thin night still gathers round the DJ, the player's spot clear; most face the booth, some each other.
 */
export function floorSpots(n: number, night: number): Spot[] {
  const F = VAGUE.floor, r = rng((hashId(`vague-floor:${night}`) || 1)), step = 0.8, out: (Spot & { k: number })[] = [];
  for (let x = F.x - F.w / 2 + 0.4; x <= F.x + F.w / 2 - 0.4 + 1e-9; x += step) for (let z = F.z - F.d / 2 + 0.4; z <= F.z + F.d / 2 - 0.4 + 1e-9; z += step) {
    const p = { x: x + (r() - 0.5) * 0.36, z: z + (r() - 0.5) * 0.36 };
    if (Math.hypot(p.x - F.x, p.z - F.z) < CLEAR_R) continue;
    const toBooth = Math.atan2(VAGUE.booth.x - p.x, VAGUE.booth.z - p.z), turn = r() < 0.3 ? (r() - 0.5) * 3 : (r() - 0.5) * 0.9;
    out.push({ ...p, yaw: toBooth + turn, k: Math.hypot(p.x - F.x, (p.z - F.z) * 1.2) + r() * 1.6 });
  }
  return out.sort((a, b) => a.k - b.k).slice(0, n).map(({ x, z, yaw }) => ({ x, z, yaw }));
}

/**
 * The ring round the contest (the floor's middle), row by row from the inside, everyone facing the middle. The outer
 * row keeps to the floor's width (clear of the people at the lounge's edge and the bar side).
 */
export function ringRows(): Spot[][] {
  const F = VAGUE.floor;
  return RING.rows.map(row => {
    const out: Spot[] = [];
    for (let i = 0; i < row.n; i++) {
      const a = ((i + row.off) / row.n) * Math.PI * 2, x = F.x + Math.sin(a) * row.r, z = F.z + Math.cos(a) * row.r;
      if (Math.abs(x - F.x) > F.w / 2 - 0.2) continue;
      out.push({ x, z, yaw: Math.atan2(F.x - x, F.z - z) });
    }
    return out;
  });
}
/** Every place of the ring, the inner row first (its first `RING.nInner` are the inner row's). */
export const ringSpots = (): Spot[] => ringRows().flat();
/**
 * The dancers who make the ring (index in `spots` → ring spot): everyone within `RING.reach` of the middle, the nearest
 * first; each fills the innermost row that still has room, at its free place nearest to them (no two on one).
 */
export function ringPlan(spots: readonly Spot[]): Map<number, number> {
  const F = VAGUE.floor, ring = ringSpots(), out = new Map<number, number>();
  const near = spots.map((s, i) => ({ i, d: Math.hypot(s.x - F.x, s.z - F.z) })).filter(o => o.d < RING.reach).sort((a, b) => a.d - b.d);
  const rows: number[][] = [];
  let k = 0;
  for (const row of ringRows()) { rows.push(row.map((_, j) => k + j)); k += row.length; }
  for (const o of near) {
    const free = rows.find(r => r.length); if (!free) break;
    const s = spots[o.i];
    let best = 0, bd = Infinity;
    free.forEach((j, n) => { const d = Math.hypot(ring[j].x - s.x, ring[j].z - s.z); if (d < bd) { bd = d; best = n; } });
    out.set(o.i, free[best]); free.splice(best, 1);
  }
  return out;
}
/** The sabar night's contest is on: the night's theme holds one, from 23 h to closing. */
export const contestOn = (contest: boolean, hour: number) => contest && (hour >= 23 || hour < 5);
/**
 * The soloist in the middle of the ring (an index in the ring's order, or −1): one of the inner row steps in for a
 * quarter of an hour of the city's clock, in turn, every other quarter.
 */
export function soloAt(night: number, hour: number): number {
  const x = ((hour - 23 + 24) % 24) * 4, k = Math.floor(x);
  return k % 2 === 0 ? seededInt(`solo:${night}:${k}`, RING.nInner) : -1;
}

/**
 * The DJ's drops: in each three-quarters of an hour of the city's clock from 21 h (about 45 s of real time), three in
 * four have one, at a time the night sets. Returns the window's index once its drop has played (the venue reacts when
 * it changes), else −1.
 */
export const DROP_EVERY = 0.75;
export function dropAt(night: number, hour: number): number {
  const x = (hour - 21 + 24) % 24; if (x >= 8) return -1;                 // 21 h – 5 h
  const k = Math.floor(x / DROP_EVERY);
  if (seededInt(`drop:${night}:${k}`, 4) === 0) return -1;
  const at = k * DROP_EVERY + 0.1 + seededInt(`dropat:${night}:${k}`, 5) * 0.1;
  return x >= at ? k : -1;
}

/** Standing at the bar, between the stools, facing the counter. */
export const BAR_SPOTS: readonly Spot[] = [[7.6, -1.8], [7.6, 1.4], [7.6, -3.4], [7.6, -0.2]].map(([x, z]) => ({ x, z, yaw: Math.PI / 2 }));
/**
 * At the lounge's edge by the floor, watching the dancers: between the floor (x −7) and the waiter's way to the tables
 * (he walks from his spot by the gate to x −9, never closer than 0.75 m to them), clear of the benches and their seats.
 */
export const RAIL_SPOTS: readonly Spot[] = [[-7.6, -3.2], [-7.6, -0.4], [-7.6, -5.6], [-7.6, -1.8]].map(([x, z]) => ({ x, z, yaw: Math.PI / 2 }));
/** Round the high table by the bar (the other one has the talkers of src/venues/club.ts). */
export const TABLE_SPOTS: readonly Spot[] = [{ x: 4.0, z: 1.5, yaw: Math.PI / 2 }, { x: 5.2, z: 1.5, yaw: -Math.PI / 2 }, { x: 4.6, z: 2.2, yaw: Math.PI }];

// ------------------------------------------------------------------ the queue outside the gate
/** The queue along the fence, left of the rope (the doorman stands right of it): the head by the rope, facing the gate, clear of the torch. */
export const queueSpot = (j: number): Spot => ({ x: -2.0 - 0.75 * j, z: VAGUE.gate.z + 1.5, yaw: Math.PI / 2 });
/** Seconds between two people let in (the queue moves up one place), and a step's walk. */
export const QUEUE_EVERY = 6, QUEUE_STEP = 0.8, QUEUE_IN = 3, QUEUE_WALK = 1.3;
/** The queue's people: a pool of figures that come round (walking to the tail, in the queue, going in). */
export const queuePool = (q: number) => q + 5;
/** The queue's people now: `t` seconds of the club's clock, `q` places, `from` where they get out of the taxi (local). */
export function queueAt(t: number, q: number, from: { x: number; z: number }): { k: number; x: number; z: number; yaw: number; speed: number }[] {
  if (q <= 0) return [];
  const E = QUEUE_EVERY, pool = queuePool(q), tail = queueSpot(q - 1), walk = Math.hypot(tail.x - from.x, tail.z - from.z) / QUEUE_WALK;
  const out: { k: number; x: number; z: number; yaw: number; speed: number }[] = [];
  const lerp = (a: { x: number; z: number }, b: { x: number; z: number }, f: number) => ({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  const face = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.x - a.x, b.z - a.z);
  const pHi = Math.floor((t + walk) / E), pLo = Math.floor((t - QUEUE_IN) / E) - q;
  for (let p = Math.max(pLo, -q); p <= pHi; p++) {
    const arrive = p * E, start = arrive - walk, enter = arrive + q * E;
    if (t < start || t >= enter + QUEUE_IN) continue;
    const k = ((p % pool) + pool) % pool;
    if (t < arrive) { const f = (t - start) / walk; out.push({ k, ...lerp(from, tail, f), yaw: face(from, tail), speed: QUEUE_WALK }); continue; }
    if (t < enter) {
      const steps = Math.floor((t - arrive) / E), j = q - 1 - steps, into = (t - arrive) - steps * E;
      const a = queueSpot(Math.min(q - 1, j + 1)), b = queueSpot(j);
      if (steps > 0 && into < QUEUE_STEP) out.push({ k, ...lerp(a, b, into / QUEUE_STEP), yaw: Math.PI / 2, speed: 0.94 });
      else out.push({ k, ...b, speed: 0 });
      continue;
    }
    const f = (t - enter) / QUEUE_IN, head = queueSpot(0), gate = VAGUE.gate, inside = VAGUE.inside;
    const p1 = f < 0.5 ? lerp(head, gate, f * 2) : lerp(gate, inside, (f - 0.5) * 2);
    out.push({ k, ...p1, yaw: face(f < 0.5 ? head : gate, f < 0.5 ? gate : inside), speed: 1.2 });
  }
  return out;
}
