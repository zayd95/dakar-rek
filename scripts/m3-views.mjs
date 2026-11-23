// M3 visual probe (the Corniche's pitch with the evening match on: the touchline, the grass at a player's height, the pitch from above, the Corniche street beside it): the same camera positions on any build (before / after), screenshots at walking and driving height, and the frame's cost there
// (renderer.info draw calls and triangles, rAF frame times over 3 s). SwiftShader in headless Chromium: compare builds on this machine only, never as an iPhone's numbers.
// Usage: node scripts/m3-views.mjs <baseUrl> <outDir> <quality low|medium|high>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base, out, quality = 'low'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=17.5`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (f, a) => page.evaluate(f, a);
const hide = () => d(() => { const c = document.querySelector('canvas'); document.querySelectorAll('body *').forEach(e => { if (e !== c && !e.contains(c)) e.style.visibility = 'hidden'; }); });
const go = async (hub, x, z, yaw = Math.PI / 2) => { await d(a => { window.__dakar.teleport(a[0], a[1], a[2], a[3]); window.__dakar.setHour(17.5); }, [hub, x, z, yaw]); await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', hub, T); await page.waitForTimeout(2500); };
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
  results[name] = { ...(await measure()), match: await d(() => { const f = window.__dakar.football?.(); return f ? { active: f.active, teams: f.teams ?? null, fans: f.fans ?? null } : null; }) };
  console.log(name, JSON.stringify(results[name]));
};
await hide();
// The pitch is at (-90, 30), half sizes 20 × 15: the north touchline at z = 15 opens on the street (z = 0).
await go('corniche', -84, 10);
await view('pitch-touchline', [-84, 1.7, 11], [-90, 1.2, 30]);
await view('pitch-grass', [-100, 1.7, 26], [-80, 1.0, 32]);
await view('pitch-high', [-90, 34, -6], [-90, 0, 30]);
await go('corniche', -60, 0);
await view('corniche-street', [-40, 1.7, 0], [-110, 2.2, 4]);
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ quality, results, errors }, null, 1));
console.log('errors', errors.length, errors.slice(0, 2));
await browser.close();
