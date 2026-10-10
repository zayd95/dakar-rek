// Headless checks of the city at night (src/city/night.ts): street lamps (a few out, a few flickering), the lights of
// the moving traffic, the arena's floodlights from the street (one spot light, not on low), lit shops and kiosks; the
// night's draw calls and the whole frame's against the budget (low 180 / medium 300 / high 420); all of it off by day.
// Usage: node scripts/check-night.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4213`)
// On a shared machine run browsers one at a time: flock /tmp/dakar-browser.lock node scripts/check-night.mjs …
// ONLY=desktop or ONLY=phone runs one viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4213/';
const out = process.argv[3] ?? 'docs/screenshots/night';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 };
const BUDGET = { low: 180, medium: 300, high: 420 };
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
  const info = () => d(() => window.__dakar.night.info());
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const quality = await d(() => window.__dakar.quality?.() ?? 'medium');

  // a fight evening at Pikine, after dark: from the street corner, looking along the road to the arena
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(21); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.night?.info().flood, null, T);
  await d(() => window.__dakar.place(-26, -53.6, Math.PI / 2 + 0.25));
  await page.waitForFunction(() => window.__dakar.night.info().flood.level > 0.9, null, { timeout: 60000 }).catch(() => {});
  let i = await info();
  check(`${label}: the arena's floodlights are on after dark on a fight evening`, i.flood.level > 0.9, JSON.stringify(i.flood));
  check(`${label}: one real spot light over the ring (none on low)`, quality === 'low' ? i.spot === null : i.spot > 2, `${quality}: ${i.spot}`);
  check(`${label}: street lamps found with their bulbs; a few out, a few flickering`, i.lamps.lamps > 20 && i.lamps.out > 0 && i.lamps.flicker > 0 && i.lamps.bulbsFound >= i.lamps.lamps * 0.8, JSON.stringify(i.lamps));
  check(`${label}: the city's shops are lit inside, the kiosks open at this hour glow`, i.shops.shops >= 1 && i.shops.open >= 1, JSON.stringify(i.shops));
  await shot('1-arena-from-the-street');

  // the traffic: moving vehicles near the camera show head and tail lights
  await page.waitForFunction(() => window.__dakar.night.info().vehicles.lamps > 0, null, { timeout: 60000 }).catch(() => {});
  i = await info();
  check(`${label}: moving vehicles show their head and tail lights`, i.vehicles.lamps > 0 && i.vehicles.lit > 0, JSON.stringify(i.vehicles));

  // the night's own draw calls, by the arena at its busiest
  const br = await d(() => window.__dakar.renderBreakdown());
  const nightCalls = Object.entries(br.by).filter(([k]) => k.startsWith('night_')).reduce((t, [, v]) => t + v.calls, 0);
  check(`${label}: the night costs about ten draw calls`, nightCalls <= 12, `${nightCalls} (${JSON.stringify(Object.fromEntries(Object.entries(br.by).filter(([k]) => k.startsWith('night_'))))}); whole frame by the arena: ${br.base.calls}`);

  // inside the arena: the ring and stands under the floodlights
  await d(() => window.__dakar.place(36, -46, -Math.PI / 2));
  await page.waitForTimeout(2500);
  await shot('2-arena-ring');

  // by day (still at Pikine): the floodlights wind down, the shop lights hide
  await d(() => window.__dakar.setHour(12));
  await page.waitForFunction(() => window.__dakar.night.info().flood?.level < 0.01, null, { timeout: 60000 }).catch(() => {});
  i = await info();
  const vis = await d(() => { const v = {}; window.__dakar.three.scene.traverse(o => { if (/^night_/.test(o.name)) v[o.name] = o.visible; }); return v; });
  check(`${label}: by day the floodlights and the shop lights are off`, !!i.flood && i.flood.level < 0.01 && vis.night_arena === false && vis.night_shops === false, JSON.stringify({ level: i.flood?.level, vis }));

  // an ordinary street at night (Plateau): lamps and their pools, shop fronts; the whole frame in the quality's budget
  await d(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(21.5); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.night?.info().lamps, null, T);
  await d(() => window.__dakar.place(-2, 40, 0));
  await page.waitForTimeout(2500);
  const sb = await d(() => window.__dakar.renderBreakdown());
  check(`${label}: a street at night stays in the ${quality} budget`, sb.base.calls <= BUDGET[quality], `${sb.base.calls} draw calls (budget ${BUDGET[quality]})`);
  await shot('3-street');

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} night checks passed`);
process.exit(failed ? 1 : 0);
