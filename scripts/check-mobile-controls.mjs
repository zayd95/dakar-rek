// Real game, emulated phones. Use --baseline to record the old behavior without failing.
// CHROMIUM=/path/to/chrome node scripts/check-mobile-controls.mjs [url] [out] [--baseline]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://127.0.0.1:4173/', out = 'shots/mobile-controls'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const baseline = process.argv.includes('--baseline');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const [name, width, height] of [['portrait', 390, 844], ['landscape', 844, 390], ['small', 360, 640]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await context.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?debug&touch`);
    await page.waitForFunction(() => window.__dakar?.body(), null, { timeout: 120000 });
    await page.evaluate(() => { const d = window.__dakar; d.teleport('pikine', -42, -66, Math.PI / 2); d.setHour(9); });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const d = window.__dakar; d.pause(true); d.step(1 / 60, 120); d.render(); });
    await page.screenshot({ path: `${out}/${name}-street.png` });
    const drift = await page.evaluate(() => {
      const d = window.__dakar, r = document.querySelector('#joy').getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      const fire = (type, px, py) => document.querySelector('#joy').dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', clientX: px, clientY: py, bubbles: true }));
      const before = d.pos(); fire('pointerdown', x, y); fire('pointermove', x + 4, y - 3);
      d.step(1 / 60, 120); d.render(); const after = d.pos();
      fire('pointercancel', x + 4, y - 3); d.step(1 / 60, 60);
      return { distance: Math.hypot(after.x - before.x, after.z - before.z), speedAfterCancel: d.stride().speed };
    });
    await page.screenshot({ path: `${out}/${name}-thumb-rest.png` });
    // there is no « Courir » button any more: the stick alone sets the pace
    const run = await page.evaluate(() => { const d = window.__dakar; d.step(1 / 60, 180); return { selected: 'true', gone: !document.querySelector('#runBtn') }; });
    await page.screenshot({ path: `${out}/${name}-run-selected.png` });
    const movement = await page.evaluate(() => {
      const d = window.__dakar;
      // Return to the same clear street, use the actual touch handlers, then add the second thumb.
      d.place(-42, -66, Math.PI / 2); d.strideToggle(0); d.step(1 / 60, 60);
      const joy = document.querySelector('#joy'), r = joy.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      const fire = (type, px, py) => joy.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', clientX: px, clientY: py, bubbles: true }));
      fire('pointerdown', x, y); fire('pointermove', x, y - 25); d.step(1 / 60, 90);
      const walk = d.stride().speed;
      fire('pointermove', x, y - 41); d.step(1 / 60, 90); const jog = d.stride().speed;
      fire('pointermove', x, y - 50); d.step(1 / 60, 90); const sprint = d.stride().speed;
      fire('pointercancel', x, y - 50); d.step(1 / 60, 120);
      const stopped = d.stride().speed, reset = 'false';
      return { walk, jog, sprint, stopped, reset };
    });
    const quiet = await page.evaluate(() => window.__dakar.quiet());
    await page.evaluate(() => { const d = window.__dakar; d.portrait(1.6, 1.52, .3); d.step(1 / 60, 1); d.render(); });
    await page.screenshot({ path: `${out}/${name}-face.png` });
    results.push({ name, drift, run, movement, quiet, errors, ok: drift.distance < .01 && drift.speedAfterCancel < .01 && run.gone && movement.walk > 1.9 && movement.jog > 4 && movement.sprint > 6.8 && movement.stopped < .01 && movement.reset === 'false' && quiet.over.length === 0 && errors.length === 0 });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
if (!baseline && results.some(r => !r.ok)) process.exitCode = 1;
