// NPC activity density (docs/NPC_LIFE.md): the same streets at 7 h, 13 h, 19 h and 23 h, on desktop (medium quality)
// and phone (low quality). Asserts who is where by place and hour, the seat rules (never the player's seat, free seats
// kept, no orphan seat), the humanoid budget, greeting an ambient person, and no page errors. Screenshots + results.json.
// Usage: flock /tmp/dakar-browser.lock node scripts/check-npc-density.mjs [baseUrl=http://localhost:4216/] [outDir=docs/screenshots/npc-density]
// Serve a build first: npx vite build && npx vite preview --port 4216   (env ONLY=desktop|phone, VIEWS=id,… while iterating)
// SwiftShader renders a few frames per second (game dt clamped to 0.1 s): waits are on game state.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4216/';
const out = process.argv[3] ?? 'docs/screenshots/npc-density';
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const T = { timeout: 120000 };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

/** The same streets every time: where the player stands and where the camera looks. */
const VIEWS = [
  { id: 'pikine-gargote', hub: 'pikine', player: [70, 64], cam: [86, 4.5, 65], look: [78, 0.8, 55] },
  { id: 'pikine-grand-place', hub: 'pikine', player: [-26, 102], cam: [-8, 7, 103], look: [-22, 0.8, 89] },
  { id: 'plateau-gare-sandaga', hub: 'plateau', player: [22, 22], cam: [47, 6.5, 19], look: [34, 0.8, 32] },
  { id: 'plateau-mosquee', hub: 'plateau', player: [-38, -58], cam: [-14, 9, -62], look: [-30, 1, -45] },
  { id: 'corniche-promenade', hub: 'corniche', player: [-128.2, -10], cam: [-126, 4, -2], look: [-132, 1, -30] },
];
const HOURS = [7, 13, 19, 23];
const sum = (o, keys) => keys.reduce((v, k) => v + (o[k] ?? 0), 0);
/** People of the spots whose id contains `frag`, by activity. */
const at = (a, frag) => { const r = {}; for (const [id, s] of Object.entries(a.bySpot)) if (id.includes(frag)) for (const [k, n] of Object.entries(s.acts)) r[k] = (r[k] ?? 0) + n; return r; };
const seatedAt = (a, frag) => Object.entries(a.bySpot).filter(([id]) => id.includes(frag)).reduce((v, [, s]) => v + s.seated, 0);

/** Expected life per view and hour (the scheduler is deterministic per ten minutes; densities are the low/medium ones). */
const EXPECT = {
  'pikine-gargote': {
    13: a => [['people eat seated at the gargote at lunch', seatedAt(a, 'gargote:32') >= 2, JSON.stringify(at(a, 'gargote:32'))]],
    7: a => [['nobody has lunch at 7 h; the café serves breakfast instead', !at(a, 'gargote:32').dejeuner, JSON.stringify(at(a, 'gargote:32'))]],
    23: a => [['the gargote is closed at 23 h', sum(at(a, 'gargote:32'), Object.keys(at(a, 'gargote:32'))) === 0, JSON.stringify(at(a, 'gargote:32'))]],
  },
  'pikine-grand-place': {
    19: a => [['attaya circle and benches on the grand-place in the evening', (at(a, 'square:attaya').attaya ?? 0) >= 2 && sum(at(a, 'city:square'), ['banc', 'dames', 'veillee', 'attaya']) >= 3, JSON.stringify(at(a, 'square'))]],
    13: a => [['the grand-place is quieter at 13 h than at 19 h', true, JSON.stringify(at(a, 'square'))]],
  },
  'plateau-gare-sandaga': {
    7: a => [['people wait for the car rapide at 7 h', (at(a, 'station')['attendre-car'] ?? 0) + (at(a, 'station')['attendre-assis'] ?? 0) >= 2, JSON.stringify(at(a, 'station'))],
      ['vendors at their stalls and shoppers at Sandaga in the morning', (at(a, 'market:stalls').etal ?? 0) >= 1, JSON.stringify(at(a, 'market'))]],
    13: a => [['shoppers at Sandaga at 13 h', (at(a, ':market').marche ?? 0) >= 1, JSON.stringify(at(a, 'market'))]],
    23: a => [['the market is empty at 23 h', sum(at(a, 'market'), ['marche', 'etal']) === 0, JSON.stringify(at(a, 'market'))]],
  },
  'plateau-mosquee': {
    13: a => [['no prayer rows outside prayer time (13 h)', !at(a, 'mosque').priere, JSON.stringify(at(a, 'mosque'))]],
    19: a => [['rows at the mosque at Timis (presence and posture)', (at(a, 'mosque').priere ?? 0) >= 4, JSON.stringify(at(a, 'mosque'))]],
  },
  'corniche-promenade': {
    7: a => [['joggers on the Corniche at 7 h', (at(a, 'promenade').jogging ?? 0) >= 2, JSON.stringify(at(a, 'promenade'))]],
    13: a => [['nobody jogs at 13 h', !at(a, 'promenade').jogging, JSON.stringify(at(a, 'promenade'))]],
    19: a => [['joggers and walkers on the Corniche at 19 h', sum(at(a, 'promenade'), ['jogging', 'promenade']) >= 2, JSON.stringify(at(a, 'promenade'))]],
    23: a => [['the promenade is empty at 23 h', sum(at(a, 'promenade'), ['jogging', 'promenade']) === 0, JSON.stringify(at(a, 'promenade'))]],
  },
};

const frames = (page, n) => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const summary = [];
// ONLY=desktop|phone runs one viewport (iteration); VIEWS=id,id limits the streets. The full pass runs both.
const ONLY = process.env.ONLY, ONLY_VIEWS = process.env.VIEWS?.split(',');
for (const [label, viewport, touch, quality] of [['desktop', { width: 1280, height: 720 }, false, 'medium'], ['phone', { width: 390, height: 844 }, true, 'low']].filter(v => !ONLY || v[0] === ONLY)) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(q => { try { localStorage.setItem('dakarrek.quality', q); } catch { /* */ } }, quality);
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !(m.location().url.endsWith('.glb') && m.text().includes('404'))) errors.push(m.text()); });
  await page.goto(`${base}?debug${touch ? '&touch' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.body(), null, T);
  await page.evaluate(() => window.__dakar.ambientDay(1));                     // a Tuesday: same week day for every run
  const totals = {};
  for (const v of VIEWS.filter(x => !ONLY_VIEWS || ONLY_VIEWS.includes(x.id))) {
    for (const h of HOURS) {
      await page.evaluate(([v, h]) => { const d = window.__dakar; d.cam(null); d.setHour(h); if (d.pos().hub !== v.hub) d.teleport(v.hub, v.player[0], v.player[1], 0); else d.place(v.player[0], v.player[1], 0); }, [v, h]);
      // the population settles at once after an hour jump; give it a few frames and the walkers their places
      await page.waitForFunction(h => { const a = window.__dakar.ambient(); return Math.abs(a.hour - h) < 0.01 && a.live > 0; }, h, T).catch(() => {});
      await frames(page, 3);
      await page.evaluate(([c, t]) => { window.__dakar.ambientSettle(); window.__dakar.cam(c, t); }, [v.cam, v.look]);
      await frames(page, 3);
      const a = await page.evaluate(() => ({ ...window.__dakar.ambient(), dc: window.__dakar.drawCalls() }));
      await page.screenshot({ path: `${out}/${label}-${v.id}-${String(h).padStart(2, '0')}h.png` });
      totals[`${v.id}@${h}`] = a.live;
      summary.push({ label, view: v.id, hour: h, live: a.live, byTag: a.byTag, full: a.full, fullAmbient: a.fullAmbient, fullOther: a.fullOther, figures: a.figures, budget: a.budget, drawCalls: a.dc });
      check(`${label} ${v.id} ${h}h: seat and place invariants hold`, a.problems.length === 0, a.problems.join(' | '));
      check(`${label} ${v.id} ${h}h: animated humanoids within the ${quality} budget`, a.full <= a.budget, `${a.full}/${a.budget} full · ${a.figures} figures · ${a.dc} draw calls`);
      for (const [name, ok, detail] of EXPECT[v.id]?.[h]?.(a) ?? []) check(`${label} ${v.id} ${h}h: ${name}`, ok, detail);
    }
  }
  if ('pikine-grand-place@19' in totals) {
    check(`${label}: the grand-place is busier at 19 h than at 13 h`, totals['pikine-grand-place@19'] >= totals['pikine-grand-place@13'], `${totals['pikine-grand-place@13']} → ${totals['pikine-grand-place@19']}`);
    check(`${label}: fewer people late at night (Pikine, 23 h vs 19 h)`, totals['pikine-grand-place@23'] <= totals['pikine-grand-place@19'], `${totals['pikine-grand-place@19']} → ${totals['pikine-grand-place@23']}`);
  }

  // Friday: the rows of Tisbar are fuller (Ajjuma)
  await page.evaluate(() => { const d = window.__dakar; d.cam(null); d.ambientDay(4); d.setHour(14.1); if (d.pos().hub !== 'plateau') d.teleport('plateau', -38, -58, 0); else d.place(-38, -58, 0); });
  await page.waitForFunction(() => { const a = window.__dakar.ambient(); return Math.abs(a.hour - 14.1) < 0.01 && a.live > 0 && window.__dakar.pos().hub === 'plateau'; }, null, T).catch(() => {}); await frames(page, 4);
  await page.evaluate(() => window.__dakar.ambientSettle()); await frames(page, 3);
  await page.evaluate(() => window.__dakar.cam([-14, 9, -62], [-30, 1, -45])); await frames(page, 4);
  const fri = await page.evaluate(() => window.__dakar.ambient());
  const rows = Object.entries(fri.bySpot).filter(([id]) => id.includes('mosque')).reduce((v, [, s]) => v + (s.acts.priere ?? 0) + (s.acts.ajjuma ?? 0), 0);
  check(`${label}: Friday 14 h, the rows of the mosque are full (presence only)`, rows >= (quality === 'low' ? 8 : 12), `${rows} in rows`);
  await page.screenshot({ path: `${out}/${label}-plateau-mosquee-vendredi-14h.png` });
  const greetMosque = await page.evaluate(() => { const d = window.__dakar; const m = d.ambientActors().find(x => x.spot.includes('mosque') && x.lod === 2); if (!m) return null; d.cam(null); d.place(m.x + Math.sin(m.yaw) * 1.1, m.z + Math.cos(m.yaw) * 1.1, m.yaw + Math.PI); return m; });
  if (greetMosque) { await frames(page, 4); const f = await page.evaluate(() => window.__dakar.focus()); check(`${label}: people praying are not offered a conversation`, f?.kind !== 'person', JSON.stringify(f)); }
  await page.evaluate(() => window.__dakar.ambientDay(1));

  // The player's seat: sit at the gargote at lunch; after a busy hour change nobody took it and free seats remain.
  await page.evaluate(() => { const d = window.__dakar; d.cam(null); d.setHour(13.2); d.teleport('pikine', 74, 60, Math.PI); });
  await page.waitForFunction(() => window.__dakar.ambient().live > 0, null, T); await frames(page, 4);
  const mine = await page.evaluate(() => { const d = window.__dakar; const s = d.seatsHere().find(x => x.id.includes(':gargote:32:amb:') && !x.occupant); if (!s) return null; d.place(s.x, s.z + 0.8, Math.PI); return d.sit(s.id); });
  check(`${label}: the player sits on a free gargote bench`, !!mine, String(mine));
  if (mine) {
    for (const h of [13.4, 13.7, 14.0]) { await page.evaluate(h => window.__dakar.setHour(h), h); await frames(page, 5); }
    const st = await page.evaluate(id => { const d = window.__dakar; const seats = d.seatsHere().filter(x => x.id.includes(':gargote:32:amb:')); return { mine: seats.find(x => x.id === id)?.occupant, free: seats.filter(x => !x.occupant).length, npc: seats.filter(x => x.occupant?.startsWith('npc')).length, seated: d.seated() }; }, mine);
    check(`${label}: nobody takes the player's seat`, st.mine === 'player' && st.seated === mine, JSON.stringify(st));
    check(`${label}: the gargote keeps free seats while the player eats there`, st.free >= 1, JSON.stringify(st));
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${label}-player-seated-gargote.png` });
    await page.evaluate(() => window.__dakar.stand());
  }

  // Anyone of the ambient life can be greeted.
  await page.evaluate(() => { const d = window.__dakar; d.setHour(13.2); d.place(70, 64, 0); });
  await frames(page, 6);
  let greeted = null;
  for (let k = 0; k < 6 && !greeted; k++) {
    const p = await page.evaluate(k => window.__dakar.ambientActors().filter(x => x.lod === 2 && x.state === 'do' && !x.sitting && !x.spot.includes('mosque'))[k], k);
    if (!p) break;
    await page.evaluate(p => window.__dakar.place(p.x + Math.sin(p.yaw) * 1.2, p.z + Math.cos(p.yaw) * 1.2, p.yaw + Math.PI), p);
    await frames(page, 4);
    const f = await page.evaluate(() => window.__dakar.focus());
    if (f?.kind === 'person' && f.id.startsWith('person:amb:')) greeted = f;
  }
  check(`${label}: an ambient person offers « Saluer » and « Demander son nom »`, greeted?.primary === 'Saluer' && greeted.all.includes('Demander son nom'), JSON.stringify(greeted));
  if (greeted) {
    await page.evaluate(() => window.__dakar.act());
    await page.waitForFunction(() => /Maleekum salaam/.test(document.getElementById('toast')?.textContent ?? ''), null, T).catch(() => {});
    check(`${label}: the greeting gets an answer`, /Maleekum salaam/.test(await page.evaluate(() => document.getElementById('toast').textContent)));
  }

  // A place registered by another lane (here a test stop and a test Dibi) is populated without new code.
  await page.evaluate(() => {
    const d = window.__dakar; d.setHour(21); d.place(70, 64, 0);
    d.ambientAddPlace({ id: 'test-dibi', type: 'dibi', name: 'Dibi test', space: 'street', hours: [11, 2], anchors: [{ id: 'counter', kind: 'counter', x: 62, z: 70 }], offers: {} },
      [0, 1, 2, 3, 4, 5].map(i => ({ id: 'test-dibi:' + i, x: 59 + i * 0.9, z: 73, top: 0.55, yaw: Math.PI, kind: 'chair', space: 'street', occupant: null })));
  });
  await page.waitForFunction(() => Object.keys(window.__dakar.ambient().bySpot).some(id => id === 'place:test-dibi'), null, T).catch(() => {});
  const td = await page.evaluate(() => window.__dakar.ambient().bySpot['place:test-dibi']);
  check(`${label}: a Dibi registered by another lane gets its evening customers`, (td?.acts.dibi ?? 0) >= 1, JSON.stringify(td));
  // A stop and a vehicle with seats, as the transport lane registers them: people wait, then board and ride seated.
  await page.evaluate(() => {
    const d = window.__dakar; d.setHour(7.6); d.place(70, 64, 0);
    d.ambientAddPlace({ id: 'test-stop', type: 'stop', name: 'Arrêt test', space: 'street', anchors: [{ id: 'stop', kind: 'spot', x: 60, z: 58 }], offers: {} },
      [0, 1, 2, 3, 4, 5].map(i => ({ id: 'test-car:' + i, x: 63.5 + (i % 3) * 0.55, z: 55 + Math.floor(i / 3) * 0.7, top: 0.75, yaw: Math.PI / 2, kind: 'vehicle', space: 'test-car', occupant: null })));
  });
  await page.waitForFunction(() => (window.__dakar.ambient().bySpot['place:test-stop']?.acts['attendre-car'] ?? 0) >= 1, null, T).catch(() => {});
  const waiting = await page.evaluate(() => window.__dakar.ambient().bySpot['place:test-stop']);
  check(`${label}: people wait at a stop registered by the transport lane`, (waiting?.acts['attendre-car'] ?? 0) >= 1, JSON.stringify(waiting));
  await page.evaluate(() => { window.__dakar.ambientLeave('test-stop'); window.__dakar.ambientSettle(); });
  await frames(page, 3);
  const riders = await page.evaluate(() => window.__dakar.ambientActors().filter(a => a.state === 'ride').map(a => ({ seat: a.seat, y: a.y })));
  check(`${label}: when the vehicle is there they board and ride on its seats`, riders.length >= 1 && riders.every(r => r.seat?.startsWith('test-car:')), JSON.stringify(riders));
  check(`${label}: riders leave seats in the vehicle for players`, riders.length <= 3, `${riders.length}/6 seats taken`);
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), results, summary }, null, 2));
console.log(`\n${results.length - failed}/${results.length} density checks passed`);
process.exit(failed ? 1 : 0);
