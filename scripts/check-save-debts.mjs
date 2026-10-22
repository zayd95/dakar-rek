// Debts, days and vehicles across clients that do not know them (docs/SAVES.md « Ce qu'un client plus ancien efface »): this build, the build before credit existed
// (PR #61, `feature/driving-2-20261021`: no `loans`, no `vtc`) and the build before the days and the run (PR #63, `feature/vehicles-economy-20261021`: no `play`,
// no `streak`, loans without their player-day clock) run on ONE origin, as an update, a rollback and a return would on a device.
//   1. this client: a Teranga financed by Pape Sarr (one installment repaid), a Jakarta bought cash, a run of three days, saved;
//   2. the PR #61 client opens it and saves (it drops what it does not know: the debt, the rides, the days);
//   3. this client again: the debt is back (from its own backup of those fields), exactly as it was, and the player is told so; the days and the run too;
//      the vehicles never left (an older client keeps assets it does not know, src/economy/assets.ts);
//   4. the PR #63 client opens it and saves (it keeps the debt, drops the days and the run);
//   5. this client again: the run and the days are back, the debt still exact.
// Usage: node scripts/check-save-debts.mjs <pr61-dist> <pr63-dist> <this-dist>
// Chromium + SwiftShader. Debug hooks: the dealer's `own()` and Pape Sarr's `sign()`/`pay()` (the purchase, the signature and a repayment themselves: the menus
// are journey C's), the trust and the run written as a save would hold them, reading state.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [d61, d63, dCur] = process.argv.slice(2);
if (!d61 || !d63 || !dCur) { console.error('usage: node scripts/check-save-debts.mjs <pr61-dist> <pr63-dist> <this-dist>'); process.exit(2); }
const ROOTS = { a: d61, b: d63, c: dCur };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const m = u.pathname.match(/^\/([abc])(\/.*)?$/);
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
  await p.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.moto, null, T);
  await p.waitForTimeout(2500); p.toasts = toasts; return p;
};
const save = p => p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
/** The save as it stands on the device (what the next client will read), not the page's memory. */
const stored = p => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('dakarrek.guest.save.v6') ?? 'null'); return s ? { guestId: s.guestId, wallet: s.wallet, assets: (s.assets?.list ?? []).map(a => `${a.spec}:${a.uid}:${a.how}:${a.paid}`).sort(), loans: s.loans ?? null, vtc: s.vtc ?? null, play: s.play ?? null, streak: s.streak ?? null } : null; });
const loanKey = l => l ? `${l.id}|${l.lender}|${l.kind}|${l.principal}|${l.paid}|${l.installment}|${l.status}|${l.asset}` : 'none';

const peeker = await ctx.newPage(); await peeker.goto(`${origin}/blank`);
await peeker.evaluate(() => localStorage.clear());

// 1 — this client: a financed Teranga, a Jakarta paid cash, three days worked
let p = await open('c', '&argent=400000&heure=11');
await p.evaluate(() => { const A = window.__dakar; A.state.data.rel['player|sarr'] = 45; A.moto.own(); });
await p.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
const signed = await p.evaluate(() => window.__dakar.sarr.sign(0));
await p.waitForFunction(() => window.__dakar.teranga.info().owned, null, { timeout: 60000 }).catch(() => {});
await p.evaluate(() => { window.__dakar.sarr.pay(10000); const s = window.__dakar.state.data; s.streak.run = 3; s.streak.best = 3; s.streak.last = s.play.day; s.streak.lastMs = s.playedMs; s.streak.total = 3; s.streak.seen = [2, 3]; });
await save(p); await p.waitForTimeout(800);
const s0 = await stored(p), loan0 = s0.loans?.list?.find(l => l.lender === 'sarr');
check('this client: a Teranga financed by Pape Sarr (10 000 F already repaid), a Jakarta bought cash, a run of 3 days; saved', signed === true && loan0 && loan0.paid >= 10000 && loan0.clock === 'play' && s0.assets.some(a => a.startsWith('teranga:')) && s0.assets.some(a => a.startsWith('jakarta:')) && s0.streak.run === 3, JSON.stringify({ signed, loan0, assets: s0.assets, streak: s0.streak }));
await p.close();

// 2 — the client before credit existed (PR #61) opens the save and writes it back
p = await open('a');
await save(p); await p.waitForTimeout(800);
const s1 = await stored(p);
check('the PR #61 client really drops what it does not know when it saves (the debt, the rides, the days): the risk this guards against', s1 && s1.loans === null && s1.streak === null, JSON.stringify({ loans: s1?.loans, streak: s1?.streak, play: s1?.play }));
check('… but it keeps the vehicles it does not know (the Teranga) and the wallet', JSON.stringify(s1.assets) === JSON.stringify(s0.assets), JSON.stringify(s1.assets));
await p.close();

// 3 — this client again: the debt and the days are back, exactly, and the player is told about the debt
p = await open('c');
await p.waitForTimeout(3500);
const g3 = await p.evaluate(() => ({ loans: window.__dakar.state.data.loans.list.map(l => ({ ...l })), streak: { ...window.__dakar.state.data.streak }, play: { ...window.__dakar.state.data.play }, credit: window.__dakar.credit.info() }));
const loan3 = g3.loans.find(l => l.lender === 'sarr');
check('back in this client: the Sarr credit is back, exactly as it was (amount, repaid, installment, the car it is against)', loanKey(loan3) === loanKey(loan0) && loan3.clock === 'play', JSON.stringify({ before: loanKey(loan0), after: loanKey(loan3) }));
check('… and the player is told, once, that their credits were found again', p.toasts.some(s => /crédits en cours ont été retrouvés/.test(s)), JSON.stringify(p.toasts.slice(0, 4)));
check('… the run of days is back (3 days) and the player\'s days with it', g3.streak.run === 3 && g3.play.day >= s0.play.day, JSON.stringify({ streak: g3.streak, play: g3.play }));
check('… the vehicles never left: the financed Teranga and the Jakarta, the same uids', JSON.stringify((await p.evaluate(() => window.__dakar.state.data.assets.list.map(a => `${a.spec}:${a.uid}:${a.how}:${a.paid}`).sort()))) === JSON.stringify(s0.assets));
await save(p); await p.waitForTimeout(800); await p.close();

// 4 — the PR #63 client (credit, no days) opens it and writes it back
p = await open('b');
await save(p); await p.waitForTimeout(800);
const s4 = await stored(p), loan4 = s4.loans?.list?.find(l => l.lender === 'sarr');
check('the PR #63 client keeps the debt but drops the days and the run when it saves', loan4 && loan4.principal === loan0.principal && s4.streak === null && s4.play === null, JSON.stringify({ loan4, streak: s4.streak, play: s4.play }));
await p.close();

// 5 — this client again: the run is back, the debt still exact
p = await open('c');
await p.waitForTimeout(3000);
const g5 = await p.evaluate(() => ({ loans: window.__dakar.state.data.loans.list.map(l => ({ ...l })), streak: { ...window.__dakar.state.data.streak }, assets: window.__dakar.state.data.assets.list.map(a => `${a.spec}:${a.uid}:${a.how}:${a.paid}`).sort() }));
const loan5 = g5.loans.find(l => l.lender === 'sarr');
check('back in this client after the PR #63 client: the run of 3 days is back, the debt exactly as it was, the vehicles all there', g5.streak.run === 3 && loanKey(loan5) === loanKey(loan0) && JSON.stringify(g5.assets) === JSON.stringify(s0.assets), JSON.stringify({ run: g5.streak.run, loan: loanKey(loan5) }));
await p.close();

check('no JavaScript error in any client', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(`${total - fails}/${total} passed`);
await browser.close(); server.close();
process.exit(fails ? 1 : 0);
