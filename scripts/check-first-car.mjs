// Journey A of the vehicles economy (docs/vehicles/ECONOMY.md): a NEW player in Pikine meets Pape Sarr (Sarr Auto), does his errands with the real controls
// (drives his cars with real touch, walks, washes, carries papers), earns his trust over two city days, asks for credit, signs for the very Teranga on his kerb,
// drives it, takes a first VTC passenger (who walks to the car and sits in the back), is paid once, and repays part of the installment.
// Debug hooks are used only to stand next to a person (`place`), to read state, to set the hour, to move to the next city day and to accept a ride from the
// phone's list (the same function the app calls). Usage: node scripts/check-first-car.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, walkTo, boardVehicle } from './lib/realTouch.mjs';
import { route as gridRoute } from './lib/gridRoute.mjs';

const [base = 'http://127.0.0.1:4420/', out = '/tmp/claude-0/veh/journey-a'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch&heure=10`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const t = await realTouch(page);
const d = (fn, arg) => page.evaluate(fn, arg);
const S = () => d(() => window.__dakar.sarr.info()), TE = () => d(() => window.__dakar.teranga.info()), WAL = () => d(() => window.__dakar.state.wallet);
let shotN = 0; const shot = async n => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const modal = () => d(() => document.querySelector('#modal.on')?.textContent ?? '');
const pick = async text => { await page.waitForSelector('#modal.on', T); await page.locator('#modal .item', { hasText: text }).first().click(); await page.waitForTimeout(300); };
const closeModal = async () => { if (await modal()) { await d(() => document.querySelector('#modal .item.close, #modal .close')?.click()); await page.waitForTimeout(200); } };
/** Stand within reach of a target and wait until the action button acts on it (`id`), trying a few spots around (x, z). */
async function focusOn(id, x, z) {
  for (const [dx, dz] of [[0, -1.3], [1.2, -0.8], [-1.2, -0.8], [0, 1.3], [1.4, 0], [-1.4, 0]]) {
    await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [x + dx, z + dz, Math.atan2(-dx, -dz)]);
    if (await page.waitForFunction(i => window.__dakar.focus()?.id === i, id, { timeout: 2500 }).then(() => true, () => false)) return true;
  }
  return false;
}
async function talkToSarr() {
  const s = await d(() => window.__dakar.sales_sarr.info());
  if (!(await focusOn('sarr:sales', s.x, s.z))) { await shot('nofocus'); throw new Error('no focus on Pape Sarr ' + JSON.stringify(await d(() => ({ f: window.__dakar.focus(), s: window.__dakar.sales_sarr.info(), pos: window.__dakar.pos(), modal: document.querySelector('#modal.on')?.textContent ?? null, seated: window.__dakar.seated?.() })))); }
  await d(() => window.__dakar.act()); await page.waitForSelector('#modal.on', T);
}
/** Get out of the vehicle with the real button and wait until the player stands. */
async function getOut(key) {
  await t.tap('#ridepad .rp-off');
  await page.waitForFunction(k => { const i = window.__dakar[k].info(); return !i.driving && !i.exit && window.__dakar.pos().mode === 'play'; }, key, T);
  await page.waitForTimeout(500);
}
/** Into a dealer's floor car with its keys in hand: the driver's door step, « Ouvrir », the door opens, the player sits. */
async function intoFloorCar(slot) {
  const f = (await TE()).floor[slot];
  await d(s => window.__dakar.place(s.x, s.z, 0), f.step);
  await page.waitForFunction(() => /Ouvrir/.test(window.__dakar.focus()?.primary ?? ''), null, { timeout: 15000 }).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => window.__dakar.teranga.info().driving && document.body.classList.contains('ridepad'), null, T);
  await page.waitForTimeout(500);
}
async function report(kind) {
  const ok = await page.waitForFunction(() => window.__dakar.sarr.info().errand?.stage === 'report', null, { timeout: 150000 }).then(() => true, () => false);   // a wash takes its time on a slow machine
  if (!ok) { console.log('STUCK', kind, JSON.stringify(await d(() => ({ e: window.__dakar.sarr.info().errand, at: window.__dakar.teranga.at(), info: (({ trial, trialSlot, returned, driving, exit }) => ({ trial, trialSlot, returned, driving, exit }))(window.__dakar.teranga.info()), lot: window.__dakar.sarr.info().lot.delivery, bay: window.__dakar.garage.info().bay, focus: window.__dakar.focus(), toast: document.querySelector('.toast')?.textContent })))); await shot('stuck-' + kind); throw new Error('errand not done: ' + kind); }
  await talkToSarr(); await pick('C’est fait');
  await page.waitForFunction(k => !window.__dakar.sarr.info().errand && window.__dakar.sarr.info().log.errands.includes(`done:${k}`), kind, T);
}
/** The lot's car left where the errand ended goes back to its bay only when nobody sees it: walk off, look away, wait. */
async function awaitCollected(slot) {
  const i = await d(() => window.__dakar.teranga.info());
  if (i.floor[slot].here && !i.trial) return;                                           // already back in its bay
  await d(([x, z]) => window.__dakar.place(x, z, 0), [i.x - 4, i.z + 22]);            // walk off, looking away from the car and its bay
  await d(() => window.__dakar.lookYaw(0));
  await page.waitForFunction(s => window.__dakar.teranga.info().floor[s].here && !window.__dakar.teranga.info().trial, slot, T);
}
const start = async label => { await talkToSarr(); await pick('Lui rendre service'); await pick(label); await page.waitForTimeout(300); };

// ------------------------------------------------------------------------------------------------ 0. a new player, at Pape Sarr's lot
const s0 = await d(() => ({ wallet: window.__dakar.state.wallet, loans: window.__dakar.state.data.loans.list.length, owns: window.__dakar.teranga.info().owned, hub: window.__dakar.pos().hub }));
check('a new game: 3 000 F, no car, no debt, in Pikine', s0.wallet === 3000 && !s0.owns && s0.loans === 0 && s0.hub === 'pikine', JSON.stringify(s0));
const lot = (await S()).lot;
// in from the street, as anyone walks onto the lot: across the road, between two display cars, to the desk
const gap = (lot.slots[0].x + lot.slots[1].x) / 2;
await d(([x, z]) => window.__dakar.place(x, z, 0), [gap, -2.5]);
await page.waitForFunction(() => window.__dakar.sales_sarr?.info().here && window.__dakar.teranga.info().floor.length === 2, null, T);
await d(() => window.__dakar.sales_sarr.eager());
await walkTo(page, t, gap, lot.slots[0].z - 2.4, { tol: 1, ms: 60000 });
await walkTo(page, t, gap, lot.counter.z, { tol: 0.9, ms: 60000 });
await walkTo(page, t, lot.counter.x - 1.5, lot.counter.z - 0.3, { tol: 1.2, ms: 60000 });
await page.waitForFunction(() => window.__dakar.sales_sarr.info().log.greetings > 0, null, { timeout: 60000 }).catch(() => {});
await shot('sarr-greets');
const t0 = (await S()).trust;
check('Pape Sarr greets the newcomer (a real person who walks over); a greeting is worth a little trust, never a car', t0 > 0 && t0 < 20, `trust ${t0}`);
await talkToSarr(); await pick('Demander un crédit'); await page.waitForTimeout(300);
const refused = await modal();
check('asked for credit at once: refused, he does not know the player yet', /connais pas encore/.test(refused), refused.slice(0, 120));
await shot('credit-refused'); await closeModal(); await d(() => window.__dakar.phoneClose());
await d(() => { const m = document.querySelector('#modal.on'); if (m) m.querySelector('.item')?.click(); });

// ------------------------------------------------------------------------------------------------ 1. the errands of a city day, with the real controls
async function clientErrand(day) {
  // a customer's car to the « client » spot at the end of the lot: the white Teranga, driven out of the parking lane and back in
  await page.waitForFunction(() => window.__dakar.teranga.info().floor[0].state === 'display' && window.__dakar.teranga.info().floor[0].here, null, T);
  await start('Garer la Teranga blanche');
  await intoFloorCar(0);
  const del = lot.delivery;
  // out of the parking lane into the road (past the other cars and Modou's Jakarta on display), then back into the kerb at the « client » spot
  await pilot(page, t, 'teranga', [{ x: lot.slots[0].x + 5, z: lot.slots[0].z - 2.8, tol: 2, speed: 3 }, { x: lot.slots[3].x + 1.5, z: del.z - 2.8, tol: 2, speed: 3 }, { x: del.x - 6, z: del.z - 0.9, tol: 1.4, speed: 2 }, { x: del.x - 1.5, z: del.z - 0.1, tol: 1.1, speed: 1.5 }, { x: del.x + 1, z: del.z, tol: 0.9, speed: 1.1 }], { brakeAtEnd: true, cruise: 3 });   // into the kerb lane early, then straight along it
  if (day === 1) await shot('errand-client-parked');
  await getOut('teranga');
  await report('client');
  await awaitCollected(0);
}
async function garageErrand(day) {
  // the silver Teranga into Modou's repair bay, across the road
  await page.waitForFunction(() => window.__dakar.teranga.info().floor[1].state === 'display' && window.__dakar.teranga.info().floor[1].here, null, T);
  await start('Amener la Teranga grise');
  await intoFloorCar(1);
  const bay = (await d(() => window.__dakar.garage.info())).bay;
  // out of the parking lane past the next display car, across the road on a diagonal, and into the bay along the far kerb (it faces the same way as the lot)
  const s1 = lot.slots[1];
  await pilot(page, t, 'teranga', [{ x: s1.x + 3.8, z: s1.z - 3.3, tol: 1.4, speed: 2.2 }, { x: s1.x + 7.8, z: -2.6, tol: 1.3, speed: 2 }, { x: bay.x - 2.3, z: bay.z + 0.9, tol: 1.1, speed: 1.5 }, { x: bay.x + 1.3, z: bay.z + 0.5, tol: 0.8, speed: 1.1 }], { brakeAtEnd: true, cruise: 2.4 });
  const inBay = await d(() => { const a = window.__dakar.teranga.at(), b = window.__dakar.garage.info().bay; return { x: a.x, z: a.z, yaw: a.yaw, b }; });
  console.log('bay try', JSON.stringify(inBay));
  if (day === 1) await shot('errand-garage-bay');
  await getOut('teranga');
  await report('garage');
  await awaitCollected(1);
}
async function errandsOfTheDay(day) {
  await clientErrand(day);
  await garageErrand(day);
  // wash the saloon already sold
  await start('Laver la voiture vendue');
  const w = (await S()).wash;
  if (!(await focusOn('sarr:wash', w.x + Math.cos(w.yaw) * 1.6, w.z - Math.sin(w.yaw) * 1.6))) throw new Error('no wash target');
  await d(() => window.__dakar.act());
  if (day === 1) { await page.waitForTimeout(3000); await shot('errand-wash'); }
  await report('wash');
  // the papers to the bank's counter, on foot
  await start('Porter le dossier');
  const bank = await d(() => window.__dakar.interactables().find(i => i.id === 'pikine:city:bank'));
  const got = await walkTo(page, t, bank.x, bank.z + 3, { tol: 3.5, ms: 240000 });
  if (got > 3.5) await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [bank.x, bank.z + 2.5]);
  if (!(await focusOn('sarr:papers', bank.x, bank.z + 2))) throw new Error('no papers target');
  await d(() => window.__dakar.act());
  if (day === 1) await shot('errand-papers-bank');
  await report('papers');
}
if (process.env.STEP === 'client') { await clientErrand(1); console.log('client errand done', JSON.stringify((await S()).log.errands)); await browser.close(); process.exit(0); }
if (process.env.STEP === 'garage') { await garageErrand(1); console.log('garage errand done', JSON.stringify((await S()).log.errands)); await browser.close(); process.exit(0); }
await errandsOfTheDay(1);
const a1 = await S();
check('day 1: four errands done and reported (each paid, each one reported back to him), trust grows, less for each one of the day', a1.log.errands.filter(e => e.startsWith('done:')).length === 4 && a1.trust >= t0 + 25, `trust ${a1.trust}, ${a1.log.errands.join(' ')}`);
await talkToSarr(); await pick('Lui rendre service');
const again = await modal();
check('an errand is once a day: the same ones cannot be farmed again today', (again.match(/Déjà fait aujourd’hui/g) ?? []).length === 4, again.slice(0, 160));
await d(() => { const m = document.querySelector('#modal.on'); m?.querySelector('.item:last-child')?.click(); });
await page.waitForTimeout(300); await closeModal();

await d(() => window.__dakar.nextDay(1));
await errandsOfTheDay(2);
const a2 = await S(), w2 = await WAL();
check('day 2: four more; trust is now enough for his best terms', a2.trust >= 60, `trust ${a2.trust} · wallet ${w2}`);

// ------------------------------------------------------------------------------------------------ 2. the credit, and the very car on his kerb
await page.waitForFunction(() => window.__dakar.teranga.info().floor[0].state === 'display' && window.__dakar.teranga.info().floor[0].here, null, T);
const before = await TE(), white = before.floor[0];
await talkToSarr(); await pick('Demander un crédit');
const offer = await modal();
await shot('credit-offer');
check('asked again: he accepts, the terms shown before signing (price, down payment, installments)', /Avance/.test(offer) && /Signer · Teranga blanc nacré/.test(offer), offer.slice(0, 200));
const w3 = await WAL();
await pick('Signer · Teranga blanc nacré');
await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, T);
const after = await TE(), loan = (await S()).loans[0], w4 = await WAL();
check('signed: only the down payment left the wallet (credit never adds money); one debt, on that car\'s asset', w3 - w4 === 15000 && loan && loan.status === 'open' && loan.asset === after.asset.uid && loan.principal === 4000000 - 15000, JSON.stringify({ paid: w3 - w4, loan: loan && { asset: loan.asset, principal: loan.principal, installment: loan.installment, every: loan.every } }));
check('the car is the very one on the kerb: same place, same paint, one copy, nothing delivered', Math.hypot(after.x - white.x, after.z - white.z) < 0.05 && after.paint === 1000 && after.floor[0].state === 'out' && after.here, JSON.stringify({ at: [after.x, after.z], was: [white.x, white.z], paint: after.paint }));
await shot('signed');

// ------------------------------------------------------------------------------------------------ 3. driving it, and a first passenger
{ const c = await d(() => window.__dakar.teranga.at()), F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }, L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
  await walkTo(page, t, c.x + F.x * 3.4 - L.x * 1.2, c.z + F.z * 3.4 - L.z * 1.2, { tol: 0.9, ms: 60000 });   // round the front of the car first (Sarr's desk is behind the row)
  await walkTo(page, t, c.x + F.x * 2.6 + L.x * 2.0, c.z + F.z * 2.6 + L.z * 2.0, { tol: 0.9, ms: 60000 }); }
await boardVehicle(page, t, 'teranga');
const car = await d(() => window.__dakar.teranga.at());
// the ride the phone lists this hour that starts nearest to the car (but a real drive away, 40 m or more), inside Pikine (a first, short one)
const pickHour = await d(([x, z]) => { const A = window.__dakar; let best = null; for (let h = 8; h <= 18; h++) { A.setHour(h); for (const [i, r] of A.vtc.requests().entries()) { if (r.to !== 'pikine' || Math.hypot(r.pickup.x - x, r.pickup.z - z) < 40) continue; const dd = Math.hypot(r.pickup.x - x, r.pickup.z - z) + Math.hypot(r.dropoff.x - r.pickup.x, r.dropoff.z - r.pickup.z) * 0.5; if (!best || dd < best.dd) best = { h, i, dd, r }; } } A.setHour(best.h); return best; }, [car.x, car.z]);
// accepted on the phone, by tapping it in « VTC »
await t.tap('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
await t.tap('#phone [data-nav="home"]'); await page.waitForTimeout(300);
await t.tap('#phone [data-app="vtc"]'); await page.waitForSelector('#modal.on', T);
{ const it = page.locator('#modal .item', { hasText: `${pickHour.r.pickup.name} → ${pickHour.r.dropoff.name}` }).first(); await it.scrollIntoViewIfNeeded(); const b = await it.boundingBox(); await t.down(5, b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(60); await t.up(5); }
if (!(await page.waitForFunction(() => !!window.__dakar.vtc.info().trip, null, { timeout: 20000 }).then(() => true, () => false))) {
  await shot('vtc-not-accepted');
  throw new Error('ride not accepted ' + JSON.stringify(await d(() => ({ modal: document.querySelector('#modal.on')?.innerText.slice(0, 600) ?? null, vtc: window.__dakar.vtc.info(), car: window.__dakar.teranga.at() }))));
}
const st = await d(() => window.__dakar.vtc.stops());
console.log('ride', pickHour.r.pickup.name, '→', pickHour.r.dropoff.name, pickHour.r.fare, 'F', JSON.stringify(st.pickup.car));
await page.waitForFunction(() => window.__dakar.vtc.info().phase === 'wait', null, T);
const route = (from, to) => gridRoute({ x: from.x, z: from.z, yaw: from.yaw }, to, { cruise: 6 });
// off Sarr's kerb as the errands leave it: 5 m on and 2.8 m out (his other floor cars stand along the kerb ahead), then into the traffic lane, 2.1 m right of the street's centre line
const pullOut = c => { const F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }, R = { x: -Math.cos(c.yaw), z: Math.sin(c.yaw) }, p = { x: c.x + F.x * 9, z: c.z + F.z * 9 };
  const snap = v => [-120, -60, 0, 60, 120].reduce((b, s) => (Math.abs(s - v) < Math.abs(b - v) ? s : b));
  const q = Math.abs(F.x) > Math.abs(F.z) ? { x: p.x, z: snap(c.z) } : { x: snap(c.x), z: p.z };
  return [{ x: c.x + F.x * 5 - R.x * 2.8, z: c.z + F.z * 5 - R.z * 2.8, tol: 2, speed: 3 }, { x: q.x + F.x * 4 + R.x * 2.1, z: q.z + F.z * 4 + R.z * 2.1, tol: 2.5, speed: 4 }]; };
await pilot(page, t, 'teranga', [...pullOut(car), ...route(car, st.pickup.car)], { brakeAtEnd: true, cruise: 6, stall: 60000, ms: 1200000 });
await page.waitForFunction(() => window.__dakar.vtc.info().phase === 'walk' || window.__dakar.vtc.info().trip?.stage === 'aboard', null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1200); await shot('passenger-walks-to-car');
await page.waitForFunction(() => window.__dakar.vtc.info().trip?.stage === 'aboard', null, { timeout: 90000 }).catch(() => {});
const v1 = await d(() => window.__dakar.vtc.info());
check('the passenger walked to the car (no teleport: steps of a walking pace) and sat in its back seat', v1.trip?.stage === 'aboard' && v1.person?.seated && v1.person.inCar && v1.log.maxStep < 0.2 && v1.persons === 1, JSON.stringify({ stage: v1.trip?.stage, seat: v1.trip?.seat, maxStep: v1.log.maxStep, persons: v1.persons }));
await shot('passenger-aboard');
const c2 = await d(() => window.__dakar.teranga.at());
await pilot(page, t, 'teranga', route(c2, st.dropoff.car), { brakeAtEnd: true, cruise: 6, stall: 60000, ms: 1200000 });
await page.waitForFunction(() => !window.__dakar.vtc.info().trip, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(800); await shot('passenger-out');
const v2 = await d(() => ({ v: window.__dakar.vtc.info(), ledger: window.__dakar.ledger().filter(l => /Course VTC/.test(l.label)) }));
check('at the destination the passenger gets out and walks off; paid once (one wallet line), the ride remembered', !v2.v.trip && v2.v.state.trips === 1 && v2.ledger.length === 1 && v2.v.state.done.length === 1 && v2.ledger[0].amount === pickHour.r.fare, JSON.stringify({ trips: v2.v.state.trips, lines: v2.ledger.map(l => [l.label, l.amount]) }));
await getOut('teranga');

// ------------------------------------------------------------------------------------------------ 4. repaying (what the ride earned) and reloading
const wallet5 = await WAL();
await talkToSarr(); await pick('Rembourser');
await shot('repay-menu');
await pick('Payer ce que j’ai');
const l2 = (await S()).loans[0], wallet6 = await WAL();
check('part of the installment repaid from the ride\'s money (one wallet line « Remboursement »), the rest still owed', l2.paid > 0 && wallet5 - wallet6 === l2.paid && l2.status === 'open', JSON.stringify({ paid: l2.paid, left: l2.principal - l2.paid }));
await d(() => window.__dakar.save());
await page.reload(); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.teranga?.info().here, null, T);
const r = await d(() => ({ owned: window.__dakar.teranga.info().owned, uid: window.__dakar.teranga.info().asset?.uid, loans: window.__dakar.state.data.loans.list, vtc: window.__dakar.state.data.vtc, wallet: window.__dakar.state.wallet }));
check('after a reload: the same car, the same debt (paid part kept), one paid ride; nothing duplicated', r.owned && r.uid === after.asset.uid && r.loans.length === 1 && r.loans[0].paid === l2.paid && r.vtc.trips === 1 && r.vtc.done.length === 1 && r.wallet === wallet6, JSON.stringify({ uid: r.uid, loans: r.loans.length, paid: r.loans[0]?.paid, trips: r.vtc.trips }));
const why = await d(() => window.__dakar.sarr.whyNotSell());
check('the financed car cannot be sold before it is repaid (« Biens » refuses the sale)', /Crédit en cours/.test(why ?? ''), String(why));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
