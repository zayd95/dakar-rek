// LD2.0-D « Collection Almadies » (lane K-L): the line in a furnished room, from the game's own camera on a phone page (390 × 844), by day and at 21 h.
// The villa is being built in parallel, so the pieces that fit go into the F2 of the Résidence Jàmm: each is bought and delivered by the game, then set
// out with the home editor's own hooks (select, moveTo, rotate, put: a spot the game refuses stays refused and is reported). Each view's draw calls and
// triangles are measured against the furnished-room budget (≤ 60 draw calls, ≤ 80k triangles). No page errors.
// Usage: node scripts/shots-collection-room.mjs <baseUrl> [outDir=docs/proof/ld2d/collection]
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const [base = 'http://127.0.0.1:4966/', out = 'docs/proof/ld2d/collection'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
// What is bought, in this order: each piece is delivered by the game to a spot of its own (src/economy/placement.ts autoPlace: against a wall of its
// room, flush, facing into it), so the order decides who gets which wall: the curved sofa takes the séjour's north wall, the mushroom lamp the gap at its
// end, the sideboard the west wall, the TV stand then the south wall facing the sofa; the black bed goes to the chambre.
const BUY = ['canape_courbe', 'lampadaire_champignon', 'enfilade_bronze', 'meuble_tv_laque', 'tapis_rond_jute', 'table_basse_marbre_noir', 'fauteuil_boucle', 'gueridon_marbre',
  'pot_cannele', 'lustre_couronne', 'lit_capitonne_noir', 'banc_lit', 'chevet_greige', 'chevet_greige', 'miroir_ovale'];
// Then set out with the home editor's hooks, in home coordinates of the F2 (src/housing/plan.ts F2_JAMM: the séjour x −4.5…1.8, z 0…3.5; the chambre
// x −4.5…−1, z −3.5…0): ['rot', quarter turns], ['move', dx, dz] in 0.25 m steps (a piece slides along its wall and stays flush), ['to', x, z] (on the
// 0.25 m grid), ['stash'] then ['auto'] (the game finds it a spot again, once the pieces it depends on have moved). Each spot is the game's to refuse.
const OPS = [
  ['tapis_rond_jute', 0, [['to', -1.75, 2.0]]], ['table_basse_marbre_noir', 0, [['rot', 0], ['to', -1.75, 1.75]]], ['fauteuil_boucle', 0, [['rot', 3], ['to', -0.25, 1.75]]],
  ['gueridon_marbre', 0, [['to', -0.25, 2.5]]], ['pot_cannele', 0, [['to', -4.0, 3.0]]], ['lustre_couronne', 0, [['to', -1.75, 2.0]]],
  // the black bed: head against the chambre's north wall, under the window's middle; its nightstands found again either side; the bench at its foot
  ['lit_capitonne_noir', 0, [['rot', 0], ['move', -2, 0]]], ['chevet_greige', 0, [['stash'], ['auto']]], ['chevet_greige', 1, [['stash'], ['auto']]],
  ['banc_lit', 0, [['rot', 0], ['to', -2.75, -0.75]]], ['miroir_ovale', 0, [['to', -4.3, -0.5]]],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, detail: String(extra).slice(0, 900) }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, extra ? String(extra).slice(0, 400) : ''); };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=90000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  await d(() => { const D = window.__dakar; D.buyAsset('appart_jamm'); D.moveIn('appart_jamm'); D.setHour(10); D.teleport('pikine'); });
  await page.waitForTimeout(2500);
  const bought = await d(ids => ids.map(id => [id, !!window.__dakar.buyPiece(id)]), BUY);
  await d(() => window.__dakar.enterHome('appart_jamm'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // set the pieces out with the editor (each spot checked by the game's own rules)
  await d(() => window.__dakar.placer.open()); await page.waitForTimeout(800);
  const placed = [];
  for (const [id, nth, ops] of OPS) {
    const info = await d(() => window.__dakar.placer.info());
    const item = info.items.filter(f => f.spec === id)[nth]; if (!item) { placed.push([id, 'missing']); continue; }
    const r = await d(async ([uid, ops]) => {
      const P = window.__dakar.placer; P.select(uid);
      for (const [op, a, c] of ops) {
        if (op === 'rot') for (let k = 0; k < 4 && P.info().pending && P.info().pending.rot !== a; k++) P.rotate();
        else if (op === 'move') { for (let k = 0; k < Math.abs(a); k++) P.move(Math.sign(a), 0); for (let k = 0; k < Math.abs(c); k++) P.move(0, Math.sign(c)); }
        else if (op === 'to') P.moveTo(a, c);
        else if (op === 'stash') P.stash();
        else if (op === 'auto') P.select(uid);
      }
      const why = P.info().why, ok = P.put();
      return { ok, why, at: P.info().pending };
    }, [item.uid, ops]);
    placed.push([id, r.ok ? 'ok' : `refused: ${r.why}`, r.at]);
  }
  await d(() => window.__dakar.placer.close()); await page.waitForTimeout(1500);
  const rules = await d(() => window.__dakar.homeRules());
  check(`the line's ${BUY.length} pieces bought, delivered and set out in the F2 by the game's rules`, bought.every(([, ok]) => ok) && placed.every(([, s]) => s === 'ok'), JSON.stringify(placed));
  check('every piece valid where it stands, every room reachable', rules.pieces.every(p => p.why === null) && rules.reachable?.ok, JSON.stringify({ stored: rules.stored, bad: rules.pieces.filter(p => p.why), reach: rules.reachable }));
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  // the player stands at (x, z) facing yaw; the game camera follows behind
  const shots = { sejour: [0.9, 2.5, -Math.PI * 0.62], 'sejour-tv': [-1.75, 1.4, 0.15], chambre: [-2.6, -0.2, Math.PI * 1.03] };
  const perf = {}, sizes = [];
  const picture = async name => {
    let buf = await page.screenshot({ scale: 'css' });
    if (buf.length > 380_000) buf = await sharp(buf).png({ palette: true, quality: 92, effort: 8 }).toBuffer();
    fs.writeFileSync(`${out}/${name}.png`, buf); sizes.push([name, buf.length]);
  };
  for (const [hour, tag] of [[10, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour);
    for (const [room, [x, z, yaw]] of Object.entries(shots)) {
      await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [O.x + x, O.z + z, yaw]);
      await page.waitForTimeout(2200);
      await picture(`f2-${room}-${tag}`);
      perf[`${room}-${tag}`] = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris() }));
    }
  }
  check('each view of the furnished F2: ≤ 60 draw calls and ≤ 80k triangles (phone page)', Object.values(perf).every(p => p.calls <= 60 && p.tris <= 80_000), JSON.stringify(perf));
  check('pictures of the séjour (two views) and the chambre by day and at 21 h, each PNG under 400 kB', sizes.length === 6 && sizes.every(([, n]) => n < 400_000), sizes.map(([k, n]) => `${k} ${Math.round(n / 1000)} kB`).join(', '));
  check('no page errors', errors.length === 0, errors.join(' | '));
  fs.writeFileSync(`${out}/f2-collection.json`, JSON.stringify({ base, buy: BUY, ops: OPS, placed, rules: rules.pieces.map(p => ({ spec: p.spec, room: p.room, at: p.at, why: p.why })), stored: rules.stored, perf, pictures: sizes, results }, null, 1));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
