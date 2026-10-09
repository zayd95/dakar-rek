// Headless checks of the car rapide passenger experience (src/transport): walk to a stop, wait, board, pay once, sit on a
// free seat, ride past a stop, interruptions (phone, « Arrêter »), ask to get off, alight on the pavement, then a door,
// a hub change and reloads during and after a ride. Desktop (Pikine) and phone portrait (Plateau).
// Usage: node scripts/check-transport.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4213`)
// The line clock is the real clock: the checks only skip the wait for the next car (warp), never the ride itself.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/transport';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const KERB = 5;                                         // carriageway half-width; the pavement runs from 5 to 7 m off the centre line

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch, hub] of [['desktop', { width: 1280, height: 800 }, false, 'pikine'], ['phone', { width: 390, height: 844 }, true, 'plateau']]) {
  const context = await browser.newContext(touch ? { viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const url = `${base}?debug${touch ? '&touch' : ''}`;
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const trip = () => d(() => window.__dakar.transport.trip());
  const line = async () => (await d(() => window.__dakar.transport.lines()))[0];
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const ready = () => page.waitForFunction(() => window.__dakar.focus() !== null && window.__dakar.pos().mode === 'play', null, T);
  /** Wait at stop i: « Monter dans le prochain », skip the wait until the next car is a few seconds away, then board. */
  const board = async (i) => {
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => window.__dakar.transport.trip().phase === 'waiting', null, T).catch(() => {});
    const L = await line(), wait = await d(([l, s]) => window.__dakar.transport.nextAt(l, s), [L.id, i]);
    if (wait > 8) await d(w => window.__dakar.transport.warp(w), wait - 6);
    await page.waitForFunction(() => window.__dakar.transport.trip().phase === 'riding', null, T).catch(() => {});
  };

  await d(h => { window.__dakar.teleport(h); window.__dakar.setHour(10); window.__dakar.state.data.wallet = 2000; }, hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, T);
  let L = await line();
  check(`${label}: ${hub} has a car rapide line with stops and vehicles`, !!L && L.stops.length >= 3 && L.vehicles.length >= 1, L ? `${L.number}: ${L.stops.map(s => s.name).join(', ')} · ${L.vehicles.length} cars · loop ${Math.round(L.period)} s` : 'none');
  const placesOk = (await d(() => window.__dakar.placeList())).filter(p => p.type === 'stop').length === L.stops.length;
  check(`${label}: every stop is a place of the « stop » recipe`, placesOk);
  const st = L.stops[0];

  // 1. Walk to the stop along the pavement: the stop is focused with « Monter dans le prochain ».
  const yaw = Math.atan2(st.dx, st.dz);
  await d(([s, y]) => { window.__dakar.place(s.x - s.dx * 7 - s.rx * 0.2, s.z - s.dz * 7 - s.rz * 0.2, y); window.__dakar.lookYaw(y); }, [st, yaw]);
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(s => Math.hypot(window.__dakar.pos().x - s.x, window.__dakar.pos().z - s.z) < 2.2, st, T).catch(() => {});
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => window.__dakar.focus()?.kind === 'spot', null, T).catch(() => {});
  const f1 = await d(() => window.__dakar.focus());
  check(`${label}: walking up to the stop offers « Monter dans le prochain »`, f1?.primary === 'Monter dans le prochain' && /Arrêt/.test(f1.name), JSON.stringify(f1));
  await shot('1-stop');

  // 2. Every seat taken but one (r3c0): the player must sit exactly there, never on an NPC's seat.
  await d(() => window.__dakar.transport.crowd('r3c0'));
  const wallet0 = await d(() => window.__dakar.state.wallet);
  const ledger0 = await d(() => window.__dakar.state.data.ledger.length);
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.transport.trip().phase === 'waiting', null, T).catch(() => {});
  await page.waitForFunction(() => /car rapide/i.test(window.__dakar.transport.card()), null, T).catch(() => {});
  check(`${label}: waiting at the stop shows the line and the next car`, (await trip()).phase === 'waiting' && /Prochain car rapide|est là/.test(await d(() => window.__dakar.transport.card())), await d(() => window.__dakar.transport.card()));
  const wait = await d(([l]) => window.__dakar.transport.nextAt(l, 0), [L.id]);
  if (wait > 8) await d(w => window.__dakar.transport.warp(w), wait - 6);
  await page.waitForFunction(() => window.__dakar.transport.lines()[0].vehicles.some(v => v.dwell === 0), null, T).catch(() => {});
  await shot('2-arrival');
  await page.waitForFunction(() => ['boarding', 'riding'].includes(window.__dakar.transport.trip().phase), null, T).catch(() => {});
  await d(() => window.__dakar.act());                                       // pressing again while boarding: no second fare
  await page.waitForFunction(() => window.__dakar.transport.trip().phase === 'riding', null, T).catch(() => {});
  let tr = await trip();
  const seats = (await line()).vehicles.find(v => v.id === tr.vehicle)?.seats ?? [];
  const mine = seats.filter(s => s.occupant === 'player');
  check(`${label}: boarding sits the player on the only free seat (never an NPC's)`, tr.phase === 'riding' && tr.seat?.endsWith('r3c0') && mine.length === 1 && mine[0].id === tr.seat && (await d(() => window.__dakar.seated())) === tr.seat, JSON.stringify({ tr, mine }));
  await d(() => window.__dakar.transport.crowd(null));
  const wallet1 = await d(() => window.__dakar.state.wallet);
  const fares = await d(n => window.__dakar.state.data.ledger.slice(n).filter(l => /Car rapide/.test(l.label)), ledger0);
  check(`${label}: the fare is paid once (${L.fare} F, one wallet line)`, wallet0 - wallet1 === L.fare && fares.length === 1 && tr.paid === 1, JSON.stringify({ wallet0, wallet1, fares, paid: tr.paid }));
  check(`${label}: the player's space is the vehicle (chat, presence, targets)`, tr.space === tr.vehicle && /:rapide:/.test(tr.space ?? '') && tr.camera, JSON.stringify(tr));
  await ready();
  const f2 = await d(() => window.__dakar.focus());
  check(`${label}: riding, the main action is « Descendre au prochain arrêt »`, f2?.kind === 'self' && /Descendre/.test(f2.primary ?? '') && f2.all.includes('Changer de vue') && !f2.all.includes('Se lever'), JSON.stringify(f2));
  await page.waitForFunction(v => { const x = window.__dakar.transport.lines()[0].vehicles.find(c => c.id === v); return x && x.v > 4; }, tr.vehicle, T).catch(() => {});
  const p0 = await d(() => window.__dakar.pos());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  const p1 = await d(() => window.__dakar.pos());
  check(`${label}: moving the stick does not stand the player up mid-ride; the body rides along`, (await d(() => window.__dakar.seated())) === tr.seat && Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, JSON.stringify({ p0, p1 }));
  await shot('3-riding');

  // 3. Interruptions: the phone (menu key) and « Arrêter » leave the player seated, riding, never stuck.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T).catch(() => {});
  const q0 = await d(() => window.__dakar.pos());
  await page.waitForTimeout(2500);
  const q1 = await d(() => window.__dakar.pos());
  check(`${label}: phone open mid-ride: still seated, the car keeps going`, (await d(() => window.__dakar.phoneInfo().open)) && (await d(() => window.__dakar.seated())) === tr.seat && Math.hypot(q1.x - q0.x, q1.z - q0.z) > 0.5, JSON.stringify({ q0, q1 }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__dakar.phoneInfo().open && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  await ready();
  await d(() => window.__dakar.more());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  await page.locator('#modal .item', { hasText: 'Parler au voisin' }).first().click().catch(() => {});
  await page.waitForFunction(() => window.__dakar.activity()?.id === 'voisin', null, T).catch(() => {});
  const talking = await d(() => window.__dakar.activity());
  await d(() => window.__dakar.act());                                       // « Arrêter »
  await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  tr = await trip();
  check(`${label}: « Arrêter » mid-ride stops the talk, the ride goes on`, talking?.id === 'voisin' && tr.phase === 'riding' && (await d(() => window.__dakar.seated())) === tr.seat, JSON.stringify({ talking, tr }));

  // 4. Watching Dakar pass: the other views.
  for (const [i, name] of [[1, '4-window'], [2, '5-high']]) {
    await ready();
    await d(() => window.__dakar.more());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await page.locator('#modal .item', { hasText: 'Changer de vue' }).first().click().catch(() => {});
    await page.waitForFunction(v => window.__dakar.transport.trip().view === v, i, T).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(name);
  }
  await ready();
  await d(() => window.__dakar.more());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  await page.locator('#modal .item', { hasText: 'Changer de vue' }).first().click().catch(() => {});
  check(`${label}: three passenger views (behind, window, high)`, (await trip()).view === 0);

  // 5. Ride past at least one stop, then ask to get off at the next one.
  await page.waitForFunction(() => window.__dakar.transport.trip().passed >= 1 && window.__dakar.transport.lines()[0].vehicles.find(c => c.id === window.__dakar.transport.trip().vehicle)?.dwell === -1, null, T).catch(() => {});
  tr = await trip();
  check(`${label}: the car rapide passes a stop and the player stays on board`, tr.phase === 'riding' && tr.passed >= 1, JSON.stringify(tr));
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.transport.trip().alightAt >= 0, null, T).catch(() => {});
  tr = await trip();
  const card = await d(() => window.__dakar.transport.card());
  check(`${label}: « Descendre au prochain arrêt » is heard (stop requested)`, tr.alightAt >= 0 && /Arrêt demandé/.test(card), card);
  await shot('6-requested');
  const target = (await line()).stops[tr.alightAt];
  await page.waitForFunction(() => window.__dakar.transport.trip().phase === 'idle' && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const p2 = await d(() => window.__dakar.pos());
  tr = await trip();
  const geo = await d(() => window.__dakar.cityGeometry());
  const inWall = geo.colliders.some(c => p2.x > c.x0 - 0.3 && p2.x < c.x1 + 0.3 && p2.z > c.z0 - 0.3 && p2.z < c.z1 + 0.3);
  const legX = target.x - target.rx * 6.25, legZ = target.z - target.rz * 6.25;   // the stop spot is 6.25 m right of the centre line
  const off = (p2.x - legX) * target.rx + (p2.z - legZ) * target.rz;
  const cars = (await line()).vehicles;
  const inCar = cars.some(c => { const lx = (p2.x - c.x) * Math.cos(c.yaw) - (p2.z - c.z) * Math.sin(c.yaw), lz = (p2.x - c.x) * Math.sin(c.yaw) + (p2.z - c.z) * Math.cos(c.yaw); return Math.abs(lx) < 1.2 && Math.abs(lz) < 3.5; });
  check(`${label}: off at the requested stop, on the pavement (not in the road, a wall or the car)`, tr.phase === 'idle' && (await d(() => window.__dakar.seated())) === null && Math.hypot(p2.x - target.alight.x, p2.z - target.alight.z) < 0.6 && off > KERB && off < KERB + 2 && !inWall && !inCar && p2.mode === 'play' && Math.abs(p2.y - 0.1) < 0.05,
    JSON.stringify({ p2, stop: target.name, off: off.toFixed(2), inWall, inCar }));
  check(`${label}: back in the street: street space, follow camera, card hidden`, tr.space === null && !tr.camera && (await d(() => window.__dakar.transport.card())) === '' && (await d(() => window.__dakar.state.wallet)) === wallet1, JSON.stringify(tr));
  const saved = await d(() => ({ x: window.__dakar.state.data.x, z: window.__dakar.state.data.z }));
  check(`${label}: the save after the ride is the pavement where the player got off`, Math.hypot(saved.x - p2.x, saved.z - p2.z) < 0.6, JSON.stringify(saved));
  await shot('7-alighted');

  // 6. Right after: a door (in and out) and a hub change, without errors or leftovers.
  if (!touch) {
    await d(() => window.__dakar.enter('home'));
    await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T).catch(() => {});
    const inside = await d(() => window.__dakar.pos());
    await d(() => window.__dakar.exit());
    await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
    check(`${label}: entering and leaving the room right after the ride`, inside.x > 900 && (await trip()).phase === 'idle', JSON.stringify(inside));
  }
  const other = hub === 'pikine' ? 'corniche' : 'almadies';
  await d(h => window.__dakar.travelTo(h), other);
  await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', other, T).catch(() => {});
  const L2 = await line();
  check(`${label}: changing hub right after: the new hub has its own line, no trip left over`, (await d(() => window.__dakar.pos().hub)) === other && L2?.id !== L.id && (await trip()).phase === 'idle', `${L2?.number}`);

  // 7. Hub change mid-ride: the trip ends cleanly (not seated, not in the vehicle space).
  await d(h => { window.__dakar.teleport(h); window.__dakar.state.data.wallet = 2000; }, hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, T);
  L = await line();
  await d(s => window.__dakar.place(s.x, s.z, s.yaw + Math.PI), L.stops[1]);
  await page.waitForFunction(() => window.__dakar.focus()?.kind === 'spot', null, T).catch(() => {});
  await board(1);
  const riding2 = (await trip()).phase === 'riding';
  await d(h => window.__dakar.travelTo(h), other);
  await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.pos().mode === 'play', other, T).catch(() => {});
  tr = await trip();
  check(`${label}: travelling to another hub mid-ride ends the trip cleanly`, riding2 && tr.phase === 'idle' && tr.space === null && !tr.camera && (await d(() => window.__dakar.seated())) === null, JSON.stringify(tr));

  // 8. Reload mid-ride: the player comes back on a stop's pavement, standing, not in a moving vehicle.
  await d(h => { window.__dakar.teleport(h); window.__dakar.state.data.wallet = 2000; }, hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, T);
  L = await line();
  await d(s => window.__dakar.place(s.x, s.z, s.yaw + Math.PI), L.stops[2]);
  await page.waitForFunction(() => window.__dakar.focus()?.kind === 'spot', null, T).catch(() => {});
  await board(2);
  await page.waitForFunction(v => { const t = window.__dakar.transport.trip(); const x = window.__dakar.transport.lines()[0].vehicles.find(c => c.id === t.vehicle); return x && x.v > 3; }, null, T).catch(() => {});
  const riding3 = await trip();
  const safe = await d(() => window.__dakar.transport.safePlace());
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await page.waitForTimeout(1500);
  const p3 = await d(() => window.__dakar.pos());
  const stops3 = (await line()).stops;
  const onStop = stops3.some(s => Math.hypot(p3.x - s.alight.x, p3.z - s.alight.z) < 0.6);
  check(`${label}: reload mid-ride resumes standing on a stop's pavement`, riding3.phase === 'riding' && !!safe && p3.hub === hub && onStop && (await d(() => window.__dakar.seated())) === null && (await trip()).phase === 'idle', JSON.stringify({ p3, safe }));
  await shot('8-after-reload');

  // 9. Draw calls of the transport layer near a stop with a car standing there (budget for cheap phones).
  await d(s => { window.__dakar.place(s.x - s.dx * 6, s.z - s.dz * 6, Math.atan2(s.dx, s.dz)); window.__dakar.lookYaw(Math.atan2(s.dx, s.dz)); }, stops3[0]);
  const w2 = await d(([l]) => window.__dakar.transport.nextAt(l, 0), [(await line()).id]);
  if (w2 > 6) await d(w => window.__dakar.transport.warp(w), w2 - 2);
  await page.waitForFunction(() => window.__dakar.transport.lines()[0].vehicles.some(v => v.dwell === 0), null, T).catch(() => {});
  await page.waitForTimeout(1200);
  const withT = await d(() => window.__dakar.drawCalls());
  await d(() => window.__dakar.transport.show(false)); await page.waitForTimeout(1500);
  const without = await d(() => window.__dakar.drawCalls());
  await d(() => window.__dakar.transport.show(true));
  check(`${label}: transport draw calls near a busy stop stay small`, withT - without < 90, `${withT} with, ${without} without vehicles and stops (people at the stops not hidden)`);

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} transport checks passed`);
process.exit(failed ? 1 : 0);
