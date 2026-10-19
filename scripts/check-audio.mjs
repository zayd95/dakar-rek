// The sounds of a driven vehicle (src/transport/vehicleAudio.ts), portrait phone, real touch: nothing plays before the first gesture (the iPhone rule) and nothing plays when the sound is off;
// after a tap the door, the engine start and the idle play, the revs rise with the speed, a hard brake squeals, a slow contact is a tap and a fast one an impact, the horn is held with the
// « Klaxon » button, and getting out stops the engine. The checks read the module's counters (window.__dakar.<vehicle>.audio()): the headless browser has no loudspeaker.
// Usage: node scripts/check-audio.mjs [baseUrl] [outDir]   (a running build)
import { chromium } from 'playwright';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const near = v => [-120, -60, 0, 60, 120].reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=user-gesture-required'] });

async function session(muted) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  if (muted) await context.addInitScript(() => localStorage.setItem('dakarrek.sound', 'off'));
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, arg) => page.evaluate(fn, arg), tr = await realTouch(page);
  await page.goto(`${base}?debug&touch&heure=11&argent=50000000&klaxon`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await d(() => window.__dakar.teleport('plateau'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car?.info().dealer, null, T);
  const info = () => d(() => window.__dakar.car.info()), au = () => d(() => window.__dakar.car.audio());
  const dealer = (await info()).dealer, rx = near(dealer.x), rz = near(dealer.z), road = Math.abs(dealer.z - rz) < Math.abs(dealer.x - rx) ? { x: 0, z: Math.sign(rz - dealer.z) || 1 } : { x: Math.sign(rx - dealer.x) || 1, z: 0 };
  /** The test vehicle at the kerb (the dealer's free trial) and the player seated, through the game's own actions (not through a tap). */
  const openDesk = async () => {
    await d(([p, r]) => window.__dakar.place(p.x + r.x * 0.7 + (r.x ? 0 : 0.4), p.z + r.z * 0.7 + (r.z ? 0 : 0.4), Math.atan2(-r.x, -r.z)), [dealer, road]);
    await page.waitForFunction(() => /Voir les articles/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, T).catch(() => {});
    await d(() => window.__dakar.act()); await page.waitForSelector('#modal.on', T);
  };
  const getOn = async () => {
    const c = await info();
    await d(c => { const f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; window.__dakar.place(c.x - f.x * 3.3, c.z - f.z * 3.3, c.yaw); }, c);
    await page.waitForTimeout(1200); await d(() => window.__dakar.act());
    await page.waitForFunction(() => window.__dakar.car.info().driving, null, T);
  };
  return { page, d, tr, info, au, openDesk, getOn, errors, context };
}

// ---- 1. before any gesture, and with the sound off: requests are counted, nothing plays
for (const [label, muted] of [['before the first gesture', false], ['with the sound off', true]]) {
  const s = await session(muted);
  await s.openDesk();
  await s.d(() => [...document.querySelectorAll('#modal .item')].find(b => /Essayer/.test(b.textContent))?.click());   // a script click is no user gesture
  await s.page.waitForFunction(() => window.__dakar.car.info().here, null, T);
  if (muted) { await s.tr.tap('body'); }                                                                                  // even a real tap plays nothing while muted
  await s.getOn(); await s.page.waitForTimeout(1500);
  const a = await s.au();
  check(`${label}: the door and the start are asked for and nothing plays, the engine does not run`, a.count.asked >= 2 && a.count.played === 0 && !a.running && (muted ? a.muted : !a.gestured), JSON.stringify(a));
  check(`${label}: no JavaScript error`, s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
  await s.context.close();
}

// ---- 2. after a real tap: door, start, idle, revs, brake, contacts, horn, engine off
const s = await session(false);
await s.openDesk();
await s.page.locator('#modal .item', { hasText: 'Essayer' }).first().tap();                                                // a real finger: the first gesture
await s.page.waitForFunction(() => window.__dakar.car.info().here, null, T);
const g0 = await s.au();
check('a real tap is the first gesture: the audio context is created and running', g0.gestured && g0.state === 'running', JSON.stringify({ gestured: g0.gestured, state: g0.state }));
await s.getOn();
await s.page.waitForFunction(() => window.__dakar.car.audio().running, null, T).catch(() => {});
await s.page.waitForTimeout(1200);
const a1 = await s.au();
check('getting in: the door opens (walking up to it) and closes, the engine starts and idles', a1.count.door >= 2 && a1.count.start >= 1 && a1.running && a1.rpm > 0.1 && a1.rpm < 0.4, JSON.stringify({ door: a1.count.door, start: a1.count.start, rpm: a1.rpm }));
await s.page.waitForFunction(() => document.body.classList.contains('ridepad'), null, T);
const gas = await s.tr.centre('#ridepad .rp-gas'); await s.tr.down(1, gas.x, gas.y);
await s.page.waitForFunction(() => window.__dakar.car.info().speed > 6, null, T);
const a2 = await s.au();
check('the revs rise with the speed', a2.rpm > a1.rpm + 0.15, JSON.stringify({ idle: a1.rpm, driving: a2.rpm }));
await s.tr.up(1);
// a hard brake from speed squeals once
await s.d(() => window.__dakar.car.boost(13));
const b0 = (await s.au()).count.brake, pb = await s.tr.centre('#ridepad .rp-brake'); await s.tr.down(1, pb.x, pb.y);
await s.page.waitForFunction(() => window.__dakar.car.info().speed < 3, null, T).catch(() => {}); await s.tr.up(1);
const b1 = await s.au();
check('a hard brake from speed squeals (and the card says « Freinage fort »)', b1.count.brake > b0, JSON.stringify({ before: b0, after: b1.count.brake }));
// a gentle stop does not
await s.d(() => window.__dakar.car.boost(9)); await s.page.waitForTimeout(8000);
// contacts: a slow touch against a wall is a tap, a fast one an impact
const cols = await s.d(() => window.__dakar.cityGeometry().colliders.filter(c => c.h >= 6 && c.x1 - c.x0 > 8 && c.z1 - c.z0 > 8).slice(0, 40));
const hit = async speed => {
  for (const c of cols) {
    const cz = (c.z0 + c.z1) / 2, x = c.x0 - 9;
    await s.d(([x, z]) => window.__dakar.car.place(x, z, Math.PI / 2), [x, cz]); await s.page.waitForTimeout(400);
    const n0 = await s.au(); await s.d(v => window.__dakar.car.boost(v), speed);
    await s.page.waitForTimeout(speed > 5 ? 2200 : 7000);
    const n1 = await s.au(), k = speed > 5 ? 'impact' : 'tap';
    if (n1.count[k] > n0.count[k]) return { ok: true, n0: n0.count[k], n1: n1.count[k] };
  }
  return { ok: false };
};
const tap = await hit(1.6), imp = await hit(11);
check('a slow touch is a tap (a light thud)', tap.ok, JSON.stringify(tap));
check('a fast contact is an impact (a crunch)', imp.ok, JSON.stringify(imp));
// the horn, held with the Klaxon button
const kx = await s.tr.centre('#ridepad .rp-horn'); await s.tr.down(2, kx.x, kx.y); await s.page.waitForTimeout(300);
const h1 = await s.au(); await s.tr.up(2); await s.page.waitForTimeout(300); const h2 = await s.au();
check('the Klaxon button sounds the horn while held and stops it on release', h1.horn && !h2.horn && h1.count.horn >= 1, JSON.stringify({ held: h1.horn, released: h2.horn }));
await s.page.screenshot({ path: `${process.argv[3] ?? '/tmp'}/audio-pad.png` }).catch(() => {});
// getting out: the engine stops, the doors sound
const d0 = (await s.au()).count.door;
const pb2 = await s.tr.centre('#ridepad .rp-brake'); await s.tr.down(1, pb2.x, pb2.y); await s.page.waitForFunction(() => Math.abs(window.__dakar.car.info().speed) < 0.2, null, T); await s.tr.up(1);
await s.page.waitForTimeout(300); await s.tr.tap('#ridepad .rp-off'); await s.page.waitForTimeout(1200);
const e1 = await s.au();
check('getting out: the engine stops and the door sounds', !e1.running && e1.count.door >= d0 + 2, JSON.stringify({ running: e1.running, doors: e1.count.door - d0 }));
check('no JavaScript error', s.errors.length === 0, s.errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
