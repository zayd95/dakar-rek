import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';
import * as G from '../src/city/galaRules';
import { driveStep, hits, newDriveState } from '../src/transport/drive';
import { motoSpec } from '../src/transport/moto';
import { carSpec } from '../src/transport/car';
import { carRapideKit } from '../src/transport/carRapide';
import { vehicleSpec } from '../src/actors/vehicleKit';
import { busyEdges } from '../src/city/roadEvents';
import { gateOf, queueDistance, stallsOf, drummerAt } from '../src/arena/exteriorRules';
import { motoLot, inLot } from '../src/arena/arrivalRules';
import { CROSSING, PAVE } from '../src/crowd/streetPlan';
import { SIZE_SHARE } from '../src/city/rules';

stubCanvas();
const A = { cx: 30, cz: -30 };                      // the Pikine arena (world/builder.ts block 2,1)
const geo = G.galaGeo(A), gate = gateOf(A), j = geo.junction;
const SEED = G.galaSeed('pikine', 5);
const QUALITIES: G.Quality[] = ['low', 'medium', 'high'];
const moto = motoSpec().drive!, car = carSpec().drive!;
type Box = { x: number; z: number; yaw: number; hl: number; hw: number };
/** Drive mode's box test (src/transport/ownedModule.ts blocked) against these footprints. */
const blockedBy = (boxes: readonly Box[]) => (x: number, z: number, r: number) => boxes.some(o => {
  const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return Math.abs(dx * c - dz * s) < o.hw + r && Math.abs(dx * s + dz * c) < o.hl + r;
});
/** Ride straight through at full throttle from east of the jam (heading west): how far it gets. */
function ride(d: typeof moto, z: number, boxes: readonly Box[], fromX: number) {
  const st = newDriveState(fromX, z, -Math.PI / 2), blocked = blockedBy(boxes);
  for (let k = 0; k < 30 * 30 && st.x > geo.front - 3; k++) driveStep(st, { throttle: 1, steer: 0 }, d, 1 / 30, blocked);
  return st.x;
}
/** A timeline of an evening (shared seconds from a day start at 0), advanced in steps. */
function evening(dir: G.RoadDir, size: 'gala' | 'card', q: G.Quality, since: number, seed = SEED) {
  const hourAt = (s: number) => s / G.HOUR_S;
  return new G.JamTimeline(geo, dir, seed, q, since, s => G.jamDepth(G.jamLevel(hourAt(s), size, seed, dir === 'out') * (dir === 'out' ? Math.min(1, Math.max(0, (s - since) / 25)) : 1), q, size));
}

describe('the gala road: its schedule and its scale', () => {
  it('is the same evening for everyone, another one each day and hub', () => {
    expect(G.galaSeed('pikine', 5)).toBe(G.galaSeed('pikine', 5.7));
    expect(G.galaSeed('pikine', 6)).not.toBe(SEED);
    expect(G.galaSeed('plateau', 5)).not.toBe(SEED);
    expect(G.jamWindow('gala', SEED)).toEqual(G.jamWindow('gala', SEED));
  });
  it('thickens from the doors: a thin queue from just before 17 h, the jam in its window, nothing outside the evening', () => {
    for (let d = 1; d < 40; d++) {
      const s = G.galaSeed('pikine', d), [from, to] = G.jamWindow('gala', s), [cf, ct] = G.jamWindow('card', s);
      expect(from).toBeGreaterThanOrEqual(17.6); expect(from).toBeLessThanOrEqual(18.1);
      expect(to - from).toBeGreaterThanOrEqual(1.2); expect(to - from).toBeLessThanOrEqual(1.7);
      expect(cf).toBeGreaterThan(from); expect(ct - cf).toBeLessThan(0.91);                    // a card's comes later, shorter
      expect(G.jamLevel((from + to) / 2, 'gala', s, false)).toBeCloseTo(1);
    }
    expect(G.jamLevel(12, 'gala', SEED, false)).toBe(0); expect(G.jamLevel(16.5, 'gala', SEED, false)).toBe(0);
    expect(G.jamLevel(17.05, 'gala', SEED, false)).toBeCloseTo(G.THIN); expect(G.jamLevel(20.6, 'gala', SEED, false)).toBeCloseTo(G.THIN);
    expect(G.jamLevel(22.2, 'gala', SEED, false)).toBe(0); expect(G.jamLevel(1, 'gala', SEED, true)).toBe(0);
    for (const q of QUALITIES) expect(G.jamDepth(G.THIN, q, 'gala')).toBe(1);                // one car or so a column at the agent
    expect(G.agentOn(16.5)).toBe(false); expect(G.agentOn(16.8)).toBe(true); expect(G.agentOn(23.9)).toBe(true); expect(G.agentOn(0.5)).toBe(false);
  });
  it('a weekday card is about 40 % of a gala: the jam, the moto-taxis, the rank, the step, the horns', () => {
    expect(SIZE_SHARE.card).toBe(0.4);
    for (const q of QUALITIES) {
      const g = G.jamDepth(1, q, 'gala'), c = G.jamDepth(1, q, 'card');
      expect(g).toBe(G.JAM_DEPTH[q]); expect(c).toBe(Math.max(1, Math.round(g * 0.4)));
      expect(G.maxFlows(q, 'card')).toBe(Math.max(1, Math.round(G.maxFlows(q, 'gala') * 0.4)));
      expect(G.rankTaxis(q, 'card')).toBeLessThan(G.rankTaxis(q, 'gala') + (q === 'high' ? 0 : 1));
      expect(G.stepRiders('card', q)).toBeLessThan(G.stepRiders('gala', q));
      expect(G.motoEvery(q, 'card')).toBeGreaterThan(G.motoEvery(q, 'gala'));
    }
    expect([G.JAM_DEPTH.high, G.jamDepth(1, 'high', 'card')]).toEqual([5, 2]);
    let gala = 0, card = 0;
    for (let s = 0; s < 20000; s++) { if (G.hornAt(s, SEED, 'gala', 10, 1) >= 0) gala++; if (G.hornAt(s, SEED, 'card', 4, 1) >= 0) card++; }
    expect(card / gala).toBeGreaterThan(0.3); expect(card / gala).toBeLessThan(0.5);
    expect(gala / 20000).toBeGreaterThan(0.24); expect(gala / 20000).toBeLessThan(0.34);   // a horn every 3–4 s at a gala's jam
  });
  it('after the result the flow turns round: everyone leaves at once, fewer until midnight', () => {
    expect(G.jamLevel(21.5, 'gala', SEED, true)).toBeCloseTo(0.7);                         // the gala seen early: the outflow at once
    expect(G.jamLevel(22.4, 'gala', SEED, true)).toBeCloseTo(1);
    expect(G.jamLevel(23.3, 'gala', SEED, true)).toBeCloseTo(0.6);
    expect(G.jamLevel(23.95, 'gala', SEED, true)).toBe(0);
  });
});

describe('the junction: the agent', () => {
  it('lets the gate’s side go for 16 s, then the jam for 10 s, the same rhythm for everyone', () => {
    let gate = 0, jam = 0, changes = 0, last = '';
    for (let k = 0; k < 2600; k++) {
      const p = G.agentPhase(1000 + k * 0.1, SEED);
      if (p.go === 'gate') gate++; else jam++;
      if (last && p.go !== last) changes++;
      last = p.go;
      expect(p).toEqual(G.agentPhase(1000 + k * 0.1, SEED));
      expect(p.left).toBeGreaterThan(0); expect(p.left).toBeLessThanOrEqual(p.go === 'gate' ? 16 : 10);
    }
    expect(gate / (gate + jam)).toBeCloseTo(16 / 26, 1);
    expect(changes).toBeGreaterThanOrEqual(19); expect(changes).toBeLessThanOrEqual(21);
  });
  it('lets the front cars through only while the jam goes: three a column a cycle, the last one 3 s before the gate’s side', () => {
    for (let c = 0; c < 3; c++) {
      const r = G.releaseTimes(c, SEED, 5000, 5000 + 26 * 10);
      expect(r.length).toBe(30);
      for (const t of r) {
        const u = G.cycleTime(t, SEED);
        expect(u).toBeGreaterThanOrEqual(G.AGENT_CYCLE.gate); expect(u).toBeLessThanOrEqual(G.AGENT_CYCLE.period - 3);
        expect(G.agentPhase(t, SEED).go).toBe('jam');
      }
      expect(G.releaseTimes(c, SEED, 5000, 5130)).toEqual(r.filter(t => t <= 5130));             // the same times, however asked
    }
    // after the bouts the parking's cars come up into the jam only as the jam's side starts to go
    for (let t = 0; t < 260; t += 0.5) if (G.feedOpen(t, SEED)) expect(G.agentPhase(t, SEED).go).toBe('jam');
  });
  it('stands in the middle of the junction, clear of every lane', () => {
    expect(geo.agent).toEqual(j);
    const P: G.Pt & { yaw: number } = { x: 0, z: 0, yaw: 0 };
    const clear = (pts: G.Pt[], half: number) => {
      const r = new G.Route(pts);
      for (let s = 0; s < r.length; s += 0.25) { r.sample(s, P); expect(Math.hypot(P.x - j.x, P.z - j.z) - half).toBeGreaterThan(0.6); }
    };
    clear(G.motoRoute(geo).pts, 0.42);
    for (const z of geo.columns) { clear(G.releaseRoute(geo, 'in', z, geo.front + 2.5), 0.97); clear(G.feedRoute(geo, 'out', z, geo.front + 8), 0.97); }
    for (let s = 0; s < geo.rank.length; s++) clear(G.rankRoute(geo, s).pts, 0.85);
  });
});

describe('the jam: a moto filters through, a car does not', () => {
  it('fills the carriageway kerb to kerb, leaves the pavements to the walkers and the crossing clear', () => {
    for (const q of QUALITIES) for (const dir of ['in', 'out'] as const) {
      const cars = G.jamLayout(geo, G.JAM_DEPTH[q], dir, SEED, q);
      expect(cars.length).toBe(3 * G.JAM_DEPTH[q]);
      for (const c of cars) {
        expect(Math.abs(c.z - j.z) + c.hw).toBeLessThanOrEqual(PAVE.walk - 0.32 - 0.05);         // never on the walkers' line
        expect(c.x - c.hl).toBeGreaterThan(j.x + CROSSING + 0.3);                                 // nor on the crossing
        expect(c.x + c.hl).toBeLessThan(j.x + 60 - CROSSING);                                     // nor the next one
      }
    }
  });
  it('leaves two gaps a moto fits through and none for a car, whatever the cars side by side', () => {
    for (const wide of [G.LOOK_OF('suv').w, G.LOOK_OF('taxi').w]) {                                // the widest and the narrowest
      const cars = geo.columns.map(z => ({ z, hw: wide / 2 }));
      const lanes = G.filterLanes(cars, geo.corridor, moto.halfWidth);
      expect(lanes.length).toBe(2);
      expect(lanes[0]).toBeCloseTo(geo.gapIn); expect(lanes[1]).toBeCloseTo(geo.gapOut);
      expect(G.filterLanes(cars, geo.corridor, car.halfWidth)).toEqual([]);
    }
    expect(moto.halfWidth).toBeCloseTo(0.42); expect(car.halfWidth).toBeCloseTo(0.89);
  });
  it('drive mode: the moto rides straight through either gap, the car stops at the tail on every line', () => {
    for (const q of QUALITIES) {
      const cars = G.jamLayout(geo, G.JAM_DEPTH[q], 'in', SEED, q), tail = Math.max(...cars.map(c => c.x + c.hl));
      for (const z of [geo.gapIn, geo.gapOut]) {
        for (let x = geo.front - 2; x < tail + 2; x += 0.2) expect(hits(moto, x, z, -Math.PI / 2, blockedBy(cars))).toBe(false);
        expect(ride(moto, z, cars, tail + 6)).toBeLessThanOrEqual(geo.front - 3);
      }
      for (let z = geo.corridor[0] + 0.5; z <= geo.corridor[1] - 0.5; z += 0.1) expect(ride(car, z, cars, tail + 6)).toBeGreaterThan(tail);
    }
  });
});

describe('the jam over the evening', () => {
  it('is the same whatever the frames: every device that reaches a time sees the same cars', () => {
    const a = evening('in', 'gala', 'high', 17.7 * 60), b = evening('in', 'gala', 'high', 17.7 * 60);
    const end = 18.4 * 60;
    for (let t = 17.7 * 60; t <= end; t += 1 / 30) a.advance(t);
    let t = 17.7 * 60, k = 0;
    while (t < end) { t = Math.min(end, t + [0.4, 2.7, 0.01, 7.3, 1][k++ % 5]); b.advance(t); }
    a.advance(end); b.advance(end);
    const round = (cars: G.JamNow[]) => cars.map(c => [c.col, c.n, c.kind, c.state, Math.round(c.x * 1000), Math.round(c.z * 1000)].join(':'));
    expect(round(b.at(end))).toEqual(round(a.at(end)));
    expect(a.at(end).length).toBeGreaterThan(10);
  });
  it('arriving: fills to its depth in its window and drains after; no car runs into another, nor the agent; the front ones go round to the north', () => {
    const tl = evening('in', 'gala', 'high', 16.7 * 60), [from, to] = G.jamWindow('gala', SEED);
    let peak = 0, after = 0, released = 0;
    for (let t = 16.7 * 60; t < 21 * 60; t += 0.25) {
      tl.advance(t);
      const cars = tl.at(t), h = t / 60;
      const q = [0, 1, 2].map(c => tl.queue(c, t).length);
      if (h > from + 0.3 && h < to - 0.3) peak = Math.max(peak, Math.min(...q));
      if (h > to + 0.4) after = Math.max(after, ...q);
      for (let c = 0; c < 3; c++) {
        const col = cars.filter(x => x.col === c && x.state !== 'away' && Math.abs(x.z - geo.columns[c]) < 1e-6).sort((p, r) => p.x - r.x);
        for (let i = 1; i < col.length; i++) expect(col[i].x - col[i - 1].x).toBeGreaterThan(col[i].hl + col[i - 1].hl - 0.05);
      }
      for (const x of cars) {
        expect(Math.hypot(x.x - j.x, x.z - j.z)).toBeGreaterThan(1.2);
        if (x.state === 'queue') expect(x.yaw).toBeCloseTo(-Math.PI / 2);
        if (x.state === 'away') {
          released++;
          expect(x.x).toBeGreaterThan(j.x + 1);                                                    // never into the gate road
          expect(x.z).toBeLessThanOrEqual(geo.columns[x.col] + 1e-6);                              // round to the north
        }
      }
    }
    expect(peak).toBe(G.JAM_DEPTH.high);
    expect(after).toBeLessThanOrEqual(1);
    expect(released).toBeGreaterThan(100);
  });
  it('a weekday card’s jam is about 40 % of a gala’s', () => {
    const peak = (size: 'gala' | 'card') => {
      const tl = evening('in', size, 'high', 16.7 * 60); let n = 0;
      for (let t = 16.7 * 60; t < 20 * 60; t += 0.5) { tl.advance(t); n = Math.max(n, tl.at(t).filter(c => c.state === 'queue').length); }
      return n;
    };
    const g = peak('gala'), c = peak('card');
    expect(g).toBe(15); expect(c).toBe(6);
  });
  it('leaving: faces east, fed from the parking along the arena, let through to the east', () => {
    const since = 22.4 * 60, tl = evening('out', 'gala', 'medium', since);
    let fed = 0, away = 0, standing = 0;
    for (let t = since; t < 23.5 * 60; t += 0.25) {
      tl.advance(t);
      for (const c of tl.at(t)) {
        if (c.state === 'queue') { standing++; expect(c.yaw).toBeCloseTo(Math.PI / 2); expect(c.x).toBeGreaterThan(geo.front); }
        if (c.state === 'away') { away++; expect(c.x).toBeGreaterThan(geo.front + 10); expect(c.z).toBeCloseTo(geo.columns[c.col]); }
        if (c.state === 'come' && c.x < geo.front) { fed++; expect(c.z).toBeGreaterThan(geo.columns[c.col] - 1e-6); }   // up from the south
      }
    }
    expect(standing).toBeGreaterThan(500); expect(away).toBeGreaterThan(100); expect(fed).toBeGreaterThan(50);
  });
});

describe('the moto-taxis and the rank taxis', () => {
  const mr = G.motoRoute(geo), route = new G.Route(mr.pts), stops = { holdS: route.at[mr.hold], dropS: route.at[mr.drop], waitS: route.at[mr.wait] };
  const trip = (i: number, dir: G.RoadDir, size: 'gala' | 'card' = 'gala', q: G.Quality = 'high') =>
    G.motoTrip(i, { ...stops, seed: SEED, every: G.motoEvery(q, size), route, hourAt: () => (dir === 'in' ? 18.8 : 22.6), dirAt: () => dir, size });
  it('ride in through the north gap, wait while the jam goes, drop the fan off and go back through the south gap', () => {
    const P = { x: 0, z: 0, yaw: 0 };
    let n = 0;
    for (let i = 1000; i < 1200; i++) {
      const m = trip(i, 'in'); if (!m) continue;
      n++;
      expect(G.agentPhase(m.holdOut + 0.01, SEED).go).toBe('gate'); expect(G.agentPhase(m.waitOut + 0.01, SEED).go).toBe('gate');
      expect(m.holdIn).toBeLessThanOrEqual(m.holdOut); expect(m.dropOut - m.dropIn).toBeCloseTo(G.MOTO.dwell);
      expect(G.motoHandover(m)).toBeGreaterThan(m.dropIn); expect(G.motoHandover(m)).toBeLessThan(m.dropOut);
      expect(G.motoPillion(m, m.dropIn - 0.1)).toBe(true); expect(G.motoPillion(m, m.dropOut)).toBe(false);
      let last = -1;
      for (let t = m.start; t <= m.end; t += 0.2) {
        const s = G.motoS(m, t, stops)!;
        expect(s).toBeGreaterThanOrEqual(last - 1e-6); last = s;
        route.sample(s, P);
        if (P.x > geo.front - 1) expect(Math.min(Math.abs(P.z - geo.gapIn), Math.abs(P.z - geo.gapOut))).toBeLessThan(0.05);   // through the jam: in a gap
      }
    }
    expect(n).toBeGreaterThan(150);                                                              // at the rush nearly every place of the lattice rides
    const out = [...Array(20).keys()].map(k => trip(1000 + k, 'out')).find(Boolean)!;
    expect(G.motoPillion(out, out.dropIn)).toBe(false); expect(G.motoPillion(out, out.dropOut + 1)).toBe(true);   // leaving: a fan gets on
    expect(out.dropOut - out.dropIn).toBeCloseTo(G.MOTO.pickup);                                // and it waits for one to walk up
  });
  it('about as many at once as the quality allows, fewer on a card', () => {
    const atOnce = (q: G.Quality, size: 'gala' | 'card') => {
      let max = 0, sum = 0, k = 0;
      for (let t = 30000; t < 31800; t += 2) {
        const every = G.motoEvery(q, size);
        let n = 0;
        for (let i = Math.floor((t - 90) / every) - 1; i <= Math.floor(t / every) + 1; i++) {
          const m = G.motoTrip(i, { ...stops, seed: SEED, every, route, hourAt: () => 18.8, dirAt: () => 'in', size });
          if (m && G.motoS(m, t, stops) !== null) n++;
        }
        max = Math.max(max, n); sum += n; k++;
      }
      return { max, mean: sum / k };
    };
    for (const q of QUALITIES) {
      const g = atOnce(q, 'gala'), c = atOnce(q, 'card');
      expect(g.max).toBeLessThanOrEqual(2 * G.GALA_FLOWS[q]);
      expect(g.mean).toBeGreaterThan(G.GALA_FLOWS[q] * 0.6); expect(g.mean).toBeLessThan(G.GALA_FLOWS[q] * 1.4);
      expect(c.mean / g.mean).toBeGreaterThan(0.25); expect(c.mean / g.mean).toBeLessThan(0.6);
    }
  });
  it('keep off the queue lane, the stalls, the drummers, the moto parking’s rows; the fans’ walks end at the queue’s tail', () => {
    const P = { x: 0, z: 0, yaw: 0 }, lot = motoLot(A);
    for (let s = 0; s < route.length; s += 0.25) {
      route.sample(s, P);
      expect(queueDistance(gate, P.x, P.z)).toBeGreaterThan(1.5);
      for (const st of stallsOf(A)) expect(Math.hypot(P.x - st.x, P.z - st.z)).toBeGreaterThan(1.8);
      for (let k = 0; k < 3; k++) { const d = drummerAt(gate, k); expect(Math.hypot(P.x - d.x, P.z - d.z)).toBeGreaterThan(1.5); }
      expect(inLot(lot, P.x, P.z)).toBe(false);
    }
    expect(G.walkToQueue(geo).at(-1)).toEqual(geo.queueTail);
    expect(G.walkToMoto(geo).at(-1)).toEqual(geo.motoStep);
  });
  it('the rank: taxis at the corner’s kerb after the bouts, leaving south as the jam’s side goes (never across the moto-taxis)', () => {
    for (let slot = 0; slot < geo.rank.length; slot++) {
      const rr = G.rankRoute(geo, slot), r = new G.Route(rr.pts), stopS = r.at[rr.stop];
      expect(geo.rank[slot].x).toBeCloseTo(j.x - 4.3);
      let n = 0;
      for (let k = 0; k < 40; k++) {
        const v = G.rankVisit(slot, 100 + k, { seed: SEED, route: r, stopS, leaving: () => true }); if (!v) continue;
        n++;
        expect(v.leave - v.arrive).toBeGreaterThanOrEqual(G.TAXI.wait);
        const u = G.cycleTime(v.leave, SEED);
        expect(u).toBeGreaterThanOrEqual(G.AGENT_CYCLE.gate); expect(u).toBeLessThan(G.AGENT_CYCLE.gate + 1);
        expect(G.rankS(v, (v.arrive + v.leave) / 2, stopS, r.length)).toBeCloseTo(stopS);
      }
      expect(n).toBe(40);
      expect(G.rankVisit(slot, 100, { seed: SEED, route: r, stopS, leaving: () => false })).toBeNull();   // none before the outflow
      expect(G.walkToRank(geo, slot).every(p => queueDistance(gate, p.x, p.z) > 0.5)).toBe(true);
    }
  });
});

describe('fans on the step, the looks, the roads', () => {
  it('fans stand on the car rapide’s rear step beside the apprenti, within the car’s width', () => {
    const k = carRapideKit(), step = k.step!.riding;
    for (let i = 0; i < 2; i++) {
      const p = G.stepSpot(step, i);
      expect(Math.abs(p.x)).toBeLessThan(k.width / 2);
      expect(Math.hypot(p.x - step.x, p.z - step.z)).toBeGreaterThan(0.45);
      expect(p.y).toBe(step.y);
    }
    expect(Math.hypot(G.stepSpot(step, 0).x - G.stepSpot(step, 1).x, G.stepSpot(step, 0).z - G.stepSpot(step, 1).z)).toBeGreaterThan(0.45);
  });
  it('the jam’s looks are the vehicle kit’s cars, at the kit’s sizes', () => {
    for (const l of G.JAM_LOOKS) {
      const s = vehicleSpec(l.kind, { seed: 2, driver: true, passengers: false });
      expect(s.length).toBeCloseTo(l.l, 2); expect(s.width).toBeCloseTo(l.w, 2);
    }
    for (const q of QUALITIES) expect(G.JAM_LOOKS.slice(0, G.JAM_LOOK_COUNT[q]).map(l => l.kind)).toContain('taxi');
  });
  it('road events keep off the gala’s roads', () => {
    const busy = busyEdges({ id: 'pikine', spawn: { x: 10, z: 10, yaw: 0 } });
    const key = (a: G.Pt, b: G.Pt) => { const p = `${Math.round(a.x)},${Math.round(a.z)}`, q = `${Math.round(b.x)},${Math.round(b.z)}`; return p < q ? `${p}|${q}` : `${q}|${p}`; };
    for (const [a, b] of G.galaRoads(geo)) expect(busy.has(key(a, b))).toBe(true);
  });
});

describe('the gala road on the Pikine hub', () => {
  it('its routes hit no wall; drawn in a few instanced meshes; solid for drive mode; turns round after the bouts; off when quiet', async () => {
    const { buildHub } = await import('../src/world/builder');
    const { galaTrafficModule } = await import('../src/city/galaTraffic');
    const { transport } = await import('../src/transport/module');
    const hub = buildHub('pikine', true) as HubWorld;
    // every route clear of the hub's walls (by the vehicle's half width)
    const P = { x: 0, z: 0, yaw: 0 }, inWall = (x: number, z: number, r: number) => hub.colliders.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);
    const clear = (pts: G.Pt[], r: number) => { const rt = new G.Route(pts); for (let s = 0; s < rt.length; s += 0.5) { rt.sample(s, P); if (Math.abs(P.x) < 128 && Math.abs(P.z) < 128) expect(inWall(P.x, P.z, r)).toBe(false); } };
    clear(G.motoRoute(geo).pts, 0.4);
    for (const z of geo.columns) for (const dir of ['in', 'out'] as const) { clear(G.releaseRoute(geo, dir, z, geo.front + 3), 0.9); clear(G.feedRoute(geo, dir, z, geo.front + 12), 0.9); }
    for (let s = 0; s < 3; s++) clear(G.rankRoute(geo, s).pts, 0.85);

    for (const quality of ['low', 'high'] as const) {
      let ms = 1.7e12;
      const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 700); camera.position.set(j.x + 20, 6, j.z - 14); camera.updateMatrixWorld();
      const ctx = { quality: () => quality, hour: () => 18.6, day: () => 5, now: () => ms, scene: new THREE.Scene(), extra: new THREE.Group(), camera, inside: () => null,
        player: { pos: new THREE.Vector3(j.x + 30, 0, j.z) }, state: { data: { counters: {} } } } as unknown as GameCtx;
      galaTrafficModule.hubLoaded!(ctx, hub);
      const api = (galaTrafficModule.debug!(ctx) as { gala: { info(): any; force(d?: G.RoadDir | null): void; size(s: 'gala' | 'card' | null): void; probe(k: 'moto' | 'car', z: number): any } }).gala;
      api.force('in'); api.size('gala');
      const run = (sec: number) => { for (let k = 0; k < sec * 30; k++) { ms += 1000 / 30; galaTrafficModule.update!(ctx, 1 / 30); } };
      run(40);
      let i = api.info();
      expect(i.dir).toBe('in'); expect(i.draw).toBe(true);
      expect(i.jam.standing).toBeGreaterThanOrEqual(3 * G.JAM_DEPTH[quality] - 3);
      expect(i.lanes.moto.length).toBe(2); expect(i.lanes.car).toEqual([]);
      // instanced: two meshes a car look in use, one a moto look, nothing else drawn
      expect(i.drawCalls).toBeLessThanOrEqual(2 * G.JAM_LOOK_COUNT[quality] + 2);
      const group = ctx.extra.children.find(c => c.name === 'gala_traffic')!;
      let meshes = 0, lamps = 0;
      group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) meshes++; if (o.userData.vehicleSpec && o.visible) lamps++; });
      expect(meshes).toBe(i.drawCalls);
      expect(lamps).toBe(i.jam.cars + i.motos.length);                                           // one light proxy a vehicle shown (src/city/night.ts)
      // drive mode stops at the jam: through the live footprints, a moto passes in a gap, a car does not
      const obst: Box[] = []; transport.obstacles(obst);
      expect(obst.length).toBeGreaterThan(5);
      expect(api.probe('moto', geo.gapIn).passed).toBe(true); expect(api.probe('moto', geo.gapOut).passed).toBe(true);
      for (const z of [geo.columns[0], geo.gapIn, j.z, geo.gapOut, geo.columns[2]]) expect(api.probe('car', z).passed).toBe(false);
      // a weekday card: smaller
      api.size('card'); run(60);
      i = api.info();
      expect(i.jam.columns.every((n: number) => n <= G.jamDepth(1, quality, 'card'))).toBe(true);
      // after the bouts: the jam faces east, taxis at the rank
      api.size('gala'); api.force('out'); run(70);
      i = api.info();
      expect(i.dir).toBe('out'); expect(i.jam.faces).toBeCloseTo(Math.PI / 2);
      expect(i.rank.length).toBeGreaterThan(0);
      // quiet: nothing drawn, the roads open again
      api.force(null); run(2);
      i = api.info();
      expect(i.jam.cars).toBe(0); expect(i.drawCalls).toBe(0); expect(i.closed).toBe(false);
      expect(api.probe('car', j.z).passed).toBe(true);                                           // the road itself is open: it was the jam
      galaTrafficModule.hubLoaded!(ctx, { ...hub, arena: null } as HubWorld);                    // another hub: gone, its obstacles too
      transport.obstacles(obst); expect(obst.length).toBe(0);
    }
  });
});
