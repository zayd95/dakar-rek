// A video of the new bout (docs/wrestling/combat/combat-bout.mp4) and a frame strip: the game stepped frame by frame at
// 30 fps (`__dakar.pause` / `step` / `render`), so the clip plays at its real speed whatever SwiftShader's frame rate;
// phone portrait 390×844, Medium, the Roi des Arènes bodies. Two scenes, set up with the checks' hooks and then played by the
// rules: the walk-in and the dive to the belt, the empoignade, a combo (pull → pivot → hip) and the fall with the referee;
// then Gora's signature croc as a « super » (the camera swings round), the player thrown.
// Usage: flock -o /tmp/dakar-browser.lock node scripts/video-combat.mjs <baseUrl> <framesDir> [out.mp4] [strip.jpg]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [,, base = 'http://127.0.0.1:5311/', dir = 'out/frames', mp4 = 'docs/wrestling/combat/combat-bout.mp4', strip = 'docs/wrestling/combat/combat-strip.jpg'] = process.argv;
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(launch);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${base}?debug&touch&lamb2&rdabody=force`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dakar && window.__dakar.pos().hub);
await page.waitForFunction(() => window.__dakar.rda().ready, null, { timeout: 120000 }).catch(() => {});
await page.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine');
await page.waitForTimeout(3000);
const D = (fn, a) => page.evaluate(fn, a);
let n = 0; const marks = {};
/** One frame: 1/30 s of game, drawn, the banners' CSS animations advanced by the same time, captured. */
async function frame(before) {
  await D(b => {
    const d = window.__dakar;
    if (b) new Function('d', b)(d);
    d.step(1 / 30); d.render();
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = (a.currentTime ?? 0) + 1000 / 30; }
  }, before ?? '');
  await page.screenshot({ path: `${dir}/f${String(n++).padStart(4, '0')}.jpg`, quality: 80 });
}
const info = () => D(() => window.__dakar.duelInfo());
async function until(cond, max, before) { for (let k = 0; k < max; k++) { await frame(before); if (cond(await info())) return true; } return false; }
async function frames(k, before) { for (let i = 0; i < k; i++) await frame(before); }

// scene 1: the bell, the walk-in, the dive to the belt, the empoignade, a combo and the hip
await D(() => window.__dakar.duelStart('amical', 'costaud', 'sans_frappe', 'Gora'));
await page.waitForFunction(() => !!window.__dakar.duelInfo());
await D(() => window.__dakar.pause(true));
marks.bell = n; await until(i => i.phase === 'fight', 150);
await D(() => window.__dakar.duelHold(true));
await frames(10);
marks.walk = n; await until(i => i.dist < 1.5, 120, 'd.duelStick(1, 0, 0.2)');
await D(() => window.__dakar.duelReach('hold'));
marks.dive = n; await until(i => i.phase === 'clinch', 60);
await frames(20);
marks.clinch = n;
await frames(18, 'd.duelStick(1, 0, 0.2)');                                // he is driven back
await frames(10);
await D(() => window.__dakar.duelSet('player', { hold: ['bras', 75], stamina: 100 }));
marks.combo = n;
await until(i => i.clinch?.last?.move === 'pull', 45, 'd.duelStick(-1, 0, 0.2)');
await frames(8);
await until(i => i.clinch?.last?.move === 'pivot', 45, 'd.duelStick(0.2, 1, 0.2)');
await frames(8);
await D(() => { window.__dakar.duelSet('opponent', { balance: 62, lean: [1, 0.15] }); window.__dakar.duelGrab(); });
marks.throw = n; await until(i => i.phase === 'fall', 60);
marks.fall = n; await frames(130);
const end1 = await info();
await D(() => { window.__dakar.duelFinish(); window.__dakar.step(1 / 30); });
await D(() => { window.__dakar.pause(false); });
await page.waitForFunction(() => !window.__dakar.duelInfo(), null, { timeout: 30000 }).catch(() => {});

// scene 2: Gora's signature throw (costaud: the croc) as a « super »
await D(() => window.__dakar.duelStart('amical', 'costaud', 'sans_frappe', 'Gora'));
await page.waitForFunction(() => !!window.__dakar.duelInfo());
await D(() => window.__dakar.pause(true));
await until(i => i.phase === 'fight', 150);
await D(() => window.__dakar.duelHold(true));
await until(i => i.dist < 1.4, 120, 'd.duelStick(1, 0, 0.2)');
await D(() => window.__dakar.duelReach('tap'));
await until(i => i.phase === 'clinch', 60);
await frames(15);
await D(() => { window.__dakar.duelSet('opponent', { hold: ['ceinture', 80] }); window.__dakar.duelSet('player', { balance: 50, lean: [-1, 0], stamina: 60 }); window.__dakar.duelAiThrow('croc'); });
marks.special = n; await until(i => i.phase === 'fall', 60);
await frames(110);
const end2 = await info();
await browser.close();

// the clip (H.264, 30 fps) and the strip (eight moments side by side)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/f%04d.jpg`, '-vf', 'scale=390:844', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'veryfast', mp4]);
const pick = [marks.walk + 20, marks.dive + 8, marks.clinch + 10, marks.combo + 30, marks.throw + 8, marks.fall + 20, marks.special + 10, marks.special + 40].map(k => `${dir}/f${String(Math.min(n - 1, k)).padStart(4, '0')}.jpg`);
execFileSync('convert', [...pick, '-resize', '50%', '+append', '-quality', '70', strip]);
console.log(JSON.stringify({ frames: n, seconds: +(n / 30).toFixed(1), marks, scene1: { outcome: end1?.outcome, throw: end1?.lastThrow, combo: end1?.combat?.combos, banner: end1?.combat?.banner }, scene2: { lastThrow: end2?.lastThrow, banner: end2?.combat?.banner }, errors: errors.slice(0, 3) }));
