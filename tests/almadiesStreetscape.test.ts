import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { HUB_STREETS, pavementLanes } from '../src/crowd/streetPlan';
import { linesOf, stopOnLeg } from '../src/transport/lines';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * LD2.0-E round 3 « Life on the ground » (« some streets feel too empty, the open sandy areas need more landscaping and street activity »): what the streetscape
 * (src/world/almadies/streetscape.ts) puts between the buildings stands where nothing else does, leaves the pavements' walking lanes as they were, and is the same
 * on every client.
 */
stubCanvas();
const hubs: Record<string, HubWorld> = {};
const build = async (name: 'on' | 'off' | 'lite', on = name !== 'off') => {
  const { buildHub } = await import('../src/world/builder'), { STREETSCAPE } = await import('../src/world/almadies/streetscape');
  STREETSCAPE.on = on;
  try { return (hubs[name] ??= buildHub('almadies', name === 'lite')); } finally { STREETSCAPE.on = true; }
};
const tris = (h: HubWorld) => { let n = 0; h.group.traverse(o => { const m = o as { isMesh?: boolean; geometry?: { index?: { count: number }; attributes: { position: { count: number } } } }; if (m.isMesh && m.geometry) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(n); };
const key = (c: Collider) => `${c.x0.toFixed(3)},${c.z0.toFixed(3)},${c.x1.toFixed(3)},${c.z1.toFixed(3)},${c.h}`;
const ROADS = [-120, -60, 0, 60, 120];
const kinds = (h: HubWorld) => { const k: Record<string, number> = {}; for (const p of h.streetscape ?? []) k[p.kind] = (k[p.kind] ?? 0) + 1; return k; };
/** The colliders the streetscape added: what the hub has with it and not without. */
const mine = (on: HubWorld, off: HubWorld) => { const had = new Map<string, number>(); for (const c of off.colliders) had.set(key(c), (had.get(key(c)) ?? 0) + 1); return on.colliders.filter(c => { const n = had.get(key(c)) ?? 0; if (n > 0) { had.set(key(c), n - 1); return false; } return true; }); };
const meets = (a: Collider, b: Collider, m = 0.02) => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;

describe('the streetscape', () => {
  it('plants the port\'s plaza, the gare\'s garden, the square\'s ring and the kerbs', async () => {
    const k = kinds(await build('on'));
    expect(k.palm).toBeGreaterThanOrEqual(20); expect(k['kerb palm']).toBeGreaterThanOrEqual(60);
    expect(k.bench).toBeGreaterThanOrEqual(12); expect(k.bed).toBeGreaterThanOrEqual(6); expect(k.stall).toBeGreaterThanOrEqual(4); expect(k.lawn).toBeGreaterThanOrEqual(2);
  });
  it('the benches and stools are seats of the street, the stalls have their sellers', async () => {
    const on = await build('on'), off = await build('off'), added = on.seats.filter(s => s.id.startsWith('street:seat:'));
    expect(on.seats.length - off.seats.length).toBe(added.length); expect(added.length).toBeGreaterThanOrEqual(30);
    expect(new Set(added.map(s => s.id)).size).toBe(added.length);
    for (const s of added) { expect(s.space).toBe('street'); expect(s.occupant).toBeNull(); expect(s.top).toBeGreaterThan(0.4); expect(s.top).toBeLessThan(0.7); }
    expect(on.people.length - off.people.length).toBeGreaterThanOrEqual(4);
    const sellers = on.people.slice(off.people.length);
    for (const p of sellers) { expect(p.look).toBeTruthy(); expect(['Idle', 'Talk']).toContain(p.clip); }
  });
  it('nothing it draws overlaps a collider of the hub or another of its own', async () => {
    const on = await build('on'), off = await build('off'), added = mine(on, off);
    expect(added.length).toBeGreaterThan(150);
    const bad: string[] = [];
    added.forEach((c, i) => {
      for (const o of off.colliders) if (meets(c, o)) bad.push(`${key(c)} × ${key(o)}`);
      for (let j = i + 1; j < added.length; j++) if (meets(c, added[j])) bad.push(`${key(c)} × ${key(added[j])} (own)`);
    });
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it('stands off the carriageways, the junctions, the stops and the keep-clear ground', async () => {
    const on = await build('on'), stops = linesOf('almadies').flatMap(l => l.stops.map(s => stopOnLeg(l, s)));
    for (const p of on.streetscape ?? []) {
      for (const c of ROADS) { expect(Math.abs(p.x - c), `${p.kind} ${p.x},${p.z}`).toBeGreaterThanOrEqual(6.3); expect(Math.abs(p.z - c), `${p.kind} ${p.x},${p.z}`).toBeGreaterThanOrEqual(6.3); }
      for (const k of on.keepClear ?? []) expect(p.x > k.x0 - 0.3 && p.x < k.x1 + 0.3 && p.z > k.z0 - 0.3 && p.z < k.z1 + 0.3, `${p.kind} ${p.x},${p.z} in ${k.why}`).toBe(false);
      if (p.kind === 'kerb palm') for (const s of stops) expect(Math.hypot(s.x - p.x, s.z - p.z), `kerb palm ${p.x},${p.z} at a stop`).toBeGreaterThanOrEqual(9);
    }
  });
  it('keeps the pavements\' walking lanes as they were (a kerb palm\'s foot is past the outermost lane)', async () => {
    const on = await build('on'), off = await build('off'), busy = HUB_STREETS.almadies?.busy ?? [];
    const a = pavementLanes(on.edges, on.colliders, busy), b = pavementLanes(off.edges, off.colliders, busy);
    expect(a.length).toBe(b.length);
    expect(a.reduce((n, l) => n + l.len, 0)).toBeCloseTo(b.reduce((n, l) => n + l.len, 0), 3);
    expect(a.map(l => l.off)).toEqual(b.map(l => l.off));
  });
  it('is the same on every client, and costs what it says on both presets', async () => {
    const { buildHub } = await import('../src/world/builder'), again = buildHub('almadies', false), on = await build('on'), off = await build('off'), lite = await build('lite');
    expect(JSON.stringify(again.streetscape)).toBe(JSON.stringify(on.streetscape));
    expect(tris(again)).toBe(tris(on));
    const cost = tris(on) - tris(off);
    expect(cost).toBeGreaterThan(8_000); expect(cost).toBeLessThan(26_000);
    expect(kinds(lite)['kerb palm']).toBe(kinds(on)['kerb palm']);               // the same street on both presets, thinner fronds
    expect(tris(lite)).toBeLessThan(tris(on));
  });
  it('is off when told: the hub has none of it', async () => {
    const off = await build('off'); expect(off.streetscape).toBeUndefined();
    expect(off.seats.some(s => s.id.startsWith('street:seat:'))).toBe(false);
  });
});
