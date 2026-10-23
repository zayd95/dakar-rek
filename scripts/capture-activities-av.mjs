// Films of the two in-world activities with the page's own sound (scripts/lib/avRecord.mjs: the master output, lined up with the picture by a clapperboard):
//   grill  a Dibi's grill (src/venues/grillPlay.ts): raw brochettes laid on the coals, each turned by a real touch once its underside is golden, served, the customer's word and the card
//   dance  La Vague's floor (src/venues/dancePlay.ts): the club's music (src/venues/vagueMusic.ts), the two dances of « Danser » played by real touches timed on the page's own
//          music clock (a few deliberately off: the grades vary), the crowd round the player, the card
// Real CDP touches (scripts/lib/realTouch.mjs) for « Aider au grill » / « Danser », the brochettes, « Servir », the step pads and the swipes; debug hooks only to get there
// (the hub, the hour, the club's entry paid) and to read where things are on screen. Headless Chromium + SwiftShader: slower frames than a phone, NOT a phone recording.
// Usage: node scripts/capture-activities-av.mjs <baseUrl> <outDir> [scenes=grill,dance] [quality=medium]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch } from './lib/realTouch.mjs';
import { startSound, stopSound, sync, loudness } from './lib/avRecord.mjs';

const [base = 'http://127.0.0.1:4651/', out = '/tmp/claude-0/beta/act', list = 'grill,dance', quality = 'medium'] = process.argv.slice(2);
fs.mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const report = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const name of list.split(',')) {
  const hour = name === 'grill' ? Number(process.env.GRILL_HOUR ?? 18.5) : 23.5;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } });
  await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms, polling: 200 }).then(() => true).catch(() => false);
  await page.goto(`${base}?debug&touch&heure=20&argent=100000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.venues && window.__dakar.car, null, { timeout: 300000 });
  const t = await realTouch(page);
  await t.tap('#menuBtn'); await page.waitForTimeout(400); await d(() => window.__dakar.phoneClose());     // a first touch: the page may play sound
  const hub = name === 'grill' ? 'pikine' : 'almadies', type = name === 'grill' ? 'dibi' : 'club';
  await d(([h, hr]) => { const D = window.__dakar; D.teleport(h); D.setHour(hr); D.state.data.needs.energie = 100; }, [hub, hour]);
  await until(([h, ty]) => window.__dakar.pos().hub === h && window.__dakar.venues().some(v => v.type === ty), [hub, type], 300000);
  const v = await d(ty => window.__dakar.venues().find(x => x.type === ty), type);
  const shots = [];
  const shot = async label => { const f = `${out}/${name}-${label}.png`; try { await page.screenshot({ path: f, timeout: 120000 }); shots.push(f); } catch { /* a capture never fails the run */ } };
  const info = () => d(() => window.__dakar.gesture());

  if (name === 'grill') {
    const a = v.anchors.find(x => x.id === 'grill');
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [a.x - Math.sin(v.yaw) * 0.2, a.z - Math.cos(v.yaw) * 0.2, v.yaw]);
    await until(() => /:grill$/.test(window.__dakar.focus()?.id ?? ''), null, 60000);
  } else {
    await d(() => { const D = window.__dakar, c = D.venues().find(x => x.type === 'club'); D.state.data.counters[`club:${c.id}:nuit`] = c.night + 1; });   // the entry paid tonight
    await d(([p, y]) => window.__dakar.place(p.x, p.z, y), [v.floor, v.yaw]);
    await until(() => /:floor$/.test(window.__dakar.focus()?.id ?? ''), null, 60000);
    await until(() => window.__dakar.venues().find(x => x.type === 'club').music.playing, null, 60000);
    await page.waitForTimeout(2500);
  }
  const wallet0 = await d(() => window.__dakar.state.wallet);
  await startSound(page); await page.waitForTimeout(1400);
  const t0 = Date.now(), marks = [], mark = m => marks.push([m, +((Date.now() - t0) / 1000).toFixed(2)]);
  mark('start'); await t.tap('#act');                                              // « Aider au grill » / « Danser »: a real tap on the action button
  await until(() => window.__dakar.gesture()?.inWorld, null, 60000);

  if (name === 'grill') {
    mark('raw brochettes laid'); await page.waitForTimeout(1500); await shot('1-raw');
    let turned = new Set(), served = false, browned = false;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const g = await info(); if (!g || g.phase === 'linger' || g.phase === 'over') break;
      if (g.phase === 'cook') {
        // the first brochette is turned only once its underside is golden (the cue says « ↻ »); the others the same
        for (const [i, s] of g.sticks.entries()) if (!turned.has(i) && s.cue === 'turn' && s.x !== null) {
          if (!browned) { browned = true; mark('undersides golden: turning'); await shot('2-browned'); }
          turned.add(i); await t.down(5, s.x, s.y); await sleep(70); await t.up(5); await page.waitForTimeout(250);
        }
        if (turned.size === g.sticks.length && !report.turnedShot) { report.turnedShot = true; await page.waitForTimeout(600); mark('all turned'); await shot('3-turned'); }
        if (g.servable && g.sticks.every(s => s.cue === 'done') && g.serve && !served) {
          served = true; mark('served'); await shot('4-ready');
          await t.down(6, g.serve.x, g.serve.y); await sleep(80); await t.up(6);
        }
      }
      await page.waitForTimeout(150);
    }
    mark('customer and card'); await page.waitForTimeout(400); await shot('5-feedback');
    await until(() => !window.__dakar.activity(), null, 60000);
    await page.waitForTimeout(2500);
    report.grill = { served, turned: turned.size, end: await d(() => window.__dakar.venues().find(x => x.type === 'dibi').grillPlay) };
  } else {
    // the dance: touches timed from the page's own music clock (epoch of a beat → epoch of each cue), a few off on purpose
    const scheduled = new Set(), plan = [];
    let shotsTaken = 0, lastPhase = '', perf = 0;
    const R = (() => { let a = 12345; return () => ((a = (a * 1103515245 + 12345) >>> 0) / 4294967296); })();
    const deadline = Date.now() + 240000;
    let steps = 0;
    while (Date.now() < deadline) {
      const g = await info();
      if (!g) break;
      if (g.phase === 'linger' && !(await d(() => !!window.__dakar.activity()))) break;
      if (g.label !== lastPhase && g.phase !== 'linger') { lastPhase = g.label; steps++; mark(`dance: ${g.label}`); }
      for (const c of g.upcoming ?? []) {
        const key = `${g.label}:${c.i}`; if (scheduled.has(key)) continue;
        scheduled.add(key); perf++;
        const off = R() < 0.12 ? (R() < 0.5 ? 0.17 : -0.16) : (R() - 0.5) * 0.08;      // most within 40 ms, one in eight well off
        const wrong = R() < 0.04, kind = wrong ? (c.kind === 'L' ? 'R' : 'L') : c.kind;
        const at = g.epoch + (c.beat - g.beat) * g.beatSec * 1000 + off * 1000;
        plan.push({ at, kind, beat: c.beat });
      }
      // fire what is due in the next 120 ms (CDP touches carry their own timestamps: when they are sent)
      const now = Date.now();
      for (const p of plan.filter(p => !p.done && p.at - now < 140).sort((a, b) => a.at - b.at)) {
        p.done = true;
        const wait = p.at - Date.now() - 4; if (wait > 0) await sleep(wait);
        if (p.kind === 'L' || p.kind === 'R') { const x = p.kind === 'L' ? 95 : 295; await t.down(7, x, 520); await t.up(7); }
        else if (p.kind === 'up') { await t.down(7, 195, 600); await t.move(7, 195, 470, 2); await t.up(7); }
        else { await t.down(7, 110, 520); await t.move(7, 280, 520, 2); await t.up(7); }
      }
      if (g.phase === 'dance' && shotsTaken < 6 && Date.now() - t0 > 6000 + shotsTaken * 6000) { shotsTaken++; await shot(`move-${shotsTaken}`); }
      await sleep(40);
    }
    mark('the card, the crowd'); await page.waitForTimeout(300); await shot('card');
    await page.waitForTimeout(3500);
    const club = await d(() => window.__dakar.venues().find(x => x.type === 'club'));
    report.dance = { steps, touches: perf, music: club.music, dance: club.dance, crowd: { watching: club.crowd.watching, reacting: club.crowd.reacting } };
  }
  mark('end');
  report[name] = { ...(report[name] ?? {}), wallet: { before: wallet0, after: await d(() => window.__dakar.state.wallet) }, toast: await d(() => document.getElementById('toast')?.textContent ?? ''), marks, errors: errors.slice(0, 6), shots };
  await stopSound(page, `${out}/raw/${name}.webm`);
  const video = await page.video().path(); await context.close();
  const clap = sync(video, `${out}/raw/${name}.webm`);
  if (clap) {
    const file = `${out}/${name === 'grill' ? 'dibi-grill' : 'la-vague-dance'}.mp4`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-itsoffset', String(clap.offset), '-i', `${out}/raw/${name}.webm`, '-map', '0:v', '-map', '1:a', '-ss', String(Math.max(0, clap.offset + 0.6)),
      '-vf', 'tpad=stop_mode=clone:stop_duration=600,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-r', '25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', process.env.CRF ?? '30', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-shortest', '-movflags', '+faststart', file]);
    const lv = loudness(file, 1);
    report[name].film = { file, bytes: fs.statSync(file).size, seconds: lv.length, loudness: lv.map(x => x.rmsDb) };
  } else report[name].film = null;
  console.log(name, JSON.stringify(report[name]).slice(0, 1500));
}
await browser.close();
fs.writeFileSync(`${out}/activities-report.json`, JSON.stringify(report, null, 1));
