// Pikine Street DNA, phase 2: performance and collision numbers along the starting walk (local only, no network).
// Per waypoint: draw calls and triangles on screen, and the mean frame time (software GL: compare builds only, not absolute).
// Plus the whole hub's static geometry (meshes, triangles) and a collision sweep of the walking route against the colliders:
// every 0.25 m of the route must be clear for the game's 0.5 m body (pushOut).
// Usage: node scripts/measure-pikine-route.mjs [baseUrl] [out.json] [quality=medium]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { ROUTE_PATH, ROUTE_SHOTS } from './pikine-route.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4322/', outFile = process.argv[3] ?? 'shots/pikine-route/measure.json', quality = process.argv[4] ?? 'medium';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } }, quality);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
await page.evaluate(() => { window.__dakar.teleport('pikine'); });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
await page.evaluate(() => window.__dakar.setHour(11)); await page.waitForTimeout(2000);

const hub = await page.evaluate(() => {
  const d = window.__dakar; let meshes = 0, tris = 0, verts = 0; const seen = new Set();
  d.three.scene.traverse(o => { const g = o.geometry; if (!o.isMesh || !g || seen.has(g.uuid)) return; seen.add(g.uuid); meshes++; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; verts += g.attributes.position.count; });
  return { meshes, tris: Math.round(tris), verts, colliders: d.cityGeometry().colliders.length };
});
const points = [];
for (const [name, x, z, yaw] of ROUTE_SHOTS) {
  await page.evaluate(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [x, z, yaw]); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const d = window.__dakar; let n = 0; const t0 = performance.now();
    await new Promise(res => { const f = () => { n++; if (performance.now() - t0 > 2500) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    return { frameMs: +((performance.now() - t0) / n).toFixed(1), calls: d.drawCalls(), tris: d.tris() };
  });
  points.push({ name, ...r });
}
const frame = points.map(p => p.frameMs).sort((a, b) => a - b);
// collision sweep: the route polyline against the colliders (axis-aligned rectangles; a collider counts when it is tall enough to stop a walker)
const geo = await page.evaluate(() => window.__dakar.cityGeometry().colliders.map(c => [c.x0, c.z0, c.x1, c.z1, c.h ?? 9, c.y0 ?? 0]));
const R = 0.5, blocked = [];
for (let i = 1; i < ROUTE_PATH.length; i++) {
  const [ax, az] = ROUTE_PATH[i - 1], [bx, bz] = ROUTE_PATH[i], len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.25);
  for (let k = 0; k <= n; k++) {
    const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
    const hit = geo.find(([x0, z0, x1, z1, h, y0]) => h - y0 > 0.5 && x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R);
    if (hit) { blocked.push({ seg: i, x: +x.toFixed(2), z: +z.toFixed(2), box: hit.map(v => +v.toFixed(2)) }); break; }
  }
}
const routeLen = ROUTE_PATH.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ROUTE_PATH[i][0], p[1] - ROUTE_PATH[i][1]), 0);
const out = { quality, hub, points, frameMedianMs: frame[frame.length >> 1], callsMax: Math.max(...points.map(p => p.calls)), trisMax: Math.max(...points.map(p => p.tris)), route: { metres: Math.round(routeLen), blocked }, errors };
fs.mkdirSync(outFile.replace(/[^/]*$/, '') || '.', { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ quality, hub, frameMedianMs: out.frameMedianMs, callsMax: out.callsMax, trisMax: out.trisMax, routeMetres: out.route.metres, blocked: blocked.length, errors: errors.length }));
await browser.close();
