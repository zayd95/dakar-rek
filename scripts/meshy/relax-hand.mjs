// A relaxed hand for a Meshy body, baked into the mesh (the game's skeleton has one bone per hand and no fingers, so the pose cannot be animated:
// it is made once, in the rest pose, and every clip then carries it).
//
// Meshy's hands come open and flat, fingers fanned, thumb out, palm turned whichever way the generated rest pose had it. This module
//   1. finds the hand's own frame from its vertices: Y along the fingers, N out of the palm (the thinnest direction, signed by the thumb's side:
//      a left hand has its thumb on the N × Y side), X across;
//   2. closes the fan: fingers are turned about a pivot in the palm, each by a fraction of its splay angle;
//   3. curls them: a smooth bend about the knuckle line towards the palm, a little more for the little finger than for the index;
//   4. brings the thumb in towards the index finger and a little towards the palm.
// Everything is a smooth function of the vertex position (palm and wrist untouched), so seams and the wrist blend are not disturbed.
// All lengths are metres of the scaled body, measured from the wrist.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DEFAULTS = {
  knuckle: 0.5,      // the knuckle line, as a fraction of the hand's length from the wrist
  fan: 0.35,         // the fingers' splay angle is multiplied by this (1 = as generated, 0 = parallel)
  curl: 65,          // degrees of bend at the fingertips (index; the little finger takes `curlSpread` more)
  curlSpread: 0.3,   // the little finger bends (1 + this) times, the index (1 - this) times, the curl
  curlShape: 1.25,   // the bend grows as (distance along the finger)^shape: > 1 bends the tips more than the knuckles
  thumbIn: 22,       // degrees the thumb is turned towards the fingers
  thumbFlex: 15,     // degrees the thumb is bent towards the palm
};
export const handDefaults = DEFAULTS;

/** Fits the frame and returns { Y, N, X, L, thumbSign, relax(a, b, c) -> [a, b, c] }. pts: hand vertices relative to the wrist (THREE.Vector3[]). side: +1 left, -1 right. */
export function fitHand(pts, side, o = {}) {
  const p = { ...DEFAULTS, ...o };
  // finger axis: from the wrist to the centre of the points past 60 % of the reach, twice (the thumb pulls a plain centroid sideways)
  let Y = pts.reduce((a, q) => a.add(q), new THREE.Vector3()).normalize();
  for (let it = 0; it < 3; it++) {
    const reach = Math.max(...pts.map(q => q.dot(Y))), far = pts.filter(q => q.dot(Y) > 0.6 * reach);
    Y = far.reduce((a, q) => a.add(q), new THREE.Vector3()).normalize();
  }
  const L = Math.max(...pts.map(q => q.dot(Y)));
  // palm normal: the thinnest direction of the palm and fingers (past 30 % of the length), perpendicular to Y
  const body = pts.filter(q => q.dot(Y) > 0.3 * L), cen = body.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / body.length);
  const perp = q => q.clone().sub(Y.clone().multiplyScalar(q.dot(Y)));
  const cov = [0, 0, 0, 0, 0, 0];                                     // xx xy xz yy yz zz of the points perpendicular to Y
  for (const q of body) { const d = perp(q.clone().sub(cen)); cov[0] += d.x * d.x; cov[1] += d.x * d.y; cov[2] += d.x * d.z; cov[3] += d.y * d.y; cov[4] += d.y * d.z; cov[5] += d.z * d.z; }
  const mul = v => new THREE.Vector3(cov[0] * v.x + cov[1] * v.y + cov[2] * v.z, cov[1] * v.x + cov[3] * v.y + cov[4] * v.z, cov[2] * v.x + cov[4] * v.y + cov[5] * v.z);
  let wide = perp(new THREE.Vector3(0.31, 0.52, 0.79)).normalize();
  for (let i = 0; i < 100; i++) wide = perp(mul(wide)).normalize();     // the widest direction across the hand
  let N = new THREE.Vector3().crossVectors(wide, Y).normalize();         // so the thinnest is across both
  // the thumb: the point of the proximal half (15–65 %) furthest to the side
  const X0 = new THREE.Vector3().crossVectors(Y, N);
  const prox = pts.filter(q => { const b = q.dot(Y); return b > 0.15 * L && b < 0.65 * L; });
  let ext = 0, tSide = 1; for (const q of prox) { const a = q.dot(X0); if (Math.abs(a) > Math.abs(ext)) { ext = a; tSide = Math.sign(a); } }
  // a left hand has its thumb on the N × Y side = -X side; a right hand on the +X side
  const want = side > 0 ? -1 : 1;
  if (tSide !== want) N.negate();
  const X = new THREE.Vector3().crossVectors(Y, N);
  const thumbSign = want;                                               // the thumb is at a·thumbSign > 0
  // frame coordinates of everything
  const co = q => [q.dot(X), q.dot(Y), q.dot(N)];
  const fr = pts.map(co), bk = p.knuckle * L, Lf = L - bk;
  const dist = fr.filter(c => c[1] > bk + 0.25 * Lf), aMin = Math.min(...dist.map(c => c[0])), aMax = Math.max(...dist.map(c => c[0]));
  const ac = (aMin + aMax) / 2, halfW = (aMax - aMin) / 2, c0 = dist.reduce((s, c) => s + c[2], 0) / dist.length;
  const bp = bk - 0.15 * L, tPiv = [ac + thumbSign * halfW * 1.1, 0.22 * L];
  const curlRad = (p.curl * Math.PI) / 180, thIn = (p.thumbIn * Math.PI) / 180, thFlex = (p.thumbFlex * Math.PI) / 180;
  // the bent centreline of a finger: arc length s -> (along, towards the palm) and tangent angle; k scales the curl (little finger more than the index)
  const steps = 48;
  const cache = new Map();
  const finger = (k, s) => {
    const key = Math.round(k * 100); let t = cache.get(key);
    if (!t) { t = [{ s: 0, b: 0, c: 0, psi: 0 }]; for (let i = 1; i <= steps; i++) { const ss = (i / steps) * Lf, psi = k * curlRad * Math.pow(ss / Lf, p.curlShape), pr = t[i - 1], ds = Lf / steps, pm = (psi + pr.psi) / 2; t.push({ s: ss, psi, b: pr.b + Math.cos(pm) * ds, c: pr.c + Math.sin(pm) * ds }); } cache.set(key, t); }
    const f = Math.min(1, s / Lf) * steps, i = Math.min(steps - 1, Math.floor(f)), u = f - i, A = t[i], B = t[i + 1];
    const psi = A.psi + (B.psi - A.psi) * u, extra = Math.max(0, s - Lf);
    return { b: A.b + (B.b - A.b) * u + Math.cos(psi) * extra, c: A.c + (B.c - A.c) * u + Math.sin(psi) * extra, psi };
  };
  /** The relaxed position of a point given in frame coordinates (a across, b along the fingers, c out of the palm). */
  function relax(a, b, c) {
    const lat = (a - ac) * thumbSign;                                   // > 0 towards the thumb
    // zones: the fingers (past the knuckle line, between the thumb's side and the little finger's), the thumb (proximal, beyond the bundle on its side)
    const along = smooth(bk - 0.06 * L, bk + 0.04 * L, b);
    const thumbZone = smooth(halfW * 0.9, halfW * 1.5, lat) * (1 - smooth(0.62 * L, 0.8 * L, b)) * smooth(0.1 * L, 0.2 * L, b);
    const wf = along * (1 - thumbZone);
    // 4. the thumb: turned about its base towards the fingers and bent towards the palm
    if (thumbZone > 0) {
      const ra = a - tPiv[0], rb = b - tPiv[1], r = Math.hypot(ra, rb), th = Math.atan2(ra, rb);
      const th2 = th - thumbSign * thIn * thumbZone, a2 = tPiv[0] + r * Math.sin(th2), b2 = tPiv[1] + r * Math.cos(th2);
      const f = thFlex * thumbZone, bb = b2 - tPiv[1], c2 = c - c0 * 0;
      a = a2; b = tPiv[1] + bb * Math.cos(f) - c2 * Math.sin(f); c = bb * Math.sin(f) + c2 * Math.cos(f);
    }
    if (wf <= 0) return [a, b, c];
    // 2. the fan: each finger is turned about the pivot by a fraction of its splay angle
    const ra = a - ac, rb = b - bp, r = Math.hypot(ra, rb), th = Math.atan2(ra, rb), th2 = th * (1 - wf * (1 - p.fan));
    const a1 = ac + r * Math.sin(th2), b1 = bp + r * Math.cos(th2);
    // 3. the curl: about the knuckle line, towards the palm; the little finger (far from the thumb) bends more than the index
    const rank = Math.min(1, Math.max(0, 0.5 - ((a1 - ac) * thumbSign) / (2 * halfW))), k = 1 + p.curlSpread * (2 * rank - 1);
    const s = b1 - bk;
    if (s <= 0) return [a1, b1, c];
    const ce = finger(k, s), off = c - c0, nB = -Math.sin(ce.psi), nC = Math.cos(ce.psi);
    const bb = bk + ce.b + off * nB, cc = c0 + ce.c + off * nC;
    return [a1, b1 + (bb - b1) * wf, c + (cc - c) * wf];
  }
  return { Y, N, X, L, thumbSign, relax, params: p, debug: { ac, halfW, bk, c0 } };
}
