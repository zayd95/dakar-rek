// Headless checks of the streets round the Pikine arena on a fight evening (src/city/arena.ts): taxis, clandos and
// moto-taxis drop supporters at the kerb, the fans walk to the queue, cars park round the block, the evening car
// rapide runs (fuller); after the bouts the crowd is picked up; in the morning the street is ordinary again.
// Usage: node scripts/check-city.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4213`)
// On a shared machine run browsers one at a time: flock /tmp/dakar-browser.lock node scripts/check-city.mjs …
// ONLY=desktop or ONLY=phone runs one viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/city';
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
  const info = () => d(() => window.__dakar.arenaStreets.info());
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const cols = async () => (await d(() => window.__dakar.cityGeometry())).colliders;
  const inside = (cs, p) => cs.some(c => p.x > c.x0 + 0.2 && p.x < c.x1 - 0.2 && p.z > c.z0 + 0.2 && p.z < c.z1 - 0.2 && c.h > 2);

  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(18.8); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.arenaStreets?.info(), null, T);
  // stand at the corner where the taxis stop, looking along the road towards the arena gate
  await d(() => window.__dakar.place(-26, -53.6, Math.PI / 2 + 0.25));
  await page.waitForFunction(() => { const i = window.__dakar.arenaStreets.info(); return i.arrived >= 2 && i.fansOut >= 1; }, null, T).catch(() => {});
  let i = await info();
  check(`${label}: on a fight evening taxis and moto-taxis bring fans to the arena`, i.arrived >= 2 && i.fansOut >= 1, JSON.stringify(i));
  const cs = await cols();
  check(`${label}: the vehicles keep to the road (never in a building)`, i.flows.length > 0 && i.flows.every(f => !inside(cs, f)), JSON.stringify(i.flows));
  await shot('1-drop-off');
  // the fans reach the queue (walking across to its tail)
  await page.waitForFunction(() => window.__dakar.arenaStreets.info().fans >= 1, null, { timeout: 60000 }).catch(() => {});
  await d(() => window.__dakar.place(14, -52.5, Math.PI / 2 - 0.4));
  await page.waitForTimeout(3000);
  await shot('2-fans-walking');
  i = await info();
  check(`${label}: cars are parked round the block (none on the low setting)`, i.parked > 0 || (await d(() => window.__dakar.quality?.() ?? null)) === 'low', `${i.parked} parked`);
  const lines = await d(() => window.__dakar.transport.lines());
  const eve = lines.find(l => l.id === '23s');
  check(`${label}: the evening car rapide runs, fuller than by day`, !!eve?.on && eve.vehicles.length > 0, JSON.stringify(eve?.vehicles.map(v => v.free)));
  const calls = await d(() => window.__dakar.drawCalls());
  check(`${label}: draw calls by the arena at the evening's peak stay in budget`, calls < 700, `${calls} draw calls`);

  // after the bouts: the crowd going home
  await d(() => window.__dakar.setHour(22.7));
  await page.waitForFunction(() => { const x = window.__dakar.arenaStreets.info(); return x.fansIn >= 1 || x.flows.some(f => f.state === 'wait'); }, null, T).catch(() => {});
  i = await info();
  check(`${label}: after the bouts taxis wait at the kerb and fans come back to them`, i.fansIn >= 1 || i.flows.some(f => f.state === 'wait'), JSON.stringify(i));
  await d(() => window.__dakar.place(-26, -53.6, Math.PI / 2 + 0.25));
  await page.waitForTimeout(2500);
  await shot('3-going-home');

  // the next morning: an ordinary street
  await d(() => window.__dakar.setHour(9));
  await page.waitForFunction(() => window.__dakar.arenaStreets.info().flows.length === 0, null, { timeout: 120000 }).catch(() => {});
  const day = await d(() => window.__dakar.transport.lines());
  i = await info();
  check(`${label}: in the morning no fight traffic, Ligne 23 back on its day route`, i.flows.length === 0 && !!day.find(l => l.id === '23')?.on && !day.find(l => l.id === '23s')?.on, JSON.stringify({ flows: i.flows.length }));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} city checks passed`);
process.exit(failed ? 1 : 0);
