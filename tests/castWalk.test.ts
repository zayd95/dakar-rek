import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// a body without assets: Cast only needs its group, the clip it holds and a few calls
vi.mock('../src/actors/humanoid', () => ({
  humanoidReady: () => true,
  Humanoid: class { group = new THREE.Group(); hold = 'Idle'; play() {} animate() {} setLook() {} dispose() {} },
}));

const { Cast } = await import('../src/venues/cast');
const { Seats } = await import('../src/interact/seats');

describe('venue cast: walks', () => {
  const make = () => {
    const cast = new Cast([{ id: 'a', look: { skin: 0x3b2216, style: 'tee' } as never, x: 0, z: 0, clip: 'Idle', when: () => true }], new Seats(), new THREE.Group(), 'test');
    cast.setMoment('on');
    return cast;
  };

  it('a walk plays Walk on the way and ends in its own pose', () => {
    const cast = make();
    cast.walkTo('a', [{ x: 2, z: 0 }], 0, 'Talk', 2);
    cast.update(0.1, { x: 0, z: 0 }, 50);
    expect(cast.where('a')!.clip).toBe('Walk');
    expect(cast.walking('a')).toBe(true);
    for (let i = 0; i < 20; i++) cast.update(0.1, { x: 0, z: 0 }, 50);
    expect(cast.walking('a')).toBe(false);
    expect(cast.where('a')!.clip).toBe('Talk');
  });

  it('a walk cut short by `place` never leaves the role standing still with the walk playing (the corner after a fête)', () => {
    const cast = make();
    cast.walkTo('a', [{ x: 8, z: 0 }], 0, 'Idle', 1.5);
    cast.update(0.1, { x: 0, z: 0 }, 50);
    expect(cast.where('a')!.clip).toBe('Walk');
    cast.place('a', 1, 1, 0);
    expect(cast.walking('a')).toBe(false);
    expect(cast.where('a')).toMatchObject({ x: 1, z: 1, clip: 'Idle' });
    cast.update(0.1, { x: 0, z: 0 }, 50);
    expect(cast.where('a')).toMatchObject({ x: 1, z: 1, clip: 'Idle' });
    // a role the venue walks itself (a vendor along the stands) keeps the clip it is given
    cast.setClip('a', 'Walk'); cast.place('a', 2, 1, 0);
    expect(cast.where('a')!.clip).toBe('Walk');
  });
});
