// The player's gait (src/actors/gait.ts), desktop and phone: the walk (1.4 m/s and the light push's 2.2 m/s), the brisk
// default (4.2 m/s) and the run (7 m/s), each as screenshot sequences from the front, the side and the back (8 frames a
// stride), then a start, a stop, a 90° turn while walking and a turn on the spot; and how much the feet slide: the sole's
// lowest point carries the body while it is within 1.5 cm of the ground, its horizontal drift meanwhile is sliding, in cm
// a step, with the cadence (steps a minute) and the step's length.
// Usage: node scripts/check-gait.mjs [baseUrl=http://localhost:4208/] [outDir=docs/screenshots/gait] [--view=desktop|phone]
// Serve a build first: npm run build && npx vite preview --port 4208.
// Before/after: on a build without the gait (no __dakar.step) the game runs in real time and frames are taken as they
// come (SwiftShader: ~3 fps), the numbers are reported but not checked. With it the game is paused and advanced 1/60 s
// at a time (__dakar.pause, step, render), so every sequence and measure is exact. Outputs: <outDir>/<view>/*.png and
// <outDir>/results.json (both views; with the build kind) — same names before and after, for side-by-side strips.
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const base = args[0] ?? 'http://localhost:4208/';
const out = args[1] ?? 'docs/screenshots/gait';
const only = process.argv.find(a => a.startsWith('--view='))?.slice(7);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const report = {};

// the sole's heel and ball in the foot bone's frame (src/actors/gait.ts SOLE): the same points before and after
const SOLE = { heel: [0, 0.0023, 0.1059], ball: [0, 0.1475, 0.0515] };
const DT = 1 / 60;
const GAITS = [
  { name: 'walk', label: 'walk 1.4 m/s (light push)', stick: 0.59, spm: [105, 135] },
  { name: 'walk-max', label: 'brisk walk 2.2 m/s (full push: the default)', keys: ['KeyW'], spm: [145, 175] },
  { name: 'run', label: 'run 7 m/s (Shift / « Courir »)', keys: ['KeyW'], run: true, spm: [175, 215] },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  if (only && only !== label) continue;
  const dir = `${out}/${label}`; fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, T);
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const stepped = await d(() => typeof window.__dakar.step === 'function' && typeof window.__dakar.gait === 'function');
  const rep = report[label] = { build: stepped ? 'gait (stepped 1/60 s)' : 'before (real time)', gaits: {} };
  // helpers in the page: the player's body (the humanoid standing where the player is), its soles in the world, a touch stick
  await d(sole => {
    window.__gaitCheck = {
      clock: 0,
      body() {
        const p = window.__dakar.pos(); let best = null, bd = 0.5;
        window.__dakar.three.scene.traverse(o => { if (o.name === 'humanoid_v2' && o.visible) { const dd = Math.hypot(o.position.x - p.x, o.position.z - p.z); if (dd < bd) { bd = dd; best = o; } } });
        return best;
      },
      soles() {
        const b = this.body(); if (!b) return null;
        b.updateMatrixWorld(true);
        const at = (side, v) => { const e = b.getObjectByName(`foot${side}`).matrixWorld.elements; return [e[0] * v[0] + e[4] * v[1] + e[8] * v[2] + e[12], e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13], e[2] * v[0] + e[6] * v[1] + e[10] * v[2] + e[14]]; };
        return { heelL: at('L', sole.heel), ballL: at('L', sole.ball), heelR: at('R', sole.heel), ballR: at('R', sole.ball) };
      },
      // a finger on the left half of the screen, moved up by `mag` of the stick's radius (src/ui/hud.ts setupTouch)
      stick(mag, side = 0) {
        const fire = (type, x, y) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
        if (this.down) fire('pointerup', this.x, this.y);
        this.down = mag > 0; if (!this.down) return;
        this.x = innerWidth * 0.2; this.y = innerHeight * 0.7;
        fire('pointerdown', this.x, this.y); fire('pointermove', this.x + side * 50 * mag, this.y - 50 * mag * (side ? 0 : 1));
      },
    };
  }, SOLE);
  const stick = (mag, side = 0) => d(([m, s]) => window.__gaitCheck.stick(m, s), [mag, side]);
  const keys = async (list, down) => { for (const k of list) await (down ? page.keyboard.down(k) : page.keyboard.up(k)); };
  const setRun = async on => {
    if (touch) { const now = await d(() => window.__dakar.stride().toggle); if (now !== on) await page.locator('#runBtn').dispatchEvent('pointerdown'); }
    else await (on ? page.keyboard.down('ShiftLeft') : page.keyboard.up('ShiftLeft'));
  };
  /** Advance the game: stepped (paused, exact) or in real time. */
  const advance = async seconds => {
    if (stepped) await d(([dt, n]) => { window.__dakar.step(dt, n); window.__gaitCheck.clock += dt * n; }, [DT, Math.max(1, Math.round(seconds / DT))]);
    else await page.waitForTimeout(seconds * 1000);
  };
  /** The camera around the player: front, side (the character's right) or back, 3.4 m away. */
  const shoot = async (file, view, heading) => {
    await d(([v, h]) => {
      const k = window.__dakar, p = k.pos(), f = [Math.sin(h), Math.cos(h)], r = [-Math.cos(h), Math.sin(h)];
      const at = v === 'front' ? [p.x + f[0] * 3.4, p.y + 1.25, p.z + f[1] * 3.4] : v === 'side' ? [p.x + r[0] * 3.4, p.y + 1.05, p.z + r[1] * 3.4]
        : v === 'back' ? [p.x - f[0] * 3.4, p.y + 1.35, p.z - f[1] * 3.4] : [p.x - f[0] * 3 + r[0] * 2.4, p.y + 2.6, p.z - f[1] * 3 + r[1] * 2.4];
      k.cam(at, [p.x, p.y + 0.85, p.z]); k.render?.();
    }, [view, heading]);
    if (!stepped) await page.waitForTimeout(120);
    const clip = touch ? undefined : { x: viewport.width / 2 - 300, y: 0, width: 600, height: viewport.height };
    await page.screenshot({ path: `${dir}/${file}.png`, clip });
  };
  /** Soles sampled every 1/60 s (stepped) or every frame (real time) for `seconds`. */
  const sample = async seconds => {
    if (stepped) return d(([dt, n]) => { const c = window.__gaitCheck, o = []; for (let i = 0; i < n; i++) { window.__dakar.step(dt, 1); o.push({ t: (c.clock += dt), ...c.soles() }); } return o; }, [DT, Math.round(seconds / DT)]);
    return d(sec => new Promise(res => { const o = [], t0 = performance.now(); const f = () => { o.push({ t: performance.now() / 1000, ...window.__gaitCheck.soles() }); if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else res(o); }; requestAnimationFrame(f); }), seconds);
  };
  const slide = frames => {
    const fr = frames.filter(f => f?.heelL), K = ['heelL', 'ballL', 'heelR', 'ballR'];
    if (!fr.length) return null;
    const ground = Math.min(...fr.flatMap(f => K.map(k => f[k][1])));
    let total = 0, steps = 0, side = '', prevKey = '', prev = null, worst = 0, acc = 0, first = null, last = null, t0 = 0, t1 = 0;
    for (const f of fr) {
      let key = K[0]; for (const k of K) if (f[k][1] < f[key][1]) key = k;
      const p = f[key], down = p[1] < ground + 0.015;
      if (down && key === prevKey && prev) { const dd = Math.hypot(p[0] - prev[0], p[2] - prev[2]); total += dd; acc += dd; }
      if (down && key.slice(-1) !== side) { if (side) { steps++; worst = Math.max(worst, acc); last = p; t1 = f.t; } else { first = p; t0 = f.t; } acc = 0; side = key.slice(-1); }
      prevKey = down ? key : ''; prev = down ? p : null;
    }
    worst = Math.max(worst, acc);                                                   // the last foot down too (stopping)
    const dist = first && last ? Math.hypot(last[0] - first[0], last[2] - first[2]) : 0;
    return { steps, slidePerStepCm: steps ? +((100 * total) / steps).toFixed(1) : null, slideWorstCm: +(100 * worst).toFixed(1),
      cadenceSpm: steps && t1 > t0 ? +((steps / (t1 - t0)) * 60).toFixed(0) : null, stepM: steps ? +(dist / steps).toFixed(2) : null };
  };

  // a long straight street in Pikine, facing along it (as scripts/check-stride.mjs)
  const HEADING = Math.PI / 2;
  const start = async () => {
    await d(h => { const k = window.__dakar; k.pause?.(false); k.teleport('pikine'); k.setHour(10); k.state.data.needs.energie = 95; k.state.data.counters.forme = 60; void h; }, HEADING);
    await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
    await d(h => { window.__dakar.place(-42, -66, h); window.__dakar.lookYaw(h); }, HEADING);
    await page.waitForTimeout(800);
    if (stepped) await d(() => window.__dakar.pause(true));
  };

  for (const gt of GAITS) {
    await start();
    if (gt.run) await setRun(true);
    if (gt.keys) await keys(gt.keys, true); else await stick(gt.stick);
    await advance(1.5);                                                              // up to speed
    const g0 = stepped ? await d(() => window.__dakar.gait()) : null;
    const T2 = g0?.cadence ? 2 / g0.cadence : gt.run ? 0.63 : gt.keys ? 0.69 : 0.9;       // one stride (two steps)
    for (const view of ['front', 'side', 'back']) {
      for (let i = 0; i < 8; i++) { await shoot(`${gt.name}-${view}-${i}`, view, HEADING); await advance(T2 / 8); }
    }
    const secs = 2.5, m = slide(await sample(secs));
    const g1 = stepped ? await d(() => window.__dakar.gait()) : null;
    rep.gaits[gt.name] = { ...m, speed: await d(() => +window.__dakar.stride().speed.toFixed(2)), gait: g1 && { clip: g1.clip, run: +g1.run.toFixed(2), cadenceSpm: +(g1.cadence * 60).toFixed(0), stepM: +g1.step.toFixed(2), duty: +g1.duty.toFixed(2), slipped: g1.feet.map(f => +(f.slipped * 100).toFixed(1)) } };
    console.log(`${label} ${gt.label}:`, JSON.stringify(rep.gaits[gt.name]));
    if (stepped) {
      check(`${label}: ${gt.label}: the feet do not slide (< 2 cm a step)`, m && m.slidePerStepCm !== null && m.slidePerStepCm < 2 && m.slideWorstCm < 4, JSON.stringify(m));
      check(`${label}: ${gt.label}: cadence of the speed (${gt.spm[0]}–${gt.spm[1]} steps a minute)`, m && m.cadenceSpm >= gt.spm[0] && m.cadenceSpm <= gt.spm[1], JSON.stringify(rep.gaits[gt.name].gait));
    }
    if (gt.keys) await keys(gt.keys, false); else await stick(0);
    if (gt.run) await setRun(false);
  }

  // start (standing → brisk), stop (brisk → standing), seen from the side, 1/15 s apart
  await start();
  await advance(0.5);
  await keys(['KeyW'], true);
  const startFrames = [];
  for (let i = 0; i < 14; i++) { await shoot(`start-${i}`, 'side', HEADING); startFrames.push(...(await sample(1 / 15))); }
  await advance(1.2);
  await keys(['KeyW'], false);
  const stopFrames = [];
  for (let i = 0; i < 16; i++) { await shoot(`stop-${i}`, 'side', HEADING); stopFrames.push(...(await sample(1 / 15))); }
  stopFrames.push(...(await sample(1)));
  const after = await d(() => ({ speed: window.__dakar.stride().speed, gait: window.__dakar.gait?.() ?? null }));
  rep.start = slide(startFrames); rep.stop = { ...slide(stopFrames), end: after.gait && { moving: after.gait.moving, feet: after.gait.feet.map(f => f.swing ? 'swing' : 'down') } };
  console.log(`${label} start:`, JSON.stringify(rep.start), 'stop:', JSON.stringify(rep.stop));
  if (stepped) {
    check(`${label}: starting from standing, no sliding`, rep.start && (rep.start.slidePerStepCm ?? 0) < 2.5, JSON.stringify(rep.start));
    check(`${label}: stopping, the feet come together and stay down`, after.speed < 0.05 && after.gait && !after.gait.moving && after.gait.feet.every(f => !f.swing) && (rep.stop.slideWorstCm ?? 0) < 5, JSON.stringify({ stop: rep.stop, speed: after.speed }));
  }

  // a 90° turn while walking (the stick pushed forward, then to the right), seen from behind and above
  await start();
  await stick(0.38);
  await advance(1.2);
  const turnFrames = [];
  await stick(0.38, 1);
  for (let i = 0; i < 14; i++) { await shoot(`turn-${i}`, 'above', HEADING); turnFrames.push(...(await sample(1 / 12))); }
  turnFrames.push(...(await sample(1)));
  await stick(0);
  rep.turn = slide(turnFrames);
  console.log(`${label} turn 90° walking:`, JSON.stringify(rep.turn));
  if (stepped) check(`${label}: a 90° turn while walking: the planted foot pivots, no skating`, rep.turn && (rep.turn.slidePerStepCm ?? 0) < 2 && rep.turn.slideWorstCm < 5, JSON.stringify(rep.turn));

  // turning on the spot: the body turns 90° in 0.6 s (as a friend's avatar or a passer-by does), the feet step round
  await start();
  await advance(0.6);
  const spot = await d(() => window.__dakar.pos());
  const spotFrames = [];
  for (let i = 0; i <= 18; i++) {
    const yaw = HEADING + (Math.PI / 2) * Math.min(1, i / 9);
    await d(([x, z, y]) => window.__dakar.place(x, z, y), [spot.x, spot.z, yaw]);
    if (i % 2 === 0) await shoot(`turn-spot-${i / 2}`, 'above', HEADING);
    spotFrames.push(...(await sample(1 / 15)));
  }
  spotFrames.push(...(await sample(0.8)));
  const spotGait = await d(() => window.__dakar.gait?.() ?? null);
  rep.turnOnSpot = { ...slide(spotFrames), settles: spotGait?.settles ?? null };
  console.log(`${label} turn on the spot:`, JSON.stringify(rep.turnOnSpot));
  if (stepped) check(`${label}: turning on the spot: the feet step round (no moonwalk)`, (spotGait?.settles ?? 0) >= 2 && rep.turnOnSpot.slideWorstCm < 8, JSON.stringify(rep.turnOnSpot));

  await d(() => { window.__dakar.pause?.(false); window.__dakar.cam(null); });
  if (stepped) check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  else rep.errors = errors;
  } catch (e) { check(`${label}: the run went through`, false, String(e?.message ?? e).split('\n')[0]); }
  finally {
    await context.close();                                                          // nothing left rendering for the next view
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ report, checks: results }, null, 2));
  }
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ report, checks: results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} gait checks passed${results.length ? '' : ' (build without the gait: numbers only)'}`);
process.exit(failed ? 1 : 0);
