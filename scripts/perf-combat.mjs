// What the new bout costs (docs/wrestling/COMBAT.md « Performance »), on a phone viewport (390×844, touch), Medium and High,
// the Roi des Arènes bodies (?rdabody=force), the player's bout avec frappe against Gora at the arena: 60 s of bout time
// (bouts started again as they end), played by the same keys and debug hooks on any build (walk with D, duelGrab, duelMove,
// duelThrow), so 87076f3f (Làmb 2.0's bout) and this branch (the new bout) are measured alike. Per drawn frame: the game's
// own JS (update; the render's submit apart), draw calls and triangles; the JS heap after a forced collection at the
// start and at the end of the 60 s; the bout's load (from the call to its first drawn frame).
// SwiftShader renders on this machine's CPU: frame rates here say NOTHING about a phone. What carries over: the game's
// JS per frame (relative), draw calls, triangles, the heap's growth.
// Usage: flock /tmp/dakar-browser.lock node scripts/perf-combat.mjs <baseUrl> <out.json> [baseline.json]
//   With a baseline (the same script on 87076f3f) the budgets are asserted: update JS ≤ +15 % (+0.5 ms), render submit ≤
//   +15 % (+0.5 ms), draw calls ≤ +3, triangles ≤ +3 %, heap growth ≤ 4 MB and ≤ the baseline's + 2 MB, the bout's load
//   ≤ +25 % (+150 ms).
import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, base = 'http://127.0.0.1:5311/', outFile = '', baseFile = ''] = process.argv;
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] };
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);
const BOUT_SECONDS = Number(process.env.BOUT_SECONDS ?? 60);
const stat = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? { mean: +(s.reduce((p, x) => p + x, 0) / n).toFixed(2), median: s[Math.floor(n / 2)], p95: s[Math.floor(n * 0.95)], n } : null; };
const rows = [];
for (const quality of ['medium', 'high']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}?debug&touch&lamb2&rdabody=force`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub, null, { timeout: 300000 });
  await page.waitForFunction(() => window.__dakar.rda?.().ready, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { let n = 0; const f = () => { n++; requestAnimationFrame(f); }; requestAnimationFrame(f); window.__fcount = () => n; });   // frames drawn, to take this bout's from the game's ring
  const gcHeap = () => page.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } return performance.memory?.usedJSHeapSize ?? null; });
  const upd = [], sub = [], calls = [], tris = [], loads = [];
  let boutTime = 0, bouts = 0, heap0 = null;
  while (boutTime < BOUT_SECONDS) {
    // the bout's load: from the call to the first frame drawn with it
    const load = await page.evaluate(() => new Promise(res => { const t0 = performance.now(); window.__dakar.duelStart('amical', 'costaud', 'avec_frappe', 'Gora'); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t0))); }));
    loads.push(load); bouts++;
    await page.waitForFunction(() => window.__dakar.duelInfo()?.phase === 'fight', null, { timeout: 300000 });
    if (heap0 === null) heap0 = await gcHeap();
    await page.evaluate(() => window.__dakar.duelClock?.(90));
    const c0 = await page.evaluate(() => window.__fcount());
    let lastGame = null;
    for (;;) {
      const i = await page.evaluate(() => window.__dakar.duelInfo());
      if (!i || i.phase === 'result' || boutTime >= BOUT_SECONDS) break;
      const sec = 90 - (i.timeLeft ?? 90); if (lastGame !== null && sec > lastGame) boutTime += sec - lastGame; lastGame = sec;
      if (i.phase === 'fight') { if (i.dist > 1.3) await page.keyboard.down('KeyD'); else { await page.keyboard.up('KeyD'); await page.evaluate(() => window.__dakar.duelGrab()); } }
      else if (i.phase === 'clinch') { await page.keyboard.up('KeyD'); await page.evaluate(() => { const c = window.__dakar.duelInfo(); if (c?.combat?.best?.ready || (c?.balance?.opponent ?? 100) < 35) window.__dakar.duelThrow(); else window.__dakar.duelMove(Math.random() < 0.6 ? 'push' : 'pull'); }); }
      else await page.keyboard.up('KeyD');
      const fr = await page.evaluate(() => ({ c: window.__dakar.drawCalls(), t: window.__dakar.tris() }));
      calls.push(fr.c); tris.push(fr.t);
      await page.waitForTimeout(400);
    }
    await page.keyboard.up('KeyD');
    // this bout's frames (the game's ring keeps the last 400): update and render submit, ms
    const fr = await page.evaluate(c => window.__dakar.road.frames().slice(-Math.max(1, Math.min(400, window.__fcount() - c))), c0);
    for (const f of fr) { upd.push(f[0]); sub.push(f[1]); }
    await page.evaluate(() => { window.__dakar.duelAbandon?.(true); window.__dakar.duelFinish?.(); });
    await page.waitForFunction(() => !window.__dakar.duelInfo() || window.__dakar.duelInfo().phase === 'result', null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => window.__dakar.duelFinish?.());
    await page.waitForTimeout(800);
  }
  const heap1 = await gcHeap();
  const row = {
    quality, bouts, boutSeconds: +boutTime.toFixed(1), jsUpdateMs: stat(upd), jsSubmitMs: stat(sub), drawCalls: stat(calls), triangles: stat(tris),
    heapMB: heap0 && heap1 ? { start: +(heap0 / 1048576).toFixed(1), end: +(heap1 / 1048576).toFixed(1), growth: +((heap1 - heap0) / 1048576).toFixed(2) } : null,
    boutLoadMs: stat(loads), errors: errors.slice(0, 3),
  };
  rows.push(row); console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();
if (outFile) fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
if (baseFile && fs.existsSync(baseFile)) {
  const b = JSON.parse(fs.readFileSync(baseFile, 'utf8')); let fail = 0;
  const ck = (name, ok, extra) => { if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(extra)); };
  for (const r of rows) {
    const o = b.find(x => x.quality === r.quality); if (!o) continue;
    const q = r.quality;
    ck(`${q}: update JS per frame within +15 % (+0.5 ms) of 87076f3f`, r.jsUpdateMs.mean <= o.jsUpdateMs.mean * 1.15 + 0.5, { now: r.jsUpdateMs, before: o.jsUpdateMs });
    ck(`${q}: render submit per frame within +15 % (+0.5 ms)`, r.jsSubmitMs.mean <= o.jsSubmitMs.mean * 1.15 + 0.5, { now: r.jsSubmitMs, before: o.jsSubmitMs });
    ck(`${q}: draw calls within +3`, r.drawCalls.median <= o.drawCalls.median + 3, { now: r.drawCalls, before: o.drawCalls });
    ck(`${q}: triangles within +3 %`, r.triangles.median <= o.triangles.median * 1.03, { now: r.triangles, before: o.triangles });
    ck(`${q}: JS heap growth over the bouts ≤ 4 MB and ≤ the baseline's + 2 MB`, r.heapMB && r.heapMB.growth <= 4 && r.heapMB.growth <= (o.heapMB?.growth ?? 0) + 2, { now: r.heapMB, before: o.heapMB });
    ck(`${q}: the bout's load within +25 % (+150 ms)`, r.boutLoadMs.median <= o.boutLoadMs.median * 1.25 + 150, { now: r.boutLoadMs, before: o.boutLoadMs });
    ck(`${q}: no page error`, r.errors.length === 0, r.errors);
  }
  process.exit(fail ? 1 : 0);
}
