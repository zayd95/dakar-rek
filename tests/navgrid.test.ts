import { describe, expect, it } from 'vitest';
import { NavGrid } from '../src/world/navgrid';
import { DESK, FRONT, HALL, MOTO_PLINTH, SALES_HOME, SLOTS } from '../src/world/prestige';

const wall = (x0: number, x1: number, z0: number, z1: number) => ({ x0, x1, z0, z1, h: 3 });

describe('NavGrid', () => {
  it('finds a way round a wall and pulls it straight where it can', () => {
    const g = new NavGrid({ x0: 0, x1: 20, z0: 0, z1: 20 }, [wall(9, 11, 0, 14)]);
    const p = g.path({ x: 2, z: 2 }, { x: 18, z: 2 })!;
    expect(p).not.toBeNull();
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.length).toBeLessThanOrEqual(4);                                   // a couple of corners, not a staircase
    let at = { x: 2, z: 2 };
    for (const q of p) { expect(g.clear(at, q)).toBe(true); at = q; }
    expect(Math.hypot(at.x - 18, at.z - 2)).toBeLessThan(0.6);
  });
  it('says there is no way when the goal is walled in', () => {
    const g = new NavGrid({ x0: 0, x1: 20, z0: 0, z1: 20 }, [wall(8, 12, 8, 9), wall(8, 12, 11, 12), wall(8, 9, 8, 12), wall(11, 12, 8, 12)]);
    expect(g.path({ x: 2, z: 2 }, { x: 10, z: 10 })).toBeNull();
  });
});

describe('the Prestige hall', () => {
  // the hall's walls as the generator lays them (src/world/prestige.ts): front glass in three runs, side and back walls, the desk, the plinth, the four cars
  const T = 0.25, { x0, x1, z0, z1, h } = HALL;
  const cols = [
    wall(x0 - 0.05, FRONT.door[0] + 0.05, z0 - 0.12, z0 + 0.12), wall(FRONT.door[1] - 0.05, FRONT.bay[0] + 0.05, z0 - 0.12, z0 + 0.12), wall(FRONT.bay[1] - 0.05, x1 + 0.05, z0 - 0.12, z0 + 0.12),
    wall(x0 - T / 2, x0 + T / 2, z0, z1), wall(x1 - T / 2, x1 + T / 2, z0, z1), wall(x0, x1, z1 - T / 2, z1 + T / 2),
    wall(DESK.x - DESK.w / 2, DESK.x + DESK.w / 2, DESK.z - DESK.d / 2, DESK.z + DESK.d / 2),
    wall(MOTO_PLINTH.x0, MOTO_PLINTH.x1, MOTO_PLINTH.z0, MOTO_PLINTH.z1),
    ...SLOTS.map(s => wall(s.x - 0.97, s.x + 0.97, s.z - 2.6, s.z + 2.6)),
  ].map(c => ({ ...c, h }));
  const grid = new NavGrid({ x0: -114, x1: -66, z0: 5, z1: 54 }, cols);
  it('the salesperson walks from his desk to each car and to the forecourt, through the door or the bay, and the cars have a way out', () => {
    const home = { x: SALES_HOME.x, z: SALES_HOME.z };
    expect(grid.free(home)).toBe(true);
    for (const s of SLOTS) {
      const stand = { x: s.x - 1.65, z: s.z - 0.4 };                              // beside the driver's door
      expect(grid.free(stand)).toBe(true);
      const p = grid.path(home, stand);
      expect(p, `to the car at ${s.x}`).not.toBeNull();
      const out = grid.path(stand, { x: s.x, z: 12 });                           // from the car out to the forecourt
      expect(out, `out from ${s.x}`).not.toBeNull();
    }
    const street = grid.path(home, { x: -86, z: 8 });
    expect(street).not.toBeNull();
    // the way out of the hall is through the door or the bay, never through glass
    const crossing = street!.concat([home]).some(p => p.z < z0 + 0.2);
    expect(crossing).toBe(true);
  });
  it('a car driven straight out of its place meets no wall', () => {
    for (const s of SLOTS) for (let z = s.z; z > z0 - 4; z -= 0.25) {
      const hit = cols.slice(0, 6).some(c => s.x + 0.97 > c.x0 && s.x - 0.97 < c.x1 && z - 2.6 < c.z1 && z + 2.6 > c.z0);
      if (z + 2.6 > z0 - 0.12 && z - 2.6 < z0 + 0.12) expect(hit, `slot ${s.x} at z ${z}`).toBe(false);
    }
  });
});
