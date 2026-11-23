// LD2.0-B lane H, without a server: a host's home visited by a guest, and a meetup, in two browser contexts of the real build (real taps and keys).
// - A (host, desktop): a save with the Résidence Jàmm's F2, furniture and an upgrade; its home snapshot (onlineHooks.homeSnapshot through ?debug).
// - B (guest, phone, real touches): owns the same F2 with other furniture; a small in-page `online` stub holds an accepted invitation from A and answers
//   `visit()` with A's snapshot. B is guided to A's street door (« Y aller »), walks there with the joystick, taps « Entrer chez Awa (invité) », and
//   inside: the drawn furniture (count, positions within 1 cm of A's), the read-only actions, the presence space, the draw calls against A's; leaving
//   by the door puts B's own F2 back exactly as it was (the save untouched); a revocation takes B out with one sentence.
// - A meetup: an accepted meeting one city minute ahead at the grand-place: `here` once, then the card once the stub says 'met'.
// - The meeting places of every district resolve where the walking marker resolves them.
// Usage: node scripts/check-visit.mjs [baseUrl] [outDir]   (a static build: npx vite build --outDir /tmp/claude-0/ld2b-visits/dist; node /tmp/claude-0/beta/tools/serve.mjs <dist> 4640)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4640/', out = 'docs/ld2/proof/visit'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra: String(extra).slice(0, 400) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 400) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const TAG_A = '7f3a91c20b4e55d1', TAG_B = '0c1d2e3f40516273', TAG_C = '5e6f708192a3b4c5';
const ready = page => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.visit && window.__dakar.meet, null, { timeout: 300000 });
const pick = async (page, text) => { await page.locator('#modal.on .item', { hasText: text }).first().click(); await page.waitForTimeout(300); };
const sortPieces = list => [...list].sort((a, b) => a.spec.localeCompare(b.spec) || a.x - b.x || a.z - b.z);
/** What the save holds of the player's homes and furniture (the clocks of income and charges move with played time: not compared). */
const saveAssets = page => page.evaluate(() => { window.__dakar.save(); const s = JSON.parse(localStorage.getItem('dakarrek.guest.save.v6')); return JSON.stringify({ home: s.assets.home, list: s.assets.list.map(a => ({ uid: a.uid, spec: a.spec, how: a.how, home: a.home ?? null, at: a.at ?? null, upgrades: a.upgrades, leased: a.leased })) }); });
const closeSheet = async page => { await page.evaluate(() => document.querySelector('#modal.on .sh-x')?.click()); await page.waitForTimeout(300); };
const toastText = page => page.evaluate(() => document.querySelector('#toast')?.textContent ?? '');

/** The in-page account stub: `online` for the page (src/online/api.ts), with what the check needs. */
function installStub(page, cfg) {
  return page.evaluate(cfg => {
    const on = { change: new Set(), end: new Set() }, log = { visit: [], find: [], here: [], join: [] };
    const no = async () => ({ ok: false, reason: 'offline', text: 'stub' });
    const items = {};
    const api = {
      status: 'online', me: { tag: cfg.me, code: cfg.me.toUpperCase().match(/.{4}/g).join('-') }, balance: null, limits: null, today: null,
      convs: () => cfg.convs, items: tag => items[tag] ?? [], more: async () => false, read() {}, unread: () => 0, seen: () => 'online',
      newId: () => crypto.randomUUID(), say: () => ({ ok: true, id: 'x' }), shareLocation: () => ({ ok: true, id: 'x' }),
      payQuote: a => ({ amount: a, fromOnline: 0, fromWallet: a }), pay: no, ask: no, closeAsk: no, fund: no, cashout: no, history: no,
      invite: no, answerInvite: no, revokeInvite: no,
      visit: async host => { log.visit.push(host); const v = window.__stub.visitAnswers[host]; return v ? { ok: true, ...v } : { ok: false, reason: 'no-invite', text: 'Pas d’invitation pour l’instant.' }; },
      meet: no, answerMeet: no, cancelMeet: no,
      here: ref => { log.here.push(ref); },
      block: no, isBlocked: () => false, report: no, forget: no, lookup: no,
      find: async tag => { log.find.push(tag); return { ok: true, hub: cfg.findHub, room: cfg.findRoom }; },
      onChange: fn => { on.change.add(fn); return () => on.change.delete(fn); },
      onVisitEnd: fn => { on.end.add(fn); return () => on.end.delete(fn); },
    };
    window.__stub = { api, log, items, visitAnswers: {}, change: () => on.change.forEach(f => f()), end: (h, i) => on.end.forEach(f => f(h, i)) };
    window.__dakar.visit.setOnline(api);
    window.__dakar.visit.deps({ room: () => cfg.myRoom, joinRoom: (h, r) => log.join.push([h, r]) });
  }, cfg);
}

async function newGame(context) {
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&heure=11${context.__touch ? '&touch' : ''}`, { timeout: 180000 }); await ready(page);
  await page.evaluate(() => window.__dakar.giveMoney(2_000_000_000));
  return { page, errors };
}
/** The F2 of the Résidence Jàmm as the principal residence, with these pieces delivered there. */
async function furnish(page, pieces) {
  return page.evaluate(pieces => {
    const d = window.__dakar; d.buyAsset('appart_jamm'); d.moveIn('appart_jamm');
    for (const id of pieces) d.buyPiece(id);
    return d.estate();
  }, pieces);
}
const inside = (page, spec) => page.waitForFunction(s => window.__dakar.homeView()?.spec === s && window.__dakar.pos().mode === 'play', spec, { timeout: 60000 });
/** The same view of the room for both players: the player at the room's spawn, a fixed camera from above the door side, one frame drawn. */
async function frame(page, view) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 720, height: 720 }); await page.waitForTimeout(400);       // the same frustum for both players
  const r = await page.evaluate(v => {
    const d = window.__dakar; d.pause(true);
    d.place(v.ox + 1.2, v.oz + 1.2, Math.PI); d.step(1 / 60, 2);
    d.cam([v.ox + 0.5, 8.5, v.oz + 7.2], [v.ox, 0.4, v.oz - 0.6]); d.render();
    return { calls: d.drawCalls(), tris: d.tris() };
  }, view);
  return { ...r, restore: size };
}
const resume = async (page, f) => { await page.evaluate(() => { const d = window.__dakar; d.cam(null); d.pause(false); }); if (f?.restore) await page.setViewportSize(f.restore); await page.waitForTimeout(300); };

try {
  // ------------------------------------------------------------------ A, the host
  const ctxA = await browser.newContext({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
  await ctxA.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const { page: A, errors: errA } = await newGame(ctxA);
  const PIECES_A = ['canape_wax', 'table_basse', 'tele_plate', 'lit_bois', 'chaise_bois', 'chaine_hifi', 'plante', 'cuisiniere', 'tapis_tisse', 'bureau_simple'];
  const eA = await furnish(A, PIECES_A);
  check('A: the F2 is the principal residence, furnished', eA.home === 'appart_jamm' && eA.assets.filter(a => a.kind === 'furniture' && a.at).length >= PIECES_A.length, `home=${eA.home}`);
  // an upgrade that shows in the shell (the ceiling fan), through its sheet
  await A.evaluate(() => window.__dakar.assetSheet('appart_jamm')); await A.waitForSelector('#modal.on .item');
  await pick(A, 'Ventilateur au plafond'); await pick(A, 'Confirmer');
  await closeSheet(A);
  const refA = await A.evaluate(() => window.__dakar.visit.homeRef());
  check('A: homeToInvite is the F2 with its street door and district', refA?.spec === 'appart_jamm' && refA.door === 'pikine:home:jamm' && refA.hub === 'pikine', JSON.stringify(refA));
  await A.evaluate(() => window.__dakar.enterHome('appart_jamm')); await inside(A, 'appart_jamm'); await A.waitForTimeout(800);
  const snapA = await A.evaluate(() => window.__dakar.visit.snapshot());
  const chars = JSON.stringify(snapA).length;
  check('A: the snapshot holds the home, the upgrade and every placed piece, well under 12 000 characters', snapA && snapA.upgrades.includes('ventilo') && snapA.furniture.length === PIECES_A.length && chars < 12000, `${snapA?.furniture.length} pieces, ${chars} chars`);
  check('A: in the legacy way (no account yet) the home is the private « home »', (await A.evaluate(() => window.__dakar.presence().move?.space)) === 'home');
  await installStub(A, { me: TAG_A, convs: [{ with: TAG_B, name: 'Binta', look: 3, last: null, unread: 0, seen: 'online', blocked: false }], findHub: 'pikine', findRoom: 1, myRoom: 1 });
  await A.waitForTimeout(400);
  const spaceA = await A.evaluate(() => window.__dakar.presence().move?.space);
  check('A: inside the home invited into, with the account known, the presence space is home:<own tag>', spaceA === `home:${TAG_A}`, spaceA);
  const viewA = await A.evaluate(() => window.__dakar.homeView());
  const perfA = await frame(A, viewA);
  await A.screenshot({ path: `${out}/1-host-inside.png` });
  await resume(A, perfA);
  // the host moves a piece while an invitation of theirs is open: the new snapshot goes to visitDeps.snapshotChanged (once), with the piece's new spot
  await A.evaluate(([b, a, ref]) => {
    window.__stub.items[b] = [{ id: 'inv-open', from: a, at: Date.now(), k: 'invite', home: ref, perms: { use: true }, state: 'open', until: Date.now() + 600000 }];
    window.__snapChanged = []; window.__dakar.visit.deps({ snapshotChanged: s => window.__snapChanged.push(s) }); window.__stub.change();
  }, [TAG_B, TAG_A, refA]);
  await A.waitForTimeout(1300);
  const chair = viewA.pieces.find(p => p.spec === 'chaise_bois');
  await A.evaluate(uid => {                                           // the first free nudge of the grid (a step each way, then two)
    const p = window.__dakar.placer; p.open();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) { p.select(uid); p.move(dx, dz); if (p.put()) break; }
    p.close();
  }, chair.uid);
  await A.waitForTimeout(1800);
  const changed = await A.evaluate(() => window.__snapChanged);
  const moved = changed[0]?.furniture.filter(f => f.spec === 'chaise_bois') ?? [];
  const old = snapA.furniture.find(f => f.spec === 'chaise_bois');
  check('the host moves a piece with an invitation open: one new snapshot for the account, with the new spot', changed.length === 1 && moved.length === 1 && (moved[0].at.x !== old.at.x || moved[0].at.z !== old.at.z), JSON.stringify({ n: changed.length, old: old?.at, now: moved[0]?.at }));

  // ------------------------------------------------------------------ B, the guest (phone, real touches)
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  ctxB.__touch = true;
  await ctxB.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const { page: B, errors: errB } = await newGame(ctxB);
  const t = await realTouch(B);
  const PIECES_B = ['banquette', 'plante', 'matelas_sol', 'radio'];
  await furnish(B, PIECES_B);
  await B.evaluate(() => window.__dakar.enterHome('appart_jamm')); await inside(B, 'appart_jamm'); await B.waitForTimeout(600);
  const ownBefore = await B.evaluate(() => window.__dakar.homeView());
  await B.evaluate(() => window.__dakar.exit()); await B.waitForFunction(() => !window.__dakar.homeView(), null, { timeout: 30000 }); await B.waitForTimeout(500);
  const assetsBefore = await saveAssets(B);
  check('B: owns the same F2 with its own furniture', ownBefore.pieces.length === PIECES_B.length && !ownBefore.visit, JSON.stringify(ownBefore.pieces.map(p => p.spec)));

  const now = await B.evaluate(() => Date.now());
  const INVITE = { id: 'inv-1', from: TAG_A, at: now - 60000, k: 'invite', home: refA, perms: { use: true }, state: 'accepted', until: now + 20 * 60000 };
  await installStub(B, { me: TAG_B, convs: [{ with: TAG_A, name: 'Awa', look: 1, last: null, unread: 0, seen: 'online', blocked: false }, { with: TAG_C, name: 'Moussa', look: 2, last: null, unread: 0, seen: 'online', blocked: false }], findHub: 'pikine', findRoom: 1, myRoom: 2 });
  await B.evaluate(([inv, snap]) => { window.__stub.items['7f3a91c20b4e55d1'] = [inv]; window.__stub.visitAnswers['7f3a91c20b4e55d1'] = { snapshot: snap, perms: { use: true }, invite: inv.id }; window.__stub.change(); }, [INVITE, snapA]);

  // « Y aller »: the marker at A's door under A's name, the host's room
  const spots = await B.evaluate(() => window.__dakar.citeSpots());
  const door = (await B.evaluate(() => window.__dakar.interactables())).find(i => i.id === 'pikine:home:jamm');
  const entry = spots.homes.appart_jamm.entry, dx = entry.x - door.x, dz = entry.z - door.z, dl = Math.hypot(dx, dz) || 1;
  const start = { x: door.x + (dx / dl) * 11, z: door.z + (dz / dl) * 11 };
  await B.evaluate(s => window.__dakar.place(s.x, s.z, 0), start); await B.waitForTimeout(1500);
  await B.evaluate(inv => window.__dakar.visit.goToInvite('7f3a91c20b4e55d1', inv), INVITE); await B.waitForTimeout(800);
  const dest = await B.evaluate(() => window.__dakar.destination());
  const pin = (await B.evaluate(() => window.__dakar.interactables())).find(i => i.id === 'pikine:pin:visit');
  check('« Y aller »: the walking marker is on A’s street door, under A’s name', dest === 'pikine:pin:visit' && pin && pin.name === 'Chez Awa' && Math.hypot(pin.x - door.x, pin.z - door.z) < 0.01, JSON.stringify({ dest, pin }));
  const logY = await B.evaluate(() => window.__stub.log);
  check('« Y aller » in the same district, another presence room: find, then join the host’s room', logY.find.includes(TAG_A) && logY.join.some(([h, r]) => h === 'pikine' && r === 1), JSON.stringify(logY));
  const before = await B.evaluate(() => window.__dakar.focus());
  check('away from the door: no « Entrer chez Awa »', !before || before.name !== 'Chez Awa', JSON.stringify(before));
  const dist = await walkTo(B, t, door.x, door.z, { tol: 1.1, ms: 60000 });
  await B.waitForTimeout(600);
  const atDoor = await B.evaluate(() => window.__dakar.focus());
  await B.screenshot({ path: `${out}/2-guest-at-door.png` });
  check('B walked to the door with the joystick and sees « Entrer chez Awa (invité) »', dist < 1.6 && atDoor?.name === 'Chez Awa' && atDoor.primary === 'Entrer chez Awa (invité)', JSON.stringify({ dist, atDoor }));
  check('the same door still lets B into B’s own F2', atDoor?.all?.includes('Entrer chez toi'), JSON.stringify(atDoor?.all));
  await t.tap('#act');
  await B.waitForFunction(() => window.__dakar.visit.info().visiting?.inside === true, null, { timeout: 30000 });
  await B.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 30000 }); await B.waitForTimeout(800);
  const infoB = await B.evaluate(() => window.__dakar.visit.info());
  check('a real tap on the action button: `visit` asked once, B is inside A’s home', infoB.log.knocks === 1 && (await B.evaluate(() => window.__stub.log.visit.length)) === 1 && infoB.visiting?.host === TAG_A, JSON.stringify(infoB.visiting));

  // the drawn home: the same pieces at the same spots as A's (same origin)
  const viewB = await B.evaluate(() => window.__dakar.homeView());
  const pa = sortPieces(viewA.pieces), pb = sortPieces(viewB.pieces);
  const worst = pa.length === pb.length ? Math.max(...pa.map((p, i) => Math.max(Math.hypot(p.x - pb[i].x, p.z - pb[i].z), Math.abs(Math.atan2(Math.sin(p.yaw - pb[i].yaw), Math.cos(p.yaw - pb[i].yaw)))))) : Infinity;
  check('B draws A’s home at A’s origin: same pieces, each within 1 cm (and the same turn)', viewB.visit && viewB.ox === viewA.ox && viewB.oz === viewA.oz && pa.length === pb.length && pa.every((p, i) => p.spec === pb[i].spec) && worst < 0.01, `A ${pa.length} / B ${pb.length}, worst ${worst}`);
  check('B draws none of B’s own pieces there', !pb.some(p => ['banquette', 'matelas_sol'].includes(p.spec)) && !pb.some(p => ownBefore.pieces.some(o => o.uid === p.uid)), JSON.stringify(pb.map(p => p.uid)));
  // the shell's upgrade (the ceiling fan) shows for the guest too
  const fan = await B.evaluate(() => { let n = 0; window.__dakar.three.scene.traverse(o => { if (o.name === 'upgrades' && o.visible !== false && o.parent?.parent?.visible) n += o.children.length; }); return n; });
  check('the host’s upgrade that shows (the ceiling fan) is drawn for the guest', fan > 0, `upgrade meshes ${fan}`);

  // read-only: what the guest is offered
  const spaceB = await B.evaluate(() => window.__dakar.presence().move?.space);
  check('B’s presence space inside is home:<host>', spaceB === `home:${TAG_A}`, spaceB);
  const room = await B.evaluate(() => window.__dakar.roomInteractables());
  check('the room’s own actions: only « Sortir »', room.length === 1 && room[0].name === 'Sortir', JSON.stringify(room));
  const seats = (await B.evaluate(() => window.__dakar.seatsHere())).filter(st => Math.abs(st.x - viewB.ox) < 12 && Math.abs(st.z - viewB.oz) < 12);   // the 'home' seats of this room (each home is 60 m from the next)
  check('seats offered with « use »: the sofa’s three and the chairs (wood chair, the desk’s), never the bed', seats.length === 5 && !seats.some(s => s.kind === 'bed'), JSON.stringify(seats.map(s => s.kind)));
  const placeB = await B.evaluate(() => window.__dakar.placeList().find(p => p.id === 'home:appart_jamm'));
  check('activities: the TV and the hi-fi only (no kitchen, shower, desk work, sleep)', placeB && placeB.name === 'Chez Awa' && placeB.anchors.length === 2, JSON.stringify(placeB));
  const editor = await B.evaluate(() => window.__dakar.placer.open());
  check('no « Aménager » for the guest (the placement mode refuses)', editor === false);
  // the self target « Aménager / Commander » is not offered: the player in the middle of the room, nothing else in reach
  await B.evaluate(v => window.__dakar.place(v.ox - 0.5, v.oz + 0.2, 0), viewB); await B.waitForTimeout(500);
  const self = await B.evaluate(() => window.__dakar.focus());
  check('no « Aménager », « Commander des meubles » or listing in the visited home', !self || !/Aménager|Commander|annonce/.test((self.all ?? []).join(' ')), JSON.stringify(self));
  await B.evaluate(() => window.__dakar.homeApp2()); await B.waitForSelector('#modal.on .item');
  const homeApp = await B.evaluate(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), off: e.getAttribute('aria-disabled') === 'true' || e.classList.contains('dis') })));
  check('the phone’s « Maison » app: « Aménager » greyed (B is not in B’s own home)', homeApp.some(i => /Aménager/.test(i.t) && i.off), JSON.stringify(homeApp.slice(0, 2)));
  await B.screenshot({ path: `${out}/3-guest-maison-app.png` });
  await closeSheet(B);
  // sit on the host's sofa (perms.use)
  const sofa = seats.find(s => s.kind === 'sofa');
  const sat = await B.evaluate(id => window.__dakar.sit(id), sofa?.id);
  check('with « use »: B can sit on A’s sofa', sat === sofa?.id, sat);
  await B.evaluate(() => window.__dakar.stand()); await B.waitForTimeout(900);

  // the same frame as A's: draw calls and triangles
  const perfB = await frame(B, viewB);
  await B.screenshot({ path: `${out}/4-guest-inside.png` });
  await resume(B, perfB);
  check('performance: draw calls and triangles as guest match the host’s in the same view', Math.abs(perfA.calls - perfB.calls) <= 2 && Math.abs(perfA.tris - perfB.tris) / Math.max(1, perfA.tris) < 0.03, `host ${perfA.calls} calls ${perfA.tris} tris · guest ${perfB.calls} calls ${perfB.tris} tris`);

  // leaving by the door: walk to « Sortir », a real key
  const exitAt = await B.evaluate(() => window.__dakar.roomInteractables()[0]);
  await walkTo(B, t, exitAt.x, exitAt.z, { tol: 0.6, ms: 40000 });
  await B.waitForTimeout(500);
  const exitFocus = await B.evaluate(() => window.__dakar.focus());
  await B.keyboard.press('KeyE');
  await B.waitForFunction(() => !window.__dakar.homeView() && window.__dakar.visit.info().visiting === null, null, { timeout: 30000 }); await B.waitForTimeout(800);
  check('« Sortir » with a real key: back in the street, the visit over', exitFocus?.primary === 'Sortir', JSON.stringify(exitFocus));
  const assetsAfter = await saveAssets(B);
  check('B’s save is untouched by the visit (the assets, furniture spots included)', assetsAfter === assetsBefore, `${assetsBefore.length} / ${assetsAfter.length} chars`);
  await B.evaluate(() => window.__dakar.enterHome('appart_jamm')); await inside(B, 'appart_jamm'); await B.waitForTimeout(600);
  const ownAfter = await B.evaluate(() => window.__dakar.homeView());
  const same = JSON.stringify(sortPieces(ownAfter.pieces)) === JSON.stringify(sortPieces(ownBefore.pieces));
  check('B’s own F2 is drawn again exactly as it was (pieces, spots, turns)', same && !ownAfter.visit, JSON.stringify(ownAfter.pieces.map(p => p.spec)));
  check('B in B’s own home: presence home:<B’s tag>', (await B.evaluate(() => window.__dakar.presence().move?.space)) === `home:${TAG_B}`);
  await B.screenshot({ path: `${out}/5-guest-own-home-after.png` });
  await B.evaluate(() => window.__dakar.exit()); await B.waitForFunction(() => !window.__dakar.homeView(), null, { timeout: 30000 }); await B.waitForTimeout(600);

  // a revocation takes B out with one sentence
  await B.evaluate(d => window.__dakar.place(d.x, d.z + 0.6, Math.PI), door); await B.waitForTimeout(1200);
  await B.keyboard.press('KeyE');
  await B.waitForFunction(() => window.__dakar.visit.info().visiting?.inside === true && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }); await B.waitForTimeout(600);
  await B.waitForTimeout(2500);                                       // long after the last tap: the sentence must still be said on screen, not only logged
  await B.evaluate(() => window.__stub.end('7f3a91c20b4e55d1', 'inv-1'));
  await B.waitForFunction(() => !window.__dakar.homeView() && window.__dakar.visit.info().visiting === null, null, { timeout: 30000 }); await B.waitForTimeout(300);
  const said = await B.evaluate(() => [...document.querySelectorAll('#toast > .t:not(.out)')].map(e => e.textContent).join(' | '));
  await B.screenshot({ path: `${out}/6-guest-revoked.png` });
  check('revoked: B is back in the street with « Awa a mis fin à la visite. » on screen', /Awa a mis fin à la visite\./.test(said), said.slice(0, 160));
  const afterEnd = await B.evaluate(() => window.__dakar.focus());
  check('right after the revocation: no « Entrer chez Awa (invité) » at the door (even before the invitation’s new state arrives)', !afterEnd || afterEnd.name !== 'Chez Awa', JSON.stringify(afterEnd));
  check('after the revocation B’s save is still untouched', (await saveAssets(B)) === assetsBefore);
  // no invitation: no door prompt
  await B.evaluate(() => { window.__stub.items['7f3a91c20b4e55d1'] = [{ ...window.__stub.items['7f3a91c20b4e55d1'][0], state: 'revoked' }]; window.__stub.change(); });
  await B.evaluate(d => window.__dakar.place(d.x, d.z + 0.6, Math.PI), door); await B.waitForTimeout(1600);
  const noPrompt = await B.evaluate(() => window.__dakar.focus());
  check('a revoked invitation: no « Entrer chez Awa (invité) » at the door any more', !noPrompt || noPrompt.name !== 'Chez Awa', JSON.stringify(noPrompt));

  // ------------------------------------------------------------------ C, a host in the family room; B visits with « use » off (look only)
  const ctxC = await browser.newContext({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
  await ctxC.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
  const { page: C, errors: errC } = await newGame(ctxC);
  await C.evaluate(() => { for (const id of ['matelas', 'radio', 'tele', 'chaises', 'tapis']) window.__dakar.buyPiece(id); });
  const snapC = await C.evaluate(() => window.__dakar.visit.snapshot());
  check('C: the family room’s snapshot: its door, the good mattress in the shell, four pieces', snapC.home.door === 'pikine:home:11' && snapC.upgrades.includes('matelas') && snapC.furniture.length === 4, JSON.stringify({ home: snapC.home, up: snapC.upgrades, n: snapC.furniture.length }));
  await C.evaluate(() => window.__dakar.enterHome('chambre_pikine')); await inside(C, 'chambre_pikine'); await C.waitForTimeout(600);
  const viewC = await C.evaluate(() => window.__dakar.homeView());
  const perfC = await frame(C, viewC);
  await C.screenshot({ path: `${out}/8-host-room-as-host.png` });
  await resume(C, perfC);
  const INV_C = { id: 'inv-c', from: TAG_C, at: now - 1000, k: 'invite', home: snapC.home, perms: { use: false }, state: 'accepted', until: now + 20 * 60000 };
  await B.evaluate(([inv, snap, tag]) => { window.__stub.items[tag] = [inv]; window.__stub.visitAnswers[tag] = { snapshot: snap, perms: { use: false }, invite: inv.id }; window.__stub.change(); }, [INV_C, snapC, TAG_C]);
  const roomDoor = (await B.evaluate(() => window.__dakar.interactables())).find(i => i.id === 'pikine:home:11');
  await B.evaluate(d => window.__dakar.place(d.x + 0.8, d.z + 0.8, 0), roomDoor); await B.waitForTimeout(1800);
  const atRoom = await B.evaluate(() => window.__dakar.focus());
  check('the family room’s door: « Entrer chez Moussa (invité) » first, B’s own room one tap further', atRoom?.primary === 'Entrer chez Moussa (invité)' && atRoom.all.includes('Entrer dans ta chambre'), JSON.stringify(atRoom));
  await t.tap('#act');
  await B.waitForFunction(() => window.__dakar.visit.info().visiting?.inside === true && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }); await B.waitForTimeout(800);
  const viewBC = await B.evaluate(() => window.__dakar.homeView());
  const pc = sortPieces(viewC.pieces), pbc = sortPieces(viewBC.pieces);
  const worstC = pc.length === pbc.length ? Math.max(...pc.map((p, i) => Math.hypot(p.x - pbc[i].x, p.z - pbc[i].z))) : Infinity;
  check('B draws C’s family room at C’s origin, each piece within 1 cm', viewBC.spec === 'chambre_pikine' && viewBC.visit && pc.length === pbc.length && worstC < 0.01, `C ${pc.length} / B ${pbc.length}, worst ${worstC}`);
  const roomC = await B.evaluate(() => window.__dakar.roomInteractables());
  check('in C’s room: no bed (« Dormir »), no bucket (« Se laver »): only « Sortir »', roomC.length === 1 && roomC[0].name === 'Sortir', JSON.stringify(roomC.map(i => i.name)));
  const seatsC = (await B.evaluate(() => window.__dakar.seatsHere())).filter(st => Math.abs(st.x - viewBC.ox) < 12);
  check('« use » off: nothing to sit or lie on (the plastic chairs, the bed), no TV or radio', seatsC.length === 0 && !(await B.evaluate(() => window.__dakar.placeList().some(p => p.id === 'home:chambre_pikine'))), JSON.stringify(seatsC));
  check('in C’s room: presence home:<C>', (await B.evaluate(() => window.__dakar.presence().move?.space)) === `home:${TAG_C}`);
  const perfBC = await frame(B, viewBC);
  await B.screenshot({ path: `${out}/9-host-room-as-guest.png` });
  await resume(B, perfBC);
  check('performance in the family room: guest and host draw the same', perfBC.calls === perfC.calls && perfBC.tris === perfC.tris, `host ${perfC.calls}/${perfC.tris} guest ${perfBC.calls}/${perfBC.tris}`);
  await B.evaluate(() => window.__dakar.exit());
  await B.waitForFunction(() => !window.__dakar.homeView() && window.__dakar.visit.info().visiting === null, null, { timeout: 30000 }); await B.waitForTimeout(600);
  check('after C’s room, B’s save is still untouched', (await saveAssets(B)) === assetsBefore);
  check('no page errors (C)', !errC.length, errC.join(' | '));
  await ctxC.close();

  // ------------------------------------------------------------------ a meetup at the grand-place, one city minute ahead
  const sq = (await B.evaluate(() => window.__dakar.cityPlaces())).find(p => p.id === 'pikine:city:square');
  const social0 = await B.evaluate(() => window.__dakar.state.data.needs.social);
  const tNow = await B.evaluate(() => Date.now());
  const MEET = { id: 'meet-1', from: TAG_A, at: tNow - 5000, k: 'meet', place: { id: 'pikine:city:square', hub: 'pikine', name: 'Grand-place de Pikine' }, when: tNow + 1000, state: 'accepted', here: [] };
  await B.evaluate(m => { window.__stub.items['7f3a91c20b4e55d1'] = [m]; window.__stub.change(); }, MEET);
  await B.evaluate(() => { window.__stub.log.find.length = 0; window.__stub.log.join.length = 0; });
  await B.evaluate(p => window.__dakar.meet.goToPlace(p), MEET.place); await B.waitForTimeout(600);
  const logM = await B.evaluate(() => window.__stub.log);
  check('« Y aller » to a meeting proposed by A: the marker on the place, B joins A’s presence room', (await B.evaluate(() => window.__dakar.destination())) === 'pikine:city:square' && logM.find.includes(TAG_A) && logM.join.some(([h, r]) => h === 'pikine' && r === 1), JSON.stringify(logM));
  await B.waitForTimeout(1500);
  check('away from the place: no `here`', (await B.evaluate(() => window.__stub.log.here.length)) === 0);
  await B.evaluate(p => window.__dakar.place(p.x + 2, p.z + 2, 0), sq);
  // the meetup is checked a few times a second; on a slow software renderer (two pages, one of them drawing a home inside) the first `here`
  // can come after 2.6 s, so wait for it (up to 15 s) rather than for a fixed time, then make sure no second one follows
  await B.waitForFunction(() => window.__stub.log.here.length > 0, null, { timeout: 15000, polling: 200 }).catch(() => {});
  const here1 = await B.evaluate(() => [...window.__stub.log.here]);
  await B.waitForTimeout(3000);
  const here2 = await B.evaluate(() => [...window.__stub.log.here]);
  check('at the place in the window: `here` sent once (and only once)', here1.length === 1 && here1[0] === 'meet-1' && here2.length === 1, JSON.stringify(here2));
  await B.evaluate(m => { window.__stub.items['7f3a91c20b4e55d1'] = [{ ...m, state: 'met', here: ['7f3a91c20b4e55d1', '0c1d2e3f40516273'] }]; window.__stub.change(); }, MEET);
  await B.waitForFunction(() => [...document.querySelectorAll('#toast .mo')].some(e => /Vous êtes au rendez-vous ✓/.test(e.textContent)), null, { timeout: 15000 }).catch(() => {});
  await B.waitForTimeout(900);                                       // the card has slid in
  const card = await B.evaluate(() => [...document.querySelectorAll('#toast .mo')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  await B.screenshot({ path: `${out}/7-meetup-card.png` });
  const social1 = await B.evaluate(() => window.__dakar.state.data.needs.social);
  check('« met »: one card « Vous êtes au rendez-vous ✓ »', card.filter(c => /Vous êtes au rendez-vous ✓/.test(c)).length === 1, JSON.stringify(card));
  check('« met »: the social lift (once this city day)', social1 > social0 || social1 >= 100, `${social0} → ${social1}`);
  await B.evaluate(m => { window.__stub.items['7f3a91c20b4e55d1'] = [{ ...m, id: 'meet-2', state: 'met', here: [] }]; window.__stub.change(); }, MEET);
  await B.waitForTimeout(2200);
  const info2 = await B.evaluate(() => window.__dakar.meet.info());
  check('an old meeting already « met » when first seen: no card, no lift', !info2.cards.includes('meet-2') && info2.log.lifts === 1, JSON.stringify(info2.log));
  // « Chez moi » from A: its door under A's name
  const HOME_MEET = { ...MEET, id: 'meet-home', place: { id: 'pikine:home:jamm', hub: 'pikine', name: 'Chez moi · Appartement F2', icon: '🏠' }, state: 'accepted' };
  await B.evaluate(m => { window.__stub.items['7f3a91c20b4e55d1'] = [...window.__stub.items['7f3a91c20b4e55d1'], m]; window.__stub.change(); }, HOME_MEET);
  await B.evaluate(p => window.__dakar.meet.goToPlace(p), HOME_MEET.place); await B.waitForTimeout(400);
  const pinH = (await B.evaluate(() => window.__dakar.interactables())).find(i => i.id === 'pikine:pin:visit');
  check('a meeting « chez moi » of A: the marker on A’s door, under A’s name', (await B.evaluate(() => window.__dakar.destination())) === 'pikine:pin:visit' && pinH?.name === 'Chez Awa' && Math.hypot(pinH.x - door.x, pinH.z - door.z) < 0.01, JSON.stringify(pinH));
  const here = await B.evaluate(() => window.__dakar.meet.here());
  check('hereNow: the district, the point and the nearest named place', here?.hub === 'pikine' && here.name === 'Grand-place de Pikine', JSON.stringify(here));
  const placesB = await B.evaluate(() => window.__dakar.meet.places());
  check('meetupPlaces: « Chez moi » (the home’s door) first, then the city’s places', placesB[0]?.id === 'pikine:home:jamm' && /^Chez moi/.test(placesB[0].name) && placesB.length >= 15, JSON.stringify(placesB.slice(0, 3)));

  // a shared position in another district: the marker waits for it, the pin is put there on arrival
  const LOC = { id: 'loc-1', from: TAG_A, at: tNow, k: 'loc', hub: 'plateau', x: 12.5, z: -20.5, name: 'Place de la Médina' };
  await B.evaluate(l => window.__dakar.meet.goToLocation(l), LOC);
  check('a shared position in another district: the marker names it', (await B.evaluate(() => window.__dakar.destination())) === 'plateau:pin:pos');

  // ------------------------------------------------------------------ every meeting place resolves where the marker resolves it
  const unresolved = [];
  for (const hub of ['plateau', 'corniche', 'almadies', 'pikine']) {
    await B.evaluate(h => window.__dakar.teleport(h), hub);
    await B.waitForFunction(h => window.__dakar.pos().hub === h, hub, { timeout: 120000 }); await B.waitForTimeout(2500);
    const res = await B.evaluate(() => window.__dakar.meet.resolve());
    for (const r of res) if (!r.at || !r.guide || Math.hypot(r.at.x - r.guide.x, r.at.z - r.guide.z) > 0.01) unresolved.push(r.id);
    console.log(`  ${hub}: ${res.map(r => `${r.id}@${r.at ? `${Math.round(r.at.x)},${Math.round(r.at.z)}` : '—'}`).join('  ')}`);
    if (hub === 'plateau') {
      const p = (await B.evaluate(() => window.__dakar.interactables())).find(i => i.id === 'plateau:pin:pos');
      check('the shared position’s pin stands at the very point once in its district', p && Math.abs(p.x - LOC.x) < 1e-6 && Math.abs(p.z - LOC.z) < 1e-6, JSON.stringify(p));
    }
  }
  const total = await B.evaluate(() => window.__dakar.meet.catalogue().length);
  check(`all ${total} meeting places resolve with the walking marker (guidePlace) in their district`, unresolved.length === 0, unresolved.join(', '));

  // side by side: the host's home as the host and as the guest
  const [w1, w2] = await Promise.all([sharp(`${out}/1-host-inside.png`).metadata(), sharp(`${out}/4-guest-inside.png`).metadata()]);
  const H = Math.max(w1.height, w2.height);
  await sharp({ create: { width: w1.width + w2.width + 12, height: H, channels: 3, background: '#111' } })
    .composite([{ input: `${out}/1-host-inside.png`, left: 0, top: 0 }, { input: `${out}/4-guest-inside.png`, left: w1.width + 12, top: 0 }]).png().toFile(`${out}/0-host-and-guest-side-by-side.png`);
  check('no page errors (host, guest)', !errA.length && !errB.length, [...errA, ...errB].join(' | '));
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ perf: { f2: { host: { calls: perfA.calls, tris: perfA.tris }, guest: { calls: perfB.calls, tris: perfB.tris } }, room: { host: { calls: perfC.calls, tris: perfC.tris }, guest: { calls: perfBC.calls, tris: perfBC.tris } } }, snapshotChars: chars, results }, null, 1));
} catch (e) {
  check('the check ran to the end', false, e.stack ?? e.message);
} finally {
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
