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
const FPS = 24, DT = 1 / FPS, FRAMES = `/tmp/claude-0/ld2d/tour-frames-${Date.now()}`, DRY = !!process.env.DRY;   // DRY=1: the route only, no frames
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
  const bays = await d(() => window.__dakar.villa.bays()), bay = bays[1] ?? bays[0];     // the bay on the right: the way from the gate to the door passes the left one
  if (bay) await d(b => window.__dakar.suv.place(b.x, b.z, b.yaw), bay);
  await d(([x, z, h]) => { const D = window.__dakar; D.place(x, z, Math.PI); D.setHour(h); }, [GC.x + 0.4, 4.5, +hourArg]);
  await page.waitForTimeout(3000);

  // ------------------------------------------------------------------ the recording: paused, a frame at a time
  await d(() => window.__dakar.pause(true));
  const shot = async () => {
    if (DRY) { frame++; return; }
    await d(() => window.__dakar.render());
    await page.screenshot({ path: `${FRAMES}/${String(frame++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 86 });
  };
  const step = async (n = 1) => { for (let i = 0; i < n; i++) { await d(dt => window.__dakar.step(dt, 1), DT); await shot(); } };
  const pos = () => d(() => window.__dakar.pos());
  const joy = await t.centre('#joy');
  /** Walks through the points (world x, z), the thumb held and re-aimed each frame; slows only at the last point. */
  const walk = async (pts, { push = 0.7, tol = 0.35, mid = 0.7, max = 60 * FPS } = {}) => {
    await t.down(3, joy.x, joy.y);
    let k = 0, n = 0, still = 0, was = await pos();
    while (k < pts.length && n++ < max) {
      const p = await pos(), [x, z] = pts[k], dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz), last = k === pts.length - 1;
      still = Math.hypot(p.x - was.x, p.z - was.z) < 0.01 ? still + 1 : 0; was = p;
      if (still > FPS) { console.log(`stuck at ${p.x.toFixed(2)},${p.z.toFixed(2)} on the way to ${x.toFixed(1)},${z.toFixed(1)}`); break; }   // a second without moving: on to the next leg
      if (dist < (last ? tol : mid)) { k++; continue; }
      const a = wrap(Math.atan2(dx, dz) - p.cam), r = 50 * (last && dist < 1.2 ? Math.max(0.3, push * dist / 1.2) : push);
      await t.move(3, joy.x - Math.sin(a) * r, joy.y - Math.cos(a) * r, 1);
      await step(1);
    }
    await t.up(3); await step(6);
    const p = await pos(), [x, z] = pts[pts.length - 1];
    console.log(`walk to ${x.toFixed(1)},${z.toFixed(1)}: ${k}/${pts.length} points, ${n} frames, ${Math.hypot(x - p.x, z - p.z).toFixed(2)} m off, y ${p.y.toFixed(2)}`);
  };
  const H = (x, z) => [O.x + x, O.z + z];
  /**
   * A way through the furnished house to (x, z) on the player's floor: a grid search round the interior's colliders (__dakar.roomGeometry), those of
   * the player's height band as the game counts them (src/world/types.ts inBand), the game's body radius indoors (0.3 m, src/main.ts) off each, then the corners kept where the line
   * of sight breaks. Null when there is none.
   */
  let geo = null;
  const plan = (from, to, feet, R = 0.31, G = 0.1) => {
    const cols = geo.colliders.filter(c => c[5] === null || (feet + 1.6 > c[5] && feet < c[4] - 0.25)), b = geo.bounds;
    const free = (x, z) => x > b.x0 + R && x < b.x1 - R && z > b.z0 + R && z < b.z1 - R && !cols.some(c => x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R);
    const nx = Math.ceil((b.x1 - b.x0) / G), nz = Math.ceil((b.z1 - b.z0) / G), cell = (x, z) => [Math.round((x - b.x0) / G), Math.round((z - b.z0) / G)];
    const at = (i, j) => [b.x0 + i * G, b.z0 + j * G], ok = new Map(), isFree = (i, j) => { const k = i * nz + j; if (!ok.has(k)) ok.set(k, i >= 0 && j >= 0 && i < nx && j < nz && free(...at(i, j))); return ok.get(k); };
    let [gi, gj] = cell(to[0], to[1]);
    if (!isFree(gi, gj)) { let best = null; for (let di = -7; di <= 7; di++) for (let dj = -7; dj <= 7; dj++) if (isFree(gi + di, gj + dj) && (!best || Math.hypot(di, dj) < best[2])) best = [gi + di, gj + dj, Math.hypot(di, dj)]; if (!best) return null; [gi, gj] = best; }
    const [si, sj] = cell(from.x, from.z), key = (i, j) => i * nz + j, g = new Map([[key(si, sj), 0]]), came = new Map(), open = [[Math.hypot(gi - si, gj - sj), si, sj]];
    const push = e => { open.push(e); let q = open.length - 1; while (q && open[(q - 1) >> 1][0] > open[q][0]) { [open[q], open[(q - 1) >> 1]] = [open[(q - 1) >> 1], open[q]]; q = (q - 1) >> 1; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let q = 0; for (;;) { const l = 2 * q + 1, r = l + 1; let m = q; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === q) break; [open[q], open[m]] = [open[m], open[q]]; q = m; } } return top; };
    const shut = new Set();
    while (open.length) {
      const [, i, j] = pop();
      if (shut.has(key(i, j))) continue; shut.add(key(i, j));
      if (i === gi && j === gj) {
        const cells = [[i, j]]; let k = key(i, j); while (came.has(k)) { const [pi, pj] = came.get(k); cells.unshift([pi, pj]); k = key(pi, pj); }
        const pts = cells.map(([a, c]) => at(a, c)), out = [];
        const clear = (a, c) => { const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.08); for (let q = 1; q < n; q++) if (!free(a[0] + (c[0] - a[0]) * q / n, a[1] + (c[1] - a[1]) * q / n)) return false; return true; };
        let a = [from.x, from.z], q = 0;
        while (q < pts.length - 1) { let far = q + 1; for (let r = pts.length - 1; r > q + 1; r--) if (clear(a, pts[r])) { far = r; break; } out.push(pts[far]); a = pts[far]; q = far; }
        return out.length ? out : [to];
      }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const a = i + di, c = j + dj; if (!isFree(a, c)) continue;
        if (di && dj && (!isFree(i + di, j) || !isFree(i, j + dj))) continue;          // no cutting a corner
        const ng = g.get(key(i, j)) + Math.hypot(di, dj); if (ng >= (g.get(key(a, c)) ?? Infinity)) continue;
        g.set(key(a, c), ng); came.set(key(a, c), [i, j]); push([ng + Math.hypot(gi - a, gj - c), a, c]);
      }
    }
    return null;
  };
  /** Walks to (x, z) on this floor by the planned way (straight there when the planner finds none). */
  const go = async (target, opts = {}) => {
    geo = geo ?? await d(() => { const g = window.__dakar.roomGeometry(); return g && { bounds: g.bounds, colliders: g.colliders.map(c => [c.x0, c.z0, c.x1, c.z1, c.h, c.y0 ?? null]) }; });
    const p = await pos(), way = geo ? plan(p, target, p.y) : null;
    if (!way) console.log(`no way planned to ${target[0].toFixed(1)},${target[1].toFixed(1)}`);
    await walk(way ?? [target], { mid: 0.3, ...opts });
  };
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
  // the salon, out to the pool deck by the glazed door, a swim
  geo = null;
  await go(H(-3, -1.5)); await step(Math.round(1.5 * FPS));
  await go(H(-4.5, -5.6)); await go(H(-1.0, -5.6));
  const swam = await act('Se baigner');
  await step(5 * FPS);
  await act('Sortir de l.eau', FPS);
  for (let i = 0; i < 6 * FPS && (await d(() => window.__dakar.villa.swim.info().swimming)); i++) await step(1);
  await step(FPS);
  // the dining room, the hall, up the first flight (the stairs: their own line), the family lounge, the master suite
  await go(H(1.7, -4.0)); await go(H(2.6, -1.6)); await step(FPS);
  await go(H(5.3, -3.85));
  await walk([H(5.15, -3.0), H(5.15, -0.5), H(5.15, 1.3), H(5.15, 2.3)], { mid: 0.35 });
  await go(H(3.6, 2.6)); await go(H(-2.4, 3.2)); await step(FPS);
  await go(H(-3.6, 0.3)); await go(H(-4.4, -2.6)); await step(Math.round(1.5 * FPS));
  // up the second flight to the roof terrace, by the helicopter
  await go(H(6.2, 2.4));
  await walk([H(7.15, 1.9), H(7.15, -0.5), H(7.15, -3.4)], { mid: 0.35 });
  await go(H(6.0, -3.9)); await go(H(0.6, -3.4)); await go(H(-3.4, -3.1));                // onto the pad, beside the helicopter (round 2: it lies along the terrace)
  const heli = await act('Regarder l.hélicoptère');
  await step(3 * FPS);
  console.log(JSON.stringify({ frames: frame, seconds: +(frame / FPS).toFixed(1), entered, swam, heli, errors: errors.slice(0, 3) }));
} finally {
  await browser.close();
}
if (!DRY) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FRAMES}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', outFile]);
if (!DRY) console.log('video:', outFile, Math.round(fs.statSync(outFile).size / 1000), 'kB');
