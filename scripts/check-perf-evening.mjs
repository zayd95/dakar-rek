// The evening performance budget (docs/PERF_EVENING.md): Pikine on a gala evening, where everything piles up — the
// city's ambient life, the street crowd, the fans arriving and queueing, the vendors, the stands, the posters, the
// traffic. Three moments: 17:30 (arrivals, in front of the gate), 19:00 (seated on the tiers during the bout) and 23:00
// (the outflow after the gala). For each graphics preset: draw calls and triangles of the frame (and each top-level
// group's share), the JS milliseconds per system and module (the main loop's debug profiler), and the frame time.
// Budgets per preset are asserted; `--measure` only prints and saves the numbers.
// Headless Chromium + SwiftShader renders on the CPU: frame times compare builds, they are NOT phone numbers; the JS
// update times are CPU times of this machine (a mid-range phone is about 3–4× slower).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-perf-evening.mjs [baseUrl] [out.json] [--measure] [--presets=low,medium,high]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const [base = 'http://localhost:4216/', outFile = 'docs/perf/evening.json'] = args.filter(a => !a.startsWith('--'));
const measureOnly = args.includes('--measure');
const presets = (args.find(a => a.startsWith('--presets='))?.slice(10) ?? 'low,medium,high').split(',');

/**
 * Budgets per preset (see docs/PERF_EVENING.md for where they come from): draw calls of the whole frame, the JS update
 * of the frame without rendering (ms, this machine), and the share of the crowd lane's own systems.
 */
export const BUDGET = {
  low: { calls: 180, updateMs: 4, crowdMs: 0.8 },
  medium: { calls: 300, updateMs: 6, crowdMs: 1.2 },
  high: { calls: 420, updateMs: 8, crowdMs: 1.6 },
};

const VIEW = {
  low: [{ width: 390, height: 844 }, true],
  medium: [{ width: 1280, height: 720 }, false],
  high: [{ width: 1280, height: 720 }, false],
};
const T = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const rows = [];

for (const preset of presets) {
  const [viewport, touch] = VIEW[preset];
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { if (!sessionStorage.getItem('perf-evening')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('perf-evening', '1'); } }, preset);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arena && window.__dakar.street, null, T);
  const profiled = await page.evaluate(() => typeof window.__dakar.perfOn === 'function');
  const d = (fn, arg) => page.evaluate(fn, arg);
  const frames = n => d(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  // a Friday gala evening at Pikine
  await d(() => { const k = window.__dakar; k.setHour(17.5); k.teleport('pikine', 18, -66.3, 0.75); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && !!window.__dakar.arena.info() && window.__dakar.street.info()?.hub === 'pikine', null, T);
  await d(() => { const x = window.__dakar; if (!x.arenaOut || !x.arenaOutDay) return; const t = x.arenaOut().day, fri = t + ((4 - (((t % 7) + 7) % 7)) + 7) % 7; x.arenaOutDay(fri); x.arena.day(fri); });

  /** Let the moment settle (the street and the arrivals at their targets), then measure over ~90 frames. */
  const measure = async (moment) => {
    await page.waitForFunction(() => { const i = window.__dakar.street.info(); return i && (i.roles.walk ?? 0) >= i.target.walkers * 0.8; }, null, T).catch(() => {});
    await frames(20);
    // older builds (before the profiler) still give draw calls, triangles and frame times
    await d(() => window.__dakar.perfOn?.(true));
    const ft = await d(() => new Promise(res => { const out = []; let last = performance.now(), k = 0; const f = () => { const now = performance.now(); if (k++ > 0) out.push(now - last); last = now; if (k > 90) res(out); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    const perf = await d(() => window.__dakar.perf?.() ?? {});
    await d(() => window.__dakar.perfOn?.(false));
    const rb = await d(() => window.__dakar.renderBreakdown?.() ?? { base: { calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }, by: {} });
    const crowds = await d(() => window.__dakar.crowds.list().map(c => ({ name: c.name, present: c.present, near: c.near, mid: c.mid, far: c.far, drawCalls: c.drawCalls })));
    const sorted = [...ft].sort((a, b) => a - b);
    const frameMs = { median: sorted[Math.floor(sorted.length / 2)], p90: sorted[Math.floor(sorted.length * 0.9)] };
    const update = Object.entries(perf).filter(([k]) => k !== 'frame (JS)' && k !== 'render (CPU)').reduce((s, [, v]) => s + v, 0);
    const crowdMs = perf['module:crowd'] ?? 0;
    const top = Object.entries(rb.by).sort((a, b) => b[1].calls - a[1].calls).slice(0, 12);
    const row = { preset, moment, calls: rb.base.calls, tris: rb.base.tris, frameMs, updateMs: Math.round(update * 100) / 100, crowdMs, perf, by: Object.fromEntries(top), crowds };
    rows.push(row);
    console.log(`${preset} ${moment}: ${row.calls} calls, ${(row.tris / 1000).toFixed(0)}k tris, update ${row.updateMs} ms (crowd ${crowdMs} ms), frame median ${frameMs.median?.toFixed(1)} ms`);
    console.log('   by group:', top.map(([k, v]) => `${k} ${v.calls}`).join(', '));
    console.log('   by system:', Object.entries(perf).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', '));
    if (!measureOnly) {
      const B = BUDGET[preset];
      check(`${preset} ${moment}: draw calls ≤ ${B.calls}`, row.calls <= B.calls, { calls: row.calls, by: top.slice(0, 5) });
      if (profiled) {
        check(`${preset} ${moment}: JS update ≤ ${B.updateMs} ms`, row.updateMs <= B.updateMs, { updateMs: row.updateMs });
        check(`${preset} ${moment}: the crowd lane's update ≤ ${B.crowdMs} ms`, crowdMs <= B.crowdMs, { crowdMs });
      }
    }
    return row;
  };

  // 1. 17:30: the fans arrive and queue; the player in front of the gate
  await d(() => window.__dakar.place(18, -66.3, 0.75));
  await page.waitForFunction(() => window.__dakar.arrivals.info()?.active, null, T).catch(() => {});
  await measure('17:30 arrivals');

  // 2. 19:00: seated on the tiers during the bout
  await d(() => window.__dakar.setHour(19));
  const a0 = await d(() => window.__dakar.arena.info());
  await d(day => { window.__dakar.state.data.counters.arena_ticket_day = day; }, a0.day);
  const C = a0.centre;
  const seat = await d(c => window.__dakar.arena.freeSeat(c.x + 9, c.z - 14), C);
  const r = Math.hypot(seat.x - C.x, seat.z - C.z), k = (r - 2.3) / r;
  await d(([c, s, k]) => window.__dakar.place(c.x + (s.x - c.x) * k, c.z + (s.z - c.z) * k, s.yaw + Math.PI), [C, seat, k]);
  await page.waitForFunction(() => window.__dakar.focus()?.kind === 'seat', null, T).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => /arena:stand/.test(window.__dakar.seated() ?? ''), null, T).catch(() => {});
  // the main bout (the preliminaries, src/arena/undercard.ts, skipped: the main event is the heavier frame)
  await page.waitForFunction(() => ['prelims', 'entrance', 'bout'].includes(window.__dakar.arena.info().phase), null, T).catch(() => {});
  await d(() => { if (['filling', 'prelims'].includes(window.__dakar.arena.info().phase)) window.__dakar.arena.go('entrance'); });
  await page.waitForFunction(() => window.__dakar.arena.info().phase === 'bout', null, T).catch(() => {});
  await measure('19:00 seated, bout');

  // 3. 23:00: the outflow after the gala, in front of the gate
  await d(() => window.__dakar.act());                                            // « Se lever »
  await page.waitForFunction(() => !window.__dakar.seated(), null, T).catch(() => {});
  await d(() => { const k = window.__dakar; k.setHour(23); k.place(6, -66.3, 1.0); });
  await frames(30);
  await measure('23:00 outflow');

  if (!measureOnly) check(`${preset}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
fs.mkdirSync(outFile.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), base, budget: BUDGET, rows, results }, null, 2));
console.log(measureOnly ? `\nmeasured ${rows.length} moments` : `\n${results.length - failed}/${results.length} evening budget checks passed`);
process.exit(failed && !measureOnly ? 1 : 0);
