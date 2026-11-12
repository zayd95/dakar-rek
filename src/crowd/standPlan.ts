import { SECTIONS, angleDiff } from '../world/geew';
import { BANNERS, BANNER } from './banners';
import { hashId } from './looks';

/**
 * Who is where in the arena's stands beyond one person per seat (docs/CROWD.md), pure and deterministic:
 *  - banner holders: a few supporters at ringside (tier 0) in the two sides' sections hang their écurie's banner on the
 *    parapet in front of them (B–C Baobab, F–G Teranga; one neutral banner in A and in H by the tunnel);
 *  - children on a parent's lap here and there;
 *  - people standing at the crowd barrier by the ring (the walkway in front of the parapet), a child among them.
 * Companions (lap children, the rail) come with a seat's spectator: they are there when that seat is taken.
 */
export interface PlanSeat { id: string; tier: number; a: number; x: number; z: number; top: number; yaw: number }
export interface StandCompanion {
  id: string;
  /** The seat whose spectator they come with. */
  with: string;
  x: number; y: number; z: number; yaw: number;
  /** On the parent's lap (hidden while the parent stands), or standing at the rail. */
  kind: 'lap' | 'rail';
  child: boolean;
}

/** Where people stand at the barrier: just behind it, on the walkway (its floor: the arena's sand pad). */
export const RAIL_R = 16.62, WALKWAY_Y = 0.14;
/** One seat in this many has a child on the lap (ringside excepted: legs over the parapet). */
export const LAP_EVERY = 26;

const SIDE_BANNERS: Record<string, number[]> = { B: [0, 1], C: [2, 0], F: [3, 4], G: [5, 3], A: [6], H: [7] };
/** People at the rail per section: fractions of the section's arc, and which of them is a child. */
const RAIL: Record<string, [number, boolean][]> = {
  B: [[0.1, false], [0.52, true], [0.92, false]], C: [[0.1, false], [0.52, false], [0.9, true]],
  F: [[0.1, true], [0.5, false], [0.92, false]], G: [[0.08, false], [0.5, true], [0.9, false]],
  A: [[0.25, false], [0.8, true]], H: [[0.2, true], [0.75, false]],
};

const unwrap = (a: number, a0: number) => { let x = a; while (x < a0) x += Math.PI * 2; while (x > a0 + Math.PI * 2) x -= Math.PI * 2; return x; };

/**
 * The banner holders among `seats` (tier-0 seats of B, C, F, G, A, H), with the banner each hangs (index in BANNERS):
 * spread along the section, never closer than a banner's width plus a gap, never over an aisle's gap in the parapet.
 */
export function bannerPlan(seats: readonly PlanSeat[], ringR: number): Map<string, number> {
  const out = new Map<string, number>();
  const margin = (BANNER.w / 2 + 0.25) / (ringR - BANNER.z);
  for (const s of SECTIONS) {
    const list = SIDE_BANNERS[s.id]; if (!list) continue;
    const front = seats.filter(x => x.tier === 0).map(x => ({ x, a: unwrap(x.a, s.a0) })).filter(o => o.a >= s.a0 + margin && o.a <= s.a1 - margin);
    if (!front.length) continue;
    const taken: number[] = [];
    list.forEach((b, k) => {
      const target = s.a0 + ((k + 1) / (list.length + 1)) * (s.a1 - s.a0);
      const best = front.filter(o => taken.every(t => Math.abs(o.a - t) * (ringR - BANNER.z) > BANNER.w + 0.3))
        .sort((p, q) => Math.abs(p.a - target) - Math.abs(q.a - target))[0];
      if (!best || BANNERS[b] === undefined) return;
      taken.push(best.a); out.set(best.x.id, b);
    });
  }
  return out;
}

/**
 * The companions of the given seats: children on laps (one seat in LAP_EVERY, by the seat's id; never at ringside or
 * on a banner holder) and the people at the rail of each section (with the spectator of the nearest seat).
 * `cx, cz`: the ring's centre.
 */
export function companionPlan(seats: readonly PlanSeat[], cx: number, cz: number, holders: ReadonlyMap<string, number> = new Map()): StandCompanion[] {
  const out: StandCompanion[] = [];
  for (const s of seats) {
    if (s.tier === 0 || holders.has(s.id) || hashId(s.id + ':lap') % LAP_EVERY !== 0) continue;
    // on the lap: a little forward of the hips (toward the ring), on the thighs
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    out.push({ id: `${s.id}:enfant`, with: s.id, x: s.x + fx * 0.2, y: s.top + 0.14, z: s.z + fz * 0.2, yaw: s.yaw, kind: 'lap', child: true });
  }
  for (const sec of SECTIONS) {
    const spots = RAIL[sec.id]; if (!spots) continue;
    const inSec = seats.map(x => ({ x, a: unwrap(x.a, sec.a0) })).filter(o => o.a >= sec.a0 && o.a <= sec.a1);
    if (!inSec.length) continue;
    spots.forEach(([f, child], k) => {
      const a = sec.a0 + f * (sec.a1 - sec.a0);
      const near = inSec.reduce((b, o) => (Math.abs(angleDiff(o.a, a)) < Math.abs(angleDiff(b.a, a)) ? o : b));
      out.push({ id: `rail:${sec.id}:${k}:${near.x.id}`, with: near.x.id, x: cx + Math.sin(a) * RAIL_R, y: WALKWAY_Y, z: cz + Math.cos(a) * RAIL_R, yaw: a + Math.PI, kind: 'rail', child });
    });
  }
  return out;
}
