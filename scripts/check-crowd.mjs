// The reusable crowd in the arena's stands (src/crowd, docs/CROWD.md): seated on the tiers on a fight evening, the
// stands full; the crowd's levels of detail (full bodies next to you, rigged figures, far silhouettes) and their draw
// calls; each group reaction (applause, shout, stand up, grab, fall, celebrate) shown and captured; the gala's own
// moments (the entrance of each wrestler: his side shouts) reach the stands; no shader or page errors.
// Desktop 1280×720 (medium) and phone 390×844 (low); captures in docs/screenshots/crowd.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-crowd.mjs [baseUrl=http://localhost:4216/] [outDir=docs/screenshots/crowd] [--view=desktop|phone]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const [base = 'http://localhost:4216/', out = 'docs/screenshots/crowd'] = args.filter(a => !a.startsWith('--'));
const view = args.find(a => a.startsWith('--view='))?.slice(7) ?? 'all';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const VIEWS = [['desktop', { width: 1280, height: 720 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']].filter(([l]) => view === 'all' || l === view);

for (const [label, viewport, touch, quality] of VIEWS) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { if (!sessionStorage.getItem('crowd-check')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('crowd-check', '1'); } }, quality);
  const page = await ctx.newPage();
  const errors = [], shaderErrors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /shader|WebGLProgram|GLSL/i.test(m.text())) shaderErrors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.arena && window.__dakar.crowds, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const info = () => d(() => window.__dakar.arena.info());
  const stands = () => d(() => window.__dakar.crowds.list().find(c => c.name === 'arena-stands'));
  const frame = () => d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const shot = async name => { await page.waitForTimeout(600); await frame(); await page.screenshot({ path: `${out}/${label}-${name}.jpg`, type: 'jpeg', quality: 80 }); };

  // 1. A fight evening (Friday), a ticket, a free place on the tiers facing the gate side, seated.
  await d(() => { window.__dakar.teleport('pikine'); window.__dakar.setHour(18); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine' && !!window.__dakar.arena.info(), null, T);
  await d(() => { const x = window.__dakar; if (!x.arenaOut || !x.arenaOutDay) return; const t = x.arenaOut().day, fri = t + ((4 - (((t % 7) + 7) % 7)) + 7) % 7; x.arenaOutDay(fri); x.arena.day(fri); });
  await page.waitForFunction(() => window.__dakar.arena.info()?.street === 'doors', null, T);
  const a0 = await info(), C = a0.centre;
  await d(day => { window.__dakar.state.data.counters.arena_ticket_day = day; }, a0.day);
  const seat = await d(c => window.__dakar.arena.freeSeat(c.x + 9, c.z - 14), C);
  const r = Math.hypot(seat.x - C.x, seat.z - C.z), k = (r - 2.3) / r;
  await d(([c, s, k]) => window.__dakar.place(c.x + (s.x - c.x) * k, c.z + (s.z - c.z) * k, s.yaw + Math.PI), [C, seat, k]);
  await page.waitForFunction(() => window.__dakar.focus()?.kind === 'seat', null, T).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => /arena:stand/.test(window.__dakar.seated() ?? ''), null, T).catch(() => {});
  await page.waitForFunction(() => window.__dakar.arena.info().phase !== 'idle', null, T).catch(() => {});
  await page.waitForFunction(() => { const c = window.__dakar.arena.info().crowd; return c.present >= c.cap * 0.9; }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const s1 = await stands(), i1 = await info();
  check(`${label}: seated on a fight evening, the stands are full`, /arena:stand/.test((await d(() => window.__dakar.seated())) ?? '') && s1 && s1.present >= i1.crowd.cap * 0.9 && s1.present > 100, { present: s1?.present, cap: i1.crowd.cap });
  const nearWant = quality === 'low' ? 0 : quality === 'medium' ? 4 : 8;
  check(`${label}: levels of detail — ${nearWant} full bodies next to you, rigged figures, far silhouettes`, s1.near === nearWant && s1.mid + s1.far + s1.near + s1.hidden === s1.present && (quality === 'low' ? s1.far > s1.mid : s1.mid > 0), { near: s1.near, mid: s1.mid, far: s1.far, hidden: s1.hidden });
  check(`${label}: the whole crowd costs a handful of draw calls`, s1.drawCalls <= 4 + nearWant * 10, { drawCalls: s1.drawCalls });
  await shot('1-seated');

  // 2. Every reaction, group by group.
  const seen = {};
  for (const [group, kind, name] of [['all', 'applause', '2-applause'], ['left', 'shout', '3-shout-left'], ['all', 'standUp', null], ['all', 'grab', '4-grab'], ['all', 'fall', '5-fall'], ['right', 'celebrate', '6-celebrate-right']]) {
    const n = await d(([g, k]) => window.__dakar.crowds.react('arena-stands', g, k), [group, kind]);
    await page.waitForTimeout(1300);
    const s = await stands();
    seen[kind] = { joined: n, showing: s.kinds[kind] ?? 0, standing: s.standing };
    if (name) await shot(name);
    // let it settle before the next one (a stronger reaction would hold weaker ones off)
    await page.waitForFunction(() => window.__dakar.crowds.list().find(c => c.name === 'arena-stands').reacting === 0, null, { timeout: 30000 }).catch(() => {});
  }
  check(`${label}: each reaction is shown by its group (applause, shout, standUp, grab, fall, celebrate)`, Object.values(seen).every(v => v.joined > 10 && v.showing > 10), seen);
  check(`${label}: seated people stand for a fall and stay seated to clap`, seen.fall.standing > seen.applause.standing + 20, { applause: seen.applause.standing, fall: seen.fall.standing });

  // 3. The gala's own moments reach the stands: the entrance (his side shouts).
  await page.waitForFunction(() => { const i = window.__dakar.arena.info(); return i.phase === 'entrance' || i.phase === 'bout'; }, null, T).catch(() => {});
  await page.waitForFunction(() => (window.__dakar.arena.info().crowd.lod.kinds.shout ?? 0) > 10, null, { timeout: 60000 }).catch(() => {});
  const e = await info();
  check(`${label}: a wrestler walks in and his side rises to shout`, (e.crowd.lod.kinds.shout ?? 0) > 10 && e.crowd.cheering > 0, { phase: e.phase, kinds: e.crowd.lod.kinds, level: e.crowd.level });
  await shot('7-entrance');

  await frame();
  const dc = await d(() => window.__dakar.drawCalls());
  check(`${label}: draw calls of the whole frame stay within budget (${dc})`, dc < (touch ? 300 : 600), { dc });
  check(`${label}: the crowd's shaders compile (no WebGL program errors)`, shaderErrors.length === 0, shaderErrors.join(' | '));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results${view === 'all' ? '' : '-' + view}.json`, JSON.stringify({ when: new Date().toISOString(), base, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} crowd checks passed`);
process.exit(failed ? 1 : 0);
