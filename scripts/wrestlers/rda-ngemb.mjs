// The ngemb for a Roi des Arènes body: a garment cut from the body's own lower surface, the way RDA's viewer made its neutral study
// shorts (experiments/roi-des-arenes/src/main.ts `shorts`, lab/roi-des-arenes-threejs @ 809a9817): the triangles the hips and thighs
// carry are clipped between two heights of the MORPHED body, offset outwards along the normals, and keep every attribute interpolated at
// the cut (positions, normals, skin weights, both physique morphs), so the cloth follows the rig and either build. Added here: texture
// coordinates for Dakar Rek's ngemb canvas (src/lamb/look.ts `ngembTexture`, repeated twice round): u round the body (seam at the back),
// v from the waist (0) to the hem (1), so « Bordure » shows its bands at the top and the hem as on the v4 ngemb. Generic shape, no claim
// of authenticity (status unverified). Offline only (scripts/wrestlers/build-rda-wrestlers.mjs).
import * as THREE from 'three';

const LOWER = new Set(['Hips', 'LHipJoint', 'RHipJoint', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LowerBack']);   // (RDA's shorts: without the shins; the long cut reaches the knee)

/** `top`/`bottom`: heights (the body's own space) on the body as morphed by its influences; `offset`: metres off the skin. */
export function ngemb(body, top, bottom, offset = 0.015) {
  const source = body.geometry, position = source.getAttribute('position'), normals = source.getAttribute('normal'), indices = source.index;
  const joints = source.getAttribute('skinIndex'), weights = source.getAttribute('skinWeight');
  const targets = source.morphAttributes.position, normalTargets = source.morphAttributes.normal;
  const coverage = v => [0, 1, 2, 3].reduce((s, c) => s + (LOWER.has(body.skeleton.bones[joints.getComponent(v, c)].name) ? weights.getComponent(v, c) : 0), 0);
  const read = i => {
    const skin = new Map();
    for (let c = 0; c < 4; c++) { const j = joints.getComponent(i, c); skin.set(j, (skin.get(j) || 0) + weights.getComponent(i, c)); }
    return { p: new THREE.Vector3().fromBufferAttribute(position, i), n: new THREE.Vector3().fromBufferAttribute(normals, i),
      dp: targets.map(a => new THREE.Vector3().fromBufferAttribute(a, i)), dn: normalTargets.map(a => new THREE.Vector3().fromBufferAttribute(a, i)), skin };
  };
  const height = v => v.p.y + v.dp.reduce((s, d, i) => s + d.y * body.morphTargetInfluences[i], 0);
  const lerp = (a, b, t) => {
    const skin = new Map(); a.skin.forEach((w, j) => skin.set(j, w * (1 - t))); b.skin.forEach((w, j) => skin.set(j, (skin.get(j) || 0) + w * t));
    return { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t), dp: a.dp.map((d, i) => d.clone().lerp(b.dp[i], t)), dn: a.dn.map((d, i) => d.clone().lerp(b.dn[i], t)), skin };
  };
  const clip = (poly, boundary, above) => {
    const out = [];
    poly.forEach((b, i) => {
      const a = poly[(i + poly.length - 1) % poly.length], ah = height(a), bh = height(b);
      const ai = above ? ah >= boundary : ah <= boundary, bi = above ? bh >= boundary : bh <= boundary;
      if (ai !== bi) out.push(lerp(a, b, (boundary - ah) / (bh - ah)));
      if (bi) out.push(b);
    });
    return out;
  };
  const P = [], N = [], UV = [], SI = [], SW = [], MP = targets.map(() => []), MN = targets.map(() => []);
  const emit = (v, u) => {
    const n = v.n.clone().normalize();
    P.push(...v.p.clone().addScaledVector(n, offset).toArray()); N.push(...n.toArray());
    v.dp.forEach((d, i) => { const dn = v.n.clone().add(v.dn[i]).normalize().sub(n); MP[i].push(...d.clone().addScaledVector(dn, offset).toArray()); MN[i].push(...dn.toArray()); });
    UV.push(u, THREE.MathUtils.clamp((top - height(v)) / (top - bottom), 0, 1));
    const skin = [...v.skin].sort((a, b) => b[1] - a[1]).slice(0, 4), total = skin.reduce((s, [, w]) => s + w, 0);
    for (let k = 0; k < 4; k++) { SI.push(skin[k]?.[0] || 0); SW.push((skin[k]?.[1] || 0) / total); }
  };
  for (let i = 0; i < indices.count; i += 3) {
    const tri = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    if (!tri.every(v => coverage(v) > 0.7)) continue;
    const poly = clip(clip(tri.map(read), bottom, true), top, false);
    for (let j = 1; j + 1 < poly.length; j++) {
      const t = [poly[0], poly[j], poly[j + 1]], us = t.map(v => 0.5 + Math.atan2(v.p.x, v.p.z) / (2 * Math.PI));
      if (Math.max(...us) - Math.min(...us) > 0.5) for (let k = 0; k < 3; k++) if (us[k] < 0.5) us[k] += 1;   // across the seam at the back
      t.forEach((v, k) => emit(v, us[k]));
    }
  }
  return { position: P, normal: N, uv: UV, skinIndex: SI, skinWeight: SW, morphPosition: MP, morphNormal: MN };
}
