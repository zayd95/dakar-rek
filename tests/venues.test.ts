import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats, floorSeatTop, seatClip, sitOriginY, SIT_HIPS, type Seat } from '../src/interact/seats';
import { ActivityRunner, gesturePay, type ActivityServices } from '../src/activity/runner';
import { Places, isPeak } from '../src/activity/places';
import * as T from '../src/activity/templates';
import type { Target } from '../src/interact/types';
import { PRAYER_TIMES, prayerAt, nextPrayer, prayerPeaks, hourLabel } from '../src/venues/prayer';
import { imamTimes, imamGreeting, ownerGreeting, ownerWork, ownerSpecial, programme, doormanGreeting, doormanRegulars, djContest, doormanAsk, clubberHello, clubberTonight, clubberBye } from '../src/venues/talk';
import { unknownPhrases } from '../src/i18n/lines';
import { G } from '../src/activity/gestures';
import { COMPOSED_SITES, isComposed } from '../src/world/sites';

function rig(space = 'street') {
  const state = new GameState(newSave()); state.data.wallet = 10000;
  const seats = new Seats();
  let seated: Seat | null = null; const clips: (string | null)[] = []; let pos = { x: 0, z: 0 };
  const s: ActivityServices = {
    state, seats, space: () => space, player: () => pos, seated: () => seated,
    sit: seat => { if (!seats.occupy(seat.id, 'player')) return false; seated = seat; return true; },
    clip: c => clips.push(c), busy: () => {}, progress: () => {}, toast: () => {}, save: () => {},
  };
  const runner = new ActivityRunner(s);
  return { state, seats, runner, clips, seated: () => seated, setSpace: (v: string) => { space = v; }, at: (x: number, z: number) => { pos = { x, z }; } };
}
const run = (r: ActivityRunner, seconds: number) => { for (let t = 0; t < seconds; t += 0.25) r.update(0.25); };
const A = (id: string, x = 0, z = 0, extra: object = {}) => ({ id, kind: 'spot' as const, x, z, ...extra });

describe('Dibi recipe: why return tomorrow', () => {
  const counters: Record<string, number> = {};
  let hour = 13, day = 3;
  const hooks: T.PlaceHooks = { count: k => counters[k] ?? 0, hour: () => hour, day: () => day, converse: () => {}, tired: e => (e > 50 ? 'fatigué' : null) };
  const place = T.dibi({ id: 'pk:dibi', name: 'Chez Pathé', space: 'street', owner: 'Pathé', tables: { x: 5, z: 0 }, anchors: [A('counter'), A('grill', 6)] }, hooks);
  const keys = T.dibiCounters('pk:dibi');
  const visible = (anchor: string) => place.offers[anchor].filter(o => !o.visible || o.visible()).map(o => o.id);
  it('is open 11 h–2 h, lively at lunch and at night, with a location chat', () => {
    expect(place.hours).toEqual([11, 2]); expect(place.chat).toBe(true); expect(place.type).toBe('dibi');
    expect(isPeak(place, 13)).toBe(true); expect(isPeak(place, 23.5)).toBe(true); expect(isPeak(place, 16)).toBe(false);
  });
  it('the counter: the dibi, brochettes, the day’s special, bissap, the owner; attaya only in the evening', () => {
    expect(visible('counter')).toEqual(['dibi', 'brochettes', `jour_${T.dibiSpecial(3).id}`, 'bissap', 'patron']);
    hour = 21; expect(visible('counter')).toContain('attaya'); hour = 13;
    day = 4; expect(visible('counter')).toContain(`jour_${T.dibiSpecial(4).id}`); expect(T.dibiSpecial(4)).not.toBe(T.dibiSpecial(3)); day = 3;
  });
  it('meals count per place; after five the owner gives the regular’s price', () => {
    const dibi = place.offers.counter.find(o => o.id === 'dibi')!;
    expect(dibi.steps.at(-1)!.effects!.counters).toMatchObject({ meals: 1, [keys.meals]: 1 });
    expect(dibi.steps.find(s => s.primitive === 'sit')!.seat).toEqual({ near: { x: 5, z: 0 }, r: 8 });
    counters[keys.meals] = T.REGULAR_MEALS;
    expect(visible('counter')).toContain('dibi_habitue'); expect(visible('counter')).not.toContain('dibi');
    expect(place.offers.counter.find(o => o.id === 'dibi_habitue')!.price).toBeLessThan(dibi.price!);
    counters[keys.meals] = 0;
  });
  it('the grill is a ladder: more shifts here → a better-paid rung; the last one only in the evening', () => {
    expect(visible('grill')).toEqual(['grill_aide']);
    counters[keys.grill] = 5; expect(visible('grill')).toEqual(['grill_grilleur']);
    counters[keys.grill] = 30; expect(visible('grill')).toEqual(['grill_chef']);
    hour = 20; expect(visible('grill')).toEqual(['grill_soir']); hour = 13;
    expect(T.grillRank(40, 1).id).toBe('soir'); expect(T.nextGrillRank(40)).toBeNull();
    counters[keys.grill] = 3;
    expect(place.offers.grill[0].detail).toMatch(/3\/5 services avant « Tenir le grill »/);   // live text
    counters[keys.grill] = 0;
  });
  it('each rung is a shift played with the timing gesture: pay, fatigue, the counter of this grill, the service category', () => {
    const g = place.offers.grill[0];
    expect(g.primitive).toBe('work');
    expect(g.steps.at(-1)).toMatchObject({ clip: 'Talk', gesture: { kind: 'timing', rounds: 3 }, effects: { money: 900, counters: { [keys.grill]: 1, shifts: 1 }, category: 'service' } });
    expect(g.steps.at(-1)!.effects!.needs!.energie).toBeLessThan(0);
    const r = rig(); r.state.data.needs.energie = 100;
    expect(r.runner.blocked(g)).toBeNull();
    const tired = T.dibi({ id: 'y', name: 'y', space: 'street', anchors: [A('counter'), A('grill', 6)] }, { tired: () => 'Repose-toi avant ce service' });
    expect(r.runner.blocked(tired.offers.grill[0])).toBe('Repose-toi avant ce service');      // too tired: the reason is shown
  });
});

describe('mosque recipe: calm, two spaces, no reward', () => {
  let washed = false, gathering: string | null = null, entered = 0;
  const place = T.mosque({ id: 'pl:mosquee', name: 'Grande Mosquée', space: 'street', peaks: prayerPeaks(), anchors: [
    A('ablutions', -5, 0), A('door', 0, 0), A('cour', 5, 0),
    A('hall', 1000, 0, { space: 'salle', radius: 9 }), A('imam', 1000, -4, { space: 'salle' }), A('shelf', 995, 3, { space: 'salle' }),
  ] }, { enter: () => { entered++; }, converse: () => {}, prayReady: () => (washed ? null : 'ablutions d’abord'), congregation: () => gathering, done: a => { if (a === 'ablutions') washed = true; } });
  it('no hours, no chat, no commerce: every offer is free and earns nothing', () => {
    expect(place.hours).toBeUndefined(); expect(place.chat).toBeUndefined();
    for (const list of Object.values(place.offers)) for (const o of list) {
      expect(o.price ?? 0).toBe(0);
      for (const s of o.steps) expect(s.effects?.money ?? 0).toBe(0);
    }
  });
  it('ablutions, prayer and the calm seat change nothing in the save', () => {
    for (const id of ['priere', 'priere_groupe', 'calme']) expect(place.offers.hall.find(o => o.id === id)!.steps.every(s => !s.effects)).toBe(true);
    expect(place.offers.ablutions[0].steps.every(s => !s.effects)).toBe(true);
    expect(place.offers.cour[0].steps[0].effects?.category).toBeUndefined();                 // volunteering: no activity category either
  });
  it('anchors live in two spaces: taps and door in the courtyard, rows and imam in the hall', () => {
    const r = rig(); const places = new Places(r.runner, () => 12); places.add(place);
    const at = (space: string, x: number, z: number) => { const out: Target[] = []; places.collect(space, x, z, out); return out.map(t => t.id); };
    expect(at('street', 0, 0)).toEqual(['pl:mosquee:door']);
    expect(at('salle', 1000, 0)).toContain('pl:mosquee:hall');
    expect(at('street', 1000, 0)).toEqual([]);
    expect(places.at('salle', 1000, -3.5)?.id).toBe('pl:mosquee');
  });
  it('ablutions first (they open prayer), then prayer on a prayer row, kneeling', () => {
    const r = rig('street');
    r.seats.add({ id: 'tabouret', x: -5, z: 1, top: 0.62, yaw: 0, kind: 'stool', space: 'street', occupant: null });
    r.seats.add({ id: 'rang:0', x: 1000, z: 1, top: floorSeatTop(0.1), yaw: Math.PI, kind: 'prayer', space: 'salle', occupant: null, clip: 'Kneel' });
    r.seats.add({ id: 'chaise', x: 1000, z: 0.5, top: 0.56, yaw: 0, kind: 'chair', space: 'salle', occupant: null });
    const pray = place.offers.hall[0];
    expect(r.runner.blocked(pray)).toBe('ablutions d’abord');
    r.at(-5, 0.5); r.runner.start(place.offers.ablutions[0]);
    expect(r.seated()?.id).toBe('tabouret');                                                  // seated on the low stool at the tap
    run(r.runner, 4.5); expect(washed).toBe(true);
    r.setSpace('salle'); r.at(1000, 0.4);
    const before = JSON.stringify(r.state.data);
    expect(r.runner.blocked(pray)).toBeNull();
    r.runner.start(pray); run(r.runner, 8.5);
    expect(r.seated()?.kind).toBe('prayer');                                                  // never the chair next to it
    expect(r.clips.at(-1)).toBe('Kneel');                                                     // the row's own pose stays after the prayer
    expect(JSON.stringify(r.state.data)).toBe(before.replace(/"wallet":\d+/, `"wallet":${r.state.data.wallet}`));
  });
  it('around a prayer time the group prayer replaces the single one; reading stays disabled', () => {
    const vis = () => place.offers.hall.filter(o => !o.visible || o.visible()).map(o => o.id);
    expect(vis()).toEqual(['priere', 'calme']);
    gathering = 'Tisbaar'; expect(vis()).toEqual(['priere_groupe', 'calme']); expect(place.offers.hall[1].detail).toBe('Tisbaar'); gathering = null;
    const r = rig(); expect(r.runner.blocked(place.offers.shelf[0])).toMatch(/texte vérifié/);
    r.runner.start(place.offers.door[0]); expect(entered).toBe(1);
  });
});

describe('fishing beach: a trip in the pirogue, then the mareyeuses', () => {
  let hour = 7;
  const beach = T.fishingBeach({ id: 'cn:beach', name: 'Soumbédioune', space: 'street', boat: 'pirogue', anchors: [A('pirogue'), A('mareyeuses', 10)] }, { hour: () => hour, converse: () => {} });
  const vis = (a: string) => beach.offers[a].filter(o => !o.visible || o.visible());
  it('the catch depends on the hour: fuller in the morning', () => {
    expect(T.fishCatch(7)).toBe(6); expect(T.fishCatch(12)).toBe(4); expect(T.fishCatch(18)).toBe(3);
    expect(vis('pirogue').map(o => o.id)).toEqual(['sortie_6']); hour = 13; expect(vis('pirogue').map(o => o.id)).toEqual(['sortie_4']); hour = 7;
    expect(beach.hours).toEqual([6, 20]); expect(beach.chat).toBe(true);
  });
  it('the trip boards the pirogue seat, goes out, pulls the net (the catch), comes back; the player stays aboard', () => {
    const r = rig(); r.state.data.needs.energie = 100;
    r.seats.add({ id: 'pirogue', x: 30, z: 30, top: 0.76, yaw: 0, kind: 'vehicle', space: 'street', occupant: null });
    const trip = vis('pirogue')[0];
    expect(trip.steps.map(s => s.label)).toEqual(Object.values(T.TRIP_STEPS));
    let fish = 0; const runner = new ActivityRunner({ ...(r.runner as unknown as { s: ActivityServices }).s, item: (id, n) => { if (id === 'poisson') fish += n; } });
    runner.start(trip);
    expect(r.seated()?.id).toBe('pirogue');                                                  // boards from the beach, wherever the seat is
    run(runner, 22);
    expect(runner.running).toBe(false); expect(fish).toBe(6); expect(r.seated()?.id).toBe('pirogue');
    expect(r.state.data.counters.sorties_peche).toBe(1);
  });
  it('the mareyeuses buy one or four fish (you need them) and sell one', () => {
    expect(vis('mareyeuses').map(o => o.id)).toEqual(['vendre', 'vendre1', 'acheter', 'mareyeuse']);
    expect(beach.offers.mareyeuses[0].steps.at(-1)!.effects).toMatchObject({ money: 4 * T.FISH_PRICE.sell, items: { poisson: -4 } });
    expect(beach.offers.mareyeuses[2].price).toBe(T.FISH_PRICE.buy);
    const r = rig(); const sell1 = beach.offers.mareyeuses[1];
    const runner = new ActivityRunner({ ...(r.runner as unknown as { s: ActivityServices }).s, hasItem: () => false });
    expect(runner.blocked(sell1)).toMatch(/poisson/);
  });
});

describe('salon: a chair, a service, a look that stays', async () => {
  const THREE = await import('three');
  const { SALON_SERVICES, applyStyle, hairParts, HAIR, BEARD } = await import('../src/venues/style');
  let restyled = '';
  const place = T.salon({ id: 'pk:salon', name: 'Salon Awa', space: 'street', chairs: { x: 5, z: 0 }, services: SALON_SERVICES.map(s => ({ ...s })), anchors: [A('chair', 4, 0)] }, { restyle: id => { restyled = id; } });
  it('open 9 h–21 h with a chat; each service sits you in a styling chair (never the bench) and restyles you', () => {
    expect(place.hours).toEqual([9, 21]); expect(place.chat).toBe(true);
    const r = rig(); r.at(4, 0.5);
    r.seats.add({ id: 'banc', x: 4, z: 0.6, top: 0.58, yaw: 0, kind: 'bench', space: 'street', occupant: null });
    r.seats.add({ id: 'fauteuil', x: 5, z: 1, top: 0.6, yaw: 0, kind: 'chair', space: 'street', occupant: null });
    const coupe = place.offers.chair.find(o => o.id === 'coupe')!;
    r.runner.start(coupe); expect(r.state.wallet).toBe(10000 - 1500);
    expect(r.seated()?.id).toBe('fauteuil');
    run(r.runner, 8.5); expect(restyled).toBe('coupe'); expect(r.state.data.counters['salon:pk:salon']).toBe(1);
  });
  it('the cut and the beard are applied to the body, under a hat the hair stays covered', () => {
    expect(hairParts(HAIR.rase)).toEqual({ short: false, puff: false }); expect(hairParts(HAIR.profil)).toBeNull();
    const group = new THREE.Group();
    const mesh = (name: string, visible: boolean) => { const m = new THREE.Mesh(); m.name = name; m.visible = visible; group.add(m); return m; };
    const short = mesh('Hair_Short', true), puff = mesh('Hair_Puff', false), beard = mesh('Beard', false); mesh('Cloth_Kufi', false);
    const body = { group } as unknown as import('../src/actors/humanoid').Humanoid;
    expect(applyStyle(body, { coiffure: HAIR.afro, barbe: BEARD.taillee })).toBe(true);
    expect([short.visible, puff.visible, beard.visible]).toEqual([false, true, true]);
    expect(applyStyle(body, { coiffure: HAIR.afro, barbe: BEARD.taillee })).toBe(false);          // already applied
    group.children[3].visible = true;                                                          // a kufi on: the hair stays as it is
    applyStyle(body, { coiffure: HAIR.courte, barbe: BEARD.rasee }); expect([short.visible, puff.visible, beard.visible]).toEqual([false, true, false]);
  });
});

describe('prayer times (Wolof names, city hours)', () => {
  it('five times; the congregation gathers half an hour before to an hour after', () => {
    expect(PRAYER_TIMES.map(p => p.name)).toEqual(['Fajar', 'Tisbaar', 'Takusaan', 'Timis', 'Gee']);
    expect(prayerAt(13.6)?.id).toBe('tisbaar'); expect(prayerAt(14.9)?.id).toBe('tisbaar'); expect(prayerAt(15.2)).toBeNull();
    expect(prayerAt(20.4)?.id).toBe('gee');                                                    // overlapping windows: the closest
    expect(nextPrayer(21).id).toBe('fajar'); expect(nextPrayer(10).id).toBe('tisbaar');
    expect(prayerPeaks()[0]).toEqual([5.5, 7]); expect(hourLabel(19.25)).toBe('19 h 15'); expect(hourLabel(6)).toBe('6 h');
  });
});

describe('venue people talk: short everyday lines', () => {
  it('the imam gives the times and greets in Wolof; the owner explains his ladder and his special', () => {
    const times = imamTimes({ imam: 'Imam Seck', visits: 0, hour: 14, helped: 0 });
    for (const p of PRAYER_TIMES) expect(times).toContain(p.name);
    expect(times).toContain('en ce moment');
    expect(imamGreeting({ imam: 'Imam Seck', visits: 0, hour: 9, helped: 0 })).toContain('Maleekum salaam');
    const c = { owner: 'Pathé', place: 'Chez Pathé', meals: 0, shifts: 0, hour: 13, day: 2, talks: 0, regularAt: 5 };
    expect(ownerGreeting(c)).toContain('Salaam aleekum');
    expect(ownerGreeting({ ...c, meals: 5 })).toContain('habitué');
    expect(ownerWork({ ...c, shifts: 3 })).toContain('Tenir le grill');
    expect(ownerSpecial(c)).toContain(T.dibiSpecial(2).label.toLowerCase());
  });
});

describe('seats: floor places and their pose', () => {
  it('a prayer row kneels with its origin on the floor; other seats sit', () => {
    const row = { top: floorSeatTop(0.1), clip: 'Kneel' as const };
    expect(sitOriginY(row)).toBeCloseTo(0.1); expect(row.top).toBeCloseTo(0.1 + SIT_HIPS);
    expect(seatClip(row)).toBe('Kneel'); expect(seatClip({})).toBe('Sit');
  });
  it('the venues compose their own sites', () => {
    expect(isComposed('pikine', 'dibiterie:11')).toBe(true); expect(isComposed('plateau', 'mosque:11')).toBe(true);
    expect(isComposed('corniche', 'dibiterie:11')).toBe(false);
    for (const list of Object.values(COMPOSED_SITES)) for (const k of list!) expect(k).toMatch(/^(dibiterie|mosque):\d\d$/);
  });
});

describe('club (La Vague): a night out with a reason to come back', () => {
  const counters: Record<string, number> = {};
  let hour = 23, day = 10;
  const done: string[] = [];
  const keys = T.clubCounters('al:club');
  const hooks: T.PlaceHooks = { count: k => counters[k] ?? 0, hour: () => hour, day: () => day, converse: () => {}, tired: () => null,
    done: a => { done.push(a); if (a === 'entree') counters[keys.paid] = T.clubNight(day, hour) + 1; if (a === 'concours') counters[keys.contestNight] = T.clubNight(day, hour) + 1; } };
  const place = T.club({ id: 'al:club', name: 'La Vague', space: 'street', bar: { x: 8, z: 0, r: 4 }, anchors: [A('door', 0, 10), A('floor'), A('bar', 8), A('dj', 0, -5)] }, hooks);
  const visible = (anchor: string) => place.offers[anchor].filter(o => !o.visible || o.visible()).map(o => o.id);
  const offer = (anchor: string, id: string) => place.offers[anchor].find(o => o.id === id)!;
  const reset = () => { for (const k of Object.keys(counters)) delete counters[k]; done.length = 0; hour = 23; day = 10; };

  it('opens at night only (21 h–5 h), crowded after midnight, with a location chat; a night runs past midnight', () => {
    expect(place.hours).toEqual([21, 5]); expect(place.chat).toBe(true); expect(place.type).toBe('club');
    expect(isPeak(place, 1)).toBe(true); expect(isPeak(place, 21.5)).toBe(false);
    expect(T.clubNight(10, 23)).toBe(10); expect(T.clubNight(11, 2)).toBe(10); expect(T.clubNight(11, 21)).toBe(11);
    // closed by day: the sheet gives the reason
    const r = rig(); const places = new Places(r.runner, () => 13); places.add(place);
    const out: Target[] = []; places.collect('street', 0, 10, out);
    expect(out[0].affordances()[0].disabled).toBe('Fermé · ouvre à 21 h');
  });
  it('a theme each night, a week of seven, one contest night; the programme starts tonight', () => {
    expect(T.CLUB_THEMES).toHaveLength(7); expect(T.CLUB_THEMES.filter(t => t.contest)).toHaveLength(1);
    const k = T.nightsToContest(10); expect(T.clubTheme(10 + k).contest).toBe(true); expect(k).toBeGreaterThanOrEqual(0);
    expect(T.clubTheme(-3)).toBe(T.clubTheme(4));
    const p = programme(10); expect(p).toHaveLength(7); expect(p[0]).toBe(`Ce soir · ${T.clubTheme(10).label}`); expect(p[1]).toMatch(/^Demain/);
    expect(djContest({ night: 10, hour: 22, nights: 0, regularAt: 3, entry: 2000 })).toMatch(/Trois passages/);
  });
  it('the entry is paid once a night at the door; until then the floor, the bar and the DJ send you to the door', () => {
    reset();
    expect(visible('door')).toEqual(['payer', 'videur']);
    expect(offer('door', 'payer').price).toBe(T.CLUB_ENTRY);
    for (const [a, id] of [['floor', 'danser'], ['bar', 'bissap'], ['dj', 'morceau']] as const) expect(offer(a, id).requires!()).toBe('Paie l’entrée à la porte');
    const r = rig(); r.runner.start(offer('door', 'payer')); run(r.runner, 2);
    expect(r.state.wallet).toBe(10000 - T.CLUB_ENTRY); expect(done).toEqual(['entree']); expect(r.state.data.counters[keys.nights]).toBe(1);
    counters[keys.nights] = 1;
    expect(visible('door')).toEqual(['videur']);
    expect(offer('floor', 'danser').requires!()).toBeNull(); expect(offer('bar', 'bissap').requires!()).toBeNull();
    day = 11; hour = 21.5; expect(visible('door')).toEqual(['payer', 'videur']);             // the next night, pay again
  });
  it('after three nights the doorman lets a regular in free', () => {
    reset(); counters[keys.nights] = T.CLUB_REGULAR;
    expect(visible('door')).toEqual(['entree_habitue', 'videur']); expect(offer('door', 'entree_habitue').price).toBeUndefined();
    expect(doormanGreeting({ night: 10, hour: 23, nights: 3, regularAt: 3, entry: 2000 })).toContain('Sama xarit');
    expect(doormanRegulars({ night: 10, hour: 23, nights: 1, regularAt: 3, entry: 2000 })).toContain('Encore 2 soirées');
  });
  it('dancing is two timing gestures on the drum, the second faster, with the dance clips', () => {
    reset(); counters[keys.paid] = 11;
    const d = offer('floor', 'danser');
    expect(d.steps.map(s => s.clip)).toEqual(['Dance_A', 'Dance_B']);
    const g = d.steps.map(s => s.gesture!);
    expect(g.every(x => x.kind === 'timing')).toBe(true);
    expect((g[1] as { speed: number }).speed).toBeGreaterThan((g[0] as { speed: number }).speed);
    expect(G.dance()).toMatchObject({ kind: 'timing', verb: 'Pas' });
    expect(d.steps[1].effects).toMatchObject({ needs: { moral: 12, social: 10, energie: -8 }, counters: { [keys.dances]: 1 }, category: 'loisir' });
    expect(d.detail).toContain(T.clubTheme(10).label);
    const r = rig(); r.runner.start(d); run(r.runner, 10);
    expect(r.runner.running).toBe(false); expect(r.clips).toContain('Dance_B'); expect(done).toEqual(['danse']);
  });
  it('the dance contest: the theme night only, after 23 h, three faster rounds, prize scaled by the dance, once a night', () => {
    reset();
    const night = T.nightsToContest(10) + 10; day = night; hour = 22; counters[keys.paid] = night + 1;
    expect(visible('floor')).toEqual(['danser']);
    hour = 23.5; expect(visible('floor')).toEqual(['danser', 'concours']);
    day = night + 1; counters[keys.paid] = night + 2; expect(visible('floor')).toEqual(['danser']); day = night; counters[keys.paid] = night + 1;
    const c = offer('floor', 'concours');
    const speeds = c.steps.map(s => (s.gesture as { speed: number }).speed); expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
    const r = rig(); r.runner.start(c); run(r.runner, 20);
    expect(r.state.wallet).toBe(10000 + T.CONTEST_ROUNDS.reduce((t, x) => t + gesturePay(x.prize, 0.6), 0));
    expect(done).toEqual(['concours']);
    expect(c.requires!()).toMatch(/déjà dansé au concours ce soir/);
  });
  it('the bar: juices of Dakar on a free stool near the counter (no alcohol); the DJ plays your song', () => {
    reset(); counters[keys.paid] = 11;
    expect(visible('bar')).toEqual([...T.CLUB_DRINKS.map(d => d.id), 'barman']);
    for (const d of T.CLUB_DRINKS) expect(d.label).not.toMatch(/bière|vin|whisky|alcool/i);
    expect(offer('bar', 'bissap').steps.find(s => s.primitive === 'sit')!.seat).toEqual({ near: { x: 8, z: 0 }, r: 4, kind: 'stool' });
    const r = rig(); r.runner.start(offer('dj', 'morceau')); run(r.runner, 3);
    expect(r.state.wallet).toBe(9500); expect(done).toEqual(['morceau']);
  });
});

describe('club MVP: the fee before paying, table service, the crowd by the hour, the way out', () => {
  const counters: Record<string, number> = {};
  const done: string[] = []; let asked = 0;
  const keys = T.clubCounters('al:club2');
  const hooks: T.PlaceHooks = { count: k => counters[k] ?? 0, hour: () => 23.5, day: () => 10, enter: () => { asked++; }, done: a => { done.push(a); if (a === 'entree') counters[keys.paid] = 11; } };
  const place = T.club({ id: 'al:club2', name: 'La Vague', space: 'al:venue:club', bar: { x: 8, z: 0 }, lounge: { x: -11, z: 0, r: 5 },
    anchors: [A('door', 0, 10, { space: 'street' }), A('floor'), A('bar', 8), A('lounge', -9), A('exit', 0, 7)] }, hooks);
  const visible = (anchor: string) => place.offers[anchor].filter(o => !o.visible || o.visible()).map(o => o.id);
  it('« Entrer » asks first: the place shows the fee, nothing is paid until « payer » runs', () => {
    expect(visible('door')).toEqual(['entree']);
    const entree = place.offers.door.find(o => o.id === 'entree')!;
    expect(entree.price).toBeUndefined(); expect(entree.detail).toMatch(/Entrée 2\s000\sF, une fois pour la nuit/);
    const r = rig('street'); r.runner.start(entree); run(r.runner, 1);
    expect(asked).toBe(1); expect(r.state.wallet).toBe(10000);
    r.runner.start({ ...place.offers.door.find(o => o.id === 'payer')!, visible: undefined }); run(r.runner, 2);   // what the confirmation runs
    expect(r.state.wallet).toBe(10000 - T.CLUB_ENTRY); expect(done).toEqual(['entree']); expect(visible('door')).toEqual([]);
    expect(doormanAsk({ night: 10, hour: 23, nights: 0, regularAt: 3, entry: T.CLUB_ENTRY })).toMatch(/2000 F, une seule fois pour toute la nuit/);
  });
  it('table service: sit at a free lounge table first, then the waiter brings the drink (bar prices)', () => {
    const t = place.offers.lounge.find(o => o.id === 'table_bissap')!;
    expect(t.price).toBe(T.CLUB_DRINKS[0].price);
    expect(t.steps.map(s => s.primitive)).toEqual(['sit', 'wait', 'drink']);
    expect(t.steps[0].seat).toEqual({ near: { x: -11, z: 0 }, r: 5, kind: 'bench' }); expect(t.steps[1].label).toBe(T.TABLE_SERVICE);
    const r = rig('al:venue:club');
    const bench: Seat = { id: 'b1', x: -11, z: 1, top: 0.6, yaw: 0, kind: 'bench', space: 'al:venue:club', occupant: null };
    const npc: Seat = { ...bench, id: 'b0', z: 0, occupant: null };
    r.seats.add(npc); r.seats.add(bench); r.seats.occupy('b0', 'club:lounge0');
    r.at(-10, 0); r.runner.start(t); run(r.runner, 8);
    expect(r.seated()?.id).toBe('b1');                                          // never the clubber's place
    r.runner.start(place.offers.lounge.find(o => o.id === 'table_eau')!); run(r.runner, 1);
    expect(r.seated()?.id).toBe('b1');                                          // a second drink: same table, no seat hopping
  });
  it('the crowd follows the hour: closed by day, early, building, the peak after midnight, thinning at dawn', () => {
    expect([13, 21.5, 23.5, 1, 3.8, 5].map(T.clubCrowd)).toEqual(['closed', 'early', 'warm', 'peak', 'dawn', 'closed']);
    expect(T.isEvening(1)).toBe(true); expect(isPeak(place, 1)).toBe(true); expect(isPeak(place, 22)).toBe(false);
  });
  it('« Sortir » by the gate hands over to the place', () => {
    const out = place.offers.exit[0]; expect(out.primitive).toBe('exit');
    const r = rig('al:venue:club'); r.runner.start(out); expect(done).toContain('sortie');
  });
  it('clubbers speak French with everyday Wolof from the lexicon', () => {
    unknownPhrases.clear();
    expect(clubberHello('Ndeye', 'early', true)).toMatch(/Na nga def \?/); expect(clubberHello('Ndeye', 'early', true)).toContain('Moi c’est Ndeye');
    expect(clubberHello('Pape', 'dawn', false)).toContain('Dama sonn');
    expect(clubberTonight(T.nightsToContest(10) + 10, 23.5)).toContain('Le concours a commencé');
    expect(clubberBye('dawn')).toContain('Ñibbil ak jàmm');
    expect([...unknownPhrases]).toEqual([]);
  });
});
