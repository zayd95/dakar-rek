import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate, SCHEMA_VERSION, MONEY_MAX } from '../src/core/save';
import { ECONOMY } from '../src/economy/config';
import { VENTURES, HOUR_MS, accrue, buyVenture, cannotBuy, incomePerHour, lockedWhy, nextPrice, unitPrice, venturesValue, baseIncome, ownedOf } from '../src/economy/business';
import { ACTIVITIES, WINDOW_MS, activityOf, multiplier, multiplierFor, noticeActivities, polyLine, polyvalence, practise, signature, type Activity } from '../src/economy/polyvalence';
import { acceptJob, completeJob } from '../src/economy/jobs';
import { buyFurniture } from '../src/economy/furniture';
import { fcfaShort, fcfaText } from '../src/economy/format';
import { fcfa } from '../src/ui/hud';
import { ACTIONS } from '../src/world/content';
import { CITY_ACTIONS } from '../src/world/cityContent';
import type { Action } from '../src/world/types';

const fresh = (wallet = 3000) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
const NN = '\u202f', NB = '\u00a0';
const play = (s: GameState, ms: number) => { s.data.playedMs += ms; };
const CONTENT_ACTIONS: Action[] = [...Object.values(ACTIONS), ...Object.values(CITY_ACTIONS)].flat();
const doing = (s: GameState, ...a: Activity[]) => { for (const x of a) practise(s, x); };

afterEach(() => { vi.useRealTimers(); });

describe('ventures: the ladder and its prices', () => {
  it('seven tiers from a bana-bana table (50 000 F) to a big company (≥ 500 000 000 F), each about 5–8× the one before', () => {
    const t = ECONOMY.business.tiers;
    expect(VENTURES.map(v => v.id)).toEqual(t.map(x => x.id));
    expect(t[0].price).toBe(50_000); expect(t.at(-1)!.price).toBeGreaterThanOrEqual(500_000_000);
    for (let i = 1; i < t.length; i++) {
      expect(t[i].price / t[i - 1].price).toBeGreaterThanOrEqual(4.5); expect(t[i].price / t[i - 1].price).toBeLessThanOrEqual(8);
      expect(t[i].perHour / t[i - 1].perHour).toBeGreaterThanOrEqual(4.5); expect(t[i].perHour / t[i - 1].perHour).toBeLessThanOrEqual(8);
    }
  });
  it('each unit owned makes the next one ×1.15 dearer (rounded to three significant digits)', () => {
    expect(unitPrice('bana', 0)).toBe(50_000); expect(unitPrice('bana', 1)).toBe(57_500); expect(unitPrice('bana', 2)).toBe(66_100);
    for (const v of VENTURES) for (let k = 1; k < 60; k++) {
      const r = unitPrice(v.id, k) / unitPrice(v.id, k - 1);
      expect(r).toBeGreaterThan(1.13); expect(r).toBeLessThan(1.17);
    }
    expect(Number.isFinite(unitPrice('entreprise', 1000))).toBe(true);
  });
  it('tiers unlock with activity variety and the tier below, not with money alone', () => {
    const s = fresh(1e12);
    expect(lockedWhy(s, 'bana')).toBe('À débloquer : une première activité (livraison, petit boulot…)');
    expect(buyVenture(s, 'bana')).toBe(false);
    doing(s, 'livraison');
    expect(lockedWhy(s, 'bana')).toBeNull();
    expect(lockedWhy(s, 'kiosque')).toMatch(/2 activités.*1 table de bana-bana/);
    expect(buyVenture(s, 'bana')).toBe(true);                 // buying is commerce: a 2nd activity
    expect(lockedWhy(s, 'kiosque')).toBeNull();
    expect(lockedWhy(s, 'boutique')).toBe('À débloquer : 3 activités différentes pratiquées (2/3) et 1 kiosque');
    expect(lockedWhy(s, 'entreprise')).toMatch(/7 activités/);
    doing(s, ...ACTIVITIES);
    for (const v of VENTURES.slice(1)) { expect(buyVenture(s, v.id)).toBe(true); }   // each tier opens the next
    expect(Object.values(s.data.business.owned)).toEqual(VENTURES.map(() => 1));
  });
  it('buying charges the next price once, records it and makes the next one dearer', () => {
    const s = fresh(200_000); doing(s, 'livraison');
    expect(buyVenture(s, 'bana')).toBe(true);
    expect(s.wallet).toBe(150_000); expect(s.data.ledger.at(-1)).toMatchObject({ label: 'Achat : Table de bana-bana', amount: -50_000 });
    expect(nextPrice(s, 'bana')).toBe(57_500);
    expect(buyVenture(s, 'bana')).toBe(true); expect(buyVenture(s, 'bana')).toBe(true);
    expect(ownedOf(s, 'bana')).toBe(3); expect(s.wallet).toBe(150_000 - 57_500 - 66_100);
    expect(venturesValue(s)).toBe(50_000 + 57_500 + 66_100);
    s.data.wallet = 10; expect(cannotBuy(s, 'bana')).toBe('Pas assez d’argent'); expect(buyVenture(s, 'bana')).toBe(false);
    expect(s.data.counters.affaires).toBe(3); expect(s.data.activities.known).toContain('commerce');
  });
});

describe('ventures: income per in-game hour of play, paid in hourly batches', () => {
  const owner = () => { const s = fresh(100_000); doing(s, 'livraison'); buyVenture(s, 'bana'); return s; };   // livraison + commerce → ×1,2
  it('accrues on played time and pays one ledger line per in-game hour', () => {
    const s = owner(), rate = 400 * 1.2;
    expect(HOUR_MS).toBe(60_000);
    expect(incomePerHour(s)).toBe(rate);
    const w0 = s.wallet, lines = s.data.ledger.length;
    play(s, 30_000); expect(accrue(s)).toBe(0); expect(s.wallet).toBe(w0);         // half an hour: counted, not paid yet
    play(s, 30_000); expect(accrue(s)).toBe(rate);
    expect(s.data.ledger.at(-1)).toMatchObject({ label: 'Revenus · Table de bana-bana', amount: rate });
    expect(accrue(s)).toBe(0);                                                     // nothing twice for the same hour
    play(s, 5 * HOUR_MS + 10_000); expect(accrue(s)).toBe(2480);                   // a trip: one batch, all that was counted (5 h 10 s)
    expect(s.data.ledger.length).toBe(lines + 2); expect(s.data.business.earned).toBe(480 + 2480);
    play(s, 50_000); expect(accrue(s)).toBe(400);                                  // the next hour mark: the rest of that hour
    expect(s.data.business.earned).toBe(7 * rate);
  });
  it('a purchase counts the income so far at the old rate; several ventures share one line', () => {
    const s = owner();
    s.data.wallet = 1e6; play(s, 30_000); accrue(s);
    doing(s, 'social'); buyVenture(s, 'kiosque');                                  // ×1,4 now (livraison, commerce, social)
    play(s, 30_000);
    const paid = accrue(s);
    expect(paid).toBe(Math.floor(400 * 1.2 * 0.5 + (400 + 2200) * multiplier(s) * 0.5));
    expect(s.data.ledger.at(-1)!.label).toBe('Revenus · Kiosque et 1 autre affaire');
  });
  it('accrues nothing while not played, offline, or when the device clock changes', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
    const s = owner(), w = s.wallet;
    vi.setSystemTime(new Date('2027-10-09T10:00:00Z'));                          // a year later on the device clock
    expect(accrue(s)).toBe(0); expect(s.wallet).toBe(w);
    // save, « come back » a year later: the clocks are played time, nothing is owed for the time away
    const back = new GameState(migrate(JSON.parse(JSON.stringify(s.data)), Date.now() + 365 * 86_400_000)!);
    expect(accrue(back)).toBe(0); expect(back.wallet).toBe(w);
    // a save whose clocks run ahead of the played time is pulled back, not paid
    back.data.business.payMs = back.data.playedMs - 10 * HOUR_MS; back.data.business.clockMs = back.data.playedMs + 99 * HOUR_MS;
    expect(accrue(back)).toBe(0);
    play(back, HOUR_MS); expect(accrue(back)).toBe(incomePerHour(back));
  });
  it('counts at most a city day of income at once', () => {
    const s = owner();
    play(s, 100 * HOUR_MS);                                                        // (the activities aged out meanwhile: ×1)
    expect(accrue(s)).toBe(ECONOMY.business.maxCatchUpHours * baseIncome(s) * multiplier(s));
    expect(multiplier(s)).toBe(1);
  });
  it('owning nothing earns nothing, and the first hour starts at the purchase', () => {
    const s = fresh(100_000); doing(s, 'livraison');
    play(s, 10 * HOUR_MS); expect(accrue(s)).toBe(0);
    buyVenture(s, 'bana'); play(s, HOUR_MS - 1); expect(accrue(s)).toBe(0);
    play(s, 1); expect(accrue(s)).toBe(480);
  });
});

describe('polyvalence', () => {
  it('×1 for one activity, +20 % per other one, capped at ×2', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(multiplierFor)).toEqual([1, 1, 1.2, 1.4, 1.6, 1.8, 2, 2]);
    const s = fresh(); doing(s, 'livraison', 'peche', 'social', 'combat');
    expect(polyvalence(s)).toBe(4);
    expect(polyLine(s)).toBe('Polyvalence : 4 activités → revenus ×1,6');
  });
  it('only activities practised in the last 3 in-game days of play count; they are remembered for unlocks', () => {
    const s = fresh(); doing(s, 'livraison', 'peche');
    play(s, WINDOW_MS - 1000); doing(s, 'social');
    expect(polyvalence(s)).toBe(3);
    play(s, 2000);
    expect(polyvalence(s)).toBe(1);
    expect(s.data.activities.known).toEqual(['livraison', 'peche', 'social']);
  });
  it('scales delivery pay; one activity pays the listed price', () => {
    const s = fresh();
    const a = acceptJob(s, 'pk_mame_boutique', true, 60_000)!;
    expect(completeJob(s, a.runId)!.paid).toBe(1200);
    doing(s, 'peche', 'social', 'artisanat');                                    // 4 recent → ×1,6
    const b = acceptJob(s, 'pk_mame_boutique', true, 60_000)!;
    expect(completeJob(s, b.runId)!.paid).toBe(1920);
    expect(s.data.ledger.at(-1)!.amount).toBe(1920);
  });
  it('categories are inferred from action ids, places and counters', () => {
    const cat = (id: string, place = '') => activityOf(CONTENT_ACTIONS.find(a => a.id === id)!, place);
    expect(cat('debarquement', 'corniche:city:soumbedioune')).toBe('peche');
    expect(cat('pirogue', 'almadies:port')).toBe('peche');
    expect(cat('atelier', 'corniche:city:craft')).toBe('artisanat');
    expect(cat('meca', 'pikine:garage:12')).toBe('artisanat');
    expect(cat('couture')).toBe('artisanat');
    expect(cat('vendre', 'plateau:market')).toBe('commerce');
    expect(cat('courrier', 'pikine:city:bank')).toBe('services');
    expect(cat('boutique-stock', 'pikine:city:boutique')).toBe('services');
    expect(activityOf({ id: 'nouveau-filet', gain: 900 }, 'corniche:city:fish-market')).toBe('peche');
    expect(cat('boutique-salut')).toBe('social'); expect(cat('parler')).toBe('social');
    expect(cat('ceebu')).toBeNull(); expect(cat('dormir')).toBeNull();
    for (const a of CONTENT_ACTIONS) if (a.gain) expect(activityOf(a)).not.toBeNull();   // every paid action has a category
  });
  it('notices bouts, training, beats, situations and chats recorded by other modules (counters)', () => {
    const s = fresh();
    let sig = signature(s.data);
    s.count('combats'); s.data.beats.ibou_welcome = 'oui';
    sig = noticeActivities(s, sig);
    expect(polyvalence(s)).toBe(2);
    s.data.counters.sit_maiga_repas_n = 1; play(s, WINDOW_MS + 1);
    sig = noticeActivities(s, sig);
    expect(polyvalence(s)).toBe(1); expect(s.data.activities.known).toEqual(['combat', 'social']);
    expect(noticeActivities(s, sig)).toEqual(sig);
  });
  it('furniture purchases count as commerce', () => {
    const s = fresh(); buyFurniture(s, 'miroir');
    expect(polyvalence(s)).toBe(1); expect(s.data.activities.known).toEqual(['commerce']);
  });
});

describe('big numbers', () => {
  it('formats full amounts exactly up to 10^15 and beyond', () => {
    expect(fcfaText(1e13)).toBe(`10${NN}000${NN}000${NN}000${NN}000${NB}F`);
    expect(fcfaText(1_234_567_890_123)).toBe(`1${NN}234${NN}567${NN}890${NN}123${NB}F`);
    expect(fcfa(1_250_000_000)).toBe(fcfaText(1_250_000_000));
    expect(fcfaText(1e22)).toBe(`10${NN}000${NN}000${NN}000${NN}000${NN}000${NN}000${NN}000${NB}F`);
    expect(fcfaText(0)).toBe(`0${NB}F`); expect(fcfaText(999)).toBe(`999${NB}F`);
  });
  it('compact HUD form: M and Md with a comma decimal, rounded down, full below 10 million', () => {
    expect(fcfaShort(9_999_999)).toBe(fcfaText(9_999_999));
    expect(fcfaShort(340_000_000)).toBe(`340${NB}M${NB}F`);
    expect(fcfaShort(12_345_678)).toBe(`12,3${NB}M${NB}F`);
    expect(fcfaShort(999_999_999)).toBe(`999${NB}M${NB}F`);
    expect(fcfaShort(1_250_000_000)).toBe(`1,25${NB}Md${NB}F`);
    expect(fcfaShort(1_000_000_000)).toBe(`1${NB}Md${NB}F`);
    expect(fcfaShort(1_150_000_000)).toBe(`1,15${NB}Md${NB}F`);
    expect(fcfaShort(1e13)).toBe(`10${NN}000${NB}Md${NB}F`);
    expect(fcfaShort(1e13).length).toBeLessThanOrEqual(12);                     // fits the 150 px stat card
  });
  it('the wallet and the save keep billions exactly; nothing clamps below the precision limit', () => {
    const s = fresh(0);
    expect(s.addMoney(1e13, 'x')).toBe(1e13); s.addMoney(1, 'x');
    expect(s.wallet).toBe(10_000_000_000_001);
    expect(s.addMoney(NaN, 'x')).toBe(0); expect(s.addMoney(Infinity, 'x')).toBe(0); expect(s.wallet).toBe(10_000_000_000_001);
    s.data.business.earned = 4_321_000_000_000;
    const back = migrate(JSON.parse(JSON.stringify(s.data)))!;
    expect(back.wallet).toBe(10_000_000_000_001); expect(back.business.earned).toBe(4_321_000_000_000);
    expect(back.ledger.at(-1)!.amount).toBe(1);
    expect(migrate({ schemaVersion: 4, wallet: 1e300 })!.wallet).toBe(MONEY_MAX);
  });
});

describe('save schema v4', () => {
  it('a v3 save gains empty ventures and the activities its counters show (known, not recent)', () => {
    const v3 = { schemaVersion: 3, wallet: 52_000, playedMs: 7_200_000, counters: { livraisons: 4, shifts: 2, chats: 1, combats: 1 }, furniture: ['radio'], beats: { ibou_welcome: 'oui' } };
    const m = migrate(v3)!;
    expect(SCHEMA_VERSION).toBe(4); expect(m.schemaVersion).toBe(4);
    expect(m.business).toEqual({ owned: {}, clockMs: 7_200_000, payMs: 7_200_000, carry: 0, earned: 0 });
    expect(m.activities).toEqual({ known: ['livraison', 'services', 'commerce', 'combat', 'social'], last: {} });
    const s = new GameState(m);
    expect(polyvalence(s)).toBe(0);
    expect(lockedWhy(s, 'car_rapide')).toMatch(/1 boutique de quartier/);       // 5 known activities: only the tier below is missing
    expect(migrate({ schemaVersion: 3 })!.activities).toEqual({ known: [], last: {} });
  });
  it('v1 and v2 saves reach v4 through the chain', () => {
    for (const v of [1, 2]) {
      const m = migrate({ schemaVersion: v, wallet: 500 })!;
      expect(m.schemaVersion).toBe(4); expect(m.wallet).toBe(500); expect(m.ledger).toEqual([]);
      expect(m.business.owned).toEqual({}); expect(m.activities.known).toEqual([]);
    }
  });
  it('round-trips ventures and activities, and sanitises bad values', () => {
    const s = fresh(1e9); doing(s, 'livraison', 'peche'); buyVenture(s, 'bana'); buyVenture(s, 'bana'); play(s, 90_000); accrue(s);
    const back = migrate(JSON.parse(JSON.stringify(s.data)))!;
    expect(back.business).toEqual(s.data.business); expect(back.activities).toEqual(s.data.activities);
    const bad = migrate({ schemaVersion: 4, playedMs: 1000, business: { owned: { bana: 2.7, kiosque: -1, 'x y': 3, boutique: 'z' }, clockMs: 5000, payMs: -3, carry: -1, earned: 'a' }, activities: { known: ['livraison', 'magie', 3], last: { peche: 9000, social: 'x', vol: 1 } } })!;
    expect(bad.business).toEqual({ owned: { bana: 2 }, clockMs: 1000, payMs: 0, carry: 0, earned: 0 });
    expect(bad.activities).toEqual({ known: ['livraison', 'peche'], last: { peche: 1000 } });
    expect(migrate({ schemaVersion: 5 })).toBeNull();
  });
});

/**
 * Pacing, with the real functions: a focused player earns ≈ 800 F per real minute from jobs (deliveries and services,
 * sleep and meals included) before the multiplier, keeps 4 activities recent (×1,6) once they know them, discovers a
 * new category every few hours, and reinvests everything greedily in the best income per franc.
 */
function simulate(recent: number, hours: number) {
  const s = fresh(3000), order: Activity[] = ['livraison', 'commerce', 'services', 'social', 'peche', 'artisanat', 'combat'];
  const discover = [0, 1, 3, 6, 10, 15, 20];                                       // hours of play at which each category is first practised
  const marks: Record<string, number> = {};
  for (let min = 0; min < hours * 60; min++) {
    const h = min / 60, known = order.filter((_, i) => discover[i] <= h);
    doing(s, ...known.slice(-recent));                                             // the latest ones are the ones kept up
    s.addMoney(Math.round(800 * multiplier(s)), 'Petits boulots');
    play(s, HOUR_MS); accrue(s);
    for (;;) {
      const best = VENTURES.filter(v => !cannotBuy(s, v.id)).sort((a, b) => ECONOMY.business.tiers.find(t => t.id === b.id)!.perHour / nextPrice(s, b.id) - ECONOMY.business.tiers.find(t => t.id === a.id)!.perHour / nextPrice(s, a.id))[0];
      if (!best || !buyVenture(s, best.id)) break;
    }
    const wealth = s.wallet + venturesValue(s);
    for (const [k, v] of [['first', baseIncome(s) > 0 ? 1 : 0], ['million', wealth >= 1e6 ? 1 : 0], ['billion', wealth >= 1e9 ? 1 : 0]] as const) if (v && marks[k] === undefined) marks[k] = h;
  }
  return marks;
}

describe('pacing', () => {
  it('first venture after a session or two, a million in a few hours, a billion after dozens of hours; variety pays', () => {
    const varied = simulate(4, 80), narrow = simulate(1, 80);
    expect(varied.first).toBeGreaterThan(0.5); expect(varied.first).toBeLessThan(2.5);
    expect(varied.million).toBeGreaterThan(3); expect(varied.million).toBeLessThan(10);
    expect(varied.billion).toBeGreaterThan(20); expect(varied.billion).toBeLessThan(60);
    expect(narrow.billion ?? 999).toBeGreaterThan(varied.billion * 1.2);
  });
});
