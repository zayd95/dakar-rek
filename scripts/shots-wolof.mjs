// Captures of Wolof dialogue in game (docs/screenshots/wolof): Ibou's welcome, Mamadou's greeting at the Boutique
// Diallo, a character sheet with their Wolof expressions (phone size), Réglages › Langue.
// Usage: node scripts/shots-wolof.mjs [baseUrl=http://localhost:4207/] [outDir=docs/screenshots/wolof]
// Serve a build first: npm run build && npx vite preview --port 4207 --strictPort
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4207/';
const out = process.argv[3] ?? 'docs/screenshots/wolof';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const T = { timeout: 120000 };
const shown = [];

async function open(viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('wolof-shots')) { localStorage.clear(); sessionStorage.setItem('wolof-shots', '1'); } });
  const page = await ctx.newPage();
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.body(), null, T);
  return { ctx, page };
}
const d = (page, fn, arg) => page.evaluate(fn, arg);
const sub = page => d(page, () => `${document.querySelector('#modal h2')?.textContent} — ${document.querySelector('#modal p')?.textContent}`);
/** NPC in place at this hour, player beside them, camera on them. */
async function meet(page, hub, hour, id, cam) {
  await d(page, ([hub, hour]) => { const g = window.__dakar; g.setHour(hour); if (g.pos().hub !== hub) g.teleport(hub, 0, -120, 0); else g.place(0, -120, 0); }, [hub, hour]);
  await page.waitForFunction(id => { const w = window.__dakar.npcWhere(id); return w && w.here && !w.walking; }, id, T);
  const w = await d(page, id => window.__dakar.npcWhere(id), id);
  // [player dx, dz] and either a free camera [dx, dz, target dx, dz] or the follow camera behind the player, facing the NPC.
  await d(page, ([w, c]) => {
    const g = window.__dakar, px = w.x + c[0], pz = w.z + c[1];
    g.place(px, pz, Math.atan2(w.x - px, w.z - pz));
    g.cam(c.length > 2 ? [w.x + c[2], 1.8, w.z + c[3]] : null, c.length > 2 ? [w.x + (c[4] ?? 0), 1.1, w.z + (c[5] ?? 0)] : undefined);
  }, [w, cam]);
  await page.waitForTimeout(2500);
}

// Desktop: Ibou's welcome (story beat) and Mamadou's greeting.
{
  const { ctx, page } = await open({ width: 1280, height: 720 }, false);
  await d(page, () => { window.__dakar.setHour(10); window.__dakar.teleport('pikine'); });   // fresh save: Ibou waits by the room
  await page.waitForFunction(() => { const w = window.__dakar.npcWhere('ibou'); return w && w.here && !w.walking; }, null, T);
  await page.waitForTimeout(2500);
  await d(page, () => window.__dakar.openNpc('ibou'));
  await page.locator('#modal .item', { hasText: 'Bienvenue au quartier' }).first().click();
  await page.waitForTimeout(400);
  shown.push(await sub(page));
  await page.screenshot({ path: `${out}/desktop-ibou-welcome.png` });
  await page.locator('#modal .item').first().click();
  await d(page, () => document.querySelector('#modal')?.classList.remove('on'));

  await meet(page, 'pikine', 10, 'mamadou', [3.5, 4.6, 2.4, 3.4, 1.3, -0.9]);   // Mamadou on the left of the menu
  await d(page, () => window.__dakar.openNpc('mamadou'));
  await page.waitForTimeout(400);
  shown.push(await sub(page));
  await page.screenshot({ path: `${out}/desktop-mamadou-greeting.png` });
  await ctx.close();
}

// Phone: a character sheet (Mame Diarra) and Réglages › Langue.
{
  const { ctx, page } = await open({ width: 390, height: 844 }, true);
  await d(page, () => { const g = window.__dakar; g.setHour(13); g.teleport('pikine'); g.rel.change('player', 'mame', 12); g.rel.change('player', 'ibou', 8); });
  await d(page, () => window.__dakar.people());
  await page.locator('#modal .item', { hasText: /^Mame Diarra/ }).first().click();
  await page.waitForTimeout(300);
  await d(page, () => { const p = document.querySelector('#modal .panel'); p.scrollTop = p.scrollHeight; });
  await page.waitForTimeout(300);
  shown.push(await d(page, () => document.querySelector('#modal .panel').textContent.replace(/\s+/g, ' ').slice(-260)));
  await page.screenshot({ path: `${out}/phone-mame-sheet.png` });
  await page.locator('#modal .item.close').tap();
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);

  await d(page, () => window.__dakar.phone('reglages'));
  await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, T);
  await page.waitForTimeout(600);
  await d(page, () => { const s = document.querySelector('#phone .ph-screen'); const h = [...s.querySelectorAll('h3')].find(x => x.textContent === 'Langue'); s.scrollTop = h.offsetTop - 12; });
  await page.waitForTimeout(300);
  shown.push(await d(page, () => `${JSON.stringify(window.__dakar.phoneInfo())} ${document.querySelector('#phone [data-act="gloss"]').textContent}`));
  await page.screenshot();                         // under SwiftShader the first capture after opening can be a stale frame
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/phone-reglages-langue.png` });
  await ctx.close();
}

await browser.close();
for (const s of shown) console.log(s);
