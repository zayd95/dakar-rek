// Pikine's gare: density (cars, people, seats) and its interactions on the existing action runner. Local/preview only.
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
  await page.goto(base + '?debug&hub=pikine&heure=10');
  await page.waitForFunction(() => window.__dakar?.pos?.()?.hub === 'pikine', null, { timeout: 120000 });
  await page.evaluate(() => window.__dakar.teleport('pikine', -33, 33.5, 0)); await sleep(5000);
  const info = await page.evaluate(() => {
    const d = window.__dakar, g = d.cityGeometry(), near = (o, r) => Math.hypot(o.x + 30, o.z - 30) < r;
    return { people: g.people.filter(p => near(p, 24)).length, seated: g.people.filter(p => p.clip === 'Sit' && near(p, 24)).length, walkers: g.people.filter(p => p.walkTo && near(p, 24)).length,
      places: d.interactables().filter(i => i.id.startsWith('pikine:gare:')).map(i => i.id), cars: d.three.scene.children.length };
  });
  console.log(JSON.stringify(info));
  assert.ok(info.people >= 30, 'at least 30 people at the gare: ' + info.people);
  assert.ok(info.seated >= 10 && info.walkers >= 5, 'seated and walking vendors');
  assert.equal(info.places.length, 5, 'five gare places');
  await page.screenshot({ path: `${out}/gare-arrival.jpg`, type: 'jpeg', quality: 82 }); console.log('PASS density', JSON.stringify({ people: info.people, seated: info.seated, walkers: info.walkers }));
  const st = () => page.evaluate(() => { const d = window.__dakar.state.data; return { wallet: d.wallet, flags: [...d.flags], counters: { ...d.counters }, needs: { ...d.needs } }; });
  async function run(x, z, placeId, label, shot) {
    await page.evaluate(([x, z]) => window.__dakar.teleport('pikine', x, z, 0), [x, z]);
    await page.waitForFunction(id => window.__dakar.focus()?.id === id, placeId, { timeout: 30000 }).catch(async e => { throw Error(`focus at ${x},${z} is ${JSON.stringify(await page.evaluate(() => ({ f: window.__dakar.focus(), p: window.__dakar.pos() })))}`); });
    await page.evaluate(() => window.__dakar.more());
    const btn = page.locator('#modal button', { hasText: label }).first(); await btn.waitFor({ timeout: 15000 }); await btn.click();
    await page.waitForFunction(() => window.__dakar.activity() !== null, null, { timeout: 15000 }).catch(() => {});
    await sleep(700); if (shot) await page.screenshot({ path: `${out}/gare-${shot}.jpg`, type: 'jpeg', quality: 80 });
    await page.waitForFunction(() => window.__dakar.activity() === null, null, { timeout: 120000 });
  }
  const A = [-38.2, 30.3], Bg = [-40.6, 25.8], V = [-33, 23], T = [-15, 28], D = [-39.5, 21];   // block centre (-30, 30)
  let a = await st();
  await run(...A, 'pikine:gare:apprenti', 'Parler à l’apprenti', 'apprenti'); let b = await st();
  assert.ok(b.flags.includes('met_apprenti') && b.needs.social >= a.needs.social); console.log('PASS apprenti: line, met_apprenti');
  await run(...A, 'pikine:gare:apprenti', 'Attendre un car'); console.log('PASS wait for a car');
  await run(...Bg, 'pikine:gare:bagages', 'Aider à charger un sac', 'bagage'); let c = await st();
  assert.ok(c.wallet >= b.wallet + 500 && c.flags.includes('helped_gare')); console.log(`PASS load a bag: +${c.wallet - b.wallet} F`);
  await run(...V, 'pikine:gare:vendeurs', 'Acheter un sachet d’eau'); let d = await st(); assert.ok(d.wallet <= c.wallet - 50 + 0.01); console.log('PASS buy water');
  await run(...V, 'pikine:gare:vendeurs', 'Acheter des cacahuètes'); let e = await st(); assert.ok(e.needs.faim >= d.needs.faim); console.log('PASS buy peanuts');
  await run(...T, 'pikine:gare:the', 'Boire un attaya', 'the'); await run(...T, 'pikine:gare:the', 'Écouter les commérages'); let f = await st();
  assert.ok(f.flags.includes('heard_gare_gossip')); console.log('PASS tea + gossip');
  await run(...D, 'pikine:gare:dispute', 'Écouter la dispute'); console.log('PASS argument');
  assert.equal(errors.length, 0, errors.join(' | ')); console.log('PASS no page errors');
} finally { await browser?.close(); server.kill(); }
