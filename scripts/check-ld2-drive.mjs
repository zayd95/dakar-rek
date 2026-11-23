// LD2.0-A driving blockers of the owner's iPhone playtest (24 Oct 2026), checked in the browser with REAL touch where a player touches (CDP touch
// events through scripts/lib/realTouch.mjs: the stick, the pedals, « Vue », « Descendre »). Debug hooks only set a start (an hour, money, a car bought,
// a place) and read state; every one is named where it is used.
//   almadies  the way into the Almadies from Pikine: nothing raised on the carriageway at the mouth (the villa wall that stood across it), driven
//             through with no knock; the way in from the Corniche driven too; the city's road events over 60 city days never on a street at a way in
//   cockpit   « Au volant » at 390 × 844 and 844 × 390 in the Teranga (Pikine), the Gaïndé, the Lamane Sport and the berline (Almadies): the lane ahead
//             seen through the windscreen from a few metres on (the frame drawn with and without the car: what the car hides), the dash low in the frame
//   night     22 h and 5 h on a Pikine street and on the Pikine → Almadies road, behind the car and at the wheel: the lane's brightness ahead and the
//             edge line's contrast against the asphalt, draw calls and triangles
// Headless Chromium + SwiftShader: a software renderer, NOT a phone; frame rates here say nothing about a real device.
//
// Usage: node scripts/check-ld2-drive.mjs <baseUrl> <outDir> [parts=almadies,cockpit,night]   (AVATAR=femme: the studio's femme body)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch, pilot, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4612/', out = '/tmp/claude-0/ld2-drive/check', partsArg = 'almadies,cockpit,night'] = process.argv.slice(2);
const PARTS = new Set(partsArg.split(','));
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 900) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 900)}`); };
const note = (...a) => console.log('·', ...a);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const PORTRAIT = { width: 390, height: 844 }, LANDSCAPE = { width: 844, height: 390 };
const context = await browser.newContext({ viewport: PORTRAIT, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const wait = (fn, a, ms = 240000) => page.waitForFunction(fn, a, { timeout: ms });
const jpg = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${name}.jpg`, quality: 70 }); };
const frames = (n = 2) => d(n => new Promise(r => { const f = k => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); }), n);

await page.goto(`${base}?debug&touch&heure=11&argent=900000000${process.env.AVATAR ? `&avatar=${process.env.AVATAR}` : ''}`, { timeout: 180000 });
await wait(() => window.__dakar?.pos && window.__dakar.pos().hub === 'pikine' && window.__dakar.teranga?.info().floor);
const t = await realTouch(page);
const body = await d(() => window.__dakar.avatar());
note('player body', JSON.stringify({ identity: body.identity, body: body.body }));

/** Into a district (debug teleport) and settled. */
const goHub = async hub => { await d(h => window.__dakar.teleport(h), hub); await wait(h => window.__dakar.pos().hub === h, hub); await page.waitForTimeout(1500); };
/** A car of the player's: bought (debug `own`, the setup), placed on a lane (debug `place`), boarded with a real finger. */
const intoCar = async (key, x, z, yaw) => {
  if (!(await d(k => window.__dakar[k].info().owned, key))) { await d(k => window.__dakar[k].own(), key); await wait(k => window.__dakar[k].info().owned && window.__dakar[k].info().here, key, 120000); }
  await d(([k, x, z, y]) => window.__dakar[k].place(x, z, y), [key, x, z, yaw]);
  await d(([x, z, y]) => window.__dakar.place(x + Math.cos(y) * 2.4, z - Math.sin(y) * 2.4, y), [x, z, yaw]);
  await page.waitForTimeout(500);
  await boardVehicle(page, t, key);
};
const getOff = async key => { if (!(await d(k => window.__dakar[k].info().driving, key))) return; await t.tap('#ridepad .rp-off'); await wait(k => !window.__dakar[k].info().driving && window.__dakar.pos().mode === 'play', key).catch(() => {}); await page.waitForTimeout(500); };
/** « Vue » tapped with a real finger until the car's view is `id`. */
const view = async (key, id) => { for (let i = 0; i < 4 && (await d(k => window.__dakar[k].info().view, key)) !== id; i++) { await t.tap('#ridepad .rp-view'); await page.waitForTimeout(500); } return d(k => window.__dakar[k].info().view, key); };

// ---- pixels: the game's canvas alone (the HUD hidden for the measuring frames), decoded
const HIDE_HUD = 'body * { visibility: hidden !important } #c { visibility: visible !important }';
async function canvasPixels() {
  const png = await page.screenshot({ type: 'png' });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
const lum = (p, x, y) => { const i = (Math.round(y) * p.w + Math.round(x)) * p.ch; return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]; };
const same = (a, b, x, y, tol = 10) => { const i = (Math.round(y) * a.w + Math.round(x)) * a.ch; return Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) <= tol; };
/** Screen points (px) of world points of the car's lane ahead: `ahead` m from the car's centre, `lat` m to its left. */
const lanePoints = (key, list) => d(([k, list]) => {
  const D = window.__dakar, a = D[k].at(), cam = D.three.camera, v = cam.position.clone(), out = [];
  cam.updateMatrixWorld(); const f = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) }, l = { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) };
  for (const [ahead, lat, y = 0.09] of list) {
    v.set(a.x + f.x * ahead + l.x * lat, y, a.z + f.z * ahead + l.z * lat).project(cam);
    out.push({ ahead, lat, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, in: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 });
  }
  return out;
}, [key, list]);
/** The car drawn and not drawn (paused, the same camera): which of the lane's points the car (its body, its interior) hides, the dash's line, the share of the frame seeing out. */
async function cockpitMeasure(key, tag) {
  await d(() => window.__dakar.pause(true));
  await page.addStyleTag({ content: HIDE_HUD }).then(h => page.evaluate(e => { e.id = 'ld2-hide'; }, h));
  // the car casts no shadow in both measuring frames (its shadow on the road ahead is not something it hides)
  await d(() => { let ir = null; window.__dakar.three.scene.traverse(o => { if (o.name === 'car_interior') ir = o; }); ir?.parent?.parent?.traverse(m => { if (m.isMesh) { m.userData.ld2Cast = m.castShadow; m.castShadow = false; } }); window.__dakar.render(); });
  const A = await canvasPixels();
  const hidden = await d(k => { let ir = null; window.__dakar.three.scene.traverse(o => { if (o.name === 'car_interior') ir = o; }); const car = ir?.parent?.parent ?? null; if (car) car.visible = false; window.__dakar.render(); return !!car; }, key);
  const B = await canvasPixels();
  await d(() => { let ir = null; window.__dakar.three.scene.traverse(o => { if (o.name === 'car_interior') ir = o; }); const car = ir?.parent?.parent; if (car) { car.visible = true; car.traverse(m => { if (m.isMesh && 'ld2Cast' in m.userData) { m.castShadow = m.userData.ld2Cast; delete m.userData.ld2Cast; } }); } });
  await page.evaluate(() => document.getElementById('ld2-hide')?.remove());
  const pts = await lanePoints(key, [5, 6, 8, 10, 12, 15, 20, 30, 50, 80].map(a => [a, 0, 0.09]));
  const near = (p, f) => [-3, 0, 3].every(dx => [-3, 0, 3].every(dy => f(p.x + dx, p.y + dy)));     // a small patch round the point, all unchanged
  const lane = pts.map(p => ({ ahead: p.ahead, seen: p.in && near(p, (x, y) => same(A, B, x, y)), row: +(p.y / A.h).toFixed(3) }));
  // the dash's line: in the middle third of the frame, the first row from the bottom where the frame sees out again (median of the columns)
  const rows = [];
  // (seeing out: ten pixels in a row unchanged — a dark dash can match the dark asphalt behind it at one pixel)
  const outAt = (x, y) => [0, 2, 4, 6, 8, 10, 12, 14, 16, 18].every(k => y - k > 0 && same(A, B, x, y - k));
  for (let k = 0; k < 9; k++) { const x = A.w * (0.36 + k * 0.035); let y = A.h - 2; while (y > 20 && !outAt(x, y)) y -= 2; rows.push(y / A.h); }
  rows.sort((a, b) => a - b);
  let out = 0, n = 0; for (let y = 0; y < A.h; y += 6) for (let x = 0; x < A.w; x += 6) { n++; if (same(A, B, x, y)) out++; }
  await d(() => window.__dakar.pause(false));
  // the nearest point from which the lane is seen all the way out (from the far end in: the first point the car hides stops it)
  let nearest = null; for (let i = lane.length - 1; i >= 0 && lane[i].seen; i--) nearest = lane[i].ahead;
  const seenFar = lane.filter(p => p.ahead >= 12 && p.ahead <= 80), seenShare = seenFar.filter(p => p.seen).length / seenFar.length;
  return { tag, hidden, nearest, seenShare: +seenShare.toFixed(2), dashRow: +rows[4].toFixed(3), outShare: +(out / n).toFixed(3), lane };
}

// =====================================================================================================================================================
if (PARTS.has('cockpit')) {
  // the Teranga, at Pikine (Sarr Auto sells it): a straight street, x = −62.1 heading north (+z)
  const cars = [['pikine', 'teranga', -62.1, -100, 0]];
  for (const [hub, key, x, z, yaw] of cars) {
    await intoCar(key, x, z, yaw);
    for (const [vp, o] of [[PORTRAIT, 'portrait'], [LANDSCAPE, 'landscape']]) {
      await page.setViewportSize(vp); await page.waitForTimeout(800);
      check(`${key}: « Vue » with a real finger reaches « Au volant » (${o})`, (await view(key, 'volant')) === 'volant');
      await page.waitForTimeout(1500);
      const m = await cockpitMeasure(key, `${key}-${o}`), ir = await d(k => window.__dakar[k].interior(), key);
      await jpg(`cockpit-${key}-${o}`);
      check(`${key} ${o}: at the wheel the lane ahead is seen through the windscreen from a few metres on (from 10 m at most, all of it to 80 m), the car's dash and bonnet in the lower part of the frame (under 45 % from the top)`, m.hidden && m.nearest !== null && m.nearest <= 10 && m.seenShare === 1 && m.dashRow > 0.45,
        JSON.stringify({ ...m, lane: m.lane.map(p => `${p.ahead}m:${p.seen ? 'seen' : 'hidden'}@${p.row}`).join(' '), eye: ir?.eye, design: ir?.design, sight: ir?.sight, cabin: ir?.cabinView }));
    }
    await page.setViewportSize(PORTRAIT); await page.waitForTimeout(600);
    await view(key, 'chase'); await getOff(key);
  }
}

if (PARTS.has('cockpit') || PARTS.has('almadies')) await goHub('almadies');

if (PARTS.has('almadies')) {
  const L = await d(() => { const p = window.__dakar.road.at('pikine-almadies', 0, 0); return p ? window.__dakar.road.project(p.x, p.z).length : null; });
  // the mouth of the road from Pikine (Almadies frame: it comes in heading west along z = −60), its chunks built round the player standing there
  await d(() => window.__dakar.place(112, -62.1, -Math.PI / 2));
  await wait(() => (window.__dakar.road.info().find(r => r.road === 'pikine-almadies')?.chunks ?? []).includes(14), null, 120000).catch(() => {});
  await page.waitForTimeout(1500);
  // what stands on the carriageway: every vertex of the road's own meshes between 0.3 and 4.4 m high (a car's height) within its width
  const raised = await d(L => {
    const D = window.__dakar, hits = []; let meshes = 0;
    D.three.scene.traverse(o => {
      if (!o.isMesh || !/^road:pikine-almadies:\d+$/.test(o.parent?.name ?? '') || o.geometry.type === 'PlaneGeometry') return;
      meshes++; o.updateMatrixWorld(true);
      const p = o.geometry.getAttribute('position'), e = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i), x = e[0] * lx + e[4] * ly + e[8] * lz + e[12], y = e[1] * lx + e[5] * ly + e[9] * lz + e[13], z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
        if (y < 0.3 || y > 4.4 || x < 100) continue;                                         // the mouth's stretch (Almadies frame x > 100)
        const q = D.road.project(x, z); if (!q || q.road !== 'pikine-almadies' || Math.abs(q.d) > 5.45 || q.s < 0.5 || q.s > L - 0.5) continue;
        hits.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)]);
      }
    });
    const xs = hits.map(h => h[0]), zs = hits.map(h => h[2]), ys = hits.map(h => h[1]);
    return { meshes, n: hits.length, box: hits.length ? { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)], y: [Math.min(...ys), Math.max(...ys)] } : null };
  }, L);
  check('Almadies, the way in from Pikine: nothing of the road\'s own scenery stands on its carriageway at the mouth (the villa wall across it)', raised.meshes > 0 && raised.n === 0, JSON.stringify(raised));
  const solid = await d(() => window.__dakar.road.probe(137.3, -60, 6));
  note('solid things at the mouth (x 131…143, z −66…−54)', JSON.stringify(solid));
  // the driver's view into the Almadies from the road, at the height of a driver's eye (debug camera, paused frame)
  await d(() => window.__dakar.pause(true));
  await d(() => { window.__dakar.cam([178, 1.4, -62.8], [100, 1.0, -62.2]); window.__dakar.render(); });
  await jpg('almadies-mouth-from-the-road');
  await d(() => { window.__dakar.cam(null); window.__dakar.pause(false); });
  // driven in with real fingers: the Gaïndé (Prestige Auto, here), on the road's lane into the Almadies 90 m out, through the mouth to the second junction
  const p0 = await d(L => window.__dakar.road.at('pikine-almadies', L - 90, -2.8), L);
  await intoCar('gainde', p0.x, p0.z, p0.yaw);
  await d(() => window.__dakar.gainde.feelReset());
  const samples = []; let sampling = true;
  (async () => { while (sampling) { try { const a = await d(() => { const D = window.__dakar, a = D.gainde.at(); if (!a) return null; const w = D.gainde.solidAt(a.x + Math.sin(a.yaw) * 2.9, a.z + Math.cos(a.yaw) * 2.9, 0.9); return { ...a, ahead: w ? w.why : null }; }); if (a) samples.push(a); } catch { /* */ } await page.waitForTimeout(200); } })();
  const end = { x: 40, z: -62.1 };
  const last = await pilot(page, t, 'gainde', [{ x: 150, z: -62.6, tol: 3, speed: 7 }, { x: 118, z: -62.2, tol: 3, speed: 7 }, { x: 80, z: -62.1, tol: 3, speed: 7 }, { ...end, tol: 3, speed: 7 }], { cruise: 7, stall: 20000, brakeAtEnd: true });
  sampling = false;
  const felt = await d(() => window.__dakar.gainde.feel());
  // held = slowed under 0.8 m/s once going, away from the end; the test's own driver eases at a waypoint when its line wavers on a loaded renderer
  // (scripts/check-polish-journeys.mjs), so each slow moment is reported with what was solid just ahead of the bumper then (nothing: the driver's own easing)
  const going = samples.findIndex(a => a.speed > 3), mid = going < 0 ? [] : samples.slice(going).filter(a => Math.hypot(a.x - end.x, a.z - end.z) > 15 && a.x > 60);
  const slowest = mid.length ? mid.reduce((b, a) => (a.speed < b.speed ? a : b)) : null;
  const held = mid.filter(a => a.speed < 0.8 && a.ahead);
  check('Almadies, the way in from Pikine driven with real fingers: through the mouth into the district, no knock, never held by anything', Math.hypot(last.x - end.x, last.z - end.z) < 5 && felt.impacts.length === 0 && held.length === 0, JSON.stringify({ end: [last.x, last.z], slowest: slowest && { speed: slowest.speed, at: [slowest.x, slowest.z], ahead: slowest.ahead }, held: held.slice(0, 3), impacts: felt.impacts }));
  // the way in from the Corniche (the border street, x = −60, coming south into the Almadies): from its line to the second junction
  await d(() => window.__dakar.gainde.place(-57.9, 118, Math.PI)); await page.waitForTimeout(800); await d(() => window.__dakar.gainde.feelReset());
  const l2 = await pilot(page, t, 'gainde', [{ x: -57.9, z: 90, tol: 3, speed: 7 }, { x: -57.9, z: 50, tol: 3, speed: 7 }, { x: -57.9, z: 10, tol: 3, speed: 7 }], { cruise: 7, stall: 20000, brakeAtEnd: true });
  const felt2 = await d(() => window.__dakar.gainde.feel());
  check('Almadies, the way in from the Corniche driven with real fingers: down the border street through two junctions, no knock', Math.hypot(l2.x + 57.9, l2.z - 10) < 5 && felt2.impacts.length === 0, JSON.stringify({ end: [l2.x, l2.z], impacts: felt2.impacts }));
  // the car on the road's lane 30 m out of the mouth, seen from behind and above it as the chase view does (a debug camera, the frame paused)
  await d(() => window.__dakar.gainde.place(166, -62.6, -Math.PI / 2)); await page.waitForTimeout(2500);
  await page.setViewportSize(LANDSCAPE); await page.waitForTimeout(1500);
  await d(() => { window.__dakar.pause(true); window.__dakar.cam([175, 3.4, -62.6], [120, 0.6, -61.6]); window.__dakar.render(); });
  await jpg('almadies-mouth-behind-the-car');
  await d(() => { window.__dakar.cam(null); window.__dakar.pause(false); });
  await page.setViewportSize(PORTRAIT); await page.waitForTimeout(800);
  // the road events of 60 city days (each day's events of the Almadies, as the game lays them out): never on a street at a way in
  const WAYS = ['60,-60|120,-60', '120,-120|120,-60', '120,-60|120,0', '-60,120|-60,60', '-120,120|-60,120', '-60,120|0,120'];
  const k = e => { const a = `${Math.round(e.ax)},${Math.round(e.az)}`, b = `${Math.round(e.bx)},${Math.round(e.bz)}`; return a < b ? `${a}|${b}` : `${b}|${a}`; };
  const onWays = []; let seen = 0;
  for (let n = 0; n < 60; n++) {
    await d(() => window.__dakar.nextDay(1)); await frames(3);
    const evs = await d(() => ({ day: window.__dakar.cityDay(), evs: window.__dakar.roadEvents() }));
    seen += evs.evs.length;
    for (const e of evs.evs) if (WAYS.includes(k(e.edge))) onWays.push(`${e.kind} ${k(e.edge)} (day +${n + 1})`);
  }
  check('Almadies road events over 60 city days: none on a street at a way in (from Pikine, from the Corniche)', seen > 30 && onWays.length === 0, JSON.stringify({ events: seen, onWaysCount: onWays.length, onWays: onWays.slice(0, 8) }));
  await d(() => window.__dakar.nextDay(-60)); await frames(3);
  await getOff('gainde');
}

if (PARTS.has('cockpit')) {
  // the Almadies' own cars at Prestige Auto: the Gaïndé, the Lamane Sport, the berline — each on its own stretch of the border street, heading south
  const cars = [['gainde', -57.9, 100], ['suv', -57.9, 80], ['berline', -57.9, 40]];
  for (const [key, x, z] of cars) {
    await intoCar(key, x, z, Math.PI);
    for (const [vp, o] of [[PORTRAIT, 'portrait'], [LANDSCAPE, 'landscape']]) {
      await page.setViewportSize(vp); await page.waitForTimeout(800);
      await view(key, 'volant'); await page.waitForTimeout(1500);
      const m = await cockpitMeasure(key, `${key}-${o}`), ir = await d(k => window.__dakar[k].interior(), key);
      await jpg(`cockpit-${key}-${o}`);
      check(`${key} ${o}: at the wheel the lane ahead is seen through the windscreen from a few metres on (from 10 m at most, all of it to 80 m), the car's dash and bonnet in the lower part of the frame (under 45 % from the top)`, m.hidden && m.nearest !== null && m.nearest <= 10 && m.seenShare === 1 && m.dashRow > 0.45,
        JSON.stringify({ ...m, lane: m.lane.map(p => `${p.ahead}m:${p.seen ? 'seen' : 'hidden'}@${p.row}`).join(' '), eye: ir?.eye, design: ir?.design, sight: ir?.sight, cabin: ir?.cabinView }));
    }
    await page.setViewportSize(PORTRAIT); await page.waitForTimeout(600);
    await view(key, 'chase'); await getOff(key);
  }
}

if (PARTS.has('night')) {
  await goHub('pikine');
  // the Teranga on a Pikine street, then on the Pikine → Almadies road (its lane, 330 m out: an asphalt stretch with its edge lines)
  if (!(await d(() => window.__dakar.teranga.info().owned))) await d(() => window.__dakar.teranga.own());
  await wait(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, 120000);
  const c = await d(() => window.__dakar.road.at('pikine-almadies', 330, -2.8));
  await page.setViewportSize(LANDSCAPE); await page.waitForTimeout(800);
  await intoCar('teranga', -62.1, -100, 0);
  const night = [];
  for (const [place, x, z, yaw] of [['street', -62.1, -100, 0], ['road', c.x, c.z, c.yaw]]) {
    await d(([x, z, y]) => window.__dakar.teranga.place(x, z, y), [x, z, yaw]); await page.waitForTimeout(2500);
    for (const h of [22, 5]) {
      await d(h => window.__dakar.setHour(h), h); await page.waitForTimeout(1500);
      for (const v of ['chase', 'volant']) {
        await view('teranga', v); await page.waitForTimeout(1500);
        await d(() => window.__dakar.pause(true));
        await page.addStyleTag({ content: HIDE_HUD }).then(hd => page.evaluate(e => { e.id = 'ld2-hide'; }, hd));
        await d(() => window.__dakar.render());
        const calls = await d(() => window.__dakar.drawCalls()), tris = await d(() => window.__dakar.tris());
        const P = await canvasPixels();
        // the lane ahead (10–22 m, its middle: nearer, the car's own roof hides it from behind) and, on the road, its right-hand edge line and the
        // asphalt 0.7 m inside it (10–18 m ahead; the car rides 2.8 m right of the centre line, the edge line is 5.15 m right of it)
        const pts = await lanePoints('teranga', [[10, 0], [12, 0], [14, 0], [16, 0], [18, 0], [20, 0], [22, 0], ...[10, 12, 14, 16, 18].flatMap(a => [[a, -(5.5 - 0.35) + 2.8], [a, -(5.5 - 0.35) + 2.8 + 0.7]])]);
        const laneL = pts.slice(0, 7).filter(p => p.in).map(p => lum(P, p.x, p.y)), edge = pts.slice(7).filter((_, i) => i % 2 === 0), inner = pts.slice(7).filter((_, i) => i % 2 === 1);
        const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
        const lineL = mean(edge.filter(p => p.in).map(p => Math.max(...[-2, 0, 2].map(dx => lum(P, p.x + dx, p.y))))), asphaltL = mean(inner.filter(p => p.in).map(p => lum(P, p.x, p.y)));
        await page.evaluate(() => document.getElementById('ld2-hide')?.remove());
        await d(() => window.__dakar.pause(false));
        const row = { place, hour: h, view: v, calls, tris, lane: mean(laneL) === null ? null : +mean(laneL).toFixed(1), edgeLine: lineL === null ? null : +lineL.toFixed(1), asphalt: asphaltL === null ? null : +asphaltL.toFixed(1), headlights: await d(() => window.__dakar.teranga.headlights?.() ?? null) };
        night.push(row); note('night', JSON.stringify(row));
        await jpg(`night-${place}-${h}h-${v}`);
      }
    }
  }
  fs.writeFileSync(`${out}/night.json`, JSON.stringify(night, null, 1));
  for (const r of night) {
    check(`night ${r.place} ${r.hour} h ${r.view === 'volant' ? 'at the wheel' : 'behind the car'}: the lane ahead reads (its mean brightness over 10–22 m at least 45 / 255)`, r.lane !== null && r.lane >= 45, JSON.stringify(r));
    if (r.place === 'road') check(`night road ${r.hour} h ${r.view === 'volant' ? 'at the wheel' : 'behind the car'}: the edge line reads and stands out of the asphalt (at least 90 / 255 and twice as bright, 10–18 m ahead)`, r.edgeLine !== null && r.asphalt !== null && r.edgeLine >= 90 && r.edgeLine >= 2 * r.asphalt, JSON.stringify(r));
  }
  await d(() => window.__dakar.setHour(12)); await page.waitForTimeout(1500);
  check('by day the headlights are off', !(await d(() => window.__dakar.teranga.headlights?.()?.on ?? false)));
  await page.setViewportSize(PORTRAIT);
  await getOff('teranga');
}

check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, parts: [...PARTS], body, failed, results, errors: errors.slice(0, 10) }, null, 1));
await context.close(); await browser.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
