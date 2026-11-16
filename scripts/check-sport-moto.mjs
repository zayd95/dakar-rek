// Headless checks of the sport motorbike, the « Sabar 600 » (src/transport/sportMoto.ts, src/transport/sportMotoModule.ts), on desktop and on a phone (390×844, touch):
//   - it stands at both dealers, each in its own colourway named on its card: Garage Modou (Pikine) rouge et blanc, Ndiaye Auto (Plateau) jaune et noir;
//   - bought at Garage Modou: the price shown, then confirmed, 2 000 000 F debited once, delivered at the kerb in that colour, listed once in « Biens »;
//   - ridden: the tucked pose, quicker than a Jakarta over the same seconds of game time, the stick turning the fork (the GLB's front end) and leaning it;
//   - parked, the page reloaded: found where it was, still once, still rouge et blanc;
//   - Ndiaye Auto: its own bike still on show, but « Tu as déjà ta Sabar 600 rouge et blanc » (one bike: the other dealer does not sell a second);
//   - sold from « Biens »: gone, the money back once; no page errors.
// Captures (small JPGs, `CAPS=<dir>`, default docs/vehicles/sport-moto): both stands, the bike ridden, the rider up close, the fork steered.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-sport-moto.mjs [baseUrl] [outDir]   (a running build; ONLY=desktop|phone runs one viewport)
import { chromium } from 'playwright';
import { realTouch, padRig } from './lib/realTouch.mjs';
import sharp from 'sharp';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/sport-moto', caps = process.env.CAPS ?? 'docs/vehicles/sport-moto';
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(caps, { recursive: true });
const T = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const RUNS = [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]];
for (const [label, viewport, touch] of RUNS.filter(r => !process.env.ONLY || r[0] === process.env.ONLY)) {
  const context = await browser.newContext(touch ? { viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}&heure=10`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.sabar, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const touch_ = touch ? await realTouch(page) : null;
  const info = () => d(() => window.__dakar.sabar.info());
  const at = () => d(() => window.__dakar.sabar.at());
  const digits = t => (t ?? '').replace(/[^0-9]/g, '');
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  /** A small JPG of what the camera sees now (the HUD hidden), into the docs. */
  const capture = async name => {
    await page.waitForTimeout(700);
    const png = await page.screenshot();
    await sharp(png).resize({ width: touch ? 390 : 800 }).jpeg({ quality: 72, mozjpeg: true }).toFile(`${caps}/${label}-${name}.jpg`);
  };
  /** The camera at a point looking at another (the game keeps running), then given back. */
  const look = async (p, t, name) => { await d(([p, t]) => window.__dakar.cam(p, t), [p, t]); await capture(name); await d(() => window.__dakar.cam(null)); };
  const ready = () => page.waitForFunction(() => window.__dakar.focus() !== null && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const closeModal = async () => { await d(() => document.querySelector('#modal .item.close')?.click()); await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {}); };
  /** Hold the throttle (and, on desktop, the boost) and the steering until `until` holds in the page or `ms` passes (frames are slow here: wait on the bike, not the clock). */
  const ride = async (ms, steer = 0, until = null, arg = null, boost = false) => {
    const hold = () => until ? page.waitForFunction(until, arg, { timeout: Math.max(ms, 1000), polling: 100 }).catch(() => {}) : page.waitForTimeout(ms);
    if (!touch) {
      await page.keyboard.down('KeyW'); if (boost) await page.keyboard.down('ShiftLeft'); if (steer) await page.keyboard.down(steer > 0 ? 'KeyD' : 'KeyA');
      await hold();
      if (steer) await page.keyboard.up(steer > 0 ? 'KeyD' : 'KeyA'); if (boost) await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    } else {
      const gas = await touch_.centre('#ridepad .rp-gas'), R = await padRig(page, touch_);
      await touch_.down(1, gas.x, gas.y + (boost ? 40 : 18)); if (steer) await R.rocker(2)(steer);
      await hold();
      await touch_.upAll();
    }
  };
  /** Ride straight from a standstill for `secs` of the vehicle's own clock: the speed reached (m/s). */
  const sprint = async (mod, secs) => {
    const t0 = await d(m => window.__dakar[m].at().t, mod);
    await ride(180000, 0, ([m, t]) => window.__dakar[m].at().t > t, [mod, t0 + secs], true);
    return d(m => window.__dakar[m].at(), mod);
  };
  /** Stand at a dealer's counter and open its catalogue: the menu's items as text. */
  const catalogue = async dealer => {
    await d(p => window.__dakar.place(p.x, p.z, Math.PI), dealer);
    await page.waitForFunction(() => /Motos sportives/.test(window.__dakar.focus()?.name ?? ''), null, { timeout: 60000 }).catch(() => {});
    const f = await d(() => window.__dakar.focus());
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    return { focus: f, items: await d(() => [...document.querySelectorAll('#modal.on .item')].map(b => ({ text: b.textContent ?? '', off: /disabled|off/.test(b.className) || b.hasAttribute('disabled') }))) };
  };
  const standShot = async (dealer, name) => {
    const s = dealer.display, back = touch ? 6.5 : 5;   // from the road, a little ahead of the bike
    const n = { x: Math.sin(dealer.cardAt.yaw), z: Math.cos(dealer.cardAt.yaw) };      // the card faces the road
    await look([s.x + n.x * back + n.z * 2.2, 2.2, s.z + n.z * back - n.x * 2.2], [s.x, 0.8, s.z], name);
  };

  // ---------------------------------------------------------------- 1. the two stands, each in its colourway
  await d(() => { window.__dakar.travelTo('plateau'); window.__dakar.state.data.wallet = 2_600_000; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.sabar.info().dealer && window.__dakar.pos().mode === 'play', null, T);
  const nd0 = (await info()).dealer;
  check(`${label}: Ndiaye Auto (Plateau) shows a Sabar 600 jaune et noir with its price card`, nd0?.colour === 'jaune et noir' && nd0.onSale === true && nd0.card === true && nd0.display?.seed === 1001, JSON.stringify(nd0));
  await standShot(nd0, 'ndiaye-stand');
  const c0 = await catalogue(nd0);
  const buyNd = c0.items.find(i => /Acheter/.test(i.text));
  check(`${label}: its counter « Motos sportives » sells « Sabar 600 jaune et noir » at 2 000 000 F, the free ride first`, /Essayer/.test(c0.items[0]?.text ?? '') && /Sabar 600 jaune et noir/.test(buyNd?.text ?? '') && digits(buyNd?.text).includes('2000000') && !buyNd.off, JSON.stringify(c0));
  await shot('1-ndiaye-catalogue'); await closeModal();

  await d(() => window.__dakar.travelTo('pikine'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.sabar.info().dealer && window.__dakar.pos().mode === 'play', null, T);
  const md = (await info()).dealer;
  check(`${label}: Garage Modou (Pikine) shows a Sabar 600 rouge et blanc with its price card, its own stand`, md?.colour === 'rouge et blanc' && md.onSale === true && md.card === true && md.display?.seed === 1000 && (await info()).model !== undefined, JSON.stringify(md));
  await standShot(md, 'modou-stand');

  // ---------------------------------------------------------------- 2. bought there: the price, then confirmed, paid once, delivered at the kerb in its colour
  const c1 = await catalogue(md);
  check(`${label}: the counter offers « Voir les articles » and lists « Sabar 600 rouge et blanc » at its price`, /Motos sportives/.test(c1.focus?.name ?? '') && c1.items.some(i => /Sabar 600 rouge et blanc/.test(i.text) && digits(i.text).includes('2000000')), JSON.stringify(c1));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.length);
  await page.locator('#modal .item', { hasText: 'Acheter' }).first().click();
  await page.waitForFunction(() => /Acheter la Sabar/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
  const confirmText = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  check(`${label}: a confirmation shows the price, the wallet and the colour before paying`, digits(confirmText).includes('2000000') && /rouge et blanc/.test(confirmText) && (await d(() => window.__dakar.state.wallet)) === w0, confirmText.slice(0, 200));
  await shot('2-confirm');
  await page.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
  await page.waitForFunction(() => window.__dakar.sabar.info().owned && window.__dakar.sabar.info().here, null, T).catch(() => {});
  const b1 = await info(), w1 = await d(() => window.__dakar.state.wallet), lines = await d(n => window.__dakar.state.data.ledger.slice(n), l0);
  check(`${label}: 2 000 000 F debited once (one wallet line), delivered at the kerb in front of the stand, rouge et blanc, the GLB body`,
    b1.owned && b1.here && w0 - w1 === 2_000_000 && lines.length === 1 && /Sabar/.test(lines[0].label) && b1.bought === 1 && b1.paint === 1000 && Math.hypot(b1.x - md.delivery.x, b1.z - md.delivery.z) < 0.05 && (await at()).model === 'glb_sabar',
    JSON.stringify({ w0, w1, lines, paint: b1.paint, at: [b1.x, b1.z], model: (await at()).model }));
  check(`${label}: the stand's own bike is off the floor once bought (the one bought waits at the kerb)`, (await info()).dealer.onSale === false);
  const biens = await d(() => { window.__dakar.assetsApp(); return [...document.querySelectorAll('#modal.on .item')].map(b => b.textContent ?? ''); });
  await closeModal();
  check(`${label}: « Biens » lists the Sabar 600 once`, biens.filter(t => /Sabar 600/.test(t)).length === 1, JSON.stringify(biens.filter(t => /Sabar/.test(t))));

  // ---------------------------------------------------------------- 3. riding it: tucked, quicker than a Jakarta, the fork turning
  await d(r => window.__dakar.place(r.x + 1.3, r.z, -Math.PI / 2), { x: b1.x, z: b1.z });
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta Sabar 600', null, { timeout: 60000 }).catch(() => {});
  const f2 = await d(() => window.__dakar.focus());
  check(`${label}: walking up to it offers « Monter sur la moto »`, f2?.primary === 'Monter sur la moto', JSON.stringify(f2));
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.sabar.info().driving && window.__dakar.clip() === 'RideSport', null, { timeout: 60000 }).catch(() => {});
  const r0 = await info(), clip = await d(() => window.__dakar.clip());
  check(`${label}: astride in the tucked pose, its own space, the chase view; the views are the chase, the bars and the top`, r0.driving && clip === 'RideSport' && r0.space === 'pikine:moto:sabar' && r0.camera && r0.views.join() === 'chase,guidon,haut', JSON.stringify({ clip, space: r0.space, views: r0.views }));
  // the rider up close (the bike stopped at the kerb)
  { const a = await at(), f = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }, l = { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) };
    await look([a.x + l.x * 2.1 + f.x * 0.9, 1.45, a.z + l.z * 2.1 + f.z * 0.9], [a.x + f.x * 0.05, 0.95, a.z + f.z * 0.05], 'rider-pose'); }
  // the fork steered: the stick held to the left at a crawl, the camera ahead of the bike
  await d(([x, z]) => window.__dakar.sabar.place(x, z, -Math.PI / 2), [b1.x - 3, b1.z]);
  await ride(60000, -1, () => window.__dakar.sabar.at().fork > 0.25);
  const st = await at();
  check(`${label}: the stick turns the front end: the fork (fork, front wheel, clip-ons) turned about its axis`, st.fork > 0.25 && st.model === 'glb_sabar', JSON.stringify({ fork: st.fork, steer: st.steer }));
  { const f = { x: Math.sin(st.yaw), z: Math.cos(st.yaw) }, l = { x: Math.cos(st.yaw), z: -Math.sin(st.yaw) };
    await d(() => window.__dakar.pause(true));
    await d(([p, t]) => window.__dakar.cam(p, t), [[st.x + f.x * 2.6 + l.x * 1.4, 1.7, st.z + f.z * 2.6 + l.z * 1.4], [st.x + f.x * 0.5, 0.75, st.z + f.z * 0.5]]);
    await d(() => window.__dakar.render()); await capture('fork-steered');
    await d(() => { window.__dakar.cam(null); window.__dakar.pause(false); }); }
  // a sprint from a standstill along the road, 3 s of the bike's own clock
  await d(([x, z]) => window.__dakar.sabar.place(x, z, -Math.PI / 2), [b1.x + 4, b1.z]);
  await page.waitForTimeout(500);
  const sab = await sprint('sabar', 3);
  await capture('riding');
  await shot('3-riding');
  // the same 3 s on a Jakarta (the player's own, bought for the comparison: its corner is at Garage Modou too)
  await d(() => window.__dakar.sabar.boost(0));
  await d(([x, z]) => window.__dakar.sabar.place(x, z, -Math.PI / 2), [b1.x - 26, b1.z]);
  await ready(); await d(() => window.__dakar.act());                                     // « Descendre »
  await page.waitForFunction(() => !window.__dakar.sabar.info().driving && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  await d(() => { window.__dakar.state.data.wallet += 150_000; window.__dakar.moto.own(); });
  await page.waitForFunction(() => window.__dakar.moto.info().here, null, T).catch(() => {});
  const jr = (await d(() => window.__dakar.moto.info())).record;
  await d(r => window.__dakar.moto.place(r.x + 4, r.z, -Math.PI / 2), jr);
  await d(r => window.__dakar.place(r.x + 4 + 1.2, r.z, -Math.PI / 2), jr);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, { timeout: 60000 }).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.moto.info().driving, null, T).catch(() => {});
  await page.waitForTimeout(500);
  const jak = await sprint('moto', 3);
  const di = await d(() => ({ s: window.__dakar.sabar.info().drive, j: window.__dakar.moto.info().drive }));
  check(`${label}: over the same 3 s from a standstill the Sabar is faster than a Jakarta (top speed and pick-up higher too)`, sab.speed > jak.speed + 2 && di.s.maxSpeed > di.j.maxSpeed && di.s.boostSpeed > di.j.boostSpeed && di.s.accel > di.j.accel,
    JSON.stringify({ sabar: { v: sab.speed, t: sab.t }, jakarta: { v: jak.speed, t: jak.t }, drive: di }));
  await ready(); await d(() => window.__dakar.act());
  await page.waitForFunction(() => !window.__dakar.moto.info().driving && window.__dakar.pos().mode === 'play', null, T).catch(() => {});

  // ---------------------------------------------------------------- 4. parked, reloaded: found where it was
  const p1 = await info();
  check(`${label}: got off: parked where it was left`, !p1.driving && p1.here && Math.hypot(p1.record.x - p1.x, p1.record.z - p1.z) < 0.05, JSON.stringify(p1.record));
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.sabar && window.__dakar.pos().hub === 'pikine' && window.__dakar.pos().mode === 'play', null, T);
  await page.waitForTimeout(1500);
  const p2 = await info();
  const buys = await d(() => window.__dakar.state.data.ledger.filter(l => /Sabar/.test(l.label) && l.amount < 0).length);
  check(`${label}: after a reload: still owned (charged once), parked where it was, still rouge et blanc`, p2.owned && p2.here && Math.hypot(p2.x - p1.x, p2.z - p1.z) < 0.05 && buys === 1 && p2.paint === 1000 && (await at()).model === 'glb_sabar',
    JSON.stringify({ before: [p1.x, p1.z], after: [p2.x, p2.z], buys, paint: p2.paint }));

  // ---------------------------------------------------------------- 5. the other dealer: « already yours », its own bike still on show
  await d(() => window.__dakar.travelTo('plateau'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.sabar.info().dealer && window.__dakar.pos().mode === 'play', null, T);
  const nd1 = (await info()).dealer;
  const c2 = await catalogue(nd1);
  const offers = c2.items.filter(i => /Essayer|Acheter/.test(i.text));
  check(`${label}: Ndiaye Auto keeps its jaune et noir on show, but sells no second one: « Tu as déjà ta Sabar 600 rouge et blanc »`,
    nd1.onSale === true && offers.length === 2 && offers.every(i => i.off && /Tu as déjà ta Sabar 600 rouge et blanc/.test(i.text)) && !(await info()).here, JSON.stringify({ nd1, offers }));
  await shot('5-ndiaye-owned'); await closeModal();

  // ---------------------------------------------------------------- 6. sold from « Biens »
  const w2 = await d(() => window.__dakar.state.wallet), uid = await d(() => window.__dakar.estate().assets.find(a => a.spec === 'sabar')?.uid);
  await d(u => window.__dakar.assetSheet(u), uid);
  await page.waitForFunction(() => /Vendre/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
  await page.locator('#modal .item', { hasText: 'Vendre' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('#modal .item', { hasText: 'Vendre' }).first().click().catch(() => {});
  await page.waitForFunction(() => !window.__dakar.sabar.info().owned, null, { timeout: 60000 }).catch(() => {});
  const sold = await info(), w3 = await d(() => window.__dakar.state.wallet);
  await closeModal();
  check(`${label}: sold from « Biens »: no longer owned, no parking record, paid back once`, !sold.owned && sold.record === null && w3 > w2 && w3 - w2 <= 2_000_000, JSON.stringify({ w2, w3, record: sold.record }));
  await page.waitForTimeout(800);
  check(`${label}: once sold, Ndiaye Auto offers it again`, (await info()).dealer.onSale === true);

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------------------------------------------------------------- the rider's pose on each body (the shipped v4 rig and the two Meshy bodies)
if (!process.env.ONLY || process.env.ONLY === 'poses') for (const avatar of ['v4', 'homme', 'femme']) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const d = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`${base}?debug&heure=10&avatar=${avatar}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.sabar && window.__dakar.pos().hub === 'pikine' && window.__dakar.sabar.info().dealer && window.__dakar.pos().mode === 'play', null, T);
  await d(() => { window.__dakar.state.data.wallet = 3_000_000; window.__dakar.sabar.own(); });
  await page.waitForFunction(() => window.__dakar.sabar.info().here, null, T).catch(() => {});
  const r = (await d(() => window.__dakar.sabar.info())).record;
  await d(p => window.__dakar.place(p.x + 1.3, p.z, -Math.PI / 2), r);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta Sabar 600', null, { timeout: 60000 }).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.sabar.info().driving && window.__dakar.clip() === 'RideSport', null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const a = await d(() => window.__dakar.sabar.at()), clip = await d(() => window.__dakar.clip());
  const f = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }, l = { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) };
  await d(([p, t]) => window.__dakar.cam(p, t), [[a.x + l.x * 2.1 + f.x * 0.9, 1.45, a.z + l.z * 2.1 + f.z * 0.9], [a.x + f.x * 0.05, 0.95, a.z + f.z * 0.05]]);
  await page.waitForTimeout(800);
  await sharp(await page.screenshot()).resize({ width: 640 }).jpeg({ quality: 72, mozjpeg: true }).toFile(`${caps}/pose-${avatar}.jpg`);
  check(`pose (${avatar}): astride the Sabar in the tucked pose`, clip === 'RideSport' && a.driving, JSON.stringify({ clip }));
  check(`pose (${avatar}): no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} sport motorbike checks passed`);
process.exit(failed ? 1 : 0);
