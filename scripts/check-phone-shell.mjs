// The phone as a smartphone (src/ui/phone.ts): its status bar, the home screen (every app one tap away, the dock), an app and its header, « back », the
// home indicator (an app left that way is found again where it was), the library — and what a phone over a running game must never do: let a finger or a key
// through to the game under it. Real fingers (Chrome's own touch pipeline, scripts/lib/realTouch.mjs), a phone-sized screen.
// Usage: node scripts/check-phone-shell.mjs [baseUrl] [outDir]      (needs a running build: npx vite preview --port 4201)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch } from './lib/realTouch.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4201/', out = process.argv[3] ?? 'docs/proof/release/phone';
fs.mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' · ' + detail : ''}`); };
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
for (const exe of ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']) if (fs.existsSync(exe)) { launch.executablePath = exe; break; }
const browser = await chromium.launch(launch);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { if (!sessionStorage.getItem('shell-check')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', 'low'); sessionStorage.setItem('shell-check', '1'); } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const d = (fn, a) => page.evaluate(fn, a);
const wait = ms => page.waitForTimeout(ms);
const until = (fn, a, timeout = 30000) => page.waitForFunction(fn, a, { timeout }).then(() => true, () => false);
const info = () => d(() => window.__dakar.phoneInfo());
const pos = () => d(() => window.__dakar.pos());
const rect = sel => d(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
/** Frames drawn since the page loaded: a wait in frames is a wait in game time, whatever the renderer's speed. */
const frames = async n => { const f0 = await d(() => window.__frames); await until(f => window.__frames >= f, f0 + n, 120000); };
const acted = () => d(() => ({ modal: !!document.querySelector('#modal.on'), mode: window.__dakar.pos().mode, hub: window.__dakar.pos().hub }));

await page.goto(`${base}?debug&touch&argent=900000`, { waitUntil: 'load' });
await until(() => window.__dakar?.pos().mode === 'play', null, 180000);
await d(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const t = await realTouch(page);
/** A finger's tap; the phone drops a tap within 320 ms of a screen change (a double tap's second half), so a deliberate tap waits first. */
const tap = async sel => { await wait(450); await t.tap(sel); };
await wait(1200);

// ---- the player stands in front of something to act on (so a leaked action key or a leaked tap on the action button would show)
const spot = await d(() => {
  const D = window.__dakar, list = D.interactables();
  for (const it of list) {
    for (const [dx, dz] of [[0, 1.6], [1.6, 0], [0, -1.6], [-1.6, 0]]) {
      D.place(it.x + dx, it.z + dz, Math.atan2(-dx, -dz));
      return { name: it.name, x: it.x + dx, z: it.z + dz };
    }
  }
  return null;
});
await frames(6);
let focus = await d(() => window.__dakar.focus());
if (!focus) {                                                              // the first one may be out of reach: try the others until the game offers an action
  const n = await d(() => window.__dakar.interactables().length);
  for (let i = 1; i < Math.min(n, 30) && !focus; i++) {
    await d(i => { const D = window.__dakar, it = D.interactables()[i]; D.place(it.x, it.z + 1.6, Math.PI); }, i);
    await frames(5); focus = await d(() => window.__dakar.focus());
  }
}
const actBox = await rect('#act'), menuBox = await rect('#menuBtn'), joyBox = await rect('#joy');
check('0. the player stands where the game offers an action (the control for what follows)', !!focus && !!actBox && actBox.w > 20, JSON.stringify({ spot: spot?.name, focus: focus?.name, primary: focus?.primary }));
await shot('0-game-before');

// control: with the phone CLOSED, the action key does act (else the « nothing fired » checks below would prove nothing)
await page.keyboard.press('KeyE'); await frames(4);
const control = await acted();
check('0b. control: phone closed, the action key acts (a menu opens, or the game leaves « play »)', control.modal || control.mode !== 'play', JSON.stringify(control));
if (control.modal) { await page.keyboard.press('Escape'); await frames(4); }
await until(() => window.__dakar.pos().mode === 'play' && !document.querySelector('#modal.on'), null, 20000);

// ---- 1. open with a finger on ☰
await t.tap('#menuBtn'); await until(() => window.__dakar.phoneInfo().open);
// measured once the opening slide (16 px) has run: the software renderer draws few frames a second
await until(() => [...document.querySelectorAll('#phone, #phone *')].every(e => e.getAnimations().every(a => a.playState === 'finished')), null, 30000);
await wait(500);
let i = await info(), p0 = await pos();
check('1. a tap on ☰ opens the phone on its home screen, the game hands over (movement off)', i.open && i.screen === 'home' && p0.mode === 'menu', JSON.stringify({ ...i, mode: p0.mode }));
const bar = await d(() => {
  const q = s => document.querySelector('#phone ' + s), box = e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  return { time: q('.ph-time').textContent, day: q('.ph-day').textContent, sky: q('.ph-sky').textContent, energy: q('.ph-energy').getAttribute('aria-label'), net: !q('.ph-net').hidden,
    status: box(q('.ph-status')), close: box(q('[data-nav="close"]')), home: box(q('[data-nav="home"]')), homeTarget: (() => { const e = q('[data-nav="home"]'), r = e.getBoundingClientRect(), a = getComputedStyle(e, '::before'); return Math.round(r.height - parseFloat(a.top)); })(),
    head: getComputedStyle(q('.ph-head')).display, clock: window.__dakar.clock?.() ?? null };
});
check('1b. the status bar: the city’s time and day, the sky of the hour, the energy as the battery, « Fermer » (≥ 44 px); no app header on the home screen; the home indicator at the bottom (a 44 px target)',
  /^\d\d:\d\d$/.test(bar.time) && /^(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\.$/.test(bar.day) && /[☀🌤🌙]/u.test(bar.sky) && /^Énergie : \d+ %$/.test(bar.energy) && bar.status.top === 0 && bar.status.h <= 48
  && bar.close.w >= 44 && bar.close.h >= 44 && bar.head === 'none' && bar.home.bottom === 844 && bar.homeTarget >= 44, JSON.stringify(bar));
const home = await d(() => {
  const box = e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left }; };
  const dock = [...document.querySelectorAll('#phone .ph-dock .ph-app')], grid = [...document.querySelectorAll('#phone .hm-grid .ph-app')];
  const seen = e => { const b = box(e), x = b.left + b.w / 2, y = b.top + b.h / 2; return e.contains(document.elementFromPoint(x, y)); };
  const hooks = window.__dakar.phoneHooks, HOOK = { quartier: 'openPlaces', travail: 'openJobs', vtc: 'openVtc', credits: 'openCredits', affaires: 'openBusiness', maison: 'openHome', biens: 'openAssets', habitants: 'openPeople' };
  const dockBox = box(document.querySelector('#phone .ph-dock'));
  return { dock: dock.map(e => e.dataset.app ?? e.dataset.go), grid: grid.map(e => e.dataset.app), dockSeen: dock.every(seen), rowsSeen: grid.filter(seen).length, small: [...dock, ...grid].filter(e => { const b = box(e); return b.w < 44 || b.h < 44; }).length,
    first: grid.slice(0, 8).every(e => box(e).bottom <= dockBox.top + 1), dockBottom: dockBox.bottom, hookOk: Object.entries(HOOK).every(([app, h]) => grid.some(e => e.dataset.app === app) === (typeof hooks[h] === 'function')),
    label: Math.min(...[...dock, ...grid].map(e => parseFloat(getComputedStyle(e.querySelector(':scope > span')).fontSize))), sideways: document.querySelector('#phone .hm-scroll').scrollWidth > document.querySelector('#phone .hm-scroll').clientWidth + 1 };
});
const MUST = ['notifs', 'profil', 'logement', 'reglages', 'banque', 'pistes', 'carnet', 'sante', 'cesoir', 'actus', 'meteo', 'arene', 'horloge', 'calcul', 'aide'];
check('1c. the home screen: a dock always in view (Carte, Travailler, Argent, Messages, and the library) and EVERY app as an icon, one tap away (hook apps with their module); at least four rows in view above the dock; every tile a finger wide; nothing sideways',
  home.dock.join() === 'carte,travailler,portefeuille,messages,apps' && home.dockSeen && MUST.every(a => home.grid.includes(a)) && home.hookOk && home.small === 0 && home.first && home.rowsSeen >= 16 && home.dockBottom < 844 - 20 && home.label >= 12 && !home.sideways, JSON.stringify(home));
await shot('1-home');

// ---- 2. nothing reaches the game while the phone is open
const before = await pos();
// a thumb on the stick's place, dragged up and held; then a drag on the right (the camera); real fingers through the phone
await t.down(1, joyBox.cx, joyBox.cy); await t.move(1, joyBox.cx, joyBox.cy - 45, 4); await frames(8);
const stick = await d(() => ({ on: document.querySelector('#joy').classList.contains('on') }));
await t.up(1);
await t.down(2, 300, 420); await t.move(2, 120, 400, 5); await t.up(2); await frames(3);
// the action button's place, tapped through the phone; then the action keys, and W held
await t.down(3, actBox.cx, actBox.cy); await wait(70); await t.up(3); await frames(3);
i = await info();
if (i.screen !== 'home') { await d(() => window.__dakar.phone('home')); await wait(500); }                // (the tap opened whatever tile lies there: a phone tap, not a game one)
for (const k of ['KeyE', 'Space']) { await page.keyboard.press(k); await frames(2); }
await page.keyboard.down('KeyW'); await frames(8); await page.keyboard.up('KeyW');
const during = await pos(), a2 = await acted();
check('2. phone open: a thumb on the stick, a camera drag, a tap where the action button is, E, Espace and a held W — the player has not moved, the camera has not turned, nothing was triggered',
  Math.hypot(during.x - before.x, during.z - before.z) < 0.05 && Math.abs(during.cam - before.cam) < 0.01 && !stick.on && !a2.modal && a2.mode === 'menu' && (await info()).open,
  JSON.stringify({ moved: +Math.hypot(during.x - before.x, during.z - before.z).toFixed(3), cam: +(during.cam - before.cam).toFixed(4), stick, a2 }));

// ---- 3. one tap from the home screen to an app; its header; scroll; a sub-screen; back finds the scroll again
await d(() => window.__dakar.phone('home')); await wait(300);
await tap('#phone .ph-dock [data-app="portefeuille"]'); await until(() => window.__dakar.phoneInfo().screen === 'portefeuille');
i = await info();
const head = await d(() => ({ title: document.querySelector('#phone .ph-head h2').textContent, back: document.querySelector('#phone .ph-back').textContent, shown: getComputedStyle(document.querySelector('#phone .ph-head')).display !== 'none' }));
check('3. ONE tap on the dock’s « Argent » opens the app: its header says « ‹ Accueil · Argent »', i.screen === 'portefeuille' && i.depth === 1 && head.title === 'Argent' && head.back === 'Accueil' && head.shown, JSON.stringify({ i, head }));
await wait(500); await shot('2-app-argent');
await d(() => window.__dakar.phone('home')); await wait(300);
await tap('#phone .hm-grid [data-app="reglages"]'); await until(() => window.__dakar.phoneInfo().screen === 'reglages');
await d(() => { document.querySelector('#phone .ph-screen').scrollTop = 260; }); await wait(200);
await tap('#phone [data-act="soundtest"]'); await until(() => window.__dakar.phoneInfo().screen === 'sontest');
const deep = await d(() => ({ back: document.querySelector('#phone .ph-back').textContent, top: document.querySelector('#phone .ph-screen').scrollTop }));
await wait(400); await shot('4-sub-screen-back');
await tap('#phone [data-nav="back"]'); await until(() => window.__dakar.phoneInfo().screen === 'reglages');
const backTop = await d(() => document.querySelector('#phone .ph-screen').scrollTop);
check('3b. Réglages › Tester le son: the header says « ‹ Réglages »; « back » returns to Réglages scrolled where it was left', deep.back === 'Réglages' && deep.top === 0 && Math.abs(backTop - 260) < 4, JSON.stringify({ deep, backTop }));

// ---- 4. the home indicator: home from anywhere, and the app is found again where it was
await tap('#phone [data-act="soundtest"]'); await until(() => window.__dakar.phoneInfo().screen === 'sontest');
await tap('#phone [data-nav="home"]'); await until(() => window.__dakar.phoneInfo().screen === 'home');
const atHome = await info();
await tap('#phone .hm-grid [data-app="reglages"]'); await until(() => window.__dakar.phoneInfo().screen !== 'home');
const again = await info(), againBack = await d(() => document.querySelector('#phone .ph-back').textContent);
await tap('#phone [data-nav="back"]'); await until(() => window.__dakar.phoneInfo().screen === 'reglages');
const againTop = await d(() => document.querySelector('#phone .ph-screen').scrollTop);
check('4. the home indicator returns to the home screen from two screens deep; Réglages, tapped again, is where it was left (Tester le son, and under it the list at its scroll)',
  atHome.screen === 'home' && atHome.depth === 0 && again.screen === 'sontest' && again.depth === 2 && againBack === 'Réglages' && Math.abs(againTop - 260) < 4, JSON.stringify({ atHome, again, againBack, againTop }));
await tap('#phone [data-nav="home"]'); await until(() => window.__dakar.phoneInfo().screen === 'home');
await tap('#phone [data-nav="home"]'); await wait(300);
check('4b. the home indicator on the home screen stays on the home screen (the phone stays open)', (await info()).open && (await info()).screen === 'home');

// ---- 5. the library: the same apps by theme; an app opened from it returns to it
await tap('#phone [data-go="apps"]'); await until(() => window.__dakar.phoneInfo().screen === 'apps');
const lib = await d(() => ({ groups: [...document.querySelectorAll('#phone .pg-apps h3')].map(h => h.textContent), tiles: document.querySelectorAll('#phone .pg-apps .ph-app').length }));
await wait(400); await shot('3-library');
await tap('#phone .pg-apps [data-app="profil"]'); await until(() => window.__dakar.phoneInfo().screen === 'profil');
const fromLib = await d(() => document.querySelector('#phone .ph-back').textContent);
await tap('#phone [data-nav="back"]'); await until(() => window.__dakar.phoneInfo().screen === 'apps');
check('5. the library lists every app by theme; Profil opened from it says « ‹ Toutes les apps » and returns there', lib.groups.length === 5 && lib.tiles === home.dock.length - 1 + home.grid.length && fromLib === 'Toutes les apps', JSON.stringify({ lib, fromLib }));

// ---- 6. double taps: the second half never falls through. Two taps within a third of a second cannot be played with real fingers here (the software
// renderer takes longer than that to hear one), so the two taps are dispatched in the page, back to back, on whatever lies under the same spot.
const doubleTap = ([x, y, stale]) => {
  const fire = el => {
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'touch', pointerId: 31, isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'touch', pointerId: 31, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('click', { ...o, detail: 1 }));
  };
  const first = document.elementFromPoint(x, y); fire(first);
  const second = stale ? first : document.elementFromPoint(x, y); fire(second);       // `stale`: the second finger was down before the screen changed
  return { first: first.id || first.className, second: second.id || second.className };
};
await d(() => window.__dakar.phoneClose()); await until(() => !window.__dakar.phoneInfo().open); await wait(900);
const dm = await d(doubleTap, [menuBox.cx, menuBox.cy, false]); await wait(600);
const open1 = (await info()).open;
await d(() => window.__dakar.phoneClose()); await wait(900);
const dm2 = await d(doubleTap, [menuBox.cx, menuBox.cy, true]); await wait(600);
const open2 = (await info()).open;
check('6. a double tap on ☰ opens the phone and leaves it open, whether the second tap lands on « Fermer » (now under the finger) or still on ☰', open1 && open2 && /ph-close/.test(dm.second), JSON.stringify({ dm, open1, dm2, open2 }));
await d(() => window.__dakar.phone('home')); await wait(900);
const closeBox = await rect('#phone [data-nav="close"]');
const dc = await d(doubleTap, [closeBox.cx, closeBox.cy, false]); await wait(600);
const afterDouble = await info(), modeD = (await pos()).mode;
check('6b. a double tap on « Fermer » closes the phone and leaves it closed (☰ is under the finger: the second tap is dropped); the game is back in play', !afterDouble.open && modeD === 'play' && dc.second === 'menuBtn', JSON.stringify({ dc, afterDouble, modeD }));
// …and two separate taps (a second apart) are two taps: ☰ opens, « Fermer » closes
await wait(700); await t.tap('#menuBtn'); const o1 = await until(() => window.__dakar.phoneInfo().open, null, 15000);
await tap('#phone [data-nav="close"]'); const o2 = await until(() => !window.__dakar.phoneInfo().open, null, 15000);
check('6c. two separate taps stay two taps: ☰ opens the phone, « Fermer » (the same spot) closes it', o1 && o2);

// ---- 7. closing with a key on a focused button does not act in the street; a tile over the action button neither
await d(() => window.__dakar.phone('home')); await wait(600);
await d(() => document.querySelector('#phone [data-nav="close"]').focus());
await page.keyboard.press('Enter'); await until(() => !window.__dakar.phoneInfo().open); await frames(5);
const afterEnter = await acted();
await d(() => window.__dakar.phone('home')); await wait(600);
await d(() => document.querySelector('#phone [data-nav="close"]').focus());
await page.keyboard.press('Space'); await until(() => !window.__dakar.phoneInfo().open); await frames(5);
const afterSpace = await acted();
check('7. « Fermer » pressed with Entrée, then with Espace (the game’s action keys): the phone closes and nothing is triggered in the street', !afterEnter.modal && afterEnter.mode === 'play' && !afterSpace.modal && afterSpace.mode === 'play', JSON.stringify({ afterEnter, afterSpace }));

// ---- 8. back in play: the same place, nothing fired, and the stick works at once (no stuck stick either)
const closed = await pos(), a8 = await acted();
check('8. the phone closed: the player is where they stood, in play, no menu opened by anything above', Math.hypot(closed.x - before.x, closed.z - before.z) < 0.05 && closed.mode === 'play' && !a8.modal && closed.hub === before.hub, JSON.stringify({ closed, a8 }));
await frames(6);
const still = await pos();
check('8b. nothing keeps walking after the phone (no stuck stick, no stuck key)', Math.hypot(still.x - closed.x, still.z - closed.z) < 0.05, `drift ${Math.hypot(still.x - closed.x, still.z - closed.z).toFixed(3)}`);
await shot('5-closed-back-in-game');
await d(() => window.__dakar.place(-6, -30, 0)); await frames(3);
const w0 = await pos();
await t.down(4, joyBox.cx, joyBox.cy); await t.move(4, joyBox.cx, joyBox.cy - 45, 4); await frames(10); await t.up(4);
const w1 = await pos();
check('8c. and the stick moves the player again', Math.hypot(w1.x - w0.x, w1.z - w0.z) > 0.3, `moved ${Math.hypot(w1.x - w0.x, w1.z - w0.z).toFixed(2)} m`);

// ---- 9. a held stick when the phone opens (☰ with the other thumb) is released, and stays released after closing
await t.down(5, joyBox.cx, joyBox.cy); await t.move(5, joyBox.cx, joyBox.cy - 45, 4); await frames(3);
await t.down(6, menuBox.cx, menuBox.cy); await wait(60); await t.up(6);
const opened = await until(() => window.__dakar.phoneInfo().open, null, 10000);
await wait(700);
const h0 = await pos(); await frames(6); const h1 = await pos();
await tap('#phone [data-nav="close"]'); await until(() => !window.__dakar.phoneInfo().open);
const h2 = await pos(); await frames(6); const h3 = await pos();
await t.up(5);
check('9. ☰ tapped while the other thumb holds the stick: the phone opens, the walk stops, and it does not resume when the phone closes with the thumb still down',
  opened && Math.hypot(h1.x - h0.x, h1.z - h0.z) < 0.05 && Math.hypot(h3.x - h2.x, h3.z - h2.z) < 0.15, JSON.stringify({ opened, open: +Math.hypot(h1.x - h0.x, h1.z - h0.z).toFixed(3), after: +Math.hypot(h3.x - h2.x, h3.z - h2.z).toFixed(3) }));

// ---- 10. the phone reopens where it was left; night: the dark theme
await d(() => window.__dakar.phone('travailler')); await wait(400); await d(() => window.__dakar.phoneClose());
await t.tap('#menuBtn'); await until(() => window.__dakar.phoneInfo().open); await wait(500);
check('10. closed on an app, the phone reopens on it', (await info()).screen === 'travailler');
check('11. no page error', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = checks.filter(c => !c.ok);
fs.writeFileSync(`${out}/results.json`, JSON.stringify(checks, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
