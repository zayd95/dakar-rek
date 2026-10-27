import { describe, expect, it } from 'vitest';
import { CAR_DIMS, CRASH_LINES, HONK_LINES, REACTION, STREET_LINES, assess, lineFor, stepAway, type CarState } from '../src/crowd/streetReact';
import { LEXICON } from '../src/i18n/wolof';

/** A car at the origin heading +z (yaw 0): ahead is +z, its right is +x. */
const car = (speed: number, yaw = 0): CarState => ({ x: 0, z: 0, yaw, speed, ...CAR_DIMS.car });

describe('the street and the car', () => {
  it('a person in its path, a second ahead, is in danger; a person beside it, a metre off, is a close pass', () => {
    expect(assess(car(12), { x: 0.3, z: 9 }).level).toBe('danger');
    expect(assess(car(12), { x: 2.2, z: 5 }).level).toBe('close');
    expect(assess(car(12), { x: 2.2, z: 5 }).side).toBe(1);
    expect(assess(car(12), { x: -2.4, z: 5 }).side).toBe(-1);
  });
  it('someone behind the car, or far ahead of it, is not in its way', () => {
    expect(assess(car(12), { x: 0, z: -9 }).level).toBe('none');
    expect(assess(car(12), { x: 0, z: 60 }).level).toBe('none');
  });
  it('a car that is slow does not frighten: only a slow pass close beside them is thanked', () => {
    expect(['danger', 'close']).not.toContain(assess(car(2), { x: 0.2, z: 4 }).level);  // too slow to be a danger
    expect(assess(car(3), { x: 2.4, z: 2 }).level).toBe('thanks');
    expect(assess(car(0.3), { x: 2.4, z: 2 }).level).toBe('none');
  });
  it('a fast pass at a distance is noticed', () => {
    expect(assess(car(20), { x: 5, z: 8 }).level).toBe('notice');
    expect(assess(car(8), { x: 5, z: 8 }).level).toBe('none');
  });
  it('follows the car’s heading: the same people, the car turned a quarter', () => {
    const east = car(12, Math.PI / 2);                                                  // heading +x
    expect(assess(east, { x: 9, z: 0.3 }).level).toBe('danger');
    expect(assess(east, { x: 0.3, z: 9 }).level).toBe('none');
  });
  it('the step is sideways, away from the car’s path, on the side they are on', () => {
    expect(stepAway(car(10), { x: 1.5, z: 4 }, 1, 1.7)).toEqual({ x: 3.2, z: 4 });
    const w = stepAway(car(10), { x: -1.5, z: 4 }, -1, 1.7); expect(w.x).toBeCloseTo(-3.2); expect(w.z).toBeCloseTo(4);
  });
  it('every level has several lines, none too long for a bubble, and the Wolof is the game’s Wolof', () => {
    const all = [...Object.values(STREET_LINES).flat(), ...CRASH_LINES, ...HONK_LINES];
    for (const l of Object.values(STREET_LINES)) expect(l.length).toBeGreaterThanOrEqual(3);
    for (const t of all) expect(t.length, t).toBeLessThanOrEqual(28);
    const wo = new Set(LEXICON.map(e => e.wo.toLowerCase().replace(/ ?!$/, '')));
    for (const p of ['Wóoy', 'Dawalal ndank', 'Jërëjëf', 'Baax na', 'Ndank ndank']) expect(wo.has(p.toLowerCase()), p).toBe(true);
  });
  it('never the same line twice in a row', () => {
    const list = STREET_LINES.close;
    for (let i = 0; i < 20; i++) expect(lineFor(list, i / 20, list[Math.floor((i / 20) * list.length)])).not.toBe(list[Math.floor((i / 20) * list.length)]);
  });
  it('the harder the scare, the surer the shout and the bigger the step', () => {
    expect(REACTION.danger.speak).toBeGreaterThan(REACTION.close.speak);
    expect(REACTION.danger.step).toBeGreaterThan(REACTION.close.step);
    expect(REACTION.notice.step).toBe(0);
  });
});
