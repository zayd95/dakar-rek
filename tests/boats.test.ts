import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { Batch } from '../src/world/batch';
import { buildBoat } from '../src/world/boats';
import { buildNgorIsland, buildNgorQuay, ngorGroundY, ngorShore } from '../src/world/ngor';
import { BOAT_KINDS, TRAVERSEE_SITE as S, deckY, type BoatKind } from '../src/sea/traverseeSite';
import type { HubWorld } from '../src/world/types';

/**
 * La traversée's world (docs/TRAVERSEE.md, lane W): the two boats' models (src/world/boats.ts) and the static quay, pontoon and island
 * (src/world/ngor.ts), built headless.
 */
stubCanvas();
const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const meshes = (o: THREE.Object3D) => { const m: THREE.Mesh[] = []; o.traverse(c => { if ((c as THREE.Mesh).isMesh) m.push(c as THREE.Mesh); }); return m; };
const IDS: Record<BoatKind, string[]> = { pirogue: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], chaloupe: ['c0', 'c1', 'c2', 'c3'] };

describe('the traversée\'s boats', () => {
  for (const kind of BOAT_KINDS) for (const lite of [false, true]) describe(`${kind}${lite ? ' (Low)' : ''}`, () => {
    const boat = buildBoat(kind, mat(), lite), hull = boat.group.getObjectByName('hull') as THREE.Mesh;
    boat.group.updateMatrixWorld(true);
    const pos = hull.geometry.attributes.position;

    it('is one group: one merged mesh and its wake, at rest unseen; its cost is what it draws, within the budget', () => {
      expect(boat.kind).toBe(kind);
      const ms = meshes(boat.group);
      expect(ms).toHaveLength(2); expect(ms).toContain(boat.wake); expect(ms).toContain(hull);
      expect(boat.cost.draws).toBe(ms.length); expect(boat.cost.draws).toBeLessThanOrEqual(2);
      expect(boat.cost.tris).toBe(Math.round(ms.reduce((n, m) => n + tris(m.geometry), 0)));
      expect(boat.cost.tris).toBeLessThanOrEqual(1500);
      const wm = boat.wake.material as THREE.MeshBasicMaterial;
      expect(wm.opacity).toBe(0); expect(wm.transparent).toBe(true); expect(wm.depthWrite).toBe(false);
      expect(boat.wake.position.z).toBeGreaterThanOrEqual(0);                              // behind the stern (+z)
      expect(boat.length).toBe(kind === 'pirogue' ? 10 : 8);
      if (kind === 'chaloupe') expect(boat.beam).toBeCloseTo(2.6, 5);
    });

    it('is built along its z, bow at −z and the motor at the stern (+z), its keel below the water and its gunwales above it', () => {
      const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
      expect(box.min.z).toBeLessThan(-boat.length / 2 + 0.3); expect(box.max.z).toBeGreaterThan(boat.length / 2 - 0.1);
      expect(box.max.x - box.min.x).toBeGreaterThan(boat.beam - 0.05);
      expect(box.min.y).toBeLessThan(-0.2);                                                // the motor's leg and the keel in the water
      // the motor: the highest point aft of the helm is its powerhead, well above the gunwale
      let aftTop = -Infinity; for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > boat.helm.z + 0.5) aftTop = Math.max(aftTop, pos.getY(i));
      expect(aftTop).toBeGreaterThan(1.3);
    });

    it('seats the helm at the motor and its customers on real thwarts or benches, inside the hull, facing the bow, above a floor that is above the sea', () => {
      expect(boat.helm.id).toBe('helm');
      expect(boat.seats.map(s => s.id)).toEqual(IDS[kind]);
      const rc = new THREE.Raycaster();
      for (const s of [boat.helm, ...boat.seats]) {
        expect(s.yaw).toBeCloseTo(Math.PI);
        expect(Math.abs(s.z)).toBeLessThan(boat.length / 2 - 0.5);
        // the sitting surface is there (straight down from just above the hips), and under it the floor, above the sea plane (y 0)
        rc.set(new THREE.Vector3(s.x, s.y + 0.3, s.z), new THREE.Vector3(0, -1, 0));
        const hits = rc.intersectObject(hull, false).map(h => h.point.y);
        expect(hits.length, s.id).toBeGreaterThan(1);
        expect(Math.abs(hits[0] - s.y), `${s.id} sits on ${hits[0]}`).toBeLessThan(0.02);
        const floor = hits.find(y => y < s.y - 0.15);
        expect(floor, s.id).toBeDefined(); expect(floor!).toBeGreaterThan(0.02);
        // inside the hull's footprint at that height: its skin is further out on both sides
        let out = 0; for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i) - s.z) < 0.35 && Math.abs(pos.getY(i) - s.y) < 0.3) out = Math.max(out, Math.abs(pos.getX(i)));
        expect(Math.abs(s.x) + 0.2, s.id).toBeLessThan(out);
      }
      // two to a thwart or bench, a hip's width apart; the helm aft of everyone
      const rows = new Map<number, number[]>(); for (const s of boat.seats) rows.set(s.z, [...(rows.get(s.z) ?? []), s.x]);
      for (const xs of rows.values()) { expect(xs).toHaveLength(2); expect(Math.abs(xs[0] - xs[1])).toBeGreaterThan(0.65); }
      for (const s of boat.seats) expect(boat.helm.z).toBeGreaterThan(s.z + 0.8);
    });

    it('steps aboard on its west gunwale, mid-length, between the seats', () => {
      expect(boat.step.x).toBeCloseTo(-boat.beam / 2);
      expect(Math.abs(boat.step.z)).toBeLessThan(boat.length / 4);
    });
  });

  it('the chaloupe has its canopy except on Low; Low is lighter for both', () => {
    for (const kind of BOAT_KINDS) expect(buildBoat(kind, mat(), true).cost.tris).toBeLessThan(buildBoat(kind, mat(), false).cost.tris);
    const top = (b: ReturnType<typeof buildBoat>) => new THREE.Box3().setFromObject(b.group.getObjectByName('hull')!).max.y;
    expect(top(buildBoat('chaloupe', mat(), false))).toBeGreaterThan(2.08);              // the canopy over the benches (the flag's staff stops at 2.02)
    expect(top(buildBoat('chaloupe', mat(), true))).toBeLessThan(2.05);
  });

  it('dispose frees its geometries and the wake\'s material, and takes it out of the scene', () => {
    for (const kind of BOAT_KINDS) {
      const scene = new THREE.Scene(), material = mat(), boat = buildBoat(kind, material);
      scene.add(boat.group);
      let freed = 0;
      for (const m of meshes(boat.group)) m.geometry.addEventListener('dispose', () => freed++);
      (boat.wake.material as THREE.Material).addEventListener('dispose', () => freed++);
      let shared = 0; material.addEventListener('dispose', () => shared++);
      boat.dispose();
      expect(freed).toBe(3); expect(shared).toBe(0);                                       // the hull's material is the caller's
      expect(boat.group.parent).toBeNull();
    }
  });
});

describe('the Embarcadère de Ngor: the quay, the pontoon and the island (static, in the hub\'s batches)', () => {
  const batches = () => ({ plain: new Batch(), leaves: new Batch(), trunks: new Batch(), bulbs: new Batch() });
  const built = (k: ReturnType<typeof batches>) => Object.values(k).map(b => b.build(mat())).filter((m): m is THREE.Mesh => !!m);
  const verts = (ms: THREE.Mesh[]) => ms.flatMap(m => { const p = m.geometry.attributes.position, out: THREE.Vector3[] = []; for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))); return out; });
  // the port block (src/world/builder.ts: block 2,0 of the Almadies): its centre x and its north edge; the coast road lies between bz − 14 and bz
  const cx = 30, bz = -113, road = { z0: bz - 14, z1: bz };
  const quayOf = (lite: boolean) => { const k = batches(); let draws = 0; const q = buildNgorQuay(k, { cx, bz, base: 0.14, lite, rand: () => (draws++, 0.5) }); return { ...q, meshes: built(k), draws }; };

  it('the pier runs on the contract\'s line, out to z −158, at the deck height the crossing walks on', () => {
    expect(S.pier.x0).toBe(cx - 3); expect(S.pier.x1).toBe(cx + 3);
    const q = quayOf(false), deck = verts(q.meshes).filter(v => Math.abs(v.y - 0.54) < 0.005 && v.x >= S.pier.x0 - 0.01 && v.x <= S.pier.x1 + 0.01);
    expect(Math.min(...deck.map(v => v.z))).toBeCloseTo(S.pier.z0, 1);
    const pier = q.ramps.find(r => r.z0 <= S.pier.z0 && r.z1 < road.z0)!;
    expect(pier).toBeDefined(); expect(pier.x0).toBeLessThanOrEqual((S.pier.x0 + S.pier.x1) / 2 - 2); expect(pier.xEnd).toBeGreaterThanOrEqual((S.pier.x0 + S.pier.x1) / 2 + 2);
    expect(deckY(30, -158)).toBe(0.32); expect(deckY(30, -157.9)).toBe(0.54);
    // the pontoon's deck at its height over its whole box
    const pd = verts(q.meshes).filter(v => Math.abs(v.y - 0.32) < 0.002);
    expect(Math.min(...pd.map(v => v.x))).toBeCloseTo(S.pontoon.x0, 1); expect(Math.max(...pd.map(v => v.x))).toBeCloseTo(S.pontoon.x1, 1);
    expect(Math.min(...pd.map(v => v.z))).toBeCloseTo(S.pontoon.z0, 1); expect(Math.max(...pd.map(v => v.z))).toBeGreaterThanOrEqual(S.pontoon.z1 - 0.7);
  });

  it('leaves the coast road a road: nothing of the quay stands on it, and the hub\'s pirogues keep the same random draws', () => {
    for (const lite of [false, true]) {
      const q = quayOf(lite);
      expect(q.draws).toBe(5);
      for (const v of verts(q.meshes)) expect(v.z > road.z0 + 0.01 && v.z < road.z1 - 0.01, `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`).toBe(false);
      for (const c of q.colliders) expect(c.z1).toBeLessThanOrEqual(road.z0 - 1);
      for (const r of q.ramps) expect(r.z1 <= road.z0 || r.z0 >= road.z1).toBe(true);
    }
  });

  it('the beach pirogues lie clear of the pier, the pontoon, the moored boats and the road', () => {
    const q = quayOf(false), overlaps = (c: { x0: number; x1: number; z0: number; z1: number }, r: { x0: number; x1: number; z0: number; z1: number }) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;
    const moored = { x0: S.v1.quayMooring.x - 1.8, x1: S.v1.quayMooring.x + 1.8, z0: S.v1.quayMooring.z - 6, z1: S.v1.quayMooring.z + 6 };
    expect(q.colliders).toHaveLength(5);
    for (const c of q.colliders) {
      for (const r of [{ ...S.pier, x0: S.pier.x0 - 0.5, x1: S.pier.x1 + 0.5 }, S.pontoon, moored]) expect(overlaps(c, r), JSON.stringify(c)).toBe(false);
      expect(c.z1).toBeLessThanOrEqual(-128); expect(c.z0).toBeGreaterThan(-163);           // on the sand
    }
  });

  it('the island: within its budget (less on Low), its sand meeting the sea at the contract\'s shore, its jetty on the sand', () => {
    const count = (lite: boolean) => { const k = batches(); buildNgorIsland(k, lite); const ms = built(k); return { ms, tris: ms.reduce((n, m) => n + tris(m.geometry), 0) }; };
    const full = count(false), low = count(true);
    expect(full.tris).toBeLessThanOrEqual(3000); expect(low.tris).toBeLessThan(full.tris * 0.7);
    // offshore, out of the walkable bounds, nothing on the water's route but the jetty
    for (const v of verts(full.ms)) expect(v.z).toBeLessThan(S.v1.jetty.z1 + 0.5);
    for (const p of S.route.slice(0, -1)) expect(ngorGroundY(p.x, p.z)).toBeLessThan(0);
    // the waterline: the south shore at z −300 by the landing, the sand above the sea on the island's side of it and below on the water's
    expect(ngorGroundY(36, -296)).toBeLessThan(S.seaY); expect(ngorGroundY(36, -301)).toBeGreaterThan(S.seaY);
    const south = ngorShore(96).filter(p => Math.abs(p[0] - 36) < 4)[0];
    expect(south[2]).toBeGreaterThan(-301); expect(south[2]).toBeLessThan(-299);
    // the jetty's foot rests on the sand, a step below its deck; the landing path climbs gently; a little height inland
    const foot = ngorGroundY(36, S.v1.jetty.z0);
    expect(foot).toBeGreaterThan(S.seaY); expect(foot).toBeLessThan(0.45);
    const path = S.v1.path.map(p => ngorGroundY(p.x, p.z));
    expect(path[path.length - 1]).toBeLessThan(1.4);
    expect(ngorGroundY(S.island.centre.x, S.island.centre.z)).toBeGreaterThan(2.5);
  });
});

describe('the Almadies as built', () => {
  let hub: HubWorld | null = null;
  const almadies = async () => { if (!hub) { const { buildHub } = await import('../src/world/builder'); hub = buildHub('almadies', true); } return hub; };

  it('walks from the block over the road and down the pier to its end, with nothing in the way', async () => {
    const h = await almadies();
    expect(h.heightAt(30, -105)).toBeCloseTo(0.4); expect(h.heightAt(30, -120)).toBe(0);
    for (const z of [-140, -152, -157.9]) expect(h.heightAt((S.pier.x0 + S.pier.x1) / 2, z)).toBeCloseTo(0.4);
    expect(h.bounds.z0).toBe(-157);
    const walk = { x0: 27.6, x1: 32.4, z0: -157, z1: -100 };
    expect(h.colliders.filter(c => c.x1 > walk.x0 && c.x0 < walk.x1 && c.z1 > walk.z0 && c.z0 < walk.z1)).toEqual([]);
    // the coast road along the beach: no solid on it across the whole hub (the quay's pirogues are on the sand)
    expect(h.colliders.filter(c => c.z1 > -126 && c.z0 < -114 && c.x1 > 0 && c.x0 < 60)).toEqual([]);
  });

  it('the sign reads « EMBARCADÈRE DE NGOR »', async () => {
    const h = await almadies();
    const texts = h.signs.map(m => ((m.material as THREE.MeshLambertMaterial).map?.userData.sign as { text: string } | undefined)?.text);
    expect(texts).toContain('EMBARCADÈRE DE NGOR');
    expect(texts).not.toContain('PORT DE PÊCHE · NGOR');
  });
});
