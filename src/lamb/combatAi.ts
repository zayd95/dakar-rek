/**
 * The opponent of the new bout (docs/wrestling/COMBAT.md « L'adversaire »). Pure: plain numbers in, an Intent out — the
 * very intents the player's stick and buttons make, applied by src/lamb/duel.ts through the same code for both sides.
 * It never cheats: it sees what the screen shows of the player (his body's lean and weight, the hold in his hands, a move,
 * a reach or a throw while it is set up, his gauges), only after its reaction time, and never his inputs.
 *
 * - **Level** (AI_COMBAT, 1–5): reaction time, how often it reads a move or braces a throw the right way, how much it
 *   learns, how slowly it sets things up (its tells), how picky it is before throwing.
 * - **Style**: the six styles' Làmb 2.0 data (STAND_STYLES, CLINCH_STYLES) plus a **signature** each (SIGNATURE): the
 *   throw it works towards and the hold it reaches for.
 * - **Memory**: within the bout it counts the player's habits — the throw he tries, the move he starts with, the reach
 *   he uses; the same thing three times is read (« Il a compris ton jeu ! »). Across bouts against the same wrestler,
 *   half of it is kept in memory (never in the save: no schema change), so a rival remembers.
 * - Deterministic: every draw comes from the `rand` it is given (the duel's seeded stream).
 */
import { CLINCH_STYLES, answer, type ClinchMove, type ClinchStyle } from './clinch';
import { STAND_STYLES, rangeOf, type StandStyle, type Style6 } from './stand';
import { COMBAT, GRIPS, THROWS, braceAgainst, len, legOpen, throwVec, type GripKind, type Hold, type ThrowId, type Vec } from './combat';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** What a wrestler does this step — the player's stick and buttons, or the AI's choice. */
export interface Intent {
  /** The stick in his own frame (f towards the other man, s to his own left): footwork standing, push / pull / pivot and the weight in the empoignade. */
  stick: Vec;
  /** Saisir standing: a tap (the nape, or the leg when he leans in) or a hold (the belt). */
  reach: 'tap' | 'hold' | null;
  /** Garde held (avec frappe: against strikes; a fresh guard parries a reach for the nape). */
  guard: boolean;
  /** Reculer: a step back (a reach and a strike miss). */
  back: boolean;
  /** In the empoignade: Casser (break free), Saisir (go deeper), Projeter, Contrer. */
  brk: boolean; deeper: boolean; throw: boolean; counter: boolean;
  /** Avec frappe: a strike. */
  strike: 'quick' | 'big' | null;
}
export const idle = (): Intent => ({ stick: { f: 0, s: 0 }, reach: null, guard: false, back: false, brk: false, deeper: false, throw: false, counter: false, strike: null });

/** What the AI sees of itself (all of it) and of the player (what his body and the screen show). */
export interface AiView {
  phase: 'fight' | 'clinch';
  frappe: boolean;
  dist: number;
  /** Metres left behind each wrestler before the circle's edge (along the pair's line). */
  edgeMe: number; edgeHim: number;
  me: { stamina: number; max: number; balance: number; dir: Vec; hold: Hold; free: boolean; moving: boolean; throwing: boolean; open: number; stagger: number };
  him: {
    stamina: number; max: number; balance: number; dir: Vec; weight: Vec; hold: Hold; guard: boolean; guardFor: number;
    open: number; stagger: number;
    /** A move, a reach, a throw, a strike he is setting up — visible on his body — and for how long. */
    move: { kind: ClinchMove; t: number } | null;
    reach: { kind: GripKind; t: number } | null;
    throwing: { id: ThrowId; t: number } | null;
    strike: { kind: 'quick' | 'big'; t: number } | null;
  };
  /** The Prise from the AI's side (−100…100). */
  grip: number;
  /** The throw its hold gives now, with the score it would have (on what it sees of him). */
  best: { id: ThrowId; score: number } | null;
  /** The referee presses (0…1): standing without an empoignade, or an empoignade going nowhere. */
  urge: number;
  /** Seconds since it last attacked (passivity). */
  idle: number;
}

/**
 * By level (1–5). `react`: seconds to answer what it sees; `read`: share of the player's moves answered with the move that
 * beats them; `brace`: share of the player's throws braced the right way; `counter`: share it tries to turn instead;
 * `learn`: how much a read habit weighs; `pace`: seconds between its own initiatives (×); `slow`: how slowly it sets its
 * moves, reaches and throws up (its tells: a beginner sees them coming); `margin`: the throw score over the line it waits
 * for (below 0: a young wrestler throws too early, and fails); `breath`: endurance against its style's; `tells`: the sign
 * over its head says what it sets up (levels 1–2, and the lesson).
 */
export const AI_COMBAT = {
  react: [0.6, 0.5, 0.38, 0.31, 0.25],
  read: [0.22, 0.32, 0.48, 0.58, 0.68],
  brace: [0.22, 0.32, 0.48, 0.6, 0.7],
  counter: [0.04, 0.07, 0.12, 0.18, 0.24],
  learn: [0.45, 0.6, 0.8, 0.9, 1],
  pace: [1.55, 1.35, 1.05, 0.92, 0.82],
  slow: [1.6, 1.4, 1.15, 1.05, 1],
  margin: [-8, -4, 2, 5, 8],
  breath: [0.85, 0.9, 1, 1, 1],
  tells: [true, true, false, false, false],
} as const;
const lv = (level: number) => Math.max(1, Math.min(5, Math.round(level))) - 1;
export const aiLevel = (level: number) => {
  const i = lv(level);
  return { react: AI_COMBAT.react[i], read: AI_COMBAT.read[i], brace: AI_COMBAT.brace[i], counter: AI_COMBAT.counter[i], learn: AI_COMBAT.learn[i], pace: AI_COMBAT.pace[i], slow: AI_COMBAT.slow[i], margin: AI_COMBAT.margin[i], breath: AI_COMBAT.breath[i], tells: AI_COMBAT.tells[i] };
};

/**
 * Each style's signature: the throw it works towards (its moves set that throw up) and the reach it prefers. Invented,
 * a position game, never a scripted win: the throw still needs its set-up and can be braced or turned.
 */
export const SIGNATURE: Record<Style6 | 'partenaire', { throw: ThrowId; reach: 'tap' | 'hold'; word: string }> = {
  costaud: { throw: 'croc', reach: 'hold', word: 'pousse fort et crochète' },
  technique: { throw: 'balayage', reach: 'tap', word: 'te fait tourner et balaie' },
  rapide: { throw: 'jambe', reach: 'tap', word: 'plonge sur ta jambe' },
  defensif: { throw: 'hanche', reach: 'tap', word: 'attend ta poussée et te charge sur la hanche' },
  frappeur: { throw: 'ramene', reach: 'tap', word: 'te ramène au sol par la nuque' },
  saisie: { throw: 'souleve', reach: 'hold', word: 'prend la ceinture et soulève' },
  partenaire: { throw: 'croc', reach: 'tap', word: 'montre lentement' },
};
/** The move that sets a throw up (drives the man's weight its way). */
export function setupMove(id: ThrowId): ClinchMove {
  const d = THROWS[id].dir;
  return d === 'avant' ? 'pull' : d === 'arriere' ? 'push' : d === 'cote' ? 'pivot' : 'push';
}

/** The player's habits in a bout (what the AI can see him do), and the memory kept across bouts. */
export interface Habits { throws: Partial<Record<ThrowId, number>>; opens: Partial<Record<ClinchMove, number>>; reaches: Partial<Record<GripKind, number>>; answers: Partial<Record<string, number>> }
export const emptyHabits = (): Habits => ({ throws: {}, opens: {}, reaches: {}, answers: {} });
/** The memory across bouts, by opponent (his name): in memory only, never in the save. */
const MEMORY = new Map<string, Habits>();
/** Habits to start a bout with against `who`: half of what he remembers of the player. */
export function recall(who: string): Habits {
  const m = MEMORY.get(who), h = emptyHabits(); if (!m) return h;
  for (const key of ['throws', 'opens', 'reaches', 'answers'] as const) for (const [x, n] of Object.entries(m[key])) if (n) (h[key] as Record<string, number>)[x] = Math.min(3, Math.floor(n / 2));
  return h;
}
/** At the end of a bout: what he saw this bout is remembered (added to the old, kept small). */
export function remember(who: string, h: Habits) {
  const m = MEMORY.get(who) ?? emptyHabits();
  for (const key of ['throws', 'opens', 'reaches', 'answers'] as const) for (const [x, n] of Object.entries(h[key])) if (n) (m[key] as Record<string, number>)[x] = Math.min(8, ((m[key] as Record<string, number>)[x] ?? 0) + n);
  MEMORY.set(who, m);
}
/** Checks and tests: forget everything (a new page does that too). */
export const forgetAll = () => MEMORY.clear();
/** The most frequent of a tally and its share, or null under `min` samples. */
function top<K extends string>(t: Partial<Record<K, number>>, min = 3): { key: K; n: number; share: number } | null {
  let best: K | null = null, n = 0, sum = 0;
  for (const [x, c] of Object.entries(t) as [K, number][]) { sum += c; if (c > n) { n = c; best = x; } }
  return best && sum >= min ? { key: best, n, share: n / sum } : null;
}

/** A read habit, told once by the HUD (« Il a compris ton jeu ! »). */
export interface Read { what: 'throw' | 'open' | 'reach'; key: string }

export class CombatAi {
  readonly lvl: ReturnType<typeof aiLevel>;
  readonly habits: Habits;
  /** Habits read so far (each told once), and the last one read (the HUD tells it). */
  readonly reads = new Set<string>();
  lastRead: Read | null = null;
  private think = 0.8;
  /** Answers scheduled after its reaction time, each to something it saw (`why`): dropped if that is gone when it is due. */
  private pending: { at: number; i: Partial<Intent>; hold?: number; why: 'reach' | 'strike' | 'move' | 'throw' }[] = [];
  private phaseWas = '';
  private seen = new Set<string>();
  private weight: Vec = { f: 0, s: 0 };
  private weightFor = 0;
  private t = 0;
  private lastOwn: ClinchMove | null = null;
  private orbit = 1;

  constructor(readonly style: Style6 | 'partenaire', level: number, readonly who: string, private stand: StandStyle = STAND_STYLES[style], private clinch: ClinchStyle = CLINCH_STYLES[style], habits?: Habits) {
    this.lvl = aiLevel(level);
    this.habits = habits ?? emptyHabits();
  }
  get signature() { return SIGNATURE[this.style]; }

  /** Habits the player shows (the duel tells it when it sees them happen). */
  saw(kind: 'throw' | 'open' | 'reach' | 'answer', key: string) {
    const t = kind === 'throw' ? this.habits.throws : kind === 'open' ? this.habits.opens : kind === 'reach' ? this.habits.reaches : this.habits.answers;
    (t as Record<string, number>)[key] = ((t as Record<string, number>)[key] ?? 0) + 1;
  }
  /** Has it read this habit (the duel counts a try as it starts: the third time, it knows)? */
  knows(kind: 'throw' | 'reach', key: string): boolean {
    const n = (kind === 'throw' ? this.habits.throws : this.habits.reaches)[key as never] ?? 0;
    return n >= 3;
  }
  private tell(r: Read) { const key = `${r.what}:${r.key}`; if (!this.reads.has(key)) { this.reads.add(key); this.lastRead = r; } }

  /** Held still (a check, the lesson's script): what it was answering and leaning for is dropped. */
  rest() { this.pending.length = 0; this.seen.clear(); this.weight = { f: 0, s: 0 }; this.weightFor = 0; this.phaseWas = ''; }
  /** One step: what it does now. */
  step(dt: number, v: AiView, rand: () => number): Intent {
    this.t += dt;
    const out = idle(), lvl = this.lvl;
    // what it sees coming, answered after its reaction time
    if (v.phase !== this.phaseWas) { this.phaseWas = v.phase; this.pending.length = 0; this.seen.clear(); }   // a new phase: what it was answering is gone
    if (v.phase === 'fight') this.seeStanding(v, rand); else this.seeClinch(v, rand);
    // the weight it holds (a brace, or leaning for its own move): kept for a while, else neutral
    this.weightFor = Math.max(0, this.weightFor - dt);
    if (this.weightFor <= 0) this.weight = { f: 0, s: 0 };
    for (let j = this.pending.length - 1; j >= 0; j--) {
      const p = this.pending[j]; if (p.at > this.t) continue;
      this.pending.splice(j, 1);
      const still = p.why === 'reach' ? !!v.him.reach : p.why === 'strike' ? !!v.him.strike : p.why === 'throw' ? !!v.him.throwing : !!v.him.move;
      if (!still) continue;                                                  // too late: what it answered has landed
      Object.assign(out, p.i);
      if (p.i.stick && p.hold) { this.weight = { ...p.i.stick }; this.weightFor = p.hold; }
    }
    // its own initiative, at its pace
    this.think -= dt;
    if (this.think <= 0 && v.me.free) {
      this.think = lvl.pace * (0.6 + 0.8 * rand()) * (v.phase === 'clinch' ? 0.7 : 1) / (1 + 0.6 * v.urge);
      if (v.phase === 'fight') this.ownStanding(v, rand, out); else this.ownClinch(v, rand, out);
    }
    if (len(out.stick) < 0.01) out.stick = v.phase === 'fight' ? this.footwork(v, rand) : { ...this.weight };
    return out;
  }

  /** Standing: keeps its range (closer when pressed), circling a little. */
  private footwork(v: AiView, rand: () => number): Vec {
    const range = rangeOf(this.stand, v.urge), d = v.dist;
    const f = d > range + 0.15 ? 1 : d < range - 0.35 ? -0.6 : 0;
    if (rand() < 0.01) this.orbit = -this.orbit;
    return { f, s: Math.abs(f) < 0.5 ? 0.35 * this.orbit : 0 };
  }
  private seeStanding(v: AiView, rand: () => number) {
    const h = v.him, lvl = this.lvl;
    // his reach for a hold, seen coming: step back (or parry a reach for the nape); a reach he keeps using is known
    if (h.reach) {
      if (!this.seen.has('reach')) {
        this.seen.add('reach');
        const known = this.knows('reach', h.reach.kind);
        if (known) this.tell({ what: 'reach', key: h.reach.kind });
        const p = clamp(lvl.brace * 1.3 + (known ? 0.35 * lvl.learn : 0), 0, 0.95);
        if (rand() < p) this.pending.push({ at: this.t + lvl.react * (known ? 0.5 : 0.8 + 0.3 * rand()), i: h.reach.kind === 'nuque' && rand() < 0.5 ? { guard: true } : { back: true }, why: 'reach' });
      }
    } else this.seen.delete('reach');
    // avec frappe, his strike being armed: guard, step back, or a quick strike first (a big one only), by style
    if (h.strike) {
      if (!this.seen.has('strike')) {
        this.seen.add('strike');
        const r = this.stand.react, sharp = 0.55 + 0.6 * lvl.learn, x = rand();
        const at = this.t + lvl.react * (h.strike.kind === 'big' ? 0.7 : 0.45);
        if (x < r.guard * sharp) this.pending.push({ at, i: { guard: true }, hold: 0.45, why: 'strike' });
        else if (x < (r.guard + r.back) * sharp) this.pending.push({ at, i: { back: true }, why: 'strike' });
        else if (h.strike.kind === 'big' && x < (r.guard + r.back + r.counter) * sharp) this.pending.push({ at, i: { strike: 'quick' }, why: 'strike' });
      }
    } else this.seen.delete('strike');
  }
  private ownStanding(v: AiView, rand: () => number, out: Intent) {
    const h = v.him, f = this.lvl, st = this.stand;
    if (v.me.open > 0 || v.me.stagger > 0) return;
    const shaken = h.stagger > 0 || h.open > 0;
    const pressed = clamp(v.urge + (v.idle > 6 ? 0.5 : 0), 0, 1);
    const near = v.dist <= GRIPS.ceinture.range + 0.25 + 0.4 * pressed;
    // the leg is there: he leans in — a young wrestler sees it less often
    if (near && v.dist <= GRIPS.jambe.range && legOpen(h) && rand() < 0.35 + 0.4 * f.read) { out.reach = 'tap'; return; }
    // a man shaken or turtled behind his guard: take hold (the belt under a raised guard)
    if (near && (shaken || h.guard) && v.me.stamina > 30 && rand() < Math.min(0.9, 0.55 * (0.6 + f.learn))) { out.reach = h.guard ? 'hold' : this.signature.reach; return; }
    if (near && v.me.stamina > 28 - 10 * pressed && rand() < Math.min(0.85, (0.25 + st.grab) * (0.7 + 0.5 * f.learn) * (1 + 2.5 * pressed))) {
      // its signature's reach, or the other one now and then; a reach he keeps answering is changed
      let r = rand() < 0.75 ? this.signature.reach : this.signature.reach === 'tap' ? 'hold' : 'tap';
      if (h.guard) r = 'hold';
      out.reach = r; return;
    }
    if (v.frappe && v.dist <= 1.85) {
      const pBig = st.big * (0.6 + f.learn * 0.6) * (shaken ? 2 : h.balance < 50 ? 1.5 : 1);
      if (v.me.stamina > 24 && rand() < Math.min(0.8, pBig)) { out.strike = 'big'; return; }
      if (v.me.stamina > 12 && rand() < Math.min(0.8, st.quick * (0.6 + f.learn * 0.6))) { out.strike = 'quick'; return; }
      if (rand() < st.guard * 0.8) out.guard = true;
    }
  }

  private seeClinch(v: AiView, rand: () => number) {
    const h = v.him, lvl = this.lvl;
    // his move, set up on his body: answered with the move that beats it (a pull is a lean back: the stick away…)
    if (h.move) {
      const p = clamp((lvl.read * this.clinch.read) / 0.4 * (0.6 + 0.4 * v.me.balance / 100), 0, 0.92);
      if (!this.seen.has(`mv:${h.move.kind}`)) {
        this.seen.add(`mv:${h.move.kind}`);
        if (rand() < p) this.pending.push({ at: this.t + lvl.react * (0.75 + 0.3 * rand()), i: { stick: moveStick(answer(h.move.kind)) }, hold: 0.3, why: 'move' });
      }
    } else for (const s of [...this.seen]) if (s.startsWith('mv:')) this.seen.delete(s);
    // his throw, set up on his body: brace against its way (or turn it); a throw he has tried twice is known at once
    if (h.throwing) {
      const id = h.throwing.id, key = `th:${id}`;
      if (!this.seen.has(key)) {
        this.seen.add(key);
        const known = this.knows('throw', id);
        if (known) this.tell({ what: 'throw', key: id });
        const pb = clamp(lvl.brace + (known ? 0.4 * lvl.learn : 0), 0, 0.95), pc = lvl.counter + (known ? 0.15 * lvl.learn : 0);
        const x = rand();
        const brace = against(id, h);
        if (x < pc && v.me.balance > 45 && v.me.stamina > 12) this.pending.push({ at: this.t + lvl.react * (known ? 0.5 : 0.9), i: { counter: true, stick: brace }, hold: 0.6, why: 'throw' });
        else if (x < pc + pb) this.pending.push({ at: this.t + lvl.react * (known ? 0.45 : 0.85 + 0.3 * rand()), i: { stick: brace }, hold: 0.7, why: 'throw' });
        else if (x < pc + pb + 0.15) this.pending.push({ at: this.t + lvl.react, i: { stick: { f: -brace.f, s: -brace.s } }, hold: 0.5, why: 'throw' });   // read wrong: leans into it
      }
    } else for (const s of [...this.seen]) if (s.startsWith('th:')) this.seen.delete(s);
  }
  private ownClinch(v: AiView, rand: () => number, out: Intent) {
    const lvl = this.lvl, me = v.me, st = this.clinch;
    if (me.throwing || me.moving || v.him.throwing) return;                // (his throw under way: it braces or counters, nothing else)
    // out of breath: break free to breathe (when its hold allows it), else hold still — a wrestler keeps his breath
    if (me.stamina < 22) { if (v.grip > -30 && me.stamina >= 20 && rand() < 0.5 + 0.4 * lvl.learn) out.brk = true; return; }
    // the throw, when what it sees of him allows it (a young wrestler goes too early); pressed by the referee, sooner
    if (v.best && me.stamina >= THROWS[v.best.id].cost + 4 && v.best.score >= COMBAT.throwAt + lvl.margin - 14 * v.urge
      && rand() < Math.min(0.9, (0.5 + st.throwChance) * (1 + v.urge))) { out.throw = true; return; }
    // a hold clearly lost and slipping: break free
    if (v.grip < -40 && me.stamina > 30 && me.balance < 60 && rand() < st.breakFree * (0.8 + lvl.learn * 0.5)) { out.brk = true; return; }
    // go deeper when its signature needs it
    const sig = this.signature.throw, needs = THROWS[sig].grips;
    if (me.hold.kind && !needs.includes(me.hold.kind) && GRIPS[me.hold.kind].deeper && me.hold.str >= COMBAT.deeperNeeds + 5 && me.stamina > 30 && rand() < 0.45) { out.deeper = true; return; }
    // a move: what beats the move he starts with most (a habit read), else what sets its throw up, else its style
    const opener = top(this.habits.opens);
    let m: ClinchMove;
    if (opener && opener.share >= 0.5 && rand() < lvl.learn * 0.7) { m = answer(opener.key); this.tell({ what: 'open', key: opener.key }); }
    else if (rand() < 0.55) m = setupMove(v.best && v.best.score > COMBAT.throwAt - 25 ? v.best.id : sig);
    else { const x = rand() * (st.prefer.push + st.prefer.pull + st.prefer.pivot); m = x < st.prefer.push ? 'push' : x < st.prefer.push + st.prefer.pull ? 'pull' : 'pivot'; }
    // pushed to the edge of the circle: turn, do not push itself out
    if (v.edgeMe < 1 && m === 'pull') m = 'pivot';
    this.lastOwn = m;
    out.stick = moveStick(m, rand() < 0.5 ? 1 : -1);
    this.weight = { ...out.stick }; this.weightFor = 0.35;
  }
  /** The last move it started on its own (the duel records how the player answered it). */
  get own() { return this.lastOwn; }
}

/** The stick for a move: towards him (push), away (pull), to a side (pivot). */
export function moveStick(m: ClinchMove, side = 1): Vec {
  return m === 'push' ? { f: 1, s: 0 } : m === 'pull' ? { f: -1, s: 0 } : { f: 0.2, s: side };
}
/** The stick that braces against throw `id` (its way reversed), seen on the body of the man it threatens. */
export function against(id: ThrowId, def: { dir: Vec }): Vec {
  const t = throwVec(id, { dir: def.dir });
  return { f: -t.f / (Math.hypot(t.f, t.s) || 1), s: -t.s / (Math.hypot(t.f, t.s) || 1) };
}
/** For the tests: the brace quality the AI's chosen stick gives against `id`. */
export const braceOf = (id: ThrowId, stick: Vec, def: { dir: Vec; stamina: number }) => braceAgainst(id, { weight: stick, stamina: def.stamina, dir: def.dir });
