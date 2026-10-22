import { describe, expect, it } from 'vitest';
import { HUB_IDS, type HubId } from '../src/core/types';
import { GRID, roadCentre } from '../src/transport/lines';
import { STOP_RADIUS, VTC_POINTS, atStop, stopOf, tripOf, vtcFare, vtcRequests } from '../src/transport/vtcRules';

const roads = Array.from({ length: GRID.nb + 1 }, (_, k) => roadCentre(k));
const onKerb = (x: number, z: number) => roads.some(r => Math.abs(Math.abs(x - r) - 4.3) < 0.01) || roads.some(r => Math.abs(Math.abs(z - r) - 4.3) < 0.01);

describe('VTC: where passengers wait (src/transport/vtcRules.ts)', () => {
  it('every district has named places; the car stops in a kerb lane and the passenger waits on the pavement beside it, further from the road', () => {
    for (const h of HUB_IDS) {
      expect(VTC_POINTS[h].length).toBeGreaterThanOrEqual(4);
      for (const p of VTC_POINTS[h]) {
        const s = stopOf(p);
        expect(onKerb(s.car.x, s.car.z), `${h} ${p.id}`).toBe(true);
        expect(Math.hypot(s.wait.x - s.car.x, s.wait.z - s.car.z)).toBeCloseTo(2.6, 5);
        const dCar = Math.min(...roads.map(r => Math.min(Math.abs(s.car.x - r), Math.abs(s.car.z - r)))), dWait = Math.min(...roads.map(r => Math.min(Math.abs(s.wait.x - r), Math.abs(s.wait.z - r))));
        expect(dWait).toBeGreaterThan(dCar);
      }
    }
  });
  it('stopped near the kerb spot picks up; moving, or too far, does not', () => {
    const p = { x: 10, z: 10 };
    expect(atStop({ x: 12, z: 10, speed: 0.2 }, p)).toBe(true);
    expect(atStop({ x: 12, z: 10, speed: 3 }, p)).toBe(false);
    expect(atStop({ x: 10 + STOP_RADIUS + 1, z: 10, speed: 0 }, p)).toBe(false);
  });
});

describe('VTC: the requests and the fare', () => {
  it('the long rides of the design are offered: Plateau → Almadies, Pikine → Plateau, Corniche → Pikine, Almadies → Plateau (by the roads)', () => {
    for (const [from, to] of [['plateau', 'almadies'], ['pikine', 'plateau'], ['corniche', 'pikine'], ['almadies', 'plateau']] as const) {
      const r = vtcRequests(from, 3, 10);
      expect(r.some(x => x.to === to), `${from} → ${to}`).toBe(true);
      expect(r.some(x => x.to === from)).toBe(true);                                  // and one inside the district
      for (const x of r) { expect(x.from).toBe(from); expect(x.hubs[0]).toBe(from); expect(x.hubs[x.hubs.length - 1]).toBe(x.to); expect(x.fare).toBeGreaterThan(0); }
    }
    expect(vtcRequests('almadies', 3, 10).find(x => x.to === 'plateau')!.hubs.length).toBeGreaterThanOrEqual(3);   // through another district
  });
  it('the same hour gives the same list (a reload never reshuffles it); another hour another', () => {
    expect(vtcRequests('pikine', 5, 9)).toEqual(vtcRequests('pikine', 5, 9));
    expect(JSON.stringify(vtcRequests('pikine', 5, 9))).not.toBe(JSON.stringify(vtcRequests('pikine', 5, 10)));
  });
  it('a ride across districts pays more than one inside a district; more districts crossed, more paid; rounded to 500 F', () => {
    const P = VTC_POINTS;
    const inside = vtcFare('pikine', P.pikine[0], 'pikine', P.pikine[4]).fare, one = vtcFare('pikine', P.pikine[0], 'plateau', P.plateau[0]).fare, two = vtcFare('almadies', P.almadies[0], 'plateau', P.plateau[0]).fare;
    expect(one).toBeGreaterThan(inside); expect(two).toBeGreaterThanOrEqual(one);
    for (const f of [inside, one, two]) expect(f % 500).toBe(0);
  });
  it('fares sit in Dakar\'s bands, by the length of the way by road: never above 5 000 F, Corniche → Plateau included', () => {
    const P = VTC_POINTS, all: { from: HubId; to: HubId; fare: number; metres: number; hubs: number }[] = [];
    for (const from of HUB_IDS) for (const to of HUB_IDS) for (const a of P[from]) for (const b of P[to]) {
      if (from === to && a.id === b.id) continue;
      const f = vtcFare(from, a, to, b); all.push({ from, to, fare: f.fare, metres: f.metres, hubs: f.hubs.length });
    }
    for (const f of all) {
      expect(f.fare % 500).toBe(0); expect(f.fare).toBeLessThanOrEqual(5000); expect(f.fare).toBeGreaterThanOrEqual(1000);
      if (f.from === f.to) { expect(f.fare).toBeLessThanOrEqual(3500); if (f.metres < 400) expect(f.fare).toBeLessThanOrEqual(2000); }
      else if (f.hubs === 2) { expect(f.fare).toBeGreaterThanOrEqual(3500); expect(f.fare).toBeLessThanOrEqual(4500); }
      else { expect(f.fare).toBeGreaterThanOrEqual(3500); expect(f.fare).toBeLessThanOrEqual(5000); }
    }
    const cp = all.filter(f => f.from === 'corniche' && f.to === 'plateau');
    expect(cp.length).toBeGreaterThan(0); for (const f of cp) expect(f.fare).toBeLessThanOrEqual(5000);
  });
  it('the time a ride should take grows with the way (late beyond it)', async () => {
    const { rideLimitMs } = await import('../src/transport/vtcRules');
    const P = VTC_POINTS, near = rideLimitMs({ from: 'pikine', to: 'pikine', pickup: P.pikine[0], dropoff: P.pikine[1] }), far = rideLimitMs({ from: 'almadies', to: 'plateau', pickup: P.almadies[0], dropoff: P.plateau[0] });
    expect(near).toBeGreaterThan(90_000); expect(far).toBeGreaterThan(near);
  });
  it('a trip in hand keeps the fare and the places it was accepted with', () => {
    const r = vtcRequests('pikine', 1, 12)[0], t = tripOf(r, 'V7', 1234);
    expect(t).toMatchObject({ id: 'V7', from: r.from, to: r.to, fare: r.fare, stage: 'pickup', acceptedMs: 1234 });
    expect(t.pickup.name).toBe(r.pickup.name); expect(t.dropoff.name).toBe(r.dropoff.name);
  });
});
