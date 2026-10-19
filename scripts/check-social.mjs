// M1-C, C4, two real browsers on the local worker: nearby real players are noticed quietly, can greet each other with a gesture
// both see, a player who sits takes the place for the other, and blocking still hides everything (src/multiplayer/social.ts).
// Usage: node scripts/check-social.mjs [baseUrl] [shotsDir]   (a worker with the presence socket: wrangler dev --local, or the preview)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8787/', shots = process.argv[3] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const T = { timeout: 180000 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${String(detail).slice(0, 300)}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const open = async (i, viewport, name, look) => {
  const ctx = await browser.newContext({ viewport, hasTouch: i === 0, isMobile: i === 0 });
  await ctx.addInitScript(([n, l]) => {
    localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: n, look: l }));
    window.__toastLog = [];
    const seen = () => { const t = document.getElementById('toast')?.textContent?.replace(/\s+/g, ' ').trim(); if (t && window.__toastLog[window.__toastLog.length - 1] !== t) window.__toastLog.push(t); };
    new MutationObserver(seen).observe(document, { childList: true, subtree: true, characterData: true });
  }, [name, look]);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.goto(`${base}?debug${i === 0 ? '&touch' : ''}`);
  await page.waitForFunction(() => window.__dakar?.presence().status === 'online', null, { timeout: 120000 });
  return page;
};
const a = await open(0, { width: 390, height: 844 }, 'Moussa', 0);
const b = await open(1, { width: 1280, height: 720 }, 'Awa', 1);
for (const p of [a, b]) {
  await p.evaluate(() => { window.__dakar.teleport('pikine'); });
  await p.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
}
// both are in the same room of Pikine
await a.waitForFunction(() => window.__dakar.presence().peers.length === 1, null, T);
await b.waitForFunction(() => window.__dakar.presence().peers.length === 1, null, T);
const idA = await a.evaluate(() => window.__dakar.presence().id), idB = await b.evaluate(() => window.__dakar.presence().id);
const toasts = async p => (await p.evaluate(() => window.__toastLog.slice())).map(t => t.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().replace(/^(.{8,}?)\1$/, '$1'));
const has = async (p, re) => (await toasts(p)).some(t => re.test(t));
const waitToast = (p, re, ms = 25000) => p.waitForFunction(src => window.__toastLog.some(t => new RegExp(src).test(t.replace(/\s+/g, ' '))), re.source, { timeout: ms }).then(() => true, () => false);
const social = p => p.evaluate(() => window.__dakar.social());
const place = (p, x, z) => p.evaluate(([x, z]) => window.__dakar.place(x, z, 0), [x, z]);
const focusId = p => p.evaluate(() => window.__dakar.focus()?.id ?? null);

// a street spot clear of everything for the first meeting: where A starts, B ten metres east
let start = null;
for (const [x, z] of [[-4, -30], [0, 0], [20, -60], [60, 0], [-60, 60], [100, 40], [-30, 30], [40, 60]]) {      // a stretch of street with no door, seat or stall in reach (it would outrank the other player)
  await place(b, x + 60, z); await place(a, x, z); await sleep(900);
  const fa = await focusId(a); await place(a, x + 2.2, z); await place(b, x, z); await sleep(900);
  const fb = await focusId(b), fa2 = await focusId(a);
  console.log('probe', x, z, fa, fb, fa2);
  if (fa === null && (fb === null || fb?.startsWith('peer:')) && (fa2 === null || fa2?.startsWith('peer:'))) { start = { x, z }; break; }
}
if (!start) { console.log('no clear stretch of street found'); process.exit(1); }
console.log('meeting spot', JSON.stringify(start));
await place(b, start.x + 10, start.z); await sleep(300);

// 1. noticing: a quiet line, a dot on the map, nothing else
check('player A is told, in one quiet line, that a player came close', await waitToast(a, /Awa est près de toi/), JSON.stringify(await toasts(a)));
check('the minimap holds a dot for the real player nearby (and only that)', (await social(a)).players.length === 1 && (await social(a)).players[0].name === 'Awa', JSON.stringify((await social(a)).players));
await sleep(1500);
check('the line is said once for a player: no second one while B stays close', (await toasts(a)).filter(t => /Awa est près de toi/.test(t)).length === 1);

// 2. greeting: B comes next to A; A greets B; both see it
await place(b, start.x + 2.2, start.z);
await a.waitForFunction(id => window.__dakar.focus()?.id === 'peer:' + id, idB, { timeout: 40000 }).catch(async () => console.log('focus is', await focusId(a), JSON.stringify(await a.evaluate(() => window.__dakar.pos()))));
check('next to each other, the other player is a target: « Saluer »', (await focusId(a)) === 'peer:' + idB);
if (shots) await a.screenshot({ path: `${shots}/social-prompt.png` });
await a.evaluate(() => window.__dakar.act());
check('A sees what they did', await waitToast(a, /Tu salues Awa/), JSON.stringify(await toasts(a)));
check('B is told, in particular, that A greets them', await waitToast(b, /Moussa te salue/), JSON.stringify(await toasts(b)));
await b.waitForFunction(id => window.__dakar.social().glyphs[id] === 'on', idA, T).catch(() => {});
check('B sees the gesture over A (a glyph and a short pose)', (await social(b)).glyphs[idA] === 'on', JSON.stringify((await social(b)).glyphs));
if (shots) await b.screenshot({ path: `${shots}/social-greeting-seen-by-B.png` });
check('what A sent is only a kind, a counter and who it was for', JSON.stringify((await social(a)).emo) === JSON.stringify({ k: 'salut', n: 1, to: idB }), JSON.stringify((await social(a)).emo));
await b.waitForFunction(id => window.__dakar.social().glyphs[id] === null, idA, { timeout: 15000 }).catch(() => {});
check('the gesture is brief: the glyph is gone a few seconds later', (await social(b)).glyphs[idA] === null);

// 3. replying, and not spamming
await b.waitForFunction(id => window.__dakar.focus()?.id === 'peer:' + id, idA, T);
await b.evaluate(() => window.__dakar.act());
check('B answers, A is told', await waitToast(a, /Awa te salue/), JSON.stringify(await toasts(a)));
await b.evaluate(() => window.__dakar.act());
check('a second gesture right away is refused politely (rate limit)', await waitToast(b, /Doucement/), JSON.stringify(await toasts(b)));

// 4. distance: the chat's radius bounds what is shown
await place(b, start.x + 45, start.z); await sleep(3500);
await a.evaluate(() => window.__dakar.socialEmote('bravo'));
await sleep(2500);
check('45 m away B sees nothing (beyond the proximity radius)', (await social(b)).glyphs[idA] === null || (await social(b)).glyphs[idA] === undefined);
await sleep(3000);
await place(b, start.x + 18, start.z); await sleep(2500);
await a.evaluate(() => window.__dakar.socialEmote('rire'));
await b.waitForFunction(id => window.__dakar.social().glyphs[id] === 'on', idA, { timeout: 20000 }).catch(() => {});
check('within the radius B sees it (without being told: it was not meant for them)', (await social(b)).glyphs[idA] === 'on' && !(await has(b, /rit avec toi/)), JSON.stringify((await social(b)).glyphs));

// 5. blocking: B blocks A (chat panel); A's gestures vanish for B, and A is no longer a target
await place(b, start.x + 2.2, start.z); await sleep(3500);
await b.waitForFunction(id => window.__dakar.focus()?.id === 'peer:' + id, idA, T);
await b.click('#chatBtn'); await b.click('.chat-tabs button[data-tab="dm"]'); await b.locator('.chat-person-open', { hasText: 'Moussa' }).click(); await b.click('.chat-block');
await b.waitForFunction(() => window.__dakar.presence().visible === 0, null, T);
await b.click('.chat-close').catch(() => {});
await sleep(800);
check('blocked: A is not a target any more for B', (await focusId(b)) !== 'peer:' + idA, String(await focusId(b)));
await sleep(2600);
await a.evaluate(() => window.__dakar.socialEmote('salut'));
await sleep(2500);
check('blocked: A’s gesture is not shown to B (and A is on B’s hidden list)', !(await social(b)).glyphs[idA] && (await social(b)).hidden.includes(idA), JSON.stringify(await social(b)));
await b.click('#chatBtn'); await b.click('.chat-tabs button[data-tab="dm"]'); await b.locator('.chat-person-open', { hasText: 'Moussa' }).click(); await b.click('.chat-block');
await b.waitForFunction(() => window.__dakar.presence().visible === 1, null, T);
await b.click('.chat-close').catch(() => {});
check('unblocked: A is visible and a target again', true);

// 6. sitting together: A sits on a bench, B sees the place taken and sits next to them
const bench = await a.evaluate(() => {
  const all = window.__dakar.seatsHere().filter(s => s.kind === 'bench' && !s.occupant);
  const groups = {}; for (const s of all) (groups[s.id.replace(/:\d+$/, '')] ??= []).push(s);
  const g = Object.values(groups).find(x => x.length >= 2); return g ? g.slice(0, 2) : null;
});
check('a bench with two places exists in the street', !!bench, JSON.stringify(bench));
if (bench) {
  const [s0, s1] = bench;
  await place(b, s1.x + 1.0, s1.z + 1.0);
  await place(a, s0.x, s0.z + 0.9);
  await a.waitForFunction(id => (window.__dakar.focus()?.id ?? '').endsWith(id), s0.id, T).catch(() => {});
  await a.evaluate(() => window.__dakar.act());
  await b.waitForFunction(([id, who]) => window.__dakar.presence().peers.find(p => p.id === who)?.clip === 'Sit', [s0.id, idA], T).catch(() => {});
  check('A sits on the bench (B sees A seated)', (await b.evaluate(id => window.__dakar.presence().peers.find(p => p.id === id)?.clip, idA)) === 'Sit');
  await b.waitForFunction(id => window.__dakar.social().peerSeats.some(s => s.id === id), s0.id, { timeout: 20000 }).catch(() => {});
  check('for B, the place under A is taken (by that player)', (await social(b)).peerSeats.some(s => s.id === s0.id && s.by === 'peer:' + idA), JSON.stringify((await social(b)).peerSeats));
  await place(b, s1.x, s1.z + 0.9);
  await b.waitForFunction(id => (window.__dakar.focus()?.id ?? '').endsWith(id), s1.id, T).catch(() => {});
  check('B is offered the free place next to A, not A’s', ((await focusId(b)) ?? '').endsWith(s1.id), String(await focusId(b)));
  await b.evaluate(() => window.__dakar.act());
  await a.waitForFunction(([id, who]) => window.__dakar.presence().peers.find(p => p.id === who)?.clip === 'Sit', [s1.id, idB], T).catch(() => {});
  check('B sits next to A: both are seated, each seen by the other', (await a.evaluate(id => window.__dakar.presence().peers.find(p => p.id === id)?.clip, idB)) === 'Sit', '');
  await a.waitForFunction(id => window.__dakar.social().peerSeats.some(s => s.id === id), s1.id, { timeout: 20000 }).catch(() => {});
  check('and for A the place next to them is taken in turn', (await social(a)).peerSeats.some(s => s.id === s1.id && s.by === 'peer:' + idB), JSON.stringify((await social(a)).peerSeats));
  const d = Math.hypot(s0.x - s1.x, s0.z - s1.z);
  check('two people on one bench, side by side (not through each other)', d >= 0.8, `${d.toFixed(2)} m`);
  if (shots) { await a.screenshot({ path: `${shots}/social-bench-A.png` }); await b.screenshot({ path: `${shots}/social-bench-B.png` }); }
}
check('no page errors in either browser', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`social: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
