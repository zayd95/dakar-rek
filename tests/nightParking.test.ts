import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { LOTS, NIGHT_VENUES, PATIO_SITE, ROAD_EDGE_Z } from '../src/world/nightStreet';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * The Almadies night street's parking capacity (docs/districts/ALMADIES-NIGHTLIFE.md « Parking capacity »): is one car park of 21 painted bays enough for what the game asks of it?
 *
 * What asks for a bay, from the code and not from a guess:
 *  - the player's own cars: the game sells four (Teranga, Rafet, Lamane Sport, Gaïndé: src/transport/modelCars.ts), a car stays where it was left (saved as parked), and none of them is
 *    ever asked to share: so the car park must take **all four at once** and still have a bay for the next night;
 *  - other players: presence shows people, never their parked cars (src/multiplayer/protocol.ts has no parked-vehicle field), so a room of 24 asks for no bay;
 *  - the city's people: the ambient scheduler brings them on foot and by the taxi rank (the dépose-minute bay), never in a car of their own (src/social/ambientData.ts has no car arrival);
 *  - NPC cars: scenery in about half the bays (src/world/nightStreet.ts `bayRow`), never in the bays by a door; the street's parked traffic (`placeParked`) and the moving traffic are kept off the car park.
 *
 * A bay is only usable if the car can get into it: the arc a driver takes from the north lane (the car's own turning circle, its real half width and half length, src/transport/modelCars.ts)
 * must not sweep over a solid (an NPC car's, a sign post's). So the test drives each of the four cars into each free bay on paper.
 */
stubCanvas();
const LANE_Z = -124.3;                                        // the north lane's middle: the way a driver comes (scripts/check-nightlife-journey.mjs)
/** The four cars the game sells: half width, half length and tightest circle, as read from their specs (see the test below that checks them against the game). */
const CARS = [
  { id: 'teranga', hw: 0.8725, hl: 1.97, r: 5.2 }, { id: 'rafet', hw: 0.8725, hl: 2.03, r: 5.3 },
  { id: 'lamane', hw: 0.99, hl: 2.44, r: 6.4 }, { id: 'gainde', hw: 1.0, hl: 2.47, r: 6.2 },
] as const;
type Car = typeof CARS[number];
type Rect = { x0: number; x1: number; z0: number; z1: number };

/** An oriented rectangle (centre, heading, half extents, a margin of 0.15 m) against an axis-aligned box: separating-axis test. */
function overlaps(cx: number, cz: number, yaw: number, hw: number, hl: number, b: Rect): boolean {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, m = 0.15, HW = hw + m, HL = hl + m;      // forward and right unit vectors
  const bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2, ex = (b.x1 - b.x0) / 2, ez = (b.z1 - b.z0) / 2, dx = bx - cx, dz = bz - cz;
  if (Math.abs(dx) > ex + Math.abs(fx) * HL + Math.abs(rx) * HW) return false;                              // the box's own axes
  if (Math.abs(dz) > ez + Math.abs(fz) * HL + Math.abs(rz) * HW) return false;
  if (Math.abs(dx * fx + dz * fz) > HL + ex * Math.abs(fx) + ez * Math.abs(fz)) return false;                // the car's axes
  if (Math.abs(dx * rx + dz * rz) > HW + ex * Math.abs(rx) + ez * Math.abs(rz)) return false;
  return true;
}
/** The path of the car into a bay nose first: west along the lane to `x + r`, a right-hand quarter circle of its own tightest radius, then straight to the bay's middle. Returns the poses, the last one the parked car. */
function path(car: Car, bay: { x: number; z: number }): { x: number; z: number; yaw: number }[] {
  const out: { x: number; z: number; yaw: number }[] = [], r = car.r, cx = bay.x + r, cz = LANE_Z - r;
  for (let a = 0; a <= 90; a += 6) { const t = a * Math.PI / 180; out.push({ x: cx - r * Math.sin(t), z: cz + r * Math.cos(t), yaw: Math.atan2(-Math.cos(t), -Math.sin(t)) }); }    // heading west (yaw −π/2: forward = (sin yaw, cos yaw)) turning right to north, −z (yaw π)
  const endZ = cz, stopZ = Math.min(bay.z + 0.4, endZ);                                                         // straight on to the bay's middle, or where the circle ended if that is already past it
  for (let z = endZ; z >= stopZ - 1e-6; z -= 0.4) out.push({ x: bay.x, z, yaw: Math.PI });
  return out;
}
/** Can this car get into this bay past these solids, and is it then wholly off the carriageway? */
function fits(car: Car, bay: { x: number; z: number }, solids: Rect[]): boolean {
  const p = path(car, bay), last = p[p.length - 1];
  if (last.z + car.hl > ROAD_EDGE_Z - 0.2) return false;                                // the tail past the carriageway's edge
  return p.every(q => !solids.some(s => overlaps(q.x, q.z, q.yaw, car.hw, car.hl, s)));
}
const solidsOf = (h: HubWorld): Rect[] => h.colliders.filter((c: Collider) => c.h > 0.3 && c.z0 < ROAD_EDGE_Z + 0.5 && c.z1 > -140 && c.x1 > LOTS.west.x0 - 12 && c.x0 < LOTS.west.x1 + 12).map(c => ({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 }));
/** The footprint a parked car leaves behind (a solid for the next car). */
const parked = (car: Car, bay: { x: number; z: number }): Rect => ({ x0: bay.x - car.hw, x1: bay.x + car.hw, z0: bay.z - car.hl, z1: bay.z + car.hl });

const hubs: Partial<Record<'full' | 'lite', HubWorld>> = {};
const build = async (q: 'full' | 'lite') => hubs[q] ??= (await import('../src/world/builder')).buildHub('almadies', q === 'lite');

describe('the night street\'s car park: 21 bays are enough', () => {
  it('has at least 20 painted bays; NPC cars fill between a quarter and 60 % of them (a street with life, not an empty lot, not a full one) and at least 40 % stay free, on both presets', async () => {
    for (const q of ['full', 'lite'] as const) {
      const n = (await build(q)).nightStreet!, free = n.bays.filter(b => b.free).length, npc = n.bays.length - free;
      expect(n.bays.length, q).toBeGreaterThanOrEqual(20);
      expect(npc, `${q}: ${npc} NPC cars in ${n.bays.length} bays`).toBeGreaterThanOrEqual(Math.ceil(n.bays.length / 4));
      expect(free / n.bays.length, `${q}: ${free} free of ${n.bays.length}`).toBeGreaterThanOrEqual(0.4);
      expect(free, q).toBeGreaterThanOrEqual(8);
      expect(n.cars, 'the street\'s count of NPC cars is the bays that are taken').toBe(npc);
    }
  });

  it('keeps at least two free bays within 12 m of every door (Le Patio and the four venues; the hotel within 30 m), with NPC cars standing between them', async () => {
    const h = await build('full'), n = h.nightStreet!, free = n.bays.filter(b => b.free), door = h.rooftopDoor!.x;
    for (const [name, x] of [['Le Patio', PATIO_SITE.x], ...NIGHT_VENUES.map(v => [v.kind, v.cx] as const)] as const) expect(free.filter(b => Math.abs(b.x - x) < 12).length, name).toBeGreaterThanOrEqual(2);
    expect(free.filter(b => Math.abs(b.x - door) < 30).length, 'the hotel and its Terrasse across the road (the car park\'s east end is 15 m from the stair door)').toBeGreaterThanOrEqual(2);
    expect(n.bays.some(b => !b.free && Math.abs(b.x - PATIO_SITE.x) < 40), 'NPC cars stand in the Patio\'s half of the lot too').toBe(true);
  });

  it('takes each of the four cars the game sells into at least six free bays, swept on paper from the lane (the car\'s own circle, nothing solid touched)', async () => {
    for (const q of ['full', 'lite'] as const) {
      const h = await build(q), solids = solidsOf(h), free = h.nightStreet!.bays.filter(b => b.free);
      for (const car of CARS) {
        const ok = free.filter(b => fits(car, b, solids));
        expect(ok.length, `${q} · ${car.id}: ${ok.length} usable of ${free.length} free bays`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('the sweep has teeth: a pole on the approach, a car in the bay itself, or a truck 3.2 m wide each make a free bay unusable', async () => {
    const h = await build('full'), solids = solidsOf(h), car = CARS[0], bay = h.nightStreet!.bays.filter(b => b.free).find(b => fits(car, b, solids))!;
    expect(fits(car, bay, solids), 'the bay as it is').toBe(true);
    expect(fits(car, bay, [...solids, { x0: bay.x + 1, x1: bay.x + 1.4, z0: -128.5, z1: -128.1 }]), 'a pole on the swing').toBe(false);
    expect(fits(car, bay, [...solids, parked(car, bay)]), 'a car already in it').toBe(false);
    expect(fits({ id: 'truck', hw: 1.6, hl: 4, r: 9 } as unknown as Car, bay, solids), 'a truck').toBe(false);
  });

  it('has a usable bay for each car within 30 m of Le Patio\'s gate and within 30 m of the hotel\'s door (the two places the player is going)', async () => {
    const h = await build('full'), solids = solidsOf(h), free = h.nightStreet!.bays.filter(b => b.free), door = h.rooftopDoor!.x;
    for (const car of CARS) for (const [name, x] of [['Le Patio', PATIO_SITE.x], ['the hotel', door]] as const) {
      const near = free.filter(b => Math.abs(b.x - x) < 30 && fits(car, b, solids));
      expect(near.length, `${car.id} near ${name}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('takes the player\'s whole garage at once (all four cars, each left where it was parked) and still has bays for the next night', async () => {
    for (const q of ['full', 'lite'] as const) {
      const h = await build(q), free = h.nightStreet!.bays.filter(b => b.free), door = h.rooftopDoor!.x;
      const solids = solidsOf(h), taken: string[] = [];
      for (const car of CARS) {                                                      // the player's natural target: the bay nearest the hotel's door that this car can still get into
        const bay = free.filter(b => fits(car, b, solids)).sort((a, b) => Math.abs(a.x - door) - Math.abs(b.x - door))[0];
        expect(bay, `${q}: a bay for the ${car.id} after ${taken.join(', ') || 'nothing'}`).toBeTruthy();
        solids.push(parked(car, bay)); taken.push(car.id);
      }
      for (const car of CARS) expect(free.filter(b => fits(car, b, solids)).length, `${q}: bays left for the ${car.id} with four cars of the garage parked`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the street\'s parked traffic and its spawning off the car park, at every count the game uses', async () => {
    const { placeParked } = await import('../src/game/parkedVehicles');
    for (const [lite, count] of [[false, 40], [false, 60], [true, 28]] as const) {
      const h = await build(lite ? 'lite' : 'full'), g = placeParked(h, count);
      const inLot = g.children.filter(c => c.position.x > LOTS.west.x0 - 1 && c.position.x < LOTS.west.x1 + 1 && c.position.z < ROAD_EDGE_Z + 0.5 && c.position.z > -133.6);
      expect(inLot.map(c => [Math.round(c.position.x), Math.round(c.position.z)]), `${lite ? 'lite' : 'full'} ${count}`).toEqual([]);
    }
    const h = await build('full'), k = h.keepClear ?? [];
    expect(k.some(c => c.why === 'almadies_car_park' && c.x0 <= LOTS.west.x0 && c.x1 >= LOTS.west.x1), 'the car park is kept clear of the street dressing and the parked traffic').toBe(true);
    // the moving traffic's lanes are the carriageway (z −127…−113): no painted bay is on it
    for (const b of h.nightStreet!.bays) expect(b.z, `bay ${b.x}`).toBeLessThan(ROAD_EDGE_Z);
  }, 180000);

  it('has no demand of its own from the city: the venues\' doors are served on foot and by the taxi bay, and the capacity does not move with the hour', async () => {
    // the same lot is built every time, so the free bays do not depend on the hour or on who is online (the cars are scenery)
    const a = (await build('full')).nightStreet!, { buildHub } = await import('../src/world/builder'), b = buildHub('almadies', false).nightStreet!;
    expect(b.bays).toEqual(a.bays);
    expect(NIGHT_VENUES.length).toBe(4);
    expect(a.dropBay.x1 - a.dropBay.x0, 'the dépose-minute bay in front of Le Patio').toBeGreaterThanOrEqual(8);
  });
});
