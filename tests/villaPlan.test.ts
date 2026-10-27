import { describe, expect, it } from 'vitest';
import {
  F2_JAMM, PLANS, area, clearZones, contains, fitsRoom, groundAt, homeBox, inner, isCovered, levelAtX, levelOf, levelOfRoom, levelsOf, overlaps, passage, planBounds,
  planFor, reachable, roomAt, seams, stairParts, stairT, toPlan, toWorld, wallPieces, whyNotPlan, type FloorPlan, type Rect,
} from '../src/housing/plan';
import { VILLA_PLAN as V } from '../src/housing/villaPlan';
import { BACK_GARDEN, BALCONIES, FRONT_DOOR, HELIPAD, HOUSE, LEVELS, POOL, STAIR_CORE, STOREY } from '../src/housing/villa';

/**
 * LD2.0-D lane V-S (docs/ld2/LD2_D.md): the floor-plan contract version 2 (levels, stairs, open rooms, the unfolded plan space) and the Almadies
 * villa's plan built on it (src/housing/villaPlan.ts), checked against the shared numbers (src/housing/villa.ts).
 */
const room = (id: string) => V.rooms.find(r => r.id === id)!;
const roomsOn = (lv: string) => V.rooms.filter(r => r.level === lv);
const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
const box = (cx: number, cz: number, w: number, d: number): Rect => ({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
const dxOf = (lv: string) => LEVELS.find(l => l.id === lv)!.dx;
const house = (lv: string): Rect => ({ x0: HOUSE.x0 + dxOf(lv), x1: HOUSE.x1 + dxOf(lv), z0: HOUSE.z0, z1: HOUSE.z1 });

describe('the plan contract, version 2 (LD2.0-D): levels in an unfolded plan', () => {
  it('a plan without levels is one level at y 0, and reads as before', () => {
    expect(levelsOf(F2_JAMM)).toHaveLength(1);
    expect(levelOf(F2_JAMM, 0.1).y).toBe(0);
    expect(toWorld(F2_JAMM, 1.5, -2)).toMatchObject({ x: 1.5, y: 0, z: -2 });
    expect(groundAt(F2_JAMM, 1, 1, 0)).toBe(0);
    expect(stairParts(F2_JAMM)).toEqual([]);
    expect(seams(F2_JAMM)).toEqual([]);
    expect(homeBox(F2_JAMM)).toEqual({ x0: -4.5, x1: 4.5, z0: -3.5, z1: 3.5 });
    expect(planBounds(F2_JAMM)).toEqual(homeBox(F2_JAMM));
    expect(wallPieces(F2_JAMM).every(w => w.kind === 'wall' && w.h === F2_JAMM.wallH)).toBe(true);
  });

  it('the villa is a plan home on three levels, 3.4 m apart, its rooms side by side in plan space (rdc, étage +20, toit −20)', () => {
    expect(planFor('villa_almadies')).toBe(V);
    expect(Object.keys(PLANS)).toEqual(['appart_jamm', 'villa_almadies']);
    expect(levelsOf(V).map(l => [l.id, l.y, l.dx])).toEqual([['rdc', 0, 0], ['etage', STOREY, 20], ['toit', 2 * STOREY, -20]]);
    for (const r of V.rooms) {
      expect(levelAtX(V, centre(r.box).x).id, r.id).toBe(r.level);
      expect(levelOfRoom(V, r).id).toBe(r.level);
      // every placement stays inside ±30 m (src/online/visitRules.ts REACH): no save field, no visit change
      for (const v of [r.box.x0, r.box.x1, r.box.z0, r.box.z1]) expect(Math.abs(v), r.id).toBeLessThanOrEqual(30);
      expect(contains(planBounds(V), r.box), r.id).toBe(true);
    }
  });

  it('turns plan points into the home\'s frame and back, by level', () => {
    expect(toWorld(V, 22, -1)).toMatchObject({ x: 2, y: STOREY, z: -1 });
    expect(toWorld(V, -23, -0.5)).toMatchObject({ x: -3, y: 2 * STOREY, z: -0.5 });
    expect(toWorld(V, -3, 2)).toMatchObject({ x: -3, y: 0, z: 2 });
    expect(toPlan(V, 2, -1, STOREY)).toMatchObject({ x: 22, z: -1 });
    expect(toPlan(V, -3, -0.5, 2 * STOREY + 0.1)).toMatchObject({ x: -23 });
    expect(toPlan(V, 1, 1, 0.1)).toMatchObject({ x: 1 });
    // near the top of a flight, the player counts on the level they reach
    expect(levelOf(V, STOREY - 0.5).id).toBe('etage');
    expect(levelOf(V, STOREY - 0.8).id).toBe('rdc');
  });
});

describe('the Almadies villa: the plan (LD2.0-D)', () => {
  it('ground floor: entrée, grand salon, salle à manger, cuisine, salle d\'eau, bureau, the stair hall; the back garden and its pool, open to the sky', () => {
    expect(roomsOn('rdc').map(r => r.kind).sort()).toEqual(['bureau', 'cuisine', 'entree', 'manger', 'palier', 'sdb', 'sejour', 'terrasse'].sort());
    expect(room('jardin')).toMatchObject({ outdoor: true, box: BACK_GARDEN });
    expect(V.fixtures.find(f => f.kind === 'pool')).toMatchObject({ room: 'jardin', box: { x0: POOL.x0, x1: POOL.x1, z0: POOL.z0, z1: POOL.z1 }, depth: POOL.depth });
    expect(V.openings.filter(o => o.kind === 'glass' && (o.a === 'jardin' || o.b === 'jardin')).map(o => o.a).sort()).toEqual(['manger', 'salon']);
  });
  it('first floor: the master suite (bedroom, dressing, bathroom), the family lounge, two more bedrooms, a bathroom and the two balconies', () => {
    expect(roomsOn('etage').map(r => r.kind).sort()).toEqual(['balcon', 'balcon', 'chambre', 'chambre', 'chambre', 'degagement', 'dressing', 'palier', 'sdb', 'sdb', 'sejour'].sort());
    for (const [i, id] of [[0, 'balcon_rue'], [1, 'balcon_piscine']] as const) expect(room(id).box).toEqual({ ...BALCONIES[i], x0: BALCONIES[i].x0 + 20, x1: BALCONIES[i].x1 + 20 });
    // the suite: its bedroom opens to the dressing, the dressing to its bathroom, and the bedroom to the balcony over the pool
    expect(V.openings.some(o => [o.a, o.b].sort().join() === 'dressing,suite')).toBe(true);
    expect(V.openings.some(o => [o.a, o.b].sort().join() === 'bain,dressing')).toBe(true);
    expect(V.openings.some(o => o.kind === 'glass' && [o.a, o.b].sort().join() === 'balcon_piscine,suite')).toBe(true);
    expect(V.openings.some(o => o.kind === 'glass' && [o.a, o.b].sort().join() === 'balcon_rue,salon_familial')).toBe(true);
  });
  it('roof: the terrace behind its glass balustrade, the stair head, the helipad with the helicopter on it, the pergola clear of the rotor', () => {
    expect(roomsOn('toit').map(r => r.kind).sort()).toEqual(['palier', 'terrasse', 'terrasse']);
    const pad = V.marks!.find(m => m.kind === 'helipad')!;
    expect(pad).toMatchObject({ x: HELIPAD.x - 20, z: HELIPAD.z, r: HELIPAD.r, room: 'terrasse' });
    expect(contains(inner(V, room('terrasse')), box(pad.x, pad.z, 2 * pad.r, 2 * pad.r))).toBe(true);
    const heli = V.fixtures.find(f => f.kind === 'heli')!;
    expect(Math.hypot(centre(heli.box).x - pad.x, centre(heli.box).z - pad.z)).toBeLessThan(0.3);
    const roofEdges = wallPieces(V).filter(w => w.level === 'toit' && w.kind === 'railing');
    expect(roofEdges.length).toBeGreaterThan(3);
    expect(roofEdges.every(w => w.h === 1.1)).toBe(true);
    // the look pass: a pergola on four posts in the terrace's street-side corner, out of the rotor's sweep (7.2 m across) and off the helipad
    const per = V.pergolas!.find(q => q.room === 'terrasse')!, posts = V.fixtures.filter(f => f.kind === 'post');
    expect(posts).toHaveLength(4);
    for (const f of posts) { expect(contains(per.box, f.box)).toBe(true); expect(contains(inner(V, room('terrasse')), f.box)).toBe(true); }
    expect(per.box.x0).toBeGreaterThan(pad.x + 3.6);
    expect(per.h).toBeLessThan(2.9);
  });

  it('each level\'s rooms tile the house (and the garden, the balconies) with no gap and no overlap', () => {
    const tile = (lv: string, extra: Rect[]) => {
      const rs = roomsOn(lv), want = area(house(lv)) + extra.reduce((a, r) => a + area(r), 0);
      expect(rs.reduce((a, r) => a + area(r.box), 0), lv).toBeCloseTo(want, 6);
      for (const a of rs) for (const b of rs) if (a !== b) expect(overlaps(a.box, b.box), `${a.id} × ${b.id}`).toBe(false);
    };
    tile('rdc', [BACK_GARDEN]);
    tile('etage', BALCONIES.map(b => ({ ...b, x0: b.x0 + 20, x1: b.x1 + 20 })));
    tile('toit', []);
    for (const a of V.rooms) for (const b of V.rooms) if (a !== b && a.level !== b.level) expect(overlaps(a.box, b.box)).toBe(false);
  });

  it('rooms are big enough to live in on a phone', () => {
    const min: Record<string, number> = { degagement: 1.1, entree: 2.4, sdb: 1.8, dressing: 1.8, balcon: 1.1, palier: 3.2, terrasse: 2.1 };
    for (const r of V.rooms) {
      const i = inner(V, r), across = Math.min(i.x1 - i.x0, i.z1 - i.z0);
      expect(across, r.id).toBeGreaterThanOrEqual(min[r.kind] ?? 2.8);
    }
    expect(area(inner(V, room('salon')))).toBeGreaterThan(30);
    expect(area(inner(V, room('salon_familial')))).toBeGreaterThan(30);
  });

  it('each opening sits on the wall its two rooms share, with wall on both sides; the street door at FRONT_DOOR', () => {
    for (const o of V.openings) {
      const a = room(o.a).box, c = o.axis === 'x' ? o.x : o.z, lo = c - o.width / 2, hi = c + o.width / 2;
      const onLine = (r: Rect) => o.axis === 'x' ? Math.abs(r.z0 - o.z) < 1e-6 || Math.abs(r.z1 - o.z) < 1e-6 : Math.abs(r.x0 - o.x) < 1e-6 || Math.abs(r.x1 - o.x) < 1e-6;
      const span = (r: Rect) => o.axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
      expect(onLine(a), o.id).toBe(true);
      let [s0, s1] = span(a);
      if (o.b !== 'out') { const b = room(o.b); expect(onLine(b.box), o.id).toBe(true); expect(b.level, o.id).toBe(room(o.a).level); const [t0, t1] = span(b.box); s0 = Math.max(s0, t0); s1 = Math.min(s1, t1); }
      expect(lo - s0, `${o.id} start`).toBeGreaterThanOrEqual(0.15);
      expect(s1 - hi, `${o.id} end`).toBeGreaterThanOrEqual(0.15);
      expect(o.width).toBeGreaterThanOrEqual(0.8);
      if (o.kind === 'door') expect([o.a, o.b]).toContain(o.swing);
      for (const w of wallPieces(V)) expect(overlaps(w, passage(V, o)), o.id).toBe(false);
    }
    const front = V.openings.find(o => o.kind === 'front')!;
    expect(front).toMatchObject({ a: 'entree', x: FRONT_DOOR.x, z: FRONT_DOOR.z, width: FRONT_DOOR.width });
    expect(roomAt(V, V.spawn.x, V.spawn.z)?.id).toBe('entree');
    expect(Math.cos(V.spawn.yaw)).toBeLessThan(-0.9);
  });

  it('walls by what they stand between: the house\'s walls full height, the garden\'s wall, glass balustrades on the balconies and the roof, nothing between two open rooms', () => {
    const walls = wallPieces(V);
    expect(new Set(walls.map(w => w.kind))).toEqual(new Set(['wall', 'garden', 'railing']));
    expect(walls.filter(w => w.kind === 'garden').every(w => w.level === 'rdc' && w.h === 2.4)).toBe(true);
    expect(walls.filter(w => w.kind === 'railing').every(w => w.level === 'etage' || w.level === 'toit')).toBe(true);
    expect(walls.filter(w => w.kind === 'wall').every(w => w.h === 3.0)).toBe(true);                  // a 3 m ceiling under a 0.4 m floor
    // the two roof terraces meet with nothing between them: a seam the player walks across
    const s = seams(V);
    expect(s).toHaveLength(1);
    for (const w of walls) expect(overlaps(w, s[0])).toBe(false);
    for (const r of V.rooms) for (const w of walls) expect(overlaps(inner(V, r), w), `${r.id}`).toBe(false);
  });

  it('every fitting inside its room; every window on its room\'s outside wall', () => {
    for (const f of V.fixtures) expect(contains(inner(V, room(f.room)), f.box), f.id).toBe(true);
    for (const f of V.fixtures) for (const g of V.fixtures) if (f !== g && !contains(g.box, f.box) && !contains(f.box, g.box)) expect(overlaps(f.box, g.box), `${f.id} × ${g.id}`).toBe(false);
    for (const w of V.windows) {
      const r = room(w.room), b = r.box, along = w.side === 'n' || w.side === 's' ? [b.x0, b.x1] : [b.z0, b.z1];
      expect(w.at - w.width / 2, `${w.room} ${w.side}`).toBeGreaterThan(along[0]); expect(w.at + w.width / 2).toBeLessThan(along[1]);
      const line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side], axis = w.side === 'n' || w.side === 's' ? 'x' : 'z';
      expect(wallPieces(V).some(p => p.kind === 'wall' && p.outer && p.axis === axis && Math.abs(p.at - line) < 1e-6), `${w.room} ${w.side}`).toBe(true);
      expect(w.sill + w.height).toBeLessThan(V.wallH);
    }
  });
});

describe('the villa\'s stairs', () => {
  const parts = stairParts(V);
  it('two straight flights of 17 steps of 0.2 m, at least 1.1 m wide, inside the stair core', () => {
    expect(parts.map(s => [s.lower.id, s.upper.id])).toEqual([['rdc', 'etage'], ['etage', 'toit']]);
    for (const st of parts) {
      expect(st.s.steps).toBe(17);
      expect((st.upper.y - st.lower.y) / st.s.steps).toBeCloseTo(0.2, 6);
      const b = st.box, wide = st.axis === 'z' ? b.x1 - b.x0 : b.z1 - b.z0;
      expect(wide).toBeGreaterThanOrEqual(1.1);
      const inHouse = { x0: b.x0 - st.lower.dx, x1: b.x1 - st.lower.dx, z0: b.z0, z1: b.z1 };
      expect(contains(STAIR_CORE, inHouse), st.s.id).toBe(true);
      // the foot in its room, the well in the upper room
      expect(contains(inner(V, room(st.s.from)), b)).toBe(true);
      expect(contains(inner(V, room(st.s.to)), st.well)).toBe(true);
    }
  });
  it('a flight is a ramp: walking up it, the ground rises smoothly from one floor to the next, and the floors meet it at both ends', () => {
    for (const st of parts) {
      const along = (t: number) => { const u = st.foot + (st.head - st.foot) * t, c = st.axis === 'z' ? (st.box.x0 + st.box.x1) / 2 : u, z = st.axis === 'z' ? u : (st.box.z0 + st.box.z1) / 2; return { x: c - st.lower.dx, z }; };
      let y = st.lower.y, last = y;
      // from 0.6 m before the foot to 0.6 m past the head, a centimetre at a time
      const L = Math.abs(st.head - st.foot);
      for (let s = -0.6; s <= L + 0.6; s += 0.01) {
        const p = along(s / L);
        const before = st.axis === 'z' ? { x: p.x, z: st.foot - st.dir * Math.max(0, -s) } : p, after = st.axis === 'z' ? { x: p.x, z: st.head + st.dir * Math.max(0, s - L) } : p;
        const q = s < 0 ? before : s > L ? after : p;
        y = groundAt(V, q.x, q.z, y);
        expect(y - last, `${st.s.id} at ${s.toFixed(2)}`).toBeGreaterThanOrEqual(-1e-9);
        expect(y - last, `${st.s.id} at ${s.toFixed(2)}`).toBeLessThan(0.02);
        last = y;
      }
      expect(y).toBeCloseTo(st.upper.y, 6);
      // and back down
      for (let s = L + 0.6; s >= -0.6; s -= 0.01) {
        const p = along(Math.min(1, Math.max(0, s / L))), q = st.axis === 'z' ? { x: p.x, z: s < 0 ? st.foot - st.dir * -s : s > L ? st.head + st.dir * (s - L) : p.z } : p;
        y = groundAt(V, q.x, q.z, y);
      }
      expect(y).toBeCloseTo(st.lower.y, 6);
      expect(stairT(st, st.foot === st.box.z0 ? 0 : 0, st.foot)).toBe(0);
    }
  });
  it('the ground under a person: the floor of their level, never a floor below them or one above their head', () => {
    // under the first flight's upper part, on the ground floor (the corridor beside it): the ground floor
    expect(groundAt(V, 7.0, 0.5, 0)).toBe(0);
    // the same point upstairs is the second flight (rising from the landing at z 1.4)
    expect(groundAt(V, 7.2, 1.0, STOREY)).toBeGreaterThan(STOREY);
    // a room upstairs
    expect(groundAt(V, -1, 2, STOREY)).toBe(STOREY);
    expect(groundAt(V, -1, 2, 0)).toBe(0);
    // the roof
    expect(groundAt(V, -3, 2, 2 * STOREY)).toBe(2 * STOREY);
    // over the first flight's well on the first floor there is no floor: the flight below
    expect(groundAt(V, 5.2, 0, STOREY)).toBeLessThan(STOREY);
  });
  it('balustrades on the flights\' open sides, a railing round each well but where the flight arrives', () => {
    for (const st of parts) {
      expect(st.balustrades.length, st.s.id).toBe(1);
      expect(st.rails.length, st.s.id).toBeGreaterThanOrEqual(1);
      for (const r of st.rails) expect(contains({ x0: st.well.x0 - 0.05, x1: st.well.x1 + 0.05, z0: st.well.z0 - 0.05, z1: st.well.z1 + 0.05 }, r)).toBe(true);
    }
  });
  it('furniture never goes on a flight, in a well or on the helipad', () => {
    const cz = clearZones(V);
    expect(cz.filter(c => c.why === 'stair').length).toBe(4);
    expect(whyNotPlan(V, box(5.2, -1, 0.6, 0.6))).toBe('stair');
    expect(whyNotPlan(V, box(25.2, -1, 0.6, 0.6))).toBe('stair');
    expect(whyNotPlan(V, box(-25.5, 0.5, 0.8, 0.8))).toBe('helipad');
    expect(whyNotPlan(V, box(-23, 1.5, 0.8, 0.8))).toBe('fitting');                              // on the helicopter
    expect(whyNotPlan(V, box(-1, -8, 1, 1))).toBe('fitting');                                    // in the pool
    expect(whyNotPlan(V, box(-27.2, 3.3, 0.8, 0.8))).toBeNull();                               // a corner of the roof terrace
    expect(whyNotPlan(V, box(8, -8, 1.8, 0.7))).toBeNull();                                    // a lounger on the deck beside the pool
  });
});

describe('the villa can be walked from the front door to every room of every level', () => {
  it('every room and opening reachable across the stairs', () => {
    expect(reachable(V, [])).toEqual({ ok: true, rooms: [], openings: [] });
  });
  it('a wardrobe at the foot of the stairs cuts off the first floor and the roof; one across the landing cuts off the roof only', () => {
    const foot = reachable(V, [box(5.2, -3.4, 1.2, 0.6), box(6.6, -3.4, 2.6, 0.6)]);       // across the hall in front of the first flight
    expect(foot.ok).toBe(false);
    expect(foot.rooms).toEqual(expect.arrayContaining(['palier', 'suite', 'chambre2', 'edicule', 'terrasse']));
    expect(foot.rooms).not.toContain('salon');
    const landing = reachable(V, [box(27.2, 2.2, 1.4, 1.4)]);                                  // in front of the second flight's foot
    expect(landing.ok).toBe(false);
    expect(landing.rooms).toEqual(expect.arrayContaining(['edicule', 'terrasse', 'terrasse_rue']));
    expect(landing.rooms).not.toContain('suite');
  });
  it('reachable stays quick on the villa\'s three levels (a placement asks it once per spot)', () => {
    reachable(V, []);
    const t = performance.now();
    for (let k = 0; k < 10; k++) reachable(V, [box(-4, -3, 2, 1)]);
    const ms = (performance.now() - t) / 10;
    console.log(`reachable on the villa: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(40);
  });
  it('the covered rooms are those under the level above; open rooms and the stair halls are seen from above', () => {
    expect(isCovered(V, room('salon'))).toBe(true);
    expect(isCovered(V, room('suite'))).toBe(true);
    expect(isCovered(V, room('jardin'))).toBe(false);
    expect(isCovered(V, room('hall'))).toBe(false);
    expect(isCovered(V, room('balcon_rue'))).toBe(false);
    expect(isCovered(V, room('terrasse'))).toBe(false);
    expect(isCovered(V, room('edicule'))).toBe(false);
    expect(isCovered(F2_JAMM as FloorPlan, F2_JAMM.rooms[0])).toBe(false);
    expect(fitsRoom(V, box(-23, 3.3, 0.5, 0.5))?.id).toBe('terrasse');
  });
});
