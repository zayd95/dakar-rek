import { beforeEach, describe, expect, it } from 'vitest';
import { combatDuel, combatSeries, playCombat } from './combatPupil';
import { COMBAT, THROWS, THROW_IDS, type GripKind, type ThrowId } from '../src/lamb/combat';
import { forgetAll } from '../src/lamb/combatAi';
import type { LambDuel } from '../src/lamb/duel';
import type { Discipline } from '../src/lamb/rules';
import { STYLE6_IDS, type Style6 } from '../src/lamb/stand';

/**
 * The new bout on the real duel, headless (docs/wrestling/COMBAT.md « Tests »): LambDuel with `combat: true`, played
 * through the player's inputs (the stick, Saisir, Projeter / Contrer…). Positions are set up with the checks' own hooks
 * (debugHold, debugSet, debugAiThrow) as check-lamb2 does; the rules then decide.
 */
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
const DT = 1 / 60;
const info = (d: LambDuel) => d.info() as unknown as Info;
function run(d: LambDuel, secs: number, until?: (i: Info) => boolean) {
  for (let t = 0; t < secs; t += DT) { d.update(DT); if (until?.(info(d))) return true; }
  return false;
}
/** A bout whose opponent is held still, taken into the empoignade by the player's reach for the nape. */
function clinch(style: Style6 = 'costaud', level = 2, discipline: Discipline = 'sans_frappe', seed = 7): LambDuel {
  const d = combatDuel(style, level, discipline, seed);
  run(d, 6, i => i.phase === 'fight');
  d.debugHold(true);
  run(d, 6, i => { d.debugStick(1, 0, 0.1); return i.dist < 1.3; });
  d.pressReach('tap');
  run(d, 2, i => i.phase === 'clinch');
  expect(info(d).phase).toBe('clinch');
  return d;
}
/** The direction (his own frame) that sets throw `id` up. */
const wayOf = (id: ThrowId): [number, number] => ({ avant: [1, 0], arriere: [-1, 0], cote: [0, 1], haut: [0.6, 0] } as const)[THROWS[id].dir] as [number, number];
const gripOf = (id: ThrowId): GripKind => THROWS[id].grips[0];

beforeEach(() => forgetAll());

describe('combat · the duel: each throw works only with its set-up', () => {
  for (const id of THROW_IDS) {
    it(`${THROWS[id].label}: on a man set up its way it takes him down, by the fall rule (${THROWS[id].fall})`, () => {
      const d = clinch();
      d.debugSet('player', { hold: [gripOf(id), 70], stamina: 100 });
      d.debugSet('opponent', { balance: 42, lean: wayOf(id), stamina: id === 'souleve' ? 30 : 90 });
      expect(info(d).combat.best.id).toBe(id);
      d.pressGrab();                                                       // Projeter: the throw its hold gives
      run(d, 3, i => i.phase !== 'clinch');
      const i = info(d);
      expect(i.lastThrow).toMatchObject({ by: 'player', throw: id, result: 'fall' });
      expect(i.combat.fall).toBe(THROWS[id].fall);
      expect(i.winner).toBe('player');
    });
    it(`${THROWS[id].label}: on a balanced, fresh man it fails and costs its author`, () => {
      const d = clinch();
      d.debugSet('player', { hold: [gripOf(id), 70], stamina: 100 });
      const b0 = info(d).balance.player;
      d.pressGrab();
      run(d, 3, i => !!i.lastThrow);
      const i = info(d);
      expect(i.phase).toBe('clinch');
      expect(['fail', 'braced']).toContain(i.lastThrow.result);
      expect(i.balance.player).toBeLessThan(b0);
      expect(i.combat.player.tally.throws).toBe(1);
    });
  }
  it('the same man, pushed back, gives the croc; pulled in, the hip: the set-up picks the throw', () => {
    const d = clinch();
    d.debugSet('player', { hold: ['bras', 70] });
    d.debugSet('opponent', { balance: 50, lean: [-1, 0] });
    expect(info(d).combat.best.id).toBe('croc');
    d.debugSet('opponent', { balance: 50, lean: [1, 0] });
    expect(info(d).combat.best.id).toBe('hanche');
    d.debugSet('opponent', { balance: 50, lean: [0, -1] });
    expect(info(d).combat.best.id).toBe('balayage');
  });
  it('the stick pushes: held towards him, the exchanges drive his weight back (seen in his imbalance)', () => {
    const d = clinch();
    d.debugSet('player', { hold: ['bras', 70] });
    for (let k = 0; k < 6; k++) { d.debugStick(1, 0, 0.6); run(d, 0.6); }
    expect(info(d).combat.opponent.lean.f).toBeLessThan(-0.1);
  });
});

describe('combat · resistance and counters', () => {
  it('his throw, braced against its way in its last moments, fails and leaves him off balance', () => {
    const d = clinch();
    d.debugSet('opponent', { hold: ['bras', 70] });
    d.debugSet('player', { balance: 50, lean: [1, 0], stamina: 90 });
    expect(d.debugAiThrow('hanche')).toBe(true);
    d.debugStick(-1, 0, 2);                                               // lean back, away from his hip
    run(d, 3, i => !!i.lastThrow);
    expect(info(d).lastThrow).toMatchObject({ by: 'opponent', throw: 'hanche', result: 'braced' });
    expect(info(d).phase).toBe('clinch');
  });
  it('the same throw, not braced, takes the player down', () => {
    const d = clinch();
    d.debugSet('opponent', { hold: ['bras', 70] });
    d.debugSet('player', { balance: 50, lean: [1, 0], stamina: 90 });
    d.debugAiThrow('hanche');
    run(d, 3, i => i.phase !== 'clinch');
    expect(info(d).lastThrow).toMatchObject({ by: 'opponent', result: 'fall' });
    expect(info(d).winner).toBe('opponent');
  });
  it('a tired wrestler cannot brace: he slips', () => {
    const d = clinch();
    d.debugSet('opponent', { hold: ['bras', 70] });
    d.debugSet('player', { balance: 50, lean: [1, 0], stamina: 3 });
    d.debugAiThrow('hanche');
    d.debugStick(-1, 0, 2);
    run(d, 3, i => i.phase !== 'clinch');
    expect(info(d).winner).toBe('opponent');
  });
  it('Contrer with balance and hold turns his throw: he goes down (a reversal)', () => {
    const d = clinch();
    d.debugSet('player', { hold: ['ceinture', 85], balance: 95, stamina: 90 });
    d.debugSet('opponent', { hold: ['nuque', 30], balance: 40 });
    d.debugAiThrow('croc');
    run(d, 0.15);
    expect(info(d).combat.attempt?.by).toBe('opponent');
    d.pressGrab();                                                       // the yellow button reads « Contrer » now
    run(d, 3, i => i.phase !== 'clinch');
    const i = info(d);
    expect(i.lastThrow).toMatchObject({ by: 'opponent', result: 'countered' });
    expect(i.winner).toBe('player');
  });
  it('Contrer from a poor position only blocks it', () => {
    const d = clinch();
    d.debugSet('player', { hold: ['nuque', 15], balance: 35, stamina: 90 });
    d.debugSet('opponent', { hold: ['ceinture', 80], balance: 90 });
    d.debugAiThrow('croc');
    run(d, 0.15); d.pressGrab();
    run(d, 3, i => !!i.lastThrow);
    expect(info(d).lastThrow.result).toBe('blocked');
  });
  it('a hold worn by lost exchanges falls back to a shallower one; Casser breaks free when the Prise allows it', () => {
    const d = clinch();
    d.debugSet('player', { hold: ['nuque', 50] });
    d.pressDeeper(); run(d, 0.6);
    expect(info(d).combat.player.hold.kind).toBe('bras');
    d.pressBreak(); run(d, 0.1);
    expect(info(d).phase).toBe('fight');
    expect(info(d).score.player.breaks).toBe(1);
  });
});

describe('combat · the opponent reads the player', () => {
  /**
   * The player tries the croc from the nape on a man pushed back, `n` times; the AI (défensif: its own pulls lean it back,
   * into a croc, so it braces one only when it reads it) is free. Its brace on each try.
   */
  function tries(seed: number, n: number, name = 'Gora') {
    const out: number[] = [];
    const d = combatDuel('defensif', 3, 'sans_frappe', seed, 'amical', name);
    run(d, 6, i => i.phase === 'fight');
    for (let k = 0; k < n && d.phase !== 'result'; k++) {
      d.debugHold(true);
      run(d, 6, i => { d.debugStick(1, 0, 0.1); return i.phase === 'clinch' || i.dist < 1.3; });
      if (d.phase === 'fight') { d.pressReach('tap'); run(d, 2, i => i.phase === 'clinch'); }
      if (d.phase !== 'clinch') break;
      d.debugSet('player', { hold: ['nuque', 70], stamina: 100, balance: 100 });
      d.debugSet('opponent', { balance: 55, lean: [-1, 0], stamina: 90 });
      d.debugHold(false);
      d.pressGrab();
      let brace = 0;
      run(d, 3, i => { if (i.combat.attempt?.by === 'player') brace = Math.max(brace, i.combat.attempt.brace); return !!i.lastThrow && !i.combat.attempt; });
      out.push(brace);
      if (d.phase === 'clinch') { d.debugHold(true); d.pressBreak(); run(d, 0.3); }
      if ((d.phase as string) !== 'fight') break;
      d.debugSet('player', { stamina: 100 }); d.debugSet('opponent', { stamina: 100, balance: 100 });
    }
    const reads = info(d).combat.ai.reads as string[];
    d.abandon();                                                         // the bout ends (what he saw is remembered)
    return { out, reads };
  }
  it('the same throw three times is read: from the third try he braces it far more often (« Il a compris ton jeu ! »)', () => {
    let first = 0, third = 0, n = 0, read = 0;
    for (let s = 1; s <= 40; s++) {
      forgetAll();
      const r = tries(s, 3); if (r.out.length < 3) continue;
      n++; if (r.out[0] > 0.3) first++; if (r.out[2] > 0.3) third++;
      if (r.reads.includes('throw:croc')) read++;
    }
    expect(n).toBeGreaterThan(15);
    expect(third / n).toBeGreaterThan(first / n + 0.25);
    expect(read / n).toBeGreaterThan(0.8);
  });
  it('he remembers across bouts against the same wrestler (in memory, not in the save): the habit is read sooner', () => {
    let second = 0, fresh = 0, n = 0;
    for (let s = 1; s <= 30; s++) {
      forgetAll();
      tries(s, 3, 'Saliou');                                             // a first bout: three crocs seen
      const again = tries(s + 1000, 2, 'Saliou'), other = (forgetAll(), tries(s + 1000, 2, 'Saliou'));
      if (again.out.length < 2 || other.out.length < 2) continue;
      n++; if (again.out[1] > 0.3) second++; if (other.out[1] > 0.3) fresh++;
    }
    expect(n).toBeGreaterThan(10);
    expect(second).toBeGreaterThan(fresh);
  });
});

describe('combat · no exploit', () => {
  for (const lv of [1, 3, 5]) {
    it(`level ${lv}, ranked: a held guard never wins and never draws`, () => {
      const xs = STYLE6_IDS.map(st => combatSeries({ style: st, level: lv, discipline: 'sans_frappe', script: 'turtle', mode: 'classe', n: 4 }));
      expect(Math.max(...xs.map(x => x.win))).toBeLessThanOrEqual(0.25);
      expect(xs.reduce((a, x) => a + x.draw, 0)).toBe(0);
      expect(xs.reduce((a, x) => a + x.win, 0) / xs.length).toBeLessThanOrEqual(0.05);
    });
  }
  it('mashing every button does not win', () => {
    for (const lv of [1, 3]) for (const d of ['sans_frappe', 'avec_frappe'] as const) {
      const xs = STYLE6_IDS.map(st => combatSeries({ style: st, level: lv, discipline: d, script: 'masher', n: 3 }));
      expect(xs.reduce((a, x) => a + x.win, 0) / xs.length).toBeLessThanOrEqual(0.1);
    }
  });
  it('grabbing and pressing Projeter again and again does not win', () => {
    for (const lv of [1, 3]) {
      const xs = STYLE6_IDS.map(st => combatSeries({ style: st, level: lv, discipline: 'sans_frappe', script: 'spammer', n: 4 }));
      expect(xs.reduce((a, x) => a + x.win, 0) / xs.length).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('combat · both outcomes, and determinism', () => {
  it('a decent player both wins and loses against a level-2 wrestler; bouts end by the fall rule', () => {
    const x = combatSeries({ style: 'costaud', level: 2, discipline: 'sans_frappe', n: 16 });
    expect(x.win).toBeGreaterThan(0.1); expect(x.loss).toBeGreaterThan(0.1);
    expect(x.logs.filter(l => l.outcome === 'projection').every(l => l.fall === 'dos' || l.fall === 'appuis')).toBe(true);
  });
  it('the same seed and the same inputs play the same bout to the same result', () => {
    const a = playCombat({ style: 'rapide', level: 3, discipline: 'avec_frappe', seed: 42 });
    forgetAll();
    const b = playCombat({ style: 'rapide', level: 3, discipline: 'avec_frappe', seed: 42 });
    expect(b).toEqual(a);
  });
  it('the throw line and the lean are the same numbers the rules give (no hidden bonus for the AI)', () => {
    expect(COMBAT.throwAt).toBeGreaterThan(40);
    const d = clinch('saisie', 5);
    d.debugSet('opponent', { hold: ['ceinture', 80] });
    d.debugSet('player', { balance: 100, stamina: 100 });
    // the player balanced and fresh: even the city's best does not throw him (he tries, it fails)
    d.debugAiThrow();
    run(d, 3, i => !!i.lastThrow);
    expect(info(d).phase).toBe('clinch');
  });
});
