import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:5188/';
const evidence = 'docs/evidence/v1-core';
await mkdir(evidence, { recursive: true });
const checks = [], errors = [];
const check = (name, ok) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`); assert.ok(ok, name); };
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&hub=plateau`);
  await page.waitForFunction(() => window.__dakar?.interactables().length > 0);
  await page.evaluate(() => window.__dakar.setHour(12));
  const door = await page.evaluate(() => window.__dakar.interactables().find(i => i.id.includes(':mosque:')));
  check('mosque doorway exists', !!door);
  await page.evaluate(d => window.__dakar.place(d.x, d.z, Math.PI), door);
  await page.waitForFunction(() => window.__dakar.nearestInteractable() === 'Grande mosquée');
  await page.keyboard.press('e');
  await page.getByRole('button', { name: /^Entrer/ }).click();
  await page.waitForFunction(() => window.__dakar.pos().x > 900 && window.__dakar.pos().mode === 'play');
  const spawn = await page.evaluate(() => window.__dakar.pos());
  await page.keyboard.down('w'); await page.waitForTimeout(800); await page.keyboard.up('w');
  const walked = await page.evaluate(() => window.__dakar.pos());
  check('mosque floor is walkable', Math.hypot(walked.x - spawn.x, walked.z - spawn.z) > 0.5);
  await page.evaluate(p => window.__dakar.place(p.x - 3, p.z - 6, Math.PI), spawn);
  await page.waitForFunction(() => window.__dakar.nearestInteractable() === 'Un moment au calme');
  await page.keyboard.press('e');
  await page.locator('#modal.context.on').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${evidence}/context-actions-desktop.png` });
  const dock = await page.locator('#modal.context .panel').boundingBox();
  console.log('Desktop context bounds:', JSON.stringify(dock));
  check('context choices leave most of the scene visible', !!dock && dock.height <= 240 && dock.y > 500);
  check('context dialog receives keyboard focus', await page.locator('#modal').evaluate(el => el.contains(document.activeElement)));
  await page.keyboard.press('Shift+Tab');
  check('keyboard focus stays in the contextual choices', await page.getByRole('button', { name: 'Fermer', exact: true }).evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play');
  check('Escape closes choices and resumes play', await page.locator('#modal.on').count() === 0);
  await page.keyboard.press('e');
  await page.locator('#modal.context.on').waitFor({ state: 'visible' });
  check('prayer and ordinary pause are both available', await page.getByRole('button', { name: /^Prendre un moment pour prier/ }).count() === 1 && await page.getByRole('button', { name: /^Se poser au calme/ }).count() === 1);
  const before = await page.evaluate(() => ({ wallet: window.__dakar.state.wallet, flags: [...window.__dakar.flags()], counters: { ...window.__dakar.state.data.counters } }));
  await page.getByRole('button', { name: /^Prendre un moment pour prier/ }).click();
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play');
  const after = await page.evaluate(() => ({ wallet: window.__dakar.state.wallet, flags: [...window.__dakar.flags()], counters: { ...window.__dakar.state.data.counters } }));
  check('prayer has no payment, affiliation flag or religious counter', before.wallet === after.wallet && JSON.stringify(before.flags) === JSON.stringify(after.flags) && (after.counters.actions ?? 0) === (before.counters.actions ?? 0) + 1 && Object.keys(after.counters).every(k => k === 'actions' || after.counters[k] === before.counters[k]));
  await page.screenshot({ path: `${evidence}/mosque-desktop.png` });
  await page.locator('#menuBtn').click(); await page.locator('button[data-q="medium"]').click();
  check('quality rebuild keeps the mosque interior', (await page.evaluate(() => window.__dakar.pos())).x > 900);
  // Leave through the actual in-room door.
  await page.evaluate(p => window.__dakar.place(p.x, p.z + 1, 0), spawn);
  await page.waitForFunction(() => window.__dakar.nearestInteractable() === 'Sortir');
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__dakar.pos().x < 900);
  const outside = await page.evaluate(() => window.__dakar.pos());
  check('exit returns to original street doorway', Math.hypot(outside.x - door.x, outside.z - door.z) < 0.1);
  await page.goto(`${base}?debug`); await page.waitForFunction(() => window.__dakar?.interactables().length > 0);
  const resumed = await page.evaluate(() => window.__dakar.pos());
  check('reload saves the street doorway instead of off-map interior coordinates', resumed.hub === 'plateau' && Math.hypot(resumed.x - door.x, resumed.z - door.z) < 0.1);
  let total = 0;
  for (const hub of ['plateau', 'corniche', 'almadies', 'pikine']) {
    await page.evaluate(h => window.__dakar.teleport(h), hub);
    const boards = await page.evaluate(() => window.__dakar.interactables().filter(i => i.id.includes(':ad:')));
    check(`${hub} has its expected advertising slots`, boards.length === (hub === 'pikine' ? 2 : 1)); total += boards.length;
    const board = boards.find(i => i.id.endsWith(`${hub}-street`));
    await page.evaluate(b => window.__dakar.place(b.x, b.z, Math.PI), board);
    await page.waitForFunction(() => window.__dakar.nearestInteractable() === 'Tableau du quartier');
    await page.keyboard.press('e');
    await page.locator('#modal.context.on').waitFor({ state: 'visible' });
    check(`${hub} empty slot is available without a sponsor link`, (await page.locator('#modal').textContent()).includes('disponible') && await page.getByRole('button', { name: /^Ouvrir le site/ }).count() === 0);
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    if (hub === 'pikine') {
      const anchors = await page.evaluate(() => ({
        arena: window.__dakar.interactables().find(i => i.id === 'pikine:arena'),
        board: window.__dakar.interactables().find(i => i.id.endsWith('pikine-arena')),
      }));
      check('arena advertising board is deliberately off the gate centreline', !!anchors.arena && !!anchors.board && Math.abs(anchors.board.x - anchors.arena.x) >= 15);
      for (const dz of [-3, 0, 3]) {
        await page.evaluate(({ a, dz }) => window.__dakar.place(a.x, a.z + dz, 0), { a: anchors.arena, dz });
        await page.waitForFunction(() => window.__dakar.nearestInteractable() === 'Arène · làmb');
        check(`arena menu stays stable on the centreline at ${dz >= 0 ? '+' : ''}${dz} m`, await page.evaluate(() => window.__dakar.nearestInteractable() === 'Arène · làmb'));
      }
      await page.evaluate(a => window.__dakar.place(a.x, a.z - 10, 0), anchors.arena);
      const arenaStart = await page.evaluate(() => window.__dakar.pos());
      await page.keyboard.down('w');
      try { await page.waitForFunction(expected => window.__dakar.nearestInteractable() === expected, 'Arène · làmb', { timeout: 3000 }); }
      finally { await page.keyboard.up('w'); }
      const arenaEnd = await page.evaluate(() => window.__dakar.pos());
      console.log('Desktop arena navigation:', JSON.stringify({ arenaStart, arenaEnd }));
      check('medium desktop navigation reaches the arena menu through the gate', Math.hypot(arenaEnd.x - arenaStart.x, arenaEnd.z - arenaStart.z) > 3.5 && arenaEnd.near === 'Arène · làmb');
      await page.screenshot({ path: `${evidence}/arena-centreline-desktop.png` });
      await page.evaluate(b => window.__dakar.place(b.x, b.z - 10, 0), anchors.board);
      const boardStart = await page.evaluate(() => window.__dakar.pos());
      await page.keyboard.down('w');
      try { await page.waitForFunction(expected => window.__dakar.nearestInteractable() === expected, 'Annonces · arène', { timeout: 3000 }); }
      finally { await page.keyboard.up('w'); }
      const boardEnd = await page.evaluate(() => window.__dakar.pos());
      console.log('Desktop board navigation:', JSON.stringify({ boardStart, boardEnd }));
      check('medium desktop navigation deliberately reaches the off-axis board', Math.hypot(boardEnd.x - boardStart.x, boardEnd.z - boardStart.z) > 3.5 && boardEnd.near === 'Annonces · arène');
      await page.screenshot({ path: `${evidence}/arena-board-desktop.png` });
    }
  }
  check('five total advertising slots', total === 5);
  await context.close();

  // Mobile campaign fixture only: never ship an invented advertiser.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => {
    localStorage.setItem('dakarrek.quality', 'low');
    const original = Date.now; window.__timeOffset = 0; Date.now = () => original() + window.__timeOffset;
  });
  const phone = await mobile.newPage(); phone.on('pageerror', e => errors.push(e.message));
  let manifest = { schemaVersion: 1, campaigns: [{ id: 'browser-fixture', slot: 'pikine-arena', approved: true, status: 'active', sponsor: 'Commerce test', headline: 'Annonce de test', message: 'Exemple de campagne pour vérifier le panneau.', startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 300000).toISOString(), background: '#123f39', foreground: '#fff1ce', url: 'https://example.com/' }] };
  await phone.route('**/ad-campaigns.json', route => route.fulfill({ json: manifest }));
  const campaignResponse = phone.waitForResponse(r => r.url().endsWith('/ad-campaigns.json') && r.status() === 200);
  await phone.goto(`${base}?debug&touch&hub=pikine`);
  await phone.waitForFunction(() => window.__dakar?.interactables().length > 0);
  await campaignResponse;
  await phone.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await phone.evaluate(() => window.__dakar.setHour(12));
  const mobileAnchors = await phone.evaluate(() => ({
    arena: window.__dakar.interactables().find(i => i.id === 'pikine:arena'),
    board: window.__dakar.interactables().find(i => i.id.endsWith('pikine-arena')),
  }));
  await phone.evaluate(a => window.__dakar.place(a.x, a.z - 10, 0), mobileAnchors.arena);
  const joy = await phone.locator('#joy').boundingBox();
  check('touch joystick is visible', !!joy);
  const touch = await mobile.newCDPSession(phone);
  const walkTouchUntil = async expected => {
    const x = joy.x + joy.width / 2, y = joy.y + joy.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: joy.y + 5, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
    try { await phone.waitForFunction(name => window.__dakar.nearestInteractable() === name, expected, { timeout: 3000 }); }
    finally { await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  };
  const touchStart = await phone.evaluate(() => window.__dakar.pos());
  await walkTouchUntil('Arène · làmb');
  const touchEnd = await phone.evaluate(() => window.__dakar.pos());
  console.log('Touch arena navigation:', JSON.stringify({ touchStart, touchEnd }));
  check('low touch navigation reaches the arena menu through the gate', Math.hypot(touchEnd.x - touchStart.x, touchEnd.z - touchStart.z) > 3.5 && touchEnd.near === 'Arène · làmb');
  await phone.screenshot({ path: `${evidence}/arena-centreline-mobile.png` });
  await phone.evaluate(b => window.__dakar.place(b.x, b.z - 10, 0), mobileAnchors.board);
  const boardTouchStart = await phone.evaluate(() => window.__dakar.pos());
  await walkTouchUntil('Annonces · arène');
  const boardTouchEnd = await phone.evaluate(() => window.__dakar.pos());
  console.log('Touch board navigation:', JSON.stringify({ boardTouchStart, boardTouchEnd }));
  check('low touch navigation deliberately reaches the off-axis board', Math.hypot(boardTouchEnd.x - boardTouchStart.x, boardTouchEnd.z - boardTouchStart.z) > 3.5 && boardTouchEnd.near === 'Annonces · arène');
  await phone.evaluate(b => window.__dakar.place(b.x, b.z, 0), mobileAnchors.board);
  await phone.waitForFunction(() => window.__dakar.nearestInteractable() === 'Annonces · arène');
  await phone.waitForTimeout(1500); await phone.locator('#act').tap();
  await phone.locator('#modal.context.on').waitFor({ state: 'visible' });
  console.log('Mobile sponsored choices:', await phone.locator('#modal').textContent());
  await phone.screenshot({ path: `${evidence}/advertising-mobile.png` });
  check('mobile sponsor menu identifies sponsored content', (await phone.locator('#modal').textContent()).includes('Publicité · Commerce test'));
  check('mobile sponsor menu exposes explicit external link', await phone.getByRole('button', { name: /^Ouvrir le site de l’annonceur/ }).count() === 1);
  const phoneDock = await phone.locator('#modal.context .panel').boundingBox();
  check('mobile choices remain compact and inside the viewport', !!phoneDock && phoneDock.height <= 240 && phoneDock.x >= 0 && phoneDock.x + phoneDock.width <= 390 && phoneDock.y + phoneDock.height <= 844);
  const closeTarget = await phone.getByRole('button', { name: 'Fermer', exact: true }).boundingBox();
  check('mobile close control has a 44 pixel touch target', !!closeTarget && closeTarget.width >= 44 && closeTarget.height >= 44);
  // Replace the manifest and advance polling time; already-open stale links must be revalidated.
  manifest = { schemaVersion: 1, campaigns: [] };
  await phone.evaluate(() => { window.__timeOffset = 61000; }); await phone.waitForTimeout(1600);
  let popups = 0; phone.on('popup', () => popups++);
  await phone.getByRole('button', { name: /^Ouvrir le site de l’annonceur/ }).tap();
  await phone.waitForTimeout(300);
  check('removed campaign cannot open a stale sponsor link', popups === 0);
  await phone.locator('#act').tap();
  await phone.locator('#modal.context.on').waitFor({ state: 'visible' });
  check('removed campaign returns to available slot', (await phone.locator('#modal').textContent()).includes('disponible'));
  await phone.getByRole('button', { name: 'Fermer', exact: true }).tap();
  check('detailed needs are collapsed during play', await phone.locator('#needDetails').isHidden());
  await phone.locator('#statsBtn').tap();
  check('needs expand on request with an accessible state', await phone.locator('#statsBtn').getAttribute('aria-expanded') === 'true' && await phone.locator('#needDetails').isVisible());
  await phone.locator('#statsBtn').focus(); await phone.keyboard.press('Escape');
  check('Escape collapses needs without opening another menu', await phone.locator('#needDetails').isHidden() && await phone.locator('#modal.on').count() === 0);
  await phone.screenshot({ path: `${evidence}/arena-board-mobile.png` });
  check('no browser runtime errors', errors.length === 0);
  await writeFile(`${evidence}/browser-checks.json`, JSON.stringify({ base, checks, errors }, null, 2) + '\n');
} finally { await browser.close(); }
