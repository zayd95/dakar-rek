// The same road, with the owned MOTORBIKE (Jakarta): the owned vehicle is driven the whole way with the REAL touch controls, both directions, with no loading screen, teleport or fake portal.
// What is proved: one district swap on each leg, on a stretch where neither district is in sight; the same car at the same pose, speed and steering, the driver's seat, the touch pad,
// the engine and the camera's place behind the car kept on every frame around it; the car stopped on the road and the player out and back in; the road's solid things (stalls, poles, parked
// vehicles, traffic) stop the car; the arrival inside the other district; the same car (one copy, same condition) after the way back and after a reload.
// Usage: node scripts/check-corridor-moto.mjs <baseUrl> <outDir> [saveJson]        (saveJson: a v6 save with the Jakarta (asset jakarta) parked in Pikine, see scripts/lib/roadDrive.mjs)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo, turnAround, pilot } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const [base, out, saveFile] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
/** The roads under test: the two districts, the offset of the second's frame from the first's, a stretch of the second's end straight enough to turn round on (in the second's frame, with the heading toward the first), and a point inside the first district to arrive at. */
const CFGS = {
  'pikine-almadies': { a: 'pikine', b: 'almadies', D: { x: 1665, z: -48 }, turn: { area: { x0: 134, x1: 380, z0: -69, z1: -51 }, yaw: Math.PI / 2 }, home: { x: -70, z: -57.2 } },
  'pikine-plateau': { a: 'pikine', b: 'plateau', D: { x: 190, z: -1387 }, turn: { area: { x0: -69, x1: -51, z0: -222, z1: -134 }, yaw: Math.PI }, home: { x: -57.2, z: 70 } },
};
const ROAD = process.env.ROAD ?? 'pikine-almadies', CFG = CFGS[ROAD];
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const save = saveFile ? fs.readFileSync(saveFile, 'utf8') : null;
await ctx.addInitScript(([s, once]) => { try { if (s && !sessionStorage.getItem(once)) { localStorage.setItem('dakarrek.guest.save.v6', s); sessionStorage.setItem(once, '1'); } localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } }, [save, 'corridor-seeded']);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (f, a) => page.evaluate(f, a), AT = () => d(() => window.__dakar.moto.at());
async function boot() {
  await page.goto(`${base}?debug&touch&heure=11`);
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
  await page.waitForFunction(() => window.__dakar.moto?.info().here || window.__dakar.pos().hub !== 'pikine', null, { timeout: 120000 }).catch(() => {});
}
await boot();
const t = await realTouch(page);

const frames = () => d(() => window.__frames);
const startLog = () => d(() => {
  window.__frames = [];
  const tick = () => { const A = window.__dakar, a = A.moto.at(), p = A.pos(), c = A.camera().at; window.__frames.push({ hub: p.hub, x: a.x, z: a.z, yaw: a.yaw, speed: a.speed, driving: a.driving, pad: document.body.classList.contains('ridepad'), engine: A.moto.audio().running, cam: c, mode: p.mode, t: a.t, w: performance.now() }); if (window.__frames.length < 90000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const rel = f => { const s = Math.sin(f.yaw), c = Math.cos(f.yaw), dx = f.cam[0] - f.x, dz = f.cam[2] - f.z; return [dx * c - dz * s, f.cam[1], dx * s + dz * c]; };
const swaps = fr => { const o = []; for (let i = 1; i < fr.length; i++) if (fr[i].hub !== fr[i - 1].hub) o.push(i); return o; };

const getIn = async () => {
  const c = await AT(), L = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) }, F = { x: Math.sin(c.yaw), z: Math.cos(c.yaw) };
  const me = await d(() => window.__dakar.pos());
  const spots = [[2.0, 0.4], [2.4, 0], [1.6, -1.2]];            // the driver's door is on the left of the car: that is where the game offers « Monter »
  for (const [side, along] of spots) {
    await walkTo(page, t, c.x + L.x * side + F.x * along, c.z + L.z * side + F.z * along, { tol: 0.9, ms: 40000 });
    { const me2 = await d(() => window.__dakar.pos()); await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [me2.x, me2.z, Math.atan2(c.x - me2.x, c.z - me2.z)]); }      // face the bike (the walk ends facing along the way it came)
    if (await page.waitForFunction(() => window.__dakar.focus()?.id === 'moto:parked', null, { timeout: 6000 }).then(() => true, () => false)) break;
  }
  await t.tap('#act');
  try { await page.waitForFunction(() => window.__dakar.moto.at().driving && document.body.classList.contains('ridepad'), null, { timeout: 60000 }); }
  catch (e) { console.log('getIn failed', JSON.stringify(await d(() => ({ focus: window.__dakar.focus()?.id ?? null, me: window.__dakar.pos(), car: window.__dakar.moto.at(), mode: window.__dakar.pos().mode, act: document.querySelector('#act')?.className, actText: document.querySelector('#act')?.textContent }))), 'spots', JSON.stringify(spots)); await page.screenshot({ path: `${out}/getin-failed.png` }); throw e; }
  await page.waitForTimeout(600);
};
const getOut = async () => {
  await page.waitForFunction(() => Math.abs(window.__dakar.moto.at().speed) < 0.3, null, { timeout: 60000 }).catch(() => {});
  await t.tap('#ridepad .rp-off');
  await page.waitForFunction(() => !window.__dakar.moto.at().driving && !window.__dakar.moto.info().exit, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
};
const mine = () => d(() => { let n = 0; window.__dakar.three.scene.traverse(o => { if (o.name === 'moto:mine') n++; }); return n; });
const state = () => d(() => ({ me: window.__dakar.pos(), car: window.__dakar.moto.at(), info: window.__dakar.moto.info(), road: window.__dakar.road.info().map(r => ({ road: r.road, hub: r.hub, n: r.chunks.length, slow: r.slowest })), pad: document.body.classList.contains('ridepad'), engine: window.__dakar.moto.audio().running }));

// ---------------------------------------------------------------- set-up: the car is parked in Pikine at the start of the road
const info0 = await d(() => window.__dakar.moto.info());
check(`the moto is parked in ${CFG.a}, owned, one copy`, info0.owned && info0.here && (await mine()) === 1, JSON.stringify(info0.record));
const car0 = info0.record, uid0 = info0.seed, paint0 = info0.paint, asset0 = info0.asset;
const dist0 = await d(() => window.__dakar.road.project(window.__dakar.moto.at().x, window.__dakar.moto.at().z));
check('it stands at the road\'s mouth (the road continues west out of Pikine)', !!dist0 && dist0.road === ROAD && dist0.s < 260, JSON.stringify(dist0));
await d(([x, z]) => window.__dakar.place(x, z, 0), [car0.x + Math.cos(car0.yaw) * 3, car0.z - Math.sin(car0.yaw) * 3]); await page.waitForTimeout(600);
await getIn(); await startLog();


const D1 = CFG.D;           // the first district's frame → the second's (src/road/routes.ts)
/** What the frames around one district change say: pose continuity, seat / pad / engine, camera, and the longest wall-clock gap between two frames near it. */
const swapChecks = async (tag, fr, jump) => {
  const sw = swaps(fr);
  check(`${tag}: exactly one district change, in the middle of the road`, sw.length === 1, JSON.stringify(sw.map(i => [fr[i - 1].hub, fr[i].hub])));
  if (sw.length !== 1) return null;
  const i = sw[0], a = fr[i - 1], b = fr[i], around = fr.slice(Math.max(0, i - 40), i + 40), ra = rel(a), rb = rel(b);
  check(`${tag}: the car comes out at the same spot (the districts' frames differ by the road's offset), with its heading and speed`, Math.hypot(b.x - a.x - jump.x, b.z - a.z - jump.z) < Math.max(0.5, Math.abs(a.speed) * 0.12) + 1.2 && Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))) < 0.1 && Math.abs(b.speed - a.speed) < 1 && a.speed > 3, JSON.stringify({ speed: [a.speed, b.speed], d: [+(b.x - a.x).toFixed(1), +(b.z - a.z).toFixed(1)] }));
  check(`${tag}: driver's seat, touch pad and engine on every frame around the swap`, around.every(f => f.driving && f.pad && f.engine && f.mode === 'play'), `${around.length} frames`);
  check(`${tag}: the camera keeps its place behind the car`, Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]) < 1.2, JSON.stringify({ before: ra.map(v => +v.toFixed(2)), after: rb.map(v => +v.toFixed(2)) }));
  const gaps = []; for (let k = Math.max(1, i - 30); k < Math.min(fr.length, i + 30); k++) gaps.push(fr[k].w - fr[k - 1].w);
  const sorted = [...gaps].sort((x, y) => x - y), med = sorted[Math.floor(sorted.length / 2)], max = Math.max(...gaps);
  console.log(`${tag}: wall-clock gap between frames around the swap: median ${med.toFixed(0)} ms, longest ${max.toFixed(0)} ms (frame ${gaps.indexOf(max)} of ${gaps.length}; the swap is at 30); the swap's own frame cost ${await d(() => window.__dakar.road.lastSwapMs())} ms`);
  return { median: med, longest: max };
};

// ---------------------------------------------------------------- leg 1: Pikine → Almadies
const road = await d(id => { const p = window.__dakar.road.at(id, 0, 0); const q = window.__dakar.road.project(p.x, p.z); return { length: q.length, swapS: q.swapS }; }, ROAD);
let maxLateral = 0;
const tick = (a, pr) => { maxLateral = Math.max(maxLateral, Math.abs(pr.d)); };
await driveRoad(page, t, 'moto', ROAD, 250, { cruise: 9, onTick: tick, brakeAtEnd: true });
// a stop anywhere on the road: the car stays where it stopped, the player gets out on the road, walks, and gets back in
let s1 = await state();
check('stopped at 250 m: still Pikine, the road\'s chunks are built round the car, the player at the wheel', s1.me.hub === 'pikine' && s1.car.driving && Math.abs(s1.car.speed) < 0.3 && s1.road.find(r => r.road === ROAD)?.n >= 3, JSON.stringify({ car: s1.car, pad: s1.pad }));
await page.screenshot({ path: `${out}/leg1-stop-250.png` });
await getOut();
let s1b = await state();
const onRoad = await d(([x, z]) => window.__dakar.road.project(x, z), [s1b.me.x, s1b.me.z]);
check('« Descendre » on the road: the player is on foot on the road beside the car, the car parked there (saved), the pad gone', !s1b.car.driving && !s1b.pad && !s1b.engine && !!onRoad && onRoad.on && onRoad.road === ROAD && s1b.info.record?.hub === 'pikine' && Math.hypot(s1b.me.x - s1b.car.x, s1b.me.z - s1b.car.z) < 6, JSON.stringify({ onRoad: onRoad && onRoad.s, rec: s1b.info.record }));
const solidNow = await d(() => { const g = window.__dakar.cityGeometry(), c = window.__dakar.moto.at(); return g.colliders.some(k => c.x > k.x0 && c.x < k.x1 && c.z > k.z0 && c.z < k.z1); });
check('the parked car is a solid thing of the road (a walker cannot pass through it)', solidNow);
const along = await d(([id, s]) => window.__dakar.road.at(id, s, -6), [ROAD, onRoad.s + 14]);
const walked = await walkTo(page, t, along.x, along.z, { tol: 1.2, ms: 60000 });
const afterWalk = await d(() => window.__dakar.pos());
check('on foot along the road: the walker goes 14 m up the road (the road\'s ground is walkable beyond the district)', walked < 3 && afterWalk.hub === 'pikine', `left ${walked.toFixed(1)} m`);
await getIn(); await startLog();
await driveRoad(page, t, 'moto', ROAD, road.swapS - 80, { cruise: 9, onTick: tick, brakeAtEnd: false });
const sw0 = await state();
check('before the middle: still Pikine, the car driving', sw0.me.hub === 'pikine' && sw0.car.driving, JSON.stringify(sw0.road));
await driveRoad(page, t, 'moto', ROAD, road.swapS + 70, { cruise: 9, onTick: tick, brakeAtEnd: false });
const g1 = await swapChecks('out', await frames(), D1);
await page.screenshot({ path: `${out}/leg1-after-swap.png` });
check('the car stayed on the road\'s ground the whole way (never more than the ground\'s half width from the centre line)', maxLateral < 10, maxLateral.toFixed(2));
const hubNow = await d(() => window.__dakar.pos().hub);
check('the road\'s traffic is there: cars, in both directions', await d(id => { const i = window.__dakar.road.info().find(r => r.road === id); return i.traffic.length >= 2; }, ROAD), JSON.stringify(await d(id => window.__dakar.road.info().find(r => r.road === id).traffic.map(c => [Math.round(c.x), c.dir, +c.v.toFixed(1), c.kind]), ROAD)));
void hubNow;
await driveRoad(page, t, 'moto', ROAD, road.length - 40, { cruise: 9, onTick: tick, brakeAtEnd: true });
const s2 = await state();
check('at the end of the road, in the second district\'s frame, the car stopped, still the driver', s2.me.hub === CFG.b && s2.car.driving && Math.abs(s2.car.speed) < 0.3, JSON.stringify({ hub: s2.me.hub, at: [s2.car.x, s2.car.z] }));
await page.screenshot({ path: `${out}/leg1-arrival.png` });
await getOut();
const s3 = await state();
check('« Descendre »: the player on foot beside the car, the pad gone, the engine stopped; the car saved as parked in Almadies', s3.me.hub === CFG.b && !s3.car.driving && !s3.pad && !s3.engine && s3.info.record?.hub === CFG.b && Math.hypot(s3.me.x - s3.car.x, s3.me.z - s3.car.z) < 6, JSON.stringify(s3.info.record));
check('the same car: same paint, one copy, its record (uid) and condition kept', s3.info.seed === uid0 && s3.info.paint === paint0 && (await mine()) === 1 && s3.info.asset?.uid === asset0?.uid && s3.info.asset?.condition <= asset0?.condition, JSON.stringify({ before: asset0 && { uid: asset0.uid, c: asset0.condition }, after: s3.info.asset && { uid: s3.info.asset.uid, c: s3.info.asset.condition } }));
// back on the vehicle right after the swap, with NO reload: the district the swap loaded must still know the vehicle's driver seat (its seat registry is rebuilt during the load)
await getIn();
{ const sIn = await state(); check(`« Monter » again in ${CFG.b} right after the swap, no reload: the player is at the wheel of the same bike, the pad is back`, sIn.car.driving && sIn.pad && sIn.me.hub === CFG.b, JSON.stringify({ hub: sIn.me.hub, driving: sIn.car.driving, pad: sIn.pad })); }
await getOut();

// ---------------------------------------------------------------- save and reload with the car parked on the road, the player on foot on it
const before = { car: s3.car, me: s3.me, rec: s3.info.record };
await d(() => window.__dakar.save?.());
await page.waitForTimeout(1500);
await boot();
const rb = await state();
const onRoad2 = await d(([x, z]) => window.__dakar.road.project(x, z), [rb.me.x, rb.me.z]);
check('after a reload: the player is where they were, on the road (not sent back to the district\'s spawn), the same car parked there, one copy', rb.me.hub === CFG.b && !!onRoad2 && onRoad2.on && Math.hypot(rb.me.x - before.me.x, rb.me.z - before.me.z) < 3 && rb.info.here && Math.hypot(rb.car.x - before.car.x, rb.car.z - before.car.z) < 0.3 && (await mine()) === 1 && rb.info.asset?.uid === asset0?.uid, JSON.stringify({ hub: rb.me.hub, me: [rb.me.x, rb.me.z], car: [rb.car.x, rb.car.z], road: onRoad2 && onRoad2.s }));
await page.screenshot({ path: `${out}/reload-on-road.png` });

// ---------------------------------------------------------------- the way back: a motorbike has no reverse, so it is turned round on the spot (set, not driven) and ridden home across the middle
await getIn();
await d(([x, z, yaw]) => window.__dakar.moto.place(x, z, yaw), [(await AT()).x, (await AT()).z, (await AT()).yaw + Math.PI]);
await startLog();
await driveRoad(page, t, 'moto', ROAD, road.swapS + 60, { cruise: 9, onTick: tick, brakeAtEnd: false });
await driveRoad(page, t, 'moto', ROAD, road.swapS - 70, { cruise: 9, onTick: tick, brakeAtEnd: false });
await swapChecks('home', await frames(), { x: -D1.x, z: -D1.z });
await driveRoad(page, t, 'moto', ROAD, 30, { cruise: 9, onTick: tick, brakeAtEnd: true });
await getOut();
const s5 = await state();
check('home: off the bike in Pikine, parked there (saved), the same bike, one copy', s5.me.hub === CFG.a && !s5.car.driving && s5.info.record?.hub === CFG.a && (await mine()) === 1 && s5.info.asset?.uid === asset0?.uid, JSON.stringify(s5.info.record));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
