// 1.0.1, B2 « Coups de pouce »: the one-time bonus ladder, played with REAL touch on a phone page (390 × 844; every tap and the joystick go through
// Chrome's input pipeline, scripts/lib/realTouch.mjs). A new game in Pikine: the first three steps for real — a Tiak Tiak delivery taken on the phone's
// board and walked, a first piece of furniture ordered from the phone, the lent Tiak Tiak bike ridden, parked, left, found again with « Mes véhicules »
// › « Localiser » — each paid once (« Coup de pouce : +… », one wallet line), the goal line naming the next step each time; the phone's list in
// « Travailler »; a real reload pays nothing again; a save whose marks are gone (as before 1.0.1) is credited once, in ONE notice.
// DEBUG hooks used: `pouce()` / `board()` / `tiakPoints()` / `interactables()` / `estate()` / `state` / `marked()` / `pos()` / `focus()` / `tiak.at()` /
// `cityGeometry()` / `furnitureList()` (read); `place()` only to turn the player toward the bike (boardVehicle); needs set to 100 (a rested courier);
// `save()`; the « older save » is made by removing the ladder's marks from the save (labelled).
// Every load passes `?pouce`: a `?debug` run on a test host keeps the ladder off without it (src/economy/pouce.ts `pouceWanted`), so that the other checks'
// wallet deltas see only what they measure.
// Usage: node scripts/check-coups-de-pouce.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4825/', out = 'docs/proof/release-1.0.1/coups-de-pouce'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0;
const results = [];
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${ok ? '' : String(detail).slice(0, 400)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ }
  // every « Coup(s) de pouce » card as it appears (a card lasts 9 s and the next one replaces it: the check reads this list, not the screen)
  window.__notices = [];
  new MutationObserver(list => { for (const m of list) for (const e of m.addedNodes) if (e.nodeType === 1 && e.classList?.contains('mo') && /Coups? de pouce/.test(e.textContent)) window.__notices.push(e.textContent.replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ').trim()); })
    .observe(document, { childList: true, subtree: true });
});
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
let n = 0; const shot = async name => { await wait(500); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 72 }); };
const flat = x => (x ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const T = { timeout: 120000 };
let t;

// ------------------------------------------------------------------ helpers: taps, sheets, the phone, the way on foot
const settled = () => until(() => [...document.querySelectorAll('#modal, #modal *, #phone, #phone *')].every(e => e.getAnimations().every(a => a.playState === 'finished' || a.effect?.getComputedTiming().iterations === Infinity)), null, 6000);
/** A finger taps the first element of `sel` whose text matches, once it has come to rest (scrolled into view first). */
async function tapText(sel, re) {
  const find = ([s, r, scroll]) => { const e = [...document.querySelectorAll(s)].find(x => r === '.' || new RegExp(r).test(x.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' '))); if (!e) return null; if (scroll) e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
  if (!(await d(find, [sel, re.source, true]))) return false;
  await settled();
  let c = await d(find, [sel, re.source, false]), still = 0;
  for (let i = 0; i < 20 && still < 3; i++) { await wait(160); const p = await d(find, [sel, re.source, false]); if (!p) return false; still = Math.hypot(p.x - c.x, p.y - c.y) < 0.5 ? still + 1 : 0; c = p; }
  await t.down(9, c.x, c.y); await wait(60); await t.up(9); return true;
}
/** A sheet row tapped, then the next sheet awaited (its text changes); once more if a loaded machine dropped the tap. */
async function tapRow(re, after = 700) {
  for (let k = 0; k < 2; k++) {
    const before = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
    if (!(await tapText('#modal.on .item', re))) return false;
    if (await until(b => (document.querySelector('#modal.on')?.textContent ?? '') !== b, before, 8000)) { await wait(after); return true; }
  }
  return false;
}
const phoneInfo = () => d(() => window.__dakar.phoneInfo());
/** ☰ → the phone's home screen → a tile, with fingers. */
async function openApp(app) {
  if (await d(() => !!document.querySelector('#modal.on'))) await closeSheet();
  if (!(await phoneInfo()).open) { await wait(500); await t.tap('#menuBtn'); await until(() => window.__dakar.phoneInfo().open); }
  await wait(600);
  if ((await phoneInfo()).screen !== 'home') { await tapText('#phone [data-nav="home"]', /./); await until(() => window.__dakar.phoneInfo().screen === 'home'); await wait(500); }
  await until(a => !!document.querySelector(`#phone [data-app="${a}"]`), app, 20000);
  await d(a => document.querySelector(`#phone [data-app="${a}"]`)?.scrollIntoView({ block: 'center' }), app); await wait(400);
  await t.tap(`#phone [data-app="${app}"]`);
}
async function closePhone() { if ((await phoneInfo()).open) { await tapText('#phone [data-nav="close"]', /./); await until(() => !window.__dakar.phoneInfo().open && window.__dakar.pos().mode === 'play', null, 20000); } }
async function closeSheet() {
  if (await tapText('#modal.on .item.close', /./)) await until(() => !document.querySelector('#modal.on'), null, 10000);
  await until(() => window.__dakar.pos().mode === 'play', null, 10000); await wait(400);
}
const goal = () => d(() => (document.querySelector('#goal .gt')?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim());
const pouce = () => d(() => window.__dakar.pouce());
const bonusLines = () => d(() => window.__dakar.state.data.ledger.filter(l => /^Coup de pouce/.test(l.label)).map(l => ({ label: l.label, amount: l.amount })));
const wallet = () => d(() => window.__dakar.state.wallet);
const rest = () => d(() => { const x = window.__dakar.state.data.needs; x.energie = 100; x.faim = 100; x.hygiene = 100; });   // DEBUG: a rested courier (the check is about the ladder, not the needs)
/** The notice of the last payment: the moment card that says « Coup de pouce(s) : +… F » (it may wait behind the delivery's card). */
const noticeNow = () => d(() => [...document.querySelectorAll('#toast .mo')].map(e => e.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()).find(x => /Coups? de pouce/.test(x)) ?? null);
/** The notices seen since the page loaded (window.__notices, filled as each card appears). */
const notices = () => d(() => window.__notices ?? []);
async function waitNotice(re, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const x = (await notices()).find(v => re.test(v)); if (x) return x;
    // the delivery's own card (the pay, the next run) is first: a tap on its text dismisses it (never on « Accepter »), and the notice comes next
    const bc = await d(() => { const e = document.querySelector('#toast .mo.bc .bc-sub, #toast .mo.bc b'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (bc) { await t.down(8, bc.x, bc.y); await wait(60); await t.up(8); }
    await wait(500);
  }
  return null;
}
/** A way on foot to within `reach` m of (x, z), round the district's colliders and the parked bike (1 m cells; the planner of check-tiak-everywhere). */
async function wayTo(x, z, reach = 1.4) {
  const { me, cols, cars } = await d(() => ({ me: window.__dakar.pos(), cols: window.__dakar.cityGeometry().colliders.map(c => [c.x0, c.z0, c.x1, c.z1]),
    cars: ['tiak', 'moto'].map(k => { try { const a = window.__dakar[k]?.at?.(); return a && !a.driving ? [a.x, a.z] : null; } catch { return null; } }).filter(Boolean) }));
  const H = 200, N = 2 * H, R = 0.75, blocked = new Uint8Array(N * N);
  for (const [x0, z0, x1, z1] of [...cols, ...cars.filter(([cx, cz]) => Math.hypot(cx - me.x, cz - me.z) > 3).map(([cx, cz]) => [cx - 1.2, cz - 1.2, cx + 1.2, cz + 1.2])]) for (let j = Math.max(0, Math.floor(z0 - R + H)); j <= Math.min(N - 1, Math.floor(z1 + R + H)); j++) for (let i = Math.max(0, Math.floor(x0 - R + H)); i <= Math.min(N - 1, Math.floor(x1 + R + H)); i++) {
    const cx = i - H + 0.5, cz = j - H + 0.5; if (cx > x0 - R && cx < x1 + R && cz > z0 - R && cz < z1 + R) blocked[j * N + i] = 1;
  }
  const cell = (px, pz) => Math.floor(pz + H) * N + Math.floor(px + H), start = cell(me.x, me.z); blocked[start] = 0;
  const prev = new Int32Array(N * N).fill(-1), queue = [start]; prev[start] = start;
  let g = -1;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % N, j = Math.floor(k / N);
    if (Math.hypot(i - H + 0.5 - x, j - H + 0.5 - z) < reach) { g = k; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const nn = b * N + a; if (prev[nn] >= 0 || blocked[nn]) continue;
      if (di && dj && (blocked[j * N + a] || blocked[b * N + i])) continue;
      prev[nn] = k; queue.push(nn);
    }
  }
  if (g < 0) return null;
  const cells = []; for (let k = g; k !== start; k = prev[k]) cells.unshift(k);
  const pts = cells.map(k => ({ x: (k % N) - H + 0.5, z: Math.floor(k / N) - H + 0.5 }));
  const clear = (a, b) => { const m = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4); for (let s = 0; s <= m; s++) if (blocked[cell(a.x + ((b.x - a.x) * s) / m, a.z + ((b.z - a.z) * s) / m)]) return false; return true; };
  const way = []; let from = { x: me.x, z: me.z };
  for (let i = 0; i < pts.length;) { let j = Math.min(pts.length - 1, i + 40); while (j > i && !clear(from, pts[j])) j--; way.push(pts[j]); from = pts[j]; i = j + 1; }
  return way;
}
/** On foot with the joystick along that way until `done()` holds (or the place is reached); planned again when held up. */
async function walkWay(x, z, done = null, tol = 1.4) {
  for (let plan = 0; plan < 6; plan++) {
    const way = await wayTo(x, z, tol); if (!way) break;
    for (const p of way) {
      await walkTo(page, t, p.x, p.z, { tol: 0.9, ms: 40000 });
      if (done && await d(done)) return true;
      const me = await d(() => window.__dakar.pos());
      if (Math.hypot(x - me.x, z - me.z) <= tol) return done ? !!(await until(done, null, 5000)) : true;
      if (Math.hypot(me.x - p.x, me.z - p.z) > 2.5) break;
    }
  }
  return done ? !!(await d(done)) : false;
}

const ready = () => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play' && window.__dakar.pouce && window.__dakar.phoneInfo, null, { timeout: 240000 });
await page.goto(`${base}?debug&pouce&touch&heure=11`, { timeout: 180000 });
await ready();
t = await realTouch(page);
await wait(2500);
let p = await pouce();
check('a new game: the ladder has 9 steps, 300 000 F in all, nothing paid; the next is the first delivery (+10 000 F)', p.on === true && p.count === 9 && p.total === 300_000 && p.done === 0 && p.next?.id === 'livraison' && p.next.amount === 10_000 && (await bonusLines()).length === 0, JSON.stringify(p.next));
const w0 = await wallet();
const g0 = await goal();
check('the goal line, at the start: Tonton Ibou\'s welcome (the first moments) or the first coup de pouce', /Coup de pouce \+10 000 F : ta première livraison Tiak Tiak|Tonton Ibou/.test(g0), g0);
await shot('depart');
// the phone's list, in « Travailler »
await openApp('travailler');
await until(() => !!document.querySelector('#phone .wk-pouce'), null, 20000);
const card0 = await d(() => (document.querySelector('#phone .wk-pouce')?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim());
check('« Travailler » shows the next coup de pouce: the first delivery, +10 000 F', /Ta première livraison Tiak Tiak/.test(card0) && /\+10 000 F/.test(card0), card0);
await tapText('#phone .wk-pouce-all summary', /coups de pouce/); await wait(700);
const list0 = await d(() => [...document.querySelectorAll('#phone .wk-pouce-all .pk-row')].map(e => e.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()));
check('the whole ladder on a tap: nine steps with their amounts, 10 000 F to 70 000 F', list0.length === 9 && /\+10 000 F/.test(list0[0]) && /\+70 000 F/.test(list0[8]), JSON.stringify(list0));
await shot('telephone-travailler');
await closePhone();

// ------------------------------------------------------------------ step 1: the first Tiak Tiak delivery, taken on the phone's board and walked
await rest();
await openApp('travail');
await until(() => document.querySelectorAll('#modal.on .dcard.job').length > 0, null, 60000);
const board = await d(() => window.__dakar.board()), cards = await d(() => [...document.querySelectorAll('#modal.on .dcard.job')].map(e => e.dataset.route));
const run = board.filter(b => b.toHub === 'pikine' && cards.includes(b.id)).sort((a, b) => a.metres - b.metres)[0];
check('the Tiak Tiak board shows runs; the shortest one inside Pikine is chosen', !!run, JSON.stringify(board.map(b => [b.id, b.toHub, b.metres])));
const card = page.locator(`#modal.on .dcard.job[data-route="${run.id}"]`).first();
await card.scrollIntoViewIfNeeded(); await settled(); await wait(400);
{ const b = await card.boundingBox(); await t.down(5, b.x + b.width / 2, b.y + b.height / 2); await wait(60); await t.up(5); }
check('a tap on its card takes the run', await until(r => window.__dakar.activeJob()?.routeId === r, run.id, 60000));
await until(() => window.__dakar.pos().mode === 'play', null, 30000);
// each leg walked to the game's own delivery marker (where the parcel waits, then where it goes): the hand-over is within 3.5 m of it
const markerNow = () => d(() => { const m = window.__dakar.marker(); return m?.visible ? { x: m.x, z: m.z } : null; });
await until(() => window.__dakar.marker()?.visible, null, 30000);
const mk1 = await markerNow();
check('walked to the pick-up with the joystick: the parcel is in hand', !!mk1 && await walkWay(mk1.x, mk1.z, () => window.__dakar.activeJob()?.stage === 'deliver', 2.8), JSON.stringify({ mk1, job: await d(() => window.__dakar.activeJob()) }));
await rest();
await until(() => window.__dakar.marker()?.visible, null, 30000);
const mk2 = await markerNow();
let handed = !!mk2 && await walkWay(mk2.x, mk2.z, () => !window.__dakar.activeJob(), 2.8);
if (!handed && mk2) handed = await walkWay(mk2.x, mk2.z, () => !window.__dakar.activeJob(), 2.4);   // held up by passers-by: once more from where the courier stands
check('walked to the drop-off: delivered and paid', handed, JSON.stringify({ mk2, me: await d(() => window.__dakar.pos()), job: await d(() => window.__dakar.activeJob()) }));
const n1 = await waitNotice(/Coup de pouce : \+10 000 F/);
check('the notice: « Coup de pouce : +10 000 F » · the first delivery · the next coup de pouce named', !!n1 && /Ta première livraison Tiak Tiak/.test(n1) && /Prochain coup de pouce : un premier meuble chez toi \(\+15 000 F\)/.test(n1), n1);
await shot('coup-de-pouce-livraison');
let lines = await bonusLines();
check('paid once: one wallet line « Coup de pouce : Ta première livraison Tiak Tiak » +10 000 F', lines.length === 1 && lines[0].amount === 10_000 && /Ta première livraison Tiak Tiak/.test(lines[0].label), JSON.stringify(lines));
await until(() => /Coup de pouce \+15 000 F/.test(document.querySelector('#goal .gt')?.textContent ?? ''), null, 20000);
const g1 = await goal();
check('the goal line now names the next: « Coup de pouce +15 000 F : un premier meuble chez toi »', /Coup de pouce \+15 000 F : un premier meuble chez toi/.test(g1), g1);
await shot('ligne-objectif-meuble');

// ------------------------------------------------------------------ step 2: a first piece of furniture, ordered from the phone
const pieces = await d(() => window.__dakar.furnitureList());
const cheap = pieces.filter(f => f.price <= 9000).sort((a, b) => a.price - b.price)[0];
const ROOM = { sofa: 'Salon', chair: 'Salon', table: 'Salon', shelf: 'Salon', dining: 'Salle à manger', bed: 'Chambre', mattress: 'Chambre', wardrobe: 'Chambre', kitchen: 'Cuisine', appliance: 'Cuisine', bath: 'Salle de bain', desk: 'Bureau', tv: 'Télé et musique', radio: 'Télé et musique', lamp: 'Lumière et déco', decor: 'Lumière et déco', rug: 'Lumière et déco', mirror: 'Lumière et déco', plant: 'Lumière et déco', outdoor: 'Jardin et piscine' };
const wb2 = await wallet();
await openApp('maison');
check('« Mes meubles » from the phone: « Commander chez Keur Meubles »', await until(() => !!document.querySelector('#modal.on .item'), null, 20000) && await tapRow(/Commander chez Keur Meubles/));
check(`the shelf of the cheapest piece (${cheap.name}, ${cheap.price} F): « ${ROOM[cheap.type]} »`, await tapRow(new RegExp('^\\S*\\s*' + ROOM[cheap.type])));
check('the piece\'s row: its confirmation', await tapRow(new RegExp(cheap.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
check('« Acheter » with a tap', await tapRow(/^✅\s*Acheter/, 1200));
const n2 = await waitNotice(/Coup de pouce : \+15 000 F/);
check('the notice: « Coup de pouce : +15 000 F » · a first piece of furniture · the next named', !!n2 && /Un premier meuble chez toi/.test(n2) && /Prochain coup de pouce : un véhicule retrouvé avec « Mes véhicules » \(\+20 000 F\)/.test(n2), n2);
await shot('coup-de-pouce-meuble');
lines = await bonusLines();
check('paid once: the wallet paid the piece and got 15 000 F once', lines.length === 2 && lines.filter(l => /Un premier meuble chez toi/.test(l.label)).length === 1 && (await wallet()) === wb2 - cheap.price + 15_000, JSON.stringify({ lines, wb2, now: await wallet(), price: cheap.price }));
await closeSheet();
await until(() => /Coup de pouce \+20 000 F/.test(document.querySelector('#goal .gt')?.textContent ?? ''), null, 20000);
const g2 = await goal();
check('the goal line names the next: the Tiak Tiak bike, parked and found with « Mes véhicules » (+20 000 F)', /Coup de pouce \+20 000 F : monte sur une moto Tiak Tiak, gare-la, puis retrouve-la avec « Mes véhicules »/.test(g2), g2);
await shot('ligne-objectif-vehicule');

// ------------------------------------------------------------------ step 3: the lent bike ridden, parked, left; found again with « Mes véhicules » › « Localiser »
await rest();
await until(() => !!window.__dakar.tiak?.at(), null, 60000);
const beforeBike = await d(() => window.__dakar.pos());
{ // to its left side with the planner (round the buildings), then « Monter » with the action button (scripts/lib/realTouch.mjs boardVehicle)
  const c = await d(() => window.__dakar.tiak.at());
  await walkWay(c.x + Math.cos(c.yaw) * 2.0, c.z - Math.sin(c.yaw) * 2.0, null, 1.0);
  try { await boardVehicle(page, t, 'tiak'); } catch (e) { console.log('  ' + e.message); }
}
const a0 = await d(() => window.__dakar.tiak.at());
check('on the Tiak Tiak bike (« Monter » with the action button)', a0?.driving === true, JSON.stringify(a0));
{ const g = await t.centre('#ridepad .rp-gas'); await t.down(7, g.x, g.y); }                        // a finger on the gas, then on the brake (as check-tiak-moto rides it)
await until(() => (window.__dakar.tiak.at()?.speed ?? 0) > 3, null, 40000);
await t.up(7); { const b = await t.centre('#ridepad .rp-brake'); await t.down(8, b.x, b.y); }
await until(() => Math.abs(window.__dakar.tiak.at().speed) < 0.3, null, 20000);
await t.up(8); await wait(400);
await tapText('#ridepad .rp-off', /./);
check('ridden a little and parked: « Descendre »', await until(() => window.__dakar.tiak.at()?.driving === false, null, 20000));
const bike = await d(() => window.__dakar.tiak.at());
await wait(800);
const g3 = await goal();
check('the goal line follows: now « retrouve ton véhicule garé : téléphone › Mes véhicules › Localiser »', /retrouve ton véhicule garé : téléphone › Mes véhicules › Localiser/.test(g3), g3);
// away from it, on foot: about twenty metres down the street
const me0 = await d(() => window.__dakar.pos());
let away = Math.hypot(beforeBike.x - bike.x, beforeBike.z - bike.z) > 14 ? beforeBike : null;       // back where the player came from, or a place the planner can reach
for (const r of [20, 26, 32]) { for (let k = 0; k < 16 && !away; k++) { const a = (k * Math.PI) / 8, q = { x: bike.x + Math.sin(a) * r, z: bike.z + Math.cos(a) * r }; if (await wayTo(q.x, q.z, 1.4)) away = q; } if (away) break; }
await walkWay(away.x, away.z, null, 2.0);
const me1 = await d(() => window.__dakar.pos());
check('walked away from the bike with the joystick', Math.hypot(me1.x - bike.x, me1.z - bike.z) > 12, JSON.stringify({ from: me0, at: me1, bike }));
await openApp('vehicules');
await until(() => !!document.querySelector('#phone .vh'), null, 30000);
const vh = await d(() => [...document.querySelectorAll('#phone .vh')].map(e => e.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()));
check('« Mes véhicules » lists the Tiak Tiak bike, parked, with « Localiser »', vh.some(x => /Moto Tiak Tiak/.test(x) && /Localiser/.test(x)), JSON.stringify(vh));
await shot('mes-vehicules');
check('« Localiser » with a tap: the marker is on the bike', await tapText('#phone .vh [data-act="locate"]', /Localiser/) && await until(() => window.__dakar.marked()?.id === 'vehicle:tiak', null, 20000), JSON.stringify(await d(() => window.__dakar.marked())));
await wait(1200);
await closePhone();
await until(() => /Moto Tiak Tiak/.test(document.querySelector('#goal .gt')?.textContent ?? ''), null, 20000);
const g4 = await goal();
check('the goal line leads to it (its distance)', /Moto Tiak Tiak/.test(g4), g4);
await shot('localiser-ligne-objectif');
check('walked back to the bike: « Te voilà », found', await walkWay(bike.x, bike.z, () => (window.__dakar.state.data.counters['vehicule:retrouve'] ?? 0) >= 1, 3.0), JSON.stringify({ bike, me: await d(() => window.__dakar.pos()), marked: await d(() => window.__dakar.marked()) }));
const n3 = await waitNotice(/Coup de pouce : \+20 000 F/);
check('the notice: « Coup de pouce : +20 000 F » · found with « Mes véhicules » · the next named', !!n3 && /Un véhicule retrouvé avec « Mes véhicules »/.test(n3) && /Prochain coup de pouce : une livraison vers un autre quartier \(\+25 000 F\)/.test(n3), n3);
await shot('coup-de-pouce-vehicule');
lines = await bonusLines();
check('paid once: three wallet lines in all, 10 000 + 15 000 + 20 000 F', lines.length === 3 && lines.reduce((s, l) => s + l.amount, 0) === 45_000, JSON.stringify(lines));
await until(() => /Coup de pouce \+25 000 F/.test(document.querySelector('#goal .gt')?.textContent ?? ''), null, 20000);
const g5 = await goal();
check('the goal line names the next: « Coup de pouce +25 000 F : une livraison Tiak Tiak vers un autre quartier »', /Coup de pouce \+25 000 F : une livraison Tiak Tiak vers un autre quartier/.test(g5), g5);
await shot('ligne-objectif-quartiers');
await openApp('travailler');
await until(() => !!document.querySelector('#phone .wk-pouce'), null, 20000);
await tapText('#phone .wk-pouce-all summary', /coups de pouce/); await wait(700);
const list1 = await d(() => ({ sum: (document.querySelector('#phone .wk-pouce-all summary')?.textContent ?? '').replace(/[  ]/g, ' '), rows: [...document.querySelectorAll('#phone .wk-pouce-all .pk-row')].map(e => e.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()) }));
check('« Travailler »: 3 received (+45 000 F of 300 000 F), the three ticked, the fourth next', /3 reçus \(\+45 000 F sur 300 000 F\)/.test(list1.sum) && list1.rows.slice(0, 3).every(r => /^✅/.test(r) && /reçu/.test(r)) && /^🎁/.test(list1.rows[3]), JSON.stringify(list1));
await shot('telephone-trois-recus');
await closePhone();
await d(() => window.__dakar.save());
const kept = { wallet: await wallet(), lines: await bonusLines(), counters: await d(() => Object.fromEntries(Object.entries(window.__dakar.state.data.counters).filter(([k]) => k.startsWith('pouce:')))) };

// ------------------------------------------------------------------ a real reload: nothing is paid again
await page.goto(`${base}?debug&pouce&touch&heure=11`, { timeout: 180000 });
await ready(); t = await realTouch(page); await wait(5000);
p = await pouce();
const w2 = await wallet(), l2 = await bonusLines();
check('after a reload: the same three steps paid, nothing paid again (the wallet within a few francs of a city hour, the lines the same)', p.done === 3 && l2.length === 3 && JSON.stringify(l2) === JSON.stringify(kept.lines) && Math.abs(w2 - kept.wallet) < 500, JSON.stringify({ was: kept.wallet, now: w2, lines: l2.length }));
check('no notice of a coup de pouce at load', !(await noticeNow()));
check('the marks are in the save: pouce:livraison, pouce:meuble, pouce:vehicule', JSON.stringify(await d(() => Object.fromEntries(Object.entries(window.__dakar.state.data.counters).filter(([k]) => k.startsWith('pouce:'))))) === JSON.stringify(kept.counters), JSON.stringify(kept.counters));
await shot('apres-rechargement');

// ------------------------------------------------------------------ a save from before 1.0.1 (DEBUG: the ladder's marks removed from the save): credited once, in ONE notice
await d(() => { const c = window.__dakar.state.data.counters; for (const k of Object.keys(c)) if (k.startsWith('pouce:')) delete c[k]; window.__dakar.save(); });
await page.goto(`${base}?debug&pouce&touch&heure=11`, { timeout: 180000 });
await ready(); t = await realTouch(page);
const wOld = await d(() => JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')).wallet);
const n4 = await waitNotice(/Coups de pouce : \+45 000 F/, 30000);
check('an older save: the three steps already done are credited in ONE notice « Coups de pouce : +45 000 F »', !!n4 && /Pour ce que tu as déjà fait : ta première livraison Tiak Tiak, un premier meuble chez toi, un véhicule retrouvé avec « Mes véhicules »/.test(n4), n4);
await shot('ancienne-sauvegarde-un-seul-avis');
await wait(3000);
const cardsNow = await d(() => [...document.querySelectorAll('#toast .mo')].filter(e => /Coups? de pouce/.test(e.textContent)).length);
check('one notice, not a burst', cardsNow <= 1, String(cardsNow));
const lOld = await bonusLines();
check('…paid once each (three more wallet lines, one per step, +45 000 F)', lOld.length === 6 && Math.abs((await wallet()) - wOld - 45_000) < 500, JSON.stringify({ lines: lOld.length, was: wOld, now: await wallet() }));
await d(() => window.__dakar.save());
await page.goto(`${base}?debug&pouce&touch&heure=11`, { timeout: 180000 });
await ready(); await wait(5000);
check('and reloaded once more: nothing again', (await bonusLines()).length === 6 && !(await noticeNow()));

check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, when: new Date().toISOString(), passed: total - failed, total, results, errors: errors.slice(0, 10) }, null, 1));
console.log(failed ? `${failed}/${total} FAILED` : `${total}/${total} passed`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
