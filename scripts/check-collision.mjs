// How a contact FEELS in a car (src/transport/contact.ts), portrait phone, real fingers: a light bump, a hard hit, a push against a wall, a scrape along it, backing away, on a phone that can
// vibrate (Android-like: navigator.vibrate stubbed to record) and on one that cannot (iPhone-like: none). The driving physics is untouched; what is checked is what the player gets:
//   – a bump is a soft thud with a tiny jolt; a hit is a crash with a shake, a lurch of the camera, a knock of the body, a longer buzz, and the speed is cut; the scrape is a continuous grind;
//   – a push against a wall makes ONE knock and the shake dies away (no endless shake, no stutter); the car never goes into the wall, and it can always back away;
//   – nothing in the save changes; on a phone without vibration nothing is claimed and nothing breaks.
// Usage: node scripts/check-collision.mjs [baseUrl] [outDir]   (a running build)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4214/', out = process.argv[3] ?? 'docs/screenshots/collision';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const near = v => [-120, -60, 0, 60, 120].reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

async function session(vibrate) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(v => { if (v) { window.__vib = []; navigator.vibrate = p => { window.__vib.push({ at: performance.now(), p }); return true; }; } else { try { delete Navigator.prototype.vibrate; } catch { /* */ } Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }); } }, vibrate);
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, arg) => page.evaluate(fn, arg), tr = await realTouch(page);
  const info = () => d(() => window.__dakar.car.info()), au = () => d(() => window.__dakar.car.audio()), feel = () => d(() => window.__dakar.car.feel()), at = () => d(() => window.__dakar.car.at()), meter = () => d(() => window.__dakar.car.audioMeter());
  const vib = () => d(() => window.__vib ?? null);
  const simWait = async (s, ms = 120000) => { const t0 = (await at()).t; await page.waitForFunction(([a, s]) => window.__dakar.car.at().t >= a + s, [t0, s], { timeout: ms }).catch(() => {}); };
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
  const c0 = await info();
  await d(c => { const f = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) }; window.__dakar.place(c.x - f.x * 3.3, c.z - f.z * 3.3, c.yaw); }, c0);
  await page.waitForTimeout(1200); await tr.tap('#act');
  await page.waitForFunction(() => window.__dakar.car.info().driving, null, T);
  await page.waitForFunction(() => document.body.classList.contains('ridepad'), null, T);
  await page.waitForTimeout(1500);
  // walls with a free corridor of 12 m in front of them (nothing else in the run-up: a building across a narrow gap would hold the car before it arrives)
  const cols = await d(() => { const all = window.__dakar.cityGeometry().colliders; return all.filter(c => c.h >= 6 && c.x1 - c.x0 > 8 && c.z1 - c.z0 > 14).filter(c => { const zc = (c.z0 + c.z1) / 2; return !all.some(o => o !== c && o.x1 > c.x0 - 11 && o.x0 < c.x0 + 0.5 && o.z1 > zc - 2.5 && o.z0 < zc + 2.5); }).slice(0, 60); });
  return { page, d, tr, info, au, feel, at, meter, vib, simWait, cols, errors, context };
}
const startAt = (s, c, dist, yaw = Math.PI / 2, dz = 0) => s.d(([x, z, y]) => { window.__dakar.car.place(x, z, y); window.__dakar.car.feelReset(); }, [c.x0 - dist, (c.z0 + c.z1) / 2 + dz, yaw]);
/** The first wall of the city that a run of this kind really meets (a free approach); returns it and what the run did. */
async function onAWall(s, run) { for (const c of s.cols) { const r = await run(c); if (r) return { c, r }; } return null; }

// ============================== a phone that can vibrate
{
  const s = await session(true);
  const save0 = await s.d(() => JSON.stringify([window.__dakar.state.data.counters, window.__dakar.state.data.ledger.length, window.__dakar.state.wallet]));
  const a0 = await s.au();
  // ---- 1. a hard hit, head on: this also finds a CLEAN wall (a run-up of 9 m that really arrives at speed, nothing else in the way) which every later step uses
  const aH = await s.au(), nv0 = (await s.vib()).length;
  const found = await onAWall(s, async c => {
    await startAt(s, c, 7); await s.d(() => window.__dakar.car.boost(13));
    await s.page.waitForFunction(() => window.__dakar.car.feel().impacts.length > 0, null, { timeout: 12000 }).catch(() => {});
    await s.page.waitForTimeout(250);
    const f = await s.feel();
    return f.impacts.length && f.impacts[0].speed >= 8 && f.impacts[0].strength > 0.5 ? f : null;
  });
  if (!found) { console.log('FAIL: no clean wall found'); process.exit(1); }
  const wall = found.c, fh = found.r, ah = await s.au(), vh = (await s.vib()).slice(nv0);
  await s.simWait(1.6);
  const sp = Math.abs((await s.at()).speed), px = (await s.at()).x, imp = fh.impacts[0];
  check('a hard hit is a crash: one impact of real strength, the speed is cut, the screen shakes and the camera lurches, the body is knocked', !!imp && imp.kind === 'hit' && imp.strength > 0.5 && sp < 2 && px < wall.x0 - 0.8 && fh.shakePeak >= 0.6 && fh.kickPeak >= 0.1 && ah.count.impact === aH.count.impact + 1, JSON.stringify({ imp, speedAfter: +sp.toFixed(2), shakePeak: fh.shakePeak, kickPeak: fh.kickPeak, crashes: ah.count.impact - aH.count.impact }));
  await s.page.screenshot({ path: `${out}/1-hit.png` });
  // ---- 2. a light bump: a slow touch, from close
  await s.simWait(1.0);
  await startAt(s, wall, 2.9); const aB0 = await s.au(), nvb = (await s.vib()).length;
  await s.d(() => window.__dakar.car.boost(2.3));
  await s.page.waitForFunction(() => window.__dakar.car.feel().impacts.length > 0, null, { timeout: 25000 }).catch(() => {});
  await s.page.waitForTimeout(250);
  const fb = await s.feel(), ab = await s.au(), vb = (await s.vib()).slice(nvb);
  check('a slow touch is a bump: a soft thud (a tap, not a crash), a tiny jolt, a short tick of the phone', fb.impacts.length === 1 && fb.impacts[0].kind === 'bump' && ab.count.tap === aB0.count.tap + 1 && ab.count.impact === aB0.count.impact && fb.shakePeak <= 0.2 && vb.length >= 1 && vb.every(v => typeof v.p === 'number' && v.p <= 20), JSON.stringify({ impacts: fb.impacts, tap: ab.count.tap - aB0.count.tap, shakePeak: fb.shakePeak, vib: vb.map(v => v.p) }));
  const total = ms => ms.reduce((a, v) => a + [v.p].flat().reduce((x, y) => x + y, 0), 0);
  check('and the phone gives a longer thump for the hit than for the bump', vh.length >= 1 && Array.isArray(vh[0].p) && total(vh) >= 60 && total(vh) > total(vb), JSON.stringify({ hit: vh.map(v => v.p), bump: vb.map(v => v.p) }));
  // ---- 3. a push against the wall, the gas held: one knock, the shake dies, nothing goes through
  await s.simWait(1.0);
  await startAt(s, wall, 5); const aP = await s.au(), nvP = (await s.vib()).length;
    const g = await s.tr.centre('#ridepad .rp-gas'); await s.tr.down(1, g.x, g.y);
  await s.page.waitForTimeout(1500);
  await s.simWait(6.5);
  const fp = await s.feel(), ap = await s.au(), vp = (await s.vib()).slice(nvP), pos = await s.at();
  await s.page.screenshot({ path: `${out}/2-push.png` });
  check('held against a wall for six seconds the car knocks once or twice, not on every frame (sound and buzz)', fp.impacts.length >= 1 && fp.impacts.length <= 2 && (ap.count.impact + ap.count.tap) - (aP.count.impact + aP.count.tap) <= 2 && vp.length <= 3, JSON.stringify({ impacts: fp.impacts.length, sounds: (ap.count.impact + ap.count.tap) - (aP.count.impact + aP.count.tap), buzzes: vp.length }));
  check('the shake has died away by then (not an endless shake against the wall)', fp.shake < 0.05, JSON.stringify({ shakeNow: fp.shake }));
  check('the car is in front of the wall, never inside it', pos.x < wall.x0 - 0.8, JSON.stringify({ x: pos.x, wallX0: wall.x0 }));
  // ---- 4. never locked in: back away with the brake held at the standstill
  await s.tr.up(1);
  await s.page.waitForFunction(() => Math.abs(window.__dakar.car.at().speed) < 0.4, null, { timeout: 60000 }).catch(() => {});
  // the brake, held at the standstill, eases the car into a gentle reverse (there is no R button any more)
  const br = await s.tr.centre('#ridepad .rp-brake');
  const xb = (await s.at()).x; await s.tr.down(1, br.x, br.y); await s.simWait(4.5); await s.tr.up(1);
  const xa = (await s.at()).x;
  check('after the push the car backs away from the wall (never locked in)', xb - xa > 1, JSON.stringify({ before: xb, after: xa }));
  // ---- 5. a scrape along the wall at an angle
  const base = await s.meter();
  const scrape = await onAWall(s, async c => {
    await s.d(([x, z]) => { window.__dakar.car.place(x, z, 0.3); window.__dakar.car.feelReset(); window.__dakar.car.boost(9); }, [c.x0 - 1.5, c.z0 + 3]);
    let sawScraping = false, spMax = -120, scrapeStart = 0;
    for (let i = 0; i < 40; i++) { const a = await s.au(); if (a.scraping) { sawScraping = true; const m = await s.meter(); spMax = Math.max(spMax, m.speakerDb); } await s.page.waitForTimeout(80); }
    const f = await s.feel(); return f.scrapeFrames > 3 ? { f, sawScraping, spMax } : null;
  });
  const sc = scrape?.r;
  check('sliding along a wall at an angle is a scrape: a continuous grind in the speaker band, started by at most one knock', !!sc && sc.sawScraping && sc.f.impacts.length <= 2 && sc.spMax >= base.speakerDb + 4 && (await s.au()).count.scrape >= 1, JSON.stringify({ scrapeFrames: sc?.f.scrapeFrames, knocks: sc?.f.impacts.length, scrapeSpeakerDb: sc?.spMax, idleSpeakerDb: base.speakerDb }));
  const pb = await s.tr.centre('#ridepad .rp-brake'); await s.tr.down(1, pb.x, pb.y);
  await s.page.waitForFunction(() => Math.abs(window.__dakar.car.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {}); await s.tr.up(1);
  await s.page.waitForTimeout(700);
  check('and the scrape stops when the sliding stops', (await s.au()).scraping === false, JSON.stringify({ scraping: (await s.au()).scraping }));
  // ---- 6. the setting, and the save
  await s.d(() => window.__dakar.phone('reglages'));
  await s.page.waitForSelector('#phone [data-act="haptics"]', T);
  check('Réglages offers the Vibrations toggle where the browser can vibrate', true);
  const nvS = (await s.vib()).length;
  await s.page.locator('#phone [data-act="haptics"]').click(); await s.d(() => window.__dakar.phoneClose());
  await startAt(s, wall, 9); await s.d(() => window.__dakar.car.boost(11));
  await s.page.waitForFunction(() => window.__dakar.car.feel().impacts.length > 0, null, { timeout: 25000 }).catch(() => {});
  await s.page.waitForTimeout(300);
  const off = await s.feel(), nvO = (await s.vib()).length;
  check('with the setting off the same hit is felt in sound and camera but the phone does not vibrate', off.impacts.length >= 1 && off.shakePeak >= 0.6 && nvO === nvS, JSON.stringify({ impacts: off.impacts.length, shakePeak: off.shakePeak, buzzes: nvO - nvS }));
  const save1 = await s.d(() => JSON.stringify([window.__dakar.state.data.counters, window.__dakar.state.data.ledger.length, window.__dakar.state.wallet]));
  check('none of it touched the save (counters, ledger, wallet)', save0 === save1, '');
  check('no JavaScript errors', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
  await s.context.close();
}

// ============================== a phone that cannot (Safari on iPhone)
{
  const s = await session(false);
  const has = await s.d(() => typeof navigator.vibrate);
  check('this phone has no navigator.vibrate (like Safari on iPhone)', has === 'undefined', has);
  const hit = await onAWall(s, async c => {
    await startAt(s, c, 9); await s.d(() => window.__dakar.car.boost(11));
    await s.page.waitForFunction(() => window.__dakar.car.feel().impacts.length > 0, null, { timeout: 25000 }).catch(() => {});
    await s.page.waitForTimeout(250); const f = await s.feel(); return f.impacts.length ? f : null;
  });
  const f = hit?.r, a = await s.au();
  check('a hard hit is still a crash there: sound, shake, lurch, no vibration asked, no error', !!f && f.impacts[0].kind === 'hit' && f.shakePeak >= 0.6 && f.kickPeak >= 0.1 && a.count.impact >= 1, JSON.stringify({ impact: f?.impacts[0], shakePeak: f?.shakePeak, kickPeak: f?.kickPeak }));
  await s.d(() => window.__dakar.phone('reglages'));
  await s.page.waitForSelector('#phone [data-act="sound"]', T);
  const note = await s.d(() => ({ toggle: !!document.querySelector('#phone [data-act="haptics"]'), text: document.querySelector('#phone')?.textContent ?? '' }));
  check('Réglages shows no Vibrations toggle there, and says honestly that the shocks come through sound and camera', !note.toggle && /ne fait pas vibrer/.test(note.text), JSON.stringify({ toggle: note.toggle }));
  await s.page.screenshot({ path: `${out}/3-no-vibrate-settings.png` });
  check('no JavaScript errors', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
  await s.context.close();
}
await browser.close();
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
