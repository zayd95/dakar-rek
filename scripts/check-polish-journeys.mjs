// The acceptance journeys of the vehicle, navigation and gameplay polish pass (docs/vehicles/POLISH.md), one per run, on a phone viewport with REAL touch
// (CDP Input.dispatchTouchEvent through scripts/lib/realTouch.mjs) wherever a player touches: the stick, the pedals, the action button, the phone.
// Debug hooks are used only to set a journey's start (an hour, money, a car already bought, a run of days already worked, a place to stand) and to read
// state for the checks; every one of them is named where it is used. Each run films itself (an MP4, H.264, silent) and writes its screenshots and results.
// Headless Chromium + SwiftShader: a software renderer, NOT a phone. Nothing here is a physical-iPhone result.
//
// Usage: node scripts/check-polish-journeys.mjs <baseUrl> <outDir> <journey>
//   arena     P0: the arena's pedestrian zone ends at visible bollards (car stops there, Jakarta rides between the posts); both junctions beside it are free
//   almadies  P0: the ways into the Almadies (from the Corniche road and from Pikine) and the coast road past the pier, driven through
//   G         a Lamane Sport at Prestige Auto: inspect, sit, start, an authorised road test out of the hall, a loop, back to its bay, walk away
//   A … I     the other journeys (see each one's header below)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch, pilot, walkTo, boardVehicle } from './lib/realTouch.mjs';
import { route, kerbOf, runUp, closedZones as closedStreets } from './lib/gridRoute.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const [base = 'http://127.0.0.1:4511/', outRoot = '/tmp/claude-0/veh/polish', which = 'G'] = process.argv.slice(2);
const out = `${outRoot}/${which}`;
fs.mkdirSync(`${out}/raw`, { recursive: true });
const T = { timeout: 300000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };
const note = (...a) => console.log('·', ...a);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: viewport } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const wait = (fn, a, ms = 240000) => page.waitForFunction(fn, a, { timeout: ms });
let shotN = 0; const shot = async n => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const ready = () => wait(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.streak, null);
let t;
const open = async (q = '') => { await page.goto(`${base}?debug&touch${q}`, { timeout: 180000 }); await ready(); t = await realTouch(page); await watchCards(); };
/** Every work card the page shows, noted the moment it appears (it goes by itself after 7 s: a loaded software renderer may look too late). */
let cardsRead = 0;
const watchCards = async () => {
  cardsRead = 0;
  await d(() => {
    const seen = new WeakSet(); window.__cards = [];
    const look = () => {
      const c = document.querySelector('.mo.bc'); if (!c || seen.has(c)) return; seen.add(c);
      const r = c.getBoundingClientRect(), j = document.querySelector('#joy')?.getBoundingClientRect(), a = document.querySelector('#act')?.getBoundingClientRect();
      const over = b => !!b && b.width > 0 && !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom);
      window.__cards.push({ at: performance.now(), text: c.innerText, overControls: over(j) || over(a) });
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
  });
};
/** Tap a menu row by its text, with a real finger. */
const tapItem = async text => {
  const at = () => d(tx => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => x.textContent.includes(tx)); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, text);
  for (let k = 0; k < 2; k++) {                                                      // the sheet slides in: let it settle, tap, and once more if it is still there
    await page.waitForTimeout(500);
    const c = await at(); if (!c) return k > 0;
    await t.down(8, c.x, c.y); await page.waitForTimeout(70); await t.up(8);
    await page.waitForTimeout(700);
  }
  return true;
};
const modalText = () => d(() => document.querySelector('#modal.on')?.textContent ?? '');
const card = () => d(() => { const c = document.querySelector('.mo.bc'); return c ? c.innerText : null; });
const goal = () => d(() => { const g = document.querySelector('#goal'); return g ? { text: g.innerText.replace(/\s+/g, ' ').trim(), nav: g.classList.contains('nav') } : null; });
/** Off the vehicle by « Descendre » (the car stopped first). */
const getOff = async key => { await t.tap('#ridepad .rp-off'); await wait(k => !window.__dakar[k].info().driving && !window.__dakar[k].info().exit && window.__dakar.pos().mode === 'play', key); };
/** A lane point on a grid street (right-hand traffic): heading +z the lane is at x − 2.1, heading −z at x + 2.1, heading +x at z + 2.1, heading −x at z − 2.1. */
const lane = (street, along, dir, axis) => (axis === 'z' ? { x: street - Math.sign(dir) * 2.1, z: along } : { x: along, z: street + Math.sign(dir) * 2.1 });
/**
 * Samples a vehicle while a drive runs: the slowest moment away from the start and the end, the impacts. Each sample also notes how far ahead the nearest car rapide
 * is (`rap`, metres along the heading, in a 4 m wide strip; null when none): they are solid to the player's car, so a car slowed behind one is held by what the driver sees.
 */
function sampler(key) {
  const s = { at: [], stop: false };
  (async () => { while (!s.stop) { try { const a = await d(k => { const a = window.__dakar[k].at(); if (!a) return null; const f = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }; let rap = null;
    for (const l of window.__dakar.transport?.lines?.() ?? []) for (const c of l.vehicles) { const dx = c.x - a.x, dz = c.z - a.z, along = dx * f.x + dz * f.z, side = Math.abs(dx * f.z - dz * f.x); if (along > 0 && along < 25 && side < 2 && (rap === null || along < rap)) rap = along; }
    return { ...a, rap: rap === null ? null : +rap.toFixed(1) }; }, key); if (a) s.at.push(a); await page.waitForTimeout(250); } catch { if (page.isClosed()) return; } } })();
  return s;
}
/** The slowest moment of a drive once the car has got going and before its final stop (a stop there means something held it), where, and the car rapide ahead then. */
const cruising = (at, end, from = 3) => { const i0 = at.findIndex(a => a.speed > from); if (i0 < 0) return { slowest: 0, where: null }; const mid = at.slice(i0).filter(a => Math.hypot(a.x - end.x, a.z - end.z) > 20); if (!mid.length) return { slowest: null, where: null }; let m = mid[0]; for (const a of mid) if (a.speed < m.speed) m = a; return { slowest: +m.speed.toFixed(2), where: [+m.x.toFixed(1), +m.z.toFixed(1)], rapideAhead: m.rap ?? null }; };
const ff = async (raw, mp4) => { try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'veryfast', '-movflags', '+faststart', mp4]); return true; } catch (e) { note('ffmpeg', e.message); return false; } };
/** The 5-day run, written as the save would hold it after five days worked (a debug shortcut: the days themselves are journeys A and B's). */
const giveRun = n => d(n => { const s = window.__dakar.state.data, day = s.play.day; s.streak.run = n; s.streak.best = Math.max(s.streak.best, n); s.streak.last = day; s.streak.lastMs = s.playedMs; s.streak.total = Math.max(s.streak.total, n); s.streak.seen = [2, 3, 5, 7].filter(m => m <= n); return window.__dakar.streak.info().run; }, n);

// =====================================================================================================================================================
const J = {};

// ---- P0: the arena's pedestrian zone and the two junctions beside it (Pikine)
J.arena = async () => {
  await open('&heure=11&argent=5000000');
  await wait(() => window.__dakar.teranga.info().floor.length > 0);
  await d(() => { window.__dakar.teranga.own(); window.__dakar.moto.own(); });                             // setup: both vehicles bought
  await wait(() => ['teranga', 'moto'].every(k => window.__dakar[k].info().owned && window.__dakar[k].info().here));
  const posts = await d(() => { let n = 0, g = null; window.__dakar.three.scene.traverse(o => { if (o.name === 'arena_plaza_ends') { g = o; o.traverse(m => { if (m.isMesh) n++; }); } }); return g ? { meshes: n, visible: g.visible } : null; });
  check('the zone\'s two ends are drawn: a line of bollards and a sign « ZONE PIÉTONNE » at each end of the street', posts && posts.visible && posts.meshes >= 2, JSON.stringify(posts));
  // the car, north through the junction west of the zone (x = 0), then east of it (x = 60)
  for (const [i, X] of [[1, 0], [2, 60]]) {
    const a0 = lane(X, -104, 1, 'z');
    await d(([x, z]) => window.__dakar.teranga.place(x, z, 0), [a0.x, a0.z]);
    await d(([x, z]) => window.__dakar.place(x + 2.4, z, 0), [a0.x, a0.z]);                    // the driver's side (the car's left: +x heading north)
    await page.waitForTimeout(600);
    await boardVehicle(page, t, 'teranga');
    await d(() => window.__dakar.teranga.feelReset());
    const s = sampler('teranga');
    const end = lane(X, -18, 1, 'z');
    const last = await pilot(page, t, 'teranga', [{ ...lane(X, -80, 1, 'z'), tol: 3, speed: 7 }, { ...lane(X, -60, 1, 'z'), tol: 3, speed: 7 }, { ...end, tol: 3, speed: 7 }], { cruise: 7, stall: 20000, brakeAtEnd: true });
    s.stop = true;
    // what held a car here before this pass (the zone's invisible box) was a knock and a dead stop; the test's own driver eases to about 2 m/s when its line
    // wavers on a loaded renderer (as in the Almadies drives), so « never slowed » is no knock and never below 0.8 m/s
    const cross = s.at.filter(a => a.z > -72 && a.z < -48), low = cross.length ? cross.reduce((b, a) => (a.speed < b.speed ? a : b)) : null, slow = low?.speed ?? null, felt = await d(() => window.__dakar.teranga.feel());
    check(`car, junction ${i} (x = ${X}) beside the zone: driven straight through, never slowed by anything unseen`, Math.hypot(last.x - end.x, last.z - end.z) < 4 && slow !== null && slow > 0.8 && felt.impacts.length === 0, JSON.stringify({ end: [last.x, last.z], slowest: slow, where: low && [low.x, low.z], rapideAhead: low?.rap ?? null, impacts: felt.impacts }));
    if (i === 1) await shot('car-junction-west');
    await getOff('teranga');
  }
  // the car, east along the zone's street toward the gate: it stops at the bollards, the ones the driver sees
  const s0 = lane(-60, -30, 1, 'x');
  await d(([x, z]) => window.__dakar.teranga.place(x, z, Math.PI / 2), [s0.x, s0.z]);
  await d(([x, z]) => window.__dakar.place(x, z - 2.4, Math.PI / 2), [s0.x, s0.z]);
  await page.waitForTimeout(600);
  await boardVehicle(page, t, 'teranga');
  await pilot(page, t, 'teranga', [{ ...lane(-60, -6, 1, 'x'), tol: 3, speed: 5 }, { ...lane(-60, 28, 1, 'x'), tol: 1.5, speed: 3 }], { cruise: 5, stall: 9000 });
  await page.waitForTimeout(1500);
  const stopAt = await d(() => window.__dakar.teranga.at()), why = await d(([x, z]) => window.__dakar.teranga.solidAt(x + 2.45, z, 0.3), [stopAt.x, stopAt.z]);   // just past the front bumper
  check('car, toward the gate: it stops with its bumper at the line of bollards (x = 15.5), held by them and nothing else', stopAt.x > 11 && stopAt.x < 14.2 && /footprint/.test(why?.why ?? ''), JSON.stringify({ x: stopAt.x, z: stopAt.z, why }));
  await shot('car-stopped-at-bollards');
  await getOff('teranga');
  // the Jakarta: east of the zone along the kerb into its guarded places, then between two posts into the zone, up to the queue's barriers
  const m0 = { x: 72, z: -55.6 };
  await d(([x, z]) => window.__dakar.moto.place(x, z, -Math.PI / 2), [m0.x, m0.z]);
  await d(([x, z]) => window.__dakar.place(x, z + 1.6, -Math.PI / 2), [m0.x, m0.z]);           // the saddle's side (heading west the bike's left is +z)
  await page.waitForTimeout(600);
  await boardVehicle(page, t, 'moto');
  await d(() => window.__dakar.moto.feelReset());
  const ms = sampler('moto');
  // along the kerb lane (z = −55.7), where the east line of bollards has its gap (src/arena/exteriorRules.ts plazaBollards)
  const m1 = await pilot(page, t, 'moto', [{ x: 60, z: -55.7, tol: 2.5, speed: 5 }, { x: 47, z: -55.7, tol: 2, speed: 3 }, { x: 44.5, z: -55.7, tol: 1.4, speed: 2 }, { x: 40, z: -55.7, tol: 1.5, speed: 2.5 }, { x: 31, z: -55.7, tol: 1.2, speed: 2.5 }], { cruise: 4, stall: 9000 });
  ms.stop = true; await page.waitForTimeout(1200);
  const mAt = await d(() => window.__dakar.moto.at());
  check('Jakarta: in by the kerb, past its guarded places, between two posts of the east line into the zone', ms.at.some(a => a.x < 43.5) && mAt.x < 44, JSON.stringify({ end: [mAt.x, mAt.z], minX: Math.min(...ms.at.map(a => a.x)) }));
  const mWhy = await d(([x, z]) => window.__dakar.moto.solidAt(x - 1.15, z, 0.3), [mAt.x, mAt.z]);
  check('Jakarta: in the zone, held only by what is drawn there (a stall, the queue\'s crowd barriers), never by the zone itself', mAt.x > 32.4 && mAt.x < 43 && !!mWhy && (/collider/.test(mWhy.why) || (/footprint/.test(mWhy.why) && (mWhy.foot?.hw ?? 1) < 0.2)), JSON.stringify({ x: mAt.x, why: mWhy }));
  await shot('jakarta-at-the-barriers');
  await d(() => window.__dakar.moto.place(-2.1, -96, 0)); await page.waitForTimeout(400);
  await d(() => window.__dakar.moto.feelReset());
  const js = sampler('moto');
  const j1 = await pilot(page, t, 'moto', [{ x: -2.1, z: -60, tol: 3, speed: 7 }, { x: -2.1, z: -22, tol: 3, speed: 7 }], { cruise: 7, stall: 20000, brakeAtEnd: true });
  js.stop = true;
  const jc = js.at.filter(a => a.z > -72 && a.z < -48), jLow = jc.length ? jc.reduce((b, a) => (a.speed < b.speed ? a : b)) : null, jSlow = jLow?.speed ?? null, jFelt = await d(() => window.__dakar.moto.feel());
  check('Jakarta: straight through the junction west of the zone, never slowed (no knock, never below 0.8 m/s, as the car)', Math.abs(j1.z + 22) < 4 && jSlow > 0.8 && jFelt.impacts.length === 0, JSON.stringify({ end: [j1.x, j1.z], slowest: jSlow, where: jLow && [jLow.x, jLow.z], rapideAhead: jLow?.rap ?? null, impacts: jFelt.impacts }));
};

// ---- P0: into the Almadies by both ways in, and the coast road past the pier
J.almadies = async () => {
  await open('&heure=11&argent=200000000');
  await d(() => { window.__dakar.teleport('almadies'); });
  await wait(() => window.__dakar.pos().hub === 'almadies');
  await wait(() => window.__dakar.gainde.info().floor.length > 0);
  await d(() => window.__dakar.gainde.own()); await wait(() => window.__dakar.gainde.info().owned && window.__dakar.gainde.info().here);    // setup: a Gaïndé bought at Prestige Auto
  const runs = [
    { name: 'from the Corniche road, south through four junctions', start: { ...lane(-60, 124, -1, 'z'), yaw: Math.PI }, pts: [lane(-60, 60, -1, 'z'), lane(-60, 0, -1, 'z'), lane(-60, -60, -1, 'z'), lane(-60, -100, -1, 'z')] },
    { name: 'the coast road (z = −120) east past the pier', start: { ...lane(-120, -100, 1, 'x'), yaw: Math.PI / 2 }, pts: [lane(-120, -60, 1, 'x'), lane(-120, 0, 1, 'x'), lane(-120, 60, 1, 'x'), lane(-120, 100, 1, 'x')] },
    { name: 'from Pikine, west through three junctions', start: { ...lane(-60, 124, -1, 'x'), yaw: -Math.PI / 2 }, pts: [lane(-60, 60, -1, 'x'), lane(-60, 0, -1, 'x'), lane(-60, -40, -1, 'x')] },
  ];
  let first = true;
  for (const r of runs) {
    await d(([x, z, y]) => window.__dakar.gainde.place(x, z, y), [r.start.x, r.start.z, r.start.yaw]);
    if (first) { await d(([x, z, y]) => window.__dakar.place(x + Math.cos(y) * 2.4, z - Math.sin(y) * 2.4, y), [r.start.x, r.start.z, r.start.yaw]); await page.waitForTimeout(600); await boardVehicle(page, t, 'gainde'); first = false; }
    await page.waitForTimeout(500);
    await d(() => window.__dakar.gainde.feelReset());
    const s = sampler('gainde');
    const last = await pilot(page, t, 'gainde', r.pts.map(p => ({ ...p, tol: 3.5, speed: 7 })), { cruise: 7, stall: 15000, brakeAtEnd: true });
    s.stop = true;
    const end = r.pts[r.pts.length - 1], cr = cruising(s.at, end), slow = cr.slowest, felt = await d(() => window.__dakar.gainde.feel());
    const blocks = [];
    for (let k = 0; k < r.pts.length; k++) { const p = r.pts[k]; const why = await d(([x, z]) => window.__dakar.gainde.solidAt(x, z, 1), [p.x, p.z]); if (why) blocks.push({ at: [p.x, p.z], why: why.why, rect: why.rect }); }
    // what held a car here was solid and unseen (the gate's wall, the pier across the road): a knock and a dead stop. The test's driver slows itself to about 2 m/s at a
    // waypoint or when its line wavers (scripts/lib/realTouch.mjs pilot), so « no stop » is: never a knock, never below 0.8 m/s unless queued behind a car rapide (solid, in sight)
    check(`Almadies, ${r.name}: driven to the end, no stop on the way`, Math.hypot(last.x - end.x, last.z - end.z) < 5 && felt.impacts.length === 0 && (slow > 0.8 || (cr.rapideAhead !== null && cr.rapideAhead < 12)), JSON.stringify({ end: [last.x, last.z], ...cr, impacts: felt.impacts.map(i => i.what ?? i) }));
    check(`Almadies, ${r.name}: nothing solid on the lane at any junction`, blocks.length === 0, JSON.stringify(blocks));
    await shot(r.name.split(' ').slice(0, 3).join('-'));
  }
};

// ---- G: a Lamane Sport at Prestige Auto, a worker of five days in a row with little money
J.G = async () => {
  await open('&heure=11&argent=300000');
  await d(() => { window.__dakar.teleport('almadies', -100.5, 4.6, 0); });
  await wait(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.sales?.info().here && window.__dakar.suv?.info().floor.length === 2);
  const run = await giveRun(5);
  note('setup: a run of', run, 'days (debug), wallet 300 000 F');
  const S = () => d(() => window.__dakar.suv.info()), AT = () => d(() => window.__dakar.suv.at());
  const count = () => d(() => { const names = []; window.__dakar.three.scene.traverse(o => { if (o.isGroup && /^suv:(floor:\d|mine)$/.test(o.name)) names.push(o.name); }); return names; });
  const s0 = await S(), car = s0.floor[0], n0 = await count(), w0 = await d(() => window.__dakar.state.wallet);
  await walkTo(page, t, -101.2, 15.5, { tol: 0.6 });
  await walkTo(page, t, car.x, 19.6, { tol: 0.4 });
  await wait(() => /^suv:floor:/.test(window.__dakar.focus()?.id ?? ''), null, 60000);
  const f = await d(() => window.__dakar.focus());
  check('a Lamane Sport on the floor offers « Essayer cette voiture » and the purchase', f.primary === 'Essayer cette voiture' && f.all.some(a => /^Acheter/.test(a)), JSON.stringify(f));
  await shot('lamane-on-the-floor');
  await t.tap('#act');
  await wait(() => /clés/.test(document.querySelector('#modal.on')?.textContent ?? ''));
  await shot('keys');
  await tapItem('Prendre les clés');
  const fl = (await S()).floor[0];
  await walkTo(page, t, fl.step.x, fl.step.z, { tol: 0.4 });
  await wait(() => /Ouvrir/.test(window.__dakar.focus()?.primary ?? ''), null, 60000);
  await t.tap('#act');
  await wait(() => window.__dakar.suv.info().driving);
  const tr = await S(), n1 = await count();
  check('sitting in the very car from the floor: one car, no copy, nothing paid or owned', tr.trial && !tr.owned && !tr.record && n1.length === n0.length && !n1.includes('suv:mine') && (await d(() => window.__dakar.state.wallet)) === w0, JSON.stringify({ n0, n1 }));
  check('the salesperson authorises a supervised road test: a worker of five days in a row (not the money: 300 000 F)', tr.road.ok && tr.road.supervised && /travailleur/.test(tr.road.line), JSON.stringify(tr.road));
  await page.waitForTimeout(1200); await shot('engine-on');
  const s = sampler('suv');
  const LAP = [
    { x: fl.x, z: 12, tol: 3 }, { x: fl.x + 4.5, z: 6, tol: 2.2, speed: 4 }, { x: -76, z: 1.2, tol: 3, speed: 5 }, { x: -68, z: 1.2, tol: 3 }, { x: -64.5, z: 2.6, tol: 2.5, speed: 4 }, { x: -61.2, z: 7, tol: 2.5, speed: 4 }, { x: -60.4, z: 16, tol: 3 }, { x: -60.4, z: 30, tol: 4 }, { x: -60.4, z: 44, tol: 4 },
    { x: -61.4, z: 52.5, tol: 2.5, speed: 3 }, { x: -65, z: 58.8, tol: 2.5, speed: 3 }, { x: -72, z: 60, tol: 3, speed: 4 }, { x: -92, z: 60, tol: 4 }, { x: -108, z: 60, tol: 4 },
    { x: -114.8, z: 59.2, tol: 2.5, speed: 3 }, { x: -119.2, z: 55.6, tol: 2.5, speed: 3 }, { x: -120, z: 46, tol: 3.5 }, { x: -120, z: 24, tol: 4 },
    { x: -120, z: 16, tol: 3 }, { x: -120, z: 9.5, tol: 2, speed: 2.5 }, { x: -118.2, z: 4.6, tol: 2, speed: 2.5 }, { x: -113.5, z: 1.4, tol: 2.5, speed: 3 }, { x: -104, z: 1, tol: 3 }, { x: -96, z: 1.4, tol: 3 }, { x: -91.5, z: 4.5, tol: 2.5, speed: 3 }, { x: fl.x, z: 10, tol: 2.2, speed: 2.5 },
  ];
  await pilot(page, t, 'suv', LAP.slice(0, 6)); await shot('out-on-the-road');
  await pilot(page, t, 'suv', LAP.slice(6, 19)); await shot('round-the-block');
  await pilot(page, t, 'suv', LAP.slice(19));
  // back in through the bay, nose in, and stopped in it
  await pilot(page, t, 'suv', [{ x: fl.x, z: 16, tol: 1.4, speed: 2 }, { x: fl.x, z: fl.z - 0.5, tol: 1.2, speed: 1.6 }], { brakeAtEnd: true, cruise: 2 });
  s.stop = true;
  const back = await AT();
  check('a loop of the block on the real road (out of the hall, onto the street, round and back)', s.at.some(a => a.z > 55) && s.at.some(a => a.x < -117) && s.at.some(a => a.x > -63), JSON.stringify({ maxZ: Math.max(...s.at.map(a => a.z)), minX: Math.min(...s.at.map(a => a.x)), maxX: Math.max(...s.at.map(a => a.x)) }));
  check('driven back into its own bay', Math.abs(back.x - fl.x) < 1.2 && Math.abs(back.z - fl.z) < 2.2, JSON.stringify({ at: [back.x, back.z], bay: [fl.x, fl.z] }));
  await shot('back-in-the-bay');
  await getOff('suv');
  await shot('got-off');
  // walk away, out by the doorway and down the street, out of sight: the dealership puts the car back on display (the same car, the same paint)
  await walkTo(page, t, -100.5, 18, { tol: 0.8 });
  await walkTo(page, t, -101.2, 6, { tol: 0.8 });
  await walkTo(page, t, -101.2, -2.5, { tol: 1 });
  await walkTo(page, t, -63.5, -2.5, { tol: 1.5, ms: 120000 });                  // along the street, then down the next one, the hall behind
  await walkTo(page, t, -63.5, -40, { tol: 1.5, ms: 120000 });
  await wait(() => window.__dakar.suv.info().trialSlot === -1, null, 120000).catch(() => {});
  const end = await S(), n2 = await count(), w2 = await d(() => window.__dakar.state.wallet);
  check('walked away: the car is back on the floor in its bay, on display; nothing owned, nothing saved, nothing paid', end.trialSlot === -1 && !end.trial && !end.owned && !end.record && end.floor[0].here && end.floor[0].state === 'display' && w2 === w0, JSON.stringify({ floor: end.floor.map(c => [c.slot, c.state, c.here]), wallet: w2 }));
  check('still one car per bay: no copy left on the road or in the hall', n2.length === n0.length && !n2.includes('suv:mine'), JSON.stringify(n2));
  check('the same paint as before the test', end.floor[0].colour === car.colour, `${car.colour} → ${end.floor[0].colour}`);
};

// ---- shared: the phone, a Tiak run on a vehicle, the card
const phoneApp = async id => {
  if (!(await d(() => window.__dakar.phoneInfo().open))) { await t.tap('#menuBtn'); await wait(() => window.__dakar.phoneInfo().open, null, 30000); }
  await d(i => window.__dakar.phone(i), id); await page.waitForTimeout(500);   // (every app is one tap away in « Toutes les apps »; the journeys go straight to it)
};
const phoneClose = async () => { if (await d(() => window.__dakar.phoneInfo().open)) { await t.tap('#phone [data-nav="close"]'); await wait(() => !window.__dakar.phoneInfo().open, null, 20000); } };
/** A job offer of the « Travail » app, tapped by its text (the cards use short names: « 🥬 Maïga → 🔧 Garage »). */
const takeJob = async (text, routeId) => {
  for (let k = 0; k < 3; k++) {                                                      // the sheet slides in: tap once it has settled, and again if no job (or another) started
    await phoneApp('travail'); await page.waitForSelector('#modal.on', T);
    // the sheet slides up: a slow page can hold a frame between two looks and slide on after (the finger then lands on the card below)
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'), null, { timeout: 8000 }).catch(() => {});
    const c = page.locator('#modal .dcard', { hasText: text }).first();
    await c.evaluate(e => e.scrollIntoView({ block: 'center' }));
    // the point tapped is on this card when the finger goes down: measured three times running at the same place, and checked in the page
    let at = null; for (let i = 0; i < 30 && !at; i++) { await page.waitForTimeout(300); at = await c.evaluate(e => { const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; e.__ats = [...(e.__ats ?? []), y].slice(-3);
      return e.__ats.length === 3 && Math.max(...e.__ats) - Math.min(...e.__ats) < 0.5 && document.getAnimations().every(a => a.playState !== 'running') && document.elementFromPoint(x, y)?.closest('.dcard') === e ? { x, y } : null; }); }
    if (at) { await t.down(5, at.x, at.y); await page.waitForTimeout(60); await t.up(5); }
    if (await wait(id => window.__dakar.activeJob()?.routeId === id, routeId, 20000).then(() => true, () => false)) return;
    const other = await d(() => window.__dakar.activeJob()?.routeId ?? null);
    if (other) { note(`the tap took another offer (${other}): dropped (debug hook), tapped again`); await d(() => window.__dakar.cancelJob()); }
    else note(`the tap on the offer started nothing (${at ? 'tapped' : 'the card never settled under the finger'}): the phone again`);
    await phoneClose().catch(() => {});
  }
  throw new Error(`the job ${routeId} did not start`);
};
/**
 * Drive or ride `key` along the streets to a kerb spot k ({ x, z, yaw }) of this district, never through the arena's pedestrian street (as the game's own directions).
 * Held up for long on the way (a car rapide at its stop: its dwell lasts minutes of wall clock on a software renderer), it plans again from where it stands, twice at most.
 * Already in the kerb's street and lane, short of it, it just runs in.
 */
/** The streets closed to cars here (the arena's pedestrian zone, a road event's closed segment), for the test's own street planner. */
const closedZones = () => closedStreets(page);
const driveToKerb = async (key, k, o = {}) => {
  const avoid = await closedZones(), cruise = o.cruise ?? 6, f = { x: Math.sin(k.yaw), z: Math.cos(k.yaw) };
  let at = null;
  for (let n = 0; n < 3; n++) {
    const a = await d(kk => window.__dakar[kk].at(), key);
    if (Math.hypot(a.x - k.x, a.z - k.z) < 5) break;
    const along = (k.x - a.x) * f.x + (k.z - a.z) * f.z, side = Math.abs((k.x - a.x) * f.z - (k.z - a.z) * f.x);
    const r = (n || along < 40) && along > 3 && along < 80 && side < 4 && Math.cos(a.yaw - k.yaw) > 0.8
      ? [{ x: k.x - f.x * 5, z: k.z - f.z * 5, tol: 2.2, speed: 2.2 }, { x: k.x + f.x * 1.5, z: k.z + f.z * 1.5, tol: 2, speed: 2.2 }]     // already in the kerb's street, short of it
      : route({ x: a.x, z: a.z, yaw: a.yaw }, k, { cruise, avoid });
    if (!r) { if (n) break; throw new Error(`no street route to ${JSON.stringify(k)}`); }
    at = await pilot(page, t, key, r, { cruise, stall: 60000, ms: 1500000, brakeAtEnd: true });
    if (Math.hypot(at.x - k.x, at.z - k.z) < 5) break;
    note(`held up ${Math.hypot(at.x - k.x, at.z - k.z).toFixed(0)} m short of the kerb: on again from where it stands`);
  }
  return at;
};
/** Drive or ride `key` to the kerb of a place (x, z) of this district. */
const toKerb = (key, place, o = {}) => driveToKerb(key, kerbOf(place), o);
/** A Tiak stop: ridden to the kerb of the place, off the bike, and on foot to its door if the kerb is not close enough; waits for `until` (in the page). */
const atStop = async (key, place, until, o = {}) => {
  await toKerb(key, place);
  // a drop-off done from the saddle: its card read (and tapped) before getting off, while it is still up (it goes by itself after 7 s)
  let card = null;
  if (o.card && await wait(until, null, 4000).then(() => true, () => false)) card = await readCard();
  await getOff(key);
  if (!(await wait(until, null, 6000).then(() => true, () => false))) {
    // the rider steps off on the street side, the place is on the other: round the end of the bike nearer to it, then to the door
    const k = kerbOf(place), b = await d(kk => window.__dakar[kk].at(), key), F = { x: Math.sin(b.yaw), z: Math.cos(b.yaw) }, L = { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) };
    const end = Math.sign((place.x - b.x) * F.x + (place.z - b.z) * F.z) || 1;
    await walkTo(page, t, b.x + F.x * 2.4 * end + L.x * 1.2, b.z + F.z * 2.4 * end + L.z * 1.2, { tol: 0.7, ms: 30000 });
    await walkTo(page, t, place.x, (place.z + k.z) / 2, { tol: 0.6, ms: 60000 });
    await wait(until, null, 20000);
  }
  return o.card ? card ?? await readCard() : null;
};
/** The work card on screen, read; then dismissed by a tap, as a player would. */
const readCard = async () => {
  await wait(n => (window.__cards?.length ?? 0) > n, cardsRead, 30000);
  const rec = await d(n => window.__cards[n], cardsRead); cardsRead++;
  if (!(await d(() => !!document.querySelector('.mo.bc')))) { note('the card had already gone by itself when the check looked (it shows 7 s): its text as it appeared'); return { text: rec.text, gone: true, tapped: false, overControls: rec.overControls }; }
  await page.waitForTimeout(600);
  const text = await card();
  await shot('work-card');
  const c = await d(() => { const r = document.querySelector('.mo.bc').getBoundingClientRect(), j = document.querySelector('#joy')?.getBoundingClientRect(), a = document.querySelector('#act')?.getBoundingClientRect(); const over = b => b && b.width && !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom); return { x: r.left + r.width / 2, y: r.top + r.height / 2, overJoy: over(j), overAct: over(a) }; });
  await t.down(6, c.x, c.y); await page.waitForTimeout(60); await t.up(6);
  const gone = await wait(() => !document.querySelector('.mo.bc'), null, 8000).then(() => true, () => false);
  return { text, gone, tapped: true, overControls: c.overJoy || c.overAct };
};
const ledger = () => d(() => window.__dakar.ledger());
/** The wallet's lines written since `mark` (the newest line when it was taken): the phone's ledger is newest first and keeps a fixed number of lines. */
const ledgerMark = async () => (await ledger())[0] ?? null;
const ledgerSince = async mark => { const all = await ledger(), i = mark ? all.findIndex(e => e.at === mark.at && e.label === mark.label && e.amount === mark.amount) : -1; return i < 0 ? all : all.slice(0, i); };
/** Stand within reach of a person or thing and wait until the action button acts on it (`id`), trying a few spots round (x, z) (as scripts/check-first-car.mjs). */
const focusOn = async (id, x, z) => {
  for (const [dx, dz] of [[1.2, -0.8], [-1.2, -0.8], [0, -1.3], [1.4, 0], [-1.4, 0]]) {
    await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [x + dx, z + dz, Math.atan2(-dx, -dz)]);
    if (await wait(i => window.__dakar.focus()?.id === i, id, 2500).then(() => true, () => false)) return true;
  }
  return false;
};
/** Out of a kerb lane with a car parked ahead: into the lane at a slant, then straight (as scripts/check-first-car.mjs). */
const pullOut = c => { const F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }, R = { x: -Math.cos(c.yaw), z: Math.sin(c.yaw) }, p = { x: c.x + F.x * 9, z: c.z + F.z * 9 };
  const snap = v => [-120, -60, 0, 60, 120].reduce((b, q) => (Math.abs(q - v) < Math.abs(b - v) ? q : b));
  const q = Math.abs(F.x) > Math.abs(F.z) ? { x: p.x, z: snap(c.z) } : { x: snap(c.x), z: p.z };
  return [{ x: c.x + F.x * 5 - R.x * 2.8, z: c.z + F.z * 5 - R.z * 2.8, tol: 2, speed: 3 }, { x: q.x + F.x * 4 + R.x * 2.1, z: q.z + F.z * 4 + R.z * 2.1, tol: 2.5, speed: 4 }]; };

// ---- A: a new player, a first delivery, the first day; the next day, a second: « 2 jours d'affilée »
J.A = async () => {
  await open('&heure=10');
  await d(() => { window.__moments = []; const grab = () => { for (const e of document.querySelectorAll('.mo')) { const t = e.innerText.replace(/\s+/g, ' ').trim(); if (t && !window.__moments.includes(t)) window.__moments.push(t); } }; new MutationObserver(grab).observe(document.body, { childList: true, subtree: true, characterData: true }); });
  const st0 = await d(() => window.__dakar.streak.info());
  check('a new player: no day worked, no run', st0.streak.run === 0 && st0.streak.total === 0, JSON.stringify(st0.streak));
  await phoneApp('profil'); const prof0 = await d(() => document.querySelector('#phone .ph-streak')?.innerText ?? ''); await shot('profile-new'); await phoneClose();
  check('the Profile says how a day counts, and no run yet', /Comment ça marche|0 jour/.test(prof0), prof0.replace(/\s+/g, ' ').slice(0, 200));
  await takeJob(/Maïga.*Garage/, 'pk_maiga_garage');
  await shot('job-taken');
  // the Tiak Tiak bike lent by the stand, in the street south of the Maïga (setup, as journey E: the ride out of the gare's corner is not this journey's), the player beside it
  await d(() => { window.__dakar.tiak.place(62.1, -30, 0); window.__dakar.place(64.2, -30, 0); });
  await page.waitForTimeout(800);
  await boardVehicle(page, t, 'tiak');
  await page.waitForTimeout(1200);
  const g1 = await goal(), n1 = await d(() => window.__dakar.nav.info().now);
  check('on the bike with the job in hand, the goal line gives directions: the next turn and the distance left, to the pick-up', g1?.nav && /[↰↱↑↶]/.test(g1.text) && /Maïga/.test(g1.text) && /\d+ (m|km)/.test(g1.text), JSON.stringify({ g1, n1: n1 && { text: n1.text, dist: n1.dist } }));
  await shot('nav-to-pickup');
  await atStop('tiak', { x: 78, z: -5.5 }, () => window.__dakar.activeJob()?.stage === 'deliver');
  await shot('parcel-picked-up');
  await boardVehicle(page, t, 'tiak'); await page.waitForTimeout(1200);
  const g2 = await goal();
  check('parcel picked up at the kerb of the Maïga: the directions turn to the client', /Garage Modou/.test(g2?.text ?? ''), JSON.stringify(g2));
  await shot('nav-to-client');
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await ledgerMark();
  const c1 = await atStop('tiak', { x: 102, z: -5.5 }, () => !window.__dakar.activeJob(), { card: true }), w1 = await d(() => window.__dakar.state.wallet), lines = (await ledgerSince(l0));
  check('delivered: paid ONCE (one wallet line)', w1 > w0 && lines.length === 1, JSON.stringify({ paid: w1 - w0, lines: lines.map(l => l.label) }));
  check('the card: the job, where to, what it paid, how long, how far, « 1 jour actif · Premier jour actif », one line on how it went', /Livraison réussie|Livré en retard/.test(c1.text) && /Garage Modou/.test(c1.text) && new RegExp(`${(w1 - w0).toLocaleString('fr-FR').replace(/\s/g, '.')} F`).test(c1.text) && /Durée/.test(c1.text) && /Distance/.test(c1.text) && /1 jour actif/.test(c1.text) && /Premier jour actif/.test(c1.text) && /Livré/.test(c1.text) && !/★/.test(c1.text), c1.text.replace(/\s+/g, ' '));
  await phoneApp('profil'); const prof1 = await d(() => document.querySelector('#phone .ph-streak')?.innerText ?? ''); await shot('profile-day-1'); await phoneClose();
  check('the Profile: « 1 jour actif »', /1 jour actif/.test(prof1), prof1.replace(/\s+/g, ' ').slice(0, 200));
  // a second delivery the same day: no second day
  await takeJob(/Maïga.*Garage/, 'pk_maiga_garage'); await phoneClose().catch(() => {});
  await boardVehicle(page, t, 'tiak');
  await atStop('tiak', { x: 78, z: -5.5 }, () => window.__dakar.activeJob()?.stage === 'deliver'); await boardVehicle(page, t, 'tiak');
  const day1 = await d(() => window.__dakar.state.data.play.day);
  const c2 = await atStop('tiak', { x: 102, z: -5.5 }, () => !window.__dakar.activeJob(), { card: true });
  // the player's day moves with the city's clock (src/economy/streak.ts advancePlay): a slow run can cross midnight between the two deliveries, then the card
  // rightly says the new day counts « un peu plus tard » (two counted days are 10 played minutes apart): either way the second delivery counts nothing now
  const sameDay = (await d(() => window.__dakar.state.data.play.day)) === day1;
  check('a second delivery the same day pays, and the card says the day is already counted (no farming)', (sameDay ? /Aujourd’hui est déjà compté/ : /Compté pour aujourd’hui un peu plus tard/).test(c2.text) && (await d(() => window.__dakar.streak.info().streak.run)) === 1, `${sameDay ? 'same day' : 'the city day turned'}: ${c2.text.replace(/\s+/g, ' ')}`);
  // the next day (a debug shortcut for the city day the journey cannot wait for, labelled): a delivery, the run of 2, its short celebration
  await d(() => { window.__dakar.streak.nextDay(); window.__dakar.streak.later(); });
  await takeJob(/Maïga.*Garage/, 'pk_maiga_garage'); await phoneClose().catch(() => {});
  await boardVehicle(page, t, 'tiak');
  await atStop('tiak', { x: 78, z: -5.5 }, () => window.__dakar.activeJob()?.stage === 'deliver'); await boardVehicle(page, t, 'tiak');
  const c3 = await atStop('tiak', { x: 102, z: -5.5 }, () => !window.__dakar.activeJob(), { card: true });
  { const tc = [c1, c2, c3].find(c => c.tapped) ?? c1;               // the tap is checked on the first card still up when the check looked (a loaded renderer can be late)
    check('the card is brief, clear of the stick and the action button, and a tap dismisses it', tc.tapped && tc.gone && ![c1, c2, c3].some(c => c.overControls), JSON.stringify({ tapped: [c1, c2, c3].map(c => c.tapped), gone: tc.gone, over: [c1, c2, c3].map(c => c.overControls) })); }
  check('the next day\'s delivery: the card counts the day: « 2 jours d’affilée »', /2 jours d’affilée/.test(c3.text) && /Jour actif compté/.test(c3.text), c3.text.replace(/\s+/g, ' '));
  // the celebration is up for a few seconds of the page's own clock: it is caught when it appears (a recorder on the page), not by a poll that a busy renderer can make late
  await wait(() => (window.__moments ?? []).some(x => /2 jours d’affilée !/.test(x)) || [...document.querySelectorAll('.mo')].some(e => /2 jours d’affilée !/.test(e.textContent)), null, 20000).catch(() => {});
  const mile = await d(() => (window.__moments ?? []).find(x => /affilée !/.test(x)) ?? [...document.querySelectorAll('.mo')].map(e => e.innerText.replace(/\s+/g, ' ')).find(x => /affilée !/.test(x)) ?? null);
  await shot('milestone-2-days');
  check('… then a short celebration of the milestone, saying what it opens (the dealers know the player) and that it is never the only way', mile && /2 jours d’affilée !/.test(mile) && /jamais/.test(mile), mile ?? 'none');
  await phoneApp('profil'); const prof2 = await d(() => document.querySelector('#phone .ph-streak')?.innerText ?? ''); await shot('profile-day-2'); await phoneClose();
  check('the Profile: « 2 jours d’affilée », the best run, the days worked, what 3 days will open', /2 jours d’affilée/i.test(prof2) && /À 3 jours/i.test(prof2), prof2.replace(/\s+/g, ' ').slice(0, 300));
  const st = await d(() => window.__dakar.streak.info());
  check('saved in the v6 save: the run, the days, the milestones seen', st.streak.run === 2 && st.streak.total === 2 && st.streak.seen.includes(2), JSON.stringify(st.streak));
};

// ---- B: three days in a row and little money: Pape Sarr lets a Teranga go on the road; a loop, back to its place, walk away
J.B = async () => {
  await open('&heure=10&argent=20000');
  await wait(() => window.__dakar.teranga.info().floor.length > 0);
  await giveRun(3); note('setup: a run of 3 days (journey A works the days), 20 000 F, Pape Sarr not met yet');
  const T0 = () => d(() => window.__dakar.teranga.info()), w0 = await d(() => window.__dakar.state.wallet);
  const car = (await T0()).floor.find(c => c.slot === 0);
  await d(c => window.__dakar.place(c.stand.x, c.stand.z, Math.atan2(c.x - c.stand.x, c.z - c.stand.z)), car);
  await wait(() => /^teranga:floor:/.test(window.__dakar.focus()?.id ?? ''), null, 60000);
  await shot('teranga-on-the-lot');
  await t.tap('#act');
  await wait(() => /clés/.test(document.querySelector('#modal.on')?.textContent ?? ''));
  await tapItem('Prendre les clés');
  const fl = (await T0()).floor.find(c => c.slot === 0);
  await walkTo(page, t, fl.step.x, fl.step.z, { tol: 0.4 });
  await wait(() => /Ouvrir/.test(window.__dakar.focus()?.primary ?? ''), null, 60000);
  await t.tap('#act');
  await wait(() => window.__dakar.teranga.info().driving);
  const tr = await T0();
  check('Pape Sarr lets it go on the road: three days of work in a row (no errand, no money)', tr.trial && tr.road.ok && !tr.road.supervised && /travailles tous les jours/.test(tr.road.line) && (await d(() => window.__dakar.sarr.info().trust)) < 20, JSON.stringify({ road: tr.road, trust: await d(() => window.__dakar.sarr.info().trust) }));
  await page.waitForTimeout(1000); await shot('road-test-allowed');
  const s = sampler('teranga'), y = 2.1;
  await pilot(page, t, 'teranga', [...pullOut({ x: fl.x, z: fl.z, yaw: Math.PI / 2 }), { x: 112, z: y, tol: 3.5, speed: 6 }, { x: 117.9, z: 8, tol: 3, speed: 4 }, { x: 117.9, z: 50, tol: 4, speed: 7 }, { x: 112, z: 57.9, tol: 3, speed: 4 }, { x: 68, z: 57.9, tol: 4, speed: 7 }, { x: 62.1, z: 52, tol: 3, speed: 4 }, { x: 62.1, z: 8, tol: 4, speed: 7 }, { x: 68, z: y, tol: 3, speed: 4 }], { cruise: 6, stall: 30000 });
  await shot('round-the-block');
  await pilot(page, t, 'teranga', [{ x: fl.x - 5, z: 3.4, tol: 1.6, speed: 2.5 }, { x: fl.x, z: fl.z, tol: 0.9, speed: 1.4 }], { brakeAtEnd: true, cruise: 2.5 });
  s.stop = true;
  const back = await d(() => window.__dakar.teranga.at());
  check('a loop of the block on the real streets and back to its place on the lot', s.at.some(a => a.z > 50) && s.at.some(a => a.x > 115) && Math.hypot(back.x - fl.x, back.z - fl.z) < 1.6, JSON.stringify({ back: [back.x, back.z], spot: [fl.x, fl.z] }));
  await getOff('teranga'); await shot('back-on-the-lot');
  await walkTo(page, t, fl.x - 2, -4.6, { tol: 1, ms: 60000 });
  await walkTo(page, t, 30, -4.6, { tol: 1.5, ms: 180000 });
  await wait(() => window.__dakar.teranga.info().trialSlot === -1, null, 120000).catch(() => {});
  const end = await T0();
  check('walked away: Pape Sarr has his car back on the lot (the same car); nothing paid, nothing owned', end.trialSlot === -1 && !end.owned && end.floor.find(c => c.slot === 0)?.here && (await d(() => window.__dakar.state.wallet)) === w0, JSON.stringify(end.floor));
};

// ---- C: little money; Pape Sarr's trust; a Teranga on credit; a VTC ride by the directions; his share of the fare
J.C = async () => {
  await open('&heure=10&argent=230000');
  await wait(() => window.__dakar.teranga.info().floor.length > 0);
  await d(() => { window.__dakar.state.data.rel['player|sarr'] = 45; });
  note('setup: Pape Sarr\'s trust at 45 (the errands that earn it are journey A of PR #63, scripts/check-first-car.mjs), 230 000 F');
  const sl = await d(() => window.__dakar.sarr.info().lot);
  const ss = await d(() => window.__dakar.sales_sarr.info());
  if (!(await focusOn('sarr:sales', ss.x, ss.z))) throw new Error('no focus on Pape Sarr ' + JSON.stringify(await d(() => window.__dakar.focus())));
  await t.tap('#act'); await page.waitForSelector('#modal.on', T);
  await tapItem('Demander un crédit'); await page.waitForTimeout(800);
  const offer = await modalText(); await shot('credit-offer');
  check('Pape Sarr offers credit at this trust: a small advance, then 10 000 F a day of play, and a share of each VTC fare', /Avance\s200\s000\sF/.test(offer) && /10\s000\sF\spar\sjour\sde\sjeu/.test(offer) && /30\s%/.test(offer), offer.replace(/\s+/g, ' ').slice(0, 300));
  await tapItem('Signer · Teranga');
  await wait(() => window.__dakar.teranga.info().owned, null, 30000);
  const ln = (await d(() => window.__dakar.credit.info())).loans.find(l => l.lender === 'sarr');
  check('signed: the Teranga is the player\'s, the debt is on the phone with its days', ln && ln.installment === 10000 && ln.clock === 'play' && ln.share === true && ln.left === ln.principal, JSON.stringify(ln));
  await phoneApp('credits'); await page.waitForSelector('#modal.on', T); await shot('credits-app'); const credApp = await modalText(); await t.tap('#modal.on .item.close'); await phoneClose().catch(() => {});
  check('« Crédits »: the balance, what is repaid, the next payment, in plain sight', /reste|Reste/.test(credApp) && /10\s000\sF/.test(credApp), credApp.replace(/\s+/g, ' ').slice(0, 300));
  // a VTC ride in Pikine, the shortest the city asks for at this hour
  const pick = await d(() => { const A = window.__dakar, R = [-120, -60, 0, 60, 120], near = v => R.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b); let best = null; A.vtc.requests().forEach((r, i) => { if (r.to !== 'pikine') return; const len = Math.abs(r.pickup.x - r.dropoff.x) + Math.abs(r.pickup.z - r.dropoff.z); if (!best || len < best.len) best = { i, len, r }; }); return best; });
  check('a ride inside Pikine is on offer, its fare shown before it is taken, in its band (1 000 – 2 000 F)', pick && pick.r.fare >= 1000 && pick.r.fare <= 2000, JSON.stringify(pick && { fare: pick.r.fare, from: pick.r.pickup.name, to: pick.r.dropoff.name }));
  await phoneApp('vtc'); await page.waitForSelector('#modal.on', T); await shot('vtc-offers');
  const label = `${pick.r.pickup.name} → ${pick.r.dropoff.name}`, it = page.locator('#modal .item', { hasText: label }).first(); await it.scrollIntoViewIfNeeded();
  const ib = await it.boundingBox(); await t.down(5, ib.x + ib.width / 2, ib.y + ib.height / 2); await page.waitForTimeout(60); await t.up(5);
  await wait(() => window.__dakar.vtc.info().trip?.stage === 'pickup', null, 20000);
  await phoneClose().catch(() => {});
  await wait(() => window.__dakar.teranga.info().here, null, 60000);
  // setup: the car put in the passenger's street, 60 m back (driving off his lot is journey B's), the player at its door
  { const st0 = await d(() => window.__dakar.vtc.stops()), K = st0.pickup.car, F = { x: Math.sin(K.yaw), z: Math.cos(K.yaw) };
    const p0 = runUp(K, 60);
    await d(([x, z, y]) => { window.__dakar.teranga.place(x, z, y); window.__dakar.place(x + Math.cos(y) * 2.4, z - Math.sin(y) * 2.4, y); }, [p0.x, p0.z, K.yaw]); }
  await page.waitForTimeout(800);
  await boardVehicle(page, t, 'teranga');
  await page.waitForTimeout(1200);
  const g1 = await goal(); await shot('nav-to-passenger');
  check('at the wheel with a ride in hand: the goal line gives the next turn and the distance to the passenger', g1?.nav && /[↰↱↑↶]/.test(g1.text) && /\d+ (m|km)/.test(g1.text), JSON.stringify(g1));
  const stops = await d(() => window.__dakar.vtc.stops());
  // in the lane until 10 m short of the passenger, then into the kerb (a slant from far back meets the cars parked along it), as in scripts/check-vtc-ride.mjs
  { const K = stops.pickup.car, F = { x: Math.sin(K.yaw), z: Math.cos(K.yaw) }, ln = runUp(K, 60), inLane = Math.abs(F.z) > 0.5 ? { x: ln.x, z: K.z - F.z * 10 } : { x: K.x - F.x * 10, z: ln.z };
    await pilot(page, t, 'teranga', [{ ...inLane, tol: 3, speed: 5 }, { x: K.x - F.x * 2.5, z: K.z - F.z * 2.5, tol: 2, speed: 2.4 }, { x: K.x + F.x * 1.5, z: K.z + F.z * 1.5, tol: 2, speed: 2 }], { brakeAtEnd: true, cruise: 5 }); }
  await wait(() => window.__dakar.vtc.info().trip?.stage === 'aboard', null, 90000);
  await page.waitForTimeout(1000);
  const g2 = await goal(); await shot('nav-to-dropoff');
  check('the passenger aboard: the directions turn to the drop-off by themselves', g2?.nav && new RegExp(pick.r.dropoff.name.split(' ')[0]).test(g2.text), JSON.stringify(g2));
  const w0 = await d(() => window.__dakar.state.wallet), paid0 = ln.paid;
  await driveToKerb('teranga', (await d(() => window.__dakar.vtc.stops())).dropoff.car, { cruise: 6 });
  await wait(() => !window.__dakar.vtc.info().trip, null, 60000);
  const c = await readCard(), w1 = await d(() => window.__dakar.state.wallet), ln1 = (await d(() => window.__dakar.credit.info())).loans.find(l => l.lender === 'sarr'), share = Math.round(pick.r.fare * 0.3);
  check('dropped off: the fare paid once; Pape Sarr\'s 30 % taken off it toward the debt, the rest in the wallet', ln1.paid - paid0 === share && w1 - w0 === pick.r.fare - share, JSON.stringify({ fare: pick.r.fare, toSarr: ln1.paid - paid0, wallet: w1 - w0 }));
  check('the card shows the fare, Pape Sarr\'s share and what is left to repay', /Course terminée/.test(c.text) && /Pape Sarr/.test(c.text) && /remboursés/.test(c.text) && /reste\s[\d\s]+F/.test(c.text), c.text.replace(/\s+/g, ' '));
  await page.waitForTimeout(1500);
  check('the directions clear when the ride is over', !(await goal())?.nav, JSON.stringify(await goal()));
};

// ---- D: Corniche → Plateau: what the city offers, never above 5 000 F, the fare shown before it is taken and paid once
J.D = async () => {
  await open('&heure=9&argent=4500000');
  await wait(() => window.__dakar.teranga.info().floor.length > 0);
  await d(() => window.__dakar.teranga.own()); await wait(() => window.__dakar.teranga.info().owned);
  // setup: the car parked in the Corniche (the drive there from Pikine is journey E's kind of trip), as the save records a parked car
  await d(() => { const c = window.__dakar.state.data.counters; c['vehicle:teranga:hub'] = 1; c['vehicle:teranga:x'] = -2.1; c['vehicle:teranga:z'] = -40; c['vehicle:teranga:yaw'] = 0; });
  await d(() => window.__dakar.teleport('corniche')); await wait(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.teranga.info().here);
  const all = await d(() => { const A = window.__dakar, out = []; for (let h = 6; h <= 22; h++) { A.setHour(h); for (const r of A.vtc.requests()) out.push({ h, to: r.to, fare: r.fare, from: r.pickup.name, dest: r.dropoff.name, hubs: r.hubs }); } A.setHour(9); return out; });
  const toPl = all.filter(r => r.to === 'plateau'), town = all.filter(r => r.to === 'corniche');
  fs.writeFileSync(`${out}/fares.json`, JSON.stringify(all, null, 1));
  check(`every Corniche → Plateau ride the city asks for, 6 h to 22 h (${toPl.length}), is between 3 500 and 5 000 F`, toPl.length > 0 && toPl.every(r => r.fare >= 3500 && r.fare <= 5000), JSON.stringify(toPl.map(r => r.fare)));
  check(`rides inside the Corniche (${town.length}) stay between 1 000 F (a short hop) and 3 500 F (across the district)`, town.every(r => r.fare >= 1000 && r.fare <= 3500), JSON.stringify(town.map(r => r.fare)));
  const pick = toPl.find(r => r.h === 9) ?? toPl[0];
  await d(h => window.__dakar.setHour(h), pick.h);
  await phoneApp('vtc'); await page.waitForSelector('#modal.on', T);
  const it = page.locator('#modal .item', { hasText: `${pick.from} → ${pick.dest}` }).first(); await it.scrollIntoViewIfNeeded();
  const shown = await it.innerText(); await shot('corniche-plateau-offer');
  check('the fare is on the offer before it is taken', new RegExp(pick.fare.toLocaleString('fr-FR').replace(/\s/g, '.')).test(shown), shown.replace(/\s+/g, ' '));
  const ib = await it.boundingBox(); await t.down(5, ib.x + ib.width / 2, ib.y + ib.height / 2); await page.waitForTimeout(60); await t.up(5);
  await wait(() => window.__dakar.vtc.info().trip?.stage === 'pickup', null, 20000);
  const trip = (await d(() => window.__dakar.vtc.info())).trip;
  check('taken: the fare is fixed at the offer\'s, with no multiplier', trip.fare === pick.fare, JSON.stringify({ trip: trip.fare, offer: pick.fare }));
  await phoneClose().catch(() => {});
  // to the passenger (the car is put in the Corniche street the passenger's kerb is on: the drive from Pikine is journey E's)
  const stops = await d(() => window.__dakar.vtc.stops()), K = stops.pickup.car, F = { x: Math.sin(K.yaw), z: Math.cos(K.yaw) };
  const st = runUp(K, 50);
  await d(([x, z, y]) => window.__dakar.teranga.place(x, z, y), [st.x, st.z, K.yaw]);
  await d(([x, z, y]) => window.__dakar.place(x + Math.cos(y) * 2.4, z - Math.sin(y) * 2.4, y), [st.x, st.z, K.yaw]);
  await page.waitForTimeout(800);
  await boardVehicle(page, t, 'teranga');
  await pilot(page, t, 'teranga', [{ x: K.x - F.x * 12, z: K.z - F.z * 12, tol: 3, speed: 5 }, { x: K.x - F.x * 3, z: K.z - F.z * 3, tol: 2, speed: 2.4 }, { x: K.x + F.x * 1.5, z: K.z + F.z * 1.5, tol: 2, speed: 2 }], { brakeAtEnd: true, cruise: 5 });
  await wait(() => window.__dakar.vtc.info().trip?.stage === 'aboard', null, 90000);
  // the directions are worked out five times a second of game time: on a loaded software renderer, give them that moment to turn to the drop-off
  await wait(() => { const n = window.__dakar.nav.info().now; return !!n && /Plateau|Route vers/.test(`${n.text} ${n.local?.name}`); }, null, 15000).catch(() => {});
  const n1 = await d(() => window.__dakar.nav.info().now); await shot('aboard-nav');
  check('the passenger aboard, the directions lead out of the Corniche toward the Plateau', n1 && /Plateau|Route vers/.test(`${n1.text} ${n1.local?.name}`), JSON.stringify(n1 && { text: n1.text, local: n1.local, dist: n1.dist }));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await ledgerMark();
  // out of the Corniche by the road to the Plateau, then to the drop-off kerb
  const mouth = await d(() => { const p = window.__dakar.road.at('corniche-plateau', 0, 0); return p; });
  { const a = await d(() => window.__dakar.teranga.at()), r = route({ x: a.x, z: a.z, yaw: a.yaw }, { x: mouth.x, z: mouth.z }, { cruise: 7, avoid: await closedZones() }); await pilot(page, t, 'teranga', r, { cruise: 7, stall: 60000, ms: 1500000 }); }
  const len = await d(() => { const p = window.__dakar.road.at('corniche-plateau', 1, 0); return p ? window.__dakar.road.project(p.x, p.z).length : null; });
  const sOnRoad = []; await driveRoad(page, t, 'teranga', 'corniche-plateau', len - 40, { cruise: 11, brakeAtEnd: false, stall: 240000, boost: true, ms: 2400000, onTick: async () => { if (sOnRoad.length < 3) { const g = await goal(); if (g?.nav) sOnRoad.push(g.text); } } });
  check('on the road between districts: « Tout droit » and the kilometres left', sOnRoad.some(x => /Tout droit/.test(x) && /km/.test(x)), JSON.stringify(sOnRoad));
  await wait(() => window.__dakar.pos().hub === 'plateau', null, 240000).catch(() => {});
  await shot('plateau-arrival');
  await driveToKerb('teranga', (await d(() => window.__dakar.vtc.stops())).dropoff.car, { cruise: 7 });
  await wait(() => !window.__dakar.vtc.info().trip, null, 60000);
  const c = await readCard(), w1 = await d(() => window.__dakar.state.wallet), lines = (await ledgerSince(l0)).filter(l => /VTC/.test(l.label));
  check(`dropped off in the Plateau: ${pick.fare} F paid once (one wallet line), never above 5 000 F`, w1 - w0 === pick.fare && lines.length === 1 && pick.fare <= 5000, JSON.stringify({ paid: w1 - w0, lines: lines.length }));
  check('the card: the ride, the fare, the real time and distance (kilometres)', /Course terminée/.test(c.text) && /km/.test(c.text), c.text.replace(/\s+/g, ' '));
};

// ---- E: a Tiak parcel from the Maïga (Pikine) to the Restaurant Le Pointe (Almadies) on the player's Jakarta, by the directions
J.E = async () => {
  await open('&heure=10&argent=1500000');
  await d(() => window.__dakar.moto.own()); await wait(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here);
  await takeJob(/Maïga.*Le Pointe/, 'x_pk_al_maiga_pointe'); await shot('job-taken'); await phoneClose().catch(() => {});
  await d(() => { window.__dakar.moto.place(62.1, -30, 0); window.__dakar.place(64.2, -30, 0); });       // setup: the bike in the street south of the Maïga
  await page.waitForTimeout(800);
  await boardVehicle(page, t, 'moto');
  await page.waitForTimeout(1200);
  const g0 = await goal(); await shot('nav-to-pickup');
  check('on the Jakarta: the next turn and the distance to the Maïga', g0?.nav && /Maïga/.test(g0.text) && /\d+ m/.test(g0.text), JSON.stringify(g0));
  await atStop('moto', { x: 78, z: -5.5 }, () => window.__dakar.activeJob()?.stage === 'deliver');
  await boardVehicle(page, t, 'moto'); await page.waitForTimeout(1200);
  const g1 = await goal(), n1 = await d(() => window.__dakar.nav.info().now); await shot('nav-out-of-pikine');
  check('the parcel aboard: the directions lead to the way out of Pikine toward the Almadies, the whole distance left', g1?.nav && /Le Pointe/.test(g1.text) && /km/.test(g1.text) && /Almadies/.test(n1?.local?.name ?? ''), JSON.stringify({ g1, local: n1?.local }));
  const mm = await d(() => window.__dakar.minimap?.info?.() ?? null);
  // setup: the bike and its rider set on Pikine's z = −60 street short of the way out west (the ride across Pikine's corners is journey A's; on a loaded software
  // renderer the test's driver can cut one into a wall and a motorbike does not back out under it), then on along the street and the road to the Almadies
  await d(() => window.__dakar.moto.place(-96, -62.1, -Math.PI / 2)); await page.waitForTimeout(800);
  { const a = await d(() => window.__dakar.moto.at()), r = route({ x: a.x, z: a.z, yaw: a.yaw }, { x: -140, z: -60 }, { cruise: 7, avoid: await closedZones() }); await pilot(page, t, 'moto', r, { cruise: 7, stall: 60000, ms: 1500000 }); }
  const len = await d(() => { const p = window.__dakar.road.at('pikine-almadies', 0, 0); return p ? window.__dakar.road.project(p.x, p.z).length : null; });
  const onRoad = []; await driveRoad(page, t, 'moto', 'pikine-almadies', len - 40, { cruise: 11, brakeAtEnd: false, stall: 240000, boost: true, ms: 2400000, onTick: async () => { if (onRoad.length < 2) { const g = await goal(); if (g?.nav) { onRoad.push(g.text); if (onRoad.length === 1) await shot('nav-on-the-road'); } } } });
  check('on the road: « Tout droit sur la route · Restaurant Le Pointe » and the kilometres left', onRoad.some(x => /Tout droit/.test(x) && /Le Pointe/.test(x) && /km/.test(x)), JSON.stringify(onRoad));
  await wait(() => window.__dakar.pos().hub === 'almadies', null, 240000).catch(() => {});
  await page.waitForTimeout(1500);
  const g2 = await goal(); await shot('nav-in-the-almadies');
  const hub2 = await d(() => window.__dakar.pos().hub);
  check('in the Almadies, the street directions to the restaurant take over (survived the crossing)', hub2 === 'almadies' && g2?.nav && /Le Pointe/.test(g2.text) && /[↰↱↑↶]/.test(g2.text), JSON.stringify({ hub: hub2, g2 }));
  const w0 = await d(() => window.__dakar.state.wallet), l0 = await ledgerMark();
  // the restaurant is across the coast avenue the bike comes in on: stopped opposite it, the parcel walked over (its own kerb faces the other way: a loop round a block)
  await pilot(page, t, 'moto', [{ x: 60, z: -62.1, tol: 4, speed: 7 }, { x: 0, z: -62.1, tol: 4, speed: 7 }, { x: -60, z: -62.1, tol: 4, speed: 7 }, { x: -94, z: -62.1, tol: 3, speed: 4 }, { x: -101, z: -62.1, tol: 2, speed: 2.2 }], { cruise: 7, stall: 60000, ms: 1500000, brakeAtEnd: true });
  await getOff('moto');
  await walkTo(page, t, -101.5, -60, { tol: 0.8, ms: 40000 }); await walkTo(page, t, -102, -56.2, { tol: 0.6, ms: 40000 });
  await wait(() => !window.__dakar.activeJob(), null, 20000).catch(() => {});
  const c = await readCard(), w1 = await d(() => window.__dakar.state.wallet), lines = (await ledgerSince(l0));
  check('handed over at the Restaurant Le Pointe: paid once', w1 > w0 && lines.length === 1, JSON.stringify({ paid: w1 - w0, lines: lines.map(l => l.label) }));
  check('the card: Maïga → Le Pointe, the pay, the time, the distance in km, the run, one line', /Le Pointe/.test(c.text) && /km/.test(c.text) && /jour actif|affilée/.test(c.text), c.text.replace(/\s+/g, ' '));
  await page.waitForTimeout(1500);
  check('the directions clear after the delivery', !(await goal())?.nav, JSON.stringify(await goal()));
  void mm;
};

// ---- card: the work card itself, as a player meets it: up after the job, clear of the stick and the action button, a tap puts it away, left alone it goes
// by itself (the jobs done with the debug hooks: the card is what is checked here; journeys A, C, D, E do the jobs themselves and read the same card)
J.card = async () => {
  await open('&heure=10');
  await d(() => { window.__dakar.acceptJob('pk_maiga_garage', true); window.__dakar.completeJob(); });
  const c1 = await readCard();
  check('the card after a delivery: what was done, where, what it paid, the run of days', /Livraison/.test(c1.text) && /Garage Modou/.test(c1.text) && /F/.test(c1.text) && /jour actif|affilée/.test(c1.text), c1.text.replace(/\s+/g, ' '));
  check('the card is clear of the stick and the action button, and a tap puts it away', c1.tapped && c1.gone && !c1.overControls, JSON.stringify({ tapped: c1.tapped, gone: c1.gone, over: c1.overControls }));
  await page.waitForTimeout(1500);
  await d(() => { window.__dakar.acceptJob('pk_maiga_garage', true); window.__dakar.completeJob(); });
  const up = await wait(() => !!document.querySelector('.mo.bc'), null, 20000).then(() => Date.now(), () => null);
  await shot('work-card-left-alone');
  const gone = up && await wait(() => !document.querySelector('.mo.bc'), null, 30000).then(() => Date.now(), () => null);
  check('left alone, the card goes by itself (7 s of the page\'s time; longer on this software renderer)', !!up && !!gone, JSON.stringify({ shownForMs: up && gone ? gone - up : null }));
};

// ---- F: the Jakarta backed out with the feet (no engine reverse), and the car's brake-to-reverse for comparison
J.F = async () => {
  await open('&heure=10&argent=1500000');
  await d(() => window.__dakar.moto.own()); await wait(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here);
  await d(() => { window.__dakar.moto.place(-2.1, 20, 0); window.__dakar.place(-0.2, 20, 0); });
  await page.waitForTimeout(800);
  await boardVehicle(page, t, 'moto'); await page.waitForTimeout(800);
  const p0 = await d(() => window.__dakar.moto.at()), brk = await t.centre('#ridepad .rp-brake');
  await t.down(1, brk.x, brk.y);
  const trace = []; const s0 = p0.t; let mid = false;
  for (;;) { const a = await d(() => window.__dakar.moto.at()), ts = a.t - s0; trace.push({ t: +ts.toFixed(2), z: a.z, v: a.speed, paddling: a.paddling, clip: a.clip, r: a.rBadge }); if (!mid && a.paddling && p0.z - a.z > 1) { mid = true; await shot('jakarta-paddling'); } if (p0.z - a.z > 3 || ts > 12) break; await page.waitForTimeout(80); }
  await t.up(1);
  await wait(() => { const a = window.__dakar.moto.at(); return Math.abs(a.speed) < 0.05; }, null, 20000).catch(() => {});
  const first = trace.find(s => s.v < -0.05), minV = Math.min(...trace.map(s => s.v)), moving = trace.filter(s => s.v < -0.2);
  check('« Frein » held at a standstill: after a short pause the rider pushes it backwards with the feet', first && first.t >= 0.6 && moving.length > 3, JSON.stringify(first));
  check('a slow walk at most, the « RidePaddle » pose, no « R »', minV >= -0.9 && minV < -0.3 && moving.every(s => s.paddling && s.clip === 'RidePaddle' && !s.r), JSON.stringify({ minV, sample: moving.slice(0, 2) }));
  await shot('jakarta-stopped');
  await getOff('moto');
};

// =====================================================================================================================================================
if (!J[which]) { console.log('unknown journey', which); process.exit(2); }
const t0 = Date.now();
try { await J[which](); } catch (e) { check(`journey ${which} ran to its end`, false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
check('no JavaScript error', errors.length === 0, errors.slice(0, 3).join(' | '));
const video = await page.video()?.path(); await context.close(); await browser.close();
if (video && fs.existsSync(video)) { const ok = await ff(video, `${out}/journey-${which}.mp4`); if (ok) fs.rmSync(video); }
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ journey: which, base, minutes: +((Date.now() - t0) / 60000).toFixed(1), renderer: 'headless Chromium + SwiftShader (not a phone)', results }, null, 1));
console.log(`${which}: ${results.length - failed}/${results.length} passed in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
process.exit(failed ? 1 : 0);
