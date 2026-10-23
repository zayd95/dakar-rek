// The player's run-to-stop on the v4 body and on each Meshy body, with the game's own input and deceleration, frame by frame (60 Hz).
// Measures the mesh surface, not only the bones: the lowest vertex of each foot (sole against the ground), how fast any point of the body
// moves relative to the body between two frames (a pop shows as a spike), the planted feet's slip, the pelvis height; and shoots a side-view
// strip. Usage: node scripts/check-stop.mjs [baseUrl=http://localhost:4310/] [outDir=docs/meshy/proof/stop]
// Serve a build first (vite build --outDir X && vite preview --outDir X --port 4310). ?avatar= works on test hosts only.
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://localhost:4310/';
const out = process.argv[3] ?? 'docs/meshy/proof/stop';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const cases = [['v4', 'v4'], ['v4s93', 'v4', 0.93], ['homme', 'homme'], ['femme', 'femme']];   // v4s93: the v4 body scaled like the femme (is a scale effect the game's, not the mesh's?)
const RUNS = [['jog', ['KeyW', 'ShiftLeft']], ['walk', ['KeyW']]];
const results = {};

for (const [name, avatar, scale] of cases) {
  const context = await browser.newContext({ viewport: { width: 640, height: 520 }, deviceScaleFactor: 1 });
  const p = await context.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(`${base}?debug&avatar=${avatar}`, { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
  await p.evaluate(() => { const k = window.__dakar; k.setHour(10); k.teleport('pikine'); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__dakar.pause(true));
  if (scale) await p.evaluate(sc => window.__dakar.body().group.scale.setScalar(sc), scale);
  // in the page: the body's sampled surface (every 5th vertex), and the vertices that belong to each foot
  await p.evaluate(() => {
    const D = window.__dakar, body = D.body(), meshes = [];
    body.group.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    const W = { meshes: meshes.map(m => {
      const g = m.geometry, si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight'), n = g.getAttribute('position').count, names = m.skeleton.bones.map(b => b.name);
      const foot = { L: [], R: [] };
      for (let i = 0; i < n; i++) {
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        const nm = names[best];
        if (/^foot[._]?L$/i.test(nm) || nm === 'footL') foot.L.push(i); else if (/^foot[._]?R$/i.test(nm) || nm === 'footR') foot.R.push(i);
      }
      return { m, n, foot };
    }), prev: null };
    window.__W = W;
  });
  const sampleFn = () => {
    const D = window.__dakar, body = D.body(), W = window.__W, g0 = body.group.position;
    body.group.updateMatrixWorld(true);
    const v = new (body.group.position.constructor)();
    const sole = { L: 9, R: 9 }, rel = [];
    for (const { m, n, foot } of W.meshes) {
      m.skeleton.update();
      for (const s of ['L', 'R']) for (const i of foot[s]) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.y < sole[s]) sole[s] = v.y; }
      for (let i = 0; i < n; i += 5) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); rel.push(v.x - g0.x, v.y - g0.y, v.z - g0.z); }
    }
    let maxV = 0, at = -1;
    if (W.prev && W.prev.length === rel.length) for (let i = 0; i < rel.length; i += 3) { const d = Math.hypot(rel[i] - W.prev[i], rel[i + 1] - W.prev[i + 1], rel[i + 2] - W.prev[i + 2]) * 60; if (d > maxV) { maxV = d; at = i / 3; } }
    W.prev = rel;
    const g = D.gait();
    return { sole, maxV, clip: body.clipName, moving: g?.moving ?? false, planted: g?.feet?.map(f => f.planted) ?? [], slipped: g?.feet?.map(f => f.slipped) ?? [], pelvis: g?.pelvis ?? null, settle: g?.feet?.map(f => f.settle) ?? [], hipsY: body.group.getObjectByName('hips')?.getWorldPosition(v.clone().set(0, 0, 0)).y ?? null };
  };
  results[name] = {};
  if (process.env.SWEEP) {
    // the same stop released at 16 different phases of the walk and of the jog: how far the pelvis dips below its standing height, and the highest foot lift after the stop
    const sweep = {};
    for (const [kind, keys] of RUNS) {
      sweep[kind] = [];
      for (let off = 0; off < 16; off++) {
        for (const k of keys) await p.keyboard.down(k);
        await p.evaluate(n => window.__dakar.step(1 / 60, n), 150 + off * 2);
        await p.evaluate(sampleFn);
        for (const k of [...keys].reverse()) await p.keyboard.up(k);
        let low = 9, high = -9, maxV = 0, base = null, lastStep = 0;
        for (let f = 0; f < 120; f++) {
          await p.evaluate(() => window.__dakar.step(1 / 60, 1));
          const r = await p.evaluate(sampleFn);
          if (f > 3) { low = Math.min(low, r.pelvis); if (f > 10) maxV = Math.max(maxV, r.maxV); }
          if (r.settle.some(Boolean)) lastStep = f;
          base = r.pelvis;
        }
        sweep[kind].push({ off, pelvisMin: +low.toFixed(3), pelvisRest: +base.toFixed(3), dip_cm: +((base - low) * 100).toFixed(1), settleStepsUntilFrame: lastStep, maxSurfaceSpeedAfter10f: +maxV.toFixed(2) });
        await p.evaluate(() => window.__dakar.step(1 / 60, 60));
      }
    }
    results[name] = sweep;
    await context.close(); continue;
  }
  for (const [kind, keys] of RUNS) {
    for (const k of keys) await p.keyboard.down(k);
    await p.evaluate(() => window.__dakar.step(1 / 60, 150));
    await p.evaluate(sampleFn);                                 // primes the previous surface
    const rows = [];
    for (const k of [...keys].reverse()) await p.keyboard.up(k);
    let pos = null;
    for (let f = 0; f < 100; f++) {
      pos = await p.evaluate(() => window.__dakar.step(1 / 60, 1));
      const s = await p.evaluate(sampleFn);
      rows.push({ f, speed: +pos.speed.toFixed(3), clip: s.clip, moving: s.moving, soleL: +s.sole.L.toFixed(4), soleR: +s.sole.R.toFixed(4), maxV: +s.maxV.toFixed(2), planted: s.planted, pelvis: s.pelvis, settle: s.settle, slipped: s.slipped.map(x => +x.toFixed(4)), hipsY: s.hipsY && +s.hipsY.toFixed(3) });
      if (kind === 'jog' && (f % 8 === 0 && f <= 88)) {
        await p.evaluate(([yaw, x, z]) => { const D = window.__dakar, c = [Math.cos(yaw), -Math.sin(yaw)]; D.cam([x + c[0] * 3.4, 1.05, z + c[1] * 3.4], [x, 0.85, z]); D.render(); }, [pos.yaw, pos.x, pos.z]);
        await p.screenshot({ path: `${out}/${name}-f${String(f).padStart(2, '0')}.png`, clip: { x: 120, y: 90, width: 400, height: 340 } });
      }
    }
    await p.evaluate(() => window.__dakar.cam(null));
    results[name][kind] = rows;
    await p.evaluate(() => window.__dakar.step(1 / 60, 60));      // settle before the next run
  }
  if (errors.length) results[name].errors = errors;
  await context.close();
}
await browser.close();

// summary: per body and run, over the stop (from the release until the Idle clip is reached and the speed is 0)
if (process.env.SWEEP) { fs.writeFileSync(`${out}/sweep.json`, JSON.stringify(results, null, 1)); for (const [n, r] of Object.entries(results)) for (const [k, rows] of Object.entries(r)) console.log(n.padEnd(6), k.padEnd(5), 'dip cm:', rows.map(x => x.dip_cm).join(' '), '| max dip', Math.max(...rows.map(x => x.dip_cm))); process.exit(0); }
const summary = {};
for (const [name, runs] of Object.entries(results)) {
  summary[name] = {};
  for (const [kind, rows] of Object.entries(runs)) {
    if (!Array.isArray(rows)) continue;
    const stopAt = rows.findIndex(r => r.speed < 0.02), idleAt = rows.findIndex(r => r.clip === 'Idle'), cmFloor = x => +(x * 100).toFixed(1);
    const tail = rows.slice(Math.max(0, (idleAt < 0 ? 0 : idleAt)));
    summary[name][kind] = {
      framesToStopSpeed: stopAt, framesToIdleClip: idleAt,
      deepestSole_cm: cmFloor(Math.min(...rows.flatMap(r => [r.soleL, r.soleR]))),
      highestSoleAtRest_cm: tail.length ? cmFloor(Math.max(...tail.flatMap(r => [r.soleL, r.soleR]))) : null,
      soleAtRest_cm: tail.length ? [cmFloor(tail.at(-1).soleL), cmFloor(tail.at(-1).soleR)] : null,
      maxSurfaceSpeed_mps: +Math.max(...rows.map(r => r.maxV)).toFixed(2),
      maxSurfaceSpeedAfterIdle_mps: tail.length ? +Math.max(...tail.map(r => r.maxV)).toFixed(2) : null,
      slipWhilePlantedMax_cm: cmFloor(Math.max(...rows.flatMap(r => r.slipped))),
      hipsDrop_cm: cmFloor(Math.max(...rows.map(r => r.hipsY)) - Math.min(...rows.map(r => r.hipsY))),
    };
  }
}
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));

// contact sheet: rows = bodies, columns = frames of the stop
const files = fs.readdirSync(out).filter(f => /^(v4|homme|femme)-f\d+\.png$/.test(f));
const frames = [...new Set(files.map(f => f.match(/-f(\d+)\.png/)[1]))].sort();
const W = 400, H = 340, sheet = [];
for (const [ri, [name]] of cases.entries()) for (const [ci, fr] of frames.entries()) sheet.push({ input: `${out}/${name}-f${fr}.png`, left: ci * W, top: ri * H });
await sharp({ create: { width: W * frames.length, height: H * cases.length, channels: 3, background: '#222' } }).composite(sheet.filter(s => fs.existsSync(s.input))).jpeg({ quality: 82 }).toFile(`${out}/sheet.jpg`);
console.log('sheet:', frames.join(','));
