// In-game phone checks (desktop and touch phone). Usage: node scripts/check-phone.mjs [baseUrl]
// Needs a running build, e.g. `npx vite preview --port 4201`.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = process.argv[2] ?? 'http://localhost:4201/';
const out = 'docs/screenshots/phone';
await fs.mkdir(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, detail); };
const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
try { await fs.access(exe); launch.executablePath = exe; } catch { /* Playwright's own Chromium */ }
const browser = await chromium.launch(launch);

const APPS = [['portefeuille', 'Portefeuille'], ['carte', 'Carte et déplacements'], ['arene', 'Arène'], ['carnet', 'Carnet'], ['actus', 'Actus · Dakar'], ['sante', 'Santé'], ['profil', 'Profil'], ['horloge', 'Horloge'], ['meteo', 'Météo'], ['calcul', 'Calculatrice'], ['aide', 'Aide'], ['reglages', 'Réglages']];

for (const [label, vp, touch] of [['desktop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('phone-check')) return;
    localStorage.clear(); localStorage.setItem('dakarrek.quality', 'low'); sessionStorage.setItem('phone-check', '1');
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const press = sel => (touch ? page.locator(sel).tap() : page.locator(sel).click());
  const info = () => page.evaluate(() => window.__dakar.phoneInfo());
  const pos = () => page.evaluate(() => window.__dakar.pos());
  const waitPhone = open => page.waitForFunction(o => window.__dakar.phoneInfo().open === o, open, { timeout: 10000 });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos().hub, null, { timeout: 60000 });
  await page.evaluate(() => window.__dakar.setHour(10));
  await page.waitForTimeout(800);

  // Open with the ☰ button: home screen, movement off.
  await press('#menuBtn'); await waitPhone(true);
  let i = await info(), p = await pos();
  check(`${label}: ☰ opens the phone on the home screen`, i.open && i.screen === 'home' && p.mode === 'menu', JSON.stringify({ ...i, mode: p.mode }));
  const status = (await page.locator('#phone .ph-status').innerText()).replace(/\s/g, ' ');
  const balance = (await page.locator('#phone .ph-wid[data-open="portefeuille"]').innerText()).replace(/\s/g, ' ');
  check(`${label}: status bar shows city time, home widget the FCFA balance`, /\d\d:\d\d/.test(status) && / F/.test(balance), `${status} | ${balance}`);
  const tiles = await page.locator('#phone [data-app]').evaluateAll(els => els.map(e => e.dataset.app));
  // A hook app shows exactly when its module registered the hook (economy, NPCs, chat and city merge in over time).
  const HOOK_APPS = { messages: 'openMessages', quartier: 'openPlaces', travail: 'openJobs', maison: 'openHome', habitants: 'openPeople' };
  const hooked = await page.evaluate(names => Object.fromEntries(Object.entries(names).map(([app, hook]) => [app, typeof window.__dakar.phoneHooks[hook] === 'function'])), HOOK_APPS);
  check(`${label}: hook apps shown only with their module`, Object.entries(hooked).every(([app, on]) => tiles.includes(app) === on) && tiles.includes('reglages'), `${tiles.join(',')} · hooks ${JSON.stringify(hooked)}`);
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-home.png` });

  // Movement is disabled while the phone is open.
  const before = await pos();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  const during = await pos();
  check(`${label}: no movement while the phone is open`, Math.hypot(during.x - before.x, during.z - before.z) < 0.05);

  // Every built-in app.
  for (const [app, title] of APPS) {
    await press('#phone [data-nav="home"]');
    await press(`#phone [data-app="${app}"]`);
    const t = await page.locator('#phone .ph-head h2').innerText();
    i = await info();
    check(`${label}: app ${app} opens`, i.screen === app && t === title, t);
    await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${label}-${app}.png` });
  }
  // Carte: current hub highlighted, known places listed, no teleport button.
  await press('#phone [data-nav="home"]'); await press('#phone [data-app="carte"]');
  const map = await page.evaluate(() => ({ here: document.querySelector('#phone .ph-hub.here')?.dataset.hub, hubs: document.querySelectorAll('#phone .ph-hub').length, text: document.querySelector('#phone .ph-screen').innerText }));
  check(`${label}: map highlights the current hub and its places`, map.here === 'pikine' && map.hubs === 4 && map.text.includes('Ma chambre') && map.text.includes('gare des cars rapides'), JSON.stringify({ here: map.here, hubs: map.hubs }));
  // Portefeuille: game money; the history line waits for the economy module's ledger hook.
  await press('#phone [data-nav="home"]'); await press('#phone [data-app="portefeuille"]');
  const wallet = await page.locator('#phone .ph-screen').innerText();
  const hasLedger = await page.evaluate(() => typeof window.__dakar.phoneHooks.ledger === 'function');
  check(`${label}: wallet shows game money and ${hasLedger ? 'the ledger' : 'the pending history line'}`, wallet.includes('monnaie de jeu') && wallet.includes('arrive avec les métiers') !== hasLedger);
  // Back button: Réglages > Aide > back = Réglages.
  await press('#phone [data-nav="home"]'); await press('#phone [data-app="reglages"]'); await press('#phone .ph-screen [data-app="aide"]');
  await press('#phone [data-nav="back"]');
  check(`${label}: back returns to the previous screen`, (await info()).screen === 'reglages');

  // Sound toggle.
  await press('#phone [data-act="sound"]');
  const muted = await page.evaluate(() => ({ i: window.__dakar.phoneInfo().muted, s: localStorage.getItem('dakarrek.sound') }));
  await press('#phone [data-act="sound"]');
  const unmuted = await page.evaluate(() => ({ i: window.__dakar.phoneInfo().muted, s: localStorage.getItem('dakarrek.sound') }));
  check(`${label}: sound toggles off and on (saved)`, muted.i === true && muted.s === 'off' && unmuted.i === false && unmuted.s === 'on', JSON.stringify([muted, unmuted]));
  // Camera sensitivity.
  await press('#phone button[data-sens="1.5"]');
  const sens = (await info()).sensitivity;
  await press('#phone button[data-sens="1"]');
  check(`${label}: camera sensitivity setting`, sens === 1.5 && (await info()).sensitivity === 1);
  // Nouvelle partie asks for confirmation; Annuler keeps the game.
  await press('#phone [data-act="new"]');
  const confirmText = await page.locator('#phone .ph-screen').innerText();
  await press('#phone [data-act="cancel"]');
  check(`${label}: new game asks for confirmation`, confirmText.includes('définitive') && (await info()).screen === 'reglages');
  // Save now.
  await press('#phone [data-act="save"]');
  await page.waitForTimeout(200);
  check(`${label}: save now`, (await page.locator('#toast').innerText()).includes('sauvegardée'));

  // Escape closes the phone and movement works again.
  await page.keyboard.press('Escape'); await waitPhone(false);
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => window.__dakar.place(-6, -30, 0));
  const a = await pos();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  const b = await pos();
  check(`${label}: Escape closes the phone, then W moves the player`, a.mode === 'play' && Math.hypot(b.x - a.x, b.z - a.z) > 0.5, `moved ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(2)}`);
  // Escape/M open it again where it was left (navigation kept).
  await page.keyboard.press('KeyM'); await waitPhone(true);
  check(`${label}: M reopens on the last app`, (await info()).screen === 'reglages');
  await page.keyboard.press('Escape'); await waitPhone(false);

  // Quality change inside a room keeps the player inside, and the exit still works.
  await page.evaluate(() => window.__dakar.enter('home'));
  await page.waitForFunction(() => window.__dakar.pos().x > 900, null, { timeout: 10000 });
  await press('#menuBtn'); await waitPhone(true);
  await press('#phone button[data-q="medium"]');
  await page.waitForTimeout(500);
  const inRoom = await pos(); i = await info();
  check(`${label}: quality change inside the room keeps the player inside`, inRoom.x > 900 && i.quality === 'medium' && i.open, JSON.stringify({ x: inRoom.x.toFixed(1), q: i.quality }));
  await page.screenshot({ path: `${out}/${label}-reglages-interior.png` });
  await press('#phone [data-nav="close"]'); await waitPhone(false);
  await page.evaluate(() => window.__dakar.exit());
  await page.waitForFunction(() => window.__dakar.pos().x < 900, null, { timeout: 10000 }).catch(() => {});
  const outside = await pos();
  check(`${label}: exit still leads to the street after the change`, outside.x < 900 && outside.hub === 'pikine' && outside.mode === 'play', JSON.stringify(outside));
  await page.evaluate(() => window.__dakar.phone('reglages'));
  await press('#phone button[data-q="low"]'); await page.evaluate(() => window.__dakar.phoneClose());

  // Apps from other lanes: tile appears with its hook, closes the phone and hands over.
  await page.evaluate(() => {
    const h = window.__dakar.phoneHooks;
    window.__realHooks = { openMessages: h.openMessages, ledger: h.ledger, arenaProfile: h.arenaProfile };
    h.openMessages = () => { window.__msg = (window.__msg ?? 0) + 1; };
    h.ledger = () => [{ at: Date.now() - 60000, label: 'Dibi mouton', amount: -2000 }, { at: Date.now(), label: 'Service au garage', amount: 2800 }];
    h.arenaProfile = () => [{ label: 'Catégorie', value: 'Poids léger' }];
  });
  await page.evaluate(() => window.__dakar.phone('home'));
  await press('#phone [data-app="messages"]');
  const handed = await page.evaluate(() => ({ msg: window.__msg, open: window.__dakar.phoneInfo().open, mode: window.__dakar.pos().mode }));
  check(`${label}: Messages tile closes the phone and calls its hook`, handed.msg === 1 && !handed.open && handed.mode === 'play', JSON.stringify(handed));
  await page.evaluate(() => window.__dakar.phone('portefeuille'));
  const ledger = (await page.locator('#phone .ph-screen').innerText()).replace(/\s/g, ' ');
  await page.evaluate(() => window.__dakar.phone('arene'));
  const arena = await page.locator('#phone .ph-screen').innerText();
  check(`${label}: ledger and arena profile hooks are shown`, ledger.includes('Service au garage') && ledger.includes('2 800 F') && arena.includes('Poids léger') && arena.includes('Victoires'));
  await page.evaluate(() => { const h = window.__dakar.phoneHooks; for (const [k, f] of Object.entries(window.__realHooks)) { if (f) h[k] = f; else delete h[k]; } });

  // Debug journal() opens the Carnet; Escape closes it.
  await page.evaluate(() => window.__dakar.phoneClose());
  await page.evaluate(() => window.__dakar.journal());
  i = await info();
  check(`${label}: __dakar.journal() opens the Carnet`, i.open && i.screen === 'carnet');
  await page.keyboard.press('Escape'); await waitPhone(false);
  check(`${label}: Escape closes the Carnet`, !(await info()).open && (await pos()).mode === 'play');

  if (touch) {
    // A held joystick must not keep walking after the phone opened and closed.
    await page.evaluate(() => window.__dakar.place(-6, -30, 0));
    const joy = await page.locator('#joy').boundingBox();
    const x = joy.x + joy.width / 2, y = joy.y + joy.height / 2 - 35;
    await page.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: x, clientY: y })), [x, y]);
    await page.waitForTimeout(500);
    await page.locator('#menuBtn').tap(); await waitPhone(true);
    await page.locator('#phone [data-nav="close"]').tap(); await waitPhone(false);
    const s0 = await pos(); await page.waitForTimeout(1000); const s1 = await pos();
    check('phone: opening the phone releases a held joystick', Math.hypot(s1.x - s0.x, s1.z - s0.z) < 0.15);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 7 })));
    // Landscape.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.__dakar.phone('home')); await page.waitForTimeout(300);
    const box = await page.locator('#phone .ph-device').boundingBox();
    check('phone: landscape device fits the screen', box.height <= 390 && box.width <= 844 && box.width > box.height, JSON.stringify(box));
    await page.screenshot({ path: `${out}/phone-landscape-home.png` });
    await page.evaluate(() => window.__dakar.phone('reglages')); await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/phone-landscape-reglages.png` });
    await page.evaluate(() => window.__dakar.phoneClose());
    await page.setViewportSize(vp);
  } else {
    // Nouvelle partie really wipes the device save (desktop only).
    await page.evaluate(() => { window.__dakar.state.data.wallet = 4321; });
    await page.evaluate(() => window.__dakar.phone('reglages'));
    await press('#phone [data-act="save"]');
    await press('#phone [data-act="new"]');
    await Promise.all([page.waitForEvent('load'), press('#phone [data-act="wipe"]')]);
    await page.waitForFunction(() => window.__dakar?.pos().hub, null, { timeout: 60000 });
    const fresh = await page.evaluate(() => window.__dakar.state.data.wallet);
    check('desktop: new game after confirmation starts from a fresh save', fresh !== 4321, `wallet ${fresh}`);
  }
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
const failed = checks.filter(c => !c.ok);
await fs.writeFile(`${out}/results.json`, JSON.stringify(checks, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
