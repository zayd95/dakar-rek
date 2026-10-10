import { describe, expect, it } from 'vitest';
import { driveStep, hits, newDriveState, type Blocked } from '../src/transport/drive';
import { carSpec, sedanSeed, CAR_ASSET, SEDAN_SILVER } from '../src/transport/car';
import { motoSpec, jakartaSeed } from '../src/transport/moto';
import { footprint, kerbDealer, roadDistance } from '../src/transport/ownedModule';
import { kerbCoords } from '../src/transport/passengers';
import { ownsVehicle, park, parked } from '../src/transport/owned';
import { buyAsset, holding } from '../src/economy/assets';
import { specOf } from '../src/economy/catalog';
import { GameState } from '../src/core/state';
import { vehicleSpec } from '../src/actors/vehicleKit';
import { newSave } from '../src/core/save';
import type { DriveSpec } from '../src/transport/spec';

const open: Blocked = () => false;
const drive = (d: DriveSpec, steps: number, f: (i: number) => { throttle: number; steer: number }, s = newDriveState(0, 0, 0), blocked: Blocked = open) => {
  for (let i = 0; i < steps; i++) driveStep(s, f(i), d, 1 / 30, blocked);
  return s;
};

describe('the used saloon', () => {
  const spec = carSpec();

  it('is a silver kit saloon, left-hand drive, the other seats not for the driver, closed cabin', () => {
    const k = vehicleSpec('sedan', { seed: sedanSeed(), driver: false, passengers: false });
    expect(k.colors.body).toBe(SEDAN_SILVER);
    expect(spec.kind).toBe('car'); expect(spec.cabin).toBe('closed');
    expect(spec.driver.id).toBe('driver'); expect(spec.driver.x).toBeGreaterThan(0);        // +x = the car's left
    // a seated humanoid (about 0.95 m from the seat to the top of the head) stays under the roof
    expect(spec.driver.y + 0.95).toBeLessThan(k.height - 0.05);
    expect(spec.seats.length).toBe(4); expect(spec.seats.every(s => s.npcOnly)).toBe(true);
    expect(spec.doors[0].id).toBe('fl');
  });

  it('cameras come from the kit anchors: behind the car (with a phone-portrait placement) and at the wheel', () => {
    const k = vehicleSpec('sedan', { seed: sedanSeed(), driver: false, passengers: false });
    const chase = spec.cameras[0], wheel = spec.cameras.find(c => c.id === 'volant')!;
    expect(chase.id).toBe('chase'); expect(chase.pos).toEqual([...k.cameras.chase.pos]);
    expect(chase.portrait!.pos[2]).toBeLessThan(chase.pos[2]); expect(chase.portrait!.pos[1]).toBeGreaterThan(chase.pos[1]);
    expect(wheel.inside).toBe(true); expect(wheel.pos).toEqual([...k.cameras.driver.pos]);
    expect(spec.cameras.every(c => c.portrait)).toBe(true);
  });

  it('drives like a car: no lean, a bit faster than the motorbike, a wider turning circle', () => {
    const c = spec.drive!, m = motoSpec().drive!;
    expect(c.lean).toBe(false); expect(m.lean).toBe(true);
    expect(c.maxSpeed).toBeGreaterThan(m.maxSpeed); expect(c.maxSpeed).toBeLessThan(m.maxSpeed * 1.5);
    expect(c.turnRadius).toBeGreaterThan(m.turnRadius * 1.4);
    // full lock at walking pace for 3 s: the motorbike turns through a tighter circle than the car
    const turn = (d: DriveSpec) => {
      const s = newDriveState(0, 0, 0);
      drive(d, 30 * 2, () => ({ throttle: 0.25, steer: 0 }), s);
      const v = s.speed; drive(d, 30 * 3, () => ({ throttle: 0.25, steer: 1 }), s);
      return { v, yaw: s.yaw };
    };
    const tc = turn(c), tm = turn(m);
    expect(Math.abs(tc.yaw) / tc.v).toBeLessThan(Math.abs(tm.yaw) / tm.v);
    const top = drive(c, 30 * 15, () => ({ throttle: 1, steer: 0 }));
    expect(top.speed).toBeGreaterThan(m.maxSpeed);
  });

  it('its footprint has no gap a post could slip through, and it stops at a wall', () => {
    const d = spec.drive!;
    // a thin post against the side, between the front and the middle of the car
    const post: Blocked = (x, z, r) => Math.abs(x - (d.halfWidth - 0.05)) < r + 0.05 && Math.abs(z - 0.7) < r + 0.05;
    expect(hits(d, 0, 0, 0, post)).toBe(true);
    const wall: Blocked = (_x, z, r) => z + r > 20;
    const s = drive(d, 30 * 10, () => ({ throttle: 1, steer: 0 }), newDriveState(0, 0, 0), wall);
    expect(s.z + d.halfLength).toBeLessThanOrEqual(20.05);
    // parked solid boxes cover the body (yaw 0: exactly its rectangle)
    const boxes = footprint(d, 10, 5, 0, 1.45);
    expect(Math.min(...boxes.map(b => b.x0))).toBeCloseTo(10 - d.halfWidth); expect(Math.max(...boxes.map(b => b.z1))).toBeCloseTo(5 + d.halfLength);
  });

  it('is the catalogue\'s « Voiture d\'occasion », for sale at its price', () => {
    expect(specOf(CAR_ASSET)).toMatchObject({ kind: 'vehicle', name: 'Voiture d’occasion', price: 2_800_000 });
    expect(specOf(CAR_ASSET)?.soon).toBeUndefined();
  });
});

describe('the dealer at the kerb', () => {
  it('puts the counter on the pavement and the cars in the kerb lane, facing the traffic of that side', () => {
    // Dakar Réparation (Plateau, shops block 3,3): the nearest road is the line x = 120, the shop to its west
    const site = kerbDealer(101, 85.7, { displays: [{ along: -6, seed: 1 }, { along: -11.5, seed: 2 }], delivery: 6.5, sign: 2.4, desk: true, clear: [-16, 12] });
    expect(site.delivery).toMatchObject({ yaw: 0 }); expect(site.delivery.x).toBeCloseTo(115.7); expect(site.delivery.z).toBeCloseTo(92.2);
    expect(120 - site.counter.x).toBeGreaterThan(5); expect(120 - site.counter.x).toBeLessThan(7);   // on the pavement
    for (const d of site.displays) { expect(d.x).toBeCloseTo(115.7); expect(d.z).toBeLessThan(85.7); }
    const z = site.kerb[0];
    expect(kerbCoords(z, 115.7, 85.7 - 16).along).toBeCloseTo(z.from); expect(kerbCoords(z, 115.7, 92.2).lateral).toBeCloseTo(4.3);
    // a road along x, shop to its south: heading −x (driving on the right)
    const s2 = kerbDealer(10, -9, { displays: [], delivery: 0, sign: 0, clear: [-5, 5] });
    expect(s2.delivery.z).toBeCloseTo(-4.3); expect(s2.delivery.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('knows which side of a parked car is the pavement', () => {
    expect(roadDistance(115.7 - 1.6, 90)).toBeGreaterThan(roadDistance(115.7 + 1.6, 90));
    expect(roadDistance(30, 6)).toBeCloseTo(6);
  });
});

describe('owning the car and the motorbike side by side', () => {
  it('two assets, two parking spots', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 3_000_000;
    expect(buyAsset(s, 'jakarta')).toBeTruthy(); expect(ownsVehicle(s, 'clando')).toBe(false);
    expect(buyAsset(s, 'clando')).toBeTruthy();
    expect(s.wallet).toBe(3_000_000 - 150_000 - 2_800_000);
    park(s.data, { asset: 'jakarta', hub: 'pikine', x: 1, z: 2, yaw: 0 });
    park(s.data, { asset: 'clando', hub: 'corniche', x: -30.5, z: 64.3, yaw: 1.5708 });
    expect(parked(s.data, 'clando')).toMatchObject({ hub: 'corniche', x: -30.5, z: 64.3 });
    expect(parked(s.data, 'jakarta')).toMatchObject({ hub: 'pikine', x: 1 });
    expect(holding(s, 'clando')?.paid).toBe(2_800_000);
  });
});

describe('the motorbike side stand', () => {
  it('is down when parked and up while ridden', async () => {
    const { buildVehicle } = await import('../src/actors/vehicleKit');
    const parked = buildVehicle('moto', { seed: jakartaSeed(), driver: false, passengers: false, lod: 'near' });
    const ridden = buildVehicle('moto', { seed: jakartaSeed(), driver: false, passengers: false, stand: false, lod: 'near' });
    expect(ridden.spec.budget.near.tris).toBeLessThan(parked.spec.budget.near.tris);
    const spec = motoSpec();
    expect(spec.build({ ridden: true })).not.toBe(spec.build({ ridden: false }));
  });

  it('the rider sits astride (the kit seat\'s Ride pose), the car\'s driver sits; the model animates', async () => {
    const { Vehicle } = await import('../src/transport/vehicle');
    expect(motoSpec().driver.clip).toBe('Ride'); expect(carSpec().driver.clip).toBeUndefined();
    const v = new Vehicle(motoSpec(), 'pikine:moto:jakarta', 1, jakartaSeed());
    expect(v.driverSeat.clip).toBe('Ride');
    let lean = 0;
    v.setRidden(true);
    for (let i = 0; i < 60; i++) lean = v.animate(10, -1, 1 / 30);            // full left at 36 km/h
    expect(Math.abs(lean)).toBeGreaterThan(0.2);
    v.setRidden(false); expect(v.animate(0, 0, 1 / 30)).toBe(0);              // a fresh model when getting off: upright
    const c = new Vehicle(carSpec(), 'plateau:car:berline', 1, sedanSeed());
    for (let i = 0; i < 30; i++) expect(c.animate(10, 1, 1 / 30)).toBe(0);   // cars do not lean
  });
});
