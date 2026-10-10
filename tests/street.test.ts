import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { HUB_STREETS, STREET_BUDGET, WALKERS_KEEP, WALK_BY_HOUR, edgeWeight, pavementLanes, ring, routeClear, stopSlots, streetTargets, clearWalk, crowdSlots, PAVE } from '../src/crowd/streetPlan';
import { BOARD_GAP, boardCount, lineFill, newArrivals, type Dwell } from '../src/crowd/transportPeek';

/**
 * The transport lane's stop API without its module (no hub loaded in node): a stop is served when its line runs at the
 * fake hour (LineDef.runs), and a car stands where a test puts one.
 */
const fake = vi.hoisted(() => ({ hour: 18.75, day: 3, cars: new Map<string, { vehicle: string; x: number; z: number; left: number }>() }));
vi.mock('../src/transport/module', async () => {
  const { LINES } = await import('../src/transport/lines');
  const served = (key: string) => {
    const l = LINES.find(x => x.id === key.replace(/^stop:/, '').split(':')[0]);
    return !!l && (!l.runs || l.runs(fake.day, fake.hour));
  };
  return { transport: { served, dwellingAt: (key: string) => (served(key) ? fake.cars.get(key.replace(/^stop:/, '')) ?? null : null) } };
});
import { curveAt } from '../src/social/ambient';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';

stubCanvas();
const hubs = new Map<string, HubWorld>();
async function hub(id: 'pikine' | 'plateau' | 'corniche' | 'almadies') {
  if (!hubs.has(id)) { const { buildHub } = await import('../src/world/builder'); hubs.set(id, buildHub(id, true)); }
  return hubs.get(id)!;
}
const inside = (h: HubWorld, x: number, z: number, r = 0.12) => h.colliders.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);

describe('street plan', () => {
  it('rush hours bring the most people, nights the fewest; busy hubs more than quiet ones', () => {
    const at = (h: number, hub: 'pikine' | 'almadies' = 'pikine', q: 'low' | 'medium' | 'high' = 'high') => streetTargets(hub, h, q, 4, 9);
    expect(at(8).walkers).toBeGreaterThan(at(11).walkers);
    expect(at(18.75).walkers).toBeGreaterThan(at(15).walkers);
    expect(at(3).walkers).toBeLessThan(at(8).walkers / 5);
    expect(at(3).perStop).toBe(0);
    expect(at(18.25).perStop).toBeGreaterThan(at(12).perStop);
    expect(at(19).groups).toBeGreaterThan(at(9).groups);
    expect(at(18.75, 'almadies').walkers).toBeLessThan(at(18.75, 'pikine').walkers);
    for (const q of ['low', 'medium', 'high'] as const) for (let h = 0; h < 24; h += 0.5) {
      const t = streetTargets('plateau', h, q, 4, 20);
      expect(t.walkers + t.perStop * 4 + t.groups * 4).toBeLessThanOrEqual(STREET_BUDGET[q].pool + 0.01);
    }
    // the walkers come first: many stops and group spots never squeeze the pavements empty at the evening rush
    for (const q of ['low', 'medium', 'high'] as const) for (const stops of [4, 6, 8]) {
      const t = streetTargets('pikine', 18.75, q, stops, 12, 2), B = STREET_BUDGET[q];
      expect(t.walkers).toBeGreaterThanOrEqual(Math.floor(B.pool * WALKERS_KEEP));
      expect(t.walkers + t.perStop * stops + (t.perStop > 0 ? 4 : 0) + t.groups * 4).toBeLessThanOrEqual(B.pool);
      expect(t.perStop).toBeGreaterThan(0);
    }
    // the checks' evening rush on Pikine's main street: phones (low) and desktops (medium)
    expect(streetTargets('pikine', 18.75, 'low', 4, 9, 1).walkers).toBeGreaterThanOrEqual(10);
    expect(streetTargets('pikine', 18.75, 'low', 4, 9, 1).groups).toBeGreaterThanOrEqual(1);
    expect(streetTargets('pikine', 18.75, 'medium', 4, 9, 1).walkers).toBeGreaterThanOrEqual(30);
    expect(curveAt(WALK_BY_HOUR, 7.75)).toBe(1);
  });

  it('each hub its own street: commuters wait in Pikine, groups chat in the banlieue and at Fann, Almadies stays quiet', () => {
    const t = (hub: 'pikine' | 'plateau' | 'corniche' | 'almadies', h: number) => streetTargets(hub, h, 'high', 4, 9, 1);
    expect(t('pikine', 18.25).perStop).toBeGreaterThan(t('almadies', 18.25).perStop * 2);
    expect(t('pikine', 19).groups).toBeGreaterThan(t('plateau', 19).groups);
    expect(t('corniche', 19).groups).toBeGreaterThan(t('almadies', 19).groups);
    expect(t('almadies', 19).groups).toBeLessThanOrEqual(1);
    // the busy stops get two more people: the pool still holds everyone
    for (const q of ['low', 'medium', 'high'] as const) for (const hub of ['pikine', 'plateau'] as const) for (let h = 0; h < 24; h += 0.5) {
      const x = streetTargets(hub, h, q, 4, 9, 2);
      expect(x.walkers + x.perStop * 4 + (x.perStop > 0 ? 4 : 0) + x.groups * 4).toBeLessThanOrEqual(STREET_BUDGET[q].pool);
    }
  });

  it('Sandaga and the Pikine main street weigh more than the other streets', () => {
    const busy = HUB_STREETS.pikine.busy;
    expect(edgeWeight({ ax: 0, az: -60, bx: 60, bz: -60 }, busy)).toBe(6);
    expect(edgeWeight({ ax: 60, az: -60, bx: 0, bz: -60 }, busy)).toBe(6);
    expect(edgeWeight({ ax: 0, az: 0, bx: 60, bz: 0 }, busy)).toBe(1);
    expect(edgeWeight({ ax: 0, az: 0, bx: 60, bz: 0 }, HUB_STREETS.plateau.busy)).toBe(6);
  });

  it('pavement lanes, stop places and chat rings stay clear of walls and stalls in every hub', async () => {
    const { linesOf } = await import('../src/transport/lines');
    const { placeStops } = await import('../src/transport/stops');
    for (const id of ['pikine', 'plateau', 'corniche', 'almadies'] as const) {
      const h = await hub(id), lanes = pavementLanes(h.edges, h.colliders, HUB_STREETS[id].busy);
      expect(lanes.length).toBeGreaterThan(h.edges.length);
      for (const l of lanes) {
        expect(clearWalk(l.ax, l.az, l.bx, l.bz, h.colliders, 0.3)).toBe(true);
        expect(l.off).toBeLessThan(PAVE.wait - 0.5);                 // walkers keep to the front of the pavement
      }
      for (const site of linesOf(id).flatMap(line => placeStops(line, h.colliders))) {
        const slots = stopSlots(site, h.colliders);
        expect(slots.length).toBeGreaterThan(3);
        for (const p of slots) {
          expect(inside(h, p.x, p.z, 0.25)).toBe(false);
          expect(Math.hypot(p.x - site.x, p.z - site.z)).toBeGreaterThan(2.5);   // the shelter keeps its middle
        }
      }
    }
    expect(ring(0, 0, 4).every(p => Math.abs(Math.hypot(p.x, p.z) - 0.72) < 1e-9)).toBe(true);
  });

  it('the ride-home crowd stands in two rows beside the 23s « Arène » shelter, clear of walls and stalls', async () => {
    const h = await hub('pikine'), site = await eveningArene(h), slots = crowdSlots(site, h.colliders);
    expect(slots.length).toBeGreaterThanOrEqual(12);
    for (const p of slots) {
      expect(inside(h, p.x, p.z, 0.25)).toBe(false);
      expect(Math.hypot(p.x - site.x, p.z - site.z)).toBeGreaterThan(2.5);      // the shelter keeps its middle
      expect(Math.hypot(p.x - site.x, p.z - site.z)).toBeLessThan(10);         // still at the stop
    }
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) expect(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z)).toBeGreaterThan(0.4);
    // an avoided point keeps its 1.1 m
    const a = slots[0], fewer = crowdSlots(site, h.colliders, [a]);
    expect(fewer.every(p => Math.hypot(p.x - a.x, p.z - a.z) >= 1.1)).toBe(true);
  });
});

describe('fans arriving by car rapide on a fight evening', () => {
  it('from the evening route\'s « Arène » stop they walk to the queue\'s tail clear of every wall', async () => {
    const h = await hub('pikine');
    const { LINES, stopOnLeg } = await import('../src/transport/lines');
    const { STOP_OFFSET } = await import('../src/transport/stops');
    const { gateOf } = await import('../src/arena/exteriorRules');
    const g = gateOf(h.arena!), tail = { x: g.x, z: g.queue.z1 - 0.35 }, side = { x: tail.x - 3.7, z: tail.z };
    const line = LINES.find(l => l.id === '23s')!, p = stopOnLeg(line, line.stops.find(s => s.id === 'arene')!);
    const at = { x: p.x - p.dz * (STOP_OFFSET - 0.6), z: p.z + p.dx * (STOP_OFFSET - 0.6) };
    const route = routeClear(at, side, h.colliders);
    expect(route).not.toBeNull();
    const pts = [at, ...route!, tail];
    for (let i = 1; i < pts.length; i++) expect(clearWalk(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, h.colliders, 0.25)).toBe(true);
  });
});

describe('the transport lane\'s stop API, as the crowd reads it', () => {
  const car = (vehicle: string): Dwell => ({ vehicle, x: 0, z: 0, left: 10 });
  it('a car pulling in is a new arrival once; another car at the same stop is one too', () => {
    const a = new Map([['23s:arene', car('v1')]]), b = new Map([['23s:arene', car('v1')], ['23s:gare', car('v2')]]);
    expect(newArrivals(new Map(), a)).toEqual(['23s:arene']);
    expect(newArrivals(a, a)).toEqual([]);
    expect(newArrivals(a, b)).toEqual(['23s:gare']);
    expect(newArrivals(b, new Map([['23s:arene', car('v2')]]))).toEqual(['23s:arene']);
    expect(newArrivals(b, new Map())).toEqual([]);
  });
  it('the evening route is fuller on gala nights; other lines half full', () => {
    expect(lineFill('23s:arene', 4, 21)).toBeGreaterThan(0.6);
    expect(lineFill('5:sandaga', 4, 21)).toBe(0.5);
    expect(lineFill('nope:x', 4, 21)).toBe(0.5);
  });
  it('how many get on: two or three at an ordinary stop, up to the fill for the ride-home crowd, never more than time allows', () => {
    expect(boardCount({ waiting: 6, crowd: false, seats: 14, fill: 0.85, left: 20, r: 0 })).toBe(2);
    expect(boardCount({ waiting: 6, crowd: false, seats: 14, fill: 0.85, left: 20, r: 0.99 })).toBe(3);
    expect(boardCount({ waiting: 1, crowd: false, seats: 14, fill: 0.85, left: 20, r: 0.99 })).toBe(1);
    expect(boardCount({ waiting: 18, crowd: true, seats: 14, fill: 0.85, left: 20, r: 0 })).toBe(12);
    expect(boardCount({ waiting: 18, crowd: true, seats: 14, fill: 0.65, left: 20, r: 0 })).toBe(9);
    expect(boardCount({ waiting: 5, crowd: true, seats: 14, fill: 0.85, left: 20, r: 0 })).toBe(5);
    // a car about to leave: only those who can climb in one after the other (BOARD_GAP apart)
    expect(boardCount({ waiting: 18, crowd: true, seats: 14, fill: 0.85, left: 0.6 + BOARD_GAP * 3, r: 0 })).toBe(4);
    expect(boardCount({ waiting: 18, crowd: true, seats: 14, fill: 0.85, left: 0, r: 0 })).toBe(1);
    expect(boardCount({ waiting: 0, crowd: true, seats: 14, fill: 0.85, left: 20, r: 0 })).toBe(0);
  });
});

/** The evening route's « Arène » stop as the transport lane places it. */
async function eveningArene(h: HubWorld) {
  const { LINES } = await import('../src/transport/lines');
  const { placeStops } = await import('../src/transport/stops');
  return placeStops(LINES.find(l => l.id === '23s')!, h.colliders).find(s => s.def.id === 'arene')!;
}

function fakeCtx(hour: number, at: { x: number; z: number }, quality: 'low' | 'medium' | 'high' = 'high') {
  fake.hour = hour; fake.cars.clear();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  camera.position.set(at.x, 4, at.z + 8); camera.lookAt(at.x, 1, at.z); camera.updateMatrixWorld();
  const extra = new THREE.Group();
  const ctx = {
    quality: () => quality, hour: () => hour, day: () => 3, player: { pos: { x: at.x, y: 0, z: at.z } }, camera, extra,
    places: { all: () => [] }, mode: () => 'play', inside: () => null, state: { data: { counters: {} } },
  };
  return { ctx: ctx as unknown as GameCtx, set: (hr: number) => { hour = hr; fake.hour = hr; } };
}

describe('street life', () => {
  it('fills the Pikine main street at the evening rush: walkers, people waiting at the stops, groups; never inside a wall', async () => {
    const h = await hub('pikine');
    const { StreetLife } = await import('../src/crowd/street');
    const { ctx } = fakeCtx(18.75, { x: -20, z: -66 });
    const s = new StreetLife(ctx, h, null);
    let worst: string | null = null;
    for (let k = 0; k < 1500; k++) {
      s.update(0.1);
      if (k % 10 === 0) for (const a of s.where()) if (inside(h, a.x, a.z)) worst = `${a.id} ${a.role} at ${a.x.toFixed(2)},${a.z.toFixed(2)}`;
    }
    expect(worst).toBeNull();
    const i = s.info();
    expect(i.target.walkers).toBeGreaterThan(20);
    expect(i.roles.walk ?? 0).toBeGreaterThan(i.target.walkers * 0.7);
    expect(i.stops.reduce((n, st) => n + st.waiting, 0)).toBeGreaterThan(8);
    expect(i.groups).toBeGreaterThan(2);
    expect(i.crowd.present).toBeLessThanOrEqual(STREET_BUDGET.high.pool);
    expect(i.drawCalls).toBeLessThanOrEqual(4);
    // the busy street gets more than its share: lanes of the main street hold more walkers than average
    s.dispose();
  });

  it('on a phone at the evening rush, the main street still has people waiting (the evening route\'s Arène stop is a busy one)', async () => {
    // check-street's view: the pavement by the room's block at 18:45, low quality (life within 90 m: one served stop)
    const h = await hub('pikine');
    const { StreetLife } = await import('../src/crowd/street');
    const { ctx } = fakeCtx(18.75, { x: -24, z: -66.2 }, 'low');
    const s = new StreetLife(ctx, h, null);
    for (let k = 0; k < 400; k++) s.update(0.1);
    const i = s.info(), waiting = i.stops.reduce((n, st) => n + st.waiting, 0);
    expect(i.stops.find(st => st.key === '23s:arene')!.busy).toBe(true);
    expect(waiting).toBeGreaterThanOrEqual(4);
    expect(i.target.walkers).toBeGreaterThanOrEqual(10);
    expect(i.groups).toBeGreaterThanOrEqual(1);
    s.dispose();
  });

  it('only the stops served now hold people: Ligne 23 by day, its evening route 23s on fight evenings', async () => {
    const h = await hub('pikine');
    const { StreetLife } = await import('../src/crowd/street');
    for (const [hour, on, off] of [[18.75, '23s:', '23:'], [8, '23:', '23s:']] as const) {
      const { ctx } = fakeCtx(hour, { x: 0, z: -20 });
      const s = new StreetLife(ctx, h, null);
      for (let k = 0; k < 400; k++) s.update(0.1);
      const i = s.info();
      const served = i.stops.filter(st => st.key.startsWith(on)), parked = i.stops.filter(st => st.key.startsWith(off));
      expect(served.length).toBe(4);
      expect(served.every(st => st.served)).toBe(true);
      expect(parked.every(st => !st.served && st.waiting === 0)).toBe(true);
      expect(served.reduce((n, st) => n + st.waiting, 0)).toBeGreaterThan(4);
      // only the evening route's « Arène » stop takes the ride-home crowd
      expect(i.stops.filter(st => st.crowd).map(st => st.key)).toEqual(['23s:arene']);
      s.dispose();
    }
  });

  it('riding home after the gala: a crowd waits at the 23s « Arène » stop and boards each car in turns, up to its fill', async () => {
    const h = await hub('pikine');
    const { StreetLife } = await import('../src/crowd/street');
    const { carRapideSpec } = await import('../src/transport/carRapide');
    const f = fakeCtx(22.5, { x: 6, z: -50 });
    const s = new StreetLife(f.ctx, h, null);
    for (let k = 0; k < 300; k++) s.update(0.1);
    s.leaveNow(40);
    for (let k = 0; k < 900; k++) s.update(0.1);
    const st = s.info().stops.find(x => x.key === '23s:arene')!;
    const perStop = s.info().target.perStop;
    expect(st.crowd && st.served).toBe(true);
    expect(st.waiting).toBeGreaterThan(perStop + 2);                     // more than an ordinary evening stop holds
    // a car pulls in: the front of the crowd climbs in at its rear door, one after the other, up to the car's fill
    const site = (await eveningArene(h)), door = { x: site.x - site.rx * 1.15, z: site.z - site.rz * 1.15 };
    const b0 = s.info().counts.boarded;
    fake.cars.set('23s:arene', { vehicle: 'car-a', x: door.x, z: door.z, left: 25 });
    for (let k = 0; k < 6; k++) s.update(0.1);
    const seats = carRapideSpec().seats.length, n = s.info().counts.boarded - b0;
    expect(n).toBe(Math.min(st.waiting, Math.round(seats * lineFill('23s:arene', fake.day, 22.5))));
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThan(seats);                                       // seats left: the player can squeeze in
    // the same car standing there: nobody else gets on; the next car takes the next ones
    for (let k = 0; k < 40; k++) s.update(0.1);
    expect(s.info().counts.boarded - b0).toBe(n);
    fake.cars.delete('23s:arene');
    for (let k = 0; k < 10; k++) s.update(0.1);
    fake.cars.set('23s:arene', { vehicle: 'car-b', x: door.x, z: door.z, left: 25 });
    for (let k = 0; k < 6; k++) s.update(0.1);
    expect(s.info().counts.boarded - b0).toBeGreaterThan(n);
    s.dispose();
  });

  it('empties at night and the people leaving the arena head for the stop and the streets', async () => {
    const h = await hub('pikine');
    const { StreetLife } = await import('../src/crowd/street');
    const f = fakeCtx(18.5, { x: 30, z: -75 });
    const s = new StreetLife(f.ctx, h, null);
    for (let k = 0; k < 600; k++) s.update(0.1);
    const evening = s.info().crowd.present;
    s.leaveNow(16);
    for (let k = 0; k < 600; k++) s.update(0.1);
    const after = s.info();
    expect(after.counts.left).toBe(16);
    // on fight evenings the day route's « Arène » stop is parked: they wait at the evening route's (23s)
    expect(after.stops.find(st => st.key === '23:arene')!.waiting).toBe(0);
    expect(after.stops.find(st => st.key === '23s:arene')!.waiting).toBeGreaterThan(2);
    f.set(3.5);
    for (let k = 0; k < 4000; k++) s.update(0.1);
    const night = s.info();
    expect(night.target.perStop).toBe(0);
    expect(night.crowd.present).toBeLessThan(evening / 2);
    s.dispose();
  });
});
