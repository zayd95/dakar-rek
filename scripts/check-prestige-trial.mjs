// The trial car of Prestige Auto when it is not bought: handed back, or left behind, and how the dealership gets it back (src/transport/ownedModule.ts watchTrial).
// The trial car is the floor car itself; it never vanishes in front of the player and never appears in its bay in front of them:
//   – handed back (« Rendre la voiture d'essai »): it stays exactly where it was parked, solid, and is no longer offered;
//   – it goes back to its bay only when neither it nor its bay is on screen (and the player is away); nothing was paid, nothing saved;
//   – the bay refills with the same car (same paint), and the car can be tried again.
// Usage: node scripts/check-prestige-trial.mjs [baseUrl] [outDir]   (a running build)
import { chromium } from 'playwright';
import { realTouch, pilot } from './lib/realTouch.mjs';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4214/';
const out = process.argv[3] ?? 'docs/screenshots/prestige';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const t = await realTouch(page);
const d = (fn, arg) => page.evaluate(fn, arg), B = () => d(() => window.__dakar.berline.info()), AT = () => d(() => window.__dakar.berline.at());
const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/trial-${n}.png` }); };
const click = async text => { await page.locator('#modal .item', { hasText: text }).first().click(); };
await d(() => { window.__dakar.teleport('almadies', -94, 14, Math.PI); window.__dakar.setHour(11); window.__dakar.state.data.wallet = 200000000; });
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.sales?.info().here && window.__dakar.berline?.info().floor.length === 2, null, T);

// take the white berline (slot 0) on a trial, through the real prompts
await d(() => window.__dakar.place(-92.6, 19.7, Math.PI));
await page.waitForFunction(() => window.__dakar.focus()?.id === 'berline:floor:0', null, T);
await d(() => window.__dakar.act());
await page.waitForFunction(() => /clés/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T);
await click('Prendre les clés');
const f0 = (await B()).floor[0];
await d(s => window.__dakar.place(s.x, s.z, Math.PI / 2), f0.step);
await page.waitForFunction(() => /Ouvrir/.test(window.__dakar.focus()?.primary ?? ''), null, T);
await d(() => window.__dakar.act());
await page.waitForFunction(() => window.__dakar.berline.info().driving, null, T);
// out through the bay to the forecourt with the real pedals, then out of the car by the real button
await pilot(page, t, 'berline', [{ x: -92.6, z: 12, tol: 1.6, speed: 2.5 }], { brakeAtEnd: true });
await t.tap('#ridepad .rp-off');
await page.waitForFunction(() => window.__dakar.berline.info().exit, null, T);   // the door opens and the player steps out: wait for that to begin, then to end
await page.waitForFunction(() => { const b = window.__dakar.berline.info(); return !b.driving && !b.exit && b.here && window.__dakar.pos().mode === 'play'; }, null, T);
const parked = await AT();
check('left on the forecourt, the trial car stays where it was parked and is the same car the bay lost', (await B()).trial && !(await B()).floor[0].here && (await B()).floor[0].state === 'out' && (await B()).trialSlot === 0, JSON.stringify(parked));
check('nothing was paid or saved', (await d(() => window.__dakar.state.wallet)) === 200000000 && !(await B()).record && !(await B()).owned);
await shot('1-left');

// handed back at the salesperson: it stays put, in plain sight, for as long as it is on screen
await page.waitForFunction(() => { const s = window.__dakar.sales.info(); return s.task === 'meet' && !s.moving; }, null, T);   // he walks over to the customer who left the car
await d(() => window.__dakar.act());
await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
const menu = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
if (/Rendre/.test(menu)) await click('Rendre la voiture');
else { await d(() => document.querySelector('#modal .item.close')?.click()); const s = await d(() => window.__dakar.sales.info()); await d(p => window.__dakar.place(p.x + 1.2, p.z + 0.2, 0), s); await page.waitForFunction(() => window.__dakar.focus()?.id === 'prestige:sales', null, T).catch(async e => { console.log('FOCUS', JSON.stringify(await d(() => ({ focus: window.__dakar.focus(), pos: window.__dakar.pos(), sales: window.__dakar.sales.info(), m: document.querySelector('#modal.on')?.textContent ?? '' }))), menu.slice(0, 200)); throw e; }); await d(() => window.__dakar.act()); await page.waitForSelector('#modal.on', T); await click('Rendre la voiture'); }
await page.waitForFunction(() => window.__dakar.berline.info().returned, null, T);
await page.waitForTimeout(4000);
const still = await B(), at1 = await AT();
check('handed back in view, the car does not vanish and the bay does not refill in front of them', still.returned && still.here && still.trialSlot === 0 && !still.floor[0].here && Math.abs(at1.x - parked.x) < 0.05 && Math.abs(at1.z - parked.z) < 0.05, JSON.stringify({ x: at1.x, z: at1.z, trialSlot: still.trialSlot }));
const prompt = await d(() => window.__dakar.focus());
check('a handed-back car is no longer offered for driving or buying', !prompt || !/Monter|Acheter/.test((prompt.all ?? []).join('|')), JSON.stringify(prompt));
await shot('2-handed-back');

// the player walks off, out of sight (the north end of the back yard, looking away): the dealership takes it back, the bay refills with the same car
await d(() => window.__dakar.place(-86, 50, 0));
await page.waitForFunction(() => window.__dakar.berline.info().trialSlot === -1, null, T);
const back = await B();
check('out of sight, the dealership put it back in its bay: same car, same paint, free to try again; nothing owned', !back.here && !back.trial && back.floor[0].here && back.floor[0].state === 'display' && !back.owned && (await d(() => window.__dakar.state.wallet)) === 200000000, JSON.stringify(back.floor));
await d(() => window.__dakar.place(-92.6, 19.7, Math.PI));
await page.waitForFunction(() => window.__dakar.focus()?.id === 'berline:floor:0' && window.__dakar.focus().primary === 'Essayer cette voiture', null, T);
check('and it can be tried again', true);
await shot('3-back');
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
