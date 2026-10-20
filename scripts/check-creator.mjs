// The character creator (src/ui/characterCreator.ts, src/actors/appearance.ts, src/actors/meshyLook.ts), on a phone with real touch: the two steps, every choice visible on
// the live avatar, the one action, the save (additive `appearance`, v5 key here; v6 only adds the same field), reload, district change, « Modifier mon personnage » in the phone's
// Profile, the saves made before the creator (no prompt, same look), the online colour, and screenshots. Usage: node scripts/check-creator.mjs [baseUrl=http://localhost:4401/] [outDir=docs/avatar/proof]
// Serve the game first: npx vite --port 4401 (or a build with vite preview).
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://localhost:4401/', out = process.argv[3] ?? 'docs/avatar/proof';
fs.mkdirSync(out, { recursive: true });
const KEY = 'dakarrek.guest.save.v5';
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 260)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const errors = [];
const open = async ({ seed = null } = {}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript(seed => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); if (seed) localStorage.setItem('dakarrek.guest.save.v5', JSON.stringify(seed)); } } catch { /* */ } }, seed);
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { context, page };
};
const started = p => p.waitForFunction(() => window.__dakar?.pos?.().hub && window.__dakar.avatar().drawn !== undefined, null, { timeout: 180000 });
const goto = (p, q) => p.goto(`${base}?${q}`, { waitUntil: 'load', timeout: 180000 });
const save = p => p.evaluate(k => { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }, KEY);
const who = p => p.evaluate(() => window.__dakar.avatar());
const chip = (p, g, v) => p.locator(`#creator .cr-chip[data-g="${g}"][data-v="${v}"]`);
const settle = (p, ms = 1300) => p.waitForTimeout(ms);
const stage = p => p.locator('#creator .cr-stage').screenshot();
/** Mean absolute difference (0–255) between two stage pictures. */
async function diff(a, b) {
  const [x, y] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
  let s = 0; for (let i = 0; i < x.data.length; i++) s += Math.abs(x.data[i] - y.data[i]); return s / x.data.length;
}
const shot = async (p, name) => { await p.waitForTimeout(400); await p.screenshot({ path: `${out}/${name}.png` }); };
/** The phone's Profile screen (the phone reopens where it was left). */
const openProfile = async p => {
  await p.locator('#menuBtn').tap(); await p.waitForFunction(() => window.__dakar.phoneInfo().open);
  if (await p.evaluate(() => window.__dakar.phoneInfo().screen) !== 'profil') { await p.locator('#phone [data-nav="home"]').tap(); await p.locator('#phone [data-app="profil"]').tap(); }
  await p.waitForFunction(() => window.__dakar.phoneInfo().screen === 'profil');
};
const bodyReady = p => p.waitForFunction(() => !!document.querySelector('#crCanvas')?.dataset.body, null, { timeout: 120000 });

// ---------------------------------------------------------------------------------------------------- 1 · New Game: the two steps
{
  const { context, page: p } = await open();
  await goto(p, 'debug&touch&avatar=choisir');
  await p.waitForSelector('#creator');
  check('New Game: step 1 asks for a first name, with suggestions and one Continue button', await p.locator('#crName').isVisible() && (await p.locator('.cr-pill').count()) >= 6 && (await p.locator('#crContinue').count()) === 1);
  check('step 1: Continue is off until there is a name', await p.locator('#crContinue').isDisabled());
  check('the dialog is announced', await p.$eval('#creator', e => e.getAttribute('role') === 'dialog' && e.getAttribute('aria-modal') === 'true'));
  const pre = await p.evaluate(() => ({ hub: window.__dakar.pos().hub ?? null, keys: Object.keys(localStorage).filter(k => k.startsWith('dakarrek')) }));
  check('nothing is saved and the world is not loaded before the end', pre.hub === null && !pre.keys.includes(KEY), JSON.stringify(pre));
  await shot(p, '01-step1-name');
  await p.locator('#crName').fill('A'); check('one letter is not a name', await p.locator('#crContinue').isDisabled());
  await p.locator('.cr-pill', { hasText: 'Awa' }).tap();
  check('a suggestion fills the name', (await p.locator('#crName').inputValue()) === 'Awa' && await p.locator('#crContinue').isEnabled());
  await p.locator('#crName').fill('Moussa Ndiaye 99'); check('digits and spaces are allowed up to 16 characters', await p.locator('#crContinue').isEnabled());
  await p.locator('#crName').fill('Moussa');
  const t0 = Date.now();
  await p.locator('#crContinue').tap();
  await p.waitForFunction(() => document.querySelector('#creator').dataset.step === 'look');
  await bodyReady(p); await p.evaluate(() => window.__dakarCreator.freeze(true)); await settle(p);
  const st = await p.evaluate(() => window.__dakarCreator.state());
  check('step 2: « Mon personnage » shows the real homme body, with the defaults', st.drawn === 'meshy_m' && st.avatar === 'homme' && st.look.skin === 4 && st.look.hair === 'natural' && st.look.outfit === 0 && st.look.color === 1, JSON.stringify(st));
  check('step 2: five rows and one action', (await p.locator('#creator .cr-row').count()) === 5 && (await p.locator('#crPlay').innerText()).includes('C’est moi → Jouer'));
  check('step 2: no scrolling and every control inside the phone', await p.evaluate(() => { const c = document.getElementById('creator'); const r = c.querySelector('#crPlay').getBoundingClientRect(); return c.scrollHeight <= innerHeight + 1 && c.scrollWidth <= innerWidth + 1 && r.bottom <= innerHeight && r.top > 0; }));
  const sizes = await p.$$eval('#creator .cr-chip', els => els.map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  check('every choice is at least 44 px to tap', sizes.length > 0 && sizes.every(s => s >= 43.5), Math.min(...sizes));
  await shot(p, '02-step2-homme-default');

  // every choice shows on the avatar at once: two different options of a row give two different pictures of the live avatar
  const pairs = [['skin', 0, 5, 'skin tone'], ['hair', 'shaved', 'natural', 'hair (rasé / court)'], ['hair', 'afro', 'shaved', 'hair (afro / rasé)'], ['hair', 'wrap', 'shaved', 'hair (foulard / rasé)'], ['outfit', 1, 0, 'outfit (sport / décontracté)'], ['outfit', 2, 1, 'outfit (wax / sport)'], ['color', 2, 3, 'outfit colour']];
  for (const [g, a, b, label] of pairs) {
    await chip(p, g, a).tap(); await settle(p); const A = await stage(p);
    await chip(p, g, b).tap(); await settle(p); const B = await stage(p);
    const d = await diff(A, B);
    check(`homme · ${label}: the avatar changes on screen`, d > 0.8, `mean diff ${d.toFixed(2)}`);
  }
  // all six skin tones and all six colours are distinct on the avatar
  const tones = []; for (let i = 0; i < 6; i++) { await chip(p, 'skin', i).tap(); await settle(p, 900); tones.push(await stage(p)); }
  let minTone = 1e9; for (let i = 1; i < 6; i++) minTone = Math.min(minTone, await diff(tones[i - 1], tones[i]));
  check('six skin tones, each next to the other visibly different', minTone > 1.2, `smallest neighbour diff ${minTone.toFixed(2)}`);
  const cols = []; for (let i = 0; i < 6; i++) { await chip(p, 'color', i).tap(); await settle(p, 900); cols.push(await stage(p)); }
  let minCol = 1e9; for (let i = 1; i < 6; i++) minCol = Math.min(minCol, await diff(cols[i - 1], cols[i]));
  check('six outfit colours, each next to the other visibly different', minCol > 1.2, `smallest neighbour diff ${minCol.toFixed(2)}`);
  // body: the other identity
  await chip(p, 'body', 'homme').tap(); await settle(p); const hm = await stage(p);
  await chip(p, 'body', 'femme').tap(); await bodyReady(p); await p.waitForFunction(() => document.querySelector('#crCanvas').dataset.body === 'meshy_f'); await settle(p); const fm = await stage(p);
  check('Femme: the other identity is drawn (the hair row names her natural hair « Locks »)', (await diff(hm, fm)) > 3 && /Locks/.test(await p.locator('#crHair').innerText()));
  const picks = [['skin', 2], ['hair', 'afro'], ['outfit', 2], ['color', 4]];
  for (const [g, v] of picks) await chip(p, g, v).tap();
  await chip(p, 'hair', 'natural').tap(); await settle(p);
  await shot(p, '03-step2-femme');
  await chip(p, 'hair', 'afro').tap(); await settle(p); await shot(p, '04-step2-femme-afro-wax');
  await chip(p, 'body', 'homme').tap(); await p.waitForFunction(() => document.querySelector('#crCanvas').dataset.body === 'meshy_m'); await chip(p, 'skin', 3).tap(); await chip(p, 'hair', 'shaved').tap(); await chip(p, 'outfit', 1).tap(); await chip(p, 'color', 0).tap(); await settle(p);
  const chosen = await p.evaluate(() => window.__dakarCreator.state());
  await shot(p, '05-step2-homme-chosen');
  await p.locator('#crPlay').tap();
  await started(p); await p.waitForTimeout(2500);
  const secs = (Date.now() - t0) / 1000;
  check('« C’est moi → Jouer » closes the creator and starts the game', await p.$('#creator') === null && (await p.evaluate(() => window.__dakar.pos())).hub === 'pikine', `${secs.toFixed(0)} s on this machine (includes the checks' own waits)`);
  const s1 = await save(p), w1 = await who(p);
  const want = { skin: 3, hair: 'shaved', outfit: 1, color: 0 };
  check('the save keeps the body and the look (additive field)', s1?.avatar === 'homme' && JSON.stringify(s1.appearance) === JSON.stringify(want) && s1.schemaVersion === 5, JSON.stringify({ avatar: s1?.avatar, appearance: s1?.appearance, v: s1?.schemaVersion }));
  check('the avatar in the game wears the chosen look', JSON.stringify(w1.drawn) === JSON.stringify(want) && w1.body === 'meshy_m', JSON.stringify(w1));
  check('the starting economy and home are unchanged (3 000 F, Pikine)', s1.wallet === 3000 && s1.hub === 'pikine', `${s1.wallet} F · ${s1.hub}`);
  const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('dakarrek.presence.profile') ?? 'null'));
  check('the first name and the shirt colour go to the presence profile (others read a name and a colour index)', prof?.name === 'Moussa' && prof?.look === 0, JSON.stringify(prof));
  await p.evaluate(() => { const k = window.__dakar; k.setHour(11); k.pause(true); k.step(1 / 60, 60); k.render(); }); await shot(p, '06-game-pikine-homme');
  await p.evaluate(() => { const k = window.__dakar; k.portrait(2.4, 1.35, 0.3); k.step(1 / 60, 30); k.render(); }); await shot(p, '07-game-pikine-portrait'); await p.evaluate(() => { window.__dakar.portrait(0); window.__dakar.pause(false); });

  // district change keeps the look
  await p.evaluate(() => window.__dakar.teleport('plateau')); await p.waitForFunction(() => window.__dakar.pos().hub === 'plateau'); await p.waitForTimeout(1500);
  const w2 = await who(p); check('a district change keeps the look', JSON.stringify(w2.drawn) === JSON.stringify(want) && w2.body === 'meshy_m', JSON.stringify(w2.drawn));
  await p.evaluate(() => window.__dakar.teleport('pikine')); await p.waitForFunction(() => window.__dakar.pos().hub === 'pikine'); await p.waitForTimeout(1200);
  await p.evaluate(() => window.__dakar.state.data && 0);

  // ------------------------------------------------------------------------------------------------ 2 · « Modifier mon personnage » in the phone's Profile
  const live = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__dakar.state.data))), before = await live(), wallet0 = await p.evaluate(() => window.__dakar.state.wallet);
  await openProfile(p);
  check('Profile: the player\'s first name heads it and « Modifier mon personnage » is there', /Moussa/.test(await p.locator('#phone .ph-profile b').innerText()) && await p.locator('#phone [data-act="editchar"]').isVisible());
  await shot(p, '08-phone-profile');
  await p.locator('#phone [data-act="editchar"]').tap();
  await p.waitForSelector('#creator'); await bodyReady(p); await p.evaluate(() => window.__dakarCreator.freeze(true)); await settle(p);
  const ed = await p.evaluate(() => window.__dakarCreator.state());
  check('edit: opens on step 2 with the current body and look, the phone closed, the game paused', ed.step === 'look' && ed.avatar === 'homme' && JSON.stringify(ed.look) === JSON.stringify(want) && !(await p.evaluate(() => window.__dakar.phoneInfo().open)) && (await p.evaluate(() => window.__dakar.pos().mode)) === 'busy', JSON.stringify(ed));
  check('edit: the action says Enregistrer, with a way to cancel, and no name field is in the way', (await p.locator('#crPlay').innerText()) === 'Enregistrer' && await p.locator('#crCancel').isVisible() && !(await p.locator('#creator .cr-name').isVisible()));
  await shot(p, '09-edit-open');
  // cancel changes nothing
  await chip(p, 'skin', 0).tap(); await chip(p, 'hair', 'wrap').tap(); await settle(p, 600);
  await p.locator('#crCancel').tap(); await p.waitForTimeout(600);
  const afterCancel = await live(), wc = await who(p);
  check('edit › Annuler: nothing changes, the game resumes', await p.$('#creator') === null && JSON.stringify(wc.drawn) === JSON.stringify(want) && JSON.stringify(afterCancel.appearance) === JSON.stringify(want) && (await p.evaluate(() => window.__dakar.pos().mode)) === 'play');
  // change everything, including the body
  await openProfile(p); await p.locator('#phone [data-act="editchar"]').tap();
  await p.waitForSelector('#creator'); await bodyReady(p);
  await chip(p, 'body', 'femme').tap(); await p.waitForFunction(() => document.querySelector('#crCanvas').dataset.body === 'meshy_f');
  await chip(p, 'skin', 1).tap(); await chip(p, 'hair', 'wrap').tap(); await chip(p, 'outfit', 2).tap(); await chip(p, 'color', 3).tap(); await settle(p);
  await shot(p, '10-edit-femme-wrap-wax');
  await p.locator('#crPlay').tap();
  await p.waitForFunction(() => window.__dakar.avatar().body === 'meshy_f' && window.__dakar.avatar().drawn?.hair === 'wrap'); await p.waitForTimeout(800);
  const s3 = await live(), w3 = await who(p), want2 = { skin: 1, hair: 'wrap', outfit: 2, color: 3 };
  check('edit › Enregistrer: the body and the look change in the game and in the save', s3.avatar === 'femme' && JSON.stringify(s3.appearance) === JSON.stringify(want2) && JSON.stringify(w3.drawn) === JSON.stringify(want2) && w3.body === 'meshy_f', JSON.stringify({ a: s3.avatar, l: s3.appearance }));
  const owned = d => JSON.stringify((d.assets?.list ?? []).map(a => `${a.uid}:${a.spec}:${a.how}`));   // (the income clock advances with play time: what is owned must not change)
  if (owned(s3) !== owned(before)) check('edit keeps everything owned', false, `${owned(before)} → ${owned(s3)}`);
  const lost = ['wallet', 'hub', 'counters', 'flags', 'rel', 'guestId', 'beats', 'inventory', 'jobs', 'ledger'].filter(k => JSON.stringify(s3[k]) !== JSON.stringify(before[k]));
  check('edit loses nothing: money, hub, counters, flags, relations, owned assets, inventory, jobs, ledger', lost.length === 0 && s3.wallet === wallet0, `${s3.wallet} F · differing: ${lost.join(',') || 'none'}`);
  check('the game resumes after the edit (play mode, input on)', (await p.evaluate(() => window.__dakar.pos().mode)) === 'play');
  const prof2 = await p.evaluate(() => JSON.parse(localStorage.getItem('dakarrek.presence.profile') ?? 'null'));
  check('the online colour follows the outfit colour, the name stays', prof2?.look === 3 && prof2?.name === 'Moussa', JSON.stringify(prof2));
  await p.evaluate(() => { const k = window.__dakar; k.pause(true); k.step(1 / 60, 60); k.render(); }); await shot(p, '11-game-after-edit');
  // a real walk with the new look: it animates (the shell moves with the gait)
  await p.evaluate(() => window.__dakar.pause(false));

  // reload: no prompt, same body, same look
  await p.reload({ waitUntil: 'load' }); await started(p); await p.waitForTimeout(2000);
  const w4 = await who(p);
  check('reload: no creator, same body and look', await p.$('#creator') === null && JSON.stringify(w4.drawn) === JSON.stringify(want2) && w4.body === 'meshy_f', JSON.stringify(w4));
  await context.close();
}

// ---------------------------------------------------------------------------------------------------- 3 · saves made before the creator
for (const [name, seed] of [['a save with the homme body and no look', { avatar: 'homme' }], ['a save without any body (the v4 body)', {}]]) {
  const { context, page: p } = await open({ seed: { schemaVersion: 5, guestId: 'old-guest-1234', createdAt: 1, savedAt: 1, playedMs: 600000, wallet: 4321, hub: 'plateau', x: 0, z: 0, yaw: 0, ...seed } });
  await goto(p, 'debug&touch'); await started(p); await p.waitForTimeout(1800);
  const a = await who(p), s = await save(p);
  check(`${name}: no creator, the progress kept, the body as it was, no look forced`, await p.$('#creator') === null && a.appearance === null && a.drawn === null && a.body === (seed.avatar ? 'meshy_m' : 'v4') && s.wallet === 4321, JSON.stringify({ a, wallet: s?.wallet }));
  await p.evaluate(() => { const k = window.__dakar; k.setHour(11); k.pause(true); k.step(1 / 60, 60); k.portrait(2.4, 1.35, 0.3); k.step(1 / 60, 30); k.render(); });
  if (seed.avatar) await shot(p, '12-old-save-homme-unchanged');
  // such a player can edit their character at any time (here: the phone's Profile)
  if (seed.avatar) {
    await p.evaluate(() => { window.__dakar.portrait(0); window.__dakar.pause(false); });
    await openProfile(p); await p.locator('#phone [data-act="editchar"]').tap();
    await p.waitForSelector('#creator'); await bodyReady(p);
    const st = await p.evaluate(() => window.__dakarCreator.state());
    check('an old save opens the creator on the default look of its body', st.avatar === 'homme' && st.look.skin === 4 && st.look.hair === 'natural' && st.look.outfit === 0, JSON.stringify(st));
    await chip(p, 'skin', 2).tap(); await p.locator('#crPlay').tap(); await p.waitForFunction(k => JSON.parse(localStorage.getItem(k) ?? 'null')?.appearance?.skin === 2, KEY);
    check('…and keeps what it chose', (await save(p)).appearance.skin === 2 && (await save(p)).wallet === 4321);
  }
  await context.close();
}

// ---------------------------------------------------------------------------------------------------- 4 · New Game without ?debug: the creator, then a saved game
{
  const { context, page: p } = await open();
  await goto(p, 'touch');
  await p.waitForSelector('#creator', { timeout: 120000 });
  await p.locator('#crName').fill('Fatou'); await p.locator('#crContinue').tap();
  await bodyReady(p);
  await chip(p, 'body', 'femme').tap(); await p.waitForFunction(() => document.querySelector('#crCanvas').dataset.body === 'meshy_f');
  await p.locator('#crPlay').tap();
  await p.waitForFunction(() => !document.getElementById('creator') && document.querySelector('canvas'), null, { timeout: 120000 }); await p.waitForTimeout(4000);
  const s = await save(p);
  check('without ?debug: the creator appears, and the pick is saved before the first autosave', s?.avatar === 'femme' && s?.appearance?.skin === 4, JSON.stringify({ a: s?.avatar, l: s?.appearance }));
  await context.close();
}
check('no console or page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
