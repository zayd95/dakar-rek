/**
 * Progress made visible (docs/CAREER.md « Moments »): what the four dimensions did since yesterday, when one of them
 * reaches a new word, and the recap after a bout. Pure, unit-tested; read only real saved values — never an invented
 * number, never a streak counter.
 */
import { DIM_IDS, levelIndex, type BoutRes, type Dim, type DimId } from './career';
import { FIGHT_FROM, WEEKDAY_FR, weekday } from '../arena/exteriorRules';
import { GALA_RUNG, TITLE_RUNG, isFightDay, nextTitleDay } from './roster';

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

// ------------------------------------------------------------------ the fighter's after-bout card

/** One row of the after-bout card: what it is, where it stands now, the change (coloured by `tone`), a short note. */
export interface CardRow { k: string; v: string; d?: string; tone?: 'up' | 'down' | ''; note?: string }
/** The fighter's after-bout card (src/ui/hud.ts `boutCard`): the result, what changed, what comes next. */
export interface BoutCard { icon: string; title: string; sub: string; rows: CardRow[]; next: string[] }
/** A gauge read before and after the bout: its score and its word after (`up`: a word reached for the first time). */
export interface GaugeMove { id: DimId; label: string; before: number; after: number; word: string; up: boolean }
/** What the career knows after a bout fought on the arena's fighter path (the caller reads it from the existing rules). */
export interface AfterBoutFacts extends Omit<BoutFacts, 'moves'> {
  /** The palmarès after the bout (`summary`). */
  record: { v: number; d: number; n: number; ab: number };
  /** The four gauges before and after: Réputation and Influence always shown, Richesse with the purse, Forme if it moved. */
  gauges: GaugeMove[];
  /** The rank score after (the bouts' points plus regularity). */
  score: number;
  /** 'avec_frappe' for a Làmb 2.0 bout. */
  discipline?: string;
  /** A gala place or the title bout (the player's own main event). */
  kind?: 'gala' | 'title';
  /** What comes next (`nextSteps`). */
  next: string[];
}
const RES_WORD = { V: 'Victoire', D: 'Défaite', N: 'Match nul', A: 'Abandon' } as const;
const signedN = (n: number, unit = '') => `${n > 0 ? '+' : '−'}${Math.abs(n)}${unit}`;
const nth = (n: number) => `${n}${n === 1 ? 'er' : 'e'}`;
const toneOf = (n: number): CardRow['tone'] => (n > 0 ? 'up' : n < 0 ? 'down' : '');
/**
 * The after-bout card of the fighter's path (pure): the result; the palmarès with the bout just fought; the place in the
 * city's table, the rung and the points it moved; Réputation and Influence with their change (and the new word when one
 * was reached); the purse with the Richesse it brought; Forme when it moved; the belt; then the next bill or step. Every
 * number is one the career's rules already gave (the caller reads them before and after the bout); nothing is invented.
 */
export function boutCard(f: AfterBoutFacts, fmt: (n: number) => string): BoutCard {
  const rows: CardRow[] = [];
  const r = f.record, rec = `${r.v} V · ${r.d} D · ${r.n} N${r.ab ? ` · ${r.ab} abandon${r.ab > 1 ? 's' : ''}` : ''}`;
  rows.push({ k: 'Palmarès', v: rec, d: f.res === 'A' ? '+1 abandon' : `+1 ${f.res}`, tone: f.res === 'V' ? 'up' : f.res === 'D' ? 'down' : '' });
  // the city's table: the place (and the one before), the rung (or the new one), the points the bout gave
  const moved = f.place ? f.place.before - f.place.after : 0;
  const rung = f.rungAfter.rung > f.rungBefore.rung ? `Nouveau palier : ${f.rungAfter.label} !` : f.rungAfter.rung < f.rungBefore.rung ? `Recul : ${f.rungAfter.label}` : f.rungAfter.label;
  rows.push({
    k: 'Classement', v: f.place ? `${nth(f.place.after)} sur ${f.place.of}` : `${f.score} pts`,
    d: f.pts ? signedN(f.pts, ' pts') : '', tone: toneOf(f.pts || moved),
    note: [rung, moved ? `était ${nth(f.place!.before)}` : ''].filter(Boolean).join(' · '),
  });
  const gauge = (id: DimId) => f.gauges.find(g => g.id === id);
  const delta = (g: GaugeMove | undefined) => (g ? Math.round(g.after) - Math.round(g.before) : 0);
  for (const id of ['reputation', 'influence'] as const) {
    const g = gauge(id); if (!g) continue;
    const dg = delta(g);
    rows.push({ k: g.label, v: g.up ? `${g.word} !` : g.word, d: dg ? signedN(dg) : '=', tone: toneOf(dg), ...(g.up ? { note: 'Nouveau mot' } : {}) });
  }
  const dr = delta(gauge('richesse'));
  if (f.purse) rows.push({ k: 'Cachet', v: `+${fmt(f.purse)}`, d: dr ? `Richesse ${signedN(dr)}` : '', tone: 'up' });
  const forme = gauge('forme'), df = delta(forme);
  if (forme && df) rows.push({ k: forme.label, v: forme.up ? `${forme.word} !` : forme.word, d: signedN(df), tone: toneOf(df) });
  if (f.belt) rows.push({ k: 'Ceinture', v: f.belt === 'won' ? 'À toi !' : f.belt === 'lost' ? `Prise par ${f.opp}` : 'Défendue', tone: f.belt === 'lost' ? 'down' : 'up' });
  const sub = [f.kind === 'title' ? 'Combat pour le titre' : f.kind === 'gala' ? 'Gala' : '', `contre ${f.opp}`, f.how, f.discipline === 'avec_frappe' ? 'avec frappe' : '']
    .filter(Boolean).join(' · ');
  return { icon: f.res === 'V' || f.belt === 'won' ? '🏆' : '🤼', title: RES_WORD[f.res], sub, rows, next: f.next };
}

/** What the career knows of the next bout, for the card's last lines (the gala and title rules of src/career/roster.ts). */
export interface NextFacts {
  day: number; res: BoutRes; opp: string;
  /** The rung after the bout and what the next one asks (`rankOf(...).next`). */
  rung: number; next: { label: string; missing: string } | null;
  belt: { held: boolean };
  /** `galaBlock` finds nothing in the way: a gala place / the title bout is still open tonight. */
  galaTonight: boolean; titleTonight: boolean;
}
/** The first fight evening (Friday–Sunday) from `day` on. */
const fightDayFrom = (day: number) => { let d = Math.floor(day); while (!isFightDay(d)) d++; return d; };
/**
 * The next bill or step, two lines at most (pure): a revenge after a defeat; then the belt to defend, the title to fight
 * for, or a gala place, on the evening the rules open it (« ce soir », « demain soir », « vendredi soir »); else, or
 * after the revenge, the next rung and what it still asks.
 */
export function nextSteps(f: NextFacts): string[] {
  const out: string[] = [];
  if (f.res === 'D') out.push(`Revanche à prendre contre ${f.opp}`);
  const when = (d: number) => (d === f.day ? 'ce soir' : d === f.day + 1 ? 'demain soir' : `${WEEKDAY_FR[weekday(d)]} soir`);
  const sunday = () => when(f.titleTonight ? f.day : nextTitleDay(f.day + 1));
  if (f.belt.held) out.push(`Défendre la ceinture : ${sunday()}, au gala du dimanche`);
  else if (f.rung >= TITLE_RUNG) out.push(`Combat pour le titre : ${sunday()}, au gala du dimanche`);
  else if (f.rung >= GALA_RUNG) out.push(`Place au gala : ${when(f.galaTonight ? f.day : fightDayFrom(f.day + 1))}, dès ${FIGHT_FROM} h`);
  if (out.length < 2 && f.next) out.push(`Prochain palier : ${f.next.label}${f.next.missing === 'au prochain combat' ? ', au prochain combat' : ` · il manque ${f.next.missing}`}`);
  return out.slice(0, 2);
}
