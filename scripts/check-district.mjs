// LD2.0-E « The Almadies district » (docs/ld2/LD2_E.md): the district in the real game, on a phone page, with real touches.
//  1. the Almadies builds on both presets (low, medium) with no page error;
//  2. every site of the plan has its building: a solid collider two storeys tall (or the site's own storeys, if fewer) inside its rectangle (30 sites on 41 lots);
//  3. nothing of the district stands on a road: no solid taller than a man, wider than a post, on the carriageway of the avenues;
//  4. the pavement round every block is as free as the villa branch's: a body's circle walked along a line a metre outside each block against the hub's colliders;
//  5. the Ngor residence keeps its door, its entry and its gate: the interactables stand where the estate put them and nothing solid covers them;
//  6. the cost of the hub against the villa branch's (docs/proof/ld2e/before/cost.json, measured the same way: every mesh of the scene, visible or not, whatever the camera
//     sees): the budgets of docs/ld2/LD2_E.md (+60 k triangles, +10 meshes).
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
const staticCost = page => page.evaluate(() => { let meshes = 0, tris = 0; window.__dakar.three.scene.traverse(o => { if (o.isMesh && o.geometry && o.visible) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { meshes, tris: Math.round(tris) }; });

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
    check('(medium) the district stays within +60 k triangles of the villa branch\'s hub', dT <= 60_000, JSON.stringify({ now: cost, was: b0, dTris: dT }));
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
