import { describe, expect, it } from 'vitest';
import { legEnds, navDistance, nextTurn, openEdges, turnText } from '../src/game/navRules';
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
