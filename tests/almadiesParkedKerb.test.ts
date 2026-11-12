import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';

/**
 * The coast road in front of the Almadies' hotels and the night street is kept free of parked cars (src/game/parkedVehicles.ts `KERB_FREE`): LD2.0-E round 3 made the district's busy streets
 * park a run of cars down the kerb, which put a car in the lane a driver takes to the night street's car parks (check-nightlife-journey) and in front of their ways in.
 */
stubCanvas();
describe('the night street\'s kerb', () => {
  it('has no parked car, on either preset\'s count, from the west end of the hotels to the east end', async () => {
    const { buildHub } = await import('../src/world/builder'), { placeParked } = await import('../src/game/parkedVehicles');
    for (const [lite, count] of [[false, 40], [false, 60], [true, 28]] as const) {
      const hub = buildHub('almadies', lite), g = placeParked(hub, count);
      const onKerb = g.children.filter(c => c.position.x > -121 && c.position.x < -6 && c.position.z > -119.2 && c.position.z < -112);
      expect(onKerb.map(c => [Math.round(c.position.x), Math.round(c.position.z)]), `${lite ? 'lite' : 'full'} ${count}`).toEqual([]);
      expect(g.children.length, 'the cars are parked elsewhere, not dropped').toBeGreaterThanOrEqual(count - 6);
    }
  }, 180000);
});
