import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { ANALOG, GAIT, KEYS, METRES_PER_FORME, Stride, analogSpeed, keysSpeed } from '../src/game/stride';

const fresh = () => { const s = new GameState(newSave()); return { s, st: new Stride(s) }; };
/** Holds the stick at `mag` for `secs`, 60 frames a second; returns the last target speed. */
const hold = (st: Stride, mag: number, secs: number) => { let v = 0; for (let i = 0; i < Math.round(secs * 60); i++) v = st.analog(mag, 1 / 60); return v; };

describe('getting around on foot (src/game/stride.ts): the push sets the pace, running never tires', () => {
  it('one smooth curve on the stick: slow walk, walk, jog, run; continuous and increasing', () => {
    const run = GAIT.run;
    expect(analogSpeed(0, run)).toBe(0);
    let prev = 0;
    for (let m = 0.01; m <= 1.0001; m += 0.01) {
      const v = analogSpeed(m, run);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v - prev).toBeLessThan(0.6);                          // no step anywhere on the curve
      prev = v;
    }
    expect(analogSpeed(0.3, run)).toBeCloseTo(GAIT.walk, 5);
    expect(analogSpeed(0.62, run)).toBeCloseTo(ANALOG.brisk, 5);
    expect(analogSpeed(0.88, run)).toBeCloseTo(ANALOG.jog, 5);
    expect(analogSpeed(1, run)).toBeCloseTo(run, 5);
  });

  it('a light push walks, a strong one runs on its own: no button, no gait to pick', () => {
    const { st } = fresh();
    expect(hold(st, 0.3, 1)).toBeCloseTo(GAIT.walk, 2);
    expect(st.gait).toBe('walk'); expect(st.running).toBe(false);
    expect(hold(st, 0.85, 1)).toBeGreaterThan(3.5);
    expect(st.gait).toBe('jog'); expect(st.running).toBe(true);
    expect(hold(st, 1, 1)).toBeCloseTo(st.runSpeed(), 2);
    expect(st.gait).toBe('sprint'); expect(st.sprinting).toBe(true);
  });

  it('brushing the edge of the stick does not bolt: the run opens only once the stick has been fully out for a moment', () => {
    const { st } = fresh();
    expect(hold(st, 1, ANALOG.sprintHold * 0.5)).toBeCloseTo(ANALOG.jog, 5);
    expect(hold(st, 1, ANALOG.sprintHold)).toBeGreaterThan(ANALOG.jog + 1);
  });

  it('running for ten minutes costs no energy and no hygiene, and can go on for ever (no stamina, nobody out of breath)', () => {
    const { s, st } = fresh();
    const before = { ...s.data.needs };
    let dist = 0;
    for (let i = 0; i < 600 * 30; i++) { const v = st.analog(1, 1 / 30); st.moved(v / 30); dist += v / 30; }
    expect(st.gait).toBe('sprint');                                // still at the run after ten minutes
    expect(dist).toBeGreaterThan(4000);
    expect(s.data.needs.energie).toBe(before.energie);
    expect(s.data.needs.hygiene).toBe(before.hygiene);
    expect(Object.keys(st)).not.toContain('stamina');
  });

  it('an exhausted character can still run: energy is spent by what one does, not by getting there', () => {
    const { s, st } = fresh();
    s.data.needs.energie = 0;
    expect(hold(st, 1, 1)).toBeCloseTo(st.runSpeed(), 2);
  });

  it('time passing alone does not drain energy either; hunger, company and cleanliness still wear with the day', () => {
    const { s } = fresh();
    const before = { ...s.data.needs };
    s.tick(30 * 60000);                                            // half an hour played
    expect(s.data.needs.energie).toBe(before.energie);
    expect(s.data.needs.faim).toBeLessThan(before.faim);
    expect(s.data.needs.hygiene).toBeLessThan(before.hygiene);
  });

  it('what one does still tires: an activity’s cost is taken as before', () => {
    const { s } = fresh();
    const e = s.data.needs.energie;
    s.adjust({ energie: -18 });                                    // (a garage shift: src/world/content.ts)
    expect(s.data.needs.energie).toBe(e - 18);
  });

  it('keyboard: a direction key walks for an instant, then runs on its own; Shift keeps to a walk; indoors the keys walk', () => {
    const { st } = fresh();
    expect(st.keys(1, false, 0.1)).toBeCloseTo(ANALOG.brisk, 5);            // the first instant
    let v = 0; for (let i = 0; i < 120; i++) v = st.keys(1, false, 1 / 60);  // two seconds held
    expect(v).toBeCloseTo(st.runSpeed(), 2); expect(st.gait).toBe('sprint');
    expect(st.keys(1, true, 1 / 60)).toBe(GAIT.walk); expect(st.gait).toBe('walk');   // Shift: a walk, at once
    expect(st.keys(0, false, 1 / 60)).toBe(0);                               // released: the next press starts from the walk again
    expect(st.keys(1, false, 0.1)).toBeCloseTo(ANALOG.brisk, 5);
    const indoors = fresh().st; let w = 0; for (let i = 0; i < 120; i++) w = indoors.keys(1, false, 1 / 60, true);
    expect(w).toBeCloseTo(ANALOG.brisk, 5);
    // the keys' curve has no step either
    let prev = keysSpeed(KEYS.runAfter, GAIT.run);
    for (let t = KEYS.runAfter; t < KEYS.runAfter + KEYS.runIn + 0.2; t += 0.02) { const k = keysSpeed(t, GAIT.run); expect(k).toBeGreaterThanOrEqual(prev); expect(k - prev).toBeLessThan(0.35); prev = k; }
  });

  it('running far still builds fitness, and fitness makes the run a little faster', () => {
    const { s, st } = fresh();
    const v0 = st.runSpeed();
    hold(st, 1, 1);
    st.moved(METRES_PER_FORME / 1.5 + 1);                           // (a run metre counts 1.5)
    expect(s.data.counters.forme).toBe(1);
    s.data.counters.forme = 60;
    expect(st.runSpeed()).toBeGreaterThan(v0);
    expect(st.runSpeed()).toBeLessThanOrEqual(GAIT.run * 1.12 + 1e-9);
  });

  it('a gait forced by the debug API (the checks) is taken at once', () => {
    const { st } = fresh();
    expect(st.forced(1, 2)).toBeCloseTo(st.runSpeed(), 5); expect(st.gait).toBe('sprint');
    expect(st.forced(1, 1)).toBeCloseTo(GAIT.jog, 5); expect(st.gait).toBe('jog');
    expect(st.forced(0, 2)).toBe(0);
  });
});
