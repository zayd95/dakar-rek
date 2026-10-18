// The v6 save in two real clients on ONE origin (docs/SAVES.md): the schema-5 client (the build served before) and the current one.
//   v5 → v6 migration, a tour half done (first stop ridden and paid for real), rollback to the schema-5 client, return, the second
//   stop paid once, reload, New Game, an unreadable v6 save.
// Usage: build both (a checkout of the schema-5 commit, e.g. 2c82709, and this one: `npx vite build --outDir <dir>`), then
//   node scripts/check-save-v6.mjs <v5-dist> <current-dist>
// Chromium + SwiftShader. The game is paused and stepped for the ride (scripts/m1b-tour/rider.mjs): game seconds, not wall time.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { mountAt, ride } from './m1b-tour/rider.mjs';

const [oldDir, curDir] = process.argv.slice(2);
if (!oldDir || !curDir) { console.error('usage: node scripts/check-save-v6.mjs <v5-dist> <current-dist>'); process.exit(2); }
const paths = JSON.parse(fs.readFileSync(new URL('./m1b-tour/paths.json', import.meta.url), 'utf8'));
const V6 = 'dakarrek.guest.save.v6', V5 = 'dakarrek.guest.save.v5', LEGACY = 'dakarrek.guest.save', DONE = 'dakarrek.guest.save.legacy', IMPORT = 'dakarrek.guest.save.v6.import';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.jpg': 'image/jpeg' };
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
let fails = 0; const errors = [];
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, String(extra).slice(0, 300)); };
const T = { timeout: 180000 };
const open = async which => {
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`${which}: ${e.message}`));
  await p.goto(`${origin}/${which}/?debug`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, T);
  if (which === 'c') await p.waitForFunction(() => window.__dakar.tiak && window.__dakar.tourOffer, null, T);
  await p.waitForTimeout(1500); return p;
};
const live = p => p.evaluate(() => { const d = window.__dakar.state.data; return { v: d.schemaVersion, wallet: d.wallet, flags: [...d.flags], guestId: d.guestId, counters: { ...d.counters }, rel: { ...d.rel }, wrestler: d.wrestler, assets: d.assets.list.map(a => a.spec), active: d.jobs.active ? JSON.parse(JSON.stringify(d.jobs.active)) : null, done: [...d.jobs.done], ledger: d.ledger.map(e => `${e.label}|${e.amount}`) }; });
const save = p => p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
const peeker = await ctx.newPage(); await peeker.goto(`${origin}/blank`);
const peek = () => peeker.evaluate(([a, b, c, d, e]) => ({ v6: localStorage.getItem(a), v5: localStorage.getItem(b), legacy: localStorage.getItem(c), done: localStorage.getItem(d), imp: localStorage.getItem(e) }), [V6, V5, LEGACY, DONE, IMPORT]);
const parse = s => (s ? JSON.parse(s) : null);

/** Rides the leg of the running tour along its measured path until the stop is handed over (the tour moves on). */
const rideLeg = async (p, key) => {
  const route = paths[key].path;
  await mountAt(p, route);
  await p.evaluate(() => { window.__legStart = window.__dakar.tourState()?.leg ?? -1; });
  return ride(p, route, { style: 'clavier', maxS: 90, arrive: 0, until: () => { const t = window.__dakar.tourState(); return !t || t.leg !== window.__legStart; } });
};
const ready = p => p.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
const waitPikine = p => p.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.tiak.at() && window.__dakar.tourOffer().length > 0, null, T);

// 0 — the schema-5 client writes a v5 save with a bit of everything
await peeker.evaluate(() => localStorage.clear());
let p = await open('o');
await p.evaluate(() => {
  const d = window.__dakar.state.data; d.wallet = 41250; d.playedMs = 3_600_000; d.needs.energie = 95; d.needs.faim = 90;
  d.counters = { ...d.counters, livraisons: 9, chats: 5 }; d.flags = [...new Set([...d.flags, 'met_ibou', 'reco_modou'])]; d.rel = { 'ibou|player': 22, 'ablaye|player': 35 };
  d.wrestler = { ngembColor: 'rouge', ngembPattern: 'uni', accessories: ['echarpe_baobab'] }; d.hub = 'pikine';
});
const o0 = await live(p); await save(p); await p.close();
const s0 = await peek(); const V5bytes = s0.v5;
check('the schema-5 client wrote a v5 save under the v5 key, nothing under v6', parse(s0.v5)?.schemaVersion === 5 && parse(s0.v5).wallet === 41250 && s0.v6 === null, `v${parse(s0.v5)?.schemaVersion}`);

// 1 — the current client migrates it
p = await open('c'); await ready(p); await waitPikine(p);
let st = await live(p);
check('current: runs the save as schema 6, nothing lost (wallet, flags, relationships, wrestler, assets, counters, guest id)',
  st.v === 6 && st.wallet === 41250 && st.flags.includes('met_ibou') && st.flags.includes('reco_modou') && st.rel['ibou|player'] === 22 && st.rel['ablaye|player'] === 35
  && st.wrestler.ngembColor === 'rouge' && st.wrestler.accessories.includes('echarpe_baobab') && st.counters.livraisons === 9 && st.counters.chats === 5 && st.guestId === o0.guestId && st.assets.join() === o0.assets.join(), JSON.stringify(st).slice(0, 200));
const s1 = await peek();
check('current: v6 key written at once, the v5 key untouched byte for byte, no marker of the v5 client written', parse(s1.v6)?.schemaVersion === 6 && s1.v5 === V5bytes && s1.done === null && s1.imp === null, `${s1.done}`);

// 2 — a tour: accepted, the first stop ridden for real and paid; the second one pending
await p.evaluate(() => { const d = window.__dakar.state.data; d.needs.energie = 95; d.needs.faim = 90; });
const accepted = await p.evaluate(() => { const o = window.__dakar.tourOffer()[0]; return window.__dakar.acceptTour(o.id, 0); });
check('the tour is accepted (bank first)', !!accepted?.tour && accepted.tour.order[0] === 0, JSON.stringify(accepted?.tour ?? null).slice(0, 120));
const w0 = (await live(p)).wallet;
const r1 = await rideLeg(p, 'pickup>agence');
let mid = await live(p); const tsMid = await p.evaluate(() => window.__dakar.tourState());
check('the first stop is handed over: paid once, the tour is on its second leg, trust moved, the clock runs', r1.ok && mid.active?.tour?.leg === 1 && mid.active.tour.departed === true && mid.wallet > w0 && Object.keys(mid.counters).some(k => k.startsWith('tiak_trust_') || k.startsWith('tiak_ok_') || k.startsWith('tiak_late_')) && mid.ledger.filter(l => l.startsWith('Tournée')).length === 1, JSON.stringify({ r: r1, wallet: mid.wallet, w0, ts: tsMid }).slice(0, 260));
await save(p); await p.close();
const s2 = await peek(); const V6mid = s2.v6;
check('the v6 save holds the half-done tour (leg 2, departed, limits and pay frozen), the wallet with the first stop', parse(V6mid).jobs.active?.tour?.leg === 1 && parse(V6mid).wallet === mid.wallet && s2.v5 === V5bytes);

// 3 — rollback: the schema-5 client is served again
p = await open('o'); st = await live(p);
check('rollback: the schema-5 client opens ITS save (before the tour), not a new game, no active job', st.v === 5 && st.wallet === 41250 && st.active === null && st.guestId === o0.guestId, JSON.stringify(st).slice(0, 140));
await p.evaluate(() => { const d = window.__dakar.state.data; d.wallet = 1234; d.flags.push('played_on_v5'); });
await save(p); await p.waitForTimeout(500); await p.close();
const s3 = await peek();
check('rollback: the older client changed only its own key — the v6 save is byte-identical, the tour untouched', s3.v6 === V6mid && s3.v5 !== V5bytes && parse(s3.v5).wallet === 1234, `v6 same: ${s3.v6 === V6mid}`);

// 4 — return to v6: the tour is where it was left; finish it
p = await open('c'); await ready(p); await waitPikine(p); st = await live(p);
check('return: the wallet, the half-done tour, the trust and the ledger are exactly as left (nothing from the older client)', st.v === 6 && st.wallet === mid.wallet && !st.flags.includes('played_on_v5') && JSON.stringify(st.active) === JSON.stringify(mid.active) && JSON.stringify(st.counters) === JSON.stringify(mid.counters) && st.ledger.join() === mid.ledger.join(), JSON.stringify({ w: st.wallet, mid: mid.wallet, leg: st.active?.tour?.leg }));
const wBack = st.wallet;
const r2 = await rideLeg(p, 'agence>dames');
const fin = await live(p);
const gained = fin.wallet - wBack, lines = fin.ledger.filter(l => l.startsWith('Tournée'));
check('the second stop and the bonus are paid once, the run is closed, the first stop is not paid again', r2.ok && fin.active === null && fin.done.length === st.done.length + 1 && gained > 0 && lines.length === 3 && lines.filter(l => /bonus/.test(l)).length === 1 && fin.counters.tournees === 1, JSON.stringify({ gained, lines, done: fin.done.length }));
await save(p); await p.close();
const s4 = await peek();
p = await open('c'); const rel = await live(p);
check('reload after the tour: same wallet, no second payment, the run stays closed', rel.wallet === fin.wallet && rel.active === null && rel.ledger.filter(l => l.startsWith('Tournée')).length === 3 && parse(s4.v6).wallet === fin.wallet, JSON.stringify({ w: rel.wallet, fin: fin.wallet }));
await p.close();
const s4b = await peek();
check('the v5 key is still only what the older client wrote', s4b.v5 === s3.v5);

// 5 — New Game on v6: only v6 goes; the v5 save does not come back and stays for the older client
p = await open('c');
await p.keyboard.press('Escape'); await p.locator('[data-app="reglages"]').first().click(); await p.locator('[data-act="new"]').click(); await p.locator('[data-act="wipe"]').click();
await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, T); await p.waitForTimeout(1500);
st = await live(p);
check('New Game: a fresh game (3000 F), not the v5 save', st.wallet === 3000 && st.v === 6 && st.guestId !== o0.guestId, JSON.stringify(st).slice(0, 120));
const s5 = await peek();
check('New Game: the v5 save is untouched, the import marked declined', s5.v5 === s3.v5 && s5.imp === 'declined');
await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, T); await p.waitForTimeout(1500);
const again = await live(p);
check('New Game then reload: still the new game (the older save does not come back)', again.wallet === 3000 && again.guestId === st.guestId);
await save(p); await p.close();
p = await open('o');
check('New Game then rollback: the schema-5 client still has its own save', (await live(p)).wallet === 1234);
await p.close();

// 6 — an unreadable v6 save is not replaced by the v5 one
await peeker.evaluate(([k]) => localStorage.setItem(k, '{oops'), [V6]);
p = await open('c'); st = await live(p);
check('unreadable v6 save: a new game, the v5 save is not resurrected', st.wallet === 3000 && st.v === 6, JSON.stringify(st).slice(0, 100));
await p.close();

check('no page errors in any tab', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); server.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0);
