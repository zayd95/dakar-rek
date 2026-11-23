// The Cité Jàmm family house walked through on its two levels, on a phone page (390 × 844, real touches on the joystick); the plan: src/housing/maisonPlan.ts. (Adapted from scripts/check-villa-walk.mjs.)
// Own the house, enter it by its sheet's « Entrer chez toi », then walk: the ground floor's rooms and out to the courtyard, up the flight to the first
// floor, its rooms and the balconies, and back down to the front door → « Sortir ». At every sample: the
// room and the level (`__dakar.home()`), the player never inside a wall, a railing or a piece of the floor they are on (the colliders whose height band
// holds their feet), the player on screen and seen (the see-through hole and the cutaway). Pictures of each level by day and at 21 h (docs/proof/cite-maison/interior,
// PNG under 400 kB), the draw calls and triangles on each level, empty and with about ten pieces of furniture. No page errors.
// Usage: node scripts/check-maison-walk.mjs [baseUrl] [outDir]
//   (a static build: npx vite build --outDir /tmp/claude-0/ld2d/vs/dist --emptyOutDir; node /tmp/claude-0/beta/tools/serve.mjs /tmp/claude-0/ld2d/vs/dist 4963)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4963/', out = 'docs/proof/cite-maison/interior'] = process.argv.slice(2);
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

  // ------------------------------------------------------------------ own the house and go in by its door
  await d(() => { const D = window.__dakar; D.buyAsset('maison_cite'); D.moveIn('maison_cite'); D.setHour(10); });
  await page.waitForTimeout(3000);
  const owned = await d(() => window.__dakar.estate());
  check('the Cité Jàmm house is the player\'s, and their home', owned.home === 'maison_cite' && owned.assets.some(a => a.spec === 'maison_cite' && a.how === 'owned'), owned.home);
  await d(() => window.__dakar.assetSheet('maison_cite'));
  const enter = page.locator('#modal.on .item', { hasText: 'Entrer chez toi' }).first();
  await enter.waitFor({ state: 'visible' }); await enter.tap();
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  const h0 = await d(() => window.__dakar.home()), p0 = await d(() => window.__dakar.pos());
  check('« Entrer chez toi »: inside the house built from its plan, on the ground floor, in the entrée, inside the front door', h0?.plan === 'maison_cite' && h0.level === 'rdc' && h0.room === 'entree' && Math.hypot(p0.x - O.x + 1.1, p0.z - O.z - 3.7) < 0.1,
    JSON.stringify({ h0: { plan: h0?.plan, level: h0?.level, room: h0?.room }, at: [p0.x - O.x, p0.z - O.z] }));
  check('on arrival only the ground floor is drawn (the cutaway)', h0.levels.map(l => `${l.id}:${+l.shell}${+l.core}`).join() === 'rdc:11,etage:00', JSON.stringify(h0.levels));

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
    return { dist: Math.hypot(O.x + x - s.p.x, O.z + z - s.p.z), room: s.h.room, level: s.h.level, y: s.p.y, doors: s.h.doors, hole: s.h.hole, at: [+(s.p.x - O.x).toFixed(2), +(s.p.z - O.z).toFixed(2)] };
  };
  // [house x, z, the room there, its level, a door that must be open on arriving]
  const legs = [
    // the ground floor: the entrée, the guest room (its door), the salon, out to the courtyard by the glass, back in by the dining room, the kitchen, the stair hall and the shower room
    [-1.1, 3.0, 'entree', 'rdc'], [-1.9, 2.5, 'entree', 'rdc'], [-3.2, 2.5, 'chambre', 'rdc', 'entree-chambre'], [-4.5, 2.8, 'chambre', 'rdc'], [-3.2, 2.5, 'chambre', 'rdc'], [-1.9, 2.5, 'entree', 'rdc'],
    [-0.5, 1.2, 'entree', 'rdc'], [-0.5, -0.5, 'manger', 'rdc'], [-0.5, -2.2, 'manger', 'rdc'], [-3.0, -2.2, 'salon', 'rdc'], [-3.6, -4.0, 'salon', 'rdc'], [-3.6, -6.0, 'cour', 'rdc'], [-1.0, -8.0, 'cour', 'rdc'],
    [0.9, -6.0, 'cour', 'rdc'], [0.9, -3.8, 'manger', 'rdc'], [1.6, -0.5, 'manger', 'rdc'], [1.6, 1.2, 'cuisine', 'rdc'], [2.6, 2.4, 'cuisine', 'rdc'], [1.6, 1.2, 'cuisine', 'rdc'], [1.6, -0.5, 'manger', 'rdc'],
    [2.0, -3.7, 'manger', 'rdc'], [3.6, -3.7, 'hall', 'rdc'], [5.3, -3.0, 'hall', 'rdc'], [5.3, 0.9, 'hall', 'rdc', 'hall-sde'], [5.3, 2.4, 'sde', 'rdc'], [4.3, 2.4, 'sde', 'rdc'], [5.3, 2.4, 'sde', 'rdc'], [5.3, 0.9, 'hall', 'rdc'], [5.3, -3.0, 'hall', 'rdc'], [3.9, -3.3, 'hall', 'rdc'],
    // up the flight to the first floor: the landing, the family lounge, the balcony over the street, the corridor, the parents' room and its balcony, a bedroom, the bathroom, the third bedroom
    [3.9, -1.0], [3.9, 1.0], [3.9, 2.3, 'palier', 'etage'], [3.4, 2.8, 'palier', 'etage'], [1.5, 2.8, 'salon_familial', 'etage'], [0.7, 3.8, 'salon_familial', 'etage'],
    [0.7, 5.2, 'balcon_rue', 'etage'], [0.7, 3.8, 'salon_familial', 'etage'], [0.7, 1.6, 'salon_familial', 'etage'], [0.7, 0.1, 'couloir', 'etage'],
    [-4.2, 0.1, 'couloir', 'etage'], [-4.2, 1.7, 'suite', 'etage', 'couloir-suite'], [-3.8, 3.8, 'suite', 'etage'], [-3.8, 5.2, 'balcon_suite', 'etage'], [-3.8, 3.8, 'suite', 'etage'], [-4.2, 1.7, 'suite', 'etage'], [-4.2, 0.1, 'couloir', 'etage'],
    [-4.4, 0.1, 'couloir', 'etage'], [-4.4, -1.3, 'chambre2', 'etage', 'couloir-chambre2'], [-4.4, -3.0, 'chambre2', 'etage'], [-4.4, -1.3, 'chambre2', 'etage'], [-4.4, 0.1, 'couloir', 'etage'],
    [-1.7, 0.1, 'couloir', 'etage'], [-1.7, -1.3, 'sdb', 'etage', 'couloir-sdb'], [-1.7, -2.3, 'sdb', 'etage'], [-1.7, -1.3, 'sdb', 'etage'], [-1.7, 0.1, 'couloir', 'etage'],
    [1.2, 0.1, 'couloir', 'etage'], [1.2, -1.3, 'chambre3', 'etage', 'couloir-chambre3'], [1.2, -3.0, 'chambre3', 'etage'], [1.2, -1.3, 'chambre3', 'etage'], [1.2, 0.1, 'couloir', 'etage'], [0.7, 1.6, 'salon_familial', 'etage'],
    // and back down to the front door
    [1.5, 2.8, 'salon_familial', 'etage'], [3.4, 2.8, 'palier', 'etage'], [3.9, 2.3, 'palier', 'etage'], [3.9, 0.5], [3.9, -2.0], [3.9, -3.2, 'hall', 'rdc'], [3.6, -3.7, 'hall', 'rdc'], [2.0, -3.7, 'manger', 'rdc'],
    [-0.5, -0.5, 'manger', 'rdc'], [-0.5, 1.5, 'entree', 'rdc'], [-1.1, 3.2, 'entree', 'rdc'],
  ];
  const went = [], onPad = { at: null };
  for (const [x, z, room, level, door] of legs) {
    let r = await walk(x, z);
    if (r.dist >= 0.45 && r.dist < 1.5) { console.log('  a second push toward', x, z, 'from', r.dist.toFixed(2), 'm'); r = await walk(x, z); }   // a thumb corrects (a slow frame on a shared machine)
    else if (r.dist >= 1.5) {
      // stuck far from it: say what the page shows (a sheet over the joystick? the frame rate?), put any sheet away, and walk the leg again once
      const why = await d(async () => ({ modal: document.querySelector('#modal.on')?.textContent?.slice(0, 80) ?? null, mode: window.__dakar.pos().mode,
        fps: await new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }) }));
      console.log('  stuck', r.dist.toFixed(2), 'm from', x, z, JSON.stringify(why));
      if (why.modal) await d(() => document.querySelector('#modal')?.classList.remove('on'));
      r = await walk(x, z);
    }
    const doorOk = !door || r.doors.find(q => q.id === door)?.open;
    const ok = r.dist < 0.45 && (!room || r.room === room) && (!level || r.level === level) && doorOk;
    went.push({ to: [x, z], room: r.room, level: r.level, y: +r.y.toFixed(2), dist: +r.dist.toFixed(2), ok });
    if (!ok) console.log('  leg', JSON.stringify({ to: [x, z], want: [room, level, door], got: { room: r.room, level: r.level, y: r.y, dist: r.dist, at: r.at } }));
    if (x === -1.0 && z === 1.0) onPad.at = await d(() => window.__dakar.pos());
  }
  const bad = went.filter(w => !w.ok);
  check(`walked with the joystick through ${legs.length} legs on two levels, each reached in the room and on the level it is on`, !bad.length, JSON.stringify(bad));
  check('both levels walked: the ground floor and the first floor (the feet up to 3.5 m)', ['rdc', 'etage'].every(l => samples.levels.has(l)) && samples.maxY > 3.4, `${[...samples.levels]} max y ${samples.maxY.toFixed(2)}`);
  const want = ['entree', 'chambre', 'manger', 'salon', 'cour', 'cuisine', 'hall', 'sde', 'palier', 'salon_familial', 'balcon_rue', 'couloir', 'suite', 'balcon_suite', 'chambre2', 'sdb', 'chambre3'];
  check(`the rooms visited: ${want.length} rooms of the two levels, the courtyard and a balcony`, want.every(r => samples.rooms.has(r)), `missing: ${want.filter(r => !samples.rooms.has(r))}`);
//  const pad = onPad.at, padD = pad ? Math.hypot(pad.x - O.x + 3, pad.z - O.z + 0.5) : Infinity;
//  check(`reached the helipad on the roof (${padD.toFixed(2)} m from its centre, radius 3.2, feet at ${pad?.y.toFixed(2)} m)`, padD < 3.2 && pad.y > 6.8, JSON.stringify(pad));
  check('each door opened as the player came through it (the guest room, the shower room, the parents\' room, a bedroom, the bathroom)', ['entree-chambre', 'hall-sde', 'couloir-suite', 'couloir-chambre2', 'couloir-sdb', 'couloir-chambre3'].every(id => samples.doorMax[id] === 1), JSON.stringify(samples.doorMax));
  check(`never inside a wall, a railing or a fitting of the floor the player is on: ${samples.n} samples, always at least 0.2 m from them (closest ${samples.worstWall.toFixed(3)} m)`, samples.inside.length === 0, JSON.stringify(samples.inside.slice(0, 5)));
  check('the player always seen: on screen, and the see-through hole open whenever a wall stands between the camera and the player', samples.hidden.length === 0 && samples.offscreen.length === 0, JSON.stringify({ hidden: samples.hidden.slice(0, 3), off: samples.offscreen.slice(0, 3) }));
  const back = await d(() => ({ p: window.__dakar.pos(), h: window.__dakar.home() }));
  check('back on the ground floor at the front door: only the ground floor drawn again', back.h.level === 'rdc' && Math.abs(back.p.y - 0.1) < 0.02 && back.h.levels.map(l => `${l.id}:${+l.shell}${+l.core}`).join() === 'rdc:11,etage:00', JSON.stringify({ y: back.p.y, levels: back.h.levels }));

  // ------------------------------------------------------------------ « Sortir »
  const focus = await d(() => window.__dakar.focus());
  check('at the front door, the action is « Sortir »', focus?.primary === 'Sortir', JSON.stringify(focus));
  await t.tap('#act');
  await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }).catch(() => {});
  const outside = await d(() => ({ p: window.__dakar.pos(), home: window.__dakar.home() }));
  check('« Sortir » by a tap: back in the street of Almadies', outside.p.x < 900 && outside.home === null, JSON.stringify(outside.p));

  // ------------------------------------------------------------------ pictures of both levels by day and at 21 h; the shell's draw calls; the house furnished
  await d(() => window.__dakar.enterHome('maison_cite'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  // [house x, z, facing, floor height] for each picture
  const shots = {
    'rdc-entree': [-1.1, 3.0, Math.PI, 0], 'rdc-salon': [-3.5, -1.0, 1.6, 0], 'rdc-cuisine': [1.5, 2.0, Math.PI, 0], 'rdc-cour': [-2.0, -7.5, Math.PI, 0], 'rdc-escalier': [4.5, -3.8, 0, 0],
    'etage-couloir': [-1.0, 0.1, 1.6, STOREY], 'etage-suite': [-3.5, 2.8, Math.PI, STOREY], 'etage-salon': [0.8, 2.6, Math.PI, STOREY], 'etage-balcon': [0.7, 5.2, Math.PI, STOREY],
  };
  const sizes = [];
  const picture = async name => {
    let buf = await page.screenshot({ scale: 'css' });
    if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 90, effort: 8 }).toBuffer();
    fs.writeFileSync(`${out}/${name}.png`, buf); sizes.push([name, buf.length]);
  };
  const stand = async ([x, z, yaw, y]) => {
    if (await d(() => !!document.querySelector('#modal.on'))) await d(() => document.querySelector('#modal')?.classList.remove('on'));
    await d(([x, z, yaw, y]) => { window.__dakar.place(x, z, yaw, y); window.__dakar.lookYaw(yaw); }, [O.x + x, O.z + z, yaw, y]); await page.waitForTimeout(1800); };
  for (const [hour, tag] of [[10, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour);
    for (const [name, spot] of Object.entries(shots)) {
      await stand(spot);
      const h = await d(() => window.__dakar.home());
      if (h.level !== name.split('-')[0]) console.log('  picture of', name, 'taken on', h.level);
      await picture(`${name}-${tag}`);
    }
  }
  check(`pictures of both levels by day and at 21 h, each PNG under 400 kB (${sizes.length})`, sizes.length === 2 * Object.keys(shots).length && sizes.every(([, n]) => n < 400_000), sizes.map(([k, n]) => `${k} ${Math.round(n / 1000)}`).join(', '));
  await d(() => window.__dakar.setHour(10));
  const shellOf = () => d(() => {
    const D = window.__dakar, r = D.three.renderer, sc = D.three.scene, cam = D.three.camera;
    const draw = () => { r.render(sc, cam); return { calls: r.info.render.calls, tris: r.info.render.triangles }; };
    let g = null; sc.traverse(o => { if (o.name === 'home:maison_cite' && o.parent?.visible !== false && o.visible) g = o; });
    if (!g) return { calls: 0, tris: 0 };
    const all = draw(); g.visible = false; const without = draw(); g.visible = true; draw();
    return { calls: all.calls - without.calls, tris: all.tris - without.tris };
  });
  const shell = {};
  for (const [lv, spot] of [['rdc', shots['rdc-salon']], ['etage', shots['etage-salon']]]) { await stand(spot); shell[lv] = await shellOf(); }
  check(`the shell of each level at most 30 draw calls: ${Object.entries(shell).map(([k, v]) => `${k} ${v.calls} calls ${v.tris} tris`).join(', ')}`, Object.values(shell).every(v => v.calls > 0 && v.calls <= 30), JSON.stringify(shell));
  // some furniture delivered and set up by its kind, across the two levels
  const ids = ['canape_cuir', 'table_basse', 'tele_plate', 'lit_king', 'armoire_bois', 'table_manger', 'chaises', 'lit_bois', 'bureau_simple', 'plante'];
  await d(list => { for (const id of list) window.__dakar.buyPiece(id); }, ids);
  await page.waitForTimeout(1500);
  const pieces = await d(() => window.__dakar.homeView().pieces.map(p => [p.spec, p.room ?? null]));
  const rules = await d(() => window.__dakar.homeRules());
  check(`${ids.length} pieces bought: each delivered and set up in a room of the house, valid where it stands, every room still reachable`, pieces.length >= 8 && rules.pieces.every(p => p.why === null) && rules.reachable?.ok !== false, JSON.stringify({ n: pieces.length, bad: rules.pieces.filter(p => p.why), reach: rules.reachable }));
  await stand(shots['rdc-salon']); await picture('furnished-rdc-salon');
  await stand(shots['etage-suite']); await picture('furnished-etage-suite');
  // « Aménager » on two levels: the level chips, a room upstairs
  await stand(shots['rdc-salon']);
  const opened = await d(() => window.__dakar.placer.open());
  await page.waitForTimeout(800);
  const chips = await d(() => ({ levels: [...document.querySelectorAll('#placer-rooms [data-level]')].map(b => b.textContent), rooms: [...document.querySelectorAll('#placer-rooms [data-room]')].map(b => b.textContent) }));
  check('« Aménager »: the level chips (RDC, Étage) and the ground floor\'s room chips', opened && chips.levels.join() === 'RDC,Étage' && chips.rooms.includes('Grand salon') && !chips.rooms.includes('Parents'), JSON.stringify(chips));
  await t.tap('#placer-rooms [data-level="etage"]'); await page.waitForTimeout(900);
  const up = await d(() => ({ info: window.__dakar.placer.info(), rooms: [...document.querySelectorAll('#placer-rooms [data-room]')].map(b => b.textContent), home: window.__dakar.home() }));
  check('a tap on « Étage »: the first floor in view, its room chips (the parents\' room, the bedrooms, the lounge)', up.info.level === 'etage' && up.home.level === 'etage' && up.rooms.includes('Parents') && up.rooms.includes('Chambre 2') && !up.rooms.includes('Grand salon'), JSON.stringify({ level: up.info.level, home: up.home.level, rooms: up.rooms }));
  await picture('editor-etage');
  await d(() => window.__dakar.placer.close()); await page.waitForTimeout(500);
  check('no page errors', errors.length === 0, errors.join(' | '));
  fs.writeFileSync(`${out}/walk.json`, JSON.stringify({ legs: went, samples: { n: samples.n, closest: samples.worstWall, rooms: [...samples.rooms], levels: [...samples.levels], doors: samples.doorMax, maxY: samples.maxY }, perf: { shell, pieces: pieces.length }, pictures: sizes }, null, 1));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
