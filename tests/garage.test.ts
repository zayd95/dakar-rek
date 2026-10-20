import { describe, expect, it } from 'vitest';
import { COSMETIC_LOSS, GARAGE_HOURS, INSPECT_SECONDS, MIN_JOB, REPAIR_SECONDS, REPAIR_STEPS, garageOpen, garageQuote, inBay, reopens } from '../src/transport/garage';
import { hitDamage } from '../src/transport/condition';

const JAKARTA = 150_000, BERLINE = 6_000_000, SUV = 75_000_000;

describe('Garage Modou: the quote', () => {
  it('a repair takes about half a minute in visible steps, after a short look', () => {
    expect(REPAIR_SECONDS).toBe(30);
    expect(REPAIR_STEPS.length).toBe(3);
    expect(INSPECT_SECONDS).toBeGreaterThanOrEqual(3);
  });
  it('a whole vehicle costs nothing and a cosmetic scratch is offered', () => {
    expect(garageQuote(BERLINE, 100)).toMatchObject({ cost: 0, free: true });
    expect(garageQuote(BERLINE, 100 - COSMETIC_LOSS + 0.1)).toMatchObject({ cost: 0, free: true });
    expect(garageQuote(BERLINE, 100 - COSMETIC_LOSS)).toMatchObject({ free: false });
  });
  it('follows the asset model\'s rule (0.1 % of the price per missing point), rounded, never under the visit', () => {
    expect(garageQuote(BERLINE, 76).cost).toBe(144_000);                    // 24 points
    expect(garageQuote(BERLINE, 0).cost).toBe(600_000);                     // a wreck is 10 % of the price
    expect(garageQuote(SUV, 0).cost).toBe(7_500_000);
    expect(garageQuote(JAKARTA, 0).cost).toBe(15_000);
    expect(garageQuote(JAKARTA, 95).cost).toBe(MIN_JOB);                    // 5 points of a motorbike: 750 F, the visit is 1 000 F
    for (const hp of [10, 33, 57, 72, 90]) { const c = garageQuote(BERLINE, hp).cost; expect(c % 500).toBe(0); }
    for (const hp of [10, 33, 57, 72, 90]) { const c = garageQuote(JAKARTA, hp).cost; expect(c % 100).toBe(0); expect(c).toBeGreaterThanOrEqual(MIN_JOB); }
  });
  it('is never negative and never more than 10 % of the price', () => {
    for (const price of [JAKARTA, BERLINE, SUV]) for (let hp = 0; hp <= 100; hp += 0.5) {
      const q = garageQuote(price, hp);
      expect(q.cost).toBeGreaterThanOrEqual(0);
      expect(q.cost).toBeLessThanOrEqual(Math.max(MIN_JOB, price * 0.1 + 500));
    }
  });
  it('grows with the damage', () => {
    let last = -1;
    for (let hp = 100; hp >= 0; hp -= 1) { const c = garageQuote(BERLINE, hp).cost; expect(c).toBeGreaterThanOrEqual(last); last = c; }
  });
  it('a bump you would make parking is free to fix; a 30 km/h crash is a real but small cost for the Jakarta and a moderate one for the Berline', () => {
    const lost = hitDamage(8, true);                                         // 8 m/s ≈ 29 km/h head-on: 9 points
    expect(garageQuote(JAKARTA, 100 - lost).cost).toBeLessThan(2_000);
    expect(garageQuote(BERLINE, 100 - lost).cost).toBeLessThan(80_000);
    expect(garageQuote(BERLINE, 100 - hitDamage(3, true)).cost).toBe(0);     // a tap
  });
});

describe('Garage Modou: opening hours', () => {
  it('work the hours of the owner\'s routine', () => {
    expect(GARAGE_HOURS).toEqual([[7, 13], [15, 19]]);
    for (const h of [7, 9.5, 12.99, 15, 18.5]) expect(garageOpen(h)).toBe(true);
    for (const h of [0, 6.9, 13, 14, 14.99, 19, 22]) expect(garageOpen(h)).toBe(false);
  });
  it('says when it reopens', () => {
    expect(reopens(13.5)).toBe('à 15 h');
    expect(reopens(20)).toBe('demain à 7 h');
    expect(reopens(3)).toBe('à 7 h');
  });
});

describe('Garage Modou: the repair bay', () => {
  const bay = { x: 100, z: -4.3, yaw: Math.PI / 2, hl: 2.7, hw: 1.5 };
  it('holds a vehicle parked in it, either way round', () => {
    expect(inBay(bay, { x: 100, z: -4.3, yaw: Math.PI / 2 })).toBe(true);
    expect(inBay(bay, { x: 101.2, z: -3.7, yaw: -Math.PI / 2 })).toBe(true);
    expect(inBay(bay, { x: 98.6, z: -4.8, yaw: Math.PI / 2 + 0.3 })).toBe(true);
  });
  it('does not hold one beside it, across it or outside it', () => {
    expect(inBay(bay, { x: 100, z: -1.0, yaw: Math.PI / 2 })).toBe(false);          // on the road
    expect(inBay(bay, { x: 104, z: -4.3, yaw: Math.PI / 2 })).toBe(false);          // past the end
    expect(inBay(bay, { x: 100, z: -4.3, yaw: 0 })).toBe(false);                    // across it
    expect(inBay(bay, { x: 100, z: -4.3, yaw: Math.PI / 2 + 0.8 })).toBe(false);
  });
});
