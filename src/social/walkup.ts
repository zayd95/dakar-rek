import type { GameState } from '../core/state';
import type { Relations } from './relations';
import { castById } from './cast';
import { profileOf, type Walkup } from './profiles';
import { familiarity, hourStamp, isRegular, matches, type Ctx } from './memory';
import { seedHash, withHourGreeting } from '../i18n/wolof';
import type { Activity } from './routines';

/**
 * The few words a familiar character says as the player walks up (M1-C, C2). Pure: it reads what the game already keeps —
 * the memory counters and regular flag (memory.ts), the relation, the story flags, the player's last bout (career) — and
 * stores three small counters in the save (no schema change): `wu_at_<id>` the city hour of the last greeting,
 * `wu_last_<id>` which line it was, `wu_<id>_<line>` for the lines said once.
 *
 * Nothing is earned by walking up: a greeting changes no relation, no counter of familiarity and no need, so it cannot be
 * farmed. It is said at most once per city hour per person, never the same line twice in a row, and only to someone the
 * player has met — except a character's `news` lines (what the whole street knows: the player's new table next door), said to a stranger too.
 */
export const WALK_R = 4.5;
/** The player must have gone this far away before the same person greets again. */
export const REARM_R = 9;
/** Real seconds between two greetings (so two neighbours do not speak over each other). */
export const GAP_S = 8;

export const wuKey = {
  at: (id: string) => `wu_at_${id}`, last: (id: string) => `wu_last_${id}`, once: (id: string, line: string) => `wu_${id}_${line}`,
};
const tag = (line: string) => (seedHash(line) % 100000) + 1;

/** Lines for anyone the player has met, by how well: used when the character's own lines have nothing (or repeat). */
const GENERAL = {
  friend: ['{salut} Mon ami, approche !', 'Approche, on te gardait une place.', 'Ça faisait longtemps. Viens !'],
  regular: ['{salut} Toujours là, l’habitué !', 'Tiens, te revoilà !', 'Ça fait plaisir de te voir par ici.'],
  known: ['{salut}', 'Tiens, un visage connu.', 'Alors, le quartier te plaît ?'],
} as const;
type Tier = keyof typeof GENERAL;

/** How well this character knows the player now, or null for a stranger (no greeting). */
export function tierOf(id: string, s: GameState, r: Relations): Tier | null {
  if (r.level(id) >= 35) return 'friend';
  if (isRegular(s, id)) return 'regular';
  if (familiarity(s, id) >= 1 || r.level(id) >= 5) return 'known';
  return null;
}

export interface Spoken { key: string; line: string; once: boolean }

/**
 * What `id` says now, or null: not met, already greeted this city hour, or nothing new to say. `day` and `hour` are the city
 * clock; `act` is what they are doing (a routine activity).
 */
export function walkupLine(id: string, s: GameState, r: Relations, day: number, hour: number, act?: Activity): Spoken | null {
  const p = profileOf(id), c = s.data.counters;
  const tier = tierOf(id, s, r);
  if (!p || (!tier && !p.walkup?.some(w => w.news))) return null;      // a stranger only hears the news of the street (a `news` line)
  const stamp = hourStamp(day, hour);
  if (c[wuKey.at(id)] === stamp) return null;
  const x: Ctx = { id, s, r, hour, day, act };
  const last = c[wuKey.last(id)] ?? 0;
  const own: Walkup[] = (p.walkup ?? []).filter(w => (tier || w.news) && matches(w.when, x) && !(w.once && c[wuKey.once(id, w.id)]) && tag(w.id) !== last);
  if (own.length) { const w = own[0]; return { key: w.id, line: withHourGreeting(w.line, hour), once: !!w.once }; }
  if (!tier) return null;
  const pool = GENERAL[tier];
  const fresh = pool.map((line, i) => ({ key: `${tier}${i}`, line })).filter(g => tag(g.key) !== last);
  if (!fresh.length) return null;
  const g = fresh[seedHash(`${id}:${stamp}`) % fresh.length];
  return { key: g.key, line: withHourGreeting(g.line, hour), once: false };
}

/** Remembers that `id` greeted with `said` now (the hour, the line, and a once-line is used up). */
export function markWalkup(id: string, said: Spoken, s: GameState, day: number, hour: number) {
  const c = s.data.counters;
  c[wuKey.at(id)] = hourStamp(day, hour); c[wuKey.last(id)] = tag(said.key);
  if (said.once) c[wuKey.once(id, said.key)] = 1;
}

/** « Ibou : « … » » — the toast text (the first name, without the title everyone puts before it). */
export const spokenToast = (id: string, line: string) => `${(castById(id)?.name ?? id).replace(/^(Tonton|Coach) /, '').split(' ')[0]} : « ${line} »`;
