// Headless checks of the contextual interaction system (src/interact): seats, legacy places, doors, prompts.
// Usage: node scripts/check-interact.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4208`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4208/';
const out = process.argv[3] ?? 'docs/screenshots/interact';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 90000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await (await browser.newContext({ viewport, hasTouch: touch, isMobile: touch })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const focus = () => d(() => window.__dakar.focus());

  // 1. A city bench: walk up to it, the prompt offers « S’asseoir », the body sits at the right height, then stands.
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(16); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  const free = (await d(() => window.__dakar.seatsHere())).find(s => s.kind === 'bench' && !s.occupant);
  check(`${label}: the hub has free street seats`, !!free, free?.id ?? 'none');
  if (free) {
    // stand 0.8 m in front of the seat, facing it
    await d(s => window.__dakar.place(s.x + Math.sin(s.yaw) * 0.8, s.z + Math.cos(s.yaw) * 0.8, s.yaw + Math.PI), free);
    await page.waitForFunction(() => window.__dakar.focus()?.kind === 'seat', null, T).catch(() => {});
    const f = await focus();
    check(`${label}: walking up to a bench focuses it with « S’asseoir »`, f?.kind === 'seat' && /asseoir/.test(f.primary ?? ''), JSON.stringify(f));
    // the bubble is placed by the frame loop (projection of the target): wait for a frame that shows it (slow software rendering)
    await page.waitForFunction(() => document.getElementById('wprompt')?.classList.contains('on'), null, T).catch(() => {});
    const prompt = await d(() => document.getElementById('wprompt')?.classList.contains('on') && document.getElementById('wprompt').textContent);
    check(`${label}: a diegetic prompt floats above the seat`, typeof prompt === 'string' && /asseoir/.test(prompt), String(prompt));
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => window.__dakar.clip() === 'Sit', null, T).catch(() => {});
    const sat = await d(() => ({ seated: window.__dakar.seated(), y: window.__dakar.pos().y, clip: window.__dakar.clip(), focus: window.__dakar.focus() }));
    check(`${label}: the action sits the character on the bench`, sat.seated === free.id && sat.clip === 'Sit' && Math.abs(sat.y - (free.top - 0.48)) < 0.05, JSON.stringify(sat));
    check(`${label}: while seated the main action is « Se lever »`, sat.focus?.primary === 'Se lever', JSON.stringify(sat.focus));
    await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${label}-bench-seated.png` });
    if (touch) { await d(() => window.__dakar.act()); await page.waitForFunction(() => !window.__dakar.seated() && window.__dakar.clip() !== 'Sit', null, T).catch(() => {}); }
    else { await page.keyboard.down('KeyW'); await page.waitForFunction(() => !window.__dakar.seated(), null, T).catch(() => {}); await page.keyboard.up('KeyW'); }
    const up = await d(() => ({ seated: window.__dakar.seated(), clip: window.__dakar.clip(), pos: window.__dakar.pos() }));
    check(`${label}: ${touch ? '« Se lever »' : 'moving'} stands up`, up.seated === null && up.clip !== 'Sit', JSON.stringify(up));
  }

  // 1b. Anyone in the street can be greeted: « Saluer », then « Demander son nom ».
  const folks = ((await d(() => window.__dakar.cityGeometry()))?.people ?? []).filter(p => p.clip === 'Talk' && !p.walkTo);
  let greeted = null;
  for (const p of folks.slice(0, 6)) {
    await d(q => window.__dakar.place(q.x + Math.sin(q.yaw) * 1.1, q.z + Math.cos(q.yaw) * 1.1, q.yaw + Math.PI), p);
    await page.waitForTimeout(1500);
    const f = await focus();
    if (f?.kind === 'person') { greeted = f; break; }
  }
  check(`${label}: walking up to a person offers « Saluer » and « Demander son nom »`, greeted?.primary === 'Saluer' && greeted.all.includes('Demander son nom'), JSON.stringify(greeted));
  if (greeted) {
    await d(() => window.__dakar.act());
    // Wolof exchange (src/i18n/lines.ts), French typography with no-break spaces: « Toi : « Salaam aleekum ! » · Passant : « Maleekum salaam ! » »
    const said = () => (document.getElementById('toast')?.textContent ?? '').replace(/[  ]/g, ' ');
    await page.waitForFunction(src => new RegExp(src).test((document.getElementById('toast')?.textContent ?? '').replace(/[  ]/g, ' ')), 'Maleekum salaam', T).catch(() => {});
    const answer = await d(said);
    // (the toast may already show this person's follow-up: the greeting of the hour and « Jàmm rekk. »)
    check(`${label}: greeting gets an answer (« Salaam aleekum ! » — « Maleekum salaam ! »)`, /^Toi : « Salaam aleekum ! » · Passan(t|te) : « Maleekum salaam ! »$|· Toi : « Jàmm rekk\. » \(tout va bien\)$/.test(answer), answer);
    await page.screenshot({ path: `${out}/${label}-greet.png` });
  }

  // 2. A place keeps its sheet (prices, description); its actions are also offered one by one in « ⋯ ».
  await d(() => { window.__dakar.teleport('almadies'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, T);
  const juice = (await d(() => window.__dakar.cityPlaces())).find(p => p.name === 'Jus & Go');
  if (juice) {
    await d(p => window.__dakar.place(p.x, p.z, Math.PI), juice);
    await page.waitForFunction(() => window.__dakar.focus()?.name === 'Jus & Go', null, T).catch(() => {});
    const f = await focus();
    check(`${label}: a place stays focused at its counter, with its own actions listed`, f?.name === 'Jus & Go' && f.all.length > 2, JSON.stringify(f));
    await d(() => window.__dakar.more());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    const items = await d(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent));
    check(`${label}: « ⋯ » opens the target's actions with their icons`, items.some(t => /bouye/i.test(t)), items.slice(0, 4).join(' | '));
    await page.screenshot({ path: `${out}/${label}-more-sheet.png` });
    await d(() => document.querySelector('#modal .item.close')?.click());
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  }

  // 3. A restaurant front: its sheet stays the main action; « ⋯ » offers « Entrer » and its meals one by one.
  //    Inside, chairs and benches are seats too.
  await d(() => { window.__dakar.teleport('pikine'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  const maiga = (await d(() => window.__dakar.interactables())).find(i => i.id.includes(':maiga:'));
  if (maiga) {
    await d(p => window.__dakar.place(p.x, p.z, 0), maiga);
    await page.waitForFunction(() => /Maïga/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
    const f = await focus();
    check(`${label}: the Maïga front offers « Entrer » and its meals`, /Maïga/.test(f?.name ?? '') && ['Entrer', 'Riz au poisson'].every(x => f.all.includes(x)), JSON.stringify(f));
    await d(() => window.__dakar.more());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await page.locator('#modal .item', { hasText: 'Entrer' }).first().click();
    await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T).catch(() => {});
    const seatsIn = await d(() => window.__dakar.seatsHere());
    check(`${label}: the Maïga has seats (bench and chairs)`, seatsIn.length >= 4, `${seatsIn.length} seats`);
    const bench = seatsIn.find(s => s.kind === 'bench');
    if (bench) {
      await d(id => window.__dakar.sit(id), bench.id);
      const st = await d(() => ({ seated: window.__dakar.seated(), clip: window.__dakar.clip() }));
      check(`${label}: sitting on the Maïga bench`, st.seated === bench.id, JSON.stringify(st));
      await page.waitForTimeout(800); await page.screenshot({ path: `${out}/${label}-maiga-bench.png` });
      await d(() => window.__dakar.stand());
    }
    // 4. A composed activity: the Maïga's « Riz au poisson » = pay → the plate is prepared → sit → eat (and stay seated).
    const counter = (await d(() => window.__dakar.roomInteractables())).find(i => /counter/.test(i.id));
    if (counter) {
      await d(() => { const s = window.__dakar.state; s.data.wallet = 3000; s.data.needs.faim = 30; });
      await d(p => window.__dakar.place(p.x - 0.6, p.z, Math.PI / 2), counter);
      await page.waitForFunction(() => /:counter$/.test(window.__dakar.focus()?.id ?? ''), null, T).catch(() => {});
      await d(() => window.__dakar.act());
      await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
      await page.locator('#modal .item', { hasText: 'Riz au poisson' }).first().click();
      await page.waitForFunction(() => window.__dakar.activity()?.step === 'Préparation' && /Arrêter/.test(document.getElementById('act').textContent), null, T).catch(() => {});
      const waiting = await d(() => ({ a: window.__dakar.activity(), wallet: window.__dakar.state.wallet, seated: window.__dakar.seated(), btn: document.getElementById('act').textContent }));
      check(`${label}: ordering pays at the counter, then the plate is prepared`, waiting.wallet === 2500 && waiting.a?.step === 'Préparation' && !waiting.seated && /Arrêter/.test(waiting.btn), JSON.stringify(waiting));
      await page.waitForFunction(() => window.__dakar.activity()?.step === 'Tu manges', null, { timeout: 180000 }).catch(() => {});
      const eating = await d(() => ({ seated: window.__dakar.seated(), clip: window.__dakar.clip() }));
      check(`${label}: then the character sits at a free seat to eat`, !!eating.seated && eating.clip === 'Sit', JSON.stringify(eating));
      await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-maiga-eating.png` });
      await page.waitForFunction(() => !window.__dakar.activity(), null, { timeout: 180000 }).catch(() => {});
      const done = await d(() => ({ faim: window.__dakar.state.data.needs.faim, seated: window.__dakar.seated(), meals: window.__dakar.state.data.counters.meals ?? 0, focus: window.__dakar.focus()?.primary }));
      check(`${label}: the meal feeds the character, who stays seated (« Se lever »)`, done.faim >= 65 && !!done.seated && done.focus === 'Se lever', JSON.stringify(done));
      await d(() => window.__dakar.stand());
    }
  }
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} interaction checks passed`);
process.exit(failed ? 1 : 0);
