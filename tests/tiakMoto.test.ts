import { describe, expect, it } from 'vitest';
import { tiakDepot, tiakSeed } from '../src/transport/motoModule';
import { jakartaSeed } from '../src/transport/moto';
import { ownsVehicle, park, parked } from '../src/transport/owned';
import { vehicleSpec } from '../src/actors/vehicleKit';
import { GameState } from '../src/core/state';
import type { HubWorld } from '../src/world/types';

describe('the Tiak Tiak lent motorbike', () => {
  it('is always available: no purchase, while the paid ones still need to be owned', () => {
    const s = new GameState();
    expect(ownsVehicle(s, 'tiak')).toBe(true);
    expect(ownsVehicle(s, 'jakarta')).toBe(false);
  });
  it('is not the red Jakarta', () => {
    const red = vehicleSpec('moto', { seed: jakartaSeed(), driver: false, passengers: false }).colors.body;
    const own = vehicleSpec('moto', { seed: tiakSeed(), driver: false, passengers: false });
    expect(own.colors.body).not.toBe(red);
  });
  it('waits near the arrival, on free ground', () => {
    const hub = { spawn: { x: 0, z: 0, yaw: 0 }, bounds: { x0: -50, x1: 50, z0: -50, z1: 50 }, colliders: [{ x0: 2, x1: 8, z0: -8, z1: 8, h: 3 }] } as unknown as HubWorld;
    const d = tiakDepot(hub)!;
    expect(d).toBeTruthy();
    expect(Math.hypot(d.x, d.z)).toBeLessThan(10);
    expect(hub.colliders.some(c => d.x > c.x0 - 1.2 && d.x < c.x1 + 1.2 && d.z > c.z0 - 1.2 && d.z < c.z1 + 1.2)).toBe(false);
  });
  it('is left where the player parks it (its own record, apart from the Jakarta)', () => {
    const s = new GameState();
    park(s.data, { asset: 'tiak', hub: 'plateau', x: 12.5, z: -3, yaw: 1.2 });
    expect(parked(s.data, 'tiak')).toMatchObject({ hub: 'plateau', x: 12.5, z: -3 });
    expect(parked(s.data, 'jakarta')).toBeNull();
  });
});
