// LD2.0-D round 2, lane R2-W: a smooth video of a free swim in the villa's pool, played on a phone page, for the owner. As scripts/video-villa-tour.mjs:
// the game is paused and advanced 1/24 s a frame (`step`), each frame drawn and saved, so the video runs at 24 frames a second whatever the machine
// draws in real time. Every move is the game's own, with a thumb on the joystick (real touches, re-aimed each frame) and the action button: down the
// steps at the west end, a free swim round the pool (along it, across it, into a corner, a turn), the stick let go (treading water), back into the
// stroke, « Sortir de l'eau » at the south wall, « Se baigner » again, a few strokes and up the steps. The scene is set with debug hooks: the villa
// bought and entered, the camera turned once to look along the pool.
// Usage: node scripts/video-villa-swim.mjs <baseUrl> <out.mp4> [hour=10.5] [avatar=femme|homme|v4]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4995/', outFile = '/tmp/claude-0/r2w/villa-swim.mp4', hourArg = '10.5', avatar = 'femme'] = process.argv.slice(2);
const FPS = 24, DT = 1 / FPS, FRAMES = `/tmp/claude-0/r2w/swim-frames-${Date.now()}`, DRY = !!process.env.DRY;   // DRY=1: the moves only, no frames
fs.mkdirSync(FRAMES, { recursive: true });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(([avatar]) => {
  try {
    if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: `g-r2w-video-${avatar}`, avatar: avatar === 'v4' ? null : avatar }));
    localStorage.setItem('dakarrek.quality', 'medium');
  } catch { /* */ }
}, [avatar]);
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let frame = 0;
const log = [];
try {
  await page.goto(`${base}?debug&touch&argent=999000000${avatar === 'v4' ? '&avatar=v4' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio') && window.__dakar.villa, null, { timeout: 300000 });
  // ------------------------------------------------------------------ the scene
  await d(h => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(h); D.teleport('almadies'); }, +hourArg);
  await page.waitForTimeout(2500);
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const G = await d(() => window.__dakar.villa.swim.geometry()), O = G.origin;
  // on the deck at the steps' head, facing the water; the camera along the pool from its south-west corner
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [O.x - 6.55, O.z - 7.8]);
  await d(() => window.__dakar.pause(true));
  await d(dt => window.__dakar.step(dt, 12), DT);
  await d(() => window.__dakar.lookAtPlayer(4, 0.45));
  await d(dt => window.__dakar.step(dt, 12), DT);

  // ------------------------------------------------------------------ the recording: paused, a frame at a time
  const shot = async () => {
    if (DRY) { frame++; return; }
    await d(() => window.__dakar.render());
    await page.screenshot({ path: `${FRAMES}/${String(frame++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 86 });
  };
  const step = async (n = 1) => { for (let i = 0; i < n; i++) { await d(dt => window.__dakar.step(dt, 1), DT); await shot(); } };
  const pos = () => d(() => window.__dakar.pos());
  const info = () => d(() => window.__dakar.villa.swim.info());
  const t = await realTouch(page), joy = await t.centre('#joy');
  /** The thumb held on the stick and pushed (0…1) toward plan (x, z), re-aimed each frame, for `s` seconds or until `done`. */
  const swim = async (x, z, s, { push = 0.8, done = null } = {}) => {
    await t.down(3, joy.x, joy.y);
    for (let i = 0; i < s * FPS; i++) {
      const p = await pos(), a = wrap(Math.atan2(O.x + x - p.x, O.z + z - p.z) - p.cam);
      await t.move(3, joy.x - Math.sin(a) * 50 * push, joy.y - Math.cos(a) * 50 * push, 1);
      await step(1);
      if (done && (await done())) break;
    }
    await t.up(3);
  };
  /** The action button, as a thumb would press it, when the focused action matches. */
  const act = async (re, wait = 3 * FPS) => {
    for (let i = 0; i < wait; i++) { if (new RegExp(re).test((await d(() => window.__dakar.focus()?.primary ?? '')))) { await t.tap('#act'); return true; } await step(1); }
    return false;
  };
  const mark = async what => { const q = await info(); log.push({ what, frame, s: +(frame / FPS).toFixed(1), state: q.state, x: q.x, z: q.z, speed: q.speed }); };
  await step(FPS);
  // down the steps (the thumb pushed toward the water), on into the stroke
  await mark('steps');
  await swim(-1, -7.8, 7, { push: 0.75, done: async () => (await info()).state === 'swim' });
  await swim(2.6, -7.5, 4.5, { push: 0.8 });                     // along the pool, east
  await mark('east');
  await swim(3.6, -9.6, 2.2, { push: 0.95 });                    // into the north-east corner, pushed to the rim
  await swim(-2.5, -8.6, 5.5, { push: 0.8 });                    // back west along the north side
  await mark('west');
  await swim(-1.0, -6.0, 2.4, { push: 0.8 });                    // a turn across the pool
  await swim(1.8, -6.7, 2.6, { push: 0.7 });                     // and east again, calmer, by the south wall
  await mark('let go');
  await step(Math.round(3.2 * FPS));                             // the stick let go: drifting to a stop, treading water
  await mark('tread');
  const out = await act('Sortir de l.eau');                      // out over the south wall
  for (let i = 0; i < 4 * FPS && (await info()).swimming; i++) await step(1);
  await step(Math.round(0.8 * FPS));
  await mark('out');
  const back = await act('Se baigner');                          // and back in, over the edge
  for (let i = 0; i < 2 * FPS && (await info()).state === 'in'; i++) await step(1);
  await step(Math.round(0.6 * FPS));
  await swim(-1.5, -7.6, 3.2, { push: 0.85 });                   // a few strokes west
  await swim(-9, -7.8, 6, { push: 0.85, done: async () => !(await info()).swimming });   // into the steps, up them
  await step(Math.round(1.2 * FPS));
  await mark('end');
  const q = await info();
  console.log(JSON.stringify({ frames: frame, seconds: +(frame / FPS).toFixed(1), out, back, log, swims: q.log, errors: errors.slice(0, 3) }));
} finally {
  await browser.close();
}
if (!DRY) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FRAMES}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', outFile]);
if (!DRY) console.log('video:', outFile, Math.round(fs.statSync(outFile).size / 1000), 'kB');
