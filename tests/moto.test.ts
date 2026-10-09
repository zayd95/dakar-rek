import { describe, expect, it } from 'vitest';
import { driveStep, newDriveState, targetSpeed, type Blocked } from '../src/transport/drive';
import { motoSpec, jakartaSeed, MOTO_CATALOGUE } from '../src/transport/moto';
import { owns, readOwned, writeOwned, parkOwned, toAsset } from '../src/transport/owned';
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
    expect(MOTO_CATALOGUE.price).toBeGreaterThan(0);
  });

  it('ownership is recorded in the save (flag + counters) and maps to the generic Asset', () => {
    const data = newSave();
    expect(owns(data, 'moto_jakarta')).toBe(false); expect(readOwned(data, 'moto_jakarta')).toBeNull();
    writeOwned(data, { id: 'moto_jakarta', kind: 'moto', seed: 5, hub: 'pikine', x: 110.5, z: -4.3, yaw: 1.5708, price: 75000, at: 1 });
    expect(owns(data, 'moto_jakarta')).toBe(true);
    parkOwned(data, 'moto_jakarta', 'plateau', 12.345, -7.891, 3.14159);
    const v = readOwned(data, 'moto_jakarta')!;
    expect(v).toMatchObject({ hub: 'plateau', x: 12.35, z: -7.89, yaw: 3.142, seed: 5, price: 75000 });
    expect(data.flags.filter(f => f === 'asset:vehicle:moto_jakarta')).toHaveLength(1);
    expect(toAsset(v)).toMatchObject({ kind: 'vehicle', catalogue: 'moto_jakarta', location: { hub: 'plateau' }, owner: 'player' });
    // the save survives a JSON round trip (device storage)
    const back = JSON.parse(JSON.stringify(data));
    expect(readOwned(back, 'moto_jakarta')).toEqual(v);
  });
});
