import { describe, expect, it } from 'vitest';
import { newPistes, offerNow, openPistes, pistes, pistesOf, type PisteFacts } from '../src/economy/pistes';

/** « Mes pistes » (src/economy/pistes.ts): leads from the real situation only; dismissed ones stay away until it changes; one street offer per facts. */
const SARR = { id: 'teranga:dealer:pikine', hub: 'pikine' as const, name: 'Sarr Auto' };
const BANK = { id: 'pikine:city:bank', hub: 'pikine' as const, name: 'Banque Teranga · Pikine' };
const base = (o: Partial<PisteFacts> = {}): PisteFacts => ({
  hub: 'pikine', hour: 11, wallet: 3000, savings: 0, deliveries: 0, vtcTrips: 0, cars: 0,
  sarr: { place: SARR, refusal: 'trust' }, bank: { place: BANK, opened: false }, ventures: 0, bana: { price: 50_000, place: null },
  furniture: 3, cheapestFurniture: 2500, furnitureShop: { id: 'keur_meubles', hub: 'pikine', name: 'Keur Meubles' },
  needs: { social: 60, moral: 70 }, square: { id: 'pikine:city:square', hub: 'pikine', name: 'Grand-place de Pikine' }, variety: [], ...o,
});
const ids = (f: PisteFacts) => pistes(f).map(p => p.id);

describe('Mes pistes: what is suggested', () => {
  it('a beginner with 3 000 F and nothing done gets nothing to chase: the city is free to explore', () => {
    expect(pistes(base())).toEqual([]);
  });

  it('after real work and with no car, Pape Sarr is suggested, in words that match his real answer', () => {
    expect(ids(base({ deliveries: 2 }))).not.toContain('credit_sarr');
    const open = pistes(base({ deliveries: 3, sarr: { place: SARR, refusal: null } }))[0];
    expect(open).toMatchObject({ id: 'credit_sarr', afterWork: true, go: { place: SARR } });
    expect(open.line).toBe('Tu travailles sérieusement. Pape Sarr pourrait t’expliquer comment obtenir une voiture à crédit.');
    // he does not know the player yet: the lead says to go and introduce yourself, never that a loan is waiting
    expect(pistes(base({ deliveries: 3 }))[0].line).toMatch(/fait crédit aux gens qu’il connaît/);
  });

  it('never suggests a credit his rules refuse for a debt or a broken promise, nor to someone who has a car, nor without Sarr Auto in the build', () => {
    expect(ids(base({ deliveries: 5, sarr: { place: SARR, refusal: 'other' } }))).not.toContain('credit_sarr');
    expect(ids(base({ deliveries: 5, cars: 1 }))).not.toContain('credit_sarr');
    expect(ids(base({ deliveries: 5, sarr: null }))).not.toContain('credit_sarr');
  });

  it('the first business when pocket and savings pay for it, at its real price; its place when the world has it, else the Affaires app', () => {
    const p = pistes(base({ wallet: 30_000, savings: 25_000 })).find(x => x.id === 'first_business')!;
    expect(p.line).toMatch(/55\s000 F/); expect(p.line).toMatch(/50\s000 F/); expect(p.go).toEqual({ app: 'affaires' });
    const table = { id: 'pikine:bana', hub: 'pikine' as const, name: 'Table de bana-bana' };
    expect(pistes(base({ wallet: 60_000, bana: { price: 50_000, place: table } })).find(x => x.id === 'first_business')!.go).toEqual({ place: table });
    expect(ids(base({ wallet: 49_999 }))).not.toContain('first_business');
    expect(ids(base({ wallet: 90_000, ventures: 1 }))).not.toContain('first_business');
  });

  it('the bank only when the service exists in this build and no account is open', () => {
    expect(ids(base({ wallet: 20_000 }))).toContain('bank_open');
    expect(ids(base({ wallet: 20_000, bank: null }))).not.toContain('bank_open');
    expect(ids(base({ wallet: 20_000, bank: { place: BANK, opened: true } }))).not.toContain('bank_open');
    expect(ids(base({ wallet: 14_999 }))).not.toContain('bank_open');
  });

  it('close to the first business with an account: how much is missing', () => {
    const p = pistes(base({ wallet: 10_000, savings: 20_000, bank: { place: BANK, opened: true } })).find(x => x.id === 'save_for_bana')!;
    expect(p.line).toMatch(/Encore 20\s000 F/);
  });

  it('deterministic: the same facts give the same leads', () => {
    const f = base({ wallet: 70_000, deliveries: 6, variety: [{ label: 'Pêche', where: 'Soumbédioune' }], needs: { social: 20, moral: 50 } });
    expect(pistes(f)).toEqual(pistes(f));
    expect(pistes(f).length).toBeLessThanOrEqual(4);
  });
});

describe('Mes pistes: never the same lead twice for the same situation', () => {
  it('a dismissed lead stays away while its facts hold, and comes back when they change', () => {
    const st = newPistes(), f = base({ deliveries: 4 });
    const p = pistes(f)[0]; st.off[p.id] = p.key;
    expect(openPistes(pistes(f), st).map(x => x.id)).not.toContain('credit_sarr');
    expect(openPistes(pistes(base({ deliveries: 9 })), st).map(x => x.id)).not.toContain('credit_sarr');     // more work alone: not a new lead
    expect(openPistes(pistes(base({ deliveries: 9, sarr: { place: SARR, refusal: null } })), st).map(x => x.id)).toContain('credit_sarr');   // he would now say yes
  });

  it('in the street: one offer per facts, only the ones meant for after work, and not more often than the gap', () => {
    const st = newPistes(), list = pistes(base({ deliveries: 3, wallet: 20_000 }));
    const first = offerNow(list, st, 10 * 60_000, 8 * 60_000)!;
    expect(first.id).toBe('credit_sarr');
    st.offered[first.id] = first.key; st.lastMs = 10 * 60_000;
    expect(offerNow(list, st, 12 * 60_000, 8 * 60_000)).toBeNull();                      // too soon
    expect(offerNow(list, st, 20 * 60_000, 8 * 60_000)!.id).toBe('bank_open');          // the next one, later
    st.offered.bank_open = 'open';
    expect(offerNow(list, st, 40 * 60_000, 8 * 60_000)).toBeNull();                      // nothing else is meant for the street
    expect(openPistes(list, st).length).toBe(2);                                           // still listed in the phone
  });

  it('the saved state is cleaned', () => {
    expect(pistesOf({ off: { credit_sarr: 'cars0|open', 'Bad Key': 'x', bank_open: 5 }, offered: null, lastMs: 9e12 }, 1000))
      .toEqual({ off: { credit_sarr: 'cars0|open' }, offered: {}, lastMs: 1000 });
    expect(pistesOf(undefined, 0)).toEqual(newPistes());
  });
});
