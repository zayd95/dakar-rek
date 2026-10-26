// Rooftop restaurants/lounges: the authored Almadies hospitality frontage, plus the existing Plateau/Corniche facade placements; then terrace, bar, menu and leaving.
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
    const location = hub === 'almadies' ? 'dedicated hospitality frontage' : 'facade of a tall building';
    const authoredAlmadiesSite = hub !== 'almadies' || (Math.abs(info.door.x + 30) < 0.1 && Math.abs(info.door.z + 105.1) < 0.1);
    check(`${hub}: a rooftop door exists at the ${location}`, !!info && authoredAlmadiesSite, JSON.stringify(info)?.slice(0, 200));
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
    const w0 = await d(() => window.__dakar.state.wallet), t0 = await d(() => window.__dakar.state.data.counters.terrasse ?? 0);
    await d(() => window.__dakar.state.data.needs.faim = 20);
    await page.locator('#modal.on .item').first().click();
    // the order is a real activity: paid once at the start, prepared, then the guest walks to a table, sits, and eats at the table
    await page.waitForFunction(() => window.__dakar.activity()?.id, null, T);
    const w1 = await d(() => window.__dakar.state.wallet);
    check(`${hub}: ordering pays once at the start (${w0} → ${w1} F)`, w1 === w0 - info.menu[0][1]);
    check(`${hub}: not fed yet while it is prepared`, (await d(() => window.__dakar.state.data.needs.faim)) <= 21);
    await page.waitForFunction(() => /mange|bois/i.test(window.__dakar.activity()?.step ?? ''), null, T);
    const seat = await d(() => { const s = window.__dakar.pos(); return { x: s.x, z: s.z }; });
    const meal = await page.waitForFunction(() => window.__dakar.meal(), null, T).then(h => h.jsonValue());
    check(`${hub}: seated at a table with the plate on it (a table top, within reach of the seat)`, meal.y >= 0.45 && Math.hypot(meal.x - seat.x, meal.z - seat.z) < 1.6, JSON.stringify([seat, meal]));
    await page.screenshot({ path: `${out}/${hub}-eating.png` });
    await page.waitForFunction(() => !window.__dakar.activity(), null, T);
    const n1 = await d(() => window.__dakar.state.data.needs.faim), w2 = await d(() => window.__dakar.state.wallet);
    check(`${hub}: the meal feeds (faim 20 → ${n1}) and was not charged twice (${w2} F)`, n1 > 20 && w2 === w1);
    check(`${hub}: the terrace meal is counted once`, (await d(() => window.__dakar.state.data.counters.terrasse ?? 0)) === t0 + 1);
    // finishing: « Se lever » from the table
    const fs = await d(() => window.__dakar.focus());
    check(`${hub}: the table offers « Se lever »`, !!fs && JSON.stringify(fs).includes('Se lever'), JSON.stringify(fs)?.slice(0, 160));
    await d(() => window.__dakar.act()); await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T); await page.waitForTimeout(700);
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
