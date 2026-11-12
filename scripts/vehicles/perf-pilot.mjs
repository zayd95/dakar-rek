// Cost of the prepared GLB body against the procedural kit vehicle it replaces, on a phone-class budget (headless Chromium + SwiftShader:
// relative numbers, NOT a phone measurement; a device run is still needed).
//  1. the model alone: meshes (= draw calls), materials, triangles, texture memory, near and far;
//  2. the frame at Ndiaye Auto's showroom (the worst place: three displayed cars, looked at from the kerb), kit vs GLB,
//     draw calls and triangles as the renderer counts them, on Low and Medium quality, phone viewport;
//  3. the per-frame JavaScript of animating one vehicle (spin + steer), CPU throttled x1 / x4 / x6.
// Usage: node scripts/vehicles/perf-pilot.mjs [baseUrl=http://127.0.0.1:5199/] [out=docs/vehicles/pilot/perf.json] [id=compacte] [kind=sedan] [seed=14]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [,, base = 'http://127.0.0.1:5199/', outFile = 'docs/vehicles/pilot/perf.json', id = 'compacte', kind = 'sedan', seed = '14'] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const T = { timeout: 180000 }, rows = [], result = { note: 'headless Chromium + SwiftShader; relative cost only, not a phone', id, kind, seed: Number(seed), rows, model: null, js: null };

for (const quality of ['low', 'medium']) {
  for (const glb of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
    const page = await ctx.newPage(); page.setDefaultTimeout(180000);
    await page.goto(`${base}?debug&touch${glb ? '' : '&vehicleModel=kit'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub, null, T);
    await page.evaluate(() => { const d = window.__dakar; d.setHour(11); d.teleport('plateau'); });
    await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car.info().dealer, null, T);
    await page.waitForTimeout(1500);
    const row = await page.evaluate(async glb => {
      const d = window.__dakar, dl = d.car.info().dealer;
      const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      d.place(dl.x + 0.7, dl.z + 0.4, -Math.PI / 2);
      d.cam([dl.delivery.x + 1.5, 3.2, dl.delivery.z + 7.5], [dl.x + 2.5, 1.0, dl.z - 1]);
      await frames(); await frames();
      let dc = 0, tris = 0; const N = 8;
      for (let k = 0; k < N; k++) { await frames(); dc += d.drawCalls(); tris += d.tris(); }
      const mem = d.three.renderer.info.memory;
      return { drawCalls: Math.round(dc / N), tris: Math.round(tris / N), geometries: mem.geometries, textures: mem.textures, glb };
    }, glb);
    rows.push({ quality, ...row }); console.log(JSON.stringify(rows.at(-1)));
    if (quality === 'medium' && glb) {
      // 1. the model alone and 3. the per-frame JavaScript
      result.model = await page.evaluate(async ([id, kind, seed]) => {
        const d = window.__dakar, cost = o => { let meshes = 0, tris = 0; const mats = new Set(), tex = new Set(); o.traverse(m => { if (m.isMesh) { meshes++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; for (const mt of [].concat(m.material)) { mats.add(mt.uuid); if (mt.map) tex.add(mt.map); } } }); return { meshes, materials: mats.size, tris: Math.round(tris), textureMB: +[...tex].reduce((s, t) => s + (t.image?.width ?? 0) * (t.image?.height ?? 0) * 4 * 1.33 / 1048576, 0).toFixed(2) }; };
        const kit = d.kitVehicle(kind, Number(seed)), lod = kit.getObjectByProperty('isLOD', true), g = await d.kitGlb(id, kind, Number(seed));
        return { kitNear: cost(lod.levels[0].object), kitFar: cost(lod.levels[1].object), glb: cost(g) };
      }, [id, kind, seed]);
      const cdp = await ctx.newCDPSession(page); result.js = {};
      for (const rate of [1, 4, 6]) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        result.js[`x${rate}`] = await page.evaluate(async ([id, kind, seed]) => {
          const d = window.__dakar, glbG = await d.kitGlb(id, kind, Number(seed)), kitG = d.kitVehicle(kind, Number(seed));
          const run = g => { for (let i = 0; i < 2000; i++) d.animateVehicle(g, 8, 0.3, 1 / 60); const t = performance.now(); for (let i = 0; i < 20000; i++) d.animateVehicle(g, 8, Math.sin(i / 50) * 0.3, 1 / 60); return +((performance.now() - t) / 20000 * 1000).toFixed(2); };
          return { kitMicrosPerCall: run(kitG), glbMicrosPerCall: run(glbG) };
        }, [id, kind, seed]);
      }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    await ctx.close();
  }
}
await browser.close();
fs.mkdirSync(outFile.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ model: result.model, js: result.js }, null, 1));
