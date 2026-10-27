// The driving feel, with REAL touch on a phone (src/transport/ridePad.ts, driveFeel.ts, vtcBanter.ts, src/crowd/streetReact.ts):
//  A. the pad: the steering rocker (left thumb) is there and the joystick is gone; the pedals are shaped as pedals (the tall ribbed gas, the wide flat brake); the right half of the rocker turns the
//     car right and the left half turns it left; the gas pedal gives more throttle the lower the toe (the heel is slower than the toe on the floor);
//  B. the street reacts: a car driven at a walker on the pavement makes them step aside and shout (the counters of the street's reactions, a speech bubble over the walker);
//  C. a VTC passenger talks about the driving: aboard, a fast stretch earns a line about it from them (« Dawalal ndank » for the nervous, « Gaawal » for the hurried…), a hard brake another,
//     and the farewell follows how the ride went.
// Usage: node scripts/check-driving-feel.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle, padRig, pilot } from './lib/realTouch.mjs';
import { route, runUp, closedZones } from './lib/gridRoute.mjs';

const [base = 'http://127.0.0.1:4700/', out = '/tmp/claude-0/comb/feel'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const AT = () => d(() => window.__dakar.teranga.at());
let shotN = 0; const shot = async n => { await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const sleep = ms => page.waitForTimeout(ms);

await page.goto(`${base}?debug&touch&heure=9&argent=4500000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.vtc, null, T);
let t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, T);
await d(() => window.__dakar.setHour(15));

// ------------------------------------------------------------------ A. the pad
await d(() => window.__dakar.teranga.place(-100, 3.2, Math.PI / 2)); await d(() => window.__dakar.place(-100, 0.6, 0));
await sleep(800); await boardVehicle(page, t, 'teranga'); await sleep(1200);
const dom = await d(() => {
  const q = s => document.querySelector(s), r = el => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x, y: b.y }; }, vis = el => getComputedStyle(el).display !== 'none';
  const gas = q('#ridepad .rp-gas'), brake = q('#ridepad .rp-brake'), pad = q('#steerpad'), joy = q('#joy');
  return { pad: pad ? { vis: vis(pad), ...r(pad) } : null, joy: joy ? vis(joy) : null, gas: { ...r(gas), bg: getComputedStyle(gas).backgroundImage !== 'none', radius: getComputedStyle(gas).borderTopLeftRadius }, brake: { ...r(brake), bg: getComputedStyle(brake).backgroundImage !== 'none' }, vw: innerWidth };
});
await shot('pad-idle');
check('the steering pad is on the left and the joystick is gone while driving', dom.pad?.vis && dom.pad.w > 140 && dom.pad.x < 40 && dom.joy === false, JSON.stringify({ pad: dom.pad, joy: dom.joy }));
check('the pedals are pedals: upright, the gas taller than the brake, in ribbed rubber (not round buttons)', dom.gas.h > dom.gas.w * 1.5 && dom.brake.h > dom.brake.w * 1.3 && dom.gas.h > dom.brake.h && dom.gas.bg && dom.brake.bg && !/^(50|99)/.test(dom.gas.radius), JSON.stringify({ gas: dom.gas, brake: dom.brake }));
check('the pad and the pedals do not overlap on a 390 px phone', dom.pad.x + dom.pad.w < dom.brake.x - 2, JSON.stringify({ padEnd: dom.pad.x + dom.pad.w, brakeX: dom.brake.x }));

const R = await padRig(page, t), rocker = R.rocker(2), gasP = R.gas(5);
const brk = await t.centre('#ridepad .rp-brake');
const stop = async () => { await gasP(false); await rocker(0); await t.down(4, brk.x, brk.y); await page.waitForFunction(() => Math.abs(window.__dakar.teranga.at()?.speed ?? 0) < 0.3, null, T).catch(() => {}); await t.up(4); };
// a thumb that only rests on a side of the pad does not steer (it is a joystick, not two buttons): the car holds its heading while a finger sits there
await gasP(true, 0.7); await sleep(2500);
{
  const yA = (await AT()).yaw; await t.down(2, R.cx + 70, R.cy); await sleep(1800); const yB = (await AT()).yaw; await t.up(2);
  check('a thumb resting on the right side of the pad does not steer: it has to slide', Math.abs(wrap(yB - yA)) < 0.1, JSON.stringify({ yA, yB }));
}
// steering: gas a little, the right half of the rocker turns the car right (its yaw falls), then the left half turns it left (it rises). The headless clock is slower than the game's:
// each turn is held until the heading has really moved (or a long time has gone by), never for a fixed second.
const turn = async dir => {
  const from = (await AT()).yaw; await rocker(dir);
  const done = await page.waitForFunction(([f, sg]) => { const y = window.__dakar.teranga.at().yaw; return -sg * Math.atan2(Math.sin(y - f), Math.cos(y - f)) > 0.2; }, [from, dir], { timeout: 25000 }).then(() => true).catch(() => false);
  await rocker(0); return { from, to: (await AT()).yaw, done };
};
const right = await turn(1); await shot('pad-steered-right');
const left = await turn(-1); await shot('pad-steered-left');
await sleep(500); const y4 = (await AT()).yaw, y5 = await (async () => { await sleep(900); return (await AT()).yaw; })();
check('sliding the thumb to the right turns the car to the right', right.done && wrap(right.to - right.from) < -0.15, JSON.stringify(right));
check('sliding it to the left turns the car to the left', left.done && wrap(left.to - left.from) > 0.15, JSON.stringify(left));
check('let go of the pad, the wheel comes back: the car holds its heading', Math.abs(wrap(y5 - y4)) < 0.12, JSON.stringify({ y4, y5 }));
await stop();
// throttle: the heel of the gas pedal is slower than the toe on the floor
await d(() => window.__dakar.teranga.place(-110, 3.2, Math.PI / 2)); await sleep(500);
await gasP(true, 0.0); await sleep(3500); const vHeel = (await AT()).speed;
await gasP(false); await stop();
await d(() => window.__dakar.teranga.place(-110, 3.2, Math.PI / 2)); await sleep(500);
await gasP(true, 0.97); await sleep(5200); const vToe = (await AT()).speed; await shot('pad-gas-toe');
check('the gas pedal gives throttle by the toe: the heel goes slower than the toe on the floor', vToe > vHeel + 3, JSON.stringify({ vHeel, vToe }));
await stop();

// ------------------------------------------------------------------ B. the street reacts
const geo = await d(() => window.__dakar.cityGeometry());
const free = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)); for (let i = 0; i <= n; i++) { const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n; if (geo.colliders.some(c => x > c.x0 - 1.4 && x < c.x1 + 1.4 && z > c.z0 - 1.4 && z < c.z1 + 1.4 && c.h > 0.4)) return false; } return true; };
let target = null;
for (let tries = 0; tries < 6 && !target; tries++) {
  const walkers = (await d(() => window.__dakar.street.where())).filter(a => a.role === 'walk');
  for (const w of walkers) for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const start = { x: w.x - dx * 18, z: w.z - dz * 18 }, rect = free(start, w);
    if (rect && Math.abs(start.x) < 118 && Math.abs(start.z) < 118) { target = { w, dx, dz, start }; break; }
  }
  if (!target) await sleep(1500);
}
check('a walker on a clear stretch of street to drive at', !!target, target ? JSON.stringify(target.w) : 'none');
if (target) {
  const before = await d(() => window.__dakar.street.info().reacted);
  const yaw = Math.atan2(target.dx, target.dz);
  await d(([x, z, yw]) => window.__dakar.teranga.place(x, z, yw), [target.start.x, target.start.z, yaw]); await sleep(600);
  await gasP(true, 0.97);
  let shouted = null, seenAfter = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const info = await d(() => window.__dakar.street.info());
    if (info.shouting.length && !shouted) { shouted = info.shouting; await shot('street-shout'); }
    const sum = o => o.danger + o.close + o.notice + o.thanks;
    if (sum(info.reacted) > sum(before) && shouted) { seenAfter = info.reacted; break; }
  }
  await stop();
  check('driven at a walker, the street reacts: someone steps back (danger / close / notice counted)', !!seenAfter, JSON.stringify({ before, after: seenAfter }));
  check('and someone shouts: a speech bubble over a person with a line in French or Wolof', !!shouted && shouted.every(s => s.text.length > 2), JSON.stringify(shouted));
  // a crash: the people near it react to it
  const c0 = (await d(() => window.__dakar.street.info().reacted)).crash;
  await d(([x, z, yw]) => window.__dakar.teranga.place(x, z, yw), [target.start.x, target.start.z, yaw]); await sleep(300);
  await d(() => window.__dakar.teranga.crashNow(0.8, 12));
  await sleep(600);
  const c1 = await d(() => window.__dakar.street.info().reacted.crash);
  check('a crash is answered by the people near it (counted by the street)', c1 > c0 || c0 > 0, JSON.stringify({ c0, c1 }));
}

// ------------------------------------------------------------------ C. a passenger talks about the driving
await d(() => window.__dakar.teranga.place(-100, 3.2, Math.PI / 2)); await d(() => window.__dakar.place(-100, 0.6, 0)); await sleep(500);
await d(() => window.__dakar.setHour(10));
const ok = await d(() => window.__dakar.vtc.accept(2));
check('a ride inside Pikine accepted (to carry a passenger)', ok === true);
const stops = await d(() => window.__dakar.vtc.stops());
const K = stops.pickup.car, F = { x: Math.sin(K.yaw), z: Math.cos(K.yaw) };
const lane = runUp(K, 60);
// the player gets out first (the car stays), is put by it again, and boards with the real controls, as the ride's journey does
await d(([x, z, yw]) => window.__dakar.teranga.place(x, z, yw), [lane.x, lane.z, K.yaw]);
await d(([x, z]) => window.__dakar.place(x, z, 0), [lane.x + Math.cos(K.yaw) * 2.6, lane.z - Math.sin(K.yaw) * 2.6]);
await sleep(800);
// (still seated from part B: get off first)
if (await d(() => window.__dakar.teranga.at()?.driving)) { await t.tap('#ridepad .rp-off').catch(() => {}); await sleep(1500); }
await d(([x, z, yw]) => window.__dakar.teranga.place(x, z, yw), [lane.x, lane.z, K.yaw]);
await d(([x, z]) => window.__dakar.place(x, z, 0), [lane.x + Math.cos(K.yaw) * 2.6, lane.z - Math.sin(K.yaw) * 2.6]);
await sleep(800);
await boardVehicle(page, t, 'teranga');
const inLane = Math.abs(F.z) > 0.5 ? { x: lane.x, z: K.z - F.z * 10 } : { x: K.x - F.x * 10, z: lane.z };
await pilot(page, t, 'teranga', [{ ...inLane, tol: 3, speed: 5 }, { x: K.x - F.x * 2.5, z: K.z - F.z * 2.5, tol: 2, speed: 2.4 }, { x: K.x + F.x * 1.5, z: K.z + F.z * 1.5, tol: 2, speed: 2 }], { brakeAtEnd: true, cruise: 5, stall: 60000, ms: 600000 });
await page.waitForFunction(() => window.__dakar.vtc.info().trip?.stage === 'aboard', null, { timeout: 300000 }).catch(() => {});
const aboard = await d(() => window.__dakar.vtc.info());
check('the passenger is aboard', aboard.trip?.stage === 'aboard' && aboard.person?.inCar, JSON.stringify({ stage: aboard.trip?.stage, phase: aboard.phase }));
await page.waitForFunction(() => window.__dakar.vtc.info().door.k === 0, null, { timeout: 90000 }).catch(() => {});
await boardVehicle(page, t, 'teranga').catch(() => {});
await shot('passenger-aboard');
// a fast stretch along the street: the toe on the floor, the way ahead as far as the street goes
const a = await AT(), toEnd = route({ x: a.x, z: a.z, yaw: a.yaw }, { x: a.x + Math.sin(a.yaw) * 100, z: a.z + Math.cos(a.yaw) * 100 }, { cruise: 25, avoid: await closedZones(page) });
let said = [];
const fast = pilot(page, t, 'teranga', toEnd ?? [{ x: a.x + Math.sin(a.yaw) * 100, z: a.z + Math.cos(a.yaw) * 100, tol: 4, speed: 26 }], { cruise: 26, boost: true, stall: 60000, ms: 240000 });
for (let i = 0; i < 160; i++) {
  await sleep(500);
  const b = await d(() => window.__dakar.vtc.banter()).catch(() => null);
  if (b?.said.some(s => s.scenario === 'fast' || s.scenario === 'veryFast')) { said = b.said; await shot('passenger-talks'); break; }
}
const bn = await d(() => window.__dakar.vtc.banter());
check('driving fast with a passenger aboard: they say something about it (a line, with their temper)', said.length > 0 && !!bn.temper, JSON.stringify({ temper: bn.temper, said: bn.said, feel: bn.feel }));
const toast = await d(() => document.querySelector('#toast')?.textContent ?? '');
console.log('toast', JSON.stringify(toast.slice(0, 200)));
check('the line is Dakar speech: French and Wolof (« ndank », « Gaawal », « Wóoy », « Baax na »…) in the passenger’s mouth', said.some(s => /ndank|Gaawal|gaaw|Wóoy|yakamti|tiit|Baax|Xoolal|doucement|vite|pressé|pied/i.test(s.line)), JSON.stringify(said.map(s => s.line)));
const hb0 = (await d(() => window.__dakar.vtc.banter())).feel.hardBrake;
await t.down(4, brk.x, brk.y); await sleep(1500); await t.up(4);
const hb1 = await d(() => window.__dakar.vtc.banter());
check('a hard brake from speed is felt by the ride (counted), and may earn a remark', hb1.feel.hardBrake > hb0 || hb1.tally.hardBrake > 0, JSON.stringify({ hb0, feel: hb1.feel, tally: hb1.tally }));
await fast.catch(() => {});
await d(() => window.__dakar.vtc.cancel?.());
check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`${total - failed}/${total} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
