import { say } from '../i18n/wolof';

/**
 * The rules of the grill at a Dibi (pure: src/venues/grillPlay.ts draws and plays them). Each brochette has two sides; the
 * side on the coals browns, the side up barely moves. Doneness: 0 raw, 1 golden-brown, 2 burnt. The player turns each
 * brochette once its underside is browned, then serves the order when every side is cooked enough.
 * Forgiving on purpose: the golden window is wide (several seconds), overcooking costs a little and slowly, an order
 * nobody touched still earns its minimum (src/activity/runner.ts gesturePay), and the shift never fails.
 */
export interface Skewer {
  /** Doneness of the side on the coals, and of the side facing up. */
  down: number;
  up: number;
  turns: number;
  /** Seconds since it was laid on the grill (it starts cooking then). */
  age: number;
}

export const GRILL_RULES = {
  /** Doneness per second of the side on the coals at heat 1 (golden after about seven seconds). */
  rate: 1 / 7,
  /** The side facing up keeps a little warmth. */
  upRate: 0.012,
  /** A side is golden from `golden` to `over`; burnt from `burnt`. */
  golden: 0.8, over: 1.38, burnt: 1.85,
  /** Every side at least this cooked: the order can be served. */
  serveMin: 0.62,
  /** Seconds before the owner serves the order himself (whatever its state): the round never drags. */
  maxSeconds: 45,
  /** Seconds between laying one brochette and the next at the start. */
  layEvery: 0.55,
} as const;

export const newSkewer = (): Skewer => ({ down: 0, up: 0, turns: 0, age: 0 });

/** One step of cooking (`heat` 1 at the first rung, a little hotter higher up the ladder). */
export function cook(s: Skewer, dt: number, heat = 1): Skewer {
  s.down = Math.min(2.2, s.down + GRILL_RULES.rate * heat * dt);
  s.up = Math.min(2.2, s.up + GRILL_RULES.upRate * dt);
  s.age += dt;
  return s;
}

/** Turns it over: the browned side comes up. */
export function turn(s: Skewer): Skewer { const d = s.down; s.down = s.up; s.up = d; s.turns++; return s; }

/** How good one side is (0.25 raw … 1 golden … 0.4 burnt): a plateau, gentle slopes. */
export function sideScore(d: number): number {
  const R = GRILL_RULES;
  if (d < 0.3) return 0.25;
  if (d < R.golden) return 0.25 + 0.75 * (d - 0.3) / (R.golden - 0.3);
  if (d <= R.over) return 1;
  if (d < R.burnt) return 1 - 0.6 * (d - R.over) / (R.burnt - R.over);
  return 0.4;
}
export const skewerScore = (s: Skewer) => (sideScore(s.down) + sideScore(s.up)) / 2;
/** The order's score (0…1): the mean of its brochettes. */
export const orderScore = (list: readonly Skewer[]) => (list.length ? list.reduce((t, s) => t + skewerScore(s), 0) / list.length : 0);

/** What a brochette needs now: 'wait' (browning), 'turn' (its underside is golden and the top still pale), 'done' (both sides cooked), 'burning'. */
export type SkewerCue = 'wait' | 'turn' | 'done' | 'burning';
export function cue(s: Skewer): SkewerCue {
  const R = GRILL_RULES;
  if (s.down >= R.over) return s.up < R.golden ? 'turn' : 'burning';
  if (s.down >= R.golden && s.up >= R.golden) return 'done';
  if (s.down >= R.golden && s.up < R.golden) return 'turn';
  return 'wait';
}
/** Every side cooked enough to be served. */
export const servable = (list: readonly Skewer[]) => list.length > 0 && list.every(s => Math.min(s.down, s.up) >= GRILL_RULES.serveMin);

/** The colour of a side (raw red → browning → golden brown → dark → burnt), as 0xRRGGBB. Onion pieces brown from cream. */
const MEAT = [[0, 0xb4464e], [0.5, 0x9c4a34], [1, 0x7a3d1c], [1.5, 0x4a2414], [2, 0x241410]] as const;
const ONION = [[0, 0xefe6cf], [0.5, 0xe6cf9c], [1, 0xcf9f5a], [1.5, 0x8a5a2e], [2, 0x3a2a1c]] as const;
export function sideColor(d: number, onion = false): number {
  const stops = onion ? ONION : MEAT;
  const x = Math.max(0, Math.min(2, d));
  for (let i = 1; i < stops.length; i++) {
    const [d1, c1] = stops[i];
    if (x <= d1) {
      const [d0, c0] = stops[i - 1], t = (x - d0) / (d1 - d0);
      const ch = (c: number, k: number) => (c >> k) & 255;
      const mix = (k: number) => Math.round(ch(c0, k) + (ch(c1, k) - ch(c0, k)) * t);
      return (mix(16) << 16) | (mix(8) << 8) | mix(0);
    }
  }
  return stops[stops.length - 1][1];
}

/** What the customer says on being served (French with the everyday Wolof of src/i18n/wolof.ts), by the order's score. */
export function customerLine(score: number): { mood: 'top' | 'ok' | 'meh'; text: string } {
  if (score >= 0.88) return { mood: 'top', text: `${say('Neex na')} ! Bien grillé, comme il faut.` };
  if (score >= 0.62) return { mood: 'ok', text: `${say('Baax na')}, ${say('Jërëjëf')}.` };
  return { mood: 'meh', text: `${say('Ndank ndank')}… la prochaine fois, surveille la braise.` };
}
/** The order the customer gives (a count in French). */
const COUNT = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit'];
export const orderLine = (n: number) => `${COUNT[n] ?? n} brochettes bien grillées, s’il te plaît !`.replace(/^./, c => c.toUpperCase());
