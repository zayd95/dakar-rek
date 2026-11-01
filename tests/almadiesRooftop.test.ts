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
  it('the hub carries the hotel\'s stair door as architecture, and the venue puts the Terrasse de Ngor\'s door where the strip has it: one Terrasse, never on the hotel', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub: HubWorld = buildHub('almadies', false);
    const f = hub.rooftopDoor!;
    expect(f, 'the hub has the hotel\'s rooftop door').toBeTruthy();
    const { RooftopModule, ROOFTOPS } = await import('../src/venues/rooftop');
    const ctx = { interactions: { add() {} }, addInterior() {} } as unknown as GameCtx;
    const before = hub.interactables.length;
    RooftopModule.hubLoaded?.(ctx, hub);
    const doors = hub.interactables.slice(before).filter(i => i.id === 'almadies:rooftop:almadies');
    expect(doors, 'one door for the Terrasse: no second one on the hotel').toHaveLength(1);
    const site = ROOFTOPS.almadies!.site!;
    expect(doors[0].x).toBeCloseTo(site.x, 6); expect(doors[0].z).toBeCloseTo(site.z, 6);
    expect(Math.hypot(doors[0].x - f.x, doors[0].z - f.z), 'not the hotel\'s door').toBeGreaterThan(20);
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
describe('the rooftop restaurant\'s name on the hotel\'s roof (the gantry the district draws)', () => {
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
  it('the venue lights two gantries: the Terrasse\'s own on the strip (the Terrasse de Ngor, once) and the hotel\'s, which carries the hotel\'s name', async () => {
    const { buildHub } = await import('../src/world/builder'), { RooftopModule } = await import('../src/venues/rooftop');
    const hub: HubWorld = buildHub('almadies', false);
    expect(hub.rooftopSign?.panels).toHaveLength(4);
    expect(hub.rooftopSign?.name, 'the hotel names itself').toMatch(/HÔTEL|HOTEL/i);
    const before = hub.signs.length;
    RooftopModule.hubLoaded?.({ interactions: { add() {} }, addInterior() {} } as unknown as GameCtx, hub);
    const added = hub.signs.slice(before);
    expect(added, 'the Terrasse\'s gantry and the hotel\'s: two meshes, no door sign').toHaveLength(2);
    for (const m of added) {
      expect(m.name).toBe('rooftop-sign'); expect(m.geometry.type).toBe('BufferGeometry');
      expect(m.geometry.attributes.position.count, '4 quads, 6 vertices each').toBe(24);
      const mat = m.material as unknown as { emissiveMap: unknown; map: unknown };
      expect(mat.emissiveMap).toBe(mat.map);                                                                              // lit at night with the hub's other signs
    }
    const at = (m: (typeof added)[number]) => { const pos = m.geometry.attributes.position; let sx = 0, miny = 1e9; for (let i = 0; i < pos.count; i++) { sx += pos.getX(i); miny = Math.min(miny, pos.getY(i)); } return { x: sx / pos.count, miny }; };
    const [p, q] = added.map(at).sort((u, v) => u.x - v.x);
    expect(p.x, 'the Terrasse\'s: over the strip, in the middle of its block').toBeGreaterThan(-45); expect(p.x).toBeLessThan(-15);
    const hx = hub.rooftopSign!.panels.reduce((n, f) => n + f.x, 0) / 4;
    expect(Math.abs(q.x - hx), 'the hotel\'s: on the hotel\'s roof').toBeLessThan(1);
    expect(Math.abs(q.x - p.x), 'two buildings').toBeGreaterThan(40);
    expect(p.miny, 'the Terrasse\'s faces stand above its roof terrace (6.4 m)').toBeGreaterThan(7);
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
  it('the Terrasse de Ngor\'s faces look at the viewer, with nothing solid between, from the sea road for 100 m either way and from the beach, and along the avenue and the cross street but beside the strip', async () => {
    const { buildHub } = await import('../src/world/builder'), { ROOFTOPS } = await import('../src/venues/rooftop'), { VENUE_D, terrasseGantry } = await import('../src/world/hospitalityStrip');
    const hub: HubWorld = buildHub('almadies', false), site = ROOFTOPS.almadies!.site!, panels = terrasseGantry(site.x, site.z + 0.08 + VENUE_D / 2, 0.12).panels, cols = hub.colliders;
    const eyeH = 1.7, views: { at: [number, number]; what: string }[] = [];
    for (let x = -130; x <= 70; x += 10) views.push({ at: [x, -118], what: `the sea road at x ${x}` });                      // along the Route des Almadies, 100 m west and east of the Terrasse
    for (let z = -60; z >= -118; z -= 8) views.push({ at: [0, z], what: `the avenue at z ${z}` });                           // down the Avenue du Littoral to the sea road
    for (let z = -60; z >= -118; z -= 8) views.push({ at: [-60, z], what: `the cross street at z ${z}` });                   // the road at the strip's west end
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
    // the neighbouring venues of the strip (the lounge to the west, the comptoir to the east) hide the blades from the two stretches of road right beside them: nothing else is hidden
    expect(unseen).toEqual(['the avenue at z -92', 'the avenue at z -100', 'the cross street at z -84', 'the cross street at z -92', 'the cross street at z -100']);
  }, 120000);
});
