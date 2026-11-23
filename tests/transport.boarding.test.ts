import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVehicle, kitBuildStats, vehicleCacheSize, vehicleMaterials } from '../src/actors/vehicleKit';
import { carRapideSpec } from '../src/transport/carRapide';
import { passengerPatterns } from '../src/transport/passengers';
import { Vehicle } from '../src/transport/vehicle';

/**
 * Boarding and getting off at a stop (docs/TRANSPORT.md, « People getting on and off »): the car rapide's open cabin draws
 * the people holding seats, so the vehicle takes another model each time the passengers change. That must cost a few
 * copies of cached vertices, never a build of the whole model, and never a material or a shader program of its own: on a
 * gala evening the fans aboard (their écurie's shirts) are one more variant of every passenger set, and the first
 * variants of a session used to be 8 to 40 ms hitches in the middle of the street (tests/perf.transport.test.ts).
 */
const spec = carRapideSpec();
const FANS = [0x1a7a44, 0xc8322a, 0x1a7a44, -1, 0xc8322a, 0x1a7a44, -1];

const bodyOf = (o: THREE.Object3D) => (o.getObjectByName('body') as THREE.Mesh).geometry;
const glassOf = (o: THREE.Object3D) => (o.getObjectByName('glass') as THREE.Mesh | undefined)?.geometry;
/** Every triangle of a non-indexed kit geometry as text (position, normal, colour, uv, animation tag), sorted: the same triangles in any order. */
function triangles(g: THREE.BufferGeometry): string[] {
  const out: string[] = [], n = g.attributes.position.count / 3;
  for (let t = 0; t < n; t++) {
    let s = '';
    for (const name of ['position', 'normal', 'color', 'uv', 'wheel']) {
      const a = g.attributes[name]; if (!a) continue;
      for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) s += (a.array[(t * 3 + v) * a.itemSize + c]).toFixed(5) + ',';
    }
    out.push(s);
  }
  return out.sort();
}

describe('a car rapide variant joined from its cabin and its passengers', () => {
  it('has the very triangles, bounds and spec of the same variant built in one pass', () => {
    const sets = passengerPatterns(spec.seats, 4, 11, 2, 0.8);
    let compared = 0;
    for (const seed of [1, 4, 7]) for (const seated of sets) for (const colours of [undefined, FANS]) for (const driver of [true, false]) {
      const o = { seed, seated, driver, colours, lod: 'near' } as const;
      const joined = buildVehicle('carRapide', o), whole = buildVehicle('carRapide', { ...o, bake: 'whole' });
      expect(joined.spec.occupied).toEqual(whole.spec.occupied);
      expect(joined.spec.budget).toEqual(whole.spec.budget);
      expect(triangles(bodyOf(joined.group))).toEqual(triangles(bodyOf(whole.group)));
      expect(glassOf(joined.group) ? triangles(glassOf(joined.group)!) : null).toEqual(glassOf(whole.group) ? triangles(glassOf(whole.group)!) : null);
      const a = bodyOf(joined.group), b = bodyOf(whole.group);
      expect(a.boundingSphere!.radius).toBeCloseTo(b.boundingSphere!.radius, 4);
      expect(a.boundingSphere!.center.distanceTo(b.boundingSphere!.center)).toBeLessThan(1e-4);
      expect(a.boundingBox!.min.distanceTo(b.boundingBox!.min)).toBeLessThan(1e-4);
      expect(a.boundingBox!.max.distanceTo(b.boundingBox!.max)).toBeLessThan(1e-4);
      compared++;
    }
    expect(compared).toBe(3 * 4 * 2 * 2);
  });

  it('seats the fans in the shirts they are given, the others in their own looks', () => {
    const seated = ['b00', 'b01', 'b10'];
    const plain = bodyOf(buildVehicle('carRapide', { seed: 2, seated, driver: false, lod: 'near' }).group);
    const fans = bodyOf(buildVehicle('carRapide', { seed: 2, seated, driver: false, colours: [0x1a7a44, 0xc8322a], lod: 'near' }).group);
    const hexes = (g: THREE.BufferGeometry) => { const c = g.attributes.color, s = new Set<string>(); for (let i = 0; i < c.count; i++) s.add(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHexString()); return s; };
    const hf = hexes(fans), hp = hexes(plain);
    expect(plain.attributes.position.count).toBe(fans.attributes.position.count);
    expect(hf.has('1a7a44') && hf.has('c8322a')).toBe(true);                     // Baobab green and Teranga red, in turn
    expect(hp.has('1a7a44') || hp.has('c8322a')).toBe(false);                    // not on the ordinary passengers
    expect(plain).not.toBe(fans);
  });
});

describe('the cabin is built once; boarding and getting off only join cached pieces', () => {
  it('builds the cabin and the far model once per livery, whoever is aboard and in whatever shirts', () => {
    const seed = 5;                                                                 // (a livery of its own in this file: nothing else warmed it)
    const sets = passengerPatterns(spec.seats, 10, 3, 2, 0.7);
    expect(new Set(sets.map(s => s.join('.'))).size).toBeGreaterThan(6);
    buildVehicle('carRapide', { seed, seated: sets[0], lod: 'auto' });
    const first = kitBuildStats();
    for (const seated of sets) buildVehicle('carRapide', { seed, seated, lod: 'auto' });
    const plain = kitBuildStats();
    expect(plain.passes).toBe(first.passes);                                        // no more builder pass over a whole model, near or far
    expect(plain.pieces).toBe(first.pieces);                                        // everyone's own look came with the cabin: nobody new to build
    expect(plain.joins).toBeGreaterThanOrEqual(first.joins + 6);                    // each set was one more variant, joined
    for (const seated of sets) for (const colours of [FANS, [-1]]) buildVehicle('carRapide', { seed, seated, colours, lod: 'auto' });
    const fans = kitBuildStats();
    expect(fans.passes).toBe(first.passes);
    expect(fans.pieces - plain.pieces).toBeLessThanOrEqual(14 * 2);                // only shirts are new: 14 seats (13 and the driver) in the fans' two colours
    expect(fans.joins - plain.joins).toBeGreaterThanOrEqual(12);
  });

  it('reuses the very geometry of a variant it has seen (boarding, getting off, boarding again)', () => {
    const seed = 6, a = ['b00', 'b11', 'b21', 'cab1'], b = ['b01', 'b12', 'b30', 'b32', 'cab2'];
    const body = (seated: string[], colours?: number[]) => bodyOf(buildVehicle('carRapide', { seed, seated, colours, lod: 'near' }).group);
    const A = body(a), B = body(b), AF = body(a, FANS);
    expect(B).not.toBe(A);
    expect(AF).not.toBe(A);
    const before = kitBuildStats(), size = vehicleCacheSize();
    expect(body(a)).toBe(A);
    expect(body(b)).toBe(B);
    expect(body(a, FANS)).toBe(AF);
    expect(kitBuildStats()).toEqual(before);
    expect(vehicleCacheSize()).toBe(size);
  });

  it('shares the glass of the cabin and the far model between variants', () => {
    const seed = 6;
    const near = (seated: string[]) => buildVehicle('carRapide', { seed, seated, lod: 'auto' });
    const x = near(['b00']), y = near(['b10', 'b11', 'cab1']);
    expect(glassOf(x.group)).toBe(glassOf(y.group));
    expect((x.group.getObjectByName('far') as THREE.Mesh).geometry).toBe((y.group.getObjectByName('far') as THREE.Mesh).geometry);
    expect(bodyOf(x.group)).not.toBe(bodyOf(y.group));
  });

  it('rebuilds nothing when only the shirts change and nobody wears one of their own (a car rapide without fans, again)', () => {
    const seed = 6, seated = ['b00', 'b10', 'b20'];
    buildVehicle('carRapide', { seed, seated, lod: 'near' });
    const before = kitBuildStats();
    buildVehicle('carRapide', { seed, seated, colours: [-1, -1], lod: 'near' });  // every shirt is "keep the passenger's own": the same passengers
    const after = kitBuildStats();
    expect(after.passes).toBe(before.passes);
    expect(after.pieces).toBe(before.pieces);
  });
});

describe('a vehicle changing its passengers', () => {
  const shared = new Set<THREE.Material>(Object.values(vehicleMaterials()));
  const materials = (root: THREE.Object3D) => { const out = new Set<THREE.Material>(); root.traverse(c => { if ((c as THREE.Mesh).isMesh) out.add((c as THREE.Mesh).material as THREE.Material); }); return out; };
  const model = (v: Vehicle) => v.body.children[0];

  it('draws every passenger set and every shirt with the fleet\'s three shared materials', () => {
    const v = new Vehicle(spec, 'test:materials', 1, 9);
    const sets = passengerPatterns(spec.seats, 6, 17, 2, 0.8);
    for (const colours of [undefined, FANS, undefined]) for (const seated of sets) {
      v.setPassengers(seated, colours);
      for (const m of materials(model(v))) expect(shared.has(m)).toBe(true);
    }
    v.dispose();
  });

  it('keeps one animated copy of the body material at most, however often people get on and off', () => {
    const v = new Vehicle(spec, 'test:copies', 1, 9);
    const sets = passengerPatterns(spec.seats, 6, 29, 2, 0.8);
    let disposed = 0;
    for (const seated of sets) {
      v.setPassengers(seated, FANS);
      v.animate(4, 0, 0.05);
      const own = [...materials(model(v))].filter(m => !shared.has(m));
      expect(own).toHaveLength(1);                                                // the wheels' own uniforms, nothing per passenger
      own[0].addEventListener('dispose', () => { disposed++; });
    }
    expect(disposed).toBe(sets.length - 1);                                       // each swap lets the previous copy go
    v.dispose();
  });

  it('adds one geometry per new passenger set and none for a set it has seen', () => {
    const v = new Vehicle(spec, 'test:cache', 1, 12);
    const sets = passengerPatterns(spec.seats, 5, 41, 2, 0.8);
    expect(new Set(sets.map(s => s.join('.'))).size).toBe(sets.length);
    v.setPassengers(sets[0]);
    const size = vehicleCacheSize(), stats = kitBuildStats();
    for (const seated of sets.slice(1)) v.setPassengers(seated);
    expect(vehicleCacheSize()).toBe(size + sets.length - 1);                      // the joined body, nothing else
    for (const seated of sets) v.setPassengers(seated);                           // everyone gets off and on again
    expect(vehicleCacheSize()).toBe(size + sets.length - 1);
    for (const seated of sets) v.setPassengers(seated, FANS);                     // fans aboard: one more variant of each set
    expect(vehicleCacheSize()).toBe(size + 2 * sets.length - 1);
    for (const seated of sets) { v.setPassengers(seated, FANS); v.setPassengers(seated); }
    expect(vehicleCacheSize()).toBe(size + 2 * sets.length - 1);
    expect(kitBuildStats().passes).toBe(stats.passes);                            // and not one builder pass over a whole model
    v.dispose();
  });
});
