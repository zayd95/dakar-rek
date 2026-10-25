// LD2.0-A · the bana-bana table, as a player on a phone lives it (390 × 844, real touches through Chrome's input pipeline: scripts/lib/realTouch.mjs):
//   1. the « à céder » table in Pikine's market street, beside the Maïga du marché: off the carriageway, clear of the Maïga's door, reached on foot;
//   2. bought from the table with 60 000 F — the one venture purchase (buyVenture('bana')): charged once, the table changes (the player's board, a cousin);
//   3. stocked from the wholesaler (three goods, at cost, one ledger line each), the goods shown on the cloth;
//   4. « Tenir la table »: each customer served with a tap (the sheet's row, then the action button), the till paid ONCE at closing, and it matches the
//      shown calculation (recette − marchandise = bénéfice); the clientèle used up: nobody new until played time passes;
//   5. the phone's « Affaires » (Travailler › Affaires): the table, its stock, the last session, today and since the purchase, « Y aller » (the marker),
//      at a glance — the screen fits without a wall of text; the full ladder and the details one tap away;
//   6. the neighbour (Modou, at his garage next door) says his line about the table once, and never again;
//   7. a session left open over a reload is still open after it, and walking away pays its till once; reload → the same ownership, stock and state.
// Headless Chromium + SwiftShader: a software renderer, NOT a phone. Played time is advanced with the debug hook (the clientèle grows with it).
// Usage: node scripts/check-bana.mjs <baseUrl> <outDir> [proofDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4631/', out = '/tmp/claude-0/ld2-bana/check', proof = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true }); if (proof) fs.mkdirSync(proof, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 600) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };
const shot = async (name, keep = false) => { await page.waitForTimeout(350); const f = `${out}/${name}.jpg`; await page.screenshot({ path: f, quality: 68, type: 'jpeg' }); if (keep && proof) fs.copyFileSync(f, `${proof}/${name}.jpg`); };
const NB = ' ', NN = ' ';
const F = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NN) + NB + 'F';
const ready = () => page.waitForFunction(() => window.__dakar?.pos?.().hub === 'pikine' && window.__dakar.bana?.().at && window.__dakar.npcWhere?.('modou')?.here !== undefined, null, { timeout: 300000 });
const bana = () => d(() => window.__dakar.bana());
const sheet = () => d(() => ({ open: !!document.querySelector('#modal.on'), title: document.querySelector('#modal.on h2')?.textContent ?? '', sub: document.querySelector('#modal.on .sh-sub')?.textContent ?? '', extra: document.querySelector('#modal.on .sh-extra')?.textContent ?? '', rows: [...document.querySelectorAll('#modal.on .item:not(.close)')].map(e => ({ text: e.textContent, dis: e.classList.contains('dis') })) }));
const listen = () => d(() => { window.__heard = []; const box = document.getElementById('toast'); new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.dataset?.msg) window.__heard.push(n.dataset.msg); }).observe(box, { childList: true }); });
const heard = () => d(() => [...(window.__heard ?? []), ...(window.__dakar.quietLog?.().entries ?? [])]);

let t;
/**
 * The sheet has finished sliding in (its CSS animation: a software renderer draws a few frames a second, so a finger would land where the sheet WAS) and
 * the element stands still: where a thumb would tap it. Returns its centre.
 */
const settled = async (sel, text = null) => {
  await page.waitForFunction(() => { const s = document.querySelector('#modal.on .sheet'); return !s || s.getAnimations().every(a => a.playState === 'finished'); }, null, { timeout: 30000 }).catch(() => {});
  let prev = null;
  for (let i = 0; i < 40; i++) {
    const c = await d(([q, x]) => { const e = [...document.querySelectorAll(q)].find(r => x === null || r.textContent.includes(x)); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, [sel, text]);
    if (!c) return null;
    if (prev && prev.x === c.x && prev.y === c.y) return c;
    prev = c; await page.waitForTimeout(160);
  }
  return prev;
};
/** A finger on an element once it stands still (a phone screen or a sheet sliding in). */
const tapStill = async sel => { const c = await settled(sel); if (!c) throw new Error(`nothing matches « ${sel} »`); await t.down(9, c.x, c.y); await sleep(70); await t.up(9); };
/** A finger on a row of the open sheet (scrolled into view first, as a thumb would). */
const tapRow = async text => {
  const c = await settled('#modal.on .item', text);
  if (!c) throw new Error(`no row « ${text} » in the sheet: ${JSON.stringify((await sheet()).rows.map(r => r.text))}`);
  await t.down(9, c.x, c.y); await sleep(70); await t.up(9); await page.waitForTimeout(500);
};
const closeSheet = async () => { if ((await sheet()).open) { const c = await settled('#modal.on .sh-x'); await t.down(9, c.x, c.y); await sleep(70); await t.up(9); await page.waitForFunction(() => !document.querySelector('#modal.on'), null, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(900); } };
/** Serve the customer at the table with `tap` (a row or the action button): counted only once the till shows it. */
const serveWith = async tap => {
  const b0 = await bana(), c = b0.customer, n0 = b0.card.open.served;
  await tap(c);
  await page.waitForFunction(n => window.__dakar.bana().card.open?.served > n, n0, { timeout: 15000 }).catch(() => {});
  const n1 = (await bana()).card.open?.served ?? n0;
  return n1 === n0 + 1 ? c : null;
};

try {
  await page.goto(`${base}?debug&touch&heure=11&argent=60000`, { timeout: 180000 });
  await ready(); await page.waitForTimeout(2500);
  t = await realTouch(page);
  await listen();
  let b = await bana();
  const at = b.at, front = b.front;

  // 1 — the table to give up, where it stands
  const geo = await d(([x, z]) => {
    const g = window.__dakar.cityGeometry(), its = window.__dakar.interactables();
    const mine = g.colliders.filter(c => c.x0 > x - 0.9 && c.x1 < x + 0.9 && c.z0 > z - 0.5 && c.z1 < z + 0.5);
    const others = g.colliders.filter(c => !mine.includes(c) && c.x1 > x - 1.9 && c.x0 < x + 1.9 && c.z1 > z - 1.6 && c.z0 < z + 1.4);
    const maiga = its.find(i => i.id.startsWith('pikine:maiga:'));
    // the way from the pavement (z ≈ −6, the 2 m between the block's edge at −7 and the kerb at −5) up to the front of the table: nothing solid on it
    const way = []; for (let k = 0; k <= 20; k++) { const px = x, pz = -6 + (z + 1.07 - -6) * k / 20; if (g.colliders.some(c => !mine.includes(c) && px > c.x0 - 0.35 && px < c.x1 + 0.35 && pz > c.z0 - 0.35 && pz < c.z1 + 0.35)) way.push(+pz.toFixed(2)); }
    const dna = (window.__dakar.pikineDna?.() ?? []).filter(i => i.x > x - 1.9 && i.x < x + 1.9 && i.z > z - 1.6 && i.z < z + 1.4).map(i => i.kind);
    return { mine: mine.map(c => [c.x0, c.z0, c.x1, c.z1].map(v => +v.toFixed(2))), others: others.length, maiga: maiga && { x: maiga.x, z: maiga.z }, way, dna };
  }, [at.x, at.z]);
  const tableZ1 = geo.mine[0]?.[3] ?? 0, doorX = geo.maiga ? geo.maiga.x - 1.5 : 0;   // the Maïga's door: 1.5 m west of its sheet (src/world/builder.ts)
  check('1a. the table stands on the Maïga du marché’s lot, set back from the pavement (its front ≤ −7.5, the block’s edge is −7, the kerb −5): off the carriageway, nothing else solid on its ground',
    geo.mine.length === 1 && tableZ1 <= -7.5 && geo.others === 0 && geo.dna.length === 0, JSON.stringify(geo));
  check('1b. it blocks no way: the walk from the pavement to its front is clear, the Maïga’s door is 5 m away and the pavement in front of it is free', geo.way.length === 0 && Math.abs(at.x - doorX) > 4 && tableZ1 < -7, JSON.stringify({ way: geo.way, doorX, at }));
  check('1c. before buying: an empty table, the seller, the « TABLE À CÉDER · 50 000 F » board', !b.owned && b.seller && !b.cousin && b.board === 'sale:50000' && Object.values(b.goods).every(v => !v), JSON.stringify({ board: b.board, seller: b.seller, goods: b.goods }));
  // walked there on foot, with a thumb on the stick, from the pavement in front of the Maïga
  await d(() => window.__dakar.place(78, -5.8, -Math.PI / 2)); await page.waitForTimeout(1500);
  const w1 = await walkTo(page, t, front.x + 0.6, -6.2, { tol: 0.7, ms: 120000 });
  const w2 = await walkTo(page, t, front.x, front.z + 0.2, { tol: 0.5, ms: 90000 });
  await page.waitForTimeout(900);
  let f = await d(() => window.__dakar.focus());
  check('1d. walked from the Maïga’s pavement to the table: it is the focus, « Voir la table à céder »', w1 < 0.8 && w2 < 0.6 && f?.id === 'pikine:bana' && f.primary === 'Voir la table à céder', JSON.stringify({ w1, w2, f }));
  await shot('01-a-ceder', true);

  // 2 — bought from the table, with 60 000 F
  await t.tap('#act'); await page.waitForFunction(() => document.querySelector('#modal.on h2'), null, { timeout: 30000 }); await settled('#modal.on .item', 'Reprendre');
  let s = await sheet();
  const buyRow = s.rows.find(r => /Reprendre la table/.test(r.text));
  check('2a. the table’s sheet explains it and offers the purchase: 50 000 F, +400 F per hour, what is left after', s.title === 'Table à céder' && !!buyRow && !buyRow.dis && buyRow.text.includes(F(-50000)) && /400\s?F par heure/.test(s.extra.replace(/\s/g, ' ')) && s.extra.includes(F(10000)), JSON.stringify(s));
  await shot('02-offer', true);
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await d(() => window.__dakar.state.data.ledger.length);
  await tapRow('Reprendre la table'); await page.waitForTimeout(600);
  b = await bana();
  const biz = await d(() => window.__dakar.business());
  const led = await d(() => window.__dakar.state.data.ledger.slice(-1)[0]);
  const wB = await d(() => window.__dakar.state.wallet);
  check('2b. one purchase, the venture’s: −50 000 F once, one « Achat : Table de bana-bana » line, one bana unit owned', w0 === 60000 && wB === 10000 && led.label === 'Achat : Table de bana-bana' && led.amount === -50000 && biz.owned.bana === 1 && (await d(() => window.__dakar.state.data.ledger.length)) === l0 + 1, JSON.stringify({ w0, wB, led, owned: biz.owned }));
  check('2c. the table changes: the player’s own board, the cousin instead of the seller, its first customers waiting', b.owned && /^owned:/.test(b.board) && !b.seller && b.cousin && b.card.clients === 4 && b.flag, JSON.stringify({ board: b.board, seller: b.seller, cousin: b.cousin, clients: b.card.clients }));
  s = await sheet();
  check('2d. the sheet is now « Ta table de bana-bana »', s.title === 'Ta table de bana-bana' && s.rows.some(r => /Tenir la table/.test(r.text) && r.dis) && s.rows.some(r => /Acheter de la marchandise/.test(r.text)), JSON.stringify(s.rows.map(r => r.text + (r.dis ? ' [dis]' : ''))));

  // 3 — stock from the wholesaler
  await tapRow('Acheter de la marchandise');
  s = await sheet();
  const before = await d(() => window.__dakar.state.wallet);
  for (const g of ['cornets d’arachides', 'cartes de recharge', 'paquets de mouchoirs']) await tapRow(g);
  b = await bana();
  const lines = await d(() => window.__dakar.state.data.ledger.slice(-3));
  const spent = before - (await d(() => window.__dakar.state.wallet));
  check('3a. three lots bought at cost: 10 × 50 F + 5 × 900 F + 10 × 60 F = 5 600 F, one ledger line each', s.title === 'Marchandise' && spent === 5600 && lines.map(l => l.amount).join() === '-500,-4500,-600' && lines.every(l => /^Marchandise · bana-bana : /.test(l.label)) && JSON.stringify(b.card.stock.map(g => g.n)) === '[10,5,10]', JSON.stringify({ spent, lines, stock: b.card.stock.map(g => g.n) }));
  check('3b. the goods are on the table in the world', Object.values(b.goods).every(Boolean), JSON.stringify(b.goods));
  await closeSheet();
  await d(([x, z]) => window.__dakar.cam([x + 2.5, 2.0, z + 1.7], [x - 0.3, 0.8, z - 0.1]), [at.x, at.z]); await page.waitForTimeout(2200);
  await shot('03-stocked-table', true);
  await d(() => window.__dakar.cam(null)); await page.waitForTimeout(600);

  // 4 — « Tenir la table »: serve, then close: the till paid once
  f = await d(() => window.__dakar.focus());
  check('4a. at the table, its action is now « Tenir la table »', f?.primary === 'Tenir la table', JSON.stringify(f));
  await t.tap('#act'); await page.waitForFunction(() => document.querySelector('#modal.on h2')?.textContent === 'Table ouverte', null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(600);
  s = await sheet(); b = await bana();
  const me = await d(() => window.__dakar.pos());
  check('4b. the table opens: the player behind it, facing the street, a customer walking up', s.title === 'Table ouverte' && !!b.card.open && b.customer && Math.abs(me.x - (at.x - 0.2)) < 0.3 && Math.abs(me.z - (at.z - 0.95)) < 0.3 && b.walkers.length >= 1, JSON.stringify({ title: s.title, me, customer: b.customer, walkers: b.walkers }));
  const served = [];
  const w4 = await d(() => window.__dakar.state.wallet), l4 = await d(() => window.__dakar.state.data.ledger.length);
  // the first customer from the sheet's row
  await page.waitForTimeout(1800); await shot('04-session-sheet', true);
  let c = await serveWith(x => tapRow(`Servir ${x.name}`)); if (c) served.push(c);
  // the second with the big action button, the sheet closed (a thumb on « Servir … »)
  await closeSheet();
  c = (await bana()).customer;
  await page.waitForFunction(() => window.__dakar.bana().walkers.includes('wait'), null, { timeout: 30000 }).catch(() => {});   // the next customer has walked up to the table
  f = await d(() => window.__dakar.focus());
  check('4c. with the sheet closed the action button serves: « Servir <name> »', served.length === 1 && f?.primary === `Servir ${c.name}`, JSON.stringify({ f, served: served.length }));
  await d(([x, z]) => window.__dakar.cam([x + 2.2, 2.3, z + 3.6], [x - 0.2, 0.9, z - 0.2]), [at.x, at.z]); await page.waitForTimeout(1600);
  await shot('05-customer-at-the-table', true);
  await d(() => window.__dakar.cam(null)); await page.waitForTimeout(500);
  c = await serveWith(() => t.tap('#act')); if (c) served.push(c);
  // the rest from the sheet again, through « ⋯ » › « Voir la table »
  await t.tap('#actMore'); await page.waitForTimeout(600);
  await tapRow('Voir la table');
  for (let k = 0; k < 8 && (await bana()).customer; k++) { c = await serveWith(x => tapRow(`Servir ${x.name}`)); if (c) served.push(c); }
  b = await bana(); s = await sheet();
  const sales = served.reduce((x, y) => x + y.amount, 0), cost = served.reduce((x, y) => x + y.cost, 0);
  check('4d. every customer served at the price of what they took; the till is the sum, nothing paid yet', b.card.open?.sales === sales && b.card.open?.cost === cost && b.card.open?.served === 4 && (await d(() => window.__dakar.state.wallet)) === w4 && (await d(() => window.__dakar.state.data.ledger.length)) === l4, JSON.stringify({ served: served.map(x => `${x.name}:${x.qty} ${x.good}=${x.amount}`), till: b.card.open }));
  check('4e. nobody left: the sheet says so and offers « Fermer et encaisser » with the till', /Plus de clients/.test(s.extra) && s.rows.some(r => /Fermer et encaisser/.test(r.text) && r.text.includes('+' + F(sales))) && s.extra.includes(`Recette ${F(sales)} − marchandise ${F(cost)} = ${F(sales - cost)}`), JSON.stringify(s));
  await shot('06-till', true);
  await tapRow('Fermer et encaisser'); await page.waitForTimeout(500);
  s = await sheet(); b = await bana();
  const w5 = await d(() => window.__dakar.state.wallet), led5 = await d(() => window.__dakar.state.data.ledger.slice(-1)[0]);
  const shown = s.extra.replace(/\s+/g, ' ');
  check('4f. closed: the till paid once (one « Recette » line), and the sheet’s calculation is the money: recette − marchandise = bénéfice',
    w5 - w4 === sales && led5.amount === sales && led5.label === 'Recette · Table de bana-bana (4 clients)' && (await d(() => window.__dakar.state.data.ledger.length)) === l4 + 1
    && shown.includes(`Recette+${F(sales)}`.replace(/\s+/g, ' ')) && shown.includes(`Marchandise vendue (prix de gros)${F(-cost)}`.replace(/\s+/g, ' ')) && shown.includes(`Bénéfice${F(sales - cost)}`.replace(/\s+/g, ' ')) && b.card.last?.profit === sales - cost,
    JSON.stringify({ paid: w5 - w4, sales, cost, profit: sales - cost, led5, shown: shown.slice(0, 240) }));
  await shot('07-closed', true);
  await tapRow('OK');
  // a second close (a double tap, a replay) pays nothing; the clientèle is used up: reopening brings nobody
  const again = await d(() => { window.__dakar.banaSheet('session'); return window.__dakar.state.wallet; });
  await closeSheet();
  b = await bana(); f = await d(() => window.__dakar.focus());
  const tenir = f?.why ?? [];
  check('4g. paid once: nothing more after closing; nobody left to serve: « Tenir la table » says why', again === w5 && !b.card.open && b.card.clients === 0 && /Personne pour l’instant/.test(b.why) && tenir.some(x => /Personne/.test(x)), JSON.stringify({ again, w5, clients: b.card.clients, why: b.why, f }));
  // played time brings customers back (one per in-game hour of play), and the venture's hourly income is the usual 400 F, one line
  const hourMs = b.hourMs;
  const paid = await d(ms => window.__dakar.advancePlayed(ms), hourMs);
  b = await bana();
  const inc = await d(() => window.__dakar.state.data.ledger.slice(-1)[0]), rate = await d(() => window.__dakar.business());
  // the payout is the in-game hour advanced plus the part of the current one already played (paid in hourly batches: src/economy/assets.ts)
  check('4h. an in-game hour of play later: one customer back, and the venture’s income unchanged (400 F per hour, one « Revenus · Table de bana-bana » line)', b.card.clients === 1 && rate.base === 400 && rate.perHour === 400 && paid >= 400 && paid < 800 && inc.label === 'Revenus · Table de bana-bana' && inc.amount === paid, JSON.stringify({ clients: b.card.clients, paid, inc, base: rate.base, perHour: rate.perHour }));

  // 5 — the phone: Travailler › Affaires
  await t.tap('#menuBtn'); await page.waitForFunction(() => document.querySelector('#phone .hm-tile[data-go="travailler"]'), null, { timeout: 30000 }); await page.waitForTimeout(900);   // (a phone screen ignores taps for 320 ms after it changes)
  await tapStill('#phone .hm-tile[data-go="travailler"]'); await page.waitForFunction(() => document.querySelector('#phone [data-act="business"]'), null, { timeout: 30000 }); await page.waitForTimeout(900);
  const workSub = await d(() => [...document.querySelectorAll('#phone [data-act="business"]')].map(e => e.textContent).join());
  await tapStill('#phone [data-act="business"]'); await page.waitForFunction(() => document.querySelector('#modal.on h2')?.textContent === 'Affaires', null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(600);
  await settled('#modal.on .item', 'Y aller');
  s = await sheet();
  const fit = await d(() => {
    const p = document.querySelector('#modal.on .panel'), r = p.getBoundingClientRect(), card = p.querySelector('.bana-card')?.getBoundingClientRect(), go = [...p.querySelectorAll('.item')].find(e => /Y aller/.test(e.textContent))?.getBoundingClientRect();
    const wide = [...p.querySelectorAll('*')].filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > innerWidth + 1 || q.left < -1); }).length;
    return { chars: p.textContent.replace(/\s+/g, ' ').length, extraChars: p.querySelector('.sh-extra')?.textContent.replace(/\s+/g, ' ').length ?? 0, rows: p.querySelectorAll('.item:not(.close)').length, panelBottom: Math.round(r.bottom), panelTop: Math.round(r.top), cardBottom: card && Math.round(card.bottom), goBottom: go && Math.round(go.bottom), wide, scroll: p.scrollHeight - p.clientHeight };
  });
  const norm = x => x.replace(/\s+/g, ' '), ex = norm(s.extra);
  check('5a. Travailler shows the table’s state on the « Affaires » row, and the tap opens « Affaires »', /Ta table : 1 client attend\b/.test(workSub) && s.title === 'Affaires', JSON.stringify({ workSub, title: s.title }));
  check('5b. Affaires at a glance: income per hour and earned, the table card (stock, customers, the last session’s calculation, today and since the purchase)',
    /Revenus par heure/.test(ex) && /Total gagné/.test(ex) && ex.includes(`🥜 ${b.card.stock[0].n}/30`) && /Clients qui attendent : 1\/12/.test(ex)
    && ex.includes(norm(`Recette ${F(sales)} − marchandise ${F(cost)} = bénéfice ${F(sales - cost)}`)) && ex.includes(norm(`aujourd’hui ${F(sales - cost)}`)) && ex.includes(norm(`depuis l’achat ${F(sales - cost)}`)), ex);
  check('5c. its rows: « Y aller · ta table », the venture owned with its income, the next one with what is missing, the full ladder and the details on demand',
    /^📍Y aller · ta table/.test(s.rows[0]?.text ?? '') && s.rows.some(r => /Table de bana-bana ×1/.test(r.text) && r.text.includes(`+${F(400)}/h`)) && s.rows.some(r => /Kiosque/.test(r.text) && r.dis && /Il manque/.test(r.text))
    && s.rows.some(r => /Voir toutes les affaires \(7\)/.test(r.text)) && s.rows.some(r => /Comment ça marche/.test(r.text)) && !/Bonus facultatif/.test(ex), JSON.stringify(s.rows.map(r => r.text + (r.dis ? ' [dis]' : ''))));
  check('5d. it fits a phone without a wall of text: no sideways overflow, a short screen, the table card and « Y aller » visible without scrolling',
    fit.wide === 0 && fit.extraChars < 480 && fit.rows <= 6 && fit.cardBottom <= fit.panelBottom && fit.goBottom <= Math.min(fit.panelBottom, 844), JSON.stringify(fit));
  await shot('08-affaires-phone', true);
  await tapRow('Voir toutes les affaires');
  s = await sheet();
  check('5e. « Voir toutes les affaires »: the whole ladder, seven ventures with their income', s.title === 'Toutes les affaires' && s.rows.filter(r => /\/h/.test(r.text)).length === 7, JSON.stringify(s.rows.map(r => r.text)));
  await tapRow('Retour'); await tapRow('Comment ça marche');
  s = await sheet();
  check('5f. « Comment ça marche »: the variety chips and the income rules, off the main screen', s.title === 'Comment ça marche' && /Variété/.test(s.extra) && /Bonus facultatif/.test(s.extra), s.extra.slice(0, 160));
  await tapRow('Retour'); await d(() => window.__dakar.place(60, -30, 0)); await page.waitForTimeout(400);
  await tapRow('Y aller · ta table'); await page.waitForTimeout(900);
  const mark = await d(() => ({ dest: window.__dakar.destination(), goal: document.querySelector('#goal')?.textContent ?? '' }));
  check('5g. « Y aller » marks the table: the walking marker and the goal line point at it', mark.dest === 'pikine:bana' && /Table de bana-bana/.test(mark.goal), JSON.stringify(mark));
  await shot('09-y-aller');

  // 6 — Modou, at the garage next door, says his line once
  const modou = await d(() => window.__dakar.npcWhere('modou'));
  await d(m => window.__dakar.place(m.x, m.z + 3.4, Math.PI), modou); await page.waitForTimeout(400);
  await page.waitForFunction(() => [...(window.__heard ?? [])].some(x => /^Modou/.test(x) && /table/.test(x)), null, { timeout: 60000 }).catch(() => {});
  let h = (await heard()).filter(x => /^Modou/.test(x) && /table à côté de la Maïga/.test(x));
  b = await bana();
  check('6a. Modou (the garage on the table’s block) acknowledges the table: one line, and the table remembers it', h.length === 1 && b.ack, JSON.stringify({ h, ack: b.ack, modou }));
  await shot('10-modou', true);
  // away and back, an hour later: not again
  await d(() => window.__dakar.place(60, -30, 0)); await page.waitForTimeout(1500);
  await d(() => window.__dakar.setHour(12.2)); await page.waitForTimeout(400);
  const m2 = await d(() => window.__dakar.npcWhere('modou'));
  await d(m => window.__dakar.place(m.x, m.z + 3.2, Math.PI), m2); await page.waitForTimeout(6000);
  h = (await heard()).filter(x => /table à côté de la Maïga/.test(x));
  check('6b. back an hour later: the line is not said again', h.length === 1, JSON.stringify(h));
  await d(() => window.__dakar.setHour(11)); await page.waitForTimeout(300);

  // 7 — a session open over a reload, then walking away pays it once; reload: the same table
  await d(([x, z]) => window.__dakar.place(x, z + 1.3, Math.PI), [at.x, at.z]); await page.waitForTimeout(1200);
  await t.tap('#act'); await page.waitForTimeout(900);                          // « Tenir la table »: the one customer back
  c = await serveWith(x => tapRow(`Servir ${x.name}`));
  await closeSheet();
  const open7 = (await bana()).card.open, w7 = await d(() => window.__dakar.state.wallet);
  await d(() => { window.__dakar.save(); window.dispatchEvent(new Event('pagehide')); });
  const kept = await d(() => JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')).bana);
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 }); await ready(); await page.waitForTimeout(2500);
  t = await realTouch(page); await listen();
  b = await bana();
  const w8 = await d(() => window.__dakar.state.wallet);
  check('7a. reloaded at the table with the table open: the same session, its till not paid yet, the same stock, customers and history',
    !!b.card.open && b.card.open.sales === open7.sales && w8 === w7 && b.card.stock.every(g => (kept.stock[g.id] ?? 0) === g.n) && b.card.clients === kept.clients
    && b.card.last?.profit === sales - cost && b.card.total === kept.total && b.owned && /^owned:/.test(b.board) && b.cousin,
    JSON.stringify({ open: b.card.open, open7, w7, w8, stock: b.card.stock.map(g => g.n), kept: kept.stock }));
  const me7 = await d(() => window.__dakar.pos());
  await walkTo(page, t, me7.x - 8, me7.z + 2.5, { tol: 0.8, ms: 120000 }); await page.waitForTimeout(1200);
  b = await bana();
  const w9 = await d(() => window.__dakar.state.wallet), led9 = await d(() => window.__dakar.state.data.ledger.slice(-1)[0]);
  h = (await heard()).filter(x => /^Mor : /.test(x));
  check('7b. walking away closes it: the till paid once (the cousin says so), nothing more', !b.card.open && w9 - w8 === open7.sales && led9.amount === open7.sales && /^Recette · Table de bana-bana \(1 client\)$/.test(led9.label) && h.length === 1, JSON.stringify({ paid: w9 - w8, till: open7.sales, led9, h }));
  await d(() => { window.__dakar.save(); });
  const saved = await d(() => ({ bana: JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')).bana, units: window.__dakar.business().owned.bana, wallet: window.__dakar.state.wallet }));
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 }); await ready(); await page.waitForTimeout(2500);
  b = await bana();
  const after = await d(() => ({ bana: window.__dakar.state.data.bana, units: window.__dakar.business().owned.bana, wallet: window.__dakar.state.wallet }));
  check('7c. reload: the same ownership, stock, clientèle, last session, totals and acknowledgement; the table drawn as the player’s with its goods',
    after.units === 1 && after.wallet === saved.wallet && JSON.stringify(after.bana.stock) === JSON.stringify(saved.bana.stock) && after.bana.clients === saved.bana.clients && JSON.stringify(after.bana.last) === JSON.stringify(saved.bana.last)
    && after.bana.total === saved.bana.total && after.bana.ack && b.owned && /^owned:/.test(b.board) && b.cousin && !b.seller && Object.entries(b.goods).every(([id, v]) => v === (after.bana.stock[id] > 0)),
    JSON.stringify({ saved: saved.bana, after: after.bana, goods: b.goods }));
  await d(([x, z]) => window.__dakar.cam([x - 3.5, 2.6, z + 5.2], [x, 0.9, z - 0.3]), [at.x, at.z]); await page.waitForTimeout(2400);
  await shot('11-after-reload', true);
  await d(() => window.__dakar.cam(null));
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('the run went through', false, e.stack ?? String(e));
  await shot('zz-error');
} finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, failed, results, errors: errors.slice(0, 10) }, null, 1));
  console.log(`${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed ? 1 : 0;
}
