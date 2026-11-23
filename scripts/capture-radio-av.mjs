// Films of the car radio (docs/audio/ARENA_AND_RADIO.md), the page's own sound recorded (scripts/lib/avRecord.mjs), real CDP touches on « 📻 » and the horn.
//   standin   the stations pointed at LOCAL STAND-INS served by this script (?debug&radio=…, never the real broadcasts, which this sandbox cannot reach):
//             RFM → a live-like MP3 stream with CORS headers (plays through the game's graph: recorded, ducked by the horn);
//             Sud FM → refused (503: « Sud FM indisponible », silence); Zik FM → a stream WITHOUT CORS headers (the plain-element fallback: it plays,
//             outside the graph, so the recording does not hold it — its state is logged); Rewmi FM → a stream that stops after 4 s and then sends
//             nothing to a reconnection (one reconnection, then « Rewmi FM indisponible »); off. The horn is held over RFM (the debug lab's horn).
//   real      the real station URLs through the sandbox's proxy: stream.zeno.fm answers 302 to the broadcaster's host, which is blocked here, so this
//             shows the real failure path (« RFM indisponible », then the next station, silence, no noise).
// Headless Chromium + SwiftShader; NOT a phone. Usage: node scripts/capture-radio-av.mjs <baseUrl> <outDir> <standin.mp3> [scenes=standin,real]
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { realTouch, boardVehicle } from './lib/realTouch.mjs';
import { startSound, stopSound, loudness } from './lib/avRecord.mjs';

const [base = 'http://127.0.0.1:4671/', out = '/tmp/claude-0/beta/audio/radio-av', standin = '/tmp/claude-0/beta/audio/standin/standin.mp3', list = 'standin,real'] = process.argv.slice(2);
fs.mkdirSync(`${out}/raw`, { recursive: true });
const PORT = 4672, bytes = fs.readFileSync(standin), RATE = 16000;                       // 128 kbit/s

// the stand-in streams: an endless MP3 sent at its own bitrate (an Icecast-like live stream), with or without CORS headers; a refusal; one that stops
const served = []; let rewmiAgain = false;
const server = http.createServer((q, r) => {
  const id = q.url.split('?')[0].split('/').pop(); served.push([Date.now(), id, q.headers.origin ?? null]);
  const cors = id === 'zik' ? {} : { 'access-control-allow-origin': '*' };
  if (id === 'sudfm') { r.writeHead(503, cors); r.end(); return; }
  if (!['rfm', 'zik', 'rewmi'].includes(id)) { r.writeHead(404); r.end(); return; }
  const dead = id === 'rewmi' && rewmiAgain; if (id === 'rewmi') rewmiAgain = true;   // a reconnection to Rewmi gets headers, then nothing
  r.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-cache', ...cors });
  let pos = 0, sent = 0; const t0 = Date.now();
  if (dead) { q.on('close', () => {}); return; }
  r.write(bytes.subarray(0, RATE * 2)); pos = sent = RATE * 2;                            // two seconds up front, as a server's burst
  const tick = setInterval(() => {
    if (id === 'rewmi' && Date.now() - t0 > 4000) return;                                 // the stream stops (the connection stays open)
    const due = RATE * 2 + Math.floor(((Date.now() - t0) / 1000) * RATE) - sent; if (due <= 0) return;
    let chunk = bytes.subarray(pos, pos + due); if (chunk.length < due) { chunk = Buffer.concat([chunk, bytes.subarray(0, due - chunk.length)]); }
    pos = (pos + due) % bytes.length; sent += due; r.write(chunk);
  }, 250);
  q.on('close', () => clearInterval(tick));
});
await new Promise(res => server.listen(PORT, '127.0.0.1', res));

const report = { base, renderer: 'headless Chromium + SwiftShader (not a phone)', scenes: {} };
for (const scene of list.split(',')) {
  const real = scene === 'real';
  // the real scene: HTTPS (the stations) through the sandbox's proxy, the game itself (plain HTTP on 127.0.0.1) direct
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=user-gesture-required',
    ...(real && process.env.HTTPS_PROXY ? [`--proxy-server=https=${process.env.HTTPS_PROXY}`] : [])] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ignoreHTTPSErrors: real, recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } });
  await context.addInitScript(() => {
    try { localStorage.setItem('dakarrek.quality', 'low'); localStorage.removeItem('dakarrek.radio.station'); } catch { /* */ }
    // every toast, as it shows
    window.__toasts = [];
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { const tx = (n.textContent ?? '').trim(); if (tx) window.__toasts.push([performance.now(), tx]); } }).observe(document, { subtree: true, childList: true, characterData: false });
  });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = [], media = []; page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', q => { if (/zeno|surfer|4672/.test(q.url())) media.push(['failed', q.url().slice(0, 80), q.failure()?.errorText]); });
  page.on('response', r => { if (/zeno|surfer|4672/.test(r.url())) media.push([r.status(), r.url().slice(0, 80)]); });
  const d = (fn, a) => page.evaluate(fn, a);
  const q = real ? '' : `&radio=${encodeURIComponent(`http://127.0.0.1:${PORT}/radio/`)}`;
  await page.goto(`${base}?debug&touch&heure=11&argent=4500000${q}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.teranga, null, { timeout: 300000 });
  const t = await realTouch(page);
  await t.tap('#menuBtn'); await page.waitForTimeout(400); await d(() => window.__dakar.phoneClose());
  await page.waitForFunction(() => !window.__dakar.teranga.info().floor || window.__dakar.teranga.info().floor.length > 0 || window.__dakar.teranga.info().price > 0, null, { timeout: 300000 });
  await d(() => window.__dakar.teranga.own());
  await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, { timeout: 300000 });
  await d(() => { window.__dakar.teranga.place(-62.1, -40, 0); window.__dakar.place(-62.1 + 2.4, -40, 0); });
  await page.waitForTimeout(1200);
  await startSound(page); await page.waitForTimeout(1400);
  const t0 = Date.now(), at = () => +((Date.now() - t0) / 1000).toFixed(2), marks = [], log = [];
  const radio = () => d(() => window.__dakar.teranga.radio());
  const mark = async m => marks.push([m, at(), await d(() => window.__dakar.car.lab().va.bus?.ctx.currentTime ?? null), await radio()]);
  const watch = async s => { const end = Date.now() + s * 1000; while (Date.now() < end) { const r = await radio(); log.push({ at: at(), station: r.station, status: r.status, mode: r.mode, streaming: r.streaming, level: +r.level.toFixed(4) }); await page.waitForTimeout(500); } };
  const next = async m => { await mark(m); await t.tap('#ridepad .rp-radio'); };
  await mark('getting in'); await boardVehicle(page, t, 'teranga'); await page.waitForTimeout(2500);
  await mark('idle, radio off'); await watch(3);
  if (!real) {
    await next('RFM (stand-in, CORS: through the graph)'); await watch(7);
    await mark('horn over RFM'); await d(() => window.__dakar.car.lab().va.hornOn('sedan')); await watch(1.5); await d(() => window.__dakar.car.lab().va.hornOff()); await watch(3);
    await next('Sud FM (stand-in refuses: 503)'); await watch(5);
    await next('Zik FM (stand-in without CORS: plain element)'); await watch(7);
    await next('Rewmi FM (stand-in stops after 4 s)'); await watch(34);
    await next('off'); await watch(3);
  } else {
    await next('RFM (real URL)'); await watch(16);
    await next('Sud FM (real URL)'); await watch(16);
    await next('Zik FM (real URL)'); await watch(4);
    await next('Rewmi FM (real URL)'); await watch(4);
    await next('off'); await watch(2);
  }
  await mark('end');
  const toasts = await d(() => window.__toasts.map(([ms, tx]) => tx).filter(tx => tx.includes('📻')));
  const beepAt = await d(() => window.__avrec?.beepAt ?? null);
  await stopSound(page, `${out}/raw/${scene}.webm`);
  const video = await page.video().path(); await context.close(); await browser.close();
  const clap = syncBeep(video, `${out}/raw/${scene}.webm`);
  const film = `${out}/radio-${scene}.mp4`;
  if (clap) {
    const from = Math.max(0, clap.offset - 0.3);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-itsoffset', String(clap.offset), '-i', `${out}/raw/${scene}.webm`, '-map', '0:v', '-map', '1:a', '-ss', String(from),
      '-vf', 'tpad=stop_mode=clone:stop_duration=600,scale=360:-2,fps=15', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-shortest', '-movflags', '+faststart', film]);
    const lv = loudness(film, 0.25), filmAt = i => (beepAt !== null && marks[i][2] !== null ? clap.beep + 0.3 + marks[i][2] - beepAt : marks[i][1] + 1.7);   // the clap sits at clap.beep + 0.3 s in the film
    const levels = marks.slice(0, -1).map(([m], i) => {
      const a = filmAt(i) + 0.6, b = filmAt(i + 1), w = lv.filter(x => x.t >= a && x.t < b); if (!w.length) return { moment: m };
      const p = w.reduce((s, x) => s + 10 ** (x.rmsDb / 10), 0) / w.length;
      return { moment: m, from: +a.toFixed(1), to: +b.toFixed(1), peakDb: Math.max(...w.map(x => x.peakDb)), rmsDb: +(10 * Math.log10(p || 1e-12)).toFixed(1) };
    });
    report.scenes[scene] = { film, bytes: fs.statSync(film).size, levels, toasts, clap, beepAt, marks: marks.map(([m, a, sc, r]) => ({ moment: m, at: a, sound: sc, radio: r && { station: r.station, status: r.status, mode: r.mode, streaming: r.streaming } })), log, media: media.slice(0, 40), errors };
  } else report.scenes[scene] = { clap: null, toasts, log, media, errors };
  console.log(scene, JSON.stringify({ toasts, levels: report.scenes[scene].levels, media: media.slice(0, 8) }, null, 0).slice(0, 2500));
}
report.served = served.map(([ms, id, origin]) => ({ id, origin }));
server.close();
fs.writeFileSync(`${out}/radio.json`, JSON.stringify(report, null, 1));

/** The clapperboard with the beep found by its pitch (as scripts/capture-arena-av.mjs). */
function syncBeep(video, audio) {
  const W = 8, H = 8, fps = 50;
  const v = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', `fps=${fps},crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 29 });
  let flash = null;
  for (let i = 0; i * W * H * 3 < v.length; i++) { const o = i * W * H * 3; if (v[o] > 200 && v[o + 1] < 70 && v[o + 2] > 200) { flash = i / fps; break; } }
  const a = execFileSync('ffmpeg', ['-v', 'error', '-i', audio, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const x = new Float32Array(a.buffer.slice(a.byteOffset, a.byteOffset + (a.byteLength & ~3))), n = 160, c = 2 * Math.cos(2 * Math.PI * 880 / 8000);
  let beep = null;
  for (let i = 0; i + n <= x.length && beep === null; i += 40) {
    let s1 = 0, s2 = 0, e = 0;
    for (let j = i; j < i + n; j++) { const s0 = x[j] + c * s1 - s2; s2 = s1; s1 = s0; e += x[j] * x[j]; }
    if (e / n > 1e-3 && (s1 * s1 + s2 * s2 - c * s1 * s2) * 2 / n > 0.6 * e) beep = i / 8000;
  }
  return flash === null || beep === null ? null : { flash, beep, offset: +(flash - beep).toFixed(3) };
}
