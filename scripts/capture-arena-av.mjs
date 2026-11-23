// Films of the arena's sound (docs/audio/ARENA_AND_RADIO.md): one fight evening at Pikine, the page's own sound recorded (scripts/lib/avRecord.mjs: the master
// output after the limiter and the sound setting, lined up with the picture by a clapperboard), cut into one short MP4 per phase, with the loudness of each.
//   gathering    outside, by the gate's drummers and the queue (the street groove, the street's crowd)
//   entrance     on the walkway inside the walls, the wrestlers walking out (the entrance's rhythm, the roused stands)
//   ceremony     the first wrestler's bàkk (the drums change on the bar, claps and « ho ! »)
//   bout         the main event (the bout's lighter rhythm and the tama, the held murmur, a cheer at a clinch or a fall)
//   celebration  the result and the fête (everything at once, the roar, whistles, ululations)
// The same moments are driven on any build with the same debug hooks (a build before the soundscape gives the « before »).
// Headless Chromium + SwiftShader: the game draws a few frames a second here, the sound runs at its own speed; NOT a phone recording.
// Usage: node scripts/capture-arena-av.mjs <baseUrl> <outDir> <label> [scenes=gathering,entrance,ceremony,bout,celebration] [seconds=11]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch } from './lib/realTouch.mjs';
import { startSound, stopSound, loudness } from './lib/avRecord.mjs';

/**
 * The clapperboard (scripts/lib/avRecord.mjs `sync`), with the beep found by its own pitch: the arena is already sounding when the recording starts, so the
 * first loud sample is not the beep. The beep is the first 20 ms where the 880 Hz test tone carries most of the sound.
 */
function sync(video, audio) {
  const W = 8, H = 8, fps = 50;
  const v = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', `fps=${fps},crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 29 });
  let flash = null;
  for (let i = 0; i * W * H * 3 < v.length; i++) { const o = i * W * H * 3, r = v[o], g = v[o + 1], b = v[o + 2]; if (r > 200 && g < 70 && b > 200) { flash = i / fps; break; } }
  const a = execFileSync('ffmpeg', ['-v', 'error', '-i', audio, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const x = new Float32Array(a.buffer.slice(a.byteOffset, a.byteOffset + (a.byteLength & ~3))), n = 160, c = 2 * Math.cos(2 * Math.PI * 880 / 8000);
  let beep = null;
  for (let i = 0; i + n <= x.length && beep === null; i += 40) {
    let s1 = 0, s2 = 0, e = 0;
    for (let j = i; j < i + n; j++) { const s0 = x[j] + c * s1 - s2; s2 = s1; s1 = s0; e += x[j] * x[j]; }
    const tone = (s1 * s1 + s2 * s2 - c * s1 * s2) * 2 / n;                    // power at 880 Hz, comparable to e
    if (e / n > 1e-3 && tone > 0.6 * e) beep = i / 8000;
  }
  return flash === null || beep === null ? null : { flash, beep, offset: +(flash - beep).toFixed(3) };
}

const [base = 'http://127.0.0.1:4671/', outRoot = '/tmp/claude-0/beta/audio/arena-av', label = 'after', list = 'gathering,entrance,ceremony,bout,celebration', secs = '11'] = process.argv.slice(2);
const SECS = Number(secs), WALL_R = 21.7, want = new Set(list.split(','));
const out = `${outRoot}/${label}`;
fs.mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }).then(() => true, () => false);
await page.goto(`${base}?debug&touch&heure=19`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arenaOut && window.__dakar.arena, null, { timeout: 300000 });
const t = await realTouch(page);
await t.tap('#menuBtn'); await page.waitForTimeout(400); await d(() => window.__dakar.phoneClose());      // a first touch: the page may play sound

// a fight evening at Pikine (the next Friday, 19 h), tonight's ticket in the pocket
await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(19); window.__dakar.state.data.wallet = 50000; });
await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.arenaOut().gate);
await d(() => { const x = window.__dakar, td = x.arenaOut().day, fri = td + ((4 - (((td % 7) + 7) % 7)) + 7) % 7; x.arenaOutDay(fri); x.arena.day(fri); });
await until(() => window.__dakar.arenaOut().event);
await d(() => { const a = window.__dakar.arena.info(); if (a) { const c = window.__dakar.state.data.counters; c.arena_ticket_day = a.day; c.arena_ticket_tier = 1; } });
const ao = await d(() => window.__dakar.arenaOut()), g = ao.gate, dr = ao.drums, C = { x: g.x, z: g.z + WALL_R };
const audio = () => d(() => { const a = window.__dakar.arenaOut().audio; return { ...a, sound: a.sound ? { drum: a.sound.playing?.drums, bed: a.sound.playing?.bed, drums: a.sound.drums, bedLevel: a.sound.bedLevel, hearing: a.sound.hearing, decoded: a.sound.bank?.decoded?.length, count: a.sound.count } : null }; });
const isNew = !!(await audio()).sound;
const ready = (loop, bed) => (isNew ? until(([l, b]) => { const s = window.__dakar.arenaOut().audio.sound?.playing; return s && (!l || s.drums === l) && (!b || s.bed === b); }, [loop, bed], 60000) : page.waitForTimeout(2500));

await startSound(page); await page.waitForTimeout(1400); await d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
const t0 = Date.now(), at = () => +((Date.now() - t0) / 1000).toFixed(2), marks = [], states = {};
const sclock = () => d(() => window.__dakar.car.lab().va.bus?.ctx.currentTime ?? null);
/** Two frames drawn: the picture shows the new place before a moment starts (the software renderer draws well under a frame a second on a busy machine). */
const frame = () => d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
const mark = async m => { await frame(); marks.push([m, at(), await sclock()]); states[m] = { audio: await audio(), arena: await d(() => { const i = window.__dakar.arena.info(); return i && { phase: i.phase, t: i.t, crowd: i.crowd?.present, rhythm: i.ceremony?.rhythm ?? null }; }) }; };
/** Waits `s` seconds, noting every second what plays (the loops, the show's phase, its clock and the drums' rhythm): the clips' own evidence. */
const timeline = [];
const hold = async s => {
  const end = Date.now() + s * 1000;
  while (Date.now() < end) {
    timeline.push({ at: at(), ...(await d(() => { const a = window.__dakar.arenaOut().audio, i = window.__dakar.arena.info(); return { drum: a.sound?.playing?.drums ?? (a.playing ? a.rhythm : null), bed: a.sound?.playing?.bed ?? null, phase: i?.phase, t: i?.t, rhythm: a.rhythm, shots: a.sound?.count?.shots ?? null }; })) });
    await page.waitForTimeout(Math.min(1000, Math.max(0, end - Date.now())));
  }
};

if (want.has('gathering')) {
  // in the street before the gate, eight metres from the drummers, looking at them and the queue
  await d(([x, z]) => window.__dakar.place(x, z, 0), [dr.x - 2, dr.z - 8]);
  await d(([x, z, dx, dz]) => window.__dakar.cam([x - 1.5, 2.3, z - 4.5], [dx - 1, 1.2, dz]), [dr.x - 2, dr.z - 8, dr.x, dr.z]);
  await ready('street', 'street');
  await mark('gathering'); await hold(SECS);
}
const inside = async () => {
  // on the walkway inside the walls (the stands behind), looking across the ring
  await d(([x, z]) => window.__dakar.place(x, z, -Math.PI / 2), [C.x + 15.2, C.z + 2]);
  await d(([x, z]) => window.__dakar.cam([x + 16.4, 3.4, z + 3.5], [x, 0.9, z]), [C.x, C.z]);
};
if (want.has('entrance') || want.has('ceremony') || want.has('bout') || want.has('celebration')) {
  await inside();
  await d(() => window.__dakar.arena.go('filling'));
  await until(() => window.__dakar.arena.info().crowd.present > 20, null, 60000);
  await d(() => window.__dakar.arena.go('entrance'));
  await until(() => window.__dakar.arena.info().crowd.present > 80, null, 30000);
}
if (want.has('entrance')) { await ready('entrance', 'hype'); await mark('entrance'); await hold(SECS); }
if (want.has('ceremony')) {
  // the left wrestler's bàkk starts at 6 s of the entrance (5.5 s long): the clock run fast to just before it, then at a pace that keeps the
  // software renderer's few frames a second within the bàkk for the whole clip
  await d(() => window.__dakar.arena.speed(4)); await until(() => window.__dakar.arena.info().t >= 5.85, null, 120000); await d(() => window.__dakar.arena.speed(1));
  await mark('ceremony'); const c0 = await d(() => window.__dakar.arena.info().t), w0 = Date.now();
  await hold(SECS + 2);
  states.ceremony.pace = +(((await d(() => window.__dakar.arena.info().t)) - c0) / ((Date.now() - w0) / 1000)).toFixed(2);   // show seconds per second here
}
if (want.has('bout')) {
  await d(() => window.__dakar.arena.go('bout'));
  await until(() => { const i = window.__dakar.arena.info(); return i.phase === 'bout' && i.bout && i.bout.phase !== 'intro'; }, null, 120000);
  await ready('bout', 'tension');
  await mark('bout'); await hold(SECS);
}
if (want.has('celebration')) {
  await d(() => window.__dakar.arena.speed(6));
  await until(() => ['result', 'leaving', 'over'].includes(window.__dakar.arena.info().phase), null, 300000);
  await d(() => window.__dakar.arena.speed(1));
  await ready('fete', 'roar');
  await mark('celebration'); await hold(SECS);
}
await mark('end');
const beepAt = await d(() => window.__avrec?.beepAt ?? null);
await stopSound(page, `${out}/raw/session.webm`);
const video = await page.video().path(); await context.close(); await browser.close();

const clap = sync(video, `${out}/raw/session.webm`);
const report = { base, label, renderer: 'headless Chromium + SwiftShader (not a phone)', marks, states, timeline, errors, clips: {} };
if (!clap) { console.log('no clapperboard found'); fs.writeFileSync(`${out}/levels.json`, JSON.stringify(report, null, 1)); process.exit(1); }
// the whole session as a film (the sound decides the length; the picture is held on its last frame)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-itsoffset', String(clap.offset), '-i', `${out}/raw/session.webm`, '-map', '0:v', '-map', '1:a', '-ss', String(Math.max(0, clap.offset - 0.3)),
  '-vf', 'tpad=stop_mode=clone:stop_duration=600,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-r', '25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-shortest', '-movflags', '+faststart', `${out}/session.mp4`]);
// the film starts 0.3 s before the picture's flash, which lines up with the beep found `clap.beep` s into the recording: a moment sits at
// clap.beep + 0.3 + (its sound time − the beep's) in the film
const filmAt = (i) => (beepAt !== null && marks[i][2] !== null ? clap.beep + 0.3 + marks[i][2] - beepAt : marks[i][1] + 1.7);
for (let i = 0; i < marks.length - 1; i++) {
  const [name] = marks[i], from = filmAt(i) + 0.4, to = Math.min(filmAt(i + 1), from + SECS + 2), clip = `${out}/${label}-${name}.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', from.toFixed(2), '-to', to.toFixed(2), '-i', `${out}/session.mp4`, '-vf', 'scale=360:-2,fps=15', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '31', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '112k', '-ar', '44100', '-movflags', '+faststart', clip]);
  const lv = loudness(clip, 0.25), power = lv.reduce((s, x) => s + 10 ** (x.rmsDb / 10), 0) / Math.max(1, lv.length);
  report.clips[name] = { file: clip, from: +from.toFixed(2), to: +to.toFixed(2), bytes: fs.statSync(clip).size, peakDb: Math.max(...lv.map(x => x.peakDb)), rmsDb: +(10 * Math.log10(power || 1e-12)).toFixed(1) };
  console.log(name, JSON.stringify(report.clips[name]), JSON.stringify(states[name]?.audio?.sound ?? states[name]?.audio));
}
report.clap = clap; report.beepAt = beepAt;
fs.writeFileSync(`${out}/levels.json`, JSON.stringify(report, null, 1));
if (errors.length) console.log('page errors:', errors.slice(0, 5));
