import { describe, it, expect } from 'vitest';
import { hourText, tonightPage, weatherLine, type TonightInput } from '../src/arena/tonight';
import { weatherAt } from '../src/city/rules';
import { GALA } from '../src/arena/program';

const base: TonightInput = {
  day: 11, hour: 15, size: 'gala',
  bill: { left: { name: 'Babacar', ecurie: 'Baobab' }, right: { name: 'Lamine', ecurie: 'Teranga' } },
  tomorrow: { left: { name: 'Ousmane', ecurie: 'Baobab' }, right: { name: 'Daouda', ecurie: 'Teranga' }, size: 'gala', title: true },
  ticket: false, galaDone: false, fighter: null,
  hub: 'Pikine', gate: { dist: 212, inside: false },
  ride: { stop: 'Marché', dist: 64, fare: 150 },
  vehicles: [], after: { name: 'Dibiterie Chez Pathé', close: 2, dist: 58 }, weather: null, road: [],
};
const page = (o: Partial<TonightInput> = {}) => tonightPage({ ...base, ...o });
const sec = (p: ReturnType<typeof tonightPage>, title: string) => p.find(s => s.title === title);
const flat = (p: ReturnType<typeof tonightPage>) => p.flatMap(s => s.rows.map(r => `${r.label}${r.detail ? ' | ' + r.detail : ''}${r.go ? ' → ' + r.go : ''}`));

describe('« Ce soir »: tonight at the arena', () => {
  it('the card, its size, the doors and the ticket (with « Y aller » to the window in Pikine)', () => {
    const p = page();
    expect(p.map(s => s.title)).toEqual(['Ce soir à l’arène', 'Y aller', 'Après le combat']);
    const rows = flat(p);
    expect(rows[0]).toBe('Babacar – Lamine | Grand gala de lutte · Écurie Baobab contre Écurie Teranga');
    expect(rows[1]).toBe(`Portes à ${GALA.doors} h | Arène de Pikine · jusqu’à ${GALA.close} h`);
    expect(rows[2]).toMatch(/^Billet 1\s000\sF au guichet \| Le guichet ouvre à 17 h, à gauche de la porte → guichet$/);
    expect(flat(page({ hour: 18, ticket: true }))[2]).toBe('Ton billet : en poche ✓ | Entrée par la porte de l’arène');
    expect(flat(page({ size: 'card', bill: { ...base.bill, title: true } }))[0]).toMatch(/^Babacar – Lamine \| Combat de quartier · titre en jeu/);
  });
  it('the player on the card: their bout first, no ticket needed', () => {
    const rows = flat(page({ hour: 17.5, fighter: { opponent: 'Gora', kind: 'gala' } }));
    expect(rows[0]).toBe('Tu combats ce soir contre Gora | Ta place au gala · entrée des lutteurs, derrière l’arène (pas besoin de billet)');
    expect(rows.some(r => r.startsWith('Billet'))).toBe(false);
    expect(flat(page({ fighter: { opponent: 'Babacar', kind: 'title' } }))[0]).toMatch(/Combat pour le titre/);
    expect(flat(page({ fighter: { opponent: null, kind: null } }))[0]).toMatch(/^Tu combats ce soir \| Ton combat du soir/);
  });
  it('once the gala is over: tomorrow’s card, nothing to go to', () => {
    const p = page({ hour: 21, galaDone: true });
    expect(p.map(s => s.title)).toEqual(['Ce soir à l’arène', 'Après le combat']);
    expect(flat(p)[1]).toBe('Demain : Ousmane – Daouda | Grand gala de lutte · titre en jeu · samedi 17 h');   // day 12 is a Saturday
    expect(page({ hour: GALA.close }).map(s => s.title)).not.toContain('Y aller');
  });
});

describe('« Ce soir »: getting there, after, the day', () => {
  it('on foot with the distance, Ligne 23 from the nearest stop, one’s own vehicles', () => {
    const go = sec(page({ vehicles: [{ key: 'moto', label: 'Ta moto Jakarta', dist: 34 }, { key: 'car', label: 'Ta voiture', dist: null, hub: 'Plateau' }] }), 'Y aller')!;
    expect(go.rows.map(r => [r.label, r.detail, r.go ?? null])).toEqual([
      ['À pied', '210 m jusqu’à la porte', 'gate'],
      ['Car rapide · Ligne 23, arrêt « Arène »', expect.stringMatching(/^150\sF · monte à l’arrêt Marché, à 60 m$/), 'stop'],
      ['Ta moto Jakarta', 'Garée à 30 m', 'moto'],
      ['Ta voiture', 'Garée à Plateau', null],
    ]);
    expect(sec(page({ vehicles: [{ key: 'moto', label: 'Ta moto Jakarta', dist: null, riding: true }] }), 'Y aller')!.rows[2].label).toBe('Ta moto Jakarta : tu es dessus');
    expect(sec(page({ gate: { dist: 20, inside: true } }), 'Y aller')!.rows).toEqual([{ icon: '📍', label: 'Tu es à l’arène' }]);
    const away = sec(page({ hub: 'Plateau', gate: null, ride: null }), 'Y aller')!.rows[0];
    expect(away).toMatchObject({ label: 'Va à Pikine', open: 'carte' });
    expect(away.go).toBeUndefined();
  });
  it('after the bout: the place open late, its hours and how far from the arena', () => {
    expect(sec(page(), 'Après le combat')!.rows[0]).toMatchObject({ label: 'Dibiterie Chez Pathé', detail: 'ouvert jusqu’à 2 h · 60 m de l’arène', go: 'after' });
    expect(sec(page({ after: null }), 'Après le combat')).toBeUndefined();
  });
  it('the day’s weather and road events, one line each, only when there is one', () => {
    expect(sec(page(), 'Aujourd’hui à Pikine')).toBeUndefined();
    const p = page({ weather: 'Averse attendue vers 14 h, jusqu’à 15 h environ', road: [{ kind: 'checkpoint', from: 17, to: 21, dist: 140 }, { kind: 'travaux', from: 8, to: 17, dist: null }] });
    expect(sec(p, 'Aujourd’hui à Pikine')!.rows.map(r => `${r.label} | ${r.detail ?? ''}`)).toEqual([
      'Averse attendue vers 14 h, jusqu’à 15 h environ | ',
      'Contrôle de police | de 17 h jusqu’à 21 h · à 140 m',
      'Travaux | en ce moment jusqu’à 17 h',
    ]);
  });
  it('the weather line follows the city sky (the same for everyone)', () => {
    expect(hourText(14)).toBe('14 h'); expect(hourText(14.5)).toBe('14 h 30');
    // find a sunny day, an overcast day and a rainy day in the city's own weather
    const days = Array.from({ length: 200 }, (_, d) => d);
    const kindOf = (d: number) => (Array.from({ length: 72 }, (_, k) => weatherAt(d, 6 + k * 0.25).kind));
    const sunny = days.find(d => kindOf(d).every(k => k === 'sun'))!, rainy = days.find(d => kindOf(d).includes('rain'))!;
    expect(weatherLine(sunny, 10)).toBeNull();
    expect(weatherLine(rainy, 8)).toMatch(/^Averse attendue vers \d+ h/);
    const during = 6 + kindOf(rainy).indexOf('rain') * 0.25 + 0.3;
    expect(weatherLine(rainy, during)).toMatch(/^Averse en cours, jusqu’à/);
    const grey = days.find(d => !kindOf(d).includes('rain') && kindOf(d).includes('overcast'))!;
    expect(weatherLine(grey, 9)).toBe('Ciel couvert aujourd’hui');
    expect(weatherLine(grey, 14)).toBe('Ciel couvert cet après-midi');
  });
});
