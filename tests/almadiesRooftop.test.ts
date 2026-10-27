import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { drawSite, testKit } from './helpers/siteCost';
import { walkToDoor } from './helpers/designChecks';
import { E } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { buildDistrict, variantOf } from '../src/world/almadies/district';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';

/**
 * The Almadies' rooftop restaurant, « Terrasse de Ngor » (src/venues/rooftop.ts): its stair door stands on the street face of the boutique hotel, where the avenue sees
 * it and a body walks to it from the pavement. (The venue's own search, the first free side of the nearest tall building, put it in the hotel's back yard once
 * the district's buildings stood there: « the terrace is behind the building and hard to localise ».)
 */
stubCanvas();
const hotel = SITES.find(s => variantOf(s).id === 'hotel-boutique')!;

describe('the rooftop restaurant\'s stair door', () => {
  it('is given by the boutique hotel: on its street face, inside its site, facing the street', () => {
    const t = testKit(), dist = buildDistrict(t.kit, s => s.id === hotel.id), f = dist.rooftopDoor!;
    expect(f, 'the district hands the venue a door').toBeTruthy();
    const r = hotel.rect;
    expect(f.x).toBeGreaterThan(r.x0); expect(f.x).toBeLessThan(r.x1); expect(f.z).toBeGreaterThan(r.z0); expect(f.z).toBeLessThan(r.z1);
    const street = hotel.facing === 'north' ? -1 : 1;                                       // the north row's street is the sea road, at −z
    expect(f.nz, 'its face looks to the street').toBe(street); expect(f.nx).toBe(0);
    const edge = hotel.facing === 'north' ? r.z0 : r.z1;
    expect(Math.abs(f.z - edge), 'in the street half of the lot, not in its back yard').toBeLessThan(9);
  });
  it('is reached on foot from the pavement, through the hotel\'s open forecourt, on every gate side and mirror of the site', () => {
    const variant = variantOf(hotel);
    for (const gate of ['left', 'right'] as const) for (const mirror of [false, true]) {
      const s = { ...hotel, gate, mirror }, res = drawSite(s, variant), door = res.rooftopDoor;
      expect(door, `${gate} ${mirror}`).toBeTruthy();
      const w = walkToDoor(res.draw, { x: 0, z: E + 1.5 }, door!, 0.45);
      expect(w.reached, `a body walks from the pavement to the door (gate ${gate}, mirrored ${mirror})`).toBe(true);
      expect(door!.z, 'in front of the street face').toBeLessThan(E - 3);
    }
  });
  it('is on the gate\'s side of the lobby, a few strides from its portal, between two pilasters and clear of the staff door', () => {
    for (const gate of ['left', 'right'] as const) {
      const res = drawSite({ ...hotel, gate }, variantOf(hotel)), door = res.rooftopDoor!, sg = gate === 'left' ? -1 : 1;
      expect(door.x * sg).toBeGreaterThan(8.4); expect(door.x * sg).toBeLessThan(11.6);   // the bay between the pilasters at 8 and 12, next to the lobby's portal
    }
  });
});

describe('in the hub', () => {
  it('the Almadies hub carries the door, and the venue uses it instead of its search', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub: HubWorld = buildHub('almadies', false);
    const f = hub.rooftopDoor!;
    expect(f, 'the hub has the rooftop door').toBeTruthy();
    const { RooftopModule } = await import('../src/venues/rooftop');
    const ctx = { interactions: { add() {} }, addInterior() {} } as unknown as GameCtx;
    const before = hub.interactables.length;
    RooftopModule.hubLoaded?.(ctx, hub);
    const door = hub.interactables.slice(before).find(i => i.id === 'almadies:rooftop:almadies')!;
    expect(door, 'the venue put its door in the hub').toBeTruthy();
    expect(door.x).toBeCloseTo(f.x, 6); expect(door.z).toBeCloseTo(f.z, 6);
    // not behind the hotel: the hotel's lot is x −53…−7, z −113…−91 (the sea road to the north): the door is in its north half
    expect(door.z).toBeLessThan(-100); expect(door.x).toBeGreaterThan(-53); expect(door.x).toBeLessThan(-7);
  }, 120000);
  it('the other hubs keep the venue\'s own search (no door given)', async () => {
    const { buildHub } = await import('../src/world/builder');
    expect(buildHub('plateau', true).rooftopDoor).toBeUndefined();
  }, 120000);
});
