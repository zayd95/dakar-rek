import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { LEGACY_SAVE_KEY, SAVE_KEY, loadSave, newSave, writeSave, type KV } from '../src/core/save';
import { Relations } from '../src/social/relations';
import { recordFreeService, recordService, recordVisit, updateRegular, isRegular, familiarity, lastMemory, greeting, boutWithin } from '../src/social/memory';
import { markWalkup, tierOf, walkupLine, wuKey } from '../src/social/walkup';
import { profileOf } from '../src/social/profiles';
import { CAST } from '../src/social/cast';

/**
 * M1-C, C2: familiar people greet the player as they walk up, remember favours and bouts, and none of it can be farmed.
 * The rules are pure (src/social/walkup.ts, memory.ts); the real game is checked on a phone by scripts/check-recognition.mjs.
 */
const fresh = () => { const s = new GameState(newSave(0)); return { s, r: new Relations(s.data) }; };
const mem = (m = new Map<string, string>()): KV => ({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const bout = (s: GameState, day: number, res: 'V' | 'D' | 'N' | 'A') => { s.data.career.bouts.push({ at: 0, day, mode: 'classe', opp: 'Lamine', style: 'Frappeur', level: 2, res, how: 'décision', purse: 0, pts: 1 }); };
const DAY = 40, H = 11;
const say = (id: string, s: GameState, r: Relations, day = DAY, hour = H) => { const w = walkupLine(id, s, r, day, hour); if (w) markWalkup(id, w, s, day, hour); return w; };

describe('who greets', () => {
  it('a stranger is not greeted: nobody says anything to someone they have not met', () => {
    const { s, r } = fresh();
    for (const c of CAST) expect(`${c.id} ${walkupLine(c.id, s, r, DAY, H)}`).toBe(`${c.id} null`);
  });
  it('one visit makes a known face; three a regular; a friendship a friend (the general lines)', () => {
    const { s, r } = fresh();
    recordVisit(s, 'adja', DAY * 24 + 9);
    expect(tierOf('adja', s, r)).toBe('known');
    const w = walkupLine('adja', s, r, DAY, H); expect(w).not.toBeNull(); expect(w!.line.length).toBeLessThan(60);
    recordService(s, 'adja'); recordService(s, 'adja'); updateRegular(s, r, 'adja');
    expect(tierOf('adja', s, r)).toBe('regular');
    r.change('player', 'adja', 40); expect(tierOf('adja', s, r)).toBe('friend');
  });
});

describe('a different reaction on return', () => {
  it('a stranger, a known face and a regular get three different things from Mamadou', () => {
    const a = fresh(), b = fresh(), c = fresh();
    recordVisit(b.s, 'mamadou', 1);
    for (let i = 0; i < 3; i++) { recordService(c.s, 'mamadou'); updateRegular(c.s, c.r, 'mamadou'); }
    expect(walkupLine('mamadou', a.s, a.r, DAY, H)).toBeNull();
    const known = walkupLine('mamadou', b.s, b.r, DAY, 13)!, regular = walkupLine('mamadou', c.s, c.r, DAY, 13)!;
    expect(known.key).not.toBe(regular.key);
    expect(regular.line).not.toBe(known.line);
  });
  it('the same person says something different once the player is a regular (menu greeting too)', () => {
    const a = fresh(), b = fresh();
    for (let i = 0; i < 3; i++) { recordService(b.s, 'mamadou'); updateRegular(b.s, b.r, 'mamadou'); }
    const p = profileOf('mamadou')!;
    expect(greeting(p, { id: 'mamadou', s: a.s, r: a.r, hour: 11, day: DAY }).line).not.toBe(greeting(p, { id: 'mamadou', s: b.s, r: b.r, hour: 11, day: DAY }).line);
  });
});

describe('a remembered favour changes a later encounter', () => {
  it('Mame thanks the player for the gas bottle, once; the regular line follows on the next visits', () => {
    const { s, r } = fresh();
    r.set('mame_helped'); recordVisit(s, 'mame', 1);
    const first = say('mame', s, r, DAY, 8)!;
    expect(first.key).toBe('helped'); expect(first.line).toContain('bonbonne');
    const later = say('mame', s, r, DAY + 1, 8);
    expect(later?.key).not.toBe('helped');                                                      // the thanks are said once
  });
  it('Babacar who owes a meal says so until the favour is paid back, then that they are quits', () => {
    const { s, r } = fresh();
    recordVisit(s, 'babacar', 1);
    r.set('babacar_doit');
    expect(say('babacar', s, r, DAY, 9)!.line).toContain('Maïga');
    r.set('babacar_rendu');
    const w = say('babacar', s, r, DAY + 1, 9)!;
    expect(w.key).toBe('repaid');
  });
  it('the favour is in the sheet’s memory too', () => {
    const { s, r } = fresh();
    r.set('mame_helped'); recordVisit(s, 'mame', 1);
    expect(lastMemory('mame', s, r, 12, DAY)).toContain('bonbonne');
  });
});

describe('wrestling results change how people greet', () => {
  it('a win and a loss are greeted differently, and only for a couple of days', () => {
    const w = fresh(), l = fresh();
    for (const x of [w, l]) recordVisit(x.s, 'ibou', 1);
    bout(w.s, DAY, 'V'); bout(l.s, DAY, 'D');
    const win = walkupLine('ibou', w.s, w.r, DAY, H)!, loss = walkupLine('ibou', l.s, l.r, DAY, H)!;
    expect(win.key).toBe('won'); expect(loss.key).toBe('lost'); expect(win.line).not.toBe(loss.line);
    expect(walkupLine('ibou', w.s, w.r, DAY + 3, H)!.key).not.toBe('won');                      // a few days later: back to normal
  });
  it('a draw or an abandoned bout is not a result people cheer or console', () => {
    const { s, r } = fresh(); recordVisit(s, 'ibou', 1);
    bout(s, DAY, 'N'); expect(boutWithin(s, DAY, 'V', 2)).toBe(false); expect(boutWithin(s, DAY, 'D', 2)).toBe(false);
    expect(walkupLine('ibou', s, r, DAY, H)!.key).not.toMatch(/won|lost/);
  });
  it('the menu greeting and the sheet’s memory follow the last bout', () => {
    const { s, r } = fresh(); recordVisit(s, 'modou', 1); bout(s, DAY, 'V');
    expect(greeting(profileOf('modou')!, { id: 'modou', s, r, hour: 11, day: DAY }).line).toContain('champion');
    expect(lastMemory('modou', s, r, 12, DAY)).toContain('victoire');
  });
  it('a bout of another city day long ago is not recent', () => {
    const { s } = fresh(); bout(s, 10, 'V');
    expect(boutWithin(s, 11, 'V', 2)).toBe(true); expect(boutWithin(s, 13, 'V', 2)).toBe(false); expect(boutWithin(s, 9, 'V', 2)).toBe(false);
  });
});

describe('no repetition, no farming', () => {
  it('a person greets at most once per city hour, however often the player walks past', () => {
    const { s, r } = fresh(); recordVisit(s, 'mamadou', 1);
    expect(say('mamadou', s, r, DAY, 12)).not.toBeNull();
    for (let i = 0; i < 20; i++) expect(walkupLine('mamadou', s, r, DAY, 12.5)).toBeNull();
    expect(walkupLine('mamadou', s, r, DAY, 13)).not.toBeNull();                                  // the next hour: again
  });
  it('never the same line twice in a row, over many hours', () => {
    const { s, r } = fresh(); for (let i = 0; i < 3; i++) { recordService(s, 'mamadou'); updateRegular(s, r, 'mamadou'); }
    let prev = '';
    for (let h = 0; h < 40; h++) { const w = say('mamadou', s, r, DAY + Math.floor(h / 8), 8 + (h % 8)); if (w) { expect(w.key).not.toBe(prev); prev = w.key; } }
  });
  it('walking up earns nothing: no relation, no familiarity, no counter of memory', () => {
    const { s, r } = fresh(); recordVisit(s, 'mamadou', 1);
    const before = { rel: r.level('mamadou'), fam: familiarity(s, 'mamadou'), flags: [...s.data.flags] };
    for (let h = 8; h < 20; h++) say('mamadou', s, r, DAY, h);
    expect(r.level('mamadou')).toBe(before.rel); expect(familiarity(s, 'mamadou')).toBe(before.fam); expect(s.data.flags).toEqual(before.flags);
    expect(Object.keys(s.data.counters).filter(k => k.startsWith('wu_')).length).toBeGreaterThan(0);
  });
  it('a free chat counts once per city hour: spamming « Discuter » does not make a regular', () => {
    const { s, r } = fresh();
    for (let i = 0; i < 12; i++) { recordFreeService(s, 'mame', DAY * 24 + 10); updateRegular(s, r, 'mame'); }
    expect(s.data.counters.served_mame).toBe(1); expect(isRegular(s, 'mame')).toBe(false);
    recordFreeService(s, 'mame', DAY * 24 + 11); recordFreeService(s, 'mame', DAY * 24 + 12);
    expect(updateRegular(s, r, 'mame')).toBe(true);                                               // three different hours: a regular, as before
  });
  it('a paid service still counts every time (the money is the price)', () => {
    const { s } = fresh(); for (let i = 0; i < 3; i++) recordService(s, 'mamadou');
    expect(s.data.counters.served_mamadou).toBe(3);
  });
});

describe('persistence and reset', () => {
  it('what was said is in the save: after a reload the same hour is not greeted again, and once-lines stay used', () => {
    const store = mem(); const { s, r } = fresh();
    r.set('mame_helped'); recordVisit(s, 'mame', 1); say('mame', s, r, DAY, 8);
    expect(writeSave(store, s.data)).toBe(true);
    const back = new GameState(loadSave(store)!), r2 = new Relations(back.data);
    expect(walkupLine('mame', back, r2, DAY, 8.5)).toBeNull();
    expect(back.data.counters[wuKey.once('mame', 'helped')]).toBe(1);
    expect(walkupLine('mame', back, r2, DAY + 1, 8)?.key).not.toBe('helped');
  });
  it('the bout and the memory survive the v5 → v6 migration of an old save', () => {
    const store = mem(); const { s } = fresh();
    bout(s, DAY, 'V'); s.data.flags.push('mame_helped'); s.data.counters.visit_mame = 2;
    store.setItem(LEGACY_SAVE_KEY, JSON.stringify({ ...s.data, schemaVersion: 3 }));
    const back = loadSave(store)!; expect(back).not.toBeNull();
    const g = new GameState(back), r = new Relations(g.data);
    expect(boutWithin(g, DAY, 'V', 2)).toBe(true); expect(r.has('mame_helped')).toBe(true); expect(g.data.counters.visit_mame).toBe(2);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
  });
  it('New Game forgets all of it: a fresh save has no greeting counters and strangers again', () => {
    const { s, r } = fresh(); recordVisit(s, 'mamadou', 1); say('mamadou', s, r, DAY, 12);
    const g = new GameState(newSave(1)), r2 = new Relations(g.data);
    expect(walkupLine('mamadou', g, r2, DAY, 12)).toBeNull(); expect(Object.keys(g.data.counters).filter(k => k.startsWith('wu_'))).toEqual([]);
  });
});

describe('the lines themselves', () => {
  it('every character line is a few words, and ids are unique per character', () => {
    for (const id of ['ibou', 'modou', 'mame', 'mamadou', 'babacar', 'ablaye']) {
      const p = profileOf(id)!; expect(p.walkup?.length).toBeGreaterThan(2);
      const ids = p.walkup!.map(w => w.id); expect(new Set(ids).size).toBe(ids.length);
      for (const w of p.walkup!) expect(w.line.length).toBeLessThanOrEqual(80);
    }
  });
});
