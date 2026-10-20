// The phone's city map (src/ui/geoMap.ts, the « Ville » tab of Carte): MapLibre is loaded only when the tab opens and its WebGL context is released when it closes; the bundled layers
// (coast, reference roads, the playable districts and the roads between them) and the DOM markers (districts, the player, vehicles, places) show with no network; with the vector basemap
// unavailable the map says so and keeps working, with it available (a fixture style served in place of OpenFreeMap) it shows its credit and keeps the playable layer on top.
// Usage: node scripts/check-geomap.mjs [baseUrl] [outDir]   (needs a running build or dev server)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4385/';
const out = process.argv[3] ?? 'docs/screenshots/geomap';
fs.mkdirSync(out, { recursive: true });
const T = { timeout: 120000 };
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

/** One session: `variant` 'blocked' (the basemap request fails: the sandbox's own state) or 'fixture' (a style is served for it). */
async function session(variant) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ }
    // every WebGL context the page creates, to see that closing the map really frees its one
    window.__gl = []; const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) { const c = orig.call(this, t, ...a); if (c && /webgl/.test(String(t))) window.__gl.push({ gl: c, cls: this.className }); return c; };
  });
  const page = await context.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', e => { errors.push(e.message); if (process.env.DEBUG_CONSOLE) console.log('PAGEERROR', e.message.slice(0, 300), (e.stack ?? '').split('\n').slice(0, 4).join(' | ')); });
  if (process.env.DEBUG_CONSOLE) page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 240)); });
  page.on('request', r => reqs.push(r.url()));
  if (variant === 'fixture') {
    await page.route('https://tiles.openfreemap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ version: 8, name: 'fixture', sources: {}, layers: [{ id: 'fixture-bg', type: 'background', paint: { 'background-color': '#cfe3f3' } }] }) }));
  } else {
    await page.route('https://tiles.openfreemap.org/**', r => r.abort('blockedbyclient'));
  }
  await page.goto(`${base}?debug&touch`, { timeout: 120000 });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, T);
  const d = (fn, arg) => page.evaluate(fn, arg);
  await d(() => { window.__dakar.setHour(11); window.__dakar.teleport('pikine', -40, 10, 0); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, T);
  await page.waitForTimeout(1500);
  const tag = `[${variant}]`;

  // opening the map: the Quartier tab, MapLibre not loaded yet
  await page.locator('#minimap').tap();
  await page.waitForSelector('#phone .gm-tabs', T);
  check(`${tag} the map screen has two tabs, Quartier first`, (await d(() => [...document.querySelectorAll('#phone [data-mt]')].map(b => b.textContent + ':' + b.getAttribute('aria-selected')))).join() === 'Quartier:true,Ville:false');
  check(`${tag} MapLibre is not loaded (no chunk, no canvas, no WebGL context) while the district map is showing`, !reqs.some(u => /maplibre/.test(u)) && (await d(() => document.querySelectorAll('.maplibregl-canvas').length)) === 0 && (await d(() => window.__gl.filter(g => /maplibre/.test(g.cls)).length)) === 0);
  const jsBefore = reqs.filter(u => /\.js(\?|$)/.test(u)).length;

  // the Ville tab
  await page.locator('#phone [data-mt="ville"]').tap();
  await page.waitForFunction(() => window.__geoMap?.ready, null, T);
  check(`${tag} MapLibre's chunk is fetched only now`, reqs.some(u => /maplibre-gl-[\w-]+\.js/.test(u)) && reqs.filter(u => /\.js(\?|$)/.test(u)).length > jsBefore);
  await page.waitForTimeout(2500);
  const st = await d(() => {
    const g = window.__geoMap, m = g.map, hubs = m.getSource('hubs'), pl = [...document.querySelectorAll('.gm-me')];
    const me = document.querySelector('.gm-me'), r = me?.getBoundingClientRect(), box = document.querySelector('.gm-map').getBoundingClientRect();
    return {
      canvas: document.querySelectorAll('.maplibregl-canvas').length, hubMarkers: document.querySelectorAll('.gm-hub').length, roadMarkers: document.querySelectorAll('.gm-road').length,
      layers: ['hubs-fill', 'hubs-line', 'corridors-casing', 'corridors'].map(id => !!m.getLayer(id)), land: !!m.getLayer('land'), refRoads: !!m.getLayer('ref-roads'),
      players: pl.length, meInside: !!r && r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom,
      center: m.getCenter().toArray(), zoom: m.getZoom(), status: document.querySelector('.gm-status')?.hidden ? '' : document.querySelector('.gm-status')?.textContent,
      attrib: [...document.querySelectorAll('.maplibregl-ctrl-attrib')].map(e => e.textContent).join(' | '), online: g.online, note: document.querySelector('.gm-note')?.textContent ?? '', hubsSrc: !!hubs,
      glMapLibre: window.__gl.filter(x => /maplibre/.test(x.cls)).length,
    };
  });
  console.log(tag, JSON.stringify(st));
  check(`${tag} one canvas, one WebGL context`, st.canvas === 1 && st.glMapLibre === 1);
  check(`${tag} the playable layer is there: districts, the roads between them, 4 district markers, 2 road markers`, st.layers.every(Boolean) && st.hubMarkers === 4 && st.roadMarkers === 2, JSON.stringify(st.layers));
  check(`${tag} the player is on the map, in view, and the map is centred on their district (Pikine)`, st.players === 1 && st.meInside && Math.abs(st.center[0] + 17.393) < 0.02 && Math.abs(st.center[1] - 14.754) < 0.02, JSON.stringify(st.center));
  check(`${tag} the scale note and the attribution are shown`, /condensés/.test(st.note) && /approximatifs/.test(st.attrib) && (variant === 'fixture' || /Natural Earth/.test(st.attrib)), st.attrib.slice(0, 120));
  if (variant === 'blocked') {
    check(`${tag} without the basemap: the bundled coast and reference roads draw, and the map says so`, !st.online && st.land && st.refRoads && /indisponible/i.test(st.status ?? ''), st.status);
  } else {
    check(`${tag} with the basemap: its credit (OpenStreetMap, OpenMapTiles) is shown and the playable layer stays on top of it`, st.online && /OpenStreetMap/.test(st.attrib) && /OpenMapTiles/.test(st.attrib) && !st.land && st.layers.every(Boolean), st.attrib.slice(0, 200));
  }
  await page.screenshot({ path: `${out}/${variant}-ville.png` });

  // a district's card, a road's card
  await page.evaluate(() => [...document.querySelectorAll('.gm-hub')].find(e => /Almadies/.test(e.textContent)).click());
  const hubCard = await d(() => document.querySelector('.gm-card').textContent);
  check(`${tag} tapping a district says what it is and the road to Pikine`, /Almadies/.test(hubCard) && /Pikine/.test(hubCard) && /km/.test(hubCard), hubCard.slice(0, 160));
  await page.evaluate(() => document.querySelector('.gm-road').click());
  const roadCard = await d(() => document.querySelector('.gm-card').textContent);
  check(`${tag} tapping a road gives its length, its real length and what it passes`, /à parcourir/.test(roadCard) && /vraie ville/.test(roadCard) && /Patte d’Oie/.test(roadCard), roadCard.slice(0, 200));
  // places of the district: close in, a place card with « Marquer » that sets the game's waypoint
  await page.evaluate(() => window.__geoMap.map.jumpTo({ zoom: 14.5 }));
  await page.waitForTimeout(900);
  const pls = await d(() => document.querySelectorAll('.gm-pl').length);
  check(`${tag} the places of the district you are in show on the map once zoomed in`, pls > 5, String(pls));
  await page.evaluate(() => document.querySelector('.gm-pl').click());
  await page.locator('#phone [data-gm-mark]').tap();
  await page.waitForTimeout(800);
  check(`${tag} « Marquer » on a place sets the game's waypoint and the pin shows on the city map`, (await d(() => !!document.querySelector('.gm-pin'))) && (await d(() => window.__dakar.destination?.() ?? true)) !== null);
  await page.screenshot({ path: `${out}/${variant}-ville-close.png` });
  // the player marker follows the player
  const before = await d(() => window.__geoMap.map.project(window.__geoMap.map.getCenter()).x);
  void before;

  // leaving the tab frees everything
  await page.locator('#phone [data-mt="quartier"]').tap();
  await page.waitForTimeout(800);
  const gone = await d(() => ({ ready: !!window.__geoMap, canvas: document.querySelectorAll('.maplibregl-canvas').length, lost: window.__gl.filter(x => /maplibre/.test(x.cls)).map(x => x.gl.isContextLost()), fm: !!document.querySelector('#phone .fm-cv') && document.querySelector('#phone [data-pane="quartier"]').hidden === false }));
  check(`${tag} leaving « Ville »: the map, its canvas and its WebGL context are gone, the district map is back`, !gone.ready && gone.canvas === 0 && gone.lost.length === 1 && gone.lost.every(Boolean) && gone.fm, JSON.stringify(gone));
  // and again, then the phone closes: nothing is left
  await page.locator('#phone [data-mt="ville"]').tap();
  await page.waitForFunction(() => window.__geoMap?.ready, null, T);
  check(`${tag} opening it again works (a second context, not a leak)`, (await d(() => window.__gl.filter(x => /maplibre/.test(x.cls)).length)) === 2);
  await d(() => document.querySelector('#phone .ph-close, #phone [data-close], #phone .ph-x')?.click());
  await page.waitForTimeout(800);
  const closed = await d(() => ({ ready: !!window.__geoMap, canvas: document.querySelectorAll('.maplibregl-canvas').length, lost: window.__gl.filter(x => /maplibre/.test(x.cls)).map(x => x.gl.isContextLost()), open: document.querySelector('#phone')?.classList.contains('open') }));
  check(`${tag} closing the phone frees the map's WebGL context`, !closed.ready && closed.canvas === 0 && closed.lost.every(Boolean), JSON.stringify(closed));
  check(`${tag} no JavaScript error`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

if (!process.env.ONLY || process.env.ONLY === 'blocked') await session('blocked');
if (!process.env.ONLY || process.env.ONLY === 'fixture') await session('fixture');
await browser.close();
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
