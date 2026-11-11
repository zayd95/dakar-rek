// On foot (release 1.0): the push sets the pace and running never tires. Phone: ONE analog joystick (a light push walks, a strong one runs on its own); desktop: a direction key walks
// for an instant then runs, Shift keeps to a walk. No « Courir » / « Footing » / « Sprint » control and no stamina gauge anywhere; running costs no energy; the wallet stands alone
// until a need is no longer fine. Usage: node scripts/check-stride.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, STICK } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4208/';
const out = process.argv[3] ?? 'docs/screenshots/stride';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 720 }, false]]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play', null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const S = () => d(() => window.__dakar.stride());
  // a long straight street in Pikine, facing along it; tired on purpose (energy 5): running must still work
  await d(() => { const k = window.__dakar; k.teleport('pikine'); k.setHour(9); k.state.data.needs.energie = 5; k.state.data.needs.hygiene = 80; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.pos().mode === 'play', null, T);
  const start = async () => { await d(() => { window.__dakar.place(-42, -66, Math.PI / 2); window.__dakar.lookYaw(Math.PI / 2); }); await page.waitForTimeout(500); };
  /** The steadiest speed reached while `hold` is in force (the game steps at most 0.1 s a frame, so on a slow page it is the speed the body asks for that counts). */
  /** The highest speed reached within `ms`; stops early once it passes `enough` (the page may run at one frame a second on a busy machine: the game steps at most 0.1 s a frame, so game time is what counts, not the clock). */
  const peak = async (ms, enough = Infinity) => { let v = 0; const t0 = Date.now(); while (Date.now() - t0 < ms && v < enough) { v = Math.max(v, (await S()).speed); await page.waitForTimeout(120); } return v; };
  const settle = (fn, ms = 30000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  const ui = await d(() => ({
    gauge: !!document.getElementById('stamina'),
    words: /Courir|Footing|Sprint|Endurance/.test(document.getElementById('ui').innerText),
    runButton: [...document.querySelectorAll('#ui button, #ui [role=button]')].some(b => /Courir|Footing|Sprint/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') ?? ''))),
  }));
  check(`${label}: no run button, no « Footing » / « Sprint », no stamina gauge on the screen`, !ui.gauge && !ui.words && !ui.runButton, JSON.stringify(ui));
  const needs0 = await d(() => ({ ...window.__dakar.state.data.needs }));

  if (touch) {
    const tt = await realTouch(page), jc = await tt.centre('#joy');
    const push = async f => { await tt.move(1, jc.x, jc.y - STICK * f, 4); };
    await start(); await tt.down(1, jc.x, jc.y);
    await push(0.3); await settle(() => window.__dakar.stride().speed > 1.3); const light = await peak(2500), gLight = (await S()).gait;
    check('phone: a light push of the stick walks', light > 0.7 && light < 2.3 && gLight === 'walk', JSON.stringify({ light, gLight }));
    await push(1); const full = await peak(45000, 6.9), sFull = await S();
    check('phone: a strong push runs on its own (no button), tired or not', full > 5.5 && sFull.gait === 'sprint' && sFull.running, JSON.stringify({ full, gait: sFull.gait, energie: 5 }));
    await page.screenshot({ path: `${out}/phone-running.png` });
    await push(0.3); await settle(() => window.__dakar.stride().speed < 2.2); await page.waitForTimeout(800); const back = (await S()).speed;
    check('phone: easing the stick back eases to a walk (no lurch, no stop)', back > 0.6 && back < 2.6, JSON.stringify({ back }));
    await tt.up(1); await settle(() => window.__dakar.stride().speed < 0.3);
    check('phone: letting go stops', (await S()).speed < 0.3, JSON.stringify(await S()));
  } else {
    await start(); await page.keyboard.down('KeyW');
    const first = (await S()).speed; const run = await peak(45000, 6.5), sRun = await S();
    check('desktop: a direction key runs on its own after an instant', run > 5.5 && sRun.gait === 'sprint', JSON.stringify({ first, run, gait: sRun.gait }));
    await page.keyboard.down('ShiftLeft'); await settle(() => window.__dakar.stride().speed < 2.2 && window.__dakar.stride().gait === 'walk'); const walk = await S();
    check('desktop: Shift held keeps to a walk', walk.speed < 2.2 && walk.gait === 'walk', JSON.stringify(walk));
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await settle(() => window.__dakar.stride().speed < 0.3);
    check('desktop: releasing stops', (await S()).speed < 0.3);
    const hint = await d(() => document.getElementById('hint')?.innerText ?? '');
    check('desktop: the key hint says it (« ça court tout seul », Maj to walk)', /court tout seul/.test(hint) && /Maj/.test(hint), hint);
    await page.screenshot({ path: `${out}/desktop.png` });
  }
  const needs1 = await d(() => ({ ...window.__dakar.state.data.needs }));
  check(`${label}: running cost no energy (and the clock alone costs none)`, Math.abs(needs1.energie - needs0.energie) < 0.01, JSON.stringify({ before: needs0.energie, after: needs1.energie }));
  // the wallet stands alone while every need is fine; a ring appears for the one that is not
  const rings = async () => d(() => [...document.querySelectorAll('#stats .ring')].filter(r => getComputedStyle(r).display !== 'none').map(r => r.dataset.need));
  await d(() => { const n = window.__dakar.state.data.needs; n.energie = 90; n.faim = 90; n.hygiene = 90; n.social = 90; n.moral = 90; }); await page.waitForTimeout(1500);
  const fine = await rings();
  await d(() => { window.__dakar.state.data.needs.energie = 20; }); await page.waitForTimeout(1500);
  const tired = await rings();
  check(`${label}: the wallet stands alone while all is fine; the energy ring appears only once energy is low`, fine.length === 0 && tired.includes('energie'), JSON.stringify({ fine, tired }));
  const chip = await d(() => { const c = document.getElementById('streakChip'); return c ? getComputedStyle(c).display : 'missing'; });
  check(`${label}: no « Série 0 j » chip while no run is on`, chip === 'none', chip);
  check(`${label}: no JavaScript error`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}
await browser.close();
console.log(failed ? `${failed}/${total} FAILED` : `${total}/${total} passed`);
process.exit(failed ? 1 : 0);
