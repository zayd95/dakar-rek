import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LineVehicle } from '../src/transport/vehicle';
import { CAR_RAPIDE } from '../src/transport/carRapide';
import { alightPoint } from '../src/transport/module';
import { lanePath, Path, Timetable, newMotion, pullIn, angleDiff, type Pose } from '../src/transport/route';
import { seatToWorld, toWorld } from '../src/transport/spec';
import { TripLogic, MIN_STOP } from '../src/transport/trip';
import { LINES, loopNodes, roadCentre, stopOnLeg, KERB } from '../src/transport/lines';
import { placeStops, STOP_OFFSET } from '../src/transport/stops';
import { anchorToWorld, clearOfWalls } from '../src/transport/camera';
import { HALF, PITCH, ROAD } from '../src/world/builder';

const square = [{ x: -60, z: -60 }, { x: 60, z: -60 }, { x: 60, z: 60 }, { x: -60, z: 60 }];
const MOTION = { vmax: 9, vmin: 3.2, lateral: 2.6, accel: 1.5, decel: 2.2 };

describe('route following', () => {
  const path = new Path(lanePath(square, 2.6, 4.5));

  it('keeps the lane on the right-hand side of every leg (inside the loop, driving on the right)', () => {
    const p: Pose = { x: 0, z: 0, yaw: 0 };
    path.sample(path.project(0, -57.4), p);                    // first leg heads +x, its right side is +z
    expect(p.z).toBeCloseTo(-57.4, 1);
    expect(p.yaw).toBeCloseTo(Math.PI / 2, 5);
    path.sample(path.project(57.4, 0), p);                     // second leg heads +z, its right side is −x
    expect(p.x).toBeCloseTo(57.4, 1);
    expect(p.yaw).toBeCloseTo(0, 5);
    // a closed loop a little shorter than the inner square (rounded corners)
    expect(path.length).toBeGreaterThan(4 * 114.8 - 4 * 4.5);
    expect(path.length).toBeLessThan(4 * 114.8);
  });

  it('samples continuously: no jump in position or heading along the loop', () => {
    const a: Pose = { x: 0, z: 0, yaw: 0 }, b: Pose = { x: 0, z: 0, yaw: 0 };
    for (let s = 0; s < path.length; s += 0.25) {
      path.sample(s, a); path.sample(s + 0.25, b);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.26);
      expect(Math.abs(angleDiff(a.yaw, b.yaw))).toBeLessThan(0.2);
    }
  });

  it('wraps arc lengths and projects points back onto the path', () => {
    const p: Pose = { x: 0, z: 0, yaw: 0 }, q: Pose = { x: 0, z: 0, yaw: 0 };
    path.sample(10, p); path.sample(10 + path.length, q);
    expect(q.x).toBeCloseTo(p.x, 6); expect(q.z).toBeCloseTo(p.z, 6);
    expect(path.project(p.x, p.z)).toBeCloseTo(10, 3);
  });

  it('pulls the vehicle in to the kerb only around a stop', () => {
    const s0 = 100;
    expect(pullIn(path, [s0], s0, 1.1)).toBeCloseTo(1.1, 6);
    expect(pullIn(path, [s0], s0 - 30, 1.1)).toBe(0);
    expect(pullIn(path, [s0], s0 + 30, 1.1)).toBe(0);
    expect(pullIn(path, [s0], s0 - 8, 1.1)).toBeGreaterThan(0);
  });
});

describe('timetable (stops and speeds)', () => {
  const path = new Path(lanePath(square, 2.6, 4.5));
  const stops = [60, 180, 300, 420].map(s => ({ s, dwell: 9 }));
  const table = new Timetable(path, stops, MOTION);

  it('stands still for the dwell at every stop, and never speeds', () => {
    const m = newMotion();
    for (const [i, st] of table.stops.entries()) {
      table.at(st.arrive + 0.5, m);
      expect(m.dwell).toBe(i); expect(m.v).toBe(0); expect(m.dwellLeft).toBeCloseTo(8.5, 5);
      expect(m.s).toBeCloseTo(st.s, 5);
    }
    for (let t = 0; t < table.period; t += 0.37) { table.at(t, m); expect(m.v).toBeLessThanOrEqual(MOTION.vmax + 1e-9); }
  });

  it('is deterministic and periodic: the same time gives the same place', () => {
    const a = newMotion(), b = newMotion();
    table.at(1234.5, a); table.at(1234.5 + table.period * 3, b);
    expect(b.s).toBeCloseTo(a.s, 6); expect(b.dwell).toBe(a.dwell);
  });

  it('moves forward monotonically between stops and slows down in corners', () => {
    const m = newMotion();
    let prev = table.at(0, m).s, travelled = 0, cornerMax = 0;
    for (let t = 0.1; t <= table.period; t += 0.1) {
      table.at(t, m);
      let d = m.s - prev; if (d < -path.length / 2) d += path.length;
      expect(d).toBeGreaterThanOrEqual(-1e-6);
      travelled += d; prev = m.s;
      if (path.curvature(m.s) > 0.1) cornerMax = Math.max(cornerMax, m.v);
    }
    expect(travelled).toBeCloseTo(path.length, 0);
    expect(cornerMax).toBeLessThan(MOTION.vmax * 0.8);
    // arrival order follows the loop, and the period adds up the dwells
    for (let i = 1; i < table.stops.length; i++) expect(table.stops[i].arrive).toBeGreaterThan(table.stops[i - 1].depart);
    expect(table.period).toBeGreaterThan(path.length / MOTION.vmax + 4 * 9);
  });

  it('announces the next stop and its arrival time', () => {
    const m = newMotion(), st = table.stops;
    table.at(st[1].depart + 1, m);
    expect(m.dwell).toBe(-1); expect(m.next).toBe(2);
    expect(m.eta).toBeCloseTo(st[2].arrive - st[1].depart - 1, 5);
    table.at(st[3].arrive + 1, m);                              // standing at the last stop: next is the first, after the wrap
    expect(m.dwell).toBe(3); expect(m.next).toBe(0);
    expect(m.eta).toBeCloseTo(table.period - st[3].arrive - 1, 5);
    expect(table.untilArrival(st[2].arrive + 2, 2)).toBe(0);
    expect(table.untilArrival(st[2].depart + 1, 2)).toBeCloseTo(table.period - (st[2].depart + 1 - st[2].arrive), 5);
  });
});

describe('vehicle seats follow the vehicle', () => {
  it('maps local seats with the same rotation as three.js (front +z, left +x)', () => {
    const v = { x: 10, y: 0.08, z: -5, yaw: Math.PI / 2 };   // heading +x
    const out = { x: 0, z: 0 };
    toWorld(v, 0, 2, out);                                     // 2 m ahead
    expect(out.x).toBeCloseTo(12, 6); expect(out.z).toBeCloseTo(-5, 6);
    toWorld(v, -1, 0, out);                                    // local −x = right-hand side = +z when heading +x
    expect(out.x).toBeCloseTo(10, 6); expect(out.z).toBeCloseTo(-4, 6);
    const seat = { x: 0, z: 0, top: 0, yaw: 0 };
    seatToWorld(v, { id: 'r0c2', x: -0.62, y: 1.15, z: 1.45, yaw: 0 }, seat, 0.02);
    expect(seat.x).toBeCloseTo(11.45, 6); expect(seat.z).toBeCloseTo(-4.38, 6);
    expect(seat.top).toBeCloseTo(1.25, 6); expect(seat.yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it('places the passenger camera anchor behind the vehicle and keeps it out of walls', () => {
    const pos = { x: 0, y: 0, z: 0 }, look = { x: 0, y: 0, z: 0 };
    anchorToWorld({ x: 0, y: 0, z: 0 }, 0, { id: 'd', label: '', pos: [0, 4, -12], look: [0, 1.5, 6] }, 0, pos, look);
    expect(pos).toEqual({ x: 0, y: 4, z: -12 }); expect(look).toEqual({ x: 0, y: 1.5, z: 6 });
    const wall = [{ x0: -5, x1: 5, z0: -9, z1: -8, h: 10 }];
    expect(clearOfWalls({ x: 0, y: 2.6, z: 0 }, pos, wall)).toBeLessThan(0.75);
    expect(clearOfWalls({ x: 0, y: 2.6, z: 0 }, pos, [])).toBe(1);
  });
});

describe('stop logic (wait, board, ride, get off)', () => {
  const moving = (next: number) => ({ ...newMotion(), v: 8, next, eta: 10 });
  const standing = (i: number, left = 6) => ({ ...newMotion(), dwell: i, dwellLeft: left, next: i + 1 });

  it('boards the first vehicle standing at the stop the player waits at, with time left', () => {
    const t = new TripLogic(); t.wait(2);
    expect(t.step([moving(2), standing(1)])).toBeNull();
    expect(t.step([moving(2), standing(2, MIN_STOP - 0.1)])).toBeNull();          // leaving: too late
    expect(t.step([moving(3), standing(2)])).toEqual({ act: 'board', vehicle: 1 });
  });

  it('rides past stops until the player asks, then gets off at the next stop', () => {
    const t = new TripLogic(); t.boarding(0, 1); t.seated();
    expect(t.phase).toBe('riding');
    expect(t.step([standing(1)])).toBeNull();                                      // still at the boarding stop
    expect(t.step([moving(2)])).toBeNull();
    expect(t.step([standing(2)], [[2]])).toBeNull();                               // passes stop 2 (nobody asked)
    expect(t.passed).toBe(1);
    expect(t.step([moving(3)])).toBeNull();
    expect(t.request(moving(3))).toBe(3);                                          // « Descendre au prochain arrêt »
    expect(t.step([moving(3)])).toBeNull();
    expect(t.step([standing(3)])).toEqual({ act: 'alight' });
    expect(t.phase).toBe('alighting');
  });

  it('gets off right away when asked while the vehicle still stands at a stop', () => {
    const t = new TripLogic(); t.boarding(0, 0); t.seated();
    t.step([moving(1)]);
    expect(t.request(standing(1, 5))).toBe(1);
    expect(t.step([standing(1, 4.9)])).toEqual({ act: 'alight' });
    const late = new TripLogic(); late.boarding(0, 0); late.seated();
    expect(late.request({ ...standing(1, 1), next: 2 })).toBe(2);                  // the doors are closing: next stop
  });

  it('never misses a stop when frames are far apart (arrivals between two frames)', () => {
    const w = new TripLogic(); w.wait(2);
    expect(w.step([moving(3)], [[2]])).toEqual({ act: 'board', vehicle: 0 });       // came and went between frames
    const r = new TripLogic(); r.boarding(1, 0); r.seated();
    r.request(moving(1));
    expect(r.step([moving(2), moving(2)], [[], [1]])).toEqual({ act: 'alight' });
    expect(r.passed).toBe(1);
  });

  it('can cancel the request and keep riding', () => {
    const t = new TripLogic(); t.boarding(0, 0); t.seated();
    t.request(moving(1)); t.cancelRequest();
    expect(t.step([standing(1)])).toBeNull();
    expect(t.phase).toBe('riding');
  });
});

describe('lines data', () => {
  it('uses the same road grid as the hub builder', () => {
    expect(roadCentre(0)).toBe(-HALF + ROAD / 2);
    expect(roadCentre(1) - roadCentre(0)).toBe(PITCH);
    expect(KERB).toBe(ROAD / 2 - 2);
  });

  it('gives every hub a loop with named stops on the pavement side, away from the crossroads', () => {
    for (const hub of ['plateau', 'corniche', 'almadies', 'pikine']) expect(LINES.some(l => l.hub === hub)).toBe(true);
    for (const line of LINES) {
      expect(new Set(line.stops.map(s => s.id)).size).toBe(line.stops.length);
      expect(line.fare).toBeGreaterThanOrEqual(100); expect(line.fare).toBeLessThanOrEqual(500);
      const nodes = loopNodes(line);
      for (const st of line.stops) {
        const p = stopOnLeg(line, st);
        for (const n of nodes) expect(Math.hypot(p.x - n.x, p.z - n.z)).toBeGreaterThan(20);
      }
      const sites = placeStops(line, []);
      for (const s of sites) {
        // on the right of the leg, on the pavement (kerb → kerb + 2 m)
        const leg = stopOnLeg(line, s.def), off = (s.x - leg.x) * s.rx + (s.z - leg.z) * s.rz;
        expect(off).toBeCloseTo(STOP_OFFSET, 6); expect(off).toBeGreaterThan(KERB); expect(off).toBeLessThan(KERB + 2);
        expect(s.seats).toHaveLength(2);
      }
    }
  });

  it('slides a stop along the kerb when something stands on its spot', () => {
    const line = LINES[0], st = line.stops[0], leg = stopOnLeg(line, st);
    const x = leg.x - leg.dz * STOP_OFFSET, z = leg.z + leg.dx * STOP_OFFSET;
    const [site] = placeStops({ ...line, stops: [st] }, [{ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, h: 2 }]);
    expect(Math.hypot(site.x - x, site.z - z)).toBeGreaterThanOrEqual(2);
  });

  it('lands people getting off on the pavement, between the kerb and the shelter', () => {
    for (const line of LINES) for (const s of placeStops(line, [])) {
      const p = alightPoint(s), leg = stopOnLeg(line, s.def), off = (p.x - leg.x) * s.rx + (p.z - leg.z) * s.rz;
      expect(off).toBeGreaterThan(KERB + 0.3); expect(off).toBeLessThan(STOP_OFFSET);
    }
  });
});

describe('line vehicle (timetable → vehicle, seats, arrivals)', () => {
  const spec = { ...CAR_RAPIDE, build: () => new THREE.Group() };
  const path = new Path(lanePath(square, 2.6, 4.5));
  const table = new Timetable(path, [60, 180, 300, 420].map(s => ({ s, dwell: 9 })), MOTION);

  it('moves its seats with it and keeps them locked, in the vehicle space', () => {
    const v = new LineVehicle(spec, 'pikine', '23', 0, table, table.stops.map(s => s.s), 1, () => 0.5);
    v.update(table.stops[1].arrive + 2, 0.016, false);
    expect(v.id).toBe('pikine:rapide:23:0');
    const seat = v.seats[0], local = spec.seats[0];
    expect(seat.space).toBe(v.id); expect(seat.kind).toBe('vehicle'); expect(seat.locked).toBe(true);
    const out = { x: 0, z: 0, top: 0, yaw: 0 };
    seatToWorld(v.pose, local, out, v.bounce);
    expect(seat.x).toBeCloseTo(out.x, 6); expect(seat.z).toBeCloseTo(out.z, 6); expect(seat.yaw).toBeCloseTo(v.pose.yaw, 6);
    expect(v.vehicle.driverSeat.id).toBe('pikine:rapide:23:0:chauffeur');
    // standing at a stop: pulled in towards the kerb (right of the lane)
    const lane: Pose = { x: 0, z: 0, yaw: 0 }; path.sample(v.motion.s, lane);
    const right = (v.pose.x - lane.x) * -Math.cos(lane.yaw) + (v.pose.z - lane.z) * Math.sin(lane.yaw);
    expect(right).toBeCloseTo(1.1, 1);
  });

  it('reports every stop reached since the previous frame, even on a very long frame', () => {
    const v = new LineVehicle(spec, 'pikine', '23', 0, table, table.stops.map(s => s.s), 1, () => 0.5);
    const arrived: number[] = []; v.onArrive = i => arrived.push(i);
    v.update(table.stops[0].depart + 1, 0.016, false);
    expect(v.arrivals).toEqual([]);
    v.update(table.stops[2].arrive + 0.5, 0.1, false);                    // one frame spanning two arrivals
    expect([...v.arrivals].sort()).toEqual([1, 2]); expect(arrived.sort()).toEqual([1, 2]);
    v.update(table.stops[2].arrive + 0.6, 0.1, false);
    expect(v.arrivals).toEqual([]);
  });
});
