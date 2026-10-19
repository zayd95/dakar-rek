// Pikine Street DNA, phase 2: checks on the slice (src/game/pikineDna.ts). Local only.
//  - the slice exists once, in one mesh and one material, within a triangle budget; Low keeps the static pieces only
//  - nothing solid stands on another collider, in the crowd's pavement lanes (PAVE: 5.05–5.95 m from a road's centre line), or on the walk
//  - the walk (room → avenue → gare → grand-place → shops' court) is clear of the slice for the game's 0.5 m body, and the slice is the same on every load
//  - the places and the way out the hub already had are all still there; leaving Pikine drops the slice
// Usage: node scripts/check-pikine-dna.mjs [baseUrl]   (without it, serves dist with vite preview on a free port)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { ROUTE_PATH } from './pikine-route.mjs';

const given = process.argv[2];
let server, base = given;
if (!given) {
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r));
  base = `http://127.0.0.1:${port}/`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch { /* */ } await new Promise(r => setTimeout(r, 150)); }
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const LANES = [[-60, true, -64, 116], [-60, false, -60, -2], [60, false, -64, -4]];   // [centre, runs along z, from, to] (src/game/pikineDna.ts LINES)
const HAD = ['pikine:home:11', 'pikine:station', 'pikine:city:square', 'pikine:city:salon-tech', 'pikine:city:boutique', 'pikine:cafe:02', 'pikine:city:bank', 'pikine:dibiterie:11', 'pikine:arena', 'pikine:gare:apprenti', 'pikine:walk:north', 'pikine:walk:south'];
async function load(quality, hub = 'pikine') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } }, quality);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch`);
  await page.waitForFunction(() => window.__dakar?.pos?.()?.hub, null, { timeout: 240000 });
  await page.evaluate(h => window.__dakar.teleport(h), hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, { timeout: 240000 });
  await page.waitForTimeout(2500);
  return { ctx, page };
}
const snap = page => page.evaluate(() => {
  const d = window.__dakar, meshes = []; d.three.scene.traverse(o => { if (o.name === 'pikine_dna') meshes.push({ tris: o.geometry.attributes.position.count / 3, material: Array.isArray(o.material) ? o.material.length : 1 }); });
  return { items: d.pikineDna(), stats: d.pikineDnaStats(), meshes, colliders: d.cityGeometry().colliders.map(c => [c.x0, c.z0, c.x1, c.z1, c.h]), ids: d.interactables().map(i => i.id) };
});
try {
  // medium: the full slice
  const m = await load('medium'); const a = await snap(m.page);
  const kinds = {}; for (const i of a.items) kinds[i.kind.split(':')[0]] = (kinds[i.kind.split(':')[0]] ?? 0) + 1;
  console.log('medium items', JSON.stringify(kinds), 'tris', a.stats.tris);
  assert.equal(a.meshes.length, 1, 'one slice mesh'); assert.equal(a.meshes[0].material, 1, 'one material');
  assert.ok(a.stats.tris < 30000, `triangle budget: ${a.stats.tris}`);
  for (const k of ['mural', 'gate', 'shop', 'pole', 'baobab', 'portal', 'gateway', 'planter', 'standpipe']) assert.ok(kinds[k] > 0, `a ${k} was placed`);
  assert.equal(kinds.gateway, 4, 'the grand-place and the market gateways: four pillars'); assert.equal(kinds.portal, 2, 'the gare portal: two pylons');
  console.log('PASS the slice: one mesh, one material, within budget, every kind of piece placed');

  const solids = a.items.filter(i => i.solid && i.rect);
  const overlap = (r, c) => r.x0 < c[2] && r.x1 > c[0] && r.z0 < c[3] && r.z1 > c[1];
  const bad = solids.filter(i => a.colliders.filter(c => overlap(i.rect, c)).length !== 1);   // itself only (its own collider)
  assert.equal(bad.length, 0, 'solid pieces stand on another collider: ' + JSON.stringify(bad.slice(0, 3).map(b => [b.kind, b.x, b.z])));
  console.log(`PASS ${solids.length} solid pieces stand on no other collider`);

  const inLane = solids.filter(i => LANES.some(([c, alongZ, from, to]) => {
    const [lo, hi] = alongZ ? [i.rect.x0, i.rect.x1] : [i.rect.z0, i.rect.z1], [t0, t1] = alongZ ? [i.rect.z0, i.rect.z1] : [i.rect.x0, i.rect.x1];
    if (t1 < from || t0 > to) return false;
    const near = Math.min(Math.abs(lo - c), Math.abs(hi - c)), far = Math.max(Math.abs(lo - c), Math.abs(hi - c)), straddle = lo < c && hi > c;
    return straddle || (near <= 5.95 && far >= 5.05 && near < 6.2);
  }));
  assert.equal(inLane.length, 0, 'solid pieces in the crowd’s pavement lanes: ' + JSON.stringify(inLane.slice(0, 4).map(b => [b.kind, +b.x.toFixed(1), +b.z.toFixed(1)])));
  console.log('PASS no solid piece in the pavement lanes (5.05–5.95 m from the road’s centre line) or on the roadway');

  // the walk against the slice's own colliders (the road events' cones and barrows, which come and go with the city's day, are not the slice's: listed, not failed)
  const R = 0.5, stuck = [], others = [];
  const hit = (list, x, z) => list.find(c => c[4] > 0.5 && x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R);
  const mine = solids.map(i => [i.rect.x0, i.rect.z0, i.rect.x1, i.rect.z1, i.rect.h]);
  for (let i = 1; i < ROUTE_PATH.length; i++) {
    const [ax, az] = ROUTE_PATH[i - 1], [bx, bz] = ROUTE_PATH[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      if (hit(mine, x, z)) { stuck.push([i, +x.toFixed(1), +z.toFixed(1)]); break; }
      if (hit(a.colliders, x, z)) { others.push([i, +x.toFixed(1), +z.toFixed(1)]); break; }
    }
  }
  assert.equal(stuck.length, 0, 'the slice blocks the walk: ' + JSON.stringify(stuck));
  console.log(`PASS the whole walk (${ROUTE_PATH.length - 1} legs) is clear of the slice for a 0.5 m body` + (others.length ? ` (today's road events block ${others.length} leg(s) at ${JSON.stringify(others)}: not the slice's)` : ''));

  for (const id of HAD) assert.ok(a.ids.includes(id), `the hub still has ${id}`);
  console.log(`PASS the ${HAD.length} places and ways out the hub already had are all there`);

  await m.page.reload(); await m.page.waitForFunction(() => window.__dakar?.pos?.()?.hub, null, { timeout: 240000 });
  await m.page.evaluate(() => window.__dakar.teleport('pikine')); await m.page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 }); await m.page.waitForTimeout(2500);
  const again = await snap(m.page);
  assert.deepEqual(again.items, a.items, 'the same pieces at the same places on every load');
  console.log('PASS the same slice on every load (seeded, no stream shared with the hub)');

  await m.page.evaluate(() => window.__dakar.teleport('plateau')); await m.page.waitForFunction(() => window.__dakar.pos().hub === 'plateau', null, { timeout: 240000 }); await m.page.waitForTimeout(2000);
  const away = await snap(m.page);
  assert.equal(away.meshes.length, 0, 'no slice outside Pikine'); assert.equal(away.items.length, 0);
  await m.page.evaluate(() => window.__dakar.teleport('pikine')); await m.page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 }); await m.page.waitForTimeout(2000);
  const back = await snap(m.page); assert.equal(back.meshes.length, 1, 'one slice again after coming back (the first one was dropped)');
  console.log('PASS the slice is dropped with the hub and made once on return');
  await m.ctx.close();

  // low: the static pieces only (no wires, bunting, kerb paint, props)
  const l = await load('low'); const b = await snap(l.page);
  const lk = {}; for (const i of b.items) lk[i.kind.split(':')[0]] = (lk[i.kind.split(':')[0]] ?? 0) + 1;
  console.log('low items', JSON.stringify(lk), 'tris', b.stats.tris);
  assert.equal(b.meshes.length, 1); assert.ok(b.stats.tris < a.stats.tris, 'Low draws fewer triangles'); assert.ok(!lk.pole && !lk.standpipe && !lk.planter, 'no overhead layer or props on Low');
  assert.ok(lk.mural > 0 && lk.gate > 0 && lk.baobab === 1 && lk.portal === 2, 'the walls, gates and landmarks stay on Low');
  console.log('PASS Low keeps the walls, gates and landmarks, drops the overhead layer and props');
  await l.ctx.close();
  assert.equal(errors.length, 0, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('PASS no page errors');
} finally { await browser.close(); server?.kill(); }
