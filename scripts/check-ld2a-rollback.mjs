// LD2.0-A saves across a rollback (docs/MONEY.md « The save »): this build and the unified beta's (PR #65, which knows nothing of the savings, the
// bana-bana table's own state or « Mes pistes ») run on ONE origin, as an update, a rollback and a return would on a device.
//   1. this client: an Épargne Teranga account with 30 000 F, the bana-bana table bought, a lead set aside;
//   2. the PR #65 client opens it, earns 1 000 F and saves (it rebuilds the save without `bank`, `bana` and `pistes`, and rewrites its two backups);
//   3. this client again: the savings, the table and the lead are back from the third backup, the older client's wallet kept: nothing lost, nothing twice.
// Usage: node scripts/check-ld2a-rollback.mjs <pr65-dist> <this-dist>
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dOld, dCur] = process.argv.slice(2);
if (!dOld || !dCur) { console.error('usage: node scripts/check-ld2a-rollback.mjs <pr65-dist> <this-dist>'); process.exit(2); }
const ROOTS = { a: dOld, c: dCur };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const m = u.pathname.match(/^\/([ac])(\/.*)?$/);
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
const open = async (which, q = '') => {
  const p = await ctx.newPage(); p.setDefaultTimeout(300000); p.on('pageerror', e => errors.push(`${which}: ${e.message}`));
  await p.goto(`${origin}/${which}/?debug&touch${q}`, { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate, null, { timeout: 300000 });
  await p.waitForTimeout(2500); return p;
};
const save = p => p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
const stored = p => p.evaluate(() => JSON.parse(localStorage.getItem('dakarrek.guest.save.v6') ?? 'null'));

try {
  // 1 — this client: savings, the table, a lead set aside
  let p = await open('c', '&argent=120000&heure=11');
  await p.waitForFunction(() => window.__dakar.bank && window.__dakar.bana?.().at && window.__dakar.pistes, null, { timeout: 300000 });
  const mine = await p.evaluate(() => {
    const D = window.__dakar, d = D.state.data;
    d.bank.opened = d.play.day;                                                       // (the account opened, as the counter does: src/economy/bank.ts openAccount)
    const dep = D.bank.replay('deposit', 30000, 'rollback-check-1');
    D.buyVenture('bana');
    d.needs.social = 20; d.counters.livraisons = 3;
    const lead = D.pistes.list()[0]; if (lead) D.pistes.drop(lead.id);
    return { dep, lead: lead?.id ?? null };
  });
  await p.waitForFunction(() => window.__dakar.bana().owned && window.__dakar.state.data.bana.since >= 0, null, { timeout: 60000 });   // the table set up (next frame)
  Object.assign(mine, await p.evaluate(() => { const D = window.__dakar, d = D.state.data; return { wallet: d.wallet, bank: JSON.parse(JSON.stringify(d.bank)), bana: JSON.parse(JSON.stringify(d.bana)), pistes: JSON.parse(JSON.stringify(d.pistes)), units: D.business().owned.bana ?? 0 }; }));
  await save(p); await p.waitForTimeout(500);
  const s1 = await stored(p);
  check('1. this client saved 30 000 F of savings, the table and a lead set aside', mine.dep?.ok !== false && s1.bank.savings === 30000 && s1.bana.since >= 0 && mine.units === 1 && !!mine.lead && s1.pistes.off[mine.lead], JSON.stringify({ dep: mine.dep, savings: s1.bank.savings, since: s1.bana.since, units: mine.units, lead: mine.lead }));
  await p.close();

  // 2 — the PR #65 client: opens the same save, earns 1 000 F, saves
  p = await open('a', '&heure=11');
  const old = await p.evaluate(() => { window.__dakar.giveMoney(1000); return { wallet: window.__dakar.state.wallet, bana: window.__dakar.business().owned.bana ?? 0 }; });
  await save(p); await p.waitForTimeout(500);
  const s2 = await stored(p);
  check('2. the PR #65 client keeps the venture unit (assets are generic), earns 1 000 F, and saves without the fields it does not know', old.bana === 1 && s2.wallet === mine.wallet + 1000 && s2.bank === undefined && s2.bana === undefined && s2.pistes === undefined, JSON.stringify({ old, wallet: s2.wallet, bank: s2.bank === undefined, bana: s2.bana === undefined, pistes: s2.pistes === undefined }));
  await p.close();

  // 3 — this client again
  p = await open('c', '&heure=11');
  await p.waitForFunction(() => window.__dakar.bank && window.__dakar.bana?.().at, null, { timeout: 300000 });
  const back = await p.evaluate(() => { const d = window.__dakar.state.data; return { wallet: d.wallet, bank: JSON.parse(JSON.stringify(d.bank)), bana: JSON.parse(JSON.stringify(d.bana)), pistes: JSON.parse(JSON.stringify(d.pistes)), units: window.__dakar.business().owned.bana ?? 0, owned: window.__dakar.bana().owned }; });
  check('3a. the savings are back exactly (balance, history, refs), the older client\'s wallet kept: wallet + savings = what the player had + the 1 000 F earned', back.bank.savings === 30000 && JSON.stringify(back.bank.tx) === JSON.stringify(mine.bank.tx) && back.wallet === mine.wallet + 1000 && back.wallet + back.bank.savings === mine.wallet + 30000 + 1000, JSON.stringify({ wallet: back.wallet, savings: back.bank.savings }));
  check('3b. the table is back as it was (its state), the venture still owned once', back.units === 1 && back.owned && back.bana.since === mine.bana.since && JSON.stringify(back.bana.stock) === JSON.stringify(mine.bana.stock), JSON.stringify({ units: back.units, since: [mine.bana.since, back.bana.since] }));
  check('3c. the lead set aside stays set aside', back.pistes.off[mine.lead] === mine.pistes.off[mine.lead], JSON.stringify(back.pistes.off));
  check('no JavaScript errors in either client', errors.length === 0, errors.slice(0, 3).join(' | '));
  await p.close();
} catch (e) {
  check('the run went through', false, e.stack ?? String(e));
} finally {
  await browser.close(); server.close();
  console.log(`${total - fails}/${total} passed`);
  process.exitCode = fails ? 1 : 0;
}
