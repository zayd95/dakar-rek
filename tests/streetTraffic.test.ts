import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { buildHub } from '../src/world/builder';
import { crossings, kerb, kerbSpots, STOP_LANE, type KerbSpot } from '../src/crowd/streetLink';
import { rng } from '../src/core/rng';

stubCanvas();

/** The decorative traffic's two manners with people: it stops for those crossing the road, and a taxi pulls in at a kerb spot, waits, and drives on. */
async function setup() {
  const { DecorativeTraffic } = await import('../src/actors/npc');
  const hub = buildHub('plateau', true);
  const tr = new DecorativeTraffic(hub, rng(7), 6);
  const cars = (tr as unknown as { cars: { g: { position: { x: number; z: number } }; ax: number; az: number; bx: number; bz: number; t: number; kind: string; speed: number; spot: KerbSpot | null; phase: number; prev: string }[]; pickSpot(c: unknown): void }).cars;
  const e = hub.edges.find(x => Math.hypot(x.bx - x.ax, x.bz - x.az) > 50)!;
  const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
  return { tr, cars, e, len, c: cars[0] };
}

describe('traffic and people', () => {
  it('a car slows and stops for a walker crossing in front of it, and drives on once they are across', async () => {
    const { tr, e, len, c } = await setup();
    kerbSpots.length = 0;
    c.ax = e.ax; c.az = e.az; c.bx = e.bx; c.bz = e.bz; c.t = 0.1; c.kind = 'sedan'; c.speed = 7; c.spot = null; c.phase = 0;
    const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
    const at = (s: number, lat: number) => ({ x: e.ax + dx * s - dz * lat, z: e.az + dz * s + dx * lat });
    tr.update(0.05);
    const w = crossings[0], p = at(len * 0.1 + 24, 2.5);
    w.on = true; w.x = p.x; w.z = p.z;
    let closest = 1e9;
    for (let k = 0; k < 400; k++) { tr.update(0.05); const q = c.g.position; closest = Math.min(closest, Math.hypot(q.x - w.x, q.z - w.z)); }
    expect(closest).toBeGreaterThan(2);                                // it never reached them
    expect(Math.hypot(c.g.position.x - w.x, c.g.position.z - w.z)).toBeLessThan(6);   // and it waited close behind
    w.on = false;
    const x0 = c.g.position.x, z0 = c.g.position.z;
    for (let k = 0; k < 60; k++) tr.update(0.05);
    expect(Math.hypot(c.g.position.x - x0, c.g.position.z - z0)).toBeGreaterThan(3);   // on its way again
  });

  it('a taxi pulls in to the kerb spot where someone waits, stands while they climb in, and leaves', async () => {
    const { tr, e, len, c } = await setup();
    kerbSpots.length = 0;
    const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len, s = len * 0.6;
    const spot: KerbSpot = { ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, s, x: e.ax + dx * s - dz * STOP_LANE, z: e.az + dz * s + dx * STOP_LANE, px: -dz, pz: dx, long: false,
      waiting: 1, want: 1, claimed: false, halted: false, cx: 0, cz: 0, fresh: false, cool: 0 };
    kerbSpots.push(spot);
    c.ax = e.ax; c.az = e.az; c.bx = e.bx; c.bz = e.bz; c.t = 0.02; c.kind = 'taxi'; c.speed = 6;
    for (let k = 0; k < 40 && !c.spot; k++) (tr as unknown as { pickSpot(c: unknown): void }).pickSpot(c);
    expect(c.spot).toBe(spot);
    let halted = 0, laneAtStop = 0;
    for (let k = 0; k < 1200; k++) {
      tr.update(0.05);
      if (spot.halted) { halted++; const q = c.g.position; laneAtStop = Math.hypot(q.x - spot.x, q.z - spot.z); }
      if (spot.halted && halted === 60) spot.waiting = 0;            // the passenger is in
    }
    expect(halted).toBeGreaterThan(60);                                // it stood there a while
    expect(laneAtStop).toBeLessThan(1.5);                              // at the kerb spot
    expect(spot.fresh).toBe(true);                                     // and let the street crowd know it had stopped
    expect(spot.claimed).toBe(false);                                  // then it drove on
    expect(spot.cool).toBeGreaterThan(kerb.clock - 100);
  });
});
