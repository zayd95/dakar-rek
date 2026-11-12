// A trip across SEVERAL districts with one vehicle, with the REAL touch controls, no loading screen, no teleport, no forced return to Pikine (src/road/graph.ts: the ring Pikine – Almadies –
// Corniche – Plateau – Pikine). Every district change on the way is a swap: the vehicle keeps its pose, speed, driver's seat, pad and engine, the game stays in play mode (never `busy`),
// and the same car (uid, paint, condition, one copy) is saved parked wherever the trip ends.
// Trips (TRIP=...): `almadies-plateau` (the car starts in Almadies: the border street to the Corniche, then the Corniche ↔ Plateau road, a turn at its end, and back again to Almadies),
// `corniche-pikine` (starts in the Corniche: the border street to Almadies, then the Almadies ↔ Pikine road, and back again to the Corniche).
// Usage: TRIP=almadies-plateau node scripts/check-network-trip.mjs <baseUrl> <outDir> <saveJson>        (saveJson: a v6 save with the berline parked in the trip's first district)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, turnAround, pilot, boardVehicle } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const [base, out, saveFile] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const W = -60;                                   // the street the border link runs along (roadCentre(1)); the grid's streets are at ±60, ±120 and 0
const H = 127;
/**
 * The trips, as steps. `street`: waypoints in the frame of the district the step starts in; when the car crosses into another district the rest of them shift (the pilot does it), so the
 * waypoints beyond a border are written as that district's coordinate plus the frame jump (Almadies → Corniche: −240 in z; Corniche → Almadies: +240). `road`: along a road to an arc
 * length. `turn`: a multi-point turn at a road's end (the carriageway area, the heading wanted).
 */
const TRIPS = {
  'almadies-plateau': {
    start: 'almadies', hubs: ['almadies', 'corniche', 'plateau', 'corniche', 'almadies'], place: { x: W, z: 70, yaw: 0 },
    steps: [
      // Almadies → (the border street, south) → Corniche → its east mouth → the road to the Plateau
      { street: [[W, 150], [W, 300], [H - 8, 300]] },
      { road: 'corniche-plateau', to: 'end' },
      { turn: { area: { x0: -370, x1: -134, z0: -69, z1: -51 }, yaw: -Math.PI / 2 } },
      { road: 'corniche-plateau', to: 'start' },
      // Corniche → (the border street, north) → Almadies
      { street: [[W, 60], [W, -150], [W, 40 - 240]] },
    ],
  },
  'corniche-pikine': {
    start: 'corniche', hubs: ['corniche', 'almadies', 'pikine', 'almadies', 'corniche'], place: { x: W, z: -70, yaw: Math.PI },
    steps: [
      // Corniche → (the border street, north) → Almadies → its east mouth → the road to Pikine
      { street: [[W, -150], [W, -60 - 240], [H - 8, -60 - 240]] },
      { road: 'pikine-almadies', to: 'start' },
      { turn: { area: { x0: -380, x1: -134, z0: -69, z1: -51 }, yaw: -Math.PI / 2 } },       // back toward Almadies: west
      { road: 'pikine-almadies', to: 'end' },
      // Almadies → (the border street, south) → Corniche
      { street: [[W, -60], [W, 150], [W, 60 + 240]] },
    ],
  },
};
const TRIP = process.env.TRIP ?? 'almadies-plateau', CFG = TRIPS[TRIP];
if (!CFG) throw new Error('unknown trip ' + TRIP);
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const save = fs.readFileSync(saveFile, 'utf8');
await ctx.addInitScript(([s, once]) => { try { if (!sessionStorage.getItem(once)) { localStorage.setItem('dakarrek.guest.save.v6', s); sessionStorage.setItem(once, '1'); } localStorage.setItem('dakarrek.quality', 'medium'); } catch { /* */ } }, [save, 'seeded']);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (f, a) => page.evaluate(f, a), AT = () => d(() => window.__dakar.berline.at());
await page.goto(`${base}?debug&touch&heure=11`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.waitForFunction(() => window.__dakar.berline?.info().here, null, { timeout: 120000 });
const t = await realTouch(page);

const mine = () => d(() => { let n = 0; window.__dakar.three.scene.traverse(o => { if (o.name === 'berline:mine') n++; }); return n; });
const startLog = () => d(() => {
  window.__frames = [];
  const tick = () => { const A = window.__dakar, a = A.berline.at(), p = A.pos(); window.__frames.push({ hub: p.hub, mode: p.mode, x: a.x, z: a.z, yaw: a.yaw, speed: a.speed, driving: a.driving, pad: document.body.classList.contains('ridepad'), w: performance.now() }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

const info0 = await d(() => window.__dakar.berline.info());
const hub0 = await d(() => window.__dakar.pos().hub);
check(`the trip starts in ${CFG.start}, where the berline is parked (saved there), one copy`, hub0 === CFG.start && info0.owned && info0.here && (await mine()) === 1, JSON.stringify({ hub: hub0, record: info0.record }));
const uid0 = info0.seed, paint0 = info0.paint, asset0 = info0.asset;
// the car is put on the street the trip starts along, facing the way it goes (the way a player would pull out), and boarded with the real touch controls
await d(([x, z, yaw]) => window.__dakar.berline.place(x, z, yaw), [CFG.place.x, CFG.place.z, CFG.place.yaw]);
await d(([x, z]) => window.__dakar.place(x, z, 0), [CFG.place.x + Math.cos(CFG.place.yaw) * 3, CFG.place.z - Math.sin(CFG.place.yaw) * 3]);       // the player beside the driver's door
await page.waitForTimeout(800);
await boardVehicle(page, t, 'berline');
await startLog();
let lastHub = hub0, stepNo = 0;
for (const step of CFG.steps) {
  stepNo++;
  if (step.street) {
    const pts = step.street.map(([x, z]) => ({ x, z, tol: 4, speed: 8 }));
    await pilot(page, t, 'berline', pts, { cruise: 8, stall: 40000, ms: 600000, brakeAtEnd: true });
  } else if (step.road) {
    const len = await d(id => { const p = window.__dakar.road.at(id, 0, 0); return p ? window.__dakar.road.project(p.x, p.z).length : null; }, step.road);
    await driveRoad(page, t, 'berline', step.road, step.to === 'end' ? len - 45 : 45, { cruise: 12, brakeAtEnd: true, stall: 240000 });
  } else if (step.turn) {
    await turnAround(page, t, 'berline', step.turn.yaw, { area: step.turn.area });
  }
  const st = await d(() => ({ hub: window.__dakar.pos().hub, driving: window.__dakar.berline.at().driving, speed: window.__dakar.berline.at().speed, at: [Math.round(window.__dakar.berline.at().x), Math.round(window.__dakar.berline.at().z)] }));
  console.log(`step ${stepNo}: ${JSON.stringify(step).slice(0, 90)} → ${st.hub}${st.hub !== lastHub ? ' (changed)' : ''} at ${st.at}`);
  lastHub = st.hub;
  const felt = await d(() => { const f = window.__dakar.berline.feel?.(); const o = f ? f.impacts.map(i => `${i.kind}@${i.speed.toFixed(1)}`) : []; window.__dakar.berline.feelReset?.(); return o; });
  if (felt.length) console.log(`  impacts on this step: ${felt.join(', ')}`);
  await page.screenshot({ path: `${out}/${TRIP}-step${stepNo}.png` });
}
const fr = await d(() => window.__frames);
const hubs = []; for (const f of fr) if (hubs[hubs.length - 1] !== f.hub) hubs.push(f.hub);
check(`the districts crossed, in order: ${CFG.hubs.join(' → ')}`, JSON.stringify(hubs) === JSON.stringify(CFG.hubs), JSON.stringify(hubs));
const sw = []; for (let i = 1; i < fr.length; i++) if (fr[i].hub !== fr[i - 1].hub) sw.push(i);
check('every district change keeps the driver in the seat with the pad on, and the speed (the swap changes the frame, never the vehicle)', sw.length === CFG.hubs.length - 1 && sw.every(i => { const a = fr[i - 1], b = fr[i]; return b.driving && b.pad && Math.abs(b.speed - a.speed) < 2.2; }), JSON.stringify(sw.map(i => [fr[i - 1].hub, fr[i].hub, +fr[i - 1].speed.toFixed(1), +fr[i].speed.toFixed(1)])));
const modes = new Set(fr.map(f => f.mode));
check('the game was never « busy » on the way: no loading screen, no travel overlay, no teleport (the mode stays « play » on every frame)', modes.size === 1 && modes.has('play'), JSON.stringify([...modes]));
const end = await d(() => ({ hub: window.__dakar.pos().hub, car: window.__dakar.berline.at() }));
check(`the trip ends in ${CFG.hubs[CFG.hubs.length - 1]}, at the wheel`, end.hub === CFG.hubs[CFG.hubs.length - 1] && end.car.driving, JSON.stringify({ hub: end.hub, at: [Math.round(end.car.x), Math.round(end.car.z)] }));
await t.tap('#ridepad .rp-off');
await page.waitForFunction(() => !window.__dakar.berline.at().driving && !window.__dakar.berline.info().exit, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1200);
const fin = await d(() => ({ hub: window.__dakar.pos().hub, info: window.__dakar.berline.info() }));
check('« Descendre »: the same car (uid, paint, condition), ONE copy, saved parked in the district where the trip ended (never sent back to Pikine)', fin.info.seed === uid0 && fin.info.paint === paint0 && (await mine()) === 1 && fin.info.asset?.uid === asset0?.uid && fin.info.asset?.condition <= asset0?.condition && fin.info.record?.hub === fin.hub, JSON.stringify({ record: fin.info.record, before: asset0 && { uid: asset0.uid, c: asset0.condition }, after: fin.info.asset && { uid: fin.info.asset.uid, c: fin.info.asset.condition } }));
check('no JavaScript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
