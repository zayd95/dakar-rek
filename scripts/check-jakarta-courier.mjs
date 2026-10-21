// Journey C of the vehicles economy (docs/vehicles/ECONOMY.md): the player's own Jakarta, real touch everywhere a player touches.
//  1. Parked nose-in in a narrow gap between two cars (Sarr Auto's floor, Pikine): stopped, « Frein » held: after a short deliberate pause the rider pushes the bike backwards with both
//     feet (the 'RidePaddle' pose), at a slow walk at most, no « R », no engine reverse; the brake let go: it stops at once. It backs out of the gap without touching either car.
//  2. Its back against a parked car's side: pushed backwards, it stops at the car (the collisions stay on; neither moves through the other; a bump that slow costs nothing).
//  3. A courier run across districts: the phone's « Travail » app, a parcel from Boutique Diallo (Pikine) for Atelier Ndeye (Plateau): ridden to the shop, the parcel picked up on foot at
//     the door, in the box, ridden out of Pikine on the Pikine → Plateau road into the Plateau, handed over at the door: paid ONCE (one wallet line); a reload pays nothing more.
// The narrow-gap part is filmed with its sound (an MP4). Usage: node scripts/check-jakarta-courier.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, pilot, walkTo, boardVehicle, STICK } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';
import { route, kerbOf } from './lib/gridRoute.mjs';
import { startSound, stopSound, sync, mux } from './lib/avRecord.mjs';

const [base = 'http://127.0.0.1:4421/', out = '/tmp/claude-0/veh/journey-c'] = process.argv.slice(2);
fs.mkdirSync(`${out}/raw`, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(), born = Date.now(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const AT = () => d(() => window.__dakar.moto.at());
const ready = () => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.moto, null, T);

await page.goto(`${base}?debug&touch&heure=10&argent=1500000`, { timeout: 180000 });
await ready();
let t = await realTouch(page);
await d(() => window.__dakar.moto.own());
await page.waitForFunction(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here, null, T);
const lot = await d(() => window.__dakar.sarr.info().lot);
await page.waitForFunction(() => window.__dakar.teranga.info().floor.filter(f => f.here).length === 2, null, T);
const floor = (await d(() => window.__dakar.teranga.info())).floor;
const gapX = (floor[0].x + floor[1].x) / 2, carZ = floor[0].z;

// ---- 1. nose-in between two cars, backed out with the feet
await d(([x, z]) => window.__dakar.moto.place(x, z, 0), [gapX, carZ + 0.15]);              // nose-in, its front wheel short of the canopy's stand behind
await d(([x, z]) => window.__dakar.place(x, z, 0), [gapX - 1.2, carZ - 2.4]);
await page.waitForTimeout(800);
await boardVehicle(page, t, 'moto');
await page.waitForTimeout(800);
const audioAt = await startSound(page); await page.waitForTimeout(1400);
await d(() => window.__dakar.moto.feelReset());
const p0 = await AT();
const gapW = Math.abs(floor[1].x - floor[0].x) - 4.1;
await shot('nose-in-gap');
const brk = await t.centre('#ridepad .rp-brake');
await t.down(1, brk.x, brk.y);
// timed on the game's own clock (`t`, seconds of simulation): a loaded headless renderer runs the game slower than the wall clock
const trace = []; const s0 = (await AT()).t; let shotMid = false;
for (;;) { const a = await AT(), ts = a.t - s0; trace.push({ t: +ts.toFixed(2), z: a.z, v: a.speed, paddling: a.paddling, clip: a.clip, r: a.rBadge }); if (!shotMid && a.paddling && p0.z - a.z > 1) { shotMid = true; await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-paddling.png` }); } if (p0.z - a.z > 3.2 || ts > 12) break; await page.waitForTimeout(80); }
await t.up(1);
await page.waitForFunction(() => { const a = window.__dakar.moto.at(); return Math.abs(a.speed) < 0.05 && a.clip === 'Ride'; }, null, { timeout: 20000 }).catch(() => {});
const p1 = await AT(), released = trace[trace.length - 1];
const first = trace.find(s => s.v < -0.05), minV = Math.min(...trace.map(s => s.v));
check('the brake held at a standstill: nothing for a short deliberate pause (0.7 s of game time), then the bike moves backwards', first && first.t >= 0.6, JSON.stringify(first));
check('pushed with the feet: a slow walk at most (never an engine reverse)', minV < -0.4 && minV >= -0.9, `min ${minV.toFixed(2)} m/s`);
check('the rider\'s legs come down (the « RidePaddle » pose) while it moves backwards, and no « R » shows', trace.filter(s => s.v < -0.2).every(s => s.paddling && s.clip === 'RidePaddle' && !s.r), JSON.stringify(trace.filter(s => s.v < -0.2).slice(0, 3)));
check('the brake let go: it stops at once (within a few centimetres) and the rider sits normally again', Math.abs(p1.speed) < 0.05 && !p1.paddling && p1.clip === 'Ride' && Math.abs(p1.z - released.z) < 0.25, JSON.stringify({ v: p1.speed, clip: p1.clip, slid: +(released.z - p1.z).toFixed(2) }));
const felt = await d(() => window.__dakar.moto.feel());
check(`backed out of a gap ${gapW.toFixed(1)} m wide without touching either car, and the cars did not move`, p0.z - p1.z > 2.2 && felt.impacts.length === 0, JSON.stringify({ backed: +(p0.z - p1.z).toFixed(2), impacts: felt.impacts }));
await shot('backed-out');
// ---- 2. backed against a car's side: it stops there
const side = carZ - 0.9;                                                        // the side of the car on display (body ~1.8 m wide)
await d(([x, z]) => window.__dakar.moto.place(x, z, Math.PI), [floor[1].x, side - 1.6]);
await page.waitForTimeout(600);
const h0 = await d(() => window.__dakar.moto.health());
{ const s1 = (await AT()).t; await t.down(1, brk.x, brk.y); await page.waitForFunction(s => window.__dakar.moto.at().t - s > 5, s1, { timeout: 120000 }); await t.up(1); await page.waitForTimeout(500); }
const p2 = await AT(), h1 = await d(() => window.__dakar.moto.health()), fl = (await d(() => window.__dakar.teranga.info())).floor[1];
check('backed against a parked car: it stops at the car, never through it; the car does not move', p2.z < side - 0.5 && p2.z > side - 1.6 && Math.abs(fl.x - floor[1].x) < 0.01 && Math.abs(fl.z - floor[1].z) < 0.01, JSON.stringify({ z: p2.z, carSide: side }));
check('a bump at a walking pace costs nothing (no damage from parking)', h1 >= h0 - 0.5, JSON.stringify({ before: h0, after: h1 }));
await shot('against-car');
await page.waitForTimeout(800);
await stopSound(page, `${out}/raw/sound.webm`);

// ---- 3. the courier run, Pikine → Plateau
await t.tap('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
await t.tap('#phone [data-nav="home"]'); await page.waitForTimeout(300);
await t.tap('#phone [data-app="travail"]'); await page.waitForSelector('#modal.on', T);
await shot('jobs-app');
const card = page.locator('#modal .dcard', { hasText: 'Ndeye' }).first();
await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await shot('jobs-app-plateau');
const cb = await card.boundingBox(); await t.down(5, cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(60); await t.up(5);
await page.waitForFunction(() => window.__dakar.activeJob()?.routeId === 'x_pk_pl_diallo_ndeye', null, { timeout: 20000 });
const wallet0 = await d(() => window.__dakar.state.wallet);
check('« Travail » on the phone: the parcel for the Plateau taken with a tap (go and fetch it first)', (await d(() => window.__dakar.activeJob()))?.stage === 'pickup');
const places = await d(() => window.__dakar.cityPlaces());
const shop = places.find(p => p.id.startsWith('pikine:') && p.id.includes(':city:boutique'));   // the courier's stop is the first place of that kind (src/economy/ui.ts placeOf)
await d(([x, z]) => window.__dakar.moto.place(x, z, Math.PI / 2), [gapX, -2.1]);                       // pulled out into the road (it was backed out above)
await boardVehicle(page, t, 'moto');
let a = await AT(); const K1 = kerbOf(shop);
await pilot(page, t, 'moto', route({ x: a.x, z: a.z, yaw: a.yaw }, K1, { cruise: 6 }), { cruise: 6, stall: 40000, ms: 600000, brakeAtEnd: true });
await t.tap('#ridepad .rp-off'); await page.waitForFunction(() => !window.__dakar.moto.info().driving && window.__dakar.pos().mode === 'play', null, T);
await walkTo(page, t, shop.x, shop.z, { tol: 1.5, ms: 60000 });
await page.waitForFunction(() => window.__dakar.activeJob()?.stage === 'deliver', null, { timeout: 30000 }).catch(() => {});
check('at Boutique Diallo, on foot at the door: the parcel is picked up', (await d(() => window.__dakar.activeJob()))?.stage === 'deliver', JSON.stringify({ shop: [shop.id, shop.x, shop.z], me: await d(() => [window.__dakar.pos().x, window.__dakar.pos().z]) }));
await boardVehicle(page, t, 'moto');
check('… and it rides in the courier box', !!(await AT()).box || (await AT()).parcel !== null, JSON.stringify(await AT()));
a = await AT();
await pilot(page, t, 'moto', route({ x: a.x, z: a.z, yaw: a.yaw }, { x: -60, z: 140 }, { cruise: 7 }), { cruise: 7, stall: 40000, ms: 600000 });
const len = await d(() => { const p = window.__dakar.road.at('pikine-plateau', 0, 0); return p ? window.__dakar.road.project(p.x, p.z).length : null; });
await driveRoad(page, t, 'moto', 'pikine-plateau', len - 40, { cruise: 11, brakeAtEnd: false, stall: 240000, boost: true });
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau', null, { timeout: 240000 }).catch(() => {});
check('in the Plateau on the Jakarta with the parcel (one delivery in hand, nothing paid yet)', (await d(() => window.__dakar.pos().hub)) === 'plateau' && (await d(() => window.__dakar.activeJob()))?.stage === 'deliver' && (await d(() => window.__dakar.state.wallet)) === wallet0);
await shot('plateau');
const pl = (await d(() => window.__dakar.cityPlaces())).find(p => p.id.startsWith('plateau:') && p.id.includes(':city:boutique'));
a = await AT(); const K2 = kerbOf(pl);
const r2 = route({ x: a.x, z: a.z, yaw: a.yaw }, K2, { cruise: 6 });
if (r2) await pilot(page, t, 'moto', r2, { cruise: 6, stall: 40000, ms: 600000, brakeAtEnd: true });
await t.tap('#ridepad .rp-off'); await page.waitForFunction(() => !window.__dakar.moto.info().driving && window.__dakar.pos().mode === 'play', null, T);
await walkTo(page, t, pl.x, pl.z, { tol: 1.5, ms: 60000 });
await page.waitForFunction(() => !window.__dakar.activeJob(), null, { timeout: 30000 }).catch(() => {});
const wallet1 = await d(() => window.__dakar.state.wallet), lines = (await d(() => window.__dakar.ledger())).filter(l => /Livraison|Tiak|livr/i.test(l.label));
check('handed over at Atelier Ndeye: paid ONCE (one wallet line)', !(await d(() => window.__dakar.activeJob())) && wallet1 > wallet0 && lines.length === 1, JSON.stringify({ paid: wallet1 - wallet0, lines: lines.map(l => l.label) }));
await shot('delivered');
await d(() => window.__dakar.save()); await d(() => history.replaceState(null, '', location.href.replace(/&argent=\d+/, ''))); await page.reload(); await ready(); await page.waitForTimeout(2500);
check('reloaded after the delivery: nothing paid twice, no parcel in hand', (await d(() => window.__dakar.state.wallet)) === wallet1 && !(await d(() => window.__dakar.activeJob())));
check('no JavaScript error', errors.length === 0, errors.slice(0, 2).join(' | '));
const video = await page.video().path(); await context.close();
const clap = sync(video, `${out}/raw/sound.webm`);
if (clap) mux(video, `${out}/raw/sound.webm`, clap.offset, `${out}/jakarta-paddle.mp4`, { from: Math.max(0, clap.offset - 0.5) });
check('the narrow-gap manoeuvre filmed with its sound (MP4, H.264 + AAC)', !!clap && fs.existsSync(`${out}/jakarta-paddle.mp4`), JSON.stringify(clap));
void audioAt; void born; void STICK;
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
