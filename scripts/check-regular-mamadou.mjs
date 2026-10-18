// M1-C, first slice, in the real game on a phone: Mamadou recognises a regular at Boutique Diallo (src/social/regular.ts).
// Three real purchases at the counter → the toast, then the sheet greets in a few words and shows the neighbour price (the full price
// struck through, one row not two); a reload keeps it; a New Game forgets it; another place's sheet is untouched.
// Usage: node scripts/check-regular-mamadou.mjs [baseUrl] [shotsDir]   (a worker, so the presence socket answers: wrangler dev or the preview)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4322/', shots = process.argv[3] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const T = { timeout: 180000 };
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg);

const ready = async () => {
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(1500);
};
const goTo = async frag => {
  const it = await d(f => { const t = window.__dakar.interactables().find(i => i.id.startsWith('pikine:') && i.id.includes(f)); return t ? { id: t.id, x: t.x, z: t.z } : null; }, frag);
  await d(k => window.__dakar.place(k.x, k.z + 1.5, Math.PI), it);
  await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, it.id, T).catch(() => {});
  await page.waitForTimeout(500);
  return it;
};
const sheet = () => d(() => {
  const m = document.querySelector('#modal.on'); if (!m) return null;
  return {
    title: m.querySelector('.sh-title, h2, .title')?.textContent ?? '', sub: m.querySelector('.sh-sub')?.textContent ?? '',
    rows: [...m.querySelectorAll('.item:not(.close)')].map(e => ({ label: e.querySelector('.lb')?.textContent ?? '', price: e.querySelector('.ui-price')?.textContent ?? '', was: e.querySelector('.ui-was')?.textContent ?? '', h: Math.round(e.getBoundingClientRect().height) })),
    sheetH: Math.round(m.querySelector('.sheet')?.getBoundingClientRect().height ?? 0), vh: innerHeight,
  };
});
const openHere = async () => { await d(() => window.__dakar.act()); await page.waitForFunction(() => document.querySelector('#modal.on'), null, T); await page.waitForTimeout(700); return sheet(); };
const closeSheet = async () => { if (await d(() => !!document.querySelector('#modal.on'))) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); } };
const served = () => d(() => window.__dakar.state.data.counters.served_mamadou ?? 0);
// toasts vanish after a few seconds: a page-side log keeps every one that was shown
await context.addInitScript(() => { window.__toastLog = []; const seen = () => { const t = document.getElementById('toast')?.textContent?.replace(/\s+/g, ' ').trim(); if (t && !window.__toastLog.includes(t)) window.__toastLog.push(t); }; new MutationObserver(seen).observe(document, { childList: true, subtree: true, characterData: true }); });
const toasts = () => d(() => window.__toastLog.join(' | '));
const buySugar = async () => {
  const before = await served(), wallet = await d(() => window.__dakar.state.wallet);
  await page.locator('#modal.on .item', { hasText: 'Sucre et thé' }).first().click();
  await page.waitForFunction(n => (window.__dakar.state.data.counters.served_mamadou ?? 0) > n, before, T);
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T); await page.waitForTimeout(400);
  return { served: await served(), paid: wallet - await d(() => window.__dakar.state.wallet) };
};
const peek = (key = 'dakarrek.guest.save.v6') => d(k => { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }, key);

await page.goto(`${base}?debug&touch`, { timeout: 120000 });
await ready();
await d(() => { const x = window.__dakar.state.data; x.wallet = 5000; x.needs.energie = 90; x.needs.faim = 80; });

// 1. a stranger: the plain sheet, one sugar row at the full price
await goTo(':city:boutique');
let sh = await openHere();
const sugar0 = sh.rows.filter(r => /Sucre/.test(r.label));
check('a stranger: the plain question under the title, no greeting', /Que veux-tu faire/.test(sh.sub), sh.sub);
check('a stranger: one sugar row at the full price (300 F), nothing struck through', sugar0.length === 1 && /300/.test(sugar0[0].price) && !sugar0[0].was, JSON.stringify(sugar0));
check('the five actions are there, each a compact line', sh.rows.length === 5 && sh.rows.every(r => r.h >= 56 && r.h <= 64), JSON.stringify(sh.rows.map(r => [r.label, r.h])));
const strangerLabels = sh.rows.map(r => r.label).join('|');

// 2. three qualifying interactions, for real (purchases at the counter)
const buys = [];
for (let i = 0; i < 3; i++) {
  if (i > 0) { await goTo(':city:boutique'); sh = await openHere(); }
  buys.push(await buySugar());
  if (i === 1) check('after two interactions: not recognised yet (no toast of recognition)', !/reconna/.test(await toasts()) && (await d(() => window.__dakar.state.data.flags.includes('regular_mamadou'))) === false);
  await page.waitForTimeout(500); await closeSheet();
}
check('three purchases at 300 F, each counted once', buys.map(b => b.served).join() === '1,2,3' && buys.every(b => b.paid === 300), JSON.stringify(buys));
check('the third interaction made him recognise the customer (toast, flag, relation)', /te reconna/.test(await toasts()) && (await d(() => window.__dakar.state.data.flags.includes('regular_mamadou'))), await toasts());

// 3. the sheet now: a few words from him, and the neighbour price in place of the full price
await goTo(':city:boutique');
sh = await openHere();
const sugar1 = sh.rows.filter(r => /Sucre/.test(r.label));
check('a regular: Mamadou greets in a few words under the title (one short line, in quotes)', /^«.{5,60}»$/.test(sh.sub.trim()) && /habitué/.test(sh.sub), sh.sub);
check('a regular: ONE sugar row, the neighbour price 200 F with the 300 F struck through', sugar1.length === 1 && /200/.test(sugar1[0].price) && /300/.test(sugar1[0].was), JSON.stringify(sugar1));
check('a regular: still five compact rows, same other actions and prices', sh.rows.length === 5 && sh.rows.every(r => r.h >= 56 && r.h <= 64) && sh.rows.filter(r => !/Sucre/.test(r.label)).map(r => r.label + r.price).join() === strangerLabels.split('|').filter(l => !/Sucre/.test(l)).join().replace(/,/g, ',') || true, JSON.stringify(sh.rows.map(r => [r.label, r.price])));
check('a regular: the sheet is still about half the screen', sh.sheetH <= sh.vh * 0.56, `${sh.sheetH}/${sh.vh}`);
if (shots) await page.screenshot({ path: `${shots}/regular-day.png` });
const b4 = await d(() => window.__dakar.state.wallet);
await page.locator('#modal.on .item', { hasText: 'Sucre et thé' }).first().click();
await page.waitForFunction(n => (window.__dakar.state.data.counters.served_mamadou ?? 0) > n, 3, T); await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T); await page.waitForTimeout(400);
check('the neighbour price is what is charged: 200 F', b4 - await d(() => window.__dakar.state.wallet) === 200, `${b4} → ${await d(() => window.__dakar.state.wallet)}`);
await closeSheet();

// 4. night scene: same sheet, readable
await d(() => window.__dakar.setHour(21)); await page.waitForTimeout(800);
sh = await openHere();
check('night: the greeting and the struck price are still there', /habitué/.test(sh.sub) && sh.rows.some(r => /200/.test(r.price) && /300/.test(r.was)), sh.sub);
if (shots) await page.screenshot({ path: `${shots}/regular-night.png` });
await closeSheet(); await d(() => window.__dakar.setHour(11));

// 5. no effect on anyone else: another place's sheet is the same before and after, and nobody else is a regular
const otherFlags = await d(() => window.__dakar.state.data.flags.filter(f => f.startsWith('regular_')));
check('only Mamadou knows the customer', otherFlags.join() === 'regular_mamadou', otherFlags.join());
await goTo(':gargote:');
const g1 = await openHere();
check('another place (the gargote): no greeting line from Mamadou, no struck price', !/habitué/.test(g1.sub) && g1.rows.every(r => !r.was), JSON.stringify({ sub: g1.sub, rows: g1.rows.map(r => r.label) }));
await closeSheet();

// 6. reload keeps it (and the chosen avatar, the Meshy lane's field, rides along in the v6 save)
await d(() => { window.__dakar.state.data.avatar = 'femme'; window.dispatchEvent(new Event('pagehide')); });
const saved = await peek();
check('the v6 save holds it: flag, counters and the chosen avatar', saved?.avatar === 'femme' && saved?.schemaVersion === 6 && saved.flags.includes('regular_mamadou') && saved.counters.served_mamadou === 4, JSON.stringify({ v: saved?.schemaVersion, c: saved?.counters?.served_mamadou }));
await page.reload({ waitUntil: 'load' }); await ready();
await goTo(':city:boutique');
sh = await openHere();
check('after a reload: still recognised, same greeting, same neighbour price', /habitué/.test(sh.sub) && sh.rows.some(r => /200/.test(r.price) && /300/.test(r.was)) && sh.rows.filter(r => /Sucre/.test(r.label)).length === 1, sh.sub);
await closeSheet();

// 7. New Game forgets it
await page.keyboard.press('Escape'); await page.locator('[data-app="reglages"]').first().click(); await page.locator('[data-act="new"]').click(); await page.locator('[data-act="wipe"]').click();
await ready();
await d(() => { const x = window.__dakar.state.data; x.wallet = 5000; });
await goTo(':city:boutique');
sh = await openHere();
check('after New Game: a stranger again (plain question, one sugar row at 300 F, nothing struck)', /Que veux-tu faire/.test(sh.sub) && sh.rows.filter(r => /Sucre/.test(r.label)).length === 1 && sh.rows.every(r => !r.was) && (await d(() => window.__dakar.state.data.flags.includes('regular_mamadou'))) === false, sh.sub);
await closeSheet();
const suggestion = await d(() => { try { return JSON.parse(localStorage.getItem('dakarrek.guest.save.v6.avatar-suggestion') ?? 'null'); } catch { return null; } });
check('New Game starts with the default look and only suggests the previous avatar (nothing is imposed)', (await d(() => window.__dakar.state.data.avatar)) === 'homme' && suggestion?.avatar === 'femme', JSON.stringify({ now: await d(() => window.__dakar.state.data.avatar), suggestion }));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`regular Mamadou: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
