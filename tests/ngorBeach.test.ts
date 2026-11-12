import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { NGOR_BEACH, NGOR_BEACH_KEEP_CLEAR, ngorBeachSeats } from '../src/world/ngorBeach';
import { TRAVERSEE_SITE as S } from '../src/sea/traverseeSite';

/**
 * La plage de Ngor (src/world/ngorBeach.ts): the beach first, then the embarkation. Where things are, that the player can reach every anchor and every seat, and that
 * nothing stands in the traversée's zones (docs/TRAVERSEE.md).
 */
const hit = (cs: { x0: number; z0: number; x1: number; z1: number }[], x: number, z: number, r = 0.35) => cs.filter(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);
const N = NGOR_BEACH;
stubCanvas();

describe('La plage de Ngor', () => {
  it('seats: twelve sun beds lying (head to the land), six bar stools, four waiting benches, two lookout benches facing the sea', () => {
    const seats = ngorBeachSeats();
    expect(seats.filter(s => s.kind === 'bed' && s.clip === 'Lie').length).toBe(12);
    expect(seats.filter(s => s.kind === 'stool').length).toBe(6);
    expect(seats.filter(s => s.id.includes(':wait:')).length).toBe(4);
    expect(seats.filter(s => s.id.includes(':look:')).every(s => Math.abs(s.yaw - Math.PI) < 1e-9)).toBe(true);
    expect(new Set(seats.map(s => s.id)).size).toBe(seats.length);
  });

  it('every anchor and seat of the beach is open ground the player can reach (no solid on it), and every bed has room at its side to stand up', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true);
    const anchors = [...Object.values(N.stalls).map(s => s.at), N.bar.at, N.hut.at, N.lookout.at, N.gate, { x: N.promenade.x0 + 1, z: N.promenade.z }, { x: N.promenade.x1 - 1, z: N.promenade.z }, { x: N.path.x, z: N.path.z0 }];
    for (const a of anchors) expect(hit(hub.colliders, a.x, a.z), JSON.stringify(a)).toEqual([]);
    for (const b of N.beds) { const lx = b.x + 1.25; expect(hit(hub.colliders, lx - 1.25 - 1.25, b.z, 0.2).filter(c => c.x1 < b.x - 0.4 || c.x0 > b.x + 0.4), b.id).toEqual([]); }
    for (const st of N.bar.stools) expect(hit(hub.colliders, st.x, st.z + 0.9, 0.2), JSON.stringify(st)).toEqual([]);
  });

  it('keeps off the traversée: the boats\' beach, the landing, the open way from the road to the boarding beach (x 47…62), the pier and the pontoon', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true), overlaps = (c: { x0: number; z0: number; x1: number; z1: number }, r: { x0: number; z0: number; x1: number; z1: number }) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;
    const mine = hub.colliders.filter(c => c.x1 > -26 && c.x0 < 52 && c.z1 > -156 && c.z0 < -128.5 && !(c.x0 > S.pier.x0 - 1 && c.x1 < S.pier.x1 + 1));
    for (const zone of [S.beach.clear, S.island.clear, { x0: 47, x1: 62, z0: -158, z1: -128 }, S.pier, S.pontoon]) expect(mine.filter(c => overlaps(c, zone)), JSON.stringify(zone)).toEqual([]);
  });

  it('the boardwalk runs unobstructed from the strip\'s east end to the embarkation, over the pier\'s foot', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true);
    for (let x = N.promenade.x0; x <= N.promenade.x1; x += 0.5) expect(hit(hub.colliders.filter(c => c.h > 0.3), x, N.promenade.z, 0.3), `x ${x}`).toEqual([]);
  });

  it('the lookout is reachable round the beach palm, and the telescope looks at the island', async () => {
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true), L = N.lookout;
    for (let z = N.promenade.z; z >= L.at.z; z -= 0.5) expect(hit(hub.colliders, 23.5, z, 0.35), `z ${z}`).toEqual([]);              // the way down at x 23.5
    expect(hit(hub.colliders, L.at.x, L.at.z)).toEqual([]);
    expect(Math.hypot(N.island.x - S.island.centre.x, N.island.z - S.island.centre.z)).toBeLessThan(1);
  });

  it('the street dressing keeps off the beach, the boardwalk, the embarkation and the lookout', async () => {
    expect(NGOR_BEACH_KEEP_CLEAR.map(r => r.why).sort()).toEqual(['ngor_beach', 'ngor_embarkation', 'ngor_lookout', 'ngor_promenade']);
    const { buildHub } = await import('../src/world/builder');
    const hub = buildHub('almadies', true);
    for (const r of NGOR_BEACH_KEEP_CLEAR) expect(hub.keepClear?.some(k => k.why === r.why), r.why).toBe(true);
  });
});
