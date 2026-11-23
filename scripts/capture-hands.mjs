// Close-ups of the player's hands (playtest of 24 Oct 2026: « unnatural male/female hands and wrists »), both studio bodies, standing and at the wheel
// (the Drive pose), the HUD hidden. One contact sheet per build: run it on the build before and after a change to compare.
// Usage: node scripts/capture-hands.mjs <baseUrl> <outDir> [label]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [base = 'http://localhost:4601/', out = '/tmp/claude-0/ld2/hands', label = 'build'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const shots = [];
try {
  for (const avatar of ['homme', 'femme']) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 420 } });
    await ctx.addInitScript(av => { try { localStorage.setItem('dakarrek.quality', 'high'); localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: 'g-hands-' + av, avatar: av })); } catch { /* */ } }, avatar);
    const page = await ctx.newPage(); page.setDefaultTimeout(300000);
    const d = (fn, a) => page.evaluate(fn, a);
    await page.goto(`${base}?debug&heure=11`, { timeout: 180000 });
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.body?.() && !document.getElementById('studio'), null, { timeout: 300000 });
    await page.waitForTimeout(2000);
    await d(() => { document.getElementById('ui').style.display = 'none'; });
    for (const [clip, cam] of [['Idle', [0.8, 0.95, 1.3]], ['Idle', [0.85, 0.95, 0.5]], ['Drive', [1.0, 0.95, 0.9]], ['Drive', [0.9, 1.05, 0.2]]]) {
      // the clip held, the hands' closure eased in (0.3 s), then a still frame
      await d(([c, cm]) => { const D = window.__dakar; D.pause(true); D.body().hold = c; D.step(1 / 60, 50); D.portrait(cm[0], cm[1], cm[2]); D.step(1 / 60, 2); D.render?.(); }, [clip, cam]);
      await page.waitForTimeout(300);
      const f = `${out}/${label}-${avatar}-${clip}-${shots.length % 4}.png`;
      await page.screenshot({ path: f }); shots.push(f);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(shots.join('\n'));
}
