import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import type { HubId } from '../src/core/types';
import { newSave, migrate } from '../src/core/save';
import { Relations, PLAYER } from '../src/social/relations';
import { BEATS, WELCOME, WELCOME_HUD_MS, applyChoice, nextLead, openWelcome, settleWelcome, suggestion, suggestionHere, welcomeByTalk, welcomeEarly } from '../src/social/beats';
import { economyStep, stepHub } from '../src/economy/progress';
import { acceptJob, completeJob } from '../src/economy/jobs';
import { journalView } from '../src/ui/journal';
import { HUD_EVERY_MS, HUNGRY, TIRED, goalNow, hudDue, hudSpace, needGoal, pickGoal, type GoalSpot, type Lead } from '../src/game/goalLine';
import { eveningGoal, goalText } from '../src/arena/eveningCall';
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
  it('not done, past the first moments: never the goal line\'s fallback, even in Pikine by day with only Ibou about', () => {
    const { s, r } = fresh();
    s.addMoney(1500, 'Livraison');
    s.data.jobs.active = { runId: 'r1', routeId: 'pl_fatou_market', hub: 'plateau', stage: 'pickup', pay: 1200, startedMs: 0, limitMs: 0 };   // a run in the Plateau
    const ibouOnly = (id: string) => id === 'ibou';
    expect(stepHub(economyStep(s)!, s)).toBe('plateau');                                    // the step is not about Pikine
    expect(suggestionHere(r, s, 'pikine', 15, ibouOnly)).toBeNull();                        // nothing here: an empty line, not the welcome
    expect(suggestion(r, s)?.id).not.toBe(WELCOME);
    expect(carnet(r, s)).toMatch(/Facultatif.*Parle à Tonton Ibou/s);
  });
  it('check-evening\'s afternoon: three paid deliveries, then 17.6 h in Pikine — tonight\'s gala, never the welcome', () => {
    const { s, r } = fresh();
    for (let i = 0; i < 3; i++) { const j = acceptJob(s, 'pk_mame_boutique', true, 600_000); expect(j).not.toBeNull(); expect(completeJob(s, j!.runId)?.paid).toBeGreaterThan(0); }
    expect(welcomeEarly(s.data)).toBe(false);
    const here = suggestionHere(r, s, 'pikine', 17.6);
    expect(here?.id).toBe('ibou_tiak');                                                     // Ibou heard of the first delivery
    expect(pickGoal({ evening: 'Combat ce soir à l’arène (Pikine)', local: here?.hint })).toEqual({ kind: 'evening', text: 'Combat ce soir à l’arène (Pikine)' });
    // and a brand-new player at 17.6 h: the welcome leads the local leads, the gala still comes first
    const n = fresh();
    expect(suggestionHere(n.r, n.s, 'pikine', 17.6)?.id).toBe(WELCOME);
    expect(pickGoal({ evening: 'Combat ce soir à l’arène (Pikine)', local: suggestionHere(n.r, n.s, 'pikine', 17.6)?.hint })?.kind).toBe('evening');
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

describe('the goal line as main.ts applies it (goalNow, hudDue)', () => {
  // the same spots as above: the Almadies' square, juice bar and couture shop
  const spots: GoalSpot[] = [
    { id: 'almadies:city:square', name: 'Place des voisins · Ngor', x: 40, z: 10, actions: CITY_ACTIONS.square },
    { id: 'almadies:city:mall-juice', name: 'Jus & Go', x: 10, z: 0, actions: CITY_ACTIONS.juice },
  ];
  const gate = { name: 'Arène · làmb', x: 0, z: 66 };
  /** Tonight's line as eveningCall gives it (eveningLine = eveningGoal + goalText; gate null: another hub). */
  const evening = (hour: number, inPikine: boolean): Lead | null => {
    const g = eveningGoal({ hour, galaDone: false, ticket: false, welcome: false, gate: inPikine ? { dist: 66, inside: false } : null, afterDone: false });
    return g ? { text: goalText(g, undefined, hour), target: inPikine ? gate : null } : null;
  };
  const bearing = (t: string, at: { x: number; z: number } | null) => (at ? `${t} · ${Math.round(Math.hypot(at.x, at.z))} m` : t);

  it('check-life-loop step 8: talked to Ibou, reloaded, then the Almadies at 10 h with 58 F and 0 % energy — rest on the square, nothing about Pikine', () => {
    const { s, r } = fresh();
    welcomeByTalk('ibou', r, s);
    const back = reload(s); back.s.data.hub = 'almadies'; back.s.data.wallet = 58; back.s.data.needs.energie = 0;
    const here = suggestionHere(back.r, back.s, 'almadies', 10);
    const need = needGoal({ needs: back.s.data.needs, wallet: back.s.wallet, here: { x: 0, z: 0 }, spots, home: null });
    const g = goalNow({ walking: null, fighter: false, evening: evening(10, false), need, here, bearing })!;
    expect(g.kind).toBe('need');
    expect(g.text).toMatch(/^Fatigué : Se poser à l’ombre — Place des voisins · Ngor · \d+ m$/);
    expect(g.target?.name).toBe('Place des voisins · Ngor');
    expect(g.text).not.toMatch(/\(Pikine\)|Tonton Ibou|Mame Diarra/);
    // rested: the line about this hub (its own paid services), still nothing about Pikine
    const rested = goalNow({ walking: null, fighter: false, evening: evening(10, false), need: null, here, bearing });
    expect(rested?.text ?? '').not.toMatch(/\(Pikine\)|Tonton Ibou|Mame Diarra/);
  });
  it('check-evening: three deliveries in Pikine, 17.6 h — « Combat ce soir à l’arène (Pikine) », the pin on the gate; a brand-new player too', () => {
    for (const paid of [true, false]) {
      const { s, r } = fresh();
      if (paid) for (let i = 0; i < 3; i++) { const j = acceptJob(s, 'pk_mame_boutique', true, 600_000)!; completeJob(s, j.runId); }
      const g = goalNow({ walking: null, fighter: false, evening: evening(17.6, true), need: null, here: suggestionHere(r, s, 'pikine', 17.6), bearing })!;
      expect(g).toMatchObject({ kind: 'evening', text: 'Combat ce soir à l’arène (Pikine) · 66 m', target: gate, npc: null, job: false });
    }
  });
  it('in another hub at the gala hour: tonight\'s gala by car rapide, without a pin in this hub; a critical need first', () => {
    const { s, r } = fresh('almadies'); welcomeByTalk('ibou', r, s);
    const ev = evening(17.6, false);
    expect(goalNow({ walking: null, fighter: false, evening: ev, need: null, here: suggestionHere(r, s, 'almadies', 17.6), bearing })).toMatchObject({ kind: 'evening', target: null });
    expect(ev?.text).toMatch(/car rapide/);
    const tired = needGoal({ needs: { faim: 50, energie: 0, moral: 50, social: 50, hygiene: 50 }, wallet: 58, here: { x: 0, z: 0 }, spots, home: null });
    expect(goalNow({ walking: null, fighter: false, evening: ev, need: tired, here: null, bearing })?.kind).toBe('need');
  });
  it('the first moments, by day in Pikine: the welcome as the local lead, the way-finding on Ibou; the first job: the pick-up', () => {
    const { s, r } = fresh();
    expect(goalNow({ walking: null, fighter: false, evening: evening(10, true), need: null, here: suggestionHere(r, s, 'pikine', 10) })).toMatchObject({ kind: 'local', npc: 'ibou', job: false, target: null });
    welcomeByTalk('ibou', r, s);
    expect(goalNow({ walking: null, fighter: false, evening: null, need: null, here: suggestionHere(r, s, 'pikine', 10) })).toMatchObject({ kind: 'local', npc: null, job: true });
    const after = fresh(); after.s.addMoney(1500, 'Livraison');                              // check-life-loop's first pay, not done
    expect(goalNow({ walking: null, fighter: false, evening: null, need: null, here: suggestionHere(after.r, after.s, 'pikine', 10) })?.text).not.toMatch(/Tonton Ibou/);
  });
  it('the fighter\'s own evening: no need comes before his bout\'s legs; the walking marker the player chose comes first of all', () => {
    const tired = { text: 'Fatigué : Se poser à l’ombre — Place', target: { name: 'Place', x: 1, z: 1 } };
    const ev = { text: 'Tu combats ce soir : entrée des lutteurs, derrière l’arène', target: null };
    expect(goalNow({ walking: null, fighter: true, evening: ev, need: tired, here: null })).toMatchObject({ kind: 'fighter', target: null });
    expect(goalNow({ walking: 'Y aller', fighter: true, evening: ev, need: tired, here: null })?.kind).toBe('walking');
    expect(goalNow({ walking: null, fighter: false, evening: null, need: null, here: null })).toBeNull();
  });
  it('the HUD refreshes 4 times a second of wall time (every frame on a slow renderer) and at once in another hub, a room, a set hour', () => {
    const out = hudSpace('pikine', false, null);
    expect(hudDue(1000, 900, out, out)).toBe(false);
    expect(hudDue(900 + HUD_EVERY_MS, 900, out, out)).toBe(true);
    expect(hudDue(5000, 0, out, out)).toBe(true);                                            // one slow frame: refreshed, not three frames later
    for (const k of [hudSpace('almadies', false, null), hudSpace('pikine', true, null), hudSpace('pikine', false, 10)]) expect(hudDue(901, 900, k, out)).toBe(true);
  });
});
