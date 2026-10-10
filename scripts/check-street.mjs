// Street life with reasons (src/crowd/street.ts, docs/CROWD.md « Street life »): the Pikine main street at the evening
// rush and Sandaga in the morning rush (walkers, people waiting at the car rapide stops, groups chatting in front of
// the shops), quiet at 3 h; after the gala the spectators head for the Arène stop, the taxis and home; nobody inside a
// wall or a stall; the street crowd's draw calls and the whole frame within budget; no page or shader errors.
// Desktop 1280×720 (medium) and phone 390×844 (low); captures in docs/screenshots/street.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-street.mjs [baseUrl] [outDir=docs/screenshots/street] [--view=desktop|phone]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const [base = 'http://localhost:4216/', out = 'docs/screenshots/street'] = args.filter(a => !a.startsWith('--'));
const view = args.find(a => a.startsWith('--view='))?.slice(7) ?? 'all';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 180000 };
// Every wait is for a state, never a fixed time: SwiftShader may run the game at a few frames a second.
const LONG = { timeout: 240000 };
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const VIEWS = [['desktop', { width: 1280, height: 720 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']].filter(([l]) => view === 'all' || l === view);

for (const [label, viewport, touch, quality] of VIEWS) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { if (!sessionStorage.getItem('street-check')) { localStorage.clear(); localStorage.setItem('dakarrek.quality', q); sessionStorage.setItem('street-check', '1'); } }, quality);
  const page = await ctx.newPage();
  const errors = [], shaderErrors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /shader|WebGLProgram|GLSL/i.test(m.text())) shaderErrors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.street, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  const info = () => d(() => window.__dakar.street.info());
  const frame = () => d(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const shot = async name => { await page.waitForTimeout(500); await frame(); await page.screenshot({ path: `${out}/${label}-${name}.jpg`, type: 'jpeg', quality: 80 }); };
  /** Let the street settle: it fills a few people a second (out of sight first) until the walkers reach their target. */
  const settle = async minPresent => {
    await page.waitForFunction(m => { const i = window.__dakar.street.info(); return i && i.crowd.present >= m && (i.roles.walk ?? 0) >= i.target.walkers * 0.8; }, minPresent, LONG).catch(() => {});
  };
  /** A few samples of who stands inside a collider, a few rendered frames apart. */
  const sampleSome = async n => { for (let k = 0; k < n; k++) { await sampleBlocked(); await frame(); await frame(); } };
  const where = async (hub, x, z, yaw, hour) => {
    await d(([hub, x, z, yaw, hour]) => { const k = window.__dakar; k.setHour(hour); if (k.pos().hub !== hub) k.teleport(hub, x, z, yaw); else k.place(x, z, yaw); }, [hub, x, z, yaw, hour]);
    await page.waitForFunction(h => window.__dakar.pos().hub === h && window.__dakar.street.info()?.hub === h, hub, T);
  };
  const blockedSamples = [];
  const sampleBlocked = async () => { const b = await d(() => window.__dakar.street.blocked()); if (b.length) blockedSamples.push(...b); };

  // 1. The Pikine main street at the evening rush (18:45), from the pavement by the room's block towards the arena.
  await where('pikine', -24, -66.2, Math.PI / 2, 18.75);
  await settle(quality === 'low' ? 20 : 45);
  await sampleSome(4);
  const p1 = await info();
  const waiting1 = p1.stops.reduce((n, s) => n + s.waiting, 0);
  check(`${label}: Pikine main street at 18:45 — people walking, waiting at the stops, chatting in groups`,
    (p1.roles.walk ?? 0) >= p1.target.walkers * 0.6 && p1.target.walkers >= (quality === 'low' ? 10 : 30) && waiting1 >= 4 && p1.groups >= 1,
    { target: p1.target, roles: p1.roles, waiting: waiting1, groups: p1.groups, lod: { near: p1.crowd.near, mid: p1.crowd.mid, far: p1.crowd.far } });
  check(`${label}: the street crowd costs a handful of draw calls (${p1.drawCalls})`, p1.drawCalls <= 4 + (quality === 'low' ? 0 : quality === 'medium' ? 20 : 30), { drawCalls: p1.drawCalls });
  await frame();
  const dc1 = await d(() => window.__dakar.drawCalls());
  check(`${label}: the whole frame stays within budget on the busy street (${dc1})`, dc1 < (touch ? 300 : 600), { dc: dc1 });
  await shot('1-pikine-rush');

  // 2. A car rapide pulls in at a stop: some get on, some get off.
  const c0 = (await info()).counts;
  const next = await d(() => window.__dakar.transport?.nextAt?.('23', 0) ?? null);
  if (typeof next === 'number' && next > 2) await d(s => window.__dakar.transport.warp(s), next - 2);
  await page.waitForFunction(b => { const c = window.__dakar.street.info().counts; return c.boarded > b.boarded || c.alighted > b.alighted; }, c0, LONG).catch(() => {});
  const c1 = (await info()).counts;
  check(`${label}: at a stop, people get on the car rapide and others get off`, c1.boarded > c0.boarded || c1.alighted > c0.alighted, { before: c0, after: c1 });

  // 3. Sandaga in the morning rush (08:00), on the market's street.
  await where('plateau', 20, -66.2, -Math.PI / 2, 8);
  await settle(quality === 'low' ? 18 : 45);
  await sampleSome(3);
  const s1 = await info();
  check(`${label}: Sandaga at 08:00 — the busy streets round the market fill up`, (s1.roles.walk ?? 0) >= s1.target.walkers * 0.6 && s1.busyLanes >= 6 && s1.target.walkers >= (quality === 'low' ? 12 : 35), { target: s1.target, roles: s1.roles, busyLanes: s1.busyLanes });
  await shot('2-sandaga-morning');

  // 4. After the gala at Pikine: the spectators come out and head for the Arène stop, the taxis and home.
  await where('pikine', 6, -66.3, 1.0, 22.5);
  await page.waitForFunction(() => window.__dakar.street.info().lanes > 0 && window.__dakar.street.info().stops.length > 0, null, LONG).catch(() => {});
  const l0 = await info();
  await d(() => window.__dakar.street.leaveNow(18));
  await page.waitForFunction(n => window.__dakar.street.info().counts.left >= n, l0.counts.left + 12, LONG).catch(() => {});
  await page.waitForFunction(() => (window.__dakar.street.info().stops.find(s => s.key.endsWith(':arene'))?.waiting ?? 0) >= 2, null, LONG).catch(() => {});
  const l1 = await info();
  const arene = l1.stops.find(s => s.key.endsWith(':arene'));
  check(`${label}: after the gala, spectators leave for the Arène stop, the taxis and the streets`, l1.counts.left - l0.counts.left >= 10 && (arene?.waiting ?? 0) >= 2, { left: l1.counts.left - l0.counts.left, arene, taxi: l1.counts.taxi, corners: l1.corners });
  await sampleSome(3);
  await shot('3-after-gala');

  // 5. 03:00: the streets are nearly empty.
  await d(() => window.__dakar.setHour(3));
  await page.waitForFunction(() => { const i = window.__dakar.street.info(); return i.target.perStop === 0 && i.stops.every(s => s.waiting === 0); }, null, LONG).catch(() => {});
  const n1 = await info();
  check(`${label}: at 3 h the streets are nearly empty and nobody waits for a car rapide`, n1.target.perStop === 0 && n1.target.walkers <= (quality === 'low' ? 4 : 10), { target: n1.target, present: n1.crowd.present });

  check(`${label}: nobody walks or stands inside a wall, a stall or furniture`, blockedSamples.length === 0, blockedSamples.slice(0, 6).join(' | '));
  check(`${label}: the crowd's shaders compile`, shaderErrors.length === 0, shaderErrors.join(' | '));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/results${view === 'all' ? '' : '-' + view}.json`, JSON.stringify({ when: new Date().toISOString(), base, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} street checks passed`);
process.exit(failed ? 1 : 0);
