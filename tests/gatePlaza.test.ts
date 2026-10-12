import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';
import {
  drummerAt, footprintInPlaza, gateOf, gatePlaza, inPlaza, outflowDestinations, plazaClosure, plazaFootprints, queueDistance, stallsOf, streetEnds,
} from '../src/arena/exteriorRules';
import { motoLot } from '../src/arena/arrivalRules';
import { KERB, linesOf, roadCentre } from '../src/transport/lines';
import { Route } from '../src/city/galaRules';
import * as G from '../src/city/galaRules';
import { routeClear } from '../src/crowd/streetPlan';
import { cabRoutes } from '../src/crowd/arrivals';
import { hits } from '../src/transport/drive';

/**
 * The arena gate's pedestrian zone (src/arena/exteriorRules.ts gatePlaza) on the real Pikine hub: every car rapide of
 * Ligne 23 (by day) and 23s (the fight evenings: the arrivals, the gala, the crowd leaving), every other vehicle flow
 * round the arena, keeps out of it — the barriers, the queue, the stalls, the drummers, the gate — and the « Arène »
 * stops stay a short walk from the gate.
 */
stubCanvas();
const hub = (await import('../src/world/builder')).buildHub('pikine', true) as HubWorld;
const { linePlan, transport } = await import('../src/transport/module');
const { LineVehicle } = await import('../src/transport/vehicle');
const { carRapideSpec } = await import('../src/transport/carRapide');
const { streetFlowLane } = await import('../src/city/arena');
const { carSpec } = await import('../src/transport/car');
const { motoSpec } = await import('../src/transport/moto');
const a = hub.arena!, g = gateOf(a), plaza = gatePlaza(a), spec = { ...carRapideSpec(), build: () => new THREE.Group() };
const RAPIDE = { hl: spec.length / 2, hw: spec.width / 2 }, TAXI = { hl: 2.15, hw: 0.85 }, CAR = { hl: 2.6, hw: 0.97 }, MOTO = { hl: 0.98, hw: 0.42 };
type Size = { hl: number; hw: number };
/** Corners of a footprint. */
const corners = (x: number, z: number, yaw: number, s: Size) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([u, v]) =>
  ({ x: x + Math.sin(yaw) * s.hl * u + Math.cos(yaw) * s.hw * v, z: z + Math.cos(yaw) * s.hl * u - Math.sin(yaw) * s.hw * v }));
/** Every car of a line over a whole loop of its timetable (its stops' dwells included), at `step` s. */
function loop(lineId: string, step = 0.2) {
  const def = linesOf('pikine').find(l => l.id === lineId)!, plan = linePlan(def, hub.colliders, spec.doors[0]);
  const v = new LineVehicle(spec, 'pikine', def.id, 0, plan.table, plan.table.stops.map(s => s.s), 1, () => 0.5);
  const out: { x: number; z: number; yaw: number; dwell: boolean }[] = [];
  for (let t = 0; t < plan.table.period; t += step) { v.update(t, step, false); out.push({ x: v.pose.x, z: v.pose.z, yaw: v.pose.yaw, dwell: v.motion.dwell >= 0 }); }
  return { def, plan, out };
}
/** A route's footprints every 0.4 m. */
function along(pts: { x: number; z: number }[], s: Size, open = true) {
  const r = open ? new Route(pts) : null, P = { x: 0, z: 0, yaw: 0 }, out: { x: number; z: number; yaw: number }[] = [];
  if (r) for (let d = 0; d < r.length; d += 0.4) { r.sample(d, P); out.push({ ...P }); }
  return out.map(p => ({ ...p, ...s }));
}

describe('the gate’s pedestrian zone', () => {
  it('covers the queue and its barriers, the stalls, the drummers, the flags and the gate; not the guarded moto places', () => {
    const q = g.queue;
    for (const [x, z] of [[q.x - q.half, q.z0], [q.x + q.half, q.z1], [q.x, (q.z0 + q.z1) / 2]]) expect(inPlaza(plaza, x, z)).toBe(true);
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) for (const dz of [-1.05, 1.05]) expect(inPlaza(plaza, a.cx + sx * 2.6, g.z - 2.5 - k * 2.2 + dz)).toBe(true);   // world/builder.ts barriers
    for (const s of stallsOf(a)) for (const [dx, dz] of [[-0.85, -0.5], [0.85, 0.5]]) expect(inPlaza(plaza, s.x + dx, s.z + dz)).toBe(true);
    for (let k = 0; k < 3; k++) { const d = drummerAt(g, k); expect(inPlaza(plaza, d.x, d.z)).toBe(true); }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) expect(inPlaza(plaza, a.cx + sx * (6.2 + k * 2.2), g.z - 1.6)).toBe(true);    // the flags
    expect(inPlaza(plaza, g.x, g.z - 0.5)).toBe(true);
    for (const s of motoLot(a).slots) expect(inPlaza(plaza, s.x, s.z)).toBe(false);
  });
  it('Ligne 23 and 23s never drive or stop in it nor near the queue: by day, as the fans arrive, at the gala’s peak, as the crowd leaves', () => {
    const moments = { day: 10, arrivals: 17.5, gala: 20.5, leaving: 23.2 };
    const loops = new Map(['23', '23s'].map(id => [id, loop(id)]));
    for (const [, hour] of Object.entries(moments)) {
      const running = [...loops.values()].filter(l => l.def.runs?.(5, hour) ?? true);
      expect(running.length).toBe(1);                                                             // one route at a time
      if (hour !== moments.day) expect(running[0].def.id).toBe('23s');
      for (const l of running) {
        let stops = 0;
        for (const p of l.out) {
          expect(footprintInPlaza(plaza, { ...p, ...RAPIDE })).toBe(false);
          for (const c of corners(p.x, p.z, p.yaw, RAPIDE)) expect(queueDistance(g, c.x, c.z)).toBeGreaterThan(8);
          if (p.dwell) stops++;
        }
        expect(stops).toBeGreaterThan(10);                                                        // the stops' dwells are in the samples
      }
    }
    // the day route too when a player rides it on into the evening (a trip ends on the line it began)
    for (const p of loops.get('23')!.out) expect(footprintInPlaza(plaza, { ...p, ...RAPIDE })).toBe(false);
  });
  it('both « Arène » stops are a short walk from the gate, on a way clear of walls; the fans get off there and walk to the queue', () => {
    for (const id of ['23', '23s']) {
      const { plan } = loop(id, 1), site = plan.sites.find(s => s.def.id === 'arene')!;
      expect(inPlaza(plaza, site.x, site.z, 3)).toBe(false);
      const way = routeClear({ x: g.x, z: g.queue.z0 - 0.5 }, { x: site.x - site.rx * 0.6, z: site.z - site.rz * 0.6 }, hub.colliders);
      expect(way).not.toBeNull();
      let len = 0, p = { x: g.x, z: g.queue.z0 - 0.5 };
      for (const q of way!) { len += Math.hypot(q.x - p.x, q.z - p.z); p = q; }
      expect(len).toBeLessThan(60);
      // the arrivals' walk from the stop to the queue's tail (src/crowd/arrivals.ts walkFrom)
      const tail = { x: g.x, z: g.queue.z1 - 0.35 }, side = { x: tail.x - 3.7, z: tail.z };
      expect(routeClear({ x: site.x - site.rx * 0.6, z: site.z - site.rz * 0.6 }, side, hub.colliders)).not.toBeNull();
    }
  });
  it('every other flow keeps out too: the street flows, the arrivals’ taxis, the gala road’s jam, moto-taxis and rank', () => {
    const geo = G.galaGeo(a);
    const flows = [
      ...along(streetFlowLane(), TAXI),
      ...cabRoutes(g).flatMap(r => along([{ x: r.x, z: r.z0 }, { x: r.x, z: r.z1 }], TAXI)),
      ...along(G.motoRoute(geo).pts, MOTO),
      ...geo.columns.flatMap(z => (['in', 'out'] as const).flatMap(d => [...along(G.releaseRoute(geo, d, z, geo.front + 3), CAR), ...along(G.feedRoute(geo, d, z, geo.front + 12), CAR)])),
      ...geo.rank.flatMap((_, k) => along(G.rankRoute(geo, k).pts, TAXI)),
    ];
    expect(flows.length).toBeGreaterThan(2000);
    for (const f of flows) expect(footprintInPlaza(plaza, f)).toBe(false);
  });
  it('the decorative traffic never takes the street through it, at any hour; on every other street it keeps out', () => {
    const shut = plazaClosure(plaza);
    const closed = hub.edges.filter(e => shut(e.ax, e.az, e.bx, e.bz));
    expect(closed.map(e => [e.ax, e.az, e.bx, e.bz].map(Math.round))).toEqual([[roadCentre(2), roadCentre(1), roadCentre(3), roadCentre(1)]]);
    for (const e of hub.edges.filter(x => !shut(x.ax, x.az, x.bx, x.bz))) for (const [ax, az, bx, bz] of [[e.ax, e.az, e.bx, e.bz], [e.bx, e.bz, e.ax, e.az]]) {
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, yaw = Math.atan2(dx, dz);
      for (const lane of [2.5, 2.6, 3.0]) for (let t = 0; t <= len; t += 1) expect(footprintInPlaza(plaza, { x: ax + dx * t - dz * lane, z: az + dz * t + dx * lane, yaw, ...RAPIDE })).toBe(false);
    }
  });
  it('the fans come from and go to the pavement corners at the street’s ends: never in a junction where Ligne 23 turns', () => {
    const ends = streetEnds(g), lines = ['23', '23s'].map(id => loop(id, 0.5).out);
    for (const e of ends) {
      expect(Math.abs(e.x - roadCentre(2)) > KERB && Math.abs(e.x - roadCentre(3)) > KERB).toBe(true);   // off both cross streets' carriageways
      expect(Math.abs(Math.abs(e.z - roadCentre(1)) - 6)).toBeLessThan(0.01);                     // on a pavement of the street
      for (const l of lines) for (const p of l) expect(Math.hypot(p.x - e.x, p.z - e.z)).toBeGreaterThan(4);
    }
    expect(outflowDestinations(g).slice(0, 4)).toEqual(ends);
  });
  it('drive mode: the player’s car stops at it; their moto may still reach its guarded place beside it', async () => {
    const { arenaExteriorModule } = await import('../src/arena/exterior');
    const { trafficClosures } = await import('../src/actors/npc');
    const ctx = {
      quality: () => 'low', hour: () => 10, day: () => 3, now: () => 0, extra: new THREE.Group(), camera: new THREE.PerspectiveCamera(), inside: () => null,
      player: { pos: new THREE.Vector3() }, state: { data: { counters: {} } }, places: { all: () => [], add() {}, remove() {} },
    } as unknown as GameCtx;
    arenaExteriorModule.init!(ctx);
    arenaExteriorModule.hubLoaded!(ctx, hub);
    const out: { x: number; z: number; yaw: number; hl: number; hw: number }[] = [];
    transport.obstacles(out, 'sedan');
    expect(out).toEqual(expect.arrayContaining(plazaFootprints(plaza)));
    transport.obstacles(out, 'moto');
    expect(out.length).toBe(0);
    // a car on the street, heading for the gate, stops short of it; the moto rides on to its place
    const boxes = plazaFootprints(plaza), blocked = (x: number, z: number, r: number) => boxes.some(o => Math.abs(x - o.x) < o.hw + r && Math.abs(z - o.z) < o.hl + r);
    expect(hits(carSpec().drive!, a.cx, roadCentre(1), Math.PI / 2, blocked)).toBe(true);
    expect(hits(carSpec().drive!, a.cx + 20, roadCentre(1), Math.PI / 2, blocked)).toBe(false);
    expect(hits(motoSpec().drive!, motoLot(a).slots[0].x, motoLot(a).slots[0].z, 0, blocked)).toBe(false);
    // the decorative traffic's closure stands by day (no queue yet), not only on fight evenings
    expect([...trafficClosures.more].some(f => f(roadCentre(2), roadCentre(1), roadCentre(3), roadCentre(1)))).toBe(true);
    arenaExteriorModule.hubLoaded!(ctx, { ...hub, arena: null } as HubWorld);                    // another hub: gone
    expect([...trafficClosures.more].some(f => f(roadCentre(2), roadCentre(1), roadCentre(3), roadCentre(1)))).toBe(false);
    transport.obstacles(out, 'sedan'); expect(out.length).toBe(0);
  });
});
