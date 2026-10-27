// LD2.0-D round 2, lane R2-W: the free swim in the villa's pool (docs/ld2/LD2_D.md, « Round 2 », decision 2), checked on a phone page (390 × 844) with real
// touches (scripts/lib/realTouch.mjs: Chrome's own touch pipeline), the game paused and stepped a 30th of a second at a time so the run is the same on a
// loaded machine. Debug hooks only set the scene (the villa bought and entered) and read the state (__dakar.villa.swim.info()).
//   1. walk from the entrée through the salon to the pool deck, round to the steps' head at the west end; push toward the water: down the steps, in;
//   2. swim with the joystick to each of the four corners of the water;
//   3. let go: the swimmer drifts to a stop and treads water, upright;
//   4. swim to the middle of the south side; « Sortir de l'eau »: out over the wall, onto the deck; hygiene and moral up;
//   5. « Se baigner » at the edge: a slip into the water in well under a second, no jump;
//   6. swim west into the steps: up them, out on the deck at the west end;
//   7. the acceptance's own pool step (scripts/check-ld2d.mjs, step 5) with the game running in real time: « Se baigner » at the south edge, in the water
//      for a few seconds, « Sortir de l'eau », cleaner;
// all the way: the swimmer's footprint never leaves the water's rectangle, the stroke's pace follows the speed, the camera stays above the deck and never
// in the basin, and no page error. Pictures of the run: <outDir>/check-*.png.
// Usage: node scripts/check-villa-swim.mjs <baseUrl=http://127.0.0.1:4995/> [outDir=docs/proof/ld2d/r2-swim] [avatar=femme|homme|v4]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4995/', OUT = 'docs/proof/ld2d/r2-swim', AVATAR = 'femme'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const DT = 1 / 30;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, ok && !process.env.VERBOSE ? '' : String(extra).slice(0, 700)); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(([avatar]) => {
  try {
    if (!localStorage.getItem('dakarrek.guest.save.v6')) localStorage.setItem('dakarrek.guest.save.v6', JSON.stringify({ schemaVersion: 6, guestId: `g-r2w-swim-${avatar}`, avatar: avatar === 'v4' ? null : avatar }));
    localStorage.setItem('dakarrek.quality', 'medium');
  } catch { /* */ }
}, [AVATAR]);
const page = await ctx.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const shot = async name => {
  await d(() => window.__dakar.render());
  let png = await sharp(await page.screenshot()).png({ compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(png).png({ palette: true, quality: 88, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(`${OUT}/${name}.png`, png);
};

try {
  await page.goto(`${base}?debug&touch&argent=999000000${AVATAR === 'v4' ? '&avatar=v4' : ''}`, { waitUntil: 'load' });   // (?avatar=v4: the shared rig's own body)
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && !document.getElementById('studio') && window.__dakar.villa, null, { timeout: 300000 });
  // ------------------------------------------------------------------ the scene: the villa bought, made home, entered
  await d(() => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(10.5); D.teleport('almadies'); });
  await page.waitForTimeout(2500);
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const G = await d(() => window.__dakar.villa.swim.geometry()), O = G.origin, POOL = G.pool, AREA = G.area, STEPS = G.steps;
  const body = await d(() => window.__dakar.avatar().body);
  console.log(JSON.stringify({ origin: O, body }));
  await d(() => window.__dakar.pause(true));

  const t = await realTouch(page), joy = await t.centre('#joy');
  const pos = () => d(() => window.__dakar.pos());
  const info = () => d(() => window.__dakar.villa.swim.info());
  // what is watched every frame of the run: the footprint in the water, the camera, the pace of the stroke
  const watch = { frames: 0, swimFrames: 0, outside: [], camLow: [], camInPool: [], rates: [], states: new Set(), jumps: [] };
  let lastOrigin = null;
  const record = s => {
    watch.frames++;
    if (s.i.state) watch.states.add(s.i.state);
    if (s.i.box) {
      watch.swimFrames++;
      const b = s.i.box, e = 0.011;
      if (b.x0 < POOL.x0 - e || b.x1 > POOL.x1 + e || b.z0 < POOL.z0 - e || b.z1 > POOL.z1 + e || s.i.x < AREA.x0 || s.i.x > AREA.x1 || s.i.z < AREA.z0 || s.i.z > AREA.z1) watch.outside.push({ box: b, x: s.i.x, z: s.i.z });
      if (s.i.state === 'swim' && s.i.speed > 0.2) watch.rates.push([s.i.speed, s.i.rate]);
    }
    if (s.i.swimming) {
      const [cx, cy, cz] = s.c, px = cx - O.x, pz = cz - O.z;
      if (cy < G.deckY + 1) watch.camLow.push(+cy.toFixed(2));
      if (px > POOL.x0 && px < POOL.x1 && pz > POOL.z0 && pz < POOL.z1 && cy < G.deckY + 0.5) watch.camInPool.push([px, cy, pz]);
      // the body as drawn (the player's position) goes where the swim puts it, a frame at a time: no jump, never held back
      const o = { x: s.p.x, y: s.p.y, z: s.p.z };
      if (lastOrigin) { const j = Math.hypot(o.x - lastOrigin.x, o.y - lastOrigin.y, o.z - lastOrigin.z); if (j > 0.2) watch.jumps.push({ j: +j.toFixed(2), state: s.i.state }); }
      const off = Math.hypot(o.x - s.i.wx, o.z - s.i.wz); if (off > 0.02) watch.jumps.push({ off: +off.toFixed(2), state: s.i.state });
      lastOrigin = o;
    } else lastOrigin = null;
    return s;
  };
  /** `n` frames of the game, each read back (one call a frame). */
  const step = async (n = 1) => {
    for (let k = 0; k < n; k++) record(await d(dt => { const D = window.__dakar; D.step(dt, 1); return { i: D.villa.swim.info(), c: D.camera().at, p: D.pos() }; }, DT));
  };
  /** The thumb on the stick pushed (0…1) toward plan point (x, z) (from the camera's view, as a player aims it). */
  const aim = async (x, z, push = 0.8) => {
    const p = await pos(), a = wrap(Math.atan2(O.x + x - p.x, O.z + z - p.z) - p.cam);
    await t.move(3, joy.x - Math.sin(a) * 50 * push, joy.y - Math.cos(a) * 50 * push, 1);
  };
  /** On foot or swimming, toward plan (x, z) with the thumb until within `tol` (or stuck for a second, or `max` s): the closest it came. */
  const go = async (x, z, { tol = 0.3, push = 0.8, max = 30, until = null } = {}) => {
    await t.down(3, joy.x, joy.y);
    let best = Infinity, still = 0, prev = null, n = 0;
    for (; n < max * 30; n += 3) {
      const p = await pos(), dist = Math.hypot(O.x + x - p.x, O.z + z - p.z); best = Math.min(best, dist);
      if (dist < tol || (until && (await until()))) break;
      still = prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 0.004 ? still + 3 : 0; prev = p;
      if (still > 30) break;
      await aim(x, z, dist < 0.8 ? Math.max(0.35, push * dist / 0.8) : push);
      await step(3);
    }
    await t.up(3); await step(2);
    return { best, seconds: +(n * DT).toFixed(1) };
  };
  /** The action button, tapped as a thumb does, once the focus offers `re` (within `s` game seconds). */
  const act = async (re, s = 3) => {
    for (let i = 0; i < s * 30; i++) {
      const f = await d(() => window.__dakar.focus()?.primary ?? '');
      if (new RegExp(re).test(f)) { await t.tap('#act'); await step(1); return true; }
      await step(1);
    }
    return false;
  };
  const waitState = async (pred, s = 10) => { for (let i = 0; i < s * 30; i++) { const q = await info(); if (pred(q)) return q; await step(1); } return await info(); };
  const needs = () => d(() => ({ ...window.__dakar.state.data.needs }));

  // ------------------------------------------------------------------ 1. to the pool, round to the steps' head, down the steps
  const walk = [];
  for (const [x, z] of [[-3, 1.0], [-3, -1.5], [-4.6, -3.6], [-4.5, -5.6], [-6.6, -5.6], [-6.7, -7.8]]) walk.push(await go(x, z, { tol: 0.25 }));
  const atHead = await pos();
  check('1a. walked with the joystick from the entrée through the salon to the pool deck and round to the steps\' head', Math.hypot(atHead.x - O.x - -6.7, atHead.z - O.z - -7.8) < 0.45 && !(await info()).swimming,
    JSON.stringify({ walk, at: [+(atHead.x - O.x).toFixed(2), +(atHead.z - O.z).toFixed(2)] }));
  const n0 = await needs();
  await shot('check-1-steps-head');
  // the thumb pushes toward the water and holds: down the steps
  await t.down(3, joy.x, joy.y); await aim(-3, -7.8, 0.7);
  let goingIn = await info();
  for (let i = 0; i < 45 && goingIn.how !== 'steps'; i++) { await step(1); goingIn = await info(); }   // (a step or two to the edge first)
  let midSteps = null;
  for (let i = 0; i < 6 * 30; i++) { const q = await info(); if (!midSteps && q.y < -0.5) { midSteps = q; await shot('check-2-steps-in'); } if (q.state === 'tread' || q.state === 'swim') break; await step(1); }
  await t.up(3); await step(10);
  const inSteps = await info();
  check('1b. pushing toward the water at the steps\' head walks the player down the steps into the water, treading', goingIn.how === 'steps' && !!midSteps && midSteps.clip === 'Walk' && ['tread', 'swim'].includes(inSteps.state) && inSteps.log.ins.steps === 1 && inSteps.y < -1,
    JSON.stringify({ goingIn: goingIn.how, mid: midSteps && { x: midSteps.x, y: midSteps.y, clip: midSteps.clip }, now: { state: inSteps.state, x: inSteps.x, y: inSteps.y } }));

  // ------------------------------------------------------------------ 2. the four corners
  const corners = [], log0 = (await info()).log;
  for (const [name, cx, cz] of [['nord-ouest', AREA.x0, AREA.z0], ['nord-est', AREA.x1, AREA.z0], ['sud-est', AREA.x1, AREA.z1], ['sud-ouest', AREA.x0, AREA.z1]]) {
    // aimed a little past the corner, the thumb pushed: the swimmer ends pressed into it (and stays in the water)
    const r = await go(cx + Math.sign(cx - (AREA.x0 + AREA.x1) / 2) * 0.5, cz + Math.sign(cz - (AREA.z0 + AREA.z1) / 2) * 0.5, { tol: 0.2, push: 0.9, max: 25, until: () => d(() => window.__dakar.villa.swim.info().state === 'out') });
    const q = await info();
    corners.push({ name, dx: +Math.abs(q.x - cx).toFixed(2), dz: +Math.abs(q.z - cz).toFixed(2), state: q.state, s: r.seconds });
    if (name === 'nord-est') await shot('check-3-corner-ne');
  }
  const log1 = (await info()).log;
  check('2a. swims with the joystick to each of the four corners of the water (in it all the while)', corners.every(c => c.dx < 1.6 && c.dz < 1.6 && ['swim', 'tread'].includes(c.state)) && log1.ended === log0.ended, JSON.stringify(corners));
  const sw = watch.rates.filter(([v]) => v > 0.25);
  const fast = sw.filter(([v]) => v > 1.0), slow = sw.filter(([v]) => v < 0.7), avg = a => a.reduce((s, [, r]) => s + r, 0) / Math.max(1, a.length);
  const vmax = Math.max(...sw.map(([v]) => v));
  check('2b. at a swimming pace (about 1 m/s, a little more pushed to the rim), the stroke faster when faster', vmax > 0.95 && vmax < 1.5 && (!slow.length || !fast.length || avg(fast) > avg(slow)),
    JSON.stringify({ vmax, samples: sw.length, rateFast: +avg(fast).toFixed(2), rateSlow: +avg(slow).toFixed(2) }));

  // ------------------------------------------------------------------ 3. treading water
  await go(0, -7.8, { tol: 0.4 });
  await step(3 * 30);
  const tread = await info();
  await shot('check-4-tread');
  check('3. the stick at rest: drifts to a stop and treads water, upright (the Tread clip)', tread.state === 'tread' && tread.speed < 0.05 && tread.lean < 0.05 && tread.clip === 'Tread', JSON.stringify({ state: tread.state, speed: tread.speed, lean: tread.lean, clip: tread.clip }));

  // ------------------------------------------------------------------ 4. out over the south wall
  await go(0, POOL.z1 - 0.7, { tol: 0.3, push: 0.6 }); await step(30);
  const offered = await act('Sortir de l.eau');
  let climbing = null;
  for (let i = 0; i < 5 * 30; i++) { const q = await info(); if (!climbing && q.clip === 'SwimClimb') { climbing = q; await step(4); await shot('check-5-climb'); } if (!q.swimming) break; await step(1); }
  await step(15);
  const outAt = await pos(), out1 = await info(), n1 = await needs();
  check('4. « Sortir de l\'eau » by the south wall: out over it (hands on the coping), standing on the deck; hygiene and moral up', offered && !!climbing && !out1.swimming && out1.log.outs.climb === 1 && outAt.mode === 'play'
    && outAt.z - O.z > POOL.z1 + 0.3 && Math.abs(outAt.y - G.deckY) < 0.05 && n1.hygiene > n0.hygiene && n1.moral >= n0.moral,
    JSON.stringify({ offered, climbing: climbing && { x: climbing.x, z: climbing.z, y: climbing.y }, at: [+(outAt.x - O.x).toFixed(2), +outAt.y.toFixed(2), +(outAt.z - O.z).toFixed(2)], n0: n0.hygiene, n1: n1.hygiene, gains: out1.log.gains }));

  // ------------------------------------------------------------------ 5. « Se baigner » at the edge
  await go(1.5, POOL.z1 + 0.45, { tol: 0.2, push: 0.5 }); await step(10);
  const before = await info(), jumps0 = watch.jumps.length;
  const edge = await act('Se baigner');
  let tIn = 0, splashed = false, slide = null;
  for (; tIn < 3 * 30; tIn++) { const q = await info(); if (!slide && q.how === 'slide' && q.y < 0 && q.y > -0.9) { slide = q; await shot('check-6-slide-in'); } if (q.fx?.made.drops > 0) splashed = true; if (q.state === 'tread') break; await step(1); }
  const inSlide = await info();
  check('5. « Se baigner » at the edge: a slip into the water in well under a second, a splash, no jump', edge && !before.swimming && inSlide.state === 'tread' && inSlide.how === 'slide' && tIn * DT < 0.85 && splashed && watch.jumps.length === jumps0,
    JSON.stringify({ edge, seconds: +(tIn * DT).toFixed(2), splashed, jumps: watch.jumps.slice(jumps0), state: inSlide.state }));
  await step(20); await shot('check-7-in');

  // ------------------------------------------------------------------ 6. up the steps
  const steps0 = (await info()).log.outs.steps;
  const toSteps = await go(AREA.x0 - 1.5, -7.8, { tol: 0.2, push: 0.9, max: 25, until: () => d(() => window.__dakar.villa.swim.info().state === 'out') });
  let wading = null;
  for (let i = 0; i < 8 * 30; i++) { const q = await info(); if (q.state === 'out' && !wading && q.y > -0.8) { wading = q; await shot('check-8-steps-out'); } if (!q.swimming) break; await step(1); }
  await step(15);
  const top = await pos(), out2 = await info();
  check('6. swimming into the steps walks the swimmer up them, out on the deck at the west end', !out2.swimming && out2.log.outs.steps === steps0 + 1 && top.x - O.x < POOL.x0 && Math.abs(top.y - G.deckY) < 0.05 && top.mode === 'play',
    JSON.stringify({ toSteps, wading: wading && { x: wading.x, y: wading.y, clip: wading.clip }, at: [+(top.x - O.x).toFixed(2), +top.y.toFixed(2), +(top.z - O.z).toFixed(2)], log: out2.log }));

  // ------------------------------------------------------------------ 7. the acceptance's own pool step (scripts/check-ld2d.mjs, step 5), in real time
  await go(-6.6, -5.6, { tol: 0.25 }); await go(-4.5, -5.6, { tol: 0.25 }); await go(-1.0, -5.6, { tol: 0.25 });
  await d(() => { window.__dakar.state.data.needs.hygiene = 60; window.__dakar.pause(false); });   // (the swims before have filled it up)
  const until = (fn, ms) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  const waitFocus = (re, ms) => page.waitForFunction(r => new RegExp(r).test(window.__dakar.focus()?.primary ?? ''), re, { timeout: ms }).then(() => true, () => false);
  const r0 = await needs();
  const rtEdge = await waitFocus('Se baigner', 15000); if (rtEdge) await t.tap('#act');
  const rtSwim = await until(() => window.__dakar.villa.swim.info().swimming, 20000);
  await until(() => window.__dakar.villa.swim.info().t > 4, 60000);
  const rt = await d(() => ({ i: window.__dakar.villa.swim.info(), y: window.__dakar.pos().y }));
  const rtOut = await waitFocus('Sortir de l.eau', 10000); if (rtOut) await t.tap('#act');
  const rtDone = await until(() => !window.__dakar.villa.swim.info().swimming && window.__dakar.pos().mode === 'play', 60000);
  const r1 = await needs();
  await d(() => window.__dakar.pause(true));
  check('7. the acceptance\'s pool step in real time: « Se baigner » at its edge, in the water, « Sortir de l\'eau », cleaner', rtEdge && rtSwim && rt.i.t > 2 && rt.y < 0 && rtOut && rtDone && r1.hygiene > r0.hygiene,
    JSON.stringify({ rtEdge, rtSwim, t: rt.i.t, y: rt.y, rtOut, rtDone, h0: r0.hygiene, h1: r1.hygiene }));

  // ------------------------------------------------------------------ all the way
  check('8a. the swimmer\'s footprint never left the water\'s rectangle (every frame in the water)', watch.swimFrames > 300 && !watch.outside.length, JSON.stringify({ frames: watch.swimFrames, outside: watch.outside.slice(0, 4) }));
  check('8b. the camera followed above the deck, never in the basin', !watch.camLow.length && !watch.camInPool.length, JSON.stringify({ low: watch.camLow.slice(0, 5), inPool: watch.camInPool.slice(0, 3) }));
  check('8c. swim and tread both played, no jump of the body in or out of the water', watch.states.has('swim') && watch.states.has('tread') && !watch.jumps.length, JSON.stringify({ states: [...watch.states], jumps: watch.jumps.slice(0, 4) }));
  check('8d. no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const perf = await d(() => { window.__dakar.render(); return { calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }; });
  console.log(JSON.stringify({ body, frames: watch.frames, swimFrames: watch.swimFrames, perf }));
} catch (e) {
  check('the run finished', false, e.stack ?? String(e));
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
