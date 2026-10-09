// UI captures (docs/UI.md): the street HUD with a focused target, a place sheet, the « ⋯ » quick actions, an activity
// running (progress pill, « Arrêter », wallet change) and a long story sheet — desktop, phone portrait, phone landscape.
// Usage: node scripts/shots-ui.mjs [baseUrl] [outDir] [prefix]   (needs a running build, e.g. `npx vite preview --port 4211`)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4211/';
const out = process.argv[3] ?? 'docs/screenshots/ui';
const prefix = process.argv[4] ?? 'after';
const only = process.argv[5] ?? '';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 90000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const views = [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true], ['landscape', { width: 844, height: 390 }, true]];
for (const [label, viewport, touch] of views.filter(v => !only || only.split(',').includes(v[0]))) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* private mode */ } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  // SwiftShader frames are slow: wait until the UI's finite animations (sheet slide, toasts, transitions) are over.
  const settle = () => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 15000 }).catch(() => {});
  const shot = async name => { await page.waitForTimeout(250); await settle(); await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${prefix}-${label}-${name}.png` }); console.log(`${prefix}-${label}-${name}`); };

  // 1. Street, bright noon, a bench in focus (primary verb on the button, diegetic prompt above the seat).
  await d(() => { window.__dakar.setHour(12); window.__dakar.teleport('pikine'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  const free = (await d(() => window.__dakar.seatsHere())).find(s => s.kind === 'bench' && !s.occupant);
  if (free) {
    await d(s => window.__dakar.place(s.x + Math.sin(s.yaw) * 0.9, s.z + Math.cos(s.yaw) * 0.9, s.yaw + Math.PI), free);
    await page.waitForFunction(() => window.__dakar.focus()?.kind === 'seat', null, T).catch(() => {});
  }
  await shot('street');

  // 2. A place sheet (Jus & Go, Almadies): items with icons, details and prices.
  await d(() => { window.__dakar.teleport('almadies'); window.__dakar.state.data.wallet = 3000; });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, T);
  const juice = (await d(() => window.__dakar.cityPlaces())).find(p => p.name === 'Jus & Go');
  if (juice) {
    await d(p => window.__dakar.place(p.x, p.z, Math.PI), juice);
    await page.waitForFunction(() => window.__dakar.focus()?.name === 'Jus & Go', null, T).catch(() => {});
    await shot('place-focus');
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await shot('sheet');
    await d(() => document.querySelector('#modal')?.classList.remove('on'));
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
    // 3. « ⋯ »: the target's quick actions near the thumb.
    await d(() => { window.__dakar.state.data.wallet = 700; });
    await d(() => window.__dakar.more());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await shot('quick');
    await d(() => document.querySelector('#modal')?.classList.remove('on'));
    await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});
  }

  // 4. An activity running: Maïga « Riz au poisson » (pay → prepared → sit → eat), progress pill and « Arrêter ».
  await d(() => { window.__dakar.teleport('pikine'); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await d(() => window.__dakar.enter('maiga'));
  await page.waitForFunction(() => window.__dakar.pos().x > 900, null, T).catch(() => {});
  const counter = (await d(() => window.__dakar.roomInteractables())).find(i => /counter/.test(i.id));
  if (counter) {
    await d(() => { const s = window.__dakar.state; s.data.wallet = 3000; s.data.needs.faim = 30; });
    await d(p => window.__dakar.place(p.x - 0.6, p.z, Math.PI / 2), counter);
    await page.waitForFunction(() => /:counter$/.test(window.__dakar.focus()?.id ?? ''), null, T).catch(() => {});
    await d(() => window.__dakar.act());
    await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
    await shot('counter-sheet');
    await page.locator('#modal .item', { hasText: 'Riz au poisson' }).first().click();
    await page.waitForFunction(() => window.__dakar.activity()?.step === 'Préparation', null, T).catch(() => {});
    await shot('activity');
    await page.waitForFunction(() => window.__dakar.activity()?.step === 'Tu manges', null, { timeout: 180000 }).catch(() => {});
    await shot('activity-eating');
    await page.waitForFunction(() => !window.__dakar.activity(), null, { timeout: 180000 }).catch(() => {});
    await d(() => window.__dakar.stand());
    await d(() => window.__dakar.exit());
  }

  // 5. A story sheet with a long subtitle (Tonton Ibou's welcome) and the needs panel open.
  await d(() => window.__dakar.openNpc('ibou'));
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  await shot('npc-sheet');
  await d(() => document.querySelector('#modal')?.classList.remove('on'));
  await d(() => { const s = window.__dakar.state.data.needs; Object.assign(s, { faim: 18, energie: 44, moral: 80, social: 62, hygiene: 35 }); });
  await d(() => document.getElementById('stats')?.click());
  await shot('needs-open');
  await d(() => document.getElementById('stats')?.click());
  if (errors.length) console.log(label, 'page errors:', errors.slice(0, 3));
  await ctx.close();
}
await browser.close();
