// LD2.0-C « Walkable Homes », lane F: furnishing the F2 by room, on a phone, with real touches (Chrome's own touch pipeline, scripts/lib/realTouch.mjs).
// Own the F2; buy a sofa, a coffee table and a television, a bed and a wardrobe through Keur Meubles' catalogue (real taps); in the placement mode choose
// « Séjour » and place the first three there, choose « Chambre » and place the other two there (real drags, « Tourner », « Poser »); try to put the wardrobe
// where the bedroom's door swings and read the refusal; leave, reload the page, come back in: the same pieces at the same places and turns, each in its
// room. The room chips must fit a 390 px wide screen without touching the toolbar. Pictures of the editor and of each furnished room.
// The F2's rules come from its floor plan (src/housing/plan.ts); in a lane where the shell is still the old open room, the pictures show that room.
// Headless Chromium + SwiftShader: a software renderer, NOT a phone.
//
// With an older build's URL (a build from before the F2's floor plan, its F2 one open room): an F2 furnished there, its save loaded here, keeps every
// piece, each valid under the plan, nothing charged, the same layout on a second load.
//
// Usage: node scripts/check-furnish-rooms.mjs <baseUrl> [outDir=docs/proof/ld2c/furnish] [olderBuildUrl]   (local previews: ?argent= is honoured there)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { realTouch } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4972/', out = 'docs/proof/ld2c/furnish', older = null] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const viewport = { width: 390, height: 844 };
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(180000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 600) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 400)}`); };
const d = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
/** A picture under 400 kB: a PNG, reduced to a 256-colour palette when it is bigger (Python PIL). */
const shot = async name => {
  await wait(500); const f = `${out}/${name}.png`; await page.screenshot({ path: f });
  if (fs.statSync(f).size > 380_000) { try { execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[1], optimize=True)', f]); } catch (e) { console.log('palette', e.message); } }
  return f;
};
const info = () => d(() => window.__dakar.placer.info());
const go = async () => {
  await page.goto(`${base}?debug&touch&heure=10&argent=50000000`, T);
  await page.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate && window.__dakar.placer, null, T);
};
const t = await realTouch(page);
/** Taps the first item of the open sheet that reads `text` (a real touch). */
const pick = async text => { await page.locator('#modal.on .item', { hasText: text }).first().tap(); await wait(450); };
/** A point of the home (its own metres, y above the floor) on the screen, in page pixels. */
const screen = (hx, hz, y = 0.4) => d(([hx, hz, y]) => {
  const D = window.__dakar, v = D.homeView(), cam = D.three.camera, V = cam.position.constructor;
  const p = new V(v.ox + hx, 0.1 + y, v.oz + hz).project(cam), r = document.getElementById('c').getBoundingClientRect();
  return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
}, [hx, hz, y]);
const enterF2 = async () => {
  await d(() => window.__dakar.assetSheet('appart_jamm')); await page.waitForSelector('#modal.on .item', T);
  await pick('Entrer chez toi');
  await page.waitForFunction(() => window.__dakar.homeView()?.spec === 'appart_jamm', null, T); await wait(1200);
};
const openEditor = async () => {
  const v = await d(() => window.__dakar.homeView());
  await d(v => window.__dakar.place(v.ox + 0.4, v.oz + 2.2, Math.PI), v); await wait(800);                    // in the séjour, nothing else at hand
  let how = 'the « Aménager » button';
  const focus = JSON.stringify(await d(() => window.__dakar.focus()) ?? '');
  if (/Aménager/.test(focus)) await t.tap('#act'); else { how = 'the debug hook (the action button offered ' + focus.slice(0, 80) + ')'; await d(() => window.__dakar.placer.open()); }
  await page.waitForFunction(() => window.__dakar.placer.info().open && document.querySelector('#placer.on'), null, T); await wait(700);
  return how;
};
const chip = async id => { await t.tap(`#placer-rooms [data-room="${id}"]`); await wait(700); };
const ensureList = async open => { const isOpen = await d(() => document.getElementById('placer').classList.contains('open')); if (isOpen !== open) { await t.tap('#placer [data-a="more"]'); await wait(300); } };
/** Picks a piece from the list (a real tap), turns it to `rot` (« Tourner »), drags it with one finger to (x, z) and makes sure it is placed there (« Poser »). */
async function place(uid, x, z, rot) {
  await ensureList(true);
  await d(uid => document.querySelector(`#placer [data-uid="${uid}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }), uid); await wait(150);   // the list scrolls sideways (a swipe)
  await t.tap(`#placer [data-uid="${uid}"]`); await wait(350);
  if ((await info()).selected !== uid) throw new Error(`the list did not select ${uid}`);
  await ensureList(false);
  for (let k = 0; k < 4 && (await info()).pending.rot !== rot; k++) { await t.tap('#placer [data-a="rot"]'); await wait(200); }
  const p0 = (await info()).pending, a = await screen(p0.x, p0.z), b = await screen(x, z);
  await t.down(1, a.x, a.y); await t.move(1, b.x, b.y, 14); await wait(120); await t.up(1); await wait(450);
  let i = await info();
  const landed = i.pending.x === x && i.pending.z === z && !i.why;                                            // the drag alone brought it there
  if (!landed) {                                                      // off by a grid step: a short tap on the floor where it should be
    const c = await screen(x, z, 0); await t.down(2, c.x, c.y); await wait(60); await t.up(2); await wait(350); i = await info();
  }
  if (i.pending.rot !== rot) { for (let k = 0; k < 4 && (await info()).pending.rot !== rot; k++) { await t.tap('#placer [data-a="rot"]'); await wait(200); } }
  const saved = (await info()).items.find(f => f.uid === uid).at;
  if (!saved || saved.x !== x || saved.z !== z || saved.rot !== rot) { await t.tap('#placer [data-a="put"]'); await wait(450); }
  return { info: await info(), drag: { from: a, to: b, landed } };
}

// ------------------------------------------------------------------ 1. own the F2, buy five pieces at Keur Meubles with real taps
await go();
await d(() => { const D = window.__dakar; D.buyAsset('appart_jamm'); D.moveIn('appart_jamm'); });
check('the F2 is the player\'s home', (await d(() => window.__dakar.estate().home)) === 'appart_jamm');
const wallet0 = await d(() => window.__dakar.state.wallet);
const buys = [['Salon', 'Canapé en tissu wax'], ['Salon', 'Table basse'], ['Télé et musique', 'Télé écran plat'], ['Chambre', 'Lit en bois, deux places'], ['Chambre', 'Armoire en bois']];
const toasts = [];
for (const [shelf, name] of buys) {
  await d(() => window.__dakar.catalogue()); await page.waitForSelector('#modal.on .item', T);
  await pick(shelf); await pick(name);
  await page.locator('#modal.on .item', { hasText: /^✅/ }).first().tap(); await wait(500);
  toasts.push(await d(() => document.getElementById('toast')?.textContent ?? ''));
}
await page.locator('#modal.on .sh-x').first().tap(); await wait(400);                                         // the sheet's close button
const bought = (await d(() => window.__dakar.estate())).assets.filter(a => a.kind === 'furniture');
const want = { canape_wax: 'sejour', table_basse: 'sejour', tele_plate: 'sejour', lit_bois: 'chambre', armoire_bois: 'chambre' };
check('five pieces bought by touch, each delivered to the F2 and set up in a room of its kind', Object.keys(want).every(id => bought.some(a => a.spec === id && a.at)) && bought.length === 5,
  JSON.stringify(bought.map(a => [a.spec, a.at])) + ' · ' + toasts.map(x => x.slice(0, 60)).join(' | '));
const paid = wallet0 - await d(() => window.__dakar.state.wallet);
check('charged once for each, the catalogue\'s prices', paid === 95_000 + 6_000 + 180_000 + 120_000 + 110_000, `${paid}`);

// ------------------------------------------------------------------ 2. in the F2, the placement mode by room
await enterF2();
const how = await openEditor();
check(`the placement mode opens in the F2 (by ${how})`, (await info()).open);
const ui = await d(() => {
  const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  return { rooms: r('placer-rooms'), bar: r('placer'), stats: r('stats'), menu: r('menuBtn'), chips: [...document.querySelectorAll('#placer-rooms button')].map(b => b.textContent), w: innerWidth };
});
const inside = ui.rooms && ui.rooms.l >= 0 && ui.rooms.r <= ui.w;
const clear = (a, b) => !a || !b || a.b <= b.t || b.b <= a.t || a.r <= b.l || b.r <= a.l;
check('the room chips (🏠 Entrée Séjour Cuisine Chambre Salle de bain) fit the 390 px screen, clear of the toolbar and the HUD', inside && clear(ui.rooms, ui.bar) && clear(ui.rooms, ui.stats) && clear(ui.rooms, ui.menu)
  && ['Entrée', 'Séjour', 'Cuisine', 'Chambre', 'Salle de bain'].every(n => ui.chips.includes(n)), JSON.stringify(ui));
await ensureList(true);
const ui2 = await d(() => { const a = document.getElementById('placer-rooms').getBoundingClientRect(), b = document.getElementById('placer').getBoundingClientRect(); return { rooms: a.bottom, bar: b.top }; });
check('with the list drawer open, the toolbar still stays below the chips', ui2.rooms < ui2.bar, JSON.stringify(ui2));
await ensureList(false);
await chip('sejour');
let i = await info();
check('« Séjour » frames the séjour: the camera looks at its centre', i.room === 'sejour' && Math.abs(i.target.z - (await d(() => window.__dakar.homeView().oz)) - 1.73) < 0.05, JSON.stringify({ room: i.room, target: i.target }));
await shot('01-editor-room-chips');
const uidOf = spec => i.items.find(f => f.spec === spec).uid;
const plan = { canape_wax: [-2.25, 0.5, 0], table_basse: [-2.25, 1.5, 0], tele_plate: [-2.25, 3.0, 2], lit_bois: [-2.75, -2.25, 0], armoire_bois: [-3.5, -0.5, 2] };
await ensureList(true);
check('the list shows the séjour\'s pieces (the chosen room)', await d(() => [...document.querySelectorAll('#placer .pl-items [data-uid]')].length) === 3, await d(() => [...document.querySelectorAll('#placer .pl-items button')].map(b => b.textContent).join(' | ')));
await ensureList(false);
const placedLog = [];
for (const spec of ['table_basse', 'canape_wax', 'tele_plate']) {
  const [x, z, rot] = plan[spec], r = await place(uidOf(spec), x, z, rot), it = r.info.items.find(f => f.spec === spec);
  placedLog.push([spec, it.at, it.room]);
  check(`séjour: the ${spec} dragged to its spot and turned, placed and saved there`, it.at && it.at.x === x && it.at.z === z && it.at.rot === rot && it.room === 'sejour', JSON.stringify({ at: it.at, room: it.room, why: r.info.why, drag: r.drag }));
}
await shot('02-sejour-furnished');
await chip('chambre');
i = await info();
check('« Chambre » frames the bedroom', i.room === 'chambre', JSON.stringify(i.target));
for (const spec of ['lit_bois', 'armoire_bois']) {
  const [x, z, rot] = plan[spec], r = await place(uidOf(spec), x, z, rot), it = r.info.items.find(f => f.spec === spec);
  placedLog.push([spec, it.at, it.room]);
  check(`chambre: the ${spec} dragged to its spot and turned, placed and saved there`, it.at && it.at.x === x && it.at.z === z && it.at.rot === rot && it.room === 'chambre', JSON.stringify({ at: it.at, room: it.room, why: r.info.why, drag: r.drag }));
}
await shot('03-chambre-furnished');

// ------------------------------------------------------------------ 3. the wardrobe where the bedroom's door swings: refused, said plainly
const wardrobe = uidOf('armoire_bois'), before = (await info()).items.find(f => f.uid === wardrobe).at;
const a0 = await screen(before.x, before.z), b0 = await screen(-2.0, -0.5);
await t.down(1, a0.x, a0.y); await t.move(1, b0.x, b0.y, 12); await wait(150);
const midDrag = await d(() => ({ status: document.querySelector('#placer .pl-status')?.textContent, bubble: document.getElementById('placer-why').classList.contains('on') ? document.getElementById('placer-why').textContent : null, info: window.__dakar.placer.info() }));
await shot('04-refused-in-the-doorway');
await t.up(1); await wait(400);
await t.tap('#placer [data-a="put"]'); await wait(300);
const toast = await d(() => document.getElementById('toast')?.textContent ?? '');
const after = (await info()).items.find(f => f.uid === wardrobe).at;
check('dragged into the bedroom door\'s swing, the wardrobe is refused: « Il faut laisser la porte s’ouvrir », beside the piece and in the toolbar',
  /laisser la porte s.ouvrir/.test(midDrag.info.why ?? '') && /laisser la porte/.test(midDrag.status ?? '') && /laisser la porte/.test(midDrag.bubble ?? ''), JSON.stringify({ why: midDrag.info.why, pending: midDrag.info.pending, status: midDrag.status, bubble: midDrag.bubble }));
check('« Poser » there is refused and the saved spot is kept', JSON.stringify(after) === JSON.stringify(before) && /porte/.test(toast), JSON.stringify({ before, after, toast: toast.slice(0, 120) }));
// put it back where it was (a tap on the list keeps the saved spot: nothing was saved)
const finalAt = (await info()).items.map(f => ({ uid: f.uid, spec: f.spec, at: f.at, room: f.room }));
check('the five pieces stand in their rooms: three in the séjour, two in the chambre', finalAt.filter(f => f.room === 'sejour').length === 3 && finalAt.filter(f => f.room === 'chambre').length === 2, JSON.stringify(finalAt));

// ------------------------------------------------------------------ 4. leave, reload, come back: the same layout
await t.tap('#placer [data-a="done"]'); await page.waitForFunction(() => !window.__dakar.placer.info().open, null, T);
await d(() => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900, null, T); await wait(500);
await d(() => dispatchEvent(new Event('pagehide')));
await page.goto('about:blank'); await go();
await enterF2();
const reloaded = (await d(() => window.__dakar.estate())).assets.filter(a => a.kind === 'furniture').map(a => ({ uid: a.uid, spec: a.spec, at: a.at }));
check('after a reload, the same five pieces at the same places and turns', JSON.stringify(reloaded) === JSON.stringify(finalAt.map(({ uid, spec, at }) => ({ uid, spec, at }))), JSON.stringify(reloaded));
await openEditor();
const back = (await info()).items.map(f => ({ uid: f.uid, spec: f.spec, at: f.at, room: f.room }));
check('… each in its room (found from where it stands)', JSON.stringify(back) === JSON.stringify(finalAt), JSON.stringify(back));
const hv = await d(() => window.__dakar.homeView());
check('the models stand where they were saved', finalAt.every(f => { const p = hv.pieces.find(x => x.uid === f.uid); return p && Math.abs(p.x - hv.ox - f.at.x) < 1e-6 && Math.abs(p.z - hv.oz - f.at.z) < 1e-6 && Math.abs(p.yaw - f.at.rot * Math.PI / 2) < 1e-6; }), JSON.stringify(hv.pieces));
await chip('sejour'); await shot('05-reloaded-sejour');
await chip('chambre'); await shot('06-reloaded-chambre');
await t.tap('#placer [data-a="done"]'); await wait(300);

// ------------------------------------------------------------------ 5. (with an older build) a save from before the plan, its F2 furnished in the open room
if (older) {
  const oc = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true }), op = await oc.newPage();
  op.on('pageerror', e => errors.push(`older build: ${e.message}`));
  await op.goto(`${older}?debug&touch&argent=50000000`, T);
  await op.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.estate, null, T);
  await op.evaluate(() => { const D = window.__dakar; D.buyAsset('appart_jamm'); D.moveIn('appart_jamm'); for (const p of ['lit_bois', 'canape_wax', 'table_manger', 'armoire_bois', 'tapis_tisse']) D.buyPiece(p); });
  await op.evaluate(() => dispatchEvent(new Event('pagehide'))); await op.waitForTimeout(400);
  const oldSave = await op.evaluate(() => localStorage.getItem('dakarrek.guest.save.v6'));
  const oldPieces = (await op.evaluate(() => window.__dakar.estate())).assets.filter(a => a.kind === 'furniture').map(a => ({ uid: a.uid, spec: a.spec, at: a.at }));
  const oldWallet = JSON.parse(oldSave).wallet;
  await oc.close();
  const nc = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await nc.addInitScript(sv => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('dakarrek.guest.save.v6', sv); sessionStorage.setItem('seeded', '1'); } }, oldSave);
  const np = await nc.newPage(); np.on('pageerror', e => errors.push(`old save: ${e.message}`));
  const load = async () => { await np.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.homeRules, null, T); await np.waitForTimeout(800); return np.evaluate(() => ({ rules: window.__dakar.homeRules(), wallet: window.__dakar.state.wallet })); };
  await np.goto(`${base}?debug&touch`, T);
  const first = await load();
  const r = first.rules;
  check('an F2 furnished by the older build (bed, sofa, table, wardrobe, rug in its open room) loads here with all five kept, each valid under the plan, every room reachable',
    r.plan === 'f2_jamm' && r.pieces.length === 5 && !r.stored.length && oldPieces.every(o => r.pieces.some(p => p.uid === o.uid && p.spec === o.spec)) && r.pieces.every(p => p.why === null && p.room) && r.reachable?.ok,
    JSON.stringify({ old: oldPieces.map(o => [o.spec, o.at]), now: r.pieces.map(p => [p.spec, p.at, p.room, p.why]), stored: r.stored, reachable: r.reachable }));
  const moved = r.pieces.filter(p => JSON.stringify(p.at) !== JSON.stringify(oldPieces.find(o => o.uid === p.uid).at)).map(p => p.spec);
  check('… the pieces the plan refuses were moved by kind, the valid ones kept their spot; nothing charged', first.wallet === oldWallet && moved.length > 0 && moved.length < 5, JSON.stringify({ moved, wallet: [oldWallet, first.wallet] }));
  await np.evaluate(() => dispatchEvent(new Event('pagehide'))); await np.reload(); const second = await load();
  check('… and the same layout on the next load', JSON.stringify(second.rules.pieces) === JSON.stringify(r.pieces), JSON.stringify(second.rules.pieces.map(p => [p.spec, p.at])));
  await nc.close();
}
check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));

fs.writeFileSync(`${out}/check-furnish-rooms.json`, JSON.stringify({ base, failed, results, placed: placedLog, errors: errors.slice(0, 10) }, null, 1));
console.log(`${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
