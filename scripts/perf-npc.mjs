// NPC density performance: draw calls, animated humanoids and frame time along a fixed walk through the busiest
// streets, at Low and Medium quality. Works on any build (before/after): humanoids are counted from the scene.
// Usage: node scripts/perf-npc.mjs <baseUrl> [label] [out.json]
// Headless Chromium + SwiftShader renders on the CPU: frame times compare builds, they are NOT phone numbers.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [,, base = 'http://localhost:4216/', label = 'build', outFile, qualities = 'low,medium'] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
/** The fixed walks: hub, hour, waypoints (the player is moved along them; the follow camera trails). */
const WALKS = [
  { hub: 'pikine', hour: 13.2, pts: [[60, 64], [86, 64], [86, 98], [-20, 98]] },
  { hub: 'pikine', hour: 20.3, pts: [[-40, 102], [-10, 102], [-10, 64], [70, 64]] },
  { hub: 'plateau', hour: 19.2, pts: [[22, 22], [22, -60], [-38, -60]] },
];
const STEPS = Number(process.env.STEPS ?? 30);
const rows = [];
for (const quality of qualities.split(',')) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await ctx.newPage(); page.setDefaultTimeout(180000);
  await page.goto(`${base}?debug&touch`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.body(), null, { timeout: 180000 });
  for (const w of WALKS) {
    await page.evaluate(w => { const d = window.__dakar; d.setHour(w.hour); d.teleport(w.hub, w.pts[0][0], w.pts[0][1], 0); d.ambientDay?.(1); }, w);
    await page.evaluate(() => new Promise(r => { let k = 0; const f = () => (++k > 12 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));   // the street fills
    const r = await page.evaluate(([pts, steps]) => new Promise(res => {
      const d = window.__dakar, scene = d.three.scene;
      // walk the polyline at an even pace, one waypoint per frame
      const segs = []; let total = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
      const at = t => { let s = t * total; for (let i = 0; i < segs.length; i++) { if (s <= segs[i] || i === segs.length - 1) { const k = Math.min(1, s / segs[i]); const a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]; } s -= segs[i]; } };
      const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const humanoids = () => { let n = 0; scene.traverse(o => { if (o.name === 'humanoid_v2' && visible(o) && o.children[0]?.visible !== false) n++; }); return n; };
      const ft = [], dc = [], hu = [], tris = [];
      let k = 0, last = performance.now();
      const f = () => {
        const now = performance.now(); if (k > 0) ft.push(now - last); last = now;
        dc.push(d.drawCalls()); tris.push(d.tris()); if (k % 4 === 0) hu.push(humanoids());
        if (k >= steps) { res({ ft, dc, hu, tris }); return; }
        const [x, z, yaw] = at(k / steps); d.place(x, z, yaw); k++;
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }), [w.pts, STEPS]);
    const avg = a => a.reduce((v, x) => v + x, 0) / a.length, p95 = a => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
    rows.push({ label, quality, hub: w.hub, hour: w.hour, frameMsAvg: +avg(r.ft).toFixed(1), frameMsP95: +p95(r.ft).toFixed(1), drawCallsAvg: Math.round(avg(r.dc)), drawCallsMax: Math.max(...r.dc), trisAvg: Math.round(avg(r.tris)), humanoidsAvg: +avg(r.hu).toFixed(1), humanoidsMax: Math.max(...r.hu) });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  await ctx.close();
}
await browser.close();
if (outFile) fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
