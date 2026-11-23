// Review shots of the player's chosen body in the game: the street by day (desktop and phone), a close portrait, a walk, the supporter's gear
// (scarf, small flag, cap, tee), on the v4 body for reference. Usage: node scripts/shoot-avatar.mjs [baseUrl] [outDir=docs/meshy/proof/avatar/play]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://localhost:4310/', out = process.argv[3] ?? 'docs/meshy/proof/avatar/play';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const GEAR = [['echarpe', 1], ['drapeau', 3], ['casquette', 2], ['maillot', 4]];   // index in WEAR for baobab: scarf, cap, flag, tee (catalog order)
const files = [];
for (const avatar of ['v4', 'homme', 'femme']) {
  for (const [vp, w, h, touch] of [['desktop', 1280, 720, false], ['phone', 390, 844, true]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const p = await context.newPage(); p.setDefaultTimeout(180000);
    await p.goto(`${base}?debug&avatar=${avatar}${touch ? '&touch' : ''}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
    await p.evaluate(() => { const k = window.__dakar; k.setHour(11); k.teleport('plateau'); });
    await p.waitForTimeout(2500);
    const shot = async name => { await p.waitForTimeout(400); const f = `${out}/${avatar}-${vp}-${name}.png`; await p.screenshot({ path: f }); files.push(f); };
    await shot('street');
    if (vp === 'desktop') {
      await p.evaluate(() => window.__dakar.pause(true));
      await p.keyboard.down('KeyW'); await p.evaluate(() => window.__dakar.step(1 / 60, 100)); await p.evaluate(() => window.__dakar.render()); await shot('walk');
      await p.keyboard.up('KeyW'); await p.evaluate(() => { const k = window.__dakar; k.step(1 / 60, 120); k.portrait(2.0, 1.45, 0.25); k.step(1 / 60, 30); k.render(); }); await shot('portrait');
      await p.evaluate(() => { const k = window.__dakar; k.portrait(3.6, 1.0, 0.2); k.step(1 / 60, 30); k.render(); }); await shot('body');
      // the supporter's gear: owned and worn, one at a time (close, to see the neck and the head)
      await p.evaluate(() => window.__dakar.portrait(2.4, 1.35, 0.3));
      for (const [name, idx] of GEAR) {
        await p.evaluate(([name, idx]) => { const s = window.__dakar.state; const id = `${name}_baobab`; if (!s.data.assets.list.some(a => a.spec === id)) s.data.assets.list.push({ uid: 'g' + idx, spec: id, how: 'owned', since: 0, paid: 0, condition: 100, upgrades: [], leased: false }); s.data.counters.supporter_porte = idx; window.__dakar.step(1 / 60, 20); window.__dakar.render(); }, [name, idx]);
        await shot(`gear-${name}`);
      }
      await p.evaluate(() => { window.__dakar.state.data.counters.supporter_porte = 0; });
    }
    await context.close();
  }
}
await browser.close();
// contact sheets: one per kind of shot, the three bodies side by side
const kinds = [...new Set(files.map(f => f.split('/').pop().replace(/^(v4|homme|femme)-/, '')))];
for (const k of kinds) {
  const imgs = ['v4', 'homme', 'femme'].map(a => `${out}/${a}-${k}`).filter(f => fs.existsSync(f));
  const metas = await Promise.all(imgs.map(f => sharp(f).metadata()));
  const H = Math.max(...metas.map(m => m.height)); let x = 0; const comp = [];
  for (const [i, f] of imgs.entries()) { comp.push({ input: f, left: x, top: 0 }); x += metas[i].width + 6; }
  await sharp({ create: { width: x - 6, height: H, channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 85 }).toFile(`${out}/sheet-${k.replace('.png', '')}.jpg`);
}
console.log(kinds.join(' '));
