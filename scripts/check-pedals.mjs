// Touch pedals of a car (src/transport/ridePad.ts, src/transport/drive.ts pedalThrottle), portrait phone, REAL fingers (CDP touch): the joystick only steers, « Accélérer » and « Frein »
// are held with the right thumb at the same time as the stick; the brake never backs the car up from a stop (« R » does); coasting, braking, the camera button with a second finger.
// Usage: node scripts/check-pedals.mjs [baseUrl] [outDir]   (a running build; VEHICLE=compacte|berline|tout_terrain)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4213/', out = process.argv[3] ?? 'docs/screenshots/pedals';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const V = { compacte: { key: 'car', hub: 'plateau' }, berline: { key: 'berline', hub: 'almadies' }, tout_terrain: { key: 'suv', hub: 'almadies' } }[process.env.VEHICLE ?? 'compacte'];
const near = v => [-120, -60, 0, 60, 120].reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg), info = () => d(k => window.__dakar[k].info(), V.key), tr = await realTouch(page);
await page.goto(`${base}?debug&touch&heure=11`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
await d(h => window.__dakar.teleport(h), V.hub);
await page.waitForFunction(([h, k]) => window.__dakar.pos().hub === h && window.__dakar[k]?.info().dealer, [V.hub, V.key], T);
const dealer = (await info()).dealer, rx = near(dealer.x), rz = near(dealer.z), road = Math.abs(dealer.z - rz) < Math.abs(dealer.x - rx) ? { x: 0, z: Math.sign(rz - dealer.z) || 1 } : { x: Math.sign(rx - dealer.x) || 1, z: 0 };
await d(([p, r]) => window.__dakar.place(p.x + r.x * 0.7 + (r.x ? 0 : 0.4), p.z + r.z * 0.7 + (r.z ? 0 : 0.4), Math.atan2(-r.x, -r.z)), [dealer, road]);
await page.waitForFunction(() => /Voir les articles/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, T).catch(() => {});
await d(() => window.__dakar.act());
await page.waitForSelector('#modal.on', T);
const rows = await d(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent ?? ''));
check('the dealer menu leads with « Essayer gratuitement », the price row after it', /Essayer gratuitement/.test(rows[0] ?? '') && /Gratuit/.test(rows[0]) && /Acheter/.test(rows[1] ?? '') && /\sF/.test(rows[1]), JSON.stringify(rows.map(r => r.slice(0, 60))));
await page.locator('#modal .item', { hasText: 'Essayer gratuitement' }).first().click();
await page.waitForFunction(k => window.__dakar[k].info().here, V.key, T);
const c0 = await info();
await d(c => { const f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; window.__dakar.place(c.x - f.x * 3.3, c.z - f.z * 3.3, c.yaw); }, c0);
await page.waitForTimeout(1200);
await d(() => window.__dakar.act());
await page.waitForFunction(k => window.__dakar[k].info().driving, V.key, T);
await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, T);
await page.waitForTimeout(800);
const vis = await d(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y, shown: getComputedStyle(e).display !== 'none' }; }; return { gas: q('#ridepad .rp-gas'), brake: q('#ridepad .rp-brake'), joy: q('#joy'), off: q('#ridepad .rp-off'), rev: q('#ridepad .rp-rev'), view: q('#ridepad .rp-view') }; });
check('large GAS and BRAKE buttons on the right (≥ 90 px), the stick on the left, « Descendre » / « R » / « Vue » while stopped', vis.gas.w >= 100 && vis.brake.w >= 85 && vis.gas.x > 195 && vis.brake.x >= vis.joy.x + vis.joy.w && vis.gas.x >= vis.brake.x + vis.brake.w && vis.off.shown && vis.rev.shown && vis.view.shown, JSON.stringify(vis));
await page.screenshot({ path: `${out}/1-stopped.png` });
// the stick alone steers, it gives no throttle
{ const j = await tr.centre('#joy'); await tr.down(2, j.x, j.y); await tr.move(2, j.x, j.y - 45); await page.waitForTimeout(1500); const i = await info(); await tr.up(2); check('the stick pushed forward alone does not accelerate the car', Math.abs(i.speed) < 0.1 && Math.hypot(i.x - c0.x, i.z - c0.z) < 0.5, JSON.stringify({ speed: i.speed })); }
// the brake at a standstill: no reverse
{ const b0 = await info(); const p = await tr.centre('#ridepad .rp-brake'); await tr.down(1, p.x, p.y); await page.waitForTimeout(2500); const i = await info(); await tr.up(1); check('holding the brake at a standstill does not reverse the car', Math.abs(i.speed) < 0.05 && Math.hypot(i.x - b0.x, i.z - b0.z) < 0.1, JSON.stringify({ speed: i.speed, moved: Math.hypot(i.x - b0.x, i.z - b0.z) })); }
// gas and the stick at once, two thumbs
const y0 = (await info()).yaw;
{
  const g = await tr.centre('#ridepad .rp-gas'), j = await tr.centre('#joy');
  await tr.down(1, g.x, g.y); await page.waitForTimeout(1500);
  await tr.down(2, j.x, j.y); await tr.move(2, j.x + 32, j.y); await page.waitForTimeout(2500);
  const i = await info();
  check('gas (right thumb) and steering (left thumb) at the same time: the car speeds up and turns', i.speed > 2 && Math.abs(i.yaw - y0) > 0.15, JSON.stringify({ speed: +i.speed.toFixed(1), turned: +(i.yaw - y0).toFixed(2) }));
  await page.screenshot({ path: `${out}/2-gas-and-steer.png` });
  // the camera button with a second finger while the thumb stays on the gas
  await tr.up(2); const v0 = (await info()).view; await tr.tap('#ridepad .rp-view'); await page.waitForTimeout(600); const v1 = (await info()).view;
  check('« Vue » changes the camera with another finger while the gas is held', v0 !== v1, `${v0} → ${v1}`);
  await tr.tap('#ridepad .rp-view'); await tr.tap('#ridepad .rp-view'); await page.waitForTimeout(300);
  // coasting: letting go of the gas slows the car gradually (the headless renderer runs slower than real time, so the checks wait on speeds and compare how long they take)
  const timeTo = async (pred, arg, ms = 90000) => { const t = Date.now(); await page.waitForFunction(pred, arg, { timeout: ms }).catch(() => {}); return Date.now() - t; };
  const s0 = (await info()).speed; await tr.up(1);
  const tCoast = await timeTo(([k, v]) => { const s = window.__dakar[k].info().speed; return s < v * 0.7; }, [V.key, s0]);
  const sc = (await info()).speed;
  check('letting go of the gas coasts: the speed falls gradually, the car keeps rolling', s0 > 3 && sc < s0 * 0.75 && sc > 0.2 * s0, JSON.stringify({ s0: +s0.toFixed(1), later: +sc.toFixed(1), ms: tCoast }));
  // the brake stops it faster than coasting and then holds it, no reverse
  await tr.down(1, g.x, g.y); await timeTo(([k]) => window.__dakar[k].info().speed > 11, [V.key]); const sp = (await info()).speed; await tr.up(1);
  const pb = await tr.centre('#ridepad .rp-brake'); await tr.down(1, pb.x, pb.y);
  const tBrake = await timeTo(([k, v]) => window.__dakar[k].info().speed < v * 0.7, [V.key, sp]);
  await timeTo(([k]) => Math.abs(window.__dakar[k].info().speed) < 0.05, [V.key]); await page.waitForTimeout(2500); const sz = await info(); await tr.up(1);
  check('the brake slows faster than coasting, stops the car, and then holds it (no reverse)', tBrake < tCoast * 0.7 && Math.abs(sz.speed) < 0.05, JSON.stringify({ coastMs: tCoast, brakeMs: tBrake, end: +sz.speed.toFixed(2) }));
}
// reverse is a gear: « R », then the gas backs up; the brake slows it; « R » again goes back to forward
{
  const st = await info(); await page.waitForFunction(() => getComputedStyle(document.querySelector('#ridepad .rp-rev')).display !== 'none', null, T);
  await tr.tap('#ridepad .rp-rev'); await page.waitForTimeout(300);
  const on = await d(() => document.querySelector('#ridepad .rp-rev').classList.contains('on'));
  const g = await tr.centre('#ridepad .rp-gas'); await tr.down(1, g.x, g.y); await page.waitForTimeout(2200);
  const back = await info(); const f = { x: Math.sin(st.yaw), z: Math.cos(st.yaw) };
  const along = (back.x - st.x) * f.x + (back.z - st.z) * f.z;
  await tr.up(1);
  check('« R » selects reverse: the gas backs the car up', on && back.speed < -0.8 && along < -1, JSON.stringify({ on, speed: +back.speed.toFixed(2), along: +along.toFixed(1) }));
  await page.screenshot({ path: `${out}/3-reverse.png` });
  const pb = await tr.centre('#ridepad .rp-brake'); await tr.down(1, pb.x, pb.y); await page.waitForTimeout(3000); const z1 = await info(); await tr.up(1);
  check('in reverse the brake stops the car and does not send it forward', Math.abs(z1.speed) < 0.05, JSON.stringify({ speed: z1.speed }));
  await tr.tap('#ridepad .rp-rev'); await page.waitForTimeout(300);
  const off = await d(() => !document.querySelector('#ridepad .rp-rev').classList.contains('on'));
  const g2 = await tr.centre('#ridepad .rp-gas'); await tr.down(1, g2.x, g2.y); await page.waitForTimeout(1500); const fw = await info(); await tr.up(1);
  check('« R » again returns to forward: the gas drives forward', off && fw.speed > 0.8, JSON.stringify({ speed: +fw.speed.toFixed(2) }));
}
// getting off with « Descendre » once stopped (a finger, not a click)
{
  const pb = await tr.centre('#ridepad .rp-brake'); await tr.down(1, pb.x, pb.y); await page.waitForFunction(k => Math.abs(window.__dakar[k].info().speed) < 0.2, V.key, T); await tr.up(1);
  await page.waitForTimeout(300); await tr.tap('#ridepad .rp-off'); await page.waitForTimeout(800);
  const i = await info(), seated = await d(() => window.__dakar.seated());
  check('« Descendre » (a finger) gets the player out; the trial car goes back, nothing was bought', !i.driving && !i.here && seated === null && !i.owned, JSON.stringify({ driving: i.driving, here: i.here }));
}
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
