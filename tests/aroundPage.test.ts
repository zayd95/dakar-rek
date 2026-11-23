import { describe, expect, it } from 'vitest';
import { AROUND_LIMIT, aroundKey, aroundPage, away, crowdWord, hourText, type AroundInput, type AroundSection } from '../src/game/aroundPage';

/**
 * « Autour de moi » (1.0.1, src/game/aroundPage.ts): the page is a pure assembly of the facts the game gathers. One action a row, the nearest first in
 * every section, the empty sections left out, the online rows replaced by one « Hors ligne » when the account is not connected (the rest still works).
 */
const base = (o: Partial<AroundInput> = {}): AroundInput => ({ net: null, job: null, tiak: [], camp: null, friends: [], places: [], activities: [], ...o });
const sec = (p: AroundSection[], id: AroundSection['id']) => p.find(s => s.id === id);
const offer = (id: string, dist: number | null, why: string | null = null) => ({ id, title: `Route ${id}`, type: 'Repas', pay: 1200, dist, why });
const place = (key: string, dist: number | null, here = false) => ({ key, icon: '🍢', name: `Lieu ${key}`, line: 'Ouvert', dist, here });
const activity = (key: string, dist: number | null, here = false, start = true, why: string | null = null) => ({ key, icon: '💃', label: `Faire ${key}`, place: 'Place', dist, here, start, why });

describe('« Autour de moi »: the page', () => {
  it('nothing known: no section at all (the screen says so in one line)', () => {
    expect(aroundPage(base())).toEqual([]);
  });

  it('every section is sorted nearest first, what has no distance last, and capped', () => {
    const p = aroundPage(base({
      tiak: [offer('c', 300), offer('a', 40), offer('x', null), offer('b', 120), offer('d', 900), offer('e', 1500), offer('f', 20)],
      places: [place('far', 800), place('near', 30), place('mid', 200), place('unknown', null), place('p5', 400), place('p6', 500), place('p7', 600), place('p8', 650), place('p9', 700)],
      activities: [activity('z', 700), activity('y', 10)],
    }));
    expect(p.map(s => s.id)).toEqual(['tiak', 'lieux', 'activites']);
    expect(sec(p, 'tiak')!.rows.map(r => r.key)).toEqual(['tiak:f', 'tiak:a', 'tiak:b', 'tiak:c', 'tiak:d']);
    expect(sec(p, 'tiak')!.rows.length).toBe(AROUND_LIMIT.tiak);
    expect(sec(p, 'lieux')!.rows.map(r => r.key)).toEqual(['lieu:near', 'lieu:mid', 'lieu:p5', 'lieu:p6', 'lieu:p7', 'lieu:p8', 'lieu:p9', 'lieu:far']);   // capped at 8: the unknown one goes
    expect(sec(p, 'activites')!.rows.map(r => r.key)).toEqual(['act:y', 'act:z']);
  });

  it('one action a row, in short French: « Accepter » a run (greyed with the reason when it waits), « Y aller » a place', () => {
    const p = aroundPage(base({ tiak: [offer('a', 80), offer('b', 60, 'Trop fatigué')], places: [place('dibi', 120)] }));
    const [b, a] = sec(p, 'tiak')!.rows;
    expect(a).toMatchObject({ label: 'Route a', act: { label: 'Accepter', do: { kind: 'tiak', id: 'a' } } });
    expect(a.detail).toMatch(/^Repas · 1\s200\sF · départ à 80\u00a0m$/);
    expect(a.act!.disabled).toBeUndefined();
    expect(b).toMatchObject({ why: 'Trop fatigué', act: { label: 'Accepter', disabled: true } });
    expect(sec(p, 'lieux')!.rows[0]).toMatchObject({ detail: 'Ouvert · à 120\u00a0m', act: { label: 'Y aller', do: { kind: 'go', key: 'dibi' } } });
    for (const s of p) for (const r of s.rows) expect(r.act ? 1 : 0).toBeLessThanOrEqual(1);
  });

  it('a run in hand: it alone, with « Y aller » (no other offer can be taken meanwhile)', () => {
    const p = aroundPage(base({ job: { title: 'Chez Mame → Boutique', next: 'Colis à prendre : Chez Mame', dist: 64 }, tiak: [offer('a', 10)] }));
    expect(sec(p, 'tiak')!.rows).toEqual([{ key: 'job', icon: '📦', label: 'En cours · Chez Mame → Boutique', detail: 'Colis à prendre : Chez Mame · à 60\u00a0m', act: { label: 'Y aller', do: { kind: 'job' } } }]);
  });

  it('offline: the online rows say « Hors ligne » once, the rest works', () => {
    const facts = base({
      net: 'offline', tiak: [offer('a', 50)], places: [place('dibi', 90)],
      camp: { matches: [{ match: 'm1', org: 'Awa', fee: 1000, left: 3 }], view: true, organise: true },
      friends: [{ tag: 't1', name: 'Moussa', dist: 12, district: null, sameDistrict: false }],
    });
    const p = aroundPage(facts);
    expect(p.map(s => s.id)).toEqual(['tiak', 'enligne', 'lieux']);
    const off = p.flatMap(s => s.rows).filter(r => /Hors ligne/.test(r.label + (r.detail ?? '')));
    expect(off).toHaveLength(1);
    expect(sec(p, 'enligne')!.rows[0]).toMatchObject({ label: 'Hors ligne' });
    expect(sec(p, 'enligne')!.rows[0].act).toBeUndefined();
    // a build without the server: no online rows at all (nothing to come back)
    expect(aroundPage({ ...facts, net: null }).map(s => s.id)).toEqual(['tiak', 'lieux']);
  });

  it('Grand Camp: the matches with « Voir » only where the phone has the app; « Organiser » alone when none is open; nothing when neither', () => {
    const m = [{ match: 'm2', org: 'Awa', fee: 1000, left: 3 }, { match: 'm3', org: 'Ibou', fee: 0, left: 1 }];
    let p = aroundPage(base({ net: 'online', camp: { matches: m, view: true, organise: true } }));
    expect(sec(p, 'camp')!.rows.map(r => [r.label, r.detail, r.act?.label])).toEqual([
      ['Match de Awa', '1\u202f000\u00a0F · 3 places', 'Voir'], ['Match de Ibou', 'Gratuit · 1 place', 'Voir'], ['Organiser un match', 'Ton droit d’entrée, tes équipes', 'Organiser']]);
    expect(sec(p, 'camp')!.rows[0].act!.do).toEqual({ kind: 'camp', match: 'm2' });
    p = aroundPage(base({ net: 'online', camp: { matches: m, view: false, organise: false } }));     // the Grand Camp app is not in this build yet
    expect(sec(p, 'camp')!.rows.map(r => r.act)).toEqual([undefined, undefined]);
    p = aroundPage(base({ net: 'online', camp: { matches: [], view: true, organise: true } }));
    expect(sec(p, 'camp')!.rows).toMatchObject([{ label: 'Organiser un match', detail: 'Aucun match ouvert dans le quartier' }]);
    expect(sec(aroundPage(base({ net: 'online', camp: { matches: null, view: false, organise: false } })), 'camp')).toBeUndefined();
  });

  it('friends online: « Rejoindre » where they share where they are (nearest first), « Message » otherwise', () => {
    const p = aroundPage(base({ net: 'online', friends: [
      { tag: 'a', name: 'Awa', dist: null, district: 'Plateau', sameDistrict: false },
      { tag: 'b', name: 'Bineta', dist: null, district: null, sameDistrict: false },
      { tag: 'c', name: 'Cheikh', dist: 35, district: null, sameDistrict: true },
      { tag: 'd', name: 'Dior', dist: null, district: null, sameDistrict: true },
    ] }));
    expect(sec(p, 'amis')!.rows.map(r => [r.label, r.detail, r.act?.label])).toEqual([
      ['Cheikh', 'à 40\u00a0m', 'Rejoindre'], ['Awa', 'à Plateau', 'Rejoindre'], ['Bineta', 'en ligne', 'Message'], ['Dior', 'dans le quartier', 'Rejoindre']]);
    expect(sec(p, 'amis')!.rows[2].act!.do).toEqual({ kind: 'message', tag: 'b', name: 'Bineta' });
  });

  it('where the player already is: a place says « tu y es » with no action; an activity offers « Commencer » (or waits with its reason)', () => {
    const p = aroundPage(base({
      places: [place('patio', 0, true)],
      activities: [activity('danse', 0, true, true, 'Entre d’abord'), activity('priere', 0, true, true), activity('attaya', 0, true, false), activity('peche', 150, false, true, 'Trop tard')],
    }));
    expect(sec(p, 'lieux')!.rows[0]).toMatchObject({ detail: 'Ouvert · tu y es' });
    expect(sec(p, 'lieux')!.rows[0].act).toBeUndefined();
    const rows = sec(p, 'activites')!.rows;
    expect(rows.map(r => r.key)).toEqual(['act:danse', 'act:priere', 'act:peche']);           // nothing the phone could start there: the action button is the way
    expect(rows[0]).toMatchObject({ why: 'Entre d’abord', act: { label: 'Commencer', disabled: true } });
    expect(rows[1]).toMatchObject({ act: { label: 'Commencer', do: { kind: 'start', key: 'priere' } } });
    expect(rows[2]).toMatchObject({ act: { label: 'Y aller' } });
    expect(rows[2].why).toBeUndefined();                                                      // away from it, its reason is not the player's to read yet
  });

  it('words: distances, hours, how full a place is; the key changes when a row does', () => {
    expect([away(4), away(64), away(995), away(1234)]).toEqual(['à côté', 'à 60\u00a0m', 'à 1,0\u00a0km', 'à 1,2\u00a0km']);
    expect([hourText(17), hourText(19.25), hourText(25)]).toEqual(['17 h', '19 h 15', '1 h']);
    expect([crowdWord(1), crowdWord(0.8), crowdWord(0.45), crowdWord(0.3), crowdWord(0)]).toEqual(['plein', 'du monde', 'du monde', 'quelques personnes', 'calme']);
    const a = aroundPage(base({ places: [place('x', 100)] })), b = aroundPage(base({ places: [place('x', 104)] })), c = aroundPage(base({ places: [place('x', 200)] }));
    expect(aroundKey(a)).toBe(aroundKey(b));                                                  // a few metres: the same page, not drawn again
    expect(aroundKey(a)).not.toBe(aroundKey(c));
  });
});
