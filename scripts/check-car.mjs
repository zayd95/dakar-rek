// Headless checks of the player's car (src/transport/carModule.ts on src/transport/ownedModule.ts): buy the used
// saloon at the Plateau dealer (price shown, then confirmed, paid once, delivered at the kerb), walk around it (it is
// solid when parked), « Monter (conducteur) », drive with the keys (desktop) or the joystick (phone), the three views,
// never through a wall, « Sortir de la voiture » on the pavement side, find it parked after a reload (also mid-drive)
// and after a trip to another hub.
// Usage: node scripts/check-car.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4213`)
// On a shared machine run browsers one at a time: flock /tmp/dakar-browser.lock node scripts/check-car.mjs …
// ONLY=desktop or ONLY=phone runs one viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/car';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
/** Road grid of the hub builder: centre lines at −120, −60, 0, 60, 120 (pavements 5–7 m from them). */
const roadDistance = (x, z) => Math.min(...[-120, -60, 0, 60, 120].flatMap(c => [Math.abs(x - c), Math.abs(z - c)]));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const RUNS = [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]];
for (const [label, viewport, touch] of RUNS.filter(r => !process.env.ONLY || r[0] === process.env.ONLY)) {
  const context = await browser.newContext(touch ? { viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const info = () => d(() => window.__dakar.car.info());
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const ready = () => page.waitForFunction(() => window.__dakar.focus() !== null && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const inWall = async p => (await d(() => window.__dakar.cityGeometry())).colliders.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1);
  /** Position of (x, z) in the car's frame: lateral (+ = its left) and along (+ = ahead). */
  const local = (c, p) => { const dx = p.x - c.x, dz = p.z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return { lateral: dx * co - dz * si, along: dx * si + dz * co }; };
  /** Hold the throttle (keys / joystick), steering −1 / 0 / 1, until `until` holds in the page or `ms` at most. */
  const drive = async (ms, steer = 0, until = null, arg = null, back = false) => {
    const hold = () => until ? page.waitForFunction(until, arg, { timeout: Math.max(ms, 1000) }).catch(() => {}) : page.waitForTimeout(ms);
    const key = back ? 'KeyS' : 'KeyW';
    if (!touch) {
      await page.keyboard.down(key); if (steer) await page.keyboard.down(steer > 0 ? 'KeyD' : 'KeyA');
      await hold();
      if (steer) await page.keyboard.up(steer > 0 ? 'KeyD' : 'KeyA'); await page.keyboard.up(key);
    } else {
      const j = await d(() => { const r = document.getElementById('joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(j.x, j.y); await page.mouse.down(); await page.mouse.move(j.x + steer * 30, j.y + (back ? 42 : -42), { steps: 4 });
      await hold();
      await page.mouse.up();
    }
  };
  const view = async want => {
    await ready();
    await d(() => window.__dakar.more());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await page.locator('#modal .item', { hasText: 'Changer de vue' }).first().click().catch(() => {});
    await page.waitForFunction(v => window.__dakar.car.info().view === v, want, T).catch(() => {});
    await page.waitForTimeout(2500);
    return (await info()).view;
  };

  await d(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(10); window.__dakar.state.data.wallet = 1000000; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car.info().dealer, null, T);
  const i0 = await info(), dealer = i0.dealer, price = i0.price;
  check(`${label}: the Plateau has the used-car corner with cars on display`, !!dealer && dealer.displays === 2, JSON.stringify(dealer));
  // the road is on the side of the delivery spot: stand on the pavement between the counter and the kerb
  const toRoad = Math.sign(dealer.delivery.x - dealer.x) || 1;

  // 1. The dealer: « Voir les articles », the price before confirming, then paid once.
  await d(([p, s]) => window.__dakar.place(p.x + s * 0.7, p.z + 0.4, -s * Math.PI / 2), [dealer, toRoad]);
  await page.waitForFunction(() => /Occasion/i.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
  const f1 = await d(() => window.__dakar.focus());
  check(`${label}: the dealer counter offers its catalogue`, /Occasion/i.test(f1?.name ?? '') && f1.all.includes('Voir les articles'), JSON.stringify(f1));
  await shot('1-dealer');
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const item = await d(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent).find(t => /Berline/.test(t)) ?? null);
  const digits = s => (s ?? '').replace(/[^0-9]/g, '');
  check(`${label}: the catalogue shows the saloon with its price`, /Berline/.test(item ?? '') && digits(item).includes(String(price)) && /\sF/.test(item ?? ''), String(item));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.length);
  await page.locator('#modal .item', { hasText: 'Berline' }).first().click();
  await page.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
  const confirmText = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  check(`${label}: a confirmation shows the price and the wallet before paying`, /Acheter/.test(confirmText) && digits(confirmText).includes(String(price)) && /Ton argent/.test(confirmText) && (await d(() => window.__dakar.state.wallet)) === w0, confirmText.slice(0, 160));
  await shot('2-confirm');
  await page.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
  await page.waitForFunction(() => window.__dakar.car.info().owned && window.__dakar.car.info().here, null, T).catch(() => {});
  const bought = await info(), w1 = await d(() => window.__dakar.state.wallet);
  const lines = await d(n => window.__dakar.state.data.ledger.slice(n), l0);
  const rec = bought.record;
  check(`${label}: bought once: −price, one wallet line, delivered at the kerb`, bought.owned && bought.here && w0 - w1 === price && lines.length === 1 && /Berline/.test(lines[0].label) && bought.bought === 1
    && Math.hypot(rec.x - dealer.delivery.x, rec.z - dealer.delivery.z) < 0.05 && Math.abs(roadDistance(rec.x, rec.z) - 4.3) < 0.2, JSON.stringify({ w0, w1, lines, rec }));
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const again = await d(() => [...document.querySelectorAll('#modal .item')].find(b => /Berline/.test(b.textContent))?.className ?? '');
  await d(() => document.querySelector('#modal .item.close')?.click());
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  check(`${label}: it cannot be bought twice`, /disabled|off/.test(again) || (await d(() => window.__dakar.state.wallet)) === w1, again);

  // 2. Parked, it is solid: walking into it from the pavement stops at its side.
  const car0 = { x: rec.x, z: rec.z, yaw: rec.yaw };
  const pave = { x: car0.x - toRoad * 2.2, z: car0.z };
  await d(([p, s]) => window.__dakar.place(p.x, p.z, s * Math.PI / 2), [pave, toRoad]);
  await page.waitForTimeout(800);
  if (!touch) { await page.keyboard.down('KeyW'); await page.waitForFunction(c => Math.abs(window.__dakar.pos().x - c.x) < 1.2, car0, { timeout: 15000 }).catch(() => {}); await page.keyboard.up('KeyW'); }
  else {
    const j = await d(() => { const r = document.getElementById('joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(j.x, j.y); await page.mouse.down(); await page.mouse.move(j.x, j.y - 42, { steps: 4 });
    await page.waitForFunction(c => Math.abs(window.__dakar.pos().x - c.x) < 1.2, car0, { timeout: 15000 }).catch(() => {});
    await page.mouse.up();
  }
  const pw = await d(() => window.__dakar.pos());
  check(`${label}: the parked car is solid (walking into it stops at its side)`, bought.solid && Math.abs(local(car0, pw).lateral) > 0.85, JSON.stringify({ solid: bought.solid, lateral: local(car0, pw).lateral.toFixed(2), walked: Math.abs(pw.x - pave.x).toFixed(2) }));

  // 3. « Monter (conducteur) ».
  await d(([p, s]) => window.__dakar.place(p.x, p.z, s * Math.PI / 2), [pave, toRoad]);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta berline', null, T).catch(() => {});
  const f2 = await d(() => window.__dakar.focus());
  check(`${label}: walking up to it offers « Monter (conducteur) »`, f2?.primary === 'Monter (conducteur)', JSON.stringify(f2));
  await shot('3-delivered');
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.car.info().driving, null, T).catch(() => {});
  let i2 = await info();
  const clip = await d(() => window.__dakar.clip());
  check(`${label}: at the wheel: driver seat (seated), own interaction space, still in the street for the others, chase view`, i2.driving && /car:berline:driver$/.test(await d(() => window.__dakar.seated()) ?? '') && i2.space === 'plateau:car:berline' && i2.presence === 'street' && i2.camera && i2.view === 'chase' && !i2.solid && clip !== 'Ride',
    JSON.stringify({ ...i2, clip }));
  await shot('4-in');

  // 4. Drive along the kerb lane, then steer.
  const p0 = { x: i2.x, z: i2.z };
  await drive(120000, 0, p => { const m = window.__dakar.car.info(); return Math.hypot(m.x - p.x, m.z - p.z) > 6 && m.speed > 3; }, p0);
  i2 = await info();
  const moved = Math.hypot(i2.x - p0.x, i2.z - p0.z);
  check(`${label}: the throttle moves the car and the card shows the speed`, moved > 5 && /km\/h/.test(await d(() => window.__dakar.car.card())), `${moved.toFixed(1)} m, ${await d(() => window.__dakar.car.card())}`);
  await shot('5-driving');
  const y0 = i2.yaw;
  await drive(120000, 1, y => window.__dakar.car.info().yaw < y - 0.3, y0);
  i2 = await info();
  check(`${label}: steering right turns the car right`, i2.yaw < y0 - 0.2, `${y0.toFixed(2)} → ${i2.yaw.toFixed(2)}`);
  // brake to a stop (down on the stick)
  await drive(60000, 0, () => Math.abs(window.__dakar.car.info().speed) < 0.3, null, true);

  // 5. The views: at the wheel (the driver's body hidden, the dashboard ahead), high above, back behind the car.
  await d(c => window.__dakar.car.place(c.x, c.z, c.yaw), car0);                // back at the kerb, looking down the road
  const v1 = await view('volant');
  await shot('6-volant');
  const v2 = await view('haut');
  await shot('7-haut');
  const v3 = await view('chase');
  check(`${label}: three views (behind, at the wheel, high above)`, v1 === 'volant' && v2 === 'haut' && v3 === 'chase', `${v1} ${v2} ${v3}`);

  // 6. Into a wall: the shop's back wall, 2.5 m ahead. It stops against it, never inside.
  const wall = await d(() => {
    const g = window.__dakar.cityGeometry(), shop = window.__dakar.interactables().find(i => i.id === 'plateau:city:salon-tech');
    // the shop's back wall: the long thin collider behind its counter
    const w = g.colliders.filter(c => c.x1 - c.x0 > 10 && c.z1 - c.z0 < 0.5 && Math.abs((c.x0 + c.x1) / 2 - shop.x) < 1 && c.z1 < shop.z).sort((a, b) => b.z1 - a.z1)[0];
    return w ? { x: shop.x, z: w.z0 } : null;
  });
  if (wall) await d(w => window.__dakar.car.place(w.x, w.z - 5, 0), wall);
  await drive(120000, 0, () => window.__dakar.car.info().bumps > 0);
  await page.waitForTimeout(800);
  i2 = await info();
  const front = { x: i2.x + Math.sin(i2.yaw) * 2.2, z: i2.z + Math.cos(i2.yaw) * 2.2 };
  check(`${label}: driving into a wall stops the car against it (never inside)`, !!wall && !(await inWall({ x: i2.x, z: i2.z })) && !(await inWall(front)) && i2.bumps > 0 && i2.z < wall.z, JSON.stringify({ wall, x: i2.x, z: i2.z, bumps: i2.bumps }));

  // 7. Out of the car, parked at the kerb: standing on the pavement side, out of the traffic.
  await d(c => window.__dakar.car.place(c.x, c.z + 2, c.yaw), car0);
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => !window.__dakar.car.info().driving && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  i2 = await info();
  const me = await d(() => window.__dakar.pos());
  const c2 = { x: i2.x, z: i2.z, yaw: i2.yaw };
  check(`${label}: « Sortir de la voiture »: on the pavement side, beside it, it stays parked there`, !i2.driving && (await d(() => window.__dakar.seated())) === null && roadDistance(me.x, me.z) > roadDistance(c2.x, c2.z) + 0.8
    && Math.abs(local(c2, me).lateral) < 2.4 && !(await inWall(me)) && Math.hypot(i2.record.x - i2.x, i2.record.z - i2.z) < 0.05 && !i2.camera && i2.solid,
    JSON.stringify({ me, car: c2, rec: i2.record, solid: i2.solid }));
  await shot('8-parked');

  // 8. Reload: still there; reload mid-drive: parked where it was, the driver standing beside it.
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.car && window.__dakar.pos().hub === 'plateau', null, T);
  await page.waitForTimeout(1200);
  let i3 = await info();
  check(`${label}: after a reload the car is still parked where it was left`, i3.owned && i3.here && Math.hypot(i3.x - i2.x, i3.z - i2.z) < 0.05 && i3.solid, JSON.stringify({ before: { x: i2.x, z: i2.z }, after: { x: i3.x, z: i3.z } }));
  await d(([c, s]) => window.__dakar.place(c.x - s * 2.2, c.z, s * Math.PI / 2), [{ x: i3.x, z: i3.z }, toRoad]);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Ta berline', null, T).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.car.info().driving, null, T).catch(() => {});
  await drive(60000, 0, () => window.__dakar.car.info().speed > 2.5);
  const mid = await info();
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.car && window.__dakar.pos().hub === 'plateau', null, T);
  await page.waitForTimeout(1200);
  i3 = await info();
  const me3 = await d(() => window.__dakar.pos());
  check(`${label}: reload mid-drive: parked where it was, standing beside it, not driving`, mid.driving && !i3.driving && i3.here && Math.hypot(i3.x - mid.x, i3.z - mid.z) < 3 && Math.hypot(me3.x - i3.x, me3.z - i3.z) < 2.8 && (await d(() => window.__dakar.seated())) === null && !(await inWall(me3)),
    JSON.stringify({ mid: { x: mid.x, z: mid.z }, after: { x: i3.x, z: i3.z }, me3 }));

  // 9. Another hub and back: it waits in the Plateau.
  await d(() => window.__dakar.travelTo('corniche'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const away = await info();
  await d(() => window.__dakar.travelTo('plateau'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const back = await info();
  check(`${label}: in another hub it is not there; back in the Plateau it waits where it was`, !away.here && away.owned && back.here && Math.hypot(back.x - i3.x, back.z - i3.z) < 0.05, JSON.stringify({ away: away.here, back: { x: back.x, z: back.z } }));

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} car checks passed`);
process.exit(failed ? 1 : 0);
