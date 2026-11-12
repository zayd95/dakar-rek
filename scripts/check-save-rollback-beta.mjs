// The beta's saves across a rollback (docs/SAVES.md « What an older v6 client erases »): this build and the polish-pass build before the character studio
// (PR #64, `feature/vehicles-polish-20261021`: no `appearance`, no family-room choice) run on ONE origin, as an update, a rollback and a return would on a device.
//   1. this client: the Cité Jàmm house as the principal residence, three pieces (one turned), the Teranga parked beside it, « Ma chambre » given back, a look;
//   2. the PR #64 client opens it and saves (it drops the look; it keeps the rest: assets, flags and counters are generic);
//   3. this client again: the look is back from its own backup, the house, furniture, car and family-room choice untouched, the older client's wallet kept.
// Usage: node scripts/check-save-rollback-beta.mjs <pr64-dist> <this-dist>
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dOld, dCur] = process.argv.slice(2);
if (!dOld || !dCur) { console.error('usage: node scripts/check-save-rollback-beta.mjs <pr64-dist> <this-dist>'); process.exit(2); }
const ROOTS = { a: dOld, c: dCur };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const m = u.pathname.match(/^\/([ac])(\/.*)?$/);
  if (u.pathname === '/blank') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>blank</title>'); return; }
  if (!m) { res.statusCode = 404; res.end(); return; }
  const root = path.resolve(ROOTS[m[1]]); let rel = decodeURIComponent(m[2] ?? '/'); if (rel.endsWith('/')) rel += 'index.html';
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
const open = async (which, q = '') => {
  const p = await ctx.newPage(); p.setDefaultTimeout(300000); p.on('pageerror', e => errors.push(`${which}: ${e.message}`));
  const toasts = []; await p.exposeFunction('__toastSeen', s => toasts.push(s));
  await p.addInitScript(() => { new MutationObserver(() => { const e = document.querySelector('#toast'); if (e?.textContent) window.__toastSeen?.(e.textContent); }).observe(document, { subtree: true, childList: true, characterData: true }); });
  await p.goto(`${origin}/${which}/?debug&touch${q}`, { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate && window.__dakar.teranga, null, T);
  await p.waitForTimeout(2500); p.toasts = toasts; return p;
};
const save = p => p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });

const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('dakarrek.guest.save.v6') ?? 'null'));
const homeOf = s => s && s.assets.list.find(a => a.uid === s.assets.home)?.spec;
const piecesOf = (s, uid) => s.assets.list.filter(a => a.home === uid).map(a => `${a.spec}@${a.at ? `${a.at.x},${a.at.z},${a.at.rot}` : 'rangé'}`).sort();
const LOOK = { skin: 2, hair: 'afro', outfit: 1, color: 3 };

const peeker = await ctx.newPage(); await peeker.goto(`${origin}/blank`);
await peeker.evaluate(() => localStorage.clear());

// 1 — this client: the Cité Jàmm house as the principal residence, furnished (one piece turned), the Teranga parked beside it, the room given back, a look
let p = await open('c', '&argent=200000000&heure=11');
await p.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await p.evaluate(() => window.__dakar.teranga.own());
await p.waitForFunction(() => window.__dakar.teranga.info().record?.hub === 'pikine', null, T);
await p.evaluate(look => {
  const A = window.__dakar, d = A.state.data;
  A.buyAsset('maison_cite'); A.moveIn('maison_cite');
  for (const id of ['canape_wax', 'table_basse', 'lit_bois']) A.buyPiece(id);
  const house = d.assets.list.find(a => a.spec === 'maison_cite'), piece = d.assets.list.find(a => a.home === house.uid && a.at);
  piece.at.rot = (piece.at.rot + 3) % 4;
  Object.assign(d.counters, { 'vehicle:teranga:x': -26, 'vehicle:teranga:z': -92, 'vehicle:teranga:yaw': 0 });   // the hub counter stays the one the delivery wrote (Pikine)
  d.flags.push('chambre:rendue');
  d.appearance = look;
}, LOOK);
await save(p); await p.waitForTimeout(800);
const s0 = await stored(p), house = s0.assets.list.find(a => a.spec === 'maison_cite');
check('this client: the house is the principal residence, furnished, the car parked by it, the room given back, a look chosen; saved', homeOf(s0) === 'maison_cite' && piecesOf(s0, house.uid).length === 3 && s0.counters['vehicle:teranga:x'] === -26 && s0.flags.includes('chambre:rendue') && JSON.stringify(s0.appearance) === JSON.stringify(LOOK),
  JSON.stringify({ home: homeOf(s0), pieces: piecesOf(s0, house.uid), appearance: s0.appearance }));
await p.close();

// 2 — the PR #64 client (before the character studio) is served again: it opens the save and writes it back
p = await open('a', '&heure=11');
const old = await p.evaluate(() => ({ home: window.__dakar.estate().home }));
check('the PR #64 client opens it: the house is its principal residence there too', old.home === 'maison_cite', JSON.stringify(old));
await p.evaluate(() => { window.__dakar.state.addMoney?.(1234, 'test') ?? (window.__dakar.state.data.wallet += 1234); });
await save(p); await p.waitForTimeout(800);
const s1 = await stored(p);
check('the PR #64 client really drops the look when it saves (the risk this guards against)', s1 && s1.appearance === undefined, JSON.stringify({ appearance: s1?.appearance }));
check('… and keeps the house, the residence, every piece where it stood, the parked car, the room given back', homeOf(s1) === 'maison_cite' && JSON.stringify(piecesOf(s1, house.uid)) === JSON.stringify(piecesOf(s0, house.uid)) && s1.counters['vehicle:teranga:x'] === -26 && s1.flags.includes('chambre:rendue'),
  JSON.stringify({ home: homeOf(s1), pieces: piecesOf(s1, house.uid), flags: s1.flags.slice(-2) }));
await p.close();

// 3 — this client again: the look comes back from its own backup; what the older client did (its wallet) is kept; everything else as it was
p = await open('c', '&heure=11');
await p.waitForTimeout(2500);
const g = await p.evaluate(() => { const A = window.__dakar, d = A.state.data; return { home: A.estate().home, appearance: d.appearance, wallet: d.wallet, flags: d.flags, car: A.teranga.info().record, owned: A.teranga.info().owned }; });
await save(p); await p.waitForTimeout(800);
const s2 = await stored(p);
check('back in this client: the look is back, exactly', JSON.stringify(g.appearance) === JSON.stringify(LOOK), JSON.stringify(g.appearance));
check('… the house, every piece and its turn, the car where it was parked, the room given back', g.home === 'maison_cite' && JSON.stringify(piecesOf(s2, house.uid)) === JSON.stringify(piecesOf(s0, house.uid)) && g.owned && g.car && g.car.hub === 'pikine' && g.car.x === -26 && g.car.z === -92 && g.flags.includes('chambre:rendue'),
  JSON.stringify({ home: g.home, car: g.car, pieces: piecesOf(s2, house.uid) }));
check('… and the money the older client counted is kept (nothing rewound)', g.wallet === s1.wallet, `${s1.wallet} → ${g.wallet}`);
check('no JavaScript errors', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
console.log(`${total - fails}/${total} passed`);
process.exit(fails ? 1 : 0);
