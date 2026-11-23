import type { GameState } from '../core/state';
import type { Relations } from './relations';
import { castById } from './cast';
import { familiarity } from './memory';
import { FAVOURS, SITUATIONS, sitKey } from './situations';

/**
 * A few reasons to go back to familiar people and places, read from what the game already keeps: the characters' daily
 * schedules (the hours of their moments, src/social/situations.ts), the favours they owe, and what the player has already
 * lived today. Nothing is invented and nothing happened while the player was away: a reason is a place and an hour that
 * exist, never a debt, a streak or a notification. Shown in the People app (`À revoir`).
 */
export interface RevisitOpts {
  s: GameState; r: Relations; hub: string; day: number; hour: number;
  /** Where someone is now (npcLife.whereNow). */
  where: (id: string) => string;
}
const SOON = 3;
const first = (id: string) => (castById(id)?.name ?? id).replace(/^(Tonton|Coach) /, '').split(' ')[0];
const knows = (s: GameState, r: Relations, id: string) => r.level(id) >= 5 || familiarity(s, id) >= 1;

export function revisitReasons(o: RevisitOpts, max = 3): string[] {
  const out: string[] = [];
  // a favour that someone owes: they remember, and they are somewhere now
  for (const f of FAVOURS) {
    if (castById(f.npc)?.hub === o.hub && o.r.has(f.needs) && !o.r.has(f.done)) out.push(`${first(f.npc)} se souvient de toi : ${f.detail.toLowerCase()} (${o.where(f.npc)})`);
  }
  // a moment of the day at a place the player knows, not lived yet today: now, or starting within a few hours
  const live: string[] = [], soon: { from: number; text: string }[] = [];
  for (const sit of SITUATIONS) {
    if (sit.hub !== o.hub || !knows(o.s, o.r, sit.host)) continue;
    if (o.s.data.counters[sitKey.day(sit.id)] === o.day) continue;
    const [from, to] = sit.hours;
    if (o.hour >= from && o.hour < to) live.push(`${sit.title} : ${first(sit.host)} est là`);
    else if (o.hour < from && from - o.hour <= SOON) soon.push({ from, text: `${sit.title} : ${first(sit.host)}, dès ${from} h` });
  }
  out.push(...live, ...soon.sort((a, b) => a.from - b.from).map(x => x.text));
  return out.slice(0, max);
}
