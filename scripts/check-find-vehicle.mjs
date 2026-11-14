// « Retrouver mon véhicule » (1.0.1; src/transport/whereabouts.ts, src/ui/phone/apps/vehicles.ts), on a phone-sized screen with real fingers (scripts/lib/realTouch.mjs):
//   A. buy the Jakarta at its dealer (debug money), ride it, park it, walk away; phone › Mes véhicules lists it where it was left; « Faire sonner » sounds once and not again at
//      once; « Localiser » opens the phone's own map on it with its marker and puts the game's marker on it; the goal line and the minimap's way lead to it at the cost of a place
//      marker; walking up to it ends the guidance; after a reload the same position is listed and the moto really stands there.
//   B. ridden across the middle of the road to Almadies (the district swap is real; the kilometre of road either side of it is skipped with the debug placement) and parked
//      there; from Pikine the list names Almadies, nothing can be made to sound from there, « Localiser » shows it on the city map and « Y aller » walks to that district, where
//      the marker leads to it.
//   C. sold from « Biens » while it stands in another district: its record is gone, and the one bought again from « Biens » is delivered at the dealer's kerb (one moto,
//      not two).
// Usage: node scripts/check-find-vehicle.mjs [baseUrl] [outDir]      (needs a running build: npx vite preview --outDir <dir> --port 4391 --host 127.0.0.1 --strictPort)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, padRig, walkTo } from './lib/realTouch.mjs';
import { driveRoad } from './lib/roadDrive.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4391/', out = process.argv[3] ?? 'docs/screenshots/find-vehicle';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 240000 }, ROAD = 'pikine-almadies';
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('https://tiles.openfreemap.org/**', r => r.abort('blockedbyclient'));       // the city map on its bundled layer (the sandbox has no basemap)
const d = (fn, arg) => page.evaluate(fn, arg), wait = ms => page.waitForTimeout(ms);
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const boot = async () => {
  await page.goto(`${base}?debug&touch&heure=11`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.moto, null, T);
  await until(() => window.__dakar.pos().mode === 'play');
};
await boot();
const t = await realTouch(page);
const shot = async name => { await wait(400); await page.screenshot({ path: `${out}/${name}.png` }); };
/** A finger's tap on an element (the phone drops a tap within 320 ms of a screen change). */
const tap = async sel => { await wait(450); await d(s => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); await wait(350); await t.tap(sel); };
/** A finger's tap on the first element of `sel` whose text matches. */
const tapText = async (sel, re) => {
  await wait(450);
  const find = scroll => d(([s, r, sc]) => { const e = [...document.querySelectorAll(s)].find(x => new RegExp(r).test(x.textContent)); if (!e) return null; if (sc) e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, [sel, re.source, scroll]);
  if (!(await find(true))) return false;
  // a sheet slides in and a list scrolls: the finger goes where the element has come to rest
  await until(() => [...document.querySelectorAll('#modal, #modal *, #phone, #phone *')].every(e => e.getAnimations().every(a => a.playState === 'finished' || a.effect?.getComputedTiming().iterations === Infinity)), null, 6000);
  let c = await find(false), still = 0;
  for (let i = 0; i < 20 && still < 3; i++) { await wait(160); const n = await find(false); if (!n) return false; still = Math.hypot(n.x - c.x, n.y - c.y) < 0.5 ? still + 1 : 0; c = n; }
  await t.down(9, c.x, c.y); await wait(60); await t.up(9); return true;
};
const info = () => d(() => window.__dakar.moto.info());
const mine = () => d(() => window.__dakar.myVehicles().find(v => v.asset === 'jakarta') ?? null);
const row = () => d(() => window.__dakar.phoneHooks.vehicles().find(v => v.asset === 'jakarta') ?? null);
const phoneInfo = () => d(() => window.__dakar.phoneInfo());
/** ☰ → the home screen → the « Mes véhicules » tile, with fingers. */
const openVehicles = async () => {
  if (!(await phoneInfo()).open) { await wait(500); await t.tap('#menuBtn'); await until(() => window.__dakar.phoneInfo().open); }
  await wait(600);
  if ((await phoneInfo()).screen === 'vehicules') return true;                 // the phone opens where it was left
  if ((await phoneInfo()).screen !== 'home') { await tap('#phone [data-nav="home"]'); await until(() => window.__dakar.phoneInfo().screen === 'home'); }
  await until(() => !!document.querySelector('#phone [data-app="vehicules"]'), null, 20000);
  await tap('#phone [data-app="vehicules"]');
  return until(() => window.__dakar.phoneInfo().screen === 'vehicules', null, 20000);
};
const closePhone = async () => { if ((await phoneInfo()).open) { await tap('#phone [data-nav="close"]'); await until(() => !window.__dakar.phoneInfo().open && window.__dakar.pos().mode === 'play', null, 20000); } };
const cardText = sel => d(s => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ¦ '), sel);
const listText = () => cardText('#phone .vh');
const goal = () => d(() => { const g = document.querySelector('#goal'); return { on: g.classList.contains('on'), text: g.querySelector('.gt').textContent, dist: g.querySelector('.gd').textContent }; });
/**
 * « Descendre » on the ride pad, with a finger. On a machine shared with other browser checks one run in six lost this tap (the moto stayed ridden for two minutes); a tap
 * that does not dismount within 15 s is given again, at most twice, and each one is printed with what lay under the finger: survived and reported, never hidden.
 */
let offRetries = 0;
const getOff = async (first = 300) => {
  for (let i = 0; i < 3; i++) {
    await wait(i ? 600 : first); await t.tap('#ridepad .rp-off');
    if (await until(() => !window.__dakar.moto.info().driving && window.__dakar.pos().mode === 'play', null, 15000)) return true;
    offRetries++;
    console.log(`NOTE: « Descendre » tap ${i + 1} did not dismount: ${JSON.stringify(await d(() => {
      const b = document.querySelector('#ridepad .rp-off'), r = b?.getBoundingClientRect();
      return { at: window.__dakar.moto.at(), mode: window.__dakar.pos().mode, pad: document.body.classList.contains('ridepad'), off: b && r ? { cls: b.className, box: [r.left, r.top, r.width, r.height].map(Math.round), under: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.className ?? null } : null };
    }))}`);
  }
  return false;
};

// ------------------------------------------------------------------ A. Pikine: buy, ride, park, walk away
await d(() => { window.__dakar.teleport('pikine'); window.__dakar.state.data.wallet = 900000; });
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.moto.info().dealer, null, T);
await until(() => window.__dakar.pos().mode === 'play');
check('A0. nothing bought yet: the game has no Jakarta to locate (no record, no entry, no icon on the maps)', !(await mine()) && !(await info()).record && !(await d(() => window.__dakar.mapOwned().some(o => o.asset === 'jakarta'))));
check('A0b. « Mes véhicules » is an app of the phone (a tile), not a button of the HUD', (await openVehicles()) && !(await d(() => !!document.querySelector('#ui > [data-app="vehicules"], #hud [data-app="vehicules"]'))), JSON.stringify(await phoneInfo()));
check('A0c. …and it does not list a Jakarta the player does not have', !/Jakarta/.test(await listText()), await listText());
await shot('a0-before');
await closePhone();

const dealer = (await info()).dealer;
await d(p => window.__dakar.place(p.x, p.z + 1.3, Math.PI), dealer);
await until(() => /Motos/.test(window.__dakar.focus()?.name ?? ''));
await wait(400); await t.tap('#act');
await until(() => !!document.querySelector('#modal.on'));
await tapText('#modal .item', /^[^A-Za-z]*Acheter/);
await until(() => /Confirmer/.test(document.querySelector('#modal.on')?.textContent ?? ''));
await tapText('#modal .item', /Confirmer/);
await until(() => window.__dakar.moto.info().owned && window.__dakar.moto.info().here);
if (!(await info()).owned) console.log('DEBUG buy', JSON.stringify(await d(() => ({ modal: document.querySelector('#modal')?.className, text: document.querySelector('#modal')?.textContent.slice(0, 300), mode: window.__dakar.pos().mode, focus: window.__dakar.focus()?.name, wallet: window.__dakar.state.wallet, info: window.__dakar.moto.info() }))));
const bought = await info(), kerb = bought.record;
check('A1. the Jakarta is bought at its dealer and delivered at the kerb', bought.owned && bought.here && !!kerb && kerb.hub === 'pikine', JSON.stringify(kerb));
await until(() => window.__dakar.pos().mode === 'play');

// get on, ride east with a real finger on the gas pedal, stop, get off with the pad's own button
await d(r => window.__dakar.place(r.x + 1.2, r.z, -Math.PI / 2), kerb);
await until(() => window.__dakar.focus()?.id === 'moto:parked');
await wait(400); await t.tap('#act');
await until(() => window.__dakar.moto.info().driving && document.body.classList.contains('ridepad'));
await wait(800);
{
  const gas = await t.centre('#ridepad .rp-gas'); await padRig(page, t);
  await t.down(1, gas.x, gas.y + 18);
  await until(p => { const m = window.__dakar.moto.info(); return Math.hypot(m.x - p.x, m.z - p.z) > 22; }, kerb, 180000);
  await t.upAll();
}
await until(() => Math.abs(window.__dakar.moto.info().speed) < 0.3, null, 60000);
const riding = await mine();
check('A2. while it is ridden the game says so: « En circulation », at the rider’s own place, and no icon of it on the maps', riding?.status === 'driven' && (await row())?.statusLabel === 'En circulation' && !(await row())?.locate && !(await d(() => window.__dakar.mapOwned().some(o => o.asset === 'jakarta'))), JSON.stringify(riding));
await getOff(300);
await wait(800);
const parked = await info(), R = parked.record;
check('A3. parked: its record is where it stands, more than 20 m from the kerb', !parked.driving && !!R && Math.hypot(R.x - parked.x, R.z - parked.z) < 0.05 && Math.hypot(R.x - kerb.x, R.z - kerb.z) > 20, JSON.stringify(R));
// walk away, back toward the dealer's kerb, with the joystick
const leftAt = await walkTo(page, t, kerb.x + 1.2, kerb.z, { tol: 2.5, ms: 150000 });
const me0 = await d(() => window.__dakar.pos()), away0 = Math.hypot(me0.x - R.x, me0.z - R.z);
check('A4. walked away from it (the joystick): more than 15 m off, out of reach', away0 > 15 && (await d(() => window.__dakar.focus()?.id)) !== 'moto:parked', `${away0.toFixed(1)} m (${leftAt.toFixed(1)} m short of the kerb)`);

// the phone: Mes véhicules
check('A5. ☰ › Mes véhicules opens the list', await openVehicles(), JSON.stringify(await phoneInfo()));
const r1 = await row(), text1 = await listText();
check('A6. the Jakarta is listed « Stationné », in Pikine, near a named place, with how far it is', r1?.status === 'parked' && /^Pikine · /.test(r1.where) && r1.where.length > 'Pikine · '.length && Math.abs(r1.metres - away0) < 3 && /Moto Jakarta/.test(text1) && /Stationné/.test(text1) && text1.includes(r1.where) && /à \d+ m/.test(text1), `${text1} | ${JSON.stringify(r1)}`);
check('A7. its primary action is « Localiser »; « Faire sonner » is offered because it is close', await d(() => { const c = [...document.querySelectorAll('#phone .vh')].find(e => /Jakarta/.test(e.textContent)); const b = [...c.querySelectorAll('button')]; return b.length === 2 && /Localiser/.test(b[0].textContent) && b[0].classList.contains('primary') && /Faire sonner/.test(b[1].textContent) && b.every(x => x.getBoundingClientRect().height >= 44); }));
await shot('a1-list');

// « Faire sonner »: once, then not again at once; the moto has not moved
const horn0 = await d(() => window.__dakar.moto.audio().count.horn ?? 0);
await tapText('#phone .vh [data-act="ring"]', /./);
await wait(150);
const hornA = await d(() => { const a = window.__dakar.moto.audio(); return { n: a.count.horn ?? 0, held: a.horn, state: a.state }; });
await wait(700);
const hornB = await d(() => window.__dakar.moto.audio().horn);
await tapText('#phone .vh [data-act="ring"]', /./); await wait(500);
const hornC = await d(() => window.__dakar.moto.audio().count.horn ?? 0);
check('A8. « Faire sonner »: the moto’s own horn, one short blip (released within a second)', hornA.n === horn0 + 1 && hornB === false, JSON.stringify({ horn0, hornA, hornB }));
check('A9. …and a second tap at once is refused (a cooldown): no second horn', hornC === horn0 + 1, `${horn0} → ${hornC}`);
check('A10. nothing moved it: same record', JSON.stringify((await info()).record) === JSON.stringify(R));

// « Localiser »
await wait(600); await tapText('#phone .vh [data-act="locate"]', /Localiser/);
const onMap = await until(() => window.__dakar.phoneInfo().screen === 'carte' && !!window.__dakar.fullMapAt(0, 0), null, 20000);
await wait(900);
const map1 = await d(([x, z]) => {
  const cv = document.querySelector('#phone .fm-cv'), r = cv.getBoundingClientRect(), m = window.__dakar.fullMapAt(x, z), k = cv.width / r.width;
  const px = [...cv.getContext('2d').getImageData(Math.round((m.x - r.left - 10) * k), Math.round((m.y - r.top) * k), 1, 1).data];
  return { tab: document.querySelector('#phone [data-mt="quartier"]').getAttribute('aria-selected'), at: { x: m.x - r.left, y: m.y - r.top }, size: { w: r.width, h: r.height }, px, card: document.querySelector('#phone .fm-card').textContent.replace(/\s+/g, ' ').trim(), panes: [...document.querySelectorAll('#phone .cm-map canvas')].length, maplibre: document.querySelectorAll('.maplibregl-canvas').length };
}, [R.x, R.z]);
check('A11. « Localiser » opens the phone’s existing map (the Quartier tab; no second map, MapLibre not loaded)', onMap && map1.tab === 'true' && map1.maplibre === 0, JSON.stringify({ screen: (await phoneInfo()).screen, tab: map1.tab, maplibre: map1.maplibre }));
check('A12. …centred on the recorded position', Math.abs(map1.at.x - map1.size.w / 2) < 14 && Math.abs(map1.at.y - map1.size.h / 2) < 14, JSON.stringify({ at: map1.at, size: map1.size }));
check('A13. …with the vehicle’s marker drawn there (its white disc), and its card', map1.px[0] > 225 && map1.px[1] > 225 && map1.px[2] > 225 && /Ta moto Jakarta/.test(map1.card) && /Repère/.test(map1.card) && /Retirer le repère/.test(map1.card) && /\d+ m/.test(map1.card), JSON.stringify({ px: map1.px, card: map1.card }));
const owned1 = await d(() => window.__dakar.mapOwned().find(o => o.asset === 'jakarta'));
check('A14. the map’s vehicle is the record itself (same district, same coordinates)', owned1?.hub === 'pikine' && Math.hypot(owned1.x - R.x, owned1.z - R.z) < 0.05, JSON.stringify(owned1));
const mark1 = await d(() => window.__dakar.marked());
check('A15. the game’s one marker is on it', mark1?.id === 'vehicle:jakarta' && mark1.hub === 'pikine', JSON.stringify(mark1));
await shot('a2-map');
// its icon can be picked on the map: tap elsewhere (a place or nothing), then the icon again
{
  const p = await d(([x, z]) => window.__dakar.fullMapAt(x, z), [R.x, R.z]);
  await d(() => window.__dakar.phoneHooks.markPlace(null)); await wait(300);
  await t.down(8, p.x + 90, p.y + 120); await wait(60); await t.up(8); await wait(500);
  const off = await cardText('#phone .fm-card');
  await t.down(8, p.x, p.y); await wait(60); await t.up(8); await wait(500);
  const on = await cardText('#phone .fm-card');
  check('A16. the vehicle’s icon is selectable on the Quartier map: a tap on it shows its card with « Marquer »', !/Ta moto Jakarta/.test(off) && /Ta moto Jakarta/.test(on) && /Marquer/.test(on), `${off} → ${on}`);
  await tapText('#phone .fm-card [data-fm="markcar"]', /Marquer/); await wait(400);
  check('A17. « Marquer » there puts the marker back on it', (await d(() => window.__dakar.marked()))?.id === 'vehicle:jakarta');
}
await closePhone();

// the guidance: the goal line, the world pin and the minimap's way all follow the game's one guide target
await until(() => window.__dakar.minimap().guide === 'Ta moto Jakarta' && !!window.__dakar.minimap().route, null, 20000);
await until(() => document.querySelector('#goal').classList.contains('on') && /Jakarta/.test(document.querySelector('#goal .gt').textContent), null, 20000);
const g1 = await goal(), mm1 = await d(() => window.__dakar.minimap()), me1 = await d(() => window.__dakar.pos());
check('A18. the goal line leads to it: its name and the metres left', g1.on && /Ta moto Jakarta/.test(g1.text) && /^\d+ m$/.test(g1.dist.trim()) && Math.abs(parseInt(g1.dist, 10) - Math.hypot(me1.x - R.x, me1.z - R.z)) < 3, JSON.stringify(g1));
check('A19. the guide target (world pin, compass, the minimap’s dotted way) is the recorded position', Math.hypot(mm1.guideAt.x - R.x, mm1.guideAt.z - R.z) < 0.05 && mm1.route.n >= 2, JSON.stringify({ at: mm1.guideAt, route: mm1.route }));
// what it costs: the way is worked out once and kept while the player stands still, exactly like a marker on a place. Each 4 s window starts once the way to the goal
// of now exists (its last point is the goal): the minimap refreshes it every 0.5 s of GAME time and a slow SwiftShader frame moves the game on by 0.1 s at most, so the
// first way to a goal just set can land seconds of wall time later (one run counted it inside the window)
const wayIsFor = () => until(() => { const m = window.__dakar.minimap(), pts = window.__dakar.minimapRoute(), l = pts[pts.length - 1]; return !!m.guideAt && !!l && Math.hypot(l.x - m.guideAt.x, l.z - m.guideAt.z) < 0.5; }, null, 30000);
await wayIsFor(); await wait(1000);
const runsA = await d(() => window.__dakar.minimap().routeRuns); await wait(4000);
const runsB = await d(() => window.__dakar.minimap().routeRuns);
const placeId = await d(([x, z]) => window.__dakar.minimapPlaces().filter(p => Math.hypot(p.x - x, p.z - z) > 20).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0].id, [me1.x, me1.z]);
await d(id => window.__dakar.phoneHooks.markPlace(id, 'pikine'), placeId);
await until(id => window.__dakar.destination() === id && window.__dakar.minimap().guide !== 'Ta moto Jakarta', placeId, 20000);
await wayIsFor(); await wait(1000);
const runsC = await d(() => window.__dakar.minimap().routeRuns); await wait(4000);
const runsD = await d(() => window.__dakar.minimap().routeRuns);
check('A20. no extra route work: standing still for 4 s, the way to the vehicle is recomputed as often as the way to a marked place (never)', runsB - runsA === 0 && runsD - runsC === 0, `vehicle marker: ${runsB - runsA} recomputation(s) in 4 s; place marker: ${runsD - runsC}`);
// back on the vehicle, through the phone again (Mes véhicules › Localiser), then walk to it
await openVehicles(); await tapText('#phone .vh [data-act="locate"]', /Localiser/);
await until(() => window.__dakar.phoneInfo().screen === 'carte'); await closePhone();
await until(() => window.__dakar.minimap().guide === 'Ta moto Jakarta', null, 20000);
const runsE = await d(() => window.__dakar.minimap().routeRuns);
const short = await walkTo(page, t, R.x, R.z, { tol: 3.0, ms: 200000 });
const runsF = await d(() => window.__dakar.minimap().routeRuns);
await until(() => !window.__dakar.marked(), null, 8000);
const me2 = await d(() => window.__dakar.pos());
check('A21. walking to it with the joystick ends the guidance beside it (« Te voilà »), the marker is cleared', short <= 3.6 && !(await d(() => window.__dakar.marked())) && Math.hypot(me2.x - R.x, me2.z - R.z) < 4, `${short.toFixed(1)} m left; ${runsF - runsE} way(s) worked out over ${Math.round(away0)} m of walk (one per 8 m block, as for any marker)`);
if (!(await until(() => window.__dakar.focus()?.id === 'moto:parked', null, 6000))) await d(([x, z]) => { window.__dakar.place(x + 1.2, z, -Math.PI / 2); }, [R.x, R.z]);   // (the walk may end at its nose: step to its side)
check('A22. it is really there: « Monter » is offered on it', await until(() => window.__dakar.focus()?.id === 'moto:parked', null, 20000), JSON.stringify(await d(() => ({ focus: window.__dakar.focus(), me: window.__dakar.pos(), moto: window.__dakar.moto.at() }))));

// reload
await d(() => window.__dakar.save());
await boot();
await until(() => window.__dakar.moto.info().here, null, 60000);
const after = await info(), e2 = await mine();
await openVehicles();
const r2 = await row(), text2 = await listText();
check('A23. after a reload the same position is listed (same district, same place, same record)', r2?.status === 'parked' && r2.where === r1.where && text2.includes(r1.where) && e2.hub === 'pikine' && Math.hypot(e2.x - R.x, e2.z - R.z) < 0.05, `${text2} | ${JSON.stringify(e2)}`);
check('A24. …and the moto is really there in the world: one moto, standing at the record', after.here && !after.driving && Math.hypot(after.x - R.x, after.z - R.z) < 0.05 && (await d(() => { let n = 0; window.__dakar.three.scene.traverse(o => { if (o.name === 'moto:mine') n++; }); return n; })) === 1, JSON.stringify({ x: after.x, z: after.z }));
await shot('a3-reloaded');
await closePhone();

// ------------------------------------------------------------------ B. left in another district
await d(r => window.__dakar.place(r.x + 1.2, r.z, -Math.PI / 2), R);
await until(() => window.__dakar.focus()?.id === 'moto:parked');
await wait(400); await t.tap('#act');
await until(() => window.__dakar.moto.info().driving && document.body.classList.contains('ridepad'));
const road = await d(id => { const p = window.__dakar.road.at(id, 0, 0), q = window.__dakar.road.project(p.x, p.z); return { length: q.length, swapS: q.swapS }; }, ROAD);
await d(([id, s]) => { const p = window.__dakar.road.at(id, s, -2.8); window.__dakar.moto.place(p.x, p.z, p.yaw); }, [ROAD, road.swapS - 70]);   // (debug: the boring kilometre before the middle of the road)
await wait(1500);
await driveRoad(page, t, 'moto', ROAD, road.swapS + 60, { cruise: 9, brakeAtEnd: true });
const swapped = await d(() => ({ hub: window.__dakar.pos().hub, m: window.__dakar.moto.at() }));
check('B1. ridden across the middle of the road with the real pad: the loaded district is now Almadies, the rider still on the moto', swapped.hub === 'almadies' && swapped.m.driving, JSON.stringify(swapped));
// into the district (debug: the kilometre after the middle), on free ground near one of its places
const spot = await d(() => {
  const g = window.__dakar.cityGeometry(), b = g.bounds, free = (x, z) => x > b.x0 + 8 && x < b.x1 - 8 && z > b.z0 + 8 && z < b.z1 - 8 && !g.colliders.some(c => x > c.x0 - 2 && x < c.x1 + 2 && z > c.z0 - 2 && z < c.z1 + 2);
  for (const p of window.__dakar.minimapPlaces()) for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [8, 8], [-8, -8]]) if (free(p.x + dx, p.z + dz)) return { x: p.x + dx, z: p.z + dz, near: p.name };
  return null;
});
await d(s => window.__dakar.moto.place(s.x, s.z, 0), spot);
await getOff(800);
await wait(800);
const R2 = (await info()).record;
check('B2. parked in Almadies: the record says so', R2?.hub === 'almadies' && Math.hypot(R2.x - spot.x, R2.z - spot.z) < 0.5, JSON.stringify({ R2, near: spot.near }));
const hereRow = await row();
await d(() => window.__dakar.travelTo('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.pos().mode === 'play', null, T);
await wait(1500);
const awayInfo = await info(), e3 = await mine();
check('B3. travelled away to Pikine: the moto is not in this district’s world, and the game still has it in Almadies at the same spot', !awayInfo.here && e3?.hub === 'almadies' && Math.hypot(e3.x - R2.x, e3.z - R2.z) < 0.05 && e3.status === 'parked', JSON.stringify(e3));
await openVehicles();
const r3 = await row(), text3 = await listText();
check('B4. the list names the district it was left in (and the place it stands near, remembered from when it was parked)', /^Almadies/.test(r3?.where ?? '') && r3.where === hereRow.where && r3.where.length > 'Almadies · '.length && text3.includes(r3.where) && r3.metres === undefined && !/à \d+ m/.test(text3.split('¦').find(s => /Jakarta/.test(s)) ?? ''), `${text3} | here: ${hereRow.where}`);
check('B5. from another district it cannot be made to sound: no « Faire sonner », and the game refuses it', r3.ring === false && !(await d(() => !![...document.querySelectorAll('#phone .vh')].find(e => /Jakarta/.test(e.textContent))?.querySelector('[data-act="ring"]'))) && /quartier/.test(await d(() => window.__dakar.phoneHooks.ringVehicle('jakarta')) ?? ''));
await shot('b1-list-away');
await wait(500); await tapText('#phone .vh [data-act="locate"]', /Localiser/);
await until(() => window.__dakar.phoneInfo().screen === 'carte');
const ville = await until(() => window.__geoMap?.ready && !!document.querySelector('#phone .gm-car[data-car="vehicle:jakarta"]'), null, 60000);
await wait(1800);
const map2 = await d(() => {
  const el = document.querySelector('#phone .gm-car[data-car="vehicle:jakarta"]'), box = document.querySelector('#phone .gm-map').getBoundingClientRect(), r = el.getBoundingClientRect();
  return { tab: document.querySelector('#phone [data-mt="ville"]').getAttribute('aria-selected'), dx: r.left + r.width / 2 - (box.left + box.width / 2), dy: r.top + r.height / 2 - (box.top + box.height / 2), on: el.classList.contains('on'), w: r.width, icon: el.textContent,
    card: document.querySelector('#phone .gm-card').textContent.replace(/\s+/g, ' ').trim(), zoom: window.__geoMap.map.getZoom(), cars: document.querySelectorAll('#phone .gm-car').length };
});
check('B6. « Localiser » for a vehicle of another district opens the city map (the existing Ville tab), centred on it, its marker ringed', ville && map2.tab === 'true' && Math.abs(map2.dx) < 24 && Math.abs(map2.dy) < 24 && map2.on && map2.w >= 30 && map2.zoom >= 14, JSON.stringify(map2));
check('B7. its card says where it is and offers the existing ways there (the walk that keeps the marker, the directions by car)', /Ta moto Jakarta/.test(map2.card) && /Almadies/.test(map2.card) && /Y aller/.test(map2.card) && /Itinéraire/.test(map2.card), map2.card);
const mark2 = await d(() => window.__dakar.marked());
check('B8. the marker is on it, in Almadies; the goal line (in Pikine) names the district to go to', mark2?.id === 'vehicle:jakarta' && mark2.hub === 'almadies', JSON.stringify(mark2));
await shot('b2-ville');
// the icon itself is a button on the city map
await d(() => window.__dakar.phoneHooks.markPlace(null)); await wait(700);
await tap('#phone .gm-car[data-car="vehicle:jakarta"]'); await wait(600);
const picked = await cardText('#phone .gm-card');
check('B9. the vehicle’s icon is selectable on the Ville map', /Ta moto Jakarta/.test(picked) && /Y aller/.test(picked), picked);
// the existing trip: « Y aller · repère gardé » walks to the district, the marker kept; there the goal line leads to the moto
await tapText('#phone .gm-card [data-dealer]', /Y aller/);
await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, T);
await until(() => window.__dakar.minimap().guide === 'Ta moto Jakarta', null, 30000);
const g3 = await goal(), mm3 = await d(() => window.__dakar.minimap()), there = await info();
check('B10. « Y aller » walked to Almadies with the marker kept; there the goal line and the guide lead to the moto, which is really there', /Ta moto Jakarta/.test(g3.text) && /\d+ m/.test(g3.dist) && Math.hypot(mm3.guideAt.x - R2.x, mm3.guideAt.z - R2.z) < 0.05 && there.here && Math.hypot(there.x - R2.x, there.z - R2.z) < 0.05, JSON.stringify({ g3, at: mm3.guideAt }));
await shot('b3-arrived');

// ------------------------------------------------------------------ C. sold while it is away, bought again
await d(() => window.__dakar.travelTo('pikine'));
await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.pos().mode === 'play', null, T);
await wait(1200);
const keys = () => d(() => Object.keys(window.__dakar.state.data.counters).filter(k => k.startsWith('vehicle:jakarta:')));
const before = await keys();
await wait(500); await t.tap('#menuBtn'); await until(() => window.__dakar.phoneInfo().open);
if ((await phoneInfo()).screen !== 'home') { await tap('#phone [data-nav="home"]'); await until(() => window.__dakar.phoneInfo().screen === 'home'); }
await tap('#phone [data-app="biens"]');
await until(() => !!document.querySelector('#modal.on'));
await tapText('#modal .item', /Moto Jakarta/);
await until(() => /Vendre/.test(document.querySelector('#modal.on')?.textContent ?? ''));
const sheet = await cardText('#modal.on .item');
await tapText('#modal .item', /^\s*\S*\s*Vendre/) || await tapText('#modal .item', /Vendre/);
await until(() => /Tu reçois/.test(document.querySelector('#modal.on')?.textContent ?? ''));
await tapText('#modal .item', /Vendre/);
await until(() => !window.__dakar.moto.info().owned);
// the record goes on the game's next frame (the vehicle modules follow the asset model there, sheet open or not): waited for, not raced against a fixed delay
// (SwiftShader frames on a shared machine can take longer than a second), and the time it took is printed
const soldAt = Date.now();
const cleared = await until(() => !Object.keys(window.__dakar.state.data.counters).some(k => k.startsWith('vehicle:jakarta:')), null, 20000);
const clearMs = Date.now() - soldAt, afterSale = await keys();
check('C1. sold from « Biens » in Pikine while it stood in Almadies: its parking record is gone', before.length >= 3 && cleared && afterSale.length === 0 && !(await mine()) && /Où est-il/.test(sheet), JSON.stringify({ before, afterSale, clearMs }));
// bought again at once from the same sheet of « Biens » (the sheet comes back on the vehicle after the sale): the asset model alone delivers it, as in the defect
// (the dealer's own counter always parks a new purchase at its kerb, so it would hide a stale record)
await until(() => /Acheter/.test(document.querySelector('#modal.on')?.textContent ?? ''));
await tapText('#modal .item', /^[^A-Za-z]*Acheter/);
await until(() => /Il te restera/.test(document.querySelector('#modal.on')?.textContent ?? ''));
await tapText('#modal .item', /^[^A-Za-z]*Acheter/);
await until(() => window.__dakar.moto.info().owned);
const delivered = await until(() => window.__dakar.moto.info().here, null, 20000);
const again = await info(), e4 = await mine();
check('C2. bought again from « Biens » in Pikine: delivered at the dealer’s kerb in Pikine (not left at the old spot in Almadies), one moto, listed there', delivered && again.owned && again.record?.hub === 'pikine' && Math.hypot(again.record.x - kerb.x, again.record.z - kerb.z) < 0.05 && e4?.hub === 'pikine' && (await d(() => window.__dakar.state.data.assets.list.filter(a => a.spec === 'jakarta').length)) === 1, JSON.stringify({ record: again.record, owned: again.owned, here: again.here }));
await d(() => document.querySelector('#modal .item.close')?.click()); await d(() => window.__dakar.phoneClose());

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${total - failed}/${total} find-my-vehicle checks passed${offRetries ? ` (« Descendre » had to be tapped again ${offRetries} time(s): see the NOTE lines)` : ''}`);
process.exit(failed ? 1 : 0);
