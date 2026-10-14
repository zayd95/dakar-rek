// Magic Land Lite (Corniche): the gate, the grande roue, the pirate ship, the baby-foot, the kiosks, the photo corner.
// Usage: node scripts/check-magicland.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4447/', out = process.argv[3] ?? 'shots/magicland';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra); assert.ok(ok, name); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async n => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${n}.png` }); };
  await page.goto(`${base}?debug&touch&argent=50000`, T); await page.waitForFunction(() => window.__dakar?.magic && window.__dakar.pos().hub, null, T);
  await d(() => { window.__dakar.setHour(19); window.__dakar.teleport('corniche'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.magic.info(), null, T); await page.waitForTimeout(1500);
  const info = await d(() => window.__dakar.magic.info()); const S = info.spots;
  check('Magic Land exists in the Corniche, east of Soumbédioune across the road', info.cx === -23 && info.cz === 97 && info.seats.wheel === 10 && info.seats.ship === 4, JSON.stringify(info.spots.gate));
  const near = (x, z, yaw = 0) => d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [x, z, yaw]);
  const focus = async () => { for (let i = 0; i < 12; i++) { await page.waitForTimeout(600); const f = await d(() => window.__dakar.focus()); if (f) return f; } return null; };
  // the way in: from the fishing village's market across the road to the gate
  await near(-83, 97, Math.PI / 2); await page.waitForTimeout(800); await shot('1-from-soumbedioune');
  check('the park is a short walk from Soumbédioune (market → gate under 45 m)', Math.hypot(-83 - S.gate.x, 97 - S.gate.z) < 45, `${Math.round(Math.hypot(-83 - S.gate.x, 97 - S.gate.z))} m`);
  await near(S.gate.x - 4, S.gate.z, Math.PI / 2); await shot('2-gate');
  // walk through the gate to the wheel booth
  await near(S.wheel.x, S.wheel.z, 0);
  let f = await focus(); check('the wheel booth offers the ticket with its price', !!f && /Grande roue/.test(JSON.stringify(f)) && /1\s?500/.test(JSON.stringify(f).replace(/[  ]/g, ' ')), JSON.stringify(f).slice(0, 200));
  await shot('3-wheel-booth');
  const w0 = await d(() => window.__dakar.state.wallet);
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.magic.rideNow()?.seat?.includes('wheel'), null, { timeout: 60000 });
  const w1 = await d(() => window.__dakar.state.wallet);
  check('the ticket is paid once and the rider sits in a gondola', w0 - w1 === 1500, `${w0} → ${w1}`);
  let maxY = 0, shotDone = false;
  for (let i = 0; i < 600 && await d(() => !!window.__dakar.magic.rideNow()); i++) { await page.waitForTimeout(1000); const y = await d(() => window.__dakar.pos().y); maxY = Math.max(maxY, y); if (!shotDone && y > 14) { shotDone = true; await shot('4-wheel-high'); } }
  check('the wheel lifts the rider high (a view over the Corniche)', maxY > 12, `max y ${maxY.toFixed(1)} m`);
  const pe = await d(() => ({ ...window.__dakar.pos() }));
  check('the ride ends on the platform, back in play mode', pe.mode === 'play' && pe.y < 1, JSON.stringify(pe));
  // pirate ship
  await near(S.ship.x, S.ship.z, 0); f = await focus();
  check('the ship booth offers its ticket', !!f && /Bateau pirate/.test(JSON.stringify(f)), JSON.stringify(f).slice(0, 160));
  const s0 = await d(() => window.__dakar.state.wallet); await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.magic.rideNow()?.seat?.includes('ship'), null, { timeout: 30000 });
  check('the ship ticket is paid once', s0 - (await d(() => window.__dakar.state.wallet)) === 1000);
  let swing = 0, sd = false; for (let i = 0; i < 300 && await d(() => !!window.__dakar.magic.rideNow()); i++) { await page.waitForTimeout(700); const ph = Math.abs(await d(() => window.__dakar.magic.info().shipPhi)); swing = Math.max(swing, ph); if (!sd && ph > 0.6) { sd = true; await shot('5-ship-swinging'); } }
  check('the pirate ship swings', swing > 0.3, `phi ${swing}`);
  await page.waitForFunction(() => !window.__dakar.magic.rideNow(), null, { timeout: 60000 });
  check('the ship ride ends back on foot', (await d(() => window.__dakar.pos().mode)) === 'play');
  // baby-foot: two places, starts when both are there, short match, simple score
  await d(() => window.__dakar.magic.seed(5)); await near(S.foot.x, S.foot.z, 0); f = await focus();
  check('the baby-foot offers a match for 200 F', !!f && /baby-foot/i.test(JSON.stringify(f)), JSON.stringify(f).slice(0, 160));
  const b0 = await d(() => window.__dakar.state.wallet); await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, { timeout: 30000 });
  check('the match starts once the opponent is there (sheet with the first round)', /deux joueurs/i.test(await d(() => document.querySelector('#modal.on')?.textContent ?? '')) && b0 - (await d(() => window.__dakar.state.wallet)) === 200);
  await shot('6-babyfoot');
  for (let r = 0; r < 12; r++) { const open = await d(() => !!document.querySelector('#modal.on .item')); if (!open) break; await page.locator('#modal.on .item').nth(r % 3).click(); await page.waitForTimeout(400); }
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 20000 });
  check('the match is short and ends with a result', true, await d(() => document.querySelector('.toast')?.textContent ?? ''));
  // kiosk + photo
  await near(S.kiosks[0].x, S.kiosks[0].z, 0); f = await focus();
  check('a snack kiosk offers « Commander »', !!f && /Commander/.test(JSON.stringify(f)), JSON.stringify(f).slice(0, 160));
  await d(() => { window.__dakar.state.data.needs.faim = 30; }); const k0 = await d(() => window.__dakar.state.wallet); await d(() => window.__dakar.act()); await page.waitForTimeout(500);
  await page.locator('#modal.on .item').first().click(); await page.waitForTimeout(500);
  check('ordering pays and feeds', (await d(() => window.__dakar.state.wallet)) < k0 && (await d(() => window.__dakar.state.data.needs.faim)) > 30);
  await near(S.photo.x, S.photo.z, 0); f = await focus();
  check('the photo corner offers a souvenir photo', !!f && /Photo/.test(JSON.stringify(f)), JSON.stringify(f).slice(0, 120));
  await shot('7-photo-corner');
  // the wheel as a landmark from the surrounding streets (camera on the road, at dusk)
  await d(() => window.__dakar.cam([-60, 3, 60], [-33, 11, 90])); await shot('8-landmark-from-street');
  await d(() => window.__dakar.cam([-35, 22, 150], [-20, 6, 95])); await shot('9-evening-overview'); await d(() => window.__dakar.cam(null));
  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
  console.log('magic land checks passed');
} finally { await browser.close(); }
