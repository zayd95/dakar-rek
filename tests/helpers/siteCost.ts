import * as THREE from 'three';
import { Batch } from '../../src/world/batch';
import { siteDraw, type DistrictKit, type Site, type Variant } from '../../src/world/almadies/contract';

/**
 * LD2.0-E: a district kit on real batches (tests and the lanes' viewers): what a site draws, counted. The sign hook records instead of making a mesh.
 */
export interface TestKit { kit: DistrictKit; batches: Record<string, Batch>; signs: { text: string; x: number; y: number; z: number; yaw: number; w: number; h: number }[]; lights: number }
export function testKit(lite = false): TestKit {
  const batches = { plain: new Batch(), pave: new Batch(), leaves: new Batch(), trunks: new Batch(), water: new Batch(), bulbs: new Batch(), glass: new Batch(), fac: new Batch(), metal: new Batch() };
  const t: TestKit = { kit: null as unknown as DistrictKit, batches, signs: [], lights: 0 };
  t.kit = { lite, ...batches, metalMat: new THREE.MeshBasicMaterial(), pool: () => { t.lights++; }, sign: (text, _bg, _fg, x, y, z, yaw, w = 6, h = 1.5) => { t.signs.push({ text, x, y, z, yaw, w, h }); } };
  return t;
}
export const trisOf = (t: TestKit) => Object.values(t.batches).reduce((n, b) => n + b.triangles(), 0);
/** Draws one site with a variant (or the plan's own): the triangles, the colliders, the canopies, the keep-clear rectangles, the signs. */
export function drawSite(site: Site, v: Variant, lite = false) {
  const t = testKit(lite), d = siteDraw(t.kit, site), r = v.build(d) ?? {};
  return { tris: trisOf(t), colliders: d.colliders, canopies: d.canopies, keepClear: r.keepClear ?? [], signs: t.signs, group: r.group, lights: t.lights, draw: d, kit: t };
}
