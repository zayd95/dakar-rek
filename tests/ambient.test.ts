import { describe, it, expect } from 'vitest';
import {
  activityLevel, capacity, chooseSeat, curveAt, dayOfWeek, fits, inHours, isNpcOccupant, planDemand, prayerRows, ring, pair,
  seatCapacity, wanted, QIBLA_YAW, KEEP_FREE, type AmbientSpot, type SeatLike,
} from '../src/social/ambient';
import { ACTIVITIES, AMBIENT_BUDGET, LEGACY_TAGS, PLACE_TAGS, PRAYERS, TRAFFIC_BY_HOUR, WALKERS_BY_HOUR } from '../src/social/ambientData';
import { buildSpots, furnitureSeats, ANCHOR_ROOM } from '../src/social/ambientSpots';
import type { PlaceSpec } from '../src/activity/places';

const act = (id: string) => ACTIVITIES.find(a => a.id === id)!;
const seat = (id: string, x: number, z: number, o: Partial<SeatLike> = {}): SeatLike => ({ id, x, z, top: 0.58, yaw: 0, kind: 'bench', space: 'street', occupant: null, ...o });
const spot = (id: string, tags: string[], o: Partial<AmbientSpot> = {}): AmbientSpot => ({ id, tags, space: 'street', x: 0, z: 0, seats: [], stands: [], source: 'legacy', ...o });
const MON = 0, FRI = 4, SAT = 5, SUN = 6;

/** Seats of a fake registry and the scheduler's view of them. */
function registry(list: SeatLike[]) {
  const byId = new Map(list.map(s => [s.id, s]));
  return { list, kind: (id: string) => byId.get(id)?.kind ?? null, get: (id: string) => byId.get(id)! };
}
const plan = (spots: AmbientSpot[], kind: (id: string) => string | null, hour: number, dow = MON, o: Partial<Parameters<typeof planDemand>[2]> = {}) =>
  planDemand(spots, ACTIVITIES, { hour, dow, scale: 1, px: 0, pz: 0, near: 70, far: 130, cap: 100, space: 'street', seatKind: kind, ...o });
const acts = (rows: ReturnType<typeof planDemand>, spotId?: string) => rows.filter(r => !spotId || r.spot.id === spotId).map(r => r.act.id);

describe('ambient life: calendar and hours', () => {
  it('city day 1 is a Tuesday (6 Oct 2026) and the week repeats', () => {
    expect(dayOfWeek(1)).toBe(1);
    expect(dayOfWeek(4)).toBe(FRI);
    expect(dayOfWeek(6)).toBe(SUN);
    expect(dayOfWeek(7)).toBe(MON);
    expect(dayOfWeek(190)).toBe(dayOfWeek(190 + 70));
  });
  it('hour windows may pass midnight', () => {
    expect(inHours(23, [18.5, 1.5])).toBe(true);
    expect(inHours(0.5, [18.5, 1.5])).toBe(true);
    expect(inHours(2, [18.5, 1.5])).toBe(false);
    expect(inHours(12, [11, 14])).toBe(true);
    expect(inHours(14, [11, 14])).toBe(false);
  });
  it('curves are interpolated, also across midnight', () => {
    expect(curveAt([[10, 0], [12, 1]], 11)).toBeCloseTo(0.5);
    expect(curveAt([[10, 0], [12, 1]], 8)).toBe(0);
    expect(curveAt([[20, 1], [23, 0.6], [1, 0.2]], 0)).toBeCloseTo(0.4);
    for (const c of [WALKERS_BY_HOUR, TRAFFIC_BY_HOUR]) for (let h = 0; h < 24; h += 0.5) { const v = curveAt(c, h); expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
    expect(curveAt(WALKERS_BY_HOUR, 3)).toBeLessThan(curveAt(WALKERS_BY_HOUR, 12));      // fewer walkers late at night
    expect(curveAt(TRAFFIC_BY_HOUR, 3)).toBeLessThan(curveAt(TRAFFIC_BY_HOUR, 8));
  });
  it('activity level: zero outside its windows and days, ramps in and out, day boosts', () => {
    expect(activityLevel(act('dejeuner'), 10, MON)).toBe(0);
    expect(activityLevel(act('dejeuner'), 13.5, MON)).toBeGreaterThan(0.8);
    expect(activityLevel(act('dejeuner'), 12.35, MON)).toBeLessThan(activityLevel(act('dejeuner'), 13.5, MON));   // arriving
    expect(activityLevel(act('ajjuma'), 14, MON)).toBe(0);                                                         // Fridays only
    expect(activityLevel(act('ajjuma'), 14, FRI)).toBeGreaterThan(0.5);
    expect(activityLevel(act('dibi'), 22, SAT)).toBeGreaterThan(activityLevel(act('dibi'), 22, MON));               // Saturday night
    expect(activityLevel(act('plage'), 15, MON)).toBe(0);
    expect(activityLevel(act('plage'), 15, SUN)).toBeGreaterThan(0);
  });
});

describe('ambient life: data', () => {
  const tags = new Set<string>([...Object.values(PLACE_TAGS).flat(), ...LEGACY_TAGS.flatMap(r => r.tags), 'bench', 'corner', 'promenade', 'beachwalk', 'pitch', 'attaya', 'dames', 'stall', 'mosque', 'square', 'place']);
  it('every activity happens somewhere the spot builders create', () => {
    for (const a of ACTIVITIES) expect(a.at.some(t => tags.has(t)), a.id).toBe(true);
  });
  it('activities are well formed', () => {
    const ids = new Set<string>();
    for (const a of ACTIVITIES) {
      expect(ids.has(a.id), a.id).toBe(false); ids.add(a.id);
      expect(a.clips.length, a.id).toBeGreaterThan(0);
      expect(a.stay[0], a.id).toBeLessThanOrEqual(a.stay[1]);
      expect(a.hours.length, a.id).toBeGreaterThan(0);
      if (a.pose === 'sit') expect(a.clips, a.id).toEqual(['Sit']);
      if (a.pose === 'route' || a.pose === 'roam') expect(a.speed, a.id).toBeTruthy();
    }
  });
  it('prayer is presence and posture only: standing rows, no talking clip, mosque only', () => {
    for (const a of ACTIVITIES.filter(x => x.at.includes('mosque') && x.pose === 'row')) {
      expect(a.clips).toEqual(['Idle']);
      expect(a.at).toEqual(['mosque']);
    }
    const priere = act('priere');
    for (const p of PRAYERS) expect(activityLevel(priere, (p.hours[0] + p.hours[1]) / 2, MON), p.id).toBeGreaterThan(0.5);
    expect(activityLevel(priere, 11, MON)).toBe(0);
  });
  it('the budget grows with quality and stays within the walkers’ caps of main.ts', () => {
    const [lo, me, hi] = [AMBIENT_BUDGET.low, AMBIENT_BUDGET.medium, AMBIENT_BUDGET.high];
    for (const k of ['population', 'bodies', 'full', 'far', 'totalFull', 'scale'] as const) { expect(lo[k]).toBeLessThan(me[k]); expect(me[k]).toBeLessThan(hi[k]); }
    expect(lo.bodies).toBeLessThanOrEqual(8); expect(me.bodies).toBeLessThanOrEqual(12); expect(hi.bodies).toBeLessThanOrEqual(16);
    expect(lo.totalFull).toBeGreaterThanOrEqual(lo.bodies);
  });
});

describe('ambient life: seats', () => {
  it('capacity always leaves free seats for players', () => {
    expect(seatCapacity(0)).toBe(0);
    expect(seatCapacity(1)).toBe(0);           // a single seat is the player's
    expect(seatCapacity(2)).toBe(1);
    expect(seatCapacity(3)).toBe(1);           // a bench of three: one person, two free
    expect(seatCapacity(6)).toBe(3);
    expect(seatCapacity(12)).toBe(7);
    expect(seatCapacity(32, 0.1)).toBe(28);    // prayer rows keep a few places
    for (let n = 2; n < 40; n++) for (const k of [0.1, KEEP_FREE, 0.5]) expect(n - seatCapacity(n, k)).toBeGreaterThanOrEqual(Math.max(1, Math.ceil(n * k)));
  });
  it('never takes an occupied seat (the player, a remote player, another character)', () => {
    const list = [seat('a', 0, 0, { occupant: 'player' }), seat('b', 1, 0, { occupant: 'remote:42' }), seat('c', 2, 0, { occupant: 'npc' }), seat('d', 3, 0)];
    for (let r = 0; r < 1; r += 0.05) { const s = chooseSeat(list, { r, keepFree: 0 }); expect(s?.id ?? 'd').toBe('d'); }
  });
  it('counts every non-player character toward the place’s capacity', () => {
    const list = [seat('a', 0, 0, { occupant: 'npc:cast:ibou' }), seat('b', 1, 0), seat('c', 2, 0)];
    expect(isNpcOccupant('npc:cast:ibou')).toBe(true); expect(isNpcOccupant('player')).toBe(false);
    expect(chooseSeat(list, { r: 0.3 })).toBeNull();                    // 3 seats: one character already, the rest is for players
    const six = Array.from({ length: 6 }, (_, i) => seat('s' + i, i, 0));
    expect(chooseSeat(six, { r: 0.3 })).not.toBeNull();
  });
  it('filling a place until it refuses leaves the right number free and never touches the player’s seat', () => {
    let rnd = 7;
    const r = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
    for (let trial = 0; trial < 60; trial++) {
      const n = 2 + Math.floor(r() * 14);
      const list = Array.from({ length: n }, (_, i) => seat('s' + i, i * 0.8, 0, { occupant: r() < 0.15 ? 'player' : r() < 0.1 ? 'npc' : null }));
      const before = list.filter(s => s.occupant === 'player').map(s => s.id);
      for (;;) { const s = chooseSeat(list, { r: r() }); if (!s) break; expect(s.occupant).toBeNull(); s.occupant = 'npc:amb:' + s.id; }
      const npc = list.filter(s => isNpcOccupant(s.occupant)).length;
      expect(npc).toBeLessThanOrEqual(Math.max(seatCapacity(n), list.filter(s => s.occupant === 'npc').length));
      expect(list.filter(s => s.occupant === 'player').map(s => s.id)).toEqual(before);
      expect(list.filter(s => !s.occupant || s.occupant === 'player').length).toBeGreaterThanOrEqual(1);
    }
  });
  it('avoids seats it is told to (next to the player, kept for the cast) and sits companions together', () => {
    const list = Array.from({ length: 9 }, (_, i) => seat('s' + i, i, 0));
    for (let r = 0; r < 1; r += 0.1) expect(chooseSeat(list, { r, avoid: s => s.x < 6 })!.x).toBeGreaterThanOrEqual(6);
    expect(chooseSeat(list, { r: 0.5, near: { x: 4.1, z: 0 } })!.id).toBe('s4');
  });
  it('kinds: vehicle seats are only for riding, prayer seats only for rows', () => {
    const list = [seat('v', 0, 0, { kind: 'vehicle' }), seat('v2', 1, 0, { kind: 'vehicle' }), seat('v3', 2, 0, { kind: 'vehicle' })];
    expect(chooseSeat(list, { r: 0.4 })).toBeNull();
    expect(chooseSeat(list, { r: 0.4, kinds: ['vehicle'] })).not.toBeNull();
    const reg = registry([seat('p0', 0, 0, { kind: 'prayer', top: 0.05 }), seat('p1', 1, 0, { kind: 'prayer', top: 0.05 }), seat('p2', 2, 0, { kind: 'prayer', top: 0.05 })]);
    const mosque = spot('m', ['mosque'], { seats: reg.list.map(s => s.id) });
    expect(fits(act('priere'), mosque, reg.kind)).toBe(true);
    expect(capacity(act('priere'), mosque, reg.kind)).toBe(2);
    expect(fits(act('banc'), spot('b', ['bench'], { seats: ['p0'] }), reg.kind)).toBe(false);   // nobody sits on a prayer row
  });
});

describe('ambient life: who does what, where, when', () => {
  const reg = registry([
    ...Array.from({ length: 6 }, (_, i) => seat('kiosk:' + i, i, 0)),
    ...Array.from({ length: 3 }, (_, i) => seat('bench:' + i, 50 + i, 0)),
    ...Array.from({ length: 4 }, (_, i) => seat('stop:' + i, 0, 20 + i)),
  ]);
  const gargote = spot('gargote', ['eat', 'kiosk'], { seats: reg.list.slice(0, 6).map(s => s.id), stands: [{ x: 0, z: 2, yaw: 0 }, { x: 1, z: 2, yaw: 0 }], hours: [7, 23] });
  const dibi = spot('dibi', ['dibi'], { seats: reg.list.slice(0, 6).map(s => s.id), stands: [{ x: 0, z: 2, yaw: 0 }], hours: [11, 2] });
  const bench = spot('bench', ['bench'], { x: 50, seats: reg.list.slice(6, 9).map(s => s.id) });
  const stop = spot('stop', ['stop'], { z: 20, seats: reg.list.slice(9).map(s => s.id), stands: ring(0, 20, 2, 8) });
  const mosque = spot('mosque', ['mosque'], { x: 10, rows: prayerRows(10, 0, 3, 6), stands: ring(10, 0, 3, 6) });
  const prom = spot('prom', ['promenade'], { x: -40, route: [{ x: -40, z: -30 }, { x: -40, z: 30 }] });
  const corner = spot('corner', ['corner'], { x: 30, stands: pair(30, 0, 0), prio: 1.6 });
  const pitch = spot('pitch', ['pitch'], { x: 20, z: 40, area: [0, 30, 40, 50] });
  const all = [gargote, dibi, bench, stop, mosque, prom, corner, pitch];

  it('lunch at the gargote at 13 h, nobody eating there at 10 h, dinner at 20 h', () => {
    expect(acts(plan(all, reg.kind, 13.5), 'gargote')).toContain('dejeuner');
    expect(acts(plan(all, reg.kind, 10.5), 'gargote')).not.toContain('dejeuner');
    expect(acts(plan(all, reg.kind, 20.5), 'gargote')).toContain('diner');
  });
  it('closed places are empty: the Dibi opens at 11 h and is busy at night until it closes', () => {
    expect(acts(plan(all, reg.kind, 9), 'dibi')).toEqual([]);
    expect(acts(plan(all, reg.kind, 23, SAT), 'dibi')).toContain('dibi');
    expect(acts(plan(all, reg.kind, 3, SAT), 'dibi')).toEqual([]);
  });
  it('people wait at the stop, more at rush hour than mid-afternoon', () => {
    const n = (h: number) => plan(all, reg.kind, h).filter(r => r.spot === stop).reduce((v, r) => v + r.n, 0);
    expect(n(7.5)).toBeGreaterThan(n(14.5));
    expect(n(7.5)).toBeGreaterThanOrEqual(3);
    expect(acts(plan(all, reg.kind, 7.5), 'stop')).toContain('attendre-car');
  });
  it('rows at the mosque at prayer time only, fuller on Friday', () => {
    const rows = (h: number, d = MON) => plan(all, reg.kind, h, d).filter(r => r.spot === mosque && r.act.pose === 'row').reduce((v, r) => v + r.n, 0);
    expect(rows(11)).toBe(0);
    expect(rows(19.3)).toBeGreaterThan(3);
    expect(rows(14, FRI)).toBeGreaterThan(rows(14, MON));
    expect(rows(14, FRI)).toBeLessThanOrEqual(mosque.rows!.length);
  });
  it('joggers in the morning and evening, football on Sunday morning', () => {
    expect(acts(plan(all, reg.kind, 7), 'prom')).toContain('jogging');
    expect(acts(plan(all, reg.kind, 13), 'prom')).toEqual([]);
    expect(acts(plan(all, reg.kind, 10, SUN), 'pitch')).toContain('foot-dimanche');
    expect(acts(plan(all, reg.kind, 10, MON), 'pitch')).toEqual([]);
  });
  it('the city is busier at 19 h than at 4 h', () => {
    const total = (h: number) => plan(all, reg.kind, h).reduce((v, r) => v + r.n, 0);
    expect(total(19.8)).toBeGreaterThan(total(4) + 5);
  });
  it('a spot never gets more people than its places, nor more seats than its capacity', () => {
    for (let h = 0; h < 24; h += 0.25) for (const d of [MON, FRI, SUN]) for (const r of plan(all, reg.kind, h, d)) {
      expect(r.n, `${r.spot.id}/${r.act.id} at ${h}`).toBeLessThanOrEqual(capacity(r.act, r.spot, reg.kind));
      if (r.act.pose === 'sit') expect(r.n).toBeLessThanOrEqual(seatCapacity(r.spot.seats.length));
    }
  });
  it('more life where the player is: the population cap goes to the nearest spots, far spots stay empty', () => {
    const far = spot('far-gargote', ['eat'], { x: 200, seats: gargote.seats, stands: gargote.stands, hours: [7, 23] });
    const rows = plan([...all, far], reg.kind, 13.5, MON, { cap: 4 });
    expect(rows.reduce((v, r) => v + r.n, 0)).toBe(4);
    expect(rows.every(r => r.spot !== far)).toBe(true);
    const corners = plan([corner, gargote], reg.kind, 13.5, MON, { cap: 3, px: 16 });    // corners rank after places at the same distance
    expect(corners[0].spot).toBe(gargote);
  });
  it('the people of a room are planned only while the player is in it', () => {
    const room = spot('room', ['eat'], { space: 'pikine:gargote:32', seats: gargote.seats, hours: [7, 23] });
    expect(plan([room], reg.kind, 13.5).length).toBe(0);
    expect(plan([room], reg.kind, 13.5, MON, { space: 'pikine:gargote:32' }).length).toBeGreaterThan(0);
  });
  it('head counts are stable within ten minutes (no flicker) and scale with quality', () => {
    const a = act('dejeuner');
    expect(wanted(a, gargote, 13.51, MON, 1, 9)).toBe(wanted(a, gargote, 13.59, MON, 1, 9));
    let lo = 0, hi = 0;
    for (let h = 12.5; h < 15.5; h += 0.2) { lo += wanted(a, gargote, h, MON, AMBIENT_BUDGET.low.scale, 9); hi += wanted(a, gargote, h, MON, AMBIENT_BUDGET.high.scale, 9); }
    expect(lo).toBeLessThan(hi);
  });
});

describe('ambient life: spots from the registries and the hub', () => {
  const layout = { specials: [{ kind: 'mosque' as const, x: -30, z: -30 }, { kind: 'pitch' as const, x: 60, z: 0 }], sea: 'west' as const };
  const base = { interactables: [] as { id: string; x: number; z: number }[], layout, colliders: [], people: [], arena: null };

  it('a place registered by another lane is populated by its type, with its seats and hours', () => {
    const dibi: PlaceSpec = { id: 'dibi-test', type: 'dibi', name: 'Dibi', space: 'street', hours: [11, 2], anchors: [{ id: 'counter', kind: 'counter', x: 0, z: 0 }], offers: {} };
    const seats = Array.from({ length: 6 }, (_, i) => seat('t:' + i, -2 + i * 0.8, 3));
    const spots = buildSpots({ ...base, places: [dibi], seats });
    const s = spots.find(x => x.place === 'dibi-test')!;
    expect(s.tags).toContain('dibi');
    expect(s.seats).toHaveLength(6);
    expect(s.hours).toEqual([11, 2]);
    expect(s.stands.every(p => Math.hypot(p.x, p.z) >= ANCHOR_ROOM)).toBe(true);    // nobody stands where the player orders
    const reg = registry(seats);
    expect(acts(plan(spots, reg.kind, 21), 'place:dibi-test')).toContain('dibi');
  });
  it('a registered place replaces the legacy place of the same family next to it', () => {
    const legacy = { id: 'plateau:dibiterie:12', x: 5, z: 5 };
    const dibi: PlaceSpec = { id: 'dibi-new', type: 'dibi', name: 'Dibi', space: 'street', anchors: [{ id: 'counter', kind: 'counter', x: 4, z: 4 }], offers: {} };
    expect(buildSpots({ ...base, interactables: [legacy], places: [], seats: [] }).some(s => s.id === 'legacy:plateau:dibiterie:12')).toBe(true);
    expect(buildSpots({ ...base, interactables: [legacy], places: [dibi], seats: [] }).some(s => s.id === 'legacy:plateau:dibiterie:12')).toBe(false);
  });
  it('a mosque place with prayer seats fills them in rows; the forecourt rows face the qibla', () => {
    const m: PlaceSpec = { id: 'mosque-v', type: 'mosque', name: 'Mosquée', space: 'mosque:1', anchors: [{ id: 'hall', kind: 'place', x: 1000, z: 0 }], offers: {} };
    const seats = Array.from({ length: 12 }, (_, i) => seat('pr:' + i, 1000 + (i % 6), Math.floor(i / 6), { kind: 'prayer', top: 0.05, space: 'mosque:1' }));
    const spots = buildSpots({ ...base, places: [m], seats });
    const s = spots.find(x => x.place === 'mosque-v')!;
    expect(s.seats).toHaveLength(12);
    const reg = registry(seats);
    const rows = plan(spots, reg.kind, 19.3, MON, { space: 'mosque:1' }).filter(r => r.spot === s);
    expect(rows.find(r => r.act.id === 'priere')!.n).toBeGreaterThan(3);
    // the legacy forecourt of the hub's mosque is replaced only by a street mosque nearby, so it stays here
    const yard = spots.find(x => x.id.startsWith('special:mosque'))!;
    expect(yard.rows!.every(r => Math.abs(r.yaw - QIBLA_YAW) < 1e-9)).toBe(true);
    expect(Math.sin(QIBLA_YAW)).toBeGreaterThan(0.8);                                 // east…
    expect(Math.cos(QIBLA_YAW)).toBeLessThan(-0.4);                                   // …north-east (−z is north)
  });
  it('a stop registered by the transport lane gets people waiting', () => {
    const st: PlaceSpec = { id: 'stop-1', type: 'stop', name: 'Arrêt', space: 'street', anchors: [{ id: 'stop', kind: 'spot', x: 0, z: 0 }], offers: {} };
    const spots = buildSpots({ ...base, places: [st], seats: [] });
    expect(acts(plan(spots, registry([]).kind, 7.5), 'place:stop-1')).toContain('attendre-car');
  });
  it('remaining benches, the pitch, the promenade and street corners become spots', () => {
    const spots = buildSpots({ ...base, places: [], seats: [seat('x:bench:0:0', 40, 40), seat('x:bench:0:1', 41, 40), seat('x:bench:0:2', 42, 40)] });
    expect(spots.find(s => s.id === 'seats:x:bench:0')!.seats).toHaveLength(3);
    expect(spots.some(s => s.tags.includes('pitch') && s.area)).toBe(true);
    expect(spots.filter(s => s.tags.includes('promenade')).length).toBeGreaterThanOrEqual(3);
    expect(spots.filter(s => s.source === 'corner').length).toBeGreaterThan(4);
    expect(spots.every(s => s.seats.every(id => spots.filter(o => o.seats.includes(id)).length === 1))).toBe(true);   // one spot per seat
  });
  it('standing places avoid solid objects and builder-placed people', () => {
    const cols = [{ x0: -1, z0: -1, x1: 1, z1: 1, h: 2 }];
    const spots = buildSpots({ ...base, colliders: cols, people: [{ x: 0, z: 2.1 }], places: [{ id: 'p', type: 'market', name: 'M', space: 'street', anchors: [{ id: 'a', kind: 'counter', x: 0, z: 0 }], offers: {} }], seats: [] });
    const s = spots.find(x => x.place === 'p')!;
    expect(s.stands.length).toBeGreaterThan(0);
    for (const p of s.stands) { expect(Math.hypot(p.x, p.z - 2.1)).toBeGreaterThanOrEqual(0.8); expect(p.x < -1.3 || p.x > 1.3 || p.z < -1.3 || p.z > 1.3).toBe(true); }
  });
  it('derives seats for kiosk benches once, never on top of an existing seat', () => {
    const gargote = { id: 'pikine:gargote:32', x: 78, z: 54.5 };
    const made = furnitureSeats([gargote], layout, []);
    expect(made).toHaveLength(6);
    expect(new Set(made.map(s => s.id)).size).toBe(6);
    expect(made.every(s => Math.abs(s.z - 55.7) < 1e-6 && s.yaw === 0)).toBe(true);   // facing the low table and the street
    expect(furnitureSeats([gargote], layout, made)).toHaveLength(0);
    const spots = buildSpots({ ...base, interactables: [gargote], places: [], seats: made });
    const s = spots.find(x => x.id === 'legacy:pikine:gargote:32')!;
    expect(s.seats).toHaveLength(6);
    for (const id of s.seats) expect(s.seatApproach![id].z).toBeLessThan(55.7);       // sit down from behind, not through the table
  });
});
