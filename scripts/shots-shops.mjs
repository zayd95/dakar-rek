// Shop interiors (src/world/shopKit.ts): every stocked shop of the four hubs seen from its open front and from inside,
// plus a showroom of every type of the kit. Usage: node scripts/shots-shops.mjs [url] [outdir] [desktop|phone]
// (run under `flock /tmp/dakar-browser.lock`).
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:4215/';
const out = process.argv[3] || 'docs/screenshots/shops';
const only = process.argv[4];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.DAKAR_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const report = {};
try {
  for (const [label, viewport, touch, quality] of [['desktop', { width: 1280, height: 720 }, false, 'high'], ['phone', { width: 390, height: 844 }, true, 'low']]) {
    if (only && only !== label) continue;
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(q => localStorage.setItem('dakarrek.quality', q), quality);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?debug${touch ? '&touch' : ''}`);
    await page.waitForFunction(() => window.__dakar?.body(), null, { timeout: 60000 });
    const shots = [];
    for (const hub of ['pikine', 'plateau', 'almadies', 'corniche']) {
      await page.evaluate(h => { window.__dakar.teleport(h); window.__dakar.setHour(11); }, hub);
      await page.waitForTimeout(600);
      const shops = await page.evaluate(() => window.__dakar.shops());
      for (const s of shops) {
        const name = s.key.split(':').pop();
        const b = s.bounds, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = b.z1 - b.z0, w = b.x1 - b.x0;
        // from the street, in front of the open front
        await page.evaluate(([x, z]) => window.__dakar.place(x, z, Math.PI), [cx, b.z1 + 6]);
        await page.evaluate(([p, t]) => window.__dakar.cam(p, t), [[cx + w * 0.15, 3.2, b.z1 + Math.max(6, w * 0.55)], [cx, 1.3, cz - d * 0.2]]);
        await page.waitForTimeout(450);
        const f1 = `${out}/${label}-${hub}-${name}-front.jpg`;
        await page.screenshot({ path: f1, type: 'jpeg', quality: 82 });
        // inside, from the counter's customer side toward the back shelves
        await page.evaluate(([p, t]) => window.__dakar.cam(p, t), [[s.anchors.counter.x + w * 0.22, 2.1, s.anchors.counter.z + 1.2], [cx - w * 0.05, 1.2, b.z0 + 0.5]]);
        await page.waitForTimeout(350);
        const f2 = `${out}/${label}-${hub}-${name}-inside.jpg`;
        await page.screenshot({ path: f2, type: 'jpeg', quality: 82 });
        shots.push({ hub, key: s.key, type: s.type, tris: s.budget.tris, drawCalls: s.budget.drawCalls, front: f1, inside: f2 });
      }
    }
    await page.evaluate(() => window.__dakar.cam(null));
    // the kit's showroom: every type
    const sr = await page.evaluate(q => window.__dakar.shopShowroom({ detail: q }), quality);
    for (const s of sr) {
      await page.evaluate(([p, t]) => window.__dakar.cam(p, t), [[s.x + 1.5, 6.5, s.z + s.d / 2 + 6], [s.x, 0.8, s.z - 0.5]]);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${label}-kit-${s.type}.jpg`, type: 'jpeg', quality: 82 });
    }
    await page.evaluate(() => { window.__dakar.shopClear(); window.__dakar.cam(null); });
    report[label] = { shots, showroom: sr.map(s => ({ type: s.type, w: s.w, d: s.d, ...s.budget })), errors };
    console.log(label, shots.length, 'shop shots,', sr.length, 'kit types,', errors.length, 'errors');
    await ctx.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/shots.json`, JSON.stringify(report, null, 2));
}
