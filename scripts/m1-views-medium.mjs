// The M1 polish views (docs/districts/M1-EVIDENCE.md): before / after from the same cameras, at a given quality (default medium, the phone default), with each frame's draw calls
// and triangles. SwiftShader in headless Chromium: the frame times are not a phone's. The road's own views find the BRT and the autopont from the road's length.
// Usage: node scripts/m1-views-medium.mjs <baseUrl> <outDir> [quality]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base, out, quality = 'medium'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=15`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const d = (f, a) => page.evaluate(f, a);
const hide = () => d(() => { const c = document.querySelector('canvas'); document.querySelectorAll('body *').forEach(e => { if (e !== c && !e.contains(c)) e.style.visibility = 'hidden'; }); });
const go = async (hub, x, z, yaw = Math.PI / 2) => { await d(a => { window.__dakar.teleport(a[0], a[1], a[2], a[3]); window.__dakar.setHour(15); }, [hub, x, z, yaw]); await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', hub, T); await page.waitForTimeout(2500); await hide(); };
const measure = () => d(() => new Promise(res => { const r = window.__dakar.three.renderer, calls = [], tris = []; let n = 0; const tick = () => { calls.push(r.info.render.calls); tris.push(r.info.render.triangles); if (++n < 20) requestAnimationFrame(tick); else res({ callsMax: Math.max(...calls), trisMax: Math.max(...tris) }); }; requestAnimationFrame(tick); }));
const results = {};
const view = async (name, from, to) => { await d(a => window.__dakar.cam(a[0], a[1]), [from, to]); await page.waitForTimeout(2200); await page.screenshot({ path: `${out}/${name}.png` }); results[name] = await measure(); console.log(name, JSON.stringify(results[name])); };
const R = 'corniche-mermoz';
const onRoad = async (name, s, lat, h, back, lookLat = lat) => {
  const p = await d(a => window.__dakar.road.at(a[0], a[1], a[2]), [R, s, lat]); if (!p) { console.log('no road', name); return; }
  await d(a => window.__dakar.place(a.x, a.z, a.yaw), p); await page.waitForTimeout(3500);
  const q = await d(a => window.__dakar.road.at(a[0], a[1], a[2]), [R, s, lat]), t = await d(a => window.__dakar.road.at(a[0], a[1], a[2]), [R, s + 40, lookLat]);
  const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);
  await view(name, [q.x - fx * back, h, q.z - fz * back], [t.x, h * 0.6, t.z]);
};
await hide();
await go('corniche', 100, -60);
await onRoad('vdn-drive', 560, -2.8, 2.6, 9);
await go('mermoz', -100, 0);
const L = await d(() => { const a = window.__dakar.road.at('corniche-mermoz', 100, 0); return window.__dakar.road.project(a.x, a.z).length; });
const after = L > 1340, brtS = L - ((after ? 985 : 900) - 780);
console.log('L', L.toFixed(1), 'brt s', brtS.toFixed(1), after ? '(after)' : '(before)');
await onRoad('brt-approach', brtS - 48, -2.8, 2.6, 9, after ? -14 : -2.8);
{ const c = await d(a => window.__dakar.road.at(a[0], a[1], 0), [R, brtS]), f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }, l = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
  await view('brt-aerial', [c.x - f.x * 50 + l.x * 40, 46, c.z - f.z * 50 + l.z * 40], [c.x, 0, c.z]); }
if (after) { const a = await d(a => window.__dakar.road.at(a[0], a[1], a[2]), [R, L - 45 - 45, -2.8]), b = await d(a => window.__dakar.road.at(a[0], a[1], a[2]), [R, L - 45, -2.8]); await view('autopont-approach', [a.x, 2.6, a.z], [b.x, 4.5, b.z]); }
await go('mermoz', -64, 100, Math.PI);
await view('sacrecoeur-walk', [-54.5, 1.7, 90], [-56, 1.5, 30]);
await view('sacrecoeur-drive', [-62.8, 2.6, 110], [-62.8, 1.5, 40]);
await go('mermoz', 66, 20, Math.PI);
await view('mermoz-walk', [66.5, 1.7, 30], [64, 1.6, -30]);
await view('mermoz-drive', [62.8, 2.6, 40], [62.8, 1.6, -20]);
await view('mermoz-filaos', [58, 1.8, -18], [68, 2.2, -29]);
fs.writeFileSync(`${out}/perf.json`, JSON.stringify({ quality, after, results, errors }, null, 1));
console.log('errors', errors.length, errors.slice(0, 2));
await browser.close();
