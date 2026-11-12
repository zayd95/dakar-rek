// CPU profile (V8 sampling, through CDP) of the seconds round a district swap on the Pikine ↔ Almadies road: which functions the JavaScript spent its time in. Use an UNMINIFIED build
// (`vite build --minify false`) so the names are readable. Usage: node scripts/profile-swap.mjs <baseUrl> <saveJson> [seconds-before=1] [seconds-after=6]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';
const [base, saveFile, pre = '1', post = '6'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(s => { try { localStorage.setItem('dakarrek.guest.save.v6', s); localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } }, fs.readFileSync(saveFile, 'utf8'));
const page = await ctx.newPage(); page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(`${base}?debug&touch&heure=11${process.env.QS ?? ''}`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.waitForFunction(() => window.__dakar.berline?.info().here, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const t = await realTouch(page), d = (f, a) => page.evaluate(f, a), cdp = await ctx.newCDPSession(page);
const c = await d(() => window.__dakar.berline.at());
await walkTo(page, t, c.x + Math.cos(c.yaw) * 2, c.z - Math.sin(c.yaw) * 2 + 0.4, { tol: 0.9 });
await t.tap('#act'); await page.waitForFunction(() => window.__dakar.berline.at().driving && document.body.classList.contains('ridepad'), null, { timeout: 60000 });
await d(() => { window.__swapT = -1; let hub = window.__dakar.pos().hub; const tick = () => { if (window.__dakar.pos().hub !== hub) { hub = window.__dakar.pos().hub; window.__swapT = performance.now(); } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
const t0 = await d(() => performance.now()); await cdp.send('Profiler.start');
await driveRoad(page, t, 'berline', 'pikine-almadies', 690, { cruise: 9, brakeAtEnd: false, stall: 90000 });
await page.waitForFunction(() => window.__dakar.road.staged() === null, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
const { profile } = await cdp.send('Profiler.stop');
const swapT = await d(() => window.__swapT);
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map(); let when = profile.startTime / 1000 - t0 * 0;                // µs → ms on the monotonic clock
const base0 = profile.startTime / 1000;
let cur = 0; const win0 = (swapT - t0 - Number(pre) * 1000), win1 = (swapT - t0 + Number(post) * 1000);
for (let i = 0; i < profile.samples.length; i++) {
  cur += profile.timeDeltas[i] / 1000;
  if (cur < win0 || cur > win1) continue;
  const n = byId.get(profile.samples[i]), k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + profile.timeDeltas[i] / 1000);
}
void when; void base0;
console.log(`window ${pre}s before → ${post}s after the swap; top self time (ms):`);
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(Math.round(v)).padStart(6), k);
await browser.close();
