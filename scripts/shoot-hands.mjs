// Close-ups of the player's hands in the game: idle, walk, run, stop and riding the motorbike, from the front, the side and up close, for
// the three bodies (v4 as the reference). Usage: node scripts/shoot-hands.mjs [baseUrl=http://localhost:4310/] [outDir=docs/meshy/proof/hands/<label>] [label]
// Writes one contact sheet per body and one per moment (JPEG); the single frames are kept only with KEEP=1.
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://localhost:4310/';
const label = process.argv[4] ?? 'now';
const out = process.argv[3] ?? `docs/meshy/proof/hands/${label}`;
const tmp = `${out}/frames`;
fs.mkdirSync(tmp, { recursive: true });
const MOMENTS = process.env.MOMENTS ? process.env.MOMENTS.split(',') : null;
const AV = (process.env.AVATARS ?? 'v4,homme,femme').split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const W = 640, H = 520;
const frames = [];                                   // { avatar, moment, view, file }
for (const avatar of AV) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await context.newPage(); p.setDefaultTimeout(180000);
  await p.goto(`${base}?debug&avatar=${avatar}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
  await p.evaluate(h => { const k = window.__dakar; k.teleport('pikine'); k.setHour(h); k.state.data.wallet = 400000; }, +(process.env.HOUR ?? 10));
  await p.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.moto.info().dealer, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const shoot = async (moment, views = ['front', 'hand', 'handFront', 'handTop']) => {
    if (MOMENTS && !MOMENTS.some(m => moment.startsWith(m))) return;
    await p.addStyleTag({ content: 'body *{visibility:hidden!important} #c{visibility:visible!important}' }).then(h => p.evaluate(() => { document.querySelectorAll('style').forEach(s => { if (/visibility:hidden!important/.test(s.textContent)) s.dataset.shoot = '1'; }); }));
    for (const view of views) {
      await p.evaluate(view => {
        const k = window.__dakar, b = k.body(), g = b.group; g.updateMatrixWorld(true);
        const at = n => { const o = g.getObjectByName(n); const v = new g.position.constructor(); o.getWorldPosition(v); return v; };
        const pos = g.position, f = g.rotation.y, fw = [Math.sin(f), Math.cos(f)], rt = [Math.cos(f), -Math.sin(f)];
        let c, t;
        if (view === 'front') { c = [pos.x + fw[0] * 2.0 + rt[0] * 0.5, pos.y + 1.0, pos.z + fw[1] * 2.0 + rt[1] * 0.5]; t = [pos.x, pos.y + 0.85, pos.z]; }
        else if (view === 'side') { c = [pos.x + rt[0] * 2.0 + fw[0] * 0.2, pos.y + 1.0, pos.z + rt[1] * 2.0 + fw[1] * 0.2]; t = [pos.x, pos.y + 0.85, pos.z]; }
        else {
          const h = at('handL'), d = view === 'hand' ? [0.12, 0.3, 0.1, -0.05] : view === 'handFront' ? [0.45, 0.12, 0.08, -0.03] : [-0.05, 0.02, 0.45, -0.02];   // [forward, outward, up, aim down]
          c = [h.x + rt[0] * d[1] + fw[0] * d[0], h.y + d[2], h.z + rt[1] * d[1] + fw[1] * d[0]]; t = [h.x, h.y + d[3], h.z];
        }
        k.cam(c, t); k.render();
      }, view);
      const file = `${tmp}/${avatar}-${moment}-${view}.png`;
      await p.screenshot({ path: file }); frames.push({ avatar, moment, view, file });
    }
    await p.evaluate(() => { window.__dakar.cam(null); document.querySelectorAll('style[data-shoot]').forEach(s => s.remove()); });
  };
  const step = n => p.evaluate(n => window.__dakar.step(1 / 60, n), n);
  await p.evaluate(() => window.__dakar.pause(true));
  await step(120); await shoot('idle');
  await p.keyboard.down('KeyW'); await step(100); await shoot('walk'); await step(9); await shoot('walk2', ['hand', 'handFront']);
  await p.keyboard.down('ShiftLeft'); await step(130); await shoot('run'); await step(7); await shoot('run2', ['hand', 'handFront']);
  await p.keyboard.up('ShiftLeft'); await p.keyboard.up('KeyW'); await step(6); await shoot('stop'); await step(60); await shoot('rest', ['hand', 'handFront']);
  // the motorbike: bought at the dealer corner of Pikine, then ridden
  if (MOMENTS && !MOMENTS.includes('ride')) { await context.close(); continue; }
  await p.evaluate(() => window.__dakar.pause(false));
  const dealer = await p.evaluate(() => window.__dakar.moto.info().dealer);
  await p.evaluate(d => window.__dakar.place(d.x, d.z + 1.3, Math.PI), dealer.counter ?? dealer);
  await p.waitForFunction(() => /Motos/.test(window.__dakar.focus()?.name ?? ''), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => window.__dakar.act());
  await p.waitForFunction(() => document.querySelector('#modal.on'), null, { timeout: 30000 });
  await p.locator('#modal .item', { hasText: 'Jakarta' }).first().click();
  await p.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, { timeout: 30000 });
  await p.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
  await p.waitForFunction(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here, null, { timeout: 60000 });
  const rec = await p.evaluate(() => window.__dakar.moto.info().record);
  await p.evaluate(r => window.__dakar.place(r.x + 1.2, r.z, -Math.PI / 2), rec);
  await p.waitForFunction(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, { timeout: 30000 });
  await p.evaluate(() => window.__dakar.act());
  await p.waitForFunction(() => window.__dakar.moto.info().driving && window.__dakar.clip() === 'Ride', null, { timeout: 60000 });
  await p.evaluate(() => window.__dakar.pause(true));
  await step(90); await shoot('ride-still');
  await p.keyboard.down('KeyW'); await step(150); await shoot('ride-moving');
  await p.keyboard.up('KeyW');
  await context.close();
}
await browser.close();
// contact sheets: one per moment (rows: bodies, columns: views) so that the three bodies compare at a glance
const moments = [...new Set(frames.map(f => f.moment))];
for (const m of moments) {
  const rows = AV.map(a => frames.filter(f => f.avatar === a && f.moment === m));
  const cols = Math.max(...rows.map(r => r.length)), comp = [];
  rows.forEach((r, ri) => r.forEach((f, ci) => comp.push({ input: f.file, left: ci * (W + 4), top: ri * (H + 4) })));
  await sharp({ create: { width: cols * (W + 4), height: AV.length * (H + 4), channels: 3, background: '#111' } }).composite(comp).jpeg({ quality: 80 }).toFile(`${out}/sheet-${m}.jpg`);
}
if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true });
console.log(moments.join(' '));
