// M2 visual probe (the Plateau: the Médina quarter, the two trade places, the Grande Mosquée's street, an office street for scale): the same camera positions on any build (before / after), screenshots at walking and driving height, and the frame's cost there
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
await hide();
await go('plateau', -58, 4);
await view('medina-street-walk', [-60, 1.7, 4], [-60, 2.2, 60]);
await view('medina-z60-walk', [-118, 1.7, 60], [-60, 2.2, 60]);
await view('medina-high', [-10, 40, 20], [-60, 0, 60]);
await go('plateau', -66.2, 30);
await view('diallo-forecourt', [-60, 2.2, 30], [-72, 1.5, 17]);
await go('plateau', 62, -79);
await view('comptoir-arcade', [62, 2.0, -66], [70, 1.6, -80]);
await go('plateau', -30, 6);
await view('mosque-street', [-30, 1.7, 6], [-30, 3, -30]);
await go('plateau', 60, 30);
await view('plateau-office-street', [60, 1.7, 30], [60, 2.2, -40]);
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ quality, results, errors }, null, 1));
console.log('errors', errors.length, errors.slice(0, 2));
await browser.close();
