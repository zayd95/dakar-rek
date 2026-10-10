/**
 * Làmb rules of Dakar Rek — the game's own rules (decided by the team, 9 Oct 2026: « c'est notre jeu, on crée nos
 * règles »). They are not the official rules of Senegalese wrestling and do not need outside validation. Documented
 * in docs/LAMB_RULES.md. Pure data and pure functions only (no Three.js, no DOM), so the logic is unit-tested in
 * tests/lamb.test.ts.
 */

export type Discipline = 'sans_frappe' | 'avec_frappe';
export type BoutMode = 'entrainement' | 'amical' | 'classe';
export type Side = 'player' | 'opponent';
/** How a bout ended. `abandon` is never a sporting win for anyone and is recorded apart from defeats. */
export type BoutOutcome = 'projection' | 'decision' | 'egalite' | 'abandon' | 'entrainement';

export const RULES_STATUS = 'Règles Dakar Rek';

export interface DisciplineRules {
  id: Discipline;
  label: string;
  status: typeof RULES_STATUS;
  /** False while the discipline's mechanics are not built yet. */
  enabled: boolean;
  strikes: boolean;
  /** Bout length in seconds of game time (one round). */
  roundSeconds: number;
  /** What ends the bout before time-out (plain French, shown in the recap and the rules doc). */
  endsBy: string;
  grabRange: number;
  stamina: {
    max: number;
    /** Recovery per second, standing / while guarding. */
    regen: number; regenGuard: number;
    grabCost: number;
    /** Dégagement inside an empoignade: success / missed timing. */
    breakCost: number; breakMissCost: number;
    /** Dégagement in neutral (step back). */
    dodgeCost: number;
    /** Drain per second for both wrestlers during an empoignade. */
    clinchDrain: number;
  };
  /** Seconds the defender has to guard or step back once an opponent's grab starts. */
  responseWindow: number;
  /** Seconds a wrestler stays exposed after a blocked, dodged or missed grab. */
  openingSeconds: number;
  /** Seconds an empoignade lasts before it is resolved by effort + endurance. */
  clinchSeconds: number;
  /** Break-away timing inside an empoignade: a window of `breakOpen` s every `breakCycle` s, first at `breakFirst` s. */
  breakCycle: number; breakOpen: number; breakFirst: number;
  /** Referee decision at time-out: points per action; equal points = draw. */
  timeout: { guard: number; grab: number; breakaway: number; stagger: number; hit: number; tie: 'egalite' };
}

export const RULES: Record<Discipline, DisciplineRules> = {
  sans_frappe: {
    id: 'sans_frappe', label: 'Lutte sans frappe', status: RULES_STATUS, enabled: true, strikes: false,
    roundSeconds: 90,
    endsBy: 'Projection au sol à la fin d’une empoignade gagnée',
    grabRange: 1.5,
    stamina: { max: 100, regen: 14, regenGuard: 7, grabCost: 22, breakCost: 25, breakMissCost: 12, dodgeCost: 12, clinchDrain: 8 },
    responseWindow: 0.6,
    openingSeconds: 0.9,
    clinchSeconds: 2.6,
    breakCycle: 1.0, breakOpen: 0.38, breakFirst: 0.45,
    timeout: { guard: 1, grab: 1, breakaway: 1, stagger: 0, hit: 0, tie: 'egalite' },
  },
  // Làmb 2.0 (spec 10 Oct.): « lutte avec frappe », the target discipline, ours to design. Built step by step
  // (src/lamb/stand.ts, docs/LAMB2.md) and playable behind the `lamb2` flag; `enabled` stays false until it is released.
  // The separate ranking counters (`lamb_af_*`) are reserved so the two disciplines never share a record.
  avec_frappe: {
    id: 'avec_frappe', label: 'Lutte avec frappe', status: RULES_STATUS, enabled: false, strikes: true,
    roundSeconds: 90,
    endsBy: 'Projection au sol à la fin d’une empoignade gagnée ; les frappes déséquilibrent et ouvrent',
    grabRange: 1.5,
    stamina: { max: 100, regen: 14, regenGuard: 7, grabCost: 22, breakCost: 25, breakMissCost: 12, dodgeCost: 12, clinchDrain: 8 },
    responseWindow: 0.6, openingSeconds: 0.9, clinchSeconds: 2.6,
    breakCycle: 1.0, breakOpen: 0.38, breakFirst: 0.45,
    timeout: { guard: 1, grab: 1, breakaway: 1, stagger: 2, hit: 1, tie: 'egalite' },
  },
};

// ------------------------------------------------------------------ referee decision at time-out

/** Actions the referee counts at time-out (provisional game rule). */
export interface BoutScore {
  /** Successful guards: an opponent's grab stopped by the guard or by a dégagement in its response window. */
  guards: number;
  /** Grabs initiated within range (blocked or not). */
  grabs: number;
  /** Empoignades broken by a dégagement. */
  breaks: number;
  /** Avec frappe: clean strikes landed, and opponents made to stagger (counted by the referee). */
  hits?: number;
  staggers?: number;
}
export const emptyScore = (): BoutScore => ({ guards: 0, grabs: 0, breaks: 0, hits: 0, staggers: 0 });

export function points(s: BoutScore, r: DisciplineRules = RULES.sans_frappe): number {
  return s.guards * r.timeout.guard + s.grabs * r.timeout.grab + s.breaks * r.timeout.breakaway + (s.staggers ?? 0) * r.timeout.stagger + (s.hits ?? 0) * r.timeout.hit;
}

/** Referee decision when the time runs out without a projection: more points wins, equal points is a draw. */
export function refereeDecision(player: BoutScore, opponent: BoutScore, r: DisciplineRules = RULES.sans_frappe): Side | null {
  const a = points(player, r), b = points(opponent, r);
  return a > b ? 'player' : b > a ? 'opponent' : null;
}

// ------------------------------------------------------------------ empoignade

/** Strength in an empoignade: effort (taps or AI push) + remaining endurance + 1 for the wrestler who started it. */
export function clinchStrength(effort: number, stamina: number, initiative: boolean): number {
  return effort + stamina / 40 + (initiative ? 1 : 0);
}
/** Is the break-away window open `t` seconds into an empoignade? */
export function breakWindowOpen(t: number, r: DisciplineRules = RULES.sans_frappe): boolean {
  if (t < r.breakFirst) return false;
  return (t - r.breakFirst) % r.breakCycle < r.breakOpen;
}

// ------------------------------------------------------------------ opponents

export type StyleId = 'costaud' | 'rapide' | 'defensif';
export interface OpponentStyle {
  id: StyleId;
  label: string;
  /** One readable sentence: what the player should expect. */
  hint: string;
  /** Fictional wrestler (no real person is represented). */
  name: string;
  ngemb: string;
  speed: number;
  /** Chance to start a grab on each decision when in range. */
  grabChance: number;
  /** Chance to be guarding on each decision when close. */
  guardChance: number;
  /** Push per second in an empoignade (multiplied by the level factor). */
  clinchPower: number;
  staminaMax: number;
  staminaRegen: number;
  /** Seconds the player gets to respond to its grabs (base response window × this). */
  windup: number;
  /** Chance to grab straight away into an opening it caused. */
  counterChance: number;
  /** Chance to break away from an empoignade it is losing, per window. */
  breakChance: number;
  /** Seconds between decisions [min, max]. */
  think: [number, number];
}

export const STYLES: Record<StyleId, OpponentStyle> = {
  costaud: {
    id: 'costaud', label: 'Costaud', hint: 'Lent, mais très fort dans l’empoignade : évite de te faire saisir.',
    name: 'Gora', ngemb: 'rouge', speed: 1.5, grabChance: 0.4, guardChance: 0.3, clinchPower: 1.35, staminaMax: 110, staminaRegen: 12,
    windup: 1.25, counterChance: 0.2, breakChance: 0, think: [0.8, 1.4],
  },
  rapide: {
    id: 'rapide', label: 'Rapide', hint: 'Saisies rapides, mais peu d’endurance : garde-toi puis épuise-le.',
    name: 'Pape', ngemb: 'ocre', speed: 2.6, grabChance: 0.65, guardChance: 0.25, clinchPower: 0.95, staminaMax: 75, staminaRegen: 10,
    windup: 0.8, counterChance: 0.25, breakChance: 0.2, think: [0.4, 0.8],
  },
  defensif: {
    id: 'defensif', label: 'Défensif', hint: 'Se garde beaucoup et contre : attaque quand il s’ouvre.',
    name: 'Saliou', ngemb: 'indigo', speed: 1.9, grabChance: 0.3, guardChance: 0.7, clinchPower: 1.05, staminaMax: 100, staminaRegen: 14,
    windup: 1.0, counterChance: 0.6, breakChance: 0.35, think: [0.5, 1.0],
  },
};
export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

/** Training partner (Babacar, écurie Baobab): slow, telegraphed, never wins by itself. */
export const PARTNER: OpponentStyle = {
  id: 'costaud', label: 'Partenaire', hint: 'Partenaire d’entraînement : il attaque lentement.', name: 'Babacar', ngemb: 'vert',
  speed: 1.2, grabChance: 1, guardChance: 0, clinchPower: 1, staminaMax: 100, staminaRegen: 14, windup: 2.2, counterChance: 0, breakChance: 0, think: [1.2, 1.6],
};

/** Opponent level 1..5 from the player's record in that mode: two wins move up a level, three defeats move down one. */
export function opponentLevel(wins: number, losses: number): number {
  return Math.max(1, Math.min(5, 1 + Math.floor(wins / 2) - Math.floor(losses / 3)));
}
/** Difficulty factor from the level only (never from money, outfit or accessories). */
export function levelFactor(level: number): number { return 0.8 + 0.1 * level; }

/** Ranked opponents rotate through the styles with the number of ranked bouts. */
export function rankedStyle(boutsPlayed: number): StyleId { return STYLE_IDS[boutsPlayed % STYLE_IDS.length]; }

// ------------------------------------------------------------------ record and rewards

export type Counters = Record<string, number>;
const c = (k: Counters, key: string) => k[key] ?? 0;

/** Counter keys per mode: friendly and ranked never share a record. */
export const RECORD_KEYS = {
  amical: { v: 'lamb_amical_v', d: 'lamb_amical_d', n: 'lamb_amical_n', ab: 'lamb_amical_ab' },
  classe: { v: 'lamb_classe_v', d: 'lamb_classe_d', n: 'lamb_classe_n', ab: 'lamb_classe_ab' },
} as const;

/** Avec frappe keeps its own record (`lamb_af_*`), so the two disciplines never share one. */
export const RECORD_KEYS_AF = {
  amical: { v: 'lamb_af_amical_v', d: 'lamb_af_amical_d', n: 'lamb_af_amical_n', ab: 'lamb_af_amical_ab' },
  classe: { v: 'lamb_af_classe_v', d: 'lamb_af_classe_d', n: 'lamb_af_classe_n', ab: 'lamb_af_classe_ab' },
} as const;

export function record(k: Counters, mode: 'amical' | 'classe', discipline: Discipline = 'sans_frappe') {
  const r = (discipline === 'avec_frappe' ? RECORD_KEYS_AF : RECORD_KEYS)[mode];
  return { v: c(k, r.v), d: c(k, r.d), n: c(k, r.n), ab: c(k, r.ab) };
}

export interface BoutResult { mode: BoutMode; outcome: BoutOutcome; winner: Side | null }
export interface Rewards { needs: { moral?: number; social?: number; energie?: number; hygiene?: number; faim?: number }; coach: number; lines: string[] }

/** What a finished bout gives. An abandon gives nothing; training only raises the skill counter. Never money. */
export function boutRewards(r: BoutResult): Rewards {
  const effort = { energie: -22, hygiene: -12, faim: -8 };
  if (r.mode === 'entrainement' && r.outcome === 'abandon') return { needs: { energie: -6 }, coach: 0, lines: ['Entraînement interrompu : rien n’est compté'] };
  if (r.mode === 'entrainement') return { needs: { energie: -12, hygiene: -8, faim: -5 }, coach: 1, lines: ['Compétence de lutte +1', 'Non classé, sans récompense'] };
  if (r.outcome === 'abandon') return { needs: { ...effort, moral: -2 }, coach: 0, lines: ['Abandon : aucune récompense', 'Compté à part : ni victoire ni défaite'] };
  const ranked = r.mode === 'classe';
  if (r.winner === 'player') return { needs: { ...effort, moral: ranked ? 18 : 14, social: ranked ? 8 : 6 }, coach: 2, lines: [`Moral +${ranked ? 18 : 14}`, `Social +${ranked ? 8 : 6}`, 'Coach Ablaye est fier de toi', ranked ? 'Victoire au classement' : 'Victoire amicale (non classée)'] };
  if (r.winner === null) return { needs: { ...effort, moral: 4 }, coach: 1, lines: ['Moral +4', ranked ? 'Match nul au classement' : 'Match nul amical'] };
  return { needs: { ...effort, moral: -4 }, coach: 0, lines: ['Moral −4', 'Coach Ablaye : « On retourne à l’entraînement. »'] };
}

/**
 * Counter increments for a finished bout (applied with GameState.count). Keeps the global `combats`/`victoires`; each
 * discipline has its own record keys.
 */
export function recordIncrements(r: BoutResult, discipline: Discipline = 'sans_frappe'): Counters {
  if (r.mode === 'entrainement') return r.outcome === 'abandon' ? {} : { lamb_skill: 1 };
  const keys = (discipline === 'avec_frappe' ? RECORD_KEYS_AF : RECORD_KEYS)[r.mode];
  if (r.outcome === 'abandon') return { [keys.ab]: 1, lamb_abandons: 1 };
  const out: Counters = { combats: 1 };
  if (r.winner === 'player') { out.victoires = 1; out[keys.v] = 1; }
  else if (r.winner === 'opponent') out[keys.d] = 1;
  else out[keys.n] = 1;
  return out;
}

export const OUTCOME_TEXT: Record<BoutOutcome, string> = {
  projection: 'Projection au sol après une empoignade gagnée',
  decision: 'Temps écoulé : décision de l’arbitre aux points',
  egalite: 'Temps écoulé : égalité de points, match nul',
  abandon: 'Abandon (compté à part, ce n’est pas une défaite par chute)',
  entrainement: 'Entraînement terminé avec Coach Ablaye',
};

/** Rows for the phone's Arena app. */
export function arenaProfileRows(k: Counters, ecurie: string | null): { label: string; value: string }[] {
  const fmt = (m: 'amical' | 'classe') => { const r = record(k, m); return `${r.v} V · ${r.d} D · ${r.n} N${r.ab ? ` · ${r.ab} abandon${r.ab > 1 ? 's' : ''}` : ''}`; };
  return [
    { label: 'Discipline', value: `${RULES.sans_frappe.label} (${RULES_STATUS})` },
    { label: 'Avec frappe', value: 'Bientôt : prochaine discipline du jeu' },
    { label: 'Combats amicaux', value: fmt('amical') },
    { label: 'Combats classés', value: fmt('classe') },
    { label: 'Niveau adverse (classé)', value: String(opponentLevel(record(k, 'classe').v, record(k, 'classe').d)) },
    { label: 'Compétence de lutte', value: String(c(k, 'lamb_skill')) },
    { label: 'Écurie', value: ecurie ?? 'Aucune' },
  ];
}
