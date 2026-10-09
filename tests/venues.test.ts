import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats, floorSeatTop, seatClip, sitOriginY, SIT_HIPS, type Seat } from '../src/interact/seats';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import { Places, isPeak } from '../src/activity/places';
import * as T from '../src/activity/templates';
import type { Target } from '../src/interact/types';
import { GrillShift, doneness, shiftPay, GOLDEN, BURNT } from '../src/venues/grill';
import { PRAYER_TIMES, prayerAt, nextPrayer, prayerPeaks, hourLabel } from '../src/venues/prayer';
import { imamTimes, imamGreeting, ownerGreeting, ownerWork, ownerSpecial } from '../src/venues/talk';
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

describe('grill shift: a gesture with a rule, not a progress bar', () => {
  it('reads the skewer: raw, golden, overcooked, burnt', () => {
    expect(doneness(0.3)).toBe('cru'); expect(doneness(GOLDEN[0])).toBe('dore'); expect(doneness(0.9)).toBe('trop'); expect(doneness(BURNT)).toBe('brule');
  });
  it('flipping too early does nothing, golden scores 1, late 0.6; a forgotten skewer burns and the next one goes on', () => {
    const g = new GrillShift({ skewers: 3, seconds: 2 });
    g.update(0.5); expect(g.flip()).toBe('trop_tot'); expect(g.i).toBe(0);
    g.update(0.9); expect(g.flip()).toBe('parfait'); expect(g.i).toBe(1); expect(g.t).toBe(0);
    g.update(1.9); expect(g.flip()).toBe('trop_cuit');
    let burnt = null; for (let k = 0; k < 40 && !burnt; k++) burnt = g.update(0.1);
    expect(burnt).toBe('brule'); expect(g.done).toBe(true);
    expect(g.points).toBeCloseTo(1.6); expect(g.golden).toBe(1);
    expect(g.flip()).toBeNull();
  });
  it('pays 40 % for showing up and the rest for quality', () => {
    expect(shiftPay(900, 4, 4)).toBe(900);
    expect(shiftPay(900, 0, 4)).toBe(350);
    expect(shiftPay(1800, 2.6, 5)).toBe(1300);
  });
});

describe('Dibi recipe: why return tomorrow', () => {
  const counters: Record<string, number> = {};
  let hour = 13, day = 3, played: T.PlayJob | null = null;
  const hooks: T.PlaceHooks = { count: k => counters[k] ?? 0, hour: () => hour, day: () => day, converse: () => {}, playJob: j => { played = j; }, tired: e => (e > 50 ? 'fatigué' : null) };
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
  it('with a module that plays it, the grill job is handed over as a gesture (and the rung’s data goes with it)', () => {
    const r = rig(); const g = place.offers.grill[0];
    expect(g.primitive).toBe('work'); expect(g.quiet).toBe(true);
    r.runner.start(g); expect(played).toMatchObject({ id: 'aide', skewers: 4, counter: keys.grill });
    const timed = T.dibi({ id: 'x', name: 'x', space: 'street', anchors: [A('counter'), A('grill', 6)] }).offers.grill[0];
    expect(timed.steps[0].effects?.money).toBe(900);                                            // without the hook: a timed shift
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
