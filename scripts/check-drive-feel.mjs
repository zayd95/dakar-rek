// How the vehicles FEEL with the analog controls (src/transport/controls.ts), measured with REAL touch on the phone-sized page, on the Pikine ↔ Almadies road (about 1.5 km):
// the stick alone (a full push: the cruising speed), the stick with « Accélérer » held (the boosted range), the travel time of the whole road in game seconds for each, the brake
// that stops the car and, held at the standstill, backs it up gently (with the subtle « R » badge only while it really moves backwards and no reverse once let go), and a motorbike
// whose brake never reverses. The numbers go to the log: they are the evidence for the calibration (travel times, top speeds), not thresholds beyond sanity.
// Usage: node scripts/check-drive-feel.mjs <baseUrl> <outDir> <berlineSaveJson> <motoSaveJson>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, padDrive, boardVehicle } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const [base, out, berlineSave, motoSave] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const ROAD = 'pikine-almadies';
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

async function session(save, key) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([s, once]) => { try { if (!sessionStorage.getItem(once)) { localStorage.setItem('dakarrek.guest.save.v6', s); sessionStorage.setItem(once, '1'); } localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } }, [fs.readFileSync(save, 'utf8'), 'once']);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch&heure=11${process.env.TRAFFIC === '1' ? '' : '&notraffic'}`);       // empty roads by default: what the vehicle itself does (TRAFFIC=1 for the road's own traffic)
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
  await page.waitForFunction(k => window.__dakar[k]?.info().here, key, { timeout: 120000 });
  const t = await realTouch(page);
  return { ctx, page, t, errors, d: (f, a) => page.evaluate(f, a), AT: () => page.evaluate(k => window.__dakar[k].at(), key) };
}

/** Drives the whole road with the stick only (or the stick and « Accélérer »), logging the game clock and the speed; returns the travel time in game seconds and the speed profile. */
async function lap(S, key, boost, back = false) {
  const road = await S.d(id => { const p = window.__dakar.road.at(id, 0, 0), q = window.__dakar.road.project(p.x, p.z); return { length: q.length }; }, ROAD);
  const log = []; let t0 = null, t1 = null;
  // going out (Pikine → Almadies) the first leg only gets the car to the measured stretch; coming back it already stands at the Almadies end, turned round
  if (!back) await driveRoad(S.page, S.t, key, ROAD, 60, { cruise: 40, boost: false, brakeAtEnd: false, stall: 120000 });
  const a0 = await S.AT(); t0 = a0.t;
  await driveRoad(S.page, S.t, key, ROAD, back ? 60 : road.length - 60, { cruise: 40, boost, brakeAtEnd: true, stall: 120000, onTick: at => log.push([at.t, at.speed]) });
  t1 = log.length ? log[log.length - 1][0] : (await S.AT()).t;                       // the clock stops where the road's end is reached (the brake after it is not part of the journey)
  const sp = log.map(l => l[1]).sort((a, b) => a - b);
  void t0;
  return { secs: t1 - t0, metres: road.length - 120, top: sp[sp.length - 1] ?? 0, median: sp[Math.floor(sp.length / 2)] ?? 0 };
}

for (const [save, key, label] of [[berlineSave, 'berline', 'Berline'], [motoSave, 'moto', 'Jakarta']]) {
  const S = await session(save, key);
  const c0 = await S.AT();
  await S.d(([x, z]) => window.__dakar.place(x, z, 0), [c0.x + 3, c0.z]);
  await boardVehicle(S.page, S.t, key);
  // cruise: the stick alone; the first lap goes toward Almadies, then it is turned (set) and driven back with « Accélérer »
  const cruise = await lap(S, key, false);
  console.log(`${label}: stick alone ${cruise.metres.toFixed(0)} m in ${cruise.secs.toFixed(1)} game s (median ${cruise.median.toFixed(1)} m/s, top ${cruise.top.toFixed(1)} m/s)`);
  const spec = await S.d(k => window.__dakar[k].info().asset?.spec ?? null, key);
  check(`${label}: with the stick alone the whole road is a short journey (not a crawl): ${cruise.secs.toFixed(0)} s`, cruise.secs < (process.env.TRAFFIC === '1' ? 140 : 100) && cruise.secs > 45, JSON.stringify({ spec }));
  const a = await S.AT();
  await S.d(([x, z, yaw, k]) => window.__dakar[k].place(x, z, yaw), [a.x, a.z, a.yaw + Math.PI, key]);
  const boosted = await lap(S, key, true, true);
  console.log(`${label}: stick + Accélérer ${boosted.metres.toFixed(0)} m in ${boosted.secs.toFixed(1)} game s (median ${boosted.median.toFixed(1)} m/s, top ${boosted.top.toFixed(1)} m/s)`);
  check(`${label}: holding « Accélérer » is clearly faster (${boosted.secs.toFixed(0)} s against ${cruise.secs.toFixed(0)} s) and its top speed is higher (${boosted.top.toFixed(1)} against ${cruise.top.toFixed(1)} m/s)`, boosted.secs < cruise.secs * 0.85 && boosted.top > cruise.top * 1.2);

  // brake: stops; held at the standstill: a car backs up gently (R badge), a motorbike never does
  const here = await S.AT();
  await S.page.waitForTimeout(500);
  const brakeHold = async (ms) => { let minV = 0, badge = false, maxV = 0; await padDrive(S.page, S.t, { brake: true, hold: async () => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const at = await S.AT(); minV = Math.min(minV, at.speed); maxV = Math.max(maxV, at.speed); badge ||= await S.d(() => document.querySelector('#ridepad').classList.contains('reversing')); await S.page.waitForTimeout(150); } } }); return { minV, maxV, badge }; };
  const stopped = await S.AT();
  if (Math.abs(stopped.speed) > 0.3) { await S.t.down(4, ...(Object.values(await S.t.centre('#ridepad .rp-brake')))); await S.page.waitForFunction(k => Math.abs(window.__dakar[k].at().speed) < 0.2, key, { timeout: 60000 }).catch(() => {}); await S.t.up(4); }
  void here;
  const hold = await brakeHold(label === 'Berline' ? 9000 : 6000);
  if (label === 'Berline') {
    check(`${label}: the brake, held at the standstill, eases the car into a gentle reverse (min ${hold.minV.toFixed(2)} m/s, never faster than ${3} m/s)`, hold.minV < -0.6 && hold.minV > -3.2, JSON.stringify(hold));
    check(`${label}: the subtle « R » shows while it really reverses`, hold.badge);
    await S.page.waitForFunction(() => !document.querySelector('#ridepad').classList.contains('reversing'), null, { timeout: 20000 }).catch(() => {});
    const after = await S.AT();
    check(`${label}: the brake let go, the reverse stops and the « R » goes`, Math.abs(after.speed) < 0.2 && !(await S.d(() => document.querySelector('#ridepad').classList.contains('reversing'))), JSON.stringify({ v: after.speed }));
    check(`${label}: there is no separate R button`, (await S.d(() => document.querySelector('#ridepad .rp-rev'))) === null);
  } else {
    check(`${label}: the motorbike's brake never reverses it (min ${hold.minV.toFixed(2)} m/s) and shows no « R »`, hold.minV > -0.2 && !hold.badge, JSON.stringify(hold));
  }
  check(`${label}: no JavaScript errors`, S.errors.length === 0, S.errors.slice(0, 2).join(' | '));
  await S.ctx.close();
}
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
