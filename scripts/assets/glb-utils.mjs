// Shared helpers of the asset import pipelines (vehicles: scripts/vehicles/prepare-vehicle-glb.mjs, furniture: scripts/furniture/import-furniture.mjs).
// Everything works on glTF documents (@gltf-transform/core), in metres, Y up, as the game does.
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** 4x4 column-major helpers (glTF order). */
export const mat = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; },
  scale: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  translate: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  /** Quarter-turn friendly rotation about Y (radians): +z forward → rotated forward. */
  rotY: a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  point(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  dir(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
  det3: m => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]),
};

/** World matrix of a node (glTF gives it as the product of the parents' local matrices). */
export const worldMatrix = node => node.getWorldMatrix();

/** Primitive geometry copy with a matrix applied: new POSITION / NORMAL accessors, everything else shared. */
export function bakePrimitive(doc, prim, m) {
  const out = doc.createPrimitive().setMode(prim.getMode()).setMaterial(prim.getMaterial());
  const idx = prim.getIndices(); if (idx) out.setIndices(idx);
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem);
    if (sem === 'POSITION' || sem === 'NORMAL') {
      const n = acc.getCount(), arr = new Float32Array(n * 3), v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        acc.getElement(i, v);
        const r = sem === 'POSITION' ? mat.point(m, v) : norm(mat.dir(m, v));
        arr.set(r, i * 3);
      }
      out.setAttribute(sem, doc.createAccessor().setType('VEC3').setArray(arr));
    } else out.setAttribute(sem, acc);
  }
  return out;
}
const norm = v => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Bounding box of primitives' POSITIONs. */
export function boundsOf(prims) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], v = [0, 0, 0];
  for (const p of prims) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); } } }
  return { min, max, size: max.map((x, k) => x - min[k]), centre: max.map((x, k) => (x + min[k]) / 2) };
}

export const triCountOf = prims => prims.reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

/** Every mesh primitive in the scene with its world matrix: [{ node, prim, world }]. */
export function scenePrimitives(doc) {
  const out = [];
  const walk = n => { const mesh = n.getMesh(); if (mesh) for (const prim of mesh.listPrimitives()) out.push({ node: n, prim, world: worldMatrix(n) }); n.listChildren().forEach(walk); };
  doc.getRoot().listScenes()[0].listChildren().forEach(walk);
  return out;
}

/** Highest surface of triangles above (x, z), or -Infinity: the roof over a seat, the top of a table. Brute force: models are small. */
export function topAt(prims, x, z) {
  let best = -Infinity; const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const p of prims) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), n = (idx?.getCount() ?? pos.getCount()) / 3;
    for (let t = 0; t < n; t++) {
      const i0 = idx ? idx.getScalar(t * 3) : t * 3, i1 = idx ? idx.getScalar(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getScalar(t * 3 + 2) : t * 3 + 2;
      pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      best = Math.max(best, l1 * a[1] + l2 * b[1] + l3 * c[1]);
    }
  }
  return best;
}

/** Surfaces crossed going straight up from (x, y, z): even = in a hollow (an open cabin, the air above a table), odd = inside a solid. */
export function crossingsAbove(prims, x, y, z) {
  let n = 0; const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const p of prims) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), count = (idx?.getCount() ?? pos.getCount()) / 3;
    for (let t = 0; t < count; t++) {
      const i0 = idx ? idx.getScalar(t * 3) : t * 3, i1 = idx ? idx.getScalar(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getScalar(t * 3 + 2) : t * 3 + 2;
      pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      if (l1 * a[1] + l2 * b[1] + l3 * c[1] > y) n++;
    }
  }
  return n;
}

/** Drops the vertices no triangle uses and renumbers (after culling or simplifying): new accessors for the indices and every attribute. */
export function compactPrimitive(doc, prim) {
  const idx = prim.getIndices(); if (!idx) return;
  const old = idx.getArray(), remap = new Map(), order = [];
  const next = new Uint32Array(old.length);
  for (let i = 0; i < old.length; i++) { let n = remap.get(old[i]); if (n === undefined) { n = order.length; remap.set(old[i], n); order.push(old[i]); } next[i] = n; }
  for (const sem of prim.listSemantics()) {
    const a = prim.getAttribute(sem), size = a.getElementSize(), src = a.getArray(), arr = new src.constructor(order.length * size);
    for (let k = 0; k < order.length; k++) for (let c = 0; c < size; c++) arr[k * size + c] = src[order[k] * size + c];
    a.setArray(arr);
  }
  idx.setArray(order.length < 65536 ? new Uint16Array(next) : next);
}

export const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
export { Document };
