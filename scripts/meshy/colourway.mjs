// A colourway of a baked outfit: the pixels of the base-colour texture whose hue is in a range (a garment of one colour) are turned to another hue.
// It changes colours only: the garment, its shape and the hair stay what Meshy baked. Usage:
//   node scripts/meshy/colourway.mjs <in.glb> <out.glb> --hue 190:250 --to 355 [--sat-min 0.35] [--val-min 0.3] [--light 1]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const args = process.argv.slice(2), [inp, outp] = args, opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const [h0, h1] = String(opt('hue', '190:250')).split(':').map(Number), to = Number(opt('to', 355)), satMin = Number(opt('sat-min', 0.35)), valMin = Number(opt('val-min', 0.3)), light = Number(opt('light', 1));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(inp);
const tex = doc.getRoot().listTextures().find(t => t.getName() === 'meshy_base') ?? doc.getRoot().listTextures()[0];
const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let changed = 0; const mid = (h0 + h1) / 2;
for (let i = 0; i < data.length; i += 3) {
  const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d || d / mx < satMin || mx < valMin) continue;   // a plain, bright-enough garment colour (dark denim and shadows are left alone)
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  if (h < h0 || h > h1) continue;
  const nh = (to + (h - mid) + 360) % 360, s = d / mx, v = Math.min(1, mx * light), c = v * s, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = v - c;
  const [rr, gg, bb] = nh < 60 ? [c, x, 0] : nh < 120 ? [x, c, 0] : nh < 180 ? [0, c, x] : nh < 240 ? [0, x, c] : nh < 300 ? [x, 0, c] : [c, 0, x];
  data[i] = Math.round((rr + m) * 255); data[i + 1] = Math.round((gg + m) * 255); data[i + 2] = Math.round((bb + m) * 255); changed++;
}
tex.setImage(new Uint8Array(await sharp(data, { raw: info }).jpeg({ quality: 86, mozjpeg: true }).toBuffer())).setMimeType('image/jpeg');
await io.write(outp, doc);
console.log(JSON.stringify({ out: outp, pixelsChanged: changed, of: data.length / 3, share: +(changed / (data.length / 3)).toFixed(3) }));
