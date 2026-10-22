import type { HubId } from '../core/types';
import { LINKS } from '../transport/hubLink';
import type { Leg } from '../road/graph';

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
export const HUB_SHORT: Record<HubId, string> = { pikine: 'Pikine', plateau: 'Plateau', corniche: 'Corniche', almadies: 'Almadies' };
