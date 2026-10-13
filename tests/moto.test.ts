import { describe, expect, it } from 'vitest';
import { driveStep, newDriveState, targetSpeed, type Blocked } from '../src/transport/drive';
import { motoSpec, jakartaSeed, MOTO_ASSET } from '../src/transport/moto';
import { migrateOwned, ownsVehicle, park, parked, unpark } from '../src/transport/owned';
import { buyAsset, holding, sellAsset } from '../src/economy/assets';
import { specOf } from '../src/economy/catalog';
import { GameState } from '../src/core/state';
import { vehicleSpec } from '../src/actors/vehicleKit';
import { newSave } from '../src/core/save';

const open: Blocked = () => false;
const run = (steps: number, f: (i: number) => { throttle: number; steer: number }, blocked: Blocked = open, s = newDriveState(0, 0, 0)) => {
  const d = motoSpec().drive!;
  let hits = 0;
  for (let i = 0; i < steps; i++) if (driveStep(s, f(i), d, 1 / 30, blocked)) hits++;
  return { s, hits };
};

describe('drive mode (stick → speed and steering)', () => {
  const d = motoSpec().drive!;

  it('accelerates forward up to the top speed and coasts to a stop when released', () => {
    const { s } = run(30 * 12, () => ({ throttle: 1, steer: 0 }));
    expect(s.speed).toBeGreaterThan(d.maxSpeed * 0.95); expect(s.speed).toBeLessThanOrEqual(d.maxSpeed + 1e-9);
    expect(s.z).toBeGreaterThan(80); expect(Math.abs(s.x)).toBeLessThan(1e-6);   // straight along +z (yaw 0)
    run(30 * 15, () => ({ throttle: 0, steer: 0 }), open, s);
    expect(s.speed).toBe(0);
  });

  it('brakes first, then reverses slowly', () => {
    const { s } = run(30 * 4, () => ({ throttle: 1, steer: 0 }));
    const v0 = s.speed;
    run(15, () => ({ throttle: -1, steer: 0 }), open, s);
    expect(s.speed).toBeLessThan(v0 - 3);                                 // strong brake
    run(30 * 6, () => ({ throttle: -1, steer: 0 }), open, s);
    expect(s.speed).toBeLessThan(0); expect(s.speed).toBeGreaterThanOrEqual(-d.reverseSpeed - 1e-9);
    expect(targetSpeed(d, 5, -1)).toBe(0); expect(targetSpeed(d, 0, -1)).toBe(-d.reverseSpeed);
  });

  it('turns right with the stick to the right (yaw goes down) and left the other way', () => {
    const right = run(30 * 3, () => ({ throttle: 0.6, steer: 1 })).s, left = run(30 * 3, () => ({ throttle: 0.6, steer: -1 })).s;
    expect(right.yaw).toBeLessThan(-0.3); expect(left.yaw).toBeGreaterThan(0.3);
    expect(right.x).toBeLessThan(0); expect(left.x).toBeGreaterThan(0);  // right of +z is −x
    const still = run(30, () => ({ throttle: 0, steer: 1 })).s;
    expect(still.yaw).toBe(0);                                            // no turning on the spot
  });

  it('never goes through a wall: stops against it, slides along it at an angle', () => {
    const wall: Blocked = (_x, z, r) => z + r > 10;                        // a wall across the road at z = 10
    const head = run(30 * 8, () => ({ throttle: 1, steer: 0 }), wall);
    expect(head.hits).toBeGreaterThan(0);
    expect(head.s.z + d.halfLength).toBeLessThanOrEqual(10 + 0.05);
    const slant = run(30 * 8, () => ({ throttle: 1, steer: 0 }), wall, newDriveState(0, 0, 0.6));
    expect(slant.s.z + 0.42).toBeLessThanOrEqual(10.05);
    expect(slant.s.x).toBeGreaterThan(3);                                 // slid along the wall
  });
});

describe('the Jakarta motorbike', () => {
  it('is a red, non-scooter kit motorbike with a driver seat, a door and a chase view', () => {
    const k = vehicleSpec('moto', { seed: jakartaSeed(), driver: false, passengers: false });
    expect(k.variant).toBeLessThan(10); expect(k.colors.body).toBe(0xc0392b);
    const s = motoSpec();
    expect(s.driver.id).toBe('driver'); expect(s.drive?.lean).toBe(true);
    expect(s.seats.every(x => x.npcOnly)).toBe(true);                     // the pillion is not for the rider
    expect(s.cameras[0].id).toBe('chase'); expect(s.cameras[0].portrait).toBeTruthy();
    expect(specOf(MOTO_ASSET)?.kind).toBe('vehicle'); expect(specOf(MOTO_ASSET)?.price).toBe(150_000);
  });

  it('is owned through the asset model, paid once; owned.ts only keeps where it is parked', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 200_000;
    expect(ownsVehicle(s, 'jakarta')).toBe(false); expect(parked(s.data, 'jakarta')).toBeNull();
    const l0 = s.data.ledger.length;
    expect(buyAsset(s, 'jakarta')).toBeTruthy();
    expect(buyAsset(s, 'jakarta')).toBeNull();                            // not twice
    expect(s.wallet).toBe(50_000); expect(s.data.ledger.length - l0).toBe(1);
    expect(ownsVehicle(s, 'jakarta')).toBe(true); expect(holding(s, 'jakarta')?.paid).toBe(150_000);
    park(s.data, { asset: 'jakarta', hub: 'plateau', x: 12.345, z: -7.891, yaw: 3.14159 });
    expect(parked(s.data, 'jakarta')).toEqual({ asset: 'jakarta', hub: 'plateau', x: 12.35, z: -7.89, yaw: 3.142 });
    // the save survives a JSON round trip (device storage)
    const back = new GameState(JSON.parse(JSON.stringify(s.data)));
    expect(ownsVehicle(back, 'jakarta')).toBe(true); expect(parked(back.data, 'jakarta')).toEqual(parked(s.data, 'jakarta'));
    // sold in « Biens »: no longer the player's; its spot is forgotten (bought again: delivered at the dealer)
    expect(sellAsset(s, holding(s, 'jakarta')!.uid)).toBeGreaterThan(0);
    expect(ownsVehicle(s, 'jakarta')).toBe(false);
    unpark(s.data, 'jakarta'); expect(parked(s.data, 'jakarta')).toBeNull();
  });

  it('a save with the motorbike bought before the asset model gets the asset, not charged again, still parked', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 1234;
    s.data.flags.push('asset:vehicle:moto_jakarta');
    Object.assign(s.data.counters, { 'asset:moto_jakarta:hub': 3, 'asset:moto_jakarta:x': 110.5, 'asset:moto_jakarta:z': -4.3, 'asset:moto_jakarta:yaw': 1.571, 'asset:moto_jakarta:seed': 8, 'asset:moto_jakarta:price': 75000, 'asset:moto_jakarta:at': 1 });
    const l0 = s.data.ledger.length;
    expect(migrateOwned(s)).toBe(true);
    expect(s.wallet).toBe(1234); expect(s.data.ledger.length).toBe(l0);
    expect(holding(s, 'jakarta')).toMatchObject({ how: 'owned', paid: 75000 });
    expect(parked(s.data, 'jakarta')).toEqual({ asset: 'jakarta', hub: 'pikine', x: 110.5, z: -4.3, yaw: 1.571 });
    expect(s.data.flags.includes('asset:vehicle:moto_jakarta')).toBe(false);
    expect(Object.keys(s.data.counters).some(k => k.startsWith('asset:moto_jakarta:'))).toBe(false);
    expect(migrateOwned(s)).toBe(false);                                  // once
    expect(s.data.assets.list.filter(a => a.spec === 'jakarta')).toHaveLength(1);
  });
});
