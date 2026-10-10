import { describe, expect, it } from 'vitest';
import { POSTER_KEEP_CLEAR, arenaWallSpots, posterLines, posters, wallSpots } from '../src/arena/posters';
import { GALA } from '../src/arena/program';
import { WALL_R, angleDiff, inGate, inTunnel } from '../src/world/geew';

describe('fight posters: what they say', () => {
  it('a grand gala Friday to Sunday, a neighbourhood bout on weekdays, with the bill and the arena', () => {
    const sat = posterLines(5, 10, null), thu = posterLines(3, 10, null);
    expect(sat.tag).toBe('GRAND GALA DE LUTTE'); expect(sat.big).toBe(true);
    expect(thu.tag).toBe('COMBAT DE QUARTIER'); expect(thu.big).toBe(false);
    for (const l of [sat, thu]) {
      expect(l.title).toBe('BABACAR – LAMINE');
      expect(l.ecuries).toBe('Écurie Baobab · Écurie Teranga');
      expect(l.when).toBe(`Ce soir ${GALA.doors} h · Arène de Pikine`);
      expect(l.price).toMatch(/^Entrée 1\s000 F$/);
      expect(l.result).toBeNull();
    }
  });
  it('after closing time the posters announce tomorrow (Thursday night → Friday\'s gala)', () => {
    const l = posterLines(3, GALA.close + 0.5, null);
    expect(l.when).toBe(`Demain ${GALA.doors} h · Arène de Pikine`);
    expect(l.tag).toBe('GRAND GALA DE LUTTE');
  });
  it('once tonight\'s gala is over, the posters are crossed « soirée terminée » and announce tomorrow', () => {
    const during = posterLines(3, 20, null, false), done = posterLines(3, 20, null, true), late = posterLines(3, GALA.close + 0.2, null, false);
    expect(during.over).toBe(false); expect(during.when).toMatch(/^Ce soir/);
    for (const l of [done, late]) { expect(l.over).toBe(true); expect(l.when).toMatch(/^Demain/); expect(l.tag).toBe('GRAND GALA DE LUTTE'); }   // Thursday → Friday's gala
    expect(posterLines(4, 10, null, true).over).toBe(false);                   // a gala done yesterday does not cross this morning's posters
  });
  it('the career lane prints the last result for two days', () => {
    posters.setResult(10, 'Babacar a battu Lamine');
    expect(posterLines(10, 12).result).toBe('Dernier combat : Babacar a battu Lamine');
    expect(posterLines(12, 12).result).toBe('Dernier combat : Babacar a battu Lamine');
    expect(posterLines(13, 12).result).toBeNull();
    posters.clearResult();
    expect(posterLines(10, 12).result).toBeNull();
  });
});

describe('fight posters: where they go', () => {
  // a street along x, a row of buildings on its +z side, a door in the middle
  const hub = {
    id: 'pikine' as const, arena: null,
    edges: [{ ax: 0, az: 0, bx: 120, bz: 0 }],
    colliders: [{ x0: 0, z0: 7, x1: 120, z1: 20, h: 6 }, { x0: 0, z0: -20, x1: 120, z1: -7, h: 1.2 }],
    interactables: [{ id: 'door', name: 'Boutique', kind: 'actions' as const, x: 60, z: 7.2, radius: 2, actions: [] }],
  };
  const spots = wallSpots(hub as never, 6);
  it('on street walls, facing the road, not on low walls, away from doors, spaced out', () => {
    expect(spots.length).toBeGreaterThanOrEqual(4);
    for (const s of spots) {
      expect(s.z).toBeGreaterThan(6.5); expect(s.z).toBeLessThan(7);              // just in front of the +z facade
      expect(Math.abs(angleDiff(s.yaw, Math.PI))).toBeLessThan(1e-6);           // facing the road (−z)
      expect(Math.hypot(s.x - 60, s.z - 7.2)).toBeGreaterThanOrEqual(3);
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThanOrEqual(9);
  });
  it('on the arena\'s outer wall: outside, clear of both gates and of the career poster', () => {
    const w = arenaWallSpots(0, 0);
    expect(w.length).toBe(6);
    for (const s of w) {
      const a = Math.atan2(s.x, s.z);
      expect(Math.hypot(s.x, s.z)).toBeGreaterThan(WALL_R);
      expect(inGate(a, 0.5) || inTunnel(a, 0.5)).toBe(false);
      expect(Math.abs(angleDiff(a, POSTER_KEEP_CLEAR))).toBeGreaterThanOrEqual(0.3);
    }
  });
});
