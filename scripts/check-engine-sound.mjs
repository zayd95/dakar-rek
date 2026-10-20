// The engine, the start, the brake and the contacts of a car, measured at the speaker (the level the page sends out after its limiter and the sound setting), portrait phone, real fingers, the
// browser held to an iPhone's gesture rule. A phone loudspeaker plays little below 300 Hz, so the levels that count are « speaker band » (what is above it):
//   – the ignition is a burst over the idle; the idle is not a bare bass note (a good part of its energy is in the speaker band) and not loud;
//   – the revs are heard (cruise is clearly above idle), and lifting off the throttle at speed closes the note;
//   – a hard brake adds the squeal (energy above 800 Hz rises); nothing clips; the sound setting silences it all.
// The headless browser still has no loudspeaker: this proves what the page sends out, not what an iPhone speaker makes of it (docs/vehicles/AUDIO_ON_DEVICE.md).
// Usage: node scripts/check-engine-sound.mjs [baseUrl] [outDir]   (a running build)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4214/', out = process.argv[3] ?? 'docs/screenshots/engine-sound';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const near = v => [-120, -60, 0, 60, 120].reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=document-user-activation-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg), info = () => d(() => window.__dakar.car.info()), au = () => d(() => window.__dakar.car.audio()), meter = () => d(() => window.__dakar.car.audioMeter()), tr = await realTouch(page);
/** n readings, `gap` ms apart: the loudest of each figure (and the lowest). */
const sample = async (n, gap = 80) => { const r = []; for (let i = 0; i < n; i++) { r.push(await meter()); await page.waitForTimeout(gap); } const mx = k => Math.max(...r.map(m => m[k])), mn = k => Math.min(...r.map(m => m[k])); return { peak: mx('peakDb'), rms: mx('rmsDb'), sp: mx('speakerDb'), spMin: mn('speakerDb'), high: mx('high'), highMin: mn('high'), air: mx('airDb') }; };
await page.goto(`${base}?debug&touch&heure=11`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
await d(() => window.__dakar.teleport('plateau'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car?.info().dealer, null, T);
const dealer = (await info()).dealer, rx = near(dealer.x), rz = near(dealer.z), road = Math.abs(dealer.z - rz) < Math.abs(dealer.x - rx) ? { x: 0, z: Math.sign(rz - dealer.z) || 1 } : { x: Math.sign(rx - dealer.x) || 1, z: 0 };
await d(([p, r]) => window.__dakar.place(p.x + r.x * 0.7 + (r.x ? 0 : 0.4), p.z + r.z * 0.7 + (r.z ? 0 : 0.4), Math.atan2(-r.x, -r.z)), [dealer, road]);
await page.waitForFunction(() => /Voir les articles/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, T).catch(() => {});
await tr.tap('#act'); await page.waitForSelector('#modal.on', T);
await page.locator('#modal .item', { hasText: 'Essayer gratuitement' }).first().tap();
await page.waitForFunction(() => window.__dakar.car.info().here, null, T);
await page.waitForTimeout(800);
const quiet = await sample(4, 60);
const c0 = await info();
await d(c => { const f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; window.__dakar.place(c.x - f.x * 3.3, c.z - f.z * 3.3, c.yaw); }, c0);
await page.waitForTimeout(1200);
// the door, the crank and the catch: read the output all through the getting in
await tr.tap('#act');
const entry = []; const t0 = Date.now();
while (Date.now() - t0 < 14000 && !(await d(() => window.__dakar.car.info().driving))) { entry.push(await meter()); await page.waitForTimeout(40); }
await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, T);
await page.waitForTimeout(2200);
const idle = await sample(8, 120), a0 = await au();
check('before getting in the page is silent (no engine, nothing on the output)', quiet.rms <= -60, JSON.stringify(quiet));
check('the ignition is heard on the way in, at least as loud as the idle (the recorded starter and its catch)', Math.max(...entry.map(m => m.peakDb)) >= idle.peak - 3 && Math.max(...entry.map(m => m.peakDb)) >= -24 && a0.count.start >= 1, JSON.stringify({ entryPeak: Math.max(...entry.map(m => m.peakDb)), idlePeak: idle.peak, starts: a0.count.start }));
check('the idle is audible on a phone speaker and quiet: at least a tenth of its energy is in the speaker band, at a level between −38 and −20 dBFS there', idle.sp - idle.rms >= -10 && idle.sp >= -38 && idle.sp <= -20, JSON.stringify({ idleSpeakerDb: idle.sp, idleRmsDb: idle.rms }));
// cruise: gas held
const g = await tr.centre('#ridepad .rp-gas'); await tr.down(1, g.x, g.y);
await page.waitForFunction(() => window.__dakar.car.info().speed > 6.5, null, T);
await page.waitForTimeout(600);
const cruise = await sample(8, 100), cs = (await info()).speed;
check('the revs are heard: at cruise the engine is clearly above the idle in the speaker band', cruise.sp >= idle.sp + 3, JSON.stringify({ idleSpeakerDb: idle.sp, cruiseSpeakerDb: cruise.sp, speed: +cs.toFixed(1) }));
// lift off: the note closes (wait until the car has really begun to slow: the headless renderer steps the sim slowly)
await tr.up(1);
await page.waitForFunction(v => window.__dakar.car.info().speed < v - 0.4, cs, { timeout: 60000 }).catch(() => {});
const lift = await sample(6, 90), ls = (await info()).speed;
check('lifting off at speed closes the note (the engine falls away in the speaker band)', ls > 3 && lift.sp <= cruise.sp - 2, JSON.stringify({ cruiseSpeakerDb: cruise.sp, liftSpeakerDb: lift.sp, speedAfter: +ls.toFixed(1) }));
// a hard brake from speed: the squeal (energy at 1.8–4.5 kHz), read every 40 ms while it sounds
await d(() => window.__dakar.car.boost(13)); await page.waitForTimeout(500);
const pre = await sample(4, 60);
const pb = await tr.centre('#ridepad .rp-brake'); await tr.down(1, pb.x, pb.y);
const squeal = await sample(30, 40); await tr.up(1);
check('a hard brake adds the squeal: the 1.8–4.5 kHz band rises by at least 6 dB while it sounds', squeal.air >= pre.air + 6 && (await au()).count.brake > 0, JSON.stringify({ airBefore: pre.air, airDuring: squeal.air, brakes: (await au()).count.brake }));
const all = [quiet, idle, cruise, lift, pre, squeal];
check('nothing clips anywhere (the limiter holds the peak under −0.3 dBFS)', Math.max(...all.map(m => m.peak)) <= -0.3, JSON.stringify({ peaks: all.map(m => m.peak) }));
await d(() => window.__dakar.car.audioMute(true)); await page.waitForTimeout(250);
const mute = await sample(4, 60);
check('with the sound off the whole output is silent', mute.rms <= -80, JSON.stringify(mute));
await d(() => window.__dakar.car.audioMute(false));
await page.screenshot({ path: `${out}/1-driving.png` });
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
