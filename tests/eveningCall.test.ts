import { describe, expect, it } from 'vitest';
import { CALL_FROM, FAR, GOAL_FROM, afterPlace, boutTonight, callDue, callText, eveningGoal, goalText, type EveningInput } from '../src/arena/eveningCall';
import { GALA } from '../src/arena/program';
import type { PlaceSpec } from '../src/activity/places';

const base: EveningInput = { hour: 17, galaDone: false, ticket: false, welcome: false, gate: { dist: 72, inside: false }, afterDone: false };
const at = (o: Partial<EveningInput>) => eveningGoal({ ...base, ...o });

describe('the evening call', () => {
  it('says what is on tonight, the doors and the ticket', () => {
    expect(callText('card')).toMatch(new RegExp(`^Ce soir à l’arène de Pikine : combat de quartier · portes ${GALA.doors} h · billet 1\\s000\\sF au guichet$`));
    expect(callText('gala')).toMatch(/grand gala de lutte/);
  });
  it('comes half an hour before the doors, once per evening, not once the bout is over', () => {
    expect(CALL_FROM).toBe(GALA.doors - 0.5);
    expect(callDue(3, CALL_FROM - 0.1, false, undefined)).toBe(false);
    expect(callDue(3, CALL_FROM, false, undefined)).toBe(true);
    expect(callDue(3, 17.6, false, undefined)).toBe(true);                     // loaded later in the evening: still told once
    expect(callDue(3, 17.6, false, 3)).toBe(false);                            // already told tonight (kept in the save)
    expect(callDue(4, 17.6, false, 3)).toBe(true);                             // the next evening
    expect(callDue(3, 20, true, undefined)).toBe(false);                       // tonight's bout seen to the end
    expect(callDue(3, GALA.close + 0.2, false, undefined)).toBe(false);        // closing time
  });
  it('a bout every evening from the set-up to closing', () => {
    expect(boutTonight(GALA.setup - 0.1, false)).toBe(false);
    expect(boutTonight(GALA.setup, false)).toBe(true);
    expect(boutTonight(GALA.close - 0.1, false)).toBe(true);
    expect(boutTonight(GALA.close, false)).toBe(false);
  });
});

describe('the goal line toward the arena', () => {
  it('from an hour before the doors to the end of the bout, for a player without a ticket who is not there yet', () => {
    expect(GOAL_FROM).toBe(GALA.doors - 1);
    expect(at({ hour: GOAL_FROM - 0.1 })).toBeNull();
    expect(at({ hour: GOAL_FROM })).toEqual({ kind: 'arena', how: 'walk' });
    expect(at({ hour: 17.6 })).toEqual({ kind: 'arena', how: 'walk' });
    expect(at({ hour: 17.6, ticket: true })).toBeNull();                       // has a ticket: free to do what they like
    expect(at({ hour: 17.6, gate: { dist: 5, inside: false } })).toBeNull();   // at the gate already
    expect(at({ hour: 17.6, gate: { dist: 30, inside: true } })).toBeNull();   // inside the walls
    expect(at({ hour: GALA.close })).toBeNull();
  });
  it('the welcome beat stays first', () => {
    expect(at({ hour: 17.6, welcome: true })).toBeNull();
  });
  it('far away or in another hub, the car rapide is named', () => {
    expect(at({ hour: 17.6, gate: { dist: FAR + 1, inside: false } })).toEqual({ kind: 'arena', how: 'ride' });
    expect(at({ hour: 17.6, gate: null })).toEqual({ kind: 'arena', how: 'travel' });
    expect(goalText({ kind: 'arena', how: 'walk' })).toBe('Combat ce soir à l’arène (Pikine)');
    expect(goalText({ kind: 'arena', how: 'ride' })).toMatch(/ligne 23, arrêt « Arène »/);
    expect(goalText({ kind: 'arena', how: 'travel' })).toMatch(/jusqu’à Pikine.*ligne 23/);
  });
  it('after the bout, once outside: one place to end the evening (until it is reached)', () => {
    expect(at({ hour: 20.5, galaDone: true })).toEqual({ kind: 'after' });
    expect(at({ hour: 20.5, galaDone: true, gate: { dist: 30, inside: true } })).toBeNull();   // still inside the walls
    expect(at({ hour: 20.5, galaDone: true, afterDone: true })).toBeNull();
    expect(at({ hour: 20.5, galaDone: true, welcome: true })).toBeNull();
    expect(goalText({ kind: 'after' }, { name: 'Dibiterie Chez Pathé', close: 2 })).toBe('Après le combat : Dibiterie Chez Pathé, ouvert jusqu’à 2 h');
  });
});

describe('a place to end the evening', () => {
  const P = (id: string, type: string, hours: [number, number] | undefined, x: number): PlaceSpec => ({ id, type, name: id, space: 'street', hours, anchors: [{ id: 'a', kind: 'counter', x, z: 0 }], offers: {} });
  const places = [P('dibi-near', 'dibi', [11, 2], 50), P('dibi-far', 'dibi', [11, 2], 300), P('gargote', 'eatery', [7, 22], 10), P('mosque', 'mosque', undefined, 5)];
  it('the nearest Dibi open for at least another hour, else an eatery, else nothing', () => {
    expect(afterPlace(places, 21, { x: 0, z: 0 })?.id).toBe('dibi-near');
    expect(afterPlace(places, 23.5, { x: 0, z: 0 })?.id).toBe('dibi-near');    // open past midnight
    expect(afterPlace(places.filter(p => p.type !== 'dibi'), 20, { x: 0, z: 0 })?.id).toBe('gargote');
    expect(afterPlace(places.filter(p => p.type !== 'dibi'), 21.5, { x: 0, z: 0 })).toBeNull();   // the eatery closes at 22 h
    expect(afterPlace([], 21, { x: 0, z: 0 })).toBeNull();
  });
});
