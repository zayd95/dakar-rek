// Pikine's gare in the rain (?meteo=pluie on a preview): mud and standing water, stuck cars, a fuller shelter, new help actions. Local/preview only.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const out = 'shots/pikine'; await mkdir(out, { recursive: true });
const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r));
const base = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(150); }
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async meteo => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + `?debug&hub=pikine&heure=12.5&meteo=${meteo}`);
    await page.waitForFunction(() => window.__dakar?.pos?.()?.hub === 'pikine', null, { timeout: 120000 });
    await page.evaluate(() => window.__dakar.teleport('pikine', -33, 33.5, 0)); await sleep(6000);
    return page;
  };
  const menuHas = async (page, x, z, placeId, label) => {
    await page.evaluate(([x, z]) => window.__dakar.teleport('pikine', x, z, 0), [x, z]);
    await page.waitForFunction(id => window.__dakar.focus()?.id === id, placeId, { timeout: 30000 });
    await page.evaluate(() => window.__dakar.more());
    const n = await page.locator('#modal button', { hasText: label }).count();
    return n;
  };
  async function run(page, x, z, placeId, label, shot) {
    await page.evaluate(([x, z]) => window.__dakar.teleport('pikine', x, z, 0), [x, z]);
    await page.waitForFunction(id => window.__dakar.focus()?.id === id, placeId, { timeout: 30000 });
    await page.evaluate(() => window.__dakar.more());
    const btn = page.locator('#modal button', { hasText: label }).first(); await btn.waitFor({ timeout: 15000 }); await btn.click();
    await page.waitForFunction(() => window.__dakar.activity() !== null, null, { timeout: 15000 }).catch(() => {});
    await sleep(700); if (shot) await page.screenshot({ path: `${out}/${shot}.jpg`, type: 'jpeg', quality: 80 });
    await page.waitForFunction(() => window.__dakar.activity() === null, null, { timeout: 120000 });
  }
  const st = page => page.evaluate(() => { const d = window.__dakar.state.data; return { wallet: d.wallet, flags: [...d.flags] }; });
  // --- rain at midday
  let page = await open('pluie');
  await page.screenshot({ path: `${out}/rain-gare.jpg`, type: 'jpeg', quality: 80 });
  const r = await page.evaluate(() => ({ rain: window.__dakar.gareRain(), crowd: window.__dakar.gareCrowd(), w: window.__dakar.weather.now() }));
  console.log(JSON.stringify(r));
  assert.ok(r.rain.wet >= 0.4, 'mud on the ground'); assert.ok(r.rain.sunk.every(v => v > 0.08), 'two cars sunk in the mud'); assert.ok(r.rain.stuckPlace, 'the stuck car has its place');
  assert.ok(r.crowd.extras >= 8, 'a fuller shelter at midday in the rain: ' + JSON.stringify(r.crowd));
  console.log('PASS rain: mud, sunk cars, a full shelter at midday');
  const before = await st(page);
  await run(page, -35.4, 20.2, 'pikine:gare:embourbe', 'Pousser le car', 'rain-pousser'); const a = await st(page);
  assert.ok(a.wallet >= before.wallet + 400 && a.flags.includes('pushed_car')); console.log(`PASS push the car: +${a.wallet - before.wallet} F`);
  await run(page, -40.6, 25.8, 'pikine:gare:bagages', 'Aider quelqu’un avec ses sacs'); const b = await st(page);
  assert.ok(b.wallet >= a.wallet + 300); console.log(`PASS help with bags in the rain: +${b.wallet - a.wallet} F`);
  await page.context().close();
  // --- the same hour in the sun: nothing of it
  page = await open('soleil');
  const d = await page.evaluate(() => ({ rain: window.__dakar.gareRain(), crowd: window.__dakar.gareCrowd() }));
  assert.ok(d.rain.wet < 0.05 && d.rain.sunk.every(v => v < 0.02) && !d.rain.stuckPlace && (d.crowd?.extras ?? 0) === 0, 'dry at midday: ' + JSON.stringify(d));
  assert.equal(await menuHas(page, -40.6, 25.8, 'pikine:gare:bagages', 'sacs'), 0, 'no rain action in the sun'); console.log('PASS sun: dry ground, no stuck car, no rain action');
  assert.equal(errors.length, 0, errors.join(' | ')); console.log('PASS no page errors');
} finally { await browser?.close(); server.kill(); }
