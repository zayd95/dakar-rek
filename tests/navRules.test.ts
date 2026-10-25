import { describe, expect, it } from 'vitest';
import { UTURN_COST, driverWay, legEnds, navDistance, nextTurn, openEdges, turnText, type Pt } from '../src/game/navRules';
import { roadCentre } from '../src/transport/lines';
import { routePath } from '../src/ui/minimapMath';
import { planTrip } from '../src/road/graph';

/** Turn-by-turn for a driver (src/game/navRules.ts). The game's frame: yaw 0 along +z, +x to the LEFT. */
describe('driving directions', () => {
  const N = 0, E = -Math.PI / 2;            // heading +z, heading −x (to the driver's right when facing +z)
  it('a way straight ahead with a corner: the corner\'s side and how far', () => {
    const toRight = [{ x: 0, z: 0 }, { x: 0, z: 60 }, { x: -60, z: 60 }];      // north then towards −x: a right turn
    expect(nextTurn(toRight, N)).toEqual({ dir: 'right', at: 60 });
    const toLeft = [{ x: 0, z: 0 }, { x: 0, z: 40 }, { x: 60, z: 40 }];
    expect(nextTurn(toLeft, N)).toEqual({ dir: 'left', at: 40 });
    expect(nextTurn([{ x: 0, z: 0 }, { x: 0, z: 90 }], N)).toEqual({ dir: 'straight', at: 90 });
  });
  it('a way that starts behind the driver is a U-turn; a few metres of slack are not', () => {
    expect(nextTurn([{ x: 0, z: 0 }, { x: 0, z: -50 }], N).dir).toBe('back');
    expect(nextTurn([{ x: 0, z: 0 }, { x: 0.5, z: 0.5 }, { x: -60, z: 0 }], E).dir).toBe('straight');
  });
  it('the words and the distances a driver reads', () => {
    expect(navDistance(84)).toBe('80 m'); expect(navDistance(1234)).toBe('1,2 km'); expect(navDistance(3)).toBe('10 m');
    expect(turnText({ dir: 'right', at: 80 }, 'Marché Sandaga')).toBe('À droite dans 80 m · Marché Sandaga');
    expect(turnText({ dir: 'straight', at: 300 }, 'Le Pointe', 'Almadies')).toBe('Tout droit vers Almadies · Le Pointe');
    expect(turnText({ dir: 'back', at: 0 }, 'X')).toBe('Fais demi-tour · X');
  });
  it('every leg of every trip has a way out of its district at its edge and a way into the next', () => {
    const hubs = ['pikine', 'plateau', 'corniche', 'almadies'] as const;
    for (const a of hubs) for (const b of hubs) {
      const p = planTrip(a, b); if (!p) continue;
      for (const l of p.legs) {
        const e = legEnds(l);
        expect(Math.max(Math.abs(e.exit.x), Math.abs(e.exit.z))).toBeGreaterThanOrEqual(119);
        expect(Math.max(Math.abs(e.entry.x), Math.abs(e.entry.z))).toBeGreaterThanOrEqual(119);
      }
    }
  });
});

describe('a driver\'s way keeps off the streets closed to cars', () => {
  // a ring of four streets round a block; the short side (z = 0, from x = 0 to x = 60) is closed (the arena's pedestrian zone)
  const edges = [{ ax: 0, az: 0, bx: 60, bz: 0 }, { ax: 60, az: 0, bx: 60, bz: 120 }, { ax: 60, az: 120, bx: 0, bz: 120 }, { ax: 0, az: 120, bx: 0, bz: 0 }];
  const closed = (_ax: number, az: number, _bx: number, bz: number) => az === 0 && bz === 0;
  it('the closed segment is left out; with nothing closed the network is the same', () => {
    expect(openEdges(edges, [closed])).toHaveLength(3);
    expect(openEdges(edges, [])).toBe(edges);
  });
  it('the way goes round the block instead of through the closed street', () => {
    const through = routePath(edges, { x: 1, z: 0 }, { x: 59, z: 0 }), round = routePath(openEdges(edges, [closed]), { x: 1, z: 0 }, { x: 59, z: 0 });
    expect(through.length).toBeLessThan(60);
    expect(round.length).toBeGreaterThan(290);
    expect(round.points.some(p => p.z === 120)).toBe(true);
  });
});

describe('a driver\'s way does not flicker (« Fais demi-tour » on every hub, the owner\'s report)', () => {
  // a district's streets as the generator lays them (src/world/builder.ts): 5 × 5 centre lines 60 m apart; a car keeps 3.5 m right of the centre line
  const C = (k: number) => roadCentre(k), LANE = 3.5;
  const grid: { ax: number; az: number; bx: number; bz: number }[] = [];
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) { if (a < 4) grid.push({ ax: C(a), az: C(b), bx: C(a + 1), bz: C(b) }); if (b < 4) grid.push({ ax: C(a), az: C(b), bx: C(a), bz: C(b + 1) }); }
  const right = (yaw: number) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });     // the frame: +x is to the LEFT of a driver facing +z
  /** What the goal line says at each metre of a straight drive (the way recomputed each time, as the game does). */
  const straightDrive = (from: Pt, yaw: number, metres: number, goal: Pt, edges = grid) => {
    const said: string[] = []; let back: boolean | null = null;
    for (let m = 0; m < metres; m++) {
      const p = { x: from.x + Math.sin(yaw) * m, z: from.z + Math.cos(yaw) * m }, w = driverWay(edges, p, yaw, goal, back); back = w.back;
      said.push(nextTurn(w.points, yaw).dir);
    }
    return said;
  };
  const changes = (said: string[]) => said.filter((d, i) => i && d !== said[i - 1]).length;
  it('driving straight up a street, kerb lane, goal ahead: « tout droit » all the way, never a U-turn (it flipped about 30 times before)', () => {
    const said = straightDrive({ x: C(1) - LANE, z: C(0) + 5 }, 0, 100, { x: C(1), z: C(2) + 20 });
    expect(said.includes('back')).toBe(false); expect(changes(said)).toBe(0);
  });
  it('through a junction toward a goal off to one side: one call, the same, all the way', () => {
    const said = straightDrive({ x: C(1) - LANE, z: C(1) - 20 }, 0, 40, { x: C(2) + 30, z: C(2) });
    expect(new Set(said)).toEqual(new Set(['left']));
  });
  it('a goal 50 m behind on the same street is a U-turn; held while the car rolls on', () => {
    const said = straightDrive({ x: C(1) - LANE, z: C(1) + 10 }, 0, 40, { x: C(1), z: C(0) + 20 });
    expect(new Set(said)).toEqual(new Set(['back']));
  });
  it('a goal behind but cheaper round the block (within the U-turn cost) is driven to ahead, round the block', () => {
    // the goal is on the parallel street just behind: round the block ahead costs little more than turning back
    const w = driverWay(grid, { x: C(1) - LANE, z: C(1) + 50 }, 0, { x: C(2), z: C(1) + 40 });
    expect(w.back).toBe(false); expect(nextTurn(w.points, 0).dir).not.toBe('back');
  });
  it('a dead end: the U-turn stands', () => {
    const lane = [{ ax: 0, az: 0, bx: 0, bz: 100 }, { ax: 0, az: 0, bx: 0, bz: -100 }];   // one street, ends at z = ±100
    const w = driverWay(lane, { x: -LANE, z: 50 }, 0, { x: 0, z: -50 });
    expect(w.back).toBe(true);
  });
  it('near a tie the call changes once at most, never back and forth', () => {
    // driving away from a goal behind: turning back grows dearer metre by metre until round the block wins, once
    for (const goal of [{ x: C(1), z: C(1) - 25 }, { x: C(1), z: C(0) + 10 }, { x: C(2) - 20, z: C(1) }, { x: C(0) + 30, z: C(1) }]) {
      const said = straightDrive({ x: C(1) - LANE, z: C(1) + 2 }, 0, 56, goal);
      expect(changes(said.map(d => (d === 'back' ? 'back' : 'on'))), JSON.stringify(goal)).toBeLessThanOrEqual(1);
    }
  });
  it('a car that follows the directions to goals all over the district is never told to turn back, and hears each turn once', () => {
    const goals = [{ x: C(4), z: C(3) + 30 }, { x: C(0) + 20, z: C(4) }, { x: C(2), z: C(0) + 10 }, { x: C(3) + 40, z: C(1) }];
    for (const start of [{ x: C(1), z: C(2) + 30, yaw: 0 }, { x: C(3) + 25, z: C(3), yaw: -Math.PI / 2 }]) for (const goal of goals) {
      let c = { x: start.x, z: start.z }, yaw = start.yaw, back: boolean | null = null; const said: string[] = [];
      for (let m = 0; m < 600; m++) {
        const r = right(yaw), p = { x: c.x + r.x * LANE, z: c.z + r.z * LANE };
        if (Math.hypot(c.x - goal.x, c.z - goal.z) < 4) break;
        const w = driverWay(grid, p, yaw, goal, back); back = w.back;
        said.push(nextTurn(w.points, yaw).dir);
        // one metre on along the way's centre line (the car keeps its lane: p is c moved to the kerb side)
        const q = w.points.find(k => Math.hypot(k.x - c.x, k.z - c.z) > 0.5) ?? goal;
        const d = Math.hypot(q.x - c.x, q.z - c.z), st = Math.min(1, d);
        yaw = Math.atan2(q.x - c.x, q.z - c.z); c = { x: c.x + ((q.x - c.x) / d) * st, z: c.z + ((q.z - c.z) / d) * st };
      }
      const turns = said.filter((d, i) => i && d !== said[i - 1] && d !== 'straight' && said[i - 1] === 'straight').length;
      expect(said.includes('back'), `${JSON.stringify(start)} → ${JSON.stringify(goal)}: ${said.join(',')}`).toBe(false);
      expect(changes(said), `${JSON.stringify(goal)}: ${said.join(',')}`).toBeLessThanOrEqual(2 * turns + 2);
      expect(Math.hypot(c.x - goal.x, c.z - goal.z)).toBeLessThan(20);
    }
  });
  it('halfway round a corner (the car pointing between the two streets) is not a U-turn', () => {
    // the drive of the journey check (run 5's last « Fais demi-tour »): east along z = 0, turning left (south, −z) at x = 60; caught at 49° into the turn
    const goal = { x: C(3), z: C(2) - 30 };
    for (const yaw of [Math.PI / 2 + 0.6, Math.PI / 2 + 0.85, Math.PI / 2 + 1.0]) {
      const w = driverWay(grid, { x: C(3) + 2, z: C(2) + 1 }, yaw, goal, false);
      expect(nextTurn(w.points, yaw).dir, `yaw ${yaw.toFixed(2)}`).not.toBe('back'); expect(w.back).toBe(false);
    }
  });
  it('the U-turn cost is a block\'s worth or so, not a whole district', () => {
    expect(UTURN_COST).toBeGreaterThanOrEqual(60); expect(UTURN_COST).toBeLessThanOrEqual(200);
  });
});
