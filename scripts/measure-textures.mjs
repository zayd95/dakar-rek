// The picture memory of the Pikine hub as the scene holds it: every distinct texture (map, emissive map…) with its size, canvas-painted ones listed apart.
// Usage: node scripts/measure-textures.mjs [baseUrl] [out.json]    (bytes are RGBA8 at the image's size; × 4/3 with mipmaps)
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:4330/', out = process.argv[3];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } });
const page = await ctx.newPage();
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.teleport('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const seen = new Map(), { scene } = window.__dakar.three;
  scene.traverse(o => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) { const t = m[k]; if (t && t.image && !seen.has(t.uuid)) seen.set(t.uuid, { k, w: t.image.width, h: t.image.height, canvas: typeof t.image.getContext === 'function', sign: !!t.userData?.sign, name: o.name }); }
  });
  const planes = new Map(); scene.traverse(o => { const m = o.material, t = m && !Array.isArray(m) ? m.map : null; if (t?.image && typeof t.image.getContext === 'function' && o.geometry?.type === 'PlaneGeometry' && !planes.has(t.uuid)) planes.set(t.uuid, { w: t.image.width, h: t.image.height }); });
  const all = [...seen.values()], bytes = a => a.reduce((s, t) => s + t.w * t.h * 4, 0);
  const canvas = all.filter(t => t.canvas), signs = canvas.filter(t => t.sign), atlas = canvas.filter(t => !t.sign);
  return { planeBoards: planes.size, planeBoardsMB: +([...planes.values()].reduce((a, t) => a + t.w * t.h * 4, 0) / 1e6).toFixed(2), textures: all.length, totalMB: +(bytes(all) / 1e6).toFixed(2), canvasMB: +(bytes(canvas) / 1e6).toFixed(2), signTextures: signs.length, signMB: +(bytes(signs) / 1e6).toFixed(2), atlasMB: +(bytes(atlas) / 1e6).toFixed(2), atlases: atlas.map(t => `${t.name || t.k} ${t.w}×${t.h}`).filter(s => !s.startsWith('undefined')).slice(0, 12) };
});
console.log(JSON.stringify(r));
if (out) fs.writeFileSync(out, JSON.stringify(r, null, 1));
await browser.close();
