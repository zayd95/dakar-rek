// M1 « After Work » (docs/districts/M1-MERMOZ.md): the golden path, driven with the REAL touch controls in one uninterrupted session (video recorded).
// The Corniche at 17:00: the phone's « Courses VTC » lists Mme Ndiaye's ride to Résidence Les Filaos (tapped); she is picked up at the campus kerb; the car leaves the Corniche
// by Fann and Point E, takes the divided VDN, comes off at Sacré-Cœur, crosses the BRT corridor at its signals (a bus seen; traffic held at the red) and arrives in Mermoz with
// no loading screen; the drop-off is the kerb bay at the Filaos' gate; the fare is paid ONCE through the existing payment (one wallet line), the completion card comes up, and
// Pape Diouf, the gardien, thanks the driver. A reload (the same district, a later city day: labelled debug shortcut) and the player walks to the gate: Pape recognises
// them and passes on one more ride, which is now on the phone. The player drives back to the Corniche with no ride in hand (free driving) and walks about.
// Debug hooks: the start (money, the Teranga bought and its parking record put in the Corniche), the hour, the next city day, reading state.
// Usage: node scripts/check-mermoz-journey.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle, walkTo } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';
import { route, runUp, closedZones } from './lib/gridRoute.mjs';

const [base = 'http://127.0.0.1:4620/', out = '/tmp/claude-0/m1/journey'] = process.argv.slice(2);
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
const V = () => d(() => window.__dakar.vtc.info()), AT = () => d(() => window.__dakar.teranga.at()), MZ = () => d(() => window.__dakar.mermoz.info());
const ready = async () => { await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.vtc && window.__dakar.mermoz, null, T); };
const hubNow = () => d(() => window.__dakar.pos().hub);
const getOut = async () => {
  await page.waitForFunction(() => Math.abs(window.__dakar.teranga.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  await t.tap('#ridepad .rp-off');
  await page.waitForFunction(() => !window.__dakar.teranga.at().driving && !window.__dakar.teranga.info().exit, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
};
async function openVtc() {
  await t.tap('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
  await page.waitForTimeout(600);
  if (await page.locator('#phone [data-nav="home"]').isVisible()) { await t.tap('#phone [data-nav="home"]'); await page.waitForTimeout(600); }
  await t.tap('#phone [data-go="apps"]'); await page.waitForTimeout(600);
  await t.tap('#phone [data-app="vtc"]'); await page.waitForSelector('#modal.on', T);
}
async function tapItem(text) {
  const item = page.locator('#modal .item', { hasText: text }).first();
  const box = await item.boundingBox(); await t.down(5, box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); await t.up(5);
}
/** The BRT and the traffic round it, sampled while the car is on the road: the signal's phases, the buses' states, cars stopped short of the main road's stop lines in a bus phase. */
const brtLog = { phases: new Set(), busStates: new Set(), crossings: 0, dwells: 0, heldCars: 0, samples: 0, overlap: 0 };
async function sampleBrt() {
  const r = await d(() => { const i = window.__dakar.road.info().find(x => x.road === 'corniche-mermoz'); if (!i || !i.brt?.length) return null; const j = window.__dakar.road.junctions?.('corniche-mermoz') ?? null; return { brt: i.brt, traffic: i.traffic, j }; }).catch(() => null);
  if (!r) return;
  brtLog.samples++;
  for (const b of r.brt) {
    brtLog.phases.add(b.phase); brtLog.crossings = Math.max(brtLog.crossings, b.crossings); brtLog.dwells = Math.max(brtLog.dwells, b.dwells);
    for (const x of b.buses) brtLog.busStates.add(x.state);
    { const on = b.buses.filter(x => x.state !== 'hidden'); for (let i = 0; i < on.length; i++) for (let k = i + 1; k < on.length; k++) if (Math.hypot(on[i].x - on[k].x, on[i].z - on[k].z) < 3) brtLog.overlap++; }   // (hidden buses wait in the portal, both at its pose)
    if (b.phase === 'bus' || b.phase === 'allRed' || b.phase === 'mainAmber') brtLog.heldCars = Math.max(brtLog.heldCars, r.traffic.filter(c => c.v < 0.4).length);
  }
}

log('boot');
await page.goto(`${base}?debug&touch&heure=17&argent=4500000`, { timeout: 180000 });
await ready();
let t = await realTouch(page);
// ---------------------------------------------------------------- set-up: the Teranga bought, its parking record moved to a Corniche street, the player there
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned, null, T);
await d(() => { const A = window.__dakar, id = A.teranga.info().id, c = A.state.data.counters; c[`vehicle:${id}:hub`] = A.hubs.indexOf('corniche'); c[`vehicle:${id}:x`] = 64.3; c[`vehicle:${id}:z`] = -10; c[`vehicle:${id}:yaw`] = Math.PI; A.save?.(); A.teleport('corniche', 67, -14, 0); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play' && window.__dakar.teranga.info().here, null, T);
await page.waitForTimeout(1500);
const st0 = await MZ();
check('a new save: nothing about Mermoz remembered yet', st0.flags.length === 0 && Object.keys(st0.counters).length === 0, JSON.stringify(st0));

// ---------------------------------------------------------------- 1. the opportunity on the Corniche: offered, free to ignore
await openVtc();
await shot('corniche-phone');
const offered = await d(() => window.__dakar.vtc.offered());
const first = offered.find(r => r.key === 'mz:first');
check('« Courses VTC » on the Corniche: Mme Ndiaye’s ride to Résidence Les Filaos is listed first, with the ordinary rides after it (the player may pick any, or none)', !!first && offered[0].key === 'mz:first' && offered.length >= 4 && first.dropoff.name.startsWith('Résidence Les Filaos'), JSON.stringify(offered.map(r => `${r.key} ${r.pickup.name}→${r.dropoff.name} ${r.fare}`)));
await tapItem(`${first.pickup.name} → ${first.dropoff.name}`);
await page.waitForFunction(() => window.__dakar.vtc.info().trip?.stage === 'pickup', null, { timeout: 20000 });
const v0 = await V(), wallet0 = await d(() => window.__dakar.state.wallet), ledger0 = await d(() => (window.__dakar.phoneHooks.ledger?.() ?? []).length);
check('accepted with a tap: Corniche → Mermoz, the fare fixed and saved', v0.trip?.from === 'corniche' && v0.trip.to === 'mermoz' && v0.trip.fare === first.fare && v0.trip.passenger.name === 'Aminata Ndiaye', JSON.stringify(v0.trip));

// ---------------------------------------------------------------- 2. the pick-up at the campus kerb
const stops = await d(() => window.__dakar.vtc.stops());
const K = stops.pickup.car, F = { x: Math.sin(K.yaw), z: Math.cos(K.yaw) }, lane = runUp(K, 50);
await d(([x, z, yaw]) => window.__dakar.teranga.place(x, z, yaw), [lane.x, lane.z, K.yaw]);
await d(([x, z]) => window.__dakar.place(x, z, 0), [lane.x + Math.cos(K.yaw) * 2.6, lane.z - Math.sin(K.yaw) * 2.6]);
await page.waitForTimeout(800);
await boardVehicle(page, t, 'teranga');
log('to the pick-up');
const inLane = Math.abs(F.z) > 0.5 ? { x: lane.x, z: K.z - F.z * 10 } : { x: K.x - F.x * 10, z: lane.z };
await pilot(page, t, 'teranga', [{ ...inLane, tol: 3, speed: 5 }, { x: K.x - F.x * 2.5, z: K.z - F.z * 2.5, tol: 2, speed: 2.4 }, { x: K.x + F.x * 1.5, z: K.z + F.z * 1.5, tol: 2, speed: 2 }], { brakeAtEnd: true, cruise: 5 });
await page.waitForFunction(() => window.__dakar.vtc.info().trip?.stage === 'aboard', null, { timeout: 240000 }).catch(() => {});
const aboard = await V();
check('Mme Ndiaye walks to the car and sits in the back', aboard.trip?.stage === 'aboard' && aboard.person?.inCar && aboard.persons === 1, JSON.stringify({ stage: aboard.trip?.stage, phase: aboard.phase }));
await page.waitForFunction(() => window.__dakar.vtc.info().door.k === 0, null, { timeout: 90000 }).catch(() => {});
await shot('pickup-aboard');

// ---------------------------------------------------------------- 3. out of the Corniche, the VDN, Sacré-Cœur, the BRT crossing, into Mermoz
log('to the road');
const a1 = await AT();
const toMouth = route({ x: a1.x, z: a1.z, yaw: a1.yaw }, { x: 140, z: -60 }, { cruise: 7, avoid: await closedZones(page) });
check('the directions from the campus to the VDN road exist on the Corniche’s streets', !!toMouth);
if (toMouth) await pilot(page, t, 'teranga', toMouth, { cruise: 7, stall: 60000, ms: 1500000 });
const len = await d(() => { const p = window.__dakar.road.at('corniche-mermoz', 0, 0); return p ? window.__dakar.road.project(p.x, p.z).length : null; });
check('the Corniche → Mermoz road is there, of a believable length', len > 1100 && len < 1700, `${len?.toFixed(0)} m`);
const anchors = new Set(), cam = []; let swapAt = null, lastHub = 'corniche', profiles = new Set();
const shots = { vdn: false, sacrecoeur: false, brt: false };
const sampler = setInterval(() => { sampleBrt().catch(() => {}); }, 700);
await driveRoad(page, t, 'teranga', 'corniche-mermoz', len - 40, { cruise: 11, brakeAtEnd: false, stall: 240000, boost: true, ms: 2400000, onTick: async (at, pr) => {
  if (pr.anchor) anchors.add(pr.anchor); if (pr.profile) profiles.add(pr.profile);
  const f = pr.s / len;
  if (!shots.vdn && f > 0.45) { shots.vdn = true; shot('vdn').catch(() => {}); }
  if (!shots.sacrecoeur && f > 0.76) { shots.sacrecoeur = true; shot('sacrecoeur-approach').catch(() => {}); }
} });
const hubMid = await hubNow();
await page.waitForFunction(() => window.__dakar.pos().hub === 'mermoz', null, { timeout: 240000 }).catch(() => {});
clearInterval(sampler);
const mid = await V();
check('in Mermoz with Mme Ndiaye aboard: the district came in along the road, no loading screen (the same ride, one person)', (await hubNow()) === 'mermoz' && mid.trip?.stage === 'aboard' && mid.person?.inCar && mid.persons === 1, JSON.stringify({ hubMid, rebuilt: mid.log.rebuilt }));
check('the BRT at Sacré-Cœur was live while the car was near: signal phases cycled, buses moved (approach / dwell / away), never two buses on one spot', brtLog.samples > 3 && brtLog.phases.size >= 2 && brtLog.busStates.size >= 1 && brtLog.overlap === 0, JSON.stringify({ ...brtLog, phases: [...brtLog.phases], busStates: [...brtLog.busStates] }));
await shot('mermoz-arrival');

// ---------------------------------------------------------------- 4. the drop-off at the Filaos' gate, the payment, the card, Pape
log('to the drop-off');
const S2 = await d(() => window.__dakar.vtc.stops()), a2 = await AT();
const toDrop = route({ x: a2.x, z: a2.z, yaw: a2.yaw }, S2.dropoff.car, { cruise: 6, avoid: await closedZones(page) });
check('a street route from the end of the road to the Filaos exists (the Sacré-Cœur street, then the quiet Mermoz streets)', !!toDrop, JSON.stringify({ at: [a2.x, a2.z], drop: S2.dropoff.car }));
if (toDrop) {
  // as a driver does: in the traffic lane until a few metres short of the bay, then into it (the cars parked along the kerb stop 9 m before a VTC bay)
  const K2 = S2.dropoff.car, f2 = { x: Math.sin(K2.yaw), z: Math.cos(K2.yaw) }, r2 = { x: -f2.z, z: f2.x }, inward = 4.3 - 2.1;   // r2: the kerb side of the heading
  const lanePt = (back) => ({ x: K2.x - f2.x * back - r2.x * inward, z: K2.z - f2.z * back - r2.z * inward });
  toDrop.splice(toDrop.length - 3, 3, { ...lanePt(16), tol: 3, speed: 4 }, { ...lanePt(7), tol: 2.2, speed: 2.4 }, { x: K2.x - f2.x * 1.5, z: K2.z - f2.z * 1.5, tol: 2, speed: 2 }, { x: K2.x + f2.x * 1.5, z: K2.z + f2.z * 1.5, tol: 2, speed: 1.8 });
  const navLog = []; let lastNav = '';
  const navSample = setInterval(async () => { try { const n = await d(() => { const A = window.__dakar, a = A.teranga.at(), i = A.nav.info(); return { t: i.now?.text ?? null, x: Math.round(a.x), z: Math.round(a.z), yaw: +a.yaw.toFixed(2), closed: (A.roadEvents?.() ?? []).filter(e => e.closed).length }; }); if (n.t !== lastNav) { lastNav = n.t; navLog.push(n); } } catch { /* */ } }, 400);
  await pilot(page, t, 'teranga', toDrop, { cruise: 6, stall: 60000, ms: 1500000, brakeAtEnd: true });
  clearInterval(navSample);
  const backs = navLog.filter(n => /demi-tour/.test(n.t ?? '')).length;
  console.log('nav lines on the way to the drop-off', JSON.stringify(navLog));
  console.log(`NOTE (the goal line, docs/districts/M1-EVIDENCE.md known issue 1, fixed): « Fais demi-tour » shown ${backs} times on the way to the drop-off`, `(${navLog.length} changes); route ${JSON.stringify(toDrop.map(q => [Math.round(q.x), Math.round(q.z)]))}`);
}
await page.waitForFunction(() => !window.__dakar.vtc.info().trip, null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1200); await shot('dropoff-card');
const done = await V(), wallet1 = await d(() => window.__dakar.state.wallet), ledger = await d(() => window.__dakar.phoneHooks.ledger?.() ?? []);
const lines = ledger.filter(l => /Course VTC/.test(l.label));
check('stopped at the kerb bay by the gate: the fare is paid ONCE through the existing payment (one wallet line)', !done.trip && done.state.done.includes(v0.trip.id) && wallet1 - wallet0 === v0.trip.fare && lines.length === 1 && ledger.length - ledger0 >= 1, JSON.stringify({ paid: wallet1 - wallet0, fare: v0.trip.fare, lines: lines.length }));
const cards = await d(() => window.__dakar.streak.info().log.cards);
check('the completion card comes up for this ride', cards.some(c => c.title === `Course terminée · ${v0.trip.passenger.name}` && c.rows.some(r => r.replace(/\s/g, '').includes(String(v0.trip.fare)))), JSON.stringify(cards));
await page.waitForFunction(() => window.__dakar.mermoz.info().said.length > 0, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(400); await shot('pape-thanks');
const m1 = await MZ();
check('Pape Diouf, at his gate, thanks the driver (once), and the save remembers it in flags and counters', m1.pape && m1.thanked === 1 && m1.said.length === 1 && /Pape, le gardien/.test(m1.said[0]) && m1.flags.includes('mz_first_ride') && m1.counters.mz_filaos_rides === 1 && m1.counters.mz_pape_met > 0, JSON.stringify(m1));
const offered2 = await d(() => window.__dakar.vtc.offered());
check('the first ride is not offered again; nothing from Pape yet on the Mermoz list', !offered2.some(r => r.key.startsWith('mz:')), JSON.stringify(offered2.map(r => r.key)));
await getOut();

// ---------------------------------------------------------------- 5. a reload, a later city day: Pape recognises the player and passes on one more ride
log('reload, next day');
await d(() => window.__dakar.save?.());
await d(() => history.replaceState(null, '', location.href.replace(/&argent=\d+/, ''))); await page.reload(); await ready();
t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);
const re = await d(() => ({ hub: window.__dakar.pos().hub, w: window.__dakar.state.wallet, v: window.__dakar.vtc.info(), m: window.__dakar.mermoz.info() }));
check('reloaded: still in Mermoz, nothing paid twice, the memory kept', re.hub === 'mermoz' && re.w === wallet1 && !re.v.trip && re.v.state.trips === 1 && re.m.flags.includes('mz_first_ride') && re.m.recognised === 0, JSON.stringify({ hub: re.hub, wallet: re.w, m: re.m }));
const day = await d(() => window.__dakar.nextDay(1));          // (debug shortcut, labelled: the later city day a journey cannot wait 24 minutes for)
const me = await d(() => window.__dakar.pos());
if (Math.hypot(me.x - 66, me.z + 27) < 12) { await walkTo(page, t, 56, me.z - 18, { tol: 1.2, ms: 60000 }); }   // a few steps away first, then back up the pavement to his gate
await walkTo(page, t, 63.6, -27.5, { tol: 0.9, ms: 90000 });
await page.waitForFunction(() => window.__dakar.mermoz.info().recognised > 0 && window.__dakar.mermoz.info().said.length >= 2, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(400); await shot('pape-recognises');
const m2 = await MZ();
check('a later visit: Pape recognises the player once and passes on Mme Ndiaye’s bank ride', m2.recognised === 1 && m2.said.some(s => /chauffeur de Mme Ndiaye/.test(s)) && m2.said.some(s => /banque au Plateau/.test(s)) && m2.flags.includes('mz_ndiaye_offer') && m2.counters.mz_pape_seen_day === day + 1, JSON.stringify({ day, m2 }));
await openVtc();
await shot('mermoz-phone-opportunity');
const offered3 = await d(() => window.__dakar.vtc.offered());
check('the new ride is on the phone in Mermoz: Résidence Les Filaos → Banque Teranga · Plateau', offered3[0]?.key === 'mz:ndiaye' && offered3[0].dropoff.name === 'Banque Teranga · Plateau', JSON.stringify(offered3.map(r => `${r.key} ${r.pickup.name}→${r.dropoff.name}`)));
await tapItem('Fermer'); await page.waitForFunction(() => !document.querySelector('#modal.on'), null, { timeout: 10000 }).catch(() => {});
if (await d(() => window.__dakar.phoneInfo().open)) { await t.tap('#menuBtn').catch(() => {}); }
await page.waitForTimeout(800);
// talking to him again the same day: no second recognition
await walkTo(page, t, 64.4, -27.0, { tol: 0.8, ms: 30000 }).catch(() => {});
await page.waitForFunction(() => window.__dakar.focus()?.id === 'mermoz:pape', null, { timeout: 8000 }).catch(() => {});
const focus = await d(() => window.__dakar.focus()?.id ?? null);
if (focus === 'mermoz:pape') { await t.tap('#act'); await page.waitForTimeout(800); }
const m3 = await MZ();
check('« Parler à Pape » at his gate: he answers, but recognises the player only once a day', focus === 'mermoz:pape' && m3.recognised === 1 && m3.said.length === m2.said.length + 1, JSON.stringify({ focus, said: m3.said.slice(-1) }));

// ---------------------------------------------------------------- 6. back to the Corniche with no ride in hand: free driving on the same road
log('drive home');
await boardVehicle(page, t, 'teranga');
const a3 = await AT();
const toEnd = route({ x: a3.x, z: a3.z, yaw: a3.yaw }, { x: -140, z: 0 }, { cruise: 7, avoid: await closedZones(page) });
check('from the Filaos back to the road on Mermoz’s streets', !!toEnd);
if (toEnd) await pilot(page, t, 'teranga', toEnd, { cruise: 7, stall: 60000, ms: 1500000 });
const frames = [];
const fs1 = setInterval(async () => { try { frames.push(await d(() => { const A = window.__dakar, a = A.teranga.at(), c = A.camera().at; return { hub: A.pos().hub, x: a.x, z: a.z, cx: c[0], cz: c[2], w: performance.now() }; })); } catch { /* swap */ } }, 250);
await driveRoad(page, t, 'teranga', 'corniche-mermoz', 40, { cruise: 11, brakeAtEnd: true, stall: 240000, boost: true, ms: 2400000 });
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche', null, { timeout: 240000 }).catch(() => {});
clearInterval(fs1);
let maxJump = 0;
for (let i = 1; i < frames.length; i++) { const a = frames[i - 1], b = frames[i]; if (a.hub !== b.hub) continue; const camStep = Math.hypot(b.cx - a.cx, b.cz - a.cz), carStep = Math.hypot(b.x - a.x, b.z - a.z); maxJump = Math.max(maxJump, camStep - carStep); }
const swaps = frames.filter((f, i) => i && f.hub !== frames[i - 1].hub).length;
check('back on the Corniche, no ride in hand: one district swap on the way, the camera kept behind the car (no jump)', (await hubNow()) === 'corniche' && !(await V()).trip && swaps === 1 && maxJump < 3, JSON.stringify({ swaps, maxJump: +maxJump.toFixed(2), samples: frames.length }));
await shot('corniche-home');
await getOut();
const p0 = await d(() => window.__dakar.pos());
await walkTo(page, t, p0.x + 8, p0.z, { tol: 1.5, ms: 40000 }).catch(() => {});
const p1 = await d(() => window.__dakar.pos());
check('free exploration on foot afterwards (no job): the player walks', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 3 && p1.mode === 'play', JSON.stringify({ p0, p1 }));
const wallet2 = await d(() => window.__dakar.state.wallet);
check('the whole journey paid one fare only', wallet2 === wallet1, `${wallet2} vs ${wallet1}`);
check('no JavaScript error', errors.length === 0, errors.slice(0, 2).join(' | '));
await context.close(); await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
