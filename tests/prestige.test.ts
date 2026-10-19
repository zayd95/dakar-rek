import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { CITY_BLOCKS } from '../src/world/city';
import { COUNTER, DESK, FORECOURT_PARK, FRONT, HALL, MOTO_PLINTH, PARCEL, PRESTIGE_BLOCK, SALES_HOME, SLOTS, inGrounds } from '../src/world/prestige';
import { NavGrid } from '../src/world/navgrid';
import { berline, suv, BERLINE_NAVY, BERLINE_WHITE, SUV_GREEN, SUV_WHITE, berlineSeed, suvSeed } from '../src/transport/premiumCars';
import { buildVehicle, setKitDoor, vehicleKey } from '../src/actors/vehicleKit';
import { paintSeed, park, parked, setPaintSeed, unpark } from '../src/transport/owned';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import type { Collider, HubWorld } from '../src/world/types';

stubCanvas();
const hitsRect = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;

describe('Prestige Auto: the reserved parcel of the Almadies', () => {
  let hub: HubWorld | null = null;
  const almadies = async () => { if (!hub) { const { buildHub } = await import('../src/world/builder'); hub = buildHub('almadies', true); } return hub; };

  it('is a block of its own in the generator: the hall, its bays and the pylon lie inside it, on the plaza\'s road', () => {
    expect(CITY_BLOCKS.almadies[PRESTIGE_BLOCK]).toBe('prestige');
    expect(HALL.x0).toBeGreaterThan(PARCEL.x0); expect(HALL.x1).toBeLessThan(PARCEL.x1); expect(HALL.z0).toBeGreaterThan(PARCEL.z0); expect(HALL.z1).toBeLessThan(PARCEL.z1);
    expect(PARCEL.z0).toBe(7);                                                          // the block starts where the pavement ends (the road's centre line is z = 0)
    for (const s of SLOTS) { expect(s.x).toBeGreaterThan(FRONT.bay[0] + 0.9); expect(s.x).toBeLessThan(FRONT.bay[1] - 0.9); expect(s.yaw).toBeCloseTo(Math.PI); }
    for (let i = 1; i < SLOTS.length; i++) expect(SLOTS[i].x - SLOTS[i - 1].x).toBeGreaterThanOrEqual(4.2);   // a door's width and room to walk between the cars
    expect(SLOTS.map(s => s.model)).toEqual(['berline', 'berline', 'suv', 'suv']);
    expect(FRONT.door[1] - FRONT.door[0]).toBeGreaterThan(3);                           // a doorway to walk through
    expect(MOTO_PLINTH.x1).toBeLessThan(FRONT.door[0]);                                 // the motorbike plinth does not block the entrance
    expect(inGrounds(COUNTER.x, COUNTER.z)).toBe(true); expect(inGrounds(0, 100)).toBe(false);
  });

  it('nothing else of the hub stands in the parcel, the cars have their bays and a straight way out, the desk and the doorway are free', async () => {
    const h = await almadies();
    // every solid that touches the block lies wholly inside it (no villa, wall or tree of the grid straddles its edge)
    const touching = h.colliders.filter(c => hitsRect(c, PARCEL));
    for (const c of touching) { expect(c.x0 >= PARCEL.x0 - 0.01 && c.x1 <= PARCEL.x1 + 0.01 && c.z0 >= PARCEL.z0 - 0.01 && c.z1 <= PARCEL.z1 + 0.01, JSON.stringify(c)).toBe(true); }
    // each bay is clear (the dealer's floor cars add their own boxes when they are built, in the game), and so is the lane out through the bay to the road
    for (const s of SLOTS) {
      const lane = { x0: s.x - 1.05, x1: s.x + 1.05, z0: 0, z1: s.z + 2.7 };
      const blockers = h.colliders.filter(c => hitsRect(c, lane));
      expect(blockers.map(c => JSON.stringify(c)), `lane of the car at ${s.x}`).toEqual([]);
    }
    expect(h.colliders.some(c => hitsRect(c, { x0: FRONT.door[0] + 0.3, x1: FRONT.door[1] - 0.3, z0: HALL.z0 - 2, z1: HALL.z0 + 3 }))).toBe(false);
    expect(h.colliders.some(c => hitsRect(c, { x0: COUNTER.x - 0.6, x1: COUNTER.x + 0.6, z0: COUNTER.z - 0.6, z1: COUNTER.z + 0.6 }))).toBe(false);
    expect(h.colliders.some(c => hitsRect(c, { x0: FORECOURT_PARK.x - 1, x1: FORECOURT_PARK.x + 1, z0: FORECOURT_PARK.z - 2.5, z1: FORECOURT_PARK.z + 2.5 }))).toBe(false);
    // the hall's glass front is solid (a wall of panes), but for the doorway and the bay
    const front = h.colliders.filter(c => c.z0 < HALL.z0 && c.z1 > HALL.z0 && c.z1 - c.z0 < 0.5 && c.h >= HALL.h);
    const xs = (x: number) => front.some(c => x > c.x0 && x < c.x1);
    expect(xs(-107)).toBe(true); expect(xs(-97)).toBe(true); expect(xs(-73)).toBe(true);
    expect(xs(-101)).toBe(false); expect(xs(-86)).toBe(false);
  });

  it('the salesperson can walk from his desk to every car\'s front, to the doorway and out to the forecourt on the hub\'s real colliders', async () => {
    const h = await almadies(), grid = new NavGrid({ x0: -114, x1: -66, z0: 5, z1: 54 }, h.colliders);
    const home = { x: SALES_HOME.x, z: SALES_HOME.z };
    expect(grid.free(home)).toBe(true);
    for (const s of SLOTS) {
      const nose = { x: s.x - 0.9, z: s.z - 3.6 };                                       // in front of the nose, off the driver's side
      expect(grid.free(nose), `front of ${s.x}`).toBe(true);
      expect(grid.path(home, nose), `to ${s.x}`).not.toBeNull();
    }
    expect(grid.path(home, { x: -101.2, z: 12 })).not.toBeNull();                        // out by the doorway
    expect(grid.path(home, { x: -86, z: 9 })).not.toBeNull();
    expect(DESK.z).toBeLessThan(HALL.z1);
  });

  it('two saloons and two SUVs in four distinct paints, none of them the catalogue\'s graphite or black', () => {
    const hubStub = { id: 'almadies' } as HubWorld;
    const b = berline.def.dealer!.site(hubStub)!, s = suv.def.dealer!.site(hubStub)!;
    expect(b.floor!.slots.map(x => x.seed)).toEqual([berlineSeed(BERLINE_WHITE), berlineSeed(BERLINE_NAVY)]);
    expect(s.floor!.slots.map(x => x.seed)).toEqual([suvSeed(SUV_WHITE), suvSeed(SUV_GREEN)]);
    expect(new Set([...b.floor!.slots, ...s.floor!.slots].map(x => x.seed)).size).toBe(4);
    expect(b.floor!.slots.every(x => x.x >= FRONT.bay[0] && x.x <= FRONT.bay[1])).toBe(true);
    expect(berline.def.dealer!.site({ id: 'plateau' } as HubWorld)).toBeNull();
    // the bought car delivered by phone waits on the forecourt, not in the bay
    expect(b.delivery.z).toBeLessThan(HALL.z0);
  });
});

describe('the driver\'s door of the kit cars (a separate leaf, not a fused body)', () => {
  const opts = { driver: false, passengers: false } as const;
  for (const [kind, seed] of [['luxury', 5], ['suv', 6], ['sedan', 7]] as const) {
    it(`${kind}: the leaf hangs on a hinge at the front of the door, turns outward and opens an opening onto a closed footwell`, () => {
      const shut = buildVehicle(kind, { ...opts, seed }), door = buildVehicle(kind, { ...opts, seed, openable: true });
      expect(shut.group.userData.kitDoor).toBeUndefined();
      const pivot = door.group.userData.kitDoor as { position: { x: number; y: number; z: number }; rotation: { y: number }; children: { geometry: { boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null; computeBoundingBox(): void } }[] };
      expect(pivot).toBeDefined();
      expect(pivot.position.x).toBeGreaterThan(0.7);                                      // the driver's side is the vehicle's left (+x)
      const body = pivot.children[0].geometry; body.computeBoundingBox();
      const bb = body.boundingBox!;
      expect(bb.max.z).toBeLessThan(0.25); expect(bb.min.z).toBeGreaterThan(-1.7);         // the leaf extends back from the hinge, about a door long
      expect(bb.max.z - bb.min.z).toBeGreaterThan(0.9);
      expect(bb.max.y).toBeGreaterThan(0.9);                                              // up through the window
      setKitDoor(door.group, 1); expect(pivot.rotation.y).toBeLessThan(-0.9);
      setKitDoor(door.group, 0); expect(Math.abs(pivot.rotation.y)).toBe(0);
      // the doored body costs a few dozen triangles more than the fused one, nothing else
      const tris = (b: typeof shut) => b.spec.budget.near.tris;
      expect(tris(door)).toBeGreaterThan(tris(shut)); expect(tris(door)).toBeLessThan(tris(shut) + 200);
      expect(vehicleKey(kind, { ...opts, seed, openable: true })).not.toBe(vehicleKey(kind, { ...opts, seed }));
    });
  }
  it('a pickup, a taxi or a motorbike is not given a door it does not have', () => {
    for (const kind of ['pickup', 'moto', 'carRapide'] as const) expect(buildVehicle(kind, { seed: 3, openable: true }).group.userData.kitDoor).toBeUndefined();
  });
});

describe('the paint of a car bought from the floor', () => {
  it('is kept with the parking spot, absent for a car bought before, and forgotten with it', () => {
    const s = new GameState(newSave(0));
    expect(paintSeed(s.data, 'berline')).toBeNull();
    park(s.data, { asset: 'berline', hub: 'almadies', x: -92.6, z: 23, yaw: Math.PI });
    expect(paintSeed(s.data, 'berline')).toBeNull();                                       // the catalogue's paint
    setPaintSeed(s.data, 'berline', berlineSeed(BERLINE_NAVY));
    const back = JSON.parse(JSON.stringify(s.data));
    expect(back.counters['vehicle:berline:seed']).toBe(berlineSeed(BERLINE_NAVY));
    expect(paintSeed(back, 'berline')).toBe(berlineSeed(BERLINE_NAVY)); expect(parked(back, 'berline')).toMatchObject({ x: -92.6, z: 23 });
    unpark(s.data, 'berline'); expect(paintSeed(s.data, 'berline')).toBeNull(); expect(parked(s.data, 'berline')).toBeNull();
  });
});

describe('the street dressing leaves the dealership\'s frontage alone', () => {
  it('no stall, bin or sign stands on the parcel or the pavement before it, so the cars can turn out onto the road', async () => {
    const { buildHub } = await import('../src/world/builder'), { dressHub } = await import('../src/game/streetDress');
    const h = buildHub('almadies', true), r = dressHub(h, 'high');
    expect(r.items.length).toBeGreaterThan(5);
    for (const i of r.items) expect(inGrounds(i.x, i.z, 1.5), JSON.stringify(i)).toBe(false);
    for (const c of h.colliders) if (c.h <= 5 && c.x0 > -100 && c.x1 < -78 && c.z0 > 0 && c.z1 < 8) expect(JSON.stringify(c)).toBe('nothing');
  });
});
