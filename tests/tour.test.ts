import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate, SCHEMA_VERSION } from '../src/core/save';
import { ECONOMY } from '../src/economy/config';
import { ROUTES, acceptJob, cancelJob, completeJob } from '../src/economy/jobs';
import { practise } from '../src/economy/polyvalence';
import {
  ORDERS, TOURS, abandonNote, abandonTour, acceptTour, completeStop, currentTour, depart, historyOf, limitsOf, patienceFactor, payFactor, paysOf,
  previewOrder, tourById, tourRemainingMs, tourTotal, toursAt, trustOf, whyNotTour, type Order,
} from '../src/economy/tour';

const fresh = () => new GameState(newSave(0));
const tour = TOURS[0];
const BANK_FIRST: Order = [0, 1], SQUARE_FIRST: Order = [1, 0];
const [AGENCE, DAMES] = [tour.stops[0].id, tour.stops[1].id];
/** Accept, leave the pick-up, then hand over both stops after the given seconds from departure. */
function run(s: GameState, order: Order, at: [number, number]) {
  const job = acceptTour(s, tour.id, order)!;
  depart(s);
  s.tick(at[0] * 1000); const first = completeStop(s, job.runId)!;
  s.tick((at[1] - at[0]) * 1000); const second = completeStop(s, job.runId)!;
  return { job, first, second };
}

describe('the tour: data', () => {
  it('has one tour, in Pikine, from the Café Touba to two existing places, worth about 4 500 F', () => {
    expect(TOURS.length).toBe(1);
    expect(tour.hub).toBe('pikine');
    expect(toursAt('pikine', 'pikine:cafe:02')).toEqual([tour]);
    expect(toursAt('pikine', 'pikine:dibiterie:11')).toEqual([]);
    expect(toursAt('plateau', 'plateau:cafe:32')).toEqual([]);
    const known = new Set(ROUTES.flatMap(r => [r.from.frag, r.to.frag]));
    for (const p of [tour.stops[0].place, tour.stops[1].place]) expect(known.has(p.frag)).toBe(true);     // the stops are places the ordinary deliveries already use
    expect(known.has(tour.pickup.frag)).toBe(false);                                                         // the café is a new pick-up, not a new place
    expect(new Set([tour.pickup.frag, tour.stops[0].place.frag, tour.stops[1].place.frag]).size).toBe(3);
    expect(tourTotal(tour)).toBe(4500);
    expect(tourById(tour.id)).toBe(tour);
  });
  it('the order decides who waits: at trust 0 each order reaches the first client in time and the second too late', () => {
    const s = fresh();
    const a = previewOrder(s, tour, BANK_FIRST), b = previewOrder(s, tour, SQUARE_FIRST);
    expect(a.onTime).toEqual([true, false]);
    expect(b.onTime).toEqual([true, false]);
    expect(a.pay).not.toBe(b.pay);                                       // …and they pay differently
    expect(a.pay).toBe(1300 + Math.round(2000 * ECONOMY.tiak.latePayFactor) + 1200);
    expect(b.pay).toBe(2000 + Math.round(1300 * ECONOMY.tiak.latePayFactor) + 1200);
    expect(a.arrive[1]).toBeCloseTo(tour.legS.p0 + tour.legS.ab);
    expect(b.arrive[1]).toBeCloseTo(tour.legS.p1 + tour.legS.ba);
  });
  it('the client served first can always be reached with at least a fifth to spare, even at the lowest trust', () => {
    const s = fresh();
    for (const stop of tour.stops) s.data.counters[`tiak_trust_${stop.id}`] = ECONOMY.tiak.tour.trustMin;
    for (const order of ORDERS) {
      const p = previewOrder(s, tour, order);
      expect(p.limit[0] / p.arrive[0]).toBeGreaterThanOrEqual(1.2);
      expect(p.onTime[0]).toBe(true);
    }
  });
  it('what the clients remember can make the whole tour achievable: with both at top trust the first order is on time twice', () => {
    const s = fresh();
    for (const stop of tour.stops) s.data.counters[`tiak_trust_${stop.id}`] = ECONOMY.tiak.tour.trustMax;
    expect(previewOrder(s, tour, BANK_FIRST).onTime).toEqual([true, true]);
    expect(previewOrder(s, tour, SQUARE_FIRST).onTime[1]).toBe(false);     // the agency client still cannot wait the long way round
  });
});

describe('the tour: accepting and the clock', () => {
  it('accepting puts both parcels in hand at once, fixes the limits and the pay, and does not start the clock', () => {
    const s = fresh(); s.tick(5000);
    const job = acceptTour(s, tour.id, SQUARE_FIRST)!;
    expect(job.stage).toBe('deliver'); expect(job.routeId).toBe(`tour:${tour.id}`);
    expect(job.tour).toMatchObject({ id: tour.id, order: [1, 0], leg: 0, departed: false, limitS: [12, 17], pay: [1300, 2000], late: [] });
    expect(job.pay).toBe(4500);
    expect(tourRemainingMs(s)).toBe(Infinity);
    s.tick(60000); expect(tourRemainingMs(s)).toBe(Infinity);            // standing at the pick-up costs nothing
    expect(depart(s)).toBe(true); expect(depart(s)).toBe(false);
    s.tick(10000);
    expect(tourRemainingMs(s)).toBe(17000 - 10000);                      // the first stop served is the dames
    expect(tourRemainingMs(s, 1)).toBe(12000 - 10000);                   // and the agency's clock runs from the same start
  });
  it('is gated like any delivery: one at a time, enough energy, in its own hub, a real order', () => {
    const s = fresh();
    expect(whyNotTour(s, tour)).toBeNull();
    s.data.needs.energie = ECONOMY.tiak.tour.minEnergy - 1;
    expect(whyNotTour(s, tour)).toBe('Trop fatigué'); expect(acceptTour(s, tour.id, BANK_FIRST)).toBeNull();
    s.data.needs.energie = 80;
    s.data.hub = 'plateau'; expect(whyNotTour(s, tour)).toBe('Pas dans ce quartier'); s.data.hub = 'pikine';
    expect(acceptTour(s, 'nope', BANK_FIRST)).toBeNull();
    expect(acceptTour(s, tour.id, [0, 0] as unknown as Order)).toBeNull();
    expect(acceptTour(s, tour.id, BANK_FIRST)).not.toBeNull();
    expect(whyNotTour(s, tour)).toBe('Une livraison est déjà en cours');
    expect(acceptTour(s, tour.id, SQUARE_FIRST)).toBeNull();
    expect(acceptJob(s, 'pk_mame_boutique', true, 60000)).toBeNull();
  });
  it('is open from the very start: no classic delivery needed first', () => {
    const s = fresh();
    expect(s.data.counters.livraisons ?? 0).toBe(0);
    expect(whyNotTour(s, tour)).toBeNull();
  });
});

describe('the tour: different orders, different outcomes', () => {
  it('bank first, both on time: 4 500 F, every client happier', () => {
    const s = fresh(); const w = s.wallet;
    const s2 = fresh(); for (const stop of tour.stops) s2.data.counters[`tiak_trust_${stop.id}`] = 5;          // the clients' patience stretches the limits…
    const r = run(s2, BANK_FIRST, [tour.legS.p0, tour.legS.p0 + tour.legS.ab]);       // both at the measured riding times
    expect(r.first.late).toBe(false); expect(r.second.late).toBe(false);
    expect(r.second.finished).toBe(true);
    expect(r.second.bonus).toBe(1200);
    expect(s2.wallet - 3000).toBeGreaterThanOrEqual(4500);                  // …and their trust raises the pay
    expect(w).toBe(s.wallet);
  });
  it('bank first at trust 0: the dames wait too long: 3 700 F, the agency +1, the dames −1', () => {
    const s = fresh(); const w = s.wallet;
    const r = run(s, BANK_FIRST, [5, 21]);
    expect([r.first.late, r.second.late]).toEqual([false, true]);
    expect(r.first.paid).toBe(1300); expect(r.second.paid).toBe(1200); expect(r.second.bonus).toBe(1200);
    expect(s.wallet - w).toBe(3700);
    expect([trustOf(s, AGENCE), trustOf(s, DAMES)]).toEqual([1, -1]);
    expect(historyOf(s, AGENCE)).toEqual({ ok: 1, late: 0, dropped: 0 }); expect(historyOf(s, DAMES)).toEqual({ ok: 0, late: 1, dropped: 0 });
  });
  it('dames first at trust 0: the agency waits too long: 3 980 F, the dames +1, the agency −1', () => {
    const s = fresh(); const w = s.wallet;
    const r = run(s, SQUARE_FIRST, [10, 26]);
    expect([r.first.late, r.second.late]).toEqual([false, true]);
    expect(r.first.paid).toBe(2000); expect(r.second.paid).toBe(780); expect(r.second.bonus).toBe(1200);
    expect(s.wallet - w).toBe(3980);
    expect([trustOf(s, AGENCE), trustOf(s, DAMES)]).toEqual([-1, 1]);
  });
  it('a stop pays when it is handed over, the bonus only with the last, and the energy cost is per stop', () => {
    const s = fresh(); const w = s.wallet, e = s.data.needs.energie;
    const job = acceptTour(s, tour.id, BANK_FIRST)!; depart(s); s.tick(5000);
    const a = completeStop(s, job.runId)!;
    expect(a.finished).toBe(false); expect(a.bonus).toBe(0); expect(s.wallet - w).toBe(1300);
    expect(currentTour(s)!.index).toBe(1);
    expect(e - s.data.needs.energie).toBeCloseTo(-ECONOMY.tiak.fatigue.energie, 0);       // the stop’s fatigue (plus the few seconds of ordinary drain)
    expect(s.data.counters.livraisons).toBe(1); expect(s.data.counters.tournees ?? 0).toBe(0);
    s.tick(10000); const b = completeStop(s, job.runId)!;
    expect(b.finished).toBe(true); expect(s.data.counters.livraisons).toBe(2); expect(s.data.counters.tournees).toBe(1);
    expect(s.data.ledger.map(l => l.label)).toEqual([`Tournée Tiak Tiak → ${tour.stops[0].place.name}`, `Tournée Tiak Tiak → ${tour.stops[1].place.name}`, `Tournée complète : bonus (${tour.name})`]);
  });
  it('the variety bonus applies to stops and bonus like any active pay (≤ +15 %)', () => {
    const s = fresh(); for (const a of ['peche', 'artisanat', 'commerce'] as const) practise(s, a);
    const w = s.wallet; run(s, BANK_FIRST, [5, 21]);
    expect(s.wallet - w).toBeGreaterThan(3700); expect(s.wallet - w).toBeLessThanOrEqual(Math.round(1300 * 1.15) + Math.round(1200 * 1.15) + Math.round(1200 * 1.15) + 1);
  });
});

describe('the tour: nothing is paid twice, and abandoning is disclosed and priced', () => {
  it('a finished tour cannot be paid again, with the same run id or a stale copy of the run', () => {
    const s = fresh(); const stale = JSON.parse(JSON.stringify(acceptTour(s, tour.id, BANK_FIRST)));
    s.data.jobs.active = JSON.parse(JSON.stringify(stale)); s.data.jobs.active!.tour!.departed = true;
    s.tick(1000); completeStop(s, stale.runId); s.tick(1000);
    const done = completeStop(s, stale.runId)!; expect(done.finished).toBe(true);
    const wallet = s.wallet, ledger = s.data.ledger.length;
    expect(completeStop(s, stale.runId)).toBeNull();
    s.data.jobs.active = stale;                                          // the old copy comes back (an older save restored, a bad merge)
    expect(completeStop(s, stale.runId)).toBeNull();
    expect(s.wallet).toBe(wallet); expect(s.data.ledger.length).toBe(ledger);
  });
  it('reloading in the middle keeps the run exactly: the stop already paid is not paid again, the second one is', () => {
    const s = fresh(); const job = acceptTour(s, tour.id, SQUARE_FIRST)!; depart(s); s.tick(10000);
    expect(completeStop(s, job.runId)!.paid).toBe(2000);
    const back = new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
    expect(back.data.jobs.active).toEqual(s.data.jobs.active);
    expect(back.data.jobs.active!.tour).toMatchObject({ order: [1, 0], leg: 1, departed: true, late: [false] });
    expect(back.data.counters).toEqual(s.data.counters);
    expect(currentTour(back)!.index).toBe(0);                            // the agency is next, not the dames again
    back.tick(15000); const r = completeStop(back, job.runId)!;
    expect(r.finished).toBe(true); expect(back.wallet - s.wallet).toBe(r.paid + r.bonus);
    expect(back.data.jobs.done).toContain(job.runId);
  });
  it('abandoning before leaving the pick-up costs nothing', () => {
    const s = fresh(); const w = s.wallet, e = s.data.needs.energie;
    acceptTour(s, tour.id, BANK_FIRST);
    expect(abandonNote(s)).toMatch(/aucun coût/);
    expect(abandonTour(s)).toEqual({ free: true, lost: [] });
    expect(s.wallet).toBe(w); expect(s.data.needs.energie).toBe(e); expect(s.data.ledger).toEqual([]);
    expect(trustOf(s, AGENCE)).toBe(0); expect(trustOf(s, DAMES)).toBe(0);
    expect(s.data.jobs.active).toBeNull(); expect(abandonTour(s)).toBeNull();
  });
  it('abandoning on the road pays nothing and costs 1 trust with each client not delivered, as the note says', () => {
    const s = fresh(); const w = s.wallet;
    acceptTour(s, tour.id, BANK_FIRST); depart(s); s.tick(5000);
    expect(abandonNote(s)).toContain('perdent 1 de confiance');
    expect(abandonNote(s)).toContain(tour.stops[0].client); expect(abandonNote(s)).toContain(tour.stops[1].client);
    expect(abandonTour(s)).toEqual({ free: false, lost: [tour.stops[0].client, tour.stops[1].client] });
    expect(s.wallet).toBe(w); expect(s.data.counters.livraisons ?? 0).toBe(0);
    expect([trustOf(s, AGENCE), trustOf(s, DAMES)]).toEqual([-1, -1]);
    expect(historyOf(s, AGENCE).dropped).toBe(1);
  });
  it('abandoning after the first stop keeps its pay, forfeits the bonus, and only the waiting client loses trust', () => {
    const s = fresh(); const w = s.wallet;
    const job = acceptTour(s, tour.id, BANK_FIRST)!; depart(s); s.tick(5000); completeStop(s, job.runId);
    expect(abandonNote(s)).toContain('reste payé'); expect(abandonNote(s)).toContain(tour.stops[1].client); expect(abandonNote(s)).not.toContain(tour.stops[0].client);
    expect(abandonTour(s)!.lost).toEqual([tour.stops[1].client]);
    expect(s.wallet - w).toBe(1300);
    expect([trustOf(s, AGENCE), trustOf(s, DAMES)]).toEqual([1, -1]);
    expect(s.data.counters.tournees ?? 0).toBe(0);
  });
  it('quitting after each first stop over and over earns less per run than a full tour and sinks the abandoned client to the floor', () => {
    const s = fresh(); const w = s.wallet;
    for (let i = 0; i < 12; i++) {
      s.data.needs.energie = 90;
      const job = acceptTour(s, tour.id, SQUARE_FIRST)!; depart(s); s.tick(10000); completeStop(s, job.runId); abandonTour(s);
    }
    const perRun = (s.wallet - w) / 12;
    expect(perRun).toBeLessThan(tourTotal(tour) * 0.6);
    expect(trustOf(s, AGENCE)).toBe(ECONOMY.tiak.tour.trustMin);          // never lower than the floor…
    expect(whyNotTour(s, tour)).toBeNull();                              // …and the tour is still on offer
  });
  it('an ordinary delivery cannot hand over, cancel or pay a tour in hand', () => {
    const s = fresh(); const job = acceptTour(s, tour.id, BANK_FIRST)!; depart(s); s.tick(1000);
    expect(completeJob(s, job.runId)).toBeNull();
    expect(s.data.jobs.active).not.toBeNull(); expect(s.data.jobs.done).toEqual([]);
    expect(cancelJob(s)).toBe(true);                                      // the generic cancel is the ordinary delivery's: the tour's own way out is abandonTour
    expect(s.wallet).toBe(3000);
  });
});

describe('the tour: what the clients remember', () => {
  it('trust is whole numbers from −3 to +5; patience moves the limit and trust above 0 the pay', () => {
    const s = fresh(); const T = ECONOMY.tiak.tour;
    expect(trustOf(s, AGENCE)).toBe(0);
    s.data.counters[`tiak_trust_${AGENCE}`] = 99; expect(trustOf(s, AGENCE)).toBe(T.trustMax);
    s.data.counters[`tiak_trust_${AGENCE}`] = -99; expect(trustOf(s, AGENCE)).toBe(T.trustMin);
    expect(patienceFactor(0)).toBe(1); expect(patienceFactor(5)).toBeCloseTo(1.3); expect(patienceFactor(-3)).toBeCloseTo(0.82);
    expect(payFactor(0)).toBe(1); expect(payFactor(5)).toBeCloseTo(1.2); expect(payFactor(-3)).toBe(1);
  });
  it('a later offer shows the memory: more patience and pay after good deliveries, less patience after a late one', () => {
    const s = fresh();
    expect(limitsOf(s, tour)).toEqual([12, 17]); expect(paysOf(s, tour)).toEqual([1300, 2000]);
    run(s, BANK_FIRST, [5, 40]);                                           // agency on time (+1), dames late (−1)
    expect(limitsOf(s, tour)).toEqual([12.7, 16]);                          // 12 × 1.06, 17 × 0.94
    expect(paysOf(s, tour)).toEqual([1352, 2000]);                          // 1300 × 1.04; no malus for the dames, only less patience
    const next = acceptTour(s, tour.id, BANK_FIRST)!;
    expect(next.tour!.limitS).toEqual([12.7, 16]); expect(next.tour!.pay).toEqual([1352, 2000]);   // fixed in the run: what was shown is what is paid
  });
  it('a client who lost trust is recoverable: three stops on time bring the lowest trust back to 0, and nothing is ever refused', () => {
    const s = fresh(); s.data.counters[`tiak_trust_${AGENCE}`] = -3;
    expect(whyNotTour(s, tour)).toBeNull();
    for (let i = 0; i < 3; i++) { s.data.needs.energie = 90; run(s, BANK_FIRST, [5, 40]); }   // the agency is served first and on time each time
    expect(trustOf(s, AGENCE)).toBe(0);
  });
  it('old saves have no memory and start every client at trust 0; no schema change', () => {
    const m = migrate({ schemaVersion: 5, wallet: 10, counters: { livraisons: 4 } })!;
    expect(SCHEMA_VERSION).toBe(5); expect(m.schemaVersion).toBe(5);
    const s = new GameState(m);
    expect(trustOf(s, AGENCE)).toBe(0); expect(historyOf(s, DAMES)).toEqual({ ok: 0, late: 0, dropped: 0 });
    expect(m.jobs).toEqual({ active: null, done: [], seq: 0 });
    expect(m.counters).toEqual({ livraisons: 4 });
  });
  it('the memory survives a save and a reload', () => {
    const s = fresh(); run(s, SQUARE_FIRST, [10, 26]);
    const back = new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
    expect([trustOf(back, AGENCE), trustOf(back, DAMES)]).toEqual([-1, 1]);
    expect(limitsOf(back, tour)).toEqual(limitsOf(s, tour));
  });
});

describe('the tour: saves', () => {
  const base = (tourRun: unknown) => ({ schemaVersion: 5, jobs: { active: { runId: 'r1', routeId: 'tour:x', hub: 'pikine', stage: 'deliver', pay: 4500, startedMs: 5, limitMs: 0, tour: tourRun }, done: [], seq: 1 } });
  const good = { id: tour.id, order: [1, 0], leg: 1, departed: true, limitS: [12, 17], pay: [1300, 2000], late: [false] };
  it('an active tour round-trips', () => {
    const m = migrate(base(good))!;
    expect(m.jobs.active!.tour).toEqual(good);
    expect(migrate(JSON.parse(JSON.stringify(m)))!.jobs.active).toEqual(m.jobs.active);
  });
  it('a tour that cannot be read is dropped with the run, nothing paid', () => {
    for (const bad of [{ ...good, order: [0, 0] }, { ...good, order: [0] }, { ...good, late: [] }, { ...good, leg: 0 }, { ...good, limitS: [1, -1] }, { ...good, pay: 'x' }, 'nope', null]) {
      expect(migrate(base(bad))!.jobs.active, JSON.stringify(bad)).toBeNull();
    }
  });
  it('a tour no longer in the table is dropped by abandonTour, free of charge', () => {
    const s = new GameState(migrate(base({ ...good, id: 'removed' }))!);
    expect(currentTour(s)).toBeNull();
    expect(abandonTour(s)).toEqual({ free: true, lost: [] });
    expect(s.data.jobs.active).toBeNull();
  });
});
