import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { LEGACY_SAVE_KEY, SAVE_KEY, clearSave, loadSave, newSave, writeSave, type KV } from '../src/core/save';
import { Relations } from '../src/social/relations';
import { REGULAR_AT, isRegular, recordService, recordVisit, updateRegular } from '../src/social/memory';
import { shopRegular } from '../src/social/regular';
import { PROFILES, profileOf } from '../src/social/profiles';

/**
 * M1-C, first slice: Mamadou recognises a regular at Boutique Diallo (src/social/regular.ts). Nothing new is stored: the memory counters
 * and the regular flag the game already keeps decide, and the benefit is the neighbour price the profile already has.
 */
const BOUTIQUE = 'pikine:city:boutique:7';
const fresh = () => { const s = new GameState(newSave(0)); return { s, r: new Relations(s.data) }; };
/** One qualifying interaction at the shop, as the game records it (a purchase or a service at the owner's place), then the recognition check. */
const interact = (s: GameState, r: Relations, id = 'mamadou') => { recordService(s, id); return updateRegular(s, r, id); };
const mem = (m = new Map<string, string>()): KV => ({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });

describe('Mamadou recognises a regular', () => {
  it('a stranger gets the plain sheet: no greeting, both prices as they were', () => {
    const { s, r } = fresh();
    const v = shopRegular(BOUTIQUE, s, r, 11);
    expect(v.owner).toBe('mamadou'); expect(v.greeting).toBeNull(); expect(v.hide.size).toBe(0); expect(v.was).toEqual({});
  });
  it('the third qualifying interaction makes the customer a regular — not the first, not the second', () => {
    const { s, r } = fresh();
    expect(REGULAR_AT).toBe(3);
    expect(interact(s, r)).toBe(false); expect(isRegular(s, 'mamadou')).toBe(false); expect(shopRegular(BOUTIQUE, s, r, 11).greeting).toBeNull();
    expect(interact(s, r)).toBe(false); expect(isRegular(s, 'mamadou')).toBe(false);
    expect(interact(s, r)).toBe(true);  expect(isRegular(s, 'mamadou')).toBe(true);                  // the toast « te reconnaît » fires on this one
    expect(interact(s, r)).toBe(false);                                                               // …and only once
  });
  it('visits (a talk, once per city hour) and services (a purchase, a job) both count, together', () => {
    const { s, r } = fresh();
    expect(recordVisit(s, 'mamadou', 24 * 3 + 9)).toBe(true); expect(recordVisit(s, 'mamadou', 24 * 3 + 9)).toBe(false);   // the same city hour counts once
    recordService(s, 'mamadou'); expect(updateRegular(s, r, 'mamadou')).toBe(false);
    recordVisit(s, 'mamadou', 24 * 3 + 10); expect(updateRegular(s, r, 'mamadou')).toBe(true);
  });
  it('once a regular the sheet greets in a few words and the neighbour price replaces the full price, shown struck through', () => {
    const { s, r } = fresh();
    for (let i = 0; i < 3; i++) interact(s, r);
    const v = shopRegular(BOUTIQUE, s, r, 11);
    expect(v.greeting).toBeTruthy(); expect(v.greeting!.length).toBeLessThanOrEqual(45);            // a line, not a paragraph
    expect(v.greeting).toContain('habitué');
    expect([...v.hide]).toEqual(['sucre']);                                                           // the 300 F row is replaced…
    expect(v.was).toEqual({ sucre_voisin: 300 });                                                     // …by the 200 F row, with the 300 F it replaces
    const profile = profileOf('mamadou')!;
    expect(profile.perk!.cost).toBe(200); expect(profile.sells![0].cost).toBe(300);                   // the prices are the profile's own, unchanged
  });
  it('his relationship rose by the existing recognition bonus, nothing else moved', () => {
    const { s, r } = fresh(); const before = r.level('mamadou');
    for (let i = 0; i < 3; i++) interact(s, r);
    expect(r.level('mamadou')).toBe(before + 3);
    expect(Object.keys(s.data.counters).sort()).toEqual(['served_mamadou']);
  });
  it('a trusted customer (the rice delivery) is greeted with the neighbour price in his words', () => {
    const { s, r } = fresh(); s.data.flags.push('mamadou_trust');
    for (let i = 0; i < 3; i++) interact(s, r);
    expect(shopRegular(BOUTIQUE, s, r, 11).greeting).toContain('fidèle');
  });
  it('the neighbour price alone (a recommendation without the regular flag) still replaces the full price, with no greeting', () => {
    const { s, r } = fresh(); s.data.flags.push('mamadou_trust');
    const v = shopRegular(BOUTIQUE, s, r, 11);
    expect(v.greeting).toBeNull(); expect([...v.hide]).toEqual(['sucre']); expect(v.was).toEqual({ sucre_voisin: 300 });
  });
});

describe('no effect on anyone else, nor on another shop', () => {
  it('three interactions with Mamadou make nobody else a regular', () => {
    const { s, r } = fresh();
    for (let i = 0; i < 5; i++) interact(s, r);
    for (const p of PROFILES.filter(x => x.id !== 'mamadou')) { expect(`${p.id} ${isRegular(s, p.id)}`).toBe(`${p.id} false`); expect(r.level(p.id)).toBe(new Relations(newSave(0)).level(p.id)); }
  });
  it('another shopkeeper\'s own place is unchanged by Mamadou\'s regular, and a place with no owner has nothing', () => {
    const { s, r } = fresh();
    for (let i = 0; i < 3; i++) interact(s, r);
    for (const p of PROFILES.filter(x => x.id !== 'mamadou' && x.place)) {
      const v = shopRegular(p.place!, s, r, 11);
      expect(`${p.id} ${v.greeting} ${v.hide.size}`).toBe(`${p.id} null 0`);
    }
    expect(shopRegular('pikine:cafe:02', s, r, 11)).toMatchObject({ owner: null, greeting: null });
  });
  it('another character who is a regular elsewhere does not give Mamadou\'s sheet a greeting', () => {
    const { s, r } = fresh();
    for (let i = 0; i < 4; i++) { recordService(s, 'mame'); updateRegular(s, r, 'mame'); }
    expect(isRegular(s, 'mame')).toBe(true);
    const v = shopRegular(BOUTIQUE, s, r, 11); expect(v.greeting).toBeNull(); expect(v.hide.size).toBe(0);
  });
});

describe('persistence and reset', () => {
  it('the recognition is in the v6 save: it survives a reload, with the counters', () => {
    const store = mem(); const { s, r } = fresh();
    for (let i = 0; i < 3; i++) interact(s, r);
    expect(writeSave(store, s.data)).toBe(true);
    const back = new GameState(loadSave(store)!); const r2 = new Relations(back.data);
    expect(isRegular(back, 'mamadou')).toBe(true);
    const v = shopRegular(BOUTIQUE, back, r2, 11); expect(v.greeting).toBeTruthy(); expect(v.was).toEqual({ sucre_voisin: 300 });
    expect(back.data.counters.served_mamadou).toBe(3); expect(r2.level('mamadou')).toBe(r.level('mamadou'));
  });
  it('two interactions before the reload are remembered: the third, after it, is the one that counts', () => {
    const store = mem(); const { s, r } = fresh();
    interact(s, r); interact(s, r); writeSave(store, s.data);
    const back = new GameState(loadSave(store)!); const r2 = new Relations(back.data);
    expect(isRegular(back, 'mamadou')).toBe(false);
    expect(interact(back, r2)).toBe(true);
  });
  it('New Game forgets it: a fresh save has no memory of Mamadou, and the old save is not imported again', () => {
    const store = mem(); const { s, r } = fresh();
    for (let i = 0; i < 3; i++) interact(s, r);
    writeSave(store, s.data); store.setItem(LEGACY_SAVE_KEY, JSON.stringify({ schemaVersion: 3, flags: ['regular_mamadou'], counters: { served_mamadou: 9 } }));
    clearSave(store);
    expect(store.getItem(SAVE_KEY)).toBeNull(); expect(loadSave(store)).toBeNull();
    const g = new GameState(newSave(1)); const r3 = new Relations(g.data);
    expect(isRegular(g, 'mamadou')).toBe(false); expect(shopRegular(BOUTIQUE, g, r3, 11).greeting).toBeNull(); expect(g.data.counters.served_mamadou).toBeUndefined();
  });
});
