// Load time and frame-rate sample in headless Chromium (SwiftShader = CPU rendering: numbers compare builds,
// they are NOT phone measurements). Usage: node scripts/perf.mjs <baseUrl> [label]
import { chromium } from 'playwright';
const [,, base = 'http://localhost:4173/', label = ''] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const rows = [];
for (const [vpName, w, h] of [['desktop', 1280, 720], ['phone', 390, 844]]) {
  const touch = w < h;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  if (process.env.QUALITY) await page.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, process.env.QUALITY);
  const t0 = Date.now();
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.drawCalls() > 0, null, { timeout: 120000 });
  const ready = Date.now() - t0;
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0));
  for (const [hub, hour] of [['plateau', 13], ['pikine', 13], ['pikine', 21]]) {
    await page.evaluate(([hb, hr]) => { window.__dakar.setHour(hr); window.__dakar.teleport(hb); }, [hub, hour]);
    await page.waitForTimeout(1500);
    const fps = await page.evaluate(() => new Promise(res => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 4000) requestAnimationFrame(f); else res(n / ((performance.now() - s) / 1000)); }; requestAnimationFrame(f); }));
    const st = await page.evaluate(() => ({ dc: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
    rows.push({ label, vp: vpName, hub, hour, readyMs: ready, kB: Math.round(bytes / 1024), fps: +fps.toFixed(1), drawCalls: st.dc, tris: st.tris });
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(rows));
