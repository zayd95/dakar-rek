// LD2.0-D round 2, lane R2-H: the helicopter's pictures before and after its rebuild side by side (scripts/shots-heli.mjs took them, the same views on both
// builds). For each view: before and after by day, then before and after at 21 h, labelled; the two turntables one over the other. PNG under 400 kB.
// Usage: node scripts/compare-heli.mjs [dir]   (reads <dir>/before and <dir>/after, writes <dir>/compare-*.png)
import fs from 'node:fs';
import sharp from 'sharp';

const [dir = 'docs/proof/ld2d/r2-heli'] = process.argv.slice(2);
const label = (text, w) => Buffer.from(`<svg width="${w}" height="34"><rect width="${w}" height="34" fill="#111" opacity="0.72"/><text x="10" y="23" font-family="sans-serif" font-size="18" font-weight="bold" fill="#fff">${text}</text></svg>`);
const save = async (name, img) => {
  let png = await img.png({ compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(png).resize({ width: Math.round((await sharp(png).metadata()).width * 0.85) }).png({ palette: true, quality: 85, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(`${dir}/${name}.png`, png); console.log(name, Math.round(png.length / 1000), 'kB');
};
const views = ['street-street', 'street-roof', 'street-high', 'roof-terrace-ne', 'roof-terrace-se', 'roof-terrace-sw'];
for (const v of views) {
  const cells = [['before', 'day', 'AVANT · 10 h 30'], ['after', 'day', 'APRÈS · 10 h 30'], ['before', 'night', 'AVANT · 21 h'], ['after', 'night', 'APRÈS · 21 h']];
  const imgs = await Promise.all(cells.map(async ([tag, when, text]) => {
    const f = `${dir}/${tag}/${v}-${when}.png`, m = await sharp(f).metadata();
    return sharp(f).composite([{ input: label(text, m.width), top: m.height - 34, left: 0 }]).resize({ width: Math.round(m.width * 0.72) }).png().toBuffer();
  }));
  const m = await sharp(imgs[0]).metadata(), gap = 6;
  await save(`compare-${v}`, sharp({ create: { width: m.width * 4 + gap * 3, height: m.height, channels: 3, background: '#fff' } })
    .composite(imgs.map((input, k) => ({ input, left: k * (m.width + gap), top: 0 }))));
}
// the model alone: the old one over the new one, the same eight angles at the same distance
const cost = tag => { const j = JSON.parse(fs.readFileSync(`${dir}/${tag}/shots.json`, 'utf8')); return `${j.model.draws} appels de dessin, ${j.model.tris} triangles`; };
const tt = await Promise.all(['before', 'after'].map(async tag => {
  const f = `${dir}/${tag}/turntable.png`, m = await sharp(f).metadata();
  return { buf: await sharp(f).composite([{ input: label(`${tag === 'before' ? 'AVANT' : 'APRÈS'} : le modèle seul, huit angles (${cost(tag)})`, m.width), top: 0, left: 0 }]).png().toBuffer(), m };
}));
await save('compare-turntable', sharp({ create: { width: tt[0].m.width, height: tt[0].m.height + tt[1].m.height + 6, channels: 3, background: '#fff' } })
  .composite([{ input: tt[0].buf, left: 0, top: 0 }, { input: tt[1].buf, left: 0, top: tt[0].m.height + 6 }]));
