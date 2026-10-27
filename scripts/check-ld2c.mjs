// LD2.0-C « Walkable Homes », the acceptance (docs/ld2/LD2_C.md): on a phone page (390 × 844, real touches through Chrome's own touch pipeline),
// rent the F2 of the Résidence Jàmm at its sign → move in → enter → walk through its real rooms (the doors open) → leave → buy furniture at Keur Meubles
// → furnish two rooms in the placement mode, by room (the séjour and the chambre; a doorway refused) → leave by the street door → reload the page →
// come back: the same pieces at the same places and turns, each in its room. Then, in a fresh game, the same F2 bought instead of rented, entered and
// left. No page errors.
// Headless Chromium + SwiftShader: a software renderer, NOT a phone.
// Usage: node scripts/check-ld2c.mjs [baseUrl] [outDir]   (a static build, served on 127.0.0.1: ?argent= is honoured there)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4991/', out = 'docs/proof/ld2c/acceptance'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const results = []; let failed = 0;
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 400) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const errors = [];

/** A game on a phone page, with the helpers the journey uses. */
async function phone() {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(180000);
  page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const t = await realTouch(page);
  const go = async () => {
    await page.goto(`${base}?debug&touch&heure=10&argent=50000000`, T);
    await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate && window.__dakar.placer && window.__dakar.home, null, T);
    await wait(1200);
  };
  const shot = async name => { await wait(500); let buf = await page.screenshot(); if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 92, effort: 8 }).toBuffer(); fs.writeFileSync(`${out}/${name}.png`, buf); };
  const pick = async text => { await page.locator('#modal.on .item', { hasText: text }).first().tap(); await wait(450); };
  const sheet = () => d(() => ({ title: document.querySelector('#modal.on h2')?.textContent ?? '', items: [...document.querySelectorAll('#modal.on .item')].map(b => b.textContent) }));
  /** At the Résidence Jàmm's sign in the street, its sheet opened by a tap on the action button. */
  const atSign = async () => {
    await d(() => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); }); await wait(1500);
    const sign = await d(() => window.__dakar.citeSpots().homes.appart_jamm.sign);
    await d(s => window.__dakar.place(s.x, s.z + 0.5, Math.PI), sign); await wait(900);
    await page.waitForFunction(() => /^appart_jamm:sign/.test(window.__dakar.focus()?.id ?? ''), null, { timeout: 30000 }).catch(() => {});
    await t.tap('#act'); await page.waitForSelector('#modal.on .item', T); await wait(300);
    return sheet();
  };
  const inF2 = () => page.waitForFunction(() => window.__dakar.home()?.plan === 'f2_jamm' && window.__dakar.pos().mode === 'play', null, T);
  return { ctx, page, d, wait, t, go, shot, pick, sheet, atSign, inF2 };
}

// ================================================================== 1. rent the F2 at its sign, move in, enter
const P = await phone();
const { page, d, wait, t, shot, pick } = P;
await P.go();
const s0 = await P.atSign();
check('at the Résidence Jàmm\'s sign, a tap opens its sheet: buy or rent the F2 (9 m × 7 m, 63 m²: entrée, séjour, cuisine, chambre, salle de bain)', s0.items.some(x => /^🔑Acheter/.test(x)) && s0.items.some(x => /^📝Louer/.test(x)) && /63/.test(await d(() => document.querySelector('#modal.on')?.textContent ?? '')), JSON.stringify(s0));
await pick(/^📝Louer/);
await pick(/^✅/);
const rented = await d(() => window.__dakar.estate());
check('rented by touch: the F2 is the player\'s, rented', rented.assets.some(a => a.spec === 'appart_jamm' && a.how === 'rented'), JSON.stringify(rented.assets.filter(a => a.kind === 'home').map(a => [a.spec, a.how])));
await pick('Définir comme domicile principal');
check('moved in: the F2 is the principal residence', (await d(() => window.__dakar.estate().home)) === 'appart_jamm');
await pick('Entrer chez toi');
await P.inF2(); await wait(1200);
const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
const h0 = await d(() => window.__dakar.home());
check('inside: the F2 built from its floor plan, in the entrée, the inner doors shut', h0.plan === 'f2_jamm' && h0.room === 'entree' && h0.doors.length === 3 && h0.doors.every(x => !x.open), JSON.stringify(h0));
await shot('01-entree-on-arrival');

// ================================================================== 2. walk through the real rooms with the joystick
const seen = { rooms: new Set(), doorMax: {}, n: 0, inside: 0, hidden: 0, closest: Infinity };
const probe = () => d(() => { const D = window.__dakar, p = D.pos(), h = D.home(), g = D.roomGeometry(); return { p, h, cols: g.colliders.filter(c => c.x0 < 1e5).map(c => [c.x0, c.z0, c.x1, c.z1]) }; });
const look = s => {
  seen.n++; if (s.h.room) seen.rooms.add(s.h.room);
  for (const x of s.h.doors) seen.doorMax[x.id] = Math.max(seen.doorMax[x.id] ?? 0, x.k);
  for (const [x0, z0, x1, z1] of s.cols) { const dd = Math.hypot(Math.max(x0 - s.p.x, 0, s.p.x - x1), Math.max(z0 - s.p.z, 0, s.p.z - z1)); seen.closest = Math.min(seen.closest, dd); if (dd < 0.2) seen.inside++; }
  if (s.h.hole.seen < 2 / 3 || (s.h.hole.between > 0 && !s.h.hole.on)) seen.hidden++;
};
const walk = async (x, z) => {
  const j = await t.centre('#joy'), r = 50, t0 = Date.now();
  await t.down(3, j.x, j.y);
  let s = await probe(), best = Infinity, bestAt = Date.now();
  while (Date.now() - t0 < 45000) {
    look(s);
    const dx = O.x + x - s.p.x, dz = O.z + z - s.p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.3) break;
    if (dist < best - 0.05) { best = dist; bestAt = Date.now(); } else if (Date.now() - bestAt > 12000) break;
    const a = wrap(Math.atan2(dx, dz) - s.p.cam), k = dist > 1.2 ? 0.6 : dist > 0.6 ? 0.4 : 0.25;
    await t.move(3, j.x - Math.sin(a) * r * k, j.y - Math.cos(a) * r * k, 1);
    await wait(90); s = await probe();
  }
  await t.up(3); await wait(250); s = await probe(); look(s);
  return { dist: Math.hypot(O.x + x - s.p.x, O.z + z - s.p.z), room: s.h.room };
};
const legs = [[2.6, 2.45, 'entree'], [1.0, 2.45, 'sejour'], [1.0, 0.75, 'sejour'], [2.3, 0.75, 'cuisine'], [3.2, -1.2, 'cuisine'], [2.3, 0.75, 'cuisine'], [1.0, 0.7, 'sejour'],
  [0.5, 0.6, 'sejour'], [0.5, -0.6, 'degagement'], [-0.4, -0.65, 'degagement'], [-1.6, -0.6, 'chambre'], [-2.6, -1.8, 'chambre'], [-1.6, -0.6, 'chambre'], [-0.4, -0.65, 'degagement'],
  [1.1, -0.7, 'degagement'], [1.0, -1.9, 'sdb'], [1.1, -0.7, 'degagement'], [0.5, -0.5, 'degagement'], [0.5, 0.6, 'sejour'], [1.0, 2.45, 'sejour'], [2.6, 2.45, 'entree'], [3.15, 2.85, 'entree']];
const missed = [];
for (const [x, z, room] of legs) { const r = await walk(x, z); if (!(r.dist < 0.45 && r.room === room)) missed.push({ to: [x, z], want: room, got: r }); if (room === 'cuisine' && x > 3) await shot('02-cuisine'); if (room === 'chambre' && z < -1) await shot('03-chambre'); if (room === 'sdb') await shot('04-salle-de-bain'); }
check(`walked through the real rooms with the joystick (${legs.length} legs): entrée → séjour → cuisine → séjour → dégagement → chambre → dégagement → salle de bain → entrée`, !missed.length, JSON.stringify(missed));
check('every room visited', ['entree', 'sejour', 'cuisine', 'degagement', 'chambre', 'sdb'].every(r => seen.rooms.has(r)), [...seen.rooms].join(','));
check('the kitchen\'s, the bedroom\'s and the bathroom\'s doors opened as the player came through', ['sejour-cuisine', 'degagement-chambre', 'degagement-sdb'].every(id => seen.doorMax[id] === 1), JSON.stringify(seen.doorMax));
check(`never inside a wall, a fitting or a door (${seen.n} samples, closest ${seen.closest.toFixed(3)} m), and the player always seen`, seen.inside === 0 && seen.hidden === 0, JSON.stringify({ inside: seen.inside, hidden: seen.hidden }));
const f1 = await d(() => window.__dakar.focus());
check('at the street door the action is « Sortir »', f1?.primary === 'Sortir', JSON.stringify(f1));
await t.tap('#act');
await page.waitForFunction(() => window.__dakar.pos().x < 900 && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
check('« Sortir » by a tap: back in the street', (await d(() => window.__dakar.pos().x)) < 900 && (await d(() => window.__dakar.home())) === null);

// ================================================================== 3. buy furniture at Keur Meubles (real taps)
const buys = [['Salon', 'Canapé en tissu wax'], ['Salon', 'Table basse'], ['Télé et musique', 'Télé écran plat'], ['Chambre', 'Lit en bois, deux places'], ['Chambre', 'Armoire en bois']];
for (const [shelf, name] of buys) {
  await d(() => window.__dakar.catalogue()); await page.waitForSelector('#modal.on .item', T);
  await pick(shelf); await pick(name);
  await page.locator('#modal.on .item', { hasText: /^✅/ }).first().tap(); await wait(500);
}
await page.locator('#modal.on .sh-x').first().tap(); await wait(400);
const bought = (await d(() => window.__dakar.estate())).assets.filter(a => a.kind === 'furniture');
check('five pieces bought at Keur Meubles by touch, delivered to the F2', ['canape_wax', 'table_basse', 'tele_plate', 'lit_bois', 'armoire_bois'].every(id => bought.some(a => a.spec === id && a.at)), JSON.stringify(bought.map(a => [a.spec, a.at])));

// ================================================================== 4. furnish the séjour and the chambre in the placement mode, by room
await d(() => window.__dakar.assetSheet('appart_jamm')); await page.waitForSelector('#modal.on .item', T); await pick('Entrer chez toi');
await P.inF2(); await wait(1000);
const info = () => d(() => window.__dakar.placer.info());
await d(v => window.__dakar.place(v.ox + 0.4, v.oz + 2.2, Math.PI), view); await wait(800);
const fa = JSON.stringify(await d(() => window.__dakar.focus()) ?? '');
if (/Aménager/.test(fa)) await t.tap('#act'); else await d(() => window.__dakar.placer.open());
await page.waitForFunction(() => window.__dakar.placer.info().open && document.querySelector('#placer.on'), null, T); await wait(700);
check('« Aménager » opens the placement mode, with the room chips', /Aménager/.test(fa) && (await d(() => [...document.querySelectorAll('#placer-rooms button')].map(b => b.textContent))).includes('Chambre'), fa.slice(0, 120));
const screenAt = (hx, hz, y = 0.4) => d(([hx, hz, y]) => { const D = window.__dakar, v = D.homeView(), cam = D.three.camera, V = cam.position.constructor; const p = new V(v.ox + hx, 0.1 + y, v.oz + hz).project(cam), r = document.getElementById('c').getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; }, [hx, hz, y]);
const ensureList = async open => { if ((await d(() => document.getElementById('placer').classList.contains('open'))) !== open) { await t.tap('#placer [data-a="more"]'); await wait(300); } };
const chip = async id => { await t.tap(`#placer-rooms [data-room="${id}"]`); await wait(700); };
async function place(uid, x, z, rot) {
  await ensureList(true);
  await d(uid => document.querySelector(`#placer [data-uid="${uid}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }), uid); await wait(150);
  await t.tap(`#placer [data-uid="${uid}"]`); await wait(350);
  await ensureList(false);
  for (let k = 0; k < 4 && (await info()).pending.rot !== rot; k++) { await t.tap('#placer [data-a="rot"]'); await wait(200); }
  const p0 = (await info()).pending, a = await screenAt(p0.x, p0.z), b = await screenAt(x, z);
  await t.down(1, a.x, a.y); await t.move(1, b.x, b.y, 14); await wait(120); await t.up(1); await wait(450);
  let i = await info();
  if (!(i.pending.x === x && i.pending.z === z && !i.why)) { const c = await screenAt(x, z, 0); await t.down(2, c.x, c.y); await wait(60); await t.up(2); await wait(350); i = await info(); }
  for (let k = 0; k < 4 && (await info()).pending.rot !== rot; k++) { await t.tap('#placer [data-a="rot"]'); await wait(200); }
  const saved = (await info()).items.find(f => f.uid === uid).at;
  if (!saved || saved.x !== x || saved.z !== z || saved.rot !== rot) { await t.tap('#placer [data-a="put"]'); await wait(450); }
  return (await info()).items.find(f => f.uid === uid);
}
const spots = { table_basse: [-2.25, 1.5, 0], canape_wax: [-2.25, 0.5, 0], tele_plate: [-2.25, 3.0, 2], lit_bois: [-2.75, -2.25, 0], armoire_bois: [-3.5, -0.5, 2] };
let i0 = await info();
const uidOf = spec => i0.items.find(f => f.spec === spec).uid;
await chip('sejour');
for (const spec of ['table_basse', 'canape_wax', 'tele_plate']) { const [x, z, rot] = spots[spec], it = await place(uidOf(spec), x, z, rot); check(`séjour: the ${spec} placed by touch at its spot, saved`, it.at?.x === x && it.at?.z === z && it.at?.rot === rot && it.room === 'sejour', JSON.stringify(it)); }
await shot('05-sejour-furnished');
await chip('chambre');
for (const spec of ['lit_bois', 'armoire_bois']) { const [x, z, rot] = spots[spec], it = await place(uidOf(spec), x, z, rot); check(`chambre: the ${spec} placed by touch at its spot, saved`, it.at?.x === x && it.at?.z === z && it.at?.rot === rot && it.room === 'chambre', JSON.stringify(it)); }
await shot('06-chambre-furnished');
// a doorway: the wardrobe dragged into the bedroom door's swing is refused, its saved spot kept
const wardrobe = uidOf('armoire_bois'), before = (await info()).items.find(f => f.uid === wardrobe).at;
const a0 = await screenAt(before.x, before.z), b0 = await screenAt(-2.0, -0.5);
await t.down(1, a0.x, a0.y); await t.move(1, b0.x, b0.y, 12); await wait(150);
const why = (await info()).why;
await t.up(1); await wait(400); await t.tap('#placer [data-a="put"]'); await wait(300);
const after = (await info()).items.find(f => f.uid === wardrobe).at;
check('in a doorway (where the bedroom\'s door swings) the wardrobe is refused, said plainly, and its spot kept', /porte/.test(why ?? '') && JSON.stringify(after) === JSON.stringify(before), JSON.stringify({ why, before, after }));
const layout = (await info()).items.map(f => ({ uid: f.uid, spec: f.spec, at: f.at, room: f.room }));
check('two rooms furnished: three pieces in the séjour, two in the chambre', layout.filter(f => f.room === 'sejour').length === 3 && layout.filter(f => f.room === 'chambre').length === 2, JSON.stringify(layout));
await t.tap('#placer [data-a="done"]'); await page.waitForFunction(() => !window.__dakar.placer.info().open, null, T); await wait(500);

// ================================================================== 5. leave by the street door, reload, come back
const exitAt = await d(() => window.__dakar.interactables().find(i => i.special === 'exit' || /:in:door:appart_jamm$/.test(i.id)) ?? null);
await d(v => window.__dakar.place(v.ox + 3.15, v.oz + 2.8, 0), view); await wait(700);
const f2 = await d(() => window.__dakar.focus());
if (f2?.primary === 'Sortir') await t.tap('#act'); else await d(() => window.__dakar.exit());
await page.waitForFunction(() => window.__dakar.pos().x < 900, null, T);
check('left the F2 by its street door', f2?.primary === 'Sortir' && (await d(() => window.__dakar.pos().x)) < 900, JSON.stringify({ f2, exitAt: !!exitAt }));
await d(() => dispatchEvent(new Event('pagehide')));
await page.goto('about:blank'); await P.go();
await d(() => window.__dakar.assetSheet('appart_jamm')); await page.waitForSelector('#modal.on .item', T); await pick('Entrer chez toi');
await P.inF2(); await wait(1200);
const reloaded = (await d(() => window.__dakar.estate())).assets.filter(a => a.kind === 'furniture').map(a => ({ uid: a.uid, spec: a.spec, at: a.at }));
check('after a reload: still renting and living in the F2', (await d(() => window.__dakar.estate())).assets.some(a => a.spec === 'appart_jamm' && a.how === 'rented') && (await d(() => window.__dakar.estate().home)) === 'appart_jamm');
check('after a reload: the same five pieces at the same places and turns', JSON.stringify(reloaded) === JSON.stringify(layout.map(({ uid, spec, at }) => ({ uid, spec, at }))), JSON.stringify(reloaded));
const rules = await d(() => window.__dakar.homeRules());
check('… each in its room, valid under the plan, every room still reachable', rules.pieces.every(p => p.why === null && layout.find(f => f.uid === p.uid)?.room === p.room) && rules.reachable?.ok, JSON.stringify(rules.pieces.map(p => [p.spec, p.room, p.why])));
const hv = await d(() => window.__dakar.homeView());
check('… and the models stand there', layout.every(f => { const p = hv.pieces.find(x => x.uid === f.uid); return p && Math.abs(p.x - hv.ox - f.at.x) < 1e-6 && Math.abs(p.z - hv.oz - f.at.z) < 1e-6; }), JSON.stringify(hv.pieces));
await d(v => window.__dakar.place(v.ox - 0.6, v.oz + 2.9, Math.PI * 0.82), view); await wait(1500); await shot('07-sejour-after-reload');
await P.ctx.close();

// ================================================================== 6. a fresh game: the F2 bought instead of rented, entered, left
const B = await phone();
await B.go();
const s1 = await B.atSign();
await B.pick(/^🔑Acheter/); await B.pick(/^Acheter|^✅/);
const est = await B.d(() => window.__dakar.estate());
check('bought by touch at the sign: the F2 is the player\'s, owned', est.assets.some(a => a.spec === 'appart_jamm' && a.how === 'owned'), JSON.stringify({ sheet: s1.items.slice(0, 3), homes: est.assets.filter(a => a.kind === 'home').map(a => [a.spec, a.how]) }));
await B.pick('Définir comme domicile principal'); await B.pick('Entrer chez toi');
await B.inF2(); await B.wait(1000);
const hb = await B.d(() => window.__dakar.home());
check('entered the bought F2: the same walkable apartment', hb.plan === 'f2_jamm' && hb.room === 'entree', JSON.stringify(hb));
await B.d(() => window.__dakar.exit()); await B.page.waitForFunction(() => window.__dakar.pos().x < 900, null, T);
check('and out again', (await B.d(() => window.__dakar.pos().x)) < 900);
await B.ctx.close();

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
fs.writeFileSync(`${out}/check-ld2c.json`, JSON.stringify({ base, failed, results, walk: { samples: seen.n, closest: seen.closest, rooms: [...seen.rooms], doors: seen.doorMax }, errors: errors.slice(0, 10) }, null, 1));
console.log(`${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
