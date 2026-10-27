import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { drawSite, testKit, trisOf, type TestKit } from './helpers/siteCost';
import { BLK, HALF, PITCH, ROAD } from '../src/world/builder';
import { E, GROUND, STOREY, TRI_CAP, extentOf, siteFrame, sizeOf, type Site } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { buildDistrict, variantOf, variantsFor } from '../src/world/almadies/district';
import { perimeter } from '../src/world/almadies/parts';
import { VARIANTS } from '../src/world/almadies/residences';
import { stackBalconyRuns } from '../src/world/almadies/residences.stack';
import { LOBBY_BAYS, screenClosed } from '../src/world/almadies/residences.screen';
import type { Collider } from '../src/world/types';

/**
 * LD2.0-E lane E-R: the residences' designs (src/world/almadies/residences.*.ts): the registry the plan asks for, the Ngor residence on its lot (the
 * gate at the lot's centre on the street wall, nothing built outside the wall, the pavement of the estate's door, board and marker free), the name
 * on the one sign, the designs' own rhythms (the stacked residence's balconies climbing the façade, the louvred one's dappled bays, the courtyard's
 * passage on the gate's centre line), the budgets, and every collider inside its site for 4 to 7 storeys, on both facings, mirrored or not.
 */
stubCanvas();
const residences = SITES.filter(s => s.kind === 'residence');
const ngorSite = SITES.find(s => s.name === 'RÉSIDENCE DE NGOR')!;
const within = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;
const solidAt = (cs: Collider[], x: number, z: number, hMin = 0) => cs.some(c => c.h >= hMin && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
/** A plan point (+z toward the street) of a site is solid: through the site's frame. */
const solidPlan = (cs: Collider[], s: Site, x: number, z: number, hMin = 0) => { const q = siteFrame(s).p(x, z); return solidAt(cs, q.x, q.z, hMin); };
/** Every triangle a drawn site made, as plan coordinates (the site drawn facing south, not mirrored, so the plan is the hub's, moved to the site's origin). */
interface Tri { a: [number, number, number]; b: [number, number, number]; c: [number, number, number]; batch: string }
function trianglesOf(t: TestKit, s: Site): Tri[] {
  const f = siteFrame(s), o = f.p(0, 0), out: Tri[] = [];
  for (const [name, b] of Object.entries(t.batches)) {
    for (const g of (b as unknown as { geos: THREE.BufferGeometry[] }).geos) {
      const p = g.attributes.position as THREE.BufferAttribute, idx = g.index, n = idx ? idx.count : p.count;
      const at = (i: number): [number, number, number] => { const k = idx ? idx.getX(i) : i; return [p.getX(k) - o.x, p.getY(k), p.getZ(k) - o.z]; };
      for (let i = 0; i < n; i += 3) out.push({ a: at(i), b: at(i + 1), c: at(i + 2), batch: name });
    }
  }
  return out;
}
/** The site's own copy on a rectangle round the origin, facing south, for the plan-coordinate checks. */
const planSite = (s: Site, o: Partial<Site> = {}): Site => { const { w, d } = extentOf(s); return { ...s, ...o, facing: 'south', mirror: false, rect: { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 } }; };
const variantFor = (s: Site) => variantOf(s);
/** The top faces (horizontal quads) at height y: [x0, x1, z0, z1]. */
function topQuads(tris: Tri[], y: number, batch = 'plain'): [number, number, number, number][] {
  const m = new Map<string, [number, number, number, number]>();
  for (const t of tris) if (t.batch === batch && [t.a, t.b, t.c].every(v => Math.abs(v[1] - y) < 1e-4)) {
    // the up-facing ones: counter-clockwise seen from above (y up)
    const cr = (t.b[2] - t.a[2]) * (t.c[0] - t.a[0]) - (t.b[0] - t.a[0]) * (t.c[2] - t.a[2]);
    if (cr <= 0) continue;
    const xs = [t.a[0], t.b[0], t.c[0]], zs = [t.a[2], t.b[2], t.c[2]], k = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] as [number, number, number, number];
    m.set(k.map(v => v.toFixed(2)).join(), k);
  }
  return [...m.values()];
}

describe('the registry the plan asks for', () => {
  it('has the S list [ngor], the M list [stack, screen], the L list [courtyard], in that order', () => {
    expect(variantsFor('residence', 'S').map(v => v.id)).toEqual(['residence-ngor']);
    expect(variantsFor('residence', 'M').map(v => v.id)).toEqual(['residence-stack', 'residence-screen']);
    expect(variantsFor('residence', 'L').map(v => v.id)).toEqual(['residence-courtyard']);
    expect(VARIANTS).toHaveLength(4);
    for (const v of VARIANTS) expect(v.name.length, v.id).toBeGreaterThan(3);
  });
  it('wears each design where the plan puts it: the Ngor residence S, Les Alizés the stacked one, Kër Salam and Les Cormorans the louvred one, Jardins de Ngor the courtyard', () => {
    const id = (name: string) => variantFor(residences.find(s => s.name === name)!).id;
    expect(id('RÉSIDENCE DE NGOR')).toBe('residence-ngor');
    expect(id('RÉSIDENCE LES ALIZÉS')).toBe('residence-stack');
    expect(id('RÉSIDENCE KËR SALAM')).toBe('residence-screen');
    expect(id('RÉSIDENCE LES CORMORANS')).toBe('residence-screen');
    expect(id('RÉSIDENCE JARDINS DE NGOR')).toBe('residence-courtyard');
  });
});

describe('the Ngor residence on its lot (the game\'s « Résidence de Ngor » for sale)', () => {
  // the estate's door, board and walking marker (src/economy/estate.ts VILLA_GATES residence_ngor): on the pavement just outside the lot's gate
  const LOT = (BLK - 2) / 2, BM = (k: number) => -HALF + ROAD + k * PITCH, gate = { x: BM(1) + LOT / 2, z: BM(1) + LOT + 2 + LOT - 0.3 };
  const door = { x: gate.x, z: gate.z + 1.4 }, board = { x: gate.x + 2.3, z: gate.z + 0.9 }, entry = { x: gate.x - 2.6, z: gate.z + 2.2 };
  const v = variantFor(ngorSite), r = drawSite(ngorSite, v);
  it('stands on the plan\'s lot: south facing, the gate at the lot\'s centre, 4 storeys', () => {
    expect(ngorSite).toMatchObject({ id: 'almadies:1,1:2', gate: 'centre', facing: 'south', mirror: false, storeys: 4 });
    expect(gate.x).toBeCloseTo((ngorSite.rect.x0 + ngorSite.rect.x1) / 2, 6);
    expect(gate.z).toBeCloseTo(ngorSite.rect.z1 - 0.3, 6);
  });
  it('shuts its car gate at the lot\'s centre on the street wall, and keeps the estate\'s door, board and marker on the pavement outside it free', () => {
    expect(solidAt(r.colliders, gate.x, gate.z, 2)).toBe(true);                                  // the shut gate, in the wall
    expect(solidAt(r.colliders, gate.x - 1.8, gate.z, 2)).toBe(true);                             // the wall beside it
    for (const q of [door, board, entry, { x: door.x + 0.7, z: door.z }, { x: door.x - 0.7, z: door.z }]) expect(solidAt(r.colliders, q.x, q.z), `${q.x}, ${q.z}`).toBe(false);
    for (const c of r.colliders) expect(c.z1, JSON.stringify(c)).toBeLessThanOrEqual(ngorSite.rect.z1 + 1e-6);   // nothing solid beyond the wall
  });
  it('builds nothing outside the lot\'s wall beyond what the shared boundary does itself (its gate pillars; the bougainvillea that spills over its top)', () => {
    const over = (t: TestKit, s: Site, plants: boolean) => {
      const { w, d } = extentOf(s); let m = 0;
      for (const tr of trianglesOf(t, s)) if ((tr.batch === 'leaves' || tr.batch === 'trunks') === plants) for (const q of [tr.a, tr.b, tr.c]) m = Math.max(m, q[2] - E, E - d - q[2], Math.abs(q[0]) - w / 2);
      return m;
    };
    const ps = planSite(ngorSite), mine = drawSite(ps, v), bare = drawSite(ps, { id: 'bare', name: 'bare', size: 'S', build: d => { perimeter(d, { gate: 'centre', front: 'wall' }); } });
    expect(over(bare.kit, ps, false)).toBeLessThan(0.25);
    expect(over(mine.kit, ps, false)).toBeLessThanOrEqual(over(bare.kit, ps, false) + 1e-6);      // the building, the garden's paving, the signs: all within the wall
    expect(over(mine.kit, ps, true)).toBeLessThanOrEqual(0.9);                                      // the planting too (a palm's fronds may hang over the wall a little)
  });
  it('carries the residence\'s name on its one sign, facing the street, above the wall', () => {
    expect(r.signs).toHaveLength(1);
    expect(r.signs[0].text).toBe('RÉSIDENCE DE NGOR');
    expect(r.signs[0].y).toBeGreaterThan(3);                                                      // over the 2.4 m wall
    expect(r.signs[0].z).toBeGreaterThan(ngorSite.rect.z1 - E - 0.5);
    expect(r.signs[0].z).toBeLessThan(ngorSite.rect.z1);
  });
  it('is a lobby door and a canopy behind the gate, a balcony on each floor above the first, a roof terrace under a pergola', () => {
    const ps = planSite(ngorSite), t = drawSite(ps, v), tris = trianglesOf(t.kit, ps), L = (i: number) => GROUND + i * STOREY;
    const balconies = (f: number, zMax = 5) => topQuads(tris, L(f)).filter(q => q[2] > 2.5 && q[3] < zMax);
    expect(balconies(1, 8.5).length).toBe(2);                                                      // the first floor's long terrace and its deeper canopy over the lobby
    expect(balconies(2)).toHaveLength(1);                                                          // one balcony on the second floor
    expect(topQuads(tris, L(3)).some(q => q[2] < -5 && q[3] > 4)).toBe(true);                       // the top floor's terrace slab reaches out past the set-back glass
    const slat = (q: Tri) => q.batch === 'plain' && [q.a, q.b, q.c].every(p => p[1] > L(3) + 2.9 && p[1] < L(3) + 3.1 && p[0] > -8.6 && p[0] < -3 && p[2] > 1.2 && p[2] < 4.2);
    expect(tris.filter(slat).length).toBeGreaterThan(10);                                          // the pergola's slats over the terrace's street corner
    const door = tris.filter(q => q.batch === 'plain' && [q.a, q.b, q.c].every(p => Math.abs(p[0]) < 0.9 && p[2] > 6 && p[2] < 6.5 && p[1] < 3));
    expect(door.length).toBeGreaterThan(0);                                                        // the front door's leaf at the lobby's front
  });
});

describe('nothing is built outside any residence\'s wall', () => {
  for (const v of VARIANTS) for (const storeys of [4, 6]) it(`${v.id}, ${storeys} storeys: every face inside the site but the gate's pillar caps (16 cm) and the planting`, () => {
    const proto = SITES.find(s => s.kind === 'residence' && sizeOf(s) === v.size)!, ps = planSite(proto, { storeys }), t = drawSite(ps, v), { w, d } = extentOf(ps);
    let m = 0, plants = 0;
    for (const tr of trianglesOf(t.kit, ps)) for (const q of [tr.a, tr.b, tr.c]) {
      const o = Math.max(q[2] - E, E - d - q[2], Math.abs(q[0]) - w / 2);
      if (tr.batch === 'leaves' || tr.batch === 'trunks') plants = Math.max(plants, o); else m = Math.max(m, o);
    }
    expect(m).toBeLessThanOrEqual(0.17); expect(plants).toBeLessThanOrEqual(0.9);
  });
});

describe('the stacked residence (Les Alizés)', () => {
  const v = variantsFor('residence', 'M').find(x => x.id === 'residence-stack')!, base = SITES.find(s => s.name === 'RÉSIDENCE LES ALIZÉS')!;
  it('has its balconies on two bays out of three, the bay without moving one bay over from one floor to the next', () => {
    const gaps = (f: number) => { const have = new Set(stackBalconyRuns(f).flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))); return [1, 2, 3, 4, 5, 6, 7].filter(b => !have.has(b)); };
    for (let f = 1; f <= 5; f++) {
      const g = gaps(f);
      expect(g.length, `floor ${f}`).toBeGreaterThanOrEqual(2);
      expect(g.length, `floor ${f}`).toBeLessThanOrEqual(3);
      for (const b of g) expect(gaps(f + 1).includes(b), `the gap of bay ${b} moves`).toBe(false);
    }
    // the gap bays climb to the left: every floor's gaps are the floor below's, one bay lower (and wrapped by 3)
    for (let f = 1; f <= 4; f++) for (const b of gaps(f)) expect([b - 1, b + 2].some(q => gaps(f + 1).includes(q))).toBe(true);
  });
  it('draws exactly the balcony slabs those runs say, on every floor but the ground floor and the set-back top floor', () => {
    const ps = planSite(base, { storeys: 6 }), t = drawSite(ps, v), tris = trianglesOf(t.kit, ps), L = (i: number) => GROUND + i * STOREY;
    for (let f = 1; f <= 4; f++) {
      const quads = topQuads(tris, L(f)).filter(q => q[2] > 3 && q[3] < 5.2);
      expect(quads.length, `floor ${f}`).toBe(stackBalconyRuns(f).length);
    }
    expect(topQuads(tris, L(0)).filter(q => q[2] > 3 && q[3] < 5.2)).toHaveLength(0);          // the ground floor has none: it is the parking court
  });
  it('stands on pilotis over an open court: the court\'s middle is free, the posts are solid, the gate\'s axis leads in', () => {
    const t = drawSite(planSite(base), v), cs = t.colliders;
    const ps = planSite(base);
    expect(solidPlan(cs, ps, 0, 0)).toBe(false); expect(solidPlan(cs, ps, -8, -5)).toBe(false); expect(solidPlan(cs, ps, 0, 8)).toBe(false);
    expect(cs.filter(c => c.x1 - c.x0 < 0.6 && c.z1 - c.z0 < 0.6 && c.h > 3).length).toBeGreaterThanOrEqual(12);   // the pilotis
    expect(solidPlan(cs, planSite(base), 0, 10.8, 2)).toBe(true);                                  // the shut gate
  });
  it('has its one sign with the name, low and legible in front of the building, and a lobby door', () => {
    const t = drawSite(planSite(base), v);
    expect(t.signs).toHaveLength(1); expect(t.signs[0].text).toBe('RÉSIDENCE LES ALIZÉS'); expect(t.signs[0].w).toBeGreaterThan(5);
  });
});

describe('the louvred residence (Kër Salam, Les Cormorans)', () => {
  const v = variantsFor('residence', 'M').find(x => x.id === 'residence-screen')!, base = SITES.find(s => s.name === 'RÉSIDENCE KËR SALAM')!;
  it('closes the even bays with blades on most floors and the odd bays on one, so every column is dappled', () => {
    for (let b = 0; b < 9; b++) {
      const col = [1, 2, 3, 4, 5].map(f => screenClosed(b, f));
      expect(col.some(Boolean) && col.some(c => !c), `bay ${b}`).toBe(true);
      expect(col.filter(Boolean).length > 2, `bay ${b} even`).toBe(b % 2 === 0);
    }
  });
  it('opens exactly the loggias the pattern leaves open: a pane behind the guard on each', () => {
    const ps = planSite(base, { storeys: 6 }), t = drawSite(ps, v), tris = trianglesOf(t.kit, ps), L = (i: number) => GROUND + i * STOREY;
    const panes = (f: number) => tris.filter(q => q.batch === 'glass' && [q.a, q.b, q.c].every(p => Math.abs(p[2] - 1.43) < 1e-3 && p[1] >= L(f) && p[1] <= L(f) + 2.8)).length / 2;
    for (let f = 1; f <= 5; f++) { const open = Array.from({ length: 9 }, (_, b) => b).filter(b => !screenClosed(b, f) && !(LOBBY_BAYS.includes(b) && f === 1)).length; expect(panes(f), `floor ${f}`).toBe(open); }
  });
  it('has a two-storey glass lobby in front of the middle bays with its door under a canopy, the name above the glass, and a crown pergola', () => {
    const t = drawSite(planSite(base), v), tris = trianglesOf(t.kit, planSite(base));
    expect(t.signs).toHaveLength(1); expect(t.signs[0].y).toBeGreaterThan(5);
    const ys = tris.filter(q => q.batch === 'plain').flatMap(q => [q.a[1], q.b[1], q.c[1]]);
    expect(Math.max(...ys)).toBeGreaterThan(GROUND + 6 * STOREY + 2.5);                           // the pergola over the roof
    expect(t.colliders.some(c => c.x0 < -6 && c.x1 > 6 && c.h >= 6)).toBe(true);                // the lobby's volume
  });
});

describe('the courtyard complex (Jardins de Ngor)', () => {
  const v = variantsFor('residence', 'L')[0], base = SITES.find(s => s.name === 'RÉSIDENCE JARDINS DE NGOR')!;
  it('is four wings round a courtyard, pierced by a porte-cochère on the gate\'s centre line', () => {
    const ps = planSite(base), t = drawSite(ps, v), cs = t.colliders;
    for (const z of [5.5, 3, 0, -2.5]) expect(solidPlan(cs, ps, 0, z), `passage at z ${z}`).toBe(false);   // the passage, the wing's depth
    for (const x of [-8, 8]) expect(solidPlan(cs, ps, x, 3, 3), `street wing at x ${x}`).toBe(true);
    expect(solidPlan(cs, ps, 0, -10)).toBe(false);                                                 // the courtyard itself is open …
    for (const [x, z] of [[-15, -12], [15, -12], [0, -27]]) expect(solidPlan(cs, ps, x, z, 10), `wing at ${x}, ${z}`).toBe(true);   // … the other three wings are not
    expect(solidPlan(cs, ps, 0, 10.8, 2)).toBe(true);                                              // the gate, in line with the passage
  });
  it('has its pool in the courtyard, its name over the passage, and one sign', () => {
    const ps = planSite(base), t = drawSite(ps, v), tris = trianglesOf(t.kit, ps);
    expect(tris.filter(q => q.batch === 'water').length).toBe(2);
    expect(t.signs).toHaveLength(1); expect(t.signs[0].text).toBe('RÉSIDENCE JARDINS DE NGOR'); expect(Math.abs(t.signs[0].x)).toBeLessThan(0.5);
    const w = tris.filter(q => q.batch === 'water')[0], zc = (w.a[2] + w.b[2] + w.c[2]) / 3, xc = (w.a[0] + w.b[0] + w.c[0]) / 3;
    expect(zc).toBeLessThan(-3); expect(zc).toBeGreaterThan(-22); expect(Math.abs(xc)).toBeLessThan(6.5);
  });
  it('steps its courtyard terraces back a floor at a time (the upper floors are set back from the court)', () => {
    const ps = planSite(base, { storeys: 5 }), t = drawSite(ps, v), tris = trianglesOf(t.kit, ps), L = (i: number) => GROUND + i * STOREY;
    // the street wing's terrace slab at floor f reaches (toward −z) to the courtyard's edge (z −3) plus the terrace, less the steps
    const edge = (f: number) => Math.min(...topQuads(tris, L(f)).filter(q => q[0] < -18 && q[1] > 18).map(q => q[2]).filter(z => z > -12 && z < 0));
    for (let f = 1; f < 4; f++) expect(edge(f + 1)).toBeGreaterThan(edge(f) + 0.5);
  });
});

describe('every residence, every size of tower', () => {
  for (const v of VARIANTS) for (const storeys of [4, 5, 6, 7]) for (const [facing, mirror] of [['south', false], ['north', true]] as const) {
    it(`${v.id}, ${storeys} storeys, facing ${facing}${mirror ? ' mirrored' : ''}: every collider inside its site, tall enough, one sign with the name, the gate shut and open to the street, lighter on the low preset`, () => {
      const proto = SITES.find(s => s.kind === 'residence' && sizeOf(s) === v.size)!, s: Site = { ...proto, storeys, facing, mirror, rect: { ...proto.rect } };
      const r = drawSite(s, v), lite = drawSite(s, v, true);
      expect(r.colliders.length).toBeGreaterThan(0);
      for (const c of r.colliders) expect(within(c, s.rect), JSON.stringify(c)).toBe(true);
      expect(Math.max(...r.colliders.map(c => c.h))).toBeGreaterThanOrEqual(storeys * STOREY * 0.85);
      expect(r.signs).toHaveLength(1); expect(r.signs[0].text).toBe(s.name);
      expect(lite.tris).toBeLessThanOrEqual(r.tris * 0.9);
      expect(r.tris).toBeLessThanOrEqual(TRI_CAP.residence[v.size]! * 1.3);                        // the plan's storeys are within the cap (below); a taller tower costs a little more
      // the gate's apron: the street wall's gate span is solid, the apron before it open
      const f = siteFrame(s), g = f.p(0, E - 0.2), apron = f.p(0, E + 1.5);
      expect(solidAt(r.colliders, g.x, g.z, 2)).toBe(true); expect(solidAt(r.colliders, apron.x, apron.z)).toBe(false);
    });
  }
  it('stays within its triangle budget on the plan\'s own storeys, and the whole set is lighter on the low preset', () => {
    for (const s of residences) {
      const v = variantFor(s), r = drawSite(s, v), lite = drawSite(s, v, true);
      expect(r.tris, `${s.name}: ${r.tris}`).toBeLessThanOrEqual(TRI_CAP.residence[sizeOf(s)]!);
      expect(lite.tris, `${s.name}: lite ${lite.tris} / ${r.tris}`).toBeLessThanOrEqual(r.tris * 0.9);
    }
  });
  it('draws the whole plan\'s residences into the district without a stray draw call: the hub\'s batches only, one sign each', () => {
    const t = testKit(), dist = buildDistrict(t.kit, s => s.kind === 'residence');
    expect(dist.sites).toHaveLength(5);
    expect(t.signs).toHaveLength(5);
    expect(trisOf(t)).toBeLessThanOrEqual(3500 + 2 * 4500 + 4500 + 7000);
  });
  it('is the same from one drawing to the next (no random number: the plan draws the same street for everyone)', () => {
    const geo = (t: TestKit) => Object.values(t.batches).map(b => (b as unknown as { geos: { attributes: { position: { array: Float32Array } } }[] }).geos.map(g => Array.from(g.attributes.position.array).map(x => Math.round(x * 100)).join(',')).join(';')).join('|');
    for (const s of residences) { const a = drawSite(s, variantFor(s)), b = drawSite(s, variantFor(s)); expect(geo(a.kit) === geo(b.kit), s.name).toBe(true); }
  });
  it('wears every palette: the colours come from the site\'s palette, never a fixed one (no crash, same triangles)', () => {
    for (const pal of ['ivory', 'sand', 'greige', 'oak', 'terracotta', 'azur'] as const) for (const s of residences) {
      const v = variantFor(s), a = drawSite({ ...s, palette: pal }, v), b = drawSite(s, v);
      expect(a.tris).toBe(b.tris);
    }
  });
});
