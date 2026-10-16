// Inspect V4's actual face at the same camera/pose on the pinned baseline and candidate.
// CHROMIUM=/path/to/chrome node scripts/shots-eyes.mjs [url] [out]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://127.0.0.1:4173/', out = 'shots/eyes'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const [name, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await context.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?debug&touch`);
    await page.waitForFunction(() => window.__dakar?.body(), null, { timeout: 120000 });
    await page.evaluate(() => { const d = window.__dakar; d.teleport('pikine', -42, -66, Math.PI / 2); d.setHour(9); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const d = window.__dakar; d.pause(true); d.body().setLook({ skin: 0x7a4a2c, style: 'tee', top: 0xf2f2ec, bottom: 0x2b2b33, shoes: 0x3a2a1e, hair: 'short' }); d.step(1 / 60, 120); });
    for (const [view, side] of [['front', .0], ['quarter', .4], ['profile', 1.2]]) {
      await page.evaluate(side => { const d = window.__dakar; d.portrait(1.35, 1.53, side); d.step(1 / 60, 1); d.render(); }, side);
      await page.screenshot({ path: `${out}/${name}-${view}.png` });
    }
    await page.evaluate(() => { const d = window.__dakar; d.portrait(.85, 1.65, .4); d.step(1 / 60, 1); d.render(); });
    await page.screenshot({ path: `${out}/${name}-close.png` });
    await page.evaluate(() => { const d = window.__dakar; const b = d.body(); b.setLook({ skin: 0x8a5a3a, style: 'dress', top: 0xb64776, female: true, hair: 'puff', hat: 'headwrap', hatColor: 0xe9bd4d }); d.portrait(1.35, 1.53, .4); d.step(1 / 60, 1); d.render(); });
    await page.screenshot({ path: `${out}/${name}-headwrap.png` });
    const metrics = await page.evaluate(() => {
      const d = window.__dakar, b = d.body(), head = b.group.getObjectByName('DR_Head');
      const bounds = {};
      // Humanoid replaces GLTF materials at runtime; the exported primitive names stay stable.
      for (const m of head.children) if (m.isMesh && ['Head001_1', 'Head001_2'].includes(m.name)) {
        m.geometry.computeBoundingBox(); const r = m.geometry.boundingBox;
        bounds[m.name === 'Head001_1' ? 'EyeWhite' : 'Iris'] = { min: r.min.toArray(), max: r.max.toArray(), vertices: m.geometry.attributes.position.count };
      }
      return { bounds, calls: d.three.renderer.info.render.calls, quiet: d.quiet().over };
    });
    results.push({ name, metrics, errors }); console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
if (results.some(r => r.errors.length || r.metrics.quiet.length)) process.exitCode = 1;
