import { describe, expect, it } from 'vitest';
import * as R from '../src/sea/traverseeRules';
import { ECONOMY } from '../src/economy/config';
import { fcfaText } from '../src/economy/format';

const T = ECONOMY.traversee;

describe('la traversée: customers by boat and hour', () => {
  it('the pirogue takes 3 across, 4 in the busy hours (9–12 h, 16–18 h); the chaloupe 2, 3 when busy', () => {
    for (const h of [7, 8.5, 12, 13, 15.9, 18, 18.9]) { expect(R.customers('pirogue', h, 1).out, `${h} h`).toBe(3); expect(R.customers('chaloupe', h, 1).out).toBe(2); }
    for (const h of [9, 10.5, 11.9, 16, 17.5]) { expect(R.customers('pirogue', h, 1).out, `${h} h`).toBe(4); expect(R.customers('chaloupe', h, 1).out).toBe(3); }
  });
  it('1–3 come back in the pirogue, 1–2 in the chaloupe; every count is drawn somewhere, and the same seed draws the same', () => {
    const seen = { pirogue: new Set<number>(), chaloupe: new Set<number>() };
    for (let d = 0; d < 6; d++) for (let h = 7; h < 19; h++) for (let t = 0; t < 4; t++) {
      const seed = R.crossingSeed(d, h, t);
      for (const k of ['pirogue', 'chaloupe'] as const) {
        const n = R.customers(k, h, seed).back;
        expect(n).toBeGreaterThanOrEqual(T.boats[k].back[0]); expect(n).toBeLessThanOrEqual(T.boats[k].back[1]);
        expect(R.customers(k, h, seed)).toEqual(R.customers(k, h + 0.4, seed));            // within the hour: the same crossing
        seen[k].add(n);
      }
    }
    expect([...seen.pirogue].sort()).toEqual([1, 2, 3]); expect([...seen.chaloupe].sort()).toEqual([1, 2]);
  });
  it('the seed follows the city day, the hour and the round trips done (a reload keeps it, the next crossing changes it)', () => {
    expect(R.crossingSeed(3, 10.2, 1)).toBe(R.crossingSeed(3, 10.9, 1));
    expect(R.crossingSeed(3, 10, 1)).not.toBe(R.crossingSeed(3, 10, 2));
    expect(R.crossingSeed(3, 10, 1)).not.toBe(R.crossingSeed(4, 10, 1));
  });
});

describe('la traversée: fares and Ousmane\'s share', () => {
  it('1 000 F a place in the pirogue, 2 500 F in the chaloupe, per leg; Ousmane keeps 40 %, 30 % once he trusts the player', () => {
    expect(R.legPay('pirogue', 4, false)).toEqual({ passengers: 4, fare: 1000, fares: 4000, rate: 0.4, share: 1600, net: 2400 });
    expect(R.legPay('pirogue', 4, true)).toMatchObject({ fares: 4000, rate: 0.3, share: 1200, net: 2800 });
    expect(R.legPay('chaloupe', 3, false)).toMatchObject({ fare: 2500, fares: 7500, share: 3000, net: 4500 });
    expect(R.legPay('chaloupe', 2, true)).toMatchObject({ fares: 5000, share: 1500, net: 3500 });
    for (let n = 1; n <= 4; n++) for (const k of ['pirogue', 'chaloupe'] as const) for (const tr of [false, true]) {
      const p = R.legPay(k, n, tr); expect(p.net + p.share).toBe(p.fares); expect(Number.isInteger(p.share)).toBe(true);
    }
  });
  it('a crossing\'s plan: both legs from the same draw; the round trip brings both nets', () => {
    const seed = R.crossingSeed(2, 10, 0), p = R.crossingPlan('pirogue', 10, seed, false), n = R.customers('pirogue', 10, seed);
    expect(p.out.passengers).toBe(4); expect(p.back.passengers).toBe(n.back);
    expect(R.roundTripNet(p)).toBe(p.out.net + p.back.net);
    expect(R.crossingPlan('pirogue', 10, seed, true).out.net).toBe(2800);
  });
  it('the wallet line names the leg, the passengers, the fares and the share', () => {
    expect(R.legLabel('aller', R.legPay('pirogue', 4, false))).toBe(`Traversée vers Ngor · 4 passagers · ${fcfaText(4000)} − part d’Ousmane ${fcfaText(1600)}`);
    expect(R.legLabel('retour', R.legPay('chaloupe', 1, true))).toBe(`Traversée retour de Ngor · 1 passager · ${fcfaText(2500)} − part d’Ousmane ${fcfaText(750)}`);
  });
  it('the choice says who waits, the fare and the share', () => {
    const p = R.crossingPlan('pirogue', 10, 1, false);
    expect(R.choiceDetail(p)).toBe(`4 passagers attendent · ${fcfaText(1000)} la place · Ousmane prend 40 %`);
    expect(R.choiceDetail(R.crossingPlan('chaloupe', 13, 1, true))).toBe(`2 passagers attendent · ${fcfaText(2500)} la place · Ousmane prend 30 %`);
  });
});

describe('la traversée: hours, the chaloupe, the reasons a choice is closed', () => {
  it('crossings leave from 7 h to 19 h; outside, the choice says when they start again', () => {
    expect(R.crossingOpen(6.99)).toBe(false); expect(R.crossingOpen(7)).toBe(true); expect(R.crossingOpen(18.99)).toBe(true); expect(R.crossingOpen(19)).toBe(false);
    expect(R.closedReason('pirogue', { hour: 3, pirogueTrips: 0 })).toBe('Pas de traversée la nuit · départs à partir de 7 h');
    expect(R.closedReason('pirogue', { hour: 21, pirogueTrips: 9 })).toBe('Plus de traversée ce soir · reprise demain à 7 h');
    expect(R.closedReason('chaloupe', { hour: 22, pirogueTrips: 9 })).toMatch(/reprise demain à 7 h/);
  });
  it('the chaloupe opens after three pirogue round trips, and says how many remain', () => {
    expect(R.closedReason('chaloupe', { hour: 10, pirogueTrips: 0 })).toBe('Ousmane te confie sa chaloupe après 3 traversées en pirogue · encore 3');
    expect(R.closedReason('chaloupe', { hour: 10, pirogueTrips: 2 })).toMatch(/encore 1$/);
    expect(R.closedReason('chaloupe', { hour: 10, pirogueTrips: 3 })).toBeNull();
    expect(R.chaloupeLeft(5)).toBe(0); expect(R.chaloupeOpen(3)).toBe(true); expect(R.chaloupeOpen(2)).toBe(false);
    expect(R.closedReason('pirogue', { hour: 10, pirogueTrips: 0 })).toBeNull();
  });
  it('too tired to take the helm below the round trip\'s energy', () => {
    expect(R.closedReason('pirogue', { hour: 10, pirogueTrips: 0, energie: 5 })).toBe('Trop fatigué');
    expect(R.closedReason('pirogue', { hour: 10, pirogueTrips: 0, energie: 40 })).toBeNull();
  });
  it('the pirogue is the slower boat: about 22 s a leg against 16 s', () => {
    expect(R.boatSpeed('pirogue')).toBeCloseTo(5.5); expect(R.boatSpeed('chaloupe')).toBeCloseTo(7.5);
    expect(R.boatSpeed('chaloupe')).toBeGreaterThan(R.boatSpeed('pirogue'));
  });
  it('round trips and passengers are counted in the existing counters (no new save field)', () => {
    expect(R.TRAV_COUNTERS.trips).toBe('traversees'); expect(R.TRAV_COUNTERS.passengers).toBe('passagers_ngor');
    expect(R.TRAV_COUNTERS.of('pirogue')).toBe('traversees_pirogue'); expect(R.TRAV_COUNTERS.of('chaloupe')).toBe('traversees_chaloupe');
  });
});
