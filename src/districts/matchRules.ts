import type { GameState } from '../core/state';
import type { PersonLook } from '../actors/humanoid';

/**
 * M3 « Join the match » (docs/districts/M3-CORNICHE.md): the rules of a short match the player joins on the Corniche's pitch, and of the two
 * regulars who play there every evening. Pure (tests/matchRules.test.ts); src/game/football.ts plays the match and calls these.
 *
 * - No money: no stake, no prize, no wager. What a match leaves is the player's record and the regulars' memory.
 * - The facts are numbers in the existing `counters`, prefix `ft_` (CONTRACT.md row 13); the regulars' visits go through the shared NPC memory
 *   (`recordVisit`, `Relations`), used as is.
 * - A match is recorded once, when it ends (`recordMatch`, guarded by the match's own number): a rematch is a new match, a reload records nothing.
 */
export type RegularId = 'babou' | 'khadim';
export type Result = 'win' | 'draw' | 'loss';

/** The short match: first to `goals`, or `seconds` of play at most. */
export const SHORT = { goals: 3, seconds: 240 } as const;

export interface Regular { id: RegularId; name: string; role: string; side: 'mate' | 'rival'; look: PersonLook }
/** Two faces the player gets to know: Babou plays on the player's side, Khadim on the other. Their own skin, hair and build; the kit over it. */
export const REGULARS: Record<RegularId, Regular> = {
  babou: { id: 'babou', name: 'Babou', role: 'l’habitué du terrain', side: 'mate', look: { skin: 0x3e2617, style: 'tee', top: 0xf2c12e, bottom: 0x1c1c1f, hair: 'short', beard: 0x231d18, muscular: 0.6, heavy: 0.1, shoes: 0xf2f2ec } },
  khadim: { id: 'khadim', name: 'Khadim', role: 'capitaine d’en face', side: 'rival', look: { skin: 0x5a3521, style: 'tee', top: 0xc8302a, bottom: 0xf2f2ec, hair: 'none', beard: null, muscular: 0.4, heavy: 0.0, shoes: 0x1d1f24 } },
};

/** The save keys (existing `counters`, prefix `ft_`). */
export const FT = {
  seq: 'ft_match_seq', recorded: 'ft_match_recorded', matches: 'ft_matches', wins: 'ft_wins', draws: 'ft_draws', goals: 'ft_goals',
  last: 'ft_last', lastDay: 'ft_last_day', lastGoals: 'ft_last_goals', ataya: 'ft_ataya',
  met: (r: RegularId) => `ft_${r}_met`, seen: (r: RegularId) => `ft_${r}_seen_day`,
} as const;
const RESULT_CODE: Record<Result, number> = { win: 1, draw: 2, loss: 3 };
const CODE_RESULT: Result[] = ['win', 'win', 'draw', 'loss'];

const c = (s: GameState, k: string) => s.data.counters[k] ?? 0;
const set = (s: GameState, k: string, v: number) => { s.data.counters[k] = v; };

/** The match is over: a team has `goals`, or the time is up. */
export const matchOver = (score: readonly [number, number], seconds: number) => score[0] >= SHORT.goals || score[1] >= SHORT.goals || seconds >= SHORT.seconds;
/** The result for the player's team. */
export const resultOf = (team: 0 | 1, score: readonly [number, number]): Result => (score[team] > score[1 - team] ? 'win' : score[team] < score[1 - team] ? 'loss' : 'draw');

/** A new match joined: its number (the save's), so that its end is recorded once. */
export function startMatch(s: GameState): number { const n = c(s, FT.seq) + 1; set(s, FT.seq, n); return n; }

export interface MatchRecord { seq: number; team: 0 | 1; score: readonly [number, number]; myGoals: number; day: number }
/** The match's end in the save, once (a second call for the same match changes nothing). Returns the result, or null if already recorded. */
export function recordMatch(s: GameState, r: MatchRecord): Result | null {
  if (r.seq <= c(s, FT.recorded)) return null;
  const res = resultOf(r.team, r.score);
  set(s, FT.recorded, r.seq);
  set(s, FT.matches, c(s, FT.matches) + 1);
  if (res === 'win') set(s, FT.wins, c(s, FT.wins) + 1);
  if (res === 'draw') set(s, FT.draws, c(s, FT.draws) + 1);
  set(s, FT.goals, c(s, FT.goals) + Math.max(0, Math.floor(r.myGoals)));
  set(s, FT.last, RESULT_CODE[res]); set(s, FT.lastDay, r.day + 1); set(s, FT.lastGoals, Math.max(0, Math.floor(r.myGoals)));
  return res;
}
/** The player's last match, as the save remembers it (null: never played). */
export function lastMatch(s: GameState): { result: Result; goals: number; day: number } | null {
  const code = c(s, FT.last); if (!code) return null;
  return { result: CODE_RESULT[code], goals: c(s, FT.lastGoals), day: c(s, FT.lastDay) - 1 };
}

/** The result's title on the card: « Victoire 3–1 »… (the player's team's score first). */
export function resultTitle(team: 0 | 1, score: readonly [number, number]) {
  const r = resultOf(team, score), a = score[team], b = score[1 - team];
  return `${r === 'win' ? 'Victoire' : r === 'loss' ? 'Défaite' : 'Match nul'} ${a}–${b}`;
}

/** What a regular says when the player joins: the first time, an introduction; later, recognition (see `recognise`). */
export function joinLine(reg: Regular, met: boolean): string {
  if (reg.id === 'babou') return met ? '« Allez, avec nous ! Mets-toi devant, on fait trois buts. »' : '« Tu joues avec nous ? Moi c’est Babou. On fait trois buts, pas plus : mets-toi devant ! »';
  return met ? '« Encore toi ? Cette fois on ne vous laisse rien. »' : '« Khadim, capitaine d’en face. On verra si tu cours aussi vite que tu parles ! »';
}
/** What a regular says after the match: the result, the player's goals. */
export function afterLine(reg: Regular, res: Result, myGoals: number): string {
  if (reg.side === 'mate') {
    const goal = myGoals > 1 ? ` ${myGoals} buts, rien que ça !` : myGoals === 1 ? ' Joli but, en plus.' : '';
    if (res === 'win') return `« Bien joué !${goal} Reste un peu, l’ataya est prêt. »`;
    if (res === 'draw') return `« Égalité… ça se rejoue.${goal} On souffle cinq minutes ? »`;
    return `« On les aura la prochaine fois.${goal} Viens, on boit l’ataya quand même. »`;
  }
  if (res === 'win') return '« Vous avez eu de la chance. Demain, revanche ! »';
  if (res === 'draw') return '« Personne n’a gagné, personne n’a perdu. Demain on vous bat. »';
  return '« Pas mal, mais il faut courir plus ! Reviens quand tu veux. »';
}
/** The ataya at the touchline after the match. */
export const ATAYA_LINE = 'Babou te tend un petit verre d’ataya au bord du terrain : « Le premier est amer comme la vie. » Vous refaites le match, but par but.';

/**
 * A regular who played with the player before recognises them on a later city day (once a day): the line names their last match. Records the day
 * (`seen`) so that tapping again or reloading the same day says nothing more. null: not met yet, or already seen today.
 */
export function recognise(s: GameState, reg: Regular, day: number): string | null {
  if (!c(s, FT.met(reg.id))) return null;
  if (c(s, FT.seen(reg.id)) >= day + 1) return null;
  const last = lastMatch(s);
  if (!last || last.day >= day) return null;                                   // the same day as the match: no « te revoilà »
  set(s, FT.seen(reg.id), day + 1);
  if (reg.side === 'mate') return last.goals > 0 ? '« Eh, le buteur ! On t’attendait. Tu joues avec nous ce soir ? »' : last.result === 'win' ? '« Te revoilà ! On a gagné la dernière fois, on remet ça ? »' : '« Te revoilà ! Il faut prendre notre revanche, tu viens ? »';
  return last.result === 'loss' ? '« Ah, celui qu’on a battu ! Tu reviens perdre encore ? »' : '« Toi… ce soir on ne vous laisse rien. »';
}
/** The player met a regular (they played in the same match): remembered from now on. */
export function meet(s: GameState, reg: RegularId, day: number) { if (!c(s, FT.met(reg))) set(s, FT.met(reg), day + 1); set(s, FT.seen(reg), Math.max(c(s, FT.seen(reg)), day + 1)); }
