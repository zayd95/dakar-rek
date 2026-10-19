// The whole Prestige Auto journey in one portrait session with REAL touches (CDP Input.dispatchTouchEvent through scripts/lib/realTouch.mjs): nothing is clicked, set or teleported
// once the player stands on the pavement outside. On foot, the joystick walks to the door and into the hall; the salesperson notices, walks over and greets (once); the player
// picks a car on the floor (« Essayer cette voiture »); he walks to it, unlocks it (a chirp) and offers the keys; the player takes them, walks to the driver's side and taps
// « Ouvrir »: the door opens (sound), the body slips onto the seat, the door shuts (sound), the engine starts; the player drives the SAME car out of the hall and round
// the block with a thumb on the gas and one on the stick, back to the forecourt, parks, taps « Descendre » (the door opens, the player steps out, the door shuts); the
// salesperson walks over; « Parler au vendeur » › « Acheter » shows the price and the wallet; « Confirmer l'achat »: the car is the player's, where it stands (no delivery, no copy).
// Then the page is reloaded: the car is where it was, in the same paint, the bay stays empty, the other cars are still on the floor.
//
// Usage: node scripts/check-prestige-flow.mjs [baseUrl] [outDir]   (a running build; RECORD=1 films the whole thing: outDir/prestige-journey.webm)
import { chromium } from 'playwright';
import { realTouch, walkTo, pilot } from './lib/realTouch.mjs';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4214/';
const out = process.argv[3] ?? 'docs/screenshots/prestige';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ...(process.env.RECORD ? { recordVideo: { dir: `${out}/video`, size: viewport } } : {}) });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
const t = await realTouch(page);
const d = (fn, arg) => page.evaluate(fn, arg);
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png` }); };
const B = () => d(() => window.__dakar.berline.info()), S = () => d(() => window.__dakar.sales.info());
const AT = () => d(() => window.__dakar.berline.at());
const wait = (fn, arg, ms = 240000) => page.waitForFunction(fn, arg, { timeout: ms });
const tapItem = async text => { const sel = await d(tx => { const i = [...document.querySelectorAll('#modal .item')].findIndex(e => e.textContent.includes(tx)); return i; }, text); if (sel < 0) return false; const c = await d(i => { const r = document.querySelectorAll('#modal .item')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await t.down(8, c.x, c.y); await page.waitForTimeout(70); await t.up(8); return true; };
const count = () => d(() => { let n = 0; const names = []; window.__dakar.three.scene.traverse(o => { if (o.isGroup && /^berline:(floor:\d|mine)$/.test(o.name)) { n++; names.push(o.name); } }); return { n, names }; });

// ---- 0. on the pavement outside, at noon, with money in the pocket
await d(() => { window.__dakar.teleport('almadies', -100.5, 4.6, 0); window.__dakar.setHour(11); window.__dakar.state.data.wallet = 200000000; });
await wait(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.sales?.info().here && window.__dakar.berline?.info().dealer && window.__dakar.suv?.info().floor.length === 2);
await page.waitForTimeout(1500);
const b0 = await B(), s0 = await d(() => window.__dakar.suv.info());
check('the dealership has four real cars on its floor: two berlines and two SUVs, each in its own bay', b0.floor.length === 2 && s0.floor.length === 2 && [...b0.floor, ...s0.floor].every(c => c.here && c.state === 'display') && new Set([...b0.floor, ...s0.floor].map(c => c.x)).size === 4, JSON.stringify([...b0.floor, ...s0.floor].map(c => [c.x, c.z])));
check('no car is on the road or the pavement: nothing was delivered outside', !b0.here && !s0.here);
await shot('1-pavement');

// ---- 1. walk in by the doorway; the salesperson notices and greets once
const w0 = await S();
check('the salesperson is at his desk when the player is outside', w0.task === null && !w0.log.greetings && Math.hypot(w0.x + 103, w0.z - 31.6) < 0.2, JSON.stringify({ x: w0.x, z: w0.z }));
await walkTo(page, t, -101.2, 15.5, { tol: 0.6 });
await walkTo(page, t, -99.5, 20.5, { tol: 0.7 });
await wait(() => window.__dakar.sales.info().log.greetings >= 1);
const greeted = await S();
await shot('2-greeting');
const toast = await d(() => document.querySelector('#toast')?.textContent ?? '');
check('he walked over and greeted them in French with a little Wolof, once', greeted.log.greetings === 1 && /Bonjour|Salaam|Dalal|Na nga def/.test(toast + greeted.log.said.join(' ')) && greeted.log.walked > 2, JSON.stringify({ said: greeted.log.said, walked: +greeted.log.walked.toFixed(1), toast: toast.slice(0, 80) }));
check('his walk never jumped: the biggest step of one frame is a walking step', greeted.log.maxStep < 0.4, `maxStep ${greeted.log.maxStep.toFixed(2)} m`);
// declining: the player simply walks on to look at the cars; no second greeting, nothing forced
await walkTo(page, t, -88.3, 19.9, { tol: 0.45 });
await page.waitForTimeout(1500);
check('walking away is a fine answer: no menu was forced on them and he did not greet again', (await S()).log.greetings === 1 && !(await d(() => document.querySelector('#modal.on'))), '');

// ---- 2. the navy berline: « Essayer cette voiture »
await wait(() => window.__dakar.focus()?.id === 'berline:floor:1', null, 60000);
const f1 = await d(() => window.__dakar.focus());
check('the car on the floor offers a free trial and the purchase, by itself', f1.primary === 'Essayer cette voiture' && f1.all.some(a => /^Acheter/.test(a)), JSON.stringify(f1));
await shot('3-car');
await t.tap('#act');
await wait(() => window.__dakar.sales.info().task === 'car', null, 60000);
await shot('4-salesman-walks');
await wait(() => /clés/.test(document.querySelector('#modal.on')?.textContent ?? ''));
const atCar = await S(), flo = (await B()).floor[1];
check('he walked to that car, unlocked it (a chirp) and offered the keys', Math.hypot(atCar.x - flo.stand.x, atCar.z - flo.stand.z) < 0.8 && flo.state === 'unlocked' && (await d(() => window.__dakar.berline.audio().count.unlock)) >= 1, JSON.stringify({ sales: [atCar.x, atCar.z], stand: flo.stand, state: flo.state }));
await shot('5-keys');
check('he still has not teleported', (await S()).log.maxStep < 0.4);
await tapItem('Prendre les clés');
await wait(() => window.__dakar.sales.info().keys && window.__dakar.pos().mode === 'play', null, 60000);

// ---- 3. to the driver's side, « Ouvrir »: door, entry, door, engine
await walkTo(page, t, flo.step.x, flo.step.z, { tol: 0.4 });
await wait(() => /Ouvrir/.test(window.__dakar.focus()?.primary ?? ''), null, 60000);
check('at the driver\'s side the prompt is « Ouvrir »', true);
await shot('6-ouvrir');
const a0 = await AT(), n0 = await count();
await t.tap('#act');
let maxDoor = 0, shots = 0;
for (let i = 0; i < 200; i++) {
  const b = await B(); maxDoor = Math.max(maxDoor, b.door);
  if (b.entry && b.door > 0.5 && shots === 0) { await shot('7-door-open'); shots++; }
  if (b.entry && b.door > 0.9 && shots === 1 && (await d(() => window.__dakar.pos())).mode === 'busy') { const p = await d(() => window.__dakar.pos()); if (Math.hypot(p.x - flo.step.x, p.z - flo.step.z) > 0.5) { await shot('8-sliding-in'); shots++; } }
  if (b.driving) break;
  await page.waitForTimeout(150);
}
await wait(() => window.__dakar.berline.info().driving, null, 60000);
const au = await d(() => window.__dakar.berline.audio()), n1 = await count();
check('the door really opened (a separate leaf, turned out) and shut again', maxDoor >= 0.95 && (await B()).door < 0.05, `door ${maxDoor}`);
check('it sounded: door open, door shut, the engine starting', au.count.door >= 2 && au.count.start >= 1, JSON.stringify(au.count));
check('the car under the player is the very car they chose: same place, one vehicle, no copy', Math.abs((await AT()).x - flo.x) < 0.6 && n0.n === n1.n && n1.names.filter(x => x === 'berline:floor:1').length === 1 && !n1.names.includes('berline:mine') && !(await B()).floor[1].here, JSON.stringify({ n0: n0.names, n1: n1.names }));
await shot('9-engine');

// ---- 4. drive it out, round the block, back to the forecourt
const trial = await B();
check('it is a free trial: nothing paid, nothing owned, nothing saved', trial.trial && !trial.owned && !trial.record && (await d(() => window.__dakar.state.wallet)) === 200000000, JSON.stringify({ trial: trial.trial, owned: trial.owned, record: trial.record }));
const LAP = [
  { x: -88.3, z: 12, tol: 3 }, { x: -86.5, z: 6.5, tol: 2.2, speed: 6 }, { x: -78, z: 3.9, tol: 3, speed: 8 }, { x: -64, z: 3.6, tol: 4 }, { x: -63.4, z: 22, tol: 4 }, { x: -63.4, z: 50, tol: 4 }, { x: -68, z: 56.6, tol: 4 },
  { x: -112, z: 56.6, tol: 4 }, { x: -116.4, z: 48, tol: 4 }, { x: -116.4, z: 12, tol: 4 }, { x: -110, z: 3.8, tol: 4 }, { x: -98, z: 3.8, tol: 3 }, { x: -92, z: 11, tol: 2.2, speed: 5 },
];
await pilot(page, t, 'berline', LAP.slice(0, 4));
await shot('10-out-on-the-road');
await pilot(page, t, 'berline', LAP.slice(4, 10));
await shot('11-round-the-block');
await pilot(page, t, 'berline', LAP.slice(10));
// ---- 5. park on the forecourt and get out
await pilot(page, t, 'berline', [{ x: -96, z: 13.5, tol: 1.6, speed: 3 }], { brakeAtEnd: true });
const parkedAt = await AT();
check('they drove it and came back to the forecourt', parkedAt && parkedAt.z > 8 && parkedAt.z < 17 && parkedAt.x > -112 && parkedAt.x < -68, JSON.stringify(parkedAt));
await shot('12-parked');
await t.tap('#ridepad .rp-off');
let exitSeen = false;
for (let i = 0; i < 160; i++) { const b = await B(); if (b.exit && b.door > 0.5 && !exitSeen) { exitSeen = true; await shot('13-stepping-out'); } if (!b.exit && !b.driving && b.here && i > 4) break; await page.waitForTimeout(150); }
const out1 = await B(), pAfter = await d(() => window.__dakar.pos());
check('they stepped out through the door; the trial car stays exactly where it was parked', exitSeen && !out1.driving && out1.here && out1.trial && Math.abs(out1.x - parkedAt.x) < 0.05 && Math.abs(out1.z - parkedAt.z) < 0.05 && pAfter.mode === 'play', JSON.stringify({ exitSeen, x: out1.x, z: out1.z }));
await wait(() => window.__dakar.sales.info().task === 'meet', null, 120000);
await wait(() => { const s = window.__dakar.sales.info(); return s.task === 'meet' && !s.moving; }, null, 240000);
const meet = await S();
check('the salesperson walked over to the customer who came back (a real walk)', Math.hypot(meet.x - pAfter.x, meet.z - pAfter.z) < 3.2 && meet.log.maxStep < 0.4, JSON.stringify({ sales: [meet.x, meet.z], player: [pAfter.x, pAfter.z] }));
await shot('14-salesman-comes');

// ---- 6. talk to him: the price and the confirmation, then the purchase on the spot
await walkTo(page, t, meet.x - 0.2, meet.z - 0.3, { tol: 1.55 });
await wait(() => window.__dakar.focus()?.id === 'prestige:sales', null, 60000);
await t.tap('#act');
await wait(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, 60000);
await shot('15-talk');
const wallet0 = await d(() => window.__dakar.state.wallet), led0 = await d(() => window.__dakar.state.data.ledger.length), price = (await B()).price;
await tapItem('Acheter');
await wait(() => /Confirmer l/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, 60000);
const confirmText = await d(() => document.querySelector('#modal.on')?.textContent ?? '');
check('a clear price and a confirmation show the price and the wallet before anything is paid', confirmText.includes(String(price).slice(0, 2)) && /Ton argent/.test(confirmText) && (await d(() => window.__dakar.state.wallet)) === wallet0, confirmText.slice(0, 150));
await shot('16-confirm');
await tapItem('Confirmer l');
await wait(() => window.__dakar.berline.info().owned, null, 60000);
await page.waitForTimeout(800);
const bought = await B(), w1 = await d(() => window.__dakar.state.wallet), led1 = await d(() => window.__dakar.state.data.ledger.slice(-2)), n2 = await count();
check('paid once, the exact price, one ledger line', bought.owned && wallet0 - w1 === price && (await d(() => window.__dakar.state.data.ledger.length)) === led0 + 1 && /Berline neuve/.test(led1[led1.length - 1].label) && bought.bought === 1, JSON.stringify({ paid: wallet0 - w1, price, led: led1.map(l => l.label) }));
check('the same car became theirs, where it stood: position kept, parked record there, no delivery, no copy, no trial', !bought.trial && Math.abs(bought.x - parkedAt.x) < 0.1 && Math.abs(bought.z - parkedAt.z) < 0.1 && bought.record && Math.hypot(bought.record.x - parkedAt.x, bought.record.z - parkedAt.z) < 0.1 && n2.n === 1 && n2.names[0] === 'berline:floor:1', JSON.stringify({ record: bought.record, names: n2.names }));
check('its paint (the navy of the car chosen) is saved with it; the bay stays empty; the white berline is still on the floor', bought.paint === bought.seed && bought.paint > 0 && !bought.floor[1].here && bought.floor[0].here && bought.floor[0].state === 'display', JSON.stringify({ paint: bought.paint, floor: bought.floor.map(f => [f.slot, f.here, f.state]) }));
await shot('17-bought');
// the player gets in again, as an owner, through the same door
await page.waitForTimeout(500);

// ---- 7. a reload: the car is where it was, in its paint; the bay is empty; the others are on the floor
await d(() => window.__dakar.save?.());
await page.waitForTimeout(1500);
const filmed = process.env.RECORD ? page.video() : null;
await page.reload(); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'almadies' && window.__dakar.berline?.info().dealer, null, T);
await page.waitForTimeout(2500);
const re = await B(), n3 = await count();
check('after a reload the car stands where it was left, in the same paint, not duplicated; the bay is empty', re.owned && re.here && Math.abs(re.x - parkedAt.x) < 0.1 && Math.abs(re.z - parkedAt.z) < 0.1 && re.seed === bought.seed && !re.floor[1].here && re.floor[0].here && n3.n === 2, JSON.stringify({ x: re.x, z: re.z, seed: re.seed, floor: re.floor.map(f => [f.slot, f.here, f.state]), names: n3.names }));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await context.close();
if (filmed) { const p = await filmed.path(); fs.copyFileSync(p, `${out}/prestige-journey.webm`); console.log('film', `${out}/prestige-journey.webm`); }
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
