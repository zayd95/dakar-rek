// Pilot « Almadies at dusk » (?pilot=almadies, branch pilot/almadies-dusk): performance in the pilot street at 20:00, per preset, with the
// flag ON, and the proof that the flag OFF builds nothing of it. Budgets as the evening budget (docs/PERF_EVENING.md): draw calls of the
// frame and the JS update of the frame without rendering (ms, this machine: a mid-range phone is ~3-4x slower; SwiftShader frame times
// are not phone numbers). Two views per preset: the game's own follow camera on the sidewalk, and a raised camera across the street
// (the mockup framing, the worst case: every villa in view).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-pilot-almadies.mjs [baseUrl] [--presets=low,medium,high] [--shots=outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const base = args.find(a => !a.startsWith('--')) ?? 'http://localhost:4427/';
const presets = (args.find(a => a.startsWith('--presets='))?.slice(10) ?? 'low,medium,high').split(',');
const shots = args.find(a => a.startsWith('--shots='))?.slice(8);
export const BUDGET = { low: { calls: 180, updateMs: 4 }, medium: { calls: 300, updateMs: 6 }, high: { calls: 420, updateMs: 8 } };
const T = { timeout: 240000 };
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
if (shots) fs.mkdirSync(shots, { recursive: true });

const run = async (preset, flag) => {
  const touch = preset === 'low';
  const ctx = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: shots ? 2 : 1 });
  await ctx.addInitScript(q => { if (!sessionStorage.getItem('pilot')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('pilot', '1'); } }, preset);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}${flag ? '&pilot=almadies' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const frames = n => d(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await d(() => { const k = window.__dakar; k.setHour(20); k.teleport('almadies', -21, -6.4, 0); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, T);
  await frames(40);
  const hasPilot = await d(() => !!window.__dakar.three.scene.getObjectByName('pilot-almadies'));
  const out = { hasPilot, views: {} };
  for (const view of ['follow', 'raised']) {
    await d(v => { const k = window.__dakar; if (v === 'raised') k.cam([-10, 9.5, 9.5], [-21, 2.6, -13]); else { k.cam(null); k.place(-21, -6.4, Math.PI); } }, view);
    await frames(25);
    await d(() => window.__dakar.perfOn?.(true));
    const ft = await d(() => new Promise(res => { const o = []; let last = performance.now(), k = 0; const f = () => { const n = performance.now(); if (k++ > 0) o.push(n - last); last = n; if (k > 60) res(o); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    const perf = await d(() => window.__dakar.perf?.() ?? {});
    await d(() => window.__dakar.perfOn?.(false));
    const rb = await d(() => window.__dakar.renderBreakdown?.() ?? { base: { calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }, by: {} });
    const update = Object.entries(perf).filter(([k]) => k !== 'frame (JS)' && k !== 'render (CPU)').reduce((s, [, v]) => s + v, 0);
    const sorted = [...ft].sort((a, b) => a - b);
    out.views[view] = { calls: rb.base.calls, tris: rb.base.tris, updateMs: Math.round(update * 100) / 100, frameMedian: Math.round(sorted[sorted.length >> 1] * 10) / 10 };
    if (shots) await page.screenshot({ path: `${shots}/${preset}-${flag ? 'pilot' : 'base'}-${view}.png` });
  }
  out.errors = errors;
  await ctx.close();
  return out;
};

for (const preset of presets) {
  const on = await run(preset, true), off = await run(preset, false);
  check(`${preset}: flag off builds no pilot geometry`, !off.hasPilot);
  check(`${preset}: flag on builds the pilot street`, on.hasPilot);
  check(`${preset}: no page errors`, !on.errors.length && !off.errors.length, [...on.errors, ...off.errors].slice(0, 2));
  for (const view of ['follow', 'raised']) {
    const a = on.views[view], b = off.views[view], bud = BUDGET[preset];
    console.log(`${preset} ${view}: pilot ${a.calls} calls ${(a.tris / 1000).toFixed(0)}k tris update ${a.updateMs} ms frame ${a.frameMedian} ms | base ${b.calls} calls ${(b.tris / 1000).toFixed(0)}k update ${b.updateMs} ms`);
    check(`${preset} ${view}: draw calls <= ${bud.calls}`, a.calls <= bud.calls, `${a.calls} (+${a.calls - b.calls} vs the normal build)`);
    check(`${preset} ${view}: update <= ${bud.updateMs} ms`, a.updateMs <= bud.updateMs, `${a.updateMs} ms (normal ${b.updateMs})`);
  }
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
