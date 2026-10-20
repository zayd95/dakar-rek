// The horn of a car, portrait phone, REAL fingers (CDP touch), the browser held to the same rule an iPhone applies (a page may only make sound after a real gesture):
//   – a held horn starts at once (from the touch itself, not at the next frame), goes on while held, and stops on release;
//   – it works with the gas held by one thumb and the stick pushed by the other (three fingers);
//   – what it plays is measured on what the page sends to the speaker (dBFS and the share of the energy above 800 Hz, where a phone's loudspeaker works), not just counted;
//   – the phone's sound setting silences it and brings it back; a context put to sleep (a call, the lock screen) wakes at the next touch and the horn is heard again;
//   – the Klaxon button is a big target that no other control covers; a touch cancelled by the system lets the horn go.
// What it cannot do: tell what an iPhone loudspeaker or its silent switch does. The panel `?audiodebug` is for that, on the phone itself (docs/vehicles/AUDIO_ON_DEVICE.md).
// Usage: node scripts/check-horn.mjs [baseUrl] [outDir]   (a running build)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4214/', out = process.argv[3] ?? 'docs/screenshots/horn';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const near = v => [-120, -60, 0, 60, 120].reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=document-user-activation-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg), info = () => d(() => window.__dakar.car.info()), au = () => d(() => window.__dakar.car.audio()), meter = () => d(() => window.__dakar.car.audioMeter()), tr = await realTouch(page);
await page.goto(`${base}?debug&touch&heure=11&audiodebug&klaxon`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
check('before any touch the page may not make sound (the rule an iPhone applies)', !(await au()).gestured && (await au()).state === 'none', JSON.stringify(await au()));

// ---- into a car through the dealer's real menu (these are taps: the gestures that unlock the sound), then at the wheel
await d(() => window.__dakar.teleport('plateau'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.car?.info().dealer, null, T);
const dealer = (await info()).dealer, rx = near(dealer.x), rz = near(dealer.z), road = Math.abs(dealer.z - rz) < Math.abs(dealer.x - rx) ? { x: 0, z: Math.sign(rz - dealer.z) || 1 } : { x: Math.sign(rx - dealer.x) || 1, z: 0 };
await d(([p, r]) => window.__dakar.place(p.x + r.x * 0.7 + (r.x ? 0 : 0.4), p.z + r.z * 0.7 + (r.z ? 0 : 0.4), Math.atan2(-r.x, -r.z)), [dealer, road]);
await page.waitForFunction(() => /Voir les articles/.test(window.__dakar.focus()?.all?.join('|') ?? ''), null, T).catch(() => {});
await tr.tap('#act'); await page.waitForSelector('#modal.on', T);
await page.locator('#modal .item', { hasText: 'Essayer gratuitement' }).first().tap();
await page.waitForFunction(() => window.__dakar.car.info().here, null, T);
const c0 = await info();
await d(c => { const f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; window.__dakar.place(c.x - f.x * 3.3, c.z - f.z * 3.3, c.yaw); }, c0);
await page.waitForTimeout(1200);
await tr.tap('#act');
await page.waitForFunction(() => window.__dakar.car.info().driving, null, T);
await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, T);
await page.waitForTimeout(1500);
const a0 = await au();
check('after the taps the context runs and knows a gesture was made', a0.state === 'running' && a0.gestured, JSON.stringify({ state: a0.state, gestured: a0.gestured, resumesAsked: a0.nudges, by: a0.nudgedBy }));
check('driving asks for a playback session where the browser has the API (not muted by the silent switch), and the engine runs', a0.running && (a0.session === 'unsupported' || a0.session === 'playback'), JSON.stringify({ session: a0.session, running: a0.running }));

// ---- the Klaxon button: big, and nothing on top of it
const geo = await d(() => { const r = document.querySelector('#ridepad .rp-horn').getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, top = document.elementFromPoint(x, y), g = document.querySelector('#ridepad .rp-gas').getBoundingClientRect(); return { w: r.width, h: r.height, topIsHorn: !!top?.closest('.rp-horn'), gapToGas: g.y - (r.y + r.height), inside: r.right <= innerWidth && r.left >= 0 && r.bottom <= innerHeight }; });
check('the Klaxon button is a big target (≥ 88 × 52 px), on the screen, with nothing over it, clear of the gas', geo.w >= 88 && geo.h >= 52 && geo.topIsHorn && geo.inside && geo.gapToGas > 4, JSON.stringify(geo));
await page.screenshot({ path: `${out}/1-pad.png` });

// ---- gas (right thumb) + stick (left thumb) + horn (a third finger), all held
const g = await tr.centre('#ridepad .rp-gas'), j = await tr.centre('#joy'), k = await tr.centre('#ridepad .rp-horn');
await tr.down(1, g.x, g.y); await page.waitForTimeout(1200);
await tr.down(2, j.x, j.y); await tr.move(2, j.x + 24, j.y); await page.waitForTimeout(1200);
const base0 = []; for (let i = 0; i < 6; i++) { base0.push(await meter()); await page.waitForTimeout(100); }
const baseRms = Math.max(...base0.map(m => m.rmsDb)), basePeak = Math.max(...base0.map(m => m.peakDb)), baseSp = Math.max(...base0.map(m => m.speakerDb));
const yaw0 = (await info()).yaw;
await tr.down(3, k.x, k.y);
const right = await au();                                        // the very next thing the page is asked: before any frame could have run the sim
check('a held horn starts with the touch itself, not at the next frame', right.horn === true && right.count.horn >= 1, JSON.stringify({ horn: right.horn, count: right.count.horn }));
await page.waitForTimeout(250);
const held = []; for (let i = 0; i < 8; i++) { held.push(await meter()); await page.waitForTimeout(90); }
const hRms = Math.max(...held.map(m => m.rmsDb)), hPeak = Math.max(...held.map(m => m.peakDb)), hHigh = Math.max(...held.map(m => m.high)), hSp = Math.max(...held.map(m => m.speakerDb));
check('the horn stands clear of the engine where a phone speaker can play it (speaker band ≥ 4 dB over the engine alone: the recorded horn), is loud enough and never clips', hSp >= baseSp + 4 && hPeak <= -0.5 && hPeak >= -18, JSON.stringify({ engineSpeakerDb: baseSp, hornSpeakerDb: hSp, enginePeak: basePeak, hornPeak: hPeak, engineRms: baseRms, hornRms: hRms }));
check('and it is made of what a phone loudspeaker reproduces: (nearly) all of its energy is above 300 Hz', hSp >= hRms - 2, JSON.stringify({ speakerDb: hSp, rmsDb: hRms, aboveHz800: hHigh }));
await page.screenshot({ path: `${out}/2-horn-held.png` });
await page.waitForTimeout(2500);
const still = await au(), i1 = await info();
check('it goes on for as long as it is held, with the gas and the stick still working (three fingers)', still.horn === true && i1.speed > 1.5 && Math.abs(i1.yaw - yaw0) > 0.02, JSON.stringify({ horn: still.horn, speed: +i1.speed.toFixed(1), turned: +(i1.yaw - yaw0).toFixed(2) }));
await tr.up(3);
const off = await au();
check('released, it stops at once', off.horn === false, JSON.stringify({ horn: off.horn }));
await page.waitForTimeout(450);
const after = []; for (let i = 0; i < 5; i++) { after.push(await meter()); await page.waitForTimeout(80); }
check('and the bus falls back to the engine\'s level within half a second', Math.max(...after.map(m => m.speakerDb)) <= baseSp + 3, JSON.stringify({ afterSpeakerDb: Math.max(...after.map(m => m.speakerDb)), engineSpeakerDb: baseSp }));
const t1 = await d(() => window.__dakar.car.audio().count.horn);
await tr.tap('#ridepad .rp-horn'); await tr.tap('#ridepad .rp-horn'); await page.waitForTimeout(200);
check('short taps are heard too (two taps, two horns)', (await au()).count.horn - t1 >= 2, JSON.stringify({ before: t1, after: (await au()).count.horn }));

// ---- a touch the system takes away: no « up » ever comes; the horn must not stay on
await tr.down(3, k.x, k.y); await page.waitForTimeout(150);
const held2 = (await au()).horn;
await d(() => { window.dispatchEvent(new Event('blur')); });
await page.waitForTimeout(100);
check('if the system takes the touch away (a call, the app switcher: the page loses focus) the horn lets go', held2 === true && (await au()).horn === false, JSON.stringify({ heldBefore: held2, after: (await au()).horn }));
await tr.up(3);

// ---- the phone's sound setting
await d(() => window.__dakar.car.audioMute(true)); await page.waitForTimeout(150);
const a1 = await au(); await tr.down(3, k.x, k.y); await page.waitForTimeout(300); const muted = await au(), mm = await meter(); await tr.up(3);
check('with the sound off (Réglages) the horn is silent: asked, not played', muted.muted && !muted.horn && muted.count.horn === a1.count.horn && mm.rmsDb <= -80, JSON.stringify({ muted: muted.muted, horn: muted.horn, rms: mm.rmsDb }));
await d(() => window.__dakar.car.audioMute(false)); await page.waitForTimeout(150);
await tr.down(3, k.x, k.y); await page.waitForTimeout(350); const un = await au(), um = await meter(); await tr.up(3);
check('with it back on, the horn sounds again', un.horn && um.speakerDb >= baseSp + 3, JSON.stringify({ horn: un.horn, speakerDb: um.speakerDb, engineSpeakerDb: baseSp }));

// ---- a call, the lock screen: the context sleeps; the next touch wakes it; the horn is heard again
await tr.up(1); await tr.up(2);
await d(() => window.__dakar.car.audioSuspend()); await page.waitForTimeout(300);
const asleep = await au();
await tr.tap('#ridepad .rp-view'); await page.waitForTimeout(300);                       // any touch
const woke = await au();
await tr.down(3, k.x, k.y); await page.waitForTimeout(350); const wm = await meter(), wh = await au(); await tr.up(3);
check('a context put to sleep (call, lock screen) wakes at the next touch, and the horn is heard again', asleep.state === 'suspended' && woke.state === 'running' && wh.horn && wm.rmsDb > -50, JSON.stringify({ asleep: asleep.state, woke: woke.state, rms: wm.rmsDb }));

// ---- the on-device panel
const panel = await d(() => document.getElementById('audiodiag')?.textContent ?? '');
check('the on-device panel (?audiodebug) reports the context, the session, the touches that reached Klaxon and the level', /context running/.test(panel) && /klaxon touches: down [1-9]/.test(panel) && /level: peak/.test(panel) && /vibration API/.test(panel), panel.replace(/\n/g, ' | ').slice(0, 300));
await page.screenshot({ path: `${out}/3-panel.png` });
check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
