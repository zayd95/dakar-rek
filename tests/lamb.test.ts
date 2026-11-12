import { describe, it, expect } from 'vitest';
import {
  RULES, RULES_STATUS, STYLES, STYLE_IDS, arenaProfileRows, boutRewards, breakWindowOpen, clinchStrength, emptyScore, levelFactor,
  opponentLevel, points, rankedStyle, record, recordIncrements, refereeDecision,
} from '../src/lamb/rules';

describe('làmb rules (provisional game adaptation)', () => {
  it('only "sans frappe" is enabled; "avec frappe" waits for reviewed rules', () => {
    expect(RULES.sans_frappe.enabled).toBe(true);
    expect(RULES.sans_frappe.strikes).toBe(false);
    expect(RULES.avec_frappe.enabled).toBe(false);
    expect(RULES.sans_frappe.status).toBe(RULES_STATUS);
    expect(RULES_STATUS).toBe('Règles Dakar Rek');
  });

  it('referee decision at time-out: more points wins, equal points is a draw', () => {
    const a = { guards: 2, grabs: 1, breaks: 0 }, b = { guards: 0, grabs: 2, breaks: 0 };
    expect(points(a)).toBe(3); expect(points(b)).toBe(2);
    expect(refereeDecision(a, b)).toBe('player');
    expect(refereeDecision(b, a)).toBe('opponent');
    expect(refereeDecision(emptyScore(), emptyScore())).toBeNull();
    expect(refereeDecision({ guards: 1, grabs: 0, breaks: 1 }, { guards: 0, grabs: 2, breaks: 0 })).toBeNull();
  });

  it('empoignade strength: effort, endurance and initiative', () => {
    expect(clinchStrength(0, 100, false)).toBe(2.5);
    expect(clinchStrength(4, 40, true)).toBe(6);
    expect(clinchStrength(5, 0, false)).toBeGreaterThan(clinchStrength(0, 100, true));
  });

  it('dégagement window opens periodically after the first delay', () => {
    const r = RULES.sans_frappe;
    expect(breakWindowOpen(0)).toBe(false);
    expect(breakWindowOpen(r.breakFirst + 0.01)).toBe(true);
    expect(breakWindowOpen(r.breakFirst + r.breakOpen + 0.05)).toBe(false);
    expect(breakWindowOpen(r.breakFirst + r.breakCycle + 0.1)).toBe(true);
  });
});

describe('làmb opponents', () => {
  it('three styles with distinct, readable traits', () => {
    expect(STYLE_IDS).toEqual(['costaud', 'rapide', 'defensif']);
    expect(STYLES.costaud.clinchPower).toBeGreaterThan(STYLES.rapide.clinchPower);
    expect(STYLES.costaud.speed).toBeLessThan(STYLES.rapide.speed);
    expect(STYLES.rapide.staminaMax).toBeLessThan(STYLES.costaud.staminaMax);
    expect(STYLES.rapide.windup).toBeLessThan(STYLES.costaud.windup);
    expect(STYLES.defensif.guardChance).toBeGreaterThan(STYLES.costaud.guardChance);
    expect(STYLES.defensif.counterChance).toBeGreaterThan(STYLES.rapide.counterChance);
  });
  it('level rises with wins, eases after defeats, stays within 1..5; difficulty depends on level only', () => {
    expect(opponentLevel(0, 0)).toBe(1);
    expect(opponentLevel(2, 0)).toBe(2);
    expect(opponentLevel(4, 3)).toBe(2);
    expect(opponentLevel(40, 0)).toBe(5);
    expect(opponentLevel(0, 30)).toBe(1);
    expect(levelFactor(1)).toBeCloseTo(0.9);
    expect(levelFactor(5)).toBeCloseTo(1.3);
  });
  it('ranked opponents rotate through the styles', () => {
    expect([0, 1, 2, 3].map(rankedStyle)).toEqual(['costaud', 'rapide', 'defensif', 'costaud']);
  });
});

describe('làmb record and rewards', () => {
  it('friendly and ranked records are separate; the global counters are kept', () => {
    expect(recordIncrements({ mode: 'amical', outcome: 'projection', winner: 'player' })).toEqual({ combats: 1, victoires: 1, lamb_amical_v: 1 });
    expect(recordIncrements({ mode: 'classe', outcome: 'projection', winner: 'opponent' })).toEqual({ combats: 1, lamb_classe_d: 1 });
    expect(recordIncrements({ mode: 'classe', outcome: 'egalite', winner: null })).toEqual({ combats: 1, lamb_classe_n: 1 });
    expect(recordIncrements({ mode: 'amical', outcome: 'decision', winner: 'player' })).toEqual({ combats: 1, victoires: 1, lamb_amical_v: 1 });
  });
  it('an abandon is recorded apart: not a defeat, no reward, no win for anyone', () => {
    const inc = recordIncrements({ mode: 'classe', outcome: 'abandon', winner: null });
    expect(inc).toEqual({ lamb_classe_ab: 1, lamb_abandons: 1 });
    expect(inc.lamb_classe_d).toBeUndefined(); expect(inc.victoires).toBeUndefined();
    const rw = boutRewards({ mode: 'classe', outcome: 'abandon', winner: null });
    expect(rw.coach).toBe(0); expect(rw.needs.moral).toBeLessThanOrEqual(0); expect(rw.needs.social).toBeUndefined();
  });
  it('training is unranked: only the skill counter, and nothing if interrupted', () => {
    expect(recordIncrements({ mode: 'entrainement', outcome: 'entrainement', winner: null })).toEqual({ lamb_skill: 1 });
    expect(recordIncrements({ mode: 'entrainement', outcome: 'abandon', winner: null })).toEqual({});
    expect(boutRewards({ mode: 'entrainement', outcome: 'entrainement', winner: null }).needs.moral).toBeUndefined();
  });
  it('rewards never include money; ranked wins give a little more', () => {
    const f = boutRewards({ mode: 'amical', outcome: 'projection', winner: 'player' });
    const c = boutRewards({ mode: 'classe', outcome: 'projection', winner: 'player' });
    expect(Object.keys(f.needs)).not.toContain('wallet');
    expect(c.needs.moral!).toBeGreaterThan(f.needs.moral!);
  });
  it('arena profile rows for the phone', () => {
    const k = { lamb_amical_v: 3, lamb_amical_d: 1, lamb_classe_v: 1, lamb_classe_ab: 1, lamb_skill: 2 };
    expect(record(k, 'amical')).toEqual({ v: 3, d: 1, n: 0, ab: 0 });
    const rows = arenaProfileRows(k, 'Baobab (fictive)');
    const get = (l: string) => rows.find(r => r.label === l)?.value;
    expect(get('Combats amicaux')).toBe('3 V · 1 D · 0 N');
    expect(get('Combats classés')).toBe('1 V · 0 D · 0 N · 1 abandon');
    expect(get('Compétence de lutte')).toBe('2');
    expect(get('Écurie')).toBe('Baobab (fictive)');
    expect(get('Discipline')).toContain('sans frappe');
  });
});
