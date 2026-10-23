// The roads between districts, as a driver sees them (src/road/chunks.ts), with real touch for the drives:
//   checkpoint  the police checkpoint's rond-point on the way into the Plateau from Pikine: the Teranga driven through it into the Plateau and back out,
//               each way in its lane, checked for any impact or hold that no one sees; pictures and a film
//   sellers     the flower and plant sellers on two roads (Pikine → Plateau seen from Pikine, Pikine → Almadies seen from the Almadies), by day and at
//               night, with the frame's draw calls and triangles and what the sellers' chunk costs (meshes, people)
// Headless Chromium + SwiftShader: a software renderer, NOT a phone.
//
// Usage: node scripts/check-roadside.mjs <baseUrl> <outDir> <checkpoint|sellers> [quality=medium]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch, pilot, boardVehicle } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4641/', outRoot = '/tmp/claude-0/beta/world/roadside', mode = 'sellers', quality = 'medium'] = process.argv.slice(2);
const out = `${outRoot}/${mode}`;
fs.mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ...(mode === 'checkpoint' ? { recordVideo: { dir: `${out}/raw`, size: viewport } } : {}) });
await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 500)}`); };
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.jpg`, quality: 72 }); };
await page.goto(`${base}?debug&touch&heure=11&argent=100000000`, { timeout: 180000 });
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
const goHub = async (hub, x, z) => { await d(([h, x, z]) => window.__dakar.teleport(h, x, z, 0), [hub, x, z]); await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, { timeout: 240000 }); await page.waitForTimeout(3000); };
const roadAt = (id, s, lat = 0) => d(([id, s, lat]) => window.__dakar.road.at(id, s, lat), [id, s, lat]);
const length = (id, mouth) => d(([x, z]) => window.__dakar.road.project(x, z)?.length, [mouth.x, mouth.z]);
/** A view along the road: the camera `back` metres before arc length `s`, `up` high, at lateral `camLat`, looking at (`s`, `lat`). */
const look = async (id, s, lat, { back = 14, up = 3.2, camLat = 0, standLat = camLat } = {}) => {
  const c = await roadAt(id, s - back, camLat), t = await roadAt(id, s, lat), p = await roadAt(id, s - back + 4, standLat);
  await d(([x, z, y]) => window.__dakar.place(x, z, y), [p.x, p.z, p.yaw]); await page.waitForTimeout(2500);
  await d(([a, b]) => window.__dakar.cam(a, b), [[c.x, up, c.z], [t.x, 1.1, t.z]]); await page.waitForTimeout(2200);
};

if (mode === 'checkpoint') {
  const ID = 'pikine-plateau';
  await goHub('plateau', -60, -110);
  const L = await length(ID, { x: -60, z: -127 }), S = L - 46;                                // RouteDef.checkpoint: 46 m before the Plateau
  // the pictures: from the way in (a driver's height and higher), from the Plateau looking out, from above
  await look(ID, S, 0, { back: 26, up: 2.6, camLat: -2.8 }); await shot('01-way-in-driver');
  await look(ID, S, 0, { back: 20, up: 7, camLat: -1 }); await shot('02-way-in-high');
  const top = await roadAt(ID, S, 0); await d(([x, z]) => window.__dakar.cam([x + 0.01, 38, z - 6], [x, 0, z]), [top.x, top.z]); await page.waitForTimeout(2000); await shot('03-from-above');
  const back = await roadAt(ID, S + 24, 2.8), tgt = await roadAt(ID, S, 0);
  await d(([a, b]) => window.__dakar.cam(a, b), [[back.x, 2.6, back.z], [tgt.x, 1.2, tgt.z]]); await page.waitForTimeout(2000); await shot('04-way-out-driver');
  await d(() => window.__dakar.setHour(21)); await look(ID, S, 0, { back: 22, up: 3.5, camLat: -2.8 }); await shot('05-night'); await d(() => window.__dakar.setHour(11));
  await d(() => window.__dakar.cam(null));
  // the island and its neighbours as the drive's own test sees them
  const solid = await d(([x, z]) => window.__dakar.road.probe(x, z, 12), [top.x, top.z]);
  console.log('solid round the rond-point:', JSON.stringify(solid));
  // the drives: a Teranga bought at Ndiaye Auto (Plateau) — through it into the Plateau, then back out the other way
  await page.waitForFunction(() => window.__dakar.teranga?.info().floor.length > 0, null, { timeout: 240000 });
  await d(() => window.__dakar.teranga.own()); await page.waitForFunction(() => window.__dakar.teranga.info().owned && window.__dakar.teranga.info().here, null, { timeout: 120000 });
  const t = await realTouch(page);
  const sampler = () => { const s = { at: [], stop: false }; (async () => { while (!s.stop) { try { const a = await d(() => { const D = window.__dakar, a = D.teranga.at(); if (!a) return null; const w = D.teranga.solidAt(a.x + Math.sin(a.yaw) * 2.4, a.z + Math.cos(a.yaw) * 2.4, 0.9); return { ...a, ahead: w && { why: w.why, rect: w.rect, foot: w.foot } }; }); if (a) s.at.push(a); await page.waitForTimeout(250); } catch { if (page.isClosed()) return; } } })(); return s; };
  for (const [name, from, to, lat] of [['into the Plateau', S - 70, null, -2.8], ['out of the Plateau', null, S - 70, 2.8]]) {
    let start, pts;
    if (from !== null) { start = await roadAt(ID, from, lat); pts = [await roadAt(ID, S - 20, lat), await roadAt(ID, S + 20, lat), { x: -62.1, z: -116 }]; }
    else { start = { x: -57.9, z: -104, yaw: Math.PI }; pts = [await roadAt(ID, S + 20, lat), await roadAt(ID, S - 20, lat), await roadAt(ID, to, lat)]; }
    const yaw = from !== null ? start.yaw : Math.PI;
    await d(([x, z, y]) => window.__dakar.teranga.place(x, z, y), [start.x, start.z, yaw]);
    if (!(await d(() => window.__dakar.teranga.info().driving))) { await d(([x, z, y]) => window.__dakar.place(x + Math.cos(y) * 2.4, z - Math.sin(y) * 2.4, y), [start.x, start.z, yaw]); await page.waitForTimeout(600); await boardVehicle(page, t, 'teranga'); }
    await page.waitForTimeout(500); await d(() => window.__dakar.teranga.feelReset());
    const s = sampler();
    const last = await pilot(page, t, 'teranga', pts.map(p => ({ x: p.x, z: p.z, tol: 3, speed: 7 })), { cruise: 7, stall: 15000, brakeAtEnd: true, ms: 600000 });
    s.stop = true;
    const end = pts[pts.length - 1], felt = await d(() => window.__dakar.teranga.feel());
    const near = s.at.filter(a => Math.hypot(a.x - top.x, a.z - top.z) < 25), passed = near.length > 0;
    const held = s.at.filter(a => Math.abs(a.speed) < 0.8 && Math.hypot(a.x - end.x, a.z - end.z) > 12 && s.at.indexOf(a) > s.at.findIndex(b => b.speed > 3) && a.ahead);
    const minLat = near.length ? Math.min(...near.map(a => Math.hypot(a.x - top.x, a.z - top.z))) : null;
    check(`checkpoint, ${name}: driven past the island in its lane, no impact, never held by anything`, Math.hypot(last.x - end.x, last.z - end.z) < 5 && passed && felt.impacts.length === 0 && held.length === 0,
      JSON.stringify({ end: [last.x, last.z], nearestToIsland: minLat, impacts: felt.impacts, held: held.slice(0, 3) }));
    await shot(`06-drive-${name.replace(/ /g, '-')}`);
  }
} else {
  // the sellers: two roads, by day and at night (src/road/chunks.ts: a seller's pots stand 7.55–9.85 m from the centre line, `side` +1 on the left of a → b)
  const views = [
    { hub: 'pikine', at: [-60, 120], road: 'pikine-plateau', sellers: [[543, 1], [337, 1]] },
    { hub: 'almadies', at: [120, -60], road: 'pikine-almadies', sellers: [[914, -1], [820, 1]] },
  ];
  for (const v of views) {
    await goHub(v.hub, v.at[0], v.at[1]);
    for (const [s, side] of v.sellers) for (const hour of [11, 21]) {
      await d(h => window.__dakar.setHour(h), hour);
      await look(v.road, s, side * 8.6, { back: 13, up: 2.4, camLat: -side * 1.5, standLat: -side * 4 });
      const info = await d(([id, s]) => {
        const D = window.__dakar, calls = D.drawCalls(), tris = D.tris();
        // the chunk the seller stands on: its meshes (merged roadside and ground) and its people, as drawn now
        let chunk = null; D.three.scene.traverse(o => { if (o.name === `road:${id}:${Math.floor(s / 100)}`) chunk = o; });
        let merged = 0, people = 0, peopleMeshes = 0;
        if (chunk) for (const c of chunk.children) { if (c.isMesh) merged++; else if (c.visible) { people++; c.traverse(m => { if (m.isMesh && m.visible) peopleMeshes++; }); } }
        return { calls, tris, chunkMeshes: merged, peopleDrawn: people, meshesPerPerson: people ? +(peopleMeshes / people).toFixed(1) : null };
      }, [v.road, s]);
      console.log(`${v.road} s ${s} side ${side} at ${hour} h:`, JSON.stringify(info));
      results.push({ name: `${v.road} ${s} ${hour}h`, ok: true, detail: info });
      await shot(`${v.road}-${s}-${hour}h`);
      await d(() => window.__dakar.cam(null));
    }
  }
}

fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, mode, quality, failed, results, errors: errors.slice(0, 10) }, null, 1));
const raw = page.video() ? await page.video().path() : null;
await context.close(); await browser.close();
if (raw) { try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-vf', 'setpts=0.5*PTS,scale=360:-2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '32', '-preset', 'veryfast', '-movflags', '+faststart', `${out}/${mode}.mp4`]); } catch (e) { console.log('ffmpeg', e.message); } }
console.log(`${results.length - failed}/${results.length} passed`, errors.length ? `page errors: ${errors.slice(0, 3).join(' / ')}` : '');
process.exit(failed ? 1 : 0);
