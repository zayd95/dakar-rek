// Signage audit: every painted sign must keep its letters' proportions, fit its board and be big enough to read from the phone's camera.
// Usage: node scripts/check-pikine-signs.mjs [baseUrl] [outJson] [hubs=pikine | all]
//   · builder boards (src/world/batch.ts signTexture): the canvas's proportions against the plane's, the text's measured width against the plane's, the letter height in metres
//   · the Street DNA atlas (src/game/pikineDna.ts): every board against the cell it was painted in, every line of text against its cell (shrunk, never stretched), the names
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4330/', out = process.argv[3] ?? 'signs.json';
const hubsArg = process.argv[4] ?? 'pikine';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'medium'); localStorage.setItem('dakarrek.guest.save.v6', ''); } catch { /* */ } });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}?debug&touch`);
await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 240000 });
const hubs = hubsArg === 'all' ? await page.evaluate(() => window.__dakar.hubs) : hubsArg.split(',');

let pass = 0, fail = 0; const report = { hubs: {}, dna: null };
const check = (ok, name, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' ' + detail : ''}`); };

for (const hub of hubs) {
  await page.evaluate(h => window.__dakar.teleport(h), hub);
  await page.waitForFunction(h => window.__dakar.pos().hub === h, hub, { timeout: 240000 });
  await page.waitForTimeout(2500);
  const planes = await page.evaluate(() => {
    const out = [], { scene } = window.__dakar.three;
    scene.traverse(o => {
      const m = o.material, map = m && !Array.isArray(m) ? m.map : null, info = map?.userData?.sign, g = o.geometry;
      if (!info || !g || g.type !== 'PlaneGeometry') return;
      const pw = g.parameters.width * o.scale.x, ph = g.parameters.height * o.scale.y;
      out.push({ text: info.text, pw, ph, cw: info.w, ch: info.h, size: info.size, width: info.width, x: o.position.x, y: o.position.y, z: o.position.z, yaw: o.rotation.y });
    });
    return out;
  });
  const bad = planes.map(p => ({ ...p, stretch: (p.cw / p.ch) / (p.pw / p.ph), em: p.size * (p.ph / p.ch), fill: (p.width * (p.pw / p.cw)) / p.pw }));
  report.hubs[hub] = bad;
  const stretched = bad.filter(p => Math.abs(p.stretch - 1) > 0.02), clipped = bad.filter(p => p.width > p.cw - 8 || p.fill > 0.97), small = bad.filter(p => p.em < 0.15), under = bad.filter(p => p.em >= 0.15 && p.em < 0.2);
  check(bad.length > 0 || hub === 'plateau', `${hub}: builder boards found`, `(${bad.length})`);
  check(stretched.length === 0, `${hub}: no builder board has stretched letters (canvas : plane within 2 %)`, stretched.slice(0, 4).map(p => `${p.text} ${p.stretch.toFixed(2)}`).join(', '));
  check(clipped.length === 0, `${hub}: no builder name runs past its board`, clipped.slice(0, 4).map(p => p.text).join(', '));
  check(small.length === 0, `${hub}: builder letters are at least 0.15 m (em) high`, small.slice(0, 4).map(p => `${p.text} ${p.em.toFixed(2)}`).join(', '));
  if (under.length) console.log(`  (0.15–0.2 m, small boards and taglines: ${under.map(p => `${p.text} ${p.em.toFixed(2)}`).join(', ')})`);
}

if (hubs.includes('pikine')) {
  await page.evaluate(() => window.__dakar.teleport('pikine'));
  await page.waitForFunction(() => window.__dakar.pos().hub === 'pikine', null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  const d = await page.evaluate(() => window.__dakar.pikineDnaSigns());
  report.dna = d;
  const cellOf = id => d.cells[id];
  const asp = d.uses.map(u => ({ ...u, k: (cellOf(u.id).cw / cellOf(u.id).ch) / (u.w / u.h) }));
  check(asp.length > 10, 'DNA: boards placed', `(${asp.length})`);
  check(asp.every(u => Math.abs(u.k - 1) <= 0.02), 'DNA: every board has the proportions of its cell (within 2 %)', asp.filter(u => Math.abs(u.k - 1) > 0.02).slice(0, 4).map(u => `${u.id} ${u.k.toFixed(2)}`).join(', '));
  const over = d.texts.filter(t => t.width > t.avail + 0.5 || t.x0 < 2 || t.x1 > t.cw - 2 || t.y0 < 1 || t.y1 > t.ch - 1);
  check(over.length === 0, 'DNA: no line of text overflows or touches the edge of its cell', over.slice(0, 4).map(t => `${t.id}:${t.text}`).join(', '));
  const boardOf = id => d.uses.find(u => u.id === id) ?? { w: id.startsWith('shop') ? 4.5 : 0, h: id.startsWith('shop') ? 1.0 : 0 };
  const lines = d.texts.filter(t => !['lutteur', 'lions', 'telecom', 'bissap', 'pikine', 'wax', 'defense', 'salon'].includes(t.id)).map(t => {
    const b = boardOf(t.id), em = b.h ? t.size * (b.h / t.ch) : null;
    return { id: t.id, text: t.text, em, name: t.size >= t.ch * 0.26 };
  }).filter(l => l.em !== null);
  const names = lines.filter(l => l.name), subs = lines.filter(l => !l.name);
  const minName = Math.min(...names.map(l => l.em)), minSub = Math.min(...subs.map(l => l.em));
  check(minName >= 0.2, 'DNA: every name is at least 0.20 m (em) high', `min ${minName.toFixed(2)} m`);
  check(minSub >= 0.1, 'DNA: every second line is at least 0.10 m (em) high', `min ${minSub.toFixed(2)} m`);
  const all = JSON.stringify(d.names) + JSON.stringify(d.texts.map(t => t.text));
  check(!/t[ée]l[ée]centre/i.test(all), 'DNA: no « Télécentre » left');
  const ms = d.names.find(n => n.name === 'MULTISERVICE JÀMM');
  check(!!ms && Array.isArray(ms.sub) && ms.sub.join(' ').includes('Wave') && ms.sub.join(' ').includes('Orange Money') && ms.sub.join(' ').includes('Photocopie'), 'DNA: « MULTISERVICE JÀMM » with Wave · Orange Money · Impression · Photocopie');
  const fasc = d.uses.filter(u => u.role === 'fascia');
  const distinct = new Set(fasc.map(u => u.id));
  check(fasc.length === 0 || distinct.size >= Math.min(6, fasc.length), 'DNA: the shop names vary', `${fasc.length} shopfronts, ${distinct.size} different names`);
  console.log(`atlas ${d.atlas.w} × ${d.atlas.h}; ${fasc.length} fascias; names used: ${[...distinct].map(i => d.names.find(n => n.id === i).name).join(' · ')}`);
}
check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`\n${pass} pass, ${fail} fail → ${out}`);
await browser.close();
process.exit(fail ? 1 : 0);
