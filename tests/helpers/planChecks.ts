import { area, contains, inner, overlaps, passage, reachable, roomAt, wallPieces, type FloorPlan, type Rect, type Room } from '../../src/housing/plan';

/**
 * What every home plan must satisfy (the checks of tests/maisonPlan.test.ts and tests/villaPlan.test.ts, as one function): it says what is wrong, in words, or nothing.
 * The rooms of a level do not overlap and lie in the plan's box; each room is wide enough to live in (`min` by kind, m inside); each opening sits on the wall its two rooms
 * share with at least 0.15 m of wall on both sides and no wall across it; a door's leaf swings into one of its rooms; every fitting is inside its room and clear of the
 * others; every window is on its room's outside wall; the street door is in the room the plan spawns in; every room and opening can be reached from it.
 */
export const MIN_ACROSS: Record<string, number> = { degagement: 1.1, entree: 1.8, sdb: 1.8, dressing: 1.8, cuisine: 1.8, balcon: 1.1, terrasse: 2.1, palier: 2.4 };
export function planProblems(p: FloorPlan, min: Record<string, number> = MIN_ACROSS, rest = 2.4): string[] {
  const out: string[] = [], room = (id: string) => p.rooms.find(r => r.id === id);
  const lv = (r: Room) => r.level ?? '';
  for (const a of p.rooms) for (const b of p.rooms) if (a !== b && lv(a) === lv(b) && overlaps(a.box, b.box)) out.push(`${a.id} overlaps ${b.id}`);
  for (const a of p.rooms) for (const b of p.rooms) if (a !== b && lv(a) !== lv(b) && overlaps(a.box, b.box)) out.push(`${a.id} (${lv(a)}) overlaps ${b.id} (${lv(b)}) in plan space`);
  for (const r of p.rooms) { const i = inner(p, r), across = Math.min(i.x1 - i.x0, i.z1 - i.z0); if (across < (min[r.kind] ?? rest) - 1e-6) out.push(`${r.id} is ${across.toFixed(2)} m across (needs ${min[r.kind] ?? rest})`); }
  const walls = wallPieces(p);
  for (const o of p.openings) {
    const a = room(o.a); if (!a) { out.push(`${o.id}: no room ${o.a}`); continue; }
    const c = o.axis === 'x' ? o.x : o.z, lo = c - o.width / 2, hi = c + o.width / 2;
    const onLine = (r: Rect) => o.axis === 'x' ? Math.abs(r.z0 - o.z) < 1e-6 || Math.abs(r.z1 - o.z) < 1e-6 : Math.abs(r.x0 - o.x) < 1e-6 || Math.abs(r.x1 - o.x) < 1e-6;
    const span = (r: Rect) => o.axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
    if (!onLine(a.box)) out.push(`${o.id} is not on ${o.a}'s wall`);
    let [s0, s1] = span(a.box);
    if (o.b === 'out') { if (o.kind !== 'front') out.push(`${o.id}: only the front door goes out`); }
    else { const b = room(o.b); if (!b) { out.push(`${o.id}: no room ${o.b}`); continue; } if (!onLine(b.box)) out.push(`${o.id} is not on ${o.b}'s wall`); if (lv(a) !== lv(b)) out.push(`${o.id} joins two levels`); const [t0, t1] = span(b.box); s0 = Math.max(s0, t0); s1 = Math.min(s1, t1); }
    if (lo - s0 < 0.15 - 1e-6) out.push(`${o.id}: ${(lo - s0).toFixed(2)} m of wall at its start`);
    if (s1 - hi < 0.15 - 1e-6) out.push(`${o.id}: ${(s1 - hi).toFixed(2)} m of wall at its end`);
    if (o.width < 0.8 - 1e-6) out.push(`${o.id} is ${o.width} m wide`);
    if (o.kind === 'door' && ![o.a, o.b].includes(o.swing ?? '')) out.push(`${o.id}: its leaf swings into no room it joins`);
    for (const w of walls) if (overlaps(w, passage(p, o))) out.push(`${o.id}: a wall across it`);
  }
  const front = p.openings.filter(o => o.kind === 'front');
  if (front.length !== 1) out.push(`${front.length} front doors`);
  else if (roomAt(p, p.spawn.x, p.spawn.z)?.id !== front[0].a) out.push(`the spawn is not in ${front[0].a}`);
  if (Math.cos(p.spawn.yaw) > -0.9) out.push('the spawn does not face the home');
  for (const f of p.fixtures) { const r = room(f.room); if (!r) { out.push(`${f.id}: no room ${f.room}`); continue; } if (!contains(inner(p, r), f.box)) out.push(`${f.id} is not inside ${f.room}`); }
  for (const f of p.fixtures) for (const g of p.fixtures) if (f !== g && !contains(g.box, f.box) && !contains(f.box, g.box) && overlaps(f.box, g.box)) out.push(`${f.id} overlaps ${g.id}`);
  for (const w of p.windows) {
    const r = room(w.room); if (!r) { out.push(`window of no room ${w.room}`); continue; }
    const b = r.box, along = w.side === 'n' || w.side === 's' ? [b.x0, b.x1] : [b.z0, b.z1], line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[w.side], axis = w.side === 'n' || w.side === 's' ? 'x' : 'z';
    if (!(w.at - w.width / 2 > along[0] && w.at + w.width / 2 < along[1])) out.push(`window ${w.room} ${w.side} runs off its wall`);
    if (!walls.some(q => q.kind === 'wall' && q.outer && q.axis === axis && Math.abs(q.at - line) < 1e-6)) out.push(`window ${w.room} ${w.side} is not on an outside wall`);
    if (w.sill + w.height >= p.wallH) out.push(`window ${w.room} ${w.side} is taller than the wall`);
  }
  const reach = reachable(p, []); if (!reach.ok) out.push(`unreachable: ${[...reach.rooms, ...reach.openings].join(', ')}`);
  return out;
}
export const livingArea = (p: FloorPlan) => p.rooms.filter(r => !r.outdoor).reduce((a, r) => a + area(r.box), 0);
