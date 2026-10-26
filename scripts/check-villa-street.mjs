// LD2.0-D lane V-E (docs/ld2/LD2_D.md): the flagship villa's street compound and its life, on a phone page with REAL touches (scripts/lib/realTouch.mjs).
//  A. the cost of the Almadies view on the low preset, the same views on the contract's build (before the compound) and on this one (after);
//  B. as the owner (the villa bought, the principal residence): the gate slides open as the player walks up from the street and shuts behind him; « Entrer
//     chez toi » at the front door; « Se baigner » at the pool (a debug basin at the contract's POOL while the interior is still the open room); « Organiser une
//     petite réception » (paid through the wallet's history, eight guests, ends by itself after two city hours, once a day);
//  C. the Lamane Sport driven in through the gate, « Garer à la villa », a reload: it is in its bay; « Monter » takes it;
//  D. a player who is not the owner: the gate stays shut, he stays on the pavement;
//  E. pictures (docs/proof/ld2d/street/, PNG < 400 kB): the compound from the street by day and at 21 h, the helicopter on the roof, the bays with the SUV, the swim,
//     the reception.
// Usage: node scripts/check-villa-street.mjs <baseUrl> <outDir> [contractBuildUrl]
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import { realTouch, walkTo, pilot } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4964/', out = 'docs/proof/ld2d/street', before = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 300000 };
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const LOT = { cx: -18, cz: -18 }, P = (x, z) => ({ x: LOT.cx + x, z: LOT.cz + z });
const GATE = { x0: 1.5, x1: 6.5, z: 11 }, GC = P((GATE.x0 + GATE.x1) / 2, GATE.z);

async function open(quality, url = base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(q => { try { if (!localStorage.getItem('dakarrek.quality')) localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}?debug&touch&argent=999000000`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  return { context, page, errors, t: await realTouch(page), d: (fn, arg) => page.evaluate(fn, arg) };
}
const toAlmadies = async (s, x, z, yaw, hour = 10.5) => {
  await s.d(([x, z, yaw, h]) => { window.__dakar.teleport('almadies', x, z, yaw); window.__dakar.setHour(h); }, [x, z, yaw, hour]);
  await s.page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, T);
  await s.page.waitForTimeout(1500);
};
/** A picture of the view `cam` (the game paused while it is drawn), saved small. */
const shot = async (s, name, cam, still = false) => {
  if (still) await s.d(() => window.__dakar.pause(true));
  if (cam) await s.d(c => { window.__dakar.cam(c.p, c.t); window.__dakar.render(); }, cam);
  await s.page.waitForTimeout(still ? 300 : 900);
  const buf = await s.page.screenshot();
  if (still) await s.d(() => window.__dakar.pause(false));
  let png = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(buf).png({ palette: true, quality: 85, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(`${out}/${name}.png`, png);
  if (cam) await s.d(() => window.__dakar.cam(null));
  return png.length;
};
const tapItem = async (s, text) => {
  if (!await s.d(tx => { const e = [...document.querySelectorAll('#modal .item')].find(x => x.textContent.includes(tx)); e?.scrollIntoView({ block: 'center' }); return !!e; }, text)) return false;   // the player's thumb scrolls the sheet to it
  await s.page.waitForTimeout(300);
  const c = await s.d(tx => { const e = [...document.querySelectorAll('#modal .item')].find(x => x.textContent.includes(tx)); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, text);
  if (!c) return false; await s.t.down(8, c.x, c.y); await s.page.waitForTimeout(70); await s.t.up(8); return true;
};
const focus = s => s.d(() => window.__dakar.focus());
const waitFocus = (s, re, ms = 30000) => s.page.waitForFunction(r => new RegExp(r).test(window.__dakar.focus()?.primary ?? ''), re.source, { timeout: ms }).then(() => true, () => false);
const V = s => s.d(() => window.__dakar.villa);

// the views measured and pictured: the villa from the street (the cross street's pavement), and the Almadies around it from above
const STREET = { p: [-1.5, 5.2, 7.5], t: [-17.5, 3, -14] }, WIDE = { p: [14, 42, 30], t: [-18, 0, -18] }, NIGHT = { p: [-2.5, 9.5, 5.5], t: [-17, 0.5, -13] };
/**
 * Draw calls and triangles of a view (the game paused): `all`, everything drawn (the traffic and the people included, which come and go), and `hub`, the
 * district's own static world alone (its group: the largest of the scene by vertices; the compound is in it): the same in both builds but for the villa.
 */
async function cost(s, cam) {
  await s.d(() => window.__dakar.pause(true));
  const r = await s.d(c => {
    const D = window.__dakar, scene = D.three.scene;
    D.cam(c.p, c.t); D.render();
    const all = { calls: D.drawCalls(), tris: D.tris() };
    // the district's group: the scene's child that holds the largest single mesh (the merged street batch)
    let big = null, bn = 0; scene.traverse(m => { const n = m.isMesh ? m.geometry?.attributes?.position?.count ?? 0 : 0; if (n > bn) { bn = n; big = m; } });
    let hub = big; while (hub.parent && hub.parent !== scene) hub = hub.parent;
    const was = scene.children.map(o => o.visible);
    scene.children.forEach(o => { o.visible = o === hub; });
    D.render();
    const own = { calls: D.drawCalls(), tris: D.tris() };
    const g = hub.getObjectByName('villa-compound');                                     // its own group (the gate, the house, the helicopter), the district alone
    let compound = null;
    if (g) { g.visible = false; D.render(); compound = { calls: own.calls - D.drawCalls(), tris: own.tris - D.tris() }; g.visible = true; }
    scene.children.forEach((o, i) => { o.visible = was[i]; });
    D.render();
    return { all, hub: own, compound };
  }, cam);
  await s.d(() => { window.__dakar.cam(null); window.__dakar.pause(false); });
  return r;
}

// ------------------------------------------------------------------------------------------------ A. the cost on the low preset, before and after
const perf = {};
for (const [k, url] of [['before', before], ['after', base]]) {
  if (!url) continue;
  const s = await open('low', url);
  await toAlmadies(s, -12, 3, Math.PI, 11);
  await s.page.waitForTimeout(2500);
  perf[k] = { street: await cost(s, STREET), wide: await cost(s, WIDE) };
  await s.context.close();
}
console.log('PERF', JSON.stringify(perf));
if (perf.before && perf.after) {
  for (const v of ['street', 'wide']) {
    const b = perf.before[v].hub, a = perf.after[v].hub;
    check(`low preset, ${v === 'street' ? 'the villa from the street' : 'the Almadies from above'}: the compound adds at most 25 draw calls to the district`, a.calls - b.calls <= 25 && !!perf.after[v].compound && perf.after[v].compound.calls >= 1 && perf.after[v].compound.calls <= 25, JSON.stringify({ before: b, after: a, compound: perf.after[v].compound, all: { before: perf.before[v].all, after: perf.after[v].all } }));
  }
}

// ------------------------------------------------------------------------------------------------ B. the owner
const s = await open('medium');
await toAlmadies(s, GC.x, 2.5, Math.PI);
const bought = await s.d(() => window.__dakar.buyAsset('villa_almadies') && window.__dakar.moveIn('villa_almadies'));
check('the villa bought (400 000 000 F) and made the principal residence', bought && (await s.d(() => window.__dakar.villa.hold())) === 'owned');
const g0 = await s.d(() => window.__dakar.villa.gate());
check('the gate stands shut, solid, before anyone comes', g0 && g0.k === 0 && g0.solid, JSON.stringify(g0));
// the board by the gate: the listing, no way in from the pavement
const board = P(GATE.x0 - 2.3, GATE.z + 1.2);
await walkTo(s.page, s.t, board.x, board.z, { tol: 0.6, ms: 60000 });
await s.page.waitForTimeout(600);
const fb = await focus(s);
check('the sale board stays by the gate: « Gérer ton logement », and no « Entrer chez toi » from the pavement', !!fb && fb.all.some(a => /Gérer/.test(a)) && !fb.all.some(a => /Entrer chez toi/.test(a)), JSON.stringify(fb));
await shot(s, '01-street-day', STREET);
// walk up to the gate from the street: it slides open while the player is still on the pavement
await walkTo(s.page, s.t, GC.x, GC.z + 3.6, { tol: 0.5, ms: 60000 });
await s.page.waitForTimeout(700);
const g1 = await s.d(() => ({ g: window.__dakar.villa.gate(), p: window.__dakar.pos() }));
check('walking up from the street, the gate slides open for its owner before he reaches it', g1.g.k > 0 && g1.p.z > -7, JSON.stringify(g1));
await walkTo(s.page, s.t, GC.x, GC.z - 3.4, { tol: 0.6, ms: 60000 });
const p1 = await s.d(() => window.__dakar.pos());
check('he walks through it into the front yard', p1.z < GC.z - 2, JSON.stringify(p1));
const door = P(-3, 4.9);
await walkTo(s.page, s.t, door.x + 1.2, door.z + 1.4, { tol: 0.6, ms: 60000 });
await walkTo(s.page, s.t, door.x, door.z + 0.3, { tol: 0.5, ms: 60000 });
await s.page.waitForFunction(() => window.__dakar.villa.gate().k === 0, null, { timeout: 20000 }).catch(() => {});
const g2 = await s.d(() => window.__dakar.villa.gate());
check('…and it shuts behind him, solid again', g2.k === 0 && g2.solid, JSON.stringify(g2));
check('« Entrer chez toi » at the front door', await waitFocus(s, /Entrer chez toi/), JSON.stringify(await focus(s)));
await s.t.tap('#act');
await s.page.waitForFunction(() => window.__dakar.villa.inside() === 'almadies:home:villa' && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }).catch(() => {});
check('…and he is in his villa', (await s.d(() => window.__dakar.villa.inside())) === 'almadies:home:villa' && (await s.d(() => window.__dakar.villa.inOwnVilla())));

// the swim: at the pool's edge (the contract's POOL; a debug basin there while the interior is still the open room)
const O = await s.d(() => window.__dakar.villa.origin());
await s.d(() => window.__dakar.villa.swim.basin(true));
const tiered = await s.d(() => window.__dakar.villa.tiered());
await s.d(([x, z]) => window.__dakar.place(x, z, Math.PI), [O.x - 1, O.z - 5.5]);
await s.page.waitForTimeout(800);
check('« Se baigner » at the pool\'s edge', await waitFocus(s, /Se baigner/, 15000), JSON.stringify(await focus(s)));
const n0 = await s.d(() => ({ ...window.__dakar.state.data.needs }));
await s.t.tap('#act');
await s.page.waitForFunction(() => window.__dakar.villa.swim.info().swimming, null, { timeout: 15000 }).catch(() => {});
await s.page.waitForFunction(() => window.__dakar.villa.swim.info().t > 4, null, { timeout: 90000 }).catch(() => {});
const sw = await s.d(() => ({ i: window.__dakar.villa.swim.info(), p: window.__dakar.pos(), clip: window.__dakar.clip() }));
check('in the water up to the shoulders, swimming round the pool', sw.i.swimming && sw.p.y < 0 && sw.p.y > -1 && sw.i.t > 2, JSON.stringify(sw));
{ const q = await s.d(() => window.__dakar.pos()); await shot(s, '05-swim', { p: [q.x - 2.2, 4.6, q.z - 4.2], t: [q.x + 0.3, -0.2, q.z] }, true); }
check('« Sortir de l\'eau »', await waitFocus(s, /Sortir de l’eau/, 10000), JSON.stringify(await focus(s)));
await s.t.tap('#act');
await s.page.waitForFunction(() => !window.__dakar.villa.swim.info().swimming && window.__dakar.pos().mode === 'play' && window.__dakar.pos().y > 0.05, null, { timeout: 60000 }).catch(() => {});
await s.page.waitForTimeout(600);
const n1 = await s.d(() => ({ ...window.__dakar.state.data.needs })), sw1 = await s.d(() => ({ i: window.__dakar.villa.swim.info(), p: window.__dakar.pos() }));
check('out of the water on the deck, cleaner and in a better mood', !sw1.i.swimming && sw1.p.y > 0 && n1.hygiene > n0.hygiene && n1.moral >= n0.moral, JSON.stringify({ n0, n1, p: sw1.p }));
// a full swim ends by itself
await s.d(([x, z]) => window.__dakar.place(x, z, Math.PI), [O.x + 2, O.z - 5.5]);
await s.page.waitForTimeout(600);
await s.d(() => window.__dakar.villa.swim.start());
await s.page.waitForFunction(() => !window.__dakar.villa.swim.info().swimming, null, { timeout: 300000 }).catch(() => {});
const sw2 = await s.d(() => window.__dakar.villa.swim.info());
check('a swim ends by itself after about twenty seconds', sw2.log.full >= 1 && !sw2.swimming, JSON.stringify(sw2.log));
await s.d(() => window.__dakar.villa.swim.basin(false));

// the reception, from the salon (a few pieces delivered first: a lived-in salon)
await s.page.waitForFunction(() => window.__dakar.pos().y > 0.05 && !window.__dakar.seated(), null, { timeout: 60000 }).catch(() => {});
await s.d(() => { for (const id of ['canape_angle_velours', 'table_basse_sculptee', 'tapis_soie', 'lustre', 'mur_tv']) window.__dakar.buyPiece(id); });
await s.page.waitForTimeout(800);
await s.d(([x, z]) => window.__dakar.place(x, z, 0), [O.x, O.z - 1]);
await s.page.waitForTimeout(800);
check('« Organiser une petite réception » in the salon', await waitFocus(s, /Organiser une petite réception/, 15000), JSON.stringify(await focus(s)));
const w0 = await s.d(() => window.__dakar.state.wallet), so0 = await s.d(() => window.__dakar.state.data.needs.social);
await s.t.tap('#act');
await s.page.waitForFunction(() => /Petite réception/.test(document.querySelector('#modal.on')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
check('the price first: 150 000 F of ceebu jën, bissap and thiakry', /150\s000/.test(await s.d(() => document.querySelector('#modal.on')?.textContent ?? '')) && /ceebu jën/.test(await s.d(() => document.querySelector('#modal.on')?.textContent ?? '')));
await shot(s, '06a-reception-price');
await s.page.waitForTimeout(900);                                                          // the sheet slides in
check('« Payer la réception » taps through', await tapItem(s, 'Payer la réception'));
await s.page.waitForFunction(() => window.__dakar.villa.reception.info().running && window.__dakar.villa.reception.info().drawn, null, { timeout: 20000 }).catch(() => {});
await s.page.waitForTimeout(2500);
const r1 = await s.d(() => ({ r: window.__dakar.villa.reception.info(), wallet: window.__dakar.state.wallet, last: window.__dakar.state.data.ledger.at(-1), social: window.__dakar.state.data.needs.social }));
check('paid once through the wallet\'s history', w0 - r1.wallet === 150000 && r1.last?.amount === -150000 && /Petite réception/.test(r1.last?.label ?? ''), JSON.stringify({ w0, w: r1.wallet, last: r1.last }));
check('eight guests, chatting and dancing, music; social up', r1.r.running && r1.r.drawn && r1.r.log.guests === 8 && r1.social > so0, JSON.stringify(r1.r));
await shot(s, '06-reception', tiered ? { p: [O.x + 3.5, 4.2, O.z - 2.5], t: [O.x + 8, 0.8, O.z - 7.5] } : { p: [O.x + 5.8, 3.6, O.z + 3.8], t: [O.x - 0.5, 0.8, O.z - 1] }, true);
const h0 = await s.d(() => window.__dakar.villa.reception.info().at);
await s.d(h => window.__dakar.setHour(((h % 24) + 2.2) % 24), h0);
await s.page.waitForFunction(() => window.__dakar.villa.reception.info().log.ended >= 1, null, { timeout: 30000 }).catch(() => {});
const r2 = await s.d(() => window.__dakar.villa.reception.info());
check('two city hours later it ends by itself, the guests gone', !r2.running && !r2.drawn && r2.log.ended === 1, JSON.stringify(r2));
await s.page.waitForTimeout(600);
const f2 = await focus(s);
check('one a day: the next one waits for tomorrow', /Organiser/.test(f2?.primary ?? '') && f2.why.some(w => /demain/.test(w)), JSON.stringify(f2));
check('the reception\'s guests cost few draw calls', r1.r.draws <= 24, JSON.stringify({ draws: r1.r.draws }));

// out by the front door
await s.d(() => window.__dakar.exit());
await s.page.waitForFunction(() => !window.__dakar.villa.inside() && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }).catch(() => {});
await s.page.waitForTimeout(800);
const p2 = await s.d(() => window.__dakar.pos());
check('out of the house, the player stands at the front door, inside the walls', Math.hypot(p2.x - door.x, p2.z - door.z) < 0.8, JSON.stringify(p2));
// the night, the helicopter on the roof (before lane V-S's facade: the stand-in cut to the roof's level)
await s.d(() => window.__dakar.setHour(21));
await s.page.waitForTimeout(2500);
await shot(s, '02-street-21h', NIGHT);
await s.d(() => window.__dakar.setHour(10.5));
await s.d(() => window.__dakar.villa.roofPreview(true));
await shot(s, '03-helicopter-roof', { p: [-11.2, 12.6, -6.5], t: [-21, 7.6, -18.6] });
await shot(s, '03b-helicopter-street', { p: [-3, 5.5, 8], t: [-19, 6.5, -17] });
await s.d(() => window.__dakar.villa.roofPreview(false));

// ------------------------------------------------------------------------------------------------ C. the Lamane Sport into its bay
await s.d(() => window.__dakar.suv.own());
await s.page.waitForFunction(() => window.__dakar.suv.info().owned && window.__dakar.suv.info().here, null, { timeout: 30000 }).catch(() => {});
await s.d(([x, z]) => { window.__dakar.suv.place(x, z, Math.PI); }, [GC.x, 3.2]);
await s.d(([x, z]) => window.__dakar.place(x, z, Math.PI), [GC.x - 1.9, 2.6]);
await s.page.waitForTimeout(800);
check('« Monter » at the Lamane Sport\'s door', await waitFocus(s, /Monter/, 15000), JSON.stringify(await focus(s)));
await s.t.tap('#act');
await s.page.waitForFunction(() => window.__dakar.suv.info().driving, null, { timeout: 60000 }).catch(() => {});
check('at the wheel', await s.d(() => window.__dakar.suv.info().driving));
await pilot(s.page, s.t, 'suv', [{ x: GC.x, z: -2.5, tol: 1.5, speed: 3 }, { x: GC.x, z: -9.5, tol: 1.2, speed: 2.5 }, { x: GC.x - 0.4, z: -11.2, tol: 1, speed: 2 }], { brakeAtEnd: true, cruise: 3, ms: 120000 });
const c1 = await s.d(() => ({ at: window.__dakar.suv.at(), g: window.__dakar.villa.gate() }));
check('driven in through the gate, into the front yard', c1.at.z < GC.z - 2 && c1.at.driving, JSON.stringify(c1));
check('« Garer à la villa » at the wheel in the yard, on the driving pad', await waitFocus(s, /Garer à la villa/, 15000) && await s.page.waitForFunction(() => /Garer à la villa/.test(document.querySelector('#ridepad.extra .rp-extra')?.textContent ?? ''), null, { timeout: 15000 }).then(() => true, () => false), JSON.stringify(await focus(s)));
await s.t.tap('#ridepad .rp-extra');
await s.page.waitForFunction(() => !window.__dakar.suv.info().driving && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }).catch(() => {});
await s.page.waitForTimeout(1200);
const bays = await s.d(() => window.__dakar.villa.bays());
const c2 = await s.d(() => ({ i: window.__dakar.suv.info(), rec: window.__dakar.suv.info().record }));
const inBay = b => b.find(x => Math.hypot(x.x - c2.i.x, x.z - c2.i.z) < 0.05 && Math.abs(Math.cos(x.yaw - c2.i.yaw) - 1) < 1e-3);
check('in its bay, nose to the house, and saved there', !!inBay(bays) && c2.rec && Math.hypot(c2.rec.x - c2.i.x, c2.rec.z - c2.i.z) < 0.02 && c2.rec.hub === 'almadies', JSON.stringify(c2));
await s.page.waitForTimeout(2500);
await shot(s, '04-bays-suv', { p: [-8, 7.5, -3.2], t: [-15.6, 0.5, -11.2] });
// a reload: still there
await s.d(() => window.__dakar.save());
await s.page.reload({ timeout: 180000 });
await s.page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub === 'almadies' && window.__dakar.suv?.info().here, null, T);
await s.page.waitForTimeout(1500);
const c3 = await s.d(() => window.__dakar.suv.info());
check('after a reload the Lamane Sport is in its bay', Math.hypot(c3.x - c2.i.x, c3.z - c2.i.z) < 0.05, JSON.stringify({ x: c3.x, z: c3.z, yaw: c3.yaw }));
// « Monter » takes it, as usual
const side = { x: c3.x + Math.cos(c3.yaw) * 1.7, z: c3.z - Math.sin(c3.yaw) * 1.7 };
await s.d(([x, z]) => window.__dakar.place(x, z, 0), [side.x, side.z]);
await s.page.waitForTimeout(800);
check('« Monter » takes it from its bay', await waitFocus(s, /Monter/, 15000), JSON.stringify(await focus(s)));
await s.t.tap('#act');
await s.page.waitForFunction(() => window.__dakar.suv.info().driving, null, { timeout: 60000 }).catch(() => {});
check('…at the wheel again', await s.d(() => window.__dakar.suv.info().driving));
await s.page.waitForTimeout(1200);
await s.page.waitForFunction(() => /Garer à la villa/.test(document.querySelector('#ridepad.extra .rp-extra')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
await s.t.tap('#ridepad .rp-extra');
await s.page.waitForFunction(() => !window.__dakar.suv.info().driving && window.__dakar.pos().mode === 'play', null, { timeout: 30000 }).catch(() => {});
const c4 = await s.d(() => window.__dakar.suv.info());
check('« Garer à la villa » puts it back in its bay', !!bays.find(b => Math.hypot(b.x - c4.x, b.z - c4.z) < 0.05), JSON.stringify({ x: c4.x, z: c4.z }));
check('no error on the owner\'s page', s.errors.length === 0, JSON.stringify(s.errors.slice(0, 3)));
await s.context.close();

// ------------------------------------------------------------------------------------------------ D. not the owner
const o = await open('low');
await toAlmadies(o, GC.x, -1.2, Math.PI);
check('a player who does not hold the villa: not its owner', (await o.d(() => window.__dakar.villa.hold())) === null);
await walkTo(o.page, o.t, GC.x, GC.z - 3, { tol: 0.6, ms: 20000 });
const q = await o.d(() => ({ g: window.__dakar.villa.gate(), p: window.__dakar.pos() }));
check('for him the gate stays shut and he stays on the pavement', q.g.k === 0 && q.g.solid && q.p.z > GC.z - 0.2, JSON.stringify(q));
check('no error on the visitor\'s page', o.errors.length === 0, JSON.stringify(o.errors.slice(0, 3)));
await o.context.close();

await browser.close();
for (const f of fs.readdirSync(out).filter(f => f.endsWith('.png'))) { const n = fs.statSync(`${out}/${f}`).size; check(`picture ${f} under 400 kB`, n < 400_000, `${Math.round(n / 1024)} kB`); }
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
