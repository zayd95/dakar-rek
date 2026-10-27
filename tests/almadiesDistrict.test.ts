import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubCanvas } from './hubstub';
import { digestHub, type HubDigest } from './helpers/lotDigest';
import { drawSite, testKit, trisOf } from './helpers/siteCost';
import { PITCH, BLK, ROAD, NB, HALF as BHALF } from '../src/world/builder';
import { E, GRID, HALF, STOREY, TRI_CAP, extentOf, siteFrame, sizeOf, type Site } from '../src/world/almadies/contract';
import { KEPT_LOTS, SITES, lotRect, siteOfLot } from '../src/world/almadies/plan';
import { REGISTRY, buildDistrict, variantOf, variantsFor } from '../src/world/almadies/district';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * LD2.0-E « The Almadies district » (docs/ld2/LD2_E.md): the plan covers the hub's free lots exactly once, every design stays inside its site, keeps
 * its budget, draws no random number, leaves the gate's apron open; and the rest of the Almadies (every street tree, palm, stall, collider, seat and
 * person, every other lot's primitive) is exactly where the villa branch's last commit (3ca9e39) drew it.
 */
stubCanvas();
const facade = vi.hoisted(() => ({ depth: 0 }));
vi.mock('../src/housing/villaFacade', async importOriginal => {
  const m = await importOriginal<typeof import('../src/housing/villaFacade')>();
  return { ...m, buildVillaFacade: (...a: Parameters<typeof m.buildVillaFacade>) => { facade.depth++; try { return m.buildVillaFacade(...a); } finally { facade.depth--; } } };
});
const fixture = JSON.parse(new TextDecoder().decode(readFileSync('tests/fixtures/almadiesOutsideDistrict.json'))) as { base: string; rects: { x0: number; x1: number; z0: number; z1: number }[]; full: HubDigest; lite: HubDigest };
const hubs: Partial<Record<'full' | 'lite', HubWorld>> = {};
const build = async (q: 'full' | 'lite') => { const { buildHub } = await import('../src/world/builder'); return (hubs[q] ??= buildHub('almadies', q === 'lite')); };
const within = (c: Collider, r: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) => c.x0 >= r.x0 - m && c.x1 <= r.x1 + m && c.z0 >= r.z0 - m && c.z1 <= r.z1 + m;

describe('the plan', () => {
  it('uses the hub\'s grid', () => {
    expect([GRID.pitch, GRID.blk, GRID.road, GRID.nb, HALF]).toEqual([PITCH, BLK, ROAD, NB, BHALF]);
    expect(GRID.lot * 2 + GRID.gap).toBe(BLK);
  });
  it('is 30 sites on the 41 free lots, each lot once, none of the kept ones', () => {
    expect(SITES).toHaveLength(30);
    const seen = new Map<string, string>();
    for (const s of SITES) for (const l of s.lots) {
      const key = `${s.block},${l}`;
      expect(seen.has(key), `${key} twice (${seen.get(key)} and ${s.id})`).toBe(false);
      seen.set(key, s.id);
    }
    expect(seen.size).toBe(41);
    const special = new Set(['2,0', '1,2', '2,2', '3,2', '0,2']);                                     // the port, the station, the mall, the square, Prestige Auto
    for (const [key] of seen) { const [i, j] = key.split(',').map(Number); expect(special.has(`${i},${j}`), key).toBe(false); }
    for (const [block, lots] of Object.entries(KEPT_LOTS)) for (const l of lots) expect(seen.has(`${block},${l}`), `${block} lot ${l}`).toBe(false);
    for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {                                        // every lot of every other block is the district's, bar the kept ones
      if (special.has(`${i},${j}`)) continue;
      for (let l = 0; l < 4; l++) if (!KEPT_LOTS[`${i},${j}`]?.includes(l)) expect(siteOfLot(i, j, l), `${i},${j} lot ${l}`).toBeDefined();
    }
  });
  it('has well-formed sites: 1, 2 (a row) or 4 lots, the rectangle their union, the street on the row\'s side, no overlap', () => {
    for (const s of SITES) {
      expect([1, 2, 4]).toContain(s.lots.length);
      if (s.lots.length === 2) expect(s.lots[1] >> 1).toBe(s.lots[0] >> 1);
      const rs = s.lots.map(l => lotRect(s.block[0], s.block[1], l));
      expect(s.rect).toEqual({ x0: Math.min(...rs.map(r => r.x0)), z0: Math.min(...rs.map(r => r.z0)), x1: Math.max(...rs.map(r => r.x1)), z1: Math.max(...rs.map(r => r.z1)) });
      const { w, d } = extentOf(s);
      expect([w, d]).toEqual(sizeOf(s) === 'S' ? [22, 22] : sizeOf(s) === 'M' ? [46, 22] : [46, 46]);
      if (s.lots.length < 4) expect(s.facing).toBe(s.lots[0] >> 1 ? 'south' : 'north');
      expect(sizeOf(s) === 'S' ? ['house', 'villa', 'residence'] : ['hotel', 'residence']).toContain(s.kind);
    }
    for (const a of SITES) for (const b of SITES) if (a !== b) expect(a.rect.x1 <= b.rect.x0 || b.rect.x1 <= a.rect.x0 || a.rect.z1 <= b.rect.z0 || b.rect.z1 <= a.rect.z0, `${a.id} / ${b.id}`).toBe(true);
  });
  it('gives the hotels and residences a name, the Ngor residence its lot and its gate (the estate\'s door and board stand outside it)', () => {
    for (const s of SITES) expect(!!s.name, s.id).toBe(s.kind === 'hotel' || s.kind === 'residence');
    const ngor = SITES.find(s => s.name === 'RÉSIDENCE DE NGOR')!;
    expect(ngor).toMatchObject({ id: 'almadies:1,1:2', kind: 'residence', gate: 'centre', facing: 'south', mirror: false });
    expect(sizeOf(ngor)).toBe('S');
    expect(ngor.rect).toEqual({ x0: -53, z0: -29, x1: -31, z1: -7 });                                  // the estate's residenceGate stands at x −42, z −7.3 (src/economy/estate.ts)
  });
  it('never puts the same design on neighbours of a block, and the designs it asks for exist', () => {
    const key = (s: Site) => `${s.kind}/${sizeOf(s)}`;
    const byBlock = new Map<string, Site[]>();
    for (const s of SITES) byBlock.set(s.block.join(), [...(byBlock.get(s.block.join()) ?? []), s]);
    for (const list of byBlock.values()) for (const a of list) for (const b of list) if (a !== b && key(a) === key(b)) expect(variantOf(a).id, `${a.id} / ${b.id}`).not.toBe(variantOf(b).id);
    for (const s of SITES) expect(variantsFor(s.kind, sizeOf(s)).length, `${s.id} (${key(s)})`).toBeGreaterThan(0);
  });
  it('puts the plan\'s frame on the street edge: its street wall 11 m in front of the origin, on the site\'s outer edge', () => {
    for (const s of SITES) {
      const f = siteFrame(s), edge = f.p(0, E), back = f.p(0, E - extentOf(s).d);
      if (s.facing === 'south') { expect(edge.z).toBeCloseTo(s.rect.z1, 6); expect(back.z).toBeCloseTo(s.rect.z0, 6); }
      else { expect(edge.z).toBeCloseTo(s.rect.z0, 6); expect(back.z).toBeCloseTo(s.rect.z1, 6); }
      expect(edge.x).toBeCloseTo((s.rect.x0 + s.rect.x1) / 2, 6);
    }
  });
});

describe('every design', () => {
  const all = Object.entries(REGISTRY).flatMap(([kind, vs]) => vs.map(v => ({ kind: kind as Site['kind'], v })));
  /** A canonical site of the design's kind and size on a real lot, any facing and mirror. */
  const siteFor = (kind: Site['kind'], size: 'S' | 'M' | 'L', facing: 'north' | 'south', mirror: boolean): Site => {
    const proto = SITES.find(s => s.kind === kind && sizeOf(s) === size) ?? SITES.find(s => sizeOf(s) === size)!;
    const rect = { ...proto.rect };
    return { ...proto, kind, facing, mirror, rect, storeys: proto.storeys, name: proto.name ?? (kind === 'hotel' || kind === 'residence' ? 'HÔTEL ESSAI' : undefined) };
  };
  for (const { kind, v } of all) for (const [facing, mirror] of [['south', false], ['north', true]] as const) it(`${kind}/${v.id}, facing ${facing}${mirror ? ' mirrored' : ''}: stays inside its site, solid, within its budget, lighter on the low preset, deterministic`, () => {
    const s = siteFor(kind, v.size, facing, mirror), r = drawSite(s, v), lite = drawSite(s, v, true), again = drawSite(s, v);
    expect(r.colliders.length).toBeGreaterThan(0);
    for (const c of r.colliders) expect(within(c, s.rect), JSON.stringify(c)).toBe(true);
    for (const c of r.canopies) expect(c.x > s.rect.x0 - 3 && c.x < s.rect.x1 + 3 && c.z > s.rect.z0 - 3 && c.z < s.rect.z1 + 3).toBe(true);
    const cap = TRI_CAP[kind][v.size]!;
    expect(r.tris, `${r.tris} triangles`).toBeLessThanOrEqual(cap);
    expect(lite.tris, `lite ${lite.tris} / ${r.tris}`).toBeLessThanOrEqual(r.tris * 0.9);
    expect(r.signs.length).toBeLessThanOrEqual(1);
    expect(again.tris).toBe(r.tris);
    expect(again.colliders).toEqual(r.colliders);
    // the building is tall enough to be one (a storey is STOREY m): some collider reaches the storeys' height
    expect(Math.max(...r.colliders.map(c => c.h))).toBeGreaterThanOrEqual(Math.min(s.storeys, 2) * STOREY * 0.9);
  });
  it('draws the same street whatever Math.random says (three.js\'s UUIDs use it: nothing of the design may)', () => {
    const geo = (t: ReturnType<typeof testKit>) => Object.values(t.batches).map(b => (b as unknown as { geos: { attributes: { position: { array: Float32Array } } }[] }).geos.map(g => Array.from(g.attributes.position.array).map(v => Math.round(v * 100)).join(',')).join(';')).join('|');
    const run = (r: number) => { const spy = vi.spyOn(Math, 'random').mockReturnValue(r); try { const t = testKit(), dist = buildDistrict(t.kit); return { g: geo(t), c: JSON.stringify(dist.colliders), k: JSON.stringify(dist.keepClear) }; } finally { spy.mockRestore(); } };
    const a = run(0.123), b = run(0.877);
    expect(a.c).toBe(b.c); expect(a.k).toBe(b.k); expect(a.g === b.g).toBe(true);
  });
});

describe('the district in the hub', () => {
  it('draws every site of the plan, its colliders inside its own rectangle, a gate apron kept open before each', () => {
    const t = testKit(), dist = buildDistrict(t.kit);
    expect(dist.sites).toHaveLength(30);
    expect(dist.keepClear.filter(k => k.why.startsWith('district_gate:'))).toHaveLength(30);
    for (const c of dist.colliders) expect(SITES.some(s => within(c, s.rect)), JSON.stringify(c)).toBe(true);
    // the whole district's cost, gross, on the medium preset (the budget: docs/ld2/LD2_E.md decision 5)
    expect(trisOf(t)).toBeLessThanOrEqual(110_000);
  });
  for (const q of ['full', 'lite'] as const) it(`(${q}) leaves every other lot, street tree, palm, stall, collider, seat and person of the Almadies exactly as the villa branch drew them`, async () => {
    let hub: HubWorld | null = null;
    const now = await digestHub(async () => (hub = await build(q)), fixture.rects, 0.3, () => facade.depth > 0);
    hubs[q] = hub!;
    const was = fixture[q];
    expect(fixture.base).toBe('3ca9e39');
    expect(now.batches.map(b => b.n)).toEqual(was.batches.map(b => b.n));
    expect(now.batches).toEqual(was.batches);
    expect(now.colliders).toEqual(was.colliders);
    expect(now.canopies).toEqual(was.canopies);
    expect(now.interactables).toEqual(was.interactables);
    expect(now.seats).toEqual(was.seats);
    expect(now.people).toEqual(was.people);
  }, 120_000);
  it('keeps the flagship villa\'s lot and the Ngor residence\'s gate: the villa\'s compound is still there, the residence gate\'s pavement is free', async () => {
    const h = await build('full');
    expect(h.group.getObjectByName('villa-compound')).toBeDefined();
    const ngor = SITES.find(s => s.id === 'almadies:1,1:2')!;
    const solidAt = (x: number, z: number, hMin = 2) => h.colliders.some(c => c.h >= hMin && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
    expect(solidAt(-42, -7.2)).toBe(true);                                                              // the gate stands shut on the lot's street wall…
    expect(solidAt(-42, -5.9)).toBe(false);                                                             // …and its door and the board's pavement outside are free
    expect(solidAt(-39.7, -6.4)).toBe(false);
    expect(ngor.rect.z1).toBe(-7);
  }, 60_000);
});
