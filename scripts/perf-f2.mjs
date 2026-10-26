// LD2.0-C (docs/ld2/LD2_C.md, « Performance inside the F2 »): the F2 before and after it became walkable, each with the same 10 pieces bought, on a
// phone page (390 × 844, low quality, 10 h). For each build: draw calls, triangles and the whole frame's time (90 frames) at a few spots inside.
// Usage: node scripts/perf-f2.mjs <newUrl> <oldUrl> [out.json]   (two static builds served side by side: the older one from before LD2.0-C)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [NEW, OLD, OUT = 'docs/proof/ld2c/perf-f2.json'] = process.argv.slice(2);
const PIECES = ['canape_wax', 'table_basse', 'tele_plate', 'lit_bois', 'armoire_bois', 'chaise_bois', 'plante', 'radio', 'tapis', 'lampadaire'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const res = {};
for (const [tag, base] of [['old', OLD], ['new', NEW]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=50000000&quality=low`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate, null, { timeout: 300000 });
  await d(() => { const D = window.__dakar; D.buyAsset('appart_jamm'); D.moveIn('appart_jamm'); D.setHour(10); D.teleport('pikine'); });
  await page.waitForTimeout(2500);
  const bought = await d(ids => { const D = window.__dakar, ok = []; for (const id of ids) { try { const r = D.buyPiece(id); ok.push([id, !!r]); } catch (e) { ok.push([id, String(e).slice(0, 60)]); } } return ok; }, PIECES);
  await d(() => window.__dakar.enterHome('appart_jamm'));
  await page.waitForFunction(() => window.__dakar.pos().mode === 'play' && (window.__dakar.homeView?.() || window.__dakar.pos().near !== undefined), null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const view = await d(() => window.__dakar.homeView?.() ?? null);
  const O = view ? { x: view.ox, z: view.oz } : await d(() => { const p = window.__dakar.pos(); return { x: p.x, z: p.z }; });
  const spots = tag === 'new'
    ? { sejour: [-1.0, 2.2, Math.PI * 0.85], chambre: [-2.4, -1.4, Math.PI], entree: [3.15, 2.5, Math.PI], cuisine: [3.0, -0.6, Math.PI / 2] }
    : { centre: [0, 0, Math.PI], front: [0, 2.0, Math.PI], back: [0, -2.0, 0] };
  const out = { pieces: view?.pieces?.length ?? null, bought, rooms: {} };
  for (const [room, [x, z, yaw]] of Object.entries(spots)) {
    await d(([x, z, yaw]) => window.__dakar.place(x, z, yaw), [O.x + x, O.z + z, yaw]);
    await page.waitForTimeout(1800);
    const m = await d(() => new Promise(done => {
      const D = window.__dakar, calls = D.drawCalls(), tris = D.tris(); let n = 0; const t0 = performance.now();
      const f = () => { if (++n < 90) requestAnimationFrame(f); else done({ calls, tris, ms: +((performance.now() - t0) / n).toFixed(1) }); };
      requestAnimationFrame(f);
    }));
    out.rooms[room] = m;
  }
  out.errors = errors;
  res[tag] = out;
  console.log(tag, JSON.stringify(out));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
