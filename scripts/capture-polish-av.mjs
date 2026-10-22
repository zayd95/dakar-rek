// Before / after films of the vehicle sound (docs/vehicles/POLISH.md § Son): the same moments played on the build before this pass (PR #63) and on this one,
// each an ordinary MP4 with the page's own sound (scripts/lib/avRecord.mjs: the master output after the limiter and the sound setting, lined up with the picture
// by a clapperboard), and the loudness of each moment measured from the file.
//   jakarta   the Jakarta: ignition, idle, full throttle, cruise, the brake to a stop
//   brake     the Teranga on an empty street: pulling away, cruising, a hard stop (the brakes), then idling with no traffic near (the city's bed)
//   prestige  the Lamane Sport: pulling away hard and cruising (the deeper engine)
//   radio     (this build only) the Teranga's radio: on, the next stations, the horn over it, off
// Real CDP touches for the pedals, the horn and the radio; debug hooks for the start (an hour, money, the vehicle bought and put in a street).
// Headless Chromium + SwiftShader: the game runs slower than the clock here, the sound does not; NOT a phone recording.
// Usage: node scripts/capture-polish-av.mjs <baseUrl> <outDir> <label> [scenes=jakarta,brake,prestige,radio]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, boardVehicle, padDrive } from './lib/realTouch.mjs';
import { startSound, stopSound, sync, mux, loudness } from './lib/avRecord.mjs';

const [base = 'http://127.0.0.1:4511/', outRoot = '/tmp/claude-0/veh/polish-av', label = 'after', list = 'jakarta,brake,prestige,radio'] = process.argv.slice(2);
const out = `${outRoot}/${label}`;
fs.mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=user-gesture-required'] });
const report = { base, label, renderer: 'headless Chromium + SwiftShader (not a phone)', scenes: {} };

const SCENES = {
  jakarta: { hub: 'pikine', key: 'moto', start: [-62.1, -40, 0], q: '&heure=11&argent=1500000' },
  brake: { hub: 'pikine', key: 'teranga', start: [-62.1, -40, 0], q: '&heure=4&argent=4500000' },
  prestige: { hub: 'almadies', key: 'suv', start: [-62.1, -40, 0], q: '&heure=11&argent=200000000' },
  radio: { hub: 'pikine', key: 'teranga', start: [-62.1, -40, 0], q: '&heure=11&argent=4500000' },
};

for (const name of list.split(',')) {
  const S = SCENES[name]; if (!S) continue;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch${S.q}`, { timeout: 180000 });
  await page.waitForFunction(k => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar[k], S.key, { timeout: 300000 });
  const t = await realTouch(page);
  await t.tap('#menuBtn'); await page.waitForTimeout(400); await d(() => window.__dakar.phoneClose());     // a first touch: the page may play sound
  if (S.hub !== 'pikine') { await d(h => window.__dakar.teleport(h), S.hub); await page.waitForFunction(h => window.__dakar.pos().hub === h, S.hub, { timeout: 300000 }); }
  await page.waitForFunction(k => !window.__dakar[k].info().floor || window.__dakar[k].info().floor.length > 0 || window.__dakar[k].info().price > 0, S.key, { timeout: 300000 });
  await d(k => window.__dakar[k].own(), S.key);
  await page.waitForFunction(k => window.__dakar[k].info().owned && window.__dakar[k].info().here, S.key, { timeout: 300000 });
  await d(([k, [x, z, y]]) => { window.__dakar[k].place(x, z, y); window.__dakar.place(x + 2.4, z, y); }, [S.key, S.start]);
  await page.waitForTimeout(1200);
  await startSound(page); await page.waitForTimeout(1400);
  const t0 = Date.now(), at = () => +((Date.now() - t0) / 1000).toFixed(2), marks = [];
  const mark = m => marks.push([m, at()]);
  const A = () => d(k => window.__dakar[k].at(), S.key);
  mark('getting on / in'); await boardVehicle(page, t, S.key); await page.waitForTimeout(2200);
  mark('idle'); await page.waitForTimeout(3000);
  if (name === 'radio') {
    const has = await d(() => !!document.querySelector('#ridepad .rp-radio') && getComputedStyle(document.querySelector('#ridepad .rp-radio')).display !== 'none');
    report.scenes[name] = { hasRadio: has };
    if (has) {
      for (let i = 0; i < 4; i++) { mark(`radio: ${i === 0 ? 'on' : 'next'}`); await t.tap('#ridepad .rp-radio'); await page.waitForTimeout(5500); report.scenes[name][`station${i}`] = await d(() => window.__dakar.teranga.radio().station ?? null); }
      mark('pulling away with the radio on'); await padDrive(page, t, { fwd: 1, hold: () => page.waitForFunction(() => window.__dakar.teranga.at().z > -10, null, { timeout: 120000 }) });
      mark('horn over the radio'); { const h = await t.centre('#ridepad .rp-horn'); await t.down(6, h.x, h.y); await page.waitForTimeout(900); await t.up(6); }
      await page.waitForTimeout(2000);
      mark('braking'); await padDrive(page, t, { brake: true, hold: () => page.waitForFunction(() => Math.abs(window.__dakar.teranga.at().speed) < 0.2, null, { timeout: 60000 }) });
      mark('radio: off'); for (let i = 0; i < 6 && (await d(() => window.__dakar.teranga.radio().station !== null)); i++) { await t.tap('#ridepad .rp-radio'); await page.waitForTimeout(600); }
      await page.waitForTimeout(2500);
      report.scenes[name].radio = await d(() => window.__dakar.teranga.radio());
    }
  } else {
    mark('full throttle'); await padDrive(page, t, { fwd: 1, boost: name !== 'jakarta', hold: () => page.waitForFunction(([k, s]) => window.__dakar[k].at().speed > s, [S.key, name === 'jakarta' ? 9 : 12], { timeout: 120000 }) });
    mark('cruise'); await padDrive(page, t, { fwd: 0.55, hold: () => page.waitForTimeout(3500) });
    mark('hard brake'); await padDrive(page, t, { brake: true, hold: () => page.waitForFunction(k => Math.abs(window.__dakar[k].at().speed) < 0.2, S.key, { timeout: 60000 }) });
    mark('stopped, nothing near'); await page.waitForTimeout(4000);
    report.scenes[name] = { traffic: await d(k => window.__dakar[k].audio().traffic ?? null, S.key), end: await A() };
  }
  mark('end');
  await stopSound(page, `${out}/raw/${name}.webm`);
  const video = await page.video().path(); await context.close();
  const clap = sync(video, `${out}/raw/${name}.webm`);
  if (clap) {
    mux(video, `${out}/raw/${name}.webm`, clap.offset, `${out}/${name}.mp4`, { from: Math.max(0, clap.offset - 0.3) });
    const lv = loudness(`${out}/${name}.mp4`, 0.25), shift = 0.3 + 1.4;           // the film starts 0.3 s before the clap; the marks start 1.4 s after it
    const seg = (a, b) => { const w = lv.filter(x => x.t >= a + shift && x.t < b + shift); if (!w.length) return null; const rms = Math.sqrt(w.reduce((s, x) => s + 10 ** (x.rmsDb / 10), 0) / w.length); return { peakDb: Math.max(...w.map(x => x.peakDb)), rmsDb: +(10 * Math.log10(rms || 1e-12)).toFixed(1) }; };
    report.scenes[name] = { ...report.scenes[name], marks, levels: marks.slice(0, -1).map(([m, a], i) => ({ moment: m, from: a, to: marks[i + 1][1], ...seg(a, marks[i + 1][1]) })), errors };
    fs.rmSync(video, { force: true });
  } else report.scenes[name] = { ...report.scenes[name], marks, clap: null, errors };
  console.log(name, JSON.stringify(report.scenes[name]).slice(0, 900));
}
await browser.close();
fs.writeFileSync(`${out}/levels.json`, JSON.stringify(report, null, 1));
