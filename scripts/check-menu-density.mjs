// Targeted check of the compact place menu (Boutique Diallo, Pikine) on a phone, by day and by night (docs/UI-PRIMITIVES.md):
// one-line rows of 56–64 px, no featured card or inline buy button, a sheet of about half the screen that scrolls inside, the
// gold star only on the action of the current objective (derived from the game's own objective state), every action and price kept,
// and a disabled row still answers with its reason. Usage: node scripts/check-menu-density.mjs [baseUrl] [shotsDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:4312/', shots = process.argv[3] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const T = { timeout: 180000 };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const read = () => document.querySelector('#modal.on') && ({
  rows: [...document.querySelectorAll('#modal.on .item:not(.close)')].map(e => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(e.getBoundingClientRect().height), star: !!e.querySelector('.ui-star'), dis: e.classList.contains('dis'), line: e.classList.contains('ui-line') })),
  sheetH: Math.round(document.querySelector('#modal.on .sheet').getBoundingClientRect().height), vh: innerHeight,
  featured: document.querySelectorAll('#modal.on .ui-feature, #modal.on .ui-btn').length, buy: /Acheter/.test(document.querySelector('#modal.on').innerText),
  scrolls: (() => { const l = document.querySelector('#modal.on .list'); return l ? getComputedStyle(l).overflowY : ''; })(),
});
async function open(page) {
  await page.evaluate(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T);
  await page.waitForTimeout(900);
  return page.evaluate(read);
}
for (const [scene, hour] of [['day', 11], ['night', 22]]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await page.evaluate(h => { window.__dakar.teleport('pikine'); window.__dakar.setHour(h); }, hour);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(2000);
  const it = await page.evaluate(() => { const t = window.__dakar.interactables().find(i => i.id.startsWith('pikine:') && i.id.includes(':city:boutique')); return t ? { id: t.id, x: t.x, z: t.z } : null; });
  ok(!!it, `${scene}: the boutique exists`);
  await page.evaluate(k => window.__dakar.place(k.x, k.z + 1.5, Math.PI), it);
  await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, it.id, T).catch(() => {});
  // 1. objective « first Tiak delivery » active: the Tiak row (and only it) carries the star
  await page.evaluate(() => { const d = window.__dakar.state.data; d.counters.livraisons = 0; d.playedMs = 30 * 60_000; d.wallet = 5000; d.needs.energie = 80; });
  let m = await open(page);
  console.log(scene, JSON.stringify(m.rows.map(r => `${r.h}px${r.star ? ' ★' : ''} ${r.text}`)), `sheet ${m.sheetH}/${m.vh}`);
  ok(m.rows.length >= 4, `${scene}: the actions are all listed (${m.rows.length})`);
  ok(m.rows.every(r => r.line), `${scene}: every row is a compact one-line row`);
  ok(m.rows.every(r => r.h >= 56 && r.h <= 64), `${scene}: rows are 56–64 px (${m.rows.map(r => r.h)})`);
  ok(m.featured === 0 && !m.buy, `${scene}: no featured card, no inline Buy button`);
  ok(m.sheetH <= m.vh * 0.56, `${scene}: the sheet takes about half the screen (${m.sheetH}/${m.vh})`);
  const stars = m.rows.filter(r => r.star);
  ok(stars.length === 1 && /Tiak/.test(stars[0].text), `${scene}: exactly the Tiak row has the star while the objective is the first delivery (${stars.map(s => s.text)})`);
  ok(m.rows.some(r => /400 F/.test(r.text)) && m.rows.some(r => /\+1 500 F/.test(r.text)), `${scene}: prices are kept`);
  ok(m.rows.every(r => !/Objectif|Buy|Acheter/.test(r.text)), `${scene}: no paragraph in the rows`);
  const star = await page.evaluate(() => { const s = document.querySelector('#modal.on .ui-star'); const r = s?.getBoundingClientRect(); return s ? { w: Math.round(r.width), color: getComputedStyle(s).color, label: s.getAttribute('aria-label') } : null; });
  ok(!!star && star.w >= 16 && star.label === 'Objectif en cours', `${scene}: the star is visible and labelled (${JSON.stringify(star)})`);
  if (shots) await page.screenshot({ path: `${shots}/${scene}-objective.png` });
  // 2. objective done (a delivery made): ordinary rows only, no star anywhere
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.evaluate(() => { window.__dakar.state.data.counters.livraisons = 3; });
  m = await open(page);
  ok(m.rows.every(r => !r.star), `${scene}: no star once the objective is done (${m.rows.filter(r => r.star).map(r => r.text)})`);
  if (shots) await page.screenshot({ path: `${shots}/${scene}-ordinary.png` });
  // 3. a disabled row keeps its reason (toast) when tapped
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.evaluate(() => { const d = window.__dakar.state.data; d.wallet = 100; d.needs.energie = 5; });
  m = await open(page);
  const dis = m.rows.filter(r => r.dis);
  ok(dis.length >= 1, `${scene}: unaffordable / tired rows are dimmed (${dis.length})`);
  if (dis.length) {
    await page.locator('#modal.on .item.dis').first().tap({ force: true });
    await page.waitForTimeout(400);
    const toast = await page.evaluate(() => [...document.querySelectorAll('#toast, .toast')].map(e => e.innerText).join(' ').trim());
    ok(toast.length > 3 && !!(await page.evaluate(() => document.querySelector('#modal.on'))), `${scene}: tapping a disabled row explains why and keeps the menu (${toast.slice(0, 50)})`);
    if (shots) await page.screenshot({ path: `${shots}/${scene}-disabled.png` });
  }
  ok(errors.length === 0, `${scene}: no page errors ${errors.slice(0, 1)}`);
  await context.close();
}
await browser.close();
console.log(`menu density: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
