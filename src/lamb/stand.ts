/**
 * Làmb 2.0 — the stand-up exchange of the « lutte avec frappe » (docs/LAMB2.md, spec 10 Oct. §7–9, §12).
 * Pure data and functions (no Three.js, no DOM), unit-tested in tests/lamb2.test.ts; src/lamb/duel.ts drives them.
 *
 * No health bar. A wrestler carries three states:
 *  - endurance (`stamina`, shared with the empoignade): every effort costs it; tired wrestlers recover balance slowly;
 *  - balance (posture, 0–100): strikes take it, it comes back by itself; at 0 the wrestler staggers (« il vacille »):
 *    he cannot act for a moment and a grab on him cannot be answered;
 *  - composure (sang-froid, 0–100): taken by hits and fatigue; under pressure strikes are slower to come and the
 *    opponent AI reacts late more often.
 * Strikes create openings rather than damage: a quick strike is safe but takes little balance; a big strike is
 * telegraphed and takes a lot, but a big strike that misses (or is guarded) leaves its author open. A clean hit
 * interrupts a strike being wound up, so the quick strike answers the big one. Guarding costs endurance (no recovery,
 * a drain while held, more on every strike absorbed) and slows the feet — and the guard is for strikes only: hands up,
 * the body is open to a grab. Strike beats a grab on its way, guard beats strikes, a grab beats the guard; stepping
 * back makes both miss, for endurance and ground.
 *
 * Attributes (8, 0–100, 50 = average) shape every number by at most ±20 %: no attribute decides a bout on its own.
 */

export interface Attributes {
  force: number; equilibre: number; technique: number; explosivite: number;
  endurance: number; frappe: number; defense: number; sangfroid: number;
}
export const ATTRIBUTE_LABELS: Record<keyof Attributes, string> = {
  force: 'Force', equilibre: 'Équilibre', technique: 'Technique', explosivite: 'Explosivité',
  endurance: 'Endurance', frappe: 'Frappe', defense: 'Défense', sangfroid: 'Sang-froid',
};
export const AVERAGE: Attributes = { force: 50, equilibre: 50, technique: 50, explosivite: 50, endurance: 50, frappe: 50, defense: 50, sangfroid: 50 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Effect of an attribute: ×0.8 at 0, ×1 at 50, ×1.2 at 100. */
export const k = (a: number) => 0.8 + (0.4 * clamp(a, 0, 100)) / 100;

export type StrikeKind = 'quick' | 'big';
export interface StrikeSpec {
  label: string;
  /** Seconds from the start to the moment it lands (before attributes and composure). */
  windup: number;
  /** Seconds the arm stays out, then the recovery before acting again. */
  active: number; recover: number;
  /** Reach in metres (between the two wrestlers' centres). */
  reach: number;
  /** Endurance it costs its author. */
  cost: number;
  /** Balance and composure it takes on a clean hit. */
  balance: number; composure: number;
  /** What a guard pays to absorb it: endurance and balance. */
  guardCost: number; guardBalance: number;
  /** Seconds its author stays open when it misses / when it is guarded, and the balance a miss costs him. */
  missOpen: number; blockedOpen: number; missBalance: number;
}
export const STRIKES: Record<StrikeKind, StrikeSpec> = {
  quick: { label: 'Frappe rapide', windup: 0.18, active: 0.1, recover: 0.22, reach: 1.65, cost: 5, balance: 11, composure: 3, guardCost: 3, guardBalance: 2, missOpen: 0.25, blockedOpen: 0, missBalance: 3 },
  big: { label: 'Grosse frappe', windup: 0.52, active: 0.12, recover: 0.45, reach: 1.85, cost: 14, balance: 34, composure: 12, guardCost: 11, guardBalance: 9, missOpen: 1.1, blockedOpen: 0.55, missBalance: 16 },
};

export const STAND = {
  balanceMax: 100,
  /** Balance recovery per second; below `tiredBelow` endurance it is slower. */
  balanceRegen: 12, balanceRegenTired: 6, tiredBelow: 25,
  composureMax: 100, composureRegen: 4, composureDrainTired: 3,
  /** Endurance per second while the guard is held (instead of recovering). */
  guardDrain: 2,
  /** Speed factor while guarding. */
  guardSpeed: 0.45,
  /** Seconds a wrestler staggers when his balance runs out, and the balance he gets back. */
  stagger: 1.1, staggerBalance: 20,
  /** A strike on an open or staggered wrestler takes this much more. */
  openBonus: 1.4,
  /** Recovery after being hit (cannot strike or grab). */
  hitStun: 0.22,
} as const;

/** Stand-up state of one wrestler. `stamina`/`max` are the endurance shared with the empoignade. */
export interface StandState {
  attrs: Attributes;
  stamina: number; max: number;
  balance: number; composure: number;
  guard: boolean;
  /** Seconds left exposed (cannot guard; a grab on him skips the response window; strikes take more). */
  open: number;
  /** Step-back in progress (a strike that lands now misses). */
  dodge: number;
  /** Strike being thrown: `t` seconds since it started; `landed` once resolved. */
  strike: { kind: StrikeKind; t: number; landed: boolean } | null;
  /** Seconds before acting again (after a strike or a hit). */
  recover: number;
  /** Seconds left staggering. */
  stagger: number;
  /** Seconds since the last clean hit taken (presentation: recoil). */
  hitAgo: number;
}
export function standState(attrs: Attributes, max: number, stamina = max): StandState {
  return { attrs, stamina, max, balance: STAND.balanceMax, composure: STAND.composureMax, guard: false, open: 0, dodge: 0, strike: null, recover: 0, stagger: 0, hitAgo: 99 };
}

/** Seconds a strike takes to land for this wrestler: explosive wrestlers are quicker, rattled ones slower (≤ +25 %). */
export function windupOf(kind: StrikeKind, s: Pick<StandState, 'attrs' | 'composure'>): number {
  const fast = 1.15 - (0.3 * clamp(s.attrs.explosivite, 0, 100)) / 100;
  const rattled = 1 + (1 - clamp(s.composure, 0, 100) / 100) * 0.25;
  return STRIKES[kind].windup * fast * rattled;
}
/** Can this wrestler start an action (strike or grab) now? */
export const free = (s: StandState) => !s.strike && s.recover <= 0 && s.stagger <= 0 && s.dodge <= 0;

/** Starts a strike; false when busy, guarding or out of endurance. */
export function startStrike(s: StandState, kind: StrikeKind): boolean {
  if (!free(s) || s.guard || s.open > 0 || s.stamina < STRIKES[kind].cost) return false;
  s.stamina -= STRIKES[kind].cost; s.strike = { kind, t: 0, landed: false };
  return true;
}

export type StrikeResult = 'hit' | 'stagger' | 'guarded' | 'miss';
export interface Landing { kind: StrikeKind; result: StrikeResult; balance: number; composure: number; endurance: number; interrupted: boolean }

/**
 * The strike of `a` lands on `d` at distance `dist`: out of reach or stepped away → miss (a open, a off balance);
 * guarded → d pays endurance and a little balance, a big strike leaves a open; otherwise a clean hit takes d's balance
 * and composure (more if d is open), interrupts d's own strike and may make him stagger.
 */
export function land(a: StandState, d: StandState, dist: number): Landing {
  const kind = a.strike!.kind, sp = STRIKES[kind];
  a.strike!.landed = true;
  const out: Landing = { kind, result: 'miss', balance: 0, composure: 0, endurance: 0, interrupted: false };
  if (dist > sp.reach || d.dodge > 0) {
    a.open = Math.max(a.open, sp.missOpen);
    a.balance = Math.max(0, a.balance - sp.missBalance / k(a.attrs.equilibre));
    return out;
  }
  if (d.guard && d.open <= 0 && d.stagger <= 0) {
    out.result = 'guarded';
    out.endurance = sp.guardCost / k(d.attrs.defense);
    out.balance = sp.guardBalance / k(d.attrs.equilibre);
    d.stamina = Math.max(0, d.stamina - out.endurance);
    d.balance = Math.max(0, d.balance - out.balance);
    a.open = Math.max(a.open, sp.blockedOpen);
    return out;
  }
  const exposed = d.open > 0 || d.stagger > 0 ? STAND.openBonus : 1;
  out.result = 'hit';
  out.balance = (sp.balance * k(a.attrs.frappe) * Math.sqrt(k(a.attrs.force)) * exposed) / k(d.attrs.equilibre);
  out.composure = sp.composure * (2 - k(d.attrs.sangfroid)) * exposed;
  d.balance = Math.max(0, d.balance - out.balance);
  d.composure = Math.max(0, d.composure - out.composure);
  d.hitAgo = 0;
  if (d.strike && !d.strike.landed) { d.strike = null; out.interrupted = true; }
  d.recover = Math.max(d.recover, STAND.hitStun);
  if (d.balance <= 0 && d.stagger <= 0) {
    out.result = 'stagger';
    d.stagger = STAND.stagger; d.balance = STAND.staggerBalance; d.guard = false;
  }
  return out;
}

/**
 * One step of a wrestler's stand-up state. Returns true when his strike reaches its landing moment this step (the
 * caller then calls `land`). Endurance recovers at `regen` per second, not while guarding (the guard drains it).
 */
export function tick(s: StandState, dt: number, regen: number): boolean {
  s.open = Math.max(0, s.open - dt); s.dodge = Math.max(0, s.dodge - dt);
  s.recover = Math.max(0, s.recover - dt); s.stagger = Math.max(0, s.stagger - dt); s.hitAgo += dt;
  if (s.stagger > 0 || s.open > 0) s.guard = false;
  s.stamina = s.guard ? Math.max(0, s.stamina - STAND.guardDrain * dt) : Math.min(s.max, s.stamina + regen * dt);
  const tired = s.stamina < STAND.tiredBelow;
  if (!s.strike) s.balance = Math.min(STAND.balanceMax, s.balance + (tired ? STAND.balanceRegenTired : STAND.balanceRegen) * k(s.attrs.equilibre) * dt);
  s.composure = tired ? Math.max(0, s.composure - STAND.composureDrainTired * dt)
    : Math.min(STAND.composureMax, s.composure + STAND.composureRegen * k(s.attrs.sangfroid) * dt);
  if (!s.strike) return false;
  s.strike.t += dt;
  const w = windupOf(s.strike.kind, s);
  if (!s.strike.landed && s.strike.t >= w) return true;
  if (s.strike.landed && s.strike.t >= w + STRIKES[s.strike.kind].active) {
    s.recover = Math.max(s.recover, STRIKES[s.strike.kind].recover); s.strike = null;
  }
  return false;
}

// ------------------------------------------------------------------ the opponent's stand-up decisions

/** How a style fights standing (the opponent AI); `range` is the distance it tries to keep. */
export interface StandStyle {
  attrs: Attributes;
  range: number;
  /** Chances per decision in range: quick strike, big strike (more when the target is shaken), guard. */
  quick: number; big: number; guard: number;
  /** When the player starts a strike: chances to guard, to step back, to strike first (quick). */
  react: { guard: number; back: number; counter: number };
  /** Chance per decision to step in and take hold when close (wrestling is the heart of it: strikes open, grabs end). */
  grab: number;
}
export const STAND_STYLES: Record<'costaud' | 'rapide' | 'defensif' | 'partenaire', StandStyle> = {
  // Puissant: heavy, hard to move, wants to hurt with big strikes and close in
  costaud: { attrs: { force: 75, equilibre: 70, technique: 45, explosivite: 40, endurance: 60, frappe: 65, defense: 50, sangfroid: 55 }, range: 1.4, quick: 0.18, big: 0.3, guard: 0.2, react: { guard: 0.45, back: 0.05, counter: 0.1 }, grab: 0.2 },
  // Rapide: in and out, many quick strikes, little endurance
  rapide: { attrs: { force: 45, equilibre: 45, technique: 55, explosivite: 80, endurance: 40, frappe: 55, defense: 50, sangfroid: 45 }, range: 1.62, quick: 0.45, big: 0.1, guard: 0.15, react: { guard: 0.25, back: 0.35, counter: 0.25 }, grab: 0.12 },
  // Défensif: guards a lot, makes you miss, answers with quick strikes
  defensif: { attrs: { force: 50, equilibre: 60, technique: 65, explosivite: 50, endurance: 65, frappe: 45, defense: 80, sangfroid: 70 }, range: 1.9, quick: 0.25, big: 0.06, guard: 0.45, react: { guard: 0.5, back: 0.2, counter: 0.25 }, grab: 0.08 },
  // training partner: slow, telegraphed, never strikes first
  partenaire: { attrs: AVERAGE, range: 1.5, quick: 0, big: 0, guard: 0, react: { guard: 0, back: 0, counter: 0 }, grab: 0 },
};

/** What the opponent sees when it decides (its own state, the player's, the distance). */
export interface StandView { me: StandState; them: StandState; dist: number; grabRange: number }
export interface StandDecision { move: number; strike: StrikeKind | null; guard: boolean; grab: boolean }

/**
 * A stand-up decision of the opponent (`r` random numbers in [0, 1)). It keeps its range, strikes when in reach,
 * goes for big strikes when the player is shaken or open, grabs a staggered or open player — or one hiding behind his
 * guard —, guards by style.
 * `level` (0.9–1.3, the bout's difficulty) sharpens every choice a little.
 */
export function decide(v: StandView, st: StandStyle, level: number, r: () => number): StandDecision {
  const o: StandDecision = { move: 0, strike: null, guard: false, grab: false };
  const { me, them, dist } = v;
  o.move = dist > st.range + 0.15 ? 1 : dist < st.range - 0.35 ? -0.6 : 0;
  if (!free(me) || me.open > 0) return o;
  const shaken = them.stagger > 0 || them.open > 0;
  if (shaken && dist <= v.grabRange && me.stamina > 30 && r() < Math.min(0.95, 0.55 * level)) { o.grab = true; return o; }
  // a raised guard stops strikes, not a grab: against a turtle, close in and take hold
  if (them.guard && dist <= v.grabRange && me.stamina > 30 && r() < Math.min(0.9, 0.45 * level)) { o.grab = true; return o; }
  // close enough to step in: take hold, by style (the caller closes the last steps before the grab lands)
  if (dist <= v.grabRange + 0.3 && me.stamina > 34 && r() < Math.min(0.8, st.grab * level)) { o.grab = true; return o; }
  const reachQ = dist <= STRIKES.quick.reach, reachB = dist <= STRIKES.big.reach;
  const pBig = st.big * level * (shaken ? 2.2 : them.balance < 45 ? 1.6 : 1);
  if (reachB && me.stamina > STRIKES.big.cost + 10 && r() < Math.min(0.9, pBig)) { o.strike = 'big'; return o; }
  if (reachQ && me.stamina > STRIKES.quick.cost + 6 && r() < Math.min(0.9, st.quick * level)) { o.strike = 'quick'; return o; }
  o.guard = dist < 2.4 && r() < Math.min(0.9, st.guard * level);
  return o;
}

export type Reaction = 'guard' | 'back' | 'counter' | 'none';
/**
 * The opponent's answer when the player starts a strike: guard, step back, strike first (only a quick strike can beat
 * a big one to the target), or nothing. Shaken (low composure) or tired wrestlers react less.
 */
export function react(kind: StrikeKind, me: StandState, st: StandStyle, level: number, r: number): Reaction {
  if (!free(me) || me.open > 0) return 'none';
  const sharp = Math.min(1.25, level * (0.55 + 0.45 * me.composure / 100) * (me.stamina < STAND.tiredBelow ? 0.6 : 1) * k(me.attrs.defense));
  const g = st.react.guard * sharp, b = st.react.back * sharp, c = kind === 'big' ? st.react.counter * sharp : 0;
  if (r < g) return 'guard';
  if (r < g + b) return 'back';
  if (r < g + b + c) return 'counter';
  return 'none';
}

/** Reaction delay (seconds) before the opponent's answer: a fraction of the strike's windup, longer when rattled. */
export const reactDelay = (kind: StrikeKind, me: StandState) => STRIKES[kind].windup * (kind === 'big' ? 0.35 : 0.5) * (1 + (1 - me.composure / 100) * 0.6);
