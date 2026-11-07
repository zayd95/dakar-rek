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

/**
 * Round 4 (« keep la terrasse where it is but put its name on top since it's a rooftop, and make it visible from the street and far »): the boutique hotel carries the sign on
 * its roof, over the street (one face each way) and across both ends, and the venue paints and lights it in one mesh; the door keeps only a plaque.
 */
describe('the rooftop restaurant\'s name on the hotel\'s roof', () => {
  const sign = (s = hotel) => { const t = testKit(), dist = buildDistrict(t.kit, x => x.id === s.id); return { dist, panels: dist.rooftopSign!.panels, colliders: dist.colliders, tallest: Math.max(...dist.colliders.map(c => c.h)) }; };
  it('is given by the hotel: a board over the street with a face each way, a blade at each end, all above everything solid under them and inside the site', () => {
    const { panels, colliders } = sign(), r = hotel.rect, street = hotel.facing === 'north' ? -1 : 1;
    const under = (p: (typeof panels)[number]) => Math.max(0, ...colliders.filter(c => { const hx = Math.abs(p.nz) > 0.5 ? p.w / 2 : 0.3, hz = Math.abs(p.nz) > 0.5 ? 0.3 : p.w / 2; return c.x1 > p.x - hx && c.x0 < p.x + hx && c.z1 > p.z - hz && c.z0 < p.z + hz; }).map(c => c.h));
    expect(panels).toHaveLength(4);
    const front = panels.filter(p => p.kind === 'front'), blades = panels.filter(p => p.kind === 'blade');
    expect(front).toHaveLength(2); expect(blades).toHaveLength(2);
    expect(front.map(p => p.nz).sort((a, b) => a - b)).toEqual([-1, 1]);                                                    // one face looks to the street, one away
    expect(front.find(p => p.nz === street), 'a face to the street').toBeTruthy();
    expect(blades.map(p => p.nx).sort((a, b) => a - b)).toEqual([-1, 1]);                                                                // one blade face looks east, one west: read from along the road
    for (const p of panels) {
      expect(p.y - p.h / 2, 'above every solid under it').toBeGreaterThan(under(p));
      expect(p.y - p.h / 2, 'above the roof\'s glass guard').toBeGreaterThan(15);
      expect(p.x).toBeGreaterThan(r.x0); expect(p.x).toBeLessThan(r.x1); expect(p.z).toBeGreaterThan(r.z0); expect(p.z).toBeLessThan(r.z1);
      expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1, 6);
      expect(p.h).toBeGreaterThanOrEqual(2.3);                                                                             // letters about a metre high
    }
    expect(Math.max(...front.map(p => p.w)), 'a long board').toBeGreaterThan(11);
    expect(Math.max(...panels.map(p => p.y + p.h / 2)), 'the highest thing on the hotel').toBeGreaterThan(19);
  });
  it('is turned the right way in every mirror and gate side (the front faces the street, the blades the ends)', () => {
    for (const gate of ['left', 'right'] as const) for (const mirror of [false, true]) {
      const { panels } = sign({ ...hotel, gate, mirror }), street = hotel.facing === 'north' ? -1 : 1, f = panels.find(p => p.kind === 'front' && p.nz === street)!;
      expect(f, `${gate} ${mirror}`).toBeTruthy();
      const b = panels.filter(p => p.kind === 'blade'), cx = (hotel.rect.x0 + hotel.rect.x1) / 2;
      expect(b.map(p => Math.sign(p.x - cx)).sort(), 'one at each end').toEqual([-1, 1]);
      for (const p of b) expect(Math.sign(p.nx), 'faces outward').toBe(Math.sign(p.x - cx));
    }
  });
  it('the venue builds it as ONE lit mesh (five faces: the two of the board, the two blades, the door\'s plaque) and the door has no other sign', async () => {
    const { buildHub } = await import('../src/world/builder'), { RooftopModule } = await import('../src/venues/rooftop');
    const hub: HubWorld = buildHub('almadies', false);
    expect(hub.rooftopSign?.panels).toHaveLength(4);
    const before = hub.signs.length, kids = hub.group.children.length;
    RooftopModule.hubLoaded?.({ interactions: { add() {} }, addInterior() {} } as unknown as GameCtx, hub);
    const added = hub.signs.slice(before);
    expect(added, 'one sign: the door\'s old one is gone').toHaveLength(1);
    const m = added[0];
    expect(m.name).toBe('rooftop-sign'); expect(m.geometry.type).toBe('BufferGeometry');
    expect(m.geometry.attributes.position.count, '5 quads, 6 vertices each').toBe(30);
    expect(hub.group.children.length - kids, 'the door\'s frame batch and the sign: two meshes, the same as before').toBeLessThanOrEqual(2);
    const mat = m.material as unknown as { emissiveMap: unknown; map: unknown; emissiveIntensity: number };
    expect(mat.emissiveMap).toBe(mat.map);                                                                                  // lit at night with the hub's other signs
    // the plaque (its last quad) is at the door, low; the four faces are up on the roof
    const pos = m.geometry.attributes.position, ys = Array.from({ length: 30 }, (_, i) => pos.getY(i));
    expect(Math.min(...ys.slice(24))).toBeGreaterThan(2.5); expect(Math.max(...ys.slice(24))).toBeLessThan(4);
    expect(Math.min(...ys.slice(0, 24))).toBeGreaterThan(15);                                                              // the four faces are above the roof (13.7 m)
    const { debug } = RooftopModule as unknown as { debug: () => { rooftop: { info: () => { sign: { onRoof: boolean; top: number } | null } } } };
    expect(debug).toBeTypeOf('function');
  }, 120000);
  it('the other hubs keep their sign over the door (no gantry given)', async () => {
    const { buildHub } = await import('../src/world/builder'), { RooftopModule } = await import('../src/venues/rooftop');
    const hub: HubWorld = buildHub('plateau', true);
    expect(hub.rooftopSign).toBeUndefined();
    const before = hub.signs.length;
    RooftopModule.hubLoaded?.({ interactions: { add() {} }, addInterior() {} } as unknown as GameCtx, hub);
    expect(hub.signs.length - before).toBe(1); expect(hub.signs[hub.signs.length - 1].geometry.type).toBe('PlaneGeometry');
  }, 120000);
});

/** The eye's ray to a sign's centre, against the hub's solids (boxes from the ground to their height): is it clear? */
function clear(eye: [number, number, number], to: [number, number, number], cols: { x0: number; z0: number; x1: number; z1: number; h: number }[]): boolean {
  const d = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]];
  for (const c of cols) {
    if (eye[0] > c.x0 && eye[0] < c.x1 && eye[2] > c.z0 && eye[2] < c.z1) continue;                                          // standing inside one (a gate's pier): not what blocks the view
    let t0 = 0, t1 = 1;
    for (const [o, v, a, b] of [[eye[0], d[0], c.x0, c.x1], [eye[1], d[1], 0, c.h], [eye[2], d[2], c.z0, c.z1]] as const) {
      if (Math.abs(v) < 1e-9) { if (o < a || o > b) { t0 = 2; break; } continue; }
      let ta = (a - o) / v, tb = (b - o) / v; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 0.985) return false;
  }
  return true;
}
describe('seen from the street and from far', () => {
  it('a face looks at the viewer, with nothing solid between, from the sea road for 100 m either way, from the avenue behind, the cross street and the beach', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub: HubWorld = buildHub('almadies', false), panels = hub.rooftopSign!.panels, cols = hub.colliders;
    const eyeH = 1.7, views: { at: [number, number]; what: string }[] = [];
    for (let x = -80; x <= 100; x += 10) views.push({ at: [x, -118], what: `the sea road at x ${x}` });                       // along the Route des Almadies, from 50 m west of the hotel's middle (the resort's wing stands in the way further) to 130 m east
    for (let z = -60; z >= -118; z -= 8) views.push({ at: [0, z], what: `the avenue at z ${z}` });                           // down the whole Avenue du Littoral to the sea road, at the hotel's east side
    for (let z = -60; z >= -118; z -= 8) views.push({ at: [-60, z], what: `the cross street at z ${z}` });                   // the road at the hotel's west end
    for (const x of [-90, -70, -50, -30, -10, 10, 40]) views.push({ at: [x, -140], what: `the beach at x ${x}` });                    // the sea side
    const centre = (p: { x: number; y: number; z: number }) => [p.x, p.y, p.z] as [number, number, number];
    const unseen: string[] = [];
    for (const v of views) {
      const ok = panels.some(p => {
        const dx = v.at[0] - p.x, dz = v.at[1] - p.z, dist = Math.hypot(dx, dz), facing = (dx * p.nx + dz * p.nz) / dist;      // how squarely it faces the viewer
        return facing > 0.2 && clear([v.at[0], eyeH, v.at[1]], centre(p), cols);
      });
      if (!ok) unseen.push(v.what);
    }
    expect(views.length).toBeGreaterThan(40);
    expect(unseen, 'no viewpoint is without a sign it can see').toEqual([]);
  }, 120000);
});
