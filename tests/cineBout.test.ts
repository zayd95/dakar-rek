import { describe, expect, it } from 'vitest';
import { CineBout, TECHS, type TechId } from '../src/lamb/cinematic';

const DT = 1 / 30;
const far = { player: 5, opponent: 5 };

/** Steps until `stop`, pressing when `press` says, picking `pick` at the opening. */
function run(b: CineBout, press: (b: CineBout) => boolean, pick: TechId | null, stop: (b: CineBout) => boolean, apart = 1.2, edge = far, max = 3000) {
  for (let i = 0; i < max && !stop(b); i++) b.step(DT, press(b), b.phase === 'ouverture' ? pick : null, apart, edge);
}

describe('the cinematic bout (src/lamb/cinematic.ts)', () => {
  it('a player pressing in the lit zone wins the hand fight, and a throw at the needle\'s peak puts him on his back', () => {
    const b = new CineBout({ level: 2, seed: 3 });
    run(b, x => x.phase === 'debout', null, x => x.phase === 'empoignade');
    run(b, x => x.phase === 'empoignade' && x.inZone, null, x => x.phase !== 'empoignade');
    expect(b.phase).toBe('ouverture'); expect(b.mine).toBe(CineBout.BEATS);
    run(b, x => x.phase === 'projection' && x.needle > 0.97, 'hanche', x => x.phase === 'scene');
    expect(b.scene).toMatchObject({ kind: 'throw', by: 'player', result: 'fall', a: TECHS.hanche.a, b: TECHS.hanche.b });
    run(b, () => false, null, x => x.phase === 'fin');
    expect(b.winner).toBe('player');
  });

  it('pressing out of the zone gives him the beats: he attacks, and holding him off in the zone sends both back standing', () => {
    const b = new CineBout({ level: 3, seed: 9 });
    run(b, x => x.phase === 'debout', null, x => x.phase === 'empoignade');
    run(b, x => x.phase === 'empoignade' && !x.inZone, null, x => x.phase !== 'empoignade');
    expect(b.phase).toBe('defense');
    run(b, x => x.phase === 'defense' && x.inZone && x.needle > x.z0 + 0.01 && x.needle < x.z1 - 0.01, null, x => x.phase === 'scene');
    expect(b.scene?.kind).toBe('resist');
    run(b, () => false, null, x => x.phase !== 'scene');
    expect(b.phase).toBe('debout'); expect(b.winner).toBeNull();
  });

  it('a throw too weak is countered; a wrestler out of the pit three times loses', () => {
    const b = new CineBout({ level: 2, seed: 5 });
    run(b, x => x.phase === 'debout', null, x => x.phase === 'empoignade');
    run(b, x => x.phase === 'empoignade' && x.inZone, null, x => x.phase !== 'empoignade');
    run(b, x => x.phase === 'projection' && x.needle > 0.05 && x.needle < 0.12, 'souleve', x => x.phase !== 'projection' && x.phase !== 'ouverture');
    expect(b.phase).toBe('defense');
    const c = new CineBout({ level: 2, seed: 1 });
    for (let k = 1; k <= 3; k++) {
      c.step(DT, false, null, 3, { player: -0.2, opponent: 5 });
      expect(c.sorties.player).toBe(k);
    }
    expect(c.phase).toBe('fin'); expect(c.winner).toBe('opponent');
  });
});
