/**
 * Progress made visible (docs/CAREER.md « Moments »): what the four dimensions did since yesterday, when one of them
 * reaches a new word, and the recap after a bout. Pure, unit-tested; read only real saved values — never an invented
 * number, never a streak counter.
 */
import { DIM_IDS, levelIndex, type Dim, type DimId } from './career';
import { WEEKDAY_FR, weekday } from '../arena/exteriorRules';

/** The four scores (0–100) in DIM_IDS order. */
export type DimScores = [number, number, number, number];
/** The scores as last seen on a city day (kept in the save, a few days back). */
export interface DimDay { day: number; s: DimScores }
export const DIM_DAYS_MAX = 8;

export const scoresOf = (dims: readonly Dim[]): DimScores => DIM_IDS.map(id => Math.round(dims.find(d => d.id === id)?.score ?? 0)) as DimScores;

/** Today's entry holds the last scores seen today; older days are kept as they ended (the last DIM_DAYS_MAX days). */
export function recordDay(hist: readonly DimDay[], day: number, s: DimScores): DimDay[] {
  const d = Math.floor(day);
  const out = hist.filter(h => h.day !== d && h.day < d);
  out.push({ day: d, s: [...s] as DimScores });
  return out.slice(-DIM_DAYS_MAX);
}

/** How a past day is said: « depuis hier », « depuis samedi » (within the week), « depuis le jour 12 ». */
export function sinceLabel(today: number, day: number): string {
  const n = Math.floor(today) - day;
  if (n === 1) return 'depuis hier';
  if (n > 1 && n < 7) return `depuis ${WEEKDAY_FR[weekday(day)]}`;
  return `depuis le jour ${day}`;
}

/**
 * Per dimension, the change since the end of the last day played before today, and how to say that day; null when
 * there is no earlier day in the save (a new life: nothing to compare with, nothing is shown).
 */
export function sinceYesterday(hist: readonly DimDay[], today: number, s: DimScores): { since: string; d: DimScores } | null {
  const prev = hist.filter(h => h.day < Math.floor(today)).sort((a, b) => a.day - b.day).pop();
  if (!prev) return null;
  return { since: sinceLabel(today, prev.day), d: s.map((v, i) => Math.round(v - prev.s[i])) as DimScores };
}

/** « +6 depuis hier », « −2 depuis samedi », or '' when it did not move. */
export const deltaText = (d: number, since: string) => (d ? `${d > 0 ? '+' : '−'}${Math.abs(d)} ${since}` : '');

/**
 * Words reached for the first time: the dimensions whose word (level) is above the best reached so far. The first look
 * at a save only remembers where the player stands (no moment for what was earned before this existed). A dimension
 * that falls and comes back to a word already reached is not celebrated again.
 */
export function stepsCrossed(best: readonly number[] | undefined, s: DimScores): { up: DimId[]; best: number[] } {
  const now = s.map(v => levelIndex(v));
  if (!best || best.length !== DIM_IDS.length) return { up: [], best: now };
  const up = DIM_IDS.filter((_, i) => now[i] > best[i]);
  return { up, best: now.map((v, i) => Math.max(v, best[i])) };
}

/** A dimension that moved during a bout: its change and, when it reached a new word, that word. */
export interface DimMove { id: DimId; label: string; delta: number; word?: string }
/** The dimensions that moved between two readings (in DIM_IDS order), with the new word when one was reached. */
export function dimMoves(before: readonly Dim[], after: readonly Dim[], up: readonly DimId[] = []): DimMove[] {
  return DIM_IDS.flatMap(id => {
    const a = before.find(d => d.id === id), b = after.find(d => d.id === id);
    if (!a || !b) return [];
    const delta = Math.round(b.score) - Math.round(a.score);
    if (!delta && !up.includes(id)) return [];
    return [{ id, label: b.label, delta, ...(up.includes(id) ? { word: b.level } : {}) }];
  });
}

/** What a bout did, for the recap card (pure: the caller gathers the facts). */
export interface BoutFacts {
  res: 'V' | 'D' | 'N' | 'A'; opp: string; how: string;
  purse: number; pts: number;
  rungBefore: { rung: number; label: string }; rungAfter: { rung: number; label: string };
  place?: { before: number; after: number; of: number };
  belt?: 'won' | 'lost' | 'defended' | null;
  moves: DimMove[];
}
const RES_TITLE = { V: 'Victoire contre', D: 'Défaite contre', N: 'Match nul contre', A: 'Abandon contre' } as const;
/** Why a dimension moved after a bout (one short reason). */
function reason(m: DimMove, f: BoutFacts): string {
  switch (m.id) {
    case 'reputation': return f.res === 'V' ? `victoire${f.how ? ` (${f.how})` : ''}` : f.res === 'N' ? 'un nul qui compte' : f.res === 'D' ? 'tu as combattu' : 'abandon';
    case 'richesse': return f.purse ? 'le cachet' : 'ton patrimoine';
    case 'influence': return f.rungAfter.rung !== f.rungBefore.rung ? 'ton nouveau rang' : 'ton rang à l’arène';
    default: return 'l’effort du combat';
  }
}
/** The recap card after a bout: a title and a few lines (purse, rank, place in the city, belt, what moved and why). */
export function boutRecap(f: BoutFacts, fmt: (n: number) => string): { title: string; icon: string; lines: string[] } {
  const lines: string[] = [];
  if (f.belt === 'won') lines.push('Ceinture de champion de l’Arène de Pikine !');
  else if (f.belt === 'lost') lines.push(`${f.opp} te prend la ceinture`);
  else if (f.belt === 'defended') lines.push('Ceinture défendue');
  if (f.purse) lines.push(`Cachet +${fmt(f.purse)}`);
  const nth = (n: number) => `${n}${n === 1 ? 'er' : 'e'}`;
  const place = f.place && f.place.after !== f.place.before ? ` · ${nth(f.place.after)} de la ville (était ${nth(f.place.before)})` : '';
  if (f.rungAfter.rung > f.rungBefore.rung) lines.push(`Nouveau palier : ${f.rungAfter.label}${place}`);
  else if (f.rungAfter.rung < f.rungBefore.rung) lines.push(`Recul au classement : ${f.rungAfter.label}${place}`);
  else if (f.pts) lines.push(`Classement ${f.pts > 0 ? '+' : '−'}${Math.abs(f.pts)} pts${place || ` · ${f.rungAfter.label}`}`);
  else if (place) lines.push(place.slice(3));
  for (const m of f.moves) {
    if (m.word) lines.push(`${m.label} : ${m.word} !`);
    else if (m.delta) lines.push(`${m.label} ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)} · ${reason(m, f)}`);
  }
  return { title: `${RES_TITLE[f.res]} ${f.opp}`, icon: f.res === 'V' ? '🏆' : '🤼', lines };
}

/** What a watched gala did to the city's table: the winner's place, the belt (pure). */
export interface GalaFacts {
  winner: { name: string; ecurie: string } | null; loser: { name: string; ecurie: string } | null;
  draw: { a: string; b: string } | null;
  place?: { before: number; after: number };
  belt?: { kind: 'won' | 'defended'; holder: string; defences: number } | null;
}
export function galaRecap(f: GalaFacts): { title: string; icon: string; lines: string[] } {
  const lines: string[] = [];
  if (f.winner && f.loser) lines.push(`${f.winner.name} (${f.winner.ecurie}) bat ${f.loser.name} (${f.loser.ecurie})`);
  else if (f.draw) lines.push(`${f.draw.a} et ${f.draw.b} : match nul`);
  if (f.belt?.kind === 'won') lines.push(`${f.belt.holder} prend la ceinture !`);
  else if (f.belt?.kind === 'defended') lines.push(`${f.belt.holder} garde la ceinture (${f.belt.defences} défense${f.belt.defences > 1 ? 's' : ''})`);
  if (f.winner && f.place && f.place.after < f.place.before) lines.push(`${f.winner.name} passe ${f.place.after}${f.place.after === 1 ? 'er' : 'e'} du classement de la ville`);
  return { title: 'Résultat du gala', icon: '🏟️', lines };
}
