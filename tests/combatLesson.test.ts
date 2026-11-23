import { describe, expect, it } from 'vitest';
import { LambDuel } from '../src/lamb/duel';
import { PARTNER } from '../src/lamb/rules';
import { COMBAT_LESSON, combatSteps, startCombatLesson, combatHear, combatAdvance } from '../src/lamb/combatLesson';
import { AI_COMBAT, CombatAi, SIGNATURE, aiLevel, forgetAll, recall, remember, setupMove } from '../src/lamb/combatAi';
import { THROWS } from '../src/lamb/combat';
import { STYLE6_IDS } from '../src/lamb/stand';
import type { DrillId } from '../src/lamb/drills';
import type { Input } from '../src/core/input';

/**
 * The new bout's lesson and drills with the new controls (Coach Ablaye: the stick for the empoignade's moves and the
 * brace, Saisir tapped or held, the blue button to go deeper, Projeter / Contrer), headless in the real duel; and the
 * opponent's AI tables (src/lamb/combatAi.ts).
 */
const look = { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] };
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
const ANSWER = { push: 'pull', pull: 'pivot', pivot: 'push' } as const;
const stickOf = (m: 'push' | 'pull' | 'pivot'): [number, number] => (m === 'push' ? [1, 0] : m === 'pull' ? [-1, 0] : [0.2, 1]);

function ecurie(frappe: boolean, drill?: DrillId) {
  const input = { enabled: true, move: () => ({ x: 0, y: 0 }), takeAction: () => false } as unknown as Input;
  return new LambDuel({ origin: { x: 0, z: 0 }, look, input, crowdSize: 0, mode: 'entrainement', style: PARTNER, level: 1, ring: 5, discipline: frappe ? 'avec_frappe' : 'sans_frappe', seed: 7, combat: true, drill });
}

describe('combat · Coach Ablaye’s lesson with the new controls', () => {
  for (const frappe of [false, true]) {
    it(`${frappe ? 'avec' : 'sans'} frappe: a pupil doing each step goes through the whole lesson, then the training recap`, () => {
      const duel = ecurie(frappe), seen: string[] = [];
      for (let k = 0; k < 60 * 300 && duel.phase !== 'result'; k++) {
        const i = duel.info() as unknown as Info, step = i.lesson?.step as string;
        if (seen[seen.length - 1] !== step) seen.push(step);
        duel.setGuard(false);
        if (i.phase === 'fight') {
          if (step === 'distance' || (i.dist > 1.45 && step !== 'guard')) duel.debugStick(1, 0, 0.05);
          else if (step === 'quick' && !i.strike?.player && k % 20 === 0) duel.pressStrike('quick');
          else if (step === 'big' && !i.strike?.player && k % 30 === 0) duel.pressStrike('big');
          else if (step === 'guard') { if (i.dist > 1.7) duel.debugStick(1, 0, 0.05); duel.setGuard(i.strike?.opponent === 'big'); }
          else if (step === 'reach' && k % 30 === 0) duel.pressReach('tap');
        } else if (i.phase === 'clinch') {
          const c = i.clinch, cb = i.combat;
          if (step === 'moves' && c.move.opponent && !c.move.player) { const [f, s] = stickOf(ANSWER[c.move.opponent as keyof typeof ANSWER]); duel.debugStick(f, s, 0.3); }
          else if (step === 'deeper' && k % 40 === 0) duel.pressDeeper();
          else if (step === 'unbalance') duel.debugStick(1, 0, 0.1);
          else if (step === 'throw' && !cb.attempt && k % 30 === 0) duel.pressGrab();
          else if (step === 'brace' && cb.attempt?.by === 'opponent') duel.debugStick(-1, 0, 0.1);
          else if (step === 'break' && k % 20 === 0) duel.pressBreak();
        }
        duel.update(1 / 60);
      }
      expect(seen).toEqual([...combatSteps(frappe)]);
      expect(duel.result?.outcome).toBe('entrainement');
      expect((duel.info() as unknown as Info).lesson.skipped).toBe(0);
      duel.dispose();
    });
  }
  it('every step has its coach line, its keys and what it highlights; the stick is taught for the empoignade', () => {
    for (const [s, d] of Object.entries(COMBAT_LESSON)) { expect(d.title.length, s).toBeGreaterThan(4); expect(d.fr.length, s).toBeGreaterThan(10); expect(d.wolof.length, s).toBeGreaterThan(0); }
    expect(COMBAT_LESSON.moves.touch).toEqual(['joy']); expect(COMBAT_LESSON.unbalance.touch).toEqual(['joy']);
    expect(combatSteps(false)).not.toContain('quick'); expect(combatSteps(true)).toContain('guard');
    const l = startCombatLesson(false);
    expect(combatHear(l, { k: 'tick', dist: 1.5 })).toBe(true); expect(l.step).toBe('reach');
    for (let i = 0; i < 20; i++) combatAdvance(l, true);
    expect(l.done).toBe(true);
  });
});

describe('combat · the écurie drills with the new controls', () => {
  for (const id of ['frappe', 'saisies', 'gainage'] as DrillId[]) {
    it(`${id}: every call answered right (the strike button, or the stick in the empoignade) scores full marks`, () => {
      const duel = ecurie(true, id);
      duel.debugDrillAnswer(true);
      for (let k = 0; k < 60 * 120 && duel.phase !== 'result'; k++) duel.update(1 / 60);
      const r = duel.drillResult();
      expect(r).not.toBeNull();
      expect(r!.right).toBe(r!.of); expect(r!.faults).toBe(0);
      duel.dispose();
    });
  }
});

describe('combat · the opponent’s tables', () => {
  it('a level up is never easier: quicker, reads and braces more, learns more, sets up faster, waits for a better throw', () => {
    for (let i = 1; i < 5; i++) {
      expect(AI_COMBAT.react[i]).toBeLessThanOrEqual(AI_COMBAT.react[i - 1]);
      expect(AI_COMBAT.read[i]).toBeGreaterThanOrEqual(AI_COMBAT.read[i - 1]);
      expect(AI_COMBAT.brace[i]).toBeGreaterThanOrEqual(AI_COMBAT.brace[i - 1]);
      expect(AI_COMBAT.learn[i]).toBeGreaterThanOrEqual(AI_COMBAT.learn[i - 1]);
      expect(AI_COMBAT.slow[i]).toBeLessThanOrEqual(AI_COMBAT.slow[i - 1]);
      expect(AI_COMBAT.margin[i]).toBeGreaterThanOrEqual(AI_COMBAT.margin[i - 1]);
    }
    expect(aiLevel(1).tells).toBe(true); expect(aiLevel(3).tells).toBe(false);
  });
  it('each of the six styles has its own signature throw, and its moves set that throw up', () => {
    const sig = STYLE6_IDS.map(s => SIGNATURE[s].throw);
    expect(new Set(sig).size).toBe(6);
    expect(setupMove('croc')).toBe('push'); expect(setupMove('hanche')).toBe('pull'); expect(setupMove('balayage')).toBe('pivot');
    for (const s of STYLE6_IDS) expect(THROWS[SIGNATURE[s].throw]).toBeDefined();
  });
  it('the memory across bouts is kept by wrestler, halved, and forgotten with the page', () => {
    forgetAll();
    const ai = new CombatAi('costaud', 3, 'Gora');
    for (let i = 0; i < 4; i++) ai.saw('throw', 'hanche');
    remember('Gora', ai.habits);
    expect(recall('Gora').throws.hanche).toBe(2);
    expect(recall('Pape').throws.hanche).toBeUndefined();
    forgetAll();
    expect(recall('Gora').throws.hanche).toBeUndefined();
  });
});
