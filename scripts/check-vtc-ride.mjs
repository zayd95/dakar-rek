// Journey E of the vehicles economy (docs/vehicles/ECONOMY.md): a VTC ride across districts with the player's own Teranga, real touch everywhere a player touches.
// The phone (☰ → « VTC ») lists the rides asked for in Pikine; the one to the Plateau is accepted by tapping it; the car is driven (real stick) to the passenger's kerb; the passenger,
// a person standing on the pavement, walks to the car and sits in its right rear seat; the game is reloaded (the passenger is still in the back); the car is driven out of Pikine on
// the Pikine → Plateau road, crosses into the Plateau with the passenger aboard (one person, never a copy), and to the drop-off kerb; the passenger gets out and walks off; the fare is
// paid once (one wallet line), the ride is remembered (a reload never pays it again), and there is never more than one passenger in the scene.
// Debug hooks: the start (a new game with money and the car bought, put in the street), the hour, reading state. Usage: node scripts/check-vtc-ride.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, boardVehicle } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';
import { route, runUp } from './lib/gridRoute.mjs';

const [base = 'http://127.0.0.1:4421/', out = '/tmp/claude-0/veh/journey-e'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const V = () => d(() => window.__dakar.vtc.info()), AT = () => d(() => window.__dakar.teranga.at());
const ready = async () => { await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.vtc, null, T); };

await page.goto(`${base}?debug&touch&heure=9&argent=4500000`, { timeout: 180000 });
await ready();
let t = await realTouch(page);
// the car, bought (cash here; Journey A buys it on credit), then the ride the city asks for at this hour: the Pikine → Plateau one, with a pickup and a drop-off near the road
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, T);
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, T);
const pick = await d(() => {
  const A = window.__dakar, R = [-120, -60, 0, 60, 120], near = v => R.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);
  const kerb = p => { const rx = near(p.x), rz = near(p.z), alongZ = Math.abs(p.x - rx) <= Math.abs(p.z - rz), side = Math.sign(alongZ ? p.x - rx : p.z - rz) || -1; return alongZ ? { x: rx + side * 4.3, z: p.z } : { x: p.x, z: rz + side * 4.3 }; };
  let best = null;
  for (let h = 8; h <= 18; h++) {
    A.setHour(h);
    A.vtc.requests().forEach((r, i) => {
      if (r.to !== 'plateau') return;
      const a = kerb(r.pickup), b = kerb(r.dropoff), cost = Math.abs(a.x + 60) + Math.abs(a.z - 127) + Math.abs(b.x + 60) + Math.abs(b.z + 127);
      if (!best || cost < best.cost) best = { h, i, cost, r };
    });
  }
  A.setHour(best.h); return best;
});
console.log('ride', JSON.stringify({ hour: pick.h, from: pick.r.pickup.name, to: pick.r.dropoff.name, fare: pick.r.fare, hubs: pick.r.hubs }));

// accept it on the phone, by tapping
await t.tap('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
await t.tap('#phone [data-nav="home"]'); await page.waitForTimeout(300);
await t.tap('#phone [data-app="vtc"]'); await page.waitForSelector('#modal.on', T);
await shot('phone-requests');
const label = `${pick.r.pickup.name} → ${pick.r.dropoff.name}`;
const item = page.locator('#modal .item', { hasText: label }).first();
const box = await item.boundingBox(); await t.down(5, box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); await t.up(5);
await page.waitForFunction(() => window.__dakar.vtc.info().trip?.stage === 'pickup', null, { timeout: 20000 });
const v0 = await V(), wallet0 = await d(() => window.__dakar.state.wallet), ledger0 = await d(() => window.__dakar.phoneHooks.ledger?.().length ?? 0);
check('« Courses VTC » on the phone: the Pikine → Plateau ride accepted with a tap; fare fixed, saved', v0.trip && v0.trip.from === 'pikine' && v0.trip.to === 'plateau' && v0.trip.fare === pick.r.fare, JSON.stringify({ id: v0.trip?.id, fare: v0.trip?.fare }));

// the car is put in the street the passenger's kerb is on, 60 m back (less near the district's edge); the player gets in with the real controls
const stops = await d(() => window.__dakar.vtc.stops());
const K = stops.pickup.car, F = { x: Math.sin(K.yaw), z: Math.cos(K.yaw) };
const lane = runUp(K, 60);                                                          // never past the district's outer street
await d(([x, z, yaw]) => window.__dakar.teranga.place(x, z, yaw), [lane.x, lane.z, K.yaw]);
await d(([x, z]) => window.__dakar.place(x, z, 0), [lane.x + Math.cos(K.yaw) * 2.6, lane.z - Math.sin(K.yaw) * 2.6]);
await page.waitForTimeout(800);
await boardVehicle(page, t, 'teranga');
const persons = []; const sample = setInterval(async () => { try { persons.push(await d(() => window.__dakar.vtc.info().persons)); } catch { /* reloading */ } }, 1500);
// in the lane until 10 m short of the passenger, then into the kerb (a slant from far back meets the cars parked along it)
const inLane = Math.abs(F.z) > 0.5 ? { x: lane.x, z: K.z - F.z * 10 } : { x: K.x - F.x * 10, z: lane.z };
await pilot(page, t, 'teranga', [{ ...inLane, tol: 3, speed: 5 }, { x: K.x - F.x * 2.5, z: K.z - F.z * 2.5, tol: 2, speed: 2.4 }, { x: K.x + F.x * 1.5, z: K.z + F.z * 1.5, tol: 2, speed: 2 }], { brakeAtEnd: true, cruise: 5 });
const waiting = await V();
check('at the kerb: the passenger is a person on the pavement, walking to the car', waiting.person && (waiting.phase === 'walk' || waiting.phase === 'seated'), JSON.stringify({ phase: waiting.phase, person: waiting.person, car: await AT() }));
await page.waitForTimeout(1200); await shot('passenger-walks');
await page.waitForFunction(() => window.__dakar.vtc.info().trip?.stage === 'aboard', null, { timeout: 60000 }).catch(() => {});
const aboard = await V();
check('the passenger sits in the car\'s right rear seat (the seat is taken, they ride in it)', aboard.trip?.stage === 'aboard' && aboard.trip.seat === 'rearR' && aboard.person?.inCar && aboard.persons === 1, JSON.stringify({ stage: aboard.trip?.stage, seat: aboard.trip?.seat, person: aboard.person, events: aboard.log.events }));
await shot('passenger-aboard');

// a reload with the passenger aboard: they are still in the back, one person
await d(() => window.__dakar.save?.());
await d(() => history.replaceState(null, '', location.href.replace(/&argent=\d+/, ''))); await page.reload(); await ready();
t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.teranga.info().here, null, T);
await page.waitForFunction(() => window.__dakar.vtc.info().person?.inCar, null, { timeout: 60000 }).catch(() => {});
const re = await V();
check('reloaded mid-ride: the passenger is still sitting in the car (one person, the same ride)', re.trip?.id === v0.trip.id && re.trip.stage === 'aboard' && re.person?.inCar && re.persons === 1, JSON.stringify({ trip: re.trip?.id, stage: re.trip?.stage, person: re.person, persons: re.persons }));
await boardVehicle(page, t, 'teranga');
const still = await V();
check('back at the wheel, the passenger has not moved from the back seat', still.person?.inCar && still.persons === 1, JSON.stringify(still.person));

// out of Pikine on the road to the Plateau
const hpTrip0 = await d(() => window.__dakar.teranga.health());
const a1 = await AT();
const toMouth = route({ x: a1.x, z: a1.z, yaw: a1.yaw }, { x: -60, z: 140 }, { cruise: 7 });
await pilot(page, t, 'teranga', toMouth, { cruise: 7, stall: 60000, ms: 1500000 });
const len = await d(() => { const p = window.__dakar.road.at('pikine-plateau', 0, 0); return p ? window.__dakar.road.project(p.x, p.z).length : null; });
await driveRoad(page, t, 'teranga', 'pikine-plateau', len - 40, { cruise: 11, brakeAtEnd: false, stall: 240000, boost: true, ms: 1800000 });
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau', null, { timeout: 240000 }).catch(() => {});
const mid = await V();
check('in the Plateau with the passenger aboard: the same ride, the person came with the car (rebuilt once, never copied)', (await d(() => window.__dakar.pos().hub)) === 'plateau' && mid.trip?.stage === 'aboard' && mid.person?.inCar && mid.persons === 1, JSON.stringify({ person: mid.person, persons: mid.persons, rebuilt: mid.log.rebuilt }));
await shot('plateau-aboard');
// to the drop-off kerb
const S2 = await d(() => window.__dakar.vtc.stops()), a2 = await AT();
const toDrop = route({ x: a2.x, z: a2.z, yaw: a2.yaw }, S2.dropoff.car, { cruise: 7 });
check('a street route to the drop-off exists from where the road ends', !!toDrop, JSON.stringify({ at: [a2.x, a2.z, a2.yaw], drop: S2.dropoff.car }));
if (toDrop) await pilot(page, t, 'teranga', toDrop, { cruise: 7, stall: 60000, ms: 1500000, brakeAtEnd: true });
await page.waitForFunction(() => !window.__dakar.vtc.info().trip, null, { timeout: 60000 }).catch(() => {});
const done = await V(), wallet1 = await d(() => window.__dakar.state.wallet), ledger = await d(() => window.__dakar.phoneHooks.ledger?.() ?? []);
await page.waitForTimeout(1500); await shot('dropoff');
const hpTrip1 = await d(() => window.__dakar.teranga.health());
check('a cross-district trip driven normally does not wear the car out (no garage needed after it)', hpTrip1 >= hpTrip0 - 8, JSON.stringify({ before: hpTrip0, after: hpTrip1 }));
const lines = ledger.filter(l => /Course VTC/.test(l.label));
check('at the drop-off the passenger gets out and walks off; the fare is paid ONCE (one wallet line)', !done.trip && done.state.done.includes(v0.trip.id) && wallet1 - wallet0 === v0.trip.fare && lines.length === 1, JSON.stringify({ paid: wallet1 - wallet0, fare: v0.trip.fare, lines: lines.length, events: done.log.events }));
await page.waitForTimeout(6000);
const gone = await V();
check('the passenger walked away and is gone; nobody left in the car', gone.persons === 0 && !gone.person, JSON.stringify({ persons: gone.persons, phase: gone.phase }));
// a reload after the payment: nothing paid again
await d(() => window.__dakar.save?.());
await d(() => history.replaceState(null, '', location.href.replace(/&argent=\d+/, ''))); await page.reload(); await ready();
await page.waitForTimeout(2500);
const after = await d(() => ({ w: window.__dakar.state.wallet, v: window.__dakar.vtc.info() }));
check('reloaded after the payment: no ride in hand, nothing paid twice', !after.v.trip && after.w === wallet1 && after.v.state.trips === 1, JSON.stringify({ wallet: after.w, trips: after.v.state.trips }));
clearInterval(sample);
check('never more than one passenger in the scene during the whole ride', persons.length > 5 && Math.max(...persons) <= 1, `${persons.length} samples, max ${Math.max(...persons)}`);
check('no JavaScript error', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
