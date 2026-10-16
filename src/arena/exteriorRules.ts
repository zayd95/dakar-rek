import type { PlaceSpec } from '../activity/places';
import type { ActivitySpec } from '../activity/types';
import * as P from '../activity/primitives';
import { haggler, tasteLine, waitLine } from '../i18n/lines';
import { WALL_R } from '../world/geew';
import { WEAR } from '../economy/catalog';

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

/**
 * What a vendor's offers may ask the game (the supporters' stall: the piece becomes the player's and is worn, one of
 * each). Without hooks (tests, a preview) the offers are the same, priced, and do nothing more once paid.
 */
export interface VendorHooks { gear?(id: string): void; owns?(id: string): boolean }
export interface Vendor { key: string; name: string; seller: string; stall: number; offers: (h?: VendorHooks) => ActivitySpec[] }
/** The supporters' stall (invented name): scarves, caps, small flags and tees of the two écuries. */
export const SUPPORTERS_STALL = 'Couleurs du Géew';
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
  // the price is shown on the row, paid once when picked; the piece is the player's (« Biens ») and worn (src/economy/wear.ts)
  { key: 'supporters', name: SUPPORTERS_STALL, seller: 'Aliou', stall: 2, offers: h => ECURIES.flatMap(e => WEAR.filter(w => w.ecurie === e.id).map(w =>
    P.buy({ id: w.id, label: w.name, detail: w.what, price: w.price ?? 0, then: () => h?.gear?.(w.id), requires: () => (h?.owns?.(w.id) ? 'Déjà à toi · à porter depuis « Biens »' : null),
      ...(w.item === 'scarf' ? { haggle: haggler('buy', w.price ?? 0, 'Aliou') } : {}) }))) },
  { key: 'eau', name: 'Eau fraîche', seller: 'Fatou', stall: 3, offers: () => [
    P.order({ id: 'eau', label: 'Sachet d’eau fraîche', price: 50, prep: 0.5, eat: 1.5, drink: true, seat: false, needs: { moral: 1 } }),
  ] },
];

/** Place id of a vendor of a hub. */
export const vendorId = (hub: string, key: string) => `${hub}:arena-out:${key}`;

/** The vendors as places of the shared registry (anchor on the street side of each stall). */
export function vendorPlaces(hub: string, a: { cx: number; cz: number }, hooks?: VendorHooks): PlaceSpec[] {
  const stalls = stallsOf(a);
  return VENDORS.map(v => {
    const s = stalls[v.stall];
    return {
      id: vendorId(hub, v.key), type: 'stall', name: v.name, space: 'street', chat: true,
      anchors: [{ id: 'stall', name: `${v.name} · ${v.seller}`, kind: 'shop', x: s.x, z: s.z - 1.15, y: 1.5, radius: 1.7 }],
      offers: { stall: v.offers(hooks).map(counted) },
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
/**
 * The drums heard by tonight's wrestler in his corner or walking out (`boost`, src/arena/exterior.ts FIGHTER_DRUMS):
 * the drummers play for him, so inside the walls they carry over the whole arena, heard as if beside them and louder,
 * whichever corner his écurie has (src/world/arenaModules.ts PREP_SIDE). Outside the walls: by distance, as always.
 */
export function fighterDrumVolume(dist: number, withinWalls: boolean, inside: boolean, muted: boolean, boost: number): number {
  return drumVolume(withinWalls ? 0 : dist, inside, muted) * boost;
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
// ------------------------------------------------------------------ the end of the evening

/** What the street in front of the arena does: quiet, fans arriving and queueing, or the crowd pouring out after the gala. */
export type ExteriorPhase = 'quiet' | 'arrive' | 'outflow';
/** `after`: the arena's street is in its after-gala window (the gala seen to the end, or closing time, src/arena/program.ts). */
export const exteriorPhase = (event: boolean, after: boolean): ExteriorPhase => (after ? 'outflow' : event ? 'arrive' : 'quiet');
/**
 * The ends of the street in front of the gate where the fans come from and the crowd goes to: the pavement corners at
 * each end (north, then south side), short of the junctions. The fans never stand in a junction's carriageway, where
 * Ligne 23 turns (its evening route at the west end) and the gala road's agent directs the cars (the east end).
 */
export function streetEnds(g: ArenaGate): { x: number; z: number }[] {
  const road = g.z - 8.3;
  return [-1, 1].flatMap(sx => [{ x: g.x + sx * 23.5, z: road - 6 }, { x: g.x + sx * 23.5, z: road + 6 }]);
}
/**
 * Where the crowd goes when it pours out: both ends of the street in front of the gate, on the pavements (the side
 * streets' corners, where taxis wait), and the transport stops near the arena (`stops`, within 150 m).
 */
export function outflowDestinations(g: ArenaGate, stops: readonly { x: number; z: number }[] = []): { x: number; z: number }[] {
  return [...streetEnds(g), ...stops.filter(s => Math.hypot(s.x - g.x, s.z - g.z) < 150)];
}
/** Fronts of the four stalls (where the last customers stand). */
export const stallFronts = (a: { cx: number; cz: number }) => stallsOf(a).map(s => ({ x: s.x, z: s.z - 1.15 }));

export function crossesQueue(g: ArenaGate, ax: number, az: number, bx: number, bz: number, margin = 4): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let i = 0; i <= n; i++) if (queueDistance(g, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n) <= margin) return true;
  return false;
}

// ------------------------------------------------------------------ the gate's pedestrian zone

/** An axis-aligned rectangle of the ground (x0 < x1, z0 < z1). */
export interface Rect { x0: number; x1: number; z0: number; z1: number }
/** Half the width of the pedestrian zone along the street (m): the stalls' outer edges (13.35 m) and a margin. */
export const PLAZA_HALF = 14.5;
/**
 * The gate's pedestrian zone — the parvis — where no vehicle drives or stops, at any hour. The world builder's crowd
 * barriers stand across the whole street in front of the gate at all hours, with the stalls on it and the drummers by
 * it. The zone has two parts: the street with both its pavements between the stalls' outer edges (and a margin), and
 * the apron from the pavement up to the gate (the queue's head, the flags). The guarded moto parking east of it stays
 * outside (src/arena/arrivalRules.ts motoLot). Car rapide routes, their stops and every vehicle flow keep out of it
 * (tests/gatePlaza.test.ts); the decorative traffic never takes the street segment that crosses it.
 */
export function gatePlaza(a: { cx: number; cz: number }): Rect[] {
  const g = gateOf(a), road = g.z - 8.3, pave = 7;                          // the street's centre line and its edges (14 m road)
  return [
    { x0: a.cx - PLAZA_HALF, x1: a.cx + PLAZA_HALF, z0: road - pave - 0.3, z1: road + pave },
    { x0: a.cx - 8, x1: a.cx + 8, z0: road + pave - 0.1, z1: g.z + 0.3 },
  ];
}
/** Is (x, z) in the zone (or within `margin` of it)? */
export const inPlaza = (rects: readonly Rect[], x: number, z: number, margin = 0) =>
  rects.some(r => x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin);
/** Does a vehicle's footprint (centre, heading, half length and half width) overlap the zone? Separating axes. */
export function footprintInPlaza(rects: readonly Rect[], f: { x: number; z: number; yaw: number; hl: number; hw: number }): boolean {
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), ex = Math.abs(fx) * f.hl + Math.abs(fz) * f.hw, ez = Math.abs(fz) * f.hl + Math.abs(fx) * f.hw;
  return rects.some(r => {
    if (f.x + ex <= r.x0 || f.x - ex >= r.x1 || f.z + ez <= r.z0 || f.z - ez >= r.z1) return false;   // the rectangle's axes
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2;
    for (const [ax, az, h] of [[fx, fz, f.hl], [fz, -fx, f.hw]] as const) {                            // the vehicle's axes
      const d = Math.abs((cx - f.x) * ax + (cz - f.z) * az), rr = hx * Math.abs(ax) + hz * Math.abs(az);
      if (d >= h + rr) return false;
    }
    return true;
  });
}
/** Would a vehicle on a road segment (up to `margin` either side of its centre line) pass through the zone? */
export function crossesPlaza(rects: readonly Rect[], ax: number, az: number, bx: number, bz: number, margin = 4): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let i = 0; i <= n; i++) if (inPlaza(rects, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, margin)) return true;
  return false;
}
/**
 * The decorative traffic's closure of the zone (src/actors/npc.ts trafficClosures): the street segments a car on would
 * pass through it, at all hours (memoised by segment).
 */
export function plazaClosure(rects: readonly Rect[]): (ax: number, az: number, bx: number, bz: number) => boolean {
  const memo = new Map<string, boolean>();
  return (ax, az, bx, bz) => {
    const k = `${ax},${az},${bx},${bz}`;
    let v = memo.get(k);
    if (v === undefined) { v = crossesPlaza(rects, ax, az, bx, bz); memo.set(k, v); }
    return v;
  };
}
/** The zone as footprints for drive mode (yaw 0: half widths along x and z). */
export const plazaFootprints = (rects: readonly Rect[]) => rects.map(r => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, yaw: 0, hl: (r.z1 - r.z0) / 2, hw: (r.x1 - r.x0) / 2 }));
