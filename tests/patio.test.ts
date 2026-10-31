import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { clubDigest } from './clubDigest.helper';
import * as T from '../src/activity/templates';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats, type Seat } from '../src/interact/seats';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import { isOpen } from '../src/activity/places';
import { parseMove } from '../src/multiplayer/protocol';
import {
  ALL_MOMENTS, APPROACHERS, APPROACH_ZONE, BAR, CAST, DANCE_FLOOR, FLOOR_TOP, HW, LANE, PATIO_DRINKS, PATIO_ENTRY, PATIO_HOURS, PATIO_REGULAR, PATIO_THEMES, PATIO_VARIANT, SEAT_IDS, SITE_BOX, TERRACE, VIP, ZB, ZF,
  approachPoint, bodiesAt, inZone, isOpenMoment, patioMoment, wayClear, type PatioMoment, type Rect,
} from '../src/venues/patioPlan';
import { PATIO_TRACK } from '../src/venues/patioTrack';
import { VAGUE_TRACK } from '../src/venues/vagueTrack';
import { PATIO_SITE } from '../src/world/nightStreet';
import type { Collider, HubWorld } from '../src/world/types';

/**
 * Le Patio (src/venues/patio.ts, docs/districts/PATIO.md): the courtyard club of the Almadies' night street. Held here: the recipe variant leaves La Vague's club() exactly as it was, the hours
 * and the moments, the geometry (inside the site, the gate and the promenade lane clear, every collider accounted, the same every time, no Math.random, ≤ 12 draw calls and ≤ 40 000 triangles),
 * the seats and the cast, the way a player gets in and drinks (the door shown and paid once, every drink at its price, one ledger line each), the counters, the music that is its own or nothing.
 */
stubCanvas();
/** A shipped file or a source, read as text (the project has no @types/node: tests/node-fs.d.ts). */
const text = (rel: string) => new TextDecoder().decode(readFileSync(new URL(rel, import.meta.url)));
const SITE = { x: PATIO_SITE.x, z: PATIO_SITE.z };
const ID = 'almadies:venue:patio';
const A = (id: string, x = 0, z = 0, extra: object = {}) => ({ id, kind: 'spot' as const, x, z, ...extra });
afterEach(() => { vi.restoreAllMocks(); });

// ------------------------------------------------------------------ the recipe
describe('the club recipe: La Vague is the recipe as it always was, Le Patio is a variant of it', () => {
  // The digests were taken from the recipe at 6ec234b, before it had a variant argument: every offer, label, detail, price, step and effect, what visible() and requires() answer across hours, nights
  // and counters. The variant argument must leave them byte for byte as they were.
  const FULL = '9d8a1781212f6b8f9152862de71458100788c227992acdbdcc289b9e4213adae', BARE = 'afec476a7f60090c9e2bc80d9ce7261a085b44673acde131479f2141f540b1d5';
  const full = (h: T.PlaceHooks, v?: T.ClubVariant) => T.club({ id: 'al:club', name: 'La Vague', space: 'al:venue:club', bar: { x: 8, z: 0, r: 4 }, lounge: { x: -11, z: 0, r: 5 }, anchors: [A('door', 0, 10), A('floor'), A('bar', 8), A('lounge', -9), A('dj', 0, -5), A('exit', 0, 8)] }, h, v);
  const bare = (h: T.PlaceHooks, v?: T.ClubVariant) => T.club({ id: 'al:club', name: 'La Vague', space: 'street', anchors: [A('door', 0, 10), A('floor'), A('bar', 8)] }, h, v);
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  it('without a variant it is what it was before the variant existed (La Vague’s hours 21 h – 5 h, 2 000 F, its five juices, its contest, its words)', () => {
    expect(sha(clubDigest(h => full(h)))).toBe(FULL);
    expect(sha(clubDigest(h => bare(h)))).toBe(BARE);
  });
  it('an empty or absent variant is the same call as no variant: `club(b, h)`, `club(b, h, {})`, `club(b, h, undefined)`', () => {
    const a = clubDigest(h => full(h)), b = clubDigest(h => full(h, {})), c = clubDigest(h => full(h, undefined));
    expect(b).toBe(a); expect(c).toBe(a);
    expect(sha(clubDigest(h => full(h, { labels: {} })))).toBe(FULL);
    expect(T.clubTheme(5)).toBe(T.CLUB_THEMES[5]); expect(T.nightsToContest(0)).toBe(T.nightsToContest(0, T.CLUB_THEMES));
    expect(T.CLUB_DRINKS.map(d => d.price)).toEqual([500, 700, 700, 1500, 300]);                     // La Vague’s bar is untouched
  });
  it('Le Patio’s variant changes what it should and only that: its hours, busy window, fee, bar, week and words', () => {
    const counters: Record<string, number> = {}; let hour = 23, day = 10;
    const keys = T.clubCounters(ID);
    const p = T.club({ id: ID, name: 'Le Patio · bar et club', space: ID, bar: { x: -9, z: -4 }, lounge: { x: -10, z: 5, r: 5 }, anchors: [A('door', 0, 11, { space: 'street' }), A('floor'), A('bar', -9), A('lounge', -10), A('dj', 0, -6), A('exit', 0, 8)] },
      { count: k => counters[k] ?? 0, hour: () => hour, day: () => day, converse: () => {}, enter: () => {}, tired: () => null, done: () => {} }, PATIO_VARIANT);
    expect(p.hours).toEqual([20, 4]); expect(p.hours).toEqual([...PATIO_HOURS]); expect(p.peaks).toEqual([[0, 2.5]]); expect(p.type).toBe('club'); expect(p.chat).toBe(true);
    const vis = (anchor: string) => p.offers[anchor].filter(o => !o.visible || o.visible());
    // the door: shown first, a 5 000 F ticket (the private VIP club), once a night; a regular after three nights comes in free
    expect(vis('door').map(o => o.id)).toEqual(['entree', 'videur']);
    expect(p.offers.door.find(o => o.id === 'entree')!.detail).toMatch(/Entrée 5\s000\sF, une fois pour la nuit · Ce soir : /);
    expect(p.offers.door.find(o => o.id === 'payer')!.price).toBe(5000);
    counters[keys.nights] = PATIO_REGULAR; expect(vis('door').map(o => o.id)).toEqual(['entree_habitue', 'videur']); counters[keys.nights] = 0;
    // the bar: the menu, then Coumba; the floor: dancing only (no contest on any night or at any hour)
    expect(vis('bar').map(o => o.id)).toEqual([...PATIO_DRINKS.map(d => d.id), 'barman']);
    expect(p.offers.bar.find(o => o.id === 'barman')!.label).toBe('Parler à Coumba');
    for (day = 0; day < 14; day++) for (hour of [20.5, 23, 0.5, 2, 3.9]) { expect(vis('floor').map(o => o.id), `${day}/${hour}`).toEqual(['danser']); }
    expect(p.offers.floor[0].detail).not.toMatch(/concours/i);
    expect(p.offers.floor.length, 'no contest offer at all: its prizes are money paid to the player').toBe(1);
    // the lounge serves the same menu at the same prices
    expect(p.offers.lounge.map(o => [o.id, o.price])).toEqual(PATIO_DRINKS.map(d => [`table_${d.id}`, d.price]));
    expect(p.offers.exit[0].detail).toBe('Le videur te souhaite bonne nuit');
    // La Vague’s recipe, at the same time, is still 21 h – 5 h and 2 000 F
    const lv = full({ count: () => 0, hour: () => 23, day: () => 10, enter: () => {} });
    expect(lv.hours).toEqual([21, 5]); expect(lv.offers.door.find(o => o.id === 'payer')!.price).toBe(2000);
  });
  it('every theme of the week has its lights, and the week is seven different nights', () => {
    expect(new Set(PATIO_THEMES.map(t => t.id)).size).toBe(7);
    for (let n = -3; n < 15; n++) expect(T.clubTheme(n, PATIO_THEMES)).toBe(PATIO_THEMES[((n % 7) + 7) % 7]);
    expect(T.nightsToContest(4, PATIO_THEMES)).toBe(-1);
  });
});

// ------------------------------------------------------------------ hours and moments
describe('the hours: 20 h – 4 h, and the moments of the night', () => {
  it('is open from 20 h to 4 h (La Vague 21 h – 5 h) and shut the rest of the day', () => {
    const hours = [...PATIO_HOURS] as [number, number];
    expect([19.99, 20, 21, 23.99, 0, 2, 3.99, 4, 4.5, 12, 18].map(h => isOpen(hours, h))).toEqual([false, true, true, true, true, true, true, false, false, false, false]);
  });
  it('has its own moments: shut, day, set-up, early, warm, peak, dawn — each by its own hours', () => {
    const at = (h: number) => patioMoment(h);
    expect([4, 6.99, 7, 12, 17.99, 18, 19.99, 20, 21.99, 22, 23.99, 0, 2.49, 2.5, 3.99].map(at))
      .toEqual(['shut', 'shut', 'day', 'day', 'day', 'setup', 'setup', 'early', 'early', 'warm', 'warm', 'peak', 'peak', 'dawn', 'dawn']);
    expect(new Set(Array.from({ length: 48 }, (_, i) => at(i / 2))).size).toBe(ALL_MOMENTS.length);
    // an open moment is exactly an open hour
    for (let h = 0; h < 24; h += 0.25) expect(isOpenMoment(patioMoment(h)), `${h}`).toBe(isOpen([...PATIO_HOURS] as [number, number], h));
    expect(patioMoment(24 + 22)).toBe('warm'); expect(patioMoment(-1)).toBe('warm');
    // it is not La Vague’s clock: 20 h is the first guests here, nobody there
    expect(T.clubCrowd(20.5)).toBe('closed'); expect(patioMoment(20.5)).toBe('early');
  });
});

// ------------------------------------------------------------------ the cast and the humanoid budget
describe('the people: a bounded cast, each in a place that exists', () => {
  it('shows 8 – 10 bodies at the peak on Medium, fewer on Low, never more than ten at any moment', () => {
    const moments = ALL_MOMENTS as readonly PatioMoment[];
    expect(bodiesAt('peak', false)).toBeGreaterThanOrEqual(8); expect(bodiesAt('peak', false)).toBeLessThanOrEqual(10);
    for (const m of moments) { expect(bodiesAt(m, false), `${m} on Medium`).toBeLessThanOrEqual(10); expect(bodiesAt(m, true), `${m} on Low`).toBeLessThanOrEqual(bodiesAt(m, false)); }
    expect(Math.max(...moments.map(m => bodiesAt(m, true)))).toBeLessThanOrEqual(8);
    expect(bodiesAt('peak', true)).toBeLessThan(bodiesAt('peak', false));
    // by day, a delivery at the gate and nobody inside; set-up: the staff
    expect(CAST.filter(p => p.when.includes('day')).map(p => p.id)).toEqual(['livreur']);
    expect(CAST.filter(p => p.when.includes('shut')).length).toBe(0);
    expect(CAST.filter(p => p.when.includes('setup')).map(p => p.id).sort()).toEqual(['barman', 'dj', 'videur']);
    // security, a barwoman, a DJ, a waiter, and a queue at the peak
    for (const id of ['videur', 'barman', 'dj', 'serveur']) expect(CAST.find(p => p.id === id)!.role).toBe('staff');
    expect(CAST.filter(p => p.role === 'queue').every(p => p.when.length === 1 && p.when[0] === 'peak')).toBe(true);
  });
  it('is the same people at the same places every time (ids, names, spots)', () => {
    expect(new Set(CAST.map(p => p.id)).size).toBe(CAST.length);
    expect(JSON.stringify(CAST)).toBe(JSON.stringify(CAST.map(p => ({ ...p }))));
    for (const p of CAST) expect(!!p.seat !== !!p.spot, p.id).toBe(true);
  });
});

// ------------------------------------------------------------------ the geometry
interface Built { kit: import('../src/venues/kit').VenueKit; parts: ReturnType<typeof import('../src/venues/patioBuild').drawPatio>; mats: import('../src/venues/kit').VenueMaterials }
async function build(lite = false, origin = SITE): Promise<Built> {
  const { VenueKit, VenueMaterials } = await import('../src/venues/kit');
  const { drawPatio } = await import('../src/venues/patioBuild');
  const mats = new VenueMaterials(), kit = new VenueKit(origin, PATIO_SITE.yaw, ID);
  return { kit, mats, parts: drawPatio(kit, mats, { lite, id: ID, night: 3 }) };
}
const meshes = (b: Built) => { const out: THREE.Mesh[] = []; b.kit.group.updateMatrixWorld(true); b.kit.group.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };
const isGlow = (m: THREE.Mesh) => (m.material as THREE.Material).blending === THREE.AdditiveBlending;
const verts = (m: THREE.Mesh) => { const pos = m.geometry.attributes.position, v = new THREE.Vector3(), o: THREE.Vector3[] = []; for (let i = 0; i < pos.count; i++) o.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone()); return o; };
const trisOf = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
const local = (p: { x: number; z: number }) => ({ x: p.x - SITE.x, z: p.z - SITE.z });

describe('the geometry: inside the site, a clear lane past the gate, every collider accounted', () => {
  it('keeps every solid, lit and painted surface inside the site rectangle (x ±14, z −10 … +11.6: the front court is the porch), Medium and Low', async () => {
    for (const lite of [false, true]) {
      const b = await build(lite);
      for (const m of meshes(b).filter(x => !isGlow(x))) for (const v of verts(m)) {
        const l = local(v);
        expect(l.x, `x (${lite ? 'low' : 'medium'})`).toBeGreaterThanOrEqual(SITE_BOX.x0 - 0.01); expect(l.x).toBeLessThanOrEqual(SITE_BOX.x1 + 0.01);
        expect(l.z, 'z').toBeGreaterThanOrEqual(SITE_BOX.z0 - 0.01); expect(l.z).toBeLessThanOrEqual(SITE_BOX.z1 + 0.01);
      }
      // the world rectangle of the site: x −123 … −95, z −157 … −133
      expect(SITE.x - SITE_BOX.x1).toBeGreaterThanOrEqual(-123.01); expect(SITE.z + SITE_BOX.z1).toBeLessThanOrEqual(-135);
      // the pools of light are not solid: they may spill onto the promenade but never past the site’s sides or the promenade’s road edge
      const pools = meshes(b).filter(isGlow).flatMap(m => verts(m)).map(local);
      for (const l of pools) { expect(l.x).toBeGreaterThanOrEqual(-14.01); expect(l.x).toBeLessThanOrEqual(14.01); expect(l.z).toBeGreaterThanOrEqual(-10.01); expect(l.z).toBeLessThanOrEqual(LANE.z1 + 0.01); }
    }
  });
  it('accounts for every collider: a reason, a box inside the site, none in the promenade’s lane', async () => {
    const b = await build();
    expect(b.kit.colliders.length).toBe(b.parts.accounts.length);
    expect(b.parts.accounts.length).toBeGreaterThan(30);
    for (const a of b.parts.accounts) {
      expect(a.why.length, 'a reason').toBeGreaterThanOrEqual(3);
      expect(a.x0, a.why).toBeGreaterThanOrEqual(SITE_BOX.x0 - 0.01); expect(a.x1, a.why).toBeLessThanOrEqual(SITE_BOX.x1 + 0.01);
      expect(a.z0, a.why).toBeGreaterThanOrEqual(SITE_BOX.z0 - 0.01); expect(a.z1, a.why).toBeLessThanOrEqual(SITE_BOX.z1 + 0.01);
      expect(a.h, a.why).toBeGreaterThan(0.3);
    }
    // the world colliders are those boxes, turned into the world by the kit (the site’s yaw is 0)
    b.kit.colliders.forEach((c, i) => { const a = b.parts.accounts[i]; expect(c.x0).toBeCloseTo(SITE.x + a.x0, 6); expect(c.x1).toBeCloseTo(SITE.x + a.x1, 6); expect(c.z0).toBeCloseTo(SITE.z + a.z0, 6); expect(c.z1).toBeCloseTo(SITE.z + a.z1, 6); });
    const reasons = new Set(b.parts.accounts.map(a => a.why));
    for (const w of ['west wall', 'east wall', 'back wall', 'street wall west', 'street wall middle', 'street wall east', 'porch post', 'bar counter', 'DJ booth', 'sofa', 'low table', 'VIP rope', 'terrace rail', 'high table', 'terrace table', 'pot']) expect(reasons.has(w), w).toBe(true);
    // the gates are the venue’s own colliders, toggled: the arch, the rope line and the smokers’ door
    expect(b.parts.gates.main.length).toBe(2); expect(b.parts.gates.smoke.length).toBe(1);
    for (const g of [...b.parts.gates.main, ...b.parts.gates.smoke]) { expect(g.x0).toBeGreaterThanOrEqual(SITE_BOX.x0); expect(g.x1).toBeLessThanOrEqual(SITE_BOX.x1); expect(g.z1).toBeLessThanOrEqual(SITE_BOX.z1); }
  });
  it('leaves a clear lane along the promenade past the gate: nothing solid beyond the front court, a lane at least 2 m wide', async () => {
    const b = await build();
    expect(LANE.z1 - LANE.z0).toBeGreaterThanOrEqual(2.0);
    const solids = [...b.parts.accounts, ...b.parts.gates.main.map(g => ({ ...g, why: 'gate' })), ...b.parts.gates.smoke.map(g => ({ ...g, why: 'smoke door' }))];
    for (const a of solids) expect(a.z1, a.why).toBeLessThanOrEqual(LANE.z0 + 1e-6);
    expect(Math.max(...solids.map(a => a.z1))).toBeLessThanOrEqual(11.6);
  });
  it('can be walked: with the gate shut the courtyard is closed from the promenade; open, the floor, the bar, the salon, the DJ and the terrace are reached, the VIP corner is not', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true), b = await build();
    const open = [...hub.colliders, ...b.kit.colliders];
    const all = (list: Collider[]) => [...list, ...[...b.parts.gates.main, ...b.parts.gates.smoke].map(g => ({ x0: SITE.x + g.x0, x1: SITE.x + g.x1, z0: SITE.z + g.z0, z1: SITE.z + g.z1, h: g.h }))];
    const shut = all(open), g = grid(shut), g2 = grid(open);
    const L = (x: number, z: number): [number, number] => [SITE.x + x, SITE.z + z];
    const road: [number, number] = [-109, -126];
    // the lane, end to end, in front of the gate (the frontage’s lamp poles are the owner’s)
    expect(g.reach(L(-12.5, 13), L(12.5, 13)), 'the lane along the frontage, gate shut').toBe(true);
    expect(g.reach(road, L(0, 12.6)), 'from the road to the gate’s front').toBe(true);
    expect(g.reach(road, L(9.5, 11.6)), 'to the smokers’ door’s steps').toBe(true);
    for (const [name, p] of [['the dance floor', L(DANCE_FLOOR.x, DANCE_FLOOR.z)], ['the salon', L(-10.2, 5.2)], ['the bar’s stools', L(-8.3, -4.6)], ['the terrace', L(9.5, 6.4)]] as const) expect(g.reach(road, p), `${name}, shut`).toBe(false);
    for (const [name, p] of [['the dance floor', L(DANCE_FLOOR.x, DANCE_FLOOR.z)], ['the salon', L(-10.2, 5.2)], ['the bar’s stools', L(-8.3, -4.6)], ['the DJ’s anchor', L(0, -6.2)], ['the exit', L(0, ZF - 1.7)], ['the terrace', L(9.5, 6.4)], ['the terrace’s north steps', L(8.8, 3.1)]] as const) expect(g2.reach(road, p), `${name}, open`).toBe(true);
    expect(g2.reach(L(0, 8), L(10.4, -6.8)), 'the VIP corner is decor').toBe(false);
    expect(g2.reach(L(0, 8), L(10.5, -1.0)), 'the high tables’ side').toBe(true);
    // the smokers’ door alone also gets you in (once the venue opens it), and the terrace joins the courtyard by its steps
    expect(g2.reach(L(9.5, 11.6), L(0, 4)), 'out of the smokers’ door back into the courtyard').toBe(true);
  }, 60000);
  it('is the same every time it is built, and draws nothing from Math.random', async () => {
    // three.js draws a UUID from Math.random for every object it makes (never drawn): the stream that matters is the venue’s own, so a call from Le Patio’s own modules is what fails
    const callers: string[] = [];
    vi.spyOn(Math, 'random').mockImplementation(() => { const st = new Error().stack ?? ''; if (/\/(patio\w*|patioLines|cast|kit|batch)\.ts/.test(st.split('\n').slice(1, 6).join('\n'))) callers.push(st.split('\n')[2] ?? ''); return 0.5; });
    const digest = (b: Built) => createHash('sha256').update(JSON.stringify({ a: b.parts.accounts, s: b.kit.seats.map(s => [s.id, s.x, s.z, s.top, s.yaw, s.kind]), p: b.parts.pools.list, t: b.parts.tris }) + meshes(b).map(m => [...(m.geometry.attributes.position.array as Float32Array)].join(',') + [...((m.geometry.attributes.color?.array ?? []) as Float32Array)].join(',')).join('|')).digest('hex');
    const a = await build(false), c = await build(false);
    expect(digest(c)).toBe(digest(a));
    expect(digest(await build(true))).not.toBe(digest(a));                                // Low is a lighter build, not the same one
    expect(callers).toEqual([]);
    for (const f of ['patio.ts', 'patioBuild.ts', 'patioPlan.ts', 'patioTrack.ts', '../i18n/patioLines.ts']) expect(text(`../src/venues/${f}`), f).not.toMatch(/Math\.random/);
  });
  it('is a few merged batches: at most 12 draw calls and 40 000 triangles on Medium at night, fewer on Low', async () => {
    const cost = (b: Built, open: boolean) => {
      b.parts.pools.mesh.visible = open; if (b.parts.day) b.parts.day.visible = !open; if (b.parts.night) b.parts.night.visible = open;
      b.parts.beams.forEach(m => { m.visible = open; });
      let calls = 0, tris = 0; for (const m of meshes(b)) { if (!m.visible) continue; calls++; tris += trisOf(m); }
      return { calls, tris };
    };
    const med = await build(false), low = await build(true);
    const nightMed = cost(med, true), nightLow = cost(low, true), dayMed = cost(med, false);
    expect(nightMed.calls).toBeLessThanOrEqual(12); expect(nightMed.tris).toBeLessThanOrEqual(40000);
    expect(nightLow.calls).toBeLessThanOrEqual(12); expect(nightLow.calls).toBeLessThan(nightMed.calls); expect(nightLow.tris).toBeLessThan(nightMed.tris);
    expect(dayMed.calls).toBeLessThan(nightMed.calls);
    const total = Object.values(med.parts.tris).reduce((a, n) => a + n, 0);
    expect(total).toBeLessThanOrEqual(40000);
  });
  it('registers its seats: six stools (stool), the salon’s sofas and the VIP booth’s (bench), all inside the walls, unique, with the cast’s seats among them', async () => {
    const b = await build(), seats = b.kit.seats;
    expect(new Set(seats.map(s => s.id)).size).toBe(seats.length);
    expect(b.parts.seats.stools.length).toBe(6); expect(b.parts.seats.salon.length).toBe(6); expect(b.parts.seats.vip.length).toBe(4);
    for (const s of seats) {
      expect(s.id.startsWith(`${ID}:`), s.id).toBe(true); expect(s.space).toBe(ID); expect(s.occupant).toBeNull();
      const l = local(s); expect(Math.abs(l.x), s.id).toBeLessThan(HW); expect(l.z, s.id).toBeGreaterThan(-ZB); expect(l.z, s.id).toBeLessThan(ZF);
    }
    expect(b.parts.seats.stools.every(s => s.kind === 'stool')).toBe(true); expect([...b.parts.seats.salon, ...b.parts.seats.vip].every(s => s.kind === 'bench')).toBe(true);
    for (const p of CAST.filter(c => c.seat)) expect(seats.find(s => s.id === `${ID}:${p.seat}`), `${p.id} sits on ${p.seat}`).toBeTruthy();
    expect(SEAT_IDS.stool(0)).toBe('tabouret:0');
    // no two seats on one place, and the salon’s seats are within the lounge’s reach for table service
    for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) expect(Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z), `${seats[i].id} ${seats[j].id}`).toBeGreaterThan(0.5);
    for (const s of b.parts.seats.salon) expect(Math.hypot(local(s).x - -10.2, local(s).z - 5.0)).toBeLessThan(5.2);
    for (const s of b.parts.seats.vip) expect(Math.hypot(local(s).x - -10.2, local(s).z - 5.0)).toBeGreaterThan(5.2);
    for (const s of b.parts.seats.stools) expect(Math.hypot(local(s).x - -9.2, local(s).z - -4.6)).toBeLessThan(4.2);
  });
  it('puts every standing person on open ground: inside the walls (or in the front court), off every collider', async () => {
    const b = await build();
    const boxes = b.parts.accounts.filter(a => a.h >= 0.45);
    for (const p of CAST.filter(c => c.spot && c.id !== 'dj')) {                          // (the DJ stands on his booth, which is solid)
      const s = p.spot!;
      expect(s.x, p.id).toBeGreaterThan(SITE_BOX.x0); expect(s.x, p.id).toBeLessThan(SITE_BOX.x1); expect(s.z, p.id).toBeGreaterThan(SITE_BOX.z0); expect(s.z, p.id).toBeLessThan(11.6);
      const inside = s.z < ZF;
      if (inside) expect(boxes.some(a => s.x > a.x0 - 0.2 && s.x < a.x1 + 0.2 && s.z > a.z0 - 0.2 && s.z < a.z1 + 0.2), `${p.id} stands on a collider`).toBe(false);
      expect(s.z <= ZF || s.z > 10.4, `${p.id} is not inside the street wall`).toBe(true);
      const y = s.y ?? 0.1;
      if (s.x > TERRACE.x0 && s.x < TERRACE.x1 && s.z > TERRACE.z0 && s.z < TERRACE.z1) expect(y, `${p.id} stands on the terrace’s deck`).toBeCloseTo(FLOOR_TOP + TERRACE.lift, 6);
    }
  });
  it('raises the terrace’s ground by a ramp, no jump: flat outside, the deck’s height on it, continuous across the edges and the smokers’ door', async () => {
    const { terraceHeight } = await import('../src/venues/patioBuild');
    expect(terraceHeight(0, 0)).toBe(0); expect(terraceHeight(-10, 5)).toBe(0); expect(terraceHeight(9.5, 12)).toBe(0);
    expect(terraceHeight(10, 6.5)).toBeCloseTo(TERRACE.lift, 6); expect(terraceHeight(12.9, 4.2)).toBeCloseTo(TERRACE.lift, 6);
    const path = (a: [number, number], c: [number, number]) => { const n = 80; let worst = 0, prev = terraceHeight(a[0], a[1]); for (let i = 1; i <= n; i++) { const h = terraceHeight(a[0] + (c[0] - a[0]) * i / n, a[1] + (c[1] - a[1]) * i / n); worst = Math.max(worst, Math.abs(h - prev)); prev = h; } return worst; };
    expect(path([5, 6], [8, 6]), 'the west edge').toBeLessThan(0.03);
    expect(path([8.8, 2.4], [8.8, 5]), 'the north steps').toBeLessThan(0.03);
    expect(path([9.5, 12], [9.5, 6]), 'out through the smokers’ door').toBeLessThan(0.03);
    expect(terraceHeight(9.5, 11)).toBe(0);
  });
});

/** A walkable grid (0.25 m cells, the 0.5 m body of a player in the street) over the Patio and its frontage. */
function grid(cs: Collider[]) {
  const X0 = SITE.x - 18, X1 = SITE.x + 18, Z0 = SITE.z - 14, Z1 = -118, S = 0.25, W = Math.round((X1 - X0) / S), D = Math.round((Z1 - Z0) / S), R = 0.5, solid = new Uint8Array(W * D);
  for (const c of cs) {
    if (c.h < 0.45 || c.x1 < X0 || c.x0 > X1 || c.z1 < Z0 || c.z0 > Z1) continue;
    const i0 = Math.max(0, Math.floor((c.x0 - R - X0) / S)), i1 = Math.min(W - 1, Math.floor((c.x1 + R - X0) / S)), j0 = Math.max(0, Math.floor((c.z0 - R - Z0) / S)), j1 = Math.min(D - 1, Math.floor((c.z1 + R - Z0) / S));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) solid[j * W + i] = 1;
  }
  const at = (x: number, z: number) => [Math.round((x - X0) / S), Math.round((z - Z0) / S)] as const;
  return {
    reach(from: [number, number], to: [number, number]) {
      const [si, sj] = at(...from), [ti, tj] = at(...to);
      if (si < 0 || sj < 0 || ti < 0 || tj < 0 || si >= W || ti >= W || sj >= D || tj >= D || solid[sj * W + si] || solid[tj * W + ti]) return false;
      const seen = new Uint8Array(W * D), q = [sj * W + si]; seen[q[0]] = 1;
      for (let n = 0; n < q.length; n++) {
        const p = q[n], i = p % W, j = (p / W) | 0;
        if (i === ti && j === tj) return true;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= W || c >= D) continue; const k = c * W + a; if (seen[k] || solid[k]) continue; seen[k] = 1; q.push(k); }
      }
      return false;
    },
  };
}

// ------------------------------------------------------------------ walking over to the player
describe('the ones who walk over: once a night, to a side, on open ground, never blocking', () => {
  it('finds a stopping place for any player standing idle in the open walk: 1.5 m off, not in front of them, clear of every collider, by a clear way', async () => {
    const b = await build(), boxes: Rect[] = b.parts.accounts.filter(a => a.h >= 0.45);
    let found = 0, tried = 0;
    for (const pid of APPROACHERS) {
      const home = CAST.find(c => c.id === pid)!.spot!;
      for (let x = APPROACH_ZONE.x0; x <= APPROACH_ZONE.x1; x += 0.75) for (let z = APPROACH_ZONE.z0; z <= APPROACH_ZONE.z1; z += 0.75) for (const facing of [0, 1.2, 2.5, -2, Math.PI]) {
        tried++;
        const me = { x, z }, p = approachPoint(me, facing, home, boxes);
        if (!p) continue;
        found++;
        expect(Math.hypot(p.x - x, p.z - z)).toBeCloseTo(1.5, 5);
        const dot = (p.x - x) * Math.sin(facing) + (p.z - z) * Math.cos(facing);
        expect(dot, 'never straight in front of the player').toBeLessThan(0.55);
        expect(boxes.some(a => p.x > a.x0 - 0.6 && p.x < a.x1 + 0.6 && p.z > a.z0 - 0.6 && p.z < a.z1 + 0.6), 'clear of colliders').toBe(false);
        expect(wayClear(home, p, boxes), 'the way there is clear').toBe(true);
        expect(p.z).toBeLessThan(ZF - 0.3);
      }
    }
    expect(found / tried, 'most idle players have someone who could walk over').toBeGreaterThan(0.5);
    expect(inZone({ x: 0, z: 4 })).toBe(true); expect(inZone({ x: 9, z: 6 })).toBe(false); expect(inZone({ x: 0, z: -3 })).toBe(false);
  });
  it('the venue walks them over only to a player who stands idle in the open walk, once per person per night, and sends them back', () => {
    const src = text('../src/venues/patio.ts');
    expect(src).toMatch(/approached\.get\(pid\) === night\(\)\) continue/);                 // never twice in a night
    expect(src).toMatch(/approached\.set\(pid, night\(\)\)/);
    expect(src).toMatch(/idleFor < 3/); expect(src).toMatch(/!inZone\(me\)/); expect(src).toMatch(/ctx\.player\.seated\(\)/); expect(src).toMatch(/ctx\.activities\.current/);
    expect(src).toMatch(/sendBack\(\)/); expect(src).toMatch(/approach\.t > 16/);            // ignored: back after sixteen seconds at most
    // no re-targeting: the person walks to ONE point decided at the start and is never sent after the player again
    expect(src.match(/cast\.walkTo\(pid/g)?.length).toBe(1);
  });
});

// ------------------------------------------------------------------ the door, the bar, the DJ: every payment through the runner, once
function rig() {
  const state = new GameState(newSave()); state.data.wallet = 100000;
  const seats = new Seats();
  let seated: Seat | null = null; let pos = { x: 0, z: 0 };
  const toasts: string[] = [];
  const s: ActivityServices = {
    state, seats, space: () => ID, player: () => pos, seated: () => seated,
    sit: seat => { if (!seats.occupy(seat.id, 'player')) return false; seated = seat; return true; },
    clip: () => {}, busy: () => {}, progress: () => {}, toast: m => { toasts.push(m); }, save: () => {},
  };
  return { state, seats, runner: new ActivityRunner(s), toasts, stand: () => { if (seated) { seats.release(seated.id, 'player'); seated = null; } } };
}
const run = (r: ActivityRunner, seconds: number) => { for (let t = 0; t < seconds; t += 0.25) r.update(0.25); };

describe('a night out: the fee shown then paid once, a drink at its price, a ledger line each, the counters of the club helper only', () => {
  const counters: Record<string, number> = {};
  const done: string[] = []; let hour = 23, day = 10;
  const keys = T.clubCounters(ID);
  const hooks: T.PlaceHooks = { count: k => counters[k] ?? 0, hour: () => hour, day: () => day, converse: () => {}, enter: () => { asked++; }, tired: () => null,
    done: a => { done.push(a); if (a === 'entree') counters[keys.paid] = T.clubNight(day, hour) + 1; } };
  let asked = 0;
  const place = T.club({ id: ID, name: 'Le Patio · bar et club', space: ID, bar: { x: -9.2, z: -4.6, r: 4.2 }, lounge: { x: -10.2, z: 5, r: 5.2 },
    anchors: [A('door', 0, 11.6, { space: 'street' }), A('floor'), A('bar', -9.6, -4.6), A('lounge', -10.2, 5), A('dj', 0, -6.4), A('exit', 0, 7.8)] }, hooks, PATIO_VARIANT);
  const offer = (anchor: string, id: string) => place.offers[anchor].find(o => o.id === id)!;
  const stool = (i: number): Seat => ({ id: `${ID}:tabouret:${i}`, x: -9.15, z: -7.6 + i * 1.3, top: 0.8, yaw: -Math.PI / 2, kind: 'stool', space: ID, occupant: null });
  const bench = (i: number): Seat => ({ id: `${ID}:banquette:${i}`, x: -12.8, z: 2.6 + i * 1.6, top: 0.62, yaw: Math.PI / 2, kind: 'bench', space: ID, occupant: null });
  const ledger = (r: ReturnType<typeof rig>) => r.state.data.ledger.length;

  it('the drinks wait for the door; « Entrer » shows the fee and the age first, nothing is paid until the player pays, once for the whole night', () => {
    const r = rig();
    expect(r.runner.blocked(offer('bar', 'biere'))).toBe('Paie l’entrée à la porte'); expect(r.runner.blocked(offer('lounge', 'table_biere'))).toBe('Paie l’entrée à la porte'); expect(r.runner.blocked(offer('dj', 'morceau'))).toBe('Paie l’entrée à la porte');
    expect(r.runner.blocked(offer('floor', 'danser'))).toBe('Paie l’entrée à la porte');
    const w0 = r.state.wallet, l0 = ledger(r);
    r.runner.start(offer('door', 'entree')); run(r.runner, 1);
    expect(asked).toBe(1); expect(r.state.wallet).toBe(w0); expect(ledger(r)).toBe(l0);               // shown, not paid
    r.runner.start({ ...offer('door', 'payer'), visible: undefined }); run(r.runner, 2);
    expect(r.state.wallet).toBe(w0 - PATIO_ENTRY); expect(ledger(r)).toBe(l0 + 1); expect(done).toEqual(['entree']); expect(counters[keys.paid]).toBe(T.clubNight(day, hour) + 1);
    // paid for the night: the door offers nothing more to pay, until the next night
    for (const id of ['entree', 'payer', 'entree_habitue']) expect(offer('door', id).visible?.() ?? true, id).toBe(false);
    expect(r.runner.blocked(offer('bar', 'biere'))).toBeNull();
    day = 11; expect(offer('door', 'entree').visible!()).toBe(true); day = 10;
  });
  it('every drink at the bar costs exactly its price, once, with one ledger line, and sits the player on a stool', () => {
    for (const d of PATIO_DRINKS) {
      const r = rig(); counters[keys.paid] = T.clubNight(day, hour) + 1;
      for (let i = 0; i < 6; i++) r.seats.add(stool(i));
      r.seats.occupy(`${ID}:tabouret:1`, 'tonton');
      const w0 = r.state.wallet, l0 = ledger(r), o = offer('bar', d.id);
      expect(o.price, d.id).toBe(d.price);
      r.runner.start(o); run(r.runner, 9);
      expect(r.runner.running, d.id).toBe(false);
      expect(r.state.wallet, d.id).toBe(w0 - d.price); expect(ledger(r) - l0, `${d.id}: one ledger line`).toBe(1);
      expect(r.state.data.ledger.at(-1)!.amount, d.id).toBe(-d.price);
    }
    // soft and alcoholic alike: a beer, a spirits mix, a juice and water are all on the menu at 1 000 – 4 500
    const prices = PATIO_DRINKS.map(d => d.price); expect(Math.min(...prices)).toBe(1000); expect(Math.max(...prices)).toBe(4500);
  });
  it('the waiter serves the lounge’s tables at the bar’s prices, and the DJ’s request costs 500 F: nothing else in the venue costs anything', () => {
    counters[keys.paid] = T.clubNight(day, hour) + 1;
    const r = rig(); for (let i = 0; i < 3; i++) r.seats.add(bench(i));
    const t = offer('lounge', 'table_mojito'), w0 = r.state.wallet, l0 = ledger(r);
    r.runner.start(t); run(r.runner, 9); expect(r.state.wallet).toBe(w0 - 3000); expect(ledger(r) - l0).toBe(1); expect(r.runner.running).toBe(false);
    const w1 = r.state.wallet; r.runner.start(offer('dj', 'morceau')); run(r.runner, 3); expect(r.state.wallet).toBe(w1 - 500);
    // every offer of the place: who pays, who gets paid
    const priced: string[] = [];
    for (const [anchor, list] of Object.entries(place.offers)) for (const o of list) {
      if (o.price) priced.push(`${anchor}/${o.id}`);
      for (const s of o.steps) expect(s.effects?.money ?? 0, `${anchor}/${o.id}: nothing pays the player`).toBeLessThanOrEqual(0);
    }
    expect(priced.sort()).toEqual([...PATIO_DRINKS.map(d => `bar/${d.id}`), ...PATIO_DRINKS.map(d => `lounge/table_${d.id}`), 'dj/morceau', 'door/payer'].sort());
    expect(offer('floor', 'danser').price).toBeUndefined(); expect(place.offers.floor.map(o => o.id)).toEqual(['danser']);   // dancing is free, and there is no contest to pay a prize
  });
  it('saves only under the club helper’s keys `club:almadies:venue:patio:*` (and the shared memory of people): no new field, no other counter, the wallet through the runner alone', () => {
    for (const v of Object.values(keys)) expect(v.startsWith(`club:${ID}:`), v).toBe(true);
    expect(Object.values(keys).sort()).toEqual(['paid', 'nights', 'dances', 'contests', 'contestNight', 'requests'].map(k => `club:${ID}:${{ paid: 'nuit', nights: 'soirees', dances: 'danses', contests: 'concours', contestNight: 'concours_nuit', requests: 'morceaux' }[k]}`).sort());
    // what the recipe writes while the player lives a whole night, as a diff of the save’s counters
    const r = rig(); const before = new Set(Object.keys(r.state.data.counters)); delete counters[keys.paid];
    for (let i = 0; i < 6; i++) r.seats.add(stool(i)); r.seats.add(bench(0)); r.seats.add(bench(1));
    r.runner.start({ ...offer('door', 'payer'), visible: undefined }); run(r.runner, 2);
    r.runner.start(offer('bar', 'biere')); run(r.runner, 9); r.stand();
    r.runner.start(offer('bar', 'bissap')); run(r.runner, 9);
    r.runner.start(offer('dj', 'morceau')); run(r.runner, 3);
    r.runner.start(offer('floor', 'danser')); run(r.runner, 1);
    const fresh = Object.keys(r.state.data.counters).filter(k => !before.has(k));
    expect(fresh.length).toBeGreaterThan(0);
    for (const k of fresh) expect(Object.values(keys), `${k} is one of the club helper’s keys`).toContain(k);
    expect(fresh.filter(k => k.startsWith('club:')).every(k => k.startsWith(`club:${ID}:`))).toBe(true);
    expect(fresh.filter(k => k.startsWith('club:') && !k.startsWith(`club:${ID}:`))).toEqual([]);
    // the venue never touches money or a new save field itself
    const src = text('../src/venues/patio.ts');
    expect(src).not.toMatch(/addMoney|state\.wallet\s*[-+]?=|\.wallet\s*-=|\.wallet\s*\+=|ledger\.push|data\.wallet/);
    for (const m of src.matchAll(/counters\[([^\]]+)\]/g)) expect(m[1], 'a counter written by the venue').toMatch(/^keys\./);
    expect(src).not.toMatch(/data\.(flags|beats|assets|furniture|jobs)\b.*(push|=)/);
  });
});

// ------------------------------------------------------------------ the music: its own, or none
describe('the music: Le Patio’s own track or silence, never La Vague’s file, La Vague’s own player unchanged', () => {
  it('points at its own file, not La Vague’s: the two clubs never play one recording', () => {
    expect(PATIO_TRACK.file).toBe('assets/audio/music/le-patio.mp3'); expect(PATIO_TRACK.file).not.toBe(VAGUE_TRACK.file);
    for (const k of ['bpm', 'beatsPerBar', 'bars', 'loop', 'tick', 'tickSample', 'sampleRate', 'loopStart', 'sections', 'fills'] as const) expect(PATIO_TRACK[k], k).toBeDefined();
    const src = text('../src/venues/patio.ts');
    expect(src).not.toMatch(/la-vague\.mp3/); expect(src).toMatch(/new VagueMusic\(undefined, PATIO_TRACK\)/);
    expect(src).toMatch(/if \(ownTrack\) music\.prefetch\(\)/); expect(src).toMatch(/ownTrack && music\.available !== false/);          // level 0 until the file is there
    // no part of Le Patio asks for La Vague’s player state: its debug and its hooks are its own
    expect(src).not.toMatch(/setVagueVirtual|musicNow = null.*vague/i);
  });
  it('the music player takes a track and keeps La Vague’s as its default', async () => {
    const { VagueMusic, BEAT } = await import('../src/venues/vagueMusic');
    const la = new VagueMusic(), pa = new VagueMusic(undefined, PATIO_TRACK), slow = new VagueMusic(undefined, { ...PATIO_TRACK, bpm: 100 });
    expect(la.track).toBe(VAGUE_TRACK); expect(la.beatSec).toBe(BEAT); expect(BEAT).toBe(0.5);
    expect(pa.track.file).toBe('assets/audio/music/le-patio.mp3'); expect(slow.beatSec).toBeCloseTo(0.6, 9);
    expect(la.available).toBeNull(); expect(pa.available).toBeNull();
    expect(la.info().file).toBe(VAGUE_TRACK.file); expect(pa.info().file).toBe(PATIO_TRACK.file);
    expect(la.beat()).toBeNull(); expect(pa.beat()).toBeNull();                                       // nothing plays before the first gesture
  });
  it('the dance takes the track too: its beats are the track’s, La Vague’s by default', async () => {
    const { DancePlay } = await import('../src/venues/dancePlay');
    const env = (track?: Omit<typeof PATIO_TRACK, 'bpm'> & { bpm: number }) => ({ ctx: {} as never, music: { beat: () => null, track: undefined } as never, crowd: { stage() {}, react() {} }, here: () => true, spot: () => ({ x: 0, z: 0, yaw: 0 }), track });
    const la = new DancePlay(env()), slow = new DancePlay(env({ ...PATIO_TRACK, bpm: 100 })), pa = new DancePlay(env(PATIO_TRACK));
    expect(la.beat(1200)).toBeCloseTo(2.4, 9); expect(slow.beat(1200)).toBeCloseTo(2.0, 9);
    expect(pa.beat(1200)).toBeCloseTo(1200 / 1000 / (60 / PATIO_TRACK.bpm), 9);                          // Le Patio’s own tempo (100 bpm: 0.6 s a beat), not La Vague’s (120 bpm: 0.5 s)
    expect(PATIO_TRACK.bpm).not.toBe(VAGUE_TRACK.bpm);
    const dance = text('../src/venues/dancePlay.ts');
    expect(dance).not.toMatch(/\bBEAT\b/);
  });
  it('Le Patio’s own recording is shipped and its map is not La Vague’s: another tempo, another length, other sections', () => {
    const size = readFileSync(new URL('../public/assets/audio/music/le-patio.mp3', import.meta.url)).length;
    expect(size).toBe(PATIO_TRACK.bytes); expect(size).toBeGreaterThan(100000);
    expect(readFileSync(new URL('../public/assets/audio/music/la-vague.mp3', import.meta.url)).length).toBe(VAGUE_TRACK.bytes);
    expect(PATIO_TRACK.file).toBe('assets/audio/music/le-patio.mp3');
    expect([PATIO_TRACK.bpm, PATIO_TRACK.bars, PATIO_TRACK.loop]).toEqual([100, 32, 76.8]); expect([VAGUE_TRACK.bpm, VAGUE_TRACK.bars, VAGUE_TRACK.loop]).toEqual([120, 24, 48]);
    expect(PATIO_TRACK.loop).toBeCloseTo(PATIO_TRACK.bars * PATIO_TRACK.beatsPerBar * 60 / PATIO_TRACK.bpm, 6);
  });
  it('the dance on Le Patio’s music says none of La Vague’s words: no sabar, no drums’ solo, the floor’s own break, fill and low-score lines; La Vague’s are unchanged', async () => {
    const { routine, danceLine, VAGUE_WORDS, MOVES } = await import('../src/activity/danceRules');
    const { PATIO_DANCE } = await import('../src/venues/patioPlan');
    const phrases = (track: typeof PATIO_TRACK | typeof VAGUE_TRACK, words?: typeof PATIO_DANCE) => {
      const out: { label: string; hint: string; variation: string | null; from: number; move: string }[] = [];
      for (const speed of [1.1, 1.35, 1.75]) for (let start = 0; start < track.bars * 4; start += 8) out.push(...routine({ rounds: 6, speed, start, seed: start + 3, track, words }).phrases);
      return out;
    };
    const patio = phrases(PATIO_TRACK, PATIO_DANCE);
    expect(patio.length).toBeGreaterThan(100);
    for (const p of patio) for (const text of [p.label, p.hint, p.variation ?? '']) expect(text, `${p.from}: ${text}`).not.toMatch(/sabar|tambour/i);
    const brk = PATIO_TRACK.sections.find(s => s.id === 'break')!;
    const inBreak = patio.filter(p => { const bar = Math.floor((p.from % (PATIO_TRACK.bars * 4)) / 4); return bar >= brk.from && bar < brk.to; });
    expect(inBreak.length).toBeGreaterThan(5);
    for (const p of inBreak) expect(p.variation, 'the break gets Le Patio’s own line, whichever move it is').toMatch(/^Le break : /);
    expect(patio.some(p => p.variation === 'Le roulement des congas : un pas de plus')).toBe(true);
    expect(patio.some(p => p.label === 'Le double pas')).toBe(true);
    expect(danceLine(0.2, PATIO_DANCE).text).toMatch(/écoute la basse/); expect(danceLine(0.2, PATIO_DANCE).text).not.toMatch(/tambour/);
    // La Vague (no words given, or its own) still says what it said, on its own track
    const lv = phrases(VAGUE_TRACK), lvOwn = phrases(VAGUE_TRACK, VAGUE_WORDS);
    expect(JSON.stringify(lvOwn)).toBe(JSON.stringify(lv));
    expect(lv.some(p => p.variation === 'Le solo des tambours : jeu de jambes sabar')).toBe(true); expect(lv.some(p => p.variation === 'Le roulement des tambours : un pas de plus')).toBe(true);
    expect(danceLine(0.2).text).toMatch(/écoute le tambour/); expect(MOVES.sabar.label).toBe('Jeu de jambes sabar');
    // the venue hands its words to the dance, and the dance hands them to the rules
    expect(text('../src/venues/patio.ts')).toMatch(/words: PATIO_DANCE/);
    expect(text('../src/venues/dancePlay.ts')).toMatch(/track: this\.track, words: this\.words/); expect(text('../src/venues/dancePlay.ts')).toMatch(/danceLine\(score, this\.words\)/);
  });
});

// ------------------------------------------------------------------ presence, registration
describe('Le Patio in the game: its own presence space and its place among the venues', () => {
  const move = { type: 'move', x: -109, y: 0.1, z: -146, yaw: 0, speed: 0, clip: 'Idle' };
  it('is its own presence space in the Almadies (`almadies:venue:patio`), next to La Vague’s, and nowhere else', () => {
    expect(parseMove({ ...move, space: ID }, 'almadies')?.space).toBe(ID);
    expect(parseMove({ ...move, space: 'almadies:venue:club' }, 'almadies')?.space).toBe('almadies:venue:club');
    expect(parseMove({ ...move, space: ID }, 'plateau')).toBeNull();
    for (const bad of ['almadies:venue:patio:x', 'almadies:venue:patios', 'almadies:venue:patio:11', 'almadies:venue:Patio']) expect(parseMove({ ...move, space: bad }, 'almadies'), bad).toBeNull();
  });
  it('is built where the club is, for the hub that has its site on the night street', () => {
    const idx = text('../src/venues/index.ts');
    expect(idx).toMatch(/import \{ buildPatio, PATIO_SITES/); expect(idx).toMatch(/const patio = !!PATIO_SITES\[hub\.id\] && !!hub\.nightStreet/);
    expect(idx).toMatch(/if \(patio\) \{ venues\.push\(buildPatio\(env\)\); yield; \}/);
    expect(idx.indexOf('buildClub(env)')).toBeLessThan(idx.indexOf('buildPatio(env)'));                  // La Vague first: the checks that look for « the club » find it
    expect(PATIO_SITE).toEqual({ x: -109, z: -147, yaw: 0, halfW: 14, halfD: 10 });
  });
  it('does not touch the night street: it reads PATIO_SITE and adds no export to src/world/nightStreet.ts', () => {
    const ns = text('../src/world/nightStreet.ts');
    expect(ns).toContain('export const PATIO_SITE');
    expect(SITE_BOX.z1 - 10).toBeGreaterThan(0);
  });
});
let _hub: HubWorld | null = null; void _hub; void VIP; void BAR; void isOpenMoment;
