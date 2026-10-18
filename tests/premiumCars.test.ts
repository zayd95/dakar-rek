import { describe, expect, it } from 'vitest';
import { carSpec, kitSeedFor } from '../src/transport/car';
import { BERLINE_ASSET, BERLINE_GRAPHITE, BERLINE_NAVY, BERLINE_WHITE, PRESTIGE, SUV_ASSET, SUV_BLACK, SUV_GREEN, SUV_WHITE, berlineSeed, berlineSpec, suvSeed, suvSpec } from '../src/transport/premiumCars';
import { motoSpec } from '../src/transport/moto';
import { kerbDealer, footprint } from '../src/transport/ownedModule';
import { driveStep, newDriveState } from '../src/transport/drive';
import { ownsVehicle, park, parked, unpark } from '../src/transport/owned';
import { buyAsset, holding, sellAsset } from '../src/economy/assets';
import { specOf } from '../src/economy/catalog';
import { vehicleSpec } from '../src/actors/vehicleKit';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { HUB_IDS } from '../src/core/types';
import type { DriveSpec } from '../src/transport/spec';

const speedAfter = (d: DriveSpec, seconds: number) => { const s = newDriveState(0, 0, 0); for (let i = 0; i < seconds * 30; i++) driveStep(s, { throttle: 1, steer: 0 }, d, 1 / 30, () => false); return s.speed; };

describe('the premium saloon and the SUV on the owned-vehicle system', () => {
  const berline = berlineSpec(), suv = suvSpec(), sedan = carSpec();

  it('are the catalogue\'s « Berline neuve » and « 4 × 4 de luxe », for sale at Prestige Auto (no longer « soon »), prices unchanged', () => {
    expect(specOf(BERLINE_ASSET)).toMatchObject({ kind: 'vehicle', name: 'Berline neuve', price: 14_000_000, where: 'Prestige Auto · Almadies' });
    expect(specOf(SUV_ASSET)).toMatchObject({ kind: 'vehicle', name: '4 × 4 de luxe', price: 75_000_000, where: 'Prestige Auto · Almadies' });
    expect(specOf(BERLINE_ASSET)?.soon).toBeUndefined(); expect(specOf(SUV_ASSET)?.soon).toBeUndefined();
    expect(specOf('camion')?.soon).toBeTruthy();                                                   // the delivery truck stays out
  });

  it('wear the kit\'s luxury saloon and suv: left-hand drive, closed cabin, the driver under the roof, the three cameras from the kit anchors', () => {
    for (const [spec, kind, seed] of [[berline, 'luxury', berlineSeed()], [suv, 'suv', suvSeed()]] as const) {
      const k = vehicleSpec(kind, { seed, driver: false, passengers: false });
      expect(spec.kind).toBe('car'); expect(spec.cabin).toBe('closed'); expect(spec.driver.id).toBe('driver'); expect(spec.driver.x).toBeGreaterThan(0);
      expect(spec.driver.y + 0.95).toBeLessThan(k.height - 0.05);
      expect(spec.length).toBe(k.length); expect(spec.width).toBe(k.width);
      expect(spec.cameras.map(c => c.id)).toEqual(['chase', 'volant', 'haut']); expect(spec.cameras.every(c => c.portrait)).toBe(true);
      expect(spec.cameras[1].inside).toBe(true); expect(spec.cameras[1].pos).toEqual([...k.cameras.driver.pos]);
      expect(spec.seats.every(s => s.npcOnly)).toBe(true); expect(spec.seats.length).toBe(k.seats.length - 1);
    }
    expect(vehicleSpec('suv', { seed: suvSeed(), driver: false, passengers: false }).cameras.driver.pos[1]).toBeGreaterThan(vehicleSpec('luxury', { seed: berlineSeed(), driver: false, passengers: false }).cameras.driver.pos[1]);
  });

  it('are the right class of body: bigger than the modern sedan, the SUV the tallest', () => {
    expect(berline.length).toBeGreaterThan(sedan.length); expect(berline.width).toBeGreaterThan(sedan.width);
    expect(suv.length).toBeGreaterThan(sedan.length); expect(vehicleSpec('suv', { seed: suvSeed(), driver: false, passengers: false }).height).toBeGreaterThan(1.8);
  });

  it('handle like cars, each its own: the saloon the quickest, the SUV the heaviest, the widest circle, all faster than the motorbike\'s walking pace to 60 km/h', () => {
    const b = berline.drive!, s = suv.drive!, c = sedan.drive!, m = motoSpec().drive!;
    expect(b.lean).toBe(false); expect(s.lean).toBe(false);
    expect(b.maxSpeed).toBeGreaterThan(c.maxSpeed); expect(s.maxSpeed).toBeLessThanOrEqual(b.maxSpeed);
    expect(s.turnRadius).toBeGreaterThan(b.turnRadius); expect(b.turnRadius).toBeGreaterThan(c.turnRadius);
    expect(s.accel).toBeLessThan(b.accel);
    expect(b.maxSpeed).toBeLessThan(m.maxSpeed * 1.8); expect(s.maxSpeed).toBeGreaterThan(m.maxSpeed);
    expect(speedAfter(b, 20)).toBeCloseTo(b.maxSpeed, 0); expect(speedAfter(s, 20)).toBeCloseTo(s.maxSpeed, 0);
    // the solid boxes cover the body, a post cannot slip between them
    const boxes = footprint(s, 10, 5, 0, 1.95);
    expect(Math.min(...boxes.map(x => x.x0))).toBeCloseTo(10 - s.halfWidth); expect(Math.max(...boxes.map(x => x.z1))).toBeCloseTo(5 + s.halfLength);
  });

  it('the dealer\'s colours: the one sold is graphite / black, the two on display differ from it and from each other', () => {
    expect(vehicleSpec('luxury', { seed: berlineSeed(), driver: false, passengers: false }).colors.body).toBe(BERLINE_GRAPHITE);
    expect(vehicleSpec('suv', { seed: suvSeed(), driver: false, passengers: false }).colors.body).toBe(SUV_BLACK);
    for (const [kind, c] of [['luxury', BERLINE_WHITE], ['luxury', BERLINE_NAVY], ['suv', SUV_WHITE], ['suv', SUV_GREEN]] as const) {
      expect(vehicleSpec(kind, { seed: kitSeedFor(kind, c), driver: false, passengers: false }).colors.body).toBe(c);
    }
    expect(new Set([berlineSeed(), berlineSeed(BERLINE_WHITE), berlineSeed(BERLINE_NAVY)]).size).toBe(3);
    expect(new Set([suvSeed(), suvSeed(SUV_WHITE), suvSeed(SUV_GREEN)]).size).toBe(3);
  });

  it('the two corners face each other across the Almadies road z = 0: counters on their pavements, the vehicles in the kerb lane, traffic on the right', () => {
    const mk = (side: 1 | -1) => kerbDealer(PRESTIGE.x, side * PRESTIGE.z, { displays: [{ along: -6, seed: 1 }, { along: -11.5, seed: 2 }], delivery: 6.5, sign: 2.4, desk: true, clear: [-16, 12] });
    const north = mk(1), south = mk(-1);
    expect(north.delivery.z).toBeCloseTo(4.3); expect(north.delivery.yaw).toBeCloseTo(Math.PI / 2);
    expect(south.delivery.z).toBeCloseTo(-4.3); expect(south.delivery.yaw).toBeCloseTo(-Math.PI / 2);
    expect(north.counter.z).toBeGreaterThan(5); expect(south.counter.z).toBeLessThan(-5);
    for (const site of [north, south]) {
      expect(Math.abs(site.delivery.x - PRESTIGE.x)).toBeGreaterThan(4);
      for (const d of site.displays) expect(Math.abs(d.z)).toBeCloseTo(4.3);
      // inside the hub (±130) and clear of the cross road at x = −120 (its asphalt starts at −127… −113)
      for (const p of [site.delivery, site.counter, site.sign, ...site.displays]) { expect(p.x).toBeGreaterThan(-110); expect(p.x).toBeLessThan(-60); }
    }
  });
});

describe('five vehicles owned side by side (the Tiak loaner never owned)', () => {
  it('buy each once at its price, park each in its own hub, sell one without touching the others', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 500_000_000;
    const ids = ['jakarta', 'compacte', BERLINE_ASSET, SUV_ASSET] as const, prices = ids.map(i => specOf(i)!.price!);
    ids.forEach(i => expect(ownsVehicle(s, i)).toBe(false));
    for (const i of ids) expect(buyAsset(s, i), i).toBeTruthy();
    expect(s.wallet).toBe(500_000_000 - prices.reduce((a, b) => a + b, 0));
    expect(ids.map(i => holding(s, i)?.paid)).toEqual(prices);
    ids.forEach((i, k) => park(s.data, { asset: i, hub: HUB_IDS[k], x: k * 10 + 0.5, z: -k * 3, yaw: k / 10 }));
    ids.forEach((i, k) => expect(parked(s.data, i)).toMatchObject({ hub: HUB_IDS[k], x: k * 10 + 0.5, z: -k * 3 }));
    expect(buyAsset(s, BERLINE_ASSET)).toBeFalsy();                                               // not twice
    expect(ownsVehicle(s, 'tiak')).toBe(true);
    const a = holding(s, SUV_ASSET)!; sellAsset(s, a.uid); unpark(s.data, SUV_ASSET);
    expect(ownsVehicle(s, SUV_ASSET)).toBe(false); expect(parked(s.data, SUV_ASSET)).toBeNull();
    for (const i of ['jakarta', 'compacte', BERLINE_ASSET] as const) { expect(ownsVehicle(s, i)).toBe(true); expect(parked(s.data, i)).not.toBeNull(); }
  });

  it('cannot be bought without the money, and a save is plain JSON (older code ignores the new ids)', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 1_000_000;
    expect(buyAsset(s, SUV_ASSET)).toBeFalsy(); expect(s.wallet).toBe(1_000_000);
    s.data.wallet = 100_000_000; expect(buyAsset(s, SUV_ASSET)).toBeTruthy();
    park(s.data, { asset: SUV_ASSET, hub: 'almadies', x: -86, z: -4.3, yaw: -Math.PI / 2 });
    const back = JSON.parse(JSON.stringify(s.data));
    expect(back.counters['vehicle:tout_terrain:x']).toBe(-86); expect(back.assets.list.some((a: { spec: string }) => a.spec === 'tout_terrain')).toBe(true);
  });
});
