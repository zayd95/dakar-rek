// LD2.0-D round 2, lane R2-H (docs/ld2/LD2_D.md, « the helicopter need more realism right now it look like a toy »): pictures of the villa's helicopter on a
// phone page (390 × 844), the same views on the build before the rebuild and on this one, by day (10 h 30) and at 21 h:
//  - from the street: a player's camera on the pavement looking up at the roof, and a neighbour's view over the façade (free cameras);
//  - on the roof terrace, close up, from the game's own camera behind the player (inside the villa, its three levels);
//  - a turntable of the model alone: eight angles round it (everything but the sky, the lights and the helicopter hidden), as one contact sheet.
// Pictures in <outDir>/<tag>/ (PNG under 400 kB), the numbers in <outDir>/<tag>/shots.json. compare-heli.mjs puts the two sets side by side.
// Usage: node scripts/shots-heli.mjs <baseUrl> <outDir> <tag>
//   (a static build: npx vite build --outDir /tmp/claude-0/r2h/dist --emptyOutDir; node /tmp/claude-0/beta/tools/serve.mjs /tmp/claude-0/r2h/dist 4986)
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const [base = 'http://127.0.0.1:4986/', outRoot = 'docs/proof/ld2d/r2-heli', tag = 'after'] = process.argv.slice(2);
const out = `${outRoot}/${tag}`;
fs.mkdirSync(out, { recursive: true });
const STOREY = 3.4, LOT = { cx: -18, cz: -18 };
const W = (x, y, z) => [LOT.cx + x, y, LOT.cz + z];
// free cameras in the street of Almadies (plan coordinates of the lot: +z toward the street; the roof terrace's deck at y 6.8)
const STREET = {
  street: { p: W(9, 4.6, 16.5), t: W(-3.5, 7.4, -1) },          // the pavement across the road, a player's camera looking up at the roof
  high: { p: W(14, 13, 20), t: W(-1.5, 4.5, -2) },              // a neighbour's view over the façade
  roof: { p: W(6.5, 12.5, 9.5), t: W(-3.6, 7.6, -1.2) },        // closer, from above the street side
};
// on the roof terrace, the game's camera behind the player: [plan x, z, the player's facing]
const ROOF = { 'terrace-ne': [2.4, -3.7, -1.85], 'terrace-se': [0.4, 2.3, -2.05], 'terrace-sw': [-6.6, 3.0, 2.6] };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const sizes = [], info = { base, tag };
const save = async (name, buf) => {
  let png = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
  if (png.length > 390_000) png = await sharp(buf).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(`${out}/${name}.png`, png); sizes.push([name, png.length]);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'high'); } catch { /* */ } });
  const page = await ctx.newPage(); page.setDefaultTimeout(300000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const d = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${base}?debug&touch&argent=999000000`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.estate && window.__dakar.home, null, { timeout: 300000 });
  await d(() => { const D = window.__dakar; D.buyAsset('villa_almadies'); D.moveIn('villa_almadies'); D.setHour(10.5); D.teleport('almadies', -12, -4, Math.PI); });
  await page.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play' && !window.__dakar.home(), null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  // ------------------------------------------------------------------ the street
  for (const [hour, when] of [[10.5, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour); await page.waitForTimeout(1500);
    for (const [name, c] of Object.entries(STREET)) {
      await d(c => window.__dakar.cam(c.p, c.t), c); await page.waitForTimeout(1600);
      await save(`street-${name}-${when}`, await page.screenshot());
    }
  }
  await d(() => window.__dakar.cam(null));
  // the helicopter's own cost, measured on the one the street compound draws
  info.model = await d(() => {
    const g = window.__dakar.three.scene.getObjectByName('villa-compound')?.getObjectByName('helicopter'); if (!g) return null;
    let draws = 0, tris = 0; const mats = new Set();
    g.traverse(o => { if (o.isMesh) { draws++; mats.add(o.material.type); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    return { draws, tris, materials: [...mats], position: g.position.toArray().map(v => +v.toFixed(2)), yaw: +g.rotation.y.toFixed(3) };
  });
  // ------------------------------------------------------------------ the turntable: the model alone, eight angles (a landscape page, the HUD hidden)
  const tt = await browser.newContext({ viewport: { width: 560, height: 360 }, deviceScaleFactor: 1 });
  await tt.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'high'); } catch { /* */ } });
  const tp = await tt.newPage(); tp.setDefaultTimeout(300000);
  tp.on('pageerror', e => errors.push(e.message));
  await tp.goto(`${base}?debug&argent=999000000`, { waitUntil: 'load' });
  await tp.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub, null, { timeout: 300000 });
  await tp.evaluate(() => { window.__dakar.setHour(10.5); window.__dakar.teleport('almadies', -12, -4, Math.PI); });
  await tp.waitForFunction(() => window.__dakar.pos().hub === 'almadies' && window.__dakar.pos().mode === 'play', null, { timeout: 120000 });
  await tp.waitForTimeout(2500);
  const H = [-12, 70, -4];
  info.turntable = await tp.evaluate(H => {
    const D = window.__dakar, r = D.villa.heliAt(H[0], H[1], H[2], 0);
    document.getElementById('ui').style.display = 'none';
    // everything hidden but the sky, the lights and the helicopter
    const keep = new Set(); const heli = D.three.scene.getObjectByName('villa-debug-heli');
    for (let o = heli; o; o = o.parent) keep.add(o);
    heli.traverse(o => keep.add(o));
    D.three.scene.traverse(o => { if (!keep.has(o) && o !== D.three.sky && !o.isLight && o.parent === D.three.scene) o.visible = false; });
    for (let o = heli.parent; o && o !== D.three.scene; o = o.parent) { o.visible = true; for (const c of o.children) if (!keep.has(c)) c.visible = false; }
    return r;
  }, H);
  const frames = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, R = 13.5, el = 0.2;
    const cam = { p: [H[0] + Math.sin(a) * R * Math.cos(el), H[1] + 1.3 + R * Math.sin(el), H[2] + Math.cos(a) * R * Math.cos(el)], t: [H[0], H[1] + 1.25, H[2]] };
    await tp.evaluate(c => window.__dakar.cam(c.p, c.t), cam); await tp.waitForTimeout(1300);
    frames.push(await tp.screenshot());
  }
  const sheet = await sharp({ create: { width: 560 * 4, height: 360 * 2, channels: 3, background: '#ffffff' } })
    .composite(frames.map((f, k) => ({ input: f, left: (k % 4) * 560, top: Math.floor(k / 4) * 360 }))).png().toBuffer();
  await save('turntable', await sharp(sheet).resize(1680).png().toBuffer());
  await tt.close();
  // ------------------------------------------------------------------ the roof terrace, inside the villa, from the game's camera
  await d(() => window.__dakar.enterHome('villa_almadies'));
  await page.waitForFunction(() => window.__dakar.home() && window.__dakar.pos().mode === 'play', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const view = await d(() => window.__dakar.homeView()), O = { x: view.ox, z: view.oz };
  for (const [hour, when] of [[10.5, 'day'], [21, 'night']]) {
    await d(h => window.__dakar.setHour(h), hour);
    for (const [name, [x, z, yaw]] of Object.entries(ROOF)) {
      await d(([x, z, yaw, y]) => { window.__dakar.place(x, z, yaw, y); window.__dakar.lookYaw(yaw); }, [O.x + x, O.z + z, yaw, 2 * STOREY]);
      await page.waitForTimeout(2200);
      await save(`roof-${name}-${when}`, await page.screenshot());
    }
  }
  info.roofCalls = await d(() => ({ calls: window.__dakar.drawCalls(), tris: window.__dakar.tris(), home: window.__dakar.home()?.level }));
  info.errors = errors; info.pictures = sizes;
  fs.writeFileSync(`${out}/shots.json`, JSON.stringify(info, null, 1));
  console.log(JSON.stringify(info, null, 1));
} finally { await browser.close(); }
