// Headless checks of getting to the fight (src/arena/arrival.ts, docs/ARENA_VISIT.md « Getting there »):
//   by moto: ride into the guarded parking by the gate; the gardien greets and asks 100 F (price shown before paying,
//   paid once); the moto goes into the place he keeps; walk to the gate; after the gala the rows empty, the moto is
//   still there, ride away and he says goodbye (Wolof with its gloss, French);
//   by car rapide: on a fight evening the Ligne 23 cars (evening route 23s) carry fans in their écurie's colours; ride
//   from « Marché » to « Arène », get off with a group that walks to the queue.
//   by car: far away the goal line and « Ce soir » suggest one's own car; at the wheel the goal points to the guarded car
//   places on the side street east of the arena; the gardien du parking greets and asks 200 F (price first, paid once);
//   the car goes into the place he keeps; after the gala the places empty, the car is still there, drive out forward
//   and he says goodbye.
// Usage: node scripts/check-arena-arrival.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4213`)
// On a shared machine run browsers one at a time: flock /tmp/dakar-browser.lock node scripts/check-arena-arrival.mjs …
// ONLY=desktop or ONLY=phone runs one viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/arena-arrival';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const results = []; let failed = 0;
/** Game seconds of the after-gala emptying skipped at once (frames are slow on the test machine). */
const LOT_SKIP = 90;
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
  const info = () => d(() => window.__dakar.arrival.info());
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const until = (fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true).catch(() => false);
  const ready = () => until(() => window.__dakar.pos().mode === 'play', null, 60000);
  /** Hold a key (desktop) or push the joystick (phone: dy −1 up / +1 down) until `fn` holds in the page or `ms` passes. */
  const hold = async (key, dy, fn, arg, ms) => {
    if (!touch) { await page.keyboard.down(key); await until(fn, arg, ms); await page.keyboard.up(key); return; }
    const j = await d(() => { const r = document.getElementById('joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(j.x, j.y); await page.mouse.down(); await page.mouse.move(j.x, j.y + dy * 42, { steps: 4 });
    await until(fn, arg, ms); await page.mouse.up();
  };
  const said = async re => (await info()).said.some(s => re.test(s));

  // the evening: Pikine at 17 h 36, the doors open; the player owns a Jakarta (the asset model, delivered at the garage)
  await d(() => { const D = window.__dakar; D.teleport('pikine'); D.setHour(17.6); D.state.data.wallet = 400000; D.state.data.needs.energie = 100; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.arrival.info(), null, T);
  await d(() => window.__dakar.buyAsset('jakarta'));
  await until(() => window.__dakar.moto.info().here, null, 60000);
  await until(() => window.__dakar.arrival.info().motos >= 2, null, 60000);
  let a = await info();
  const lot = { gardien: a.gardien, reserved: a.reserved, area: a.area };
  check(`${label}: the parking by the gate is there on a fight evening: the gardien, other motos in the rows, his place for the player kept free`,
    a.present && a.motos >= 2 && !a.taken.some(s => Math.hypot(s.x - lot.reserved.x, s.z - lot.reserved.z) < 0.5) && a.drawCalls <= 3, JSON.stringify({ street: a.street, motos: a.motos, slots: a.slots, drawCalls: a.drawCalls }));
  const geo = await d(() => window.__dakar.cityGeometry());
  const inWall = p => geo.colliders.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1);

  // 1. Ride in from the pavement, nose to the wall, and get off in the parking
  await d(p => { window.__dakar.moto.place(p.x, p.z - 3.8, 0); window.__dakar.place(p.x - 1.1, p.z - 3.8, 0); }, lot.reserved);
  await until(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, 30000);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.moto.info().driving, null, 30000);
  await hold('KeyW', -1, z => window.__dakar.moto.info().z > z, lot.reserved.z - 1.4, 8000);
  let m = await d(() => window.__dakar.moto.info());
  if (m.z < lot.area.z0 + 0.5) await d(p => window.__dakar.moto.place(p.x, p.z - 0.8, 0), lot.reserved);   // a slow frame: the last metre
  await d(() => window.__dakar.act());                                                                           // « Descendre de la moto »
  await until(() => !window.__dakar.moto.info().driving && window.__dakar.arrival.info().said.length > 0, null, 30000);
  a = await info();
  check(`${label}: getting off in the parking, the gardien greets and names his price (Wolof with its gloss, French)`, a.inLot && !a.paid && await said(/Le gardien : .*Na nga def.*100\s?F la soirée/), JSON.stringify(a.said));
  await shot('1-arrived');

  // 2. The gardien: « Faire garder ta moto (100 F) », the price before paying, paid once; the moto into his place
  await d(g => window.__dakar.place(g.x, g.z - 1.3, 0), lot.gardien);
  await until(() => /gardien/i.test(window.__dakar.focus()?.name ?? ''), null, 30000);
  const f1 = await d(() => window.__dakar.focus());
  check(`${label}: the gardien offers to keep the moto, the price on the button`, /Faire garder ta moto/.test(f1?.primary ?? '') && /100/.test(f1?.primary ?? ''), JSON.stringify(f1));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.length);
  await d(() => window.__dakar.act());
  await until(() => /Payer/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, 30000);
  const menu = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  check(`${label}: the price is shown before anything is paid`, /Payer 100\s?F/.test(menu) && (await d(() => window.__dakar.state.wallet)) === w0, menu.slice(0, 140));
  await shot('2-price');
  await page.locator('#modal .item', { hasText: 'Payer' }).first().click();
  await until(() => window.__dakar.arrival.info().paid, null, 60000);
  await ready();
  a = await info();
  const lines = await d(n => window.__dakar.state.data.ledger.slice(n), l0);
  check(`${label}: paid once (−100 F, one wallet line), the moto in the place next to him`, a.paid && w0 - (await d(() => window.__dakar.state.wallet)) === 100 && lines.length === 1 && !!a.mine && Math.hypot(a.mine.x - lot.reserved.x, a.mine.z - lot.reserved.z) < 0.05 && await said(/100\s?F, jërëjëf/),
    JSON.stringify({ lines, mine: a.mine, reserved: lot.reserved }));
  const f2 = await d(() => window.__dakar.focus());
  check(`${label}: paid tonight: no second fee, a word with him instead`, !(f2?.all ?? []).some(l => /Faire garder/.test(l)) && (f2?.all ?? []).includes('Saluer le gardien'), JSON.stringify(f2));
  await d(g => { window.__dakar.cam([g.x - 9, 6, g.z - 9], [g.x + 3, 0.6, g.z + 2]); }, lot.gardien);
  await shot('3-parking');
  await d(() => window.__dakar.cam(null));

  // 3. Walk to the gate: a short walk west along the front of the arena, nothing in the way
  const gate = (await d(() => window.__dakar.arenaOut())).gate;
  const path = Array.from({ length: 40 }, (_, i) => ({ x: lot.gardien.x - 0.6 + (gate.x + 1.5 - lot.gardien.x + 0.6) * (i / 39), z: gate.z - 1.9 }));
  check(`${label}: from the parking to the gate the way is clear`, !path.some(inWall) && Math.hypot(lot.gardien.x - gate.x, lot.gardien.z - gate.z) < 16, `${Math.round(Math.hypot(lot.gardien.x - gate.x, lot.gardien.z - gate.z))} m`);
  await d(([g, z]) => window.__dakar.place(g.x - 0.6, z, -Math.PI / 2), [lot.gardien, gate.z - 1.9]);
  await hold('KeyW', -1, x => window.__dakar.pos().x < x, gate.x + 1.6, 40000);
  const p1 = await d(() => window.__dakar.pos());
  check(`${label}: walked to the gate`, Math.abs(p1.x - gate.x) < 2.6 && Math.abs(p1.z - (gate.z - 1.9)) < 1.2, JSON.stringify(p1));
  await shot('4-gate');

  // 4. After the gala: the rows empty as people leave, the moto is still in its place; ride away, he says goodbye
  const day = await d(() => window.__dakar.arena.info().day);
  const before = (await info()).motos;
  await d(dd => { window.__dakar.state.data.counters.arena_gala_day = dd; }, day);
  await until(() => window.__dakar.arrival.info().street === 'after', null, 30000);
  await d(() => window.__dakar.arrival.skip(90));
  await until(n => window.__dakar.arrival.info().motos < n, before, 30000);
  a = await info();
  check(`${label}: after the gala the parking empties, the player's moto is still in its place, the gardien still there`, a.motos < before && a.present && !!a.mine && Math.hypot(a.mine.x - lot.reserved.x, a.mine.z - lot.reserved.z) < 0.05, JSON.stringify({ before, now: a.motos, mine: a.mine }));
  await d(r => window.__dakar.place(r.x - 1.0, r.z - 0.6, 0), lot.reserved);
  await until(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, 30000);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.moto.info().driving, null, 30000);
  await hold('KeyS', 1, z => window.__dakar.moto.info().z < z, lot.reserved.z - 2.5, 20000);                    // back out of the place
  m = await d(() => window.__dakar.moto.info());
  const backed = m.z < lot.reserved.z - 0.3;                                                                     // frames are slow here: any way back out
  await d(g => window.__dakar.moto.place(g.x + 3, g.z - 12, Math.PI), lot.gardien);                              // down the street
  await until(() => window.__dakar.arrival.info().said.some(s => /Ñibbil ak jàmm/.test(s)), null, 30000);
  check(`${label}: riding away, the gardien says goodbye (Wolof with its gloss and French)`, backed && await said(/Le gardien : .*Ñibbil ak jàmm.*Ba beneen yoon.*Il te fait signe/), JSON.stringify({ backed, said: (await info()).said.slice(-2) }));
  await d(() => window.__dakar.act());                                                                           // off the moto
  await until(() => !window.__dakar.moto.info().driving, null, 30000);

  // 5. By car rapide: fans aboard the Ligne 23 towards « Arène », a group gets off with the player
  await d(dd => { window.__dakar.state.data.counters.arena_gala_day = dd - 1; window.__dakar.setHour(17.6); }, day);
  await until(() => !!window.__dakar.transport.lines().find(l => l.id === '23s')?.fans, null, 30000);
  const line23s = () => d(() => window.__dakar.transport.lines().find(l => l.id === '23s'));
  const L = await line23s();
  const ai = L.stops.findIndex(s => s.id === 'arene'), ri = (ai + L.stops.length - 1) % L.stops.length;   // the stop before « Arène »
  check(`${label}: on a fight evening the Ligne 23 cars (evening route) carry fans in their écurie's colours (but not as they pull in at « Arène »)`,
    L.on && !!L.fans && L.fans.dest === 'arene' && L.vehicles.some(v => v.colours?.includes(0x1a7a44) && v.colours.includes(0xc8322a)) && L.vehicles.every(v => v.dwell === ai ? !v.colours : true), JSON.stringify({ fans: L.fans, cars: L.vehicles.map(v => ({ dwell: v.dwell, colours: v.colours })) }));
  const st = L.stops[ri];
  await d(p => window.__dakar.place(p.x, p.z, 0), st.alight);
  await until(() => window.__dakar.focus()?.primary === 'Monter dans le prochain', null, 30000);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.transport.trip().phase === 'waiting', null, 30000);
  const wait = await d(([l, s]) => window.__dakar.transport.nextAt(l, s), [L.id, ri]);
  if (wait > 8) await d(w => window.__dakar.transport.warp(w), wait - 6);
  await until(() => window.__dakar.transport.trip().phase === 'riding', null, 120000);
  const car = await d(() => { const t = window.__dakar.transport.trip(); return window.__dakar.transport.lines().find(l => l.id === t.line).vehicles.find(v => v.id === t.vehicle); });
  check(`${label}: aboard from « ${st.name} »: fans in green and red ride along`, !!car?.colours?.length, JSON.stringify(car?.colours));
  await shot('5-aboard');
  await until(() => { const t = window.__dakar.transport.trip(); return window.__dakar.transport.lines().find(l => l.id === t.line).vehicles.find(v => v.id === t.vehicle)?.dwell === -1; }, null, 60000);
  const dropped0 = (await d(() => window.__dakar.arrivals.info())).dropped;
  await ready();
  await d(() => window.__dakar.act());                                                                           // « Descendre au prochain arrêt »
  await until(() => window.__dakar.transport.trip().alightAt >= 0, null, 30000);
  const req = (await d(() => window.__dakar.transport.trip())).alightAt;
  await until(() => window.__dakar.transport.trip().phase === 'idle' && window.__dakar.pos().mode === 'play', null, 120000);
  await page.waitForTimeout(1500);
  const p2 = await d(() => window.__dakar.pos()), arr = await d(() => window.__dakar.arrivals.info());
  const after = (await line23s()).vehicles.find(v => v.id === car.id);
  check(`${label}: off at « Arène » with a group of fans that walks to the queue; the car goes on without them`,
    req === ai && Math.hypot(p2.x - L.stops[ai].alight.x, p2.z - L.stops[ai].alight.z) < 0.8 && arr.dropped.rapide > dropped0.rapide && arr.dropped.fans > dropped0.fans && arr.walking > 0 && !after?.colours,
    JSON.stringify({ req, ai, p2, dropped: arr.dropped, walking: arr.walking, colours: after?.colours }));
  await shot('6-arene');

  // 6. By car: the guarded places on the side street east of the arena (200 F, price first, paid once), the car found
  //    again after the bout; far away, the goal line and « Ce soir » suggest the car
  await d(dd => { window.__dakar.state.data.counters.arena_gala_day = dd - 1; window.__dakar.setHour(17.8); window.__dakar.state.data.wallet = 5000000; }, day);
  await until(() => window.__dakar.carPark.info()?.present && window.__dakar.carPark.info().cars >= 1, null, 60000);
  let c = await d(() => window.__dakar.carPark.info());
  const cl = { gardien: c.gardien, reserved: c.reserved, ahead: c.ahead, area: c.area };
  const onPlace = (s, p) => Math.hypot(s.x - p.x, s.z - p.z) < 0.5;
  check(`${label}: the car places on the side street: the gardien, other cars (instanced), his place and the one in front kept free`,
    c.present && c.slots === 6 && c.cars >= 1 && !c.taken.some(s => onPlace(s, cl.reserved) || onPlace(s, cl.ahead)) && c.drawCalls <= 6,
    JSON.stringify({ street: c.street, cars: c.cars, slots: c.slots, drawCalls: c.drawCalls }));
  // own a car, parked far from the arena (its parking record in Pikine, then the asset model delivers it there)
  const geo2 = await d(() => window.__dakar.cityGeometry());
  const clear = (x, z, r) => !geo2.colliders.some(k => x > k.x0 - r && x < k.x1 + r && z > k.z0 - r && z < k.z1 + r);
  const farSpot = [[115.7, 40], [115.7, 30], [115.7, 45], [115.7, 25], [-115.7, 40], [-115.7, 30]].map(([x, z]) => ({ x, z }))
    .find(p => clear(p.x, p.z, 2.8) && clear(p.x - Math.sign(p.x) * 1.9, p.z + 3.4, 0.5) && Math.hypot(p.x - gate.x, p.z - gate.z) > 125) ?? { x: 115.7, z: 40 };
  await d(p => { const k = window.__dakar.state.data.counters; k['vehicle:clando:hub'] = 3; k['vehicle:clando:x'] = p.x; k['vehicle:clando:z'] = p.z; k['vehicle:clando:yaw'] = 0; window.__dakar.buyAsset('clando'); }, farSpot);
  await until(() => window.__dakar.car.info().here, null, 60000);
  await d(p => window.__dakar.place(p.x - Math.sign(p.x) * 1.9, p.z + 3.4, Math.PI), farSpot);
  await until(() => /prends ta voiture/.test(window.__dakar.evening()?.text ?? ''), null, 30000);
  const ev1 = await d(() => window.__dakar.evening());
  const row = await d(() => window.__dakar.tonight().page.find(s => s.title === 'Y aller')?.rows.find(r => r.label === 'Ta voiture') ?? null);
  check(`${label}: far away with one's own car: the goal line says take it (the pin on the car), « Ce soir » names the guarded car places and the price`,
    /prends ta voiture/.test(ev1?.text ?? '') && ev1?.target?.name === 'Ta voiture' && /parking gardé à l’arène, 200\s?F/.test(row?.detail ?? '') && row?.go === 'car', JSON.stringify({ ev1, row, farSpot }));
  // at the wheel: the goal line points to the car places
  await d(p => window.__dakar.place(p.x - Math.sign(p.x) * 1.7, p.z, Math.sign(p.x) * Math.PI / 2), farSpot);
  await until(() => window.__dakar.focus()?.name === 'Ta voiture', null, 30000);
  await d(() => window.__dakar.act());                                                                           // « Monter (conducteur) »
  await until(() => window.__dakar.car.info().driving, null, 30000);
  await until(() => /parking voitures gardé/.test(window.__dakar.evening()?.text ?? ''), null, 30000);
  const ev2 = await d(() => window.__dakar.evening());
  check(`${label}: at the wheel, the goal line points to the guarded car places (200 F)`, /parking voitures gardé.*200\s?F/.test(ev2?.text ?? '') && ev2?.target?.name === 'Parking voitures · Arène', JSON.stringify(ev2));
  // up the side street from the corner and into the place he keeps
  await d(r => window.__dakar.car.place(r.x, r.z - 9, 0), cl.reserved);
  await hold('KeyW', -1, z => window.__dakar.car.info().z > z, cl.reserved.z - 1.2, 8000);
  let ci = await d(() => window.__dakar.car.info());
  await d(([x, z]) => window.__dakar.car.place(x, z, 0), [cl.reserved.x, Math.min(Math.max(ci.z, cl.reserved.z - 2), cl.reserved.z + 2.5)]);   // stopped; a slow frame: the last metres
  await d(() => window.__dakar.act());                                                                           // « Sortir de la voiture »
  await until(() => !window.__dakar.car.info().driving && window.__dakar.carPark.info().said.length > 0, null, 30000);
  c = await d(() => window.__dakar.carPark.info());
  const csaid = async re => (await d(() => window.__dakar.carPark.info())).said.some(s => re.test(s));
  check(`${label}: getting out there, the gardien du parking greets and names his price (Wolof with its gloss, French)`, c.inLot && !c.paid && await csaid(/Le gardien du parking : .*Jàmm nga am.*200\s?F la soirée/), JSON.stringify(c.said));
  await shot('7-car-arrived');
  // the gardien: « Faire garder ta voiture (200 F) », the price before paying, paid once; the car into his place
  await d(g => window.__dakar.place(g.x - 0.2, g.z + 1.4, Math.PI), cl.gardien);
  await until(() => /gardien/i.test(window.__dakar.focus()?.name ?? ''), null, 30000);
  const f3 = await d(() => window.__dakar.focus());
  check(`${label}: the gardien du parking offers to keep the car, the price on the button`, /Faire garder ta voiture/.test(f3?.primary ?? '') && /200/.test(f3?.primary ?? ''), JSON.stringify(f3));
  const w2 = await d(() => window.__dakar.state.wallet), l2 = await d(() => window.__dakar.state.data.ledger.length);
  await d(() => window.__dakar.act());
  await until(() => /Payer/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, 30000);
  const menu2 = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  check(`${label}: the car fee is shown before anything is paid`, /Payer 200\s?F/.test(menu2) && (await d(() => window.__dakar.state.wallet)) === w2, menu2.slice(0, 140));
  await page.locator('#modal .item', { hasText: 'Payer' }).first().click();
  await until(() => window.__dakar.carPark.info().paid, null, 60000);
  await ready();
  c = await d(() => window.__dakar.carPark.info());
  const lines2 = await d(n => window.__dakar.state.data.ledger.slice(n), l2);
  const rec = await d(() => window.__dakar.car.info().record);
  check(`${label}: paid once (−200 F, one wallet line), the car in the place next to him, saved as its parking spot`,
    c.paid && w2 - (await d(() => window.__dakar.state.wallet)) === 200 && lines2.length === 1 && !!c.mine && Math.hypot(c.mine.x - cl.reserved.x, c.mine.z - cl.reserved.z) < 0.05
    && !!rec && Math.hypot(rec.x - cl.reserved.x, rec.z - cl.reserved.z) < 0.05 && await csaid(/200\s?F, jërëjëf/),
    JSON.stringify({ lines: lines2, mine: c.mine, rec, reserved: cl.reserved }));
  const f4 = await d(() => window.__dakar.focus());
  check(`${label}: paid tonight: no second car fee, a word with him instead`, !(f4?.all ?? []).some(l => /Faire garder/.test(l)) && (f4?.all ?? []).includes('Saluer le gardien'), JSON.stringify(f4));
  const walk = [{ x: cl.gardien.x, z: cl.gardien.z }, { x: cl.gardien.x, z: gate.z - 1.9 }, { x: gate.x + 1.5, z: gate.z - 1.9 }];
  const steps = walk.slice(1).flatMap((b, k) => Array.from({ length: 30 }, (_, i) => ({ x: walk[k].x + (b.x - walk[k].x) * i / 29, z: walk[k].z + (b.z - walk[k].z) * i / 29 })));
  check(`${label}: from the car places to the gate the way is clear and short`, !steps.some(inWall) && Math.hypot(cl.reserved.x - gate.x, cl.reserved.z - gate.z) < 30, `${Math.round(Math.hypot(cl.reserved.x - gate.x, cl.reserved.z - gate.z))} m`);
  await d(g => { window.__dakar.cam([g.x + 9, 6, g.z - 9], [g.x + 1, 0.8, g.z + 6]); }, cl.gardien);
  await shot('8-car-parking');
  await d(() => window.__dakar.cam(null));
  // after the gala: the places empty, the car is still in its place; drive out forward, he says goodbye
  const carsBefore = (await d(() => window.__dakar.carPark.info())).cars;
  await d(dd => { window.__dakar.state.data.counters.arena_gala_day = dd; }, day);
  await until(() => window.__dakar.carPark.info().street === 'after', null, 30000);
  await d(s => window.__dakar.carPark.skip(s), LOT_SKIP);
  await until(n => window.__dakar.carPark.info().cars < n, carsBefore, 30000);
  c = await d(() => window.__dakar.carPark.info());
  check(`${label}: after the gala the car places empty, the player's car is still in its place, the gardien still there`,
    c.cars < carsBefore && c.present && !!c.mine && Math.hypot(c.mine.x - cl.reserved.x, c.mine.z - cl.reserved.z) < 0.05, JSON.stringify({ carsBefore, now: c.cars, mine: c.mine }));
  await d(r => window.__dakar.place(r.x - 1.7, r.z, Math.PI / 2), cl.reserved);
  await until(() => window.__dakar.focus()?.name === 'Ta voiture', null, 30000);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.car.info().driving, null, 30000);
  const bumps0 = (await d(() => window.__dakar.car.info())).bumps;
  await hold('KeyW', -1, z => window.__dakar.car.info().z > z, cl.reserved.z + 2.5, 20000);                      // out forward: the place ahead is free
  ci = await d(() => window.__dakar.car.info());
  const pulled = ci.z > cl.reserved.z + 0.8 && ci.bumps === bumps0;
  await d(a => window.__dakar.car.place(a.x1 + 0.6, a.z1 + 4, 0), cl.area);                                      // up the street
  await until(() => window.__dakar.carPark.info().said.some(s => /Ñibbil ak jàmm/.test(s)), null, 30000);
  check(`${label}: driving away, the gardien du parking says goodbye (Wolof with its gloss and French)`, pulled && await csaid(/Le gardien du parking : .*Ñibbil ak jàmm.*Ba ci kanam.*signe/),
    JSON.stringify({ pulled, z: ci.z, bumps: ci.bumps - bumps0, said: (await d(() => window.__dakar.carPark.info())).said.slice(-2) }));
  await d(() => window.__dakar.act());                                                                           // out of the car
  await until(() => !window.__dakar.car.info().driving, null, 30000);

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
