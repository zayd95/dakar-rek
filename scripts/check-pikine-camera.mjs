// Pikine Street DNA: the slice against the phone's follow camera. A scripted walker (as in walk-pikine-route.mjs: real input and
// collision, the game paused and stepped) walks the route; at every sample the page tests, against the slice's own triangles:
//   - the body: segments from the camera to four points of the avatar (feet, waist, chest, head): any hit is the slice between the lens and the player
//   - the way ahead: segments to the path 3, 6 and 10 m ahead at eye height: a pole, a board or a pylon standing in the view down the street
//   - the lens: the distance from the camera to the nearest piece of the slice off the ground: under 0.6 m a board or a wire is in the near plane
//   - the sky of the street: the height of the camera against the lowest wire, board or beam it passes under
// Flagged frames are saved as screenshots. Usage: node scripts/check-pikine-camera.mjs [baseUrl] [outDir] [route|home|kerb] [--strict]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { ROUTE_PATH, HOME_PATH } from './pikine-route.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--')), strict = process.argv.includes('--strict');
const base = args[0] ?? 'http://127.0.0.1:4323/', out = args[1] ?? 'shots/pikine-camera', which = args[2] ?? 'route';
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const KERB = [[-57.6, -50], [-57.6, 56], [-62.4, 56], [-62.4, -50]];                        // the two side lanes of the avenue, 2.4 m off the centre line (the existing stalls stand on the pavement lanes beyond)
const PATH = which === 'kerb' ? KERB.slice(1) : which === 'home' ? HOME_PATH.slice(1) : [[-42, -59], [-60, -60], [-60, 60], [-26, 60], [-26, 86], [-26, 62], [-63, 62], [-63, 92], [-100, 92]];
const START = which === 'kerb' ? { x: KERB[0][0], z: KERB[0][1] } : which === 'home' ? { x: HOME_PATH[0][0], z: HOME_PATH[0][1] } : { x: -42, z: -56.5 };
const YAW0 = which === 'home' ? -Math.PI / 2 : which === 'kerb' ? 0 : Math.PI;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.teleport('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.setHour(11)); await page.waitForTimeout(2500);
// the slice's triangles off the ground, once
await page.evaluate(() => {
  let mesh = null; window.__dakar.three.scene.traverse(o => { if (o.name === 'pikine_dna') mesh = o; });
  const a = mesh.geometry.attributes.position.array, tri = [], verts = [];
  for (let i = 0; i < a.length; i += 9) {
    const minY = Math.min(a[i + 1], a[i + 4], a[i + 7]); if (minY < 0.35 && Math.max(a[i + 1], a[i + 4], a[i + 7]) < 0.6) continue;   // ground decals, kerb paint
    tri.push(a.subarray(i, i + 9));
  }
  const seen = new Set(); for (const t of tri) for (let k = 0; k < 9; k += 3) { const key = `${Math.round(t[k] * 20)},${Math.round(t[k + 1] * 20)},${Math.round(t[k + 2] * 20)}`; if (!seen.has(key)) { seen.add(key); verts.push(t[k], t[k + 1], t[k + 2]); } }
  const hit = (o, e) => {                                                    // segment o→e against every triangle (Möller–Trumbore)
    const dx = e[0] - o[0], dy = e[1] - o[1], dz = e[2] - o[2];
    for (const t of tri) {
      const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2], e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = o[0] - t[0], ty = o[1] - t[1], tz = o[2] - t[2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
      const s = (e2x * qx + e2y * qy + e2z * qz) * inv; if (s > 0.02 && s < 0.98) return true;
    }
    return false;
  };
  window.__camAudit = { tri: tri.length, hit, near(c) { let m = 1e9; for (let i = 0; i < verts.length; i += 3) { const d = Math.hypot(verts[i] - c.x, verts[i + 1] - c.y, verts[i + 2] - c.z); if (d < m) m = d; } return m; } };
});
await page.evaluate(([x, z, yaw]) => { const d = window.__dakar; d.place(x, z, yaw); d.pause(true); }, [START.x, START.z, YAW0]);
await page.keyboard.down('ArrowUp');
const FRAMES = 16, DT = 1 / 60;
let n = 0, leg = 0, yaw = YAW0, stuck = 0, lastP = null; const flagged = [], samples = [];
while (leg < PATH.length && n < 2400) {
  const r = await page.evaluate(([yaw, frames, dt]) => { const d = window.__dakar; d.lookYaw(yaw); const p = d.step(dt, frames); d.render(); return p; }, [yaw, FRAMES, DT]);
  if (lastP && Math.hypot(r.x - lastP.x, r.z - lastP.z) < 0.05) { if (++stuck > 30) { console.log(`walker stuck at ${r.x.toFixed(1)}, ${r.z.toFixed(1)} going to ${PATH[leg]}`); break; } } else stuck = 0;
  lastP = { x: r.x, z: r.z };
  const [tx, tz] = PATH[leg], dx = tx - r.x, dz = tz - r.z;
  if (Math.hypot(dx, dz) < 1.0) { leg++; continue; }
  const want = Math.atan2(dx, dz); let da = want - yaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; yaw += Math.max(-0.22, Math.min(0.22, da));
  const m = await page.evaluate(([px, pz, h]) => {
    const A = window.__camAudit, c = window.__dakar.three.camera.position, o = [c.x, c.y, c.z];
    let body = 0; for (const y of [0.2, 0.8, 1.4, 1.8]) if (A.hit(o, [px, y, pz])) body++;
    let ahead = 0; for (const d of [3, 6, 10]) if (A.hit(o, [px + Math.sin(h) * d, 1.0, pz + Math.cos(h) * d])) ahead++;
    return { cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], body, ahead, near: +A.near(c).toFixed(2) };
  }, [r.x, r.z, yaw]);
  const s = { n, x: +r.x.toFixed(1), z: +r.z.toFixed(1), ...m }; samples.push(s);
  if (m.body > 0 || m.near < 0.6 || m.ahead >= 2) { flagged.push(s); if (flagged.length <= 12) await page.screenshot({ path: `${out}/${String(n).padStart(4, '0')}-b${m.body}-n${m.near}-a${m.ahead}.png` }); }
  n++;
}
await page.keyboard.up('ArrowUp');
const sum = { route: which, samples: n, triangles: await page.evaluate(() => window.__camAudit.tri), cameraHeight: [Math.min(...samples.map(s => s.cam[1])), Math.max(...samples.map(s => s.cam[1]))].map(v => +v.toFixed(2)),
  bodyBlockedFrames: samples.filter(s => s.body > 0).length, nearLensFrames: samples.filter(s => s.near < 0.6).length, minLens: Math.min(...samples.map(s => s.near)), viewBlockedFrames: samples.filter(s => s.ahead >= 2).length, errors: errors.length };
fs.writeFileSync(`${out}/camera.json`, JSON.stringify({ sum, flagged }, null, 1));
console.log(JSON.stringify(sum)); if (flagged.length) console.log('first flagged', JSON.stringify(flagged.slice(0, 8)));
await browser.close();
if (strict && (sum.bodyBlockedFrames || sum.nearLensFrames || sum.viewBlockedFrames)) process.exit(1);
