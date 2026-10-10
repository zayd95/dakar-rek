/**
 * The gala evening at the Pikine arena (pure data and functions: no Three.js, no DOM; tested in tests/arena.test.ts).
 *
 * A fight evening on every event day (every day until the exterior's shared rule is wired, see module.ts): set-up from 16 h, the gate opens at 17 h (ticket at the window, the stands
 * fill hour after hour), and the gala itself starts once the player has a seat — the wrestlers' entrance, the bout (the
 * existing làmb duel played by two fictional wrestlers of the game's own cast), the result, then the crowd goes home.
 * After 23 h, or once that day's gala is over, the arena is quiet again. The street outside the walls (vendors, queue,
 * fans, drummers) is src/arena/exterior.ts (another lane), which will give the event days and the gate position.
 *
 * Names are the game's fictional cast and écuries (Babacar of Baobab, Lamine of Teranga): no real wrestler, écurie,
 * promoter or brand. No ritual or religious text anywhere in the show — drums, dances and the crowd.
 */
import { TIER_DEPTH, TIERS, standOpen, tierRadius, tierTop } from '../world/geew';

export type Quality = 'low' | 'medium' | 'high';

/** Hours of the fight evening (city clock). */
export const GALA = { setup: 16, doors: 17, close: 23 } as const;
/** Entry ticket, paid once at the window and valid for the whole evening (game balance, provisional). */
export const TICKET_PRICE = 1000;
/** Counter of the save that holds the city day the last ticket was bought for (no save schema change). */
export const TICKET_COUNTER = 'arena_ticket_day';
/** Counter of the save that holds the city day whose gala the player has seen to the end. */
export const GALA_DONE_COUNTER = 'arena_gala_day';

/** What the street in front of the arena looks like at this hour. */
export type Street = 'quiet' | 'setup' | 'doors' | 'after';
export function streetAt(hour: number, galaDoneToday: boolean, eventDay = true): Street {
  const h = ((hour % 24) + 24) % 24;
  if (!eventDay || h < GALA.setup || h >= GALA.close + 1) return 'quiet';
  if (h >= GALA.close || galaDoneToday) return 'after';
  return h < GALA.doors ? 'setup' : 'doors';
}
/** The gate checks tickets while the doors are open (and the gala of the day is not over). */
export const ticketsChecked = (hour: number, galaDoneToday: boolean, eventDay = true) => streetAt(hour, galaDoneToday, eventDay) === 'doors';
export const hasTicket = (counters: Record<string, number>, day: number) => (counters[TICKET_COUNTER] ?? -1) === day;

/** Share of the stands' crowd seats taken at this hour of a gala evening (0 before the doors, full by 19 h). */
export function fillAt(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < GALA.doors || h >= GALA.close) return 0;
  return Math.min(1, 0.35 + (h - GALA.doors) * 0.33);
}

/** How full the stands get, by graphics quality (instanced spectators are cheap; real humanoids next to you are not). */
export const DENSITY: Record<Quality, { crowdShare: number; near: number }> = {
  low: { crowdShare: 0.42, near: 0 },
  medium: { crowdShare: 0.68, near: 4 },
  high: { crowdShare: 0.86, near: 8 },
};

// ------------------------------------------------------------------ stand seats

export interface StandSeatDef { id: string; tier: number; a: number; x: number; z: number; top: number; yaw: number }
/** Gap between two places on a tier (shoulder room). */
export const SEAT_GAP = 0.62;
/** Where the hips go on a tier: just behind its front edge, legs hanging over the edge toward the ring. */
export const seatRadius = (t: number) => tierRadius(t) - TIER_DEPTH / 2 + 0.3;

/**
 * Places on the three tiers of the géew (dimensions in src/world/geew.ts), facing the ring, none in the gate.
 * Ids are stable (`${prefix}:${tier}:${i}`), so the same seat keeps its id between visits.
 */
export function standSeats(cx: number, cz: number, prefix = 'arena:stand'): StandSeatDef[] {
  const out: StandSeatDef[] = [];
  for (let t = 0; t < TIERS; t++) {
    const r = seatRadius(t), n = Math.floor((2 * Math.PI * r) / SEAT_GAP);
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      if (!standOpen(a)) continue;                                             // not in the gate, an aisle or the wrestlers' tunnel
      out.push({ id: `${prefix}:${t}:${i}`, tier: t, a, x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r, top: tierTop(t), yaw: a + Math.PI });
    }
  }
  return out;
}

/** Seeded order in which the crowd takes the seats (the same evening fills the same way). */
export function fillOrder(n: number, seed = 7): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  let h = seed >>> 0 || 1;
  for (let i = n - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ------------------------------------------------------------------ the show

/** The gala, once the player is seated: entrance of the wrestlers → the bout → the result → the crowd leaves. */
export type ShowPhase = 'idle' | 'filling' | 'entrance' | 'bout' | 'result' | 'leaving' | 'over';
/** Seconds each phase lasts (the bout lasts as long as the duel does). */
export const SHOW = { filling: 3, entrance: 14, result: 7, leaving: 9 } as const;
export const SHOW_LABEL: Record<ShowPhase, string> = {
  idle: 'Avant le gala', filling: 'Les tribunes se remplissent', entrance: 'Entrée des lutteurs', bout: 'Combat · lutte sans frappe',
  result: 'Résultat', leaving: 'Le public rentre', over: 'Gala terminé',
};

/** The evening's bout: the game's own cast, fictional écuries. */
export const BILL = {
  left: { id: 'babacar', name: 'Babacar', ecurie: 'Baobab' },
  right: { id: 'lamine', name: 'Lamine', ecurie: 'Teranga' },
} as const;

/** How the crowd reacts to a moment of the bout (share of the seated crowd that stands, seconds). */
export type Moment = 'entrance' | 'clinch' | 'fall' | 'decision' | 'result';
export const REACTION: Record<Moment, { share: number; seconds: number }> = {
  entrance: { share: 0.35, seconds: 3 }, clinch: { share: 0.2, seconds: 1.6 }, fall: { share: 0.85, seconds: 4.5 },
  decision: { share: 0.6, seconds: 3.5 }, result: { share: 0.7, seconds: 4 },
};

// ------------------------------------------------------------------ the autopilot of a watched bout

/** What the duel tells about itself (subset of LambDuel.info()). */
export interface BoutView {
  phase: string;
  dist: number;
  windup: boolean;
  open: 'player' | 'opponent' | null;
  stamina: { player: number; opponent: number };
  clinch: { losing: boolean; breakWindow: boolean } | null;
}
export interface PilotOrder { approach: number; guard: boolean; grab: boolean; taps: number; brk: boolean }
/**
 * Decisions of the wrestler on the duel's « player » side when two NPCs fight (the other side is the duel's own
 * opponent AI). Same buttons a player has — approach, guard, grab, taps in the empoignade, dégagement — so the bout
 * follows the duel's rules unchanged. `r` is a random number in [0, 1) for this frame, `dt` the frame time.
 */
export function pilot(v: BoutView, r: number, dt: number): PilotOrder {
  const o: PilotOrder = { approach: 0, guard: false, grab: false, taps: 0, brk: false };
  if (v.phase === 'fight') {
    o.approach = v.dist > 1.25 ? 1 : v.dist < 0.85 ? -0.5 : 0;
    if (v.windup) { o.guard = r < 0.72; o.approach = 0; }                       // most of the time he sees it coming
    else if (v.dist < 1.4 && v.stamina.player > 30 && r < (v.open === 'opponent' ? 3.2 : 0.9) * dt) o.grab = true;
  } else if (v.phase === 'clinch' && v.clinch) {
    o.taps = r < 6.5 * dt ? 1 : 0;                                              // about six pushes a second
    o.brk = v.clinch.losing && v.clinch.breakWindow && v.stamina.player > 28 && r < 2.5 * dt;
  }
  return o;
}
