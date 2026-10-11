import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import type { HubId } from '../src/core/types';
import { newSave, migrate } from '../src/core/save';
import { Relations, PLAYER } from '../src/social/relations';
import { BEATS, WELCOME, WELCOME_HUD_MS, applyChoice, nextLead, openWelcome, settleWelcome, suggestion, suggestionHere, welcomeByTalk, welcomeEarly } from '../src/social/beats';
import { economyStep, stepHub } from '../src/economy/progress';
import { journalView } from '../src/ui/journal';
import { HUNGRY, TIRED, needGoal, pickGoal, type GoalSpot } from '../src/game/goalLine';
import { CITY_ACTIONS } from '../src/world/cityContent';
import { ACTIONS } from '../src/world/content';

/**
 * « Parle à Tonton Ibou » (Habib, 11 Oct): done once, gone for good — also after a reload and in old saves; while it is
 * not done, optional in the Carnet, never forced on the HUD; the HUD's goal line only says what makes sense in this
 * hub, at this hour, with the player's needs and money (src/social/beats.ts, src/economy/progress.ts,
 * src/game/goalLine.ts; main.ts goalLine wires them).
 */
const fresh = (hub: HubId = 'pikine') => { const s = new GameState(newSave(0)); s.data.hub = hub; return { s, r: new Relations(s.data) }; };
const reload = (s: GameState) => { const d = migrate(JSON.parse(JSON.stringify(s.data)))!; return { s: new GameState(d), r: new Relations(d) }; };
const carnet = (r: Relations, s: GameState) => journalView(r, s).html;

describe('Tonton Ibou\'s welcome: done once, gone for good', () => {
  it('a new game: the welcome leads the HUD in Pikine by day, and the Carnet lists it as optional', () => {
    const { s, r } = fresh();
    expect(welcomeEarly(s.data)).toBe(true);
    expect(suggestion(r, s)?.id).toBe(WELCOME);
    expect(suggestionHere(r, s, 'pikine', 10)?.id).toBe(WELCOME);
    expect(carnet(r, s)).toMatch(/Facultatif.*Parle à Tonton Ibou/s);
    expect(nextLead(r, s)?.id).not.toBe(WELCOME);                                       // the Carnet's next lead is something else
  });
  it('talking to him in any way closes it (« Discuter », the attaya…), with his recommendation; not twice; not another person', () => {
    const { s, r } = fresh();
    expect(welcomeByTalk('modou', r, s)).toBeNull();
    const reply = welcomeByTalk('ibou', r, s);
    expect(reply).toMatch(/Modou/);
    expect(s.data.beats[WELCOME]).toBe('installer'); expect(s.data.flags).toContain('reco_modou');
    expect(welcomeByTalk('ibou', r, s)).toBeNull();
    for (const h of [10, 23]) for (const hub of ['pikine', 'plateau', 'corniche', 'almadies'] as const) expect(suggestionHere(r, s, hub, h)?.id).not.toBe(WELCOME);
    expect(suggestion(r, s)?.id).not.toBe(WELCOME);
    expect(openWelcome(r)).toBeNull();
    expect(carnet(r, s)).not.toMatch(/Facultatif/);
  });
  it('the ★ beat itself closes it too, and done stays done after a reload', () => {
    const { s, r } = fresh();
    const b = BEATS.find(x => x.id === WELCOME)!;
    applyChoice(b, b.choices[0], r, s);
    const back = reload(s);
    expect(back.r.beatDone(WELCOME)).toBe(true);
    expect(suggestion(back.r, back.s)?.id).not.toBe(WELCOME);
    expect(suggestionHere(back.r, back.s, 'pikine', 10)?.id).not.toBe(WELCOME);
    expect(carnet(back.r, back.s)).not.toMatch(/Facultatif/);
  });
  it('not done: still optional in the Carnet after a reload, but off the HUD once the first moments are over', () => {
    const { s, r } = fresh();
    s.addMoney(1500, 'Livraison');                                                       // a first pay
    expect(welcomeEarly(s.data)).toBe(false);
    expect(suggestionHere(r, s, 'pikine', 10)?.id).not.toBe(WELCOME);
    expect(suggestion(r, s)?.id).not.toBe(WELCOME);
    const back = reload(s);
    expect(carnet(back.r, back.s)).toMatch(/Facultatif.*Parle à Tonton Ibou/s);
    const late = fresh(); late.s.data.playedMs = WELCOME_HUD_MS;                            // a quarter of an hour without a word to him
    expect(suggestionHere(late.r, late.s, 'pikine', 10)?.id).not.toBe(WELCOME);
    expect(carnet(late.r, late.s)).toMatch(/Facultatif/);
  });
  it('an old save whose player already talked with Ibou (a relation with him, no beat): marked done on load, once, nothing given twice', () => {
    const old = migrate({ schemaVersion: 2, wallet: 900, hub: 'pikine', rel: { 'ibou|player': 3 }, beats: {}, flags: [] })!;
    const s = new GameState(old), r = new Relations(old);
    expect(settleWelcome(r, s)).toBe(true);
    expect(s.data.beats[WELCOME]).toBe('installer'); expect(s.data.flags).toContain('reco_modou');
    expect(r.level(PLAYER, 'ibou')).toBe(3);
    expect(settleWelcome(r, s)).toBe(false);
    const never = new GameState(migrate({ schemaVersion: 1, wallet: 900 })!);
    expect(settleWelcome(new Relations(never.data), never)).toBe(false);
    expect(never.data.beats[WELCOME]).toBeUndefined();
  });
});

describe('the goal line: this hub, this hour', () => {
  it('a person is suggested only in their own hub, while people are about; another hub\'s lead waits in the Carnet', () => {
    const { s, r } = fresh('almadies');
    const here = suggestionHere(r, s, 'almadies', 10, () => true);
    expect(here?.id).not.toBe(WELCOME);
    if (here && 'npc' in here) expect(['ousmane']).toContain(here.npc);
    expect(here?.hint ?? '').not.toMatch(/\(Pikine\)/);
    expect(suggestionHere(r, s, 'pikine', 23)?.id ?? null).not.toBe(WELCOME);              // at night nobody is sent to see someone
    expect(suggestionHere(r, s, 'pikine', 10, id => id !== 'ibou')?.id).not.toBe(WELCOME);   // he is not about
  });
  it('the first job: the hub\'s own Tiak Tiak (Pikine, Plateau), else its paid services — never another hub\'s pick-up', () => {
    for (const [hub, re] of [['pikine', /Mame Diarra \(Pikine\)/], ['plateau', /Chez Fatou \(Plateau\)/], ['almadies', /Petits boulots/], ['corniche', /Petits boulots/]] as const) {
      const { s, r } = fresh(hub);
      welcomeByTalk('ibou', r, s);
      const st = economyStep(s)!;
      expect(st.hint).toMatch(re);
      expect(suggestionHere(r, s, hub, 10)?.hint ?? '').not.toMatch(hub === 'pikine' ? /\(Plateau\)/ : /\(Pikine\)/);
    }
    const { s } = fresh();
    expect(stepHub({ id: 'goal_buy', hint: '' }, s)).toBe('pikine');
    expect(stepHub({ id: 'goal_save', hint: '' }, s)).toBeNull();
  });
});

describe('the goal line: the player\'s needs and money', () => {
  // Almadies as it is built (src/world/city.ts): the square's free rest, the juice bar, a shop's paid service
  const spots: GoalSpot[] = [
    { id: 'almadies:city:square', name: 'Place des voisins · Ngor', x: 40, z: 10, actions: CITY_ACTIONS.square },
    { id: 'almadies:city:mall-juice', name: 'Jus & Go', x: 10, z: 0, actions: CITY_ACTIONS.juice },
    { id: 'almadies:city:mall-style', name: 'Style Rek', x: 5, z: 0, actions: CITY_ACTIONS.style },
  ];
  const needs = (energie: number, faim: number) => ({ faim, energie, moral: 50, social: 50, hygiene: 50 });
  it('58 F and 0 % energy at the Almadies: rest for free on the square (walking needs no energy), not « buy a coffee » or « go to Pikine »', () => {
    const g = needGoal({ needs: needs(0, 50), wallet: 58, here: { x: 0, z: 0 }, spots, home: null })!;
    expect(g.text).toBe('Fatigué : Se poser à l’ombre — Place des voisins · Ngor');
    expect(g.target).toEqual({ name: 'Place des voisins · Ngor', x: 40, z: 10 });
  });
  it('tired at home\'s hub: home to sleep; in the room: the bed', () => {
    const home: GoalSpot = { id: 'pikine:home:11', name: 'Ta chambre', x: 3, z: 3, actions: [] };
    expect(needGoal({ needs: needs(TIRED - 1, 50), wallet: 0, here: { x: 0, z: 0 }, spots, home })?.text).toBe('Fatigué : rentre dormir chez toi — Ta chambre');
    const bed: GoalSpot = { id: 'pikine:in:bed', name: 'Lit', x: 1001, z: 0, actions: ACTIONS.home.filter(a => a.id === 'dormir') };
    expect(needGoal({ needs: needs(5, 50), wallet: 0, here: { x: 1000, z: 0 }, spots: [bed], home: null })?.text).toBe('Fatigué : Dormir — Lit');
  });
  it('hungry: a meal the wallet can pay here, else nothing (no line promising what cannot be bought)', () => {
    expect(needGoal({ needs: needs(80, HUNGRY - 1), wallet: 58, here: { x: 0, z: 0 }, spots, home: null })).toBeNull();
    expect(needGoal({ needs: needs(80, 3), wallet: 600, here: { x: 0, z: 0 }, spots, home: null })?.text.replace(/[  ]/g, ' ')).toBe('Faim : Jus de bouye frais (500 F) — Jus & Go');
    expect(needGoal({ needs: needs(80, 50), wallet: 600, here: { x: 0, z: 0 }, spots, home: null })).toBeNull();   // nothing critical
  });
  it('what leads: the marker the player chose, the fighter\'s evening, a critical need, tonight\'s gala, then the lead about this hub', () => {
    const all = { walking: 'w', fighter: 'f', need: 'n', evening: 'e', local: 'l' };
    expect(pickGoal(all)?.kind).toBe('walking');
    expect(pickGoal({ ...all, walking: null })?.kind).toBe('fighter');
    expect(pickGoal({ ...all, walking: null, fighter: null })?.kind).toBe('need');
    expect(pickGoal({ evening: 'Ce soir à l’arène', local: 'Parle à Tonton Ibou' })?.kind).toBe('evening');   // tonight's gala before a visit
    expect(pickGoal({ local: 'l' })?.kind).toBe('local');
    expect(pickGoal({})).toBeNull();
  });
});
