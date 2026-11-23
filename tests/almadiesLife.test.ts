import { describe, expect, it } from 'vitest';
import { LIFE_CAP, siteDraw, type Site } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { lifeInHub } from '../src/world/almadies/district';
import { bench, menuBoard, parkedCar, scooter } from '../src/world/almadies/parts';
import { testKit, trisOf } from './helpers/siteCost';

/**
 * LD2.0-E round 3 (« several buildings look impressive from a distance but need more life at ground level »): what a design puts on its ground floor, in the plan, reaches the hub as
 * seats (the Seats registry) and placed people, turned the way the site is turned.
 */
const sites: Site[] = [];
for (const facing of ['north', 'south'] as const) for (const mirror of [false, true]) sites.push({ ...SITES.find(s => s.kind === 'hotel')!, facing, mirror });
const forward = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)] as const;

describe('a site\'s life in the hub', () => {
  for (const s of sites) it(`${s.facing}${s.mirror ? ' mirrored' : ''}: points and facings go through the site's frame; a person facing the street faces it`, () => {
    const d = siteDraw(testKit().kit, s), o = d.f.p(0, 0), st = d.f.p(0, 1), street = [st.x - o.x, st.z - o.z];
    const l = lifeInHub(d, { seats: [{ x: 3, z: 5, yaw: 0, kind: 'chair', top: 0.49, table: { x: 3, y: 0.75, z: 5.6 } }, { x: -4, z: 6, yaw: Math.PI / 2, kind: 'bench', top: 0.55 }], people: [{ x: 1, z: 7, yaw: 0, clip: 'Idle' }, { x: 2, z: 8, yaw: Math.PI, clip: 'Talk', y: 0 }] });
    const p = d.f.p(3, 5), t = d.f.p(3, 5.6);
    expect(l.seats[0]).toMatchObject({ id: `${s.id}:seat:0`, x: p.x, z: p.z, top: 0.49, kind: 'chair', space: 'street', occupant: null, table: { x: t.x, y: 0.75, z: t.z } });
    expect(forward(l.seats[0].yaw)[0]).toBeCloseTo(street[0], 6); expect(forward(l.seats[0].yaw)[1]).toBeCloseTo(street[1], 6);
    expect(forward(l.people[0].yaw)[0]).toBeCloseTo(street[0], 6); expect(forward(l.people[0].yaw)[1]).toBeCloseTo(street[1], 6);
    expect(forward(l.people[1].yaw)[0]).toBeCloseTo(-street[0], 6);                              // facing the building
    const right = d.f.p(1, 0), side = [right.x - o.x, right.z - o.z];
    expect(forward(l.seats[1].yaw)[0]).toBeCloseTo(side[0], 6); expect(forward(l.seats[1].yaw)[1]).toBeCloseTo(side[1], 6);
    expect(l.people[1]).toMatchObject({ clip: 'Talk', y: 0 }); expect(l.people[0]).not.toHaveProperty('y');
  });
  it('a site keeps to its cap: the rest is dropped', () => {
    const s = SITES.find(x => x.kind === 'villa')!, d = siteDraw(testKit().kit, s), cap = LIFE_CAP.villa;
    const l = lifeInHub(d, { seats: Array.from({ length: 40 }, (_, i) => ({ x: i, z: 0, yaw: 0, kind: 'stool' as const, top: 0.45 })), people: Array.from({ length: 9 }, (_, i) => ({ x: i, z: 0, yaw: 0, clip: 'Idle' as const })) });
    expect(l.seats).toHaveLength(cap.seats); expect(l.people).toHaveLength(cap.people);
    expect(new Set(l.seats.map(x => x.id)).size).toBe(cap.seats);
  });
});

describe('the small things of a lived-in ground floor (parts.ts)', () => {
  const villa = SITES.find(x => x.kind === 'villa')!;
  const draw = (f: (d: ReturnType<typeof siteDraw>) => unknown) => { const t = testKit(), d = siteDraw(t.kit, villa), r = f(d); return { d, tris: trisOf(t), r }; };
  it('cost what they say, and a parked car, a scooter and a bench are solid where they stand', () => {
    const car = draw(d => parkedCar(d, 0, 0, 0)), suv = draw(d => parkedCar(d, 0, 0, Math.PI / 2, { suv: true })), sc = draw(d => scooter(d, 0, 0, Math.PI)), bn = draw(d => bench(d, 0, 0, 0)), mb = draw(d => menuBoard(d, 0, 0, 0));
    expect(car.tris).toBeLessThanOrEqual(100); expect(suv.tris).toBeLessThanOrEqual(100); expect(sc.tris).toBeLessThanOrEqual(80); expect(bn.tris).toBeLessThanOrEqual(70); expect(mb.tris).toBeLessThanOrEqual(40);
    expect(car.d.colliders).toHaveLength(1); expect(sc.d.colliders).toHaveLength(1); expect(bn.d.colliders).toHaveLength(1); expect(mb.d.colliders).toHaveLength(0);
    const c = car.d.colliders[0], o = car.d.f.p(0, 0);
    expect(c.x1 - c.x0).toBeCloseTo(1.78, 5); expect(c.z1 - c.z0).toBeCloseTo(4.25, 5); expect((c.x0 + c.x1) / 2).toBeCloseTo(o.x, 5);
    const s = suv.d.colliders[0]; expect(s.x1 - s.x0).toBeCloseTo(4.7, 5);                         // turned a quarter: its length lies along x
  });
  it('a bench hands its seats: n of them, along its length, facing where it faces, 0.47 m high', () => {
    const { r } = draw(d => bench(d, 2, 3, Math.PI / 2, { len: 2.4, n: 3 })), seats = r as ReturnType<typeof bench>;
    expect(seats).toHaveLength(3);
    for (const s of seats) { expect(s.yaw).toBeCloseTo(Math.PI / 2); expect(s.kind).toBe('bench'); expect(s.top).toBeCloseTo(0.57, 5); expect(s.x).toBeGreaterThan(1.7); expect(s.x).toBeLessThan(2.4); }
    expect(seats.map(s => s.z).sort((a, b) => a - b)[2] - seats.map(s => s.z).sort((a, b) => a - b)[0]).toBeCloseTo(1.7, 5);   // spread along z (its length), 2.4 − 0.7
  });
  it('are deterministic', () => { expect(draw(d => { parkedCar(d, 1, 2, 0); scooter(d, 3, 2, 0); bench(d, 5, 2, 0); menuBoard(d, 7, 2, 0); }).tris).toBe(draw(d => { parkedCar(d, 1, 2, 0); scooter(d, 3, 2, 0); bench(d, 5, 2, 0); menuBoard(d, 7, 2, 0); }).tris); });
});
