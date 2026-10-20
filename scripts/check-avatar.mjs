// New Game choice of the player's body (now inside the character creator, src/ui/characterCreator.ts; src/actors/playerBody.ts): the choice screen, the identity kept in the v5
// save, reload, New Game, saves made before the choice (they keep the v4 body, no prompt), the light body files on the low preset, the
// v4 stand-in for the ngemb preview and the emotes, the fallback when the Meshy files cannot be loaded, the phone layouts, and a short
// play on each identity. Usage: node scripts/check-avatar.mjs [baseUrl=http://localhost:4310/] [outDir=docs/meshy/proof/avatar]
// Serve a build first: npx vite build --outDir /tmp/dist && npx vite preview --outDir /tmp/dist --port 4310.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4310/';
const out = process.argv[3] ?? 'docs/meshy/proof/avatar';
fs.mkdirSync(out, { recursive: true });
const KEY = 'dakarrek.guest.save.v5', LEGACY = 'dakarrek.guest.save';
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const errors = [];
const open = async ({ viewport = { width: 1280, height: 800 }, touch = false, seed = null, quality = null, abort = false } = {}) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  // seed storage once (a reload must not overwrite what the game saved)
  await context.addInitScript(([seed, quality]) => {
    try {
      if (!localStorage.getItem('__seeded')) {
        localStorage.setItem('__seeded', '1');
        if (seed?.v5) localStorage.setItem('dakarrek.guest.save.v5', JSON.stringify(seed.v5));
        if (seed?.legacy) localStorage.setItem('dakarrek.guest.save', JSON.stringify(seed.legacy));
        if (quality) localStorage.setItem('dakarrek.quality', quality);
      }
    } catch { /* */ }
  }, [seed, quality]);
  const page = await context.newPage();
  const requests = []; page.on('request', r => { if (/assets\/meshy\//.test(r.url())) requests.push(r.url().split('/').pop()); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !(abort && /Failed to load resource/.test(m.text()))) errors.push(`console: ${m.text()}`); });
  if (abort) await page.route('**/assets/meshy/*.glb', r => r.abort());
  return { context, page, requests };
};
const started = p => p.waitForFunction(() => window.__dakar?.pos?.().hub, null, { timeout: 180000 });
const goto = (p, query) => p.goto(`${base}?${query}`, { waitUntil: 'load', timeout: 180000 });
const save = p => p.evaluate(k => { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }, KEY);
const who = p => p.evaluate(() => window.__dakar.avatar());
/** New Game now goes through the character creator (src/ui/characterCreator.ts; its own checks: scripts/check-creator.mjs): a name, the body, the one action. */
const choose = async (p, id) => {
  await p.waitForSelector('#creator', { timeout: 120000 });
  await p.fill('#crName', 'Test'); await p.click('#crContinue'); await p.waitForSelector('#crCanvas');
  if (id === 'femme') await p.click('#creator .cr-chip[data-g="body"][data-v="femme"]');
  await p.click('#crPlay');
};
const shot = async (p, name) => { await p.waitForTimeout(500); try { await p.screenshot({ path: `${out}/${name}.png` }); } catch { /* */ } };

// 1 — a new game shows the choice, which cannot be dismissed, and nothing is saved before it is made
{
  const { context, page: p } = await open();
  await goto(p, 'debug&avatar=choisir');
  await p.waitForSelector('#creator', { timeout: 120000 });
  check('New Game: the creator opens on the first name (step 1)', await p.locator('#crName').isVisible() && await p.$eval('#creator', e => e.dataset.step === 'name'));
  check('New Game: the dialog is announced and named', await p.$eval('#creator', e => e.getAttribute('role') === 'dialog' && e.getAttribute('aria-modal') === 'true' && !!document.getElementById(e.getAttribute('aria-labelledby'))));
  await p.keyboard.press('Escape'); await p.mouse.click(5, 5); await p.waitForTimeout(300);
  check('the creator stays on Escape and on a tap outside', await p.$('#creator') !== null);
  const pre = await p.evaluate(() => ({ hub: window.__dakar.pos().hub ?? null, keys: Object.keys(localStorage).filter(k => k.startsWith('dakarrek')), identity: window.__dakar.avatar().identity }));
  check('nothing is saved and the world is not loaded before the choice', pre.hub === null && !pre.keys.includes(KEY) && pre.identity === null, JSON.stringify(pre));
  await shot(p, 'desktop-choice');
  await choose(p, 'femme');
  await started(p); await p.waitForTimeout(1500);
  check('after the choice the overlay is gone and the game runs', await p.$('#creator') === null);
  let a = await who(p), s = await save(p);
  check('the femme is the player\'s body (Meshy femme)', a.identity === 'femme' && a.body === 'meshy_f' && a.expected === 'meshy_f', JSON.stringify(a));
  check('the identity is in the v5 save at once, same schema, same key', s?.avatar === 'femme' && s.schemaVersion === 5, JSON.stringify({ avatar: s?.avatar, v: s?.schemaVersion }));
  const keysNow = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dakarrek')));
  check('no other storage key was added (the identity and the look live in the v5 save; the first name in the existing presence profile)', keysNow.every(k => [KEY, 'dakarrek.quality', 'dakarrek.phone.places', 'dakarrek.presence.profile'].includes(k)), JSON.stringify(keysNow));
  await shot(p, 'desktop-femme-street');
  const guest = s.guestId;
  // 2 — reload keeps it, with or without the test link
  await p.reload({ waitUntil: 'load' }); await started(p); await p.waitForTimeout(1200);
  a = await who(p);
  check('reload: no prompt, same identity and body', await p.$('#creator') === null && a.identity === 'femme' && a.body === 'meshy_f', JSON.stringify(a));
  await goto(p, 'debug'); await started(p); await p.waitForTimeout(1200);
  a = await who(p); s = await save(p);
  check('another link on the same device: still the femme, same game', a.body === 'meshy_f' && s.guestId === guest, JSON.stringify({ a, same: s.guestId === guest }));
  // 3 — New Game from the phone: the save goes, the choice returns, the other identity can be taken
  await p.keyboard.press('Escape'); await p.locator('[data-app="reglages"]').first().click(); await p.locator('[data-act="new"]').click();
  await Promise.all([p.waitForEvent('load'), p.locator('[data-act="wipe"]').click()]);
  await p.goto(`${base}?debug&avatar=choisir`, { waitUntil: 'load' });
  await p.waitForSelector('#creator', { timeout: 120000 });
  check('New Game from the phone: the save is gone and the choice is offered again', (await save(p)) === null);
  await choose(p, 'homme'); await started(p); await p.waitForTimeout(1500);
  a = await who(p); s = await save(p);
  check('the new game takes the other identity (homme)', a.identity === 'homme' && a.body === 'meshy_m' && s.avatar === 'homme' && s.guestId !== guest && s.wallet === 3000, JSON.stringify({ a, wallet: s.wallet }));
  const career = await p.evaluate(() => { const d = window.__dakar.state.data; return { bouts: d.career.bouts.length, fav: d.career.fav ?? null, wrestlerFlags: d.flags.filter(f => /lutt|wrestl|ecurie|career|carriere/i.test(f)), at: window.__dakar.pos().hub }; });
  check('the pick forces no career: no bout, no followed wrestler, no career flag, the game starts in the open city', career.bouts === 0 && career.fav === null && career.wrestlerFlags.length === 0 && !!career.at, JSON.stringify(career));
  await shot(p, 'desktop-homme-street');
  await context.close();
}

// 4 — saves made before the choice: no prompt, v4 body, nothing lost
for (const [name, seed] of [['a v5 save without the field', { v5: { schemaVersion: 5, guestId: 'g-before', wallet: 4321, playedMs: 90000, flags: ['met_ibou'] } }],
  ['a legacy v3 save', { legacy: { schemaVersion: 3, guestId: 'g-v3', wallet: 5555, playedMs: 70000, hub: 'pikine', x: 0, z: 0, yaw: 0, needs: { faim: 50, energie: 50, moral: 50, social: 50, hygiene: 50 }, counters: {}, rel: {}, flags: [], beats: {} } }]]) {
  const { context, page: p } = await open({ seed });
  await goto(p, 'debug&avatar=choisir'); await started(p); await p.waitForTimeout(1500);
  const a = await who(p), w = await p.evaluate(() => window.__dakar.state.data.wallet);
  check(`${name}: no prompt, the v4 body, the progress kept`, await p.$('#creator') === null && a.identity === null && a.body === 'v4' && [4321, 5555].includes(w), JSON.stringify({ a, wallet: w }));
  await p.evaluate(() => window.__dakar.phone('reglages')); await p.keyboard.press('Escape');
  await p.evaluate(() => window.__dakar.state.data.wallet += 0);
  await context.close();
}

// 5 — a production-like start (no ?debug, no test link): the choice appears and a pick starts the game
{
  const { context, page: p } = await open();
  await p.goto(base, { waitUntil: 'load' });
  await choose(p, 'homme');
  await p.waitForFunction(k => { const s = localStorage.getItem(k); return !!s && JSON.parse(s).avatar === 'homme'; }, KEY, { timeout: 60000 });
  await p.waitForTimeout(2500);
  check('without ?debug: the creator appears, the pick is saved and the game starts', await p.$('#creator') === null && (await p.$('canvas')) !== null);
  await context.close();
}

// 6 — the light body files on the low preset, the full ones otherwise, reloaded when the class changes
{
  const seed = { v5: { schemaVersion: 5, guestId: 'g-q', avatar: 'femme' } };
  const { context, page: p, requests } = await open({ seed, quality: 'low' });
  await goto(p, 'debug'); await started(p); await p.waitForTimeout(1500);
  check('low preset: the light femme file only', requests.includes('body_f_low.glb') && !requests.includes('body_f.glb'), requests.join(','));
  const before = await p.evaluate(() => { window.__q = window.__dakar.body(); return window.__dakar.avatar(); });
  await p.evaluate(() => window.__dakar.phone('reglages')); await p.locator('#phone button[data-q="high"]').click(); await p.waitForFunction(() => window.__dakar.body() !== window.__q, null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({ a: window.__dakar.avatar(), rebuilt: window.__dakar.body() !== window.__q }));
  check('switching to high: the full file is loaded and the body rebuilt, same identity', requests.includes('body_f.glb') && after.rebuilt && after.a.body === 'meshy_f' && before.body === 'meshy_f', JSON.stringify({ requests, after }));
  await context.close();
}

// 7 — the v4 stand-in for the ngemb preview and the emotes (a Meshy body is dressed: no ngemb)
{
  const { context, page: p } = await open({ seed: { v5: { schemaVersion: 5, guestId: 'g-e', avatar: 'homme' } } });
  await goto(p, 'debug'); await started(p); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__dakar.teleport('pikine'); window.__dakar.pause(true); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__dakar.emote(0); window.__dakar.step(1 / 60, 30); });
  const during = await p.evaluate(() => ({ a: window.__dakar.avatar(), meshyShown: window.__dakar.body().group.visible }));
  check('emote on a Meshy body: a v4 body in ngemb stands in, the Meshy body is hidden', during.a.stand === 'v4' && during.meshyShown === false, JSON.stringify(during));
  await shot(p, 'desktop-emote-standin');
  await p.evaluate(() => window.__dakar.step(1 / 60, 60 * 9));
  const after = await p.evaluate(() => ({ a: window.__dakar.avatar(), meshyShown: window.__dakar.body().group.visible }));
  check('after the emote the Meshy body is back and the stand-in is gone', after.a.stand === null && after.meshyShown === true && after.a.body === 'meshy_m', JSON.stringify(after));
  await context.close();
}

// 8 — the Meshy files cannot be loaded: the game still starts, on the v4 body, and the identity is kept
{
  const { context, page: p } = await open({ seed: { v5: { schemaVersion: 5, guestId: 'g-f', avatar: 'femme' } }, abort: true });
  await goto(p, 'debug'); await started(p); await p.waitForTimeout(1500);
  const a = await who(p), s = await save(p);
  check('files unreachable: the game starts on the v4 body, the identity stays in the save', a.body === 'v4' && a.identity === 'femme' && s.avatar === 'femme', JSON.stringify(a));
  await context.close();
}

// 9 — phone layouts: the creator's two steps fit the screen in both orientations, every control at least 44 px, a tap picks
for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  const { context, page: p } = await open({ viewport, touch: true });
  await goto(p, 'debug&touch&avatar=choisir');
  await p.waitForSelector('#creator', { timeout: 120000 });
  check(`phone ${label}: step 1 fits (name, suggestions, Continue) with no scrolling`, await p.evaluate(() => { const c = document.getElementById('creator'), r = document.getElementById('crContinue').getBoundingClientRect(); return c.scrollHeight <= innerHeight + 1 && c.scrollWidth <= innerWidth + 1 && r.bottom <= innerHeight; }));
  await p.fill('#crName', 'Awa'); await p.tap('#crContinue'); await p.waitForSelector('#crCanvas');
  const boxes = await p.$$eval('#creator .cr-chip, #crPlay', els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const inside = boxes.every(b => b.x >= 0 && b.x + b.w <= viewport.width && b.y >= 0 && b.y + b.h <= viewport.height && b.w >= 43.5 && b.h >= 43.5);
  check(`phone ${label}: step 2: every choice inside the screen and at least 44 px`, boxes.length === 22 && inside, JSON.stringify(boxes.filter(b => b.y + b.h > viewport.height || b.h < 43.5).slice(0, 3)));
  check(`phone ${label}: step 2: no scrolling`, await p.evaluate(() => { const c = document.getElementById('creator'); return c.scrollHeight <= innerHeight + 1 && c.scrollWidth <= innerWidth + 1; }));
  await p.waitForFunction(() => !!document.querySelector('#crCanvas').dataset.body, null, { timeout: 120000 }); await p.waitForTimeout(1200);
  await shot(p, `phone-${label}-creator`);
  await p.tap('#creator .cr-chip[data-g="body"][data-v="femme"]'); await p.tap('#crPlay');
  await started(p); await p.waitForTimeout(1200);
  const a = await who(p);
  check(`phone ${label}: a tap on Femme, then on the one action, plays her`, a.identity === 'femme' && a.body === 'meshy_f', JSON.stringify(a));
  if (label === 'portrait') await shot(p, 'phone-portrait-femme-street');
  await context.close();
}

// 10 — a short play on each identity: walk, run, stop, with the game's own input; the soles stay on the ground
for (const id of ['homme', 'femme']) {
  const { context, page: p } = await open({ seed: { v5: { schemaVersion: 5, guestId: 'g-p' + id, avatar: id } } });
  await goto(p, 'debug'); await started(p); await p.waitForTimeout(1500);
  await p.evaluate(() => { const k = window.__dakar; k.setHour(10); k.teleport('pikine'); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__dakar.pause(true));
  await p.keyboard.down('KeyW'); await p.evaluate(() => window.__dakar.step(1 / 60, 90));
  const walking = await p.evaluate(() => { const g = window.__dakar.gait(); return { moving: g?.moving, clip: g?.clip, slipped: g?.feet?.map(f => f.slipped) }; });
  await p.keyboard.down('ShiftLeft'); await p.evaluate(() => window.__dakar.step(1 / 60, 120));
  const running = await p.evaluate(() => { const g = window.__dakar.gait(); return { moving: g?.moving, clip: g?.clip, speed: +(g?.speed ?? 0).toFixed(2) }; });
  await p.keyboard.up('ShiftLeft'); await p.keyboard.up('KeyW'); await p.evaluate(() => window.__dakar.step(1 / 60, 150));
  const stopped = await p.evaluate(() => { const g = window.__dakar.gait(); return { moving: g?.moving ?? false, clip: window.__dakar.body().clipName }; });
  check(`${id}: walks, runs and stops with the game's input`, walking.moving && running.moving && running.speed > 2.5 && !stopped.moving && stopped.clip === 'Idle', JSON.stringify({ walking, running, stopped }));
  await context.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, results }, null, 1));
console.log(failed ? `${failed} avatar checks FAILED` : `${results.length}/${results.length} avatar checks passed`);
process.exit(failed ? 1 : 0);
