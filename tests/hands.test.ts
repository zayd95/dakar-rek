import { describe, expect, it } from 'vitest';
import { HAND_REST, handClosure } from '../src/actors/humanoid';

/** The studio bodies' hands (no finger bones: the `grip` morph target): gently curled at rest, closed on a wheel or handlebars, open in prayer. */
describe('hand closure by clip', () => {
  it('a hand at rest is gently curled, never spread wide open', () => {
    for (const c of ['Idle', 'Walk', 'Jog', 'Run', 'Talk', 'Sit', 'SitCar', 'Stance', 'Lie', null]) expect(handClosure(c)).toBe(HAND_REST);
    expect(HAND_REST).toBeGreaterThan(0.25); expect(HAND_REST).toBeLessThan(0.6);
  });
  it('closed on the steering wheel and on the handlebars; mostly closed holding something; open in prayer', () => {
    for (const c of ['Drive', 'Ride', 'RidePaddle']) expect(handClosure(c)).toBe(1);
    expect(handClosure('Grab')).toBeGreaterThan(HAND_REST);
    for (const c of ['PrayStand', 'PrayTakbir', 'PraySujud', 'PraySit']) expect(handClosure(c)).toBeLessThan(0.2);
  });
});
