// Local compiled assets only. Fixtures position the player; story and save use real menus.
// node scripts/check-ibou-followup.mjs [evidence-directory] [static-directory]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve(process.argv[2] ?? '/tmp/dakar-ibou-evidence');
const root = path.resolve(process.argv[3] ?? 'dist');
fs.mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok) => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); assert.ok(ok, name); };
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  for (const touch of [false, true]) {
    const label = touch ? 'touch' : 'desktop';
    const ctx = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch, isMobile: touch });
    await ctx.routeWebSocket('**/*', ws => ws.close());
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1:4173') return route.abort();
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (path.relative(root, file).startsWith('..') || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
      return route.fulfill({ path: file, contentType: mime[path.extname(file)] ?? 'application/octet-stream' });
    });
    await ctx.addInitScript(() => localStorage.setItem('dakarrek.quality', 'low'));
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const click = async name => { const b = page.getByRole('button', { name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }); if (touch) await b.tap(); else await b.click(); };
    const ready = () => page.waitForFunction(() => window.__dakar?.drawCalls() > 0, null, { timeout: 90000 });
    const snap = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__dakar.state.data)));
    const open = async id => {
      await page.evaluate(id => { const d = window.__dakar; const a = d.interactables().find(i => i.id === 'npc:' + id); d.place(a.x, a.z + 1, Math.PI); }, id);
      await page.waitForFunction(id => window.__dakar.nearestInteractable()?.startsWith(id === 'ibou' ? 'Tonton Ibou' : 'Modou'), id);
      // Positioning is a test fixture. Persist it through the real save UI
      // before snapshots, so openBeat's normal saveNow cannot change stale x/z/yaw.
      if (touch) await page.locator('#menuBtn').tap(); else await page.locator('#menuBtn').click();
      await click('Sauvegarder maintenant');
      await page.waitForFunction(() => window.__dakar.pos().mode === 'play');
      if (touch) await page.locator('#act').tap(); else await page.keyboard.press('KeyE');
      await page.locator('#modal.on').waitFor();
    };
    const absent = () => page.getByRole('button', { name: /^★ Des nouvelles de Modou/ }).count().then(n => n === 0);
    const continued = async () => { await click('Continuer'); await page.waitForFunction(() => window.__dakar.pos().mode === 'play'); };
    const save = async () => { if (touch) await page.locator('#menuBtn').tap(); else await page.locator('#menuBtn').click(); await click('Sauvegarder maintenant'); await page.waitForFunction(() => window.__dakar.pos().mode === 'play'); };
    await page.goto('http://127.0.0.1:4173/?debug' + (touch ? '&touch' : '')); await ready();
    await page.evaluate(() => window.__dakar.teleport('pikine'));
    await open('ibou');
    check(`${label}: no follow-up before welcome`, await absent());
    await click('★ Bienvenue au quartier'); await click('Oui, n’importe quoi d’honnête'); await continued();
    await open('ibou'); check(`${label}: welcome alone does not unlock follow-up`, await absent()); await click('Fermer');
    await open('modou'); await click('★ Recommandé par Ibou'); await click('Je peux commencer quand vous voulez'); await continued();
    await open('ibou');
    check(`${label}: return reacts to actual Modou trust`, !await absent());
    for (let i = 0; i < 2; i++) {
      await click('★ Des nouvelles de Modou'); const before = await snap();
      await click('Je te raconterai plus tard'); const after = await snap();
      check(`${label}: postponement ${i + 1} changes no state`, JSON.stringify(before) === JSON.stringify(after));
      await continued(); await open('ibou');
    }
    await click('Fermer'); await save(); await page.reload(); await ready(); await open('ibou');
    check(`${label}: postponed return survives reload`, !await absent());
    await click('★ Des nouvelles de Modou');
    await page.screenshot({ path: path.join(out, `${label}-ibou-followup.png`) });
    const before = await snap();
    await page.getByRole('button', { name: 'Merci pour la recommandation', exact: true }).evaluate(el => { window.__ibouOldChoice = el; el.click(); el.click(); });
    const after = await snap(), expected = structuredClone(before);
    expected.rel['ibou|player'] += 2; expected.flags.push('ibou_modou_followup'); expected.beats.ibou_modou_followup = 'merci';
    check(`${label}: double confirmation changes only +2 and memory`, JSON.stringify(after) === JSON.stringify(expected));
    await page.evaluate(() => window.__ibouOldChoice.click());
    check(`${label}: retained choice cannot replay effects`, JSON.stringify(await snap()) === JSON.stringify(after));
    await continued(); await save(); await page.reload(); await ready(); await open('ibou');
    const loaded = await snap();
    check(`${label}: completion persists and hides follow-up`, await absent() && loaded.flags.includes('ibou_modou_followup') && loaded.beats.ibou_modou_followup === 'merci' && loaded.rel['ibou|player'] === after.rel['ibou|player']);
    check(`${label}: existing Ibou chat still available`, await page.getByRole('button', { name: /^Discuter avec Tonton Ibou/ }).count() === 1);
    check(`${label}: no browser runtime errors`, errors.length === 0);
    await ctx.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(checks, null, 2));
  await browser.close();
}
console.log(`${checks.filter(c => c.ok).length}/${checks.length} checks passed`);
