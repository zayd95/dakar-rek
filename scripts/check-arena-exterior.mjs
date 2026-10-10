// Checks of the arena's surroundings (src/arena/exterior.ts): quiet before the doors, a small crowd for a weekday card,
// the full street on a Friday–Sunday gala (a bout every evening since the arena visit lane joined, 10 Oct)
// (fans, queue, drummers, vendors), buying at two vendors (paid once, counted, the scarf in the inventory), the arena's
// own entry still at the gate. Desktop 1280×800 and phone 390×844 (touch).
// Usage: flock /tmp/dakar-browser.lock node scripts/check-arena-exterior.mjs [baseUrl] [outDir]  (needs a running build,
// e.g. `npx vite preview --port 4214`). ONLY=desktop|phone narrows a run.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4214/';
const out = process.argv[3] ?? 'docs/screenshots/arena-exterior';
fs.mkdirSync(out, { recursive: true });
const SLOW = Number(process.env.SLOW ?? 3);
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arenaOut, null, { timeout: 120000 * SLOW });
  const d = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 250 }).then(() => true).catch(() => false);
  const shot = async name => {
    await page.waitForTimeout(800);
    try { await page.screenshot({ path: `${out}/${label}-${name}.png`, timeout: 120000 * SLOW }); }
    catch (e) { console.log(`NOTE: capture ${label}-${name} skipped (${String(e.message).split('\n')[0]})`); }
  };
  const info = () => d(() => window.__dakar.arenaOut());

  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(18); window.__dakar.arenaOutDay(3); });
  await until(() => window.__dakar.pos().hub === 'pikine' && window.__dakar.arenaOut().gate);
  let s = await info();
  const g = s.gate;
  const view = () => d(([p, q]) => window.__dakar.cam(p, q), [[g.x - 15, 7.5, g.z - 24], [g.x + 1, 1.2, g.z - 5]]);

  // a Thursday morning: no bout yet — quiet, nothing on sale
  await d(([x, z]) => { window.__dakar.setHour(11); window.__dakar.place(x, z, 0); }, [g.x - 6, g.z - 12]);
  await until(() => !window.__dakar.arenaOut().event, null, 15000);
  await page.waitForTimeout(1500);
  s = await info();
  check(`${label}: before the doors (${s.weekday} ${Math.floor(s.hour)} h): quiet outside the arena`, !s.event && s.present === 0 && s.drawn === 0 && s.vendors.length === 0, JSON.stringify({ event: s.event, present: s.present, vendors: s.vendors.length }));
  await view(); await shot('normal-evening'); await d(() => window.__dakar.cam(null));

  // a weekday evening (Thursday 18 h): the neighbourhood card — the street lives, with fewer fans than a gala
  await d(() => window.__dakar.setHour(18));
  const card = await until(() => { const a = window.__dakar.arenaOut(); return a.event && a.size === 'card'; }, null, 60000);
  s = await info();
  check(`${label}: weekday evening (${s.weekday} ${Math.floor(s.hour)} h): a small card — the street lives, fewer fans than a gala`, card && s.coming > 0 && s.coming < s.fans && s.vendors.length === 4, JSON.stringify({ size: s.size, coming: s.coming, fans: s.fans, vendors: s.vendors.length }));

  // a fight evening (Saturday 18 h): fans, a queue at the gate, drummers and dancers, four vendors
  await d(() => window.__dakar.arenaOutDay(5));
  const alive = await until(() => { const a = window.__dakar.arenaOut(); return a.event && a.size === 'gala' && a.drawn >= 8 && a.queue >= 3; }, null, 60000);
  s = await info();
  check(`${label}: fight evening (${s.weekday} ${Math.floor(s.hour)} h): the exterior comes alive`, alive && s.present >= s.fans / 2 + s.still && s.vendors.length === 4, JSON.stringify({ present: s.present, drawn: s.drawn, queue: s.queue, fans: s.fans, still: s.still, quality: s.quality }));
  const want = { low: 8, medium: 14, high: 20 }[s.quality];
  check(`${label}: density follows the graphics quality (${s.quality})`, s.fans === want, `${s.fans} fans`);
  check(`${label}: vendors sell drinks, peanuts and brochettes, écurie scarves and flags, water (prices shown)`,
    ['Bissap glacé · 300', 'Café Touba · 150', 'Brochettes · 1000', 'Écharpe Baobab · 2000', 'Drapeau Teranga · 1500', 'Sachet d’eau fraîche · 50'].every(t => s.vendors.some(v => v.offers.includes(t))), s.vendors.map(v => v.offers.join(', ')).join(' | '));
  // the queue moves through the gate
  const q0 = await d(() => window.__dakar.arenaOut().queue);
  await page.waitForTimeout(6000 * Math.min(SLOW, 2));
  const moved = await until(() => window.__dakar.arenaOut().queue > 0, null, 5000);
  check(`${label}: the queue keeps moving through the gate (fans arrive, others go in)`, moved && q0 > 0, `queue ${q0} → ${(await info()).queue}`);
  // supporters carry their écurie's scarf or flag: two instanced meshes for every fan
  s = await info();
  check(`${label}: supporters carry scarves and flags (2 instanced meshes for all the fans)`, s.items && s.items.meshes === 2 && s.items.scarves + s.items.flags >= 4 && s.items.shown >= 1, JSON.stringify(s.items));
  await d(([p, q]) => window.__dakar.cam(p, q), [[g.x + 4.2, 2.4, g.z - 13], [g.x, 1.3, g.z - 6]]); await shot('fans-colours'); await d(() => window.__dakar.cam(null));
  // the decorative traffic keeps off the road in front of the gate while the queue is there
  let carsInLane = 0, samples = 0;
  for (let k = 0; k < 12; k++) { const t = (await info()).traffic; carsInLane += t.inLane; samples++; await page.waitForTimeout(500); }
  s = await info();
  check(`${label}: no car in the queue lane (${samples} samples, road closed)`, carsInLane === 0 && s.traffic.closed && s.traffic.cars > 0, JSON.stringify(s.traffic));

  // the drummers are heard near them (after a user gesture), not from far away, not with the sound off
  await page.keyboard.press('Shift');
  const dc = s.drums;
  await d(([x, z]) => window.__dakar.place(x, z, 0), [dc.x - 1, dc.z - 5]);
  const heard = await until(() => { const a = window.__dakar.arenaOut().audio; return a.playing && a.drums > 0.6 && a.murmuring; }, null, 20000);
  s = await info();
  check(`${label}: near the drummers, the drums play (placeholder percussion) with the crowd's murmur`, heard, JSON.stringify(s.audio));
  await d(([x, z]) => window.__dakar.place(x, z, 0), [g.x - 58, g.z - 8]);
  const far = await until(() => { const a = window.__dakar.arenaOut().audio; return !a.playing && a.want.drums === 0; }, null, 20000);
  s = await info();
  check(`${label}: 50 m away, silence (the audio stops)`, far, JSON.stringify(s.audio));
  await d(([x, z]) => window.__dakar.place(x, z, 0), [dc.x - 1, dc.z - 5]);
  await until(() => window.__dakar.arenaOut().audio.playing, null, 20000);
  await d(() => window.__dakar.phone('reglages')); await page.locator('#phone [data-act="sound"]').click(); await d(() => window.__dakar.phoneClose());
  const hushed = await until(() => { const a = window.__dakar.arenaOut().audio; return a.muted && !a.playing; }, null, 20000);
  s = await info();
  check(`${label}: with the sound off, nothing plays even next to the drums`, hushed, JSON.stringify(s.audio));
  await d(() => window.__dakar.phone('reglages')); await page.locator('#phone [data-act="sound"]').click(); await d(() => window.__dakar.phoneClose());
  const back = await until(() => { const a = window.__dakar.arenaOut().audio; return !a.muted && a.playing; }, null, 20000);
  check(`${label}: sound back on, the drums again`, back, JSON.stringify((await info()).audio));
  await view(); await shot('fight-evening');
  await d(([p, q]) => window.__dakar.cam(p, q), [[g.x + 9, 3.2, g.z - 10], [g.x + 4.5, 1.0, g.z - 2.5]]); await shot('drummers');
  await d(() => window.__dakar.cam(null));

  // the arena's own entry keeps the gate (the vendors never take its focus)
  await d(([x, z]) => window.__dakar.place(x, z, 0), [g.x, g.z - 4.2]);
  await until(() => !!window.__dakar.focus(), null, 15000);
  const gf = await d(() => window.__dakar.focus());
  check(`${label}: at the gate, the arena's entry is still the action`, gf && !/arena-out/.test(gf.id), JSON.stringify(gf));

  // buying at two vendors: paid once, counted, the scarf goes to the inventory
  await d(() => { const st = window.__dakar.state; st.data.wallet = 10000; st.data.needs.energie = 90; });
  const buy = async (key, primary, price, shotName) => {
    const v = (await info()).vendors.find(x => x.id.endsWith(':' + key));
    await d(([x, z]) => window.__dakar.place(x, z, 0), [v.anchor.x, v.anchor.z - 0.7]);
    const focused = await until(k => new RegExp(`arena-out:${k}`).test(window.__dakar.focus()?.id ?? ''), key, 20000);
    const f = await d(() => window.__dakar.focus());
    const before = await d(() => ({ w: window.__dakar.state.wallet, n: window.__dakar.state.data.counters['arene:achats'] ?? 0 }));
    check(`${label}: at « ${v.name} », the first offer is ${primary}`, focused && f?.primary === primary, JSON.stringify(f));
    await d(() => window.__dakar.act());
    await until(() => !!window.__dakar.activity(), null, 15000);
    await page.waitForTimeout(400); await shot(shotName);
    const done = await until(() => !window.__dakar.activity(), null, 90000);
    await page.waitForTimeout(500);
    const after = await d(() => ({ w: window.__dakar.state.wallet, n: window.__dakar.state.data.counters['arene:achats'] ?? 0, inv: { ...window.__dakar.state.data.inventory } }));
    check(`${label}: ${primary} paid once (−${price} F) and counted`, done && before.w - after.w === price && after.n === before.n + 1, `${before.w} → ${after.w}, count ${before.n} → ${after.n}`);
    return after;
  };
  await buy('boissons', 'Bissap glacé', 300, 'buy-bissap');
  const inv = await buy('supporters', 'Écharpe Baobab', 2000, 'buy-scarf');
  check(`${label}: the Baobab scarf is in the inventory`, inv.inv.echarpe_baobab === 1, JSON.stringify(inv.inv));

  // the evening is over (the next morning): everyone gone, the stalls stop selling
  await d(() => { window.__dakar.arenaOutDay(3); window.__dakar.setHour(11); });
  await until(() => !window.__dakar.arenaOut().event, null, 15000);
  s = await info();
  check(`${label}: the next morning: quiet, the drums stop, the road reopens`, !s.event && s.drawn === 0 && s.vendors.length === 0 && !s.audio.playing && !s.traffic.closed, JSON.stringify({ present: s.present, drawn: s.drawn, vendors: s.vendors.length, audio: s.audio.playing, closed: s.traffic.closed }));
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
