// One character from the studio (Awa: the Meshy femme body, skin 4, the « puff » hairstyle, outfit 0 in colour 1), carried through every place the
// game draws the player: standing in Pikine, a bench, the bed of « Ma chambre », the Teranga's driver's seat, a Dibi's grill, La Vague's floor, the
// Grande Mosquée's row. In each one the player's own body is the one drawn (src/actors/playerBody.ts), with the look of the save (no default body,
// no other hairstyle), in the activity's pose; a close shot of each. The wrestlers' dance (« Mbakkou ») keeps its documented stand-in (a v4 body in
// ngemb, src/main.ts showProxy; scripts/check-avatar.mjs § 7): reported, not failed.
// Usage: node scripts/check-avatar-activities.mjs <baseUrl> <outDir>   (a ?debug build served; headless Chromium + SwiftShader: slow frames, not a phone)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://localhost:4601/', out = '/tmp/claude-0/beta/avatar-act'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const LOOK = { skin: 4, hair: 'puff', outfit: 0, color: 1 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };
const info = (name, detail = '') => { results.push({ name, ok: true, info: true, detail: String(detail).slice(0, 300) }); console.log(`INFO: ${name} ${String(detail).slice(0, 300)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(look => {
    try {
      localStorage.setItem('dakarrek.quality', 'low');
      if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: 'g-avatar-act', avatar: 'femme', appearance: look })); }
    } catch { /* */ }
  }, LOOK);
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }).then(() => true, () => false);
  const shot = async name => { await page.waitForTimeout(900); try { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); } catch { /* a capture never fails the run */ } };
  /** The drawn player: the body file, the look applied to it, whether it is the one shown, the stand-in, the clip. */
  const me = () => d(() => { const D = window.__dakar, a = D.avatar(); return { body: a.body, drawn: a.drawn, stand: a.stand, shown: !!D.body()?.group.visible, clip: D.clip(), seated: D.seated(), act: D.activity()?.id ?? null }; });
  const same = m => m.body === 'meshy_f' && m.shown && m.stand === null && m.drawn && ['skin', 'hair', 'outfit', 'color'].every(k => m.drawn[k] === LOOK[k]);
  const close = (dist = 2.4, h = 1.3, side = 0.45) => d(([a, b, c]) => window.__dakar.portrait(a, b, c), [dist, h, side]);
  const free = () => d(() => window.__dakar.portrait(0));

  await page.goto(`${base}?debug&touch&heure=10&argent=20000000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.teranga && window.__dakar.venues && !document.getElementById('studio'), null, { timeout: 300000 });
  const t = await realTouch(page);
  await page.waitForTimeout(2500);

  // 1 — standing in Pikine
  let m = await me(); await close(); await shot('1-pikine');
  check('1. Pikine: the studio\'s body and look are the ones drawn', same(m), JSON.stringify(m));
  await free();

  // 2 — a bench outside
  const bench = await d(() => window.__dakar.seatsHere().filter(s => (s.kind === 'bench' || s.kind === 'chair') && !s.occupant).map(s => ({ ...s, dd: Math.hypot(s.x - window.__dakar.pos().x, s.z - window.__dakar.pos().z) })).sort((a, b) => a.dd - b.dd)[0] ?? null);
  if (bench) {
    await d(id => window.__dakar.sit(id), bench.id);
    await until(() => window.__dakar.clip() === 'Sit' && !!window.__dakar.seated(), null, 60000);
    m = await me(); await close(2.2, 1.0, 0.6); await shot('2-bench');
    check('2. seated on a bench: her body, her look, the Sit pose', same(m) && m.clip === 'Sit', JSON.stringify(m));
    await free(); await d(() => window.__dakar.stand()); await page.waitForTimeout(1200);
  } else check('2. seated on a bench: a free bench in Pikine', false, 'no free bench or chair');

  // 3 — the bed of « Ma chambre »
  const door = await d(() => window.__dakar.interactables().find(i => i.id === 'pikine:home:11'));   // « Ma chambre »'s door (src/economy/catalog.ts)
  for (const [dx, dz] of [[0, 1.2], [0, -1.2], [1.2, 0], [-1.2, 0]]) {
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [door.x + dx, door.z + dz, Math.atan2(-dx, -dz)]);
    if (await until(() => window.__dakar.focus()?.id === 'pikine:home:11', null, 8000)) break;
  }
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.seatsHere().some(s => s.kind === 'bed' && !/display/.test(s.id)) && window.__dakar.roomInteractables().length > 0, null, 60000);
  const bed = await d(() => window.__dakar.seatsHere().find(s => s.kind === 'bed' && !s.occupant && !/display/.test(s.id))?.id ?? null);
  if (bed) { await d(id => window.__dakar.sit(id), bed); await until(() => window.__dakar.lying() === 1, null, 60000); }
  m = await me(); await close(2.2, 1.6, 0.3); await shot('3-bed');
  check('3. lying on the bed of « Ma chambre »: her body, her look', !!bed && same(m) && (await d(() => window.__dakar.lying())) === 1, JSON.stringify({ bed, ...m }));
  await free(); await d(() => window.__dakar.stand()); await page.waitForTimeout(800); await d(() => window.__dakar.exit());
  await until(() => window.__dakar.roomInteractables().length === 0, null, 60000);

  // 4 — the Teranga's driver's seat (the cockpit in the car's space)
  await until(() => window.__dakar.teranga.info().floor.length > 0, null, 300000);
  await d(() => window.__dakar.teranga.own());
  await until(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, 300000);
  const SPOT = { x: -26, z: -92, yaw: 0 };
  await d(s => { window.__dakar.teranga.place(s.x, s.z, s.yaw); window.__dakar.place(s.x + 2.4, s.z, -Math.PI / 2); }, SPOT);
  await page.waitForTimeout(1200);
  let drove = true;
  try { await boardVehicle(page, t, 'teranga'); } catch { drove = false; }
  await until(() => /^(Sit|Drive|SitCar)$/.test(window.__dakar.clip() ?? ''), null, 30000);   // at the wheel: « Drive » (hands on the rim, src/transport/cabinFit.ts)
  m = await me(); const car = await d(() => window.__dakar.teranga.at());
  const inSeat = await d(() => { const p = window.__dakar.pos(), c = window.__dakar.teranga.at(); return Math.hypot(p.x - c.x, p.z - c.z); });
  await close(2.0, 1.2, 1.2); await shot('4-teranga');
  check('4. driving the Teranga: her body in the driver\'s seat, her look', drove && car?.driving && same(m) && /^(Sit|Drive|SitCar)$/.test(m.clip ?? '') && inSeat < 1.6, JSON.stringify({ ...m, inSeat: +inSeat.toFixed(2) }));
  await free();
  await t.tap('#ridepad .rp-off').catch(() => {});                                     // « Descendre », as a finger would
  if (!(await until(() => !window.__dakar.teranga.at()?.driving, null, 30000))) { await page.locator('#ridepad .rp-off').click({ force: true }).catch(() => {}); await until(() => !window.__dakar.teranga.at()?.driving, null, 60000); }
  await until(() => !window.__dakar.seated() && window.__dakar.pos().mode === 'play', null, 60000);   // the door opens, she steps out (game time)
  await shot('4b-out');
  check('4b. out of the car: on foot again, the same body', !(await d(() => window.__dakar.teranga.at()?.driving)) && !(await d(() => window.__dakar.seated())) && same(await me()), JSON.stringify(await me()));
  await page.waitForTimeout(800);

  // 5 — a Dibi's grill (Pikine, the evening)
  await d(() => { const D = window.__dakar; D.setHour(18.5); D.state.data.needs.energie = 100; });
  await until(() => window.__dakar.venues().some(v => v.type === 'dibi' && v.moment !== 'closed'), null, 120000);
  const dibi = await d(() => window.__dakar.venues().find(x => x.type === 'dibi'));
  const ga = dibi.anchors.find(x => x.id === 'grill');
  await d(([x, z, y]) => window.__dakar.place(x, z, y), [ga.x - Math.sin(dibi.yaw) * 0.2, ga.z - Math.cos(dibi.yaw) * 0.2, dibi.yaw]);
  await until(() => /:grill$/.test(window.__dakar.focus()?.id ?? ''), null, 120000);
  await t.tap('#act');
  await until(() => !!window.__dakar.activity(), null, 60000);
  await page.waitForTimeout(2500);
  m = await me(); await close(2.2, 1.5, 0.9); await shot('5-grill');
  check('5. at the Dibi\'s grill: her body, her look, the grill gesture under way', same(m) && !!m.act, JSON.stringify(m));
  await free(); await d(() => window.__dakar.gestureFinish?.()); await until(() => !window.__dakar.activity(), null, 120000);
  if (await d(() => !!window.__dakar.activity())) await d(() => window.__dakar.stand());

  // 6 — La Vague's floor (Almadies, late)
  await d(() => { const D = window.__dakar; D.teleport('almadies'); D.setHour(23.5); D.state.data.needs.energie = 100; });
  await until(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.venues().some(v => v.type === 'club'), null, 600000);
  await d(() => { const D = window.__dakar, c = D.venues().find(x => x.type === 'club'); D.state.data.counters[`club:${c.id}:nuit`] = c.night + 1; });
  const club = await d(() => window.__dakar.venues().find(x => x.type === 'club'));
  await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [club.floor, club.yaw]);
  await until(() => /:floor$/.test(window.__dakar.focus()?.id ?? ''), null, 120000);
  await t.tap('#act');
  await until(() => !!window.__dakar.activity(), null, 60000);
  await until(() => /^Dance/.test(window.__dakar.clip() ?? ''), null, 30000);
  m = await me(); await close(2.6, 1.4, 0.5); await shot('6-dance');
  check('6. dancing at La Vague: her body, her look, a dance clip', same(m) && /^Dance/.test(m.clip ?? ''), JSON.stringify(m));
  await free(); await d(() => window.__dakar.gestureFinish?.()); await until(() => !window.__dakar.activity(), null, 180000);

  // 7 — the Grande Mosquée (Plateau): ablutions, shoes off at the door, a place on a row
  await d(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(10); });
  await until(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.venues().some(x => x.type === 'mosque'), null, 600000);
  const mq = await d(() => window.__dakar.venues().find(x => x.type === 'mosque'));
  const standAt = async (pt, yaw, re, back = 0.6) => { await d(([x, z, y]) => window.__dakar.place(x, z, y), [pt.x - Math.sin(yaw) * back, pt.z - Math.cos(yaw) * back, yaw]); return until(r => new RegExp(r).test(window.__dakar.focus()?.id ?? ''), re.source, 30000); };
  await standAt(mq.anchors.find(a => a.id === 'ablutions'), mq.yaw - Math.PI / 2, /:ablutions$/, 0.3);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.activity()?.id === 'ablutions', null, 20000);
  await until(() => !!window.__dakar.seated() && window.__dakar.clip() === 'Sit', null, 30000);
  m = await me(); await close(2.0, 1.1, 0.8); await shot('7a-ablutions');
  check('7a. ablutions at the taps: her body, her look, seated on the stool', same(m) && m.clip === 'Sit', JSON.stringify(m));
  await free(); await until(() => !window.__dakar.activity(), null, 90000); await d(() => window.__dakar.stand());
  await standAt(mq.anchors.find(a => a.id === 'door'), mq.yaw + Math.PI, /:door$/);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.pos().x > 1500, null, 30000);
  await d(() => window.__dakar.place(1600.4, 1.6, Math.PI));
  await until(() => /:hall$/.test(window.__dakar.focus()?.id ?? ''), null, 30000);
  await d(() => window.__dakar.act());
  await until(() => window.__dakar.activity()?.id === 'priere', null, 20000);
  await until(() => !!window.__dakar.seated() && /^Pray/.test(window.__dakar.clip() ?? ''), null, 30000);
  await page.waitForTimeout(2500);
  m = await me(); await close(2.4, 1.2, 0.9); await shot('7b-prayer');
  check('7b. praying on a row, barefoot: her body, her look, the prayer\'s postures', same(m) && /^Pray/.test(m.clip ?? ''), JSON.stringify(m));
  const quiet = await d(() => { const shown = id => { const e = document.getElementById(id), r = e?.getBoundingClientRect(); return !!r && r.width > 0 && getComputedStyle(e).display !== 'none'; }; return { focus: document.body.dataset.focus ?? null, stats: shown('stats'), place: shown('place'), streak: shown('streakChip'), minimap: shown('minimap'), act: document.getElementById('act')?.innerText.trim() }; });
  check('7c. during the prayer the HUD steps back: only a quiet « Quitter » stays', quiet.focus === 'prayer' && !quiet.stats && !quiet.place && !quiet.streak && !quiet.minimap, JSON.stringify(quiet));
  await free(); await until(() => !window.__dakar.activity(), null, 400000);

  // 8 — the wrestlers' dance keeps its stand-in (documented, not a regression)
  await d(() => window.__dakar.stand()); await page.waitForTimeout(500);
  await d(() => { window.__dakar.pause(true); window.__dakar.emote(0); window.__dakar.step(1 / 60, 30); });   // stepped: 5 s of game time, whatever the renderer
  m = await me();
  info('8. « Mbakkou » (the wrestlers\' dance) shows the v4 wrestler in ngemb in place of her body, as designed for the attire and the emotes', JSON.stringify({ stand: m.stand, shown: m.shown }));
  await d(() => window.__dakar.step(1 / 60, 60 * 6)); m = await me(); await d(() => window.__dakar.pause(false));
  check('8. after « Mbakkou » her own body and look are back', same(m), JSON.stringify(m));

  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(`${results.filter(r => !r.info).length - failed}/${results.filter(r => !r.info).length} passed`);
  process.exitCode = failed ? 1 : 0;
}
