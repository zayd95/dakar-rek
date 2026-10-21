import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { migrate, newSave } from '../src/core/save';
import type { LoanState } from '../src/core/types';
import { C, dealerOffer, dueBy, garageDeals, missedWith, openLoan, repay, settle, standing } from '../src/economy/credit';
import { buyAssetFinanced, cannotSell, holding, sellAsset } from '../src/economy/assets';

const fresh = (wallet = 3000) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
const TERANGA = 4_000_000;
const loan = (o: Partial<LoanState> = {}): LoanState => ({ id: 'L1', lender: 'sarr', kind: 'vehicle', label: 'Teranga', principal: 3_950_000, paid: 0, installment: 99_000, every: 2, openedDay: 10, checkedDay: 10, missed: 0, status: 'open', ...o });

describe('Pape Sarr\'s credit (src/economy/credit.ts dealerOffer)', () => {
  it('refuses a stranger: no credit after a greeting', () => {
    expect(dealerOffer({ trust: C.trust.firstVisit, price: TERANGA, wallet: 10_000_000, loans: [] }).verdict).toBe('refuse');
    expect(dealerOffer({ trust: 19, price: TERANGA, wallet: 10_000_000, loans: [] }).verdict).toBe('refuse');
  });
  it('terms follow trust: the more he trusts, the smaller the down payment and the longer the schedule', () => {
    const at = (t: number) => dealerOffer({ trust: t, price: TERANGA, wallet: 1e9, loans: [] });
    const [a, b, c, d] = [20, 30, 45, 60].map(at);
    for (const o of [a, b, c, d]) expect(o.verdict).toBe('accept');
    expect(a.down).toBeGreaterThan(b.down); expect(b.down).toBeGreaterThan(c.down); expect(c.down).toBeGreaterThan(d.down);
    expect(d.down).toBe(50_000);
    expect(d.installments).toBeGreaterThan(a.installments);
    for (const o of [a, b, c, d]) { expect(o.down + o.principal).toBe(TERANGA); expect(o.installment * o.installments).toBeGreaterThanOrEqual(o.principal); }
  });
  it('counters when the wallet cannot cover the down payment (the same terms, signing waits)', () => {
    const o = dealerOffer({ trust: 60, price: TERANGA, wallet: 49_999, loans: [] });
    expect(o.verdict).toBe('counter'); expect(o.down).toBe(50_000); expect(o.line).toMatch(/50/);
  });
  it('one credit at a time, a city car only, and not after letting him down', () => {
    expect(dealerOffer({ trust: 80, price: TERANGA, wallet: 1e9, loans: [loan()] }).verdict).toBe('refuse');
    expect(dealerOffer({ trust: 80, price: 70_000_000, wallet: 1e9, loans: [] }).verdict).toBe('refuse');
    const bad = loan({ status: 'closed', paid: 3_950_000, missed: C.dealer.missedLimit });
    expect(dealerOffer({ trust: 80, price: TERANGA, wallet: 1e9, loans: [bad] }).verdict).toBe('refuse');
    // a repair debt in arrears with Modou: he hears about it
    const late = loan({ lender: 'modou', kind: 'repair', principal: 20_000, installment: 7000, every: 1, openedDay: 1, checkedDay: 5, missed: 2 });
    expect(dealerOffer({ trust: 80, price: TERANGA, wallet: 1e9, loans: [late] }).verdict).toBe('refuse');
  });
});

describe('the schedule (dueBy, standing, repay, settle)', () => {
  it('installments fall due every `every` days from the day it was signed, never beyond the principal', () => {
    const l = loan();
    expect(dueBy(l, 10)).toBe(0); expect(dueBy(l, 11)).toBe(0); expect(dueBy(l, 12)).toBe(99_000); expect(dueBy(l, 14)).toBe(198_000);
    expect(dueBy(l, 10_000)).toBe(l.principal);
    const st = standing(l, 11); expect(st.late).toBe(0); expect(st.next).toBe(99_000); expect(st.nextDay).toBe(12);
  });
  it('a missed due date is counted once, however often the day is looked at; paying on time misses nothing', () => {
    const l = loan();
    expect(settle(l, 11)).toBe(0);
    expect(settle(l, 12)).toBe(1); expect(settle(l, 12)).toBe(0); expect(l.missed).toBe(1);
    const ok = loan(); repay(ok, 99_000, 12); expect(settle(ok, 12)).toBe(0); expect(ok.missed).toBe(0);
    const far = loan(); expect(settle(far, 16)).toBe(3); expect(far.missed).toBe(3);
  });
  it('repays no more than what is left and closes the debt when it is all repaid', () => {
    const l = loan({ principal: 100_000, installment: 50_000 });
    expect(repay(l, 30_000, 11)).toBe(30_000); expect(l.status).toBe('open');
    expect(repay(l, 1_000_000, 12)).toBe(70_000); expect(l.status).toBe('closed'); expect(l.closedDay).toBe(12);
    expect(repay(l, 10, 13)).toBe(0);
  });
  it('opens with the schedule starting today', () => {
    const list: LoanState[] = [];
    const l = openLoan(list, 7, { lender: 'sarr', kind: 'vehicle', label: 'T', principal: 1000, installment: 300, every: 2, day: 5, asset: 'a3', spec: 'teranga' });
    expect(l.id).toBe('L7'); expect(list).toHaveLength(1); expect(l.openedDay).toBe(5); expect(l.checkedDay).toBe(5); expect(l.asset).toBe('a3');
  });
});

describe('Modou\'s arrangements (garageDeals)', () => {
  it('a stranger pays the full price; someone he knows pays part now; a trusted, reliable customer may get a discount', () => {
    expect(garageDeals({ cost: 20_000, trust: 0, trusted: false, loans: [] }).deals.map(d => d.id)).toEqual(['full']);
    const known = garageDeals({ cost: 20_000, trust: 15, trusted: false, loans: [] }).deals;
    expect(known.map(d => d.id)).toEqual(['full', 'part']);
    const part = known[1]; expect(part.pay + part.debt).toBe(20_000); expect(part.pay).toBeGreaterThanOrEqual(C.garage.minNow);
    const closed = loan({ lender: 'modou', kind: 'repair', status: 'closed', paid: 3_950_000 });
    expect(garageDeals({ cost: 20_000, trust: 40, trusted: true, loans: [closed] }).deals.map(d => d.id)).toEqual(['full', 'part', 'trust']);
  });
  it('no new slate while one is open, after a bad record, nor above what he can carry', () => {
    const open = loan({ lender: 'modou', kind: 'repair', principal: 10_000, installment: 4000, every: 1 });
    expect(garageDeals({ cost: 20_000, trust: 50, trusted: true, loans: [open] }).deals.map(d => d.id)).toEqual(['full']);
    const bad = loan({ lender: 'modou', kind: 'repair', status: 'closed', paid: 3_950_000, missed: C.garage.missedLimit });
    expect(missedWith([bad], 'modou')).toBe(C.garage.missedLimit);
    expect(garageDeals({ cost: 20_000, trust: 50, trusted: true, loans: [bad] }).deals.map(d => d.id)).toEqual(['full']);
    const big = garageDeals({ cost: 500_000, trust: 50, trusted: true, loans: [] }).deals.find(d => d.id === 'part');
    expect(big).toBeUndefined();                                                    // the rest would be above his cap: no arrangement that leaves money unpaid
  });
});

describe('a car bought on credit (src/economy/assets.ts)', () => {
  it('only the down payment leaves the wallet; the car is the player\'s; credit never adds money', () => {
    const s = fresh(60_000), before = s.wallet;
    const a = buyAssetFinanced(s, 'teranga', 50_000, 'Sarr Auto')!;
    expect(a).toBeTruthy(); expect(s.wallet).toBe(before - 50_000); expect(holding(s, 'teranga')?.uid).toBe(a.uid);
    expect(buyAssetFinanced(s, 'teranga', 50_000, 'Sarr Auto')).toBeNull();          // no second copy
    expect(buyAssetFinanced(fresh(10_000), 'teranga', 50_000, 'Sarr Auto')).toBeNull();
    expect(buyAssetFinanced(fresh(1e9), 'teranga', 5_000_000, 'Sarr Auto')).toBeNull();   // a down payment above the price is not one
  });
  it('cannot be sold while the debt is open (buy on credit, sell at once: money from nothing); can once repaid', () => {
    const s = fresh(60_000), a = buyAssetFinanced(s, 'teranga', 50_000, 'Sarr Auto')!;
    const l = openLoan(s.data.loans.list, 1, { lender: 'sarr', kind: 'vehicle', label: 'Teranga', principal: 3_950_000, installment: 99_000, every: 2, day: 0, asset: a.uid, spec: 'teranga' });
    expect(cannotSell(s, a.uid)).toMatch(/Crédit/); expect(sellAsset(s, a.uid)).toBe(0); expect(s.wallet).toBe(10_000);
    s.data.wallet = 4_000_000; repay(l, 3_950_000, 3);
    expect(cannotSell(s, a.uid)).toBeNull();
  });
});

describe('the save keeps debts and VTC rides (additive fields)', () => {
  it('an older save without them loads owing nothing, with no ride in hand', () => {
    const raw = JSON.parse(JSON.stringify(newSave(0))) as Record<string, unknown>; delete raw.loans; delete raw.vtc;
    const m = migrate(raw)!; expect(m.loans).toEqual({ list: [], seq: 0 }); expect(m.vtc.active).toBeNull(); expect(m.vtc.done).toEqual([]);
  });
  it('malformed debts are dropped, amounts made whole, a debt repaid in full is closed', () => {
    const raw = JSON.parse(JSON.stringify(newSave(0))) as Record<string, unknown>;
    raw.loans = { seq: 4, list: [loan({ id: 'L1', paid: 5_000_000 }), { id: 'x', lender: 'sarr' }, loan({ id: 'L2', lender: 'bank' as never }), loan({ id: 'L3', paid: -5 })] };
    const m = migrate(raw)!;
    expect(m.loans.list.map(l => l.id)).toEqual(['L1', 'L3']);
    expect(m.loans.list[0].status).toBe('closed'); expect(m.loans.list[0].paid).toBe(3_950_000);
    expect(m.loans.list[1].paid).toBe(0); expect(m.loans.seq).toBe(4);
  });
  it('a ride already paid cannot come back in hand', () => {
    const raw = JSON.parse(JSON.stringify(newSave(0))) as Record<string, unknown>;
    raw.vtc = { done: ['V3'], seq: 3, trips: 3, earned: 30000, active: { id: 'V3', from: 'pikine', to: 'plateau', pickup: { x: 1, z: 2 }, dropoff: { x: 3, z: 4 }, fare: 9000, stage: 'aboard', passenger: { name: 'A', seed: 1 }, acceptedMs: 0 } };
    expect(migrate(raw)!.vtc.active).toBeNull();
  });
});
