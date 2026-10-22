import { describe, expect, it } from 'vitest';
import { SARR_ROAD_TRUST, roadTest } from '../src/transport/trialRules';

/** What a dealer's free trial allows (src/transport/trialRules.ts): always the car at a standstill; the road for a reason the dealer accepts. */
describe('trial rules', () => {
  const base = { price: 4_000_000, wallet: 3000, trust: 0, run: 0 };
  it('a stranger with no money sits in the car and starts it, at every dealer: no road', () => {
    for (const dealer of ['sarr', 'ndiaye', 'prestige'] as const) { const r = roadTest({ ...base, dealer }); expect(r.ok).toBe(false); expect(r.line).toMatch(/arrêt/); }
  });
  it('money to buy it opens the road everywhere; a Prestige road test is supervised', () => {
    expect(roadTest({ ...base, dealer: 'sarr', wallet: 4_000_000 }).ok).toBe(true);
    expect(roadTest({ ...base, dealer: 'prestige', price: 70_000_000, wallet: 70_000_000 })).toMatchObject({ ok: true, supervised: true });
  });
  it('Pape Sarr\'s trust, or three days of work in a row, open the road for a city car', () => {
    expect(roadTest({ ...base, dealer: 'sarr', trust: SARR_ROAD_TRUST }).ok).toBe(true);
    expect(roadTest({ ...base, dealer: 'sarr', run: 3 }).ok).toBe(true);
    expect(roadTest({ ...base, dealer: 'ndiaye', run: 3 }).ok).toBe(true);
    expect(roadTest({ ...base, dealer: 'ndiaye', run: 2 }).ok).toBe(false);
  });
  it('Prestige: five days of work in a row give a supervised loop, never less than that', () => {
    expect(roadTest({ ...base, dealer: 'prestige', price: 70_000_000, run: 4 }).ok).toBe(false);
    expect(roadTest({ ...base, dealer: 'prestige', price: 70_000_000, run: 5 })).toMatchObject({ ok: true, supervised: true });
  });
});
