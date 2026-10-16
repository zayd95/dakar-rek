// Rooftop restaurants/lounges (Plateau, Corniche, Almadies/Ngor): the stair door, the open-air terrace, the bar, the menu, leaving.
// Usage: node scripts/check-rooftop.mjs [baseUrl] [outDir]   (localhost preview: ?argent= is honoured there)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4447/', out = process.argv[3] ?? 'shots/rooftop';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra); assert.ok(ok, name); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`${base}?debug&touch&argent=50000`, T); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.rooftop, null, T);
  for (const hub of ['plateau', 'corniche', 'almadies']) {
    await d(h => { window.__dakar.setHour(18); window.__dakar.teleport(h); }, hub);
    await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.rooftop.info()?.hub === h, hub, T).catch(() => {});
    const info = await d(() => window.__dakar.rooftop.info());
    check(`${hub}: a rooftop door exists in the facade of a tall building`, !!info, JSON.stringify(info)?.slice(0, 200));
    check(`${hub}: it is a ${info.kind}, neither a gargote nor a maïga`, /rooftop/.test(info.door.id) && !/gargote|maiga/.test(info.door.id) && info.menu.length >= 4);
    // walk up to the door: « Entrer »
    await d(i => window.__dakar.place(i.door.x + i.facade.nx * 0.5, i.door.z + i.facade.nz * 0.5, Math.atan2(-i.facade.nx, -i.facade.nz)), info); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${hub}-door.png` });
    const f = await d(() => window.__dakar.focus());
    check(`${hub}: « Entrer » is offered at the door`, !!f && JSON.stringify(f).includes('Entrer'), JSON.stringify(f).slice(0, 160));
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => window.__dakar.pos().x > 3000, null, T);
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {}); await page.waitForTimeout(1800);
    check(`${hub}: inside the terrace, with seats registered`, (await d(() => window.__dakar.pos().x)) > 3000 && info.seats >= 12, `${info.seats} seats`);
    await page.screenshot({ path: `${out}/${hub}-terrace-follow.png` });
    // the bar offers « Commander »; the menu charges once and feeds
    await d(i => window.__dakar.place(i.bar.x, i.bar.z, Math.PI), info); await page.waitForTimeout(1200);
    const fb = await d(() => window.__dakar.focus());
    check(`${hub}: the bar offers « Commander »`, !!fb && JSON.stringify(fb).includes('Commander'), JSON.stringify(fb).slice(0, 160));
    await d(() => window.__dakar.act()); await page.waitForTimeout(600);
    check(`${hub}: the menu lists the dishes with prices`, await d(() => /−/.test(document.querySelector('#modal.on')?.textContent ?? '')));
    await page.screenshot({ path: `${out}/${hub}-menu.png` });
    const w0 = await d(() => window.__dakar.state.wallet), n0 = await d(() => window.__dakar.state.data.needs.faim);
    await d(() => window.__dakar.state.data.needs.faim = 20);
    await page.locator('#modal.on .item').first().click(); await page.waitForTimeout(500);
    const w1 = await d(() => window.__dakar.state.wallet), n1 = await d(() => window.__dakar.state.data.needs.faim);
    check(`${hub}: ordering pays once and feeds (${w0} → ${w1} F, faim 20 → ${n1})`, w1 === w0 - info.menu[0][1] && n1 > 20);
    // leave
    await d(i => window.__dakar.place(i.door.x * 0 + 3200 + 60 * ['plateau', 'corniche', 'almadies'].indexOf(i.hub) + 5, 4.9, Math.PI), info); await page.waitForTimeout(1000);
    const fo = await d(() => window.__dakar.focus());
    check(`${hub}: the stairs offer to go down`, !!fo && /Descendre|Sortir/.test(JSON.stringify(fo)), JSON.stringify(fo).slice(0, 160));
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => window.__dakar.pos().x < 1000, null, T); await page.waitForTimeout(800);
    const p = await d(() => window.__dakar.pos());
    check(`${hub}: back on the street at the door`, Math.hypot(p.x - info.door.x, p.z - info.door.z) < 2.5, JSON.stringify([p.x, p.z]));
  }
  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
  console.log('rooftop checks passed');
} finally { await browser.close(); }
