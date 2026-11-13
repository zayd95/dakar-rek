import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate } from '../src/core/save';
import type { AssetState } from '../src/core/types';
import { ECONOMY } from '../src/economy/config';
import { ECON_MONTH_MS, REAL_DAY_MS, contractMonthAt, econMonthAt } from '../src/economy/calendar';
import { CITY_DAY_MS } from '../src/core/clock';
import { furnitureSpec, homeSpec, specOf } from '../src/economy/catalog';
import { HOUR_MS, accrue, buyAsset, cannotMoveIn, cannotSell, chargesPerHour, currentHome, furnitureIn, moveIn, rentAsset, rentOf, takeNotices } from '../src/economy/assets';
import { layoutOf, roomOf } from '../src/economy/placement';
import {
  cannotEndNow, cannotFurnish, cannotOffer, cannotSign, contractOf, contracts, endNow, furnish, furnished, keepOffer, occupancy, occupancyOf, offer, owed, setNotice,
  settleMonthly, settlementKey, signLease, stopOffer, tenantIn, viewOf,
} from '../src/economy/monthly';

const F2 = 'appart_jamm', T = ECONOMY.monthly.f2, COST = T.rent + T.charges, M = ECON_MONTH_MS, PLAY = ECONOMY.monthly.minPlayMs;
const T0 = Date.UTC(2026, 10, 13, 12, 0, 0);
const fresh = (wallet = 1_000_000) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
const play = (s: GameState, ms = PLAY) => { s.data.playedMs += ms; };
const back = (s: GameState) => new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
/** A player whose F2 finds a tenant in the month that begins at `at` with the occupancy wanted (the demand is seeded by the player). */
function playerWith(want: (occ: number) => boolean, at = T0, wallet = 1_000_000): GameState {
  for (let i = 0; i < 500; i++) {
    const s = fresh(wallet); s.data.guestId = `guest-${i}`;
    if (want(occupancy(`${s.data.guestId}:${F2}`, econMonthAt(at)))) return s;
  }
  throw new Error('no such player');
}
const lease = (s: GameState) => contracts(s)[0];

describe('the economic calendar', () => {
  it('one economic month is seven real days, far from the 24-minute city day', () => {
    expect(M).toBe(7 * REAL_DAY_MS);
    expect(M / CITY_DAY_MS).toBe(420);                                     // 420 city days turn in one economic month
    expect(contractMonthAt(T0, T0 + M - 1)).toBe(0); expect(contractMonthAt(T0, T0 + M)).toBe(1); expect(contractMonthAt(T0, T0 - 5 * M)).toBe(0);
  });
});

describe('the F2 by the month', () => {
  it('the listing leads with the monthly terms; buying stays possible; the description still names the rooms, the area and the floor', () => {
    const sp = homeSpec(F2)!;
    expect(sp.monthly).toEqual({ rent: 50_000, charges: 10_000, sublet: 60_000, furnished: 150_000, pack: 300_000 });
    expect(sp.price).toBe(15_000_000); expect(sp.size).toBe(63);
    expect(sp.what).toMatch(/Entrée, séjour, cuisine, chambre et salle de bain, au premier étage/);
    expect(buyAsset(fresh(20_000_000), F2)?.how).toBe('owned');
  });
  it('signing pays the first month once (rent and charges) and nothing is charged per city hour', () => {
    const s = fresh(100_000);
    expect(cannotSign(fresh(59_999), F2)).toMatch(/premier mois/);
    const a = signLease(s, F2, T0)!;
    expect(s.wallet).toBe(100_000 - COST); expect(a.how).toBe('rented'); expect(a.lease).toMatchObject({ start: T0, k: 0, rent: 50_000, charges: 10_000, mode: 'live', debt: 0 });
    expect(cannotSign(s, F2)).toBe('Tu le loues déjà');
    expect(chargesPerHour(s)).toBe(0);
    play(s, 600 * HOUR_MS); accrue(s);                                    // ten hours of play, 600 city hours: the fast clock collects nothing
    expect(s.wallet).toBe(100_000 - COST);
    expect(s.data.ledger.filter(l => /Loyer/.test(l.label))).toHaveLength(1);
  });
  it('a month is settled once: at the month\'s turn, never before, never twice, and the state survives a reload', () => {
    const s = fresh(500_000); signLease(s, F2, T0); play(s);
    expect(settleMonthly(s, T0 + M - 1)).toEqual([]);
    const first = settleMonthly(s, T0 + M);
    expect(first).toHaveLength(1); expect(first[0]).toMatchObject({ month: 1, revenue: 0, cost: COST, paid: COST });
    expect(s.wallet).toBe(500_000 - 2 * COST);
    for (let i = 0; i < 50; i++) { play(s); expect(settleMonthly(s, T0 + M + i * 60_000)).toEqual([]); }       // called again and again: nothing
    expect(s.wallet).toBe(500_000 - 2 * COST);
    expect(s.data.assets.settled).toEqual([settlementKey(lease(s).uid, 0), settlementKey(lease(s).uid, 1)]);
    const r = back(s);                                                     // saved, loaded
    expect(lease(r).lease).toEqual(lease(s).lease); expect(r.data.assets.settled).toEqual(s.data.assets.settled);
    play(r); expect(settleMonthly(r, T0 + M + 3600_000)).toEqual([]); expect(r.wallet).toBe(s.wallet);
    expect(settleMonthly(r, T0 + 2 * M)).toHaveLength(1); expect(r.wallet).toBe(500_000 - 3 * COST);
  });
  it('a clock set back never pays or charges again; a clock set forward settles one batch per half hour of play', () => {
    const s = fresh(2_000_000); signLease(s, F2, T0); play(s);
    settleMonthly(s, T0 + M);
    const w = s.wallet;
    play(s); expect(settleMonthly(s, T0 - 30 * M)).toEqual([]); expect(settleMonthly(s, T0 + M / 2)).toEqual([]);
    expect(s.wallet).toBe(w);
    const t = fresh(2_000_000); signLease(t, F2, T0);
    expect(settleMonthly(t, T0 + M)).toEqual([]);                          // the month has turned, but nothing was played since the signature
    play(t, PLAY - 1); expect(settleMonthly(t, T0 + M)).toEqual([]); expect(viewOf(t, lease(t), T0 + M).waiting).toBe(true);
    play(t, 1); expect(settleMonthly(t, T0 + M)).toHaveLength(1);
    expect(settleMonthly(t, T0 + 2 * M)).toEqual([]);                      // the next month at once: not without playing
  });
  it('after an absence the catch-up is capped: four months settled, the rest skipped whole, and the contract goes on from now', () => {
    const s = playerWith(() => true); s.data.wallet = 5_000_000;
    const a = signLease(s, F2, T0)!; play(s);
    const out = settleMonthly(s, T0 + 10 * M + 1000);
    expect(out).toHaveLength(ECONOMY.monthly.catchUpMonths); expect(out.map(o => o.month)).toEqual([1, 2, 3, 4]); expect(out[3].skipped).toBe(6);
    expect(s.wallet).toBe(5_000_000 - COST - 4 * COST);
    expect(a.lease!.k).toBe(10);
    expect(takeNotices().join(' ')).toMatch(/dormi/);
    play(s); expect(settleMonthly(s, T0 + 10 * M + 2000)).toEqual([]);
    expect(settleMonthly(s, T0 + 11 * M)).toHaveLength(1);
  });
});

describe('tenant demand', () => {
  it('averages 80 % over many seeded months, with empty months and real variance; the same month always gives the same answer', () => {
    const all: number[] = [];
    for (let p = 0; p < 40; p++) for (let m = 0; m < 500; m++) all.push(occupancy(`guest-${p}:${F2}`, m));
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    expect(mean).toBeGreaterThan(78.5); expect(mean).toBeLessThan(81.5);
    const empty = all.filter(o => o === 0).length / all.length;
    expect(empty).toBeGreaterThan(0.08); expect(empty).toBeLessThan(0.12);
    expect(Math.min(...all.filter(o => o > 0))).toBe(ECONOMY.monthly.occMin); expect(Math.max(...all)).toBe(ECONOMY.monthly.occMax);
    expect(new Set(all).size).toBeGreaterThan(20);
    const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length);
    expect(sd).toBeGreaterThan(20);
    // one player's twelve months are not all alike, and each is between 0 and 100
    const year = Array.from({ length: 12 }, (_, m) => occupancy(`guest-7:${F2}`, m));
    expect(new Set(year).size).toBeGreaterThan(4);
    expect(occupancy(`guest-7:${F2}`, 3)).toBe(occupancy(`guest-7:${F2}`, 3));
    // every single player's long run is near 80 % too
    for (let p = 0; p < 10; p++) { const one = Array.from({ length: 2000 }, (_, m) => occupancy(`g${p}:${F2}`, m)); const avg = one.reduce((a, b) => a + b, 0) / one.length; expect(avg).toBeGreaterThan(77); expect(avg).toBeLessThan(83); }
  });
});

describe('furnishing and letting', () => {
  it('the pack costs 300 000 F once and really places its pieces in the rooms of the F2', () => {
    const s = fresh(1_000_000), a = signLease(s, F2, T0)!, w = s.wallet;
    expect(cannotOffer(s, a.uid, 'furnished', T0)).toBe('Pas encore meublé');
    const pieces = furnish(s, a.uid)!;
    expect(s.wallet).toBe(w - 300_000);
    expect(pieces.map(p => p.spec)).toEqual(ECONOMY.monthly.pack);
    expect(pieces.reduce((t, p) => t + p.paid, 0)).toBeLessThanOrEqual(300_000);
    expect(ECONOMY.monthly.pack.reduce((t, id) => t + furnitureSpec(id)!.price!, 0)).toBe(299_500);
    const L = layoutOf(homeSpec(F2)!), room = (id: string) => roomOf(L, furnitureIn(s, a.uid).find(f => f.spec === id)!.at!)?.id;
    expect(pieces.every(p => p.home === a.uid && p.at)).toBe(true);        // every piece stands in the apartment
    expect(room('lit_bois')).toBe('chambre'); expect(room('armoire_metal')).toBe('chambre'); expect(room('canape_wax')).toBe('sejour'); expect(room('table_cuisine')).toBe('cuisine');
    expect(furnished(s, a)).toBe(true);
    expect(cannotFurnish(s, a.uid)).toBe('Déjà meublé'); expect(furnish(s, a.uid)).toBeNull(); expect(s.wallet).toBe(w - 300_000);
    expect(s.data.ledger.filter(l => /Pack meublé/.test(l.label))).toHaveLength(1);
    const r = back(s); expect(furnished(r, lease(r))).toBe(true); expect(lease(r).lease.pack).toEqual(a.lease!.pack);
  });
  it('a full month at 80 % furnished nets 60 000 F: the pack is paid back in five months; the table of profits by occupancy', () => {
    const net = (occ: number, potential: number) => Math.floor(potential * occ / 100) - COST;
    expect([0, 50, 80, 100].map(o => net(o, T.furnished))).toEqual([-60_000, 15_000, 60_000, 90_000]);
    expect([0, 50, 80, 100].map(o => net(o, T.sublet))).toEqual([-60_000, -30_000, -12_000, 0]);
    expect(T.pack / net(80, T.furnished)).toBe(5);
    // the same through the real settlement, for a player whose month is let at exactly 80 %
    const s = playerWith(o => o === 80, T0), a = signLease(s, F2, T0)!; furnish(s, a.uid);
    expect(offer(s, a.uid, 'furnished', T0)).toBe(true);
    expect(viewOf(s, lease(s), T0)).toMatchObject({ occ: 80, revenue: 120_000, cost: COST, profit: 60_000, nextAt: T0 + M });
    play(s); const w = s.wallet, out = settleMonthly(s, T0 + M);
    expect(out).toHaveLength(1); expect(out[0]).toMatchObject({ occ: 80, revenue: 120_000, paid: COST });
    expect(s.wallet - w).toBe(60_000);
    expect(s.data.ledger.slice(-2).map(l => l.amount)).toEqual([120_000, -COST]);
  });
  it('a vacant month earns nothing and the rent is still due; offered half way through the month earns half', () => {
    const v = playerWith(o => o === 0, T0), a = signLease(v, F2, T0)!; furnish(v, a.uid); offer(v, a.uid, 'furnished', T0);
    expect(tenantIn(v, lease(v))).toBe(false);
    play(v); const w = v.wallet; expect(settleMonthly(v, T0 + M)[0]).toMatchObject({ occ: 0, revenue: 0, paid: COST }); expect(v.wallet - w).toBe(-COST);
    const h = playerWith(o => o === 100, T0), b = signLease(h, F2, T0)!;
    expect(offer(h, b.uid, 'sublet', T0 + M / 2)).toBe(true);
    play(h); expect(settleMonthly(h, T0 + M)[0].revenue).toBe(T.sublet / 2);
  });
  it('over many seeded months a furnished F2 averages about 60 000 F a month, some months at a loss', () => {
    let total = 0, n = 0, losses = 0;
    for (let p = 0; p < 30; p++) {
      const s = fresh(100_000_000); s.data.guestId = `long-${p}`;
      const a = signLease(s, F2, T0)!; furnish(s, a.uid); offer(s, a.uid, 'furnished', T0);
      for (let m = 1; m <= 100; m++) { play(s); const w = s.wallet; const out = settleMonthly(s, T0 + m * M); expect(out).toHaveLength(1); total += s.wallet - w; n++; if (s.wallet < w) losses++; }
    }
    expect(total / n).toBeGreaterThan(56_000); expect(total / n).toBeLessThan(64_000);
    expect(losses / n).toBeGreaterThan(0.06); expect(losses / n).toBeLessThan(0.14);
  });
});

describe('the rules of a sublet', () => {
  it('exclusive: not lived in while let, not let while lived in, and the pack stays behind when the player moves out', () => {
    const s = playerWith(o => o > 0, T0), a = signLease(s, F2, T0)!;
    expect(moveIn(s, a.uid)).toBe(true);
    expect(cannotOffer(s, a.uid, 'sublet', T0)).toMatch(/Tu y habites/); expect(offer(s, a.uid, 'sublet', T0)).toBe(false);
    furnish(s, a.uid);
    const room = s.data.assets.list.find(x => x.how === 'given')!;
    expect(moveIn(s, room.uid)).toBe(true);
    expect(furnished(s, a)).toBe(true); expect(furnitureIn(s, a.uid)).toHaveLength(ECONOMY.monthly.pack.length);    // the pack did not follow
    expect(offer(s, a.uid, 'furnished', T0)).toBe(true);
    expect(cannotMoveIn(s, a.uid)).toMatch(/sous-loué/); expect(moveIn(s, a.uid)).toBe(false); expect(currentHome(s).uid).toBe(room.uid);
    expect(cannotSell(s, a.lease!.pack![0])).toMatch(/loué meublé/);
  });
  it('no second tenancy and no sublet of a sublet: one tenant per home, only on a lease the player holds', () => {
    const s = playerWith(o => o > 0, T0, 200_000_000), a = signLease(s, F2, T0)!;
    expect(offer(s, a.uid, 'sublet', T0)).toBe(true);
    expect(cannotOffer(s, a.uid, 'sublet', T0)).toMatch(/un seul locataire/); expect(cannotOffer(s, a.uid, 'furnished', T0)).toMatch(/un seul locataire/);
    expect(offer(s, a.uid, 'sublet', T0)).toBe(false);
    expect(cannotSign(s, F2)).toBe('Tu le loues déjà');                    // the home on offer cannot be rented a second time
    expect(cannotFurnish(s, a.uid)).toMatch(/en location/);
    const owned = buyAsset(s, 'maison_cite')!, room = s.data.assets.list.find(x => x.how === 'given')!;
    expect(cannotOffer(s, owned.uid, 'sublet', T0)).toMatch(/que tu loues au mois/); expect(cannotOffer(s, room.uid, 'sublet', T0)).toMatch(/que tu loues au mois/);
    expect(cannotSign(s, 'maison_cite')).toMatch(/Pas de bail au mois/);
  });
  it('a tenant in place stays to the end of the month; the keys cannot be handed back over their head', () => {
    const s = playerWith(o => o > 0, T0), a = signLease(s, F2, T0)!; offer(s, a.uid, 'sublet', T0);
    expect(cannotEndNow(s, a.uid)).toMatch(/locataire est en place/); expect(endNow(s, a.uid)).toBe(false);
    expect(stopOffer(s, a.uid, T0 + M / 4)).toBe('later'); expect(a.lease!.mode).toBe('sublet'); expect(cannotMoveIn(s, a.uid)).not.toBeNull();
    expect(keepOffer(s, a.uid)).toBe(true); expect(a.lease!.next).toBeUndefined();
    stopOffer(s, a.uid, T0 + M / 4); play(s);
    const out = settleMonthly(s, T0 + M);
    expect(out[0].revenue).toBe(Math.floor(T.sublet * occupancyOf(s, contractOf(s, a.uid)!, 0) / 100));       // the whole month was paid for
    expect(a.lease!.mode).toBe('live'); expect(cannotMoveIn(s, a.uid)).toBeNull();
    const v = playerWith(o => o === 0, T0), b = signLease(v, F2, T0)!; offer(v, b.uid, 'sublet', T0);
    expect(stopOffer(v, b.uid, T0 + 1000)).toBe('now'); expect(b.lease!.mode).toBe('live');
  });
  it('at most two homes on offer per player', () => {
    const s = fresh(10_000_000), a = signLease(s, F2, T0)!;
    const other = (uid: string, mode: 'sublet' | 'live'): AssetState => ({ uid, spec: 'f3_filaos', how: 'rented', since: 0, paid: 0, condition: 100, upgrades: [], leased: false,
      lease: { start: T0, k: 0, rent: 1, charges: 0, mode, acc: 0, accAt: T0, debt: 0, playAt: 0 } });
    s.data.assets.list.push(other('a900', 'sublet'), other('a901', 'live'));
    expect(cannotOffer(s, a.uid, 'sublet', T0)).toBeNull();
    s.data.assets.list.push(other('a902', 'sublet'));
    expect(ECONOMY.monthly.maxSublets).toBe(2);
    expect(cannotOffer(s, a.uid, 'sublet', T0)).toMatch(/Pas plus de 2 logements/); expect(offer(s, a.uid, 'sublet', T0)).toBe(false);
  });
  it('notice ends the contract at the settlement, with no new rent; renewing withdraws it; handing the keys back refunds nothing', () => {
    const s = fresh(500_000), a = signLease(s, F2, T0)!; furnish(s, a.uid);
    setNotice(s, a.uid, true); expect(cannotOffer(s, a.uid, 'sublet', T0)).toMatch(/congé/);
    setNotice(s, a.uid, false); expect(a.lease!.notice).toBeUndefined();
    setNotice(s, a.uid, true); play(s);
    const w = s.wallet, out = settleMonthly(s, T0 + M);
    expect(out[0]).toMatchObject({ ended: 'notice', paid: 0 }); expect(s.wallet).toBe(w); expect(contracts(s)).toHaveLength(0);
    expect(furnitureIn(s, currentHome(s).uid).length).toBe(ECONOMY.monthly.pack.length);                       // the furniture is the player's: it comes home
    const t = fresh(500_000), b = signLease(t, F2, T0)!; const w2 = t.wallet;
    expect(endNow(t, b.uid)).toBe(true); expect(t.wallet).toBe(w2); expect(contracts(t)).toHaveLength(0); expect(cannotSign(t, F2)).toBeNull();
  });
});

describe('arrears', () => {
  it('unpaid rent stays on the contract, is taken as money comes in, and two months unpaid end the lease with the debt still owed', () => {
    const s = fresh(COST), a = signLease(s, F2, T0)!; expect(s.wallet).toBe(0);
    play(s); expect(settleMonthly(s, T0 + M)[0]).toMatchObject({ paid: 0 }); expect(a.lease!.debt).toBe(COST);
    expect(cannotOffer(s, a.uid, 'sublet', T0 + M)).toMatch(/impayé/);
    s.addMoney(25_000, 'Tiak Tiak'); settleMonthly(s, T0 + M + 1000);
    expect(s.wallet).toBe(0); expect(a.lease!.debt).toBe(COST - 25_000);                                      // taken as it comes
    play(s); const out = settleMonthly(s, T0 + 2 * M);
    expect(out[0].ended).toBeUndefined(); expect(a.lease!.debt).toBe(2 * COST - 25_000);                      // under two months: still in
    play(s); const end = settleMonthly(s, T0 + 3 * M);
    expect(end[0].ended).toBe('unpaid'); expect(contracts(s)).toHaveLength(0);
    expect(owed(s)).toBe(3 * COST - 25_000);
    expect(takeNotices().join(' ')).toMatch(/repris les clés/);
  });
  it('walking away does not forgive: the debt follows the player, blocks a new lease, survives a reload and the per-day eviction, and is paid in the end', () => {
    const s = fresh(COST), a = signLease(s, F2, T0)!;
    play(s); settleMonthly(s, T0 + M);
    expect(endNow(s, a.uid)).toBe(true);                                   // the keys go back…
    expect(owed(s)).toBe(COST);                                            // …the debt does not go away
    expect(cannotSign(s, F2)).toMatch(/Loyers impayés/);
    play(s, 80 * HOUR_MS); accrue(s); expect(owed(s)).toBe(COST);          // the per-day rules (which drop arrears) never touch it
    const r = back(s); expect(owed(r)).toBe(COST);
    r.addMoney(100_000, 'Tiak Tiak'); settleMonthly(r, T0 + M + 5000);
    expect(owed(r)).toBe(0); expect(r.wallet).toBe(100_000 - COST); expect(cannotSign(r, F2)).toMatch(/premier mois/); r.addMoney(COST, 'Tiak Tiak'); expect(cannotSign(r, F2)).toBeNull();
    // buying the home out of a contract in arrears keeps the debt too
    const b = fresh(COST), c = signLease(b, F2, T0)!; play(b); settleMonthly(b, T0 + M); b.data.wallet = 15_000_000;
    expect(buyAsset(b, F2)?.uid).toBe(c.uid); expect(c.lease).toBeUndefined(); expect(owed(b)).toBe(COST);
  });
});

describe('the leases of before', () => {
  it('a per-day lease still runs per city hour, the other homes are untouched, and a per-day F2 can pass to the monthly lease', () => {
    const s = fresh(1_000_000), day = rentAsset(s, F2)!;
    expect(day.lease).toBeUndefined(); expect(rentOf(day)).toBe(6_000); expect(chargesPerHour(s)).toBe(250);
    play(s, 2 * HOUR_MS); accrue(s); expect(s.wallet).toBe(1_000_000 - 500);
    expect(settleMonthly(s, T0 + 5 * M)).toEqual([]);                      // not a monthly contract: the calendar ignores it
    const a = signLease(s, F2, T0)!;
    expect(a.uid).toBe(day.uid); expect(a.rate).toBeUndefined(); expect(chargesPerHour(s)).toBe(0); expect(s.wallet).toBe(1_000_000 - 500 - COST);
    const h = fresh(1_000_000), house = rentAsset(h, 'maison_cite')!;
    expect(specOf('maison_cite')!.monthly).toBeUndefined(); expect(house.lease).toBeUndefined(); expect(chargesPerHour(h)).toBe(Math.round(16_700 / 24));
  });
  it('a save from before 1.0.1 loads as it was; a malformed contract falls back to a per-day lease', () => {
    const s = fresh(1_000_000); rentAsset(s, F2);
    const old = JSON.parse(JSON.stringify(s.data));
    const r = new GameState(migrate(old)!);
    expect(r.data.assets.list.find(a => a.spec === F2)).toMatchObject({ how: 'rented', rate: 6_000 }); expect(r.data.assets.owed).toBeUndefined(); expect(contracts(r)).toHaveLength(0);
    old.assets.list.find((a: AssetState) => a.spec === F2).lease = { start: 'x', rent: -4 };
    expect(new GameState(migrate(old)!).data.assets.list.find(a => a.spec === F2)!.lease).toBeUndefined();
  });
});
