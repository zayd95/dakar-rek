// Release 1.0: what each district costs to draw, the same way before and after a change. For every hub, on a phone-sized touch page, at the hub's arrival point looking the way the
// player arrives, at 10 h and 21 h, on the « Moyenne » and « Basse » presets: draw calls and triangles of the frame (three.js renderer.info), the renderer's geometry / texture / program
// counts, the JS heap where the browser gives it, and how long the district took to load. These counts carry over to a phone; frame TIMES here are a software renderer's and are not
// reported. Usage: node scripts/perf-hubs.mjs <baseUrl> <out.json> [label]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://127.0.0.1:4190/', outFile = '/tmp/perf-hubs.json', label = ''] = process.argv.slice(2);
const HUBS = ['pikine', 'plateau', 'corniche', 'almadies', 'mermoz'], rows = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const quality of ['medium', 'low']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const t0 = Date.now();
  await page.goto(`${base}?debug&touch&heure=10`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play');
  const boot = Date.now() - t0;
  const net = await page.evaluate(() => { const r = performance.getEntriesByType('resource'); return { files: r.length, kB: Math.round(r.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0) / 1024) }; });
  for (const hub of HUBS) for (const hour of [10, 21]) {
    const tl = Date.now();
    await page.evaluate(([h, hr]) => { window.__dakar.setHour(hr); window.__dakar.teleport(h); }, [hub, hour]);
    await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', hub);
    const load = Date.now() - tl;
    await page.waitForTimeout(5000);                              // crowd, traffic and the staged pieces have settled
    const m = await page.evaluate(() => {
      const A = window.__dakar, mem = A.three.renderer.info.memory, three = { geometries: mem.geometries, textures: mem.textures, programs: A.three.renderer.info.programs?.length ?? null }, pm = performance.memory;
      let calls = 0, tris = 0; for (let i = 0; i < 6; i++) { calls = Math.max(calls, A.drawCalls()); tris = Math.max(tris, A.tris()); }
      return { calls, tris, heapMB: pm ? Math.round(pm.usedJSHeapSize / 1048576) : null, three };
    });
    rows.push({ quality, hub, hour, calls: m.calls, tris: m.tris, heapMB: m.heapMB, ...m.three, loadMs: load });
    console.log(`${quality} ${hub} ${hour}h: ${m.calls} calls, ${m.tris} tris, ${m.three.geometries} geom, ${m.three.textures} tex, heap ${m.heapMB} MB, load ${load} ms`);
  }
  rows.push({ quality, boot, net });
  console.log(`${quality}: first load ${boot} ms, ${net.files} files, ${net.kB} kB`);
  await context.close();
}
await browser.close();
fs.writeFileSync(outFile, JSON.stringify({ label, base, at: new Date().toISOString(), rows }, null, 1));
