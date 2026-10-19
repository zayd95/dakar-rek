import { describe, expect, it } from 'vitest';
import { IMPACT_SPEED, PROFILES, brakeIntensity, impactKind, profileFor, rpmOf, vehicleAudio } from '../src/transport/vehicleAudio';

describe('the engine of a driven vehicle', () => {
  it('idles at a standstill and climbs with the speed within a gear, falling back at each change', () => {
    const g = 4, vmax = 20;
    expect(rpmOf(0, vmax, g)).toBeCloseTo(0.16, 2);
    const a = rpmOf(3, vmax, g), b = rpmOf(4.9, vmax, g), after = rpmOf(5.2, vmax, g);
    expect(b).toBeGreaterThan(a);
    expect(after).toBeLessThan(b - 0.3);                   // the next gear: the revs fall
    expect(rpmOf(30, vmax, g)).toBeLessThanOrEqual(1);
  });
  it('rises with the throttle and is always within 0…1', () => {
    expect(rpmOf(8, 20, 4, 1)).toBeGreaterThan(rpmOf(8, 20, 4, 0));
    for (const v of [-5, 0, 7, 19, 60]) for (const t of [-1, 0, 1]) { const r = rpmOf(v, 20, 4, t); expect(r).toBeGreaterThanOrEqual(0.12); expect(r).toBeLessThanOrEqual(1); }
  });
  it('a bigger engine is lower and thicker, a motorbike higher', () => {
    expect(PROFILES.suv.base).toBeLessThan(PROFILES.sedan.base);
    expect(PROFILES.suv.sub).toBeGreaterThan(PROFILES.sedan.sub);
    expect(PROFILES.moto.base).toBeGreaterThan(PROFILES.sedan.base);
    expect(profileFor('unknown')).toBe(PROFILES.sedan);
  });
});

describe('contacts and brakes', () => {
  it('a slow touch is a tap, a real contact an impact', () => {
    expect(impactKind(0.8)).toBe('tap'); expect(impactKind(IMPACT_SPEED - 0.1)).toBe('tap');
    expect(impactKind(IMPACT_SPEED)).toBe('impact'); expect(impactKind(-9)).toBe('impact');
  });
  it('only a hard stop from speed squeals; coasting and a gentle brake do not', () => {
    expect(brakeIntensity(1.4, 12)).toBe(0);                // coasting
    expect(brakeIntensity(3, 12)).toBe(0);
    expect(brakeIntensity(6.5, 12)).toBeGreaterThan(0.3);
    expect(brakeIntensity(9, 12)).toBe(1);
    expect(brakeIntensity(9, 2)).toBe(0);                   // too slow to squeal
  });
});

describe('sound only when it may play', () => {
  it('nothing plays before the first gesture (the requests are counted, none is played)', () => {
    const before = vehicleAudio.info();
    vehicleAudio.door(true); vehicleAudio.door(false); vehicleAudio.impact(9); vehicleAudio.brake(1); vehicleAudio.hornOn();
    const after = vehicleAudio.info();
    expect(after.count.asked - before.count.asked).toBe(5);
    expect(after.count.played).toBe(before.count.played);
    expect(after.running).toBe(false);
    vehicleAudio.run(PROFILES.sedan);
    expect(vehicleAudio.running).toBe(false);
  });
});
