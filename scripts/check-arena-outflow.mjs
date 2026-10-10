// Checks of the end of a fight evening outside the arena (src/arena/exterior.ts, src/arena/posters.ts): when the gala is
// over the queue dissolves and the crowd pours out of the public gate toward the stops, taxi corners and street ends,
// some stop for a last bissap, the vendors call the last customers, the posters are crossed « soirée terminée » and
// announce tomorrow; past midnight the street is quiet. Desktop 1280×800 (medium) and phone 390×844 (low, touch).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-arena-outflow.mjs [baseUrl] [outDir]. ONLY=desktop|phone.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4232/';
const out = process.argv[3] ?? 'docs/screenshots/arena-outflow';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const WALL_R = 21.7;
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch, quality] of [['desktop', { width: 1280, height: 800 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arenaOut && window.__dakar.posters, null, { timeout: 120000 * SLOW });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 250 }).then(() => true).catch(() => false);
  const shot = async name => {
    await page.waitForTimeout(800);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const info = () => d(() => window.__dakar.arenaOut());

  // the evening under way (19 h, the city's own day: the arena has a bout every evening)
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(19); });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.arenaOut().gate);
  const g = (await info()).gate, cx = g.x, cz = g.z + WALL_R;
  await d(([x, z]) => window.__dakar.place(x, z, 0), [cx + 7, g.z - 13]);
  const arriving = await until(() => { const a = window.__dakar.arenaOut(); return a.phase === 'arrive' && a.queue >= 3; }, null, 60000);
  check(`${label}: during the evening the fans arrive and queue`, arriving, JSON.stringify(await info()).slice(0, 200));

  // the gala is over (seen to the end): the crowd pours out of the gate
  const day = (await info()).day;
  await d(dd => { window.__dakar.state.data.counters.arena_gala_day = dd; }, day);
  const out1 = await until(() => { const a = window.__dakar.arenaOut(); return a.phase === 'outflow' && a.queue === 0 && a.leaving >= 2; }, null, 30000);
  check(`${label}: the gala over, the queue dissolves and the crowd comes out of the gate`, out1, JSON.stringify(await info()).slice(0, 240));
  await d(([p, t]) => window.__dakar.cam(p, t), [[cx - 10, 4.2, g.z - 17], [cx, 1.2, g.z - 2]]);
  await page.waitForTimeout(4000); await shot('crowd-pouring-out');
  let maxStalls = 0, maxLeaving = 0;
  for (let k = 0; k < 24; k++) { const a = await info(); maxStalls = Math.max(maxStalls, a.atStalls); maxLeaving = Math.max(maxLeaving, a.leaving); await page.waitForTimeout(700); }
  // the stall stops come with the walk (game time): on a slow machine, wait for one rather than sampling a few seconds
  if (maxStalls < 1 && await until(() => window.__dakar.arenaOut().atStalls >= 1, null, 60000)) maxStalls = 1;
  const a2 = await info();
  check(`${label}: the stream walks off toward the stops, taxis and street ends`, maxLeaving >= 4 && a2.gone >= 2, `leaving up to ${maxLeaving}, gone ${a2.gone}, still inside ${a2.inside}`);
  check(`${label}: some stop for a last bissap at the stalls`, maxStalls >= 1 || a2.fans < 10, `${maxStalls} at the stalls at once`);
  await d(() => window.__dakar.cam(null));

  // the vendors' last call
  const v = (await info()).vendors[0];
  await d(([x, z]) => window.__dakar.place(x, z, 0), [v.anchor.x, v.anchor.z - 0.8]);
  const call = await until(() => /Les derniers avant de rentrer/.test(document.getElementById('toast')?.textContent ?? ''), null, 15000);
  check(`${label}: the vendors call the last customers`, call, await d(() => document.getElementById('toast')?.textContent ?? ''));

  // the posters: crossed, tomorrow's card
  const p = await d(() => window.__dakar.posters());
  check(`${label}: the posters say « soirée terminée » and announce tomorrow`, p.lines.over && /^Demain/.test(p.lines.when), `${p.lines.tag} · ${p.lines.when}`);
  const wallSpot = p.spots.find(s => Math.abs(Math.hypot(s.x - cx, s.z - cz) - WALL_R - 0.27) < 0.05) ?? p.spots[0];
  await page.waitForTimeout(2500);
  await d(([s]) => window.__dakar.cam([s.x + Math.sin(s.yaw) * 4.2, 2.0, s.z + Math.cos(s.yaw) * 4.2], [s.x, 1.9, s.z]), [wallSpot]); await shot('poster-soiree-terminee');
  await d(() => window.__dakar.cam(null));

  // past midnight: quiet
  await d(() => window.__dakar.setHour(0.5));
  const quiet = await until(() => { const a = window.__dakar.arenaOut(); return a.phase === 'quiet' && a.drawn === 0; }, null, 20000);
  check(`${label}: past midnight the street in front of the arena is quiet`, quiet, JSON.stringify(await info()).slice(0, 160));
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
