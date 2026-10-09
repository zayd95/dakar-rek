import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Stride, GAIT, METRES_PER_FORME, RUN_MIN_ENERGY } from '../src/game/stride';

const fresh = () => { const s = new GameState(newSave()); s.data.needs.energie = 90; return { s, st: new Stride(s) }; };

describe('on foot: walk, brisk walk, run (always free)', () => {
  it('a light push walks, a full push walks briskly, Shift runs', () => {
    const { st } = fresh();
    expect(st.target(0.3, false, 0.1)).toBeCloseTo(GAIT.walk * 0.5, 5);
    expect(st.target(1, false, 0.1)).toBe(GAIT.brisk);
    expect(st.target(1, true, 0.1)).toBeCloseTo(GAIT.run, 5);
    expect(st.running).toBe(true);
    expect(st.target(0.3, true, 0.1)).toBeLessThan(GAIT.brisk);             // no sprinting on a light push
  });
  it('running spends stamina; out of breath, it walks until a third is back', () => {
    const { st } = fresh();
    for (let i = 0; i < 200 && !st.winded; i++) st.target(1, true, 0.1);
    expect(st.winded).toBe(true); expect(st.stamina).toBe(0);
    expect(st.target(1, true, 0.1)).toBe(GAIT.brisk); expect(st.whyNot()).toBe('Essoufflé…');
    for (let i = 0; i < 60; i++) st.target(0, false, 0.1);                   // 6 s standing still
    expect(st.winded).toBe(false);
    expect(st.target(1, true, 0.1)).toBeGreaterThan(GAIT.brisk);
  });
  it('an exhausted character cannot run', () => {
    const { s, st } = fresh(); s.data.needs.energie = RUN_MIN_ENERGY - 1;
    expect(st.target(1, true, 0.1)).toBe(GAIT.brisk); expect(st.whyNot()).toMatch(/fatigué/);
  });
  it('running far builds fitness (more stamina, a slightly faster run) and tires a little; walking costs nothing', () => {
    const { s, st } = fresh();
    st.target(1, false, 0.1); st.moved(1000);                                 // brisk walk: free
    expect(s.data.counters.forme ?? 0).toBe(0); expect(s.data.needs.energie).toBe(90); expect(s.wallet).toBe(newSave().wallet);
    st.target(1, true, 0.1); st.moved(METRES_PER_FORME * 3 + 10);
    expect(s.data.counters.forme).toBe(3); expect(s.data.counters.course_m).toBe(METRES_PER_FORME * 3 + 10);
    expect(s.data.needs.energie).toBeLessThan(90);
    s.data.counters.forme = 50;
    expect(st.maxStamina()).toBe(200); expect(st.runSpeed()).toBeGreaterThan(GAIT.run);
  });
});
