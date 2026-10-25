import type { HubId } from '../core/types';
import { LINKS } from '../transport/hubLink';
import type { Leg } from '../road/graph';
import { routePath, snapToRoad, type Edge } from '../ui/minimapMath';

/**
 * Turn-by-turn rules for a driver (pure, unit-tested; src/game/navigation.ts shows them on the goal line and the maps).
 * The game's frame: yaw 0 looks along +z and +x is to the LEFT, so a heading that grows turns left.
 */
export interface Pt { x: number; z: number }
const TAU = Math.PI * 2;
const wrap = (a: number) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const heading = (a: Pt, b: Pt) => Math.atan2(b.x - a.x, b.z - a.z);

/** A driver's streets: the network without the segments closed to cars (the arena's pedestrian zone, a road event), so the way never runs into bollards. */
export function openEdges<E extends { ax: number; az: number; bx: number; bz: number }>(edges: readonly E[], shut: readonly ((ax: number, az: number, bx: number, bz: number) => boolean)[]): readonly E[] {
  return shut.length ? edges.filter(e => !shut.some(f => f(e.ax, e.az, e.bx, e.bz))) : edges;
}

/** Where a district is left for the next one on a leg (its own frame), and where the next one is entered (that one's frame). */
export function legEnds(leg: Leg): { exit: Pt; entry: Pt } {
  const r = leg.edge.road;
  if (r) {
    const out = r.def.a === leg.from ? r.def.aMouth : r.def.bMouth, inn = r.def.a === leg.to ? r.def.aMouth : r.def.bMouth;
    return { exit: { x: out.x, z: out.z }, entry: { x: inn.x, z: inn.z } };
  }
  const l = LINKS.find(k => k.from === leg.from && k.to === leg.to)!;
  return { exit: { x: l.x, z: l.at }, entry: { x: l.x, z: l.arrive } };
}

export interface Turn {
  /** 'left' / 'right' / 'back' (a U-turn: the way is behind), or 'straight' to the end (no turn left before it). */
  dir: 'left' | 'right' | 'straight' | 'back';
  /** Metres along the way to the turn (to the end for 'straight'). */
  at: number;
}
/**
 * The next turn along a way (points from the driver to the goal) for a driver heading `yaw`: the first bend of more than 35° (the grid's corners are 90°),
 * how far along it is; a way that starts behind the driver is a U-turn.
 */
export function nextTurn(points: readonly Pt[], yaw: number): Turn {
  if (points.length < 2) return { dir: 'straight', at: 0 };
  let along = 0, i0 = 0;
  // the first leg's own direction against the driver's: more than 120° off is a way behind
  while (i0 < points.length - 1 && Math.hypot(points[i0 + 1].x - points[i0].x, points[i0 + 1].z - points[i0].z) < 2) i0++;
  if (i0 >= points.length - 1) return { dir: 'straight', at: 0 };
  if (Math.abs(wrap(heading(points[i0], points[i0 + 1]) - yaw)) > (2 * Math.PI) / 3) return { dir: 'back', at: 0 };
  for (let i = i0 + 1; i < points.length - 1; i++) {
    along += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    const d = wrap(heading(points[i], points[i + 1]) - heading(points[i - 1], points[i]));
    if (Math.abs(d) > (35 * Math.PI) / 180) return { dir: d > 0 ? 'left' : 'right', at: along };
  }
  along += Math.hypot(points[points.length - 1].x - points[points.length - 2].x, points[points.length - 1].z - points[points.length - 2].z);
  return { dir: 'straight', at: along };
}

/** How much longer (m) the way ahead may be than a U-turn's and still be preferred: a driver goes round a block rather than turn back. */
export const UTURN_COST = 120;
/** Once a U-turn has been called, the way ahead must win by this much more before the call is taken back (and the other way round). */
export const UTURN_HYSTERESIS = 30;

/**
 * A driver's way to `goal` (the goal line's next turn and the minimap's dotted route at the wheel), from where the car is, as it heads (`yaw`):
 * - it starts on the street the car is driving along, level with the car (the car's kerb lane is a few metres off the centre line the way follows:
 *   that offset is neither a turn nor, by a junction, a diagonal), and in a junction the cross street (nearer to a car in its lane) does not capture it;
 * - when the shortest way starts behind the car, the way ahead round the block is taken unless it is longer by more than `UTURN_COST`;
 * - `wasBack` (the last call) holds a U-turn or a way round until the other is better by `UTURN_HYSTERESIS` more, so a near tie never flickers.
 * Recompute it as often as wanted: it depends on the car's position and heading only.
 */
export function driverWay(edges: readonly Edge[], p: Pt, yaw: number, goal: Pt, wasBack: boolean | null = null): { points: Pt[]; length: number; back: boolean } {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // the street the car drives along: the nearest edge running with the car (within 30°), within a street's width; a car halfway round a corner
  // (no street within 30°) takes the better aligned of the two (within 50°), so the turn it is making is not read as a way behind it
  const street = (minCos: number, byAlign: boolean) => {
    let on: { p: Pt; e: Edge; d: number; c: number } | null = null;
    for (const e of edges) {
      const dx = e.bx - e.ax, dz = e.bz - e.az, l = Math.hypot(dx, dz); if (l < 1) continue;
      const c = Math.abs((dx * fx + dz * fz) / l); if (c < minCos) continue;
      const t = Math.max(0, Math.min(1, ((p.x - e.ax) * dx + (p.z - e.az) * dz) / (l * l))), q = { x: e.ax + dx * t, z: e.az + dz * t }, d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 9 && (!on || (byAlign ? c > on.c + 1e-6 || (Math.abs(c - on.c) < 1e-6 && d < on.d) : d < on.d))) on = { p: q, e, d, c };
    }
    return on;
  };
  const on = street(0.87, false) ?? street(0.64, true);
  const from = (start: Pt, lead: Pt[], net: readonly Edge[] = edges) => {
    const r = routePath(net, start, goal), pts = [start, ...lead, ...r.points.slice(1)].filter((q, i, a) => !i || Math.hypot(q.x - a[i - 1].x, q.z - a[i - 1].z) > 0.05);
    return { points: pts, length: pts.reduce((m, q, i) => (i ? m + Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z) : 0), 0) };
  };
  if (!on) { const r = routePath(edges, p, goal); return { ...r, back: nextTurn(r.points, yaw).dir === 'back' }; }
  const best = from(on.p, []), back = nextTurn(best.points, yaw).dir === 'back';
  if (!back) return { ...best, back: false };
  // the way ahead: on to the end of this street the car is heading for, then the shortest way from there that does not come straight back down it
  // (that would be the same U-turn a block later); none (a dead end, or the goal only reached back this way): the U-turn stands
  const e = on.e, ahead = (e.bx - e.ax) * fx + (e.bz - e.az) * fz > 0 ? { x: e.bx, z: e.bz } : { x: e.ax, z: e.az };
  const rest = edges.filter(k => k !== e);
  const joins = snapToRoad(rest, ahead.x, ahead.z);                                             // another street must start where this one ends
  if (!joins || Math.hypot(joins.p.x - ahead.x, joins.p.z - ahead.z) > 1 || routePath(rest, ahead, goal).points.length < 3) return { ...best, back: true };
  const fwd = from(ahead, [ahead], rest);
  const margin = UTURN_COST + (wasBack === true ? -UTURN_HYSTERESIS : wasBack === false ? UTURN_HYSTERESIS : 0);
  return fwd.length <= best.length + margin ? { ...fwd, back: false } : { ...best, back: true };
}

/** The glyph of a turn on the goal line. */
export const TURN_GLYPH: Record<Turn['dir'], string> = { left: '↰', right: '↱', straight: '↑', back: '↶' };
/** « 80 m », « 1,2 km ». */
export function navDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`;
}
/** The words of a turn (« À droite dans 80 m », « Fais demi-tour »), the goal's name after. */
export function turnText(t: Turn, goal: string, through?: string): string {
  const what = t.dir === 'back' ? 'Fais demi-tour' : t.dir === 'straight' ? (through ? `Tout droit vers ${through}` : 'Tout droit') : `${t.dir === 'left' ? 'À gauche' : 'À droite'} dans ${navDistance(t.at)}`;
  return `${what} · ${goal}`;
}
/** Metres inside a district from where it is entered to a point (along its grid of streets). */
export const gridMetres = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
/** A district's name for the driver (« Plateau »). */
export const HUB_SHORT: Record<HubId, string> = { pikine: 'Pikine', plateau: 'Plateau', corniche: 'Corniche', almadies: 'Almadies', mermoz: 'Mermoz' };
