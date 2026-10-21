// An ordinary MP4 of the Teranga driven with its sound (the approved B recordings through src/transport/vehicleAudio.ts): getting in (door, ignition), idling, pulling away with
// the real stick, cruising, the horn (the Klaxon button, shown with ?klaxon), braking, and a slow bump into a parked car (a light tap, no damage). Real CDP touches; the page's own
// master output is recorded and lined up with the picture by a clapperboard (flash + tone). Usage: node scripts/capture-drive-av.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle, padDrive } from './lib/realTouch.mjs';
import { startSound, stopSound, sync, mux, loudness } from './lib/avRecord.mjs';

const [base = 'http://127.0.0.1:4423/', out = '/tmp/claude-0/veh/drive-av'] = process.argv.slice(2);
fs.mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
await page.goto(`${base}?debug&touch&heure=11&argent=4100000&klaxon`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.teranga, null, { timeout: 300000 });
const t = await realTouch(page);
await t.tap('#menuBtn'); await page.waitForTimeout(400); await d(() => window.__dakar.phoneClose());          // a first touch: the phone may play sound
await page.waitForFunction(() => window.__dakar.teranga.info().floor.length > 0, null, { timeout: 300000 });
await d(() => window.__dakar.teranga.own());
await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, { timeout: 300000 });
// the car on a straight street (x = -60, heading north), the player at its door
await d(() => { window.__dakar.teranga.place(-62.1, -40, 0); window.__dakar.place(-59.5, -40, 0); });
await page.waitForTimeout(1000);
await startSound(page); await page.waitForTimeout(1400);
const t0 = Date.now(), at = () => (Date.now() - t0) / 1000, marks = [];
marks.push(['getting in', at()]); await boardVehicle(page, t, 'teranga'); await page.waitForTimeout(2500);
marks.push(['idle', at()]); await page.waitForTimeout(2500);
marks.push(['pulling away', at()]); await padDrive(page, t, { fwd: 1, hold: () => page.waitForFunction(() => window.__dakar.teranga.at().z > -5, null, { timeout: 120000 }) });
marks.push(['horn', at()]); { const h = await t.centre('#ridepad .rp-horn'); await t.down(6, h.x, h.y); await page.waitForTimeout(900); await t.up(6); }
marks.push(['braking', at()]); await padDrive(page, t, { brake: true, hold: () => page.waitForFunction(() => Math.abs(window.__dakar.teranga.at().speed) < 0.2, null, { timeout: 60000 }) });
// a parked car ahead (the dealer's floor car is far; the player's own position is used: a second owned car is not available, so the bump is against the kerb-side wall of the street)
marks.push(['slow bump', at()]);
const before = await d(() => window.__dakar.teranga.health());
await d(() => { const a = window.__dakar.teranga.at(); window.__dakar.teranga.place(a.x, a.z, -Math.PI / 2 + 0.25); });   // turned toward the buildings on the left
await padDrive(page, t, { fwd: 0.45, hold: () => page.waitForFunction(() => (window.__dakar.teranga.feel()?.impacts.length ?? 0) > 0, null, { timeout: 60000 }).catch(() => {}) });
await page.waitForTimeout(1500);
const after = await d(() => window.__dakar.teranga.health()), felt = await d(() => window.__dakar.teranga.feel());
marks.push(['getting out', at()]); await t.tap('#ridepad .rp-off'); await page.waitForTimeout(3500);
await stopSound(page, `${out}/raw/sound.webm`);
const video = await page.video().path(); await context.close(); await browser.close();
const clap = sync(video, `${out}/raw/sound.webm`);
if (clap) mux(video, `${out}/raw/sound.webm`, clap.offset, `${out}/teranga-drive.mp4`, { from: Math.max(0, clap.offset - 0.5) });
const lv = clap ? loudness(`${out}/teranga-drive.mp4`, 0.5) : [];
console.log(JSON.stringify({ clap, marks, bump: { before, after, impacts: felt?.impacts }, loudest: lv.filter(w => w.peakDb > -30).length, errors }));
