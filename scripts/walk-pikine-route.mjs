// Pikine Street DNA, phase 2: the walking walkthrough. A scripted walker holds "forward" on the game's real input while the
// game is paused and advanced by fixed steps (so frame-rate does not matter), steering by the camera yaw; the movement goes
// through the game's own collision (pushOut), so a blocked route shows as a walker that stops making progress. One iPhone-sized
// frame (390×844) per ~0.4 m walked, assembled into an mp4 by ffmpeg. Also reports every stall (no progress) on the way.
// Usage: [WALK=home] node scripts/walk-pikine-route.mjs [baseUrl] [outDir] [hour=11] [quality=medium]   (WALK=home: the home street, east of the room to the bank's flank)
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { HOME_PATH } from './pikine-route.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4323/', out = process.argv[3] ?? 'shots/pikine-walk', hour = Number(process.argv[4] ?? 11), quality = process.argv[5] ?? 'medium';
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(`${out}/frames`, { recursive: true });
// door → the avenue south past the gare → east along the road to the grand-place → into it → back, and west into the shops' court
const HOME = process.env.WALK === 'home';
const PATH = HOME ? HOME_PATH.slice(1) : [[-42, -59], [-60, -60], [-60, 60], [-26, 60], [-26, 86], [-26, 62], [-63, 62], [-63, 92], [-100, 92]];
const START = HOME ? { x: HOME_PATH[0][0], z: HOME_PATH[0][1] } : { x: -42, z: -56.5 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } }, quality);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.teleport('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
await page.evaluate(h => window.__dakar.setHour(h), hour); await page.waitForTimeout(2500);
await page.evaluate(([x, z, yaw]) => { const d = window.__dakar; d.place(x, z, yaw); d.pause(true); }, [START.x, START.z, HOME ? -Math.PI / 2 : Math.PI]);
await page.keyboard.down('ArrowUp');

const FRAMES_PER_STEP = 16, DT = 1 / 60;                      // 0.27 s of game time per shot
let n = 0, leg = 0, yaw = HOME ? -Math.PI / 2 : Math.PI, stalls = [], blockedFor = 0, last = null, walked = 0, gameSeconds = 0;
const trail = [];
while (leg < PATH.length && n < 2400) {
  const r = await page.evaluate(([yaw, frames, dt]) => { const d = window.__dakar; d.lookYaw(yaw); const p = d.step(dt, frames); d.render(); return p; }, [yaw, FRAMES_PER_STEP, DT]);
  const [tx, tz] = PATH[leg], dx = tx - r.x, dz = tz - r.z, dist = Math.hypot(dx, dz);
  if (dist < 1.0) { leg++; continue; }
  // steer: the camera yaw follows the heading to the next waypoint, a little at a time (a corner is a curve, not a cut)
  const want = Math.atan2(dx, dz); let da = want - yaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  yaw += Math.max(-0.22, Math.min(0.22, da));
  if (last) { const moved = Math.hypot(r.x - last.x, r.z - last.z); walked += moved; if (moved < 0.05) { blockedFor++; if (blockedFor === 6) stalls.push({ x: +r.x.toFixed(2), z: +r.z.toFixed(2), toward: PATH[leg] }); } else blockedFor = 0; }
  last = { x: r.x, z: r.z }; gameSeconds += FRAMES_PER_STEP * DT; trail.push([+r.x.toFixed(2), +r.z.toFixed(2)]);
  if (n % 1 === 0) await page.screenshot({ path: `${out}/frames/${String(n).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 72 });
  n++;
}
await page.keyboard.up('ArrowUp');
const done = leg >= PATH.length;
const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', `${out}/frames/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', `${out}/walkthrough.mp4`]);
fs.writeFileSync(`${out}/walk.json`, JSON.stringify({ hour, quality, completed: done, frames: n, metresWalked: Math.round(walked), gameSeconds: +gameSeconds.toFixed(1), stalls, errors, trail }, null, 1));
console.log(JSON.stringify({ completed: done, frames: n, metresWalked: Math.round(walked), gameSeconds: +gameSeconds.toFixed(1), stalls, errors: errors.length, mp4: enc.status === 0 }));
await browser.close();
