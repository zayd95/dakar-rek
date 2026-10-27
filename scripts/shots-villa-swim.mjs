// LD2.0-D round 2, lane R2-W: the proof's pictures of the free swim (docs/proof/ld2d/r2-swim/), on the built game, paused and stepped (__dakar.step):
//  - the stroke's keys and treading seen from the side, under the water (a camera in the basin: the water's surface is not drawn from below), for each
//    body the player can have (the two Meshy bodies, the shared v4 rig): stroke-side-<body>.jpg;
//  - the same keys from the game's own camera (stroke-game.jpg), and the swim as played with the joystick: swimming, treading, in down the steps and
//    by « Se baigner », out over the wall and up the steps, by day (10 h 30) and at 21 h (swim-<what>-<hour>.png).
// Usage: node scripts/shots-villa-swim.mjs <baseUrl=http://127.0.0.1:4995/> [outDir=docs/proof/ld2d/r2-swim]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4995/', OUT = 'docs/proof/ld2d/r2-swim'] = process.argv.slice(2);
const TMP = `/tmp/claude-0/r2w/shots-${Date.now()}`;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const DT = 1 / 30;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const STROKE = [[0, 'glisse'], [0.2, 'écart des bras'], [0.4, 'respiration'], [0.58, 'mains sous le menton, talons remontés'], [0.74, 'ciseau des jambes'], [0.88, 'jambes jointes']];
const TREAD = [[0, 'genou gauche'], [0.25, 'mains écartées'], [0.5, 'genou droit'], [0.75, 'mains devant']];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const errors = [];

/** A phone page in the player's villa with `avatar`'s body, paused. */
async function open(avatar) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([avatar]) => {
    try {
      if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: `g-r2w-shots-${avatar}`, avatar: avatar === 'v4' ? null : avatar }));
      localStorage.setItem('dakarrek.quality', 'medium');
    } catch { /* */ }
  }, [avatar]);
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push(`${avatar}: ${e.message}`));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=999000000${avatar === 'v4' ? '&avatar=v4' : ''}`, { waitUntil: 'load' });   // (?avatar=v4: the shared rig's own body)
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio') && window.__dakar.villa, null, { timeout: 300000 });
  await d(() => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(10.5); D.teleport('almadies'); });
  await page.waitForTimeout(2500);
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const G = await d(() => window.__dakar.villa.swim.geometry());
  await d(() => window.__dakar.pause(true));
  const step = n => d(([dt, n]) => window.__dakar.step(dt, n), [DT, n]);
  const body = await d(() => window.__dakar.avatar().body);
  return { ctx, page, d, step, G, O: G.origin, body };
}
/** A screenshot of the frame as drawn now (the HUD hidden for the side views), cropped. */
async function grab(P, file, crop = null, hud = true) {
  await P.d(on => { document.getElementById('ui')?.style.setProperty('visibility', on ? 'visible' : 'hidden'); window.__dakar.render(); }, hud);
  const buf = await P.page.screenshot(crop ? { clip: crop } : {});
  fs.writeFileSync(file, buf);
  await P.d(() => document.getElementById('ui')?.style.setProperty('visibility', 'visible'));
}
/** A PNG for the repository, under 400 kB. */
async function keep(src, name) {
  let png = await sharp(src).png({ compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(png).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(`${OUT}/${name}`, png);
}
const sheet = (files, out, tile, labels) => execFileSync('montage', [...files.flatMap((f, i) => ['-label', labels[i], f]), '-tile', tile, '-geometry', '+6+6', '-pointsize', '15', '-background', '#f4efe6', '-quality', '86', out]);

// ------------------------------------------------------------------ the keys from the side, under the water, each body
for (const avatar of ['femme', 'homme', 'v4']) {
  const P = await open(avatar);
  await P.page.setViewportSize({ width: 720, height: 420 }); await P.step(10);
  // the swimmer heading east in the middle of the basin, held at each key; the camera low in the basin by its north wall, looking across
  const sx = 0.2, sz = -7.15;
  await P.d(([x, z]) => window.__dakar.villa.swim.at(x, z, Math.PI / 2), [sx, sz]); await P.step(20);
  const cam = () => P.d(([O, x, z]) => window.__dakar.cam([O.x + x, -0.68, O.z - 9.47], [O.x + x, -0.78, O.z + z]), [P.O, sx, sz]);
  const files = [], labels = [];
  for (const [clip, keys] of [['Swim', STROKE], ['Tread', TREAD]]) {
    for (const [ph, label] of keys) {
      await P.d(([c, p]) => window.__dakar.villa.swim.hold(c, p), [clip, ph]); await P.step(18); await cam();
      const f = `${TMP}/side-${avatar}-${clip}-${ph}.png`;
      await grab(P, f, { x: 70, y: 40, width: 580, height: 330 }, false);
      files.push(f); labels.push(`${clip === 'Swim' ? 'Brasse' : 'Sur place'} ${Math.round(ph * 100)} %% · ${label}`);
    }
  }
  await P.d(() => window.__dakar.villa.swim.hold(null)); await P.d(() => window.__dakar.cam(null));
  sheet(files, `${OUT}/stroke-side-${P.body}.jpg`, '4x3', labels);
  console.log('side keys', avatar, P.body);
  if (avatar !== 'femme') { await P.ctx.close(); continue; }

  // ------------------------------------------------------------------ the same keys from the game's camera (the default body)
  await P.page.setViewportSize({ width: 390, height: 844 }); await P.step(10);
  await P.d(([x, z]) => window.__dakar.villa.swim.at(x, z, Math.PI / 2), [0.5, -7.8]); await P.step(10);
  await P.d(() => window.__dakar.lookAtPlayer(4, -0.5)); await P.step(30);
  const gfiles = [], glabels = [];
  for (const [ph, label] of STROKE) {
    await P.d(p => window.__dakar.villa.swim.hold('Swim', p), ph); await P.step(18);
    const f = `${TMP}/game-${ph}.png`; await grab(P, f, { x: 45, y: 300, width: 300, height: 300 }, false);
    gfiles.push(f); glabels.push(`${Math.round(ph * 100)} %% · ${label}`);
  }
  await P.d(() => window.__dakar.villa.swim.hold(null));
  sheet(gfiles, `${OUT}/stroke-game.jpg`, '3x2', glabels);
  console.log('game keys');

  // ------------------------------------------------------------------ played with the joystick, by day and at 21 h
  const t = await realTouch(P.page), joy = await t.centre('#joy');
  const info = () => P.d(() => window.__dakar.villa.swim.info());
  const aim = async (x, z, push = 0.85) => { const p = await P.d(() => window.__dakar.pos()); const a = wrap(Math.atan2(P.O.x + x - p.x, P.O.z + z - p.z) - p.cam); await t.move(3, joy.x - Math.sin(a) * 50 * push, joy.y - Math.cos(a) * 50 * push, 1); };
  const shotNow = async name => { const f = `${TMP}/${name}`; await grab(P, f); await keep(f, name); };
  for (const hour of [10.5, 21]) {
    const tag = hour === 21 ? '21h' : '10h30';
    await P.d(h => window.__dakar.setHour(h), hour);
    // out first (the debug swimmer above), then in down the steps
    await P.d(() => window.__dakar.villa.swim.stop()); for (let i = 0; i < 90 && (await info()).swimming; i++) await P.step(2);
    await P.d(([x, z]) => window.__dakar.place(x, z, Math.PI / 2), [P.O.x - 6.8, P.O.z - 7.8]); await P.step(15);
    await P.d(() => window.__dakar.lookAtPlayer(4, -2.3)); await P.step(10);
    await t.down(3, joy.x, joy.y); await aim(-3, -7.8, 0.7);
    for (let i = 0; i < 120; i++) { await P.step(1); const q = await info(); if (q.how === 'steps' && q.y < -0.45) break; }
    await t.up(3); await shotNow(`swim-in-steps-${tag}.png`);
    for (let i = 0; i < 90 && (await info()).state === 'in'; i++) await P.step(2);
    // swimming east along the pool, the thumb pushed
    await P.d(() => window.__dakar.lookAtPlayer(4, -0.6)); await P.step(2);
    await t.down(3, joy.x, joy.y);
    for (let i = 0; i < 70; i++) { await aim(3.5, -7.8); await P.step(2); }
    await shotNow(`swim-stroke-${tag}.png`);
    await t.up(3);
    // let go: treading
    for (let i = 0; i < 50; i++) await P.step(2);
    await shotNow(`swim-tread-${tag}.png`);
    // out over the south wall
    await t.down(3, joy.x, joy.y); for (let i = 0; i < 30; i++) { await aim(2, -6.3, 0.6); await P.step(2); } await t.up(3); await P.step(20);
    await P.d(() => window.__dakar.villa.swim.stop());
    for (let i = 0; i < 120; i++) { await P.step(1); const q = await info(); if (q.clip === 'SwimClimb' && q.y > -0.95) break; }
    await P.step(5); await shotNow(`swim-out-climb-${tag}.png`);
    for (let i = 0; i < 90 && (await info()).swimming; i++) await P.step(2);
    await P.step(10);
    // « Se baigner » from the deck: the slip in
    await P.d(() => window.__dakar.villa.swim.start());
    for (let i = 0; i < 60; i++) { await P.step(1); const q = await info(); if (q.how === 'slide' && q.y < -0.25) break; }
    await shotNow(`swim-in-slide-${tag}.png`);
    for (let i = 0; i < 60 && (await info()).state === 'in'; i++) await P.step(2);
    // up the steps
    await P.d(() => window.__dakar.lookAtPlayer(4, 0.6)); await P.step(2);
    await t.down(3, joy.x, joy.y);
    for (let i = 0; i < 260; i++) { await aim(-8, -7.8, 0.9); await P.step(1); const q = await info(); if (q.state === 'out' && q.y > -0.75) break; }
    await t.up(3); await P.step(4); await shotNow(`swim-out-steps-${tag}.png`);
    for (let i = 0; i < 120 && (await info()).swimming; i++) await P.step(2);
    console.log('played', tag, JSON.stringify((await info()).log));
  }
  const perf = await P.d(async () => { const D = window.__dakar; D.render(); return { calls: D.drawCalls(), tris: D.tris() }; });
  console.log('perf on the deck', JSON.stringify(perf));
  await P.ctx.close();
}
await browser.close();
console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(' | ')}` : 'no page errors');
