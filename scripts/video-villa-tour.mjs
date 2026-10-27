// LD2.0-D: a smooth video of the villa played on a phone page, for the owner. The game is paused and advanced 1/24 s per frame (`step`), each frame drawn
// and saved, so the video runs at 24 frames a second whatever the machine draws in real time (a software renderer here). Every move is the game's own:
// a thumb held on the joystick (real touches, re-aimed each frame), the action button for « Entrer chez toi », « Se baigner », « Sortir de l'eau » and
// « Regarder l'hélicoptère ». The scene is set with debug hooks: the villa bought, the « Collection Almadies » laid out as lane V-S's layout
// (src/housing/villaLayout.ts), the Lamane Sport in its bay.
// The tour: the street and the gate → the front door → the salon → the pool deck and a swim → the dining room → up to the first floor → the master suite →
// up to the roof terrace → the helicopter.
// Usage: node scripts/video-villa-tour.mjs <baseUrl> <out.mp4> [hour=10.5]   (a static build of the game, served)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4970/', outFile = 'villa-tour.mp4', hourArg = '10.5'] = process.argv.slice(2);
const FPS = 24, DT = 1 / FPS, FRAMES = `/tmp/claude-0/ld2d/tour-frames-${Date.now()}`;
fs.mkdirSync(FRAMES, { recursive: true });
const src = fs.readFileSync(new URL('../src/housing/villaLayout.ts', import.meta.url), 'utf8');
const LAYOUT = new Function(`return ${src.slice(src.indexOf('= [', src.indexOf('VILLA_ALMADIES_LAYOUT')) + 2, src.lastIndexOf('];') + 1)}`)();
const LOT = { cx: -18, cz: -18 }, P = (x, z) => ({ x: LOT.cx + x, z: LOT.cz + z });
const GATE = { x0: 1.5, x1: 6.5, z: 11 }, GC = P((GATE.x0 + GATE.x1) / 2, GATE.z), DOOR = P(-3, 4.9);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } });
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
let frame = 0;
try {
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  const t = await realTouch(page);
  // ------------------------------------------------------------------ the scene
  await d(h => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(h); D.teleport('almadies'); }, +hourArg);
  await page.waitForTimeout(2500);
  const bought = await d(ids => ids.map(id => window.__dakar.buyPiece(id)?.uid ?? null), LAYOUT.map(p => p.spec));
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await d(() => window.__dakar.placer.open()); await page.waitForTimeout(500);
  await d(uids => { const E = window.__dakar.placer; for (const uid of uids) if (uid) { E.select(uid); E.stash(); } }, bought);
  await d(() => window.__dakar.placer.close()); await page.waitForTimeout(500);
  const refused = await d(([list, uids]) => list.map((p, k) => uids[k] ? window.__dakar.placeAt(uids[k], p.x, p.z, p.rot) : 'not bought').filter(w => w !== null), [LAYOUT, bought]);
  console.log(`furnished: ${LAYOUT.length - refused.length}/${LAYOUT.length}`, refused.length ? JSON.stringify(refused) : '');
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  await d(() => window.__dakar.exit());
  await page.waitForFunction(() => !window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await d(() => window.__dakar.suv.own());
  await page.waitForFunction(() => window.__dakar.suv.info().owned && window.__dakar.suv.info().here, null, { timeout: 30000 }).catch(() => {});
  const bay = (await d(() => window.__dakar.villa.bays()))[0];
  if (bay) await d(b => window.__dakar.suv.place(b.x, b.z, b.yaw), bay);
  await d(([x, z, h]) => { const D = window.__dakar; D.place(x, z, Math.PI); D.setHour(h); }, [GC.x + 0.4, 4.5, +hourArg]);
  await page.waitForTimeout(3000);

  // ------------------------------------------------------------------ the recording: paused, a frame at a time
  await d(() => window.__dakar.pause(true));
  const shot = async () => {
    await d(() => window.__dakar.render());
    await page.screenshot({ path: `${FRAMES}/${String(frame++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 86 });
  };
  const step = async (n = 1) => { for (let i = 0; i < n; i++) { await d(dt => window.__dakar.step(dt, 1), DT); await shot(); } };
  const pos = () => d(() => window.__dakar.pos());
  const joy = await t.centre('#joy');
  /** Walks through the points (world x, z), the thumb held and re-aimed each frame; slows only at the last point. */
  const walk = async (pts, { push = 0.7, tol = 0.35, max = 60 * FPS } = {}) => {
    await t.down(3, joy.x, joy.y);
    let k = 0, n = 0;
    while (k < pts.length && n++ < max) {
      const p = await pos(), [x, z] = pts[k], dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz), last = k === pts.length - 1;
      if (dist < (last ? tol : 0.7)) { k++; continue; }
      const a = wrap(Math.atan2(dx, dz) - p.cam), r = 50 * (last && dist < 1.2 ? Math.max(0.3, push * dist / 1.2) : push);
      await t.move(3, joy.x - Math.sin(a) * r, joy.y - Math.cos(a) * r, 1);
      await step(1);
    }
    await t.up(3); await step(6);
    const p = await pos(), [x, z] = pts[pts.length - 1];
    console.log(`walk to ${x.toFixed(1)},${z.toFixed(1)}: ${k}/${pts.length} points, ${n} frames, ${Math.hypot(x - p.x, z - p.z).toFixed(2)} m off, y ${p.y.toFixed(2)}`);
  };
  const H = (x, z) => [O.x + x, O.z + z];
  /** The action button, as a thumb would press it, when the focused action matches. */
  const act = async (re, wait = 3 * FPS) => {
    for (let i = 0; i < wait; i++) { if (new RegExp(re).test((await d(() => window.__dakar.focus()?.primary ?? '')))) { await t.tap('#act'); return true; } await step(1); }
    return false;
  };
  // the street, the gate sliding open, the front yard, the front door
  await step(FPS);
  await walk([[GC.x, GC.z + 3.6], [GC.x, GC.z - 2.4], [DOOR.x + 1.2, DOOR.z + 1.4], [DOOR.x, DOOR.z + 0.3]], { push: 0.6 });
  const entered = await act('Entrer chez toi');
  for (let i = 0; i < 6 * FPS && !(await d(() => !!window.__dakar.home() && window.__dakar.pos().mode === 'play')); i++) await step(1);
  await step(FPS);
  // the salon, out to the pool deck, a swim
  await walk([H(-3, 1.0), H(-3, -1.5), H(-4.6, -3.6)]); await step(Math.round(1.5 * FPS));
  await walk([H(-4.5, -5.6), H(-1.0, -5.6)]);
  const swam = await act('Se baigner');
  await step(5 * FPS);
  await act('Sortir de l.eau', FPS);
  for (let i = 0; i < 6 * FPS && (await d(() => window.__dakar.villa.swim.info().swimming)); i++) await step(1);
  await step(FPS);
  // the dining room, the hall, up to the first floor, the family lounge and the master suite
  await walk([H(1.7, -5.6), H(1.7, -4.0), H(2.6, -1.6)]); await step(FPS);
  await walk([H(3.4, -3.85), H(5.3, -3.85), H(5.15, -3.0), H(5.15, -0.5), H(5.15, 1.3), H(5.15, 2.3), H(3.6, 2.6), H(-2.4, 3.2)]); await step(FPS);
  await walk([H(-3.6, 0.3), H(-3.6, -1.1), H(-4.4, -2.6)]); await step(Math.round(1.5 * FPS));
  // up to the roof terrace, by the helicopter
  await walk([H(-3.6, 0.4), H(3.6, 2.6), H(6.2, 2.4), H(7.15, 1.9), H(7.15, -0.5), H(7.15, -3.4), H(6.0, -3.9), H(3.6, -3.9), H(0.6, -3.4), H(-1.0, 1.0)]);
  const heli = await act('Regarder l.hélicoptère');
  await step(3 * FPS);
  console.log(JSON.stringify({ frames: frame, seconds: +(frame / FPS).toFixed(1), entered, swam, heli, errors: errors.slice(0, 3) }));
} finally {
  await browser.close();
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FRAMES}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', outFile]);
console.log('video:', outFile, Math.round(fs.statSync(outFile).size / 1000), 'kB');
