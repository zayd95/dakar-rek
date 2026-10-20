import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Relations } from '../src/social/relations';
import { recordService, recordVisit, updateRegular } from '../src/social/memory';
import { ROUTINES, slotAt } from '../src/social/routines';
import { SITUATIONS, choicesFor, playSituation, sitCtx, situationFor, sitKey } from '../src/social/situations';
import { revisitReasons } from '../src/social/revisit';

/**
 * M1-C, C3: the neighbourhood's anchors — the boutique counter, the gargote at noon, the grand-place attaya, the garage bench —
 * each offer a short moment (once per city day, no mission, no reward beyond a good moment and a little esteem) that answers to
 * what the player has lived there. The places and hours come from the characters' routines; the real game is checked by
 * scripts/check-anchors.mjs.
 */
const fresh = () => { const s = new GameState(newSave(0)); return { s, r: new Relations(s.data) }; };
const sit = (id: string) => SITUATIONS.find(x => x.id === id)!;
const bout = (s: GameState, day: number, res: 'V' | 'D') => { s.data.career.bouts.push({ at: 0, day, mode: 'classe', opp: 'Lamine', style: 'Frappeur', level: 2, res, how: 'décision', purse: 0, pts: 1 }); };
const DAY = 30;
const regular = (s: GameState, r: Relations, id: string) => { for (let i = 0; i < 3; i++) { recordService(s, id); updateRegular(s, r, id); } };

describe('the anchors are reachable by the schedules', () => {
  const ANCHORS = ['boutique_comptoir', 'gargote_midi', 'attaya_place', 'garage_etabli'];
  it('for each anchor, its host really stands at its place during its hours', () => {
    for (const id of ANCHORS) {
      const x = sit(id), routine = ROUTINES.find(r => r.id === x.host)!;
      const hours = [];
      for (let h = x.hours[0]; h < x.hours[1]; h += 0.5) { const slot = slotAt(routine, h); if ((slot.place.id ?? slot.place.at) === x.at) hours.push(h); }
      expect(`${id} ${hours.length > 0}`).toBe(`${id} true`);
    }
  });
  it('the moment is offered when the host is at the place and not before or after', () => {
    const { s } = fresh();
    const at = (where: string) => (h: string) => (h === 'mamadou' ? where : null);
    expect(situationFor('mamadou', 10, at('boutique'), s, DAY)?.id).toBe('boutique_comptoir');
    expect(situationFor('mamadou', 21, at('boutique'), s, DAY)).toBeNull();                    // the shop is closed to moments after 19 h
    expect(situationFor('mamadou', 10, at('city:square'), s, DAY)).toBeNull();                 // not at the counter
  });
});

describe('a different moment for a different history', () => {
  it('the same counter, three players: a stranger, a regular who delivered the rice, a boxer back from the ring', () => {
    const a = fresh(), b = fresh(), c = fresh();
    regular(b.s, b.r, 'mamadou'); b.r.set('mamadou_trust');
    regular(c.s, c.r, 'mamadou'); bout(c.s, DAY, 'V');
    const text = (p: { s: GameState; r: Relations }) => sit('boutique_comptoir').text(sitCtx(sit('boutique_comptoir'), p.r, p.s, new Set(), DAY));
    const t = [text(a), text(b), text(c)];
    expect(new Set(t).size).toBe(3);
    expect(t[1]).toMatch(/riz/); expect(t[2]).toMatch(/combat/); expect(t[0]).not.toMatch(/riz|combat/);
  });
  it('the gargote greets the favour (the gas bottle), the win, the defeat, each differently', () => {
    const base = fresh(), helped = fresh(), won = fresh(), lost = fresh();
    helped.r.set('mame_helped'); bout(won.s, DAY, 'V'); bout(lost.s, DAY, 'D');
    const text = (p: { s: GameState; r: Relations }) => sit('gargote_midi').text(sitCtx(sit('gargote_midi'), p.r, p.s, new Set(['ablaye']), DAY));
    const all = [base, helped, won, lost].map(text);
    expect(new Set(all).size).toBe(4);
    expect(all[1]).toMatch(/place est gardée/); expect(all[2]).toMatch(/lutteur/); expect(all[3]).toMatch(/combat perdu/);
  });
  it('the garage remembers the job, the meal Babacar paid back, and the ring', () => {
    const t = (set: (p: { s: GameState; r: Relations }) => void) => { const p = fresh(); set(p); return sit('garage_etabli').text(sitCtx(sit('garage_etabli'), p.r, p.s, new Set(), DAY)); };
    const all = [t(() => {}), t(p => p.r.set('modou_trust')), t(p => p.r.set('babacar_rendu')), t(p => bout(p.s, DAY, 'V')), t(p => bout(p.s, DAY, 'D'))];
    expect(new Set(all).size).toBe(5);
  });
  it('the attaya tells a recent bout, and offers to tell it; nothing changes without one', () => {
    const calm = fresh(), won = fresh(); bout(won.s, DAY, 'V');
    const sc = sitCtx(sit('attaya_place'), calm.r, calm.s, new Set(['modou']), DAY), sw = sitCtx(sit('attaya_place'), won.r, won.s, new Set(['modou']), DAY);
    expect(choicesFor(sit('attaya_place'), sc).map(c => c.id)).not.toContain('raconter');
    expect(choicesFor(sit('attaya_place'), sw).map(c => c.id)).toContain('raconter');
    expect(sit('attaya_place').text(sw)).toMatch(/lutteur/);
  });
  it('a second visit remembers the first: the moment reads differently the next day', () => {
    const { s, r } = fresh();
    const g = sit('garage_etabli'), x1 = sitCtx(g, r, s, new Set(), DAY);
    playSituation(g, g.choices.find(c => c.id === 'pannes')!, x1);
    const x2 = sitCtx(g, r, s, new Set(), DAY + 1);
    expect(x2.times).toBe(1); expect(x2.last).toBe('pannes');
    expect(g.choices.find(c => c.id === 'pannes')!.reply).not.toBe(''); // the reply differs once told before
    const reply = (c: typeof g.choices[number], x: typeof x1) => (typeof c.reply === 'string' ? c.reply : c.reply(x));
    expect(reply(g.choices[1], x1)).not.toBe(reply(g.choices[1], x2));
  });
});

describe('no obligation, no farming', () => {
  it('each moment is played once per city day; the next day it is there again', () => {
    const { s } = fresh();
    const at = () => 'gargote';
    const g = sit('gargote_midi'), x = sitCtx(g, new Relations(s.data), s, new Set(), DAY);
    expect(situationFor('mame', 12, at, s, DAY)?.id).toBe('gargote_midi');
    playSituation(g, g.choices[0], x);
    expect(situationFor('mame', 12, at, s, DAY)).toBeNull();
    expect(situationFor('mame', 12, at, s, DAY + 1)?.id).toBe('gargote_midi');
    expect(s.data.counters[sitKey.day('gargote_midi')]).toBe(DAY);
  });
  it('a moment never takes money, never gives any, and moves relations by a little (no mission, no streak)', () => {
    for (const id of ['boutique_comptoir', 'gargote_midi', 'garage_etabli']) {
      for (const c of sit(id).choices) {
        expect(c.effects.money ?? 0).toBe(0);
        for (const [, , d] of c.effects.rel ?? []) expect(Math.abs(d)).toBeLessThanOrEqual(2);
        expect(c.effects.flags ?? []).toEqual([]);                                             // nothing is unlocked or owed by going
      }
    }
  });
  it('playing the same moment a hundred times over a hundred days stays bounded by the relation range', () => {
    const { s, r } = fresh(); const g = sit('garage_etabli');
    for (let d = 0; d < 100; d++) playSituation(g, g.choices[0], sitCtx(g, r, s, new Set(), DAY + d));
    expect(r.level('modou')).toBeLessThanOrEqual(100);
  });
});

describe('reasons to come back', () => {
  const where = () => 'à son poste';
  it('a stranger has none', () => {
    const { s, r } = fresh();
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 10, where })).toEqual([]);
  });
  it('someone you know has a moment at a known place now, or within a few hours — from the schedules, never invented', () => {
    const { s, r } = fresh(); recordVisit(s, 'mamadou', 1);
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 10, where })).toEqual(['Au comptoir de la Boutique Diallo : Mamadou est là']);
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 7, where }).join()).toMatch(/dès 9 h/);
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 23, where })).toEqual([]);          // nothing later tonight: none made up
    expect(revisitReasons({ s, r, hub: 'corniche', day: DAY, hour: 10, where })).toEqual([]);        // another hub: nothing here
  });
  it('a moment already lived today is not offered again; tomorrow it is', () => {
    const { s, r } = fresh(); recordVisit(s, 'mamadou', 1);
    s.data.counters[sitKey.day('boutique_comptoir')] = DAY;
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 10, where })).toEqual([]);
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY + 1, hour: 10, where }).length).toBe(1);
  });
  it('a favour someone owes is a reason, with where they are', () => {
    const { s, r } = fresh(); r.set('babacar_doit');
    const out = revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 12, where: () => 'à la Maïga du marché' });
    expect(out[0]).toMatch(/Babacar se souvient de toi/); expect(out[0]).toMatch(/Maïga/);
    r.set('babacar_rendu');
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 12, where }).join()).not.toMatch(/Babacar/);
  });
  it('at most three, and no offline time is counted: the same inputs always give the same reasons', () => {
    const { s, r } = fresh(); for (const id of ['mamadou', 'mame', 'modou', 'ibou']) recordVisit(s, id, 1);
    const a = revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 14, where });
    expect(a.length).toBeLessThanOrEqual(3);
    expect(revisitReasons({ s, r, hub: 'pikine', day: DAY, hour: 14, where })).toEqual(a);
  });
});
