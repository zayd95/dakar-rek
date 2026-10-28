import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { drawSite, testKit, trisOf, type TestKit } from './helpers/siteCost';
import { colliderInPlan, toPlan } from './helpers/designChecks';
import { BLK, HALF, PITCH, ROAD } from '../src/world/builder';
import { E, GROUND, LIFE_CAP, STOREY, TRI_CAP, extentOf, siteDraw, siteFrame, sizeOf, type Site, type SiteDraw, type SiteLife } from '../src/world/almadies/contract';
import { SITES } from '../src/world/almadies/plan';
import { buildDistrict, lifeInHub, variantOf, variantsFor } from '../src/world/almadies/district';
import { VARIANTS } from '../src/world/almadies/residences';
import { infoOf, lastSections } from '../src/world/almadies/residences.kit';
import { stackBalconyRuns } from '../src/world/almadies/residences.stack';
import { LOBBY_BAYS, screenClosed } from '../src/world/almadies/residences.screen';
import type { Collider } from '../src/world/types';

/**
 * LD2.0-E lane E-R: the residences' designs (src/world/almadies/residences.*.ts), open to the street (the owner, 27 Oct: « I don't want them in isolated
 * areas, they're part of what makes the city »): the registry the plan asks for; the Ngor residence on its lot (the gate at the lot's centre on the street
 * edge, the estate's door, entry and sale board on the pavement outside it free, nothing built beyond the edge); on every design a walk-in opening in the
 * street railing, a lobby and its door, street units (a café, a shop) with awnings and tables, the way from the pavement to every door walked by a body's
 * circle; the designs' own rhythms (the stacked residence's balconies climbing the façade, the louvred one's dappled bays, the courtyard's passage); the
 * budgets; and every collider inside its site for 4 to 7 storeys, on both facings, mirrored or not.
 */
stubCanvas();
const residences = SITES.filter(s => s.kind === 'residence');
const siteNamed = (name: string) => SITES.find(s => s.name === name)!;
const ngorSite = siteNamed('RÉSIDENCE DE NGOR');
const R = 0.45;                                                                                    // a body's circle (m)
const within = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;
const solidAt = (cs: Collider[], x: number, z: number, hMin = 0) => cs.some(c => c.h >= hMin && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
/** A plan point (+z toward the street) of a site is solid: through the site's frame. */
const solidPlan = (cs: Collider[], s: Site, x: number, z: number, hMin = 0) => { const q = siteFrame(s).p(x, z); return solidAt(cs, q.x, q.z, hMin); };
const variantFor = (s: Site) => variantOf(s);
/** Every triangle a drawn site made, in the site's plan (the inverse of its frame: the real site, facing and mirror as the game draws it). */
interface Tri { a: [number, number, number]; b: [number, number, number]; c: [number, number, number]; batch: string }
function trianglesOf(t: TestKit, d: SiteDraw): Tri[] {
  const out: Tri[] = [];
  for (const [name, b] of Object.entries(t.batches)) {
    for (const g of (b as unknown as { geos: THREE.BufferGeometry[] }).geos) {
      const p = g.attributes.position as THREE.BufferAttribute, idx = g.index, n = idx ? idx.count : p.count;
      const at = (i: number): [number, number, number] => { const k = idx ? idx.getX(i) : i, q = toPlan(d, { x: p.getX(k), z: p.getZ(k) }); return [q.x, p.getY(k), q.z]; };
      for (let i = 0; i < n; i += 3) out.push({ a: at(i), b: at(i + 1), c: at(i + 2), batch: name });
    }
  }
  return out;
}
/** The top faces (horizontal quads) at height y: [x0, x1, z0, z1] (in the plan of a site that is not mirrored). */
function topQuads(tris: Tri[], y: number, batch = 'plain'): [number, number, number, number][] {
  const m = new Map<string, [number, number, number, number]>();
  for (const t of tris) if (t.batch === batch && [t.a, t.b, t.c].every(v => Math.abs(v[1] - y) < 1e-4)) {
    const cr = (t.b[2] - t.a[2]) * (t.c[0] - t.a[0]) - (t.b[0] - t.a[0]) * (t.c[2] - t.a[2]);
    if (cr <= 0) continue;
    const xs = [t.a[0], t.b[0], t.c[0]], zs = [t.a[2], t.b[2], t.c[2]], k = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] as [number, number, number, number];
    m.set(k.map(v => v.toFixed(2)).join(), k);
  }
  return [...m.values()];
}
/**
 * Where can a body's circle walk from a point on the pavement (plan x, `E + 1.6`)? A breadth-first search on a 0.3 m grid of the plan, a cell blocked when the circle
 * there would touch a collider of the design (anything taller than 0.3 m: the railing, the gate, tables, planters, cars, benches). `has(p, tol)`: a free cell reached
 * within `tol` m of the plan point.
 */
function walkMap(d: SiteDraw, colliders: Collider[], from: { x: number; z: number }) {
  const { w, d: depth } = extentOf(d.site), cs = colliders.filter(c => c.h > 0.3).map(c => { const q = colliderInPlan(d, c); return { x0: q.x - q.w / 2 - R, x1: q.x + q.w / 2 + R, z0: q.z - q.d / 2 - R, z1: q.z + q.d / 2 + R }; });
  const step = 0.3, x0 = -w / 2 - 0.6, z0 = E - depth - 0.6, nx = Math.ceil((w + 1.2) / step), nz = Math.ceil((depth + 0.6 + 3.2) / step);
  const cell = (x: number, z: number) => [Math.floor((x - x0) / step), Math.floor((z - z0) / step)] as const;
  const blocked = (i: number, j: number) => { const x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step; return cs.some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1); };
  const [si, sj] = cell(from.x, from.z), seen = new Uint8Array(nx * nz);
  if (!blocked(si, sj)) {
    const queue = [si + sj * nx]; seen[si + sj * nx] = 1;
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h] % nx, j = Math.floor(queue[h] / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz || seen[a + b * nx] || blocked(a, b)) continue;
        seen[a + b * nx] = 1; queue.push(a + b * nx);
      }
    }
  }
  return { has(p: { x: number; z: number }, tol = 0.35) {
    const [ci, cj] = cell(p.x, p.z), n = Math.ceil(tol / step) + 1;
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      if (i < 0 || j < 0 || i >= nx || j >= nz || !seen[i + j * nx]) continue;
      if (Math.hypot(x0 + (i + 0.5) * step - p.x, z0 + (j + 0.5) * step - p.z) <= tol + step / 2) return true;
    }
    return false;
  } };
}
const reachable = (d: SiteDraw, colliders: Collider[], from: { x: number; z: number }, to: { x: number; z: number }) => walkMap(d, colliders, from).has(to);

describe('the registry the plan asks for', () => {
  it('has the S list [ngor], the M list [stack, screen], the L list [courtyard], in that order', () => {
    expect(variantsFor('residence', 'S').map(v => v.id)).toEqual(['residence-ngor']);
    expect(variantsFor('residence', 'M').map(v => v.id)).toEqual(['residence-stack', 'residence-screen']);
    expect(variantsFor('residence', 'L').map(v => v.id)).toEqual(['residence-courtyard']);
    expect(VARIANTS).toHaveLength(4);
    for (const v of VARIANTS) expect(v.name.length, v.id).toBeGreaterThan(3);
  });
  it('wears each design where the plan puts it: the Ngor residence S, Les Alizés the stacked one, Kër Salam and Les Cormorans the louvred one, Jardins de Ngor the courtyard', () => {
    const id = (name: string) => variantFor(siteNamed(name)).id;
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
    expect([door, entry, board].map(q => [q.x, q.z])).toEqual([[-42, -5.9], [-44.6, -5.1], [-39.7, -6.4]].map(q => [expect.closeTo(q[0], 6), expect.closeTo(q[1], 6)]));
  });
  it('shuts its bar gate at the lot\'s centre on the street edge, a low railing each side of it, and keeps the estate\'s door, board and marker on the pavement outside it free', () => {
    expect(solidAt(r.colliders, gate.x, gate.z, 2)).toBe(true);                                  // the shut gate, in the street edge
    const rail = r.colliders.filter(c => c.z1 > gate.z && c.z0 < gate.z && c.h < 2);              // the railing either side of it: a low collider, not a wall
    expect(rail.length).toBeGreaterThanOrEqual(2);
    for (const c of rail) expect(c.h, 'a railing\'s height').toBeLessThanOrEqual(1.6);
    for (const q of [door, board, entry, { x: door.x + 0.7, z: door.z }, { x: door.x - 0.7, z: door.z }]) expect(solidAt(r.colliders, q.x, q.z), `${q.x}, ${q.z}`).toBe(false);
    for (const c of r.colliders) expect(c.z1, JSON.stringify(c)).toBeLessThanOrEqual(ngorSite.rect.z1 + 1e-6);   // nothing solid beyond the edge
  });
  it('carries the residence\'s name on its one sign, facing the street, over the first floor\'s terrace', () => {
    expect(r.signs).toHaveLength(1);
    expect(r.signs[0].text).toBe('RÉSIDENCE DE NGOR');
    expect(r.signs[0].y).toBeGreaterThan(3);
    expect(r.signs[0].z).toBeGreaterThan(ngorSite.rect.z1 - E - 0.5);
    expect(r.signs[0].z).toBeLessThan(ngorSite.rect.z1);
  });
  it('is a lobby door under a canopy, a balcony on each floor above the first, a roof terrace under a pergola', () => {
    const tris = trianglesOf(r.kit, r.draw), L = (i: number) => GROUND + i * STOREY, cx = infoOf(r.draw).doors.find(q => q.kind === 'lobby')!.x;
    const balconies = (f: number, zMax = 5) => topQuads(tris, L(f)).filter(q => q[2] > 2.5 && q[3] < zMax);
    expect(balconies(1, 8.5).length).toBe(2);                                                      // the first floor's long terrace and its deeper canopy over the lobby
    expect(balconies(2)).toHaveLength(1);                                                          // one balcony on the second floor
    expect(topQuads(tris, L(3)).some(q => q[2] < -5 && q[3] > 4)).toBe(true);                       // the top floor's terrace slab reaches out past the set-back glass
    const slat = (q: Tri) => q.batch === 'plain' && [q.a, q.b, q.c].every(p => p[1] > L(3) + 2.9 && p[1] < L(3) + 3.1 && p[0] > -8.6 && p[0] < -3 && p[2] > 1.2 && p[2] < 4.2);
    expect(tris.filter(slat).length).toBeGreaterThan(10);                                          // the pergola's slats over the terrace's street corner
    const leaf = tris.filter(q => q.batch === 'plain' && [q.a, q.b, q.c].every(p => Math.abs(p[0] - cx) < 0.9 && p[2] > 6 && p[2] < 6.5 && p[1] < 3));
    expect(leaf.length).toBeGreaterThan(0);                                                        // the front door's leaf at the lobby's front
  });
  it('has its lobby\'s glass and a café window with an awning on the road side, visible from the pavement beside the gate', () => {
    const info = infoOf(r.draw);
    expect(info.units.map(u => u.kind).sort()).toEqual(['cafe', 'cafe', 'lobby']);
    expect(info.units.filter(u => u.kind !== 'lobby').every(u => u.awning)).toBe(true);
    expect(info.tables).toBeGreaterThanOrEqual(1);
    expect(info.entries).toHaveLength(1);
    expect(Math.abs(info.entries[0].x)).toBeGreaterThan(3);                                         // the walk-in opening is beside the gate, not across it
  });
});

describe('open to the street: every residence', () => {
  for (const s of residences) it(`${s.name}: a walk-in opening in the street railing, nothing solid across it, a lobby, street units with awnings and tables, every door reachable from the pavement by a body's circle`, () => {
    const v = variantFor(s), t = drawSite(s, v), info = infoOf(t.draw), cs = t.colliders, plan = t.colliders.map(c => colliderInPlan(t.draw, c));
    expect(info.entries.length).toBeGreaterThanOrEqual(1);
    for (const e of info.entries) {
      expect(e.w).toBeGreaterThanOrEqual(3.2); expect(e.w).toBeLessThanOrEqual(5.6);
      const across = plan.filter(c => c.z > E - 0.6 && c.z < E + 0.2 && c.d < 0.8 && c.x + c.w / 2 > e.x - e.w / 2 + 0.2 && c.x - c.w / 2 < e.x + e.w / 2 - 0.2);
      expect(across, `nothing solid across the opening at x ${e.x}`).toHaveLength(0);
      for (const dz of [0.4, -0.4, -1.5]) expect(solidPlan(cs, s, e.x, E + dz), `the opening at x ${e.x}, z ${E + dz}`).toBe(false);
    }
    // a railing, not a wall, along the street edge elsewhere
    const streetEdge = plan.filter(c => c.z > E - 0.5 && c.d < 0.5 && c.h !== 2.3 && c.w > 1);
    expect(streetEdge.length).toBeGreaterThan(0);
    for (const c of streetEdge) expect(c.h, 'the street edge keeps a railing\'s height').toBeLessThanOrEqual(1.6);
    // the lobby and at least one café or shop with an awning, a few tables
    expect(info.units.some(u => u.kind === 'lobby')).toBe(true);
    const shops = info.units.filter(u => u.kind !== 'lobby');
    expect(shops.length).toBeGreaterThanOrEqual(1); expect(shops.every(u => u.awning)).toBe(true);
    expect(info.tables).toBeGreaterThanOrEqual(1);
    // the glazing of the lobby and the units is among the windows that glow at night (the lit batch)
    expect(t.kit.batches.glass.triangles(), 'lit panes').toBeGreaterThanOrEqual(2 * (1 + shops.length));
    // every door the street walk reaches: from the pavement in front of an opening, through it, to a point a body stands at before the door
    expect(info.doors.length).toBeGreaterThanOrEqual(1 + (shops.length ? 1 : 0));
    for (const door of info.doors) {
      const reach = info.entries.some(e => reachable(t.draw, cs, { x: e.x, z: E + 1.6 }, door.stand));
      expect(reach, `${door.kind} door at plan (${door.x}, ${door.z}) from the pavement`).toBe(true);
    }
    // … and the shut gate is solid across its whole span, a railing's height either side of it
    const gate = plan.find(c => c.h === 2.3)!;
    expect(gate).toBeTruthy();
    for (const dx of [-1.8, 0, 1.8]) expect(solidPlan(cs, s, gate.x + dx, E - 0.2, 2), `the gate at ${dx}`).toBe(true);
  });
  it('a body stands where the pavement\'s lobby opening leads: the Ngor lobby door is a few steps behind the railing, clear of the gate', () => {
    const t = drawSite(ngorSite, variantFor(ngorSite)), info = infoOf(t.draw), lobby = info.doors.find(d => d.kind === 'lobby')!;
    expect(lobby.stand.z).toBeLessThan(E - 3); expect(lobby.stand.z).toBeGreaterThan(E - 6);
    expect(Math.abs(lobby.x - info.entries[0].x)).toBeLessThan(0.5);                                  // the door is in line with the opening
    expect(reachable(t.draw, t.colliders, { x: info.entries[0].x, z: E + 1.6 }, lobby.stand)).toBe(true);
  });
});

describe('nothing is built outside any residence\'s edge', () => {
  for (const s of residences) for (const storeys of [4, 6]) it(`${s.name}, ${storeys} storeys: every face inside the site but the planting (a palm's fronds)`, () => {
    const v = variantFor(s), t = drawSite({ ...s, storeys }, v), { w, d } = extentOf(s);
    let m = 0, plants = 0;
    for (const tr of trianglesOf(t.kit, t.draw)) for (const q of [tr.a, tr.b, tr.c]) {
      const o = Math.max(q[2] - E, E - d - q[2], Math.abs(q[0]) - w / 2);
      if (tr.batch === 'leaves' || tr.batch === 'trunks') plants = Math.max(plants, o); else m = Math.max(m, o);
    }
    expect(m, 'the building, the railing, the signs').toBeLessThanOrEqual(0.2); expect(plants, 'the planting').toBeLessThanOrEqual(0.9);
  });
});

describe('the stacked residence (Les Alizés)', () => {
  const v = variantsFor('residence', 'M').find(x => x.id === 'residence-stack')!, base = siteNamed('RÉSIDENCE LES ALIZÉS');
  it('has its balconies on two bays out of three, the bay without moving one bay over from one floor to the next', () => {
    const gaps = (f: number) => { const have = new Set(stackBalconyRuns(f).flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))); return [1, 2, 3, 4, 5, 6, 7].filter(b => !have.has(b)); };
    for (let f = 1; f <= 5; f++) {
      const g = gaps(f);
      expect(g.length, `floor ${f}`).toBeGreaterThanOrEqual(2);
      expect(g.length, `floor ${f}`).toBeLessThanOrEqual(3);
      for (const b of g) expect(gaps(f + 1).includes(b), `the gap of bay ${b} moves`).toBe(false);
    }
    for (let f = 1; f <= 4; f++) for (const b of gaps(f)) expect([b - 1, b + 2].some(q => gaps(f + 1).includes(q))).toBe(true);
  });
  it('draws exactly the balcony slabs those runs say, on every floor but the ground floor and the set-back top floor', () => {
    const t = drawSite({ ...base, storeys: 6 }, v), tris = trianglesOf(t.kit, t.draw), L = (i: number) => GROUND + i * STOREY;
    for (let f = 1; f <= 4; f++) expect(topQuads(tris, L(f)).filter(q => q[2] > 3 && q[3] < 5.2).length, `floor ${f}`).toBe(stackBalconyRuns(f).length);
    expect(topQuads(tris, L(0)).filter(q => q[2] > 3 && q[3] < 5.2)).toHaveLength(0);          // the ground floor has none: it is the parking court
  });
  it('stands on pilotis over an open court, with a café at the west end and a shop beside the lobby on the street, a café window on the end toward the road', () => {
    const t = drawSite(base, v), cs = t.colliders, info = infoOf(t.draw);
    expect(solidPlan(cs, base, 0, 0)).toBe(false); expect(solidPlan(cs, base, -8, -5)).toBe(false); expect(solidPlan(cs, base, 0, 8)).toBe(false);
    expect(cs.filter(c => c.x1 - c.x0 < 0.6 && c.z1 - c.z0 < 0.6 && c.h > 3).length).toBeGreaterThanOrEqual(12);   // the pilotis
    expect(info.units.filter(u => u.face === 'street' && u.kind === 'cafe')).toHaveLength(1);
    expect(info.units.filter(u => u.face === 'street' && u.kind === 'shop')).toHaveLength(1);
    expect(info.units.filter(u => u.face !== 'street' && u.kind !== 'lobby').length).toBeGreaterThanOrEqual(2);   // both ends toward the roads
    expect(info.tables).toBeGreaterThanOrEqual(2);
  });
  it('has its one sign with the name, over the walk-in opening, and its lobby door in line with the opening', () => {
    const t = drawSite(base, v), info = infoOf(t.draw), lobby = info.doors.find(d => d.kind === 'lobby')!, q = siteFrame(base).p(info.entries[0].x, E);
    expect(t.signs).toHaveLength(1); expect(t.signs[0].text).toBe('RÉSIDENCE LES ALIZÉS'); expect(t.signs[0].w).toBeGreaterThan(5);
    expect(Math.hypot(t.signs[0].x - q.x, t.signs[0].z - q.z)).toBeLessThan(0.8); expect(t.signs[0].y).toBeGreaterThan(3);
    expect(Math.abs(lobby.x - info.entries[0].x)).toBeLessThan(0.1);
  });
});

describe('the louvred residence (Kër Salam, Les Cormorans)', () => {
  const v = variantsFor('residence', 'M').find(x => x.id === 'residence-screen')!, base = siteNamed('RÉSIDENCE KËR SALAM');
  it('closes the even bays with blades on most floors and the odd bays on one, so every column is dappled', () => {
    for (let b = 0; b < 9; b++) {
      const col = [1, 2, 3, 4, 5].map(f => screenClosed(b, f));
      expect(col.some(Boolean) && col.some(c => !c), `bay ${b}`).toBe(true);
      expect(col.filter(Boolean).length > 2, `bay ${b} even`).toBe(b % 2 === 0);
    }
  });
  it('opens exactly the loggias the pattern leaves open: a pane behind the guard on each (lit or dark: both batches are counted)', () => {
    const t = drawSite({ ...base, storeys: 6 }, v), tris = trianglesOf(t.kit, t.draw), L = (i: number) => GROUND + i * STOREY;
    const panes = (f: number) => tris.filter(q => (q.batch === 'glass' || q.batch === 'glassDark') && [q.a, q.b, q.c].every(p => Math.abs(p[2] - 1.43) < 1e-3 && p[1] >= L(f) && p[1] <= L(f) + 2.8)).length / 2;
    for (let f = 1; f <= 5; f++) { const open = Array.from({ length: 9 }, (_, b) => b).filter(b => !screenClosed(b, f) && !(LOBBY_BAYS.includes(b) && f === 1)).length; expect(panes(f), `floor ${f}`).toBe(open); }
  });
  it('has a two-storey glass lobby in front of the middle bays with its door under a canopy, the name above the glass, a café, two shops and a crown pergola', () => {
    const t = drawSite(base, v), tris = trianglesOf(t.kit, t.draw), info = infoOf(t.draw);
    expect(t.signs).toHaveLength(1); expect(t.signs[0].y).toBeGreaterThan(5);
    expect(Math.max(...tris.filter(q => q.batch === 'plain').flatMap(q => [q.a[1], q.b[1], q.c[1]]))).toBeGreaterThan(GROUND + 6 * STOREY + 2.5);   // the pergola over the roof
    expect(t.colliders.some(c => { const q = colliderInPlan(t.draw, c); return q.w > 12 && q.h >= 6 && q.z < 5 && q.z > 1; })).toBe(true);        // the lobby's volume
    expect(info.units.filter(u => u.face === 'street' && u.kind !== 'lobby')).toHaveLength(3);
  });
});

describe('the courtyard complex (Jardins de Ngor)', () => {
  const v = variantsFor('residence', 'L')[0], base = siteNamed('RÉSIDENCE JARDINS DE NGOR');
  it('is four wings round a courtyard, pierced by an open porte-cochère from the pavement to the courtyard on the street\'s centre line, the car gate at the side', () => {
    const t = drawSite(base, v), cs = t.colliders, plan = cs.map(c => colliderInPlan(t.draw, c));
    for (const z of [10.8, 9, 6, 3, 0, -2.5]) expect(solidPlan(cs, base, 0, z), `passage at z ${z}`).toBe(false);   // the opening, the forecourt, the passage through the wing
    for (const x of [-8, 8]) expect(solidPlan(cs, base, x, 3, 3), `street wing at x ${x}`).toBe(true);
    expect(solidPlan(cs, base, 0, -10)).toBe(false);                                                 // the courtyard itself is open …
    for (const [x, z] of [[-15, -12], [15, -12], [0, -27]]) expect(solidPlan(cs, base, x, z, 10), `wing at ${x}, ${z}`).toBe(true);   // … the other three wings are not
    const gate = plan.find(c => c.h === 2.3)!;
    expect(gate.x).toBeGreaterThan(15);                                                              // the car gate stands at the east end of the street edge
    expect(reachable(t.draw, cs, { x: 0, z: E + 1.6 }, { x: 0, z: -9 })).toBe(true);                 // a body walks from the pavement through the passage into the courtyard
  });
  it('has its pool in the courtyard, its name over the passage, one sign, a café and a shop beside the passage and on the road sides', () => {
    const t = drawSite(base, v), tris = trianglesOf(t.kit, t.draw), info = infoOf(t.draw);
    expect(tris.filter(q => q.batch === 'water').length).toBe(2);
    expect(t.signs).toHaveLength(1); expect(t.signs[0].text).toBe('RÉSIDENCE JARDINS DE NGOR');
    const q = siteFrame(base).p(0, 6.97); expect(Math.hypot(t.signs[0].x - q.x, t.signs[0].z - q.z)).toBeLessThan(1);
    const w = tris.filter(q2 => q2.batch === 'water')[0], zc = (w.a[2] + w.b[2] + w.c[2]) / 3, xc = (w.a[0] + w.b[0] + w.c[0]) / 3;
    expect(zc).toBeLessThan(-3); expect(zc).toBeGreaterThan(-22); expect(Math.abs(xc)).toBeLessThan(6.5);
    expect(info.units.filter(u => u.face === 'street' && u.kind !== 'lobby')).toHaveLength(2);
    expect(info.units.filter(u => (u.face === 'left' || u.face === 'right') && u.kind !== 'lobby')).toHaveLength(2);        // a window on each road side, not a blank wall
  });
  it('steps its courtyard terraces back a floor at a time (the upper floors are set back from the court)', () => {
    const t = drawSite({ ...base, storeys: 5 }, v), tris = trianglesOf(t.kit, t.draw), L = (i: number) => GROUND + i * STOREY;
    const edge = (f: number) => Math.min(...topQuads(tris, L(f)).filter(q => q[0] < -18 && q[1] > 18).map(q => q[2]).filter(z => z > -12 && z < 0));
    for (let f = 1; f < 4; f++) expect(edge(f + 1)).toBeGreaterThan(edge(f) + 0.5);
  });
});

describe('every residence, every size of tower', () => {
  for (const v of VARIANTS) for (const storeys of [4, 5, 6, 7]) for (const [facing, mirror] of [['south', false], ['north', true]] as const) {
    it(`${v.id}, ${storeys} storeys, facing ${facing}${mirror ? ' mirrored' : ''}: every collider inside its site, tall enough, one sign with the name, the gate shut, lighter on the low preset`, () => {
      const proto = SITES.find(s => s.kind === 'residence' && sizeOf(s) === v.size)!, s: Site = { ...proto, storeys, facing, mirror, rect: { ...proto.rect } };
      const r = drawSite(s, v), lite = drawSite(s, v, true);
      expect(r.colliders.length).toBeGreaterThan(0);
      for (const c of r.colliders) expect(within(c, s.rect), JSON.stringify(c)).toBe(true);
      expect(Math.max(...r.colliders.map(c => c.h))).toBeGreaterThanOrEqual(storeys * STOREY * 0.85);
      expect(r.signs).toHaveLength(1); expect(r.signs[0].text).toBe(s.name);
      expect(lite.tris).toBeLessThanOrEqual(r.tris * 0.9);
      expect(r.tris).toBeLessThanOrEqual(TRI_CAP.residence[v.size]! * 1.3);                        // the plan's storeys are within the cap (below); a taller tower costs a little more
      const gate = r.colliders.map(c => colliderInPlan(r.draw, c)).filter(c => c.h === 2.3);
      expect(gate, 'one shut gate').toHaveLength(1);
      expect(gate[0].z).toBeGreaterThan(E - 0.5); expect(gate[0].z).toBeLessThan(E + 0.1);
      expect(solidPlan(r.colliders, s, gate[0].x, E + 1.5), 'the apron before it is open').toBe(false);
    });
  }
  it('stays within its triangle budget on the plan\'s own storeys, and every one is lighter on the low preset', () => {
    for (const s of residences) {
      const v = variantFor(s), r = drawSite(s, v), sections = JSON.stringify(lastSections), lite = drawSite(s, v, true);
      expect(r.tris, `${s.name}: ${r.tris} (the design's own pieces by section: ${sections})`).toBeLessThanOrEqual(TRI_CAP.residence[sizeOf(s)]!);
      expect(lite.tris, `${s.name}: lite ${lite.tris} / ${r.tris}`).toBeLessThanOrEqual(r.tris * 0.9);
    }
  });
  it('draws the whole plan\'s residences into the district within their caps, without a stray draw call: the hub\'s batches only, one sign each', () => {
    const t = testKit(), dist = buildDistrict(t.kit, s => s.kind === 'residence');
    expect(dist.sites).toHaveLength(5);
    expect(t.signs).toHaveLength(5);
    expect(trisOf(t)).toBeLessThanOrEqual(residences.reduce((n, s) => n + TRI_CAP.residence[sizeOf(s)]!, 0));
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

/**
 * LD2.0-E round 3 (« several buildings look impressive from a distance but need more life at ground level »): what each residence puts out on its ground floor: café chairs
 * that are seats (two a table, facing it), customers already seated, a waiter at each café's door, a shopkeeper at each shop's, a doorman at each lobby's, parked cars and
 * scooters, benches, props on the pavement; every one inside its site, clear of the colliders, reachable from the pavement by a body's circle.
 */
describe('life at the ground level', () => {
  /** Draws a site and returns what it hands the hub: its life, in the plan. */
  const lifeOf = (s: Site, lite = false) => { const t = testKit(lite), d = siteDraw(t.kit, s), r = variantFor(s).build(d) ?? {}; return { t, d, life: (r.life ?? {}) as Required<SiteLife>, info: infoOf(d) }; };
  const kindsOf = (s: Site) => LIFE_CAP[s.kind];
  const sized = (c: { w: number; d: number }, a: number, b: number) => (Math.abs(c.w - a) < 0.05 && Math.abs(c.d - b) < 0.05) || (Math.abs(c.w - b) < 0.05 && Math.abs(c.d - a) < 0.05);
  const cars = (d: SiteDraw) => d.colliders.map(c => colliderInPlan(d, c)).filter(c => sized(c, 1.78, 4.25) || sized(c, 1.9, 4.7)).length;
  const scooters = (d: SiteDraw) => d.colliders.map(c => colliderInPlan(d, c)).filter(c => sized(c, 0.6, 1.9)).length;
  const minGap = (d: SiteDraw, x: number, z: number) => Math.min(...d.colliders.filter(c => c.h > 0.3).map(c => { const q = colliderInPlan(d, c); return Math.hypot(Math.max(Math.abs(x - q.x) - q.w / 2, 0), Math.max(Math.abs(z - q.z) - q.d / 2, 0)); }));
  const front = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)] as const;
  const tableChairs = (s: Site) => infoOf(lifeOf(s).d).tables * 2;

  for (const s of residences) describe(s.name!, () => {
    const L = lifeOf(s), { w, d: depth } = extentOf(s), life = L.life, info = L.info;
    it('puts out chairs at its café tables (two a table, facing it), customers already seated, within the humanoid and seat caps', () => {
      const chairs = life.seats.filter(x => x.kind === 'chair'), cap = kindsOf(s);
      expect(info.tables, 'tables').toBeGreaterThanOrEqual(2); expect(chairs.length).toBe(info.tables * 2);
      expect(life.seats.length).toBeGreaterThanOrEqual(chairs.length); expect(life.seats.length).toBeLessThanOrEqual(cap.seats);
      expect(life.people.length).toBeGreaterThanOrEqual(sizeOf(s) === 'L' ? 4 : 3); expect(life.people.length).toBeLessThanOrEqual(cap.people);
      expect(life.people.filter(p => p.clip === 'Sit').length).toBeGreaterThanOrEqual(2);       // customers or residents sitting down
      expect(life.people.some(p => p.clip === 'Talk')).toBe(true);                               // a waiter, someone chatting
      expect(life.people.some(p => p.clip === 'Idle')).toBe(true);                               // a doorman, a shopkeeper
    });
    it('keeps every seat and every person inside the site, clear of the colliders, a chair facing its table at the height of a chair', () => {
      for (const q of [...life.seats, ...life.people]) { expect(Math.abs(q.x), `x ${q.x}`).toBeLessThanOrEqual(w / 2 - 0.3); expect(q.z, `z ${q.z}`).toBeLessThanOrEqual(E - 0.5); expect(q.z, `z ${q.z}`).toBeGreaterThanOrEqual(E - depth + 0.3); }
      for (const c of life.seats) {
        if (c.kind === 'bench') { expect(c.top).toBeGreaterThan(0.5); expect(c.top).toBeLessThan(0.62); continue; }
        expect(c.top).toBeGreaterThan(0.45); expect(c.top).toBeLessThan(0.6);
        expect(minGap(L.d, c.x, c.z), `chair at ${c.x}, ${c.z}`).toBeGreaterThanOrEqual(0.2);
        const t = c.table!, dist = Math.hypot(t.x - c.x, t.z - c.z), f = front(c.yaw);
        expect((f[0] * (t.x - c.x) + f[1] * (t.z - c.z)) / dist, 'the chair faces its table').toBeGreaterThan(0.99);
        expect(dist).toBeLessThan(0.9); expect(t.y).toBeGreaterThan(0.7); expect(t.y).toBeLessThan(0.95);
      }
      for (const p of life.people) if (p.clip !== 'Sit' && !p.y) expect(minGap(L.d, p.x, p.z), `${p.clip} person at ${p.x}, ${p.z}`).toBeGreaterThanOrEqual(0.3);
      // a seated person is on a seat, facing as it does, their feet 5 cm under the street's
      for (const p of life.people.filter(q => q.clip === 'Sit')) { const seat = life.seats.find(x => Math.hypot(x.x - p.x, x.z - p.z) < 0.05); expect(seat, `a seat under the sitter at ${p.x}, ${p.z}`).toBeTruthy(); expect(p.yaw).toBeCloseTo(seat!.yaw, 6); expect(p.y).toBeCloseTo(-0.05, 6); }
      // nobody stands in a walk-in opening
      for (const e of info.entries) for (const p of life.people) expect(!(Math.abs(p.x - e.x) < e.w / 2 && p.z > E - 1.2), `a person in the opening at x ${e.x}`).toBe(true);
    });
    it('can be reached from the pavement by a body\'s circle: the lobby door, every café and shop door, every seat (from behind or the side), every person on the street', () => {
      const entry = info.entries[0], map = walkMap(L.d, L.d.colliders, { x: entry.x, z: E + 1.6 });
      for (const door of info.doors) expect(map.has(door.stand), `${door.kind} door at ${door.x}`).toBe(true);
      for (const c of life.seats) {
        const f = front(c.yaw), px = f[1], pz = -f[0], at = (a: number, b: number) => ({ x: c.x + f[0] * a + px * b, z: c.z + f[1] * a + pz * b });
        const spots = c.kind === 'bench' ? [at(0.85, 0), at(-0.85, 0)] : [at(-0.8, 0), at(0, 0.85), at(0, -0.85)];
        expect(spots.some(q => map.has(q, 0.2)), `${c.kind} at ${c.x}, ${c.z}`).toBe(true);
      }
      for (const p of life.people.filter(q => q.y === undefined || q.y < 0)) expect(map.has(p, 1.3), `${p.clip} person at ${p.x}, ${p.z}`).toBe(true);
    });
    it('sets out its street life: parked things, props, menu boards, the doorman at the lobby door, a shopkeeper at each shop\'s door, a waiter at each café\'s', () => {
      const shops = info.units.filter(u => u.kind === 'shop' && u.face === 'street'), cafes = info.units.filter(u => u.kind === 'cafe' && u.face === 'street');
      expect(info.menus.length).toBeGreaterThanOrEqual(cafes.length);                            // a menu board at each café's awning
      expect(info.props.length).toBeGreaterThanOrEqual(shops.length);                            // buckets, crates, a newspaper rack at each shop's window
      const lobby = info.doors.find(q => q.kind === 'lobby')!;
      expect(life.people.some(p => p.clip === 'Idle' && Math.hypot(p.x - lobby.stand.x, p.z - lobby.stand.z) < 3.2), 'a doorman by the lobby door').toBe(true);
      for (const door of info.doors.filter(q => q.kind === 'unit')) expect(life.people.some(p => Math.hypot(p.x - door.x, p.z - door.stand.z) < 2.2 && p.clip !== 'Sit'), `somebody at the door at ${door.x}`).toBe(true);
      for (const m of info.menus) { expect(minGap(L.d, m.x, m.z), 'a menu board is not on a table').toBeGreaterThanOrEqual(0.2); expect(m.z).toBeLessThan(E - 0.8); }
      expect(cars(L.d) + scooters(L.d)).toBeGreaterThanOrEqual(2);                               // something parked
    });
    it('is the same on the low preset (the same seats and people), and from one drawing to the next', () => {
      const lite = lifeOf(s, true), again = lifeOf(s);
      expect(JSON.stringify(lite.life)).toBe(JSON.stringify(life)); expect(JSON.stringify(again.life)).toBe(JSON.stringify(life));
    });
    it('reaches the hub in the site\'s frame: every seat and person inside the site\'s rectangle, ids by site, the seated on a seat', () => {
      const h = lifeInHub(L.d, life), r = s.rect;
      expect(h.seats).toHaveLength(life.seats.length); expect(h.people).toHaveLength(life.people.length);
      expect(new Set(h.seats.map(x => x.id)).size).toBe(h.seats.length);
      for (const q of [...h.seats, ...h.people]) { expect(q.x).toBeGreaterThan(r.x0); expect(q.x).toBeLessThan(r.x1); expect(q.z).toBeGreaterThan(r.z0); expect(q.z).toBeLessThan(r.z1); }
      for (const p of h.people.filter(q => q.clip === 'Sit')) expect(h.seats.some(x => Math.hypot(x.x - p.x, x.z - p.z) < 0.05)).toBe(true);
      expect(tableChairs(s)).toBe(info.tables * 2);
    });
  });

  it('the Ngor residence: a car on its drive nose to the street, a scooter by the lobby, a resident on the bench, someone on the first floor\'s terrace, the lobby\'s doorman; the estate\'s door, entry and board stay free', () => {
    const L = lifeOf(ngorSite), cs = L.d.colliders.map(c => colliderInPlan(L.d, c)), car = cs.find(c => sized(c, 1.78, 4.25))!;
    expect(cars(L.d)).toBe(1); expect(scooters(L.d)).toBe(1);
    expect(car.x).toBeGreaterThan(-1.4); expect(car.x).toBeLessThan(3.4); expect(car.z).toBeGreaterThan(2.6); expect(car.z).toBeLessThan(8);   // on the drive between the gate and the garage
    expect(L.life.people.some(p => p.y === STOREY && p.clip === 'Idle')).toBe(true);                       // on the first floor's terrace, 3.4 m up
    expect(L.life.people.filter(p => p.clip === 'Sit')).toHaveLength(3);                                    // two customers and the resident
    const LOT = (BLK - 2) / 2, BM = (k: number) => -HALF + ROAD + k * PITCH, gate = { x: BM(1) + LOT / 2, z: BM(1) + LOT + 2 + LOT - 0.3 };
    const r = drawSite(ngorSite, variantFor(ngorSite));
    for (const q of [{ x: gate.x, z: gate.z + 1.4 }, { x: gate.x - 2.6, z: gate.z + 2.2 }, { x: gate.x + 2.3, z: gate.z + 0.9 }]) expect(solidAt(r.colliders, q.x, q.z)).toBe(false);
    const h = lifeInHub(L.d, L.life);
    for (const q of [...h.seats, ...h.people]) expect(q.z, 'nothing out on the pavement where the estate puts its board').toBeLessThan(ngorSite.rect.z1 - 0.3);
  });
  it('the stacked residence: three cars (an SUV among them) and two scooters under the block, a resident on the second floor\'s balcony, a shopkeeper with her props', () => {
    const L = lifeOf(siteNamed('RÉSIDENCE LES ALIZÉS'));
    expect(cars(L.d)).toBeGreaterThanOrEqual(3); expect(cars(L.d)).toBeLessThanOrEqual(4); expect(scooters(L.d)).toBe(2);
    expect(L.d.colliders.map(c => colliderInPlan(L.d, c)).some(c => sized(c, 1.9, 4.7))).toBe(true);
    for (const c of L.d.colliders.map(c2 => colliderInPlan(L.d, c2)).filter(c2 => sized(c2, 1.78, 4.25) || sized(c2, 1.9, 4.7))) { expect(c.z).toBeLessThan(0); expect(c.z).toBeGreaterThan(-8.2); }   // inside the court, behind the line of the pilotis
    expect(L.life.people.some(p => p.y === 2 * STOREY && p.clip === 'Talk')).toBe(true);
  });
  it('the louvred residences: scooters by the boutique, two shops with their props, a café with its tables', () => {
    for (const name of ['RÉSIDENCE KËR SALAM', 'RÉSIDENCE LES CORMORANS']) { const L = lifeOf(siteNamed(name)); expect(scooters(L.d)).toBe(2); expect(L.info.props.length).toBe(2); expect(L.info.menus.length).toBe(1); expect(L.life.seats.filter(x => x.kind === 'chair').length).toBe(4); }
  });
  it('the courtyard complex: cars along the car gate\'s side court, a bench with a seated resident in the courtyard, a couple talking by the pool, the concierge in the passage', () => {
    const L = lifeOf(siteNamed('RÉSIDENCE JARDINS DE NGOR')), plan = L.d.colliders.map(c => colliderInPlan(L.d, c));
    expect(cars(L.d)).toBe(2); expect(scooters(L.d)).toBe(1);
    for (const c of plan.filter(c2 => sized(c2, 1.78, 4.25) || sized(c2, 1.9, 4.7))) expect(c.x).toBeGreaterThan(19.5);                      // in the east side court
    const benchSeats = L.life.seats.filter(x => x.kind === 'bench' && x.z < 0);
    expect(benchSeats.length).toBe(4); expect(benchSeats.every(x => x.z < -3 && x.z > -22 && Math.abs(x.x) < 10)).toBe(true);                  // in the courtyard
    expect(L.life.people.some(p => p.clip === 'Sit' && benchSeats.some(x => Math.hypot(x.x - p.x, x.z - p.z) < 0.05))).toBe(true);
    expect(L.life.people.filter(p => p.clip === 'Talk' && p.z < -3).length).toBe(2);
    expect(L.life.people.some(p => p.clip === 'Idle' && p.x > -3 && p.x < 0 && p.z > 0 && p.z < 6)).toBe(true);                                // the concierge in the passage
  });
  it('reaches the real Almadies hub: the seats are in the hub\'s seats (ids by site), the people among its placed people, on both presets', async () => {
    const { buildHub } = await import('../src/world/builder');
    for (const lite of [false, true]) {
      const hub = buildHub('almadies', lite);
      for (const s of residences) {
        const L = lifeOf(s, lite), h = lifeInHub(L.d, L.life), mine = hub.seats.filter(x => x.id.startsWith(`${s.id}:seat:`));
        expect(mine.map(x => x.id), s.name).toEqual(h.seats.map(x => x.id));
        for (const x of h.seats) expect(mine.some(q => Math.abs(q.x - x.x) < 1e-6 && Math.abs(q.z - x.z) < 1e-6 && q.kind === x.kind && q.top === x.top && q.space === 'street' && q.occupant === null), `${s.name} seat ${x.id}`).toBe(true);
        for (const p of h.people) expect(hub.people.some(q => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6 && q.clip === p.clip && q.y === p.y), `${s.name} ${p.clip} at ${p.x}, ${p.z}`).toBe(true);
      }
    }
  }, 120_000);
  it('every residence stays within its triangle budget with its life, and lighter on the low preset', () => {
    for (const s of residences) { const r = drawSite(s, variantFor(s)), lite = drawSite(s, variantFor(s), true); expect(r.tris, s.name).toBeLessThanOrEqual(TRI_CAP.residence[sizeOf(s)]!); expect(lite.tris, s.name).toBeLessThanOrEqual(r.tris * 0.9); }
  });
});
