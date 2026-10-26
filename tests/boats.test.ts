import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { Batch } from '../src/world/batch';
import { buildBoat } from '../src/world/boats';
import { NGOR_ISLAND_LAYOUT, buildNgorIsland, buildNgorQuay, ngorGround, ngorGroundY, ngorPathDistance, ngorShore, rooftopFloors, rooftopPieces } from '../src/world/ngor';
import { BEACH_PALMS, LAUNCHES, beachSandY, buildNgorLaunches, buildNgorShallows } from '../src/world/ngorBay';
import { BOAT_KINDS, TRAVERSEE_SITE as S, deckY, type BoatKind, type P2, type Pose } from '../src/sea/traverseeSite';
import type { HubWorld } from '../src/world/types';

/**
 * La traversée's world (docs/TRAVERSEE.md version 2, lane W): the two boats' models (src/world/boats.ts), the static quay, pontoon and island with its
 * rooftop restaurant (src/world/ngor.ts) and the bay (src/world/ngorBay.ts), built headless.
 */
stubCanvas();
const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const meshes = (o: THREE.Object3D) => { const m: THREE.Mesh[] = []; o.traverse(c => { if ((c as THREE.Mesh).isMesh) m.push(c as THREE.Mesh); }); return m; };
const IDS: Record<BoatKind, string[]> = { pirogue: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], chaloupe: ['c0', 'c1', 'c2', 'c3'] };
type Box = { x0: number; x1: number; z0: number; z1: number };
const inBox = (b: Box, x: number, z: number, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
/** The crossing's corridor: open water between the two beaches (the contract's clear zones and its route), where nothing static stands. */
const CORRIDOR: Box = { x0: 34, x1: 52, z0: -300, z1: -158 };
/** What lies under (x, z) in the bay: the mainland's sand, the island's ground or the sea's surface, whichever is highest. */
const surface = (x: number, z: number) => Math.max(S.seaY, z > S.shoreZ - 8 ? beachSandY(z) : -1, z < -280 ? ngorGroundY(x, z) : -1);

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

    it('is stepped into over its west gunwale near the bow, the end run up on the sand, forward of every seat', () => {
      expect(boat.step.z).toBeLessThan(-boat.length / 4); expect(boat.step.z).toBeGreaterThan(-boat.length / 2 + 0.8);
      for (const s of boat.seats) expect(boat.step.z).toBeLessThan(s.z - 0.3);
      // on the gunwale: the outermost skin at that section, felt for from outside at heights up the topsides
      const rc = new THREE.Raycaster(); let skin = 0;
      for (let y = 0.2; y < 1.3; y += 0.05) { rc.set(new THREE.Vector3(-4, y, boat.step.z), new THREE.Vector3(1, 0, 0)); const h = rc.intersectObject(hull, false)[0]; if (h) skin = Math.min(skin, h.point.x); }
      expect(boat.step.x).toBeLessThan(0);
      expect(Math.abs(boat.step.x - skin), `step ${boat.step.x} on the skin at ${skin}`).toBeLessThan(0.1);
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

  it('rests bow-on on the sand at the contract\'s beached poses: its bow at the water\'s edge touching the bottom, nowhere sunk in the sand', () => {
    const mainland = (x: number, z: number) => (void x, beachSandY(z)), island = ngorGroundY;
    const cases: [BoatKind, Pose, (x: number, z: number) => number][] = [['pirogue', S.beach.pirogue, mainland], ['chaloupe', S.beach.chaloupe, mainland], ['pirogue', S.island.beached, island]];
    for (const [kind, pose, ground] of cases) {
      const boat = buildBoat(kind, mat()), hull = boat.group.getObjectByName('hull') as THREE.Mesh, p = hull.geometry.attributes.position;
      const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), world = (i: number) => ({ x: pose.x + c * p.getX(i) + s * p.getZ(i), y: S.seaY + p.getY(i), z: pose.z - s * p.getX(i) + c * p.getZ(i) });
      const bow = { x: pose.x - s * boat.length / 2, z: pose.z - c * boat.length / 2 }, at = `${kind} at ${pose.x}, ${pose.z}`;
      expect(ground(bow.x, bow.z), `${at}: the ground under its bow is the water's edge`).toBeGreaterThan(S.seaY - 0.12);
      expect(ground(bow.x, bow.z), at).toBeLessThan(S.seaY + 0.1);
      let touch = Infinity, sunk = Infinity;
      for (let i = 0; i < p.count; i++) {
        const w = world(i), g = ground(w.x, w.z), clear = w.y - g;
        if (p.getZ(i) < -boat.length / 2 + 1) touch = Math.min(touch, clear);
        if (g > S.seaY) sunk = Math.min(sunk, clear);                                       // over sand above the water: seen
      }
      expect(touch, `${at}: its forefoot meets the bottom`).toBeLessThan(0.12); expect(touch, at).toBeGreaterThan(-0.12);
      if (sunk < Infinity) expect(sunk, `${at}: nothing of it sunk in the dry sand`).toBeGreaterThan(-0.12);
    }
  });
});

describe('the Embarcadère de Ngor: the quay, the pontoon, the island and the bay (static, in the hub\'s batches)', () => {
  const batches = () => ({ plain: new Batch(), leaves: new Batch(), trunks: new Batch(), bulbs: new Batch() });
  const built = (k: ReturnType<typeof batches>) => Object.values(k).map(b => b.build(mat())).filter((m): m is THREE.Mesh => !!m);
  const verts = (ms: THREE.Mesh[]) => ms.flatMap(m => { const p = m.geometry.attributes.position, out: THREE.Vector3[] = []; for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))); return out; });
  // the port block (src/world/builder.ts: block 2,0 of the Almadies): its centre x and its north edge; the coast road lies between bz − 14 and bz
  const cx = 30, bz = -113, road = { z0: bz - 14, z1: bz };
  const quayOf = (lite: boolean) => { const k = batches(); let draws = 0; const q = buildNgorQuay(k, { cx, bz, base: 0.14, lite, rand: () => (draws++, 0.5) }); return { ...q, meshes: built(k), draws }; };
  const islandOf = (lite: boolean) => { const k = batches(); buildNgorIsland(k, lite); const ms = built(k); return { ms, tris: ms.reduce((n, m) => n + tris(m.geometry), 0) }; };
  const bayOf = (lite: boolean) => { const b = new Batch(); buildNgorLaunches(b, lite); return b.build(mat())!; };
  const full = islandOf(false), low = islandOf(true);

  it('the pier runs on the contract\'s line, out to z −158, at the deck height people walk on', () => {
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

  it('the pirogues on the sand lie clear of the pier, the pontoon, the boarding beach and the customers\' way from their waiting spots to the boats', () => {
    const overlaps = (c: Box, r: Box) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;
    const way: Box = { x0: Math.min(...S.beach.waiting.map(w => w.x)) - 2, x1: Math.max(...S.beach.waiting.map(w => w.x)) + 2, z0: S.shoreZ, z1: Math.max(...S.beach.waiting.map(w => w.z)) + 1 };
    for (const lite of [false, true]) {
      const q = quayOf(lite);
      expect(q.colliders).toHaveLength(lite ? 6 : 8);                                     // the quay's five and more along the water's edge
      for (const c of q.colliders) {
        for (const r of [{ ...S.pier, x0: S.pier.x0 - 0.5, x1: S.pier.x1 + 0.5 }, S.pontoon, S.beach.clear, way]) expect(overlaps(c, r), JSON.stringify(c)).toBe(false);
        expect(c.z1).toBeLessThanOrEqual(-128); expect(c.z0).toBeGreaterThan(S.shoreZ);   // on the sand
      }
    }
  });

  it('the island: within its budget (less on Low), its sand meeting the sea at the contract\'s shore', () => {
    expect(full.tris).toBeLessThanOrEqual(9000); expect(low.tris).toBeLessThanOrEqual(5000); expect(low.tris).toBeLessThan(full.tris * 0.7);
    for (const p of S.route.slice(0, -1)) expect(ngorGroundY(p.x, p.z)).toBeLessThan(0);
    const south = ngorShore(96).filter(p => Math.abs(p[0] - 36) < 4)[0];
    expect(south[2]).toBeGreaterThan(-301); expect(south[2]).toBeLessThan(-299);
    expect(ngorGroundY(S.island.centre.x, S.island.centre.z)).toBeGreaterThan(2.5);
  });

  it('the landing\'s sand slopes gently into the sea: under it at z −297, above it by z −303, a bow resting at about z −299', () => {
    for (let x = 36; x <= 44; x += 0.5) {
      expect(ngorGroundY(x, -297), `x ${x}`).toBeLessThan(S.seaY); expect(ngorGroundY(x, -303), `x ${x}`).toBeGreaterThan(S.seaY);
      expect(Math.abs(ngorGroundY(x, -299) - S.seaY), `x ${x}: the bow's ground at the waterline`).toBeLessThan(0.1);
      for (let z = -294; z > -310; z -= 0.5) expect(ngorGroundY(x, z - 0.5) - ngorGroundY(x, z), `x ${x}, z ${z}: gently, rising inland`).toBeLessThan(0.07);
    }
    // the way up from the landing climbs gently, the waiting spots dry on the beach
    for (const w of S.island.waiting) expect(ngorGroundY(w.x, w.z)).toBeGreaterThan(S.seaY + 0.2);
    expect(ngorGroundY(S.island.path[0].x, S.island.path[0].z)).toBeLessThan(S.seaY);   // stepping down into the shallows by the bow
    expect(ngorGroundY(S.island.path[3].x, S.island.path[3].z)).toBeLessThan(1.6);
  });

  it('the island\'s ground is drawn where ngorGroundY says, within a few centimetres, along the landing and the way up', () => {
    for (const lite of [false, true]) {
      const mesh = new THREE.Mesh(ngorGround(lite), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), rc = new THREE.Raycaster();
      const at: P2[] = [...S.island.path, ...S.island.waiting];
      for (let x = 30; x <= 52; x += 2) for (let z = -294; z >= -318; z -= 2) at.push({ x, z });
      for (const p of at) {
        rc.set(new THREE.Vector3(p.x, 20, p.z), new THREE.Vector3(0, -1, 0));
        const hit = rc.intersectObject(mesh)[0];
        expect(hit, `${p.x}, ${p.z}`).toBeDefined();
        expect(Math.abs(hit.point.y - ngorGroundY(p.x, p.z)), `${p.x}, ${p.z}${lite ? ' (Low)' : ''}`).toBeLessThan(0.06);
      }
    }
  });

  it('nothing static stands in either clear zone or in the crossing\'s corridor: no jetty, rock, boat, parasol or post', () => {
    for (const lite of [false, true]) {
      const all = [...quayOf(lite).meshes, ...islandOf(lite).ms, bayOf(lite)];
      for (const zone of [S.beach.clear, S.island.clear, CORRIDOR]) for (const v of verts(all)) {
        if (!inBox(zone, v.x, v.z)) continue;
        expect(v.y, `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)} stands in ${JSON.stringify(zone)}`).toBeLessThan(surface(v.x, v.z) + 0.05);
      }
    }
  });

  it('the way up from the landing and the waiting spots are clear: no table, chair or post on them (the parasols\' canopies shade them, overhead)', () => {
    for (const v of verts(full.ms)) {
      if (ngorPathDistance(v.x, v.z) > 0.5) continue;
      const g = ngorGroundY(v.x, v.z);
      expect(v.y < g + 0.12 || v.y > g + 1.95, `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`).toBe(true);
    }
    // and each waiting spot under a parasol's canopy
    for (const w of S.island.waiting) expect(NGOR_ISLAND_LAYOUT.PARASOLS.some(([x, z]) => Math.hypot(x - w.x, z - w.z) < 1.3), JSON.stringify(w)).toBe(true);
  });

  it('the rooftop restaurant: outside the landing\'s clear zone, its terrace at roofY above its level floor, its furniture fitting the contract\'s poses', () => {
    const RT = S.island.rooftop, pieces = rooftopPieces(), { ground, roof } = rooftopFloors();
    const overlaps = (a: Box, b: Box) => a.x1 > b.x0 && a.x0 < b.x1 && a.z1 > b.z0 && a.z0 < b.z1;
    for (const b of [RT.box, RT.stair]) expect(overlaps(b, S.island.clear)).toBe(false);
    expect(ground).toBeCloseTo(ngorGroundY((RT.box.x0 + RT.box.x1) / 2, (RT.box.z0 + RT.box.z1) / 2), 6); expect(roof).toBeCloseTo(ground + RT.roofY, 6);
    // the terrace is built: its floor's vertices at roofY over the box, in the island's batch
    const floor = verts(full.ms).filter(v => Math.abs(v.y - roof) < 0.002 && inBox(RT.box, v.x, v.z, 0.2));
    expect(floor.length).toBeGreaterThan(4);
    // every piece on the terrace; a table at the mean of each dining four; each diner on a chair, each lounger on a sofa's seat
    for (const p of pieces) expect(inBox(RT.box, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2), JSON.stringify(p)).toBe(true);
    const tables = pieces.filter(p => p.kind === 'table');
    expect(tables).toHaveLength(RT.dining.length / 4);
    for (let t = 0; t < RT.dining.length / 4; t++) {
      const four = RT.dining.slice(t * 4, t * 4 + 4), x = four.reduce((s, p) => s + p.x, 0) / 4, z = four.reduce((s, p) => s + p.z, 0) / 4;
      expect(tables.some(tb => Math.abs((tb.x0 + tb.x1) / 2 - x) < 1e-6 && Math.abs((tb.z0 + tb.z1) / 2 - z) < 1e-6), `table ${t}`).toBe(true);
    }
    const on = (kind: string, p: P2) => pieces.some(q => q.kind === kind && inBox(q, p.x, p.z));
    for (const p of RT.dining) expect(on('chair', p), JSON.stringify(p)).toBe(true);
    for (const p of RT.lounge) expect(on('sofa', p), JSON.stringify(p)).toBe(true);
    // no pose inside anything that is not its seat (a body's half-width clear of it); the dancers' floor free of everything
    const solid = pieces.filter(p => p.kind !== 'chair' && p.kind !== 'sofa');
    for (const p of [...RT.dining, ...RT.lounge, ...RT.bar, RT.barman, RT.dj, ...RT.dance] as P2[]) for (const q of solid) expect(inBox(q, p.x, p.z, 0.15), `${JSON.stringify(p)} in ${JSON.stringify(q)}`).toBe(false);
    for (const p of RT.dance) for (const q of pieces) expect(inBox(q, p.x, p.z, 0.25), `dancer ${JSON.stringify(p)} in ${JSON.stringify(q)}`).toBe(false);
    // the bar along the back where the contract has it, its shelf behind the barman, the booth in front of the DJ
    const bar = pieces.find(p => p.kind === 'bar')!, shelf = pieces.find(p => p.kind === 'shelf')!, booth = pieces.find(p => p.kind === 'booth')!;
    expect(bar.x0).toBe(39); expect(bar.x1).toBe(47); expect((bar.z0 + bar.z1) / 2).toBeCloseTo(-329.5, 6);
    for (const b of RT.bar) expect(b.z).toBeGreaterThan(bar.z1);
    expect(RT.barman.z).toBeLessThan(bar.z0); expect(RT.barman.z).toBeGreaterThan(shelf.z1);
    expect(booth.z0).toBeGreaterThan(RT.dj.z); expect(RT.dj.x).toBeGreaterThan(booth.x0); expect(RT.dj.x).toBeLessThan(booth.x1);
  });

  it('the bay\'s launches: four to six, white, outside both clear zones and the corridor, within their budget (fewer on Low)', () => {
    expect(LAUNCHES.length).toBeGreaterThanOrEqual(4); expect(LAUNCHES.length).toBeLessThanOrEqual(6);
    expect(tris(bayOf(false).geometry)).toBeLessThanOrEqual(2500); expect(tris(bayOf(true).geometry)).toBeLessThan(tris(bayOf(false).geometry));
    for (const v of verts([bayOf(false)])) {
      for (const zone of [S.beach.clear, S.island.clear, CORRIDOR]) expect(inBox(zone, v.x, v.z), `${v.x.toFixed(2)}, ${v.z.toFixed(2)}`).toBe(false);
      expect(v.z).toBeLessThan(S.shoreZ);                                                   // on the water
    }
  });

  it('the shallows: one transparent mesh along the beach and round the island, lit like the sea, under the wakes, fading out to nothing', () => {
    let night = 0;
    const sh = buildNgorShallows(false, () => night), m = sh.material as THREE.MeshLambertMaterial, g = sh.geometry;
    expect(sh.isMesh).toBe(true); expect(meshes(sh)).toHaveLength(1);
    expect(m).toBeInstanceOf(THREE.MeshLambertMaterial); expect(m.transparent).toBe(true); expect(m.depthWrite).toBe(false); expect(m.vertexColors).toBe(true);
    expect(sh.renderOrder).toBeLessThan(buildBoat('pirogue', mat()).wake.renderOrder);
    const col = g.attributes.color, pos = g.attributes.position;
    expect(col.itemSize).toBe(4);
    let beach = 0, ring = 0, maxA = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), a = col.getW(i); maxA = Math.max(maxA, a);
      expect(pos.getY(i)).toBeGreaterThan(S.seaY); expect(pos.getY(i)).toBeLessThan(S.seaY + 0.03);   // just over the sea, under the wakes (0.08)
      if (z > S.shoreZ - 35) beach++;
      else if (Math.hypot((x - S.island.centre.x) / (S.island.size.x / 2), (z - S.island.centre.z) / (S.island.size.z / 2)) < 1.8) ring++;
      if (z < S.shoreZ - 27.5 && z > S.shoreZ - 35) expect(a).toBe(0);                     // the band's outer edge: gone into the sea
    }
    expect(beach).toBeGreaterThan(40); expect(ring).toBeGreaterThan(40); expect(maxA).toBeGreaterThan(0.5);
    // dimmed after dark
    sh.onBeforeRender(null as never, null as never, null as never, g, m, null as never); const day = m.opacity;
    night = 1; sh.onBeforeRender(null as never, null as never, null as never, g, m, null as never);
    expect(m.opacity).toBeLessThan(day * 0.5);
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

  it('the shallows are one mesh of the hub: the one transparent, vertex-faded surface on the water', async () => {
    const h = await almadies();
    const water = meshes(h.group).filter(m => m.name === 'shallows');
    expect(water).toHaveLength(1);
    expect(meshes(h.group).filter(m => (m.material as THREE.Material).transparent && m.geometry.attributes.color?.itemSize === 4 && m.position.y === 0 && m !== water[0] && m.name !== 'wake')).toEqual([]);
  });

  it('both clear zones and the corridor are free of solids; the open sand to the anchor too, from the coast road and from the pier\'s end', async () => {
    const h = await almadies(), overlaps = (c: Box, r: Box) => c.x1 > r.x0 && c.x0 < r.x1 && c.z1 > r.z0 && c.z0 < r.z1;
    const fromRoad = { x0: 47, x1: 62, z0: -158, z1: -128 }, fromPier = { x0: S.pier.x1, x1: 62, z0: -158, z1: -147 };
    for (const zone of [S.beach.clear, S.island.clear, CORRIDOR, fromRoad, fromPier]) expect(h.colliders.filter(c => overlaps(c, zone)), JSON.stringify(zone)).toEqual([]);
    for (const [x, z] of BEACH_PALMS) {
      expect(x < 36 || x > 62, `palm ${x}, ${z}`).toBe(true);
      expect(inBox({ ...S.pier, x0: S.pier.x0 - 1.5, x1: S.pier.x1 + 1.5 }, x, z) || inBox(S.pontoon, x, z, 1.5), `palm ${x}, ${z}`).toBe(false);
      expect(z).toBeGreaterThan(S.shoreZ + 4); expect(z).toBeLessThan(-130);
    }
  });

  it('nothing the hub draws stands in either clear zone: the boats\' beach and the landing are open sand and water', async () => {
    const h = await almadies(), v = new THREE.Vector3();
    h.group.updateMatrixWorld(true);
    for (const m of meshes(h.group)) {
      if (m.name === 'shallows' || (m.geometry.type === 'PlaneGeometry')) continue;              // the ground, the sea, the shallows: surfaces
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        if (!inBox(S.beach.clear, v.x, v.z) && !inBox(S.island.clear, v.x, v.z)) continue;
        expect(v.y, `${m.name || m.geometry.type} at ${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`).toBeLessThan(surface(v.x, v.z) + 0.05);
      }
    }
  });
});
