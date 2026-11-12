// Keur Meubles (Pikine, Cité Jàmm), as a player on a phone reaches it (real touch): the shop seen from the street (its sign, its open showroom), the
// walk from the far pavement to its door and its till, and a car driven into its loading bay at the kerb and left there, the player walking in.
// The ground in front of it is kept open (src/world/builder.ts citeFronts): nothing of the street dressing stands there.
// Headless Chromium + SwiftShader: a software renderer, NOT a phone.
//
// Usage: node scripts/check-keur-meubles.mjs <baseUrl> <outDir> [quality=medium]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch, pilot, walkTo, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4641/', out = '/tmp/claude-0/beta/world/keur-meubles', quality = 'medium'] = process.argv.slice(2);
fs.mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: viewport } });
await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 500)}`); };
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.jpg`, quality: 72 }); };
await page.goto(`${base}?debug&touch&heure=11&argent=100000000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'pikine' && window.__dakar.teranga?.info().floor.length > 0 && window.__dakar.citeSpots?.(), null, { timeout: 240000 });
const t = await realTouch(page);
const spots = await d(() => window.__dakar.citeSpots());
const bay = { x0: -50, x1: -39.5, z0: -65, z1: -62.9 };                                   // world/builder.ts citeFronts 'loading_bay' (block 1,0: x = −53 + 3 … 13.5)

// 1. the way in, from the kerb to the showroom's door (4 m wide, in front of its middle), is free of anything solid; and nothing of the street's
// dressing (the painted walls, the shops, the poles, the stalls, the parked cars) stands on the ground kept open in front of it
const blocked = await d(() => { const g = window.__dakar.cityGeometry(), out = []; for (let x = -46.4; x <= -42.6; x += 0.4) for (let z = -71.4; z <= -65.2; z += 0.4) { const c = g.colliders.find(c => x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3); if (c) out.push([+x.toFixed(1), +z.toFixed(1), [c.x0, c.z0, c.x1, c.z1].map(v => +v.toFixed(2))]); } return out; });
const dna = await d(() => (window.__dakar.pikineDna?.() ?? []).filter(i => i.x > -52.5 && i.x < -35 && i.z > -71.4 && i.z < -62.9).map(i => [i.kind, +i.x.toFixed(1), +i.z.toFixed(1)]));
check('the way in from the kerb to the door is free, and no painted wall, shop, pole or stall of the street stands in front of the shop', blocked.length === 0 && dna.length === 0, JSON.stringify({ blocked: blocked.slice(0, 6), dna }));
// 2. seen from the far pavement
await d(() => window.__dakar.place(-44, -53.6, Math.PI)); await page.waitForTimeout(2500);
await d(() => window.__dakar.cam([-44, 2.2, -52.5], [-44, 2.6, -72])); await page.waitForTimeout(2200); await shot('01-from-the-far-pavement'); await d(() => window.__dakar.cam(null));
// 3. walked to the door and to the till, with a thumb on the stick
const w1 = await walkTo(page, t, -44, -66.2, { tol: 0.7, ms: 120000 });                       // across the street to the kerb
const w2 = await walkTo(page, t, -44, -70.2, { tol: 0.7, ms: 90000 });                        // in at the door, between the bench and the planter on display
await walkTo(page, t, -42.6, -73.6, { tol: 0.7, ms: 90000 });                                 // past the dining set
const w3 = await walkTo(page, t, spots.till.x, spots.till.z, { tol: 1.0, ms: 120000 });
const f = await d(() => window.__dakar.focus());
check('walked from the far pavement to the door, then to the till: Keur Meubles offers its catalogue there', w1 < 0.8 && w2 < 0.8 && w3 < 1.1 && /meubles/i.test(JSON.stringify(f ?? '')), JSON.stringify({ w1, w2, w3, focus: f }));
await shot('02-at-the-till');
// 4. a car driven into the loading bay, left there, the player walking in
await d(() => window.__dakar.teranga.own()); await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, { timeout: 120000 });
await d(() => window.__dakar.teranga.place(-12, -62.1, -Math.PI / 2)); await d(() => window.__dakar.place(-12, -59.7, -Math.PI / 2)); await page.waitForTimeout(800);
await boardVehicle(page, t, 'teranga');
await d(() => window.__dakar.teranga.feelReset());
const end = await pilot(page, t, 'teranga', [{ x: -30, z: -62.1, tol: 2.5, speed: 6 }, { x: -36.5, z: -62.3, tol: 1.6, speed: 3 }, { x: -44.5, z: -64.0, tol: 1.0, speed: 2 }], { cruise: 5, stall: 12000, brakeAtEnd: true, ms: 600000 });
const felt = await d(() => window.__dakar.teranga.feel());
const inBay = end && end.x > bay.x0 + 1.9 && end.x < bay.x1 - 1.9 && end.z > bay.z0 - 0.2 && end.z < bay.z1 + 0.6;
check('driven into the loading bay and stopped in it, nothing in the way', inBay && felt.impacts.length === 0, JSON.stringify({ end, impacts: felt.impacts }));
await shot('03-in-the-bay');
await t.tap('#ridepad .rp-off'); await page.waitForFunction(() => !window.__dakar.teranga.info().driving && window.__dakar.pos().mode === 'play', null, { timeout: 120000 });
// round the car's nose onto the pavement, along it, in at the door (the thumb steers; nothing here finds a way round an obstacle by itself)
const me = await d(() => window.__dakar.pos());
await walkTo(page, t, -52, me.z, { tol: 0.7, ms: 60000 });                                    // west, clear of the car (it stands at x −47 … −42)
await walkTo(page, t, -52, -66.4, { tol: 0.7, ms: 60000 });
await walkTo(page, t, -44.5, -66.4, { tol: 0.7, ms: 60000 });
const w4 = await walkTo(page, t, -44, -69.8, { tol: 0.8, ms: 120000 });
check('out of the car and in at the door', w4 < 0.9, JSON.stringify({ w4 }));
await d(() => window.__dakar.cam([-33, 6, -55], [-44, 1.2, -67])); await page.waitForTimeout(2200); await shot('04-car-in-the-bay-player-at-the-door'); await d(() => window.__dakar.cam(null));

fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, quality, failed, results, errors: errors.slice(0, 10) }, null, 1));
const raw = page.video() ? await page.video().path() : null;
await context.close(); await browser.close();
if (raw) { try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-vf', 'setpts=0.5*PTS,scale=360:-2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '32', '-preset', 'veryfast', '-movflags', '+faststart', `${out}/keur-meubles.mp4`]); } catch (e) { console.log('ffmpeg', e.message); } }
console.log(`${results.length - failed}/${results.length} passed`, errors.length ? `page errors: ${errors.slice(0, 3).join(' / ')}` : '');
process.exit(failed ? 1 : 0);
