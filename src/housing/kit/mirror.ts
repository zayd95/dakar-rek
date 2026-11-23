import type { FloorPlan, Fixture, Opening, Rect, Room, Side, Stair, Window } from '../plan';

/**
 * The plan seen in a mirror (left ↔ right): the same home with its rooms the other way round, for a hub that wants two of a kind that do not look alike
 * (docs/kits/HOMES.md). Each level is mirrored about its own middle line (`dx`), so a plan on several levels keeps its unfolded plan space. The wall
 * a door is hinged on follows (a leaf hinged at the lower x is now hinged at the higher), the windows' sides, the fittings' fronts, the stairs' way up.
 */
const FLIP: Record<Side, Side> = { n: 'n', s: 's', e: 'w', w: 'e' };
export function mirrorPlan(p: FloorPlan, id = p.id): FloorPlan {
  const dxOfLevel = (lv?: string) => p.levels?.find(l => l.id === lv)?.dx ?? 0;
  const roomOf = (rid: string) => p.rooms.find(r => r.id === rid)!;
  const dxOf = (rid: string) => dxOfLevel(roomOf(rid)?.level);
  const mx = (x: number, dx: number) => 2 * dx - x;
  const mr = (r: Rect, dx: number): Rect => ({ x0: mx(r.x1, dx), x1: mx(r.x0, dx), z0: r.z0, z1: r.z1 });
  const rooms: Room[] = p.rooms.map(r => ({ ...r, box: mr(r.box, dxOfLevel(r.level)), ...(r.accent ? { accent: { ...r.accent, side: FLIP[r.accent.side] } } : {}) }));
  const openings: Opening[] = p.openings.map(o => {
    const dx = dxOf(o.a);
    return { ...o, ...(o.axis === 'x' ? { x: mx(o.x, dx) } : { x: mx(o.x, dx) }), ...(o.hinge && o.axis === 'x' ? { hinge: o.hinge === 'start' ? 'end' as const : 'start' as const } : {}) };
  });
  const windows: Window[] = p.windows.map(w => {
    const dx = dxOf(w.room), horizontal = w.side === 'n' || w.side === 's';
    return { ...w, side: FLIP[w.side], at: horizontal ? mx(w.at, dx) : w.at };
  });
  const fixtures: Fixture[] = p.fixtures.map(f => ({ ...f, box: mr(f.box, dxOf(f.room)), front: FLIP[f.front] }));
  const stairs: Stair[] | undefined = p.stairs?.map(s => ({ ...s, box: mr(s.box, dxOf(s.from)), up: FLIP[s.up], ...(s.well ? { well: mr(s.well, dxOf(s.to)) } : {}) }));
  const pergolas = p.pergolas?.map(g => ({ ...g, box: mr(g.box, dxOf(g.room)) }));
  const marks = p.marks?.map(m => ({ ...m, x: mx(m.x, dxOf(m.room)) }));
  const levels = p.levels;
  const x0s = [...rooms.map(r => r.box.x0)], x1s = [...rooms.map(r => r.box.x1)];
  const spawnLevelDx = dxOf(p.openings.find(o => o.kind === 'front')?.a ?? p.rooms[0].id);
  return {
    ...p, id, rooms, openings, windows, fixtures, ...(stairs ? { stairs } : {}), ...(pergolas ? { pergolas } : {}), ...(marks ? { marks } : {}),
    spawn: { ...p.spawn, x: mx(p.spawn.x, spawnLevelDx), yaw: -p.spawn.yaw },
    ...(p.box ? { box: mirrorBox(p.box) } : {}), ...(p.bounds ? { bounds: { x0: Math.min(...x0s) - 0.5, x1: Math.max(...x1s) + 0.5, z0: p.bounds.z0, z1: p.bounds.z1 } } : {}),
    ...(p.gate ? { gate: { x0: -p.gate.x1, x1: -p.gate.x0 } } : {}), ...(levels ? { levels: levels.map(l => ({ ...l })) } : {}),
  };
}
const mirrorBox = (b: Rect): Rect => ({ x0: -b.x1, x1: -b.x0, z0: b.z0, z1: b.z1 });
