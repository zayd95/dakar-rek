// Frame-by-frame films of the two in-world activities, for a machine too loaded to play them live (headless SwiftShader at < 1 fps):
// the game is paused and stepped 1/FPS s at a time (`__dakar.pause/step/render`), each frame screenshotted, the inputs are REAL touches (CDP) sent between
// frames, and ffmpeg makes an ordinary MP4 at 25 fps.
//   grill  a Dibi's grill (src/venues/grillPlay.ts): raw brochettes laid, each turned by a touch once its underside is golden (its ring full, « ↻ »), browned,
//          served with « Servir », the customer's word and the card. Soundtrack: the page's own sizzle recipe (src/venues/grillPlay.ts startSizzle/hiss)
//          rendered again here at the logged moments (a stepped page's sound runs on the wall clock, not on the film's).
//   dance  La Vague (src/venues/dancePlay.ts): the two dances of « Danser », touches timed on the music's clock — here the debug virtual clock that the
//          stepped frames advance (`__dakar.vagueVirtual`), as the audio clock does live — a few deliberately off so the grades vary; the crowd round
//          the player, the card. Soundtrack: the game's own music file placed at that clock (the loop from the file's tick, as src/venues/vagueMusic.ts does).
// Usage: node scripts/film-activities.mjs <baseUrl> <outDir> [scenes=grill,dance] [fps=12.5]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4651/', out = '/tmp/claude-0/beta/act', list = 'grill,dance', fpsArg = '12.5'] = process.argv.slice(2);
const FPS = Number(fpsArg), DT = 1 / FPS, SR = 44100;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const report = fs.existsSync(`${out}/film-report.json`) ? JSON.parse(fs.readFileSync(`${out}/film-report.json`, 'utf8')) : {};
const rng = seed => { let a = seed >>> 0; return () => ((a = (Math.imul(a, 1103515245) + 12345) >>> 0) / 4294967296); };

function wav(file, x) {
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

for (const name of list.split(',')) {
  const dir = `${out}/frames-${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const page = await context.newPage(); page.setDefaultTimeout(600000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, ms = 300000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }).then(() => true).catch(() => false);
  const hour = name === 'grill' ? Number(process.env.GRILL_HOUR ?? 18.5) : 23.5;
  await page.goto(`${base}?debug&touch&heure=20&argent=100000`, { timeout: 300000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.venues, null, { timeout: 600000 });
  const t = await realTouch(page);
  await t.tap('#menuBtn'); await page.waitForTimeout(400); await d(() => window.__dakar.phoneClose());
  const hub = name === 'grill' ? 'pikine' : 'almadies', type = name === 'grill' ? 'dibi' : 'club';
  await d(([h, hr]) => { const D = window.__dakar; D.teleport(h); D.setHour(hr); D.state.data.needs.energie = 100; }, [hub, hour]);
  await until(([h, ty]) => window.__dakar.pos().hub === h && window.__dakar.venues().some(v => v.type === ty), [hub, type], 600000);
  const v = await d(ty => window.__dakar.venues().find(x => x.type === ty), type);
  if (name === 'grill') {
    const a = v.anchors.find(x => x.id === 'grill');
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [a.x - Math.sin(v.yaw) * 0.2, a.z - Math.cos(v.yaw) * 0.2, v.yaw]);
    await until(() => /:grill$/.test(window.__dakar.focus()?.id ?? ''), null, 120000);
  } else {
    await d(() => { const D = window.__dakar, c = D.venues().find(x => x.type === 'club'); D.state.data.counters[`club:${c.id}:nuit`] = c.night + 1; });
    await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [v.floor, v.yaw]);
    await until(() => /:floor$/.test(window.__dakar.focus()?.id ?? ''), null, 120000);
  }
  // from here the game only moves when stepped
  const wallet0 = await d(() => window.__dakar.state.wallet);
  await d(() => window.__dakar.pause(true));
  if (name === 'dance') await d(() => window.__dakar.vagueVirtual(0.6));          // the music's clock: the frames' (from 0.6 s into the loop)
  let frame = 0;
  const step = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      await d(dt => { window.__dakar.step(dt, 1); window.__dakar.render(); }, DT);
      await page.screenshot({ path: `${dir}/f${String(frame).padStart(5, '0')}.png` });
      frame++;
    }
  };
  const log = { turns: [], laid: [], cheer: null, marks: [] };
  const mark = m => log.marks.push([m, +(frame / FPS).toFixed(2)]);
  await step(Math.round(FPS * 0.8));
  mark('start'); await t.tap('#act');                                              // « Aider au grill » / « Danser »: a real tap
  const t0 = Date.now();
  if (name === 'grill') {
    let served = false, phase = '';
    const turned = new Set();
    while (frame < FPS * 90) {
      await step();
      const g = await d(() => window.__dakar.gesture());
      log.laid.push(g?.sticks?.filter(s => s.laid && !s.served).length ?? 0);
      // served and paid: the customer's word, the card, the customer leaving with the plate
      if (!g) { if (!(await d(() => !!window.__dakar.activity()))) { mark('paid'); for (let k = 0; k < FPS * 3.2; k++) { await step(); log.laid.push(0); } break; } continue; }
      if (g.phase !== phase) { phase = g.phase; mark(`phase ${phase}`); }
      if (g.phase === 'cook') {
        for (const [i, s] of g.sticks.entries()) if (!turned.has(i) && s.cue === 'turn' && s.x !== null) {
          turned.add(i); log.turns.push(frame / FPS + 0.14); mark(`turn ${i}`);
          await t.down(5, s.x, s.y); await t.up(5);
          break;                                                                    // one touch per frame, like a finger
        }
        if (!served && g.servable && g.sticks.every(s => s.cue === 'done') && g.serve) { served = true; mark('serve'); await t.down(6, g.serve.x, g.serve.y); await t.up(6); }
      }
    }
    report.grill = { served, turned: turned.size };
  } else {
    const R = rng(4242), done = new Set(), sent = [];
    let label = '', cheerAt = null;
    while (frame < FPS * 120) {
      await step();
      const g = await d(() => window.__dakar.gesture());
      if (!g) { if (!(await d(() => !!window.__dakar.activity()))) { cheerAt = frame / FPS; mark('the card, the crowd'); await step(Math.round(FPS * 3.5)); break; } continue; }
      if (g.label && g.label !== label && g.phase !== 'linger') { label = g.label; mark(`dance: ${label}`); }
      for (const c of g.upcoming ?? []) {
        const key = `${g.label}:${c.i}`; if (done.has(key)) continue;
        if (!c.off) c.off = R() < 0.14 ? (R() < 0.5 ? 0.17 : -0.15) : (R() - 0.5) * 0.05;   // seconds: most on time, one in seven well off
        const due = c.beat + c.off / g.beatSec;
        if (g.beat + DT / g.beatSec / 2 < due) continue;
        done.add(key);
        const wrong = R() < 0.04, kind = wrong ? (c.kind === 'L' ? 'R' : 'L') : c.kind;
        sent.push({ kind, beat: +g.beat.toFixed(3), cue: c.beat });
        if (kind === 'L' || kind === 'R') { const x = kind === 'L' ? 95 : 295; await t.down(7, x, 520); await t.up(7); }
        else if (kind === 'up') { await t.down(7, 195, 600); await t.move(7, 195, 470, 2); await t.up(7); }
        else { await t.down(7, 110, 520); await t.move(7, 280, 520, 2); await t.up(7); }
      }
    }
    log.cheer = cheerAt;
    const club = await d(() => window.__dakar.venues().find(x => x.type === 'club'));
    report.dance = { touches: sent.length, sample: sent.slice(0, 12), music: club.music, crowd: { watching: club.crowd.watching, staged: club.crowd.staged, reacting: club.crowd.reacting } };
  }
  mark('end');
  const toast = await d(() => document.getElementById('toast')?.textContent ?? '');
  const wallet1 = await d(() => window.__dakar.state.wallet);
  const counters = await d(() => Object.fromEntries(Object.entries(window.__dakar.state.data.counters).filter(([k]) => /grill|club|danse|shifts/.test(k))));
  await context.close();
  // ---------------------------------------------------------------- the soundtrack
  const seconds = frame / FPS, n = Math.round(seconds * SR), audio = new Float32Array(n);
  if (name === 'grill') {
    // the page's sizzle: a hiss with crackles, louder with each brochette on the coals; a burst on each turn (src/venues/grillPlay.ts)
    const r = rng(9); let last = 0, hp = 0, g = 0;
    for (let i = 0; i < n; i++) {
      const f = Math.min(log.laid.length - 1, Math.floor(i / SR * FPS)), want = Math.min(0.16, 0.035 * (log.laid[Math.max(0, f)] ?? 0));
      g += (want - g) * (1 / (0.3 * SR));
      const crackle = r() < 0.0016 ? (r() * 2 - 1) * 0.9 : 0; last = 0.6 * last + (r() * 2 - 1) * 0.4;
      const x = last * 0.25 + crackle; hp = x - (hp * 0.75 + x * 0.25); audio[i] = hp * g * 1.6;
    }
    for (const tt of log.turns) { const s0 = Math.round(tt * SR), len = Math.round(0.35 * SR); let z = 0; for (let i = 0; i < len && s0 + i < n; i++) { const x = (r() * 2 - 1) * Math.exp(-i / (len * 0.35)); z = x - (z * 0.6 + x * 0.4); audio[s0 + i] += z * 0.12; } }
  } else {
    // the game's music file, placed at the music's clock: loop position (0.6 + film time) mod the loop, from the file's loop start
    const map = fs.readFileSync('src/venues/vagueTrack.ts', 'utf8'), num = k => Number(new RegExp(`${k}: ([\\d.]+)`).exec(map)[1]);
    const loop = num('loop'), loopStart = num('loopStart');
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', 'public/assets/audio/music/la-vague.mp3', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3)));
    // frame k is drawn after k + 1 steps: the music heard then is at 0.6 + (k + 1) / FPS
    for (let i = 0; i < n; i++) { const m = 0.6 + DT + i / SR, p = ((m % loop) + loop) % loop; audio[i] = x[Math.round((loopStart + p) * SR)] * 0.62; }
    if (log.cheer !== null) { const r = rng(3); const s0 = Math.round(log.cheer * SR), len = Math.round(2.4 * SR); let b1 = 0, b2 = 0; for (let i = 0; i < len && s0 + i < n; i++) { const t2 = i / SR, env = Math.min(1, t2 / 0.4) * Math.exp(-Math.max(0, t2 - 0.4) / 0.8); const w = r() * 2 - 1; b1 += 0.12 * (w - b1); b2 += 0.5 * (b1 - b2); audio[s0 + i] += (b1 - b2) * env * 0.9; } }
  }
  wav(`${dir}/sound.wav`, audio);
  const file = `${out}/${name === 'grill' ? 'dibi-grill' : 'la-vague-dance'}.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', `${dir}/f%05d.png`, '-i', `${dir}/sound.wav`, '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.CRF ?? '30',
    '-c:a', 'aac', '-b:a', '112k', '-ar', '48000', '-shortest', '-movflags', '+faststart', file]);
  report[name] = { ...report[name], frames: frame, fps: FPS, seconds: +seconds.toFixed(1), wallMinutes: +((Date.now() - t0) / 60000).toFixed(1), file, bytes: fs.statSync(file).size,
    wallet: { before: wallet0, after: wallet1 }, counters, toast, marks: log.marks, errors: errors.slice(0, 6) };
  console.log(name, JSON.stringify(report[name]).slice(0, 2000));
  fs.writeFileSync(`${out}/film-report.json`, JSON.stringify(report, null, 1));
}
await browser.close();
