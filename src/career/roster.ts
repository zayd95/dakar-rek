/**
 * The ladder's people (docs/CAREER.md): twelve fictional wrestlers of the game's own cast — two écuries (Baobab,
 * Teranga) and independents — each with a style and a level. Their season records and points move on every fight
 * evening, deterministically from the city day (the same Dakar for everyone, no server needed), and the player's bouts
 * against them enter their records too. Points and records start again with each season (four city weeks); the belt
 * carries over and is put at stake at the Sunday galas. Pure logic, unit-tested.
 * No real wrestler, écurie or promoter is represented.
 */
import { RUNGS, boutPoints, type Belt, type BoutEntry, type BoutRes } from './career';
import { FIGHT_FROM, isFightEvening } from '../arena/exteriorRules';
import { STYLES } from '../lamb/rules';
import type { WrestlerLook } from '../core/types';

export type DuelStyle = 'costaud' | 'rapide' | 'defensif';
export interface Wrestler { id: string; name: string; ecurie: 'Baobab' | 'Teranga' | null; style: DuelStyle; level: number }

export const ROSTER: readonly Wrestler[] = [
  { id: 'babacar', name: 'Babacar', ecurie: 'Baobab', style: 'costaud', level: 5 },
  { id: 'lamine', name: 'Lamine', ecurie: 'Teranga', style: 'rapide', level: 5 },
  { id: 'ousmane', name: 'Ousmane', ecurie: 'Baobab', style: 'defensif', level: 4 },
  { id: 'daouda', name: 'Daouda', ecurie: 'Teranga', style: 'costaud', level: 4 },
  { id: 'assane', name: 'Assane', ecurie: 'Teranga', style: 'defensif', level: 3 },
  { id: 'malick', name: 'Malick', ecurie: 'Baobab', style: 'rapide', level: 3 },
  { id: 'gora', name: 'Gora', ecurie: null, style: 'costaud', level: 2 },
  { id: 'pathe', name: 'Pathé', ecurie: 'Baobab', style: 'costaud', level: 2 },
  { id: 'birame', name: 'Birame', ecurie: 'Teranga', style: 'rapide', level: 2 },
  { id: 'ndiaga', name: 'Ndiaga', ecurie: null, style: 'defensif', level: 2 },
  { id: 'pape', name: 'Pape', ecurie: null, style: 'rapide', level: 1 },
  { id: 'saliou', name: 'Saliou', ecurie: null, style: 'defensif', level: 1 },
];
export const wrestlerById = (id: string) => ROSTER.find(w => w.id === id);
export const wrestlerByName = (name: string) => ROSTER.find(w => w.name === name);
/** The champion when the city opens (day 1). */
export const FIRST_HOLDER = 'babacar';

/** Ladder points a wrestler starts each season with, by level (the same scale as the player's rank score). */
export const START_PTS = [0, 25, 80, 190, 360, 620];
/** A season: four city weeks; records and points start again, the belt carries over. */
export const SEASON_DAYS = 28;
export const seasonOf = (day: number) => Math.floor(Math.max(0, Math.floor(day) - 1) / SEASON_DAYS);
/** City day a season starts on (day 1 is the first day of season 0). */
export const seasonStart = (s: number) => 1 + s * SEASON_DAYS;
/** Fight evenings: Friday, Saturday, Sunday (the arena exterior's FIGHT_DAYS); the belt is at stake on Sundays. */
export const FIGHT_WEEKDAYS = [4, 5, 6];
export const TITLE_WEEKDAY = 6;
/** A belt the player holds and does not put at stake for longer than this is vacant at the next title Sunday. */
export const TITLE_IDLE_DAYS = 14;
const weekday = (day: number) => ((Math.floor(day) % 7) + 7) % 7;
export const isFightDay = (day: number) => FIGHT_WEEKDAYS.includes(weekday(day));
export const isTitleDay = (day: number) => weekday(day) === TITLE_WEEKDAY;
/** The next title Sunday at or after `day`. */
export const nextTitleDay = (day: number) => { let d = Math.floor(day); while (!isTitleDay(d)) d++; return d; };

/** Deterministic 0..1 from a day and two ids (the same night gives the same result everywhere). */
export function seeded(day: number, a: string, b = ''): number {
  let h = 2166136261 ^ Math.floor(day);
  for (const ch of a + '|' + b) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A wrestler's season: record and points. */
export interface Standing { id: string; name: string; ecurie: string | null; style: DuelStyle; level: number; v: number; d: number; n: number; pts: number }
/**
 * The belt: who holds it (a roster id, 'player', or null while vacant), since when, the defences won since, and the
 * last city day it was put at stake (a holding player must defend within TITLE_IDLE_DAYS).
 */
export interface Title { holder: string | null; since: number; defences: number; last: number }
/** One bout of the season as the city saw it: `a` against `b` ('player' for the player), `r` for `a` (L won, R lost, N draw). */
export interface LadderBout { day: number; a: string; b: string; r: 'L' | 'R' | 'N'; main: boolean; title: boolean }
export interface Ladder { table: Standing[]; title: Title; season: number; nights: number; log: LadderBout[] }
/** A gala's main event that the player watched to the end (its live result is the one the city remembers). */
export interface GalaSeen { day: number; winner: string | null }

/** The belt is vacant on `day`: nobody holds it, or the player let it sleep past TITLE_IDLE_DAYS (seen on a title Sunday). */
export const vacantOn = (t: Title, day: number) => t.holder === null || (t.holder === 'player' && isTitleDay(day) && day - t.last > TITLE_IDLE_DAYS);
/** The player's belt for the rank (src/career/career.ts rankOf). */
export const beltOf = (l: Ladder, day: number): Belt => ({ held: l.title.holder === 'player' && !vacantOn(l.title, day), defences: l.title.holder === 'player' ? l.title.defences : 0 });

const outcome = (p: number, r: number): 'L' | 'R' | 'N' => (Math.abs(r - p) < 0.04 ? 'N' : r < p ? 'L' : 'R');
/** Chance that `a` beats `b`: level matters most, form (season points) a little; never a certainty. */
export const winChance = (a: Standing, b: Standing) => 1 / (1 + Math.exp(-((a.level - b.level) * 0.9 + (a.pts - b.pts) / 260)));
const ranked = (l: Ladder) => [...l.table].sort((a, b) => b.pts - a.pts || b.level - a.level || a.id.localeCompare(b.id)).map(s => s.id);

/**
 * Tonight's main event. On a title Sunday: the champion against the best challenger, or the two best for a vacant belt
 * (no roster bout for the belt when the player holds it: the player defends it themselves). Other evenings: two of the
 * best, never the champion (kept for Sunday), a seeded shift so the top of the card changes.
 */
export function mainEvent(l: Ladder, day: number): [string, string] {
  const order = ranked(l), holder = l.title.holder;
  if (isTitleDay(day)) {
    if (vacantOn(l.title, day)) return [order[0], order[1]];
    if (holder && holder !== 'player') return [holder, order.find(id => id !== holder)!];
  }
  const pool = order.filter(id => id !== holder);
  const shift = Math.floor(seeded(day, 'main') * 2);
  return [pool[shift], pool[shift + 1]];
}

/** The other bouts of a fight evening: neighbours in the ranking, a seeded offset so pairs change from night to night. */
export function undercard(l: Ladder, day: number, taken: readonly string[]): [string, string][] {
  const free = ranked(l).filter(id => !taken.includes(id));
  const out: [string, string][] = [];
  const off = Math.floor(seeded(day, 'under') * 2);
  for (let i = off; i + 1 < free.length && out.length < 3; i += 2) out.push([free[i], free[i + 1]]);
  return out;
}

function apply(t: Map<string, Standing>, id: string, r: BoutRes, oppLevel: number) {
  const s = t.get(id); if (!s) return;
  if (r === 'V') s.v++; else if (r === 'D') s.d++; else if (r === 'N') s.n++;
  s.pts = Math.max(0, s.pts + boutPoints('classe', r, oppLevel));
}
const fresh = () => new Map<string, Standing>(ROSTER.map(w => [w.id, { id: w.id, name: w.name, ecurie: w.ecurie, style: w.style, level: w.level, v: 0, d: 0, n: 0, pts: START_PTS[w.level] }]));

/** The belt at each season's start, by season and the player's history before it (that history never changes once past). */
const beltMemo = new Map<string, Title>();
const BELT_MEMO_MAX = 4000;

/**
 * One season, or its first days: the table starts from the levels, the belt as it was; fight evenings before `day` play
 * out (the player's own bouts on their night, the main event the player watched as it ended, the rest from the seeded
 * rule); the player's title bouts and the Sunday main events move the belt.
 */
function playSeason(from: number, to: number, day: number, start: Title, byDay: ReadonlyMap<number, readonly BoutEntry[]>, galas: readonly GalaSeen[]): Ladder {
  const t = fresh(), title: Title = { ...start };
  const l: Ladder = { table: [...t.values()], title, season: seasonOf(to), nights: 0, log: [] };
  const take = (id: string | null, d: number) => { title.holder = id; title.since = d; title.defences = 0; title.last = d; };
  for (let d = from; d <= to; d++) {
    if (title.holder === 'player' && vacantOn(title, d)) take(null, d);                              // a belt left asleep
    // the player's bouts that night: the opponent's record moves, the belt changes hands on a title bout
    const busy: string[] = [];
    for (const b of byDay.get(d) ?? []) {
      const w = wrestlerByName(b.opp); if (!w) continue;
      busy.push(w.id);
      apply(t, w.id, b.res === 'V' ? 'D' : b.res === 'D' ? 'V' : 'N', w.level);
      l.log.push({ day: d, a: w.id, b: 'player', r: b.res === 'V' ? 'R' : b.res === 'D' ? 'L' : 'N', main: false, title: b.kind === 'title' });
      if (b.kind !== 'title') continue;
      if (title.holder === 'player') { if (b.res === 'D') take(w.id, d); else { if (b.res === 'V') title.defences++; title.last = d; } }
      else if (b.res === 'V') take('player', d);
      else if (title.holder === w.id) { if (b.res === 'D') title.defences++; title.last = d; }
    }
    if (!isFightDay(d) || d >= day) continue;               // tonight's card is not played yet; the player's bouts are
    l.nights++;
    const titleNight = isTitleDay(d), vacant = titleNight && title.holder === null;
    const [a, b] = mainEvent(l, d);
    const pairs: [string, string][] = [];
    if (!busy.includes(a) && !busy.includes(b)) pairs.push([a, b]);
    pairs.push(...undercard(l, d, [a, b, ...busy]));
    for (const [x, y] of pairs) {
      const sx = t.get(x)!, sy = t.get(y)!, main = x === a && y === b;
      const seen = main ? galas.find(g => g.day === d && (g.winner === null || g.winner === x || g.winner === y)) : undefined;
      const r = seen ? (seen.winner === x ? 'L' : seen.winner === y ? 'R' : 'N') : outcome(winChance(sx, sy), seeded(d, x, y));
      apply(t, x, r === 'L' ? 'V' : r === 'R' ? 'D' : 'N', sy.level);
      apply(t, y, r === 'R' ? 'V' : r === 'L' ? 'D' : 'N', sx.level);
      l.log.push({ day: d, a: x, b: y, r, main, title: main && titleNight && (vacant || title.holder === x) });
      if (!main || !titleNight) continue;
      if (vacant) { if (r !== 'N') take(r === 'L' ? x : y, d); }
      else if (title.holder === x) { if (r === 'R') take(y, d); else { if (r === 'L') title.defences++; title.last = d; } }
    }
  }
  l.table = [...t.values()].sort((p, q) => q.pts - p.pts || q.level - p.level || p.id.localeCompare(q.id));
  return l;
}

/**
 * The ladder on `day` (tonight's card not played yet): this season's fight evenings before it and the player's ranked
 * bouts up to now; the belt carried from season to season (each season's start is remembered, so a long-lived city
 * costs one season of work).
 */
export function ladderAt(day: number, playerBouts: readonly BoutEntry[] = [], galas: readonly GalaSeen[] = []): Ladder {
  const byDay = new Map<number, BoutEntry[]>();
  const events: number[] = [];
  for (const b of playerBouts) if (b.mode === 'classe' && b.res !== 'A') { const k = Math.floor(b.day); byDay.set(k, [...(byDay.get(k) ?? []), b]); events.push(k); }
  for (const g of galas) events.push(Math.floor(g.day));
  events.sort((a, b) => a - b);
  // the player's history before a season's first day: how many events and the last one (it never changes once past)
  const before = (d: number) => { let n = 0; while (n < events.length && events[n] < d) n++; return `${n}|${n ? events[n - 1] : -1}`; };
  const from = (i: number) => (i === 0 ? Math.min(0, events[0] ?? 0) : seasonStart(i));
  const s = seasonOf(day), key = (i: number) => `${i}|${before(from(i))}`;
  let title: Title = { holder: FIRST_HOLDER, since: 0, defences: 0, last: 0 }, k = 0;
  for (let i = s; i > 0; i--) { const m = beltMemo.get(key(i)); if (m) { title = m; k = i; break; } }
  for (let i = k; i < s; i++) {
    title = playSeason(from(i), seasonStart(i + 1) - 1, seasonStart(i + 1), title, byDay, galas).title;
    if (beltMemo.size >= BELT_MEMO_MAX) beltMemo.clear();
    beltMemo.set(key(i + 1), { ...title });
  }
  return playSeason(from(s), day, day, title, byDay, galas);
}

/** Position (1-based) of a score among the roster's: where the player would stand in the city's table. */
export const placeOf = (l: Ladder, score: number) => 1 + l.table.filter(s => s.pts > score).length;

/**
 * The ranked opponent for the player: one of the three roster wrestlers closest to the player's rank score (never the
 * champion outside a title bout, nor anyone in `avoid`), the choice rotating with the bouts already fought.
 */
export function opponentFor(l: Ladder, score: number, boutsFought: number, avoid: readonly string[] = []): Standing {
  const pool = l.table.filter(s => s.id !== l.title.holder && !avoid.includes(s.id));
  const near = [...pool].sort((a, b) => Math.abs(a.pts - score) - Math.abs(b.pts - score) || a.id.localeCompare(b.id)).slice(0, 3);
  return near[Math.abs(boutsFought) % Math.max(1, near.length)] ?? l.table[l.table.length - 1];
}

/**
 * The player's title bout on `day`, if one is open to them: as champion, a defence against the best challenger; as a
 * contender (`canChallenge`), against the champion, or against the best wrestler for a vacant belt. Sundays only.
 */
export function titleBout(l: Ladder, day: number, canChallenge: boolean): { opp: Standing; defence: boolean } | null {
  if (!isTitleDay(day)) return null;
  const order = ranked(l).map(id => l.table.find(s => s.id === id)!);
  if (l.title.holder === 'player' && !vacantOn(l.title, day)) return { opp: order[0], defence: true };
  if (!canChallenge) return null;
  const holder = l.title.holder && l.title.holder !== 'player' ? l.table.find(s => s.id === l.title.holder) : undefined;
  return { opp: holder ?? order[0], defence: false };
}

/** Rung from which the arena offers a place on the gala card (Adversaires réputés), and a title bout (Contender). */
export const GALA_RUNG = RUNGS.findIndex(r => r.id === 'reputes');
export const TITLE_RUNG = RUNGS.findIndex(r => r.id === 'contender');
/**
 * Why a gala place (or a title bout) is not open tonight, or null: fight evenings only (Friday–Sunday from 16 h; the
 * belt on Sundays), one gala bout an evening, rested enough, nothing else on the way.
 */
export function galaBlock(kind: 'gala' | 'title', o: { day: number; hour: number; pending: boolean; energie: number; foughtTonight: boolean }): string | null {
  if (o.pending) return 'Ton combat de ce soir est déjà prévu';
  if (kind === 'title' ? !isTitleDay(o.day) : !isFightDay(o.day)) return kind === 'title' ? 'Le titre se joue au gala du dimanche' : 'Les galas : vendredi, samedi et dimanche';
  if (!isFightEvening(o.day, o.hour)) return `Le gala ouvre à ${FIGHT_FROM} h`;
  if (o.foughtTonight) return 'Tu as déjà combattu au gala ce soir';
  if (o.energie < 25) return 'Trop fatigué : repose-toi d’abord';
  return null;
}

/** The gala card the posters print: the main event's two names and écuries (the city's own cast). */
export interface Card { left: { id: string; name: string; ecurie: string }; right: { id: string; name: string; ecurie: string }; title: boolean }
const side = (id: string) => { const w = wrestlerById(id)!; return { id, name: w.name, ecurie: w.ecurie ?? 'indépendant' }; };
/** Fight evenings: the main event (the belt on Sundays). Other evenings: a smaller card from the middle of the table. */
export function cardOf(l: Ladder, day: number): Card {
  if (!isFightDay(day)) {
    const order = ranked(l), [a, b] = undercard(l, day, order.slice(0, 4))[0] ?? [order[4], order[5]];
    return { left: side(a), right: side(b), title: false };
  }
  const [a, b] = mainEvent(l, day);
  return { left: side(a), right: side(b), title: isTitleDay(day) && (vacantOn(l.title, day) || l.title.holder === a) };
}

// ------------------------------------------------------------------ the wrestlers' cards (the phone's « Lutteurs »)
/** A level said as a word (1–5). */
export const LEVEL_WORDS = ['', 'Débutant', 'Espoir', 'Confirmé', 'Redouté', 'Vedette'] as const;
const SKINS = [0x5b3420, 0x4e2e1c, 0x3b2216, 0x6b3f25, 0x7a4a2c];
const SKIN_OF: Record<string, number> = { babacar: 0x5b3420, lamine: 0x4e2e1c };          // as the cast draws them (src/social/cast.ts)
const INDEP: Record<DuelStyle, [string, string]> = { costaud: ['rouge', 'rayures'], rapide: ['indigo', 'uni'], defensif: ['noir', 'damier'] };
/**
 * A roster wrestler's look: his ngemb (écurie Baobab green with a border, Teranga in the écurie's ochre, independents by
 * style), skin, and placeholder accessories by level (src/lamb/look.ts). The arena's entrance and his phone portrait use it.
 */
export function rosterLook(id: string): { skin: number; look: WrestlerLook } | null {
  const w = wrestlerById(id); if (!w) return null;
  const [color, pattern] = w.ecurie === 'Baobab' ? ['vert', 'bordure'] : w.ecurie === 'Teranga' ? [STYLES.rapide.ngemb, 'uni'] : INDEP[w.style];
  const skin = SKIN_OF[id] ?? SKINS[Math.floor(seeded(0, id) * SKINS.length)];
  return { skin, look: { ngembColor: color, ngembPattern: pattern, accessories: w.level >= 4 ? ['bras_d', 'taille'] : w.level >= 3 ? ['bras_d'] : [] } };
}

export interface WrestlerCard {
  id: string; name: string; ecurie: string; style: string; level: string;
  v: number; d: number; n: number; pts: number; place: number;
  /** « Champion · 2 défenses », or null. */
  belt: string | null;
  /** The season's last results, newest first (five at most). */
  last: { day: number; vs: string; res: 'V' | 'D' | 'N'; main: boolean; title: boolean }[];
  skin: number; look: WrestlerLook;
}
/** A wrestler's card from the ladder (pure): who he is, his season, the belt, his last results (`you`: the player's name). */
export function wrestlerCard(l: Ladder, id: string, you = 'Toi'): WrestlerCard | null {
  const w = wrestlerById(id), s = l.table.find(x => x.id === id), lk = rosterLook(id);
  if (!w || !s || !lk) return null;
  const name = (x: string) => (x === 'player' ? you : wrestlerById(x)?.name ?? x);
  const last = l.log.filter(b => b.a === id || b.b === id).slice(-5).reverse().map(b => {
    const mine = b.a === id, r = mine ? b.r : b.r === 'L' ? 'R' : b.r === 'R' ? 'L' : 'N';
    return { day: b.day, vs: name(mine ? b.b : b.a), res: (r === 'L' ? 'V' : r === 'R' ? 'D' : 'N') as 'V' | 'D' | 'N', main: b.main, title: b.title };
  });
  const held = l.title.holder === id;
  return {
    id, name: w.name, ecurie: w.ecurie ? `Écurie ${w.ecurie}` : 'Indépendant', style: STYLES[w.style].label, level: LEVEL_WORDS[w.level],
    v: s.v, d: s.d, n: s.n, pts: s.pts, place: l.table.findIndex(x => x.id === id) + 1,
    belt: held ? `Champion${l.title.defences ? ` · ${l.title.defences} défense${l.title.defences > 1 ? 's' : ''}` : ''}` : null,
    last, skin: lk.skin, look: lk.look,
  };
}
/**
 * Whether a followed wrestler fights tonight in the arena: the evening's main event (the card the posters and the show
 * name). The ladder's other bouts of the night are the city's, not shown at the arena (the preliminaries there are young
 * wrestlers of the neighbourhoods, src/arena/undercard.ts), so they are not announced.
 */
export function fightsTonight(l: Ladder, day: number, id: string): { vs: string } | null {
  const c = cardOf(l, day);
  if (c.left.id === id) return { vs: c.right.name };
  if (c.right.id === id) return { vs: c.left.name };
  return null;
}
/** His bout on a night already played (the next day's ladder holds it): the opponent and the result, or null. */
export function resultOn(l: Ladder, day: number, id: string): { vs: string; res: 'V' | 'D' | 'N' } | null {
  const b = l.log.find(x => x.day === day && (x.a === id || x.b === id) && x.b !== 'player' && x.a !== 'player');
  if (!b) return null;
  const mine = b.a === id, r = mine ? b.r : b.r === 'L' ? 'R' : b.r === 'R' ? 'L' : 'N';
  return { vs: wrestlerById(mine ? b.b : b.a)?.name ?? '', res: r === 'L' ? 'V' : r === 'R' ? 'D' : 'N' };
}
