import type { WrestlerLook } from '../core/types';
import { rng } from '../core/rng';
import { STYLES, STYLE_IDS, type StyleId } from '../lamb/rules';
import { boutSeed } from './program';

/**
 * The preliminaries of a fight evening (« combats de préliminaires »): while the stands fill, short bouts between young
 * wrestlers of the neighbourhoods run long before the main event. Pure data and functions, no Three.js and no DOM
 * (tests/undercard.test.ts). The show plays them in src/arena/module.ts.
 *
 * - Two to four preliminaries on a gala night (Friday–Sunday), one or two on a weekday card. How many, and who, comes
 *   from the evening's seed: the same card for everyone that evening.
 * - Each one is a short walk-in from the tunnel with no ceremony, then a short bout of the existing duel (src/lamb/duel.ts,
 *   rules untouched, a 30 s round). The left wrestler is the autopilot, the right one the duel's own AI. Each is seeded
 *   by `prelimSeed(hub, day, i)`, i.e. the evening's `boutSeed(hub, day)` + 1 + i, so friends in the stands watch the
 *   same bout (the main event keeps `boutSeed` itself).
 * - Names are generic local ones: a first name and the neighbourhood he comes from, never a real wrestler, écurie or
 *   promoter. The main event's names are kept out.
 */

/** Show seconds: the walk from the tunnel, the bout's round (the duel's own intro comes first, ~2 s), the result. */
export const PRELIM = { walk: 5, round: 30, intro: 2.2, result: 3.5 } as const;
/** About how long one preliminary lasts (a fall by projection ends it sooner). */
export const PRELIM_TYPICAL = PRELIM.walk + PRELIM.intro + PRELIM.round + PRELIM.result;
/** How many preliminaries: a gala night, a weekday card. */
export const PRELIM_COUNT: Record<'gala' | 'card', readonly [number, number]> = { gala: [2, 4], card: [1, 2] };
/** The stands are this full when the last preliminary ends; the main event's entrance fills the rest. */
export const PRELIM_FILL_END = 0.95;

/** Everyday first names of the young wrestlers, and the neighbourhoods they come from (Pikine and around). */
export const PRELIM_NAMES = ['Modou', 'Pape', 'Ousmane', 'Mamadou', 'Ibrahima', 'Assane', 'Moussa', 'Malick', 'Aliou', 'Samba', 'Demba', 'Omar', 'Ndiaga', 'Birame', 'Mbaye', 'Abdou'] as const;
export const PRELIM_FROM = ['Thiaroye', 'Guédiawaye', 'Yeumbeul', 'Keur Massar', 'Diamaguène', 'Pikine Nord', 'Tally Boubess', 'Icotaf'] as const;

export interface PrelimSide { name: string; from: string }
export interface Prelim {
  /** 0-based, in the order of the evening. */
  i: number;
  left: PrelimSide;
  right: PrelimSide;
  /** The right wrestler fights in this duel style (the duel's AI); `level` 1–2, young wrestlers. */
  style: StyleId;
  level: number;
  /** The left wrestler's ngemb (never the right one's colour). */
  look: WrestlerLook;
  seed: number;
}

/** Seed of the evening's i-th preliminary (0-based): the evening's bout seed + 1 + i (the main event keeps the seed itself). */
export const prelimSeed = (hub: string, day: number, i: number) => (boutSeed(hub, day) + 1 + i) >>> 0;

const LEFT_NGEMB = ['blanc', 'vert', 'noir', 'indigo', 'rouge', 'ocre'] as const;

/**
 * The evening's preliminaries at a hub's arena (same card on every device): how many by the evening's size, two fresh
 * names each (never one of `avoid`, the main event's), a style and a level for the duel.
 */
export function undercardFor(hub: string, day: number, size: 'gala' | 'card', avoid: readonly string[] = []): Prelim[] {
  const R = rng((boutSeed(hub, day) ^ 0x2545f491) >>> 0 || 1);
  const [lo, hi] = PRELIM_COUNT[size], n = lo + Math.floor(R() * (hi - lo + 1));
  const pick = <T>(list: readonly T[]) => list[Math.floor(R() * list.length)];
  const used = new Set<string>(), out: Prelim[] = [];
  // every draw from the whole list, whatever `avoid` says, so the card (its styles, levels, seeds) is the same on every
  // device even when their main events differ (a friend's own gala night, src/arena/myGala.ts); only names follow
  const side = (): PrelimSide => {
    let name: string = pick(PRELIM_NAMES);
    for (let k = 0; k < 20 && used.has(name); k++) name = pick(PRELIM_NAMES);
    used.add(name);
    return { name, from: pick(PRELIM_FROM) };
  };
  for (let i = 0; i < n; i++) {
    const left = side(), right = side(), style = pick(STYLE_IDS), level = 1 + Math.floor(R() * 2);
    const theirs = STYLES[style].ngemb, mine = LEFT_NGEMB.filter(c => c !== theirs);
    out.push({ i, left, right, style, level, look: { ngembColor: pick(mine), ngembPattern: R() < 0.5 ? 'bordure' : 'uni', accessories: [] }, seed: prelimSeed(hub, day, i) });
  }
  // the main event's first names kept out: each one taken becomes the next free name of the list
  const kept = (x: string) => !avoid.some(a => a.split(/\s+/)[0] === x);
  for (const p of out) for (const s of [p.left, p.right]) {
    if (kept(s.name)) continue;
    const at = PRELIM_NAMES.indexOf(s.name as typeof PRELIM_NAMES[number]);
    for (let k = 1; k < PRELIM_NAMES.length; k++) {
      const x = PRELIM_NAMES[(at + k) % PRELIM_NAMES.length];
      if (kept(x) && !used.has(x)) { used.delete(s.name); used.add(x); s.name = x; break; }
    }
  }
  return out;
}

/** « Modou (Thiaroye) » */
export const prelimName = (s: PrelimSide) => `${s.name} (${s.from})`;

/**
 * Share of the evening's crowd in the stands during the preliminaries: from `start` (the stands when the show began) up
 * to PRELIM_FILL_END at the end of the last one (`done` finished, `frac` of the current one), so the main event's
 * entrance lands on nearly full stands.
 */
export function prelimFill(start: number, done: number, n: number, frac: number): number {
  if (start >= PRELIM_FILL_END) return start;
  const p = n <= 0 ? 1 : Math.min(1, (done + Math.max(0, Math.min(1, frac))) / n);
  return start + (PRELIM_FILL_END - start) * p;
}

/**
 * The evening's timeline in real seconds at 1× (show time runs with the frame clock; a frame counts at most 0.1 s, so
 * this holds from 10 frames a second up). `bouts`: the preliminaries' bout lengths, `main` the main bout's.
 */
export function timeline(o: { filling: number; entrance: number; result: number; leaving: number; prelimBouts: readonly number[]; main: number }) {
  const prelims = o.prelimBouts.map(b => PRELIM.walk + b + PRELIM.result);
  const toFirstPrelim = o.filling, toFirstBout = o.filling + (prelims.length ? PRELIM.walk : 0);
  const toEntrance = o.filling + prelims.reduce((a, b) => a + b, 0);
  return { toFirstPrelim, toFirstBout, prelims, toEntrance, toMainBout: toEntrance + o.entrance, total: toEntrance + o.entrance + o.main + o.result + o.leaving };
}
