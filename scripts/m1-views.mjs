// M1 visual probe: the same camera positions on any build (before / after), screenshots at walking and driving height, and the frame's cost there
// (renderer.info draw calls and triangles, rAF frame times over 3 s). SwiftShader in headless Chromium: compare builds on this machine only, never as an iPhone's numbers.
// Usage: node scripts/m1-views.mjs <baseUrl> <outDir> <quality low|medium|high>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base, out, quality = 'low'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (f, a) => page.evaluate(f, a);
const hide = () => d(() => { const c = document.querySelector('canvas'); document.querySelectorAll('body *').forEach(e => { if (e !== c && !e.contains(c)) e.style.visibility = 'hidden'; }); });
const go = async (hub, x, z, yaw = Math.PI / 2) => { await d(a => { window.__dakar.teleport(a[0], a[1], a[2], a[3]); window.__dakar.setHour(11); }, [hub, x, z, yaw]); await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', hub, T); await page.waitForTimeout(2500); };
const measure = () => d(() => new Promise(res => {
  const r = window.__dakar.three.renderer, ts = [], calls = [], tris = []; let last = performance.now();
  const tick = now => { ts.push(now - last); last = now; calls.push(r.info.render.calls); tris.push(r.info.render.triangles); if (ts.length < 40) requestAnimationFrame(tick); else { ts.shift(); const s = [...ts].sort((a, b) => a - b); res({ frameMedian: +s[Math.floor(s.length / 2)].toFixed(1), frameP95: +s[Math.floor(s.length * 0.95)].toFixed(1), callsMax: Math.max(...calls), trisMax: Math.max(...tris) }); } };
  requestAnimationFrame(tick);
}));
const results = {};
const view = async (name, from, to) => {
  await d(a => window.__dakar.cam(a[0], a[1]), [from, to]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  results[name] = await measure();
  console.log(name, JSON.stringify(results[name]));
};
const onRoad = async (name, s, lat, h, back) => {
  const p = await d(a => window.__dakar.road.at('corniche-mermoz', a[0], a[1]), [s, lat]);
  if (!p) { console.log('no road', name); return; }
  await d(a => window.__dakar.place(a.x, a.z, a.yaw), p);
  await page.waitForTimeout(3500);
  const q = await d(a => window.__dakar.road.at('corniche-mermoz', a[0], a[1]), [s, lat]);
  const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);
  await view(name, [q.x - fx * back, h, q.z - fz * back], [q.x + fx * 40, h * 0.6, q.z + fz * 40]);
};
await hide();
// the reference: a familiar street of the Plateau (the hub everyone knows), same height as the walking view
await go('plateau', -3, -6); await hide();
await view('ref-plateau-walk', [-60 - 2.5, 1.7, -40], [-60 - 2.5, 1.5, 20]);
// 1. the VDN, driving height
await go('corniche', 100, -60); await hide();
await onRoad('vdn-drive', 560, -2.8, 2.6, 9);
await onRoad('pointe-drive', 300, -2.8, 2.6, 9);
// 2. the BRT junction, driving height and from the station island's side
await go('mermoz', -100, 0); await hide();
await onRoad('brt-drive', 1120, -2.8, 2.6, 9);
await onRoad('sacrecoeur-approach-drive', 1000, -2.8, 2.6, 9);
// 3. Sacré-Cœur's shopping street (x = −60) and 4. the shaded Mermoz street (x = 60, the Filaos), walking height and driving height
await go('mermoz', -64, 100, Math.PI); await hide();
await view('sacrecoeur-walk', [-54.5, 1.7, 90], [-56, 1.5, 30]);
await view('sacrecoeur-drive', [-62.8, 2.6, 110], [-62.8, 1.5, 40]);
await go('mermoz', 66, 20, Math.PI); await hide();
await view('mermoz-walk', [66.5, 1.7, 30], [64, 1.6, -30]);
await view('mermoz-drive', [62.8, 2.6, 40], [62.8, 1.6, -20]);
await view('mermoz-filaos', [58, 1.8, -18], [68, 2.2, -29]);
await view('mermoz-high', [40, 22, 60], [60, 0, -10]);
fs.writeFileSync(`${out}/perf.json`, JSON.stringify({ quality, results, errors }, null, 1));
console.log('errors', errors.length, errors.slice(0, 2));
await browser.close();
