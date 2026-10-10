/**
 * Làmb 2.0 — the empoignade (docs/LAMB2.md, spec 10 Oct. §10–11). Pure data and functions, tested in tests/lamb2.test.ts.
 *
 * Step 2 — the entry: how a grab becomes an empoignade decides who holds the better grip (« avantage de saisie »,
 * −100…100 for the one who grabbed). Grabbing a wrestler who staggers or who has just missed gives a strong grip; a
 * plain grab in neutral a small one; the balance each brings in, technique and force tilt it. The grip then weighs in
 * the empoignade until the next steps make it move (push, pull, pivot, change of grip).
 */
import { k, type Attributes, type Style6 } from './stand';

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
  /**
   * Seconds after which the referee separates an empoignade that goes nowhere — not while a wrestler is about to go
   * down (posture « chute »): that one he lets finish, up to `graceSeconds` more.
   */
  maxSeconds: 9, graceSeconds: 4,
  /**
   * Fatigue (spec §8: errors come with fatigue): a wrestler spent below `spent` endurance can no longer hold his
   * balance in the empoignade — it does not come back and wears away at `spentSlip` per second (more when the grip is
   * against him). Whoever ran out first is the one who goes down.
   */
  spent: 6, spentSlip: 10,
} as const;

/**
 * The referee presses an empoignade that goes nowhere too: after URGE_CLINCH.after seconds the wrestlers look for the
 * throw more (a weaker position will do, more often), fully by URGE_CLINCH.full. 0…1.
 */
export const URGE_CLINCH = { after: 3, full: 7 } as const;
export const clinchUrge = (secondsInClinch: number) => clamp((secondsInClinch - URGE_CLINCH.after) / (URGE_CLINCH.full - URGE_CLINCH.after), 0, 1);

/** A wrestler inside the empoignade (shares stamina and balance with the stand-up state). */
export interface Holder { stamina: number; balance: number; attrs: Attributes; move: { kind: ClinchMove; t: number } | null; recover: number; slow?: number }
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

// ------------------------------------------------------------------ step 4: feeling the position slip

/**
 * A clearly worse grip wears the balance away even between moves: below −25 (from his side) the wrestler slips, faster
 * the worse it is (up to 9 per second at −100), and his balance no longer comes back — he has to win an exchange or
 * break free before it runs out. Returns balance per second lost (0 when the grip is not against him).
 */
export const slipRate = (grip: number) => (grip < -25 ? (-25 - Math.max(-100, grip)) * 0.12 : 0);
/** How a wrestler stands in the empoignade: steady, slipping (« il glisse »), or about to go down. */
export type Posture = 'stable' | 'glisse' | 'chute';
export const posture = (balance: number): Posture => (balance < 25 ? 'chute' : balance < 45 ? 'glisse' : 'stable');

/**
 * One step of a wrestler in the empoignade: the hold drains endurance, balance comes back slowly — or slips away when
 * the grip is clearly against him (`grip` from his side) —, his move sets up. Returns true when his move lands this
 * step (the caller then calls `exchange`).
 */
export function holdTick(h: Holder, dt: number, grip = 0): boolean {
  h.recover = Math.max(0, h.recover - dt);
  h.stamina = Math.max(0, h.stamina - CLINCH.drain * dt);
  const slip = slipRate(grip) + (h.stamina < CLINCH.spent ? CLINCH.spentSlip * (1 + Math.max(0, -grip) / 50) : 0);
  if (slip > 0) h.balance = Math.max(0, h.balance - (slip / k(h.attrs.equilibre)) * dt);
  else if (!h.move) h.balance = Math.min(100, h.balance + CLINCH.balanceRegen * k(h.attrs.equilibre) * dt);
  if (!h.move) return false;
  h.move.t += dt;
  return h.move.t >= moveWindup(h.move.kind, h) * (h.slow ?? 1);
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
  /** Chance to try a throw per decision when the position allows it. */
  throwChance: number;
}
export const CLINCH_STYLES: Record<Style6 | 'partenaire', ClinchStyle> = {
  costaud: { prefer: { push: 0.6, pull: 0.2, pivot: 0.2 }, read: 0.3, think: [0.5, 0.9], breakFree: 0.1, throwChance: 0.55 },
  rapide: { prefer: { push: 0.2, pull: 0.3, pivot: 0.5 }, read: 0.35, think: [0.35, 0.7], breakFree: 0.3, throwChance: 0.4 },
  defensif: { prefer: { push: 0.2, pull: 0.55, pivot: 0.25 }, read: 0.5, think: [0.45, 0.85], breakFree: 0.35, throwChance: 0.3 },
  // Technique reads and answers best, turns and pulls; Bon frappeur wants out of the empoignade to strike again;
  // Grand lutteur de saisie is at home there: drives, throws, never lets go
  technique: { prefer: { push: 0.15, pull: 0.4, pivot: 0.45 }, read: 0.65, think: [0.45, 0.8], breakFree: 0.25, throwChance: 0.35 },
  frappeur: { prefer: { push: 0.4, pull: 0.3, pivot: 0.3 }, read: 0.25, think: [0.5, 0.9], breakFree: 0.45, throwChance: 0.3 },
  saisie: { prefer: { push: 0.45, pull: 0.3, pivot: 0.25 }, read: 0.4, think: [0.4, 0.75], breakFree: 0.05, throwChance: 0.6 },
  partenaire: { prefer: { push: 0.6, pull: 0.2, pivot: 0.2 }, read: 0, think: [1.0, 1.4], breakFree: 0, throwChance: 0 },
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

// ------------------------------------------------------------------ step 5: the throw attempt and the counter

/**
 * « Projeter »: a throw is attempted from the empoignade. It is set up for a moment (the body shows it, the other sees
 * it coming) and costs endurance. When it lands, it takes the other down if the position allows it — his balance (the
 * lower, the easier), the grip (contacts), the thrower's own balance, Force and Technique, and a wrestler caught in the
 * middle of a move is easier to throw. Otherwise it fails and leaves the thrower off balance, his grip loosened.
 * While it is set up the other can « Contrer »: with enough balance, grip and technique he turns it and the thrower goes
 * down; otherwise he only blocks it. Never `power > defence`: the same throw wins or fails by the position.
 */
export const THROW = {
  cost: 12, windup: 0.55,
  /** Score at which a throw takes the other down, and its failure's price. */
  threshold: 40, failBalance: 20, failGrip: 15,
  /** Counter: its cost, the score at which it turns the throw, and what a blocked throw costs the thrower. */
  counterCost: 8, counterThreshold: 38, blockBalance: 10,
} as const;

/** How well a throw by `att` would take `def` down now (≥ THROW.threshold: he goes down). `grip` from att's side. */
export function throwScore(att: Pick<Holder, 'balance' | 'attrs'>, def: Pick<Holder, 'balance' | 'move'>, grip: number): number {
  return (100 - def.balance) * 0.6 + clamp(grip, -100, 100) * 0.4 + (att.balance - 50) * 0.2
    + (k(att.attrs.force) + k(att.attrs.technique) - 2) * 50 + (def.move ? 12 : 0);
}
/** The throw lands (not countered): he goes down, or it fails (balance and grip lost). `grip` from att's side; returns the grip change. */
export function throwLands(att: Holder, def: Holder, grip: number): { result: 'fall' | 'fail'; grip: number; score: number } {
  const score = throwScore(att, def, grip);
  if (score >= THROW.threshold) return { result: 'fall', grip: 0, score };
  att.balance = Math.max(0, att.balance - THROW.failBalance / k(att.attrs.equilibre));
  return { result: 'fail', grip: -THROW.failGrip, score };
}
/** How well `def` turns a throw (≥ THROW.counterThreshold: the thrower goes down). `grip` from def's side. */
export function counterScore(def: Pick<Holder, 'balance' | 'attrs'>, att: Pick<Holder, 'balance'>, grip: number): number {
  return def.balance * 0.5 + clamp(grip, -100, 100) * 0.3 + (k(def.attrs.technique) - 1) * 60 + (att.balance < 50 ? 10 : 0);
}
/** The counter meets the throw: turned (the thrower goes down) or only blocked (the thrower loses balance). */
export function counterThrow(def: Holder, att: Holder, grip: number): { result: 'reverse' | 'block'; score: number } {
  const score = counterScore(def, att, grip);
  if (score >= THROW.counterThreshold) return { result: 'reverse', score };
  att.balance = Math.max(0, att.balance - THROW.blockBalance / k(att.attrs.equilibre));
  return { result: 'block', score };
}

/**
 * Will the opponent try a throw now (`grip` from its side)? When the position is good, more for a power style; pressed
 * by the referee (`urge` 0…1, see clinchUrge) it settles for a weaker position, more often.
 */
export function wantsThrow(me: Holder, them: Holder, grip: number, st: ClinchStyle, level: number, r: () => number, urge = 0): boolean {
  if (me.move || me.recover > 0 || me.stamina < THROW.cost + 4) return false;
  const s = throwScore(me, them, grip), u = clamp(urge, 0, 1);
  if (s < THROW.threshold - 8 - 14 * u) return false;
  return r() < Math.min(0.9, st.throwChance * level * (s >= THROW.threshold ? 1.4 : 0.7) * (1 + 1.5 * u));
}
/** Will the opponent counter the player's throw (decided once, when it sees it coming)? */
export function wantsCounter(me: Holder, st: ClinchStyle, level: number, composure: number, r: number): boolean {
  return me.stamina >= THROW.counterCost && r < Math.min(0.85, st.read * 1.2 * level * k(me.attrs.technique) * (0.5 + composure / 200));
}
