import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { MONEY_MAX, newSave, migrate } from '../src/core/save';
import {
  BUYBACK, CAPACITY, GOODS, LOTS_PER_DAY, PL, PORTER, SPOILED, STAGE, TRUST, buy, buyBack, cancel, demandLeft, itemOf, ledgerOf, load, lotOf, lotsLeft, priceOf, quote, sell,
  whyNotBuy, whyNotLoad, whyNotSell,
} from '../src/districts/tradeRules';

/** M2 « Ma première affaire » (src/districts/tradeRules.ts): buy at Diallo's, carry, sell at the Comptoir Sall; one lot, one payment each way. */
const fresh = (wallet = 60000) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
const reload = (s: GameState) => new GameState(migrate(JSON.parse(JSON.stringify(s.data)), Date.now())!);

describe('M2 · a trade from the Médina to the Plateau', () => {
  it('the golden path: buy with own money, carry, sell, the profit is revenue − purchase − transport and matches the ledger', () => {
    const s = fresh(), w0 = s.data.wallet;
    const b = buy(s, 'the', 3, 10); expect(b.ok).toBe(true);
    expect(s.data.wallet).toBe(w0 - 3 * GOODS.the.buy);                                   // a real debit
    expect(s.data.inventory[itemOf('the')]).toBe(3);                                       // the goods, in the existing inventory
    expect(lotOf(s)!.stage).toBe(STAGE.bought);
    expect(load(s, 'hand').ok).toBe(true);
    expect(whyNotSell(s, 10, false)).toMatch(/Apporte/);                                  // not at the Comptoir yet
    const r = sell(s, 10, true); expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.r.revenue).toBe(3 * GOODS.the.sell); expect(r.r.profit).toBe(3 * (GOODS.the.sell - GOODS.the.buy));
    expect(s.data.wallet - w0).toBe(r.r.profit);                                          // what the trade did to the wallet
    expect(ledgerOf(s, r.r.seq)).toBe(r.r.profit);                                         // and it reconciles with the lot's ledger lines
    expect(lotOf(s)).toBeNull(); expect(s.data.inventory[itemOf('the')]).toBeUndefined();
    expect(s.data.counters[PL.trades]).toBe(1); expect(s.data.counters[PL.profit]).toBe(r.r.profit);
  });

  it('never pays twice: a second sell, a retry after a reload, a double tap', () => {
    const s = fresh(); buy(s, 'mangue', 1, 4); load(s, 'hand');
    const w = s.data.wallet; expect(sell(s, 4, true).ok).toBe(true);
    const paid = s.data.wallet - w;
    expect(sell(s, 4, true).ok).toBe(false);                                               // the same tap again
    const t = reload(s); expect(sell(t, 4, true).ok).toBe(false);                          // after a reload
    expect(t.data.wallet - w).toBe(paid);
  });

  it('no purchase without the money, one lot at a time, quantities bounded', () => {
    const s = fresh(5000);
    expect(whyNotBuy(s, 'riz', 1)).toMatch(/argent/); expect(buy(s, 'riz', 1, 0).ok).toBe(false); expect(s.data.wallet).toBe(5000);
    expect(buy(s, 'the', 1, 0).ok).toBe(true);
    expect(whyNotBuy(s, 'the', 1)).toMatch(/déjà un lot/);
    const t = fresh(); expect(whyNotBuy(t, 'the', 0)).toBeTruthy(); expect(whyNotBuy(t, 'the', 11)).toBeTruthy(); expect(whyNotBuy(t, 'the', 1.5)).toBeTruthy();
  });

  it('a bought lot survives a reload at its stage, with its goods and its cost', () => {
    const s = fresh(); buy(s, 'riz', 2, 7); load(s, 'vehicle', { cap: CAPACITY.car });
    const t = reload(s), l = lotOf(t)!;
    expect(l).toMatchObject({ good: 'riz', qty: 2, cost: 2 * GOODS.riz.buy, stage: STAGE.carried, mode: 'vehicle', day: 7 });
    expect(t.data.inventory[itemOf('riz')]).toBe(2);
  });

  it('cancel before the lot leaves: a full refund; after it left, Diallo takes it back at 70 % only', () => {
    const s = fresh(), w0 = s.data.wallet;
    buy(s, 'mangue', 2, 0); expect(cancel(s).ok).toBe(true); expect(s.data.wallet).toBe(w0); expect(lotOf(s)).toBeNull();
    buy(s, 'the', 3, 0); load(s, 'hand');
    expect(cancel(s).ok).toBe(false);
    const b = buyBack(s); expect(b.ok).toBe(true);
    expect(s.data.wallet).toBe(w0 - 3 * GOODS.the.buy + Math.round(3 * GOODS.the.buy * BUYBACK));
    expect(s.data.inventory[itemOf('the')]).toBeUndefined();
  });

  it('carrying: by hand only what a hand holds, a vehicle within its load, the porters for a fee; rice never by hand', () => {
    const s = fresh(); buy(s, 'riz', 1, 0);
    expect(whyNotLoad(s, 'hand')).toMatch(/lourd/);
    expect(whyNotLoad(s, 'vehicle', 0)).toMatch(/Gare/);
    const t = fresh(); buy(t, 'the', 4, 0); expect(whyNotLoad(t, 'hand')).toMatch(/3/);
    const u = fresh(); buy(u, 'riz', 5, 0); expect(whyNotLoad(u, 'vehicle', CAPACITY.car)).toMatch(/4/); expect(whyNotLoad(u, 'vehicle', CAPACITY.bed)).toBeNull();
    const w = u.data.wallet; expect(load(u, 'porter', { playedMs: 1000, metres: 230 }).ok).toBe(true);
    expect(w - u.data.wallet).toBe(PORTER.fee);
    const l = lotOf(u)!; expect(l.stage).toBe(STAGE.porter); expect(l.eta).toBeGreaterThan(1000 + 150_000);
    expect(whyNotSell(u, 0, true, l.eta - 1)).toMatch(/pas encore/);                       // the porters walk: not before they arrive
    const r = sell(u, 0, false, l.eta); expect(r.ok).toBe(true);                           // the goods are at the Comptoir: the player need not be at the bay with them
    if (r.ok) expect(r.r.profit).toBe(5 * (GOODS.riz.sell - GOODS.riz.buy) - PORTER.fee);
  });

  it('mangoes spoil after two days: the Comptoir pays 30 %, the loss is real', () => {
    const s = fresh(); buy(s, 'mangue', 1, 3); load(s, 'hand');
    const q = quote(s, 5)!; expect(q.spoiled).toBe(true); expect(q.revenue).toBe(Math.round(GOODS.mangue.sell * SPOILED)); expect(q.profit).toBeLessThan(0);
    expect(quote(s, 4)!.spoiled).toBe(false);
  });

  it('the Comptoir buys a bounded amount a day: the rest stays in hand at its share of the cost, sold the next day', () => {
    const s = fresh(200000);
    s.data.counters[PL.soldDay] = 9 + 1; s.data.counters[PL.sold('riz')] = GOODS.riz.demand - 3;      // already bought rice today: 3 sacks left
    buy(s, 'riz', 5, 9); load(s, 'vehicle', { cap: CAPACITY.bed });
    expect(demandLeft(s, 'riz', 9)).toBe(3);
    const a = sell(s, 9, true); expect(a.ok && a.r.units).toBe(3);
    expect(lotOf(s)!.qty).toBe(2); expect(lotOf(s)!.cost).toBe(2 * GOODS.riz.buy);
    expect(whyNotSell(s, 9, true)).toMatch(/demain/);
    const b = sell(s, 10, true); expect(b.ok && b.r.units).toBe(2);
    expect(lotOf(s)).toBeNull(); expect(s.data.counters[PL.trades]).toBe(1);
    const seq = a.ok ? a.r.seq : 0; expect(ledgerOf(s, seq)).toBe((a.ok ? a.r.profit : 0) + (b.ok ? b.r.profit : 0));
  });

  it('a trusted supplier: after three trades, better terms on rice (and only on rice)', () => {
    const s = fresh(200000);
    for (let k = 0; k < TRUST.trades; k++) { buy(s, 'the', 1, k); load(s, 'hand'); sell(s, k, true); }
    expect(priceOf(s, 'riz')).toBe(Math.round(GOODS.riz.buy * (1 - TRUST.discount.riz!)));
    expect(priceOf(s, 'the')).toBe(GOODS.the.buy);
  });

  it('a run pays like a job or two, not more: the best full lot of each good', () => {
    // the margins against the other work of the game (a VTC ride Corniche → Mermoz is 3 500 F; a Tiak delivery about 1 600 F)
    expect(3 * (GOODS.the.sell - GOODS.the.buy)).toBeLessThanOrEqual(2500);
    expect(CAPACITY.car * (GOODS.riz.sell - GOODS.riz.buy)).toBeLessThanOrEqual(5000);
    expect(PORTER.max * (GOODS.mangue.sell - GOODS.mangue.buy) - PORTER.fee).toBeLessThanOrEqual(5000);
    expect(CAPACITY.bed * (GOODS.riz.sell - GOODS.riz.buy)).toBeLessThanOrEqual(12000);   // a pickup's full load: the most, and it ties up 90 000 F
  });

  it('Diallo sells two lots a day, and a reload does not reset the count; a lot cancelled on his forecourt gives its place back', () => {
    const s = fresh(200000);
    for (let k = 0; k < LOTS_PER_DAY; k++) { expect(buy(s, 'the', 1, 5).ok).toBe(true); load(s, 'hand'); sell(s, 5, true); }
    expect(whyNotBuy(s, 'the', 1, 5)).toMatch(/demain/);
    const t = reload(s); expect(lotsLeft(t, 5)).toBe(0); expect(buy(t, 'the', 1, 5).ok).toBe(false);
    expect(buy(t, 'the', 1, 6).ok).toBe(true); expect(cancel(t).ok).toBe(true); expect(lotsLeft(t, 6)).toBe(LOTS_PER_DAY);
  });

  it('the amounts are what the wallet really took and got: a sale clamped at the wallet ceiling still reconciles with the ledger', () => {
    const s = fresh(); buy(s, 'the', 3, 0); load(s, 'hand');
    s.data.wallet = MONEY_MAX - 1000;
    const r = sell(s, 0, true); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.r.revenue).toBe(1000); expect(s.data.wallet).toBe(MONEY_MAX);
    expect(r.r.profit).toBe(1000 - 3 * GOODS.the.buy); expect(ledgerOf(s, r.r.seq)).toBe(r.r.profit);
    expect(s.data.counters[PL.profit]).toBe(r.r.profit);
  });
});
