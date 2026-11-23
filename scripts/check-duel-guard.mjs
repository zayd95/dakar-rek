// A held guard is released when the window loses focus: the key-up never arrives (alt-tab, another app), so the guard
// used to stay on until the key was pressed again. Usage: npx vite preview --port 4264, then node scripts/check-duel-guard.mjs [baseUrl]
// Chromium + SwiftShader (CPU rendering).
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4264/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
let fails = 0; const check = (n, ok, x = '') => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n, x); };
const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug`); await page.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 120000 });
await page.evaluate(() => window.__dakar.duelStart('amical', 'costaud')); await page.waitForTimeout(2500);
const on = () => page.evaluate(() => document.querySelector('[data-k=guard]')?.classList.contains('on'));
const key = (type, code) => page.evaluate(([t, c]) => window.dispatchEvent(new KeyboardEvent(t, { code: c })), [type, code]);
check('no guard at the start', (await on()) === false);
await key('keydown', 'KeyG'); check('G held: guard on', (await on()) === true);
await page.evaluate(() => window.dispatchEvent(new Event('blur'))); check('window blur releases the guard', (await on()) === false);
await key('keyup', 'KeyG'); check('a late key-up changes nothing', (await on()) === false);
await key('keydown', 'ShiftLeft'); check('Shift held: guard on again', (await on()) === true);
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
check('page hidden releases the guard', (await on()) === false);
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close(); console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0);
