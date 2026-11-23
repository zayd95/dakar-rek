// A save from before the modern sedan, with the old « Voiture d'occasion » (`clando`) owned and parked in the Plateau, loaded by the real game:
// the owner keeps the same asset (uid, what they paid, condition) as the new « Berline moderne », parked where it was, drivable; the wallet and the
// ledger are untouched; the old id is gone from the assets and the counters; and the dealer no longer sells the old car.
// Usage: node scripts/check-legacy-car.mjs [baseUrl=http://localhost:4213/]   (a running build; ?debug)
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4213/', T = { timeout: 240000 };
let failed = 0; const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); if (!ok) failed++; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

// 1. a normal save from this build, turned into the old owner's
const c1 = await browser.newContext({ viewport: { width: 1000, height: 640 } }), p1 = await c1.newPage();
await p1.goto(`${base}?debug`, T); await p1.waitForFunction(() => window.__dakar?.pos?.().hub, null, T);
const old = await p1.evaluate(() => {
  const D = window.__dakar, d = JSON.parse(JSON.stringify(D.state.data)), plateau = D.hubs.indexOf('plateau');
  d.wallet = 777000;
  d.assets.list.push({ uid: 'a77', spec: 'clando', how: 'owned', since: 4321, paid: 2800000, condition: 80, upgrades: [], leased: false });
  Object.assign(d.counters, { 'vehicle:clando:hub': plateau, 'vehicle:clando:x': 115.7, 'vehicle:clando:z': 97, 'vehicle:clando:yaw': 0 });
  d.ledger.push({ at: 1, label: 'Achat : Voiture d’occasion', amount: -2800000 });
  return d;
});
await c1.close();

// 2. the real game loads it
const c2 = await browser.newContext({ viewport: { width: 1000, height: 640 } });
await c2.addInitScript(([k, d]) => { try { if (!localStorage.getItem(k + '.seeded')) { localStorage.setItem(k, JSON.stringify({ ...d, savedAt: Date.now() })); localStorage.setItem(k + '.seeded', '1'); } } catch { /* */ } }, ['dakarrek.guest.save.v5', old]);
const p = await c2.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.goto(`${base}?debug`, T); await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, T);
await p.evaluate(() => { window.__dakar.teleport('plateau'); window.__dakar.setHour(10); });
await p.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car.info().dealer, null, T);
const s = await p.evaluate(() => { const D = window.__dakar, a = D.estate().assets.filter(x => x.kind === 'vehicle'); return { assets: a, counters: Object.keys(D.state.data.counters).filter(k => k.startsWith('vehicle:')), wallet: D.state.data.wallet, ledger: D.state.data.ledger.length, info: D.car.info() }; });
check('the old owner holds the new car under the same asset (uid a77, paid 2 800 000, condition 80)', s.assets.length === 1 && s.assets[0].uid === 'a77' && s.assets[0].spec === 'compacte' && s.assets[0].condition === 80, JSON.stringify(s.assets));
check('the old id is gone from the counters and the parking spot moved to the new one', s.counters.every(k => !k.includes('clando')) && s.counters.includes('vehicle:compacte:x'), s.counters.join());
check('the wallet and the ledger are untouched', s.wallet === 777000 && s.ledger === old.ledger.length, `${s.wallet} / ${s.ledger}`);
check('the car is theirs, here, parked where it was left (Plateau, 115.7 / 97)', s.info.owned && s.info.here && s.info.asset?.paid === 2800000 && Math.abs(s.info.record.x - 115.7) < 0.01 && Math.abs(s.info.record.z - 97) < 0.01 && s.info.record.asset === 'compacte', JSON.stringify(s.info.record));
await p.evaluate(rec => { const D = window.__dakar; D.place(rec.x - 2.2, rec.z, Math.PI / 2); }, s.info.record);
await p.waitForFunction(() => window.__dakar.focus()?.name === 'Ta voiture', null, T).catch(() => {});
const f = await p.evaluate(() => window.__dakar.focus());
check('walking up to it offers « Monter (conducteur) »', f?.primary === 'Monter (conducteur)', JSON.stringify(f));
// the dealer: the old car is not sold, the new one is listed as theirs
await p.evaluate(({ d }) => { window.__dakar.place(d.x + 0.7, d.z + 0.4, -Math.PI / 2); }, { d: s.info.dealer });
await p.waitForFunction(() => /Ndiaye Auto/i.test(window.__dakar.focus()?.name ?? ''), null, T).catch(() => {});
await p.evaluate(() => window.__dakar.act()); await p.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
const items = await p.evaluate(() => [...document.querySelectorAll('#modal .item')].map(b => b.textContent ?? ''));
check('the dealer lists the Berline moderne (already theirs) and no « Voiture d’occasion »', items.some(t => /Berline moderne/.test(t)) && !items.some(t => /Voiture d’occasion/.test(t)), JSON.stringify(items.map(t => t.slice(0, 50))));
check('no page error', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'legacy car checks passed'); process.exit(failed ? 1 : 0);
