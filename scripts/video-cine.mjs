// A video of the cinematic bout (docs/wrestling/cine/cine-bout.mp4): the game stepped at 30 fps, phone portrait, Medium,
// the Roi des Arènes bodies. A scripted player: walks in, wins the hand fight, tries a Soulevé too weak (he resists),
// loses the next hand fight and holds his attack off (« Résiste »), then wins one more and throws him over the hip.
// Usage: flock -o /tmp/dakar-browser.lock node scripts/video-cine.mjs <baseUrl> <framesDir> [out.mp4]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [,, base = 'http://127.0.0.1:5311/', dir = 'out/cine', mp4 = 'docs/wrestling/cine/cine-bout.mp4'] = process.argv;
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${base}?debug&touch&rdabody=force`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub);
await page.waitForFunction(() => window.__dakar.rda().ready, null, { timeout: 120000 }).catch(() => {});
await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine');
await page.waitForTimeout(3000);
const D = (fn, a) => page.evaluate(fn, a);
let n = 0;
async function frame(before) {
  await D(b => {
    const d = window.__dakar, key = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    if (b) new Function('d', 'key', b)(d, key);
    d.step(1 / 30); d.render();
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = (a.currentTime ?? 0) + 1000 / 30; }
  }, before ?? '');
  await page.screenshot({ path: `${dir}/f${String(n++).padStart(4, '0')}.jpg`, quality: 80 });
}
const info = () => D(() => window.__dakar.duelInfo());
await D(() => window.__dakar.duelStart('amical', 'costaud', 'sans_frappe', 'Gora'));
await page.waitForFunction(() => !!window.__dakar.duelInfo());
await D(() => window.__dakar.pause(true));
// the plan: per round of the hand fight, win it or not; per opening, the move and the force aimed at
const plan = [{ win: true, tech: 'Digit1', aim: 0.55 }, { win: false }, { win: true, tech: 'Digit2', aim: 0.97 }];
let round = 0, missed = false;
for (let k = 0; k < 1500; k++) {
  const i = await info(); if (!i) break;
  const c = i.combat?.cine ?? i.cine;
  if (i.phase === 'result' || (i.phase === 'fall' && i.phaseT > 4)) { if (n > 0) break; }
  let b = '';
  const p = plan[Math.min(round, plan.length - 1)];
  if (c && (i.phase === 'fight' || i.phase === 'clinch')) {
    const inZone = c.needle >= c.z0 + 0.03 && c.needle <= c.z1 - 0.03;
    if (c.phase === 'debout') { b = i.dist < 1.45 && k % 20 === 0 ? 'key("Space")' : 'd.duelStick(1, 0, 0.1)'; }
    if (c.phase === 'empoignade') { if (p.win ? inZone : (!inZone && !missed && c.needle > 0.5)) { b = 'key("Space")'; if (!p.win) missed = true; } }
    if (c.phase === 'ouverture' && c.t > 0.5) { b = `key("${p.tech}")`; }
    if (c.phase === 'projection' && c.needle >= p.aim) { b = 'key("Space")'; }
    if (c.phase === 'defense' && inZone) b = 'key("Space")';
    if (c.phase === 'scene' && c.scene && c.scene.t < 0.05) { round++; missed = false; }
  }
  await frame(b);
}
console.log(JSON.stringify({ frames: n, errors, end: (await info())?.cine ?? (await info())?.combat?.cine }));
fs.mkdirSync(mp4.replace(/\/[^/]+$/, ''), { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/f%04d.jpg`, '-vf', 'scale=390:844', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'veryfast', mp4]);
await browser.close();
