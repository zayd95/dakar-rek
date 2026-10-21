import { describe, expect, it } from 'vitest';
import { CorridorView } from './corridor';
import { ChunkMats } from './chunks';
import { ROADS } from './routes';

/** A road view that has just been attached has no hint of where the player is along it: a player already far out (a reload on the road) must not be sent back to the other district. */
describe('a fresh road view round a player who is already far along it', () => {
  for (const road of ROADS) it(`${road.id}: no swap toward the wrong district when the game is reloaded at either end of the road`, () => {
    for (const hub of [road.def.a, road.def.b]) {
      const off = road.offset(hub);
      // reloaded 30 m inside the road's own end of this district's frame: the player is at the near end, not past the middle
      const s = hub === road.def.a ? 30 : road.length - 30, at = road.spine.at(s);
      const view = new CorridorView(road, hub, { mats: new ChunkMats(true), lite: true, rand: () => 0.5, traffic: 0 });
      expect(view.swap(at.x + off.x, at.z + off.z), `${road.id} in ${hub}`).toBeNull();
      expect(Math.abs(view.project(at.x + off.x, at.z + off.z).s - s)).toBeLessThan(1);
    }
  });
  it('and still swaps when the player really is past the middle', () => {
    const road = ROADS[2], off = road.offset(road.def.a), at = road.spine.at(road.swapS + 60);
    const view = new CorridorView(road, road.def.a, { mats: new ChunkMats(true), lite: true, rand: () => 0.5, traffic: 0 });
    expect(view.swap(at.x + off.x, at.z + off.z)?.to).toBe(road.def.b);
  });
});
