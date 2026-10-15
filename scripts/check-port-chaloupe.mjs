// Port prototype: the Dakar–Gorée chaloupe on the game clock, with NPC passengers (decor). Preview/local only.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const out = 'shots/port-preview'; await mkdir(out, { recursive: true });
const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r));
const base = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(150); }
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&hub=plateau&portPrototype=1&heure=6.05');
  await page.waitForFunction(() => window.__dakar?.portPrototype?.()?.enabled === true, null, { timeout: 120000 });
  await page.evaluate(() => window.__dakar.teleport('plateau', 205, 41, 0)); await sleep(2500);
  const at = async (h, shot, yaw) => {
    await page.evaluate(h => window.__dakar.setHour(h), h); await sleep(2500);
    if (yaw !== undefined) await page.evaluate(y => window.__dakar.lookYaw(y), yaw);
    await sleep(500);
    const i = await page.evaluate(h => window.__dakar.chaloupe(h), h);
    if (shot) await page.screenshot({ path: `${out}/chaloupe-${shot}.jpg`, type: 'jpeg', quality: 80 });
    return i;
  };
  let i = await at(6.05, 'queue', 1.57); assert.equal(i.state, 'queue'); assert.equal(i.riders, 5); console.log('PASS queue: 5 passengers on the pier, boat docked', JSON.stringify(i));
  i = await at(6.24, 'boarding', 1.57); assert.equal(i.state, 'boarding'); console.log('PASS boarding', JSON.stringify(i));
  i = await at(6.42, 'sailing', 1.0); assert.equal(i.state, 'sailing'); assert.ok(i.x > 226 && i.riders === 5, JSON.stringify(i)); console.log('PASS sailing out with 5 aboard', JSON.stringify(i));
  i = await at(7.0); assert.equal(i.visible, false); assert.equal(i.riders, 0); console.log('PASS away at Gorée: hidden');
  i = await at(7.5, 'returning', 1.0); assert.equal(i.state, 'returning'); assert.ok(i.visible); console.log('PASS returning', JSON.stringify(i));
  i = await at(7.78, 'landing', 1.57); assert.equal(i.state, 'landing'); console.log('PASS landing', JSON.stringify(i));
  i = await at(23, null); assert.equal(i.state, 'idle'); assert.equal(i.riders, 0); console.log('PASS night: parked, no queue');
  assert.equal(errors.length, 0, errors.join(' | ')); console.log('PASS no page errors');
} finally { await browser?.close(); server.kill(); }
