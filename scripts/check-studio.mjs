// The character studio (src/ui/characterStudio.ts, src/ui/studioStage.ts, src/actors/{appearance,meshyLook,hairStyles,portrait}.ts) on a phone, with real touch: the welcome
// and the name, the four categories (only the open one shown, the camera on the face for skin and hair), every choice on the live avatar, the body switch keeping
// the look, rapid taps (the last one wins), « C'est moi → Jouer » into Pikine with the economy untouched, the v6 save, reload, district change, the Profile picture,
// « Modifier mon personnage » (cancel restores, save changes nothing else), old and broken saves, the presence's look, no console errors, and what it costs.
// Usage: node scripts/check-studio.mjs [baseUrl=http://localhost:4401/] [outDir=docs/avatar/proof]   (serve the game first: vite, or a build with vite preview)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://localhost:4401/', out = process.argv[3] ?? 'docs/avatar/proof';
fs.mkdirSync(out, { recursive: true });
const KEY = 'dakarrek.guest.save.v6';
let failed = 0; const results = [], metrics = {};
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 240)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-precise-memory-info'] });
const errors = [];
const open = async ({ seed = null, viewport = { width: 390, height: 844 } } = {}) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript(seed => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(seed ?? {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } } catch { /* */ } }, seed);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { context, page };
};
const started = p => p.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.avatar, null, { timeout: 180000 });
const goto = (p, q) => p.goto(`${base}?${q}`, { waitUntil: 'load', timeout: 180000 });
const save = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY);
const live = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__dakar.state.data)));
const who = p => p.evaluate(() => window.__dakar.avatar());
const st = p => p.evaluate(() => window.__studio.state());
const tap = (p, sel) => p.locator(sel).first().tap();
const choice = (p, g, v) => tap(p, `#studio .st-panel [data-g="${g}"][data-v="${v}"]`);
const settle = async (p, ms = 1300) => { await p.waitForTimeout(ms); };
const stage = p => p.locator('#studio .st-stage').screenshot();
async function diff(a, b) {
  const [x, y] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
  let s = 0; for (let i = 0; i < x.data.length; i++) s += Math.abs(x.data[i] - y.data[i]); return s / x.data.length;
}
const shot = async (p, name) => { await p.waitForTimeout(350); await p.screenshot({ path: `${out}/${name}.png` }); };
const openProfile = async p => {
  await tap(p, '#menuBtn'); await p.waitForFunction(() => window.__dakar.phoneInfo().open);
  if (await p.evaluate(() => window.__dakar.phoneInfo().screen) !== 'profil') await p.evaluate(() => window.__dakar.phone('profil'));
  await p.waitForFunction(() => window.__dakar.phoneInfo().screen === 'profil');
};
const lookReady = p => p.waitForFunction(() => window.__studio?.state().drawn && window.__studio.state().view.settled, null, { timeout: 120000 });
/** The layer's entrance and switching animations over (the endless backdrop drift aside): what is measured is where things rest. */
const calm = p => p.waitForFunction(() => document.getAnimations().every(a => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: 30000 });
/** The whole body, head to soles, inside the band the header and the panel leave free (nothing hidden behind them). */
const framed = async p => { const e = (await st(p)).extent; return { ok: e.feet <= e.bottom + 2 && e.crown >= e.top - 2 && e.feet - e.crown > 120, e: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, Math.round(v)])) }; };
const shownPanes = p => p.evaluate(() => [...document.querySelectorAll('.st-pane')].filter(e => getComputedStyle(e).opacity === '1').map(e => e.dataset.pane).join());

// ---------------------------------------------------------------------------------------------------- 1 · first launch
{
  const { context, page: p } = await open();
  const t0 = Date.now();
  await goto(p, 'debug&touch&avatar=choisir&heure=11');
  await p.waitForSelector('#studio .st-hero h1', { state: 'visible' });
  metrics.welcomeMs = Date.now() - t0;
  check('the welcome is on screen as soon as the page has loaded (before the city\'s assets)', await p.evaluate(() => !window.__dakar?.pos?.().hub), `${metrics.welcomeMs} ms from navigation`);
  check('welcome: « Bienvenue à Dakar. », a name field, suggestions, one Continuer', (await p.locator('#stHello').innerText()).includes('Bienvenue à Dakar') && await p.locator('#stName').isVisible() && (await p.locator('.st-pill:not(.st-more)').count()) === 6 && (await p.locator('#stContinue').count()) === 1);
  check('Continuer stays off until there is a name', await p.locator('#stContinue').isDisabled());
  check('the studio\'s controls are out of reach (inert) until the name is given: no way round it with a tab key', await p.evaluate(() => document.querySelector('#studio .st-panel').inert && document.querySelector('#studio .st-top').inert && !document.querySelector('#studio .st-welcome').inert));
  await shot(p, '01-welcome');
  const first = await p.locator('.st-pill:not(.st-more)').first().innerText();
  await tap(p, '.st-more'); check('« d\'autres prénoms » offers others', (await p.locator('.st-pill:not(.st-more)').first().innerText()) !== first);
  await p.locator('#stName').fill('X'); check('one letter is not a name', await p.locator('#stContinue').isDisabled());
  await p.locator('#stName').fill('Ndèye Fatou'); check('any first name of the player\'s own works (accents, a space)', await p.locator('#stContinue').isEnabled());
  await p.locator('#stName').fill(''); await tap(p, '.st-pill:not(.st-more)'); const picked = await p.locator('#stName').inputValue();
  check('a suggestion fills the name', picked.length >= 2 && await p.locator('#stContinue').isEnabled(), picked);
  await p.locator('#stName').fill('Awa');
  const tStudio = Date.now();
  await tap(p, '#stContinue');
  await lookReady(p); metrics.studioReadyMs = Date.now() - tStudio;
  await p.evaluate(() => window.__studio.freeze(true));
  let s = await st(p);
  metrics.firstBodyMs = s.firstBodyMs;
  check('the studio: the real homme body, three-quarters, the default look', s.drawn === 'meshy_m' && s.avatar === 'homme' && Math.abs(s.view.yaw + 0.42) < 0.2 && s.look.hair === 'natural', JSON.stringify({ drawn: s.drawn, yaw: s.view.yaw, look: s.look }));
  await calm(p);
  check('in the studio the welcome is inert, and so are the categories not shown', await p.evaluate(() => document.querySelector('#studio .st-welcome').inert && !document.querySelector('#studio .st-panel').inert && [...document.querySelectorAll('#studio .st-pane')].every(e => e.inert === (e.dataset.pane !== 'corps'))));
  check('four categories; only Corps is shown; the main action is on screen', (await p.locator('.st-tab').count()) === 4 && await shownPanes(p) === 'corps' && await p.evaluate(() => { const r = document.getElementById('stPlay').getBoundingClientRect(); return r.bottom <= innerHeight && r.top > innerHeight / 2; }));
  check('no scrolling; nothing outside the screen', await p.evaluate(() => { const c = document.getElementById('studio'); return c.scrollHeight <= innerHeight + 1 && c.scrollWidth <= innerWidth + 1 && c.scrollTop === 0; }));
  const fr = await framed(p); check('the whole body is in view, head to feet, clear of the header and the panel', fr.ok, JSON.stringify(fr.e));
  await p.waitForFunction(() => window.__studio.state().stills >= 2, null, { timeout: 60000 }).catch(() => {});
  check('Corps: both bodies shown as pictures of the real avatars', (await st(p)).stills >= 2);
  metrics.stage = (await st(p)).info;   // what the stage draws each frame (calls, triangles) and holds (geometries, textures, programs)
  await shot(p, '02-studio-corps');
  // categories: the camera on the face for skin and hair, the whole body for outfits
  const focus = {};
  for (const c of ['peau', 'coiffure', 'tenue', 'corps']) {
    await tap(p, `.st-tab[data-cat="${c}"]`); await lookReady(p); await settle(p, 400); await calm(p);
    s = await st(p); focus[c] = { focus: s.view.focus, d: +s.view.d.toFixed(2), shown: await shownPanes(p) };
    if (c !== 'corps') await shot(p, `03-studio-${c}`);
  }
  check('each category shows only its own choices', Object.entries(focus).every(([c, f]) => f.shown === c), JSON.stringify(focus));
  check('the camera comes to the face for Peau and Coiffure, back to the whole body for Tenue and Corps', focus.peau.focus === 'face' && focus.coiffure.focus === 'hair' && focus.tenue.focus === 'body' && focus.peau.d < focus.tenue.d * 0.5, JSON.stringify(focus));
  // touch targets in every category
  let small = [];
  for (const c of ['corps', 'peau', 'coiffure', 'tenue']) { await tap(p, `.st-tab[data-cat="${c}"]`); await settle(p, 350); small = small.concat(await p.$$eval(`#studio [data-pane="${c}"] button, #studio .st-tab, #stPlay, #stBack`, els => els.map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 10) || e.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(b => b.w < 38 || b.h < 38))); }
  check('every control is a comfortable tap (≥ 38 px, swatches 42–48 px)', small.length === 0, JSON.stringify(small.slice(0, 4)));
  // every choice shows on the avatar
  const pairs = [['peau', 'skin', 0, 5, 'skin tone'], ['coiffure', 'hair', 'shaved', 'natural', 'Rasé vs Court'], ['coiffure', 'hair', 'afro', 'natural', 'Afro vs Court'], ['coiffure', 'hair', 'kufi', 'natural', 'Kufi vs Court'], ['tenue', 'outfit', 1, 0, 'Rayé vs Uni'], ['tenue', 'outfit', 2, 1, 'Imprimé vs Rayé'], ['tenue', 'color', 2, 5, 'colour']];
  for (const [c, g, a, b, label] of pairs) {
    await tap(p, `.st-tab[data-cat="${c}"]`); await choice(p, g, a); await lookReady(p); await settle(p, 500); const A = await stage(p);
    await choice(p, g, b); await lookReady(p); await settle(p, 500); const B = await stage(p);
    const d = await diff(A, B); check(`homme · ${label}: the avatar changes on screen`, d > 0.6, `mean diff ${d.toFixed(2)}`);
  }
  await tap(p, '.st-tab[data-cat="peau"]'); await lookReady(p);
  const tones = []; for (let i = 0; i < 6; i++) { await choice(p, 'skin', i); await settle(p, 700); tones.push(await stage(p)); }
  let minTone = 1e9; for (let i = 1; i < 6; i++) minTone = Math.min(minTone, await diff(tones[i - 1], tones[i]));
  check('six skin tones, each visibly different from the next', minTone > 1, `smallest neighbour diff ${minTone.toFixed(2)}`);
  await choice(p, 'skin', 2);
  await tap(p, '.st-tab[data-cat="tenue"]'); await choice(p, 'color', 3); await choice(p, 'outfit', 2);
  await tap(p, '.st-tab[data-cat="coiffure"]'); await choice(p, 'hair', 'kufi');
  // the other body keeps the look
  await tap(p, '.st-tab[data-cat="corps"]'); await choice(p, 'body', 'femme'); await p.waitForFunction(() => window.__studio.state().drawn === 'meshy_f');
  s = await st(p);
  check('Femme: drawn at once, the look kept (skin, outfit, colour), the kufi becomes her headwrap', s.drawn === 'meshy_f' && s.look.skin === 2 && s.look.outfit === 2 && s.look.color === 3 && s.look.hair === 'wrap', JSON.stringify(s.look));
  await tap(p, '.st-tab[data-cat="coiffure"]'); await lookReady(p);
  check('her four styles are offered (Locks, Afro, Chignon, Foulard)', (await p.locator('.st-haircard b').allInnerTexts()).join() === 'Locks,Afro,Chignon,Foulard');
  for (const h of ['natural', 'afro', 'puff', 'wrap']) { await choice(p, 'hair', h); await lookReady(p); await settle(p, 600); await shot(p, `04-femme-${h}`); }
  // rapid taps: the last one wins
  await tap(p, '.st-tab[data-cat="tenue"]');
  for (const [g, v] of [['color', 0], ['outfit', 1], ['color', 4], ['outfit', 0], ['color', 1], ['outfit', 2], ['color', 5]]) await choice(p, g, v);
  await tap(p, '.st-tab[data-cat="corps"]'); await choice(p, 'body', 'homme'); await choice(p, 'body', 'femme'); await choice(p, 'body', 'homme'); await choice(p, 'body', 'femme');
  await tap(p, '.st-tab[data-cat="coiffure"]'); await choice(p, 'hair', 'afro'); await choice(p, 'hair', 'puff');
  await lookReady(p); await settle(p, 800);
  s = await st(p);
  check('rapid taps on every row: the screen ends on the last choice of each (no stale body or look)', s.drawn === 'meshy_f' && s.shown.body === 'meshy_f' && JSON.stringify(s.shown.look) === JSON.stringify(s.look) && s.look.color === 5 && s.look.outfit === 2 && s.look.hair === 'puff', JSON.stringify({ shown: s.shown, look: s.look }));
  await choice(p, 'hair', 'afro'); await tap(p, '.st-tab[data-cat="tenue"]'); await choice(p, 'color', 2); await choice(p, 'outfit', 2);
  await lookReady(p); await shot(p, '05-final-look');
  const chosen = (await st(p)).look;
  const heap0 = await p.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  const tPlay = Date.now();
  await tap(p, '#stPlay');
  await p.waitForSelector('#studio.st-arriving'); await shot(p, '06-arrival');
  await started(p); await p.waitForFunction(() => !document.getElementById('studio'), null, { timeout: 30000 }); await p.waitForTimeout(1500);
  metrics.playToGameMs = Date.now() - tPlay;
  const d = await live(p), w = await who(p), sv = await save(p);
  check('into the game: the studio gone, in Pikine, with the character as chosen', (await p.evaluate(() => window.__dakar.pos())).hub === 'pikine' && w.body === 'meshy_f' && JSON.stringify(w.drawn) === JSON.stringify(chosen), JSON.stringify(w));
  check('the starting economy and life untouched: 3 000 F, Pikine, no job, no career', d.wallet === 3000 && d.hub === 'pikine' && !d.jobs.active && d.career.bouts.length === 0);
  check('the v6 save holds the body and the look (schema 6, own key)', sv?.schemaVersion === 6 && sv.avatar === 'femme' && JSON.stringify(sv.appearance) === JSON.stringify(chosen), JSON.stringify({ v: sv?.schemaVersion, a: sv?.avatar, l: sv?.appearance }));
  const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('dakarrek.presence.profile') ?? 'null'));
  check('the first name and colour go to the presence profile; the look to the presence', prof?.name === 'Awa' && prof?.look === chosen.color && await p.evaluate(() => window.__dakar.presenceLook?.() ?? null) === `f${chosen.skin}a${chosen.outfit}${chosen.color}`, JSON.stringify(prof));
  check('Tonton Ibou\'s welcome is there as before', /Tonton Ibou/.test(await p.locator('#ui').innerText()));
  await p.evaluate(() => { const k = window.__dakar; k.pause(true); k.step(1 / 60, 30); k.render(); }); await shot(p, '07-game');
  await p.evaluate(() => { const k = window.__dakar; k.portrait(2.2, 1.3, 0.35); k.step(1 / 60, 30); k.render(); }); await shot(p, '08-game-close');
  await p.evaluate(() => { window.__dakar.portrait(0); window.__dakar.pause(false); });
  // the game's own controls work right after (the studio's touches never reached the stick)
  const x0 = (await p.evaluate(() => window.__dakar.pos())).x;
  const cdp = await context.newCDPSession(p); const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', 90, 690); for (let i = 1; i <= 6; i++) { await touch('touchMove', 90, 690 - 14 * i); await p.waitForTimeout(40); } await p.waitForTimeout(1500); await touch('touchEnd');
  const moved = await p.evaluate(() => window.__dakar.pos());
  check('the joystick moves the player straight away', Math.hypot(moved.x - x0, 1) > 1.05 || Math.abs(moved.z) > 0.5, JSON.stringify(moved));
  // district change
  await p.evaluate(() => window.__dakar.teleport('plateau')); await p.waitForFunction(() => window.__dakar.pos().hub === 'plateau'); await p.waitForTimeout(1500);
  check('a district change keeps the look', JSON.stringify((await who(p)).drawn) === JSON.stringify(chosen));
  await p.evaluate(() => window.__dakar.teleport('pikine')); await p.waitForFunction(() => window.__dakar.pos().hub === 'pikine'); await p.waitForTimeout(1200);
  // the Profile
  await openProfile(p);
  const pic = await p.locator('#phone .ph-profile .ph-portrait').getAttribute('src').catch(() => null);
  check('Profile: the player\'s own avatar as its picture (not an emoji), the name, « Modifier mon personnage »', !!pic && pic.startsWith('data:image/jpeg') && /Awa/.test(await p.locator('#phone .ph-profile b').innerText()) && await p.locator('#phone [data-act="editchar"]').isVisible());
  await shot(p, '09-profile');
  // edit: cancel restores
  const before = await live(p);
  await tap(p, '#phone [data-act="editchar"]'); await lookReady(p);
  s = await st(p);
  check('« Modifier mon personnage »: the same studio, on the current body and look, the game paused under it', s.step === 'look' && s.avatar === 'femme' && JSON.stringify(s.look) === JSON.stringify(chosen) && (await p.evaluate(() => window.__dakar.pos().mode)) === 'busy' && (await p.locator('#stPlay').innerText()) === 'Enregistrer');
  await shot(p, '10-edit');
  await tap(p, '.st-tab[data-cat="peau"]'); await choice(p, 'skin', 5); await tap(p, '.st-tab[data-cat="corps"]'); await choice(p, 'body', 'homme'); await settle(p, 500);
  await tap(p, '#stBack'); await p.waitForFunction(() => !document.getElementById('studio')); await p.waitForTimeout(500);
  check('Annuler: everything as before (body, look, save), the game resumes', JSON.stringify((await who(p)).drawn) === JSON.stringify(chosen) && (await who(p)).body === 'meshy_f' && JSON.stringify((await live(p)).appearance) === JSON.stringify(chosen) && (await live(p)).avatar === before.avatar && (await live(p)).wallet === before.wallet && JSON.stringify((await save(p)).appearance) === JSON.stringify(before.appearance) && (await p.evaluate(() => window.__dakar.pos().mode)) === 'play');
  // edit: save
  await openProfile(p); const before2 = await live(p); await tap(p, '#phone [data-act="editchar"]'); await lookReady(p);
  await choice(p, 'body', 'homme'); await p.waitForFunction(() => window.__studio.state().drawn === 'meshy_m');
  await tap(p, '.st-tab[data-cat="peau"]'); await choice(p, 'skin', 4); await tap(p, '.st-tab[data-cat="coiffure"]'); await choice(p, 'hair', 'kufi');
  await tap(p, '.st-tab[data-cat="tenue"]'); await choice(p, 'outfit', 1); await choice(p, 'color', 0); await lookReady(p);
  const want = (await st(p)).look;
  await tap(p, '#stPlay');
  await p.waitForFunction(w => window.__dakar.avatar().body === 'meshy_m' && JSON.stringify(window.__dakar.avatar().drawn) === JSON.stringify(w), want, { timeout: 60000 }); await p.waitForTimeout(800);
  const after = await live(p), sv2 = await save(p);
  // (career.dims / dimBest: the progress tick's record of today's four gauges, rewritten by the clock every 2 s — compared apart, and reported when it moved)
  const clockless = c => { const { dims, dimBest, ...rest } = c ?? {}; return rest; };
  const lost = ['wallet', 'hub', 'counters', 'flags', 'rel', 'guestId', 'beats', 'inventory', 'jobs', 'ledger', 'career', 'activities'].filter(k => k === 'career' ? JSON.stringify(clockless(after.career)) !== JSON.stringify(clockless(before2.career)) : JSON.stringify(after[k]) !== JSON.stringify(before2[k]));
  const gauges = JSON.stringify(after.career?.dims) === JSON.stringify(before2.career?.dims) ? 'gauges unchanged' : `gauges moved with the clock: ${JSON.stringify(before2.career?.dims?.slice(-1))} → ${JSON.stringify(after.career?.dims?.slice(-1))}`;
  const owned = x => JSON.stringify((x.assets?.list ?? []).map(a => `${a.uid}:${a.spec}:${a.how}`));
  check('Enregistrer: the new body and look in the game and the save', sv2.avatar === 'homme' && JSON.stringify(sv2.appearance) === JSON.stringify(want), JSON.stringify(sv2.appearance));
  check('nothing else changes: money, place, counters, flags, relations, owned things, inventory, jobs, ledger, career', lost.length === 0 && owned(after) === owned(before2), `${lost.join(',') || 'none lost'}; ${gauges}`);
  await openProfile(p); await p.waitForTimeout(400);
  const pic2 = await p.locator('#phone .ph-profile .ph-portrait').getAttribute('src').catch(() => null);
  check('the Profile picture follows the new look', !!pic2 && pic2 !== pic);
  await shot(p, '11-profile-after-edit');
  await tap(p, '#phone [data-nav="close"]');
  // reload
  await p.reload({ waitUntil: 'load' }); await started(p); await p.waitForTimeout(2000);
  const w2 = await who(p);
  check('reload: no studio, the same body and look', await p.$('#studio') === null && w2.body === 'meshy_m' && JSON.stringify(w2.drawn) === JSON.stringify(want));
  metrics.heapAfterStudioMB = +(heap0 / 1e6).toFixed(1);
  await context.close();
}

// ---------------------------------------------------------------------------------------------------- 2 · saves made before the studio, broken data
for (const [name, seed, expect] of [
  ['a v6 save without a look', { [KEY]: { schemaVersion: 6, guestId: 'g-a', wallet: 4321, hub: 'pikine', avatar: 'femme' } }, { body: 'meshy_f', look: null }],
  ['a v5 save from the launch client (imported)', { 'dakarrek.guest.save.v5': { schemaVersion: 5, guestId: 'g-b', wallet: 4321, hub: 'plateau' } }, { body: 'meshy_m', look: null }],
  ['a v6 save with a broken look', { [KEY]: { schemaVersion: 6, guestId: 'g-c', wallet: 4321, hub: 'pikine', avatar: 'homme', appearance: { skin: 99, hair: 'wrap', outfit: 'x', color: -1 } } }, { body: 'meshy_m', look: { skin: 4, hair: 'kufi', outfit: 0, color: 1 } }],
]) {
  const { context, page: p } = await open({ seed });
  await goto(p, 'debug&touch'); await started(p); await p.waitForTimeout(1800);
  const w = await who(p), d = await live(p);
  check(`${name}: no studio, nothing lost, drawn as it should`, await p.$('#studio') === null && d.wallet === 4321 && w.body === expect.body && JSON.stringify(w.drawn) === JSON.stringify(expect.look), JSON.stringify({ w, wallet: d.wallet }));
  if (name.startsWith('a v6 save without')) {
    await openProfile(p); await tap(p, '#phone [data-act="editchar"]'); await lookReady(p);
    const s = await st(p);
    check('…its studio opens on that body\'s default look, and keeps what is chosen', s.avatar === 'femme' && s.look.hair === 'natural' && s.look.skin === 4);
    await tap(p, '.st-tab[data-cat="peau"]'); await choice(p, 'skin', 1); await tap(p, '#stPlay');
    await p.waitForFunction(k => JSON.parse(localStorage.getItem(k) ?? 'null')?.appearance?.skin === 1, KEY);
    check('…saved, money untouched', (await save(p)).wallet === 4321);
  }
  await context.close();
}

// a device whose storage refuses the picture (full, or private browsing): the Profile shows it all the same, drawn once, and stays still under the finger
{
  const { context, page: p } = await open({ seed: { [KEY]: { schemaVersion: 6, guestId: 'g-d', wallet: 4321, hub: 'pikine', avatar: 'homme', appearance: { skin: 2, hair: 'kufi', outfit: 1, color: 2 } } } });
  await context.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'dakarrek.portrait') throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); }; });
  await goto(p, 'debug&touch'); await started(p); await p.waitForTimeout(2500);
  await openProfile(p); await p.waitForTimeout(1500);
  // (the Profile screen is never rebuilt meanwhile: its button and its picture are the same elements two seconds later; the status bar's clock may tick)
  const stable = await p.evaluate(() => new Promise(r => { const b = document.querySelector('#phone [data-act="editchar"]'), img = document.querySelector('#phone .ph-portrait'); let n = 0; const mo = new MutationObserver(m => { n += m.filter(x => x.target.closest?.('.ph-profile') || [...x.addedNodes].some(a => a.querySelector?.('.ph-profile'))).length; }); mo.observe(document.getElementById('phone'), { childList: true, subtree: true }); setTimeout(() => { mo.disconnect(); r({ same: b === document.querySelector('#phone [data-act="editchar"]') && img === document.querySelector('#phone .ph-portrait'), n }); }, 2000); }));
  const pic = await p.locator('#phone .ph-profile .ph-portrait').getAttribute('src').catch(() => null);
  check('storage refusing the picture: the Profile shows it (kept for the session), drawn once, the screen still (no redraw loop)', stable.same && stable.n === 0 && !!pic?.startsWith('data:image/jpeg'), JSON.stringify({ ...stable, pic: !!pic }));
  await tap(p, '#phone [data-act="editchar"]'); await lookReady(p);
  check('…and « Modifier mon personnage » opens', (await st(p)).step === 'look');
  await context.close();
}

// ---------------------------------------------------------------------------------------------------- 3 · small phone and landscape
for (const vp of [{ width: 375, height: 667 }, { width: 844, height: 390 }]) {
  const { context, page: p } = await open({ viewport: vp });
  await goto(p, 'debug&touch&avatar=choisir&heure=11'); await p.waitForSelector('#studio');
  await calm(p);
  const fits1 = await p.evaluate(() => { const r = document.getElementById('stContinue').getBoundingClientRect(); return r.bottom <= innerHeight && document.getElementById('studio').scrollHeight <= innerHeight + 1; });
  await p.locator('#stName').fill('Pape'); await tap(p, '#stContinue'); await lookReady(p); await calm(p);
  const fits2 = await p.evaluate(() => [...document.querySelectorAll('#studio .st-tab, #stPlay, #studio [data-pane="corps"] button')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  const fr = await framed(p);
  check(`${vp.width}×${vp.height}: both steps fit, nothing cut off, the whole body in view`, fits1 && fits2 && fr.ok, JSON.stringify({ fits1, fits2, ...fr.e }));
  await shot(p, `12-studio-${vp.width}x${vp.height}`);
  await context.close();
}
check('no console or page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
fs.writeFileSync(`${out}/check-studio.json`, JSON.stringify({ base, metrics, results }, null, 1));
console.log('metrics', JSON.stringify(metrics));
console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASSED`);
process.exit(failed ? 1 : 0);
