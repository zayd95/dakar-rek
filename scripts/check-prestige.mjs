// Headless checks of the two upper rungs of the player's cars (src/transport/premiumCars.ts on src/transport/ownedModule.ts): « Berline neuve » (`berline`) and
// « 4 × 4 de luxe » (`tout_terrain`), sold by « Prestige Auto » in the Almadies on kit bodies (the generated bodies of Stages B and C replace them later).
// Same walk as scripts/check-car.mjs: the dealer's desk lists the vehicle with its catalogue price, a confirmation shows the price and the wallet, paid once through the asset
// model, listed in « Biens », delivered at the kerb with the keys line; solid when parked; « Monter (conducteur) »; drive with the keys (desktop) or the joystick (phone);
// steering; the views; « Sortir »; still there after a reload (also mid-drive) and after a trip to another hub.
// Usage: ASSET=berline|tout_terrain node scripts/check-prestige.mjs [baseUrl] [outDir]   (a running build; ONLY=desktop|phone runs one viewport)
import { chromium } from 'playwright';
import { realTouch, padDrive } from './lib/realTouch.mjs';
import fs from 'node:fs';

const ASSET = process.env.ASSET ?? 'berline';
const CONF = {
  berline: { key: 'berline', dealer: 'Prestige Auto · Berlines', item: 'Berline neuve', mine: 'Ta berline', ledger: /Berline neuve/, keys: /clés/, seat: /car:berline:driver$/, space: 'almadies:car:berline', buy: 'Acheter la berline neuve' },
  tout_terrain: { key: 'suv', dealer: 'Prestige Auto · 4 × 4', item: '4 × 4 de luxe', mine: 'Ton 4 × 4', ledger: /4 × 4 de luxe/, keys: /clés/, seat: /car:tout_terrain:driver$/, space: 'almadies:car:tout_terrain', buy: 'Acheter le 4 × 4 de luxe' },
}[ASSET];
const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? `docs/screenshots/${ASSET}`;
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
  await context.addInitScript(k => { window.__KEY = k; window.__veh = () => window.__dakar?.[k]; }, CONF.key);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}${process.env.EXTRA ?? ''}`, { timeout: 120000 });   // EXTRA='&vehicleModel=glb': the prepared GLB body (src/actors/glbVehicle.ts)
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  // the animated wheels of the vehicle being driven: a prepared GLB body has four separate wheels (spin and steering by wheel); a kit body turns its wheels in a shader (one spin, one steering angle)
  await page.evaluate(() => {
    window.__rig = () => {
      const D = window.__dakar, car = window.__veh().info(); let g = null, best = 1e9;
      D.three.scene.traverse(o => { if (o.userData?.glbRig || o.userData?.kitAnim) { const q = o.getWorldPosition(D.three.camera.position.clone()), dd = Math.hypot(q.x - car.x, q.z - car.z); if (dd < best) { best = dd; g = o; } } });
      if (!g) return null;
      if (g.userData.glbRig) return g.userData.glbRig.wheels.map(w => ({ n: w.spin.name, spin: w.spin.rotation.x, steer: w.steer ? w.steer.rotation.y : 0 }));
      const k = g.userData.kitAnim; return k?.u ? [{ n: 'kit_front', spin: k.spin, steer: k.u.uSteer.value, lod: k.lod ? k.lod.getCurrentLevel() : -1 }] : null;
    };
  });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const tr = touch ? await realTouch(page) : null;
  const info = () => d(() => window.__veh().info());
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
      await padDrive(page, tr, { steer, brake: back, hold });                                     // real fingers: the gas (or brake) pedal, and the joystick to steer
    }
  };
  const view = async want => {
    await ready();
    await d(() => window.__dakar.more());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await page.locator('#modal .item', { hasText: 'Changer de vue' }).first().click().catch(() => {});
    await page.waitForFunction(v => window.__veh().info().view === v, want, T).catch(() => {});
    await page.waitForTimeout(2500);
    return (await info()).view;
  };

  await d(() => { window.__dakar.teleport('almadies'); window.__dakar.setHour(10); window.__dakar.state.data.wallet = 200000000; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__veh().info().dealer, null, T);
  const i0 = await info(), dealer = i0.dealer, price = i0.price;
  check(`${label}: the Almadies has the ${CONF.dealer} corner: two vehicles on display on the pavement`, !!dealer && dealer.displays >= 2, JSON.stringify(dealer));
  // the road is on the side of the delivery spot: stand on the pavement between the counter and the kerb
  const near = v => [-120, -60, 0, 60, 120].reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b), rx = near(dealer.x), rz = near(dealer.z);
  const road = Math.abs(dealer.z - rz) < Math.abs(dealer.x - rx) ? { x: 0, z: Math.sign(rz - dealer.z) || 1 } : { x: Math.sign(rx - dealer.x) || 1, z: 0 };   // from the counter across the pavement to the nearest road
  const toward = Math.atan2(road.x, road.z), facing = toward + Math.PI;                                  // yaw facing the road, facing the counter

  // 0. The showroom from the pavement (the cars on their lots, the desk at the back).
  if (dealer) {
    await d(([p, q, r]) => { const h = r.x ? { x: 0, z: Math.sign(q.z - p.z) || 1 } : { x: Math.sign(q.x - p.x) || 1, z: 0 }, lx = p.x - h.x * 4, lz = p.z - h.z * 4; window.__dakar.cam([lx + r.x * 15 + h.x * 3, 4.5, lz + r.z * 15 + h.z * 3], [lx, 1.0, lz]); }, [dealer, dealer.delivery, road]);
    await shot('0-showroom');
    await d(() => window.__dakar.cam(null));
  }

  // 1. The dealer: « Voir les articles » at the desk, the price before confirming, then paid once.
  await d(([p, r, y]) => window.__dakar.place(p.x + r.x * 0.7 + (r.x ? 0 : 0.4), p.z + r.z * 0.7 + (r.z ? 0 : 0.4), y), [dealer, road, facing]);
  await page.waitForFunction(n => new RegExp(n).test(window.__dakar.focus()?.name ?? ''), CONF.dealer, T).catch(() => {});
  const f1 = await d(() => window.__dakar.focus());
  check(`${label}: the dealer counter offers its catalogue`, new RegExp(CONF.dealer).test(f1?.name ?? '') && f1.all.includes('Voir les articles'), JSON.stringify(f1));
  await shot('1-dealer');
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const item = await d(n => [...document.querySelectorAll('#modal .item')].map(b => b.textContent).find(t => t.includes(n) && /Acheter/.test(t)) ?? null, CONF.item);
  const digits = s => (s ?? '').replace(/[^0-9]/g, '');
  check(`${label}: the catalogue shows ${CONF.item} with its catalogue price`, (item ?? '').includes(CONF.item) && price > 0 && digits(item).includes(String(price)) && /\sF/.test(item ?? ''), String(item));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.length);
  await page.locator('#modal .item', { hasText: 'Acheter' }).first().click();
  await page.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
  const confirmText = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  check(`${label}: a confirmation shows the price and the wallet before paying`, confirmText.includes(CONF.buy) && digits(confirmText).includes(String(price)) && /Ton argent/.test(confirmText) && (await d(() => window.__dakar.state.wallet)) === w0, confirmText.slice(0, 160));
  await shot('2-confirm');
  await page.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
  await page.waitForFunction(() => window.__veh().info().owned && window.__veh().info().here, null, T).catch(() => {});
  const bought = await info(), w1 = await d(() => window.__dakar.state.wallet);
  const lines = await d(n => window.__dakar.state.data.ledger.slice(n), l0);
  const rec = bought.record;
  check(`${label}: bought once: −price, one wallet line, delivered at the kerb`, bought.owned && bought.here && w0 - w1 === price && lines.length === 1 && CONF.ledger.test(lines[0].label) && bought.bought === 1 && bought.asset?.paid === price
    && Math.hypot(rec.x - dealer.delivery.x, rec.z - dealer.delivery.z) < 0.05 && Math.abs(roadDistance(rec.x, rec.z) - 4.3) < 0.2, JSON.stringify({ w0, w1, lines, rec }));
  const keys = await page.waitForFunction(() => /clés/.test(document.querySelector('#toast')?.textContent ?? ''), null, { timeout: 8000 }).then(() => d(() => document.querySelector('#toast')?.textContent ?? ''), () => '');
  check(`${label}: the salesman hands over the keys (Wolof with its French gloss)`, /clés/.test(keys) && /Jërëjëf/.test(keys) && /porte/.test(keys) && true,
    JSON.stringify({ keys }));
  await d(([p, q, r]) => { const h = r.x ? { x: 0, z: Math.sign(q.z - p.z) || 1 } : { x: Math.sign(q.x - p.x) || 1, z: 0 }, lx = p.x - h.x * 4, lz = p.z - h.z * 4; window.__dakar.cam([lx + r.x * 15 + h.x * 3, 4.5, lz + r.z * 15 + h.z * 3], [lx, 1.0, lz]); }, [dealer, dealer.delivery, road]);
  await shot('2b-delivered-outside');
  await d(() => window.__dakar.cam(null));
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const again = await d(n => [...document.querySelectorAll('#modal .item')].find(b => b.textContent.includes(n) && /Acheter/.test(b.textContent))?.className ?? '', CONF.item);
  await d(() => document.querySelector('#modal .item.close')?.click());
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const biens = await d(() => { window.__dakar.assetsApp(); return [...document.querySelectorAll('#modal.on .item')].map(b => b.textContent ?? ''); });
  await d(() => document.querySelector('#modal .item.close')?.click());
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  check(`${label}: « Biens » lists the car once`, biens.filter(t => t.includes(CONF.item)).length === 1, JSON.stringify(biens.filter(t => t.includes(CONF.item))));
  check(`${label}: it cannot be bought twice`, /disabled|off/.test(again) || (await d(() => window.__dakar.state.wallet)) === w1, again);

  // 2. Parked, it is solid: walking into it from the pavement stops at its side.
  const car0 = { x: rec.x, z: rec.z, yaw: rec.yaw };
  const pave = { x: car0.x - road.x * 2.2, z: car0.z - road.z * 2.2 };
  await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [pave, toward]);
  await page.waitForTimeout(800);
  if (!touch) { await page.keyboard.down('KeyW'); await page.waitForFunction(c => Math.hypot(window.__dakar.pos().x - c.x, window.__dakar.pos().z - c.z) < 1.2, car0, { timeout: 15000 }).catch(() => {}); await page.keyboard.up('KeyW'); }
  else {
    const j = await tr.centre('#joy'); await tr.down(1, j.x, j.y); await tr.move(1, j.x, j.y - 42);
    await page.waitForFunction(c => Math.hypot(window.__dakar.pos().x - c.x, window.__dakar.pos().z - c.z) < 1.2, car0, { timeout: 15000 }).catch(() => {});
    await tr.up(1);
  }
  const pw = await d(() => window.__dakar.pos());
  check(`${label}: the parked car is solid (walking into it stops at its side)`, bought.solid && Math.abs(local(car0, pw).lateral) > 0.85, JSON.stringify({ solid: bought.solid, lateral: local(car0, pw).lateral.toFixed(2), walked: Math.hypot(pw.x - pave.x, pw.z - pave.z).toFixed(2), pave, car0, pw, road }));

  // 3. « Monter (conducteur) ».
  await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [pave, toward]);
  await page.waitForFunction(n => window.__dakar.focus()?.name === n, CONF.mine, T).catch(() => {});
  const f2 = await d(() => window.__dakar.focus());
  check(`${label}: walking up to it offers « Monter (conducteur) »`, f2?.primary === 'Monter (conducteur)', JSON.stringify(f2));
  await shot('3-delivered');
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__veh().info().driving, null, T).catch(() => {});
  let i2 = await info();
  await page.waitForFunction(() => window.__dakar.clip() === 'Sit', null, { timeout: 30000 }).catch(() => {});
  const clip = await d(() => window.__dakar.clip());
  check(`${label}: at the wheel: driver seat (seated), own interaction space, still in the street for the others, chase view`, i2.driving && CONF.seat.test(await d(() => window.__dakar.seated()) ?? '') && i2.space === CONF.space && i2.presence === 'street' && i2.camera && i2.view === 'chase' && !i2.solid && clip === 'Sit',
    JSON.stringify({ ...i2, clip }));
  await shot('4-in');

  // 4. Drive along the kerb lane, then steer.
  const p0 = { x: i2.x, z: i2.z };
  await drive(120000, 0, p => { const m = window.__veh().info(); return Math.hypot(m.x - p.x, m.z - p.z) > 6 && m.speed > 3; }, p0);
  i2 = await info();
  const moved = Math.hypot(i2.x - p0.x, i2.z - p0.z);
  check(`${label}: the throttle moves the car and the card shows the speed`, moved > 5 && /km\/h/.test(await d(() => window.__veh().card())), `${moved.toFixed(1)} m, ${await d(() => window.__veh().card())}`);
  await shot('5-driving');
  // wheel animation: all four spin while it rolls (two readings a moment apart), the rear pair never turns
  const reads = []; for (let k = 0; k < 4; k++) { reads.push(await d(() => ({ rig: window.__rig(), speed: window.__veh().info().speed }))); await d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150))))); }
  const spun = reads[0].rig && reads[0].rig.length >= 1 && reads[0].rig.every((w, i) => reads.some((r, k) => k > 0 && Math.abs(r.rig[i].spin - reads[k - 1].rig[i].spin) > 0.01));
  check(`${label}: the wheels spin while the vehicle rolls`, !!spun, JSON.stringify({ speed: reads.map(r => +r.speed.toFixed(1)), spin: reads.at(-1).rig?.map(w => `${w.n} ${w.spin.toFixed(2)} lod${w.lod ?? ''}`) }));
  const y0 = i2.yaw;
  await d(() => { window.__maxSteer = 0; window.__steerRead = setInterval(() => { const r = window.__rig(); if (r) window.__maxSteer = Math.max(window.__maxSteer, ...r.filter(w => /_f[lr]$|^kit_front$/.test(w.n)).map(w => Math.abs(w.steer))); window.__rearSteer = Math.max(window.__rearSteer ?? 0, ...r.filter(w => /_r[lr]$/.test(w.n)).map(w => Math.abs(w.steer))); }, 40); });
  await drive(120000, 1, y => window.__veh().info().yaw < y - 0.3, y0);
  const steerRead = await d(() => { clearInterval(window.__steerRead); return { front: window.__maxSteer, rear: window.__rearSteer ?? 0 }; });
  check(`${label}: steering turns the front wheels (never the rear ones)`, steerRead.front > 0.05 && steerRead.rear < 1e-6, JSON.stringify(steerRead));
  i2 = await info();
  check(`${label}: steering right turns the car right`, i2.yaw < y0 - 0.2, `${y0.toFixed(2)} → ${i2.yaw.toFixed(2)}`);
  // brake to a stop (down on the stick)
  await drive(60000, 0, () => Math.abs(window.__veh().info().speed) < 0.3, null, true);

  // 5. The views: at the wheel (the driver's body hidden, the dashboard ahead), high above, back behind the car.
  await d(c => window.__veh().place(c.x, c.z, c.yaw), car0);                // back at the kerb, looking down the road
  const views = (await info()).views ?? ['chase', 'volant', 'haut'], others = views.filter(v => v !== 'chase'), seen = [];
  for (const want of others) { seen.push(await view(want)); await shot(want === 'volant' ? '6-volant' : '7-haut'); }
  const v3 = await view('chase');
  check(`${label}: the views (${views.join(', ')}; the wheel view only when the body has a cabin to sit in) cycle`, others.includes('haut') && seen.every((v, i) => v === others[i]) && v3 === 'chase', `${seen.join(' ')} ${v3}`);

  // 7. Out of the car, parked at the kerb: standing on the pavement side, out of the traffic.
  await d(c => window.__veh().place(c.x + Math.sin(c.yaw) * 2, c.z + Math.cos(c.yaw) * 2, c.yaw), car0);
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => !window.__veh().info().driving && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  i2 = await info();
  const me = await d(() => window.__dakar.pos());
  const c2 = { x: i2.x, z: i2.z, yaw: i2.yaw };
  check(`${label}: « Sortir de la voiture »: on the pavement side, beside it, it stays parked there`, !i2.driving && (await d(() => window.__dakar.seated())) === null && roadDistance(me.x, me.z) > roadDistance(c2.x, c2.z) + 0.8
    && Math.abs(local(c2, me).lateral) < 2.4 && !(await inWall(me)) && Math.hypot(i2.record.x - i2.x, i2.record.z - i2.z) < 0.05 && !i2.camera && i2.solid,
    JSON.stringify({ me, car: c2, rec: i2.record, solid: i2.solid }));
  await shot('8-parked');

  // 8. Reload: still there; reload mid-drive: parked where it was, the driver standing beside it.
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__veh?.() && window.__dakar.pos().hub === 'almadies', null, T);
  await page.waitForTimeout(1200);
  let i3 = await info();
  check(`${label}: after a reload the car is still parked where it was left`, i3.owned && i3.here && Math.hypot(i3.x - i2.x, i3.z - i2.z) < 0.05 && i3.solid, JSON.stringify({ before: { x: i2.x, z: i2.z }, after: { x: i3.x, z: i3.z } }));
  await d(([c, r, y]) => window.__dakar.place(c.x - r.x * 2.2, c.z - r.z * 2.2, y), [{ x: i3.x, z: i3.z }, road, toward]);
  await page.waitForFunction(n => window.__dakar.focus()?.name === n, CONF.mine, T).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__veh().info().driving, null, T).catch(() => {});
  await drive(60000, 0, () => window.__veh().info().speed > 2.5);
  const mid = await info();
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__veh?.() && window.__dakar.pos().hub === 'almadies', null, T);
  await page.waitForTimeout(1200);
  i3 = await info();
  const me3 = await d(() => window.__dakar.pos());
  check(`${label}: reload mid-drive: parked where it was, standing beside it, not driving`, mid.driving && !i3.driving && i3.here && Math.hypot(i3.x - mid.x, i3.z - mid.z) < 3 && Math.hypot(me3.x - i3.x, me3.z - i3.z) < 2.8 && (await d(() => window.__dakar.seated())) === null && !(await inWall(me3)),
    JSON.stringify({ mid: { x: mid.x, z: mid.z }, after: { x: i3.x, z: i3.z }, me3 }));

  // 9. Another hub and back: it waits in the Plateau.
  await d(() => window.__dakar.travelTo('corniche'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const away = await info();
  await d(() => window.__dakar.travelTo('almadies'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const back = await info();
  check(`${label}: in another hub it is not there; back in the Plateau it waits where it was`, !away.here && away.owned && back.here && Math.hypot(back.x - i3.x, back.z - i3.z) < 0.05, JSON.stringify({ away: away.here, back: { x: back.x, z: back.z } }));

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} premium car checks passed`);
process.exit(failed ? 1 : 0);
