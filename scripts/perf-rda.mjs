// What the Roi des Arènes wrestlers cost (docs/wrestling/RDA-INTEGRATION.md « Budget »), against today's v4 wrestlers: on a phone
// viewport (390×844, touch) at Low, Medium and High, in the player's bout avec frappe at the arena (two wrestlers, the referee, the duel's
// crowd) and at the evening's entrance (the two wrestlers walking out, the evening's stands): draw calls, triangles, the GPU's geometries
// and textures, the RDA file's load time, and a frame rate under SwiftShader (CPU rendering: it compares builds on this machine, it is NOT
// a phone measurement). Usage: flock /tmp/dakar-browser.lock node scripts/perf-rda.mjs <baseUrl> [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, base = 'http://127.0.0.1:5372/', outFile = ''] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const rows = [];
const fps = page => page.evaluate(() => new Promise(res => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 4000) requestAnimationFrame(f); else res(n / ((performance.now() - s) / 1000)); }; requestAnimationFrame(f); }));
const stat = page => page.evaluate(() => { const r = window.__dakar.rda(); return { dc: window.__dakar.drawCalls(), tris: window.__dakar.tris(), geometries: r.memory.geometries, textures: r.memory.textures, bodies: window.__dakar.wrestlers().map(w => w.body).join(' ') }; });
for (const quality of ['low', 'medium', 'high']) for (const body of ['v4', 'rda']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  const t0 = Date.now();
  await page.goto(`${base}?debug&touch&lamb2${body === 'rda' ? '&rdabody=force' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.drawCalls() > 0, null, { timeout: 240000 });
  const ready = Date.now() - t0;
  if (body === 'rda') await page.waitForFunction(() => window.__dakar.rda().ready, null, { timeout: 120000 }).catch(() => {});
  const load = await page.evaluate(() => window.__dakar.rda().load);
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 120000 });
  await page.evaluate(() => window.__dakar.duelStart('amical', 'costaud', 'avec_frappe', 'Gora'));
  await page.waitForFunction(() => window.__dakar.duelInfo()?.phase === 'fight', null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  const duel = { ...(await stat(page)), fps: +(await fps(page)).toFixed(1) };
  await page.evaluate(() => window.__dakar.duelAbandon(true)); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__dakar.duelFinish?.()); await page.waitForTimeout(800);
  // the evening's entrance (a fight evening: the next Friday), seen from the stands' side
  await page.evaluate(() => { const x = window.__dakar; x.setHour(18); if (x.arenaOut && x.arenaOutDay) { const t = x.arenaOut().day, fri = t + ((4 - (((t % 7) + 7) % 7)) + 7) % 7; x.arenaOutDay(fri); x.arena.day(fri); } });
  await page.waitForFunction(() => !!window.__dakar.arena.info()?.centre, null, { timeout: 120000 });
  await page.evaluate(() => { const c = window.__dakar.arena.info().centre; window.__dakar.place(c.x, c.z + 12, Math.PI); window.__dakar.arena.go('entrance'); });
  await page.waitForFunction(() => window.__dakar.arena.info()?.entrance > 0, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const entrance = { ...(await stat(page)), fps: +(await fps(page)).toFixed(1) };
  rows.push({ quality, body, readyMs: ready, rdaFile: load, duel, entrance });
  console.log(JSON.stringify(rows.at(-1)));
  await ctx.close();
}
await browser.close();
if (outFile) fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
