import * as THREE from 'three';
import { Batch } from '../../src/world/batch';
import type { CompoundKit, VillaCompound } from '../../src/world/villaCompound';

/**
 * LD2.0-D round 2 (the Almadies villa kit): a digest of EVERYTHING the villa's street compound draws on its own lot — every primitive of each of the hub's
 * batches it draws into (positions to 0.1 mm, colours), its own meshes (the gate, the main entrance and its door, the façade's meshes; the helicopter's
 * place but not its shape, which lane R2-H rebuilds), its colliders, canopies, ground kept open and pools of light. The complement of
 * tests/helpers/lotDigest.ts (everything OFF the lot): together they prove the kit builds the villa exactly as it was (tests/villaKit.test.ts).
 */
export interface CompoundDigest { batches: Record<string, { n: number; hash: string }>; meshes: string[]; colliders: string[]; canopies: string[]; keepClear: string[]; pools: { n: number; hash: string }; heli: string }
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
const r4 = (v: number) => (Math.round(v * 1e4) / 1e4).toFixed(4);
const r2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
export function geometryKey(g: THREE.BufferGeometry, m?: THREE.Matrix4) {
  const p = g.attributes.position as THREE.BufferAttribute, c = g.attributes.color as THREE.BufferAttribute | undefined, v = new THREE.Vector3(), out: string[] = [];
  const idx = g.index ? Array.from(g.index.array) : null;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (m) v.applyMatrix4(m); out.push(`${r4(v.x)},${r4(v.y)},${r4(v.z)}${c ? `|${r2(c.getX(i))},${r2(c.getY(i))},${r2(c.getZ(i))}` : ''}`); }
  return `${p.count}:${idx ? fnv(idx.join(',')) : '-'}:${fnv(out.join(';'))}`;
}
/** Builds the compound with fresh batches (`lite` or not) through `build`, and digests it. */
export function digestCompound(build: (kit: CompoundKit) => VillaCompound, lite: boolean): CompoundDigest {
  const names = ['plain', 'pave', 'leaves', 'trunks', 'water', 'bulbs'] as const;
  const b = Object.fromEntries(names.map(n => [n, new Batch()])) as Record<(typeof names)[number], Batch>;
  const pools: string[] = [];
  const v = build({ lite, ...b, metalMat: new THREE.MeshLambertMaterial({ vertexColors: true }), pool: (x, z, r, y = 0.16) => { pools.push([x, z, r, y].map(r4).join(',')); } });
  const batches: CompoundDigest['batches'] = {};
  for (const n of names) {
    const geos = (b[n] as unknown as { geos: THREE.BufferGeometry[] }).geos;
    batches[n] = { n: geos.length, hash: fnv(geos.map(g => geometryKey(g)).join('/')) };
  }
  const meshes: string[] = [];
  let heli = '';
  v.group.updateMatrixWorld(true);
  v.group.traverse(o => {
    if (o.name === 'helicopter') heli = [o.position.x, o.position.y, o.position.z, o.rotation.y].map(r4).join(',');
    let up: THREE.Object3D | null = o; while (up && up.name !== 'helicopter') up = up.parent;
    const m = o as THREE.Mesh; if (!m.isMesh || up) return;
    meshes.push(`${m.name}@${[m.position.x, m.position.y, m.position.z, m.rotation.y].map(r4).join(',')}#${geometryKey(m.geometry, m.matrixWorld)}`);
  });
  const rect = (c: { x0: number; z0: number; x1: number; z1: number }) => [c.x0, c.z0, c.x1, c.z1].map(r4).join(',');
  return {
    batches, meshes,
    colliders: v.colliders.map(c => `${rect(c)},${r4(c.h)}`),
    canopies: v.canopies.map(c => [c.x, c.z, c.r, c.y0, c.y1].map(r4).join(',')),
    keepClear: v.keepClear.map(k => `${k.why}:${rect(k)}`),
    pools: { n: pools.length, hash: fnv(pools.join(';')) },
    heli,
  };
}
