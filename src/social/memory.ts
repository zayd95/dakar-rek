import type { GameState } from '../core/state';
import { Relations, PLAYER } from './relations';
import { profileOf, type Cond, type Intro, type Profile, type Reaction } from './profiles';
import type { Activity } from './routines';

/**
 * Memory and recognition, stored in the existing guest save only (no schema change):
 * counters `visit_<id>` (menus opened, at most one per city hour), `served_<id>` (services bought or done at their place),
 * `seen_<id>` (last counted city-hour stamp) and flag `regular_<id>` once visits + services reach REGULAR_AT.
 */
export const REGULAR_AT = 3;
export const memKey = {
  visit: (id: string) => `visit_${id}`, served: (id: string) => `served_${id}`, seen: (id: string) => `seen_${id}`, regular: (id: string) => `regular_${id}`,
};
/** City-hour stamp: day × 24 + hour. */
export const hourStamp = (day: number, hour: number) => day * 24 + Math.floor(hour);

/** Count a visit unless one was already counted in this city hour. Returns true when counted. */
export function recordVisit(s: GameState, id: string, stamp: number): boolean {
  const c = s.data.counters;
  if (c[memKey.seen(id)] === stamp) return false;
  c[memKey.seen(id)] = stamp; s.count(memKey.visit(id));
  return true;
}
export function recordService(s: GameState, id: string) { s.count(memKey.served(id)); }
export const familiarity = (s: GameState, id: string) => (s.data.counters[memKey.visit(id)] ?? 0) + (s.data.counters[memKey.served(id)] ?? 0);
export const isRegular = (s: GameState, id: string) => s.data.flags.includes(memKey.regular(id));

/** Sets the regular flag once familiarity reaches the threshold. Returns true the first time. */
export function updateRegular(s: GameState, r: Relations, id: string): boolean {
  if (isRegular(s, id) || familiarity(s, id) < REGULAR_AT) return false;
  r.set(memKey.regular(id)); r.change(PLAYER, id, 3);
  return true;
}

export interface Ctx { id: string; s: GameState; r: Relations; hour: number; act?: Activity }
export function matches(c: Cond, x: Ctx): boolean {
  const f = x.s.data.flags, beats = x.s.data.beats;
  if (c.flag && !f.includes(c.flag)) return false;
  if (c.noFlag && f.includes(c.noFlag)) return false;
  if (c.beat && !(c.beat in beats)) return false;
  if (c.noBeat && c.noBeat in beats) return false;
  if (c.regular !== undefined && isRegular(x.s, x.id) !== c.regular) return false;
  if (c.hours && !(x.hour >= c.hours[0] && x.hour < c.hours[1])) return false;
  const lv = x.r.level(x.id);
  if (c.relAtLeast !== undefined && lv < c.relAtLeast) return false;
  if (c.relBelow !== undefined && lv >= c.relBelow) return false;
  if (c.act && (!x.act || !c.act.includes(x.act))) return false;
  if (c.counter && (x.s.data.counters[c.counter[0]] ?? 0) < c.counter[1]) return false;
  return true;
}

/** The line the character greets the player with now (first matching reaction). */
export function greeting(p: Profile, x: Ctx): Reaction {
  return p.reactions.find(rc => matches(rc.when, x)) ?? p.reactions[p.reactions.length - 1];
}

/** An introduction the character can make now (each target only once). */
export function introduction(p: Profile, x: Ctx): Intro | null {
  return p.intros?.find(i => !x.s.data.flags.includes(i.flag) && i.when.some(c => matches(c, x))) ?? null;
}
export function applyIntroduction(p: Profile, i: Intro, s: GameState, r: Relations) {
  r.set(i.flag); r.change(PLAYER, i.to, 3); r.change(PLAYER, p.id, 2);
  s.count(`intro_${p.id}`);
}

/** The last thing this character remembers about the player (or null). */
export function lastMemory(id: string, s: GameState, r: Relations, hour = 12): string | null {
  const p = profileOf(id); if (!p) return null;
  const x: Ctx = { id, s, r, hour };
  const facts = [...(isRegular(s, id) ? [`Te reconnaît comme un habitué (${familiarity(s, id)} passages)`] : []), ...p.memories.filter(f => matches(f.when, x)).map(f => f.text)];
  return facts.length ? facts[facts.length - 1] : null;
}
