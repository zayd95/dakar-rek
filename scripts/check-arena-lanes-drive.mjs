// Driving past the arena (Pikine) with real touch, both ways: the player's car (Teranga) along the street north of the arena (z = 0) east then west,
// through the junctions at both its corners, and the Jakarta down the arena's west street (x = 0) south then north, past the « Arène » stop and through
// the junctions at (0, 0) and (0, −60). Each run checks that nothing stopped the vehicle (no impact, never below 0.8 m/s once going) and logs, for any
// impact, what the drive's own test finds solid just ahead (scripts/probe-arena-lanes.mjs does the exhaustive sweep). Films itself (MP4, silent).
// Headless Chromium + SwiftShader: a software renderer, NOT a phone.
//
// Usage: node scripts/check-arena-lanes-drive.mjs <baseUrl> <outDir> [hour=11]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch, pilot, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4641/', out = '/tmp/claude-0/beta/world/arena-drive', hour = '11'] = process.argv.slice(2);
fs.mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: viewport } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 600)}`); };
await page.goto(`${base}?debug&touch&heure=${hour}&argent=100000000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'pikine' && window.__dakar.teranga?.info().floor.length > 0, null, { timeout: 240000 });
const t = await realTouch(page);
await d(() => { window.__dakar.teranga.own(); window.__dakar.moto.own(); });
await page.waitForFunction(() => ['teranga', 'moto'].every(k => window.__dakar[k].info().owned && window.__dakar[k].info().here), null, { timeout: 120000 });

/** Samples the vehicle while it drives (position, speed). */
function sampler(key) {
  const s = { at: [], stop: false };
  (async () => { while (!s.stop) { try { const a = await d(k => window.__dakar[k].at(), key); if (a) s.at.push(a); await page.waitForTimeout(250); } catch { if (page.isClosed()) return; } } })();
  return s;
}
const getOff = async key => { await t.tap('#ridepad .rp-off'); await page.waitForFunction(k => !window.__dakar[k].info().driving && window.__dakar.pos().mode === 'play', key); };

/** One drive: placed at `from` heading `yaw`, boarded with a real finger, driven through `pts`; what held it, if anything. */
async function drive(key, name, from, yaw, pts, board = true) {
  await d(([k, x, z, y]) => window.__dakar[k].place(x, z, y), [key, from.x, from.z, yaw]);
  if (board) { await d(([x, z, y]) => window.__dakar.place(x + Math.cos(y) * 2.4, z - Math.sin(y) * 2.4, y), [from.x, from.z, yaw]); await page.waitForTimeout(600); await boardVehicle(page, t, key); }
  await page.waitForTimeout(500);
  await d(k => window.__dakar[k].feelReset(), key);
  const s = sampler(key);
  const last = await pilot(page, t, key, pts.map(p => ({ ...p, tol: 3, speed: 7 })), { cruise: 7, stall: 15000, brakeAtEnd: true });
  s.stop = true;
  const end = pts[pts.length - 1], felt = await d(k => window.__dakar[k].feel(), key);
  const going = s.at.findIndex(a => a.speed > 3), mid = going < 0 ? [] : s.at.slice(going).filter(a => Math.hypot(a.x - end.x, a.z - end.z) > 12);
  const low = mid.length ? mid.reduce((b, a) => (a.speed < b.speed ? a : b)) : null;
  const why = [];
  for (const i of felt.impacts) { const at = i.x !== undefined ? i : low; if (at) why.push(await d(([k, x, z, y]) => { const w = window.__dakar[k].solidAt(x + Math.sin(y) * 2.2, z + Math.cos(y) * 2.2, 0.9); return w && { why: w.why, foot: w.foot, rect: w.rect }; }, [key, at.x, at.z, at.yaw ?? yaw])); }
  check(`${name}: driven to the end, nothing unseen on the way`, Math.hypot(last.x - end.x, last.z - end.z) < 5 && felt.impacts.length === 0 && (!low || low.speed > 0.8),
    JSON.stringify({ end: [last.x, last.z], slowest: low && { speed: low.speed, at: [low.x, low.z] }, impacts: felt.impacts, why }));
  await page.screenshot({ path: `${out}/${name.replace(/[^a-z0-9]+/gi, '-')}.jpg`, quality: 70 });
  return last;
}

// the car: east along the street north of the arena (its lane z = +2.1), through (0, 0) and (60, 0), then back west (z = −2.1)
await drive('teranga', 'car east, north of the arena', { x: -34, z: 2.1 }, Math.PI / 2, [{ x: -10, z: 2.1 }, { x: 30, z: 2.1 }, { x: 76, z: 2.1 }]);
await drive('teranga', 'car west, north of the arena', { x: 80, z: -2.1 }, -Math.PI / 2, [{ x: 50, z: -2.1 }, { x: 10, z: -2.1 }, { x: -34, z: -2.1 }], false);
await getOff('teranga');
// the Jakarta: south down the arena's west street (its lane x = +2.1), past the « Arène » stop, through (0, 0) and (0, −60), then back north (x = −2.1)
await drive('moto', 'Jakarta south, west of the arena', { x: 2.1, z: 22 }, Math.PI, [{ x: 2.1, z: -10 }, { x: 2.1, z: -50 }, { x: 2.1, z: -96 }]);
await drive('moto', 'Jakarta north, west of the arena', { x: -2.1, z: -100 }, 0, [{ x: -2.1, z: -66 }, { x: -2.1, z: -20 }, { x: -2.1, z: 22 }], false);
await getOff('moto');

fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, hour, failed, results, errors: errors.slice(0, 10) }, null, 1));
const raw = page.video() ? await page.video().path() : null;
await context.close(); await browser.close();
if (raw) { try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-vf', 'setpts=0.5*PTS,scale=360:-2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '32', '-preset', 'veryfast', '-movflags', '+faststart', `${out}/drive-past-arena-h${hour}.mp4`]); } catch (e) { console.log('ffmpeg', e.message); } }
console.log(`${results.length - failed}/${results.length} passed`, errors.length ? `page errors: ${errors.slice(0, 3).join(' / ')}` : '');
process.exit(failed ? 1 : 0);
