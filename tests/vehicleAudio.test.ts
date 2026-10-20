import { describe, expect, it } from 'vitest';
import { SAMPLE_NAMES } from '../src/transport/vehicleSamples';
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
  it('a bigger engine is lower, a motorbike higher, thinner and brighter, and each uses recordings that exist', () => {
    expect(PROFILES.suv.idleRate[0]).toBeLessThan(PROFILES.sedan.idleRate[0]);
    expect(PROFILES.moto.idleRate[0]).toBeGreaterThan(PROFILES.sedan.idleRate[0] * 1.5);
    expect(PROFILES.moto.hp).toBeGreaterThan(PROFILES.sedan.hp * 3);              // nothing of a car's boom
    expect(PROFILES.moto.lpTop).toBeGreaterThan(PROFILES.sedan.lpTop);
    expect(PROFILES.moto.idle).not.toBe(PROFILES.sedan.idle);                      // its own recording at idle
    for (const p of Object.values(PROFILES)) { expect(SAMPLE_NAMES).toContain(p.idle); expect(SAMPLE_NAMES).toContain(p.rev); expect(p.xf[0]).toBeLessThan(p.xf[1]); }
    expect(profileFor('unknown')).toBe(PROFILES.sedan);
  });
  it('only the Jakarta is brought down at speed (about −8 dB measured at the speaker when riding); the cars are not touched', () => {
    expect(PROFILES.moto.topTrim).toBeCloseTo(0.08, 2);
    for (const k of ['sedan', 'luxury', 'suv'] as const) expect(PROFILES[k].topTrim).toBe(1);
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
