// The Tiak Tiak lent motorbike: free « Monter » at any time (no 150 000 F, no delivery), riding in the hub (touch: the
// stick steers, two held buttons give gas and brake, « Descendre » when stopped; desktop: the keys), the courier's box on the
// back with the parcel in it during a run, the paid Jakarta untouched. Usage: flock /tmp/dakar-browser.lock node scripts/check-tiak-moto.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4232/';
const out = process.argv[3] ?? 'docs/screenshots/tiak-moto';
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true], ['landscape', { width: 844, height: 390 }, true]]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.tiak, null, { timeout: 240000 });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { await page.waitForTimeout(500); try { await page.screenshot({ path: `${out}/${label}-${name}.png` }); } catch { /* */ } };
  const at = () => d(() => window.__dakar.tiak.at());

  for (const hub of ['pikine', 'plateau']) {
    await d(h => { window.__dakar.teleport(h); window.__dakar.setHour(11); }, hub);
    await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.tiak.at(), hub, { timeout: 120000 });
    await page.waitForTimeout(1200);
    const bike = await at();
    const info = await d(() => window.__dakar.tiak.info());
    check(`${label}/${hub}: a Tiak bike waits in the hub, free (no purchase, none owned)`, !!bike && info.owned === true && info.price === 0 && info.asset === null, JSON.stringify({ at: bike, price: info.price, asset: info.asset }));
    check(`${label}/${hub}: it has the courier's box, empty without a run`, bike?.box === true && bike?.parcel === false);
    // the paid motorbike stays a purchase
    const jak = await d(() => window.__dakar.moto.info());
    check(`${label}/${hub}: the Jakarta is still bought, not given (${jak.price} F)`, jak.price >= 100000 && jak.owned === false, JSON.stringify({ price: jak.price, owned: jak.owned }));
    if (hub !== 'pikine' && label !== 'desktop') continue;     // the ride itself once per viewport, in Pikine

    // walk up to it: « Monter » is offered
    await d(([x, z, yaw]) => { window.__dakar.place(x - Math.sin(yaw) * 1.6, z - Math.cos(yaw) * 1.6, yaw); }, [bike.x, bike.z, bike.yaw]);
    await page.waitForTimeout(1200);
    const f = await d(() => window.__dakar.focus());
    check(`${label}/${hub}: « Monter » is offered beside it`, !!f && (f.all.includes('Monter') || f.primary === 'Monter'), JSON.stringify(f).slice(0, 220));
    await shot(`${hub}-before-mount`);
    // a run in hand: the parcel shows in the box
    await d(h => { window.__dakar.state.data.jobs.active = { runId: 't1', routeId: h === 'pikine' ? 'pk_mame_boutique' : 'pl_fatou_market', hub: h, stage: 'deliver', pay: 1000, startedMs: window.__dakar.state.data.playedMs, limitMs: 600000 }; }, hub);
    await page.waitForTimeout(600);
    const withRun = await at();
    check(`${label}/${hub}: during a Tiak run the parcel is in the box`, withRun?.parcel === true);
    await shot(`${hub}-parcel`);
    // mount (touch: the action button; desktop: E)
    if (touch) await page.tap('#act'); else await page.keyboard.press('KeyE');
    const mounted = await page.waitForFunction(() => window.__dakar.tiak.at()?.driving === true, null, { timeout: 15000 }).then(() => true).catch(() => false);
    check(`${label}/${hub}: « Monter » seats the player on the bike, no delivery needed to ride`, mounted, JSON.stringify(await at()));
    // no jump: the player's position follows the bike seat
    const a0 = await at();
    if (touch) {
      await page.waitForFunction(() => window.__dakar.tiak.at()?.pad === true, null, { timeout: 10000 }).catch(() => {});
      const vis = await d(() => { const r = document.querySelector('#ridepad'); return r ? getComputedStyle(r).display : 'none'; });
      const actbar = await d(() => getComputedStyle(document.querySelector('#actbar')).display);
      check(`${label}/${hub}: the riding pad is up (gas, brake) and the action bar steps aside`, vis !== 'none' && actbar === 'none', `${vis}/${actbar}`);
      const offStopped = await d(() => getComputedStyle(document.querySelector('#ridepad .rp-off')).display);
      check(`${label}/${hub}: « Descendre » shows when stopped`, offStopped !== 'none', offStopped);
      await shot(`${hub}-riding-stopped`);
      // hold the gas button
      await d(() => document.querySelector('#ridepad .rp-gas').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true })));
    } else { await page.keyboard.down('KeyW'); }
    // (game time runs slower than the clock on this software renderer: wait for the speed rather than for seconds)
    await page.waitForFunction(() => window.__dakar.tiak.at()?.speed > 4, null, { timeout: 40000 }).catch(() => {});
    const fast = await at();
    check(`${label}/${hub}: holding the gas it accelerates (${fast?.speed} m/s) and has moved`, fast && fast.speed > 3 && Math.hypot(fast.x - a0.x, fast.z - a0.z) > 2, JSON.stringify(fast));
    if (touch) {
      const offMoving = await d(() => getComputedStyle(document.querySelector('#ridepad .rp-off')).display);
      check(`${label}/${hub}: « Descendre » is hidden while moving`, offMoving === 'none', offMoving);
      await shot(`${hub}-riding-fast`);
      await d(() => { document.querySelector('#ridepad .rp-gas').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true })); document.querySelector('#ridepad .rp-brake').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, bubbles: true })); });
    } else { await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); }
    await page.waitForFunction(() => Math.abs(window.__dakar.tiak.at().speed) < 0.3, null, { timeout: 20000 }).catch(() => {});
    if (touch) await d(() => document.querySelector('#ridepad .rp-brake').dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, bubbles: true }))); else await page.keyboard.up('KeyS');
    const stopped = await at();
    check(`${label}/${hub}: the brake stops it (${stopped?.speed} m/s)`, stopped && Math.abs(stopped.speed) < 0.5);
    check(`${label}/${hub}: it stayed in the hub`, (await d(() => window.__dakar.pos().hub)) === hub);
    // get off
    if (touch) { await page.waitForTimeout(300); await page.tap('#ridepad .rp-off'); } else { await page.keyboard.press('KeyE'); }
    const off = await page.waitForFunction(() => window.__dakar.tiak.at()?.driving === false, null, { timeout: 15000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(500);
    const parked = await at(), pe = await d(() => window.__dakar.pos());
    check(`${label}/${hub}: « Descendre » puts the player on foot beside the parked bike (${Math.hypot(pe.x - (parked?.x ?? 0), pe.z - (parked?.z ?? 0)).toFixed(1)} m)`, off && parked && Math.hypot(pe.x - parked.x, pe.z - parked.z) < 2.6 && (await d(() => window.__dakar.seated())) === null, JSON.stringify({ parked, pe }));
    if (touch) check(`${label}/${hub}: the pad and the action bar are back`, await d(() => getComputedStyle(document.querySelector('#actbar')).display !== 'none' && !document.body.classList.contains('ridepad')));
    await shot(`${hub}-parked`);
    await d(() => { window.__dakar.state.data.jobs.active = null; });
  }
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
