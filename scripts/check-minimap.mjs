// Minimap and full map checks (src/ui/minimap.ts, src/ui/fullmap.ts): the round minimap is visible while playing (clear of
// the wallet, the phone button, the joystick and the run gauge), names the neighbourhood and the nearest place, turns with
// the camera (the north marker moves), zooms out when moving fast, hides in a scene and in the phone, opens the full map on a
// tap; in the full map a place can be selected (name, what to do, distance and walking time) and marked, and the waypoint then
// shows on the minimap (route) and in the world (pin); the « Mini-carte » setting hides it; the 3D draw calls do not change.
// Usage: node scripts/check-minimap.mjs [baseUrl] [outDir]   (needs a running build, e.g. `npx vite preview --port 4385`)
// On a shared machine: flock /tmp/dakar-browser.lock node scripts/check-minimap.mjs …    ONLY=desktop|phone|landscape runs one viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4385/';
const out = process.argv[3] ?? 'docs/screenshots/minimap';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const overlap = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const RUNS = [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true], ['landscape', { width: 844, height: 390 }, true]];
for (const [label, viewport, touch] of RUNS.filter(r => !process.env.ONLY || r[0] === process.env.ONLY)) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); localStorage.removeItem('dakarrek.ui.minimap'); } catch { /* private mode */ } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const mm = () => d(() => window.__dakar.minimap());
  const rect = sel => d(s => { const e = document.querySelector(s); if (!e || e.getClientRects().length === 0) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }, sel);
  const tapAt = (x, y) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const press = sel => (touch ? page.locator(sel).tap() : page.locator(sel).click());
  const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${label}-${name}.png` }); };
  const settle = ms => page.waitForTimeout(ms);

  // ---- 1. on a street of the Plateau, by day
  await d(() => { window.__dakar.setHour(11); window.__dakar.teleport('plateau', 0, 10, 0); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.minimap().on, null, T).catch(() => {});
  await settle(1200);
  let m = await mm();
  const box = await rect('#minimap .mm-disc');
  check(`${label}: the minimap is visible while playing`, m.on && !!box, JSON.stringify({ on: m.on, size: m.size }));
  const sz = label === 'phone' ? [84, 130] : label === 'landscape' ? [80, 110] : [110, 150];
  check(`${label}: it is round, ${sz[0]}-${sz[1]} px, top corner`, !!box && Math.abs(box.width - box.height) < 1 && box.width >= sz[0] && box.width <= sz[1] && (box.left < 40 || (label === 'phone' && box.right > 390 - 40)) && box.top < 200, JSON.stringify(box));   // portrait phone: the right column (the left one keeps UI V2's cards)
  const others = ['#stats', '#menuBtn', '#joy', '#stamina', '#runBtn', '#actbar', '#hint', '#place'];
  const full = await rect('#minimap');
  const hits = [];
  for (const sel of others) { const r = await rect(sel); if (r && overlap(full, r)) hits.push(sel); }
  check(`${label}: it covers neither the wallet, the phone button, the joystick, the run gauge nor the action buttons`, hits.length === 0, hits.join(','));
  const inside = await d(() => { const r = document.getElementById('minimap').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
  check(`${label}: it stays on screen`, inside);
  check(`${label}: it draws the hub (places from the game's data, a route to the objective)`, m.places >= 8 && m.hubOk, JSON.stringify({ places: m.places, route: m.route, guide: m.guide }));
  const lit = await d(() => { const c = document.querySelector('#minimap canvas'), g = c.getContext('2d'); const px = g.getImageData(0, 0, c.width, c.height).data; let n = 0, colours = new Set(); for (let i = 0; i < px.length; i += 4 * 37) { if (px[i + 3] > 0) { n++; colours.add((px[i] >> 5) + ',' + (px[i + 1] >> 5) + ',' + (px[i + 2] >> 5)); } } return { n, colours: colours.size }; });
  check(`${label}: the canvas is painted (not blank)`, lit.n > 100 && lit.colours >= 6, JSON.stringify(lit));
  await shot('1-street');

  // ---- 2. names the neighbourhood and the nearest place
  await d(() => window.__dakar.teleport('plateau', 70, 8, 0));
  await page.waitForFunction(() => /Café Touba/.test(window.__dakar.minimap().street ?? ''), null, { timeout: 15000 }).catch(() => {});
  m = await mm();
  const labelText = await d(() => document.querySelector('#minimap .mm-name').innerText.replace(/\s+/g, ' '));
  check(`${label}: it names the neighbourhood and the nearest place (from the game's places)`, m.district === 'Sandaga' && /Café Touba/.test(m.street) && (label === 'phone' || /Sandaga/.test(labelText)), labelText);   // portrait phone: the district is in the place chip, the label names only the place
  await d(() => window.__dakar.teleport('pikine', -42, -50, 0));
  await page.waitForFunction(() => window.__dakar.minimap().district === 'Pikine', null, { timeout: 15000 }).catch(() => {});
  m = await mm();
  check(`${label}: another hub, another name (Pikine: near the room)`, m.district === 'Pikine' && /chez toi|Ma chambre|Dibiterie|Chez/.test(m.street), `${m.district} / ${m.street}`);
  await d(() => window.__dakar.teleport('plateau', 0, 10, 0));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.minimap().on, null, T).catch(() => {});
  await settle(800);

  // ---- 3. it turns with the camera: the north marker moves round the ring
  await d(() => window.__dakar.lookYaw(0)); await settle(600);
  const a = await mm();
  const pa = await d(() => { const c = document.querySelector('#minimap canvas'), g = c.getContext('2d'); return Array.from(g.getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 97 === 0)).join(','); });
  await d(() => window.__dakar.lookYaw(1.9)); await settle(700);
  const b = await mm();
  const pb = await d(() => { const c = document.querySelector('#minimap canvas'), g = c.getContext('2d'); return Array.from(g.getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 97 === 0)).join(','); });
  const dNorth = Math.abs(Math.atan2(Math.sin(b.north - a.north), Math.cos(b.north - a.north)));
  check(`${label}: the map turns with the camera (north marker moves ${dNorth.toFixed(2)} rad, heading ${a.yaw.toFixed(2)} → ${b.yaw.toFixed(2)})`, Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))) > 1.0 && dNorth > 1.0 && pa !== pb);   // the camera eases toward lookYaw(1.9): on a slow renderer it is only part way after the wait, which is enough to see the map turn
  check(`${label}: the north marker is where north is (heading ${b.yaw.toFixed(2)})`, Math.abs(Math.atan2(Math.sin(b.north - Math.atan2(-Math.sin(b.yaw), -Math.cos(b.yaw))), Math.cos(b.north - Math.atan2(-Math.sin(b.yaw), -Math.cos(b.yaw))))) < 0.01);

  // ---- 4. zoom out when moving fast (a sweep of the player's position, like a ride), back in when still
  const still = (await mm()).radius;
  // (in the page, 0.8 m per frame along the avenue: 8 m/s even at the game's 10 fps step clamp, up to 48 m/s whatever the frame rate; slow software rendering clamps the game's step)
  const fast = await d(() => new Promise(done => { let n = 0; const step = () => { if (n++ > 120) { done(window.__dakar.minimap()); return; } window.__dakar.place(-100 + 0.8 * n, -0.5, Math.PI / 2); requestAnimationFrame(step); }; step(); }));
  await settle(2500);
  const back = await mm();
  check(`${label}: it zooms out when moving fast and back in when still (${still} → ${fast.radius} m at ${fast.speed} m/s → ${back.radius})`, fast.radius > still + 20 && back.radius < fast.radius - 10);
  await d(() => window.__dakar.teleport('plateau', 0, 10, 0));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau', null, T);
  await settle(900);

  // ---- 5. the 3D scene is untouched: same draw calls with the minimap on and off
  await d(() => window.__dakar.lookYaw(0.4)); await settle(700);
  // the same frame rendered with the minimap shown and hidden, in one synchronous call (renderBreakdown renders the scene again)
  const dc = await d(() => { const on = window.__dakar.renderBreakdown().base; document.body.classList.add('mm-off'); const off = window.__dakar.renderBreakdown().base; document.body.classList.remove('mm-off'); return { on: on.calls, off: off.calls, trisOn: on.tris, trisOff: off.tris }; });
  check(`${label}: the minimap adds no 3D draw call or triangle (${dc.on} calls on, ${dc.off} off: it is a 2D canvas)`, dc.on === dc.off && dc.trisOn === dc.trisOff, JSON.stringify(dc));

  // ---- 6. hidden in a scene (like the other HUD bits)
  await d(() => window.__dakar.teleport('pikine'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.minimap().on, null, T).catch(() => {});
  await d(() => window.__dakar.scene('watch'));
  await page.waitForFunction(() => window.__dakar.sceneInfo(), null, T).catch(() => {});
  await page.waitForFunction(() => !window.__dakar.minimap().on, null, { timeout: 15000 }).catch(() => {});
  const inScene = await rect('#minimap');
  check(`${label}: it is hidden in a scene`, inScene === null && !(await mm()).on);
  if (touch) await page.locator('#sceneTag .st-stop').tap().catch(() => {}); else await page.locator('#sceneTag .st-stop').click().catch(() => {});
  await page.waitForFunction(() => !window.__dakar.sceneInfo() && window.__dakar.pos().mode === 'play', null, { timeout: 20000 }).catch(() => {});
  await settle(1000);
  check(`${label}: and back after the scene`, (await mm()).on && !!(await rect('#minimap')));
  await d(() => window.__dakar.teleport('plateau', 0, 10, 0));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'plateau' && window.__dakar.minimap().on, null, T).catch(() => {});
  await settle(800);

  // ---- 7. a tap opens the full map in the phone
  await press('#minimap');
  await page.waitForFunction(() => window.__dakar.phoneInfo().open && window.__dakar.phoneInfo().screen === 'carte', null, { timeout: 10000 }).catch(() => {});
  const pi = await d(() => window.__dakar.phoneInfo());
  check(`${label}: a tap on the minimap opens the full map (the phone's « Carte »)`, pi.open && pi.screen === 'carte', JSON.stringify(pi));
  await page.waitForFunction(() => !window.__dakar.minimap().on, null, { timeout: 15000 }).catch(() => {});
  check(`${label}: the minimap steps aside while the phone is open`, !(await rect('#minimap')));
  const fm = await d(() => { const c = document.querySelector('#phone .fm-cv'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, chips: document.querySelectorAll('#phone .fm-chip').length, hubs: document.querySelectorAll('#phone .ph-hub').length, travel: !!document.querySelector('#phone [data-hub].here'), walk: !!document.querySelector('#phone [data-app="quartier"]') }; });
  check(`${label}: the full map shows the hub, a legend by type, and keeps the neighbourhood travel and « choisir un repère à pied »`, !!fm && fm.w > 200 && fm.h > 200 && fm.chips >= 4 && fm.hubs === 4 && fm.travel && fm.walk, JSON.stringify(fm));
  await shot('7-fullmap');

  // legend filter
  const first = await d(() => document.querySelector('#phone .fm-chip').dataset.kind);
  await press('#phone .fm-chip >> nth=0');
  check(`${label}: a legend chip filters its type`, await d(() => document.querySelector('#phone .fm-chip').getAttribute('aria-pressed') === 'false'));
  await press('#phone .fm-chip >> nth=0');
  check(`${label}: and shows it again`, await d(() => document.querySelector('#phone .fm-chip').getAttribute('aria-pressed') === 'true'), first);

  // zoom buttons (the scale bar changes) and scroll zoom
  const cv0 = await d(() => document.querySelector('#phone .fm-cv').toDataURL().length);
  await press('#phone [data-fm="in"]'); await settle(300);
  const cv1 = await d(() => document.querySelector('#phone .fm-cv').toDataURL().length);
  check(`${label}: + zooms the map`, cv0 !== cv1);

  // ---- 8. select a place, read its card, mark it
  const target = await d(() => window.__dakar.minimapPlaces().find(p => /Gargote Chez Fatou/.test(p.name)));
  await press('#phone [data-fm="me"]'); await settle(300);
  await d(() => { for (let i = 0; i < 2; i++) document.querySelector('#phone [data-fm="out"]').click(); }); await settle(400);
  const at = await d(t => window.__dakar.fullMapAt(t.x, t.z), target);
  await tapAt(at.x, at.y); await settle(500);
  const card = await d(() => document.querySelector('#phone .fm-card').innerText.replace(/\s+/g, ' '));
  check(`${label}: tapping a place shows its name, what to do, the distance and the walking time`, /Gargote Chez Fatou/.test(card) && /\d+ (m|km)/.test(card) && /à pied ≈ \d+ (s|min)/.test(card) && /Ici :/.test(card) && /Marquer/.test(card), card);
  await shot('8-selected');
  await press('#phone .fm-mark'); await settle(500);
  const dest = await d(() => window.__dakar.destination());
  check(`${label}: « Marquer » sets the waypoint`, dest === target.id, String(dest));
  check(`${label}: and the card offers to remove it`, /Retirer le repère/.test(await d(() => document.querySelector('#phone .fm-card').innerText)));
  await shot('8b-marked');

  // ---- 9. back in the game: the waypoint on the minimap (route) and in the world (pin)
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__dakar.phoneInfo().open && window.__dakar.pos().mode === 'play', null, { timeout: 10000 }).catch(() => {});
  if (await d(() => window.__dakar.phoneInfo().open)) await press('#phone .ph-close');
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && window.__dakar.minimap().on, null, { timeout: 10000 }).catch(() => {});
  await settle(1500);
  m = await mm();
  const mk = await d(() => window.__dakar.uiMarkers());
  check(`${label}: the waypoint is on the minimap: its dotted route along the roads`, m.guide === 'Gargote Chez Fatou' && !!m.route && m.route.n >= 3 && m.route.length > 20, JSON.stringify({ guide: m.guide, route: m.route }));
  check(`${label}: and in the world (the way-finding pin on the place)`, mk.pin && Math.hypot(mk.pinAt.x - target.x, mk.pinAt.z - target.z) < 1.5, JSON.stringify(mk));
  await shot('9-waypoint');
  // the route follows the roads: every leg between road points is axis-aligned
  const legs = await d(() => window.__dakar.minimapRoute());
  check(`${label}: the route runs along the road grid`, legs.length >= 3 && legs.slice(1, -1).every((p, i, arr) => i === 0 || p.x === arr[i - 1].x || p.z === arr[i - 1].z), JSON.stringify(legs.slice(0, 5)));
  // unmark from the full map
  await press('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, { timeout: 10000 });
  if (!(await rect('#phone .fm-card'))) { await press('#phone [data-nav="home"]'); await press('#phone [data-app="carte"]'); }
  await settle(600);
  if (await rect('#phone .fm-card [data-fm="clear"]')) await press('#phone .fm-card [data-fm="clear"]');
  await settle(300);
  check(`${label}: « Retirer le repère » clears it`, (await d(() => window.__dakar.destination())) === null);

  // ---- 10. the setting hides it
  await press('#phone [data-nav="home"]'); await press('#phone [data-app="reglages"]');
  await press('#phone [data-act="minimap"]');
  check(`${label}: « Mini-carte » in Réglages switches it off`, await d(() => !window.__dakar.minimap().enabled && document.body.classList.contains('mm-off') && document.querySelector('[data-act="minimap"]').getAttribute('aria-pressed') === 'false'));
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__dakar.phoneInfo().open, null, { timeout: 10000 }).catch(() => {});
  await settle(800);
  check(`${label}: and it stays hidden while playing`, !(await rect('#minimap')));
  await press('#menuBtn'); await page.waitForFunction(() => window.__dakar.phoneInfo().open, null, { timeout: 10000 });
  await d(() => document.querySelector('#phone [data-app="reglages"]')?.click()); await settle(300);
  if (!(await d(() => !!document.querySelector('[data-act="minimap"]')))) { await press('#phone [data-nav="home"]'); await press('#phone [data-app="reglages"]'); }
  await press('#phone [data-act="minimap"]');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__dakar.phoneInfo().open, null, { timeout: 10000 }).catch(() => {});
  await settle(1000);
  check(`${label}: switched on again, it is back`, (await mm()).enabled && !!(await rect('#minimap')));

  check(`${label}: no page error`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}
await browser.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
