// Measures what the district swap costs the frame loop, both ways along the Pikine ↔ Almadies road, with the car driven by the real touch controls from `fromS` to past the middle.
// For each leg: the wall-clock gap between two rendered frames (median, 95th percentile, the longest overall and the longest within 40 frames of the swap), the swap frame's own cost
// (`__dakar.road.lastSwapMs`), the staged load that follows (steps, the slowest step, the slowest items), the build-ahead's cost (ms, steps), the chunk builder's slowest chunk, and the
// WebGL / JS memory before the swap, just after it and when the load has finished (renderer.info.memory, performance.memory when the browser has it).
// SOFTWARE RENDERING (SwiftShader) in a headless desktop Chromium: its frame times are not a phone's. Compare legs and builds on the same machine, never read the absolute numbers as an iPhone's.
// Usage: node scripts/perf-corridor.mjs <baseUrl> <outDir> <saveOut.json> <saveBack.json> [quality]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const [base, out, saveOut, saveBack, quality = 'medium'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-precise-memory-info'] });
const results = {};

async function leg(name, saveFile, fromS, toS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([s, q]) => { try { localStorage.setItem('dakarrek.guest.save.v6', s); localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, [fs.readFileSync(saveFile, 'utf8'), quality]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch&heure=11${process.env.QS ?? ""}`);
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
  await page.waitForFunction(() => window.__dakar.berline?.info().here, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const t = await realTouch(page), d = (f, a) => page.evaluate(f, a);
  const c = await d(() => window.__dakar.berline.at());
  await walkTo(page, t, c.x + Math.cos(c.yaw) * 2, c.z - Math.sin(c.yaw) * 2 + 0.4, { tol: 0.9, ms: 40000 });
  await t.tap('#act');
  await page.waitForFunction(() => window.__dakar.berline.at().driving && document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  // a sampler of the gaps between rendered frames, and of memory at three moments
  await d(() => {
    window.__gaps = []; let last = performance.now(), hub = window.__dakar.pos().hub; window.__swapAt = -1;
    const mem = () => ({ geometries: window.__dakar.three.renderer.info.memory.geometries, textures: window.__dakar.three.renderer.info.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null });
    window.__mem = { before: mem() };
    const tick = () => {
      const n = performance.now(); window.__gaps.push(+(n - last).toFixed(1)); last = n;
      const h = window.__dakar.pos().hub;
      if (h !== hub) { hub = h; window.__swapAt = window.__gaps.length - 1; window.__mem.afterSwap = mem(); window.__pre = window.__pw; }
      if (window.__swapAt >= 0 && !window.__mem.done && !window.__dakar.road.staged()) { window.__mem.done = mem(); window.__mem.doneAtFrame = window.__gaps.length; }
      window.__pw = window.__dakar.road.prewarm() ?? window.__pw;
      if (window.__gaps.length < 60000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await driveRoad(page, t, 'berline', 'pikine-almadies', toS, { cruise: 9, brakeAtEnd: false, stall: 90000 });
  await page.waitForFunction(() => window.__mem.done, null, { timeout: 120000 }).catch(() => {});
  const r = await d(() => {
    const g = window.__gaps.slice(5), s = [...g].sort((a, b) => a - b), at = window.__swapAt - 5, near = g.slice(Math.max(0, at - 10), at + 40);
    return { frames: g.length, median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], nearSwapMax: Math.max(...near), nearSwapIdx: near.indexOf(Math.max(...near)) + Math.max(0, at - 10) - at,
      swapFrameMs: +window.__dakar.road.lastSwapMs().toFixed(1), staged: window.__dakar.road.lastStaged(), prewarm: window.__pre, mem: window.__mem, slowMods: window.__dakar.road.slowMods(),
      frames: (() => { const f = window.__dakar.road.frames(); return f.map((v, i) => [i, v[0], v[1], v[2] - (f[i - 1]?.[2] ?? v[2]), v[3] - (f[i - 1]?.[3] ?? v[3]), v[4] - (f[i - 1]?.[4] ?? v[4])]).sort((a, b) => (b[1] + b[2]) - (a[1] + a[2])).slice(0, 10); })(),
      road: window.__dakar.road.info().map(r => ({ road: r.road, built: r.built, slowestChunkMs: +r.slowest.toFixed(1) })) };
  });
  await page.screenshot({ path: `${out}/${name}.png` });
  r.errors = errors; results[name] = r;
  console.log(name, JSON.stringify(r, null, 1));
  await ctx.close();
}

if (!process.env.LEG || process.env.LEG === 'out') await leg('out', saveOut, 360, 690);
if (!process.env.LEG || process.env.LEG === 'back') await leg('back', saveBack, 840, 500);
await browser.close();
fs.writeFileSync(`${out}/perf.json`, JSON.stringify({ quality, results }, null, 2));
