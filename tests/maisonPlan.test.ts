import { describe, expect, it } from 'vitest';
import {
  PLANS, area, contains, fitsRoom, inner, isCovered, levelOfRoom, overlaps, passage, planFor, reachable, roomAt, stairParts, wallPieces, type Rect,
} from '../src/housing/plan';
import { MAISON_PLAN as M, MAISON_DOOR, COUR } from '../src/housing/maisonPlan';
import { homeSpec } from '../src/economy/catalog';
import { layoutOf } from '../src/economy/placement';

/** The family house of the Cité Jàmm: a floor plan on two levels (src/housing/maisonPlan.ts), checked like the villa's (tests/villaPlan.test.ts). */
const room = (id: string) => M.rooms.find(r => r.id === id)!;
const on = (lv: string) => M.rooms.filter(r => r.level === lv);
const house = (dx: number): Rect => ({ x0: -6 + dx, x1: 6 + dx, z0: -4.5, z1: 4.5 });
const box = (cx: number, cz: number, w: number, d: number): Rect => ({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });

describe('the Cité Jàmm house: a house inside', () => {
  it('is a plan home of the catalogue, on two levels, 12 m by 9 m', () => {
    expect(planFor('maison_cite')).toBe(M);
    expect(Object.keys(PLANS)).toEqual(['appart_jamm', 'maison_cite', 'villa_almadies']);
    expect(layoutOf(homeSpec('maison_cite')!).plan).toBe(M);
    expect(M.levels!.map(l => l.id)).toEqual(['rdc', 'etage']);
    expect(M.w).toBe(12); expect(M.d).toBe(9);
  });

  it('has what a house has: a salon, a dining room, a kitchen, bedrooms, bathrooms, stairs, a courtyard and a balcony over the street', () => {
    const names = (lv: string) => on(lv).map(r => r.id).sort();
    expect(names('rdc')).toEqual(['chambre', 'cour', 'cuisine', 'entree', 'hall', 'manger', 'salon', 'sde']);
    expect(names('etage')).toEqual(['balcon_rue', 'balcon_suite', 'chambre2', 'chambre3', 'couloir', 'palier', 'salon_familial', 'sdb', 'suite']);
    expect(on('etage').filter(r => r.kind === 'chambre')).toHaveLength(3);
    expect(room('cour').outdoor).toBe(true);
    expect(room('balcon_rue').outdoor).toBe(true);
  });

  it('each level\'s rooms tile the house (and the courtyard, the balconies) with no gap and no overlap', () => {
    const tile = (lv: string, dx: number, extra: Rect[]) => {
      const rs = on(lv), want = area(house(dx)) + extra.reduce((a, r) => a + area(r), 0);
      expect(rs.reduce((a, r) => a + area(r.box), 0), lv).toBeCloseTo(want, 6);
      for (const a of rs) for (const b of rs) if (a !== b) expect(overlaps(a.box, b.box), `${a.id} × ${b.id}`).toBe(false);
    };
    tile('rdc', 0, [COUR]);
    tile('etage', 20, [room('balcon_rue').box, room('balcon_suite').box]);
    for (const a of M.rooms) for (const b of M.rooms) if (a !== b && a.level !== b.level) expect(overlaps(a.box, b.box)).toBe(false);
  });

  it('rooms are big enough to live in on a phone (2.4 m inside, the bathrooms 2 m, the couloir 1.1 m, the balconies 1.1 m)', () => {
    const min: Record<string, number> = { degagement: 1.1, entree: 1.8, sdb: 2.0, balcon: 1.1, terrasse: 2.4 };
    for (const r of M.rooms) { const i = inner(M, r), across = Math.min(i.x1 - i.x0, i.z1 - i.z0); expect(across, r.id).toBeGreaterThanOrEqual(min[r.kind] ?? 2.4); }
    expect(area(inner(M, room('salon')))).toBeGreaterThan(22);
  });

  it('each opening sits on the wall its two rooms share, with wall on both sides; the street door in the entrance', () => {
    for (const o of M.openings) {
      const a = room(o.a).box, c = o.axis === 'x' ? o.x : o.z, lo = c - o.width / 2, hi = c + o.width / 2;
      const onLine = (r: Rect) => o.axis === 'x' ? Math.abs(r.z0 - o.z) < 1e-6 || Math.abs(r.z1 - o.z) < 1e-6 : Math.abs(r.x0 - o.x) < 1e-6 || Math.abs(r.x1 - o.x) < 1e-6;
      const span = (r: Rect) => o.axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
      expect(onLine(a), o.id).toBe(true);
      let [s0, s1] = span(a);
      if (o.b !== 'out') { const b = room(o.b); expect(onLine(b.box), o.id).toBe(true); expect(b.level, o.id).toBe(room(o.a).level); const [t0, t1] = span(b.box); s0 = Math.max(s0, t0); s1 = Math.min(s1, t1); }
      expect(lo - s0, `${o.id} start`).toBeGreaterThanOrEqual(0.15 - 1e-9);
      expect(s1 - hi, `${o.id} end`).toBeGreaterThanOrEqual(0.15 - 1e-9);
      expect(o.width).toBeGreaterThanOrEqual(0.8);
      if (o.kind === 'door') expect([o.a, o.b]).toContain(o.swing);
      for (const w of wallPieces(M)) expect(overlaps(w, passage(M, o)), o.id).toBe(false);
    }
    expect(M.openings.find(o => o.kind === 'front')).toMatchObject({ a: 'entree', x: MAISON_DOOR.x, z: MAISON_DOOR.z, width: MAISON_DOOR.width });
    expect(roomAt(M, M.spawn.x, M.spawn.z)?.id).toBe('entree');
    expect(Math.cos(M.spawn.yaw)).toBeLessThan(-0.9);
  });

  it('every fitting is inside its room and clear of the others; every window is on its room\'s outside wall', () => {
    for (const f of M.fixtures) expect(contains(inner(M, room(f.room)), f.box), f.id).toBe(true);
    for (const f of M.fixtures) for (const g of M.fixtures) if (f !== g && !contains(g.box, f.box) && !contains(f.box, g.box)) expect(overlaps(f.box, g.box), `${f.id} × ${g.id}`).toBe(false);
    for (const w of M.windows) {
      const b = room(w.room).box, along = w.side === 'n' || w.side === 's' ? [b.x0, b.x1] : [b.z0, b.z1];
      expect(w.at - w.width / 2, `${w.room} ${w.side}`).toBeGreaterThan(along[0]); expect(w.at + w.width / 2).toBeLessThan(along[1]);
      const line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side], axis = w.side === 'n' || w.side === 's' ? 'x' : 'z';
      expect(wallPieces(M).some(p => p.kind === 'wall' && p.outer && p.axis === axis && Math.abs(p.at - line) < 1e-6), `${w.room} ${w.side}`).toBe(true);
      expect(w.sill + w.height).toBeLessThan(M.wallH);
    }
  });

  it('a kitchen with its units and a fridge, a shower room, a bathroom with a bath', () => {
    const kinds = (rm: string) => M.fixtures.filter(f => f.room === rm).map(f => f.kind);
    expect(kinds('cuisine')).toEqual(expect.arrayContaining(['counter', 'sink', 'stove', 'fridge']));
    expect(kinds('sde')).toEqual(expect.arrayContaining(['shower', 'wc', 'basin']));
    expect(kinds('sdb')).toEqual(expect.arrayContaining(['bath', 'wc', 'basin']));
  });

  it('one flight of 17 steps of 0.2 m, 1.25 m wide, from the hall to the landing, inside both rooms', () => {
    const parts = stairParts(M);
    expect(parts.map(s => [s.lower.id, s.upper.id])).toEqual([['rdc', 'etage']]);
    const st = parts[0];
    expect(st.s.steps).toBe(17); expect((st.upper.y - st.lower.y) / st.s.steps).toBeCloseTo(0.2, 6);
    expect(st.box.x1 - st.box.x0).toBeGreaterThanOrEqual(1.1);
    expect(contains(inner(M, room(st.s.from)), st.box)).toBe(true);
    expect(contains(inner(M, room(st.s.to)), st.well)).toBe(true);
    // the foot has room in front of it (the dining room's arch opens on it) and the head a landing beyond
    const hall = inner(M, room('hall'));
    expect(st.s.box.z0 - hall.z0).toBeGreaterThan(1.8); expect(hall.z1 - st.s.box.z1).toBeLessThan(0.4);
  });

  it('can be walked from the street door to every room of both levels, across the stairs', () => {
    expect(reachable(M, [])).toEqual({ ok: true, rooms: [], openings: [] });
    const foot = reachable(M, [box(3.9, -3.4, 1.4, 0.6)]);                                   // a wardrobe across the foot of the flight
    expect(foot.ok).toBe(false);
    expect(foot.rooms).toEqual(expect.arrayContaining(['palier', 'suite', 'chambre2', 'salon_familial']));
    expect(foot.rooms).not.toContain('salon');
  });

  it('the rooms under the first floor are covered; the courtyard and the balconies are open to the sky', () => {
    for (const id of ['salon', 'manger', 'chambre', 'cuisine', 'entree', 'sde']) expect(isCovered(M, room(id)), id).toBe(true);
    for (const id of ['cour', 'balcon_rue', 'balcon_suite', 'palier']) expect(isCovered(M, room(id)), id).toBe(false);
    expect(levelOfRoom(M, room('suite')).y).toBeCloseTo(3.4);
  });

  it('furniture goes where it fits: a sofa in the salon yes, in the stair hall no, through a wall no', () => {
    expect(fitsRoom(M, box(-3.5, -2, 2.0, 0.9))?.id).toBe('salon');
    expect(fitsRoom(M, box(-1.2, -2.2, 0.9, 0.9))).toBeNull();                                // in the arch between the salon and the dining room
  });
});
