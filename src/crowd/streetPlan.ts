import type { HubId } from '../core/types';
import type { Collider, RoadEdge } from '../world/types';
import { curveAt } from '../social/ambient';

/**
 * Street life with reasons (spec 10 Oct, §23 « ajouter des raisons pour lesquelles ils sont là »), as data and pure
 * functions (tested in tests/street.test.ts): how many people walk the pavements, wait at the car rapide stops and chat
 * in front of the shops at each hour, where the busy streets are (Sandaga, the Pikine main street), and which pavement
 * lanes are clear of walls and stalls. The runtime is src/crowd/street.ts.
 */
export type Quality = 'low' | 'medium' | 'high';
type Curve = readonly (readonly [number, number])[];

/** People on the move: the morning and evening rush, a lunch bump, quiet nights. */
export const WALK_BY_HOUR: Curve = [[0, 0.06], [5, 0.05], [6.5, 0.35], [7.75, 1], [9.5, 0.55], [12, 0.5], [13.5, 0.65], [15.5, 0.5], [17.25, 0.85], [18.75, 1], [20.5, 0.7], [22, 0.35], [23.5, 0.12], [24, 0.06]];
/** People waiting at the stops: the same rushes, nobody after the last car rapide. */
export const STOP_BY_HOUR: Curve = [[0, 0], [5.5, 0], [6.5, 0.6], [7.75, 1], [9.5, 0.45], [12, 0.35], [16.5, 0.5], [18.25, 1], [20.5, 0.55], [22.5, 0.15], [23.25, 0], [24, 0]];
/** Groups chatting in front of the shops: some all day, most in the evening when the heat drops. */
export const CHAT_BY_HOUR: Curve = [[0, 0.05], [6, 0], [8, 0.2], [11, 0.35], [14, 0.3], [17, 0.75], [19, 1], [21.5, 0.8], [23, 0.3], [24, 0.05]];

/** The crowd's size per quality: people at most, full humanoids among them (the nearest). */
export const STREET_BUDGET: Record<Quality, { pool: number; near: number; groupMax: number; perStop: number; life: number }> = {
  low: { pool: 36, near: 0, groupMax: 3, perStop: 3, life: 90 },
  medium: { pool: 72, near: 1, groupMax: 6, perStop: 5, life: 120 },
  high: { pool: 120, near: 2, groupMax: 9, perStop: 7, life: 150 },
};
/**
 * `life`: the street lives around the player — walkers mostly spawn, and stops and groups only fill, within this many
 * metres (the rest of the hub is beyond the crowd's far range anyway).
 */

/** How lively each hub's streets are, and its busy streets (road centre-line segments) with their weight. */
export interface BusyStreet { name: string; segs: readonly (readonly [number, number, number, number])[]; weight: number }
/**
 * Per hub: `level` scales everyone; `stops` the people waiting for the car rapide (commuters from the banlieue, few in
 * the villas); `groups` the groups chatting in front of the shops (the banlieue's evenings outside, students at
 * Fann, almost nobody standing about in Almadies); `busy`, the busy streets.
 */
export interface HubStreets { level: number; stops: number; groups: number; busy: readonly BusyStreet[] }
export const HUB_STREETS: Record<HubId, HubStreets> = {
  // Sandaga: the market block (2,1) and the streets round it
  plateau: { level: 1, stops: 1, groups: 0.9, busy: [{ name: 'Sandaga', weight: 6, segs: [[0, -60, 60, -60], [0, 0, 60, 0], [0, -60, 0, 0], [60, -60, 60, 0]] }] },
  // the main street: from the room's block to the arena gate and the market (the Ligne 23 runs along it)
  pikine: { level: 0.9, stops: 1.15, groups: 1.25, busy: [{ name: 'Grand-rue de Pikine', weight: 6, segs: [[-60, -60, 60, -60], [60, -60, 60, 0]] }] },
  corniche: { level: 0.55, stops: 0.75, groups: 1.1, busy: [] },
  almadies: { level: 0.35, stops: 0.5, groups: 0.4, busy: [] },
};
/** People waiting at a stop on a busy street come on top of the hour's number (the Sandaga and Arène stops). */
export const BUSY_STOP_EXTRA = 2;

/** Weight of a road edge: busy streets count several times (more people spawn there and keep walking there). */
export function edgeWeight(e: RoadEdge, busy: readonly BusyStreet[]): number {
  let w = 1;
  for (const b of busy) for (const [ax, az, bx, bz] of b.segs) if (onSeg(e, ax, az, bx, bz)) w = Math.max(w, b.weight);
  return w;
}
const onSeg = (e: RoadEdge, ax: number, az: number, bx: number, bz: number) => {
  const inside = (x: number, z: number) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), t = ((x - ax) * dx + (z - az) * dz) / (L * L);
    const px = ax + dx * t, pz = az + dz * t;
    return t >= -0.01 && t <= 1.01 && Math.hypot(x - px, z - pz) < 0.5;
  };
  return inside(e.ax, e.az) && inside(e.bx, e.bz);
};

/** Share of the pool the walkers keep whatever the stops and groups want (when the hour asks for that many). */
export const WALKERS_KEEP = 0.45;
/**
 * How many people the street shows now: walkers, waiting per stop (`stops`: the stops served now near the player),
 * chatting groups. The walkers come first: they keep up to WALKERS_KEEP of the pool, the groups give way next, then the
 * stops, so a hub with many stops or group spots never ends up with an empty pavement.
 */
export function streetTargets(hub: HubId, hour: number, q: Quality, stops: number, groupSpots: number, busyStops = 0) {
  const B = STREET_BUDGET[q], H = HUB_STREETS[hub], L = H?.level ?? 0.5;
  let perStop = Math.round(B.perStop * curveAt(STOP_BY_HOUR, hour) * Math.min(1, L + 0.2) * (H?.stops ?? 1));
  let groups = Math.min(groupSpots, Math.round(B.groupMax * curveAt(CHAT_BY_HOUR, hour) * L * (H?.groups ?? 1)));
  const want = Math.round(B.pool * 0.62 * curveAt(WALK_BY_HOUR, hour) * L);
  const room = B.pool - Math.min(want, Math.floor(B.pool * WALKERS_KEEP));
  const waitingOf = (p: number) => p * stops + (p > 0 ? BUSY_STOP_EXTRA * busyStops : 0);
  while (perStop > 0 && waitingOf(perStop) > room) perStop--;
  groups = Math.max(0, Math.min(groups, Math.floor((room - waitingOf(perStop)) / 4)));         // a ring of four
  const walkers = Math.max(0, Math.min(B.pool - waitingOf(perStop) - groups * 4, want));
  return { walkers, perStop, groups };
}

// ------------------------------------------------------------------ pavement lanes
/**
 * The pavement: from the kerb (5 m from a road's centre line) to the frontages (7 m). Walkers keep to its front half
 * (`walk`), people waiting or chatting to its back half (`wait`), so the two never stand in each other's way.
 */
export const PAVE = { kerb: 5, back: 7, walk: 5.35, wait: 6.3 } as const;
/** No lane inside the crossings: lanes start and end this far from the nodes. */
export const CROSSING = 7.6;

const blockedAt = (x: number, z: number, r: number, cols: readonly Collider[]) => cols.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);

/** A pavement lane: one side (±1, the right of a→b) of a road edge, at a distance from its centre line. */
export interface Lane { e: number; side: 1 | -1; off: number; ax: number; az: number; bx: number; bz: number; len: number; w: number }
/**
 * The walkable lanes of a hub: both pavements of every road edge, at the first lateral offset whose whole length
 * (crossings excepted) is clear of colliders for a walker of radius `r`.
 */
export function pavementLanes(edges: readonly RoadEdge[], cols: readonly Collider[], busy: readonly BusyStreet[] = [], r = 0.32): Lane[] {
  const out: Lane[] = [];
  edges.forEach((e, i) => {
    const L = Math.hypot(e.bx - e.ax, e.bz - e.az);
    if (L < CROSSING * 2 + 2) return;
    const dx = (e.bx - e.ax) / L, dz = (e.bz - e.az) / L, rx = -dz, rz = dx;
    for (const side of [1, -1] as const) {
      for (const off of [PAVE.walk, 5.2, 5.55]) {
        let clear = true;
        for (let t = CROSSING; t <= L - CROSSING && clear; t += 0.8) {
          if (blockedAt(e.ax + dx * t + rx * side * off, e.az + dz * t + rz * side * off, r, cols)) clear = false;
        }
        if (!clear) continue;
        const ox = rx * side * off, oz = rz * side * off;
        out.push({ e: i, side, off, ax: e.ax + dx * CROSSING + ox, az: e.az + dz * CROSSING + oz, bx: e.bx - dx * CROSSING + ox, bz: e.bz - dz * CROSSING + oz, len: L - 2 * CROSSING, w: edgeWeight(e, busy) });
        break;
      }
    }
  });
  return out;
}

/** Lanes that start (forward) or end (backward) near a node: where a walker can go on after a crossing. */
export function lanesFrom(lanes: readonly Lane[], x: number, z: number, reach = CROSSING + 7.5): { lane: number; forward: boolean }[] {
  const out: { lane: number; forward: boolean }[] = [];
  lanes.forEach((l, i) => {
    if (Math.hypot(l.ax - x, l.az - z) < reach) out.push({ lane: i, forward: true });
    if (Math.hypot(l.bx - x, l.bz - z) < reach) out.push({ lane: i, forward: false });
  });
  return out;
}

/** Is a straight walk from a to b clear of colliders (sampled every 0.5 m)? */
export function clearWalk(ax: number, az: number, bx: number, bz: number, cols: readonly Collider[], r = 0.3): boolean {
  // only the colliders around the segment (a hub has hundreds)
  const x0 = Math.min(ax, bx) - r, x1 = Math.max(ax, bx) + r, z0 = Math.min(az, bz) - r, z1 = Math.max(az, bz) + r;
  const near = cols.filter(c => c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1);
  if (!near.length) return true;
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let k = 0; k <= n; k++) if (blockedAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, r, near)) return false;
  return true;
}

/**
 * A walk from a to b clear of colliders: straight, or with one or two turns (round a stall, a barrier, a corner).
 * Returns the waypoints after a (b last), or null when no such simple route exists.
 */
export function routeClear(a: { x: number; z: number }, b: { x: number; z: number }, cols: readonly Collider[], r = 0.3): { x: number; z: number }[] | null {
  const ok = (p: { x: number; z: number }, q: { x: number; z: number }) => clearWalk(p.x, p.z, q.x, q.z, cols, r);
  if (ok(a, b)) return [b];
  for (const c of [{ x: b.x, z: a.z }, { x: a.x, z: b.z }]) if (ok(a, c) && ok(c, b)) return [c, b];
  for (const d of [1.5, -1.5, 3, -3, 5, -5, 8, -8]) for (const c of [{ x: a.x + d, z: a.z }, { x: a.x, z: a.z + d }]) {
    if (!ok(a, c)) continue;
    if (ok(c, b)) return [c, b];
    for (const e of [{ x: b.x, z: c.z }, { x: c.x, z: b.z }]) if (ok(c, e) && ok(e, b)) return [c, e, b];
  }
  return null;
}

/**
 * Places for people waiting at a stop: on the back half of the pavement either side of the shelter (the shelter, its
 * bench, its pole and the stop's own waiting people keep the middle), clear of colliders and of `avoid` points.
 */
export function stopSlots(site: { x: number; z: number; dx: number; dz: number; rx: number; rz: number; yaw: number }, cols: readonly Collider[], avoid: readonly { x: number; z: number }[] = [], n = 10) {
  const out: { x: number; z: number; yaw: number }[] = [];
  const along = [-3.0, 3.2, -3.8, 4.0, -4.6, 4.8, -5.4, 5.6, -6.2, 6.4, -7.0, 7.2];
  for (let k = 0; k < along.length && out.length < n; k++) {
    const a = along[k], r = k % 2 ? 0.15 : 0.35;
    const x = site.x + site.dx * a + site.rx * r, z = site.z + site.dz * a + site.rz * r;
    if (blockedAt(x, z, 0.3, cols) || avoid.some(p => Math.hypot(p.x - x, p.z - z) < 1.1)) continue;
    out.push({ x, z, yaw: site.yaw + (k % 3 === 2 ? (a > 0 ? -0.9 : 0.9) : 0) });   // most face the road, some their neighbour
  }
  return out;
}

/**
 * Places for a crowd waiting at a stop (the ride home after the gala): two rows on the back half of the pavement either
 * side of the shelter, nearest the shelter first, clear of colliders and `avoid` points.
 */
export function crowdSlots(site: { x: number; z: number; dx: number; dz: number; rx: number; rz: number; yaw: number }, cols: readonly Collider[], avoid: readonly { x: number; z: number }[] = [], n = 18) {
  const out: { x: number; z: number; yaw: number }[] = [];
  for (let k = 0; out.length < n && k < 16; k++) {
    const a = (k % 2 ? 1 : -1) * (2.9 + Math.floor(k / 2) * 0.7);
    for (const r of [0.15, 0.6]) {
      if (out.length >= n) break;
      const x = site.x + site.dx * a + site.rx * r, z = site.z + site.dz * a + site.rz * r;
      if (blockedAt(x, z, 0.25, cols) || avoid.some(p => Math.hypot(p.x - x, p.z - z) < 1.1)) continue;
      out.push({ x, z, yaw: site.yaw + (r > 0.3 ? (a > 0 ? -0.25 : 0.25) : 0) });   // the back row looks past the front row
    }
  }
  return out;
}

/** A ring of `n` people chatting around (x, z), facing its centre. */
export function ring(x: number, z: number, n: number, r = 0.72, start = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    return { x: px, z: pz, yaw: Math.atan2(x - px, z - pz) };
  });
}

/**
 * Spots for chatting groups: on the back of the pavement in front of each shop or kiosk (`fronts`, any point near a
 * frontage), a whole ring clear of colliders and `avoid` points, and spots at least 6 m apart.
 */
export function groupSpots(fronts: readonly { x: number; z: number }[], lanes: readonly Lane[], cols: readonly Collider[], avoid: readonly { x: number; z: number }[] = []) {
  const out: { x: number; z: number; ring: { x: number; z: number; yaw: number }[] }[] = [];
  for (const f of fronts) {
    // the nearest pavement point, pushed to the back of the pavement
    let best: { x: number; z: number; d: number } | null = null;
    for (const l of lanes) {
      const dx = l.bx - l.ax, dz = l.bz - l.az, t = Math.max(0, Math.min(1, ((f.x - l.ax) * dx + (f.z - l.az) * dz) / (l.len * l.len)));
      const px = l.ax + dx * t, pz = l.az + dz * t, d = Math.hypot(f.x - px, f.z - pz);
      if (!best || d < best.d) {
        const back = (PAVE.wait - l.off) * 1, ux = dz / l.len, uz = -dx / l.len;       // (ux, uz): the right of a→b
        best = { x: px + ux * l.side * back, z: pz + uz * l.side * back, d };
      }
    }
    if (!best || best.d > 14) continue;
    const people = ring(best.x, best.z, 4, 0.42, Math.PI / 4);
    if (people.some(p => blockedAt(p.x, p.z, 0.2, cols)) || [...avoid, ...out].some(p => Math.hypot(p.x - best!.x, p.z - best!.z) < 2.2)) continue;
    if (out.some(o => Math.hypot(o.x - best!.x, o.z - best!.z) < 6)) continue;
    out.push({ x: best.x, z: best.z, ring: people });
  }
  return out;
}
