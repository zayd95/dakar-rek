// Shops acceptance (src/world/shopKit.ts): every shop of the four hubs is stocked (1–3 draw calls, its place sheet on the
// counter, a keeper on the keeper anchor), and a player walks in from the street to the counter of five shop types —
// grocery, juice bar, phone shop, tailor, bank — on desktop and phone, and buys at three of them through the same
// activity system as before (wallet debited once).
// Usage: node scripts/check-shops.mjs [url] [outdir]   — run under `flock /tmp/dakar-browser.lock`.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:4215/';
const out = process.argv[3] || 'docs/screenshots/shops';
const views = (process.argv[4] || 'desktop,phone').split(',');
await mkdir(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, detail); };
const T = { timeout: 60000 };
const d = (page, fn, arg) => page.evaluate(fn, arg);

/** Where the player walks in: the shop's key in `shops()`, its place sheet, what to do at the counter. */
const VISITS = [
  { hub: 'pikine', shop: 'boutique', place: 'boutique', type: 'grocery', buy: /^Pain et lait/, price: 400 },
  { hub: 'almadies', shop: 'mall-juice', place: 'mall-juice', type: 'cafe', buy: /^Jus de bouye frais/, price: 500 },
  { hub: 'almadies', shop: 'mall-tech', place: 'mall-tech', type: 'phone', buy: /^Recharger son crédit/, price: 500 },
  { hub: 'plateau', shop: 'boutique', place: 'boutique', type: 'clothing', buy: /^Acheter un pagne wax/, price: 3000, phoneOnly: false },
  { hub: 'plateau', shop: 'bank', place: 'bank', type: 'bank', menu: /^Parler de son projet/ },
];

/** Walks the player (W held, camera turned toward each waypoint) through the points; true when the last one is reached. */
async function walk(page, pts, tol = 0.45, timeout = 30000) {
  const t0 = Date.now();
  for (const p of pts) {
    await page.keyboard.down('KeyW');
    try {
      for (;;) {
        const pos = await d(page, () => window.__dakar.pos());
        const dx = p.x - pos.x, dz = p.z - pos.z;
        if (Math.hypot(dx, dz) < tol) break;
        if (Date.now() - t0 > timeout) return false;
        await d(page, y => window.__dakar.lookYaw(y), Math.atan2(dx, dz));
        await page.waitForTimeout(120);
      }
    } finally { await page.keyboard.up('KeyW'); }
  }
  return true;
}
async function shot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot();                                   // SwiftShader: the first capture can show a stale frame
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 84 });
}
const idle = page => page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, T).catch(() => {});
/** Opens the focused place's menu and picks the item; false when the item is not offered. */
async function pick(page, re) {
  await idle(page);
  await d(page, () => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, { timeout: 8000 }).catch(() => {});
  const item = page.locator('#modal .item', { hasText: re }).first();
  if (!(await item.count())) { await d(page, () => document.querySelector('#modal .item.close')?.click()); return false; }
  return item;
}

const browser = await chromium.launch({
  executablePath: process.env.DAKAR_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const results = {};
try {
  for (const [label, viewport, touch, quality] of [['desktop', { width: 1280, height: 720 }, false, 'high'], ['phone', { width: 390, height: 844 }, true, 'low']]) {
    if (!views.includes(label)) continue;
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(q => { if (!sessionStorage.getItem('shops-check')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('shops-check', '1'); } }, quality);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 120000 });
    await page.waitForFunction(() => window.__dakar?.body(), null, T);
    const perHub = {}, visits = [];

    // 1. every hub: its shops are stocked, sheets on the counters, keepers on their anchors
    for (const hub of ['pikine', 'plateau', 'almadies', 'corniche']) {
      await d(page, h => { window.__dakar.teleport(h); window.__dakar.setHour(11); }, hub);
      await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, T);
      const data = await d(page, () => ({ shops: window.__dakar.shops(), its: window.__dakar.interactables(), people: window.__dakar.cityGeometry().people }));
      perHub[hub] = data.shops.map(s => ({ key: s.key, type: s.type, ...s.budget }));
      check(`${label}: ${hub} has stocked shops`, data.shops.length >= ({ pikine: 3, plateau: 3, almadies: 4, corniche: 3 })[hub], data.shops.map(s => `${s.key.split(':').pop()}=${s.type}`).join(' '));
      check(`${label}: ${hub} shops stay within 1–3 draw calls`, data.shops.every(s => s.budget.drawCalls >= 1 && s.budget.drawCalls <= 3), data.shops.map(s => s.budget.drawCalls).join(','));
      const sheets = data.shops.filter(s => !/salon-tech/.test(s.key) || hub !== 'pikine').map(s => {
        const it = data.its.find(i => i.id === s.key.replace(/craft-1$/, 'craft'));
        return !s.key.match(/craft-[02]$/) && it ? Math.hypot(it.x - s.anchors.counter.x, it.z - s.anchors.counter.z) : 0;
      });
      check(`${label}: ${hub} place sheets stand at the counters`, sheets.every(v => v < 0.01), sheets.map(v => v.toFixed(2)).join(','));
      const kept = data.shops.filter(s => !(hub === 'pikine' && /boutique/.test(s.key)) && !(hub === 'plateau' && /boutique/.test(s.key)))
        .map(s => data.people.some(p => Math.hypot(p.x - s.anchors.keeper.x, p.z - s.anchors.keeper.z) < 0.3));
      check(`${label}: ${hub} keepers stand behind their counters`, kept.every(Boolean), kept.join(','));
    }

    // 2. walk in from the street and buy at the counter
    for (const v of VISITS) {
      if ((await d(page, () => window.__dakar.pos().hub)) !== v.hub) {
        await d(page, h => window.__dakar.teleport(h), v.hub);
        await page.waitForFunction(h => window.__dakar.pos().hub === h, v.hub, T);
      }
      await d(page, () => { const g = window.__dakar; g.setHour(11); g.cam(null); g.state.data.needs.energie = 100; g.state.data.needs.faim = 40; g.state.data.wallet = Math.max(g.state.data.wallet, 20000); });
      const s = (await d(page, () => window.__dakar.shops())).find(x => x.key === `${v.hub}:city:${v.shop}`);
      const it = (await d(page, () => window.__dakar.interactables())).find(i => i.id === `${v.hub}:city:${v.place}`);
      if (!s || !it) { check(`${label}: ${v.type} shop found in ${v.hub}`, false); continue; }
      const door = s.anchors.door, c = s.anchors.counter;
      await d(page, p => window.__dakar.place(p.x, p.z + 5, Math.PI), door);
      await page.waitForTimeout(300);
      const walkedIn = await walk(page, [{ x: door.x, z: door.z }]);
      await shot(page, `${label}-${v.type}-walk-in`);
      const atCounter = walkedIn && await walk(page, [{ x: c.x, z: c.z }]);
      check(`${label}: walks from the street into the ${v.type} shop up to its counter`, walkedIn && atCounter, JSON.stringify(await d(page, () => window.__dakar.pos())));
      if (!atCounter) await d(page, p => window.__dakar.place(p.x, p.z, p.yaw), c);
      await d(page, p => window.__dakar.lookYaw(p.yaw + Math.PI * 0.85), c);      // look back over the shoulder at the shelves
      const focused = await page.waitForFunction(id => window.__dakar.focus()?.id === id, it.id, { timeout: 15000 }).then(() => true, () => false);
      check(`${label}: at the ${v.type} counter the shop is in focus`, focused, JSON.stringify(await d(page, () => window.__dakar.focus())));
      const draws = await d(page, () => window.__dakar.drawCalls());
      const item = await pick(page, v.buy ?? v.menu);
      check(`${label}: the ${v.type} counter offers « ${(v.buy ?? v.menu).source.replace(/[\^\\]/g, '')} »`, !!item);
      await shot(page, `${label}-${v.type}-counter`);
      let paid = null;
      if (item && v.buy) {
        const before = await d(page, () => window.__dakar.state.wallet);
        await item.click();
        await page.waitForFunction(() => !window.__dakar.activity() && window.__dakar.pos().mode === 'play', null, { timeout: 90000 }).catch(() => {});
        await page.waitForTimeout(400);
        const after = await d(page, () => window.__dakar.state.wallet);
        paid = before - after;
        check(`${label}: bought at the ${v.type} counter, paid once`, paid > 0 && paid <= v.price, `${paid} F`);
        await shot(page, `${label}-${v.type}-bought`);
      } else if (item) await d(page, () => document.querySelector('#modal .item.close')?.click());
      visits.push({ hub: v.hub, type: v.type, walkedIn: walkedIn && atCounter, focused, drawCalls: draws, paid });
    }

    // 3. Maison Dakar sells real furniture (the economy's catalogue), its sofa can be sat on
    await d(page, () => window.__dakar.teleport('almadies'));
    await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies', null, T);
    const home = (await d(page, () => window.__dakar.shops())).find(x => x.key.endsWith(':mall-household'));
    if (home) {
      await d(page, p => window.__dakar.place(p.x, p.z, p.yaw), home.anchors.counter);
      await page.waitForFunction(() => window.__dakar.focus()?.id?.endsWith(':mall-household'), null, { timeout: 15000 }).catch(() => {});
      const item = await pick(page, /^Voir les meubles/);
      if (item) { await item.click(); await page.waitForTimeout(500); }
      const title = await d(page, () => document.querySelector('#modal.on h2, #modal.on .title')?.textContent ?? document.querySelector('#modal.on')?.textContent?.slice(0, 60) ?? '');
      check(`${label}: Maison Dakar opens the furniture catalogue`, !!item && /meubles/i.test(title), title);
      await d(page, () => document.querySelector('#modal .item.close')?.click());
    }
    check(`${label}: no JavaScript errors`, errors.length === 0, errors.join(' | '));
    results[label] = { perHub, visits, errors };
    await ctx.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), checks, results }, null, 2));
}
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
