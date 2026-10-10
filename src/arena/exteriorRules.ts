import type { PlaceSpec } from '../activity/places';
import type { ActivitySpec } from '../activity/types';
import * as P from '../activity/primitives';
import { haggler, tasteLine, waitLine } from '../i18n/lines';
import { WALL_R } from '../world/geew';

/**
 * Rules of the arena's surroundings (Pikine), shared with the arena visit: when the exterior comes alive, where the
 * gate and its queue are, and what the vendors outside sell. Pure data and functions (unit-tested); the module that
 * draws the people is src/arena/exterior.ts.
 */

/** Weekday of a city day, 0 = Monday … 6 = Sunday. City day 1 is Tuesday 6 October 2026 (src/core/clock.ts epoch). */
export const weekday = (day: number) => ((Math.floor(day) % 7) + 7) % 7;
export const WEEKDAY_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
/** Fight evenings: Friday, Saturday and Sunday, from 16 h to midnight (city clock). */
export const FIGHT_DAYS: readonly number[] = [4, 5, 6];
export const FIGHT_FROM = 16;
export const isFightEvening = (day: number, hour: number) => FIGHT_DAYS.includes(weekday(day)) && hour >= FIGHT_FROM;
/** The next fight evening at or after (day, hour): its day and opening hour (for « prochain combat » texts). */
export function nextFightEvening(day: number, hour: number): { day: number; hour: number } {
  if (isFightEvening(day, hour)) return { day: Math.floor(day), hour: Math.floor(hour) };
  for (let d = Math.floor(day); d < day + 8; d++) if (FIGHT_DAYS.includes(weekday(d)) && (d > day || hour < FIGHT_FROM)) return { day: d, hour: FIGHT_FROM };
  return { day: Math.floor(day) + 1, hour: FIGHT_FROM };
}

/** Where the arena of world/builder.ts opens: the gate on the −z side of the wall, and the queue lane between barriers. */
export interface ArenaGate {
  x: number; z: number;
  /** Facing of someone leaving through the gate (towards the street, −z). */
  yaw: number;
  /** Queue lane in front of the gate: centre x, half width, from the gate (z0) back to the street (z1 < z0). */
  queue: { x: number; half: number; z0: number; z1: number };
}
export function gateOf(a: { cx: number; cz: number }): ArenaGate {
  const z = a.cz - WALL_R;
  return { x: a.cx, z, yaw: Math.PI, queue: { x: a.cx, half: 2.6, z0: z - 1.0, z1: z - 14.6 } };
}
/** The four stalls the builder puts outside the gate (world/builder.ts, 'arena': stall(cx ± (8 + k·4.5), gate − 4 − k·1.5)). */
export function stallsOf(a: { cx: number; cz: number }): { x: number; z: number }[] {
  const g = gateOf(a), out: { x: number; z: number }[] = [];
  for (const k of [0, 1]) for (const sx of [-1, 1]) out.push({ x: a.cx + sx * (8 + k * 4.5), z: g.z - 4 - k * 1.5 });
  return out;
}

/** Counter of everything bought outside the arena (the checks and later rewards read it). */
export const ARENA_PURCHASES = 'arene:achats';
/** Fictional écuries of the game (src/social/cast.ts) and their colours, for the supporters' scarves and flags. */
export const ECURIES = [
  { id: 'baobab', name: 'Baobab', colour: 0x1a7a44 },
  { id: 'teranga', name: 'Teranga', colour: 0xc8322a },
] as const;

const counted = (a: ActivitySpec): ActivitySpec => {
  const step = [...a.steps].reverse().find(s => s.effects);
  if (step) step.effects = { ...step.effects, counters: { ...step.effects!.counters, [ARENA_PURCHASES]: 1 } };
  return a;
};

export interface Vendor { key: string; name: string; seller: string; stall: number; offers: () => ActivitySpec[] }
/** What is sold outside on a fight evening (prices are the game's own, like the rest of the city). */
export const VENDORS: readonly Vendor[] = [
  { key: 'boissons', name: 'Bissap et café Touba', seller: 'Ndèye', stall: 0, offers: () => [
    P.order({ id: 'bissap', label: 'Bissap glacé', detail: 'Un sachet frais pour le combat', price: 300, prep: 1, eat: 2, drink: true, seat: false, needs: { moral: 4, faim: 2 }, line: waitLine('Ndèye') }),
    P.order({ id: 'touba', label: 'Café Touba', detail: 'Épicé au djar, chaud', price: 150, prep: 1, eat: 2, drink: true, seat: false, needs: { energie: 8, moral: 2 }, line: waitLine('Ndèye') }),
  ] },
  { key: 'grillades', name: 'Arachides et brochettes', seller: 'Modou', stall: 1, offers: () => [
    P.order({ id: 'arachides', label: 'Cornet d’arachides grillées', detail: 'Encore chaudes', price: 200, prep: 1, eat: 3, seat: false, needs: { faim: 10, moral: 2 }, eatLine: tasteLine }),
    P.order({ id: 'brochettes', label: 'Brochettes', detail: 'Trois brochettes et du pain', price: 1000, prep: 3, eat: 4, seat: false, needs: { faim: 28, moral: 4 }, line: waitLine('Modou'), eatLine: tasteLine }),
  ] },
  { key: 'supporters', name: 'Écharpes et drapeaux des écuries', seller: 'Aliou', stall: 2, offers: () => ECURIES.flatMap(e => [
    P.buy({ id: 'echarpe_' + e.id, label: `Écharpe ${e.name}`, detail: `Aux couleurs de l’écurie ${e.name}`, price: 2000, items: { ['echarpe_' + e.id]: 1 }, haggle: haggler('buy', 2000, 'Aliou') }),
    P.buy({ id: 'drapeau_' + e.id, label: `Drapeau ${e.name}`, detail: 'Pour la tribune', price: 1500, items: { ['drapeau_' + e.id]: 1 } }),
  ]) },
  { key: 'eau', name: 'Eau fraîche', seller: 'Fatou', stall: 3, offers: () => [
    P.order({ id: 'eau', label: 'Sachet d’eau fraîche', price: 50, prep: 0.5, eat: 1.5, drink: true, seat: false, needs: { moral: 1 } }),
  ] },
];

/** Place id of a vendor of a hub. */
export const vendorId = (hub: string, key: string) => `${hub}:arena-out:${key}`;

/** The vendors as places of the shared registry (anchor on the street side of each stall). */
export function vendorPlaces(hub: string, a: { cx: number; cz: number }): PlaceSpec[] {
  const stalls = stallsOf(a);
  return VENDORS.map(v => {
    const s = stalls[v.stall];
    return {
      id: vendorId(hub, v.key), type: 'stall', name: v.name, space: 'street', chat: true,
      anchors: [{ id: 'stall', name: `${v.name} · ${v.seller}`, kind: 'shop', x: s.x, z: s.z - 1.15, y: 1.5, radius: 1.7 }],
      offers: { stall: v.offers().map(counted) },
    };
  });
}

// ------------------------------------------------------------------ sound and traffic on a fight evening

/** Where the k-th sabar drummer stands: beside the gate, on its +x side, facing the street. */
export const drummerAt = (g: ArenaGate, k: number) => ({ x: g.x + 4.4 + k * 0.95, z: g.z - 2.4 });
/** Centre of the three drummers (where their sound comes from). */
export const drumsCentre = (g: ArenaGate) => drummerAt(g, 1);
/** Full loudness within NEAR metres, then a smooth fall to silence at RANGE. */
export const DRUMS_NEAR = 6, DRUMS_RANGE = 45, MURMUR_NEAR = 3, MURMUR_RANGE = 28;
const falloff = (dist: number, near: number, range: number) => (dist <= near ? 1 : dist >= range ? 0 : (1 - (dist - near) / (range - near)) ** 2);
/** Loudness 0..1 of the drummers heard `dist` metres away: silent beyond 45 m, inside an interior, or with the sound off. */
export function drumVolume(dist: number, inside: boolean, muted: boolean): number {
  return inside || muted ? 0 : falloff(dist, DRUMS_NEAR, DRUMS_RANGE);
}
/** Loudness 0..1 of the crowd's murmur `dist` metres from the queue lane (softer and shorter-ranged than the drums). */
export function murmurVolume(dist: number, inside: boolean, muted: boolean): number {
  return inside || muted ? 0 : falloff(dist, MURMUR_NEAR, MURMUR_RANGE);
}
/** Distance from a point to the queue lane (0 inside it). */
export function queueDistance(g: ArenaGate, x: number, z: number): number {
  const q = g.queue;
  return Math.hypot(Math.max(Math.abs(x - q.x) - q.half, 0), Math.max(q.z1 - z, z - q.z0, 0));
}
/**
 * Whether cars on a road segment would pass through the queue lane: decorative traffic drives up to 3 m either side of
 * the centre line, so a segment within `margin` of the lane is closed on fight evenings.
 */
export function crossesQueue(g: ArenaGate, ax: number, az: number, bx: number, bz: number, margin = 4): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let i = 0; i <= n; i++) if (queueDistance(g, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n) <= margin) return true;
  return false;
}
