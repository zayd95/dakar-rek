// Edge padding for a Meshy body's base-colour texture. Meshy bakes its islands on a black (or navy) ground with no margin, so wherever the texture is filtered or
// mip-mapped across an island's border the ground bleeds in: the dark and light lines along every seam of the clothes, and the studio's recolouring, keyed on the
// cloth's hue, misses those blended texels. Here each texel outside the UV islands (and the blended texels on their border, whose centre lies outside every
// triangle) takes the colour of the island next to it, ring after ring, out to PAD texels. Nothing inside an island changes; the mesh is not touched.
// In place, repeatable (padding a padded texture changes nothing). Run after add-hair.mjs, which reads the texture as Meshy made it. No Meshy credit.
// Usage: node scripts/avatar/pad-texture.mjs <body.glb> [...more.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

const PAD = 16;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file), root = doc.getRoot();
  for (const tex of root.listTextures()) {
    const prims = root.listMeshes().flatMap(m => m.listPrimitives()).filter(p => p.getMaterial()?.getBaseColorTexture() === tex);
    if (!prims.length) continue;
    const before = tex.getImage().byteLength;
    const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, inside = new Uint8Array(W * H);
    // the islands: every texel whose centre lies in a UV triangle (glTF: v runs down the image)
    for (const p of prims) {
      const uv = p.getAttribute('TEXCOORD_0').getArray(), idx = p.getIndices().getArray();
      for (let t = 0; t < idx.length; t += 3) {
        const ax = uv[idx[t] * 2] * W, ay = uv[idx[t] * 2 + 1] * H, bx = uv[idx[t + 1] * 2] * W, by = uv[idx[t + 1] * 2 + 1] * H, cx = uv[idx[t + 2] * 2] * W, cy = uv[idx[t + 2] * 2 + 1] * H;
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
          if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) inside[y * W + x] = 1;
        }
      }
    }
    // ring by ring: a texel outside takes the mean of its neighbours already set
    const out = Uint8Array.from(data), set = Uint8Array.from(inside);
    let filled = 0;
    for (let ring = 0; ring < PAD; ring++) {
      const next = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (set[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx; if (!set[j]) continue;
          r += out[j * 3]; g += out[j * 3 + 1]; b += out[j * 3 + 2]; n++;
        }
        if (n) next.push(i, Math.round(r / n), Math.round(g / n), Math.round(b / n));
      }
      if (!next.length) break;
      for (let k = 0; k < next.length; k += 4) { const i = next[k]; out[i * 3] = next[k + 1]; out[i * 3 + 1] = next[k + 2]; out[i * 3 + 2] = next[k + 3]; set[i] = 1; }
      filled += next.length / 4;
    }
    const jpeg = await sharp(Buffer.from(out), { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
    tex.setImage(new Uint8Array(jpeg)).setMimeType('image/jpeg');
    console.log(`${file}: ${W}×${H}, islands ${(inside.reduce((s, v) => s + v, 0) / (W * H) * 100).toFixed(1)} %, padded ${filled} texels, ${(before / 1024).toFixed(0)} → ${(jpeg.length / 1024).toFixed(0)} KB`);
  }
  await io.write(file, doc);
}
