// LD2.0-C lane H (docs/ld2/LD2_C.md): the F2 of the Résidence Jàmm walked through on a phone page (390 × 844, real touches on the joystick).
// Own the F2, enter it by its sheet's « Entrer chez toi », then walk entrée → séjour → cuisine (its door opens) → séjour → dégagement → chambre (door)
// → dégagement → salle de bain (door) → back to the entrée → « Sortir ». At every sample: the room (`__dakar.home().room`), the player never inside a
// wall, a fitting or a door (the room's colliders), the doors open as the player comes, the player on screen and seen (the see-through hole on when a
// wall stands between the camera and the player). Pictures of each room by day and at 21 h (docs/proof/ld2c/shell, PNG under 400 kB), the draw calls
// and triangles inside the empty F2 and with a few pieces of furniture. No page errors.
// Usage: node scripts/check-apartment-walk.mjs [baseUrl] [outDir]
//   (a static build: npx vite build --outDir /tmp/claude-0/ld2c/shell/dist; node /tmp/claude-0/beta/tools/serve.mjs /tmp/claude-0/ld2c/shell/dist 4950)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4950/', out = 'docs/proof/ld2c/shell'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 400) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=50000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  const t = await realTouch(page);

  // ------------------------------------------------------------------ own the F2 and go in by its door
  await d(() => { const D = window.__dakar; D.buyAsset('appart_jamm'); D.moveIn('appart_jamm'); D.setHour(10); D.teleport('pikine'); });
  await page.waitForTimeout(2500);
  const owned = await d(() => window.__dakar.estate());
  check('the F2 is the player\'s, and their home', owned.home === 'appart_jamm' && owned.assets.some(a => a.spec === 'appart_jamm' && a.how === 'owned'), owned.home);
  await d(() => window.__dakar.assetSheet('appart_jamm'));
  const enter = page.locator('#modal.on .item', { hasText: 'Entrer chez toi' }).first();
  await enter.waitFor({ state: 'visible' }); await enter.tap();
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  const h0 = await d(() => window.__dakar.home()), p0 = await d(() => window.__dakar.pos());
  check('« Entrer chez toi »: inside the F2 built from its plan, in the entrée, inside the street door', h0?.plan === 'f2_jamm' && h0.room === 'entree' && Math.hypot(p0.x - O.x - 3.15, p0.z - O.z - 2.8) < 0.05, JSON.stringify({ h0, at: [p0.x - O.x, p0.z - O.z] }));
  check('the three inner doors are shut on arrival', h0.doors.length === 3 && h0.doors.every(x => !x.open), JSON.stringify(h0.doors));

  // ------------------------------------------------------------------ the walk
  const samples = { n: 0, worstWall: Infinity, inside: [], hidden: [], offscreen: [], rooms: new Set(), doorMax: {} };
  /** One look at the page: where the player is, what the home says, the room's colliders, where the player is on the screen. */
  const probe = () => d(() => {
    const D = window.__dakar, p = D.pos(), h = D.home(), g = D.roomGeometry(), cam = D.three.camera;
    const v = cam.position.clone().set(p.x, p.y + 0.9, p.z).project(cam);
    return { p, h, cols: g.colliders.filter(c => c.x0 < 1e5).map(c => [c.x0, c.z0, c.x1, c.z1]), sx: (v.x + 1) / 2 * innerWidth, sy: (1 - v.y) / 2 * innerHeight, front: v.z < 1 };
  });
  const look = s => {
    samples.n++;
    const { p, h } = s;
    if (h.room) samples.rooms.add(h.room);
    for (const x of h.doors) samples.doorMax[x.id] = Math.max(samples.doorMax[x.id] ?? 0, x.k);
    for (const [x0, z0, x1, z1] of s.cols) {
      const dd = Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));
      samples.worstWall = Math.min(samples.worstWall, dd);
      if (dd < 0.2) samples.inside.push({ at: [+(p.x - O.x).toFixed(2), +(p.z - O.z).toFixed(2)], col: [x0 - O.x, z0 - O.z, x1 - O.x, z1 - O.z].map(v => +v.toFixed(2)), dd: +dd.toFixed(3) });
    }
    if (h.hole.seen < 2 / 3 || (h.hole.between > 0 && !h.hole.on)) samples.hidden.push({ at: [+(p.x - O.x).toFixed(2), +(p.z - O.z).toFixed(2)], hole: h.hole });
    if (!s.front || s.sx < 0 || s.sx > 390 || s.sy < 60 || s.sy > 844) samples.offscreen.push([+(p.x - O.x).toFixed(2), +(p.z - O.z).toFixed(2), Math.round(s.sx), Math.round(s.sy)]);
  };
  /** Walks to (x, z) of the home with a thumb on the joystick, re-aimed as the camera follows; every sample is looked at. */
  const walk = async (x, z, { tol = 0.3, ms = 45000 } = {}) => {
    const j = await t.centre('#joy'), r = 50, t0 = Date.now();
    await t.down(3, j.x, j.y);
    let s = await probe(), best = Infinity, bestAt = Date.now();
    while (Date.now() - t0 < ms) {
      look(s);
      const dx = O.x + x - s.p.x, dz = O.z + z - s.p.z, dist = Math.hypot(dx, dz);
      if (dist < tol) break;
      if (dist < best - 0.05) { best = dist; bestAt = Date.now(); } else if (Date.now() - bestAt > 12000) break;    // stuck
      const a = wrap(Math.atan2(dx, dz) - s.p.cam), k = dist > 1.2 ? 0.6 : dist > 0.6 ? 0.4 : 0.25;    // a brisk walk, slowing down near the point
      await t.move(3, j.x - Math.sin(a) * r * k, j.y - Math.cos(a) * r * k, 1);
      await page.waitForTimeout(90);
      s = await probe();
    }
    await t.up(3);
    await page.waitForTimeout(250);
    s = await probe(); look(s);
    return { dist: Math.hypot(O.x + x - s.p.x, O.z + z - s.p.z), room: s.h.room, doors: s.h.doors, hole: s.h.hole };
  };
  const legs = [
    // [x, z, the room there, a door that must be open on arriving]
    [2.6, 2.45, 'entree'], [1.0, 2.45, 'sejour'], [1.0, 0.75, 'sejour'], [2.3, 0.75, 'cuisine', 'sejour-cuisine'], [3.2, 0.8, 'cuisine'], [3.2, -1.2, 'cuisine'],
    [3.2, 0.8, 'cuisine'], [2.3, 0.75, 'cuisine', 'sejour-cuisine'], [1.0, 0.7, 'sejour'],
    [0.5, 0.6, 'sejour'], [0.5, -0.6, 'degagement'], [-0.4, -0.65, 'degagement', 'degagement-chambre'], [-1.6, -0.6, 'chambre', 'degagement-chambre'], [-2.4, -0.55, 'chambre'], [-2.6, -1.8, 'chambre'],
    [-2.4, -0.55, 'chambre'], [-1.6, -0.6, 'chambre', 'degagement-chambre'], [-0.4, -0.65, 'degagement'],
    [1.1, -0.7, 'degagement', 'degagement-sdb'], [1.0, -1.9, 'sdb', 'degagement-sdb'], [0.3, -2.2, 'sdb'], [1.0, -1.9, 'sdb'], [1.1, -0.7, 'degagement'],
    [0.5, -0.5, 'degagement'], [0.5, 0.6, 'sejour'], [1.0, 2.45, 'sejour'], [2.6, 2.45, 'entree'], [3.15, 2.85, 'entree'],
  ];
  const went = [];
  for (const [x, z, room, door] of legs) {
    const r = await walk(x, z);
    const doorOk = !door || r.doors.find(q => q.id === door)?.open;
    went.push({ to: [x, z], room: r.room, dist: +r.dist.toFixed(2), ok: r.dist < 0.45 && r.room === room && doorOk });
    if (!(r.dist < 0.45 && r.room === room && doorOk)) console.log('  leg', JSON.stringify({ to: [x, z], want: room, door, got: r }));
  }
  const bad = went.filter(w => !w.ok);
  check(`walked with the joystick through ${legs.length} legs, each reached in the room it is in (entrée → séjour → cuisine → séjour → dégagement → chambre → dégagement → salle de bain → entrée)`, !bad.length, JSON.stringify(bad));
  check('every room visited: entrée, séjour, cuisine, dégagement, chambre, salle de bain', ['entree', 'sejour', 'cuisine', 'degagement', 'chambre', 'sdb'].every(r => samples.rooms.has(r)), [...samples.rooms].join(','));
  check('each door opened as the player came through it (kitchen, chambre, salle de bain)', ['sejour-cuisine', 'degagement-chambre', 'degagement-sdb'].every(id => samples.doorMax[id] === 1), JSON.stringify(samples.doorMax));
  check(`never inside a wall, a fitting or a door: ${samples.n} samples, the body's centre always at least 0.2 m from every collider (closest ${samples.worstWall.toFixed(3)} m)`, samples.inside.length === 0, JSON.stringify(samples.inside.slice(0, 5)));
  check('the player always seen: on screen, and the see-through hole open whenever a wall stands between the camera and the player', samples.hidden.length === 0 && samples.offscreen.length === 0, JSON.stringify({ hidden: samples.hidden.slice(0, 3), off: samples.offscreen.slice(0, 3) }));
  await page.waitForTimeout(2600);
  const shut = await d(() => window.__dakar.home().doors);
  check('the doors shut again once the player has gone (about 2 s)', shut.every(x => x.k === 0), JSON.stringify(shut));

  // ------------------------------------------------------------------ « Sortir »
  const focus = await d(() => window.__dakar.focus());
  check('at the street door, the action is « Sortir »', focus?.primary === 'Sortir', JSON.stringify(focus));
  await t.tap('#act');
  await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }).catch(() => {});
  const outside = await d(() => ({ p: window.__dakar.pos(), home: window.__dakar.home() }));
  check('« Sortir » by a tap: back in the street of Pikine', outside.p.x < 900 && outside.home === null, JSON.stringify(outside.p));

  // ------------------------------------------------------------------ pictures of each room, by day and at 21 h; draw calls and triangles
  await d(() => window.__dakar.enterHome('appart_jamm'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const shots = { entree: [3.15, 2.5, Math.PI], sejour: [-1.0, 2.2, Math.PI * 0.85], cuisine: [3.0, -0.6, Math.PI / 2], degagement: [0.3, -0.65, -Math.PI / 2], chambre: [-2.4, -1.4, Math.PI], sdb: [1.05, -1.75, Math.PI] };
  const sizes = [];
  const picture = async name => {
    const file = `${out}/${name}.png`;
    let buf = await page.screenshot({ scale: 'css' });
    if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 92, effort: 8 }).toBuffer();
    fs.writeFileSync(file, buf); sizes.push([name, buf.length]);
  };
  const perf = {};
  for (const [hour, tag] of [[10, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour);
    for (const [room, [x, z, yaw]] of Object.entries(shots)) {
      await d(([x, z, yaw]) => { window.__dakar.place(x, z, yaw); }, [O.x + x, O.z + z, yaw]);
      await page.waitForTimeout(1800);
      const h = await d(() => window.__dakar.home());
      if (h.room !== room) console.log('  picture of', room, 'taken in', h.room);
      await picture(`${room}-${tag}`);
      if (tag === 'day') perf[room] = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
    }
  }
  check('pictures of the six rooms by day and at 21 h, each PNG under 400 kB', sizes.length === 12 && sizes.every(([, n]) => n < 400_000), sizes.map(([k, n]) => `${k} ${Math.round(n / 1000)} kB`).join(', '));
  await d(() => window.__dakar.setHour(10));
  // the shell's own share of the frame (the interior's group hidden and drawn again), in the séjour
  await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [O.x - 1.0, O.z + 2.2]); await page.waitForTimeout(1500);
  const shell = await d(() => {
    const D = window.__dakar, r = D.three.renderer, sc = D.three.scene, cam = D.three.camera;
    const draw = () => { r.render(sc, cam); return { calls: r.info.render.calls, tris: r.info.render.triangles }; };
    let g = null; sc.traverse(o => { if (o.name === 'home:appart_jamm' && o.parent?.visible !== false && o.visible) g = o; });
    const all = draw(); g.visible = false; const without = draw(); g.visible = true; draw();
    let meshes = 0; g.traverse(o => { if (o.isMesh) meshes++; });
    return { all, without, meshes };
  });
  const empty = { calls: shell.all.calls, tris: shell.all.tris, shellCalls: shell.all.calls - shell.without.calls, shellTris: shell.all.tris - shell.without.tris };
  check(`the shell alone draws in ≤ 14 calls (séjour, empty F2: ${empty.shellCalls} calls, ${empty.shellTris} triangles of the shell; ${empty.calls} calls, ${empty.tris} triangles in all)`, empty.shellCalls <= 14 && empty.shellCalls > 0, JSON.stringify({ perRoom: perf, shell }));
  // a few pieces of furniture (delivered and set up by the game where it puts them)
  await d(() => { for (const id of ['canape_wax', 'table_basse', 'tele_plate', 'lit_bois', 'chaise_bois', 'plante', 'radio']) window.__dakar.buyPiece(id); });
  await page.waitForTimeout(1500);
  const furnished = {};
  for (const room of ['sejour', 'chambre', 'entree']) {
    const [x, z, yaw] = shots[room];
    await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [O.x + x, O.z + z, yaw]); await page.waitForTimeout(1500);
    furnished[room] = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
  }
  const pieces = (await d(() => window.__dakar.homeView())).pieces.length;
  { const [x, z, yaw] = shots.sejour; await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [O.x + x, O.z + z, yaw]); await page.waitForTimeout(1500); }
  await picture('furnished-sejour-day');
  check(`with ${pieces} pieces of furniture: ≤ 60 draw calls and ≤ 80k triangles (phone viewport)`, pieces >= 5 && Object.values(furnished).every(f => f.calls <= 60 && f.tris <= 80_000), JSON.stringify(furnished));
  check('no page errors', errors.length === 0, errors.join(' | '));
  fs.writeFileSync(`${out}/walk.json`, JSON.stringify({ legs: went, samples: { n: samples.n, closest: samples.worstWall, rooms: [...samples.rooms], doors: samples.doorMax }, perf: { day: perf, empty, furnished, pieces }, pictures: sizes }, null, 1));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
