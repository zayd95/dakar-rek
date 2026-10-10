// Checks of the arena's interior (src/world/arenaModules.ts, src/arena/interior.ts): stands of eight sections with aisles
// and stairs, the wrestlers' tunnel and their own gate, the ringside zones, the evening's people inside the walls, walking
// in through both gates, draw calls from a seat. Desktop 1280×800 (medium quality) and phone 390×844 (low quality, touch).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-arena-interior.mjs [baseUrl] [outDir]   (needs a running build,
// e.g. `npx vite preview --port 4216`). ONLY=desktop|phone narrows a run.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4216/';
const out = process.argv[3] ?? 'docs/screenshots/arena-interior';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const WALL_R = 21.7;
const BUDGET = { desktop: 420, phone: 260 };                     // the arena visit's draw-call budgets from a seat
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
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arenaIn, null, { timeout: 120000 * SLOW });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 250 }).then(() => true).catch(() => false);
  const shot = async name => {
    await page.waitForTimeout(900);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const cam = (p, t) => d(([a, b]) => window.__dakar.cam(a, b), [p, t]);
  const walk = async (pred, arg, ms = 30000) => {
    await page.keyboard.down('KeyW'); const ok = await until(pred, arg, ms); await page.keyboard.up('KeyW'); return ok;
  };

  // a fight evening in Pikine (Saturday 19 h)
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(19); window.__dakar.arenaOutDay(5); });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.arenaOut().gate && window.__dakar.arenaIn());
  const g = (await d(() => window.__dakar.arenaOut())).gate, cx = g.x, cz = g.z + WALL_R;
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [cx + 12, cz + 4]);
  const shown = await until(() => { const a = window.__dakar.arenaIn(); return a.shown && a.drawn >= 6; }, null, 60000);
  const inn = await d(() => window.__dakar.arenaIn());
  check(`${label}: fight evening: the people inside the walls are there (${quality})`, shown && inn.by.drummer >= 2 && inn.by.official >= 2 && inn.by.camp >= 4 && inn.by.vendor >= 1 && (inn.by.media ?? 0) + (inn.by.press ?? 0) >= 2, JSON.stringify(inn));

  // the stands: eight sections, aisles with stairs, the tunnel opposite the gate — from the ring and from a seat
  await cam([cx - 3, 1.8, cz - 6], [cx + 12, 3.2, cz + 13]); await shot('stands-from-ring');
  const seatA = -Math.PI / 2 - 0.4, seatR = 19.2;                       // a place on the second tier, section F
  await cam([cx + Math.sin(seatA) * seatR, 2.0 + 1.25, cz + Math.cos(seatA) * seatR], [cx + 1.5, 0.6, cz + 0.5]); await shot('seat-view');
  const calls = await d(() => window.__dakar.drawCalls());
  check(`${label}: draw calls from a seat within the arena budget (${BUDGET[label]})`, calls > 0 && calls < BUDGET[label], `${calls} draw calls`);
  await cam([cx, 2.2, cz + 5.5], [cx, 2.4, cz + 17]); await shot('tunnel-mouth');
  await cam([cx + 9.5, 2.4, cz + 4.5], [cx + 13.4, 1.2, cz + 13.6]); await shot('aisle-stairs');
  await cam([cx - 7.5, 2.4, cz + 2.5], [cx - 13.4, 1.0, cz]); await shot('media-zone');
  await cam([cx + 7, 3.2, cz + WALL_R + 11], [cx, 2.6, cz + WALL_R]); await shot('fighters-gate');
  await d(() => window.__dakar.cam(null));

  // the morning: nobody inside
  await d(() => window.__dakar.setHour(11));                         // before the doors (a bout every evening since the merge)
  const quiet = await until(() => { const a = window.__dakar.arenaIn(); return !a.shown && a.drawn === 0; }, null, 20000);
  check(`${label}: before the doors (11 h) the interior is empty`, quiet, JSON.stringify(await d(() => window.__dakar.arenaIn())));
  // walking in (before the doors, when the gala's ticket controller is not there yet): through the wrestlers' gate and
  // tunnel to the ring side, and through the public gate
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [cx, cz + WALL_R + 3.5]);
  const t1 = await walk(z => window.__dakar.pos().z < z, cz + 12.5, 40000);
  const p1 = await d(() => window.__dakar.pos());
  check(`${label}: the wrestlers' gate and tunnel lead to the ring side`, t1 && Math.abs(p1.x - cx) < 2.2, `${p1.x.toFixed(1)}, ${(p1.z - cz).toFixed(1)} from the centre`);
  await d(([x, z]) => window.__dakar.place(x, z, 0), [cx, cz - WALL_R - 3.5]);
  const t2 = await walk(z => window.__dakar.pos().z > z, cz - 15, 40000);
  const p2 = await d(() => window.__dakar.pos());
  check(`${label}: the public gate is open too, on the other side`, t2, `${p2.x.toFixed(1)}, ${(p2.z - cz).toFixed(1)} from the centre`);

  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
