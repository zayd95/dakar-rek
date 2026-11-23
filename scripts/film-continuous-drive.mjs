// Films the round trip of the continuous drive with the REAL touch controls, on a phone-sized screen: the owner gets in the car in Almadies, drives south across the district border into
// the Corniche on the same wheels, stops and gets out; gets back in, turns round (a multi-point turn: the street is narrow), drives home across the border, stops and gets out.
// Every ~0.5 s of the car's own clock (and every ~1.5 s while on foot) a frame of the page is taken; ffmpeg makes the film. The numbers behind the film (the same car, the engine's level at
// each point, the camera's offset across each swap) are printed. SwiftShader runs a few frames a second: the film is paced by the game's clock, not by the wall's.
// Usage: node scripts/film-continuous-drive.mjs <baseUrl> <outDir> [saveJson]   (a running build; saveJson: a v6 save with the berline parked in Almadies, see below)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch, walkTo, pilot, turnAround } from './lib/realTouch.mjs';

const [base, out, saveFile] = process.argv.slice(2);
fs.mkdirSync(`${out}/frames`, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
if (saveFile) await ctx.addInitScript(s => { try { localStorage.setItem('dakarrek.guest.save.v6', s); localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } }, fs.readFileSync(saveFile, 'utf8'));
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (f, a) => page.evaluate(f, a), AT = () => d(() => window.__dakar.berline.at());
await page.goto(`${base}?debug&touch&heure=11`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.waitForFunction(() => window.__dakar.berline?.info().here, null, { timeout: 120000 });
const t = await realTouch(page);
const results = []; const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

// the film: frames taken on the car's clock while it is driven, on the wall's while the player is on foot
let n = 0, lastT = -1, lastMs = 0, filming = true; const log = [];
const filmer = (async () => {
  while (filming) {
    const a = await AT().catch(() => null), now = Date.now();
    if (a?.driving ? a.t - lastT >= 0.5 : now - lastMs >= 1500) {
      lastT = a?.t ?? lastT; lastMs = now;
      await page.screenshot({ path: `${out}/frames/f${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 72 }).catch(() => {});
      if (a?.driving) { const m = await d(() => ({ hub: window.__dakar.pos().hub, m: window.__dakar.berline.audioMeter?.(), a: window.__dakar.berline.audio() })).catch(() => null); if (m) log.push({ t: a.t, hub: m.hub, x: a.x, z: a.z, speed: a.speed, engine: m.a.running, meter: m.m }); }
    } else await page.waitForTimeout(60);
  }
})();

const info = await d(() => window.__dakar.berline.info()), car0 = info.record;
const seed0 = info.seed, paint0 = info.paint;
const getIn = async () => {
  const c = await AT() ?? info.record, L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) }, F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) };
  const me = await d(() => window.__dakar.pos());
  const spots = [[2.0, 0.4], [-2.0, 0.4], [1.6, -1.2], [-1.6, -1.2]].sort((a, b) => Math.hypot(c.x + L.x * a[0] + F.x * a[1] - me.x, c.z + L.z * a[0] + F.z * a[1] - me.z) - Math.hypot(c.x + L.x * b[0] + F.x * b[1] - me.x, c.z + L.z * b[0] + F.z * b[1] - me.z));
  for (const [side, along] of spots) {
    await walkTo(page, t, c.x + L.x * side + F.x * along, c.z + L.z * side + F.z * along, { tol: 0.9, ms: 40000 });
    if (await page.waitForFunction(() => window.__dakar.focus()?.id === 'berline:parked', null, { timeout: 6000 }).then(() => true, () => false)) break;
  }
  const f = await d(() => ({ focus: window.__dakar.focus()?.id ?? null, me: window.__dakar.pos(), car: window.__dakar.berline.at() }));
  console.log('getIn focus', JSON.stringify(f));
  await t.tap('#act');
  await page.waitForFunction(() => window.__dakar.berline.at().driving && document.body.classList.contains('ridepad'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
};
const getOut = async () => {
  await page.waitForFunction(() => Math.abs(window.__dakar.berline.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  await t.tap('#ridepad .rp-off');
  await page.waitForFunction(() => !window.__dakar.berline.at().driving && !window.__dakar.berline.info().exit, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
};
const frames = () => d(() => window.__frames);
const startLog = () => d(() => {
  window.__frames = [];
  const tick = () => { const A = window.__dakar, a = A.berline.at(), p = A.pos(), c = A.camera().at; window.__frames.push({ hub: p.hub, x: a.x, z: a.z, yaw: a.yaw, speed: a.speed, driving: a.driving, pad: document.body.classList.contains('ridepad'), engine: A.berline.audio().running, cam: c, mode: p.mode }); if (window.__frames.length < 60000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const swap = fr => { for (let i = 1; i < fr.length; i++) if (fr[i].hub !== fr[i - 1].hub) return i; return -1; };
const rel = f => { const s = Math.sin(f.yaw), c = Math.cos(f.yaw), dx = f.cam[0] - f.x, dz = f.cam[2] - f.z; return [dx * c - dz * s, f.cam[1], dx * s + dz * c]; };
const crossingChecks = (tag, fr, jump) => {
  const i = swap(fr); check(`${tag}: exactly one district change on the leg`, i > 0 && fr.filter((f, k) => k && f.hub !== fr[k - 1].hub).length === 1);
  if (i <= 0) return;
  const a = fr[i - 1], b = fr[i], around = fr.slice(Math.max(0, i - 40), i + 40), ra = rel(a), rb = rel(b);
  check(`${tag}: pose continuous, speed kept`, Math.abs(b.x - a.x) < 0.6 && Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))) < 0.1 && Math.hypot(b.x - a.x, b.z - jump - a.z) < Math.max(0.5, Math.abs(a.speed) * 0.12) + 1.2 && Math.abs(b.speed - a.speed) < 1 && a.speed > 3, JSON.stringify({ before: a.speed, after: b.speed }));
  check(`${tag}: driver's seat, touch pad and engine on every frame around the swap`, around.every(f => f.driving && f.pad && f.engine && f.mode === 'play'), `${around.length} frames`);
  check(`${tag}: the camera keeps its place behind the car`, Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]) < 1.2, JSON.stringify({ before: ra.map(v => +v.toFixed(2)), after: rb.map(v => +v.toFixed(2)) }));
};
const sameCar = async tag => { const i = await d(() => window.__dakar.berline.info()); check(`${tag}: the same car (colour seed, owned, parked in this district, one copy)`, i.owned && i.seed === seed0 && i.paint === paint0, JSON.stringify({ seed: i.seed, record: i.record })); return i; };

// leg 1: Almadies → Corniche (set-up only: the player stands a few metres from the car, on its driver's side)
await d(([x, z]) => window.__dakar.place(x, z, 0), [car0.x + Math.cos(car0.yaw) * 3, car0.z - Math.sin(car0.yaw) * 3]); await page.waitForTimeout(800);
await getIn(); await startLog();
await pilot(page, t, 'berline', [{ x: -60.4, z: car0.z + 12, tol: 3, speed: 4 }, { x: -60.4, z: 128, tol: 4 }, { x: -60.4, z: 170, tol: 4 }, { x: -60.4, z: 215, tol: 4 }], { cruise: 8, stall: 25000, brakeAtEnd: true });
let fr = await frames(); crossingChecks('out', fr, -240);
check('out: the brake stops the car after the crossing', Math.abs((await AT()).speed) < 0.3);
await getOut();
const leg1 = await d(() => ({ me: window.__dakar.pos(), car: window.__dakar.berline.at(), pad: document.body.classList.contains('ridepad'), engine: window.__dakar.berline.audio().running }));
check('out: « Descendre » leaves the player on foot beside the car in the Corniche, the pad gone, the engine stopped', leg1.me.hub === 'corniche' && !leg1.car.driving && !leg1.pad && !leg1.engine && Math.hypot(leg1.me.x - leg1.car.x, leg1.me.z - leg1.car.z) < 6, JSON.stringify({ hub: leg1.me.hub }));
await sameCar('out');
// leg 2: Corniche → Almadies
await getIn(); await startLog();
const turned = await turnAround(page, t, 'berline', Math.PI, { area: { x0: -65, x1: -55, z0: -118, z1: 118 } });
check('the car is turned round with the controls (lock, forward, « R », back) and faces the way home', Math.abs(Math.atan2(Math.sin(turned.yaw - Math.PI), Math.cos(turned.yaw - Math.PI))) < 0.35, JSON.stringify({ yaw: turned.yaw }));
await pilot(page, t, 'berline', [{ x: -60.4, z: turned.z - 10, tol: 4, speed: 3 }, { x: -60.4, z: -100, tol: 4 }, { x: -60.4, z: -128, tol: 3 }, { x: -60.4, z: -170, tol: 4 }, { x: -60.4, z: -215, tol: 4 }], { cruise: 8, stall: 25000, brakeAtEnd: true });
fr = await frames(); crossingChecks('home', fr, 240);
check('home: the brake stops the car after the crossing', Math.abs((await AT()).speed) < 0.3);
await getOut();
const home = await d(() => ({ me: window.__dakar.pos(), car: window.__dakar.berline.at(), pad: document.body.classList.contains('ridepad'), engine: window.__dakar.berline.audio().running }));
check('home: « Descendre » leaves the player on foot beside the car in Almadies, the pad gone, the engine stopped', home.me.hub === 'almadies' && !home.car.driving && !home.pad && !home.engine && Math.hypot(home.me.x - home.car.x, home.me.z - home.car.z) < 6, JSON.stringify({ hub: home.me.hub }));
const fin = await sameCar('home'); check('home: saved as parked in Almadies', fin.record?.hub === 'almadies');
filming = false; await filmer;
const meters = log.filter(l => l.meter && Number.isFinite(l.meter.rms ?? l.meter.db ?? l.meter));
console.log('engine meter samples', log.length, JSON.stringify(log.filter((l, k) => k % Math.max(1, Math.floor(log.length / 8)) === 0).map(l => [l.hub[0], Math.round(l.speed), l.engine, l.meter?.rms ?? l.meter?.db ?? l.meter ?? null])));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', `${out}/frames/f%05d.jpg`, '-vf', 'scale=390:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', `${out}/continuous-drive-roundtrip.mp4`]);
console.log(`${n} frames → ${out}/continuous-drive-roundtrip.mp4; ${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
