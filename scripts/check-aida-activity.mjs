// Local-only real-UI journey. Debug API supplies fixtures, positioning and inspection;
// invitation, activity completion and recognition always use the player's real UI.
// node scripts/check-aida-activity.mjs http://127.0.0.1:4173 /tmp/aida-evidence [--static-dir=dist]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:4173/');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol)) throw new Error('This check only accepts a localhost URL.');
const out = process.argv[3] ?? '/tmp/dakar-aida-evidence';
const staticArg = process.argv.find(arg => arg.startsWith('--static-dir='));
const staticDir = staticArg ? path.resolve(staticArg.slice('--static-dir='.length)) : null;
fs.mkdirSync(out, { recursive: true });
const results = [], snapshots = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail);
  if (!ok) throw new Error(name);
};
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
try {
  for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 720 }, false], ['touch', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await ctx.routeWebSocket('**/*', ws => {
      const address = new URL(ws.url());
      const origin = `${address.protocol === 'wss:' ? 'https:' : 'http:'}//${address.host}`;
      if (!staticDir && origin === base.origin) ws.connectToServer();
      else ws.close({ code: 1008, reason: 'Local-only activity check' });
    });
    await ctx.route('**/*', async route => {
      const request = new URL(route.request().url());
      if (request.origin !== base.origin) return route.abort();
      if (!staticDir) return route.continue();
      const file = path.resolve(staticDir, '.' + decodeURIComponent(request.pathname === '/' ? '/index.html' : request.pathname));
      if (path.relative(staticDir, file).startsWith('..') || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Missing local build asset' });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };
      return route.fulfill({ path: file, contentType: mime[path.extname(file)] ?? 'application/octet-stream' });
    });
    await ctx.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const url = new URL(base); url.searchParams.set('debug', ''); if (touch) url.searchParams.set('touch', '');
    const ready = async () => {
      await page.waitForFunction(() => window.__dakar?.pos().hub && window.__dakar.drawCalls() > 0, null, { timeout: 90000 });
      await page.evaluate(() => window.__dakar.setHour(13));
    };
    const click = async text => {
      const button = page.getByRole('button', { name: new RegExp('^' + text) });
      if (touch) await button.tap(); else await button.click();
    };
    const snap = async milestone => {
      const data = await page.evaluate(() => JSON.parse(JSON.stringify(window.__dakar.state.data)));
      snapshots.push({ label, milestone, data }); return data;
    };
    const close = async () => { await click('Fermer'); await page.waitForFunction(() => window.__dakar.pos().mode === 'play'); };
    const open = async (id = 'aida') => { await page.evaluate(id => window.__dakar.openNpc(id), id); await page.locator('#modal.on').waitFor(); };
    const reload = async () => { await page.reload({ waitUntil: 'load' }); await ready(); };
    const saveUi = async () => {
      await page.locator('#menuBtn').click(); await click('Sauvegarder maintenant');
      await page.waitForFunction(() => window.__dakar.pos().mode === 'play');
    };
    await page.goto(url.href, { waitUntil: 'load' }); await ready();
    await page.evaluate(() => { const d = window.__dakar; d.teleport('corniche'); d.setHour(13); const a = d.interactables().find(i => i.id === 'npc:aida'); d.place(a.x, a.z + 1, Math.PI); });
    await page.waitForFunction(() => window.__dakar.nearestInteractable()?.startsWith('Aïda'));
    if (touch) await page.locator('#act').tap(); else await page.keyboard.press('KeyE');
    await page.locator('#modal.on').waitFor();
    check(`${label}: revision absent before invitation`, await page.getByRole('button', { name: /^Réviser avec Aïda/ }).count() === 0);
    for (let i = 0; i < 2; i++) {
      await click('★ Réviser ensemble'); const before = await snap('before-refusal');
      await click('Une autre fois'); const after = await snap('after-refusal');
      check(`${label}: refusal ${i + 1} has no rewards`, JSON.stringify([before.rel, before.flags, before.counters, before.needs]) === JSON.stringify([after.rel, after.flags, after.counters, after.needs]));
      await click('Continuer'); await page.waitForFunction(() => window.__dakar.pos().mode === 'play'); await open();
    }
    await page.getByRole('button', { name: /^★ Réviser ensemble/ }).evaluate(el => { window.__staleStory = el; });
    await click('★ Réviser ensemble'); const before = await snap('before-invitation');
    await page.getByRole('button', { name: /^Je viens/ }).evaluate(el => { window.__staleInvitation = el; });
    await click('Je viens'); const invited = await snap('invited');
    check(`${label}: invitation grants no session rewards`, invited.flags.includes('aida_revision_invited') && !invited.flags.includes('aida_friend') && JSON.stringify([before.rel, before.counters, before.needs]) === JSON.stringify([invited.rel, invited.counters, invited.needs]));
    check(`${label}: reply points to actual action`, await page.locator('#modal p').textContent().then(t => t.includes('Réviser avec Aïda')));
    await page.evaluate(() => window.__staleStory.click());
    check(`${label}: retained story opener cannot replace reply`, await page.locator('#modal p').textContent().then(t => t.includes('Ferme cette fenêtre')));
    await page.getByRole('button', { name: /^Continuer/ }).evaluate(el => { window.__staleReply = el; });
    await click('Continuer'); await page.waitForFunction(() => window.__dakar.pos().mode === 'play');
    await open('moussa'); await page.evaluate(() => window.__staleReply.click());
    check(`${label}: retained reply cannot close another NPC menu`, await page.locator('#modal.on h2').textContent().then(t => t.startsWith('Moussa')));
    await close(); await reload(); await open();
    check(`${label}: invitation persists through reload`, await page.getByRole('button', { name: /^Réviser avec Aïda/ }).count() === 1);
    await page.screenshot({ path: path.join(out, `${label}-aida-activity-menu.png`) });
    await close(); await open('moussa');
    check(`${label}: another NPC has no revision action`, await page.getByRole('button', { name: /^Réviser avec Aïda/ }).count() === 0);
    await close(); await page.evaluate(() => window.__dakar.state.data.needs.energie = 5); await open();
    const blocked = page.getByRole('button', { name: /^Réviser avec Aïda/ });
    check(`${label}: low energy explains disabled action`, await blocked.evaluate(el => el.classList.contains('dis')) && (await blocked.textContent()).includes('6 d’énergie'));
    await blocked.click(); check(`${label}: disabled action gives no counter`, !(await snap('low-energy')).counters.aida_revisions);
    await close(); await page.evaluate(() => window.__dakar.state.data.needs.energie = 30); await open();
    await page.getByRole('button', { name: /^Réviser avec Aïda/ }).evaluate(el => { window.__staleAction = el; });
    await close(); await open('moussa'); await page.evaluate(() => window.__staleAction.click());
    check(`${label}: detached stale menu cannot start activity`, await page.evaluate(() => window.__dakar.pos().mode === 'menu' && !window.__dakar.state.data.counters.aida_revisions));
    await close(); await page.locator('#menuBtn').click(); await page.evaluate(() => window.__staleAction.click());
    check(`${label}: stale action cannot replace system menu`, await page.locator('#modal.on h2').textContent().then(t => t === 'Dakar Rek') && await page.evaluate(() => !window.__dakar.state.data.counters.aida_revisions));
    await close(); await open();
    await page.evaluate(() => window.__dakar.state.data.needs.energie = 5); await click('Réviser avec Aïda');
    check(`${label}: energy changed under menu prevents start`, await page.evaluate(() => window.__dakar.pos().mode === 'play' && !window.__dakar.state.data.counters.aida_revisions));
    await page.evaluate(() => window.__dakar.state.data.needs.energie = 30); await open();
    await click('Réviser avec Aïda'); await page.waitForFunction(() => window.__dakar.pos().mode === 'busy');
    await page.waitForTimeout(500); const during = await snap('interrupted-progress');
    check(`${label}: rewards absent during visible progress`, !during.counters.aida_revisions && !during.counters.etudes && !during.rel['aida|player'] && !during.flags.includes('aida_friend'));
    // Reload immediately: a slow compositor screenshot could consume the rest
    // of the four-second activity and turn this into a completed-session reload.
    await reload(); await open();
    check(`${label}: interrupted activity available after reload`, await page.getByRole('button', { name: /^Réviser avec Aïda/ }).count() === 1 && !(await snap('after-interruption')).counters.aida_revisions);
    const preActivity = await snap('before-completion');
    await page.getByRole('button', { name: /^Réviser avec Aïda/ }).evaluate(el => { window.__completedAction = el; el.click(); el.click(); });
    await page.waitForFunction(() => window.__dakar.state.data.counters.aida_revisions === 1, null, { timeout: 10000 });
    const completed = await snap('activity-completed');
    check(`${label}: double click completes one activity`, completed.counters.aida_revisions === 1 && completed.counters.actions === 1 && completed.rel['aida|player'] === 1 && !completed.counters.etudes);
    check(`${label}: needs paid at completion`, completed.needs.energie <= preActivity.needs.energie - 6 && completed.needs.energie > preActivity.needs.energie - 6.5 && completed.needs.social > preActivity.needs.social + 11.5);
    await page.evaluate(() => window.__completedAction.click());
    check(`${label}: completed activity cannot replay through retained button`, (await snap('completed-button-replayed')).counters.aida_revisions === 1);
    await reload(); await open();
    check(`${label}: completed session persists, recognition available`, await page.getByRole('button', { name: /^Réviser avec Aïda/ }).count() === 0 && await page.getByRole('button', { name: /^★ Une séance ensemble/ }).count() === 1);
    await page.screenshot({ path: path.join(out, `${label}-aida-completed-menu.png`) });
    await click('★ Une séance ensemble'); await page.screenshot({ path: path.join(out, `${label}-aida-recognition.png`) });
    await page.getByRole('button', { name: /^À bientôt, Aïda/ }).evaluate(el => { window.__staleRecognition = el; el.click(); el.click(); });
    const recognized = await snap('recognized');
    check(`${label}: recognition grants friendship/study once`, recognized.flags.includes('aida_friend') && recognized.counters.etudes === 1 && recognized.rel['aida|player'] === 10);
    await page.evaluate(() => { window.__staleRecognition.click(); window.__completedAction?.click(); window.__staleInvitation?.click(); });
    const replayed = await snap('stale-replayed');
    check(`${label}: stale references cannot replay rewards`, JSON.stringify(replayed.counters) === JSON.stringify(recognized.counters) && replayed.rel['aida|player'] === 10);
    await reload(); await open();
    check(`${label}: recognized state persists with generic chat`, await page.getByRole('button', { name: /^★/ }).count() === 0 && await page.getByRole('button', { name: /^Discuter/ }).count() === 1);
    await click('Discuter'); await page.waitForFunction(() => window.__dakar.state.data.counters.chats === 1, null, { timeout: 10000 });
    check(`${label}: generic chat still works`, await page.evaluate(() => window.__dakar.rel.level('aida') === 11 && window.__dakar.state.data.counters.etudes === 1));
    await saveUi();
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('dakarrek.guest.save'));
      d.flags = ['aida_friend']; d.beats = { aida_revise: 'venir' }; d.counters = { etudes: 1 }; d.rel = { 'aida|player': 10 };
      localStorage.setItem('dakarrek.guest.save', JSON.stringify(d)); Object.assign(window.__dakar.state.data, d);
    });
    await reload(); await open(); const legacy = await snap('legacy-completed');
    check(`${label}: old completed save stays completed`, await page.getByRole('button', { name: /^★|^Réviser avec Aïda/ }).count() === 0 && legacy.counters.etudes === 1 && !legacy.counters.aida_revisions && legacy.rel['aida|player'] === 10);
    check(`${label}: no browser exceptions`, errors.length === 0, errors.join('\n'));
    await ctx.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ date: new Date().toISOString(), environment: 'local Chromium, desktop + touch viewport; not physical phones', transport: staticDir ? 'route-backed local static build; no TCP server' : 'localhost HTTP', base: base.origin, results, snapshots }, null, 2));
  await browser.close();
}
console.log(`${results.filter(r => r.ok).length}/${results.length} checks passed`);
