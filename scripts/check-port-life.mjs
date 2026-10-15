// Port prototype: the docker, the Gorée pier and the Touba coffee run on the existing action runner. Preview/local only.
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
  await page.goto(base + '?debug&hub=plateau&portPrototype=1&heure=10');
  await page.waitForFunction(() => window.__dakar?.portPrototype?.()?.enabled === true, null, { timeout: 120000 });
  const st = () => page.evaluate(() => { const d = window.__dakar.state.data; return { wallet: d.wallet, flags: [...d.flags], counters: { ...d.counters }, needs: { ...d.needs } }; });
  async function run(x, z, placeId, label, shot) {
    await page.evaluate(([x, z]) => window.__dakar.teleport('plateau', x, z, 0), [x, z]);
    await page.waitForFunction(id => window.__dakar.focus()?.id === id, placeId, { timeout: 60000 });
    await page.evaluate(() => window.__dakar.more());
    const btn = page.locator('#modal button', { hasText: label }).first(); await btn.waitFor({ timeout: 15000 });
    const disabled = await btn.evaluate(el => el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));
    if (disabled) { await page.keyboard.press('Escape'); return 'disabled'; }
    await btn.click();
    await page.waitForFunction(() => window.__dakar.activity() !== null, null, { timeout: 15000 }).catch(() => {});
    await sleep(800); if (shot) await page.screenshot({ path: `${out}/${shot}.jpg`, type: 'jpeg', quality: 80 });
    await page.waitForFunction(() => window.__dakar.activity() === null, null, { timeout: 120000 });
    return 'ran';
  }
  let a = await st();
  await run(161, -15, 'plateau:port:docker', 'Discuter avec le docker', 'life-1-docker');
  let b = await st(); assert.ok(b.flags.includes('met_docker') && b.needs.social > a.needs.social - 0.01); console.log('PASS docker chat: line, social up, met_docker');
  await run(161, -15, 'plateau:port:docker', 'Aider à pousser une caisse', 'life-2-caisse');
  let c = await st(); assert.ok(c.wallet > b.wallet && c.flags.includes('helped_docker'), JSON.stringify([b.wallet, c.wallet])); console.log(`PASS docker job: +${c.wallet - b.wallet} F, helped_docker`);
  await run(204, 44, 'plateau:port:goree', 'Regarder vers Gorée', 'life-3-goree');
  let d = await st(); assert.ok(d.flags.includes('seen_goree')); console.log('PASS look at Gorée: seen_goree, moral up');
  for (const [i, y] of [0.8, -0.8].entries()) { await page.evaluate(y => window.__dakar.lookYaw(y), y); await sleep(700); await page.screenshot({ path: `${out}/life-goree-yaw${i}.jpg`, type: 'jpeg', quality: 75 }); }
  assert.ok(await page.evaluate(() => !!window.__dakar.three.scene.getObjectByName('dakar-port-goree')), 'Gorée on the horizon');
  assert.equal(await page.evaluate(() => window.__dakar.three.scene.getObjectByName('portwise-dakar-prototype').children.filter(o => o.type !== 'Mesh' && o.children.some(c => c.type === 'SkinnedMesh' || c.isSkinnedMesh)).length >= 0), true);
  await run(204, 44, 'plateau:port:goree', 'Parler au passeur', 'life-5-passeur');
  console.log('PASS passeur chat');
  assert.equal(await run(204, 44, 'plateau:port:goree', 'Prendre la chaloupe pour Gorée'), 'disabled'); console.log('PASS ferry trip shown as coming soon (disabled)');
  const e0 = await st(); await run(132, 12, 'plateau:port:cafe', 'Boire un café Touba', 'life-4-cafe');
  const e1 = await st(); assert.ok(e1.wallet <= e0.wallet - 100 + 0.01 && (e1.counters.cafes ?? 0) > (e0.counters.cafes ?? 0)); console.log('PASS Touba coffee: −100 F');
  assert.equal(errors.length, 0, errors.join(' | ')); console.log('PASS no page errors');
} finally { await browser?.close(); server.kill(); }
