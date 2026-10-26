import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildHomeInterior, type HomeInterior } from '../src/economy/homeInterior';
import { homeSpec } from '../src/economy/catalog';
import { F2_JAMM as P, inner, overlaps, passage, roomAt, wallPieces, type Rect } from '../src/housing/plan';
import { SHELL } from '../src/housing/apartment';
import type { Collider } from '../src/world/types';

/**
 * LD2.0-C lane H: the F2 of the Résidence Jàmm built from its floor plan (src/housing/apartment.ts), headless: the walls are the plan's, every
 * doorway is free, the doors open for the player and shut behind them, the spawn is free, the room light follows the player, the shell stays
 * within its draw calls, and a walk through every room with the game's own collision (main.ts pushOut) never ends in a wall.
 * A canvas stub stands in for the browser's (the procedural textures).
 */
const ctx2d: object = new Proxy(function () { /* stub */ }, { get: () => ctx2d, apply: () => ctx2d, set: () => true });
beforeAll(() => {
  const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('document', { createElement: canvas, createElementNS: canvas });
});
afterAll(() => { vi.unstubAllGlobals(); });

const OX = 1660, OZ = 0;
type Desc = { plan: string; room: string | null; doors: { id: string; open: boolean; k: number; blocks: boolean }[]; light: { room: string; x: number; z: number }; hole: { on: boolean; between: number; seen: number } };
function build(upgrades: string[] = []): HomeInterior { return buildHomeInterior(homeSpec('appart_jamm')!, OX, OZ, 'pikine', upgrades); }
const desc = (h: HomeInterior) => h.int.describe!() as Desc;
/** The camera of the game indoors: above and behind the player (src/actors/camera.ts, a room open to the sky). */
function cameraFor(player: THREE.Vector3, yaw = Math.PI) {
  const c = new THREE.PerspectiveCamera(58, 390 / 844, 0.3, 700);
  c.position.set(player.x - Math.sin(yaw) * 4.8, 0.1 + 1.3 + 5.0, player.z - Math.cos(yaw) * 4.8);
  c.lookAt(player.x, 1.2, player.z);
  return c;
}
const run = (h: HomeInterior, player: THREE.Vector3, seconds: number, hour = 12, dt = 1 / 60, cam = cameraFor(player)) => {
  for (let t = 0; t < seconds; t += dt) h.int.update!(dt, player, cam, hour);
};
const at = (x: number, z: number) => new THREE.Vector3(OX + x, 0.1, OZ + z);
const local = (c: Collider): Rect => ({ x0: c.x0 - OX, x1: c.x1 - OX, z0: c.z0 - OZ, z1: c.z1 - OZ });
const near = (a: Rect, b: Rect, e = 1e-6) => Math.abs(a.x0 - b.x0) < e && Math.abs(a.x1 - b.x1) < e && Math.abs(a.z0 - b.z0) < e && Math.abs(a.z1 - b.z1) < e;
const dist = (r: Rect, x: number, z: number) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
/** main.ts pushOut: the player's body (radius r) out of every collider, one after the other. */
function pushOut(x: number, z: number, r: number, cols: readonly Collider[]): [number, number] {
  for (const c of cols) {
    const cx = Math.min(Math.max(x, c.x0), c.x1), cz = Math.min(Math.max(z, c.z0), c.z1);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
    else { const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z, m = Math.min(l, rr, t, b); if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r; }
  }
  return [x, z];
}

describe('the F2 of the Résidence Jàmm, built from its floor plan (LD2.0-C)', () => {
  it('is built from the plan; the other homes keep their open room', () => {
    const h = build();
    expect(desc(h).plan).toBe(P.id);
    expect(h.int.open).toBe(true);
    expect(h.int.bounds).toEqual({ x0: OX - 4.5, x1: OX + 4.5, z0: OZ - 3.5, z1: OZ + 3.5 });
    expect(h.int.cameraBox).toEqual(h.int.bounds);
    expect(h.int.interactables.map(i => [i.id, i.name])).toEqual([['pikine:in:door:appart_jamm', 'Sortir']]);
    const other = buildHomeInterior(homeSpec('maison_cite')!, 2000, 0, 'pikine');
    expect(other.int.describe).toBeUndefined();
    expect(other.int.update).toBeUndefined();
    expect(homeSpec('appart_jamm')!.home).toMatchObject({ w: P.w, d: P.d });
    expect(homeSpec('appart_jamm')!.size).toBe(63);
  });

  it('has a wall collider for every piece of wall of the plan, full height, and nothing else but the fittings, the street door and the leaves', () => {
    const h = build(), pieces = wallPieces(P), cols = h.int.colliders;
    for (const w of pieces) expect(cols.some(c => near(local(c), w) && c.h === P.wallH), `${w.axis}@${w.at} ${w.x0},${w.z0}`).toBe(true);
    const fittings = P.fixtures.filter(f => !P.fixtures.some(g => g !== f && g.box.x0 <= f.box.x0 && g.box.x1 >= f.box.x1 && g.box.z0 <= f.box.z0 && g.box.z1 >= f.box.z1));
    for (const f of fittings) expect(cols.some(c => near(local(c), f.box)), f.id).toBe(true);
    const front = passage(P, P.openings.find(o => o.kind === 'front')!);
    const parked = cols.filter(c => c.x0 > 1e5);
    expect(parked.length).toBe(P.openings.filter(o => o.kind === 'door').length);         // the leaves' colliders wait far away while the doors are shut
    expect(cols.length).toBe(pieces.length + fittings.length + 1 + parked.length);
    expect(cols.some(c => near(local(c), front))).toBe(true);                               // the street door is shut: « Sortir » takes the player out
  });

  it('keeps every doorway and arch free of colliders, the doors shut and wide open', () => {
    const h = build();
    const check = () => {
      for (const o of P.openings.filter(q => q.kind !== 'front')) {
        const pass = passage(P, o);
        for (const c of h.int.colliders) expect(overlaps(local(c), pass), `${o.id} × ${JSON.stringify(local(c))}`).toBe(false);
      }
    };
    check();
    // stand on the far side of each door until it is wide open (its leaf then stops the player like a wall, beside the doorway, not in it)
    for (const o of P.openings.filter(q => q.kind === 'door')) {
      const other = o.swing === o.a ? o.b : o.a, r = inner(P, P.rooms.find(q => q.id === other)!);
      const p = at(Math.min(Math.max(o.x, r.x0 + 0.4), r.x1 - 0.4), Math.min(Math.max(o.z, r.z0 + 0.4), r.z1 - 0.4));
      run(h, p, 0.6);
      expect(desc(h).doors.find(d => d.id === o.id)!.k).toBe(1);
      check();
    }
  });

  it('opens a door when the player comes near, on either side, and shuts it about two seconds after they have gone', () => {
    const h = build(), k = () => desc(h).doors.find(d => d.id === 'sejour-cuisine')!;
    const pivot = h.int.group.getObjectByName('door:sejour-cuisine')!;
    const shut = pivot.rotation.y;
    const p = at(1.8 - 1.0, 0.7);                                                            // 1 m from the kitchen's doorway, in the séjour
    run(h, at(-3, 2.5), 0.5);
    expect(k().k).toBe(0);
    run(h, p, 0.2);
    expect(k().k).toBeGreaterThan(0.4); expect(k().k).toBeLessThan(1);                      // swinging: about 0.35 s from shut to open
    run(h, p, 0.2);
    expect(k()).toMatchObject({ open: true, k: 1 });
    expect(Math.abs(pivot.rotation.y - shut)).toBeCloseTo(Math.PI / 2, 5);                    // a quarter turn
    p.set(OX - 3, 0.1, OZ + 2.5);                                                            // gone: still open for a while, then shut
    run(h, p, 1.5);
    expect(k().k).toBe(1);
    run(h, p, 1.0);
    expect(k()).toMatchObject({ open: false, k: 0 });
    expect(pivot.rotation.y).toBeCloseTo(shut, 6);
    // from the kitchen's side too, and it swings into the kitchen (its swing room): the leaf's far end goes east of the doorway
    run(h, at(2.6, 0.0), 0.5);
    expect(k().k).toBe(1);
    const tip = new THREE.Vector3(0.9, 1, 0).applyMatrix4(pivot.matrixWorld.copy(new THREE.Matrix4().compose(pivot.position, pivot.quaternion, pivot.scale)));
    expect(tip.x - OX).toBeGreaterThan(2.5);
  });

  it('never pushes the player with a leaf: standing where the open leaf goes, it opens without a collider until they step off', () => {
    const h = build(), d = () => desc(h).doors.find(q => q.id === 'degagement-chambre')!;
    const p = at(-1.5, -1.1);                                                                // in the chambre, where the open leaf lies
    run(h, p, 0.6);
    expect(d()).toMatchObject({ k: 1, blocks: false });
    expect(h.int.colliders.some(c => c.x0 < 1e5 && p.x > c.x0 - 0.3 && p.x < c.x1 + 0.3 && p.z > c.z0 - 0.3 && p.z < c.z1 + 0.3 && c.h < 2.5 && c.h > 2)).toBe(false);
    p.set(OX - 2.6, 0.1, OZ - 2.2);
    run(h, p, 0.2);
    expect(d()).toMatchObject({ k: 1, blocks: true });                                       // stepped off: the open leaf is solid now
  });

  it('spawns the player free, in the entrance, inside the street door', () => {
    const h = build(), s = h.int.spawn;
    expect(s).toEqual({ x: OX + P.spawn.x, z: OZ + P.spawn.z, yaw: P.spawn.yaw });
    expect(roomAt(P, s.x - OX, s.z - OZ)?.id).toBe('entree');
    for (const c of h.int.colliders) expect(dist(local(c), s.x - OX, s.z - OZ), JSON.stringify(local(c))).toBeGreaterThanOrEqual(0.3);
    const exit = h.int.interactables[0];
    expect(Math.hypot(exit.x - s.x, exit.z - s.z)).toBeLessThan(exit.radius);
    run(h, at(s.x - OX, s.z - OZ), 0.1);
    expect(desc(h).room).toBe('entree');
  });

  it('moves the room light to the room the player is in, and lights the lamps at night', () => {
    const h = build();
    for (const r of P.rooms) {
      const i = inner(P, r), cx = (i.x0 + i.x1) / 2, cz = (i.z0 + i.z1) / 2;
      run(h, at(cx, cz), 1.0);
      const d = desc(h);
      expect(d.room, r.id).toBe(r.id);
      expect(d.light.room).toBe(r.id);
      expect(Math.hypot(d.light.x - cx, d.light.z - cz), r.id).toBeLessThan(0.05);
      expect(h.int.light.y).toBeGreaterThan(1.8); expect(h.int.light.y).toBeLessThan(P.wallH + 0.1);
    }
    // in a doorway (no room) the light stays where it was
    run(h, at(0.8, 1.5), 1.0);
    run(h, at(1.8, 0.7), 0.5);
    expect(desc(h).light.room).toBe('sejour');
    const lamps = h.ceiling[0] as THREE.Mesh, mat = lamps.material as THREE.MeshLambertMaterial;
    run(h, at(0, 2), 0.1, 12); expect(mat.emissiveIntensity).toBe(0);
    run(h, at(0, 2), 0.1, 21); expect(mat.emissiveIntensity).toBeGreaterThan(1);
  });

  it('opens the see-through hole when a wall stands between the camera and the player', () => {
    const h = build();
    const p = at(-2.6, -1.8);                                                                // in the chambre, the camera south of it, above the séjour
    run(h, p, 0.5);
    let d = desc(h);
    expect(d.hole.between).toBeGreaterThan(0);
    expect(d.hole.on).toBe(true);
    expect(d.hole.seen).toBeGreaterThanOrEqual(2 / 3);
    const q = at(-1.5, 1.6), over = new THREE.PerspectiveCamera(58, 390 / 844, 0.3, 700);   // in the middle of the séjour, the camera right above: nothing between
    over.position.set(q.x, 6.5, q.z + 1.2);
    run(h, q, 0.5, 12, 1 / 60, over);
    d = desc(h);
    expect(d.hole.between).toBe(0);
    expect(d.hole.seen).toBe(1);
  });

  it('keeps within its draw calls: one mesh per material and one per moving leaf, at most 14', () => {
    const h = build();
    let meshes = 0, tris = 0;
    h.int.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
    expect(meshes).toBeLessThanOrEqual(14);
    expect(meshes).toBe(7 + P.openings.filter(o => o.kind === 'door').length);
    expect(tris).toBeLessThan(30_000);
    // nothing of the shell casts a shadow (the sun barely comes in; the shadow pass would double the calls)
    h.int.group.traverse(o => { if ((o as THREE.Mesh).isMesh) expect((o as THREE.Mesh).castShadow).toBe(false); });
  });

  it('points the kitchen at the sink and the shower at its front, where the player can stand', () => {
    const h = build(), { kitchen, shower } = h.spots;
    expect(roomAt(P, kitchen.x - OX, kitchen.z - OZ)?.id).toBe('cuisine');
    expect(roomAt(P, shower.x - OX, shower.z - OZ)?.id).toBe('sdb');
    const sink = P.fixtures.find(f => f.kind === 'sink')!.box;
    expect(kitchen.z - OZ).toBeGreaterThan(sink.z0); expect(kitchen.z - OZ).toBeLessThan(sink.z1);
    for (const s of [kitchen, shower]) for (const c of h.int.colliders) expect(dist(local(c), s.x - OX, s.z - OZ)).toBeGreaterThanOrEqual(0.3);
  });

  it('can be walked through every room with the game\'s own collision, never ending in a wall or a fitting', () => {
    const h = build(), p = at(P.spawn.x, P.spawn.z), seen = new Set<string>();
    const route: [number, number][] = [
      [2.6, 2.45], [1.0, 2.45], [1.0, 0.7], [2.3, 0.75], [3.2, 0.8], [3.2, -1.2], [3.2, 0.8], [2.3, 0.75], [1.0, 0.7],     // séjour → cuisine → séjour
      [0.5, 0.6], [0.5, -0.6], [-0.4, -0.65], [-1.6, -0.6], [-2.4, -0.55], [-2.6, -1.8], [-2.4, -0.55], [-1.6, -0.6],      // dégagement → chambre
      [-0.4, -0.65], [1.1, -0.7], [1.0, -1.9], [0.3, -2.2], [1.0, -1.9], [1.1, -0.7],                                        // → salle de bain
      [0.5, -0.5], [0.5, 0.6], [1.0, 2.45], [2.6, 2.45], [3.15, 2.9],                                                        // → back to the door
    ];
    const dt = 1 / 30, speed = 2.2, solid = h.int.colliders, b = h.int.bounds;
    for (const [tx, tz] of route) {
      let t = 0;
      while (Math.hypot(p.x - OX - tx, p.z - OZ - tz) > 0.2) {
        const dx = OX + tx - p.x, dz = OZ + tz - p.z, l = Math.hypot(dx, dz), s = Math.min(l, speed * dt);
        let [nx, nz] = pushOut(p.x + (dx / l) * s, p.z + (dz / l) * s, 0.3, solid);
        nx = Math.min(Math.max(nx, b.x0), b.x1); nz = Math.min(Math.max(nz, b.z0), b.z1);
        p.x = nx; p.z = nz;
        h.int.update!(dt, p, cameraFor(p), 12);
        for (const c of solid) expect(dist(local(c), p.x - OX, p.z - OZ), `at ${(p.x - OX).toFixed(2)},${(p.z - OZ).toFixed(2)} going to ${tx},${tz}`).toBeGreaterThan(0.25);
        const r = desc(h).room; if (r) seen.add(r);
        t += dt; expect(t, `stuck going to ${tx},${tz} at ${(p.x - OX).toFixed(2)},${(p.z - OZ).toFixed(2)}`).toBeLessThan(12);
      }
    }
    expect([...seen].sort()).toEqual(P.rooms.map(r => r.id).sort());
    expect(desc(h).room).toBe('entree');
  });

  it('holds the player back when a slow frame\'s step would carry them through a wall', () => {
    const h = build(), p = at(-2.0, 0.4);                                                    // in the séjour, just south of the chambre's wall
    run(h, p, 0.1);
    p.set(OX - 2.0, 0.1, OZ - 0.35);                                                         // one 0.75 m step: through the wall, into the chambre
    h.int.update!(0.1, p, cameraFor(p), 12);
    expect(p.z - OZ).toBeCloseTo(0.4, 6);
    p.set(OX - 3.5, 0.1, OZ + 2.5);                                                          // a jump (a door, a debug place) is not held back
    h.int.update!(0.1, p, cameraFor(p), 12);
    expect(p.x - OX).toBeCloseTo(-3.5, 6);
    expect(SHELL.jump).toBeLessThan(1);
  });
});
