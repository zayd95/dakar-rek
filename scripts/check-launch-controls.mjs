// Touch/quality/invitation regressions against a real local Workers runtime.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const checks = [], contexts = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, detail); assert.ok(ok, name); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let worker, browser, logs = '';
try {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const base = `http://127.0.0.1:${port}/`;
  worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port)], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [worker.stdout, worker.stderr]) stream.on('data', b => { logs = (logs + b).slice(-8000); });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(`${base}api/health`)).ok) break; } catch { /* starting */ }
    await sleep(250);
  }
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); contexts.push(ctx);
  await ctx.addInitScript(() => { localStorage.setItem('dakarrek.quality', 'low'); });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch&hub=pikine&room=120`);
  await page.waitForFunction(() => window.__dakar?.presence().status === 'online');
  check('invitation joins the requested hub and group', (await page.evaluate(() => window.__dakar.presence().room)) === 120);

  // Rebuild quality while inside: exit must still lead to the doorway in the street.
  for (const [kind, quality] of [['maiga', 'medium'], ['home', 'low']]) {
    await page.evaluate(kind => window.__dakar.enter(kind), kind);
    await page.waitForFunction(() => window.__dakar.pos().x > 900);
    // Quality lives in the phone (Réglages); the phone remembers the last app between openings.
    await page.locator('#menuBtn').tap();
    if (!(await page.locator(`#phone button[data-q="${quality}"]`).count())) await page.locator('#phone [data-app="reglages"]').tap();
    await page.locator(`#phone button[data-q="${quality}"]`).tap();
    await page.locator('#phone [data-nav="close"]').tap();
    await page.waitForFunction(() => !document.querySelector('#modal').classList.contains('on') && !document.querySelector('#phone').classList.contains('on'));
    await page.evaluate(() => window.__dakar.exit());
    await sleep(700);
    const p = await page.evaluate(() => window.__dakar.pos());
    check(`changing quality inside ${kind} keeps a working exit`, p.x < 900 && p.hub === 'pikine', JSON.stringify(p));
  }

  // A lost pointer/blur must not keep walking after returning to the game.
  await page.evaluate(() => window.__dakar.place(-6, -30, 0));
  const joy = await page.locator('#joy').boundingBox();
  const x = joy.x + joy.width / 2, y = joy.y + joy.height / 2 - 35;
  await page.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 42, clientX: x, clientY: y })), [x, y]);
  const start = await page.evaluate(() => window.__dakar.pos()); await sleep(1000);
  const moving = await page.evaluate(() => window.__dakar.pos());
  check('touch joystick actually moves the player', Math.hypot(moving.x - start.x, moving.z - start.z) > 0.5);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const stopped = await page.evaluate(() => window.__dakar.pos()); await sleep(1100);
  const later = await page.evaluate(() => window.__dakar.pos());
  check('losing focus stops a held joystick', Math.hypot(later.x - stopped.x, later.z - stopped.z) < 0.15);
  // Another finger can start after the abandoned touch id.
  await page.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 43, clientX: x, clientY: y })), [x, y]);
  const resumed = await page.evaluate(() => window.__dakar.pos()); await sleep(900);
  const after = await page.evaluate(() => window.__dakar.pos());
  check('a new touch works after returning', Math.hypot(after.x - resumed.x, after.z - resumed.z) > 0.5);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 43 })));
  await page.locator('#presenceBtn').tap();
  await page.locator('#presenceName').fill('Mame Awa');
  await page.getByRole('button', { name: 'Enregistrer mon profil', exact: true }).tap();
  await page.waitForFunction(() => window.__dakar.presence().status === 'online');
  await page.locator('#presenceBtn').tap();
  check('profile survives a reconnect without changing invite group', await page.locator('#presenceName').inputValue() === 'Mame Awa' && (await page.evaluate(() => window.__dakar.presence().room)) === 120);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForFunction(() => document.querySelector('#place').getBoundingClientRect().bottom <= document.querySelector('#presenceBtn').getBoundingClientRect().top);
  const place = await page.locator('#place').boundingBox(), presence = await page.locator('#presenceBtn').boundingBox();
  check('small-phone presence button does not cover the neighbourhood header', place.y + place.height <= presence.y);
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(400);
  // The light side sheet (src/ui/sheet.ts) shows almost the whole profile at 390 px — it overflows by a few pixels only —
  // so its content is made taller than the screen here: what is tested is the touch scroll of the sheet itself.
  const fit = await page.locator('#modal .panel').evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight }));
  await page.locator('#modal .panel').evaluate(el => { const s = document.createElement('div'); s.className = 'check-spacer'; s.style.height = '480px'; el.appendChild(s); });
  const panel = await page.locator('#modal .panel').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const tx = panel.x + panel.width / 2, ty = panel.y + panel.height - 25;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx, y: ty - i * 20 }] }); await sleep(60); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(500);
  const scrolled = await page.locator('#modal .panel').evaluate(el => el.scrollTop);
  check('landscape profile panel scrolls with an actual touch gesture', scrolled > 20, `scrollTop ${scrolled} · profile alone ${fit.sh}/${fit.ch} px`);
  await page.getByRole('button', { name: 'Fermer', exact: true }).tap();
  const recovery = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); contexts.push(recovery);
  await recovery.addInitScript(() => {
    localStorage.setItem('dakarrek.quality', 'low');
    localStorage.setItem('dakarrek.guest.save', JSON.stringify({ schemaVersion: 2, guestId: 'recovery-test', hub: 'pikine', x: 1040, z: 0, wallet: 7777 }));
  });
  const recovered = await recovery.newPage(); recovered.on('pageerror', e => errors.push(e.message));
  await recovered.goto(`${base}?debug&touch`);
  await recovered.waitForFunction(() => window.__dakar?.pos().hub);
  const restored = await recovered.evaluate(() => ({ p: window.__dakar.pos(), money: window.__dakar.state.wallet }));
  check('an old off-map save recovers in the city without losing money', Math.abs(restored.p.x) < 200 && Math.abs(restored.p.z) < 200 && restored.money === 7777);
  await page.setViewportSize({ width: 390, height: 844 });
  check('no browser page errors', errors.length === 0, errors.join(' | '));
  await fs.mkdir('shots/launch-controls', { recursive: true });
  await page.screenshot({ path: 'shots/launch-controls/phone.png' });
  if (process.argv.includes('--full')) {
    for (const context of contexts.splice(0)) await context.close();
    await browser.close(); browser = null;
    const full = spawn(process.execPath, ['scripts/shots.mjs', base, 'shots/launch-gameplay'], { stdio: 'inherit' });
    const code = await new Promise(resolve => full.on('close', resolve));
    check('full desktop and phone gameplay suite', code === 0);
  }
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  await fs.mkdir('shots/launch-controls', { recursive: true });
  await fs.writeFile('shots/launch-controls/results.json', JSON.stringify(checks, null, 2));
  for (const ctx of contexts) await ctx.close();
  await browser?.close(); worker?.kill('SIGTERM');
}
