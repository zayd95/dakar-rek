// Save safety across the launch (docs/SAVES.md): the production build (schema v3, key `dakarrek.guest.save`) and the launch candidate
// (schema v5, key `dakarrek.guest.save.v5`) run on ONE origin, like a rollback and a return would on a device.
//   v3 → v5 migration, reload, rollback to the older client, return to v5, two and three tabs, New Game, an unreadable v5 save.
// Usage: npx vite build --outDir <prod-dist> in a checkout of the production branch, npx vite build --outDir <cand-dist> here, then
//   node scripts/check-save-compat.mjs <prod-dist> <cand-dist>
// Chromium + SwiftShader (CPU rendering).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [prodDir, candDir] = process.argv.slice(2);
if (!prodDir || !candDir) { console.error('usage: node scripts/check-save-compat.mjs <prod-dist> <cand-dist>'); process.exit(2); }
const LEGACY = 'dakarrek.guest.save', V5 = 'dakarrek.guest.save.v5', DONE = 'dakarrek.guest.save.legacy';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const m = u.pathname.match(/^\/([pc])(\/.*)?$/);
  if (u.pathname === '/blank') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>blank</title>'); return; }
  if (!m) { res.statusCode = 404; res.end(); return; }
  const root = path.resolve(m[1] === 'p' ? prodDir : candDir); let rel = decodeURIComponent(m[2] ?? '/'); if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel); if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
let fails = 0; const errors = [];
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, String(extra).slice(0, 260)); };
const open = async which => {
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`${which}: ${e.message}`));
  await p.goto(`${origin}/${which}/?debug`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 120000 }); await p.waitForTimeout(1500); return p;
};
const live = p => p.evaluate(() => { const d = window.__dakar.state.data; return { v: d.schemaVersion, wallet: d.wallet, flags: [...d.flags], guestId: d.guestId, counters: { ...d.counters } }; });
const edit = (p, wallet, flag) => p.evaluate(([w, f]) => { const d = window.__dakar.state.data; d.wallet = w; if (f && !d.flags.includes(f)) d.flags.push(f); }, [wallet, flag ?? null]);
const save = p => p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });   // what the game does when the page is hidden or closed
// one blank page stays open to read the storage: opening a page for each read would hide the game tabs, and a hidden tab saves
const peeker = await ctx.newPage(); await peeker.goto(`${origin}/blank`);
const peek = () => peeker.evaluate(([a, b, c]) => ({ legacy: localStorage.getItem(a), v5: localStorage.getItem(b), done: localStorage.getItem(c) }), [LEGACY, V5, DONE]);
const parse = s => (s ? JSON.parse(s) : null);

// 0 — the production build writes a v3 save
await peeker.evaluate(() => localStorage.clear());
let p = await open('p');
await p.evaluate(() => {
  const d = window.__dakar.state.data; d.counters = { ...d.counters, repas: 4, livraisons: 7 }; d.flags = [...new Set([...d.flags, 'met_ibou', 'beat_x'])]; d.rel = { 'player|ibou': 35 };
  d.beats = { intro: 'a' }; d.furniture = ['miroir', 'tapis']; d.playedMs = 987654; d.wrestler = { ngembColor: 'rouge', ngembPattern: 'uni', accessories: [] };
});
await edit(p, 12345); await save(p); await p.close();
const s0 = await peek(); const L0 = s0.legacy;
check('production wrote a v3 save under the legacy key, nothing under the v5 key', parse(L0)?.schemaVersion === 3 && parse(L0).wallet === 12345 && s0.v5 === null, `v${parse(L0)?.schemaVersion}`);

// 1 — the candidate migrates it
p = await open('c'); let st = await live(p);
check('candidate: v3 save carried over (wallet, flags, counters, guest id)', st.wallet === 12345 && st.flags.includes('met_ibou') && st.flags.includes('beat_x') && st.counters.repas === 4 && st.counters.livraisons === 7 && st.guestId === parse(L0).guestId, JSON.stringify(st).slice(0, 200));
check('candidate: runs the save as schema 5', st.v === 5, `v${st.v}`);
const s1a = await peek();
check('candidate: v5 key written at migration (before any autosave) and marked migrated', parse(s1a.v5)?.schemaVersion === 5 && s1a.done === 'migrated', `${s1a.done}`);
await save(p); await p.close();
const s1 = await peek();
check('candidate: the original v3 save is byte-identical', s1.legacy === L0);
check('candidate: v5 key holds the migrated progress', parse(s1.v5)?.wallet === 12345 && parse(s1.v5).flags.includes('met_ibou') && JSON.stringify(parse(s1.v5).assets).includes('tapis'));

// 2 — reload, then progress on v5
p = await open('c'); st = await live(p);
check('reload: same progress from the v5 key', st.wallet === 12345 && st.v === 5, JSON.stringify(st).slice(0, 120));
await edit(p, 20000, 'v5_progress'); await save(p); await p.close();
const V5a = (await peek()).v5;
check('v5 progress saved', parse(V5a).wallet === 20000 && parse(V5a).flags.includes('v5_progress'));

// 3 — rollback: the production build is served again
p = await open('p'); st = await live(p);
check('rollback: the older client opens the original v3 save (its own, not a new game)', st.v === 3 && st.wallet === 12345 && st.guestId === parse(L0).guestId, JSON.stringify(st).slice(0, 120));
await edit(p, 777); await save(p); await p.close();
const s3 = await peek();
check('rollback: the older client changed only its own key', s3.v5 === V5a && parse(s3.legacy).wallet === 777 && parse(s3.legacy).schemaVersion === 3, `legacy wallet ${parse(s3.legacy)?.wallet}`);

// 4 — return to v5
p = await open('c'); st = await live(p);
check('return to v5: the v5 progress is intact (not the older client\'s)', st.wallet === 20000 && st.flags.includes('v5_progress') && st.v === 5, JSON.stringify(st).slice(0, 120));
await save(p); await p.close();
const s4 = await peek();
check('return to v5: the candidate does not touch the older client\'s save', s4.legacy === s3.legacy);

// 5 — several tabs
// (between two v5 tabs the last writer wins, as it always did: a tab that hides saves what it holds. The older client has its own key.)
const A = await open('c'); const B = await open('c');
check('two v5 tabs open together: both load the v5 progress', (await live(A)).wallet === 20000 && (await live(B)).wallet === 20000);
await edit(A, 30000); await save(A);
check('a v5 tab saves into the v5 key', parse((await peek()).v5)?.wallet === 30000);
const D = await open('p');   // an older client opens in another tab while the v5 tabs are still alive
check('an older-client tab opens its own v3 save beside the v5 tabs', (await live(D)).v === 3 && (await live(D)).wallet === 777);
const v5BeforeD = (await peek()).v5;
await edit(D, 888); await save(D); await D.waitForTimeout(500);
const s5 = await peek();
check('the older-client tab left the v5 save alone', s5.v5 === v5BeforeD && parse(s5.legacy).wallet === 888, `v5 wallet ${parse(s5.v5)?.wallet}`);
const legacy5 = s5.legacy;
await edit(B, 41000); await save(B); await save(A);   // both v5 tabs save again (the last one wins)
const s5b = await peek();
check('v5 tabs saving later never touch the older client\'s save', s5b.legacy === legacy5);
check('the v5 save is still a valid v5 save', parse(s5b.v5)?.schemaVersion === 5 && [30000, 41000].includes(parse(s5b.v5).wallet), `wallet ${parse(s5b.v5)?.wallet}`);
for (const x of [A, B, D]) await x.close();
await peeker.waitForTimeout(500);   // closing a tab may save once more
const stored = parse((await peek()).v5);
const Cc = await open('c'); const ccLive = await live(Cc);
check('a tab opened afterwards loads the v5 save as it is stored', ccLive.v === 5 && ccLive.wallet === stored.wallet && ccLive.guestId === stored.guestId, `${ccLive.wallet} vs ${stored.wallet}`);
await Cc.close();

// 6 — New Game on v5: the v5 save goes, the older save is not brought back, and stays for an older client
p = await open('c'); const legacyBeforeNew = (await peek()).legacy;
await p.keyboard.press('Escape'); await p.locator('[data-app="reglages"]').first().click(); await p.locator('[data-act="new"]').click(); await p.locator('[data-act="wipe"]').click();
await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 120000 }); await p.waitForTimeout(1500);
st = await live(p);
check('New Game: a fresh game (3000 F), not the older save', st.wallet === 3000 && st.v === 5 && !st.flags.includes('v5_progress') && st.guestId !== parse(L0).guestId, JSON.stringify(st).slice(0, 140));
const s6a = await peek();
check('New Game: the older save is untouched, marked as declined', s6a.legacy === legacyBeforeNew && s6a.done === 'declined');
await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 120000 }); await p.waitForTimeout(1500);
const again = await live(p);
check('New Game then reload: still the new game (the older save does not come back)', again.wallet === 3000 && again.guestId === st.guestId, JSON.stringify(again).slice(0, 120));
await save(p); await p.close();
p = await open('p');
check('New Game then rollback: the older client still has its save', (await live(p)).wallet === 888);
await p.close();

// 7 — an unreadable v5 save is not replaced by the older one
await peeker.evaluate(([k]) => localStorage.setItem(k, '{oops'), [V5]);
p = await open('c'); st = await live(p);
check('unreadable v5 save: a new game, the older save is not resurrected', st.wallet === 3000 && st.v === 5, JSON.stringify(st).slice(0, 100));
await p.close();

check('no page errors in any tab', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); server.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0);
