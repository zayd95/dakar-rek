import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';
import type { StopArrival } from '../src/transport/module';

/**
 * The fans a car rapide lets off at « Arène » (src/crowd/arrivals.ts): heard from the transport lane the frame the car
 * pulls in (transport.onArrival), so a slow frame never misses it; the fans aboard get off even when the street's phase
 * changed during their ride; the player's own car always lets its group off, even with every walker of the pool busy.
 * The transport lane and the arena's exterior are stood in for (no hub is loaded in node).
 */
const fake = vi.hoisted(() => ({ listeners: [] as ((a: StopArrival) => void)[], riding: null as string | null }));
vi.mock('../src/transport/module', () => ({
  transport: {
    onArrival: (fn: (a: StopArrival) => void) => { fake.listeners.push(fn); return () => { fake.listeners.splice(fake.listeners.indexOf(fn), 1); }; },
    dwellingAt: () => null, served: (key: string) => key.startsWith('23s:'), hasFans: () => false, ridingVehicle: () => fake.riding,
  },
}));
vi.mock('../src/arena/exterior', () => ({ arenaExterior: { active: () => true }, eveningSize: () => 'gala' }));
stubCanvas();

const pullIn = (vehicle: string, fans: boolean) => { for (const fn of fake.listeners) fn({ key: '23s:arene', vehicle, fans }); };

async function arrivals(o: { hour?: number; galaDone?: boolean; at?: { x: number; z: number } } = {}) {
  const { ArenaArrivals } = await import('../src/crowd/arrivals');
  const { GALA_DONE_COUNTER } = await import('../src/arena/program');
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  const at = o.at ?? { x: 4, z: -40 };
  camera.position.set(at.x, 4, at.z + 8); camera.updateMatrixWorld();
  const ctx = {
    quality: () => 'low', hour: () => o.hour ?? 18, day: () => 5, player: { pos: { x: at.x, y: 0, z: at.z } }, camera, extra: new THREE.Group(),
    state: { data: { counters: o.galaDone ? { [GALA_DONE_COUNTER]: 5 } : {} } },
  } as unknown as GameCtx;
  const hub = { id: 'pikine', arena: { cx: 30, cz: -30, r: 19 }, colliders: [], heightAt: () => 0 } as unknown as HubWorld;
  fake.listeners.length = 0; fake.riding = null;
  return new ArenaArrivals(ctx, hub);
}
/** Every walker of the pool (10 on low) on a long walk. */
const fillPool = (a: Awaited<ReturnType<typeof arrivals>>) => a.spawn({ x: -40, z: -66 }, [{ x: 0, z: -66 }, { x: 30, z: -66 }], 99, 0);

describe('fans off a car rapide at « Arène »', () => {
  it('a car pulling in is heard the frame it happens, even on one very slow frame', async () => {
    const a = await arrivals();
    pullIn('23s:0', true);
    a.update(5);                                                                     // one five-second frame
    const d = a.info().dropped;
    expect(d.rapide).toBeGreaterThanOrEqual(6); expect(d.fans).toBe(d.rapide);   // 4–7 on a gala night, 2 more with fans
    expect(a.info().walking).toBe(d.rapide);
    a.dispose();
  });
  it('fans aboard get off after the gala too (their ride began before), the others no longer come', async () => {
    const a = await arrivals({ hour: 22.6, galaDone: true });
    pullIn('23s:1', false); a.update(0.1);
    expect(a.info().dropped.rapide).toBe(0);
    pullIn('23s:1', true); a.update(0.1);
    expect(a.info().dropped.fans).toBeGreaterThanOrEqual(6);
    a.dispose();
  });
  it('the player’s own car always lets its group off: the walkers furthest along make room', async () => {
    const a = await arrivals();
    expect(fillPool(a)).toBe(10);
    for (let k = 0; k < 20; k++) a.update(0.1);                                     // under way
    pullIn('23s:1', true); a.update(0.1);                                            // another car: the pool is full, nobody
    expect(a.info().dropped.rapide).toBe(0);
    fake.riding = '23s:0';
    pullIn('23s:0', true); a.update(0.1);
    const i = a.info();
    expect(i.dropped.fans).toBeGreaterThanOrEqual(6); expect(i.dropped.arrived).toBe(i.dropped.fans);
    expect(i.walking).toBe(10);
    a.dispose();
  });
  it('nothing is let off for a player far from the arena, and nothing piles up meanwhile', async () => {
    const a = await arrivals({ at: { x: -120, z: 120 } });
    pullIn('23s:0', true); a.update(0.1);
    expect(a.info().dropped.rapide).toBe(0);
    a.dispose();
  });
  it('makes room with the walkers furthest along first', async () => {
    const { furthestAlong } = await import('../src/crowd/arrivals');
    const w = (id: string, x: number, on = true) => ({ id, on, x, z: 0, i: 0, path: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], speed: 1, wait: 0 });
    const ws = [w('a', 1), w('b', 9), w('c', 5), w('d', 9.5, false)];
    expect(furthestAlong(ws, 2).map(x => x.id)).toEqual(['b', 'c']);
    expect(furthestAlong(ws, 0)).toEqual([]);
  });
});
