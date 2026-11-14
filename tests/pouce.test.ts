import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate, STARTER_HOME } from '../src/core/save';
import { ECONOMY } from '../src/economy/config';
import { specOf } from '../src/economy/catalog';
import { assetByUid, buyAsset, holding, rentAsset, saleValue, sellAsset, setLeased } from '../src/economy/assets';
import { acceptJob, completeJob, pickUp } from '../src/economy/jobs';
import { deliverFurniture } from '../src/economy/furniture';
import { offer, signLease } from '../src/economy/monthly';
import { move, reserveOnline, settleOnline } from '../src/economy/money';
import { recordMatch } from '../src/districts/matchRules';
import { moveAndLeave } from '../src/economy/moving';
import { POUCE, POUCE_COUNTERS, POUCE_TOTAL, due, ladderView, nextStep, paid, payDue, pouceLead, received } from '../src/economy/pouce';

const fresh = (wallet = 3000) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
const reload = (s: GameState) => new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
const step = (id: string) => POUCE.find(p => p.id === id)!;
const lines = (s: GameState) => s.data.ledger.filter(l => /^Coup de pouce/.test(l.label));
/** A delivery done for real (accepted at its pick-up, handed over). */
function deliver(s: GameState, route: string) {
  const j = acceptJob(s, route, true, 600_000)!;
  expect(j).toBeTruthy();
  if (s.data.jobs.active?.stage === 'pickup') pickUp(s, 600_000);
  return completeJob(s, j.runId);
}

describe('the ladder: a one-time sequence, fast at the start, rising', () => {
  it('nine steps, 10 000 F first, rising step by step, 300 000 F in all', () => {
    expect(POUCE.length).toBeGreaterThanOrEqual(8); expect(POUCE.length).toBeLessThanOrEqual(12);
    expect(POUCE[0]).toMatchObject({ id: 'livraison', amount: 10_000 });
    for (let i = 1; i < POUCE.length; i++) expect(POUCE[i].amount).toBeGreaterThan(POUCE[i - 1].amount);
    expect(POUCE_TOTAL).toBe(300_000);
    expect(new Set(POUCE.map(p => p.id)).size).toBe(POUCE.length);
  });
  it('generous but never the F2: 2 % of its price, less than its first month and its furniture, five months of its rent', () => {
    const f2 = specOf('appart_jamm')!, mo = ECONOMY.monthly.f2;
    expect(POUCE_TOTAL).toBeLessThan(f2.price! * 0.025);
    expect(POUCE_TOTAL).toBeLessThan(mo.rent + mo.charges + mo.pack);
    expect(POUCE_TOTAL / (mo.rent + mo.charges)).toBe(5);
  });
  it('no step pays more than its own action costs when that action can be undone', () => {
    const mo = ECONOMY.monthly.f2, f2 = specOf('appart_jamm')!;
    expect(step('logement').amount).toBeLessThan(mo.rent + mo.charges);                       // sign the F2, hand the keys back: the first month is lost
    expect(step('logement').amount).toBeLessThan(f2.price! * (1 - ECONOMY.property.saleShare));  // buy a home, sell it at once: 10 % lost
    const s = fresh(1e9); rentAsset(s, 'maison_cite');
    expect(step('logement').done(s)).toBe(false);                                              // a lease by the day (handed back for almost nothing) does not count
  });
});

describe('each step\'s trigger, read from the save', () => {
  it('1. the first Tiak Tiak delivery', () => {
    const s = fresh();
    expect(step('livraison').done(s)).toBe(false);
    deliver(s, 'pk_mame_boutique');
    expect(step('livraison').done(s)).toBe(true);
  });
  it('2. a first piece of furniture', () => {
    const s = fresh(10_000);
    expect(step('meuble').done(s)).toBe(false);
    expect(deliverFurniture(s, 'chaises')).toBeTruthy();
    expect(step('meuble').done(s)).toBe(true);
  });
  it('3. a parked vehicle found with « Mes véhicules » (its counter, set when the marker is reached or the vehicle got on)', () => {
    const s = fresh();
    expect(step('vehicule').done(s)).toBe(false);
    expect(step('vehicule').hint(s, 'pikine')).toMatch(/moto Tiak Tiak/);
    s.data.counters['vehicle:tiak:hub'] = 0; s.data.counters['vehicle:tiak:x'] = 4; s.data.counters['vehicle:tiak:z'] = 9;   // the lent bike left parked
    expect(step('vehicule').hint(s, 'pikine')).toMatch(/Mes véhicules › Localiser/);
    s.count(POUCE_COUNTERS.found);
    expect(step('vehicule').done(s)).toBe(true);
  });
  it('4. a delivery to another district (a delivery inside one does not count)', () => {
    const s = fresh();
    deliver(s, 'pk_mame_boutique');
    expect(step('quartiers').done(s)).toBe(false);
    const r = deliver(s, 'x_pk_pl_diallo_ndeye');
    expect(r?.route.toHub).toBe('plateau');
    expect(s.data.counters[POUCE_COUNTERS.away]).toBe(1);
    expect(step('quartiers').done(s)).toBe(true);
  });
  it('5. a meal on a rooftop (Toit Baobab, Terrasse de Ngor) or an evening at a dance terrace (Le Patio)', () => {
    const a = fresh(); a.count('terrasse'); expect(step('soiree').done(a)).toBe(true);
    const b = fresh(); b.data.counters['club:almadies:patio:soirees'] = 1; expect(step('soiree').done(b)).toBe(true);
    const c = fresh(); c.data.counters['club:almadies:patio:danses'] = 3; expect(step('soiree').done(c)).toBe(false);
  });
  it('6. Teranga Money: a send or a withdrawal the server confirmed; offline, a first deposit at the Banque Teranga', () => {
    const s = fresh(50_000), save = () => true;
    expect(reserveOnline(s, { id: 'op-pay-0001', kind: 'pay', amount: 1000, fund: 1000, to: '0123456789abcdef', tag: 'fedcba9876543210' }, save).ok).toBe(true);
    expect(step('teranga').done(s)).toBe(false);                                               // sent, not answered: nothing yet
    settleOnline(s, 'op-pay-0001', { ok: false });
    expect(step('teranga').done(s)).toBe(false);                                               // refused: nothing
    expect(reserveOnline(s, { id: 'op-pay-0002', kind: 'pay', amount: 1000, fund: 1000, to: '0123456789abcdef', tag: 'fedcba9876543210' }, save).ok).toBe(true);
    settleOnline(s, 'op-pay-0002', { ok: true, balance: 0 });
    expect(s.data.counters[POUCE_COUNTERS.sent]).toBe(1);
    expect(step('teranga').done(s)).toBe(true);
    settleOnline(s, 'op-pay-0002', { ok: true, balance: 0 });                                   // the same answer again: counted once
    expect(s.data.counters[POUCE_COUNTERS.sent]).toBe(1);
    const w = fresh(5000);
    expect(reserveOnline(w, { id: 'op-cash-0001', kind: 'cashout', amount: 2000, fund: 0, tag: 'fedcba9876543210' }, save).ok).toBe(true);
    settleOnline(w, 'op-cash-0001', { ok: true, balance: 0 });
    expect(w.data.counters[POUCE_COUNTERS.cashed]).toBe(1); expect(step('teranga').done(w)).toBe(true);
    const b = fresh(5000);
    expect(move(b, 'wallet', 'savings', 1000).ok).toBe(true);
    expect(step('teranga').done(b)).toBe(true);
  });
  it('7. a tenant by the month or an owner', () => {
    const a = fresh(100_000); signLease(a, 'appart_jamm'); expect(step('logement').done(a)).toBe(true);
    const b = fresh(20_000_000); buyAsset(b, 'appart_jamm'); expect(step('logement').done(b)).toBe(true);
    expect(step('logement').done(fresh())).toBe(false);                                         // the family room is not one
  });
  it('8. a match at the Corniche\'s pitch: a neighbourhood match (offline) or a Grand Camp (its counter)', () => {
    const a = fresh();
    expect(step('camp').done(a)).toBe(false);
    recordMatch(a, { seq: 1, team: 0, score: [3, 1], myGoals: 1, day: 0 });
    expect(step('camp').done(a)).toBe(true);
    const b = fresh(); b.count(POUCE_COUNTERS.camp); expect(step('camp').done(b)).toBe(true);
  });
  it('9. a home let: an owned home let to a family, or the F2 sublet', () => {
    const a = fresh(20_000_000), f2 = buyAsset(a, 'appart_jamm')!;
    expect(step('location').done(a)).toBe(false);
    expect(setLeased(a, f2.uid, true)).toBe(true);
    expect(step('location').done(a)).toBe(true);
    const b = fresh(200_000), g = signLease(b, 'appart_jamm')!;
    expect(offer(b, g.uid, 'sublet')).toBe(true);
    expect(step('location').done(b)).toBe(true);
  });
});

describe('paid once per save, never again', () => {
  it('the first delivery pays 10 000 F once: one wallet line with its reason, its mark in the save', () => {
    const s = fresh(), w0 = s.wallet;
    deliver(s, 'pk_mame_boutique');
    const w1 = s.wallet, pay = payDue(s);
    expect(pay.map(p => [p.step.id, p.amount])).toEqual([['livraison', 10_000]]);
    expect(s.wallet - w1).toBe(10_000); expect(w1).toBeGreaterThan(w0);
    expect(lines(s)).toEqual([expect.objectContaining({ label: 'Coup de pouce : Ta première livraison Tiak Tiak', amount: 10_000 })]);
    expect(s.data.counters['pouce:livraison']).toBe(10_000);
    expect(paid(s, 'livraison')).toBe(true);
  });
  it('duplicate events and repeated checks: a second delivery, the check every frame, pay nothing more', () => {
    const s = fresh();
    deliver(s, 'pk_mame_boutique'); payDue(s);
    const w = s.wallet;
    for (let i = 0; i < 50; i++) expect(payDue(s)).toEqual([]);
    deliver(s, 'pk_mame_boutique');
    const after = s.wallet;
    expect(payDue(s)).toEqual([]);
    expect(s.wallet).toBe(after); expect(after).toBeGreaterThan(w);                            // the delivery pays, the step does not again
    expect(lines(s)).toHaveLength(1);
  });
  it('a reload between detection and payment pays once; a reload after the payment pays nothing', () => {
    const s = fresh();
    deliver(s, 'pk_mame_boutique');
    const before = reload(s);                                                                   // the page reloaded with the step met, unpaid
    expect(due(before).map(p => p.id)).toEqual(['livraison']);
    payDue(before); const w = before.wallet;
    const again = reload(before);                                                               // saved with its mark: never again
    expect(payDue(again)).toEqual([]); expect(again.wallet).toBe(w);
    expect(lines(again)).toHaveLength(1);
    // the payment made in memory but never saved is lost with its mark: the next load pays it once, not twice
    const lost = reload(s);
    expect(payDue(lost).length).toBe(1); expect(payDue(reload(lost))).toEqual([]);
  });
  it('a district change, a sale and a re-purchase, an older client\'s rewrite: the mark stays, nothing is paid again', () => {
    const s = fresh(40_000_000), f2 = buyAsset(s, 'appart_jamm')!;
    payDue(s); expect(paid(s, 'logement')).toBe(true);
    s.data.hub = 'plateau';
    expect(payDue(s)).toEqual([]);
    sellAsset(s, f2.uid); buyAsset(s, 'appart_jamm');
    expect(payDue(s)).toEqual([]);
    const old = reload(s); delete (old.data as unknown as Record<string, unknown>).bank;          // a client that knows less keeps `counters` (src/core/save.ts migrate)
    expect(paid(reload(old), 'logement')).toBe(true);
    expect(lines(s).filter(l => /Locataire au mois ou propriétaire/.test(l.label))).toHaveLength(1);
  });
  it('an older save: every step already done is credited once, together (one wallet line each, one payment batch)', () => {
    const s = fresh(20_000_000);
    deliver(s, 'pk_mame_boutique'); deliverFurniture(s, 'radio'); s.count('terrasse');
    const f2 = buyAsset(s, 'appart_jamm')!;
    moveAndLeave(s, f2.uid, 'keep_room');
    const old = reload(s), w = old.wallet;
    const batch = payDue(old);
    expect(batch.map(p => p.step.id)).toEqual(['livraison', 'meuble', 'soiree', 'logement']);
    expect(old.wallet - w).toBe(10_000 + 15_000 + 30_000 + 45_000);
    expect(lines(old)).toHaveLength(4);
    expect(received(old)).toBe(100_000);
    expect(payDue(old)).toEqual([]);
  });
});

describe('the goal line and the phone\'s list', () => {
  it('the next step leads: the first delivery keeps the Tiak Tiak lead (its pin), the next ones say their amount', () => {
    const s = fresh();
    expect(pouceLead(s, 'pikine')).toMatchObject({ id: 'goal_tiak' });
    expect(pouceLead(s, 'pikine')!.hint.replace(/[  ]/g, ' ')).toMatch(/^Coup de pouce \+10 000 F : ta première livraison Tiak Tiak, à .+\(Pikine\)/);
    deliver(s, 'pk_mame_boutique');
    expect(pouceLead(s, 'pikine')).toMatchObject({ id: 'pouce_meuble' });                     // met: the next one leads, even before the payment
    payDue(s);
    expect(pouceLead(s, 'pikine')!.hint.replace(/[  ]/g, ' ')).toMatch(/^Coup de pouce \+15 000 F : un premier meuble/);
  });
  it('a step done early is paid at once and skipped by the goal line: the ladder never waits', () => {
    const s = fresh(); s.count('terrasse');
    expect(payDue(s).map(p => p.step.id)).toEqual(['soiree']);
    expect(nextStep(s)?.id).toBe('livraison');
    for (const p of POUCE) s.data.counters[`pouce:${p.id}`] = p.amount;
    expect(nextStep(s)).toBeNull(); expect(pouceLead(s, 'pikine')).toBeNull();
  });
  it('the list: each step, its amount, paid or not, the next one, what was received of the total', () => {
    const s = fresh();
    deliver(s, 'pk_mame_boutique'); payDue(s);
    const v = ladderView(s, 'pikine');
    expect(v.count).toBe(POUCE.length); expect(v.done).toBe(1); expect(v.received).toBe(10_000); expect(v.total).toBe(300_000);
    expect(v.next?.id).toBe('meuble');
    expect(v.steps.filter(x => x.next).map(x => x.id)).toEqual(['meuble']);
    expect(v.steps.find(x => x.id === 'teranga')?.online).toMatch(/Banque Teranga/);
    expect(holding(s, STARTER_HOME)).toBeTruthy();
    expect(assetByUid(s, 'a1')).toBeTruthy(); expect(saleValue(assetByUid(s, 'a1')!)).toBe(0);
  });
});
