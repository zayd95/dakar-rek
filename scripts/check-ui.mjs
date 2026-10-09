// UI checks (docs/UI.md): HUD layout and touch targets, every way of closing a sheet gives the controls back, quick
// actions with disabled reasons, activities and plain timed actions and làmb scenes can be stopped, the focus ring and
// the way-finding pin, stacked toasts, the wallet animation. Desktop, phone portrait and phone landscape.
// Usage: node scripts/check-ui.mjs [baseUrl] [outDir] [views]   (needs a running build, e.g. `npx vite preview --port 4211`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4211/';
const out = process.argv[3] ?? 'docs/screenshots/ui';
const only = (process.argv[4] ?? '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 90000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const views = [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true], ['landscape', { width: 844, height: 390 }, true]];
for (const [label, viewport, touch] of views.filter(v => !only.length || only.includes(v[0]))) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* private mode */ } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const mode = async () => (await d(() => window.__dakar.pos())).mode;
  const isOpen = () => d(() => document.getElementById('modal').classList.contains('on'));
  const rect = sel => d(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }, sel);
  const settle = () => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 15000 }).catch(() => {});
  const playAgain = async () => {
    const ok = await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && !document.getElementById('modal').classList.contains('on'), null, { timeout: 20000 }).then(() => true, () => false);
    await page.waitForTimeout(600);                        // nothing else may open on the way out (the phone, another sheet)
    return ok && (await d(() => window.__dakar.pos().mode === 'play' && !document.querySelector('#modal.on') && !document.querySelector('#phone.on')));
  };
  /** Walk for a moment (keyboard or the touch stick; backwards first, the player usually faces a counter) and say whether the character moved. */
  const walks = async () => {
    for (const dir of [1, -1]) {
      const a = await d(() => window.__dakar.pos());
      if (touch) {
        const j = await rect('#joy'); const x = j.left + j.width / 2, y = j.top + j.height / 2 + 35 * dir;
        await d(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 31, clientX: x, clientY: y })), [x, y]);
        await page.waitForFunction(p => Math.hypot(window.__dakar.pos().x - p.x, window.__dakar.pos().z - p.z) > 0.4, a, { timeout: 15000 }).catch(() => {});
        await d(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 31 })));
      } else {
        const key = dir > 0 ? 'KeyS' : 'KeyW';
        await page.keyboard.down(key);
        await page.waitForFunction(p => Math.hypot(window.__dakar.pos().x - p.x, window.__dakar.pos().z - p.z) > 0.4, a, { timeout: 15000 }).catch(() => {});
        await page.keyboard.up(key);
      }
      const b = await d(() => window.__dakar.pos());
      if (Math.hypot(b.x - a.x, b.z - a.z) > 0.4) return true;
    }
    return false;
  };

  // 1. Layout: the HUD chips never overlap, stay on screen, and the buttons are at least 44 px.
  await d(() => { window.__dakar.setHour(12); window.__dakar.teleport('pikine', -6, -30, 0); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  const chips = {}; for (const s of ['#stats', '#place', '#menuBtn', '#goal']) chips[s] = await rect(s);
  const pairs = [['#stats', '#place'], ['#stats', '#menuBtn'], ['#place', '#menuBtn'], ['#goal', '#place'], ['#goal', '#menuBtn']].filter(([a, b]) => chips[a]?.width && chips[b]?.width);
  const clash = pairs.filter(([a, b]) => overlap(chips[a], chips[b])).map(p => p.join('/'));
  check(`${label}: HUD chips do not overlap`, clash.length === 0, clash.join(', ') || JSON.stringify(chips));
  const off = Object.entries(chips).filter(([, r]) => r?.width && (r.left < 0 || r.top < 0 || r.right > viewport.width || r.bottom > viewport.height)).map(([s]) => s);
  check(`${label}: HUD chips are on screen`, off.length === 0, off.join(','));
  const menuBtn = await rect('#menuBtn');
  check(`${label}: phone button is a 44 px target`, menuBtn.width >= 44 && menuBtn.height >= 44, `${menuBtn.width}×${menuBtn.height}`);

  // 2. A place in focus: ring on the ground, primary verb with its icon, « ⋯ » 44 px or more.
  await d(() => { window.__dakar.teleport('almadies'); window.__dakar.state.data.wallet = 700; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, T);
  const juice = (await d(() => window.__dakar.cityPlaces())).find(p => p.name === 'Jus & Go');
  await d(p => window.__dakar.place(p.x, p.z, Math.PI), juice);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Jus & Go' && window.__dakar.uiMarkers().focus, null, T).catch(() => {});
  const mk = await d(() => window.__dakar.uiMarkers());
  check(`${label}: the focused place has a ring on the ground`, mk.focus && Math.hypot(mk.focusAt.x - juice.x, mk.focusAt.z - juice.z) < 0.01, JSON.stringify(mk));
  await settle();
  const act = await rect('#act'), more = await rect('#actMore');
  const actText = await d(() => document.getElementById('act').textContent);
  check(`${label}: action button shows the verb with its icon, 60 px tall`, act.height >= 56 && /Jus & Go/.test(actText) && !!(await d(() => document.querySelector('#act .a-ic'))), `${act.width}×${act.height} ${actText}`);
  check(`${label}: « ⋯ » is a 44 px target above the action button`, more.width >= 44 && more.height >= 44 && more.bottom <= act.top, `${more.width}×${more.height}`);
  check(`${label}: action area clear of the joystick`, !touch || !overlap(act, await rect('#joy')));

  // 3. Every way of closing a sheet gives the controls back.
  const openSheet = async () => { await d(() => window.__dakar.act()); await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {}); await settle(); return (await isOpen()) && (await mode()) === 'menu'; };
  check(`${label}: the place sheet opens in menu mode`, await openSheet());
  const sheet = await rect('#modal .sheet');
  if (label === 'phone') check(`${label}: bottom sheet anchored at the bottom, at most ~56 % high`, Math.abs(sheet.bottom - viewport.height) < 2 && sheet.height <= viewport.height * 0.57 && sheet.left === 0, JSON.stringify(sheet));
  else check(`${label}: sheet on the right, clear of the character in the centre`, sheet.left > viewport.width / 2 - 10 && sheet.bottom <= viewport.height && sheet.top >= 0, JSON.stringify(sheet));
  await page.screenshot({ timeout: 120000, path: `${out}/check-${label}-sheet.png` });
  const rows = await d(() => [...document.querySelectorAll('#modal .list .item')].map(b => b.getBoundingClientRect().height));
  check(`${label}: sheet rows are at least 44 px`, rows.length > 0 && rows.every(h => h >= 44), rows.join(','));
  await page.keyboard.press('Escape');
  check(`${label}: Escape closes the sheet and gives the controls back`, await playAgain());
  await openSheet();
  const s2 = await rect('#modal .sheet');
  const outside = label === 'phone' ? [viewport.width / 2, 60] : [Math.max(10, s2.left - 60), viewport.height / 2];
  if (touch) await page.touchscreen.tap(outside[0], outside[1]); else await page.mouse.click(outside[0], outside[1]);
  check(`${label}: tapping outside closes it and gives the controls back`, await playAgain());
  await openSheet();
  await page.locator('#modal .item.close').click();
  check(`${label}: « ✕ » closes it and gives the controls back`, await playAgain());
  await openSheet();
  await page.keyboard.press('KeyM');
  check(`${label}: the menu key closes it and gives the controls back`, await playAgain());
  if (label === 'phone') {
    await openSheet();
    const top = await rect('#modal .sh-top'); const x = top.left + top.width / 2, y = top.top + 12;
    await d(([x, y]) => {
      const t = document.querySelector('#modal .sh-top'), opts = (cy) => ({ bubbles: true, pointerType: 'touch', pointerId: 41, clientX: x, clientY: cy });
      t.dispatchEvent(new PointerEvent('pointerdown', opts(y)));
      for (let k = 1; k <= 6; k++) t.dispatchEvent(new PointerEvent('pointermove', opts(y + k * 30)));
      t.dispatchEvent(new PointerEvent('pointerup', opts(y + 180)));
    }, [x, y]);
    check(`${label}: swiping the sheet down closes it and gives the controls back`, await playAgain());
  }
  check(`${label}: after the sheets, the character walks`, await walks());

  // 4. « ⋯ »: icon grid near the action button; a disabled tile says why; tapping outside gives control back.
  await d(p => window.__dakar.place(p.x, p.z, Math.PI), juice);
  await page.waitForFunction(() => window.__dakar.focus()?.name === 'Jus & Go', null, T).catch(() => {});
  await d(() => window.__dakar.more());
  await page.waitForFunction(() => document.querySelector('#modal.on[data-kind="quick"]'), null, T).catch(() => {});
  await settle();
  const tiles = await d(() => [...document.querySelectorAll('#modal .item.tile')].map(t => ({ text: t.textContent, dis: t.classList.contains('dis'), h: t.getBoundingClientRect().height })));
  check(`${label}: « ⋯ » shows the target's actions as tiles with prices`, tiles.length >= 3 && tiles.some(t => /−500 F/.test(t.text)) && tiles.every(t => t.h >= 44), JSON.stringify(tiles.map(t => t.text)));
  const q = await rect('#modal .sheet');
  check(`${label}: quick actions sit in the bottom-right thumb zone`, q.right >= viewport.width - 30 && q.bottom >= viewport.height * 0.6, JSON.stringify(q));
  await page.screenshot({ timeout: 120000, path: `${out}/check-${label}-quick.png` });
  await page.locator('#modal .item.tile.dis').first().click({ force: true });   // aria-disabled: Playwright would wait for « enabled »
  await page.waitForFunction(() => /argent/.test(document.getElementById('toast').textContent), null, { timeout: 10000 }).catch(() => {});
  check(`${label}: a disabled tile says why (« Pas assez d’argent »)`, /Pas assez d’argent/.test(await d(() => document.getElementById('toast').textContent)) && (await isOpen()));
  if (touch) await page.touchscreen.tap(30, viewport.height * 0.3); else await page.mouse.click(30, viewport.height * 0.3);
  check(`${label}: tapping outside the quick actions gives the controls back`, await playAgain());

  // 5. Activities: progress pill near the button; Escape and « Arrêter » stop them and give the controls back.
  await d(() => { window.__dakar.teleport('pikine'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await d(() => window.__dakar.enter('maiga'));
  await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T).catch(() => {});
  const counter = (await d(() => window.__dakar.roomInteractables())).find(i => /counter/.test(i.id));
  const order = async () => {
    await d(() => { const s = window.__dakar.state; s.data.wallet = 3000; s.data.needs.faim = 30; });
    await d(p => window.__dakar.place(p.x - 0.6, p.z, Math.PI / 2), counter);
    await page.waitForFunction(() => /:counter$/.test(window.__dakar.focus()?.id ?? ''), null, T).catch(() => {});
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await page.locator('#modal .item', { hasText: 'Riz au poisson' }).first().click();
    return page.waitForFunction(() => window.__dakar.activity()?.step === 'Préparation', null, T).then(() => true, () => false);
  };
  if (counter) {
    check(`${label}: an activity starts`, await order());
    await page.waitForFunction(() => document.querySelector('#progress.on'), null, { timeout: 10000 }).catch(() => {});
    await settle();
    const pill = await rect('#progress'), btn = await rect('#act');
    const pillText = await d(() => document.getElementById('progress').textContent);
    check(`${label}: progress pill above the « Arrêter » button`, pill.width > 0 && pill.bottom <= btn.top + 1 && Math.abs(pill.right - btn.right) < 4 && /Riz au poisson/.test(pillText) && /Arrêter/.test(await d(() => document.getElementById('act').textContent)), `${pillText} ${JSON.stringify(pill)}`);
    await page.screenshot({ timeout: 120000, path: `${out}/check-${label}-activity.png` });
    await page.keyboard.press('Escape');
    const stopped = await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, { timeout: 15000 }).then(() => true, () => false);
    check(`${label}: Escape stops the activity and gives the controls back`, stopped && !(await d(() => document.querySelector('#progress.on'))));
    check(`${label}: an activity starts again`, await order());
    if (touch) await page.locator('#act').tap(); else await page.locator('#act').click();
    check(`${label}: « Arrêter » stops it and gives the controls back`, await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, { timeout: 15000 }).then(() => true, () => false));
    await d(() => window.__dakar.stand());
    await d(() => window.__dakar.exit());
    await page.waitForFunction(() => window.__dakar.pos().x < 900, null, T).catch(() => {});
  }

  // 6. A plain timed action (content without steps) can be stopped too, without pay or cost.
  await d(() => { window.__dakar.teleport('corniche'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche', null, T);
  const fishing = (await d(() => window.__dakar.cityPlaces())).find(p => p.id.endsWith(':soumbedioune'));
  if (fishing) {
    await d(p => { const g = window.__dakar; g.place(p.x, p.z, Math.PI / 2); g.state.data.needs.energie = 100; }, fishing);
    await page.waitForFunction(() => window.__dakar.nearestInteractable()?.startsWith('Soumbédioune'), null, T).catch(() => {});
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    const w0 = await d(() => window.__dakar.state.wallet);
    await page.getByRole('button', { name: /^Débarquer les caisses de poisson/ }).click();
    await page.waitForFunction(() => document.querySelector('#progress.on') && /Arrêter/.test(document.getElementById('act').textContent), null, { timeout: 15000 }).catch(() => {});
    check(`${label}: a plain timed action shows « Arrêter »`, /Arrêter/.test(await d(() => document.getElementById('act').textContent)));
    await page.keyboard.press('Escape');
    const ok = await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && !document.querySelector('#progress.on'), null, { timeout: 15000 }).then(() => true, () => false);
    await page.waitForTimeout(800);
    check(`${label}: Escape stops it, no pay, controls back`, ok && (await d(() => window.__dakar.state.wallet)) === w0 && (await walks()));
  }

  // 7. A làmb scene can be left from its banner.
  await d(() => { window.__dakar.teleport('pikine'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await d(() => window.__dakar.scene('watch'));
  await page.waitForFunction(() => window.__dakar.sceneInfo() && document.querySelector('#sceneTag.stoppable'), null, T).catch(() => {});
  const stopBtn = await rect('#sceneTag .st-stop');
  check(`${label}: a scene shows « Arrêter » (44 px)`, !!stopBtn && stopBtn.height >= 44, JSON.stringify(stopBtn));
  if (touch) await page.locator('#sceneTag .st-stop').tap(); else await page.locator('#sceneTag .st-stop').click();
  check(`${label}: leaving the scene gives the controls back`, await page.waitForFunction(() => !window.__dakar.sceneInfo() && window.__dakar.pos().mode === 'play', null, { timeout: 15000 }).then(() => true, () => false));

  // 8. The phone opens and closes back to play.
  if (touch) await page.locator('#menuBtn').tap(); else await page.locator('#menuBtn').click();
  await page.waitForFunction(() => document.querySelector('#phone.on'), null, T).catch(() => {});
  await page.keyboard.press('Escape');
  check(`${label}: the phone closes back to play`, await page.waitForFunction(() => !document.querySelector('#phone.on') && window.__dakar.pos().mode === 'play', null, { timeout: 15000 }).then(() => true, () => false));

  // 9. Way-finding: the suggested person (Tonton Ibou on a fresh save) has a pin and the goal hint a compass.
  await d(() => window.__dakar.teleport('pikine', 10, -10, 0));
  await page.waitForFunction(() => window.__dakar.uiMarkers().pin, null, { timeout: 20000 }).catch(() => {});
  const g = await d(() => ({ m: window.__dakar.uiMarkers(), ibou: window.__dakar.npcWhere('ibou'), goal: document.getElementById('goal').textContent, gd: document.querySelector('#goal .gd')?.textContent }));
  check(`${label}: way-finding pin over the suggested person, distance in the hint`, g.m.pin && Math.hypot(g.m.pinAt.x - g.ibou.x, g.m.pinAt.z - g.ibou.z) < 0.5 && /\d+ m/.test(g.goal), JSON.stringify(g));
  await settle(); await page.screenshot({ timeout: 120000, path: `${out}/check-${label}-guide.png` });

  // 10. Toasts stack (three at most); a wallet change floats beside the wallet.
  await d(() => { for (const m of ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq']) window.__dakar.uiToast(m); });
  const live = await d(() => document.querySelectorAll('#toast .t:not(.out)').length);
  check(`${label}: toasts stack, three at most`, live === 3, String(live));
  const tb = await rect('#toast'), ab = await rect('#actbar');
  check(`${label}: toasts stay clear of the action area`, !overlap(tb, ab), JSON.stringify(tb));
  await d(() => { window.__dakar.state.data.wallet += 1200; });
  check(`${label}: a wallet change shows « +1 200 F »`, await page.waitForFunction(() => /\+1 200 F/.test(document.querySelector('#wallet .mfx')?.textContent ?? ''), null, { timeout: 5000 }).then(() => true, () => false));

  // 11. The profile sheet (text field, swatches) scrolls with a real touch drag when it is taller than the screen.
  if (touch) {
    await page.locator('#presenceBtn').tap();
    await page.waitForFunction(() => document.querySelector('#modal.on #presenceName'), null, T).catch(() => {});
    await settle();
    const dims = await d(() => { const p = document.querySelector('#modal .panel'); return { sh: p.scrollHeight, ch: p.clientHeight }; });
    const panel = await rect('#modal .panel');
    const cdp = await ctx.newCDPSession(page);
    const tx = panel.left + panel.width / 2, ty = panel.bottom - 25;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx, y: ty - i * 20 }] }); await page.waitForTimeout(60); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(500);
    const top = await d(() => document.querySelector('#modal .panel').scrollTop);
    check(`${label}: the profile sheet scrolls with a touch drag`, dims.sh - dims.ch <= 20 || top > 20, `${JSON.stringify(dims)} scrollTop ${top}`);
    await page.screenshot({ timeout: 120000, path: `${out}/check-${label}-profile.png` });
    await page.getByRole('button', { name: 'Fermer', exact: true }).tap();
    check(`${label}: closing the profile sheet gives the controls back`, await playAgain());
  }

  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} UI checks passed`);
process.exit(failed ? 1 : 0);
