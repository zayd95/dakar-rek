/**
 * Headless players for Làmb 2.0's balance pass (tests/lamb2Balance.test.ts, docs/LAMB2.md « Équilibrage »): a fresh
 * save after Coach Ablaye's lesson fights a roster wrestler as himself, exactly as main.ts startDuel builds the bout,
 * through the inputs a person uses (steer, Frappe, Grosse frappe, Saisir, Garde, Reculer / Pousser, Tirer, Pivoter,
 * Casser, Projeter / Contrer). A player is a reaction time, an accuracy and habits; he only sees what the screen shows
 * (the duel's info()). Not a test file: imported by the tests.
 */
import { LambDuel } from '../src/lamb/duel';
import { STYLES, type BoutMode } from '../src/lamb/rules';
import { rosterOpponent } from '../src/lamb/opponents';
import { fighterAttributes } from '../src/career/career';
import { rng } from '../src/core/rng';
import type { Input } from '../src/core/input';

export interface Skill {
  /** Seconds from seeing something to answering it [min, max]. */
  reaction: [number, number];
  /** Seconds between two initiatives of his own (a strike, a grab, a move in the empoignade). */
  pace: number;
  /** Share of the opponent's moves (empoignade) answered with the move that beats them; the rest is a guess. */
  read: number;
  /** Share of the opponent's strikes and grabs he answers at all (guard, step back, strike first). */
  defend: number;
  /** Share of his choices made with sense: grab a staggered or guarding man, the big strike on an open one, the throw
   *  on a slipping one, breaking free in time, keeping his breath; the rest at random. */
  sense: number;
  /** Share of the opponent's throws he tries to counter. */
  counter: number;
  /** Random presses a second (mashing). */
  mash: number;
}
export const NOVICE: Skill = { reaction: [0.45, 0.8], pace: 0.7, read: 0.5, defend: 0.45, sense: 0.45, counter: 0.35, mash: 0.3 };
export const DECENT: Skill = { reaction: [0.3, 0.5], pace: 0.9, read: 0.7, defend: 0.65, sense: 0.65, counter: 0.6, mash: 0.1 };
export const EXPERT: Skill = { reaction: [0.18, 0.3], pace: 1.0, read: 0.9, defend: 0.85, sense: 0.9, counter: 0.85, mash: 0 };

const BEATS = { push: 'pull', pull: 'pivot', pivot: 'push' } as const;
type Move = keyof typeof BEATS;
const MOVES: Move[] = ['push', 'pull', 'pivot'];
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any

/** A fresh save after the lesson: the training's lamb_skill +1, nothing else (src/career/career.ts fighterAttributes). */
export const FRESH = fighterAttributes({ lamb_skill: 1 });

export interface BoutLog { winner: 'player' | 'opponent' | null; outcome: string; seconds: number; stats: Record<string, number> }

/** One bout, as main.ts startDuel makes it avec frappe, played by a headless player of `skill`. */
export function playBout(name: string, skill: Skill, seed: number, mode: BoutMode = 'amical', day = 40, trace?: string[]): BoutLog {
  const who = rosterOpponent(name, day)!;
  const steer = { x: 0, y: 0 };
  const input = { enabled: true, move: () => ({ ...steer }), takeAction: () => false } as unknown as Input;
  const duel = new LambDuel({
    origin: { x: 0, z: 0 }, look: { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] }, input, crowdSize: 0, mode,
    style: { ...STYLES[who.wrestler.style], name: who.wrestler.name }, level: who.level, ring: 7.6, discipline: 'avec_frappe',
    attrs: FRESH, opponent: { attrs: who.attrs, stand: who.stand, clinch: who.clinch, line: who.line }, seed,
  });
  const r = rng((seed * 7919 + 17) >>> 0 || 1), between = (a: number, b: number) => a + r() * (b - a);
  const DT = 1 / 60;
  let t = 0, next = 1, guardUntil = 0;
  // what he has seen and will answer, when (each thing seen once)
  const todo: { at: number; act: () => void }[] = [];
  const seen = new Set<string>();
  const later = (key: string, act: () => void) => { if (seen.has(key)) return; seen.add(key); todo.push({ at: t + between(...skill.reaction), act }); };
  const walk = (dir: number) => {
    const p = duel.fighterPoints(), me = { x: p[1][0], z: p[1][2] }, ai = { x: p[4][0], z: p[4][2] };
    const dx = ai.x - me.x, dz = ai.z - me.z, len = Math.hypot(dx, dz) || 1, ax = duel.axes();
    steer.x = (dx / len) * dir * ax.right.x + (dz / len) * dir * ax.right.z; steer.y = (dx / len) * dir * ax.fwd.x + (dz / len) * dir * ax.fwd.z;
  };
  const stats: Record<string, number> = {};
  const tally = (k: string) => { stats[k] = (stats[k] ?? 0) + 1; };
  let nStrike = 0, nGrab = 0, nMove = 0, nThrow = 0, lastEx = '', lastTh = '', lastPh = '', lastKey = '';
  for (let k = 0; k < 60 * 120 && duel.phase !== 'result'; k++, t += DT) {
    const i = duel.info() as unknown as Info, c = i.clinch ?? {};
    {
      const ex = JSON.stringify(c.last ?? null), th = JSON.stringify(i.lastThrow ?? null);
      if (ex !== lastEx && c.last) tally(`ex:${c.last.winner ?? 'none'}:${c.last.result}`); lastEx = ex;
      if (th !== lastTh && i.lastThrow) tally(`th:${i.lastThrow.by}:${i.lastThrow.result}`); lastTh = th;
      if (i.phase !== lastPh && i.phase === 'clinch') tally(`grab:${c.by}:${c.entry}`); lastPh = i.phase;
      if (trace) {
        const key = `${i.phase}|${JSON.stringify(i.lastStrike)}|${ex}|${th}|${i.stagger}`;
        if (key !== lastKey) { lastKey = key; trace.push(`${t.toFixed(2)} ${i.phase} d${i.dist} bal ${i.balance?.player}/${i.balance?.opponent} st ${i.stamina.player}/${i.stamina.opponent} grip ${c.grip ?? '-'} last ${JSON.stringify(i.lastStrike)} ex ${ex} th ${th} stg ${i.stagger}`); }
      }
    }
    steer.x = 0; steer.y = 0;
    duel.setGuard(t < guardUntil);
    for (let j = todo.length - 1; j >= 0; j--) if (todo[j].at <= t) { const a = todo[j]; todo.splice(j, 1); a.act(); }
    if (skill.mash > 0 && r() < skill.mash * DT) {
      const x = r();
      if (x < 0.4) duel.pressStrike('quick'); else if (x < 0.6) duel.pressStrike('big'); else if (x < 0.85) duel.pressGrab(); else duel.pressBreak();
    }
    const sense = () => r() < skill.sense, breath = i.stamina.player;
    if (i.phase === 'fight') {
      // what he sees coming — a strike being armed, a grab — he answers it (or not), after his reaction time
      if (i.strike?.opponent) later(`s${nStrike}`, () => { if (r() < skill.defend) { if (i.strike.opponent === 'big' && r() < 0.5) duel.pressBreak(); else guardUntil = t + 0.6; } });
      else nStrike++;
      if (i.windup) later(`g${nGrab}`, () => { if (r() < skill.defend) { if (r() < 0.5) duel.pressBreak(); else duel.pressStrike('quick'); } });
      else nGrab++;
      // an opening: he takes it (a grab on a staggered or open man), if he sees it in time
      if (i.stagger === 'opponent' || i.open === 'opponent') later(`o${nStrike}:${nGrab}:${i.stagger}:${i.open}`, () => { if (sense()) duel.pressGrab(); else duel.pressStrike('big'); });
      // his own game: the distance, then a strike or a grab now and then
      const far = i.dist > 1.55;
      if (far) walk(1); else if (i.dist < 1.05) walk(-1);
      if (t >= next) {
        next = t + skill.pace * between(0.7, 1.3);
        const tired = breath < 35 && sense();
        if (!far && !tired) {
          if (i.guard?.opponent) { if (sense()) duel.pressGrab(); else duel.pressStrike(r() < 0.5 ? 'quick' : 'big'); }
          else if ((i.balance?.opponent ?? 100) < 45 && sense()) duel.pressStrike('big');
          else { const x = r(); if (x < 0.65) duel.pressStrike('quick'); else if (x < 0.82) duel.pressStrike('big'); else duel.pressGrab(); }
        }
      }
    } else if (i.phase === 'clinch') {
      // his move: read it and answer (or guess)
      if (c.move?.opponent && !c.move?.player) later(`m${nMove}`, () => duel.pressMove(r() < skill.read ? BEATS[c.move.opponent as Move] : MOVES[Math.floor(r() * 3)]));
      else if (!c.move?.opponent) nMove++;
      // his throw: counter it (the button turns green)
      if (c.attempt?.by === 'opponent') later(`t${nThrow}`, () => { if (r() < skill.counter) duel.pressStrike('big'); });
      else if (!c.attempt) nThrow++;
      // slipping with a grip he can still break: break free
      if (c.posture?.player !== 'stable' && (c.grip ?? 0) > -35 && (c.grip ?? 0) < -20) later(`b${nMove}`, () => { if (sense()) duel.pressBreak(); });
      if (t >= next) {
        next = t + skill.pace * between(0.7, 1.3);
        const slipping = c.posture?.opponent !== 'stable' && (c.grip ?? 0) >= 0;
        if (slipping && sense()) duel.pressStrike('big');
        else if (!sense()) { if (r() < 0.3) duel.pressStrike('big'); else if (!c.move?.player) duel.pressMove(MOVES[Math.floor(r() * 3)]); }
        else if (!c.move?.player && breath > 30 && r() < 0.3) duel.pressMove(MOVES[Math.floor(r() * 3)]);
      }
    }
    duel.update(DT);
  }
  const res = duel.result;
  return { winner: res?.winner ?? null, outcome: res?.outcome ?? 'none', seconds: res?.seconds ?? t, stats };
}

/** Win and loss rates, the median length and the share of falls over `n` seeded bouts (five city days). */
export function series(name: string, skill: Skill, n: number, mode: BoutMode = 'amical', seed0 = 1) {
  const logs: BoutLog[] = [];
  for (let s = 0; s < n; s++) logs.push(playBout(name, skill, seed0 + s * 101, mode, 40 + (s % 5)));
  const secs = logs.map(l => l.seconds).sort((a, b) => a - b);
  return {
    win: logs.filter(l => l.winner === 'player').length / n,
    loss: logs.filter(l => l.winner === 'opponent').length / n,
    median: secs[Math.floor(n / 2)],
    falls: logs.filter(l => l.outcome === 'projection').length / n,
    stats: logs.reduce((a, l) => { for (const [k, v] of Object.entries(l.stats)) a[k] = (a[k] ?? 0) + v; return a; }, {} as Record<string, number>),
  };
}
