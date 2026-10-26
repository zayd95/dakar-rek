// LD2.0-D lane V-S (docs/ld2/LD2_D.md): the Almadies villa walked through on its three levels, on a phone page (390 × 844, real touches on the joystick).
// Own the villa, enter it by its sheet's « Entrer chez toi », then walk: the ground floor's rooms and out to the pool deck, up the first flight to the first
// floor, its rooms and a balcony, up the second flight to the roof and onto the helipad, and back down to the front door → « Sortir ». At every sample: the
// room and the level (`__dakar.home()`), the player never inside a wall, a railing or a piece of the floor they are on (the colliders whose height band
// holds their feet), the player on screen and seen (the see-through hole and the cutaway). Pictures of each level by day and at 21 h (docs/proof/ld2d/villa,
// PNG under 400 kB), the draw calls and triangles on each level, empty and with about ten pieces of furniture. No page errors.
// Usage: node scripts/check-villa-walk.mjs [baseUrl] [outDir]
//   (a static build: npx vite build --outDir /tmp/claude-0/ld2d/vs/dist --emptyOutDir; node /tmp/claude-0/beta/tools/serve.mjs /tmp/claude-0/ld2d/vs/dist 4963)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4963/', out = 'docs/proof/ld2d/villa'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 500) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const STOREY = 3.4;

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  const t = await realTouch(page);

  // ------------------------------------------------------------------ own the villa and go in by its door
  await d(() => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(10); D.teleport('almadies'); });
  await page.waitForTimeout(3000);
  const owned = await d(() => window.__dakar.estate());
  check('the villa is the player\'s, and their home', owned.home === 'villa_almadies' && owned.assets.some(a => a.spec === 'villa_almadies' && a.how === 'owned'), owned.home);
  await d(() => window.__dakar.assetSheet('villa_almadies'));
  const enter = page.locator('#modal.on .item', { hasText: 'Entrer chez toi' }).first();
  await enter.waitFor({ state: 'visible' }); await enter.tap();
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  const h0 = await d(() => window.__dakar.home()), p0 = await d(() => window.__dakar.pos());
  check('« Entrer chez toi »: inside the villa built from its plan, on the ground floor, in the entrée, inside the front door', h0?.plan === 'villa_almadies' && h0.level === 'rdc' && h0.room === 'entree' && Math.hypot(p0.x - O.x + 3, p0.z - O.z - 3.2) < 0.05,
    JSON.stringify({ h0: { plan: h0?.plan, level: h0?.level, room: h0?.room }, at: [p0.x - O.x, p0.z - O.z] }));
  check('on arrival only the ground floor is drawn (the cutaway)', h0.levels.map(l => `${l.id}:${+l.shell}${+l.core}`).join() === 'rdc:11,etage:00,toit:00', JSON.stringify(h0.levels));

  // ------------------------------------------------------------------ the walk
  const samples = { n: 0, worstWall: Infinity, inside: [], hidden: [], offscreen: [], rooms: new Set(), levels: new Set(), doorMax: {}, maxY: 0 };
  const probe = () => d(() => {
    const D = window.__dakar, p = D.pos(), h = D.home(), g = D.roomGeometry(), cam = D.three.camera;
    const v = cam.position.clone().set(p.x, p.y + 0.9, p.z).project(cam);
    return { p, h, cols: g.colliders.filter(c => c.x0 < 1e5).map(c => [c.x0, c.z0, c.x1, c.z1, c.y0 ?? null, c.h]), sx: (v.x + 1) / 2 * innerWidth, sy: (1 - v.y) / 2 * innerHeight, front: v.z < 1 };
  });
  const look = s => {
    samples.n++;
    const { p, h } = s;
    if (h.room) samples.rooms.add(h.room);
    samples.levels.add(h.level); samples.maxY = Math.max(samples.maxY, p.y);
    for (const x of h.doors) samples.doorMax[x.id] = Math.max(samples.doorMax[x.id] ?? 0, x.k);
    for (const [x0, z0, x1, z1, y0, top] of s.cols) {
      if (y0 !== null && !(p.y + 1.6 > y0 && p.y < top - 0.25)) continue;             // a collider of another floor (src/world/types.ts inBand)
      const dd = Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));
      samples.worstWall = Math.min(samples.worstWall, dd);
      if (dd < 0.2) samples.inside.push({ at: [+(p.x - O.x).toFixed(2), +p.y.toFixed(2), +(p.z - O.z).toFixed(2)], col: [x0 - O.x, z0 - O.z, x1 - O.x, z1 - O.z, y0, top].map(v => v === null ? v : +v.toFixed(2)), dd: +dd.toFixed(3) });
    }
    if (h.hole.seen < 2 / 3 || (h.hole.between > 0 && !h.hole.on)) samples.hidden.push({ at: [+(p.x - O.x).toFixed(2), +p.y.toFixed(2), +(p.z - O.z).toFixed(2)], hole: h.hole });
    if (!s.front || s.sx < 0 || s.sx > 390 || s.sy < 60 || s.sy > 844) samples.offscreen.push([+(p.x - O.x).toFixed(2), +(p.z - O.z).toFixed(2), Math.round(s.sx), Math.round(s.sy)]);
  };
  /** Walks to (x, z) of the home (house metres) with a thumb on the joystick, re-aimed as the camera follows; every sample is looked at. */
  const walk = async (x, z, { tol = 0.3, ms = 45000 } = {}) => {
    const j = await t.centre('#joy'), r = 50, t0 = Date.now();
    await t.down(3, j.x, j.y);
    let s = await probe(), best = Infinity, bestAt = Date.now();
    while (Date.now() - t0 < ms) {
      look(s);
      const dx = O.x + x - s.p.x, dz = O.z + z - s.p.z, dist = Math.hypot(dx, dz);
      if (dist < tol) break;
      if (dist < best - 0.05) { best = dist; bestAt = Date.now(); } else if (Date.now() - bestAt > 12000) break;    // stuck
      const a = wrap(Math.atan2(dx, dz) - s.p.cam), k = dist > 1.2 ? 0.6 : dist > 0.6 ? 0.4 : 0.25;
      await t.move(3, j.x - Math.sin(a) * r * k, j.y - Math.cos(a) * r * k, 1);
      await page.waitForTimeout(90);
      s = await probe();
    }
    await t.up(3);
    await page.waitForTimeout(250);
    s = await probe(); look(s);
    return { dist: Math.hypot(O.x + x - s.p.x, O.z + z - s.p.z), room: s.h.room, level: s.h.level, y: s.p.y, doors: s.h.doors, hole: s.h.hole };
  };
  // [house x, z, the room there, its level, a door that must be open on arriving]
  const legs = [
    // the ground floor: the entrée, the bureau (its door), the grand salon, out to the pool deck by the glazed door, round the pool, back in by the dining room
    [-3, 1.0, 'entree', 'rdc'], [-3.8, 0.75, 'entree', 'rdc', 'entree-bureau'], [-4.65, 0.75], [-5.4, 0.75, 'bureau', 'rdc'], [-6.0, 1.8, 'bureau', 'rdc'], [-5.4, 0.75, 'bureau', 'rdc'],
    [-4.65, 0.75], [-3.8, 0.75, 'entree', 'rdc'], [-3, 0.9, 'entree', 'rdc'],
    [-3, -1.5, 'salon', 'rdc'], [-4.6, -3.6, 'salon', 'rdc'], [-4.5, -5.6, 'jardin', 'rdc'], [5.0, -5.6, 'jardin', 'rdc'], [7.0, -8.0, 'jardin', 'rdc'],
    [5.0, -5.6, 'jardin', 'rdc'], [1.7, -5.6, 'jardin', 'rdc'], [1.7, -4.0, 'manger', 'rdc'],
    [2.6, -1.0, 'manger', 'rdc'], [2.6, 0.9, 'cuisine', 'rdc'], [2.6, -1.0, 'manger', 'rdc'], [3.4, -3.85, 'manger', 'rdc'], [5.3, -3.85, 'hall', 'rdc'],
    [7.2, -2.6, 'hall', 'rdc'], [7.2, 0.9, 'hall', 'rdc', 'hall-sde'], [7.2, 2.4, 'sde', 'rdc'], [6.2, 2.6, 'sde', 'rdc'], [7.2, 2.4, 'sde', 'rdc'], [7.2, 0.9, 'hall', 'rdc'], [7.2, -3.0, 'hall', 'rdc'], [5.3, -3.6, 'hall', 'rdc'],
    // up the first flight to the first floor: its landing, the salon familial, the street balcony, the master suite and its balcony, a bedroom
    [5.15, -3.0, 'hall', 'rdc'], [5.15, -0.5], [5.15, 1.3], [5.15, 2.3, 'palier', 'etage'], [3.6, 2.6, 'salon_familial', 'etage'], [-2.4, 3.2, 'salon_familial', 'etage'],
    [-2.4, 4.75, 'balcon_rue', 'etage'], [-2.4, 3.2, 'salon_familial', 'etage'], [-3.6, 0.3, 'salon_familial', 'etage', 'salon-suite'], [-3.6, -1.1, 'suite', 'etage'], [-4.4, -2.6, 'suite', 'etage'],
    [-5.4, -4.4, 'suite', 'etage'], [-5.4, -5.85, 'balcon_piscine', 'etage'], [-5.4, -4.4, 'suite', 'etage'], [-3.4, -1.6, 'suite', 'etage'], [-1.6, -1.6, 'dressing', 'etage'],
    [-3.4, -1.6, 'suite', 'etage'], [-3.6, -1.1, 'suite', 'etage'], [-3.6, 0.4, 'salon_familial', 'etage'], [0.25, 0.5, 'salon_familial', 'etage', 'salon-chambre2'], [0.25, -1.2, 'chambre2', 'etage'], [1.4, -2.6, 'chambre2', 'etage'], [0.25, -1.2, 'chambre2', 'etage'], [0.25, 0.5, 'salon_familial', 'etage'],
    // up the second flight to the roof, onto the helipad, the terrace on the street side
    [6.2, 2.4, 'palier', 'etage'], [7.15, 1.9, 'palier', 'etage'], [7.15, -0.5], [7.15, -3.4, 'edicule', 'toit'], [6.0, -3.9, 'edicule', 'toit'], [3.6, -3.9, 'terrasse', 'toit'],
    [0.6, -3.4, 'terrasse', 'toit'], [-1.0, 1.0, 'terrasse', 'toit'], [3.6, 3.0, 'terrasse', 'toit'], [6.2, 3.0, 'terrasse_rue', 'toit'],
    // and back down to the front door
    [3.6, 3.0, 'terrasse', 'toit'], [3.6, -3.9, 'terrasse', 'toit'], [6.0, -3.9, 'edicule', 'toit'], [7.15, -3.3, 'edicule', 'toit'], [7.15, 0.0], [7.15, 2.0, 'palier', 'etage'],
    [6.2, 2.4, 'palier', 'etage'], [5.15, 2.2, 'palier', 'etage'], [5.15, 0.5], [5.15, -3.2, 'hall', 'rdc'], [5.3, -3.85, 'hall', 'rdc'], [3.4, -3.85, 'manger', 'rdc'],
    [-3, -1.5, 'salon', 'rdc'], [-3, 2.6, 'entree', 'rdc'], [-3, 3.1, 'entree', 'rdc'],
  ];
  const went = [], onPad = { at: null };
  for (const [x, z, room, level, door] of legs) {
    let r = await walk(x, z);
    if (r.dist >= 0.45 && r.dist < 1.5) { console.log('  a second push toward', x, z, 'from', r.dist.toFixed(2), 'm'); r = await walk(x, z); }   // a thumb corrects (a slow frame on a shared machine)
    const doorOk = !door || r.doors.find(q => q.id === door)?.open;
    const ok = r.dist < 0.45 && (!room || r.room === room) && (!level || r.level === level) && doorOk;
    went.push({ to: [x, z], room: r.room, level: r.level, y: +r.y.toFixed(2), dist: +r.dist.toFixed(2), ok });
    if (!ok) console.log('  leg', JSON.stringify({ to: [x, z], want: [room, level, door], got: { room: r.room, level: r.level, y: r.y, dist: r.dist } }));
    if (x === -1.0 && z === 1.0) onPad.at = await d(() => window.__dakar.pos());
  }
  const bad = went.filter(w => !w.ok);
  check(`walked with the joystick through ${legs.length} legs on three levels, each reached in the room and on the level it is on`, !bad.length, JSON.stringify(bad));
  check('every level walked: the ground floor, the first floor and the roof terrace (the feet up to 6.9 m)', ['rdc', 'etage', 'toit'].every(l => samples.levels.has(l)) && samples.maxY > 6.8, `${[...samples.levels]} max y ${samples.maxY.toFixed(2)}`);
  const want = ['entree', 'bureau', 'salon', 'jardin', 'manger', 'cuisine', 'hall', 'sde', 'palier', 'salon_familial', 'balcon_rue', 'suite', 'balcon_piscine', 'dressing', 'chambre2', 'edicule', 'terrasse', 'terrasse_rue'];
  check(`the rooms visited: ${want.length} rooms of the three levels, the pool deck, a balcony and the roof terraces`, want.every(r => samples.rooms.has(r)), `missing: ${want.filter(r => !samples.rooms.has(r))}`);
  const pad = onPad.at, padD = pad ? Math.hypot(pad.x - O.x + 3, pad.z - O.z + 0.5) : Infinity;
  check(`reached the helipad on the roof (${padD.toFixed(2)} m from its centre, radius 3.2, feet at ${pad?.y.toFixed(2)} m)`, padD < 3.2 && pad.y > 6.8, JSON.stringify(pad));
  check('each door opened as the player came through it (the bureau, the salle d\'eau, the suite, the bedroom)', ['entree-bureau', 'hall-sde', 'salon-suite', 'salon-chambre2'].every(id => samples.doorMax[id] === 1), JSON.stringify(samples.doorMax));
  check(`never inside a wall, a railing or a fitting of the floor the player is on: ${samples.n} samples, always at least 0.2 m from them (closest ${samples.worstWall.toFixed(3)} m)`, samples.inside.length === 0, JSON.stringify(samples.inside.slice(0, 5)));
  check('the player always seen: on screen, and the see-through hole open whenever a wall stands between the camera and the player', samples.hidden.length === 0 && samples.offscreen.length === 0, JSON.stringify({ hidden: samples.hidden.slice(0, 3), off: samples.offscreen.slice(0, 3) }));
  const back = await d(() => ({ p: window.__dakar.pos(), h: window.__dakar.home() }));
  check('back on the ground floor at the front door: only the ground floor drawn again', back.h.level === 'rdc' && Math.abs(back.p.y - 0.1) < 0.02 && back.h.levels.map(l => `${l.id}:${+l.shell}${+l.core}`).join() === 'rdc:11,etage:00,toit:00', JSON.stringify({ y: back.p.y, levels: back.h.levels }));

  // ------------------------------------------------------------------ « Sortir »
  const focus = await d(() => window.__dakar.focus());
  check('at the front door, the action is « Sortir »', focus?.primary === 'Sortir', JSON.stringify(focus));
  await t.tap('#act');
  await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }).catch(() => {});
  const outside = await d(() => ({ p: window.__dakar.pos(), home: window.__dakar.home() }));
  check('« Sortir » by a tap: back in the street of Almadies', outside.p.x < 900 && outside.home === null, JSON.stringify(outside.p));

  // ------------------------------------------------------------------ pictures of each level by day and at 21 h; draw calls and triangles per level
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  // [house x, z, facing, floor height] for each picture
  const shots = {
    'rdc-salon': [-3.4, -1.0, 0.6, 0], 'rdc-pool': [6.5, -7.6, -1.9, 0], 'rdc-hall': [6.6, -4.2, 2.6, 0], 'rdc-cuisine': [1.2, 0.9, 0.2, 0],
    'etage-salon': [2.0, 2.4, -2.2, STOREY], 'etage-suite': [-4.6, -2.0, 2.8, STOREY], 'etage-balcon': [-2.4, 4.8, 0, STOREY],
    'toit-helipad': [0.6, 1.8, -1.6, 2 * STOREY], 'toit-terrasse': [-6.0, 3.0, 2.3, 2 * STOREY],
  };
  const sizes = [];
  const picture = async name => {
    const file = `${out}/${name}.png`;
    let buf = await page.screenshot({ scale: 'css' });
    if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 90, effort: 8 }).toBuffer();
    fs.writeFileSync(file, buf); sizes.push([name, buf.length]);
  };
  const stand = async ([x, z, yaw, y]) => {
    if (await d(() => !!document.querySelector('#modal.on'))) { console.log('  a sheet was still open: closed before the picture'); await d(() => document.querySelector('#modal')?.classList.remove('on')); }
    await d(([x, z, yaw, y]) => { window.__dakar.place(x, z, yaw, y); window.__dakar.lookYaw(yaw); }, [O.x + x, O.z + z, yaw, y]); await page.waitForTimeout(1800); };
  const perf = { empty: {}, furnished: {} };
  for (const [hour, tag] of [[10, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour);
    for (const [name, spot] of Object.entries(shots)) {
      await stand(spot);
      const h = await d(() => window.__dakar.home());
      if (h.level !== name.split('-')[0]) console.log('  picture of', name, 'taken on', h.level);
      await picture(`${name}-${tag}`);
      if (tag === 'day') { const lv = name.split('-')[0]; const m = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() })); const o = perf.empty[lv] ??= { calls: 0, tris: 0 }; o.calls = Math.max(o.calls, m.calls); o.tris = Math.max(o.tris, m.tris); }
    }
  }
  check(`pictures of the three levels by day and at 21 h, each PNG under 400 kB (${sizes.length})`, sizes.length === 2 * Object.keys(shots).length && sizes.every(([, n]) => n < 400_000), sizes.map(([k, n]) => `${k} ${Math.round(n / 1000)} kB`).join(', '));
  await d(() => window.__dakar.setHour(10));
  // the shell's own share of the frame on each level (the interior's group hidden and drawn again)
  const shellOf = () => d(() => {
    const D = window.__dakar, r = D.three.renderer, sc = D.three.scene, cam = D.three.camera;
    const draw = () => { r.render(sc, cam); return { calls: r.info.render.calls, tris: r.info.render.triangles }; };
    let g = null; sc.traverse(o => { if (o.name === 'home:villa_almadies' && o.parent?.visible !== false && o.visible) g = o; });
    const all = draw(); g.visible = false; const without = draw(); g.visible = true; draw();
    return { calls: all.calls - without.calls, tris: all.tris - without.tris, frame: all };
  });
  const shell = {};
  for (const [lv, spot] of [['rdc', shots['rdc-salon']], ['etage', shots['etage-salon']], ['toit', shots['toit-terrasse']]]) { await stand(spot); shell[lv] = await shellOf(); }
  // (the look pass: a draw call more per part for the stone, the view in the windows; the furnished level's budget, below, is what counts)
  check(`the shell of each level at most 30 draw calls (with what is seen of the levels below; the helicopter's own on the roof): ${Object.entries(shell).map(([k, v]) => `${k} ${v.calls} calls ${v.tris} tris`).join(', ')}`,
    Object.values(shell).every(v => v.calls > 0 && v.calls <= 30), JSON.stringify(shell));
  // about ten pieces of furniture, delivered and set up by the game by their kind (across the levels)
  const ids = ['canape_cuir', 'table_basse', 'tele_plate', 'salle_manger_bois', 'lit_king', 'armoire_bois', 'canape_wax', 'transat', 'parasol', 'plante', 'lampadaire_trepied', 'tapis_soie'];
  await d(list => { for (const id of list) window.__dakar.buyPiece(id); }, ids);
  await page.waitForTimeout(1500);
  const placed = await d(() => window.__dakar.homeView().pieces.length);
  for (const [lv, spot] of [['rdc', shots['rdc-salon']], ['etage', shots['etage-suite']], ['toit', shots['toit-terrasse']]]) { await stand(spot); perf.furnished[lv] = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() })); }
  await stand(shots['rdc-salon']); await picture('furnished-rdc-salon');
  await stand(shots['etage-suite']); await picture('furnished-etage-suite');
  await stand(shots['rdc-pool']); await picture('furnished-rdc-pool');
  // ------------------------------------------------------------------ « Aménager » on several levels: the level chips, a room upstairs, the camera and the cutaway there
  await stand(shots['rdc-salon']);
  const opened = await d(() => window.__dakar.placer.open());
  await page.waitForTimeout(800);
  const chips = await d(() => ({ levels: [...document.querySelectorAll('#placer-rooms [data-level]')].map(b => b.textContent), rooms: [...document.querySelectorAll('#placer-rooms [data-room]')].map(b => b.textContent) }));
  check('« Aménager »: the level chips (RDC, Étage, Toit) and the ground floor\'s room chips', opened && chips.levels.join() === 'RDC,Étage,Toit' && chips.rooms.includes('Grand salon') && !chips.rooms.includes('Suite'), JSON.stringify(chips));
  await t.tap('#placer-rooms [data-level="etage"]'); await page.waitForTimeout(900);
  const up = await d(() => ({ info: window.__dakar.placer.info(), rooms: [...document.querySelectorAll('#placer-rooms [data-room]')].map(b => b.textContent), home: window.__dakar.home() }));
  check('a tap on « Étage »: the first floor in view (the cutaway follows the editor), its room chips', up.info.level === 'etage' && up.home.level === 'etage' && up.rooms.includes('Suite') && !up.rooms.includes('Grand salon'), JSON.stringify({ level: up.info.level, home: up.home.level, rooms: up.rooms }));
  await t.tap('#placer-rooms [data-room="suite"]'); await page.waitForTimeout(1200);
  const suite = await d(() => ({ info: window.__dakar.placer.info(), cam: window.__dakar.camera().at }));
  const bed = suite.info.items.find(f => f.spec === 'lit_king');
  const chipBox = await d(() => { const r = document.getElementById('placer-rooms').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; });
  check(`the level's room chips fit the phone's width in a few rows (${chipBox.w} × ${chipBox.h} px)`, chipBox.w >= 300 && chipBox.h <= 160, JSON.stringify(chipBox));
  check('the suite chip frames the master suite from above its floor; the bed bought is in it, set up by its kind', suite.info.room === 'suite' && suite.cam[1] > STOREY + 3 && bed?.room === 'suite', JSON.stringify({ room: suite.info.room, cam: suite.cam, bed }));
  await picture('editor-etage-suite');
  await d(() => window.__dakar.placer.close()); await page.waitForTimeout(500);
  check(`each level, empty and with ${placed} pieces of furniture: ≤ 60 draw calls and ≤ 80k triangles (phone page)`, placed >= 10 && [...Object.values(perf.empty), ...Object.values(perf.furnished)].every(f => f.calls <= 60 && f.tris <= 80_000), JSON.stringify(perf));
  check('no page errors', errors.length === 0, errors.join(' | '));
  fs.writeFileSync(`${out}/walk.json`, JSON.stringify({ legs: went, samples: { n: samples.n, closest: samples.worstWall, rooms: [...samples.rooms], levels: [...samples.levels], doors: samples.doorMax, maxY: samples.maxY }, perf: { ...perf, shell, pieces: placed }, pictures: sizes }, null, 1));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
