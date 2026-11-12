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
import { ROUTE_PATH, HOME_PATH, ARENA_PATHS } from './pikine-route.mjs';

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
const LANES = [[-60, true, -64, 116], [-60, false, -60, -2], [60, false, -64, -4], [-60, false, 2, 60]];   // [centre, runs along z, from, to] (src/game/pikineDna.ts LINES)
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
  for (const k of ['mural', 'shop', 'pole', 'baobab', 'portal', 'gateway', 'planter', 'standpipe', 'bank-sign']) assert.ok(kinds[k] > 0, `a ${k} was placed`);
  assert.ok(kinds.pole >= 12, `poles on the room's road too: ${kinds.pole}`);
  assert.equal(kinds.gateway, 6, 'the grand-place, the market and the arena street gateways: six pillars'); assert.equal(kinds.portal, 2, 'the gare portal: two pylons');
  console.log('PASS the slice: one mesh, one material, within budget, every kind of piece placed');

  // the arena street: the slice dresses it (a gateway, shops, walls, life) and keeps clear of the gate's own ground
  const arena = a.items.filter(i => i.x > 2 && i.x < 60 && i.z > -70 && i.z < -50), open = await m.page.evaluate(() => window.__dakar.pikineDnaOpen());
  assert.ok(arena.some(i => i.kind === 'gateway') && arena.some(i => i.kind === 'shop') && arena.some(i => i.kind === 'mural') && arena.some(i => ['jerseys', 'grill', 'tea', 'tontine'].includes(i.kind)), 'the arena street has its gateway, a shop, a mural and some life: ' + JSON.stringify(arena.map(i => i.kind)));
  assert.ok(open.length >= 5, 'the gate’s open ground is known: ' + open.length);
  const onOpen = a.items.filter(i => i.rect && open.some(o => i.rect.x0 < o.x1 && i.rect.x1 > o.x0 && i.rect.z0 < o.z1 && i.rect.z1 > o.z0));
  assert.equal(onOpen.length, 0, 'pieces on the arena gate’s queue, apron, stalls or fans’ corners: ' + JSON.stringify(onOpen.slice(0, 4).map(i => [i.kind, +i.x.toFixed(1), +i.z.toFixed(1)])));
  console.log(`PASS the arena street: ${arena.length} pieces (gateway, shops, walls, life), none on the gate's queue, apron, stalls or the fans' corners`);

  // rhythm: along each stretch of house frontage of the avenue (east z −51…−8, west z 8…51) the wall units come in clusters (almost
  // touching) with empty stretches between and at the ends, not at an even pace
  const wallKinds = ['mural', 'gate', 'shop', 'rough'], zones = [{ name: 'east', x: -52.9, z0: -51.4, z1: -8 }, { name: 'west', x: -67.1, z0: 8.6, z1: 51 }];
  const rhythm = [];
  for (const zn of zones) {
    const us = a.items.filter(i => wallKinds.includes(i.kind) && i.rect && Math.abs(i.x - zn.x) < 0.6 && i.rect.z1 > zn.z0 && i.rect.z0 < zn.z1).map(i => i.rect).sort((p, q) => p.z0 - q.z0);
    const empties = us.length ? [us[0].z0 - zn.z0, zn.z1 - us[us.length - 1].z1] : [zn.z1 - zn.z0];
    const touching = [];
    for (let k = 1; k < us.length; k++) { const g = us[k].z0 - us[k - 1].z1; (g <= 2 ? touching : empties).push(g); }
    const covered = us.reduce((t, r) => t + (r.z1 - r.z0), 0) / (zn.z1 - zn.z0);
    rhythm.push({ zone: zn.name, units: us.length, touching: touching.length, longestEmpty: +Math.max(...empties).toFixed(1), covered: +covered.toFixed(2) });
  }
  console.log('rhythm', JSON.stringify(rhythm));
  assert.ok(rhythm.some(r => r.touching >= 2), 'a cluster: units almost touching'); assert.ok(rhythm.every(r => r.longestEmpty >= 8), 'an empty stretch of 8 m or more on each side'); assert.ok(rhythm.every(r => r.covered < 0.8), 'not a continuous wall');
  console.log('PASS the wall units come in clusters with empty stretches, not at an even pace');

  // night: the warm pools are off at noon and on in the evening
  const pools = h => m.page.evaluate(async hour => { window.__dakar.setHour(hour); const look = () => { let o = null; window.__dakar.three.scene.traverse(x => { if (x.name === 'pikine_dna_night') o = { visible: x.visible, opacity: x.material.opacity }; }); return o; }; for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 1000)); const o = look(); if (o && o.visible === (hour >= 18)) return o; } return look(); }, h);
  const noon = await pools(12), dusk = await pools(20);
  assert.ok(noon && !noon.visible, 'no warm pools at noon: ' + JSON.stringify(noon)); assert.ok(dusk && dusk.visible && dusk.opacity > 0.3, 'warm pools at 20 h: ' + JSON.stringify(dusk));
  console.log(`PASS the warm pools follow the evening (noon off, 20 h opacity ${dusk.opacity.toFixed(2)})`);
  await m.page.evaluate(() => window.__dakar.setHour(null));

  const solids = a.items.filter(i => i.solid && i.rect);
  const overlap = (r, c) => r.x0 < c[2] && r.x1 > c[0] && r.z0 < c[3] && r.z1 > c[1];
  const bad = solids.filter(i => a.colliders.filter(c => overlap(i.rect, c)).length !== 1);   // itself only (its own collider)
  assert.equal(bad.length, 0, 'solid pieces stand on another collider: ' + JSON.stringify(bad.slice(0, 3).map(b => [b.kind, b.x, b.z])));
  console.log(`PASS ${solids.length} solid pieces stand on no other collider`);

  const inLane = solids.filter(i => LANES.some(([c, alongZ, from, to]) => {
    const [lo, hi] = alongZ ? [i.rect.x0, i.rect.x1] : [i.rect.z0, i.rect.z1], [t0, t1] = alongZ ? [i.rect.z0, i.rect.z1] : [i.rect.x0, i.rect.x1];
    if (t1 < from || t0 > to) return false;
    const near = Math.min(Math.abs(lo - c), Math.abs(hi - c)), far = Math.max(Math.abs(lo - c), Math.abs(hi - c)), straddle = lo < c && hi > c;
    return straddle || near < 5.95;                                                    // any part of it in the carriageway or the pedestrian lanes
  }));
  assert.equal(inLane.length, 0, 'solid pieces in the crowd’s pavement lanes: ' + JSON.stringify(inLane.slice(0, 4).map(b => [b.kind, +b.x.toFixed(1), +b.z.toFixed(1)])));
  console.log('PASS no solid piece in the pavement lanes (5.05–5.95 m from the road’s centre line) or on the roadway');

  // the air over the road: nothing of the slice between 0.4 and 4.6 m over a carriageway (a car rapide with its luggage is 3.8 m), and nothing
  // between 3.8 and 6.2 m within 5.6 m of a centre line, where the phone's follow camera rides (5.1 m up, over the road)
  const air = await m.page.evaluate(() => {
    let mesh = null; window.__dakar.three.scene.traverse(o => { if (o.name === 'pikine_dna') mesh = o; });
    const a = mesh.geometry.attributes.position.array, roads = [-120, -60, 0, 60, 120], off = (v) => Math.min(...roads.map(c => Math.abs(v - c)));
    const veh = [], cam = [];
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2], o = Math.min(off(x), off(z));
      if (o < 5.05 && y > 0.4 && y < 4.6) veh.push([+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)]);
      if (o < 5.6 && y > 3.8 && y < 6.2) cam.push([+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)]);
    }
    return { veh: veh.length, vehAt: veh.slice(0, 4), cam: cam.length, camAt: cam.slice(0, 4) };
  });
  assert.equal(air.veh, 0, 'something in the carriageway under 4.6 m: ' + JSON.stringify(air.vehAt)); assert.equal(air.cam, 0, 'something in the phone camera’s band (3.8–6.2 m) over the road: ' + JSON.stringify(air.camAt));
  console.log('PASS the road is clear overhead: nothing under 4.6 m over a carriageway, nothing in the phone camera’s height band');

  // the walk against the slice's own colliders (the road events' cones and barrows, which come and go with the city's day, are not the slice's: listed, not failed)
  const R = 0.5, stuck = [], others = [];
  const hit = (list, x, z) => list.find(c => c[4] > 0.5 && x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R);
  const mine = solids.map(i => [i.rect.x0, i.rect.z0, i.rect.x1, i.rect.z1, i.rect.h]);
  for (const PATHS of [ROUTE_PATH, HOME_PATH, ...ARENA_PATHS]) for (let i = 1; i < PATHS.length; i++) {
    const [ax, az] = PATHS[i - 1], [bx, bz] = PATHS[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      if (hit(mine, x, z)) { stuck.push([i, +x.toFixed(1), +z.toFixed(1)]); break; }
      if (hit(a.colliders, x, z)) { others.push([i, +x.toFixed(1), +z.toFixed(1)]); break; }
    }
  }
  assert.equal(stuck.length, 0, 'the slice blocks the walk: ' + JSON.stringify(stuck));
  console.log(`PASS the whole walk and the home street (${ROUTE_PATH.length + HOME_PATH.length - 2} legs, and the arena street on three lanes) is clear of the slice for a 0.5 m body` + (others.length ? ` (today's road events block ${others.length} leg(s) at ${JSON.stringify(others)}: not the slice's)` : ''));

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
  assert.ok(lk.mural > 0 && lk.shop > 0 && lk.baobab === 1 && lk.portal === 2, 'the walls, boutiques and landmarks stay on Low');
  console.log('PASS Low keeps the walls, gates and landmarks, drops the overhead layer and props');
  await l.ctx.close();
  assert.equal(errors.length, 0, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('PASS no page errors');
} finally { await browser.close(); server?.kill(); }
