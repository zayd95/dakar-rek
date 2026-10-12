// The reusable crowd on a fight evening (src/crowd, docs/CROWD.md): fans arriving by taxi and car rapide and walking to
// the queue; seated on the tiers, the stands full; the crowd's levels of detail (full bodies next to you, rigged figures, far silhouettes) and their draw
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

  // Every wait below waits for a state, never for a fixed time: SwiftShader may run the game at a few frames a second.
  const LONG = { timeout: 240000 };
  const standsOf = () => window.__dakar.crowds.list().find(c => c.name === 'arena-stands');

  // 0. Getting there: a taxi pulls in at the west corner and drops fans who walk to the queue; the car rapide lets a group off at « Arène ».
  await d(() => window.__dakar.place(2.5, -28, Math.PI));
  await d(() => window.__dakar.arrivals.speed(4));                                // the arrivals' clock runs 4× for the check
  await page.waitForFunction(() => window.__dakar.arrivals.info()?.active, null, LONG).catch(() => {});
  const ar0 = await d(() => window.__dakar.arrivals.info());
  await d(() => window.__dakar.arrivals.taxi(0, true));                           // starts 25 m before its stop
  await page.waitForFunction(t0 => { const i = window.__dakar.arrivals.info(); return i.dropped.taxi > t0 && i.crowd.present > 0; }, ar0?.dropped.taxi ?? 0, LONG).catch(() => {});
  const ar1 = await d(() => window.__dakar.arrivals.info());
  check(`${label}: on a fight evening a taxi pulls in by the arena and drops fans`, ar0?.active && ar1.dropped.taxi > ar0.dropped.taxi && ar1.crowd.present > 0, { active: ar0?.active, dropped: ar1.dropped, walking: ar1.walking, cabs: ar1.cabs });
  await shot('0-taxi-fans');
  // fight evenings: Ligne 23's day route is parked, its evening route 23s calls at the arena (« Arène » is its stop 0 too)
  const rapideLine = await d(() => window.__dakar.transport?.lines?.().find(l => l.id.startsWith('23') && l.on)?.id ?? '23s');
  const nextRapide = await d(r => window.__dakar.transport?.nextAt?.(r, 0) ?? null, rapideLine);
  if (typeof nextRapide === 'number' && nextRapide > 2) await d(s => window.__dakar.transport.warp(s), nextRapide - 2);
  await page.waitForFunction(r0 => window.__dakar.arrivals.info().dropped.rapide > r0, ar1.dropped.rapide, LONG).catch(() => {});
  const ar2 = await d(() => window.__dakar.arrivals.info());
  check(`${label}: the Ligne 23 car rapide lets a group of fans off at « Arène »`, ar2.dropped.rapide > ar1.dropped.rapide, { next: nextRapide, dropped: ar2.dropped });
  await page.waitForFunction(() => window.__dakar.arrivals.info().dropped.arrived > 0, null, LONG).catch(() => {});
  const ar3 = await d(() => window.__dakar.arrivals.info());
  check(`${label}: the fans walk to the tail of the queue at the gate`, ar3.dropped.arrived > 0, { dropped: ar3.dropped, walking: ar3.walking });
  await d(() => window.__dakar.arrivals.speed(1));

  await d(day => { window.__dakar.state.data.counters.arena_ticket_day = day; }, a0.day);
  const seat = await d(c => window.__dakar.arena.freeSeat(c.x + 9, c.z - 14), C);
  const r = Math.hypot(seat.x - C.x, seat.z - C.z), k = (r - 2.3) / r;
  await d(([c, s, k]) => window.__dakar.place(c.x + (s.x - c.x) * k, c.z + (s.z - c.z) * k, s.yaw + Math.PI), [C, seat, k]);
  await page.waitForFunction(() => window.__dakar.focus()?.kind === 'seat', null, T).catch(() => {});
  await d(() => window.__dakar.act());
  await page.waitForFunction(() => /arena:stand/.test(window.__dakar.seated() ?? ''), null, T).catch(() => {});
  await page.waitForFunction(() => window.__dakar.arena.info().phase !== 'idle', null, LONG).catch(() => {});
  // the stands fill during the preliminaries (src/arena/undercard.ts): on to the main event's entrance, full stands
  await d(() => window.__dakar.arena.go('entrance'));
  await page.waitForFunction(() => { const c = window.__dakar.arena.info().crowd; return c.present >= c.cap * 0.9; }, null, LONG).catch(() => {});
  const s1 = await stands(), i1 = await info();
  check(`${label}: seated on a fight evening, the stands are full`, /arena:stand/.test((await d(() => window.__dakar.seated())) ?? '') && s1 && s1.present >= i1.crowd.cap * 0.9 && s1.present > 100, { present: s1?.present, cap: i1.crowd.cap });
  const nearWant = quality === 'low' ? 0 : quality === 'medium' ? 4 : 8;
  await page.waitForFunction(n => window.__dakar.crowds.list().find(c => c.name === 'arena-stands').near >= n, nearWant, LONG).catch(() => {});
  const s1b = await stands();
  check(`${label}: levels of detail — ${nearWant} full bodies next to you, rigged figures, far silhouettes`, s1b.near === nearWant && s1b.mid + s1b.far + s1b.near + s1b.hidden === s1b.present && (quality === 'low' ? s1b.far > s1b.mid : s1b.mid > 0), { near: s1b.near, mid: s1b.mid, far: s1b.far, hidden: s1b.hidden });
  check(`${label}: the whole crowd costs a handful of draw calls`, s1b.drawCalls <= 5 + nearWant * 10, { drawCalls: s1b.drawCalls });
  await shot('1-seated');

  /** The show back to its full-stands part (the main event: entrance → bout) when it has gone on to the result or the end. */
  const fullStands = async () => {
    const ph = (await info()).phase;
    if (!['entrance', 'bout'].includes(ph)) await d(() => window.__dakar.arena.go('entrance'));
    await page.waitForFunction(() => { const i = window.__dakar.arena.info(); return ['entrance', 'bout'].includes(i.phase) && i.crowd.present >= i.crowd.cap * 0.9; }, null, LONG).catch(() => {});
  };

  // 2. The gala's own moment first (it comes right after the stands fill): a wrestler walks in and his side shouts.
  if ((await info()).phase !== 'entrance') await d(() => window.__dakar.arena.go('entrance'));
  await page.waitForFunction(() => (window.__dakar.arena.info().crowd.lod.kinds.shout ?? 0) > 10, null, LONG).catch(() => {});
  const e = await info();
  check(`${label}: a wrestler walks in and his side rises to shout`, (e.crowd.lod.kinds.shout ?? 0) > 10 && e.crowd.cheering > 0, { phase: e.phase, kinds: e.crowd.lod.kinds, level: e.crowd.level });
  await shot('7-entrance');

  // 3. Every reaction, group by group, each on full stands and from calm.
  const seen = {};
  for (const [group, kind, name] of [['all', 'applause', '2-applause'], ['left', 'shout', '3-shout-left'], ['all', 'standUp', null], ['all', 'grab', '4-grab'], ['all', 'fall', '5-fall'], ['right', 'celebrate', '6-celebrate-right']]) {
    await fullStands();
    await d(() => window.__dakar.crowds.calm('arena-stands'));
    const n = await d(([g, k]) => window.__dakar.crowds.react('arena-stands', g, k), [group, kind]);
    await page.waitForFunction(k => (window.__dakar.crowds.list().find(c => c.name === 'arena-stands').kinds[k] ?? 0) > 10, kind, LONG).catch(() => {});
    const s = await d(standsOf);
    seen[kind] = { joined: n, showing: s.kinds[kind] ?? 0, standing: s.standing, phase: (await info()).phase };
    if (name) await shot(name);
  }
  check(`${label}: each reaction is shown by its group (applause, shout, standUp, grab, fall, celebrate)`, Object.values(seen).every(v => v.joined > 10 && v.showing > 10), seen);
  check(`${label}: seated people stand for a fall and stay seated to clap`, seen.fall.standing > seen.applause.standing + 20, { applause: seen.applause.standing, fall: seen.fall.standing });

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
