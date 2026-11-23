/**
 * Headless players of the new bout (tests/combatDuel.test.ts, tests/combatBalance.test.ts; docs/wrestling/COMBAT.md
 * « Équilibrage »): the real LambDuel with `combat: true`, built as src/main.ts startDuel builds the player's bout, played
 * through the inputs a thumb has (the stick in his own frame, Saisir tapped or held, Garde, Reculer / Casser, Projeter /
 * Contrer, the blue button to go deeper, Frappe avec frappe). A player is a reaction time, an accuracy and habits; he sees
 * only what the screen and the bodies show (the duel's info()). Not a test file.
 */
import { LambDuel } from '../src/lamb/duel';
import { STYLES, type BoutMode, type Discipline } from '../src/lamb/rules';
import { STYLE_MAP, rosterAttributes } from '../src/lamb/opponents';
import { fighterAttributes } from '../src/career/career';
import { rng } from '../src/core/rng';
import { THROWS, type ThrowId } from '../src/lamb/combat';
import { setupMove } from '../src/lamb/combatAi';
import type { Style6 } from '../src/lamb/stand';
import type { Input } from '../src/core/input';

export interface CSkill {
  /** Seconds from seeing something to answering it [min, max]. */
  reaction: [number, number];
  /** Seconds between two initiatives of his own. */
  pace: number;
  /** Share of his moves answered with the move that beats them; share of his throws braced the right way; share countered instead. */
  read: number; brace: number; counter: number;
  /** Share of his reaches seen and stepped away from (or parried). */
  defend: number;
  /** Share of his choices made with sense (throw when the button lights, set the throw up, take the leg, break in time). */
  sense: number;
  /** Random presses a second (mashing). */
  mash: number;
}
export const C_NOVICE: CSkill = { reaction: [0.45, 0.8], pace: 0.8, read: 0.45, brace: 0.4, counter: 0.05, defend: 0.35, sense: 0.45, mash: 0.3 };
export const C_DECENT: CSkill = { reaction: [0.3, 0.5], pace: 0.75, read: 0.65, brace: 0.6, counter: 0.08, defend: 0.55, sense: 0.7, mash: 0.05 };
export const C_EXPERT: CSkill = { reaction: [0.18, 0.3], pace: 0.6, read: 0.85, brace: 0.85, counter: 0.12, defend: 0.8, sense: 0.92, mash: 0 };

/** A scripted way to play: a person (`skill`), or an exploit tried against the rules. */
export type Script = 'player' | 'turtle' | 'masher' | 'spammer' | 'idle' | 'habit';

/** A fresh save after the lesson (src/career/career.ts fighterAttributes). */
export const FRESH = fighterAttributes({ lamb_skill: 1 });

export interface CLog { winner: 'player' | 'opponent' | null; outcome: string; seconds: number; fall: string | null; throwName: string | null; stats: Record<string, number>; reads: string[] }
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
const BEATS = { push: 'pull', pull: 'pivot', pivot: 'push' } as const;
const MOVES = ['push', 'pull', 'pivot'] as const;

/** The player's bout as main.ts makes it (combat on), against a wrestler of `style` at `level`. */
export function combatDuel(style: Style6, level: number, discipline: Discipline, seed: number, mode: BoutMode = 'amical', name?: string) {
  const steer = { x: 0, y: 0 };
  const input = { enabled: true, move: () => ({ ...steer }), takeAction: () => false } as unknown as Input;
  const m = STYLE_MAP[style], base = STYLES[m.base];
  return new LambDuel({
    origin: { x: 0, z: 0 }, look: { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] }, input, crowdSize: 0, mode,
    style: { ...base, name: name ?? base.name }, level, ring: 7.6, discipline, attrs: FRESH,
    opponent: { attrs: rosterAttributes({ style, level }), stand: m.stand, clinch: m.clinch, line: `${name ?? base.name}, ${m.word}` }, seed, combat: true,
  });
}

/** One bout played by `script` (a person of `skill`); `habit`: a person who always tries the same throw. */
export function playCombat(o: { style: Style6; level: number; discipline: Discipline; seed: number; skill?: CSkill; script?: Script; mode?: BoutMode; name?: string; trace?: string[]; duel?: LambDuel }): CLog {
  const skill = o.skill ?? C_DECENT, script = o.script ?? 'player';
  const duel = o.duel ?? combatDuel(o.style, o.level, o.discipline, o.seed, o.mode, o.name);
  const r = rng((o.seed * 7919 + 17) >>> 0 || 1), between = (a: number, b: number) => a + r() * (b - a);
  const DT = 1 / 60;
  let t = 0, next = 0.6, guardUntil = 0, stick = { f: 0, s: 0 }, stickUntil = 0;
  const todo: { at: number; act: () => void }[] = [];
  const seen = new Set<string>();
  const later = (key: string, act: () => void, quick = 1) => { if (seen.has(key)) return; seen.add(key); todo.push({ at: t + between(...skill.reaction) * quick, act }); };
  const hold = (f: number, s: number, secs: number) => { stick = { f, s }; stickUntil = t + secs; };
  const stats: Record<string, number> = {};
  const tally = (k: string) => { stats[k] = (stats[k] ?? 0) + 1; };
  let lastTh = '', lastPh = '', nMove = 0, nThrow = 0, nReach = 0;
  const sense = () => r() < skill.sense;
  for (let k = 0; k < 60 * 130 && duel.phase !== 'result'; k++, t += DT) {
    const i = duel.info() as unknown as Info, c = i.combat ?? {}, me = c.player ?? {}, him = c.opponent ?? {};
    const th = JSON.stringify(i.lastThrow ?? null);
    if (th !== lastTh && i.lastThrow) tally(`th:${i.lastThrow.by}:${i.lastThrow.throw}:${i.lastThrow.result}`); lastTh = th;
    if (i.phase !== lastPh && i.phase === 'clinch') tally(`clinch:${i.clinch?.by}:${(i.clinch?.by === 'player' ? me : him).hold?.kind}`); lastPh = i.phase;
    if (o.trace) o.trace.push(`${t.toFixed(2)} ${i.phase} d${i.dist} bal ${i.balance?.player}/${i.balance?.opponent} st ${i.stamina.player}/${i.stamina.opponent} prise ${c.prise} best ${c.best?.id}:${c.best?.score} att ${JSON.stringify(c.attempt)} th ${th}`);
    if (t >= stickUntil) stick = { f: 0, s: 0 };
    duel.setGuard(t < guardUntil);
    for (let j = todo.length - 1; j >= 0; j--) if (todo[j].at <= t) { const a = todo[j]; todo.splice(j, 1); a.act(); }
    if (script === 'idle') { duel.update(DT); continue; }
    if (script === 'turtle') { duel.setGuard(true); duel.update(DT); continue; }
    if (script === 'masher') {
      if (r() < 6 * DT) { const x = r(); if (x < 0.3) duel.pressGrab(); else if (x < 0.45) duel.pressReach('hold'); else if (x < 0.6) duel.pressBreak(); else if (x < 0.7) duel.pressDeeper(); else if (o.discipline === 'avec_frappe' && x < 0.85) duel.pressStrike(r() < 0.5 ? 'quick' : 'big'); else guardUntil = t + 0.3; }
      if (r() < 3 * DT) hold(r() * 2 - 1, r() * 2 - 1, 0.3);
      duel.debugStick(stick.f, stick.s, 0.1); duel.update(DT); continue;
    }
    if (script === 'spammer') {
      if (i.phase === 'fight') { if (i.dist > 1.3) hold(1, 0, 0.1); if (t >= next && i.dist <= 1.5) { duel.pressReach('tap'); next = t + 0.5; } }
      else if (i.phase === 'clinch' && t >= next) { duel.pressGrab(); next = t + 0.35; }
      duel.debugStick(stick.f, stick.s, 0.1); duel.update(DT); continue;
    }
    // a person (script 'player'), or one who always goes for the same throw ('habit')
    if (r() < skill.mash * DT) { const x = r(); if (x < 0.4) duel.pressGrab(); else if (x < 0.7) duel.pressBreak(); else hold(r() * 2 - 1, r() * 2 - 1, 0.3); }
    if (i.phase === 'fight') {
      // his reach for a hold, seen coming: step back (or a fresh guard against a reach for the nape)
      if (him.reach) later(`r${nReach}`, () => { if (r() < skill.defend) { if (him.reach?.kind === 'nuque' && r() < 0.4) guardUntil = t + 0.45; else duel.pressBreak(); } });
      else nReach++;
      if (o.discipline === 'avec_frappe' && i.strike?.opponent === 'big') later(`s${nReach}`, () => { if (r() < skill.defend) { if (r() < 0.5) duel.pressBreak(); else guardUntil = t + 0.6; } });
      // the distance, then his own game
      const far = i.dist > 1.4;
      if (far) hold(1, 0, 0.1); else if (i.dist < 0.95) hold(-0.7, 0, 0.1); else if (stickUntil <= t) hold(0, Math.sin(t) > 0 ? 0.3 : -0.3, 0.2);
      if (t >= next) {
        next = t + skill.pace * between(0.7, 1.3);
        const tired = i.stamina.player < 30 && sense();
        if (!far && !tired) {
          const legOpen = (him.lean?.f ?? 0) > 0.1 || (him.weight?.f ?? 0) > 0.55;
          if (i.open === 'opponent' || i.stagger === 'opponent') duel.pressReach('tap');
          else if (legOpen && sense()) duel.pressReach('tap');
          else if (i.guard?.opponent && sense()) duel.pressReach('hold');
          else if (o.discipline === 'avec_frappe' && r() < 0.35) duel.pressStrike(r() < 0.75 ? 'quick' : 'big');
          else duel.pressReach(r() < 0.6 ? 'tap' : 'hold');
        }
      }
    } else if (i.phase === 'clinch') {
      const att = c.attempt;
      // his move, seen on his body: answer it with the move that beats it (or guess)
      const mv = i.clinch?.move?.opponent as keyof typeof BEATS | null;
      if (mv && !i.clinch?.move?.player) later(`m${nMove}`, () => { const m = r() < skill.read ? BEATS[mv] : MOVES[Math.floor(r() * 3)]; hold(m === 'push' ? 1 : m === 'pull' ? -1 : 0.2, m === 'pivot' ? (r() < 0.5 ? 1 : -1) : 0, 0.35); });
      else if (!mv) nMove++;
      // his throw, seen on his body: brace against its way (or turn it)
      if (att && att.by === 'opponent') later(`t${nThrow}`, () => {
        const x = r(), id = att.id as ThrowId, d = THROWS[id].dir;
        if (x < skill.counter && (i.balance?.player ?? 0) > 50) duel.pressGrab();
        else if (x < skill.counter + skill.brace) hold(d === 'arriere' ? 1 : d === 'cote' ? 0 : -1, d === 'cote' ? -Math.sign(me.lean?.s || 1) : 0, 0.6);
      });
      else if (!att) nThrow++;
      // slipping under a hold he can still break: break free
      if ((i.clinch?.posture?.player ?? 'stable') !== 'stable' && (c.prise ?? 0) > -35 && (c.prise ?? 0) < -18) later(`b${nMove}`, () => { if (sense()) duel.pressBreak(); });
      if (!att && t >= next) {
        next = t + skill.pace * between(0.5, 1.0);
        const best = c.best;
        // out of breath: break free to breathe standing, or hold still (a good player keeps his breath)
        if (i.stamina.player < 28 && sense()) { if ((c.prise ?? 0) > -30 && i.stamina.player >= 20) duel.pressBreak(); }
        else if (best?.ready && sense()) later(`p${nThrow}:${Math.floor(t)}`, () => duel.pressGrab(), 0.5);
        else if (script === 'habit') {
          if (best && t > 0.5) duel.pressGrab();
        }
        else if (!sense()) { if (r() < 0.25) duel.pressGrab(); else { const m = MOVES[Math.floor(r() * 3)]; hold(m === 'push' ? 1 : m === 'pull' ? -1 : 0.2, m === 'pivot' ? 1 : 0, 0.3); } }
        else if (me.hold?.kind === 'nuque' && (me.hold?.str ?? 0) > 45 && r() < 0.35) duel.pressDeeper();
        else if (best) {
          // set the throw up: the move that drives his weight its way (now and then another, not to be read)
          const m = r() < 0.75 ? setupMove(best.id) : MOVES[Math.floor(r() * 3)];
          hold(m === 'push' ? 1 : m === 'pull' ? -1 : 0.2, m === 'pivot' ? (r() < 0.5 ? 1 : -1) : 0, 0.3);
        }
      }
    }
    duel.debugStick(stick.f, stick.s, 0.1);
    duel.update(DT);
  }
  const res = duel.result, i = duel.info() as unknown as Info;
  return { winner: res?.winner ?? null, outcome: res?.outcome ?? 'none', seconds: res?.seconds ?? t, fall: duel.fallKind, throwName: duel.throwName, stats, reads: i.combat?.ai?.reads ?? [] };
}

/** Win and loss rates, the median length, falls and draws over `n` seeded bouts. */
export function combatSeries(o: { style: Style6; level: number; discipline: Discipline; skill?: CSkill; script?: Script; mode?: BoutMode; n: number; seed0?: number }) {
  const logs: CLog[] = [];
  for (let s = 0; s < o.n; s++) logs.push(playCombat({ ...o, seed: (o.seed0 ?? 1) + s * 101 }));
  const secs = logs.map(l => l.seconds).sort((a, b) => a - b);
  return {
    win: logs.filter(l => l.winner === 'player').length / o.n,
    loss: logs.filter(l => l.winner === 'opponent').length / o.n,
    draw: logs.filter(l => l.winner === null).length / o.n,
    median: secs[Math.floor(o.n / 2)], p10: secs[Math.floor(o.n * 0.1)], p90: secs[Math.floor(o.n * 0.9)],
    falls: logs.filter(l => l.outcome === 'projection').length / o.n,
    throws: logs.reduce((a, l) => { if (l.throwName) a[l.throwName] = (a[l.throwName] ?? 0) + 1; return a; }, {} as Record<string, number>),
    stats: logs.reduce((a, l) => { for (const [k, v] of Object.entries(l.stats)) a[k] = (a[k] ?? 0) + v; return a; }, {} as Record<string, number>),
    logs,
  };
}
