/**
 * Progression without classes (docs/SPEC_SIGNATURE_2026-10-10.md §1–2, §13–15; docs/CAREER.md). The player never picks
 * a career: what they become is read from what they did. Pure logic, no DOM: four light dimensions (Forme, Richesse,
 * Réputation, Influence), the fighter attributes fed by training (data for the làmb 2.0 lane), the ladder towards
 * « Roi des Arènes », purses, rivalries and the persistent fight record.
 */
export type Counters = Record<string, number>;

// ------------------------------------------------------------------ fighter attributes (§7, §13)

export type AttrId = 'force' | 'equilibre' | 'technique' | 'explosivite' | 'endurance' | 'frappe' | 'defense' | 'sangfroid';
export const ATTRS: { id: AttrId; label: string; from: string }[] = [
  { id: 'force', label: 'Force', from: 'écurie, gainage' },
  { id: 'equilibre', label: 'Équilibre', from: 'écurie, saisies' },
  { id: 'technique', label: 'Technique', from: 'saisies, sparring' },
  { id: 'explosivite', label: 'Explosivité', from: 'sac de frappe, course' },
  { id: 'endurance', label: 'Endurance', from: 'course dans Dakar' },
  { id: 'frappe', label: 'Frappe', from: 'sac de frappe' },
  { id: 'defense', label: 'Défense', from: 'sparring, combats' },
  { id: 'sangfroid', label: 'Sang-froid', from: 'combats, entrées' },
];

/** 20 at the start, towards 100 with practice, slower and slower: no attribute ever guarantees a win. */
export const curve = (x: number, k: number) => Math.round(20 + 80 * (1 - Math.exp(-Math.max(0, x) / k)));

/**
 * Attributes from the counters the game already keeps: écurie sessions (`lutte`), sparring (`lamb_skill`), running
 * (`forme`), the écurie drills (`entr_force`, `entr_saisies`, `entr_frappe`), bouts and entrances. Data only for now:
 * the làmb 2.0 lane reads them; morphology and skill still decide a bout.
 */
export function fighterAttributes(c: Counters): Record<AttrId, number> {
  const n = (k: string) => Math.max(0, c[k] ?? 0);
  const ecurie = n('lutte'), sparring = n('lamb_skill'), bouts = n('combats'), wins = n('victoires');
  return {
    force: curve(ecurie + n('entr_force') * 1.2, 30),
    equilibre: curve(ecurie * 0.8 + n('entr_saisies') * 0.6 + sparring * 0.4, 30),
    technique: curve(sparring + n('entr_saisies') + bouts * 0.3, 30),
    explosivite: curve(n('entr_frappe') * 0.6 + n('forme') * 0.15 + n('entr_force') * 0.3, 30),
    endurance: curve(n('forme') * 0.5 + ecurie * 0.4, 30),
    frappe: curve(n('entr_frappe') * 1.2, 30),
    defense: curve(sparring * 0.8 + bouts * 0.4, 30),
    sangfroid: curve(bouts + wins * 0.5 + n('entrees') * 0.3, 25),
  };
}

// ------------------------------------------------------------------ fight record (§15)

export type BoutMode = 'amical' | 'classe';
export type BoutRes = 'V' | 'D' | 'N' | 'A';
export interface BoutEntry {
  /** Played time (ms) and city day of the bout. */
  at: number; day: number;
  mode: BoutMode;
  /** Opponent (fictional wrestler), style label and level 1–5. */
  opp: string; style: string; level: number;
  res: BoutRes;
  /** How it ended: projection, décision, égalité, abandon. */
  how: string;
  /** Purse received (F CFA) and ladder points moved. */
  purse: number; pts: number;
  /** A place on a gala card, or a title bout (absent: an ordinary bout). */
  kind?: 'gala' | 'title';
}
export interface CareerSave {
  bouts: BoutEntry[];
  /** Best rung index ever reached (« ancien champion » survives a bad run). */
  best: number;
  /** Gala main events the player watched to the end: the city remembers their live result (src/career/roster.ts). */
  galas?: { day: number; winner: string | null }[];
  /** Forme / Richesse / Réputation / Influence as last seen on each of the last city days (src/career/progress.ts). */
  dims?: { day: number; s: [number, number, number, number] }[];
  /** The best word (level 0–4) each dimension has reached: a new word is celebrated once. */
  dimBest?: number[];
  /** The roster wrestler the player follows (src/career/roster.ts id), if any: no reward, just following. */
  fav?: string;
}
/** Bouts kept in the save: far beyond a season; the global counters keep the lifetime totals. */
export const BOUTS_MAX = 300;
export const newCareer = (): CareerSave => ({ bouts: [], best: 0, galas: [] });

const RES: BoutRes[] = ['V', 'D', 'N', 'A'];
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Validates a stored career (any shape) into a CareerSave; malformed bouts are dropped. */
export function careerOf(v: unknown): CareerSave {
  if (!v || typeof v !== 'object') return newCareer();
  const r = v as Record<string, unknown>;
  const bouts = (Array.isArray(r.bouts) ? r.bouts : []).flatMap((b): BoutEntry[] => {
    if (!b || typeof b !== 'object') return [];
    const e = b as Record<string, unknown>;
    if (!RES.includes(e.res as BoutRes) || (e.mode !== 'amical' && e.mode !== 'classe') || !str(e.opp)) return [];
    const kind: Pick<BoutEntry, 'kind'> = e.kind === 'gala' || e.kind === 'title' ? { kind: e.kind } : {};
    return [{ at: Math.max(0, num(e.at)), day: Math.max(0, Math.floor(num(e.day))), mode: e.mode, opp: str(e.opp), style: str(e.style), level: Math.min(9, Math.max(1, Math.round(num(e.level, 1)))),
      res: e.res as BoutRes, how: str(e.how), purse: Math.max(0, Math.round(num(e.purse))), pts: Math.round(num(e.pts)), ...kind }];
  }).slice(-BOUTS_MAX);
  const galas = (Array.isArray(r.galas) ? r.galas : []).flatMap(g => {
    if (!g || typeof g !== 'object') return [];
    const x = g as Record<string, unknown>;
    return [{ day: Math.max(0, Math.floor(num(x.day))), winner: typeof x.winner === 'string' ? str(x.winner, 20) : null }];
  }).slice(-60);
  const score = (x: unknown) => Math.max(0, Math.min(100, Math.round(num(x))));
  const dims = (Array.isArray(r.dims) ? r.dims : []).flatMap(g => {
    if (!g || typeof g !== 'object' || !Array.isArray((g as { s?: unknown }).s) || (g as { s: unknown[] }).s.length !== 4) return [];
    const x = g as { day?: unknown; s: unknown[] };
    return [{ day: Math.max(0, Math.floor(num(x.day))), s: x.s.map(score) as [number, number, number, number] }];
  }).slice(-8);
  const dimBest = Array.isArray(r.dimBest) && r.dimBest.length === 4 ? r.dimBest.map(v => Math.max(0, Math.min(4, Math.floor(num(v))))) : undefined;
  const fav = typeof r.fav === 'string' && /^[a-z]{2,16}$/.test(r.fav) ? r.fav : undefined;
  return { bouts, best: Math.min(RUNGS.length - 1, Math.max(0, Math.floor(num(r.best)))), galas, ...(dims.length ? { dims } : {}), ...(dimBest ? { dimBest } : {}), ...(fav ? { fav } : {}) };
}

export interface RecordSummary {
  bouts: number; v: number; d: number; n: number; ab: number;
  /** Ranked bouts only. */
  ranked: { v: number; d: number; n: number };
  bestPurse: number; purses: number;
  /** Opponent with the most history (a loss or two bouts or more), with the head-to-head. */
  rival: { name: string; v: number; d: number; n: number } | null;
  last: BoutEntry | null;
  streak: { res: BoutRes; count: number } | null;
}
export function summary(bouts: readonly BoutEntry[]): RecordSummary {
  const s: RecordSummary = { bouts: 0, v: 0, d: 0, n: 0, ab: 0, ranked: { v: 0, d: 0, n: 0 }, bestPurse: 0, purses: 0, rival: null, last: null, streak: null };
  const h2h = new Map<string, { v: number; d: number; n: number; t: number }>();
  for (const b of bouts) {
    if (b.res === 'A') s.ab++; else { s.bouts++; if (b.res === 'V') s.v++; else if (b.res === 'D') s.d++; else s.n++; }
    if (b.mode === 'classe' && b.res !== 'A') { if (b.res === 'V') s.ranked.v++; else if (b.res === 'D') s.ranked.d++; else s.ranked.n++; }
    s.bestPurse = Math.max(s.bestPurse, b.purse); s.purses += b.purse;
    if (b.res === 'A') continue;
    const h = h2h.get(b.opp) ?? { v: 0, d: 0, n: 0, t: 0 };
    if (b.res === 'V') h.v++; else if (b.res === 'D') h.d++; else h.n++;
    h.t++; h2h.set(b.opp, h);
  }
  let best: [string, { v: number; d: number; n: number; t: number }] | null = null;
  for (const e of h2h) if ((e[1].d > 0 || e[1].t >= 2) && (!best || e[1].t + e[1].d > best[1].t + best[1].d)) best = e;
  if (best) s.rival = { name: best[0], v: best[1].v, d: best[1].d, n: best[1].n };
  s.last = bouts.length ? bouts[bouts.length - 1] : null;
  const fought = bouts.filter(b => b.res !== 'A');
  if (fought.length) {
    const r = fought[fought.length - 1].res; let k = 0;
    for (let i = fought.length - 1; i >= 0 && fought[i].res === r; i--) k++;
    s.streak = { res: r, count: k };
  }
  return s;
}

// ------------------------------------------------------------------ ladder towards « Roi des Arènes » (§14)

export interface Rung {
  id: string; label: string;
  /** Rank score needed. */
  min: number;
  /** Base purse of a ranked bout at this rung (F CFA). */
  purse: number;
  /** Other conditions (ranked wins, opponents of a level, a title) and how to say what is missing. */
  needs?: { rankedWins?: number; beatenLevel?: number; title?: boolean; defences?: number };
}
export const RUNGS: Rung[] = [
  { id: 'petits', label: 'Petits combats', min: 0, purse: 5_000 },
  { id: 'undercard', label: 'Undercards', min: 60, purse: 15_000, needs: { rankedWins: 1 } },
  { id: 'classes', label: 'Combats classés', min: 150, purse: 50_000, needs: { rankedWins: 3 } },
  { id: 'reputes', label: 'Adversaires réputés', min: 300, purse: 150_000, needs: { rankedWins: 6, beatenLevel: 3 } },
  { id: 'contender', label: 'Contender', min: 500, purse: 400_000, needs: { rankedWins: 10, beatenLevel: 5 } },
  { id: 'champion', label: 'Champion', min: 500, purse: 1_000_000, needs: { title: true } },
  { id: 'roi', label: 'Roi des Arènes', min: 1000, purse: 2_500_000, needs: { title: true, defences: 3 } },
];

/**
 * Ladder points of one bout: ranked bouts count most and weigh the opponent's level; a defeat costs a little (less
 * against a stronger opponent) and never wipes a career; a friendly bout counts a little; an abandon costs a little.
 */
export function boutPoints(mode: BoutMode, res: BoutRes, level: number, projection = false, kind?: 'gala' | 'title'): number {
  if (kind && mode === 'classe') { const p = boutPoints(mode, res, level, projection); return p > 0 ? Math.round(p * (kind === 'title' ? 2 : 1.5)) : p; }
  const L = Math.max(1, Math.min(9, level));
  if (mode === 'amical') return res === 'V' ? 4 + L : res === 'N' ? 1 : res === 'D' ? -1 : -1;
  if (res === 'V') return 12 + 6 * L + (projection ? 4 : 0);
  if (res === 'N') return 4 + L;
  if (res === 'D') return -(6 - Math.min(4, L));
  return -3;
}

/** Regularity: city days with a bout among the last seven (each adds 3 points while it lasts). */
export function regularity(bouts: readonly BoutEntry[], today: number): number {
  const days = new Set(bouts.filter(b => b.res !== 'A' && today - b.day < 7 && b.day <= today).map(b => b.day));
  return Math.min(7, days.size);
}

export interface Rank {
  score: number; rung: number; label: string;
  next: { label: string; missing: string } | null;
}
/** The player's belt: held or not, and the defences won since it was won (src/career/roster.ts keeps who holds it). */
export interface Belt { held: boolean; defences: number }
/**
 * Rank from the record: points (opponents' quality, wins, defeats), regularity and the rungs' conditions. Champion
 * means holding the belt; Roi des Arènes, holding it with three defences won. Losing the belt drops the rank back to the
 * points' rung (the best rung reached is kept apart).
 */
export function rankOf(bouts: readonly BoutEntry[], today: number, belt: Belt | number = { held: false, defences: 0 }): Rank {
  const b: Belt = typeof belt === 'number' ? { held: belt > 0, defences: 0 } : belt;
  const pts = Math.max(0, bouts.reduce((t, b) => t + b.pts, 0));
  const score = pts + 3 * regularity(bouts, today);
  const rankedWins = bouts.filter(b => b.mode === 'classe' && b.res === 'V').length;
  const beaten = bouts.filter(b => b.mode === 'classe' && b.res === 'V').reduce((m, b) => Math.max(m, b.level), 0);
  const ok = (r: Rung) => score >= r.min && (r.needs?.rankedWins ?? 0) <= rankedWins && (r.needs?.beatenLevel ?? 0) <= beaten && (!r.needs?.title || b.held) && (r.needs?.defences ?? 0) <= b.defences;
  let rung = 0;
  for (let i = 1; i < RUNGS.length; i++) { if (ok(RUNGS[i])) rung = i; else break; }
  const nx = RUNGS[rung + 1];
  let next: Rank['next'] = null;
  if (nx) {
    const miss: string[] = [];
    if (score < nx.min) miss.push(`${nx.min - score} pts`);
    const w = (nx.needs?.rankedWins ?? 0) - rankedWins;
    if (w > 0) miss.push(`${w} victoire${w > 1 ? 's' : ''} classée${w > 1 ? 's' : ''}`);
    if ((nx.needs?.beatenLevel ?? 0) > beaten) miss.push(`battre un niveau ${nx.needs!.beatenLevel}`);
    if (nx.needs?.title && !b.held) miss.push('gagner le titre au gala du dimanche');
    const dl = (nx.needs?.defences ?? 0) - b.defences;
    if (b.held && dl > 0) miss.push(`${dl} défense${dl > 1 ? 's' : ''} du titre`);
    next = { label: nx.label, missing: miss.join(' · ') || 'au prochain combat' };
  }
  return { score, rung, label: RUNGS[rung].label, next };
}

/** Purse of a ranked bout at a rung: a win pays more (and more against a stronger opponent), a defeat less, an abandon nothing. Friendly bouts pay nothing. */
export function purseOf(mode: BoutMode, res: BoutRes, rung: number, level: number, kind?: 'gala' | 'title'): number {
  if (mode !== 'classe' || res === 'A') return 0;
  if (kind) return Math.round((purseOf(mode, res, rung, level) * (kind === 'title' ? 3 : 2)) / 250) * 250;
  const base = RUNGS[Math.max(0, Math.min(RUNGS.length - 1, rung))].purse;
  const k = res === 'V' ? 1.5 * (1 + 0.1 * Math.max(1, level)) : res === 'N' ? 1 : 0.6;
  return Math.round((base * k) / 250) * 250;
}

/** Reputation points of the record: ranked wins against good opponents most, spectacular projections, entrances. */
export function famePoints(bouts: readonly BoutEntry[], entrances = 0): number {
  let f = entrances * 3;
  for (const b of bouts) {
    const L = Math.max(1, b.level);
    const big = b.kind === 'title' ? 3 : b.kind === 'gala' ? 2 : 1;
    if (b.mode === 'classe') f += (b.res === 'V' ? 8 + 3 * L + (b.how === 'projection' ? 3 : 0) : b.res === 'N' ? 3 : b.res === 'D' ? 2 : 0) * big;
    else f += b.res === 'V' ? 2 + L : b.res === 'A' ? 0 : 1;
  }
  return f;
}

// ------------------------------------------------------------------ the four dimensions (§2)

export type DimId = 'forme' | 'richesse' | 'reputation' | 'influence';
export const DIM_IDS: readonly DimId[] = ['forme', 'richesse', 'reputation', 'influence'];
export interface Dim { id: DimId; label: string; score: number; level: string; note: string }
const sat = (x: number, k: number) => Math.round(100 * (1 - Math.exp(-Math.max(0, x) / k)));
/** Which of a dimension's five words a score shows (0–4): one word per fifth of the gauge. */
export const levelIndex = (s: number, n = 5) => Math.max(0, Math.min(n - 1, Math.floor(s / (100 / n))));
const pick = (s: number, words: string[]) => words[levelIndex(s, words.length)];

export interface DimInput {
  counters: Counters;
  netWorth: number;
  /** Relationship levels with the player (−100…100). */
  relations: number[];
  /** Ventures, billboards and other income assets owned. */
  ventures: number;
  bouts: readonly BoutEntry[];
  rung: number;
}
/** Forme / Richesse / Réputation / Influence, 0–100 each, with a word and a one-line reason. Never a class. */
export function dimensions(d: DimInput, fmt: (n: number) => string): Dim[] {
  const c = (k: string) => Math.max(0, d.counters[k] ?? 0);
  const forme = sat(c('forme') + c('lutte') * 0.5 + c('entr_force') * 0.3, 60);
  const lw = Math.log10(Math.max(1, d.netWorth));
  const richesse = Math.max(0, Math.min(100, Math.round(((lw - 3.5) / (9 - 3.5)) * 100)));
  const fame = famePoints(d.bouts, c('entrees'));
  const reputation = sat(fame, 250);
  const friends = d.relations.filter(r => r >= 30).length, known = d.relations.filter(r => r > 0).length;
  const influence = sat(friends * 6 + known + d.ventures * 8 + c('evenements') * 10 + d.rung * 5, 120);
  const sum = summary(d.bouts);
  return [
    { id: 'forme', label: 'Forme', score: forme, level: pick(forme, ['À reprendre', 'En progrès', 'En forme', 'Athlétique', 'Au sommet']),
      note: `${c('forme')} pts de course et de sport · ${c('lutte')} entraînement${c('lutte') > 1 ? 's' : ''} à l’écurie` },
    { id: 'richesse', label: 'Richesse', score: richesse, level: pick(richesse, ['Modeste', 'À l’aise', 'Aisé', 'Riche', 'Très riche']),
      note: `Patrimoine ${fmt(d.netWorth)}${d.ventures ? ` · ${d.ventures} affaire${d.ventures > 1 ? 's' : ''}` : ''}` },
    { id: 'reputation', label: 'Réputation', score: reputation, level: pick(reputation, ['Inconnu', 'Connu du quartier', 'Connu à Dakar', 'Célèbre', 'Légende']),
      note: sum.bouts ? `${sum.bouts} combat${sum.bouts > 1 ? 's' : ''} · ${sum.v} V · ${sum.d} D${sum.n ? ` · ${sum.n} N` : ''}` : 'Pas encore de combat : l’arène t’attend' },
    { id: 'influence', label: 'Influence', score: influence, level: pick(influence, ['Discret', 'Entouré', 'Écouté', 'Influent', 'Incontournable']),
      note: `${friends} ami${friends > 1 ? 's' : ''} · ${known} connaissance${known > 1 ? 's' : ''}${c('evenements') ? ` · ${c('evenements')} événement${c('evenements') > 1 ? 's' : ''}` : ''}` },
  ];
}

/**
 * The line other players read under the player's name (presence `rec`, src/multiplayer/protocol.ts recordTag): rung,
 * ranked wins-defeats(-draws) and the écurie, e.g. « Undercards · 3-1 · Écurie Baobab »; null before the first ranked bout.
 */
export function publicRecord(bouts: readonly BoutEntry[], rankLabel: string, ecurie: string | null): string | null {
  const s = summary(bouts.filter(b => b.mode === 'classe'));
  if (!s.bouts) return null;
  const k = (n: number) => Math.min(9999, n);
  return [rankLabel, `${k(s.v)}-${k(s.d)}${s.n ? `-${k(s.n)}` : ''}`, ecurie ? `Écurie ${ecurie}` : ''].filter(Boolean).join(' · ');
}

/** One line for the phone's profile: « 18 combats · 14 V · 4 D · Undercards · cachet record 25 000 F ». */
export function recordLine(bouts: readonly BoutEntry[], rankLabel: string, fmt: (n: number) => string): string {
  const s = summary(bouts);
  if (!s.bouts && !s.ab) return 'Pas encore de combat';
  return [`${s.bouts} combat${s.bouts > 1 ? 's' : ''}`, `${s.v} V`, `${s.d} D`, s.n ? `${s.n} N` : '', rankLabel, s.rival ? `rivalité avec ${s.rival.name}` : '', s.bestPurse ? `plus gros cachet ${fmt(s.bestPurse)}` : '']
    .filter(Boolean).join(' · ');
}
