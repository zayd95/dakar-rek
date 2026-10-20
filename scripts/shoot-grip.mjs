// The rider's hands on the motorbike's handlebar, close up: both hands, each from the front, the outside, above and behind, for each body, in the game.
// Usage: AVATARS=homme,femme node scripts/shoot-grip.mjs [baseUrl] [outDir=docs/meshy/proof/grip]   (writes one contact sheet per body; KEEP=1 keeps the frames)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
const base = process.argv[2] ?? 'http://localhost:4310/', out = process.argv[3] ?? 'docs/meshy/proof/grip';
const AV = (process.env.AVATARS ?? 'homme,femme').split(','), tmp = `${out}/frames`; fs.mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const W = 520, H = 420, VIEWS = ['front', 'outside', 'above', 'behind'];
for (const avatar of AV) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.setDefaultTimeout(180000);
  await p.goto(`${base}?debug&avatar=${avatar}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
  await p.evaluate(() => { const k = window.__dakar; k.teleport('pikine'); k.setHour(12); k.state.data.wallet = 400000; });
  await p.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.moto.info().dealer, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const dealer = await p.evaluate(() => window.__dakar.moto.info().dealer);
  await p.evaluate(d => window.__dakar.place(d.x, d.z + 1.3, Math.PI), dealer.counter ?? dealer);
  await p.waitForFunction(() => /Motos/.test(window.__dakar.focus()?.name ?? ''), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => window.__dakar.act()); await p.waitForSelector('#modal.on');
  await p.locator('#modal .item', { hasText: 'Jakarta' }).first().click();
  await p.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''));
  await p.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
  await p.waitForFunction(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here, null, { timeout: 60000 });
  const rec = await p.evaluate(() => window.__dakar.moto.info().record);
  await p.evaluate(r => window.__dakar.place(r.x + 1.2, r.z, -Math.PI / 2), rec);
  await p.waitForFunction(() => window.__dakar.focus()?.name === 'Ta moto Jakarta', null, { timeout: 30000 }); await p.evaluate(() => window.__dakar.act());
  await p.waitForFunction(() => window.__dakar.moto.info().driving && window.__dakar.clip() === 'Ride', null, { timeout: 60000 });
  await p.evaluate(() => window.__dakar.pause(true)); await p.evaluate(() => window.__dakar.step(1 / 60, 100));
  if (process.env.PROBE) console.log(JSON.stringify(await p.evaluate(() => {
    const g = window.__dakar.body().group; g.updateMatrixWorld(true); const m = []; g.traverse(o => { if (o.isSkinnedMesh) m.push(o); }); const sk = m[0], d = sk.morphTargetDictionary.grip; sk.skeleton.update();
    const idx = sk.skeleton.bones.indexOf(g.getObjectByName('handL')), gm = sk.geometry, si = gm.getAttribute('skinIndex'), sw = gm.getAttribute('skinWeight'), pos = gm.getAttribute('position'), v = new g.position.constructor(), rows = [];
    const inv = g.getObjectByName('handL').matrixWorld.clone().invert();
    for (let i = 0; i < pos.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === idx) w += sw.getComponent(i, k); sk.getVertexPosition(i, v); v.applyMatrix4(sk.matrixWorld); const b = v.clone().applyMatrix4(inv); if (b.length() > 0.22) continue; const bones = []; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0) bones.push(sk.skeleton.bones[si.getComponent(i, k)].name + ':' + sw.getComponent(i, k).toFixed(2)); rows.push({ i, y: +v.y.toFixed(3), bone: b.toArray().map(x => +x.toFixed(3)), bones }); }
    rows.sort((a, b) => a.y - b.y); return rows.slice(0, 8); })));
  const files = [];
  if (process.env.HIDE === 'body') await p.evaluate(() => { window.__dakar.body().group.visible = false; });
  if (process.env.GRIP0) await p.evaluate(() => { const m = []; window.__dakar.body().group.traverse(o => { if (o.isSkinnedMesh) m.push(o); }); const d = m[0].morphTargetDictionary; if (d?.grip !== undefined) { m[0].morphTargetInfluences[d.grip] = 0; window.__dakar.body().closeFist = () => {}; } });
  for (const side of ['L', 'R']) for (const view of VIEWS) {
    await p.evaluate(([side, view]) => {
      const k = window.__dakar, g = k.body().group; g.updateMatrixWorld(true);
      const h = new g.position.constructor(); g.getObjectByName('hand' + side).getWorldPosition(h);
      const f = g.rotation.y, fw = [Math.sin(f), Math.cos(f)], rt = [Math.cos(f), -Math.sin(f)], sd = side === 'L' ? 1 : -1;   // +rt is the rider's left
      const d = { front: [0.04 * sd, 0.12, 0.5], outside: [0.5 * sd, 0.1, 0.06], above: [0.03 * sd, 0.5, 0.06], behind: [0.03 * sd, 0.14, -0.5] }[view];
      k.cam([h.x + rt[0] * d[0] + fw[0] * d[2], h.y + d[1], h.z + rt[1] * d[0] + fw[1] * d[2]], [h.x, h.y - 0.03, h.z]); k.render();
    }, [side, view]);
    await p.addStyleTag({ content: 'body *{visibility:hidden!important} #c{visibility:visible!important}' });
    const file = `${tmp}/${avatar}-${side}-${view}.png`; await p.screenshot({ path: file }); files.push(file);
    await p.evaluate(() => document.querySelectorAll('style').forEach(s => { if (/visibility:hidden/.test(s.textContent)) s.remove(); }));
  }
  await sharp({ create: { width: W * VIEWS.length, height: H * 2, channels: 3, background: '#111' } }).composite(files.map((f, i) => ({ input: f, left: (i % 4) * W, top: Math.floor(i / 4) * H }))).jpeg({ quality: 85 }).toFile(`${out}/grip-${avatar}.jpg`);
  await ctx.close();
}
await browser.close();
if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true });
