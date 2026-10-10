/**
 * Làmb 2.0 — the city's wrestlers fight as themselves (docs/LAMB2.md). Pure data and functions, tested in
 * tests/lamb2.test.ts. One table maps a roster wrestler (src/career/roster.ts: name, écurie, style, level — the
 * career lane's data, read only) to the avec-frappe opponent: his style gives how he fights standing and in the
 * empoignade (STAND_STYLES, CLINCH_STYLES: how he reads and answers strikes, which moves he prefers, his appetite for
 * throws), his level shifts his attributes — never past the ±20 % rule, since every attribute acts through `k()`.
 * His identity is told in one line before the bout and in the recap: « Gora, costaud indépendant, 7-2 ».
 */
import { ROSTER, ladderAt, wrestlerByName, type Wrestler } from '../career/roster';
import type { BoutEntry } from '../career/career';
import { STAND_STYLES, type Attributes, type StandStyle, type Style6 } from './stand';
import { CLINCH_STYLES, type ClinchStyle } from './clinch';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * The one table: each of the six styles of the spec (§12) → stand-up and empoignade AI, the word that says it, and the
 * sans-frappe style it stands on (the duel's pace, endurance and colours: src/lamb/rules.ts STYLES).
 */
export const STYLE_MAP: Record<Style6, { stand: StandStyle; clinch: ClinchStyle; word: string; base: 'costaud' | 'rapide' | 'defensif' }> = {
  costaud: { stand: STAND_STYLES.costaud, clinch: CLINCH_STYLES.costaud, word: 'costaud', base: 'costaud' },
  technique: { stand: STAND_STYLES.technique, clinch: CLINCH_STYLES.technique, word: 'technicien', base: 'defensif' },
  rapide: { stand: STAND_STYLES.rapide, clinch: CLINCH_STYLES.rapide, word: 'rapide', base: 'rapide' },
  defensif: { stand: STAND_STYLES.defensif, clinch: CLINCH_STYLES.defensif, word: 'défensif', base: 'defensif' },
  frappeur: { stand: STAND_STYLES.frappeur, clinch: CLINCH_STYLES.frappeur, word: 'bon frappeur', base: 'rapide' },
  saisie: { stand: STAND_STYLES.saisie, clinch: CLINCH_STYLES.saisie, word: 'grand lutteur de saisie', base: 'costaud' },
};
/**
 * The roster's twelve wrestlers on the six styles (their roster style stays the career's; avec frappe each fights his
 * own way): two of each. A wrestler not listed fights in his roster style.
 */
export const ROSTER_STYLE6: Readonly<Record<string, Style6>> = {
  babacar: 'costaud', gora: 'costaud',
  ousmane: 'technique', ndiaga: 'technique',
  lamine: 'rapide', pape: 'rapide',
  assane: 'defensif', saliou: 'defensif',
  malick: 'frappeur', birame: 'frappeur',
  daouda: 'saisie', pathe: 'saisie',
};
/** The avec-frappe style of a roster wrestler. */
export const style6Of = (w: Pick<Wrestler, 'id' | 'style'>): Style6 => ROSTER_STYLE6[w.id] ?? w.style;
/** Attribute points per level away from 3 (levels 1–5: −12…+12 on every attribute of the style). */
export const LEVEL_STEP = 6;

/** A wrestler's attributes: his style's shape, shifted by his level (kept within 5–95). */
export function rosterAttributes(w: { style: Style6; level: number }): Attributes {
  const base = STYLE_MAP[w.style].stand.attrs, shift = (clamp(w.level, 1, 5) - 3) * LEVEL_STEP;
  const out = { ...base };
  for (const key of Object.keys(out) as (keyof Attributes)[]) out[key] = clamp(base[key] + shift, 5, 95);
  return out;
}

/** « Gora, costaud indépendant, 7-2 » / « Daouda, costaud de l'écurie Teranga, 4-3-1 » (season record: V-D[-N]). */
export function identityLine(w: { name: string; style: Style6; ecurie: string | null }, rec?: { v: number; d: number; n: number } | null): string {
  const word = STYLE_MAP[w.style].word;
  const who = w.ecurie ? `${word} de l’écurie ${w.ecurie}` : `${word} indépendant`;
  const r = rec ? `, ${rec.v}-${rec.d}${rec.n ? `-${rec.n}` : ''}` : '';
  return `${w.name}, ${who}${r}`;
}

export interface Opponent {
  wrestler: Wrestler;
  /** His avec-frappe style (one of the six). */
  style: Style6;
  attrs: Attributes;
  stand: StandStyle;
  clinch: ClinchStyle;
  level: number;
  /** Season record on the city's ladder today (null when the ladder cannot be read). */
  record: { v: number; d: number; n: number } | null;
  line: string;
}

/**
 * The avec-frappe opponent for a roster name (the name the bout is against: the career's pick for ranked bouts, the
 * friendly menu's Gora, Pape or Saliou); null when the name is not on the roster. `career` is the save's career
 * (`state.data.career`: the player's bouts and the galas watched) so the record is the one the city's ladder shows.
 */
export function rosterOpponent(name: string, day: number, career?: { bouts?: readonly BoutEntry[]; galas?: readonly { day: number; winner: string | null }[] } | null): Opponent | null {
  const w = wrestlerByName(name);
  if (!w) return null;
  let record: Opponent['record'] = null;
  try {
    const s = ladderAt(day, career?.bouts ?? [], career?.galas ?? []).table.find(t => t.id === w.id);
    if (s) record = { v: s.v, d: s.d, n: s.n };
  } catch { record = null; }
  const style = style6Of(w), m = STYLE_MAP[style];
  return { wrestler: w, style, attrs: rosterAttributes({ style, level: w.level }), stand: m.stand, clinch: m.clinch, level: w.level, record, line: identityLine({ name: w.name, style, ecurie: w.ecurie }, record) };
}

/** Every roster wrestler has an avec-frappe identity (for the tests and the docs). */
export const rosterOpponents = (day: number) => ROSTER.map(w => rosterOpponent(w.name, day)!);
