// City acceptance: reachable services, real menus and money/needs, desktop/touch captures.
// Usage: node scripts/check-city-life.mjs <served-build-url> [output-directory]
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

let base = process.argv[2], server;
const out = process.argv[3] || 'shots/city-life';
await mkdir(out, { recursive: true });
const checks = [], errors = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, detail); assert.ok(ok, name); };
if (!base) {
  const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  base = `http://127.0.0.1:${port}/`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('City test preview exited');
    try { if ((await fetch(base)).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 100));
  }
}
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.DAKAR_BROWSER_PROXY ? { proxy: { server: process.env.DAKAR_BROWSER_PROXY } } : {}) });
try {
  for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, ignoreHTTPSErrors: process.env.DAKAR_TEST_PROXY_TLS === 'true' });
    await ctx.addInitScript(q => localStorage.setItem('dakarrek.quality', q), touch ? 'low' : 'medium');
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?debug${touch ? '&touch' : ''}`);
    await page.waitForFunction(() => window.__dakar?.body());
    for (const hub of ['corniche', 'almadies', 'plateau', 'pikine']) {
      await page.evaluate(hub => { window.__dakar.teleport(hub); window.__dakar.setHour(16); }, hub);
      const data = await page.evaluate(() => ({ places: window.__dakar.cityPlaces(), geometry: window.__dakar.cityGeometry() }));
      check(`${label}: ${hub} contains new active places`, data.places.length >= (hub === 'almadies' ? 6 : hub === 'corniche' ? 4 : 3), `${data.places.length} places`);
      check(`${label}: ${hub} service positions are reachable`, data.places.every(p => {
        const b = data.geometry.bounds;
        return p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && !data.geometry.colliders.some(c => p.x > c.x0 - 0.4 && p.x < c.x1 + 0.4 && p.z > c.z0 - 0.4 && p.z < c.z1 + 0.4);
      }));
      check(`${label}: ${hub} has residents at its new places`, data.geometry.people.length > 3);
    }
    await page.evaluate(() => window.__dakar.teleport('corniche'));
    const route = await page.evaluate(() => {
      const { colliders } = window.__dakar.cityGeometry();
      const points = [[-131.6, 60], [-131.6, 66.5], [-138, 66.5], [-138, 96]];
      for (let n = 1; n < points.length; n++) for (let s = 0; s <= 100; s++) {
        const t = s / 100, x = points[n - 1][0] * (1 - t) + points[n][0] * t, z = points[n - 1][1] * (1 - t) + points[n][1] * t;
        if (colliders.some(c => x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4)) return { ok: false, x, z };
      }
      return { ok: true };
    });
    check(`${label}: Corniche crossing connects to the fishing beach`, route.ok, JSON.stringify(route));
    await page.evaluate(() => { const d = window.__dakar; d.places(); });
    await page.getByRole('button', { name: /^Soumbédioune · débarquement/ }).click();
    await page.waitForFunction(() => document.querySelector('#goal').textContent.includes('Soumbédioune'));
    check(`${label}: directory sets a walking destination`, true);
    const fishing = await page.evaluate(() => window.__dakar.cityPlaces().find(p => p.id.endsWith(':soumbedioune')));
    await page.evaluate(p => { const d = window.__dakar; d.place(p.x, p.z, Math.PI / 2); d.state.data.needs.energie = 100; }, fishing);
    await page.waitForFunction(() => window.__dakar.nearestInteractable()?.startsWith('Soumbédioune'));
    await page.evaluate(() => window.__dakar.act());
    await page.screenshot({ path: `${out}/${label}-fishing-menu.jpg`, type: 'jpeg', quality: 85 });
    const before = await page.evaluate(() => ({ money: window.__dakar.state.wallet, energy: window.__dakar.state.data.needs.energie }));
    await page.getByRole('button', { name: /^Débarquer les caisses de poisson/ }).click();
    // the job runs on game time and is played out (crates carried to the pile): slow under SwiftShader
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 180000 });
    const after = await page.evaluate(() => ({ money: window.__dakar.state.wallet, energy: window.__dakar.state.data.needs.energie }));
    check(`${label}: fishing service pays and consumes energy`, after.money - before.money === 3200 && before.energy - after.energy >= 26);
    // after the job nothing is in focus any more (focus() is null): face the landing place again before acting
    await page.evaluate(p => { const d = window.__dakar; d.place(p.x, p.z, Math.PI / 2); d.state.data.needs.energie = 0; }, fishing);
    await page.waitForFunction(() => window.__dakar.focus()?.id?.endsWith(':soumbedioune'));
    await page.evaluate(() => window.__dakar.act());
    check(`${label}: an exhausted player cannot take the fishing job`, await page.getByRole('button', { name: /^Débarquer les caisses de poisson/ }).getAttribute('class') === 'item dis');
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.evaluate(() => { const d = window.__dakar; d.setHour(16); d.cam([-123, 16, 117], [-142, 1, 90]); });
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-soumbedioune-beach.jpg`, type: 'jpeg', quality: 88 });
    await page.evaluate(() => window.__dakar.cam([-61, 17, 113], [-93, 1, 86]));
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-soumbedioune-market.jpg`, type: 'jpeg', quality: 88 });

    await page.evaluate(() => { const d = window.__dakar; d.teleport('almadies'); d.place(30, 47, Math.PI); d.setHour(16); d.cam([65, 22, 62], [30, 2.5, 26]); });
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${label}-mall.jpg`, type: 'jpeg', quality: 88 });
    const juice = await page.evaluate(() => window.__dakar.cityPlaces().find(p => p.id.endsWith(':mall-juice')));
    await page.evaluate(p => { const d = window.__dakar; d.cam(null); d.place(p.x, p.z, Math.PI); d.state.data.needs.faim = 30; }, juice);
    await page.waitForFunction(() => window.__dakar.nearestInteractable() === 'Jus & Go');
    await page.evaluate(() => window.__dakar.act());
    const wallet = await page.evaluate(() => window.__dakar.state.wallet);
    await page.getByRole('button', { name: /^Jus de bouye frais/ }).click();
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 120000 });
    check(`${label}: mall purchase debits once and feeds the player`, (await page.evaluate(() => window.__dakar.state.wallet)) === wallet - 500 && (await page.evaluate(() => window.__dakar.state.data.needs.faim)) > 39);
    if (!touch) {
      await page.evaluate(() => window.__dakar.place(30, 55, Math.PI));
      await page.keyboard.down('KeyW');
      try { await page.waitForFunction(() => window.__dakar.pos().z < 46.5, null, { timeout: 20000 }); }
      finally { await page.keyboard.up('KeyW'); }
      check('desktop: the mall entrance can be walked through', true);
    }
    await page.evaluate(() => { const d = window.__dakar; d.place(30, 47, Math.PI); d.setHour(21); d.cam([60, 16, 60], [30, 2, 26]); });
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-mall-night.jpg`, type: 'jpeg', quality: 88 });
    await page.evaluate(() => { const d = window.__dakar; d.teleport('plateau'); d.place(90, -28.5, Math.PI); d.setHour(13); d.cam([110, 8, -5], [90, 2.2, -35]); });
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-bank.jpg`, type: 'jpeg', quality: 88 });
    await page.evaluate(() => { const d = window.__dakar; d.teleport('pikine'); d.place(-19.5, 93, Math.PI); d.setHour(17); d.cam([-4, 12, 115], [-30, 1.5, 89]); });
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-square.jpg`, type: 'jpeg', quality: 88 });
    await page.evaluate(() => { window.__dakar.place(-101, 85.7, Math.PI); window.__dakar.cam([-63, 12, 109], [-90, 1.8, 82]); });
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-shops.jpg`, type: 'jpeg', quality: 88 });
    check(`${label}: no JavaScript errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server?.kill('SIGTERM');
  await writeFile(`${out}/results.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), checks, errors }, null, 2));
}
