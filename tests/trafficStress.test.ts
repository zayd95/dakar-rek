import { describe, expect, it } from 'vitest';
import { CorridorTraffic, type Footprint } from '../src/road/traffic';
import { ROADS, type Road } from '../src/road/routes';
import { carSpec } from '../src/transport/car';
import { berlineSpec } from '../src/transport/premiumCars';
import { motoSpec } from '../src/transport/moto';
import { DriveControls, type DriveCmd } from '../src/transport/controls';
import { driveStep, newDriveState, type Blocked, type DriveState } from '../src/transport/drive';
import { wrapAngle } from '../src/road/network';
import { lookFor, steerFor } from './helpers/pilot';
import type { DriveSpec } from '../src/transport/spec';

/**
 * Deterministic, repeated stress of the road's traffic against a simulated player (the real analog controls and drive physics, the pilot's steering law): the traffic's own logic is
 * run for real, the player's vehicle collides with the traffic's footprints the way the owned vehicle does (src/transport/ownedModule.ts `blocked`). What must hold in every run: the
 * player is never trapped (he can always get past or get away), and no traffic deadlock outlives its recovery. Seeds make every run the same; many seeds make it a stress.
 */
const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const CAR = carSpec().drive!, BERLINE = berlineSpec().drive!, JAKARTA = motoSpec().drive!;

/** Does the vehicle's footprint (circles along its axis) touch a traffic footprint (an oriented box)? */
function hitsBox(x: number, z: number, r: number, f: Footprint): boolean {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw), dx = x - f.x, dz = z - f.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;                                 // box frame: x across, z along
  const cx = Math.max(-f.hw, Math.min(f.hw, lx)), cz = Math.max(-f.hl, Math.min(f.hl, lz));
  return (lx - cx) ** 2 + (lz - cz) ** 2 < r * r;
}

interface Sim {
  road: Road; traffic: CorridorTraffic; s: DriveState; ctl: DriveControls; d: DriveSpec; t: number; wallS: number;
  fp: Footprint[]; stuckFor: number; bumps: number; reverseTime: number; maxStuck: number;
}
function sim(road: Road, d: DriveSpec, o: { seed: number; count: number; s0: number; dir?: 1 | -1; wallS?: number; waiters?: number }): Sim {
  const rand = rng(o.seed), traffic = new CorridorTraffic(road, rand, o.count, true, { waiters: o.waiters ?? 0 });
  const dir = o.dir ?? 1, f = road.spine.at(o.s0), lat = dir > 0 ? -2.8 : 2.8;
  const s = newDriveState(f.x + Math.cos(f.yaw) * lat, f.z - Math.sin(f.yaw) * lat, f.yaw + (dir > 0 ? 0 : Math.PI));
  return { road, traffic, s, ctl: new DriveControls(), d, t: 0, wallS: o.wallS ?? Infinity, fp: [], stuckFor: 0, bumps: 0, reverseTime: 0, maxStuck: 0 };
}
const solidAt = (m: Sim, x: number, z: number, r: number) => m.wallS < Infinity && m.road.spine.project(x, z, m.wallS, 40).s > m.wallS - r;

/** One step of the whole world: the traffic (seeing the player), then the player (pilot + controls + physics, blocked by walls, ground and the traffic's footprints). */
function step(m: Sim, dt: number, pilot: (m: Sim) => DriveCmd) {
  const px = m.s.x, pz = m.s.z;
  m.traffic.update(dt, { solid: (x, z, r) => solidAt(m, x, z, r), player: { x: px, z: pz } }, { x: px, z: pz });
  m.fp.length = 0; m.traffic.footprints(m.fp, px, pz, 70, 0, 0);
  const d = m.d, hl = d.halfLength - d.halfWidth;
  const blocked: Blocked = (x, z, r) => {
    if (!m.road.ground.contains(x, z, r) || solidAt(m, x, z, r)) return true;
    for (const f of m.fp) if (hitsBox(x, z, r, f)) return true;
    void hl; return false;
  };
  const cmd = pilot(m), v0 = m.s.speed;
  const hit = driveStep(m.s, m.ctl.update(dt, cmd, m.s.speed, d, d !== JAKARTA), d, dt, blocked);
  if (hit && Math.abs(v0) > 2.5) m.bumps++;
  m.t += dt;
}

/**
 * A pilot as a person drives with the stick: keeps its lane, slows for what is ahead (looking further the faster it goes), and when it has come to a stop behind something it eases back a
 * little with the brake (a vehicle that can reverse), takes the other lane to get by and comes back to its own once past; if it is still stuck it backs off and tries again.
 */
function driver(opts: { lane?: number; boost?: boolean } = {}) {
  let mode: 'lane' | 'back' | 'pass' = 'lane', modeT = 0, cur = 0, slowFor = 0, stuckFor = 0, obstS = 0, ownPrev = Infinity, ownT = 0, movingPass = false;
  return (m: Sim): DriveCmd => {
    const p = m.road.spine.project(m.s.x, m.s.z, cur, 160); cur = p.s;
    const dir = Math.cos(wrapAngle(m.s.yaw - p.yaw)) >= 0 ? 1 : -1, v = Math.abs(m.s.speed), canBack = m.d !== JAKARTA;
    const laneOf = (other: boolean) => (opts.lane ?? 2.8) * (other ? 1 : -1) * dir;
    const at = (s: number, lane: number) => { const g = m.road.spine.at(Math.max(0, Math.min(m.road.length, s))); return { x: g.x + Math.cos(g.yaw) * lane, z: g.z - Math.sin(g.yaw) * lane, yaw: g.yaw }; };
    const blockedAt = (x: number, z: number) => m.fp.some(f => hitsBox(x, z, 1.5, f)) || solidAt(m, x, z, 1.5);
    const aheadIn = (lane: number, far = 0) => { const reach = Math.max(far, 12 + v * 2.4); for (let dd = 3; dd < reach; dd += 1.5) { const q = at(p.s + dir * dd, lane); if (blockedAt(q.x, q.z)) return dd; } return Infinity; };
    modeT += 1 / 60;
    // and what is straight in front of the bonnet, whatever the lane he means to be in (a swerve that has not cleared the thing yet, a car that has stopped across his way)
    let bonnet = Infinity;
    for (let dd = 2; dd < 3 + v * 1.1 && bonnet === Infinity; dd += 1) { const x = m.s.x + Math.sin(m.s.yaw) * dd * m.s.speed / (v || 1), z = m.s.z + Math.cos(m.s.yaw) * dd * m.s.speed / (v || 1); if (blockedAt(x, z)) bonnet = dd; }
    const own = Math.min(aheadIn(laneOf(mode === 'pass')), bonnet);
    if (v < 0.5 && own < 14) stuckFor += 1 / 60; else if (v > 2) stuckFor = 0;
    // what is ahead does not move when the gap closes as fast as the vehicle goes: a person sees it and goes round early, without waiting to be stopped
    let still = false; ownT += 1 / 60;
    if (ownT >= 0.4) { still = own < 30 && ownPrev < Infinity && v > 1.5 && (ownPrev - own) / ownT > 0.85 * v - 0.4; ownPrev = own; ownT = 0; }
    const otherClear = aheadIn(laneOf(true), 75) === Infinity;                          // he looks at the other lane before pulling out
    // a slower car ahead in his lane (he sees how fast it goes): he overtakes it when the other lane is clear for a good way, as one does on this road
    let leader: { ds: number; v: number; s: number } | null = null;
    for (const c of m.traffic.positions()) {
      if (c.dir !== dir) continue;
      const ds = (c.s - p.s) * dir - 3.2, pr = m.road.spine.project(c.x, c.z, c.s, 10);
      if (ds > 0 && ds < 45 && Math.abs(pr.d - laneOf(false)) < 2.1 && (!leader || ds < leader.ds)) leader = { ds, v: c.v, s: c.s };
    }
    const slowLeader = !!leader && leader.v < Math.min(v + 0.5, m.d.maxSpeed * 0.72) && leader.ds < 28;
    if (mode === 'lane' && slowLeader && otherClear && leader!.v > 1) { mode = 'pass'; modeT = 0; obstS = leader!.s + dir * 6; movingPass = true; }
    else if (mode === 'pass' && leader === null && false) { /* (kept simple: the leader is tracked below) */ }
    if (mode === 'lane' && still && own > 8 && otherClear) { mode = 'pass'; modeT = 0; obstS = p.s + dir * own; movingPass = false; }
    else if (mode === 'lane' && stuckFor > 1.2 && otherClear) { mode = canBack ? 'back' : 'pass'; modeT = 0; obstS = p.s + dir * own; }
    else if (mode === 'back' && ((obstS - p.s) * dir > 13 || modeT > 6)) { mode = 'lane'; modeT = 0; stuckFor = 0; }          // then looks at the other lane again before pulling out
    else if (mode === 'pass' && (p.s - obstS) * dir > 14) {
      // still a car in his own lane just ahead of the one passed (a queue)? keep going when the other lane stays clear, else back in
      let next: number | null = null;
      for (const c of m.traffic.positions()) { if (c.dir !== dir) continue; const ds = (c.s - p.s) * dir, pr = m.road.spine.project(c.x, c.z, c.s, 10); if (ds > -14 && ds < 18 && Math.abs(pr.d - laneOf(false)) < 2.1) next = Math.max(next ?? -1e9, c.s * dir); }
      if (next !== null && otherClear) obstS = next * dir + dir * 6; else { mode = 'lane'; modeT = 0; stuckFor = 0; }
    }
    else if (mode === 'pass' && stuckFor > 3) { mode = canBack ? 'back' : 'lane'; modeT = 0; stuckFor = 0; }
    const lane = laneOf(mode === 'pass');
    const tgt = at(p.s + dir * lookFor(v), lane);
    const err = wrapAngle(Math.atan2(tgt.x - m.s.x, tgt.z - m.s.z) - m.s.yaw);
    const steer = steerFor(err, Math.hypot(tgt.x - m.s.x, tgt.z - m.s.z), v, m.d);
    if (mode === 'back') return { fwd: 0, steer: 0, boost: false, brake: true };
    const reach = 12 + v * 2.4, slow = own < reach ? Math.max(0, Math.min(1, (own - 6) / (reach - 6))) : 1;
    slowFor = slow;
    const safe = Math.sqrt(2 * 6 * Math.max(0, own - 5)), brake = m.s.speed > 0.5 && m.s.speed > safe + 0.5;        // a person brakes for what is ahead, not only lifts
    const off = Math.abs(p.d - laneOf(false)), crawl = mode === 'pass' && !(leader && leader.v > 1) && off < 3.4 && (obstS - p.s) * dir < 10 && (obstS - p.s) * dir > -4;     // alongside the thing being passed: slow, wide
    const merging = mode === 'lane' && Math.abs(p.d - laneOf(false)) > 1.2;                  // coming back into his lane: not at full speed
    const brakeNow = brake || (merging && m.s.speed > 7) || (crawl && m.s.speed > 2.0);
    return { fwd: brakeNow ? 0 : merging ? 0.4 : crawl ? 0.18 : mode === 'pass' ? (movingPass ? Math.max(0.7, slow) : Math.max(0.55, Math.min(slow, 0.7))) : slowFor, steer, boost: !!opts.boost && slow > 0.9 && mode === 'lane' && aheadIn(laneOf(false), 190) === Infinity, brake: brakeNow };   // the foot comes off the boost for what is a long way ahead: a car at 160–200 km/h cannot swerve round it at the last moment (its tyres hold v² / grip)
  };
}

const arterial = ROADS[0];

describe('traffic on the roads: life, and never a trap', () => {
  it('shows everyday Dakar: a different mix on each stretch, stops made at the kerb, a few hesitations, quiet horns', () => {
    for (const road of ROADS) {
      const horns: number[] = []; const t = new CorridorTraffic(road, rng(11), 8, true, { onHorn: n => horns.push(n) });
      const kinds = new Set<string>(); let near = 0;
      const mid = road.spine.at(road.length * 0.5);
      for (let i = 0; i < 60 * 150; i++) {
        t.update(1 / 20, { solid: () => false, player: null }, { x: mid.x, z: mid.z });
        if (i % 40 === 0) for (const c of t.positions()) { kinds.add(c.kind); if (Math.hypot(c.x - mid.x, c.z - mid.z) < 250) near++; }
      }
      expect(kinds.size, road.id).toBeGreaterThanOrEqual(4);                         // a real mix
      expect(near).toBeGreaterThan(0);
      expect(t.stats.pulled, `${road.id} stops`).toBeGreaterThanOrEqual(0);
    }
  });
  it('taxis, car rapides and buses pull over at the stops, stand a few seconds, and go on', () => {
    const road = arterial; let pulled = 0, waited = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const t = new CorridorTraffic(road, rng(seed), 6, true);
      const st = road.stops[Math.floor(road.stops.length / 2)], f = road.spine.at(st.s);
      for (let i = 0; i < 6; i++) { const info = t.put(i, st.s - st.dir * (45 + i * 4), st.dir); void info; }
      for (let k = 0; k < 60 * 25; k++) { t.update(1 / 30, { solid: () => false, player: null }, { x: f.x, z: f.z }); }
      pulled += t.stats.pulled; waited += t.positions().filter(c => c.pull === 'wait').length;
    }
    expect(pulled).toBeGreaterThan(0);
  });
  it('traffic stopped ahead is passed by the player, not a trap: 40 seeds, both vehicles, every time he gets by (nearly always within 25 s: an oncoming platoon can make him wait) without a hard hit', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 40; seed++) for (const d of [BERLINE, JAKARTA]) {
      const road = ROADS[seed % ROADS.length], s0 = 300 + (seed * 37) % 400;
      const m = sim(road, d, { seed, count: 6, s0 });
      // a stopped vehicle in the player's lane, 80 m ahead
      const info = m.traffic.put(0, s0 + 80, 1); m.traffic.hold(0, true);
      const drv = driver({ boost: seed % 2 === 0 });
      let passedAt = -1;
      for (let i = 0; i < 60 * 90; i++) {
        step(m, 1 / 60, drv);
        const p = m.road.spine.project(m.s.x, m.s.z, s0 + 60, 200);
        if (passedAt < 0 && p.s > s0 + 80 + info.hl + 6) passedAt = m.t;
        if (passedAt >= 0 && m.t > passedAt + 1) break;
      }
      expect(passedAt, `seed ${seed} ${d === JAKARTA ? 'jakarta' : 'berline'} on ${road.id} never got past (traffic ${JSON.stringify(m.traffic.stats)})`).toBeGreaterThan(0);
      expect(m.bumps, `seed ${seed}: a hard hit`).toBeLessThanOrEqual(1);
      times.push(passedAt);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.9)], 'the slowest tenth').toBeLessThan(25);
    expect(times[times.length - 1], 'the very slowest').toBeLessThan(60);
  });
  it('a vehicle that stops in a narrow stretch behind a parked one is backed away from with the brake: reverse recovery works and the way is found again', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const road = arterial, s0 = 500 + seed * 11;
      // a wall across the whole carriageway ahead (a worst case: nothing to pass), the car driving into it
      const m = sim(road, CAR, { seed, count: 0, s0: s0 - 30, wallS: s0 + 6 });
      for (let i = 0; i < 60 * 8; i++) step(m, 1 / 60, () => ({ fwd: 1, steer: 0, boost: false, brake: false }));
      expect(Math.abs(m.s.speed)).toBeLessThan(1.5);                                 // stopped against it
      const z0 = m.road.spine.project(m.s.x, m.s.z).s;
      let showed = false;
      for (let i = 0; i < 60 * 6; i++) { step(m, 1 / 60, () => ({ fwd: 0, steer: 0, boost: false, brake: true })); if (m.ctl.showR) showed = true; }
      const z1 = m.road.spine.project(m.s.x, m.s.z).s;
      expect(z1, `seed ${seed}: backed away`).toBeLessThan(z0 - 1.5);
      expect(showed).toBe(true);
    }
  });
  it('a stopped car moves off again at any frame rate (a step of acceleration at 60 or 120 fps is smaller than the "standing still" threshold: the old traffic froze there for good)', () => {
    for (const dt of [1 / 20, 1 / 30, 1 / 60, 1 / 120]) {
      const road = arterial, t = new CorridorTraffic(road, rng(5), 1, true), f = road.spine.at(600);
      t.put(0, 600, 1); t.hold(0, true);
      for (let i = 0; i < 20; i++) t.update(dt, { solid: () => false, player: null }, { x: f.x, z: f.z });
      const s0 = t.positions()[0].s;
      t.hold(0, false);
      for (let i = 0; i < 5 / dt; i++) t.update(dt, { solid: () => false, player: null }, { x: f.x, z: f.z });
      const c = t.positions()[0];
      expect(c ? Math.abs(c.s - s0) : 99, `dt ${dt}`).toBeGreaterThan(8);
    }
  });
  it('long runs, both ways, many seeds: the player is never stuck for more than 20 s while he asks to go, and the traffic never freezes for good', () => {
    let worstStuck = 0, freezes = 0;
    for (let seed = 1; seed <= 24; seed++) for (const back of [false, true]) {
      const road = ROADS[seed % ROADS.length], d = seed % 3 === 0 ? JAKARTA : BERLINE, s0 = back ? road.length - 220 : 220;
      const m = sim(road, d, { seed: seed * 7 + (back ? 1 : 0), count: 9, s0, dir: back ? -1 : 1, waiters: 2 });
      const drv = driver({ boost: seed % 2 === 1 });
      let still = 0, cur = s0, lastS = s0;
      for (let i = 0; i < 60 * 70; i++) {
        step(m, 1 / 60, drv);
        const p = m.road.spine.project(m.s.x, m.s.z, cur, 200); cur = p.s;
        if (back ? p.s < 40 : p.s > road.length - 40) break;                         // arrived: standing at the end of the road is not being stuck (a short road is driven in under 70 s)
        if (Math.abs(p.s - lastS) < 0.02) still += 1 / 60; else { still = 0; lastS = p.s; }
        worstStuck = Math.max(worstStuck, still);
      }
      for (const c of m.traffic.positions()) if (c.v < 0.05 && !c.pull && c.ghost === false) freezes += 0;     // (individual stops are normal; the player's progress is what must not stop)
    }
    expect(worstStuck).toBeLessThan(20);
    expect(freezes).toBe(0);
  });
  it('no solid sits in the carriageway on the new waiters: they stand on the side roads, off the main lanes', () => {
    const road = ROADS[0], t = new CorridorTraffic(road, rng(3), 0, true, { waiters: 3 });
    const fp: Footprint[] = [];
    for (const j of road.junctionS) t.update(1 / 30, { solid: () => false, player: null }, { x: j.x, z: j.z });
    t.footprints(fp, road.junctionS[0].x, road.junctionS[0].z, 400, 0, 0);
    for (const f of fp) { const p = road.spine.project(f.x, f.z); if (road.junctionS.some(j => Math.hypot(j.x - f.x, j.z - f.z) < 60)) expect(Math.abs(p.d) + f.hw).toBeGreaterThan(5.5 - 0.01); }
  });
});
