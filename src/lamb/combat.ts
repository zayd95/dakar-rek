/**
 * The bout, phase 1 (docs/wrestling/COMBAT.md): grips, a balance with a direction, resistance, throws that each need their
 * set-up, and the fall rule. Pure data and functions (no Three.js, no DOM), unit-tested in tests/combat.test.ts; the
 * player's own bout in src/lamb/duel.ts drives them for both wrestlers alike, and the opponent's AI (src/lamb/combatAi.ts)
 * reads only what they show.
 *
 * It extends Làmb 2.0 (src/lamb/stand.ts, clinch.ts) rather than replacing it: the same endurance, balance (0–100) and
 * composure, the same strikes avec frappe, the same push / pull / pivot triangle in the empoignade (« Tirer bat Pousser,
 * Pivoter bat Tirer, Pousser bat Pivoter »), the same counter. What it adds:
 *
 * - **A direction to the balance.** Each wrestler's imbalance is a vector in his own frame (`f` towards the other man,
 *   `s` to his own left): its length is the balance lost (1 − balance/100), its direction where the weight has gone. A
 *   push sends him back, a pull forward, a pivot sideways, a strike back; consistent work stacks, a pull after a push
 *   gives him his feet back. Balance comes back by itself (slower when tired) and the direction stays.
 * - **Weight.** Where a wrestler leans now (the stick: towards him, away, to a side). Leaning into a direction makes him
 *   strong against being moved the other way and weak against being moved that way: the brace is a choice of
 *   direction, and a lean held all the time is a habit the other reads.
 * - **Grips.** Four holds, each a trade between control and exposure (GRIPS); a hold has a strength that slides with
 *   the endurance and the exchanges; it is won (taken, taken deeper), lost (worn to nothing) and broken (Casser).
 * - **Throws.** Six, each needing its set-up (THROWS): a hold that allows it and the other's imbalance deep enough in its
 *   direction. A throw on a balanced, fresh man fails and costs the thrower his balance and his hold.
 * - **Resistance.** Bracing against a throw (the weight against its direction, in its last moments) takes most of it
 *   away, for endurance; a tired wrestler cannot brace (he slips). Contrer (Làmb 2.0's counter) stays the bolder answer.
 * - **The fall** (docs/LAMB_RULES.md): the back on the sand, or the four supports (hands and knees). Out of the circle is
 *   not a fall: the referee stops, puts them back in the middle and gives the point to the one who stayed in.
 * - **The referee presses passivity**: a wrestler who does not attack while the other does is warned, and each warning
 *   is a point for the other at the decision — a held guard no longer draws a bout.
 */
import { k, type Attributes } from './stand';
import type { ClinchMove } from './clinch';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A direction or a lean in a wrestler's own frame: `f` towards the other man, `s` to his own left. */
export interface Vec { f: number; s: number }
export const ZERO: Readonly<Vec> = Object.freeze({ f: 0, s: 0 });
export const dot = (a: Vec, b: Vec) => a.f * b.f + a.s * b.s;
export const len = (a: Vec) => Math.hypot(a.f, a.s);

// ------------------------------------------------------------------ grips

export type GripKind = 'nuque' | 'bras' | 'ceinture' | 'jambe';
export interface GripDef {
  /** Player-facing words (French). */
  label: string; short: string;
  /** How much a move or a throw from this hold does (×). */
  control: number;
  /** How much the other's moves and throws do to the one holding it (×): a deep hold commits the body. */
  exposure: number;
  /** Seconds the reach for it takes standing (the other sees it coming), and how far it reaches (m between centres). */
  reach: number; range: number;
  /** The hold one goes deeper to from here (Saisir in the empoignade), and the one a worn hold falls back to. */
  deeper: GripKind | null; shallower: GripKind | null;
}
/**
 * The holds (control vs exposure):
 * - nuque (nape and shoulders): quick and safe to take, little control — he can still go for the belt or the leg;
 * - bras (arm and shoulder): won from the nape, the middle way: sweeps and the hip throw;
 * - ceinture (the belt, the ngemb): slow to take, the reach is seen coming, the chest comes against his: the most control
 *   (lifts, hips) — and his hips are against yours too;
 * - jambe (a leg, taken when he leans in): the most decisive and the most exposed, head down: sprawled on, it ends on
 *   the four supports.
 */
export const GRIPS: Record<GripKind, GripDef> = {
  nuque: { label: 'nuque et épaules', short: 'Nuque', control: 0.85, exposure: 0.85, reach: 0.22, range: 1.5, deeper: 'bras', shallower: null },
  bras: { label: 'bras et épaule', short: 'Bras', control: 1.0, exposure: 1.0, reach: 0.3, range: 1.5, deeper: 'ceinture', shallower: 'nuque' },
  ceinture: { label: 'ceinture', short: 'Ceinture', control: 1.25, exposure: 1.15, reach: 0.5, range: 1.75, deeper: null, shallower: 'bras' },
  jambe: { label: 'jambe', short: 'Jambe', control: 1.3, exposure: 1.4, reach: 0.32, range: 1.6, deeper: null, shallower: 'nuque' },
};
export interface Hold { kind: GripKind | null; str: number }

export const COMBAT = {
  /** A hold's strength drifts to what the endurance can hold: `capBase` + `capRange` × min(1, stamina / `capFull`). */
  capBase: 35, capRange: 65, capFull: 60,
  /** Strength per second: lost above the cap (it slides out of tired hands), gained below it (it settles in). */
  slide: 12, settle: 4,
  /** An exchange: the winner's hold firms up, the loser's gives (× his exposure). */
  winStr: 8, loseStr: 10,
  /** Going deeper (Saisir in the empoignade): its cost, its time (the hold is weak meanwhile: exposure ×1.3), the strength it needs and keeps. */
  deeperCost: 8, deeperTime: 0.35, deeperNeeds: 35, deeperKeeps: 42,
  /** Weight: how far a full lean commits the body (its own balance), and how fast it gets there (balance per second). */
  commit: 0.18, commitRate: 30,
  /** Bracing: a full brace takes this share of a move or a throw away; leaning into it adds this share. */
  brace: 0.6, into: 0.35,
  /** Below this endurance a brace weakens (to 30 % at 0): a tired wrestler slips. */
  braceTired: 30,
  /** A throw takes the other down at this score; bracing a throw takes up to `braceThrow` off it and costs `braceCost` + `braceCostMore` × quality. */
  throwAt: 48, braceThrow: 55, braceCost: 4, braceCostMore: 6,
  /** A throw that fails: the thrower over-committed (balance, in his own direction) and let go (strength). */
  failBalance: 20, failStr: 20,
  /** Contrer while braced right is easier (counter score +). */
  counterBrace: 12,
  /** The leg taken: the other is on one leg (balance taken backwards). */
  legShove: 22,
  /** A reach that misses or is parried leaves its author open (s), a deep one also off balance forward. */
  missOpen: 0.9, deepMissOpen: 1.1, deepMissBalance: 15,
  /** A guard raised more than this long ago no longer parries a hand grip (arms tire, the parry is a timing, not a wall). */
  parryFresh: 0.6,
  /** The pair's shared motion: speed per unit of drive (m/s), how fast it settles (s), impulse of a landed move (× its drive). */
  driveSpeed: 0.7, momentum: 0.4, impulse: 3,
  /** Lean (balance per second) a wrestler driven back or dragged without bracing takes. */
  dragLean: 7,
  /** The referee separates an empoignade that goes nowhere after this long (not while one is about to fall). */
  clinchMax: 10,
  /**
   * The empoignade's economy in the new bout, against Làmb 2.0's (src/lamb/clinch.ts): an exchange moves the balance this
   * share of Làmb 2.0's (a bout is decided by a throw on a man set up, not by attrition), a move costs this share of its
   * endurance, the hold's drain is this share, and a man not moving gets this much balance back a second on top.
   */
  exchange: 0.5, moveCost: 0.4, drain: 0.35, regen: 4,
  /** Breath got back a second in the empoignade by a man neither moving nor bracing (he holds and breathes). */
  breathe: 3,
} as const;

/** The hold's control and exposure (none: as bare hands). */
export const control = (h: Hold) => (h.kind ? GRIPS[h.kind].control : 0.6);
export const exposure = (h: Hold) => (h.kind ? GRIPS[h.kind].exposure : 1);
/** The cap a hold's strength drifts to with this much endurance. */
export const gripCap = (stamina: number) => COMBAT.capBase + COMBAT.capRange * Math.min(1, Math.max(0, stamina) / COMBAT.capFull);
/** A hold over time: it slides above what the endurance holds, settles in below it. */
export function gripTick(h: Hold, stamina: number, dt: number) {
  if (!h.kind) return;
  const cap = gripCap(stamina);
  h.str = h.str > cap ? Math.max(cap, h.str - COMBAT.slide * dt) : Math.min(cap, h.str + COMBAT.settle * dt);
}
/** A hold worn down: under 0 it falls back to the shallower hold (a third of its strength), or is lost. True when it changed. */
export function wear(h: Hold, by: number): boolean {
  if (!h.kind) return false;
  h.str -= by;
  if (h.str > 0) return false;
  const back = GRIPS[h.kind].shallower;
  h.kind = back; h.str = back ? 30 : 0;
  return true;
}
/**
 * The Prise (the bar of the empoignade, from `a`'s side, −100…100): how much better `a` holds than `b` — each hold's
 * strength times its control. It is what Làmb 2.0's grip advantage was (slipRate, clinchPower, counterScore read it).
 */
export const gripAdvantage = (a: Hold, b: Hold) => clamp(0.9 * (a.str * control(a) - b.str * control(b)), -100, 100);

// ------------------------------------------------------------------ balance with a direction

/** What combat.ts needs of a wrestler: Làmb 2.0's state, plus the direction of his imbalance, his weight and his hold. */
export interface Combatant {
  stamina: number; max: number; balance: number; composure: number; attrs: Attributes;
  /** Where his imbalance points (unit, own frame); meaningful while balance < 100. */
  dir: Vec;
  /** Where he leans now (the stick, own frame, length ≤ 1). */
  weight: Vec;
  hold: Hold;
}
/** His imbalance as a vector (own frame): the direction times the depth (0 balanced … 1 falling). */
export function lean(c: Pick<Combatant, 'balance' | 'dir'>): Vec {
  const d = 1 - clamp(c.balance, 0, 100) / 100;
  return { f: c.dir.f * d, s: c.dir.s * d };
}
/**
 * Moves `c`'s balance by `amount` (balance points) in direction `d` (own frame, unit): the imbalance vector and the push
 * add up — the same way deepens it, the other way gives him his feet back. Returns the depth change (balance points lost,
 * negative when it helped him).
 */
export function shove(c: Pick<Combatant, 'balance' | 'dir'>, d: Vec, amount: number): number {
  const b0 = c.balance, d0 = 1 - clamp(b0, 0, 100) / 100;
  const vf = c.dir.f * d0 + d.f * amount / 100, vs = c.dir.s * d0 + d.s * amount / 100, m = Math.hypot(vf, vs);
  if (m > 1e-6) c.dir = { f: vf / m, s: vs / m };
  c.balance = 100 * (1 - Math.min(1, m));
  return b0 - c.balance;
}
/** Balance taken by other rules (a strike: src/lamb/stand.ts land) given its direction: `before` is the balance it had. */
export function aimLoss(c: Pick<Combatant, 'balance' | 'dir'>, before: number, d: Vec) {
  const lost = before - c.balance; if (lost <= 0) return;
  c.balance = before; shove(c, d, lost);
}
/** How hard a wrestler can brace now (1 fresh … 0.3 spent). */
export const braceStamina = (stamina: number) => (stamina >= COMBAT.braceTired ? 1 : 0.3 + 0.7 * Math.max(0, stamina) / COMBAT.braceTired);
/**
 * How much of an effect in direction `d` (own frame) reaches `c`, by his weight: leaning against it braces (down to
 * 1 − COMBAT.brace, less when tired), leaning into it makes it worse (up to 1 + COMBAT.into), neutral is 1.
 */
export function braceFactor(c: Pick<Combatant, 'weight' | 'stamina'>, d: Vec): number {
  const a = dot(c.weight, d);
  return a < 0 ? 1 + a * COMBAT.brace * braceStamina(c.stamina) : 1 + a * COMBAT.into;
}
/** His weight commits him: leaning, his own balance follows the lean a little (`commit` × its length). Per step. */
export function commitTick(c: Pick<Combatant, 'balance' | 'dir' | 'weight'>, dt: number) {
  const w = len(c.weight); if (w < 0.2) return;
  const u = { f: c.weight.f / w, s: c.weight.s / w }, along = dot(lean(c), u);
  if (along < COMBAT.commit * w) shove(c, u, Math.min(COMBAT.commitRate * dt, 100 * (COMBAT.commit * w - along)));
}

/** The direction (own frame of the one it hurts) a move sends him: a push back, a pull forward, a pivot to a side. */
export function moveDir(kind: ClinchMove, side = 1): Vec {
  return kind === 'push' ? { f: -1, s: 0 } : kind === 'pull' ? { f: 1, s: 0 } : { f: 0, s: side >= 0 ? -1 : 1 };
}

// ------------------------------------------------------------------ throws

export type ThrowId = 'hanche' | 'croc' | 'balayage' | 'souleve' | 'jambe' | 'ramene';
export type FallKind = 'dos' | 'appuis';
export interface ThrowDef {
  /** The button's word and the name said (French). */
  label: string; name: string;
  /** The holds it can be thrown from. */
  grips: readonly GripKind[];
  /** Which way it sends him (his own frame): towards the thrower, away, to the side he leans on, or up (a lift). */
  dir: 'avant' | 'arriere' | 'cote' | 'haut';
  /** How he lands (the fall rule): on his back, or on the four supports. */
  fall: FallKind;
  /** Seconds it is set up (the other sees it: its tell), endurance it costs. */
  windup: number; cost: number;
  /** What the body shows while it is set up, and how to set it up (the lesson and the tells). */
  tell: string; setup: string;
}
/**
 * Six throws of our own (movement placeholders of the game, not the reproduction of any real technique; names generic):
 * - Hanche: from the arm or the belt, on a man whose weight comes forward (pull him first): over the hip, on his back.
 * - Croc: a heel hooked from any upper hold, on a man whose weight goes back (push him first): on his back.
 * - Balayage: from the nape or the arm, on a man whose weight is on one side (pivot him first): swept, on his back.
 * - Soulevé: from the belt only, on a man unsettled and more tired than you: lifted and dropped. The longest to set up.
 * - Jambe: the leg held (taken when he leans in): driven back onto his back.
 * - Ramené: from the nape, on a man whose head and weight come forward: brought down onto the four supports.
 */
export const THROWS: Record<ThrowId, ThrowDef> = {
  hanche: { label: 'Hanche', name: 'la hanche', grips: ['bras', 'ceinture'], dir: 'avant', fall: 'dos', windup: 0.55, cost: 12, tell: 'il tourne la hanche contre toi', setup: 'tire-le vers toi, puis Hanche' },
  croc: { label: 'Croc', name: 'le croc', grips: ['nuque', 'bras', 'ceinture'], dir: 'arriere', fall: 'dos', windup: 0.5, cost: 10, tell: 'il avance une jambe derrière la tienne', setup: 'pousse-le en arrière, puis Croc' },
  balayage: { label: 'Balayage', name: 'le balayage', grips: ['nuque', 'bras'], dir: 'cote', fall: 'dos', windup: 0.45, cost: 10, tell: 'il charge un côté et balaie', setup: 'tourne-le sur un côté, puis Balayage' },
  souleve: { label: 'Soulevé', name: 'le soulevé', grips: ['ceinture'], dir: 'haut', fall: 'dos', windup: 0.75, cost: 18, tell: 'il plie les jambes sous toi', setup: 'à la ceinture, quand il est fatigué et déséquilibré' },
  jambe: { label: 'Jambe', name: 'la jambe', grips: ['jambe'], dir: 'arriere', fall: 'dos', windup: 0.42, cost: 12, tell: 'il pousse sur ta jambe tenue', setup: 'prends la jambe quand il se penche, puis pousse' },
  ramene: { label: 'Ramené', name: 'le ramené', grips: ['nuque'], dir: 'avant', fall: 'appuis', windup: 0.42, cost: 8, tell: 'il te tire la tête vers le sol', setup: 'à la nuque, quand il se penche vers toi' },
};
export const THROW_IDS = Object.keys(THROWS) as ThrowId[];
/** The direction a throw sends him (his own frame), given his lean (a sweep goes to the side he leans on). */
export function throwVec(id: ThrowId, his: Pick<Combatant, 'dir'>): Vec {
  const d = THROWS[id].dir;
  return d === 'avant' ? { f: 1, s: 0 } : d === 'arriere' ? { f: -1, s: 0 } : d === 'cote' ? { f: 0, s: his.dir.s >= 0 ? 1 : -1 } : { f: 0.5, s: 0 };
}
/** How a reversed throw lands its author: a leg sprawled on ends on the four supports, the others on the back. */
export const reverseFall = (id: ThrowId): FallKind => (id === 'jambe' ? 'appuis' : 'dos');
/**
 * The set-up (0…1): how deep his imbalance is (1 − balance) times how well it points the throw's way. The lift needs no
 * direction but less of it (any unsettled man, best when he leans on you) and more breath than his.
 */
export function setup(id: ThrowId, att: Pick<Combatant, 'stamina'>, def: Pick<Combatant, 'balance' | 'dir' | 'stamina'>): number {
  const depth = 1 - clamp(def.balance, 0, 100) / 100, t = THROWS[id];
  if (t.dir === 'haut') return clamp(depth * (0.55 + 0.35 * Math.max(0, def.dir.f)) + clamp((att.stamina - def.stamina) / 120, -0.25, 0.25), 0, 1);
  const along = t.dir === 'avant' ? def.dir.f : t.dir === 'arriere' ? -def.dir.f : Math.abs(def.dir.s);
  return depth * Math.max(0, along);
}
/** The throws this hold allows. */
export const throwsFrom = (h: Hold): ThrowId[] => (h.kind ? THROW_IDS.filter(id => THROWS[id].grips.includes(h.kind!)) : []);
/**
 * The throw this hold gives now: the one whose set-up is the best (the button says its name, and lights when it is
 * ready); null without a hold.
 */
export function bestThrow(att: Pick<Combatant, 'hold' | 'stamina'>, def: Pick<Combatant, 'balance' | 'dir' | 'stamina'>): { id: ThrowId; setup: number } | null {
  let best: { id: ThrowId; setup: number } | null = null;
  for (const id of throwsFrom(att.hold)) { const s = setup(id, att, def); if (!best || s > best.setup) best = { id, setup: s }; }
  return best;
}
/**
 * How well throw `id` by `att` takes `def` down now (≥ COMBAT.throwAt: he goes down). The set-up does most of it; the
 * hold, the thrower's own balance, his Force and Technique, a man caught mid-move or spent, a man leaning into it add;
 * the defender's brace (0…1: his weight against it in its last moments, his breath) takes up to COMBAT.braceThrow off.
 * Never `power > defence`: on a balanced, fresh man every throw fails.
 */
export function throwScore(id: ThrowId, att: Pick<Combatant, 'hold' | 'balance' | 'attrs' | 'stamina'>, def: Pick<Combatant, 'balance' | 'dir' | 'stamina' | 'weight'>, o: { brace?: number; moving?: boolean } = {}): number {
  const v = throwVec(id, def);
  return 110 * setup(id, att, def)
    + (att.hold.str * control(att.hold) - 50) * 0.2
    + (att.balance - 50) * 0.1
    + (k(att.attrs.force) + k(att.attrs.technique) - 2) * 30
    + (o.moving ? 10 : 0)
    + (def.stamina < 20 ? (20 - def.stamina) * 0.6 : 0)
    + Math.max(0, dot(def.weight, v)) * 15
    - clamp(o.brace ?? 0, 0, 1) * COMBAT.braceThrow;
}
/** The brace against throw `id` (0…1): his weight against its direction, as hard as his breath allows. */
export function braceAgainst(id: ThrowId, def: Pick<Combatant, 'weight' | 'stamina' | 'dir'>): number {
  return Math.max(0, -dot(def.weight, throwVec(id, def))) * braceStamina(def.stamina);
}
/**
 * A throw that failed: the thrower over-committed and let go — his imbalance deepens the way it already went (forward,
 * or back for a lift, when he stood straight), and his hold weakens. It always costs: it never gives him his feet back.
 */
export function throwFails(id: ThrowId, att: Pick<Combatant, 'balance' | 'dir' | 'attrs' | 'hold'>) {
  const was = 1 - att.balance / 100 > 0.05 ? { ...att.dir } : { f: THROWS[id].dir === 'haut' ? -1 : 1, s: 0 };
  shove(att, was, COMBAT.failBalance / k(att.attrs.equilibre));
  wear(att.hold, COMBAT.failStr);
}
/** Bracing a throw costs breath: more for a fuller brace. */
export const braceCost = (quality: number) => COMBAT.braceCost + COMBAT.braceCostMore * clamp(quality, 0, 1);

/** How a wrestler goes down when his balance runs out in the empoignade: forward onto his four supports, else on his back. */
export const slipFall = (c: Pick<Combatant, 'dir'>): FallKind => (c.dir.f > 0.35 ? 'appuis' : 'dos');

// ------------------------------------------------------------------ the standing reach (the grip fight before the empoignade)

/**
 * What a reach for a hold becomes: a tap reaches for the nape (`nuque`); a hold of Saisir goes for the belt
 * (`ceinture`); a reach while he leans in or comes in goes for his leg (`jambe`).
 */
export function reachFor(kind: 'tap' | 'hold', him: Pick<Combatant, 'balance' | 'dir' | 'weight'>): GripKind {
  if (legOpen(him)) return 'jambe';
  return kind === 'hold' ? 'ceinture' : 'nuque';
}
/** His leg is there to take: he leans in (his weight or his imbalance forward, towards you). */
export const legOpen = (him: Pick<Combatant, 'balance' | 'dir' | 'weight'>) => lean(him).f > 0.2 || him.weight.f > 0.75;
/** The holds an empoignade starts with: the one reached (strength by how it was entered) and the other's reflex hold. */
export function entryHolds(kind: GripKind, bonus: number): { att: Hold; def: Hold } {
  const base = kind === 'jambe' ? 55 : kind === 'ceinture' ? 50 : 42;
  return { att: { kind, str: clamp(base + bonus / 2, 10, 95) }, def: { kind: 'nuque', str: kind === 'nuque' ? 30 : kind === 'ceinture' ? 25 : 20 } };
}

// ------------------------------------------------------------------ the referee: passivity, the decision

/** Seconds standing without an attack (a reach, a strike, a throw) before the referee warns the passive one — when the other attacked meanwhile. */
export const PASSIVE = { after: 9 } as const;
/** What the referee counts in the new bout (on top of Làmb 2.0's BoutScore). */
export interface CombatTally { throws: number; sorties: number; warnings: number; advantages: number }
export const emptyTally = (): CombatTally => ({ throws: 0, sorties: 0, warnings: 0, advantages: 0 });
/**
 * Points at the decision: parries, reaches and breaks (1 each), clean strikes (1) and staggers (2) avec frappe, throws
 * attempted (1), a man pushed out of the circle (2), a man brought to the edge of the fall (1) — and each warning for
 * passivity is a point for the other.
 */
export function combatPoints(s: { guards: number; grabs: number; breaks: number; hits?: number; staggers?: number }, t: CombatTally, other: CombatTally): number {
  return s.guards + s.grabs + s.breaks + (s.hits ?? 0) + 2 * (s.staggers ?? 0) + t.throws + 2 * t.sorties + t.advantages + other.warnings;
}
/**
 * The referee's decision at the bell: more points; equal, the one warned less; still equal, the one who attempted more
 * throws; only then a draw.
 */
export function combatDecision(a: { score: Parameters<typeof combatPoints>[0]; tally: CombatTally }, b: { score: Parameters<typeof combatPoints>[0]; tally: CombatTally }): 'a' | 'b' | null {
  const pa = combatPoints(a.score, a.tally, b.tally), pb = combatPoints(b.score, b.tally, a.tally);
  if (pa !== pb) return pa > pb ? 'a' : 'b';
  if (a.tally.warnings !== b.tally.warnings) return a.tally.warnings < b.tally.warnings ? 'a' : 'b';
  if (a.tally.throws !== b.tally.throws) return a.tally.throws > b.tally.throws ? 'a' : 'b';
  return null;
}

/** The stick's direction class in the empoignade (own frame): a push, a pull, a pivot to a side, or nothing. */
export function stickMove(w: Vec, dead = 0.55): { kind: ClinchMove; side: number } | null {
  const m = len(w); if (m < dead) return null;
  if (w.f >= 0.6 * m) return { kind: 'push', side: 0 };
  if (w.f <= -0.6 * m) return { kind: 'pull', side: 0 };
  return { kind: 'pivot', side: w.s >= 0 ? 1 : -1 };
}
