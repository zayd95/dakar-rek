import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { ESPLANADE as E } from '../src/world/cornicheEsplanade';
import { BAY } from '../src/world/city';

stubCanvas();

/** Is a walker (a disc of radius r) at (x, z) inside a collider? */
const blockedAt = (cs: { x0: number; z0: number; x1: number; z1: number }[], x: number, z: number, r = 0.35) => cs.some(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);

describe('the Corniche\'s round esplanade (src/world/cornicheEsplanade.ts)', () => {
  it('is reached on foot from the street\'s end, is closed on its three seaward sides, and leaves the rest of the shore where it stopped', async () => {
    const { buildHub } = await import('../src/world/builder');
    for (const lite of [false, true]) {
      const hub = buildHub('corniche', lite), cs = hub.colliders;
      expect(hub.bounds.x0).toBeLessThanOrEqual(E.x0 - 0.5);
      // the way down: from the sea-side pavement at the end of the street (z = −60) to the far side of the disc, nothing in the way
      for (let x = -128.2; x > E.x - E.r + 1; x -= 0.4) expect(blockedAt(cs, x, E.z), `the way down is blocked at x ${x.toFixed(1)} (${lite ? 'lite' : 'full'})`).toBe(false);
      // the whole disc is clear
      for (let a = 0; a < Math.PI * 2; a += 0.3) for (const r of [4, 9, E.r - 1]) expect(blockedAt(cs, E.x + Math.cos(a) * r, E.z + Math.sin(a) * r)).toBe(false);
      // a walker cannot leave the headland by the sea: every way out of it but the way down crosses a wall
      const crosses = (x0: number, z0: number, x1: number, z1: number) => { for (let k = 0; k <= 60; k++) if (blockedAt(cs, x0 + (x1 - x0) * k / 60, z0 + (z1 - z0) * k / 60, 0.05)) return true; return false; };
      for (let z = E.z0 + 1; z < E.z1; z += 3) expect(crosses(E.x0 + 2, z, E.x0 - 6, z), `west at z ${z}`).toBe(true);
      for (let x = E.x0 + 1; x < E.shore - 1; x += 3) { expect(crosses(x, E.z0 + 2, x, E.z0 - 6), `north at x ${x}`).toBe(true); expect(crosses(x, E.z1 - 2, x, E.z1 + 6), `south at x ${x}`).toBe(true); }
      // everywhere else the water's edge is where it was (x = BAY.shoreX), the fish beach included
      for (const z of [-120, -95, -30, 10, 50, BAY.z0 + 5, (BAY.z0 + BAY.z1) / 2, BAY.z1 - 5, 122]) expect(crosses(BAY.shoreX + 3, z, BAY.shoreX - 5, z), `the shore at z ${z}`).toBe(true);
      // the strip of grass between the railing and the sea wall is not a path along the shore
      expect(crosses(-134.8, E.gate1 - 1, -134.8, E.gate1 + 3)).toBe(true); expect(crosses(-134.8, E.gate0 + 1, -134.8, E.gate0 - 3)).toBe(true);
      // people stand on the disc on Medium and High, none on Low
      const onDisc = hub.people.filter(p => Math.hypot(p.x - E.x, p.z - E.z) < E.r).length;
      expect(onDisc).toBe(lite ? 0 : 3);
      hub.dispose();
    }
  }, 120000);
});
