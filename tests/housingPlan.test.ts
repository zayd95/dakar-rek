import { describe, expect, it } from 'vitest';
import { F2_JAMM as P, PLANS, area, clearZones, contains, fitsRoom, inner, overlaps, passage, planFor, reachable, roomAt, wallPieces, whyNotPlan, type Rect } from '../src/housing/plan';

const box = (cx: number, cz: number, w: number, d: number): Rect => ({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
const room = (id: string) => P.rooms.find(r => r.id === id)!;
const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

describe('the F2 of the Résidence Jàmm: a floor plan (LD2.0-C)', () => {
  it('is the apartment\'s plan; the other homes keep their open room (LD2.0-D: but the Almadies villa, on three levels: tests/villaPlan.test.ts)', () => {
    expect(planFor('appart_jamm')).toBe(P);
    expect(planFor('maison_cite')).not.toBeNull();   // the family house has its own plan (tests/maisonPlan.test.ts)
    expect(planFor('residence_ngor')).toBeNull();
    expect(Object.keys(PLANS)).toEqual(['appart_jamm', 'maison_cite', 'villa_almadies']);
  });

  it('has the rooms the brief asks for, and they tile the home with no gap and no overlap', () => {
    expect(new Set(P.rooms.map(r => r.kind))).toEqual(new Set(['entree', 'sejour', 'cuisine', 'chambre', 'sdb', 'degagement']));
    expect(P.rooms.reduce((a, r) => a + area(r.box), 0)).toBeCloseTo(P.w * P.d, 6);
    for (const a of P.rooms) {
      expect(contains({ x0: -P.w / 2, x1: P.w / 2, z0: -P.d / 2, z1: P.d / 2 }, a.box)).toBe(true);
      for (const b of P.rooms) if (a !== b) expect(overlaps(a.box, b.box), `${a.id} × ${b.id}`).toBe(false);
    }
  });

  it('rooms are big enough to live in on a phone (at least 2.4 m across inside; the bathroom 2 m, the entrance 1.8 m, the hall 1.1 m)', () => {
    for (const r of P.rooms) {
      const i = inner(P, r), across = Math.min(i.x1 - i.x0, i.z1 - i.z0);
      expect(across, r.id).toBeGreaterThanOrEqual(({ degagement: 1.1, entree: 1.8, sdb: 2.0 } as Record<string, number>)[r.kind] ?? 2.4);
    }
  });

  it('each opening sits on the wall its two rooms share, with wall left on both sides; the street door on the outside wall', () => {
    for (const o of P.openings) {
      const a = room(o.a).box, c = o.axis === 'x' ? o.x : o.z, lo = c - o.width / 2, hi = c + o.width / 2;
      const onLine = (r: Rect) => o.axis === 'x' ? Math.abs(r.z0 - o.z) < 1e-6 || Math.abs(r.z1 - o.z) < 1e-6 : Math.abs(r.x0 - o.x) < 1e-6 || Math.abs(r.x1 - o.x) < 1e-6;
      const span = (r: Rect) => o.axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
      expect(onLine(a), o.id).toBe(true);
      let [s0, s1] = span(a);
      if (o.b === 'out') expect(Math.abs(o.axis === 'x' ? o.z : o.x)).toBeCloseTo(o.axis === 'x' ? P.d / 2 : P.w / 2, 6);
      else { const b = room(o.b).box; expect(onLine(b), o.id).toBe(true); const [t0, t1] = span(b); s0 = Math.max(s0, t0); s1 = Math.min(s1, t1); }
      expect(lo - s0, `${o.id} start`).toBeGreaterThanOrEqual(0.15);
      expect(s1 - hi, `${o.id} end`).toBeGreaterThanOrEqual(0.15);
      expect(o.width).toBeGreaterThanOrEqual(0.8);
      if (o.kind === 'door') expect([o.a, o.b]).toContain(o.swing);
    }
  });

  it('finds the room a point is in; a doorway is in no room', () => {
    for (const r of P.rooms) expect(roomAt(P, centre(r.box).x, centre(r.box).z)?.id).toBe(r.id);
    for (const o of P.openings) expect(roomAt(P, o.x, o.z), o.id).toBeNull();
    expect(roomAt(P, 100, 0)).toBeNull();
  });

  it('builds its walls from the rooms: no wall across an opening, every room closed except through its openings', () => {
    const walls = wallPieces(P);
    for (const o of P.openings) for (const w of walls) expect(overlaps(w, passage(P, o)), `${o.id}`).toBe(false);
    // the outside: walls along all four sides except the street door
    const outer = walls.filter(w => w.outer), len = (axis: 'x' | 'z') => outer.filter(w => w.axis === axis).reduce((a, w) => a + (axis === 'x' ? w.x1 - w.x0 : w.z1 - w.z0), 0);
    expect(len('x')).toBeGreaterThan(2 * P.w - 1.0);
    expect(len('z')).toBeGreaterThan(2 * P.d - 0.01);
    // a room's inside touches no wall
    for (const r of P.rooms) for (const w of walls) expect(overlaps(inner(P, r), w), `${r.id}`).toBe(false);
  });

  it('puts every fitting inside its room and every window on its room\'s outside wall', () => {
    for (const f of P.fixtures) expect(contains(inner(P, room(f.room)), f.box), f.id).toBe(true);
    for (const w of P.windows) {
      const b = room(w.room).box, along = w.side === 'n' || w.side === 's' ? [b.x0, b.x1] : [b.z0, b.z1];
      const line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side];
      expect(Math.abs(line), `${w.room} ${w.side}`).toBeCloseTo(w.side === 'n' || w.side === 's' ? P.d / 2 : P.w / 2, 6);
      expect(w.at - w.width / 2).toBeGreaterThan(along[0]); expect(w.at + w.width / 2).toBeLessThan(along[1]);
      expect(w.sill + w.height).toBeLessThan(P.wallH);
    }
  });

  it('keeps each door\'s swing in the room it opens into, and the entry clear inside the street door', () => {
    const cz = clearZones(P);
    for (const o of P.openings.filter(q => q.kind === 'door')) {
      const swing = cz.find(c => c.why === 'door' && overlaps(c, box(o.x, o.z, o.width + 2, o.width + 2)) && fitsRoom(P, c)?.id === o.swing);
      expect(swing, o.id).toBeTruthy();
    }
    expect(cz.some(c => c.why === 'entry' && fitsRoom(P, c)?.id === 'entree')).toBe(true);
  });

  it('spawns in the entrance hall, facing in', () => {
    expect(roomAt(P, P.spawn.x, P.spawn.z)?.id).toBe('entree');
    expect(Math.cos(P.spawn.yaw)).toBeLessThan(-0.9);     // facing −z, away from the street door
  });

  it('says where furniture can go: a bed in the bedroom yes; through a wall, in a doorway, on the counter or in a door\'s swing no', () => {
    const ch = inner(P, room('chambre'));
    expect(whyNotPlan(P, box(ch.x0 + 1.0, (ch.z0 + ch.z1) / 2, 2.0, 1.6))).toBeNull();
    expect(whyNotPlan(P, box(-1.0, -2.5, 1.0, 0.6))).toBe('wall');
    expect(whyNotPlan(P, box(0.5, 0, 1.2, 0.5))).toBe('wall');                        // across the séjour–dégagement arch
    expect(whyNotPlan(P, box(4.0, -2.0, 0.4, 0.4))).toBe('fitting');
    expect(whyNotPlan(P, box(2.45, 0.7, 0.6, 0.6))).toBe('door');                     // just inside the kitchen, where its door swings
    expect(whyNotPlan(P, box(0.5, 0.5, 1.0, 0.6))).toBe('passage');                   // in front of the arch, in the séjour
    expect(whyNotPlan(P, box(0.5, 0.5, 1.0, 0.6), { rug: true })).toBeNull();
    expect(whyNotPlan(P, box(50, 0, 1, 1))).toBe('outside');
  });

  it('can be walked from the street door to every room and through every opening; a wardrobe across the hall cuts the bedroom and the bathroom off', () => {
    expect(reachable(P, [])).toEqual({ ok: true, rooms: [], openings: [] });
    const across = box(0.4, -0.65, 2.8, 1.0);                                          // filling the dégagement
    const r = reachable(P, [across]);
    expect(r.ok).toBe(false);
    expect(r.rooms).toEqual(expect.arrayContaining(['chambre', 'sdb']));
    expect(r.rooms).not.toContain('cuisine');
  });
});
