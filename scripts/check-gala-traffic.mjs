// Checks of the gala-night road to the arena (src/city/galaTraffic.ts, rules in src/city/galaRules.ts, docs/CITY.md
// « The gala-night road »): quiet before the doors, the agent and a thin queue from the doors, the jam in its window
// (three columns, two gaps for a moto, none for a car), the agent's cycle and whistle, the front cars sent north, the
// player's own moto ridden through the north gap past the tail, drive mode's probe of a car stopping at the tail, a
// moto-taxi's fan stepping off and walking to the queue, fans on the Ligne 23 cars' step, horns, the lights at night,
// a weekday card at about 40 %, the outflow after the result (the jam facing east, taxis at the corner's rank, fans
// walking out to them), quiet the next morning, the draw calls and the errors.
// Desktop 1280×720 (medium) and phone 390×844 (low, touch). Every wait is for a state, never a fixed time: SwiftShader
// may run the game at a few frames a second.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-gala-traffic.mjs [baseUrl] [outDir]  (needs a running build,
// e.g. `npx vite preview --port 4217`). ONLY=desktop|phone narrows a run; SLOW=n stretches every wait.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4217/';
const out = process.argv[3] ?? 'docs/screenshots/gala-traffic';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };
/** Most draw calls of the road's meshes (src/city/galaTraffic.ts: 2 / 2 / 3 car looks × body and glass, 2 moto looks). */
const BUDGET = { low: 6, medium: 6, high: 8 };
const DEPTH = { low: 3, medium: 4, high: 5 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch, quality] of [['desktop', { width: 1280, height: 720 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(q => { if (!sessionStorage.getItem('gala-check')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('gala-check', '1'); } }, quality);
  const page = await context.newPage();
  const errors = [], shaderErrors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /shader|WebGLProgram|GLSL/i.test(m.text())) shaderErrors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 * SLOW });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.gala, null, { timeout: 120000 * SLOW });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 250 }).then(() => true).catch(() => false);
  const frame = () => d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const shot = async name => {
    await page.waitForTimeout(600); await frame();
    try { await page.screenshot({ path: `${out}/${label}-${name}.jpg`, type: 'jpeg', quality: 80, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const info = () => d(() => window.__dakar.gala.info());
  /** Hold a key (desktop) or push the joystick (phone: dy −1 up) until `fn` holds in the page or `ms` passes. */
  const hold = async (key, dy, fn, arg, ms) => {
    if (!touch) { await page.keyboard.down(key); await until(fn, arg, ms); await page.keyboard.up(key); return; }
    const j = await d(() => { const r = document.getElementById('joy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(j.x, j.y); await page.mouse.down(); await page.mouse.move(j.x, j.y + dy * 42, { steps: 4 });
    await until(fn, arg, ms); await page.mouse.up();
  };

  // 0. Pikine on a Saturday (a gala night), 16 h 24: the arena's street is set up, nobody directs the junction yet
  await d(() => { const D = window.__dakar; D.teleport('pikine'); D.arenaOutDay(5); D.setHour(16.4); D.state.data.wallet = 400000; D.state.data.needs.energie = 100; });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.gala.info());
  let s = await info();
  const geo = s.geo, j = geo.junction;
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [j.x - 6.5, j.z - 6.5]);                       // the junction's north-west corner
  await until(() => window.__dakar.gala.info().jam.cars === 0, null, 20000);
  s = await info();
  check(`${label}: 16 h 24, the arena set up: no jam yet, the agent not there`, s.jam.cars === 0 && !s.agent.on && s.size === 'gala', JSON.stringify({ dir: s.dir, size: s.size, cars: s.jam.cars, agent: s.agent }));

  // 1. The doors (17 h 03): the agent in the junction's middle, a thin queue at it (a car or so a column)
  await d(() => window.__dakar.setHour(17.05));
  const thin = await until(() => { const g = window.__dakar.gala.info(); return g.agent.on && g.jam.standing >= 2; }, null, 60000);
  s = await info();
  check(`${label}: from the doors the agent directs the junction and a thin queue waits at it`, thin && s.agent.on && s.agent.x === j.x && s.agent.z === j.z && s.jam.columns.every(n => n <= 1), JSON.stringify({ agent: s.agent, columns: s.jam.columns, level: s.level }));

  // 2. In the jam's window: three columns kerb to kerb at the quality's depth, two gaps for a moto, none for a car
  const mid = (s.window[0] + s.window[1]) / 2;
  await d(h => window.__dakar.setHour(h), mid);
  const full = await until(d0 => window.__dakar.gala.info().jam.columns.every(n => n >= d0), DEPTH[quality], 90000);
  s = await info();
  check(`${label}: the jam in its window (${s.window.map(h => h.toFixed(2)).join('–')} h): 3 columns of ${DEPTH[quality]} (${quality})`, full && s.depth === DEPTH[quality] && s.jam.columns.length === 3, JSON.stringify({ columns: s.jam.columns, depth: s.depth, level: s.level, coming: s.jam.coming }));
  check(`${label}: two gaps a moto fits through, none for a car`, s.lanes.moto.length === 2 && s.lanes.car.length === 0 && Math.abs(s.lanes.moto[0] - geo.gapIn) < 0.2 && Math.abs(s.lanes.moto[1] - geo.gapOut) < 0.2, JSON.stringify(s.lanes));
  check(`${label}: the road's meshes are instanced (≤ ${BUDGET[quality]} draw calls)`, s.drawCalls > 0 && s.drawCalls <= BUDGET[quality], `${s.drawCalls} draw calls`);
  await d(([p, q]) => window.__dakar.cam(p, q), [[j.x - 7, 8.5, j.z - 15], [j.x + 16, 0.5, j.z]]); await shot('1-jam');
  await d(([p, q]) => window.__dakar.cam(p, q), [[j.x - 4, 2.2, j.z + 5], [j.x, 1.5, j.z]]); await shot('2-agent'); await d(() => window.__dakar.cam(null));

  // 3. The agent's cycle: he holds the jam, then sends its front cars round to the north, with his whistle
  const g0 = s.agent.go, w0 = s.stats.whistles;
  const turned = await until(([g, w]) => { const a = window.__dakar.gala.info(); return a.agent.go !== g && a.stats.whistles > w; }, [g0, w0], 60000);
  const away = await until(() => window.__dakar.gala.info().jam.list.some(c => c.state === 'away' && c.z < -66), null, 60000);
  s = await info();
  check(`${label}: the agent alternates (whistle) and the jam's front cars go round to the north`, turned && away && s.jam.list.filter(c => c.state === 'away').every(c => c.x > j.x + 1), JSON.stringify({ agent: s.agent, whistles: s.stats.whistles, away: s.jam.list.filter(c => c.state === 'away').slice(0, 3) }));

  // 4. A moto-taxi drops its fan by the gate; the fan walks to the queue
  const f0 = s.stats.fansOut;
  const dropped = await until(f => window.__dakar.gala.info().stats.fansOut > f, f0, 90000);
  s = await info();
  const walking = (await d(() => window.__dakar.arrivals.info()))?.walking ?? 0;
  check(`${label}: a moto-taxi filters in and its fan steps off at the drop-off, walking to the queue`, dropped && walking > 0 && s.motos.some(m => m.state !== 'out'), JSON.stringify({ fansOut: s.stats.fansOut, walking, motos: s.motos.slice(0, 4) }));
  const inGap = s.motos.filter(m => m.x > geo.front + 2 && m.x < 130);
  check(`${label}: moto-taxis in the jam ride its gaps`, inGap.every(m => Math.abs(m.z - geo.gapIn) < 0.2 || Math.abs(m.z - geo.gapOut) < 0.2), JSON.stringify(inGap));

  // 5. A car does not fit: drive mode's own step through the jam as it stands, on every line
  const probes = await d(([zs, g]) => ({ car: zs.map(z => window.__dakar.gala.probe('car', z)), moto: g.map(z => window.__dakar.gala.probe('moto', z)) }), [[geo.columns[0], geo.gapIn, j.z, geo.gapOut, geo.columns[2]], [geo.gapIn, geo.gapOut]]);
  check(`${label}: a car stops at the jam's tail on every line, a moto passes in both gaps (drive mode's probe)`, probes.car.every(p => p && !p.passed) && probes.moto.every(p => p && p.passed), JSON.stringify(probes));

  // 6. The player's own moto through the north gap (when the gate's side goes: no car turning across)
  await d(() => window.__dakar.buyAsset('jakarta'));
  await until(() => window.__dakar.moto.info().here, null, 60000);
  await until(() => { const a = window.__dakar.gala.info().agent; return a.go === 'gate' && a.left > 11; }, null, 60000);
  s = await info();
  const tail = Math.max(geo.front, ...s.jam.list.filter(c => c.state === 'queue').map(c => c.x + c.hl));
  await d(([x, z]) => { window.__dakar.moto.place(x, z, -Math.PI / 2); window.__dakar.place(x, z + 1.1, -Math.PI / 2); }, [tail + 7, geo.gapIn]);
  await until(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, 30000);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.moto.info().driving, null, 30000);
  const b0 = (await d(() => window.__dakar.moto.info())).bumps;
  await hold('KeyW', -1, x => window.__dakar.moto.info().x < x, geo.front - 0.5, 60000);
  const m = await d(() => window.__dakar.moto.info());
  check(`${label}: the player's moto filters through the north gap past the jam's front`, m.x < geo.front && Math.abs(m.z - geo.gapIn) < 0.6 && m.bumps - b0 <= 1, JSON.stringify({ x: m.x, z: m.z, from: tail + 7, front: geo.front, bumps: m.bumps - b0 }));
  await shot('3-filtering');
  await d(() => window.__dakar.act());                                                                          // off the moto
  await until(() => !window.__dakar.moto.info().driving, null, 30000);

  // 7. Fans on the rear step of the Ligne 23 evening cars, beside the apprenti; horns from the jam
  const riders = await until(() => {
    const D = window.__dakar, v = D.transport.lines().find(l => l.id === '23s')?.vehicles.find(c => c.colours);
    if (v) D.place(v.x - Math.sin(v.yaw) * 9 + 3, v.z - Math.cos(v.yaw) * 9, v.yaw);
    return D.gala.info().riders.shown > 0;
  }, null, 90000);
  s = await info();
  check(`${label}: fans in their écurie's colours ride on the car rapide's rear step`, riders && s.riders.shown >= 1, JSON.stringify(s.riders));
  const car = await d(() => window.__dakar.transport.lines().find(l => l.id === '23s')?.vehicles.find(c => c.colours));
  if (car) { await d(([v]) => window.__dakar.cam([v.x - Math.sin(v.yaw) * 7 - 2, 2.6, v.z - Math.cos(v.yaw) * 7], [v.x, 1.4, v.z]), [car]); await shot('4-step'); await d(() => window.__dakar.cam(null)); }
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [j.x - 6.5, j.z - 6.5]);
  const honk = await until(() => window.__dakar.gala.info().stats.horns > 0, null, 60000);
  check(`${label}: horns from the jam (shared one-second slots)`, honk, JSON.stringify((await info()).stats));

  // 8. At night the jam's cars show their lights (night.ts finds their proxies), standing with their engines running
  await d(() => window.__dakar.night.force(1, 19.5));
  const lit = await until(() => (window.__dakar.night.info().vehicles?.lit ?? 0) >= 6, null, 30000);
  check(`${label}: at night the jam's cars show their head and tail lights`, lit, JSON.stringify((await d(() => window.__dakar.night.info())).vehicles));
  await d(([p, q]) => window.__dakar.cam(p, q), [[j.x + 2, 5, j.z - 12], [j.x + 18, 0.6, j.z]]); await shot('5-night');
  await d(() => { window.__dakar.cam(null); window.__dakar.night.force(null); });

  // 9. A weekday card (Thursday): the same evening at about 40 %
  await d(() => window.__dakar.arenaOutDay(3));
  await until(() => window.__dakar.gala.info().size === 'card', null, 30000);
  s = await info();
  await d(h => window.__dakar.setHour(h), (s.window[0] + s.window[1]) / 2);
  const cardDepth = Math.max(1, Math.round(DEPTH[quality] * 0.4));
  const small = await until(c => { const g = window.__dakar.gala.info(); return g.depth === c && g.jam.columns.every(n => n === c); }, cardDepth, 90000);
  s = await info();
  check(`${label}: a weekday card's jam is about 40 % of a gala's (${cardDepth} a column)`, small && s.size === 'card', JSON.stringify({ size: s.size, columns: s.jam.columns, depth: s.depth, window: s.window }));

  // 10. After the bouts (past the close: the street's after-gala window): the jam faces east, taxis wait at the corner's
  // rank, the crowd walks out to them
  await d(() => { const D = window.__dakar; D.arenaOutDay(5); D.setHour(23.2); });
  const outflow = await until(() => { const g = window.__dakar.gala.info(); return g.dir === 'out' && g.jam.standing >= 3 && g.rank.some(r => r.waiting); }, null, 120000);
  s = await info();
  check(`${label}: after the result the jam faces east, taxis wait at the rank`, outflow && Math.abs(s.jam.faces - Math.PI / 2) < 0.05 && s.jam.list.filter(c => c.state === 'queue').every(c => c.x > geo.front), JSON.stringify({ dir: s.dir, faces: s.jam.faces, rank: s.rank, columns: s.jam.columns }));
  const fi = s.stats.fansIn;
  const goHome = await until(f => window.__dakar.gala.info().stats.fansIn > f, fi, 90000);
  check(`${label}: the crowd walks out of the gate to the rank taxis and the moto-taxis`, goHome, JSON.stringify((await info()).stats));
  const r0 = s.rank.find(r => r.waiting) ?? s.rank[0];
  if (r0) { await d(([p, q]) => window.__dakar.cam(p, q), [[r0.x - 8, 4, r0.z + 12], [r0.x, 1, r0.z - 2]]); await shot('6-rank'); await d(() => window.__dakar.cam(null)); }

  // 11. The next morning: nothing on the road, the roads open again
  await d(() => { const D = window.__dakar; D.arenaOutDay(null); D.setHour(9); });
  const quiet = await until(() => { const g = window.__dakar.gala.info(); return g.dir === null && g.jam.cars === 0 && g.drawCalls === 0 && !g.closed; }, null, 30000);
  check(`${label}: the next morning the road is quiet and open`, quiet, JSON.stringify(await info()).slice(0, 300));
  check(`${label}: no page or shader errors`, errors.length === 0 && shaderErrors.length === 0, [...errors, ...shaderErrors].slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
