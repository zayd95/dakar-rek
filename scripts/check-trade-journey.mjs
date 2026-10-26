// M2 « Ma première affaire » (docs/districts/M2-PLATEAU-MEDINA.md): the golden path, played with the REAL touch controls in one session (video recorded).
// The Plateau at 10:00, a new save with 60 000 F. On foot: the player walks up the Médina street to Diallo & Frères, talks to Oumar Diallo (first meeting), picks a good,
// a quantity (price and cash shown), buys with their own money (one debit), puts the cartons on their head, walks through the Plateau to the Comptoir Sall — saving and
// reloading on the way: the lot is still on their head, nothing paid or lost — and sells to Awa Sall: one credit, the card with the real profit. Selling again pays nothing,
// and neither does a reload. A later city day (labelled debug shortcut): the player drives their own car to Diallo's loading bay, is recognised, buys rice (too heavy to
// carry), loads it into the car, drives to the Comptoir's bay, sells. Then the porters: mangoes on the pousse-pousse (the fee paid once), the porter walks the kerb to the
// Comptoir, the sale waits for him. Diallo's lots of the day run out. Every amount reconciles with the ledger.
// Debug hooks: the start (money, the hour, the player put on a Plateau pavement, the Teranga bought and its parking record put in the Plateau), the next city day, reading state.
// Usage: node scripts/check-trade-journey.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle, walkTo } from './lib/realTouch.mjs';
import { route, closedZones } from './lib/gridRoute.mjs';

const [base = 'http://127.0.0.1:4630/', out = '/tmp/claude-0/m2/journey'] = process.argv.slice(2);
const PARTS = (process.env.PARTS ?? 'foot,car,porter').split(',');
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: process.env.NOVIDEO ? undefined : { dir: out, size: { width: 390, height: 844 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const TR = () => d(() => window.__dakar.trade.info()), AT = () => d(() => window.__dakar.teranga.at());
const wallet = () => d(() => window.__dakar.state.data.wallet);
const ready = async () => { await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.trade, null, T); };
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), off: e.classList.contains('dis') })).filter(i => i.text !== '✕'));   // (not the sheet's close button)
const sheet = () => d(() => { const m = document.querySelector('#modal.on'); return m ? m.textContent.replace(/\s+/g, ' ').trim() : null; });
async function tapItem(re) {
  const box = await d(r => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(r).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, re);
  if (!box) throw new Error(`no sheet row matches /${re}/: ${JSON.stringify(await items())}`);
  await t.down(5, box.x, box.y); await page.waitForTimeout(60); await t.up(5); await page.waitForTimeout(700);
}
/** Walk a line of pavement points with the stick; a point not reached (a lamp post, a vendor in the way) is retried from a step aside. */
async function walkPath(pts, { tol = 1.2 } = {}) {
  const step = async (x, z, o) => { try { return await walkTo(page, t, x, z, o); } catch (e) { log('walk:', e.message); await t.upAll(); await clearWay(); return walkTo(page, t, x, z, o); } };
  for (const [x, z] of pts) {
    await clearWay();
    let left = await step(x, z, { tol, ms: 45000 });
    if (left > tol) { const p = await d(() => window.__dakar.pos()); await step(p.x + (x > p.x ? 1.5 : -1.5), p.z + (z > p.z ? 1.5 : -1.5), { tol: 0.6, ms: 6000 }); left = await step(x, z, { tol, ms: 45000 }); }
    if (left > tol * 3) log(`walk: stopped ${left.toFixed(1)} m short of (${x}, ${z})`);
  }
}
/** From beside the parked car to (x, z) on its other side: round its front, as a player does (the driver gets out on the street side, the shop is on the kerb's). */
async function roundCar(x, z) {
  const c = await AT(), me = await d(() => window.__dakar.pos()), F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }, L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
  const side = (p) => Math.sign((p.x - c.x) * L.x + (p.z - c.z) * L.z) || 1;
  const at = (s) => [c.x + F.x * 3.8 + L.x * s * 1.9, c.z + F.z * 3.8 + L.z * s * 1.9];
  await walkPath([at(side(me)), at(side({ x, z })), [x, z]], { tol: 0.8 });
}
/** Back from a shop to the driver's door (on the street side), round the car's front, then in (realTouch's boardVehicle). */
async function boardFromShop() {
  const c = await AT(), L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
  await roundCar(c.x + L.x * 2.2, c.z + L.z * 2.2);
  await boardVehicle(page, t, 'teranga');
}
/** Face a trader and tap the action button (« Parler à … »), as a player standing at their table does. */
async function talkTo(id) {
  const ok = await page.waitForFunction(i => window.__dakar.focus()?.id === i, id, { timeout: 8000 }).then(() => true, () => false);
  if (!ok) return false;
  await t.tap('#act'); await page.waitForTimeout(900);
  return true;
}
/** Something came up over the game (a sheet, a card): note it (screenshot) and close it, as a player would, so the stick is there again. */
async function clearWay() {
  for (let n = 0; n < 4; n++) {
    const st = await d(() => ({ modal: document.querySelector('#modal.on')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) ?? null, joy: !!document.querySelector('#joy'), mode: window.__dakar.pos().mode }));
    if (st.joy && !st.modal && st.mode === 'play') return;
    log('in the way:', JSON.stringify(st)); await shot('in-the-way');
    if (st.modal) { const c = await d(() => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => x.textContent.trim() === '✕'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); if (c) { await t.down(6, c.x, c.y); await page.waitForTimeout(60); await t.up(6); } }
    await page.waitForTimeout(1500);
  }
}
const getOut = async () => {
  await page.waitForFunction(() => Math.abs(window.__dakar.teranga.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  await t.tap('#ridepad .rp-off');
  await page.waitForFunction(() => !window.__dakar.teranga.at().driving && !window.__dakar.teranga.info().exit, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
};
const perf = async (where) => {
  const r = await d(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res({ fps: n / ((performance.now() - t0) / 1000), calls: window.__dakar.drawCalls?.() ?? null }); }; requestAnimationFrame(f); }));
  log(`perf ${where}: ${r.fps.toFixed(1)} fps (swiftshader, no GPU), draw calls ${JSON.stringify(r.calls)}`);
  return r;
};
const sumLedger = (ledger) => ledger.filter(e => /· lot \d+/.test(e.label)).reduce((s, e) => s + e.amount, 0);

// Diallo's table (the keeper stands at x −72.2, z 17.2, facing the street) and the Comptoir's arcade (Awa Sall at x 70.6, z −79.5): where the player stands to talk.
const AT_DIALLO = [-69.4, 17.4], AT_SALL = [68.4, -79.5];
// On foot through the Plateau, on the pavements (2 m, between the kerb at 5 m and the block edge at 7 m from a street's centre line): up the Médina street (x = −60),
// along the main street (z = 0), up the street at x = 60 to the Comptoir. Halfway: a save and a reload.
const WALK_1 = [[-66.2, 12], [-66.2, 6.2], [-30, 6.2], [-6, 6.2]], WALK_2 = [[6.2, 6.2], [40, 6.2], [66.2, 6.2], [66.2, -40], [66.2, -76], AT_SALL];

log('boot');
await page.goto(`${base}?debug&touch&heure=10&argent=60000`, { timeout: 180000 });
await ready();
let t = await realTouch(page);
await d(() => window.__dakar.teleport('plateau', -66.2, 40, Math.PI));             // (set-up: on the Médina street's pavement, 25 m from the depot)
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play' && window.__dakar.trade.info().people.diallo, null, T);
await page.waitForTimeout(2500);
const s0 = await TR(), w0 = await wallet();
check('a new save: nothing of the trade remembered, no lot, no goods', !s0.lot && Object.keys(s0.counters).length === 0 && Object.keys(s0.inventory).length === 0 && w0 === 60000, JSON.stringify({ c: s0.counters, w0 }));
await shot('medina-street');

if (PARTS.includes('foot')) {
  // ---------------------------------------------------------------- 1. Diallo & Frères: the first meeting, the catalogue, the purchase
  log('to Diallo');
  await walkPath([[-66.2, 22], AT_DIALLO], { tol: 0.8 });
  await perf('Diallo & Frères');
  await shot('diallo-forecourt');
  check('« Parler à Oumar » at his table', await talkTo('plateau:grossiste:diallo'));
  const first = await TR(), menu1 = await items(), sub1 = await sheet();
  check('the first meeting: Oumar Diallo introduces his depot and names the Comptoir Sall as the buyer', first.said.length === 1 && /Bienvenue chez Diallo/.test(first.said[0]) && /Comptoir Sall/.test(first.said[0]) && first.counters.pl_diallo_met > 0, JSON.stringify(first.said));
  check('his catalogue: three goods with their price, and the cash the player has', menu1.length === 3 && /Thé vert.*3 000/.test(menu1[0].text) && /Riz brisé.*9 000/.test(menu1[1].text) && /Mangues.*2 500/.test(menu1[2].text) && /60 000 F sur toi/.test(sub1 ?? ''), JSON.stringify({ menu1, sub1 }));
  await shot('diallo-catalogue');
  await tapItem('^\\W*Thé vert');
  const q = await items();
  check('the quantities, each with its total and the margin possible at the Comptoir; more than the player can afford is refused', q.some(i => /^\W*3 cartons/.test(i.text) && /9 000/.test(i.text) && /marge possible \+2 100/.test(i.text)) && q.some(i => /^\W*10 cartons/.test(i.text) && !i.off), JSON.stringify(q));
  await shot('diallo-quantity');
  await tapItem('^\\W*3 cartons');
  const b = await TR(), w1 = await wallet(), load1 = await items();
  check('bought with the player’s own money: one debit of 9 000 F, one ledger line naming lot 1, three cartons in the inventory', w0 - w1 === 9000 && b.lot?.seq === 1 && b.lot.stage === 1 && b.inventory.pl_the === 3 && b.ledger.length === 1 && b.ledger[0].amount === -9000 && /achat thé vert ×3 · lot 1/.test(b.ledger[0].label), JSON.stringify({ paid: w0 - w1, lot: b.lot, inv: b.inventory, ledger: b.ledger }));
  check('the load sheet: on the head (free), the vehicle (none in the bay: refused), the pousse-pousse (1 500 F), cancel (refund)', load1.length === 4 && !load1[0].off && load1[1].off && /Gare ton véhicule/.test(load1[1].text) && /1 500/.test(load1[2].text) && /Annuler/.test(load1[3].text), JSON.stringify(load1));
  await shot('diallo-load-sheet');
  await tapItem('^\\W*Porter sur la tête');
  const c = await TR();
  check('on the head: the lot has left the forecourt (stage carried, by hand); nothing else paid', c.lot?.stage === 2 && c.lot.mode === 'hand' && (await wallet()) === w1, JSON.stringify(c.lot));
  await page.waitForTimeout(600); await shot('on-the-head');

  // ---------------------------------------------------------------- 2. through the Plateau on foot; a save and a reload halfway
  log('to the Comptoir, on foot');
  await walkPath(WALK_1);
  await shot('main-street-carrying');
  const before = await d(() => ({ p: window.__dakar.pos(), w: window.__dakar.state.data.wallet }));
  await d(() => window.__dakar.save?.());
  await d(() => history.replaceState(null, '', location.href.replace(/&argent=\d+/, ''))); await page.reload(); await ready();
  t = await realTouch(page);
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && window.__dakar.trade.info().people.sall, null, T);
  await page.waitForTimeout(1500);
  const re = await TR(), pRe = await d(() => window.__dakar.pos());
  check('reloaded halfway: the lot is still on the head (lot 1, three cartons, stage carried), the wallet unchanged, no goods made or lost', re.lot?.seq === 1 && re.lot.stage === 2 && re.lot.qty === 3 && re.inventory.pl_the === 3 && re.wallet === before.w && re.ledger.length === 1, JSON.stringify({ lot: re.lot, inv: re.inventory, w: re.wallet, at: [pRe.hub, pRe.x.toFixed(1), pRe.z.toFixed(1)], was: [before.p.x.toFixed(1), before.p.z.toFixed(1)] }));
  if (Math.hypot(pRe.x - before.p.x, pRe.z - before.p.z) > 4) log(`NOTE: the reload put the player at (${pRe.x.toFixed(1)}, ${pRe.z.toFixed(1)}), not where they saved`);
  await shot('reloaded-carrying');
  await walkPath(WALK_2, { tol: 0.9 });
  await perf('Comptoir Sall');
  await shot('comptoir-arcade');

  // ---------------------------------------------------------------- 3. the sale, the card, the real profit; no second payment
  check('« Parler à Awa » under the arcade', await talkTo('plateau:comptoir:sall'));
  const quoteRows = await items(), quoteText = await sheet();
  check('Awa Sall’s offer: three cartons at 3 700 F, 11 100 F, against what the lot cost', quoteRows.length === 1 && /Vendre.*11 100/.test(quoteRows[0].text) && /9 000/.test(quoteRows[0].text) && /3 700/.test(quoteText ?? ''), JSON.stringify({ quoteRows, quoteText }));
  await shot('sall-offer');
  const w2 = await wallet();
  await tapItem('^\\W*Vendre');
  await page.waitForTimeout(3500); await shot('sale-card');
  const sold = await TR(), w3 = await wallet(), cards = await d(() => window.__dakar.trade.info().cards.map(k => ({ ...k, rows: k.rows.map(r => r.replace(/\s/g, ' ')) })));
  const card = cards.find(k => /^Lot 1 · /.test(k.title));
  check('sold: one credit of 11 100 F, one ledger line « Plateau · vente thé vert ×3 · lot 1 »; the lot and the goods are gone', w3 - w2 === 11100 && !sold.lot && !sold.inventory.pl_the && sold.ledger.filter(e => /vente/.test(e.label)).length === 1 && sold.counters.pl_trades === 1, JSON.stringify({ got: w3 - w2, ledger: sold.ledger, c: sold.counters }));
  check('the card shows the real result: « Lot 1 · +2 100 F de bénéfice » in its title (what a phone held upright always shows), then Vente 11 100 F, Achat −9 000 F, Bénéfice +2 100 F, and the player’s trades so far', !!card && /^Lot 1 · \+2 100 F de bénéfice/.test(card.title.replace(/\s/g, ' ')) && card.rows.some(r => /^Vente: \+11 100/.test(r)) && card.rows.some(r => /^Achat: −9 000/.test(r)) && card.rows.some(r => /^Bénéfice: \+2 100/.test(r)) && /garder|placer|racheter/.test(card.next.join(' ')), JSON.stringify(card));
  check('the profit reconciles: the wallet moved by +2 100 F, the lot’s ledger lines sum to +2 100 F, the saved total says +2 100 F', w3 - w0 === 2100 && sumLedger(sold.ledger) === 2100 && sold.counters.pl_profit_total === 2100, JSON.stringify({ wallet: w3 - w0, ledger: sumLedger(sold.ledger), total: sold.counters.pl_profit_total }));
  await page.waitForTimeout(4000);
  await talkTo('plateau:comptoir:sall');
  const again = await TR();
  check('« Parler à Awa » again: nothing to sell, nothing paid', (await wallet()) === w3 && /achète en gros/.test(again.said[again.said.length - 1] ?? '') && !(await d(() => !!document.querySelector('#modal.on'))), JSON.stringify(again.said.slice(-1)));
  await d(() => window.__dakar.save?.());
  await page.reload(); await ready(); t = await realTouch(page);
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);
  const re2 = await TR();
  check('reloaded after the sale: paid once, no lot came back, one trade', re2.wallet === w3 && !re2.lot && re2.counters.pl_trades === 1 && re2.ledger.length === 2, JSON.stringify({ w: re2.wallet, lot: re2.lot, c: re2.counters }));
}

if (PARTS.includes('car')) {
  // ---------------------------------------------------------------- 4. a later day, the player's own car: Diallo recognises them; rice, loaded in the bay
  log('next day, by car');
  const day = await d(() => window.__dakar.nextDay(1));                            // (debug shortcut, labelled: the later city day a journey cannot wait 24 minutes for)
  const me = await d(() => window.__dakar.pos());
  // (set-up, labelled: the player owns a Teranga. It is bought at its dealer in Pikine (where a new save starts), and the wallet is put back as it was: the car is a
  // given of this check, not part of the trade)
  if (!(await d(() => window.__dakar.teranga.info().owned))) {
    const keep = await wallet();
    await d(() => window.__dakar.teleport('pikine', 95, 4, 0));
    await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().floor.length > 0, null, { timeout: 120000 });
    await d(() => { window.__dakar.state.data.wallet += 5_000_000; window.__dakar.teranga.own(); });
    await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, T);
    await d(w => { window.__dakar.state.data.wallet = w; }, keep);
  }
  // (set-up, labelled: the player's car parked on the Comptoir's street, 20 m north of its bay)
  await d(([px, pz]) => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('plateau'); c[`vehicle:${id}:x`] = 64.3; c[`vehicle:${id}:z`] = -100; c[`vehicle:${id}:yaw`] = Math.PI; A.save?.(); A.teleport('plateau', px, pz, Math.PI); }, [me.x, me.z]);
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here, null, T);
  await page.waitForTimeout(1500);
  const w4 = await wallet();
  await boardVehicle(page, t, 'teranga');
  const a1 = await AT();
  const toDepot = route({ x: a1.x, z: a1.z, yaw: a1.yaw }, { x: -64.3, z: 19, yaw: 0 }, { cruise: 7, avoid: await closedZones(page) });
  check('a street route from the Comptoir to Diallo’s loading bay', !!toDepot);
  if (toDepot) await pilot(page, t, 'teranga', toDepot, { cruise: 7, stall: 60000, ms: 1200000, brakeAtEnd: true });
  await shot('car-in-diallo-bay');
  await getOut();
  const parked = (await TR()).parked;
  await roundCar(...AT_DIALLO);
  check('the car is left in Diallo’s loading bay', !!parked && parked.x > -69.4 && parked.x < -58.9 && parked.z > 8 && parked.z < 28, JSON.stringify(parked));
  check('« Parler à Oumar » again', await talkTo('plateau:grossiste:diallo'));
  const rec = await TR();
  // (the seen day: the city day may roll over during the drive, hence ≥)
  check('a later day: Diallo recognises the player (once), asks how the Comptoir paid', rec.recognised === 1 && /te revoilà/.test(rec.said[rec.said.length - 1] ?? '') && rec.counters.pl_diallo_seen_day >= day + 1, JSON.stringify({ said: rec.said.slice(-1), day, seen: rec.counters.pl_diallo_seen_day }));
  await shot('diallo-recognises');
  await tapItem('^\\W*Riz brisé'); await tapItem('^\\W*2 sacs');
  const load2 = await items(), rz = await TR();
  check('two sacks of rice bought (18 000 F, one line, lot 2); too heavy for the head; the car in the bay takes 4', rz.lot?.seq === 2 && rz.lot.good === 'riz' && w4 - (await wallet()) === 18000 && load2[0].off && /Trop lourd/.test(load2[0].text) && !load2[1].off && /il en prend 4/.test(load2[1].text), JSON.stringify({ lot: rz.lot, load2 }));
  await shot('rice-load-sheet');
  await tapItem('^\\W*Charger dans ton véhicule');
  const inCar = await TR();
  check('loaded in the car: stage carried, by vehicle', inCar.lot?.stage === 2 && inCar.lot.mode === 'vehicle', JSON.stringify(inCar.lot));
  await boardFromShop();
  const a2 = await AT();
  const toComptoir = route({ x: a2.x, z: a2.z, yaw: a2.yaw }, { x: 64.3, z: -79.5, yaw: Math.PI }, { cruise: 7, avoid: await closedZones(page) });
  check('a street route from the depot to the Comptoir’s bay', !!toComptoir);
  if (toComptoir) await pilot(page, t, 'teranga', toComptoir, { cruise: 7, stall: 60000, ms: 1200000, brakeAtEnd: true });
  await shot('car-in-comptoir-bay');
  await getOut();
  await roundCar(...AT_SALL);
  check('« Parler à Awa », the car in her bay', await talkTo('plateau:comptoir:sall'));
  const w5 = await wallet();
  await tapItem('^\\W*Vendre');
  const sold2 = await TR(), cards2 = await d(() => window.__dakar.trade.info().cards.map(k => ({ ...k, rows: k.rows.map(r => r.replace(/\s/g, ' ')) }))), card2 = cards2.find(k => /^Lot 2 · /.test(k.title));
  check('sold from the car: +20 400 F once; the card says Bénéfice +2 400 F', (await wallet()) - w5 === 20400 && !sold2.lot && !!card2 && card2.rows.some(r => /^Bénéfice: \+2 400/.test(r)) && sold2.counters.pl_trades === 2, JSON.stringify({ card2, c: sold2.counters }));
  await page.waitForTimeout(3500); await shot('rice-sale-card');
}

if (PARTS.includes('porter')) {
  // ---------------------------------------------------------------- 5. the porters' pousse-pousse: mangoes, the fee once, the sale waits for the porter
  log('the porters');
  await page.waitForTimeout(4000);
  await boardFromShop();
  const a3 = await AT();
  const back = route({ x: a3.x, z: a3.z, yaw: a3.yaw }, { x: -64.3, z: 19, yaw: 0 }, { cruise: 7, avoid: await closedZones(page) });
  if (back) await pilot(page, t, 'teranga', back, { cruise: 7, stall: 60000, ms: 1200000, brakeAtEnd: true });
  await getOut();
  await roundCar(...AT_DIALLO);
  await talkTo('plateau:grossiste:diallo');
  const w6 = await wallet();
  await tapItem('^\\W*Mangues'); await tapItem('^\\W*4 cagettes');
  await tapItem('^\\W*Le pousse-pousse');
  const pp = await TR(), w7 = await wallet();
  check('four crates of mangoes (10 000 F) and the pousse-pousse (1 500 F): two lines, the lot with the porters', w6 - w7 === 11500 && pp.lot?.stage === 3 && pp.lot.fee === 1500 && pp.ledger.filter(e => /lot 3/.test(e.label)).length === 2, JSON.stringify({ paid: w6 - w7, lot: pp.lot }));
  check('Diallo has served the player’s two lots of the day', pp.lotsLeft === 0, JSON.stringify(pp.lotsLeft));
  await page.waitForTimeout(3000);
  const p1 = (await TR()).people.porter; await page.waitForTimeout(4000); const p2 = (await TR()).people.porter;
  check('the porter and his cart are on the street, walking', !!p1 && !!p2 && Math.hypot(p2.x - p1.x, p2.z - p1.z) > 2, JSON.stringify({ p1, p2 }));
  await shot('porter-leaves');
  await boardFromShop();
  const a4 = await AT();
  const fwd = route({ x: a4.x, z: a4.z, yaw: a4.yaw }, { x: 64.3, z: -100, yaw: Math.PI }, { cruise: 7, avoid: await closedZones(page) });
  if (fwd) await pilot(page, t, 'teranga', fwd, { cruise: 7, stall: 60000, ms: 1200000, brakeAtEnd: true });
  await getOut();
  await walkPath([[66.2, -90], AT_SALL], { tol: 0.8 });
  const early = await TR();
  if (early.lot && (await d(() => window.__dakar.state.data.playedMs)) < early.lot.eta) {
    await talkTo('plateau:comptoir:sall');
    const w8 = (await TR()).said.slice(-1)[0] ?? '';
    check('ahead of the porter: Awa waits for the pousse-pousse, nothing sold or paid', /pas encore arrivé/.test(w8) && (await wallet()) === w7, w8);
    await page.waitForFunction(() => { const l = window.__dakar.trade.info().lot; return !l || window.__dakar.state.data.playedMs >= l.eta; }, null, { timeout: 400000 });
    await page.waitForTimeout(1500);
  }
  await shot('porter-arrived');
  check('« Parler à Awa » once the porter is there', await talkTo('plateau:comptoir:sall'));
  await tapItem('^\\W*Vendre');
  const sold3 = await TR(), cards3 = await d(() => window.__dakar.trade.info().cards.map(k => ({ ...k, rows: k.rows.map(r => r.replace(/\s/g, ' ')) }))), card3 = cards3.find(k => /^Lot 3 · /.test(k.title));
  check('sold: +13 600 F; the card counts the transport: Transport −1 500 F, Bénéfice +2 100 F', (await wallet()) - w7 === 13600 && !!card3 && card3.rows.some(r => /^Transport: −1 500/.test(r)) && card3.rows.some(r => /^Bénéfice: \+2 100/.test(r)), JSON.stringify(card3));
  await page.waitForTimeout(3500); await shot('mango-sale-card');
  const all = sold3.ledger, totals = sold3.counters;
  check('every lot reconciles: the ledger lines of the trade sum to the saved total profit', sumLedger(all) === totals.pl_profit_total, JSON.stringify({ ledger: sumLedger(all), total: totals.pl_profit_total, lines: all.length }));
}

check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`${total - failed}/${total} checks passed`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
