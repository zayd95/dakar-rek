// Pikine's neighbourhood mosque (the existing mosque venue, composed on block 2,2) and its link with the gare. Local/preview only.
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&hub=pikine&heure=7.05');
  await page.waitForFunction(() => window.__dakar?.pos?.()?.hub === 'pikine', null, { timeout: 120000 });
  const mosque = await page.evaluate(() => ({ venues: window.__dakar.venues().map(v => ({ type: v.type, name: v.name })), sites: window.__dakar.interactables().filter(i => /mosque|mosqu/i.test(i.id + i.name)).map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z })) }));
  console.log(JSON.stringify(mosque));
  assert.ok(mosque.venues.some(v => v.type === 'mosque' && v.name === 'Mosquée de Pikine'), 'the mosque venue is built in Pikine');
  console.log('PASS the neighbourhood mosque is there');
  // the gare at the morning peak, then the commute from the mosque
  await page.evaluate(() => window.__dakar.teleport('pikine', -22, 26, 0)); await sleep(4000);
  const a = await page.evaluate(() => window.__dakar.gareCrowd());
  assert.ok(a && a.extras >= 8, 'extra people at the morning peak: ' + JSON.stringify(a));
  console.log('PASS morning peak: extra people at the gare', JSON.stringify(a));
  assert.ok(a.commuters >= 4 && a.walking >= 1, 'people walk from the mosque to the cars after Fajar: ' + JSON.stringify(a));
  console.log('PASS after Fajar: people walk from the mosque to the cars');
  await page.screenshot({ path: `${out}/mosque-commute.jpg`, type: 'jpeg', quality: 80 });
  await page.evaluate(() => window.__dakar.setHour(12.5)); await sleep(2500);
  const b = await page.evaluate(() => window.__dakar.gareCrowd()); assert.equal(b.extras, 0, 'midday: the extra people are gone'); console.log('PASS midday: back to the usual people');
  assert.equal(errors.length, 0, errors.join(' | ')); console.log('PASS no page errors');
} finally { await browser?.close(); server.kill(); }
