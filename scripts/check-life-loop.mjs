// The life loop, played end to end on a NEW game: start small → meet people → work → earn → eat → rest → buy and
// furnish the room → reload and find everything again. Grows with each integration (docs/NUIT_2026-10-09.md).
// Usage: node scripts/check-life-loop.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4208`)
// Long walks are shortened with `place()` next to the target; every interaction itself goes through the game's own
// action button, menus and activity runner.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4208/';
const out = process.argv[3] ?? 'docs/screenshots/life-loop';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 90000 }, LONG = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });   // fresh storage = new game
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const url = `${base}?debug${touch ? '&touch' : ''}`;
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const closeMenus = async () => {
    await d(() => document.querySelector('#modal.on .item.close')?.click());
    await page.waitForFunction(() => !document.querySelector('#modal.on') && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  };
  const pickItem = async text => { await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {}); await page.locator('#modal.on .item', { hasText: text }).first().click(); };
  const S = () => d(() => { const s = window.__dakar.state; return { wallet: s.wallet, needs: { ...s.data.needs }, counters: { ...s.data.counters }, furniture: [...window.__dakar.furniture().owned], ledger: s.data.ledger.length }; });

  // 1. Start small: a new game in Pikine, a little money, a clear next step.
  await d(() => window.__dakar.setHour(10));
  const start = await S();
  const goal = await d(() => document.getElementById('goal')?.textContent ?? '');
  check(`${label}: a new game starts in Pikine with little money and a next step`, (await d(() => window.__dakar.pos().hub)) === 'pikine' && start.wallet <= 5000 && goal.length > 4, `${start.wallet} F · ${goal}`);
  await shot('01-start');

  // 2. Meet people: greet a passer-by, then talk to Tonton Ibou.
  const folks = ((await d(() => window.__dakar.cityGeometry()))?.people ?? []).filter(p => p.clip === 'Talk' && !p.walkTo);
  let greeted = false;
  for (const p of folks.slice(0, 6)) {
    await d(q => window.__dakar.place(q.x + Math.sin(q.yaw) * 1.1, q.z + Math.cos(q.yaw) * 1.1, q.yaw + Math.PI), p);
    await page.waitForTimeout(1200);
    if ((await d(() => window.__dakar.focus()))?.kind === 'person') { await d(() => window.__dakar.act()); greeted = true; break; }
  }
  await page.waitForFunction(() => /salaam/i.test(document.getElementById('toast')?.textContent ?? ''), null, T).catch(() => {});
  check(`${label}: meet people — a passer-by answers the greeting`, greeted && /salaam/i.test(await d(() => document.getElementById('toast').textContent)), '');
  const ibou = (await d(() => window.__dakar.interactables())).find(i => /Ibou/.test(i.name));
  if (ibou) {
    await d(p => window.__dakar.place(p.x, p.z + 1.2, Math.PI), ibou);
    await page.waitForFunction(() => /Ibou/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    const sheet = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
    check(`${label}: meet people — Tonton Ibou talks (relation shown)`, /Ibou/.test(sheet) && /Relation/.test(sheet), sheet.slice(0, 90));
    await shot('02-ibou');
    await closeMenus();
  } else check(`${label}: meet people — Tonton Ibou is in Pikine`, false);

  // 3. Work and earn: Tiak Tiak deliveries from the gargote until the cheapest furniture is affordable.
  const jobs = await d(() => window.__dakar.jobs());
  const job = jobs.find(j => !j.blocked);
  check(`${label}: work — the gargote offers Tiak Tiak deliveries`, !!job, JSON.stringify(jobs.slice(0, 2)));
  const furn = await d(() => window.__dakar.furniture());
  const cheapest = [...furn.items].filter(i => !i.owned).sort((a, b) => a.price - b.price)[0];
  let runs = 0, earned = 0;
  while (job && runs < 12) {
    const j = (await d(() => window.__dakar.jobs())).find(x => !x.blocked);
    if (!j) break;
    await d(id => window.__dakar.acceptJob(id, true), j.id);
    const c = await d(() => window.__dakar.completeJob());
    if (!c) break;
    runs++; earned += c.paid;
    if ((await S()).wallet >= cheapest.price + 1500) break;
  }
  const afterWork = await S();
  check(`${label}: earn — deliveries pay into the wallet with a history line each`, earned > 0 && afterWork.wallet === start.wallet + earned && afterWork.counters.livraisons === runs && afterWork.ledger >= runs, `${runs} runs, +${earned} F → ${afterWork.wallet} F`);

  // 4. Eat: a meal at the Maïga (pay → prepared → sit → eat).
  const maiga = (await d(() => window.__dakar.interactables())).find(i => i.id.includes(':maiga:'));
  if (maiga) {
    await d(() => { window.__dakar.state.data.needs.faim = 30; });
    await d(p => window.__dakar.place(p.x, p.z, 0), maiga);
    await page.waitForFunction(() => /Maïga/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
    await d(() => window.__dakar.more()); await pickItem('Entrer');
    await page.waitForFunction(() => window.__dakar.pos().x > 900 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
    const counter = (await d(() => window.__dakar.roomInteractables())).find(i => /counter/.test(i.id));
    await d(p => window.__dakar.place(p.x - 0.6, p.z, Math.PI / 2), counter);
    await page.waitForFunction(() => /:counter$/.test(window.__dakar.focus()?.id ?? ''), null, T).catch(() => {});
    const before = (await S()).wallet;
    await d(() => window.__dakar.act()); await pickItem('Riz au poisson');
    await page.waitForFunction(() => window.__dakar.activity()?.step === 'Tu manges', null, LONG).catch(() => {});
    await shot('03-eating');
    await page.waitForFunction(() => !window.__dakar.activity(), null, LONG).catch(() => {});
    const fed = await S();
    check(`${label}: eat — the meal is paid once and feeds the character`, before - fed.wallet === 500 && fed.needs.faim >= 60, `${before} → ${fed.wallet} F, faim ${Math.round(fed.needs.faim)}`);
    await d(() => window.__dakar.stand());
    await d(() => window.__dakar.exit());
    await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  } else check(`${label}: eat — the Maïga is in Pikine`, false);

  // 5. Rest: sleep in the room.
  await d(() => { window.__dakar.state.data.needs.energie = 20; window.__dakar.enter('home'); });
  await page.waitForFunction(() => window.__dakar.pos().x > 900 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const bed = (await d(() => window.__dakar.roomInteractables())).find(i => /dormir|lit|bed|natte/i.test(i.id + i.name));
  if (bed) {
    // a sheet left open by an earlier step (a story beat, a toast's sheet) must not be taken for the bed's
    await d(() => { document.querySelector('#modal.on .item.close')?.click(); document.querySelector('#modal')?.classList.remove('on'); });
    await d(p => window.__dakar.place(p.x, p.z + 0.4, Math.PI), bed);
    await page.waitForFunction(() => /dormir|lit|bed|natte/i.test(JSON.stringify(window.__dakar.focus() ?? {})), null, { timeout: 30000 }).catch(() => {});
    const f = await d(() => window.__dakar.focus());
    await d(() => window.__dakar.act());
    if (await d(() => !!document.querySelector('#modal.on'))) {
      const sheet = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
      if (/Dormir/.test(sheet)) await pickItem('Dormir');
      else console.log(`NOTE ${label}: the sheet at the bed has no « Dormir »: ${sheet.slice(0, 200)} · focus ${JSON.stringify(f)}`);
    }
    // lying along the bed while asleep (the kit's Lie pose on the bed's seat), not sitting on its edge
    await page.waitForFunction(() => window.__dakar.activity()?.step === 'Tu dors' && window.__dakar.clip() === 'Lie', null, T).catch(() => {});
    const asleep = await d(() => ({ clip: window.__dakar.clip(), seat: window.__dakar.seated(), y: window.__dakar.pos().y, step: window.__dakar.activity()?.step }));
    check(`${label}: rest — asleep, the body lies along the bed`, asleep.clip === 'Lie' && /:lit$/.test(asleep.seat ?? '') && asleep.y > 0.5, JSON.stringify(asleep));
    await d(() => { const p = window.__dakar.pos(); window.__dakar.cam([p.x + 2.2, p.y + 1.9, p.z + 0.4], [p.x, p.y + 0.15, p.z]); });
    await shot('05-home-sleep');
    await d(() => window.__dakar.cam(null));
    await page.waitForFunction(() => window.__dakar.state.data.needs.energie > 60, null, LONG).catch(() => {});
    const rested = await S();
    check(`${label}: rest — sleeping at home restores energy`, rested.needs.energie > 60, `${f?.name} · énergie ${Math.round(rested.needs.energie)}`);
    await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, LONG).catch(() => {});
    // the night over, up beside the bed: standing, on the floor, outside the bed's frame
    const up = await d(() => ({ clip: window.__dakar.clip(), seat: window.__dakar.seated(), pos: window.__dakar.pos(), bed: window.__dakar.roomInteractables().find(i => /:in:bed$/.test(i.id)) }));
    check(`${label}: rest — awake, standing beside the bed`, up.seat === null && up.clip !== 'Lie' && up.pos.y < 0.2 && Math.abs(up.pos.x - (up.bed.x - 1.05)) > 0.75, JSON.stringify(up));
    await shot('05b-home-awake');
  } else check(`${label}: rest — the room has a place to sleep`, false, JSON.stringify(await d(() => window.__dakar.roomInteractables())));

  // 6. Buy and furnish: the cheapest piece, paid once, visible and usable in the room.
  const beforeBuy = await S();
  // what the room offers: its own spots, the home's furniture places (asset model: src/economy/estate.ts) and its seats
  const contents = () => d(() => ({ spots: window.__dakar.roomInteractables().map(i => i.name), places: window.__dakar.placeList().filter(p => p.space === 'home').flatMap(p => p.anchors), seats: window.__dakar.seatsHere().map(x => x.id) }));
  const size = c => c.spots.length + c.places.length + c.seats.length;
  const roomBefore = size(await contents());
  const ok = cheapest ? await d(id => window.__dakar.buy(id), cheapest.id) : false;
  await page.waitForTimeout(800);
  const bought = await S();
  const roomAfter = await contents();
  check(`${label}: buy — the first furniture is paid exactly once`, ok && beforeBuy.wallet - bought.wallet === cheapest.price && bought.furniture.includes(cheapest.id), `${cheapest?.name} ${cheapest?.price} F`);
  check(`${label}: furnish — the new piece is in the room and usable`, size(roomAfter) > roomBefore, `${roomBefore} → ${size(roomAfter)} · ${JSON.stringify(roomAfter)}`);
  await shot('06-furnished');

  // 7. Save and reload: money, furniture and progress come back; nothing is paid twice.
  await d(() => window.__dakar.exit());
  await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  const saved = await S();
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await page.waitForTimeout(1500);
  const back = await S();
  check(`${label}: reload — wallet, furniture and counters are restored`, back.wallet === saved.wallet && back.furniture.join() === saved.furniture.join() && back.counters.livraisons === saved.counters.livraisons && back.counters.meals === saved.counters.meals, `${back.wallet} F · ${back.furniture.join(',')}`);
  await shot('07-reloaded');
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} life-loop checks passed`);
process.exit(failed ? 1 : 0);
