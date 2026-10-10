/**
 * Làmb 2.0 — the empoignade (docs/LAMB2.md, spec 10 Oct. §10–11). Pure data and functions, tested in tests/lamb2.test.ts.
 *
 * Step 2 — the entry: how a grab becomes an empoignade decides who holds the better grip (« avantage de saisie »,
 * −100…100 for the one who grabbed). Grabbing a wrestler who staggers or who has just missed gives a strong grip; a
 * plain grab in neutral a small one; the balance each brings in, technique and force tilt it. The grip then weighs in
 * the empoignade until the next steps make it move (push, pull, pivot, change of grip).
 */
import { k, type Attributes } from './stand';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * How the empoignade started: a plain grab, a grab under a raised guard (hands up for strikes, the body is open), on an
 * opening (a missed or guarded big strike, a failed grab), on a wrestler who staggers, or a grab that landed after its
 * response window.
 */
export type Entry = 'neutral' | 'open' | 'stagger' | 'late' | 'guard';
export const ENTRY_BONUS: Record<Entry, number> = { neutral: 0, late: 10, guard: 12, open: 18, stagger: 32 };
export const ENTRY_TEXT: Record<Entry, string> = {
  neutral: 'Empoignade', late: 'Saisie réussie', guard: 'Saisi sous la garde', open: 'Saisie sur l’ouverture', stagger: 'Saisi pendant qu’il vacille',
};

export interface Grappler { balance: number; attrs: Attributes }

/** Grip advantage for `a`, who grabbed `d`, at the moment the empoignade starts (−80…80). */
export function entryGrip(entry: Entry, a: Grappler, d: Grappler): number {
  return clamp(15 + ENTRY_BONUS[entry] + (a.balance - d.balance) * 0.3
    + (k(a.attrs.technique) - k(d.attrs.technique)) * 60 + (k(a.attrs.force) - k(d.attrs.force)) * 30, -80, 80);
}

/**
 * Strength in the empoignade with strikes: effort (taps or the AI's push), endurance, the balance brought in and the
 * grip (`grip` is this wrestler's side of it: + when he holds the better grip). A strong grip is worth about three
 * seconds of tapping; it never decides alone.
 */
export function clinchPower(effort: number, stamina: number, balance: number, grip: number): number {
  return effort + stamina / 40 + clamp(balance, 0, 100) / 50 + clamp(grip, -100, 100) / 25;
}

/** Words for the grip from the player's side. */
export function gripWords(grip: number): string {
  const g = Math.round(grip);
  if (g >= 40) return 'Prise : gros avantage pour toi';
  if (g >= 12) return 'Prise : avantage pour toi';
  if (g > -12) return 'Prise : égale';
  if (g > -40) return 'Prise : avantage pour lui';
  return 'Prise : gros avantage pour lui';
}

// ------------------------------------------------------------------ step 3: the empoignade is played

/**
 * Three moves in the empoignade, each telegraphed by the body while it is set up (`windup`), then applied:
 *  - pousser (push): drive him back with force;
 *  - tirer (pull): draw him in, using his own force;
 *  - pivoter (pivot): turn him off his line, with technique.
 * When a move lands, what the other wrestler is setting up at that moment decides the exchange — a triangle, so
 * reading the other's body matters more than pressing fast:
 *  - tirer beats pousser (he pushes into nothing: the pusher loses a lot of balance),
 *  - pivoter beats tirer (you turn out of his pull: the puller loses balance),
 *  - pousser beats pivoter (you cannot turn a man who drives you: the pivoter loses balance),
 *  - the same move on both sides is a clash of force (push), technique (pull) or nothing (pivot);
 *  - against a wrestler doing nothing, each move takes a little balance or grip.
 * Winning an exchange also moves the grip. Effects grow with the grip one holds (up to ±50 %), the attribute of the
 * move (Force for push, Technique for pull and pivot) and shrink with the target's Équilibre. A wrestler whose balance
 * reaches zero in the empoignade goes down (step 6 will add the throw attempt, the counter and the fall itself).
 * Casser (break free) costs endurance and only works when the grip is not too much against you.
 */
export type ClinchMove = 'push' | 'pull' | 'pivot';
export const MOVES: Record<ClinchMove, { label: string; doing: string; windup: number; cost: number }> = {
  push: { label: 'Pousser', doing: 'pousse', windup: 0.42, cost: 6 },
  pull: { label: 'Tirer', doing: 'tire', windup: 0.36, cost: 5 },
  pivot: { label: 'Pivoter', doing: 'pivote', windup: 0.4, cost: 5 },
};
/** Which move beats which. */
export const BEATS: Record<ClinchMove, ClinchMove> = { pull: 'push', pivot: 'pull', push: 'pivot' };

export const CLINCH = {
  /** Balance recovery per second inside the empoignade (slower than standing). */
  balanceRegen: 5,
  /** Endurance per second for both while they hold each other. */
  drain: 3,
  /** Pause after a move lands before the next one. */
  recover: 0.22,
  /** Breaking free: its cost, and the grip below which it fails. */
  breakCost: 20, breakFloor: -35, breakMissCost: 8,
  /** Seconds after which the referee separates an empoignade that goes nowhere. */
  maxSeconds: 9,
} as const;

/** A wrestler inside the empoignade (shares stamina and balance with the stand-up state). */
export interface Holder { stamina: number; balance: number; attrs: Attributes; move: { kind: ClinchMove; t: number } | null; recover: number }
export const holder = (s: { stamina: number; balance: number; attrs: Attributes }): Holder => ({ stamina: s.stamina, balance: s.balance, attrs: s.attrs, move: null, recover: 0 });

/** Seconds a move takes to land for this wrestler (explosive ones are quicker, ±15 %). */
export const moveWindup = (kind: ClinchMove, h: Pick<Holder, 'attrs'>) => MOVES[kind].windup * (1.15 - (0.3 * clamp(h.attrs.explosivite, 0, 100)) / 100);

/** Starts a move; false when one is already set, during the pause, or without the endurance for it. */
export function startMove(h: Holder, kind: ClinchMove): boolean {
  if (h.move || h.recover > 0 || h.stamina < MOVES[kind].cost) return false;
  h.stamina -= MOVES[kind].cost; h.move = { kind, t: 0 };
  return true;
}

export type ExchangeResult = 'drive' | 'counter' | 'clash' | 'even';
export interface Exchange {
  /** The move that landed and what the other was setting up (null: nothing). */
  move: ClinchMove; against: ClinchMove | null;
  /** Who came out ahead: the one whose move landed ('a'), the other ('b'), or nobody. */
  winner: 'a' | 'b' | null;
  result: ExchangeResult;
  /** Balance lost by the loser, grip moved towards the winner (from a's side: + is a's way). */
  balance: number; grip: number;
  /** How the pair moves: metres along a's facing (+ drives b back), and a turn in radians. */
  drive: number; turn: number;
}

const mult = (grip: number) => 1 + clamp(grip, -100, 100) / 200;
const attrOf = (kind: ClinchMove, h: Pick<Holder, 'attrs'>) => k(kind === 'push' ? h.attrs.force : h.attrs.technique);

/**
 * `a`'s move lands while `b` sets up his own (or nothing). Applies the exchange to both (balance, grip, b's move is
 * spent) and returns it. `grip` is from a's side.
 */
export function exchange(a: Holder, b: Holder, grip: number): Exchange {
  const move = a.move!.kind, against = b.move?.kind ?? null;
  const out: Exchange = { move, against, winner: null, result: 'even', balance: 0, grip: 0, drive: 0, turn: 0 };
  a.move = null; a.recover = CLINCH.recover;
  if (b.move) { b.move = null; b.recover = CLINCH.recover; }
  const hurt = (who: Holder, by: Holder, kind: ClinchMove, base: number, g: number) => {
    const v = (base * attrOf(kind, by) * mult(g)) / k(who.attrs.equilibre);
    who.balance = Math.max(0, who.balance - v);
    return v;
  };
  if (!against) {
    out.winner = 'a'; out.result = 'drive';
    if (move === 'push') { out.balance = hurt(b, a, move, 10, grip); out.grip = 6; out.drive = 0.35; }
    else if (move === 'pull') { out.balance = hurt(b, a, move, 6, grip); out.grip = 4; out.drive = -0.2; }
    else { out.balance = hurt(b, a, move, 4, grip); out.grip = 8; out.turn = 0.6; }
    return out;
  }
  if (BEATS[move] === against) {                                     // a's move beats what b was setting up
    out.winner = 'a'; out.result = 'counter';
    out.balance = hurt(b, a, move, move === 'pull' ? 18 : 13, grip); out.grip = move === 'pull' ? 12 : 9;
    out.drive = move === 'push' ? 0.4 : move === 'pull' ? -0.3 : 0; out.turn = move === 'pivot' ? 0.8 : 0;
    return out;
  }
  if (BEATS[against] === move) {                                     // b was setting up the answer to a's move
    out.winner = 'b'; out.result = 'counter';
    out.balance = hurt(a, b, against, against === 'pull' ? 18 : 13, -grip); out.grip = -(against === 'pull' ? 12 : 9);
    out.drive = against === 'push' ? -0.4 : against === 'pull' ? 0.3 : 0; out.turn = against === 'pivot' ? -0.8 : 0;
    return out;
  }
  // the same move on both sides
  out.result = 'clash';
  if (move === 'pivot') { out.turn = 0.4; return out; }
  const power = (h: Holder, g: number) => attrOf(move, h) * mult(g) * (0.6 + 0.4 * h.balance / 100) * (0.7 + 0.3 * Math.min(1, h.stamina / 50));
  const pa = power(a, grip), pb = power(b, -grip);
  if (Math.abs(pa - pb) < 0.04) { a.balance = Math.max(0, a.balance - 3); b.balance = Math.max(0, b.balance - 3); out.balance = 3; return out; }
  const aWins = pa > pb;
  out.winner = aWins ? 'a' : 'b';
  out.balance = aWins ? hurt(b, a, move, 8, grip) : hurt(a, b, move, 8, -grip);
  out.grip = aWins ? 5 : -5;
  out.drive = move === 'push' ? (aWins ? 0.3 : -0.3) : 0;
  return out;
}

/**
 * One step of a wrestler in the empoignade: the hold drains endurance, balance comes back slowly, his move sets up.
 * Returns true when his move lands this step (the caller then calls `exchange`).
 */
export function holdTick(h: Holder, dt: number): boolean {
  h.recover = Math.max(0, h.recover - dt);
  h.stamina = Math.max(0, h.stamina - CLINCH.drain * dt);
  if (!h.move) h.balance = Math.min(100, h.balance + CLINCH.balanceRegen * k(h.attrs.equilibre) * dt);
  if (!h.move) return false;
  h.move.t += dt;
  return h.move.t >= moveWindup(h.move.kind, h);
}

/** Breaking free: works when the grip is not too much against him (`grip` from his side) and he has the endurance. */
export function tryBreak(h: Holder, grip: number): boolean {
  if (h.move || h.stamina < CLINCH.breakCost || grip < CLINCH.breakFloor) { h.stamina = Math.max(0, h.stamina - CLINCH.breakMissCost); return false; }
  h.stamina -= CLINCH.breakCost;
  return true;
}

/** The opponent's choices in the empoignade, by style. */
export interface ClinchStyle {
  /** Preferred moves (weights) when it has nothing to read. */
  prefer: Record<ClinchMove, number>;
  /** Chance to read the player's move while it sets up and answer it with the move that beats it. */
  read: number;
  /** Seconds between decisions [min, max]. */
  think: [number, number];
  /** Chance to break free per decision when the grip is clearly against it. */
  breakFree: number;
}
export const CLINCH_STYLES: Record<'costaud' | 'rapide' | 'defensif' | 'partenaire', ClinchStyle> = {
  costaud: { prefer: { push: 0.6, pull: 0.2, pivot: 0.2 }, read: 0.3, think: [0.5, 0.9], breakFree: 0.1 },
  rapide: { prefer: { push: 0.2, pull: 0.3, pivot: 0.5 }, read: 0.35, think: [0.35, 0.7], breakFree: 0.3 },
  defensif: { prefer: { push: 0.2, pull: 0.55, pivot: 0.25 }, read: 0.5, think: [0.45, 0.85], breakFree: 0.35 },
  partenaire: { prefer: { push: 0.6, pull: 0.2, pivot: 0.2 }, read: 0, think: [1.0, 1.4], breakFree: 0 },
};
/** The move that beats `m`. */
export const answer = (m: ClinchMove): ClinchMove => (Object.keys(BEATS) as ClinchMove[]).find(x => BEATS[x] === m)!;

/**
 * The opponent's decision in the empoignade: read and answer the player's move (more with technique, less when
 * rattled), break free when the grip is clearly lost, otherwise its style's preferred move. `grip` from its side.
 */
export function clinchDecide(me: Holder, them: Holder, grip: number, st: ClinchStyle, level: number, composure: number, r: () => number): ClinchMove | 'break' | null {
  if (me.move || me.recover > 0) return null;
  if (them.move && r() < Math.min(0.9, st.read * level * k(me.attrs.technique) * (0.5 + composure / 200))) return answer(them.move.kind);
  if (grip < -40 && me.stamina > CLINCH.breakCost + 10 && r() < st.breakFree * level) return 'break';
  const x = r() * (st.prefer.push + st.prefer.pull + st.prefer.pivot);
  return x < st.prefer.push ? 'push' : x < st.prefer.push + st.prefer.pull ? 'pull' : 'pivot';
}
