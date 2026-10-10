// Checks of the fight's hype in the city (src/arena/posters.ts) and of the places reached from the aisles
// (src/world/geew.ts standExits): posters of tonight's card in the four hubs (more in Pikine, on the arena's wall), a
// result printed on them, and a player who climbs an aisle, takes a place on an upper tier and stands up into the aisle.
// Desktop 1280×800 (medium quality) and phone 390×844 (low quality, touch).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-arena-hype.mjs [baseUrl] [outDir]   (needs a running build).
// ONLY=desktop|phone narrows a run.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4232/';
const out = process.argv[3] ?? 'docs/screenshots/arena-hype';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const WALL_R = 21.7;
const MIN_POSTERS = { pikine: 16, plateau: 4, corniche: 4, almadies: 4 };
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
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.posters, null, { timeout: 120000 * SLOW });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 250 }).then(() => true).catch(() => false);
  const shot = async name => {
    await page.waitForTimeout(900);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const cam = (p, t) => d(([a, b]) => window.__dakar.cam(a, b), [p, t]);
  /** Look at a poster from the street, 4 m in front of it. */
  const facePoster = s => cam([s.x + Math.sin(s.yaw) * 4.2, 2.0, s.z + Math.cos(s.yaw) * 4.2], [s.x, 1.9, s.z]);

  // 1. posters of tonight's card in the four hubs (Saturday: the grand gala)
  for (const hub of ['pikine', 'plateau', 'corniche', 'almadies']) {
    if (label === 'phone' && hub !== 'pikine') continue;                 // the phone pass checks Pikine only
    await d(h => { window.__dakar.teleport(h); window.__dakar.setHour(12); window.__dakar.arenaOutDay?.(5); }, hub);
    await until(h => window.__dakar.pos().hub === h && window.__dakar.posters().hub === h, hub);
    const p = await d(() => window.__dakar.posters());
    check(`${label}: ${hub}: ${p.count} fight posters on street walls`, p.count >= MIN_POSTERS[hub] && /Arène de Pikine/.test(p.lines.when), `${p.lines.tag} · ${p.lines.title} · ${p.lines.when}`);
    const street = p.spots.find(s => !hub.startsWith('pikine') || true);
    if (street) { await facePoster(street); await shot(`poster-${hub}`); }
  }
  // Pikine: the posters on the way to the arena and on its wall; a result printed on them
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(12); });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.posters().hub === 'pikine' && window.__dakar.arenaOut().gate);
  const g = (await d(() => window.__dakar.arenaOut())).gate, cx = g.x, cz = g.z + WALL_R;
  let p = await d(() => window.__dakar.posters());
  const onWall = p.spots.filter(s => Math.abs(Math.hypot(s.x - cx, s.z - cz) - WALL_R - 0.27) < 0.05).length;
  const near = p.spots.filter(s => Math.hypot(s.x - cx, s.z - cz) < 160).length;
  check(`${label}: Pikine: posters on the arena's wall and most of the others on the way to it`, onWall >= 4 && near >= p.count * 0.6, `${onWall} on the wall, ${near}/${p.count} within 160 m`);
  await d(([x, z]) => window.__dakar.place(x, z, 0), [cx, cz - WALL_R - 16]);
  await cam([cx - 9, 2.6, cz - WALL_R - 13], [cx - 2, 2.0, cz - WALL_R]); await shot('arena-wall-posters');
  const day = await d(() => window.__dakar.arenaOut().day);
  await d(dd => window.__dakar.postersResult(dd, 'Babacar a battu Lamine'), day);
  p = await d(() => window.__dakar.posters());
  check(`${label}: a result from the career lane is printed on the posters`, p.lines.result === 'Dernier combat : Babacar a battu Lamine', p.lines.result);
  await page.waitForTimeout(2600);                                       // the texture is redrawn within 2 s
  const wallSpot = p.spots.find(s => Math.abs(Math.hypot(s.x - cx, s.z - cz) - WALL_R - 0.27) < 0.05);
  if (wallSpot) { await facePoster(wallSpot); await shot('poster-with-result'); }
  await d(() => window.__dakar.cam(null));

  // 3. the fight evening: climb an aisle, take a place on an upper tier, stand up into the aisle
  await d(() => { window.__dakar.setHour(19); window.__dakar.arenaOutDay(5); });
  await d(() => { const a = window.__dakar.arena?.info?.(); if (a) window.__dakar.state.data.counters.arena_ticket_day = a.day; });
  const aa = Math.PI / 2, wr = 16.6;
  await d(([x, z, y]) => window.__dakar.place(x, z, y), [cx + Math.sin(aa) * wr, cz + Math.cos(aa) * wr, aa]);
  await page.keyboard.down('KeyW');
  const climbed = await until(() => window.__dakar.pos().y > 2.75, null, 40000);
  await page.keyboard.up('KeyW');
  check(`${label}: the aisle climbed to the top tier`, climbed, JSON.stringify(await d(() => window.__dakar.pos())));
  const seatF = await until(() => /^seat:.*arena:stand/.test(window.__dakar.focus()?.id ?? ''), null, 20000);
  const f = await d(() => window.__dakar.focus());
  check(`${label}: from the aisle, a place on the tiers is offered`, seatF && f.primary === 'S’asseoir', JSON.stringify(f));
  await d(() => window.__dakar.act());
  const sat = await until(() => /arena:stand:[12]:/.test(window.__dakar.seated() ?? ''), null, 20000);
  check(`${label}: the player sits on an upper tier`, sat, String(await d(() => window.__dakar.seated())));
  await d(([p0, t]) => window.__dakar.cam(p0, t), [[cx + 20.8, 4.2, cz + 2.2], [cx, 0.8, cz]]); await shot('seated-upper-tier'); await d(() => window.__dakar.cam(null));
  await d(() => window.__dakar.stand());
  await page.waitForTimeout(1200);
  const up = await d(() => window.__dakar.pos());
  check(`${label}: standing up leads into the aisle at the tier's height`, up.y > 1.9 && Math.hypot(up.x - cx, up.z - cz) > 18, `y ${up.y.toFixed(2)} at ${Math.hypot(up.x - cx, up.z - cz).toFixed(1)} m`);
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
