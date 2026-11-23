/**
 * Làmb 2.0 — the écurie drills, played (docs/LAMB2.md « Les exercices de l'écurie »), behind ?lamb2. The career lane's
 * three drills (src/career/module.ts DRILLS: Sac de frappe, Travail des saisies, Gainage et pompes) stay timed actions
 * without the flag; with it each is a short drill with the avec-frappe controls, called by Coach Ablaye in the style of
 * his lesson (src/lamb/lesson.ts). Pure data and a small state machine (tests/lamb2Drills.test.ts); src/lamb/duel.ts
 * plays the calls (the coach's word, or the partner's move) and tells it what the player did.
 *
 * - The calls are a fixed sequence, no draw: the score is what the player did, never luck. A call is answered right or
 *   not (late, the wrong answer, out of reach, beaten); an answer with no call open is a fault (« attends mon appel »).
 *   Score = right answers − faults (never below 0), out of the number of calls.
 * - The attribute gain is not decided here: a finished drill counts once, exactly as the timed drill does (its counter,
 *   read by src/career/career.ts fighterAttributes — slower and slower towards 100). An abandoned drill counts nothing.
 */
import { utter } from '../i18n/lines';
import type { ClinchMove } from './clinch';
import type { TeachKey } from './lesson';

export type DrillId = 'frappe' | 'saisies' | 'gainage';
export const DRILL_IDS: readonly DrillId[] = ['frappe', 'saisies', 'gainage'];
/** What a call asks: a strike on the pads (`quick`, `big`), or the partner's move to answer in the empoignade. */
export type DrillWant = 'quick' | 'big' | ClinchMove;
/** A call: the earliest second it opens (it waits while the one before is still open), and what it asks. */
export interface DrillCall { at: number; want: DrillWant }

export interface DrillDef {
  title: string;
  /** The career's drill action this plays, and the counter that action counts (src/career/module.ts DRILLS). */
  action: 'drill_frappe' | 'drill_saisies' | 'drill_force';
  counter: 'entr_frappe' | 'entr_saisies' | 'entr_force';
  /** Keys on a keyboard, touch buttons to highlight. */
  keys: string;
  touch: TeachKey[];
  /** Coach Ablaye's word: lexicon phrases only (their gloss is shown), then the French. */
  wolof: string[];
  fr: string;
  /** Standing (the pads) or in the empoignade. */
  in: 'fight' | 'clinch';
  calls: readonly DrillCall[];
  /** Seconds an open call waits for its answer to start. */
  window: number;
}

const every = (start: number, gap: number, wants: DrillWant[]): DrillCall[] => wants.map((want, i) => ({ at: start + i * gap, want }));

export const DRILLS: Record<DrillId, DrillDef> = {
  frappe: {
    title: 'Sac de frappe', action: 'drill_frappe', counter: 'entr_frappe', keys: 'J frappe rapide · K grosse frappe', touch: ['quick', 'big'],
    wolof: ['Gaawal !'], fr: 'Babacar tient les paos. À mon appel : « Rapide ! » une frappe rapide, « Fort ! » une grosse frappe. Pas avant.',
    in: 'fight', calls: every(1.6, 1.9, ['quick', 'quick', 'big', 'quick', 'big', 'big', 'quick', 'big']), window: 1.1,
  },
  saisies: {
    title: 'Travail des saisies', action: 'drill_saisies', counter: 'entr_saisies', keys: 'E pousser · G tirer · J pivoter', touch: ['grab', 'guard', 'quick'],
    wolof: ['Xaaral tuuti.'], fr: 'Babacar arme un mouvement, lentement : lis-le et réponds avec celui qui le bat. Tirer bat Pousser, Pivoter bat Tirer, Pousser bat Pivoter.',
    in: 'clinch', calls: every(1.6, 2.6, ['push', 'pull', 'pivot', 'pull', 'push', 'pivot']), window: 1.6,
  },
  gainage: {
    title: 'Gainage', action: 'drill_force', counter: 'entr_force', keys: 'E pousser', touch: ['grab'],
    wolof: ['Bul tiit !'], fr: 'Il pousse, encore et encore : tiens-toi en poussant avec lui, au moment où il pousse. Garde ton souffle.',
    in: 'clinch', calls: every(1.6, 1.8, ['push', 'push', 'push', 'push', 'push', 'push']), window: 1.3,
  },
};
/** The drill a career drill action plays (null: not a drill). */
export const drillOfAction = (actionId: string): DrillId | null => DRILL_IDS.find(id => DRILLS[id].action === actionId) ?? null;

export type CallResult = 'right' | 'late' | 'wrong' | 'miss';
/** What happened in the drill, as it hears it. */
export type DrillEvent =
  | { k: 'swing'; kind: 'quick' | 'big' }
  | { k: 'land'; kind: 'quick' | 'big'; result: 'hit' | 'stagger' | 'guarded' | 'miss' }
  | { k: 'exchange'; by: 'player' | 'opponent'; winner: 'player' | 'opponent' | null; result: string; move: ClinchMove; against: ClinchMove | null }
  | { k: 'fall' };

/** A drill in progress. `open`: the call waiting for its answer (`swung`: the strike that answers it, until it lands). */
export interface DrillRun {
  id: DrillId;
  t: number;
  next: number;
  open: { i: number; since: number; swung: 'quick' | 'big' | null } | null;
  results: (CallResult | null)[];
  faults: number;
  falls: number;
  ready: boolean;
  done: boolean;
}
export const startDrill = (id: DrillId): DrillRun =>
  ({ id, t: 0, next: 0, open: null, results: DRILLS[id].calls.map(() => null), faults: 0, falls: 0, ready: false, done: false });

/** Seconds after the last call closes before the drill ends (the last exchange or strike is seen). */
const TAIL = 0.6;
/** A strike that answers a call has this long to land (its windup) before the call is lost. */
const LAND_SLACK = 1.0;

function close(d: DrillRun, r: CallResult): CallResult {
  if (d.open) d.results[d.open.i] = r;
  d.open = null;
  return r;
}

/**
 * Time passes. Returns the call that opens now (the duel says it, or sets the partner's move) and the result of a call
 * closed by time (late), if any; marks the drill done once every call is closed.
 */
export function drillTick(d: DrillRun, dt: number): { opened: DrillCall | null; closed: CallResult | null } {
  const out = { opened: null as DrillCall | null, closed: null as CallResult | null };
  if (d.done) return out;
  d.t += dt;
  const def = DRILLS[d.id];
  if (d.open) {
    const waited = d.t - d.open.since;
    if (def.in === 'fight' && !d.open.swung && waited > def.window) out.closed = close(d, 'late');
    else if (waited > def.window + LAND_SLACK) out.closed = close(d, d.open.swung ? 'miss' : 'late');
  }
  if (!d.open && d.next < def.calls.length && d.t >= def.calls[d.next].at) {
    d.open = { i: d.next, since: d.t, swung: null };
    out.opened = def.calls[d.next]; d.next++;
  }
  if (!d.open && d.next >= def.calls.length) {
    const last = Math.max(def.calls[def.calls.length - 1].at, 0);
    if (d.t >= last + TAIL) d.done = true;
  }
  return out;
}

/**
 * The drill hears what the player did (or what happened to him). Returns the result of the call it closed, 'fault' for
 * an answer with no call open, or null.
 */
export function hearDrill(d: DrillRun, e: DrillEvent): CallResult | 'fault' | null {
  if (d.done) return null;
  const def = DRILLS[d.id], o = d.open;
  if (e.k === 'fall') {
    d.falls++;
    return o ? close(d, 'miss') : null;
  }
  if (def.in === 'fight') {
    if (e.k === 'swing') {
      if (!o) { d.faults++; return 'fault'; }
      if (o.swung) return null;                                         // a second strike while the first flies: nothing
      if (e.kind !== def.calls[o.i].want) return close(d, 'wrong');
      o.swung = e.kind;
      return null;
    }
    if (e.k === 'land') {
      if (!o || o.swung !== e.kind) return null;                        // the landing of a strike that answered nothing
      return close(d, e.result === 'hit' || e.result === 'stagger' ? 'right' : 'miss');
    }
    return null;
  }
  if (e.k !== 'exchange') return null;
  if (!o) {
    if (e.by === 'player') { d.faults++; return 'fault'; }                // a move of his own before the call
    return null;
  }
  const want = def.calls[o.i].want as ClinchMove;
  if (d.id === 'saisies') return close(d, e.winner === 'player' && e.result === 'counter' ? 'right' : 'miss');
  // gainage: his push met by a push — the two push together (« clash »), whoever is stronger; a counter is not the drill
  return close(d, e.result === 'clash' && e.move === want && e.against === want ? 'right' : 'miss');
}

/** Right answers, faults, falls, and the score (right − faults, at least 0) out of the calls. */
export function drillScore(d: DrillRun) {
  const right = d.results.filter(r => r === 'right').length, of = DRILLS[d.id].calls.length;
  return { right, faults: d.faults, falls: d.falls, score: Math.max(0, right - d.faults), of };
}

/** Coach Ablaye's opening line for a drill: « Gaawal ! » (dépêche-toi) · then the French. */
export function drillLine(id: DrillId): string {
  const def = DRILLS[id];
  return `Coach Ablaye : ${utter(def.wolof)} ${def.fr}`;
}
/** What the coach calls: « Rapide ! », « Fort ! » (the pads); in the empoignade the partner's body tells, not the coach. */
export const callWord = (want: DrillWant): string | null => (want === 'quick' ? 'Rapide !' : want === 'big' ? 'Fort !' : null);
/** A word on a call just closed, or a fault (null: nothing to add). */
export function drillFeedback(id: DrillId, r: CallResult | 'fault' | null): string | null {
  if (r === 'fault') return 'Attends mon appel.';
  if (r === 'late') return id === 'frappe' ? 'Trop tard : frappe dès l’appel.' : 'Trop tard : réponds pendant qu’il arme.';
  if (r === 'wrong') return 'Pas cette frappe : écoute l’appel.';
  if (r === 'miss') return id === 'frappe' ? 'Trop loin : un pas vers les paos.' : id === 'saisies' ? 'Tirer bat Pousser, Pivoter bat Tirer, Pousser bat Pivoter.' : 'Pousse en même temps que lui, pas avant ni après.';
  if (r === 'right') return id === 'frappe' ? 'Juste.' : id === 'saisies' ? 'Bien lu.' : 'Tenu.';
  return null;
}
/** Coach Ablaye's word at the end, by the score: lexicon phrases (with their gloss), then the French. */
export function drillVerdict(d: DrillRun): { score: number; of: number; line: string } {
  const s = drillScore(d), share = s.of ? s.score / s.of : 0;
  const [w, fr] = share >= 0.85 ? [['Baax na !'], 'Juste et à temps.'] : share >= 0.5 ? [['Ndank ndank.'], 'C’est parti : on continue demain.'] : [['Bul tiit !'], 'On recommence, calmement.'];
  return { score: s.score, of: s.of, line: `Coach Ablaye : ${utter(w as string[])} ${fr} ${s.score}/${s.of}.` };
}
