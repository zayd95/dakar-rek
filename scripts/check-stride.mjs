// On foot, always free. Desktop: a normal walk (2 m/s) by default, jog with Shift held, sprint with a double-tapped Shift. Phone: ONE analog joystick, the push sets the speed along a
// smooth curve (a light push a slow walk, a moderate one the normal walk, a strong one a jog, the stick fully out for a moment a sprint), no Footing / Sprint buttons. The stamina gauge says
// « Footing » / « Sprint »; the sprint gives out into a jog, then a walk; fitness from distance jogged and sprinted. Usage: node scripts/check-stride.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, STICK } from './lib/realTouch.mjs';

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

  // the real fingers on the phone (the stick pushed up by a fraction of its radius); the keys on the desktop
  const tt = touch ? await realTouch(page) : null, jc = touch ? await tt.centre('#joy') : null;
  const push = async frac => { if (frac === null) await tt.up(2); else if (!pushed) { await tt.down(2, jc.x, jc.y); await tt.move(2, jc.x, jc.y - STICK * frac); pushed = true; } else await tt.move(2, jc.x, jc.y - STICK * frac); };
  let pushed = false;
  if (touch) {
    // analog walking: a series of pushes, the speed follows (slow walk < normal walk < jog), continuous, and the gauge stays quiet while it is only a walk
    const speeds = [];
    for (const frac of [0.12, 0.3, 0.5, 0.62]) {
      await push(frac); await page.waitForTimeout(2500);
      await page.waitForFunction(() => { const s = window.__dakar.stride(); return s.speed > 0.2; }, null, T).catch(() => {});
      speeds.push(+(await S()).speed.toFixed(2));
    }
    check(`phone: a light push walks slowly, a stronger one faster, along a smooth curve (${speeds.join(' → ')} m/s)`, speeds[0] > 0.3 && speeds[0] < 1.6 && speeds.every((v, i) => i === 0 || v > speeds[i - 1] - 0.05) && speeds[3] > 1.8 && speeds[3] < 2.6, JSON.stringify(speeds));
    check('phone: the walk is not a jog: the gauge says nothing and no gait switch happened', !(await S()).running);
    await push(null); pushed = false; await page.waitForTimeout(800);
    await d(() => { window.__dakar.place(-42, -66, Math.PI / 2); window.__dakar.lookYaw(Math.PI / 2); });
    await page.waitForTimeout(400);
    check('phone: there is no « Courir » button and no Footing / Sprint button', (await d(() => !document.getElementById('runBtn') && !document.querySelector('#runBtn small'))));
    await push(0.3); await page.waitForTimeout(500);
  } else await page.keyboard.down('KeyW');
  if (!touch) {
  await page.waitForFunction(() => window.__dakar.stride().speed > 1.9, null, T).catch(() => {});
  const brisk = await S();
  check(`${label}: holding forward walks at 2 m/s (free)`, brisk.speed > 1.9 && brisk.speed < 2.2 && !brisk.running, JSON.stringify(brisk));
  }
  // jog: Shift held on the desktop; a strong push on the phone
  if (touch) await push(0.82); else await page.keyboard.down('ShiftLeft');
  await page.waitForFunction(() => window.__dakar.stride().speed > 3.9, null, T).catch(() => {});
  const jog = await S();
  const gauge = await d(() => document.getElementById('stamina').classList.contains('on'));
  const word = await d(() => document.querySelector('#stamina span').textContent);
  check(`${label}: ${touch ? 'a strong push' : 'Shift'} jogs at about 4.2 m/s, the gauge says « Footing »`, jog.gait === 'jog' && jog.speed > 3.9 && jog.speed < 4.5 && gauge && word === 'Footing', JSON.stringify({ jog, word }));
  // sprint: a double-tapped Shift, held / the stick fully out for a moment
  if (touch) await push(1);
  else { await page.keyboard.up('ShiftLeft'); await page.keyboard.down('ShiftLeft'); await page.keyboard.up('ShiftLeft'); await page.keyboard.down('ShiftLeft'); }
  await page.waitForFunction(() => window.__dakar.stride().speed > 6.2, null, T).catch(() => {});
  const run = await S();
  const word2 = await d(() => document.querySelector('#stamina span').textContent);
  check(`${label}: ${touch ? 'the stick fully out' : 'a double-tapped Shift'} sprints, the gauge says « Sprint »`, run.sprinting && run.speed > 6.2 && word2 === 'Sprint', JSON.stringify({ run, word2 }));
  await page.screenshot({ path: `${out}/${label}-running.png` });
  // out of breath: the sprint gives out into a jog (a reserve), then a walk
  await page.waitForFunction(() => window.__dakar.stride().winded, null, { timeout: 600000 }).catch(() => {});
  await page.waitForFunction(() => !window.__dakar.stride().sprinting && window.__dakar.stride().speed < 4.8, null, T).catch(() => {});
  const tired = await S();
  check(`${label}: out of breath, the sprint falls back (to a jog, then a walk)`, tired.winded && !tired.sprinting && tired.speed < 4.8, JSON.stringify(tired));
  if (!touch) await page.keyboard.up('ShiftLeft');
  if (touch) { await push(null); pushed = false; } else await page.keyboard.up('KeyW');
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
