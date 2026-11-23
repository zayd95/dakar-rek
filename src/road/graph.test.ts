import { describe, expect, it } from 'vitest';
import { CITY_HUBS, EDGES, connected, edgeBetween, frameOffset, hubInfo, isPlayable, planTrip, type TripPlan } from './graph';
import { ROADS } from './routes';
import { HUB_IDS, type HubId } from '../core/types';

const ids = (p: TripPlan | null) => p?.hubs.join('>') ?? null;

describe('the road network', () => {
  it('joins every playable district to every other one, with no district left out', () => {
    expect(connected()).toBe(true);
    const playable = CITY_HUBS.filter(h => h.status === 'playable').map(h => h.id).sort();
    expect(playable).toEqual([...HUB_IDS].sort());
  });
  it('keeps every existing connection and adds Corniche ↔ Plateau', () => {
    expect(edgeBetween('pikine', 'almadies')?.kind).toBe('corridor');
    expect(edgeBetween('pikine', 'plateau')?.kind).toBe('corridor');
    expect(edgeBetween('almadies', 'corniche')?.kind).toBe('border');            // the border street of PR #51
    const cp = edgeBetween('corniche', 'plateau'); expect(cp?.kind).toBe('corridor'); expect(cp?.road?.id).toBe('corniche-plateau');
    expect(EDGES.length).toBe(ROADS.length + 1);
  });
  it('is not a star: no district is the hub of every trip', () => {
    const deg = (h: HubId) => EDGES.filter(e => e.a === h || e.b === h).length;
    for (const h of HUB_IDS) if (h !== 'mermoz') expect(deg(h)).toBeGreaterThanOrEqual(2);   // every district of the ring has at least two ways out: a ring, not spokes
    expect(deg('mermoz')).toBe(1);                                                   // Mermoz · Sacré-Cœur (M1) is a leaf off the Corniche, by the VDN
    expect(EDGES.length).toBeGreaterThanOrEqual(HUB_IDS.length);                    // at least as many edges as districts: a cycle exists
  });
});

describe('routing', () => {
  it('goes the short way, through intermediate districts when it must, in both directions', () => {
    expect(ids(planTrip('almadies', 'plateau'))).toBe('almadies>corniche>plateau');
    expect(ids(planTrip('corniche', 'mermoz'))).toBe('corniche>mermoz');            // M1: the VDN road
    expect(ids(planTrip('mermoz', 'plateau'))).toBe('mermoz>corniche>plateau');
    expect(ids(planTrip('plateau', 'almadies'))).toBe('plateau>corniche>almadies');
    expect(ids(planTrip('corniche', 'pikine'))).toBe('corniche>almadies>pikine');
    expect(ids(planTrip('pikine', 'corniche'))).toBe('pikine>almadies>corniche');
    expect(ids(planTrip('pikine', 'plateau'))).toBe('pikine>plateau');
    expect(ids(planTrip('corniche', 'plateau'))).toBe('corniche>plateau');
    expect(ids(planTrip('almadies', 'pikine'))).toBe('almadies>pikine');
  });
  it('a trip from any district to any other exists and is as long as its legs', () => {
    for (const a of HUB_IDS) for (const b of HUB_IDS) {
      if (a === b) { expect(planTrip(a, b)).toBeNull(); continue; }
      const p = planTrip(a, b)!; expect(p).not.toBeNull();
      expect(p.legs.length).toBeGreaterThanOrEqual(1); expect(p.hubs[0]).toBe(a); expect(p.hubs[p.hubs.length - 1]).toBe(b);
      expect(p.metres).toBeCloseTo(p.legs.reduce((n, l) => n + l.edge.metres, 0), 6);
      const back = planTrip(b, a)!; expect(back.metres).toBeCloseTo(p.metres, 6);          // the way back is the same road
    }
  });
  it('no trip begins in Pikine by necessity: Almadies → Plateau never passes through it', () => {
    for (const [a, b] of [['almadies', 'plateau'], ['corniche', 'plateau'], ['almadies', 'corniche']] as const) expect(planTrip(a, b)!.hubs).not.toContain('pikine');
  });
  it('the frames close: going round the ring ends where it started (a pure translation per leg, nothing rotates)', () => {
    const ring: HubId[] = ['pikine', 'almadies', 'corniche', 'plateau', 'pikine'];
    let x = 0, z = 0;
    for (let i = 0; i + 1 < ring.length; i++) { const o = frameOffset(planTrip(ring[i], ring[i + 1])!); x += o.x; z += o.z; }
    expect(x).toBeCloseTo(0, 6); expect(z).toBeCloseTo(0, 6);
  });
});

describe('future districts', () => {
  it('Ouakam, Yoff and Parcelles Assainies are in the registry as planned: on the map, never routed, never drivable', () => {
    for (const id of ['ouakam', 'yoff', 'parcelles']) {
      const h = hubInfo(id)!; expect(h.status).toBe('planned'); expect(isPlayable(id)).toBe(false); expect(h.lngLat.length).toBe(2);
      expect(planTrip('pikine', id)).toBeNull(); expect(planTrip(id, 'plateau')).toBeNull();
      expect(EDGES.some(e => (e.a as string) === id || (e.b as string) === id)).toBe(false);
      expect(h.intends?.length).toBeGreaterThan(0);
    }
  });
});

describe('the new road', () => {
  const r = ROADS.find(x => x.id === 'corniche-plateau')!;
  it('leaves the Corniche heading east and enters the Plateau heading east, on a plain road of a short journey\'s length', () => {
    expect(r.def.aMouth.yaw).toBeCloseTo(Math.PI / 2, 6); expect(r.def.bMouth.yaw).toBeCloseTo(Math.PI / 2, 6);
    expect(r.length).toBeGreaterThan(1400); expect(r.length).toBeLessThan(2100);
    expect(r.swapS).toBeGreaterThan(600); expect(r.length - r.swapS).toBeGreaterThan(600);            // the swap is out of sight of both districts (fog 300 m)
    const start = r.spine.at(0), end = r.spine.at(r.length);
    expect(Math.abs(start.yaw - Math.PI / 2)).toBeLessThan(0.05); expect(Math.abs(end.yaw - Math.PI / 2)).toBeLessThan(0.05);
  });
});
