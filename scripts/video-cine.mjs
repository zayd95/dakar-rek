// A video of the cinematic bout (docs/wrestling/cine/cine-bout.mp4): the game stepped at 30 fps, phone portrait, Medium,
// the Roi des Arènes bodies. A scripted, patient player:
//   standing — waits; side-steps his first charge (« Esquive ») and grabs him as he stumbles (« Bonne prise »), later
//   grabs late in his tell (« Contre-saisie »);
//   empoignade — holds Force and pulls as he pushes, so he falls forward and the hip throw lights; resists his attacks
//   late in the tell (the first one countered); tries a Croc first, the wrong move (he turns it round); throws the lit move,
//   once he is tired, at the gauge's zone; the fall, then its replay.
// Usage: flock -o /tmp/dakar-browser.lock node scripts/video-cine.mjs <baseUrl> <framesDir> [out.mp4] [maxFrames]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [,, base = 'http://127.0.0.1:5311/', dir = 'out/cine', mp4 = 'docs/wrestling/cine/cine-bout.mp4', maxF = '2400', vw = '390', vh = '844'] = process.argv;
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +vw, height: +vh }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
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
const banners = [];
async function frame(before) {
  const b = await D(b => {
    const d = window.__dakar, key = (c, up) => window.dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { code: c }));
    if (b) new Function('d', 'key', b)(d, key);
    d.step(1 / 30); d.render();
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = (a.currentTime ?? 0) + 1000 / 30; }
    return document.querySelector('.duel-banner, .lamb-banner, [data-k=banner]')?.textContent ?? '';
  }, before ?? '');
  if (b && banners[banners.length - 1] !== b) banners.push(b);
  await page.screenshot({ path: `${dir}/f${String(n++).padStart(4, '0')}.jpg`, quality: 80 });
}
const info = () => D(() => window.__dakar.duelInfo());
await D(() => window.__dakar.duelStart('amical', 'costaud', 'sans_frappe', 'Gora'));
await page.waitForFunction(() => !!window.__dakar.duelInfo());
await D(() => window.__dakar.pause(true));
let wrongDone = false, tells = 0, attacks = 0, pressedTell = false, holding = false, lastAiAct = '', lastPlan = '';
for (let k = 0; k < +maxF; k++) {
  const i = await info(); if (!i) break;
  const c = i.combat?.cine ?? i.cine;
  if (i.phase === 'result' && i.phaseT > 2.5) break;
  let b = '';
  const hold = want => { if (want !== holding) { b += `key("Space", ${!want});`; holding = want; } };
  if (c && (i.phase === 'fight' || i.phase === 'clinch')) {
    if (c.phase === 'debout') {
      hold(false);
      if (c.ai !== lastAiAct && c.ai === 'garde') { tells++; pressedTell = false; }
      lastAiAct = c.ai;
      const tellK = c.ai === 'garde' ? c.aiT / c.aiDur : -1;
      if (c.ai === 'garde' || c.ai === 'charge') {
        if (tells === 1) b += 'd.duelStick(-0.2, 1, 0.1);';                                // side-step the first charge
        else if (tellK > c.holdFrom + 0.08 && !pressedTell) { b += 'key("Space");key("Space", true);'; pressedTell = true; }
      } else if (c.ai === 'rate') { b += i.dist < 1.5 ? 'key("Space");key("Space", true);' : 'd.duelStick(1, 0, 0.1);'; }
      else b += i.dist > 2.2 ? 'd.duelStick(0.6, 0.2, 0.1);' : 'd.duelStick(0, 0.35, 0.1);';
    } else if (c.phase === 'empoignade') {
      if (c.plan === 'attaque') {
        if (lastPlan !== 'attaque') { attacks++; pressedTell = false; hold(false); }
        const at = attacks === 1 ? c.counterFrom + 0.06 : c.holdFrom + 0.1;
        if (c.tellK > at && !pressedTell) { b += 'key("Space");key("Space", true);'; pressedTell = true; holding = false; }
      } else if (!wrongDone && c.open.hanche > 0.35) { hold(false); b += 'key("Digit3");'; wrongDone = true; }     // first, the wrong move: a Croc with him leaning forward
      else if (c.lit && c.open[c.lit] > 0.72 && c.stamina.opponent < 80) { hold(false); b += `key("Digit${['souleve', 'hanche', 'croc', 'pousse'].indexOf(c.lit) + 1}");`; }
      else if (c.plan === 'pousse') { hold(true); b += 'd.duelStick(-1, 0, 0.1);'; }
      else hold(false);
      lastPlan = c.plan;
    } else if (c.phase === 'projection') {
      hold(false); if (c.needle >= (c.z0 + c.z1) / 2) b += 'key("Space");key("Space", true);';
    } else hold(false);
  }
  await frame(b);
}
const end = await info();
console.log(JSON.stringify({ frames: n, errors, banners, end: end?.cine ?? end?.combat?.cine, phase: end?.phase, winner: end?.winner }));
fs.mkdirSync(mp4.replace(/\/[^/]+$/, ''), { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/f%04d.jpg`, '-vf', `scale=${vw}:${vh}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'veryfast', mp4]);
await browser.close();
