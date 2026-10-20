import { describe, expect, it } from 'vitest';
import { BAND_LABEL, LIMP_HP, TAP_SPEED, TOW_FEE, bandOf, bandWarning, canMakeshift, damageOf, performance, repairQuote, scaledDrive, towFee } from '../src/transport/condition';
import { driveStep, newDriveState } from '../src/transport/drive';
import type { DriveSpec } from '../src/transport/spec';
import type { AssetState } from '../src/core/types';
import { ECONOMY } from '../src/economy/config';

const drive: DriveSpec = { maxSpeed: 16.5, reverseSpeed: 3, accel: 2.8, brake: 6.5, turnRadius: 5.6, steer: 2.6, halfWidth: 0.9, halfLength: 2.3, lean: false } as DriveSpec;

describe('damage', () => {
  it('a light contact costs nothing', () => {
    expect(damageOf(0)).toBe(0); expect(damageOf(1.2)).toBe(0); expect(damageOf(TAP_SPEED - 0.01)).toBe(0); expect(damageOf(-2)).toBe(0);
  });
  it('a real impact costs points, growing with the speed, capped', () => {
    const d = [3, 6, 10, 14, 30].map(damageOf);
    expect(d[0]).toBeGreaterThan(0);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
    expect(d[1]).toBeLessThan(8); expect(d[2]).toBeGreaterThan(8); expect(d[4]).toBeLessThanOrEqual(35);
  });
  it('a few ordinary bumps do not kill a car, a handful of crashes do', () => {
    let hp = 100; for (let i = 0; i < 6; i++) hp -= damageOf(4);
    expect(hp).toBeGreaterThan(70);
    hp = 100; for (let i = 0; i < 5; i++) hp = Math.max(0, hp - damageOf(14));
    expect(hp).toBe(0);
  });
});

describe('what condition does to the driving', () => {
  it('bands: whole above 70, worn to 40, rough to 20, poor above 0, dead at 0', () => {
    expect([100, 70, 69, 40, 39, 20, 19, 1, 0].map(bandOf)).toEqual(['whole', 'whole', 'worn', 'worn', 'rough', 'rough', 'poor', 'poor', 'dead']);
    expect(BAND_LABEL.dead).toBe('En panne');
  });
  it('a whole car drives exactly as before (the same object)', () => {
    expect(scaledDrive(drive, 100)).toBe(drive); expect(scaledDrive(drive, 70)).toBe(drive);
    expect(performance(100)).toEqual({ top: 1, accel: 1 });
  });
  it('a worn car is slower and picks up less, a dead one does not move', () => {
    let last = 1;
    for (const hp of [60, 30, 10]) { const s = scaledDrive(drive, hp); expect(s.maxSpeed).toBeLessThan(last * drive.maxSpeed + 1e-9); last = s.maxSpeed / drive.maxSpeed; expect(s.accel).toBeLessThan(drive.accel); expect(s.brake).toBe(drive.brake); }
    const dead = scaledDrive(drive, 0), s = newDriveState(0, 0, 0);
    for (let i = 0; i < 600; i++) driveStep(s, { throttle: 1, steer: 0 }, dead, 1 / 60, () => false);
    expect(Math.abs(s.speed)).toBeLessThan(0.05);
  });
  it('a car at 10 % still crawls forward (it is never stuck for good)', () => {
    const s = newDriveState(0, 0, 0), d = scaledDrive(drive, 10);
    for (let i = 0; i < 600; i++) driveStep(s, { throttle: 1, steer: 0 }, d, 1 / 60, () => false);
    expect(s.speed).toBeGreaterThan(3); expect(s.speed).toBeLessThan(drive.maxSpeed * 0.55);
  });
  it('says so when a hit moves the car into a worse band, and only then', () => {
    expect(bandWarning(100, 90)).toBeNull();
    expect(bandWarning(72, 66)).toMatch(/usée/); expect(bandWarning(45, 30)).toMatch(/fatiguée/); expect(bandWarning(25, 10)).toMatch(/ralenti/); expect(bandWarning(10, 0)).toMatch(/panne/);
  });
});

describe('the garage', () => {
  it('quotes nothing for a whole car and the asset model\'s own repair cost otherwise', () => {
    expect(repairQuote(6_000_000, 100)).toBe(0);
    expect(repairQuote(6_000_000, 50)).toBe(300_000);
    expect(repairQuote(6_000_000, 0)).toBe(600_000);
    expect(repairQuote(150_000, 0)).toBe(15_000);
    for (const [price, hp] of [[14_000_000, 63], [75_000_000, 12], [150_000, 80]] as const) {
      const a = { uid: 'a1', spec: 'compacte', how: 'owned', since: 0, paid: 0, condition: hp, upgrades: [], leased: false } as AssetState;
      expect(repairQuote(price, hp)).toBe(Math.round(price * ECONOMY.property.repairPerPoint * (100 - a.condition)));
    }
  });
  it('the tow is a flat fee, free when the wallet cannot pay it', () => {
    expect(towFee(1_000_000)).toBe(TOW_FEE); expect(towFee(TOW_FEE)).toBe(TOW_FEE); expect(towFee(TOW_FEE - 1)).toBe(0); expect(towFee(0)).toBe(0);
  });
  it('the makeshift fix is for the very worst cars only', () => {
    expect(canMakeshift(0)).toBe(true); expect(canMakeshift(LIMP_HP - 1)).toBe(true); expect(canMakeshift(LIMP_HP)).toBe(false); expect(canMakeshift(80)).toBe(false);
  });
});
