// On foot, always free: a normal walk (2 m/s) by default, jog with Shift held (desktop) or « Courir » (phone), sprint with a
// double-tapped Shift or « Courir » pressed again; the stamina gauge says « Footing » / « Sprint »; the sprint gives out into a
// jog, then a walk; fitness from distance jogged and sprinted. Usage: node scripts/check-stride.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4208/';
const out = process.argv[3] ?? 'docs/screenshots/stride';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await (await browser.newContext({ viewport, hasTouch: touch, isMobile: touch })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const S = () => d(() => window.__dakar.stride());
  // a long straight street in Pikine, facing along it
  await d(() => { const k = window.__dakar; k.teleport('pikine'); k.setHour(9); k.state.data.needs.energie = 90; k.state.data.wallet = 1234; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await d(() => { window.__dakar.place(-42, -66, Math.PI / 2); window.__dakar.lookYaw(Math.PI / 2); });
  await page.waitForTimeout(600);

  // the normal walk by default
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__dakar.stride().speed > 1.9, null, T).catch(() => {});
  const brisk = await S();
  check(`${label}: holding forward walks at 2 m/s (free)`, brisk.speed > 1.9 && brisk.speed < 2.2 && !brisk.running, JSON.stringify(brisk));
  // jog: Shift held / « Courir » once
  if (touch) await page.locator('#runBtn').dispatchEvent('pointerdown'); else await page.keyboard.down('ShiftLeft');
  await page.waitForFunction(() => window.__dakar.stride().speed > 3.9, null, T).catch(() => {});
  const jog = await S();
  const gauge = await d(() => document.getElementById('stamina').classList.contains('on'));
  const word = await d(() => document.querySelector('#stamina span').textContent);
  check(`${label}: ${touch ? '« Courir »' : 'Shift'} jogs at 4.2 m/s, the gauge says « Footing »`, jog.gait === 'jog' && jog.speed > 3.9 && jog.speed < 4.5 && gauge && word === 'Footing', JSON.stringify({ jog, word }));
  // sprint: a double-tapped Shift, held / « Courir » pressed again
  if (touch) await page.locator('#runBtn').dispatchEvent('pointerdown');
  else { await page.keyboard.up('ShiftLeft'); await page.keyboard.down('ShiftLeft'); await page.keyboard.up('ShiftLeft'); await page.keyboard.down('ShiftLeft'); }
  await page.waitForFunction(() => window.__dakar.stride().speed > 6.2, null, T).catch(() => {});
  const run = await S();
  const word2 = await d(() => document.querySelector('#stamina span').textContent);
  check(`${label}: ${touch ? 'pressing « Courir » again' : 'a double-tapped Shift'} sprints, the gauge says « Sprint »`, run.sprinting && run.speed > 6.2 && word2 === 'Sprint', JSON.stringify({ run, word2 }));
  await page.screenshot({ path: `${out}/${label}-running.png` });
  // out of breath: the sprint gives out into a jog (a reserve), then a walk
  await page.waitForFunction(() => window.__dakar.stride().winded, null, { timeout: 600000 }).catch(() => {});
  await page.waitForFunction(() => !window.__dakar.stride().sprinting && window.__dakar.stride().speed < 4.8, null, T).catch(() => {});
  const tired = await S();
  check(`${label}: out of breath, the sprint falls back (to a jog, then a walk)`, tired.winded && !tired.sprinting && tired.speed < 4.8, JSON.stringify(tired));
  if (!touch) await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => !window.__dakar.stride().winded, null, { timeout: 300000 }).catch(() => {});
  const rested = await S();
  const st = await d(() => ({ wallet: window.__dakar.state.wallet, forme: window.__dakar.state.data.counters.forme ?? 0, course: window.__dakar.state.data.counters.course_m ?? 0 }));
  check(`${label}: breath comes back standing still; running cost nothing and counted the distance`, !rested.winded && st.wallet === 1234 && st.course > 20, JSON.stringify({ rested, st }));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await page.context().close();                       // this view's page stops rendering before the next one boots
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} stride checks passed`);
process.exit(failed ? 1 : 0);
