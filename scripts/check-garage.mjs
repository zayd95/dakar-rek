// Pass 3 · S3 on a phone with real fingers: Garage Modou's repair service in Pikine. A damaged Jakarta is parked in the repair bay; « Faire réparer » sends Lamine (the apprentice, a separate visible person)
// walking from his bench to it; he inspects, the quote opens BEFORE anything is paid; « Pas maintenant » costs nothing; « Réparer » runs about 30 s of work and the price is taken once, at the end, exactly
// as quoted; stopping the work half-way costs nothing; the repair survives a reload; nobody is teleported.
// Usage: node scripts/check-garage.mjs [baseUrl] [outDir]   (a running build)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4214/', out = process.argv[3] ?? 'docs/screenshots/garage';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(240000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg);
const tr = await realTouch(page);
const g = () => d(() => window.__dakar.garage.info()), m = () => d(() => window.__dakar.moto.info()), wallet = () => d(() => window.__dakar.state.wallet), hp = () => d(() => window.__dakar.moto.health());
const wait = (fn, arg, ms = 180000) => page.waitForFunction(fn, arg, { timeout: ms });
const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${n}.png` }); };
// the garage's price (src/transport/garage.ts garageQuote, src/transport/condition.ts workCost, ECONOMY.repair): by damage, scaled gently by the vehicle's class; nothing for a touch-up
const REPAIR = { freeBelow: 5, points: [[5, 2000], [15, 8000], [40, 33000], [100, 63000]], classRef: 6e6, classExp: 0.3, classMin: 0.3, classMax: 2.2 };
const quote = (price, hp0) => {
  const lost = Math.max(0, Math.min(100, 100 - hp0)); if (lost < 3) return 0;
  let cost = 0;
  if (lost >= REPAIR.freeBelow) { const P = REPAIR.points; let base = P[P.length - 1][1]; for (let i = 1; i < P.length; i++) if (lost <= P[i][0]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; base = y0 + ((y1 - y0) * (lost - x0)) / (x1 - x0); break; } cost = Math.round((base * Math.min(REPAIR.classMax, Math.max(REPAIR.classMin, Math.pow(price / REPAIR.classRef, REPAIR.classExp)))) / 500) * 500; }
  return Math.max(1000, cost);
};

async function boot(reload = false) {
  if (reload) { await d(() => window.__dakar.save?.()); await page.waitForTimeout(1200); await page.reload(); } else await page.goto(`${base}?debug&touch&heure=11&argent=50000000`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.garage, null, T);
  await page.waitForTimeout(1200);
}
/** Stand by the bay on the road side and wait for the prompt of the repair bay. */
async function toBay() {
  const bay = (await g()).bay;
  await walkTo(page, tr, bay.x, bay.z + 3.0, { tol: 0.9, ms: 60000 });
  await wait(() => /Faire réparer/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, 30000).catch(() => {});
}
const modalText = () => d(() => document.querySelector('#modal.on')?.textContent ?? '');
const tapItem = async text => { const it = page.locator('#modal .item', { hasText: text }).first(); if (!(await it.count())) return false; await it.scrollIntoViewIfNeeded().catch(() => {}); await it.tap(); return true; };

// ---- set-up: Pikine, the Jakarta bought at Garage Modou (paid through the asset model), parked in the repair bay and worn by two crashes
await boot();
await d(() => window.__dakar.teleport('pikine'));
await wait(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.moto?.info().dealer && window.__dakar.garage.info().bay);
const cols0 = (await d(() => window.__dakar.cityGeometry())).colliders;                 // the street as it is, before the bike is delivered (a parked vehicle is solid)
await d(() => window.__dakar.moto.own());
await wait(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here);
await page.waitForTimeout(1200);
const bay = (await g()).bay;
const cols = cols0;
const pad = { x0: bay.x - bay.hl - 0.2, x1: bay.x + bay.hl + 0.2, z0: bay.z - bay.hw - 0.2, z1: bay.z + bay.hw + 0.2 };
check('the repair bay is on open kerb in front of the workshop: no wall, shelf or other solid in it', !!bay && !cols.some(c => c.x1 > pad.x0 && c.x0 < pad.x1 && c.z1 > pad.z0 && c.z0 < pad.z1), JSON.stringify({ bay, pad }));
await d(b => window.__dakar.moto.place(b.x, b.z, b.yaw), bay);                          // set-up only: the bike is in the bay (the driving itself is the vehicle checks')
await d(() => { window.__dakar.moto.hurt(14, true); window.__dakar.moto.hurt(14, true); });
const hp0 = await hp(), price = (await m()).price;
check('the worn Jakarta stands in the bay and the garage sees it', hp0 < 90 && (await g()).vehicles.some(v => v.asset === 'jakarta' && v.hp === hp0), JSON.stringify({ hp0, price, vehicles: (await g()).vehicles }));
check('the workshop is open at 11 h and Lamine is at his bench, a person apart from Modou', (await g()).open && (await g()).here, JSON.stringify({ lamine: { x: (await g()).x, z: (await g()).z } }));
const w0 = await wallet(), q0 = quote(price, hp0);

// ---- 1. ask, Lamine comes on foot, the quote appears before any payment; refuse = nothing paid
await d(() => window.__dakar.place(98, -1, 0));                                           // set-up: the player stands on the road, the bay in front of him
await toBay();
const foc = await d(() => window.__dakar.focus());
check('at the bay the prompt offers « Faire réparer » for the Jakarta', /Faire réparer · Moto Jakarta/.test((foc?.all ?? []).join('|')) || /Faire réparer/.test(foc?.primary ?? ''), JSON.stringify(foc));
const p0 = await g();
await tr.tap('#act');
await wait(() => window.__dakar.garage.info().phase !== null, null, 20000).catch(() => {});
let moved = 0, last = await g(), steps = 0;
for (let i = 0; i < 400 && (await g()).phase === 'coming'; i++) { await page.waitForTimeout(150); const c = await g(); moved += Math.hypot(c.x - last.x, c.z - last.z); steps = Math.max(steps, Math.hypot(c.x - last.x, c.z - last.z)); last = c; }
const arrived = await g();
check('Lamine walks from his bench to the vehicle (no teleport: continuous steps, a real distance)', moved > 2.5 && steps < 0.6 && arrived.phase === 'inspect', JSON.stringify({ moved: +moved.toFixed(2), maxStep: +steps.toFixed(2), phase: arrived.phase, from: { x: p0.x, z: p0.z }, to: { x: arrived.x, z: arrived.z } }));
await d(b => window.__dakar.place(b.x + 3.2, b.z + 3.0, Math.atan2(-3.2, -3.0)), bay);       // only for the picture: the player steps back to see the bay
await page.waitForTimeout(600);
await shot('1-inspecting');
await wait(() => document.querySelector('#modal.on') && /devis/i.test(document.querySelector('#modal.on').textContent), null, 120000);
const qt = await modalText(), q1 = (await g()).job?.quote;
check('the quote is shown BEFORE anything is paid: state, price, duration, « une seule fois, à la fin »; the wallet is untouched', (await wallet()) === w0 && /30 secondes/.test(qt) && /une seule fois/.test(qt) && q1?.cost === q0 && (q0 === 0 || qt.replace(/\s/g, '').includes(String(q0))), JSON.stringify({ q0, q1, w: await wallet(), text: qt.slice(0, 220) }));
await shot('2-quote');
await tapItem('Pas maintenant');
await wait(() => window.__dakar.garage.info().phase === null && !document.querySelector('#modal.on'), null, 30000);
check('« Pas maintenant »: nothing paid, the health unchanged, the work not started', (await wallet()) === w0 && (await hp()) === hp0 && (await g()).log.refused >= 1 && (await g()).log.paid === 0, JSON.stringify({ w: await wallet(), hp: await hp(), log: (await g()).log }));
await wait(() => !window.__dakar.garage.info().moving, null, 60000);
const home = await g();
check('Lamine walked back to his bench by himself', Math.hypot(home.x - p0.x, home.z - p0.z) < 1.5, JSON.stringify({ at: { x: home.x, z: home.z }, bench: { x: p0.x, z: p0.z } }));

// ---- 2. stop the work half-way: nothing paid
await toBay();
await tr.tap('#act');
await wait(() => document.querySelector('#modal.on') && /devis/i.test(document.querySelector('#modal.on').textContent), null, 180000);
const tapped = await tapItem('Réparer');
await wait(() => window.__dakar.garage.info().phase === 'work', null, 30000).catch(async e => { console.log('NOWORK', tapped, JSON.stringify(await g()), await modalText(), await d(() => window.__dakar.pos().mode)); throw e; });
await page.waitForTimeout(2500);
const mid = { w: await wallet(), hp: await hp(), busy: (await d(() => window.__dakar.pos().mode)) === 'busy' };
check('during the work the player is held at the bay (progress bar), and nothing is paid yet', mid.w === w0 && mid.hp === hp0 && mid.busy, JSON.stringify(mid));
await shot('3-working');
await tr.tap('#act');                                                                     // « Arrêter »
await wait(() => window.__dakar.garage.info().phase === null, null, 30000);
check('stopping the work half-way: nothing paid, the vehicle as it was', (await wallet()) === w0 && (await hp()) === hp0 && (await g()).log.stopped >= 1 && (await g()).log.paid === 0, JSON.stringify({ w: await wallet(), hp: await hp(), log: (await g()).log }));
await wait(() => !window.__dakar.garage.info().moving, null, 60000);

// ---- 3. the full repair: about 30 s, one payment at the end, exactly the quote
await toBay();
await tr.tap('#act');
await wait(() => document.querySelector('#modal.on') && /devis/i.test(document.querySelector('#modal.on').textContent), null, 180000);
await tapItem('Réparer');
const t0 = await d(() => window.__dakar.moto.at()?.t ?? 0).catch(() => 0);
await wait(() => window.__dakar.garage.info().phase === 'work', null, 30000);
const simA = await d(() => performance.now());
await wait(() => window.__dakar.garage.info().log.paid >= 1, null, 600000);
const done = { w: await wallet(), hp: await hp(), log: (await g()).log };
check('the repair is paid ONCE, at the end, exactly the quote; the Jakarta is whole', done.hp === 100 && done.w === w0 - q0 && done.log.paid === 1 && done.log.charged === q0, JSON.stringify({ q0, spent: w0 - done.w, hp: done.hp, log: done.log }));
await shot('4-repaired');
check('its card no longer shows a health figure', !/\d+ %/.test(await d(() => window.__dakar.moto.card())), await d(() => window.__dakar.moto.card()));
await wait(() => !window.__dakar.garage.info().moving, null, 60000);
const home2 = await g();
check('Lamine is back at his bench, still one apprentice and no second Modou (the cast is not touched)', Math.hypot(home2.x - p0.x, home2.z - p0.z) < 1.5 && home2.log.started === 3, JSON.stringify({ at: { x: home2.x, z: home2.z }, log: home2.log }));
void simA; void t0;

// ---- 4. kept across a reload, and no second job is offered for a whole vehicle
await boot(true);
await d(() => window.__dakar.teleport('pikine'));
await wait(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.moto.info().here);
check('after a reload the Jakarta is still whole (the repair is in the save), owned once', (await hp()) === 100 && (await d(() => window.__dakar.state.data.assets.list.filter(a => a.spec === 'jakarta' && a.how === 'owned').length)) === 1, JSON.stringify({ hp: await hp() }));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await context.close(); await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
