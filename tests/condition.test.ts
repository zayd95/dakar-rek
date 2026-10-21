import { describe, expect, it } from 'vitest';
import { BAND_LABEL, LIMP_HP, TAP_SPEED, TOW_FEE, bandOf, bandWarning, canMakeshift, damageOf, healthAlert, healthTag, hitDamage, performance, repairQuote, roadsideResult, scaledDrive, towFee, warnLevel, ROADSIDE_SECONDS } from '../src/transport/condition';
import { driveStep, newDriveState } from '../src/transport/drive';
import type { DriveSpec } from '../src/transport/spec';
import type { AssetState } from '../src/core/types';
import { ECONOMY } from '../src/economy/config';

const drive: DriveSpec = { maxSpeed: 16.5, reverseSpeed: 3, accel: 2.8, brake: 6.5, turnRadius: 5.6, steer: 2.6, halfWidth: 0.9, halfLength: 2.3, lean: false } as DriveSpec;

describe('damage', () => {
  it('a light contact costs nothing', () => {
    expect(damageOf(0)).toBe(0); expect(damageOf(1.2)).toBe(0); expect(damageOf(TAP_SPEED - 0.01)).toBe(0); expect(damageOf(-2)).toBe(0);
  });
  it('a parking bump costs nothing, an ordinary mistake a little, a real crash a lot (capped)', () => {
    expect(TAP_SPEED).toBeGreaterThanOrEqual(3.5);                                      // ≈ 13 km/h: nudging a car while parking is free
    const d = [4, 6, 10, 14, 20, 30].map(damageOf);
    expect(d[0]).toBeGreaterThan(0);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
    expect(d[1]).toBeLessThan(2);                                                        // 21 km/h into a post
    expect(d[2]).toBeGreaterThan(3); expect(d[2]).toBeLessThan(9);                       // 36 km/h: an ordinary mistake
    expect(d[4]).toBeGreaterThan(20);                                                    // 72 km/h: a real crash
    expect(d[5]).toBeLessThanOrEqual(45);
  });
  it('a few ordinary bumps do not ruin a car; several trips across districts with the usual knocks leave it drivable; a handful of crashes do kill it', () => {
    let hp = 100; for (let i = 0; i < 10; i++) hp -= damageOf(6);
    expect(hp).toBeGreaterThan(85);
    hp = 100; for (let i = 0; i < 8; i++) hp -= hitDamage(10, false);                  // eight glancing knocks at town speed
    expect(hp).toBeGreaterThan(60);
    hp = 100; for (let i = 0; i < 4; i++) hp = Math.max(0, hp - damageOf(20));
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
    expect(Math.abs(s.speed)).toBeLessThan(0.05); expect(Number.isFinite(s.x + s.z + s.yaw)).toBe(true);
  });
  it('a car at 10 % still drives (never stuck, never painfully slow), slower than a repaired one', () => {
    const s = newDriveState(0, 0, 0), d = scaledDrive(drive, 10);
    for (let i = 0; i < 600; i++) driveStep(s, { throttle: 1, steer: 0 }, d, 1 / 60, () => false);
    expect(s.speed).toBeGreaterThan(drive.maxSpeed * 0.55); expect(s.speed).toBeLessThan(drive.maxSpeed * 0.7);
    expect(performance(30).top).toBeGreaterThanOrEqual(0.8); expect(performance(60).top).toBeGreaterThanOrEqual(0.9);
  });
  it('says so when a hit moves the car into a worse band, and only then', () => {
    expect(bandWarning(100, 90)).toBeNull();
    expect(bandWarning(72, 66)).toMatch(/usée/); expect(bandWarning(45, 30)).toMatch(/fatiguée/); expect(bandWarning(25, 10)).toMatch(/ralenti/); expect(bandWarning(10, 0)).toMatch(/panne/);
  });
});

describe('the garage', () => {
  it('prices the work by the damage, not by what the car cost: a touch-up free, ordinary damage what a Pikine garage asks', () => {
    expect(repairQuote(6_000_000, 100)).toBe(0); expect(repairQuote(6_000_000, 97)).toBe(0);
    const moderate = repairQuote(6_000_000, 88), significant = repairQuote(6_000_000, 65);
    expect(moderate).toBeGreaterThanOrEqual(5_000); expect(moderate).toBeLessThanOrEqual(15_000);
    expect(significant).toBeGreaterThanOrEqual(20_000); expect(significant).toBeLessThanOrEqual(50_000);
    // the 14 M saloon nearly wrecked (7 %): a real bill, never the 1 302 000 F of the old rule (0.1 % of the price per point)
    const wreck = repairQuote(14_000_000, 7);
    expect(wreck).toBeGreaterThan(30_000); expect(wreck).toBeLessThan(150_000); expect(wreck).toBeLessThan(14_000_000 * ECONOMY.property.repairPerPoint * 93 / 5);
    // a dearer car costs somewhat more, never in proportion: the 70 M SUV wrecked is under 200 000 F; a motorbike's damage is cheap
    expect(repairQuote(70_000_000, 0)).toBeGreaterThan(repairQuote(6_000_000, 0)); expect(repairQuote(70_000_000, 0)).toBeLessThan(200_000);
    expect(repairQuote(150_000, 85)).toBeLessThanOrEqual(5_000);
    // property upkeep is a separate rule (homes, billboards): unchanged
    const a = { uid: 'a1', spec: 'compacte', how: 'owned', since: 0, paid: 0, condition: 63, upgrades: [], leased: false } as AssetState;
    expect(ECONOMY.property.repairPerPoint * 1_000_000 * (100 - a.condition)).toBe(37_000);
  });
  it('the tow is a flat fee, free when the wallet cannot pay it', () => {
    expect(towFee(1_000_000)).toBe(TOW_FEE); expect(towFee(TOW_FEE)).toBe(TOW_FEE); expect(towFee(TOW_FEE - 1)).toBe(0); expect(towFee(0)).toBe(0);
  });
  it('the makeshift fix is for the very worst cars only', () => {
    expect(canMakeshift(0)).toBe(true); expect(canMakeshift(LIMP_HP - 1)).toBe(true); expect(canMakeshift(LIMP_HP)).toBe(false); expect(canMakeshift(80)).toBe(false);
  });
});

describe('Pass 3 S1/S2: what a hit costs, what the card says, the roadside fix', () => {
  it('a glancing hit costs 60 % of a head-on one at the same speed, a tap nothing', () => {
    expect(hitDamage(10, true)).toBeCloseTo(damageOf(10), 1);
    expect(hitDamage(10, false)).toBeCloseTo(damageOf(10) * 0.6, 1);
    expect(hitDamage(TAP_SPEED - 0.1, true)).toBe(0); expect(hitDamage(1, false)).toBe(0);
  });
  it('the card is discreet when the car is healthy, clearer under 70 % and under 30 %, loud when it is dead', () => {
    expect(healthTag(100)).toBe(''); expect(healthTag(92.4)).toBe('92 %');
    expect(healthAlert(100)).toBeNull(); expect(healthAlert(70)).toBeNull(); expect(healthAlert(92)).toBeNull();
    expect(healthAlert(69)).toMatch(/Abîmée/); expect(healthAlert(45)).toMatch(/Abîmée/);
    expect(healthAlert(29)).toMatch(/Très abîmée.*Garage Modou/); expect(healthAlert(0)).toMatch(/En panne/);
    expect([100, 70, 69, 30, 29, 1, 0].map(warnLevel)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
  it('a dead car cannot move either way (not even backwards)', () => {
    const dead = scaledDrive(drive, 0), s = newDriveState(0, 0, 0);
    for (let i = 0; i < 600; i++) driveStep(s, { throttle: -1, steer: 0 }, dead, 1 / 60, () => false);
    expect(Math.abs(s.speed)).toBeLessThan(0.05); expect(dead.reverseSpeed).toBe(0);
    expect(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.yaw)).toBe(true);        // (a top speed of exactly 0 made driveStep divide 0 by 0)
    expect(Math.hypot(s.x, s.z)).toBeLessThan(0.05);
  });
  it('the roadside fix lifts only a car that will not run, only to « enough to crawl », and is not a repair', () => {
    expect(roadsideResult(0)).toBe(LIMP_HP); expect(roadsideResult(7)).toBe(LIMP_HP);
    expect(roadsideResult(LIMP_HP)).toBe(LIMP_HP); expect(roadsideResult(40)).toBe(40); expect(roadsideResult(100)).toBe(100);
    expect(ROADSIDE_SECONDS).toBeGreaterThanOrEqual(8); expect(ROADSIDE_SECONDS).toBeLessThanOrEqual(20);
    // after the fix the car still crawls slower than a repaired one, and a paid repair is still worth it
    expect(scaledDrive(drive, LIMP_HP).maxSpeed).toBeLessThan(scaledDrive(drive, 60).maxSpeed);
    expect(repairQuote(14_000_000, LIMP_HP)).toBeGreaterThan(0);
  });
});
