import { describe, it, expect } from 'vitest';
import { stubCanvas } from './hubstub';
import { GameState } from '../src/core/state';
import { HUB_IDS, type HubId } from '../src/core/types';
import { migrate, newSave } from '../src/core/save';
import { ECONOMY } from '../src/economy/config';
import { acceptJob, board, completeJob, deliveryLimitMs, offers, pickUp, pickupFrags } from '../src/economy/jobs';
import { BOARD, ROUTES, TIAK_PAY_MAX, TIAK_POINTS, TIAK_TYPE, districtOffers, limitFactor, payCap, routeById, routeMetres, routePay, tiakOffers, titleOf, typeOf } from '../src/economy/tiakOffers';
import { planTrip } from '../src/road/graph';
import { VTC_POINTS, stopOf } from '../src/transport/vtcRules';
import type { HubWorld } from '../src/world/types';

/**
 * Tiak Tiak everywhere (1.0.1, src/economy/tiakOffers.ts): every district has a rolling board of at least three valid runs at every hour, every pick-up and
 * drop-off is a place the district really builds and that a courier can walk up to, a run to another district exists only where the roads join the two,
 * the pay follows the length of the way inside a documented band, a saved run's pay is capped, and a run is paid once across a reload.
 */
stubCanvas();
const hubs: Partial<Record<HubId, HubWorld>> = {};
const hub = async (h: HubId) => { const { buildHub } = await import('../src/world/builder'); return (hubs[h] ??= buildHub(h, true)); };
const fresh = () => new GameState(newSave(0));
const DAYS = 6;
const everyWindow = (f: (h: HubId, day: number, hour: number) => void) => { for (const h of HUB_IDS) for (let day = 0; day < DAYS; day++) for (let hour = 0; hour < 24; hour++) f(h, 20400 + day, hour); };

describe('the delivery points of the five districts', () => {
  it('every district has at least four points, with distinct ids and names', () => {
    for (const h of HUB_IDS) {
      const pts = TIAK_POINTS[h];
      expect(pts.length, h).toBeGreaterThanOrEqual(4);
      expect(new Set(pts.map(p => p.id)).size).toBe(pts.length); expect(new Set(pts.map(p => p.frag)).size).toBe(pts.length);
      for (const p of pts) { expect(p.hub).toBe(h); expect(p.id).toMatch(/^[a-z]+$/); expect(p.name.length).toBeGreaterThan(3); }
    }
  });
  it('every point is a place its district really builds (an interactable of the built hub, or a VTC address of the district), where the table says it is', async () => {
    for (const h of HUB_IDS) {
      const w = await hub(h);
      for (const p of TIAK_POINTS[h]) {
        if (p.vtc) {
          const v = VTC_POINTS[h].find(q => q.id === p.vtc);
          expect(v, `${h}/${p.id}`).toBeTruthy();
          const wait = stopOf(v!).wait;
          expect(p.name).toBe(v!.name); expect(Math.hypot(wait.x - p.x, wait.z - p.z)).toBeLessThan(0.01);
          continue;
        }
        const it = w.interactables.find(i => i.id.startsWith(h + ':') && i.id.includes(p.frag));       // exactly how the game finds it (src/economy/ui.ts placeOf)
        expect(it, `${h}/${p.id} (${p.frag})`).toBeTruthy();
        expect(Math.hypot(it!.x - p.x, it!.z - p.z), `${h}/${p.id} at ${it!.x.toFixed(0)},${it!.z.toFixed(0)}`).toBeLessThan(4);
        expect(it!.name.split(' · ')[0] === p.name.split(' · ')[0] || p.frag === ':station', `${h}/${p.id}: ${it!.name}`).toBe(true);
      }
    }
  });
  it('every point can be walked up to from where the player arrives in the district (flood over the built hub\'s colliders, to within the hand-over radius)', async () => {
    const R = 0.45, CELL = 1, HALF = 190, N = (2 * HALF) / CELL;
    for (const h of HUB_IDS) {
      const w = await hub(h);
      const blocked = new Uint8Array(N * N);
      for (const c of w.colliders) {
        const i0 = Math.max(0, Math.floor((c.x0 - R + HALF) / CELL)), i1 = Math.min(N - 1, Math.floor((c.x1 + R + HALF) / CELL));
        const j0 = Math.max(0, Math.floor((c.z0 - R + HALF) / CELL)), j1 = Math.min(N - 1, Math.floor((c.z1 + R + HALF) / CELL));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL; if (x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R) blocked[j * N + i] = 1; }
      }
      const cell = (x: number, z: number) => Math.floor((z + HALF) / CELL) * N + Math.floor((x + HALF) / CELL);
      const seen = new Uint8Array(N * N), todo = [cell(w.spawn.x, w.spawn.z)];
      expect(blocked[todo[0]], `${h}: the spawn is free`).toBe(0);
      seen[todo[0]] = 1;
      while (todo.length) {
        const k = todo.pop()!, i = k % N, j = Math.floor(k / N);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
          const n = b * N + a; if (seen[n] || blocked[n]) continue;
          seen[n] = 1; todo.push(n);
        }
      }
      for (const p of TIAK_POINTS[h]) {
        const it = p.vtc ? p : w.interactables.find(i => i.id.startsWith(h + ':') && i.id.includes(p.frag))!;
        let best = Infinity;
        for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
          const x = Math.floor(it.x + dx) + 0.5, z = Math.floor(it.z + dz) + 0.5;
          if (seen[cell(x, z)]) best = Math.min(best, Math.hypot(x - it.x, z - it.z));
        }
        expect(best, `${h}/${p.id}: nearest walkable spot ${best.toFixed(1)} m away`).toBeLessThan(ECONOMY.tiak.arriveRadius - 0.5);
      }
    }
  });
  it('the fixed routes of 1.0 still resolve, and every place a run can leave from is a pick-up of its district', () => {
    for (const r of ROUTES) { expect(routeById(r.id)).toBe(r); expect(routePay(r)).toBe(ECONOMY.tiak.pay[r.id]); expect(routeMetres(r)).toBeNull(); }
    for (const h of HUB_IDS) for (const p of TIAK_POINTS[h]) expect(pickupFrags(h)).toContain(p.frag);
  });
});

describe('the rolling board', () => {
  it('every district, every hour of several days: at least three offers (five), all valid — existing places, reachable districts, leaving from the district', () => {
    let windows = 0;
    everyWindow((h, day, hour) => {
      windows++;
      const list = tiakOffers(h, day, hour), tag = `${h} d${day} h${hour}`;
      expect(list.length, tag).toBeGreaterThanOrEqual(3); expect(list.length, tag).toBe(BOARD.size);
      expect(new Set(list.map(r => r.id)).size, tag).toBe(list.length);
      for (const r of list) {
        const g = r.gen!;
        expect(r.hub, tag).toBe(h); expect(g.from.hub, tag).toBe(h);                               // offered FROM this district
        expect(TIAK_POINTS[h], tag).toContain(g.from);                                             // an existing place of this district
        expect(TIAK_POINTS[g.to.hub], tag).toContain(g.to);                                        // an existing place of the district it goes to
        expect(g.from).not.toBe(g.to);
        if (g.to.hub !== h) { expect(r.toHub).toBe(g.to.hub); expect(planTrip(h, g.to.hub), `${tag} → ${g.to.hub}`).not.toBeNull(); } else expect(r.toHub).toBeUndefined();
        expect(routeById(r.id), r.id).toEqual(r);                                                  // the id alone gives the run back (a reload, any hour)
        expect(r.from.frag).toBe(g.from.frag); expect(r.to.frag).toBe(g.to.frag);
      }
      expect(list.filter(r => !r.toHub).length, tag).toBe(BOARD.local);                            // short local jobs…
      expect(list.filter(r => r.toHub).length, tag).toBe(BOARD.size - BOARD.local);                // … and longer rides to other districts
      expect(list.filter(r => r.gen!.express).length, tag).toBeLessThanOrEqual(1);
    });
    expect(windows).toBe(5 * DAYS * 24);
  });
  it('is the same on every reload within the hour, and not the same list hour after hour', () => {
    for (const h of HUB_IDS) {
      const ids = (hour: number) => tiakOffers(h, 20400, hour).map(r => r.id).join('|');
      expect(ids(9)).toBe(ids(9)); expect(tiakOffers(h, 20400, 9.7).map(r => r.id).join('|')).toBe(ids(9));
      const boards = new Set(Array.from({ length: 24 }, (_, hour) => ids(hour)));
      expect(boards.size, h).toBeGreaterThanOrEqual(20);
      expect(tiakOffers(h, 20401, 9).map(r => r.id).join('|')).not.toBe(ids(9));
    }
    expect(tiakOffers('pikine', 20400, 9).map(r => r.id)).not.toEqual(tiakOffers('plateau', 20400, 9).map(r => r.id));
  });
  it('a run taken leaves the board and the next of the stream takes its place (still five, the others kept)', () => {
    everyWindow((h, day, hour) => {
      if (hour % 6) return;
      const list = tiakOffers(h, day, hour);
      for (const gone of list) {
        const after = tiakOffers(h, day, hour, new Set([gone.id]));
        const plain = (id: string) => id.replace(/!$/, '');
        expect(after.map(r => plain(r.id))).not.toContain(plain(gone.id));
        expect(after.length).toBe(BOARD.size);
        expect(after.filter(r => list.some(o => plain(o.id) === plain(r.id))).length).toBeGreaterThanOrEqual(BOARD.size - 2);
        for (const r of after) if (r.toHub) expect(planTrip(h, r.toHub)).not.toBeNull();
      }
    });
    // even with every local pair of a small district skipped, the board is never empty
    const all = new Set(TIAK_POINTS.mermoz.flatMap(a => TIAK_POINTS.mermoz.map(b => `t:mermoz.${a.id}>mermoz.${b.id}`)));
    expect(tiakOffers('mermoz', 20400, 3, all).length).toBeGreaterThanOrEqual(3);
  });
  it('covers the trips the owner named, and every kind of delivery', () => {
    const titles = new Set<string>(), types = new Set<string>();
    for (const h of HUB_IDS) for (let day = 0; day < 30; day++) for (let hour = 0; hour < 24; hour++) for (const r of tiakOffers(h, 20400 + day, hour)) { titles.add(titleOf(r)); types.add(typeOf(r)); }
    for (const t of ['Plateau → Mermoz', 'Corniche → Pikine', 'Ngor → Almadies', 'Mermoz → Sacré-Cœur', 'Pikine → Plateau', 'Almadies → Mermoz']) expect([...titles], t).toContain(t);
    expect([...types].sort()).toEqual(Object.keys(TIAK_TYPE).sort());
    // the kind follows the place the parcel leaves from: a meal from a kitchen, papers from an agency or a residence, an order from a shop
    expect(typeOf(routeById('t:pikine.mame>pikine.banque')!)).toBe('repas');
    expect(typeOf(routeById('t:plateau.banque>mermoz.filaos')!)).toBe('documents');
    expect(typeOf(routeById('t:almadies.tech>almadies.place')!)).toBe('commande');
    expect(typeOf(routeById('t:almadies.port>almadies.pointe')!)).toBe('colis');
    expect(typeOf(routeById('t:almadies.port>almadies.pointe!')!)).toBe('express');
    expect(typeOf(routeById('pk_mame_boutique')!)).toBe('repas'); expect(titleOf(routeById('pk_mame_boutique')!)).toBe('Chez Mame → Boutique');
    expect(titleOf(routeById('x_pk_pl_diallo_ndeye')!)).toBe('Pikine → Plateau');
  });
  it('an id that names a place or a road this build does not have gives no run', () => {
    for (const id of ['t:pikine.mame>pikine.mame', 't:pikine.nowhere>pikine.banque', 't:mars.cafe>pikine.banque', 't:pikine.mame>ouakam.place', 't:pikine.mame', 'tour:pk_touba_tournee', '']) expect(routeById(id), id).toBeUndefined();
  });
  it('the board of the phone: the recommended run first once unlocked, then the rolling offers; the fixed routes stay at their counters', () => {
    const s = fresh();
    expect(board(s, 'pikine', 20400, 9).map(r => r.id)).toEqual(tiakOffers('pikine', 20400, 9).map(r => r.id));
    s.data.flags.push('tiak_client_pikine');
    const b = board(s, 'pikine', 20400, 9);
    expect(b[0].id).toBe('pk_reco_salon_bank'); expect(b.length).toBe(BOARD.size + 1);
    expect(offers(s, 'pikine').length).toBeGreaterThanOrEqual(6);
    for (const h of ['almadies', 'corniche', 'mermoz'] as const) expect(board(s, h, 20400, 9).length).toBe(BOARD.size);
  });
  it('lists a district\'s offers with their positions for another screen', () => {
    for (const h of HUB_IDS) {
      const list = districtOffers(h, 20400, 14), raw = tiakOffers(h, 20400, 14);
      expect(list.map(o => o.id)).toEqual(raw.map(r => r.id));
      for (const o of list) {
        expect(o.from.hub).toBe(h); expect(Number.isFinite(o.from.x) && Number.isFinite(o.from.z) && Number.isFinite(o.to.x) && Number.isFinite(o.to.z)).toBe(true);
        expect(o.pay).toBe(routePay(routeById(o.id)!)); expect(o.typeLabel).toBe(TIAK_TYPE[o.type]); expect(o.title).toContain(' → '); expect(o.metres).toBeGreaterThan(0);
      }
    }
  });
});

describe('pay from the length of the way', () => {
  const B = ECONOMY.tiak.band;
  it('every offer pays inside its documented band; an express pays the premium and allows less time', () => {
    everyWindow((h, day, hour) => {
      for (const r of tiakOffers(h, day, hour)) {
        const pay = routePay(r), x = r.gen!.express ? B.express.pay : 1, band = r.toHub ? B.away : B.local, m = routeMetres(r)!;
        expect(m).toBeGreaterThan(0);
        expect(pay, r.id).toBeGreaterThanOrEqual(band.min * x - 25); expect(pay, r.id).toBeLessThanOrEqual(band.max * x); expect(pay).toBeLessThanOrEqual(TIAK_PAY_MAX);
        expect(pay % 50).toBe(0);
        expect(limitFactor(r)).toBe(r.gen!.express ? B.express.limit : 1);
        const plainRun = routeById(r.id.replace(/!$/, ''))!;
        if (r.gen!.express) expect(pay).toBeGreaterThan(routePay(plainRun));
      }
    });
  });
  it('a longer way pays more: by the metre inside a district, by the roads and the districts crossed between two', () => {
    const pay = (id: string) => routePay(routeById(id)!), metres = (id: string) => routeMetres(routeById(id)!)!;
    expect(metres('t:pikine.maiga>pikine.garage')).toBe(24); expect(pay('t:pikine.maiga>pikine.garage')).toBe(B.local.min);
    expect(metres('t:pikine.mame>pikine.diallo')).toBe(210); expect(pay('t:pikine.mame>pikine.diallo')).toBe(1350);
    expect(pay('t:pikine.garage>pikine.diallo')).toBeGreaterThan(pay('t:pikine.mame>pikine.diallo'));
    expect(pay('t:pikine.garage>pikine.diallo')).toBeLessThanOrEqual(B.local.max);
    // between districts: always more than any run inside one; two roads pay more than one
    const local = Math.max(...HUB_IDS.flatMap(h => TIAK_POINTS[h].flatMap(a => TIAK_POINTS[h].filter(b => b !== a).map(b => pay(`t:${h}.${a.id}>${h}.${b.id}`)))));
    expect(local).toBeLessThanOrEqual(B.local.max);
    for (const a of HUB_IDS) for (const b of HUB_IDS) {
      if (a === b) continue;
      const id = `t:${a}.${TIAK_POINTS[a][0].id}>${b}.${TIAK_POINTS[b][0].id}`;
      expect(pay(id), id).toBeGreaterThan(local); expect(pay(id), id).toBeLessThanOrEqual(B.away.max);
      expect(metres(id)).toBeGreaterThanOrEqual(planTrip(a, b)!.metres);
    }
    expect(pay('t:plateau.banque>mermoz.filaos')).toBeGreaterThan(pay('t:pikine.diallo>plateau.ndeye'));
    expect(pay('t:pikine.diallo>plateau.ndeye')).toBeGreaterThan(pay('t:almadies.pointe>corniche.cafe'));
    expect(pay('t:pikine.diallo>plateau.ndeye!')).toBe(Math.round(pay('t:pikine.diallo>plateau.ndeye') * B.express.pay / 50) * 50);
  });
  it('the pay is fixed at acceptance and paid as stated; late: the usual share', () => {
    const s = fresh(), r = tiakOffers('almadies', 20400, 9).find(x => !x.toHub && !x.gen!.express)!;
    const limit = Math.round(deliveryLimitMs(routeMetres(r)!) * limitFactor(r));
    const job = acceptJob(s, r.id, false, limit)!;
    expect(job.pay).toBe(routePay(r)); expect(job.stage).toBe('pickup'); expect(job.hub).toBe('almadies');
    expect(pickUp(s, limit)).toBe(true);
    const w = s.wallet, c = completeJob(s, job.runId)!;
    expect(c.paid).toBe(routePay(r)); expect(s.wallet - w).toBe(routePay(r)); expect(c.late).toBe(false);
    const late = acceptJob(s, r.id, true, limit)!; s.tick(limit + 1000);
    expect(completeJob(s, late.runId)!.paid).toBe(Math.round(routePay(r) * ECONOMY.tiak.latePayFactor));
  });
});

describe('a saved run: capped pay, paid once across a reload', () => {
  const reload = (s: GameState) => new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
  it('a saved active job cannot carry more than its route pays (a fixed route, a generated one, an express, a tour)', () => {
    const active = (routeId: string, pay: number, extra: object = {}) => migrate({ schemaVersion: 6, jobs: { active: { runId: 'r9', routeId, hub: 'pikine', stage: 'deliver', pay, startedMs: 0, limitMs: 60000, ...extra }, done: [], seq: 1 } })!.jobs.active!;
    expect(active('pk_mame_boutique', 9_999_999).pay).toBe(1200);
    expect(active('pk_mame_boutique', 800).pay).toBe(800);                                          // a lower pay is left as it is
    expect(active('t:pikine.mame>pikine.diallo', 5_000_000).pay).toBe(1350);
    expect(active('t:pikine.diallo>plateau.ndeye!', 5_000_000).pay).toBe(routePay(routeById('t:pikine.diallo>plateau.ndeye!')!));
    expect(active('some_removed_route', 5_000_000).pay).toBe(TIAK_PAY_MAX);                         // not a route of this build: dropped unpaid by the game (ui.ts update)
    expect(payCap('pk_reco_salon_bank')).toBe(2200); expect(payCap('nope')).toBe(TIAK_PAY_MAX);
    const tour = active('tour:pk_touba_tournee', 99_000_000, { tour: { id: 'pk_touba_tournee', order: [0, 1], leg: 0, departed: false, limitS: [12, 17], pay: [8_000_000, 9_000_000], late: [] } });
    expect(tour.pay).toBe(TIAK_PAY_MAX); expect(tour.tour!.pay).toEqual([TIAK_PAY_MAX, TIAK_PAY_MAX]);
  });
  it('an edited pay is not paid out: the hand-over pays what the route pays', async () => {
    const s = fresh(), job = acceptJob(s, 't:corniche.cafe>corniche.place', true, 90000)!;
    job.pay = 7_000_000;                                                                            // edited in memory (the save's cap is checked above)
    expect(completeJob(s, job.runId)!.paid).toBe(routePay(routeById('t:corniche.cafe>corniche.place')!));
    const { acceptTour, completeStop, depart } = await import('../src/economy/tour');
    const t = fresh(), run = acceptTour(t, 'pk_touba_tournee', [0, 1])!;
    run.tour!.pay = [6_000_000, 6_000_000]; depart(t);
    expect(completeStop(t, run.runId)!.paid).toBeLessThanOrEqual(Math.round(1300 * (1 + ECONOMY.tiak.tour.payPerLevel * ECONOMY.tiak.tour.trustMax)));
  });
  it('a run in hand survives a reload, in any district and at any hour, and is paid exactly once', () => {
    for (const h of HUB_IDS) {
      const s = fresh(), r = tiakOffers(h, 20400, 11)[3];                                          // the ride to a neighbouring district
      expect(r.toHub).toBeTruthy();
      const job = acceptJob(s, r.id, true, 200000)!, w0 = s.wallet;
      const back = reload(s);                                                                       // reloaded mid-job: still in hand, same pay, nothing paid yet
      expect(back.data.jobs.active).toEqual(s.data.jobs.active); expect(back.wallet).toBe(w0);
      expect(routeById(back.data.jobs.active!.routeId)).toEqual(r);
      const c = completeJob(back, job.runId)!;
      expect(c.paid).toBe(routePay(r)); expect(back.wallet).toBe(w0 + routePay(r));
      expect(completeJob(back, job.runId)).toBeNull();
      const again = reload(back);                                                                   // reloaded after the hand-over: no parcel, nothing more
      expect(again.data.jobs.active).toBeNull(); expect(again.wallet).toBe(w0 + routePay(r)); expect(again.data.jobs.done).toContain(job.runId);
      again.data.jobs.active = { ...job };                                                          // a stale copy of the run comes back (a reconnect replaying it): not paid again
      expect(completeJob(again, job.runId)).toBeNull(); expect(again.wallet).toBe(w0 + routePay(r));
      const stale = migrate({ ...JSON.parse(JSON.stringify(again.data)), jobs: { ...again.data.jobs, active: { ...job } } })!;   // … and a save carrying it is cleaned at load
      expect(stale.jobs.active).toBeNull();
      expect(again.data.ledger.filter(l => /Livraison Tiak Tiak/.test(l.label)).length).toBe(1);
    }
  });
});
