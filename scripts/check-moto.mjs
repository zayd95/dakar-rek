// Headless checks of the player's motorbike (src/transport/motoModule.ts): buy it at the dealer corner (price shown,
// then confirmed, paid once), get on, ride with the keys (desktop) or the joystick (phone), never through a wall, get
// off beside it, find it parked after a reload (also mid-ride) and after a trip to another hub.
// Usage: node scripts/check-moto.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4213`)
// On a shared machine run browsers one at a time: flock /tmp/dakar-browser.lock node scripts/check-moto.mjs …
// ONLY=desktop or ONLY=phone runs one viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/moto';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const RUNS = [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]];
for (const [label, viewport, touch] of RUNS.filter(r => !process.env.ONLY || r[0] === process.env.ONLY)) {
  const context = await browser.newContext(touch ? { viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const info = () => d(() => window.__dakar.moto.info());
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const ready = () => page.waitForFunction(() => window.__dakar.focus() !== null && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const inWall = async p => (await d(() => window.__dakar.cityGeometry())).colliders.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1);
  /**
   * Ride: hold the throttle (keys on desktop, the joystick on the phone), steering −1 / 0 / 1, until `until` holds in
   * the page (frames are slow on the test machine: wait on the motorbike, not on the clock) or `ms` at most.
   */
  const ride = async (ms, steer = 0, until = null, arg = null) => {
    const hold = () => until ? page.waitForFunction(until, arg, { timeout: Math.max(ms, 1000) }).catch(() => {}) : page.waitForTimeout(ms);
    if (!touch) {
      await page.keyboard.down('KeyW'); if (steer) await page.keyboard.down(steer > 0 ? 'KeyD' : 'KeyA');
      await hold();
      if (steer) await page.keyboard.up(steer > 0 ? 'KeyD' : 'KeyA'); await page.keyboard.up('KeyW');
    } else {
      const j = await d(() => { const r = document.getElementById('joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(j.x, j.y); await page.mouse.down(); await page.mouse.move(j.x + steer * 30, j.y - 42, { steps: 4 });
      await hold();
      await page.mouse.up();
    }
  };

  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(10); window.__dakar.state.data.wallet = 100000; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.moto.info().dealer, null, T);
  const dealer = (await info()).dealer;
  check(`${label}: Pikine has the motorbike corner at Garage Modou`, !!dealer, JSON.stringify(dealer));

  // 1. The dealer: « Voir les articles », the price before confirming, then paid once.
  await d(p => window.__dakar.place(p.x, p.z + 1.3, Math.PI), dealer);
  await page.waitForFunction(() => /Motos/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
  const f1 = await d(() => window.__dakar.focus());
  check(`${label}: the dealer counter offers its catalogue`, /Motos/.test(f1?.name ?? '') && f1.all.includes('Voir les articles'), JSON.stringify(f1));
  await shot('1-dealer');
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const item = await d(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent).find(t => /Jakarta/.test(t)) ?? null);
  check(`${label}: the catalogue shows the Jakarta with its price`, /Jakarta/.test(item ?? '') && /75\s000\sF/.test(item ?? ''), String(item));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.length);
  await page.locator('#modal .item', { hasText: 'Jakarta' }).first().click();
  await page.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
  const confirmText = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  check(`${label}: a confirmation shows the price and the wallet before paying`, /Acheter/.test(confirmText) && /75\s000\sF/.test(confirmText) && (await d(() => window.__dakar.state.wallet)) === w0, confirmText.slice(0, 160));
  await shot('2-confirm');
  await page.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
  await page.waitForFunction(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here, null, T).catch(() => {});
  const bought = await info(), w1 = await d(() => window.__dakar.state.wallet);
  const lines = await d(n => window.__dakar.state.data.ledger.slice(n), l0);
  check(`${label}: bought once: −75 000 F, one wallet line, the motorbike delivered at the kerb`, bought.owned && bought.here && w0 - w1 === 75000 && lines.length === 1 && /Jakarta/.test(lines[0].label) && bought.bought === 1, JSON.stringify({ w0, w1, lines, rec: bought.record }));
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const again = await d(() => [...document.querySelectorAll('#modal .item')].find(b => /Jakarta/.test(b.textContent))?.className ?? '');
  await d(() => document.querySelector('#modal .item.close')?.click());
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  check(`${label}: it cannot be bought twice`, /disabled|off/.test(again) || (await d(() => window.__dakar.state.wallet)) === w1, again);

  // 2. Get on.
  const rec = bought.record;
  await d(r => window.__dakar.place(r.x + 1.2, r.z, -Math.PI / 2), rec);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, T).catch(() => {});
  const f2 = await d(() => window.__dakar.focus());
  check(`${label}: walking up to it offers « Monter sur la moto »`, f2?.primary === 'Monter sur la moto', JSON.stringify(f2));
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.moto.info().driving, null, T).catch(() => {});
  let i2 = await info();
  check(`${label}: on the motorbike: driver seat, own interaction space, still in the street for the others`, i2.driving && /moto:.*:driver$/.test(await d(() => window.__dakar.seated()) ?? '') && i2.space === 'pikine:moto:jakarta' && i2.presence === 'street' && i2.camera, JSON.stringify(i2));
  await shot('3-on');

  // 3. Ride along the road (east), then steer.
  const p0 = { x: i2.x, z: i2.z };
  await ride(120000, 0, p => { const m = window.__dakar.moto.info(); return Math.hypot(m.x - p.x, m.z - p.z) > 5 && m.speed > 2; }, p0);
  i2 = await info();
  const moved = Math.hypot(i2.x - p0.x, i2.z - p0.z);
  check(`${label}: the throttle moves the motorbike and the card shows the speed`, moved > 4 && /km\/h/.test(await d(() => window.__dakar.moto.card())), `${moved.toFixed(1)} m, ${await d(() => window.__dakar.moto.card())}`);
  await shot('4-riding');
  const y0 = i2.yaw;
  await ride(120000, 1, y => window.__dakar.moto.info().yaw < y - 0.3, y0);
  i2 = await info();
  check(`${label}: steering right turns the motorbike right`, i2.yaw < y0 - 0.2, `${y0.toFixed(2)} → ${i2.yaw.toFixed(2)}`);
  // 4. Into a wall: it stops against it, never inside.
  await d(r => window.__dakar.moto.place(r.x, r.z + 2, Math.PI), rec);            // facing the garage's block, 4 m away
  await ride(120000, 0, () => window.__dakar.moto.info().bumps > 0);
  await page.waitForTimeout(800);
  i2 = await info();
  check(`${label}: riding into the block stops at the wall (never inside it)`, !(await inWall({ x: i2.x, z: i2.z })) && i2.bumps > 0, JSON.stringify({ x: i2.x, z: i2.z, bumps: i2.bumps }));
  await d(r => window.__dakar.moto.place(r.x - 6, r.z, Math.PI / 2), rec);

  // 5. Get off: beside it, parked there.
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => !window.__dakar.moto.info().driving && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  i2 = await info();
  const me = await d(() => window.__dakar.pos());
  check(`${label}: « Descendre de la moto »: standing beside it, it stays parked there`, !i2.driving && (await d(() => window.__dakar.seated())) === null && Math.hypot(me.x - i2.x, me.z - i2.z) < 1.6 && !(await inWall(me)) && Math.hypot(i2.record.x - i2.x, i2.record.z - i2.z) < 0.05 && !i2.camera,
    JSON.stringify({ me, moto: { x: i2.x, z: i2.z }, rec: i2.record }));
  await shot('5-parked');

  // 6. Reload: still there; reload mid-ride: parked where it was, the rider standing beside it.
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.moto && window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(1200);
  let i3 = await info();
  check(`${label}: after a reload the motorbike is still parked where it was left`, i3.owned && i3.here && Math.hypot(i3.x - i2.x, i3.z - i2.z) < 0.05, JSON.stringify({ before: { x: i2.x, z: i2.z }, after: { x: i3.x, z: i3.z } }));
  await shot('6-after-reload');
  await d(r => window.__dakar.place(r.x + 1.2, r.z, -Math.PI / 2), { x: i3.x, z: i3.z });
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, T).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.moto.info().driving, null, T).catch(() => {});
  await ride(60000, 0, () => window.__dakar.moto.info().speed > 2);
  const mid = await info();
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.moto && window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(1200);
  i3 = await info();
  const me3 = await d(() => window.__dakar.pos());
  check(`${label}: reload mid-ride: parked where it was, standing beside it, not riding`, mid.driving && !i3.driving && i3.here && Math.hypot(i3.x - mid.x, i3.z - mid.z) < 2.5 && Math.hypot(me3.x - i3.x, me3.z - i3.z) < 1.8 && (await d(() => window.__dakar.seated())) === null,
    JSON.stringify({ mid: { x: mid.x, z: mid.z }, after: { x: i3.x, z: i3.z }, me3 }));

  // 7. Another hub and back: it waits in Pikine.
  await d(() => window.__dakar.travelTo('plateau'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const away = await info();
  await d(() => window.__dakar.travelTo('pikine'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const back = await info();
  check(`${label}: in another hub it is not there; back in Pikine it waits where it was`, !away.here && away.owned && back.here && Math.hypot(back.x - i3.x, back.z - i3.z) < 0.05, JSON.stringify({ away: away.here, back: { x: back.x, z: back.z } }));

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} motorbike checks passed`);
process.exit(failed ? 1 : 0);
