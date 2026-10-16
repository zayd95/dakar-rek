// The Grande Mosquée's Quranic text: calligraphy panels in the prayer hall and the mushaf on its stand, verbatim from
// Tanzil (src/venues/quran.json), credited, and read without any reward. Desktop and phone.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-quran.mjs [baseUrl] [outDir]   (needs a running build)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4212/';
const out = process.argv[3] ?? 'docs/screenshots/quran';
fs.mkdirSync(out, { recursive: true });
const data = JSON.parse(fs.readFileSync(new URL('../src/venues/quran.json', import.meta.url), 'utf8'));
const fatiha = data.passages.find(p => p.id === 'fatiha').verses.map(v => v.text);
const T = { timeout: 360000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.venues, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 180000) => page.waitForFunction(fn, arg, { timeout, polling: 250 }).then(() => true).catch(() => false);
  const shot = async name => {
    await page.waitForTimeout(800);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 240000 }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const snap = () => d(() => ({ w: window.__dakar.state.wallet, c: JSON.stringify(window.__dakar.state.data.counters), n: { ...window.__dakar.state.data.needs } }));

  await d(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(10); });
  await until(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.venues().some(x => x.type === 'mosque'));
  const m = await d(() => window.__dakar.venues().find(x => x.type === 'mosque'));
  const q = m?.quran ?? [];
  const ref = id => q.find(p => p.id === id);
  check(`${label}: three calligraphy panels in the prayer hall, whole verses only`,
    ref('kursi')?.refs === '2:255' && ref('ikhlas')?.refs === '112:1,112:2,112:3,112:4' && ref('bismillah')?.refs === '1:1', JSON.stringify(q));
  check(`${label}: the panels are drawn (the device has a font that joins Arabic letters)`, q.length === 3 && q.every(p => p.drawn && p.lines >= 1), q.map(p => `${p.id}:${p.lines}`).join(' '));

  // into the hall (the door's own route — ablutions, shoes — is covered by check-venues)
  const door = m.anchors.find(a => a.id === 'door'), dy = m.yaw + Math.PI;
  await d(([x, z, y]) => window.__dakar.place(x, z, y), [door.x - Math.sin(dy) * 0.6, door.z - Math.cos(dy) * 0.6, dy]);
  await until(() => /:door$/.test(window.__dakar.focus()?.id ?? ''), null, 60000);
  await d(() => window.__dakar.act());
  const inside = await until(() => window.__dakar.pos().x > 1500 && window.__dakar.pos().mode === 'play');
  check(`${label}: inside the prayer hall`, inside, JSON.stringify(await d(() => window.__dakar.pos())));
  await d(() => window.__dakar.cam([1600, 2.0, 5.5], [1600 - 2.2, 3.1, -7.5])); await shot('hall-qibla');
  await d(() => window.__dakar.cam([1600 - 4.4, 2.9, -3.2], [1600 - 6, 3.1, -7.5])); await shot('kursi');
  await d(() => window.__dakar.cam([1600, 3.0, -4.6], [1600, 4.1, -7.5])); await shot('ikhlas');
  await d(() => window.__dakar.cam([1600, 2.4, 2.5], [1600, 3.85, 7.5])); await shot('bismillah');
  await d(() => window.__dakar.cam([1600 - 7.7, 1.25, 4.1], [1600 - 9.05, 0.5, 4.6])); await shot('mushaf');
  await d(() => window.__dakar.cam(null));

  // the mushaf: « Lire le Coran »
  await d(() => window.__dakar.place(1600 - 8.25, 4.6, -Math.PI / 2));
  const focused = await until(() => /:shelf$/.test(window.__dakar.focus()?.id ?? ''), null, 60000);
  const f = await d(() => window.__dakar.focus());
  check(`${label}: the mushaf on its stand offers « Lire le Coran »`, focused && f?.name === 'Coran sur son support' && f.all.includes('Lire le Coran'), JSON.stringify(f));
  const before = await snap();
  await d(() => window.__dakar.act());
  const open = await until(() => !!document.querySelector('#modal.on .mushaf'), null, 60000);
  const view = await d(() => ({
    ayas: [...document.querySelectorAll('#modal.on .mushaf .aya')].map(e => e.textContent),
    nums: [...document.querySelectorAll('#modal.on .mushaf .aya-n')].map(e => e.textContent),
    dir: document.querySelector('#modal.on .mushaf-text')?.getAttribute('dir'),
    lang: document.querySelector('#modal.on .mushaf-text')?.getAttribute('lang'),
    credit: document.querySelector('#modal.on .mushaf-credit')?.textContent ?? '',
    link: document.querySelector('#modal.on .mushaf-credit a')?.getAttribute('href'),
    ref: document.querySelector('#modal.on .mushaf-ref')?.textContent ?? '',
    fits: (() => { const p = document.querySelector('#modal.on .panel').getBoundingClientRect(); return p.left >= 0 && p.right <= innerWidth + 1; })(),
  }));
  check(`${label}: the reading view shows Al-Fâtiha verbatim, right to left, verse by verse`, open && view.dir === 'rtl' && view.lang === 'ar' && view.ayas.length === 7 && view.ayas.every((t, i) => t === fatiha[i]) && view.nums.join('') === '١٢٣٤٥٦٧', JSON.stringify({ n: view.ayas.length, nums: view.nums.join('') }));
  check(`${label}: the source is credited with its link (Tanzil Project — tanzil.net)`, /Tanzil Project/.test(view.credit) && view.link === 'https://tanzil.net' && /Al-Fâtiha \(1\), versets 1 à 7/.test(view.ref), `${view.credit} · ${view.ref}`);
  check(`${label}: the reading view fits the screen`, view.fits);
  await shot('reading');
  await page.keyboard.press('Escape');
  const closed = await until(() => !document.querySelector('#modal.on') && window.__dakar.pos().mode === 'play', null, 60000);
  const after = await snap();
  const needsSame = Object.keys(before.n).every(k => Math.abs(after.n[k] - before.n[k]) < 1);
  check(`${label}: Échap closes the reading; reading changed nothing (money, counters, needs)`, closed && after.w === before.w && after.c === before.c && needsSame, JSON.stringify({ w: [before.w, after.w], needsSame }));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await page.context().close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} quran checks passed`);
process.exit(failed ? 1 : 0);
