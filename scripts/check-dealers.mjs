// Dealers discoverable across districts (phone Carte › « Concessionnaires », src/ui/phone.ts dealersHtml; main.ts marks a place of another district and keeps it): from the Plateau the
// Carte lists all four dealers with their district, price and « essai gratuit »; the one in this district is marked in place, the others offer « Y aller » (on foot, free) which walks to
// that district with the marker kept; on arrival the marker and the goal line show the way to the dealer; the marker can be removed. Phone portrait, real taps.
// Usage: node scripts/check-dealers.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4213/', out = process.argv[3] ?? 'docs/screenshots/dealers';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg), tr = await realTouch(page);
await page.goto(`${base}?debug&touch&heure=11`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
await d(() => window.__dakar.teleport('plateau'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.minimap().on, null, T);
await page.waitForTimeout(1500);
const openCarte = async () => { await tr.tap('#minimap'); await page.waitForFunction(() => window.__dakar.phoneInfo().open && window.__dakar.phoneInfo().screen === 'carte', null, T); await page.waitForTimeout(600); };
await openCarte();
const rows = await d(() => [...document.querySelectorAll('.ph-dealers .ph-dealer')].map(r => ({ text: r.querySelector('span')?.textContent ?? '', btn: r.querySelector('button')?.textContent ?? '', on: r.classList.contains('on') })));
check('from the Plateau the Carte lists the four dealers, each « essai gratuit »', rows.length === 4 && ['Garage Modou', 'Ndiaye Auto', 'Prestige Auto · Berlines', 'Prestige Auto · 4 × 4'].every(n => rows.some(r => r.text.includes(n))) && rows.every(r => /essai gratuit/.test(r.text)), JSON.stringify(rows.map(r => r.text.slice(0, 70))));
const ndiaye = rows.find(r => r.text.includes('Ndiaye')), prestige = rows.find(r => r.text.includes('Berlines'));
check('the dealer of this district is marked in place; the others offer « Y aller » on foot, free, with the time', ndiaye.btn === 'Marquer' && /Y aller · ≈ \d+ min · gratuit/.test(prestige.btn), JSON.stringify({ ndiaye: ndiaye.btn, prestige: prestige.btn }));
await page.locator('.ph-dealers').scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: `${out}/1-carte-dealers.png` });
// mark the one here
await page.locator('.ph-dealer', { hasText: 'Ndiaye Auto' }).locator('button').tap();
await page.waitForTimeout(500);
check('« Marquer » sets the marker on Ndiaye Auto (the button turns to « Retirer le repère »)', (await d(() => window.__dakar.destination())) === 'car:dealer' && /Retirer/.test(await page.locator('.ph-dealer', { hasText: 'Ndiaye Auto' }).locator('button').textContent()), String(await d(() => window.__dakar.destination())));
await page.locator('.ph-dealer', { hasText: 'Ndiaye Auto' }).locator('button').tap();
await page.waitForTimeout(400);
check('and removes it again', (await d(() => window.__dakar.destination())) === null);
// walk to Almadies for the Prestige berlines: the marker is kept across the trip
await page.locator('.ph-dealer', { hasText: 'Prestige Auto · Berlines' }).locator('button').tap();
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(2500);
const goal = await d(() => document.querySelector('#goal')?.textContent ?? '');
check('after the walk to Almadies the marker is on Prestige Auto and the goal line shows the way (name, distance)', (await d(() => window.__dakar.destination())) === 'berline:dealer' && /Prestige Auto/.test(goal) && /\d+ m/.test(goal), JSON.stringify({ dest: await d(() => window.__dakar.destination()), goal }));
await page.screenshot({ path: `${out}/2-almadies-guide.png` });
// the minimap names it too; walking up to the dealer clears the marker with « Te voilà »
const ev = await d(() => window.__dakar.berline.info().dealer);
await d(p => window.__dakar.place(p.x, p.z + 1.2, 0), ev);
await page.waitForFunction(() => window.__dakar.destination() === null, null, T).catch(() => {});
check('arriving at the dealer clears the marker', (await d(() => window.__dakar.destination())) === null, JSON.stringify(ev));
// the other direction: from Almadies, Ndiaye Auto (Plateau) is « Y aller » and the marker waits during the trip, then shows on arrival
await tr.tap('#minimap'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T); await page.waitForTimeout(600);
await page.locator('.ph-dealer', { hasText: 'Ndiaye Auto' }).locator('button').tap();
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(2000);
check('and from Almadies to Ndiaye Auto in the Plateau', (await d(() => window.__dakar.destination())) === 'car:dealer' && /Ndiaye Auto/.test(await d(() => document.querySelector('#goal')?.textContent ?? '')), String(await d(() => window.__dakar.destination())));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
