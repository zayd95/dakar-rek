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
import { execFileSync } from 'node:child_process';
import { startSound, stopSound, sync, loudness } from './lib/avRecord.mjs';

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
  // each moment on the wall clock and on the page's sound clock: headless Chromium without a sound card runs its sound clock slower than the wall clock,
  // and the recording holds the sound as that clock made it, so the moments are found in the film by the sound's own clock
  const sclock = () => d(() => window.__dakar.car.lab().va.bus?.ctx.currentTime ?? null);
  const mark = async m => marks.push([m, at(), await sclock()]);
  const A = () => d(k => window.__dakar[k].at(), S.key);
  await mark('getting on / in'); await boardVehicle(page, t, S.key); await page.waitForTimeout(2200);
  await mark('idle'); await page.waitForTimeout(3000);
  if (name === 'radio') {
    const has = await d(() => !!document.querySelector('#ridepad .rp-radio') && getComputedStyle(document.querySelector('#ridepad .rp-radio')).display !== 'none');
    report.scenes[name] = { hasRadio: has };
    if (has) {
      for (let i = 0; i < 4; i++) { await mark(`radio: ${i === 0 ? 'on' : 'next'}`); await t.tap('#ridepad .rp-radio'); await page.waitForTimeout(5500); report.scenes[name][`station${i}`] = await d(() => window.__dakar.teranga.radio().station ?? null); }
      await mark('pulling away with the radio on'); await padDrive(page, t, { fwd: 1, hold: () => page.waitForFunction(() => window.__dakar.teranga.at().z > -10, null, { timeout: 120000 }) });
      await mark('horn over the radio'); { const h = await t.centre('#ridepad .rp-horn'); await t.down(6, h.x, h.y); await page.waitForTimeout(900); await t.up(6); }
      await page.waitForTimeout(2000);
      await mark('braking'); await padDrive(page, t, { brake: true, hold: () => page.waitForFunction(() => Math.abs(window.__dakar.teranga.at().speed) < 0.2, null, { timeout: 60000 }) });
      await mark('radio: off'); for (let i = 0; i < 6 && (await d(() => window.__dakar.teranga.radio().station !== null)); i++) { await t.tap('#ridepad .rp-radio'); await page.waitForTimeout(600); }
      await page.waitForTimeout(2500);
      report.scenes[name].radio = await d(() => window.__dakar.teranga.radio());
    }
  } else {
    await mark('full throttle'); await padDrive(page, t, { fwd: 1, boost: name !== 'jakarta', hold: () => page.waitForFunction(([k, s]) => window.__dakar[k].at().speed > s, [S.key, name === 'jakarta' ? 9 : 12], { timeout: 120000 }) });
    await mark('cruise'); await padDrive(page, t, { fwd: 0.55, hold: () => page.waitForTimeout(3500) });
    await mark('hard brake'); await padDrive(page, t, { brake: true, hold: () => page.waitForFunction(k => Math.abs(window.__dakar[k].at().speed) < 0.2, S.key, { timeout: 60000 }) });
    await mark('stopped, nothing near'); await page.waitForTimeout(4000);
    report.scenes[name] = { traffic: await d(k => window.__dakar[k].audio().traffic ?? null, S.key), end: await A() };
  }
  await mark('end');
  const wall = at() + 1.4, beepAt = await d(() => window.__avrec?.beepAt ?? null);
  await stopSound(page, `${out}/raw/${name}.webm`);
  // an overloaded machine starves the page's sound thread: the recording then holds less sound than the clock ran, and the moments no longer line up
  const heard = execFileSync('ffmpeg', ['-v', 'error', '-i', `${out}/raw/${name}.webm`, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }).byteLength / 32000;
  const m0 = marks[0], mN = marks[marks.length - 1], rate = m0[2] !== null && mN[2] !== null ? +((mN[2] - m0[2]) / Math.max(0.001, mN[1] - m0[1])).toFixed(3) : null;
  const sound = { recorded: +heard.toFixed(1), clock: +wall.toFixed(1), complete: heard > wall * 0.95, soundClockRate: rate, measuredOn: beepAt !== null && rate !== null ? 'the sound clock' : 'the wall clock' };
  if (!sound.complete) console.log(`${name}: ${sound.recorded} s of sound for ${sound.clock} s of wall clock (the page's sound clock ran at ${rate}× the wall clock): moments measured on ${sound.measuredOn}`);
  const video = await page.video().path(); await context.close();
  const clap = sync(video, `${out}/raw/${name}.webm`);
  if (clap) {
    // the sound decides the length: the software renderer records fewer frames than the clock, so the picture is held on its last frame rather than the sound cut short
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-itsoffset', String(clap.offset), '-i', `${out}/raw/${name}.webm`, '-map', '0:v', '-map', '1:a', '-ss', String(Math.max(0, clap.offset - 0.3)),
      '-vf', 'tpad=stop_mode=clone:stop_duration=600,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-r', '25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-shortest', '-movflags', '+faststart', `${out}/${name}.mp4`]);
    const lv = loudness(`${out}/${name}.mp4`, 0.25), shift = 0.3 + 1.4;           // the film starts 0.3 s before the clap; the marks start 1.4 s after it
    const seg = (a, b) => { const w = lv.filter(x => x.t >= a + shift && x.t < b + shift); if (!w.length) return null; const power = w.reduce((s, x) => s + 10 ** (x.rmsDb / 10), 0) / w.length; return { peakDb: Math.max(...w.map(x => x.peakDb)), rmsDb: +(10 * Math.log10(power || 1e-12)).toFixed(1) }; };   // the mean power of the windows, in dBFS
    report.scenes[name] = { ...report.scenes[name], sound, marks, levels: marks.slice(0, -1).map(([m, a, sa], i) => {
      // on the sound clock: the film's sound starts 0.3 s before the clap's beep, so a moment sits at 0.3 + (its sound time − the beep's)
      if (beepAt !== null && sa !== null && marks[i + 1][2] !== null) { const f = 0.3 + sa - beepAt, t2 = 0.3 + marks[i + 1][2] - beepAt; return { moment: m, from: +f.toFixed(2), to: +t2.toFixed(2), ...seg(f - shift, t2 - shift) }; }
      return { moment: m, from: a, to: marks[i + 1][1], ...seg(a, marks[i + 1][1]) };
    }), errors };
  } else report.scenes[name] = { ...report.scenes[name], sound, marks, clap: null, errors };
  console.log(name, JSON.stringify(report.scenes[name]).slice(0, 900));
}
await browser.close();
fs.writeFileSync(`${out}/levels.json`, JSON.stringify(report, null, 1));
