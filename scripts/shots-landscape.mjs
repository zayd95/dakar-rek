// Phone landscape vs portrait captures of the touch HUD: the street, a sheet (« Ville partagée »), the phone and the chat
// panel, on an iPhone-sized screen (844 × 390 with the notch's safe areas, 390 × 844), plus a few layout checks.
// Usage: node scripts/shots-landscape.mjs [baseUrl] [outDir] [prefix]
//   needs a running build with the chat (online mode), e.g. `npx vite build --mode online --outDir dist-online && npx vite preview --outDir dist-online --port 4230`
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4230/';
const out = process.argv[3] ?? 'docs/screenshots/landscape';
const prefix = process.argv[4] ?? 'after';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 90000 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
// iPhone 14-ish: in landscape the notch sits on the left (47 px) and the home bar at the bottom (21 px)
const views = [['landscape', { width: 844, height: 390 }, { top: 0, left: 47, right: 47, bottom: 21 }], ['portrait', { width: 390, height: 844 }, { top: 47, left: 0, right: 0, bottom: 34 }]];
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
for (const [label, viewport, insets] of views) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* private mode */ } });
  const page = await ctx.newPage();
  await (await ctx.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets }).catch(e => console.log('no safe-area emulation:', e.message));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug&touch`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const settle = () => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 15000 }).catch(() => {});
  const shot = async name => { await page.waitForTimeout(400); await settle(); await page.waitForTimeout(150); await page.screenshot({ timeout: 120000, path: `${out}/${prefix}-${label}-${name}.png` }); console.log(`${prefix}-${label}-${name}`); };
  const rect = sel => d(s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; }, sel);

  await d(() => { window.__dakar.setHour(12); });
  await page.waitForFunction(() => window.__dakar.pos().hub, null, T);
  await page.waitForTimeout(1500);
  await shot('street');
  const W = viewport.width, H = viewport.height;
  const ids = ['#stats', '#place', '#menuBtn', '#presenceBtn', '#chatBtn', '#goal', '#joy', '#actbar', '#act'];
  const boxes = {}; for (const id of ids) boxes[id] = await rect(id);
  console.log(label, JSON.stringify(boxes));
  for (const [id, b] of Object.entries(boxes)) if (b && b.r > b.l) check(`${label}: ${id} inside the safe area`, b.l >= insets.left && b.r <= W - insets.right && b.t >= insets.top && b.b <= H - insets.bottom, JSON.stringify(b));
  const cam = await d(() => window.__dakar.camera?.() ?? null);
  if (cam) console.log(label, 'camera', JSON.stringify(cam));
  if (label === 'landscape') {
    // nothing of the top HUD reaches down into the middle third of the view
    for (const id of ['#stats', '#place', '#menuBtn', '#presenceBtn', '#chatBtn', '#goal']) { const b = boxes[id]; if (b && b.r > b.l) check(`${label}: ${id} stays in the top band`, b.b <= H * 0.42, JSON.stringify(b)); }
    // the controls stay in the bottom corners
    for (const id of ['#joy']) { const b = boxes[id]; if (b) check(`${label}: ${id} in the bottom-left corner`, b.r <= W * 0.36 && b.t >= H * 0.4, JSON.stringify(b)); }
  }

  // a sheet: « Ville partagée » (profile and invitation)
  await page.click('#presenceBtn');
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T).catch(() => {});
  await shot('sheet');
  const sheet = await rect('#modal .sheet');
  check(`${label}: the sheet fits the screen`, !!sheet && sheet.t >= insets.top && sheet.b <= H && sheet.r <= W - insets.right, JSON.stringify(sheet));
  await page.click('#modal .item.sh-x').catch(() => {});
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T).catch(() => {});

  // the phone
  await d(() => window.__dakar.phone());
  await page.waitForFunction(() => document.querySelector('#phone.on'), null, T).catch(() => {});
  await shot('phone');
  const dev = await rect('#phone .ph-device'), close = await rect('#phone .ph-close');
  check(`${label}: the phone fits inside the safe area`, !!dev && dev.l >= insets.left && dev.r <= W - insets.right && dev.b <= H, JSON.stringify(dev));
  check(`${label}: « Fermer » inside the safe area`, !!close && close.l >= insets.left && close.r <= W - insets.right && close.t >= insets.top, JSON.stringify(close));
  await d(() => window.__dakar.phone()); await page.waitForTimeout(200);
  await d(() => document.querySelector('#phone .ph-close')?.click());
  await page.waitForTimeout(300);

  // the chat panel
  await page.click('#chatBtn');
  await page.waitForFunction(() => document.querySelector('#chatPanel.on'), null, T).catch(() => {});
  await shot('chat');
  const panel = await rect('#chatPanel');
  check(`${label}: the chat panel fits inside the safe area`, !!panel && panel.t >= insets.top && panel.b <= H - insets.bottom && panel.r <= W - insets.right && panel.l >= insets.left, JSON.stringify(panel));
  await page.click('.chat-close').catch(() => {});

  // rotation at run time: the renderer and the camera follow the new size
  await page.setViewportSize({ width: H, height: W });
  await page.waitForTimeout(800);
  const after = await d(() => { const c = document.getElementById('c'); return { canvas: [c.width, c.height], css: [innerWidth, innerHeight], cam: window.__dakar.camera?.() ?? null }; });
  check(`${label}: rotating resizes the canvas to the new aspect`, Math.abs(after.canvas[0] / after.canvas[1] - after.css[0] / after.css[1]) < 0.02, JSON.stringify(after));
  if (errors.length) check(`${label}: no page errors`, false, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
