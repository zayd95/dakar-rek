import { describe, expect, it } from 'vitest';
import { carSpec } from '../src/transport/car';
import { berlineSpec, suvSpec } from '../src/transport/premiumCars';
import { motoSpec } from '../src/transport/moto';
import { ROADS } from '../src/road/routes';
import { lap } from './helpers/pilot';

const vehicles = [['berline moderne', carSpec().drive!], ['berline neuve', berlineSpec().drive!], ['4×4', suvSpec().drive!], ['Jakarta', motoSpec().drive!]] as const;

describe('driving the real roads with the analog controls (simulated driver)', () => {
  for (const road of ROADS) for (const [name, d] of vehicles) for (const boost of [false, true]) {
    it(`${road.id} · ${name} · ${boost ? 'with Accélérer' : 'stick only'}: holds its lane to the end, never leaves the road, steering calm`, () => {
      const r = lap(road, d, { boost });
      expect(r.secs, 'finished').toBeLessThan(399);
      expect(r.left, `max lateral ${r.maxLateral.toFixed(1)}`).toBe(false);
      expect(r.bumps).toBe(0);
      expect(r.maxLateral).toBeLessThan(6.5);                                               // always on the carriageway's width
      expect(r.reversals / (r.metres / 100)).toBeLessThan(2.2);                              // few left-right-left corrections per 100 m: no wobble
      if (boost) expect(r.top).toBeGreaterThan(d.maxSpeed * 1.2); else expect(r.top).toBeLessThanOrEqual(d.maxSpeed + 0.01);
    });
  }
  it('the way back along a road is as steady as the way out', () => {
    for (const road of ROADS) for (const [, d] of vehicles) { const r = lap(road, d, { back: true, boost: true }); expect(r.left).toBe(false); expect(r.bumps).toBe(0); }
  });
});
