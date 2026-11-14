// 1.0.1, B2 « becoming an owner »: the purchase sequence, played with REAL touch on a phone page (390 × 844; every tap goes through Chrome's input pipeline,
// scripts/lib/realTouch.mjs). From the family room: the phone's « Biens » › Annonces › the F2 › « Acheter » › « Les clés sont à toi » (listed in Biens,
// the door, the way there) › « Emménager » › « Garder comme chambre familiale »; the goal line leads to the Résidence and its door opens (« Entrer chez
// toi », walked with the joystick); then from the F2: rent the Cité Jàmm house › « Emménager » › « Mettre en location » for the F2, which is let; a real
// reload keeps everything as chosen; a save whose homes were never asked (as before 1.0.1) gets no pop-up at load and the question once, on the sheet.
// DEBUG hooks used, all read-only except where labelled: `estate()` / `state` / `marked()` / `pos()` / `focus()` / `homeView()` / `citeSpots()` (read),
// `save()` (writes the save now), `?argent=` (test money); the « older save » is made by removing the purchase sequence's marks from the save (labelled).
// Usage: node scripts/check-buy-home.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4823/', out = 'docs/proof/release-1.0.1/ownership'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0;
const results = [];
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${ok ? '' : String(detail).slice(0, 400)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
let n = 0; const shot = async name => { await wait(500); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.jpg`, type: 'jpeg', quality: 72 }); };
const flat = t => (t ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const sheet = () => d(() => ({
  title: (document.querySelector('#modal.on h2')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  text: (document.querySelector('#modal.on')?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim(),
  items: [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim(), off: e.classList.contains('disabled') || e.getAttribute('aria-disabled') === 'true' })).filter(i => i.text !== '✕'),
}));
let t;
/**
 * A finger taps the sheet row whose text matches, then the next sheet is awaited (its text changes). The sheet slides in and its list scrolls: the
 * finger goes where the row has come to rest (every animation finished, the same place three reads running).
 */
async function tapRow(re, { wait: after = 700 } = {}) {
  const find = ([src, scroll]) => {
    const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(src).test(x.textContent.replace(/[  ]/g, ' ').replace(/\s+/g, ' ')));
    if (!e) return null; if (scroll) e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const sig = () => d(() => document.querySelector('#modal.on')?.textContent ?? '');
  for (let attempt = 0; attempt < 2; attempt++) {                                    // a machine shared with other checks can drop a tap: one more, then it counts as failed
    if (!await d(find, [re.source, true])) return false;
    await until(() => [...document.querySelectorAll('#modal, #modal *, #phone, #phone *')].every(e => e.getAnimations().every(a => a.playState === 'finished' || a.effect?.getComputedTiming().iterations === Infinity)), null, 6000);
    let at = await d(find, [re.source, false]), still = 0;
    for (let i = 0; i < 20 && still < 3; i++) { await wait(160); const p = await d(find, [re.source, false]); if (!p) return false; still = Math.hypot(p.x - at.x, p.y - at.y) < 0.5 ? still + 1 : 0; at = p; }
    const before = await sig();
    await t.down(5, at.x, at.y); await wait(70); await t.up(5);
    if (await until(b => (document.querySelector('#modal.on')?.textContent ?? '') !== b, before, 8000)) { await wait(after); return true; }
  }
  return false;
}
/**
 * A way on foot from the player to within `reach` m of (x, z), round the district's built colliders and a parked vehicle (1 m cells, grown by the
 * walker's width; the planner of scripts/check-tiak-everywhere.mjs): the points a thumb aims at, one after the other.
 */
async function wayTo(x, z, reach = 1.2) {
  const { me, cols, cars } = await d(() => ({
    me: window.__dakar.pos(), cols: window.__dakar.cityGeometry().colliders.map(c => [c.x0, c.z0, c.x1, c.z1]),
    cars: ['tiak', 'moto', 'teranga'].map(k => { try { const a = window.__dakar[k]?.at?.(); return a && !a.driving ? [a.x, a.z] : null; } catch { return null; } }).filter(Boolean),
  }));
  const H = 200, N = 2 * H, R = 0.75, blocked = new Uint8Array(N * N);
  for (const [x0, z0, x1, z1] of [...cols, ...cars.map(([cx, cz]) => [cx - 1.4, cz - 1.4, cx + 1.4, cz + 1.4])]) for (let j = Math.max(0, Math.floor(z0 - R + H)); j <= Math.min(N - 1, Math.floor(z1 + R + H)); j++) for (let i = Math.max(0, Math.floor(x0 - R + H)); i <= Math.min(N - 1, Math.floor(x1 + R + H)); i++) {
    const cx = i - H + 0.5, cz = j - H + 0.5; if (cx > x0 - R && cx < x1 + R && cz > z0 - R && cz < z1 + R) blocked[j * N + i] = 1;
  }
  const cell = (px, pz) => Math.floor(pz + H) * N + Math.floor(px + H), start = cell(me.x, me.z);
  blocked[start] = 0;
  const prev = new Int32Array(N * N).fill(-1), queue = [start]; prev[start] = start;
  let goal = -1;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % N, j = Math.floor(k / N);
    if (Math.hypot(i - H + 0.5 - x, j - H + 0.5 - z) < reach) { goal = k; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const nn = b * N + a; if (prev[nn] >= 0 || blocked[nn]) continue;
      if (di && dj && (blocked[j * N + a] || blocked[b * N + i])) continue;
      prev[nn] = k; queue.push(nn);
    }
  }
  if (goal < 0) return null;
  const cells = []; for (let k = goal; k !== start; k = prev[k]) cells.unshift(k);
  const pts = cells.map(k => ({ x: (k % N) - H + 0.5, z: Math.floor(k / N) - H + 0.5 }));
  const clear = (a, b) => { const m = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4); for (let s = 0; s <= m; s++) if (blocked[cell(a.x + ((b.x - a.x) * s) / m, a.z + ((b.z - a.z) * s) / m)]) return false; return true; };
  const way = []; let from = { x: me.x, z: me.z };
  for (let i = 0; i < pts.length;) { let j = Math.min(pts.length - 1, i + 40); while (j > i && !clear(from, pts[j])) j--; way.push(pts[j]); from = pts[j]; i = j + 1; }
  way.push({ x, z });
  return way;
}
/** Walk with the joystick along that way (re-planned when held up); the distance left to (x, z). */
async function walkWay(x, z, tol = 1.2) {
  let left = Infinity;
  for (let plan = 0; plan < 5 && left > tol; plan++) {
    const way = await wayTo(x, z); if (!way) break;
    for (const p of way) {
      await walkTo(page, t, p.x, p.z, { tol: 0.9, ms: 40000 });
      const me = await d(() => window.__dakar.pos()); left = Math.hypot(x - me.x, z - me.z);
      if (left <= tol || Math.hypot(me.x - p.x, me.z - p.z) > 2.5) break;            // there, or held up: plan again from here
    }
  }
  return left;
}
const phoneInfo = () => d(() => window.__dakar.phoneInfo());
/** ☰ → the phone's home screen → the « Biens » tile, with fingers: the ownership module's « Biens » sheet opens. */
async function openBiens() {
  if (await d(() => !!document.querySelector('#modal.on'))) await closeSheet();
  await wait(500); await t.tap('#menuBtn'); await until(() => window.__dakar.phoneInfo().open);
  await wait(700);
  if ((await phoneInfo()).screen !== 'home') { await t.tap('#phone [data-nav="home"]'); await until(() => window.__dakar.phoneInfo().screen === 'home'); await wait(500); }
  await until(() => !!document.querySelector('#phone [data-app="biens"]'), null, 20000);
  await d(() => document.querySelector('#phone [data-app="biens"]')?.scrollIntoView({ block: 'center' })); await wait(400);
  await t.tap('#phone [data-app="biens"]');
  return until(() => /^Biens/.test(document.querySelector('#modal.on h2')?.textContent ?? ''), null, 20000);
}
async function closeSheet() {
  const c = await d(() => { const e = document.querySelector('#modal.on .item.close'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  if (c) { await t.down(6, c.x, c.y); await wait(60); await t.up(6); }
  await until(() => !document.querySelector('#modal.on') && window.__dakar.pos().mode === 'play', null, 10000);
  await wait(400);
}
const est = () => d(() => window.__dakar.estate());
const home = (e, spec) => e.assets.find(a => a.spec === spec);
const goal = () => d(() => { const g = document.querySelector('#goal'); return { on: g.classList.contains('on'), text: (g.querySelector('.gt')?.textContent ?? '').replace(/\s+/g, ' ').trim(), dist: g.querySelector('.gd')?.textContent ?? '' }; });
const ready = () => page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.pos().mode === 'play' && window.__dakar.estate && window.__dakar.phoneInfo, null, { timeout: 240000 });
const F2 = 'appart_jamm', HOUSE = 'maison_cite';

// ------------------------------------------------------------------ 1. the F2, bought from the family room
await page.goto(`${base}?debug&touch&heure=11&argent=20000000`, { timeout: 180000 });
await ready();
t = await realTouch(page);
await wait(2000);
let e = await est();
check('a new game: the player lives in the family room, 20 000 000 F in the wallet', e.home === 'chambre_pikine' && (await d(() => window.__dakar.state.wallet)) === 20_000_000, e.home);
// two pieces at home first (DEBUG `buyPiece`: Keur Meubles' delivery without the walk there; that flow has its own check, scripts/check-keur-meubles.mjs)
await d(() => { window.__dakar.buyPiece('chaises'); window.__dakar.buyPiece('radio'); });
const furniture = s => s.assets.filter(a => a.kind === 'furniture');
e = await est();
const roomUid = home(e, 'chambre_pikine').uid;
check('two pieces of furniture stand in the family room', furniture(e).length === 2 && furniture(e).every(f => f.home === roomUid), JSON.stringify(furniture(e)));
await d(w => { window.__dakar.state.data.wallet = w; }, 20_000_000);   // (DEBUG: the test wallet back to 20 000 000 F, so the amounts below read round)
check('« Biens » opens from the phone with a tap', await openBiens());
check('« Annonces » with a tap', await tapRow(/Annonces/));
check('the F2\'s listing with a tap', await tapRow(/Appartement F2/));
check('« Acheter » with a tap: its confirmation', await tapRow(/^🔑\s*Acheter/));
let m = await sheet();
check('the confirmation shows the price and what is left', /^Acheter : Appartement F2/.test(m.title) && /15 000 000 F/.test(m.text) && /Il te restera/.test(m.text), m.text.slice(0, 200));
await shot('confirm-buy');
check('« Acheter » is confirmed with a tap', await tapRow(/^✅\s*Acheter/, { wait: 1200 }));
m = await sheet(); e = await est();
check('the home is his at once: owned, 15 000 000 F gone once', home(e, F2)?.how === 'owned' && (await d(() => window.__dakar.state.wallet)) === 5_000_000 && (await d(() => window.__dakar.state.data.ledger.filter(l => /Achat : Appartement F2/.test(l.label)).length)) === 1);
check('« Les clés sont à toi » — Emménager maintenant ?', /Les clés sont à toi/.test(m.title) && /Emménager maintenant/.test(m.text), `${m.title} | ${m.text.slice(0, 160)}`);
check('it says it is listed in Biens as his, that its door opens, and the way there', /Dans « Biens »\s*à toi · valeur 15 000 000 F/.test(m.text) && /La porte\s*elle s’ouvre pour toi/.test(m.text) && /Y aller\s*le repère t’y mène/.test(m.text), m.text.slice(0, 420));
check('the furniture is said to follow: « si tu emménages, tes 2 pièces te suivent »', /si tu emménages, tes 2 pièces te suivent/.test(m.text), m.text.slice(0, 420));
check('two answers: « Emménager » (the furniture follows) and « Plus tard »', m.items.length === 2 && /^✅\s*Emménager/.test(m.items[0].text) && /^⏳\s*Plus tard/.test(m.items[1].text), JSON.stringify(m.items.map(i => i.text.slice(0, 60))));
const mark = await d(() => window.__dakar.marked());
check('the walking marker is set on the Résidence Jàmm (the goal line leads there)', mark?.id === 'pikine:city:jamm' && mark.hub === 'pikine', JSON.stringify(mark));
await shot('les-cles-sont-a-toi');

// ------------------------------------------------------------------ 2. « Emménager »: the family room kept
check('« Emménager » with a tap: the choice about the family room', await tapRow(/^✅\s*Emménager/));
m = await sheet();
const keep = m.items.find(i => /Garder comme chambre familiale/.test(i.text)), give = m.items.find(i => /La rendre à la famille/.test(i.text));
check('« Emménager : Appartement F2 » asks « Et ta chambre ? »: keep it (free, the default) or give it back, with the money', /Emménager : Appartement F2/.test(m.title) && /Et ta chambre \?/.test(m.text) && !!keep && /gratuit/.test(keep.text) && /par défaut/.test(keep.text) && !!give && /0 F/.test(give.text) && m.items.some(i => /Pas maintenant/.test(i.text)), JSON.stringify(m.items.map(i => i.text.slice(0, 90))));
check('nothing has moved yet: the room is still the home, its two pieces in it', (await est()).home === 'chambre_pikine' && furniture(await est()).every(f => f.home === roomUid) && /Tes meubles\s*les 2 pièces te suivent/.test(m.text), m.text.slice(0, 300));
await shot('emmenager-et-ta-chambre');
check('« Garder comme chambre familiale » with a tap', await tapRow(/Garder comme chambre familiale/, { wait: 1200 }));
e = await est();
const room = home(e, 'chambre_pikine');
check('moved in: the F2 is the principal residence, the family keeps the room (not given back)', e.home === F2 && !!room && !(await d(() => window.__dakar.state.data.flags.includes('chambre:rendue'))), e.home);
const toast = await d(() => document.querySelector('#toast')?.textContent ?? '');
check('the last line says it: « Tu habites ici : Appartement F2 ✓ · 2 meubles ont suivi · ta chambre : chambre familiale ✓ »', /Tu habites ici : Appartement F2 ✓ · 2 meubles ont suivi · ta chambre : chambre familiale ✓/.test(flat(toast)), flat(toast).slice(0, 200));
const f2Uid = home(e, F2).uid;
check('the two pieces followed into the F2, set up there; nothing is left behind or lost', furniture(e).length === 2 && furniture(e).every(f => f.home === f2Uid && f.at), JSON.stringify(furniture(e)));
m = await sheet();
check('back on the F2\'s sheet: « À toi · … ton domicile principal », no « Emménager ici » (lived in)', /À toi · valeur 15 000 000 F · ton domicile principal/.test(m.text) && !m.items.some(i => /Emménager ici/.test(i.text)), m.text.slice(0, 260));
await shot('f2-domicile-principal');
check('« Biens » again, from the phone', await openBiens());
m = await sheet();
const rowF2 = m.items.find(i => /Appartement F2/.test(i.text)), rowRoom = m.items.find(i => /Ta chambre/.test(i.text));
check('in « Biens » the F2 is listed as owned and the principal residence, the room as the family\'s', !!rowF2 && /★ domicile principal · à toi/.test(rowF2.text) && /15 000 000 F/.test(rowF2.text) && !!rowRoom && /prêtée par la famille/.test(rowRoom.text), `${rowF2?.text} | ${rowRoom?.text}`);
await shot('biens-f2-a-toi');
await closeSheet();

// ------------------------------------------------------------------ 3. the goal line leads there; the door opens for him (the joystick, then the action button)
await until(() => /Résidence Jàmm/.test(document.querySelector('#goal .gt')?.textContent ?? ''), null, 15000);
const g1 = await goal();
check('the goal line leads to the Résidence Jàmm, with the distance', /Résidence Jàmm/.test(g1.text) && /\d+ m/.test(g1.dist), JSON.stringify(g1));
await shot('ligne-objectif-residence');
const spots = await d(() => window.__dakar.citeSpots()), entry = (await d(() => window.__dakar.cityPlaces())).find(p => p.id === 'pikine:city:jamm');
const start = await d(() => window.__dakar.pos());
const left = await walkWay(entry.x, entry.z, 1.2);
await wait(1200);
check('walked there with the joystick, along the goal line\'s marker', left < 2.3, `${Math.round(Math.hypot(entry.x - start.x, entry.z - start.z))} m as the crow flies, ${left.toFixed(1)} m left`);
check('arrived: the marker is done (« Te voilà »)', !(await d(() => window.__dakar.marked())), JSON.stringify(await d(() => window.__dakar.marked())));
const sign = spots.homes[F2].sign;
await walkWay(sign.x, sign.z + 0.6, 0.6);
await until(() => /Entrer chez toi/.test(window.__dakar.focus()?.primary ?? ''), null, 15000);
const f = await d(() => window.__dakar.focus());
check('at the Résidence\'s door the action button offers « Entrer chez toi »', /Entrer chez toi/.test(f?.primary ?? ''), JSON.stringify(f));
await shot('porte-entrer-chez-toi');
await t.tap('#act');
check('a tap on the action button: inside his F2', await until(() => window.__dakar.homeView()?.spec === 'appart_jamm', null, 60000));
await wait(1500);
await shot('dans-le-f2');

// ------------------------------------------------------------------ 4. from the F2: rent the house, move in, let the F2
check('« Biens » from inside the F2', await openBiens());
check('« Annonces »', await tapRow(/Annonces/));
check('the house\'s listing', await tapRow(/Maison familiale/));
check('« Louer » (16 700 F a day): its confirmation', await tapRow(/^📝\s*Louer/));
m = await sheet();
check('the rent confirmation says the rent by the day and by the hour', /16 700 F \/ jour/.test(m.text) && /696 F chaque heure en ville/.test(m.text), m.text.slice(0, 200));
check('« Louer » is confirmed', await tapRow(/^✅\s*Louer/, { wait: 1200 }));
m = await sheet(); e = await est();
check('rented at once: « Les clés sont à toi », listed in Biens with its rent', home(e, HOUSE)?.how === 'rented' && /Les clés sont à toi/.test(m.title) && /Dans « Biens »\s*loué par toi · 16 700 F \/ jour/.test(m.text), m.text.slice(0, 300));
await shot('maison-louee-les-cles');
check('« Emménager »', await tapRow(/^✅\s*Emménager/));
m = await sheet();
const rLet = m.items.find(i => /Mettre en location/.test(i.text)), rSell = m.items.find(i => /Vendre/.test(i.text)), rKeep = m.items.find(i => /Garder vide/.test(i.text));
check('« Et ton ancien logement ? » — the F2: let it (+213 F / h), sell it (+13 500 000 F) or keep it empty (0 F / h)', /Emménager : Maison familiale/.test(m.title) && /Et ton ancien logement/.test(m.text) && /Tu quittes\s*Appartement F2 · à toi/.test(m.text)
  && /\+213 F \/ h/.test(rLet?.text ?? '') && /\+13 500 000 F/.test(rSell?.text ?? '') && /0 F \/ h/.test(rKeep?.text ?? ''), JSON.stringify(m.items.map(i => i.text.slice(0, 100))));
await shot('emmenager-et-le-f2');
check('« Mettre en location » with a tap', await tapRow(/Mettre en location/, { wait: 1200 }));
e = await est();
check('moved into the house; the F2 is let (owned, earning +213 F / h); the room is still the family\'s', e.home === HOUSE && home(e, F2)?.how === 'owned' && home(e, F2)?.leased === true && e.income === 213 && !!home(e, 'chambre_pikine'), JSON.stringify({ home: e.home, f2: home(e, F2), income: e.income }));
check('the two pieces followed again, into the house: the F2 is let empty', furniture(e).length === 2 && furniture(e).every(f => f.home === home(e, HOUSE).uid), JSON.stringify(furniture(e)));
const toast2 = flat(await d(() => document.querySelector('#toast')?.textContent ?? ''));
check('the last line: « Tu habites ici : Maison familiale ✓ … Appartement F2 : en location ✓ »', /Tu habites ici : Maison familiale ✓/.test(toast2) && /Appartement F2 : en location ✓/.test(toast2), toast2.slice(0, 200));
await shot('maison-f2-en-location');
check('« Biens » shows it all', await openBiens());
m = await sheet();
const b2 = m.items.find(i => /Appartement F2/.test(i.text)), b3 = m.items.find(i => /Maison familiale/.test(i.text));
check('« Biens »: the F2 « à toi · loué » (+213 F/h), the house « ★ domicile principal · loué par toi · 16 700 F / jour »', /à toi · loué/.test(b2?.text ?? '') && /\+213 F\/h/.test(b2?.text ?? '') && /★ domicile principal · loué par toi · 16 700 F \/ jour/.test(b3?.text ?? ''), `${b2?.text} | ${b3?.text}`);
await shot('biens-apres');
await closeSheet();
await d(() => window.__dakar.save());
const kept = { est: await est(), wallet: await d(() => window.__dakar.state.wallet), flags: await d(() => window.__dakar.state.data.flags.filter(f => f.startsWith('logement:'))) };

// ------------------------------------------------------------------ 5. a real reload: everything as chosen
await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 });          // from the save (without `argent`, which would top the wallet up again)
await ready(); t = await realTouch(page); await wait(2500);
e = await est();
const same = s => JSON.stringify(e.assets.filter(a => a.kind === 'home').map(a => [a.uid, a.spec, a.how, a.leased])) === JSON.stringify(s.assets.filter(a => a.kind === 'home').map(a => [a.uid, a.spec, a.how, a.leased]));
check('after a reload: the two pieces are in the house, where they were set up', JSON.stringify(furniture(e).map(f => [f.uid, f.home, f.at])) === JSON.stringify(furniture(kept.est).map(f => [f.uid, f.home, f.at])), JSON.stringify(furniture(e)));
check('after a reload: the house is the home, the F2 owned and let, the room kept, the house rented', e.home === HOUSE && home(e, F2)?.leased === true && home(e, HOUSE)?.how === 'rented' && !!home(e, 'chambre_pikine') && same(kept.est), JSON.stringify(e.assets.filter(a => a.kind === 'home')));
const w = await d(() => window.__dakar.state.wallet);
check('after a reload: the wallet is what was saved (less at most a few city hours of the house\'s rent net of the F2\'s)', w <= kept.wallet && kept.wallet - w <= 3 * 696, `${kept.wallet} → ${w}`);
check('no question pops up at load', !(await d(() => !!document.querySelector('#modal.on'))));
check('the marks of the homes asked are kept', JSON.stringify(await d(() => window.__dakar.state.data.flags.filter(f => f.startsWith('logement:')))) === JSON.stringify(kept.flags), JSON.stringify(kept.flags));
check('« Biens » after the reload', await openBiens());
check('the F2\'s sheet opens as a sheet (its question was answered)', await tapRow(/Appartement F2/));
m = await sheet();
check('the F2\'s sheet: let, the choices still there to change (« Arrêter la location », « Vendre », « Emménager ici »)', /^Appartement F2/.test(m.title) && m.items.some(i => /Arrêter la location/.test(i.text)) && m.items.some(i => /Vendre/.test(i.text)) && m.items.some(i => /Emménager ici/.test(i.text)), JSON.stringify(m.items.map(i => i.text.slice(0, 50))));
await shot('apres-rechargement-f2');
await closeSheet();

// ------------------------------------------------------------------ 6. a save from before 1.0.1 (DEBUG: the marks removed from the stored save): no pop-up at load, the question once, on the sheet
await d(() => { const s = window.__dakar.state.data; s.flags = s.flags.filter(x => !x.startsWith('logement:')); window.__dakar.save(); });
await page.goto(`${base}?debug&touch&heure=11`, { timeout: 180000 });
await ready(); t = await realTouch(page); await wait(4000);
check('an older save: nothing pops up at load', !(await d(() => !!document.querySelector('#modal.on'))) && (await d(() => window.__dakar.pos().mode)) === 'play');
check('« Biens »', await openBiens());
check('the family room\'s row', await tapRow(/Ta chambre/));
m = await sheet();
check('the room\'s sheet asks once: « Que faire de ce logement ? », keep it (as it is) or give it back, or move back in', /^Ta chambre/.test(m.title) && /Que faire de ce logement/.test(m.text) && m.items.some(i => /Garder comme chambre familiale/.test(i.text) && /c’est le cas/.test(i.text)) && m.items.some(i => /La rendre à la famille/.test(i.text)) && m.items.some(i => /Emménager ici/.test(i.text)), JSON.stringify(m.items.map(i => i.text.slice(0, 70))));
await shot('ancienne-sauvegarde-question');
check('« Garder comme chambre familiale »', await tapRow(/Garder comme chambre familiale/, { wait: 1200 }));
check('kept: still the family\'s room, nothing else changed', !(await d(() => window.__dakar.state.data.flags.includes('chambre:rendue'))) && (await est()).home === HOUSE);
m = await sheet();
check('the next time, the room\'s sheet is its sheet (asked once)', /^Ta chambre/.test(m.title) && !/Que faire de ce logement/.test(m.text) && m.items.some(i => /Rendre la chambre à la famille/.test(i.text)), m.text.slice(0, 200));
await closeSheet();

check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, when: new Date().toISOString(), passed: total - failed, total, results, errors: errors.slice(0, 10) }, null, 1));
console.log(failed ? `${failed}/${total} FAILED` : `${total}/${total} passed`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
