// The player's body choice on a phone-class budget: what each identity costs, with the CPU slowed (CDP CPU throttling) as a stand-in for a
// phone. The JS cost of the game's frame is measured with the game paused and stepped (no drawing: it is the JavaScript, the part that
// SwiftShader does not distort). NOT a phone measurement: it says how the three bodies compare and how much room there is; a device run is
// still needed (docs/meshy/DEVICE_TEST.md). Usage: node scripts/perf-avatar.mjs [baseUrl=http://localhost:4310/] [outFile=docs/meshy/proof/perf-avatar.json]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4310/';
const outFile = process.argv[3] ?? 'docs/meshy/proof/perf-avatar.json';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-precise-memory-info'] });
const rows = [];
const THROTTLE = [1, 4, 6];
for (const quality of ['low', 'medium', 'high']) {
  for (const avatar of ['v4', 'homme', 'femme']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
    const p = await context.newPage(); p.setDefaultTimeout(180000);
    const t0 = Date.now();
    await p.goto(`${base}?debug&touch&avatar=${avatar}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
    const readyMs = Date.now() - t0;
    await p.waitForTimeout(1500);
    const bodyFiles = await p.evaluate(() => performance.getEntriesByType('resource').filter(r => /assets\/meshy\/body_/.test(r.name)).map(r => ({ file: r.name.split('/').pop(), kB: Math.round((r.transferSize || r.encodedBodySize) / 1024), ms: Math.round(r.duration) })));
    await p.evaluate(() => { const k = window.__dakar; k.setHour(13); k.teleport('pikine'); });
    await p.waitForTimeout(2500);
    await p.evaluate(() => window.__dakar.render());
    const render = await p.evaluate(() => ({ dc: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
    const heap = await p.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
    const body = await p.evaluate(() => {
      const b = window.__dakar.body(); let tris = 0, verts = 0, skinned = 0, tex = new Set(), mats = 0;
      b.group.traverse(o => { if (o.isMesh) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; verts += g.attributes.position.count; if (o.isSkinnedMesh) skinned++; mats++; for (const m of [].concat(o.material)) if (m.map) tex.add(m.map); } });
      return { id: b.body, tris: Math.round(tris), verts, skinnedMeshes: skinned, meshes: mats, textures: [...tex].map(t => `${t.image?.width}x${t.image?.height}`) };
    });
    await p.evaluate(() => window.__dakar.pause(true));
    const cdp = await context.newCDPSession(p);
    const js = {};
    for (const rate of THROTTLE) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      for (const [name, keys] of [['idle', []], ['walk', ['KeyW']], ['run', ['KeyW', 'ShiftLeft']]]) {
        for (const k of keys) await p.keyboard.down(k);
        await p.evaluate(() => window.__dakar.step(1 / 60, 90));                // warm up, steady gait
        // five blocks of 120 frames; the median block's mean ms per frame
        const blocks = [];
        for (let i = 0; i < 5; i++) blocks.push(await p.evaluate(() => { const s = performance.now(); window.__dakar.step(1 / 60, 120); return (performance.now() - s) / 120; }));
        for (const k of [...keys].reverse()) await p.keyboard.up(k);
        await p.evaluate(() => window.__dakar.step(1 / 60, 60));
        blocks.sort((a, b) => a - b);
        (js[`x${rate}`] ??= {})[name] = +blocks[2].toFixed(2);
      }
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    rows.push({ quality, avatar, readyMs, bodyFiles, render, heapMB: heap, body, jsMsPerFrame: js });
    console.log(JSON.stringify(rows.at(-1)));
    await context.close();
  }
}
await browser.close();
fs.mkdirSync(outFile.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ note: 'headless Chromium + SwiftShader, CDP CPU throttle: relative cost only, not a phone', rows }, null, 1));
