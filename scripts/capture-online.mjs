// Real game captures for visual review. Usage: node scripts/capture-online.mjs <worker-url>
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = process.argv[2];
if (!base) throw new Error('Pass the running Worker URL');
const out = 'shots/public-preview';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(process.env.DAKAR_BROWSER_PROXY ? { proxy: { server: process.env.DAKAR_BROWSER_PROXY } } : {}),
});
const contexts = [], captures = [];
try {
  for (const [name, viewport, touch] of [['Moussa', { width: 1280, height: 720 }, false], ['Awa', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch,
      ignoreHTTPSErrors: process.env.DAKAR_TEST_PROXY_TLS === 'true' });
    contexts.push(ctx);
    await ctx.addInitScript(name => {
      localStorage.setItem('dakarrek.quality', 'medium');
      localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name, look: name === 'Awa' ? 1 : 0 }));
    }, name);
    const page = await ctx.newPage();
    await page.goto(`${base}?debug${touch ? '&touch' : ''}`);
    await page.waitForFunction(() => window.__dakar?.presence().status === 'online' && window.__dakar.wrestlerReady(), null, { timeout: 60000 });
    await page.evaluate(() => { window.__dakar.setHour(16); });
  }
  const [desktop, phone] = contexts.map(c => c.pages()[0]);
  await desktop.evaluate(() => window.__dakar.place(-6, -30, 0));
  await phone.evaluate(() => window.__dakar.place(-3, -26, Math.PI));
  await desktop.waitForFunction(() => window.__dakar.presence().visible >= 1);
  async function capture(page, file, description) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${file}` });
    captures.push({ file, description, quality: 'medium', source: base, capturedAt: new Date().toISOString() });
    console.log(`Captured ${file}`);
  }
  await capture(desktop, 'dakar-rek-pikine-online.png', 'Pikine, two independent players connected');
  await capture(phone, 'dakar-rek-phone-online.png', 'Phone viewport with another connected player');
  for (const page of [desktop, phone]) {
    await page.evaluate(() => window.__dakar.enter('maiga'));
    await page.waitForFunction(() => window.__dakar.pos().x > 900);
  }
  await phone.evaluate(() => { const d = window.__dakar, p = d.pos(); d.place(p.x + 0.8, p.z + 0.5, Math.PI); });
  await desktop.waitForFunction(() => window.__dakar.presence().visible >= 1);
  await capture(desktop, 'dakar-rek-maiga-online.png', 'Shared Maiga interior');
  for (const page of [desktop, phone]) {
    await page.evaluate(() => window.__dakar.exit());
    await page.waitForFunction(() => window.__dakar.pos().x < 900);
  }
  await desktop.evaluate(() => { const d = window.__dakar; d.place(0, -30, 0); d.portrait(2.4, 1.65, 0.1); });
  await capture(desktop, 'dakar-rek-avatar.png', 'Current integrated player model, front view');
  await desktop.evaluate(() => { const d = window.__dakar; d.portrait(0); d.scene('entrance'); d.scenePeek(9); });
  await capture(desktop, 'dakar-rek-arena.png', 'Current arena entrance scene; cultural motions are provisional');
  await fs.writeFile(`${out}/captures.json`, JSON.stringify(captures, null, 2));
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser.close();
}
