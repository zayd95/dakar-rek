import { describe, expect, it } from 'vitest';
import {
  DRILLS, DRILL_IDS, drillFeedback, drillOfAction, drillScore, drillTick, drillVerdict, hearDrill, startDrill, type DrillId, type DrillRun,
} from '../src/lamb/drills';
import { LambDuel } from '../src/lamb/duel';
import { PARTNER } from '../src/lamb/rules';
import { fighterAttributes } from '../src/career/career';
import type { Input } from '../src/core/input';

/**
 * The écurie drills, played (Làmb 2.0, ?lamb2): Sac de frappe, Travail des saisies, Gainage. A fixed sequence of calls,
 * a score from what the player did (right answers − faults), and the gain left to the career's rules (the drill's
 * counter, once, when finished).
 */
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
const DT = 1 / 60;
const ANSWER = { push: 'pull', pull: 'pivot', pivot: 'push' } as const;

/** Runs a drill's clock alone until it opens a call (or `max` seconds); returns what opened. */
function untilCall(d: DrillRun, max = 5) {
  for (let t = 0; t < max; t += DT) { const o = drillTick(d, DT); if (o.opened) return o.opened; }
  return null;
}

describe('làmb 2.0 · the écurie drills: the career’s three, each a data entry', () => {
  it('each plays the career’s drill action and counts its counter, which feeds the fighter attributes', () => {
    expect(drillOfAction('drill_frappe')).toBe('frappe');
    expect(drillOfAction('drill_saisies')).toBe('saisies');
    expect(drillOfAction('drill_force')).toBe('gainage');
    expect(drillOfAction('travail')).toBeNull();
    const base = fighterAttributes({});
    expect(fighterAttributes({ entr_frappe: 1 }).frappe).toBeGreaterThan(base.frappe);
    expect(fighterAttributes({ entr_saisies: 3 }).technique).toBeGreaterThan(base.technique);
    expect(fighterAttributes({ entr_force: 1 }).force).toBeGreaterThan(base.force);
    for (const id of DRILL_IDS) { const d = DRILLS[id]; expect(d.calls.length).toBeGreaterThanOrEqual(6); expect(d.wolof.length).toBeGreaterThan(0); expect(d.touch.length).toBeGreaterThan(0); }
  });
  it('the calls are a fixed sequence: two runs of a drill open the same calls at the same times', () => {
    for (const id of DRILL_IDS) {
      const a = startDrill(id), b = startDrill(id), seen: string[][] = [[], []];
      for (let t = 0; t < 30; t += DT) for (const [k, d] of [[0, a], [1, b]] as const) {
        const o = drillTick(d, DT);
        if (o.opened) seen[k].push(`${d.t.toFixed(2)}:${o.opened.want}`);
      }
      expect(seen[0]).toEqual(seen[1]);
      expect(seen[0]).toHaveLength(DRILLS[id].calls.length);
      expect(a.done).toBe(true);
      expect(drillScore(a)).toEqual({ right: 0, faults: 0, falls: 0, score: 0, of: DRILLS[id].calls.length });   // nothing done, nothing scored
      expect(a.results.every(r => r === 'late')).toBe(true);
    }
  });
  it('the growing gain is the career’s: slower and slower (the counter’s curve), the same whatever the score', () => {
    const g = (n: number) => fighterAttributes({ entr_frappe: n + 1 }).frappe - fighterAttributes({ entr_frappe: n }).frappe;
    expect(g(0)).toBeGreaterThanOrEqual(g(40));
    expect(g(80)).toBeLessThanOrEqual(1);
    expect(fighterAttributes({ entr_frappe: 1e6 }).frappe).toBeLessThanOrEqual(100);
  });
});

describe('làmb 2.0 · Sac de frappe: the right strike on the coach’s call', () => {
  it('the called strike, on time and in reach, is right; the other one is wrong; none is late', () => {
    const d = startDrill('frappe');
    const c1 = untilCall(d)!; expect(c1.want).toBe('quick');
    expect(hearDrill(d, { k: 'swing', kind: 'quick' })).toBeNull();
    expect(hearDrill(d, { k: 'land', kind: 'quick', result: 'hit' })).toBe('right');
    const c2 = untilCall(d)!; expect(c2.want).toBe('quick');
    expect(hearDrill(d, { k: 'swing', kind: 'big' })).toBe('wrong');
    untilCall(d);                                                        // the third call (big): no answer
    let closed = null; for (let t = 0; t < 3 && !closed; t += DT) closed = drillTick(d, DT).closed;
    expect(closed).toBe('late');
    expect(d.results.slice(0, 3)).toEqual(['right', 'wrong', 'late']);
  });
  it('out of reach it is a miss; a strike before the call is a fault, and faults come off the score', () => {
    const d = startDrill('frappe');
    expect(hearDrill(d, { k: 'swing', kind: 'quick' })).toBe('fault');
    untilCall(d);
    hearDrill(d, { k: 'swing', kind: 'quick' });
    expect(hearDrill(d, { k: 'land', kind: 'quick', result: 'miss' })).toBe('miss');
    untilCall(d);
    hearDrill(d, { k: 'swing', kind: 'quick' }); hearDrill(d, { k: 'land', kind: 'quick', result: 'hit' });
    expect(drillScore(d)).toMatchObject({ right: 1, faults: 1, score: 0 });
    for (let i = 0; i < 5; i++) hearDrill(d, { k: 'swing', kind: 'quick' });   // hammering between calls
    expect(drillScore(d).score).toBe(0);                                  // never below zero
    expect(drillFeedback('frappe', 'fault')).toMatch(/appel/);
  });
});

describe('làmb 2.0 · Travail des saisies: read his move, answer with the one that beats it', () => {
  it('the beating move wins the exchange: right; anything else: a miss; a move before his: a fault', () => {
    const d = startDrill('saisies');
    expect(hearDrill(d, { k: 'exchange', by: 'player', winner: 'player', result: 'drive', move: 'push', against: null })).toBe('fault');
    const c1 = untilCall(d)!; expect(c1.want).toBe('push');
    expect(hearDrill(d, { k: 'exchange', by: 'player', winner: 'player', result: 'counter', move: ANSWER.push, against: 'push' })).toBe('right');
    untilCall(d);
    expect(hearDrill(d, { k: 'exchange', by: 'opponent', winner: 'opponent', result: 'drive', move: 'pull', against: null })).toBe('miss');
    expect(drillScore(d)).toMatchObject({ right: 1, faults: 1, score: 0 });
  });
});

describe('làmb 2.0 · Gainage: hold his pushes by pushing with him', () => {
  it('his push met by a push holds (whoever is stronger); a counter is not the drill; a fall is counted', () => {
    const d = startDrill('gainage');
    untilCall(d);
    expect(hearDrill(d, { k: 'exchange', by: 'player', winner: 'opponent', result: 'clash', move: 'push', against: 'push' })).toBe('right');
    untilCall(d);
    expect(hearDrill(d, { k: 'exchange', by: 'player', winner: 'player', result: 'counter', move: 'pull', against: 'push' })).toBe('miss');
    untilCall(d);
    expect(hearDrill(d, { k: 'fall' })).toBe('miss');
    expect(drillScore(d)).toMatchObject({ right: 1, falls: 1 });
  });
  it('the coach’s last word follows the score (lexicon phrase with its gloss, then French)', () => {
    const d = startDrill('gainage');
    d.results = d.results.map(() => 'right');
    expect(drillVerdict(d).line).toMatch(/Baax na/);
    d.results = d.results.map((_, i) => (i < 3 ? 'right' : 'miss'));
    expect(drillVerdict(d).line).toMatch(/Ndank ndank/);
    d.results = d.results.map(() => 'late');
    expect(drillVerdict(d)).toMatchObject({ score: 0, of: 6 });
    expect(drillVerdict(d).line).toMatch(/Bul tiit/);
  });
});

// ------------------------------------------------------------------ inside the duel, headless

const look = { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] };
function drillDuel(id: DrillId) {
  const input = { enabled: true, move: () => ({ x: 0, y: 0 }), takeAction: () => false } as unknown as Input;
  return new LambDuel({ origin: { x: 0, z: 0 }, look, input, crowdSize: 0, mode: 'entrainement', style: PARTNER, level: 1, ring: 5, discipline: 'avec_frappe', drill: id, drillNotes: ['Frappe 20 → 23'] });
}
/** Plays a drill with a pupil: `act` presses what it decides on each frame; returns the duel at its recap. */
function play(id: DrillId, act: (duel: LambDuel, i: Info, k: number) => void) {
  const duel = drillDuel(id);
  for (let k = 0; k < 60 * 60 && duel.phase !== 'result'; k++) { act(duel, duel.info() as unknown as Info, k); duel.update(DT); }
  return duel;
}
const good: Record<DrillId, (duel: LambDuel, i: Info) => void> = {
  frappe: (duel, i) => { if (i.phase === 'fight' && i.drill.open && !i.drill.open.swung && !i.strike?.player) duel.pressStrike(i.drill.open.want); },
  saisies: (duel, i) => { const m = i.clinch?.move; if (i.phase === 'clinch' && i.drill.open && m?.opponent && !m.player) duel.pressMove(ANSWER[m.opponent as keyof typeof ANSWER]); },
  gainage: (duel, i) => { const m = i.clinch?.move; if (i.phase === 'clinch' && i.drill.open && m?.opponent === 'push' && !m.player) duel.pressMove('push'); },
};

describe('làmb 2.0 · the drills inside the duel (headless)', () => {
  for (const id of DRILL_IDS) {
    it(`${id}: a pupil who answers each call right scores them all, then the drill's recap`, () => {
      const duel = play(id, good[id]);
      const r = duel.drillResult()!;
      expect(r.outcome).toBe('entrainement');
      expect(r.right).toBe(DRILLS[id].calls.length);
      expect(r.score).toBe(DRILLS[id].calls.length);
      expect(duel.result!.rewards.lines[0]).toMatch(new RegExp(`^${DRILLS[id].title} : ${r.score}/${r.of}`));
      expect(duel.result!.rewards.lines).toContain('Frappe 20 → 23');
    });
    it(`${id}: a pupil who does nothing scores nothing — the same twice (no luck)`, () => {
      const a = play(id, () => {}).drillResult()!, b = play(id, () => {}).drillResult()!;
      expect(a.score).toBe(0); expect(a.right).toBe(0);
      expect(b).toEqual(a);
    });
  }
  it('a pupil who hammers the buttons without listening scores less than one who answers', () => {
    const spam = play('frappe', (duel, i, k) => { if (i.phase === 'fight' && k % 12 === 0) duel.pressStrike('quick'); }).drillResult()!;
    expect(spam.faults).toBeGreaterThan(0);
    expect(spam.score).toBeLessThan(DRILLS.frappe.calls.length / 2);
    const wrong = play('saisies', (duel, i) => { const m = i.clinch?.move; if (i.phase === 'clinch' && i.drill.open && m?.opponent && !m.player) duel.pressMove(m.opponent); }).drillResult()!;
    expect(wrong.right).toBe(0);
  });
  it('abandoned, a drill counts nothing (its recap says so)', () => {
    const duel = drillDuel('frappe');
    for (let k = 0; k < 60 * 5; k++) duel.update(DT);
    (duel as unknown as { end(o: string, w: null): void }).end('abandon', null);
    expect(duel.drillResult()!.outcome).toBe('abandon');
    expect(duel.result!.rewards.lines).toEqual(['Exercice interrompu : rien n’est compté']);
  });
  it('without a drill, the écurie avec frappe is still Coach Ablaye’s lesson', () => {
    const input = { enabled: true, move: () => ({ x: 0, y: 0 }), takeAction: () => false } as unknown as Input;
    const duel = new LambDuel({ origin: { x: 0, z: 0 }, look, input, crowdSize: 0, mode: 'entrainement', style: PARTNER, level: 1, ring: 5, discipline: 'avec_frappe' });
    const i = duel.info() as unknown as Info;
    expect(i.lesson).toBeTruthy(); expect(i.drill).toBeUndefined();
    expect(duel.drillResult()).toBeNull();
  });
});
