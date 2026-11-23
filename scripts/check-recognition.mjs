// M1-C, C2, in the real game on a phone: familiar people greet as the player walks up, remember a favour and a bout, and
// none of it can be farmed (src/social/walkup.ts, memory.ts). Reload keeps it; New Game forgets it.
// Usage: node scripts/check-recognition.mjs [baseUrl] [shotsDir]   (a worker, so the presence socket answers: wrangler dev or the preview)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8787/', shots = process.argv[3] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const T = { timeout: 180000 };
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await context.addInitScript(() => {
  try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ }
  // toasts vanish after a few seconds: a page-side log keeps every one that was shown, in order
  window.__toastLog = [];
  const seen = () => { const t = document.getElementById('toast')?.textContent?.replace(/\s+/g, ' ').trim(); if (t && window.__toastLog[window.__toastLog.length - 1] !== t) window.__toastLog.push(t); };
  new MutationObserver(seen).observe(document, { childList: true, subtree: true, characterData: true });
});
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, arg) => page.evaluate(fn, arg);

const ready = async () => {
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(11); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(1500);
};
// the toast holds its text twice in the page (the visible line and its live-region copy) and its Wolof glosses come in after the
// first paint: one copy, without the glosses, is the line; consecutive repeats are one toast
const toasts = async () => {
  const out = [];
  for (const raw of await d(() => window.__toastLog.slice())) {
    const t = raw.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().replace(/^(.{8,}?)\1$/, '$1');
    if (t && out[out.length - 1] !== t) out.push(t);
  }
  return out;
};
const spoken = async who => (await toasts()).filter(t => t.startsWith(`${who} : «`));
const where = id => d(i => window.__dakar.npcWhere(i), id);
/** Walks the player up to someone (a teleport to 3 m: the game then sees the approach) and waits for what is said. */
const approach = async (id, ms = 2500) => {
  const w = await where(id);
  await d(k => window.__dakar.place(k.x + 3, k.z + 3, Math.PI), w);
  await page.waitForTimeout(ms);
};
const away = async id => { const w = await where(id); await d(k => window.__dakar.place(k.x + 18, k.z + 18, 0), w); await page.waitForTimeout(700); };
const hour = h => d(x => window.__dakar.setHour(x), h);
/** Opens someone's menu the way the player does (stand next to them, act). */
const openMenuOf = async id => {
  const w = await where(id);
  await d(k => window.__dakar.place(k.x + 1.2, k.z + 1.2, Math.PI), w);
  await page.waitForFunction(i => (window.__dakar.focus()?.id ?? '') === i, `npc:${id}`, T).catch(() => {});
  await page.waitForTimeout(400);
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => document.querySelector('#modal.on'), null, T); await page.waitForTimeout(600);
};
const closeSheet = async () => { if (await d(() => !!document.querySelector('#modal.on'))) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); } if (await d(() => !!document.querySelector('#modal.on'))) { await page.locator('#modal.on .close').first().click().catch(() => {}); await page.waitForTimeout(300); } };
const idle = () => page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);
const counter = k => d(x => window.__dakar.state.data.counters[x] ?? 0, k);
const flag = f => d(x => window.__dakar.state.data.flags.includes(x), f);
const buySugar = async () => {
  const before = await counter('served_mamadou');
  await page.locator('#modal.on .item', { hasText: 'Sucre et thé' }).first().click();
  await page.waitForFunction(n => (window.__dakar.state.data.counters.served_mamadou ?? 0) > n, before, T);
  await idle(); await page.waitForTimeout(400);
};

await page.goto(`${base}?debug&touch`, { timeout: 120000 });
await ready();
await d(() => { const x = window.__dakar.state.data; x.wallet = 5000; x.needs.energie = 90; x.needs.faim = 80; });

// 1. a stranger is not greeted
await approach('mamadou', 3500);
check('a stranger passing Mamadou is not greeted', (await spoken('Mamadou')).length === 0, JSON.stringify(await toasts()));
await away('mamadou');

// 2. three real purchases make a regular; the next approach is a greeting
await openMenuOf('mamadou'); await closeSheet();                 // the shop's own sheet is the counter; the person's menu counts a visit
for (let i = 0; i < 3; i++) {
  const w = await where('mamadou'), shop = await d(() => { const t = window.__dakar.interactables().find(x => x.id.startsWith('pikine:') && x.id.includes(':city:boutique')); return t ? { x: t.x, z: t.z, id: t.id } : null; });
  await d(k => window.__dakar.place(k.x, k.z + 1.5, Math.PI), shop);
  await page.waitForFunction(id => (window.__dakar.focus()?.id ?? '') === id, shop.id, T).catch(() => {});
  await page.waitForTimeout(500);
  await d(() => window.__dakar.act()); await page.waitForFunction(() => document.querySelector('#modal.on'), null, T); await page.waitForTimeout(600);
  await buySugar(); await closeSheet(); void w;
}
check('three purchases made Mamadou recognise a regular', await flag('regular_mamadou'));
await away('mamadou'); await hour(12); await page.waitForTimeout(9000);          // the hour of the purchases was greeted by the talk; the greeting gap (8 s of play) is over
await approach('mamadou', 3000);
const g1 = (await spoken('Mamadou')).pop();
check('walking up to him now: a few words in his name', !!g1 && /^Mamadou : « .{3,70} »$/.test(g1), g1);
if (shots) await page.screenshot({ path: `${shots}/walkup-regular.png` });

// 3. no spam: walking away and back in the same hour says nothing; the next hour, a different line
const n1 = (await spoken('Mamadou')).length;
await away('mamadou'); await page.waitForTimeout(9000); await approach('mamadou', 3000);
check('the same hour: no second greeting', (await spoken('Mamadou')).length === n1, `${n1} → ${(await spoken('Mamadou')).length}`);
await away('mamadou'); await hour(13); await page.waitForTimeout(9000); await approach('mamadou', 3000);
const g2 = (await spoken('Mamadou')).pop(), n2 = (await spoken('Mamadou')).length;
check('the next hour: greeted again, and not with the same line', n2 === n1 + 1 && g2 !== g1, `${g1} → ${g2}`);
check('walking up earned nothing: still the three counted services', (await counter('served_mamadou')) === 3, String(await counter('served_mamadou')));

// 4. a favour is remembered: Mame
await d(() => { window.__dakar.state.data.counters.actions = Math.max(1, window.__dakar.state.data.counters.actions ?? 0); });
await away('mame'); await approach('mame', 3000);
check('before the favour Mame (never met) says nothing', (await spoken('Mame')).length === 0, JSON.stringify(await spoken('Mame')));
await away('mame');
await openMenuOf('mame');
await page.locator('#modal.on .item', { hasText: 'Un coup de main' }).first().click(); await page.waitForTimeout(500);
await page.locator('#modal.on .item', { hasText: 'j’arrive' }).first().click(); await page.waitForTimeout(500);
await page.locator('#modal.on .item', { hasText: 'Continuer' }).first().click().catch(() => {}); await page.waitForTimeout(500); await closeSheet(); await idle();
check('the favour is done (Mame has been helped)', await flag('mame_helped'));
check('right after it she does not greet again: the talk was the greeting', (await spoken('Mame')).length === 0, JSON.stringify(await spoken('Mame')));
await away('mame'); await hour(14); await page.waitForTimeout(9000); await approach('mame', 3000);
const m1 = (await spoken('Mame')).pop();
check('later, Mame thanks the player for the gas bottle', !!m1 && /bonbonne/.test(m1), JSON.stringify(await spoken('Mame')));
await away('mame'); await hour(15); await page.waitForTimeout(9000); await approach('mame', 3000);
const m2 = (await spoken('Mame')).pop();
check('and says it once: the next time she greets differently', !!m2 && m2 !== m1 && !/bonbonne/.test(m2), m2);

// 5. a bout changes the reaction
await openMenuOf('ibou'); await closeSheet(); await idle();
await away('ibou'); await hour(16); await page.waitForTimeout(9000); await approach('ibou', 3000);
const i1 = (await spoken('Ibou')).pop();
await d(() => { const s = window.__dakar.state.data; const day = Math.floor(window.__dakar.cityDay?.() ?? 0); s.career.bouts.push({ at: 1, day: Number.MAX_SAFE_INTEGER, mode: 'classe', opp: 'Lamine', style: 'Frappeur', level: 2, res: 'V', how: 'projection', purse: 0, pts: 1 }); void day; });
const day = await d(() => window.__dakar.cityDay?.() ?? null);
check('the game exposes the city day (for this check)', day !== null, String(day));
if (day !== null) {
  await d(dy => { const b = window.__dakar.state.data.career.bouts; b[b.length - 1].day = dy; }, day);
  await away('ibou'); await hour(17); await page.waitForTimeout(9000); await approach('ibou', 3000);
  const i2 = (await spoken('Ibou')).pop();
  check('after a win Tonton Ibou greets differently: he has heard of the bout', !!i2 && i2 !== i1 && /combat/.test(i2), `${i1} → ${i2}`);
  await d(() => { const b = window.__dakar.state.data.career.bouts; b[b.length - 1].res = 'D'; });
  await away('ibou'); await hour(18); await page.waitForTimeout(9000); await approach('ibou', 3000);
  const i3 = (await spoken('Ibou')).pop();
  check('after a defeat he consoles instead', !!i3 && i3 !== i2 && /perdu/.test(i3), i3);
}

// 6. no farming: chatting ten times with someone is not ten services
await away('modou'); await d(() => { delete window.__dakar.state.data.counters.served_modou; });
await openMenuOf('modou');
for (let k = 0; k < 4; k++) {
  const before = await counter('chats');
  await page.locator('#modal.on .item', { hasText: 'Discuter' }).first().click();
  await page.waitForFunction(n => (window.__dakar.state.data.counters.chats ?? 0) > n, before, T).catch(() => {});
  await idle(); await page.waitForTimeout(300);
  if (k < 3) { await openMenuOf('modou'); }
}
await closeSheet();
check('four chats with Modou in one hour: counted once, not a regular', (await counter('served_modou')) <= 1 && !(await flag('regular_modou')), `served ${await counter('served_modou')}`);

// 7. reload keeps it; New Game forgets it
await away('mamadou'); await hour(22); await page.waitForTimeout(9000); await approach('mamadou', 3500);     // greeted in hour 22, then saved
const before22 = (await spoken('Mamadou')).pop();
await d(() => window.dispatchEvent(new Event('pagehide')));
const saved = await d(() => JSON.parse(localStorage.getItem('dakarrek.guest.save.v6') ?? 'null'));
check('the v6 save holds the regular, the favour and the greeting memory', !!saved && saved.schemaVersion === 6 && saved.flags.includes('regular_mamadou') && saved.flags.includes('mame_helped') && Object.keys(saved.counters).some(k => k.startsWith('wu_mame_helped') || k === 'wu_at_mamadou'), JSON.stringify(Object.keys(saved?.counters ?? {}).filter(k => k.startsWith('wu_'))));
await page.reload({ waitUntil: 'load' }); await ready();
await hour(22);
await approach('mamadou', 3500);
check('after a reload he still knows the player, and (from the save) the hour was already greeted: no second greeting', await flag('regular_mamadou') && (await spoken('Mamadou')).length === 0, JSON.stringify(await spoken('Mamadou')));
await away('mamadou'); await hour(23); await page.waitForTimeout(9000); await approach('mamadou', 3500);
const all = await spoken('Mamadou'), after = all[all.length - 1];
check('in a new hour after the reload he greets again, with a different line than the one saved before it', !!after && !!all.length && after !== before22, `${before22} → ${after}`);
await page.keyboard.press('Escape'); await page.locator('[data-app="reglages"]').first().click(); await page.locator('[data-act="new"]').click(); await page.locator('[data-act="wipe"]').click();
await ready();
await approach('mamadou', 3500);
check('after New Game he is a stranger again: no greeting', (await spoken('Mamadou')).length === 0 && !(await flag('regular_mamadou')), JSON.stringify(await spoken('Mamadou')));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`recognition: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
