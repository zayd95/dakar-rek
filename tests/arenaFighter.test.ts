import { describe, expect, it } from 'vitest';
import { PREP_SECONDS, arenaFighter, fighterSpots } from '../src/arena/fighter';
import { PREP_SIDE, deckCentre, prepCornerCentre } from '../src/world/arenaModules';
import { drumVolume, fighterDrumVolume } from '../src/arena/exteriorRules';
import { FIGHTER_DRUMS } from '../src/arena/exterior';
import { TUNNEL_MOUTH_R, WALL_R } from '../src/world/geew';

describe('the fighter\'s path: places on the arena\'s existing pieces', () => {
  const cx = 200, cz = -30;
  it('outside the wrestlers\' gate, in the tunnel, in the écurie\'s corner, at the ring\'s edge', () => {
    for (const e of ['baobab', 'teranga'] as const) {
      const s = fighterSpots(cx, cz, e);
      expect(s.gate.z - cz).toBeGreaterThan(WALL_R);                          // behind the arena (+z), outside the wall
      expect(s.outside(s.gate.x, s.gate.z)).toBe(true);
      expect(s.inTunnel(s.tunnel.x, s.tunnel.z)).toBe(true);
      expect(s.inTunnel(s.gate.x, s.gate.z)).toBe(false);
      expect(s.corner).toEqual(prepCornerCentre(cx, cz, PREP_SIDE[e]));
      expect(Math.sign(s.corner.x - cx)).toBe(PREP_SIDE[e]);
      expect(Math.hypot(s.ring.x - cx, s.ring.z - cz)).toBeLessThan(TUNNEL_MOUTH_R - 5);   // at the sandbags, on the runner
      expect(Math.abs(s.ring.x - cx)).toBeLessThan(0.01);
    }
  });
  it('the two écuries have their own corners, on either side of the tunnel', () => {
    expect(PREP_SIDE.baobab).toBe(-PREP_SIDE.teranga);
  });
  it('a short moment in the corner, and no path without a game to run it', () => {
    expect(PREP_SECONDS).toBeGreaterThanOrEqual(5); expect(PREP_SECONDS).toBeLessThanOrEqual(12);
    expect(arenaFighter.begin()).toBe(false);                                 // not initialised (no game context)
    expect(arenaFighter.pending()).toBe(false);
    expect(arenaFighter.phase()).toBe('idle');
  });
  it('in either écurie\'s corner the drums play louder for him, across the ring from their deck too', () => {
    const dk = deckCentre(cx, cz);
    for (const e of ['baobab', 'teranga'] as const) {
      const c = fighterSpots(cx, cz, e).corner, dist = Math.hypot(c.x - dk.x, c.z - dk.z);
      expect(fighterDrumVolume(dist, true, false, false, FIGHTER_DRUMS)).toBeGreaterThan(1.1);
      expect(fighterDrumVolume(dist, true, false, true, FIGHTER_DRUMS)).toBe(0);                   // sound off
    }
    const far = fighterSpots(cx, cz, 'teranga').corner;
    expect(drumVolume(Math.hypot(far.x - dk.x, far.z - dk.z), false, false)).toBeLessThan(0.9);    // the plain falloff would not
    expect(fighterDrumVolume(60, false, false, false, FIGHTER_DRUMS)).toBe(0);                     // outside the walls: by distance
  });
});
