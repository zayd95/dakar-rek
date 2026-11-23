// Gives a Meshy body (the fused shell: skin, clothes and hair in one surface, one base-colour texture) what the character studio needs to change a hairstyle:
//   * `_HAIR` vertex attribute: 1 on the vertices of the baked hair, 0 elsewhere (the runtime shades these as scalp, or as close-combed hair, once the hair is taken in);
//   * a glTF morph target named "shave": the baked hair pulled onto the body's own skull (src/actors/headFit.json; an ellipsoid for the cap, a column inside the neck for
//     what hangs behind), so the head reads as shaved or combed back and a procedural style (afro, puff, headwrap, kufi) can sit on it.
// Hair = a black texel on the head, the nape or (femme) beside the face, plus the strands hanging in front of the face, plus their neighbours; never the brows, the eyes,
// the beard (nor its back edge along the jaw) or cloth (an olive collar, a navy tee: the colour tells).
// In place, repeatable (an existing `_HAIR` and 'shave' are replaced), no Meshy credit. Usage: node scripts/avatar/add-hair.mjs <body.glb> [...more.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import fs from 'node:fs';

const FIT = JSON.parse(fs.readFileSync(new URL('../../src/actors/headFit.json', import.meta.url), 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file), root = doc.getRoot();
  const mesh = root.listMeshes()[0], prim = mesh.listPrimitives()[0];
  const female = /body_f/.test(file), F = FIT[female ? 'femme' : 'homme'], { c, r } = F.skull;
  // a previous run's attribute and target go (the positions themselves were never changed)
  let names = [...(mesh.getExtras()?.targetNames ?? [])];
  const old = names.indexOf('shave');
  if (old >= 0) { prim.removeTarget(prim.listTargets()[old]); names.splice(old, 1); }
  prim.setAttribute('_HAIR', null);
  const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0');
  const tex = root.listTextures()[0], { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (u, v) => { const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height))), i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const n = pos.getCount(), hair = new Float32Array(n), dP = new Float32Array(n * 3), dN = new Float32Array(n * 3);
  const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), dark = new Uint8Array(n), cloth = new Uint8Array(n), elig = new Uint8Array(n), cap = new Uint8Array(n);
  const v = [0, 0, 0], nn = [0, 0, 0], u = [0, 0];
  // the face's front, height by height (the skin that is not black): a black texel well in front of it is a strand hanging over the face
  const front = new Map();
  for (let i = 0; i < n; i++) {
    pos.getElement(i, v); nrm.getElement(i, nn); uv.getElement(i, u); P.set(v, i * 3); Nn.set(nn, i * 3);
    const [pr, pg, pb] = px(u[0], u[1]), mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
    // below the neck line, a mid-dark blue (the homme's tee) or olive (the femme's collar) is cloth, never hair (above it, gold beads and highlights in the locks are hair)
    cloth[i] = v[1] < F.neckTop && mx > 40 && mx < 130 && (pb > pr + 10 || (pg >= pr - 2 && pb < pg - 10)) ? 1 : 0;
    if (!female && v[1] < F.neckTop - 0.06 && pb > pr + 4) cloth[i] = 1;                       // (the homme's tee: even its near-black navy collar edge at the nape)
    dark[i] = mx < 80 && mx - mn < 45 && !cloth[i] ? 1 : 0;
    if (!dark[i] && Math.abs(v[0]) < 0.06 && v[1] > 1.55) { const k = Math.round(v[1] * 100); front.set(k, Math.max(front.get(k) ?? -1, v[2])); }
  }
  const faceFront = y => Math.max(front.get(Math.round(y * 100)) ?? -1, front.get(Math.round(y * 100) - 1) ?? -1, front.get(Math.round(y * 100) + 1) ?? -1);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (Math.abs(x) > 0.3 || z < -0.35 || z > 0.25 || y < 1.5) continue;                     // the head and what hangs from it
    const face = z > F.faceZ && y < F.browY && Math.abs(x) < F.earX + 0.008;                   // brows, eyes, nose, mouth, beard (not a strand beside the face)
    // a strand in front of the face (the homme has none: his beard, below the eyes, is never one)
    const overFace = face && dark[i] && z > faceFront(y) + 0.012 && Math.abs(x) < 0.1 && (female || y > F.eyeY + 0.02);
    cap[i] = y > F.capY && (!face || overFace) ? 1 : 0;
    // what hangs below the cap: the nape (well behind the jaw: the beard's back edge is no nape), the femme's locks beside the face, a strand in front of it
    const low = y <= F.capY && ((y > 1.58 && z < (female ? -0.035 : -0.045) && Math.abs(x) < 0.12) || (female && y > 1.55 && Math.abs(x) > 0.075 && !face) || overFace);
    elig[i] = cap[i] || low ? 1 : 0;
  }
  const idx = prim.getIndices().getArray(), flag = new Uint8Array(n);
  for (let i = 0; i < n; i++) flag[i] = elig[i] && dark[i] ? 1 : 0;
  for (let round = 0; round < 3; round++) {                                                  // a strand's vertex whose texel is not quite black rides with its neighbours
    const add = [];
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c3 = idx[t + 2]; if (flag[a] || flag[b] || flag[c3]) for (const k of [a, b, c3]) if (!flag[k] && elig[k] && !cloth[k]) add.push(k); }
    for (const k of add) flag[k] = 1;
  }
  // the homme: a vertex of his cap left out (a texel not quite dark, beyond the dilation) but mostly surrounded by hair is hair too, so no speck stays up while the
  // cap around it is taken in; the cap's border, mostly next to the face's skin, is not touched by this
  if (!female) for (let round = 0; round < 4; round++) {
    const cnt = new Uint16Array(n), fl = new Uint16Array(n);
    for (let t = 0; t < idx.length; t += 3) for (const [a, b2] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { cnt[a]++; cnt[b2]++; if (flag[b2]) fl[a]++; if (flag[a]) fl[b2]++; }
    let added = 0; for (let i = 0; i < n; i++) if (!flag[i] && elig[i] && cnt[i] && fl[i] / cnt[i] >= 0.5) { flag[i] = 1; added++; }
    if (!added) break;
  }
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (!flag[i]) continue;
    hair[i] = 1; const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let t;
    if (y > F.neckTop - 0.01) {                                                              // onto the skull: radially, never outwards
      const dx = x - c[0], dy = y - c[1], dz = z - c[2], q = Math.hypot(dx / r[0], dy / r[1], dz / r[2]);
      const k = q > 1 ? 1 / q : 1; t = [c[0] + dx * k, c[1] + dy * k, c[2] + dz * k];
      const ex = dx * k / (r[0] * r[0]), ey = dy * k / (r[1] * r[1]), ez = dz * k / (r[2] * r[2]), el = Math.hypot(ex, ey, ez) || 1;
      if (q > 1) { dN[i * 3] = ex / el - Nn[i * 3]; dN[i * 3 + 1] = ey / el - Nn[i * 3 + 1]; dN[i * 3 + 2] = ez / el - Nn[i * 3 + 2]; }
    } else {                                                                                 // into the neck: a column inside it
      // (the homme's short hair lies flat on his neck: it stays where it is, the shader shows it as skin; moving it stretched long triangles down to the collar)
      const dx = x - c[0], dz = z - c[2], rad = Math.hypot(dx, dz) || 1, k = female ? Math.min(1, F.neck / rad) : 1;
      t = [c[0] + dx * k, y, c[2] + dz * k];
    }
    dP[i * 3] = t[0] - x; dP[i * 3 + 1] = t[1] - y; dP[i * 3 + 2] = t[2] - z;
    if (Math.hypot(dP[i * 3], dP[i * 3 + 1], dP[i * 3 + 2]) > 1e-5) moved++;
  }
  // the homme: the shaved cap meets his forehead and temples at their own level (no ledge where the skin stood proud of the fitted skull): next to the face's skin the
  // target surface is that skin's height above the skull, easing to the skull itself three rings in (the femme's volume of locks goes all the way, as before)
  if (!female) {
    const qOf = i => Math.hypot((P[i * 3] - c[0]) / r[0], (P[i * 3 + 1] - c[1]) / r[1], (P[i * 3 + 2] - c[2]) / r[2]);
    const ring = new Int32Array(n).fill(-1), qb = new Float32Array(n), q = [], nb = Array.from({ length: n }, () => []);
    for (let t = 0; t < idx.length; t += 3) for (const [a, b2] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { nb[a].push(b2); nb[b2].push(a); }
    for (let i = 0; i < n; i++) if (flag[i] && P[i * 3 + 1] > F.neckTop - 0.01) { const sk = nb[i].filter(j => !flag[j]); if (sk.length) { ring[i] = 0; qb[i] = sk.reduce((s2, j) => s2 + qOf(j), 0) / sk.length; q.push(i); } }
    for (let h = 0; h < q.length; h++) for (const j of nb[q[h]]) if (flag[j] && ring[j] < 0) { ring[j] = ring[q[h]] + 1; qb[j] = qb[q[h]]; q.push(j); }
    for (let i = 0; i < n; i++) {
      if (!flag[i] || ring[i] < 0 || P[i * 3 + 1] <= F.neckTop - 0.01) continue;
      const qi = qOf(i), w = Math.min(1, ring[i] / 3), qt = Math.max(1, qb[i]) + (1 - Math.max(1, qb[i])) * w;
      const k = qi > qt ? qt / qi : 1;
      for (let a = 0; a < 3; a++) dP[i * 3 + a] = (c[a] + (P[i * 3 + a] - c[a]) * k) - P[i * 3 + a];
      for (let a = 0; a < 3; a++) dN[i * 3 + a] *= w;
    }
  }
  // the homme: a vertex split along a UV seam is one point of the surface: its copies (each reading its own texel) are hair together and move together, so the
  // taken-in cap never opens a crack along a seam (a dark speck)
  if (!female) {
    const groups = new Map();
    for (let i = 0; i < n; i++) { const key = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`; (groups.get(key) ?? groups.set(key, []).get(key)).push(i); }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const mv = g.filter(i => flag[i]); if (!mv.length) continue;
      // (the copies' own normals can differ: they share the shaved normal they end with, not the change that leads to it, or the seam shows as a crease)
      const avg = [0, 0, 0], an = [0, 0, 0];
      for (const i of mv) for (let a = 0; a < 3; a++) { avg[a] += dP[i * 3 + a] / mv.length; an[a] += (Nn[i * 3 + a] + dN[i * 3 + a]) / mv.length; }
      const al = Math.hypot(...an) || 1;
      for (const i of g) { flag[i] = 1; hair[i] = 1; for (let a = 0; a < 3; a++) { dP[i * 3 + a] = avg[a]; dN[i * 3 + a] = an[a] / al - Nn[i * 3 + a]; } }
    }
  }
  const buf = pos.getBuffer();
  prim.setAttribute('_HAIR', doc.createAccessor('hair').setType('SCALAR').setArray(hair).setBuffer(buf));
  prim.addTarget(doc.createPrimitiveTarget('shave')
    .setAttribute('POSITION', doc.createAccessor('shave_pos').setType('VEC3').setArray(dP).setBuffer(buf).setSparse(true))
    .setAttribute('NORMAL', doc.createAccessor('shave_nrm').setType('VEC3').setArray(dN).setBuffer(buf).setSparse(true)));
  names.push('shave');
  mesh.setWeights(names.map(() => 0)).setExtras({ ...(mesh.getExtras() ?? {}), targetNames: names });
  await doc.transform(async d => { for (const a of d.getRoot().listAccessors()) if (a.listParents().every(p => p.propertyType === 'Root')) a.dispose(); });
  await io.write(file, doc);
  console.log(JSON.stringify({ file, vertices: n, hair: hair.reduce((a, b) => a + b, 0), moved, targets: names }));
}
