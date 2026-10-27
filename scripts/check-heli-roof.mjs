// LD2.0-D round 2, lane R2-H (docs/ld2/LD2_D.md): the realistic helicopter lies along the roof terrace (HELIPAD: −4.4, −0.6, its nose toward −x). On a
// phone page (390 × 844), with real touches on the joystick (scripts/lib/realTouch.mjs), the owner walks the acceptance's roof route (scripts/check-ld2d.mjs
// step 4): from the stair head onto the pad beside the helicopter → « Regarder l'hélicoptère » and its sheet (its registration, its rotor, the flights that
// come with the airport); then round its tail to the street-side terrace. Never inside the helicopter (the plan's three `heli` fixtures), no page errors.
// Pictures in <outDir> (the prompt, the sheet). Usage: node scripts/check-heli-roof.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4986/', out = 'docs/proof/ld2d/r2-heli'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const STOREY = 3.4, PAD = { x: -4.4, z: -0.6, r: 3.2 };
// the helicopter's footprint on the roof (house plan coordinates; src/housing/villaPlan.ts): its cabin, its boom and stabiliser, its fin and tail rotor
const HELI = [{ x0: -6.9, x1: -2.3, z0: -1.9, z1: 0.7 }, { x0: -2.3, x1: 0.45, z0: -1.68, z1: 0.48 }, { x0: 0.45, x1: 1.65, z0: -0.72, z1: -0.32 }];
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 600) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  const t = await realTouch(page);
  await d(() => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(10); D.teleport('almadies'); });
  await page.waitForTimeout(3000);
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  // at the stair head on the roof (the acceptance arrives there by the stairs)
  await d(([x, z, y]) => window.__dakar.place(x, z, -Math.PI / 2, y), [O.x + 6.0, O.z - 3.9, 2 * STOREY]);
  await page.waitForTimeout(1500);
  let closest = Infinity;
  const walk = async (x, z, ms = 60000) => {
    const j = await t.centre('#joy'), r = 50, t0 = Date.now();
    await t.down(3, j.x, j.y);
    let p = await d(() => window.__dakar.pos());
    while (Date.now() - t0 < ms) {
      const hx = p.x - O.x, hz = p.z - O.z;
      for (const b of HELI) closest = Math.min(closest, Math.hypot(Math.max(b.x0 - hx, 0, hx - b.x1), Math.max(b.z0 - hz, 0, hz - b.z1)));
      const dx = O.x + x - p.x, dz = O.z + z - p.z, dist = Math.hypot(dx, dz);
      if (dist < 0.4) break;
      const a = wrap(Math.atan2(dx, dz) - p.cam), k = dist > 1.2 ? 0.6 : dist > 0.6 ? 0.4 : 0.25;
      await t.move(3, j.x - Math.sin(a) * r * k, j.y - Math.cos(a) * r * k, 1);
      await page.waitForTimeout(90); p = await d(() => window.__dakar.pos());
    }
    await t.up(3); await page.waitForTimeout(300);
    p = await d(() => window.__dakar.pos());
    const h = await d(() => window.__dakar.home());
    return { dist: Math.hypot(O.x + x - p.x, O.z + z - p.z), room: h?.room ?? null, level: h?.level ?? null, at: [+(p.x - O.x).toFixed(2), +(p.z - O.z).toFixed(2)], y: +p.y.toFixed(2) };
  };
  const shot = async name => { let buf = await page.screenshot(); if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 90 }).toBuffer(); fs.writeFileSync(`${out}/${name}.png`, buf); };
  // ------------------------------------------------------------------ the acceptance's route onto the pad
  const legs1 = [[3.6, -3.9], [0.6, -3.4], [-3.4, -3.1]], went1 = [];
  for (const [x, z] of legs1) went1.push(await walk(x, z));
  const onPad = went1[went1.length - 1];
  check('from the stair head onto the pad beside the helicopter (the acceptance\'s roof legs), with the joystick', went1.every(w => w.dist < 0.45 && w.room === 'terrasse' && w.level === 'toit')
    && Math.hypot(onPad.at[0] - PAD.x, onPad.at[1] - PAD.z) < PAD.r, JSON.stringify(went1));
  const focused = await page.waitForFunction(() => /Regarder l.hélicoptère/.test(window.__dakar.focus()?.primary ?? ''), null, { timeout: 15000 }).then(() => true, () => false);
  await shot('roof-prompt');
  check('« Regarder l\'hélicoptère » is offered there', focused, JSON.stringify(await d(() => window.__dakar.focus())));
  let sheet = '';
  if (focused) {
    await t.tap('#act'); await page.waitForFunction(() => !!document.querySelector('#modal.on'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600); sheet = await d(() => document.querySelector('#modal.on')?.innerText ?? '');
    await shot('roof-sheet');
    await d(() => document.querySelector('#modal.on .item')?.click()); await page.waitForTimeout(600);
  }
  check('its sheet: the registration, a 9.4 m three-blade rotor, the flights that come with the airport', /6V-ALM/.test(sheet) && /9,4 m, trois pales/.test(sheet) && /aéroport/.test(sheet), sheet.replace(/\n+/g, ' · '));
  // ------------------------------------------------------------------ round its tail to the street side, and back to the stairs
  const legs2 = [[2.9, -3.0], [3.6, 3.0], [6.2, 3.0], [3.6, 3.0], [3.6, -3.9]], went2 = [];
  for (const [x, z] of legs2) went2.push(await walk(x, z));
  check('round its tail to the street-side terrace and back to the stairs', went2.every(w => w.dist < 0.45 && w.level === 'toit') && went2[2].room === 'terrasse_rue', JSON.stringify(went2));
  check(`never inside the helicopter (closest ${closest.toFixed(2)} m from its cabin, boom or tail)`, closest > 0.2, closest);
  check('no page errors', errors.length === 0, errors.join(' | '));
  fs.writeFileSync(`${out}/roof-walk.json`, JSON.stringify({ base, legs: [...legs1, ...legs2], went: [...went1, ...went2], sheet, closest, results }, null, 1));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
