// LD2.0-D look pass, lane V-S (docs/ld2/LD2_D.md): the Almadies villa furnished with the « Collection Almadies » and pictured on a phone page (390 × 844),
// by day (10 h) and at 21 h: the grand salon, the dining room, the master suite, the family lounge, the pool deck and the roof terrace, from the game's
// own camera. The layout is src/housing/villaLayout.ts (one plain list): every piece is bought and delivered by the game, put away with the home
// editor's own hooks, then set at its spot by the editor's rules (`placeAt`: a spot the game refuses stays refused and is reported). Every piece valid
// where it stands and every room reachable (the game's `homeRules`); the draw calls and triangles of each level furnished (≤ 60 calls, ≤ 80k
// triangles); no page errors. Pictures in docs/proof/ld2d/villa-look (PNG under 400 kB) with look.json.
// Usage: node scripts/shots-villa-look.mjs [baseUrl] [outDir]
//   (a static build: npx vite build --outDir /tmp/claude-0/ld2d/vs/dist --emptyOutDir; node /tmp/claude-0/beta/tools/serve.mjs /tmp/claude-0/ld2d/vs/dist 4963)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const [base = 'http://127.0.0.1:4963/', out = 'docs/proof/ld2d/villa-look'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
// the layout, read from its source (a plain array literal)
const src = fs.readFileSync(new URL('../src/housing/villaLayout.ts', import.meta.url), 'utf8');
const LAYOUT = new Function(`return ${src.slice(src.indexOf('= [', src.indexOf('VILLA_ALMADIES_LAYOUT')) + 2, src.lastIndexOf('];') + 1)}`)();
const STOREY = 3.4;
// [house x, z, the player's facing, the floor's height] for each picture (the camera follows behind the player)
const SHOTS = {
  'salon': [-4.2, -4.4, -0.5, 0], 'manger': [1.0, -4.7, 0.25, 0], 'suite': [-4.2, -4.4, -0.35, STOREY], 'salon-familial': [0.6, 1.4, -1.45, STOREY],
  'pool': [9.2, -7.2, -1.75, 0], 'roof': [-0.8, -3.9, 0.75, 2 * STOREY],
};
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 600) : ''); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  await d(() => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(10); D.teleport('almadies'); });
  await page.waitForTimeout(2500);
  // every piece bought and delivered (the game sets each where its kind goes), then the player goes in
  const bought = await d(ids => ids.map(id => [id, window.__dakar.buyPiece(id)?.uid ?? null]), LAYOUT.map(p => p.spec));
  check(`the ${LAYOUT.length} pieces bought and delivered`, bought.every(([, uid]) => uid), JSON.stringify(bought.filter(([, u]) => !u)));
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  // put away with the editor (« Ranger »), then each set at its spot by the editor's rules, in the list's order
  await d(() => window.__dakar.placer.open()); await page.waitForTimeout(600);
  await d(uids => { const P = window.__dakar.placer; for (const uid of uids) { P.select(uid); P.stash(); } }, bought.map(([, u]) => u));
  await d(() => window.__dakar.placer.close()); await page.waitForTimeout(600);
  const placed = await d(([list, uids]) => list.map((p, k) => [p.spec, p.room, window.__dakar.placeAt(uids[k], p.x, p.z, p.rot)]), [LAYOUT, bought.map(([, u]) => u)]);
  check('each piece set at its spot of the layout, by the editor\'s rules', placed.every(([, , why]) => why === null), JSON.stringify(placed.filter(([, , w]) => w !== null)));
  await page.waitForTimeout(1500);
  const rules = await d(() => window.__dakar.homeRules());
  const rooms = Object.fromEntries(LAYOUT.map(p => [p.room, 0])); for (const p of rules.pieces) if (p.room in rooms) rooms[p.room]++;
  check('every piece valid where it stands, each in its room, every room reachable', rules.pieces.length === LAYOUT.length && rules.pieces.every(p => p.why === null) && LAYOUT.every((p, k) => rules.pieces.some(q => q.spec === p.spec && q.room === p.room)) && rules.reachable?.ok,
    JSON.stringify({ n: rules.pieces.length, bad: rules.pieces.filter(p => p.why), rooms, reach: rules.reachable }));
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  // ------------------------------------------------------------------ pictures by day and at 21 h; draw calls and triangles per level
  const sizes = [], perf = {};
  const picture = async name => {
    let buf = await page.screenshot({ scale: 'css' });
    if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 92, effort: 8 }).toBuffer();
    fs.writeFileSync(`${out}/${name}.png`, buf); sizes.push([name, buf.length]);
  };
  for (const [hour, tag] of [[10, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour);
    for (const [name, [x, z, yaw, y]] of Object.entries(SHOTS)) {
      await d(([x, z, yaw, y]) => { window.__dakar.place(x, z, yaw, y); window.__dakar.lookYaw(yaw); }, [O.x + x, O.z + z, yaw, y]);
      await page.waitForTimeout(2000);
      await picture(`${name}-${tag}`);
      const h = await d(() => ({ home: window.__dakar.home(), calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
      const o = perf[h.home.level] ??= { calls: 0, tris: 0 }; o.calls = Math.max(o.calls, h.calls); o.tris = Math.max(o.tris, h.tris);
    }
  }
  check(`pictures of the furnished villa by day and at 21 h, each PNG under 400 kB (${sizes.length})`, sizes.length === 2 * Object.keys(SHOTS).length && sizes.every(([, n]) => n < 400_000), sizes.map(([k, n]) => `${k} ${Math.round(n / 1000)} kB`).join(', '));
  check(`each level furnished: ≤ 60 draw calls and ≤ 80k triangles (phone page): ${Object.entries(perf).map(([k, v]) => `${k} ${v.calls} calls ${Math.round(v.tris / 1000)}k`).join(', ')}`, Object.values(perf).every(p => p.calls <= 60 && p.tris <= 80_000), JSON.stringify(perf));
  check('no page errors', errors.length === 0, errors.join(' | '));
  fs.writeFileSync(`${out}/look.json`, JSON.stringify({ base, layout: LAYOUT, placed, rules: rules.pieces.map(p => ({ spec: p.spec, room: p.room, at: p.at, why: p.why })), reachable: rules.reachable, perf, pictures: sizes, results }, null, 1));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
