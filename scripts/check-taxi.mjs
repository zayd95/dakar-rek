// Headless checks of the evening trip by car rapide and taxi (src/transport/taxi.ts, the evening route of Ligne 23):
// on a fight evening in Pikine Ligne 23 runs its evening route (never across the queue at the arena gate) with an
// « Arène » stop near the gate; the taxi rank across the road from the arena takes the player to La Vague (Ngor): fare
// shown, paid once, a real ride out of Pikine, a short fade, the ride into Almadies, out on the pavement; a reload
// mid-ride finishes the trip at the destination without a second fare.
// Usage: node scripts/check-taxi.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4213`)
// On a shared machine run browsers one at a time: flock /tmp/dakar-browser.lock node scripts/check-taxi.mjs …
// ONLY=desktop or ONLY=phone runs one viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/taxi';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const digits = t => (t ?? '').replace(/[^0-9]/g, '');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const RUNS = [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]];
for (const [label, viewport, touch] of RUNS.filter(r => !process.env.ONLY || r[0] === process.env.ONLY)) {
  const context = await browser.newContext(touch ? { viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const info = () => d(() => window.__dakar.taxi.info());
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const ready = () => page.waitForFunction(() => window.__dakar.focus() !== null && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const inWall = async p => (await d(() => window.__dakar.cityGeometry())).colliders.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1);

  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(18); window.__dakar.state.data.wallet = 20000; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.taxi.info().rank?.taxi, null, T);

  // 1. Ligne 23 on a fight evening: its evening route runs, with a stop by the arena, and keeps off the queue.
  await page.waitForFunction(() => window.__dakar.transport.lines().some(l => l.id === '23s' && l.on), null, { timeout: 60000 }).catch(() => {});
  const lines = await d(() => window.__dakar.transport.lines());
  const gate = await d(() => window.__dakar.arenaOut?.().gate ?? null);
  const day = lines.find(l => l.id === '23'), eve = lines.find(l => l.id === '23s');
  const arene = eve?.stops.find(s => s.id === 'arene');
  check(`${label}: on a fight evening Ligne 23 takes its evening route, with an « Arène » stop near the gate`, !!eve?.on && !day?.on && !!arene && !!gate && Math.hypot(arene.x - gate.x, arene.z - gate.z) < 40,
    JSON.stringify({ day: day?.on, eve: eve?.on, arene: arene && { x: Math.round(arene.x), z: Math.round(arene.z) }, gate: gate && { x: gate.x, z: gate.z } }));
  // watch the evening cars for a while: none of them drives through the queue lane
  let through = 0;
  for (let k = 0; k < 6; k++) {
    await page.waitForTimeout(1500);
    const vs = (await d(() => window.__dakar.transport.lines().find(l => l.id === '23s')?.vehicles ?? []));
    through += vs.filter(v => gate && Math.abs(v.x - gate.queue.x) < gate.queue.half + 2 && v.z < gate.queue.z0 + 1 && v.z > gate.queue.z1 - 1).length;
  }
  check(`${label}: no evening car rapide drives through the queue at the gate`, through === 0, `${through} sightings`);
  await d(s => window.__dakar.place(s.x - s.rx * 0.6, s.z - s.rz * 0.6, Math.atan2(-s.rx, -s.rz)), arene);
  await page.waitForTimeout(1500);
  await shot('1-arene-stop');

  // 2. The taxi rank by the arena: « Prendre un taxi », the fare before paying.
  const rank = (await info()).rank;
  await d(r => window.__dakar.place(r.x - Math.cos(r.yaw) * 1.9, r.z + Math.sin(r.yaw) * 1.9, r.yaw + Math.PI / 2), rank);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Taxi', null, T).catch(() => {});
  const f1 = await d(() => window.__dakar.focus());
  check(`${label}: a taxi waits at the rank across the road from the arena (« Prendre un taxi »)`, rank?.name === 'Arène de Pikine' && f1?.primary === 'Prendre un taxi', JSON.stringify({ rank, f1 }));
  await shot('2-rank');
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  const fare = (await d(() => window.__dakar.taxi.fares())).find(f => f.hub === 'almadies')?.fare;
  const item = await d(() => [...document.querySelectorAll('#modal.on .item')].map(b => b.textContent).find(t => /La Vague/.test(t)) ?? null);
  check(`${label}: the menu lists La Vague (Ngor) with the fare`, !!fare && digits(item).includes(String(fare)), String(item));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.length);
  await page.locator('#modal.on .item', { hasText: 'La Vague' }).first().click();
  await page.waitForFunction(() => /Prix/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
  const conf = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
  check(`${label}: a confirmation shows the fare and the wallet before paying`, digits(conf).includes(String(fare)) && /Ton argent/.test(conf) && (await d(() => window.__dakar.state.wallet)) === w0, conf.slice(0, 120));
  await shot('3-confirm');
  await page.locator('#modal.on .item', { hasText: 'Monter' }).first().click();

  // 3. The ride out of Pikine.
  await page.waitForFunction(() => window.__dakar.taxi.info().ride?.phase === 'depart' && !!window.__dakar.seated(), null, T).catch(() => {});
  let ti = await info();
  const w1 = await d(() => window.__dakar.state.wallet), led = await d(n => window.__dakar.state.data.ledger.slice(n), l0);
  check(`${label}: paid once and seated in front: the taxi pulls out`, ti.ride?.phase === 'depart' && ti.paid === 1 && w0 - w1 === fare && led.length === 1 && /Taxi/.test(led[0].label) && /taxi/.test(await d(() => window.__dakar.seated()) ?? '') && ti.owed === 'almadies',
    JSON.stringify({ ride: ti.ride, paid: ti.paid, w0, w1, led }));
  await page.waitForFunction(() => (window.__dakar.taxi.info().ride?.s ?? 0) > 25, null, { timeout: 120000 }).catch(() => {});
  ti = await info();
  check(`${label}: it drives through the streets (the card says where to)`, (ti.ride?.s ?? 0) > 20 && /La Vague/.test(await d(() => window.__dakar.taxi.card())), `${ti.ride?.s} m · ${await d(() => window.__dakar.taxi.card())}`);
  await shot('4-riding');
  await ready();
  await d(() => window.__dakar.more());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, { timeout: 30000 }).catch(() => {});
  await page.locator('#modal.on .item', { hasText: 'Changer de vue' }).first().click().catch(() => {});
  await page.waitForFunction(() => window.__dakar.taxi.info().ride?.view === 'place', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check(`${label}: the view from the front seat`, (await info()).ride?.view === 'place' || (await info()).ride?.phase !== 'depart', JSON.stringify((await info()).ride?.view));
  await shot('5-front-seat');

  // 4. Into Almadies and out at Ngor.
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.taxi.info().ride?.phase === 'arrive', null, T).catch(() => {});
  ti = await info();
  check(`${label}: after a short fade the taxi comes into Almadies with the player on board`, ti.ride?.phase === 'arrive' && (await d(() => window.__dakar.pos().hub)) === 'almadies' && /taxi/.test(await d(() => window.__dakar.seated()) ?? ''), JSON.stringify(ti.ride));
  await page.waitForTimeout(1500);
  await shot('6-arriving');
  await page.waitForFunction(() => !window.__dakar.taxi.info().ride && !window.__dakar.seated() && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  ti = await info();
  const me = await d(() => window.__dakar.pos());
  check(`${label}: out on the pavement by La Vague's rank, the trip done, charged once`, !ti.ride && !ti.owed && me.hub === 'almadies' && Math.abs(me.z - (ti.rank.z - 1.9)) < 1.5 && Math.abs(me.x - ti.rank.x) < 20 && !(await inWall(me)) && (await d(() => window.__dakar.state.wallet)) === w1,
    JSON.stringify({ me, rank: ti.rank, owed: ti.owed }));
  await shot('7-ngor');

  // 5. A reload in the middle of a ride finishes the trip, without a second fare.
  const r2 = (await info()).rank;
  await d(r => window.__dakar.place(r.x - Math.cos(r.yaw) * 1.9, r.z + Math.sin(r.yaw) * 1.9, r.yaw + Math.PI / 2), r2);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Taxi', null, T).catch(() => {});
  await ready();
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  await page.locator('#modal.on .item', { hasText: 'Arène' }).first().click();
  await page.waitForFunction(() => /Prix/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
  await page.locator('#modal.on .item', { hasText: 'Monter' }).first().click();
  await page.waitForFunction(() => (window.__dakar.taxi.info().ride?.s ?? 0) > 8, null, T).catch(() => {});
  const w2 = await d(() => window.__dakar.state.wallet), mid = await info();
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.taxi && window.__dakar.pos().hub === 'pikine' && !window.__dakar.taxi.info().owed && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const after = await info(), me2 = await d(() => window.__dakar.pos());
  check(`${label}: reload mid-ride: the trip finishes at the Pikine rank, no second fare, never left in a car`, mid.ride?.phase === 'depart' && me2.hub === 'pikine' && !after.owed && (await d(() => window.__dakar.seated())) === null && (await d(() => window.__dakar.state.wallet)) === w2 && !(await inWall(me2)),
    JSON.stringify({ mid: mid.ride?.phase, me2, owed: after.owed, w2, wallet: await d(() => window.__dakar.state.wallet) }));

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} taxi checks passed`);
process.exit(failed ? 1 : 0);
