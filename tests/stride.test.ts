import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Stride, ShiftTap, GAIT, METRES_PER_FORME, RUN_MIN_ENERGY, SPRINT_FORME, DOUBLE_TAP, jogDrain, sprintDrain } from '../src/game/stride';

const fresh = () => { const s = new GameState(newSave()); s.data.needs.energie = 90; return { s, st: new Stride(s) }; };

describe('on foot: walk, jog, sprint (always free)', () => {
  it('a light push walks slowly, a full push (W) walks normally at 2 m/s, Shift jogs, a double-tapped Shift sprints', () => {
    const { st } = fresh();
    expect(GAIT.brisk).toBe(2.0); expect(GAIT.jog).toBe(4.2);
    expect(st.target(0.3, 0, 0.1)).toBeCloseTo(GAIT.walk * 0.5, 5);
    expect(st.target(1, 0, 0.1)).toBe(GAIT.brisk); expect(st.gait).toBe('walk');
    expect(st.target(1, 1, 0.1)).toBeCloseTo(GAIT.jog, 5); expect(st.gait).toBe('jog'); expect(st.running).toBe(true); expect(st.sprinting).toBe(false);
    expect(st.target(1, 2, 0.1)).toBeCloseTo(GAIT.run, 5); expect(st.gait).toBe('sprint'); expect(st.sprinting).toBe(true);
    expect(st.target(0.3, 2, 0.1)).toBeLessThan(GAIT.brisk);               // no running on a light push
  });
  it('jogging is sustainable (minutes, a fraction of the sprint\'s drain) and does not refill; sprinting is a short burst', () => {
    expect(jogDrain(0)).toBeLessThan(sprintDrain(0) / 8); expect(sprintDrain(0)).toBeGreaterThanOrEqual(14);
    const a = fresh();
    for (let i = 0; i < 600; i++) a.st.target(1, 1, 0.1);                    // a minute jogging
    expect(a.st.stamina).toBeGreaterThan(5); expect(a.st.stamina).toBeLessThan(100); expect(a.st.winded).toBe(false);
    const b = fresh();
    for (let i = 0; i < 100; i++) b.st.target(1, 2, 0.1);                    // 10 s sprinting: spent
    expect(b.st.gait).not.toBe('sprint');
  });
  it('the sprint falls back to a jog when stamina runs out (winded: no sprint until a third is back), then to a walk when the jog gives out', () => {
    const { st } = fresh();
    let n = 0; while (st.sprinting || n === 0) { st.target(1, 2, 0.1); if (++n > 400) break; }
    expect(n).toBeLessThan(120);                                              // a short burst
    expect(st.winded).toBe(true); expect(st.running).toBe(true);
    expect(st.gait).toBe('jog'); expect(st.target(1, 2, 0.1)).toBeCloseTo(GAIT.jog, 5);   // still asked: held at a jog
    for (let i = 0; i < 400 && st.running; i++) st.target(1, 2, 0.1);
    expect(st.gait).toBe('walk'); expect(st.spent).toBe(true); expect(st.whyNot()).toBe('Essoufflé…');
    expect(st.target(1, 1, 0.1)).toBe(GAIT.brisk);
    for (let i = 0; i < 60; i++) st.target(0, 0, 0.1);                       // 6 s standing still
    expect(st.winded).toBe(false); expect(st.spent).toBe(false);
    expect(st.target(1, 2, 0.1)).toBeGreaterThan(GAIT.jog);
  });
  it('an exhausted character cannot run', () => {
    const { s, st } = fresh(); s.data.needs.energie = RUN_MIN_ENERGY - 1;
    expect(st.target(1, 1, 0.1)).toBe(GAIT.brisk); expect(st.whyNot()).toMatch(/fatigué/);
  });
  it('jogging and sprinting build fitness (a sprinted metre counts more) and tire a little (the jog less); walking costs nothing', () => {
    const { s, st } = fresh();
    st.target(1, 0, 0.1); st.moved(1000);                                     // walking: free
    expect(s.data.counters.forme ?? 0).toBe(0); expect(s.data.needs.energie).toBe(90); expect(s.wallet).toBe(newSave().wallet);
    st.target(1, 1, 0.1); st.moved(METRES_PER_FORME * 3 + 10);
    expect(s.data.counters.forme).toBe(3); expect(s.data.counters.course_m).toBe(METRES_PER_FORME * 3 + 10);
    const jogCost = 90 - s.data.needs.energie; expect(jogCost).toBeGreaterThan(0);
    const t = fresh(); t.st.target(1, 2, 0.1); t.st.moved(METRES_PER_FORME * 2);
    expect(t.s.data.counters.forme).toBe(Math.floor(2 * SPRINT_FORME));
    expect(90 - t.s.data.needs.energie).toBeGreaterThan(jogCost * 0.5 * (2 / 3));   // per metre, the sprint costs twice the jog
    s.data.counters.forme = 50;
    expect(st.maxStamina()).toBe(200); expect(st.runSpeed()).toBeGreaterThan(GAIT.run);
  });
});

describe('Shift: held = jog, double-tapped and held = sprint', () => {
  it('a single press is a jog; a second press within the delay, held, is a sprint; a slow second press a jog', () => {
    const tap = new ShiftTap();
    expect(tap.level(false)).toBe(0);
    tap.press(10); expect(tap.level(true)).toBe(1);                              // held: a jog
    tap.release(); expect(tap.level(false)).toBe(0);
    tap.press(11); tap.release();                                                // a tap...
    tap.press(11 + DOUBLE_TAP - 0.05); expect(tap.level(true)).toBe(2);          // ...and again, held: a sprint
    tap.release(); expect(tap.level(false)).toBe(0);
    tap.press(11 + DOUBLE_TAP - 0.05 + DOUBLE_TAP + 0.2); expect(tap.level(true)).toBe(1);   // too slow: a jog again
  });
  it('a double tap between two frames is not lost, releasing ends the sprint, key repeat does not count', () => {
    const tap = new ShiftTap();
    tap.press(5); tap.release(); tap.press(5.1);                                 // down, up, down before the frame is drawn
    expect(tap.level(true)).toBe(2);
    tap.press(5.15); expect(tap.level(true)).toBe(2);                            // auto-repeat while held
    expect(tap.level(false)).toBe(0); expect(tap.level(true)).toBe(1);            // released without an event (window blur): back to a jog
  });
});
