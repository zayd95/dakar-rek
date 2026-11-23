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
import { realTouch, walkTo, pilot, padDrive, turnAround } from './lib/realTouch.mjs';
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
const B = () => d(() => window.__dakar.gainde.info()), S = () => d(() => window.__dakar.sales.info());
const AT = () => d(() => window.__dakar.gainde.at());
const wait = (fn, arg, ms = 240000) => page.waitForFunction(fn, arg, { timeout: ms });
const tapItem = async text => { const sel = await d(tx => { const i = [...document.querySelectorAll('#modal .item')].findIndex(e => e.textContent.includes(tx)); return i; }, text); if (sel < 0) return false; const c = await d(i => { const r = document.querySelectorAll('#modal .item')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await t.down(8, c.x, c.y); await page.waitForTimeout(70); await t.up(8); return true; };
const mine = () => d(() => { let n = 0; window.__dakar.three.scene.traverse(o => { if (o.isGroup && o.name === 'gainde:mine') n++; }); return n; });   // the owner's car only: Almadies' showroom keeps its own floor cars
const count = () => d(() => { let n = 0; const names = []; window.__dakar.three.scene.traverse(o => { if (o.isGroup && /^gainde:(floor:\d|mine)$/.test(o.name)) { n++; names.push(o.name); } }); return { n, names }; });

// ---- 0. on the pavement outside, at noon, with money in the pocket
await d(() => { window.__dakar.teleport('almadies', -100.5, 4.6, 0); window.__dakar.setHour(11); window.__dakar.state.data.wallet = 200000000; });
await wait(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.sales?.info().here && window.__dakar.gainde?.info().dealer && window.__dakar.suv?.info().floor.length === 2 && window.__dakar.gainde.info().floor.length === 2 && window.__dakar.gainde?.info().floor.length === 2);
await page.waitForTimeout(1500);
const b0 = await B(), s0 = await d(() => window.__dakar.suv.info()), g0 = await d(() => window.__dakar.gainde.info());
check('the dealership has four real cars on its floor: two Gaïndés and two Lamane Sports (the old generic saloon is off the floor), each in its own bay', b0.floor.length === 2 && s0.floor.length === 2 && (await d(() => window.__dakar.berline.info().floor.length)) === 0 && [...b0.floor, ...s0.floor].every(c => c.here && c.state === 'display') && new Set([...b0.floor, ...s0.floor, ...g0.floor].map(c => c.x)).size === 4, JSON.stringify([...b0.floor, ...s0.floor].map(c => [c.x, c.z])));
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
await walkTo(page, t, b0.floor[0].x, 19.9, { tol: 0.45 });
await page.waitForTimeout(1500);
check('walking away is a fine answer: no menu was forced on them and he did not greet again', (await S()).log.greetings === 1 && !(await d(() => document.querySelector('#modal.on'))), '');

// ---- 2. the Gaïndé in night blue (slot 0): « Essayer cette voiture »
await wait(() => window.__dakar.focus()?.id === 'gainde:floor:0', null, 60000);
const f1 = await d(() => window.__dakar.focus());
check('the car on the floor offers a free trial and the purchase, by itself', f1.primary === 'Essayer cette voiture' && f1.all.some(a => /^Acheter/.test(a)), JSON.stringify(f1));
await shot('3-car');
await t.tap('#act');
await wait(() => window.__dakar.sales.info().task === 'car', null, 60000);
await shot('4-salesman-walks');
await wait(() => /clés/.test(document.querySelector('#modal.on')?.textContent ?? ''));
const atCar = await S(), flo = (await B()).floor[0];
check('he walked to that car, unlocked it (a chirp) and offered the keys', Math.hypot(atCar.x - flo.stand.x, atCar.z - flo.stand.z) < 0.8 && flo.state === 'unlocked' && (await d(() => window.__dakar.gainde.audio().count.unlock)) >= 1, JSON.stringify({ sales: [atCar.x, atCar.z], stand: flo.stand, state: flo.state }));
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
await wait(() => window.__dakar.gainde.info().driving, null, 60000);
const au = await d(() => window.__dakar.gainde.audio()), n1 = await count();
check('the door really opened (a separate leaf, turned out) and shut again', maxDoor >= 0.95 && (await B()).door < 0.05, `door ${maxDoor}`);
check('it sounded: door open, door shut, the engine starting', au.count.door >= 2 && au.count.start >= 1, JSON.stringify(au.count));
check('the car under the player is the very car they chose: same place, one vehicle, no copy', Math.abs((await AT()).x - flo.x) < 0.6 && n0.n === n1.n && n1.names.filter(x => x === 'gainde:floor:0').length === 1 && !n1.names.includes('gainde:mine') && !(await B()).floor[0].here, JSON.stringify({ n0: n0.names, n1: n1.names }));
await shot('9-engine');

// ---- 4. drive it out, round the block, back to the forecourt
const trial = await B();
check('it is a free trial: nothing paid, nothing owned, nothing saved', trial.trial && !trial.owned && !trial.record && (await d(() => window.__dakar.state.wallet)) === 200000000, JSON.stringify({ trial: trial.trial, owned: trial.owned, record: trial.record }));
// the lane is the middle of the road: the kerb lane (4.3 m off the centre line) is where the hub parks its cars
const LAP = [
  { x: b0.floor[0].x, z: 12, tol: 3 }, { x: -87, z: 6, tol: 2.2, speed: 4 }, { x: -80, z: 1.2, tol: 3, speed: 5 }, { x: -70, z: 1.2, tol: 3 }, { x: -64.5, z: 2.6, tol: 2.5, speed: 4 }, { x: -61.2, z: 7, tol: 2.5, speed: 4 }, { x: -60.4, z: 16, tol: 3 }, { x: -60.4, z: 30, tol: 4 }, { x: -60.4, z: 44, tol: 4 },
  { x: -61.4, z: 52.5, tol: 2.5, speed: 3 }, { x: -65, z: 58.8, tol: 2.5, speed: 3 }, { x: -72, z: 60, tol: 3, speed: 4 }, { x: -92, z: 60, tol: 4 }, { x: -108, z: 60, tol: 4 },
  { x: -114.8, z: 59.2, tol: 2.5, speed: 3 }, { x: -119.2, z: 55.6, tol: 2.5, speed: 3 }, { x: -120, z: 46, tol: 3.5 }, { x: -120, z: 24, tol: 4 },
  { x: -120, z: 16, tol: 3 }, { x: -120, z: 9.5, tol: 2, speed: 2.5 }, { x: -118.2, z: 4.6, tol: 2, speed: 2.5 }, { x: -113.5, z: 1.4, tol: 2.5, speed: 3 }, { x: -106, z: 1, tol: 3 }, { x: -98, z: 1.4, tol: 3 }, { x: -94, z: 3.8, tol: 2.5, speed: 3 }, { x: -91, z: 9, tol: 2.5, speed: 4 },
];
if (process.env.SKIP_LAP) await d(() => window.__dakar.gainde.place(-94, 3.8, 0.55));   // development only: the recorded run drives the whole lap
else {
  await pilot(page, t, 'gainde', LAP.slice(0, 6));
  await shot('10-out-on-the-road');
  await pilot(page, t, 'gainde', LAP.slice(6, 19));
  await shot('11-round-the-block');
  await pilot(page, t, 'gainde', LAP.slice(19));
}
// ---- 5. park on the forecourt and get out
await pilot(page, t, 'gainde', [{ x: -95, z: 11, tol: 1.6, speed: 2 }], { brakeAtEnd: true });
const parkedAt = await AT();
check('they drove it and came back to the forecourt', parkedAt && parkedAt.z > 8 && parkedAt.z < 16.5 && parkedAt.x > -112 && parkedAt.x < -68, JSON.stringify(parkedAt));
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
await wait(() => window.__dakar.focus()?.id === 'prestige:sales', null, 60000).catch(async e => { console.log('FOCUS', JSON.stringify(await d(() => ({ focus: window.__dakar.focus(), pos: window.__dakar.pos(), sales: window.__dakar.sales.info() })))); throw e; });
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
await wait(() => window.__dakar.gainde.info().owned, null, 60000);
await page.waitForTimeout(800);
const bought = await B(), w1 = await d(() => window.__dakar.state.wallet), led1 = await d(() => window.__dakar.state.data.ledger.slice(-2)), n2 = await count();
check('paid once, the exact price, one ledger line', bought.owned && wallet0 - w1 === price && (await d(() => window.__dakar.state.data.ledger.length)) === led0 + 1 && /Gaïndé/.test(led1[led1.length - 1].label) && bought.bought === 1, JSON.stringify({ paid: wallet0 - w1, price, led: led1.map(l => l.label) }));
check('the same car became theirs, where it stood: position kept, parked record there, no delivery, no copy, no trial', !bought.trial && Math.abs(bought.x - parkedAt.x) < 0.1 && Math.abs(bought.z - parkedAt.z) < 0.1 && bought.record && Math.hypot(bought.record.x - parkedAt.x, bought.record.z - parkedAt.z) < 0.1 && n2.n === n0.n && n2.names.filter(x => x === 'gainde:floor:0').length === 1 && !n2.names.includes('gainde:mine'), JSON.stringify({ record: bought.record, names: n2.names }));
check('its paint (the white of the car chosen) is saved with it; the bay stays empty; the SUVs are still on the floor', bought.paint === bought.seed && bought.paint > 0 && !bought.floor[0].here && (await d(() => window.__dakar.suv.info().floor.every(f => f.here && f.state === 'display'))), JSON.stringify({ paint: bought.paint, floor: bought.floor.map(f => [f.slot, f.here, f.state]) }));
await shot('17-bought');
// the player gets in again, as an owner, through the same door
await page.waitForTimeout(500);

// ---- 7. a reload: the car is where it was, in its paint; the bay is empty; the others are on the floor
await d(() => window.__dakar.save?.());
await page.waitForTimeout(1500);
const filmed = process.env.RECORD ? page.video() : null;
await page.reload(); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'almadies' && window.__dakar.gainde?.info().dealer, null, T);
await page.waitForTimeout(2500);
const re = await B(), n3 = await count();
check('after a reload the car stands where it was left, in the same paint, not duplicated; the bay is empty', re.owned && re.here && Math.abs(re.x - parkedAt.x) < 0.1 && Math.abs(re.z - parkedAt.z) < 0.1 && re.seed === bought.seed && !re.floor[0].here && n3.names.filter(x => x === 'gainde:mine').length === 1 && !n3.names.includes('gainde:floor:0'),   // the second Gaïndé stays on display in its own bay
  JSON.stringify({ x: re.x, z: re.z, seed: re.seed, floor: re.floor.map(f => [f.slot, f.here, f.state]), names: n3.names }));

// ============================================================================ DRIVE_ON=1: the same car, on from the forecourt in Almadies to the Corniche, with no teleport (docs/vehicles/CONTINUOUS_DRIVE.md)
if (process.env.DRIVE_ON) {
  const CH = 240;                                                         // two perimeter roads laid end to end: Almadies z 120 is Corniche z -120
  const getIn = async () => {
    const c = await AT(), L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) }, F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) };
    const me = await d(() => window.__dakar.pos());
    const spots = [[2.0, 0.4], [-2.0, 0.4], [1.6, -1.2], [-1.6, -1.2]].sort((a, b) => Math.hypot(c.x + L.x * a[0] + F.x * a[1] - me.x, c.z + L.z * a[0] + F.z * a[1] - me.z) - Math.hypot(c.x + L.x * b[0] + F.x * b[1] - me.x, c.z + L.z * b[0] + F.z * b[1] - me.z));
    for (const [side, along] of spots) {                                   // the nearest side first: nobody walks through the car
      await walkTo(page, t, c.x + L.x * side + F.x * along, c.z + L.z * side + F.z * along, { tol: 0.9, ms: 40000 });
      const ok = await page.waitForFunction(() => window.__dakar.focus()?.id === 'gainde:parked', null, { timeout: 6000 }).then(() => true, () => false);
      console.log('SIDE', side, along, ok, JSON.stringify(await d(() => ({ focus: window.__dakar.focus()?.id ?? null, pos: [window.__dakar.pos().x, window.__dakar.pos().z] }))));
      if (ok) break;
    }
    await wait(() => window.__dakar.focus()?.id === 'gainde:parked', null, 20000).catch(async e => { console.log('NOFOCUS', JSON.stringify(await d(() => ({ focus: window.__dakar.focus(), pos: window.__dakar.pos(), car: window.__dakar.gainde.at() })))); throw e; });
    await t.tap('#act');
    await wait(() => window.__dakar.gainde.at().driving && document.body.classList.contains('ridepad'), null, 120000);
    await page.waitForTimeout(600);
  };
  await getIn();
  const pre = await B(), seedBefore = pre.seed, paintBefore = pre.paint, assetBefore = pre.asset;                 // the asset record is the car's state: its uid and its condition travel with it
  check('the owner gets in the car they bought', pre.owned && (await AT()).driving, JSON.stringify({ owned: pre.owned }));
  // every frame is logged from inside the page: which district, where the car is, how fast, whether the player is in the seat, the pad, the engine, and where the camera is
  await d(() => {
    window.__frames = [];
    const tick = () => {
      const A = window.__dakar, a = A.gainde.at(), p = A.pos(), c = A.camera().at;
      window.__frames.push({ ms: performance.now(), hub: p.hub, t: a.t, x: a.x, z: a.z, yaw: a.yaw, speed: a.speed, driving: a.driving, pad: document.body.classList.contains('ridepad'), engine: A.gainde.audio().running, cam: c, mode: p.mode });
      if (window.__frames.length < 60000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const ROUTE = [
    { x: -88, z: 6, tol: 2.5, speed: 3 }, { x: -80, z: 1.2, tol: 3, speed: 5 }, { x: -70, z: 1.2, tol: 3 }, { x: -64.5, z: 2.6, tol: 2.5, speed: 4 }, { x: -61.2, z: 7, tol: 2.5, speed: 4 },
    { x: -60.4, z: 16, tol: 3 }, { x: -60.4, z: 50, tol: 4 }, { x: -60.4, z: 90, tol: 4 }, { x: -60.4, z: 128, tol: 3 },        // … Almadies’ south end; the road goes on
    { x: -60.4, z: 170, tol: 4 }, { x: -60.4, z: 215, tol: 4 },                                                          // … in Corniche coordinates z -70, -25 (the route is written in the first district’s frame)
  ];
  // the car stands on the forecourt facing the showroom: backed out to the road with the reverse gear (« R » and the gas), then driven away forward
  await padDrive(page, t, { reverse: true, hold: () => page.waitForFunction(() => window.__dakar.gainde.at().z < 3.2, null, { timeout: 120000 }) });
  await page.waitForFunction(() => Math.abs(window.__dakar.gainde.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  await pilot(page, t, 'gainde', ROUTE, { cruise: 8, stall: 25000 });
  const fr = await d(() => window.__frames), swaps = [];
  for (let i = 1; i < fr.length; i++) if (fr[i].hub !== fr[i - 1].hub) swaps.push(i);
  const i = swaps[0];
  check('the car crossed into the Corniche on its own wheels (exactly one district change on the route)', swaps.length === 1 && fr[i - 1].hub === 'almadies' && fr[i].hub === 'corniche', JSON.stringify({ swaps: swaps.length, from: fr[i - 1]?.hub, to: fr[i]?.hub }));
  if (i) {
    const a = fr[i - 1], b = fr[i], dxz = Math.hypot(b.x - a.x, b.z + CH - a.z), step = Math.max(0.5, Math.abs(a.speed) * 0.12);
    check('the car’s pose is continuous across the swap: same x, same heading, one frame’s travel and not a metre more (no teleport)', Math.abs(b.x - a.x) < 0.6 && Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))) < 0.1 && dxz < step + 1.2, JSON.stringify({ dx: +(b.x - a.x).toFixed(2), dyaw: +(b.yaw - a.yaw).toFixed(3), travel: +dxz.toFixed(2), speed: a.speed }));
    check('speed is kept (no stop, no reset)', Math.abs(b.speed - a.speed) < 1.0 && a.speed > 3, JSON.stringify({ before: a.speed, after: b.speed }));
    const around = fr.slice(Math.max(0, i - 40), i + 40);
    check('the player stays in the driver’s seat, the touch pad stays up and the engine keeps running on every frame around the swap', around.every(f => f.driving && f.pad && f.engine && f.mode === 'play'), JSON.stringify({ frames: around.length, notDriving: around.filter(f => !f.driving).length, noPad: around.filter(f => !f.pad).length, noEngine: around.filter(f => !f.engine).length }));
    const rel = f => { const s = Math.sin(f.yaw), c = Math.cos(f.yaw), dx = f.cam[0] - f.x, dz = f.cam[2] - f.z; return [dx * c - dz * s, f.cam[1], dx * s + dz * c]; };
    const ra = rel(a), rb = rel(b), dc = Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]);
    check('the camera keeps its place behind the car (no jump, no re-framing)', dc < 1.2, JSON.stringify({ before: ra.map(v => +v.toFixed(2)), after: rb.map(v => +v.toFixed(2)), jump: +dc.toFixed(2) }));
    const stall = (b.ms - a.ms), crossMs = await d(() => window.__dakar.crossMs());
    console.log('swap frame gap ms', Math.round(stall), 'hub build ms', Math.round(crossMs));
    check('the district was built in one step (the hitch is measured, not hidden: see the doc)', crossMs > 0 && crossMs < 4000, JSON.stringify({ buildMs: Math.round(crossMs), frameGapMs: Math.round(stall) }));
    await shot('20-corniche-after-crossing');
  }
  const inC = await B();
  check('it is the same car: same colour seed, still owned, saved as parked in the Corniche, not in Almadies', inC.owned && inC.seed === seedBefore && inC.paint === paintBefore && inC.record?.hub === 'corniche' && (await count()).n === 1, JSON.stringify({ seed: inC.seed, record: inC.record, copies: (await count()).n }));
  // collisions still work in the new district: drive at a building face
  const wall = await d(() => window.__dakar.cityGeometry().colliders.filter(c => c.h >= 6 && c.x0 > -50 && c.x0 < -30 && c.x1 - c.x0 > 8 && c.z1 - c.z0 > 14 && c.z0 > -112 && c.z1 < -20).sort((p, q) => p.x0 - q.x0)[0]);
  const here = await AT();
  console.log('WALL', JSON.stringify(wall), 'car', JSON.stringify(here));
  await d(() => window.__dakar.gainde.feelReset());
  await pilot(page, t, 'gainde', [{ x: here.x, z: (wall.z0 + wall.z1) / 2 - 6, tol: 4 }, { x: wall.x0 + 4, z: (wall.z0 + wall.z1) / 2, tol: 2, speed: 6 }], { cruise: 7, stall: 14000 });
  const ft = await d(() => window.__dakar.gainde.feel()), atWall = await AT();
  check('in the Corniche the car still collides: it hits the building and stays out of it', ft.impacts.length >= 1 && atWall.x < wall.x0 - 0.5, JSON.stringify({ impacts: ft.impacts.length, x: atWall.x, wallX0: wall.x0 }));
  // park, get out, reload: the car is saved in the Corniche, with the player beside it
  await padDrive(page, t, { reverse: true, hold: () => page.waitForTimeout(5000) });                       // back away from the wall (the reverse gear)
  await page.waitForFunction(() => Math.abs(window.__dakar.gainde.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  const off = await AT();
  await pilot(page, t, 'gainde', [{ x: -60.4, z: off.z, tol: 3 }], { brakeAtEnd: true, cruise: 3 }).catch(() => {});
  await page.waitForFunction(() => Math.abs(window.__dakar.gainde.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  await t.tap('#ridepad .rp-off');
  await wait(() => !window.__dakar.gainde.at().driving && !window.__dakar.gainde.info().exit, null, 120000);
  await d(() => window.__dakar.save?.()); await page.waitForTimeout(1500);
  const parkedC = await AT();
  await page.reload(); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.gainde?.info().owned, null, T); await page.waitForTimeout(2500);
  const rc = await B(), rp = await d(() => window.__dakar.pos());
  check('after a reload the player is in the Corniche beside the car they drove there (save compatible, not duplicated)', rp.hub === 'corniche' && rc.owned && rc.here && Math.abs(rc.x - parkedC.x) < 0.2 && Math.abs(rc.z - parkedC.z) < 0.2 && rc.seed === seedBefore && (await count()).n === 1, JSON.stringify({ hub: rp.hub, here: rc.here, record: rc.record }));
  // and back: the way home is the same road
  await getIn();
  // every frame is logged from inside the page, as on the way out: district, pose, speed, seat, pad, engine and camera
  await d(() => {
    window.__frames = [];
    const tick = () => {
      const A = window.__dakar, a = A.gainde.at(), p = A.pos(), c = A.camera().at;
      window.__frames.push({ ms: performance.now(), hub: p.hub, t: a.t, x: a.x, z: a.z, yaw: a.yaw, speed: a.speed, driving: a.driving, pad: document.body.classList.contains('ridepad'), engine: A.gainde.audio().running, cam: c, mode: p.mode });
      if (window.__frames.length < 60000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // the car stands across the street where the wall test left it: the Corniche's carriageway (x −65.5 … −54.5, this street's own width) is too narrow for one sweep from that angle
  // (a forward-only turn needs more room than the street has and ends grinding along the kerb), so it is turned round as a driver does, with the real controls: lock, forward, « R », back, until it faces north
  const carriageway = { x0: -65, x1: -55, z0: -118, z1: 118 };
  const turned = await turnAround(page, t, 'gainde', Math.PI, { area: carriageway });
  const back = await AT();
  console.log('BACK start', JSON.stringify(back), 'turned', JSON.stringify({ yaw: turned.yaw, speed: turned.speed }));
  check('the car can be turned round in the Corniche with the controls (lock, forward, reverse, back) and faces the way home', Math.abs(Math.atan2(Math.sin(back.yaw - Math.PI), Math.cos(back.yaw - Math.PI))) < 0.35 && back.driving && Math.abs(back.speed) < 0.3 && back.x > carriageway.x0 && back.x < carriageway.x1, JSON.stringify({ yaw: back.yaw, x: back.x, speed: back.speed }));
  await pilot(page, t, 'gainde', [{ x: -60.4, z: back.z - 10, tol: 4, speed: 3 }, { x: -60.4, z: -100, tol: 4 }, { x: -60.4, z: -128, tol: 3 }, { x: -60.4, z: -170, tol: 4 }, { x: -60.4, z: -215, tol: 4 }], { cruise: 8, stall: 25000 }).catch(e => console.log('BACK pilot', e.message));
  { const fr2 = await d(() => window.__frames); console.log('BACK trace', JSON.stringify(fr2.filter((f, k) => k % Math.max(1, Math.floor(fr2.length / 24)) === 0).map(f => [f.hub[0], +f.x.toFixed(1), +f.z.toFixed(1), +f.speed.toFixed(1)]))); }
  console.log('BACK end', JSON.stringify(await AT()), 'hub', (await d(() => window.__dakar.pos())).hub);
  const fb = await d(() => window.__frames), sw = fb.findIndex((f, k) => k && f.hub !== fb[k - 1].hub);
  check('the way back works too: the same road leads from the Corniche into Almadies while driving', sw > 0 && fb[sw - 1].hub === 'corniche' && fb[sw].hub === 'almadies' && fb.slice(Math.max(0, sw - 20), sw + 20).every(f => f.driving) && Math.abs(fb[sw].speed - fb[sw - 1].speed) < 1.0, JSON.stringify({ swap: sw, hubs: sw > 0 ? [fb[sw - 1].hub, fb[sw].hub] : null }));
  if (sw > 0) {
    // the same continuity as on the way out, now going home (Corniche z −120 is Almadies z 120: the z of the car jumps by +240)
    const a = fb[sw - 1], b = fb[sw], dxz = Math.hypot(b.x - a.x, b.z - CH - a.z), step = Math.max(0.5, Math.abs(a.speed) * 0.12);
    check('the way back: the car’s pose is continuous across the swap (same x, same heading, one frame’s travel: no teleport) and its speed is kept', Math.abs(b.x - a.x) < 0.6 && Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))) < 0.1 && dxz < step + 1.2 && Math.abs(b.speed - a.speed) < 1.0 && a.speed > 3, JSON.stringify({ dx: +(b.x - a.x).toFixed(2), dyaw: +(b.yaw - a.yaw).toFixed(3), travel: +dxz.toFixed(2), before: a.speed, after: b.speed }));
    const around = fb.slice(Math.max(0, sw - 40), sw + 40);
    check('the way back: the player stays in the driver’s seat, the touch pad stays up and the engine keeps running on every frame around the swap', around.every(f => f.driving && f.pad && f.engine && f.mode === 'play'), JSON.stringify({ frames: around.length, notDriving: around.filter(f => !f.driving).length, noPad: around.filter(f => !f.pad).length, engineOff: around.filter(f => !f.engine).length }));
    const rel = f => { const s = Math.sin(f.yaw), c = Math.cos(f.yaw), dx = f.cam[0] - f.x, dz = f.cam[2] - f.z; return [dx * c - dz * s, f.cam[1], dx * s + dz * c]; };
    const ra = rel(a), rb = rel(b), dc = Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]);
    check('the way back: the camera keeps its place behind the car (no jump, no re-framing)', dc < 1.2, JSON.stringify({ before: ra.map(v => +v.toFixed(2)), after: rb.map(v => +v.toFixed(2)), jump: +dc.toFixed(2) }));
    await shot('30-almadies-after-return');
  }
  const inA = await B();
  check('the way back: the same car, still owned, same colour seed, saved as parked in Almadies (not in the Corniche), one copy', inA.owned && inA.seed === seedBefore && inA.paint === paintBefore && inA.record?.hub === 'almadies' && (await mine()) === 1, JSON.stringify({ seed: inA.seed, record: inA.record, copies: await mine() }));
  check('the way back: it is the same asset with its state kept: the same record (uid), its condition neither reset nor healed by the two crossings', !!assetBefore && !!inA.asset && inA.asset.uid === assetBefore.uid && inA.asset.condition <= assetBefore.condition && inA.asset.paid === assetBefore.paid, JSON.stringify({ before: assetBefore && { uid: assetBefore.uid, condition: assetBefore.condition }, after: inA.asset && { uid: inA.asset.uid, condition: inA.asset.condition } }));
  // and stop and get out after this crossing too: the brake to a halt on the carriageway, « Descendre », the player on foot beside the car, the pad gone, the engine stopped, the car left parked where it stopped
  const homeAt = await AT();
  await pilot(page, t, 'gainde', [{ x: -60.4, z: homeAt.z - 12, tol: 4 }], { brakeAtEnd: true, cruise: 3 }).catch(() => {});
  await page.waitForFunction(() => Math.abs(window.__dakar.gainde.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  const stoppedAt = await AT();
  check('the way back: the brake stops the car (it does not run away after the crossing)', Math.abs(stoppedAt.speed) < 0.3, JSON.stringify({ speed: stoppedAt.speed }));
  await t.tap('#ridepad .rp-off');
  await wait(() => !window.__dakar.gainde.at().driving && !window.__dakar.gainde.info().exit, null, 120000);
  await page.waitForTimeout(800);
  const offA = await d(() => ({ pad: document.body.classList.contains('ridepad'), engine: window.__dakar.gainde.audio().running, mode: window.__dakar.pos().mode, me: window.__dakar.pos(), car: window.__dakar.gainde.at(), here: window.__dakar.gainde.info().here }));
  check('the way back: « Descendre » leaves the player on foot beside the car in Almadies, the pad gone and the engine stopped, the car parked where it stopped', !offA.car.driving && !offA.pad && !offA.engine && offA.me.hub === 'almadies' && offA.here && Math.hypot(offA.me.x - offA.car.x, offA.me.z - offA.car.z) < 6 && Math.abs(offA.car.z - stoppedAt.z) < 1.5, JSON.stringify({ pad: offA.pad, engine: offA.engine, hub: offA.me.hub, dist: +Math.hypot(offA.me.x - offA.car.x, offA.me.z - offA.car.z).toFixed(2), moved: +Math.abs(offA.car.z - stoppedAt.z).toFixed(2) }));
  await d(() => window.__dakar.save?.()); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.gainde?.info().owned, null, T); await page.waitForTimeout(2500);
  const ra2 = await B(), rp2 = await d(() => window.__dakar.pos());
  check('the way back: after a reload the player is in Almadies beside the car they drove home (save compatible, not duplicated)', rp2.hub === 'almadies' && ra2.owned && ra2.here && ra2.seed === seedBefore && ra2.record?.hub === 'almadies' && Math.abs(ra2.record.z - offA.car.z) < 0.3 && (await mine()) === 1 && ra2.asset?.condition === inA.asset?.condition && ra2.asset?.uid === assetBefore?.uid, JSON.stringify({ hub: rp2.hub, here: ra2.here, record: ra2.record }));
}
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await context.close();
if (filmed) { const p = await filmed.path(); fs.copyFileSync(p, `${out}/prestige-journey.webm`); console.log('film', `${out}/prestige-journey.webm`); }
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
