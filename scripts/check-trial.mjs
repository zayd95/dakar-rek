// « Essayer »: the free test drive offered by every dealer, separate from buying (src/transport/ownedModule.ts). For each of the four vehicles (Jakarta, Berline moderne, Berline neuve,
// 4 × 4 de luxe), on desktop (keys) and phone (real touch events): at the desk « Essayer » is offered next to the price; picking it costs nothing (no wallet line, nothing owned, nothing
// parked in the save) and puts the vehicle at the kerb; the player gets on, drives, gets off, and the vehicle goes back to the dealer. A reload mid-test leaves nothing behind. Buying
// right after a test drive still delivers the real one, and once owned « Essayer » is off.
// Usage: node scripts/check-trial.mjs [baseUrl] [outDir]   (a running build; ONLY=desktop|phone, VEHICLE=jakarta|compacte to run one)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, padDrive } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4213/', out = process.argv[3] ?? 'docs/screenshots/trial';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const VEHICLES = [
  { asset: 'jakarta', key: 'moto', hub: 'pikine', item: 'Moto Jakarta', mine: 'Ta moto Jakarta', moto: true },
  { asset: 'compacte', key: 'car', hub: 'plateau', item: 'Berline moderne', mine: 'Ta voiture' },
].filter(v => !process.env.VEHICLE || v.asset === process.env.VEHICLE);
const near = v => [-120, -60, 0, 60, 120].reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]].filter(r => !process.env.ONLY || r[0] === process.env.ONLY)) {
  for (const V of VEHICLES) {
    const tag = `${label}/${V.asset}`;
    const context = await browser.newContext(touch ? { viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport });
    await context.addInitScript(k => { window.__veh = () => window.__dakar?.[k]; }, V.key);
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    const d = (fn, arg) => page.evaluate(fn, arg), info = () => d(() => window.__veh().info());
    const tr = touch ? await realTouch(page) : null;
    const boot = async () => { await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 }); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T); };
    const toHub = async () => {
      await d(h => { window.__dakar.teleport(h); window.__dakar.setHour(10); }, V.hub);
      await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__veh().info().dealer, V.hub, T);
    };
    /** Stand on the pavement side of the counter facing it, and open the dealer's catalogue. */
    const openDesk = async dealer => {
      const rx = near(dealer.x), rz = near(dealer.z), road = Math.abs(dealer.z - rz) < Math.abs(dealer.x - rx) ? { x: 0, z: Math.sign(rz - dealer.z) || 1 } : { x: Math.sign(rx - dealer.x) || 1, z: 0 };
      await d(([p, r]) => window.__dakar.place(p.x + r.x * 0.7 + (r.x ? 0 : 0.4), p.z + r.z * 0.7 + (r.z ? 0 : 0.4), Math.atan2(-r.x, -r.z)), [dealer, road]);
      await page.waitForFunction(() => /Voir les articles/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, T).catch(() => {});
      await d(() => window.__dakar.act());
      await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
      return road;
    };
    const items = () => d(() => [...document.querySelectorAll('#modal .item')].map(b => ({ text: b.textContent ?? '', off: /\bdis\b|disabled/.test(b.className) })));
    const closeModal = async () => { await d(() => document.querySelector('#modal .item.close')?.click()); await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {}); };
    /** Drive: gas (keys, or on the phone a finger on the gas pad for the bike / the stick for cars) until `until`. */
    const drive = async (until, arg = null, back = false) => {
      const hold = () => page.waitForFunction(until, arg, { timeout: 120000 }).catch(() => {});
      if (!touch) { const k = back ? 'KeyS' : 'KeyW'; await page.keyboard.down(k); await hold(); await page.keyboard.up(k); return; }
      if (V.moto) await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, T);      // the pad shows a frame after the player is seated
      const j = await tr.centre('#joy');
      if (V.moto && !back) { const g = await tr.centre('#ridepad .rp-gas'); await tr.down(1, g.x, g.y); await hold(); await tr.up(1); }
      else if (V.moto) { const b = await tr.centre('#ridepad .rp-brake'); await tr.down(1, b.x, b.y); await hold(); await tr.up(1); }
      else await padDrive(page, tr, { brake: back, hold });
    };
    const ledger = () => d(() => window.__dakar.state.data.ledger.length), wallet = () => d(() => window.__dakar.state.wallet);
    const counters = () => d(a => Object.keys(window.__dakar.state.data.counters).filter(k => k.startsWith(`vehicle:${a}:`)), V.asset);

    await boot(); await toHub();
    await d(() => { window.__dakar.state.data.wallet = 500000000; });
    const i0 = await info(), dealer = i0.dealer, w0 = await wallet(), l0 = await ledger();
    const road = await openDesk(dealer);
    const menu = await items(), buyRow = menu.find(m => m.text.includes(V.item) && !/Essayer/.test(m.text.slice(0, 40))), tryRow = menu.find(m => /Essayer/.test(m.text));
    check(`${tag}: the dealer's catalogue offers « Essayer » (free) next to the price`, !!tryRow && !tryRow.off && /Gratuit/.test(tryRow.text) && !!buyRow && /\sF/.test(buyRow.text), JSON.stringify(menu.map(m => m.text.slice(0, 70))));
    await page.screenshot({ path: `${out}/${label}-${V.asset}-1-menu.png` });
    await page.locator('#modal .item', { hasText: 'Essayer' }).first().click();
    await page.waitForFunction(() => window.__veh().info().here && window.__veh().info().trial, null, T).catch(() => {});
    const t1 = await info();
    check(`${tag}: picking it puts the vehicle at the kerb, costs nothing, owns nothing, saves nothing`, t1.here && t1.trial && !t1.owned && (await wallet()) === w0 && (await ledger()) === l0 && (await counters()).length === 0 && t1.record === null
      && Math.hypot(t1.x - dealer.delivery.x, t1.z - dealer.delivery.z) < 0.1, JSON.stringify({ here: t1.here, trial: t1.trial, owned: t1.owned, record: t1.record, wallet: [w0, await wallet()], counters: await counters() }));
    // get on: from behind the vehicle
    const standBehind = async () => { const c = await info(); await d(([c, back]) => { const f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; window.__dakar.place(c.x - f.x * back, c.z - f.z * back, c.yaw); }, [c, V.moto ? 1.7 : 3.3]); };
    await standBehind();
    await page.waitForFunction(() => /Véhicule d’essai/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
    const f1 = await d(() => window.__dakar.focus());
    check(`${tag}: the test vehicle can be got on (« ${f1?.primary} »)`, /Véhicule d’essai/.test(f1?.name ?? '') && /Monter/.test(f1?.primary ?? ''), JSON.stringify(f1));
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => window.__veh().info().driving, null, T).catch(() => {});
    const x0 = await info();
    check(`${tag}: at the controls`, x0.driving && x0.trial && !x0.owned, JSON.stringify({ driving: x0.driving, trial: x0.trial }));
    await drive(p => { const m = window.__veh().info(); return Math.hypot(m.x - p.x, m.z - p.z) > 6 && m.speed > 2; }, { x: x0.x, z: x0.z });
    const x1 = await info();
    check(`${tag}: it drives (${Math.hypot(x1.x - x0.x, x1.z - x0.z).toFixed(1)} m)`, Math.hypot(x1.x - x0.x, x1.z - x0.z) > 5, JSON.stringify({ speed: x1.speed }));
    await page.screenshot({ path: `${out}/${label}-${V.asset}-2-driving.png` });
    await drive(() => Math.abs(window.__veh().info().speed) < 0.3, null, true);
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => !window.__veh().info().driving, null, T).catch(() => {});
    await page.waitForTimeout(400);
    const t2 = await info(), seated = await d(() => window.__dakar.seated());
    check(`${tag}: getting off ends the test: the vehicle goes back, the player is on foot, still nothing paid, owned or saved`, !t2.driving && !t2.here && !t2.trial && !t2.owned && seated === null && (await wallet()) === w0 && (await ledger()) === l0 && (await counters()).length === 0, JSON.stringify({ here: t2.here, trial: t2.trial, seated, counters: await counters() }));
    // again, then a reload in the middle of it leaves nothing behind
    await toHub(); await openDesk(dealer);
    await page.locator('#modal .item', { hasText: 'Essayer' }).first().click();
    await page.waitForFunction(() => window.__veh().info().here, null, T).catch(() => {});
    await standBehind(); await page.waitForFunction(() => /Véhicule d’essai/.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
    await d(() => window.__dakar.act()); await page.waitForFunction(() => window.__veh().info().driving, null, T).catch(() => {});
    await drive(() => window.__veh().info().speed > 1.5);
    await page.reload({ timeout: 120000 });
    await page.waitForFunction(h => window.__veh?.() && window.__dakar.pos().hub === h, V.hub, T).catch(() => {});
    await page.waitForTimeout(1500);
    const r1 = await info();
    check(`${tag}: a reload in the middle of a test drive leaves nothing behind (no vehicle, nothing owned, nothing saved, no money gone)`, !r1.here && !r1.trial && !r1.owned && r1.record === null && (await counters()).length === 0 && (await wallet()) >= w0 - 1000, JSON.stringify({ here: r1.here, record: r1.record, wallet: await wallet() }));
    // buying after a test drive still delivers the real one; « Essayer » is then off
    await toHub(); await d(() => { window.__dakar.state.data.wallet = 500000000; });
    const w2 = await wallet(), l2 = await ledger();
    await openDesk(dealer);
    await page.locator('#modal .item', { hasText: 'Essayer' }).first().click();
    await page.waitForFunction(() => window.__veh().info().trial, null, T).catch(() => {});
    await openDesk(dealer);
    const m2 = await items();
    check(`${tag}: while the test vehicle is out « Essayer » is off (one at a time)`, !!m2.find(m => /Essayer/.test(m.text))?.off, JSON.stringify(m2.map(m => [m.text.slice(0, 30), m.off])));
    await page.locator('#modal .item', { hasText: 'Acheter · ' + V.item }).first().click();
    await page.waitForFunction(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, T).catch(() => {});
    await page.locator('#modal .item', { hasText: 'Confirmer' }).first().click();
    await page.waitForFunction(() => window.__veh().info().owned && window.__veh().info().here, null, T).catch(() => {});
    const b = await info(), price = b.price;
    check(`${tag}: buying after a test drive: paid once, one wallet line, the real one delivered at the kerb (no test vehicle left)`, b.owned && b.here && !b.trial && w2 - (await wallet()) === price && (await ledger()) === l2 + 1 && Math.hypot(b.x - dealer.delivery.x, b.z - dealer.delivery.z) < 0.1 && b.record !== null, JSON.stringify({ owned: b.owned, trial: b.trial, paid: w2 - (await wallet()), price, record: b.record }));
    await openDesk(dealer);
    const m3 = await items();
    check(`${tag}: once owned, « Essayer » is off`, !!m3.find(m => /Essayer/.test(m.text))?.off, JSON.stringify(m3.map(m => [m.text.slice(0, 30), m.off])));
    await closeModal();
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | ').slice(0, 300));
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} trial checks passed`);
process.exit(failed ? 1 : 0);
