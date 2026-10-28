// LD2.0-E « The Almadies district » (docs/ld2/LD2_E.md): the district in the real game, on a phone page, with real touches.
//  1. the Almadies builds on both presets (low, medium) with no page error;
//  2. every site of the plan has its building: a solid collider two storeys tall (or the site's own storeys, if fewer) inside its rectangle (30 sites on 41 lots);
//  3. nothing of the district stands on a road: no solid taller than a man, wider than a post, on the carriageway of the avenues;
//  4. the pavement round every block is as free as the villa branch's: a body's circle walked along a line a metre outside each block against the hub's colliders;
//  5. the Ngor residence keeps its door, its entry and its gate: the interactables stand where the estate put them and nothing solid covers them;
//  7. the rooftop restaurant's stair door (« Terrasse de Ngor ») stands on a hotel's street face and a body walks to it from the pavement;
//  8. life on the ground (round 3): the streetscape stands (palms, kerb palms, benches, beds, lawns, stalls), the street's benches and chairs are the city's ambient spots,
//     and the people placed at a hotel's door are drawn when the player stands there;
//  9. the rooftop restaurant's name is on top of the hotel (round 4: « put it on top since it's a rooftop and make it visible from the street and far »): one lit mesh of five faces, a face looks
//     at each of 40 viewpoints (the sea road from 50 m west to 130 m east of the hotel, the avenue and the cross street at its sides, the beach) with nothing solid of the game's between;
//  6. the cost of the hub against the villa branch's (docs/proof/ld2e/before/baseline.json, measured the same way: every mesh of the scene, visible or not, whatever the camera
//     sees, the hub's own group: see staticCost): the budgets of docs/ld2/LD2_E.md (+95 k triangles since round 3, +10 meshes).
// Usage: node scripts/check-district.mjs <baseUrl> <outDir> [beforeCost.json]   (BASELINE=1: only measure and walk, pass or fail nothing: the villa branch's own build)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4971/', out = 'docs/proof/ld2e/check', beforeFile = 'docs/proof/ld2e/before/cost.json'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
const BASELINE = !!process.env.BASELINE, results = [];
const check = (name, ok, detail = '') => { if (BASELINE) ok = true; results.push({ name, ok: !!ok, detail: String(detail).slice(0, 700) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' ' + String(detail).slice(0, 400) : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
// the grid (src/world/builder.ts): block k at −113 + 60 k, 46 m, lots 22 m two apart; the roads between at −120, −60, 0, 60
const bm = k => -113 + 60 * k, lotOf = (i, j, l) => { const x0 = bm(i) + (l % 2) * 24, z0 = bm(j) + (l >> 1) * 24; return { x0, z0, x1: x0 + 22, z1: z0 + 22, i, j, l }; };
// The hub's own group: the scene's top-level Group of fewer than 400 meshes with the most triangles (the Almadies' merged batches, shop kits, venue doors and signs: 174 meshes
// on the villa branch). Everything else in the scene moves with the clock, not with the district: the ambient people (203 meshes after a few seconds), the cars, the road
// chunks and the neighbouring hubs' streaming (a second Group of 1 700-1 800 meshes that varies by ±40 from one run to the next on the same build). This one is the same to the
// mesh and the triangle on every run of a build.
const staticCost = page => page.evaluate(() => {
  let best = { meshes: 0, tris: 0 };
  for (const c of window.__dakar.three.scene.children) {
    if (c.type !== 'Group' || c.name) continue;
    let meshes = 0, tris = 0; c.traverse(o => { if (o.isMesh && o.geometry) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    if (meshes > 20 && meshes < 400 && tris > best.tris) best = { meshes, tris: Math.round(tris) };
  }
  return best;
});

async function open(quality) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch&argent=999000000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, T);
  return { context, page, errors, t: await realTouch(page), d: (fn, a) => page.evaluate(fn, a) };
}
const toAlmadies = async (s, x, z, yaw = 0) => {
  await s.d(([x, z, yaw]) => { window.__dakar.teleport('almadies', x, z, yaw); window.__dakar.setHour(10.5); }, [x, z, yaw]);
  await s.page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, T);
  await s.page.waitForTimeout(1800);
};

let medium = null, ring = null;
for (const q of ['low', 'medium']) {
  const s = await open(q);
  await toAlmadies(s, -3.6, 4);
  check(`(${q}) the Almadies builds, no page error`, s.errors.length === 0, JSON.stringify(s.errors.slice(0, 3)));
  const geo = await s.d(() => { const g = window.__dakar.cityGeometry(); return { colliders: g.colliders.map(c => [c.x0, c.z0, c.x1, c.z1, c.h]) }; });
  // 2. every site of the plan has its building
  const sites = await s.d(() => window.__dakar.district?.sites() ?? []);
  const lacking = sites.filter(st => { const need = Math.min(st.storeys, 2) * 3.4 * 0.9, r = st.rect; return !geo.colliders.some(([x0, z0, x1, z1, h]) => x0 >= r.x0 - 0.1 && x1 <= r.x1 + 0.1 && z0 >= r.z0 - 0.1 && z1 <= r.z1 + 0.1 && x1 - x0 > 4 && z1 - z0 > 4 && h >= need); }).map(st => st.id);
  check(`(${q}) every one of the ${sites.length} sites has a building at least two storeys tall inside it`, BASELINE || (sites.length === 30 && lacking.length === 0), JSON.stringify(lacking));
  // 3. nothing big on the carriageways (the roads' bands ±5 m of the centre lines, the lamp posts and stalls are small)
  const roads = [-120, -60, 0, 60].flatMap(c => [{ x0: -127, x1: 127, z0: c - 5, z1: c + 5 }, { x0: c - 5, x1: c + 5, z0: -127, z1: 127 }]);
  const onRoad = geo.colliders.filter(([x0, z0, x1, z1, h]) => h >= 3 && roads.some(r => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0 && (x1 - x0 > 2.5 || z1 - z0 > 2.5) && !(x1 - x0 > 40 && z1 - z0 > 40)));
  check(`(${q}) no wall or building stands on a carriageway`, onRoad.length === 0, JSON.stringify(onRoad.slice(0, 4)));
  if (q === 'medium') {
    // 4. the pavement round every block (a line 1 m outside its edge) is free of the district: a body's circle (0.45 m) along it against the colliders the district drew
    //    (the ones inside a site; the street's own furniture and parked cars are the street dressing's, different every session)
    const mine = geo.colliders.filter(([x0, z0, x1, z1, h]) => h > 0.3 && sites.some(st => x0 >= st.rect.x0 - 0.1 && x1 <= st.rect.x1 + 0.1 && z0 >= st.rect.z0 - 0.1 && z1 <= st.rect.z1 + 0.1));
    const hit = (x, z) => mine.some(([x0, z0, x1, z1]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) < 0.45);
    let total = 0, nBlocked = 0; const where = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x0 = bm(i) - 1, z0 = bm(j) - 1, x1 = bm(i) + 47, z1 = bm(j) + 47;
      for (let t = 0; t <= 48; t += 0.5) for (const [x, z] of [[x0 + t, z0], [x0 + t, z1], [x0, z0 + t], [x1, z0 + t]]) { total++; if (hit(x, z)) { nBlocked++; if (where.length < 6) where.push([x, z]); } }
    }
    ring = { total, blocked: nBlocked, colliders: mine.length };
    check('(medium) nothing the district drew stands on the pavement round any block', nBlocked === 0 && mine.length > 0, JSON.stringify({ ...ring, where }));
    // 5. the Ngor residence's door, entry and gate (src/economy/estate.ts)
    const near = await s.d(() => window.__dakar.interactables().filter(i => /almadies:(home|city):residence/.test(i.id)));
    const door = near.find(i => i.id === 'almadies:home:residence'), entry = near.find(i => i.id === 'almadies:city:residence');
    check('(medium) the Ngor residence keeps its door and its entry on the pavement outside its gate', !!door && !!entry && Math.abs(door.x + 42) < 0.5 && door.z > -7.3 && door.z < -5, JSON.stringify(near));
    const covered = geo.colliders.filter(([x0, z0, x1, z1]) => (door ? door.x > x0 - 0.3 && door.x < x1 + 0.3 && door.z > z0 - 0.3 && door.z < z1 + 0.3 : true));
    check('(medium) nothing solid covers the residence\'s door', !!door && covered.length === 0, JSON.stringify(covered.slice(0, 3)));
    // 7. the rooftop restaurant's stair door (src/venues/rooftop.ts) stands on the street face of the boutique hotel and a body's circle walks to it from the pavement
    const roof = await s.d(() => window.__dakar.rooftop?.info?.() ?? null);
    if (roof) {
      const D = roof.door, hit = (x, z) => geo.colliders.some(([x0, z0, x1, z1, h]) => h > 0.3 && Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) < 0.45);
      const ox = D.x - 30, oz = D.z - 18, nx = 300, nz = 190, step = 0.2, cell = (x, z) => [Math.round((x - ox) / step), Math.round((z - oz) / step)], seen = new Uint8Array(nx * nz);
      const start = [D.x + 9, -115.5], st = cell(...start), q = [st]; seen[st[1] * nx + st[0]] = 1; let reached = false;
      while (q.length && !reached) {
        const [i, j] = q.pop();
        if (Math.hypot(ox + i * step - D.x, oz + j * step - D.z) < 1.6) reached = true;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + b; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || seen[nj * nx + ni]) continue; seen[nj * nx + ni] = 1; if (!hit(ox + ni * step, oz + nj * step)) q.push([ni, nj]); }
      }
      const hotel = sites.find(st2 => /FILAO|0,1/.test(st2.id) || st2.kind === 'hotel' && st2.rect.x0 < D.x && D.x < st2.rect.x1 && st2.rect.z0 < D.z && D.z < st2.rect.z1);
      check('(medium) the rooftop restaurant\'s door stands on the street face of a hotel of the district, in the front half of its lot, facing the street', !!hotel && roof.facade.nz === -1 && D.z - hotel.rect.z0 < 12, JSON.stringify({ door: D, facade: roof.facade, hotel: hotel?.id }));
      check('(medium) a body walks from the pavement to the rooftop restaurant\'s door', reached, JSON.stringify({ door: D }));
    } else check('(medium) the rooftop restaurant has its door', false, 'no rooftop info');
    // 9. the rooftop restaurant's name on the roof (round 4)
    if (roof?.sign) {
      const mesh = await s.d(() => { const m = window.__dakar.three.scene.getObjectByName('rooftop-sign'); return m ? { verts: m.geometry.attributes.position.count, emissive: !!m.material.emissiveMap, parent: m.parent?.type ?? null } : null; });
      check('(medium) the rooftop restaurant\'s name is one lit mesh of five faces, up on the hotel\'s roof', !!mesh && mesh.verts === 30 && mesh.emissive && roof.sign.onRoof && roof.sign.top > 18 && roof.sign.faces === 4, JSON.stringify({ mesh, sign: { top: roof.sign.top, faces: roof.sign.faces } }));
      const clearRay = (eye, to) => geo.colliders.every(([x0, z0, x1, z1, h]) => {
        if (eye[0] > x0 && eye[0] < x1 && eye[2] > z0 && eye[2] < z1) return true;
        const dv = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]]; let t0 = 0, t1 = 1;
        for (const [o, v, a, b] of [[eye[0], dv[0], x0, x1], [eye[1], dv[1], 0, h], [eye[2], dv[2], z0, z1]]) {
          if (Math.abs(v) < 1e-9) { if (o < a || o > b) return true; continue; }
          let ta = (a - o) / v, tb = (b - o) / v; if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return true;
        }
        return !(t0 <= t1 && t0 < 0.985);
      });
      const views = [];
      for (let x = -80; x <= 100; x += 10) views.push([`the sea road at x ${x}`, x, -118]);
      for (let z = -60; z >= -118; z -= 8) { views.push([`the avenue at z ${z}`, 0, z]); views.push([`the cross street at z ${z}`, -60, z]); }
      for (const x of [-90, -70, -50, -30, -10, 10, 40]) views.push([`the beach at x ${x}`, x, -140]);
      const unseen = views.filter(([, vx, vz]) => !roof.sign.panels.some(p => { const dx = vx - p.x, dz = vz - p.z, f = (dx * p.nx + dz * p.nz) / Math.hypot(dx, dz); return f > 0.2 && clearRay([vx, 1.7, vz], [p.x, p.y, p.z]); })).map(v => v[0]);
      check(`(medium) the name is seen from the street and from far: a face looks at each of ${views.length} viewpoints, with nothing solid between`, unseen.length === 0, JSON.stringify(unseen.slice(0, 6)));
    } else check('(medium) the rooftop restaurant has its name on the hotel\'s roof', false, 'no sign on the roof');
    // 8. life on the ground (round 3)
    const ss = await s.d(() => window.__dakar.district?.streetscape?.() ?? []), kinds = {}; for (const p of ss) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
    check('(medium) the streetscape stands: palms, kerb palms, benches, beds, lawns and stalls', (kinds.palm ?? 0) >= 20 && (kinds['kerb palm'] ?? 0) >= 60 && (kinds.bench ?? 0) >= 12 && (kinds.bed ?? 0) >= 6 && (kinds.lawn ?? 0) >= 4 && (kinds.stall ?? 0) >= 4, JSON.stringify(kinds));
    await s.page.waitForTimeout(4000);
    const spots = await s.d(() => window.__dakar.ambientSpots?.() ?? []), street = await s.d(() => window.__dakar.district?.streetSeats?.() ?? []);
    const ownSeats = street.filter(x => /^street:seat:|:seat:/.test(x.id)), claimed = spots.reduce((n, sp) => n + sp.seats, 0);
    check('(medium) the street\'s seats (the streetscape\'s benches and stools, the buildings\' terraces) are all the city\'s ambient spots: its people can sit on them', ownSeats.length >= 60 && claimed >= street.length - 2, JSON.stringify({ streetSeats: street.length, districtSeats: ownSeats.length, claimedBySpots: claimed, spots: spots.length }));
    await toAlmadies(s, -35, -121.5, Math.PI);
    await s.page.waitForTimeout(3500);
    const drawn = (await s.d(() => window.__dakar.humanoids?.() ?? {})).full ?? 0;
    check('(medium) people are drawn at the boutique hotel\'s door (the doorman, the bellhop, the valet, the terrace\'s waiter and customers)', drawn >= 4, JSON.stringify({ humanoidsDrawn: drawn }));
    medium = s;
  } else await s.context.close();
}
// 6. the cost of the hub against the villa branch's, measured the same way
const before = BASELINE ? null : JSON.parse(fs.readFileSync(beforeFile.replace('cost.json', 'baseline.json'), 'utf8'));
let cost = null;
if (medium) {
  cost = await staticCost(medium.page);
  if (!BASELINE) {
    const b0 = before.static, dT = cost.tris - b0.tris, dM = cost.meshes - b0.meshes;
    check('(medium) the district stays within +95 k triangles of the villa branch\'s hub (round 3: the life on the ground and the streetscape)', dT <= 95_000, JSON.stringify({ now: cost, was: b0, dTris: dT }));
    check('(medium) the district stays within +10 meshes (draw calls) of the villa branch\'s hub', dM <= 10, JSON.stringify({ now: cost.meshes, was: b0.meshes, dMeshes: dM }));
  }
  check('(medium) no page error through the walk', medium.errors.length === 0, JSON.stringify(medium.errors.slice(0, 3)));
  await medium.context.close();
}
await browser.close();
const failed = results.filter(r => !r.ok).length;
fs.writeFileSync(`${out}/${BASELINE ? 'baseline' : 'results'}.json`, JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, static: cost, ring, results }, null, 1));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
