// Purchased vehicles across the vehicles-economy update (docs/vehicles/ECONOMY.md § 8): the build before it (PR #61, `feature/driving-2-20261021`) and this one run on
// ONE origin, as an update, a rollback and a return would on a device. The older client buys four vehicles in their dealerships (the sedan at the Plateau, the
// berline and the 4 × 4 at the Almadies, the Jakarta at Pikine) and saves; this client loads that save: every vehicle kept (same asset uid, paid price, parking
// spot, paint), standing where it was left, no debt, no ride, the wallet unchanged; reload; rollback to the older client and back.
// Usage: `npx vite build --outDir <old-dist>` in a checkout of the older commit and `npx vite build --outDir <cur-dist>` here, then
//   node scripts/check-save-vehicles.mjs <old-dist> <cur-dist>
// Chromium + SwiftShader (CPU rendering). Debug hooks: teleport, the dealers' `own()` (the purchase itself), reading state.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [oldDir, curDir] = process.argv.slice(2);
if (!oldDir || !curDir) { console.error('usage: node scripts/check-save-vehicles.mjs <old-dist> <cur-dist>'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const m = u.pathname.match(/^\/([oc])(\/.*)?$/);
  if (u.pathname === '/blank') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>blank</title>'); return; }
  if (!m) { res.statusCode = 404; res.end(); return; }
  const root = path.resolve(m[1] === 'o' ? oldDir : curDir); let rel = decodeURIComponent(m[2] ?? '/'); if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel); if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
let fails = 0, total = 0; const errors = [];
const check = (name, ok, extra = '') => { total++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(extra).slice(0, 400)}`); };
const T = { timeout: 300000 };
const KEYS = { car: 'plateau', berline: 'almadies', suv: 'almadies', moto: 'pikine' };
const open = async (which, q = '') => {
  const p = await ctx.newPage(); p.setDefaultTimeout(300000); p.on('pageerror', e => errors.push(`${which}: ${e.message}`));
  await p.goto(`${origin}/${which}/?debug&touch${q}`, { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(k => window.__dakar?.pos?.().hub && k.every(x => window.__dakar[x]), Object.keys(KEYS), T);
  await p.waitForTimeout(1500); return p;
};
const go = async (p, hub) => {
  if ((await p.evaluate(() => window.__dakar.pos().hub)) !== hub) { await p.evaluate(h => window.__dakar.teleport(h), hub); await p.waitForFunction(h => window.__dakar.pos().hub === h, hub, T); }
  await p.waitForTimeout(2500);
};
const save = p => p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
/** What the save says about the player's vehicles (and the new fields). */
const garage = p => p.evaluate(keys => {
  const A = window.__dakar, d = A.state.data;
  const veh = Object.fromEntries(keys.map(k => { const i = A[k].info(); return [k, { owned: i.owned, uid: i.asset?.uid ?? null, spec: i.asset?.spec ?? null, how: i.asset?.how ?? null, paid: i.asset?.paid ?? null, record: i.record ? { hub: i.record.hub, x: +i.record.x.toFixed(2), z: +i.record.z.toFixed(2), yaw: +i.record.yaw.toFixed(2) } : null, paint: i.paint ?? null }]; }));
  return { v: d.schemaVersion, wallet: A.state.wallet, assets: d.assets.list.map(a => `${a.spec}:${a.uid}:${a.how}:${a.paid}`).sort(), veh, loans: d.loans ?? null, vtc: d.vtc ?? null };
}, Object.keys(KEYS));
/** In each vehicle's district: the vehicle stands there, where its record says. */
const standing = async p => {
  const out = {};
  for (const hub of ['plateau', 'almadies', 'pikine']) {
    await go(p, hub);
    for (const [k, h] of Object.entries(KEYS)) if (h === hub) {
      await p.waitForFunction(x => window.__dakar[x].info().here, k, { timeout: 60000 }).catch(() => {});
      out[k] = await p.evaluate(x => { const i = window.__dakar[x].info(); return { here: i.here, x: +i.x.toFixed(2), z: +i.z.toFixed(2), rec: i.record ? [+i.record.x.toFixed(2), +i.record.z.toFixed(2)] : null }; }, k);
    }
  }
  return out;
};
const sameVehicles = (a, b) => Object.keys(KEYS).every(k => a.veh[k].owned && b.veh[k].owned && a.veh[k].uid === b.veh[k].uid && a.veh[k].spec === b.veh[k].spec && a.veh[k].how === b.veh[k].how && a.veh[k].paid === b.veh[k].paid && JSON.stringify(a.veh[k].record) === JSON.stringify(b.veh[k].record) && a.veh[k].paint === b.veh[k].paint);
const allHere = s => Object.values(s).every(v => v.here && v.rec && Math.hypot(v.x - v.rec[0], v.z - v.rec[1]) < 0.3);

const peeker = await ctx.newPage(); await peeker.goto(`${origin}/blank`);
await peeker.evaluate(() => localStorage.clear());

// 1 — the older client: four vehicles bought in their own dealerships, saved
let p = await open('o', '&argent=200000000&heure=11');
for (const hub of ['plateau', 'almadies', 'pikine']) {
  await go(p, hub);
  for (const [k, h] of Object.entries(KEYS)) if (h === hub) {
    await p.evaluate(x => window.__dakar[x].own(), k);
    await p.waitForFunction(x => window.__dakar[x].info().owned, k, { timeout: 60000 }).catch(() => {});
  }
}
await p.waitForTimeout(1500);
const g0 = await garage(p); await save(p); await p.waitForTimeout(800);
check('the older client: four vehicles bought and saved (sedan, berline, 4 × 4, Jakarta)', Object.values(g0.veh).every(v => v.owned && v.uid && v.record), JSON.stringify(g0.veh));
await p.close();

// 2 — this client opens the same save
p = await open('c');
const g1 = await garage(p);
check('this client: every vehicle kept (same asset uid, spec, price paid, parking spot, paint)', sameVehicles(g0, g1), JSON.stringify({ before: g0.assets, after: g1.assets }));
check('… the same assets, nothing added, nothing lost; the wallet unchanged', JSON.stringify(g0.assets) === JSON.stringify(g1.assets) && g0.wallet === g1.wallet, JSON.stringify({ w0: g0.wallet, w1: g1.wallet }));
check('… no debt and no ride appear (the new save fields start empty)', (g1.loans?.list?.length ?? 0) === 0 && !g1.vtc?.active && (g1.vtc?.trips ?? 0) === 0, JSON.stringify({ loans: g1.loans, vtc: g1.vtc }));
const s1 = await standing(p);
check('… and each one stands in its district, where it was left', allHere(s1), JSON.stringify(s1));
await save(p); await p.waitForTimeout(800); await p.close();

// 3 — reloaded in this client
p = await open('c');
const g2 = await garage(p);
check('reloaded in this client: the same vehicles', sameVehicles(g0, g2) && JSON.stringify(g0.assets) === JSON.stringify(g2.assets), JSON.stringify(g2.assets));
await save(p); await p.waitForTimeout(800); await p.close();

// 4 — rollback to the older client, then back
p = await open('o');
const g3 = await garage(p);
check('rolled back to the older client: it still reads the save, the vehicles all there', sameVehicles(g0, g3), JSON.stringify(g3.assets));
await save(p); await p.waitForTimeout(800); await p.close();
p = await open('c');
const g4 = await garage(p), s4 = await standing(p);
check('back in this client after the rollback: the vehicles all there, standing where they were left', sameVehicles(g0, g4) && allHere(s4), JSON.stringify(s4));
await p.close();

check('no JavaScript error in either client', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`${total - fails}/${total} passed`);
await browser.close(); server.close();
process.exit(fails ? 1 : 0);
