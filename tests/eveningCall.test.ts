import { describe, expect, it } from 'vitest';
import { CALL_FROM, FAR, GOAL_FROM, NEAR_GATE, afterPlace, boutTonight, callDue, callText, eveningGoal, fighterGoal, goalText, placeClock, welcomeFirst, type EveningInput } from '../src/arena/eveningCall';
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
  it('from an hour before the doors to the end of the bout, step by step: the gate, the window, through the gate, a seat', () => {
    expect(GOAL_FROM).toBe(GALA.doors - 1);
    expect(at({ hour: GOAL_FROM - 0.1 })).toBeNull();
    expect(at({ hour: GOAL_FROM })).toEqual({ kind: 'arena', how: 'walk' });
    expect(at({ hour: 17.6 })).toEqual({ kind: 'arena', how: 'walk' });
    expect(at({ hour: 17.6, gate: { dist: NEAR_GATE - 1, inside: false } })).toEqual({ kind: 'ticket' });   // by the gate: the window
    expect(at({ hour: 17.6, ticket: true })).toEqual({ kind: 'enter' });                                    // ticket in hand: the gate
    expect(at({ hour: 17.6, ticket: true, gate: { dist: 30, inside: true } })).toEqual({ kind: 'seat' });   // inside: a place on the tiers
    expect(at({ hour: 17.6, ticket: true, gate: { dist: 30, inside: true }, seated: true })).toBeNull();     // seated: the show
    expect(at({ hour: 17.6, gate: { dist: 30, inside: true } })).toBeNull();   // inside without a ticket (a fighter): their own path
    expect(at({ hour: 17.6, ticket: true, gate: { dist: FAR + 5, inside: false } })).toEqual({ kind: 'arena', how: 'ride' });
    expect(at({ hour: GALA.close })).toBeNull();
    expect(goalText({ kind: 'ticket' }, undefined, GALA.doors - 0.5)).toBe(`Le guichet ouvre à ${GALA.doors} h, à gauche de la porte`);
    expect(goalText({ kind: 'ticket' }, undefined, GALA.doors + 0.5)).toMatch(/^Ton billet au guichet, à gauche de la porte · 1\s000\sF$/);
    expect(goalText({ kind: 'enter' })).toBe('Billet en poche : entre par la porte de l’arène');
    expect(goalText({ kind: 'seat' })).toBe('Trouve une place libre sur les gradins');
  });
  it('the welcome beat stays first only while the player has earned nothing yet', () => {
    expect(at({ hour: 17.6, welcome: true })).toBeNull();
    const fresh = { ledger: [], counters: {} }, spent = { ledger: [{ amount: -1000 }], counters: {} };
    expect(welcomeFirst(true, fresh)).toBe(true);
    expect(welcomeFirst(true, spent)).toBe(true);                                     // spending is not earning
    expect(welcomeFirst(true, { ledger: [{ amount: 2200 }], counters: {} })).toBe(false);   // a first pay: tonight's arena first
    expect(welcomeFirst(true, { ledger: [], counters: { livraisons: 1 } })).toBe(false);
    expect(welcomeFirst(false, fresh)).toBe(false);
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
    expect(at({ hour: 20.5, galaDone: true, gate: { dist: 30, inside: true } })).toEqual({ kind: 'leave' });   // still inside: out by the gate
    expect(at({ hour: 20.5, galaDone: true, gate: { dist: 30, inside: true }, seated: true })).toBeNull();      // still in the stands
    expect(goalText({ kind: 'leave' })).toBe('Le gala est fini : sors par la porte');
    expect(at({ hour: 20.5, galaDone: true, afterDone: true })).toBeNull();
    expect(at({ hour: 20.5, galaDone: true, welcome: true })).toBeNull();
    expect(goalText({ kind: 'after' }, { name: 'Dibiterie Chez Pathé', close: 2 })).toBe('Après le combat : Dibiterie Chez Pathé, ouvert jusqu’à 2 h');
  });
});

describe('the fighter’s own evening on the goal line', () => {
  it('a line for each leg of the path, nothing during the bout or without a bout', () => {
    expect(fighterGoal('called')).toBe('Tu combats ce soir : entrée des lutteurs, derrière l’arène');
    expect(fighterGoal('tunnel')).toMatch(/rejoins ton coin/);
    expect(fighterGoal('prep')).toMatch(/prépare-toi/);
    expect(fighterGoal('ring')).toMatch(/cercle/);
    expect(fighterGoal('return')).toMatch(/tunnel des lutteurs/);
    expect(fighterGoal('bout')).toBeNull();
    expect(fighterGoal('idle')).toBeNull();
  });
});

describe('the place pill: a weekday, not a day number', () => {
  it('« Samedi · 15:00 », and « Gala ce soir » on Friday to Sunday until the gala is over', () => {
    // city day 0 is a Monday (src/arena/exteriorRules.ts WEEKDAY_FR); 258 is a Sunday
    expect(placeClock(258, 15, false)).toEqual({ clock: 'Dimanche · 15:00', tag: 'Gala ce soir' });
    expect(placeClock(257, 9.5, false)).toEqual({ clock: 'Samedi · 09:30', tag: 'Gala ce soir' });
    expect(placeClock(255, 18, false)).toEqual({ clock: 'Jeudi · 18:00', tag: null });
    expect(placeClock(258, 21, true).tag).toBeNull();                          // tonight's gala seen to the end
    expect(placeClock(258, GALA.close, false).tag).toBeNull();                 // closing time
    expect(placeClock(1, 0, false).clock).toBe('Mardi · 00:00');
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
