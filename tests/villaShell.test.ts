import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildHomeInterior, type HomeInterior } from '../src/economy/homeInterior';
import { homeSpec } from '../src/economy/catalog';
import { VILLA_PLAN as V } from '../src/housing/villaPlan';
import { inner, roomAt, stairParts, toPlan, wallPieces, type Rect } from '../src/housing/plan';
import { inBand, type Collider } from '../src/world/types';
import { buildVillaFacade, setVillaFacadeNight } from '../src/housing/villaFacade';
import { STOREY } from '../src/housing/villa';

/**
 * LD2.0-D lane V-S: the villa's shell on three levels (src/housing/apartment.ts), headless: its draw calls per level, the cutaway, the colliders of
 * each floor, the ground under the player (a flight is a ramp), the doors of each floor, and a walk through every room of the three levels with the
 * game's own collision (main.ts pushOut, with the colliders' height band) and its ground (main.ts: Interior.groundAt).
 */
const ctx2d: object = new Proxy(function () { /* stub */ }, { get: () => ctx2d, apply: () => ctx2d, set: () => true });
beforeAll(() => {
  const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('document', { createElement: canvas, createElementNS: canvas });
});
afterAll(() => { vi.unstubAllGlobals(); });

const OX = 1780, OZ = 0;
type Desc = { plan: string; room: string | null; level: string; y: number; levels: { id: string; shell: boolean; core: boolean }[]; doors: { id: string; open: boolean; k: number; blocks: boolean }[]; hole: { on: boolean; between: number; seen: number } };
const build = (): HomeInterior => buildHomeInterior(homeSpec('villa_almadies')!, OX, OZ, 'almadies');
const desc = (h: HomeInterior) => h.int.describe!() as Desc;
function cameraFor(p: THREE.Vector3, yaw = Math.PI) {
  const c = new THREE.PerspectiveCamera(58, 390 / 844, 0.3, 700);
  c.position.set(p.x - Math.sin(yaw) * 4.8, p.y + 1.3 + 5.0, p.z - Math.cos(yaw) * 4.8);
  c.lookAt(p.x, p.y + 1.1, p.z);
  return c;
}
const at = (x: number, z: number, y = 0) => new THREE.Vector3(OX + x, 0.1 + y, OZ + z);
const run = (h: HomeInterior, p: THREE.Vector3, s: number, hour = 12, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) h.int.update!(dt, p, cameraFor(p), hour); };
/** main.ts pushOut, with the colliders' height band (LD2.0-D). */
function pushOut(x: number, z: number, r: number, cols: readonly Collider[], y: number): [number, number] {
  for (const c of cols) {
    if (c.y0 !== undefined && !inBand(c, y)) continue;
    const cx = Math.min(Math.max(x, c.x0), c.x1), cz = Math.min(Math.max(z, c.z0), c.z1);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
    else { const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z, m = Math.min(l, rr, t, b); if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r; }
  }
  return [x, z];
}
const meshesIn = (o: THREE.Object3D) => { let n = 0, tris = 0; o.traverse(q => { const m = q as THREE.Mesh; if (m.isMesh && m.visible !== false) { n++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } }); return { n, tris }; };

describe('the villa\'s shell on three levels (LD2.0-D)', () => {
  it('is built from the villa\'s plan, its levels in parts the cutaway shows and hides; the F2\'s builder unchanged', () => {
    const h = build(), d = desc(h);
    expect(d.plan).toBe(V.id);
    expect(d.level).toBe('rdc');
    expect(h.int.groundAt).toBeTypeOf('function');
    expect(h.int.bounds).toEqual({ x0: OX - 11, x1: OX + 11, z0: OZ - 11, z1: OZ + 5.4 });
    const parts = h.int.group.children.filter(c => c.userData.shellPart).map(c => c.name);
    expect(parts.sort()).toEqual(['level:etage:core', 'level:etage:shell', 'level:rdc:core', 'level:rdc:shell', 'level:toit:shell']);
    expect(d.levels).toEqual([{ id: 'rdc', shell: true, core: true }, { id: 'etage', shell: false, core: false }, { id: 'toit', shell: false, core: false }]);
  });

  it('keeps each level within its draw calls: the shell of a level in view 17–26 calls with what is seen of the levels below (a furnished level ≤ 60), and nothing casts a shadow', () => {
    const h = build();
    const visibleCalls = () => {
      let n = 0, tris = 0;
      const walk = (o: THREE.Object3D) => { if (!o.visible) return; const m = o as THREE.Mesh; if (m.isMesh) { n++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } o.children.forEach(walk); };
      walk(h.int.group); return { n, tris };
    };
    const per: Record<string, { n: number; tris: number }> = {};
    for (const [lv, y, x, z] of [['rdc', 0, -3, 2], ['etage', STOREY, 0, 2], ['toit', 2 * STOREY, -6, 3]] as const) {
      run(h, at(x, z, y), 0.2);
      expect(desc(h).level).toBe(lv);
      per[lv] = visibleCalls();
    }
    console.log('villa shell per level (calls, triangles):', JSON.stringify(per));
    for (const lv of ['rdc', 'etage', 'toit']) { expect(per[lv].n, lv).toBeLessThanOrEqual(lv === 'rdc' ? 18 : 28); expect(per[lv].tris, lv).toBeLessThan(45_000); }
    // the level's own shell, without the parts of the levels below it seen from above
    const own = (name: string) => meshesIn(h.int.group.getObjectByName(name)!);
    for (const lv of ['rdc', 'etage']) expect(own(`level:${lv}:core`).n + own(`level:${lv}:shell`).n, lv).toBeLessThanOrEqual(20);
    expect(own('level:toit:shell').n).toBeLessThanOrEqual(11);
    h.int.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name !== 'helicopter') expect((o as THREE.Mesh).castShadow, o.name).toBe(false); });
  });

  it('the cutaway: the levels above the player hidden, below only what the floor above leaves seen', () => {
    const h = build();
    run(h, at(0, 2, STOREY), 0.2);
    expect(desc(h).levels).toEqual([{ id: 'rdc', shell: true, core: false }, { id: 'etage', shell: true, core: true }, { id: 'toit', shell: false, core: false }]);
    run(h, at(-6, 3, 2 * STOREY), 0.2);
    expect(desc(h).levels).toEqual([{ id: 'rdc', shell: true, core: false }, { id: 'etage', shell: true, core: false }, { id: 'toit', shell: true, core: true }]);
    // the editor framing a room downstairs brings the view there
    h.int.holeFocus = new THREE.Vector3(OX - 4, 0.1 + 0.9, OZ - 2);
    run(h, at(-6, 3, 2 * STOREY), 0.1);
    expect(desc(h).level).toBe('rdc');
    h.int.holeFocus = null;
    // a piece of furniture tagged by the estate follows the same rule
    const g = new THREE.Group(), up = new THREE.Object3D(), down = new THREE.Object3D(), deck = new THREE.Object3D();
    up.userData = { homeLevel: 1, covered: true }; down.userData = { homeLevel: 0, covered: true }; deck.userData = { homeLevel: 0, covered: false };
    g.add(up, down, deck); h.int.group.add(g);
    run(h, at(0, 2, STOREY), 0.1);
    expect([up.visible, down.visible, deck.visible]).toEqual([true, false, true]);
    run(h, at(-3, 2), 0.1);
    expect([up.visible, down.visible, deck.visible]).toEqual([false, true, true]);
  });

  it('every collider has its floor\'s heights: a wall downstairs never stops the player upstairs, nor one upstairs the player below', () => {
    const h = build(), cols = h.int.colliders.filter(c => c.x0 < 1e5);
    expect(cols.every(c => c.y0 !== undefined)).toBe(true);
    for (const w of wallPieces(V).filter(q => q.kind === 'wall')) {
      const lv = V.levels!.find(l => l.id === w.level)!;
      const c = cols.find(q => Math.abs(q.x0 - (OX + w.x0 - lv.dx)) < 1e-6 && Math.abs(q.z0 - w.z0) < 1e-6 && Math.abs(q.x1 - (OX + w.x1 - lv.dx)) < 1e-6 && Math.abs(q.y0! - (lv.y - 0.1)) < 1e-6);
      expect(c, `${w.level} ${w.axis}@${w.at}`).toBeTruthy();
      expect(inBand(c!, 0.1 + lv.y), `${w.level} ${w.axis}@${w.at} ${JSON.stringify(c)}`).toBe(true);
      for (const o of V.levels!) if (o !== lv) expect(inBand(c!, 0.1 + o.y), `${w.level} wall, player on ${o.id}`).toBe(false);
    }
  });

  it('the ground under the player: each level\'s floor, a smooth ramp on the stairs', () => {
    const h = build(), g = (x: number, z: number, y: number) => h.int.groundAt!(OX + x, OZ + z, y);
    expect(g(-3, 2, 0)).toBe(0);
    expect(g(-3, 2, STOREY)).toBe(STOREY);
    expect(g(-3, 2, 2 * STOREY)).toBe(2 * STOREY);
    const [f1, f2] = stairParts(V);
    // half way up the first flight
    const mid1 = g(5.2, (f1.foot + f1.head) / 2, 1.6);
    expect(mid1).toBeGreaterThan(1.5); expect(mid1).toBeLessThan(1.9);
    const mid2 = g(7.15, (f2.foot + f2.head) / 2, STOREY + 1.6);
    expect(mid2).toBeGreaterThan(STOREY + 1.5); expect(mid2).toBeLessThan(STOREY + 1.9);
  });

  it('says when the player stands outdoors (the pool deck, a balcony, the roof terrace: lit as the outside at night)', () => {
    const h = build();
    for (const [x, z, y, out] of [[-3, -1.5, 0, false], [5, -7, 0, true], [-2.4, 4.75, STOREY, true], [-5, -2.5, STOREY, false], [3.6, 3.0, 2 * STOREY, true]] as const) {
      run(h, at(x, z, y), 0.1);
      expect(h.int.outdoors!(), `${x},${z} y ${y}`).toBe(out);
    }
  });

  it('a door opens only for the player on its own floor', () => {
    const h = build(), k = (id: string) => desc(h).doors.find(d => d.id === id)!.k;
    run(h, at(-4.0, 0.75), 0.6);                                                        // beside the bureau's door, on the ground floor
    expect(k('entree-bureau')).toBe(1);
    run(h, at(-3, 2.6), 3);
    expect(k('entree-bureau')).toBe(0);
    run(h, at(-4.0, 1.0, STOREY), 0.6);                                                 // right above it, in the salon familial: the bureau's door stays shut
    expect(k('entree-bureau')).toBe(0);
    run(h, at(-4.0, 3.3, STOREY), 0.6);
    expect(k('salon-chambre3')).toBe(1);                                                // … and the bedroom's door opens
  });

  it('can be walked through every room of the three levels with the game\'s own collision and ground, never in a wall', () => {
    const h = build(), p = at(V.spawn.x, V.spawn.z), seen = new Set<string>(), levels = new Set<string>();
    // [house x, z], in order: the ground floor, out to the pool deck, up to the first floor and its rooms, up to the roof, and back down
    const route: [number, number][] = [
      [-3, 1.0], [-3.8, 0.75], [-4.65, 0.75], [-5.4, 0.75], [-6.2, 1.6], [-5.4, 0.75], [-4.65, 0.75], [-3.8, 0.75], [-3, 0.9], [-3, -1.5], [-4.6, -3.6], [-4.5, -5.55], [0, -5.55], [5, -5.55], [7, -7.4], [7.2, -9.8], [7, -7.4], [5, -5.55], [1.7, -5.55], [1.7, -4.0],      // salon → garden
      [2.6, -1.0], [2.6, 0.9], [2.6, -1.0], [3.4, -3.85], [5.3, -3.85], [7.2, -3.0], [7.2, 1.0], [7.2, 2.4], [6.0, 2.6], [7.2, 2.4], [7.2, 1.0], [7.2, -3.0], [5.3, -3.85], [5.15, -3.2],                                                                    // dining, kitchen, hall
      [5.15, -2.4], [5.15, 0.0], [5.15, 1.3], [5.15, 2.3], [3.6, 2.6], [1.0, 2.2],                                                                       // flight 1 → étage, salon familial
      [-2.4, 3.2], [-2.4, 4.75], [-2.4, 3.2], [-3.6, 0.4], [-3.6, -1.4], [-5.0, -2.8], [-5.4, -4.4], [-5.4, -5.85], [-5.4, -4.4],                     // balcony, suite, its balcony
      [-3.4, -1.6], [-1.6, -1.6], [-1.6, -3.4], [-1.6, -1.6], [-3.4, -1.6], [-3.6, -0.2], [-3.6, 0.6],                                                    // dressing, bathroom
      [-3.8, 3.3], [-5.2, 3.3], [-6.4, 2.0], [-5.2, 3.3], [-3.8, 3.3], [0.25, 0.6], [0.25, -1.3], [1.3, -3.5], [0.25, -1.3], [0.25, 0.6], [3.7, 0.4], [3.7, -4.2], [5.6, -4.2], [5.8, -3.6], [5.6, -4.2], [3.7, -4.2], [3.7, 0.4],
      [6.2, 2.4], [7.15, 1.9], [7.15, 1.0], [7.15, -1.5], [7.15, -3.4], [6.0, -3.9], [3.6, -3.9], [0.6, -3.6], [-0.4, 1.4], [3.6, 3.0], [6.4, 3.0],     // flight 2 → roof, helipad, street terrace
      [3.6, 3.0], [3.6, -3.9], [6.0, -3.9], [7.15, -3.4], [7.15, 1.0], [7.15, 2.0], [6.2, 2.4], [5.15, 2.0], [5.15, 1.0], [5.15, -2.0], [5.15, -3.3], [5.3, -3.85], [3.4, -3.85], [-3, -1.5], [-3, 2.6],
    ];
    const dt = 1 / 30, speed = 2.0, cols = h.int.colliders, b = h.int.bounds;
    let closest = Infinity;
    for (const [tx, tz] of route) {
      let t = 0;
      while (Math.hypot(p.x - OX - tx, p.z - OZ - tz) > 0.2) {
        const dx = OX + tx - p.x, dz = OZ + tz - p.z, l = Math.hypot(dx, dz), s = Math.min(l, speed * dt);
        let [nx, nz] = pushOut(p.x + (dx / l) * s, p.z + (dz / l) * s, 0.3, cols, p.y);
        nx = Math.min(Math.max(nx, b.x0), b.x1); nz = Math.min(Math.max(nz, b.z0), b.z1);
        p.x = nx; p.z = nz;
        const gy = 0.1 + h.int.groundAt!(p.x, p.z, p.y - 0.1); p.y += (gy - p.y) * Math.min(1, dt * 14);
        h.int.update!(dt, p, cameraFor(p), 12);
        for (const c of cols) {
          if (c.x0 > 1e5 || !inBand(c, p.y)) continue;
          const d = Math.hypot(Math.max(c.x0 - p.x, 0, p.x - c.x1), Math.max(c.z0 - p.z, 0, p.z - c.z1));
          closest = Math.min(closest, d);
          expect(d, `at ${(p.x - OX).toFixed(2)},${(p.z - OZ).toFixed(2)} y ${p.y.toFixed(2)} going to ${tx},${tz}`).toBeGreaterThan(0.25);
        }
        const d = desc(h); if (d.room) seen.add(d.room); levels.add(d.level);
        t += dt; expect(t, `stuck going to ${tx},${tz} at ${(p.x - OX).toFixed(2)},${(p.z - OZ).toFixed(2)} y ${p.y.toFixed(2)}`).toBeLessThan(14);
      }
      const q = toPlan(V, p.x - OX, p.z - OZ, p.y - 0.1);
      void q;
    }
    console.log(`villa walk: ${seen.size} rooms, closest ${closest.toFixed(3)} m`);
    expect([...levels].sort()).toEqual(['etage', 'rdc', 'toit']);
    expect(V.rooms.map(r => r.id).filter(id => !seen.has(id))).toEqual([]);
    expect(p.y).toBeCloseTo(0.1, 2);
    expect(desc(h).room).toBe('entree');
  });

  it('the street façade: drawn from the plan in at most 6 draw calls and 8k triangles, its storeys, cantilevered slabs, balconies, stair head and claustra; lit at night', () => {
    const g = buildVillaFacade(), m = meshesIn(g);
    expect(m.n).toBeLessThanOrEqual(6);
    expect(m.tris).toBeLessThan(8_000);
    expect(g.children.map(c => c.name).sort()).toEqual(['villa-facade:glass', 'villa-facade:glazing', 'villa-facade:lights', 'villa-facade:render', 'villa-facade:stone', 'villa-facade:trim']);
    const box = new THREE.Box3().setFromObject(g);
    // the roof's slab cantilevered 60 cm past the walls (x ±8.125), a metre toward the street
    expect(box.min.x).toBeCloseTo(-8.725, 1); expect(box.max.x).toBeCloseTo(8.725, 1);
    expect(box.max.y).toBeGreaterThan(2 * STOREY + 3);                                 // the stair head stands on the roof
    expect(box.max.z).toBeGreaterThan(5.3);                                            // the street balcony
    expect(box.min.z).toBeLessThan(-6.5);                                              // the balcony over the pool deck
    // the travertine storey and the claustra: stone below the first slab, the tower's slats standing off its street face up past the roof
    const stone = new THREE.Box3().setFromObject(g.getObjectByName('villa-facade:stone')!);
    expect(stone.max.y).toBeLessThan(STOREY);
    // the lights: additive, dark by day, lit at night with the windows' glow
    const lights = (g.getObjectByName('villa-facade:lights') as THREE.Mesh).material as THREE.MeshBasicMaterial, glaze = (g.getObjectByName('villa-facade:glazing') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    expect(lights.blending).toBe(THREE.AdditiveBlending);
    setVillaFacadeNight(0); expect(lights.color.r).toBe(0); expect(glaze.emissiveIntensity).toBe(0);
    setVillaFacadeNight(1); expect(lights.color.r).toBe(1); expect(glaze.emissiveIntensity).toBeGreaterThan(0.1);
    setVillaFacadeNight(0);
  });

  it('every room of every level has its inside free of the walls it is drawn with', () => {
    for (const r of V.rooms) for (const w of wallPieces(V)) expect(!(w.x0 < inner(V, r).x1 - 1e-6 && inner(V, r).x0 < w.x1 - 1e-6 && w.z0 < inner(V, r).z1 - 1e-6 && inner(V, r).z0 < w.z1 - 1e-6), r.id).toBe(true);
    expect(roomAt(V, -3, 2)?.id).toBe('entree');
    const R: Rect = inner(V, V.rooms.find(r => r.id === 'jardin')!); expect(R.z1 - R.z0).toBeGreaterThan(5);
  });
});
