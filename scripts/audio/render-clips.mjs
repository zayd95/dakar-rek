// Records what the page really sends to the speaker for the audio review: the car engine, the motorbike engine, the horns, the collisions — one WAV/MP3 each — so the sounds can be listened to
// (on a phone) side by side, build against build. Real-time capture of the page's master output (after the limiter and the sound setting) with MediaRecorder; nothing is simulated.
// Usage: node scripts/audio/render-clips.mjs <baseUrl> <outDir> <label>      (a running build; needs ffmpeg for the MP3s)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { realTouch } from '../lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://localhost:4214/', out = process.argv[3] ?? '/tmp/clips', label = process.argv[4] ?? 'new';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
page.setDefaultTimeout(300000);
await page.goto(`${base}?debug&touch&heure=11`, { timeout: 120000 });
await page.waitForFunction(() => window.__dakar?.car?.lab, null, { timeout: 300000 });
const t = await realTouch(page); await t.down(1, 200, 420); await t.up(1);                // a real tap: the page may play
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__dakar.car.lab().va.beep(); });                      // creates the context
await page.waitForFunction(() => { const i = window.__dakar.car.lab().va.info(); return i.state === 'running' && (!i.samples || i.samples.loaded + i.samples.failed.length >= 8); }, null, { timeout: 60000 }).catch(() => {});
console.log(label, JSON.stringify(await page.evaluate(() => window.__dakar.car.lab().va.info().samples ?? 'synth')));

const clip = async (name, scenario, arg, variant = null) => {
  const b64 = await page.evaluate(async ([scenario, arg, variant]) => {
    const { va, PROFILES, HORNS } = window.__dakar.car.lab();
    if (variant) { const V = { 'car-a': ['sedan', { idle: 'car-idle-a', rev: 'car-rev-a', start: 'start-car', catchAt: 0.8 }], 'car-b': ['sedan', { idle: 'car-idle-b', rev: 'car-rev-b', start: 'start-car', catchAt: 0.8 }], 'moto-a': ['moto', { idle: 'moto-idle-a', rev: 'car-rev-a', start: 'start-moto', catchAt: 0.7 }], 'moto-b': ['moto', { idle: 'moto-idle-b', rev: 'moto-rev-b', start: 'start-moto', catchAt: 0.7 }] }[variant]; if (V) Object.assign(PROFILES[V[0]], V[1]); if (variant === 'horn-b') HORNS.moto.sample = 'horn-moto-b'; if (variant === 'horn-a') HORNS.moto.sample = 'horn-moto-a'; }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const frames = async (seconds, fn) => { const t0 = performance.now(); let last = t0; while (performance.now() - t0 < seconds * 1000) { const now = performance.now(), dt = (now - last) / 1000; last = now; fn((now - t0) / 1000, dt); await sleep(16); } };
    const S = {
      async engine(kit) {
        const prof = PROFILES[kit], vmax = kit === 'moto' ? 16 : 22; let speed = 0, thr = 0;
        const step = (dt) => va.update(dt, speed, vmax, thr);
        const delay = va.start(prof); va.run(prof, delay);
        await frames(delay + 2.2, (_, dt) => step(dt));                                               // idles
        await frames(7, (t, dt) => { thr = 1; speed = Math.min(vmax * 0.97, speed + dt * vmax / 9); step(dt); });   // pulls away through its gears
        await frames(1.2, (_, dt) => { thr = 0.4; step(dt); });                                        // cruises
        await frames(2.2, (_, dt) => { thr = 0; speed = Math.max(0, speed - dt * vmax / 5); step(dt); });  // lifts off and coasts down
        await frames(1.2, (_, dt) => { thr = 0; speed = 0; step(dt); });
        va.stop(); await sleep(700);
      },
      async horn(kits) {
        for (const kit of kits) {
          for (const [on, off] of [[900, 350], [260, 200], [260, 200], [1500, 800]]) { va.hornOn(kit); await sleep(on); va.hornOff(); await sleep(off); }
          await sleep(500);
        }
      },
      async collisions() {
        for (const v of [1.4, 4, 8, 13]) { va.impact(v); await sleep(v > 10 ? 2200 : 1300); }
        await frames(2.6, (t) => va.scrape(0.25 + 0.7 * Math.min(1, t / 2)));
        va.scrapeOff(); await sleep(600);
        va.brake(0.4); await sleep(1100); va.brake(1); await sleep(1500);
      },
    };
    const stream = va.captureStream(); const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 }); const chunks = [];
    mr.ondataavailable = e => chunks.push(e.data); mr.start(); await sleep(200);
    await S[scenario](arg);
    await sleep(300); mr.stop(); await new Promise(r => { mr.onstop = r; });
    const buf = await new Blob(chunks).arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  }, [scenario, arg, variant]);
  const webm = `${out}/${label}-${name}.webm`; fs.writeFileSync(webm, Buffer.from(b64, 'base64'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-ac', '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k', `${out}/${label}-${name}.mp3`]);
  fs.rmSync(webm); console.log('clip', `${label}-${name}.mp3`);
};

const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const jobs = [
  ['1a-car-engine-set-a', 'engine', 'sedan', 'car-a'], ['1b-car-engine-set-b', 'engine', 'sedan', 'car-b'],
  ['2a-jakarta-engine-set-a', 'engine', 'moto', 'moto-a'], ['2b-jakarta-engine-set-b', 'engine', 'moto', 'moto-b'],
  ['3a-horns-jakarta-a', 'horn', ['sedan', 'suv', 'moto'], 'horn-a'], ['3b-horns-jakarta-b', 'horn', ['sedan', 'suv', 'moto'], 'horn-b'],
  ['4-collisions', 'collisions', undefined, null],
];
for (const [n, sc, arg, v] of jobs) if (!only || only.some(o => n.startsWith(o))) await clip(n, sc, arg, v);
await browser.close();
