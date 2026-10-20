// Gives a Meshy body (the fused shell: skin, clothes and hair in one surface, one base-colour texture) the two things the character creator needs to change a hairstyle:
//   * `_HAIR` vertex attribute: 1 on the vertices of the baked hair (dark texture, on the head or nape), 0 elsewhere (the runtime tints these as scalp when the head is shaved);
//   * a glTF morph target named "shave": the baked hair pulled in onto the skull (a skull-sized ellipsoid for the cap, a neck-sized column for what hangs behind), so the head reads as shaved.
// In place, idempotent, no Meshy credit: it reads the final GLB. Usage: node scripts/avatar/add-hair.mjs <body.glb> [...more.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

/** The skull of the shared rig (both bodies' heads sit on it): centre, radii. The hair of the homme is a thin cap on it; the femme's locs stand far off it. */
export const SKULL = { c: [0, 1.795, -0.015], r: [0.088, 0.112, 0.104], neck: 0.048, neckTop: 1.745 };
const FACE_Z = 0.035, HAIR_Y = 1.775;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file), root = doc.getRoot();
  const mesh = root.listMeshes()[0], prim = mesh.listPrimitives()[0];
  if (prim.getAttribute('_HAIR')) { console.log(file, 'already done'); continue; }
  const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0');
  const tex = root.listTextures()[0], { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (u, v) => { const x = Math.min(info.width - 1, Math.max(0, Math.floor(u * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor(v * info.height))), i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const n = pos.getCount(), hair = new Float32Array(n), dP = new Float32Array(n * 3), dN = new Float32Array(n * 3);
  const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), dark = new Uint8Array(n), elig = new Uint8Array(n), cap = new Uint8Array(n);
  const female = /_f/.test(file), BROW_Y = female ? 1.77 : 1.845, v = [0, 0, 0], nn = [0, 0, 0], u = [0, 0], { c, r } = SKULL;
  for (let i = 0; i < n; i++) {
    pos.getElement(i, v); nrm.getElement(i, nn); uv.getElement(i, u);
    P.set(v, i * 3); Nn.set(nn, i * 3);
    const [pr, pg, pb] = px(u[0], u[1]), mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
    dark[i] = mx < 80 && mx - mn < 45 ? 1 : 0;                                              // hair is black in both textures (skin, clothes and the white of eyes and teeth are not)
    if (Math.abs(v[0]) > 0.3 || v[2] < -0.35 || v[2] > 0.25 || v[1] < 1.5) continue;         // the head and what hangs behind it
    cap[i] = v[1] > HAIR_Y && !(v[2] > FACE_Z && v[1] < BROW_Y) ? 1 : 0;                    // the cap: above the ears, not the brows and the eyes in front
    const low = v[1] <= HAIR_Y && ((v[1] > 1.58 && v[2] < -0.01) || (female && v[1] > 1.55 && Math.abs(v[0]) > 0.075));   // what hangs behind (locs, nape), and beside the face on the femme (no beard there)
    elig[i] = cap[i] || low ? 1 : 0;
  }
  const idx = prim.getIndices().getArray(), flag = new Uint8Array(n);
  for (let i = 0; i < n; i++) flag[i] = elig[i] && dark[i] ? 1 : 0;
  for (let round = 0; round < 3; round++) {                                                  // a strand's vertex whose texel is not quite black rides with its neighbours
    const add = [];
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c3 = idx[t + 2]; if (flag[a] || flag[b] || flag[c3]) for (const k of [a, b, c3]) if (!flag[k] && elig[k]) add.push(k); }
    for (const k of add) flag[k] = 1;
  }
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (!flag[i]) continue;
    hair[i] = 1; const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let t;
    if (cap[i] && y > SKULL.neckTop - 0.01) {                                                // onto the skull: radially, never outwards
      const dx = x - c[0], dy = y - c[1], dz = z - c[2], q = Math.hypot(dx / r[0], dy / r[1], dz / r[2]);
      const k = q > 1 ? 1 / q : 1; t = [c[0] + dx * k, c[1] + dy * k, c[2] + dz * k];
      const ex = dx * k / (r[0] * r[0]), ey = dy * k / (r[1] * r[1]), ez = dz * k / (r[2] * r[2]), el = Math.hypot(ex, ey, ez) || 1;
      if (q > 1) { dN[i * 3] = ex / el - Nn[i * 3]; dN[i * 3 + 1] = ey / el - Nn[i * 3 + 1]; dN[i * 3 + 2] = ez / el - Nn[i * 3 + 2]; }
    } else {                                                                                 // into the neck: a column inside it
      const dx = x - c[0], dz = z - c[2], rad = Math.hypot(dx, dz) || 1, k = Math.min(1, SKULL.neck / rad);
      t = [c[0] + dx * k, y, c[2] + dz * k];
    }
    dP[i * 3] = t[0] - x; dP[i * 3 + 1] = t[1] - y; dP[i * 3 + 2] = t[2] - z;
    if (Math.hypot(dP[i * 3], dP[i * 3 + 1], dP[i * 3 + 2]) > 1e-5) moved++;
  }
  const buf = pos.getBuffer();
  prim.setAttribute('_HAIR', doc.createAccessor('hair').setType('SCALAR').setArray(hair).setBuffer(buf));
  prim.addTarget(doc.createPrimitiveTarget('shave')
    .setAttribute('POSITION', doc.createAccessor('shave_pos').setType('VEC3').setArray(dP).setBuffer(buf).setSparse(true))
    .setAttribute('NORMAL', doc.createAccessor('shave_nrm').setType('VEC3').setArray(dN).setBuffer(buf).setSparse(true)));
  const names = [...(mesh.getExtras()?.targetNames ?? [])]; names.push('shave');
  mesh.setWeights(names.map(() => 0)).setExtras({ ...(mesh.getExtras() ?? {}), targetNames: names });
  await io.write(file, doc);
  console.log(JSON.stringify({ file, vertices: n, hair: hair.reduce((a, b) => a + b, 0), moved, targets: names }));
}
